// api/chat.js

// Helper function to extract Base64 data from Data URL
function getBase64Data(dataUrl) {
    if (typeof dataUrl !== 'string' || !dataUrl.includes(',')) {
        console.error("Invalid Data URL format received:", dataUrl);
        return null; // Or throw an error
    }
    return dataUrl.split(',')[1];
}

// --- Configuration ---
// Define the models to try, in order of preference
const MODELS_TO_TRY = [
	'gemini-2.5-pro-exp-03-25',
	'gemini-2.0-flash'
];
const MAX_FILE_SIZE_MB = 15; // Max size for inline upload (images *and* PDFs) - Gemini has ~20MB request limit
const MAX_TOKENS = 1000000; // Define a maximum token limit for the context window (set to 1 million)
// --- End Configuration ---


// Handler function for Vercel Serverless Function
export default async function handler(req, res) {
    // --- Security/CORS Headers ---
    res.setHeader('Access-Control-Allow-Origin', '*'); // Adjust in production
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') { return res.status(200).end(); }
    if (req.method !== 'POST') {
        res.setHeader('Allow', ['POST']);
        return res.status(405).json({ error: `Method ${req.method} Not Allowed` });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
        console.error("GEMINI_API_KEY missing.");
        return res.status(500).json({ error: 'Server configuration error.' });
    }

    // --- Get history from request body ---
    const { history } = req.body; // History now contains objects with parts arrays

    if (!history || !Array.isArray(history)) {
        return res.status(400).json({ error: 'Invalid request body: Missing/invalid "history".' });
    }

    // --- MODIFIED: Process history to format for Gemini API ---
    // (Keep your existing history processing logic exactly as it was)
    const processedContents = history.map(message => {
        if (!message.role || !Array.isArray(message.parts)) {
            console.warn("Skipping invalid message structure in history:", message);
            return null; // Or handle error more strictly
        }
        const processedParts = message.parts.map(part => {
            if (part.text) {
                return { text: part.text };
            } else if (part.inlineData && part.inlineData.mimeType && part.inlineData.data) {
                const base64Data = getBase64Data(part.inlineData.data);
                if (!base64Data) {
                     console.error("Failed to extract base64 data for part:", part);
                     return null; // Skip this invalid part
                }
                 // Gemini API expects just the base64 string for inlineData
                return {
                    inlineData: {
                        mimeType: part.inlineData.mimeType,
                        data: base64Data // Use ONLY the base64 data part
                    }
                };
            } else {
                 console.warn("Skipping invalid part structure:", part);
                 return null; // Skip invalid parts
            }
        }).filter(part => part !== null); // Remove any null parts resulting from errors

        if (processedParts.length > 0) {
            return { role: message.role, parts: processedParts };
        } else {
            return null; // Skip messages that ended up with no valid parts
        }
    }).filter(content => content !== null); // Remove any null messages

    if (processedContents.length === 0 && history.length > 0) {
         return res.status(400).json({ error: 'Failed to process message history parts.' });
    }
    // --- END MODIFIED ---


    // --- Generate System Prompt with Current Date --- START DATE ADDITION ---
    const baseSystemPrompt = "You are Kramer Intelligence, an advanced AI assistant developed by Daniel Vincent Kramer.";

    // Get current date on the server (likely UTC on Vercel)
    const today = new Date();
    const dateOptions = {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        // timeZone: 'UTC' // Optional: Uncomment if you want to force UTC explicitly
    };
    // Format the date (e.g., "Friday, April 26, 2024")
    const formattedDate = today.toLocaleDateString('en-US', dateOptions); // Using 'en-US' locale for consistency

    // Combine base prompt with the date information
    const systemPrompt = `${baseSystemPrompt} Today's date is ${formattedDate}.`;
    // --- END DATE ADDITION ---


    // --- Initialize variables for the fallback loop ---
    let googleData = null;
    let googleResponse = null; // Store the last response object
    let lastErrorData = null; // Store the error details from the last failed attempt
    let successfulModel = null; // Keep track of which model succeeded

    // --- NEW: Count tokens and truncate history BEFORE generateContent ---
    try {
        if (processedContents.length > 0) { // Only count if there's history
            const firstModel = MODELS_TO_TRY[0]; // Use the preferred model for counting
            const countTokensUrl = `https://generativelanguage.googleapis.com/v1beta/models/${firstModel}:countTokens?key=${apiKey}`;
            let currentTokenCount = 0;

            // Function to get token count for current history
            const getTokenCount = async (contentsToCount) => {
                if (!contentsToCount || contentsToCount.length === 0) return 0;
                const countResponse = await fetch(countTokensUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ contents: contentsToCount }),
                });
                if (!countResponse.ok) {
                    const errorData = await countResponse.json().catch(() => ({}));
                    console.warn(`Token count API failed (${countResponse.status}):`, errorData.error?.message || 'Unknown counting error');
                    return -1; // Indicate error
                }
                const countData = await countResponse.json();
                return countData.totalTokens;
            };

            // Initial count
            currentTokenCount = await getTokenCount(processedContents);
            console.log(`Initial token count: ${currentTokenCount} (Limit: ${MAX_TOKENS})`);

            if (currentTokenCount === -1) {
                console.warn("Proceeding without history truncation due to token count error.");
            } else {
                // Truncation loop
                let iterations = 0;
                const maxIterations = Math.ceil(processedContents.length / 2) + 1; // Safety break

                while (currentTokenCount > MAX_TOKENS && processedContents.length >= 2 && iterations < maxIterations) {
                    console.log(`Token count ${currentTokenCount} exceeds limit ${MAX_TOKENS}. Truncating...`);
                    processedContents.shift(); // Remove oldest user message
                    processedContents.shift(); // Remove oldest model message
                    // Optimization: Check length before potentially expensive API call
                    if (processedContents.length < 2) break;
                    currentTokenCount = await getTokenCount(processedContents); // Recalculate
                    console.log(`New token count after truncation: ${currentTokenCount}`);
                    if (currentTokenCount === -1) {
                         console.warn("Token count failed during truncation. Stopping truncation.");
                         break; // Exit loop on error
                    }
                    iterations++;
                }
                if (iterations >= maxIterations && currentTokenCount > MAX_TOKENS) {
                     console.warn("Truncation loop hit max iterations, history might still exceed token limit.");
                } else if (currentTokenCount > MAX_TOKENS && processedContents.length < 2) {
                     console.warn(`History still exceeds token limit (${currentTokenCount}), but cannot truncate further.`);
                }
            }
        }

    } catch (truncationError) {
        console.error("Error during history truncation:", truncationError);
        // Logged and continue, the generateContent call might still fail if too long
    }
    // --- END Token Counting and Truncation ---

    // --- Loop through models and attempt API call ---
    for (const modelName of MODELS_TO_TRY) {
        console.log(`Attempting API call with model: ${modelName}`);
        const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`;

        const requestBody = {
            contents: processedContents, // Use potentially truncated history
            systemInstruction: { parts: [ { text: systemPrompt } ] }, // Use the prompt with the date
            tools: [ { googleSearch: {} } ],
            // generationConfig, safetySettings... could potentially be added here
        };

        try {
            googleResponse = await fetch(apiUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(requestBody),
            });

            if (googleResponse.ok) {
                googleData = await googleResponse.json();
                successfulModel = modelName;
                console.log(`Success with model: ${successfulModel}`);
                break; // Exit the loop on first successful call
            } else {
                // API returned an error status (e.g., 4xx, 5xx)
                console.warn(`Model ${modelName} failed with status: ${googleResponse.status}`);
                try {
                    lastErrorData = await googleResponse.json(); // Try to parse error details
                    console.warn(`Error details for ${modelName}:`, JSON.stringify(lastErrorData));
                } catch (parseError) {
                    // If parsing the error fails, store the raw text
                    const errorText = await googleResponse.text();
                    console.warn(`Could not parse error JSON for ${modelName}. Raw response:`, errorText);
                    lastErrorData = { error: { message: `API Error: ${googleResponse.status} ${googleResponse.statusText}. Response body was not valid JSON.` } };
                }
                // Continue to the next model in the list
            }
        } catch (error) {
            // Network error or other fetch-related issue
            console.error(`Fetch error for model ${modelName}:`, error);
            lastErrorData = { error: { message: `Network or fetch error for ${modelName}: ${error.message}` } };
            // Ensure googleResponse is null or appropriately handled if fetch itself failed
            googleResponse = { status: 500, statusText: 'Network Error' }; // Mock response for status code handling later
            // Continue to the next model
        }
    } // --- End of model loop ---


    // --- Process the result (or final error) ---
    try {
        // If googleData is null after the loop, all models failed
        if (!googleData || !successfulModel) {
            console.error('All models failed. Reporting last encountered error.');
            const finalStatus = googleResponse?.status || 500; // Use last status or 500
            let errorMsg = lastErrorData?.error?.message || `API Error: ${finalStatus} ${googleResponse?.statusText || 'Unknown Error'}`;

            // Append specific known error details if helpful
            if (lastErrorData?.error?.status === 'FAILED_PRECONDITION') errorMsg += ' (Check API key/billing?)';
            if (lastErrorData?.error?.message?.includes('400 Bad Request') && lastErrorData?.error?.message?.includes('payload is too large')) errorMsg = `Request too large (image/PDF size or history length). Max file size ~${MAX_FILE_SIZE_MB}MB.`;
             else if (lastErrorData?.error?.message?.includes('429')) errorMsg += ' (Rate limit exceeded?)'; // Example for rate limit
            else if (lastErrorData?.error?.code === 400 && lastErrorData?.error?.message?.includes('must be less than or equal to')) errorMsg = `Request failed: History likely exceeds model's token limit even after truncation. ${lastErrorData?.error?.message}`; // Specific token limit error


            return res.status(finalStatus).json({ error: errorMsg });
        }

        // --- SUCCESS: Proceed with processing the successful response from googleData ---
        let aiText = null;
        let searchSuggestionHtml = null;
        const candidate = googleData?.candidates?.[0];

        if (candidate) {
            aiText = candidate.content?.parts?.[0]?.text; // Assuming text response is primary
            const groundingMetadata = candidate.groundingMetadata;
            if (groundingMetadata?.searchEntryPoint?.renderedContent) {
                searchSuggestionHtml = groundingMetadata.searchEntryPoint.renderedContent;
            }
        }

        // Check for blocks *after* confirming a candidate exists
        if (googleData.promptFeedback?.blockReason) {
            console.warn('Blocked:', googleData.promptFeedback.blockReason);
            // Return a user-friendly block message
            return res.status(400).json({ error: `Content blocked by safety settings: ${googleData.promptFeedback.blockReason}` });
        }

        // Validate the AI response format
        if (typeof aiText !== 'string') {
            // This case might happen if the model responds but not with text in the expected place
            // Or if the only part is a tool call response, etc.
            if (candidate?.content?.parts?.length > 0) {
                 // If there are parts, but the first isn't text, maybe it's a function call result?
                 // For now, let's just return an empty string or a placeholder
                 console.warn('AI response received, but first part was not text:', candidate.content.parts);
                 aiText = "[Model response did not contain text in the primary position]"; // Placeholder
            } else {
                 console.error('AI response received, but no valid text content found:', googleData);
                 return res.status(500).json({ error: 'AI response format error (No text found).' });
            }
        }


        // --- Send successful response back to client ---
        res.status(200).json({
            text: aiText,
            searchSuggestionHtml: searchSuggestionHtml,
            modelUsed: successfulModel // Optionally include which model succeeded
        });

    } catch (error) {
        // Catch any unexpected errors during response processing *after* the fetch loop
        console.error('Serverless function error after API call:', error);
        res.status(500).json({ error: 'Internal server error during response processing.' });
    }
}
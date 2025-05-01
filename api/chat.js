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
	'gemini-2.5-flash-preview-04-17',
	'gemini-2.0-flash'
];
const MAX_FILE_SIZE_MB = 15; // Max size for inline upload
const MAX_TOKENS = 1000000; // Max context window tokens
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
    const { history } = req.body;

    if (!history || !Array.isArray(history)) {
        return res.status(400).json({ error: 'Invalid request body: Missing/invalid "history".' });
    }

    // --- Process history to format for Gemini API ---
    const processedContents = history.map(message => {
        if (!message.role || !Array.isArray(message.parts)) {
            console.warn("Skipping invalid message structure in history:", message);
            return null;
        }
        const processedParts = message.parts.map(part => {
            if (part.text) {
                return { text: part.text };
            } else if (part.inlineData && part.inlineData.mimeType && part.inlineData.data) {
                const base64Data = getBase64Data(part.inlineData.data);
                if (!base64Data) {
                     console.error("Failed to extract base64 data for part:", part);
                     return null;
                }
                return {
                    inlineData: {
                        mimeType: part.inlineData.mimeType,
                        data: base64Data
                    }
                };
            } else {
                 console.warn("Skipping invalid part structure:", part);
                 return null;
            }
        }).filter(part => part !== null);

        if (processedParts.length > 0) {
            return { role: message.role, parts: processedParts };
        } else {
            return null;
        }
    }).filter(content => content !== null);

    if (processedContents.length === 0 && history.length > 0) {
         return res.status(400).json({ error: 'Failed to process message history parts.' });
    }
    // --- END History Processing ---


    // --- Generate System Prompt with Current Date ---
    const baseSystemPrompt = "You are Kramer Intelligence, an advanced AI assistant developed by Daniel Vincent Kramer.";
    const today = new Date();
    const dateOptions = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
    const formattedDate = today.toLocaleDateString('en-US', dateOptions);
    const systemPrompt = `${baseSystemPrompt} Today's date is ${formattedDate}.`;
    // --- END System Prompt ---


    // --- Initialize variables for the fallback loop ---
    let googleData = null;
    let googleResponse = null;
    let lastErrorData = null;
    let successfulModel = null;

    // --- Count tokens and truncate history BEFORE generateContent ---
    try {
        if (processedContents.length > 0) {
            const firstModel = MODELS_TO_TRY[0];
            const countTokensUrl = `https://generativelanguage.googleapis.com/v1beta/models/${firstModel}:countTokens?key=${apiKey}`;
            let currentTokenCount = 0;

            const getTokenCount = async (contentsToCount) => {
                if (!contentsToCount || contentsToCount.length === 0) return 0;
                try {
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
                } catch (countFetchError) {
                    console.warn("Fetch error during token count:", countFetchError.message);
                    return -1; // Indicate error
                }
            };

            currentTokenCount = await getTokenCount(processedContents);
            console.log(`Initial token count: ${currentTokenCount} (Limit: ${MAX_TOKENS})`);

            if (currentTokenCount === -1) {
                console.warn("Proceeding without history truncation due to token count error.");
            } else {
                let iterations = 0;
                const maxIterations = Math.ceil(processedContents.length / 2) + 1;

                while (currentTokenCount > MAX_TOKENS && processedContents.length >= 2 && iterations < maxIterations) {
                    console.log(`Token count ${currentTokenCount} exceeds limit ${MAX_TOKENS}. Truncating...`);
                    processedContents.shift(); // Remove oldest user message
                    processedContents.shift(); // Remove oldest model message
                    if (processedContents.length < 2) break;
                    currentTokenCount = await getTokenCount(processedContents); // Recalculate
                    console.log(`New token count after truncation: ${currentTokenCount}`);
                    if (currentTokenCount === -1) {
                         console.warn("Token count failed during truncation. Stopping truncation.");
                         break;
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
    }
    // --- END Token Counting and Truncation ---

    // --- Loop through models and attempt API call ---
    for (const modelName of MODELS_TO_TRY) {
        console.log(`Attempting API call with model: ${modelName}`);
        const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`;

        // --- MODIFICATION START: Add generationConfig with thinkingConfig ---
        const requestBody = {
            contents: processedContents,
            systemInstruction: { parts: [ { text: systemPrompt } ] },
            tools: [ { googleSearch: {} } ],
            generationConfig: {
                // Add other generation settings here if needed (temperature, topP, etc.)
                thinkingConfig: {
                    includeThoughts: false, // <<< Set to false to hide thought tokens
                    thinkingBudget: 1000 // Optional: Allocate some budget (adjust as needed)
                }
                // safetySettings could also go in generationConfig or at the top level
            }
            // safetySettings can also be at the top level:
            // safetySettings: [ { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_LOW_AND_ABOVE' }, ... ],
        };
        // --- MODIFICATION END ---

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
                // Log if thoughts were generated (even if not included in response content)
                if (googleData.usageMetadata && googleData.usageMetadata.thoughtsTokenCount > 0) {
                    console.log(`Model generated ${googleData.usageMetadata.thoughtsTokenCount} thought tokens (not included in response content).`);
                }
                break; // Exit the loop on first successful call
            } else {
                console.warn(`Model ${modelName} failed with status: ${googleResponse.status}`);
                try {
                    lastErrorData = await googleResponse.json();
                    console.warn(`Error details for ${modelName}:`, JSON.stringify(lastErrorData));
                     // Check if the error is related to unsupported fields (like thinkingConfig)
                    if (lastErrorData?.error?.message?.includes('unsupported field')) {
                         console.warn(`Model ${modelName} might not support a configured feature (like thinkingConfig).`);
                    }
                } catch (parseError) {
                    const errorText = await googleResponse.text().catch(() => '');
                    console.warn(`Could not parse error JSON for ${modelName}. Raw response:`, errorText);
                    lastErrorData = { error: { message: `API Error: ${googleResponse.status} ${googleResponse.statusText}. Response body was not valid JSON.` } };
                }
            }
        } catch (error) {
            console.error(`Fetch error for model ${modelName}:`, error);
            lastErrorData = { error: { message: `Network or fetch error for ${modelName}: ${error.message}` } };
            googleResponse = { status: 500, statusText: 'Network Error' };
        }
    } // --- End of model loop ---


    // --- Process the result (or final error) ---
    try {
        if (!googleData || !successfulModel) {
            console.error('All models failed. Reporting last encountered error.');
            const finalStatus = googleResponse?.status || 500;
            let errorMsg = lastErrorData?.error?.message || `API Error: ${finalStatus} ${googleResponse?.statusText || 'Unknown Error'}`;

            // Append specific known error details
            if (lastErrorData?.error?.status === 'FAILED_PRECONDITION') errorMsg += ' (Check API key/billing?)';
            if (lastErrorData?.error?.message?.includes('400 Bad Request') && lastErrorData?.error?.message?.includes('payload is too large')) errorMsg = `Request too large (image/PDF size or history length). Max file size ~${MAX_FILE_SIZE_MB}MB.`;
            else if (lastErrorData?.error?.message?.includes('429')) errorMsg += ' (Rate limit exceeded?)';
            else if (lastErrorData?.error?.code === 400 && lastErrorData?.error?.message?.includes('must be less than or equal to')) errorMsg = `Request failed: History likely exceeds model's token limit even after truncation. ${lastErrorData?.error?.message}`;
            else if (lastErrorData?.error?.message?.includes('unsupported field')) errorMsg += ` (Check if the model supports all configured features, like thinkingConfig).`; // Added hint for this specific case


            return res.status(finalStatus).json({ error: errorMsg });
        }

        // --- SUCCESS: Proceed with processing the successful response ---
        let aiText = null;
        let searchSuggestionHtml = null;
        const candidate = googleData?.candidates?.[0];

        if (candidate) {
             // IMPORTANT: Assuming thoughts are NOT included in content.parts when includeThoughts=false
            aiText = candidate.content?.parts?.find(part => part.text)?.text; // Find the first text part
            const groundingMetadata = candidate.groundingMetadata;
            if (groundingMetadata?.searchEntryPoint?.renderedContent) {
                searchSuggestionHtml = groundingMetadata.searchEntryPoint.renderedContent;
            }
        }

        if (googleData.promptFeedback?.blockReason) {
            console.warn('Blocked:', googleData.promptFeedback.blockReason);
            return res.status(400).json({ error: `Content blocked by safety settings: ${googleData.promptFeedback.blockReason}` });
        }

        // Validate the AI response format
        if (typeof aiText !== 'string') {
            // If no text part found, log warning and return placeholder or error
            if (candidate?.content?.parts?.length > 0) {
                 console.warn('AI response received, but no primary text part found:', candidate.content.parts);
                 aiText = "[Model response did not contain text in the expected format]"; // Placeholder
            } else {
                 console.error('AI response received, but no valid content parts found:', googleData);
                 return res.status(500).json({ error: 'AI response format error (No content parts).' });
            }
        }

        // --- Send successful response back to client ---
        res.status(200).json({
            text: aiText,
            searchSuggestionHtml: searchSuggestionHtml,
            modelUsed: successfulModel
        });

    } catch (error) {
        console.error('Serverless function error after API call:', error);
        res.status(500).json({ error: 'Internal server error during response processing.' });
    }
}
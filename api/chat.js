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
	'gemini-2.0-flash',
	'gemini-2.5-pro-preview-03-25'
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
    const baseSystemPrompt = "You are Kramer Intelligence (KI), an advanced AI assistant developed by Daniel Vincent Kramer.";
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

    // --- Token Counting and Truncation ---
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
                        return -1;
                    }
                    const countData = await countResponse.json();
                    return countData.totalTokens;
                } catch (countFetchError) {
                     console.warn("Fetch error during token count:", countFetchError.message);
                     return -1;
                }
            };
            currentTokenCount = await getTokenCount(processedContents);
            console.log(`Initial token count: ${currentTokenCount} (Limit: ${MAX_TOKENS})`); // Keep basic log
            if (currentTokenCount === -1) {
                console.warn("Proceeding without history truncation due to token count error.");
            } else {
                let iterations = 0;
                const maxIterations = Math.ceil(processedContents.length / 2) + 1;
                while (currentTokenCount > MAX_TOKENS && processedContents.length >= 2 && iterations < maxIterations) {
                    console.log(`Token count ${currentTokenCount} exceeds limit ${MAX_TOKENS}. Truncating...`);
                    processedContents.shift(); processedContents.shift();
                    if (processedContents.length < 2) break;
                    currentTokenCount = await getTokenCount(processedContents);
                    console.log(`New token count after truncation: ${currentTokenCount}`);
                    if (currentTokenCount === -1) { console.warn("Token count failed during truncation. Stopping truncation."); break; }
                    iterations++;
                }
                if (iterations >= maxIterations && currentTokenCount > MAX_TOKENS) { console.warn("Truncation loop hit max iterations, history might still exceed token limit."); }
                 else if (currentTokenCount > MAX_TOKENS && processedContents.length < 2) { console.warn(`History still exceeds token limit (${currentTokenCount}), but cannot truncate further.`); }
            }
        }
    } catch (truncationError) {
        console.error("Error during history truncation:", truncationError);
    }
    // --- END Token Counting and Truncation ---


    // --- Loop through models and attempt API call ---
    for (const modelName of MODELS_TO_TRY) {
        console.log(`Attempting API call with model: ${modelName}`); // Keep basic attempt log
        const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`;

        // --- REMOVED generationConfig/thinkingConfig ---
        const requestBody = {
            contents: processedContents,
            systemInstruction: { parts: [ { text: systemPrompt } ] },
            tools: [ { googleSearch: {} } ]
            // Add safetySettings etc. here directly if needed
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
                console.log(`Success with model: ${successfulModel}`); // Keep basic success log
                break; // Exit the loop on first successful call
            } else {
                // API returned an error status (e.g., 4xx, 5xx)
                console.warn(`Model ${modelName} failed with status: ${googleResponse.status}`); // Keep basic failure log
                try {
                    lastErrorData = await googleResponse.json();
                    // Log DETAILED error only on failure
                    console.warn(`Error details for ${modelName}:`, JSON.stringify(lastErrorData));
                } catch (parseError) {
                    const errorText = await googleResponse.text().catch(() => '');
                    console.warn(`Could not parse error JSON for ${modelName}. Raw response:`, errorText);
                    lastErrorData = { error: { message: `API Error: ${googleResponse.status} ${googleResponse.statusText}. Response body was not valid JSON.` } };
                }
            }
        } catch (error) {
            console.error(`Fetch error for model ${modelName}:`, error); // Keep fetch error log
            lastErrorData = { error: { message: `Network or fetch error for ${modelName}: ${error.message}` } };
            googleResponse = { status: 500, statusText: 'Network Error' };
        }
    } // --- End of model loop ---


    // --- Process the result (or final error) ---
    try {
        if (!googleData || !successfulModel) {
            console.error('All models failed. Reporting last encountered error.'); // Keep final failure log
            const finalStatus = googleResponse?.status || 500;
            let errorMsg = lastErrorData?.error?.message || `API Error: ${finalStatus} ${googleResponse?.statusText || 'Unknown Error'}`;
            // Append specific known error details (Keep these hints)
            if (lastErrorData?.error?.status === 'FAILED_PRECONDITION') errorMsg += ' (Check API key/billing?)';
            if (lastErrorData?.error?.message?.includes('payload is too large')) errorMsg = `Request too large (~${MAX_FILE_SIZE_MB}MB limit).`;
             else if (lastErrorData?.error?.message?.includes('429')) errorMsg += ' (Rate limit exceeded?)';
            else if (lastErrorData?.error?.code === 400 && lastErrorData?.error?.message?.includes('must be less than or equal to')) errorMsg = `Request failed: History likely exceeds token limit. ${lastErrorData?.error?.message}`;

            return res.status(finalStatus).json({ error: errorMsg });
        }

        // --- SUCCESS: Proceed with processing the successful response ---
        console.log(`Processing successful response from model: ${successfulModel}`); // Keep basic processing log

        let aiText = null;
        let searchSuggestionHtml = null;
        const candidate = googleData?.candidates?.[0];
        const promptFeedback = googleData?.promptFeedback; // Keep reference for safety check

        if (candidate) {
            // <<< CORRECTED LOGIC (Reinstated): Find the first text part that is NOT a thought >>>
            const finalAnswerPart = candidate.content?.parts?.find(part => part.text && !part.thought);
            aiText = finalAnswerPart?.text; // Get text from the non-thought part

            // Log extracted text only if debugging is needed later
            // console.log("Extracted AI Text:", aiText);

            const groundingMetadata = candidate.groundingMetadata;
            if (groundingMetadata?.searchEntryPoint?.renderedContent) {
                searchSuggestionHtml = groundingMetadata.searchEntryPoint.renderedContent;
            }
        }

        // Check for blocks *after* confirming a candidate exists
        if (promptFeedback?.blockReason) {
            console.warn('Prompt Blocked:', promptFeedback.blockReason); // Keep safety warning
            return res.status(400).json({ error: `Request blocked by safety settings: ${promptFeedback.blockReason}` });
        }
        if (candidate?.finishReason === 'SAFETY') {
            console.warn('Candidate Blocked for Safety:', candidate.safetyRatings); // Keep safety warning
            return res.status(400).json({ error: `Response blocked by safety settings: ${candidate.finishReason}.` });
        }


        // Validate the AI response format
        if (typeof aiText !== 'string') {
             // Log only if text extraction genuinely fails
             console.error('Failed to extract valid AI text from the candidate.');
             if (candidate?.content?.parts?.length > 0) {
                 console.warn('Candidate parts existed but none contained text:', candidate.content.parts);
                 aiText = "[Model response received, but no text content found]";
             } else if (candidate?.finishReason && candidate.finishReason !== 'STOP') {
                 console.warn(`Candidate finished due to ${candidate.finishReason}, no text content generated.`);
                 return res.status(500).json({ error: `AI response generation stopped unexpectedly: ${candidate.finishReason}.` });
             } else {
                 console.error('AI response structure error: No candidate parts found.', googleData);
                 return res.status(500).json({ error: 'AI response format error (No valid parts found).' });
             }
        }

        // --- Send successful response back to client ---
        res.status(200).json({
            text: aiText,
            searchSuggestionHtml: searchSuggestionHtml,
            modelUsed: successfulModel
        });

    } catch (error) {
        console.error('Serverless function error after API call:', error); // Keep general error log
        res.status(500).json({ error: 'Internal server error during response processing.' });
    }
}
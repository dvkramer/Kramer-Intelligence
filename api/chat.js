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
	'gemini-2.0-flash', // Primary model
	'gemini-2.5-flash-preview-04-17'
];
// Define a reasonable token limit (check model documentation for specifics)
// Gemini 1.5 Flash has a large context window, but let's set a practical limit
// Adjust this based on testing and model specifics (e.g., 1M tokens for 1.5 Flash default)
// Let's use a safer, lower limit for demonstration, maybe 30k? Check Gemini docs for your chosen model.
// Example: Flash often defaults to 128k or 1M depending on version/tuning.
// Using a smaller value like 60000 for safety in this example.
const MAX_CONTEXT_TOKENS = 60000;
const MAX_IMAGE_SIZE_MB = 25; // Keep your original HTTP payload size estimate limit
// --- End Configuration ---


// --- NEW: Helper function to count tokens ---
async function getTokenCount(apiKey, modelName, contents, systemInstruction, tools) {
    const countApiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:countTokens?key=${apiKey}`;
    const requestBody = {
        // NOTE: The structure for countTokens is slightly different.
        // It expects 'contents' directly at the top level for simple cases,
        // OR a 'generateContentRequest' object containing contents, systemInstruction, tools etc.
        // Using the 'generateContentRequest' structure is safer as it mirrors the generation call.
        generateContentRequest: {
            contents: contents,
            ...(systemInstruction && { systemInstruction: systemInstruction }), // Conditionally add if present
            ...(tools && { tools: tools }) // Conditionally add if present
        }
    };

     // Log the request body being sent to countTokens for debugging
    // console.log(`countTokens Request Body for ${modelName}:`, JSON.stringify(requestBody, null, 2));

    try {
        const response = await fetch(countApiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestBody),
        });

        if (!response.ok) {
            let errorMsg = `countTokens failed for ${modelName} with status: ${response.status}`;
            let errorData = null;
            try {
                errorData = await response.json();
                errorMsg = errorData?.error?.message || errorMsg;
                console.error(`countTokens Error Details (${modelName}):`, JSON.stringify(errorData));
            } catch (e) {
                 const textError = await response.text();
                 console.error(`countTokens Raw Error Response (${modelName}):`, textError);
                 errorMsg += ` - ${textError}`;
            }
            // Add specific handling if needed, e.g., permission denied often relates to API key/billing
            if (response.status === 403 || response.status === 400 && errorMsg.includes('API key not valid')) {
                 throw new Error(`API Key/Permissions Error during token count: ${errorMsg}`);
            }
             if (response.status === 400 && errorMsg.includes('must be less than 20MB')) {
                 // This indicates the raw request to countTokens itself was too large (due to base64)
                 throw new Error(`Content too large for token counting request (Max ~20MB HTTP limit).`);
             }
            throw new Error(errorMsg); // Throw generic error for other failures
        }

        const data = await response.json();
        // console.log(`countTokens Response for ${modelName}:`, data); // Debugging

        if (typeof data.totalTokens !== 'number') {
             console.error(`Invalid response format from countTokens for ${modelName}:`, data);
             throw new Error(`Invalid token count response from API for ${modelName}.`);
        }

        console.log(`Token count for ${modelName}: ${data.totalTokens}`);
        return data.totalTokens;

    } catch (error) {
        console.error(`Error calling countTokens for ${modelName}:`, error);
        // Re-throw the specific errors or a generic one
        if (error.message.includes('Content too large') || error.message.includes('API Key/Permissions')) {
             throw error; // Re-throw specific known errors
        }
        throw new Error(`Failed to count tokens for model ${modelName}. ${error.message}`);
    }
}
// --- END NEW HELPER ---


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

    // --- Get FULL history from request body ---
    const { history } = req.body; // History now contains objects with parts arrays

    if (!history || !Array.isArray(history) || history.length === 0) { // History should not be empty
        return res.status(400).json({ error: 'Invalid request body: Missing, invalid, or empty "history".' });
    }

    // --- Process history to format for Gemini API (includes Base64 extraction) ---
    let processedContents = history.map(message => {
        if (!message.role || !Array.isArray(message.parts)) {
            console.warn("Skipping invalid message structure in history:", message);
            return null; // Or handle error more strictly
        }
        const processedParts = message.parts.map(part => {
            if (part.text !== undefined && part.text !== null) { // Allow empty strings
                return { text: part.text };
            } else if (part.inlineData && part.inlineData.mimeType && part.inlineData.data) {
                const base64Data = getBase64Data(part.inlineData.data);
                if (!base64Data) {
                     console.error("Failed to extract base64 data for part:", part);
                     // Decide: return null (skip part) or throw error? Skipping is safer.
                     return null;
                }
                // Gemini API expects just the base64 string
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
            // Ensure role is 'user' or 'model'
            const role = message.role === 'ai' ? 'model' : message.role;
             if (role !== 'user' && role !== 'model') {
                  console.warn(`Skipping message with invalid role: ${message.role}`);
                  return null;
             }
            return { role: role, parts: processedParts };
        } else {
             console.warn("Skipping message that ended up with no valid parts:", message);
            return null; // Skip messages that ended up with no valid parts
        }
    }).filter(content => content !== null); // Remove any null messages

    if (processedContents.length === 0) {
         return res.status(400).json({ error: 'Failed to process message history - no valid messages found.' });
    }

    // --- Generate System Prompt with Current Date ---
    const baseSystemPrompt = "You are Kramer Intelligence, an advanced AI assistant developed by Daniel Vincent Kramer.";
    const today = new Date();
    const dateOptions = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
    const formattedDate = today.toLocaleDateString('en-US', dateOptions);
    const systemPromptText = `${baseSystemPrompt} Today's date is ${formattedDate}.`;
    const systemInstruction = { parts: [ { text: systemPromptText } ] }; // Define system instruction object

     // Define Tools (used in both countTokens and generateContent)
    const tools = [ { googleSearch: {} } ];

    // --- NEW: Server-Side Token Counting and History Truncation ---
    const countModel = MODELS_TO_TRY[0]; // Use the primary model for counting
    let currentTotalTokens = 0;
    let initialHistoryLength = processedContents.length;
    let historyTruncated = false;

    try {
        while (true) {
            // console.log(`Attempting token count with history length: ${processedContents.length}`); // Debugging
            currentTotalTokens = await getTokenCount(apiKey, countModel, processedContents, systemInstruction, tools);

            if (currentTotalTokens <= MAX_CONTEXT_TOKENS) {
                console.log(`Token count (${currentTotalTokens}) is within limit (${MAX_CONTEXT_TOKENS}). Proceeding.`);
                break; // Exit loop, history is acceptable
            }

            // Token limit exceeded, try to truncate
            console.warn(`Token count (${currentTotalTokens}) exceeds limit (${MAX_CONTEXT_TOKENS}). Truncating history.`);
            historyTruncated = true;

            if (processedContents.length >= 2) {
                // Remove the oldest user/model pair (first two elements)
                processedContents.splice(0, 2);
                console.log(`Removed oldest message pair. New history length: ${processedContents.length}`);
            } else {
                // Cannot truncate further, even the last message is too large
                console.error(`Cannot truncate history further. Last message (length ${processedContents.length}) alone exceeds token limit (${currentTotalTokens} > ${MAX_CONTEXT_TOKENS}).`);
                // Check if it's likely due to file size based on the error from countTokens, otherwise give generic token error.
                // This specific error check might be difficult here unless getTokenCount passes specific errors up.
                // Let's return a more specific error based on the situation.
                 return res.status(413).json({ error: `Content too large. The latest message (possibly with a large file) exceeds the processing capacity (${currentTotalTokens} tokens > ${MAX_CONTEXT_TOKENS} limit). Please reduce file size or text length.` });
                // NOTE: 413 Payload Too Large might be more semantically correct than 400 here.
            }
        } // End while loop

        if (historyTruncated) {
            console.log(`History truncated from ${initialHistoryLength} messages to ${processedContents.length} messages to fit token limit.`);
        }

    } catch (error) {
        console.error('Error during token counting/truncation phase:', error);
        // Handle specific errors from getTokenCount if needed
        if (error.message.includes('Content too large for token counting request')) {
             return res.status(413).json({ error: `Request failed: File data is too large for the API to process (Max ~${MAX_IMAGE_SIZE_MB}MB). Please use a smaller file.` });
        }
        if (error.message.includes('API Key/Permissions Error')) {
             return res.status(403).json({ error: `API Key or Permissions Error: ${error.message}. Please check server configuration.` });
        }
         // Handle the specific case where the single message was too large (thrown inside the loop)
         if (error.message.includes('exceeds the processing capacity')) {
              return res.status(413).json({ error: error.message }); // Use the specific message
         }
        // Generic error for other count/truncation issues
        return res.status(500).json({ error: `Server error during token counting: ${error.message}` });
    }
    // --- END TOKEN COUNTING/TRUNCATION ---


    // --- Initialize variables for the generation fallback loop ---
    let googleData = null;
    let googleResponse = null;
    let lastErrorData = null;
    let successfulModel = null;

    // --- Loop through models and attempt API call for GENERATION ---
    for (const modelName of MODELS_TO_TRY) {
        console.log(`Attempting generateContent API call with model: ${modelName}`);
        const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`;

        // Use the potentially truncated processedContents
        const requestBody = {
            contents: processedContents,
            systemInstruction: systemInstruction, // Use the defined system instruction object
            tools: tools, // Use the defined tools
            // generationConfig, safetySettings... could potentially be added here
        };

        // console.log(`generateContent Request Body for ${modelName}:`, JSON.stringify(requestBody, null, 2)); // Debug

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
                // Log token usage from the successful response
                if (googleData?.usageMetadata) {
                    console.log(`Token Usage (${successfulModel}):`, JSON.stringify(googleData.usageMetadata));
                }
                break; // Exit the loop on first successful call
            } else {
                // API returned an error status (e.g., 4xx, 5xx)
                console.warn(`Model ${modelName} failed generateContent with status: ${googleResponse.status}`);
                try {
                    lastErrorData = await googleResponse.json();
                    console.warn(`Error details for ${modelName}:`, JSON.stringify(lastErrorData));
                } catch (parseError) {
                    const errorText = await googleResponse.text();
                    console.warn(`Could not parse error JSON for ${modelName}. Raw response:`, errorText);
                    lastErrorData = { error: { message: `API Error: ${googleResponse.status} ${googleResponse.statusText}. Response body was not valid JSON.` } };
                }
                // Check for specific errors that might indicate hitting limits even after truncation
                if (googleResponse.status === 400 && lastErrorData?.error?.message?.includes('token limit')) {
                    console.error(`Model ${modelName} still hit token limit despite prior check. Limit might be lower than counted or content changed.`);
                    // Optionally break or handle differently? Continuing allows fallback.
                }
                 if (googleResponse.status === 400 && lastErrorData?.error?.message?.includes('size must be less than')) {
                      console.error(`Model ${modelName} failed due to HTTP payload size limit. This shouldn't happen if countTokens worked.`);
                      // This might indicate an issue with base64 encoding size vs API limit inconsistency.
                      lastErrorData.error.message = `Request failed: File data too large for the API to process (Max ~${MAX_IMAGE_SIZE_MB}MB). Please use a smaller file.`;
                 }
            }
        } catch (error) {
            // Network error or other fetch-related issue
            console.error(`Fetch error during generateContent for model ${modelName}:`, error);
            lastErrorData = { error: { message: `Network or fetch error for ${modelName}: ${error.message}` } };
            googleResponse = { status: 500, statusText: 'Network Error' }; // Mock response
        }
    } // --- End of model loop ---


    // --- Process the result (or final error) ---
    try {
        // If googleData is null after the loop, all models failed
        if (!googleData || !successfulModel) {
            console.error('All models failed generateContent. Reporting last encountered error.');
            const finalStatus = googleResponse?.status || 500;
            let errorMsg = lastErrorData?.error?.message || `API Error: ${finalStatus} ${googleResponse?.statusText || 'Unknown Error'}`;

            // Append specific known error details if helpful
             if (lastErrorData?.error?.status === 'FAILED_PRECONDITION' || (finalStatus === 403 || (finalStatus === 400 && errorMsg.includes('API key not valid')))) {
                  errorMsg += ' (Check API key/billing/permissions?)';
             }
             // Use the more specific large payload message if set earlier
             if (errorMsg.includes('File data too large for the API to process')) {
                  // Message already specific enough
             } else if (finalStatus === 413 || (finalStatus === 400 && errorMsg.includes('size must be less than'))) {
                  errorMsg = `Request too large (likely file size). Max ~${MAX_IMAGE_SIZE_MB}MB recommended. ${errorMsg}`;
             } else if (errorMsg.includes('429') || lastErrorData?.error?.status === 'RESOURCE_EXHAUSTED') {
                  errorMsg += ' (Rate limit exceeded?)';
             } else if (finalStatus === 400 && errorMsg.includes('token limit')) {
                 errorMsg = `Content exceeds model's token limit, even after attempting truncation. ${errorMsg}`;
             }


            return res.status(finalStatus).json({ error: errorMsg });
        }

        // --- SUCCESS: Proceed with processing the successful response from googleData ---
        let aiText = null;
        let searchSuggestionHtml = null;
        const candidate = googleData?.candidates?.[0];

        if (candidate) {
            // Check for finishReason first
            if (candidate.finishReason && candidate.finishReason !== "STOP" && candidate.finishReason !== "MAX_TOKENS") {
                 console.warn(`Generation finished with reason: ${candidate.finishReason}`);
                 // Handle safety blocks specifically
                 if (candidate.finishReason === "SAFETY") {
                     const blockReason = googleData.promptFeedback?.blockReason || candidate.safetyRatings?.find(r => r.blocked)?.category || 'Unknown Safety Reason';
                     console.warn('Blocked by safety settings:', blockReason);
                     return res.status(400).json({ error: `Content blocked by safety settings: ${blockReason}` });
                 }
                 // Handle other non-standard finish reasons if necessary
                 // For now, try to extract text anyway, but log the warning.
            }

             // Extract text content (check multiple potential locations in response)
             if (candidate.content?.parts?.[0]?.text) {
                 aiText = candidate.content.parts[0].text;
             } else {
                 // Fallback or logging if text isn't where expected
                 console.warn("AI response candidate found, but text content missing in expected location:", candidate);
                 // Maybe the response is empty or has a different structure?
                 aiText = ""; // Default to empty string if no text found
             }


            // Extract search suggestions
            const groundingMetadata = candidate.groundingMetadata;
            if (groundingMetadata?.searchEntryPoint?.renderedContent) {
                searchSuggestionHtml = groundingMetadata.searchEntryPoint.renderedContent;
            }
        } else {
             // Handle case where candidates array is empty or missing
             console.error('API response successful, but no candidates found in googleData:', googleData);
              // Check for prompt feedback block reason even if no candidate
              if (googleData.promptFeedback?.blockReason) {
                 console.warn('Blocked:', googleData.promptFeedback.blockReason);
                 return res.status(400).json({ error: `Content blocked by safety settings: ${googleData.promptFeedback.blockReason}` });
              }
             return res.status(500).json({ error: 'AI response format error (No candidates found).' });
        }


        // Final validation on extracted text
        if (typeof aiText !== 'string') {
            console.error('AI response processing failed to extract valid text string:', aiText);
            return res.status(500).json({ error: 'AI response format error (Invalid text extracted).' });
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
// Extracted code from api/chat.js

// --- Helper function ---
// Used for processing inline image data for the API request
function getBase64Data(dataUrl) {
    if (typeof dataUrl !== 'string' || !dataUrl.includes(',')) {
        console.error("Invalid Data URL format received:", dataUrl);
        return null; // Or throw an error
    }
    return dataUrl.split(',')[1];
}

// --- Configuration (Directly configures API interaction parameters) ---
const MODELS_TO_TRY = [
	'gemini-2.5-flash',
	'gemini-2.5-flash-lite-preview-06-17'
]; // Models to attempt for the API call
const MAX_FILE_SIZE_MB = 15; // Max size for inline upload (Indirectly affects API by limiting what can be sent)
const MAX_TOKENS = 1000000; // Max context window tokens (Used for pre-API call truncation)

// --- API Key Handling (Essential for authenticating API calls) ---
// const apiKey = process.env.GEMINI_API_KEY; // This line is executed within the handler
/* Relevant check:
    if (!apiKey) {
        console.error("GEMINI_API_KEY missing.");
        return res.status(500).json({ error: 'Server configuration error.' });
    }
*/

// --- Request Payload Construction (Prepares data for the Gemini API) ---
/* Relevant history processing:
    const processedContents = history.map(message => {
        // ... (maps client-side history to Gemini API format)
        const processedParts = message.parts.map(part => {
            if (part.text) {
                return { text: part.text };
            } else if (part.inlineData && part.inlineData.mimeType && part.inlineData.data) {
                const base64Data = getBase64Data(part.inlineData.data); // Uses helper
                // ...
                return {
                    inlineData: {
                        mimeType: part.inlineData.mimeType,
                        data: base64Data
                    }
                };
            } // ...
        }).filter(part => part !== null);
        // ...
    }).filter(content => content !== null);
*/

/* Relevant system prompt generation:
    const baseSystemPrompt = "You are Kramer Intelligence, an advanced AI assistant developed by Daniel Vincent Kramer. Kramer Intelligence may be abbreviated as KI.";
    const today = new Date();
    const dateOptions = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
    const formattedDate = today.toLocaleDateString('en-US', dateOptions);
    const systemPrompt = `${baseSystemPrompt} Today's date is ${formattedDate}.`;
*/

/* Token Counting and Truncation (Prepares data for Gemini API by ensuring it fits token limits)
    // ...
            const firstModel = MODELS_TO_TRY[0];
            const countTokensUrl = `https://generativelanguage.googleapis.com/v1beta/models/${firstModel}:countTokens?key=${apiKey}`; // API call for token count
            // ...
            const countResponse = await fetch(countTokensUrl, { // API call execution
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ contents: contentsToCount }),
            });
    // ...
*/

/* Request body for generateContent:
        const requestBody = {
            contents: processedContents, // Processed history
            system_instruction: { parts: [ { text: systemPrompt } ] }, // System prompt
            tools: [ { googleSearch: {} } ]
            // Add safetySettings etc. here directly if needed
        };
*/

// --- API Call Execution (Directly calls the Gemini API) ---
/*
    for (const modelName of MODELS_TO_TRY) { // Loop to try defined models
        // ...
        const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`; // API URL construction

        // ...
        googleResponse = await fetch(apiUrl, { // The actual fetch call to Gemini API
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestBody), // Contains processed history and system prompt
        });
        // ...
    }
*/

// --- Response Handling (Processes the Gemini API's response) ---
/*
            if (googleResponse.ok) {
                googleData = await googleResponse.json(); // Parsing successful JSON response
                successfulModel = modelName;
                // ...
                break;
            } else {
                // API returned an error status (e.g., 4xx, 5xx)
                lastErrorData = await googleResponse.json(); // Parsing error JSON response
                // ...
            }
        } catch (error) { // Network or other fetch errors
            lastErrorData = { error: { message: `Network or fetch error for ${modelName}: ${error.message}` } };
            // ...
        }
    // ...
    if (!googleData || !successfulModel) { // Handling case where all model attempts failed
        // ... error reporting ...
    }

    // --- SUCCESS: Proceed with processing the successful response ---
    let aiText = null;
    const candidate = googleData?.candidates?.[0]; // Accessing the candidate from API response
    const promptFeedback = googleData?.promptFeedback; // Accessing prompt feedback for safety checks

    if (candidate) {
        const finalAnswerPart = candidate.content?.parts?.find(part => part.text && !part.thought);
        aiText = finalAnswerPart?.text; // Extracting text output

        const groundingMetadata = candidate.groundingMetadata;
        if (groundingMetadata?.searchEntryPoint?.renderedContent) {
            searchSuggestionHtml = groundingMetadata.searchEntryPoint.renderedContent; // Extracting search suggestions
        }
    }

    // Safety checks based on API response
    if (promptFeedback?.blockReason) {
        // ...
    }
    if (candidate?.finishReason === 'SAFETY') {
        // ...
    }

    // Validating AI response format
    if (typeof aiText !== 'string') {
        // ... error handling and reporting ...
    }

    // --- Send successful response back to client ---
    res.status(200).json({
        text: aiText,
        searchSuggestionHtml: searchSuggestionHtml,
        modelUsed: successfulModel
    });
*/

// --- Error Handling (Specific error message construction based on API response) ---
/* Included in Response Handling above, but some specific snippets:
    if (lastErrorData?.error?.status === 'FAILED_PRECONDITION') errorMsg += ' (Check API key/billing?)';
    if (lastErrorData?.error?.message?.includes('payload is too large')) errorMsg = `Request too large (~${MAX_FILE_SIZE_MB}MB limit).`;
    else if (lastErrorData?.error?.message?.includes('429')) errorMsg += ' (Rate limit exceeded?)';
    else if (lastErrorData?.error?.code === 400 && lastErrorData?.error?.message?.includes('must be less than or equal to')) errorMsg = `Request failed: History likely exceeds token limit. ${lastErrorData?.error?.message}`;
*/
// End of extracted code

// api/chat.js

// Handler function for Vercel Serverless Function
export default async function handler(req, res) {
    // --- Security/CORS Headers ---
    res.setHeader('Access-Control-Allow-Origin', '*'); // Adjust in production
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    // Handle CORS preflight requests
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    // --- Ensure POST method ---
    if (req.method !== 'POST') {
        res.setHeader('Allow', ['POST']);
        return res.status(405).json({ error: `Method ${req.method} Not Allowed` });
    }

    // --- Get API Key from Environment Variables ---
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
        console.error("GEMINI_API_KEY environment variable not set.");
        return res.status(500).json({ error: 'Server configuration error: API key missing.' });
    }

    // --- Get history from request body ---
    const { history } = req.body;

    if (!history || !Array.isArray(history)) {
        return res.status(400).json({ error: 'Invalid request body: Missing or invalid "history" array.' });
    }

    // --- Define System Prompt ---
    const systemPrompt = "You are Kramer Intelligence, an advanced AI assistant developed by Daniel Vincent Kramer";

    // --- Prepare request for Google Gemini API ---
    // --- MODIFIED: Use the correct model name as requested ---
    const modelName = 'gemini-2.0-flash';
    // --- END MODIFIED ---
    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`;

    // --- Prepare Request Body with Grounding Tool ---
    // --- MODIFIED: Use the 'googleSearch' syntax likely required for 2.0 ---
    const requestBody = {
        contents: history,
        systemInstruction: {
            parts: [ { text: systemPrompt } ]
        },
        tools: [
            {
                // Using the newer syntax shown for 2.0 models in the docs
                googleSearch: {}
            }
        ],
        // Optional: safetySettings, generationConfig
        // generationConfig: {
        //     responseMimeType: "text/plain", // Or other relevant settings
        // }
    };
    // --- END MODIFIED ---

    try {
        const googleResponse = await fetch(apiUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(requestBody),
        });

        const googleData = await googleResponse.json();

        // --- Handle Potential Errors from Google API ---
        if (!googleResponse.ok) {
            console.error('Google API Error Response:', googleData);
            let errorMsg = googleData?.error?.message || `Google API Error: ${googleResponse.statusText} (${googleResponse.status})`;
             if (googleData?.error?.status === 'FAILED_PRECONDITION') {
                 errorMsg += ' Check if billing is enabled for the Google Cloud project.';
             }
             // Add check for invalid model name error specifically
             if (googleData?.error?.message?.toLowerCase().includes('model not found') || googleData?.error?.message?.toLowerCase().includes('invalid model name')) {
                 errorMsg += ` Ensure the model name '${modelName}' is correct and accessible with your API key.`;
             }
            return res.status(googleResponse.status || 500).json({ error: errorMsg });
        }

        // --- Extract Text and Grounding Metadata Safely ---
        let aiText = null;
        let searchSuggestionHtml = null;

        const candidate = googleData?.candidates?.[0];

        if (candidate) {
            // Extract text
            aiText = candidate.content?.parts?.[0]?.text;

            // Extract grounding metadata if present
            // Using ?. optional chaining for safety
            const groundingMetadata = candidate.groundingMetadata;
            if (groundingMetadata?.searchEntryPoint?.renderedContent) {
                searchSuggestionHtml = groundingMetadata.searchEntryPoint.renderedContent;
                console.log("Grounding occurred, extracted search suggestion HTML.");
            }
        }

        // Handle cases where response was blocked
        if (googleData.promptFeedback?.blockReason) {
             console.warn('AI response blocked due to safety settings:', googleData.promptFeedback.blockReason);
             return res.status(400).json({ error: `Response blocked due to safety settings (${googleData.promptFeedback.blockReason}). Please rephrase your message.` });
        }

        // Handle cases where text extraction failed AFTER block check
        if (typeof aiText !== 'string') {
            console.error('Unexpected Google API response structure or missing text:', googleData);
             if (!candidate) {
                  return res.status(500).json({ error: 'AI returned no response candidates. This might be due to safety filters or an issue with the prompt.' });
             }
            return res.status(500).json({ error: 'AI returned an unexpected response format or missing text content.' });
        }

        // --- Send successful response back to frontend ---
        res.status(200).json({
            text: aiText,
            searchSuggestionHtml: searchSuggestionHtml
        });

    } catch (error) {
        console.error('Error in serverless function:', error);
        res.status(500).json({ error: 'An internal server error occurred.' });
    }
}
// api/chat.js

// Helper function to extract Base64 data from Data URL
function getBase64Data(dataUrl) {
    if (typeof dataUrl !== 'string' || !dataUrl.includes(',')) {
        console.error("Invalid Data URL format received:", dataUrl);
        return null; // Or throw an error
    }
    return dataUrl.split(',')[1];
}

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

        // Only include the message if it has valid parts after processing
        if (processedParts.length > 0) {
            return {
                role: message.role,
                parts: processedParts
            };
        } else {
            return null; // Skip messages that ended up with no valid parts
        }
    }).filter(content => content !== null); // Remove any null messages

    if (processedContents.length === 0 && history.length > 0) {
         return res.status(400).json({ error: 'Failed to process message history parts.' });
    }
    // --- END MODIFIED ---


    const systemPrompt = "You are Kramer Intelligence, an advanced AI assistant developed by Daniel Vincent Kramer";
    const modelName = 'gemini-2.0-flash';
    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`;

    const requestBody = {
        contents: processedContents, // Use processed history
        systemInstruction: { parts: [ { text: systemPrompt } ] },
        tools: [ { googleSearch: {} } ],
        // generationConfig, safetySettings...
    };

    try {
        const googleResponse = await fetch(apiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestBody),
        });

        const googleData = await googleResponse.json();

        if (!googleResponse.ok) {
            console.error('Google API Error:', googleData);
            let errorMsg = googleData?.error?.message || `API Error: ${googleResponse.status}`;
             if (googleData?.error?.status === 'FAILED_PRECONDITION') errorMsg += ' Billing?';
             if (googleData?.error?.message?.includes('400 Bad Request. Request payload is too large')) errorMsg = `Request too large (likely image size). Max ~${MAX_IMAGE_SIZE_MB}MB recommended.`;
            return res.status(googleResponse.status || 500).json({ error: errorMsg });
        }

        let aiText = null;
        let searchSuggestionHtml = null;
        const candidate = googleData?.candidates?.[0];

        if (candidate) {
            aiText = candidate.content?.parts?.[0]?.text;
            const groundingMetadata = candidate.groundingMetadata;
            if (groundingMetadata?.searchEntryPoint?.renderedContent) {
                searchSuggestionHtml = groundingMetadata.searchEntryPoint.renderedContent;
            }
        }

        if (googleData.promptFeedback?.blockReason) {
            console.warn('Blocked:', googleData.promptFeedback.blockReason);
            return res.status(400).json({ error: `Blocked: ${googleData.promptFeedback.blockReason}` });
        }
        if (typeof aiText !== 'string') { // Check *after* block reason
            console.error('Bad structure/no text:', googleData);
            return res.status(500).json({ error: 'AI response format error.' });
        }

        res.status(200).json({
            text: aiText,
            searchSuggestionHtml: searchSuggestionHtml
        });

    } catch (error) {
        console.error('Serverless function error:', error);
        res.status(500).json({ error: 'Internal server error.' });
    }
}
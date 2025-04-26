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

    // --- Define System Prompt --- // ADDED
    const systemPrompt = "You are Kramer Intelligence, an advanced AI assistant developed by Daniel Vincent Kramer";

    // --- Prepare request for Google Gemini API ---
    const modelName = 'gemini-1.5-flash-latest'; // Or 'gemini-2.0-flash' if that becomes the official name
    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`;

    // Ensure the history structure matches API requirements ("contents")
    const requestBody = {
        contents: history,
        systemInstruction: { // ADDED systemInstruction field
            parts: [
                { text: systemPrompt }
            ]
        },
        // Optional: Add safety settings and generation config if needed
        // safetySettings: [ ... ],
        // generationConfig: { ... }
    };

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
            return res.status(googleResponse.status || 500).json({ error: errorMsg });
        }

        // --- Extract Text Safely ---
        if (googleData.promptFeedback && googleData.promptFeedback.blockReason) {
             console.warn('AI response blocked due to safety settings:', googleData.promptFeedback.blockReason);
             return res.status(400).json({ error: `Response blocked due to safety settings (${googleData.promptFeedback.blockReason}). Please rephrase your message.` });
        }

        const aiText = googleData?.candidates?.[0]?.content?.parts?.[0]?.text;

        if (typeof aiText !== 'string') {
            console.error('Unexpected Google API response structure:', googleData);
             if (!googleData?.candidates?.length) {
                  return res.status(500).json({ error: 'AI returned no response candidates. This might be due to safety filters or an issue with the prompt.' });
             }
            return res.status(500).json({ error: 'AI returned an unexpected response format.' });
        }

        // --- Send successful response back to frontend ---
        res.status(200).json({ text: aiText });

    } catch (error) {
        console.error('Error in serverless function:', error);
        res.status(500).json({ error: 'An internal server error occurred.' });
    }
}
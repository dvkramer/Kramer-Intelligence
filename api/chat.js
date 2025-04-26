// Using require syntax for broad Node compatibility on Vercel
// If using "type": "module" in package.json, switch to import syntax:
// import fetch from 'node-fetch'; // Only if Vercel's built-in fetch isn't sufficient

// Handler function for Vercel Serverless Function
export default async function handler(req, res) {
    // --- Security: Allow requests only from your Vercel domain in production ---
    // Adjust this in a real deployment for better security! '*' is permissive.
    res.setHeader('Access-Control-Allow-Origin', '*');
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

    // --- Prepare request for Google Gemini API ---
    // NOTE: Using 'gemini-1.5-flash-latest' as the verified model with 1M context.
    // Replace if 'gemini-2.0-flash' becomes the official & available name.
    const modelName = 'gemini-1.5-flash-latest';
    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`;

    // Ensure the history structure matches API requirements ("contents")
    const requestBody = {
        contents: history,
        // Optional: Add safety settings and generation config if needed
        // safetySettings: [
        //     { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_MEDIUM_AND_ABOVE" },
        //     { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_MEDIUM_AND_ABOVE" },
        //     { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_MEDIUM_AND_ABOVE" },
        //     { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_MEDIUM_AND_ABOVE" },
        // ],
        // generationConfig: {
        //     temperature: 0.7,
        //     topK: 40,
        //     topP: 0.95,
        //     maxOutputTokens: 1024, // Adjust as needed
        // }
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
            const errorMsg = googleData?.error?.message || `Google API Error: ${googleResponse.statusText} (${googleResponse.status})`;
             // Check for specific billing issue (common on free tier/setup)
             if (googleData?.error?.status === 'FAILED_PRECONDITION') {
                 errorMsg += ' Check if billing is enabled for the Google Cloud project.';
             }
            return res.status(googleResponse.status || 500).json({ error: errorMsg });
        }

        // --- Extract Text Safely ---
        // Check if response format is as expected
        // Note: Sometimes the response might be blocked due to safety settings.
        if (googleData.promptFeedback && googleData.promptFeedback.blockReason) {
             console.warn('AI response blocked due to safety settings:', googleData.promptFeedback.blockReason);
             return res.status(400).json({ error: `Response blocked due to safety settings (${googleData.promptFeedback.blockReason}). Please rephrase your message.` });
        }

        // Safely access the text part
        const aiText = googleData?.candidates?.[0]?.content?.parts?.[0]?.text;

        if (typeof aiText !== 'string') {
            console.error('Unexpected Google API response structure:', googleData);
             // Check if candidates array is empty or missing parts/text
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
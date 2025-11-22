
// Kramer Intelligence - Backend (Native Gemini API)

export const config = {
    maxDuration: 60,
};

const MODELS_TO_TRY = [
    'gemini-3-pro-preview',
    'gemini-pro-latest',
    'gemini-flash-latest'
];

// Helper to clean base64
const getBase64Data = (dataUrl) => {
    if (!dataUrl || typeof dataUrl !== 'string') return null;
    const matches = dataUrl.match(/^data:(.+);base64,(.+)$/);
    if (!matches || matches.length !== 3) return null;
    return matches[2];
};

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) return res.status(500).json({ error: 'Missing API Key.' });

    const { history, timezone } = req.body;

    // Prepare Contents for Gemini Native API
    const contents = [];

    if (history && Array.isArray(history)) {
        history.forEach(msg => {
            const parts = [];
            msg.parts.forEach(part => {
                if (part.text) {
                    parts.push({ text: part.text });
                }
                if (part.inlineData) {
                    const base64 = getBase64Data(part.inlineData.data);
                    if (base64) {
                        parts.push({
                            inlineData: {
                                mimeType: part.inlineData.mimeType,
                                data: base64
                            }
                        });
                    }
                }
            });

            if (parts.length > 0) {
                // Map role: 'model' is standard for Gemini, 'ai' might be from legacy frontend.
                // 'user' is standard.
                let role = msg.role;
                if (role === 'ai') role = 'model';
                contents.push({ role, parts });
            }
        });
    }

    // System Prompt
    const now = new Date();
    const dateStr = now.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', timeZone: timezone || 'UTC' });
    const systemInstruction = {
        parts: [{ text: `You are Kramer Intelligence, an advanced AI assistant. Today is ${dateStr}. You can use LaTeX for math.` }]
    };

    // Loop Models
    let lastError = null;
    let successfulResponse = null;
    let usedModel = null;

    for (const model of MODELS_TO_TRY) {
        try {
            console.log(`Attempting model (Native): ${model}`);

            const requestPayload = {
                contents: contents,
                systemInstruction: systemInstruction,
                tools: [
                    { google_search: {} } // Native Google Search Tool
                ],
                generationConfig: {
                    temperature: 0.7
                }
            };

            const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(requestPayload)
            });

            if (!response.ok) {
                const txt = await response.text();
                console.warn(`Model ${model} failed: ${response.status} - ${txt}`);
                lastError = `Error ${response.status}: ${txt}`;
                continue;
            }

            const data = await response.json();
            successfulResponse = data;
            usedModel = model;
            break;
        } catch (e) {
            console.error(`Model ${model} exception:`, e);
            lastError = e.message;
        }
    }

    if (successfulResponse) {
        const candidate = successfulResponse.candidates?.[0];
        let text = "";
        if (candidate?.content?.parts) {
            text = candidate.content.parts.map(p => p.text || "").join("");
        }

        let searchSuggestionHtml = null;
        if (candidate?.groundingMetadata?.searchEntryPoint?.renderedContent) {
            searchSuggestionHtml = candidate.groundingMetadata.searchEntryPoint.renderedContent;
        }

        return res.status(200).json({
            text: text,
            searchSuggestionHtml: searchSuggestionHtml,
            modelUsed: usedModel
        });
    } else {
        return res.status(500).json({ error: `All models failed. Last error: ${lastError}` });
    }
}

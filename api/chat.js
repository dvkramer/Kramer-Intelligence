
// Kramer Intelligence - Backend (OpenAI Compatibility Mode)

export const config = {
    maxDuration: 60,
};

// Define the models to try, in order of preference as requested
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

const mapRole = (role) => {
    if (role === 'model' || role === 'ai') return 'assistant';
    return 'user';
};

export default async function handler(req, res) {
    // CORS Headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) return res.status(500).json({ error: 'Missing API Key.' });

    const { history, timezone } = req.body;

    // 1. Convert Gemini History to OpenAI Messages
    const messages = [];

    // System Prompt
    const now = new Date();
    const dateStr = now.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', timeZone: timezone || 'UTC' });
    messages.push({
        role: 'system',
        content: `You are Kramer Intelligence, an advanced AI assistant. Today is ${dateStr}. You can use LaTeX for math.`
    });

    // User/Assistant Messages
    if (history && Array.isArray(history)) {
        history.forEach(msg => {
            const role = mapRole(msg.role);
            const content = [];

            msg.parts.forEach(part => {
                if (part.text) {
                    content.push({ type: 'text', text: part.text });
                }
                if (part.inlineData) {
                    const base64 = getBase64Data(part.inlineData.data);
                    if (base64) {
                        content.push({
                            type: 'image_url',
                            image_url: {
                                url: `data:${part.inlineData.mimeType};base64,${base64}`
                            }
                        });
                    }
                }
            });

            if (content.length > 0) {
                messages.push({ role, content });
            }
        });
    }

    // 2. Loop through Models
    let lastError = null;
    let successfulResponse = null;
    let usedModel = null;

    for (const model of MODELS_TO_TRY) {
        try {
            console.log(`Attempting model: ${model}`);
            const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/openai/chat/completions`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey}`
                },
                body: JSON.stringify({
                    model: model,
                    messages: messages,
                    temperature: 0.7,
                    stream: false
                })
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
            break; // Success
        } catch (e) {
            console.error(`Model ${model} exception:`, e);
            lastError = e.message;
        }
    }

    // 3. Handle Result
    if (successfulResponse) {
        const choice = successfulResponse.choices?.[0];
        const text = choice?.message?.content || "";

        // OpenAI compatibility layer wraps the response.
        // We return a simplified object to our frontend.
        return res.status(200).json({
            text: text,
            searchSuggestionHtml: null, // Grounding not easily available in standard OpenAI response
            modelUsed: usedModel
        });
    } else {
        return res.status(500).json({ error: `All models failed. Last error: ${lastError}` });
    }
}

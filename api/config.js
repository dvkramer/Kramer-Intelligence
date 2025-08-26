export default function handler(req, res) {
  // --- Security/CORS Headers ---
  res.setHeader('Access-Control-Allow-Origin', '*'); // Adjust in production
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET']);
    return res.status(405).json({ error: `Method ${req.method} Not Allowed` });
  }

  const apiKey = process.env.FIREBASE_API_KEY;

  if (!apiKey) {
    console.error("FIREBASE_API_KEY is not set in environment variables.");
    return res.status(500).json({ error: 'Server configuration error: Missing API key.' });
  }

  res.status(200).json({ apiKey });
}

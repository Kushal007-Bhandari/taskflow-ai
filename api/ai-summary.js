// api/ai-summary.js
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const HF_TOKEN = process.env.HF_TOKEN;
  if (!HF_TOKEN) return res.status(200).json({ summary: 'AI unavailable: HF_TOKEN not set.', source: 'no-token' });

  try {
    const { prompt, mode = 'summary' } = req.body || {};
    if (!prompt) return res.status(400).json({ error: 'No prompt provided' });

    // Chat needs more tokens and slightly higher temp for natural conversation
    const isChat = mode === 'chat';

    const hfRes = await fetch(
      'https://api-inference.huggingface.co/models/mistralai/Mistral-7B-Instruct-v0.3',
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${HF_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          inputs: prompt,
          parameters: {
            max_new_tokens:     isChat ? 300  : 280,
            temperature:        isChat ? 0.8  : 0.72,
            top_p:              isChat ? 0.95 : 0.92,
            repetition_penalty: 1.1,
            do_sample:          true,
            return_full_text:   false,
          },
        }),
      }
    );

    if (!hfRes.ok) {
      const errBody = await hfRes.text();
      console.error(`HF ${hfRes.status}:`, errBody.slice(0, 200));
      if (hfRes.status === 503) return res.status(503).json({ error: 'Model loading, retry in 20s', retry: true });
      // For other errors still return something useful
      return res.status(200).json({ summary: null, source: 'error', error: `HF ${hfRes.status}` });
    }

    const hfData = await hfRes.json();
    let text = Array.isArray(hfData)
      ? (hfData[0]?.generated_text || '')
      : (hfData.generated_text || '');

    // Clean up artifacts
    text = text
      .replace(/\[INST\][\s\S]*?\[\/INST\]/g, '')
      .replace(/<s>|<\/s>|\[\/INST\]/g, '')
      .replace(/^(Sure[!,.]?\s*|Certainly[!,.]?\s*|Of course[!,.]?\s*|Absolutely[!,.]?\s*)/i, '')
      .replace(/^(Here'?(?:s| is)(?: your)?[^:\n]*:\s*)/i, '')
      .replace(/^(Assistant:\s*)/i, '')
      .split('\n').map(l => l.trim()).filter(Boolean).join(' ')
      .trim();

    if (!text || text.length < 10) {
      return res.status(200).json({ summary: null, source: 'empty' });
    }

    return res.status(200).json({ summary: text, source: 'mistral-7b' });

  } catch (err) {
    console.error('ai-summary error:', err.message);
    return res.status(500).json({ error: err.message });
  }
}

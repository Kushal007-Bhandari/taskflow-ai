// api/ai-summary.js
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const HF_TOKEN = process.env.HF_TOKEN;
  if (!HF_TOKEN) return res.status(200).json({ summary: 'AI unavailable: HF_TOKEN not configured.', source: 'no-token' });

  try {
    const { prompt, mode = 'summary' } = req.body || {};
    if (!prompt) return res.status(400).json({ error: 'No prompt provided' });

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
            max_new_tokens:     mode === 'chat' ? 250 : 300,
            temperature:        mode === 'chat' ? 0.6  : 0.75,
            top_p:              0.92,
            repetition_penalty: 1.1,
            do_sample:          true,
            return_full_text:   false,
          },
        }),
      }
    );

    if (!hfRes.ok) {
      const errBody = await hfRes.text();
      console.error(`HF API error ${hfRes.status}:`, errBody.slice(0, 200));
      if (hfRes.status === 503) return res.status(503).json({ error: 'Model loading, retry in 20s', retry: true });
      throw new Error(`HF ${hfRes.status}`);
    }

    const hfData = await hfRes.json();
    let text = Array.isArray(hfData)
      ? (hfData[0]?.generated_text || '')
      : (hfData.generated_text || '');

    text = text
      .replace(/\[INST\][\s\S]*?\[\/INST\]/g, '')
      .replace(/<s>|<\/s>|\[\/INST\]/g, '')
      .replace(/^(Sure[!,.]?\s*|Certainly[!,.]?\s*|Of course[!,.]?\s*)/i, '')
      .replace(/^(Here'?(?:s| is)(?: your)?[^:\n]*:\s*)/i, '')
      .split('\n').map(l => l.trim()).filter(Boolean).join(' ')
      .trim();

    if (!text || text.length < 15) throw new Error('Response too short');

    return res.status(200).json({ summary: text, source: 'mistral-7b' });

  } catch (err) {
    console.error('ai-summary error:', err.message);
    return res.status(500).json({ error: err.message });
  }
}

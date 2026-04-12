// netlify/functions/ai-summary.js
// Handles both AI summary and chat via Mistral-7B-Instruct on Hugging Face

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Content-Type': 'application/json',
  };

  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };
  if (event.httpMethod !== 'POST')    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };

  const HF_TOKEN = process.env.HF_TOKEN;
  if (!HF_TOKEN) {
    console.warn('HF_TOKEN not set — using fallback');
    return { statusCode: 200, headers, body: JSON.stringify({ summary: 'AI unavailable: HF_TOKEN not configured.', source: 'no-token' }) };
  }

  try {
    const { prompt, mode = 'summary' } = JSON.parse(event.body || '{}');
    if (!prompt) return { statusCode: 400, headers, body: JSON.stringify({ error: 'No prompt provided' }) };

    // ── Call Mistral-7B via HF Inference API ─────────────────
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
            top_k:              50,
            repetition_penalty: 1.1,
            do_sample:          true,
            return_full_text:   false,
          },
        }),
      }
    );

    // ── Handle non-200 from HF ────────────────────────────────
    if (!hfRes.ok) {
      const errBody = await hfRes.text();
      console.error(`HF API error ${hfRes.status}:`, errBody.slice(0, 300));

      // Model loading — tell client to retry
      if (hfRes.status === 503) {
        return { statusCode: 503, headers, body: JSON.stringify({ error: 'Model loading, please retry in 20s', retry: true }) };
      }
      throw new Error(`HF ${hfRes.status}`);
    }

    const hfData = await hfRes.json();

    // ── Extract text ──────────────────────────────────────────
    let text = '';
    if (Array.isArray(hfData)) {
      text = hfData[0]?.generated_text || '';
    } else if (typeof hfData === 'object') {
      text = hfData.generated_text || hfData[0]?.generated_text || '';
    }

    // ── Clean up Mistral artifacts ────────────────────────────
    text = text
      .replace(/\[INST\][\s\S]*?\[\/INST\]/g, '')   // remove any echoed prompt
      .replace(/<s>|<\/s>|\[\/INST\]/g, '')           // special tokens
      .replace(/^(Sure[!,.]?\s*|Certainly[!,.]?\s*|Of course[!,.]?\s*|Absolutely[!,.]?\s*)/i, '')
      .replace(/^(Here'?(?:s| is)(?: your)?[^:\n]*:\s*)/i, '')
      .replace(/^(Assistant:\s*)/i, '')
      .trim();

    // Remove repeated newlines, join into readable text
    text = text.split('\n').map(l => l.trim()).filter(Boolean).join(' ');

    console.log(`[${mode}] Generated ${text.length} chars`);

    if (!text || text.length < 15) {
      throw new Error('Response too short');
    }

    return { statusCode: 200, headers, body: JSON.stringify({ summary: text, source: 'mistral-7b' }) };

  } catch (err) {
    console.error('ai-summary error:', err.message);
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};

// api/ai-summary.js — uses Groq (Llama 3.3 70B) instead of Hugging Face
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const GROQ_KEY = process.env.GROQ_API_KEY;
  if (!GROQ_KEY) return res.status(200).json({ summary: null, source: 'no-key' });

  try {
    const { mode = 'summary', context, name, userMessage } = req.body || {};

    const isChat = mode === 'chat';

    // Build clean messages for Groq's chat format
    const systemPrompt = isChat
      ? `You are a smart, friendly personal assistant for ${name}. You have access to their task data below. Answer naturally and conversationally — like a knowledgeable friend. You can discuss anything, not just tasks. Use their task data when relevant.

TASK DATA:
${context}`
      : `You are ${name}'s personal productivity coach. Write a warm, personal 4-5 sentence productivity message using ONLY the task data below. Mention ${name} by name, reference 2-3 actual task titles in quotes, use real numbers, and give 1 specific actionable tip. Sound like a supportive friend, not a robot.

TASK DATA:
${context}`;

    const userContent = isChat ? userMessage : `Write ${name}'s productivity summary now.`;

    // Include conversation history for chat
    const history = (req.body?.history || []).slice(-8).map(m => ({
      role: m.role === 'user' ? 'user' : 'assistant',
      content: m.content,
    }));

    const messages = [
      { role: 'system', content: systemPrompt },
      ...history,
      { role: 'user', content: userContent },
    ];

    const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${GROQ_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages,
        max_tokens:  isChat ? 400 : 300,
        temperature: isChat ? 0.8 : 0.75,
        top_p: 0.92,
      }),
    });

    if (!groqRes.ok) {
      const err = await groqRes.text();
      console.error('Groq error:', groqRes.status, err.slice(0, 200));
      return res.status(200).json({ summary: null, source: 'groq-error', code: groqRes.status });
    }

    const data = await groqRes.json();
    const text = data.choices?.[0]?.message?.content?.trim() || '';

    console.log(`[${mode}] Groq response: ${text.length} chars`);

    if (!text || text.length < 10) {
      return res.status(200).json({ summary: null, source: 'empty' });
    }

    return res.status(200).json({ summary: text, source: 'groq-llama3' });

  } catch (err) {
    console.error('ai-summary error:', err.message);
    return res.status(500).json({ error: err.message, summary: null });
  }
}

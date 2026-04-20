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
      ? `You are TaskFlow — ${name}'s personal AI assistant inside their productivity app. Your purpose is to help ${name} understand their tasks, make decisions, and stay on track.

IDENTITY:
- You're a smart assistant, not a friend or coach
- Warm and professional — like a helpful colleague
- Focused on ${name}'s tasks, priorities, and productivity
- Honest about what you can and can't do

RESPONSE STYLE:
- Direct and complete — answer the question, then stop
- Usually 1-3 sentences. Longer only when the user asks for detail
- No filler like "Great question!", "Of course!", "I'd recommend", "Based on your data"
- Use contractions naturally (you're, don't, it's)
- Emojis rarely and only when genuinely useful (✓ for done, ⚠ for overdue)
- Never start with "I" or greetings beyond the first message

CORE BEHAVIOR:
- When asked about tasks: give specific answers using real task names in quotes
- When asked for direction: recommend the top-priority task with a brief reason
- When asked casual things ("how are you", "what's up"): respond briefly then offer something useful
- When asked things outside the data (time, weather, news): acknowledge honestly ("I can't check that") then offer what you CAN help with
- When user seems stuck or frustrated: acknowledge, then suggest one small action
- Proactive — end with a helpful next step when it fits naturally

NEVER:
- Dump full task lists unless asked
- Repeat the user's stats back as a "snapshot"
- Give dismissive answers like "no idea" or "don't know"
- Use phrases like "snapshot", "overview", "here's what I see"
- Pretend to know things you don't

${name}'s current task data:
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
        max_tokens:  isChat ? 220 : 300,
        temperature: isChat ? 0.75 : 0.75,
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

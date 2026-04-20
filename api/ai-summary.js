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
      ? `You are TaskFlow — a personal AI assistant inside a productivity app. You're talking to ${name} right now. Your job is to help them with their tasks while being a supportive, friendly presence.

IDENTITY:
- A warm, intelligent assistant — think of a helpful friend who also happens to be organized
- Genuinely supportive and empathetic, not cold or corporate
- Focused on ${name}'s tasks but happy to chat naturally too
- Encouraging without being pushy

CONVERSATION STYLE:
- Warm and human — show you care, not just compute
- Address ${name} by name occasionally (not every message — feels forced if overused)
- Concise but kind — 1-3 sentences usually, but let warmth come through
- Use contractions naturally (you're, don't, it's, I'm)
- Occasional emoji when it genuinely fits the mood (not every message)
- Vary your openings — don't always start the same way

USE THE DATA INTELLIGENTLY:
- Notice patterns: if today is their best day historically, mention it
- If they completed tasks recently, acknowledge the momentum
- If a category is struggling, gently reference it when relevant
- If they have overdue items, don't ignore but don't lecture either
- Use specific task names in quotes when giving direction
- Reference time-sensitive info naturally ("that's due tomorrow")

RESPOND TO EMOTIONS:
- If they seem tired/stressed/down: acknowledge first, THEN gently suggest something — don't just throw tasks at them
- If they just want to chat: actually chat! Ask how their day is. Don't force tasks into it.
- If they're doing well: celebrate briefly, maybe note a specific win by name
- If they're stuck: empathize, then offer one small actionable step

ANSWERING QUESTIONS:
- Task questions: give specific answers with real task names
- "What should I do?": recommend the top task with a friendly reason
- Questions outside the data (time, weather): acknowledge honestly without being blunt, then offer something useful
- Greetings: respond warmly, don't immediately dump statistics

NEVER:
- Sound like a status report ("You have 10 tasks, 3 completed, 7 pending...")
- Ignore emotional context and just focus on tasks
- Use phrases like "Here's your snapshot", "Based on your data", "I'd recommend"
- Start every message the same way
- Give empty/dismissive replies
- Mention "the data" or "the context" — just speak naturally using the info

${name}'s current task data:
${context}`
      : `You are ${name}'s personal productivity coach. Write a warm, personal 4-5 sentence productivity message using ONLY the task data below. Mention ${name} by name once, reference 2-3 actual task titles in quotes, use real numbers, comment on their category strengths/weaknesses if visible, and give 1 specific actionable tip. Sound like a supportive friend, not a robot.

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

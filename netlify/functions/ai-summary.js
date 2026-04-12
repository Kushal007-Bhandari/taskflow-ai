// netlify/functions/ai-summary.js
// Calls Hugging Face Inference API — no model download, runs server-side

const { neon } = require('@neondatabase/serverless');

const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json',
};

const HF_MODEL = 'mistralai/Mistral-7B-Instruct-v0.3';

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };
  if (event.httpMethod !== 'POST') return res(405, { error: 'Method not allowed' });

  // Verify session
  const sql   = neon(process.env.DATABASE_URL);
  const token = event.headers.authorization?.replace('Bearer ', '');
  if (!token) return res(401, { error: 'Unauthorized' });

  const [session] = await sql`
    SELECT user_id FROM sessions WHERE token = ${token} AND expires_at > NOW()
  `;
  if (!session) return res(401, { error: 'Invalid session' });

  const { todos, stats, range } = JSON.parse(event.body || '{}');

  // Build a smart prompt
  const prompt = buildPrompt(todos, stats, range);

  // If no HF token configured, return smart fallback
  if (!process.env.HF_TOKEN) {
    return res(200, { summary: smartFallback(todos, stats, range), source: 'fallback' });
  }

  try {
    const hfRes = await fetch(`https://api-inference.huggingface.co/models/${HF_MODEL}`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.HF_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        inputs: prompt,
        parameters: {
          max_new_tokens: 200,
          temperature: 0.7,
          top_p: 0.9,
          repetition_penalty: 1.1,
          return_full_text: false,
        },
      }),
    });

    if (!hfRes.ok) {
      // Model may be loading (503) — return fallback
      const errText = await hfRes.text();
      console.error('HF API error:', hfRes.status, errText);
      return res(200, { summary: smartFallback(todos, stats, range), source: 'fallback' });
    }

    const data = await hfRes.json();

    // Extract generated text
    let text = '';
    if (Array.isArray(data) && data[0]?.generated_text) {
      text = data[0].generated_text;
    } else if (data?.generated_text) {
      text = data.generated_text;
    }

    // Clean up — remove any leftover prompt text
    text = text.replace(/\[INST\].*?\[\/INST\]/gs, '').trim();
    text = text.split('[INST]')[0].trim();
    text = text.split('</s>')[0].trim();

    if (!text || text.length < 20) {
      return res(200, { summary: smartFallback(todos, stats, range), source: 'fallback' });
    }

    return res(200, { summary: text, source: 'ai' });

  } catch (err) {
    console.error('AI summary error:', err);
    return res(200, { summary: smartFallback(todos, stats, range), source: 'fallback' });
  }
};

// ── Build prompt ─────────────────────────────────────────────
function buildPrompt(todos = [], stats = {}, range = 30) {
  const rangeName  = range === 7 ? 'week' : range === 30 ? 'month' : range === 90 ? '3 months' : range === 180 ? '6 months' : 'year';
  const total      = parseInt(stats.total) || 0;
  const completed  = parseInt(stats.completed) || 0;
  const overdue    = parseInt(stats.overdue) || 0;
  const rate       = total > 0 ? Math.round(completed / total * 100) : 0;

  // Category breakdown
  const cats = {};
  todos.forEach(t => {
    const c = t.category || 'General';
    if (!cats[c]) cats[c] = { total: 0, done: 0 };
    cats[c].total++;
    if (t.status === 'completed') cats[c].done++;
  });
  const catLines = Object.entries(cats)
    .map(([n, d]) => `  - ${n}: ${d.done}/${d.total} completed`)
    .join('\n');

  const highDone  = todos.filter(t => t.priority === 'high' && t.status === 'completed').length;
  const highTotal = todos.filter(t => t.priority === 'high').length;
  const recentDone = todos.filter(t => t.status === 'completed').slice(0, 5).map(t => t.title).join(', ');

  return `[INST] You are a helpful productivity coach. Analyze this task data and write a warm, specific, 3-sentence productivity summary. Mention actual numbers, highlight wins, and give one actionable tip.

Task data for the past ${rangeName}:
- Created: ${total} tasks, Completed: ${completed} (${rate}% rate)
- Overdue: ${overdue}
- High priority: ${highDone}/${highTotal} completed
- By category:
${catLines || '  - No categories'}
- Recently completed: ${recentDone || 'none yet'}

Write the summary now: [/INST]`;
}

// ── Smart rule-based fallback ─────────────────────────────────
function smartFallback(todos = [], stats = {}, range = 30) {
  const total     = parseInt(stats.total) || 0;
  const completed = parseInt(stats.completed) || 0;
  const overdue   = parseInt(stats.overdue) || 0;
  const rate      = total > 0 ? Math.round(completed / total * 100) : 0;
  const name      = range === 7 ? 'week' : range === 30 ? 'month' : `${range} days`;

  if (total === 0) return `No tasks recorded in this period yet. Start adding tasks to your dashboard and completing them to unlock productivity insights here.`;

  const cats = {};
  todos.forEach(t => {
    const c = t.category || 'General';
    if (!cats[c]) cats[c] = { total: 0, done: 0 };
    cats[c].total++;
    if (t.status === 'completed') cats[c].done++;
  });

  const topCat  = Object.entries(cats).sort((a,b) => b[1].total - a[1].total)[0];
  const bestCat = Object.entries(cats)
    .filter(([,d]) => d.total >= 2)
    .sort((a,b) => (b[1].done/b[1].total) - (a[1].done/a[1].total))[0];

  const highDone = todos.filter(t => t.priority === 'high' && t.status === 'completed').length;

  let s = '';
  if      (rate >= 80) s += `Outstanding work this ${name} — you completed ${completed} of ${total} tasks with a ${rate}% success rate, putting you in top productivity territory. `;
  else if (rate >= 60) s += `Solid effort this ${name} — ${completed} of ${total} tasks completed at a ${rate}% rate. `;
  else if (rate >= 40) s += `You completed ${completed} of ${total} tasks this ${name} (${rate}%) — there's room to push higher. `;
  else                 s += `You tackled ${completed} of ${total} tasks this ${name} with a ${rate}% completion rate. `;

  if (topCat) s += `Your most active area was "${topCat[0]}" with ${topCat[1].total} task${topCat[1].total!==1?'s':''}. `;
  if (highDone > 0) s += `You completed ${highDone} high-priority item${highDone>1?'s':''} — great focus on what matters. `;
  if (overdue > 0)  s += `Watch out — ${overdue} task${overdue>1?'s are':' is'} overdue and needs your attention. `;
  if (bestCat && Math.round(bestCat[1].done/bestCat[1].total*100)===100)
    s += `Perfect 100% completion rate in "${bestCat[0]}" this period!`;

  return s.trim();
}

function res(status, body) {
  return { statusCode: status, headers, body: JSON.stringify(body) };
}

// netlify/functions/ai-summary.js
// Handles both AI summary generation and chat mode

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Content-Type': 'application/json',
  };

  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };

  try {
    const body = JSON.parse(event.body || '{}');
    const { mode = 'summary', prompt, name, context } = body;
    const HF_TOKEN = process.env.HF_TOKEN;

    // ── Try Hugging Face API ──────────────────────────────────
    if (HF_TOKEN && prompt) {
      try {
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
                max_new_tokens: mode === 'chat' ? 200 : 280,
                temperature: mode === 'chat' ? 0.4 : 0.72, // lower temp for chat = less hallucination
                top_p: 0.9,
                repetition_penalty: 1.12,
                do_sample: true,
                return_full_text: false,
              },
            }),
          }
        );

        if (hfRes.ok) {
          const hfData = await hfRes.json();
          let text = Array.isArray(hfData)
            ? (hfData[0]?.generated_text || '')
            : (hfData.generated_text || '');

          // Clean artifacts
          text = text
            .replace(/\[INST\][\s\S]*?\[\/INST\]/g, '')
            .replace(/<s>|<\/s>/g, '')
            .replace(/^(Sure[!,.]?\s*|Of course[!,.]?\s*|Absolutely[!,.]?\s*|Certainly[!,.]?\s*)/i, '')
            .replace(/^(Here'?s?( is)?( your)?[^:]*:\s*)/i, '')
            .split('\n').filter(l => l.trim()).join(' ')
            .trim();

          if (text && text.length > 20) {
            return { statusCode: 200, headers, body: JSON.stringify({ summary: text, source: 'mistral-7b' }) };
          }
        } else {
          console.error('HF error:', hfRes.status, (await hfRes.text()).slice(0, 150));
        }
      } catch (hfErr) {
        console.error('HF fetch error:', hfErr.message);
      }
    }

    // ── Fallback: build a rule-based response ─────────────────
    const { doneTasks = [], openTasks = [], overdueTasks = [], cats = [],
            bestDay, total = 0, completed = 0, overdue = 0, rate = 0,
            rangeLabel = 'this period', userMessage } = body;

    let summary = '';

    if (mode === 'chat' && userMessage) {
      // Rule-based chat fallback
      const q = userMessage.toLowerCase();

      if (q.includes('overdue')) {
        summary = overdueTasks.length === 0
          ? `No overdue tasks — you're on top of everything!`
          : `You have ${overdueTasks.length} overdue task${overdueTasks.length > 1 ? 's' : ''}: ${overdueTasks.slice(0,4).map(t => `"${t.title}"`).join(', ')}.`;
      } else if (q.includes('pending') || q.includes('left')) {
        summary = openTasks.length === 0
          ? `No pending tasks right now — great job!`
          : `You have ${openTasks.length} pending tasks. Top ones: ${openTasks.slice(0,4).map(t => `"${t.title}" (${t.priority})`).join(', ')}.`;
      } else if (q.includes('complet') || q.includes('done')) {
        summary = doneTasks.length === 0
          ? `No completed tasks in this period yet.`
          : `You completed ${doneTasks.length} tasks this period: ${doneTasks.slice(0,4).map(t => `"${t.title}"`).join(', ')}.`;
      } else if (q.includes('high') || q.includes('urgent')) {
        const high = openTasks.filter(t => t.priority === 'high');
        summary = high.length === 0
          ? `No high-priority tasks pending right now.`
          : `${high.length} high-priority task${high.length > 1 ? 's' : ''} pending: ${high.map(t => `"${t.title}"`).join(', ')}.`;
      } else if (q.includes('focus') || q.includes('next') || q.includes('should')) {
        const top = openTasks[0];
        summary = top
          ? `I'd suggest working on "${top.title}" next${top.description ? ` — ${top.description}` : ''}. It's ${top.priority} priority.`
          : `No pending tasks — you're all clear!`;
      } else {
        summary = `Based on your data: ${total} tasks total, ${completed} completed (${rate}%), ${overdue} overdue. Try asking "what's overdue?", "what should I focus on?", or "show pending tasks".`;
      }
    } else {
      // Rule-based summary fallback
      if (total === 0) {
        summary = `Hey ${name}! No tasks recorded ${rangeLabel} yet. Add some tasks to get your first AI-powered productivity insight!`;
      } else {
        const recentNames = doneTasks.slice(0,3).map(t => `"${t.title}"`).join(', ');
        const bestCat = [...cats].sort((a,b) => b.done - a.done)[0];
        const worstCat = cats.filter(c => c.total >= 2).sort((a,b) => a.rate - b.rate)[0];

        if (rate >= 75) summary = `${name}, you're crushing it ${rangeLabel}! `;
        else if (rate >= 50) summary = `Nice work ${rangeLabel}, ${name}! `;
        else summary = `Hey ${name}, here's your ${rangeLabel} recap. `;

        summary += `You completed ${completed} of ${total} tasks (${rate}%)`;
        if (recentNames) summary += ` — including ${recentNames}`;
        summary += `. `;

        if (bestCat?.done > 0) summary += `Your strongest category was "${bestCat.name}" (${bestCat.done} done). `;
        if (overdue > 0) summary += `${overdue} task${overdue > 1 ? 's are' : ' is'} overdue and waiting for you. `;
        if (bestDay) summary += `${bestDay} is your power day — protect it. `;

        if (worstCat && worstCat.rate < 40)
          summary += `💡 Tip: "${worstCat.name}" is only ${worstCat.rate}% done — give it 20 focused minutes tomorrow.`;
        else if (total - completed > 5)
          summary += `💡 Tip: Pick your 3 most important pending tasks and finish those before adding new ones.`;
        else
          summary += `💡 Tip: Keep the momentum — consistency is what separates productive people from the rest!`;
      }
    }

    return { statusCode: 200, headers, body: JSON.stringify({ summary, source: 'fallback' }) };

  } catch (err) {
    console.error('ai-summary error:', err);
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Server error' }) };
  }
};

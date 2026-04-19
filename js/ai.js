// js/ai.js — Full AI module: Summary + Chat
// Builds rich context from all task data, calls Mistral-7B server-side

const AI = {

  // ── Build structured context from all real data ─────────────
  buildContext(statsData, userName, range) {
    const name   = (userName || 'there').split(' ')[0];
    const days   = parseInt(range) || 30;
    const ov     = statsData?.overview || {};
    const DAYS   = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];

    const total     = parseInt(ov.recent_total)     || 0;
    const completed = parseInt(ov.recent_completed) || 0;
    const overdue   = parseInt(ov.overdue)          || 0;
    const rate      = total > 0 ? Math.round(completed / total * 100) : 0;
    const pending   = total - completed;

    const rangeLabel = days <= 7 ? 'last 7 days' : days <= 30 ? 'last 30 days'
      : days <= 90 ? 'last 3 months' : days <= 180 ? 'last 6 months' : 'last year';

    // Category performance
    const cats = (statsData?.categoryBreakdown || []).map(c => ({
      name:  c.name,
      total: parseInt(c.count)     || 0,
      done:  parseInt(c.completed) || 0,
      rate:  c.count > 0 ? Math.round(c.completed / c.count * 100) : 0,
    }));

    // Best day of week
    const dayData = (statsData?.byDayOfWeek || []).sort((a,b) => b.count - a.count);
    const bestDay = dayData[0] ? DAYS[parseInt(dayData[0].dow)] : null;

    // All tasks
    const all        = statsData?.allTodosForAI || statsData?.recentTodos || [];
    const doneTasks  = all.filter(t => t.status === 'completed');
    const openTasks  = all.filter(t => t.status !== 'completed' && t.status !== 'cancelled');
    const overdueT   = openTasks.filter(t => t.due_date && new Date(t.due_date) < new Date());

    // Format task line
    const fmt = (t) => {
      const desc = t.description?.trim();
      const due  = t.due_date ? `, due ${String(t.due_date).split('T')[0]}` : '';
      const ov2  = t.due_date && new Date(t.due_date) < new Date() && t.status !== 'completed' ? ' [OVERDUE]' : '';
      return `  • "${t.title}"${desc ? ` — ${desc}` : ''} (${t.priority || 'medium'}${due}${ov2})`;
    };

    const lines = [
      `USER: ${name} | PERIOD: ${rangeLabel}`,
      `STATS: ${total} tasks · ${completed} completed (${rate}%) · ${pending} pending · ${overdue} overdue`,
    ];

    if (cats.length) {
      lines.push(`CATEGORIES: ${cats.map(c => `${c.name}: ${c.done}/${c.total} (${c.rate}%)`).join(', ')}`);
    }
    if (bestDay) lines.push(`BEST DAY: ${bestDay}`);

    if (doneTasks.length) {
      lines.push(`\nCOMPLETED (${doneTasks.length}):`);
      doneTasks.slice(0, 12).forEach(t => lines.push(fmt(t)));
    }
    if (openTasks.length) {
      lines.push(`\nPENDING (${openTasks.length}):`);
      openTasks.slice(0, 10).forEach(t => lines.push(fmt(t)));
    }
    if (overdueT.length) {
      lines.push(`\nOVERDUE (${overdueT.length}):`);
      overdueT.forEach(t => lines.push(fmt(t)));
    }

    return { context: lines.join('\n'), name, rangeLabel, total, completed, overdue, rate, pending, cats, bestDay, doneTasks, openTasks, overdueT };
  },

  // ── Generate Productivity Summary ─────────────────────────
  async summarize(recentTodos, overviewLegacy, range, onProgress, statsData, userName) {
    onProgress?.('Reading your task data...');

    const ctx = AI.buildContext(statsData, userName, range);
    const { context, name } = ctx;

    onProgress?.('Crafting your personal summary...');

    const prompt = `<s>[INST] You are ${name}'s personal productivity coach. Write a warm, personal 4-5 sentence message using ONLY the data below. Requirements: address ${name} by name, mention 2-3 actual task titles in quotes, use real numbers, give 1 specific actionable tip based on their weakest area. Sound like a supportive friend, not a robot. Never invent data.

TASK DATA:
${context}

Write ${name}'s productivity message now: [/INST]`;

    try {
      const res = await fetch('/api/ai-summary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${Auth.getToken()}` },
        body: JSON.stringify({ prompt, mode: 'summary', context, name, ...AI._extras(ctx) }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        if (res.status === 503) throw new Error('503');
        throw new Error(d.error || 'API error');
      }
      const data = await res.json();
      if (!data.summary) throw new Error('Empty response');
      return data.summary;
    } catch(err) {
      if (err.message === '503') throw err;
      console.warn('AI API failed, using fallback:', err.message);
      return AI._fallbackSummary(ctx);
    }
  },

  // ── Chat ──────────────────────────────────────────────────
  async chat(userMessage, history, statsData, userName) {
    const ctx = AI.buildContext(statsData, userName, statsData?.range || 30);
    const { context, name } = ctx;

    const turns = history.slice(-8).map(m =>
      m.role === 'user' ? `${name}: ${m.content}` : `Assistant: ${m.content}`
    ).join('\n');

    const prompt = `<s>[INST] You are a helpful productivity assistant for ${name}. Answer using ONLY the task data below. Be specific and friendly. For greetings give a quick friendly summary. If asked something not in the data, say so honestly.

TASK DATA:
${context}

${turns ? `CONVERSATION:\n${turns}\n` : ''}${name} says: ${userMessage} [/INST]`;

    try {
      const res = await fetch('/api/ai-summary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${Auth.getToken()}` },
        body: JSON.stringify({ prompt, mode: 'chat', context, name, userMessage }),
      });
      if (!res.ok) throw new Error('API error');
      const data = await res.json();
      if (!data.summary) throw new Error('Empty');
      return data.summary;
    } catch(err) {
      return AI._fallbackChat(userMessage, ctx);
    }
  },

  _extras(ctx) {
    return {
      total: ctx.total, completed: ctx.completed, overdue: ctx.overdue,
      rate: ctx.rate, pending: ctx.pending, bestDay: ctx.bestDay,
      cats: ctx.cats,
      doneTasks: ctx.doneTasks.slice(0,8).map(t => ({ title: t.title, priority: t.priority })),
      openTasks: ctx.openTasks.slice(0,8).map(t => ({ title: t.title, priority: t.priority })),
    };
  },

  // ── Fallback Summary ───────────────────────────────────────
  _fallbackSummary(ctx) {
    const { name, total, completed, pending, overdue, rate, cats, bestDay, doneTasks, rangeLabel } = ctx;
    if (total === 0) return `Hey ${name}! No tasks recorded ${rangeLabel} yet — add some tasks on your dashboard to get your first AI productivity insight!`;

    const topDone = doneTasks.slice(0,3).map(t => `"${t.title}"`).join(', ');
    const bestCat = [...cats].sort((a,b) => b.done - a.done)[0];
    const worstCat = cats.filter(c => c.total >= 2).sort((a,b) => a.rate - b.rate)[0];

    let msg = rate >= 75 ? `${name}, you're crushing it ${rangeLabel}! `
            : rate >= 50 ? `Great progress ${rangeLabel}, ${name}! `
            : rate >= 25 ? `Hey ${name}, you made progress ${rangeLabel}. `
            : `${name}, ${rangeLabel} was a tough one. `;

    msg += `You completed ${completed} of ${total} tasks (${rate}%)`;
    if (topDone) msg += ` — including ${topDone}`;
    msg += '. ';
    if (bestCat?.done > 0) msg += `Your "${bestCat.name}" category was your strongest area. `;
    if (overdue > 0) msg += `You have ${overdue} overdue task${overdue > 1 ? 's' : ''} — tackle those first. `;
    if (bestDay) msg += `${bestDay} is your most productive day — protect that time. `;
    if (worstCat && worstCat.rate < 40) msg += `💡 Tip: "${worstCat.name}" tasks are only ${worstCat.rate}% done — spend 20 focused minutes on them tomorrow.`;
    else if (pending > 3) msg += `💡 Tip: Pick your top 3 from ${pending} pending tasks and focus only on those tomorrow.`;
    else msg += `💡 Keep the momentum — consistency beats intensity every time!`;
    return msg;
  },

  // ── Fallback Chat ──────────────────────────────────────────
  _fallbackChat(question, ctx) {
    const { name, total, completed, overdue, rate, doneTasks, openTasks, overdueT, cats, bestDay, rangeLabel } = ctx;
    const q = question.toLowerCase().trim();

    if (/^(hi|hey|hello|howdy|sup|yo|good)/.test(q)) {
      if (total === 0) return `Hey ${name}! 👋 No tasks yet — add some from the dashboard and come back!`;
      return `Hey ${name}! 👋 Here's your snapshot: ${total} tasks ${rangeLabel}, ${completed} completed (${rate}%), ${openTasks.length} still pending${overdue > 0 ? `, ${overdue} overdue` : ''}. What would you like to know?`;
    }
    if (/overdue|late|past due|missed/.test(q)) {
      if (!overdueT.length) return `Great news ${name} — no overdue tasks! 🎉`;
      return `You have ${overdueT.length} overdue task${overdueT.length > 1 ? 's' : ''}: ${overdueT.map(t => `"${t.title}" (${t.priority})`).join(', ')}. Tackle the highest priority one first!`;
    }
    if (/pending|remaining|left|not done|incomplete/.test(q)) {
      if (!openTasks.length) return `Everything's done ${name}! 🎉`;
      return `${openTasks.length} pending: ${openTasks.slice(0,5).map(t => `"${t.title}" (${t.priority})`).join(', ')}${openTasks.length > 5 ? ` and ${openTasks.length - 5} more` : ''}.`;
    }
    if (/complet|done|finish|achiev/.test(q)) {
      if (!doneTasks.length) return `No completed tasks ${rangeLabel} yet — go mark something done!`;
      return `${completed} completed ${rangeLabel}: ${doneTasks.slice(0,4).map(t => `"${t.title}"`).join(', ')}.`;
    }
    if (/high|urgent|important/.test(q)) {
      const high = openTasks.filter(t => t.priority === 'high');
      if (!high.length) return `No high-priority tasks pending right now!`;
      return `${high.length} high-priority pending: ${high.map(t => `"${t.title}"`).join(', ')}.`;
    }
    if (/focus|today|next|should i|start|work on/.test(q)) {
      const score = (t) => {
        const PRI = { high:3, medium:2, low:1 };
        const pri = (PRI[t.priority]||1)*3;
        const today = new Date(); today.setHours(0,0,0,0);
        let ov2 = 0;
        if (t.due_date) { const due = new Date(t.due_date); due.setHours(0,0,0,0); const d = Math.floor((today-due)/86400000); if (d>0) ov2=d*2; }
        const age = Math.min(Math.floor((today-new Date(t.created_at||Date.now()))/86400000)*0.5,5);
        return pri+ov2+age;
      };
      const top = [...openTasks].sort((a,b)=>score(b)-score(a))[0];
      if (!top) return `No pending tasks ${name} — you're all clear!`;
      const desc = top.description?.trim();
      return `Focus on "${top.title}" first${desc?` — ${desc}`:''}. It's ${top.priority} priority with a score of ${Math.round(score(top))}.`;
    }
    if (/rate|percent|score|how.*doing|progress/.test(q)) {
      return `Your completion rate ${rangeLabel} is ${rate}% (${completed}/${total}). ${rate>=70?'🔥 Excellent!':rate>=50?'👍 Good progress!':'💪 Keep pushing!'}`;
    }
    if (/categor/.test(q)) {
      if (!cats.length) return `No category data available yet.`;
      return `Category breakdown: ${cats.map(c=>`${c.name}: ${c.done}/${c.total} (${c.rate}%)`).join(', ')}.`;
    }
    // Search for specific task
    const found = [...doneTasks,...openTasks].find(t => t.title?.toLowerCase().includes(q));
    if (found) {
      const desc = found.description?.trim();
      return `"${found.title}": ${desc||'No description.'} Status: ${found.status}, Priority: ${found.priority}${found.due_date?`, Due: ${String(found.due_date).split('T')[0]}`:''}`;
    }
    return `${name}, you have ${total} tasks ${rangeLabel} with ${rate}% completion. Try: "What's overdue?", "What should I focus on?", "Show high priority tasks", or "How am I doing?"`;
  },
};

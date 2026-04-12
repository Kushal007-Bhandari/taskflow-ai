// js/ai.js — AI Summary + Chat
// Uses Hugging Face Inference API (Mistral-7B-Instruct) server-side

const AI = {

  // ── Build the full task context string ─────────────────────
  buildContext(allTodos, statsData, userName, range) {
    const name  = (userName || 'User').split(' ')[0];
    const DAYS  = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
    const days  = parseInt(range) || 30;

    const total     = parseInt(statsData?.overview?.recent_total)     || 0;
    const completed = parseInt(statsData?.overview?.recent_completed) || 0;
    const overdue   = parseInt(statsData?.overview?.overdue)          || 0;
    const rate      = total > 0 ? Math.round(completed / total * 100) : 0;
    const pending   = total - completed;

    const rangeLabel = days <= 7 ? 'past 7 days' : days <= 30 ? 'past 30 days'
      : days <= 90 ? 'past 3 months' : days <= 180 ? 'past 6 months' : 'past year';

    // Category stats
    const cats = (statsData?.categoryBreakdown || []).map(c => ({
      name:  c.name,
      total: parseInt(c.count)     || 0,
      done:  parseInt(c.completed) || 0,
      rate:  c.count > 0 ? Math.round(c.completed / c.count * 100) : 0,
    }));

    // Best day of week
    const dayData   = (statsData?.byDayOfWeek || []).sort((a,b) => b.count - a.count);
    const bestDay   = dayData[0] ? DAYS[parseInt(dayData[0].dow)] : null;

    // All todos split by status
    const allList   = allTodos || statsData?.allTodosForAI || [];
    const doneTasks = allList.filter(t => t.status === 'completed');
    const openTasks = allList.filter(t => t.status !== 'completed' && t.status !== 'cancelled');
    const overdueTasks = openTasks.filter(t => t.due_date && new Date(t.due_date) < new Date());

    // Format task with title + description
    const fmtTask = (t) => {
      const desc = t.description?.trim();
      const due  = t.due_date ? ` | due ${new Date(t.due_date).toLocaleDateString('en-CA')}` : '';
      const over = t.due_date && new Date(t.due_date) < new Date() ? ' [OVERDUE]' : '';
      return `• "${t.title}"${desc ? ` — ${desc}` : ''} (${t.priority || 'medium'} priority, ${t.category || 'General'}${due}${over})`;
    };

    const lines = [
      `=== TASKFLOW AI — TASK DATA FOR ${name.toUpperCase()} ===`,
      `Period: ${rangeLabel}`,
      ``,
      `SUMMARY STATS:`,
      `Total tasks: ${total} | Completed: ${completed} (${rate}%) | Pending: ${pending} | Overdue: ${overdue}`,
      ``,
    ];

    if (cats.length) {
      lines.push(`CATEGORY PERFORMANCE:`);
      cats.forEach(c => lines.push(`  ${c.name}: ${c.done}/${c.total} done (${c.rate}%)`));
      lines.push(``);
    }

    if (bestDay) lines.push(`BEST DAY: ${bestDay} has the most completions`);

    if (doneTasks.length) {
      lines.push(``, `COMPLETED TASKS (${doneTasks.length}):`);
      doneTasks.slice(0, 15).forEach(t => lines.push(fmtTask(t)));
    }

    if (openTasks.length) {
      lines.push(``, `PENDING / IN PROGRESS TASKS (${openTasks.length}):`);
      openTasks.slice(0, 15).forEach(t => lines.push(fmtTask(t)));
    }

    if (overdueTasks.length) {
      lines.push(``, `OVERDUE TASKS (${overdueTasks.length}):`);
      overdueTasks.forEach(t => lines.push(fmtTask(t)));
    }

    lines.push(``, `=== END OF DATA ===`);

    return { context: lines.join('\n'), name, rangeLabel, total, completed, overdue, rate, pending, cats, bestDay, doneTasks, openTasks, overdueTasks };
  },

  // ── Generate Productivity Summary ─────────────────────────
  async summarize(recentTodos, overview, range, onProgress, statsData, userName) {
    onProgress?.('Reading your task data...');

    const allTodos = statsData?.allTodosForAI || recentTodos || [];
    const { context, name, rangeLabel, total, completed, overdue, rate,
            cats, bestDay, doneTasks, openTasks, overdueTasks } = AI.buildContext(allTodos, statsData, userName, range);

    onProgress?.('Crafting your personal summary...');

    const prompt = `<s>[INST] You are a warm, insightful productivity coach. Write a personal productivity message for ${name} using ONLY the data below — do not invent anything.

Rules:
- Address ${name} by name
- Mention 2-3 specific task titles (use quotes)
- Reference actual numbers
- Be warm, human, conversational — like a friend who coaches them
- Give 1 specific actionable tip based on their weakest area
- Maximum 5 sentences
- NEVER make up tasks or data not in the context

${context}

Write ${name}'s personal productivity message: [/INST]`;

    try {
      const res = await fetch('/api/ai-summary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'summary',
          prompt,
          context,
          name, rangeLabel, total, completed, overdue, rate,
          cats, bestDay,
          doneTasks: doneTasks.slice(0,10).map(t => ({ title: t.title, description: t.description, priority: t.priority, category: t.category })),
          openTasks: openTasks.slice(0,10).map(t => ({ title: t.title, description: t.description, priority: t.priority, category: t.category })),
          overdueTasks: overdueTasks.map(t => ({ title: t.title, priority: t.priority })),
        }),
      });
      if (!res.ok) throw new Error('API error');
      const data = await res.json();
      if (!data.summary) throw new Error('Empty response');
      return data.summary;
    } catch(err) {
      return AI._fallbackSummary({ name, total, completed, pending: total - completed, overdue, rate, cats, bestDay, doneTasks, openTasks, rangeLabel });
    }
  },

  // ── Chat with AI about tasks ───────────────────────────────
  async chat(userMessage, history, statsData, allTodos, userName) {
    const { context, name } = AI.buildContext(allTodos, statsData, userName, statsData?.range || 30);

    // Build conversation history for Mistral format
    const historyStr = history.slice(-6).map(m =>
      m.role === 'user' ? `User: ${m.content}` : `Assistant: ${m.content}`
    ).join('\n');

    const prompt = `<s>[INST] You are a helpful productivity assistant for ${name}. You have access to their complete task data below. Answer questions ONLY based on this data — if information is not in the data, say "I don't have that information in your task data." Be concise, friendly, and specific. Never make up tasks or statistics.

${context}

${historyStr ? `Previous conversation:\n${historyStr}\n` : ''}
${name}'s question: ${userMessage} [/INST]`;

    try {
      const res = await fetch('/api/ai-summary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'chat',
          prompt,
          context,
          name,
          userMessage,
          history: history.slice(-6),
        }),
      });
      if (!res.ok) throw new Error('API error');
      const data = await res.json();
      if (!data.summary) throw new Error('Empty');
      return data.summary;
    } catch(err) {
      // Offline chat fallback — answer from data directly
      return AI._fallbackChat(userMessage, statsData, allTodos, name);
    }
  },

  // ── Fallback summary (no API) ─────────────────────────────
  _fallbackSummary({ name, total, completed, pending, overdue, rate, cats, bestDay, doneTasks, openTasks, rangeLabel }) {
    if (total === 0) return `Hey ${name}! No tasks recorded ${rangeLabel} yet — add some tasks to your dashboard and come back for your first AI-powered productivity insight!`;

    const bestCat = [...cats].sort((a,b) => b.done - a.done)[0];
    const worstCat = cats.filter(c => c.total >= 2).sort((a,b) => a.rate - b.rate)[0];
    const recentDone = doneTasks.slice(0,3).map(t => `"${t.title}"`).join(', ');

    let msg = rate >= 75
      ? `${name}, you're on fire ${rangeLabel}! `
      : rate >= 50 ? `Good progress ${rangeLabel}, ${name}! `
      : `Hey ${name}, let's look at ${rangeLabel}. `;

    msg += `You completed ${completed} of ${total} tasks (${rate}%)`;
    if (recentDone) msg += ` — including ${recentDone}`;
    msg += `. `;

    if (bestCat?.done > 0) msg += `Your "${bestCat.name}" category was your strongest area with ${bestCat.done} tasks done. `;
    if (overdue > 0) msg += `You have ${overdue} overdue task${overdue > 1 ? 's' : ''} that need your attention. `;
    if (bestDay) msg += `${bestDay} is your most productive day — use it wisely. `;

    if (worstCat && worstCat.rate < 40) msg += `💡 Tip: Spend 20 focused minutes on "${worstCat.name}" tasks tomorrow — they're only ${worstCat.rate}% done.`;
    else if (pending > 5) msg += `💡 Tip: Pick your top 3 pending tasks and ignore the rest until they're done.`;
    else msg += `💡 Tip: Keep your streak going — consistency beats intensity every time!`;

    return msg;
  },

  // ── Fallback chat (no API) ────────────────────────────────
  _fallbackChat(question, statsData, allTodos, name) {
    const q = question.toLowerCase();
    const all = allTodos || statsData?.allTodosForAI || [];
    const open = all.filter(t => t.status !== 'completed' && t.status !== 'cancelled');
    const done = all.filter(t => t.status === 'completed');
    const overdue = open.filter(t => t.due_date && new Date(t.due_date) < new Date());

    if (q.includes('overdue')) {
      if (!overdue.length) return `Good news ${name} — you have no overdue tasks right now! 🎉`;
      return `You have ${overdue.length} overdue task${overdue.length > 1 ? 's' : ''}: ${overdue.slice(0,5).map(t => `"${t.title}"`).join(', ')}. Tackle the highest priority one first!`;
    }
    if (q.includes('pending') || q.includes('left') || q.includes('remaining')) {
      if (!open.length) return `You have no pending tasks right now — everything's done! 🎉`;
      return `You have ${open.length} pending task${open.length > 1 ? 's' : ''}: ${open.slice(0,5).map(t => `"${t.title}" (${t.priority})`).join(', ')}${open.length > 5 ? ` and ${open.length - 5} more` : ''}.`;
    }
    if (q.includes('complet') || q.includes('done') || q.includes('finish')) {
      if (!done.length) return `No completed tasks in this period yet — go mark something done!`;
      return `You've completed ${done.length} task${done.length > 1 ? 's' : ''} in this period. Recent ones: ${done.slice(0,4).map(t => `"${t.title}"`).join(', ')}.`;
    }
    if (q.includes('high priority') || q.includes('urgent') || q.includes('important')) {
      const high = open.filter(t => t.priority === 'high');
      if (!high.length) return `No high-priority tasks pending right now — great job staying on top of them!`;
      return `You have ${high.length} high-priority task${high.length > 1 ? 's' : ''} pending: ${high.map(t => `"${t.title}"`).join(', ')}.`;
    }
    if (q.includes('categor')) {
      const cats = statsData?.categoryBreakdown || [];
      if (!cats.length) return `I don't have category data loaded right now.`;
      return `Your categories: ${cats.map(c => `${c.name} (${c.completed}/${c.count} done)`).join(', ')}.`;
    }
    if (q.includes('rate') || q.includes('percent') || q.includes('%') || q.includes('score')) {
      const ov = statsData?.overview;
      const r = ov?.recent_total > 0 ? Math.round(ov.recent_completed / ov.recent_total * 100) : 0;
      return `Your completion rate this period is ${r}% — ${r >= 70 ? 'excellent!' : r >= 50 ? 'good, keep pushing.' : 'there is room to improve.'}`;
    }
    if (q.includes('next') || q.includes('should i') || q.includes('focus') || q.includes('today')) {
      const topTask = open.sort((a,b) => {
        const pw = { high: 3, medium: 2, low: 1 };
        const ov = (t) => t.due_date && new Date(t.due_date) < new Date() ? 1 : 0;
        return (pw[b.priority] || 0) + ov(b) - ((pw[a.priority] || 0) + ov(a));
      })[0];
      if (!topTask) return `No pending tasks — you're all clear!`;
      return `I'd suggest working on "${topTask.title}" next${topTask.description ? ` — ${topTask.description}` : ''}. It's ${topTask.priority} priority${topTask.due_date ? ` and due on ${new Date(topTask.due_date).toLocaleDateString()}` : ''}.`;
    }

    // Generic fallback
    const ov = statsData?.overview;
    return `Based on your task data: ${ov?.recent_total || 0} total tasks, ${ov?.recent_completed || 0} completed, ${ov?.overdue || 0} overdue. Ask me something specific like "what's overdue?", "what should I focus on?", or "show my pending tasks."`;
  },
};

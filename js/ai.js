// js/ai.js — AI Summary + Chat powered by Mistral-7B via Hugging Face

const AI = {

  // ── Build concise context (fits Mistral context window) ────
  buildContext(statsData, allTodos, userName, range) {
    const name  = (userName || 'User').split(' ')[0];
    const days  = parseInt(range) || 30;
    const ov    = statsData?.overview || {};
    const DAYS  = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];

    const total     = parseInt(ov.recent_total)     || 0;
    const completed = parseInt(ov.recent_completed) || 0;
    const overdue   = parseInt(ov.overdue)          || 0;
    const rate      = total > 0 ? Math.round(completed / total * 100) : 0;
    const pending   = total - completed;

    const rangeLabel = days <= 7 ? 'last 7 days' : days <= 30 ? 'last 30 days'
      : days <= 90 ? 'last 3 months' : days <= 180 ? 'last 6 months' : 'last year';

    // Categories
    const cats = (statsData?.categoryBreakdown || []).map(c =>
      `${c.name}: ${c.completed}/${c.count} done`
    ).join(', ');

    // Best day
    const dayData = (statsData?.byDayOfWeek || []).sort((a,b) => b.count - a.count);
    const bestDay = dayData[0] ? DAYS[parseInt(dayData[0].dow)] : null;

    // All tasks with title + description
    const all = (allTodos || statsData?.allTodosForAI || statsData?.recentTodos || []);

    const fmt = (t) => {
      const desc = t.description?.trim();
      const due  = t.due_date ? `, due ${t.due_date}` : '';
      const over = t.due_date && new Date(t.due_date) < new Date() && t.status !== 'completed' ? ' [OVERDUE]' : '';
      return `  - "${t.title}"${desc ? `: ${desc}` : ''} [${t.priority || 'medium'} priority, ${t.category || 'General'}${due}${over}]`;
    };

    const doneTasks    = all.filter(t => t.status === 'completed');
    const openTasks    = all.filter(t => t.status !== 'completed' && t.status !== 'cancelled');
    const overdueTasks = openTasks.filter(t => t.due_date && new Date(t.due_date) < new Date());

    const lines = [
      `USER: ${name} | PERIOD: ${rangeLabel}`,
      `STATS: ${total} total, ${completed} completed (${rate}%), ${pending} pending, ${overdue} overdue`,
      cats ? `CATEGORIES: ${cats}` : '',
      bestDay ? `BEST DAY: ${bestDay}` : '',
    ].filter(Boolean);

    if (doneTasks.length > 0) {
      lines.push(`\nCOMPLETED (${doneTasks.length}):`);
      doneTasks.slice(0, 12).forEach(t => lines.push(fmt(t)));
    }

    if (openTasks.length > 0) {
      lines.push(`\nPENDING/IN-PROGRESS (${openTasks.length}):`);
      openTasks.slice(0, 12).forEach(t => lines.push(fmt(t)));
    }

    return {
      context: lines.join('\n'),
      name, rangeLabel, total, completed, overdue, rate, pending,
      cats, bestDay, doneTasks, openTasks, overdueTasks,
      allCount: all.length,
    };
  },

  // ── Call HF API ────────────────────────────────────────────
  async _callAPI(prompt, isChat = false) {
    const res = await fetch('/api/ai-summary', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt, mode: isChat ? 'chat' : 'summary' }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (!data.summary || data.summary.length < 10) throw new Error('Empty response');
    return data.summary;
  },

  // ── Generate Productivity Summary ─────────────────────────
  async summarize(recentTodos, overviewLegacy, range, onProgress, statsData, userName) {
    onProgress?.('Reading your task data...');

    const allTodos = statsData?.allTodosForAI || recentTodos || [];
    const ctx = AI.buildContext(statsData, allTodos, userName, range);
    const { context, name, rangeLabel, total, completed, overdue, rate,
            doneTasks, openTasks, cats, bestDay } = ctx;

    onProgress?.('Crafting your personal summary...');

    const prompt = `<s>[INST] You are ${name}'s personal productivity coach. Write a warm, personal 4-5 sentence productivity message using ONLY the data below. Requirements: address ${name} by name, mention 2-3 specific task titles from the data in quotes, use real numbers, give 1 actionable tip based on their weakest area. Sound like a supportive friend, not a robot.

TASK DATA:
${context}

Write ${name}'s productivity message now: [/INST]`;

    try {
      return await AI._callAPI(prompt, false);
    } catch (err) {
      console.warn('Summary API failed:', err.message);
      return AI._fallbackSummary(ctx);
    }
  },

  // ── Chat with AI ───────────────────────────────────────────
  async chat(userMessage, history, statsData, allTodos, userName) {
    const ctx = AI.buildContext(statsData, allTodos, userName, statsData?.range || 30);
    const { context, name } = ctx;

    // Build conversation turns
    const turns = history.slice(-8).map(m =>
      m.role === 'user' ? `${name}: ${m.content}` : `Assistant: ${m.content}`
    ).join('\n');

    const prompt = `<s>[INST] You are a smart productivity assistant. You have ${name}'s complete task data below. Answer their question using ONLY this data — be specific, friendly and helpful. If asked something not in the data, say so honestly. For greetings, give a warm welcome and a quick summary of their tasks.

TASK DATA:
${context}

${turns ? `CONVERSATION SO FAR:\n${turns}\n` : ''}${name} says: ${userMessage} [/INST]`;

    try {
      return await AI._callAPI(prompt, true);
    } catch (err) {
      console.warn('Chat API failed:', err.message);
      return AI._fallbackChat(userMessage, ctx);
    }
  },

  // ── Fallback Summary ───────────────────────────────────────
  _fallbackSummary(ctx) {
    const { name, total, completed, pending, overdue, rate,
            doneTasks, openTasks, cats, bestDay, rangeLabel } = ctx;

    if (total === 0) return `Hey ${name}! No tasks recorded ${rangeLabel} yet — head to your dashboard and add some tasks to get your first productivity insight!`;

    const topDone  = doneTasks.slice(0, 3).map(t => `"${t.title}"`).join(', ');
    const catArr   = (cats || '').split(', ').filter(Boolean);
    const bestCat  = catArr[0]?.split(':')[0] || null;

    let msg = rate >= 75 ? `${name}, you're absolutely crushing it ${rangeLabel}! `
            : rate >= 50 ? `Great work ${rangeLabel}, ${name}! `
            : rate >= 25 ? `Hey ${name}, you made progress ${rangeLabel}. `
            : `${name}, ${rangeLabel} was a tough one. `;

    msg += `You completed ${completed} of ${total} tasks (${rate}%)`;
    if (topDone) msg += ` — including ${topDone}`;
    msg += `. `;
    if (bestCat) msg += `Your "${bestCat}" tasks were the highlight. `;
    if (overdue > 0) msg += `You have ${overdue} overdue task${overdue > 1 ? 's' : ''} — tackle those first tomorrow. `;
    if (bestDay) msg += `${bestDay} is your power day — block it for deep work. `;
    if (pending > 3) msg += `💡 Tip: You have ${pending} tasks pending — pick just 3 priorities for tomorrow and ignore the rest.`;
    else msg += `💡 Keep the momentum going — small daily wins compound into huge results!`;

    return msg;
  },

  // ── Fallback Chat (smart keyword + data-driven) ────────────
  _fallbackChat(question, ctx) {
    const { name, total, completed, pending, overdue, rate,
            doneTasks, openTasks, overdueTasks, cats, bestDay, rangeLabel } = ctx;
    const q = question.toLowerCase().trim();

    // Greeting
    if (/^(hi|hey|hello|good|howdy|sup|yo|hii|helo|how are)/.test(q)) {
      if (total === 0) return `Hey ${name}! 👋 Looks like you haven't added any tasks yet. Head to the dashboard to add some, then come back and ask me anything about them!`;
      return `Hey ${name}! 👋 Here's a quick snapshot: you have ${total} tasks ${rangeLabel}, ${completed} completed (${rate}%), and ${pending} still pending${overdue > 0 ? ` with ${overdue} overdue` : ''}. What would you like to dive into?`;
    }

    // Overdue
    if (/overdue|late|past due|missed/.test(q)) {
      if (!overdueTasks.length) return `Great news ${name} — no overdue tasks! You're on top of everything. 🎉`;
      return `You have ${overdueTasks.length} overdue task${overdueTasks.length > 1 ? 's' : ''}: ${overdueTasks.map(t => `"${t.title}" (${t.priority})`).join(', ')}. Tackle the highest priority one first!`;
    }

    // Pending / remaining
    if (/pending|remaining|left|not done|incomplete|unfinished/.test(q)) {
      if (!openTasks.length) return `You have no pending tasks ${name} — everything's done! 🎉`;
      return `${pending} pending task${pending > 1 ? 's' : ''}: ${openTasks.slice(0, 5).map(t => `"${t.title}" (${t.priority})`).join(', ')}${openTasks.length > 5 ? ` and ${openTasks.length - 5} more` : ''}.`;
    }

    // Completed / done
    if (/complet|done|finish|achiev|accomplishe/.test(q)) {
      if (!doneTasks.length) return `No completed tasks ${rangeLabel} yet — go mark something done!`;
      return `You've completed ${completed} tasks ${rangeLabel}! Recent ones: ${doneTasks.slice(0, 4).map(t => `"${t.title}"`).join(', ')}.`;
    }

    // High priority / urgent
    if (/high|urgent|important|critical/.test(q)) {
      const high = openTasks.filter(t => t.priority === 'high');
      if (!high.length) return `No high-priority tasks pending right now — nice job staying on top of them!`;
      return `${high.length} high-priority task${high.length > 1 ? 's' : ''} pending: ${high.map(t => `"${t.title}"`).join(', ')}.`;
    }

    // What to focus on / today / next
    if (/focus|today|next|should i|work on|start|priority/.test(q)) {
      const topTask = [...openTasks].sort((a, b) => {
        const pw = { high: 3, medium: 2, low: 1 };
        const ov = t => t.due_date && new Date(t.due_date) < new Date() ? 2 : 0;
        return (pw[b.priority] || 0) + ov(b) - ((pw[a.priority] || 0) + ov(a));
      })[0];
      if (!topTask) return `No pending tasks ${name} — you're all clear! Add new tasks to keep tracking.`;
      const desc = topTask.description?.trim();
      return `I'd focus on "${topTask.title}" first${desc ? ` — ${desc}` : ''}. It's ${topTask.priority} priority${topTask.due_date ? ` and due ${topTask.due_date}` : ''}.`;
    }

    // Rate / score / stats
    if (/rate|percent|score|statistic|how.*(am i|doing)|progress/.test(q)) {
      return `Your completion rate ${rangeLabel} is ${rate}% (${completed}/${total} tasks). ${rate >= 70 ? '🔥 That\'s excellent!' : rate >= 50 ? '👍 Good progress!' : '💪 Keep pushing — you\'ve got this!'}`;
    }

    // Category
    if (/categor|work|personal|study|health/.test(q)) {
      if (!cats) return `No category data available yet.`;
      return `Category breakdown: ${cats}. ${bestDay ? `Your best day overall is ${bestDay}.` : ''}`;
    }

    // Describe a specific task
    const taskMentioned = [...doneTasks, ...openTasks].find(t =>
      t.title.toLowerCase().includes(q.replace(/[^a-z0-9 ]/g, ''))
    );
    if (taskMentioned) {
      const desc = taskMentioned.description?.trim();
      return `"${taskMentioned.title}": ${desc || 'No description added.'} Status: ${taskMentioned.status}, Priority: ${taskMentioned.priority}${taskMentioned.due_date ? `, Due: ${taskMentioned.due_date}` : ''}.`;
    }

    // Generic fallback
    return `${name}, you have ${total} tasks ${rangeLabel} with a ${rate}% completion rate. Try asking: "What's overdue?", "What should I focus on?", "Show high priority tasks", or "How am I doing?"`;
  },
};

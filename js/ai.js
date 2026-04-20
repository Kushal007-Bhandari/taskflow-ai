// js/ai.js — Full AI module: Summary + Chat
// Builds rich context from all task data, calls Mistral-7B server-side

const AI = {

  // ── Build structured context from all real data ─────────────
  buildContext(statsData, userName, range) {
    const name   = (userName || 'there').split(' ')[0];
    const days   = parseInt(range) || 30;
    const ov     = statsData?.overview || {};
    const DAYS   = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
    const today  = new Date();
    const todayDow = DAYS[today.getDay()];
    const todayDate = today.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });

    const total     = parseInt(ov.recent_total)     || 0;
    const completed = parseInt(ov.recent_completed) || 0;
    const overdue   = parseInt(ov.overdue)          || 0;
    const rate      = total > 0 ? Math.round(completed / total * 100) : 0;
    const pending   = total - completed;

    const rangeLabel = days <= 7 ? 'last 7 days' : days <= 30 ? 'last 30 days'
      : days <= 90 ? 'last 3 months' : days <= 180 ? 'last 6 months' : 'last year';

    // Category performance — sorted
    const cats = (statsData?.categoryBreakdown || []).map(c => ({
      name:  c.name,
      total: parseInt(c.count)     || 0,
      done:  parseInt(c.completed) || 0,
      rate:  c.count > 0 ? Math.round(c.completed / c.count * 100) : 0,
    })).sort((a, b) => b.total - a.total);

    const strongestCat = cats.filter(c => c.total >= 2).sort((a,b) => b.rate - a.rate)[0];
    const weakestCat   = cats.filter(c => c.total >= 2).sort((a,b) => a.rate - b.rate)[0];

    // Best day of week
    const dayData = (statsData?.byDayOfWeek || []).sort((a,b) => b.count - a.count);
    const bestDay = dayData[0] ? DAYS[parseInt(dayData[0].dow)] : null;
    const bestDayCount = dayData[0] ? parseInt(dayData[0].count) : 0;

    // Priority breakdown
    const priBreakdown = (statsData?.priorityBreakdown || []).reduce((acc, p) => {
      acc[p.priority] = parseInt(p.count);
      return acc;
    }, {});

    // All tasks
    const all        = statsData?.allTodosForAI || statsData?.recentTodos || [];
    const doneTasks  = all.filter(t => t.status === 'completed');
    const openTasks  = all.filter(t => t.status !== 'completed' && t.status !== 'cancelled');
    const inProgress = all.filter(t => t.status === 'in_progress');
    const overdueT   = openTasks.filter(t => t.due_date && new Date(t.due_date) < new Date());

    // Due today / tomorrow / this week
    const todayStr    = today.toISOString().split('T')[0];
    const tomorrowStr = new Date(Date.now() + 86400000).toISOString().split('T')[0];
    const weekEndStr  = new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0];
    const dueToday    = openTasks.filter(t => t.due_date && String(t.due_date).split('T')[0] === todayStr);
    const dueTomorrow = openTasks.filter(t => t.due_date && String(t.due_date).split('T')[0] === tomorrowStr);
    const dueThisWeek = openTasks.filter(t => t.due_date && !overdueT.includes(t) && String(t.due_date).split('T')[0] >= todayStr && String(t.due_date).split('T')[0] <= weekEndStr);

    // Priority of pending
    const highPending   = openTasks.filter(t => t.priority === 'high');
    const mediumPending = openTasks.filter(t => t.priority === 'medium');
    const lowPending    = openTasks.filter(t => t.priority === 'low');

    // Recent completions (last 3 days)
    const threeDaysAgo  = new Date(Date.now() - 3 * 86400000);
    const recentWins    = doneTasks.filter(t => t.completed_at && new Date(t.completed_at) > threeDaysAgo);

    // Monthly summary if available
    const monthly = (statsData?.monthlySummary || []).slice(-3);

    // Format task line
    const fmt = (t) => {
      const desc = t.description?.trim();
      const due  = t.due_date ? `, due ${String(t.due_date).split('T')[0]}` : '';
      const ov2  = t.due_date && new Date(t.due_date) < new Date() && t.status !== 'completed' ? ' [OVERDUE]' : '';
      const prog = t.status === 'in_progress' ? ' [IN PROGRESS]' : '';
      return `  • "${t.title}"${desc ? ` — ${desc}` : ''} (${t.priority || 'medium'}${due}${ov2}${prog})`;
    };

    const lines = [
      `USER: ${name}`,
      `TODAY: ${todayDate} (${todayDow})`,
      `PERIOD ANALYZED: ${rangeLabel}`,
      ``,
      `OVERALL STATS:`,
      `  Total tasks: ${total} | Completed: ${completed} (${rate}%) | Pending: ${pending} | Overdue: ${overdue}`,
    ];

    if (Object.keys(priBreakdown).length) {
      lines.push(`  By priority: High=${priBreakdown.high||0}, Medium=${priBreakdown.medium||0}, Low=${priBreakdown.low||0}`);
    }

    if (cats.length) {
      lines.push(``);
      lines.push(`CATEGORY PERFORMANCE:`);
      cats.forEach(c => lines.push(`  ${c.name}: ${c.done}/${c.total} completed (${c.rate}%)`));
      if (strongestCat) lines.push(`  → Strongest: ${strongestCat.name} (${strongestCat.rate}%)`);
      if (weakestCat && weakestCat.name !== strongestCat?.name) lines.push(`  → Needs attention: ${weakestCat.name} (${weakestCat.rate}%)`);
    }

    if (bestDay) {
      lines.push(``);
      lines.push(`PATTERNS:`);
      lines.push(`  Most productive day: ${bestDay} (${bestDayCount} completions)`);
      if (bestDay === todayDow) lines.push(`  → Today (${todayDow}) is their best day historically!`);
    }

    // Urgent context
    if (dueToday.length || dueTomorrow.length || overdueT.length) {
      lines.push(``);
      lines.push(`TIME-SENSITIVE:`);
      if (overdueT.length)    lines.push(`  Overdue (${overdueT.length}): ${overdueT.map(t => `"${t.title}"`).join(', ')}`);
      if (dueToday.length)    lines.push(`  Due today (${dueToday.length}): ${dueToday.map(t => `"${t.title}"`).join(', ')}`);
      if (dueTomorrow.length) lines.push(`  Due tomorrow (${dueTomorrow.length}): ${dueTomorrow.map(t => `"${t.title}"`).join(', ')}`);
    }

    if (inProgress.length) {
      lines.push(``);
      lines.push(`IN PROGRESS (${inProgress.length}):`);
      inProgress.forEach(t => lines.push(fmt(t)));
    }

    if (recentWins.length) {
      lines.push(``);
      lines.push(`RECENT WINS (last 3 days): ${recentWins.map(t => `"${t.title}"`).join(', ')}`);
    }

    if (doneTasks.length) {
      lines.push(``);
      lines.push(`ALL COMPLETED (${doneTasks.length}):`);
      doneTasks.slice(0, 12).forEach(t => lines.push(fmt(t)));
    }
    if (openTasks.length) {
      lines.push(``);
      lines.push(`ALL PENDING (${openTasks.length}):`);
      openTasks.slice(0, 12).forEach(t => lines.push(fmt(t)));
    }

    if (monthly.length) {
      lines.push(``);
      lines.push(`MONTHLY TREND (last 3 months):`);
      monthly.forEach(m => lines.push(`  ${m.month.trim()}: ${m.completed}/${m.created} (${m.completion_rate || 0}%)`));
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
        body: JSON.stringify({ mode: 'summary', context, name, ...AI._extras(ctx) }),
      });
      const data = await res.json().catch(() => ({}));
      // Mistral returned a real response
      if (data.summary && data.summary.length > 20) {
        return { text: data.summary, source: data.source || 'groq-llama3' };
      }
      // Model loading
      if (res.status === 503) throw new Error('503');
      // Empty or error — use fallback
      console.warn('AI empty/error, using fallback. source:', data.source);
      return { text: AI._fallbackSummary(ctx), source: 'fallback' };
    } catch(err) {
      if (err.message === '503') throw err;
      console.warn('AI API failed, using fallback:', err.message);
      return { text: AI._fallbackSummary(ctx), source: 'fallback' };
    }
  },

  // ── Chat ──────────────────────────────────────────────────
  async chat(userMessage, history, statsData, userName) {
    const ctx = AI.buildContext(statsData, userName, statsData?.range || 30);
    const { context, name } = ctx;

    const turns = history.slice(-8).map(m =>
      m.role === 'user' ? `${name}: ${m.content}` : `Assistant: ${m.content}`
    ).join('\n');

    const prompt = `<s>[INST] You are a smart, friendly personal assistant for ${name}. You have access to their task and productivity data below. You can:
- Answer questions about their tasks, progress, and productivity
- Give productivity advice and motivation
- Have normal friendly conversations
- Help them think through problems
- Answer general questions

Be warm, natural, and conversational — like a knowledgeable friend. Use their task data when relevant, but don't limit yourself to only that. Keep responses concise.

${name}'s TASK DATA:
${context}

${turns ? `CONVERSATION SO FAR:\n${turns}\n` : ''}${name}: ${userMessage} [/INST]`;

    try {
      const res = await fetch('/api/ai-summary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${Auth.getToken()}` },
        body: JSON.stringify({ mode: 'chat', context, name, userMessage, history: history }),
      });
      const data = await res.json();
      // If AI returned a real response, use it
      if (data.summary && data.summary.length > 10) return data.summary;
      // If model is loading (503) tell the user
      if (res.status === 503 || data.retry) return '⏳ The AI model is warming up — please try again in about 20 seconds!';
      // If empty response, fall back
      throw new Error('No response');
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
    const { name, total, completed, overdue, rate, doneTasks, openTasks, overdueT, cats } = ctx;
    const q = question.toLowerCase().trim();

    // Greetings
    if (/^(hi|hey|hello|howdy|sup|yo|good|wassup)/.test(q)) {
      if (total === 0) return `Hi! You haven't added any tasks yet. Add some from the dashboard and I can help you prioritize.`;
      if (overdue > 0) return `Hi. You have ${overdue} overdue task${overdue>1?'s':''}. Want to see what to tackle first?`;
      return `Hi! You have ${openTasks.length} pending task${openTasks.length!==1?'s':''}. Need help deciding what to focus on?`;
    }
    // Thanks / bye
    if (/^(thank|thanks|thx|ty)/.test(q)) return `You're welcome.`;
    if (/^(bye|gtg|later|cya|see you)/.test(q)) return `Good luck — come back anytime.`;

    // Feelings — acknowledge, offer direction
    if (/^(i'?m |im |feeling )(tired|lazy|unmotivated)/.test(q)) {
      const easy = openTasks.find(t => t.priority === 'low') || openTasks[0];
      if (easy) return `That's okay. Try starting with "${easy.title}" — it's ${easy.priority} priority, so a low-effort win to build momentum.`;
      return `That's okay. You have no pending tasks right now — a break might be exactly what you need.`;
    }
    if (/^(i'?m |im |feeling )(stressed|anxious|overwhelmed)/.test(q)) {
      if (!openTasks.length) return `Take a breath — you have no pending tasks right now.`;
      return `Understandable. Focus on one thing: "${openTasks[0].title}". Everything else can wait until that's done.`;
    }

    // Overdue
    if (/overdue|late|past due|missed/.test(q)) {
      if (!overdueT.length) return `Nothing overdue. You're on track.`;
      if (overdueT.length === 1) return `One overdue task: "${overdueT[0].title}" (${overdueT[0].priority} priority). Start there.`;
      return `${overdueT.length} overdue tasks. The most urgent is "${overdueT[0].title}" — tackle that first.`;
    }

    // Pending
    if (/pending|remaining|left|not done|incomplete/.test(q)) {
      if (!openTasks.length) return `All tasks done. Well done.`;
      if (openTasks.length <= 3) return `You have ${openTasks.length} pending: ${openTasks.map(t => `"${t.title}"`).join(', ')}.`;
      return `${openTasks.length} pending tasks. Your top priority is "${openTasks[0].title}".`;
    }

    // Completed
    if (/complet|done|finish|achiev/.test(q)) {
      if (!doneTasks.length) return `No completed tasks yet. Check something off the dashboard to get started.`;
      const recent = doneTasks.slice(0, 3).map(t => `"${t.title}"`).join(', ');
      return `You've completed ${completed} task${completed!==1?'s':''}. Recent: ${recent}.`;
    }

    // High priority
    if (/high|urgent|important/.test(q)) {
      const high = openTasks.filter(t => t.priority === 'high');
      if (!high.length) return `No high-priority tasks pending. Everything urgent is handled.`;
      if (high.length === 1) return `One high-priority task: "${high[0].title}".`;
      return `${high.length} high-priority pending: ${high.map(t => `"${t.title}"`).join(', ')}.`;
    }

    // Focus / next / should I
    if (/focus|today|next|should i|start|work on|priorit/.test(q)) {
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
      if (!top) return `Nothing pending. Take a break or add new tasks.`;
      const isOverdue = top.due_date && new Date(top.due_date) < new Date();
      return `Focus on "${top.title}" — ${top.priority} priority${isOverdue ? ', currently overdue' : top.due_date ? `, due soon` : ''}.`;
    }

    // Progress / rate
    if (/rate|percent|how.*doing|progress|check.in/.test(q)) {
      if (total === 0) return `No data yet. Add some tasks and I can give you a real check-in.`;
      const assessment = rate >= 75 ? `That's excellent.` : rate >= 50 ? `Solid progress.` : rate >= 25 ? `Room to grow — pick one task and knock it out today.` : `Rough stretch — just focus on one small win.`;
      return `${completed}/${total} tasks done — ${rate}% completion rate. ${assessment}`;
    }

    // Categories
    if (/categor/.test(q)) {
      if (!cats.length) return `No category data yet.`;
      const top = cats.sort((a,b) => b.done - a.done)[0];
      return `Your strongest category is "${top.name}" with ${top.done}/${top.total} tasks done (${top.rate}%).`;
    }

    // Specific task search
    const found = [...doneTasks,...openTasks].find(t => t.title?.toLowerCase().includes(q));
    if (found) {
      const desc = found.description?.trim();
      const due = found.due_date ? ` Due ${String(found.due_date).split('T')[0]}.` : '';
      return `"${found.title}" — ${found.status}, ${found.priority} priority.${due}${desc ? ` ${desc}` : ''}`;
    }

    // Unknown / out of scope — honest but helpful
    return `I can't answer that directly, but I can help you with your tasks, priorities, or progress. Try asking "What should I focus on?" or "How am I doing?"`;
  },
};

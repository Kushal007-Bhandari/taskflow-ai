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

    // Greetings — casual, short
    if (/^(hi|hey|hello|howdy|sup|yo|good|wassup|whats up)/.test(q)) {
      if (total === 0) return `hey! you haven't added any tasks yet — want to?`;
      if (overdue > 0) return `hey 👋 you've got ${overdue} overdue — wanna tackle those?`;
      return `hey! what's up 👋`;
    }
    // Feelings / casual
    if (/^(i'?m |im |feeling )(tired|bored|stressed|anxious|sad|lazy|overwhelmed)/.test(q)) {
      if (/tired|lazy/.test(q)) return `rough day huh. wanna skip the list or knock out something small?`;
      if (/stressed|anxious|overwhelmed/.test(q)) return `take a breath. just pick one thing — what's bugging you most?`;
      if (/bored/.test(q)) return `lol same. pick the easiest thing on your list and knock it out?`;
      return `i hear you. one step at a time.`;
    }
    if (/thank|thanks|thx/.test(q)) return `anytime 🙂`;
    if (/^(bye|gtg|later|cya)/.test(q)) return `later! go crush it`;

    if (/overdue|late|past due|missed/.test(q)) {
      if (!overdueT.length) return `nothing overdue, you're good 🎉`;
      const t = overdueT[0];
      if (overdueT.length === 1) return `just "${t.title}" — knock it out`;
      return `${overdueT.length} overdue. start with "${t.title}"`;
    }
    if (/pending|remaining|left|not done/.test(q)) {
      if (!openTasks.length) return `all done! 🎉`;
      if (openTasks.length <= 2) return `${openTasks.map(t => `"${t.title}"`).join(' and ')}`;
      return `${openTasks.length} pending. want me to pick the top one?`;
    }
    if (/complet|done|finish|achiev/.test(q)) {
      if (!doneTasks.length) return `none yet — go check something off!`;
      return `${completed} done so far. nice 👍`;
    }
    if (/high|urgent|important/.test(q)) {
      const high = openTasks.filter(t => t.priority === 'high');
      if (!high.length) return `no high priority pending. breathe 😌`;
      if (high.length === 1) return `just "${high[0].title}"`;
      return `${high.map(t => `"${t.title}"`).join(', ')}`;
    }
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
      if (!top) return `nothing pending. take a break 🙂`;
      return `start with "${top.title}" — ${top.priority} priority${top.due_date ? ', due soon' : ''}`;
    }
    if (/rate|percent|how.*doing|progress/.test(q)) {
      if (total === 0) return `no data yet — add some tasks first!`;
      if (rate >= 75) return `${rate}% — you're crushing it 🔥`;
      if (rate >= 50) return `${rate}% — solid 👍`;
      if (rate >= 25) return `${rate}%. let's push it up`;
      return `${rate}%. rough patch, but you got this 💪`;
    }
    if (/categor/.test(q)) {
      if (!cats.length) return `no categories yet`;
      const top = cats.sort((a,b) => b.done - a.done)[0];
      return `${top.name} is your strongest — ${top.done}/${top.total} done`;
    }
    // Specific task search
    const found = [...doneTasks,...openTasks].find(t => t.title?.toLowerCase().includes(q));
    if (found) {
      const desc = found.description?.trim();
      return `"${found.title}" — ${found.status}, ${found.priority} priority${desc?`. ${desc}`:''}`;
    }
    // AI offline — short honest reply
    return `my brain's loading — try again in a sec 🔄`;
  },
};

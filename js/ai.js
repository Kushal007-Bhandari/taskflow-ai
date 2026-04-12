// js/ai.js
// On-device AI using Qwen2.5-0.5B-Instruct via Transformers.js
// A real instruction-following model — not just a summarizer

let generator = null;
let isLoading = false;

const AI = {
  MODEL: 'onnx-community/Qwen2.5-0.5B-Instruct',

  // ── Load Model ──────────────────────────────────────────────
  async loadModel(onProgress) {
    if (generator) return generator;
    if (isLoading) {
      while (isLoading) await new Promise(r => setTimeout(r, 300));
      return generator;
    }

    isLoading = true;
    try {
      const { pipeline } = await import('https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.5.0/dist/transformers.min.js');

      onProgress?.('Downloading Qwen2.5 AI model (~400MB, cached after first load)...');

      generator = await pipeline('text-generation', this.MODEL, {
        dtype: 'q4',
        device: 'webgpu',
        progress_callback: (info) => {
          if (info.status === 'progress' && info.total) {
            const pct = Math.round((info.loaded / info.total) * 100);
            onProgress?.(`Downloading model: ${pct}% — please wait...`);
          }
        },
      }).catch(async () => {
        // Fallback to WASM if WebGPU not supported
        onProgress?.('WebGPU not available, using WASM fallback...');
        const { pipeline: p2 } = await import('https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.5.0/dist/transformers.min.js');
        return p2('text-generation', this.MODEL, {
          dtype: 'q4',
          device: 'wasm',
          progress_callback: (info) => {
            if (info.status === 'progress' && info.total) {
              const pct = Math.round((info.loaded / info.total) * 100);
              onProgress?.(`Downloading model: ${pct}%...`);
            }
          },
        });
      });

      onProgress?.('Model ready!');
      return generator;
    } finally {
      isLoading = false;
    }
  },

  // ── Build a smart prompt from todo data ─────────────────────
  buildPrompt(todos, stats, range) {
    const rangeName = range === 7 ? 'week' : range === 30 ? 'month' : range === 90 ? '3 months' : range === 180 ? '6 months' : 'year';
    const total     = parseInt(stats?.total)     || 0;
    const completed = parseInt(stats?.completed) || 0;
    const overdue   = parseInt(stats?.overdue)   || 0;
    const rate      = total > 0 ? Math.round((completed / total) * 100) : 0;

    // Category breakdown
    const cats = {};
    todos.forEach(t => {
      const c = t.category || 'General';
      if (!cats[c]) cats[c] = { total: 0, done: 0 };
      cats[c].total++;
      if (t.status === 'completed') cats[c].done++;
    });

    const catSummary = Object.entries(cats)
      .map(([name, d]) => `${name}: ${d.done}/${d.total} completed`)
      .join(', ');

    // Priority breakdown
    const highDone    = todos.filter(t => t.priority === 'high'   && t.status === 'completed').length;
    const highTotal   = todos.filter(t => t.priority === 'high').length;
    const medDone     = todos.filter(t => t.priority === 'medium' && t.status === 'completed').length;
    const medTotal    = todos.filter(t => t.priority === 'medium').length;

    // Recent completions sample
    const recentDone = todos
      .filter(t => t.status === 'completed')
      .slice(0, 6)
      .map(t => t.title)
      .join(', ');

    return `<|im_start|>system
You are an insightful productivity coach analyzing a user's task history. Give a warm, specific, actionable summary in 3-4 sentences. Mention patterns, wins, and one suggestion. Be specific — use the actual numbers and categories provided.<|im_end|>
<|im_start|>user
Analyze my productivity for the past ${rangeName}:
- Tasks created: ${total}, completed: ${completed} (${rate}% completion rate)
- Overdue tasks: ${overdue}
- By category: ${catSummary || 'No categories'}
- High priority: ${highDone}/${highTotal} done, Medium priority: ${medDone}/${medTotal} done
- Recently completed: ${recentDone || 'none yet'}

Give me a specific productivity summary with insights.<|im_end|>
<|im_start|>assistant
`;
  },

  // ── Generate Summary ────────────────────────────────────────
  async summarize(todos, stats, range, onProgress) {
    if (!todos?.length && !stats?.recent_total) {
      return '📋 No tasks found for this period. Start adding and completing tasks to see your AI-powered productivity insights!';
    }

    try {
      onProgress?.('Loading AI model...');
      const model = await this.loadModel(onProgress);

      onProgress?.('Generating your personalized summary...');

      const prompt = this.buildPrompt(todos, stats, range);

      const result = await model(prompt, {
        max_new_tokens: 180,
        temperature: 0.7,
        top_p: 0.9,
        repetition_penalty: 1.1,
        do_sample: true,
      });

      // Extract only the assistant's response
      const fullText = result?.[0]?.generated_text || '';
      const assistantPart = fullText.split('<|im_start|>assistant')[1] || fullText;
      const cleanText = assistantPart
        .replace(/<\|im_end\|>.*/s, '')
        .replace(/<[^>]+>/g, '')
        .trim();

      if (!cleanText || cleanText.length < 20) {
        return this.fallbackSummary(todos, stats, range);
      }

      return cleanText;

    } catch (err) {
      console.warn('AI generation failed, using fallback:', err.message);
      return this.fallbackSummary(todos, stats, range);
    }
  },

  // ── Smart fallback if model fails ───────────────────────────
  fallbackSummary(todos, stats, range) {
    const total     = parseInt(stats?.recent_total)     || todos?.length || 0;
    const completed = parseInt(stats?.recent_completed) || todos?.filter(t => t.status === 'completed').length || 0;
    const overdue   = parseInt(stats?.overdue) || 0;
    const rate      = total > 0 ? Math.round((completed / total) * 100) : 0;
    const rangeName = range === 7 ? 'week' : range === 30 ? 'month' : `${range} days`;

    if (total === 0) return '📋 No tasks yet in this period. Create some tasks and start completing them to see your insights!';

    // Category analysis
    const cats = {};
    todos?.forEach(t => {
      const c = t.category || 'General';
      if (!cats[c]) cats[c] = { total: 0, done: 0 };
      cats[c].total++;
      if (t.status === 'completed') cats[c].done++;
    });

    const topCat = Object.entries(cats).sort((a, b) => b[1].total - a[1].total)[0];
    const bestCat = Object.entries(cats)
      .filter(([, d]) => d.total > 0)
      .sort((a, b) => (b[1].done / b[1].total) - (a[1].done / a[1].total))[0];

    let summary = '';

    if (rate >= 80) summary += `🌟 Excellent work this ${rangeName}! You completed ${completed} out of ${total} tasks — a ${rate}% success rate that puts you in top productivity territory. `;
    else if (rate >= 60) summary += `💪 Solid effort this ${rangeName}! You knocked out ${completed} of ${total} tasks (${rate}% completion rate). `;
    else if (rate >= 40) summary += `📈 You tackled ${completed} of ${total} tasks this ${rangeName} with a ${rate}% completion rate — there's room to push higher. `;
    else summary += `🎯 You completed ${completed} of ${total} tasks this ${rangeName} (${rate}%). `;

    if (topCat) summary += `Your most active area was "${topCat[0]}" with ${topCat[1].total} tasks. `;
    if (bestCat && bestCat[1].total >= 2) {
      const bestRate = Math.round((bestCat[1].done / bestCat[1].total) * 100);
      if (bestRate === 100) summary += `You had a perfect 100% completion rate in "${bestCat[0]}" — great focus there! `;
    }

    const highDone = todos?.filter(t => t.priority === 'high' && t.status === 'completed').length || 0;
    if (highDone > 0) summary += `You crushed ${highDone} high-priority item${highDone > 1 ? 's' : ''} — well done on prioritizing what matters. `;
    if (overdue > 0) summary += `⚠️ Watch out — ${overdue} task${overdue > 1 ? 's are' : ' is'} overdue and need your attention.`;

    return summary.trim();
  },
};

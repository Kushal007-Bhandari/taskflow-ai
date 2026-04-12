// js/ai.js
// On-device AI summarization using Transformers.js (Xenova)
// Model: distilbart-cnn-6-6 — lightweight summarization model

let summarizer = null;
let isLoading = false;

const AI = {
  MODEL: 'Xenova/distilbart-cnn-6-6',

  // ── Load Model ──────────────────────────────────────────────

  async loadModel(onProgress) {
    if (summarizer) return summarizer;
    if (isLoading) {
      // Wait for existing load
      while (isLoading) await new Promise(r => setTimeout(r, 200));
      return summarizer;
    }

    isLoading = true;
    try {
      const { pipeline } = await import('https://cdn.jsdelivr.net/npm/@xenova/transformers@2.17.2/dist/transformers.js');

      onProgress?.('Loading AI model (first time may take ~30s)...');

      summarizer = await pipeline('summarization', this.MODEL, {
        progress_callback: (info) => {
          if (info.status === 'downloading') {
            const pct = Math.round((info.loaded / info.total) * 100);
            onProgress?.(`Downloading model: ${pct}%`);
          }
        },
      });

      onProgress?.('Model ready!');
      return summarizer;
    } finally {
      isLoading = false;
    }
  },

  // ── Format todos into readable text for AI ──────────────────

  formatTodosForSummary(todos, stats) {
    if (!todos?.length) return '';

    // Group by category
    const byCategory = {};
    todos.forEach(t => {
      const cat = t.category || 'General';
      if (!byCategory[cat]) byCategory[cat] = [];
      byCategory[cat].push(t);
    });

    // Build readable text
    let text = '';

    if (stats) {
      text += `During this period, ${stats.total || 0} tasks were created and ${stats.completed || 0} were completed. `;
      const rate = completionRate(stats.completed, stats.total);
      text += `The overall completion rate was ${rate}%. `;
      if (stats.overdue > 0) text += `There were ${stats.overdue} overdue tasks. `;
    }

    Object.entries(byCategory).forEach(([cat, items]) => {
      const completedItems = items.filter(t => t.status === 'completed');
      const completedTitles = completedItems.slice(0, 5).map(t => t.title).join(', ');
      if (completedTitles) {
        text += `In the ${cat} category, completed tasks included: ${completedTitles}. `;
      }
    });

    const highPriority = todos.filter(t => t.priority === 'high' && t.status === 'completed');
    if (highPriority.length > 0) {
      text += `High priority accomplishments: ${highPriority.slice(0, 3).map(t => t.title).join(', ')}. `;
    }

    return text.trim();
  },

  // ── Generate Summary ────────────────────────────────────────

  async summarize(todos, stats, range, onProgress) {
    const inputText = this.formatTodosForSummary(todos, stats);

    if (!inputText) {
      return '📋 No completed tasks found for this period. Start completing tasks to see your AI-generated summary!';
    }

    if (inputText.length < 100) {
      return this.generateSimpleSummary(todos, stats, range);
    }

    try {
      const model = await this.loadModel(onProgress);
      onProgress?.('Generating your summary...');

      const result = await model(inputText, {
        max_new_tokens: 120,
        min_length: 40,
        do_sample: false,
      });

      const aiText = result?.[0]?.summary_text || '';
      return this.enhanceSummary(aiText, stats, range);
    } catch (err) {
      console.warn('AI model failed, using rule-based summary:', err);
      return this.generateSimpleSummary(todos, stats, range);
    }
  },

  // ── Fallback rule-based summary ─────────────────────────────

  generateSimpleSummary(todos, stats, range) {
    if (!stats || !todos?.length) {
      return '📋 No data found for this period yet. Complete some tasks to see your progress summary!';
    }

    const rate = completionRate(stats.completed, stats.total);
    const completed = stats.completed || 0;
    const total = stats.total || 0;
    const rangeName = range === 30 ? 'month' : range === 7 ? 'week' : `${range} days`;

    // Find busiest category
    const cats = {};
    todos.forEach(t => { cats[t.category || 'General'] = (cats[t.category || 'General'] || 0) + 1; });
    const topCat = Object.entries(cats).sort((a,b) => b[1]-a[1])[0];

    let summary = `Over the past ${rangeName}, you created ${total} task${total !== 1 ? 's' : ''} and completed ${completed}`;

    if (rate >= 80) summary += ` — an outstanding ${rate}% completion rate! 🌟`;
    else if (rate >= 60) summary += ` with a solid ${rate}% completion rate. 💪`;
    else if (rate >= 40) summary += ` with a ${rate}% completion rate — room to improve! 📈`;
    else if (total > 0) summary += ` with a ${rate}% completion rate. Keep pushing! 🎯`;

    if (topCat) summary += ` Your most active category was "${topCat[0]}" with ${topCat[1]} task${topCat[1] !== 1 ? 's' : ''}.`;

    const highDone = todos.filter(t => t.priority === 'high' && t.status === 'completed').length;
    if (highDone > 0) summary += ` You crushed ${highDone} high-priority item${highDone !== 1 ? 's' : ''}.`;

    if (stats.overdue > 0) summary += ` Watch out — ${stats.overdue} task${stats.overdue !== 1 ? 's are' : ' is'} overdue.`;

    return summary;
  },

  // ── Enhance AI output with emoji & context ──────────────────

  enhanceSummary(aiText, stats, range) {
    if (!aiText) return this.generateSimpleSummary([], stats, range);
    const rate = completionRate(stats?.completed, stats?.total);
    let emoji = rate >= 80 ? '🌟' : rate >= 60 ? '💪' : rate >= 40 ? '📈' : '🎯';
    return `${emoji} ${aiText}`;
  },
};

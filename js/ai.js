// js/ai.js
// Calls our Netlify function which uses Hugging Face Inference API
// No model download. No browser limitations. Works every time.

const AI = {
  async summarize(todos, stats, range, onProgress) {
    onProgress?.('Generating your summary...');

    try {
      const res = await fetch('/api/ai-summary', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${Auth.getToken()}`,
        },
        body: JSON.stringify({ todos, stats, range }),
      });

      if (!res.ok) throw new Error('Request failed');

      const data = await res.json();
      onProgress?.('Done!');
      return data.summary || 'Could not generate summary. Please try again.';

    } catch (err) {
      console.error('AI summary error:', err);
      throw new Error('Failed to generate summary. Check your connection and try again.');
    }
  },
};

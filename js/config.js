// js/config.js
// ============================================================
// TaskFlow AI — Configuration
// Fill in your details after setting up Neon + Netlify
// ============================================================

const CONFIG = {
  // Your Netlify site URL (use '/.netlify/functions' for local dev)
  // Example: 'https://your-site.netlify.app'
  API_BASE: '',  // Leave empty for same-origin (Netlify auto-handles)

  APP_NAME: 'TaskFlow',
  APP_TAGLINE: 'AI-Powered Productivity',
  VERSION: '1.0.0',
};

// API endpoint helpers
const API = {
  auth:       (base = CONFIG.API_BASE) => `${base}/api/auth`,
  todos:      (base = CONFIG.API_BASE) => `${base}/api/todos`,
  categories: (base = CONFIG.API_BASE) => `${base}/api/categories`,
  stats:      (base = CONFIG.API_BASE) => `${base}/api/stats`,
};

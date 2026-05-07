// js/config.js
// ============================================================
// TaskFlow AI — Configuration
// Fill in your details after setting up Neon + Vercel
// ============================================================

const CONFIG = {
  // Leave empty for same-origin (Vercel serves both frontend and api/ from the same domain)
  // For local dev with `vercel dev`, empty string still works correctly
  API_BASE: '',

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

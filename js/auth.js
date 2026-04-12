// js/auth.js
// Handles all client-side authentication

const Auth = {
  TOKEN_KEY: 'taskflow_token',
  USER_KEY:  'taskflow_user',

  // Get stored token
  getToken() {
    return localStorage.getItem(this.TOKEN_KEY);
  },

  // Get stored user
  getUser() {
    const u = localStorage.getItem(this.USER_KEY);
    return u ? JSON.parse(u) : null;
  },

  // Save session
  saveSession(user, token) {
    localStorage.setItem(this.TOKEN_KEY, token);
    localStorage.setItem(this.USER_KEY, JSON.stringify(user));
  },

  // Clear session
  clearSession() {
    localStorage.removeItem(this.TOKEN_KEY);
    localStorage.removeItem(this.USER_KEY);
  },

  // Check if logged in (by stored data, quick check)
  isLoggedIn() {
    return !!this.getToken() && !!this.getUser();
  },

  // Verify session with server
  async verify() {
    const token = this.getToken();
    if (!token) return null;

    try {
      const res = await fetch(API.auth(), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ action: 'verify' }),
      });
      if (!res.ok) { this.clearSession(); return null; }
      const data = await res.json();
      // Update stored user in case it changed
      localStorage.setItem(this.USER_KEY, JSON.stringify(data.user));
      return data.user;
    } catch {
      return null;
    }
  },

  // Register
  async register(name, email, password) {
    const res = await fetch(API.auth(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'register', name, email, password }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Registration failed');
    this.saveSession(data.user, data.token);
    return data.user;
  },

  // Login
  async login(email, password) {
    const res = await fetch(API.auth(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'login', email, password }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Login failed');
    this.saveSession(data.user, data.token);
    return data.user;
  },

  // Logout
  async logout() {
    const token = this.getToken();
    if (token) {
      try {
        await fetch(API.auth(), {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
          },
          body: JSON.stringify({ action: 'logout' }),
        });
      } catch {}
    }
    this.clearSession();
    window.location.href = '/index.html';
  },

  // Require auth — redirect to login if not logged in
  async requireAuth() {
    if (!this.isLoggedIn()) {
      window.location.href = '/index.html';
      return null;
    }
    // Optionally verify with server (uncomment for stricter auth)
    // const user = await this.verify();
    // if (!user) { window.location.href = '/index.html'; return null; }
    return this.getUser();
  },

  // Require guest — redirect to dashboard if already logged in
  requireGuest() {
    if (this.isLoggedIn()) {
      window.location.href = '/dashboard.html';
    }
  },
};

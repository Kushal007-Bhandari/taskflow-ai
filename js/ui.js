// js/ui.js — Shared UI utilities

// ── Toast ──────────────────────────────────────────────────
const Toast = {
  _wrap: null,
  _get() {
    if (!this._wrap) {
      this._wrap = document.createElement('div');
      this._wrap.className = 'toast-wrap';
      document.body.appendChild(this._wrap);
    }
    return this._wrap;
  },
  show(msg, type = 'info', ms = 3200) {
    const iconMap = {
      success: Icons.circle_check(16),
      error:   Icons.alert(16),
      info:    Icons.alert(16),
    };
    const el = document.createElement('div');
    el.className = `toast ${type}`;
    el.innerHTML = `<span class="toast-icon">${iconMap[type] || ''}</span><span>${msg}</span>`;
    this._get().appendChild(el);
    setTimeout(() => {
      el.style.transition = '0.3s ease';
      el.style.opacity = '0';
      el.style.transform = 'translateY(8px)';
      setTimeout(() => el.remove(), 300);
    }, ms);
  },
  success: (m) => Toast.show(m, 'success'),
  error:   (m) => Toast.show(m, 'error'),
  info:    (m) => Toast.show(m, 'info'),
};

// ── Modal ──────────────────────────────────────────────────
const Modal = {
  open(id)  { document.getElementById(id)?.classList.add('open'); },
  close(id) { document.getElementById(id)?.classList.remove('open'); },
  closeAll() { document.querySelectorAll('.modal-overlay.open').forEach(m => m.classList.remove('open')); },
};

document.addEventListener('click', e => {
  if (e.target.classList.contains('modal-overlay')) Modal.closeAll();
});

// ── Drawer ──────────────────────────────────────────────────
const Drawer = {
  open() {
    document.getElementById('drawer')?.classList.add('open');
    document.getElementById('drawer-overlay')?.classList.add('open');
    document.body.style.overflow = 'hidden';
  },
  close() {
    document.getElementById('drawer')?.classList.remove('open');
    document.getElementById('drawer-overlay')?.classList.remove('open');
    document.body.style.overflow = '';
  },
};

// ── Date Utilities ──────────────────────────────────────────
const DateUtils = {
  format(dateStr) {
    if (!dateStr) return '';
    return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  },
  formatShort(dateStr) {
    if (!dateStr) return '';
    const dStr     = new Date(dateStr).toLocaleDateString('en-CA');
    const todayStr = new Date().toLocaleDateString('en-CA');
    const tStr     = new Date(Date.now() + 86400000).toLocaleDateString('en-CA');
    const yStr     = new Date(Date.now() - 86400000).toLocaleDateString('en-CA');
    if (dStr === todayStr) return 'Today';
    if (dStr === tStr)     return 'Tomorrow';
    if (dStr === yStr)     return 'Yesterday';
    const diff = Math.round((new Date(dStr) - new Date(todayStr)) / 86400000);
    if (diff > 1 && diff < 7)  return `In ${diff} days`;
    if (diff < 0 && diff > -7) return `${Math.abs(diff)}d ago`;
    return this.format(dateStr);
  },
  isOverdue(dateStr) {
    if (!dateStr) return false;
    return new Date(dateStr).toLocaleDateString('en-CA') < new Date().toLocaleDateString('en-CA');
  },
  isSoon(dateStr) {
    if (!dateStr) return false;
    const d = new Date(dateStr).toLocaleDateString('en-CA');
    const t = new Date().toLocaleDateString('en-CA');
    const t3 = new Date(Date.now() + 3 * 86400000).toLocaleDateString('en-CA');
    return d >= t && d <= t3;
  },
  toInput(dateStr) {
    if (!dateStr) return '';
    return new Date(dateStr).toISOString().split('T')[0];
  },
  lastNDays(n) {
    const days = [];
    for (let i = n - 1; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      days.push(d.toISOString().split('T')[0]);
    }
    return days;
  },
};

// ── Avatar ──────────────────────────────────────────────────
function renderAvatar(user, size = 36) {
  const initials = user.name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
  return `<div class="avatar" style="width:${size}px;height:${size}px;background:${user.avatar_color};font-size:${Math.round(size*0.38)}px">${initials}</div>`;
}

// ── Populate drawer user ────────────────────────────────────
function populateSidebarUser() {
  const user = Auth.getUser();
  if (!user) return;
  const initials = user.name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
  const nameEls  = document.querySelectorAll('[data-user-name]');
  const emailEls = document.querySelectorAll('[data-user-email]');
  const avatarEls= document.querySelectorAll('[data-user-avatar]');
  nameEls.forEach(el => el.textContent = user.name);
  emailEls.forEach(el => el.textContent = user.email);
  avatarEls.forEach(el => {
    el.textContent = initials;
    el.style.background = user.avatar_color || '#6366f1';
  });
}

// ── Loading state ───────────────────────────────────────────
function setLoading(btn, loading, label = '') {
  if (loading) {
    btn.dataset.orig = btn.innerHTML;
    btn.innerHTML = `<span class="spinner"></span>${label ? ' ' + label : ''}`;
    btn.disabled = true;
  } else {
    btn.innerHTML = btn.dataset.orig || label;
    btn.disabled = false;
  }
}

// ── Debounce ────────────────────────────────────────────────
function debounce(fn, ms = 300) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

// ── Completion rate ─────────────────────────────────────────
function completionRate(done, total) {
  if (!total) return 0;
  return Math.round((done / total) * 100);
}

// ── Escape HTML ─────────────────────────────────────────────
function esc(str) {
  const d = document.createElement('div');
  d.textContent = str || '';
  return d.innerHTML;
}

// ── Priority tag ────────────────────────────────────────────
function priorityTag(p) {
  const map = {
    high:   { cls: 'tag-high',   label: 'High' },
    medium: { cls: 'tag-medium', label: 'Medium' },
    low:    { cls: 'tag-low',    label: 'Low' },
  };
  const m = map[p] || map.medium;
  return `<span class="tag ${m.cls}">${Icons.flag(11)} ${m.label}</span>`;
}

// ── Theme ───────────────────────────────────────────────────
const Theme = {
  init() {
    // Light is default — only apply dark if explicitly saved
    const saved = localStorage.getItem('tf-theme');
    if (saved === 'dark') {
      document.documentElement.setAttribute('data-theme', 'dark');
    }
    this._updateIcon();
  },
  toggle() {
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    if (isDark) {
      document.documentElement.removeAttribute('data-theme');
      localStorage.setItem('tf-theme', 'light');
    } else {
      document.documentElement.setAttribute('data-theme', 'dark');
      localStorage.setItem('tf-theme', 'dark');
    }
    this._updateIcon();
  },
  _updateIcon() {
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    document.querySelectorAll('.theme-toggle-icon').forEach(el => {
      el.innerHTML = isDark ? Icons.sun(18) : Icons.moon(18);
    });
    document.querySelectorAll('.theme-label').forEach(el => {
      el.textContent = isDark ? 'Light mode' : 'Dark mode';
    });
  },
};

// ── Data Cache (lightning fast) ─────────────────────────────
const Cache = {
  TTL: 45000, // 45 seconds
  set(key, data) {
    try {
      sessionStorage.setItem('tf_' + key, JSON.stringify({ data, ts: Date.now() }));
    } catch(e) {}
  },
  get(key) {
    try {
      const raw = sessionStorage.getItem('tf_' + key);
      if (!raw) return null;
      const { data, ts } = JSON.parse(raw);
      if (Date.now() - ts > this.TTL) { sessionStorage.removeItem('tf_' + key); return null; }
      return data;
    } catch(e) { return null; }
  },
  clear(key) {
    try { sessionStorage.removeItem('tf_' + key); } catch(e) {}
  },
  clearAll() {
    try {
      Object.keys(sessionStorage).filter(k => k.startsWith('tf_')).forEach(k => sessionStorage.removeItem(k));
    } catch(e) {}
  },
};

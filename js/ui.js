// js/ui.js
// Shared UI utilities: toast, modal, date helpers, etc.

// ── Toast Notifications ──────────────────────────────────────

const Toast = {
  container: null,

  init() {
    if (!this.container) {
      this.container = document.createElement('div');
      this.container.className = 'toast-container';
      document.body.appendChild(this.container);
    }
  },

  show(message, type = 'info', duration = 3500) {
    this.init();
    const icons = { success: '✅', error: '❌', info: 'ℹ️', warning: '⚠️' };
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `<span>${icons[type] || '•'}</span><span>${message}</span>`;
    this.container.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateX(20px)';
      toast.style.transition = '0.3s ease';
      setTimeout(() => toast.remove(), 300);
    }, duration);
  },

  success: (msg) => Toast.show(msg, 'success'),
  error:   (msg) => Toast.show(msg, 'error'),
  info:    (msg) => Toast.show(msg, 'info'),
};

// ── Modal ─────────────────────────────────────────────────────

const Modal = {
  open(id) {
    const el = document.getElementById(id);
    if (el) el.classList.add('open');
  },

  close(id) {
    const el = document.getElementById(id);
    if (el) el.classList.remove('open');
  },

  closeAll() {
    document.querySelectorAll('.modal-overlay.open').forEach(m => m.classList.remove('open'));
  },
};

// Close modal on overlay click
document.addEventListener('click', (e) => {
  if (e.target.classList.contains('modal-overlay')) {
    e.target.classList.remove('open');
  }
});

// ── Date Helpers ──────────────────────────────────────────────

const DateUtils = {
  format(dateStr) {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  },

  formatShort(dateStr) {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    const today = new Date();
    const diff = Math.floor((d - today) / (1000 * 60 * 60 * 24));
    if (diff === 0) return 'Today';
    if (diff === 1) return 'Tomorrow';
    if (diff === -1) return 'Yesterday';
    if (diff > 1 && diff < 7) return `In ${diff} days`;
    if (diff < 0 && diff > -7) return `${Math.abs(diff)} days ago`;
    return this.format(dateStr);
  },

  isOverdue(dateStr) {
    if (!dateStr) return false;
    return new Date(dateStr) < new Date() && new Date(dateStr).toDateString() !== new Date().toDateString();
  },

  isSoon(dateStr) {
    if (!dateStr) return false;
    const diff = new Date(dateStr) - new Date();
    return diff > 0 && diff < 3 * 24 * 60 * 60 * 1000;
  },

  toInputFormat(dateStr) {
    if (!dateStr) return '';
    return new Date(dateStr).toISOString().split('T')[0];
  },

  // Generate array of dates for last N days
  lastNDays(n) {
    const dates = [];
    for (let i = n - 1; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      dates.push(d.toISOString().split('T')[0]);
    }
    return dates;
  },
};

// ── User Avatar ───────────────────────────────────────────────

function renderAvatar(user, size = 34) {
  const initials = user.name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
  return `<div class="user-avatar" style="width:${size}px;height:${size}px;background:${user.avatar_color};font-size:${size * 0.38}px">${initials}</div>`;
}

// ── Priority Badge ────────────────────────────────────────────

function priorityBadge(priority) {
  const labels = { high: '🔴 High', medium: '🟡 Medium', low: '🟢 Low' };
  return `<span class="todo-tag priority-${priority}">${labels[priority] || priority}</span>`;
}

// ── Status Badge ──────────────────────────────────────────────

function statusBadge(status) {
  const map = {
    pending:     { label: 'Pending',     class: 'badge-gray'   },
    in_progress: { label: 'In Progress', class: 'badge-blue'   },
    completed:   { label: 'Completed',   class: 'badge-green'  },
    cancelled:   { label: 'Cancelled',   class: 'badge-red'    },
  };
  const s = map[status] || map.pending;
  return `<span class="badge ${s.class}">${s.label}</span>`;
}

// ── Populate Sidebar User ─────────────────────────────────────

function populateSidebarUser() {
  const user = Auth.getUser();
  if (!user) return;

  const nameEl  = document.getElementById('sidebar-user-name');
  const emailEl = document.getElementById('sidebar-user-email');
  const avatarEl = document.getElementById('sidebar-user-avatar');

  if (nameEl)  nameEl.textContent  = user.name;
  if (emailEl) emailEl.textContent = user.email;
  if (avatarEl) {
    const initials = user.name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
    avatarEl.textContent = initials;
    avatarEl.style.background = user.avatar_color || '#f0883e';
  }
}

// ── Loading State ─────────────────────────────────────────────

function setLoading(btn, loading, label = '') {
  if (loading) {
    btn.dataset.originalText = btn.innerHTML;
    btn.innerHTML = `<span class="spinner"></span> ${label || 'Loading...'}`;
    btn.disabled = true;
  } else {
    btn.innerHTML = btn.dataset.originalText || label;
    btn.disabled = false;
  }
}

// ── Debounce ──────────────────────────────────────────────────

function debounce(fn, delay = 300) {
  let timeout;
  return (...args) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => fn(...args), delay);
  };
}

// ── Confirm Dialog ────────────────────────────────────────────

function confirm(message, onConfirm) {
  // Simple confirm using native dialog (can be replaced with custom modal)
  if (window.confirm(message)) onConfirm();
}

// ── Number Format ─────────────────────────────────────────────

function numFormat(n) {
  if (n >= 1000) return (n / 1000).toFixed(1) + 'k';
  return n;
}

// ── Completion Rate ───────────────────────────────────────────

function completionRate(completed, total) {
  if (!total) return 0;
  return Math.round((completed / total) * 100);
}

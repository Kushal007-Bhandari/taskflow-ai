// js/api.js
// Clean API wrapper for all backend calls

const TodoAPI = {
  // ── Helpers ────────────────────────────────────────────────

  _headers() {
    return {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${Auth.getToken()}`,
    };
  },

  async _call(url, options = {}) {
    const res = await fetch(url, {
      ...options,
      headers: this._headers(),
    });
    const data = await res.json();
    if (!res.ok) {
      if (res.status === 401) {
        Auth.clearSession();
        window.location.href = '/index.html';
      }
      throw new Error(data.error || 'Request failed');
    }
    return data;
  },

  // ── Todos ──────────────────────────────────────────────────

  async getTodos(filters = {}) {
    const params = new URLSearchParams(filters).toString();
    const url = params ? `${API.todos()}?${params}` : API.todos();
    const data = await this._call(url);
    return data.todos;
  },

  async createTodo(todo) {
    const data = await this._call(API.todos(), {
      method: 'POST',
      body: JSON.stringify(todo),
    });
    return data.todo;
  },

  async updateTodo(updates) {
    const data = await this._call(API.todos(), {
      method: 'PUT',
      body: JSON.stringify(updates),
    });
    return data.todo;
  },

  async deleteTodo(id) {
    return this._call(API.todos(), {
      method: 'DELETE',
      body: JSON.stringify({ id }),
    });
  },

  async toggleComplete(id, currentStatus) {
    const newStatus = currentStatus === 'completed' ? 'pending' : 'completed';
    return this.updateTodo({ id, status: newStatus });
  },

  // ── Categories ─────────────────────────────────────────────

  async getCategories() {
    const data = await this._call(API.categories());
    return data.categories;
  },

  async createCategory(category) {
    const data = await this._call(API.categories(), {
      method: 'POST',
      body: JSON.stringify(category),
    });
    return data.category;
  },

  async deleteCategory(id) {
    return this._call(API.categories(), {
      method: 'DELETE',
      body: JSON.stringify({ id }),
    });
  },

  // ── Stats ──────────────────────────────────────────────────

  async getStats(range = 30) {
    const data = await this._call(`${API.stats()}?range=${range}`);
    return data;
  },
};

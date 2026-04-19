// api/todos.js
import { neon } from '@neondatabase/serverless';

function setCors(r) {
  r.setHeader('Access-Control-Allow-Origin', '*');
  r.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  r.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
}

export default async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  const sql = neon(process.env.DATABASE_URL);
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Unauthorized' });

  const [session] = await sql`SELECT user_id FROM sessions WHERE token = ${token} AND expires_at > NOW()`;
  if (!session) return res.status(401).json({ error: 'Invalid or expired session' });

  const userId = session.user_id;
  const params = req.query || {};
  const body = req.body || {};

  try {
    if (req.method === 'GET' && !params.id) {
      let todos = await sql`
        SELECT t.*, c.name as category_name, c.color as category_color, c.icon as category_icon
        FROM todos t
        LEFT JOIN categories c ON t.category_id = c.id
        WHERE t.user_id = ${userId}
        ORDER BY
          CASE WHEN t.status = 'completed' THEN 1 ELSE 0 END,
          CASE t.priority WHEN 'high' THEN 1 WHEN 'medium' THEN 2 WHEN 'low' THEN 3 END,
          t.due_date ASC NULLS LAST,
          t.created_at DESC
      `;
      if (params.status)      todos = todos.filter(t => t.status === params.status);
      if (params.priority)    todos = todos.filter(t => t.priority === params.priority);
      if (params.category_id) todos = todos.filter(t => t.category_id === params.category_id);
      if (params.search)      todos = todos.filter(t => t.title.toLowerCase().includes(params.search.toLowerCase()));
      return res.status(200).json({ todos });
    }

    if (req.method === 'GET' && params.id) {
      const [todo] = await sql`
        SELECT t.*, c.name as category_name, c.color as category_color
        FROM todos t LEFT JOIN categories c ON t.category_id = c.id
        WHERE t.id = ${params.id} AND t.user_id = ${userId}
      `;
      if (!todo) return res.status(404).json({ error: 'Todo not found' });
      return res.status(200).json({ todo });
    }

    if (req.method === 'POST') {
      const { title, description, category_id, priority, due_date, tags } = body;
      if (!title?.trim()) return res.status(400).json({ error: 'Title is required' });
      const [todo] = await sql`
        INSERT INTO todos (user_id, title, description, category_id, priority, due_date, tags)
        VALUES (${userId}, ${title.trim()}, ${description || ''}, ${category_id || null}, ${priority || 'medium'}, ${due_date || null}, ${tags || []})
        RETURNING *
      `;
      return res.status(201).json({ todo });
    }

    if (req.method === 'PUT') {
      const { id, title, description, category_id, priority, status, due_date, tags } = body;
      if (!id) return res.status(400).json({ error: 'Todo ID required' });
      const [current] = await sql`SELECT * FROM todos WHERE id = ${id} AND user_id = ${userId}`;
      if (!current) return res.status(404).json({ error: 'Todo not found' });

      const newTitle    = title       !== undefined ? title.trim()          : current.title;
      const newDesc     = description !== undefined ? description            : current.description;
      const newCatId    = category_id !== undefined ? (category_id || null) : current.category_id;
      const newPriority = priority    !== undefined ? priority               : current.priority;
      const newStatus   = status      !== undefined ? status                 : current.status;
      const newDueDate  = due_date    !== undefined ? (due_date || null)     : current.due_date;
      const newTags     = tags        !== undefined ? tags                   : current.tags;

      let completedAt = current.completed_at;
      if (newStatus === 'completed' && !current.completed_at) completedAt = new Date().toISOString();
      else if (newStatus !== 'completed') completedAt = null;

      const [todo] = await sql`
        UPDATE todos SET
          title = ${newTitle}, description = ${newDesc}, category_id = ${newCatId},
          priority = ${newPriority}, status = ${newStatus}, due_date = ${newDueDate},
          tags = ${newTags}, completed_at = ${completedAt}
        WHERE id = ${id} AND user_id = ${userId}
        RETURNING *
      `;
      return res.status(200).json({ todo });
    }

    if (req.method === 'DELETE') {
      const { id } = body;
      if (!id) return res.status(400).json({ error: 'Todo ID required' });
      await sql`DELETE FROM todos WHERE id = ${id} AND user_id = ${userId}`;
      return res.status(200).json({ message: 'Deleted' });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('Todos error:', err);
    return res.status(500).json({ error: err.message || 'Server error' });
  }
}

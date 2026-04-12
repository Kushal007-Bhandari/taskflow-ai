// netlify/functions/todos.js
// Handles all todo CRUD operations

const { neon } = require('@neondatabase/serverless');

const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Content-Type': 'application/json',
};

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };

  const sql = neon(process.env.DATABASE_URL);

  // Verify session
  const token = event.headers.authorization?.replace('Bearer ', '');
  if (!token) return res(401, { error: 'Unauthorized' });

  const [session] = await sql`
    SELECT s.user_id FROM sessions s
    WHERE s.token = ${token} AND s.expires_at > NOW()
  `;
  if (!session) return res(401, { error: 'Invalid or expired session' });

  const userId = session.user_id;
  const params = event.queryStringParameters || {};
  const body = event.body ? JSON.parse(event.body) : {};

  try {
    // ── GET ALL TODOS ─────────────────────────────────────────────────────
    if (event.httpMethod === 'GET' && !params.id) {
      const { status, priority, category_id, search, from_date, to_date } = params;

      let todos = await sql`
        SELECT t.*, c.name as category_name, c.color as category_color, c.icon as category_icon
        FROM todos t
        LEFT JOIN categories c ON t.category_id = c.id
        WHERE t.user_id = ${userId}
        ${status ? sql`AND t.status = ${status}` : sql``}
        ${priority ? sql`AND t.priority = ${priority}` : sql``}
        ${category_id ? sql`AND t.category_id = ${category_id}` : sql``}
        ${search ? sql`AND t.title ILIKE ${'%' + search + '%'}` : sql``}
        ${from_date ? sql`AND t.created_at >= ${from_date}` : sql``}
        ${to_date ? sql`AND t.created_at <= ${to_date + ' 23:59:59'}` : sql``}
        ORDER BY 
          CASE WHEN t.status = 'completed' THEN 1 ELSE 0 END,
          CASE t.priority WHEN 'high' THEN 1 WHEN 'medium' THEN 2 WHEN 'low' THEN 3 END,
          t.due_date ASC NULLS LAST,
          t.created_at DESC
      `;
      return res(200, { todos });
    }

    // ── GET SINGLE TODO ───────────────────────────────────────────────────
    if (event.httpMethod === 'GET' && params.id) {
      const [todo] = await sql`
        SELECT t.*, c.name as category_name, c.color as category_color
        FROM todos t
        LEFT JOIN categories c ON t.category_id = c.id
        WHERE t.id = ${params.id} AND t.user_id = ${userId}
      `;
      if (!todo) return res(404, { error: 'Todo not found' });
      return res(200, { todo });
    }

    // ── CREATE TODO ───────────────────────────────────────────────────────
    if (event.httpMethod === 'POST') {
      const { title, description, category_id, priority, due_date, tags } = body;
      if (!title?.trim()) return res(400, { error: 'Title is required' });

      const [todo] = await sql`
        INSERT INTO todos (user_id, title, description, category_id, priority, due_date, tags)
        VALUES (
          ${userId},
          ${title.trim()},
          ${description || ''},
          ${category_id || null},
          ${priority || 'medium'},
          ${due_date || null},
          ${tags || []}
        )
        RETURNING *
      `;
      return res(201, { todo });
    }

    // ── UPDATE TODO ───────────────────────────────────────────────────────
    if (event.httpMethod === 'PUT') {
      const { id, title, description, category_id, priority, status, due_date, tags } = body;
      if (!id) return res(400, { error: 'Todo ID required' });

      const completedAt = status === 'completed' ? new Date().toISOString() : null;

      const [todo] = await sql`
        UPDATE todos SET
          title = COALESCE(${title || null}, title),
          description = COALESCE(${description ?? null}, description),
          category_id = ${category_id !== undefined ? (category_id || null) : sql`category_id`},
          priority = COALESCE(${priority || null}, priority),
          status = COALESCE(${status || null}, status),
          due_date = ${due_date !== undefined ? (due_date || null) : sql`due_date`},
          tags = COALESCE(${tags || null}, tags),
          completed_at = CASE 
            WHEN ${status || null} = 'completed' AND completed_at IS NULL THEN NOW()
            WHEN ${status || null} != 'completed' THEN NULL
            ELSE completed_at
          END
        WHERE id = ${id} AND user_id = ${userId}
        RETURNING *
      `;
      if (!todo) return res(404, { error: 'Todo not found' });
      return res(200, { todo });
    }

    // ── DELETE TODO ───────────────────────────────────────────────────────
    if (event.httpMethod === 'DELETE') {
      const { id } = body;
      if (!id) return res(400, { error: 'Todo ID required' });

      await sql`DELETE FROM todos WHERE id = ${id} AND user_id = ${userId}`;
      return res(200, { message: 'Deleted' });
    }

    return res(405, { error: 'Method not allowed' });

  } catch (err) {
    console.error('Todos error:', err);
    return res(500, { error: 'Server error' });
  }
};

function res(status, body) {
  return { statusCode: status, headers, body: JSON.stringify(body) };
}

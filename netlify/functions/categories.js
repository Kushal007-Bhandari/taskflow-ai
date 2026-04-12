// netlify/functions/categories.js

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

  const token = event.headers.authorization?.replace('Bearer ', '');
  if (!token) return res(401, { error: 'Unauthorized' });

  const [session] = await sql`
    SELECT user_id FROM sessions WHERE token = ${token} AND expires_at > NOW()
  `;
  if (!session) return res(401, { error: 'Invalid session' });

  const userId = session.user_id;
  const body = event.body ? JSON.parse(event.body) : {};

  try {
    if (event.httpMethod === 'GET') {
      const categories = await sql`
        SELECT c.*, COUNT(t.id) as todo_count
        FROM categories c
        LEFT JOIN todos t ON c.id = t.category_id AND t.user_id = ${userId}
        WHERE c.user_id = ${userId}
        GROUP BY c.id
        ORDER BY c.created_at ASC
      `;
      return res(200, { categories });
    }

    if (event.httpMethod === 'POST') {
      const { name, color, icon } = body;
      if (!name?.trim()) return res(400, { error: 'Name required' });

      const [cat] = await sql`
        INSERT INTO categories (user_id, name, color, icon)
        VALUES (${userId}, ${name.trim()}, ${color || '#3b82f6'}, ${icon || '📁'})
        RETURNING *
      `;
      return res(201, { category: cat });
    }

    if (event.httpMethod === 'PUT') {
      const { id, name, color, icon } = body;
      const [cat] = await sql`
        UPDATE categories SET
          name = COALESCE(${name || null}, name),
          color = COALESCE(${color || null}, color),
          icon = COALESCE(${icon || null}, icon)
        WHERE id = ${id} AND user_id = ${userId}
        RETURNING *
      `;
      return res(200, { category: cat });
    }

    if (event.httpMethod === 'DELETE') {
      await sql`DELETE FROM categories WHERE id = ${body.id} AND user_id = ${userId}`;
      return res(200, { message: 'Deleted' });
    }

    return res(405, { error: 'Method not allowed' });
  } catch (err) {
    console.error('Categories error:', err);
    return res(500, { error: 'Server error' });
  }
};

function res(status, body) {
  return { statusCode: status, headers, body: JSON.stringify(body) };
}

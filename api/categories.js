// api/categories.js
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
  if (!session) return res.status(401).json({ error: 'Invalid session' });

  const userId = session.user_id;
  const body = req.body || {};

  try {
    if (req.method === 'GET') {
      const categories = await sql`
        SELECT c.*, COUNT(t.id) as todo_count
        FROM categories c
        LEFT JOIN todos t ON c.id = t.category_id AND t.user_id = ${userId}
        WHERE c.user_id = ${userId}
        GROUP BY c.id
        ORDER BY c.created_at ASC
      `;
      return res.status(200).json({ categories });
    }

    if (req.method === 'POST') {
      const { name, color, icon } = body;
      if (!name?.trim()) return res.status(400).json({ error: 'Name required' });
      const [cat] = await sql`
        INSERT INTO categories (user_id, name, color, icon)
        VALUES (${userId}, ${name.trim()}, ${color || '#3b82f6'}, ${icon || '📁'})
        RETURNING *
      `;
      return res.status(201).json({ category: cat });
    }

    if (req.method === 'PUT') {
      const { id, name, color, icon } = body;
      const [cat] = await sql`
        UPDATE categories SET
          name  = COALESCE(${name  || null}, name),
          color = COALESCE(${color || null}, color),
          icon  = COALESCE(${icon  || null}, icon)
        WHERE id = ${id} AND user_id = ${userId}
        RETURNING *
      `;
      return res.status(200).json({ category: cat });
    }

    if (req.method === 'DELETE') {
      await sql`DELETE FROM categories WHERE id = ${body.id} AND user_id = ${userId}`;
      return res.status(200).json({ message: 'Deleted' });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('Categories error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
}

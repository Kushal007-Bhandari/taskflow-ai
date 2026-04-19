// api/auth.js
import { neon } from '@neondatabase/serverless';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';

function setCors(r) {
  r.setHeader('Access-Control-Allow-Origin', '*');
  r.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  r.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
}

export default async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const sql = neon(process.env.DATABASE_URL);
  const { action, ...data } = req.body || {};

  try {
    if (action === 'register') {
      const { email, password, name } = data;
      if (!email || !password || !name) return res.status(400).json({ error: 'All fields required' });
      if (password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });

      const existing = await sql`SELECT id FROM users WHERE email = ${email.toLowerCase()}`;
      if (existing.length > 0) return res.status(400).json({ error: 'Email already registered' });

      const hash = await bcrypt.hash(password, 12);
      const colors = ['#f0883e', '#3b82f6', '#22c55e', '#a855f7', '#ec4899', '#14b8a6'];
      const avatarColor = colors[Math.floor(Math.random() * colors.length)];

      const [user] = await sql`
        INSERT INTO users (email, name, password_hash, avatar_color)
        VALUES (${email.toLowerCase()}, ${name}, ${hash}, ${avatarColor})
        RETURNING id, email, name, avatar_color, created_at
      `;

      const defaultCategories = [
        { name: 'Work',     color: '#3b82f6', icon: '💼' },
        { name: 'Personal', color: '#22c55e', icon: '🌱' },
        { name: 'Study',    color: '#a855f7', icon: '📚' },
        { name: 'Health',   color: '#ec4899', icon: '💪' },
      ];
      for (const cat of defaultCategories) {
        await sql`INSERT INTO categories (user_id, name, color, icon) VALUES (${user.id}, ${cat.name}, ${cat.color}, ${cat.icon})`;
      }

      const token = await createSession(sql, user.id);
      return res.status(201).json({ user, token });
    }

    if (action === 'login') {
      const { email, password } = data;
      if (!email || !password) return res.status(400).json({ error: 'Email and password required' });

      const [user] = await sql`SELECT * FROM users WHERE email = ${email.toLowerCase()}`;
      if (!user) return res.status(401).json({ error: 'Invalid email or password' });

      const valid = await bcrypt.compare(password, user.password_hash);
      if (!valid) return res.status(401).json({ error: 'Invalid email or password' });

      const token = await createSession(sql, user.id);
      const { password_hash, ...safeUser } = user;
      return res.status(200).json({ user: safeUser, token });
    }

    if (action === 'verify') {
      const token = req.headers.authorization?.replace('Bearer ', '');
      if (!token) return res.status(401).json({ error: 'No token provided' });

      const [session] = await sql`
        SELECT s.*, u.id as uid, u.email, u.name, u.avatar_color, u.created_at as user_created
        FROM sessions s
        JOIN users u ON s.user_id = u.id
        WHERE s.token = ${token} AND s.expires_at > NOW()
      `;
      if (!session) return res.status(401).json({ error: 'Invalid or expired session' });

      return res.status(200).json({
        user: {
          id: session.uid,
          email: session.email,
          name: session.name,
          avatar_color: session.avatar_color,
          created_at: session.user_created,
        }
      });
    }

    if (action === 'logout') {
      const token = req.headers.authorization?.replace('Bearer ', '');
      if (token) await sql`DELETE FROM sessions WHERE token = ${token}`;
      return res.status(200).json({ message: 'Logged out' });
    }

    return res.status(400).json({ error: 'Unknown action' });

  } catch (err) {
    console.error('Auth error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
}

async function createSession(sql, userId) {
  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  await sql`INSERT INTO sessions (user_id, token, expires_at) VALUES (${userId}, ${token}, ${expiresAt})`;
  return token;
}

// api/stats.js
import { neon } from '@neondatabase/serverless';

function setCors(r) {
  r.setHeader('Access-Control-Allow-Origin', '*');
  r.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  r.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
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
  const { range = '30' } = req.query || {};
  const days = parseInt(range);

  try {
    const [overview] = await sql`
      SELECT
        COUNT(*) FILTER (WHERE status != 'cancelled') as total,
        COUNT(*) FILTER (WHERE status = 'completed') as completed,
        COUNT(*) FILTER (WHERE status = 'pending') as pending,
        COUNT(*) FILTER (WHERE status = 'in_progress') as in_progress,
        COUNT(*) FILTER (WHERE status = 'cancelled') as cancelled,
        COUNT(*) FILTER (WHERE due_date < CURRENT_DATE AND status NOT IN ('completed','cancelled')) as overdue,
        COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '1 day' * ${days}) as recent_total,
        COUNT(*) FILTER (WHERE completed_at >= NOW() - INTERVAL '1 day' * ${days}) as recent_completed
      FROM todos WHERE user_id = ${userId}
    `;

    const dailyCompletions = await sql`
      SELECT DATE(completed_at) as date, COUNT(*) as count
      FROM todos
      WHERE user_id = ${userId} AND completed_at >= NOW() - INTERVAL '1 day' * ${days}
      GROUP BY DATE(completed_at) ORDER BY date ASC
    `;

    const dailyCreated = await sql`
      SELECT DATE(created_at) as date, COUNT(*) as count
      FROM todos
      WHERE user_id = ${userId} AND created_at >= NOW() - INTERVAL '1 day' * ${days}
      GROUP BY DATE(created_at) ORDER BY date ASC
    `;

    const priorityBreakdown = await sql`
      SELECT priority, COUNT(*) as count
      FROM todos WHERE user_id = ${userId} AND status != 'cancelled'
      GROUP BY priority
    `;

    const categoryBreakdown = await sql`
      SELECT
        COALESCE(c.name, 'Uncategorized') as name,
        COALESCE(c.color, '#8b949e') as color,
        COUNT(t.id) as count,
        COUNT(t.id) FILTER (WHERE t.status = 'completed') as completed
      FROM todos t
      LEFT JOIN categories c ON t.category_id = c.id
      WHERE t.user_id = ${userId}
      GROUP BY c.name, c.color ORDER BY count DESC
    `;

    const byDayOfWeek = await sql`
      SELECT EXTRACT(DOW FROM completed_at) as dow, COUNT(*) as count
      FROM todos
      WHERE user_id = ${userId} AND completed_at IS NOT NULL
        AND completed_at >= NOW() - INTERVAL '90 days'
      GROUP BY EXTRACT(DOW FROM completed_at) ORDER BY dow
    `;

    const monthlySummary = await sql`
      SELECT
        TO_CHAR(DATE_TRUNC('month', created_at), 'Month YYYY') as month,
        COUNT(*) as created,
        COUNT(*) FILTER (WHERE status = 'completed') as completed,
        COUNT(*) FILTER (WHERE priority = 'high') as high_priority,
        ROUND(COUNT(*) FILTER (WHERE status = 'completed')::numeric / NULLIF(COUNT(*),0) * 100) as completion_rate
      FROM todos
      WHERE user_id = ${userId} AND created_at >= NOW() - INTERVAL '12 months'
      GROUP BY DATE_TRUNC('month', created_at)
      ORDER BY DATE_TRUNC('month', created_at) ASC
    `;

    const allTodosForAI = await sql`
      SELECT t.id, t.title, COALESCE(t.description,'') as description,
        t.priority, t.status, t.due_date, t.completed_at, t.created_at,
        COALESCE(c.name,'General') as category
      FROM todos t
      LEFT JOIN categories c ON t.category_id = c.id
      WHERE t.user_id = ${userId} AND t.status != 'cancelled'
        AND t.created_at >= NOW() - INTERVAL '1 day' * ${days}
      ORDER BY
        CASE t.status WHEN 'completed' THEN 2 ELSE 1 END,
        t.due_date ASC NULLS LAST, t.created_at DESC
      LIMIT 150
    `;

    const recentTodos = allTodosForAI.filter(t => t.status === 'completed');

    // Normalize date fields to YYYY-MM-DD strings so they match frontend DateUtils
    const normDate = (d) => d.date ? String(d.date).split('T')[0] : d.date;
    const dailyCompletionsFixed = dailyCompletions.map(d => ({ ...d, date: normDate(d) }));
    const dailyCreatedFixed     = dailyCreated.map(d     => ({ ...d, date: normDate(d) }));

    return res.status(200).json({
      overview,
      dailyCompletions: dailyCompletionsFixed,
      dailyCreated:     dailyCreatedFixed,
      priorityBreakdown, categoryBreakdown, byDayOfWeek,
      monthlySummary, recentTodos, allTodosForAI, range: days,
    });

  } catch (err) {
    console.error('Stats error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
}

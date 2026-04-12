// netlify/functions/stats.js
// Returns analytics data for charts and AI summary

const { neon } = require('@neondatabase/serverless');

const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
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
  const { range = '30' } = event.queryStringParameters || {};
  const days = parseInt(range);

  try {
    // Overview counts
    const [overview] = await sql`
      SELECT
        COUNT(*) FILTER (WHERE status != 'cancelled') as total,
        COUNT(*) FILTER (WHERE status = 'completed') as completed,
        COUNT(*) FILTER (WHERE status = 'pending') as pending,
        COUNT(*) FILTER (WHERE status = 'in_progress') as in_progress,
        COUNT(*) FILTER (WHERE status = 'cancelled') as cancelled,
        COUNT(*) FILTER (WHERE due_date < CURRENT_DATE AND status NOT IN ('completed', 'cancelled')) as overdue,
        COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '1 day' * ${days}) as recent_total,
        COUNT(*) FILTER (WHERE completed_at >= NOW() - INTERVAL '1 day' * ${days}) as recent_completed
      FROM todos WHERE user_id = ${userId}
    `;

    // Daily completions for chart
    const dailyCompletions = await sql`
      SELECT 
        DATE(completed_at) as date,
        COUNT(*) as count
      FROM todos
      WHERE user_id = ${userId}
        AND completed_at >= NOW() - INTERVAL '1 day' * ${days}
      GROUP BY DATE(completed_at)
      ORDER BY date ASC
    `;

    // Daily created for chart
    const dailyCreated = await sql`
      SELECT 
        DATE(created_at) as date,
        COUNT(*) as count
      FROM todos
      WHERE user_id = ${userId}
        AND created_at >= NOW() - INTERVAL '1 day' * ${days}
      GROUP BY DATE(created_at)
      ORDER BY date ASC
    `;

    // Priority breakdown
    const priorityBreakdown = await sql`
      SELECT priority, COUNT(*) as count
      FROM todos
      WHERE user_id = ${userId} AND status != 'cancelled'
      GROUP BY priority
    `;

    // Category breakdown
    const categoryBreakdown = await sql`
      SELECT 
        COALESCE(c.name, 'Uncategorized') as name,
        COALESCE(c.color, '#8b949e') as color,
        COUNT(t.id) as count,
        COUNT(t.id) FILTER (WHERE t.status = 'completed') as completed
      FROM todos t
      LEFT JOIN categories c ON t.category_id = c.id
      WHERE t.user_id = ${userId}
      GROUP BY c.name, c.color
      ORDER BY count DESC
    `;

    // Completion rate by day of week
    const byDayOfWeek = await sql`
      SELECT 
        EXTRACT(DOW FROM completed_at) as dow,
        COUNT(*) as count
      FROM todos
      WHERE user_id = ${userId}
        AND completed_at IS NOT NULL
        AND completed_at >= NOW() - INTERVAL '90 days'
      GROUP BY EXTRACT(DOW FROM completed_at)
      ORDER BY dow
    `;

    // Monthly summary data (for AI)
    const monthlySummary = await sql`
      SELECT 
        TO_CHAR(DATE_TRUNC('month', created_at), 'Month YYYY') as month,
        COUNT(*) as created,
        COUNT(*) FILTER (WHERE status = 'completed') as completed,
        COUNT(*) FILTER (WHERE priority = 'high') as high_priority,
        ROUND(
          COUNT(*) FILTER (WHERE status = 'completed')::numeric /
          NULLIF(COUNT(*), 0) * 100
        ) as completion_rate
      FROM todos
      WHERE user_id = ${userId}
        AND created_at >= NOW() - INTERVAL '12 months'
      GROUP BY DATE_TRUNC('month', created_at)
      ORDER BY DATE_TRUNC('month', created_at) ASC
    `;

    // Recent completed todos for AI summary
    const recentTodos = await sql`
      SELECT title, priority, completed_at,
        COALESCE(c.name, 'General') as category
      FROM todos t
      LEFT JOIN categories c ON t.category_id = c.id
      WHERE t.user_id = ${userId}
        AND t.completed_at >= NOW() - INTERVAL '1 day' * ${days}
      ORDER BY t.completed_at DESC
      LIMIT 100
    `;

    return res(200, {
      overview,
      dailyCompletions,
      dailyCreated,
      priorityBreakdown,
      categoryBreakdown,
      byDayOfWeek,
      monthlySummary,
      recentTodos,
      range: days,
    });

  } catch (err) {
    console.error('Stats error:', err);
    return res(500, { error: 'Server error' });
  }
};

function res(status, body) {
  return { statusCode: status, headers, body: JSON.stringify(body) };
}

import { Router } from 'express';
import pool from '../db/client.js';

const router = Router();

interface InsightPayload {
  overall?: string;
  indicators?: Record<string, string>;
}

// GET /api/insights — returns latest overall analysis + per-indicator insights
router.get('/', async (_req, res) => {
  const { rows: overallRows } = await pool.query<{ content: string; generated_at: string }>(
    `SELECT content, generated_at::text
     FROM analysis_insights
     WHERE type = 'overall'
     ORDER BY generated_at DESC
     LIMIT 1`
  );

  const { rows: indicatorRows } = await pool.query<{ series_id: string; content: string; generated_at: string }>(
    `SELECT DISTINCT ON (series_id) series_id, content, generated_at::text
     FROM analysis_insights
     WHERE type = 'indicator'
     ORDER BY series_id, generated_at DESC`
  );

  res.json({
    overall: overallRows[0] ?? null,
    indicators: Object.fromEntries(
      indicatorRows.map(r => [r.series_id, { content: r.content, generatedAt: r.generated_at }])
    ),
  });
});

// POST /api/insights — save Claude analysis output (admin key required)
router.post('/', async (req, res) => {
  const adminKey = req.headers['x-admin-key'];
  if (!adminKey || adminKey !== process.env.ADMIN_KEY) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const { overall, indicators } = req.body as InsightPayload;

  if (overall) {
    await pool.query(
      `INSERT INTO analysis_insights (type, series_id, content) VALUES ($1, $2, $3)`,
      ['overall', null, overall]
    );
  }

  if (indicators) {
    for (const [seriesId, content] of Object.entries(indicators)) {
      if (content) {
        await pool.query(
          `INSERT INTO analysis_insights (type, series_id, content) VALUES ($1, $2, $3)`,
          ['indicator', seriesId, content]
        );
      }
    }
  }

  res.json({ ok: true, savedAt: new Date().toISOString() });
});

export default router;

import { Router } from 'express';
import { INDICATORS, INDICATOR_MAP, computeStatus } from '../config/indicators.js';
import { getSnapshotsByMonths } from '../db/queries.js';
import { fetchLatest } from '../services/fred.js';
import { upsertSnapshot } from '../db/queries.js';

const router = Router();

// GET /api/indicators — all 14 indicators with latest value + 12-month sparkline history
router.get('/', async (_req, res) => {
  const results = await Promise.all(
    INDICATORS.map(async (config) => {
      const history = await getSnapshotsByMonths(config.seriesId, 12);
      const latest = history.at(-1) ?? null;
      const previous = history.at(-2) ?? null;
      const latestValue = latest?.value ?? null;
      const previousValue = previous?.value ?? null;
      return {
        seriesId: config.seriesId,
        name: config.name,
        category: config.category,
        unit: config.unit,
        format: config.format,
        description: config.description,
        educationalText: config.educationalText,
        historicalContext: config.historicalContext,
        thresholds: config.thresholds,
        latestValue,
        latestDate: latest?.date ?? null,
        previousValue,
        delta: latestValue !== null && previousValue !== null ? latestValue - previousValue : null,
        status: computeStatus(latestValue, config.thresholds),
        history: history.map(r => ({ date: r.date, value: r.value })),
      };
    })
  );
  res.json(results);
});

// GET /api/indicators/:seriesId — single indicator with full history
router.get('/:seriesId', async (req, res) => {
  const config = INDICATOR_MAP.get(req.params.seriesId);
  if (!config) {
    res.status(404).json({ error: 'Indicator not found' });
    return;
  }

  const months = parseInt((req.query.months as string) || '60');
  const history = await getSnapshotsByMonths(config.seriesId, months);
  const latest = history.at(-1) ?? null;
  const previous = history.at(-2) ?? null;
  const latestValue = latest?.value ?? null;
  const previousValue = previous?.value ?? null;

  res.json({
    seriesId: config.seriesId,
    name: config.name,
    category: config.category,
    unit: config.unit,
    format: config.format,
    description: config.description,
    educationalText: config.educationalText,
    historicalContext: config.historicalContext,
    thresholds: config.thresholds,
    latestValue,
    latestDate: latest?.date ?? null,
    previousValue,
    delta: latestValue !== null && previousValue !== null ? latestValue - previousValue : null,
    status: computeStatus(latestValue, config.thresholds),
    history: history.map(r => ({ date: r.date, value: r.value })),
  });
});

// POST /api/indicators/:seriesId/refresh — admin only
// NOTE: /api/regime is NOT here — it's registered directly on app in index.ts BEFORE this router
router.post('/:seriesId/refresh', async (req, res) => {
  const adminKey = req.headers['x-admin-key'];
  if (!adminKey || adminKey !== process.env.ADMIN_KEY) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const config = INDICATOR_MAP.get(req.params.seriesId);
  if (!config) {
    res.status(404).json({ error: 'Indicator not found' });
    return;
  }

  const obs = await fetchLatest(config.seriesId, config.fredUnits);
  if (!obs) {
    res.status(502).json({ error: 'No data from FRED' });
    return;
  }

  await upsertSnapshot(config.seriesId, obs.date, obs.value);
  res.json({ ok: true, date: obs.date, value: obs.value });
});

export default router;

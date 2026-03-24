import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';

// Set test env before any imports
process.env.NODE_ENV = 'test';
process.env.FRED_API_KEY = 'test_key';

// Mock modules BEFORE importing app
vi.mock('../db/queries.js', () => ({
  getRecentSnapshots: vi.fn().mockResolvedValue([
    { date: '2024-03-01', value: 5.33 },
    { date: '2024-02-01', value: 5.25 },
  ]),
  getSnapshotsByMonths: vi.fn().mockResolvedValue([
    { date: '2023-03-01', value: 5.0 },
    { date: '2024-02-01', value: 5.25 },
    { date: '2024-03-01', value: 5.33 },
  ]),
  upsertSnapshot: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../services/regimeAnalysis.js', () => ({
  computeRegime: vi.fn().mockResolvedValue({
    regime: 'Goldilocks',
    description: 'Growth expanding, inflation contained.',
    recommendedPosture: 'Overweight equities.',
    alerts: [],
    computedAt: '2024-03-01T00:00:00.000Z',
  }),
}));

vi.mock('../db/migrate.js', () => ({ runMigrations: vi.fn().mockResolvedValue(undefined) }));
vi.mock('../jobs/dailyFetch.js', () => ({
  backfillAll: vi.fn().mockResolvedValue(undefined),
  startDailyFetchJob: vi.fn(),
}));
vi.mock('../db/client.js', () => ({
  default: { query: vi.fn().mockResolvedValue({ rows: [{ count: '100' }] }) },
}));
vi.mock('../services/fred.js', () => ({
  fetchLatest: vi.fn().mockResolvedValue({ date: '2024-03-01', value: 5.33 }),
}));

const app = (await import('../index.js')).default;

describe('GET /api/health', () => {
  it('returns ok status', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });
});

describe('GET /api/indicators', () => {
  it('returns array of 14 indicator summaries', async () => {
    const res = await request(app).get('/api/indicators');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body).toHaveLength(14);
  });

  it('each summary has required fields', async () => {
    const res = await request(app).get('/api/indicators');
    const first = res.body[0];
    expect(first).toHaveProperty('seriesId');
    expect(first).toHaveProperty('name');
    expect(first).toHaveProperty('category');
    expect(first).toHaveProperty('latestValue');
    expect(first).toHaveProperty('status');
    expect(first).toHaveProperty('history');
    expect(Array.isArray(first.history)).toBe(true);
  });
});

describe('GET /api/indicators/:seriesId', () => {
  it('returns indicator detail for valid seriesId', async () => {
    const res = await request(app).get('/api/indicators/FEDFUNDS');
    expect(res.status).toBe(200);
    expect(res.body.seriesId).toBe('FEDFUNDS');
    expect(res.body).toHaveProperty('history');
  });

  it('returns 404 for unknown seriesId', async () => {
    const res = await request(app).get('/api/indicators/UNKNOWN_SERIES');
    expect(res.status).toBe(404);
  });
});

describe('GET /api/regime', () => {
  it('returns regime object with required fields', async () => {
    const res = await request(app).get('/api/regime');
    expect(res.status).toBe(200);
    expect(res.body.regime).toBe('Goldilocks');
    expect(res.body).toHaveProperty('alerts');
    expect(res.body).toHaveProperty('recommendedPosture');
    expect(res.body).toHaveProperty('computedAt');
  });
});

describe('POST /api/indicators/:seriesId/refresh', () => {
  it('returns 401 without admin key', async () => {
    const res = await request(app).post('/api/indicators/FEDFUNDS/refresh');
    expect(res.status).toBe(401);
  });

  it('returns 401 with wrong admin key', async () => {
    const res = await request(app)
      .post('/api/indicators/FEDFUNDS/refresh')
      .set('x-admin-key', 'wrong_key');
    expect(res.status).toBe(401);
  });

  it('returns 200 with correct admin key', async () => {
    process.env.ADMIN_KEY = 'test_admin';
    const res = await request(app)
      .post('/api/indicators/FEDFUNDS/refresh')
      .set('x-admin-key', 'test_admin');
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  it('returns 404 for unknown seriesId with valid key', async () => {
    process.env.ADMIN_KEY = 'test_admin';
    const res = await request(app)
      .post('/api/indicators/UNKNOWN/refresh')
      .set('x-admin-key', 'test_admin');
    expect(res.status).toBe(404);
  });
});

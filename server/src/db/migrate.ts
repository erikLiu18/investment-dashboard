import pool from './client.js';

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS indicator_snapshots (
  id         SERIAL PRIMARY KEY,
  series_id  VARCHAR(50)    NOT NULL,
  value      DECIMAL(14,6),
  date       DATE           NOT NULL,
  fetched_at TIMESTAMPTZ    DEFAULT NOW(),
  UNIQUE (series_id, date)
);

CREATE INDEX IF NOT EXISTS idx_snapshots_series_date
  ON indicator_snapshots(series_id, date DESC);

CREATE TABLE IF NOT EXISTS analysis_insights (
  id           SERIAL PRIMARY KEY,
  type         VARCHAR(20)   NOT NULL CHECK (type IN ('overall', 'indicator')),
  series_id    VARCHAR(50),
  content      TEXT          NOT NULL,
  generated_at TIMESTAMPTZ   DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_insights_type_series
  ON analysis_insights(type, series_id, generated_at DESC);
`;

export async function runMigrations(): Promise<void> {
  await pool.query(SCHEMA_SQL);
  console.log('Migrations complete');
}

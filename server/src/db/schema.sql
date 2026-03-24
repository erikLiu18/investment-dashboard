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

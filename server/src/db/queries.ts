import pool from './client.js';

export interface SnapshotRow {
  date: string;   // 'YYYY-MM-DD'
  value: number;
}

/** Upsert a single observation. No-op if same series_id+date already exists with same value. */
export async function upsertSnapshot(
  seriesId: string,
  date: string,
  value: number
): Promise<void> {
  await pool.query(
    `INSERT INTO indicator_snapshots (series_id, date, value)
     VALUES ($1, $2, $3)
     ON CONFLICT (series_id, date) DO UPDATE SET value = EXCLUDED.value`,
    [seriesId, date, value]
  );
}

/** Get the N most recent snapshots for a series, newest first. */
export async function getRecentSnapshots(
  seriesId: string,
  limit: number
): Promise<SnapshotRow[]> {
  const { rows } = await pool.query<SnapshotRow>(
    `SELECT date::text, value::float AS value
     FROM indicator_snapshots
     WHERE series_id = $1
     ORDER BY date DESC
     LIMIT $2`,
    [seriesId, limit]
  );
  return rows;
}

/** Get snapshots for a series going back N months from today, oldest first. */
export async function getSnapshotsByMonths(
  seriesId: string,
  months: number
): Promise<SnapshotRow[]> {
  const { rows } = await pool.query<SnapshotRow>(
    `SELECT date::text, value::float AS value
     FROM indicator_snapshots
     WHERE series_id = $1
       AND date >= NOW() - INTERVAL '${months} months'
     ORDER BY date ASC`,
    [seriesId]
  );
  return rows;
}

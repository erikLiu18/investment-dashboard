import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';
import pool from './client.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export async function runMigrations(): Promise<void> {
  const sql = readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  await pool.query(sql);
  console.log('Migrations complete');
}

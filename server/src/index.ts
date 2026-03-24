import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = parseInt(process.env.PORT || '3001');

app.use(cors());
app.use(express.json());

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

const clientDist = path.join(__dirname, '..', '..', 'client', 'dist');
app.use(express.static(clientDist));
app.get('/{*splat}', (_req, res) => {
  res.sendFile(path.join(clientDist, 'index.html'));
});

// Export app BEFORE calling listen so tests (supertest) can import without binding a port
export default app;

// Only start listening when not in test environment
if (process.env.NODE_ENV !== 'test') {
  import('./db/migrate.js').then(({ runMigrations }) => runMigrations()).then(() => {
    app.listen(PORT, () => {
      console.log(`Investment Dashboard API running on http://localhost:${PORT}`);
    });
  }).catch(console.error);
}

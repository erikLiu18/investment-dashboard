# Investment Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a personal macroeconomic investment dashboard tracking 14 FRED-sourced indicators with daily data refresh, threshold-based alerts, educational UI, and a local Claude analysis skill.

**Architecture:** Full-stack npm workspace — React 19 + Vite + Tailwind CSS 4 client, Express 5 + TypeScript + PostgreSQL server. A central indicator registry (`server/src/config/indicators.ts`) drives the fetch job, DB queries, API responses, and UI — adding a new indicator requires only one registry entry. A `node-cron` job fetches FRED data daily at 6am UTC and upserts to PostgreSQL.

**Tech Stack:** React 19, Vite 6, Tailwind CSS 4, Recharts, Express 5, TypeScript 5.8, PostgreSQL (pg), node-cron, Vitest, Supertest

---

## File Map

```
investment-dashboard/
├── .gitignore
├── package.json                    root workspace
├── railway.json
├── nixpacks.toml
├── client/
│   ├── package.json
│   ├── tsconfig.json
│   ├── vite.config.ts
│   ├── index.html
│   └── src/
│       ├── main.tsx
│       ├── App.tsx
│       ├── index.css               Tailwind CSS 4
│       ├── types/indicators.ts     API response types (mirrors server DTOs)
│       ├── hooks/
│       │   ├── useIndicators.ts    GET /api/indicators
│       │   └── useRegime.ts        GET /api/regime
│       ├── components/
│       │   ├── layout/Sidebar.tsx
│       │   ├── layout/TopBar.tsx
│       │   ├── ui/StatusBadge.tsx
│       │   ├── ui/InfoModal.tsx
│       │   ├── indicators/Sparkline.tsx
│       │   ├── indicators/IndicatorCard.tsx
│       │   ├── indicators/IndicatorChart.tsx  expanded modal + threshold bands
│       │   ├── indicators/IndicatorGroup.tsx  collapsible category section
│       │   ├── analysis/MacroRegimeCard.tsx
│       │   └── analysis/AlertsPanel.tsx
│       └── pages/Dashboard.tsx
├── server/
│   ├── package.json
│   ├── tsconfig.json
│   └── src/
│       ├── index.ts                Express app + cron init
│       ├── config/indicators.ts    ← THE REGISTRY (add new indicators here only)
│       ├── db/
│       │   ├── client.ts           pg Pool singleton
│       │   ├── schema.sql
│       │   ├── migrate.ts          runs schema.sql on startup
│       │   └── queries.ts          typed DB query helpers
│       ├── services/
│       │   ├── fred.ts             FRED REST API client
│       │   └── regimeAnalysis.ts   threshold eval + Investment Clock logic
│       ├── jobs/
│       │   └── dailyFetch.ts       node-cron 0 6 * * * + backfill
│       ├── routes/indicators.ts    4 API endpoints
│       └── __tests__/
│           ├── regimeAnalysis.test.ts
│           ├── fred.test.ts
│           └── routes.test.ts
└── skills/investment-analysis.md
```

---

## Task 1: Project Scaffolding

**Files:**
- Create: `package.json`, `railway.json`, `nixpacks.toml`, `.gitignore`

- [ ] **Create root `package.json`**

```json
{
  "name": "investment-dashboard",
  "private": true,
  "workspaces": ["client", "server"],
  "scripts": {
    "dev": "concurrently \"npm run dev:server\" \"npm run dev:client\"",
    "dev:server": "npm run dev -w server",
    "dev:client": "npm run dev -w client",
    "build": "npm run build -w client && npm run build -w server",
    "start": "npm run start -w server"
  },
  "devDependencies": {
    "concurrently": "^9.1.2"
  }
}
```

- [ ] **Create `railway.json`**

```json
{
  "build": {
    "builder": "RAILPACK",
    "buildCommand": "npm install && npm run build"
  },
  "deploy": {
    "startCommand": "npm run start",
    "numReplicas": 1,
    "restartPolicyType": "ON_FAILURE",
    "restartPolicyMaxRetries": 10
  }
}
```

- [ ] **Create `nixpacks.toml`**

```toml
[phases.install]
cmds = ["npm install"]

[phases.build]
cmds = ["npm run build"]

[start]
cmd = "npm run start"
```

- [ ] **Create `.gitignore`**

```
node_modules/
dist/
.env
*.env.local
```

- [ ] **Create `.env` (local dev — never commit)**

```
DATABASE_URL=postgresql://postgres:password@localhost:5432/investment_dashboard
FRED_API_KEY=your_key_here
ADMIN_KEY=local_dev_admin
PORT=3001
```

- [ ] **Initialize git repo and commit**

```bash
cd /path/to/investment-dashboard
git init
git add package.json railway.json nixpacks.toml .gitignore
git commit -m "chore: project scaffolding"
```

---

## Task 2: Server Foundation

**Files:**
- Create: `server/package.json`, `server/tsconfig.json`, `server/src/index.ts`, `server/src/db/client.ts`

- [ ] **Create `server/package.json`**

```json
{
  "name": "investment-dashboard-server",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "tsc",
    "start": "node dist/index.js",
    "test": "NODE_ENV=test vitest run",
    "test:watch": "NODE_ENV=test vitest"
  },
  "dependencies": {
    "cors": "^2.8.5",
    "express": "^5.1.0",
    "node-cron": "^3.0.3",
    "pg": "^8.16.0"
  },
  "devDependencies": {
    "@types/cors": "^2.8.17",
    "@types/express": "^5.0.2",
    "@types/node-cron": "^3.0.11",
    "@types/pg": "^8.11.0",
    "@types/supertest": "^6.0.2",
    "supertest": "^7.0.0",
    "tsx": "^4.19.4",
    "typescript": "^5.8.2",
    "vitest": "^2.0.0"
  }
}
```

- [ ] **Create `server/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true
  },
  "include": ["src"],
  "exclude": ["node_modules", "dist"]
}
```

- [ ] **Create `server/src/db/client.ts`**

```typescript
import pg from 'pg';

const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

export default pool;
```

- [ ] **Create `server/src/index.ts`** (skeleton — routes added later)

```typescript
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

// Only start listening when not in test environment — prevents EADDRINUSE in Vitest
if (process.env.NODE_ENV !== 'test') {
  app.listen(PORT, () => {
    console.log(`Investment Dashboard API running on http://localhost:${PORT}`);
  });
}
```

- [ ] **Install server deps**

```bash
cd server && npm install
```

- [ ] **Verify server starts**

```bash
cd server && npm run dev
# Expected: "Investment Dashboard API running on http://localhost:3001"
# curl http://localhost:3001/api/health → {"status":"ok",...}
```

- [ ] **Commit**

```bash
git add server/
git commit -m "feat: server foundation with Express 5 + pg"
```

---

## Task 3: Database Schema + Queries

**Files:**
- Create: `server/src/db/schema.sql`, `server/src/db/migrate.ts`, `server/src/db/queries.ts`

- [ ] **Create `server/src/db/schema.sql`**

```sql
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
```

- [ ] **Create `server/src/db/migrate.ts`**

```typescript
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
```

- [ ] **Create `server/src/db/queries.ts`**

```typescript
import pool from './client.js';

export interface SnapshotRow {
  date: string;   // 'YYYY-MM-DD'
  value: number;
}

/** Upsert a single observation. Ignores if same series_id+date already exists. */
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

/** Get snapshots for a series going back N months from today. */
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
```

- [ ] **Wire migrations into `server/src/index.ts`** — add before `app.listen`:

```typescript
import { runMigrations } from './db/migrate.js';

// inside main():
async function main() {
  await runMigrations();
  app.listen(PORT, () => { ... });
}
main().catch(console.error);

// Remove the existing app.listen() call at the bottom
```

- [ ] **Restart dev server, confirm "Migrations complete" in logs**

- [ ] **Commit**

```bash
git add server/src/db/
git commit -m "feat: db schema and query helpers"
```

---

## Task 4: Indicator Registry

**Files:**
- Create: `server/src/config/indicators.ts`

This is the single source of truth. Adding a new indicator = one object in the `INDICATORS` array.

- [ ] **Create `server/src/config/indicators.ts`**

```typescript
export type IndicatorStatus = 'good' | 'warning' | 'danger' | 'unknown';

export type IndicatorCategory =
  | 'Monetary Policy'
  | 'Inflation'
  | 'Growth & Activity'
  | 'Labor Market'
  | 'Risk & Sentiment'
  | 'Liquidity & Valuation';

export interface ThresholdRange {
  min?: number;
  max?: number;
  label: string;
}

export interface IndicatorConfig {
  seriesId: string;
  name: string;
  category: IndicatorCategory;
  unit: string;
  format: 'percent' | 'basis_points' | 'number' | 'currency';
  description: string;
  educationalText: string;
  historicalContext: string;
  fredUnits: 'lin' | 'pc1';   // 'pc1' = percent change from year ago
  frequency: 'daily' | 'weekly' | 'monthly';
  thresholds: {
    danger:  ThresholdRange[];
    warning: ThresholdRange[];
    good:    ThresholdRange[];
  };
}

export function computeStatus(
  value: number | null,
  thresholds: IndicatorConfig['thresholds']
): IndicatorStatus {
  if (value === null || isNaN(value)) return 'unknown';
  const inRange = (r: ThresholdRange) =>
    (r.min === undefined || value >= r.min) &&
    (r.max === undefined || value <= r.max);
  if (thresholds.danger.some(inRange))  return 'danger';
  if (thresholds.warning.some(inRange)) return 'warning';
  if (thresholds.good.some(inRange))    return 'good';
  return 'warning'; // outside all defined ranges = monitor
}

export const INDICATORS: IndicatorConfig[] = [
  // ── Monetary Policy ────────────────────────────────────────────
  {
    seriesId: 'FEDFUNDS',
    name: 'Fed Funds Rate',
    category: 'Monetary Policy',
    unit: '%',
    format: 'percent',
    description: 'Overnight rate the Fed charges banks for borrowing reserves.',
    educationalText: 'The Federal Funds Rate is the primary tool the Fed uses to control the economy. When it rises, borrowing becomes more expensive across the economy — mortgages, car loans, business credit all follow. When it falls, borrowing gets cheaper and spending/investment typically increases.',
    historicalContext: 'The Fed raised rates from 0.25% to 5.50% between 2022–2023 — the fastest tightening cycle in 40 years — to fight post-pandemic inflation.',
    fredUnits: 'lin',
    frequency: 'monthly',
    thresholds: {
      good:    [{ max: 3.5, label: 'Accommodative' }],
      warning: [{ min: 3.5, max: 5.5, label: 'Tightening' }],
      danger:  [{ min: 5.5, label: 'Restrictive — growth headwind' }],
    },
  },
  {
    seriesId: 'DGS10',
    name: '10Y Treasury Yield',
    category: 'Monetary Policy',
    unit: '%',
    format: 'percent',
    description: 'Annual yield on 10-year US government debt — set by the bond market, not the Fed.',
    educationalText: "Unlike the Fed Funds Rate (which the Fed sets), the 10Y yield is determined by supply and demand in bond markets. It reflects investors' expectations for future growth and inflation. It's the benchmark 'risk-free rate' used to value almost every asset in the world.",
    historicalContext: 'The 10Y yield fell to a historic low of 0.5% in 2020 during COVID, then surged to 5%+ in 2023 as the Fed tightened — the steepest rise in 40 years.',
    fredUnits: 'lin',
    frequency: 'daily',
    thresholds: {
      good:    [{ min: 2.0, max: 4.0, label: 'Normal range' }],
      warning: [{ min: 4.0, max: 5.0, label: 'Elevated' }, { max: 2.0, label: 'Deflationary pressure' }],
      danger:  [{ min: 5.0, label: 'Severely restrictive' }],
    },
  },
  {
    seriesId: 'T10Y2Y',
    name: 'Yield Curve (2Y–10Y)',
    category: 'Monetary Policy',
    unit: '%',
    format: 'percent',
    description: 'Spread between 10-year and 2-year Treasury yields. Negative = inverted.',
    educationalText: 'A normal yield curve slopes upward (10Y > 2Y) because investors demand more return to lock money up longer. When the curve inverts (10Y < 2Y), it means markets expect the Fed to cut rates in the future — usually because a recession is expected. Inversion has preceded every US recession in the past 50 years.',
    historicalContext: 'The 2Y–10Y curve inverted in March 2022 and remained negative for over 2 years — the longest inversion since the early 1980s — signaling the most anticipated recession that kept being delayed.',
    fredUnits: 'lin',
    frequency: 'daily',
    thresholds: {
      good:    [{ min: 0.5, label: 'Normal slope' }],
      warning: [{ min: 0, max: 0.5, label: 'Flattening' }],
      danger:  [{ max: 0, label: 'Inverted — recession risk' }],
    },
  },
  {
    seriesId: 'T10YIE',
    name: '10Y Breakeven Inflation',
    category: 'Monetary Policy',
    unit: '%',
    format: 'percent',
    description: "The bond market's own forecast for average inflation over the next 10 years.",
    educationalText: "Derived from the yield gap between regular Treasuries and inflation-protected TIPS. If the 10Y nominal yield is 4.5% and the 10Y TIPS yield is 2.0%, the breakeven is 2.5% — meaning the market expects 2.5% average inflation. More forward-looking than CPI, which measures the past.",
    historicalContext: 'Breakeven inflation surged to 3%+ in early 2022 — its highest since the 1990s — as commodity shocks hit. It fell back toward the Fed\'s 2% target by late 2023.',
    fredUnits: 'lin',
    frequency: 'daily',
    thresholds: {
      good:    [{ min: 1.5, max: 2.5, label: 'Anchored near Fed target' }],
      warning: [{ min: 2.5, max: 3.0, label: 'Above target' }, { min: 1.0, max: 1.5, label: 'Deflationary risk' }],
      danger:  [{ min: 3.0, label: 'Inflation unanchored' }, { max: 1.0, label: 'Deflation risk' }],
    },
  },
  // ── Inflation ──────────────────────────────────────────────────
  {
    seriesId: 'CPILFESL',
    name: 'Core CPI (YoY)',
    category: 'Inflation',
    unit: '%',
    format: 'percent',
    description: 'Consumer Price Index excluding food and energy — the Fed\'s primary inflation gauge.',
    educationalText: "Food and energy prices are volatile — they swing on weather and geopolitics. 'Core' CPI strips these out to reveal underlying inflation trends. This is the number the Fed watches most closely when deciding whether to raise or cut rates.",
    historicalContext: 'Core CPI peaked at 6.6% in September 2022 — the highest since 1982 — before the Fed\'s rate hikes gradually brought it down toward 3% by 2024.',
    fredUnits: 'pc1',  // request YoY % change from FRED
    frequency: 'monthly',
    thresholds: {
      good:    [{ max: 2.5, label: 'Near Fed target' }],
      warning: [{ min: 2.5, max: 3.5, label: 'Above target' }],
      danger:  [{ min: 3.5, label: 'Elevated — rate hike pressure' }],
    },
  },
  // ── Growth & Activity ──────────────────────────────────────────
  {
    seriesId: 'NAPM',
    name: 'ISM Manufacturing PMI',
    category: 'Growth & Activity',
    unit: 'index',
    format: 'number',
    description: 'Monthly survey of manufacturing purchasing managers. >50 = expansion, <50 = contraction.',
    educationalText: 'The PMI (Purchasing Managers\' Index) is one of the most watched leading economic indicators. It surveys factory purchasing managers on new orders, production, employment, and inventories. Because purchasing managers place orders before goods are made, it gives a real-time view of where manufacturing is heading.',
    historicalContext: 'ISM Manufacturing fell below 50 in late 2022 and stayed there through 2023 — the longest manufacturing contraction since the 2008 financial crisis — while services kept the overall economy afloat.',
    fredUnits: 'lin',
    frequency: 'monthly',
    thresholds: {
      good:    [{ min: 52, label: 'Healthy expansion' }],
      warning: [{ min: 48, max: 52, label: 'Near stall speed' }],
      danger:  [{ max: 48, label: 'Contraction' }],
    },
  },
  {
    seriesId: 'NAPMNONMAN',
    name: 'ISM Services PMI',
    category: 'Growth & Activity',
    unit: 'index',
    format: 'number',
    description: 'Monthly survey of services sector purchasing managers. Services = ~70% of US GDP.',
    educationalText: 'Manufacturing is only ~11% of the US economy. Services — healthcare, finance, retail, hospitality — is the rest. The ISM Services PMI gives a far broader read on economic activity than manufacturing alone. A persistent reading below 50 in services would signal a true recession.',
    historicalContext: 'Services PMI held above 50 throughout 2022–2023 even as manufacturing contracted — explaining why the widely-predicted recession never arrived despite aggressive Fed tightening.',
    fredUnits: 'lin',
    frequency: 'monthly',
    thresholds: {
      good:    [{ min: 53, label: 'Strong expansion' }],
      warning: [{ min: 50, max: 53, label: 'Modest growth' }],
      danger:  [{ max: 50, label: 'Contraction — recession risk' }],
    },
  },
  // ── Labor Market ───────────────────────────────────────────────
  {
    seriesId: 'UNRATE',
    name: 'Unemployment Rate',
    category: 'Labor Market',
    unit: '%',
    format: 'percent',
    description: 'Share of the labor force actively seeking work but unemployed.',
    educationalText: 'Unemployment is a lagging indicator — companies are slow to hire and fire, so unemployment peaks after recessions have already started, and falls after recoveries are underway. Watch Initial Jobless Claims for a faster read. The Sahm Rule (when unemployment\'s 3-month average rises 0.5% above its 12-month low) has triggered before every recession since 1970.',
    historicalContext: 'US unemployment hit a 54-year low of 3.4% in January 2023, reflecting extraordinarily tight post-pandemic labor markets. The Sahm Rule briefly triggered in mid-2024 before stabilizing.',
    fredUnits: 'lin',
    frequency: 'monthly',
    thresholds: {
      good:    [{ max: 4.0, label: 'Full employment' }],
      warning: [{ min: 4.0, max: 5.0, label: 'Softening' }],
      danger:  [{ min: 5.0, label: 'Elevated — recession likely' }],
    },
  },
  {
    seriesId: 'ICSA',
    name: 'Initial Jobless Claims',
    category: 'Labor Market',
    unit: 'K',
    format: 'number',
    description: 'Weekly count of new unemployment insurance filings — the most timely labor indicator.',
    educationalText: 'Unlike unemployment rate (monthly, lagging), initial claims are reported every Thursday and turn before recessions. Rising claims mean layoffs are accelerating. The 4-week moving average smooths out volatility. Watch for a sustained break above 280K — that level has historically preceded recessions.',
    historicalContext: 'Claims spiked to 6.9 million in April 2020 (COVID shock) then fell to multi-decade lows of ~200K in 2022–2023. A gradual drift higher is typically the first warning sign of labor market stress.',
    fredUnits: 'lin',
    frequency: 'weekly',
    thresholds: {
      good:    [{ max: 220000, label: 'Healthy labor market' }],
      warning: [{ min: 220000, max: 280000, label: 'Softening' }],
      danger:  [{ min: 280000, label: 'Layoffs accelerating' }],
    },
  },
  // ── Risk & Sentiment ───────────────────────────────────────────
  {
    seriesId: 'BAMLH0A0HYM2',
    name: 'HY Credit Spreads',
    category: 'Risk & Sentiment',
    unit: 'bps',
    format: 'basis_points',
    description: 'Yield premium high-yield bonds pay over equivalent Treasuries. Measures credit stress.',
    educationalText: "When companies with weaker credit (high-yield or 'junk' bonds) must pay much more than safe Treasuries, it signals that investors fear defaults. Spreads widen before equity markets fall — they're one of the few truly leading risk indicators. A spike above 500bps historically precedes equity drawdowns by 2–6 weeks.",
    historicalContext: 'HY spreads briefly exceeded 1000bps during COVID (March 2020) and 800bps in the 2008 crisis. They compressed to historic lows near 300bps in 2021, reflecting extreme risk appetite.',
    fredUnits: 'lin',
    frequency: 'daily',
    thresholds: {
      good:    [{ max: 300, label: 'Risk appetite healthy' }],
      warning: [{ min: 300, max: 500, label: 'Elevated stress' }],
      danger:  [{ min: 500, label: 'Credit stress — de-risk' }],
    },
  },
  {
    seriesId: 'VIXCLS',
    name: 'VIX',
    category: 'Risk & Sentiment',
    unit: 'index',
    format: 'number',
    description: 'CBOE Volatility Index — the market\'s "fear gauge" derived from S&P 500 options.',
    educationalText: "The VIX measures how much investors are paying to insure against market moves over the next 30 days. <15 = complacency (can be a contrarian warning), 15–30 = normal uncertainty, >30 = fear, >40 = panic. Paradoxically, VIX spikes often mark bottoms — when fear peaks, sellers are exhausted.",
    historicalContext: 'VIX hit 82 in March 2020 (COVID) and 80 in October 2008. It spent most of 2021 at historic lows near 15, reflecting central bank-suppressed volatility. Spikes above 30 in 2022 coincided with the equity bear market.',
    fredUnits: 'lin',
    frequency: 'daily',
    thresholds: {
      good:    [{ min: 10, max: 20, label: 'Normal market conditions' }],
      warning: [{ min: 20, max: 30, label: 'Elevated uncertainty' }],
      danger:  [{ min: 30, label: 'Fear / panic — watch for opportunity' }],
    },
  },
  {
    seriesId: 'UMCSENT',
    name: 'Consumer Confidence',
    category: 'Risk & Sentiment',
    unit: 'index',
    format: 'number',
    description: 'University of Michigan Consumer Sentiment Index. Tracks household financial outlook.',
    educationalText: 'Consumer spending drives ~70% of US GDP. When consumers feel confident, they spend more, boosting growth. When confidence falls — due to job fears, high prices, or political uncertainty — spending contracts. This is a direct input to the Investment Clock growth axis.',
    historicalContext: 'Consumer confidence collapsed to 50 during COVID (2020) and again fell to 50 in June 2022 — the lowest since records began in 1952 — driven by 40-year-high inflation squeezing household budgets.',
    fredUnits: 'lin',
    frequency: 'monthly',
    thresholds: {
      good:    [{ min: 80, label: 'Confident consumers' }],
      warning: [{ min: 65, max: 80, label: 'Uncertain' }],
      danger:  [{ max: 65, label: 'Low confidence — spending risk' }],
    },
  },
  {
    seriesId: 'DTWEXBGS',
    name: 'Dollar Index (DXY)',
    category: 'Risk & Sentiment',
    unit: 'index',
    format: 'number',
    description: 'Trade-weighted US dollar index. Strong dollar = headwind for international assets and commodities.',
    educationalText: 'A stronger dollar makes US exports more expensive and hurts US multinationals\' overseas earnings. It also crushes emerging market economies that borrowed in dollars. A falling dollar is generally risk-on and positive for international stocks, gold, and commodities. Rapid dollar moves matter more than absolute level.',
    historicalContext: 'The dollar surged 15%+ in 2022 as aggressive Fed tightening diverged from other central banks. This amplified stress in emerging markets and caused the British pound to briefly crash to a record low.',
    fredUnits: 'lin',
    frequency: 'daily',
    thresholds: {
      good:    [{ min: 90, max: 110, label: 'Normal range' }],
      warning: [{ min: 110, max: 120, label: 'Strong dollar headwind' }, { min: 80, max: 90, label: 'Weak dollar' }],
      danger:  [{ min: 120, label: 'Very strong — EM/commodity stress' }, { max: 80, label: 'Dollar weakness extreme' }],
    },
  },
  // ── Liquidity & Valuation ──────────────────────────────────────
  {
    seriesId: 'M2SL',
    name: 'M2 Money Supply (YoY)',
    category: 'Liquidity & Valuation',
    unit: '%',
    format: 'percent',
    description: 'Year-over-year growth in M2 money supply — cash, savings, money market funds.',
    educationalText: 'M2 measures all money readily available in the economy. Rapid M2 growth (from Fed QE or fiscal stimulus) fuels asset prices and inflation. Contracting M2 — rare before 2022 — signals tightening liquidity and typically precedes disinflation or slower growth. The Fed\'s QE programs in 2020–2021 drove M2 growth to 27% — the highest since WWII.',
    historicalContext: 'M2 contracted YoY for the first time since the Great Depression in 2022–2023, dropping to -4%. This correctly predicted the disinflation that followed, validating the indicator\'s power even in unusual conditions.',
    fredUnits: 'pc1',  // request YoY % change from FRED
    frequency: 'monthly',
    thresholds: {
      good:    [{ min: 4, max: 8, label: 'Healthy liquidity growth' }],
      warning: [{ min: 0, max: 4, label: 'Tightening' }, { min: 8, max: 15, label: 'Excess liquidity' }],
      danger:  [{ max: 0, label: 'Contraction — disinflation risk' }, { min: 15, label: 'Inflationary excess' }],
    },
  },
];

export const INDICATOR_MAP = new Map(INDICATORS.map(i => [i.seriesId, i]));
```

- [ ] **Commit**

```bash
git add server/src/config/indicators.ts
git commit -m "feat: indicator registry with 14 FRED series"
```

---

## Task 5: FRED API Client + Tests

**Files:**
- Create: `server/src/services/fred.ts`, `server/src/__tests__/fred.test.ts`

- [ ] **Write the failing test first** — `server/src/__tests__/fred.test.ts`

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock global fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Must import AFTER setting up mock
const { fetchSeries } = await import('../services/fred.js');

describe('fetchSeries', () => {
  beforeEach(() => mockFetch.mockReset());

  it('returns parsed observations excluding missing values', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        observations: [
          { date: '2024-01-01', value: '5.33' },
          { date: '2024-02-01', value: '.' },  // missing — should be excluded
          { date: '2024-03-01', value: '5.25' },
        ],
      }),
    });
    const result = await fetchSeries('FEDFUNDS', '2024-01-01');
    expect(result).toEqual([
      { date: '2024-01-01', value: 5.33 },
      { date: '2024-03-01', value: 5.25 },
    ]);
  });

  it('throws on HTTP error', async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 400, statusText: 'Bad Request' });
    await expect(fetchSeries('INVALID')).rejects.toThrow('FRED API error');
  });
});
```

- [ ] **Run test — confirm it fails**

```bash
cd server && npm test -- fred.test.ts
# Expected: FAIL — "fetchSeries is not a function" or similar
```

- [ ] **Implement `server/src/services/fred.ts`**

```typescript
const FRED_BASE = 'https://api.stlouisfed.org/fred/series/observations';

export interface FredObservation {
  date: string;   // 'YYYY-MM-DD'
  value: number;
}

/**
 * Fetch observations for a FRED series.
 * @param seriesId  FRED series ID (e.g. 'FEDFUNDS')
 * @param startDate ISO date string — omit to get all history
 * @param units     'lin' = levels (default), 'pc1' = percent change from year ago
 */
export async function fetchSeries(
  seriesId: string,
  startDate?: string,
  units: 'lin' | 'pc1' = 'lin'
): Promise<FredObservation[]> {
  const apiKey = process.env.FRED_API_KEY;
  if (!apiKey) throw new Error('FRED_API_KEY not set');

  const params = new URLSearchParams({
    series_id: seriesId,
    api_key: apiKey,
    file_type: 'json',
    sort_order: 'asc',
    units,
    ...(startDate && { observation_start: startDate }),
  });

  const res = await fetch(`${FRED_BASE}?${params}`);
  if (!res.ok) {
    throw new Error(`FRED API error for ${seriesId}: ${res.status} ${res.statusText}`);
  }

  const data = await res.json() as { observations: { date: string; value: string }[] };

  return data.observations
    .filter(o => o.value !== '.')  // '.' = missing value in FRED
    .map(o => ({ date: o.date, value: parseFloat(o.value) }));
}

/**
 * Fetch only the latest observation for a series.
 */
export async function fetchLatest(
  seriesId: string,
  units: 'lin' | 'pc1' = 'lin'
): Promise<FredObservation | null> {
  const params = new URLSearchParams({
    series_id: seriesId,
    api_key: process.env.FRED_API_KEY ?? '',
    file_type: 'json',
    sort_order: 'desc',
    limit: '1',
    units,
  });

  const res = await fetch(`${FRED_BASE}?${params}`);
  if (!res.ok) return null;

  const data = await res.json() as { observations: { date: string; value: string }[] };
  const obs = data.observations.find(o => o.value !== '.');
  if (!obs) return null;
  return { date: obs.date, value: parseFloat(obs.value) };
}
```

- [ ] **Run test — confirm it passes**

```bash
cd server && npm test -- fred.test.ts
# Expected: PASS
```

- [ ] **Commit**

```bash
git add server/src/services/fred.ts server/src/__tests__/fred.test.ts
git commit -m "feat: FRED API client with unit tests"
```

---

## Task 6: Regime Analysis Service (TDD)

**Files:**
- Create: `server/src/services/regimeAnalysis.ts`, `server/src/__tests__/regimeAnalysis.test.ts`

- [ ] **Write failing tests** — `server/src/__tests__/regimeAnalysis.test.ts`

```typescript
import { describe, it, expect } from 'vitest';
import { computeStatus, evaluateSahmRule, evaluateYieldCurveStreak, classifyRegime } from '../services/regimeAnalysis.js';
import { INDICATOR_MAP } from '../config/indicators.js';

describe('computeStatus', () => {
  const yieldCurve = INDICATOR_MAP.get('T10Y2Y')!;

  it('returns danger when yield curve is inverted', () => {
    expect(computeStatus(-0.5, yieldCurve.thresholds)).toBe('danger');
  });
  it('returns warning when yield curve is flat', () => {
    expect(computeStatus(0.2, yieldCurve.thresholds)).toBe('warning');
  });
  it('returns good when yield curve is normal', () => {
    expect(computeStatus(1.5, yieldCurve.thresholds)).toBe('good');
  });
  it('returns unknown for null', () => {
    expect(computeStatus(null, yieldCurve.thresholds)).toBe('unknown');
  });
});

describe('evaluateSahmRule', () => {
  // Helper: build 13 monthly snapshots
  const makeReadings = (values: number[]) =>
    values.map((v, i) => ({ date: `2024-${String(i + 1).padStart(2,'0')}-01`, value: v }));

  it('returns danger when 3-month avg is 0.5%+ above 12-month min', () => {
    // 12 months at 3.5%, then 3 months at 4.1% = avg 4.1, min 3.5, diff 0.6 → danger
    const readings = makeReadings([3.5,3.5,3.5,3.5,3.5,3.5,3.5,3.5,3.5,3.5,4.1,4.1,4.1]);
    expect(evaluateSahmRule(readings)).toBe('danger');
  });

  it('returns good when unemployment is stable', () => {
    const readings = makeReadings(Array(13).fill(3.8));
    expect(evaluateSahmRule(readings)).toBe('good');
  });

  it('returns unknown when fewer than 13 readings', () => {
    expect(evaluateSahmRule([])).toBe('unknown');
  });
});

describe('evaluateYieldCurveStreak', () => {
  it('returns danger when 5 most recent are all negative', () => {
    const rows = [-0.5,-0.4,-0.3,-0.2,-0.1].map((v,i) => ({ date: `2024-01-0${i+1}`, value: v }));
    expect(evaluateYieldCurveStreak(rows)).toBe('danger');
  });
  it('returns warning when some are negative', () => {
    const rows = [0.5, 0.2, -0.1, -0.2, 0.1].map((v,i) => ({ date: `2024-01-0${i+1}`, value: v }));
    expect(evaluateYieldCurveStreak(rows)).toBe('warning');
  });
  it('returns good when all positive', () => {
    const rows = [1.0,0.8,0.9,1.1,1.2].map((v,i) => ({ date: `2024-01-0${i+1}`, value: v }));
    expect(evaluateYieldCurveStreak(rows)).toBe('good');
  });
});

describe('classifyRegime', () => {
  it('classifies Goldilocks: growing + low inflation', () => {
    const signals = new Map([['NAPM', 54], ['CPILFESL', 2.0], ['T10Y2Y', 1.0], ['BAMLH0A0HYM2', 250]]);
    expect(classifyRegime(signals)).toBe('Goldilocks');
  });
  it('classifies Stagflation: contracting + high inflation', () => {
    const signals = new Map([['NAPM', 47], ['CPILFESL', 4.0], ['T10Y2Y', -0.5], ['BAMLH0A0HYM2', 600]]);
    expect(classifyRegime(signals)).toBe('Stagflation');
  });
  it('classifies Inflationary Growth: growing + high inflation', () => {
    const signals = new Map([['NAPM', 55], ['CPILFESL', 3.5], ['T10Y2Y', 0.5], ['BAMLH0A0HYM2', 280]]);
    expect(classifyRegime(signals)).toBe('Inflationary Growth');
  });
  it('classifies Risk-Off: contracting + low inflation + stressed credit', () => {
    const signals = new Map([['NAPM', 46], ['CPILFESL', 1.5], ['T10Y2Y', -0.3], ['BAMLH0A0HYM2', 550]]);
    expect(classifyRegime(signals)).toBe('Risk-Off');
  });
});
```

- [ ] **Run tests — confirm they fail**

```bash
cd server && npm test -- regimeAnalysis.test.ts
# Expected: FAIL
```

- [ ] **Implement `server/src/services/regimeAnalysis.ts`**

```typescript
import type { SnapshotRow } from '../db/queries.js';
import { computeStatus, INDICATOR_MAP, type IndicatorStatus } from '../config/indicators.js';
import { getRecentSnapshots, getSnapshotsByMonths } from '../db/queries.js';
import type { Pool } from 'pg';

export { computeStatus };  // re-export for convenience

export type RegimeLabel = 'Goldilocks' | 'Inflationary Growth' | 'Stagflation' | 'Risk-Off';

export function evaluateSahmRule(readings: SnapshotRow[]): IndicatorStatus {
  if (readings.length < 13) return 'unknown';
  const sorted = [...readings].sort((a, b) => a.date.localeCompare(b.date));
  const recent3 = sorted.slice(-3).map(r => r.value);
  const prior12 = sorted.slice(-13, -1).map(r => r.value);
  const avg3 = recent3.reduce((s, v) => s + v, 0) / 3;
  const min12 = Math.min(...prior12);
  const diff = avg3 - min12;
  if (diff >= 0.5) return 'danger';
  if (diff >= 0.3) return 'warning';
  return 'good';
}

export function evaluateYieldCurveStreak(rows: SnapshotRow[]): IndicatorStatus {
  if (rows.length === 0) return 'unknown';
  const sorted = [...rows].sort((a, b) => a.date.localeCompare(b.date));
  const recent5 = sorted.slice(-5).map(r => r.value);
  if (recent5.length >= 5 && recent5.every(v => v < 0)) return 'danger';
  if (sorted.some(r => r.value < 0)) return 'warning';
  return 'good';
}

export function classifyRegime(signals: Map<string, number>): RegimeLabel {
  const pmi = signals.get('NAPM') ?? 50;
  const cpi = signals.get('CPILFESL') ?? 2;
  const spreadsBps = signals.get('BAMLH0A0HYM2') ?? 300;
  const yieldCurve = signals.get('T10Y2Y') ?? 0.5;

  const isGrowing = pmi >= 50;
  const isInflationary = cpi >= 3.0;
  const isStressed = spreadsBps >= 500 || yieldCurve < 0;

  if (isStressed && !isGrowing) return 'Risk-Off';
  if (!isGrowing && isInflationary) return 'Stagflation';
  if (isGrowing && isInflationary) return 'Inflationary Growth';
  return 'Goldilocks';
}

const REGIME_DESCRIPTIONS: Record<RegimeLabel, { description: string; posture: string }> = {
  'Goldilocks':          { description: 'Growth expanding, inflation contained — best environment for equities.', posture: 'Overweight equities, underweight bonds and cash.' },
  'Inflationary Growth': { description: 'Economy growing but inflation is elevated — commodities and cyclicals outperform.', posture: 'Tilt toward commodities, cyclicals, TIPS. Reduce long-duration bonds.' },
  'Stagflation':         { description: 'Growth slowing while inflation remains high — the hardest environment.', posture: 'Hold cash, short-duration bonds, and real assets (gold, energy). Avoid equities.' },
  'Risk-Off':            { description: 'Growth contracting with credit stress — defensive posture warranted.', posture: 'Overweight Treasuries and defensives (utilities, staples). Reduce equity exposure.' },
};

export interface RegimeResult {
  regime: RegimeLabel;
  description: string;
  recommendedPosture: string;
  alerts: { seriesId: string; name: string; status: IndicatorStatus; message: string }[];
  computedAt: string;
}

export async function computeRegime(pool: Pool): Promise<RegimeResult> {
  const alerts: RegimeResult['alerts'] = [];
  const signals = new Map<string, number>();

  for (const config of INDICATOR_MAP.values()) {
    const rows = await getRecentSnapshots(config.seriesId, 15);  // enough for streak checks
    if (rows.length === 0) continue;

    const latest = rows[0];
    signals.set(config.seriesId, latest.value);

    // Special multi-row rules
    let status: IndicatorStatus;
    if (config.seriesId === 'UNRATE') {
      const monthlyRows = await getRecentSnapshots('UNRATE', 13);
      status = evaluateSahmRule(monthlyRows);
    } else if (config.seriesId === 'T10Y2Y') {
      status = evaluateYieldCurveStreak(rows.slice(0, 10));
    } else {
      status = computeStatus(latest.value, config.thresholds);
    }

    if (status === 'danger' || status === 'warning') {
      const formattedValue = `${latest.value.toFixed(2)}${config.unit === '%' ? '%' : config.unit === 'bps' ? 'bps' : ''}`;
      alerts.push({
        seriesId: config.seriesId,
        name: config.name,
        status,
        message: `${config.name} at ${formattedValue} — ${status}`,
      });
    }
  }

  const regime = classifyRegime(signals);
  const { description, posture } = REGIME_DESCRIPTIONS[regime];

  return {
    regime,
    description,
    recommendedPosture: posture,
    alerts,
    computedAt: new Date().toISOString(),
  };
}
```

- [ ] **Run tests — confirm they pass**

```bash
cd server && npm test -- regimeAnalysis.test.ts
# Expected: PASS all tests
```

- [ ] **Commit**

```bash
git add server/src/services/regimeAnalysis.ts server/src/__tests__/regimeAnalysis.test.ts
git commit -m "feat: regime analysis service with TDD"
```

---

## Task 7: Daily Fetch Job + Backfill

**Files:**
- Create: `server/src/jobs/dailyFetch.ts`
- Modify: `server/src/index.ts`

- [ ] **Create `server/src/jobs/dailyFetch.ts`**

```typescript
import cron from 'node-cron';
import { INDICATORS } from '../config/indicators.js';
import { fetchSeries, fetchLatest } from '../services/fred.js';
import { upsertSnapshot } from '../db/queries.js';

/** Fetch latest value for every FRED indicator and upsert to DB. */
export async function fetchAllIndicators(): Promise<void> {
  console.log('[dailyFetch] Starting fetch for', INDICATORS.length, 'indicators...');
  let success = 0, failed = 0;

  for (const indicator of INDICATORS) {
    try {
      const obs = await fetchLatest(indicator.seriesId, indicator.fredUnits);
      if (!obs) { console.warn(`[dailyFetch] No data for ${indicator.seriesId}`); failed++; continue; }
      await upsertSnapshot(indicator.seriesId, obs.date, obs.value);
      success++;
    } catch (err) {
      console.error(`[dailyFetch] Failed ${indicator.seriesId}:`, err);
      failed++;
    }
  }

  console.log(`[dailyFetch] Done: ${success} ok, ${failed} failed`);
}

/**
 * Backfill 5 years of history for all indicators.
 * Run once on first deploy or when adding a new indicator.
 */
export async function backfillAll(): Promise<void> {
  const startDate = new Date();
  startDate.setFullYear(startDate.getFullYear() - 5);
  const startStr = startDate.toISOString().slice(0, 10);

  console.log('[backfill] Fetching 5-year history from', startStr);

  for (const indicator of INDICATORS) {
    try {
      const obs = await fetchSeries(indicator.seriesId, startStr, indicator.fredUnits);
      for (const o of obs) {
        await upsertSnapshot(indicator.seriesId, o.date, o.value);
      }
      console.log(`[backfill] ${indicator.seriesId}: ${obs.length} observations`);
    } catch (err) {
      console.error(`[backfill] Failed ${indicator.seriesId}:`, err);
    }
  }
  console.log('[backfill] Complete');
}

/** Register the daily cron job. Call once at startup. */
export function startDailyFetchJob(): void {
  cron.schedule('0 6 * * *', async () => {
    console.log('[cron] Daily fetch triggered at', new Date().toISOString());
    await fetchAllIndicators();
  }, { timezone: 'UTC' });

  console.log('[cron] Daily fetch job scheduled for 06:00 UTC');
}
```

- [ ] **Update `server/src/index.ts` — add backfill + cron, finalize listen guard**

Replace the entire `index.ts` with this final version:

```typescript
import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { runMigrations } from './db/migrate.js';
import { backfillAll, startDailyFetchJob } from './jobs/dailyFetch.js';
import { computeRegime } from './services/regimeAnalysis.js';
import indicatorRoutes from './routes/indicators.js';
import pool from './db/client.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = parseInt(process.env.PORT || '3001');

app.use(cors());
app.use(express.json());

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// /api/regime MUST be registered before /api/indicators router
app.get('/api/regime', async (_req, res) => {
  const result = await computeRegime(pool);
  res.json(result);
});

app.use('/api/indicators', indicatorRoutes);

const clientDist = path.join(__dirname, '..', '..', 'client', 'dist');
app.use(express.static(clientDist));
app.get('/{*splat}', (_req, res) => {
  res.sendFile(path.join(clientDist, 'index.html'));
});

// Export BEFORE listen so tests can import app without binding a port
export default app;

// Only bind port outside of test environment
if (process.env.NODE_ENV !== 'test') {
  async function main() {
    await runMigrations();

    const { rows } = await pool.query('SELECT COUNT(*) as count FROM indicator_snapshots');
    if (parseInt(rows[0].count) === 0) {
      console.log('[startup] Empty DB — running 5-year backfill...');
      await backfillAll();
    }

    startDailyFetchJob();

    app.listen(PORT, () => {
      console.log(`Investment Dashboard API running on http://localhost:${PORT}`);
    });
  }
  main().catch(console.error);
}
```

- [ ] **Commit**

```bash
git add server/src/jobs/dailyFetch.ts server/src/index.ts
git commit -m "feat: daily FRED fetch cron + 5-year backfill on first deploy"
```

---

## Task 8: API Routes + Tests

**Files:**
- Create: `server/src/routes/indicators.ts`, `server/src/__tests__/routes.test.ts`
- Modify: `server/src/index.ts`

- [ ] **Write failing route tests** — `server/src/__tests__/routes.test.ts`

```typescript
import { describe, it, expect, vi, beforeAll } from 'vitest';
import request from 'supertest';

// Mock DB and analysis before importing app
vi.mock('../db/queries.js', () => ({
  getRecentSnapshots: vi.fn().mockResolvedValue([
    { date: '2024-03-01', value: 5.33 },
    { date: '2024-02-01', value: 5.25 },
  ]),
  getSnapshotsByMonths: vi.fn().mockResolvedValue([
    { date: '2023-03-01', value: 5.0 },
    { date: '2024-03-01', value: 5.33 },
  ]),
}));

vi.mock('../services/regimeAnalysis.js', () => ({
  computeRegime: vi.fn().mockResolvedValue({
    regime: 'Goldilocks',
    description: 'Test description',
    recommendedPosture: 'Overweight equities',
    alerts: [],
    computedAt: '2024-03-01T00:00:00.000Z',
  }),
}));

vi.mock('../db/migrate.js', () => ({ runMigrations: vi.fn() }));
vi.mock('../jobs/dailyFetch.js', () => ({ backfillAll: vi.fn(), startDailyFetchJob: vi.fn() }));
vi.mock('../db/client.js', () => ({ default: { query: vi.fn().mockResolvedValue({ rows: [{ count: '100' }] }) } }));

const app = (await import('../index.js')).default;

describe('GET /api/indicators', () => {
  it('returns array of indicator summaries', async () => {
    const res = await request(app).get('/api/indicators');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBe(14);
    const first = res.body[0];
    expect(first).toHaveProperty('seriesId');
    expect(first).toHaveProperty('latestValue');
    expect(first).toHaveProperty('status');
    expect(first).toHaveProperty('history');
    expect(Array.isArray(first.history)).toBe(true);
  });
});

describe('GET /api/regime', () => {
  it('returns regime with alerts and posture', async () => {
    const res = await request(app).get('/api/regime');
    expect(res.status).toBe(200);
    expect(res.body.regime).toBe('Goldilocks');
    expect(res.body).toHaveProperty('alerts');
    expect(res.body).toHaveProperty('recommendedPosture');
  });
});

describe('POST /api/indicators/:seriesId/refresh', () => {
  it('returns 401 without admin key', async () => {
    const res = await request(app).post('/api/indicators/FEDFUNDS/refresh');
    expect(res.status).toBe(401);
  });
});
```

- [ ] **Run tests — confirm they fail**

```bash
cd server && npm test -- routes.test.ts
```

- [ ] **Create `server/src/routes/indicators.ts`**

```typescript
import { Router } from 'express';
import { INDICATORS, INDICATOR_MAP, computeStatus } from '../config/indicators.js';
import { getRecentSnapshots, getSnapshotsByMonths } from '../db/queries.js';
import { computeRegime } from '../services/regimeAnalysis.js';
import { fetchLatest } from '../services/fred.js';
import { upsertSnapshot } from '../db/queries.js';
import pool from '../db/client.js';

const router = Router();

// GET /api/indicators — all indicators with latest value + 12-month sparkline
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

// GET /api/indicators/:seriesId — full history
router.get('/:seriesId', async (req, res) => {
  const config = INDICATOR_MAP.get(req.params.seriesId);
  if (!config) { res.status(404).json({ error: 'Indicator not found' }); return; }

  const months = parseInt(req.query.months as string || '60');
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

// POST /api/indicators/:seriesId/refresh (admin)
// NOTE: /api/regime is NOT defined here — it must be on app directly in index.ts
// BEFORE app.use('/api/indicators', router). Defining it here would make it
// reachable only at /api/indicators/regime, which is wrong.
router.post('/:seriesId/refresh', async (req, res) => {
  const adminKey = req.headers['x-admin-key'];
  if (!adminKey || adminKey !== process.env.ADMIN_KEY) {
    res.status(401).json({ error: 'Unauthorized' }); return;
  }
  const config = INDICATOR_MAP.get(req.params.seriesId);
  if (!config) { res.status(404).json({ error: 'Indicator not found' }); return; }

  const obs = await fetchLatest(config.seriesId, config.fredUnits);
  if (!obs) { res.status(502).json({ error: 'No data from FRED' }); return; }

  await upsertSnapshot(config.seriesId, obs.date, obs.value);
  res.json({ ok: true, date: obs.date, value: obs.value });
});

export default router;
```

- [ ] **Register routes in `server/src/index.ts`**

`/api/regime` MUST be registered on `app` directly, and BEFORE `app.use('/api/indicators', ...)`. Express matches routes in registration order; if the indicators router is mounted first, it would intercept `/api/indicators/regime` — but since the client calls `/api/regime` (not `/api/indicators/regime`) this is actually a separate concern. Regardless, keep regime on `app` for clarity:

```typescript
import indicatorRoutes from './routes/indicators.js';
import { computeRegime } from './services/regimeAnalysis.js';

// Register /api/regime BEFORE the /api/indicators router:
app.get('/api/regime', async (_req, res) => {
  const result = await computeRegime(pool);
  res.json(result);
});

app.use('/api/indicators', indicatorRoutes);
```

- [ ] **Run all tests**

```bash
cd server && npm test
# Expected: all tests pass
```

- [ ] **Commit**

```bash
git add server/src/routes/indicators.ts server/src/__tests__/routes.test.ts server/src/index.ts
git commit -m "feat: API routes with tests — /api/indicators and /api/regime"
```

---

## Task 9: Client Foundation

**Files:**
- Create: `client/package.json`, `client/tsconfig.json`, `client/vite.config.ts`, `client/index.html`, `client/src/main.tsx`, `client/src/App.tsx`, `client/src/index.css`

- [ ] **Create `client/package.json`** (mirrors Pulse exactly, adds recharts already present)

```json
{
  "name": "investment-dashboard-client",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "react": "^19.1.0",
    "react-dom": "^19.1.0",
    "recharts": "^2.15.3",
    "lucide-react": "^0.503.0",
    "clsx": "^2.1.1",
    "date-fns": "^4.1.0"
  },
  "devDependencies": {
    "@types/react": "^19.1.2",
    "@types/react-dom": "^19.1.2",
    "@vitejs/plugin-react": "^4.4.1",
    "@tailwindcss/vite": "^4.1.3",
    "tailwindcss": "^4.1.3",
    "typescript": "^5.8.2",
    "vite": "^6.3.2"
  }
}
```

- [ ] **Create `client/vite.config.ts`** (identical to Pulse)

```typescript
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { alias: { '@': path.resolve(__dirname, 'src') } },
  server: {
    port: 5173,
    proxy: { '/api': 'http://localhost:3001' }
  },
  build: { outDir: 'dist' }
});
```

- [ ] **Create `client/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "strict": true,
    "noEmit": true,
    "baseUrl": ".",
    "paths": { "@/*": ["src/*"] }
  },
  "include": ["src"]
}
```

- [ ] **Create `client/index.html`**

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Investment Dashboard</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Create `client/src/index.css`**

```css
@import "tailwindcss";

@theme {
  --color-primary: #6366f1;
  --color-primary-dark: #4f46e5;
  --color-sidebar: #1e1b4b;
  --color-sidebar-text: #c7d2fe;
  --color-good: #22c55e;
  --color-warning: #f59e0b;
  --color-danger: #ef4444;
  --font-sans: 'Inter', system-ui, sans-serif;
}

* { box-sizing: border-box; }
body { margin: 0; font-family: var(--font-sans); background: #f8fafc; }
```

- [ ] **Create `client/src/main.tsx`**

```tsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App.js';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
```

- [ ] **Create `client/src/App.tsx`** (placeholder)

```tsx
import React from 'react';
import Dashboard from './pages/Dashboard.js';

export default function App(): React.ReactElement {
  return <Dashboard />;
}
```

- [ ] **Install and verify build**

```bash
cd client && npm install && npx vite build
# Expected: dist/ created, no TypeScript errors
```

- [ ] **Commit**

```bash
git add client/
git commit -m "feat: client foundation — Vite + React 19 + Tailwind CSS 4"
```

---

## Task 10: Client Types + Data Hooks

**Files:**
- Create: `client/src/types/indicators.ts`, `client/src/hooks/useIndicators.ts`, `client/src/hooks/useRegime.ts`

- [ ] **Create `client/src/types/indicators.ts`**

```typescript
export type IndicatorStatus = 'good' | 'warning' | 'danger' | 'unknown';

export type IndicatorCategory =
  | 'Monetary Policy'
  | 'Inflation'
  | 'Growth & Activity'
  | 'Labor Market'
  | 'Risk & Sentiment'
  | 'Liquidity & Valuation';

export type RegimeLabel = 'Goldilocks' | 'Inflationary Growth' | 'Stagflation' | 'Risk-Off';

export interface ThresholdRange { min?: number; max?: number; label: string; }

export interface IndicatorSummary {
  seriesId: string;
  name: string;
  category: IndicatorCategory;
  unit: string;
  format: 'percent' | 'basis_points' | 'number' | 'currency';
  description: string;
  educationalText: string;
  historicalContext: string;
  thresholds: { danger: ThresholdRange[]; warning: ThresholdRange[]; good: ThresholdRange[] };
  latestValue: number | null;
  latestDate: string | null;
  previousValue: number | null;
  delta: number | null;
  status: IndicatorStatus;
  history: { date: string; value: number }[];
}

export interface RegimeAlert {
  seriesId: string;
  name: string;
  status: IndicatorStatus;
  message: string;
}

export interface RegimeResponse {
  regime: RegimeLabel;
  description: string;
  recommendedPosture: string;
  alerts: RegimeAlert[];
  computedAt: string;
}
```

- [ ] **Create `client/src/hooks/useIndicators.ts`**

```typescript
import { useState, useEffect } from 'react';
import type { IndicatorSummary } from '../types/indicators.js';

export function useIndicators() {
  const [data, setData] = useState<IndicatorSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/indicators')
      .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
      .then(setData)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  return { data, loading, error };
}

export function useIndicatorDetail(seriesId: string, months = 60) {
  const [data, setData] = useState<IndicatorSummary | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!seriesId) return;
    setLoading(true);
    fetch(`/api/indicators/${seriesId}?months=${months}`)
      .then(r => r.json())
      .then(setData)
      .finally(() => setLoading(false));
  }, [seriesId, months]);

  return { data, loading };
}
```

- [ ] **Create `client/src/hooks/useRegime.ts`**

```typescript
import { useState, useEffect } from 'react';
import type { RegimeResponse } from '../types/indicators.js';

export function useRegime() {
  const [data, setData] = useState<RegimeResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/regime')
      .then(r => r.json())
      .then(setData)
      .finally(() => setLoading(false));
  }, []);

  return { data, loading };
}
```

- [ ] **Commit**

```bash
git add client/src/types/ client/src/hooks/
git commit -m "feat: client types and data hooks"
```

---

## Task 11: UI Primitives — StatusBadge, InfoModal, Sparkline

**Files:**
- Create: `client/src/components/ui/StatusBadge.tsx`, `client/src/components/ui/InfoModal.tsx`, `client/src/components/indicators/Sparkline.tsx`

- [ ] **Create `client/src/components/ui/StatusBadge.tsx`**

```tsx
import React from 'react';
import clsx from 'clsx';
import type { IndicatorStatus } from '../../types/indicators.js';

interface Props { status: IndicatorStatus; label?: string; }

const CONFIG: Record<IndicatorStatus, { dot: string; bg: string; text: string; defaultLabel: string }> = {
  good:    { dot: 'bg-green-500',  bg: 'bg-green-50',  text: 'text-green-700',  defaultLabel: 'Good' },
  warning: { dot: 'bg-amber-500',  bg: 'bg-amber-50',  text: 'text-amber-700',  defaultLabel: 'Watch' },
  danger:  { dot: 'bg-red-500',    bg: 'bg-red-50',    text: 'text-red-700',    defaultLabel: 'Alert' },
  unknown: { dot: 'bg-gray-400',   bg: 'bg-gray-50',   text: 'text-gray-500',   defaultLabel: 'No data' },
};

export default function StatusBadge({ status, label }: Props): React.ReactElement {
  const c = CONFIG[status];
  return (
    <span className={clsx('inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium', c.bg, c.text)}>
      <span className={clsx('w-1.5 h-1.5 rounded-full', c.dot)} />
      {label ?? c.defaultLabel}
    </span>
  );
}
```

- [ ] **Create `client/src/components/ui/InfoModal.tsx`**

```tsx
import React from 'react';
import { X } from 'lucide-react';
import type { IndicatorSummary } from '../../types/indicators.js';
import StatusBadge from './StatusBadge.js';

interface Props {
  indicator: IndicatorSummary;
  onClose: () => void;
  onExpand: () => void;
}

export default function InfoModal({ indicator, onClose, onExpand }: Props): React.ReactElement {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-4 p-6"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex justify-between items-start mb-4">
          <div>
            <h2 className="text-xl font-semibold text-gray-900">{indicator.name}</h2>
            <p className="text-sm text-gray-500 mt-0.5">{indicator.category}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X size={20} />
          </button>
        </div>

        <StatusBadge status={indicator.status} />

        <p className="mt-4 text-sm text-gray-700 leading-relaxed">{indicator.educationalText}</p>

        <div className="mt-4 p-3 bg-indigo-50 rounded-lg">
          <p className="text-xs font-medium text-indigo-700 mb-1">Historical Context</p>
          <p className="text-xs text-indigo-600 leading-relaxed">{indicator.historicalContext}</p>
        </div>

        <div className="mt-4 grid grid-cols-3 gap-2 text-xs">
          {indicator.thresholds.good.map((t, i) => (
            <div key={i} className="bg-green-50 rounded p-2">
              <span className="text-green-600 font-medium block">🟢 Good</span>
              <span className="text-green-700">{t.label}</span>
            </div>
          ))}
          {indicator.thresholds.warning.map((t, i) => (
            <div key={i} className="bg-amber-50 rounded p-2">
              <span className="text-amber-600 font-medium block">🟡 Watch</span>
              <span className="text-amber-700">{t.label}</span>
            </div>
          ))}
          {indicator.thresholds.danger.map((t, i) => (
            <div key={i} className="bg-red-50 rounded p-2">
              <span className="text-red-600 font-medium block">🔴 Danger</span>
              <span className="text-red-700">{t.label}</span>
            </div>
          ))}
        </div>

        <button
          onClick={onExpand}
          className="mt-5 w-full py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 transition"
        >
          View Full Chart →
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Create `client/src/components/indicators/Sparkline.tsx`**

```tsx
import React from 'react';
import { LineChart, Line, ResponsiveContainer, Tooltip } from 'recharts';

interface Props {
  data: { date: string; value: number }[];
  color?: string;
}

export default function Sparkline({ data, color = '#6366f1' }: Props): React.ReactElement {
  return (
    <ResponsiveContainer width="100%" height={48}>
      <LineChart data={data}>
        <Line
          type="monotone"
          dataKey="value"
          stroke={color}
          strokeWidth={1.5}
          dot={false}
          isAnimationActive={false}
        />
        <Tooltip
          contentStyle={{ fontSize: 11, padding: '2px 6px', border: 'none', background: '#1e1b4b', color: '#fff', borderRadius: 4 }}
          formatter={(v: number) => v.toFixed(2)}
          labelFormatter={() => ''}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
```

- [ ] **Commit**

```bash
git add client/src/components/ui/ client/src/components/indicators/Sparkline.tsx
git commit -m "feat: StatusBadge, InfoModal, Sparkline components"
```

---

## Task 12: IndicatorCard + IndicatorGroup

**Files:**
- Create: `client/src/components/indicators/IndicatorCard.tsx`, `client/src/components/indicators/IndicatorGroup.tsx`

- [ ] **Create `client/src/components/indicators/IndicatorCard.tsx`**

```tsx
import React, { useState } from 'react';
import { Info, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import clsx from 'clsx';
import type { IndicatorSummary } from '../../types/indicators.js';
import StatusBadge from '../ui/StatusBadge.js';
import Sparkline from './Sparkline.js';
import InfoModal from '../ui/InfoModal.js';

const STATUS_SPARKLINE_COLOR: Record<string, string> = {
  good: '#22c55e', warning: '#f59e0b', danger: '#ef4444', unknown: '#9ca3af',
};

interface Props {
  indicator: IndicatorSummary;
  onExpand: (seriesId: string) => void;
}

export default function IndicatorCard({ indicator, onExpand }: Props): React.ReactElement {
  const [showInfo, setShowInfo] = useState(false);

  const formatValue = (v: number | null): string => {
    if (v === null) return '—';
    if (indicator.format === 'basis_points') return `${v.toFixed(0)}bps`;
    if (indicator.format === 'percent') return `${v.toFixed(2)}%`;
    if (indicator.unit === 'K') return `${(v / 1000).toFixed(0)}K`;
    return v.toFixed(2);
  };

  const DeltaIcon = indicator.delta === null ? Minus
    : indicator.delta > 0 ? TrendingUp : TrendingDown;
  const deltaColor = indicator.delta === null ? 'text-gray-400'
    : indicator.delta > 0 ? 'text-red-500' : 'text-green-500'; // up = bad for most macro indicators

  return (
    <>
      <div
        className={clsx(
          'bg-white rounded-2xl border p-4 cursor-pointer hover:shadow-md transition-shadow',
          indicator.status === 'danger' && 'border-red-200',
          indicator.status === 'warning' && 'border-amber-200',
          indicator.status === 'good' && 'border-gray-100',
        )}
        onClick={() => onExpand(indicator.seriesId)}
      >
        {/* Header */}
        <div className="flex justify-between items-start mb-2">
          <p className="text-xs font-medium text-gray-500 leading-tight flex-1 pr-2">{indicator.name}</p>
          <button
            className="text-gray-300 hover:text-indigo-400 transition flex-shrink-0"
            onClick={e => { e.stopPropagation(); setShowInfo(true); }}
          >
            <Info size={14} />
          </button>
        </div>

        {/* Value */}
        <div className="flex items-baseline gap-2 mb-1">
          <span className="text-2xl font-bold text-gray-900">{formatValue(indicator.latestValue)}</span>
          {indicator.delta !== null && (
            <span className={clsx('flex items-center text-xs font-medium', deltaColor)}>
              <DeltaIcon size={12} className="mr-0.5" />
              {Math.abs(indicator.delta).toFixed(2)}
            </span>
          )}
        </div>

        <StatusBadge status={indicator.status} />

        {/* Sparkline */}
        <div className="mt-3 -mx-1">
          <Sparkline
            data={indicator.history}
            color={STATUS_SPARKLINE_COLOR[indicator.status]}
          />
        </div>
      </div>

      {showInfo && (
        <InfoModal
          indicator={indicator}
          onClose={() => setShowInfo(false)}
          onExpand={() => { setShowInfo(false); onExpand(indicator.seriesId); }}
        />
      )}
    </>
  );
}
```

- [ ] **Create `client/src/components/indicators/IndicatorGroup.tsx`**

```tsx
import React, { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import type { IndicatorSummary } from '../../types/indicators.js';
import IndicatorCard from './IndicatorCard.js';

interface Props {
  category: string;
  indicators: IndicatorSummary[];
  onExpand: (seriesId: string) => void;
  defaultOpen?: boolean;
}

export default function IndicatorGroup({ category, indicators, onExpand, defaultOpen = true }: Props): React.ReactElement {
  const [open, setOpen] = useState(defaultOpen);
  const dangerCount = indicators.filter(i => i.status === 'danger').length;
  const warningCount = indicators.filter(i => i.status === 'warning').length;

  return (
    <section id={category.replace(/\s+/g, '-').toLowerCase()} className="mb-8">
      <button
        className="flex items-center gap-3 w-full text-left mb-4 group"
        onClick={() => setOpen(o => !o)}
      >
        {open ? <ChevronDown size={18} className="text-gray-400" /> : <ChevronRight size={18} className="text-gray-400" />}
        <h2 className="text-base font-semibold text-gray-800 group-hover:text-indigo-600 transition">{category}</h2>
        <div className="flex gap-1 ml-2">
          {dangerCount > 0 && (
            <span className="text-xs bg-red-100 text-red-600 px-1.5 py-0.5 rounded-full font-medium">{dangerCount} alert</span>
          )}
          {warningCount > 0 && (
            <span className="text-xs bg-amber-100 text-amber-600 px-1.5 py-0.5 rounded-full font-medium">{warningCount} watch</span>
          )}
        </div>
      </button>

      {open && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {indicators.map(ind => (
            <IndicatorCard key={ind.seriesId} indicator={ind} onExpand={onExpand} />
          ))}
        </div>
      )}
    </section>
  );
}
```

- [ ] **Commit**

```bash
git add client/src/components/indicators/
git commit -m "feat: IndicatorCard and IndicatorGroup components"
```

---

## Task 13: IndicatorChart (Expanded Modal)

**Files:**
- Create: `client/src/components/indicators/IndicatorChart.tsx`

- [ ] **Create `client/src/components/indicators/IndicatorChart.tsx`**

```tsx
import React, { useState } from 'react';
import { X } from 'lucide-react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceArea, ReferenceLine
} from 'recharts';
import { format, parseISO } from 'date-fns';
import type { IndicatorSummary } from '../../types/indicators.js';
import { useIndicatorDetail } from '../../hooks/useIndicators.js';
import StatusBadge from '../ui/StatusBadge.js';

interface Props {
  seriesId: string;
  onClose: () => void;
}

const TIME_RANGES = [
  { label: '1Y', months: 12 },
  { label: '2Y', months: 24 },
  { label: '5Y', months: 60 },
];

export default function IndicatorChart({ seriesId, onClose }: Props): React.ReactElement {
  const [months, setMonths] = useState(60);
  const { data, loading } = useIndicatorDetail(seriesId, months);

  if (loading || !data) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
        <div className="bg-white rounded-2xl p-8 text-gray-500">Loading chart...</div>
      </div>
    );
  }

  const chartData = data.history.map(r => ({
    date: r.date,
    value: r.value,
    label: format(parseISO(r.date), 'MMM yyyy'),
  }));

  const allValues = data.history.map(r => r.value);
  const minVal = Math.min(...allValues);
  const maxVal = Math.max(...allValues);
  const pad = (maxVal - minVal) * 0.1;
  const yMin = minVal - pad;
  const yMax = maxVal + pad;

  const formatValue = (v: number) => {
    if (data.format === 'basis_points') return `${v.toFixed(0)}bps`;
    if (data.format === 'percent') return `${v.toFixed(2)}%`;
    return v.toFixed(2);
  };

  // Build threshold reference areas for chart visualization
  // We draw bands based on known threshold values for each indicator
  const getThresholdBands = () => {
    // Find the primary good/warning/danger boundaries from threshold labels
    // Simple approach: draw reference lines at key thresholds
    const lines: { y: number; color: string; label: string }[] = [];
    const addBoundary = (ranges: typeof data.thresholds.good, color: string) => {
      for (const r of ranges) {
        if (r.min !== undefined) lines.push({ y: r.min, color, label: r.label });
        if (r.max !== undefined) lines.push({ y: r.max, color, label: r.label });
      }
    };
    addBoundary(data.thresholds.danger, '#fecaca');
    addBoundary(data.thresholds.warning, '#fde68a');
    return lines;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex justify-between items-start p-6 pb-4 border-b">
          <div>
            <h2 className="text-xl font-bold text-gray-900">{data.name}</h2>
            <p className="text-sm text-gray-500">{data.category}</p>
          </div>
          <div className="flex items-center gap-3">
            <StatusBadge status={data.status} />
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Time range toggle */}
        <div className="flex gap-1 px-6 pt-4">
          {TIME_RANGES.map(r => (
            <button
              key={r.months}
              onClick={() => setMonths(r.months)}
              className={`px-3 py-1 rounded-lg text-sm font-medium transition ${
                months === r.months
                  ? 'bg-indigo-600 text-white'
                  : 'text-gray-500 hover:bg-gray-100'
              }`}
            >
              {r.label}
            </button>
          ))}
          <div className="ml-auto text-sm text-gray-500">
            <span className="font-bold text-2xl text-gray-900">{formatValue(data.latestValue ?? 0)}</span>
            <span className="ml-2">{data.latestDate}</span>
          </div>
        </div>

        {/* Chart */}
        <div className="px-6 py-4">
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={chartData} margin={{ top: 10, right: 10, bottom: 0, left: 10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 10, fill: '#94a3b8' }}
                tickLine={false}
                interval="preserveStartEnd"
              />
              <YAxis
                tick={{ fontSize: 10, fill: '#94a3b8' }}
                tickLine={false}
                axisLine={false}
                domain={[yMin, yMax]}
                tickFormatter={formatValue}
                width={60}
              />
              <Tooltip
                formatter={(v: number) => [formatValue(v), data.name]}
                labelStyle={{ fontSize: 11, color: '#64748b' }}
                contentStyle={{ borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 12 }}
              />

              {/* Threshold reference lines */}
              {getThresholdBands().map((line, i) => (
                <ReferenceLine
                  key={i}
                  y={line.y}
                  stroke={line.color}
                  strokeDasharray="4 4"
                  label={{ value: line.label, fontSize: 9, fill: '#94a3b8', position: 'right' }}
                />
              ))}

              {/* Zero line for yield curve */}
              {seriesId === 'T10Y2Y' && (
                <ReferenceLine y={0} stroke="#ef4444" strokeWidth={1.5} label={{ value: 'Inversion', fontSize: 10, fill: '#ef4444', position: 'left' }} />
              )}

              <Line
                type="monotone"
                dataKey="value"
                stroke="#6366f1"
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4, fill: '#6366f1' }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Educational panel */}
        <div className="mx-6 mb-6 p-4 bg-slate-50 rounded-xl">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">About this indicator</p>
          <p className="text-sm text-slate-700 leading-relaxed">{data.educationalText}</p>
          <p className="text-xs text-indigo-600 mt-2 font-medium">{data.historicalContext}</p>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Commit**

```bash
git add client/src/components/indicators/IndicatorChart.tsx
git commit -m "feat: IndicatorChart modal with threshold bands"
```

---

## Task 14: MacroRegimeCard + AlertsPanel + Layout

**Files:**
- Create: `client/src/components/analysis/MacroRegimeCard.tsx`, `client/src/components/analysis/AlertsPanel.tsx`, `client/src/components/layout/Sidebar.tsx`, `client/src/components/layout/TopBar.tsx`

- [ ] **Create `client/src/components/analysis/MacroRegimeCard.tsx`**

```tsx
import React from 'react';
import type { RegimeResponse } from '../../types/indicators.js';

const REGIME_CONFIG = {
  'Goldilocks':          { emoji: '🟢', color: 'bg-green-50 border-green-200', textColor: 'text-green-800', badgeColor: 'bg-green-100 text-green-700' },
  'Inflationary Growth': { emoji: '🟡', color: 'bg-amber-50 border-amber-200', textColor: 'text-amber-800', badgeColor: 'bg-amber-100 text-amber-700' },
  'Stagflation':         { emoji: '🟠', color: 'bg-orange-50 border-orange-200', textColor: 'text-orange-800', badgeColor: 'bg-orange-100 text-orange-700' },
  'Risk-Off':            { emoji: '🔴', color: 'bg-red-50 border-red-200', textColor: 'text-red-800', badgeColor: 'bg-red-100 text-red-700' },
};

interface Props { regime: RegimeResponse | null; loading: boolean; }

export default function MacroRegimeCard({ regime, loading }: Props): React.ReactElement {
  if (loading || !regime) {
    return <div className="h-28 bg-white rounded-2xl border animate-pulse mb-8" />;
  }
  const c = REGIME_CONFIG[regime.regime];

  return (
    <div className={`rounded-2xl border p-5 mb-8 ${c.color}`}>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1">Current Macro Regime</p>
          <h1 className={`text-2xl font-bold ${c.textColor}`}>{c.emoji} {regime.regime}</h1>
          <p className="text-sm text-gray-600 mt-1">{regime.description}</p>
        </div>
        <div className="text-right">
          <p className="text-xs text-gray-500 mb-1">Recommended Posture</p>
          <p className={`text-sm font-medium px-3 py-1 rounded-full ${c.badgeColor}`}>{regime.recommendedPosture}</p>
        </div>
      </div>
      {regime.alerts.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {regime.alerts.map(a => (
            <span
              key={a.seriesId}
              className={`text-xs px-2 py-1 rounded-full ${a.status === 'danger' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'}`}
            >
              {a.status === 'danger' ? '🔴' : '🟡'} {a.name}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Create `client/src/components/layout/Sidebar.tsx`**

```tsx
import React from 'react';
import { BarChart3, TrendingUp, Activity, Users, AlertTriangle, DollarSign } from 'lucide-react';
import clsx from 'clsx';

const CATEGORIES = [
  { name: 'Monetary Policy',       icon: BarChart3,     href: '#monetary-policy' },
  { name: 'Inflation',             icon: TrendingUp,    href: '#inflation' },
  { name: 'Growth & Activity',     icon: Activity,      href: '#growth-&-activity' },
  { name: 'Labor Market',          icon: Users,         href: '#labor-market' },
  { name: 'Risk & Sentiment',      icon: AlertTriangle, href: '#risk-&-sentiment' },
  { name: 'Liquidity & Valuation', icon: DollarSign,    href: '#liquidity-&-valuation' },
];

export default function Sidebar(): React.ReactElement {
  return (
    <aside className="w-56 flex-shrink-0 h-screen sticky top-0 bg-[#1e1b4b] flex flex-col">
      <div className="p-5 border-b border-indigo-900">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 bg-indigo-400 rounded-lg flex items-center justify-center text-white font-bold text-sm">M</div>
          <span className="text-white font-semibold text-sm">Macro Dashboard</span>
        </div>
      </div>

      <nav className="flex-1 p-3 overflow-y-auto">
        <p className="text-indigo-400 text-xs font-semibold uppercase tracking-wide px-2 mb-2">Indicators</p>
        {CATEGORIES.map(({ name, icon: Icon, href }) => (
          <a
            key={name}
            href={href}
            className={clsx(
              'flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition mb-0.5',
              'text-indigo-200 hover:bg-indigo-800 hover:text-white'
            )}
          >
            <Icon size={16} />
            <span>{name}</span>
          </a>
        ))}
      </nav>

      <div className="p-4 border-t border-indigo-900 text-xs text-indigo-400">
        Data: FRED API · Refreshes 6am UTC
      </div>
    </aside>
  );
}
```

- [ ] **Commit**

```bash
git add client/src/components/analysis/ client/src/components/layout/
git commit -m "feat: MacroRegimeCard, AlertsPanel, Sidebar layout"
```

---

## Task 15: Dashboard Page Assembly

**Files:**
- Create: `client/src/pages/Dashboard.tsx`

- [ ] **Create `client/src/pages/Dashboard.tsx`**

```tsx
import React, { useState } from 'react';
import { useIndicators } from '../hooks/useIndicators.js';
import { useRegime } from '../hooks/useRegime.js';
import Sidebar from '../components/layout/Sidebar.js';
import MacroRegimeCard from '../components/analysis/MacroRegimeCard.js';
import IndicatorGroup from '../components/indicators/IndicatorGroup.js';
import IndicatorChart from '../components/indicators/IndicatorChart.js';
import type { IndicatorCategory } from '../types/indicators.js';

const CATEGORY_ORDER: IndicatorCategory[] = [
  'Monetary Policy',
  'Inflation',
  'Growth & Activity',
  'Labor Market',
  'Risk & Sentiment',
  'Liquidity & Valuation',
];

export default function Dashboard(): React.ReactElement {
  const { data: indicators, loading: indLoading } = useIndicators();
  const { data: regime, loading: regLoading } = useRegime();
  const [expandedSeries, setExpandedSeries] = useState<string | null>(null);

  const grouped = CATEGORY_ORDER.map(cat => ({
    category: cat,
    indicators: indicators.filter(i => i.category === cat),
  }));

  return (
    <div className="flex min-h-screen bg-gray-50">
      <Sidebar />

      <main className="flex-1 p-8 overflow-y-auto">
        <div className="max-w-7xl mx-auto">
          {/* Page header */}
          <div className="mb-6">
            <h1 className="text-2xl font-bold text-gray-900">Macro Dashboard</h1>
            <p className="text-sm text-gray-500 mt-1">
              {new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
            </p>
          </div>

          {/* Regime banner */}
          <MacroRegimeCard regime={regime} loading={regLoading} />

          {/* Indicator groups */}
          {indLoading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {Array.from({ length: 12 }).map((_, i) => (
                <div key={i} className="h-40 bg-white rounded-2xl border animate-pulse" />
              ))}
            </div>
          ) : (
            grouped.map(({ category, indicators }) =>
              indicators.length > 0 ? (
                <IndicatorGroup
                  key={category}
                  category={category}
                  indicators={indicators}
                  onExpand={setExpandedSeries}
                  defaultOpen={true}
                />
              ) : null
            )
          )}
        </div>
      </main>

      {/* Expanded chart modal */}
      {expandedSeries && (
        <IndicatorChart
          seriesId={expandedSeries}
          onClose={() => setExpandedSeries(null)}
        />
      )}
    </div>
  );
}
```

- [ ] **Verify full dev build works**

```bash
# In one terminal:
cd server && npm run dev

# In another terminal:
cd client && npm run dev
# Open http://localhost:5173 — dashboard should render with loading skeletons
# (No data yet if FRED_API_KEY not set)
```

- [ ] **Verify production build**

```bash
cd client && npx vite build
# Expected: no TypeScript errors, dist/ created
```

- [ ] **Commit**

```bash
git add client/src/pages/Dashboard.tsx
git commit -m "feat: Dashboard page assembly — full UI wired up"
```

---

## Task 16: Claude Analysis Skill

**Files:**
- Create: `skills/investment-analysis.md`

- [ ] **Create `skills/investment-analysis.md`**

````markdown
---
name: investment-analysis
description: Analyze current macroeconomic indicators from the investment dashboard database and produce an investment strategy report with macro regime, triggered alerts, trend analysis, and recommended allocation posture.
---

# Investment Analysis Skill

Connect to the Railway PostgreSQL database, fetch all 14 indicator snapshots, analyze trends, evaluate threshold rules, classify the macro regime, and output a structured investment strategy report.

## Steps

1. Connect to `$DATABASE_URL` (same Railway PostgreSQL as the investment-dashboard app)

2. For each of the 14 FRED series, fetch the last 90 days of snapshots:
   ```sql
   SELECT series_id, date::text, value::float
   FROM indicator_snapshots
   WHERE date >= NOW() - INTERVAL '90 days'
   ORDER BY series_id, date DESC;
   ```

3. For each indicator, compute:
   - Latest value and the date it was recorded
   - 30-day trend: is the value improving, deteriorating, or stable? (compare latest vs value 30 days ago)
   - Status: good / warning / danger (apply threshold rules from the spec)

4. Apply special multi-point rules:
   - **Sahm Rule** (UNRATE): fetch 13 months of data, compute 3-month rolling avg vs 12-month min
   - **Yield Curve Streak** (T10Y2Y): is the spread negative for 5+ consecutive days?
   - **PMI Contraction** (NAPM): has it been below 50 for 2+ consecutive months?

5. Classify macro regime using Investment Clock logic:
   - PMI and Consumer Confidence → growth axis (expanding or contracting)
   - Core CPI and Breakeven Inflation → inflation axis (tame or elevated)
   - HY Spreads and Yield Curve → stress axis
   - Map to: Goldilocks / Inflationary Growth / Stagflation / Risk-Off

6. Generate output in this format:

```
═══════════════════════════════════════════════════
  MACRO INVESTMENT ANALYSIS
  {current date}
═══════════════════════════════════════════════════

MACRO REGIME: {emoji} {regime name}
{one-sentence description}

RECOMMENDED POSTURE:
{2-3 sentences on allocation direction}

TRIGGERED ALERTS:
{list any indicator in warning or danger status with value and threshold}

TREND ANALYSIS BY CATEGORY:
  Monetary Policy:    {improving/stable/deteriorating} — {1 sentence}
  Inflation:          {improving/stable/deteriorating} — {1 sentence}
  Growth & Activity:  {improving/stable/deteriorating} — {1 sentence}
  Labor Market:       {improving/stable/deteriorating} — {1 sentence}
  Risk & Sentiment:   {improving/stable/deteriorating} — {1 sentence}
  Liquidity:          {improving/stable/deteriorating} — {1 sentence}

WATCH THIS WEEK:
  {The single most important signal to monitor right now, and why}

DATA FRESHNESS:
  Last FRED fetch: {most recent fetched_at timestamp}
  Oldest data point: {oldest date in results}
═══════════════════════════════════════════════════
```

Use Claude API to synthesize the trend analysis and posture sections. Keep analysis grounded in the threshold rules from the spec — avoid speculation beyond what the data supports.
````

- [ ] **Commit**

```bash
git add skills/investment-analysis.md
git commit -m "feat: investment-analysis Claude skill"
```

---

## Task 17: Deployment Verification

**Files:**
- Verify: `railway.json`, `nixpacks.toml`, root `package.json`

- [ ] **Confirm full production build passes end-to-end**

```bash
cd /path/to/investment-dashboard
npm install
npm run build
# Expected: client/dist/ built, server/dist/ built, no TypeScript errors
```

- [ ] **Create GitHub repository and push**

```bash
git remote add origin https://github.com/<your-username>/investment-dashboard.git
git push -u origin master
```

- [ ] **On Railway: create new project**
  - New Project → Deploy from GitHub repo → select `investment-dashboard`
  - Add PostgreSQL plugin
  - Set environment variables:
    - `FRED_API_KEY` — get free key at https://fred.stlouisfed.org/docs/api/api_key.html
    - `DATABASE_URL` — copy from Railway PostgreSQL plugin
    - `ADMIN_KEY` — any secret string
  - Railway auto-deploys on push

- [ ] **Verify deployment**

```bash
# Once Railway deploy completes:
curl https://<your-app>.up.railway.app/api/health
# Expected: {"status":"ok","timestamp":"..."}

curl https://<your-app>.up.railway.app/api/regime
# Expected: regime JSON (after backfill completes on first deploy)
```

- [ ] **Final commit**

```bash
git add .
git commit -m "chore: deployment verified on Railway"
git push origin master
```

---

## Summary

| Task | Deliverable | Tests |
|------|-------------|-------|
| 1 | Project scaffolding | — |
| 2 | Server + Express + pg | Health check manual |
| 3 | DB schema + queries | Manual verify |
| 4 | Indicator registry (14 indicators) | — |
| 5 | FRED API client | Unit tests |
| 6 | Regime analysis engine | Unit tests (TDD) |
| 7 | Daily fetch cron + backfill | Manual verify |
| 8 | API routes | Supertest integration tests |
| 9 | Client foundation | Build verify |
| 10 | Types + hooks | TypeScript compile |
| 11 | StatusBadge, InfoModal, Sparkline | Visual |
| 12 | IndicatorCard + IndicatorGroup | Visual |
| 13 | IndicatorChart modal | Visual |
| 14 | MacroRegimeCard + Sidebar | Visual |
| 15 | Dashboard page assembly | Full dev verify |
| 16 | Claude analysis skill | Manual run |
| 17 | Railway deployment | Live URL verify |

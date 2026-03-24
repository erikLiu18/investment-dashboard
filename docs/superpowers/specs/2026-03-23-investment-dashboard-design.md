# Investment Dashboard — Design Spec
**Date:** 2026-03-23
**Author:** Mingxiao Song
**Status:** Approved

---

## Overview

A personal macro-economic investment dashboard deployed on Railway, modeled after the Pulse app architecture. Tracks 14 macroeconomic indicators grouped into 6 categories, with daily data fetched from FRED API, threshold-based alert rules, a visual chart interface with educational overlays, and a local Claude skill for periodic trend analysis and investment strategy recommendations.

The system is designed to grow: adding a new indicator requires only one entry in the central indicator registry — no changes to fetch logic, DB schema, UI components, or analysis engine.

---

## Indicator Registry

### Group 1 — Monetary Policy
| Indicator | FRED Series | Good | Warning | Danger |
|-----------|-------------|------|---------|--------|
| Fed Funds Rate | `FEDFUNDS` | Stable / declining | Rising rapidly | >5.5% in tightening cycle |
| 10Y Treasury Yield | `DGS10` | 2–4% | >4.5% | >5.5% |
| 2Y-10Y Yield Curve | `T10Y2Y` | >0.5% | 0–0.5% | <0% (inverted) |
| 10Y Breakeven Inflation | `T10YIE` | 1.5–2.5% | 2.5–3% | >3% or <1% |

### Group 2 — Inflation
| Indicator | FRED Series | Good | Warning | Danger |
|-----------|-------------|------|---------|--------|
| Core CPI (YoY) | `CPILFESL` | <2.5% | 2.5–3.5% | >3.5% |

### Group 3 — Growth & Activity
| Indicator | FRED Series | Good | Warning | Danger |
|-----------|-------------|------|---------|--------|
| ISM Manufacturing PMI | `NAPM` | >52 | 50–52 or 48–50 | <48 |
| ISM Services PMI | `NAPMNONMAN` | >53 | 50–53 | <50 |

### Group 4 — Labor Market
| Indicator | FRED Series | Good | Warning | Danger |
|-----------|-------------|------|---------|--------|
| Unemployment Rate | `UNRATE` | <4% | 4–5% | >5% or Sahm Rule triggered |
| Initial Jobless Claims | `ICSA` | <220K | 220–280K | >280K or rising trend |

### Group 5 — Risk & Sentiment
| Indicator | FRED Series | Good | Warning | Danger |
|-----------|-------------|------|---------|--------|
| HY Credit Spreads | `BAMLH0A0HYM2` | <300bps | 300–500bps | >500bps |
| VIX | `VIXCLS` | <15 | 15–30 | >30 |
| Consumer Confidence (U of M) | `UMCSENT` | >80 | 65–80 | <65 |
| DXY (Dollar Index) | `DTWEXBGS` | 95–105 | >110 or <90 | Rapid sustained move |

### Group 6 — Liquidity & Valuation
| Indicator | FRED Series | Good | Warning | Danger |
|-----------|-------------|------|---------|--------|
| M2 Money Supply (YoY growth) | `M2SL` | 4–8% | 0–4% or 8–12% | <0% or >12% |

---

## Architecture

### Stack
- **Client:** React 19 + Vite + Tailwind CSS 4 (`client/`)
- **Server:** Express 5 + TypeScript + PostgreSQL (`server/`)
- **Workspace:** npm workspaces (mirrors Pulse exactly)
- **Deployment:** Railway via `railway.json` + `nixpacks.toml`, auto-deploy from GitHub

### Project Structure
```
investment-dashboard/
├── client/
│   ├── src/
│   │   ├── components/
│   │   │   ├── layout/           # Sidebar, TopBar
│   │   │   ├── indicators/       # IndicatorCard, IndicatorChart, IndicatorGroup
│   │   │   ├── analysis/         # MacroRegimeCard, AlertsPanel
│   │   │   └── ui/               # InfoModal, StatusBadge, Tooltip
│   │   ├── pages/
│   │   │   └── Dashboard.tsx
│   │   └── types/
│   │       └── indicators.ts
│   ├── package.json
│   └── vite.config.ts
│
├── server/
│   ├── src/
│   │   ├── config/
│   │   │   └── indicators.ts     # Central registry — modularity lives here
│   │   ├── services/
│   │   │   ├── fred.ts           # FRED API client
│   │   │   └── regimeAnalysis.ts # Investment Clock logic + threshold evaluation
│   │   ├── jobs/
│   │   │   └── dailyFetch.ts     # node-cron: 0 6 * * * UTC
│   │   ├── routes/
│   │   │   └── indicators.ts     # GET /api/indicators, GET /api/regime
│   │   └── db/
│   │       ├── schema.sql
│   │       └── queries.ts
│   └── package.json
│
├── skills/
│   └── investment-analysis.md    # Local Claude skill
├── docs/
│   └── superpowers/specs/
│       └── 2026-03-23-investment-dashboard-design.md
├── railway.json
├── nixpacks.toml
└── package.json                  # Root workspace
```

### Indicator Registry Schema (TypeScript)

```typescript
// server/src/config/indicators.ts

export type IndicatorStatus = 'good' | 'warning' | 'danger' | 'unknown';
export type IndicatorCategory =
  | 'Monetary Policy'
  | 'Inflation'
  | 'Growth & Activity'
  | 'Labor Market'
  | 'Risk & Sentiment'
  | 'Liquidity & Valuation';

// A threshold range: value is "good" if min <= value <= max (both optional)
export interface ThresholdRange {
  min?: number;   // inclusive lower bound (undefined = no lower bound)
  max?: number;   // inclusive upper bound (undefined = no upper bound)
  label: string;  // human-readable description, e.g. "Normal slope"
}

export interface IndicatorConfig {
  seriesId: string;           // FRED series ID
  name: string;               // Display name
  category: IndicatorCategory;
  unit: string;               // '%', 'bps', 'index', '$B'
  format: 'percent' | 'basis_points' | 'number' | 'currency';
  description: string;        // One-line description shown in card header
  educationalText: string;    // Tooltip/modal body (2–4 sentences)
  historicalContext: string;  // E.g. "Inverted before every recession since 1970"
  source: 'FRED';            // All indicators use FRED API
  frequency: 'daily' | 'weekly' | 'monthly';
  thresholds: {
    good:    ThresholdRange;
    warning: ThresholdRange;
    danger:  ThresholdRange;
  };
}
```

**ISM Services PMI note:** FRED series `NAPMNONMAN` — verify this is the correct live series ID before first deploy; ISM series IDs occasionally change on FRED.

### Database Schema

```sql
-- Stores daily snapshots of all indicator values
CREATE TABLE indicator_snapshots (
  id         SERIAL PRIMARY KEY,
  series_id  VARCHAR(50)   NOT NULL,
  value      DECIMAL(12,4),
  date       DATE          NOT NULL,
  fetched_at TIMESTAMPTZ   DEFAULT NOW(),
  UNIQUE (series_id, date)
);
CREATE INDEX idx_snapshots_series_date ON indicator_snapshots(series_id, date DESC);
```

### API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/indicators` | All indicators — latest value + 12-month sparkline history |
| GET | `/api/indicators/:seriesId?months=60` | Single indicator — full history (default 60 months for 5Y chart) |
| GET | `/api/regime` | Current macro regime + triggered alerts + posture |
| POST | `/api/indicators/:seriesId/refresh` | Manual refresh (admin, requires `X-Admin-Key` header) |

**`GET /api/indicators` response shape:**
```typescript
// Array of IndicatorSummary
interface IndicatorSummary {
  seriesId: string;
  name: string;
  category: IndicatorCategory;
  unit: string;
  format: IndicatorConfig['format'];
  description: string;
  educationalText: string;
  historicalContext: string;
  thresholds: IndicatorConfig['thresholds'];
  latestValue: number | null;
  latestDate: string;          // ISO date 'YYYY-MM-DD'
  previousValue: number | null;
  delta: number | null;        // latestValue - previousValue
  status: IndicatorStatus;     // derived from thresholds
  history: { date: string; value: number }[];  // last 12 months
}
```

**`GET /api/indicators/:seriesId` response shape:**
```typescript
// Single indicator — same as IndicatorSummary but history = full requested window
interface IndicatorDetail extends IndicatorSummary {
  history: { date: string; value: number }[];  // up to `months` param (default 60)
}
```

**`GET /api/regime` response shape:**
```typescript
interface RegimeResponse {
  regime: 'Goldilocks' | 'Inflationary Growth' | 'Stagflation' | 'Risk-Off';
  description: string;          // one-sentence summary
  recommendedPosture: string;   // e.g. "Overweight equities, underweight bonds"
  alerts: {
    seriesId: string;
    name: string;
    status: IndicatorStatus;
    message: string;            // e.g. "Yield curve inverted at -0.12%"
  }[];
  computedAt: string;           // ISO timestamp
}
```

**`POST /api/indicators/:seriesId/refresh` auth:**
Requires header `X-Admin-Key: <value>` matching `process.env.ADMIN_KEY`. Returns 401 if missing or wrong. `ADMIN_KEY` is a Railway environment variable set at deploy time.

**Client types (`client/src/types/indicators.ts`):**
Re-exports or mirrors `IndicatorSummary`, `IndicatorDetail`, `RegimeResponse`, `IndicatorStatus`, `IndicatorCategory` from the above shapes. No separate DTO transformation — client types are identical to server response types.

### Daily Fetch Job

- Runs at `0 6 * * *` UTC via `node-cron` inside the Express process
- Iterates over all `FRED`-sourced entries in the indicator registry
- Calls FRED REST API: `https://api.stlouisfed.org/fred/series/observations`
- Upserts latest observation into `indicator_snapshots`
- On failure: logs error, continues to next indicator (no crash)

---

## UI Design

### Visual Style
- Reference: Finaxell financial dashboard aesthetic
- Color palette: Indigo/violet primary, dark sidebar, white cards
- Status colors: Green (`#22c55e`) / Amber (`#f59e0b`) / Red (`#ef4444`)
- Font: Inter or system-ui
- Charts: Recharts library

### Page Layout

```
┌─────────────┬──────────────────────────────────────────────────┐
│  Sidebar    │  Macro Regime Banner                             │
│             │  [🟢 Goldilocks] [2 Warnings] [1 Alert]         │
│  Dashboard  ├──────────────────────────────────────────────────┤
│  ─────────  │  ▼ Monetary Policy                    [collapse] │
│  Monetary   │  ┌──────────┐ ┌──────────┐ ┌──────────┐        │
│  Inflation  │  │ card     │ │ card     │ │ card     │  ...   │
│  Growth     │  └──────────┘ └──────────┘ └──────────┘        │
│  Labor      ├──────────────────────────────────────────────────┤
│  Risk       │  ▼ Inflation                          [collapse] │
│  Liquidity  │  ...                                             │
│             ├──────────────────────────────────────────────────┤
│  ─────────  │  ▼ Growth & Activity                            │
│  Settings   │  ...                                             │
└─────────────┴──────────────────────────────────────────────────┘
```

### Indicator Card (per indicator)
- **Header:** Indicator name + `ⓘ` info button
- **Value:** Large current value + delta from previous reading (↑↓ with color)
- **Status badge:** 🟢 Good / 🟡 Warning / 🔴 Danger (derived from thresholds)
- **Sparkline:** 12-month mini chart (Recharts `LineChart`, no axes)
- **Click behavior:** Expands to full chart modal (calls `GET /api/indicators/:seriesId?months=60`)

### Expanded Chart Modal
- Full history line chart (Recharts `LineChart` with `ResponsiveContainer`)
- **Threshold bands:** Colored `ReferenceArea` fills: green zone / amber zone / red zone drawn as background layers
- **Reference lines:** Key threshold values labeled (e.g., "Inversion threshold: 0%")
- **Educational panel:** `educationalText` + `historicalContext` from registry
- Toggle buttons: 1Y (12 months) / 2Y (24 months) / 5Y (60 months) — changes `months` query param on demand
- The card sparkline on the dashboard shows only 12-month history from `/api/indicators` (no separate fetch)

### Macro Regime Card (top of page)
Synthesizes all signals into one of 4 regimes:
| Regime | Condition | Recommended Posture |
|--------|-----------|---------------------|
| 🟢 Goldilocks | PMI >50, CPI <2.5%, yield curve normal | Overweight equities |
| 🟡 Inflationary Growth | PMI >50, CPI >3% | Commodities, cyclicals, TIPS |
| 🟠 Stagflation | PMI <50, CPI >3% | Cash, short duration, gold |
| 🔴 Risk-Off / Recession | PMI <50, curve inverted, spreads wide | Bonds, defensives, reduce equities |

---

## Investment Rules Engine

Located in `server/src/services/regimeAnalysis.ts`. Evaluates all 14 indicators against their thresholds and emits:
1. Per-indicator status (good / warning / danger)
2. Active rule triggers (yield curve inverted, Sahm rule, etc.)
3. Macro regime classification (one of 4 quadrants)
4. Recommended allocation posture (text, not exact percentages — kept general)

Key rules implemented (all computed in-memory from DB rows — no extra DB columns needed):

- **Sahm Rule:** Query last 13 months of `UNRATE`. Compute rolling 3-month average of latest 3 values. Compute minimum of all 12 prior monthly values. If `3-month-avg - 12-month-min >= 0.5` → danger.
- **Yield curve inversion streak:** Query last 10 daily rows of `T10Y2Y`. If all 5 most recent are < 0 → danger. If any of last 10 < 0 → warning.
- **HY spread:** >500bps → danger, 300–500bps → warning.
- **PMI consecutive contraction:** Query last 3 monthly rows of `NAPM`. If latest 2 both < 50 → warning.
- **VIX zones:** <15 → good, 15–30 → warning, >30 → danger.
- **Regime classification:** Uses CPI (latest), PMI (latest), T10Y2Y (latest), and HY spread (latest) to select one of 4 regimes per the Investment Clock quadrant table above.

---

## Claude Skill (`skills/investment-analysis.md`)

**Trigger:** Run locally as `/investment-analysis`
**What it does:**
1. Reads latest snapshots from Railway PostgreSQL (same connection string)
2. Reads last 90 days of history per indicator to detect trends
3. Evaluates all threshold rules via `regimeAnalysis` logic (replicated or called via API)
4. Synthesizes with Claude API → formatted terminal report

**Report structure:**
- Current macro regime
- Triggered alerts with context
- Trend analysis (improving / deteriorating / stable per category)
- Recommended allocation posture
- One specific "watch this week" signal

**Output:** Terminal only (Phase 1). Email/file export in later phases.

---

## Deployment

Identical to Pulse:
```json
// railway.json
{
  "build": { "builder": "RAILPACK", "buildCommand": "npm install && npm run build" },
  "deploy": { "startCommand": "npm run start", "numReplicas": 1, "restartPolicyType": "ON_FAILURE" }
}
```

Environment variables on Railway:
- `FRED_API_KEY` — free key from fred.stlouisfed.org
- `DATABASE_URL` — Railway PostgreSQL connection string
- `ADMIN_KEY` — secret string for `POST /api/indicators/:seriesId/refresh` auth
- `PORT` — auto-set by Railway

---

## Future Phases (out of scope for Phase 1)

- **Phase 2:** Portfolio page — track personal holdings, allocation percentages, rebalance calculator
- **Phase 3:** Shiller CAPE (once clean API available), additional indicators (WTI crude, Buffett Indicator)
- **Phase 4:** Email/push alerts when danger thresholds are crossed
- **Phase 5:** Historical backtesting — overlay past regime classifications on S&P 500 chart

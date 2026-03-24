---
name: investment-analysis
description: Analyze current macroeconomic indicators from the investment dashboard database and produce an investment strategy report with macro regime, triggered alerts, trend analysis, and recommended allocation posture.
---

# Investment Analysis Skill

Connect to the Railway PostgreSQL database, fetch all 14 indicator snapshots, analyze trends, evaluate threshold rules, classify the macro regime, and output a structured investment strategy report.

## Steps

1. Connect to `$DATABASE_URL` (same Railway PostgreSQL as the investment-dashboard app). The connection string is in the `.env` file at `C:\Users\mingxiaosong\investment-dashboard\.env`.

2. For each of the 14 FRED series, fetch the last 90 days of snapshots:
   ```sql
   SELECT series_id, date::text, value::float
   FROM indicator_snapshots
   WHERE date >= NOW() - INTERVAL '90 days'
   ORDER BY series_id, date ASC;
   ```

3. For each indicator, compute:
   - Latest value and the date it was recorded
   - 30-day trend: compare latest vs value from ~30 days ago — improving, deteriorating, or stable (< 5% change)
   - Status: good / warning / danger — apply these threshold rules:

   | Series | Good | Warning | Danger |
   |--------|------|---------|--------|
   | FEDFUNDS | < 3.5% | 3.5–5.5% | > 5.5% |
   | DGS10 | 2–4% | 4–5% or < 2% | > 5% |
   | T10Y2Y | > 0.5% | 0–0.5% | < 0% |
   | T10YIE | 1.5–2.5% | 2.5–3% or 1–1.5% | > 3% or < 1% |
   | CPILFESL | < 2.5% | 2.5–3.5% | > 3.5% |
   | NAPM | > 52 | 48–52 | < 48 |
   | NAPMNONMAN | > 53 | 50–53 | < 50 |
   | UNRATE | < 4% | 4–5% | > 5% |
   | ICSA | < 220K | 220–280K | > 280K |
   | BAMLH0A0HYM2 | < 300bps | 300–500bps | > 500bps |
   | VIXCLS | 10–20 | 20–30 | > 30 |
   | UMCSENT | > 80 | 65–80 | < 65 |
   | DTWEXBGS | 90–110 | 110–120 or 80–90 | > 120 or < 80 |
   | M2SL | 4–8% | 0–4% or 8–15% | < 0% or > 15% |

4. Apply special multi-point rules:
   - **Sahm Rule** (UNRATE): fetch 13 months of data. 3-month avg of latest 3 - min of prior 12. If ≥ 0.5% → danger
   - **Yield Curve Streak** (T10Y2Y): if all 5 most recent daily readings are negative → danger
   - **PMI Contraction** (NAPM): if latest 2 monthly readings both < 50 → warning

5. Classify macro regime using Investment Clock:
   - **Goldilocks**: PMI ≥ 50 AND Core CPI < 3%
   - **Inflationary Growth**: PMI ≥ 50 AND Core CPI ≥ 3%
   - **Stagflation**: PMI < 50 AND Core CPI ≥ 3%
   - **Risk-Off**: PMI < 50 AND (HY spreads > 500bps OR yield curve inverted)

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
{list any indicator in warning or danger with value and context}

TREND ANALYSIS BY CATEGORY:
  Monetary Policy:    {improving/stable/deteriorating} — {1 sentence}
  Inflation:          {improving/stable/deteriorating} — {1 sentence}
  Growth & Activity:  {improving/stable/deteriorating} — {1 sentence}
  Labor Market:       {improving/stable/deteriorating} — {1 sentence}
  Risk & Sentiment:   {improving/stable/deteriorating} — {1 sentence}
  Liquidity:          {improving/stable/deteriorating} — {1 sentence}

WATCH THIS WEEK:
  {The single most important signal to monitor, and why}

DATA FRESHNESS:
  Last updated: {most recent fetched_at timestamp from DB}
═══════════════════════════════════════════════════
```

Use Claude to synthesize the trend analysis, posture, and "watch this week" sections based on the computed data. Keep analysis grounded in the threshold rules — avoid speculation beyond what the data supports.

## Step 7: Save analysis to dashboard

After generating the full analysis, POST the results to the investment dashboard API so they appear on the dashboard:

```bash
curl -X POST https://tree-mansion.up.railway.app/api/insights \
  -H "Content-Type: application/json" \
  -H "x-admin-key: $ADMIN_KEY" \
  -d '{
    "overall": "<the full strategy analysis text you generated>",
    "indicators": {
      "FEDFUNDS": "<2-3 sentence trend analysis for Fed Funds Rate>",
      "DGS10": "<2-3 sentence trend analysis for 10Y Treasury>",
      "T10Y2Y": "<2-3 sentence analysis>",
      "T10YIE": "<2-3 sentence analysis>",
      "CPILFESL": "<2-3 sentence analysis>",
      "IPMAN": "<2-3 sentence analysis>",
      "CFNAI": "<2-3 sentence analysis>",
      "UNRATE": "<2-3 sentence analysis>",
      "ICSA": "<2-3 sentence analysis>",
      "BAMLH0A0HYM2": "<2-3 sentence analysis>",
      "VIXCLS": "<2-3 sentence analysis>",
      "UMCSENT": "<2-3 sentence analysis>",
      "DTWEXBGS": "<2-3 sentence analysis>",
      "M2SL": "<2-3 sentence analysis>"
    }
  }'
```

For each indicator analysis, write 2-3 sentences covering: the current value and its status, the recent trend (improving/stable/deteriorating), and the key implication for investment strategy.

For the overall analysis, write the complete formatted report from Step 6 as a single string (replace newlines with \n).

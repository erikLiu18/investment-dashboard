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
    historicalContext: "Breakeven inflation surged to 3%+ in early 2022 — its highest since the 1990s — as commodity shocks hit. It fell back toward the Fed's 2% target by late 2023.",
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
    description: "Consumer Price Index excluding food and energy — the Fed's primary inflation gauge.",
    educationalText: "Food and energy prices are volatile — they swing on weather and geopolitics. 'Core' CPI strips these out to reveal underlying inflation trends. This is the number the Fed watches most closely when deciding whether to raise or cut rates.",
    historicalContext: "Core CPI peaked at 6.6% in September 2022 — the highest since 1982 — before the Fed's rate hikes gradually brought it down toward 3% by 2024.",
    fredUnits: 'pc1',
    frequency: 'monthly',
    thresholds: {
      good:    [{ max: 2.5, label: 'Near Fed target' }],
      warning: [{ min: 2.5, max: 3.5, label: 'Above target' }],
      danger:  [{ min: 3.5, label: 'Elevated — rate hike pressure' }],
    },
  },
  // ── Growth & Activity ──────────────────────────────────────────
  {
    seriesId: 'IPMAN',
    name: 'Manufacturing Output (YoY)',
    category: 'Growth & Activity',
    unit: '%',
    format: 'percent',
    description: 'Industrial Production: Manufacturing year-over-year % change — measures factory output expansion or contraction.',
    educationalText: 'Industrial production in manufacturing tracks actual output of US factories. A year-over-year decline signals factories are producing less — often a leading sign of economic weakness. Unlike sentiment surveys, this tracks real physical production volumes that feed directly into GDP.',
    historicalContext: 'Manufacturing output collapsed -18% YoY during COVID (April 2020). It fell again in 2022-2023 as tighter financial conditions hit the sector. Recovery to +2-4% YoY signals healthy industrial expansion.',
    fredUnits: 'pc1',
    frequency: 'monthly',
    thresholds: {
      good:    [{ min: 2, label: 'Healthy expansion' }],
      warning: [{ min: -1, max: 2, label: 'Stagnant to slow growth' }],
      danger:  [{ max: -1, label: 'Contraction' }],
    },
  },
  {
    seriesId: 'CFNAI',
    name: 'Broad Economic Activity (CFNAI)',
    category: 'Growth & Activity',
    unit: 'index',
    format: 'number',
    description: 'Chicago Fed National Activity Index — composite of 85 monthly indicators. 0 = historical average growth.',
    educationalText: "The CFNAI synthesizes 85 monthly indicators spanning production, income, employment, and consumption. Zero represents the historical average US growth rate. Sustained readings below -0.70 signal a recession has begun with high probability. This is more comprehensive than any single PMI survey as it covers manufacturing, services, and labor simultaneously.",
    historicalContext: 'CFNAI fell to -6 during COVID (April 2020) — its lowest on record. It briefly crossed -0.70 in late 2022 signaling recession risk before recovering. A reading near zero indicates the economy is growing at its long-run average pace.',
    fredUnits: 'lin',
    frequency: 'monthly',
    thresholds: {
      good:    [{ min: 0.2, label: 'Above-trend growth' }],
      warning: [{ min: -0.7, max: 0.2, label: 'Near or below trend' }],
      danger:  [{ max: -0.7, label: 'Recession signal' }],
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
    educationalText: "Unemployment is a lagging indicator — companies are slow to hire and fire, so unemployment peaks after recessions have already started, and falls after recoveries are underway. Watch Initial Jobless Claims for a faster read. The Sahm Rule (when unemployment's 3-month average rises 0.5% above its 12-month low) has triggered before every recession since 1970.",
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
    description: "CBOE Volatility Index — the market's 'fear gauge' derived from S&P 500 options.",
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
    educationalText: "A stronger dollar makes US exports more expensive and hurts US multinationals' overseas earnings. It also crushes emerging market economies that borrowed in dollars. A falling dollar is generally risk-on and positive for international stocks, gold, and commodities. Rapid dollar moves matter more than absolute level.",
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
    educationalText: "M2 measures all money readily available in the economy. Rapid M2 growth (from Fed QE or fiscal stimulus) fuels asset prices and inflation. Contracting M2 — rare before 2022 — signals tightening liquidity and typically precedes disinflation or slower growth. The Fed's QE programs in 2020–2021 drove M2 growth to 27% — the highest since WWII.",
    historicalContext: "M2 contracted YoY for the first time since the Great Depression in 2022–2023, dropping to -4%. This correctly predicted the disinflation that followed, validating the indicator's power even in unusual conditions.",
    fredUnits: 'pc1',
    frequency: 'monthly',
    thresholds: {
      good:    [{ min: 4, max: 8, label: 'Healthy liquidity growth' }],
      warning: [{ min: 0, max: 4, label: 'Tightening' }, { min: 8, max: 15, label: 'Excess liquidity' }],
      danger:  [{ max: 0, label: 'Contraction — disinflation risk' }, { min: 15, label: 'Inflationary excess' }],
    },
  },
];

export const INDICATOR_MAP = new Map(INDICATORS.map(i => [i.seriesId, i]));

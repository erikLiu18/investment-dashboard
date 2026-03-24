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

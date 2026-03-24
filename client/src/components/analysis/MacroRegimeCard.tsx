import React from 'react';
import type { RegimeResponse } from '../../types/indicators.js';

const REGIME_CONFIG = {
  'Goldilocks':          { emoji: '🟢', bg: 'bg-green-50 border-green-200', text: 'text-green-800', badge: 'bg-green-100 text-green-700' },
  'Inflationary Growth': { emoji: '🟡', bg: 'bg-amber-50 border-amber-200', text: 'text-amber-800', badge: 'bg-amber-100 text-amber-700' },
  'Stagflation':         { emoji: '🟠', bg: 'bg-orange-50 border-orange-200', text: 'text-orange-800', badge: 'bg-orange-100 text-orange-700' },
  'Risk-Off':            { emoji: '🔴', bg: 'bg-red-50 border-red-200', text: 'text-red-800', badge: 'bg-red-100 text-red-700' },
};

interface Props { regime: RegimeResponse | null; loading: boolean; }

export default function MacroRegimeCard({ regime, loading }: Props): React.ReactElement {
  if (loading || !regime) {
    return <div className="h-28 bg-white rounded-2xl border animate-pulse mb-8" />;
  }
  const c = REGIME_CONFIG[regime.regime];

  return (
    <div className={`rounded-2xl border p-5 mb-8 ${c.bg}`}>
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1">Current Macro Regime</p>
          <h1 className={`text-2xl font-bold ${c.text}`}>{c.emoji} {regime.regime}</h1>
          <p className="text-sm text-gray-600 mt-1 max-w-md">{regime.description}</p>
        </div>
        <div className="text-right">
          <p className="text-xs text-gray-500 mb-1">Recommended Posture</p>
          <p className={`text-sm font-medium px-3 py-1 rounded-full ${c.badge}`}>{regime.recommendedPosture}</p>
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

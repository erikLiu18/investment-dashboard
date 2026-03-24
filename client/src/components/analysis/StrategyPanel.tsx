import React, { useState } from 'react';
import { TrendingUp, TrendingDown, Minus, Eye, Clock, ChevronDown, ChevronUp } from 'lucide-react';
import type { InsightsResponse } from '../../types/indicators.js';

interface Props {
  insights: InsightsResponse | null;
  loading: boolean;
}

// ── Parser ────────────────────────────────────────────────────────────────────

interface ParsedAnalysis {
  date: string;
  regime: string;
  regimeDesc: string;
  posture: string;
  alerts: { level: 'DANGER' | 'WARNING'; indicator: string; detail: string }[];
  trends: { category: string; direction: string; note: string }[];
  watch: string;
  freshness: string;
}

function parseContent(content: string): ParsedAnalysis {
  const lines = content.split('\n');

  const get = (marker: string): string => {
    const i = lines.findIndex(l => l.includes(marker));
    if (i === -1) return '';
    // collect lines after marker until next all-caps section header
    const result: string[] = [];
    for (let j = i; j < lines.length; j++) {
      const line = lines[j];
      if (j > i && /^[A-Z][A-Z &]+:/.test(line.trim())) break;
      result.push(line);
    }
    return result.join('\n').replace(marker, '').trim();
  };

  // Regime line: "MACRO REGIME: GOLDILOCKS (LATE-CYCLE CAUTION)"
  const regimeLine = lines.find(l => l.includes('MACRO REGIME:')) ?? '';
  const regimeRaw = regimeLine.replace('MACRO REGIME:', '').trim();
  // Next non-empty line after regime is the description
  const regimeLineIdx = lines.indexOf(regimeLine);
  const regimeDesc = lines.slice(regimeLineIdx + 1).find(l => l.trim().length > 0) ?? '';

  // Date from first line
  const dateLine = lines.find(l => l.includes('ANALYSIS')) ?? '';
  const dateMatch = dateLine.match(/\w+ \d+, \d{4}/);
  const date = dateMatch ? dateMatch[0] : '';

  // Posture block
  const postureRaw = get('RECOMMENDED POSTURE:');

  // Alerts: lines containing DANGER or WARNING followed by —
  const alertLines = lines.filter(l => /DANGER|WARNING/.test(l) && l.includes('—'));
  const alerts = alertLines.map(l => {
    const level: 'DANGER' | 'WARNING' = l.includes('DANGER') ? 'DANGER' : 'WARNING';
    const cleaned = l.replace(/DANGER\s*—|WARNING\s*—/, '').trim();
    const colonIdx = cleaned.indexOf(':');
    const indicator = colonIdx > -1 ? cleaned.slice(0, colonIdx).trim() : cleaned.slice(0, 30);
    const detail = colonIdx > -1 ? cleaned.slice(colonIdx + 1).trim() : '';
    return { level, indicator, detail };
  });

  // Trends: lines like "  Monetary Policy:    CONFLICTED — ..."
  const trendSectionIdx = lines.findIndex(l => l.includes('TREND ANALYSIS'));
  const trendLines: { category: string; direction: string; note: string }[] = [];
  if (trendSectionIdx > -1) {
    for (let j = trendSectionIdx + 1; j < lines.length; j++) {
      const l = lines[j];
      if (/^[A-Z][A-Z &]+:/.test(l.trim()) && !l.trim().startsWith('  ')) break;
      const m = l.match(/^\s+([\w &]+):\s+([A-Z/]+)\s+—\s+(.+)/);
      if (m) trendLines.push({ category: m[1].trim(), direction: m[2].trim(), note: m[3].trim() });
    }
  }

  // Watch this week
  const watchRaw = get('WATCH THIS WEEK:');

  // Data freshness
  const freshLine = lines.find(l => l.includes('DATA FRESHNESS')) ?? '';
  const freshness = freshLine.replace('DATA FRESHNESS:', '').replace('DATA FRESHNESS', '').trim();

  return {
    date,
    regime: regimeRaw,
    regimeDesc: regimeDesc.trim(),
    posture: postureRaw,
    alerts,
    trends: trendLines,
    watch: watchRaw,
    freshness,
  };
}

// ── Sub-components ────────────────────────────────────────────────────────────

const REGIME_STYLE: Record<string, { bg: string; border: string; text: string; badge: string; dot: string }> = {
  GOLDILOCKS:          { bg: 'bg-emerald-50',  border: 'border-emerald-200', text: 'text-emerald-800', badge: 'bg-emerald-100 text-emerald-700', dot: 'bg-emerald-500' },
  'INFLATIONARY GROWTH': { bg: 'bg-amber-50', border: 'border-amber-200',   text: 'text-amber-800',   badge: 'bg-amber-100 text-amber-700',   dot: 'bg-amber-500' },
  STAGFLATION:         { bg: 'bg-orange-50',  border: 'border-orange-200',  text: 'text-orange-800',  badge: 'bg-orange-100 text-orange-700',  dot: 'bg-orange-500' },
  'RISK-OFF':          { bg: 'bg-red-50',     border: 'border-red-200',     text: 'text-red-800',     badge: 'bg-red-100 text-red-700',        dot: 'bg-red-500' },
};

function getRegimeStyle(regime: string) {
  const key = Object.keys(REGIME_STYLE).find(k => regime.toUpperCase().includes(k));
  return key ? REGIME_STYLE[key] : REGIME_STYLE['GOLDILOCKS'];
}

function TrendIcon({ direction }: { direction: string }) {
  if (direction.includes('IMPROVING') || direction.includes('STABLE') && !direction.includes('CONFLICT'))
    return <TrendingUp size={13} className="text-emerald-500 flex-shrink-0" />;
  if (direction.includes('DETERIORAT'))
    return <TrendingDown size={13} className="text-red-500 flex-shrink-0" />;
  return <Minus size={13} className="text-amber-500 flex-shrink-0" />;
}

function trendColor(direction: string) {
  if (direction.includes('IMPROVING')) return 'text-emerald-700';
  if (direction.includes('DETERIORAT')) return 'text-red-700';
  return 'text-amber-700';
}

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const h = Math.floor(diff / 3600000);
  const d = Math.floor(h / 24);
  if (d > 0) return `${d}d ago`;
  if (h > 0) return `${h}h ago`;
  return 'just now';
}

// ── Main component ────────────────────────────────────────────────────────────

export default function StrategyPanel({ insights, loading }: Props): React.ReactElement | null {
  const [showTrends, setShowTrends] = useState(false);

  if (loading) {
    return (
      <div className="bg-white rounded-2xl border border-gray-100 p-5 mb-5 animate-pulse">
        <div className="h-4 bg-gray-200 rounded w-1/4 mb-4" />
        <div className="grid grid-cols-3 gap-3">
          {[1,2,3].map(i => <div key={i} className="h-16 bg-gray-100 rounded-xl" />)}
        </div>
      </div>
    );
  }

  if (!insights?.overall) {
    return (
      <div className="bg-white rounded-2xl border border-dashed border-gray-200 p-5 mb-5 text-center">
        <p className="text-sm font-medium text-gray-400">No strategy analysis yet</p>
        <p className="text-xs text-gray-400 mt-1">
          Run <code className="bg-gray-100 px-1.5 py-0.5 rounded font-mono">/investment-analysis</code> to generate and push analysis to the dashboard.
        </p>
      </div>
    );
  }

  const { content, generated_at } = insights.overall;
  const a = parseContent(content);
  const rs = getRegimeStyle(a.regime);

  const dangerAlerts = a.alerts.filter(al => al.level === 'DANGER');
  const warnAlerts   = a.alerts.filter(al => al.level === 'WARNING');

  return (
    <div className="mb-5 space-y-3">
      {/* ── Header bar ───────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-gray-700 flex items-center gap-1.5">
          <span>📊</span> Investment Strategy Analysis
        </h2>
        <span className="flex items-center gap-1 text-xs text-gray-400">
          <Clock size={11} /> {timeAgo(generated_at)}{a.date ? ` · ${a.date}` : ''}
        </span>
      </div>

      {/* ── Top row: Regime + Posture + Alerts summary ────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">

        {/* Regime card */}
        <div className={`rounded-2xl border p-4 ${rs.bg} ${rs.border}`}>
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">Macro Regime</p>
          <div className="flex items-center gap-2 mb-2">
            <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${rs.dot}`} />
            <span className={`text-sm font-bold leading-tight ${rs.text}`}>{a.regime}</span>
          </div>
          <p className="text-xs text-gray-600 leading-relaxed">{a.regimeDesc}</p>
        </div>

        {/* Posture card */}
        <div className="rounded-2xl border border-indigo-100 bg-indigo-50 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-indigo-400 mb-2">Recommended Posture</p>
          <p className="text-xs text-indigo-900 leading-relaxed">{a.posture}</p>
        </div>

        {/* Alerts summary card */}
        <div className="rounded-2xl border border-gray-100 bg-white p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">
            Active Alerts
            <span className="ml-1.5 font-normal text-gray-400">({a.alerts.length})</span>
          </p>
          <div className="space-y-1.5">
            {dangerAlerts.map((al, i) => (
              <div key={i} className="flex items-start gap-2">
                <span className="mt-0.5 flex-shrink-0 w-1.5 h-1.5 rounded-full bg-red-500" />
                <div className="min-w-0">
                  <span className="text-xs font-semibold text-red-700">{al.indicator}</span>
                  {al.detail && <p className="text-xs text-gray-500 leading-tight truncate">{al.detail.slice(0, 70)}{al.detail.length > 70 ? '…' : ''}</p>}
                </div>
              </div>
            ))}
            {warnAlerts.map((al, i) => (
              <div key={i} className="flex items-start gap-2">
                <span className="mt-0.5 flex-shrink-0 w-1.5 h-1.5 rounded-full bg-amber-400" />
                <div className="min-w-0">
                  <span className="text-xs font-semibold text-amber-700">{al.indicator}</span>
                  {al.detail && <p className="text-xs text-gray-500 leading-tight truncate">{al.detail.slice(0, 60)}{al.detail.length > 60 ? '…' : ''}</p>}
                </div>
              </div>
            ))}
            {a.alerts.length === 0 && <p className="text-xs text-gray-400">No active alerts</p>}
          </div>
        </div>
      </div>

      {/* ── Watch This Week callout ───────────────────────────────────────── */}
      {a.watch && (
        <div className="rounded-2xl border border-violet-200 bg-violet-50 p-4 flex gap-3">
          <Eye size={16} className="text-violet-500 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-xs font-semibold text-violet-700 mb-1">Watch This Week</p>
            <p className="text-xs text-violet-900 leading-relaxed">{a.watch}</p>
          </div>
        </div>
      )}

      {/* ── Trend Analysis (collapsible) ──────────────────────────────────── */}
      {a.trends.length > 0 && (
        <div className="rounded-2xl border border-gray-100 bg-white overflow-hidden">
          <button
            className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition"
            onClick={() => setShowTrends(t => !t)}
          >
            <span className="text-xs font-semibold text-gray-600 uppercase tracking-wide">
              Category Trends
            </span>
            {showTrends
              ? <ChevronUp size={14} className="text-gray-400" />
              : <ChevronDown size={14} className="text-gray-400" />
            }
          </button>
          {showTrends && (
            <div className="border-t border-gray-100 divide-y divide-gray-50">
              {a.trends.map((t, i) => (
                <div key={i} className="flex items-start gap-3 px-4 py-2.5">
                  <TrendIcon direction={t.direction} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-semibold text-gray-700">{t.category}</span>
                      <span className={`text-xs font-medium ${trendColor(t.direction)}`}>{t.direction}</span>
                    </div>
                    <p className="text-xs text-gray-500 leading-relaxed mt-0.5">{t.note}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Footer ───────────────────────────────────────────────────────── */}
      {a.freshness && (
        <p className="text-xs text-gray-400 text-right px-1">
          Data freshness: {a.freshness}
        </p>
      )}
    </div>
  );
}

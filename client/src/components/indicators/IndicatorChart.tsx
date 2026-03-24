import React, { useState } from 'react';
import { X } from 'lucide-react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine
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
  const minVal = allValues.length > 0 ? Math.min(...allValues) : 0;
  const maxVal = allValues.length > 0 ? Math.max(...allValues) : 1;
  const pad = (maxVal - minVal) * 0.1 || 0.5;
  const yMin = minVal - pad;
  const yMax = maxVal + pad;

  const formatValue = (v: number) => {
    if (data.format === 'basis_points') return `${v.toFixed(0)}bps`;
    if (data.format === 'percent') return `${v.toFixed(2)}%`;
    return v.toFixed(2);
  };

  // Collect unique threshold boundary values to draw as reference lines
  const thresholdLines: { y: number; label: string; color: string }[] = [];
  const seen = new Set<number>();
  const addLines = (ranges: typeof data.thresholds.good, color: string) => {
    for (const r of ranges) {
      if (r.min !== undefined && !seen.has(r.min)) {
        seen.add(r.min);
        thresholdLines.push({ y: r.min, label: r.label, color });
      }
      if (r.max !== undefined && !seen.has(r.max)) {
        seen.add(r.max);
        thresholdLines.push({ y: r.max, label: r.label, color });
      }
    }
  };
  addLines(data.thresholds.danger, '#fca5a5');
  addLines(data.thresholds.warning, '#fcd34d');

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

        {/* Time range toggle + current value */}
        <div className="flex items-center gap-1 px-6 pt-4">
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
          <div className="ml-auto text-right">
            <span className="font-bold text-2xl text-gray-900">
              {data.latestValue !== null ? formatValue(data.latestValue) : '—'}
            </span>
            <span className="ml-2 text-sm text-gray-500">{data.latestDate}</span>
          </div>
        </div>

        {/* Chart */}
        <div className="px-6 py-4">
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={chartData} margin={{ top: 10, right: 20, bottom: 0, left: 10 }}>
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
                width={65}
              />
              <Tooltip
                formatter={(v: number) => [formatValue(v), data.name]}
                labelStyle={{ fontSize: 11, color: '#64748b' }}
                contentStyle={{ borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 12 }}
              />

              {/* Threshold reference lines */}
              {thresholdLines.map((line, i) => (
                <ReferenceLine
                  key={i}
                  y={line.y}
                  stroke={line.color}
                  strokeDasharray="4 4"
                  strokeWidth={1.5}
                />
              ))}

              {/* Zero line for yield curve */}
              {seriesId === 'T10Y2Y' && (
                <ReferenceLine
                  y={0}
                  stroke="#ef4444"
                  strokeWidth={1.5}
                  label={{ value: 'Inversion', fontSize: 10, fill: '#ef4444', position: 'insideTopLeft' }}
                />
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

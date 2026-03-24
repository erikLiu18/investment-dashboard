import { useState, useEffect } from 'react';
import type { IndicatorSummary } from '../types/indicators.js';

export function useIndicators() {
  const [data, setData] = useState<IndicatorSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/indicators')
      .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
      .then((d: IndicatorSummary[]) => setData(d))
      .catch((e: Error) => setError(e.message))
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
      .then((d: IndicatorSummary) => setData(d))
      .finally(() => setLoading(false));
  }, [seriesId, months]);

  return { data, loading };
}

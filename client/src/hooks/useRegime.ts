import { useState, useEffect } from 'react';
import type { RegimeResponse } from '../types/indicators.js';

export function useRegime() {
  const [data, setData] = useState<RegimeResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/regime')
      .then(r => r.json())
      .then((d: RegimeResponse) => setData(d))
      .finally(() => setLoading(false));
  }, []);

  return { data, loading };
}

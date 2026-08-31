// useHealthData.ts
import { useState, useEffect } from 'react';
import type { HealthRunData } from '../types/api';

export function useHealthData() {
  const [health, setHealth] = useState<HealthRunData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        // CONSUME /api/run en lugar de /api/health para obtener el score y el status
        const res = await fetch('/api/run?checks=disk,memory,cpu,security,network');
        if (!res.ok) throw new Error('API run check failed');
        const data: HealthRunData = await res.json();
        setHealth(data);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Unknown error');
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  return { health, loading, error };
}

// useHealthData.ts
import { useState, useEffect } from 'react';

// Define tipos para la respuesta de /api/run para mayor seguridad
interface HealthRunData {
  overall: number;
  status: 'healthy' | 'attention' | 'degraded';
  runInfo: {
    elapsedMs: number;
    total: number;
    passed: number;
    warnings: number;
    errors: number;
  };
}

export function useHealthData() {
  const [healthData, setHealthData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        // CONSUME /api/run en lugar de /api/health para obtener el score y el status
        const res = await fetch('/api/run?checks=disk,memory,cpu,security,network'); 
        if (!res.ok) throw new Error('API run check failed');
        const data: HealthRunData = await res.json();
        setHealthData(data);
      } catch (e) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  return { health: healthData, loading, error };
}


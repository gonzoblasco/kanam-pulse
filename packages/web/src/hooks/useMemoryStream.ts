// useMemoryStream.ts
import { useState, useEffect } from 'react';

export function useMemoryStream() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const eventSource = new EventSource('/api/metrics/stream');
    
    const onMessage = (event) => {
      try {
        const payload = JSON.parse(event.data);
        // Update state with lightweight metrics
        setData(payload);
      } catch (e) {
        setError('Failed to parse metric payload');
      }
    };

    eventSource.onmessage = onMessage;

    const handleClose = () => {
      setLoading(false);
    };

    eventSource.onclose = handleClose;

    return () => {
      eventSource.close();
    };
  }, []);

  return { data, loading, error };
}

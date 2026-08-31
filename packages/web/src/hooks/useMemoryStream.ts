// useMemoryStream.ts
import { useEffect, useState } from 'react';

interface MetricPayload {
  memory: number | null;
  load: number;
  unit: string;
}

export function useMemoryStream() {
  const [data, setData] = useState<MetricPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const eventSource = new EventSource('/api/metrics/stream');

    const onMessage = (event: MessageEvent) => {
      try {
        const payload: MetricPayload = JSON.parse(event.data);
        // Update state with lightweight metrics
        setData(payload);
      } catch (_e) {
        setError('Failed to parse metric payload');
      }
    };

    const onOpen = () => {
      setLoading(false);
      setError(null);
    };

    // EventSource has no `onclose`: the connection is closed either by the
    // server (readyState becomes CLOSED) or by calling close() on unmount.
    // Track errors (e.g. server terminated the stream) via onerror instead.
    const onError = () => {
      if (eventSource.readyState === EventSource.CLOSED) {
        setLoading(false);
      }
    };

    eventSource.onmessage = onMessage;
    eventSource.onopen = onOpen;
    eventSource.onerror = onError;

    // Cleanup on unmount: closes the underlying connection, which also
    // prevents React from setting state on an unmounted component.
    return () => {
      eventSource.close();
    };
  }, []);

  return { data, loading, error };
}

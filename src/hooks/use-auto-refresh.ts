"use client";

import { useState, useEffect, useCallback, useRef } from "react";

interface UseAutoRefreshOptions<T> {
  url: string;
  interval?: number;
  initialData: T;
}

interface UseAutoRefreshResult<T> {
  data: T;
  isLoading: boolean;
  error: string | null;
}

/**
 * Hook that polls an API endpoint at a regular interval and returns fresh data.
 * Initializes with server-rendered data to avoid flicker.
 */
export function useAutoRefresh<T>({
  url,
  interval = 5000,
  initialData,
}: UseAutoRefreshOptions<T>): UseAutoRefreshResult<T> {
  const [data, setData] = useState<T>(initialData);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(true);

  const fetchData = useCallback(async () => {
    try {
      setIsLoading(true);
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      if (mountedRef.current) {
        setData(json);
        setError(null);
      }
    } catch (err) {
      if (mountedRef.current) {
        setError(err instanceof Error ? err.message : "Fetch failed");
      }
    } finally {
      if (mountedRef.current) {
        setIsLoading(false);
      }
    }
  }, [url]);

  useEffect(() => {
    mountedRef.current = true;
    fetchData();
    const id = setInterval(fetchData, interval);
    return () => {
      mountedRef.current = false;
      clearInterval(id);
    };
  }, [fetchData, interval]);

  return { data, isLoading, error };
}

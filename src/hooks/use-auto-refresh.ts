"use client";

import { useState, useEffect, useRef } from "react";

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
 * Hook that returns server-rendered data. When the URL changes (e.g. user
 * switches time range or page), a single client-side fetch is made.
 *
 * Polling is disabled — the user refreshes the browser for new data.
 */
export function useAutoRefresh<T>({
  url,
  initialData,
}: UseAutoRefreshOptions<T>): UseAutoRefreshResult<T> {
  const [data, setData] = useState<T>(initialData);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isFirstRender = useRef(true);

  useEffect(() => {
    // Server already provided data for the initial render — skip fetch
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }

    let cancelled = false;
    setIsLoading(true);

    fetch(url)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((json) => {
        if (!cancelled) {
          setData(json);
          setError(null);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Fetch failed");
        }
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [url]);

  return { data, isLoading, error };
}

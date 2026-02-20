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

/** Cap exponential backoff at 8x the base interval. */
const MAX_BACKOFF_MULTIPLIER = 8;

/**
 * Hook that polls an API endpoint at a regular interval and returns fresh data.
 * Initializes with server-rendered data to avoid flicker.
 *
 * Performance features:
 * - Skips the initial fetch (uses server-provided initialData)
 * - Pauses polling when the tab is not visible
 * - Uses exponential backoff on consecutive errors
 * - Stable fetchData ref avoids unnecessary effect re-runs
 */
export function useAutoRefresh<T>({
  url,
  interval = 5000,
  initialData,
}: UseAutoRefreshOptions<T>): UseAutoRefreshResult<T> {
  const [data, setData] = useState<T>(initialData);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Refs to stabilize fetchData and avoid re-creating on url changes
  const urlRef = useRef(url);
  const mountedRef = useRef(true);
  const consecutiveErrorsRef = useRef(0);

  // Keep url ref in sync without triggering effect re-runs
  urlRef.current = url;

  const fetchData = useCallback(async () => {
    try {
      setIsLoading(true);
      const res = await fetch(urlRef.current);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      if (mountedRef.current) {
        setData(json);
        setError(null);
        consecutiveErrorsRef.current = 0;
      }
    } catch (err) {
      if (mountedRef.current) {
        consecutiveErrorsRef.current++;
        setError(err instanceof Error ? err.message : "Fetch failed");
      }
    } finally {
      if (mountedRef.current) {
        setIsLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    function getDelay(): number {
      if (consecutiveErrorsRef.current === 0) return interval;
      const backoff = Math.min(
        2 ** (consecutiveErrorsRef.current - 1),
        MAX_BACKOFF_MULTIPLIER
      );
      return interval * backoff;
    }

    function scheduleNext() {
      timeoutId = setTimeout(async () => {
        await fetchData();
        if (mountedRef.current) {
          scheduleNext();
        }
      }, getDelay());
    }

    function handleVisibilityChange() {
      if (document.hidden) {
        // Pause polling when tab is not visible
        if (timeoutId) {
          clearTimeout(timeoutId);
          timeoutId = null;
        }
      } else {
        // Tab became visible — fetch immediately, then resume schedule
        fetchData().then(() => {
          if (mountedRef.current) {
            scheduleNext();
          }
        });
      }
    }

    // Skip initial fetch — we already have server-rendered initialData.
    // Start the first poll after one interval.
    scheduleNext();
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      mountedRef.current = false;
      if (timeoutId) clearTimeout(timeoutId);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [fetchData, interval]);

  return { data, isLoading, error };
}

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
 * Hook that hydrates from server-rendered data, then re-fetches when the URL
 * changes. Optional polling can be enabled with `interval` (ms); polling runs
 * only while the tab is visible.
 */
export function useAutoRefresh<T>({
  url,
  interval,
  initialData,
}: UseAutoRefreshOptions<T>): UseAutoRefreshResult<T> {
  const [data, setData] = useState<T>(initialData);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isFirstRender = useRef(true);

  useEffect(() => {
    let cancelled = false;
    let activeController: AbortController | null = null;
    let intervalId: ReturnType<typeof setInterval> | null = null;
    const pollingInterval = typeof interval === "number" && interval > 0 ? interval : null;

    const clearIntervalTimer = () => {
      if (!intervalId) return;
      clearInterval(intervalId);
      intervalId = null;
    };

    const fetchLatest = async () => {
      activeController?.abort();
      const controller = new AbortController();
      activeController = controller;
      setIsLoading(true);

      try {
        const res = await fetch(url, { signal: controller.signal });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = (await res.json()) as T;
        if (cancelled) return;
        setData(json);
        setError(null);
      } catch (err) {
        if (cancelled) return;
        if (err instanceof Error && err.name === "AbortError") return;
        setError(err instanceof Error ? err.message : "Fetch failed");
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    const startPolling = () => {
      if (!pollingInterval || intervalId) return;
      intervalId = setInterval(() => {
        if (document.hidden) return;
        void fetchLatest();
      }, pollingInterval);
    };

    const handleVisibilityChange = () => {
      if (document.hidden) {
        clearIntervalTimer();
        return;
      }
      void fetchLatest();
      startPolling();
    };

    // Server already provided data for the initial render.
    if (isFirstRender.current) {
      isFirstRender.current = false;
    } else {
      void fetchLatest();
    }

    if (pollingInterval) {
      if (!document.hidden) startPolling();
      document.addEventListener("visibilitychange", handleVisibilityChange);
    }

    return () => {
      cancelled = true;
      clearIntervalTimer();
      activeController?.abort();
      if (pollingInterval) {
        document.removeEventListener("visibilitychange", handleVisibilityChange);
      }
    };
  }, [interval, url]);

  return { data, isLoading, error };
}

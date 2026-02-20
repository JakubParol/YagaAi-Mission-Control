'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { cn } from '@/lib/utils';

export function ConnectionStatus() {
  const [ok, setOk] = useState(true);
  const mountedRef = useRef(true);

  const check = useCallback(() => {
    fetch('/api/stories')
      .then((res) => {
        if (mountedRef.current) setOk(res.ok);
      })
      .catch(() => {
        if (mountedRef.current) setOk(false);
      });
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    check();

    // Only poll when tab is visible
    let intervalId: ReturnType<typeof setInterval> | null = null;

    function startPolling() {
      if (!intervalId) {
        intervalId = setInterval(check, 10_000);
      }
    }

    function stopPolling() {
      if (intervalId) {
        clearInterval(intervalId);
        intervalId = null;
      }
    }

    function onVisibilityChange() {
      if (document.hidden) {
        stopPolling();
      } else {
        check(); // Immediate check when returning to tab
        startPolling();
      }
    }

    startPolling();
    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      mountedRef.current = false;
      stopPolling();
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [check]);

  return (
    <div role="status" aria-live="polite" className="flex items-center gap-2">
      <div
        aria-hidden="true"
        className={cn(
          'h-2 w-2 rounded-full',
          ok ? 'bg-green-500' : 'bg-red-500'
        )}
      />
      <span className={cn('text-xs', ok ? 'text-green-500' : 'text-red-500')}>
        {ok ? 'Connected' : 'Disconnected'}
      </span>
    </div>
  );
}

'use client';

import { useState, useEffect } from 'react';

export default function ConnectionStatus() {
  const [ok, setOk] = useState(true);

  useEffect(() => {
    let mounted = true;

    const check = () => {
      fetch('/api/stories')
        .then((res) => {
          if (mounted) setOk(res.ok);
        })
        .catch(() => {
          if (mounted) setOk(false);
        });
    };

    check();
    const id = setInterval(check, 10_000);
    return () => {
      mounted = false;
      clearInterval(id);
    };
  }, []);

  return (
    <div className="flex items-center gap-2">
      <div
        className={`w-2 h-2 rounded-full ${
          ok ? 'bg-green-500 animate-pulse' : 'bg-red-500'
        }`}
      />
      <span className={`text-xs ${ok ? 'text-green-500' : 'text-red-500'}`}>
        {ok ? 'Live' : 'Error'}
      </span>
    </div>
  );
}

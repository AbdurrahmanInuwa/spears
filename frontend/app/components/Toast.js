'use client';

import { createContext, useCallback, useContext, useState } from 'react';

const ToastCtx = createContext({ toast: () => {} });

export function ToastProvider({ children }) {
  const [items, setItems] = useState([]);

  const toast = useCallback((message, opts = {}) => {
    const id = Math.random().toString(36).slice(2);
    const variant = opts.variant || 'success'; // 'success' | 'error'
    const duration = opts.duration ?? 3500;
    setItems((s) => [...s, { id, message, variant }]);
    setTimeout(() => {
      setItems((s) => s.filter((t) => t.id !== id));
    }, duration);
  }, []);

  return (
    <ToastCtx.Provider value={{ toast }}>
      {children}
      <div className="pointer-events-none fixed right-4 top-20 z-50 flex flex-col gap-2">
        {items.map((t) => (
          <div
            key={t.id}
            className={`pointer-events-auto min-w-[240px] rounded-md border px-4 py-3 text-sm font-medium shadow-lg ${
              t.variant === 'success'
                ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                : 'border-red-200 bg-red-50 text-red-800'
            }`}
          >
            {t.message}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

export function useToast() {
  return useContext(ToastCtx).toast;
}

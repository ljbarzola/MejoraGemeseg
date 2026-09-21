import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';

type ToastType = 'error' | 'success' | 'info';

interface ToastItem {
  id: number;
  message: string;
  type: ToastType;
}

interface ToastContextValue {
  showToast: (message: string, type?: ToastType) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const STYLES: Record<ToastType, { bg: string; border: string; icon: string }> = {
  error: { bg: '#fef2f2', border: '#dc2626', icon: '⛔' },
  success: { bg: '#f0fdf4', border: '#059669', icon: '✅' },
  info: { bg: '#fff', border: 'var(--azul-oscuro)', icon: 'ℹ️' },
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const showToast = useCallback((message: string, type: ToastType = 'info') => {
    const id = Date.now() + Math.random();
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => dismiss(id), 6000);
  }, [dismiss]);

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <div style={{ position: 'fixed', top: 20, right: 20, zIndex: 9999, display: 'flex', flexDirection: 'column', gap: 10, maxWidth: 380, pointerEvents: 'none' }}>
        {toasts.map((t) => (
          <div
            key={t.id}
            onClick={() => dismiss(t.id)}
            role="alert"
            style={{
              pointerEvents: 'auto',
              display: 'flex',
              alignItems: 'flex-start',
              gap: 10,
              background: STYLES[t.type].bg,
              borderLeft: `4px solid ${STYLES[t.type].border}`,
              borderRadius: 8,
              padding: '12px 16px',
              boxShadow: '0 10px 24px rgba(0,0,0,0.15)',
              fontSize: 13,
              lineHeight: 1.5,
              color: '#1e293b',
              cursor: 'pointer',
              whiteSpace: 'pre-line',
              animation: 'toast-in 0.2s ease-out',
            }}
          >
            <span>{STYLES[t.type].icon}</span>
            <span style={{ flex: 1 }}>{t.message}</span>
          </div>
        ))}
      </div>
      <style>{`
        @keyframes toast-in {
          from { opacity: 0; transform: translateY(-8px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast debe usarse dentro de <ToastProvider>');
  return ctx;
}

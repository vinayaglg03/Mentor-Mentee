import React, { useCallback, useMemo, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, X, Info } from 'lucide-react';
import { ToastContext } from './useToast';
import './Toaster.css';

// Several handlers used to swallow failures into console.error, so a mentor
// pressed a button, nothing happened, and they concluded the app was broken.
// Every failure goes through here instead.

const ICONS = { error: AlertTriangle, success: CheckCircle2, info: Info };

export const Toaster = ({ children }) => {
  const [toasts, setToasts] = useState([]);
  const timers = useRef(new Map());

  const dismiss = useCallback((id) => {
    setToasts(current => current.filter(toast => toast.id !== id));
    const timer = timers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
  }, []);

  const push = useCallback((toast) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const entry = { id, tone: 'info', ...toast };

    setToasts(current => [...current, entry]);

    // Errors stay until dismissed: the whole point is that they are seen.
    if (entry.tone !== 'error') {
      timers.current.set(id, setTimeout(() => dismiss(id), entry.duration ?? 4000));
    }

    return id;
  }, [dismiss]);

  const value = useMemo(() => ({
    push,
    dismiss,
    success: (message, options = {}) => push({ tone: 'success', message, ...options }),
    info: (message, options = {}) => push({ tone: 'info', message, ...options }),
    // Pulls the server's message out of an axios error, and keeps the request
    // id so the user can quote it.
    error: (error, fallback = 'Something went wrong.') => {
      const response = error?.response;
      const message = response?.data?.error || error?.message || fallback;
      const details = response?.data?.details;

      return push({
        tone: 'error',
        message: typeof message === 'string' ? message : fallback,
        detail: Array.isArray(details)
          ? details.map(item => `${item.field}: ${item.message}`).join(', ')
          : undefined,
        requestId: response?.data?.requestId || response?.headers?.['x-request-id'],
      });
    },
  }), [push, dismiss]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="toaster" role="region" aria-label="Notifications">
        {toasts.map(toast => {
          const Icon = ICONS[toast.tone] || Info;
          return (
            <div
              key={toast.id}
              className={`toast toast-${toast.tone}`}
              role={toast.tone === 'error' ? 'alert' : 'status'}
              aria-live={toast.tone === 'error' ? 'assertive' : 'polite'}
            >
              <Icon size={18} aria-hidden="true" />
              <div className="toast-body">
                <p>{toast.message}</p>
                {toast.detail && <p className="toast-detail">{toast.detail}</p>}
                {toast.requestId && (
                  <p className="toast-detail">
                    Reference <code>{toast.requestId}</code> — quote this if you report it.
                  </p>
                )}
              </div>
              <button className="btn-icon" onClick={() => dismiss(toast.id)} aria-label="Dismiss">
                <X size={16} />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
};

export default Toaster;

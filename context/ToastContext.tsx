import { logger } from '../utils/logger';
import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { X, CheckCircle, AlertCircle, Info, AlertTriangle } from 'lucide-react';

export type ToastType = 'success' | 'error' | 'info' | 'warning';

export interface Toast {
  id: string;
  message: string;
  type: ToastType;
}

export interface ToastContextType {
  showToast: (message: string, type?: ToastType) => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

export type ToastListener = (message: string, type: ToastType) => void;

let globalToastListener: ToastListener | null = null;
const pendingToasts: Array<{ message: string; type: ToastType }> = [];

/**
 * تسجيل مستمع عام للإشعارات لربط مكوّن العرض بالعمليات الخارجة عن نطاق React
 */
export const registerGlobalToastListener = (listener: ToastListener | null) => {
  globalToastListener = listener;
  if (listener && pendingToasts.length > 0) {
    const queue = [...pendingToasts];
    pendingToasts.length = 0;
    queue.forEach(item => listener(item.message, item.type));
  }
};

/**
 * 📢 جسر الإشعارات العام (Universal Toast Notification Bridge)
 * يمكن استدعاؤه من أي مكان داخل التطبيق (Services, API, Async Tasks, Reducers)
 * دون الحاجة إلى التواجد داخل دورة حياة React Hook.
 */
export const toastNotify = {
  show: (message: string, type: ToastType = 'info') => {
    if (globalToastListener) {
      globalToastListener(message, type);
    } else {
      pendingToasts.push({ message, type });
      if (pendingToasts.length > 20) pendingToasts.shift();
      if (typeof window !== 'undefined' && process.env.NODE_ENV !== 'production') {
        logger.warn(`[Toast early queue]: [${type}] ${message}`);
      }
    }
  },
  success: (message: string) => toastNotify.show(message, 'success'),
  error: (message: string) => toastNotify.show(message, 'error'),
  warning: (message: string) => toastNotify.show(message, 'warning'),
  info: (message: string) => toastNotify.show(message, 'info'),
};

export const useToast = () => {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
};

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const showToast = useCallback((message: string, type: ToastType = 'info') => {
    const id = Math.random().toString(36).substring(2, 9);
    setToasts((prev) => [...prev, { id, message, type }]);

    // إخفاء الإشعار تلقائياً بعد 4 ثواني
    setTimeout(() => {
      removeToast(id);
    }, 4000);
  }, []);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  }, []);

  useEffect(() => {
    registerGlobalToastListener(showToast);
    return () => {
      registerGlobalToastListener(null);
    };
  }, [showToast]);

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <div className="fixed bottom-4 left-4 z-[9999] flex flex-col gap-2 pointer-events-none">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`
              pointer-events-auto flex items-center gap-3 px-4 py-3 rounded-lg shadow-lg text-white min-w-[300px] max-w-md animate-in slide-in-from-left-5 fade-in duration-300
              ${toast.type === 'success' ? 'bg-emerald-600' : ''}
              ${toast.type === 'error' ? 'bg-red-600' : ''}
              ${toast.type === 'warning' ? 'bg-amber-500' : ''}
              ${toast.type === 'info' ? 'bg-blue-600' : ''}
            `}
          >
            {toast.type === 'success' && <CheckCircle size={20} />}
            {toast.type === 'error' && <AlertCircle size={20} />}
            {toast.type === 'warning' && <AlertTriangle size={20} />}
            {toast.type === 'info' && <Info size={20} />}
            
            <p className="text-sm font-medium flex-1">{toast.message}</p>
            
            <button onClick={() => removeToast(toast.id)} className="text-white/80 hover:text-white transition-colors">
              <X size={16} />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
};

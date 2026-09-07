import React from 'react';
import toast, { Toaster, ToastOptions } from 'react-hot-toast';

// إعدادات افتراضية للإشعارات
const defaultOptions: ToastOptions = {
  duration: 4000,
  position: 'top-center',
  style: {
    fontFamily: 'inherit',
    borderRadius: '8px',
    fontWeight: '500',
  },
};

// مكون المزود الذي يجب وضعه في أعلى التطبيق (App.tsx) أو في الصفحات الرئيسية
export const ToastProvider = () => (
  <Toaster 
    position="top-center"
    toastOptions={{
        success: {
            style: { background: '#ECFDF5', color: '#065F46', border: '1px solid #10B981' }, // Emerald theme
            iconTheme: { primary: '#10B981', secondary: '#ECFDF5' },
        },
        error: {
            style: { background: '#FEF2F2', color: '#991B1B', border: '1px solid #EF4444' }, // Red theme
            iconTheme: { primary: '#EF4444', secondary: '#FEF2F2' },
        },
        loading: {
            style: { background: '#EFF6FF', color: '#1E40AF', border: '1px solid #3B82F6' }, // Blue theme
        }
    }}
  />
);

// الخطاف (Hook) لاستخدام الإشعارات
export const useToastNotification = () => {
  return {
    success: (message: string) => toast.success(message, defaultOptions),
    error: (message: string) => toast.error(message, defaultOptions),
    loading: (message: string) => toast.loading(message, defaultOptions),
    dismiss: (toastId?: string) => toast.dismiss(toastId),
  };
};
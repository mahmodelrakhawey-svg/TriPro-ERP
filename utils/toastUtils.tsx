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
        style: { background: '#ECFDF5', color: '#065F46', border: '1px solid #10B981' },
        iconTheme: { primary: '#10B981', secondary: '#ECFDF5' },
      },
      error: {
        style: { background: '#FEF2F2', color: '#991B1B', border: '1px solid #EF4444' },
        iconTheme: { primary: '#EF4444', secondary: '#FEF2F2' },
      },
      loading: {
        style: { background: '#EFF6FF', color: '#1E40AF', border: '1px solid #3B82F6' },
      },
    }}
  />
);

/**
 * الخطاف الموحّد لإشعارات Toast في جميع أنحاء التطبيق.
 * يجمع الدوال الأساسية (react-hot-toast) مع رسائل الأعمال المختصرة.
 */
export const useToastNotification = () => {
  return {
    // --- دوال أساسية ---
    success: (message: string) => toast.success(message, defaultOptions),
    error: (message: string) => toast.error(message, defaultOptions),
    warning: (message: string) => toast(message, { ...defaultOptions, icon: '⚠️' }),
    info: (message: string) => toast(message, { ...defaultOptions, icon: 'ℹ️' }),
    loading: (message: string) => toast.loading(message, defaultOptions),
    dismiss: (toastId?: string) => toast.dismiss(toastId),

    // --- رسائل أعمال مختصرة ---
    saved: () => toast.success('تم الحفظ بنجاح', defaultOptions),
    deleted: () => toast.success('تم الحذف بنجاح', defaultOptions),
    updated: () => toast.success('تم التحديث بنجاح', defaultOptions),
    failed: (operation: string = 'العملية') =>
      toast.error(`فشل ${operation}`, defaultOptions),
    required: (fieldName: string) =>
      toast(`${fieldName} مطلوب`, { ...defaultOptions, icon: '⚠️' }),
    networkError: () =>
      toast.error('خطأ في الاتصال، حاول لاحقاً', defaultOptions),
  };
};

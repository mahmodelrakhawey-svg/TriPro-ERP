/**
 * Helper functions لاستخدام Toast Notifications بسهولة
 * هذا الملف يوفر دوال مختصرة لاستخدام showToast في جميع أنحاء التطبيق
 */

import { useToast } from '../context/ToastContext';

export const useToastNotification = () => {
  const { showToast } = useToast();

  return {
    success: (message: string) => showToast(message, 'success'),
    error: (message: string) => showToast(message, 'error'),
    warning: (message: string) => showToast(message, 'warning'),
    info: (message: string) => showToast(message, 'info'),
    
    // Messages المشتركة
    saved: () => showToast('تم الحفظ بنجاح', 'success'),
    deleted: () => showToast('تم الحذف بنجاح', 'success'),
    updated: () => showToast('تم التحديث بنجاح', 'success'),
    failed: (operation: string = 'العملية') => 
      showToast(`فشل ${operation}`, 'error'),
    required: (fieldName: string) => 
      showToast(`${fieldName} مطلوب`, 'warning'),
    networkError: () => 
      showToast('خطأ في الاتصال، حاول لاحقاً', 'error'),
  };
};

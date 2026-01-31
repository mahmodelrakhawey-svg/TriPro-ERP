/**
 * نظام معالجة الأخطاء الموحد
 * يوفر:
 * - تسجيل الأخطاء
 * - معالجة موحدة للأخطاء
 * - رسائل واضحة بالعربية
 */

export class AppError extends Error {
  constructor(
    message: string,
    public code?: string,
    public severity: 'low' | 'medium' | 'high' | 'critical' = 'medium',
    public context?: Record<string, any>
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export const handleError = (
  error: any,
  options?: {
    showNotification?: (message: string, type: 'success' | 'error' | 'info' | 'warning') => void;
    context?: Record<string, any>;
    onError?: (error: AppError) => void;
    logToConsole?: boolean;
  }
) => {
  const logToConsole = options?.logToConsole !== false;

  // Parse error
  let appError: AppError;

  if (error instanceof AppError) {
    appError = error;
  } else if (error?.message) {
    appError = new AppError(error.message, error.code);
  } else if (typeof error === 'string') {
    appError = new AppError(error);
  } else {
    appError = new AppError('حدث خطأ غير متوقع');
  }

  // Add context
  if (options?.context) {
    appError.context = { ...options.context };
  }

  // Log to console
  if (logToConsole) {
    console.error('❌ Error logged:', {
      message: appError.message,
      code: appError.code,
      severity: appError.severity,
      timestamp: new Date().toISOString(),
      context: appError.context
    });
  }

  // Show notification
  if (options?.showNotification) {
    const notificationType = appError.severity === 'critical' ? 'error' : 'error';
    options.showNotification(appError.message, notificationType);
  }

  // Callback
  if (options?.onError) {
    options.onError(appError);
  }

  return appError;
};

/**
 * معالج أخطاء Supabase
 */
export const handleSupabaseError = (
  error: any,
  operation: string
): string => {
  if (!error) return 'حدث خطأ غير معروف';

  const errorMessage = error?.message || error?.error_description || error?.error || '';

  // أخطاء شائعة من Supabase
  if (errorMessage.includes('UNIQUE')) {
    return `هذا السجل موجود بالفعل في ${operation}`;
  }
  if (errorMessage.includes('Foreign')) {
    return `لا يمكن حذف هذا السجل لأنه مرتبط ببيانات أخرى`;
  }
  if (errorMessage.includes('auth')) {
    return 'خطأ في المصادقة، يرجى تسجيل الدخول مجدداً';
  }
  if (errorMessage.includes('not found')) {
    return `السجل المطلوب غير موجود`;
  }

  return errorMessage || `فشل في ${operation}`;
};

/**
 * التحقق من صحة المبلغ المالي
 */
export const validateAmount = (amount: any, fieldName: string = 'المبلغ'): void => {
  const num = Number(amount);

  if (isNaN(num)) {
    throw new AppError(`${fieldName} يجب أن يكون رقم`, 'INVALID_AMOUNT');
  }

  if (num < 0) {
    throw new AppError(`${fieldName} لا يمكن أن يكون سالب`, 'NEGATIVE_AMOUNT');
  }

  if (num === 0) {
    throw new AppError(`${fieldName} لا يمكن أن يكون صفر`, 'ZERO_AMOUNT');
  }
};

/**
 * التحقق من صحة التاريخ
 */
export const validateDate = (date: any, fieldName: string = 'التاريخ'): void => {
  const d = new Date(date);

  if (isNaN(d.getTime())) {
    throw new AppError(`${fieldName} غير صحيح`, 'INVALID_DATE');
  }

  if (d > new Date()) {
    throw new AppError(`${fieldName} لا يمكن أن يكون في المستقبل`, 'FUTURE_DATE');
  }
};

/**
 * التحقق من عدم كون القيمة فارغة
 */
export const validateRequired = (value: any, fieldName: string = 'الحقل'): void => {
  if (!value || (typeof value === 'string' && value.trim() === '')) {
    throw new AppError(`${fieldName} مطلوب`, 'REQUIRED_FIELD');
  }
};

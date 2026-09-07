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
    public context?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export const handleError = (
  error: unknown,
  options?: {
    showNotification?: (message: string, type: 'success' | 'error' | 'info' | 'warning') => void;
    context?: Record<string, unknown>;
    onError?: (error: AppError) => void;
    logToConsole?: boolean;
  }
) => {
  const logToConsole = options?.logToConsole !== false;

  // Parse error
  let appError: AppError;

  if (error instanceof AppError) {
    appError = error;
  } else if (error && typeof error === 'object' && 'message' in error) {
    const errObj = error as { message: string; code?: string };
    appError = new AppError(errObj.message, errObj.code);
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
  error: unknown,
  operation: string
): string => {
  if (!error) return 'حدث خطأ غير معروف';

  let errorMessage = '';
  if (typeof error === 'object') {
    const errObj = error as Record<string, unknown>;
    errorMessage = String(errObj.message || errObj.error_description || errObj.error || '');
  } else if (typeof error === 'string') {
    errorMessage = error;
  }

  const upperCaseError = errorMessage.toUpperCase();

  // أخطاء شائعة من Supabase
  if (upperCaseError.includes('UNIQUE')) {
    return `هذا السجل موجود بالفعل في ${operation}`;
  }
  if (upperCaseError.includes('FOREIGN')) {
    return `لا يمكن حذف هذا السجل لأنه مرتبط ببيانات أخرى`;
  }
  if (upperCaseError.includes('AUTH')) {
    return 'خطأ في المصادقة، يرجى تسجيل الدخول مجدداً';
  }
  if (upperCaseError.includes('NOT FOUND')) {
    return `السجل المطلوب غير موجود`;
  }

  return errorMessage || `فشل في ${operation}`;
};

/**
 * التحقق من صحة المبلغ المالي
 */
export const validateAmount = (amount: unknown, fieldName: string = 'المبلغ'): void => {
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
export const validateDate = (date: unknown, fieldName: string = 'التاريخ'): void => {
  if (!date || (typeof date !== 'string' && typeof date !== 'number' && !(date instanceof Date))) {
    throw new AppError(`${fieldName} غير صحيح`, 'INVALID_DATE');
  }
  const d = new Date(date as string | number | Date);

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
export const validateRequired = (value: unknown, fieldName: string = 'الحقل'): void => {
  if (!value || (typeof value === 'string' && value.trim() === '')) {
    throw new AppError(`${fieldName} مطلوب`, 'REQUIRED_FIELD');
  }
};

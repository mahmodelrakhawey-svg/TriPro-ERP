import { logger } from '../utils/logger';
import { toastNotify } from '../context/ToastContext';

/**
 * فئة الأخطاء المخصصة لتطبيق TriPro ERP
 * تمثل خطأ عمل وتشمل الرمز ومستوى الخطورة وسياق البيانات المرفقة.
 */
export class AppError extends Error {
  /**
   * @param message رسالة الخطأ الموجهة للمستخدم أو المطور
   * @param code رمز الخطأ الفريد (مثل: INVALID_AMOUNT, PERMISSION_DENIED)
   * @param severity مستوى خطورة الخطأ ('low' | 'medium' | 'high' | 'critical')
   * @param context بيانات وصفية تفصيلية إضافية للمساعدة في تشخيص العطل
   */
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

export interface HandleErrorOptions {
  /** دالة مخصصة لعرض الإشعار (اختياري، يتم استخدام نظام Toast الافتراضي تلقائياً عند إغفالها) */
  showNotification?: (message: string, type: 'success' | 'error' | 'info' | 'warning') => void;
  /** سياق إضافي لتشخيص الخطأ */
  context?: Record<string, unknown>;
  /** كول باك يُستدعى بعد معالجة الخطأ */
  onError?: (error: AppError) => void;
  /** تحديد ما إذا كان يجب تسجيل الخطأ في الكونسول (الافتراضي true في بيئة التطوير) */
  logToConsole?: boolean;
}

/**
 * 🛠️ المعالج المركزي الموحد للأخطاء
 * يضمن تحويل أي استثناء مجهول إلى كائن AppError قياسي،
 * ويسجل الخطأ لأغراض التشخيص، ويعرض إشعاراً مرئياً فورياً للمستخدم.
 *
 * @param error الخطأ المجهول أو كائن الخطأ المستلم
 * @param options خيارات المعالجة والعرض
 * @returns كائن AppError القياسي الناتج
 */
export const handleError = (
  error: unknown,
  options?: HandleErrorOptions
): AppError => {
  const logToConsole = options?.logToConsole !== false;

  // 1. استخراج كائن الخطأ الموحد
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

  // 2. إرفاق السياق
  if (options?.context) {
    appError.context = { ...(appError.context || {}), ...options.context };
  }

  // 3. تسجيل الخطأ في الكونسول للبيئة المحلية
  if (logToConsole) {
    logger.error('❌ [TriPro Error]:', {
      message: appError.message,
      code: appError.code,
      severity: appError.severity,
      timestamp: new Date().toISOString(),
      context: appError.context
    });
  }

  // 4. عرض إشعار مرئي للمستخدم دائماً (سواء عبر الكول باك الممرر أو عبر جسر Toast العام)
  const notificationType = appError.severity === 'critical' ? 'error' : 'error';
  if (options?.showNotification) {
    options.showNotification(appError.message, notificationType);
  } else {
    toastNotify.error(appError.message);
  }

  // 5. استدعاء المعالج الإضافي إن وُجد
  if (options?.onError) {
    options.onError(appError);
  }

  return appError;
};

/**
 * 📢 مساعد فوري لمعالجة الأخطاء وإشعار المستخدم في سطر واحد
 * مصمم ليحل محل `console.error` و `catch(e) {}` الصامتة في جميع الشاشات.
 *
 * @param error الخطأ المستلم في كتلة catch
 * @param fallbackMessage رسالة مفهومة بالعربية لوصف العملية التي تعطلت
 * @param context سياق العملية (اختياري)
 */
export const notifyUserError = (
  error: unknown,
  fallbackMessage: string = 'حدث خطأ أثناء تنفيذ العملية',
  context?: Record<string, unknown>
): AppError => {
  const customMessage = error ? handleSupabaseError(error, fallbackMessage) : fallbackMessage;
  return handleError(
    error instanceof AppError ? error : new AppError(customMessage, undefined, 'medium', context),
    {
      context: { ...context, fallbackMessage },
      logToConsole: true
    }
  );
};

/**
 * 📢 مساعد فوري لعرض إشعار نجاح مرئي للمستخدم
 *
 * @param message نص رسالة النجاح
 */
export const notifyUserSuccess = (message: string): void => {
  toastNotify.success(message);
};

/**
 * 🔍 مترجم أخطاء Supabase و PostgreSQL إلى رسائل عربية واضحة للمستخدم
 *
 * @param error كائن الخطأ المستلم من استعلام Supabase أو Postgres
 * @param operation اسم العملية الجارية (مثل: "حفظ الفاتورة", "حذف المورد")
 * @returns نص توضيحي عربي ملائم للعرض على شاشة المستخدم
 */
export const handleSupabaseError = (
  error: unknown,
  operation: string = 'العملية'
): string => {
  if (!error) return 'حدث خطأ غير معروف';

  let errorMessage = '';
  let errorCode = '';

  if (typeof error === 'object') {
    const errObj = error as Record<string, unknown>;
    errorMessage = String(errObj.message || errObj.error_description || errObj.error || errObj.details || '');
    errorCode = String(errObj.code || '');
  } else if (typeof error === 'string') {
    errorMessage = error;
  }

  const upper = errorMessage.toUpperCase();
  const code = errorCode.toUpperCase();

  // 1. أخطاء تكرار المفاتيح الفريدة (Unique Violation - Code 23505)
  if (code === '23505' || upper.includes('UNIQUE') || upper.includes('DUPLICATE KEY')) {
    return `هذا السجل موجود بالفعل في ${operation}`;
  }

  // 2. أخطاء القيود التبادلية والمفاتيح الخارجية (Foreign Key Violation - Code 23503)
  if (code === '23503' || upper.includes('FOREIGN KEY') || upper.includes('VIOLATES FOREIGN KEY')) {
    return `لا يمكن حذف هذا السجل لأنه مرتبط ببيانات أخرى`;
  }

  // 3. أخطاء صلاحيات RLS ومستويات الأمان (RLS Violation - Code 42501)
  if (code === '42501' || upper.includes('ROW-LEVEL SECURITY') || upper.includes('PERMISSION DENIED') || upper.includes('NOT ALLOWED')) {
    return `تم رفض العملية: ليس لديك الصلاحيات الكافية لتنفيذ ${operation}`;
  }

  // 4. أخطاء الحقول الإلزامية (Not Null Violation - Code 23502)
  if (code === '23502' || upper.includes('NOT-NULL') || upper.includes('NULL VALUE IN COLUMN')) {
    return `أحد الحقول الإلزامية غير مكتمل في ${operation}، يرجى مراجعة البيانات المدخلة`;
  }

  // 5. أخطاء السجلات المفقودة في الاستعلامات المفردة (PGRST116)
  if (code === 'PGRST116' || upper.includes('PGRST116') || upper.includes('NOT FOUND')) {
    return `السجل المطلوب غير موجود في النظام`;
  }

  // 6. أخطاء انقطاع الاتصال بالشبكة (Network Errors)
  if (upper.includes('FAILED TO FETCH') || upper.includes('NETWORK') || upper.includes('OFFLINE') || upper.includes('ERR_CONNECTION')) {
    return `تعذر الاتصال بالخادم، يرجى التحقق من اتصال الإنترنت والمحاولة مجدداً`;
  }

  // 7. أخطاء المصادقة وانتهاء الجلسة (Auth & JWT)
  if (upper.includes('JWT') || upper.includes('AUTH') || upper.includes('TOKEN') || upper.includes('UNAUTHORIZED')) {
    return 'انتهت صلاحية جلسة تسجيل الدخول، يرجى إعادة تسجيل الدخول للمتابعة';
  }

  // 8. قيود التحقق المحاسبي والمبالغ (Check Constraint - Code 23514)
  if (code === '23514' || upper.includes('CHECK CONSTRAINT')) {
    return `البيانات المدخلة تخالف قيود التحقق المالي أو الضريبي المعتمدة`;
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

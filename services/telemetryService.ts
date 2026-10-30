/**
 * ==============================================================================
 * TriPro ERP — Enterprise Incident & Crash Telemetry Service
 * services/telemetryService.ts
 * ==============================================================================
 * خدمة الرصد والاستجابة اللحظية للأخطاء الميدانية في فروع ومنشآت النظام.
 * تقوم بالتقاط الأخطاء البرمجية والانهيارات غير المتوقعة وشاشات الـ ErrorBoundary
 * مع تجميعها ومنع التكرار (Debounce/Deduplication) وإرسالها بأمان إلى السحابة.
 * ==============================================================================
 */

import { supabase } from '../supabaseClient';
import { logger } from '../utils/logger';
import { secureStorage } from '../utils/securityMiddleware';

export interface TelemetryContext {
  moduleName?: string;
  fallbackTitle?: string;
  componentStack?: string;
  url?: string;
  orgId?: string;
  userId?: string;
  severity?: 'critical' | 'warning' | 'info';
  metadata?: Record<string, unknown>;
}

class TelemetryService {
  private lastErrors = new Map<string, number>();
  private readonly DEDUPLICATION_WINDOW_MS = 60000; // دقيقة واحدة لمنع تكرار نفس الخطأ
  private initialized = false;

  public init() {
    if (this.initialized || typeof window === 'undefined') return;
    this.initialized = true;

    // 1. التقاط الاستثناءات غير المعالجة في المتصفح
    window.addEventListener('error', (event) => {
      if (event.error) {
        this.captureException(event.error, {
          moduleName: 'GlobalWindow',
          severity: 'critical',
          metadata: {
            filename: event.filename,
            lineno: event.lineno,
            colno: event.colno,
          }
        });
      }
    });

    // 2. التقاط الوعود غير المعالجة (Unhandled Promise Rejections)
    window.addEventListener('unhandledrejection', (event) => {
      const reason = event.reason;
      const error = reason instanceof Error ? reason : new Error(String(reason));
      this.captureException(error, {
        moduleName: 'UnhandledPromise',
        severity: 'warning',
        metadata: { rawReason: String(reason) }
      });
    });
  }

  public async captureException(error: Error | string, context: TelemetryContext = {}) {
    try {
      const message = typeof error === 'string' ? error : error?.message || 'Unknown Error';
      const stack = typeof error === 'string' ? '' : error?.stack || '';
      const moduleName = context.moduleName || 'ApplicationCore';
      const severity = context.severity || 'critical';

      // مفتاح فريد لمنع إغراق الشبكة بنفس الخطأ المتكرر
      const errorKey = `${moduleName}:${message}`;
      const now = Date.now();
      const lastSeen = this.lastErrors.get(errorKey);
      if (lastSeen && now - lastSeen < this.DEDUPLICATION_WINDOW_MS) {
        return; // تم الإبلاغ عن نفس الخطأ مؤخراً
      }
      this.lastErrors.set(errorKey, now);

      // استخراج المنظمة والمستخدم الحاليين من التخزين الآمن أو الجلسة
      let orgId = context.orgId;
      let userId = context.userId;

      if (!orgId || !userId) {
        try {
          const rawAuth = secureStorage.getItem('tripro_auth_user');
          if (rawAuth) {
            const parsed = typeof rawAuth === 'string' ? JSON.parse(rawAuth) : rawAuth;
            orgId = orgId || parsed.organization_id;
            userId = userId || parsed.id;
          }
        } catch {
          // تجاهل أخطاء التخزين
        }
      }

      const payload: Record<string, unknown> = {
        event_type: 'CLIENT_EXCEPTION',
        description: `خطأ تقني في واجهة (${moduleName}): ${message.slice(0, 200)}`,
        module: moduleName.toLowerCase(),
        severity,
        performed_by: userId || null,
        created_at: new Date().toISOString(),
        metadata: {
          error_message: message,
          error_stack: stack.slice(0, 1000),
          component_stack: context.componentStack?.slice(0, 1000) || null,
          url: context.url || (typeof window !== 'undefined' ? window.location.href : null),
          user_agent: typeof navigator !== 'undefined' ? navigator.userAgent : null,
          ...context.metadata
        }
      };

      if (orgId) {
        payload.organization_id = orgId;
      }

      // إرسال هادئ بدون انتظار حاسم يمنع تعطيل الواجهة
      Promise.resolve(supabase.from('security_logs').insert([payload]))
        .then((res: { error?: { message?: string } | null }) => {
          if (res?.error) {
            logger.warn('Telemetry dispatch notice:', res.error.message);
          }
        })
        .catch(() => {});
    } catch {
      // الخدمة صامتة ومحمية من التسبب بأي أخطاء ثانوية
    }
  }

  // دالة لمسح ذاكرة التكرار (مفيدة في الاختبارات)
  public clearDeduplicationCache() {
    this.lastErrors.clear();
  }
}

export const telemetryService = new TelemetryService();
export default telemetryService;

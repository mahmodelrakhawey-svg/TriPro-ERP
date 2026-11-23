/**
 * ==============================================================================
 * TriPro ERP — Enterprise Incident & Crash Telemetry Service (v2.0)
 * services/telemetryService.ts
 * ==============================================================================
 * خدمة الرصد والاستجابة اللحظية المتقدمة للأخطاء الميدانية في فروع ومنشآت النظام.
 * المحاور المنفذة:
 * 1. بصمة الخطأ التجميعية (Error Fingerprint & Occurrence Count).
 * 2. جدول سحابي مخصص للحوادث التشغيلية (system_telemetry_incidents) عبر RPC أو الإدراج الذري.
 * 3. حماية من الإغراق ونافذة الخنق (Throttling & Rate Limiting) لمدة 15 دقيقة لكل بصمة خطأ.
 * 4. محرك الإشعار الفوري التلقائي (Webhook / Telegram / Slack / Edge Function) للأخطاء الحرجة.
 * 5. حافظة الأخطاء دون اتصال (Offline Incident Buffer) المعتمدة على IndexedDB / LocalStorage
 *    مع التفريغ التلقائي فور عودة الإنترنت.
 * 6. التوافق التام (Backward Compatibility) مع سجلات الأمان العامة security_logs.
 * ==============================================================================
 */

import { supabase } from '../supabaseClient';
import { logger } from '../utils/logger';
import { secureStorage } from '../utils/securityMiddleware';

export type TelemetrySeverity = 'FATAL' | 'CRITICAL' | 'WARNING' | 'INFO' | 'critical' | 'warning' | 'info';
export type IncidentStatus = 'open' | 'investigating' | 'resolved';

export interface TelemetryContext {
  moduleName?: string;
  fallbackTitle?: string;
  componentStack?: string;
  url?: string;
  orgId?: string;
  userId?: string;
  userName?: string;
  branchName?: string;
  severity?: TelemetrySeverity;
  metadata?: Record<string, unknown>;
}

export interface TelemetryIncident {
  id: string;
  organization_id?: string | null;
  error_fingerprint: string;
  error_message: string;
  error_stack?: string | null;
  component_stack?: string | null;
  severity: 'FATAL' | 'CRITICAL' | 'WARNING' | 'INFO';
  module_name: string;
  route_url?: string | null;
  device_info?: Record<string, unknown>;
  user_id?: string | null;
  user_name?: string | null;
  branch_name?: string | null;
  occurrence_count: number;
  first_seen_at: string;
  last_seen_at: string;
  status: IncidentStatus;
  resolution_notes?: string | null;
  resolved_at?: string | null;
  resolved_by?: string | null;
  metadata?: Record<string, unknown>;
  created_at?: string;
}

const OFFLINE_BUFFER_KEY = 'tripro_offline_telemetry_incidents';
const WEBHOOK_CONFIG_KEY = 'tripro_incident_webhook_config';

export interface WebhookConfig {
  url?: string;
  type?: 'generic' | 'telegram' | 'whatsapp' | 'slack' | 'discord';
  telegramChatId?: string;
  telegramBotToken?: string;
  whatsappProvider?: 'callmebot' | 'ultramsg' | 'custom';
  whatsappPhoneNumber?: string;
  whatsappApiKey?: string;
  whatsappInstanceId?: string;
  enabled?: boolean;
}

class TelemetryService {
  private lastErrors = new Map<string, number>();
  private alertThrottles = new Map<string, number>();
  private readonly DEDUPLICATION_WINDOW_MS = 60000; // دقيقة واحدة لمنع إغراق الشبكة
  private readonly ALERT_THROTTLE_WINDOW_MS = 15 * 60 * 1000; // 15 دقيقة للتنبيهات الفورية
  private initialized = false;
  private isFlushing = false;

  public init() {
    if (this.initialized || typeof window === 'undefined') return;
    this.initialized = true;

    // 1. التقاط الاستثناءات غير المعالجة في المتصفح
    window.addEventListener('error', (event) => {
      if (event.error) {
        this.captureException(event.error, {
          moduleName: 'GlobalWindow',
          severity: 'CRITICAL',
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
        severity: 'WARNING',
        metadata: { rawReason: String(reason) }
      });
    });

    // 3. الاستماع لعودة الاتصال لتفريغ حافظة الأوفلاين تلقائياً
    window.addEventListener('online', () => {
      this.flushOfflineBuffer().catch(() => {});
    });

    // محاولة أولية لتفريغ أي حوادث مؤجلة عند بدء التشغيل
    setTimeout(() => {
      this.flushOfflineBuffer().catch(() => {});
    }, 3000);
  }

  /**
   * توليد بصمة فريدة محددة للخطأ لتجميع التكرارات (Error Fingerprint)
   */
  public generateFingerprint(moduleName: string, message: string, stack: string = ''): string {
    const cleanMsg = (message || '').trim().toLowerCase().slice(0, 160);
    const cleanMod = (moduleName || 'app').trim().toLowerCase();
    
    // استخراج أول سطر حقيقي من الـ Stack Trace لزيادة دقة البصمة
    let stackSnippet = '';
    if (stack) {
      const lines = stack.split('\n').map(l => l.trim()).filter(l => l.startsWith('at '));
      if (lines.length > 0) {
        stackSnippet = lines[0].replace(/:\d+:\d+\)?$/, '').slice(-60);
      }
    }

    const raw = `${cleanMod}::${cleanMsg}::${stackSnippet}`;
    let hash = 0;
    for (let i = 0; i < raw.length; i++) {
      hash = ((hash << 5) - hash) + raw.charCodeAt(i);
      hash |= 0;
    }
    const hex = Math.abs(hash).toString(16).padStart(8, '0');
    return `FP-${cleanMod.slice(0, 8)}-${hex}`.toUpperCase();
  }

  /**
   * استخراج معلومات الجهاز والبيئة بأمان تام
   */
  public getDeviceInfo(): Record<string, unknown> {
    if (typeof window === 'undefined') {
      return { platform: 'node-or-ssr' };
    }

    return {
      userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'unknown',
      platform: typeof navigator !== 'undefined' ? (navigator as any).platform || 'unknown' : 'unknown',
      language: typeof navigator !== 'undefined' ? navigator.language : 'ar',
      screenResolution: `${window.innerWidth}x${window.innerHeight}`,
      pixelRatio: window.devicePixelRatio || 1,
      isOnline: typeof navigator !== 'undefined' ? navigator.onLine : true,
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
    };
  }

  /**
   * المعالجة والالتقاط الرئيسية لأي استثناء أو انهيار
   */
  public async captureException(error: Error | string, context: TelemetryContext = {}) {
    try {
      const message = typeof error === 'string' ? error : error?.message || 'Unknown Error';
      const stack = typeof error === 'string' ? '' : error?.stack || '';
      const moduleName = context.moduleName || 'ApplicationCore';
      
      const rawSev = (context.severity || 'CRITICAL').toUpperCase();
      const severity: 'FATAL' | 'CRITICAL' | 'WARNING' | 'INFO' = 
        (rawSev === 'FATAL' || rawSev === 'CRITICAL' || rawSev === 'WARNING' || rawSev === 'INFO') 
          ? rawSev 
          : 'CRITICAL';

      const fingerprint = this.generateFingerprint(moduleName, message, stack);
      const routeUrl = context.url || (typeof window !== 'undefined' ? window.location.href : null);
      const deviceInfo = this.getDeviceInfo();

      // مفتاح لمنع إغراق الشبكة بالاستثناءات المتكررة جداً (Deduplication)
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
      let userName = context.userName;
      let branchName = context.branchName;

      if (!orgId || !userId) {
        try {
          const rawAuth = secureStorage.getItem<any>('tripro_auth_user');
          if (rawAuth) {
            const parsed = typeof rawAuth === 'string' ? JSON.parse(rawAuth) : rawAuth;
            orgId = orgId || parsed.organization_id;
            userId = userId || parsed.id;
            userName = userName || parsed.full_name || parsed.name || parsed.email;
          }
        } catch {
          // استمرار آمن
        }
      }

      // 1. الإرسال لسجل الأمان العام (Backward Compatibility القديم لا يتأثر)
      this.dispatchToSecurityLogs({
        moduleName,
        message,
        stack,
        context,
        severity: severity.toLowerCase(),
        orgId,
        userId,
        routeUrl
      });

      // 2. تجهيز حمولة الحادثة التشغيلية المتقدمة لجدول system_telemetry_incidents
      const incidentPayload = {
        organization_id: orgId || null,
        error_fingerprint: fingerprint,
        error_message: message,
        error_stack: stack.slice(0, 3000),
        component_stack: context.componentStack?.slice(0, 3000) || null,
        severity,
        module_name: moduleName,
        route_url: routeUrl,
        device_info: deviceInfo,
        user_id: userId || null,
        user_name: userName || null,
        branch_name: branchName || null,
        metadata: context.metadata || {}
      };

      // 3. التحقق من حالة الاتصال: إن كنا بدون إنترنت، يتم الحفظ في الـ Offline Buffer
      const isOnline = typeof navigator === 'undefined' || navigator.onLine !== false;
      if (!isOnline) {
        this.bufferIncidentLocally(incidentPayload);
        return;
      }

      // 4. الإرسال إلى السحابة عبر RPC الذري أو الإدراج المباشر في system_telemetry_incidents
      const dispatchedSuccessfully = await this.dispatchToCloudIncidents(incidentPayload);
      if (!dispatchedSuccessfully) {
        // إذا فشل الإرسال الشبكي، نحفظه في الحافظة لضمان عدم ضياعه
        this.bufferIncidentLocally(incidentPayload);
      }

      // 5. محرك الإشعار الفوري (Instant Alert Dispatcher) إذا كان الخطأ حرجاً
      if (severity === 'CRITICAL' || severity === 'FATAL') {
        await this.dispatchInstantAlert(incidentPayload, fingerprint);
      }

    } catch {
      // الخدمة صامتة ومحمية من التسبب بأي أخطاء ثانوية
    }
  }

  /**
   * إرسال صامت لجدول security_logs للحفاظ على التوافق التام 100%
   */
  private dispatchToSecurityLogs(params: {
    moduleName: string;
    message: string;
    stack: string;
    context: TelemetryContext;
    severity: string;
    orgId?: string;
    userId?: string;
    routeUrl: string | null;
  }) {
    try {
      const payload: Record<string, unknown> = {
        event_type: 'CLIENT_EXCEPTION',
        description: `خطأ تقني في واجهة (${params.moduleName}): ${params.message.slice(0, 200)}`,
        module: params.moduleName.toLowerCase(),
        severity: params.severity,
        performed_by: params.userId || null,
        created_at: new Date().toISOString(),
        metadata: {
          error_message: params.message,
          error_stack: params.stack.slice(0, 1000),
          component_stack: params.context.componentStack?.slice(0, 1000) || null,
          url: params.routeUrl,
          user_agent: typeof navigator !== 'undefined' ? navigator.userAgent : null,
          ...params.context.metadata
        }
      };

      if (params.orgId) {
        payload.organization_id = params.orgId;
      }

      Promise.resolve(supabase.from('security_logs').insert([payload]))
        .then((res: { error?: { message?: string } | null }) => {
          if (res?.error) {
            logger.warn('Security logs telemetry notice:', res.error.message);
          }
        })
        .catch(() => {});
    } catch {
      // تجاهل
    }
  }

  /**
   * إرسال الحادثة لجدول system_telemetry_incidents عبر RPC report_telemetry_incident
   */
  private async dispatchToCloudIncidents(payload: Record<string, any>): Promise<boolean> {
    try {
      // محاولة استدعاء الـ RPC الذري أولاً إن كان متاحاً
      if (typeof supabase.rpc === 'function') {
        const rpcResult = await supabase.rpc('report_telemetry_incident', {
          p_error_fingerprint: payload.error_fingerprint,
          p_error_message: payload.error_message,
          p_severity: payload.severity,
          p_module_name: payload.module_name,
          p_error_stack: payload.error_stack || null,
          p_component_stack: payload.component_stack || null,
          p_route_url: payload.route_url || null,
          p_device_info: payload.device_info || {},
          p_organization_id: payload.organization_id || null,
          p_user_id: payload.user_id || null,
          p_user_name: payload.user_name || null,
          p_branch_name: payload.branch_name || null,
          p_metadata: payload.metadata || {}
        });

        if (!rpcResult?.error) {
          return true;
        }
      }

      // في حال لم يكن الـ RPC مطبقاً بعد على الخادم، نلجأ للإدراج المباشر
      const insertResult = await supabase.from('system_telemetry_incidents').insert([{
        organization_id: payload.organization_id,
        error_fingerprint: payload.error_fingerprint,
        error_message: payload.error_message,
        error_stack: payload.error_stack,
        component_stack: payload.component_stack,
        severity: payload.severity,
        module_name: payload.module_name,
        route_url: payload.route_url,
        device_info: payload.device_info,
        user_id: payload.user_id,
        user_name: payload.user_name,
        branch_name: payload.branch_name,
        metadata: payload.metadata
      }]);

      return !insertResult.error;
    } catch (err) {
      logger.warn('Direct incident dispatch error:', err);
      return false;
    }
  }

  /**
   * حفظ الحادثة محلياً أثناء انقطاع الإنترنت (Offline Incident Buffer)
   */
  public bufferIncidentLocally(payload: Record<string, any>): void {
    try {
      if (typeof window === 'undefined') return;

      const raw = secureStorage.getItem<any[]>(OFFLINE_BUFFER_KEY);
      const buffer: any[] = Array.isArray(raw) ? raw : [];

      // نمنع تراكم أكثر من 100 حادثة أوفلاين لتجنب استهلاك الذاكرة
      if (buffer.length >= 100) {
        buffer.shift();
      }

      buffer.push({
        ...payload,
        buffered_at: new Date().toISOString()
      });

      secureStorage.setItem(OFFLINE_BUFFER_KEY, buffer);
    } catch (err) {
      logger.warn('Could not buffer telemetry incident offline:', err);
    }
  }

  /**
   * تفريغ وبث حوادث الأوفلاين تلقائياً عند عودة الإنترنت
   */
  public async flushOfflineBuffer(): Promise<number> {
    if (this.isFlushing || typeof window === 'undefined') return 0;
    this.isFlushing = true;

    try {
      const buffer = secureStorage.getItem<any[]>(OFFLINE_BUFFER_KEY);
      if (!Array.isArray(buffer) || buffer.length === 0) {
        this.isFlushing = false;
        return 0;
      }

      const remaining: any[] = [];
      let flushedCount = 0;

      for (const incident of buffer) {
        try {
          const success = await this.dispatchToCloudIncidents(incident);
          if (success) {
            flushedCount++;
          } else {
            remaining.push(incident);
          }
        } catch {
          remaining.push(incident);
        }
      }

      if (remaining.length > 0) {
        secureStorage.setItem(OFFLINE_BUFFER_KEY, remaining);
      } else {
        secureStorage.removeItem(OFFLINE_BUFFER_KEY);
      }

      return flushedCount;
    } catch (err) {
      logger.warn('Error flushing offline telemetry buffer:', err);
      return 0;
    } finally {
      this.isFlushing = false;
    }
  }

  /**
   * إرسال تنبيه فوري ومباشر (Instant Alert Dispatcher) مع حماية الـ Throttling
   */
  public async dispatchInstantAlert(incident: Record<string, any>, fingerprint: string): Promise<boolean> {
    try {
      const now = Date.now();
      const lastAlert = this.alertThrottles.get(fingerprint);

      // Throttling: تنبيه واحد فقط لكل نوع خطأ خلال 15 دقيقة
      if (lastAlert && (now - lastAlert) < this.ALERT_THROTTLE_WINDOW_MS) {
        return false;
      }
      this.alertThrottles.set(fingerprint, now);

      const config = this.getWebhookConfig();
      if (!config || !config.enabled) {
        return false;
      }

      // التحقق من اكتمال المعطيات حسب النوع
      if (config.type === 'telegram') {
        if (!config.telegramBotToken || !config.telegramChatId) return false;
      } else if (config.type === 'whatsapp') {
        if (!config.whatsappPhoneNumber) return false;
      } else if (!config.url) {
        return false;
      }

      const alertBody = {
        title: `🚨 [TriPro ERP Alert] ${incident.severity} في شاشة ${incident.module_name}`,
        message: incident.error_message,
        fingerprint,
        severity: incident.severity,
        module: incident.module_name,
        url: incident.route_url,
        user: incident.user_name || 'Unknown',
        branch: incident.branch_name || 'Main',
        timestamp: new Date().toISOString()
      };

      // إذا كان الإشعار لـ WhatsApp
      if (config.type === 'whatsapp' && config.whatsappPhoneNumber) {
        const cleanPhone = config.whatsappPhoneNumber.replace(/[^0-9]/g, '');
        const waText = `🚨 *تنبيه خطأ حرج في منظومة TriPro ERP*\n\n` +
          `• *الخطورة:* ${incident.severity}\n` +
          `• *الموديول:* ${incident.module_name}\n` +
          `• *الرسالة:* ${incident.error_message.slice(0, 180)}\n` +
          `• *الشاشة:* ${incident.route_url || 'غير محدد'}\n` +
          `• *المستخدم:* ${incident.user_name || 'غير معروف'}\n` +
          `• *البصمة:* ${fingerprint}\n` +
          `• *الوقت:* ${new Date().toLocaleTimeString('ar-EG')}`;

        const provider = config.whatsappProvider || 'callmebot';

        if (provider === 'callmebot') {
          // CallMeBot API (مجاني)
          const apikey = config.whatsappApiKey || '';
          const callMeBotUrl = `https://api.callmebot.com/whatsapp.php?phone=${cleanPhone}&text=${encodeURIComponent(waText)}&apikey=${apikey}`;
          await fetch(callMeBotUrl, { method: 'GET' });
          return true;
        } else if (provider === 'ultramsg') {
          // UltraMsg API
          const instance = config.whatsappInstanceId || '';
          const token = config.whatsappApiKey || '';
          await fetch(`https://api.ultramsg.com/${instance}/messages/chat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              token,
              to: cleanPhone,
              body: waText
            })
          });
          return true;
        } else {
          // Custom WhatsApp Gateway / Webhook
          const targetUrl = config.url || '';
          if (targetUrl) {
            await fetch(targetUrl, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                phone: cleanPhone,
                message: waText,
                severity: incident.severity,
                module: incident.module_name,
                fingerprint
              })
            });
            return true;
          }
          return false;
        }
      }

      // إذا كان الإشعار لـ Telegram Bot
      if (config.type === 'telegram' && config.telegramBotToken && config.telegramChatId) {
        const text = `🚨 *تنبيه خطأ حرج في منظومة TriPro ERP*\n\n` +
          `• *الخطورة:* ${incident.severity}\n` +
          `• *الموديول:* ${incident.module_name}\n` +
          `• *الرسالة:* ${incident.error_message.slice(0, 180)}\n` +
          `• *الشاشة:* ${incident.route_url || 'غير محدد'}\n` +
          `• *المستخدم:* ${incident.user_name || 'غير معروف'}\n` +
          `• *البصمة:* \`${fingerprint}\`\n` +
          `• *الوقت:* ${new Date().toLocaleTimeString('ar-EG')}`;

        await fetch(`https://api.telegram.org/bot${config.telegramBotToken}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: config.telegramChatId,
            text,
            parse_mode: 'Markdown'
          })
        });
        return true;
      }

      if (!config.url) {
        return false;
      }

      // إذا كان الإشعار لـ Slack أو Discord أو Webhook عام
      let payloadBody: Record<string, unknown>;
      if (config.type === 'slack') {
        payloadBody = {
          text: `🚨 *[TriPro Incident]* ${incident.severity}: ${incident.module_name} - ${incident.error_message}`,
          attachments: [{
            color: incident.severity === 'FATAL' ? '#990000' : '#ff0000',
            fields: [
              { title: 'Module', value: incident.module_name, short: true },
              { title: 'Severity', value: incident.severity, short: true },
              { title: 'URL', value: incident.route_url || 'N/A', short: false },
              { title: 'Fingerprint', value: fingerprint, short: true },
            ]
          }]
        };
      } else if (config.type === 'discord') {
        payloadBody = {
          content: `🚨 **[TriPro ERP Alert - ${incident.severity}]**\n**Module:** ${incident.module_name}\n**Error:** ${incident.error_message}\n**URL:** ${incident.route_url || 'N/A'}\n**Fingerprint:** \`${fingerprint}\``
        };
      } else {
        payloadBody = alertBody;
      }

      await fetch(config.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payloadBody)
      });

      return true;
    } catch (err) {
      logger.warn('Failed to dispatch instant alert webhook:', err);
      return false;
    }
  }

  /**
   * استرجاع إعدادات الويب هوك من التخزين الآمن أو البيئة
   */
  public getWebhookConfig(): WebhookConfig {
    try {
      if (typeof window !== 'undefined') {
        const stored = secureStorage.getItem<WebhookConfig>(WEBHOOK_CONFIG_KEY);
        if (stored) return stored;
      }
    } catch {
      // تجاهل
    }
    return {
      enabled: false,
      type: 'generic'
    };
  }

  /**
   * حفظ إعدادات الويب هوك للتنبيهات الفورية
   */
  public setWebhookConfig(config: WebhookConfig): void {
    try {
      if (typeof window !== 'undefined') {
        secureStorage.setItem(WEBHOOK_CONFIG_KEY, config);
      }
    } catch (e) {
      logger.warn('Could not save webhook config:', e);
    }
  }

  /**
   * قراءة الحوادث المسجلة للوحة مراقبة الحوادث (Incident Monitor Hub)
   */
  public async fetchIncidents(params: {
    organizationId?: string;
    status?: IncidentStatus | 'all';
    severity?: string | 'all';
    limit?: number;
  } = {}): Promise<TelemetryIncident[]> {
    try {
      let query = supabase
        .from('system_telemetry_incidents')
        .select('*')
        .order('last_seen_at', { ascending: false });

      if (params.organizationId) {
        query = query.eq('organization_id', params.organizationId);
      }

      if (params.status && params.status !== 'all') {
        query = query.eq('status', params.status);
      }

      if (params.severity && params.severity !== 'all') {
        query = query.eq('severity', params.severity.toUpperCase());
      }

      if (params.limit) {
        query = query.limit(params.limit);
      } else {
        query = query.limit(100);
      }

      const { data, error } = await query;
      if (error) throw error;
      return (data || []) as TelemetryIncident[];
    } catch (err) {
      logger.warn('Failed to fetch telemetry incidents:', err);
      return [];
    }
  }

  /**
   * تحديث حالة الحادثة (open -> investigating -> resolved)
   */
  public async updateIncidentStatus(
    incidentId: string,
    status: IncidentStatus,
    notes?: string,
    resolvedBy?: string
  ): Promise<boolean> {
    try {
      const updateData: Record<string, any> = {
        status,
        resolution_notes: notes || null
      };

      if (status === 'resolved') {
        updateData.resolved_at = new Date().toISOString();
        updateData.resolved_by = resolvedBy || null;
      }

      const { error } = await supabase
        .from('system_telemetry_incidents')
        .update(updateData)
        .eq('id', incidentId);

      return !error;
    } catch (err) {
      logger.warn('Failed to update incident status:', err);
      return false;
    }
  }

  // دوال الصيانة والاختبار
  public clearDeduplicationCache() {
    this.lastErrors.clear();
    this.alertThrottles.clear();
  }

  public getOfflineQueueCount(): number {
    try {
      if (typeof window === 'undefined') return 0;
      const buffer = secureStorage.getItem<any[]>(OFFLINE_BUFFER_KEY);
      return Array.isArray(buffer) ? buffer.length : 0;
    } catch {
      return 0;
    }
  }
}

export const telemetryService = new TelemetryService();
export default telemetryService;

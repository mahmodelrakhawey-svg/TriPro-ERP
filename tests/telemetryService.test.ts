import { describe, it, expect, vi, beforeEach } from 'vitest';
import { telemetryService } from '../services/telemetryService';

// Mock Supabase
vi.mock('../supabaseClient', () => {
  const mockInsert = vi.fn().mockResolvedValue({ data: null, error: null });
  const mockUpdate = vi.fn().mockReturnValue({
    eq: vi.fn().mockResolvedValue({ data: null, error: null })
  });
  const mockSelect = vi.fn().mockReturnValue({
    order: vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        limit: vi.fn().mockResolvedValue({
          data: [
            {
              id: 'incident-1',
              error_fingerprint: 'FP-RETAIL-ABC',
              error_message: 'فشل مزامنة الدفع',
              severity: 'CRITICAL',
              module_name: 'RetailPOS',
              occurrence_count: 5,
              status: 'open',
              last_seen_at: new Date().toISOString()
            }
          ],
          error: null
        })
      }),
      limit: vi.fn().mockResolvedValue({
        data: [],
        error: null
      })
    })
  });
  const mockRpc = vi.fn().mockResolvedValue({
    data: { id: 'incident-uuid-1', occurrence_count: 1, is_new: true },
    error: null
  });
  const mockFrom = vi.fn().mockReturnValue({
    insert: mockInsert,
    update: mockUpdate,
    select: mockSelect,
  });
  return {
    supabase: {
      from: mockFrom,
      rpc: mockRpc,
    },
  };
});

import { supabase } from '../supabaseClient';

describe('Enterprise Incident & Crash Telemetry Service (اختبار خدمة رصد الأعطال اللحظية)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    telemetryService.clearDeduplicationCache();
    if (typeof localStorage !== 'undefined') {
      localStorage.clear();
    }
  });

  it('يجب أن يسجل الاستثناء ويرسله لجدول security_logs بنوع CLIENT_EXCEPTION', async () => {
    const testError = new Error('تعذر الاتصال بطابعة الباركود في المعرض');
    const mockContext = {
      moduleName: 'RetailPOS',
      orgId: 'org-lenza-showroom-1',
      userId: 'user-cashier-10',
      severity: 'critical' as const,
      metadata: { invoiceId: 'INV-2026-0042' }
    };

    await telemetryService.captureException(testError, mockContext);

    expect(supabase.from).toHaveBeenCalledWith('security_logs');
    const insertCalls = (supabase.from('security_logs').insert as any).mock.calls;
    expect(insertCalls.length).toBe(1);

    const payload = insertCalls[0][0][0];
    expect(payload.event_type).toBe('CLIENT_EXCEPTION');
    expect(payload.module).toBe('retailpos');
    expect(payload.severity).toBe('critical');
    expect(payload.organization_id).toBe('org-lenza-showroom-1');
    expect(payload.performed_by).toBe('user-cashier-10');
    expect(payload.description).toContain('RetailPOS');
    expect(payload.description).toContain('تعذر الاتصال بطابعة الباركود');
    expect(payload.metadata.error_message).toBe('تعذر الاتصال بطابعة الباركود في المعرض');
    expect(payload.metadata.invoiceId).toBe('INV-2026-0042');
  });

  it('يجب أن يمنع إغراق الشبكة (Deduplication) عند تكرار نفس الخطأ في نفس الموديول', async () => {
    const loopError = new Error('Network timeout socket error');

    // إرسال الخطأ 5 مرات متتالية في نفس الثانية
    await telemetryService.captureException(loopError, { moduleName: 'SalesScreen' });
    await telemetryService.captureException(loopError, { moduleName: 'SalesScreen' });
    await telemetryService.captureException(loopError, { moduleName: 'SalesScreen' });
    await telemetryService.captureException(loopError, { moduleName: 'SalesScreen' });
    await telemetryService.captureException(loopError, { moduleName: 'SalesScreen' });

    // يجب إرسال الخطأ مرة واحدة فقط لقاعدة البيانات
    const insertCalls = (supabase.from('security_logs').insert as any).mock.calls;
    expect(insertCalls.length).toBe(1);
  });

  it('يجب أن يتعامل مع الأخطاء النصية (String Errors) بأمان تام دون انهيار', async () => {
    await telemetryService.captureException('خطأ في معالجة ميزان المراجعة', {
      moduleName: 'GeneralLedger',
      orgId: 'org-lenza-main'
    });

    expect(supabase.from).toHaveBeenCalledWith('security_logs');
    const insertCalls = (supabase.from('security_logs').insert as any).mock.calls;
    expect(insertCalls.length).toBe(1);
    expect(insertCalls[0][0][0].metadata.error_message).toBe('خطأ في معالجة ميزان المراجعة');
  });

  it('يجب توليد بصمة فريدة محددة للخطأ (Deterministic Error Fingerprint)', () => {
    const fp1 = telemetryService.generateFingerprint('RetailPOS', 'فشل في الاتصال بالطابعة');
    const fp2 = telemetryService.generateFingerprint('RetailPOS', 'فشل في الاتصال بالطابعة');
    const fp3 = telemetryService.generateFingerprint('GeneralLedger', 'فشل في الاتصال بالطابعة');

    expect(fp1).toBe(fp2);
    expect(fp1).not.toBe(fp3);
    expect(fp1.startsWith('FP-RETAILP')).toBe(true);
  });

  it('يجب تخزين الحادثة في الحافظة المحلية عند انقطاع الإنترنت وتفريغها عند عودة الاتصال (Offline Buffer)', async () => {
    const sampleIncident = {
      organization_id: 'org-123',
      error_fingerprint: 'FP-TEST-001',
      error_message: 'انهيار الكاشير أثناء انقطاع النت',
      severity: 'CRITICAL',
      module_name: 'RetailPOS'
    };

    // التخزين في الـ Buffer المحلي
    telemetryService.bufferIncidentLocally(sampleIncident);
    expect(telemetryService.getOfflineQueueCount()).toBe(1);

    // تفريغ الحافظة
    const flushed = await telemetryService.flushOfflineBuffer();
    expect(flushed).toBe(1);
    expect(telemetryService.getOfflineQueueCount()).toBe(0);
  });

  it('يجب تطبيق تقنية الحماية من الإغراق (Throttling) على تنبيهات Webhook خلال 15 دقيقة', async () => {
    const globalFetch = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', globalFetch);

    telemetryService.setWebhookConfig({
      enabled: true,
      url: 'https://webhook.site/mock-tripro-alerts',
      type: 'generic'
    });

    const incident = {
      severity: 'CRITICAL',
      module_name: 'CashShiftClosing',
      error_message: 'فشل ترحيل إغلاق وردية كاشير 4'
    };
    const fingerprint = 'FP-CASH-CRIT-99';

    // التنبيه الأول: يجب أن يرسل
    const firstSent = await telemetryService.dispatchInstantAlert(incident, fingerprint);
    expect(firstSent).toBe(true);
    expect(globalFetch).toHaveBeenCalledTimes(1);

    // التنبيه الثاني لنفس البصمة فوراً: يجب أن يُخنق (Throttled) ولا يُرسل
    const secondSent = await telemetryService.dispatchInstantAlert(incident, fingerprint);
    expect(secondSent).toBe(false);
    expect(globalFetch).toHaveBeenCalledTimes(1);

    vi.unstubAllGlobals();
  });

  it('يجب تحديث حالة الحادثة التشغيلية بنجاح عبر updateIncidentStatus', async () => {
    const success = await telemetryService.updateIncidentStatus('incident-1', 'resolved', 'تم إصلاح الإعدادات', 'admin-user-id');
    expect(success).toBe(true);
    expect(supabase.from).toHaveBeenCalledWith('system_telemetry_incidents');
  });
});

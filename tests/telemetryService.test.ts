import { describe, it, expect, vi, beforeEach } from 'vitest';
import { telemetryService } from '../services/telemetryService';

// Mock Supabase
vi.mock('../supabaseClient', () => {
  const mockInsert = vi.fn().mockResolvedValue({ data: null, error: null });
  const mockFrom = vi.fn().mockReturnValue({
    insert: mockInsert,
  });
  return {
    supabase: {
      from: mockFrom,
    },
  };
});

import { supabase } from '../supabaseClient';

describe('Enterprise Incident & Crash Telemetry Service (اختبار خدمة رصد الأعطال اللحظية)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    telemetryService.clearDeduplicationCache();
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
});

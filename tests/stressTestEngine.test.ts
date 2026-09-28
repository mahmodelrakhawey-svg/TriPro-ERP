import { describe, it, expect, vi, beforeEach } from 'vitest';
import { StressTestEngine, TestLog } from '../services/stressTestEngine';
import { supabase } from '../supabaseClient';

vi.mock('../supabaseClient', () => {
  const mockRpc = vi.fn().mockImplementation((fnName: string) => {
    if (fnName === 'delete_stress_test_data') {
      return Promise.resolve({ data: { success: true }, error: null });
    }
    return Promise.resolve({ data: null, error: null });
  });

  const mockFrom = vi.fn().mockImplementation((table: string) => {
    return {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      or: vi.fn().mockReturnThis(),
      ilike: vi.fn().mockReturnThis(),
      in: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
      delete: vi.fn().mockResolvedValue({ data: null, error: null }),
      insert: vi.fn().mockResolvedValue({ data: null, error: null }),
    };
  });

  return {
    supabase: {
      rpc: mockRpc,
      from: mockFrom,
    },
  };
});

describe('🚀 StressTestEngine (System Stress Testing & Concurrency Safety)', () => {
  const mockOrgId = 'org-lenza-stress-test';
  const mockUser = { id: 'usr-admin-1', role: 'admin' };

  it('يقوم بتهيئة محرك الضغط وتسجيل الحركات عبر الـ Callback بشكل صحيح', () => {
    const receivedLogs: TestLog[] = [];
    const onLogUpdate = (log: TestLog) => {
      receivedLogs.push(log);
    };

    const engine = new StressTestEngine(mockOrgId, mockUser, onLogUpdate);
    expect(engine).toBeDefined();

    // فحص إضافة سجل يدوي
    (engine as any).addLog('المحاسبة', 'قيد تجريبي متزامن', 'passed', 'تم التحقق من التوازن', 5000, 'TEST-001');

    expect(receivedLogs).toHaveLength(1);
    expect(receivedLogs[0].module).toBe('المحاسبة');
    expect(receivedLogs[0].status).toBe('passed');
    expect(receivedLogs[0].amount).toBe(5000);
    expect(receivedLogs[0].reference).toBe('TEST-001');
  });

  it('ينفذ آلية تنظيف بيانات الاختبار بأمان تام عبر delete_stress_test_data دون المساس بالبيانات الأصلية', async () => {
    const logs: TestLog[] = [];
    const engine = new StressTestEngine(mockOrgId, mockUser, (log) => logs.push(log));

    await engine.cleanupTestData();

    expect(supabase.rpc).toHaveBeenCalledWith('delete_stress_test_data', {
      p_org_id: mockOrgId,
    });

    const passedLog = logs.find((l) => l.stepName === 'تم تنظيف بيانات الاختبار بالكامل');
    expect(passedLog).toBeDefined();
    expect(passedLog?.status).toBe('passed');
  });
});

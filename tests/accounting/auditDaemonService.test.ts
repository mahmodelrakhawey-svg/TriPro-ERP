import { describe, it, expect, vi } from 'vitest';
import { auditDaemonService } from '../../services/auditDaemonService';
import { supabase } from '../../supabaseClient';

vi.mock('../../supabaseClient', () => {
  const mockRpc = vi.fn().mockImplementation((fnName: string) => {
    if (fnName === 'recalculate_all_system_balances') {
      return Promise.resolve({ data: null, error: null });
    }
    return Promise.resolve({ data: null, error: null });
  });

  const mockFrom = vi.fn().mockImplementation((table: string) => {
    if (table === 'journal_lines') {
      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        then: vi.fn((cb: any) =>
          Promise.resolve({
            data: [
              { debit: 100000, credit: 0 },
              { debit: 0, credit: 100000 },
            ],
            error: null,
          }).then(cb)
        ),
      };
    }

    if (table === 'customers') {
      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockResolvedValue({
          data: [{ balance: 45000 }],
          error: null,
        }),
      };
    }

    if (table === 'suppliers') {
      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockResolvedValue({
          data: [{ balance: 30000 }],
          error: null,
        }),
      };
    }

    if (table === 'products') {
      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        is: vi.fn().mockReturnThis(),
        then: vi.fn((cb: any) =>
          Promise.resolve({
            data: [{ stock: 100, cost: 250, cost_price: 250 }],
            error: null,
          }).then(cb)
        ),
      };
    }

    if (table === 'accounts') {
      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        or: vi.fn().mockImplementation((cond: string) => {
          let bal = 45000;
          if (cond.includes('2211')) bal = 30000;
          if (cond.includes('1030')) bal = 25000;
          return {
            maybeSingle: vi.fn().mockResolvedValue({
              data: { balance: bal },
              error: null,
            }),
          };
        }),
      };
    }

    return {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
    };
  });

  return {
    supabase: {
      rpc: mockRpc,
      from: mockFrom,
    },
  };
});

describe('🛡️ Midnight Financial Integrity & Audit Daemon Service', () => {
  const testOrgId = 'org-lenza-audit-test';

  it('يفحص الأركان الأربعة الكبرى ويؤكد توازن الأستاذ العام وتطابق الأستاذ المساعد', async () => {
    const report = await auditDaemonService.runSystemAudit(testOrgId);

    expect(report).toBeDefined();
    expect(report.organizationId).toBe(testOrgId);
    expect(report.checks).toHaveLength(5);

    // 1. توازن الأستاذ العام
    const glCheck = report.checks.find((c) => c.pillar === 'gl_balance');
    expect(glCheck).toBeDefined();
    expect(glCheck?.status).toBe('passed');
    expect(glCheck?.variance).toBe(0);

    // 2. مطابقة العملاء
    const arCheck = report.checks.find((c) => c.pillar === 'ar_subledger');
    expect(arCheck).toBeDefined();
    expect(arCheck?.status).toBe('passed');

    // 3. مطابقة الموردين
    const apCheck = report.checks.find((c) => c.pillar === 'ap_subledger');
    expect(apCheck).toBeDefined();
    expect(apCheck?.status).toBe('passed');

    // 4. تقييم المخزون
    const invCheck = report.checks.find((c) => c.pillar === 'inventory_valuation');
    expect(invCheck).toBeDefined();
    expect(invCheck?.status).toBe('passed');

    // 5. مطابقة الخزائن والسندات
    const treasuryCheck = report.checks.find((c) => c.pillar === 'treasury_subledger');
    expect(treasuryCheck).toBeDefined();
    expect(treasuryCheck?.status).toBe('passed');

    expect(report.summary.totalChecks).toBe(5);
    expect(report.summary.passedCount).toBe(5);
    expect(report.overallStatus).toBe('passed');
  });

  it('يستدعي إعادة الحساب والتسوية الشاملة بأمان عبر recalculate_all_system_balances', async () => {
    const result = await auditDaemonService.triggerAutoReconciliation(testOrgId);

    expect(result.success).toBe(true);
    expect(supabase.rpc).toHaveBeenCalledWith('recalculate_all_system_balances', {
      p_org_id: testOrgId,
    });
  });

  it('يعتمد على نتائج RPC المباشرة get_financial_audit_summary عند توافرها بقاعدة البيانات', async () => {
    const mockRpcReport = {
      success: true,
      overall_status: 'passed',
      timestamp: '2026-09-30T12:00:00Z',
      checks: [
        {
          id: 'pillar-gl',
          pillar: 'gl_balance',
          title: 'توازن الأستاذ العام',
          expected: 50000,
          actual: 50000,
          variance: 0,
          status: 'passed',
          notes: 'متوازن',
        },
        {
          id: 'pillar-ar',
          pillar: 'ar_subledger',
          title: 'مطابقة العملاء',
          expected: 20000,
          actual: 20000,
          variance: 0,
          status: 'passed',
          notes: 'متطابق',
        },
      ],
    };

    (supabase.rpc as any).mockResolvedValueOnce({
      data: mockRpcReport,
      error: null,
    });

    const report = await auditDaemonService.runSystemAudit(testOrgId);

    expect(supabase.rpc).toHaveBeenCalledWith('get_financial_audit_summary', {
      p_org_id: testOrgId,
    });
    expect(report.overallStatus).toBe('passed');
    expect(report.checks).toHaveLength(2);
    expect(report.summary.passedCount).toBe(2);
  });

  it('يستكمل الأركان الأربعة عندما تعيد قاعدة البيانات ركن الأستاذ العام فقط (pillar-gl)', async () => {
    const singleGlRpcReport = {
      success: true,
      overall_status: 'passed',
      timestamp: '2026-10-18T19:52:00Z',
      checks: [
        {
          id: 'pillar-gl',
          pillar: 'gl_balance',
          title: 'توازن الأستاذ العام (إجمالي المدين = إجمالي الدائن)',
          expected: 44257974.10,
          actual: 44257974.10,
          variance: 0,
          status: 'passed',
          notes: 'الأستاذ العام متوازن تماماً: مدين (44,257,974.10 ج.م) = دائن (44,257,974.10 ج.م)',
        },
      ],
    };

    (supabase.rpc as any).mockResolvedValueOnce({
      data: singleGlRpcReport,
      error: null,
    });

    const report = await auditDaemonService.runSystemAudit(testOrgId);

    expect(report).toBeDefined();
    // يجب أن يحتوي التقرير على جميع الأركان الخمسة وليس ركناً واحداً
    expect(report.checks).toHaveLength(5);
    expect(report.summary.totalChecks).toBe(5);
    expect(report.summary.passedCount).toBe(5);
    // ركن الأستاذ العام يحتفظ بقيمة الـ RPC الدقيقة
    const glCheck = report.checks.find((c) => c.pillar === 'gl_balance');
    expect(glCheck?.expected).toBe(44257974.10);
    // باقي الأركان تم حسابها بنجاح
    expect(report.checks.some((c) => c.pillar === 'ar_subledger')).toBe(true);
    expect(report.checks.some((c) => c.pillar === 'ap_subledger')).toBe(true);
    expect(report.checks.some((c) => c.pillar === 'inventory_valuation')).toBe(true);
    expect(report.checks.some((c) => c.pillar === 'treasury_subledger')).toBe(true);
  });
});


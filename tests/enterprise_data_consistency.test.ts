import { describe, it, expect, vi, beforeEach } from 'vitest';
import { auditDaemonService, SystemAuditReport } from '../services/auditDaemonService';
import { supabase } from '../supabaseClient';

vi.mock('../supabaseClient', () => ({
  supabase: {
    rpc: vi.fn(),
    from: vi.fn(),
  }
}));

describe('🛡️ Enterprise Data Consistency & 5-Pillar Financial Integrity Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Midnight Audit Daemon 5-Pillar System Integration', () => {
    it('يجب أن يسترجع تقرير التدقيق الخماسي بنجاح متضمناً الركن الخامس للخزائن والسندات', async () => {
      const mockAuditRpcResponse = {
        success: true,
        organization_id: 'org-test-uuid',
        timestamp: '2026-10-14T19:00:00Z',
        overall_status: 'passed',
        checks: [
          {
            id: 'pillar-gl',
            pillar: 'gl_balance',
            title: 'توازن الأستاذ العام',
            expected: 1000000,
            actual: 1000000,
            variance: 0,
            status: 'passed',
            notes: 'متوازن تماماً'
          },
          {
            id: 'pillar-ar',
            pillar: 'ar_subledger',
            title: 'مطابقة سجل العملاء',
            expected: 250000,
            actual: 250000,
            variance: 0,
            status: 'passed',
            notes: 'متطابق تماماً'
          },
          {
            id: 'pillar-ap',
            pillar: 'ap_subledger',
            title: 'مطابقة سجل الموردين',
            expected: 180000,
            actual: 180000,
            variance: 0,
            status: 'passed',
            notes: 'متطابق تماماً'
          },
          {
            id: 'pillar-inventory',
            pillar: 'inventory_valuation',
            title: 'مطابقة تقييم المخزون',
            expected: 450000,
            actual: 450000,
            variance: 0,
            status: 'passed',
            notes: 'متطابق تماماً'
          },
          {
            id: 'pillar-treasury',
            pillar: 'treasury_subledger',
            title: 'مطابقة حركة وسندات الخزائن والبنوك مع الأستاذ العام',
            expected: 439,
            actual: 439,
            variance: 0,
            status: 'passed',
            notes: 'كافة سندات الصرف والقبض مطابقة لحسابات الخزائن والبنوك بنسبة 100%'
          }
        ]
      };

      (supabase.rpc as any).mockResolvedValueOnce({
        data: mockAuditRpcResponse,
        error: null
      });

      const report = await auditDaemonService.runSystemAudit('org-test-uuid');

      expect(supabase.rpc).toHaveBeenCalledWith('get_financial_audit_summary', {
        p_org_id: 'org-test-uuid'
      });

      expect(report.overallStatus).toBe('passed');
      expect(report.checks.length).toBe(5);

      const treasuryPillar = report.checks.find(c => c.pillar === 'treasury_subledger');
      expect(treasuryPillar).toBeDefined();
      expect(treasuryPillar?.status).toBe('passed');
      expect(treasuryPillar?.expected).toBe(439);
      expect(treasuryPillar?.actual).toBe(439);
      expect(treasuryPillar?.variance).toBe(0);
    });

    it('يجب أن يرصد أي عدم تطابق في سندات الصرف أو الخزائن كحالة تحذيرية تستوجب الإصلاح التلقائي', async () => {
      const mockAuditWithMismatches = {
        success: true,
        organization_id: 'org-test-uuid',
        timestamp: '2026-10-14T19:00:00Z',
        overall_status: 'warning',
        checks: [
          {
            id: 'pillar-treasury',
            pillar: 'treasury_subledger',
            title: 'مطابقة حركة وسندات الخزائن والبنوك مع الأستاذ العام',
            expected: 439,
            actual: 438,
            variance: 1,
            status: 'warning',
            notes: 'يوجد عدد 1 سند بحاجة إلى إعادة مزامنة تلقائية مع قيود الأستاذ العام'
          }
        ]
      };

      (supabase.rpc as any).mockResolvedValueOnce({
        data: mockAuditWithMismatches,
        error: null
      });

      const report = await auditDaemonService.runSystemAudit('org-test-uuid');
      expect(report.overallStatus).toBe('warning');

      const treasuryPillar = report.checks.find(c => c.pillar === 'treasury_subledger');
      expect(treasuryPillar?.status).toBe('warning');
      expect(treasuryPillar?.variance).toBe(1);
    });
  });

  describe('Self-Healing & Auto-Reconciliation Engine', () => {
    it('دالة reconcileVouchers تستدعي auto_reconcile_all_vouchers_with_gl وتعيد التقرير بنجاح', async () => {
      (supabase.rpc as any).mockResolvedValueOnce({
        data: {
          success: true,
          organization_id: 'org-test-uuid',
          fixed_payment_vouchers: 1,
          fixed_receipt_vouchers: 0,
          mismatched_payment_vouchers: 1,
          mismatched_receipt_vouchers: 0
        },
        error: null
      });

      const res = await auditDaemonService.reconcileVouchers('org-test-uuid');

      expect(supabase.rpc).toHaveBeenCalledWith('auto_reconcile_all_vouchers_with_gl', {
        p_org_id: 'org-test-uuid'
      });
      expect(res.success).toBe(true);
      expect(res.details?.fixed_payment_vouchers).toBe(1);
    });

    it('دالة triggerAutoReconciliation تستدعي recalculate_all_system_balances الشاملة بنجاح', async () => {
      (supabase.rpc as any).mockResolvedValueOnce({
        error: null
      });

      const res = await auditDaemonService.triggerAutoReconciliation('org-test-uuid');

      expect(supabase.rpc).toHaveBeenCalledWith('recalculate_all_system_balances', {
        p_org_id: 'org-test-uuid'
      });
      expect(res.success).toBe(true);
    });
  });
});

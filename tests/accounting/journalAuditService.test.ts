import { describe, it, expect, vi, beforeEach } from 'vitest';
import { journalAuditService } from '../../services/journalAuditService';
import { supabase } from '../../supabaseClient';

vi.mock('../../supabaseClient', () => {
  const mockRpc = vi.fn();
  const mockFrom = vi.fn();
  const mockUpdate = vi.fn();
  const mockEq = vi.fn();

  return {
    supabase: {
      rpc: mockRpc,
      from: mockFrom
    }
  };
});

describe('🛡️ Journal Audit & Integrity Service (كشف القيود غير المتوازنة)', () => {
  const testOrgId = 'org-test-audit-123';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('يكتشف القيود غير المتوازنة ويحسب فارق الـ 100 جنيه بدقة عبر المسار المباشر (Fallback)', async () => {
    // محاكاة فشل استدعاء RPC لاختبار المسار المباشر
    (supabase.rpc as any).mockResolvedValue({
      data: null,
      error: { message: 'function does not exist' }
    });

    // محاكاة جدول journal_lines بقيد متزن وقيد آخر غير متوازن بفارق 100 ج.م
    const mockLines = [
      // قيد 1 متزن (JE-BALANCED): مدين 5000 ودائن 5000
      {
        journal_entry_id: 'entry-1-balanced',
        debit: 5000,
        credit: 0,
        journal_entries: {
          id: 'entry-1-balanced',
          reference: 'JE-BALANCED',
          description: 'قيد رواتب متزن',
          transaction_date: '2026-05-01',
          status: 'posted'
        }
      },
      {
        journal_entry_id: 'entry-1-balanced',
        debit: 0,
        credit: 5000,
        journal_entries: {
          id: 'entry-1-balanced',
          reference: 'JE-BALANCED',
          description: 'قيد رواتب متزن',
          transaction_date: '2026-05-01',
          status: 'posted'
        }
      },
      // قيد 2 غير متوازن (JE-UNBALANCED): مدين 600 ودائن 500 (فارق 100 ج.م)
      {
        journal_entry_id: 'entry-2-unbalanced',
        debit: 600,
        credit: 0,
        journal_entries: {
          id: 'entry-2-unbalanced',
          reference: 'JE-100-DIFF',
          description: 'قيد مشتريات به فارق 100 جنيه',
          transaction_date: '2026-05-15',
          status: 'posted'
        }
      },
      {
        journal_entry_id: 'entry-2-unbalanced',
        debit: 0,
        credit: 500,
        journal_entries: {
          id: 'entry-2-unbalanced',
          reference: 'JE-100-DIFF',
          description: 'قيد مشتريات به فارق 100 جنيه',
          transaction_date: '2026-05-15',
          status: 'posted'
        }
      }
    ];

    (supabase.from as any).mockImplementation((table: string) => {
      if (table === 'journal_lines') {
        const queryChain = {
          select: vi.fn().mockReturnThis(),
          range: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          then: vi.fn((cb: any) => Promise.resolve({ data: mockLines, error: null }).then(cb))
        };
        return queryChain;
      }
      return {};
    });

    const result = await journalAuditService.findUnbalancedEntries(testOrgId, 'all');

    expect(result.unbalancedIds).toEqual(['entry-2-unbalanced']);
    expect(result.entries.length).toBe(1);
    expect(result.entries[0].reference).toBe('JE-100-DIFF');
    expect(result.entries[0].totalDebit).toBe(600);
    expect(result.entries[0].totalCredit).toBe(500);
    expect(result.entries[0].difference).toBe(100);
    expect(result.entries[0].absDifference).toBe(100);
    expect(result.totalDifference).toBe(100);
  });

  it('يستخدم دالة PostgreSQL get_unbalanced_journal_entries بنجاح عند توفرها', async () => {
    const mockRpcData = [
      {
        entry_id: 'entry-rpc-unbalanced',
        reference: 'INV-999',
        description: 'فاتورة مبيعات غير متوازنة',
        transaction_date: '2026-06-20',
        status: 'posted',
        total_debit: 1100,
        total_credit: 1000,
        difference: 100
      }
    ];

    (supabase.rpc as any).mockResolvedValue({
      data: mockRpcData,
      error: null
    });

    const result = await journalAuditService.findUnbalancedEntries(testOrgId, 'posted');

    expect(supabase.rpc).toHaveBeenCalledWith('get_unbalanced_journal_entries', {
      p_org_id: testOrgId,
      p_status: 'posted'
    });
    expect(result.unbalancedIds).toEqual(['entry-rpc-unbalanced']);
    expect(result.entries[0].reference).toBe('INV-999');
    expect(result.entries[0].absDifference).toBe(100);
  });

  it('يفك ترحيل القيد غير المتوازن لتحويله لمسودة بنجاح', async () => {
    const mockUpdate = vi.fn().mockReturnValue({
      eq: vi.fn().mockResolvedValue({ error: null })
    });

    (supabase.from as any).mockImplementation((table: string) => {
      if (table === 'journal_entries') {
        return {
          update: mockUpdate
        };
      }
      return {};
    });

    const result = await journalAuditService.unpostEntryForCorrection('entry-to-fix');

    expect(mockUpdate).toHaveBeenCalledWith({ status: 'draft', is_posted: false });
    expect(result.success).toBe(true);
    expect(result.message).toContain('مسودة');
  });
});

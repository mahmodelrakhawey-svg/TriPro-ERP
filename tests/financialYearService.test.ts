import { describe, it, expect, vi } from 'vitest';
import { closeFinancialYearEngine, reopenFinancialYearEngine } from '../services/financialYearService';

describe('📅 Financial Year Service Unit Tests', () => {
  it('should return error if targetOrgId is missing in closeFinancialYearEngine', async () => {
    const mockSupabase: any = {};
    const result = await closeFinancialYearEngine({
      supabase: mockSupabase,
      year: 2025,
      closingDate: '2025-12-31',
      targetOrgId: '',
    });

    expect(result.success).toBe(false);
    expect(result.message).toContain('تعذر تحديد معرف المؤسسة');
  });

  it('should successfully close year when RPC returns success string', async () => {
    const mockSupabase: any = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        or: vi.fn().mockResolvedValue({ data: [] }),
        update: vi.fn().mockReturnThis(),
        insert: vi.fn().mockResolvedValue({ data: null, error: null }),
        maybeSingle: vi.fn().mockResolvedValue({ data: { id: 'parent-3-id' } }),
      }),
      rpc: vi.fn().mockResolvedValue({ data: 'تم إقفال السنة المالية 2025 بنجاح', error: null }),
    };

    const result = await closeFinancialYearEngine({
      supabase: mockSupabase,
      year: 2025,
      closingDate: '2025-12-31',
      targetOrgId: 'org-123',
    });

    expect(result.success).toBe(true);
    expect(result.message).toContain('تم إقفال السنة المالية 2025 بنجاح');
    expect(mockSupabase.rpc).toHaveBeenCalledWith('close_financial_year', {
      p_year: 2025,
      p_closing_date: '2025-12-31',
      p_org_id: 'org-123',
    });
  });

  it('should handle RPC error during year close', async () => {
    const mockSupabase: any = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        or: vi.fn().mockResolvedValue({ data: [] }),
        update: vi.fn().mockReturnThis(),
        insert: vi.fn().mockResolvedValue({ data: null, error: null }),
        maybeSingle: vi.fn().mockResolvedValue({ data: null }),
      }),
      rpc: vi.fn().mockResolvedValue({ data: null, error: { message: 'Year already closed' } }),
    };

    const result = await closeFinancialYearEngine({
      supabase: mockSupabase,
      year: 2025,
      closingDate: '2025-12-31',
      targetOrgId: 'org-123',
    });

    expect(result.success).toBe(false);
    expect(result.message).toContain('Year already closed');
  });

  it('should successfully reopen year', async () => {
    const mockSupabase: any = {
      rpc: vi.fn().mockResolvedValue({ data: 'تم فتح السنة المالية 2025 بنجاح', error: null }),
    };

    const result = await reopenFinancialYearEngine({
      supabase: mockSupabase,
      year: 2025,
      targetOrgId: 'org-123',
    });

    expect(result.success).toBe(true);
    expect(result.message).toContain('تم فتح السنة المالية 2025 بنجاح');
  });
});

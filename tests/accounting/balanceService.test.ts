import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  fetchCompleteDataset,
  fetchAllSupplierBalances,
  fetchAllCustomerBalances
} from '../../services/balanceService';
import { supabase } from '../../supabaseClient';

// Mock Supabase
vi.mock('../../supabaseClient', () => ({
  supabase: {
    rpc: vi.fn(),
    from: vi.fn()
  }
}));

describe('⚖️ BalanceService (محرك الأرصدة المجمعة والتحصيل وتجاوز سقف الاستعلام 1000)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('fetchCompleteDataset (استعلام البيانات الضخمة بنظام الأجزاء Chunks)', () => {
    it('يجب أن يعيد مصفوفة فارغة ويتوقف فوراً إذا لم توجد بيانات (0 سجلات)', async () => {
      let callCount = 0;
      const mockQuery = vi.fn(async (from: number, to: number) => {
        callCount++;
        return { data: [], error: null };
      });

      const result = await fetchCompleteDataset(mockQuery);

      expect(callCount).toBe(1);
      expect(result).toEqual([]);
    });

    it('يجب أن ينتهي بعد استدعاء واحد فقط إذا كان عدد السجلات أقل من سقف 1000', async () => {
      const mockItems = Array.from({ length: 450 }, (_, i) => ({ id: `row-${i}` }));
      let callCount = 0;

      const mockQuery = vi.fn(async (from: number, to: number) => {
        callCount++;
        return { data: mockItems, error: null };
      });

      const result = await fetchCompleteDataset(mockQuery);

      expect(callCount).toBe(1);
      expect(result).toHaveLength(450);
      expect(result[0].id).toBe('row-0');
      expect(result[449].id).toBe('row-449');
    });

    it('يجب أن يستعلم عبر عدة صفحات (Chunks) متتابعة إذا تجاوزت البيانات 1000 سجل', async () => {
      // محاكاة 2500 سجل (3 استدعاءات: 1000 + 1000 + 500)
      const chunk1 = Array.from({ length: 1000 }, (_, i) => ({ id: `id-${i}` }));
      const chunk2 = Array.from({ length: 1000 }, (_, i) => ({ id: `id-${1000 + i}` }));
      const chunk3 = Array.from({ length: 500 }, (_, i) => ({ id: `id-${2000 + i}` }));

      const requestedRanges: Array<{ from: number; to: number }> = [];

      const mockQuery = vi.fn(async (from: number, to: number) => {
        requestedRanges.push({ from, to });
        if (from === 0) return { data: chunk1, error: null };
        if (from === 1000) return { data: chunk2, error: null };
        if (from === 2000) return { data: chunk3, error: null };
        return { data: [], error: null };
      });

      const result = await fetchCompleteDataset(mockQuery);

      expect(result).toHaveLength(2500);
      expect(requestedRanges).toEqual([
        { from: 0, to: 999 },
        { from: 1000, to: 1999 },
        { from: 2000, to: 2999 }
      ]);
      expect(result[0].id).toBe('id-0');
      expect(result[2499].id).toBe('id-2499');
    });

    it('يجب أن يتعامل بمرونة مع حدوث خطأ في استعلام الشبكة ويعيد ما تم جمعه دون انهيار التطبيق', async () => {
      const chunk1 = [{ id: 'item-1' }, { id: 'item-2' }];
      let callCount = 0;

      const mockQuery = vi.fn(async () => {
        callCount++;
        if (callCount === 1) return { data: chunk1, error: null };
        return { data: null, error: { message: 'Network connection lost' } };
      });

      const result = await fetchCompleteDataset(mockQuery);

      expect(result).toEqual(chunk1);
    });
  });

  describe('fetchAllSupplierBalances & fetchAllCustomerBalances', () => {
    it('يجب أن يعيد Map فارغة فوراً إذا كان orgId غير محدد لضمان عزل المستأجرين', async () => {
      const supBalances = await fetchAllSupplierBalances('');
      const custBalances = await fetchAllCustomerBalances('');

      expect(supBalances.size).toBe(0);
      expect(custBalances.size).toBe(0);
    });

    it('يجب أن يعتمد على RPC السريع get_all_supplier_balances_fast عندما ينجح بنجاح', async () => {
      const mockRpcResponse = [
        { supplier_id: 'sup-1', balance: 15400.5 },
        { supplier_id: 'sup-2', balance: -2500 }
      ];

      (supabase.rpc as any).mockResolvedValueOnce({
        data: mockRpcResponse,
        error: null
      });

      const balances = await fetchAllSupplierBalances('org-test-uuid');

      expect(balances.get('sup-1')).toBe(15400.5);
      expect(balances.get('sup-2')).toBe(-2500);
      expect(balances.size).toBe(2);
    });

    it('يجب أن يعتمد على RPC السريع get_all_customer_balances_fast لأرصدة العملاء', async () => {
      const mockRpcResponse = [
        { customer_id: 'cust-101', balance: 3500 },
        { customer_id: 'cust-102', balance: 0 }
      ];

      (supabase.rpc as any).mockResolvedValueOnce({
        data: mockRpcResponse,
        error: null
      });

      const balances = await fetchAllCustomerBalances('org-test-uuid');

      expect(balances.get('cust-101')).toBe(3500);
      expect(balances.get('cust-102')).toBe(0);
      expect(balances.size).toBe(2);
    });
  });
});

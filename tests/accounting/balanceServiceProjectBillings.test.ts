import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fetchAllCustomerBalances, invalidateBalanceCache } from '../../services/balanceService';

const selectCalls: Array<{ table: string; selectStr: string }> = [];

vi.mock('../../supabaseClient', () => ({
  supabase: {
    rpc: vi.fn(async () => ({ data: null, error: { message: 'rpc unavailable' } })),
    from: vi.fn((table: string) => ({
      select: vi.fn((selectStr: string) => {
        selectCalls.push({ table, selectStr });
        const rowsByTable: Record<string, unknown[]> = {
          customers: [{ id: 'cust-1', opening_balance: 100 }],
          invoices: [{ customer_id: 'cust-1', total_amount: 500, paid_amount: 200 }],
          receipt_vouchers: [],
          credit_notes: [],
          cheques: [],
          project_progress_billings: [
            { net_amount: 350, projects: { customer_id: 'cust-1' } },
          ],
        };
        const data = rowsByTable[table] || [];
        const chain: Record<string, any> = {
          match: vi.fn(() => chain),
          is: vi.fn(() => chain),
          neq: vi.fn(() => chain),
          not: vi.fn(() => chain),
          eq: vi.fn(() => chain),
          range: vi.fn(async () => ({ data, error: null })),
        };
        return chain;
      }),
    })),
  },
}));

describe('📊 balanceService — project_progress_billings customer_id relation fix', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    selectCalls.length = 0;
    invalidateBalanceCache('org-test-1');
  });

  it('يجلب customer_id عبر علاقة projects(customer_id) دون إرسال عمود غير موجود ويجمع المستخلص في رصيد العميل', async () => {
    const balances = await fetchAllCustomerBalances('org-test-1');

    const billingSelect = selectCalls.find((c) => c.table === 'project_progress_billings');
    expect(billingSelect?.selectStr).toBe('net_amount, projects(customer_id)');
    // Opening (100) + Invoice Net (300) + Project Billing Net (350) = 750
    expect(balances.get('cust-1')).toBe(750);
  });
});

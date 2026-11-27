import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'fs';
import path from 'path';

const {
  mockUpdate,
  mockFrom,
} = vi.hoisted(() => ({
  mockUpdate: vi.fn(),
  mockFrom: vi.fn(),
}));

vi.mock('../supabaseClient', () => ({
  supabase: {
    from: mockFrom,
    auth: {
      getSession: vi.fn(async () => ({ data: { session: null } })),
    },
  },
}));

import { ensureDocumentJournalOrgSync } from '../services/tenantContext';

describe('Journal Org Sync & Multi-Tenant Document Entry Guard', () => {
  const expectedOrgId = '11111111-1111-1111-1111-111111111111';
  const wrongOrgId = '99999999-9999-9999-9999-999999999999';
  const jeId = '22222222-2222-2222-2222-222222222222';
  const docId = '33333333-3333-3333-3333-333333333333';

  beforeEach(() => {
    vi.clearAllMocks();
    mockUpdate.mockImplementation(() => ({
      eq: vi.fn(async () => ({ error: null })),
    }));
  });

  it('repairs mismatched organization_id on journal_entries and journal_lines', async () => {
    mockFrom.mockImplementation((table: string) => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          maybeSingle: vi.fn(async () => {
            if (table === 'sales_returns') {
              return { data: { related_journal_entry_id: jeId }, error: null };
            }
            if (table === 'journal_entries') {
              return {
                data: {
                  id: jeId,
                  organization_id: wrongOrgId,
                  journal_lines: [{ id: 'line-1' }, { id: 'line-2' }],
                },
                error: null,
              };
            }
            return { data: null, error: null };
          }),
        })),
      })),
      update: mockUpdate,
    }));

    const res = await ensureDocumentJournalOrgSync('sales_returns', docId, expectedOrgId);

    expect(res).toEqual({ entryId: jeId, synced: true, hasLines: true });
    expect(mockUpdate).toHaveBeenCalledTimes(2);
    expect(mockUpdate).toHaveBeenNthCalledWith(1, { organization_id: expectedOrgId });
    expect(mockUpdate).toHaveBeenNthCalledWith(2, { organization_id: expectedOrgId });
  });

  it('reports hasLines: false when journal_entries has zero lines', async () => {
    mockFrom.mockImplementation((table: string) => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          maybeSingle: vi.fn(async () => {
            if (table === 'sales_returns') {
              return { data: { related_journal_entry_id: jeId }, error: null };
            }
            if (table === 'journal_entries') {
              return {
                data: { id: jeId, organization_id: expectedOrgId, journal_lines: [] },
                error: null,
              };
            }
            return { data: null, error: null };
          }),
        })),
      })),
      update: mockUpdate,
    }));

    const res = await ensureDocumentJournalOrgSync('sales_returns', docId, expectedOrgId);

    expect(res).toEqual({ entryId: jeId, synced: true, hasLines: false });
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it('ensures all return, note, voucher, and adjustment forms use getActiveOrgIdSync with currentSelectedOrgId', () => {
    const files = [
      'modules/sales/SalesReturnForm.tsx',
      'modules/purchases/PurchaseReturnForm.tsx',
      'modules/sales/CreditNoteForm.tsx',
      'modules/purchases/DebitNoteForm.tsx',
      'modules/finance/components/PaymentVoucherForm.tsx',
      'modules/finance/components/ReceiptVoucherForm.tsx',
      'modules/finance/components/ExpenseVoucherForm.tsx',
      'modules/finance/components/CustomerDepositForm.tsx',
      'modules/inventory/StockAdjustmentForm.tsx',
    ];

    for (const rel of files) {
      const content = fs.readFileSync(path.resolve(process.cwd(), rel), 'utf8');
      expect(content).toContain('getActiveOrgIdSync');
      expect(content).toContain('currentSelectedOrgId');
    }
  });

  it('ensures daily operations lists, stock transfers, and domain contexts isolate orgs and invalidate general ledger', () => {
    const orgIsolatedComponents = [
      'modules/inventory/StockTransfer.tsx',
      'modules/inventory/StockTransferList.tsx',
      'modules/sales/SalesReturnsList.tsx',
      'modules/finance/reports/PaymentVoucherList.tsx',
      'modules/finance/reports/ReceiptVoucherList.tsx',
    ];

    for (const rel of orgIsolatedComponents) {
      const content = fs.readFileSync(path.resolve(process.cwd(), rel), 'utf8');
      expect(content).toContain('getActiveOrgIdSync');
    }

    for (const rel of [
      'context/domains/SalesContext.tsx',
      'context/domains/SupplierContext.tsx',
      'context/domains/BankingContext.tsx',
    ]) {
      const content = fs.readFileSync(path.resolve(process.cwd(), rel), 'utf8');
      expect(content).toContain('invalidateGeneralLedger');
    }

    const migration = fs.readFileSync(
      path.resolve(process.cwd(), 'services/migrations/2026-11-27_fix_daily_ops_rpcs.sql'),
      'utf8'
    );
    expect(migration).toContain('WHERE purchase_return_id = p_return_id');
    expect(migration).not.toContain('WHERE return_id = p_return_id');
    expect(migration).toContain('CREATE OR REPLACE FUNCTION public.approve_purchase_return');
    expect(migration).toContain('CREATE OR REPLACE FUNCTION public.update_employee_advance');
  });
});

import fs from 'fs';
import path from 'path';
import { describe, it, expect } from 'vitest';

const root = path.resolve(__dirname, '..');
const read = (rel: string) => fs.readFileSync(path.join(root, rel), 'utf8');

describe('🛡️ Security & Performance Regression Guards', () => {
  it('reset-password edge function enforces is_active check and avoids wildcard CORS', () => {
    const src = read('supabase/functions/reset-password/index.ts');
    expect(src).not.toMatch(/'Access-Control-Allow-Origin'\s*:\s*'\*'/);
    expect(src).toContain('is_active');
    expect(src).toContain('callerProfile.is_active === false');
    expect(src).toContain('tri-?pro-erp');
  });

  it('CustomerStatement fetchInChunks uses bounded parallel concurrency', () => {
    const src = read('modules/sales/CustomerStatement.tsx');
    expect(src).toContain('const CONCURRENCY =');
    expect(src).toContain('Promise.all');
  });

  it('FiscalPeriodManager fetches accounting_periods and journal_entries in parallel', () => {
    const src = read('modules/accounting/FiscalPeriodManager.tsx');
    expect(src).toContain('await Promise.all([');
    expect(src).toContain("from('accounting_periods')");
    expect(src).toContain("from('journal_entries')");
  });

  it('TrialBalanceAdvanced deduplicates posted journal_lines pagination into fetchPostedJournalLines', () => {
    const src = read('modules/accounting/TrialBalanceAdvanced.tsx');
    const matches = src.match(/const fetchPostedJournalLines\s*=/g) || [];
    expect(matches.length).toBe(1);
    const usages = src.match(/fetchPostedJournalLines\(userOrgId\)/g) || [];
    expect(usages.length).toBeGreaterThanOrEqual(2);
  });

  it('BatchOrderManager batches invoice/sales_order item lookups and stock checks with Promise.all', () => {
    const src = read('modules/manufacturing/components/BatchOrderManager.tsx');
    expect(src).toContain(".in('invoice_id', selectedIds)");
    expect(src).toContain(".in('sales_order_id', selectedIds)");
    expect(src).toContain('Promise.all(');
  });

  it('voucherAttachmentService uploads attachments in parallel and batch-inserts metadata', () => {
    const svc = read('services/voucherAttachmentService.ts');
    expect(svc).toContain('Promise.all(');
    expect(svc).toContain('.insert(rowsToInsert)');
    expect(read('modules/finance/components/PaymentVoucherForm.tsx')).toContain('uploadVoucherAttachments');
    expect(read('modules/finance/components/ReceiptVoucherForm.tsx')).toContain('uploadVoucherAttachments');
    expect(read('modules/finance/components/ExpenseVoucherForm.tsx')).toContain('uploadVoucherAttachments');
  });
});

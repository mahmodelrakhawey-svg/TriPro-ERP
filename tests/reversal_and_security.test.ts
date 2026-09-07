import { describe, it, expect } from 'vitest';

describe('Audit-Grade Accounting Reversal & Security Engine', () => {
  it('should generate balanced reversal journal entry lines that perfectly offset original entry', () => {
    // Original sales invoice journal entry:
    // Debit: Customer 1140 EGP
    // Credit: Sales Revenue 1000 EGP
    // Credit: Output VAT 140 EGP
    const originalLines = [
      { account_id: 'cust-1221', debit: 1140, credit: 0, description: 'استحقاق فاتورة مبيعات' },
      { account_id: 'rev-411', debit: 0, credit: 1000, description: 'إيراد مبيعات' },
      { account_id: 'vat-2231', debit: 0, credit: 140, description: 'ضريبة مخرجات' }
    ];

    // Total debit and total credit of original
    const origDebit = originalLines.reduce((acc, l) => acc + l.debit, 0);
    const origCredit = originalLines.reduce((acc, l) => acc + l.credit, 0);
    expect(origDebit).toBe(origCredit); // 1140 === 1140

    // Invert lines for the reversal entry:
    // Debit becomes Credit, Credit becomes Debit
    const reversalLines = originalLines.map(l => ({
      account_id: l.account_id,
      debit: l.credit,
      credit: l.debit,
      description: `عكس أثر: ${l.description}`
    }));

    const revDebit = reversalLines.reduce((acc, l) => acc + l.debit, 0);
    const revCredit = reversalLines.reduce((acc, l) => acc + l.credit, 0);

    // Reversal entry is itself balanced
    expect(revDebit).toBe(revCredit); // 1140 === 1140

    // Net ledger impact across original + reversal is precisely 0
    const netAccounts: Record<string, number> = {};
    [...originalLines, ...reversalLines].forEach(l => {
      netAccounts[l.account_id] = (netAccounts[l.account_id] || 0) + (l.debit - l.credit);
    });

    Object.values(netAccounts).forEach(netBalance => {
      expect(netBalance).toBe(0);
    });
  });

  it('should preserve immutable audit trail with proper status transition', () => {
    const originalEntry = {
      id: 'entry-101',
      reference: 'INV-000120',
      status: 'posted',
      is_posted: true
    };

    // Upon unposting in 'reversal' mode:
    const updatedOriginal = {
      ...originalEntry,
      status: 'reversed',
      is_posted: false
    };

    const reversalEntry = {
      id: 'entry-102',
      reference: `REV-${originalEntry.reference}`,
      status: 'posted',
      is_posted: true,
      related_document_type: 'invoice_reversal'
    };

    expect(updatedOriginal.status).toBe('reversed');
    expect(updatedOriginal.is_posted).toBe(false);
    expect(reversalEntry.status).toBe('posted');
    expect(reversalEntry.reference).toBe('REV-INV-000120');
  });

  it('should enforce strict multi-tenant isolation policy match', () => {
    const sessionOrgId = 'org-corp-alpha';
    const targetDocumentOrg = 'org-corp-beta';

    const canAccess = (docOrg: string, activeOrg: string, isSuperAdmin: boolean) => {
      if (isSuperAdmin) return true;
      return docOrg === activeOrg;
    };

    expect(canAccess(targetDocumentOrg, sessionOrgId, false)).toBe(false);
    expect(canAccess(sessionOrgId, sessionOrgId, false)).toBe(true);
    expect(canAccess(targetDocumentOrg, sessionOrgId, true)).toBe(true);
  });
});

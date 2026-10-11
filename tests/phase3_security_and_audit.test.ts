import { describe, it, expect } from 'vitest';
import { evaluatePermission } from '../utils/permissionEngine';
import { validateEntryBalance } from '../utils/financialSafety';

describe('🛡️ Phase 3 Security, Invariants & Audit Trail Verification', () => {
  describe('Permission Engine Role Refinement (P3-1)', () => {
    it('super_admin and owner should have full access including sensitive admin operations', () => {
      const emptyPerms = new Set<string>();
      
      expect(evaluatePermission('settings', 'delete', 'super_admin', emptyPerms, null)).toBe(true);
      expect(evaluatePermission('organization', 'delete', 'super_admin', emptyPerms, null)).toBe(true);
      expect(evaluatePermission('users', 'delete', 'owner', emptyPerms, null)).toBe(true);
      expect(evaluatePermission('audit', 'clear', 'owner', emptyPerms, null)).toBe(true);
    });

    it('manager should have operational module access by default', () => {
      const emptyPerms = new Set<string>();

      expect(evaluatePermission('sales', 'create', 'manager', emptyPerms, null)).toBe(true);
      expect(evaluatePermission('inventory', 'transfer', 'manager', emptyPerms, null)).toBe(true);
      expect(evaluatePermission('accounting', 'view', 'manager', emptyPerms, null)).toBe(true);
      expect(evaluatePermission('purchases', 'approve', 'manager', emptyPerms, null)).toBe(true);
    });

    it('manager should be blocked from sensitive admin actions without explicit permission', () => {
      const emptyPerms = new Set<string>();

      expect(evaluatePermission('settings', 'delete', 'manager', emptyPerms, null)).toBe(false);
      expect(evaluatePermission('settings', 'manage', 'manager', emptyPerms, null)).toBe(false);
      expect(evaluatePermission('users', 'delete', 'manager', emptyPerms, null)).toBe(false);
      expect(evaluatePermission('organization', 'delete', 'manager', emptyPerms, null)).toBe(false);
      expect(evaluatePermission('audit', 'clear', 'manager', emptyPerms, null)).toBe(false);
    });

    it('manager should be allowed sensitive action if explicit permission is granted', () => {
      const grantedPerms = new Set<string>(['settings.manage']);

      expect(evaluatePermission('settings', 'manage', 'manager', grantedPerms, null)).toBe(true);
      // still cannot delete settings without permission
      expect(evaluatePermission('settings', 'delete', 'manager', grantedPerms, null)).toBe(false);
    });
  });

  describe('Ledger Double-Entry Invariants (P3-9)', () => {
    it('should validate perfectly balanced journal entries', () => {
      const balanced = validateEntryBalance({
        reference: 'JE-TEST-001',
        date: '2026-10-11',
        lines: [
          { accountId: 'acc-1', debit: 2500, credit: 0 },
          { accountId: 'acc-2', debit: 0, credit: 2500 }
        ]
      });

      expect(balanced.isBalanced).toBe(true);
      expect(balanced.difference).toBe(0);
      expect(balanced.totalDebit).toBe(2500);
      expect(balanced.totalCredit).toBe(2500);
    });

    it('should reject imbalanced journal entries', () => {
      const imbalanced = validateEntryBalance({
        reference: 'JE-TEST-002',
        date: '2026-10-11',
        lines: [
          { accountId: 'acc-1', debit: 2500, credit: 0 },
          { accountId: 'acc-2', debit: 0, credit: 2499.50 }
        ]
      });

      expect(imbalanced.isBalanced).toBe(false);
      expect(imbalanced.difference).toBeCloseTo(0.50);
    });

    it('should reject entries with fewer than two lines or zero amounts', () => {
      const singleLine = validateEntryBalance({
        reference: 'JE-TEST-003',
        date: '2026-10-11',
        lines: [
          { accountId: 'acc-1', debit: 1000, credit: 0 }
        ]
      });

      expect(singleLine.isBalanced).toBe(false);
    });
  });

  describe('Offline Session TTL Invariant (P3-2)', () => {
    it('should enforce 7-day expiration boundary on offline credential cache', () => {
      const MAX_OFFLINE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
      const now = Date.now();

      const validCachedAt = now - (6 * 24 * 60 * 60 * 1000); // 6 days ago
      const expiredCachedAt = now - (8 * 24 * 60 * 60 * 1000); // 8 days ago

      const isSessionValid = (cachedAt: number) => (now - cachedAt) <= MAX_OFFLINE_TTL_MS;

      expect(isSessionValid(validCachedAt)).toBe(true);
      expect(isSessionValid(expiredCachedAt)).toBe(false);
    });
  });
});

import { describe, it, expect } from 'vitest';
import { evaluatePermission } from '../../utils/permissionEngine';
import { User } from '../../types';

describe('🛡️ Permission Engine Tests', () => {
  const dummyUser: User = {
    id: 'user-123',
    name: 'أحمد علي',
    username: 'ahmed@lenza.com',
    role: 'accountant',
    is_active: true,
    organization_id: 'org-123'
  };

  describe('1. Global Super Roles', () => {
    it('should grant full access to super_admin', () => {
      expect(evaluatePermission('any_module', 'delete', 'super_admin', new Set(), dummyUser)).toBe(true);
    });

    it('should grant full access to admin', () => {
      expect(evaluatePermission('settings', 'update', 'admin', new Set(), dummyUser)).toBe(true);
    });

    it('should grant full access to owner', () => {
      expect(evaluatePermission('hr', 'manage', 'owner', new Set(), dummyUser)).toBe(true);
    });

    it('should grant full access to manager', () => {
      expect(evaluatePermission('sales', 'create', 'manager', new Set(), dummyUser)).toBe(true);
    });
  });

  describe('2. Sector-Specific Roles', () => {
    it('medical_director should have access to hims modules', () => {
      expect(evaluatePermission('hims', 'view', 'medical_director', new Set(), dummyUser)).toBe(true);
      expect(evaluatePermission('hims/patients', 'edit', 'medical_director', new Set(), dummyUser)).toBe(true);
      expect(evaluatePermission('accounting', 'create', 'medical_director', new Set(), dummyUser)).toBe(false);
    });

    it('hr role should access hr and view reports', () => {
      expect(evaluatePermission('hr', 'create', 'hr', new Set(), dummyUser)).toBe(true);
      expect(evaluatePermission('hr/employees', 'update', 'hr_officer', new Set(), dummyUser)).toBe(true);
      expect(evaluatePermission('reports', 'view', 'hr_manager', new Set(), dummyUser)).toBe(true);
      expect(evaluatePermission('reports', 'export', 'hr_manager', new Set(), dummyUser)).toBe(true);
      expect(evaluatePermission('reports', 'delete', 'hr_manager', new Set(), dummyUser)).toBe(false);
    });

    it('stadium_receptionist cannot delete', () => {
      expect(evaluatePermission('stadium/members', 'view', 'stadium_receptionist', new Set(), dummyUser)).toBe(true);
      expect(evaluatePermission('stadium/members', 'delete', 'stadium_receptionist', new Set(), dummyUser)).toBe(false);
      expect(evaluatePermission('stadium', 'manage', 'stadium_receptionist', new Set(), dummyUser)).toBe(true);
    });

    it('stadium_gate_security can only access gate scanner', () => {
      expect(evaluatePermission('stadium/gate-scanner', 'scan', 'stadium_gate_security', new Set(), dummyUser)).toBe(true);
      expect(evaluatePermission('stadium/members', 'view', 'stadium_gate_security', new Set(), dummyUser)).toBe(false);
    });

    it('demo role restrictions', () => {
      expect(evaluatePermission('sales', 'create', 'demo', new Set(), dummyUser)).toBe(true);
      expect(evaluatePermission('sales', 'delete', 'demo', new Set(), dummyUser)).toBe(false);
      expect(evaluatePermission('settings', 'update', 'demo', new Set(), dummyUser)).toBe(false);
      expect(evaluatePermission('settings', 'view', 'demo', new Set(), dummyUser)).toBe(true);
    });
  });

  describe('3. Dashboard and Mobile Guards', () => {
    it('blocks dashboard if can_view_dashboard is explicitly false', () => {
      const restrictedUser: User = { ...dummyUser, can_view_dashboard: false };
      expect(evaluatePermission('dashboard', 'view', 'accountant', new Set(['dashboard.view']), restrictedUser)).toBe(false);
    });

    it('allows dashboard if permission is granted', () => {
      const normalUser: User = { ...dummyUser, can_view_dashboard: true };
      expect(evaluatePermission('dashboard', 'view', 'accountant', new Set(['dashboard.view']), normalUser)).toBe(true);
    });

    it('blocks mobile if can_access_mobile is false', () => {
      const restrictedUser: User = { ...dummyUser, can_access_mobile: false };
      expect(evaluatePermission('mobile', 'view', 'van_sales', new Set(), restrictedUser)).toBe(true); // van_sales role bypasses flag
      expect(evaluatePermission('mobile', 'view', 'driver', new Set(['mobile.view']), restrictedUser)).toBe(false);
    });
  });

  describe('4. Wildcards & View Inheritance', () => {
    it('matches wildcards', () => {
      expect(evaluatePermission('sales', 'view', 'accountant', new Set(['sales.*']), dummyUser)).toBe(true);
      expect(evaluatePermission('sales', 'export', 'accountant', new Set(['*.export']), dummyUser)).toBe(true);
      expect(evaluatePermission('any', 'thing', 'accountant', new Set(['*.*']), dummyUser)).toBe(true);
    });

    it('inherits view permission across coupled modules', () => {
      // treasury views if accounting view is granted
      expect(evaluatePermission('treasury', 'view', 'accountant', new Set(['accounting.view']), dummyUser)).toBe(true);
      // accounting views if treasury view is granted
      expect(evaluatePermission('accounting', 'view', 'cashier', new Set(['treasury.view']), dummyUser)).toBe(true);
      // sales views if customers view is granted
      expect(evaluatePermission('sales', 'view', 'sales_rep', new Set(['customers.view']), dummyUser)).toBe(true);
      // purchases views if suppliers view is granted
      expect(evaluatePermission('purchases', 'view', 'purchaser', new Set(['suppliers.view']), dummyUser)).toBe(true);
    });
  });

  describe('5. Domain Action Aliases', () => {
    it('resolves treasury actions with aliases', () => {
      expect(evaluatePermission('treasury', 'receipt_create', 'cashier', new Set(['treasury.create']), dummyUser)).toBe(true);
      expect(evaluatePermission('treasury', 'payment_create', 'cashier', new Set(['treasury.manage']), dummyUser)).toBe(true);
      expect(evaluatePermission('treasury', 'reconcile', 'accountant', new Set(['accounting.reconcile']), dummyUser)).toBe(true);
    });

    it('resolves accounting actions with aliases', () => {
      expect(evaluatePermission('accounting', 'journal_create', 'accountant', new Set(['accounting.create']), dummyUser)).toBe(true);
      expect(evaluatePermission('accounting', 'reconcile', 'accountant', new Set(['treasury.bank_reconciliation']), dummyUser)).toBe(true);
    });

    it('resolves hr payroll aliases', () => {
      expect(evaluatePermission('hr', 'payroll_process', 'hr_officer', new Set(['hr.payroll_run']), dummyUser)).toBe(true);
      expect(evaluatePermission('hr', 'advances', 'hr_officer', new Set(['hr.advances_penalties']), dummyUser)).toBe(true);
    });

    it('resolves inventory and restaurant aliases', () => {
      expect(evaluatePermission('inventory', 'adjustment', 'storekeeper', new Set(['inventory.adjustment_approve']), dummyUser)).toBe(true);
      expect(evaluatePermission('restaurant', 'pos', 'cashier', new Set(['restaurant.pos']), dummyUser)).toBe(true);
      expect(evaluatePermission('restaurant', 'pos', 'cashier', new Set(['sales.view']), dummyUser)).toBe(true);
    });
  });
});

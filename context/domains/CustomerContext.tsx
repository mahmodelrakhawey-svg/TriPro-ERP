/**
 * ==============================================================================
 * TriPro ERP — Customer Domain Context & Hook
 * context/domains/CustomerContext.tsx
 * ==============================================================================
 * مخصص لإدارة العملاء والمديونيات وحسابات الذمم المدينة.
 * يدعم الاستخدام المباشر أو عبر واجهة AccountingContext الموحدة.
 * ==============================================================================
 */

import { useAccounting } from '../AccountingContext';

type DynamicParam = any;

export interface CustomerDomainState {
  customers: any[];
  addCustomer: (customer: DynamicParam) => Promise<any>;
  updateCustomer: (id: string, updates: DynamicParam) => Promise<void>;
  deleteCustomer: (id: string, reason?: string) => Promise<void>;
}

export const useCustomerDomain = (): CustomerDomainState => {
  const acc = useAccounting() as any;
  return {
    customers: acc.customers || [],
    addCustomer: acc.addCustomer,
    updateCustomer: acc.updateCustomer,
    deleteCustomer: acc.deleteCustomer,
  };
};

export default useCustomerDomain;
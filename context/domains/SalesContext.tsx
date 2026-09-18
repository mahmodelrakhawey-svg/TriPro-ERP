/**
 * ==============================================================================
 * TriPro ERP — Sales Domain Context & Hook
 * context/domains/SalesContext.tsx
 * ==============================================================================
 * مخصص لإدارة المبيعات، فواتير العملاء، المرتجعات، ومناديب المبيعات.
 * يدعم الاستخدام المباشر أو عبر واجهة AccountingContext الموحدة بنمط Facade.
 * ==============================================================================
 */

import { useAccounting } from '../AccountingContext';

export interface SalesDomainState {
  invoices: any[];
  customers: any[];
  salespeople: any[];
  approveInvoice: (id: string, orgId?: string, warehouseId?: string) => Promise<boolean>;
  unpostSalesInvoice: (id: string, orgId?: string) => Promise<boolean>;
  deleteSalesInvoice: (id: string, orgId?: string) => Promise<boolean>;
  addCustomer: (customer: any) => Promise<any>;
}

export const useSalesDomain = (): SalesDomainState => {
  const acc = useAccounting() as any;
  return {
    invoices: acc.invoices || [],
    customers: acc.customers || [],
    salespeople: acc.salespeople || [],
    approveInvoice: acc.approveInvoice,
    unpostSalesInvoice: acc.unpostSalesInvoice,
    deleteSalesInvoice: acc.deleteSalesInvoice,
    addCustomer: acc.addCustomer,
  };
};

export default useSalesDomain;

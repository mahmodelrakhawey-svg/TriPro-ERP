/**
 * ==============================================================================
 * TriPro ERP — Supplier Domain Context & Hook
 * context/domains/SupplierContext.tsx
 * ==============================================================================
 * مخصص لإدارة الموردين، فواتير المشتريات، وحسابات الذمم الدائنة.
 * يدعم الاستخدام المباشر أو عبر واجهة AccountingContext الموحدة.
 * ==============================================================================
 */

import { useAccounting } from '../AccountingContext';

export interface SupplierDomainState {
  suppliers: any[];
  purchaseInvoices: any[];
  addSupplier: (supplier: any) => Promise<any>;
  updateSupplier: (id: string, updates: any) => Promise<void>;
  deleteSupplier: (id: string, reason?: string) => Promise<void>;
  approvePurchaseInvoice: (id: string, orgId?: string, warehouseId?: string) => Promise<void>;
  unpostPurchaseInvoice: (id: string, orgId?: string) => Promise<boolean>;
  deletePurchaseInvoice: (id: string, orgId?: string) => Promise<boolean>;
  convertPoToInvoice: (poId: string, warehouseId?: string, orgId?: string) => Promise<void>;
}

export const useSupplierDomain = (): SupplierDomainState => {
  const acc = useAccounting() as any;
  return {
    suppliers: acc.suppliers || [],
    purchaseInvoices: acc.purchaseInvoices || [],
    addSupplier: acc.addSupplier,
    updateSupplier: acc.updateSupplier,
    deleteSupplier: acc.deleteSupplier,
    approvePurchaseInvoice: acc.approvePurchaseInvoice,
    unpostPurchaseInvoice: acc.unpostPurchaseInvoice,
    deletePurchaseInvoice: acc.deletePurchaseInvoice,
    convertPoToInvoice: acc.convertPoToInvoice,
  };
};

export default useSupplierDomain;
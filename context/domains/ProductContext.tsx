/**
 * ==============================================================================
 * TriPro ERP — Product Domain Context & Hook
 * context/domains/ProductContext.tsx
 * ==============================================================================
 * مخصص لإدارة المنتجات، المستودعات، التصنيفات، وحركات التحويل المخزني.
 * يدعم الاستخدام المباشر أو عبر واجهة AccountingContext الموحدة.
 * ==============================================================================
 */

import { useAccounting } from '../AccountingContext';

export interface ProductDomainState {
  products: any[];
  warehouses: any[];
  categories: any[];
  transfers: any[];
  recalculateStock: (productId?: string) => Promise<void>;
  addProduct: (product: any) => Promise<any>;
  updateProduct: (id: string, updates: any) => Promise<void>;
  deleteProduct: (id: string, reason?: string) => Promise<void>;
  addStockTransfer: (transfer: any) => Promise<void>;
  approveStockTransfer: (id: string) => Promise<void>;
  cancelStockTransfer: (id: string) => Promise<void>;
  addWarehouse: (warehouse: any) => Promise<void>;
  updateWarehouse: (id: string, updates: any) => Promise<void>;
  deleteWarehouse: (id: string) => Promise<void>;
  addWastage: (wastage: any) => Promise<boolean>;
  produceItem: (id: string, qty: number, whId: string, date: string, cost: number, ref: string) => Promise<any>;
}

export const useProductDomain = (): ProductDomainState => {
  const acc = useAccounting() as any;
  return {
    products: acc.products || [],
    warehouses: acc.warehouses || [],
    categories: acc.categories || [],
    transfers: acc.transfers || [],
    recalculateStock: acc.recalculateStock,
    addProduct: acc.addProduct,
    updateProduct: acc.updateProduct,
    deleteProduct: acc.deleteProduct,
    addStockTransfer: acc.addStockTransfer,
    approveStockTransfer: acc.approveStockTransfer,
    cancelStockTransfer: acc.cancelStockTransfer,
    addWarehouse: acc.addWarehouse,
    updateWarehouse: acc.updateWarehouse,
    deleteWarehouse: acc.deleteWarehouse,
    addWastage: acc.addWastage,
    produceItem: acc.produceItem,
  };
};

export default useProductDomain;
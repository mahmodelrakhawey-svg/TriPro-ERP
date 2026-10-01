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
import { Product, Warehouse, StockTransfer } from '../../types';

export interface ProductDomainState {
  products: Product[];
  warehouses: Warehouse[];
  categories: any[];
  transfers: StockTransfer[];
  recalculateStock: (productId?: string) => Promise<void>;
  addProduct: (product: Partial<Product>) => Promise<any>;
  updateProduct: (id: string, updates: Partial<Product>) => Promise<void>;
  deleteProduct: (id: string, reason?: string) => Promise<void>;
  addStockTransfer: (transfer: Partial<StockTransfer>) => Promise<void>;
  approveStockTransfer: (id: string) => Promise<void>;
  cancelStockTransfer: (id: string) => Promise<void>;
  addWarehouse: (warehouse: Partial<Warehouse>) => Promise<void>;
  updateWarehouse: (id: string, updates: Partial<Warehouse>) => Promise<void>;
  deleteWarehouse: (id: string) => Promise<void>;
  addWastage: (wastage: Record<string, any>) => Promise<boolean>;
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
/**
 * ==============================================================================
 * TriPro ERP — Product & Inventory Domain Context & Hook
 * context/domains/ProductContext.tsx
 * ==============================================================================
 * مخصص لإدارة المنتجات، المستودعات، التصنيفات، وحركات التحويل المخزني.
 * يدعم الاستخدام المباشر أو عبر واجهة AccountingContext الموحدة.
 * ==============================================================================
 */

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useAccounting } from '../AccountingContext';
import { Product, Warehouse, StockTransfer, Category } from '../../types';
import { supabase } from '../../supabaseClient';
import { logger } from '../../utils/logger';

export interface ProductDomainState {
  products: Product[];
  warehouses: Warehouse[];
  categories: Category[];
  transfers: StockTransfer[];
  recalculateStock: (productId?: string) => Promise<void>;
  addProduct: (product: Partial<Product>) => Promise<Product | null | Record<string, unknown>>;
  updateProduct: (id: string, updates: Partial<Product>) => Promise<void>;
  deleteProduct: (id: string, reason?: string) => Promise<void>;
  addStockTransfer: (transfer: Partial<StockTransfer>) => Promise<void>;
  approveStockTransfer: (id: string) => Promise<void>;
  cancelStockTransfer: (id: string) => Promise<void>;
  addWarehouse: (warehouse: Partial<Warehouse>) => Promise<void>;
  updateWarehouse: (id: string, updates: Partial<Warehouse>) => Promise<void>;
  deleteWarehouse: (id: string) => Promise<void>;
  addWastage: (wastage: Record<string, unknown>) => Promise<boolean>;
  produceItem: (id: string, qty: number, whId: string, date: string, cost: number, ref: string) => Promise<unknown>;
  refreshProducts?: () => Promise<void>;
}

export const ProductContext = createContext<ProductDomainState | null>(null);

export interface ProductProviderProps {
  children: React.ReactNode;
  orgId?: string;
  initialProducts?: Product[];
  initialWarehouses?: Warehouse[];
  initialCategories?: Category[];
  initialTransfers?: StockTransfer[];
}

export const ProductProvider: React.FC<ProductProviderProps> = ({
  children,
  orgId,
  initialProducts = [],
  initialWarehouses = [],
  initialCategories = [],
  initialTransfers = []
}) => {
  const [products, setProducts] = useState<Product[]>(initialProducts);
  const [warehouses, setWarehouses] = useState<Warehouse[]>(initialWarehouses);
  const [categories, setCategories] = useState<Category[]>(initialCategories);
  const [transfers, setTransfers] = useState<StockTransfer[]>(initialTransfers);

  const fetchProducts = useCallback(async () => {
    if (!orgId) return;
    try {
      const { data, error } = await supabase
        .from('products')
        .select('*')
        .eq('organization_id', orgId)
        .is('deleted_at', null)
        .order('name');
      if (error) {
        logger.error('Error fetching products:', error);
      } else {
        setProducts((data as Product[]) || []);
      }
    } catch (err) {
      logger.error('Unexpected error fetching products:', err);
    }
  }, [orgId]);

  const fetchWarehouses = useCallback(async () => {
    if (!orgId) return;
    try {
      const { data, error } = await supabase
        .from('warehouses')
        .select('*')
        .eq('organization_id', orgId)
        .eq('is_active', true);
      if (error) {
        logger.error('Error fetching warehouses:', error);
      } else {
        setWarehouses((data as Warehouse[]) || []);
      }
    } catch (err) {
      logger.error('Unexpected error fetching warehouses:', err);
    }
  }, [orgId]);

  const fetchCategories = useCallback(async () => {
    if (!orgId) return;
    try {
      const { data, error } = await supabase
        .from('item_categories')
        .select('*')
        .eq('organization_id', orgId)
        .order('name');
      if (error) {
        logger.error('Error fetching categories:', error);
      } else {
        setCategories((data as Category[]) || []);
      }
    } catch (err) {
      logger.error('Unexpected error fetching categories:', err);
    }
  }, [orgId]);

  const fetchTransfers = useCallback(async () => {
    if (!orgId) return;
    try {
      const { data, error } = await supabase
        .from('stock_transfers')
        .select('*')
        .eq('organization_id', orgId)
        .order('transfer_date', { ascending: false })
        .limit(500);
      if (error) {
        logger.error('Error fetching transfers:', error);
      } else {
        setTransfers((data as StockTransfer[]) || []);
      }
    } catch (err) {
      logger.error('Unexpected error fetching transfers:', err);
    }
  }, [orgId]);

  useEffect(() => {
    if (orgId) {
      fetchProducts();
      fetchWarehouses();
      fetchCategories();
      fetchTransfers();
    }
  }, [orgId, fetchProducts, fetchWarehouses, fetchCategories, fetchTransfers]);

  const recalculateStock = useCallback(async (productId?: string): Promise<void> => {
    if (productId) {
      await supabase.rpc('recalculate_product_stock', { p_product_id: productId });
    }
    await fetchProducts();
  }, [fetchProducts]);

  const addProduct = useCallback(async (product: Partial<Product>): Promise<Product | null> => {
    if (!orgId) return null;
    const { data, error } = await supabase
      .from('products')
      .insert({ ...product, organization_id: orgId })
      .select()
      .single();
    if (error) throw error;
    await fetchProducts();
    return data as Product;
  }, [orgId, fetchProducts]);

  const updateProduct = useCallback(async (id: string, updates: Partial<Product>): Promise<void> => {
    const { error } = await supabase.from('products').update(updates).eq('id', id);
    if (error) throw error;
    await fetchProducts();
  }, [fetchProducts]);

  const deleteProduct = useCallback(async (id: string, reason?: string): Promise<void> => {
    const { error } = await supabase
      .from('products')
      .update({ deleted_at: new Date().toISOString(), deletion_reason: reason })
      .eq('id', id);
    if (error) throw error;
    await fetchProducts();
  }, [fetchProducts]);

  const addStockTransfer = useCallback(async (transfer: Partial<StockTransfer>): Promise<void> => {
    if (!orgId) return;
    const { error } = await supabase.from('stock_transfers').insert({ ...transfer, organization_id: orgId });
    if (error) throw error;
    await fetchTransfers();
  }, [orgId, fetchTransfers]);

  const approveStockTransfer = useCallback(async (id: string): Promise<void> => {
    const { error } = await supabase.rpc('post_stock_transfer', { p_transfer_id: id });
    if (error) throw error;
    await fetchTransfers();
  }, [fetchTransfers]);

  const cancelStockTransfer = useCallback(async (id: string): Promise<void> => {
    const { error } = await supabase.from('stock_transfers').update({ status: 'cancelled' }).eq('id', id);
    if (error) throw error;
    await fetchTransfers();
  }, [fetchTransfers]);

  const addWarehouse = useCallback(async (warehouse: Partial<Warehouse>): Promise<void> => {
    if (!orgId) return;
    const { error } = await supabase.from('warehouses').insert({ ...warehouse, organization_id: orgId });
    if (error) throw error;
    await fetchWarehouses();
  }, [orgId, fetchWarehouses]);

  const updateWarehouse = useCallback(async (id: string, updates: Partial<Warehouse>): Promise<void> => {
    const { error } = await supabase.from('warehouses').update(updates).eq('id', id);
    if (error) throw error;
    await fetchWarehouses();
  }, [fetchWarehouses]);

  const deleteWarehouse = useCallback(async (id: string): Promise<void> => {
    const { error } = await supabase.from('warehouses').update({ is_active: false }).eq('id', id);
    if (error) throw error;
    await fetchWarehouses();
  }, [fetchWarehouses]);

  const addWastage = useCallback(async (wastage: Record<string, unknown>): Promise<boolean> => {
    const { error } = await supabase.from('inventory_wastage').insert(wastage);
    if (error) throw error;
    return true;
  }, []);

  const produceItem = useCallback(async (id: string, qty: number, whId: string, date: string, cost: number, ref: string): Promise<unknown> => {
    return await supabase.rpc('mfg_create_order_direct', {
      p_product_id: id,
      p_qty: qty,
      p_warehouse_id: whId,
      p_date: date,
      p_additional_cost: cost,
      p_reference: ref
    });
  }, []);

  return (
    <ProductContext.Provider
      value={{
        products,
        warehouses,
        categories,
        transfers,
        recalculateStock,
        addProduct,
        updateProduct,
        deleteProduct,
        addStockTransfer,
        approveStockTransfer,
        cancelStockTransfer,
        addWarehouse,
        updateWarehouse,
        deleteWarehouse,
        addWastage,
        produceItem,
        refreshProducts: fetchProducts,
      }}
    >
      {children}
    </ProductContext.Provider>
  );
};

export const useProductDomain = (): ProductDomainState => {
  let context: ProductDomainState | null = null;
  try {
    context = useContext(ProductContext);
  } catch {
    // If called outside React component tree (e.g. unit tests), fallback to useAccounting
  }
  if (context) return context;

  // Fallback to unified AccountingContext
  const acc = useAccounting() as unknown as Record<string, unknown>;
  return {
    products: (acc.products as Product[]) || [],
    warehouses: (acc.warehouses as Warehouse[]) || [],
    categories: (acc.categories as Category[]) || [],
    transfers: (acc.transfers as StockTransfer[]) || [],
    recalculateStock: acc.recalculateStock as (productId?: string) => Promise<void>,
    addProduct: acc.addProduct as (product: Partial<Product>) => Promise<Product | null | Record<string, unknown>>,
    updateProduct: acc.updateProduct as (id: string, updates: Partial<Product>) => Promise<void>,
    deleteProduct: acc.deleteProduct as (id: string, reason?: string) => Promise<void>,
    addStockTransfer: acc.addStockTransfer as (transfer: Partial<StockTransfer>) => Promise<void>,
    approveStockTransfer: acc.approveStockTransfer as (id: string) => Promise<void>,
    cancelStockTransfer: acc.cancelStockTransfer as (id: string) => Promise<void>,
    addWarehouse: acc.addWarehouse as (warehouse: Partial<Warehouse>) => Promise<void>,
    updateWarehouse: acc.updateWarehouse as (id: string, updates: Partial<Warehouse>) => Promise<void>,
    deleteWarehouse: acc.deleteWarehouse as (id: string) => Promise<void>,
    addWastage: acc.addWastage as (wastage: Record<string, unknown>) => Promise<boolean>,
    produceItem: acc.produceItem as (id: string, qty: number, whId: string, date: string, cost: number, ref: string) => Promise<unknown>,
    refreshProducts: acc.refreshData as () => Promise<void>,
  };
};

export default useProductDomain;
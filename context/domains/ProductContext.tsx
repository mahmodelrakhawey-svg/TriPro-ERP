/**
 * ==============================================================================
 * TriPro ERP — Product & Inventory Domain Context & Hook
 * context/domains/ProductContext.tsx
 * ==============================================================================
 * مخصص لإدارة المنتجات، المستودعات، التصنيفات، وحركات التحويل المخزني.
 * يدعم الاستخدام المباشر أو عبر واجهة AccountingContext الموحدة.
 * مزود بالحماية الكاملة لعزل بيانات المنظمات (Multi-Tenancy) وسجل التدقيق (Audit Log)
 * وجلب البيانات بالصفحات لدعم قواعد البيانات الضخمة التي تتجاوز 1000 صنف.
 * ==============================================================================
 */

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useAccounting } from '../AccountingContext';
import { Product, Warehouse, StockTransfer, Category } from '../../types';
import type { UserProfile } from '../AccountingContext';
import { supabase } from '../../supabaseClient';
import { logger } from '../../utils/logger';
import { fetchAllTableRecords } from './domainUtils';
import { offlineService } from '../../services/offlineService';

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
  refreshProducts: () => Promise<void>;
  refreshWarehouses?: () => Promise<void>;
  refreshCategories?: () => Promise<void>;
  refreshTransfers?: () => Promise<void>;
}

export const ProductContext = createContext<ProductDomainState | null>(null);

export interface ProductProviderProps {
  children: React.ReactNode;
  orgId?: string | null;
  currentUser?: UserProfile | null;
  initialProducts?: Product[];
  initialWarehouses?: Warehouse[];
  initialCategories?: Category[];
  initialTransfers?: StockTransfer[];
  logActivity?: (action: string, details: string) => void;
  showToast?: (message: string, type?: 'success' | 'error' | 'info' | 'warning') => void;
  isDemo?: boolean;
}

const DEFAULT_OFFLINE_PRODUCTS: Product[] = [
  { id: 'prod-demo-1', name: 'صنف تجريبي عام', price: 100, cost: 60, stock: 50, barcode: '123456789' } as Product
];

const DEFAULT_OFFLINE_WAREHOUSES: Warehouse[] = [
  { id: 'wh-main', name: 'المستودع الرئيسي', is_active: true } as Warehouse
];

const DEFAULT_OFFLINE_CATEGORIES: Category[] = [
  { id: 'cat-general', name: 'عام' } as Category
];

const EMPTY_PRODUCTS: Product[] = [];
const EMPTY_WAREHOUSES: Warehouse[] = [];
const EMPTY_CATEGORIES: Category[] = [];
const EMPTY_TRANSFERS: StockTransfer[] = [];

export const ProductProvider: React.FC<ProductProviderProps> = ({
  children,
  orgId,
  currentUser,
  initialProducts = EMPTY_PRODUCTS,
  initialWarehouses = EMPTY_WAREHOUSES,
  initialCategories = EMPTY_CATEGORIES,
  initialTransfers = EMPTY_TRANSFERS,
  logActivity,
  showToast,
  isDemo = false
}) => {
  const [products, setProducts] = useState<Product[]>(() => {
    if (initialProducts && initialProducts.length > 0) return initialProducts;
    if (isDemo || currentUser?.role === 'demo') return DEFAULT_OFFLINE_PRODUCTS;
    return [];
  });
  const [warehouses, setWarehouses] = useState<Warehouse[]>(() => {
    if (initialWarehouses && initialWarehouses.length > 0) return initialWarehouses;
    if (isDemo || currentUser?.role === 'demo') return DEFAULT_OFFLINE_WAREHOUSES;
    return [];
  });
  const [categories, setCategories] = useState<Category[]>(() => {
    if (initialCategories && initialCategories.length > 0) return initialCategories;
    if (isDemo || currentUser?.role === 'demo') return DEFAULT_OFFLINE_CATEGORIES;
    return [];
  });
  const [transfers, setTransfers] = useState<StockTransfer[]>(initialTransfers);

  const targetOrgId = orgId || currentUser?.organization_id || null;

  const fetchProducts = useCallback(async () => {
    if (!targetOrgId || targetOrgId === 'org-default-offline') {
      if (initialProducts.length > 0) {
        setProducts(initialProducts);
      } else if (isDemo || currentUser?.role === 'demo') {
        setProducts(DEFAULT_OFFLINE_PRODUCTS);
      } else {
        setProducts([]);
      }
      return;
    }

    try {
      const res = await fetchAllTableRecords<Product>(
        'products',
        q => q.eq('organization_id', targetOrgId).is('deleted_at', null).order('name')
      );

      if (res.error) {
        logger.error('Error fetching products in ProductProvider:', res.error);
      } else if (res.data) {
        if (res.data.length > 0) {
          setProducts(res.data);
          offlineService.seedFallbackProducts(res.data).catch(() => {});
        } else if (isDemo || currentUser?.role === 'demo') {
          setProducts(DEFAULT_OFFLINE_PRODUCTS);
        } else {
          setProducts([]);
        }
      }
    } catch (err) {
      logger.error('Unexpected error fetching products:', err);
    }
  }, [targetOrgId, isDemo, currentUser?.role, initialProducts]);

  const fetchWarehouses = useCallback(async () => {
    if (!targetOrgId || targetOrgId === 'org-default-offline') return;
    try {
      const { data, error } = await supabase
        .from('warehouses')
        .select('*')
        .eq('organization_id', targetOrgId)
        .eq('is_active', true);
      if (error) {
        logger.error('Error fetching warehouses in ProductProvider:', error);
      } else {
        const loaded = (data as Warehouse[]) || [];
        setWarehouses(loaded.length > 0 ? loaded : (currentUser?.role === 'demo' ? DEFAULT_OFFLINE_WAREHOUSES : []));
      }
    } catch (err) {
      logger.error('Unexpected error fetching warehouses:', err);
    }
  }, [targetOrgId, currentUser?.role]);

  const fetchCategories = useCallback(async () => {
    if (!targetOrgId || targetOrgId === 'org-default-offline') return;
    try {
      const { data, error } = await supabase
        .from('item_categories')
        .select('*')
        .eq('organization_id', targetOrgId)
        .order('name');
      if (error) {
        logger.error('Error fetching categories in ProductProvider:', error);
      } else {
        const loaded = (data as Category[]) || [];
        setCategories(loaded.length > 0 ? loaded : (currentUser?.role === 'demo' ? DEFAULT_OFFLINE_CATEGORIES : []));
      }
    } catch (err) {
      logger.error('Unexpected error fetching categories:', err);
    }
  }, [targetOrgId, currentUser?.role]);

  const fetchTransfers = useCallback(async () => {
    if (!targetOrgId || targetOrgId === 'org-default-offline') return;
    try {
      const { data, error } = await supabase
        .from('stock_transfers')
        .select('*')
        .eq('organization_id', targetOrgId)
        .order('transfer_date', { ascending: false })
        .limit(500);
      if (error) {
        logger.error('Error fetching transfers in ProductProvider:', error);
      } else {
        setTransfers((data as StockTransfer[]) || []);
      }
    } catch (err) {
      logger.error('Unexpected error fetching transfers:', err);
    }
  }, [targetOrgId]);

  useEffect(() => {
    if (targetOrgId && targetOrgId !== 'org-default-offline') {
      fetchProducts();
    } else if (initialProducts.length > 0) {
      setProducts(initialProducts);
    }
  }, [targetOrgId, fetchProducts, initialProducts]);

  useEffect(() => {
    if (targetOrgId && targetOrgId !== 'org-default-offline') {
      fetchWarehouses();
    } else if (initialWarehouses.length > 0) {
      setWarehouses(initialWarehouses);
    }
  }, [targetOrgId, fetchWarehouses, initialWarehouses]);

  useEffect(() => {
    if (targetOrgId && targetOrgId !== 'org-default-offline') {
      fetchCategories();
    } else if (initialCategories.length > 0) {
      setCategories(initialCategories);
    }
  }, [targetOrgId, fetchCategories, initialCategories]);

  useEffect(() => {
    if (targetOrgId && targetOrgId !== 'org-default-offline') {
      fetchTransfers();
    } else if (initialTransfers.length > 0) {
      setTransfers(initialTransfers);
    }
  }, [targetOrgId, fetchTransfers, initialTransfers]);

  const recalculateStock = useCallback(async (productId?: string): Promise<void> => {
    const effectiveOrg = targetOrgId || currentUser?.organization_id;
    try {
      const { error } = await supabase.rpc('recalculate_stock_rpc', {
        p_product_id: productId || null,
        p_org_id: effectiveOrg || null
      });

      if (error) {
        showToast?.('فشل إعادة حساب المخزون: ' + error.message, 'error');
        logger.error('Error recalculating stock in ProductProvider:', error);
      } else {
        showToast?.('تم تحديث المخزون بنجاح ✅', 'success');
        await fetchProducts();
      }
    } catch (err) {
      logger.error('Unexpected error recalculating stock:', err);
    }
  }, [targetOrgId, currentUser, showToast, fetchProducts]);

  const addProduct = useCallback(async (data: Partial<Product>): Promise<Product | null> => {
    const effectiveOrg = targetOrgId || currentUser?.organization_id;
    const userId = currentUser?.id;

    const toNullableUUID = (v: unknown) => {
      if (!v || typeof v !== 'string' || v.trim() === '') return null;
      const trimmed = v.trim();
      return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(trimmed) ? trimmed : null;
    };

    const payload: Record<string, any> = {
      ...data,
      organization_id: effectiveOrg,
      created_by: userId || null,
      updated_by: userId || null
    };

    if ('category_id' in payload) payload.category_id = toNullableUUID(payload.category_id);
    if ('base_uom_id' in payload) payload.base_uom_id = toNullableUUID(payload.base_uom_id);
    if ('purchase_uom_id' in payload) payload.purchase_uom_id = toNullableUUID(payload.purchase_uom_id);
    if ('sale_uom_id' in payload) payload.sale_uom_id = toNullableUUID(payload.sale_uom_id);
    if ('inventory_account_id' in payload) payload.inventory_account_id = toNullableUUID(payload.inventory_account_id);
    if ('cogs_account_id' in payload) payload.cogs_account_id = toNullableUUID(payload.cogs_account_id);
    if ('sales_account_id' in payload) payload.sales_account_id = toNullableUUID(payload.sales_account_id);
    if ('supplier_id' in payload) {
      if (!payload.supplier_id || payload.supplier_id === '') {
        delete payload.supplier_id;
      } else {
        payload.supplier_id = toNullableUUID(payload.supplier_id);
      }
    }

    let p: Product | null = null;
    let error: { code?: string; message?: string } | null = null;

    for (let attempt = 0; attempt < 6; attempt++) {
      const res = await supabase.from('products').insert(payload).select().single();
      p = res.data;
      error = res.error;
      if (!error) break;

      if (error.code === 'PGRST204' || error.message?.includes('schema cache')) {
        const match = error.message?.match(/Could not find the '([^']+)' column/i);
        if (match && match[1] && match[1] in payload) {
          delete payload[match[1]];
          continue;
        }
      }
      break;
    }

    if (error) {
      showToast?.('فشل إضافة الصنف: ' + error.message, 'error');
      logger.error('addProduct error:', error);
      throw error;
    }

    showToast?.('تمت إضافة الصنف بنجاح ✅', 'success');
    logActivity?.('إضافة صنف', `تمت إضافة الصنف: ${data.name || ''}`);
    await fetchProducts();
    return p as Product;
  }, [targetOrgId, currentUser, logActivity, showToast, fetchProducts]);

  const updateProduct = useCallback(async (id: string, data: Partial<Product>): Promise<void> => {
    const effectiveOrg = targetOrgId || currentUser?.organization_id;
    const userId = currentUser?.id;

    const toNullableUUID = (v: unknown) => {
      if (!v || typeof v !== 'string' || v.trim() === '') return null;
      const trimmed = v.trim();
      return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(trimmed) ? trimmed : null;
    };

    const payload: Record<string, any> = { ...data };
    delete payload.id;
    delete payload.organization_id;
    if (userId) payload.updated_by = userId;

    if ('category_id' in payload) payload.category_id = toNullableUUID(payload.category_id);
    if ('base_uom_id' in payload) payload.base_uom_id = toNullableUUID(payload.base_uom_id);
    if ('purchase_uom_id' in payload) payload.purchase_uom_id = toNullableUUID(payload.purchase_uom_id);
    if ('sale_uom_id' in payload) payload.sale_uom_id = toNullableUUID(payload.sale_uom_id);
    if ('inventory_account_id' in payload) payload.inventory_account_id = toNullableUUID(payload.inventory_account_id);
    if ('cogs_account_id' in payload) payload.cogs_account_id = toNullableUUID(payload.cogs_account_id);
    if ('sales_account_id' in payload) payload.sales_account_id = toNullableUUID(payload.sales_account_id);
    if ('supplier_id' in payload) payload.supplier_id = toNullableUUID(payload.supplier_id);

    let error: { code?: string; message?: string } | null = null;

    for (let attempt = 0; attempt < 6; attempt++) {
      let query = supabase.from('products').update(payload).eq('id', id);
      if (effectiveOrg && effectiveOrg !== 'org-default-offline') {
        query = query.eq('organization_id', effectiveOrg);
      }
      const res = await query;
      error = res.error;
      if (!error) break;

      if (error.code === 'PGRST204' || error.message?.includes('schema cache')) {
        const match = error.message?.match(/Could not find the '([^']+)' column/i);
        if (match && match[1] && match[1] in payload) {
          delete payload[match[1]];
          continue;
        }
      }
      break;
    }

    if (error) {
      showToast?.('فشل تحديث الصنف: ' + error.message, 'error');
      logger.error('updateProduct error:', error);
      throw error;
    }

    showToast?.('تم تحديث بيانات الصنف بنجاح ✅', 'success');
    logActivity?.('تعديل صنف', `تم تعديل بيانات الصنف رقم: ${id}`);
    await fetchProducts();
  }, [targetOrgId, currentUser, logActivity, showToast, fetchProducts]);

  const deleteProduct = useCallback(async (id: string, reason?: string): Promise<void> => {
    const effectiveOrg = targetOrgId || currentUser?.organization_id;
    const userId = currentUser?.id;

    let query = supabase
      .from('products')
      .update({
        deleted_at: new Date().toISOString(),
        deletion_reason: reason,
        updated_by: userId
      })
      .eq('id', id);

    if (effectiveOrg && effectiveOrg !== 'org-default-offline') {
      query = query.eq('organization_id', effectiveOrg);
    }

    const { error } = await query;
    if (error) {
      showToast?.('فشل حذف الصنف: ' + error.message, 'error');
      logger.error('deleteProduct error:', error);
      throw error;
    }

    showToast?.('تم نقل الصنف إلى سلة المحذوفات', 'success');
    logActivity?.('حذف صنف', `تم حذف الصنف رقم: ${id}`);
    await fetchProducts();
  }, [targetOrgId, currentUser, logActivity, showToast, fetchProducts]);

  const addStockTransfer = useCallback(async (transfer: Partial<StockTransfer>): Promise<void> => {
    const effectiveOrg = targetOrgId || currentUser?.organization_id;
    const { error } = await supabase.from('stock_transfers').insert({ ...transfer, organization_id: effectiveOrg });
    if (error) throw error;
    await fetchTransfers();
  }, [targetOrgId, currentUser, fetchTransfers]);

  const approveStockTransfer = useCallback(async (id: string): Promise<void> => {
    const { error } = await supabase.rpc('approve_stock_transfer', { p_transfer_id: id });
    if (error) throw error;
    await fetchTransfers();
    await fetchProducts();
  }, [fetchTransfers, fetchProducts]);

  const cancelStockTransfer = useCallback(async (id: string): Promise<void> => {
    const { error } = await supabase.from('stock_transfers').update({ status: 'cancelled' }).eq('id', id);
    if (error) throw error;
    showToast?.('تم إلغاء طلب التحويل', 'info');
    await fetchTransfers();
  }, [showToast, fetchTransfers]);

  const addWarehouse = useCallback(async (warehouse: Partial<Warehouse>): Promise<void> => {
    const effectiveOrg = targetOrgId || currentUser?.organization_id;
    const { error } = await supabase.from('warehouses').insert({ ...warehouse, organization_id: effectiveOrg });
    if (error) throw error;
    await fetchWarehouses();
  }, [targetOrgId, currentUser, fetchWarehouses]);

  const updateWarehouse = useCallback(async (id: string, updates: Partial<Warehouse>): Promise<void> => {
    const effectiveOrg = targetOrgId || currentUser?.organization_id;
    let query = supabase.from('warehouses').update(updates).eq('id', id);
    if (effectiveOrg && effectiveOrg !== 'org-default-offline') {
      query = query.eq('organization_id', effectiveOrg);
    }
    const { error } = await query;
    if (error) throw error;
    await fetchWarehouses();
  }, [targetOrgId, currentUser, fetchWarehouses]);

  const deleteWarehouse = useCallback(async (id: string): Promise<void> => {
    const effectiveOrg = targetOrgId || currentUser?.organization_id;
    let query = supabase.from('warehouses').update({ is_active: false }).eq('id', id);
    if (effectiveOrg && effectiveOrg !== 'org-default-offline') {
      query = query.eq('organization_id', effectiveOrg);
    }
    const { error } = await query;
    if (error) throw error;
    await fetchWarehouses();
  }, [targetOrgId, currentUser, fetchWarehouses]);

  const addWastage = useCallback(async (wastage: Record<string, unknown>): Promise<boolean> => {
    const { error } = await supabase.rpc('record_wastage', wastage);
    if (error) {
      showToast?.('فشل تسجيل الهالك: ' + error.message, 'error');
    } else {
      showToast?.('تم تسجيل الهالك وتحديث المخزن ✅', 'success');
      await fetchProducts();
    }
    return !error;
  }, [showToast, fetchProducts]);

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
        refreshWarehouses: fetchWarehouses,
        refreshCategories: fetchCategories,
        refreshTransfers: fetchTransfers,
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
    refreshProducts: (acc.refreshProducts as () => Promise<void>) || (acc.refreshData as () => Promise<void>),
  };
};

export default useProductDomain;
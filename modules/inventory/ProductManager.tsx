import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { logger } from '../../utils/logger';
import { supabase } from '../../supabaseClient';
import { useAccounting } from '../../context/AccountingContext';
import { useToast } from '../../context/ToastContext';
import { useQueryClient } from '@tanstack/react-query';
import { usePagination } from '../../components/usePagination';
import { useNavigate } from 'react-router-dom';
import RecipeManagement from '../restaurant/components/Management/RecipeManagement';
import { ModifierManagement } from '../restaurant/components/Management/ModifierManagement';
import { createProductSchema } from '../../utils/validationSchemas';
import { BulkPriceUpdateModal } from './components/BulkPriceUpdateModal';
import { BulkOfferModal } from './components/BulkOfferModal';
import { CategoryModal } from './components/CategoryModal';
import { AutoCreatedProductsModal } from './components/AutoCreatedProductsModal';
import { ExpectedConsumptionModal } from './components/ExpectedConsumptionModal';
import { ProductFormModal, ProductFormData } from './components/ProductFormModal';
export type { ProductFormData };
import { fetchUoms } from '../../services/uomService';
import { ExcelPriceUpdateModal } from './components/ExcelPriceUpdateModal';
import { ProductToolbarAndFilters } from './components/ProductToolbarAndFilters';
import { ProductsTable } from './components/ProductsTable';
import {
  autoAssignMissingSkusService,
  countFinishedGoodsItemsNeedingSync,
  countRawItemsNeedingSync,
  syncFinishedGoodsAccountsService,
  syncMissingOpeningEntriesService,
  syncRawMaterialAccountsService,
} from './utils/productAccountSyncUtils';
import { printOfferBarcode, printBarcode, printBulkBarcodes } from './utils/productBarcodeUtils';
import { 
  downloadProductsTemplate, 
  downloadRecipeTemplate, 
  exportProductsToExcel, 
  exportScalePLUToExcel, 
  importRecipesFromExcel, 
  importProductsFromExcel 
} from './utils/productExcelUtils';

// تعريف واجهة الصنف بناءً على الجدول الجديد items
export type Item = {
  id: string;
  name: string;
  sku: string | null;
  barcode?: string | null;
  sales_price: number;
  description?: string | null;
  purchase_price: number; // هذا هو حقل التكلفة
  weighted_average_cost?: number; // متوسط التكلفة
  stock: number; // هذا هو حقل المخزون
  item_type?: string; 
  product_type: 'STOCK' | 'SERVICE' | 'MANUFACTURED' | 'RAW_MATERIAL' | 'INTERMEDIATE_PRODUCT';
  inventory_account_id: string | null;
  cogs_account_id: string | null;
  sales_account_id: string | null;
  image_url: string | null;
  expiry_date?: string | null;
  base_uom_id?: string | null;
  purchase_uom_id?: string | null;
  sale_uom_id?: string | null;
  offer_price?: number | null;
  offer_start_date?: string | null;
  offer_end_date?: string | null;
  min_stock_level?: number | null;
  category_id?: string | null;
  unit?: string;
  offer_max_qty?: number | null;
  labor_cost?: number;
  requires_serial: boolean; // Make it non-optional as it always has a default value in DB
  overhead_cost?: number;
  is_overhead_percentage?: boolean;
  available_modifiers?: any[]; // Added this line to Item type
  // ========== حقول الهايبر ماركت ==========
  barcode2?: string | null;
  is_scale_item?: boolean;
  plu_number?: number | null;
  scale_prefix?: string | null;
  shelf_location?: string | null;
  brand?: string | null;
  country_of_origin?: string | null;
  age_restricted?: boolean;
  tax_rate_override?: number | null;
  unit_barcodes?: Array<{ uom_id?: string; barcode: string; price?: number; uom_name?: string }>;
  // ========== حدود التسعير والمخزون المتقدمة ==========
  min_sales_price?: number | null;
  max_stock_level?: number | null;
  wholesale_price?: number | null;
  supplier_id?: string | null;
  // ========== بيانات الفاتورة الإلكترونية المصرية ==========
  item_code_type?: 'GS1' | 'EGS';
  egs_code?: string | null;
  eta_unit_code?: string | null;
};


const ProductManager = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { accounts: contextAccounts, getSystemAccount, refreshData, deleteProduct, updateProduct, currentUser, products: contextProducts, warehouses, can, categories, addProduct, addEntry, settings, recalculateStock, currentSelectedOrgId, suppliers } = useAccounting();
  const { showToast } = useToast();
  const toastFn = useCallback((msg: string, type?: string) => showToast(msg, type as any), [showToast]);
  
  // نقلنا تعريفات الحالة للأعلى لمنع خطأ TS2448 (Used before declaration)
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [uoms, setUoms] = useState<any[]>([]);
  
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [showOffersOnly, setShowOffersOnly] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [warehouseFilter, setWarehouseFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [routingFilter, setRoutingFilter] = useState<'all' | 'has_routing_and_steps' | 'has_routing_no_steps' | 'no_routing' | 'has_any_routing'>('all');
  const [routingsMap, setRoutingsMap] = useState<Map<string, { routingId: string; routingName: string; stepsCount: number }>>(new Map());
  const [recipeCost, setRecipeCost] = useState(0); 
  const [isExporting, setIsExporting] = useState(false); 

  // تأخير البحث
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchTerm), 500);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  // جلب مسارات ومراحل التصنيع لربطها بالأصناف والفلاتر
  const fetchOrgRoutings = useCallback(async () => {
    const orgId = currentSelectedOrgId || (currentUser as any)?.organization_id || (currentUser as any)?.user_metadata?.org_id;
    if (!orgId) return;

    try {
      const { data, error } = await supabase
        .from('mfg_routings')
        .select(`
          id,
          product_id,
          name,
          is_default,
          mfg_routing_steps (
            id
          )
        `)
        .eq('organization_id', orgId)
        .is('deleted_at', null);

      if (!error && data) {
        const map = new Map<string, { routingId: string; routingName: string; stepsCount: number }>();
        data.forEach((r: Record<string, any>) => {
          if (!r.product_id) return;
          const stepsCount = Array.isArray(r.mfg_routing_steps) ? r.mfg_routing_steps.length : 0;
          const existing = map.get(r.product_id);
          if (!existing || r.is_default) {
            map.set(r.product_id, {
              routingId: r.id,
              routingName: r.name,
              stepsCount
            });
          }
        });
        setRoutingsMap(map);
      }
    } catch (err) {
      logger.warn('Error fetching routings for products filter:', err);
    }
  }, [currentSelectedOrgId, currentUser]);

  useEffect(() => {
    fetchOrgRoutings();
  }, [fetchOrgRoutings]);

  // إعداد استعلام البيانات
  type DynamicQuery = any;
  const queryModifier = useCallback((query: DynamicQuery) => {
    if (debouncedSearch) {
      query = query.or(`name.ilike.%${debouncedSearch}%,sku.ilike.%${debouncedSearch}%,description.ilike.%${debouncedSearch}%,barcode.ilike.%${debouncedSearch}%,barcode2.ilike.%${debouncedSearch}%`);
    }
    if (showOffersOnly) {
       const today = new Date().toISOString().split('T')[0];
       query = query.gt('offer_price', 0).lte('offer_start_date', today).gte('offer_end_date', today);
    }
    if (categoryFilter !== 'all') {
      query = query.eq('category_id', categoryFilter);
    }
    if (typeFilter !== 'all') {
      if (typeFilter === 'RAW_MATERIAL') {
        query = query.or('product_type.eq.RAW_MATERIAL,mfg_type.eq.raw,item_type.eq.RAW_MATERIAL');
      } else if (typeFilter === 'MANUFACTURED') {
        query = query.or('product_type.eq.MANUFACTURED,mfg_type.eq.standard,item_type.eq.MANUFACTURED');
      } else if (typeFilter === 'INTERMEDIATE_PRODUCT') {
        query = query.or('product_type.eq.INTERMEDIATE_PRODUCT,mfg_type.eq.intermediate,item_type.eq.INTERMEDIATE_PRODUCT');
      } else if (typeFilter === 'SERVICE') {
        query = query.or('product_type.eq.SERVICE,item_type.eq.SERVICE');
      } else if (typeFilter === 'STOCK') {
        query = query.or('product_type.eq.STOCK,and(product_type.is.null,mfg_type.is.null)');
      }
    }

    // فلترة مسار ومراحل التصنيع
    if (routingFilter !== 'all') {
      if (routingFilter === 'has_routing_and_steps') {
        const idsWithSteps = Array.from(routingsMap.entries())
          .filter(([_, info]) => info.stepsCount > 0)
          .map(([pid]) => pid);
        if (idsWithSteps.length > 0) {
          query = query.in('id', idsWithSteps);
        } else {
          query = query.eq('id', '00000000-0000-0000-0000-000000000000');
        }
      } else if (routingFilter === 'has_routing_no_steps') {
        const idsNoSteps = Array.from(routingsMap.entries())
          .filter(([_, info]) => info.stepsCount === 0)
          .map(([pid]) => pid);
        if (idsNoSteps.length > 0) {
          query = query.in('id', idsNoSteps);
        } else {
          query = query.eq('id', '00000000-0000-0000-0000-000000000000');
        }
      } else if (routingFilter === 'has_any_routing') {
        const allRoutingIds = Array.from(routingsMap.keys());
        if (allRoutingIds.length > 0) {
          query = query.in('id', allRoutingIds);
        } else {
          query = query.eq('id', '00000000-0000-0000-0000-000000000000');
        }
      } else if (routingFilter === 'no_routing') {
        // حصر في الأصناف المصنعة والوسيطة إذا لم تكن محددة بالنوع
        if (typeFilter === 'all') {
          query = query.or('product_type.eq.MANUFACTURED,mfg_type.eq.standard,item_type.eq.MANUFACTURED,product_type.eq.INTERMEDIATE_PRODUCT,mfg_type.eq.intermediate,item_type.eq.INTERMEDIATE_PRODUCT');
        }
        const allRoutingIds = Array.from(routingsMap.keys());
        if (allRoutingIds.length > 0) {
          query = query.not('id', 'in', `(${allRoutingIds.join(',')})`);
        }
      }
    }

    return query;
  }, [debouncedSearch, showOffersOnly, categoryFilter, typeFilter, routingFilter, routingsMap]);

  // استخدام Hook التصفح
  const targetOrgId = currentSelectedOrgId || (currentUser as any)?.organization_id;
  const { data: serverItems, loading: serverLoading, page, setPage, totalPages, totalCount, refresh } = usePagination<Item>('products', { select: '*', pageSize: 20, orderBy: 'name', ascending: true, organizationId: targetOrgId }, queryModifier);

  const hasSupplierColumn = Boolean(
    (serverItems && serverItems.length > 0 && 'supplier_id' in (serverItems[0] || {})) ||
    (contextProducts && contextProducts.length > 0 && 'supplier_id' in (contextProducts[0] || {}))
  );

  const hasEtaColumns = Boolean(
    (serverItems && serverItems.length > 0 && 'egs_code' in (serverItems[0] || {})) ||
    (contextProducts && contextProducts.length > 0 && 'egs_code' in (contextProducts[0] || {}))
  );

  useEffect(() => {
    const loadUomsList = async () => {
      if (currentUser?.role === 'demo') {
        setUoms([
          { id: 'u1', name: 'قطعة' },
          { id: 'u2', name: 'علبة' },
          { id: 'u3', name: 'كرتونة' },
          { id: 'u4', name: 'كجم' },
          { id: 'u5', name: 'لتر' }
        ]);
        return;
      }
      const orgId = (currentUser as any)?.organization_id;
      const data = await fetchUoms(orgId);
      if (data) setUoms(data);
    };
    if (isModalOpen) loadUomsList();
  }, [isModalOpen, currentUser]);

  // في وضع الديمو، نستخدم المنتجات من السياق (الوهمية)
  const items: Item[] = currentUser?.role === 'demo' 
    ? (contextProducts as unknown as Item[]).filter((i: Item) => {
        const matchesSearch = i.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
          (i.sku && i.sku.toLowerCase().includes(searchTerm.toLowerCase())) ||
          ((i as any).description && (i as any).description.toLowerCase().includes(searchTerm.toLowerCase()));
        const matchesCategory = categoryFilter === 'all' || i.category_id === categoryFilter;
        const effectiveType = 
          i.product_type === 'INTERMEDIATE_PRODUCT' || (i as any).mfg_type === 'intermediate'
            ? 'INTERMEDIATE_PRODUCT'
            : i.product_type || (i as any).item_type || 'STOCK';
        const matchesType = typeFilter === 'all' || effectiveType === typeFilter;

        const isMfg = effectiveType === 'MANUFACTURED' || effectiveType === 'INTERMEDIATE_PRODUCT';
        const rInfo = routingsMap.get(i.id);
        let matchesRouting = true;
        if (routingFilter === 'has_routing_and_steps') {
          matchesRouting = isMfg && Boolean(rInfo && rInfo.stepsCount > 0);
        } else if (routingFilter === 'has_routing_no_steps') {
          matchesRouting = isMfg && Boolean(rInfo && rInfo.stepsCount === 0);
        } else if (routingFilter === 'has_any_routing') {
          matchesRouting = isMfg && Boolean(rInfo);
        } else if (routingFilter === 'no_routing') {
          matchesRouting = isMfg && !rInfo;
        }

        return matchesSearch && matchesCategory && matchesType && matchesRouting;
      }) 
    : serverItems;
    
  const loading = currentUser?.role === 'demo' ? false : serverLoading;
  const [editingId, setEditingId] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [reservedStock, setReservedStock] = useState<Record<string, number>>({});
  const [recipeTarget, setRecipeTarget] = useState<{id: string, name: string} | null>(null);
  const [modifierTarget, setModifierTarget] = useState<{id: string, name: string} | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isBulkOfferModalOpen, setIsBulkOfferModalOpen] = useState(false);
  const [isBulkSaving, setIsBulkSaving] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [isRecipeImporting, setIsRecipeImporting] = useState(false);
  const [importWarehouseId, setImportWarehouseId] = useState<string>('');
  const [isConsumptionModalOpen, setIsConsumptionModalOpen] = useState(false);
  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);
  const [categoryFormData, setCategoryFormData] = useState({ id: '', name: '', image_url: '', description: '' });
  const [autoCreatedProducts, setAutoCreatedProducts] = useState<any[]>([]);
  const [isBulkPriceUpdateModalOpen, setIsBulkPriceUpdateModalOpen] = useState(false);
  const [isExcelPriceUpdateModalOpen, setIsExcelPriceUpdateModalOpen] = useState(false);
  const [isReportModalOpen, setIsReportModalOpen] = useState(false);
  const [initialOpeningStock, setInitialOpeningStock] = useState<number>(0);
  const [initialOpeningWarehouseId, setInitialOpeningWarehouseId] = useState<string>('');

  useEffect(() => {
    if (warehouses.length > 0 && !importWarehouseId) {
      setImportWarehouseId(warehouses[0].id);
    }
  }, [warehouses]);

  // تصفية الحسابات من السياق العام لضمان التوافق
  const accounts = {
    assets: contextAccounts.filter(a => 
      // السماح بظهور الحسابات حتى لو كانت Groups لسهولة البحث، مع منع الترحيل لاحقاً
      (String(a.type).toLowerCase() === 'asset')
    ),
    expenses: contextAccounts.filter(a => 
      (String(a.type).toLowerCase() === 'expense')
    ),
    revenue: contextAccounts.filter(a => 
      (String(a.type).toLowerCase() === 'revenue')
    ),
  };

  // جلب الكميات المحجوزة (من الفواتير المسودة)
  useEffect(() => {
    const fetchReserved = async () => {
      if (currentUser?.role === 'demo') {
          setReservedStock({});
          return;
      }
      try {
        const { data } = await supabase
          .from('invoice_items')
          .select('product_id, quantity, invoices!inner(status)')
          .eq('invoices.status', 'draft');
        
        const reserved: Record<string, number> = {};
        data?.forEach((item: Record<string, any>) => {
          if (item.product_id) {
            reserved[item.product_id] = (reserved[item.product_id] || 0) + Number(item.quantity);
          }
        });
        setReservedStock(reserved);
      } catch (error) {
        logger.error("Error fetching reserved stock:", error);
      }
    };
    fetchReserved();
  }, [currentUser]);

  // بيانات النموذج
  const [formData, setFormData] = useState<ProductFormData>({
    name: '',
    sku: '',
    barcode: '',
    sales_price: 0,
    description: '',
    purchase_price: 0,
    unit: 'قطعة',
    product_type: 'STOCK',
    inventory_account_id: '',
    cogs_account_id: '',
    sales_account_id: '',
    image_url: '',
    opening_stock: 0,
    opening_warehouse_id: '',
    category_id: null,
    min_stock_level: 0, // حقل حد الطلب
    requires_serial: false,
    expiry_date: '',
    offer_price: 0,
    offer_start_date: '',
    offer_end_date: '',
    offer_max_qty: 0,
    available_modifiers: [] as any[],
    labor_cost: 0,
    overhead_cost: 0,
    is_overhead_percentage: false,
    // إضافة الحقول المفقودة لحل خطأ TS2345
    base_uom_id: '',
    purchase_uom_id: '',
    sale_uom_id: '',
    // حقول الهايبر ماركت
    barcode2: '',
    is_scale_item: false,
    plu_number: 0,
    scale_prefix: '22',
    shelf_location: '',
    brand: '',
    country_of_origin: '',
    age_restricted: false,
    tax_rate_override: 0,
    unit_barcodes: [],
    // حدود التسعير والمخزون المتقدمة
    min_sales_price: 0,
    max_stock_level: 0,
    wholesale_price: 0,
    half_wholesale_price: 0,
    supplier_id: null,
  });

  // 🚀 تحديث تلقائي لسعر التكلفة التقديري بناءً على العمالة والمصاريف (للوجبات)
  useEffect(() => {
    if (formData.product_type === 'MANUFACTURED') {
      const labor = Number(formData.labor_cost) || 0;
      const overhead = Number(formData.overhead_cost) || 0;
      let totalAdditional = 0;

      if (formData.is_overhead_percentage) {
        totalAdditional = labor * (1 + overhead / 100);
      } else {
        totalAdditional = labor + overhead;
      }
      
      // 🎯 دمج تكلفة المكونات المجلوبة مع تكاليف التصنيع
      const finalCost = recipeCost + totalAdditional;
      // 🛡️ صمام أمان: لا نحدث التكلفة إلى 0 إذا كان هناك تكلفة سابقة والوصفة/العمالة لم تُدخل بعد
      if (finalCost > 0) {
        setFormData(prev => ({ ...prev, purchase_price: Number(finalCost.toFixed(2)) }));
      }
    }
  }, [formData.labor_cost, formData.overhead_cost, formData.is_overhead_percentage, formData.product_type, recipeCost]);

  // جلب سجل الرصيد الافتتاحي المسجل مسبقاً للصنف عند التعديل
  const [existingOpenings, setExistingOpenings] = useState<any[]>([]);

  useEffect(() => {
    if (editingId && isModalOpen) {
      supabase
        .from('opening_inventories')
        .select('id, quantity, cost, warehouse_id, created_at, warehouses(name)')
        .eq('product_id', editingId)
        .then(({ data, error }) => {
          if (!error && data) {
            setExistingOpenings(data);
          } else {
            setExistingOpenings([]);
          }
        });
    } else {
      setExistingOpenings([]);
    }
  }, [editingId, isModalOpen]);

  // 🏷️ توليد كود فريد تلقائياً لصنف (SKU)
  const generateUniqueSku = useCallback((prefix = 'SKU'): string => {
    const existingSkus = new Set(
      (items || []).map(p => (p.sku || '').trim().toUpperCase()).filter(Boolean)
    );
    let seq = (items || []).length + 1;
    let candidate = `${prefix}-${String(seq).padStart(5, '0')}`;
    while (existingSkus.has(candidate.toUpperCase())) {
      seq++;
      candidate = `${prefix}-${String(seq).padStart(5, '0')}`;
    }
    return candidate;
  }, [items]);

  // 🏷️ توليد باركود فريد تلقائياً
  const generateUniqueBarcode = useCallback((): string => {
    const existingBarcodes = new Set(
      (items || []).map(p => (p.barcode || '').trim()).filter(Boolean)
    );
    let candidate = '';
    do {
      const rand = Math.floor(100000000 + Math.random() * 900000000);
      candidate = `200${rand}`;
    } while (existingBarcodes.has(candidate));
    return candidate;
  }, [items]);

  const [isAssigningSkus, setIsAssigningSkus] = useState(false);

  // ⚡ تعيين وتوليد أكواد SKU تلقائية لجميع الأصناف التي تفتقر لكود
  const handleAutoAssignMissingSkus = async () => {
    setIsAssigningSkus(true);
    try {
      await autoAssignMissingSkusService({ items, refresh, refreshData, showToast: toastFn });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      showToast('خطأ أثناء تعيين الأكواد: ' + msg, 'error');
    } finally {
      setIsAssigningSkus(false);
    }
  };

  const [isSyncingRawAccounts, setIsSyncingRawAccounts] = useState(false);
  const [isSyncingFinishedGoodsAccounts, setIsSyncingFinishedGoodsAccounts] = useState(false);

  const rawItemsNeedingSyncCount = useMemo(
    () => countRawItemsNeedingSync(contextProducts || [], getSystemAccount, settings),
    [contextProducts, getSystemAccount, settings]
  );

  const finishedGoodsItemsNeedingSyncCount = useMemo(
    () => countFinishedGoodsItemsNeedingSync(contextProducts || [], categories, getSystemAccount, settings),
    [contextProducts, categories, getSystemAccount, settings]
  );

  // 🔄 توجيه حسابات أصناف المواد الخام آلياً لحساب مخزون المواد الخام مع الحفاظ التام على التعديلات اليدوية
  const handleSyncRawMaterialAccounts = async () => {
    setIsSyncingRawAccounts(true);
    try {
      await syncRawMaterialAccountsService({
        contextProducts: contextProducts || [],
        targetOrgId,
        currentUser,
        getSystemAccount,
        settings,
        refresh,
        refreshData,
        showToast: toastFn,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      showToast('حدث خطأ أثناء تحديث الحسابات: ' + msg, 'error');
    } finally {
      setIsSyncingRawAccounts(false);
    }
  };

  // 🎂🔄 توجيه حسابات أصناف التورت والجاتوهات والشرقي آلياً لحساب مخزون الإنتاج التام (10302)
  const handleSyncFinishedGoodsAccounts = async () => {
    setIsSyncingFinishedGoodsAccounts(true);
    try {
      await syncFinishedGoodsAccountsService({
        contextProducts: contextProducts || [],
        categories,
        targetOrgId,
        currentUser,
        getSystemAccount,
        settings,
        refresh,
        refreshData,
        showToast: toastFn,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      showToast('حدث خطأ أثناء تحديث الحسابات: ' + msg, 'error');
    } finally {
      setIsSyncingFinishedGoodsAccounts(false);
    }
  };

  const handleOpenModal = async (item?: Item) => {
    const rawMaterialAcc = getSystemAccount('INVENTORY_RAW_MATERIALS')?.id || settings?.account_mappings?.INVENTORY_RAW_MATERIALS || '00bc8443-0ace-40ba-82c1-ce97f6a02e15';
    const finishedGoodsAcc = getSystemAccount('INVENTORY_FINISHED_GOODS')?.id || settings?.account_mappings?.INVENTORY_FINISHED_GOODS || '90685bba-b765-4fe4-96a5-b3963a4ec085';
    const generalInvAcc = getSystemAccount('INVENTORY')?.id || settings?.account_mappings?.INVENTORY || '5434d458-20fe-4641-bc0f-22b8ccba0de7';
    const defaultInventory = finishedGoodsAcc || getSystemAccount('INVENTORY_FINISHED_GOODS')?.id || '';
    const defaultCogs = getSystemAccount('COGS')?.id || '';
    const defaultSales = getSystemAccount('SALES_REVENUE')?.id || '';

    if (item) {
      // جلب تكلفة المكونات من قاعدة البيانات عند فتح الصنف للتعديل
      try {
        const { data } = await supabase.rpc('get_product_recipe_cost', { p_product_id: item.id, p_org_id: currentUser?.organization_id });
        setRecipeCost(Number(data) || 0);
      } catch (e) {
        setRecipeCost(0);
      }
      // التحقق من صلاحية الحسابات المرتبطة بالصنف، وإذا لم تكن صالحة، استخدم الحسابات الافتراضية
      const itemCat = categories.find(c => c.id === item.category_id);
      const isRawItem = item.product_type === 'RAW_MATERIAL' || (item as any).mfg_type === 'raw' || (itemCat && ['خامات الحلويات الأولية', 'خامات التعبئة والتغليف'].includes(itemCat.name));
      const isFinishedCategory = itemCat && ['التورتات الغربية الفاخرة', 'الجاتوهات والقطع', 'الحلويات الشرقية', 'الشيكولاتة الفاخرة والهدايا', 'الآيس كريم والمثلجات'].includes(itemCat.name);
      const isManufactured = item.product_type === 'MANUFACTURED' || (item as any).mfg_type === 'standard' || isFinishedCategory;

      let effectiveDefaultInventory = defaultInventory;
      if (itemCat?.default_inventory_account_id) {
        effectiveDefaultInventory = itemCat.default_inventory_account_id;
      } else if (isRawItem && rawMaterialAcc) {
        effectiveDefaultInventory = rawMaterialAcc;
      } else if (isManufactured && finishedGoodsAcc) {
        effectiveDefaultInventory = finishedGoodsAcc;
      }

      let inventoryAccId = item.inventory_account_id;
      if (!accounts.assets.find(a => a.id === inventoryAccId)) {
        inventoryAccId = effectiveDefaultInventory;
      } else if (inventoryAccId === generalInvAcc) {
        if (isRawItem) inventoryAccId = rawMaterialAcc;
        else if (isManufactured || isFinishedCategory) inventoryAccId = finishedGoodsAcc;
      } else if (inventoryAccId === rawMaterialAcc && isFinishedCategory) {
        inventoryAccId = finishedGoodsAcc;
      }

      const cogsAccId = accounts.expenses.find(a => a.id === item.cogs_account_id) ? item.cogs_account_id : defaultCogs;
      const salesAccId = accounts.revenue.find(a => a.id === item.sales_account_id) ? item.sales_account_id : defaultSales;

      // جلب الرصيد الافتتاحي الحقيقي المسجل في opening_inventories بدلاً من stock الجاري
      let actualOpeningStock = 0;
      let actualOpeningWarehouseId = warehouses[0]?.id || '';
      try {
        const { data: opData } = await supabase
          .from('opening_inventories')
          .select('quantity, warehouse_id')
          .eq('product_id', item.id);
        if (opData && opData.length > 0) {
          actualOpeningStock = opData.reduce((acc, curr) => acc + Number(curr.quantity || 0), 0);
          actualOpeningWarehouseId = opData[0].warehouse_id || warehouses[0]?.id || '';
        }
      } catch (e) {
        logger.warn('Could not fetch existing opening stock:', e);
      }

      setInitialOpeningStock(actualOpeningStock);
      setInitialOpeningWarehouseId(actualOpeningWarehouseId);

      setEditingId(item.id);
      const productDataToSet: ProductFormData = { // Explicitly type the object literal
        name: item.name,
        sku: item.sku || generateUniqueSku(),
        barcode: item.barcode || '',
        sales_price: item.sales_price || 0,
        description: item.description || '',
        purchase_price: item.purchase_price || 0,
        unit: item.unit || 'قطعة',
        base_uom_id: item.base_uom_id || '',
        purchase_uom_id: item.purchase_uom_id || '',
        sale_uom_id: item.sale_uom_id || '',
        product_type: ((item.product_type === 'INTERMEDIATE_PRODUCT' || (item as any).mfg_type === 'intermediate')
          ? 'INTERMEDIATE_PRODUCT' 
          : (item.product_type === 'MANUFACTURED' || (item as any).mfg_type === 'standard')
          ? 'MANUFACTURED'
          : (item.product_type === 'RAW_MATERIAL' || (item as any).mfg_type === 'raw')
          ? 'RAW_MATERIAL'
          : (item.product_type === 'SERVICE' || (item as any).item_type === 'SERVICE')
          ? 'SERVICE'
          : (item.product_type || item.item_type || 'STOCK')) as any, 
        inventory_account_id: inventoryAccId || '',
        cogs_account_id: cogsAccId || '',
        sales_account_id: salesAccId || '',
        image_url: item.image_url || '',
        opening_stock: actualOpeningStock,
        opening_warehouse_id: actualOpeningWarehouseId,
        category_id: item.category_id || null,
        min_stock_level: item.min_stock_level || 0,
        requires_serial: item.requires_serial, // Now it's guaranteed to be boolean
        expiry_date: item.expiry_date || '',
        offer_price: item.offer_price || 0,
        offer_start_date: item.offer_start_date || '',
        offer_end_date: item.offer_end_date || '',
        offer_max_qty: item.offer_max_qty || 0,
        available_modifiers: item.available_modifiers || [], // Use item.available_modifiers directly
        labor_cost: item.labor_cost || 0,
        overhead_cost: item.overhead_cost || 0,
        is_overhead_percentage: item.is_overhead_percentage || false,
        // حقول الهايبر ماركت
        barcode2: (item as any).barcode2 || '',
        is_scale_item: (item as any).is_scale_item || false,
        plu_number: (item as any).plu_number || 0,
        scale_prefix: (item as any).scale_prefix || '22',
        shelf_location: (item as any).shelf_location || '',
        brand: (item as any).brand || '',
        country_of_origin: (item as any).country_of_origin || '',
        age_restricted: (item as any).age_restricted || false,
        tax_rate_override: (item as any).tax_rate_override || 0,
        unit_barcodes: Array.isArray((item as any).unit_barcodes) ? (item as any).unit_barcodes : [],
        // حدود التسعير والمخزون المتقدمة
        min_sales_price: Number((item as any).min_sales_price || 0),
        max_stock_level: Number((item as any).max_stock_level || 0),
        wholesale_price: Number((item as any).wholesale_price || 0),
        half_wholesale_price: Number((item as any).half_wholesale_price || 0),
        supplier_id: (item as any).supplier_id || null,
      };
      setFormData(productDataToSet);
    } else {
      setInitialOpeningStock(0);
      setInitialOpeningWarehouseId(warehouses[0]?.id || '');
      setRecipeCost(0);
      setEditingId(null);
      // تعيين قيم افتراضية للحسابات إذا وجدت لتسهيل الإدخال

      setFormData({ // This is the initial state, which is already correctly typed
        name: '', 
        sku: generateUniqueSku(), 
        barcode: '',
        description: '',
        sales_price: 0, 
        purchase_price: 0, 
        unit: 'قطعة',
        base_uom_id: '',
        purchase_uom_id: '',
        sale_uom_id: '',
        requires_serial: false,
        product_type: 'STOCK', // Default to STOCK for new products
        inventory_account_id: defaultInventory,
        cogs_account_id: defaultCogs,
        sales_account_id: defaultSales,
        image_url: '',
        opening_stock: 0,
        opening_warehouse_id: warehouses[0]?.id || '',
        category_id: null,
        min_stock_level: 0,
        expiry_date: '',
        offer_price: 0,
        offer_start_date: '',
        offer_end_date: '',
        offer_max_qty: 0,
        available_modifiers: [],
        labor_cost: 0,
        overhead_cost: 0,
        is_overhead_percentage: false,
        // حقول الهايبر ماركت
        barcode2: '',
        is_scale_item: false,
        plu_number: 0,
        scale_prefix: '22',
        shelf_location: '',
        brand: '',
        country_of_origin: '',
        age_restricted: false,
        tax_rate_override: 0,
        unit_barcodes: [],
        // حدود التسعير والمخزون المتقدمة
        min_sales_price: 0,
        max_stock_level: 0,
        wholesale_price: 0,
        half_wholesale_price: 0,
        supplier_id: null,
        // بيانات الفاتورة الإلكترونية
        item_code_type: 'EGS',
        egs_code: '',
        eta_unit_code: '',
      });
    }
    setIsModalOpen(true);
  };

  const handleDownloadTemplate = () => downloadProductsTemplate();

  const handleExportExcel = () => {
    const selectedWh = warehouses.find(w => w.id === warehouseFilter);
    exportProductsToExcel({
      targetOrgId,
      categories,
      queryModifier,
      showToast: toastFn,
      setIsExporting,
      selectedWarehouseId: warehouseFilter,
      selectedWarehouseName: selectedWh?.name,
    });
  };

  // ⚖️ تصدير ملف الموازين الإلكترونية (Scale PLU Exporter)
  const handleExportScalePLU = () => exportScalePLUToExcel(toastFn);

  const handleDownloadRecipeTemplate = () => downloadRecipeTemplate();

  const handleRecipeFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;
    const file = e.target.files[0];
    await importRecipesFromExcel({
      file,
      currentUser,
      getSystemAccount,
      refresh,
      setAutoCreatedProducts,
      setIsReportModalOpen,
      showToast: toastFn,
      setIsRecipeImporting,
    });
    e.target.value = '';
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;
    const file = e.target.files[0];
    await importProductsFromExcel({
      file,
      currentUser,
      currentSelectedOrgId,
      importWarehouseId,
      warehouses,
      categories,
      contextAccounts,
      getSystemAccount,
      addEntry,
      queryClient,
      refreshData,
      showToast: toastFn,
      setIsImporting,
    });
    e.target.value = '';
  };

  const [isSyncingOpenings, setIsSyncingOpenings] = useState(false);

  const handleSyncMissingOpeningEntries = async () => {
    const orgId = currentSelectedOrgId || (currentUser as any)?.organization_id || (currentUser as any)?.user_metadata?.org_id;
    if (!orgId) {
      showToast('يرجى تحديد المنظمة أولاً', 'warning');
      return;
    }

    if (!window.confirm('هل تريد فحص جميع الأصناف المخزنية وتوليد القيود الافتتاحية للأصناف التي لديها رصيد/تكلفة وليس لها قيد افتتاحى مسجل؟')) {
      return;
    }

    setIsSyncingOpenings(true);
    try {
      await syncMissingOpeningEntriesService({
        orgId,
        contextAccounts,
        warehouses,
        getSystemAccount,
        addEntry,
        refreshData,
        refresh,
        showToast: toastFn,
      });
    } catch (err: unknown) {
      logger.error(err);
      const msg = err instanceof Error ? err.message : String(err);
      showToast('حدث خطأ أثناء توليد القيود الافتتاحية: ' + msg, 'error');
    } finally {
      setIsSyncingOpenings(false);
    }
  };

  const [isRecalculatingAll, setIsRecalculatingAll] = useState(false);

  const handleRecalculateStockAll = async () => {
    if (!window.confirm('هل تريد إعادة احتساب ومزامنة أرصدة وتكاليف المخزون لجميع الأصناف بناءً على كافة الحركات والمستندات (بما في ذلك اعتمادات الاستيراد)؟')) return;
    setIsRecalculatingAll(true);
    try {
      await recalculateStock();
      await refreshData();
      queryClient.invalidateQueries();
      refresh();
      showToast('تمت إعادة احتساب وتحديث أرصدة وتكاليف جميع الأصناف بنجاح ✅', 'success');
    } catch (err) {
      showToast('فشل إعادة الاحتساب: ' + err.message, 'error');
    } finally {
      setIsRecalculatingAll(false);
    }
  };

  const handleAddCategory = () => {
    setCategoryFormData({ id: '', name: '', image_url: '', description: '' });
    setIsCategoryModalOpen(true);
  };

  const handleEditCategory = () => {
    if (!formData.category_id) return;
    const category = categories.find(c => c.id === formData.category_id);
    if (!category) return;
    setCategoryFormData({ 
        id: category.id, 
        name: category.name, 
        image_url: (category as any).image_url || '',
        description: (category as any).description || ''
    });
    setIsCategoryModalOpen(true);
  };

  const handleDeleteCategory = async () => {
    if (!formData.category_id) return;

    if (!window.confirm('هل أنت متأكد من حذف هذا التصنيف؟')) return;

    if (currentUser?.role === 'demo') {
        showToast('تم حذف التصنيف بنجاح (محاكاة)', 'success'); // Use handleError for consistency
        setFormData(prev => ({ ...prev, category_id: null }));
        return;
    }

    try {
        const { error } = await supabase.from('item_categories').delete().eq('id', formData.category_id);
        if (error) throw error;
        // Use handleError for consistency
        showToast('تم حذف التصنيف بنجاح', 'success');
        setFormData(prev => ({ ...prev, category_id: null }));
        await refreshData();
    } catch (error) {
        showToast('فشل حذف التصنيف (قد يكون مرتبطاً بمنتجات): ' + error.message, 'error');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // 1. التحقق باستخدام Zod مع تنظيف القيم الرقمية
    const validationData = {
        name: formData.name,
        sku: formData.sku || undefined,
        unit: formData.unit,
        product_type: formData.product_type,
        purchase_price: Number(formData.purchase_price) || 0,
        sales_price: Number(formData.sales_price) || 0,
        inventory_account_id: formData.inventory_account_id || undefined,
        cogs_account_id: formData.cogs_account_id || undefined,
        sales_account_id: formData.sales_account_id || undefined,
        labor_cost: Number(formData.labor_cost) || 0,
        overhead_cost: Number(formData.overhead_cost) || 0,
    };

    const validationResult = createProductSchema.safeParse(validationData);
    if (!validationResult.success) {
        showToast(validationResult.error.issues[0].message, 'warning');
        return;
    }

    // التحقق الصارم من الحسابات
    if (formData.product_type === 'STOCK') {
      if (!formData.inventory_account_id || !formData.cogs_account_id || !formData.sales_account_id) { // Use handleError for consistency
        showToast('خطأ محاسبي: يجب تحديد جميع الحسابات (المخزون, التكلفة, المبيعات) للأصناف المخزنية.', 'error');
        return;
      }
    } else if (formData.product_type === 'RAW_MATERIAL' || formData.product_type === 'INTERMEDIATE_PRODUCT') {
      if (!formData.inventory_account_id) {
        showToast('خطأ محاسبي: يجب تحديد حساب المخزون للمواد الخام والأصناف الوسيطة.', 'error');
        return;
      }
    }

    // ملاحظة: التحقق من سعر البيع >= سعر الشراء يتم الآن عبر Zod Schema

    if (currentUser?.role === 'demo') {
        showToast('تم حفظ الصنف بنجاح وتوجيهه محاسبياً ✅ (محاكاة)', 'success');
        setIsModalOpen(false); // Use handleError for consistency
        return;
    }

    try {
      const orgId = currentSelectedOrgId || (currentUser as any)?.organization_id || (currentUser as any)?.user_metadata?.org_id;

      if (editingId) {
        // تحديث صنف موجود (تحديث عادي)
        if (!can('products', 'update')) {
            showToast('ليس لديك صلاحية تعديل المنتجات', 'error');
            return;
        } // Use handleError for consistency
        const itemData = {
            name: formData.name,
            sku: (formData.sku?.trim()) || generateUniqueSku(),
            barcode: formData.barcode || null,
            description: formData.description || null,
            unit: formData.unit,
            sales_price: formData.sales_price,
            base_uom_id: formData.base_uom_id || null,
            purchase_uom_id: formData.purchase_uom_id || null,
            sale_uom_id: formData.sale_uom_id || null,
            purchase_price: formData.purchase_price,
            product_type: formData.product_type,
            inventory_account_id: (formData.product_type === 'STOCK' || formData.product_type === 'MANUFACTURED' || formData.product_type === 'RAW_MATERIAL' || formData.product_type === 'INTERMEDIATE_PRODUCT') ? formData.inventory_account_id : null,
            cogs_account_id: (formData.product_type === 'STOCK' || formData.product_type === 'MANUFACTURED' || formData.product_type === 'RAW_MATERIAL' || formData.product_type === 'INTERMEDIATE_PRODUCT') ? formData.cogs_account_id : null,
            sales_account_id: formData.sales_account_id,
            image_url: formData.image_url,
            organization_id: orgId,
            category_id: formData.category_id || null,
            is_active: true,
            requires_serial: formData.requires_serial,
            min_stock_level: formData.min_stock_level,
            expiry_date: formData.expiry_date || null,
            offer_price: formData.offer_price || null,
            offer_start_date: formData.offer_start_date || null,
            offer_end_date: formData.offer_end_date || null,
            offer_max_qty: formData.offer_max_qty || null,
            available_modifiers: formData.available_modifiers || [],
            item_type: formData.product_type === 'INTERMEDIATE_PRODUCT' ? 'STOCK' : formData.product_type,
            mfg_type: formData.product_type === 'RAW_MATERIAL' ? 'raw' : 
                      formData.product_type === 'MANUFACTURED' ? 'standard' : 
                      formData.product_type === 'INTERMEDIATE_PRODUCT' ? 'intermediate' : null,
            labor_cost: formData.labor_cost || 0,
            overhead_cost: formData.overhead_cost || 0,
            is_overhead_percentage: formData.is_overhead_percentage || false,
            // حقول الهايبر ماركت
            barcode2: formData.barcode2 || null,
            is_scale_item: formData.is_scale_item || false,
            plu_number: formData.plu_number || null,
            scale_prefix: formData.scale_prefix || null,
            shelf_location: formData.shelf_location || null,
            brand: formData.brand || null,
            country_of_origin: formData.country_of_origin || null,
            age_restricted: formData.age_restricted || false,
            tax_rate_override: formData.tax_rate_override || null,
            unit_barcodes: formData.unit_barcodes || [],
            // حدود التسعير والمخزون المتقدمة
            min_sales_price: Number(formData.min_sales_price) || 0,
            max_stock_level: Number(formData.max_stock_level) || 0,
            wholesale_price: Number(formData.wholesale_price) || 0,
            half_wholesale_price: Number(formData.half_wholesale_price) || 0,
            ...(hasSupplierColumn ? { supplier_id: formData.supplier_id || null } : {}),
            // بيانات الفاتورة الإلكترونية
            ...(hasEtaColumns ? {
              item_code_type: formData.item_code_type || 'EGS',
              egs_code: formData.egs_code || null,
              eta_unit_code: formData.eta_unit_code || null,
            } : {}),
        };
        await updateProduct(editingId, itemData);

        const isPhysicalStock = formData.product_type === 'STOCK' || formData.product_type === 'RAW_MATERIAL' || formData.product_type === 'MANUFACTURED';
        const hasOpeningChanged = Number(formData.opening_stock || 0) !== initialOpeningStock || (formData.opening_warehouse_id && formData.opening_warehouse_id !== initialOpeningWarehouseId);

        // إنشاء / تحديث الرصيد الافتتاحي والقيد للصنف المعدل فقط إذا قام المستخدم بتعديل الرصيد الافتتاحي فعلياً
        if (isPhysicalStock && hasOpeningChanged && formData.opening_stock !== undefined) {
            // حذف أي رصيد افتتاحي سابق أو قيد مرتبط بهذا الصنف لتجنب التكرار
            await supabase.from('opening_inventories').delete().eq('product_id', editingId);
            await supabase.from('journal_entries').delete().eq('organization_id', orgId).like('reference', `OP-PROD-%${editingId.slice(0, 8)}%`);

            if (Number(formData.opening_stock) > 0) {
                let targetWarehouseId = formData.opening_warehouse_id || (warehouses.length > 0 ? warehouses[0].id : null);
                if (!targetWarehouseId && orgId) {
                    const { data: whList } = await supabase.from('warehouses').select('id').eq('organization_id', orgId).limit(1);
                    targetWarehouseId = whList?.[0]?.id || null;
                }
                if (targetWarehouseId) {
                    const { error: opInvErr } = await supabase.from('opening_inventories').insert({
                        product_id: editingId,
                        warehouse_id: targetWarehouseId,
                        quantity: Number(formData.opening_stock),
                        cost: Number(formData.purchase_price) || 0,
                        organization_id: orgId
                    });
                    if (opInvErr) {
                        logger.error("Error creating opening inventory record:", opInvErr);
                        showToast('تعذر تسجيل سجل الرصيد الافتتاحي للصنف في المستودع: ' + opInvErr.message, 'warning');
                    }
                }

                // إنشاء القيد المحاسبي
                const totalValue = Number(formData.opening_stock) * (Number(formData.purchase_price) || 0);
                const openingEquityAcc = getSystemAccount('OPENING_BALANCES') || 
                                         getSystemAccount('RETAINED_EARNINGS') || 
                                         contextAccounts.find(a => a.code === '3999' || a.code === '313' || a.code?.startsWith('39') || a.code?.startsWith('300') || a.name?.includes('أرصدة افتتاحية') || a.name?.includes('افتتاحي'));
                const equityAccId = openingEquityAcc?.id;

                const defaultRawAcc = getSystemAccount('INVENTORY_RAW_MATERIALS')?.id;
                const defaultFinishedAcc = getSystemAccount('INVENTORY_FINISHED_GOODS')?.id || getSystemAccount('INVENTORY')?.id;
                const fallbackInvAcc = contextAccounts.find(a => a.code === '10302' || a.code === '1213' || a.code === '103' || a.code === '122' || a.code === '121' || a.name?.includes('مخزون') || a.name?.includes('بضائع'))?.id;

                const inventoryAcc = formData.inventory_account_id || 
                                     (formData.product_type === 'RAW_MATERIAL' ? (defaultRawAcc || defaultFinishedAcc || fallbackInvAcc) : (defaultFinishedAcc || fallbackInvAcc));

                if (totalValue > 0 && inventoryAcc && equityAccId) {
                     const ref = `OP-PROD-${editingId.slice(0, 8)}-${Date.now().toString().slice(-4)}`;
                     const lineDesc = formData.product_type === 'RAW_MATERIAL' 
                         ? `مخزون مواد خام افتتاحي - ${formData.name}` 
                         : formData.product_type === 'MANUFACTURED'
                         ? `مخزون إنتاج تام افتتاحي - ${formData.name}`
                         : formData.product_type === 'INTERMEDIATE_PRODUCT'
                         ? `مخزون إنتاج وسيط / تحت التشغيل افتتاحي - ${formData.name}`
                         : `مخزون افتتاحي - ${formData.name}`;

                     await addEntry({
                          date: new Date().toISOString().split('T')[0],
                          description: `رصيد افتتاحي - ${formData.name}`.substring(0, 255),
                          reference: ref,
                          status: 'posted',
                          p_org_id: orgId,
                          lines: [
                              { accountId: inventoryAcc, debit: totalValue, credit: 0, description: lineDesc },
                              { accountId: equityAccId, debit: 0, credit: totalValue, description: `أرصدة افتتاحية - ${formData.name}` }
                          ]
                     });
                }
            }

            // إعادة احتساب المخزون للصنف المعدل
            try {
              await recalculateStock(editingId);
            } catch (e) {
              logger.error('Failed to recalculate stock', e);
            }

            if (orgId) {
              try {
                await supabase.rpc('recalculate_all_system_balances', { p_org_id: orgId });
              } catch (e) {
                logger.error('Failed to recalculate balances', e);
              }
            }

            await refreshData();
        }
      } else {
        if (!can('products', 'create')) {
            showToast('ليس لديك صلاحية إضافة منتجات', 'error');
            return;
        }
        
        const isPhysicalStock = formData.product_type === 'STOCK' || formData.product_type === 'RAW_MATERIAL' || formData.product_type === 'MANUFACTURED' || formData.product_type === 'INTERMEDIATE_PRODUCT';
        const productPayload = {
          name: formData.name,
          sku: (formData.sku?.trim()) || generateUniqueSku(),
          barcode: formData.barcode || null,
          description: formData.description || null,
          unit: formData.unit,
          base_uom_id: formData.base_uom_id || null,
          purchase_uom_id: formData.purchase_uom_id || null,
          sale_uom_id: formData.sale_uom_id || null,
          sales_price: formData.sales_price,
          purchase_price: formData.purchase_price,
          cost: formData.purchase_price, // Set initial cost to purchase price
          stock: isPhysicalStock ? formData.opening_stock : (formData.product_type === 'SERVICE' ? 999999 : 0),
          item_type: formData.product_type === 'INTERMEDIATE_PRODUCT' ? 'STOCK' : formData.product_type,
          product_type: formData.product_type,
          inventory_account_id: isPhysicalStock ? formData.inventory_account_id : null,
          cogs_account_id: isPhysicalStock ? formData.cogs_account_id : null,
          sales_account_id: formData.sales_account_id || null,
          is_active: true,
          min_stock_level: formData.min_stock_level,
          category_id: formData.category_id || null,
          requires_serial: formData.requires_serial,
          expiry_date: formData.expiry_date || null,
          offer_price: formData.offer_price || null,
          offer_start_date: formData.offer_start_date || null,
          offer_end_date: formData.offer_end_date || null,
          offer_max_qty: formData.offer_max_qty || null,
          available_modifiers: formData.available_modifiers || [],
          labor_cost: formData.labor_cost || 0,
          overhead_cost: formData.overhead_cost || 0,
          is_overhead_percentage: formData.is_overhead_percentage || false,
          organization_id: orgId,
          // إضافة نوع التصنيع ليتوافق مع مديول التصنيع تلقائياً
          mfg_type: formData.product_type === 'RAW_MATERIAL' ? 'raw' : 
                    formData.product_type === 'MANUFACTURED' ? 'standard' : 
                    formData.product_type === 'INTERMEDIATE_PRODUCT' ? 'intermediate' : null,
          // حقول الهايبر ماركت
          barcode2: formData.barcode2 || null,
          is_scale_item: formData.is_scale_item || false,
          plu_number: formData.plu_number || null,
          scale_prefix: formData.scale_prefix || null,
          shelf_location: formData.shelf_location || null,
          brand: formData.brand || null,
          country_of_origin: formData.country_of_origin || null,
          age_restricted: formData.age_restricted || false,
          tax_rate_override: formData.tax_rate_override || null,
          unit_barcodes: formData.unit_barcodes || [],
          // حدود التسعير والمخزون المتقدمة
          min_sales_price: Number(formData.min_sales_price) || 0,
          max_stock_level: Number(formData.max_stock_level) || 0,
          wholesale_price: Number(formData.wholesale_price) || 0,
          half_wholesale_price: Number(formData.half_wholesale_price) || 0,
          ...(hasSupplierColumn ? { supplier_id: formData.supplier_id || null } : {}),
          // بيانات الفاتورة الإلكترونية
          ...(hasEtaColumns ? {
            item_code_type: formData.item_code_type || 'EGS',
            egs_code: formData.egs_code || null,
            eta_unit_code: formData.eta_unit_code || null,
          } : {}),
        };

        const newProduct = await addProduct(productPayload as any); // Use handleError for consistency

        // إنشاء الرصيد الافتتاحي والقيد للمنتجات المخزنية والمواد الخام
        if (newProduct && isPhysicalStock && Number(formData.opening_stock) > 0) {
            let targetWarehouseId = formData.opening_warehouse_id || (warehouses.length > 0 ? warehouses[0].id : null);
            if (!targetWarehouseId && orgId) {
                const { data: whList } = await supabase.from('warehouses').select('id').eq('organization_id', orgId).limit(1);
                targetWarehouseId = whList?.[0]?.id || null;
            }
            if (targetWarehouseId) {
                const { error: opInvErr } = await supabase.from('opening_inventories').insert({
                    product_id: newProduct.id,
                    warehouse_id: targetWarehouseId,
                    quantity: Number(formData.opening_stock),
                    cost: Number(formData.purchase_price) || 0,
                    organization_id: orgId
                });
                if (opInvErr) {
                    logger.error("Error creating opening inventory record:", opInvErr);
                    showToast('تعذر تسجيل سجل الرصيد الافتتاحي للصنف في المستودع: ' + opInvErr.message, 'warning');
                }
            }
            
            // إنشاء القيد المحاسبي لضمان ظهوره في دفتر اليومية وميزان المراجعة
            const totalValue = Number(formData.opening_stock) * (Number(formData.purchase_price) || 0);
            const openingEquityAcc = getSystemAccount('OPENING_BALANCES') || 
                                     getSystemAccount('RETAINED_EARNINGS') || 
                                     contextAccounts.find(a => a.code === '3999' || a.code === '313' || a.code?.startsWith('39') || a.code?.startsWith('300') || a.name?.includes('أرصدة افتتاحية') || a.name?.includes('افتتاحي'));
            const equityAccId = openingEquityAcc?.id;

            const defaultRawAcc = getSystemAccount('INVENTORY_RAW_MATERIALS')?.id;
            const defaultFinishedAcc = getSystemAccount('INVENTORY_FINISHED_GOODS')?.id || getSystemAccount('INVENTORY')?.id;
            const fallbackInvAcc = contextAccounts.find(a => a.code === '10302' || a.code === '1213' || a.code === '103' || a.code === '122' || a.code === '121' || a.name?.includes('مخزون') || a.name?.includes('بضائع'))?.id;

            const inventoryAcc = formData.inventory_account_id || 
                                 (formData.product_type === 'RAW_MATERIAL' ? (defaultRawAcc || defaultFinishedAcc || fallbackInvAcc) : (defaultFinishedAcc || fallbackInvAcc));

            if (totalValue > 0 && inventoryAcc && equityAccId) {
                 const ref = `OP-PROD-${Date.now().toString().slice(-8)}-${Math.floor(Math.random() * 1000)}`;
                 const lineDesc = formData.product_type === 'RAW_MATERIAL' 
                     ? `مخزون مواد خام افتتاحي - ${newProduct.name}` 
                     : formData.product_type === 'MANUFACTURED'
                     ? `مخزون إنتاج تام افتتاحي - ${newProduct.name}`
                     : formData.product_type === 'INTERMEDIATE_PRODUCT'
                     ? `مخزون إنتاج وسيط / تحت التشغيل افتتاحي - ${newProduct.name}`
                     : `مخزون افتتاحي - ${newProduct.name}`;

                 await addEntry({
                      date: new Date().toISOString().split('T')[0],
                      description: `رصيد افتتاحي - ${newProduct.name}`.substring(0, 255),
                      reference: ref,
                      status: 'posted',
                      p_org_id: orgId,
                      lines: [
                          { accountId: inventoryAcc, debit: totalValue, credit: 0, description: lineDesc },
                          { accountId: equityAccId, debit: 0, credit: totalValue, description: `أرصدة افتتاحية - ${newProduct.name}` }
                      ]
                 });
            }

            // إعادة احتساب المخزون للصنف الجديد
            try {
              await recalculateStock(newProduct.id);
            } catch (e) {
              logger.error('Failed to recalculate stock', e);
            }

            // إعادة احتساب أرصدة الحسابات الإجمالية للنظام
            if (orgId) {
              try {
                await supabase.rpc('recalculate_all_system_balances', { p_org_id: orgId });
              } catch (e) {
                logger.error('Failed to recalculate balances', e);
              }
            }

            // تحديث بيانات النظام المالية لظهور القيد فوراً في الواجهة
            await refreshData();
        }
        
        // تحديث حد الطلب بشكل منفصل لأن الدالة قد لا تدعمه بعد
        if (formData.min_stock_level > 0) { // Use handleError for consistency
             // نحتاج لمعرفة ID الصنف الجديد، لكن الدالة الحالية لا ترجعه بسهولة في هذا السياق
             // يمكن تجاهل هذا للجديد أو تحديث الدالة لاحقاً
        }
      }
      
      showToast('تم حفظ الصنف بنجاح وتوجيهه محاسبياً ✅', 'success');
      // تحديث قائمة الأصناف في الواجهة
      refresh();
      setIsModalOpen(false);
    } catch (error) {
      logger.error(error);
      showToast('فشل حفظ الصنف: ' + error.message, 'error');
    }
  };

  const handleDelete = async (id: string) => {
    if (!can('products', 'delete')) {
        showToast('ليس لديك صلاحية حذف المنتجات', 'error');
        return;
    }
    if (!window.confirm('هل أنت متأكد من حذف هذا الصنف؟ سيتم نقله إلى سلة المحذوفات.')) return;
    
    const reason = prompt("الرجاء إدخال سبب الحذف (إلزامي):");
    if (!reason) return;

    if (currentUser?.role === 'demo') {
        // --- تحسين الديمو: محاكاة الحذف --- // Use handleError for consistency
        // deleteDemoProduct(id); // استدعاء دالة من السياق لحذف المنتج
        showToast('تم حذف الصنف بنجاح (محاكاة)', 'success');
        await refreshData(); // تحديث الواجهة
        // في تطبيق حقيقي، ستستدعي دالة من السياق لحذف المنتج من الحالة
        // وللتبسيط هنا، سنقوم بتحديث البيانات لإعادة رسم القائمة
        return; 
    }

    try {
      // استخدام دالة الحذف من السياق لضمان الحذف الناعم وتسجيل النشاط
      await deleteProduct(id, reason); // Use handleError for consistency
      refresh(); // تحديث القائمة
    } catch (error) {
      logger.error(error);
      showToast('حدث خطأ أثناء الحذف: ' + error.message, 'error');
    }
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;
    
    if (currentUser?.role === 'demo') {
        showToast('رفع الصور غير متاح في النسخة التجريبية', 'warning');
        return;
    }

    const file = e.target.files[0];
    const fileExt = file.name.split('.').pop();
    const fileName = `${Math.random()}.${fileExt}`;
    const filePath = `${fileName}`;

    try {
      setUploading(true);
      const { error: uploadError } = await supabase.storage.from('product-images').upload(filePath, file);
      if (uploadError) throw uploadError;
      const { data } = supabase.storage.from('product-images').getPublicUrl(filePath); // Use handleError for consistency
      setFormData(prev => ({ ...prev, image_url: data.publicUrl }));
    } catch (error) {
      logger.error(error);
      showToast('فشل رفع الصورة: ' + error.message, 'error');
    } finally {
      setUploading(false);
    }
  };

  const handleRenewOffer = (item: Item) => {
      const today = new Date();
      let duration = 7 * 24 * 60 * 60 * 1000; // الافتراضي 7 أيام

      if (item.offer_start_date && item.offer_end_date) {
          const start = new Date(item.offer_start_date);
          const end = new Date(item.offer_end_date);
          const diff = end.getTime() - start.getTime(); // Use handleError for consistency
          if (diff > 0) duration = diff;
      }
      
      const newStart = today.toISOString().split('T')[0];
      const newEnd = new Date(today.getTime() + duration).toISOString().split('T')[0];

      setEditingId(item.id);
      setFormData({
        name: item.name,
        sku: item.sku || '',
        barcode: item.barcode || '',
        sales_price: item.sales_price || 0,
        description: (item as any).description || '',
        purchase_price: item.purchase_price || 0,
        unit: (item as any).unit || 'قطعة',
        base_uom_id: item.base_uom_id || '',
        purchase_uom_id: item.purchase_uom_id || '',
        sale_uom_id: item.sale_uom_id || '',
        product_type: item.product_type || 'STOCK',
        inventory_account_id: item.inventory_account_id || '',
        cogs_account_id: item.cogs_account_id || '',
        sales_account_id: item.sales_account_id || '',
        image_url: item.image_url || '',
        opening_stock: 0,
        min_stock_level: item.min_stock_level || 0,
        requires_serial: item.requires_serial,
        expiry_date: item.expiry_date || '',
        offer_price: item.offer_price || 0,
        offer_start_date: newStart,
        offer_end_date: newEnd,
        category_id: item.category_id || null,
        offer_max_qty: item.offer_max_qty || 0,
        available_modifiers: (item as any).available_modifiers || [],
        labor_cost: item.labor_cost || 0,
        overhead_cost: item.overhead_cost || 0,
        is_overhead_percentage: item.is_overhead_percentage || false,
        // حقول الهايبر ماركت
        barcode2: (item as any).barcode2 || '',
        is_scale_item: (item as any).is_scale_item || false,
        plu_number: (item as any).plu_number || 0,
        scale_prefix: (item as any).scale_prefix || '22',
        shelf_location: (item as any).shelf_location || '',
        brand: (item as any).brand || '',
        country_of_origin: (item as any).country_of_origin || '',
        age_restricted: (item as any).age_restricted || false,
        tax_rate_override: (item as any).tax_rate_override || 0,
        unit_barcodes: Array.isArray((item as any).unit_barcodes) ? (item as any).unit_barcodes : [],
        // حدود التسعير والمخزون المتقدمة
        min_sales_price: Number((item as any).min_sales_price || 0),
        max_stock_level: Number((item as any).max_stock_level || 0),
        wholesale_price: Number((item as any).wholesale_price || 0),
        half_wholesale_price: Number((item as any).half_wholesale_price || 0),
        supplier_id: (item as any).supplier_id || null,
        // بيانات الفاتورة الإلكترونية
        item_code_type: (item as any).item_code_type || 'EGS',
        egs_code: (item as any).egs_code || '',
        eta_unit_code: (item as any).eta_unit_code || '',
      });
      setIsModalOpen(true);
  };

  const handlePrintOfferBarcode = (item: Item) => printOfferBarcode(item);
  const handlePrintBarcode = (item: Item) => printBarcode(item);
  const handleBulkPrintBarcodes = () => {
    if (selectedIds.size === 0) return;
    printBulkBarcodes((items as Item[]).filter(i => selectedIds.has(i.id)));
  };


  const toggleSelection = (id: string) => {
    const newSet = new Set(selectedIds);
    if (newSet.has(id)) {
      newSet.delete(id);
    } else {
      newSet.add(id);
    }
    setSelectedIds(newSet);
  };

  const handleSelectAll = () => {
    if (selectedIds.size === items.length && items.length > 0) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(items.map(i => i.id)));
    }
  };

  const handleBulkCategoryChange = async (categoryId: string) => {
    if (!categoryId || selectedIds.size === 0) {
        showToast('الرجاء اختيار تصنيف وأصناف أولاً.', 'warning');
        return;
    }
    if (!window.confirm(`هل أنت متأكد من تغيير تصنيف ${selectedIds.size} صنف؟`)) return;

    if (!can('products', 'update')) {
        showToast('ليس لديك صلاحية تعديل المنتجات', 'error');
        return;
    }

    setIsBulkSaving(true);
    try {
        const { error } = await supabase.from('products').update({ category_id: categoryId }).in('id', Array.from(selectedIds));
        if (error) throw error;
        showToast('تم تحديث تصنيف الأصناف بنجاح.', 'success');
        refresh();
        setSelectedIds(new Set());
    } catch (error) {
        showToast('فشل تحديث التصنيف: ' + error.message, 'error');
    } finally {
        setIsBulkSaving(false);
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in">
      <ProductToolbarAndFilters
        items={items}
        warehouses={warehouses}
        categories={categories}
        searchTerm={searchTerm}
        onSearchTermChange={setSearchTerm}
        showOffersOnly={showOffersOnly}
        onToggleOffersOnly={() => setShowOffersOnly(!showOffersOnly)}
        selectedCount={selectedIds.size}
        typeFilter={typeFilter}
        onTypeFilterChange={setTypeFilter}
        categoryFilter={categoryFilter}
        onCategoryFilterChange={setCategoryFilter}
        warehouseFilter={warehouseFilter}
        onWarehouseFilterChange={setWarehouseFilter}
        routingFilter={routingFilter}
        onRoutingFilterChange={setRoutingFilter}
        importWarehouseId={importWarehouseId}
        onImportWarehouseIdChange={setImportWarehouseId}
        isSyncingOpenings={isSyncingOpenings}
        isRecalculatingAll={isRecalculatingAll}
        isExporting={isExporting}
        isImporting={isImporting}
        isRecipeImporting={isRecipeImporting}
        isAssigningSkus={isAssigningSkus}
        isSyncingRawAccounts={isSyncingRawAccounts}
        isSyncingFinishedGoodsAccounts={isSyncingFinishedGoodsAccounts}
        rawItemsNeedingSyncCount={rawItemsNeedingSyncCount}
        finishedGoodsItemsNeedingSyncCount={finishedGoodsItemsNeedingSyncCount}
        onOpenConsumptionModal={() => setIsConsumptionModalOpen(true)}
        onSyncMissingOpeningEntries={handleSyncMissingOpeningEntries}
        onRecalculateStockAll={handleRecalculateStockAll}
        onExportExcel={handleExportExcel}
        onExportScalePLU={handleExportScalePLU}
        onDownloadTemplate={handleDownloadTemplate}
        onFileUpload={handleFileUpload}
        onOpenExcelPriceUpdateModal={() => setIsExcelPriceUpdateModalOpen(true)}
        onRecipeFileUpload={handleRecipeFileUpload}
        onDownloadRecipeTemplate={handleDownloadRecipeTemplate}
        onAutoAssignMissingSkus={handleAutoAssignMissingSkus}
        onSyncRawMaterialAccounts={handleSyncRawMaterialAccounts}
        onSyncFinishedGoodsAccounts={handleSyncFinishedGoodsAccounts}
        onOpenNewProductModal={() => handleOpenModal()}
        onBulkCategoryChange={handleBulkCategoryChange}
        onOpenBulkOfferModal={() => setIsBulkOfferModalOpen(true)}
        onOpenBulkPriceUpdateModal={() => setIsBulkPriceUpdateModalOpen(true)}
        onBulkPrintBarcodes={handleBulkPrintBarcodes}
      />

      <ProductsTable
        items={items}
        selectedIds={selectedIds}
        categories={categories}
        suppliers={suppliers}
        warehouses={warehouses}
        warehouseFilter={warehouseFilter}
        routingsMap={routingsMap}
        reservedStock={reservedStock}
        page={page}
        totalPages={totalPages}
        totalCount={totalCount}
        loading={loading}
        onSelectAll={handleSelectAll}
        onToggleSelection={toggleSelection}
        onNavigateToRouting={(productId) => navigate(`/mfg/routing-bom?productId=${productId}`)}
        onPrintOfferBarcode={handlePrintOfferBarcode}
        onRenewOffer={handleRenewOffer}
        onOpenRecipeTarget={setRecipeTarget}
        onOpenModifierTarget={setModifierTarget}
        onPrintBarcode={handlePrintBarcode}
        onEditItem={(item) => handleOpenModal(item)}
        onDeleteItem={handleDelete}
        onPageChange={setPage}
      />

      <ProductFormModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        editingId={editingId}
        formData={formData}
        setFormData={setFormData}
        handleSubmit={handleSubmit}
        handleImageUpload={handleImageUpload}
        uploading={uploading}
        categories={categories}
        warehouses={warehouses}
        uoms={uoms}
        suppliers={suppliers}
        hasSupplierColumn={hasSupplierColumn}
        hasEtaColumns={hasEtaColumns}
        settings={settings}
        accounts={accounts}
        recipeCost={recipeCost}
        existingOpenings={existingOpenings}
        generateUniqueSku={generateUniqueSku}
        generateUniqueBarcode={generateUniqueBarcode}
        handleAddCategory={handleAddCategory}
        handleEditCategory={handleEditCategory}
        handleDeleteCategory={handleDeleteCategory}
        getSystemAccount={getSystemAccount}
      />

      {/* Expected Consumption Modal */}
      <ExpectedConsumptionModal
        isOpen={isConsumptionModalOpen}
        onClose={() => setIsConsumptionModalOpen(false)}
        warehouses={warehouses}
        showToast={showToast}
      />

      {recipeTarget && (
        <RecipeManagement 
          productId={recipeTarget.id} 
          productName={recipeTarget.name} 
          onClose={() => setRecipeTarget(null)} 
        />
      )}

      {modifierTarget && (
        <ModifierManagement 
          productId={modifierTarget.id} 
          productName={modifierTarget.name} 
          onClose={() => setModifierTarget(null)} 
        />
      )}

      {/* Bulk Price Update Modal */}
      <BulkPriceUpdateModal
        isOpen={isBulkPriceUpdateModalOpen}
        onClose={() => setIsBulkPriceUpdateModalOpen(false)}
        selectedIds={selectedIds}
        setSelectedIds={setSelectedIds}
        items={items as Item[]}
        currentUser={currentUser}
        can={can}
        showToast={showToast}
        refresh={refresh}
      />

      {/* Bulk Offer Modal */}
      <BulkOfferModal
        isOpen={isBulkOfferModalOpen}
        onClose={() => setIsBulkOfferModalOpen(false)}
        selectedIds={selectedIds}
        setSelectedIds={setSelectedIds}
        items={items as Item[]}
        currentUser={currentUser}
        can={can}
        showToast={showToast}
        refresh={refresh}
      />

      {/* Category Modal */}
      <CategoryModal
        isOpen={isCategoryModalOpen}
        onClose={() => setIsCategoryModalOpen(false)}
        categoryFormData={categoryFormData}
        setCategoryFormData={setCategoryFormData}
        currentUser={currentUser}
        showToast={showToast}
        refreshData={refreshData}
      />

      {/* Auto-created Products Report Modal */}
      <AutoCreatedProductsModal
        isOpen={isReportModalOpen}
        onClose={() => setIsReportModalOpen(false)}
        products={autoCreatedProducts}
      />

      {/* Excel Price Update Modal */}
      <ExcelPriceUpdateModal
        isOpen={isExcelPriceUpdateModalOpen}
        onClose={() => setIsExcelPriceUpdateModalOpen(false)}
        targetOrgId={targetOrgId}
        currentUser={currentUser}
        queryClient={queryClient}
        refreshData={refreshData}
        refresh={refresh}
        showToast={toastFn}
      />
    </div>
  );
};

export default ProductManager;

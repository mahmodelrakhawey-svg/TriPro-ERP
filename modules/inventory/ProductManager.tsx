import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Package, Search, Plus, Edit, Trash2, Save, X, Barcode, Scale, Image as ImageIcon, Upload, AlertTriangle, Lock, Percent, RefreshCw, CheckSquare, Square, Tag, Download, Loader2, ChevronLeft, ChevronRight, FileSpreadsheet, UtensilsCrossed, Zap, PlusCircle, Layers, PackageOpen, Sparkles } from 'lucide-react';
import { supabase } from '../../supabaseClient';
import { useAccounting } from '../../context/AccountingContext';
import { useToast } from '../../context/ToastContext';
import { useQueryClient } from '@tanstack/react-query';
import { usePagination } from '../../components/usePagination';
import { useNavigate } from 'react-router-dom';
import RecipeManagement from '../restaurant/components/Management/RecipeManagement';
import SearchableSelect from '../../components/SearchableSelect'; // Import the new component
import { ModifierManagement } from '../restaurant/components/Management/ModifierManagement';
import { z } from 'zod';
import { createProductSchema, bulkOfferSchema, bulkPriceUpdateSchema } from '../../utils/validationSchemas';
import { getCurrencySymbol } from '../../utils/constants';
import { BulkPriceUpdateModal } from './components/BulkPriceUpdateModal';
import { BulkOfferModal } from './components/BulkOfferModal';
import { CategoryModal } from './components/CategoryModal';
import { AutoCreatedProductsModal } from './components/AutoCreatedProductsModal';
import { ExpectedConsumptionModal } from './components/ExpectedConsumptionModal';
import { ProductFormModal, ProductFormData } from './components/ProductFormModal';
export type { ProductFormData };
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
  
  // نقلنا تعريفات الحالة للأعلى لمنع خطأ TS2448 (Used before declaration)
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [uoms, setUoms] = useState<any[]>([]);
  
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [showOffersOnly, setShowOffersOnly] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState('all');
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
        data.forEach((r: any) => {
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
      console.warn('Error fetching routings for products filter:', err);
    }
  }, [currentSelectedOrgId, currentUser]);

  useEffect(() => {
    fetchOrgRoutings();
  }, [fetchOrgRoutings]);

  // إعداد استعلام البيانات
  const queryModifier = useCallback((query: any) => {
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
    const fetchUoms = async () => {
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
      let query = supabase.from('uoms').select('*');
      if (orgId) query = query.eq('organization_id', orgId);
      const { data } = await query.order('name');
      if (data) setUoms(data);
    };
    if (isModalOpen) fetchUoms();
  }, [isModalOpen, currentUser]);

  // في وضع الديمو، نستخدم المنتجات من السياق (الوهمية)
  const items = currentUser?.role === 'demo' 
    ? contextProducts.filter(i => {
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
        data?.forEach((item: any) => {
          if (item.product_id) {
            reserved[item.product_id] = (reserved[item.product_id] || 0) + Number(item.quantity);
          }
        });
        setReservedStock(reserved);
      } catch (error) {
        console.error("Error fetching reserved stock:", error);
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
    const missing = (items || []).filter(p => !p.sku || !p.sku.trim());
    if (missing.length === 0) {
      showToast('جميع الأصناف المعروضة تحتوي بالفعل على كود (SKU)', 'info');
      return;
    }

    if (!window.confirm(`هل تريد توليد وتعيين أكواد SKU تلقائية لـ (${missing.length}) صنف لا يمتلك كود حالياً؟`)) {
      return;
    }

    setIsAssigningSkus(true);
    try {
      const existingSkus = new Set(
        (items || []).map(p => (p.sku || '').trim().toUpperCase()).filter(Boolean)
      );
      let seq = (items || []).length + 1;
      let updatedCount = 0;

      for (const prod of missing) {
        let candidate = `SKU-${String(seq).padStart(5, '0')}`;
        while (existingSkus.has(candidate.toUpperCase())) {
          seq++;
          candidate = `SKU-${String(seq).padStart(5, '0')}`;
        }
        existingSkus.add(candidate.toUpperCase());
        seq++;

        const { error } = await supabase
          .from('products')
          .update({ sku: candidate })
          .eq('id', prod.id);

        if (!error) {
          updatedCount++;
        }
      }

      await refresh();
      await refreshData();
      showToast(`تم تعيين وتوليد أكواد SKU بنجاح لـ ${updatedCount} صنف ✅`, 'success');
    } catch (err: any) {
      showToast('خطأ أثناء تعيين الأكواد: ' + err.message, 'error');
    } finally {
      setIsAssigningSkus(false);
    }
  };

  const [isSyncingRawAccounts, setIsSyncingRawAccounts] = useState(false);
  const [isSyncingFinishedGoodsAccounts, setIsSyncingFinishedGoodsAccounts] = useState(false);

  // 📦 حساب عدد أصناف المواد الخام التي ما زالت تتبع حساب المخزون العام وتحتاج توجيه
  const rawItemsNeedingSyncCount = useMemo(() => {
    const rawMaterialAcc = getSystemAccount('INVENTORY_RAW_MATERIALS')?.id || settings?.account_mappings?.INVENTORY_RAW_MATERIALS || '00bc8443-0ace-40ba-82c1-ce97f6a02e15';
    const generalInvAcc = getSystemAccount('INVENTORY')?.id || settings?.account_mappings?.INVENTORY || '5434d458-20fe-4641-bc0f-22b8ccba0de7';
    return (contextProducts || []).filter(p => 
      (p.product_type === 'RAW_MATERIAL' || (p as any).mfg_type === 'raw') &&
      p.inventory_account_id !== rawMaterialAcc &&
      (!p.inventory_account_id || p.inventory_account_id === generalInvAcc)
    ).length;
  }, [contextProducts, getSystemAccount, settings]);

  // 🍰 حساب عدد أصناف التورت والجاتوهات والحلويات الشرقية التي ما زالت تتبع حساب المخزون العام وتحتاج توجيه للإنتاج التام
  const finishedGoodsItemsNeedingSyncCount = useMemo(() => {
    const finishedGoodsAcc = getSystemAccount('INVENTORY_FINISHED_GOODS')?.id || settings?.account_mappings?.INVENTORY_FINISHED_GOODS || '90685bba-b765-4fe4-96a5-b3963a4ec085';
    const generalInvAcc = getSystemAccount('INVENTORY')?.id || settings?.account_mappings?.INVENTORY || '5434d458-20fe-4641-bc0f-22b8ccba0de7';
    const rawMaterialAcc = getSystemAccount('INVENTORY_RAW_MATERIALS')?.id || settings?.account_mappings?.INVENTORY_RAW_MATERIALS || '00bc8443-0ace-40ba-82c1-ce97f6a02e15';
    const finishedCatNames = ['التورتات الغربية الفاخرة', 'الجاتوهات والقطع', 'الحلويات الشرقية', 'الشيكولاتة الفاخرة والهدايا', 'الآيس كريم والمثلجات'];
    const finishedCatIds = new Set(categories.filter(c => finishedCatNames.includes(c.name)).map(c => c.id));

    return (contextProducts || []).filter(p => {
      const isTargetCategory = p.category_id && finishedCatIds.has(p.category_id);
      const isManufactured = p.product_type === 'MANUFACTURED' && isTargetCategory;
      const isWrongAccount = !p.inventory_account_id || p.inventory_account_id === generalInvAcc || p.inventory_account_id === rawMaterialAcc;
      return (isTargetCategory || isManufactured) && p.inventory_account_id !== finishedGoodsAcc && isWrongAccount;
    }).length;
  }, [contextProducts, categories, getSystemAccount, settings]);

  // 🔄 توجيه حسابات أصناف المواد الخام آلياً لحساب مخزون المواد الخام مع الحفاظ التام على التعديلات اليدوية
  const handleSyncRawMaterialAccounts = async () => {
    const rawMaterialAcc = getSystemAccount('INVENTORY_RAW_MATERIALS')?.id || settings?.account_mappings?.INVENTORY_RAW_MATERIALS || '00bc8443-0ace-40ba-82c1-ce97f6a02e15';
    const generalInvAcc = getSystemAccount('INVENTORY')?.id || settings?.account_mappings?.INVENTORY || '5434d458-20fe-4641-bc0f-22b8ccba0de7';

    if (!rawMaterialAcc) {
      showToast('لم يتم العثور على حساب مخزون المواد الخام في شجرة الحسابات أو الإعدادات', 'error');
      return;
    }

    const allProds = contextProducts || [];
    const candidates = allProds.filter(p => 
      (p.product_type === 'RAW_MATERIAL' || (p as any).mfg_type === 'raw') &&
      p.inventory_account_id !== rawMaterialAcc &&
      (!p.inventory_account_id || p.inventory_account_id === generalInvAcc)
    );

    const preserved = allProds.filter(p => 
      (p.product_type === 'RAW_MATERIAL' || (p as any).mfg_type === 'raw') &&
      p.inventory_account_id === rawMaterialAcc
    );

    if (candidates.length === 0) {
      showToast('جميع أصناف المواد الخام موجهة بالفعل لحساب مخزون المواد الخام بنجاح ✅', 'info');
      return;
    }

    const confirmMsg = `هل تريد توجيه (${candidates.length}) صنف مواد خام تتبع حساب المخزون العام حالياً إلى "حساب مخزون المواد الخام"؟\n\n🛡️ صمام الأمان: سيتم الحفاظ التام على الأصناف التي تم تعديلها وتخصيصها يدوياً (${preserved.length} صنف) دون أي مساس بها.`;

    if (!window.confirm(confirmMsg)) {
      return;
    }

    setIsSyncingRawAccounts(true);
    try {
      const candidateIds = candidates.map(p => p.id);
      let updatedTotal = 0;
      const chunkSize = 50;

      for (let i = 0; i < candidateIds.length; i += chunkSize) {
        const chunk = candidateIds.slice(i, i + chunkSize);
        const { error: upErr } = await supabase
          .from('products')
          .update({ 
            inventory_account_id: rawMaterialAcc,
            updated_at: new Date().toISOString()
          })
          .in('id', chunk);

        if (upErr) throw upErr;
        updatedTotal += chunk.length;
      }

      // تحديث التصنيفات الافتراضية للخامات لترتبط مستقبلاً بمخزون المواد الخام
      const orgId = targetOrgId || (currentUser as any)?.organization_id;
      if (orgId) {
        await supabase
          .from('item_categories')
          .update({ default_inventory_account_id: rawMaterialAcc })
          .eq('organization_id', orgId)
          .in('name', ['خامات الحلويات الأولية', 'خامات التعبئة والتغليف']);
      }

      await refresh();
      await refreshData();
      showToast(`تم بنجاح توجيه ${updatedTotal} صنف خام إلى حساب مخزون المواد الخام، والحفاظ الكامل على ${preserved.length} صنف معدلة يدوياً ✅`, 'success');
    } catch (err: any) {
      showToast('حدث خطأ أثناء تحديث الحسابات: ' + (err.message || err), 'error');
    } finally {
      setIsSyncingRawAccounts(false);
    }
  };

  // 🎂🔄 توجيه حسابات أصناف التورت والجاتوهات والشرقي آلياً لحساب مخزون الإنتاج التام (10302)
  const handleSyncFinishedGoodsAccounts = async () => {
    const finishedGoodsAcc = getSystemAccount('INVENTORY_FINISHED_GOODS')?.id || settings?.account_mappings?.INVENTORY_FINISHED_GOODS || '90685bba-b765-4fe4-96a5-b3963a4ec085';
    const generalInvAcc = getSystemAccount('INVENTORY')?.id || settings?.account_mappings?.INVENTORY || '5434d458-20fe-4641-bc0f-22b8ccba0de7';
    const rawMaterialAcc = getSystemAccount('INVENTORY_RAW_MATERIALS')?.id || settings?.account_mappings?.INVENTORY_RAW_MATERIALS || '00bc8443-0ace-40ba-82c1-ce97f6a02e15';

    if (!finishedGoodsAcc) {
      showToast('لم يتم العثور على حساب مخزون الإنتاج التام في شجرة الحسابات أو الإعدادات', 'error');
      return;
    }

    const finishedCatNames = ['التورتات الغربية الفاخرة', 'الجاتوهات والقطع', 'الحلويات الشرقية', 'الشيكولاتة الفاخرة والهدايا', 'الآيس كريم والمثلجات'];
    const finishedCatIds = new Set(categories.filter(c => finishedCatNames.includes(c.name)).map(c => c.id));

    const allProds = contextProducts || [];
    const candidates = allProds.filter(p => {
      const isTargetCategory = p.category_id && finishedCatIds.has(p.category_id);
      const isManufactured = p.product_type === 'MANUFACTURED' && isTargetCategory;
      const isWrongAccount = !p.inventory_account_id || p.inventory_account_id === generalInvAcc || p.inventory_account_id === rawMaterialAcc;
      return (isTargetCategory || isManufactured) && p.inventory_account_id !== finishedGoodsAcc && isWrongAccount;
    });

    const preserved = allProds.filter(p => {
      const isTargetCategory = p.category_id && finishedCatIds.has(p.category_id);
      return isTargetCategory && p.inventory_account_id === finishedGoodsAcc;
    });

    if (candidates.length === 0) {
      showToast('جميع أصناف التورت والجاتوهات والحلويات الشرقية موجهة بالفعل لحساب مخزون الإنتاج التام بنجاح ✅', 'info');
      return;
    }

    const confirmMsg = `هل تريد توجيه (${candidates.length}) صنف من أصناف (التورت، الجاتوهات، والحلويات الشرقية) إلى "حساب مخزون الإنتاج التام (10302)"؟\n\n🛡️ صمام الأمان: سيتم الحفاظ التام على الأصناف المضبوطة مسبقاً (${preserved.length} صنف) دون أي مساس بها.`;

    if (!window.confirm(confirmMsg)) {
      return;
    }

    setIsSyncingFinishedGoodsAccounts(true);
    try {
      const candidateIds = candidates.map(p => p.id);
      let updatedTotal = 0;
      const chunkSize = 50;

      for (let i = 0; i < candidateIds.length; i += chunkSize) {
        const chunk = candidateIds.slice(i, i + chunkSize);
        const { error: upErr } = await supabase
          .from('products')
          .update({ 
            inventory_account_id: finishedGoodsAcc,
            updated_at: new Date().toISOString()
          })
          .in('id', chunk);

        if (upErr) throw upErr;
        updatedTotal += chunk.length;
      }

      // تحديث التصنيفات الافتراضية للإنتاج التام لترتبط مستقبلاً بمخزون الإنتاج التام 10302
      const orgId = targetOrgId || (currentUser as any)?.organization_id;
      if (orgId) {
        await supabase
          .from('item_categories')
          .update({ 
            default_inventory_account_id: finishedGoodsAcc,
            updated_at: new Date().toISOString()
          })
          .eq('organization_id', orgId)
          .in('name', finishedCatNames);
      }

      await refresh();
      await refreshData();
      showToast(`تم بنجاح توجيه ${updatedTotal} صنف (تورت وجاتوهات وشرقي) إلى حساب مخزون الإنتاج التام (10302) وتثبيت حساب التصنيفات ✅`, 'success');
    } catch (err: any) {
      showToast('حدث خطأ أثناء تحديث الحسابات: ' + (err.message || err), 'error');
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
        console.warn('Could not fetch existing opening stock:', e);
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
    exportProductsToExcel({
      targetOrgId,
      categories,
      queryModifier,
      showToast,
      setIsExporting,
    });
  };

  // ⚖️ تصدير ملف الموازين الإلكترونية (Scale PLU Exporter)
  const handleExportScalePLU = () => exportScalePLUToExcel(showToast);

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
      showToast,
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
      showToast,
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
      // 1. جلب جميع الأصناف المخزنية
      const { data: allProds, error: prodsErr } = await supabase
        .from('products')
        .select('*')
        .eq('organization_id', orgId)
        .in('item_type', ['STOCK', 'RAW_MATERIAL']);

      if (prodsErr) throw prodsErr;

      if (!allProds || allProds.length === 0) {
        showToast('لا توجد أصناف مخزنية في هذه المنظمة.', 'info');
        setIsSyncingOpenings(false);
        return;
      }

      // 2. جلب جميع قيود اليومية الخاصة بالأرصدة الافتتاحية للمنظمة
      const { data: existingEntries, error: entErr } = await supabase
        .from('journal_entries')
        .select('id, description, reference, related_document_id, related_document_type')
        .eq('organization_id', orgId);

      if (entErr) throw entErr;

      // 3. جلب حسابات النظام
      const defaultInventory = getSystemAccount('INVENTORY_FINISHED_GOODS')?.id || getSystemAccount('INVENTORY')?.id || contextAccounts.find(a => a.code === '10302' || a.code === '1213' || a.code === '103' || a.name?.includes('مخزون'))?.id;
      const rawMaterialAcc = getSystemAccount('INVENTORY_RAW_MATERIALS')?.id || contextAccounts.find(a => a.code === '10301' || a.code === '1211' || a.name?.includes('خامات'))?.id;
      const equityAcc = getSystemAccount('OPENING_BALANCES')?.id || 
                        getSystemAccount('RETAINED_EARNINGS')?.id || 
                        contextAccounts.find(a => a.code === '3999' || a.code === '313' || a.code?.startsWith('39') || a.code?.startsWith('300') || a.name?.includes('أرصدة افتتاحية') || a.name?.includes('افتتاحي'))?.id;

      if (!equityAcc) {
        throw new Error('لم يتم العثور على حساب الأرصدة الافتتاحية في الدليل المحاسبي (كود 3999 أو 313).');
      }

      const defaultWhId = warehouses.length > 0 ? warehouses[0].id : null;
      let createdCount = 0;
      const createdNames: string[] = [];

      for (const prod of allProds) {
        // فحص إذا كان للصنف قيد افتتاحي مسجل مسبقاً
        const hasEntry = existingEntries?.some(e => 
          e.related_document_id === prod.id ||
          (e.reference && e.reference.includes(prod.id.slice(-8))) ||
          (e.description && (e.description.includes('رصيد افتتاحي') || e.description.includes('افتتاحي')) && e.description.includes(prod.name))
        );

        if (!hasEntry) {
          const qty = Number(prod.stock) || Number(prod.opening_balance) || 0;
          const cost = Number(prod.purchase_price) || Number(prod.cost) || Number(prod.weighted_average_cost) || 0;
          const totalValue = qty * cost;

          if (qty > 0 && cost > 0 && totalValue > 0) {
            const itemInvAcc = prod.inventory_account_id || (prod.item_type === 'RAW_MATERIAL' ? (rawMaterialAcc || defaultInventory) : defaultInventory);
            
            if (itemInvAcc) {
              // أ. تسجيل في opening_inventories إذا لم يكن مسجلاً
              let targetWh = defaultWhId;
              if (!targetWh && orgId) {
                const { data: whList } = await supabase.from('warehouses').select('id').eq('organization_id', orgId).limit(1);
                targetWh = whList?.[0]?.id || null;
              }
              if (targetWh) {
                const { data: existingOp } = await supabase
                  .from('opening_inventories')
                  .select('id')
                  .eq('product_id', prod.id)
                  .maybeSingle();

                if (!existingOp) {
                  await supabase.from('opening_inventories').insert({
                    product_id: prod.id,
                    warehouse_id: targetWh,
                    quantity: qty,
                    cost: cost,
                    organization_id: orgId
                  });
                }
              }

              // ب. إنشاء القيد المحاسبي عبر addEntry
              const ref = `OP-PROD-${Date.now().toString().slice(-8)}-${Math.floor(Math.random() * 1000)}`;
              const lineDesc = prod.item_type === 'RAW_MATERIAL' 
                ? `مخزون مواد خام افتتاحي - ${prod.name}` 
                : `مخزون افتتاحي - ${prod.name}`;

              await addEntry({
                date: new Date().toISOString().split('T')[0],
                description: `رصيد افتتاحي - ${prod.name}`.substring(0, 255),
                reference: ref,
                status: 'posted',
                p_org_id: orgId,
                lines: [
                  { accountId: itemInvAcc, debit: totalValue, credit: 0, description: lineDesc },
                  { accountId: equityAcc, debit: 0, credit: totalValue, description: `أرصدة افتتاحية - ${prod.name}` }
                ]
              });
              createdCount++;
              createdNames.push(prod.name);
            }
          }
        }
      }

      if (createdCount > 0) {
        if (orgId) {
          try {
            await supabase.rpc('recalculate_all_system_balances', { p_org_id: orgId });
          } catch (e) {
            console.error('Failed to recalculate balances', e);
          }
        }
        await refreshData();
        refresh();
        showToast(`تم بنجاح توليد ${createdCount} قيد افتتاحي للأصناف: (${createdNames.join('، ')}) ✅`, 'success');
      } else {
        showToast('جميع الأصناف المسجلة لديها قيود افتتاحية بالفعل، أو أن التكلفة أو الرصيد صفر.', 'info');
      }
    } catch (err: any) {
      console.error(err);
      showToast('حدث خطأ أثناء توليد القيود الافتتاحية: ' + err.message, 'error');
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
    } catch (err: any) {
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
    } catch (error: any) {
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
                    if (opInvErr) console.error("Error creating opening inventory record:", opInvErr);
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
              console.error('Failed to recalculate stock', e);
            }

            if (orgId) {
              try {
                await supabase.rpc('recalculate_all_system_balances', { p_org_id: orgId });
              } catch (e) {
                console.error('Failed to recalculate balances', e);
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
                if (opInvErr) console.error("Error creating opening inventory record:", opInvErr);
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
              console.error('Failed to recalculate stock', e);
            }

            // إعادة احتساب أرصدة الحسابات الإجمالية للنظام
            if (orgId) {
              try {
                await supabase.rpc('recalculate_all_system_balances', { p_org_id: orgId });
              } catch (e) {
                console.error('Failed to recalculate balances', e);
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
    } catch (error: any) {
      console.error(error);
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
    } catch (error: any) {
      console.error(error);
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
    } catch (error: any) {
      console.error(error);
      showToast('فشل رفع الصورة: ' + error.message, 'error');
    } finally {
      setUploading(false);
    }
  };

  const isOfferActive = (item: Item) => {
      const today = new Date().toISOString().split('T')[0];
      return !!(item.offer_price && item.offer_price > 0 && 
             item.offer_start_date && item.offer_end_date && 
             today >= item.offer_start_date && today <= item.offer_end_date);
  };

  const isOfferExpired = (item: Item) => {
      const today = new Date().toISOString().split('T')[0];
      return !!(item.offer_price && item.offer_price > 0 && 
             item.offer_end_date && today > item.offer_end_date);
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
    } catch (error: any) {
        showToast('فشل تحديث التصنيف: ' + error.message, 'error');
    } finally {
        setIsBulkSaving(false);
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in">
      <div className="flex justify-between items-center flex-wrap gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
            <Package className="text-emerald-600" /> إدارة الأصناف (المنضبطة)
          </h2>
          <button 
            onClick={() => setIsConsumptionModalOpen(true)}
            className="mt-1 text-xs bg-indigo-50 text-indigo-600 px-2 py-1 rounded-full font-bold flex items-center gap-1 hover:bg-indigo-100 transition-all"
          >
            <Zap size={12} /> عرض الاستهلاك المتوقع من المسودات
          </button>
          <p className="text-slate-500">تعريف المنتجات وربطها بالحسابات المحاسبية</p>
        </div>
        <div className="flex gap-2 flex-wrap items-center">
            <button 
                onClick={handleSyncMissingOpeningEntries} 
                disabled={isSyncingOpenings}
                className="bg-amber-50 border border-amber-300 text-amber-800 px-3 py-2 rounded-lg flex items-center gap-1.5 hover:bg-amber-100 text-sm font-bold shadow-sm transition-all disabled:opacity-50" 
                title="توليد قيود الأرصدة الافتتاحية في دفتر اليومية لجميع الأصناف الحالية التي ليس لها قيد"
            >
                {isSyncingOpenings ? <Loader2 size={16} className="animate-spin text-amber-600" /> : <RefreshCw size={16} className="text-amber-600" />}
                <span>توليد القيود الافتتاحية</span>
            </button>
            <button 
                onClick={handleRecalculateStockAll} 
                disabled={isRecalculatingAll}
                className="bg-teal-50 border border-teal-300 text-teal-800 px-3 py-2 rounded-lg flex items-center gap-1.5 hover:bg-teal-100 text-sm font-bold shadow-sm transition-all disabled:opacity-50" 
                title="إعادة احتساب ومزامنة أرصدة المخزون وتكاليف جميع الأصناف من الحركات الفعلية"
            >
                {isRecalculatingAll ? <Loader2 size={16} className="animate-spin text-teal-600" /> : <RefreshCw size={16} className="text-teal-600" />}
                <span>إعادة احتساب الأرصدة</span>
            </button>
            <button 
                onClick={handleExportExcel} 
                disabled={isExporting}
                className="bg-blue-50 border border-blue-200 text-blue-700 px-3 py-2 rounded-lg flex items-center gap-2 hover:bg-blue-100 text-sm font-bold shadow-sm transition-all disabled:opacity-50" 
                title="تصدير القائمة الحالية بالكامل إلى Excel"
            >
                {isExporting ? <Loader2 size={16} className="animate-spin text-blue-600" /> : <FileSpreadsheet size={16} />}
                <span>{isExporting ? 'جاري التصدير...' : 'تصدير'}</span>
            </button>
            <button onClick={handleExportScalePLU} className="bg-purple-50 border border-purple-200 text-purple-700 px-3 py-2 rounded-lg flex items-center gap-2 hover:bg-purple-100 text-sm font-bold shadow-sm transition-all" title="تصدير ملف أكواد وأسعار الموازين الإلكترونية (PLU) لبرامج موازين الباركود">
                <Scale size={16} /> ملف الموازين (PLU)
            </button>
            <button onClick={handleDownloadTemplate} className="bg-white border border-slate-300 text-slate-600 px-3 py-2 rounded-lg flex items-center gap-2 hover:bg-slate-50 text-sm font-bold" title="تحميل نموذج Excel">
                <Download size={16} /> نموذج
            </button>
            <select
                value={importWarehouseId}
                onChange={(e) => setImportWarehouseId(e.target.value)}
                className="bg-white border border-slate-300 text-slate-600 px-2 py-2 rounded-lg text-sm font-bold outline-none focus:border-emerald-500"
                title="اختر المستودع الذي سيتم استيراد الأرصدة الافتتاحية إليه"
            >
                {warehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
            </select>
            <div className="relative">
                <input
                    type="file"
                    accept=".xlsx, .xls, .csv, .json"
                    onChange={handleFileUpload}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                    disabled={isImporting}
                />
                <button className="bg-emerald-50 border border-emerald-200 text-emerald-700 px-3 py-2 rounded-lg flex items-center gap-2 hover:bg-emerald-100 text-sm font-bold">
                    {isImporting ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />}
                    استيراد Excel
                </button>
            </div>
            <div className="relative">
                <input
                    type="file"
                    accept=".xlsx, .xls, .csv"
                    onChange={handleRecipeFileUpload}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                    disabled={isRecipeImporting}
                />
                <button className="bg-purple-50 border border-purple-200 text-purple-700 px-3 py-2 rounded-lg flex items-center gap-2 hover:bg-purple-100 text-sm font-bold">
                    {isRecipeImporting ? <Loader2 size={16} className="animate-spin" /> : <UtensilsCrossed size={16} />}
                    استيراد وصفات
                </button>
            </div>
            <button onClick={handleDownloadRecipeTemplate} className="bg-white border border-slate-300 text-slate-600 px-3 py-2 rounded-lg flex items-center gap-2 hover:bg-slate-50 text-sm font-bold" title="تحميل نموذج الوصفات">
                <Download size={16} /> نموذج الوصفات
            </button>
            {(items || []).some(p => !p.sku || !p.sku.trim()) && (
                <button 
                  onClick={handleAutoAssignMissingSkus}
                  disabled={isAssigningSkus}
                  className="bg-indigo-50 border border-indigo-200 text-indigo-700 px-3 py-2 rounded-lg flex items-center gap-1.5 hover:bg-indigo-100 text-sm font-bold animate-in fade-in"
                  title="توليد وتعيين أكواد SKU تلقائية لجميع الأصناف التي تفتقر لكود"
                >
                  {isAssigningSkus ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} className="text-indigo-600" />}
                  <span>توليد أكواد للأصناف الشاغرة ({(items || []).filter(p => !p.sku || !p.sku.trim()).length})</span>
                </button>
            )}
            <button 
              onClick={handleSyncRawMaterialAccounts}
              disabled={isSyncingRawAccounts}
              className="bg-amber-50 border border-amber-300 text-amber-800 px-3 py-2 rounded-lg flex items-center gap-1.5 hover:bg-amber-100 text-sm font-bold shadow-sm transition-all disabled:opacity-50 animate-in fade-in"
              title="توجيه أصناف المواد الخام إلى حساب مخزون المواد الخام (10301) مع الحفاظ على الأصناف المعدلة يدوياً"
            >
              {isSyncingRawAccounts ? (
                <Loader2 size={16} className="animate-spin text-amber-600" />
              ) : (
                <Layers size={16} className="text-amber-600" />
              )}
              <span>توجيه خامات المخزون (10301)</span>
              {rawItemsNeedingSyncCount > 0 && (
                <span className="bg-amber-200 text-amber-900 px-1.5 py-0.5 rounded-full text-xs font-black">
                  {rawItemsNeedingSyncCount}
                </span>
              )}
            </button>
            <button 
              onClick={handleSyncFinishedGoodsAccounts}
              disabled={isSyncingFinishedGoodsAccounts}
              className="bg-emerald-50 border border-emerald-300 text-emerald-800 px-3 py-2 rounded-lg flex items-center gap-1.5 hover:bg-emerald-100 text-sm font-bold shadow-sm transition-all disabled:opacity-50 animate-in fade-in"
              title="توجيه أصناف التورت والجاتوهات والشرقي إلى حساب مخزون الإنتاج التام (10302)"
            >
              {isSyncingFinishedGoodsAccounts ? (
                <Loader2 size={16} className="animate-spin text-emerald-600" />
              ) : (
                <UtensilsCrossed size={16} className="text-emerald-600" />
              )}
              <span>توجيه الإنتاج التام (10302)</span>
              {finishedGoodsItemsNeedingSyncCount > 0 && (
                <span className="bg-emerald-200 text-emerald-900 px-1.5 py-0.5 rounded-full text-xs font-black">
                  {finishedGoodsItemsNeedingSyncCount}
                </span>
              )}
            </button>
            <button onClick={() => handleOpenModal()} className="bg-emerald-600 text-white px-6 py-2.5 rounded-lg hover:bg-emerald-700 flex items-center gap-2 font-bold shadow-lg">
              <Plus size={20} /> صنف جديد
            </button>
        </div>
      </div>

      <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200">
        <div className="flex gap-2">
            <div className="relative flex-1">
                <Search className="absolute right-3 top-3 text-slate-400" size={20} />
                <input 
                    type="text" 
                    placeholder="بحث باسم الصنف أو الكود (SKU)..." 
                    value={searchTerm}
                    onChange={e => setSearchTerm(e.target.value)}
                    className="w-full pr-10 pl-4 py-2.5 border rounded-lg focus:outline-none focus:border-emerald-500"
                />
            </div>
            <button 
                onClick={() => setShowOffersOnly(!showOffersOnly)}
                className={`px-4 py-2.5 rounded-lg border flex items-center gap-2 transition-colors font-bold ${showOffersOnly ? 'bg-yellow-50 border-yellow-200 text-yellow-700' : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50'}`}
            >
                <Percent size={18} />
                <span className="hidden md:inline">العروض</span>
            </button>
            {selectedIds.size > 0 && (
                <>
                    <select
                        onChange={(e) => handleBulkCategoryChange(e.target.value)}
                        className="bg-white border border-slate-300 text-slate-600 px-2 py-2.5 rounded-lg text-sm font-bold outline-none focus:border-purple-500"
                        title="تغيير تصنيف الأصناف المحددة"
                    >
                        <option value="">تغيير التصنيف...</option>
                        {categories.map(cat => (
                            <option key={cat.id} value={cat.id}>{cat.name} {(cat as any).description ? ` (${(cat as any).description})` : ''}</option>
                        ))}
                    </select>
                    <button onClick={() => setIsBulkOfferModalOpen(true)} className="bg-purple-600 text-white px-4 py-2.5 rounded-lg flex items-center gap-2 font-bold hover:bg-purple-700 animate-in zoom-in">
                        <Tag size={18} />
                        تطبيق عرض ({selectedIds.size})
                    </button>
                    <button onClick={() => setIsBulkPriceUpdateModalOpen(true)} className="bg-orange-600 text-white px-4 py-2.5 rounded-lg flex items-center gap-2 font-bold hover:bg-orange-700 animate-in zoom-in">
                        <RefreshCw size={18} />
                        تعديل الأسعار ({selectedIds.size})
                    </button>
                    <button onClick={handleBulkPrintBarcodes} className="bg-slate-800 text-white px-4 py-2.5 rounded-lg flex items-center gap-2 font-bold hover:bg-slate-900 animate-in zoom-in">
                        <Barcode size={18} />
                        طباعة باركود ({selectedIds.size})
                    </button>
                </>
            )}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-3 pt-3 border-t">
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">فلترة حسب نوع الصنف</label>
            <select 
                value={typeFilter}
                onChange={e => setTypeFilter(e.target.value)}
                className="w-full border rounded-lg p-2.5 bg-white text-xs font-bold text-slate-700 outline-none focus:ring-2 focus:ring-emerald-500"
            >
                <option value="all">-- كل أنواع الأصناف --</option>
                <option value="RAW_MATERIAL">🥩 مواد خام وأولية (RAW_MATERIAL)</option>
                <option value="MANUFACTURED">🍲 منتجات مصنعة / وجبات (MANUFACTURED)</option>
                <option value="INTERMEDIATE_PRODUCT">🍰 منتجات وسيطة / نصف مصنعة (INTERMEDIATE)</option>
                <option value="STOCK">📦 بضاعة مخزنية جاهزة (STOCK)</option>
                <option value="SERVICE">⚙️ خدمات (SERVICE)</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">فلترة حسب التصنيف</label>
            <select 
                value={categoryFilter}
                onChange={e => setCategoryFilter(e.target.value)}
                className="w-full border rounded-lg p-2.5 bg-white text-xs font-bold text-slate-700 outline-none focus:ring-2 focus:ring-emerald-500"
            >
                <option value="all">-- كل التصنيفات --</option>
                {categories.map(cat => <option key={cat.id} value={cat.id}>{cat.name}</option>)}
            </select>
          </div>
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-xs font-bold text-slate-700">مسار ومراحل التصنيع (BOM/Routing)</label>
              {routingFilter !== 'all' && (
                <button 
                  onClick={() => setRoutingFilter('all')}
                  className="text-[10px] text-red-600 hover:underline font-bold"
                >
                  إلغاء التصفية
                </button>
              )}
            </div>
            <select 
                value={routingFilter}
                onChange={e => setRoutingFilter(e.target.value as any)}
                className={`w-full border rounded-lg p-2.5 text-xs font-bold outline-none focus:ring-2 transition-all ${
                  routingFilter !== 'all'
                    ? 'bg-purple-50 border-purple-300 text-purple-900 focus:ring-purple-500'
                    : 'bg-white text-slate-700 focus:ring-emerald-500'
                }`}
            >
                <option value="all">-- كل حالات مسار الإنتاج --</option>
                <option value="has_routing_and_steps">✅ منتج مصنع له مسار ومراحل</option>
                <option value="no_routing">⚠️ منتج مصنع ليس له مسار تصنيعي</option>
                <option value="has_routing_no_steps">🔄 منتج مصنع له مسار بدون مراحل</option>
                <option value="has_any_routing">📋 كل المنتجات التي لها مسار</option>
            </select>
          </div>
        </div>
      </div>

      {routingFilter === 'no_routing' && (
        <div className="bg-rose-50 border border-rose-200 text-rose-800 p-3.5 rounded-xl flex items-center justify-between gap-3 text-xs font-bold animate-in fade-in">
          <div className="flex items-center gap-2">
            <AlertTriangle size={18} className="text-rose-600 shrink-0" />
            <span>يتم الآن عرض الأصناف المصنعة والوسيطة التي لم يتم إنشاء مسار إنتاج أو مراحل تشغيل لها بعد. يمكنك النقر على زر "بدون مسار تصنيعي" أمام أي صنف لبناء مساره ومراحله فوراً.</span>
          </div>
          <button 
            onClick={() => setRoutingFilter('all')}
            className="text-rose-700 hover:text-rose-900 underline shrink-0"
          >
            عرض كافة الأصناف
          </button>
        </div>
      )}

      {routingFilter === 'has_routing_and_steps' && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 p-3.5 rounded-xl flex items-center justify-between gap-3 text-xs font-bold animate-in fade-in">
          <div className="flex items-center gap-2">
            <Layers size={18} className="text-emerald-600 shrink-0" />
            <span>يتم الآن عرض الأصناف المصنعة والوسيطة الجاهزة للإنتاج (التي لها مسار تشغيل ومراحل إنتاج متكاملة).</span>
          </div>
          <button 
            onClick={() => setRoutingFilter('all')}
            className="text-emerald-700 hover:text-emerald-900 underline shrink-0"
          >
            عرض كافة الأصناف
          </button>
        </div>
      )}

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <table className="w-full text-right">
          <thead className="bg-slate-50 text-slate-600 font-bold text-sm border-b">
            <tr>
              <th className="p-4 w-10">
                  <button onClick={handleSelectAll} className="text-slate-400 hover:text-blue-600">
                      {selectedIds.size === items.length && items.length > 0 ? <CheckSquare size={20} /> : <Square size={20} />}
                  </button>
              </th>
              <th className="p-4 w-16">الصورة</th>
              <th className="p-4">اسم الصنف</th>
              <th className="p-4">التصنيف</th>
              <th className="p-4">النوع</th>
              <th className="p-4 text-center">الرصيد الحالي</th>
              <th className="p-4 text-center">المحجوز</th>
              <th className="p-4 text-center">الصلاحية</th>
              <th className="p-4">متوسط التكلفة</th>
              <th className="p-4">سعر البيع</th>
              <th className="p-4 text-center">إجراءات</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {items.map(item => {
              const effectiveType = item.product_type || (item as any).item_type || 'STOCK';
              return (
              <tr key={item.id} className="hover:bg-slate-50">
                <td className="p-4">
                    <button onClick={() => toggleSelection(item.id)} className={selectedIds.has(item.id) ? "text-blue-600" : "text-slate-300"}>
                        {selectedIds.has(item.id) ? <CheckSquare size={20} /> : <Square size={20} />}
                    </button>
                </td>
                <td className="p-4">
                  {item.image_url ? (
                    <img src={item.image_url} alt={item.name} className="w-10 h-10 object-cover rounded-lg border border-slate-200" />
                  ) : (
                    <div className="w-10 h-10 bg-slate-100 rounded-lg flex items-center justify-center text-slate-400"><ImageIcon size={16} /></div>
                  )}
                </td>
                <td className="p-4 font-bold text-slate-800">
                  <div className="flex items-center gap-2">
                    <span>{item.name}</span>
                    {isOfferActive(item) && (
                        <span className="inline-flex items-center gap-1 bg-red-100 text-red-600 text-[10px] px-2 py-0.5 rounded-full animate-pulse">
                            <Percent size={10} /> عرض خاص
                        </span>
                    )}
                  </div>
                  <div className="flex items-center flex-wrap gap-1.5 mt-1">
                    {item.sku ? (
                      <span className="inline-flex items-center gap-1 text-[11px] font-mono bg-indigo-50 text-indigo-700 font-bold px-2 py-0.5 rounded border border-indigo-100">
                        <span className="text-indigo-400 font-sans text-[10px]">كود:</span> {item.sku}
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-[10px] text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200 font-medium">
                        بدون كود SKU
                      </span>
                    )}
                    {item.barcode && (
                      <span className="inline-flex items-center gap-1 text-[11px] font-mono text-slate-600 bg-slate-50 px-1.5 py-0.5 rounded border border-slate-200">
                        <Barcode size={12} className="text-slate-400" /> {item.barcode}
                      </span>
                    )}
                  </div>
                </td>
                <td className="p-4 text-sm text-slate-500">
                  {item.category_id && (
                      <span className="bg-slate-100 text-slate-600 px-2 py-1 rounded text-xs font-medium">{categories.find(c => c.id === item.category_id)?.name || '-'}</span>
                  )}
                  {(item as any).supplier_id && (
                      <span className="block mt-1 text-[11px] text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded border border-blue-100 font-medium">
                        🏢 {suppliers?.find((s: any) => s.id === (item as any).supplier_id)?.name || 'مورد محدد'}
                      </span>
                  )}
                </td>
                <td className="p-4">
                  {effectiveType === 'RAW_MATERIAL' ? (
                    <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-800 border border-amber-200">
                      🥩 مادة خام
                    </span>
                  ) : effectiveType === 'MANUFACTURED' ? (
                    <div>
                      <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-purple-100 text-purple-700 border border-purple-200">
                        🍲 منتج مصنع
                      </span>
                      {(() => {
                        const routingInfo = routingsMap.get(item.id);
                        if (routingInfo) {
                          return (
                            <button
                              onClick={() => navigate(`/mfg/routing-bom?productId=${item.id}`)}
                              title={`المسار: ${routingInfo.routingName} (${routingInfo.stepsCount} مراحل) - انقر لعرض المسار`}
                              className={`mt-1.5 flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded border transition-all ${
                                routingInfo.stepsCount > 0
                                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100'
                                  : 'bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100'
                              }`}
                            >
                              <Layers size={11} className={routingInfo.stepsCount > 0 ? 'text-emerald-600' : 'text-amber-600'} />
                              <span>{routingInfo.stepsCount > 0 ? `مسار ومراحل (${routingInfo.stepsCount})` : 'مسار بدون مراحل'}</span>
                            </button>
                          );
                        }
                        return (
                          <button
                            onClick={() => navigate(`/mfg/routing-bom?productId=${item.id}`)}
                            title="هذا الصنف مصنع ولكن لم يتم إنشاء مسار إنتاج أو مراحل له بعد - انقر لإنشاء مسار"
                            className="mt-1.5 flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded border bg-rose-50 text-rose-700 border-rose-200 hover:bg-rose-100 transition-all"
                          >
                            <AlertTriangle size={11} className="text-rose-600" />
                            <span>بدون مسار تصنيعي</span>
                            <PlusCircle size={10} className="text-rose-500" />
                          </button>
                        );
                      })()}
                    </div>
                  ) : effectiveType === 'INTERMEDIATE_PRODUCT' ? (
                    <div>
                      <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-indigo-100 text-indigo-700 border border-indigo-200">
                        🍰 منتج وسيط
                      </span>
                      {(() => {
                        const routingInfo = routingsMap.get(item.id);
                        if (routingInfo) {
                          return (
                            <button
                              onClick={() => navigate(`/mfg/routing-bom?productId=${item.id}`)}
                              title={`المسار: ${routingInfo.routingName} (${routingInfo.stepsCount} مراحل) - انقر لعرض المسار`}
                              className={`mt-1.5 flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded border transition-all ${
                                routingInfo.stepsCount > 0
                                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100'
                                  : 'bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100'
                              }`}
                            >
                              <Layers size={11} className={routingInfo.stepsCount > 0 ? 'text-emerald-600' : 'text-amber-600'} />
                              <span>{routingInfo.stepsCount > 0 ? `مسار ومراحل (${routingInfo.stepsCount})` : 'مسار بدون مراحل'}</span>
                            </button>
                          );
                        }
                        return (
                          <button
                            onClick={() => navigate(`/mfg/routing-bom?productId=${item.id}`)}
                            title="هذا الصنف وسيط ولكن لم يتم إنشاء مسار إنتاج أو مراحل له بعد - انقر لإنشاء مسار"
                            className="mt-1.5 flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded border bg-rose-50 text-rose-700 border-rose-200 hover:bg-rose-100 transition-all"
                          >
                            <AlertTriangle size={11} className="text-rose-600" />
                            <span>بدون مسار تصنيعي</span>
                            <PlusCircle size={10} className="text-rose-500" />
                          </button>
                        );
                      })()}
                    </div>
                  ) : effectiveType === 'SERVICE' ? (
                    <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-700 border border-emerald-200">
                      ⚙️ خدمي
                    </span>
                  ) : (
                    <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-blue-100 text-blue-700 border border-blue-200">
                      📦 مخزوني
                    </span>
                  )}
                </td>
                <td className="p-4 text-center font-bold text-slate-700">
                    {item.stock}
                </td>
                <td className="p-4 text-center font-bold text-amber-600">
                    {reservedStock[item.id] > 0 ? (
                        <span className="flex items-center justify-center gap-1 bg-amber-50 px-2 py-1 rounded-full text-xs border border-amber-100">
                            <Lock size={12} /> {reservedStock[item.id]}
                        </span>
                    ) : '-'}
                </td>
                <td className="p-4 text-center text-slate-600 font-mono text-xs">
                    {item.expiry_date || '-'}
                </td>
                <td className="p-4 text-slate-600 font-mono">
                    {item.weighted_average_cost ? item.weighted_average_cost.toLocaleString() : item.purchase_price?.toLocaleString()}
                    <span className="text-[10px] text-slate-400 block">آخر شراء: {item.purchase_price?.toLocaleString()}</span>
                </td>
                <td className="p-4 text-emerald-600 font-bold">
                    {isOfferActive(item) ? (
                        <div className="flex flex-col items-center">
                            <span className="text-red-500 font-black">{item.offer_price.toLocaleString()}</span>
                            <span className="text-xs text-slate-400 line-through">{item.sales_price?.toLocaleString()}</span>
                            <span className="text-[10px] text-emerald-600 bg-emerald-50 px-1 rounded mt-0.5">عرض ساري</span>
                        </div>
                    ) : (
                        item.sales_price?.toLocaleString()
                    )}
                </td>
                <td className="p-4 flex justify-center gap-2 items-center">
                  {isOfferActive(item) && (
                      <button onClick={() => handlePrintOfferBarcode(item)} className="p-2 text-purple-600 hover:bg-purple-50 rounded" title="طباعة باركود العرض">
                          <Barcode size={18} />
                      </button>
                  )}
                  {isOfferExpired(item) && (
                      <button onClick={() => handleRenewOffer(item)} className="p-2 text-amber-600 hover:bg-amber-50 rounded" title="تجديد العرض المنتهي">
                          <RefreshCw size={18} />
                      </button>
                  )}
                <button 
                  onClick={() => setRecipeTarget({ id: item.id, name: item.name })} 
                  className="p-2 text-indigo-600 hover:bg-indigo-50 rounded" 
                  title="إدارة المكونات (BOM)"
                >
                  <UtensilsCrossed size={18} />
                </button>
                <button 
                  onClick={() => setModifierTarget({ id: item.id, name: item.name })} 
                  className="p-2 text-teal-600 hover:bg-teal-50 rounded" 
                  title="إدارة الإضافات (Modifiers)"
                >
                  <Layers size={18} />
                </button>
                  <button onClick={() => handlePrintBarcode(item)} className="p-2 text-slate-500 hover:bg-slate-100 rounded" title="طباعة باركود">
                      <Barcode size={18} />
                  </button>
                  <button onClick={() => handleOpenModal(item)} className="p-2 text-blue-500 hover:bg-blue-50 rounded"><Edit size={18}/></button>
                  <button onClick={() => handleDelete(item.id)} className="p-2 text-red-500 hover:bg-red-50 rounded"><Trash2 size={18}/></button>
                </td>
              </tr>
            ); })}
            {items.length === 0 && (
              <tr><td colSpan={11} className="p-8 text-center text-slate-400">لا توجد أصناف مسجلة</td></tr>
            )}
          </tbody>
        </table>

        {/* Pagination Controls */}
        <div className="bg-slate-50 p-4 border-t border-slate-200 flex items-center justify-between">
            <div className="text-sm text-slate-500">
                عرض {items.length} من أصل {totalCount} صنف
            </div>
            <div className="flex items-center gap-2">
                <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1 || loading} className="p-2 rounded-lg hover:bg-white disabled:opacity-50 transition-colors">
                    <ChevronRight size={20} />
                </button>
                <span className="font-bold text-slate-700">صفحة {page} من {totalPages}</span>
                <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages || loading} className="p-2 rounded-lg hover:bg-white disabled:opacity-50 transition-colors">
                    <ChevronLeft size={20} />
                </button>
            </div>
        </div>
      </div>

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
    </div>
  );
};

export default ProductManager;

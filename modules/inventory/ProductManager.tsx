﻿﻿﻿﻿﻿import React, { useState, useEffect, useCallback } from 'react';
import { Package, Search, Plus, Edit, Trash2, Save, X, Barcode, Image as ImageIcon, Upload, AlertTriangle, Lock, Percent, RefreshCw, CheckSquare, Square, Tag, Download, Loader2, ChevronLeft, ChevronRight, FileSpreadsheet, UtensilsCrossed, Zap, PlusCircle, Layers } from 'lucide-react';
import { supabase } from '../../supabaseClient';
import { useAccounting } from '../../context/AccountingContext';
import { useToast } from '../../context/ToastContext';
import { useQueryClient } from '@tanstack/react-query';
import { usePagination } from '../../components/usePagination';
import RecipeManagement from '../../components/RecipeManagement';
import SearchableSelect from '../../components/SearchableSelect'; // Import the new component
import { ModifierManagement } from '../../components/ModifierManagement';
import * as XLSX from 'xlsx';
import { z } from 'zod';
import { createProductSchema, bulkOfferSchema, bulkPriceUpdateSchema } from '../../utils/validationSchemas';


// تعريف واجهة الصنف بناءً على الجدول الجديد items
type Item = {
  id: string;
  name: string;
  sku: string | null;
  barcode?: string | null;
  sales_price: number;
  description?: string | null;
  purchase_price: number; // هذا هو حقل التكلفة
  weighted_average_cost?: number; // متوسط التكلفة
  stock: number; // هذا هو حقل المخزون
  product_type: 'STOCK' | 'SERVICE' | 'MANUFACTURED' | 'RAW_MATERIAL';
  inventory_account_id: string | null;
  cogs_account_id: string | null;
  sales_account_id: string | null;
  image_url: string | null;
  expiry_date?: string | null;
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
};

// Define a type for the formData state to ensure consistency
type ProductFormData = {
  name: string;
  sku: string;
  barcode: string;
  sales_price: number;
  description: string;
  purchase_price: number;
  unit: string;
  product_type: 'STOCK' | 'SERVICE' | 'RAW_MATERIAL' | 'MANUFACTURED';
  inventory_account_id: string;
  cogs_account_id: string;
  sales_account_id: string;
  image_url: string;
  opening_stock: number;
  category_id: string | null;
  min_stock_level: number;
  requires_serial: boolean;
  expiry_date: string;
  offer_price: number;
  offer_start_date: string;
  offer_end_date: string;
  offer_max_qty: number;
  available_modifiers: any[];
  labor_cost: number;
  overhead_cost: number;
  is_overhead_percentage: boolean;
};

const ProductManager = () => {
  const queryClient = useQueryClient();
  const { accounts: contextAccounts, getSystemAccount, refreshData, deleteProduct, updateProduct, currentUser, products: contextProducts, warehouses, can, categories, addProduct, addEntry } = useAccounting();
  const { showToast } = useToast();
  
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [showOffersOnly, setShowOffersOnly] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [recipeCost, setRecipeCost] = useState(0); // تخزين تكلفة المكونات

  // تأخير البحث
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchTerm), 500);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  // إعداد استعلام البيانات
  const queryModifier = useCallback((query: any) => {
    if (debouncedSearch) {
      query = query.or(`name.ilike.%${debouncedSearch}%,sku.ilike.%${debouncedSearch}%,description.ilike.%${debouncedSearch}%`);
    }
    if (showOffersOnly) {
       const today = new Date().toISOString().split('T')[0];
       query = query.gt('offer_price', 0).lte('offer_start_date', today).gte('offer_end_date', today);
    }
    if (categoryFilter !== 'all') {
      query = query.eq('category_id', categoryFilter);
    }
    return query;
  }, [debouncedSearch, showOffersOnly, categoryFilter]);

  // استخدام Hook التصفح
  const { data: serverItems, loading: serverLoading, page, setPage, totalPages, totalCount, refresh } = usePagination<Item>('products', { select: '*', pageSize: 20, orderBy: 'name', ascending: true }, queryModifier);

  // في وضع الديمو، نستخدم المنتجات من السياق (الوهمية)
  const items = currentUser?.role === 'demo' 
    ? contextProducts.filter(i => 
        i.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
        (i.sku && i.sku.toLowerCase().includes(searchTerm.toLowerCase())) ||
        ((i as any).description && (i as any).description.toLowerCase().includes(searchTerm.toLowerCase()))
      ) 
    : serverItems;
    
  const loading = currentUser?.role === 'demo' ? false : serverLoading;
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [reservedStock, setReservedStock] = useState<Record<string, number>>({});
  const [recipeTarget, setRecipeTarget] = useState<{id: string, name: string} | null>(null);
  const [modifierTarget, setModifierTarget] = useState<{id: string, name: string} | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isBulkOfferModalOpen, setIsBulkOfferModalOpen] = useState(false);
  const [bulkOfferData, setBulkOfferData] = useState({
    strategy: 'percentage', // 'percentage' | 'fixed'
    value: 0,
    startDate: new Date().toISOString().split('T')[0],
    endDate: '',
    maxQty: 0
  });
  const [isBulkSaving, setIsBulkSaving] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [isRecipeImporting, setIsRecipeImporting] = useState(false);
  const [importWarehouseId, setImportWarehouseId] = useState<string>('');
  const [isConsumptionModalOpen, setIsConsumptionModalOpen] = useState(false);
  const [consumptionData, setConsumptionData] = useState<any[]>([]);
  const [consumptionFilterWarehouseId, setConsumptionFilterWarehouseId] = useState<string>('');
  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);
  const [categoryFormData, setCategoryFormData] = useState({ id: '', name: '', image_url: '', description: '' });
  const [categoryUploading, setCategoryUploading] = useState(false);
  const [autoCreatedProducts, setAutoCreatedProducts] = useState<any[]>([]);
  const [isBulkPriceUpdateModalOpen, setIsBulkPriceUpdateModalOpen] = useState(false);
  const [bulkPricePercentage, setBulkPricePercentage] = useState(0);
  const [isReportModalOpen, setIsReportModalOpen] = useState(false);

  useEffect(() => {
    if (warehouses.length > 0 && !importWarehouseId) {
      setImportWarehouseId(warehouses[0].id);
    }
  }, [warehouses]);

  // تصفية الحسابات من السياق العام لضمان التوافق
  const accounts = {
    assets: contextAccounts.filter(a => 
      !a.isGroup && (String(a.type).toLowerCase() === 'asset')
    ),
    expenses: contextAccounts.filter(a => 
      !a.isGroup && (String(a.type).toLowerCase() === 'expense')
    ),
    revenue: contextAccounts.filter(a => 
      !a.isGroup && (String(a.type).toLowerCase() === 'revenue')
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

  const fetchExpectedConsumption = async (whId: string = '') => {
    try {
        setIsBulkSaving(true); // استخدام لودر موجود
        const { data, error } = await supabase.rpc('get_expected_raw_material_consumption', { p_warehouse_id: whId || null });
        if (error) throw error;
        setConsumptionData(data || []);
        setIsConsumptionModalOpen(true);
    } catch (err: any) {
        showToast('فشل جلب بيانات الاستهلاك: ' + err.message, 'error');
    } finally {
        setIsBulkSaving(false);
    }
  };

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
    is_overhead_percentage: false
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
      setFormData(prev => ({ ...prev, purchase_price: Number(finalCost.toFixed(2)) }));
    }
  }, [formData.labor_cost, formData.overhead_cost, formData.is_overhead_percentage, formData.product_type, recipeCost]);

  const handleOpenModal = async (item?: Item) => {
    const defaultInventory = getSystemAccount('INVENTORY_FINISHED_GOODS')?.id || '';
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
      const inventoryAccId = accounts.assets.find(a => a.id === item.inventory_account_id) ? item.inventory_account_id : defaultInventory;
      const cogsAccId = accounts.expenses.find(a => a.id === item.cogs_account_id) ? item.cogs_account_id : defaultCogs;
      const salesAccId = accounts.revenue.find(a => a.id === item.sales_account_id) ? item.sales_account_id : defaultSales;

      setEditingId(item.id);
      const productDataToSet: ProductFormData = { // Explicitly type the object literal
        name: item.name,
        sku: item.sku || '',
        barcode: item.barcode || '',
        sales_price: item.sales_price || 0,
        description: item.description || '',
        purchase_price: item.purchase_price || 0,
        unit: item.unit || 'قطعة', // Removed (item as any)
        product_type: item.product_type, // Use item.product_type directly
        inventory_account_id: inventoryAccId || '',
        cogs_account_id: cogsAccId || '',
        sales_account_id: salesAccId || '',
        image_url: item.image_url || '',
        opening_stock: 0,
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
        is_overhead_percentage: item.is_overhead_percentage || false
      };
      setFormData(productDataToSet); // Pass the explicitly typed object    } else {
      setFormData(productDataToSet); 
    } else {
      setRecipeCost(0);
      setEditingId(null);
      // تعيين قيم افتراضية للحسابات إذا وجدت لتسهيل الإدخال


      setFormData({ // This is the initial state, which is already correctly typed
        name: '', 
        sku: '', 
        barcode: '',
        description: '',
        sales_price: 0, 
        purchase_price: 0, 
        unit: 'قطعة',
        requires_serial: false,
        product_type: 'STOCK', // Default to STOCK for new products
        inventory_account_id: defaultInventory,
        cogs_account_id: defaultCogs,
        sales_account_id: defaultSales,
        image_url: '',
        opening_stock: 0,
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
        is_overhead_percentage: false
      });
    }
    setIsModalOpen(true);
  };

  const handleDownloadTemplate = () => {
    const headers = [
      { 'اسم المنتج': '', 'الكود (SKU)': '', 'الباركود': '', 'سعر الشراء': '', 'سعر البيع': '', 'نوع المنتج': '', 'الوحدة': '', 'التصنيف': '', 'الوصف': '', 'الكمية الافتتاحية': '' }
    ];
    const ws = XLSX.utils.json_to_sheet(headers);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "نموذج المنتجات");
    XLSX.writeFile(wb, "Products_Template.xlsx");
  };

  const handleExportExcel = async () => {
    showToast('جاري تجهيز الملف للتصدير...', 'info');
    try {
        let query = supabase.from('products').select('*');
        // تطبيق نفس الفلاتر المستخدمة في العرض الرئيسي
        query = queryModifier(query);

        const { data: allItems, error } = await query;

        if (error) throw error;
        // Use handleError for consistency
        const dataToExport = (allItems || []).map(item => ({
          'اسم الصنف': item.name,
          'الكود (SKU)': item.sku || '-',
          'النوع': item.item_type === 'STOCK' ? 'مخزوني' : 'خدمي',
          'الرصيد الحالي': item.stock,
          'سعر الشراء': item.purchase_price,
          'سعر البيع': item.sales_price,
          'متوسط التكلفة': item.weighted_average_cost || item.purchase_price,
        }));

        const ws = XLSX.utils.json_to_sheet(dataToExport);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "قائمة الأصناف");
        XLSX.writeFile(wb, `Products_List_${new Date().toISOString().split('T')[0]}.xlsx`);
    } catch (err: any) {
        showToast('فشل التصدير: ' + err.message, 'error');
    }
  };

  const handleDownloadRecipeTemplate = () => {
    const headers = [
      { 'كود الوجبة (SKU)': '', 'اسم الوجبة': '', 'كود المكون (SKU)': '', 'اسم المكون': '', 'الكمية المطلوبة': '', 'الوحدة': '' }
    ];
    const ws = XLSX.utils.json_to_sheet(headers);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "نموذج الوصفات");
    XLSX.writeFile(wb, "Recipes_Template.xlsx");
  };

  const handleRecipeFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;
    
    const file = e.target.files[0];
    setIsRecipeImporting(true);

    const reader = new FileReader();
    reader.onload = async (evt) => {
        try {
            const bstr = evt.target?.result;
            const wb = XLSX.read(bstr, { type: 'binary' });
            const wsname = wb.SheetNames[0];
            const ws = wb.Sheets[wsname];
            const data = XLSX.utils.sheet_to_json(ws);

            // إعداد البيانات اللازمة لإنشاء أصناف جديدة (تلقائياً)
            const orgId = (currentUser as any)?.organization_id || (currentUser as any)?.user_metadata?.org_id;
            const defaultInventory = getSystemAccount('INVENTORY_FINISHED_GOODS')?.id || null;
            const defaultCogs = getSystemAccount('COGS')?.id || null;
            const defaultSales = getSystemAccount('SALES_REVENUE')?.id || null;

            // جلب جميع المنتجات للبحث السريع (Map for fast lookup)
            const { data: allProducts } = await supabase.from('products').select('id, name, sku, unit');
            const productMap = new Map(); // Key: SKU or Name, Value: ID
            const productDetailsMap = new Map(); // Key: ID, Value: Product Details (للوصول للوحدة الحالية)
            
            allProducts?.forEach(p => { // Use handleError for consistency
                productDetailsMap.set(p.id, p);
                // تخزين المفاتيح بحروف صغيرة وبدون مسافات لضمان المطابقة
                if (p.sku) productMap.set(String(p.sku).trim().toLowerCase(), p.id);
                if (p.name) productMap.set(String(p.name).trim().toLowerCase(), p.id);
            });

            let successCount = 0;
            let failCount = 0;
            const bomInserts: any[] = [];
            const unitUpdates = new Map<string, string>(); // تجميع التحديثات: ID -> New Unit
            const createdList: any[] = []; // قائمة لتتبع المنتجات المنشأة تلقائياً

            // دالة مساعدة للتحويل بين الوحدات (كيلو <-> جرام، لتر <-> مل)
            const getConversionFactor = (fromUnit: string, toUnit: string) => { // Use handleError for consistency
                const normalize = (u: string) => {
                    if (!u) return '';
                    u = u.toLowerCase().trim();
                // إزالة الأرقام والأقواس للتطبيع (مثلاً "carton 24" -> "carton")
                u = u.replace(/[0-9.()]/g, '').trim();
                if (['kg', 'kilo', 'kilogram', 'kgs', 'كجم', 'كيلو', 'كيلوجرام'].includes(u)) return 'kg';
                if (['g', 'gm', 'gram', 'gr', 'grams', 'جرام', 'جم'].includes(u)) return 'g';
                if (['l', 'liter', 'litre', 'liters', 'لتر'].includes(u)) return 'l';
                if (['ml', 'milli', 'milliliter', 'milliliters', 'مل', 'ملل', 'مللي'].includes(u)) return 'ml';
                if (['piece', 'pcs', 'pc', 'unit', 'قطعة', 'حبه', 'حبة', 'عدد', 'وحدة'].includes(u)) return 'piece';
                if (['dozen', 'doz', 'dz', 'دسته', 'دستة'].includes(u)) return 'dozen';
                if (['carton', 'ctn', 'box', 'pack', 'crate', 'كرتونة', 'كرتون', 'علبة', 'باكيت', 'صندوق'].includes(u)) return 'carton';
                if (['pallet', 'pl', 'plt', 'بالتة', 'بالته', 'طبلية'].includes(u)) return 'pallet';
                    return u;
                };

            const extractNumber = (str: string) => {
                if (!str) return 1;
                const match = str.match(/(\d+(\.\d+)?)/);
                return match ? parseFloat(match[0]) : 1;
            };

                const nFrom = normalize(fromUnit);
                const nTo = normalize(toUnit);
            
            // استخراج المعاملات (مثلاً كرتونة 24 -> 24)
            const fromFactor = extractNumber(fromUnit);
            const toFactor = extractNumber(toUnit);

            if (nFrom === nTo) {
                // إذا نفس الوحدة (مثلاً كرتونة لكرتونة) نراعي اختلاف الحجم
                if (nFrom === 'carton' || nFrom === 'pallet') return fromFactor / toFactor;
                return 1;
            }
            
                if (nFrom === 'g' && nTo === 'kg') return 0.001;
                if (nFrom === 'kg' && nTo === 'g') return 1000;
                if (nFrom === 'ml' && nTo === 'l') return 0.001;
                if (nFrom === 'l' && nTo === 'ml') return 1000;

            // منطق الدسته والكرتونة
            let fromBase = 1;
            if (nFrom === 'dozen') fromBase = 12;
            else if (nFrom === 'carton') fromBase = fromFactor > 1 ? fromFactor : 1;
            else if (nFrom === 'pallet') fromBase = fromFactor > 1 ? fromFactor : 1;

            let toBase = 1;
            if (nTo === 'dozen') toBase = 12;
            else if (nTo === 'carton') toBase = toFactor > 1 ? toFactor : 1;
            else if (nTo === 'pallet') toBase = toFactor > 1 ? toFactor : 1;

            // التحويل إذا كانت الوحدات من نوع العدد
            if ((nFrom === 'piece' || nFrom === 'dozen' || nFrom === 'carton' || nFrom === 'pallet') && 
                (nTo === 'piece' || nTo === 'dozen' || nTo === 'carton' || nTo === 'pallet')) {
                return fromBase / toBase;
            }

                return 1;
            };

            for (const rawRow of data as any[]) {
                // تطبيع مفاتيح الصف (إزالة المسافات الزائدة من أسماء الأعمدة)
                const row: any = {};
                Object.keys(rawRow).forEach(key => {
                    row[key.trim()] = rawRow[key];
                });

                // دعم مسميات أعمدة مرنة لتتوافق مع ملفات المستخدم المختلفة
                const pSku = row['كود الوجبة (SKU)'] || row['كود الوجبة'];
                const pName = row['اسم الوجبة'] || row['اسم المنتج التام'];
                
                const mSku = row['كود المكون (SKU)'] || row['كود المكون'] || row['كود الصنف'];
                const mName = row['اسم المكون'] || row['المكونات'] || row['اسم الصنف'];
                
                const qty = row['الكمية المطلوبة'] || row['الكمية'];
                const unit = row['الوحدة'] || row['الوحدات'];

                // محاولة البحث بالكود أولاً ثم الاسم (مع التطبيع)
                const pKeySku = pSku ? String(pSku).trim().toLowerCase() : '';
                const pKeyName = pName ? String(pName).trim().toLowerCase() : '';
                
                const mKeySku = mSku ? String(mSku).trim().toLowerCase() : '';
                const mKeyName = mName ? String(mName).trim().toLowerCase() : '';

                let productId = (pKeySku && productMap.get(pKeySku)) || (pKeyName && productMap.get(pKeyName));
                let materialId = (mKeySku && productMap.get(mKeySku)) || (mKeyName && productMap.get(mKeyName));

                // إذا لم يتم العثور على الوجبة (المنتج التام)، قم بإنشائها تلقائياً
                if (!productId && pName) {
                    try {
                        const { data: newProduct, error: createError } = await supabase.from('products').insert({
                            name: String(pName).trim(),
                            sku: pSku ? String(pSku).trim() : null,
                            product_type: 'MANUFACTURED', // افتراضي للوجبات ذات الوصفات
                            item_type: 'MANUFACTURED',
                            sales_price: 0,
                            purchase_price: 0,
                            cost: 0,
                          p_stock: 0, // This RPC needs to be updated to take orgId
                          p_org_id: orgId,
                            organization_id: orgId,
                            inventory_account_id: defaultInventory,
                            cogs_account_id: defaultCogs,
                            sales_account_id: defaultSales,
                            is_active: true
                        }).select('id, name, sku').single();

                        if (!createError && newProduct) { // Use handleError for consistency
                            productId = newProduct.id;
                            // تحديث الخريطة فوراً لكي تجدها الصفوف التالية لنفس الوجبة في الملف
                            if (newProduct.sku) productMap.set(String(newProduct.sku).trim().toLowerCase(), newProduct.id);
                            productMap.set(String(newProduct.name).trim().toLowerCase(), newProduct.id);
                            createdList.push({ name: newProduct.name, sku: newProduct.sku, type: 'وجبة (Meal)' });
                        }
                    } catch (err) {
                        console.error("Failed to auto-create meal:", err);
                    }
                }

                // إذا لم يتم العثور على المكون (المادة الخام)، قم بإنشائها تلقائياً
                if (!materialId && mName) {
                    try {
                        const { data: newMaterial, error: createMatError } = await supabase.from('products').insert({
                            name: String(mName).trim(),
                            sku: mSku ? String(mSku).trim() : null,
                            product_type: 'RAW_MATERIAL', // مادة خام
                            item_type: 'RAW_MATERIAL',
                            sales_price: 0,
                            purchase_price: 0,
                            cost: 0,
                          p_stock: 0, // This RPC needs to be updated to take orgId
                          p_org_id: orgId,
                            organization_id: orgId,
                            inventory_account_id: defaultInventory,
                            cogs_account_id: defaultCogs,
                            sales_account_id: defaultSales,
                            is_active: true,
                            unit: unit ? String(unit).trim() : 'kg' // استخدام الوحدة من الملف أو افتراضي
                        }).select('id, name, sku, unit').single();

                        if (!createMatError && newMaterial) { // Use handleError for consistency
                            materialId = newMaterial.id;
                            if (newMaterial.sku) productMap.set(String(newMaterial.sku).trim().toLowerCase(), newMaterial.id);
                            productMap.set(String(newMaterial.name).trim().toLowerCase(), newMaterial.id);
                            productDetailsMap.set(newMaterial.id, newMaterial);
                            createdList.push({ name: newMaterial.name, sku: newMaterial.sku, type: 'مادة خام (Raw Material)' });
                        }
                    } catch (err) {
                        console.error("Failed to auto-create raw material:", err);
                    }
                }

                if (productId && materialId && qty && Number(qty) > 0) {
                    if (productId !== materialId) {
                        const material = productDetailsMap.get(materialId);
                        const baseUnit = material?.unit;
                        const recipeUnit = unit ? String(unit).trim() : '';
                        
                        // حساب الكمية بناءً على معامل التحويل (مثلاً 200 جرام -> 0.2 كيلو)
                        const factor = (baseUnit && recipeUnit) ? getConversionFactor(recipeUnit, baseUnit) : 1;
                        const finalQty = Number(qty) * factor;

                        bomInserts.push({ // Use handleError for consistency
                            product_id: productId,
                            raw_material_id: materialId,
                            quantity_required: finalQty
                        });

                        // تحديث الوحدة فقط إذا كانت المادة الخام ليس لها وحدة مسجلة
                        if (material && !material.unit && recipeUnit) {
                            const newUnit = recipeUnit;
                                unitUpdates.set(materialId, newUnit);
                                material.unit = newUnit; // تحديث محلي
                        }

                        successCount++;
                    }
                } else {
                    failCount++;
                }
            }

            if (bomInserts.length > 0) {
                const { error } = await supabase.from('bill_of_materials').upsert(bomInserts, { onConflict: 'product_id,raw_material_id' }); // Use handleError for consistency
                if (error) throw error;
            }

            // تنفيذ تحديثات الوحدات دفعة واحدة
            if (unitUpdates.size > 0) {
                const updates = Array.from(unitUpdates.entries()).map(([id, newUnit]) => 
                    supabase.from('products').update({ unit: newUnit }).eq('id', id)
                );
                await Promise.all(updates);
                refresh(); // تحديث القائمة في الواجهة
            }

            if (createdList.length > 0) {
                setAutoCreatedProducts(createdList);
                setIsReportModalOpen(true);
            }

            showToast(`تم استيراد ${successCount} وصفة بنجاح.${failCount > 0 ? ` فشل ${failCount} صف.` : ''}`, 'success');
        } catch (error: any) {
            console.error(error);
            showToast('فشل استيراد الوصفات: ' + error.message, 'error');
        } finally {
            setIsRecipeImporting(false);
            e.target.value = '';
        }
    };
    reader.readAsBinaryString(file);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;
    
    const file = e.target.files[0];
    setIsImporting(true);

    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const content = evt.target?.result;
        let data: any[] = [];

        if (file.name.toLowerCase().endsWith('.json')) {
            data = JSON.parse(content as string);
        } else {
            const wb = XLSX.read(content, { type: 'binary' });
            const wsname = wb.SheetNames[0];
            const ws = wb.Sheets[wsname];
            data = XLSX.utils.sheet_to_json(ws);
        }

        let successCount = 0;
        let failCount = 0;

        const orgId = (currentUser as any)?.organization_id || (currentUser as any)?.user_metadata?.org_id;

        const defaultInventory = getSystemAccount('INVENTORY_FINISHED_GOODS')?.id || null;
        const defaultCogs = getSystemAccount('COGS')?.id || null;
        const defaultSales = getSystemAccount('SALES_REVENUE')?.id || null;
        const equityAcc = contextAccounts.find(a => a.code === '3999')?.id; // حساب الأرصدة الافتتاحية
        const targetWarehouseId = importWarehouseId || (warehouses.length > 0 ? warehouses[0].id : null);

        // 1. التأكد من وجود كافة التصنيفات وإنشاء المفقود منها تلقائياً
        const categoryNamesInFile = [...new Set(data
          .filter(row => row['التصنيف'] || row['Category'] || row['category'])
          .map(row => String(row['التصنيف'] || row['Category'] || row['category']).trim())
        )];

        for (const catName of categoryNamesInFile) {
          const exists = categories.find(c => c.name.trim().toLowerCase() === catName.toLowerCase());
          if (!exists) {
            await supabase.from('item_categories').insert({ name: catName, organization_id: orgId });
          }
        }

        // جلب القائمة النهائية للتصنيفات لضمان الحصول على المعرفات (IDs) الجديدة
        const { data: allCats } = await supabase.from('item_categories').select('id, name');
        const catMap = new Map(allCats?.map(c => [c.name.trim().toLowerCase(), c.id]));

        // دالة تطبيع الوحدات لضمان توافقها مع خيارات النظام
        const normalizeUnit = (u: string): string => {
          if (!u) return 'piece';
          const val = u.trim().toLowerCase();
          const unitMap: Record<string, string> = {
            'كجم': 'kg', 'كيلو': 'kg', 'كيلوجرام': 'kg', 'kg': 'kg',
            'جرام': 'g', 'جم': 'g', 'g': 'g',
            'لتر': 'l', 'l': 'l',
            'مل': 'ml', 'مللي': 'ml', 'ملل': 'ml', 'ml': 'ml',
            'قطعة': 'piece', 'حبة': 'piece', 'حبه': 'piece', 'عدد': 'piece', 'piece': 'piece',
            'كرتون': 'box', 'علبة': 'box', 'صندوق': 'box', 'box': 'box',
            'متر': 'm', 'm': 'm',
            'بالتة': 'pallet', 'بالته': 'pallet', 'pallet': 'pallet',
            'درزن': 'dozen', 'دسته': 'dozen', 'dozen': 'dozen'
          };
          return unitMap[val] || val; // إذا لم يجد تطابقاً، يحفظ النص كما جاء من المستخدم
        };

        // جلب معرف المستخدم مرة واحدة فقط خارج الحلقة
        const { data: { user } } = await supabase.auth.getUser();

        for (const row of data as any[]) {
          const name = row['اسم المنتج'] || row['Name'] || row['name'];
          const sku = row['الكود (SKU)'] || row['SKU'] || row['sku'];
          const barcode = row['الباركود'] || row['Barcode'] || row['barcode'];
          const purchase_price = row['سعر الشراء'] || row['Purchase Price'] || row['Cost'] || row['cost'];
          const sales_price = row['سعر البيع'] || row['Sales Price'] || row['Price'] || row['price'];
          const stock = row['الكمية الافتتاحية'] || row['Stock'] || row['stock'] || 0;
          const rawType = row['نوع المنتج'] || row['Type'] || row['type'];
          const unit = row['الوحدة'] || row['Unit'] || row['unit'];
          const categoryName = row['التصنيف'] || row['Category'] || row['category'];
          const description = row['الوصف'] || row['Description'] || row['description'];

          const categoryId = categoryName ? catMap.get(String(categoryName).trim().toLowerCase()) : null;
          
          const productType = (String(rawType || '').includes('خدم') || String(rawType || '').toLowerCase().includes('serv')) ? 'SERVICE' : 'STOCK';

          if (name) {
            try { // Use handleError for consistency
              // 1. إضافة المنتج مباشرة
              const { data: newProduct, error: prodError } = await supabase.from('products').insert({
                name: String(name).trim(),
                sku: sku ? String(sku).trim() : null,
                barcode: barcode ? String(barcode).trim() : null,
                sales_price: sales_price ? Number(sales_price) : 0,
                purchase_price: purchase_price ? Number(purchase_price) : 0,
                stock: stock ? Number(stock) : 0,
                opening_balance: stock ? Number(stock) : 0,
                description: description ? String(description).trim() : null,
                category_id: categoryId,
                unit: normalizeUnit(String(unit || '')),
                organization_id: orgId,
                item_type: productType,
                product_type: productType,
                inventory_account_id: defaultInventory,
                cogs_account_id: defaultCogs,
                sales_account_id: defaultSales,
                is_active: true
              }).select().single();

              if (prodError) throw prodError; // Use handleError for consistency

              // 2. معالجة الرصيد الافتتاحي والقيد
              if (newProduct && stock && Number(stock) > 0 && targetWarehouseId) {
                  await supabase.from('opening_inventories').insert({
                      product_id: newProduct.id,
                      warehouse_id: targetWarehouseId,
                      quantity: Number(stock),
                      cost: Number(purchase_price) || 0
                  });

                  const totalValue = Number(stock) * (Number(purchase_price) || 0);
                  if (totalValue > 0 && defaultInventory && equityAcc) { // Use handleError for consistency
                      // جلب معرف المستخدم مباشرة لضمان عدم كونه فارغاً
                      const ref = `IMP-${Date.now().toString().slice(-8)}-${Math.floor(Math.random() * 1000)}`;

                      // إنشاء القيد المحاسبي
                      const { data: entry } = await supabase.from('journal_entries').insert({
                          transaction_date: new Date().toISOString().split('T')[0],
                          description: `رصيد افتتاحي (استيراد) - ${newProduct.name}`.substring(0, 255),
                          status: 'posted', // تصحيح: يجب أن يكون posted
                          user_id: user?.id || currentUser?.id // تصحيح اسم العمود
                      }).select().single();

                      if (entry) { // Use handleError for consistency
                          await supabase.from('journal_lines').insert([
                              // من حـ/ المخزون
                              { journal_entry_id: entry.id, account_id: defaultInventory, debit: totalValue, credit: 0, description: `مخزون افتتاحي - ${newProduct.name}` },
                              // إلى حـ/ الأرصدة الافتتاحية
                              { journal_entry_id: entry.id, account_id: equityAcc, debit: 0, credit: totalValue, description: `أرصدة افتتاحية - ${newProduct.name}` }
                          ]);
                      }
                  }
              }

              successCount++;
            } catch (err) {
              console.error("Error adding product:", name, err);
              failCount++;
            }
          } else {
            failCount++;
          }
        }

        queryClient.invalidateQueries({ queryKey: ['products'] });
        await refreshData();
        showToast(`تمت العملية:\n✅ تم استيراد: ${successCount} منتج\n❌ فشل: ${failCount}`, 'success');
        
      } catch (error: any) {
        showToast('حدث خطأ أثناء قراءة الملف: ' + error.message, 'error');
      } finally {
        setIsImporting(false);
        e.target.value = ''; 
      }
    };
    if (file.name.toLowerCase().endsWith('.json')) {
        reader.readAsText(file);
    } else {
        reader.readAsBinaryString(file);
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

  const handleCategoryImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;
    
    if (currentUser?.role === 'demo') {
        showToast('رفع الصور غير متاح في النسخة التجريبية', 'warning');
        return;
    }

    const file = e.target.files[0];
    const fileExt = file.name.split('.').pop();
    const fileName = `cat-${Date.now()}.${fileExt}`;
    const filePath = `${fileName}`;

    try {
      setCategoryUploading(true);
      const { error: uploadError } = await supabase.storage.from('product-images').upload(filePath, file);
      if (uploadError) throw uploadError;
      
      const { data } = supabase.storage.from('product-images').getPublicUrl(filePath);
      setCategoryFormData(prev => ({ ...prev, image_url: data.publicUrl }));
    } catch (error: any) {
      showToast('فشل رفع الصورة: ' + error.message, 'error');
    } finally {
      setCategoryUploading(false);
    }
  };

  const handleSaveCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!categoryFormData.name) return;

    if (currentUser?.role === 'demo') {
        showToast('تم حفظ التصنيف بنجاح (محاكاة)', 'success');
        setIsCategoryModalOpen(false);
        return;
    }

    try {
        const orgId = (currentUser as any)?.organization_id || (currentUser as any)?.user_metadata?.org_id;
        
        if (categoryFormData.id) {
            const { error } = await supabase.from('item_categories')
                .update({ name: categoryFormData.name, image_url: categoryFormData.image_url, description: categoryFormData.description })
                .eq('id', categoryFormData.id);
            if (error) throw error;
        } else {
            const { error } = await supabase.from('item_categories')
                .insert({ name: categoryFormData.name, image_url: categoryFormData.image_url, description: categoryFormData.description, organization_id: orgId });
            if (error) throw error;
        }
        
        showToast('تم حفظ التصنيف بنجاح', 'success');
        await refreshData();
        setIsCategoryModalOpen(false);
    } catch (error: any) {
        showToast('فشل حفظ التصنيف: ' + error.message, 'error');
    }
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
    
    // 1. التحقق باستخدام Zod
    const validationData = {
        name: formData.name,
        sku: formData.sku || undefined,
        unit: formData.unit,
        product_type: formData.product_type,
        purchase_price: formData.purchase_price,
        sales_price: formData.sales_price,
        inventory_account_id: formData.inventory_account_id || undefined,
        cogs_account_id: formData.cogs_account_id || undefined,
        sales_account_id: formData.sales_account_id || undefined,
        labor_cost: formData.labor_cost,
        overhead_cost: formData.overhead_cost,
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
    }

    // ملاحظة: التحقق من سعر البيع >= سعر الشراء يتم الآن عبر Zod Schema

    if (currentUser?.role === 'demo') {
        showToast('تم حفظ الصنف بنجاح وتوجيهه محاسبياً ✅ (محاكاة)', 'success');
        setIsModalOpen(false); // Use handleError for consistency
        return;
    }

    try {
      const orgId = (currentUser as any)?.organization_id || (currentUser as any)?.user_metadata?.org_id;

      if (editingId) {
        // تحديث صنف موجود (تحديث عادي)
        if (!can('products', 'update')) {
            showToast('ليس لديك صلاحية تعديل المنتجات', 'error');
            return;
        } // Use handleError for consistency
        const itemData = {
            name: formData.name,
            sku: formData.sku || null,
            barcode: formData.barcode || null,
            description: formData.description || null,
            unit: formData.unit,
            sales_price: formData.sales_price,
            purchase_price: formData.purchase_price,
            product_type: formData.product_type as 'STOCK' | 'SERVICE' | 'MANUFACTURED' | 'RAW_MATERIAL',
            inventory_account_id: (formData.product_type === 'STOCK' || formData.product_type === 'MANUFACTURED') ? formData.inventory_account_id : null,
            cogs_account_id: (formData.product_type === 'STOCK' || formData.product_type === 'MANUFACTURED') ? formData.cogs_account_id : null,
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
            labor_cost: formData.labor_cost || 0,
            overhead_cost: formData.overhead_cost || 0,
            is_overhead_percentage: formData.is_overhead_percentage || false
        };
        await updateProduct(editingId, itemData); // Use handleError for consistency
      } else {
        if (!can('products', 'create')) {
            showToast('ليس لديك صلاحية إضافة منتجات', 'error');
            return;
        }
        
        const productPayload = {
          name: formData.name,
          sku: formData.sku || null,
          barcode: formData.barcode || null,
          description: formData.description || null,
          unit: formData.unit,
          sales_price: formData.sales_price,
          purchase_price: formData.purchase_price,
          cost: formData.purchase_price, // Set initial cost to purchase price
          stock: formData.product_type === 'STOCK' ? formData.opening_stock : 999999,
          product_type: formData.product_type,
          inventory_account_id: (formData.product_type === 'STOCK' || formData.product_type === 'MANUFACTURED') ? formData.inventory_account_id : null,
          cogs_account_id: (formData.product_type === 'STOCK' || formData.product_type === 'MANUFACTURED') ? formData.cogs_account_id : null,
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
                    formData.product_type === 'MANUFACTURED' ? 'standard' : null
        };

        const newProduct = await addProduct(productPayload as any); // Use handleError for consistency

        // إنشاء الرصيد الافتتاحي والقيد
        if (newProduct && formData.product_type === 'STOCK' && formData.opening_stock > 0) {
            const defaultWarehouseId = warehouses.length > 0 ? warehouses[0].id : null;
            if (defaultWarehouseId) {
                await supabase.from('opening_inventories').insert({
                    product_id: newProduct.id,
                    warehouse_id: defaultWarehouseId,
                    quantity: formData.opening_stock,
                    cost: formData.purchase_price
                });
                
                // إنشاء القيد المحاسبي يدوياً لضمان ظهوره في دفتر اليومية // Use handleError for consistency
                const totalValue = formData.opening_stock * formData.purchase_price;
                const equityAcc = contextAccounts.find(a => a.code === '3999')?.id;
                const inventoryAcc = formData.inventory_account_id;

                if (totalValue > 0 && inventoryAcc && equityAcc) {
                     // استخدام نفس المستخدم الذي تم جلبه مسبقاً أو الحالي
                     const { data: { user } } = await supabase.auth.getUser(); // يمكن تحسينها أيضاً
                     const ref = `MAN-${Date.now().toString().slice(-8)}-${Math.floor(Math.random() * 1000)}`;

                     const { data: entry } = await supabase.from('journal_entries').insert({
                          transaction_date: new Date().toISOString().split('T')[0],
                          description: `رصيد افتتاحي - ${newProduct.name}`.substring(0, 255),
                          status: 'posted',
                          user_id: user?.id || currentUser?.id // تصحيح اسم العمود
                      }).select().single();

                      if (entry) { // Use handleError for consistency
                          await supabase.from('journal_lines').insert([
                              { journal_entry_id: entry.id, account_id: inventoryAcc, debit: totalValue, credit: 0, description: `مخزون افتتاحي - ${newProduct.name}` },
                              { journal_entry_id: entry.id, account_id: equityAcc, debit: 0, credit: totalValue, description: `أرصدة افتتاحية - ${newProduct.name}` }
                          ]);
                      }
                }
            }
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
        is_overhead_percentage: item.is_overhead_percentage || false
      });
      setIsModalOpen(true);
  };

  const handlePrintOfferBarcode = (item: Item) => {
    const printWindow = window.open('', '', 'width=600,height=400');
    if (printWindow) {
        printWindow.document.write(`
            <html dir="rtl"> // Use handleError for consistency
            <head>
                <title>باركود العرض - ${item.name}</title>
                <link href="https://fonts.googleapis.com/css2?family=Libre+Barcode+39+Text&family=Tajawal:wght@400;700;900&display=swap" rel="stylesheet">
                <style>
                    body { font-family: 'Tajawal', sans-serif; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; background-color: #f0f0f0; }
                    .label { 
                        width: 300px; 
                        height: 200px; 
                        background: white; 
                        border: 1px solid #ccc; 
                        padding: 15px; 
                        text-align: center; 
                        display: flex; 
                        flex-direction: column; 
                        justify-content: center;
                        align-items: center;
                        box-sizing: border-box;
                        border-radius: 8px;
                    }
                    .title { font-size: 16px; font-weight: bold; margin-bottom: 5px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; width: 100%; }
                    .prices { display: flex; justify-content: center; align-items: baseline; gap: 10px; margin: 5px 0; }
                    .old-price { text-decoration: line-through; color: #666; font-size: 14px; }
                    .new-price { font-size: 28px; font-weight: 900; color: #000; }
                    .barcode { font-family: 'Libre Barcode 39 Text', cursive; font-size: 48px; line-height: 1; margin: 5px 0; }
                    .tag { background: #ef4444; color: #fff; padding: 2px 10px; border-radius: 4px; font-size: 12px; font-weight: bold; display: inline-block; margin-bottom: 5px; }
                    @media print {
                        body { background: none; }
                        .label { border: none; page-break-inside: avoid; }
                    }
                </style>
            </head>
            <body>
                <div class="label">
                    <div class="tag">عرض خاص 🔥</div>
                    <div class="title">${item.name}</div>
                    <div class="prices">
                        <span class="old-price">${item.sales_price.toLocaleString()}</span>
                        <span class="new-price">${item.offer_price?.toLocaleString()}</span>
                    </div>
                    <div class="barcode">*${item.sku || '0000'}*</div>
                    <div style="font-size: 10px; margin-top: 5px;">${item.sku || ''}</div>
                </div>
                <script>window.onload = function() { window.print(); }</script>
            </body>
            </html>
        `);
        printWindow.document.close();
    }
  };

  const handlePrintBarcode = (item: Item) => {
    const printWindow = window.open('', '', 'width=800,height=600');
    if (printWindow) {
        printWindow.document.write(`
            <html dir="rtl"> // Use handleError for consistency
            <head>
                <title>طباعة باركود - ${item.name}</title>
                <link href="https://fonts.googleapis.com/css2?family=Libre+Barcode+39+Text&family=Tajawal:wght@400;700;900&display=swap" rel="stylesheet">
                <style>
                    body { font-family: 'Tajawal', sans-serif; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; background-color: #f0f0f0; }
                    .label { 
                        width: 50mm; 
                        height: 30mm; 
                        background: white; 
                        border: 1px solid #ccc; 
                        padding: 2px; 
                        text-align: center; 
                        display: flex; 
                        flex-direction: column; 
                        justify-content: center;
                        align-items: center;
                        box-sizing: border-box;
                        border-radius: 4px;
                    }
                    .title { font-size: 10px; font-weight: bold; margin-bottom: 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; width: 100%; }
                    .price { font-size: 14px; font-weight: 900; color: #000; margin: 2px 0; }
                    .barcode { font-family: 'Libre Barcode 39 Text', cursive; font-size: 32px; line-height: 1; margin: 2px 0; }
                    @media print {
                        body { background: none; }
                        .label { border: none; page-break-inside: avoid; margin: 0 auto; }
                        @page { size: 50mm 30mm; margin: 0; }
                    }
                </style>
            </head>
            <body>
                <div class="label">
                    <div class="title">${item.name}</div>
                    <div class="barcode">*${item.sku || '0000'}*</div>
                    <div style="font-size: 8px;">${item.sku || ''}</div>
                    <div class="price">${item.sales_price?.toLocaleString()}</div>
                </div>
                <script>window.onload = function() { window.print(); }</script>
            </body>
            </html>
        `);
        printWindow.document.close();
    }
  };

  const handleBulkPrintBarcodes = () => {
    if (selectedIds.size === 0) return;
    
    const selectedItems = (items as Item[]).filter(i => selectedIds.has(i.id));
    
    const printWindow = window.open('', '', 'width=800,height=600');
    if (printWindow) {
        printWindow.document.write(`
            <html dir="rtl"> // Use handleError for consistency
            <head>
                <title>طباعة الباركود</title>
                <link href="https://fonts.googleapis.com/css2?family=Libre+Barcode+39+Text&family=Tajawal:wght@400;700;900&display=swap" rel="stylesheet">
                <style>
                    body { font-family: 'Tajawal', sans-serif; padding: 20px; background-color: #fff; }
                    .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 15px; }
                    .label { 
                        border: 1px solid #eee; 
                        padding: 2px; 
                        text-align: center; 
                        display: flex; 
                        flex-direction: column; 
                        justify-content: center;
                        align-items: center;
                        box-sizing: border-box;
                        border-radius: 4px;
                        page-break-inside: avoid;
                        width: 50mm; height: 30mm;
                        margin: 0 auto;
                    }
                    .title { font-size: 10px; font-weight: bold; margin-bottom: 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; width: 100%; }
                    .price { font-size: 14px; font-weight: 900; color: #000; margin: 2px 0; }
                    .barcode { font-family: 'Libre Barcode 39 Text', cursive; font-size: 32px; line-height: 1; margin: 2px 0; }
                    @media print {
                        .no-print { display: none; }
                        .grid { display: block; }
                        .label { 
                            border: none;
                            page-break-after: always;
                        }
                        @page { size: 50mm 30mm; margin: 0; }
                    }
                </style>
            </head>
            <body>
                <div class="no-print" style="margin-bottom: 20px; text-align: center;">
                    <button onclick="window.print()" style="background: #2563eb; color: white; border: none; padding: 10px 20px; border-radius: 6px; font-family: inherit; font-weight: bold; cursor: pointer;">🖨️ طباعة الملصقات (${selectedItems.length})</button>
                </div>
                <div class="grid">
                    ${selectedItems.map(item => `
                        <div class="label">
                            <div class="title">${item.name}</div>
                            <div class="barcode">*${item.sku || '0000'}*</div>
                            <div style="font-size: 8px;">${item.sku || ''}</div>
                            <div class="price">${item.sales_price?.toLocaleString()}</div>
                        </div>
                    `).join('')}
                </div>
            </body>
            </html>
        `);
        printWindow.document.close();
    }
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

  const handleBulkOfferSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const validationResult = bulkOfferSchema.safeParse(bulkOfferData);
    if (!validationResult.success) {
        showToast(validationResult.error.issues[0].message, 'warning');
        return;
    }

    if (selectedIds.size === 0) {
        showToast('الرجاء اختيار أصناف لتطبيق العرض عليها', 'warning');
        return;
    }
    
    if (!can('products', 'update')) {
        showToast('ليس لديك صلاحية تعديل المنتجات (العروض)', 'error');
        return;
    }
    
    if (currentUser?.role === 'demo') {
        showToast(`تم تطبيق العرض على ${selectedIds.size} صنف بنجاح (محاكاة)`, 'success');
        setIsBulkOfferModalOpen(false);
        setSelectedIds(new Set());
        return;
    }

    setIsBulkSaving(true);
    try {
        const updates = Array.from(selectedIds).map(async (id) => {
            const item = items.find(i => i.id === id);
            if (!item) return;

            let newOfferPrice = 0;
            if (bulkOfferData.strategy === 'fixed') {
                newOfferPrice = bulkOfferData.value;
            } else {
                // Percentage discount
                newOfferPrice = item.sales_price * (1 - (bulkOfferData.value / 100));
            }
            
            // Ensure offer price is not negative and round it
            newOfferPrice = Math.max(0, Math.round(newOfferPrice * 100) / 100);

            return supabase.from('products').update({
                offer_price: newOfferPrice,
                offer_start_date: bulkOfferData.startDate,
                offer_end_date: bulkOfferData.endDate,
                offer_max_qty: bulkOfferData.maxQty || null
            }).eq('id', id);
        });

        await Promise.all(updates);
        
        showToast('تم تطبيق العرض الجماعي بنجاح ✅', 'success');
        refresh();
        setIsBulkOfferModalOpen(false);
        setSelectedIds(new Set());
    } catch (error: any) {
        console.error(error);
        showToast('حدث خطأ: ' + error.message, 'error');
    } finally {
        setIsBulkSaving(false);
    }
  };

  const handleBulkPriceUpdateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedIds.size === 0) return;

    const validationResult = bulkPriceUpdateSchema.safeParse({ percentage: bulkPricePercentage });
    if (!validationResult.success) {
        showToast(validationResult.error.issues[0].message, 'warning');
        return;
    }
    
    if (!can('products', 'update')) {
        showToast('ليس لديك صلاحية تعديل المنتجات', 'error');
        return;
    }

    if (currentUser?.role === 'demo') {
        showToast(`تم تحديث الأسعار بنسبة ${bulkPricePercentage}% لـ ${selectedIds.size} صنف (محاكاة)`, 'success');
        setIsBulkPriceUpdateModalOpen(false);
        setSelectedIds(new Set());
        return;
    }

    setIsBulkSaving(true);
    try {
        const updates = Array.from(selectedIds).map(async (id) => {
            const item = (items as Item[]).find(i => i.id === id);
            if (!item) return;

            const multiplier = 1 + (bulkPricePercentage / 100);
            let newPrice = item.sales_price * multiplier;
            
            // تقريب محاسبي لأقرب خانتين عشريتين
            newPrice = Math.max(0, Math.round(newPrice * 100) / 100);

            return supabase.from('products').update({
                sales_price: newPrice
            }).eq('id', id);
        });

        await Promise.all(updates);
        
        showToast(`تم تحديث أسعار ${selectedIds.size} صنف بنجاح ✅`, 'success');
        refresh();
        setIsBulkPriceUpdateModalOpen(false);
        setBulkPricePercentage(0);
        setSelectedIds(new Set());
    } catch (error: any) {
        console.error(error);
        showToast('حدث خطأ أثناء تحديث الأسعار: ' + error.message, 'error');
    } finally {
        setIsBulkSaving(false);
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
            onClick={() => fetchExpectedConsumption()}
            className="mt-1 text-xs bg-indigo-50 text-indigo-600 px-2 py-1 rounded-full font-bold flex items-center gap-1 hover:bg-indigo-100 transition-all"
          >
            <Zap size={12} /> عرض الاستهلاك المتوقع من المسودات
          </button>
          <p className="text-slate-500">تعريف المنتجات وربطها بالحسابات المحاسبية</p>
        </div>
        <div className="flex gap-2">
            <button onClick={handleExportExcel} className="bg-blue-50 border border-blue-200 text-blue-700 px-3 py-2 rounded-lg flex items-center gap-2 hover:bg-blue-100 text-sm font-bold" title="تصدير القائمة الحالية إلى Excel">
                <FileSpreadsheet size={16} /> تصدير
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
        <div className="md:col-span-2">
            <label className="block text-sm font-bold text-slate-700 mb-1">فلترة حسب التصنيف</label>
            <select 
                value={categoryFilter}
                onChange={e => setCategoryFilter(e.target.value)}
                className="w-full border rounded-lg p-2.5 bg-white"
            >
                <option value="all">-- كل التصنيفات --</option>
                {categories.map(cat => <option key={cat.id} value={cat.id}>{cat.name}</option>)}
            </select>
        </div>
      </div>

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
            {items.map(item => (
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
                  {item.name}
                  <div className="text-xs text-slate-400 font-mono">{item.sku}</div>
                  {isOfferActive(item) && (
                      <span className="inline-flex items-center gap-1 bg-red-100 text-red-600 text-[10px] px-2 py-0.5 rounded-full mt-1 animate-pulse">
                          <Percent size={10} /> عرض خاص
                      </span>
                  )}
                </td>
                <td className="p-4 text-sm text-slate-500">
                  {item.category_id && (
                      <span className="bg-slate-100 text-slate-600 px-2 py-1 rounded text-xs font-medium">{categories.find(c => c.id === item.category_id)?.name || '-'}</span>
                  )}
                </td>
                <td className="p-4">
                  <span className={`px-2 py-1 rounded text-xs font-bold ${item.item_type === 'STOCK' ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700'}`}>
                    {item.item_type === 'STOCK' ? 'مخزوني' :
                     item.item_type === 'SERVICE' ? 'خدمي' :
                     item.item_type === 'MANUFACTURED' ? 'منتج مصنع / وجبة' :
                     item.item_type}
                  </span>
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
            ))}
            {items.length === 0 && (
              <tr><td colSpan={6} className="p-8 text-center text-slate-400">لا توجد أصناف مسجلة</td></tr>
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

      {isModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl overflow-hidden animate-in zoom-in-95">
            <div className="bg-slate-50 px-6 py-4 border-b flex justify-between items-center">
              <h3 className="font-bold text-lg text-slate-800">{editingId ? 'تعديل صنف' : 'إضافة صنف جديد'}</h3>
              <button onClick={() => setIsModalOpen(false)}><X className="text-slate-400 hover:text-red-500" /></button>
            </div>
            
            <form onSubmit={handleSubmit} className="p-6 space-y-4 max-h-[80vh] overflow-y-auto">
              
              <div className="flex gap-4">
                {/* Image Upload */}
                <div className="w-24 flex-shrink-0">
                  <div className="relative group cursor-pointer w-24 h-24 bg-slate-100 rounded-xl border-2 border-dashed border-slate-300 flex items-center justify-center overflow-hidden">
                    {formData.image_url ? (
                      <img src={formData.image_url} alt="Preview" className="w-full h-full object-cover" />
                    ) : (
                      <ImageIcon className="text-slate-400 w-8 h-8" />
                    )}
                    <label className="absolute inset-0 flex items-center justify-center bg-black/50 text-white opacity-0 group-hover:opacity-100 transition-opacity rounded-xl cursor-pointer">
                      <Upload size={20} />
                      <input type="file" accept="image/*" onChange={handleImageUpload} className="hidden" disabled={uploading} />
                    </label>
                  </div>
                </div>

                <div className="flex-1 space-y-4">
                  <div>
                    <label className="block text-sm font-bold mb-1 text-slate-700">اسم الصنف <span className="text-red-500">*</span></label>
                    <input required type="text" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} className="w-full border rounded-lg p-2 focus:ring-2 focus:ring-emerald-500 outline-none" />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-bold mb-1 text-slate-700">نوع الصنف</label>
                      <select 
                        value={formData.product_type} 
                        onChange={e => setFormData({...formData, product_type: e.target.value as 'STOCK' | 'SERVICE' | 'MANUFACTURED'})}
                        className="w-full border rounded-lg p-2 bg-white"
                      >
                        <option value="STOCK">مخزوني (بضاعة)</option>
                        <option value="RAW_MATERIAL">خامة أولية (Raw Material)</option>
                        <option value="MANUFACTURED">منتج مصنع (Finished Good)</option>
                        <option value="SERVICE">خدمة (ليس لها مخزون)</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-bold mb-1 text-slate-700">وحدة القياس</label>
                      <select 
                        value={formData.unit} 
                        onChange={e => setFormData({...formData, unit: e.target.value})}
                        className="w-full border rounded-lg p-2 bg-white"
                      >
                        <option value="piece">قطعة (Piece)</option>
                        <option value="count">عدد (Count)</option>
                        <option value="kg">كجم (KG)</option>
                        <option value="g">جرام (Gram)</option>
                        <option value="l">لتر (Liter)</option>
                        <option value="ml">مللي (ML)</option>
                        <option value="box">علبة/كرتون (Box)</option>
                        <option value="crate">صندوق (Crate)</option>
                        <option value="pallet">بالتة (Pallet)</option>
                        <option value="m">متر (Meter)</option>
                      </select>
                    </div>
                    <div className="col-span-2 md:col-span-1">
                        <label className="block text-sm font-bold mb-1 text-slate-700">الكود (SKU)</label>
                        <input type="text" value={formData.sku} onChange={e => setFormData({...formData, sku: e.target.value})} className="w-full border rounded-lg p-2 font-mono" />
                    </div>
                    <div className="col-span-2 md:col-span-1">
                        <label className="block text-sm font-bold mb-1 text-slate-700">الباركود</label>
                        <input type="text" value={formData.barcode} onChange={e => setFormData({...formData, barcode: e.target.value})} className="w-full border rounded-lg p-2 font-mono" placeholder="Scan..." />
                    </div>
                    <div>
                        <label className="block text-sm font-bold mb-1 text-slate-700">حد الطلب (للتنبيهات)</label>
                        <input type="number" min="0" value={formData.min_stock_level} onChange={e => setFormData({...formData, min_stock_level: parseFloat(e.target.value)})} className="w-full border rounded-lg p-2" placeholder="0" />
                    </div>
                    <div>
                        <label className="block text-sm font-bold mb-1 text-slate-700">تاريخ الصلاحية</label>
                        <input type="date" value={formData.expiry_date} onChange={e => setFormData({...formData, expiry_date: e.target.value})} className="w-full border rounded-lg p-2" />
                    </div>                  
                    <div className="flex items-center gap-2 pt-6">
                        <label className="relative inline-flex items-center cursor-pointer">
                          <input type="checkbox" checked={formData.requires_serial} onChange={e => setFormData({...formData, requires_serial: e.target.checked})} className="sr-only peer" />
                          <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-emerald-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-600"></div>
                          <span className="mr-3 text-sm font-bold text-slate-700">يتطلب رقم تسلسلي (Serial Number)</span>
                        </label>
                    </div>
                  <div>
                    <div className="flex items-end gap-2">
                        <div className="flex-1">
                            <SearchableSelect
                                label="التصنيف"
                                options={categories.map(cat => ({ 
                                    id: cat.id, 
                                    name: cat.name + ((cat as any).description ? ` (${(cat as any).description})` : '')
                                }))}
                                value={formData.category_id || ''}
                                onChange={value => setFormData({...formData, category_id: value})}
                                placeholder="ابحث عن تصنيف..."
                            />
                        </div>
                        {formData.category_id && categories.find(c => c.id === formData.category_id) && (categories.find(c => c.id === formData.category_id) as any).image_url && (
                            <img 
                                src={(categories.find(c => c.id === formData.category_id) as any).image_url} 
                                alt="Category" 
                                className="w-10 h-10 rounded-lg border object-cover bg-slate-50"
                            />
                        )}
                        <button type="button" onClick={handleAddCategory} className="bg-slate-100 text-slate-600 p-2 rounded-lg hover:bg-slate-200" title="إضافة تصنيف جديد"><Plus size={20} /></button>
                        {formData.category_id && (
                            <>
                                <button type="button" onClick={handleEditCategory} className="bg-blue-50 text-blue-600 p-2 rounded-lg hover:bg-blue-100" title="تعديل التصنيف"><Edit size={20} /></button>
                                <button type="button" onClick={handleDeleteCategory} className="bg-red-50 text-red-600 p-2 rounded-lg hover:bg-red-100" title="حذف التصنيف"><Trash2 size={20} /></button>
                            </>
                        )}
                    </div>
                  </div>
                      <div className="col-span-2">
                        <label className="block text-sm font-bold mb-1 text-slate-700">الوصف (Description)</label>
                        <textarea value={formData.description} onChange={e => setFormData({...formData, description: e.target.value})} className="w-full border rounded-lg p-2 focus:ring-2 focus:ring-emerald-500 outline-none" rows={2} placeholder="أدخل تفاصيل إضافية عن الصنف..." />
                      </div>
                  </div>
                </div>
              </div>

              {/* قسم العروض والخصومات */}
              <div className="bg-yellow-50 p-4 rounded-xl border border-yellow-100">
                <h4 className="font-bold text-yellow-800 mb-3 flex items-center gap-2">
                  <Percent size={16}/> العروض والخصومات
                </h4>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-600 mb-1">سعر العرض</label>
                    <input type="number" min="0" value={formData.offer_price} onChange={e => setFormData({...formData, offer_price: parseFloat(e.target.value)})} className="w-full border border-yellow-200 rounded-lg p-2 text-sm bg-white" placeholder="0" />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-600 mb-1">تاريخ البداية</label>
                    <input type="date" value={formData.offer_start_date} onChange={e => setFormData({...formData, offer_start_date: e.target.value})} className="w-full border border-yellow-200 rounded-lg p-2 text-sm bg-white" />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-600 mb-1">تاريخ النهاية</label>
                    <input type="date" value={formData.offer_end_date} onChange={e => setFormData({...formData, offer_end_date: e.target.value})} className="w-full border border-yellow-200 rounded-lg p-2 text-sm bg-white" />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-600 mb-1">الحد الأقصى (للعميل)</label>
                    <input type="number" min="0" value={formData.offer_max_qty} onChange={e => setFormData({...formData, offer_max_qty: parseFloat(e.target.value)})} className="w-full border border-yellow-200 rounded-lg p-2 text-sm bg-white" placeholder="0 (بلا حد)" />
                  </div>
                </div>
              </div>

              {/* Modifiers for Restaurant Items */}
              {formData.product_type === 'MANUFACTURED' && (
                <div className="bg-indigo-50 p-4 rounded-xl border border-indigo-100">
                  <h4 className="font-bold text-indigo-800 mb-3 flex items-center gap-2">
                    <UtensilsCrossed size={16}/> الإضافات المتاحة (Modifiers)
                  </h4>
                  <div className="space-y-2">
                    {formData.available_modifiers.map((mod, index) => (
                      <div key={index} className="grid grid-cols-12 gap-2 items-center">
                        <div className="col-span-5">
                          <label className="text-xs font-bold text-slate-600">اسم الإضافة</label>
                          <input type="text" value={mod.name} onChange={e => { const newMods = [...formData.available_modifiers]; newMods[index].name = e.target.value; setFormData({...formData, available_modifiers: newMods}); }} className="w-full border rounded-lg p-1.5 text-sm" />
                        </div>
                        <div className="col-span-3">
                          <label className="text-xs font-bold text-slate-600">السعر</label>
                                <input type="number" value={mod.unit_price} onChange={e => { const newMods = [...formData.available_modifiers]; newMods[index].unit_price = parseFloat(e.target.value); setFormData({...formData, available_modifiers: newMods}); }} className="w-full border rounded-lg p-1.5 text-sm" />
                        </div>
                        <div className="col-span-3">
                          <label className="text-xs font-bold text-slate-600">التكلفة</label>
                          <input type="number" value={mod.cost} onChange={e => { const newMods = [...formData.available_modifiers]; newMods[index].cost = parseFloat(e.target.value); setFormData({...formData, available_modifiers: newMods}); }} className="w-full border rounded-lg p-1.5 text-sm" />
                        </div>
                        <div className="col-span-1 self-end">
                          <button type="button" onClick={() => setFormData({...formData, available_modifiers: formData.available_modifiers.filter((_, i) => i !== index)})} className="text-red-500 hover:bg-red-100 p-1.5 rounded-lg">
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                        <button type="button" onClick={() => setFormData({...formData, available_modifiers: [...formData.available_modifiers, { name: '', unit_price: 0, cost: 0 }]})} className="mt-3 text-sm font-bold text-indigo-600 hover:text-indigo-800 flex items-center gap-1">
                    <PlusCircle size={16} /> إضافة خيار جديد
                  </button>
                </div>
              )}

              {/* قسم تكاليف التصنيع (للأصناف المصنعة فقط) */}
              {formData.product_type === 'MANUFACTURED' && (
                  <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
                      <h4 className="font-bold text-slate-800 mb-3 text-sm">تكاليف التصنيع الإضافية (للوحدة الواحدة)</h4>
                      <div className="grid grid-cols-2 gap-4">
                          <div><label className="block text-xs font-bold text-slate-600 mb-1">تكلفة عمالة مباشرة</label><input type="number" min="0" step="0.01" value={formData.labor_cost} onChange={e => setFormData({...formData, labor_cost: parseFloat(e.target.value)})} className="w-full border rounded-lg p-2 text-sm" /></div>
                          <div>
                            <label className="block text-xs font-bold text-slate-600 mb-1">مصاريف غير مباشرة</label>
                            <div className="flex gap-2">
                              <input type="number" min="0" step="0.01" value={formData.overhead_cost} onChange={e => setFormData({...formData, overhead_cost: parseFloat(e.target.value)})} className="w-full border rounded-lg p-2 text-sm" />
                              <label className="flex items-center gap-1 cursor-pointer bg-slate-100 px-2 rounded border border-slate-200 text-xs font-bold">
                                <input type="checkbox" checked={formData.is_overhead_percentage} onChange={e => setFormData({...formData, is_overhead_percentage: e.target.checked})} className="rounded text-blue-600" />
                                <span>%</span>
                              </label>
                            </div>
                          </div>
                      </div>
                      
                      {/* 📊 ملخص التكلفة التقديرية (BOM Breakdown) */}
                      <div className="mt-4 pt-4 border-t border-slate-200">
                          <h5 className="font-bold text-slate-700 mb-2 text-sm">ملخص التكلفة التقديرية:</h5>
                          <div className="space-y-1 text-sm text-slate-600 bg-white p-3 rounded-lg border border-slate-100 shadow-sm">
                              <div className="flex justify-between">
                                  <span>تكلفة المكونات (من الوصفة):</span>
                                  <span className="font-mono font-bold text-indigo-600">{recipeCost.toFixed(2)}</span>
                              </div>
                              <div className="flex justify-between">
                                  <span>تكلفة العمالة والمصاريف:</span>
                                  <span className="font-mono font-bold">{(formData.purchase_price - recipeCost).toFixed(2)}</span>
                              </div>
                              <div className="flex justify-between font-black text-slate-800 border-t border-slate-200 pt-2 mt-2">
                                  <span>إجمالي التكلفة النهائية:</span>
                                  <span className="font-mono text-lg text-emerald-600">{formData.purchase_price.toFixed(2)}</span>
                              </div>
                          </div>
                      </div>
                  </div>
              )}

              {/* حقل الرصيد الافتتاحي (يظهر فقط عند الإضافة) */}
              {!editingId && (formData.product_type === 'STOCK' || formData.product_type === 'RAW_MATERIAL') && (
                  <div className="bg-slate-50 p-3 rounded-lg border border-slate-200">
                      <label className="block text-sm font-bold mb-1 text-slate-700">الرصيد الافتتاحي (الكمية)</label>
                      <input type="number" min="0" value={formData.opening_stock} onChange={e => setFormData({...formData, opening_stock: parseFloat(e.target.value)})} className="w-full border rounded-lg p-2 focus:ring-2 focus:ring-emerald-500 outline-none" placeholder="0" />
                      <p className="text-xs text-slate-500 mt-1">سيتم إنشاء قيد افتتاحي تلقائي (من ح/ المخزون إلى ح/ الأرصدة الافتتاحية) بقيمة (الكمية × التكلفة).</p>
                  </div>
              )}

              <div className="grid grid-cols-2 gap-4 border-t pt-4">
                <div>
                    <label className="block text-sm font-bold mb-1 text-slate-700">سعر التكلفة (تقديري)</label>
                    <input type="number" value={formData.purchase_price} onChange={e => setFormData({...formData, purchase_price: parseFloat(e.target.value)})} className="w-full border rounded-lg p-2" />
                </div>
                <div>
                    <label className="block text-sm font-bold mb-1 text-slate-700">سعر البيع</label>
                    <input type="number" value={formData.sales_price} onChange={e => setFormData({...formData, sales_price: parseFloat(e.target.value)})} className="w-full border rounded-lg p-2" />
                </div>
              </div>

              {formData.sales_price < formData.purchase_price && (
                  <div className="bg-red-50 text-red-600 p-3 rounded-lg text-sm font-bold flex items-center gap-2 mt-2">
                      <AlertTriangle size={16} />
                      تنبيه: سعر البيع أقل من سعر التكلفة!
                  </div>
              )}

              {/* التوجيه المحاسبي */}
              <div className="bg-blue-50 p-4 rounded-xl border border-blue-100 mt-4">
                <h4 className="font-bold text-blue-800 mb-3 flex items-center gap-2">
                  <AlertTriangle size={16}/> التوجيه المحاسبي (إلزامي)
                </h4>
                
                <div className="space-y-3">
                  {(formData.product_type === 'STOCK' || formData.product_type === 'MANUFACTURED' || formData.product_type === 'RAW_MATERIAL') && (
                    <>
                      <div>
                        <SearchableSelect
                          label="حساب المخزون (أصول)"
                          options={accounts.assets.map(a => ({ id: a.id, name: a.name, code: a.code }))}
                          required 
                          value={formData.inventory_account_id} 
                          onChange={value => setFormData({...formData, inventory_account_id: value})}
                          placeholder="-- اختر حساب المخزون --"
                          className="w-full"
                        />
                      </div>

                      <div>
                        <SearchableSelect
                          label="حساب تكلفة البضاعة (مصروفات)"
                          options={accounts.expenses.map(a => ({ id: a.id, name: a.name, code: a.code }))}
                          required 
                          value={formData.cogs_account_id} 
                          onChange={value => setFormData({...formData, cogs_account_id: value})}
                          placeholder="-- اختر حساب التكلفة --"
                          className="w-full"
                        />
                      </div>
                    </>
                  )}

                  <div>
                    <SearchableSelect
                      label="حساب المبيعات (إيرادات)"
                      options={accounts.revenue.map(a => ({ id: a.id, name: a.name, code: a.code }))}
                      required 
                      value={formData.sales_account_id} 
                      onChange={value => setFormData({...formData, sales_account_id: value})}
                      placeholder="-- اختر حساب الإيراد --"
                      className="w-full"
                    />
                  </div>
                </div>
              </div>

              <button type="submit" disabled={uploading} className="w-full bg-emerald-600 text-white py-3 rounded-lg font-bold hover:bg-emerald-700 mt-4 disabled:opacity-50 shadow-md transition-all">
                {uploading ? 'جاري رفع الصورة...' : 'حفظ واعتماد الصنف'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Expected Consumption Modal */}
      {isConsumptionModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[100] p-4 backdrop-blur-sm" dir="rtl">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden animate-in zoom-in-95">
                <div className="p-4 border-b flex justify-between items-center bg-slate-50">
                    <h3 className="font-bold text-lg text-slate-800 flex items-center gap-2">
                        <Zap size={20} className="text-indigo-600" /> تقرير الاستهلاك المتوقع (المسودات)
                    </h3>
                    <button onClick={() => setIsConsumptionModalOpen(false)}><X className="text-slate-400 hover:text-red-500" /></button>
                </div>
                <div className="p-6">
                    <div className="bg-blue-50 text-blue-700 p-3 rounded-lg text-xs mb-4">
                        هذا التقرير يحلل كافة الفواتير "المسودة" ويحسب المكونات الخام المطلوبة بناءً على الـ BOM الخاص بكل صنف وإضافاته.
                    </div>
                    <div className="mb-4 flex items-center gap-3">
                        <label className="text-sm font-bold text-slate-600">تصفية حسب المستودع:</label>
                        <select 
                            value={consumptionFilterWarehouseId} 
                            onChange={(e) => {
                                setConsumptionFilterWarehouseId(e.target.value);
                                fetchExpectedConsumption(e.target.value);
                            }}
                            className="border rounded-lg px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
                        >
                            <option value="">جميع المستودعات</option>
                            {warehouses.map(wh => <option key={wh.id} value={wh.id}>{wh.name}</option>)}
                        </select>
                    </div>
                    <div className="max-h-[400px] overflow-y-auto border rounded-xl overflow-hidden">
                        <table className="w-full text-right">
                            <thead className="bg-slate-100 text-slate-600 text-xs font-bold sticky top-0">
                                <tr>
                                    <th className="p-3">المادة الخام</th>
                                    <th className="p-3 text-center">المخزون الحالي</th>
                                    <th className="p-3 text-center">مطلوب تنفيذه</th>
                                    <th className="p-3 text-center">الرصيد المتبقي</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y text-sm">
                                {consumptionData.map((row, idx) => {
                                    const remaining = row.current_stock - row.expected_quantity;
                                    return (
                                        <tr key={idx} className="hover:bg-slate-50">
                                            <td className="p-3 font-bold text-slate-700">{row.raw_material_name}</td>
                                            <td className="p-3 text-center font-mono">{row.current_stock}</td>
                                            <td className="p-3 text-center font-bold text-blue-600">{row.expected_quantity}</td>
                                            <td className={`p-3 text-center font-black ${remaining < 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                                                {remaining}
                                                {remaining < 0 && <span className="block text-[10px] bg-red-100 px-1 rounded">عجز!</span>}
                                            </td>
                                        </tr>
                                    );
                                })}
                                {consumptionData.length === 0 && (
                                    <tr><td colSpan={4} className="p-8 text-center text-slate-400">لا توجد فواتير مسودة حالياً</td></tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                    <button 
                        onClick={() => window.print()} 
                        className="w-full mt-6 bg-slate-800 text-white font-bold py-3 rounded-xl hover:bg-slate-900 transition-all flex items-center justify-center gap-2"
                    >
                        <FileSpreadsheet size={20} /> طباعة قائمة الاحتياجات
                    </button>
                </div>
            </div>
        </div>
      )}

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
      {isBulkPriceUpdateModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-4 backdrop-blur-sm">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-6 animate-in zoom-in-95">
                <div className="flex justify-between items-center mb-6">
                    <h3 className="font-bold text-lg text-slate-800 flex items-center gap-2">
                        <Percent size={20} className="text-orange-600" /> تحديث أسعار البيع جماعياً
                    </h3>
                    <button onClick={() => setIsBulkPriceUpdateModalOpen(false)}><X className="text-slate-400 hover:text-red-500" /></button>
                </div>
                <form onSubmit={handleBulkPriceUpdateSubmit} className="space-y-4">
                    <div className="bg-orange-50 p-3 rounded-lg text-sm text-orange-800 mb-4">
                        سيتم تعديل سعر البيع لـ <strong>{selectedIds.size}</strong> صنف محدد. 
                        استخدم قيمة موجبة للزيادة (مثلاً 10 للزيادة 10%) وقيمة سالبة للخصم (مثلاً -5 لخفض السعر 5%).
                    </div>
                    
                    <div>
                        <label className="block text-sm font-bold text-slate-700 mb-1">نسبة التغيير (%)</label>
                        <div className="relative">
                            <input 
                                type="number" 
                                required 
                                step="0.01" 
                                value={bulkPricePercentage} 
                                onChange={e => setBulkPricePercentage(parseFloat(e.target.value))} 
                                className="w-full border rounded-lg p-2.5 pr-10 focus:ring-2 focus:ring-orange-500 outline-none font-bold text-lg text-center" 
                            />
                        </div>
                    </div>

                    <button type="submit" disabled={isBulkSaving} className="w-full bg-orange-600 text-white py-3 rounded-lg font-bold hover:bg-orange-700 mt-2 disabled:opacity-50 shadow-lg">
                        {isBulkSaving ? 'جاري التحديث...' : 'تحديث الأسعار الآن'}
                    </button>
                </form>
            </div>
        </div>
      )}

      {/* Bulk Offer Modal */}
      {isBulkOfferModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-4 backdrop-blur-sm">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-6 animate-in zoom-in-95">
                <div className="flex justify-between items-center mb-6">
                    <h3 className="font-bold text-lg text-slate-800 flex items-center gap-2">
                        <Tag size={20} className="text-purple-600" /> تطبيق عرض جماعي
                    </h3>
                    <button onClick={() => setIsBulkOfferModalOpen(false)}><X className="text-slate-400 hover:text-red-500" /></button>
                </div>
                <form onSubmit={handleBulkOfferSubmit} className="space-y-4">
                    <div className="bg-purple-50 p-3 rounded-lg text-sm text-purple-800 mb-4">
                        سيتم تطبيق هذا العرض على <strong>{selectedIds.size}</strong> صنف محدد.
                    </div>
                    
                    <div>
                        <label className="block text-sm font-bold text-slate-700 mb-1">نوع الخصم</label>
                        <div className="flex bg-slate-100 p-1 rounded-lg">
                            <button type="button" onClick={() => setBulkOfferData({...bulkOfferData, strategy: 'percentage'})} className={`flex-1 py-2 rounded-md text-sm font-bold transition-all ${bulkOfferData.strategy === 'percentage' ? 'bg-white text-purple-600 shadow-sm' : 'text-slate-500'}`}>نسبة مئوية %</button>
                            <button type="button" onClick={() => setBulkOfferData({...bulkOfferData, strategy: 'fixed'})} className={`flex-1 py-2 rounded-md text-sm font-bold transition-all ${bulkOfferData.strategy === 'fixed' ? 'bg-white text-purple-600 shadow-sm' : 'text-slate-500'}`}>سعر ثابت</button>
                        </div>
                    </div>

                    <div>
                        <label className="block text-sm font-bold text-slate-700 mb-1">{bulkOfferData.strategy === 'percentage' ? 'نسبة الخصم (%)' : 'سعر العرض الموحد'}</label>
                        <input type="number" required min="0" step="0.01" value={bulkOfferData.value} onChange={e => setBulkOfferData({...bulkOfferData, value: parseFloat(e.target.value)})} className="w-full border rounded-lg p-2.5 focus:ring-2 focus:ring-purple-500 outline-none font-bold text-lg" />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-bold text-slate-700 mb-1">تاريخ البداية</label>
                            <input type="date" required value={bulkOfferData.startDate} onChange={e => setBulkOfferData({...bulkOfferData, startDate: e.target.value})} className="w-full border rounded-lg p-2.5" />
                        </div>
                        <div>
                            <label className="block text-sm font-bold text-slate-700 mb-1">تاريخ النهاية</label>
                            <input type="date" required value={bulkOfferData.endDate} onChange={e => setBulkOfferData({...bulkOfferData, endDate: e.target.value})} className="w-full border rounded-lg p-2.5" />
                        </div>
                    </div>

                    <div>
                        <label className="block text-sm font-bold text-slate-700 mb-1">الحد الأقصى للعميل (اختياري)</label>
                        <input type="number" min="0" value={bulkOfferData.maxQty} onChange={e => setBulkOfferData({...bulkOfferData, maxQty: parseFloat(e.target.value)})} className="w-full border rounded-lg p-2.5" placeholder="0 (بلا حد)" />
                    </div>

                    <button type="submit" disabled={isBulkSaving} className="w-full bg-purple-600 text-white py-3 rounded-lg font-bold hover:bg-purple-700 mt-2 disabled:opacity-50">
                        {isBulkSaving ? 'جاري التطبيق...' : 'تأكيد العرض'}
                    </button>
                </form>
            </div>
        </div>
      )}

      {/* Category Modal */}
      {isCategoryModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[70] p-4 backdrop-blur-sm">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm overflow-hidden animate-in zoom-in-95">
                <div className="bg-slate-50 px-6 py-4 border-b flex justify-between items-center">
                    <h3 className="font-bold text-lg text-slate-800">{categoryFormData.id ? 'تعديل التصنيف' : 'تصنيف جديد'}</h3>
                    <button onClick={() => setIsCategoryModalOpen(false)}><X className="text-slate-400 hover:text-red-500" /></button>
                </div>
                <form onSubmit={handleSaveCategory} className="p-6 space-y-4">
                    <div className="flex justify-center">
                        <div className="relative group cursor-pointer w-24 h-24 bg-slate-100 rounded-xl border-2 border-dashed border-slate-300 flex items-center justify-center overflow-hidden">
                            {categoryFormData.image_url ? (
                                <img src={categoryFormData.image_url} alt="Preview" className="w-full h-full object-cover" />
                            ) : (
                                <ImageIcon className="text-slate-400 w-8 h-8" />
                            )}
                            <label className="absolute inset-0 flex items-center justify-center bg-black/50 text-white opacity-0 group-hover:opacity-100 transition-opacity rounded-xl cursor-pointer">
                                {categoryUploading ? <Loader2 size={20} className="animate-spin" /> : <Upload size={20} />}
                                <input type="file" accept="image/*" onChange={handleCategoryImageUpload} className="hidden" disabled={categoryUploading} />
                            </label>
                        </div>
                    </div>
                    <div>
                        <label className="block text-sm font-bold mb-1 text-slate-700">اسم التصنيف <span className="text-red-500">*</span></label>
                        <input required type="text" value={categoryFormData.name} onChange={e => setCategoryFormData({...categoryFormData, name: e.target.value})} className="w-full border rounded-lg p-2 focus:ring-2 focus:ring-purple-500 outline-none" />
                    </div>
                    <div>
                        <label className="block text-sm font-bold mb-1 text-slate-700">الوصف</label>
                        <textarea rows={3} value={categoryFormData.description} onChange={e => setCategoryFormData({...categoryFormData, description: e.target.value})} className="w-full border rounded-lg p-2 focus:ring-2 focus:ring-purple-500 outline-none" />
                    </div>
                    <button type="submit" disabled={categoryUploading} className="w-full bg-purple-600 text-white py-3 rounded-lg font-bold hover:bg-purple-700 mt-2 disabled:opacity-50">
                        حفظ التصنيف
                    </button>
                </form>
            </div>
        </div>
      )}

      {/* Auto-created Products Report Modal */}
      {isReportModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[80] p-4 backdrop-blur-sm">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl overflow-hidden animate-in zoom-in-95">
                <div className="bg-slate-50 px-6 py-4 border-b flex justify-between items-center">
                    <h3 className="font-bold text-lg text-slate-800 flex items-center gap-2">
                        <CheckSquare size={20} className="text-emerald-600" /> تقرير المنتجات التي تم إنشاؤها تلقائياً
                    </h3>
                    <button onClick={() => setIsReportModalOpen(false)}><X className="text-slate-400 hover:text-red-500" /></button>
                </div>
                <div className="p-6 max-h-[60vh] overflow-y-auto">
                    <div className="bg-emerald-50 text-emerald-800 p-4 rounded-lg mb-4 text-sm font-medium">
                        تم إنشاء {autoCreatedProducts.length} صنف جديد تلقائياً أثناء استيراد الوصفات لأنها لم تكن موجودة في النظام.
                    </div>
                    <table className="w-full text-right text-sm border rounded-lg overflow-hidden">
                        <thead className="bg-slate-100 font-bold text-slate-700">
                            <tr>
                                <th className="p-3">اسم الصنف</th>
                                <th className="p-3">الكود (SKU)</th>
                                <th className="p-3">النوع</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y">
                            {autoCreatedProducts.map((item, idx) => (
                                <tr key={idx} className="hover:bg-slate-50">
                                    <td className="p-3 font-bold">{item.name}</td>
                                    <td className="p-3 font-mono text-slate-500">{item.sku || '-'}</td>
                                    <td className="p-3">
                                        <span className={`px-2 py-1 rounded-full text-xs font-bold ${item.type.includes('Meal') ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'}`}>
                                            {item.type}
                                        </span>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
                <div className="bg-slate-50 px-6 py-4 border-t flex justify-end">
                    <button onClick={() => setIsReportModalOpen(false)} className="bg-slate-800 text-white px-6 py-2 rounded-lg font-bold hover:bg-slate-900">
                        إغلاق
                    </button>
                </div>
            </div>
        </div>
      )}
    </div>
  );
};

export default ProductManager;

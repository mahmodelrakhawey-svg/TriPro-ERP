import { logger } from '../../utils/logger';
import React, { useState, useMemo, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { supabase } from '../../supabaseClient';
import { useAccounting } from '../../context/AccountingContext';
import { useToast } from '../../context/ToastContext';
import { 
  Calculator, RefreshCw, Save, Search, CheckCircle2, AlertTriangle, 
  Loader2, Scan, RotateCcw, Plus, Trash2, Check, Filter, Layers, 
  ArrowUpDown, ChevronLeft, ChevronRight, X, Package, CheckCheck,
  Barcode as BarcodeIcon, SlidersHorizontal, ArrowRightLeft, Sparkles,
  ShieldCheck, Clock, Edit3
} from 'lucide-react';
import { createInventoryCountSchema } from '../../utils/validationSchemas';
import ProductSearchSelect, { normalizeArabic } from '../../components/ProductSearchSelect';
import { fetchAllTableRecords } from '../../context/domains/domainUtils';
import { getCurrencySymbol } from '../../utils/constants';
import { secureStorage } from '../../utils/securityMiddleware';

export interface CountTableItem {
  productId: string;
  productName: string;
  productDescription: string;
  sku: string;
  barcode: string;
  barcode2: string;
  categoryId: string;
  categoryName: string;
  unit: string;
  purchasePrice: number;
  systemQty: number;
  actualQty: number;
  difference: number;
  notes: string;
  isCounted: boolean;
  searchableText: string;
}

const INVENTORY_COUNT_DRAFT_KEY = 'tripro_inventory_count_draft_v1';
const LEGACY_INVENTORY_COUNT_DRAFT_KEY = 'tripro_inventory_count_draft';

export interface InventoryCountDraftData {
  warehouseId: string;
  date: string;
  items: CountTableItem[];
  includeServices?: boolean;
  savedAt?: string;
  savedAtTimestamp?: number;
}

export const getInventoryCountDraft = (): InventoryCountDraftData | null => {
  try {
    let raw = secureStorage.getItem<any>(INVENTORY_COUNT_DRAFT_KEY);
    if (!raw) {
      raw = secureStorage.getItem<any>(LEGACY_INVENTORY_COUNT_DRAFT_KEY);
    }
    if (!raw) return null;
    while (typeof raw === 'string') {
      try {
        raw = JSON.parse(raw);
      } catch {
        break;
      }
    }
    if (raw && typeof raw === 'object') {
      const validItems = Array.isArray(raw.items) ? raw.items : [];
      if (validItems.length > 0 || raw.warehouseId) {
        return {
          warehouseId: raw.warehouseId || '',
          date: raw.date || new Date().toISOString().split('T')[0],
          items: validItems,
          includeServices: !!raw.includeServices,
          savedAt: raw.savedAt,
          savedAtTimestamp: raw.savedAtTimestamp
        };
      }
    }
    return null;
  } catch (err) {
    logger.warn('Failed to parse inventory count draft', err);
    return null;
  }
};

export const clearInventoryCountDraft = () => {
  try {
    secureStorage.removeItem(INVENTORY_COUNT_DRAFT_KEY);
    secureStorage.removeItem(LEGACY_INVENTORY_COUNT_DRAFT_KEY);
  } catch {}
};

const InventoryCountForm = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { products, warehouses, categories, settings, recalculateStock, currentUser, currentSelectedOrgId } = useAccounting();
  const { showToast } = useToast();

  const [editingCountId, setEditingCountId] = useState<string | null>(null);
  const [editingCountNumber, setEditingCountNumber] = useState<string | null>(null);
  
  // 🛡️ استرجاع فوري متزامن للمسودة عند أول تصيير لمنع أي وميض أو ضياع للبيانات عند إعادة تحميل الشاشة
  const [hasDraftRestored, setHasDraftRestored] = useState<boolean>(() => {
    const draft = getInventoryCountDraft();
    return !!(draft && (draft.items.length > 0 || draft.warehouseId));
  });

  const [draftInfo, setDraftInfo] = useState<{ itemCount: number; savedAt?: string } | null>(() => {
    const draft = getInventoryCountDraft();
    if (draft && (draft.items.length > 0 || draft.warehouseId)) {
      return {
        itemCount: draft.items.length,
        savedAt: draft.savedAt
      };
    }
    return null;
  });

  const [lastAutoSaveTime, setLastAutoSaveTime] = useState<string | null>(() => {
    const draft = getInventoryCountDraft();
    return draft?.savedAt || null;
  });

  const [warehouseId, setWarehouseId] = useState<string>(() => {
    const draft = getInventoryCountDraft();
    return draft?.warehouseId || '';
  });

  const [date, setDate] = useState<string>(() => {
    const draft = getInventoryCountDraft();
    return draft?.date || new Date().toISOString().split('T')[0];
  });

  const [items, setItems] = useState<CountTableItem[]>(() => {
    const draft = getInventoryCountDraft();
    if (draft?.items && Array.isArray(draft.items) && draft.items.length > 0) {
      return draft.items.map(item => ({
        ...item,
        searchableText: item.searchableText || `${item.productName || ''} ${item.sku || ''} ${item.barcode || ''}`
      }));
    }
    return [];
  });

  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'diff_only' | 'matched_only' | 'surplus_only' | 'shortage_only' | 'zero_stock'>('all');
  const [selectedSearchProductId, setSelectedSearchProductId] = useState('');
  const [barcodeInput, setBarcodeInput] = useState('');
  const [saving, setSaving] = useState(false);
  const [loadingProducts, setLoadingProducts] = useState(false);
  const [allAvailableProducts, setAllAvailableProducts] = useState<any[]>([]);
  const [highlightedProductId, setHighlightedProductId] = useState<string | null>(null);
  const [includeServices, setIncludeServices] = useState<boolean>(() => {
    const draft = getInventoryCountDraft();
    return !!draft?.includeServices;
  });

  // التحكم في الصفحات (Pagination)
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(50);

  const itemInputRefs = useRef<{ [key: string]: HTMLInputElement | null }>({});
  const isMountedRef = useRef(false);
  const orgId = currentSelectedOrgId || (settings as any)?.organization_id || (currentUser as any)?.organization_id;
  const currency = getCurrencySymbol(settings?.currency) || 'ج.م';

  // 🚀 جلب كافة الأصناف من السيرفر مع تجاوز سقف الـ 1000 سجل في Supabase
  const loadFreshProducts = async () => {
    setLoadingProducts(true);
    try {
      if (currentUser?.role === 'demo') {
        const demoList = products || [];
        setAllAvailableProducts(demoList);
        return demoList;
      }

      const targetOrg = orgId;
      const { data: serverProducts, error } = await fetchAllTableRecords<any>(
        'products',
        (q) => {
          let query = q.is('deleted_at', null).order('name');
          if (targetOrg && targetOrg !== 'org-default-offline') {
            query = query.eq('organization_id', targetOrg);
          }
          return query;
        }
      );

      if (error) {
        logger.warn('Could not fetch products via fetchAllTableRecords, falling back to context products:', error);
      }

      // دمج أصناف السيرفر مع الأصناف الموجودة في الـ Context لضمان تواجد كل صنف 100%
      const mergedMap = new Map<string, any>();
      (products || []).forEach(p => { if (p?.id) mergedMap.set(p.id, p); });
      (serverProducts || []).forEach(p => { if (p?.id) mergedMap.set(p.id, p); });
      const combined = Array.from(mergedMap.values());
      setAllAvailableProducts(combined);
      return combined;
    } catch (err) {
      logger.error('Error loading products for inventory count:', err);
      const fallback = products || [];
      setAllAvailableProducts(fallback);
      return fallback;
    } finally {
      setLoadingProducts(false);
    }
  };

  useEffect(() => {
    loadFreshProducts();
  }, [orgId, products]);

  // 🛡️ تحميل كشف الجرد للتعديل في حال تم التوجيه من سجل الجرد المخزني
  useEffect(() => {
    const editId = (location.state as any)?.editCountId;
    if (!editId) return;

    const loadCountForEdit = async (countId: string) => {
      try {
        setLoadingProducts(true);
        const { data: countDoc, error: countErr } = await supabase
          .from('inventory_counts')
          .select('*, warehouses(name)')
          .eq('id', countId)
          .single();

        if (countErr || !countDoc) throw countErr || new Error('الجرد غير موجود');

        const { data: countItems, error: itemsErr } = await supabase
          .from('inventory_count_items')
          .select('*, products(*)')
          .eq('inventory_count_id', countId);

        if (itemsErr) throw itemsErr;

        setEditingCountId(countDoc.id);
        setEditingCountNumber(countDoc.count_number);
        setWarehouseId(countDoc.warehouse_id);
        setDate(countDoc.count_date);

        if (countItems && countItems.length > 0) {
          const mappedItems: CountTableItem[] = countItems.map(ci => {
            const prod = ci.products || {};
            const sysQty = Number(ci.system_quantity || 0);
            const actQty = Number(ci.counted_quantity || 0);
            const diff = Number(ci.difference !== undefined ? ci.difference : actQty - sysQty);
            return {
              productId: ci.product_id,
              productName: prod.name || 'صنف',
              productDescription: prod.description || '',
              sku: prod.sku || '',
              barcode: prod.barcode || '',
              barcode2: prod.barcode2 || '',
              purchasePrice: Number(prod.purchase_price || prod.cost || 0),
              systemQty: sysQty,
              actualQty: actQty,
              difference: diff,
              unit: prod.unit || 'قطعة',
              categoryId: prod.category_id || '',
              categoryName: '',
              notes: ci.notes || '',
              isCounted: true,
              searchableText: `${prod.name || ''} ${prod.sku || ''} ${prod.barcode || ''}`
            };
          });
          setItems(mappedItems);
        }
        showToast(`تم فتح كشف الجرد رقم (${countDoc.count_number}) للتعديل ✅`, 'info');
      } catch (err: any) {
        logger.error('Error loading count for edit:', err);
        showToast('فشل في تحميل كشف الجرد للتعديل: ' + (err?.message || ''), 'error');
      } finally {
        setLoadingProducts(false);
      }
    };

    loadCountForEdit(editId);
  }, [(location.state as any)?.editCountId]);

  // 🛡️ إشعار المستخدم باستعادة مسودة الجرد تلقائياً عند فتح الشاشة
  useEffect(() => {
    if (hasDraftRestored && items.length > 0 && !location.state?.editCountId) {
      showToast(`تمت استعادة كشف الجرد المخزني تلقائياً (${items.length} صنف) ✅`, 'info');
    }
  }, []);

  // 🛡️ حفظ مسودة كشف الجرد تلقائياً في التخزين الآمن عند أي تغيير
  useEffect(() => {
    if (!isMountedRef.current) {
      isMountedRef.current = true;
      return;
    }

    const timer = setTimeout(() => {
      if (items.length > 0 || warehouseId) {
        try {
          const nowStr = new Date().toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
          const draftPayload: InventoryCountDraftData = {
            warehouseId,
            date,
            items,
            includeServices,
            savedAt: nowStr,
            savedAtTimestamp: Date.now()
          };
          secureStorage.setItem(INVENTORY_COUNT_DRAFT_KEY, draftPayload);
          setLastAutoSaveTime(nowStr);
        } catch (e) {
          logger.error('Failed to save inventory count draft', e);
        }
      } else {
        clearInventoryCountDraft();
        setLastAutoSaveTime(null);
      }
    }, 400);

    return () => clearTimeout(timer);
  }, [warehouseId, date, items, includeServices]);

  // 🛡️ حماية ضد التحديث أو المغادرة غير المقصودة للصفحة أثناء وجود أصناف مدخلة
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (items.length > 0 || warehouseId) {
        // نضمن حفظ آخر مسودة فورياً وبشكل متزامن قبل الإغلاق أو الريفريش
        try {
          const nowStr = new Date().toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
          const draftPayload: InventoryCountDraftData = {
            warehouseId,
            date,
            items,
            includeServices,
            savedAt: nowStr,
            savedAtTimestamp: Date.now()
          };
          secureStorage.setItem(INVENTORY_COUNT_DRAFT_KEY, draftPayload);
        } catch {}

        e.preventDefault();
        e.returnValue = '';
        return '';
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [warehouseId, date, items, includeServices]);

  // 🛡️ مسح المسودة والبدء من جديد
  const handleClearDraft = () => {
    if (!window.confirm('هل أنت متأكد من مسح بيانات المسودة الحالية والبدء من جديد؟ سيتم تصفير كشف الجرد الحالي.')) {
      return;
    }
    clearInventoryCountDraft();
    setItems([]);
    setWarehouseId('');
    setHasDraftRestored(false);
    setDraftInfo(null);
    setLastAutoSaveTime(null);
    showToast('تم مسح المسودة وتصفير كشف الجرد بنجاح', 'info');
  };

  // بناء صنف كشف الجرد مع الفهرسة النصية والتطبيع الشامل للعربية
  const buildCountItem = (p: Record<string, any>, targetWhId: string): CountTableItem => {
    let currentQty = 0;
    
    // فحص رصيد المستودع (يدعم الكائن أو النص بصيغة JSON)
    let wStock = p.warehouse_stock || p.warehouseStock || {};
    if (typeof wStock === 'string') {
      try {
        wStock = JSON.parse(wStock);
      } catch {}
    }

    if (wStock && typeof wStock === 'object' && targetWhId && wStock[targetWhId] !== undefined) {
      currentQty = Number(wStock[targetWhId]) || 0;
    } else {
      currentQty = Number(p.stock || 0);
    }

    const skuVal = p.sku || p.code || '';
    const normName = normalizeArabic(p.name || '');
    const normSku = normalizeArabic(skuVal);
    const normBarcode = normalizeArabic(p.barcode || '');
    const normBarcode2 = normalizeArabic(p.barcode2 || '');
    const normDesc = normalizeArabic(p.description || '');
    
    // إيجاد اسم التصنيف
    const catObj = (categories || []).find(c => c.id === p.category_id);
    const categoryName = catObj?.name || p.category || '';
    const normCat = normalizeArabic(categoryName);

    const normUnitBarcodes = Array.isArray(p.unit_barcodes)
      ? p.unit_barcodes.map((ub: any) => normalizeArabic(ub?.barcode || '')).filter(Boolean).join(' ')
      : '';

    // توليد كلمات البحث مع وبدون الـ التعريفية لمطابقة فائقة الدقة
    const words = normName.split(/\s+/).filter(Boolean);
    const variations = words.map(w => w.startsWith('ال') && w.length > 3 ? w.slice(2) : `ال${w}`).join(' ');

    const searchableText = `${normName} ${variations} ${normSku} ${normBarcode} ${normBarcode2} ${normUnitBarcodes} ${normDesc} ${normCat}`;

    return {
      productId: p.id,
      productName: p.name || 'صنف بدون اسم',
      productDescription: p.description || '',
      sku: skuVal,
      barcode: p.barcode || '',
      barcode2: p.barcode2 || '',
      categoryId: p.category_id || '',
      categoryName: categoryName,
      unit: p.unit || p.uom || 'قطعة',
      purchasePrice: Number(p.purchase_price || p.cost || 0),
      systemQty: currentQty,
      actualQty: currentQty,
      difference: 0,
      notes: '',
      isCounted: false,
      searchableText
    };
  };

  // تمييز الصنف والتمرير إليه والتركيز على حقل الكمية
  const highlightAndFocusItem = (productId: string) => {
    setHighlightedProductId(productId);

    // البحث عن موقع الصنف في القائمة لتحديد الصفحة
    const itemIndex = items.findIndex(i => i.productId === productId);
    if (itemIndex >= 0 && pageSize !== -1) {
      const targetPage = Math.floor(itemIndex / pageSize) + 1;
      if (targetPage !== currentPage) {
        setCurrentPage(targetPage);
      }
    }

    setTimeout(() => {
      const inputEl = itemInputRefs.current[productId];
      if (inputEl) {
        inputEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
        inputEl.focus();
        inputEl.select();
      }
    }, 150);

    setTimeout(() => {
      setHighlightedProductId(null);
    }, 2500);
  };

  // بدء جرد كامل لكافة أصناف المستودع
  const handleStartCount = async () => {
    if (!warehouseId) {
      showToast('الرجاء اختيار المستودع أولاً', 'warning');
      return;
    }
    
    if (items.length > 0) {
      if (!window.confirm('لديك كشف جرد حالي يحتوي على أصناف وكميات مدخلة. هل أنت متأكد من إعادة تحميل كافة الأصناف وإعادة ضبط الكميات؟')) {
        return;
      }
    }

    setLoadingProducts(true);
    try {
      const prodsToUse = allAvailableProducts.length > 0 ? allAvailableProducts : await loadFreshProducts();

      const warehouseProducts = prodsToUse
        .filter((p: Record<string, any>) => {
          if (includeServices) return true;
          const type = String(p.product_type || p.item_type || 'STOCK').toUpperCase();
          return type !== 'SERVICE' && !p.is_service;
        })
        .map(p => buildCountItem(p, warehouseId));

      if (warehouseProducts.length === 0) {
        showToast('لا توجد أصناف قابلة للجرد في هذا المستودع', 'info');
      } else {
        setItems(warehouseProducts);
        setCurrentPage(1);
        showToast(`تم تجهيز وتحميل ${warehouseProducts.length} صنف للجرد بنجاح ✅`, 'success');
      }
    } catch (error: any) {
      logger.error("Error fetching products:", error);
      showToast("حدث خطأ أثناء جلب بيانات الأصناف: " + error.message, 'error');
    } finally {
      setLoadingProducts(false);
    }
  };

  // اختيار أو إضافة صنف فردي عبر البحث الذكي ProductSearchSelect (مثل شاشة التحويل)
  const handleSelectOrAddProduct = (productId: string, productObj?: any) => {
    if (!productId) return;
    if (!warehouseId) {
      showToast('الرجاء اختيار مستودع الجرد أولاً', 'warning');
      return;
    }

    const prod = productObj || allAvailableProducts.find(p => p.id === productId);
    if (!prod) return;

    const existingIndex = items.findIndex(i => i.productId === prod.id);

    if (existingIndex >= 0) {
      showToast(`الصنف موجود بالفعل في كشف الجرد: ${prod.name}`, 'info');
      highlightAndFocusItem(prod.id);
    } else {
      const newItem = buildCountItem(prod, warehouseId);
      newItem.isCounted = true;
      setItems(prev => [newItem, ...prev]);
      showToast(`تمت إضافة الصنف لكشف الجرد: ${prod.name}`, 'success');
      highlightAndFocusItem(prod.id);
    }
    setSelectedSearchProductId('');
  };

  const handleQuantityChange = (productId: string, actualQty: number) => {
    setItems(prev => prev.map(item => {
      if (item.productId === productId) {
        const val = isNaN(actualQty) ? 0 : actualQty;
        return { 
          ...item, 
          actualQty: val, 
          difference: Number((val - item.systemQty).toFixed(4)),
          isCounted: true 
        };
      }
      return item;
    }));
  };

  const handleRemoveItem = (productId: string) => {
    setItems(prev => prev.filter(item => item.productId !== productId));
    showToast('تم استبعاد الصنف من كشف الجرد الحالي', 'info');
  };

  const handleSaveCount = async (isFinal: boolean = false) => {
    if (items.length === 0) {
      showToast('لا توجد أصناف في كشف الجرد للحفظ', 'warning');
      return;
    }

    const validationResult = createInventoryCountSchema.safeParse({ warehouseId, date, items });
    if (!validationResult.success) {
      showToast(validationResult.error.issues[0].message, 'warning');
      return;
    }

    setSaving(true);
    try {
      let countDocId = editingCountId;

      if (editingCountId) {
        // تحديث كشف الجرد الحالي
        const { error: updateError } = await supabase
          .from('inventory_counts')
          .update({
            warehouse_id: warehouseId,
            count_date: date,
            status: 'draft',
            notes: `جرد مخزني فعلي (${items.length} صنف) - معدل`,
          })
          .eq('id', editingCountId);
        if (updateError) throw updateError;

        // حذف الأسطر القديمة وإعادة إدراج الأسطر المحدثة
        await supabase.from('inventory_count_items').delete().eq('inventory_count_id', editingCountId);

        const countItemsPayload = items.map(item => ({
          inventory_count_id: editingCountId,
          product_id: item.productId,
          system_quantity: item.systemQty,
          counted_quantity: item.actualQty,
          difference: item.difference,
          organization_id: orgId
        }));
        const { error: itemsError } = await supabase.from('inventory_count_items').insert(countItemsPayload);
        if (itemsError) throw itemsError;
      } else {
        const countNumber = `CNT-${Date.now().toString().slice(-6)}`;

        // 1. حفظ رأس الجرد الجديد
        const { data: countDoc, error: countError } = await supabase.from('inventory_counts').insert({
          warehouse_id: warehouseId,
          count_date: date,
          count_number: countNumber,
          status: 'draft',
          notes: `جرد مخزني فعلي (${items.length} صنف)`,
          organization_id: orgId
        }).select().single();

        if (countError) throw countError;
        countDocId = countDoc.id;

        // 2. حفظ تفاصيل الجرد
        const countItems = items.map(item => ({
          inventory_count_id: countDoc.id,
          product_id: item.productId,
          system_quantity: item.systemQty,
          counted_quantity: item.actualQty,
          difference: item.difference,
          organization_id: orgId
        }));

        const { error: itemsError } = await supabase.from('inventory_count_items').insert(countItems);
        if (itemsError) throw itemsError;
      }

      // 🚀 إذا كان المستخدم يريد الاعتماد الفوري، نستخدم المحرك المركزي (RPC)
      if (isFinal && countDocId) {
        const { error: postError } = await supabase.rpc('post_inventory_count', { 
          p_count_id: countDocId 
        });
        if (postError) throw postError;
        
        await recalculateStock();
        showToast('تم ترحيل الجرد واعتماد التسويات والقيود المحاسبية بنجاح ✅', 'success');
      } else {
        showToast(editingCountId ? 'تم حفظ تعديلات كشف الجرد بنجاح ✅' : 'تم حفظ كشف الجرد كمسودة بنجاح ✅', 'success');
      }

      // 🛡️ مسح المسودة المحلية بعد إتمام الحفظ بنجاح
      clearInventoryCountDraft();
      setHasDraftRestored(false);
      setDraftInfo(null);
      setLastAutoSaveTime(null);
      setItems([]);
      setWarehouseId('');
      setEditingCountId(null);
      setEditingCountNumber(null);
      navigate('/inventory-history');
    } catch (error: any) {
      logger.error('Error saving count:', error);
      showToast('حدث خطأ أثناء الحفظ: ' + (error?.message || ''), 'error');
    } finally {
      setSaving(false);
    }
  };

  // 🚀 الفلترة والبحث المتقدم باللغة العربية والباركود والكود
  const filteredItems = useMemo(() => {
    let result = items;

    if (selectedCategory !== 'all') {
      result = result.filter(i => i.categoryId === selectedCategory);
    }

    if (statusFilter === 'diff_only') {
      result = result.filter(i => i.difference !== 0);
    } else if (statusFilter === 'matched_only') {
      result = result.filter(i => i.difference === 0);
    } else if (statusFilter === 'surplus_only') {
      result = result.filter(i => i.difference > 0);
    } else if (statusFilter === 'shortage_only') {
      result = result.filter(i => i.difference < 0);
    } else if (statusFilter === 'zero_stock') {
      result = result.filter(i => i.systemQty === 0);
    }

    const cleanQuery = normalizeArabic(searchTerm);
    if (!cleanQuery) return result;

    const tokens = cleanQuery.split(/\s+/).filter(Boolean);
    if (tokens.length === 0) return result;

    return result.filter(item => {
      const searchable = item.searchableText || '';
      return tokens.every(token => {
        if (searchable.includes(token)) return true;
        if (token.startsWith('ال') && token.length > 3 && searchable.includes(token.slice(2))) return true;
        return false;
      });
    });
  }, [items, searchTerm, selectedCategory, statusFilter]);

  // إحصائيات سريعة
  const stats = useMemo(() => {
    const total = items.length;
    const matched = items.filter(i => i.difference === 0).length;
    const diff = items.filter(i => i.difference !== 0).length;
    const surplus = items.filter(i => i.difference > 0).length;
    const shortage = items.filter(i => i.difference < 0).length;
    const zeroStock = items.filter(i => i.systemQty === 0).length;
    const totalValueDiff = items.reduce((sum, item) => sum + (item.difference * item.purchasePrice), 0);
    return { total, matched, diff, surplus, shortage, zeroStock, totalValueDiff };
  }, [items]);

  // تقسيم الصفحات (Pagination)
  const totalPages = pageSize === -1 ? 1 : Math.ceil(filteredItems.length / pageSize) || 1;
  const paginatedItems = useMemo(() => {
    if (pageSize === -1) return filteredItems;
    const start = (currentPage - 1) * pageSize;
    return filteredItems.slice(start, start + pageSize);
  }, [filteredItems, currentPage, pageSize]);

  // معالجة مسح الباركود السريع (مع الإضافة التلقائية إذا لم يكن في القائمة)
  const handleBarcodeInput = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const code = barcodeInput.trim();
      if (!code) return;
      
      if (!warehouseId) {
        showToast('الرجاء اختيار مستودع الجرد أولاً', 'warning');
        return;
      }

      const scannedCode = code.toLowerCase();
      
      let product = allAvailableProducts.find((p: Record<string, any>) => 
        (p.barcode && String(p.barcode).trim().toLowerCase() === scannedCode) || 
        (p.sku && String(p.sku).trim().toLowerCase() === scannedCode) ||
        (p.barcode2 && String(p.barcode2).trim().toLowerCase() === scannedCode) ||
        (p.plu_number && String(p.plu_number).trim().toLowerCase() === scannedCode)
      );

      if (!product) {
        for (const p of allAvailableProducts) {
          if (Array.isArray((p as any).unit_barcodes)) {
            const foundUom = (p as any).unit_barcodes.find((ub: Record<string, any>) => ub.barcode && String(ub.barcode).trim().toLowerCase() === scannedCode);
            if (foundUom) {
              product = p;
              break;
            }
          }
        }
      }

      if (product) {
        const existingIdx = items.findIndex(item => item.productId === product.id);
        if (existingIdx >= 0) {
          setItems(prev => {
            const newItems = [...prev];
            const currentActual = Number(newItems[existingIdx].actualQty) || 0;
            const updatedActual = currentActual + 1;
            newItems[existingIdx] = {
              ...newItems[existingIdx],
              actualQty: updatedActual,
              difference: Number((updatedActual - newItems[existingIdx].systemQty).toFixed(4)),
              isCounted: true
            };
            return newItems;
          });
          showToast(`تم عد: ${product.name} (+1)`, 'success');
          highlightAndFocusItem(product.id);
        } else {
          // 🚀 إضافة الصنف فوراً لكشف الجرد إذا لم يكن موجوداً من قبل!
          const newItem = buildCountItem(product, warehouseId);
          newItem.actualQty = 1;
          newItem.difference = Number((1 - newItem.systemQty).toFixed(4));
          newItem.isCounted = true;
          setItems(prev => [newItem, ...prev]);
          showToast(`تمت إضافة وعد الصنف: ${product.name} (+1)`, 'success');
          highlightAndFocusItem(product.id);
        }
      } else {
        showToast(`لم يتم العثور على صنف بالباركود: ${code}`, 'error');
      }
      setBarcodeInput('');
    }
  };

  const handleZeroActuals = () => {
    if (!window.confirm('هل أنت متأكد من تصفير جميع الكميات الفعلية؟ (للجرد من الصفر - Blind Count)')) return;
    setItems(prev => prev.map(item => ({
      ...item,
      actualQty: 0,
      difference: 0 - item.systemQty,
      isCounted: true
    })));
    showToast('تم تصفير جميع الكميات الفعلية', 'info');
  };

  const handleMatchAllActuals = () => {
    if (!window.confirm('هل تريد مطابقة كافة الكميات الفعلية مع الأرصدة الدفترية؟')) return;
    setItems(prev => prev.map(item => ({
      ...item,
      actualQty: item.systemQty,
      difference: 0,
      isCounted: true
    })));
    showToast('تمت مطابقة الكميات الفعلية مع الأرصدة الدفترية', 'success');
  };

  return (
    <div className="space-y-6 pb-12">
      {/* رأس الصفحة */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-2xl sm:text-3xl font-black text-slate-800 flex items-center gap-3">
            <span className="p-2.5 bg-purple-100 text-purple-700 rounded-2xl shadow-sm">
              <Calculator className="w-7 h-7" />
            </span>
            جرد مخزني (مطابقة فعلية)
          </h2>
          <p className="text-slate-500 font-bold text-sm mt-1">
            مطابقة الرصيد الدفتري بالواقع الفعلي للأصناف وتعديل الفروقات المخزنية بدقة
          </p>
        </div>

        <div className="flex items-center gap-2">
          {items.length > 0 && (
            <span className="hidden sm:flex items-center gap-1.5 text-xs font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-3 py-2 rounded-xl shadow-2xs">
              <ShieldCheck size={15} className="text-emerald-600" />
              <span>الحفظ التلقائي مفعّل</span>
              {lastAutoSaveTime && <span className="text-[11px] font-mono text-emerald-600">({lastAutoSaveTime})</span>}
            </span>
          )}
          <button 
            type="button" 
            onClick={() => loadFreshProducts()} 
            disabled={loadingProducts}
            className="px-4 py-2.5 bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 rounded-xl font-bold text-xs flex items-center gap-2 shadow-xs transition-colors"
            title="تحديث قائمة الأصناف من السيرفر"
          >
            <RefreshCw size={15} className={loadingProducts ? "animate-spin text-purple-600" : "text-slate-400"} />
            تحديث الأصناف ({allAvailableProducts.length})
          </button>
        </div>
      </div>

      {/* 🛡️ شريط وضع تعديل كشف الجرد */}
      {editingCountNumber && (
        <div className="p-4 bg-amber-50 border border-amber-300 rounded-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs text-amber-950 shadow-xs animate-in fade-in">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-amber-500 text-white rounded-xl shadow-xs shrink-0">
              <Edit3 size={20} />
            </div>
            <div>
              <div className="font-black text-sm text-amber-900 flex items-center gap-2">
                <span>أنت الآن في وضع تعديل كشف الجرد رقم:</span>
                <span className="font-mono bg-white px-2.5 py-0.5 rounded-lg border border-amber-300 text-amber-900 font-black">
                  {editingCountNumber}
                </span>
              </div>
              <p className="text-amber-800 mt-0.5 font-medium">
                يمكنك تعديل الكميات الفعلية أو إضافة أصناف جديدة عبر الباركود، وعند الضغط على حفظ سيتم تحديث نفس كشف الجرد دون تكرار.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              setEditingCountId(null);
              setEditingCountNumber(null);
              setItems([]);
              clearInventoryCountDraft();
              showToast('تم الخروج من وضع التعديل', 'info');
            }}
            className="px-3.5 py-2 bg-white hover:bg-amber-100 text-amber-900 border border-amber-300 rounded-xl font-bold transition-colors flex items-center gap-1.5 shadow-xs shrink-0 self-end sm:self-center"
          >
            <RotateCcw size={14} /> إلغاء التعديل وبدء كشف جديد
          </button>
        </div>
      )}

      {/* 🛡️ شريط تنبيه استعادة كشف الجرد تلقائياً */}
      {hasDraftRestored && draftInfo && items.length > 0 && !editingCountNumber && (
        <div className="p-4 bg-gradient-to-r from-purple-50 via-amber-50/60 to-orange-50 border border-purple-200 rounded-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs text-purple-950 shadow-xs animate-in fade-in">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-purple-600 text-white rounded-xl shadow-xs shrink-0">
              <Sparkles size={20} />
            </div>
            <div>
              <div className="font-black text-sm text-purple-950 flex items-center gap-2">
                <span>تمت استعادة كشف الجرد المخزني المحفوظ تلقائياً ({items.length} صنف)</span>
                {draftInfo.savedAt && (
                  <span className="text-[11px] font-mono font-bold bg-purple-100 text-purple-800 px-2 py-0.5 rounded-md border border-purple-200 flex items-center gap-1">
                    <Clock size={11} /> آخر حفظ: {draftInfo.savedAt}
                  </span>
                )}
              </div>
              <p className="text-slate-600 mt-1 font-medium">
                تم الاحتفاظ بكافة بيانات المستودع والأصناف والكميات الفعلية المدخلة لحماية عملك من الضياع عند إعادة تحميل الشاشة أو تحديث المتصفح.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
            <button
              type="button"
              onClick={handleClearDraft}
              className="px-3.5 py-2 bg-white hover:bg-red-50 text-red-700 border border-red-200 rounded-xl font-bold transition-colors flex items-center gap-1.5 shadow-xs"
              title="تصفير القائمة وحذف المسودة المحفوظة"
            >
              <RotateCcw size={14} /> مسح المسودة وبدء جديد
            </button>
            <button
              type="button"
              onClick={() => setHasDraftRestored(false)}
              className="p-2 hover:bg-purple-100 text-slate-400 hover:text-purple-700 rounded-xl transition-colors"
              title="إخفاء التنبيه"
            >
              <X size={16} />
            </button>
          </div>
        </div>
      )}

      {/* قسم الإعدادات وبدء الجرد */}
      <div className="bg-white p-6 rounded-[28px] shadow-sm border border-slate-200 space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-end">
          <div>
            <label className="block text-xs font-black text-slate-500 mb-2 uppercase tracking-wider">مستودع الجرد</label>
            <select 
              value={warehouseId} 
              onChange={e => {
                const newWh = e.target.value;
                if (items.length > 0 && newWh !== warehouseId) {
                  if (window.confirm('تغيير المستودع سيقوم بإعادة ضبط قائمة الجرد الحالية ومسح المسودة، هل تريد المتابعة؟')) {
                    setWarehouseId(newWh);
                    setItems([]);
                    clearInventoryCountDraft();
                    setHasDraftRestored(false);
                    setDraftInfo(null);
                    setLastAutoSaveTime(null);
                  }
                } else {
                  setWarehouseId(newWh);
                }
              }}
              className="w-full border-2 border-slate-100 rounded-2xl px-4 py-3 font-bold text-slate-700 focus:border-purple-500 focus:bg-white outline-none bg-slate-50 transition-all text-sm"
            >
              <option value="">-- اختر المستودع المطلوب جرده --</option>
              {warehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
            </select>
          </div>

          <div>
            <label className="block text-xs font-black text-slate-500 mb-2 uppercase tracking-wider">تاريخ الجرد</label>
            <input 
              type="date" 
              value={date} 
              onChange={e => setDate(e.target.value)} 
              className="w-full border-2 border-slate-100 rounded-2xl px-4 py-3 font-bold text-slate-700 outline-none focus:border-purple-500 focus:bg-white bg-slate-50 transition-all text-sm" 
            />
          </div>

          <div className="flex gap-2">
            <button 
              onClick={handleStartCount} 
              disabled={loadingProducts || !warehouseId} 
              className="flex-1 bg-purple-600 text-white py-3 px-5 rounded-2xl font-black shadow-lg shadow-purple-100 hover:bg-purple-700 active:scale-95 transition-all flex items-center justify-center gap-2 disabled:opacity-50 text-sm"
            >
              {loadingProducts ? <Loader2 className="animate-spin" size={18} /> : <RefreshCw size={18} />} 
              {loadingProducts ? 'جاري التحضير...' : (items.length === 0 ? 'بدء جرد شامل للمستودع' : 'إعادة تحميل كل الأصناف')}
            </button>

            {items.length > 0 && (
              <button 
                onClick={handleClearDraft} 
                className="px-4 bg-red-50 text-red-600 rounded-2xl font-bold border border-red-100 hover:bg-red-100 transition-colors text-sm"
                title="إلغاء الجرد وتصفير القائمة ومسح المسودة"
              >
                إلغاء
              </button>
            )}
          </div>
        </div>

        {/* 🚀 شريط البحث السريع والإضافة الفورية للصنف (مطابق لشاشات التحويل والمخازن) */}
        <div className="p-4 bg-gradient-to-r from-purple-50 via-indigo-50/40 to-slate-50 rounded-2xl border border-purple-100 flex flex-col md:flex-row gap-4 items-center justify-between">
          <div className="w-full md:w-3/5">
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-black text-purple-900 flex items-center gap-1.5">
                <Search size={14} className="text-purple-600" />
                البحث السريع عن صنف وإضافته للجرد (مثل التحويل والمخازن):
              </label>
              <span className="text-[11px] font-bold text-purple-600">
                {items.length > 0 ? `في القائمة: ${items.length} صنف` : 'يمكنك البدء بإضافة صنف فردي أو جرد شامل'}
              </span>
            </div>
            <ProductSearchSelect
              products={allAvailableProducts}
              value={selectedSearchProductId}
              onChange={(prodId, prod) => handleSelectOrAddProduct(prodId, prod)}
              warehouseId={warehouseId}
              clearOnSelect={true}
              disabled={!warehouseId}
              placeholder={warehouseId ? "ابحث بالاسم، الكود (SKU)، أو الباركود لإظهاره أو إضافته للجرد فوراً..." : "اختر المستودع أولاً لتفعيل البحث السريع..."}
            />
          </div>

          <div className="w-full md:w-2/5 flex flex-wrap items-center justify-end gap-3 text-xs">
            <label className="flex items-center gap-1.5 text-slate-600 font-bold cursor-pointer select-none">
              <input 
                type="checkbox" 
                checked={includeServices} 
                onChange={e => setIncludeServices(e.target.checked)} 
                className="rounded text-purple-600 focus:ring-purple-500" 
              />
              <span>تضمين الخدمات في الجرد الشامل</span>
            </label>

            <span className="bg-white px-3 py-1.5 rounded-xl border border-purple-200 text-purple-800 font-bold shadow-xs">
              قاعدة الأصناف: <strong>{allAvailableProducts.length}</strong> صنف
            </span>
          </div>
        </div>

        {/* بطاقات الإحصائيات إذا تم فتح الجرد */}
        {items.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 pt-2">
            <div className="bg-slate-50 p-3 rounded-2xl border border-slate-100 text-center">
              <span className="block text-[11px] font-black text-slate-400">إجمالي الأصناف</span>
              <span className="text-lg font-black text-slate-800 font-mono">{stats.total}</span>
            </div>
            <div 
              onClick={() => setStatusFilter(statusFilter === 'matched_only' ? 'all' : 'matched_only')}
              className={`p-3 rounded-2xl border text-center cursor-pointer transition-all ${statusFilter === 'matched_only' ? 'bg-emerald-100 border-emerald-300 ring-2 ring-emerald-400' : 'bg-emerald-50 border-emerald-100 hover:bg-emerald-100/70'}`}
            >
              <span className="block text-[11px] font-black text-emerald-600">أصناف متطابقة</span>
              <span className="text-lg font-black text-emerald-700 font-mono">{stats.matched}</span>
            </div>
            <div 
              onClick={() => setStatusFilter(statusFilter === 'diff_only' ? 'all' : 'diff_only')}
              className={`p-3 rounded-2xl border text-center cursor-pointer transition-all ${statusFilter === 'diff_only' ? 'bg-amber-100 border-amber-300 ring-2 ring-amber-400' : 'bg-amber-50 border-amber-100 hover:bg-amber-100/70'}`}
            >
              <span className="block text-[11px] font-black text-amber-600">بها انحراف/فروقات</span>
              <span className="text-lg font-black text-amber-700 font-mono">{stats.diff}</span>
            </div>
            <div 
              onClick={() => setStatusFilter(statusFilter === 'surplus_only' ? 'all' : 'surplus_only')}
              className={`p-3 rounded-2xl border text-center cursor-pointer transition-all ${statusFilter === 'surplus_only' ? 'bg-blue-100 border-blue-300 ring-2 ring-blue-400' : 'bg-blue-50 border-blue-100 hover:bg-blue-100/70'}`}
            >
              <span className="block text-[11px] font-black text-blue-600">فائض (+)</span>
              <span className="text-lg font-black text-blue-700 font-mono">{stats.surplus}</span>
            </div>
            <div 
              onClick={() => setStatusFilter(statusFilter === 'shortage_only' ? 'all' : 'shortage_only')}
              className={`p-3 rounded-2xl border text-center cursor-pointer transition-all ${statusFilter === 'shortage_only' ? 'bg-red-100 border-red-300 ring-2 ring-red-400' : 'bg-red-50 border-red-100 hover:bg-red-100/70'}`}
            >
              <span className="block text-[11px] font-black text-red-600">عجز (-)</span>
              <span className="text-lg font-black text-red-700 font-mono">{stats.shortage}</span>
            </div>
            <div className={`p-3 rounded-2xl border text-center ${stats.totalValueDiff >= 0 ? 'bg-purple-50 border-purple-100 text-purple-700' : 'bg-red-50 border-red-100 text-red-700'}`}>
              <span className="block text-[11px] font-black opacity-70">صافي قيمة الفروقات</span>
              <span className="text-sm font-black font-mono">{stats.totalValueDiff.toLocaleString()} {currency}</span>
            </div>
          </div>
        )}
      </div>

      {/* قسم جدول كشف الجرد والبحث المتقدم */}
      {items.length > 0 && (
        <div className="bg-white rounded-[32px] border border-slate-200 shadow-sm overflow-hidden animate-in fade-in slide-in-from-bottom-3">
          {/* شريط أدوات الفلترة والبحث داخل الجدول */}
          <div className="p-4 sm:p-5 border-b border-slate-100 bg-slate-50/50 flex flex-wrap items-center justify-between gap-4">
            <div className="flex flex-wrap items-center gap-3 flex-1 min-w-[320px]">
              {/* البحث النصي الموحد داخل الجدول */}
              <div className="relative w-full sm:w-72">
                <Search className="absolute right-3.5 top-3 text-slate-400" size={17} />
                <input 
                  type="text" 
                  placeholder="ابحث بالاسم، الكود SKU، الباركود..." 
                  value={searchTerm} 
                  onChange={e => {
                    setSearchTerm(e.target.value);
                    setCurrentPage(1);
                  }}
                  className="w-full pr-10 pl-9 py-2.5 bg-white border border-slate-200 rounded-xl text-xs sm:text-sm focus:border-purple-500 focus:ring-2 focus:ring-purple-100 outline-none font-bold text-slate-800 placeholder-slate-400 transition-all shadow-xs" 
                />
                {searchTerm && (
                  <button 
                    onClick={() => setSearchTerm('')} 
                    className="absolute left-3 top-3 text-slate-400 hover:text-slate-600"
                    title="مسح البحث"
                  >
                    <X size={15} />
                  </button>
                )}
              </div>

              {/* قارئ الباركود السريع بالهاند هيلد أو الكيبورد */}
              <div className="relative w-full sm:w-60">
                <Scan className="absolute right-3.5 top-3 text-blue-500 animate-pulse" size={17} />
                <input 
                  type="text" 
                  placeholder="مسح باركود هنا (+1)..." 
                  value={barcodeInput} 
                  onChange={e => setBarcodeInput(e.target.value)}
                  onKeyDown={handleBarcodeInput}
                  className="w-full pr-10 pl-4 py-2.5 bg-blue-50/60 border border-blue-200 rounded-xl text-xs sm:text-sm focus:border-blue-500 focus:bg-white outline-none font-bold text-blue-900 placeholder-blue-400 transition-all shadow-xs" 
                />
              </div>

              {/* فلترة التصنيفات */}
              <select
                value={selectedCategory}
                onChange={e => {
                  setSelectedCategory(e.target.value);
                  setCurrentPage(1);
                }}
                className="bg-white border border-slate-200 text-slate-700 text-xs font-bold rounded-xl px-3 py-2.5 outline-none focus:border-purple-500 shadow-xs"
              >
                <option value="all">-- كافة التصنيفات ({categories.length}) --</option>
                {categories.map(cat => (
                  <option key={cat.id} value={cat.id}>{cat.name}</option>
                ))}
              </select>

              {/* فلترة حالة الصنف */}
              <select
                value={statusFilter}
                onChange={e => {
                  setStatusFilter(e.target.value as any);
                  setCurrentPage(1);
                }}
                className="bg-white border border-slate-200 text-slate-700 text-xs font-bold rounded-xl px-3 py-2.5 outline-none focus:border-purple-500 shadow-xs"
              >
                <option value="all">عرض الكل ({items.length})</option>
                <option value="diff_only">فروقات فقط ({stats.diff})</option>
                <option value="matched_only">متطابق فقط ({stats.matched})</option>
                <option value="surplus_only">فائض فقط (+) ({stats.surplus})</option>
                <option value="shortage_only">عجز فقط (-) ({stats.shortage})</option>
                <option value="zero_stock">رصيد دفتري صفر ({stats.zeroStock})</option>
              </select>
            </div>

            {/* أدوات سريعة للأرصدة */}
            <div className="flex items-center gap-2">
              <button 
                type="button" 
                onClick={handleMatchAllActuals}
                className="px-3 py-2 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 rounded-xl font-bold text-xs flex items-center gap-1.5 transition-colors border border-emerald-200"
                title="جعل الكميات الفعلية مطابقة للأرصدة الدفترية"
              >
                <CheckCheck size={15} />
                مطابقة الكل
              </button>
              <button 
                type="button" 
                onClick={handleZeroActuals}
                className="px-3 py-2 bg-slate-100 text-slate-700 hover:bg-slate-200 rounded-xl font-bold text-xs flex items-center gap-1.5 transition-colors border border-slate-200"
                title="تصفير كافة الكميات الفعلية (جرد أعمى من الصفر)"
              >
                <RotateCcw size={15} />
                تصفير الفعلي
              </button>
            </div>
          </div>

          {/* معلومات نتائج الفلترة */}
          <div className="px-6 py-2.5 bg-slate-100/70 border-b border-slate-200 text-xs text-slate-500 font-bold flex justify-between items-center">
            <span>
              عرض <strong className="text-slate-800">{filteredItems.length}</strong> من إجمالي <strong className="text-slate-800">{items.length}</strong> صنف في الكشف
              {searchTerm && <span className="text-purple-700 mr-2 font-black">(مفلتر بـ: "{searchTerm}")</span>}
            </span>

            <div className="flex items-center gap-2">
              <span>لكل صفحة:</span>
              <select 
                value={pageSize} 
                onChange={e => {
                  setPageSize(Number(e.target.value));
                  setCurrentPage(1);
                }}
                className="bg-white border border-slate-200 rounded-lg px-2 py-1 text-xs font-bold outline-none"
              >
                <option value={25}>25</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
                <option value={-1}>عرض الكل</option>
              </select>
            </div>
          </div>

          {/* جدول الأصناف */}
          <div className="overflow-x-auto">
            <table className="w-full text-right text-sm">
              <thead className="bg-slate-50 text-slate-600 font-black border-b border-slate-200 text-xs">
                <tr>
                  <th className="py-3.5 px-4 w-12 text-center">#</th>
                  <th className="py-3.5 px-6">بيانات الصنف (الاسم / الكود / الباركود)</th>
                  <th className="py-3.5 px-4 text-center">الوحدة</th>
                  <th className="py-3.5 px-4 text-center">الرصيد الدفتري</th>
                  <th className="py-3.5 px-6 text-center w-36">الرصيد الفعلي</th>
                  <th className="py-3.5 px-4 text-center">الفرق (الكمية)</th>
                  <th className="py-3.5 px-4 text-center">قيمة الفرق</th>
                  <th className="py-3.5 px-4 text-center w-12"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {paginatedItems.map((item, idx) => {
                  const itemIndex = (pageSize === -1 ? 0 : (currentPage - 1) * pageSize) + idx + 1;
                  const isHighlighted = highlightedProductId === item.productId;
                  const valueDiff = Number((item.difference * item.purchasePrice).toFixed(2));

                  return (
                    <tr 
                      key={item.productId} 
                      className={`transition-colors ${isHighlighted ? 'bg-purple-100/80 ring-2 ring-purple-400' : 'hover:bg-slate-50/70'}`}
                    >
                      <td className="py-3.5 px-4 text-center text-xs font-mono text-slate-400">
                        {itemIndex}
                      </td>

                      <td className="py-3.5 px-6">
                        <div className="flex flex-col gap-1">
                          <span className="font-black text-slate-800 text-sm">{item.productName}</span>
                          <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                            {item.sku && (
                              <span className="bg-slate-100 text-slate-600 px-2 py-0.5 rounded font-mono font-bold border border-slate-200">
                                كود: {item.sku}
                              </span>
                            )}
                            {item.barcode && (
                              <span className="bg-blue-50 text-blue-700 px-2 py-0.5 rounded font-mono font-bold border border-blue-200 flex items-center gap-1">
                                <BarcodeIcon size={11} /> {item.barcode}
                              </span>
                            )}
                            {item.categoryName && (
                              <span className="bg-purple-50 text-purple-700 px-2 py-0.5 rounded font-bold border border-purple-200">
                                {item.categoryName}
                              </span>
                            )}
                          </div>
                        </div>
                      </td>

                      <td className="py-3.5 px-4 text-center text-xs font-bold text-slate-500">
                        {item.unit}
                      </td>

                      <td className="py-3.5 px-4 text-center font-mono font-bold text-slate-600 text-sm">
                        {item.systemQty}
                      </td>

                      <td className="py-3.5 px-6 text-center">
                        <div className="flex items-center justify-center gap-1">
                          <button 
                            type="button" 
                            onClick={() => handleQuantityChange(item.productId, (Number(item.actualQty) || 0) - 1)}
                            className="w-7 h-7 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg font-bold flex items-center justify-center transition-colors text-sm"
                            title="إنقاص 1"
                          >
                            -
                          </button>
                          <input 
                            ref={el => { itemInputRefs.current[item.productId] = el; }}
                            type="number" 
                            step="any"
                            value={item.actualQty} 
                            onChange={e => handleQuantityChange(item.productId, parseFloat(e.target.value))}
                            className="w-20 text-center border-2 border-slate-200 rounded-xl py-1.5 font-black text-slate-800 text-sm focus:border-purple-500 focus:bg-white outline-none bg-slate-50 transition-all font-mono"
                          />
                          <button 
                            type="button" 
                            onClick={() => handleQuantityChange(item.productId, (Number(item.actualQty) || 0) + 1)}
                            className="w-7 h-7 bg-purple-100 hover:bg-purple-200 text-purple-700 rounded-lg font-bold flex items-center justify-center transition-colors text-sm"
                            title="زيادة 1"
                          >
                            +
                          </button>
                        </div>
                      </td>

                      <td className="py-3.5 px-4 text-center font-mono font-bold">
                        {item.difference === 0 ? (
                          <span className="px-2.5 py-1 rounded-lg text-xs bg-slate-100 text-slate-500">0</span>
                        ) : item.difference > 0 ? (
                          <span className="px-2.5 py-1 rounded-lg text-xs bg-emerald-100 text-emerald-800 font-black">
                            +{item.difference}
                          </span>
                        ) : (
                          <span className="px-2.5 py-1 rounded-lg text-xs bg-red-100 text-red-800 font-black">
                            {item.difference}
                          </span>
                        )}
                      </td>

                      <td className="py-3.5 px-4 text-center font-mono text-xs font-bold text-slate-600">
                        {valueDiff.toLocaleString()} {currency}
                      </td>

                      <td className="py-3.5 px-4 text-center">
                        <button 
                          type="button" 
                          onClick={() => handleRemoveItem(item.productId)}
                          className="p-1.5 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                          title="استبعاد هذا الصنف من الجرد"
                        >
                          <Trash2 size={16} />
                        </button>
                      </td>
                    </tr>
                  );
                })}

                {filteredItems.length === 0 && (
                  <tr>
                    <td colSpan={8} className="py-12 text-center text-slate-400">
                      <Package size={36} className="mx-auto mb-2 opacity-40 text-slate-400" />
                      <p className="font-bold text-sm">لا توجد أصناف مطابقة للبحث أو الفلتر المحدد</p>
                      {searchTerm && (
                        <button 
                          onClick={() => setSearchTerm('')} 
                          className="mt-2 text-xs font-bold text-purple-600 hover:underline"
                        >
                          مسح عبارة البحث وعرض كافة الأصناف
                        </button>
                      )}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* شريط التحكم بالصفحات إذا كان التصفح مفعلاً */}
          {pageSize !== -1 && totalPages > 1 && (
            <div className="p-4 border-t border-slate-100 bg-white flex justify-between items-center text-xs font-bold text-slate-600">
              <button 
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))} 
                disabled={currentPage === 1}
                className="px-3 py-1.5 border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-40 flex items-center gap-1"
              >
                <ChevronRight size={14} /> السابق
              </button>

              <span>
                صفحة <strong className="text-purple-700 font-mono text-sm">{currentPage}</strong> من <strong className="font-mono text-sm">{totalPages}</strong>
              </span>

              <button 
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} 
                disabled={currentPage === totalPages}
                className="px-3 py-1.5 border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-40 flex items-center gap-1"
              >
                التالي <ChevronLeft size={14} />
              </button>
            </div>
          )}

          {/* شريط الحفظ والترحيل السفلي */}
          <div className="bg-slate-900 p-6 flex flex-col sm:flex-row justify-between items-center gap-4 text-white">
            <div className="text-sm font-bold opacity-75">
              💡 يمكنك حفظ كشف الجرد كمسودة للمراجعة لاحقاً، أو اعتماده فوراً لتحديث أرصدة المخازن والقيود المحاسبية.
            </div>

            <div className="flex items-center gap-3 w-full sm:w-auto">
              <button 
                onClick={() => handleSaveCount(false)} 
                disabled={saving} 
                className="flex-1 sm:flex-none bg-slate-800 hover:bg-slate-700 text-white px-6 py-3 rounded-2xl font-bold transition-all disabled:opacity-50 text-sm border border-slate-700"
              >
                حفظ كمسودة
              </button>

              <button 
                onClick={() => handleSaveCount(true)} 
                disabled={saving} 
                className="flex-1 sm:flex-none bg-purple-600 hover:bg-purple-500 text-white px-7 py-3 rounded-2xl font-black shadow-xl shadow-purple-900/50 flex items-center justify-center gap-2 transition-all active:scale-95 disabled:opacity-50 text-sm"
              >
                {saving ? <Loader2 className="animate-spin" size={18} /> : <CheckCircle2 size={18} />} 
                {saving ? 'جاري المعالجة...' : 'اعتماد وترحيل فوري'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default InventoryCountForm;

type DynamicParam = any;
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { logger } from '../../utils/logger';
import { useLocation, useNavigate } from 'react-router-dom';
import { supabase } from '../../supabaseClient';
import { useAccounting } from '../../context/AccountingContext';
import { useToast } from '../../context/ToastContext';
import { 
  ArrowRightLeft, Save, Plus, Trash2, Package, Loader2, 
  Barcode, AlertTriangle, CheckCircle2, Warehouse, FileText, 
  List, Minus, Sparkles, AlertCircle, Calculator, Box, 
  Layers, X, Check, RefreshCw, Info, Edit3, ChevronRight, CornerDownLeft
} from 'lucide-react';
import { createStockTransferSchema } from '../../utils/validationSchemas';
import ProductSearchSelect, { getProductWarehouseStock } from '../../components/ProductSearchSelect';
import { secureStorage } from '../../utils/securityMiddleware';
import { getActiveOrgIdSync, resolveActiveOrgId } from '../../services/tenantContext';
import {
  PackagingRule,
  SavedPackagingHierarchy,
  TransferItem,
  StockTransferDraftData,
  DRAFT_STORAGE_KEY,
  getStockTransferDraft,
  clearStockTransferDraft,
  buildAvailablePackagingRules,
} from './utils/stockTransferPackaging';
import { StockTransferItemsTable } from './components/StockTransferItemsTable';
import { StockTransferPackagingModal } from './components/StockTransferPackagingModal';

export type {
  PackagingRule,
  SavedPackagingHierarchy,
  TransferItem,
  StockTransferDraftData,
};
export { getStockTransferDraft, clearStockTransferDraft };

const StockTransfer = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { warehouses, products, recalculateStock, currentUser, currentSelectedOrgId } = useAccounting();
  const { showToast } = useToast();
  const [loading, setLoading] = useState(false);
  const [systemUoms, setSystemUoms] = useState<any[]>([]);
  
  // استرجاع فوري متزامن للمسودة عند أول تصيير لمنع أي وميض أو تصفير بالخطأ
  const [formData, setFormData] = useState(() => {
    const defaultData = {
      date: new Date().toISOString().split('T')[0],
      fromWarehouseId: '',
      toWarehouseId: '',
      notes: ''
    };
    if (location.state?.editTransferId) return defaultData;
    const draft = getStockTransferDraft();
    if (draft?.formData) {
      return {
        ...defaultData,
        ...draft.formData,
        date: draft.formData.date || defaultData.date
      };
    }
    return defaultData;
  });

  const [items, setItems] = useState<TransferItem[]>(() => {
    if (location.state?.editTransferId) return [];
    const draft = getStockTransferDraft();
    if (draft?.items && Array.isArray(draft.items) && draft.items.length > 0) {
      return draft.items;
    }
    return [];
  });

  const [selectedProductId, setSelectedProductId] = useState('');
  const [enteredQty, setEnteredQty] = useState<number>(1);
  const [selectedUnitName, setSelectedUnitName] = useState<string>('');
  const [selectedUnitRatio, setSelectedUnitRatio] = useState<number>(1);
  const [packagingNote, setPackagingNote] = useState<string>('');
  const [filterAvailableOnly, setFilterAvailableOnly] = useState(false);
  const [barcodeInput, setBarcodeInput] = useState('');
  
  const [hasDraftRestored, setHasDraftRestored] = useState<boolean>(() => {
    if (location.state?.editTransferId) return false;
    const draft = getStockTransferDraft();
    return !!(draft && ((draft.items && draft.items.length > 0) || draft.formData?.fromWarehouseId || draft.formData?.toWarehouseId || draft.formData?.notes));
  });

  const isMountedRef = useRef(false);
  const isSubmittingRef = useRef(false);
  const [editingTransferId, setEditingTransferId] = useState<string | null>(null);
  const [editingTransferNumber, setEditingTransferNumber] = useState<string | null>(null);
  const [isLoadingTransfer, setIsLoadingTransfer] = useState(false);

  // حالة نافذة إعداد عبوات وتجزئة الصنف (هرمية متعددة المستويات / مباشرة)
  const [isPackagingModalOpen, setIsPackagingModalOpen] = useState(false);
  const [calcMode, setCalcMode] = useState<'hierarchy' | 'single'>('hierarchy');

  // حقول شجرة التعبئة متعددة المستويات (كرتونة -> علبة -> كيس/باكو)
  const [bulkUnitName, setBulkUnitName] = useState('');
  const [mediumUnitsPerBulk, setMediumUnitsPerBulk] = useState<number>(4);
  const [mediumUnitName, setMediumUnitName] = useState('');
  const [smallUnitsPerMedium, setSmallUnitsPerMedium] = useState<number>(12);
  const [smallUnitName, setSmallUnitName] = useState('');
  const [baseQtyPerSmallUnit, setBaseQtyPerSmallUnit] = useState<number>(1);

  // اختيار وحدة السحب المباشر من داخل نافذة الحاسبة
  const [targetWithdrawalTier, setTargetWithdrawalTier] = useState<'small' | 'medium' | 'bulk'>('small');
  const [withdrawalQty, setWithdrawalQty] = useState<number>(1);

  // حقول العبوة المباشرة البسيطة (شيكارة / صفيحة / زجاجة / برطمان / قالب / كيس مباشر)
  const [singleUnitName, setSingleUnitName] = useState('');
  const [singleUnitCapacity, setSingleUnitCapacity] = useState<number>(1);
  const [singleWithdrawalQty, setSingleWithdrawalQty] = useState<number>(1);

  const barcodeInputRef = useRef<HTMLInputElement>(null);
  const productSearchInputRef = useRef<HTMLInputElement>(null);
  const qtyInputRef = useRef<HTMLInputElement>(null);

  // جلب وحدات القياس المسجلة بالنظام
  useEffect(() => {
    const fetchUoms = async () => {
      try {
        const explicitOrgId = currentSelectedOrgId || (currentUser as any)?.organization_id || (currentUser as any)?.user_metadata?.org_id;
        const orgId = getActiveOrgIdSync(explicitOrgId) || await resolveActiveOrgId(explicitOrgId);
        let query = supabase.from('uoms').select('id, name, ratio, uom_type, category_id, organization_id');
        if (orgId) {
          query = query.eq('organization_id', orgId);
        }
        const { data } = await query;
        if (data) setSystemUoms(data);
      } catch (err) {
        logger.error('Error fetching system uoms:', err);
      }
    };
    fetchUoms();
  }, [currentUser, currentSelectedOrgId]);

  // إشعار المستخدم باستعادة المسودة تلقائياً عند فتح الشاشة
  useEffect(() => {
    if (!location.state?.editTransferId && hasDraftRestored) {
      showToast('تمت استعادة مسودة التحويل المخزني غير المكتملة تلقائياً ✅', 'info');
    }
  }, []);

  // حفظ مسودة التحويل تلقائياً عند أي تغيير (فقط عند عدم العمل في وضع التعديل)
  useEffect(() => {
    if (!isMountedRef.current) {
      isMountedRef.current = true;
      return;
    }
    if (editingTransferId || location.state?.editTransferId) return;

    const hasData = items.length > 0 || formData.fromWarehouseId || formData.toWarehouseId || (formData.notes && formData.notes.trim());
    if (hasData) {
      try {
        secureStorage.setItem(DRAFT_STORAGE_KEY, { formData, items });
      } catch (e) {
        logger.error('Failed to save draft', e);
      }
    } else {
      clearStockTransferDraft();
    }
  }, [formData, items, editingTransferId, location.state?.editTransferId]);

  // 🛡️ حماية ضد التحديث أو المغادرة غير المقصودة للصفحة أثناء وجود أصناف مدخلة
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if ((items.length > 0 || formData.fromWarehouseId) && !editingTransferId) {
        e.preventDefault();
        e.returnValue = '';
        return '';
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [items.length, formData.fromWarehouseId, editingTransferId]);

  // مسح المسودة والبدء من جديد
  const handleClearDraft = () => {
    if (!window.confirm('هل أنت متأكد من مسح بيانات المسودة الحالية والبدء من جديد؟')) return;
    clearStockTransferDraft();
    setItems([]);
    setFormData({
      date: new Date().toISOString().split('T')[0],
      fromWarehouseId: '',
      toWarehouseId: '',
      notes: ''
    });
    setHasDraftRestored(false);
    showToast('تم مسح المسودة والبدء من جديد', 'info');
  };

  // إذا تم التوجيه إلى الصفحة مع صنف محدد مسبقاً أو مع تحويل للتعديل
  useEffect(() => {
    if (location.state?.productId) {
      setSelectedProductId(location.state.productId);
    }
    if (location.state?.editTransferId) {
      loadTransferForEdit(location.state.editTransferId);
    }
  }, [location.state]);

  const loadTransferForEdit = async (transferId: string) => {
    setIsLoadingTransfer(true);
    try {
      let transferData: Record<string, any> | null = null;
      let transferItems: Array<{ product_id: string; quantity: number | string; uom_id?: string; products?: { id?: string; name?: string; unit?: string; sku?: string } }> = [];

      if (currentUser?.role !== 'demo') {
        const { data, error } = await supabase
          .from('stock_transfers')
          .select(`
            *,
            stock_transfer_items (
              id,
              product_id,
              quantity,
              uom_id,
              products (id, name, unit, sku, base_uom_id)
            )
          `)
          .eq('id', transferId)
          .single();

        if (error) throw error;
        transferData = data;
        transferItems = data?.stock_transfer_items || [];
      } else {
        transferData = location.state?.transfer;
        transferItems = transferData?.stock_transfer_items || [];
      }

      if (!transferData) {
        showToast('لم يتم العثور على بيانات التحويل المطلوب تعديله', 'error');
        return;
      }

      setEditingTransferId(transferData.id);
      setEditingTransferNumber(transferData.transfer_number || transferData.id);

      // استبعاد نص التعبئة المدمج تلقائياً لإبقاء ملاحظات المستخدم نقية
      let rawNotes = transferData.notes || '';
      const notesClean = rawNotes.replace(/\[تفاصيل السحب والتعبئة:.*?\]/g, '').trim();

      setFormData({
        date: transferData.transfer_date || new Date().toISOString().split('T')[0],
        fromWarehouseId: transferData.from_warehouse_id || '',
        toWarehouseId: transferData.to_warehouse_id || '',
        notes: notesClean
      });

      const loadedItems: TransferItem[] = (transferItems || []).map(ti => {
        const prod = products.find(p => p.id === ti.product_id) || ti.products;
        const unitName = prod?.unit || ti.products?.unit || 'وحدة';
        const qty = Number(ti.quantity) || 0;
        return {
          productId: ti.product_id,
          productName: prod?.name || ti.products?.name || 'صنف',
          sku: prod?.sku || ti.products?.sku || '',
          baseUnit: unitName,
          baseQuantity: qty,
          selectedUnit: unitName,
          enteredQty: qty,
          conversionRatio: 1,
          quantity: qty,
          uomId: ti.uom_id || undefined
        };
      });

      setItems(loadedItems);
      showToast(`تم فتح التحويل المخزني (${transferData.transfer_number || transferData.id}) في وضع التعديل ✏️`, 'info');
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error('Error loading transfer for edit:', err);
      showToast('حدث خطأ أثناء تحميل بيانات التحويل للتعديل: ' + msg, 'error');
    } finally {
      setIsLoadingTransfer(false);
    }
  };

  const handleCancelEdit = () => {
    if (!window.confirm('هل أنت متأكد من إلغاء وضع التعديل والبدء بتحويل جديد؟')) return;
    setEditingTransferId(null);
    setEditingTransferNumber(null);
    setItems([]);
    setFormData({
      date: new Date().toISOString().split('T')[0],
      fromWarehouseId: '',
      toWarehouseId: '',
      notes: ''
    });
    navigate('/stock-transfer', { replace: true, state: {} });
    showToast('تم الخروج من وضع التعديل والبدء بتحويل جديد', 'info');
  };

  // الصنف المختار حالياً من القائمة
  const selectedProductObj = useMemo(() => {
    return products.find(p => p.id === selectedProductId);
  }, [products, selectedProductId]);

  // الوحدة المعيارية الأساسية للصنف بالمخزن (كجم، لتر، قطعة...)
  const baseUnitOfSelectedProduct = useMemo(() => {
    if (!selectedProductObj) return 'وحدة';
    if (selectedProductObj.base_uom_id && systemUoms.length > 0) {
      const match = systemUoms.find(u => u.id === selectedProductObj.base_uom_id);
      if (match?.name) return match.name;
    }
    return selectedProductObj.unit || 'وحدة';
  }, [selectedProductObj, systemUoms]);

  // استخراج قائمة وحدات وعبوات الصنف المختار (شجرة التعبئة المحفوظة + العبوات الفردية + النظام + الأساسية)
  const availablePackagingRules = useMemo<PackagingRule[]>(
    () => buildAvailablePackagingRules(selectedProductObj, baseUnitOfSelectedProduct, systemUoms),
    [selectedProductObj, baseUnitOfSelectedProduct, systemUoms]
  );

  // تحديث الوحدة الافتراضية عند تغيير الصنف المختار
  useEffect(() => {
    if (selectedProductObj) {
      const base = baseUnitOfSelectedProduct;
      // إذا كان للصنف شجرة عبوات، نختار أصغر وحدة تجزئة تلقائياً أو الوحدة الأساسية
      const rules = availablePackagingRules;
      const smallTier = rules.find(r => r.tierLevel === 'small');
      if (smallTier) {
        setSelectedUnitName(smallTier.unitName);
        setSelectedUnitRatio(smallTier.ratio);
        setPackagingNote(smallTier.packagingNote || '');
      } else {
        setSelectedUnitName(base);
        setSelectedUnitRatio(1);
        setPackagingNote('');
      }
      setEnteredQty(1);
    }
  }, [selectedProductObj, baseUnitOfSelectedProduct, availablePackagingRules]);

  // فتح نافذة إعداد العبوات مع تحميل بيانات الصنف المختار مسبقاً
  const handleOpenPackagingModal = () => {
    if (!selectedProductObj) {
      showToast('الرجاء اختيار الصنف أولاً لتهيئة عبواته ووحداته', 'warning');
      return;
    }

    try {
      const savedHierarchy = secureStorage.getItem<SavedPackagingHierarchy>(`tripro_pkg_hierarchy_${selectedProductObj.id}`);
      if (savedHierarchy) {
        setCalcMode('hierarchy');
        setBulkUnitName(savedHierarchy.bulkUnitName || '');
        setMediumUnitsPerBulk(savedHierarchy.mediumUnitsPerBulk || 4);
        setMediumUnitName(savedHierarchy.mediumUnitName || '');
        setSmallUnitsPerMedium(savedHierarchy.smallUnitsPerMedium || 12);
        setSmallUnitName(savedHierarchy.smallUnitName || '');
        setBaseQtyPerSmallUnit(savedHierarchy.baseQtyPerSmallUnit || 1);
      } else {
        // حقول فارغة ومرنة تماماً لتتيح للمستخدم إدخال ما يشاء
        setBulkUnitName('');
        setMediumUnitsPerBulk(4);
        setMediumUnitName('');
        setSmallUnitsPerMedium(12);
        setSmallUnitName('');
        setBaseQtyPerSmallUnit(1);
        setSingleUnitName('');
        setSingleUnitCapacity(1);
      }
    } catch (e) {
      logger.error(e);
    }

    setIsPackagingModalOpen(true);
  };

  // الكمية الفعلية المحسوبة بالوحدة الأساسية (المعادل المخصوم من المخزن)
  const calculatedBaseQuantity = useMemo(() => {
    const num = Number(enteredQty) || 0;
    const ratio = Number(selectedUnitRatio) || 1;
    return Math.round(num * ratio * 1000) / 1000;
  }, [enteredQty, selectedUnitRatio]);

  // الرصيد المتوفر للصنف المختار بالمستودع المصدر (بالوحدة الأساسية)
  const selectedProductSourceStock = useMemo(() => {
    if (!selectedProductObj || !formData.fromWarehouseId) return null;
    return getProductWarehouseStock(selectedProductObj, formData.fromWarehouseId);
  }, [selectedProductObj, formData.fromWarehouseId]);

  // الرصيد المتوفر محولاً للوحدة المختارة
  const selectedProductSourceStockInUnit = useMemo(() => {
    if (selectedProductSourceStock === null || selectedUnitRatio <= 0) return null;
    const inUnit = selectedProductSourceStock / selectedUnitRatio;
    return Math.floor(inUnit * 100) / 100;
  }, [selectedProductSourceStock, selectedUnitRatio]);

  // المستودع المصدر والمستلم
  const fromWarehouse = useMemo(() => {
    return warehouses.find(w => w.id === formData.fromWarehouseId);
  }, [warehouses, formData.fromWarehouseId]);

  const toWarehouse = useMemo(() => {
    return warehouses.find(w => w.id === formData.toWarehouseId);
  }, [warehouses, formData.toWarehouseId]);

  // اختيار وحدة من القائمة المنسدلة
  const handleSelectUnit = (unitName: string) => {
    if (unitName === '__CUSTOM_CALC__') {
      handleOpenPackagingModal();
      return;
    }

    const matched = availablePackagingRules.find(r => r.unitName === unitName);
    if (matched) {
      setSelectedUnitName(matched.unitName);
      setSelectedUnitRatio(matched.ratio);
      setPackagingNote(matched.packagingNote || '');
    } else {
      setSelectedUnitName(unitName);
      setSelectedUnitRatio(1);
      setPackagingNote('');
    }
  };

  // حفظ شجرة التعبئة والتجزئة وتطبيق السحب
  const handleSaveAndApplyPackaging = (addDirectlyToTable = false) => {
    if (!selectedProductObj) return;

    const base = baseUnitOfSelectedProduct;

    if (calcMode === 'hierarchy') {
      const cleanBulk = bulkUnitName.trim();
      const cleanMed = mediumUnitName.trim();
      const cleanSmall = smallUnitName.trim();
      const medPerBulk = Math.max(1, Number(mediumUnitsPerBulk) || 1);
      const smallPerMed = Math.max(1, Number(smallUnitsPerMedium) || 1);
      const qtyPerSmall = Math.max(0.0001, Number(baseQtyPerSmallUnit) || 1);

      if (!cleanSmall) {
        showToast('الرجاء إدخال مسمى وحدة التجزئة الصغرى (مثل: كيس، باكو، زجاجة...)', 'warning');
        return;
      }

      // حفظ الهيكل للصنف في الذاكرة المشفرة
      const hierarchyData: SavedPackagingHierarchy = {
        bulkUnitName: cleanBulk,
        mediumUnitsPerBulk: medPerBulk,
        mediumUnitName: cleanMed,
        smallUnitsPerMedium: smallPerMed,
        smallUnitName: cleanSmall,
        baseQtyPerSmallUnit: qtyPerSmall
      };

      try {
        secureStorage.setItem(`tripro_pkg_hierarchy_${selectedProductObj.id}`, hierarchyData);
      } catch (e) {
        logger.error(e);
      }

      // تحديد الوحدة المسحوبة بناءً على اختيار المستخدم
      let appliedUnit = cleanSmall;
      let appliedRatio = qtyPerSmall;
      let appliedQty = Number(withdrawalQty) || 1;
      let noteText = `1 ${cleanSmall} = ${qtyPerSmall} ${base}`;

      if (targetWithdrawalTier === 'medium' && cleanMed) {
        appliedUnit = cleanMed;
        appliedRatio = smallPerMed * qtyPerSmall;
        noteText = `1 ${cleanMed} = ${smallPerMed} ${cleanSmall} (${appliedRatio} ${base})`;
      } else if (targetWithdrawalTier === 'bulk' && cleanBulk) {
        appliedUnit = cleanBulk;
        appliedRatio = medPerBulk * smallPerMed * qtyPerSmall;
        const totalItemsInBox = medPerBulk * smallPerMed;
        noteText = `1 ${cleanBulk} = ${medPerBulk} ${cleanMed || 'عبوة'} / ${totalItemsInBox} ${cleanSmall} (${appliedRatio} ${base})`;
      }

      setSelectedUnitName(appliedUnit);
      setSelectedUnitRatio(appliedRatio);
      setEnteredQty(appliedQty);
      setPackagingNote(noteText);
      setIsPackagingModalOpen(false);

      showToast(`تم حفظ هيكل التعبئة وضبط السحب: ${appliedQty} ${appliedUnit} (= ${(appliedQty * appliedRatio).toFixed(2)} ${base})`, 'success');

      if (addDirectlyToTable) {
        setTimeout(() => {
          executeAddItem(selectedProductObj, appliedQty, appliedUnit, appliedRatio, noteText);
        }, 50);
      }
    } else {
      // نمط العبوة الفردية المباشرة
      const uName = singleUnitName.trim();
      const cap = Number(singleUnitCapacity) || 0;
      const wQty = Number(singleWithdrawalQty) || 1;

      if (!uName) {
        showToast('الرجاء كتابة اسم العبوة (مثال: شيكارة، صفيحة، كيس، زجاجة...)', 'warning');
        return;
      }
      if (cap <= 0) {
        showToast('سعة العبوة يجب أن تكون أكبر من صفر', 'warning');
        return;
      }

      // حفظ العبوة للصنف
      try {
        const key = `tripro_pkg_rules_${selectedProductObj.id}`;
        const saved = secureStorage.getItem<PackagingRule[]>(key);
        let list: PackagingRule[] = Array.isArray(saved) ? saved : [];
        list = list.filter(r => r.unitName !== uName);
        list.unshift({
          unitName: uName,
          ratio: cap,
          packagingNote: `1 ${uName} = ${cap} ${base}`,
          isCustom: true
        });
        secureStorage.setItem(key, list);
      } catch (e) {
        logger.error(e);
      }

      const noteText = `1 ${uName} = ${cap} ${base}`;
      setSelectedUnitName(uName);
      setSelectedUnitRatio(cap);
      setEnteredQty(wQty);
      setPackagingNote(noteText);
      setIsPackagingModalOpen(false);

      showToast(`تم حفظ العبوة وضبط السحب: ${wQty} ${uName} (= ${(wQty * cap).toFixed(2)} ${base})`, 'success');

      if (addDirectlyToTable) {
        setTimeout(() => {
          executeAddItem(selectedProductObj, wQty, uName, cap, noteText);
        }, 50);
      }
    }
  };

  // التنفيذ الفعلي لإضافة البند للجدول
  const executeAddItem = (
    product: DynamicParam, 
    qtyVal: number, 
    uName: string, 
    convRatio: number, 
    pNote?: string
  ) => {
    if (!formData.fromWarehouseId) {
      showToast('الرجاء اختيار مستودع المصدر أولاً', 'warning');
      return;
    }

    if (items.some(i => i.productId === product.id)) {
      showToast('الصنف موجود بالفعل في القائمة، يمكنك تعديل كميته مباشرة في الجدول', 'warning');
      return;
    }

    const calculatedBase = Math.round(qtyVal * convRatio * 1000) / 1000;
    if (calculatedBase <= 0) {
      showToast('الكمية يجب أن تكون أكبر من صفر', 'warning');
      return;
    }

    // التحقق من الرصيد في المستودع المصدر
    const stockInSource = getProductWarehouseStock(product, formData.fromWarehouseId);
    if (calculatedBase > stockInSource) {
      const baseName = product.unit || 'وحدة';
      if (!window.confirm(`تنبيه: الكمية المطلوبة (${calculatedBase} ${baseName}) أكبر من الرصيد المتوفر بالمصدر (${stockInSource} ${baseName}). هل تريد المتابعة على أية حال؟`)) {
        return;
      }
    }

    const newItem: TransferItem = {
      productId: product.id,
      productName: product.name,
      sku: product.sku || '',
      baseUnit: product.unit || 'وحدة',
      baseQuantity: calculatedBase,
      selectedUnit: uName,
      enteredQty: qtyVal,
      conversionRatio: convRatio,
      packagingNote: pNote || (convRatio !== 1 ? `1 ${uName} = ${convRatio} ${product.unit || 'وحدة'}` : ''),
      unit: uName,
      quantity: calculatedBase
    };

    setItems(prev => [...prev, newItem]);
    setSelectedProductId('');
    setEnteredQty(1);
    setSelectedUnitName('');
    setSelectedUnitRatio(1);
    setPackagingNote('');

    showToast(`تمت إضافة: ${product.name} (${qtyVal} ${uName} = ${calculatedBase} ${product.unit || ''})`, 'success');

    setTimeout(() => {
      productSearchInputRef.current?.focus();
    }, 50);
  };

  // إضافة صنف يدوياً من الشريط
  const handleAddItem = () => {
    if (!formData.fromWarehouseId) {
      showToast('الرجاء اختيار مستودع المصدر أولاً', 'warning');
      return;
    }

    if (!selectedProductId) {
      showToast('الرجاء اختيار الصنف المراد تحويله', 'warning');
      return;
    }

    const product = products.find(p => p.id === selectedProductId);
    if (!product) return;

    executeAddItem(
      product, 
      enteredQty, 
      selectedUnitName || product.unit || 'وحدة', 
      selectedUnitRatio, 
      packagingNote
    );
  };

  // مسح الباركود السريع
  const handleBarcodeScan = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();

    const scanned = barcodeInput.trim();
    if (!scanned) return;

    if (!formData.fromWarehouseId) {
      showToast('الرجاء اختيار مستودع المصدر أولاً لمعرفة الأرصدة المتوفرة', 'warning');
      return;
    }

    // البحث عن الصنف بالباركود أو الكود
    let matchedUomBarcode: DynamicParam = null;
    const matched = products.find(p => {
      if (p.barcode && p.barcode.trim().toLowerCase() === scanned.toLowerCase()) return true;
      if (p.barcode2 && p.barcode2.trim().toLowerCase() === scanned.toLowerCase()) return true;
      if (p.sku && p.sku.trim().toLowerCase() === scanned.toLowerCase()) return true;
      if (p.unit_barcodes && Array.isArray(p.unit_barcodes)) {
        const ubMatch = p.unit_barcodes.find(ub => ub.barcode && ub.barcode.trim().toLowerCase() === scanned.toLowerCase());
        if (ubMatch) {
          matchedUomBarcode = ubMatch;
          return true;
        }
      }
      return false;
    });

    if (!matched) {
      showToast(`لم يتم العثور على أي صنف بالباركود: ${scanned}`, 'error');
      setBarcodeInput('');
      return;
    }

    const availableStock = getProductWarehouseStock(matched, formData.fromWarehouseId);

    // إذا كان الباركود لوحدة معينة مسجلة
    let scanUnit = matched.unit || 'وحدة';
    let scanRatio = 1;
    let scanNote = '';

    if (matchedUomBarcode) {
      scanUnit = matchedUomBarcode.uom_name || 'عبوة';
      if (matchedUomBarcode.uom_id && systemUoms.length > 0) {
        const u = systemUoms.find(x => x.id === matchedUomBarcode.uom_id);
        if (u) {
          scanRatio = Number(u.ratio) || 1;
          if (u.uom_type === 'smaller' && scanRatio > 0) scanRatio = 1 / scanRatio;
          scanNote = `1 ${scanUnit} = ${scanRatio} ${matched.unit || ''}`;
        }
      }
    }

    // إذا كان الصنف موجوداً في الجدول، زد كمية العبوات
    const existingIndex = items.findIndex(i => i.productId === matched.id);
    if (existingIndex >= 0) {
      const existing = items[existingIndex];
      const nextEntered = Math.round((existing.enteredQty + 1) * 100) / 100;
      const nextBase = Math.round(nextEntered * existing.conversionRatio * 1000) / 1000;
      const updated = [...items];
      updated[existingIndex] = { 
        ...existing, 
        enteredQty: nextEntered,
        baseQuantity: nextBase,
        quantity: nextBase
      };
      setItems(updated);
      showToast(`تمت زيادة كمية: ${matched.name} إلى (${nextEntered} ${existing.selectedUnit} = ${nextBase} ${existing.baseUnit})`, 'info');
    } else {
      const calcBase = Math.round(1 * scanRatio * 1000) / 1000;
      setItems(prev => [...prev, {
        productId: matched.id,
        productName: matched.name,
        sku: matched.sku || '',
        baseUnit: matched.unit || 'وحدة',
        baseQuantity: calcBase,
        selectedUnit: scanUnit,
        enteredQty: 1,
        conversionRatio: scanRatio,
        packagingNote: scanNote,
        unit: scanUnit,
        quantity: calcBase
      }]);
      showToast(`تمت إضافة: ${matched.name}`, 'success');
    }

    if (availableStock <= 0) {
      showToast(`تنبيه: رصيد الصنف بالمستودع المصدر حالياً (0)`, 'warning');
    }

    setBarcodeInput('');
    barcodeInputRef.current?.focus();
  };

  // تعديل كمية العبوات مباشرة داخل الجدول
  const handleUpdateEnteredQty = (index: number, newEnteredQty: number) => {
    if (isNaN(newEnteredQty) || newEnteredQty < 0) return;
    setItems(prev => {
      const updated = [...prev];
      const current = updated[index];
      const base = Math.round(newEnteredQty * current.conversionRatio * 1000) / 1000;
      updated[index] = { 
        ...current, 
        enteredQty: newEnteredQty,
        baseQuantity: base,
        quantity: base
      };
      return updated;
    });
  };

  // زيادة / نقصان خطوة في عدد العبوات
  const handleStepQuantity = (index: number, delta: number) => {
    setItems(prev => {
      const updated = [...prev];
      const current = updated[index];
      const nextEntered = Math.max(0.1, Math.round((current.enteredQty + delta) * 100) / 100);
      const nextBase = Math.round(nextEntered * current.conversionRatio * 1000) / 1000;
      updated[index] = { 
        ...current, 
        enteredQty: nextEntered,
        baseQuantity: nextBase,
        quantity: nextBase
      };
      return updated;
    });
  };

  // حذف بند
  const handleRemoveItem = (index: number) => {
    setItems(prev => prev.filter((_, i) => i !== index));
  };

  // إحصائيات بنود التحويل
  const totalBaseQuantity = useMemo(() => {
    return items.reduce((sum, item) => sum + (Number(item.baseQuantity || item.quantity) || 0), 0);
  }, [items]);

  const overStockCount = useMemo(() => {
    if (!formData.fromWarehouseId) return 0;
    return items.filter(item => {
      const p = products.find(prod => prod.id === item.productId);
      const stock = getProductWarehouseStock(p, formData.fromWarehouseId);
      return (item.baseQuantity || item.quantity) > stock;
    }).length;
  }, [items, products, formData.fromWarehouseId]);

  // إتمام وترحيل التحويل المخزني
  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) {
      e.preventDefault();
    }

    // 🛡️ 1. صمام الأمان اللحظي المتزامن لمنع النقر المتعدد أو تكرار الإرسال
    if (isSubmittingRef.current || loading) {
      return;
    }
    
    if (formData.fromWarehouseId === formData.toWarehouseId) {
      showToast('لا يمكن التحويل من وإلى نفس المستودع', 'error');
      return;
    }

    if (items.length === 0) {
      showToast('يجب إضافة صنف واحد على الأقل للتحويل', 'warning');
      return;
    }

    const explicitOrgId = currentSelectedOrgId || (currentUser as any)?.organization_id || (currentUser as any)?.user_metadata?.org_id;
    const userOrgId = getActiveOrgIdSync(explicitOrgId) || await resolveActiveOrgId(explicitOrgId);
    if (!userOrgId) {
      showToast('تعذر تحديد المنظمة الحالية. يرجى إعادة المحاولة أو تحديث الصفحة.', 'error');
      return;
    }

    // تجهيز البنود بالشكل الذي يتطابق مع المخطط (الكميات بالوحدة الأساسية)
    const cleanItems = items.map(item => ({
      productId: item.productId,
      quantity: Number(item.baseQuantity || item.quantity)
    }));

    const validationResult = createStockTransferSchema.safeParse({ ...formData, items: cleanItems });
    if (!validationResult.success) {
      showToast(validationResult.error.issues[0].message, 'warning');
      return;
    }

    // 🛡️ 2. درع فحص التكرار اللحظي (Anti-Duplicate Guard)
    if (!editingTransferId) {
      const transferFingerprint = `${formData.fromWarehouseId}_${formData.toWarehouseId}_${cleanItems.map(i => `${i.productId}:${i.quantity}`).sort().join(';')}`;
      const lastTransfer = sessionStorage.getItem('tripro_last_stock_transfer');
      if (lastTransfer) {
        try {
          const { fingerprint, timestamp } = JSON.parse(lastTransfer);
          if (fingerprint === transferFingerprint && (Date.now() - timestamp < 120000)) {
            const confirmDup = window.confirm(
              '⚠️ تنبيه أمان لمنع التكرار:\n\nتم ترحيل تحويل مخزني متطابق لنفس الأصناف والمستودعات قبل لحظات!\n\nهل أنت متأكد تماماً من رغبتك في تكرار صرف نفس التحويل المخزني مرة أخرى؟'
            );
            if (!confirmDup) {
              return;
            }
          }
        } catch {
          // ignore parsing error
        }
      }
    }

    // إذا كانت هناك كميات متجاوزة للرصيد، تأكيد إضافي
    if (overStockCount > 0) {
      if (!window.confirm(`يوجد (${overStockCount}) صنف تتجاوز كميتها الرصيد المتاح بالمستودع المصدر. هل أنت متأكد من إتمام التحويل وترحيل الأرصدة بالسالب إن وُجد؟`)) {
        return;
      }
    }

    isSubmittingRef.current = true;
    setLoading(true);
    try {
      const transferNumber = `TRN-${Date.now().toString().slice(-6)}`;

      // تفاصيل التعبئة والوحدات للتوثيق في الملاحظات
      const packagingSummaryLines = items
        .filter(i => i.selectedUnit && i.conversionRatio !== 1)
        .map(i => `${i.productName}: ${i.enteredQty} ${i.selectedUnit} (${i.baseQuantity.toFixed(2)} ${i.baseUnit})`)
        .join(' | ');

      const finalNotes = [
        formData.notes?.trim(),
        packagingSummaryLines ? `[تفاصيل السحب والتعبئة: ${packagingSummaryLines}]` : ''
      ].filter(Boolean).join('\n');

      if (editingTransferId) {
        // --- تحديث تحويل مخزني قائم (وضع التعديل) ---
        // 1. تحديث رأس التحويل
        const { error: headerUpdateError } = await supabase.from('stock_transfers').update({
          transfer_date: formData.date,
          from_warehouse_id: formData.fromWarehouseId,
          to_warehouse_id: formData.toWarehouseId,
          notes: finalNotes,
        }).eq('id', editingTransferId);

        if (headerUpdateError) throw headerUpdateError;

        // 2. تحديث بنود التحويل (حذف القديمة وإدراج الجديدة)
        const { error: itemsDeleteError } = await supabase
          .from('stock_transfer_items')
          .delete()
          .eq('stock_transfer_id', editingTransferId);

        if (itemsDeleteError) throw itemsDeleteError;

        const dbItems = items.map(item => ({
          stock_transfer_id: editingTransferId,
          product_id: item.productId,
          quantity: Number(item.baseQuantity || item.quantity),
          organization_id: userOrgId,
          uom_id: item.uomId || null
        }));

        const { error: itemsInsertError } = await supabase
          .from('stock_transfer_items')
          .insert(dbItems);

        if (itemsInsertError) throw itemsInsertError;

        // 3. مسح المسودة وإعادة احتساب الأرصدة
        clearStockTransferDraft();
        await recalculateStock();

        setFormData(prev => ({ ...prev, notes: '' }));
        setItems([]);
        const savedNumber = editingTransferNumber;
        setEditingTransferId(null);
        setEditingTransferNumber(null);

        showToast(`تم حفظ تعديل التحويل المخزني (${savedNumber}) بنجاح وتحديث الأرصدة ✅`, 'success');
        navigate('/stock-transfer-list');
        return;
      }

      // 1. إنشاء رأس التحويل في جدول stock_transfers
      const { data: header, error: headerError } = await supabase.from('stock_transfers').insert({
        transfer_number: transferNumber,
        transfer_date: formData.date,
        from_warehouse_id: formData.fromWarehouseId,
        to_warehouse_id: formData.toWarehouseId,
        notes: finalNotes,
        organization_id: userOrgId,
        status: 'posted'
      }).select().single();

      if (headerError) throw headerError;

      // 2. إنشاء بنود التحويل في جدول stock_transfer_items
      const dbItems = items.map(item => ({
        stock_transfer_id: header.id,
        product_id: item.productId,
        quantity: Number(item.baseQuantity || item.quantity),
        organization_id: userOrgId,
        uom_id: item.uomId || null
      }));

      const { error: itemsError } = await supabase.from('stock_transfer_items').insert(dbItems);
      if (itemsError) throw itemsError;

      // تسجيل بصمة التحويل لمنع التكرار اللحظي
      const transferFingerprint = `${formData.fromWarehouseId}_${formData.toWarehouseId}_${cleanItems.map(i => `${i.productId}:${i.quantity}`).sort().join(';')}`;
      try {
        sessionStorage.setItem('tripro_last_stock_transfer', JSON.stringify({ fingerprint: transferFingerprint, timestamp: Date.now() }));
      } catch {}

      // 3. مسح المسودة المحلية بعد نجاح الحفظ
      clearStockTransferDraft();

      // 4. إعادة احتساب الأرصدة وتحديث كروت الصنف
      await recalculateStock();

      setFormData(prev => ({ ...prev, notes: '' }));
      setItems([]);
      showToast(`تم تنفيذ التحويل المخزني رقم (${transferNumber}) بنجاح وترحيل الأرصدة ✅`, 'success');
    } catch (error) {
      logger.error(error);
      showToast(error.message || 'حدث خطأ أثناء معالجة التحويل المخزني', 'error');
    } finally {
      setLoading(false);
      isSubmittingRef.current = false;
    }
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6 pb-12 animate-in fade-in">
      {/* شريط تنبيه وضع التعديل */}
      {editingTransferId && (
        <div className="p-4 bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs text-blue-900 shadow-sm animate-in fade-in">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-600 text-white rounded-xl shadow-xs">
              <Edit3 size={18} />
            </div>
            <div>
              <div className="font-black text-sm text-blue-950 flex items-center gap-2">
                وضع تعديل التحويل المخزني: <span className="font-mono bg-blue-200/60 px-2 py-0.5 rounded text-blue-900">{editingTransferNumber}</span>
              </div>
              <p className="text-blue-700 mt-0.5">يمكنك تعديل المستودعات أو التاريخ أو تعديل وحذف وإضافة أصناف جديدة، وسيتم تحديث الأرصدة تلقائياً عند الحفظ.</p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleCancelEdit}
            className="px-3 py-1.5 bg-white hover:bg-red-50 text-red-600 border border-red-200 rounded-xl font-bold transition-colors flex items-center gap-1.5 shrink-0"
          >
            <X size={14} /> إلغاء التعديل والبدء بجديد
          </button>
        </div>
      )}

      {/* مؤشر تحميل بيانات التحويل */}
      {isLoadingTransfer && (
        <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl flex items-center justify-center gap-2 text-xs font-bold text-slate-600">
          <Loader2 size={16} className="animate-spin text-blue-600" />
          جاري تحميل بيانات التحويل وأصنافه للتعديل...
        </div>
      )}

      {/* شريط تنبيه استعادة المسودة */}
      {!editingTransferId && hasDraftRestored && (items.length > 0 || formData.fromWarehouseId || formData.toWarehouseId || (formData.notes && formData.notes.trim())) && (
        <div className="p-3 bg-amber-50 border border-amber-200 rounded-2xl flex items-center justify-between text-xs text-amber-800 animate-in fade-in">
          <div className="flex items-center gap-2">
            <Sparkles size={16} className="text-amber-600 shrink-0" />
            <span className="font-bold">
              تمت استعادة مسودة تحويل سابقة غير مرحلة تلقائياً ({items.length > 0 ? `${items.length} صنف` : 'بيانات المستودعات والملاحظات'}) لحماية عملك من الضياع عند إعادة تحميل الصفحة.
            </span>
          </div>
          <button
            type="button"
            onClick={handleClearDraft}
            className="px-2.5 py-1 bg-white hover:bg-amber-100 text-amber-900 border border-amber-300 rounded-lg font-bold transition-colors shadow-xs"
          >
            مسح والبدء من جديد
          </button>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
        <div className="flex items-center gap-3">
          <div className={`p-3 text-white rounded-xl shadow-md ${editingTransferId ? 'bg-amber-600' : 'bg-blue-600'}`}>
            {editingTransferId ? <Edit3 size={24} /> : <ArrowRightLeft size={24} />}
          </div>
          <div>
            <h2 className="text-xl font-black text-slate-800">
              {editingTransferId ? `تعديل التحويل المخزني (${editingTransferNumber})` : 'تحويل مخزني فوري متعدد الوحدات والتعبئة'}
            </h2>
            <p className="text-xs text-slate-500">
              {editingTransferId 
                ? 'تعديل بيانات التحويل المسجل والأصناف والكميات مع إعادة احتساب الأرصدة آلياً'
                : 'نقل الخامات والمنتجات بأي وحدة سحب (كرتونة، علبة، كيس، باكو، زجاجة، شيكارة، صفيحة...) مع المعادل الآلي'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {editingTransferId && (
            <button
              type="button"
              onClick={handleCancelEdit}
              className="flex items-center gap-1.5 px-3.5 py-2.5 bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 rounded-xl text-xs font-bold transition-all"
            >
              <X size={15} /> إلغاء التعديل
            </button>
          )}
          <button
            type="button"
            onClick={() => navigate('/stock-transfer-list')}
            className="flex items-center gap-2 px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-all"
          >
            <List size={16} /> سجل التحويلات السابقة
          </button>
        </div>
      </div>

      <form 
        onSubmit={handleSubmit} 
        onKeyDown={(e) => {
          // حماية أمان كاملة: منع ترحيل النموذج تلقائياً عند الضغط على Enter في أي حقل نصي أو رقمي
          if (e.key === 'Enter' && (e.target as HTMLElement).tagName !== 'TEXTAREA') {
            e.preventDefault();
          }
        }}
        className="space-y-6"
      >
        {/* بيانات المستودعات والتاريخ */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 space-y-5">
          <h3 className="text-sm font-black text-slate-800 flex items-center gap-2 border-b pb-3">
            <Warehouse size={18} className="text-blue-600" /> مسار التحويل والمستودعات
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">تاريخ التحويل *</label>
              <input 
                type="date" 
                required 
                className="w-full border border-slate-200 focus:border-blue-500 rounded-xl p-2.5 text-sm bg-slate-50 focus:bg-white focus:ring-2 focus:ring-blue-100 outline-none transition-all font-bold" 
                value={formData.date} 
                onChange={e => setFormData({...formData, date: e.target.value})} 
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5 flex items-center justify-between">
                <span>من مستودع (المصدر / الخامات) *</span>
                {fromWarehouse && (
                  <span className="text-[10px] text-blue-600 font-black">المصدر المختار</span>
                )}
              </label>
              <select 
                required 
                className="w-full border border-slate-200 focus:border-blue-500 rounded-xl p-2.5 text-sm bg-slate-50 focus:bg-white focus:ring-2 focus:ring-blue-100 outline-none transition-all font-bold" 
                value={formData.fromWarehouseId} 
                onChange={e => {
                  setFormData({...formData, fromWarehouseId: e.target.value});
                }}
              >
                <option value="">-- اختر مستودع الصرف --</option>
                {warehouses.map(w => (
                  <option key={w.id} value={w.id}>{w.name}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5 flex items-center justify-between">
                <span>إلى مستودع (المستلم / التصنيع) *</span>
                {toWarehouse && (
                  <span className="text-[10px] text-emerald-600 font-black">الوجهة المختارة</span>
                )}
              </label>
              <select 
                required 
                className="w-full border border-slate-200 focus:border-blue-500 rounded-xl p-2.5 text-sm bg-slate-50 focus:bg-white focus:ring-2 focus:ring-blue-100 outline-none transition-all font-bold" 
                value={formData.toWarehouseId} 
                onChange={e => setFormData({...formData, toWarehouseId: e.target.value})}
              >
                <option value="">-- اختر مستودع الاستلام --</option>
                {warehouses.map(w => (
                  <option key={w.id} value={w.id}>{w.name}</option>
                ))}
              </select>
            </div>
          </div>

          {/* تنبيه إذا اختار المستخدم نفس المستودع */}
          {formData.fromWarehouseId && formData.toWarehouseId && formData.fromWarehouseId === formData.toWarehouseId && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl flex items-center gap-2 text-rose-700 text-xs font-bold animate-in fade-in">
              <AlertCircle size={16} /> لا يمكن التحويل من وإلى نفس المستودع. الرجاء اختيار مستودع استلام مختلف.
            </div>
          )}
        </div>

        {/* بطاقة إضافة الأصناف (البحث الذكي + مسدس الباركود + محول العبوات والتجزئة الفوري) */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 space-y-5">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 border-b pb-3">
            <h3 className="text-sm font-black text-slate-800 flex items-center gap-2">
              <Package size={18} className="text-blue-600" /> اختيار الأصناف ووحدات التحويل والسحب
            </h3>

            {/* فلتر عرض الأصناف المتوفرة فقط */}
            {formData.fromWarehouseId && (
              <label className="inline-flex items-center gap-2 cursor-pointer text-xs font-bold text-slate-600 hover:text-slate-800 bg-slate-50 px-3 py-1.5 rounded-xl border border-slate-200">
                <input 
                  type="checkbox" 
                  checked={filterAvailableOnly} 
                  onChange={e => setFilterAvailableOnly(e.target.checked)}
                  className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                />
                <span>عرض الأصناف المتوفرة فقط في مستودع المصدر</span>
              </label>
            )}
          </div>

          {/* مسدس الباركود السريع */}
          <div className="bg-slate-50/70 p-3 rounded-xl border border-slate-200/80 flex items-center gap-3">
            <div className="p-2 bg-white rounded-lg text-blue-600 border border-slate-200 shadow-xs">
              <Barcode size={18} />
            </div>
            <div className="flex-1">
              <input
                ref={barcodeInputRef}
                type="text"
                value={barcodeInput}
                onChange={e => setBarcodeInput(e.target.value)}
                onKeyDown={handleBarcodeScan}
                disabled={!formData.fromWarehouseId}
                placeholder={formData.fromWarehouseId ? "امسح الباركود بمسدس الليزر ثم اضغط Enter (يدعم باركود الصنف أو باركود أي وحدة/عبوة)..." : "اختر مستودع المصدر أولاً لتفعيل المسح السريع..."}
                className="w-full bg-transparent text-xs font-mono font-bold outline-none placeholder:font-sans placeholder:text-slate-400 placeholder:text-xs disabled:cursor-not-allowed"
              />
            </div>
            {barcodeInput && (
              <button
                type="button"
                onClick={() => setBarcodeInput('')}
                className="text-slate-400 hover:text-slate-600"
              >
                <X size={15} />
              </button>
            )}
          </div>

          {/* صف الإدخال: البحث الذكي + اختيار وحدة السحب + الكمية + زر شجرة العبوات + زر الإضافة */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 items-end bg-blue-50/30 p-4 rounded-2xl border border-blue-100">
            {/* حقل البحث الذكي بالأصناف */}
            <div className="lg:col-span-5">
              <label className="block text-xs font-bold text-slate-700 mb-1 flex items-center justify-between">
                <span>الصنف المراد تحويله *</span>
                {selectedProductSourceStock !== null && (
                  <span className={`text-[11px] font-black ${selectedProductSourceStock > 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                    المتوفر بالمصدر: {selectedProductSourceStock} {baseUnitOfSelectedProduct}
                    {selectedUnitRatio > 0 && selectedUnitRatio !== 1 && selectedProductSourceStockInUnit !== null && (
                      <span className="text-slate-500 font-normal mr-1">
                        (يعادل ~ {selectedProductSourceStockInUnit} {selectedUnitName})
                      </span>
                    )}
                  </span>
                )}
              </label>
              <ProductSearchSelect
                inputRef={productSearchInputRef}
                products={products}
                value={selectedProductId}
                onChange={(pId) => {
                  setSelectedProductId(pId);
                }}
                onEnterSelect={() => {
                  setTimeout(() => {
                    qtyInputRef.current?.focus();
                    qtyInputRef.current?.select();
                  }, 50);
                }}
                warehouseId={formData.fromWarehouseId}
                filterAvailableOnly={filterAvailableOnly}
                disabled={!formData.fromWarehouseId}
                placeholder={formData.fromWarehouseId ? "ابحث باسم الصنف، الكود، أو الباركود..." : "اختر مستودع المصدر أولاً..."}
              />
            </div>

            {/* قائمة اختيار وحدة السحب / التحويل (شجرة التعبئة المرنة) */}
            <div className="lg:col-span-3">
              <div className="flex items-center justify-between mb-1">
                <label className="block text-xs font-bold text-slate-700">وحدة السحب / العبوة</label>
                {selectedProductId && (
                  <button
                    type="button"
                    onClick={handleOpenPackagingModal}
                    className="text-[10px] font-black text-blue-700 hover:text-blue-900 flex items-center gap-1 bg-blue-100/70 hover:bg-blue-100 px-1.5 py-0.5 rounded transition-colors"
                    title="ضبط شجرة العبوات والتجزئة لهذا الصنف"
                  >
                    <Layers size={11} /> شجرة العبوات
                  </button>
                )}
              </div>
              <select
                disabled={!formData.fromWarehouseId || !selectedProductId}
                value={selectedUnitName}
                onChange={e => handleSelectUnit(e.target.value)}
                className="w-full border border-slate-200 focus:border-blue-500 rounded-xl p-2.5 text-xs bg-white focus:ring-2 focus:ring-blue-100 outline-none transition-all font-bold disabled:bg-slate-100"
              >
                {availablePackagingRules.map((rule, idx) => (
                  <option key={idx} value={rule.unitName}>
                    {rule.unitName} {rule.ratio !== 1 ? `(= ${rule.ratio} ${baseUnitOfSelectedProduct})` : `(الوحدة الأساسية)`}
                  </option>
                ))}
                <option value="__CUSTOM_CALC__">➕ إعداد عبوات وتجزئة جديدة للصنف...</option>
              </select>
            </div>

            {/* حقل كمية السحب بالوحدة المختارة */}
            <div className="lg:col-span-2">
              <label className="block text-xs font-bold text-slate-700 mb-1">
                الكمية ({selectedUnitName || 'وحدة'})
              </label>
              <input 
                ref={qtyInputRef}
                type="number" 
                min="0.001"
                step="any"
                disabled={!formData.fromWarehouseId || !selectedProductId}
                value={enteredQty}
                onChange={e => setEnteredQty(parseFloat(e.target.value) || 0)}
                onKeyDown={e => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleAddItem();
                  }
                }}
                className="w-full border border-slate-200 focus:border-blue-500 rounded-xl py-2.5 px-2 text-center text-sm font-black bg-white focus:ring-2 focus:ring-blue-100 outline-none transition-all disabled:bg-slate-100"
              />
            </div>

            {/* زر الإضافة السريعة وزر ضبط العبوات */}
            <div className="lg:col-span-2 flex items-center gap-1.5">
              <button 
                type="button" 
                onClick={handleAddItem}
                disabled={!formData.fromWarehouseId || !selectedProductId}
                className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-200 disabled:text-slate-400 text-white p-2.5 rounded-xl font-bold flex items-center justify-center gap-1 transition-all shadow-sm h-[42px] text-xs"
                title="إضافة للتحويل"
              >
                <Plus size={18} />
                <span>إضافة</span>
              </button>

              <button
                type="button"
                onClick={handleOpenPackagingModal}
                disabled={!formData.fromWarehouseId || !selectedProductId}
                className="bg-indigo-50 hover:bg-indigo-100 disabled:bg-slate-100 text-indigo-700 p-2.5 rounded-xl border border-indigo-200 flex items-center justify-center transition-all h-[42px] w-[42px] shrink-0"
                title="ضبط شجرة العبوات والتجزئة للصنف"
              >
                <Box size={18} />
              </button>
            </div>
          </div>

          {/* شريط المعادل الذكي الفوري إذا كانت الوحدة المسحوبة عبوة غير الوحدة الأساسية */}
          {selectedProductId && selectedUnitRatio !== 1 && (
            <div className="p-3 bg-gradient-to-r from-blue-50 via-indigo-50 to-purple-50 border border-blue-200 rounded-xl flex flex-wrap items-center justify-between gap-3 text-xs animate-in fade-in">
              <div className="flex items-center gap-2">
                <span className="p-1 bg-blue-600 text-white rounded-md shadow-xs">
                  <Calculator size={13} />
                </span>
                <span className="font-bold text-slate-700">المعادل التلقائي بالمخزن:</span>
                <span className="font-black text-blue-900 bg-white px-2 py-0.5 rounded border border-blue-200">
                  {enteredQty} {selectedUnitName} × {selectedUnitRatio} = {calculatedBaseQuantity} {baseUnitOfSelectedProduct}
                </span>
                {packagingNote && (
                  <span className="text-[11px] text-slate-500 font-medium">
                    ({packagingNote})
                  </span>
                )}
              </div>

              <div className="text-[11px] text-slate-500">
                * سيتم خصم وإضافة <strong className="text-blue-700 font-black">{calculatedBaseQuantity} {baseUnitOfSelectedProduct}</strong> في كروت الصنف لضمان دقة المخزون 100%.
              </div>
            </div>
          )}

          {/* جدول بنود التحويل */}
          <StockTransferItemsTable
            items={items}
            products={products}
            fromWarehouseId={formData.fromWarehouseId}
            totalBaseQuantity={totalBaseQuantity}
            overStockCount={overStockCount}
            onStepQuantity={handleStepQuantity}
            onUpdateEnteredQty={handleUpdateEnteredQty}
            onRemoveItem={handleRemoveItem}
          />
        </div>

        {/* حقل الملاحظات وزر الترحيل */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 space-y-4">
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5 flex items-center gap-1.5">
              <FileText size={15} className="text-slate-500" /> البيان وملاحظات التحويل (اختياري)
            </label>
            <textarea
              rows={2}
              value={formData.notes}
              onChange={e => setFormData({...formData, notes: e.target.value})}
              placeholder="اكتب أي ملاحظات أو أسباب تخص هذا التحويل (سيتم إرفاق تفاصيل التعبئة والوحدات المسحوبة تلقائياً)..."
              className="w-full border border-slate-200 focus:border-blue-500 rounded-xl p-3 text-sm bg-slate-50 focus:bg-white focus:ring-2 focus:ring-blue-100 outline-none transition-all resize-none"
            />
          </div>

          <div className="pt-3 border-t border-slate-100 flex flex-col sm:flex-row justify-between items-center gap-4">
            <div className="text-xs text-slate-400">
              * سيتم ترحيل الكميات وتحديث أرصدة المستودعين تلقائياً بالمعادل الأساسي فور الحفظ
            </div>

            <div className="flex items-center gap-3 w-full sm:w-auto">
              {editingTransferId ? (
                <button
                  type="button"
                  onClick={handleCancelEdit}
                  className="px-4 py-3 bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 rounded-xl font-bold text-xs transition-colors flex items-center gap-1.5"
                >
                  <X size={15} /> إلغاء التعديل
                </button>
              ) : items.length > 0 && (
                <button
                  type="button"
                  onClick={handleClearDraft}
                  className="px-4 py-3 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl font-bold text-xs transition-colors"
                >
                  إلغاء وتفريغ
                </button>
              )}

              <button 
                type="button"
                onClick={() => handleSubmit()}
                disabled={loading || items.length === 0 || formData.fromWarehouseId === formData.toWarehouseId} 
                className="w-full sm:w-auto bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white px-8 py-3.5 rounded-xl font-black shadow-lg shadow-blue-500/20 hover:shadow-blue-500/30 flex items-center justify-center gap-2 transition-all"
              >
                {loading ? (
                  <>
                    <Loader2 className="animate-spin" size={18} />
                    <span>{editingTransferId ? 'جاري حفظ التعديلات...' : 'جاري ترحيل التحويل...'}</span>
                  </>
                ) : (
                  <>
                    <Save size={18} />
                    <span>{editingTransferId ? 'حفظ التعديلات وتحديث التحويل' : 'إتمام وترحيل التحويل المخزني'}</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </form>

      {/* 🧮 نافذة منبثقة: إعداد وتخصيص شجرة عبوات وتجزئة الصنف (Universal Packaging Hierarchy Modal) */}
      <StockTransferPackagingModal
        isOpen={isPackagingModalOpen}
        onClose={() => setIsPackagingModalOpen(false)}
        selectedProductName={selectedProductObj?.name || 'صنف'}
        baseUnitOfSelectedProduct={baseUnitOfSelectedProduct}
        calcMode={calcMode}
        setCalcMode={setCalcMode}
        bulkUnitName={bulkUnitName}
        setBulkUnitName={setBulkUnitName}
        mediumUnitsPerBulk={mediumUnitsPerBulk}
        setMediumUnitsPerBulk={setMediumUnitsPerBulk}
        mediumUnitName={mediumUnitName}
        setMediumUnitName={setMediumUnitName}
        smallUnitsPerMedium={smallUnitsPerMedium}
        setSmallUnitsPerMedium={setSmallUnitsPerMedium}
        smallUnitName={smallUnitName}
        setSmallUnitName={setSmallUnitName}
        baseQtyPerSmallUnit={baseQtyPerSmallUnit}
        setBaseQtyPerSmallUnit={setBaseQtyPerSmallUnit}
        targetWithdrawalTier={targetWithdrawalTier}
        setTargetWithdrawalTier={setTargetWithdrawalTier}
        withdrawalQty={withdrawalQty}
        setWithdrawalQty={setWithdrawalQty}
        singleUnitName={singleUnitName}
        setSingleUnitName={setSingleUnitName}
        singleUnitCapacity={singleUnitCapacity}
        setSingleUnitCapacity={setSingleUnitCapacity}
        singleWithdrawalQty={singleWithdrawalQty}
        setSingleWithdrawalQty={setSingleWithdrawalQty}
        onSaveAndApply={handleSaveAndApplyPackaging}
      />
    </div>
  );
};

export default StockTransfer;

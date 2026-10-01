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

export interface PackagingRule {
  unitName: string;
  ratio: number; // كم وحدة أساسية في هذه العبوة (مثلاً 0.25 كجم للكيس، أو 3 كجم للعلبة، أو 12 كجم للكرتونة)
  packagingNote?: string;
  isCustom?: boolean;
  uomId?: string;
  tierLevel?: 'base' | 'small' | 'medium' | 'bulk';
}

export interface SavedPackagingHierarchy {
  bulkUnitName: string;         // مسمى الطرد الأكبر (مثلاً: كرتونة، شيكارة، صندوق، بالتة...)
  mediumUnitsPerBulk: number;   // كم عبوة وسيطة بداخل الطرد الأكبر (مثلاً: 3 أو 4 علب)
  mediumUnitName: string;       // مسمى العبوة الوسيطة (مثلاً: علبة، باكت، جردل، لفة...)
  smallUnitsPerMedium: number;  // كم وحدة تجزئة بداخل كل عبوة وسيطة (مثلاً: 12 كيس)
  smallUnitName: string;        // مسمى وحدة التجزئة والسحب الصغرى (مثلاً: كيس، باكو، زجاجة، قطعة...)
  baseQtyPerSmallUnit: number;  // وزن أو سعة وحدة التجزئة الصغرى بالوحدة المعيارية (مثلاً: 0.25 كجم أو 1 قطعة)
}

export interface TransferItem {
  productId: string;
  productName: string;
  sku?: string;
  baseUnit: string;        // الوحدة الأساسية للصنف في المخزن (مثل: كجم أو لتر أو قطعة)
  baseQuantity: number;    // الكمية الفعلية بالوحدة الأساسية (المخصومة والمرحلة للمخزن)
  selectedUnit: string;    // وحدة الصرف/السحب (مثل: كيس، باكو، علبة، كرتونة، شيكارة، زجاجة...)
  enteredQty: number;      // الكمية بتلك الوحدة (مثل: 8 أكياس، 1 علبة، 2 كرتونة)
  conversionRatio: number; // معامل التحويل: 1 وحدة مسحوبة = X وحدة أساسية
  packagingNote?: string;  // ملاحظة التعبئة والتجزئة التوضيحية
  uomId?: string;
  unit?: string;           // للتوافق مع العرض القديم
  quantity: number;        // للتوافق مع المخططات والحفظ (= baseQuantity)
}

const DRAFT_STORAGE_KEY = 'tripro_stock_transfer_draft_v2';

const StockTransfer = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { warehouses, products, recalculateStock, currentUser } = useAccounting();
  const { showToast } = useToast();
  const [loading, setLoading] = useState(false);
  const [systemUoms, setSystemUoms] = useState<any[]>([]);
  
  const [formData, setFormData] = useState({
    date: new Date().toISOString().split('T')[0],
    fromWarehouseId: '',
    toWarehouseId: '',
    notes: ''
  });

  const [items, setItems] = useState<TransferItem[]>([]);
  const [selectedProductId, setSelectedProductId] = useState('');
  const [enteredQty, setEnteredQty] = useState<number>(1);
  const [selectedUnitName, setSelectedUnitName] = useState<string>('');
  const [selectedUnitRatio, setSelectedUnitRatio] = useState<number>(1);
  const [packagingNote, setPackagingNote] = useState<string>('');
  const [filterAvailableOnly, setFilterAvailableOnly] = useState(false);
  const [barcodeInput, setBarcodeInput] = useState('');
  const [hasDraftRestored, setHasDraftRestored] = useState(false);

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
        const orgId = (currentUser as any)?.organization_id || (currentUser as any)?.user_metadata?.org_id;
        let query = supabase.from('uoms').select('*');
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
  }, [currentUser]);

  // استعادة مسودة التحويل السابقة تلقائياً لحماية الموظف من فقدان البيانات
  useEffect(() => {
    try {
      const parsed = secureStorage.getItem<{ formData: any; items: TransferItem[] }>(DRAFT_STORAGE_KEY);
      if (parsed && parsed.items && Array.isArray(parsed.items) && parsed.items.length > 0) {
        setItems(parsed.items);
        if (parsed.formData) {
          setFormData(prev => ({
            ...prev,
            fromWarehouseId: parsed.formData.fromWarehouseId || prev.fromWarehouseId,
            toWarehouseId: parsed.formData.toWarehouseId || prev.toWarehouseId,
            notes: parsed.formData.notes || prev.notes,
            date: parsed.formData.date || prev.date
          }));
        }
        setHasDraftRestored(true);
      }
    } catch (e) {
      logger.error('Failed to restore draft', e);
    }
  }, []);

  // حفظ مسودة التحويل تلقائياً عند أي تغيير
  useEffect(() => {
    if (items.length > 0 || formData.fromWarehouseId || formData.toWarehouseId) {
      try {
        secureStorage.setItem(DRAFT_STORAGE_KEY, { formData, items });
      } catch (e) {
        logger.error('Failed to save draft', e);
      }
    }
  }, [formData, items]);

  // مسح المسودة والبدء من جديد
  const handleClearDraft = () => {
    if (!window.confirm('هل أنت متأكد من مسح بيانات المسودة الحالية والبدء من جديد؟')) return;
    secureStorage.removeItem(DRAFT_STORAGE_KEY);
    setItems([]);
    setFormData(prev => ({ ...prev, notes: '' }));
    setHasDraftRestored(false);
    showToast('تم مسح المسودة والبدء من جديد', 'info');
  };

  // إذا تم التوجيه إلى الصفحة مع صنف محدد مسبقاً
  useEffect(() => {
    if (location.state?.productId) {
      setSelectedProductId(location.state.productId);
    }
  }, [location.state]);

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
  const availablePackagingRules = useMemo<PackagingRule[]>(() => {
    const base = baseUnitOfSelectedProduct;
    const rules: PackagingRule[] = [
      {
        unitName: base,
        ratio: 1,
        packagingNote: 'الوحدة الأساسية للمخزن',
        tierLevel: 'base'
      }
    ];

    if (!selectedProductObj) return rules;

    // 1. استرجاع شجرة العبوات الهرمية المحفوظة للصنف (إن وجدت)
    try {
      const savedHierarchy = secureStorage.getItem<SavedPackagingHierarchy>(`tripro_pkg_hierarchy_${selectedProductObj.id}`);
      if (savedHierarchy) {
        const smallRatio = Number(savedHierarchy.baseQtyPerSmallUnit) || 1;
        const mediumRatio = (Number(savedHierarchy.smallUnitsPerMedium) || 1) * smallRatio;
        const bulkRatio = (Number(savedHierarchy.mediumUnitsPerBulk) || 1) * mediumRatio;
        const totalSmallInBulk = (Number(savedHierarchy.mediumUnitsPerBulk) || 1) * (Number(savedHierarchy.smallUnitsPerMedium) || 1);

        if (savedHierarchy.smallUnitName && smallRatio > 0) {
          rules.push({
            unitName: savedHierarchy.smallUnitName,
            ratio: smallRatio,
            packagingNote: `1 ${savedHierarchy.smallUnitName} = ${smallRatio} ${base}`,
            tierLevel: 'small'
          });
        }

        if (savedHierarchy.mediumUnitName && mediumRatio > 0 && savedHierarchy.mediumUnitName !== savedHierarchy.smallUnitName) {
          rules.push({
            unitName: savedHierarchy.mediumUnitName,
            ratio: mediumRatio,
            packagingNote: `1 ${savedHierarchy.mediumUnitName} = ${savedHierarchy.smallUnitsPerMedium} ${savedHierarchy.smallUnitName} (${mediumRatio} ${base})`,
            tierLevel: 'medium'
          });
        }

        if (savedHierarchy.bulkUnitName && bulkRatio > 0 && savedHierarchy.bulkUnitName !== savedHierarchy.mediumUnitName) {
          rules.push({
            unitName: savedHierarchy.bulkUnitName,
            ratio: bulkRatio,
            packagingNote: `1 ${savedHierarchy.bulkUnitName} = ${savedHierarchy.mediumUnitsPerBulk} ${savedHierarchy.mediumUnitName} / ${totalSmallInBulk} ${savedHierarchy.smallUnitName} (${bulkRatio} ${base})`,
            tierLevel: 'bulk'
          });
        }
      }

      // 2. استرجاع العبوات المباشرة الفردية المحفوظة للصنف
      const savedRules = secureStorage.getItem<PackagingRule[]>(`tripro_pkg_rules_${selectedProductObj.id}`);
      if (savedRules && Array.isArray(savedRules)) {
        savedRules.forEach(r => {
          if (!rules.some(x => x.unitName === r.unitName)) {
            rules.push(r);
          }
        });
      }
    } catch (e) {
      logger.error(e);
    }

    // 3. فحص باركودات الوحدات unit_barcodes
    if (selectedProductObj.unit_barcodes && Array.isArray(selectedProductObj.unit_barcodes)) {
      selectedProductObj.unit_barcodes.forEach((ub: Record<string, any>) => {
        const uName = ub.uom_name?.trim();
        if (uName && !rules.some(r => r.unitName === uName)) {
          let ratio = 1;
          if (ub.uom_id && systemUoms.length > 0) {
            const sys = systemUoms.find(s => s.id === ub.uom_id);
            if (sys) {
              ratio = Number(sys.ratio) || 1;
              if (sys.uom_type === 'smaller' && ratio > 0) ratio = 1 / ratio;
            }
          }
          rules.push({
            unitName: uName,
            ratio,
            uomId: ub.uom_id,
            packagingNote: `باركود خاص (${ub.barcode})`
          });
        }
      });
    }

    // 4. إدراج وحدات النظام العامة المتوافقة
    const isWeight = /كجم|كيلو|kg|جرام|جم|gram/i.test(base);
    const isCount = /قطعة|عدد|حبة|piece|unit/i.test(base);
    const isVolume = /لتر|مل|liter|ml/i.test(base);

    systemUoms.forEach(u => {
      let ratio = Number(u.ratio) || 1;
      if (u.uom_type === 'smaller' && ratio > 0) {
        ratio = 1 / ratio;
      }
      if (!rules.some(r => r.unitName === u.name)) {
        if (isWeight && /كجم|كيلو|جرام|شيكارة|صفيحة|كيس|علبه|علبة|قالب|لفه|باكو/i.test(u.name)) {
          rules.push({ unitName: u.name, ratio, uomId: u.id, packagingNote: `${u.name} (${ratio} ${base})` });
        } else if (isCount && /قطعة|دستة|كرتون|صندوق|علبة|باكت/i.test(u.name)) {
          rules.push({ unitName: u.name, ratio, uomId: u.id, packagingNote: `${u.name} (${ratio} ${base})` });
        } else if (isVolume && /لتر|مل|جالون|برميل|زجاجة/i.test(u.name)) {
          rules.push({ unitName: u.name, ratio, uomId: u.id, packagingNote: `${u.name} (${ratio} ${base})` });
        }
      }
    });

    return rules;
  }, [selectedProductObj, baseUnitOfSelectedProduct, systemUoms]);

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
    
    if (formData.fromWarehouseId === formData.toWarehouseId) {
      showToast('لا يمكن التحويل من وإلى نفس المستودع', 'error');
      return;
    }

    if (items.length === 0) {
      showToast('يجب إضافة صنف واحد على الأقل للتحويل', 'warning');
      return;
    }

    const userOrgId = (currentUser as any)?.organization_id || (currentUser as any)?.user_metadata?.org_id;

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

    // إذا كانت هناك كميات متجاوزة للرصيد، تأكيد إضافي
    if (overStockCount > 0) {
      if (!window.confirm(`يوجد (${overStockCount}) صنف تتجاوز كميتها الرصيد المتاح بالمستودع المصدر. هل أنت متأكد من إتمام التحويل وترحيل الأرصدة بالسالب إن وُجد؟`)) {
        return;
      }
    }

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

      // 3. مسح المسودة المحلية بعد نجاح الحفظ
      secureStorage.removeItem(DRAFT_STORAGE_KEY);
      setHasDraftRestored(false);

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
    }
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6 pb-12 animate-in fade-in">
      {/* شريط تنبيه استعادة المسودة */}
      {hasDraftRestored && items.length > 0 && (
        <div className="p-3 bg-amber-50 border border-amber-200 rounded-2xl flex items-center justify-between text-xs text-amber-800 animate-in fade-in">
          <div className="flex items-center gap-2">
            <Sparkles size={16} className="text-amber-600 shrink-0" />
            <span className="font-bold">تمت استعادة مسودة تحويل سابقة غير مكتملة تلقائياً ({items.length} صنف) لحماية عملك من الضياع.</span>
          </div>
          <button
            type="button"
            onClick={handleClearDraft}
            className="px-2.5 py-1 bg-white hover:bg-amber-100 text-amber-900 border border-amber-300 rounded-lg font-bold transition-colors"
          >
            مسح والبدء من جديد
          </button>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-blue-600 text-white rounded-xl shadow-md">
            <ArrowRightLeft size={24} />
          </div>
          <div>
            <h2 className="text-xl font-black text-slate-800">تحويل مخزني فوري متعدد الوحدات والتعبئة</h2>
            <p className="text-xs text-slate-500">نقل الخامات والمنتجات بأي وحدة سحب (كرتونة، علبة، كيس، باكو، زجاجة، شيكارة، صفيحة...) مع المعادل الآلي</p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => navigate('/stock-transfer-list')}
          className="flex items-center gap-2 px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-all"
        >
          <List size={16} /> سجل التحويلات السابقة
        </button>
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
          {items.length === 0 ? (
            <div className="text-center py-10 border-2 border-dashed border-slate-200 rounded-2xl bg-slate-50/50">
              <Package size={40} className="mx-auto text-slate-300 mb-2" />
              <p className="text-sm font-bold text-slate-600">لم يتم إضافة أي أصناف للتحويل حتى الآن</p>
              <p className="text-xs text-slate-400 mt-1">اختر المستودع المصدر ثم استخدم البحث السريع أو مسدس الباركود لسحب الأصناف بأي وحدة مطلوبة</p>
            </div>
          ) : (
            <div className="border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
              <div className="overflow-x-auto">
                <table className="w-full text-right text-xs">
                  <thead className="bg-slate-100 text-slate-700 font-black border-b">
                    <tr>
                      <th className="p-3 w-10 text-center">#</th>
                      <th className="p-3">الصنف والكود</th>
                      <th className="p-3 w-44 text-center">الكمية المسحوبة والوحدة</th>
                      <th className="p-3 w-40 text-center">معامل التعبئة والتجزئة</th>
                      <th className="p-3 w-32 text-center">المعادل بالمخزن</th>
                      <th className="p-3 w-36 text-center">رصيد المصدر</th>
                      <th className="p-3 w-28 text-center">حالة الرصيد</th>
                      <th className="p-3 w-12 text-center">حذف</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {items.map((item, idx) => {
                      const prod = products.find(p => p.id === item.productId);
                      const sourceStock = getProductWarehouseStock(prod, formData.fromWarehouseId);
                      const isOverStock = item.baseQuantity > sourceStock;
                      const hasConversion = item.conversionRatio !== 1;
                      const stockInSelectedUnit = item.conversionRatio > 0 ? (sourceStock / item.conversionRatio).toFixed(1) : '-';

                      return (
                        <tr key={idx} className="hover:bg-slate-50/80 transition-colors">
                          <td className="p-3 text-center font-bold text-slate-400">
                            {idx + 1}
                          </td>

                          <td className="p-3">
                            <div className="font-bold text-slate-800 text-sm">{item.productName}</div>
                            {item.sku && (
                              <div className="font-mono text-[10px] text-slate-400 mt-0.5">
                                كود: {item.sku}
                              </div>
                            )}
                          </td>

                          {/* الكمية بالوحدة المسحوبة مع أزرار التحكم السريع */}
                          <td className="p-3 text-center">
                            <div className="inline-flex items-center gap-1 bg-white border border-slate-200 rounded-xl p-1 shadow-sm">
                              <button
                                type="button"
                                onClick={() => handleStepQuantity(idx, -1)}
                                className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-slate-100 text-slate-600 transition-colors"
                                title="إنقاص وحدة"
                              >
                                <Minus size={13} />
                              </button>

                              <input
                                type="number"
                                min="0.001"
                                step="any"
                                value={item.enteredQty}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') e.preventDefault();
                                }}
                                onChange={e => handleUpdateEnteredQty(idx, parseFloat(e.target.value) || 0)}
                                className="w-16 text-center text-sm font-black text-slate-800 focus:outline-none"
                              />

                              <span className="text-[11px] font-bold text-slate-600 pl-1 pr-0.5">
                                {item.selectedUnit}
                              </span>

                              <button
                                type="button"
                                onClick={() => handleStepQuantity(idx, 1)}
                                className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-slate-100 text-slate-600 transition-colors"
                                title="زيادة وحدة"
                              >
                                <Plus size={13} />
                              </button>
                            </div>
                          </td>

                          {/* بيان العبوة ومعامل التحويل */}
                          <td className="p-3 text-center">
                            {hasConversion ? (
                              <div className="inline-flex flex-col items-center">
                                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-100">
                                  <Box size={12} />
                                  <span>1 {item.selectedUnit} = {item.conversionRatio} {item.baseUnit}</span>
                                </span>
                                {item.packagingNote && (
                                  <span className="text-[10px] text-slate-400 mt-0.5 line-clamp-1 max-w-[140px]" title={item.packagingNote}>
                                    {item.packagingNote}
                                  </span>
                                )}
                              </div>
                            ) : (
                              <span className="text-slate-400 text-[11px]">
                                وحدة أساسية (1:1)
                              </span>
                            )}
                          </td>

                          {/* المعادل بالمخزن بالوحدة الأساسية */}
                          <td className="p-3 text-center">
                            <span className="inline-block px-2.5 py-1 rounded-lg font-black text-blue-700 bg-blue-50 border border-blue-100 text-xs">
                              {item.baseQuantity.toFixed(2)} {item.baseUnit}
                            </span>
                          </td>

                          {/* رصيد المصدر بالوحدتين */}
                          <td className="p-3 text-center">
                            <div>
                              <span className={`inline-block px-2 py-0.5 rounded text-xs font-bold ${
                                sourceStock > 0 
                                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' 
                                  : 'bg-rose-50 text-rose-700 border border-rose-100'
                              }`}>
                                {sourceStock} {item.baseUnit}
                              </span>
                              {hasConversion && sourceStock > 0 && (
                                <div className="text-[10px] text-slate-400 mt-0.5">
                                  (~ {stockInSelectedUnit} {item.selectedUnit})
                                </div>
                              )}
                            </div>
                          </td>

                          {/* حالة الرصيد */}
                          <td className="p-3 text-center">
                            {isOverStock ? (
                              <span className="inline-flex items-center gap-1 text-[11px] font-bold text-rose-600 bg-rose-50 px-2 py-1 rounded-lg border border-rose-200">
                                <AlertTriangle size={12} /> عجز: {(item.baseQuantity - sourceStock).toFixed(2)}
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-600 bg-emerald-50 px-2 py-1 rounded-lg border border-emerald-200">
                                <CheckCircle2 size={12} /> رصيد كافٍ
                              </span>
                            )}
                          </td>

                          {/* حذف البند */}
                          <td className="p-3 text-center">
                            <button 
                              type="button" 
                              onClick={() => handleRemoveItem(idx)} 
                              className="text-slate-400 hover:text-rose-600 hover:bg-rose-50 p-2 rounded-xl transition-all"
                              title="حذف البند"
                            >
                              <Trash2 size={16} />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* شريط إحصائيات الجدول */}
              <div className="p-4 bg-slate-50 border-t border-slate-200 flex flex-col sm:flex-row justify-between items-center gap-3 text-xs">
                <div className="flex items-center gap-6">
                  <div>
                    <span className="text-slate-500">عدد الأصناف: </span>
                    <span className="font-black text-slate-800 text-sm">{items.length} صنف</span>
                  </div>
                  <div>
                    <span className="text-slate-500">إجمالي الكميات (بالمخزن): </span>
                    <span className="font-black text-blue-700 text-sm">{totalBaseQuantity.toFixed(2)}</span>
                  </div>
                </div>

                {overStockCount > 0 && (
                  <div className="flex items-center gap-1.5 text-amber-700 bg-amber-50 px-3 py-1.5 rounded-xl border border-amber-200 font-bold text-[11px]">
                    <AlertTriangle size={14} /> يوجد ({overStockCount}) صنف كميتها تتجاوز الرصيد الحالي بالمستودع المصدر
                  </div>
                )}
              </div>
            </div>
          )}
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
              {items.length > 0 && (
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
                    <span>جاري ترحيل التحويل...</span>
                  </>
                ) : (
                  <>
                    <Save size={18} />
                    <span>إتمام وترحيل التحويل المخزني</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </form>

      {/* 🧮 نافذة منبثقة: إعداد وتخصيص شجرة عبوات وتجزئة الصنف (Universal Packaging Hierarchy Modal) */}
      {isPackagingModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 max-w-xl w-full overflow-hidden space-y-0">
            {/* رأس النافذة */}
            <div className="p-5 bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-700 text-white flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-white/10 rounded-xl">
                  <Layers size={22} />
                </div>
                <div>
                  <h3 className="font-black text-base">إعداد شجرة العبوات والتجزئة والسحب</h3>
                  <p className="text-xs text-blue-100">
                    الصنف: <strong className="text-white">{selectedProductObj?.name || 'صنف'}</strong> | الوحدة المعيارية للمخزن: ({baseUnitOfSelectedProduct})
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setIsPackagingModalOpen(false)}
                className="p-1.5 rounded-full hover:bg-white/20 text-white transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            {/* محتوى النافذة */}
            <div className="p-6 space-y-5 max-h-[80vh] overflow-y-auto custom-scrollbar">
              {/* التبديل بين النمط الهرمي متعدد المستويات والنمط الفردي المباشر */}
              <div className="grid grid-cols-2 p-1 bg-slate-100 rounded-xl text-xs font-bold">
                <button
                  type="button"
                  onClick={() => setCalcMode('hierarchy')}
                  className={`py-2 px-3 rounded-lg flex items-center justify-center gap-1.5 transition-all ${
                    calcMode === 'hierarchy' ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <Layers size={14} /> طرد مركب (كرتونة ← علب ← أكياس...)
                </button>
                <button
                  type="button"
                  onClick={() => setCalcMode('single')}
                  className={`py-2 px-3 rounded-lg flex items-center justify-center gap-1.5 transition-all ${
                    calcMode === 'single' ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <Box size={14} /> عبوة مباشرة (شيكارة / صفيحة / زجاجة...)
                </button>
              </div>

              {/* ------------------------------------------------------------- */}
              {/* النمط 1: شجرة تعبئة وتجزئة هرمية متعددة المستويات */}
              {/* ------------------------------------------------------------- */}
              {calcMode === 'hierarchy' ? (
                <div className="space-y-4">
                  <div className="bg-slate-50 p-3.5 rounded-2xl border border-slate-200/80 space-y-3">
                    <span className="text-xs font-black text-slate-800 flex items-center gap-1.5">
                      <Box size={14} className="text-indigo-600" />
                      المستوى 1: الطرد الأكبر (وحدة الشراء الكبرى)
                    </span>
                    <div>
                      <label className="block text-[11px] font-bold text-slate-600 mb-1">
                        اسم الطرد الكبير (مثال: كرتونة، شيكارة، صندوق، بالتة...)
                      </label>
                      <input
                        type="text"
                        value={bulkUnitName}
                        onChange={e => setBulkUnitName(e.target.value)}
                        placeholder="اكتب اسم الطرد (مثلاً: كرتونة)"
                        className="w-full border border-slate-200 focus:border-indigo-500 rounded-xl p-2.5 text-xs bg-white outline-none font-bold"
                      />
                    </div>
                  </div>

                  <div className="bg-slate-50 p-3.5 rounded-2xl border border-slate-200/80 space-y-3">
                    <span className="text-xs font-black text-slate-800 flex items-center gap-1.5">
                      <Layers size={14} className="text-indigo-600" />
                      المستوى 2: العبوة الوسيطة (العبوات الداخلية بالطرد)
                    </span>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-[11px] font-bold text-slate-600 mb-1">
                          اسم العبوة الوسيطة (مثال: علبة، باكت، جردل، لفة...)
                        </label>
                        <input
                          type="text"
                          value={mediumUnitName}
                          onChange={e => setMediumUnitName(e.target.value)}
                          placeholder="اكتب اسم العبوة (مثلاً: علبة)"
                          className="w-full border border-slate-200 focus:border-indigo-500 rounded-xl p-2.5 text-xs bg-white outline-none font-bold"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-bold text-slate-600 mb-1">
                          كم {mediumUnitName || 'عبوة'} بداخل كل {bulkUnitName || 'طرد'}؟
                        </label>
                        <input
                          type="number"
                          min="1"
                          value={mediumUnitsPerBulk}
                          onChange={e => setMediumUnitsPerBulk(parseInt(e.target.value) || 1)}
                          placeholder="مثلاً: 4"
                          className="w-full border border-slate-200 focus:border-indigo-500 rounded-xl p-2.5 text-center text-xs bg-white outline-none font-black"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="bg-slate-50 p-3.5 rounded-2xl border border-slate-200/80 space-y-3">
                    <span className="text-xs font-black text-slate-800 flex items-center gap-1.5">
                      <CornerDownLeft size={14} className="text-indigo-600" />
                      المستوى 3: وحدة التجزئة الصغرى (وحدة السحب الدقيق للشيف)
                    </span>
                    <div className="grid grid-cols-3 gap-3">
                      <div className="col-span-1">
                        <label className="block text-[11px] font-bold text-slate-600 mb-1">
                          اسم الوحدة الصغرى
                        </label>
                        <input
                          type="text"
                          value={smallUnitName}
                          onChange={e => setSmallUnitName(e.target.value)}
                          placeholder="مثلاً: كيس أو باكو"
                          className="w-full border border-slate-200 focus:border-indigo-500 rounded-xl p-2.5 text-xs bg-white outline-none font-bold"
                        />
                      </div>
                      <div className="col-span-1">
                        <label className="block text-[11px] font-bold text-slate-600 mb-1">
                          كم {smallUnitName || 'وحدة'} بالـ {mediumUnitName || 'عبوة'}؟
                        </label>
                        <input
                          type="number"
                          min="1"
                          value={smallUnitsPerMedium}
                          onChange={e => setSmallUnitsPerMedium(parseInt(e.target.value) || 1)}
                          placeholder="مثلاً: 12"
                          className="w-full border border-slate-200 focus:border-indigo-500 rounded-xl p-2.5 text-center text-xs bg-white outline-none font-black"
                        />
                      </div>
                      <div className="col-span-1">
                        <label className="block text-[11px] font-bold text-slate-600 mb-1">
                          سعة الـ {smallUnitName || 'وحدة'} ({baseUnitOfSelectedProduct})
                        </label>
                        <input
                          type="number"
                          min="0.0001"
                          step="any"
                          value={baseQtyPerSmallUnit}
                          onChange={e => setBaseQtyPerSmallUnit(parseFloat(e.target.value) || 0)}
                          placeholder="مثلاً: 0.25"
                          className="w-full border border-slate-200 focus:border-indigo-500 rounded-xl p-2.5 text-center text-xs bg-white outline-none font-black"
                        />
                      </div>
                    </div>
                  </div>

                  {/* المعاينة الحية لشجرة التعبئة */}
                  {smallUnitName && (
                    <div className="p-4 bg-gradient-to-br from-indigo-50 to-purple-50 border border-indigo-200 rounded-2xl space-y-2 text-xs">
                      <span className="font-black text-indigo-900 block flex items-center gap-1.5">
                        <Sparkles size={14} className="text-indigo-600" />
                        المعاينة الحية لهيكل تعبئة الصنف:
                      </span>
                      <div className="space-y-1 text-slate-700 font-bold pr-2">
                        {bulkUnitName && (
                          <div className="flex items-center gap-1 text-indigo-950 font-black">
                            <span>📦 1 {bulkUnitName}</span>
                            <span>= {mediumUnitsPerBulk} {mediumUnitName || 'عبوة'}</span>
                            <span>= {mediumUnitsPerBulk * smallUnitsPerMedium} {smallUnitName}</span>
                            <span className="text-purple-700">(= {(mediumUnitsPerBulk * smallUnitsPerMedium * baseQtyPerSmallUnit).toFixed(2)} {baseUnitOfSelectedProduct})</span>
                          </div>
                        )}
                        {mediumUnitName && (
                          <div className="flex items-center gap-1 text-slate-800">
                            <span>🔹 1 {mediumUnitName}</span>
                            <span>= {smallUnitsPerMedium} {smallUnitName}</span>
                            <span className="text-purple-700">(= {(smallUnitsPerMedium * baseQtyPerSmallUnit).toFixed(2)} {baseUnitOfSelectedProduct})</span>
                          </div>
                        )}
                        <div className="flex items-center gap-1 text-slate-800">
                          <span>🔸 1 {smallUnitName}</span>
                          <span className="text-purple-700">= {baseQtyPerSmallUnit} {baseUnitOfSelectedProduct}</span>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* اختيار وحدة وكمية السحب الآن في هذا التحويل */}
                  <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl space-y-3">
                    <span className="text-xs font-black text-slate-800 block">
                      ما الذي يريد الشيف / المطبخ سحبه الآن في هذا التحويل؟
                    </span>
                    <div className="grid grid-cols-3 gap-2 text-xs font-bold">
                      <button
                        type="button"
                        onClick={() => setTargetWithdrawalTier('small')}
                        className={`p-2.5 rounded-xl border flex flex-col items-center justify-center gap-1 transition-all ${
                          targetWithdrawalTier === 'small' ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm' : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
                        }`}
                      >
                        <span className="text-[10px] opacity-80">سحب بالتجزئة</span>
                        <span>{smallUnitName || 'وحدة صغرى'}</span>
                      </button>

                      {mediumUnitName && (
                        <button
                          type="button"
                          onClick={() => setTargetWithdrawalTier('medium')}
                          className={`p-2.5 rounded-xl border flex flex-col items-center justify-center gap-1 transition-all ${
                            targetWithdrawalTier === 'medium' ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm' : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
                          }`}
                        >
                          <span className="text-[10px] opacity-80">سحب بالعبوة</span>
                          <span>{mediumUnitName}</span>
                        </button>
                      )}

                      {bulkUnitName && (
                        <button
                          type="button"
                          onClick={() => setTargetWithdrawalTier('bulk')}
                          className={`p-2.5 rounded-xl border flex flex-col items-center justify-center gap-1 transition-all ${
                            targetWithdrawalTier === 'bulk' ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm' : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
                          }`}
                        >
                          <span className="text-[10px] opacity-80">سحب بالطرد الأكبر</span>
                          <span>{bulkUnitName}</span>
                        </button>
                      )}
                    </div>

                    <div className="flex items-center gap-3 pt-2">
                      <label className="text-xs font-bold text-slate-700 shrink-0">
                        الكمية المسحوبة:
                      </label>
                      <input
                        type="number"
                        min="0.1"
                        step="any"
                        value={withdrawalQty}
                        onChange={e => setWithdrawalQty(parseFloat(e.target.value) || 0)}
                        placeholder="مثلاً: 8"
                        className="w-28 border border-slate-200 focus:border-indigo-500 rounded-xl p-2 text-center text-sm bg-white outline-none font-black"
                      />
                      <span className="text-xs font-bold text-slate-600">
                        {targetWithdrawalTier === 'small' ? smallUnitName : targetWithdrawalTier === 'medium' ? mediumUnitName : bulkUnitName}
                      </span>
                    </div>
                  </div>
                </div>
              ) : (
                /* ------------------------------------------------------------- */
                /* النمط 2: عبوة مباشرة بسيطة (شيكارة / صفيحة / زجاجة / برطمان...) */
                /* ------------------------------------------------------------- */
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1.5">
                      اسم العبوة (مثال: شيكارة، صفيحة، كيس، زجاجة، برطمان، قالب، برميل...)
                    </label>
                    <input
                      type="text"
                      value={singleUnitName}
                      onChange={e => setSingleUnitName(e.target.value)}
                      placeholder="اكتب اسم العبوة بحرية..."
                      className="w-full border border-slate-200 focus:border-blue-500 rounded-xl p-2.5 text-xs bg-slate-50 focus:bg-white outline-none font-bold"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">
                        سعة/وزن العبوة الواحدة ({baseUnitOfSelectedProduct})
                      </label>
                      <input
                        type="number"
                        min="0.001"
                        step="any"
                        value={singleUnitCapacity}
                        onChange={e => setSingleUnitCapacity(parseFloat(e.target.value) || 0)}
                        placeholder="مثلاً: 25 أو 50 أو 1"
                        className="w-full border border-slate-200 focus:border-blue-500 rounded-xl p-2.5 text-center text-sm font-black bg-white outline-none"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">
                        عدد العبوات المطلوب سحبها
                      </label>
                      <input
                        type="number"
                        min="0.1"
                        step="any"
                        value={singleWithdrawalQty}
                        onChange={e => setSingleWithdrawalQty(parseFloat(e.target.value) || 0)}
                        placeholder="مثلاً: 1"
                        className="w-full border border-slate-200 focus:border-blue-500 rounded-xl p-2.5 text-center text-sm font-black bg-white outline-none"
                      />
                    </div>
                  </div>

                  {/* بطاقة النتيجة الحية للمباشر */}
                  {singleUnitName && (
                    <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-2xl text-center space-y-1">
                      <span className="text-xs text-emerald-700 font-bold block">إجمالي المعادل بالمخزن:</span>
                      <div className="text-2xl font-black text-emerald-900">
                        {((Number(singleWithdrawalQty) || 0) * (Number(singleUnitCapacity) || 0)).toFixed(2)} {baseUnitOfSelectedProduct}
                      </div>
                      <div className="text-xs text-emerald-800 font-medium">
                        ({singleWithdrawalQty} {singleUnitName} × {singleUnitCapacity} {baseUnitOfSelectedProduct})
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* أزرار الإجراء */}
              <div className="grid grid-cols-2 gap-3 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => handleSaveAndApplyPackaging(false)}
                  className="py-3 px-4 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl text-xs flex items-center justify-center gap-1.5 shadow-md shadow-indigo-500/20 transition-all"
                >
                  <Check size={16} /> حفظ الهيكل وتطبيق السحب
                </button>

                <button
                  type="button"
                  onClick={() => handleSaveAndApplyPackaging(true)}
                  className="py-3 px-4 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-xs flex items-center justify-center gap-1.5 shadow-md shadow-emerald-500/20 transition-all"
                >
                  <Plus size={16} /> حفظ وإضافة للجدول مباشرة
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default StockTransfer;

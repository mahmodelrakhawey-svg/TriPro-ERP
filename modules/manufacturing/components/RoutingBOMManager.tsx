import React, { useEffect, useState, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { supabase } from '../../../supabaseClient';
import { useAccounting as useOrg } from '../../../context/AccountingContext';
import { useToast } from '../../../context/ToastContext';
import {
  Factory, Plus, Trash2, Save, Loader2, Edit, X, Layers, Settings,
  Clock, Package, CheckSquare, Square, GripVertical, Info, DollarSign, Paperclip, Download,
  ChevronDown, ChevronUp, Star, FileSpreadsheet, Upload,
  Calculator, Scale, Sparkles, Box, Check, HelpCircle, CornerDownLeft
} from 'lucide-react';
import SearchableSelect from '../../../components/SearchableSelect';
import { exportSingleProductBOMToExcel, exportMasterBOMToExcel } from '../utils/bomExportUtils';
import { BOMImportModal } from './BOMImportModal';
import { secureStorage } from '../../../utils/securityMiddleware';

export interface SavedPackagingHierarchy {
  bulkUnitName: string;
  mediumUnitsPerBulk: number;
  mediumUnitName: string;
  smallUnitsPerMedium: number;
  smallUnitName: string;
  baseQtyPerSmallUnit: number;
}

export interface RecipeUnitOption {
  unitName: string;
  label: string;
  ratio: number;
  note?: string;
  category?: 'base' | 'culinary' | 'packaging' | 'system';
}

export function getRawMaterialRecipeUnits(rawProd: any, systemUoms: any[] = []): RecipeUnitOption[] {
  if (!rawProd) return [];
  const base = (rawProd.unit || 'وحدة').trim();
  const options: RecipeUnitOption[] = [];

  // 1. الوحدة الأساسية للصنف في المخزن
  options.push({
    unitName: base,
    label: `${base} (الوحدة الأساسية للمخزن)`,
    ratio: 1,
    note: 'الوحدة المعتمدة في بطاقة الصنف بالمخزن',
    category: 'base'
  });

  const isWeight = /كجم|كيلو|kg|جرام|جم|gram/i.test(base);
  const isVolume = /لتر|مل|liter|ml/i.test(base);

  // 2. وحدات الأوزان ومعايير الشيف
  if (isWeight) {
    if (!/^(جرام|جم|gram)$/i.test(base)) {
      options.push({
        unitName: 'جرام',
        label: 'جرام (جم) - 1/1000 كجم',
        ratio: 0.001,
        note: '1000 جرام = 1 كجم',
        category: 'culinary'
      });
      options.push({
        unitName: 'ملعقة صغيرة (5 جم)',
        label: 'ملعقة صغيرة (5 جرام)',
        ratio: 0.005,
        note: 'معيار 5 جرام تقريباً',
        category: 'culinary'
      });
      options.push({
        unitName: 'ملعقة كبيرة (15 جم)',
        label: 'ملعقة كبيرة (15 جرام)',
        ratio: 0.015,
        note: 'معيار 15 جرام تقريباً',
        category: 'culinary'
      });
      options.push({
        unitName: 'أوقية / أونصة (28.35 جم)',
        label: 'أوقية / أونصة (28.35 جم)',
        ratio: 0.02835,
        note: '28.35 جرام',
        category: 'culinary'
      });
    } else {
      options.push({
        unitName: 'كجم',
        label: 'كيلوجرام (1000 جم)',
        ratio: 1000,
        note: '1 كجم = 1000 جرام',
        category: 'culinary'
      });
    }
  }

  // 3. وحدات السوائل والأحجام
  if (isVolume) {
    if (!/^(مل|مليلتر|ml)$/i.test(base)) {
      options.push({
        unitName: 'مل',
        label: 'مل (مليلتر) - 1/1000 لتر',
        ratio: 0.001,
        note: '1000 مل = 1 لتر',
        category: 'culinary'
      });
      options.push({
        unitName: 'ملعقة كبيرة (15 مل)',
        label: 'ملعقة كبيرة (15 مل)',
        ratio: 0.015,
        note: 'معيار 15 مل تقريباً',
        category: 'culinary'
      });
      options.push({
        unitName: 'كوب معياري (240 مل)',
        label: 'كوب معياري (240 مل)',
        ratio: 0.240,
        note: 'كوب 240 مل',
        category: 'culinary'
      });
    } else {
      options.push({
        unitName: 'لتر',
        label: 'لتر (1000 مل)',
        ratio: 1000,
        note: '1 لتر = 1000 مل',
        category: 'culinary'
      });
    }
  }

  // 4. استرجاع شجرة التعبئة المحفوظة للصنف
  try {
    const savedHierarchy = secureStorage.getItem<SavedPackagingHierarchy>(`tripro_pkg_hierarchy_${rawProd.id}`);
    if (savedHierarchy) {
      const smallQty = Number(savedHierarchy.baseQtyPerSmallUnit) || 1;
      const medQty = (Number(savedHierarchy.smallUnitsPerMedium) || 1) * smallQty;
      const bulkQty = (Number(savedHierarchy.mediumUnitsPerBulk) || 1) * medQty;

      if (savedHierarchy.smallUnitName && !options.some(o => o.unitName === savedHierarchy.smallUnitName)) {
        options.push({
          unitName: savedHierarchy.smallUnitName,
          label: `${savedHierarchy.smallUnitName} (= ${smallQty} ${base})`,
          ratio: smallQty,
          note: `وحدة تجزئة صغرى (${smallQty} ${base})`,
          category: 'packaging'
        });
      }

      if (savedHierarchy.mediumUnitName && savedHierarchy.mediumUnitName !== savedHierarchy.smallUnitName && !options.some(o => o.unitName === savedHierarchy.mediumUnitName)) {
        options.push({
          unitName: savedHierarchy.mediumUnitName,
          label: `${savedHierarchy.mediumUnitName} (= ${savedHierarchy.smallUnitsPerMedium} ${savedHierarchy.smallUnitName})`,
          ratio: medQty,
          note: `عبوة وسيطة (${medQty} ${base})`,
          category: 'packaging'
        });
      }

      if (savedHierarchy.bulkUnitName && savedHierarchy.bulkUnitName !== savedHierarchy.mediumUnitName && !options.some(o => o.unitName === savedHierarchy.bulkUnitName)) {
        options.push({
          unitName: savedHierarchy.bulkUnitName,
          label: `${savedHierarchy.bulkUnitName} (= ${bulkQty} ${base})`,
          ratio: bulkQty,
          note: `طرد كلي (${bulkQty} ${base})`,
          category: 'packaging'
        });
      }
    }

    // 5. استرجاع العبوات الفردية المخصصة للصنف
    const savedRules = secureStorage.getItem<any[]>(`tripro_pkg_rules_${rawProd.id}`);
    if (Array.isArray(savedRules)) {
      savedRules.forEach(r => {
        if (!options.some(o => o.unitName === r.unitName)) {
          options.push({
            unitName: r.unitName,
            label: `${r.unitName} (= ${r.ratio} ${base})`,
            ratio: Number(r.ratio) || 1,
            note: r.packagingNote,
            category: 'packaging'
          });
        }
      });
    }
  } catch (e) {
    console.error('Error reading packaging for recipe:', e);
  }

  // 6. مطابقة وحدات النظام العامة (UoMs)
  if (Array.isArray(systemUoms)) {
    systemUoms.forEach(u => {
      let ratio = Number(u.ratio) || 1;
      if (u.uom_type === 'smaller' && ratio > 0) ratio = 1 / ratio;
      if (!options.some(o => o.unitName === u.name)) {
        if (isWeight && /جرام|جم|كيلو|كجم|شيكارة|صفيحة|كيس|علبة|علبه|قالب/i.test(u.name)) {
          options.push({
            unitName: u.name,
            label: `${u.name} (نظام: ${ratio} ${base})`,
            ratio,
            category: 'system'
          });
        } else if (isVolume && /مل|لتر|جالون|زجاجة/i.test(u.name)) {
          options.push({
            unitName: u.name,
            label: `${u.name} (نظام: ${ratio} ${base})`,
            ratio,
            category: 'system'
          });
        }
      }
    });
  }

  return options;
}

interface WorkCenter {
  id: string;
  name: string;
  description: string | null;
  hourly_rate: number;
  overhead_rate: number;
}

interface Routing {
  id: string;
  product_id: string;
  name: string;
  is_default: boolean;
}

interface RoutingStep {
  id: string;
  routing_id: string;
  step_order: number;
  work_center_id: string | null;
  operation_name: string;
  standard_time_minutes: number;
  work_centers?: { name: string } | null; // Joined data
  materials?: StepMaterial[]; // Nested materials
  attachments?: StepAttachment[];
}

interface StepAttachment {
  id: string;
  step_id: string;
  file_name: string;
  file_url: string;
  created_at: string;
}

interface StepMaterial {
  id: string;
  step_id: string;
  raw_material_id: string;
  quantity_required: number;
  products?: { name: string; unit: string } | null; // Joined data
}

interface MfgProduct {
  id: string;
  name: string;
  unit?: string;
  mfg_type?: 'standard' | 'raw' | 'subassembly' | 'intermediate';
  product_type?: string;
}

interface SearchableOption {
  id: string;
  name: string;
  code?: string;
}

const RoutingBOMManager = () => {
  const { organization, products: allProducts } = useOrg();
  const orgId = organization?.id;
  const { showToast } = useToast();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [exportingMaster, setExportingMaster] = useState(false);
  const [exportingSingle, setExportingSingle] = useState(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);

  const [searchParams] = useSearchParams();
  const paramProductId = searchParams.get('productId');

  const [workCenters, setWorkCenters] = useState<WorkCenter[]>([]);
  const [selectedProductId, setSelectedProductId] = useState<string | null>(paramProductId || null);

  useEffect(() => {
    if (paramProductId && selectedProductId !== paramProductId) {
      setSelectedProductId(paramProductId);
    }
  }, [paramProductId]);
  const [currentRouting, setCurrentRouting] = useState<Routing | null>(null);
  const [routingSteps, setRoutingSteps] = useState<RoutingStep[]>([]);

  const [isWorkCenterModalOpen, setIsWorkCenterModalOpen] = useState(false);
  const [editingWorkCenter, setEditingWorkCenter] = useState<WorkCenter | null>(null);

  const [openStepId, setOpenStepId] = useState<string | null>(null); // For expanding/collapsing step details

  const [systemUoms, setSystemUoms] = useState<any[]>([]);

  // 🧪 حالة المادة الخام المراد إضافتها في المرحلة مع دعم التحويل التلقائي للوحدات
  const [selectedRawId, setSelectedRawId] = useState<string>('');
  const [ingredientEnteredQty, setIngredientEnteredQty] = useState<number>(1);
  const [ingredientSelectedUnit, setIngredientSelectedUnit] = useState<string>('');
  const [ingredientUnitRatio, setIngredientUnitRatio] = useState<number>(1);

  // 🧮 حاسبة عبوات وتجزئة الوصفة السريعة (كرتونة ← علب ← أظرف...)
  const [isRecipeCalcModalOpen, setIsRecipeCalcModalOpen] = useState<boolean>(false);
  const [recipeCalcBulkName, setRecipeCalcBulkName] = useState<string>('كرتونة');
  const [recipeCalcMedUnitsPerBulk, setRecipeCalcMedUnitsPerBulk] = useState<number>(12);
  const [recipeCalcMedName, setRecipeCalcMedName] = useState<string>('علبة');
  const [recipeCalcSmallUnitsPerMed, setRecipeCalcSmallUnitsPerMed] = useState<number>(50);
  const [recipeCalcSmallName, setRecipeCalcSmallName] = useState<string>('ظرف');
  const [recipeCalcBaseQtyPerSmall, setRecipeCalcBaseQtyPerSmall] = useState<number>(1);
  const [recipeCalcTargetTier, setRecipeCalcTargetTier] = useState<'small' | 'medium' | 'bulk'>('small');
  const [recipeCalcWithdrawalQty, setRecipeCalcWithdrawalQty] = useState<number>(1);
  const [activeStepIdForPackaging, setActiveStepIdForPackaging] = useState<string | null>(null);

  // جلب وحدات النظام العامة UoMs
  useEffect(() => {
    const fetchSystemUoms = async () => {
      try {
        let q = supabase.from('uoms').select('*');
        if (orgId) q = q.eq('organization_id', orgId);
        const { data } = await q;
        if (data) setSystemUoms(data);
      } catch (e) {
        console.error('Error fetching system uoms:', e);
      }
    };
    fetchSystemUoms();
  }, [orgId]);

  // المادة الخام المختارة حالياً
  const selectedRawProduct = useMemo(() => {
    return (allProducts as any[])?.find(p => p.id === selectedRawId);
  }, [allProducts, selectedRawId]);

  // قائمة الوحدات والمعايير المتاحة للصنف المختار (جرامات، أظرف، علب، ملاعق، أكواب...)
  const rawAvailableUnits = useMemo(() => {
    return getRawMaterialRecipeUnits(selectedRawProduct, systemUoms);
  }, [selectedRawProduct, systemUoms]);

  // تعيين الوحدة الافتراضية الذكية عند تغيير المادة الخام
  useEffect(() => {
    if (selectedRawProduct && rawAvailableUnits.length > 0) {
      const base = (selectedRawProduct.unit || '').trim();
      const isWeight = /كجم|كيلو|kg/i.test(base);
      const isVolume = /لتر|liter/i.test(base);

      const gramOpt = rawAvailableUnits.find(u => u.unitName === 'جرام');
      const mlOpt = rawAvailableUnits.find(u => u.unitName === 'مل');
      const packOpt = rawAvailableUnits.find(u => u.category === 'packaging');

      if (isWeight && gramOpt) {
        setIngredientSelectedUnit(gramOpt.unitName);
        setIngredientUnitRatio(gramOpt.ratio);
        setIngredientEnteredQty(100);
      } else if (isVolume && mlOpt) {
        setIngredientSelectedUnit(mlOpt.unitName);
        setIngredientUnitRatio(mlOpt.ratio);
        setIngredientEnteredQty(250);
      } else if (packOpt) {
        setIngredientSelectedUnit(packOpt.unitName);
        setIngredientUnitRatio(packOpt.ratio);
        setIngredientEnteredQty(1);
      } else {
        const firstOpt = rawAvailableUnits[0];
        setIngredientSelectedUnit(firstOpt.unitName);
        setIngredientUnitRatio(firstOpt.ratio);
        setIngredientEnteredQty(1);
      }
    }
  }, [selectedRawProduct, rawAvailableUnits]);

  // الكمية المعيارية المحسوبة بالمخزن = المقدار المدخل * معامل الوحدة
  const calculatedIngredientBaseQty = useMemo(() => {
    const entered = Number(ingredientEnteredQty) || 0;
    const ratio = Number(ingredientUnitRatio) || 1;
    return Math.round(entered * ratio * 10000) / 10000;
  }, [ingredientEnteredQty, ingredientUnitRatio]);

  // التكلفة التقديرية لهذا المقدار في الوجبة
  const estimatedIngredientCost = useMemo(() => {
    if (!selectedRawProduct) return 0;
    const unitCost = Number(selectedRawProduct.cost || selectedRawProduct.purchase_price || 0);
    return Math.round(calculatedIngredientBaseQty * unitCost * 100) / 100;
  }, [selectedRawProduct, calculatedIngredientBaseQty]);

  // فتح حاسبة العبوات السريعة للصنف
  const handleOpenRecipePackagingModal = (stepId: string) => {
    if (!selectedRawProduct) {
      showToast('الرجاء اختيار المادة الخام أولاً لحساب عبواتها ومقاديرها', 'warning');
      return;
    }
    setActiveStepIdForPackaging(stepId);

    try {
      const savedHierarchy = secureStorage.getItem<SavedPackagingHierarchy>(`tripro_pkg_hierarchy_${selectedRawProduct.id}`);
      if (savedHierarchy) {
        setRecipeCalcBulkName(savedHierarchy.bulkUnitName || 'كرتونة');
        setRecipeCalcMedUnitsPerBulk(savedHierarchy.mediumUnitsPerBulk || 12);
        setRecipeCalcMedName(savedHierarchy.mediumUnitName || 'علبة');
        setRecipeCalcSmallUnitsPerMed(savedHierarchy.smallUnitsPerMedium || 50);
        setRecipeCalcSmallName(savedHierarchy.smallUnitName || 'ظرف');
        setRecipeCalcBaseQtyPerSmall(savedHierarchy.baseQtyPerSmallUnit || 1);
      } else {
        setRecipeCalcBulkName('كرتونة');
        setRecipeCalcMedUnitsPerBulk(12);
        setRecipeCalcMedName('علبة');
        setRecipeCalcSmallUnitsPerMed(50);
        setRecipeCalcSmallName('ظرف');
        setRecipeCalcBaseQtyPerSmall(1);
      }
    } catch (e) {
      console.error(e);
    }

    setIsRecipeCalcModalOpen(true);
  };

  // تطبيق ناتج حاسبة العبوات على المقدار
  const handleApplyRecipePackaging = () => {
    if (!selectedRawProduct) return;

    const cleanBulk = recipeCalcBulkName.trim() || 'كرتونة';
    const cleanMed = recipeCalcMedName.trim() || 'علبة';
    const cleanSmall = recipeCalcSmallName.trim() || 'ظرف';
    const medPerBulk = Math.max(1, Number(recipeCalcMedUnitsPerBulk) || 1);
    const smallPerMed = Math.max(1, Number(recipeCalcSmallUnitsPerMed) || 1);
    const qtyPerSmall = Math.max(0.0001, Number(recipeCalcBaseQtyPerSmall) || 1);

    const hierarchyData: SavedPackagingHierarchy = {
      bulkUnitName: cleanBulk,
      mediumUnitsPerBulk: medPerBulk,
      mediumUnitName: cleanMed,
      smallUnitsPerMedium: smallPerMed,
      smallUnitName: cleanSmall,
      baseQtyPerSmallUnit: qtyPerSmall
    };

    try {
      secureStorage.setItem(`tripro_pkg_hierarchy_${selectedRawProduct.id}`, hierarchyData);
    } catch (e) {
      console.error(e);
    }

    let appliedUnit = cleanSmall;
    let appliedRatio = qtyPerSmall;
    let appliedQty = Number(recipeCalcWithdrawalQty) || 1;

    if (recipeCalcTargetTier === 'medium') {
      appliedUnit = cleanMed;
      appliedRatio = smallPerMed * qtyPerSmall;
    } else if (recipeCalcTargetTier === 'bulk') {
      appliedUnit = cleanBulk;
      appliedRatio = medPerBulk * smallPerMed * qtyPerSmall;
    }

    setIngredientSelectedUnit(appliedUnit);
    setIngredientUnitRatio(appliedRatio);
    setIngredientEnteredQty(appliedQty);
    setIsRecipeCalcModalOpen(false);

    showToast(`تم ضبط المقدار: ${appliedQty} ${appliedUnit} (= ${(appliedQty * appliedRatio).toFixed(4)} ${selectedRawProduct.unit || 'وحدة'})`, 'success');
  };

  const productOptions: any[] = useMemo(() => {
    return (allProducts as any[])
      .filter(p => {
        if (!p || p.deleted_at) return false;
        const mType = String(p.mfg_type || '').toLowerCase();
        const pType = String(p.product_type || p.item_type || '').toUpperCase();

        // استبعاد المواد الخام ومستلزمات الإنتاج بشكل صريح ونهائي
        if (pType === 'RAW_MATERIAL' || mType === 'raw') return false;

        // استبعاد الخدمات
        if (pType === 'SERVICE') return false;

        // إتاحة فقط المنتجات تامة الصنع والمنتجات الوسيطة / نصف المصنعة المحددة صراحة
        return (
          pType === 'MANUFACTURED' || 
          pType === 'INTERMEDIATE_PRODUCT' ||
          mType === 'standard' || 
          mType === 'intermediate' || 
          mType === 'subassembly'
        );
      }) 
      .map(p => {
        const mType = String(p.mfg_type || '').toLowerCase();
        const pType = String(p.product_type || p.item_type || '').toUpperCase();

        // المنتج الوسيط هو حصراً ما تم اختياره صراحة كمنتج وسيط
        const isIntermediate = 
          pType === 'INTERMEDIATE_PRODUCT' || 
          mType === 'intermediate' || 
          mType === 'subassembly';

        return { 
          id: p.id, 
          name: isIntermediate ? `🍰 [منتج وسيط] ${p.name}` : `🎂 [منتج تام] ${p.name}`,
          isIntermediate
        };
      });
  }, [allProducts]);

  const rawMaterialOptions: SearchableOption[] = useMemo(() => {
    return (allProducts as any[])
      .filter(p => {
        if (!p || p.deleted_at) return false;
        // منع اختيار المنتج لنفسه كمدخل لتفادي العلاقات الدائرية
        if (selectedProductId && p.id === selectedProductId) return false;
        
        const pType = String(p.product_type || p.item_type || '').toUpperCase();
        
        // استبعاد الخدمات فقط التي ليس لها حركة مخزنية
        if (pType === 'SERVICE') return false;
        
        // إتاحة كافة الأصناف المخزنية والمواد الخام والمنتجات الوسيطة والمصنعة
        return true;
      })
      .map(p => {
        const pType = String(p.product_type || p.item_type || '').toUpperCase();
        const mType = String(p.mfg_type || '').toLowerCase();

        const isSemiFinished = 
          pType === 'INTERMEDIATE_PRODUCT' ||
          mType === 'subassembly' || 
          mType === 'intermediate';
        const isManufactured = 
          pType === 'MANUFACTURED' || 
          mType === 'standard';
        const isRaw = 
          pType === 'RAW_MATERIAL' || 
          mType === 'raw';

        const badge = isSemiFinished 
          ? ' 🍰 [منتج وسيط]' 
          : isManufactured 
            ? ' ⚙️ [منتج مصنّع]' 
            : isRaw 
              ? ' 🧪 [مادة خام]' 
              : ' 📦 [صنف مخزني]';

        return { 
          id: p.id, 
          name: `${p.name}${badge}`, 
          code: p.unit || p.sku || undefined 
        };
      });
  }, [allProducts, selectedProductId]);

  // --- Data Fetching ---
  const fetchWorkCenters = async () => {
    if (!orgId) return;
    const { data, error } = await supabase
      .from('mfg_work_centers')
      .select('*')
      .eq('organization_id', orgId)
      .order('name', { ascending: true });
    
    if (error) showToast('خطأ في جلب مراكز العمل', 'error');
    else setWorkCenters(data || []);
  };

  const fetchRoutingData = async (productId: string) => {
    if (!orgId) return;
    setLoading(true);
    try {
      // Fetch default routing for the product
      let { data: routingData, error: routingError } = await supabase
        .from('mfg_routings')
        .select('*')
        .eq('product_id', productId)
        .eq('organization_id', orgId)
        .eq('is_default', true)
        .maybeSingle();

      if (routingError) throw routingError;

      // If no default, get the first one
      if (!routingData) {
        const { data: firstRouting, error: firstRoutingError } = await supabase
          .from('mfg_routings')
          .select('*')
          .eq('product_id', productId)
          .eq('organization_id', orgId)
          .limit(1)
          .maybeSingle();
        if (firstRoutingError) throw firstRoutingError;
        routingData = firstRouting;
      }

      setCurrentRouting(routingData);

      if (routingData) {
        const { data: stepsData, error: stepsError } = await supabase
          .from('mfg_routing_steps')
          .select(`
            *,
            mfg_work_centers(name),
            mfg_step_materials(
              *,
              products(name, unit)
            ),
            mfg_step_attachments(
              *
            )
          `)
          .eq('routing_id', routingData.id)
          .eq('organization_id', orgId)
          .order('step_order', { ascending: true });

        if (stepsError) throw stepsError;
        setRoutingSteps((stepsData || []).map((s: any) => ({
          ...s,
          attachments: s.mfg_step_attachments || [],
          materials: s.mfg_step_materials || [] // <--- تم إضافة هذا السطر لربط المواد الخام بالعرض
        })));
      } else {
        setRoutingSteps([]);
      }
    } catch (error) {
      showToast('خطأ في جلب بيانات المسار: ' + error.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchWorkCenters();
  }, [orgId]);

  useEffect(() => {
    if (selectedProductId) {
      fetchRoutingData(selectedProductId);
    } else {
      setCurrentRouting(null);
      setRoutingSteps([]);
      setLoading(false);
    }
  }, [orgId, selectedProductId]);

  // --- Work Center Management ---
  const handleSaveWorkCenter = async (wc: WorkCenter) => {
    setSaving(true);
    try {
      if (wc.id) {
        const { error } = await supabase.from('mfg_work_centers').update(wc).eq('id', wc.id);
        if (error) throw error;
        showToast('تم تحديث مركز العمل بنجاح', 'success');
      } else {
        // نقوم بحذف الـ id الفارغ لنسمح لقاعدة البيانات بتوليد UUID تلقائياً
        const { id, ...dataToInsert } = wc;
        const { error } = await supabase.from('mfg_work_centers').insert({ ...dataToInsert, organization_id: orgId });
        if (error) throw error;
        showToast('تم إضافة مركز العمل بنجاح', 'success');
      }
      setIsWorkCenterModalOpen(false);
      setEditingWorkCenter(null);
      fetchWorkCenters();
    } catch (error) {
      showToast('فشل حفظ مركز العمل: ' + error.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteWorkCenter = async (wcId: string) => {
    if (!window.confirm('هل أنت متأكد من حذف مركز العمل هذا؟')) return;
    setSaving(true);
    try {
      const { error } = await supabase.from('mfg_work_centers').delete().eq('id', wcId);
      if (error) throw error;
      showToast('تم حذف مركز العمل بنجاح', 'success');
      fetchWorkCenters();
    } catch (error) {
      showToast('فشل حذف مركز العمل: ' + error.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  // --- Routing Management ---
  const handleCreateRouting = async () => {
    if (!selectedProductId) return;
    setSaving(true);
    try {
      const { data, error } = await supabase
        .from('mfg_routings')
        .insert({
          product_id: selectedProductId,
          name: `مسار إنتاج لـ ${productOptions.find(p => p.id === selectedProductId)?.name}`,
          organization_id: orgId,
          is_default: true,
        })
        .select()
        .single();
      if (error) throw error;
      setCurrentRouting(data);
      showToast('تم إنشاء مسار إنتاج جديد', 'success');
    } catch (error) {
      showToast('فشل إنشاء المسار: ' + error.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleSetDefaultRouting = async (routingId: string) => {
    if (!selectedProductId) return;
    setSaving(true);
    try {
      // Unset current default
      const { error: unsetError } = await supabase
        .from('mfg_routings')
        .update({ is_default: false })
        .eq('product_id', selectedProductId)
        .eq('organization_id', orgId)
        .eq('is_default', true);

      if (unsetError) throw unsetError;

      // Set new default
      const { error: setError } = await supabase
        .from('mfg_routings')
        .update({ is_default: true })
        .eq('id', routingId);

      if (setError) throw setError;

      showToast('تم تعيين المسار الافتراضي بنجاح', 'success');
      fetchRoutingData(selectedProductId);
    } catch (error) {
      showToast('فشل تعيين المسار الافتراضي: ' + error.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  // --- Routing Step Management ---
  const handleAddStep = async () => {
    if (!currentRouting) return;
    setSaving(true);
    try {
      const newStepOrder = routingSteps.length > 0 ? Math.max(...routingSteps.map(s => s.step_order)) + 1 : 1;
      const { data, error } = await supabase
        .from('mfg_routing_steps')
        .insert({
          routing_id: currentRouting.id,
          step_order: newStepOrder,
          operation_name: 'مرحلة جديدة',
          standard_time_minutes: 0,
          organization_id: orgId,
        })
        .select()
        .single();
      if (error) throw error;
      setRoutingSteps(prev => [...prev, { ...data, materials: [] }]);
      showToast('تم إضافة مرحلة جديدة', 'success');
    } catch (error) {
      showToast('فشل إضافة المرحلة: ' + error.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleUpdateStep = async (stepId: string, updates: Partial<RoutingStep>) => {
    setSaving(true);
    try {
      const { error } = await supabase.from('mfg_routing_steps').update(updates).eq('id', stepId);
      if (error) throw error;
      setRoutingSteps(prev =>
        prev.map(step => (step.id === stepId ? { ...step, ...updates } : step))
      );
      showToast('تم تحديث المرحلة', 'success');
    } catch (error) {
      showToast('فشل تحديث المرحلة: ' + error.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  // 🔄 مزامنة خامات مراحل التصنيع لحظياً مع شجرة مكونات الصنف في المخازن (bill_of_materials) وتحديث التكلفة
  const syncRoutingToBOM = async (productId: string, updatedSteps: RoutingStep[]) => {
    if (!productId || !orgId) return;
    try {
      // 1. تجميع كميات الخامات عبر كافة مراحل المسار
      const aggregatedMaterials = new Map<string, number>();
      updatedSteps.forEach(step => {
        (step.materials || []).forEach(mat => {
          const prev = aggregatedMaterials.get(mat.raw_material_id) || 0;
          aggregatedMaterials.set(mat.raw_material_id, prev + Number(mat.quantity_required || 0));
        });
      });

      // 2. تحديث جدول bill_of_materials
      await supabase.from('bill_of_materials').delete().eq('product_id', productId);

      if (aggregatedMaterials.size > 0) {
        const rowsToInsert = Array.from(aggregatedMaterials.entries()).map(([rawId, qty]) => ({
          product_id: productId,
          raw_material_id: rawId,
          quantity_required: Number(qty.toFixed(4)),
          organization_id: orgId
        }));
        await supabase.from('bill_of_materials').insert(rowsToInsert);
      }

      // 3. إعادة احتساب تكلفة الصنف وتحديثها في جدول products
      let rawCost = 0;
      aggregatedMaterials.forEach((qty, rawId) => {
        const rawProd = (allProducts as any[])?.find(p => p.id === rawId);
        const unitCost = Number(rawProd?.cost || rawProd?.purchase_price || 0);
        rawCost += unitCost * qty;
      });

      const { data: prodData } = await supabase
        .from('products')
        .select('labor_cost, overhead_cost, is_overhead_percentage')
        .eq('id', productId)
        .single();

      let totalCost = rawCost;
      if (prodData) {
        const labor = Number(prodData.labor_cost) || 0;
        let overhead = Number(prodData.overhead_cost) || 0;
        if (prodData.is_overhead_percentage) {
          overhead = (rawCost + labor) * (overhead / 100);
        }
        totalCost = rawCost + labor + overhead;
      }

      await supabase
        .from('products')
        .update({ 
          cost: Number(totalCost.toFixed(4)),
          updated_at: new Date().toISOString()
        })
        .eq('id', productId);

    } catch (syncErr) {
      console.warn('تنبيه: تعذر المزامنة مع جدول bill_of_materials:', syncErr);
    }
  };

  const handleDeleteStep = async (stepId: string) => {
    if (!window.confirm('هل أنت متأكد من حذف هذه المرحلة وجميع المواد المرتبطة بها؟')) return;
    setSaving(true);
    try {
      const { error } = await supabase.from('mfg_routing_steps').delete().eq('id', stepId);
      if (error) throw error;
      const nextSteps = routingSteps.filter(step => step.id !== stepId);
      setRoutingSteps(nextSteps);
      const targetProdId = selectedProductId || currentRouting?.product_id;
      if (targetProdId) {
        await syncRoutingToBOM(targetProdId, nextSteps);
      }
      showToast('تم حذف المرحلة ومزامنة شجرة المكونات بنجاح', 'success');
    } catch (error) {
      showToast('فشل حذف المرحلة: ' + error.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  // --- Step Material Management (BOM) ---
  const handleAddMaterialToStep = async (
    stepId: string, 
    rawMaterialId: string, 
    quantity: number,
    recipeUnitName?: string,
    recipeEnteredQty?: number
  ) => {
    if (!rawMaterialId || quantity <= 0) {
      showToast('الرجاء اختيار مادة خام أو منتج وسيط وتحديد كمية صحيحة', 'warning');
      return;
    }
    const preciseQuantity = Number(quantity.toFixed(4));
    setSaving(true);
    try {
      const { data, error } = await supabase
        .from('mfg_step_materials')
        .insert({
          step_id: stepId,
          raw_material_id: rawMaterialId,
          quantity_required: preciseQuantity,
          organization_id: orgId,
        })
        .select(`*, products(name, unit)`)
        .single();
      if (error) throw error;

      const nextSteps = routingSteps.map(step =>
        step.id === stepId
          ? { ...step, materials: [...(step.materials || []), data] }
          : step
      );
      setRoutingSteps(nextSteps);
      setSelectedRawId('');
      setIngredientEnteredQty(1);

      const targetProdId = selectedProductId || currentRouting?.product_id;
      if (targetProdId) {
        await syncRoutingToBOM(targetProdId, nextSteps);
      }

      const prod = (allProducts as any[])?.find(p => p.id === rawMaterialId);
      const detailMsg = recipeUnitName && recipeEnteredQty 
        ? ` (${recipeEnteredQty} ${recipeUnitName} = ${preciseQuantity} ${prod?.unit || 'وحدة'})`
        : ` (${preciseQuantity} ${prod?.unit || 'وحدة'})`;

      showToast(`تمت إضافة المكون: ${prod?.name || ''}${detailMsg}`, 'success');
    } catch (error) {
      showToast('فشل إضافة المكون للمرحلة: ' + error.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleUpdateMaterialQuantity = async (materialId: string, stepId: string, quantity: number) => {
    if (quantity <= 0) {
      showToast('الكمية المطلوبة يجب أن تكون أكبر من صفر', 'warning');
      return;
    }
    const preciseQuantity = Number(quantity.toFixed(4));
    setSaving(true);
    try {
      const { error } = await supabase.from('mfg_step_materials').update({ quantity_required: preciseQuantity }).eq('id', materialId);
      if (error) throw error;
      const nextSteps = routingSteps.map(step =>
        step.id === stepId
          ? {
              ...step,
              materials: (step.materials || []).map(mat =>
                mat.id === materialId ? { ...mat, quantity_required: preciseQuantity } : mat
              ),
            }
          : step
      );
      setRoutingSteps(nextSteps);
      const targetProdId = selectedProductId || currentRouting?.product_id;
      if (targetProdId) {
        await syncRoutingToBOM(targetProdId, nextSteps);
      }
      showToast('تم تحديث كمية المادة الخام ومزامنة شجرة المكونات بنجاح', 'success');
    } catch (error) {
      showToast('فشل تحديث كمية المادة الخام: ' + error.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteMaterial = async (materialId: string, stepId: string) => {
    if (!window.confirm('هل أنت متأكد من حذف هذه المادة الخام من المرحلة؟')) return;
    setSaving(true);
    try {
      const { error } = await supabase.from('mfg_step_materials').delete().eq('id', materialId);
      if (error) throw error;
      const nextSteps = routingSteps.map(step =>
        step.id === stepId
          ? { ...step, materials: (step.materials || []).filter(mat => mat.id !== materialId) }
          : step
      );
      setRoutingSteps(nextSteps);
      const targetProdId = selectedProductId || currentRouting?.product_id;
      if (targetProdId) {
        await syncRoutingToBOM(targetProdId, nextSteps);
      }
      showToast('تم حذف المادة الخام ومزامنة شجرة المكونات بنجاح', 'success');
    } catch (error) {
      showToast('فشل حذف المادة الخام: ' + error.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleUploadAttachment = async (stepId: string, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !orgId) return;

    setSaving(true);
    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${stepId}/${Math.random()}.${fileExt}`;
      const filePath = `mfg/routings/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('documents')
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage.from('documents').getPublicUrl(filePath);

      const { error: dbError } = await supabase
        .from('mfg_step_attachments')
        .insert({
          step_id: stepId,
          file_name: file.name,
          file_url: publicUrl,
          organization_id: orgId
        });

      if (dbError) throw dbError;
      showToast('تم رفع المرفق بنجاح', 'success');
      fetchRoutingData(selectedProductId!);
    } catch (error) {
      showToast('خطأ في رفع المرفق: ' + error.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteAttachment = async (attachmentId: string) => {
    if (!window.confirm('هل أنت متأكد من حذف هذا المرفق؟')) return;
    try {
      const { error } = await supabase.from('mfg_step_attachments').delete().eq('id', attachmentId);
      if (error) throw error;
      showToast('تم حذف المرفق', 'success');
      fetchRoutingData(selectedProductId!);
    } catch (error) {
      showToast('فشل حذف المرفق: ' + error.message, 'error');
    }
  };

  // --- Export to Excel Handlers ---
  const handleExportSingle = async () => {
    if (!selectedProductId) {
      showToast('الرجاء اختيار صنف لتصدير مقاديره أولاً', 'warning');
      return;
    }
    setExportingSingle(true);
    try {
      const selectedProd = (allProducts as any[]).find(p => p.id === selectedProductId);
      const isIntermediate = productOptions.find(p => p.id === selectedProductId)?.isIntermediate || false;

      // إذا لم يكن هناك خطوات تفصيلية مسجلة ولكن توجد مقادير في bill_of_materials
      let fallbackBOM: any[] = [];
      const hasMaterialsInSteps = (routingSteps || []).some(s => (s.materials || []).length > 0);
      if (!hasMaterialsInSteps) {
        const { data: boms } = await supabase
          .from('bill_of_materials')
          .select('*, raw_material:products!raw_material_id(id, name, unit, cost, purchase_price, sku, product_type, mfg_type)')
          .eq('product_id', selectedProductId)
          .eq('organization_id', orgId);
        fallbackBOM = boms || [];
      }

      exportSingleProductBOMToExcel({
        product: selectedProd,
        isIntermediate,
        routing: currentRouting,
        routingSteps,
        allProducts: allProducts as any[],
        organizationName: organization?.name,
        fallbackBOM
      });

      showToast('تم تصدير شيت مراجعة مقادير الصنف إلى Excel بنجاح ✅', 'success');
    } catch (err) {
      console.error(err);
      showToast('فشل تصدير مقادير الصنف: ' + err.message, 'error');
    } finally {
      setExportingSingle(false);
    }
  };

  const handleExportMaster = async () => {
    if (!orgId) return;
    setExportingMaster(true);
    try {
      // 1. جلب كافة المسارات والمراحل والمواد لجميع الأصناف
      const { data: routingsData, error: rErr } = await supabase
        .from('mfg_routings')
        .select(`
          id,
          product_id,
          name,
          is_default,
          mfg_routing_steps (
            id,
            step_order,
            operation_name,
            standard_time_minutes,
            work_center_id,
            mfg_work_centers (name),
            mfg_step_materials (
              id,
              raw_material_id,
              quantity_required
            )
          )
        `)
        .eq('organization_id', orgId);

      if (rErr) throw rErr;

      // 2. جلب جدول bill_of_materials لتغطية أي أصناف مضافة بقوائم مواد مباشرة
      const { data: bomsData, error: bErr } = await supabase
        .from('bill_of_materials')
        .select('product_id, raw_material_id, quantity_required')
        .eq('organization_id', orgId);

      if (bErr) throw bErr;

      exportMasterBOMToExcel({
        organizationName: organization?.name,
        allProducts: allProducts as any[],
        productOptions,
        routingsData: routingsData || [],
        bomsData: bomsData || []
      });

      showToast('تم تصدير الشيت الشامل لكافة الوصفات والمقادير إلى Excel بنجاح ✅', 'success');
    } catch (err) {
      console.error(err);
      showToast('فشل تصدير الشيت الشامل: ' + err.message, 'error');
    } finally {
      setExportingMaster(false);
    }
  };

  // --- Work Center Modal Component ---
  const WorkCenterModal = ({ isOpen, onClose, wc, onSave }: { isOpen: boolean; onClose: () => void; wc: WorkCenter | null; onSave: (wc: WorkCenter) => void }) => {
    const [name, setName] = useState(wc?.name || '');
    const [description, setDescription] = useState(wc?.description || '');
    const [hourlyRate, setHourlyRate] = useState(wc?.hourly_rate || 0);
    const [overheadRate, setOverheadRate] = useState(wc?.overhead_rate || 0);

    useEffect(() => {
      if (wc) {
        setName(wc.name);
        setDescription(wc.description || '');
        setHourlyRate(wc.hourly_rate);
        setOverheadRate(wc.overhead_rate);
      } else {
        setName('');
        setDescription('');
        setHourlyRate(0);
        setOverheadRate(0);
      }
    }, [wc]);

    if (!isOpen) return null;

    return (
      <div className="fixed inset-0 bg-black/50 z-[100] flex items-center justify-center p-4 backdrop-blur-sm" dir="rtl">
        <div className="bg-white rounded-xl shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95">
          <div className="p-4 border-b flex justify-between items-center bg-slate-50">
            <h3 className="font-bold text-lg text-slate-800 flex items-center gap-2">
              <Factory className="text-blue-600" /> {wc ? 'تعديل مركز عمل' : 'إضافة مركز عمل جديد'}
            </h3>
            <button onClick={onClose} className="text-slate-400 hover:text-red-500"><X size={20} /></button>
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              onSave({ id: wc?.id || '', name, description, hourly_rate: hourlyRate, overhead_rate: overheadRate });
            }}
            className="p-6 space-y-4"
          >
            <div>
              <label className="block text-sm font-bold text-slate-700 mb-1">اسم مركز العمل</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full border rounded-lg p-2 focus:ring-2 focus:ring-blue-500 outline-none"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-bold text-slate-700 mb-1">الوصف</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full border rounded-lg p-2 focus:ring-2 focus:ring-blue-500 outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-bold text-slate-700 mb-1">تكلفة الساعة (عمالة)</label>
              <input
                type="number"
                value={hourlyRate}
                onChange={(e) => setHourlyRate(parseFloat(e.target.value))}
                className="w-full border rounded-lg p-2 focus:ring-2 focus:ring-blue-500 outline-none"
                min="0"
                step="0.01"
              />
            </div>
            <div>
              <label className="block text-sm font-bold text-slate-700 mb-1">تكلفة المصاريف غير المباشرة (لكل ساعة)</label>
              <input
                type="number"
                value={overheadRate}
                onChange={(e) => setOverheadRate(parseFloat(e.target.value))}
                className="w-full border rounded-lg p-2 focus:ring-2 focus:ring-blue-500 outline-none"
                min="0"
                step="0.01"
              />
            </div>
            <div className="flex justify-end gap-3 pt-4 border-t">
              <button
                type="submit"
                disabled={saving}
                className="bg-blue-600 text-white font-bold py-2 px-4 rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
              >
                {saving ? <Loader2 className="animate-spin" /> : <Save size={18} />}
                حفظ
              </button>
              <button type="button" onClick={onClose} className="bg-slate-100 text-slate-600 font-bold py-2 px-4 rounded-lg hover:bg-slate-200">
                إلغاء
              </button>
            </div>
          </form>
        </div>
      </div>
    );
  };

  return (
    <div className="p-6 bg-gray-50 min-h-screen" dir="rtl">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex justify-between items-center mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
              <Settings className="text-blue-600" />
              إعداد المسارات وقائمة المواد (BOM)
            </h1>
            <p className="text-gray-500 text-sm">تحديد مراحل الإنتاج والمواد الخام لكل منتج مصنع</p>
          </div>
          <div className="flex items-center gap-2.5 flex-wrap">
            <button
              type="button"
              onClick={() => setIsImportModalOpen(true)}
              className="bg-indigo-600 hover:bg-indigo-700 text-white px-3.5 py-2 rounded-lg font-bold flex items-center gap-2 shadow-sm transition-all text-sm"
              title="استيراد وتحديث المقادير من شيت Excel بعد مراجعتها واعتمادها"
            >
              <Upload size={17} />
              <span>استيراد وتحديث المقادير (Excel)</span>
            </button>
            <button
              type="button"
              onClick={handleExportMaster}
              disabled={exportingMaster || productOptions.length === 0}
              className="bg-emerald-600 hover:bg-emerald-700 text-white px-3.5 py-2 rounded-lg font-bold disabled:opacity-50 flex items-center gap-2 shadow-sm transition-all text-sm"
              title="تصدير شيت إكسيل شامل يحتوي على كافة المنتجات التامة والوسيطة ومقاديرها لمراجعتها مع مسؤول التصنيع"
            >
              {exportingMaster ? <Loader2 className="animate-spin" size={17} /> : <FileSpreadsheet size={17} />}
              <span>تصدير الشيت الشامل لكافة الوصفات (Excel)</span>
            </button>
            <button
              onClick={() => {
                setEditingWorkCenter(null);
                setIsWorkCenterModalOpen(true);
              }}
              className="bg-blue-600 text-white px-3.5 py-2 rounded-lg font-bold hover:bg-blue-700 flex items-center gap-2 shadow-sm transition-all text-sm"
            >
              <Plus size={17} /> إضافة مركز عمل
            </button>
          </div>
        </div>

        {/* Work Centers List */}
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
          <h2 className="font-bold text-lg text-gray-800 mb-4 flex items-center gap-2">
            <Factory size={20} className="text-blue-600" /> مراكز العمل
          </h2>
          {workCenters.length === 0 ? (
            <div className="text-center text-gray-500 py-4">لا توجد مراكز عمل معرفة بعد.</div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {workCenters.map(wc => (
                <div key={wc.id} className="bg-slate-50 p-4 rounded-lg border border-slate-200 flex justify-between items-center">
                  <div>
                    <p className="font-bold text-gray-800">{wc.name}</p>
                    <p className="text-xs text-gray-500">تكلفة/ساعة: {wc.hourly_rate} | مصاريف غير مباشرة: {wc.overhead_rate}</p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => {
                        setEditingWorkCenter(wc);
                        setIsWorkCenterModalOpen(true);
                      }}
                      className="text-blue-600 hover:text-blue-800"
                    >
                      <Edit size={16} />
                    </button>
                    <button
                      onClick={() => handleDeleteWorkCenter(wc.id)}
                      className="text-red-600 hover:text-red-800"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Product Selection */}
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 space-y-4">
          <h2 className="font-bold text-lg text-gray-800 flex items-center gap-2">
            <Package size={20} className="text-blue-600" /> اختيار المنتج لمراجعة مراحل التصنيع وقائمة المواد (BOM)
          </h2>

          {/* Quick Click Badges / Shortcuts */}
          <div className="space-y-3 p-4 bg-slate-50/80 rounded-xl border border-slate-200">
            <div>
              <span className="text-xs font-black text-amber-800 bg-amber-100 px-2.5 py-1 rounded-md mb-2 inline-block">
                🍰 المنتجات الوسيطة ونصف المصنعة (اضغط للمراجعة الفورية للمسار والمكونات):
              </span>
              <div className="flex flex-wrap gap-2 mt-1">
                {productOptions.filter((p: any) => p.isIntermediate).length === 0 ? (
                  <p className="text-xs text-slate-400 italic py-1">
                    لا توجد منتجات وسيطة مضافة حالياً. (تظهر الأصناف هنا فقط عند تحديد نوعها كـ "منتج وسيط / نصف مصنع" في كارت الصنف).
                  </p>
                ) : (
                  productOptions.filter((p: any) => p.isIntermediate).map(p => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => setSelectedProductId(p.id)}
                      className={`text-xs px-3 py-1.5 rounded-lg font-bold transition-all border ${
                        selectedProductId === p.id 
                          ? 'bg-amber-600 text-white border-amber-700 shadow-sm ring-2 ring-amber-300' 
                          : 'bg-white text-slate-700 border-slate-200 hover:bg-amber-50 hover:border-amber-300'
                      }`}
                    >
                      {p.name.replace('🍰 [منتج وسيط] ', '')}
                    </button>
                  ))
                )}
              </div>
            </div>

            <div>
              <span className="text-xs font-black text-purple-800 bg-purple-100 px-2.5 py-1 rounded-md mb-2 inline-block">
                🎂 المنتجات النهائية التامة (اضغط للمراجعة الفورية للمسار والمكونات):
              </span>
              <div className="flex flex-wrap gap-2 mt-1">
                {productOptions.filter((p: any) => !p.isIntermediate).length === 0 ? (
                  <p className="text-xs text-slate-400 italic py-1">لا توجد منتجات تامة مسجلة حالياً.</p>
                ) : (
                  productOptions.filter((p: any) => !p.isIntermediate).map(p => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => setSelectedProductId(p.id)}
                      className={`text-xs px-3 py-1.5 rounded-lg font-bold transition-all border ${
                        selectedProductId === p.id 
                          ? 'bg-purple-600 text-white border-purple-700 shadow-sm ring-2 ring-purple-300' 
                          : 'bg-white text-slate-700 border-slate-200 hover:bg-purple-50 hover:border-purple-300'
                      }`}
                    >
                      {p.name.replace('🎂 [منتج تام] ', '')}
                    </button>
                  ))
                )}
              </div>
            </div>
          </div>

          <SearchableSelect
            options={productOptions}
            value={selectedProductId || ''}
            onChange={setSelectedProductId}
            placeholder="أو ابحث بالاسم في قائمة المنتجات المصنعة والوسيطة..."
            className="w-full"
          />
        </div>

        {selectedProductId && (
          <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
            <div className="flex justify-between items-center mb-4 flex-wrap gap-2">
              <h2 className="font-bold text-lg text-gray-800 flex items-center gap-2">
                <Layers size={20} className="text-purple-600" /> مسار الإنتاج وقائمة المواد لـ{' '}
                {productOptions.find(p => p.id === selectedProductId)?.name}
              </h2>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleExportSingle}
                  disabled={exportingSingle}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white px-3.5 py-1.5 rounded-lg text-sm font-bold disabled:opacity-50 flex items-center gap-1.5 shadow-sm transition-all"
                  title="تصدير بطاقة مراجعة معتمدة ومفصلة لهذا الصنف (تام أو وسيط) لمراجعتها وتوقيعها مع مسؤول التصنيع"
                >
                  {exportingSingle ? <Loader2 className="animate-spin" size={16} /> : <FileSpreadsheet size={16} />}
                  <span>تصدير مقادير هذا الصنف (Excel)</span>
                </button>
                {!currentRouting && (
                  <button
                    onClick={handleCreateRouting}
                    disabled={saving}
                    className="bg-blue-600 text-white px-4 py-2 rounded-lg font-bold hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
                  >
                    {saving ? <Loader2 className="animate-spin" /> : <Plus size={18} />}
                    إنشاء مسار جديد
                  </button>
                )}
              </div>
            </div>

            {loading ? (
              <div className="p-20 text-center"><Loader2 className="animate-spin mx-auto text-blue-600" size={40} /></div>
            ) : !currentRouting ? (
              <div className="text-center text-gray-500 py-4">
                لا يوجد مسار إنتاج معرف لهذا المنتج. الرجاء إنشاء واحد.
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex items-center gap-2 text-sm text-gray-600">
                  <Star size={16} className="text-amber-500" />
                  <span className="font-bold">المسار الافتراضي:</span> {currentRouting.name}
                  <button
                    onClick={() => handleSetDefaultRouting(currentRouting.id)}
                    className="text-blue-600 hover:underline text-xs mr-2"
                  >
                    (تعيين كافتراضي)
                  </button>
                </div>

                <button
                  onClick={handleAddStep}
                  disabled={saving}
                  className="bg-blue-500 text-white px-4 py-2 rounded-lg font-bold hover:bg-blue-600 disabled:opacity-50 flex items-center gap-2"
                >
                  <Plus size={18} /> إضافة مرحلة إنتاجية
                </button>

                {routingSteps.length === 0 ? (
                  <div className="text-center text-gray-500 py-4">لا توجد مراحل معرفة لهذا المسار.</div>
                ) : (
                  <div className="space-y-4">
                    {routingSteps.map(step => (
                      <div key={step.id} className="bg-slate-50 p-4 rounded-lg border border-slate-200">
                        <div className="flex justify-between items-center">
                          <div className="flex items-center gap-2">
                            <GripVertical size={18} className="text-gray-400 cursor-grab" />
                            <input
                              type="text"
                              value={step.operation_name}
                              onChange={e => handleUpdateStep(step.id, { operation_name: e.target.value })}
                              className="font-bold text-lg text-gray-800 bg-transparent border-b border-transparent focus:border-blue-500 outline-none"
                            />
                          </div>
                          <div className="flex gap-2">
                            <button onClick={() => setOpenStepId(openStepId === step.id ? null : step.id)} className="text-gray-600 hover:text-blue-600">
                              {openStepId === step.id ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
                            </button>
                            <button onClick={() => handleDeleteStep(step.id)} className="text-red-600 hover:text-red-800">
                              <Trash2 size={18} />
                            </button>
                          </div>
                        </div>

                        {openStepId === step.id && (
                          <div className="mt-4 space-y-4 animate-in fade-in slide-in-from-top-2">
                            <div className="grid grid-cols-2 gap-4">
                              <div>
                                <label className="block text-sm font-bold text-gray-700 mb-1">مركز العمل</label>
                                <select
                                  value={step.work_center_id || ''}
                                  onChange={e => handleUpdateStep(step.id, { work_center_id: e.target.value })}
                                  className="w-full border rounded-lg p-2 focus:ring-2 focus:ring-blue-500 outline-none"
                                >
                                  <option value="">-- اختر مركز عمل --</option>
                                  {workCenters.map(wc => (
                                    <option key={wc.id} value={wc.id}>{wc.name}</option>
                                  ))}
                                </select>
                              </div>
                              <div>
                                <label className="block text-sm font-bold text-gray-700 mb-1">الوقت المعياري (دقائق)</label>
                                <input
                                  type="number"
                                  value={step.standard_time_minutes}
                                  onChange={e => handleUpdateStep(step.id, { standard_time_minutes: parseFloat(e.target.value) })}
                                  className="w-full border rounded-lg p-2 focus:ring-2 focus:ring-blue-500 outline-none"
                                  min="0"
                                  step="0.1"
                                />
                              </div>
                            </div>

                            {/* Step Materials (BOM) */}
                            <div className="border-t pt-4 mt-4">
                              <h3 className="font-bold text-md text-gray-800 mb-3 flex items-center gap-2">
                                <Package size={18} className="text-blue-600" /> المواد الخام المطلوبة
                              </h3>
                              {step.materials && step.materials.length > 0 ? (
                                <table className="w-full text-right text-sm">
                                  <thead>
                                    <tr className="bg-gray-50 text-gray-500 text-xs uppercase">
                                      <th className="p-2">المادة الخام / المكون</th>
                                      <th className="p-2 text-center">الكمية بالمخزن</th>
                                      <th className="p-2 text-center">الوحدة</th>
                                      <th className="p-2 text-center">تكلفة المكون</th>
                                      <th className="p-2 text-center">إجراءات</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {step.materials.map(mat => {
                                      const rawProd = (allProducts as any[])?.find(p => p.id === mat.raw_material_id);
                                      const unitCost = Number(rawProd?.cost || rawProd?.purchase_price || 0);
                                      const itemCost = Math.round(Number(mat.quantity_required || 0) * unitCost * 100) / 100;
                                      const baseUnit = mat.products?.unit || rawProd?.unit || 'وحدة';

                                      let helperNote = '';
                                      if (/كجم|كيلو|kg/i.test(baseUnit)) {
                                        const inGrams = Math.round(mat.quantity_required * 1000 * 10) / 10;
                                        helperNote = `(= ${inGrams} جرام)`;
                                      } else if (/لتر|liter/i.test(baseUnit)) {
                                        const inMl = Math.round(mat.quantity_required * 1000 * 10) / 10;
                                        helperNote = `(= ${inMl} مل)`;
                                      }

                                      return (
                                        <tr key={mat.id} className="border-b hover:bg-gray-50/80 transition-colors">
                                          <td className="p-2 font-bold text-slate-800">
                                            <div>{mat.products?.name || rawProd?.name}</div>
                                            {helperNote && (
                                              <span className="text-[11px] font-bold text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded">
                                                {helperNote}
                                              </span>
                                            )}
                                          </td>
                                          <td className="p-2 text-center">
                                            <input
                                              type="number"
                                              value={mat.quantity_required}
                                              onChange={e => handleUpdateMaterialQuantity(mat.id, step.id, parseFloat(e.target.value) || 0)}
                                              className="w-24 border rounded-lg p-1 text-center font-black text-slate-800 focus:ring-2 focus:ring-blue-500 outline-none"
                                              min="0.0001"
                                              step="0.0001"
                                            />
                                          </td>
                                          <td className="p-2 text-center text-gray-500 font-bold text-xs">{baseUnit}</td>
                                          <td className="p-2 text-center font-bold text-emerald-700 text-xs">{itemCost.toFixed(2)} ج.م</td>
                                          <td className="p-2 text-center">
                                            <button onClick={() => handleDeleteMaterial(mat.id, step.id)} className="text-red-500 hover:text-red-700 p-1.5 rounded-lg hover:bg-red-50 transition-colors" title="حذف المكون">
                                              <Trash2 size={16} />
                                            </button>
                                          </td>
                                        </tr>
                                      );
                                    })}
                                  </tbody>
                                </table>
                              ) : (
                                <div className="text-center text-gray-500 py-2">لا توجد مواد خام أو منتجات وسيطة معرفة لهذه المرحلة.</div>
                              )}

                              {/* إجمالي تكلفة خامات المرحلة */}
                              {step.materials && step.materials.length > 0 && (
                                <div className="p-2.5 bg-slate-100/80 rounded-xl text-xs font-bold text-slate-700 flex justify-between items-center mt-2 border border-slate-200/60">
                                  <span>إجمالي تكلفة خامات هذه المرحلة:</span>
                                  <span className="font-black text-emerald-700 text-sm">
                                    {step.materials.reduce((sum: number, m: any) => {
                                      const p = (allProducts as any[])?.find(x => x.id === m.raw_material_id);
                                      const c = Number(p?.cost || p?.purchase_price || 0);
                                      return sum + (Number(m.quantity_required || 0) * c);
                                    }, 0).toFixed(2)} ج.م
                                  </span>
                                </div>
                              )}

                              {/* نموذج إضافة خامة ذكي بمحول الوحدات الفوري وحاسبة التعبئة */}
                              <div className="bg-slate-50 border border-slate-200/90 rounded-2xl p-3.5 mt-4 space-y-2.5">
                                <div className="flex items-center justify-between">
                                  <span className="text-xs font-black text-slate-800 flex items-center gap-1.5">
                                    <Plus size={15} className="text-blue-600" /> إضافة مقدار مادة خام أو منتج وسيط لهذه المرحلة:
                                  </span>
                                  {selectedRawProduct && (
                                    <span className="text-[11px] font-bold text-indigo-700 bg-indigo-50 border border-indigo-200 px-2.5 py-0.5 rounded-lg">
                                      الوحدة المعتمدة بالمخزن: ({selectedRawProduct.unit || 'وحدة'})
                                    </span>
                                  )}
                                </div>

                                <div className="flex flex-wrap items-center gap-2">
                                  {/* اختيار الخامة */}
                                  <div className="flex-1 min-w-[220px]">
                                    <SearchableSelect
                                      options={rawMaterialOptions}
                                      value={selectedRawId}
                                      onChange={(val) => setSelectedRawId(val)}
                                      placeholder="اختر مادة خام أو منتج وسيط..."
                                    />
                                  </div>

                                  {/* إدخال المقدار بوحدة الشيف */}
                                  <div className="w-24">
                                    <input
                                      type="number"
                                      value={ingredientEnteredQty}
                                      onChange={e => setIngredientEnteredQty(parseFloat(e.target.value) || 0)}
                                      placeholder="المقدار"
                                      className="w-full border border-slate-200 rounded-xl p-2 text-center font-black text-slate-800 focus:ring-2 focus:ring-blue-500 outline-none bg-white text-sm"
                                      min="0.0001"
                                      step="any"
                                    />
                                  </div>

                                  {/* قائمة الوحدات المنسدلة الذكية */}
                                  <div className="w-52">
                                    <select
                                      value={ingredientSelectedUnit}
                                      onChange={e => {
                                        const u = rawAvailableUnits.find(opt => opt.unitName === e.target.value);
                                        if (u) {
                                          setIngredientSelectedUnit(u.unitName);
                                          setIngredientUnitRatio(u.ratio);
                                        }
                                      }}
                                      disabled={!selectedRawProduct}
                                      className="w-full border border-slate-200 rounded-xl p-2 text-xs font-bold bg-white focus:ring-2 focus:ring-blue-500 outline-none text-slate-800 disabled:bg-slate-100"
                                    >
                                      {rawAvailableUnits.map((u, i) => (
                                        <option key={i} value={u.unitName}>{u.label}</option>
                                      ))}
                                    </select>
                                  </div>

                                  {/* زر حاسبة العبوات السريعة */}
                                  <button
                                    type="button"
                                    onClick={() => handleOpenRecipePackagingModal(step.id)}
                                    disabled={!selectedRawProduct}
                                    className="p-2.5 rounded-xl border border-slate-200 bg-white hover:bg-indigo-50 text-indigo-600 disabled:opacity-40 transition-colors shadow-xs"
                                    title="حاسبة العبوات والأظرف والتجزئة السريعة"
                                  >
                                    <Calculator size={18} />
                                  </button>

                                  {/* زر الإضافة */}
                                  <button
                                    type="button"
                                    onClick={() => handleAddMaterialToStep(
                                      step.id,
                                      selectedRawId,
                                      calculatedIngredientBaseQty,
                                      ingredientSelectedUnit,
                                      ingredientEnteredQty
                                    )}
                                    disabled={!selectedRawId || calculatedIngredientBaseQty <= 0 || saving}
                                    className="bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 text-white px-5 py-2.5 rounded-xl font-bold disabled:opacity-50 flex items-center gap-1.5 shadow-sm transition-all"
                                  >
                                    <Plus size={18} /> إضافة للمرحلة
                                  </button>
                                </div>

                                {/* شريط المعاينة الحية الفورية للمقدار والتكلفة */}
                                {selectedRawProduct && (
                                  <div className="flex flex-wrap items-center justify-between gap-2 p-2.5 bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-xl text-xs font-bold animate-in fade-in">
                                    <div className="flex items-center gap-1.5 text-blue-900">
                                      <Sparkles size={14} className="text-indigo-600 shrink-0" />
                                      <span>المقدار بالوصفة:</span>
                                      <span className="text-indigo-700 font-black">{ingredientEnteredQty} {ingredientSelectedUnit}</span>
                                      <span className="text-slate-400">⬅️</span>
                                      <span>المعادل بالمخزن:</span>
                                      <span className="bg-white px-2 py-0.5 rounded-lg text-emerald-800 font-black border border-emerald-200">
                                        {calculatedIngredientBaseQty} {selectedRawProduct.unit || 'وحدة'}
                                      </span>
                                    </div>
                                    <div className="flex items-center gap-1 text-slate-700">
                                      <DollarSign size={13} className="text-emerald-600" />
                                      <span>تكلفة المقدار:</span>
                                      <span className="text-slate-900 font-black">{estimatedIngredientCost.toFixed(2)} ج.م</span>
                                    </div>
                                  </div>
                                )}
                              </div>
                            </div>

                            {/* Technical Attachments */}
                            <div className="border-t pt-4 mt-4">
                              <h3 className="font-bold text-md text-gray-800 mb-3 flex items-center gap-2">
                                <Paperclip size={18} className="text-blue-600" /> المرفقات الفنية والدلائل
                              </h3>
                              
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
                                {step.attachments?.map(att => (
                                  <div key={att.id} className="flex items-center justify-between p-3 bg-white border rounded-lg shadow-sm">
                                    <div className="flex items-center gap-2 overflow-hidden">
                                      <Paperclip size={14} className="text-slate-400 shrink-0" />
                                      <span className="text-xs font-medium truncate" title={att.file_name}>{att.file_name}</span>
                                    </div>
                                    <div className="flex items-center gap-1 shrink-0">
                                      <a href={att.file_url} target="_blank" rel="noopener noreferrer" className="p-1 text-blue-600 hover:bg-blue-50 rounded">
                                        <Download size={14} />
                                      </a>
                                      <button onClick={() => handleDeleteAttachment(att.id)} className="p-1 text-red-600 hover:bg-red-50 rounded">
                                        <Trash2 size={14} />
                                      </button>
                                    </div>
                                  </div>
                                ))}
                              </div>

                              <div className="relative">
                                <input
                                  type="file"
                                  id={`file-upload-${step.id}`}
                                  className="hidden"
                                  onChange={(e) => handleUploadAttachment(step.id, e)}
                                  disabled={saving}
                                />
                                <label htmlFor={`file-upload-${step.id}`} className="cursor-pointer inline-flex items-center gap-2 px-4 py-2 bg-slate-100 text-slate-700 rounded-lg text-sm font-bold hover:bg-slate-200 transition-colors border border-slate-200">
                                  {saving ? <Loader2 className="animate-spin" size={16} /> : <Plus size={16} />}
                                  رفع ملف (PDF, DWG, صورة)
                                </label>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      <WorkCenterModal
        isOpen={isWorkCenterModalOpen}
        onClose={() => setIsWorkCenterModalOpen(false)}
        wc={editingWorkCenter}
        onSave={handleSaveWorkCenter}
      />

      <BOMImportModal
        isOpen={isImportModalOpen}
        onClose={() => setIsImportModalOpen(false)}
        orgId={orgId || ''}
        allProducts={allProducts as any[]}
        onSuccess={() => {
          if (selectedProductId) {
            fetchRoutingData(selectedProductId);
          }
        }}
      />

      {/* 🧮 نافذة حاسبة عبوات وتجزئة الوصفة السريعة */}
      {isRecipeCalcModalOpen && selectedRawProduct && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 max-w-lg w-full overflow-hidden space-y-0">
            {/* Header */}
            <div className="p-5 bg-gradient-to-r from-indigo-600 via-blue-600 to-purple-700 text-white flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-white/10 rounded-xl">
                  <Calculator size={22} />
                </div>
                <div>
                  <h3 className="font-black text-base">حاسبة تعبئة وتجزئة خامات الوصفة</h3>
                  <p className="text-xs text-blue-100">
                    الخامة: <strong className="text-white">{selectedRawProduct.name}</strong> | وحدة المخزن: ({selectedRawProduct.unit || 'وحدة'})
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsRecipeCalcModalOpen(false)}
                className="p-1.5 rounded-full hover:bg-white/20 text-white transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            {/* Body */}
            <div className="p-6 space-y-4 max-h-[80vh] overflow-y-auto">
              <div className="bg-blue-50/70 p-3 rounded-xl border border-blue-100 text-xs text-blue-900 leading-relaxed">
                حدد مستويات تعبئة هذه المادة الخام مرة واحدة، وسيقوم النظام بحفظها في بطاقة الصنف وحساب أي مقدار بالوصفة تلقائياً:
              </div>

              {/* المستوى 1: الطرد الأكبر */}
              <div className="bg-slate-50 p-3 rounded-xl border border-slate-200/80 space-y-2">
                <span className="text-xs font-black text-slate-800 flex items-center gap-1.5">
                  <Box size={14} className="text-indigo-600" />
                  المستوى 1: الطرد الأكبر (وحدة التوريد)
                </span>
                <input
                  type="text"
                  value={recipeCalcBulkName}
                  onChange={e => setRecipeCalcBulkName(e.target.value)}
                  placeholder="مثلاً: كرتونة"
                  className="w-full border border-slate-200 rounded-xl p-2 text-xs font-bold bg-white outline-none focus:border-indigo-500"
                />
              </div>

              {/* المستوى 2: العبوة الوسيطة */}
              <div className="bg-slate-50 p-3 rounded-xl border border-slate-200/80 space-y-2">
                <span className="text-xs font-black text-slate-800 flex items-center gap-1.5">
                  <Layers size={14} className="text-indigo-600" />
                  المستوى 2: العبوة الوسيطة (العلب/البواكي الداخلية)
                </span>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 mb-1">اسم العبوة</label>
                    <input
                      type="text"
                      value={recipeCalcMedName}
                      onChange={e => setRecipeCalcMedName(e.target.value)}
                      placeholder="مثلاً: علبة أو باكت"
                      className="w-full border border-slate-200 rounded-xl p-2 text-xs font-bold bg-white outline-none focus:border-indigo-500"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 mb-1">كم {recipeCalcMedName || 'عبوة'} بالطرد؟</label>
                    <input
                      type="number"
                      min="1"
                      value={recipeCalcMedUnitsPerBulk}
                      onChange={e => setRecipeCalcMedUnitsPerBulk(parseInt(e.target.value) || 1)}
                      className="w-full border border-slate-200 rounded-xl p-2 text-xs font-black text-center bg-white outline-none focus:border-indigo-500"
                    />
                  </div>
                </div>
              </div>

              {/* المستوى 3: وحدة التجزئة الصغرى */}
              <div className="bg-slate-50 p-3 rounded-xl border border-slate-200/80 space-y-2">
                <span className="text-xs font-black text-slate-800 flex items-center gap-1.5">
                  <CornerDownLeft size={14} className="text-indigo-600" />
                  المستوى 3: وحدة التجزئة والصرف الصغرى
                </span>
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 mb-1">اسم الوحدة الصغرى</label>
                    <input
                      type="text"
                      value={recipeCalcSmallName}
                      onChange={e => setRecipeCalcSmallName(e.target.value)}
                      placeholder="مثلاً: ظرف أو كيس"
                      className="w-full border border-slate-200 rounded-xl p-2 text-xs font-bold bg-white outline-none focus:border-indigo-500"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 mb-1">العدد بالـ {recipeCalcMedName || 'عبوة'}</label>
                    <input
                      type="number"
                      min="1"
                      value={recipeCalcSmallUnitsPerMed}
                      onChange={e => setRecipeCalcSmallUnitsPerMed(parseInt(e.target.value) || 1)}
                      className="w-full border border-slate-200 rounded-xl p-2 text-xs font-black text-center bg-white outline-none focus:border-indigo-500"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 mb-1">سعة الوحدة ({selectedRawProduct.unit || 'وحدة'})</label>
                    <input
                      type="number"
                      min="0.0001"
                      step="any"
                      value={recipeCalcBaseQtyPerSmall}
                      onChange={e => setRecipeCalcBaseQtyPerSmall(parseFloat(e.target.value) || 1)}
                      className="w-full border border-slate-200 rounded-xl p-2 text-xs font-black text-center bg-white outline-none focus:border-indigo-500"
                    />
                  </div>
                </div>
              </div>

              {/* المعاينة الحية */}
              <div className="p-3 bg-gradient-to-br from-indigo-50 to-purple-50 border border-indigo-200 rounded-xl text-xs space-y-1 font-bold text-slate-800">
                <span className="text-indigo-900 font-black flex items-center gap-1">
                  <Sparkles size={13} className="text-indigo-600" /> ملخص شجرة التعبئة للصنف:
                </span>
                <div>
                  📦 1 {recipeCalcBulkName} = {recipeCalcMedUnitsPerBulk} {recipeCalcMedName} = {recipeCalcMedUnitsPerBulk * recipeCalcSmallUnitsPerMed} {recipeCalcSmallName}
                </div>
                <div className="text-purple-700">
                  🔹 1 {recipeCalcMedName} = {recipeCalcSmallUnitsPerMed} {recipeCalcSmallName}
                </div>
              </div>

              {/* المقدار المطلوب بالوصفة */}
              <div className="p-3.5 bg-slate-100/90 rounded-2xl space-y-2 border border-slate-200">
                <label className="block text-xs font-black text-slate-800">المقدار المطلوب وضعه في هذه المرحلة:</label>
                <div className="flex items-center gap-2">
                  <div className="grid grid-cols-3 gap-1.5 flex-1 text-xs font-bold">
                    <button
                      type="button"
                      onClick={() => setRecipeCalcTargetTier('small')}
                      className={`p-2 rounded-xl border text-center transition-all ${
                        recipeCalcTargetTier === 'small' ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm' : 'bg-white text-slate-700 border-slate-200'
                      }`}
                    >
                      {recipeCalcSmallName || 'ظرف'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setRecipeCalcTargetTier('medium')}
                      className={`p-2 rounded-xl border text-center transition-all ${
                        recipeCalcTargetTier === 'medium' ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm' : 'bg-white text-slate-700 border-slate-200'
                      }`}
                    >
                      {recipeCalcMedName || 'علبة'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setRecipeCalcTargetTier('bulk')}
                      className={`p-2 rounded-xl border text-center transition-all ${
                        recipeCalcTargetTier === 'bulk' ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm' : 'bg-white text-slate-700 border-slate-200'
                      }`}
                    >
                      {recipeCalcBulkName || 'كرتونة'}
                    </button>
                  </div>
                  <input
                    type="number"
                    min="0.001"
                    step="any"
                    value={recipeCalcWithdrawalQty}
                    onChange={e => setRecipeCalcWithdrawalQty(parseFloat(e.target.value) || 0)}
                    placeholder="العدد"
                    className="w-20 border border-slate-200 rounded-xl p-2 text-center text-sm font-black bg-white outline-none focus:border-indigo-500"
                  />
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="p-4 bg-slate-50 border-t border-slate-200 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setIsRecipeCalcModalOpen(false)}
                className="px-4 py-2.5 rounded-xl text-slate-600 font-bold hover:bg-slate-200 text-xs transition-colors"
              >
                إلغاء
              </button>
              <button
                type="button"
                onClick={handleApplyRecipePackaging}
                className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl text-xs shadow-md transition-all flex items-center gap-1.5"
              >
                <Check size={16} /> تطبيق على المقادير
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default RoutingBOMManager;
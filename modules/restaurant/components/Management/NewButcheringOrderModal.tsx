import React, { useState, useEffect, useMemo } from 'react';
import {
  ButcheringTemplate,
  ButcheringOrder,
  ButcheringOrderItem,
  butcheringYieldService,
  DEFAULT_BUTCHERING_TEMPLATES,
  isValidUUID
} from '../../../../services/butcheringYieldService';
import { supabase } from '../../../../supabaseClient';
import { useAccounting } from '../../../../context/AccountingContext';
import { useToast } from '../../../../context/ToastContext';
import {
  X,
  Plus,
  Trash2,
  Save,
  Scale,
  Sparkles,
  AlertTriangle,
  CheckCircle2,
  Layers,
  DollarSign,
  Warehouse,
  ChefHat,
  Info,
  ArrowRight,
  TrendingDown,
  Calculator
} from 'lucide-react';

interface NewButcheringOrderModalProps {
  isOpen: boolean;
  onClose: () => void;
  templates: ButcheringTemplate[];
  onOrderCreated: () => void;
}

export const NewButcheringOrderModal: React.FC<NewButcheringOrderModalProps> = ({
  isOpen,
  onClose,
  templates,
  onOrderCreated
}) => {
  const {
    products,
    warehouses,
    accounts,
    currentUser,
    currentSelectedOrgId,
    organization,
    getSystemAccount,
    recalculateStock,
    refreshData
  } = useAccounting();
  const { showToast } = useToast();

  // 1. البيانات العامة للأمر
  const [orderNumber, setOrderNumber] = useState(`BUT-${Date.now().toString().slice(-6)}`);
  const [orderDate, setOrderDate] = useState(new Date().toISOString().split('T')[0]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('');
  const [sourceProductId, setSourceProductId] = useState<string>('');
  const [warehouseId, setWarehouseId] = useState<string>('');
  const [destinationWarehouseId, setDestinationWarehouseId] = useState<string>('');
  const [butcherName, setButcherName] = useState<string>('');
  const [notes, setNotes] = useState<string>('');

  // 2. مدخلات الوزن والتكلفة
  const [inputWeight, setInputWeight] = useState<number>(15); // القيمة الافتراضية 15 كجم
  const [inputCostPerKg, setInputCostPerKg] = useState<number>(200); // ج/كجم
  const [additionalLaborCost, setAdditionalLaborCost] = useState<number>(0); // مصاريف جزارة
  const [additionalOverheadCost, setAdditionalOverheadCost] = useState<number>(0); // مصاريف نقل وتبريد
  const [costMethod, setCostMethod] = useState<'relative_value' | 'by_product_deduction' | 'weight_equal'>('relative_value');

  // 3. بنود المخرجات والأوزان الفعلية
  const [outputItems, setOutputItems] = useState<
    Array<{
      output_product_id: string | null;
      output_name: string;
      actual_weight: number;
      relative_value_weight: number;
      is_by_product: boolean;
      standard_unit_price: number;
      expected_pct: number;
    }>
  >([]);

  // 4. إعدادات المحاسبة
  const [autoPostAccounting, setAutoPostAccounting] = useState<boolean>(true);
  const [rawMaterialAccountId, setRawMaterialAccountId] = useState<string>('');
  const [finishedGoodsAccountId, setFinishedGoodsAccountId] = useState<string>('');
  const [laborPayableAccountId, setLaborPayableAccountId] = useState<string>('');

  const [submitting, setSubmitting] = useState(false);
  const [isAutoFetchedFromStock, setIsAutoFetchedFromStock] = useState<boolean>(false);
  const [isPriceAutoFetched, setIsPriceAutoFetched] = useState<boolean>(false);

  // حساب الرصيد المتوفر للصنف الخام في المستودع المحدد
  const selectedProductStock = useMemo(() => {
    if (!sourceProductId) return null;
    const prod = products.find(p => p.id === sourceProductId);
    if (!prod) return null;
    const totalStock = Number(prod.stock || 0);
    const whStock =
      warehouseId && prod.warehouse_stock
        ? Number(prod.warehouse_stock[warehouseId] ?? prod.stock ?? 0)
        : totalStock;
    return {
      name: prod.name,
      unit: prod.unit || 'كجم',
      totalStock,
      whStock
    };
  }, [sourceProductId, warehouseId, products]);

  // دالة تغيير الوزن المدخل مع إعادة احتساب أوزان القطعيات الناتجة تلقائياً
  const handleInputWeightChange = (newWeight: number, isAuto: boolean = false) => {
    setInputWeight(newWeight);
    setIsAutoFetchedFromStock(isAuto);
    if (newWeight > 0) {
      setOutputItems(prev =>
        prev.map(it => {
          if (it.expected_pct && it.expected_pct > 0) {
            const scaled = Number(((newWeight * it.expected_pct) / 100).toFixed(2));
            return { ...it, actual_weight: scaled };
          }
          return it;
        })
      );
    }
  };

  // دالة إعادة ضبط الأوزان يدوياً وفق نسب القالب المعياري
  const handleRecalculateWeights = (targetWeight?: number) => {
    const weightToUse = targetWeight !== undefined ? targetWeight : inputWeight;
    if (weightToUse <= 0) return;
    setOutputItems(prev =>
      prev.map(it => {
        if (it.expected_pct && it.expected_pct > 0) {
          const scaled = Number(((weightToUse * it.expected_pct) / 100).toFixed(2));
          return { ...it, actual_weight: scaled };
        }
        return it;
      })
    );
    showToast(`تمت إعادة احتساب الأوزان وفق نسب القالب المعياري (${weightToUse} كجم) ✅`, 'info');
  };

  // إعداد المستودعات الافتراضية
  useEffect(() => {
    if (warehouses.length > 0) {
      if (!warehouseId) setWarehouseId(warehouses[0].id);
      const kitchenWh = warehouses.find(w => w.name.includes('مطبخ') || w.name.includes('Kitchen') || w.name.includes('تجهيز'));
      if (kitchenWh) {
        setDestinationWarehouseId(kitchenWh.id);
      } else {
        setDestinationWarehouseId(warehouses[0].id);
      }
    }
  }, [warehouses]);

  // إعداد الحسابات المالية الافتراضية للقيود بنظام البحث الذكي المتعدد (Smart Account Discovery)
  useEffect(() => {
    if (accounts.length > 0) {
      // 1. مخزون خامات / ذبائح خام
      const rawAcc =
        (getSystemAccount && getSystemAccount('INVENTORY_RAW_MATERIALS')) ||
        (getSystemAccount && getSystemAccount('INVENTORY')) ||
        accounts.find(a =>
          a.code === '10301' || a.code === '1104' || a.code === '103' || a.code === '121' || a.code === '122' ||
          a.name?.includes('خام') || a.name?.includes('لحوم') || a.name?.includes('دواجن') || a.name?.includes('مخزون')
        );
      if (rawAcc && !rawMaterialAccountId) setRawMaterialAccountId(rawAcc.id);

      // 2. مخزون منتجات تامة / مجهزة
      const finAcc =
        (getSystemAccount && getSystemAccount('INVENTORY_FINISHED_GOODS')) ||
        (getSystemAccount && getSystemAccount('INVENTORY')) ||
        accounts.find(a =>
          a.code === '10302' || a.code === '1105' || a.code === '1213' ||
          a.name?.includes('تام') || a.name?.includes('مطبخ') || a.name?.includes('مجهز') || a.name?.includes('جاهز') ||
          (a.name?.includes('مخزون') && a.id !== rawAcc?.id)
        );
      if (finAcc && !finishedGoodsAccountId) setFinishedGoodsAccountId(finAcc.id || rawAcc?.id || '');

      // 3. حساب أجور أو جزارة ومصروفات تشغيل
      const labAcc =
        (getSystemAccount && getSystemAccount('WAGES_EXPENSE')) ||
        (getSystemAccount && getSystemAccount('OPERATING_EXPENSE')) ||
        accounts.find(a =>
          a.code?.startsWith('5') || a.name?.includes('أجور') || a.name?.includes('تشغيل') || a.name?.includes('جزارة') || a.name?.includes('مصروفات')
        );
      if (labAcc && !laborPayableAccountId) setLaborPayableAccountId(labAcc.id);
    }
  }, [accounts, getSystemAccount]);

  // دالة جلب سعر شراء الكيلو آلياً (من بطاقة الصنف أو من أحدث فاتورة مشتريات)
  const fetchProductCost = async (productId: string, prodObj?: any) => {
    const prod = prodObj || products.find(p => p.id === productId);
    let resolvedPrice = Number(prod?.purchase_price || prod?.cost || 0);

    // إذا لم يكن سعر الشراء مسجلاً في بطاقة الصنف، نبحث في آخر فاتورة مشتريات مرحلة في النظام
    if (resolvedPrice <= 0) {
      try {
        const { data: lastInvoiceItem } = await supabase
          .from('purchase_invoice_items')
          .select('unit_price')
          .eq('product_id', productId)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (lastInvoiceItem && Number(lastInvoiceItem.unit_price) > 0) {
          resolvedPrice = Number(lastInvoiceItem.unit_price);
        }
      } catch (err) {
        console.warn('Notice fetching latest purchase invoice price:', err);
      }
    }

    if (resolvedPrice > 0) {
      setInputCostPerKg(resolvedPrice);
      setIsPriceAutoFetched(true);
    } else {
      setIsPriceAutoFetched(false);
    }
  };

  // عند اختيار صنف الذبيحة أو تغيير المخزن -> جلب تكلفة الكيلو ورصيده المتاح آلياً وضبط الوزن الإجمالي
  useEffect(() => {
    if (sourceProductId && products.length > 0) {
      const prod = products.find(p => p.id === sourceProductId);
      if (prod) {
        // 1. جلب سعر الكيلو الخام آلياً
        fetchProductCost(sourceProductId, prod);

        // 2. جلب الرصيد المتوفر في هذا المخزن آلياً وتطبيقه مباشرة على الوزن المدخل (لأي كمية كانت مثل 350 كجم لعجل أو 15 كجم لدواجن)
        const availableInWh =
          warehouseId && prod.warehouse_stock
            ? Number(prod.warehouse_stock[warehouseId] ?? prod.stock ?? 0)
            : Number(prod.stock || 0);

        if (availableInWh > 0) {
          handleInputWeightChange(availableInWh, true);
        }
      }
    }
  }, [sourceProductId, warehouseId, products]);

  // عند اختيار قالب تشفية -> تعبئة بنود القطعيات تلقائياً بالاعتماد على رصيد المخزن الفعلي
  const handleApplyTemplate = (template: ButcheringTemplate) => {
    setSelectedTemplateId(template.id || template.name);
    setCostMethod(template.cost_allocation_method || 'relative_value');

    // أولوية الوزن: رصيد المخزن المتاح أولاً، ثم الوزن المدخل الحالي
    let targetWeight = inputWeight;
    if (selectedProductStock && selectedProductStock.whStock > 0) {
      targetWeight = selectedProductStock.whStock;
      setInputWeight(targetWeight);
      setIsAutoFetchedFromStock(true);
    } else if (template.category === 'poultry' && (targetWeight > 50 || targetWeight === 200)) {
      targetWeight = 15;
      setInputWeight(15);
    } else if (template.category === 'beef' && targetWeight < 100) {
      targetWeight = 350;
      setInputWeight(350);
    }

    if (template.items && template.items.length > 0) {
      const generated = template.items.map(it => {
        // البحث عن صنف مطابق في قاعدة البيانات
        const matchedProduct = products.find(
          p => p.name.toLowerCase().includes(it.output_name.toLowerCase()) || it.output_name.toLowerCase().includes(p.name.toLowerCase())
        );

        const initialWeight = Number(((targetWeight * it.expected_yield_pct) / 100).toFixed(2));

        return {
          output_product_id: matchedProduct?.id || null,
          output_name: it.output_name,
          actual_weight: initialWeight,
          relative_value_weight: it.relative_value_weight || 1.0,
          is_by_product: Boolean(it.is_by_product),
          standard_unit_price: it.standard_unit_price || 0,
          expected_pct: it.expected_yield_pct
        };
      });

      setOutputItems(generated);
    }
  };

  // تطبيق القالب الافتراضي الأول عند الفتح لأول مرة
  useEffect(() => {
    if (isOpen && outputItems.length === 0) {
      const availableTemplates = templates.length > 0 ? templates : DEFAULT_BUTCHERING_TEMPLATES;
      if (availableTemplates.length > 0) {
        handleApplyTemplate(availableTemplates[0]);
      }
    }
  }, [isOpen, templates]);

  // الحسابات المالية اللحظية
  const totalInputCost = useMemo(() => {
    return Number((inputWeight * inputCostPerKg).toFixed(2));
  }, [inputWeight, inputCostPerKg]);

  const totalNetCost = useMemo(() => {
    return Number((totalInputCost + Number(additionalLaborCost || 0) + Number(additionalOverheadCost || 0)).toFixed(2));
  }, [totalInputCost, additionalLaborCost, additionalOverheadCost]);

  // استدعاء محرك التكلفة اللحظي (Reactive Cost Calculation Engine)
  const calculationResult = useMemo(() => {
    return butcheringYieldService.calculateCostAllocation({
      total_net_cost: totalNetCost,
      input_weight: inputWeight,
      method: costMethod,
      items: outputItems.map(i => ({
        output_name: i.output_name,
        actual_weight: Number(i.actual_weight || 0),
        relative_value_weight: Number(i.relative_value_weight || 1.0),
        is_by_product: i.is_by_product,
        standard_unit_price: i.standard_unit_price
      }))
    });
  }, [totalNetCost, inputWeight, costMethod, outputItems]);

  if (!isOpen) return null;

  const handleAddItem = () => {
    setOutputItems(prev => [
      ...prev,
      {
        output_product_id: null,
        output_name: 'قطعية جديدة',
        actual_weight: 5,
        relative_value_weight: 1.0,
        is_by_product: false,
        standard_unit_price: 0,
        expected_pct: 0
      }
    ]);
  };

  const handleRemoveItem = (index: number) => {
    setOutputItems(prev => prev.filter((_, i) => i !== index));
  };

  const handleUpdateItem = (index: number, field: string, value: any) => {
    setOutputItems(prev => {
      const copy = [...prev];
      copy[index] = { ...copy[index], [field]: value };
      return copy;
    });
  };

  const handleSubmit = async () => {
    if (!sourceProductId) {
      showToast('يرجى اختيار صنف الذبيحة / الدواجن الخام المدخلة', 'warning');
      return;
    }
    if (inputWeight <= 0) {
      showToast('يرجى إدخال وزن صالح للذبيحة المدخلة', 'warning');
      return;
    }
    if (outputItems.length === 0) {
      showToast('يجب إضافة قطعيات ناتجة من التشفية', 'warning');
      return;
    }

    if (calculationResult.total_output_weight > inputWeight) {
      showToast(
        `خطأ في الحساب: مجموع أوزان القطعيات (${calculationResult.total_output_weight.toFixed(2)} كجم) يتجاوز وزن الخام المدخل (${inputWeight} كجم)! يرجى الضغط على زر "إعادة توزيع الأوزان" لتصحيحها.`,
        'error'
      );
      return;
    }

    // التحقق من ربط القطعيات ببطاقات الأصناف
    const linkedItems = outputItems.filter(it => Boolean(it.output_product_id));
    if (linkedItems.length === 0) {
      const confirmProceed = window.confirm(
        '⚠️ تنبيه: لم يتم ربط أي قطعية ناتجة ببطاقة صنف في المخزن!\n\n' +
        'لن تتأثر كميات المخزون إلا للقطعيات التي يتم تحديد صنفها المخزني في عمود "الربط ببطاقة الصنف".\n\n' +
        'هل تريد المتابعة وترحيل الأمر على أية حال؟'
      );
      if (!confirmProceed) return;
    }

    setSubmitting(true);
    try {
      const activeOrgId =
        currentSelectedOrgId ||
        currentUser?.organization_id ||
        organization?.id ||
        (currentUser as any)?.user_metadata?.org_id ||
        '';

      const orderPayload: ButcheringOrder = {
        order_number: orderNumber,
        template_id: isValidUUID(selectedTemplateId) ? selectedTemplateId : null,
        source_product_id: sourceProductId,
        warehouse_id: warehouseId || null,
        destination_warehouse_id: destinationWarehouseId || warehouseId || null,
        order_date: orderDate,
        input_weight: inputWeight,
        input_cost_per_kg: inputCostPerKg,
        total_input_cost: totalInputCost,
        additional_labor_cost: additionalLaborCost,
        additional_overhead_cost: additionalOverheadCost,
        total_net_cost: totalNetCost,
        total_output_weight: calculationResult.total_output_weight,
        shrinkage_weight: calculationResult.shrinkage_weight,
        shrinkage_pct: calculationResult.shrinkage_pct,
        useful_yield_pct: calculationResult.useful_yield_pct,
        cost_allocation_method: costMethod,
        status: 'completed',
        butcher_name: butcherName || 'الشيف المسؤول',
        notes: notes || ''
      };

      const itemsPayload: ButcheringOrderItem[] = outputItems.map((it, idx) => {
        const calculated = calculationResult.items[idx];
        const stdExpected = (inputWeight * it.expected_pct) / 100;
        const variance = Number((it.actual_weight - stdExpected).toFixed(3));

        return {
          output_product_id: it.output_product_id || null,
          output_name: it.output_name,
          actual_weight: it.actual_weight,
          yield_pct: calculated ? calculated.yield_pct : 0,
          relative_value_weight: it.relative_value_weight,
          allocated_cost_per_kg: calculated ? calculated.allocated_cost_per_kg : 0,
          total_allocated_cost: calculated ? calculated.total_allocated_cost : 0,
          is_by_product: it.is_by_product,
          standard_expected_weight: stdExpected,
          variance_weight: variance
        };
      });

      const res = await butcheringYieldService.createAndPostOrder({
        order: orderPayload,
        items: itemsPayload,
        organizationId: activeOrgId,
        userId: currentUser?.id,
        autoPostAccounting,
        rawMaterialAccountId,
        finishedGoodsAccountId,
        laborPayableAccountId
      });

      if (res.success) {
        // تحديث محرك المخزون ودفتر الأستاذ العام في الـ Context فوراً
        try {
          if (recalculateStock) await recalculateStock();
          if (refreshData) await refreshData();
        } catch (rErr) {
          console.warn('Recalculate or refresh data notice:', rErr);
        }

        const rawProdName = products.find(p => p.id === sourceProductId)?.name || 'الخام';
        let successMsg = `تم ترحيل جلسة التشفية: خصم (${inputWeight} كجم ${rawProdName}) وإضافة (${res.addedItemsCount || linkedItems.length}) صنف للمخزن ✅`;

        if (res.journalEntryId) {
          successMsg += ' وتم إنشاء قيد اليومية بنجاح.';
        } else if (res.journalError) {
          successMsg += ` (تنبيه القيد: ${res.journalError})`;
        }

        showToast(successMsg, res.journalError ? 'info' : 'success');
        onOrderCreated();
        onClose();
      } else {
        showToast('خطأ: ' + res.error, 'error');
      }
    } catch (err: any) {
      showToast('حدث خطأ أثناء حفظ أمر التشفية: ' + err.message, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const isExcessShrinkage = calculationResult.shrinkage_pct > 7.0;

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-3 md:p-6 overflow-y-auto animate-in fade-in">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-6xl overflow-hidden flex flex-col max-h-[95vh]">
        {/* Modal Top Header */}
        <div className="bg-gradient-to-r from-rose-700 via-rose-600 to-amber-600 px-6 py-4 text-white flex justify-between items-center">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-white/10 rounded-xl">
              <Scale className="w-6 h-6 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-xl font-bold">جلسة تشفية وتفكيك ذبائح جديدة</h3>
                <span className="bg-white/20 text-xs px-2.5 py-0.5 rounded-full font-mono font-bold">
                  {orderNumber}
                </span>
              </div>
              <p className="text-xs text-rose-100 mt-0.5">
                تفكيك الذبيحة إلى قطعيات مجهزة وتوزيع التكلفة واحتساب نسب الاستخراج والهدر
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-white/80 hover:text-white hover:bg-white/10 p-2 rounded-xl transition"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Modal Content Scrollable Area */}
        <div className="flex-1 p-6 overflow-y-auto space-y-6 bg-slate-50/50">
          {/* Section 1: Template and General Setup */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b pb-3">
              <span className="font-bold text-sm text-slate-800 flex items-center gap-2">
                <Layers className="w-4 h-4 text-rose-600" />
                الخطوة 1: اختيار القالب المعياري وتفاصيل الذبيحة المدخلة
              </span>
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-500 font-bold">تحميل قالب سريع:</span>
                <select
                  value={selectedTemplateId}
                  onChange={e => {
                    const tmpl = (templates.length > 0 ? templates : DEFAULT_BUTCHERING_TEMPLATES).find(
                      t => (t.id || t.name) === e.target.value
                    );
                    if (tmpl) handleApplyTemplate(tmpl);
                  }}
                  className="bg-rose-50 text-rose-800 text-xs font-bold px-3 py-1.5 rounded-lg border border-rose-200 outline-none"
                >
                  <option value="">-- اختر قالب التشفية --</option>
                  {(templates.length > 0 ? templates : DEFAULT_BUTCHERING_TEMPLATES).map(t => (
                    <option key={t.id || t.name} value={t.id || t.name}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  صنف الذبيحة / الدواجن الخام <span className="text-red-500">*</span>
                </label>
                <select
                  value={sourceProductId}
                  onChange={e => setSourceProductId(e.target.value)}
                  className="w-full border border-slate-300 rounded-lg p-2 text-xs font-semibold focus:ring-2 focus:ring-rose-500 outline-none"
                  required
                >
                  <option value="">-- اختر صنف اللحم الخام --</option>
                  {products
                    .filter(p => p.product_type === 'RAW_MATERIAL' || p.product_type === 'STOCK')
                    .map(p => (
                      <option key={p.id} value={p.id}>
                        {p.name} ({p.unit || 'كجم'})
                      </option>
                    ))}
                </select>
                {selectedProductStock && (
                  <div className="mt-1.5 flex items-center justify-between text-[11px] bg-slate-50 px-2 py-1 rounded-lg border border-slate-200">
                    <span className="text-slate-500 font-bold">الرصيد المتاح:</span>
                    <span className={`font-black ${
                      selectedProductStock.whStock > 0 ? 'text-emerald-700' : 'text-red-600'
                    }`}>
                      {selectedProductStock.whStock} {selectedProductStock.unit}
                    </span>
                  </div>
                )}
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  مخزن سحب الخام <span className="text-red-500">*</span>
                </label>
                <select
                  value={warehouseId}
                  onChange={e => setWarehouseId(e.target.value)}
                  className="w-full border border-slate-300 rounded-lg p-2 text-xs focus:ring-2 focus:ring-rose-500 outline-none"
                >
                  {warehouses.map(w => (
                    <option key={w.id} value={w.id}>
                      {w.name}
                    </option>
                  ))}
                </select>
                {selectedProductStock && warehouseId && (
                  <div className="mt-1.5 text-[11px] text-slate-500 font-medium">
                    رصيد المخزن: <span className="font-bold text-slate-800">{selectedProductStock.whStock} {selectedProductStock.unit}</span>
                  </div>
                )}
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  مخزن توريد القطعيات المشفاة
                </label>
                <select
                  value={destinationWarehouseId}
                  onChange={e => setDestinationWarehouseId(e.target.value)}
                  className="w-full border border-slate-300 rounded-lg p-2 text-xs focus:ring-2 focus:ring-rose-500 outline-none"
                >
                  {warehouses.map(w => (
                    <option key={w.id} value={w.id}>
                      {w.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">تاريخ الجلسة</label>
                <input
                  type="date"
                  value={orderDate}
                  onChange={e => setOrderDate(e.target.value)}
                  className="w-full border border-slate-300 rounded-lg p-2 text-xs outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">الشيف / الجزار المسؤول</label>
                <input
                  type="text"
                  value={butcherName}
                  onChange={e => setButcherName(e.target.value)}
                  placeholder="مثال: الشيف أحمد / مجزر الأمانة"
                  className="w-full border border-slate-300 rounded-lg p-2 text-xs outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  طريقة توزيع التكلفة المحاسبية
                </label>
                <select
                  value={costMethod}
                  onChange={e => setCostMethod(e.target.value as any)}
                  className="w-full border border-slate-300 rounded-lg p-2 text-xs font-bold text-indigo-700 outline-none"
                >
                  <option value="relative_value">القيمة السوقية النسبية (موصى بها)</option>
                  <option value="by_product_deduction">استبعاد المنتجات العرضية (عظم/دهن)</option>
                  <option value="weight_equal">توزيع بالتساوي على الوزن</option>
                </select>
              </div>

              <div className="md:col-span-2">
                <label className="block text-xs font-bold text-slate-700 mb-1">ملاحظات التشغيلة</label>
                <input
                  type="text"
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  placeholder="رقم أذن الذبح، المورد، مواصفات الجودة..."
                  className="w-full border border-slate-300 rounded-lg p-2 text-xs outline-none"
                />
              </div>
            </div>
          </div>

          {/* Section 2: Weight & Cost Inputs Bar */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
              <div className="flex items-center justify-between mb-1">
                <label className="block text-xs font-bold text-slate-500">
                  الوزن الإجمالي المدخل (كجم)
                </label>
                {selectedProductStock && selectedProductStock.whStock > 0 && selectedProductStock.whStock !== inputWeight && (
                  <button
                    type="button"
                    onClick={() => handleInputWeightChange(selectedProductStock.whStock, true)}
                    className="text-[10px] text-indigo-600 hover:text-indigo-800 font-bold bg-indigo-50 hover:bg-indigo-100 px-2 py-0.5 rounded border border-indigo-100 transition"
                    title="استرجاع رصيد المخزن الفعلي كوزن مدخل"
                  >
                    جلب رصيد المخزن ({selectedProductStock.whStock})
                  </button>
                )}
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  step="0.1"
                  value={inputWeight}
                  onChange={e => handleInputWeightChange(parseFloat(e.target.value) || 0, false)}
                  className="w-full text-2xl font-extrabold text-slate-800 outline-none border-b-2 border-rose-500 py-1"
                />
                <span className="text-xs font-bold text-slate-400">كجم</span>
              </div>
              {selectedProductStock && selectedProductStock.whStock > 0 && selectedProductStock.whStock === inputWeight && (
                <span className="text-[10px] text-emerald-600 font-bold mt-1 flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3 text-emerald-500" /> تم جلب الكمية آلياً من رصيد المخزن ({selectedProductStock.whStock} {selectedProductStock.unit})
                </span>
              )}
              {selectedProductStock && selectedProductStock.whStock < inputWeight && (
                <span className="text-[10px] text-amber-600 font-bold block mt-1">
                  ⚠️ المطلوب أكبر من رصيد المخزن ({selectedProductStock.whStock})
                </span>
              )}
            </div>

            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
              <div className="flex items-center justify-between mb-1">
                <label className="block text-xs font-bold text-slate-500">
                  سعر شراء الكيلو الخام (ج/كجم)
                </label>
                {isPriceAutoFetched && inputCostPerKg > 0 && (
                  <span className="text-[10px] text-emerald-700 font-bold bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200 flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3 text-emerald-600" /> تم الجلب آلياً
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  step="0.5"
                  value={inputCostPerKg}
                  onChange={e => {
                    setInputCostPerKg(parseFloat(e.target.value) || 0);
                    setIsPriceAutoFetched(false);
                  }}
                  className="w-full text-2xl font-extrabold text-slate-800 outline-none border-b-2 border-amber-500 py-1"
                />
                <span className="text-xs font-bold text-slate-400">ج.م</span>
              </div>
              <div className="flex items-center justify-between mt-1 text-[11px]">
                <span className="text-slate-400">
                  إجمالي الشراء: {totalInputCost.toLocaleString()} ج
                </span>
                {sourceProductId && (
                  <button
                    type="button"
                    onClick={() => fetchProductCost(sourceProductId)}
                    className="text-[10px] text-indigo-600 hover:text-indigo-800 font-bold underline transition"
                    title="إعادة جلب سعر الشراء من بطاقة الصنف أو أحدث فاتورة مشتريات"
                  >
                    تحديث السعر
                  </button>
                )}
              </div>
            </div>

            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
              <label className="block text-xs font-bold text-slate-500 mb-1">
                مصاريف جزارة / نقل إضافية
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  step="10"
                  value={additionalLaborCost}
                  onChange={e => setAdditionalLaborCost(parseFloat(e.target.value) || 0)}
                  className="w-full text-2xl font-extrabold text-slate-800 outline-none border-b-2 border-indigo-500 py-1"
                />
                <span className="text-xs font-bold text-slate-400">ج.م</span>
              </div>
              <span className="text-[11px] text-slate-400 block mt-1">تحمل على تكلفة اللحوم</span>
            </div>

            <div className="bg-gradient-to-br from-slate-900 to-slate-800 text-white p-4 rounded-2xl shadow-sm flex flex-col justify-between">
              <span className="text-xs font-bold text-slate-300">إجمالي التكلفة الكلية للتشفية</span>
              <div className="text-2xl font-black text-amber-400">
                {totalNetCost.toLocaleString()} <span className="text-xs font-normal text-white">ج.م</span>
              </div>
              <span className="text-[11px] text-slate-400">
                معدل التكلفة الخام: {(inputWeight > 0 ? totalNetCost / inputWeight : 0).toFixed(2)} ج/كجم
              </span>
            </div>
          </div>

          {/* Section 3: Reactive Yield Progress Bar & Alerts */}
          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm space-y-3">
            <div className="flex flex-wrap items-center justify-between text-xs font-bold">
              <div className="flex items-center gap-2">
                <span className="text-slate-700">مجموع أوزان المخرجات الفعلية:</span>
                <span className="text-sm text-indigo-700 font-extrabold">
                  {calculationResult.total_output_weight.toFixed(2)} كجم
                </span>
                <span className="text-slate-400 font-normal">من أصل {inputWeight} كجم</span>
              </div>

              <div className="flex items-center gap-3">
                <span className="text-slate-700">
                  نسبة الاستخراج النافع:{' '}
                  <span className="text-emerald-700 font-extrabold">
                    {calculationResult.useful_yield_pct}%
                  </span>
                </span>

                <span
                  className={`px-2.5 py-1 rounded-full text-xs font-bold flex items-center gap-1 ${
                    isExcessShrinkage
                      ? 'bg-red-100 text-red-700 border border-red-200'
                      : 'bg-emerald-100 text-emerald-700 border border-emerald-200'
                  }`}
                >
                  {isExcessShrinkage ? <AlertTriangle className="w-3.5 h-3.5" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                  الفاقد / الهالك: {calculationResult.shrinkage_weight.toFixed(2)} كجم ({calculationResult.shrinkage_pct}%)
                </span>
              </div>
            </div>

            {/* Visual Progress Bar */}
            <div className="w-full bg-slate-100 h-3 rounded-full overflow-hidden flex">
              <div
                className="bg-emerald-500 transition-all duration-300"
                style={{ width: `${Math.min(100, calculationResult.useful_yield_pct)}%` }}
                title={`اللحم النافع: ${calculationResult.useful_yield_pct}%`}
              />
              <div
                className="bg-red-400 transition-all duration-300"
                style={{ width: `${Math.min(100, calculationResult.shrinkage_pct)}%` }}
                title={`الهالك: ${calculationResult.shrinkage_pct}%`}
              />
            </div>
          </div>

          {/* Section 4: Output Cuts Data Entry Table */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden space-y-2">
            <div className="p-4 bg-slate-50 border-b border-slate-200 flex justify-between items-center">
              <div>
                <h4 className="font-bold text-sm text-slate-800 flex items-center gap-2">
                  <ChefHat className="w-4 h-4 text-rose-600" />
                  الخطوة 2: الأوزان الفعلية للقطعيات وتوزيع التكلفة المحسوبة
                </h4>
                <p className="text-xs text-slate-500">
                  أدخل الوزن الفعلي من الميزان لكل صنف، ويقوم النظام بحساب التكلفة الفردية للكيلو لحظياً
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleRecalculateWeights(inputWeight)}
                  className="bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 text-xs font-bold px-3 py-1.5 rounded-lg flex items-center gap-1 transition"
                  title="إعادة احتساب أوزان المخرجات تلقائياً بناءً على الوزن المدخل ونسب القالب"
                >
                  <Calculator className="w-3.5 h-3.5" /> إعادة ضبط الأوزان ({inputWeight} كجم)
                </button>

                <button
                  type="button"
                  onClick={handleAddItem}
                  className="bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold px-3 py-1.5 rounded-lg flex items-center gap-1 shadow-sm transition"
                >
                  <Plus className="w-4 h-4" /> إضافة صنف ناتج
                </button>
              </div>
            </div>

            {calculationResult.total_output_weight > inputWeight && (
              <div className="m-3 p-3 bg-red-50 border-2 border-red-200 rounded-xl flex items-center justify-between gap-3 text-red-900 animate-pulse">
                <div className="flex items-center gap-2.5">
                  <AlertTriangle className="w-5 h-5 text-red-600 flex-shrink-0" />
                  <div>
                    <span className="font-extrabold text-xs">
                      تنبيه هام: مجموع أوزان المخرجات ({calculationResult.total_output_weight.toFixed(2)} كجم) أكبر من الوزن المدخل ({inputWeight} كجم)!
                    </span>
                    <span className="text-[11px] text-red-700 block mt-0.5">
                      نسبة الاستخراج الحالية ({calculationResult.useful_yield_pct}%) غير منطقية. اضغط الزر المجاور لتعديل الأوزان فوراً وتوزيع الـ {inputWeight} كجم على الأصناف.
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => handleRecalculateWeights(inputWeight)}
                  className="bg-red-600 hover:bg-red-700 text-white text-xs font-bold px-3.5 py-1.5 rounded-lg flex items-center gap-1.5 shadow flex-shrink-0"
                >
                  <Sparkles className="w-3.5 h-3.5" /> ضبط الأوزان الآن
                </button>
              </div>
            )}

            <div className="overflow-x-auto">
              <table className="w-full text-right text-xs">
                <thead className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200">
                  <tr>
                    <th className="p-3">اسم القطعية / الصنف الناتج</th>
                    <th className="p-3 min-w-[200px]">الربط ببطاقة الصنف (المخزن)</th>
                    <th className="p-3 w-28 text-center bg-rose-50 text-rose-900">الوزن الفعلي (كجم)</th>
                    <th className="p-3 w-24 text-center">نسبة الاستخراج</th>
                    <th className="p-3 w-24 text-center">معامل القيمة</th>
                    <th className="p-3 w-32 text-center bg-indigo-50 text-indigo-900">تكلفة الكيلو الناتجة</th>
                    <th className="p-3 w-32 text-center">إجمالي التكلفة</th>
                    <th className="p-3 w-28 text-center" title="اختياري: حدد هذا الخيار فقط إذا كانت هذه القطعية عظام أو دهون لطرح قيمتها من تكلفة القطعيات الرئيسية. تركها بدون تحديد يعني أنها لحم رئيسي ممتاز.">
                      <div className="flex flex-col items-center leading-tight">
                        <span className="font-bold">منتج ثانوي؟</span>
                        <span className="text-[10px] font-normal text-slate-500">(عظم / دهن)</span>
                      </div>
                    </th>
                    <th className="p-3 w-12 text-center">حذف</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {outputItems.map((item, idx) => {
                    const calc = calculationResult.items[idx];
                    return (
                      <tr key={idx} className="hover:bg-slate-50/80 transition">
                        <td className="p-2.5">
                          <input
                            type="text"
                            value={item.output_name}
                            onChange={e => handleUpdateItem(idx, 'output_name', e.target.value)}
                            placeholder="اسم القطعية..."
                            className="w-full border border-slate-300 rounded-lg px-2.5 py-1.5 font-bold text-slate-800 outline-none focus:ring-1 focus:ring-rose-500"
                          />
                        </td>
                        <td className="p-2.5">
                          <select
                            value={item.output_product_id || ''}
                            onChange={e => handleUpdateItem(idx, 'output_product_id', e.target.value || null)}
                            className={`w-full border rounded-lg px-2 py-1 text-slate-700 outline-none text-[11px] font-medium transition ${
                              item.output_product_id
                                ? 'border-emerald-400 bg-emerald-50/50 text-emerald-900 font-bold'
                                : 'border-amber-300 bg-amber-50/40 text-amber-800'
                            }`}
                          >
                            <option value="">-- بدون ربط مخزني (لن يضاف للرصيد) --</option>
                            {products.map(p => (
                              <option key={p.id} value={p.id}>
                                {p.name} {p.sku ? `(${p.sku})` : ''}
                              </option>
                            ))}
                          </select>
                          {item.output_product_id ? (
                            <span className="text-[10px] text-emerald-600 font-bold flex items-center gap-1 mt-0.5">
                              <CheckCircle2 className="w-3 h-3" /> مربوط بالمخزن (ستتم زيادة رصيده)
                            </span>
                          ) : (
                            <span className="text-[10px] text-amber-600 font-medium flex items-center gap-1 mt-0.5">
                              <AlertTriangle className="w-3 h-3" /> غير مربوط (لن تزيد كميته)
                            </span>
                          )}
                        </td>
                        <td className="p-2.5 bg-rose-50/40">
                          <input
                            type="number"
                            step="0.05"
                            value={item.actual_weight}
                            onChange={e =>
                              handleUpdateItem(idx, 'actual_weight', parseFloat(e.target.value) || 0)
                            }
                            className="w-full border border-rose-300 rounded-lg px-2 py-1 text-center font-extrabold text-sm text-slate-900 bg-white outline-none focus:ring-2 focus:ring-rose-500"
                          />
                        </td>
                        <td className="p-2.5 text-center">
                          <span className="bg-slate-100 text-slate-700 px-2 py-0.5 rounded font-bold">
                            {calc ? `${calc.yield_pct}%` : '0%'}
                          </span>
                        </td>
                        <td className="p-2.5 text-center">
                          <input
                            type="number"
                            step="0.1"
                            value={item.relative_value_weight}
                            onChange={e =>
                              handleUpdateItem(idx, 'relative_value_weight', parseFloat(e.target.value) || 1.0)
                            }
                            className="w-16 border border-slate-300 rounded px-1.5 py-0.5 text-center font-bold text-indigo-700 bg-indigo-50/50 outline-none mx-auto block"
                          />
                        </td>
                        <td className="p-2.5 text-center bg-indigo-50/40">
                          <span className="text-sm font-extrabold text-indigo-900">
                            {calc ? calc.allocated_cost_per_kg.toFixed(2) : '0.00'}
                          </span>
                          <span className="text-[10px] text-indigo-700 font-bold block">ج/كجم</span>
                        </td>
                        <td className="p-2.5 text-center font-bold text-slate-800">
                          {calc ? calc.total_allocated_cost.toLocaleString() : '0'} ج
                        </td>
                        <td className="p-2.5 text-center">
                          <div className="flex flex-col items-center justify-center gap-1">
                            <input
                              type="checkbox"
                              checked={item.is_by_product}
                              onChange={e => handleUpdateItem(idx, 'is_by_product', e.target.checked)}
                              title="ضع علامة صح فقط إذا كان هذا الصنف عظم أو دهن مستبعد من تكلفة اللحم الرئيسي"
                              className="w-4 h-4 text-rose-600 rounded border-slate-300 cursor-pointer focus:ring-rose-500"
                            />
                            <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${
                              item.is_by_product ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-600'
                            }`}>
                              {item.is_by_product ? 'عظم/دهن' : 'لحم رئيسي'}
                            </span>
                          </div>
                        </td>
                        <td className="p-2.5 text-center">
                          <button
                            onClick={() => handleRemoveItem(idx)}
                            className="text-red-400 hover:text-red-600 p-1 rounded transition"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot className="bg-slate-100 font-bold border-t border-slate-200">
                  <tr>
                    <td colSpan={2} className="p-3 text-slate-800">
                      الإجمالي:
                    </td>
                    <td className="p-3 text-center text-sm font-black text-rose-900 bg-rose-100">
                      {calculationResult.total_output_weight.toFixed(2)} كجم
                    </td>
                    <td className="p-3 text-center text-emerald-800">
                      {calculationResult.useful_yield_pct}%
                    </td>
                    <td className="p-3" />
                    <td className="p-3 text-center text-xs text-indigo-800 bg-indigo-100">
                      تطابق التكلفة: 100%
                    </td>
                    <td className="p-3 text-center text-sm font-black text-slate-900">
                      {calculationResult.total_allocated_cost.toLocaleString()} ج
                    </td>
                    <td colSpan={2} />
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

          {/* Section 5: Accounting & Journal Entry Automation */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-4">
            <div className="flex items-center justify-between border-b pb-3">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={autoPostAccounting}
                  onChange={e => setAutoPostAccounting(e.target.checked)}
                  className="w-4 h-4 text-rose-600 rounded border-slate-300"
                />
                <span className="font-bold text-sm text-slate-800 flex items-center gap-1.5">
                  <Calculator className="w-4 h-4 text-indigo-600" />
                  إنشاء وترحيل قيد اليومية المخزني آلياً في دفتر الأستاذ العام
                </span>
              </label>
              <span className="text-xs text-slate-400 font-medium">المدين = الدائن = {totalNetCost.toLocaleString()} ج.م</span>
            </div>

            {autoPostAccounting && (
              <>
                <div className="flex items-center gap-2 text-xs font-semibold">
                  {rawMaterialAccountId && finishedGoodsAccountId ? (
                    <span className="text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-lg flex items-center gap-1.5">
                      <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                      الحسابات مكتملة وجاهزة لإنشاء القيد المحاسبي المتوازن فوراً في دفتر الأستاذ العام
                    </span>
                  ) : (
                    <span className="text-amber-700 bg-amber-50 border border-amber-200 px-2.5 py-1 rounded-lg flex items-center gap-1.5">
                      <AlertTriangle className="w-4 h-4 text-amber-600" />
                      يرجى التأكد من اختيار حساب المخزون الخام وحساب اللحوم المجهزة ليتمكن النظام من توليد القيد المحاسبي
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    حساب مخزون الذبائح واللحوم الخام (طرف دائن)
                  </label>
                  <select
                    value={rawMaterialAccountId}
                    onChange={e => setRawMaterialAccountId(e.target.value)}
                    className="w-full border border-slate-300 rounded-lg p-2 text-xs outline-none"
                  >
                    <option value="">-- اختر حساب المخزون الخام --</option>
                    {accounts.map(a => (
                      <option key={a.id} value={a.id}>
                        {a.code} - {a.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    حساب مخزون اللحوم المشفاة والمجهزة (طرف مدين)
                  </label>
                  <select
                    value={finishedGoodsAccountId}
                    onChange={e => setFinishedGoodsAccountId(e.target.value)}
                    className="w-full border border-slate-300 rounded-lg p-2 text-xs outline-none"
                  >
                    <option value="">-- اختر حساب اللحوم المجهزة --</option>
                    {accounts.map(a => (
                      <option key={a.id} value={a.id}>
                        {a.code} - {a.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    حساب أجور الجزارة / المصروفات (طرف دائن)
                  </label>
                  <select
                    value={laborPayableAccountId}
                    onChange={e => setLaborPayableAccountId(e.target.value)}
                    className="w-full border border-slate-300 rounded-lg p-2 text-xs outline-none"
                  >
                    <option value="">-- اختياري (إذا وجدت أجور إضافية) --</option>
                    {accounts.map(a => (
                      <option key={a.id} value={a.id}>
                        {a.code} - {a.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </>
          )}
          </div>
        </div>

        {/* Modal Footer Actions */}
        <div className="bg-white border-t border-slate-200 px-6 py-4 flex flex-wrap justify-between items-center gap-3">
          <button
            onClick={onClose}
            className="px-5 py-2.5 border border-slate-300 rounded-xl text-sm font-bold text-slate-600 hover:bg-slate-50 transition"
          >
            إلغاء
          </button>

          <div className="flex items-center gap-3">
            <button
              onClick={handleSubmit}
              disabled={submitting || calculationResult.total_output_weight > inputWeight}
              className={`px-6 py-2.5 rounded-xl text-sm font-bold shadow-lg flex items-center gap-2 transition disabled:opacity-50 ${
                calculationResult.total_output_weight > inputWeight
                  ? 'bg-slate-400 text-white cursor-not-allowed'
                  : 'bg-gradient-to-r from-rose-600 to-amber-600 hover:from-rose-700 hover:to-amber-700 text-white shadow-rose-600/20'
              }`}
            >
              <CheckCircle2 className="w-4 h-4" />
              {calculationResult.total_output_weight > inputWeight
                ? `المخرجات (${calculationResult.total_output_weight.toFixed(1)} كجم) تتجاوز المدخل (${inputWeight} كجم)`
                : submitting
                ? 'جاري الترحيل والحفظ...'
                : 'تنفيذ وترحيل أمر التشفية والمخزون'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import {
  Factory,
  Plus,
  Trash2,
  Play,
  Loader2,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Bookmark,
  FolderPlus,
  Sparkles,
  Package,
  RefreshCw,
  Printer,
  History,
  Layers,
  AlertCircle,
  ExternalLink,
  RotateCcw,
  Eraser,
  GitBranch,
} from 'lucide-react';
import { supabase } from '../../../supabaseClient';
import { useAccounting } from '../../../context/AccountingContext';
import { useToast } from '../../../context/ToastContext';
import { getActiveOrgIdSync, resolveActiveOrgId } from '../../../services/tenantContext';
import { fetchCompleteDataset } from '../../../services/balanceService';
import { invalidateProducts } from '../../../services/queryClient';
import ProductSearchSelect from '../../../components/ProductSearchSelect';
import { Category, Product, Warehouse } from '../../../types';
import { logger } from '../../../utils/logger';
import { escapeHtml } from '../../../utils/htmlSanitizer';
import {
  BomLineRecord,
  DailyBatchRow,
  RoutingRecord,
  RoutingStepRecord,
  ShiftTemplate,
  StepMaterialRecord,
  UomRecord,
  calculateBatchMaterialRequirements,
  deleteShiftTemplate,
  filterManufacturableProducts,
  generateBatchReference,
  getCategoryNameById,
  loadShiftTemplates,
  saveShiftTemplate,
} from '../utils/dailyBatchUtils';
import { cleanupFailedProductionOrder, completeOrderLifecycle } from '../utils/productionExecution';

interface BatchHistoryGroup {
  batchNumber: string;
  date: string;
  itemsCount: number;
  totalQty: number;
  completedCount: number;
  warehouseName: string;
  orders: Array<{
    id: string;
    orderNumber: string;
    productName: string;
    sku: string;
    unit: string;
    qty: number;
    status: string;
  }>;
}

const createEmptyRowId = () => `row-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

const createBlankRow = (warehouseId: string): DailyBatchRow => ({
  rowId: createEmptyRowId(),
  productId: '',
  quantity: 1,
  warehouseId,
  notes: '',
  status: 'idle',
});

const DailyBatchProduction: React.FC = () => {
  const accountingCtx = useAccounting();
  const {
    products = [],
    warehouses = [],
    categories = [],
    organization,
    currentUser,
    currentSelectedOrgId,
    refreshData,
  } = accountingCtx;
  const refreshProducts = (accountingCtx as unknown as { refreshProducts?: () => Promise<void> }).refreshProducts;
  const typedWarehouses = (warehouses || []) as Warehouse[];
  const typedCategories = (categories || []) as Category[];
  const { showToast } = useToast();

  const activeOrgId =
    getActiveOrgIdSync(currentSelectedOrgId || organization?.id || currentUser?.organization_id) ||
    currentSelectedOrgId ||
    organization?.id ||
    currentUser?.organization_id ||
    '';

  const isSubmittingRef = useRef(false);
  const quickSearchInputRef = useRef<HTMLInputElement>(null);

  const [activeTab, setActiveTab] = useState<'create' | 'history'>('create');
  const [productionDate, setProductionDate] = useState<string>(() => new Date().toISOString().split('T')[0]);
  const [batchRef, setBatchRef] = useState<string>(() => generateBatchReference());
  const [defaultWarehouseId, setDefaultWarehouseId] = useState<string>('');
  const [batchNotes, setBatchNotes] = useState<string>('');
  const [rows, setRows] = useState<DailyBatchRow[]>(() => [createBlankRow('')]);

  // Recipe & UoM metadata
  const [loadingRecipes, setLoadingRecipes] = useState<boolean>(false);
  const [uoms, setUoms] = useState<UomRecord[]>([]);
  const [routings, setRoutings] = useState<RoutingRecord[]>([]);
  const [routingSteps, setRoutingSteps] = useState<RoutingStepRecord[]>([]);
  const [stepMaterials, setStepMaterials] = useState<StepMaterialRecord[]>([]);
  const [bomLines, setBomLines] = useState<BomLineRecord[]>([]);

  // Quick load & template state
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>('');
  const [selectedRoutingProductId, setSelectedRoutingProductId] = useState<string>('');
  const [templates, setTemplates] = useState<ShiftTemplate[]>([]);
  const [templateNameInput, setTemplateNameInput] = useState<string>('');
  const [showSaveTemplateBox, setShowSaveTemplateBox] = useState<boolean>(false);

  // Execution & progress state
  const [executing, setExecuting] = useState<boolean>(false);
  const [executionProgress, setExecutionProgress] = useState<{
    current: number;
    total: number;
    currentProductName: string;
  } | null>(null);
  const [allowShortageExecution, setAllowShortageExecution] = useState<boolean>(true);
  const [showMaterialsDetail, setShowMaterialsDetail] = useState<boolean>(true);

  // History state
  const [historyLoading, setHistoryLoading] = useState<boolean>(false);
  const [recentBatches, setRecentBatches] = useState<BatchHistoryGroup[]>([]);

  const productIdsWithRecipes = useMemo(() => {
    const ids = new Set<string>();
    for (const r of routings) {
      if (!r.deleted_at && r.product_id) ids.add(r.product_id);
    }
    for (const b of bomLines) {
      if (b.product_id) ids.add(b.product_id);
    }
    return ids;
  }, [routings, bomLines]);

  const manufacturableProducts = useMemo(
    () => filterManufacturableProducts(products as Product[], productIdsWithRecipes),
    [products, productIdsWithRecipes]
  );

  const categoryCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const p of manufacturableProducts) {
      if (p.category_id) {
        counts.set(p.category_id, (counts.get(p.category_id) || 0) + 1);
      }
    }
    return counts;
  }, [manufacturableProducts]);

  const populatedCategories = useMemo(
    () => typedCategories.filter((c) => (categoryCounts.get(c.id) || 0) > 0),
    [typedCategories, categoryCounts]
  );

  // الأصناف التي لديها مسار ومراحل تصنيع (BOM/Routing) معتمدة وجاهزة للتشغيل
  const productsWithRoutingOptions = useMemo(() => {
    const activeRoutingByProduct = new Map<string, RoutingRecord>();
    for (const r of routings) {
      if (r.deleted_at) continue;
      const existing = activeRoutingByProduct.get(r.product_id);
      if (!existing || (!existing.is_default && r.is_default)) {
        activeRoutingByProduct.set(r.product_id, r);
      }
    }

    const stepsCountByRouting = new Map<string, number>();
    for (const st of routingSteps) {
      stepsCountByRouting.set(st.routing_id, (stepsCountByRouting.get(st.routing_id) || 0) + 1);
    }

    const bomCountByProduct = new Map<string, number>();
    for (const b of bomLines) {
      bomCountByProduct.set(b.product_id, (bomCountByProduct.get(b.product_id) || 0) + 1);
    }

    return manufacturableProducts
      .filter((p) => productIdsWithRecipes.has(p.id))
      .map((p) => {
        const routing = activeRoutingByProduct.get(p.id);
        const stepsCount = routing ? (stepsCountByRouting.get(routing.id) || 0) : 0;
        const bomCount = bomCountByProduct.get(p.id) || 0;
        const badgeText = routing
          ? `مسار: ${stepsCount} مرحلة`
          : `BOM: ${bomCount} خامة`;
        return {
          product: p,
          routingName: routing?.name || '',
          stepsCount,
          bomCount,
          label: `${p.name} (${badgeText})`,
        };
      });
  }, [manufacturableProducts, productIdsWithRecipes, routings, routingSteps, bomLines]);

  const productMap = useMemo(() => {
    const map = new Map<string, Product>();
    for (const p of (products || []) as Product[]) {
      if (p?.id) map.set(p.id, p);
    }
    return map;
  }, [products]);

  // Initialize default warehouse and backfill empty row warehouseIds
  useEffect(() => {
    if (typedWarehouses.length > 0 && !defaultWarehouseId) {
      const defWh = typedWarehouses.find((w) => (w as Warehouse & { is_default?: boolean }).is_default) || typedWarehouses[0];
      if (defWh?.id) {
        setDefaultWarehouseId(defWh.id);
        setRows((prev) => prev.map((r) => (r.warehouseId ? r : { ...r, warehouseId: defWh.id })));
      }
    }
  }, [typedWarehouses, defaultWarehouseId]);

  // Load saved templates when org changes
  useEffect(() => {
    setTemplates(loadShiftTemplates(activeOrgId));
  }, [activeOrgId]);

  // Fetch BOM, routings, routing steps, step materials, and UoMs
  const fetchManufacturingMetadata = useCallback(async () => {
    const resolvedOrg = activeOrgId || (await resolveActiveOrgId(currentSelectedOrgId || currentUser?.organization_id));
    if (!resolvedOrg) return;

    setLoadingRecipes(true);
    try {
      const [uomsRes, routingsRes, stepsData, stepMatsData, bomData] = await Promise.all([
        supabase
          .from('uoms')
          .select('id, name, ratio, uom_type')
          .eq('organization_id', resolvedOrg),
        supabase
          .from('mfg_routings')
          .select('id, product_id, name, is_default, deleted_at')
          .eq('organization_id', resolvedOrg)
          .is('deleted_at', null),
        fetchCompleteDataset<RoutingStepRecord>(async (from, to) =>
          supabase
            .from('mfg_routing_steps')
            .select('id, routing_id, step_order, operation_name, standard_time_minutes, work_center_id')
            .eq('organization_id', resolvedOrg)
            .order('step_order', { ascending: true })
            .range(from, to)
        ),
        fetchCompleteDataset<StepMaterialRecord>(async (from, to) =>
          supabase
            .from('mfg_step_materials')
            .select('step_id, raw_material_id, quantity_required, uom_id')
            .eq('organization_id', resolvedOrg)
            .range(from, to)
        ),
        fetchCompleteDataset<BomLineRecord>(async (from, to) =>
          supabase
            .from('bill_of_materials')
            .select('product_id, raw_material_id, quantity_required, uom_id, shrinkage_pct')
            .eq('organization_id', resolvedOrg)
            .range(from, to)
        ),
      ]);

      if (uomsRes.data) setUoms(uomsRes.data as UomRecord[]);
      if (routingsRes.data) setRoutings(routingsRes.data as RoutingRecord[]);
      setRoutingSteps(stepsData || []);
      setStepMaterials(stepMatsData || []);
      setBomLines(bomData || []);
    } catch (err) {
      logger.error('Failed to load manufacturing metadata for daily batch:', err);
      showToast('تعذر تحميل وصفات التصنيع بالكامل، يرجى التحديث والمحاولة', 'warning');
    } finally {
      setLoadingRecipes(false);
    }
  }, [activeOrgId, currentSelectedOrgId, currentUser?.organization_id, showToast]);

  useEffect(() => {
    fetchManufacturingMetadata();
  }, [fetchManufacturingMetadata]);

  // Fetch recent daily batch history
  const fetchRecentBatches = useCallback(async () => {
    const resolvedOrg = activeOrgId || (await resolveActiveOrgId(currentSelectedOrgId || currentUser?.organization_id));
    if (!resolvedOrg) return;

    setHistoryLoading(true);
    try {
      const { data, error } = await supabase
        .from('mfg_production_orders')
        .select('id, order_number, batch_number, product_id, quantity_to_produce, status, start_date, end_date, warehouse_id, notes, created_at, products(name, sku, unit), warehouses(name)')
        .eq('organization_id', resolvedOrg)
        .ilike('batch_number', 'DAILY-BATCH-%')
        .order('created_at', { ascending: false })
        .limit(200);

      if (error) throw error;

      const grouped = new Map<string, BatchHistoryGroup>();
      type OrderHistoryRow = {
        id: string;
        order_number: string;
        batch_number?: string | null;
        quantity_to_produce?: number | null;
        status?: string | null;
        start_date?: string | null;
        end_date?: string | null;
        created_at?: string | null;
        products?: { name?: string; sku?: string; unit?: string } | null;
        warehouses?: { name?: string } | null;
      };
      for (const item of (data || []) as OrderHistoryRow[]) {
        const bNum = item.batch_number || item.order_number;
        if (!grouped.has(bNum)) {
          grouped.set(bNum, {
            batchNumber: bNum,
            date: item.end_date || item.start_date || (item.created_at ? String(item.created_at).split('T')[0] : ''),
            itemsCount: 0,
            totalQty: 0,
            completedCount: 0,
            warehouseName: item.warehouses?.name || 'المستودع الرئيسي',
            orders: [],
          });
        }
        const g = grouped.get(bNum)!;
        const qty = Number(item.quantity_to_produce || 0);
        g.itemsCount += 1;
        g.totalQty += qty;
        if (String(item.status || '').toLowerCase() === 'completed') {
          g.completedCount += 1;
        }
        g.orders.push({
          id: item.id,
          orderNumber: item.order_number,
          productName: item.products?.name || 'صنف مصنّع',
          sku: item.products?.sku || '',
          unit: item.products?.unit || 'قطعة',
          qty,
          status: item.status || 'draft',
        });
      }
      setRecentBatches(Array.from(grouped.values()));
    } catch (err: unknown) {
      logger.error('Failed to fetch recent daily batches:', err);
      const errMsg = err instanceof Error ? err.message : '';
      showToast('تعذر تحميل سجل الدفعات اليومية: ' + errMsg, 'error');
    } finally {
      setHistoryLoading(false);
    }
  }, [activeOrgId, currentSelectedOrgId, currentUser?.organization_id, showToast]);

  useEffect(() => {
    if (activeTab === 'history') {
      fetchRecentBatches();
    }
  }, [activeTab, fetchRecentBatches]);

  // Pre-flight material requirements & estimated cost calculation
  const batchCalc = useMemo(
    () =>
      calculateBatchMaterialRequirements({
        rows,
        products: (products || []) as Product[],
        uoms,
        routings,
        routingSteps,
        stepMaterials,
        bomLines,
      }),
    [rows, products, uoms, routings, routingSteps, stepMaterials, bomLines]
  );

  const validActiveRows = useMemo(
    () => rows.filter((r) => r.productId && Number(r.quantity) > 0),
    [rows]
  );

  const failedRows = useMemo(
    () => rows.filter((r) => r.status === 'error'),
    [rows]
  );

  // Add single product row (reusing first blank row if present, or incrementing existing)
  const handleAddProduct = (productId: string, selectedProduct?: Product) => {
    if (!productId) return;
    const prod = selectedProduct || productMap.get(productId);
    const existingIdx = rows.findIndex((r) => r.productId === productId);
    if (existingIdx !== -1) {
      setRows((prev) =>
        prev.map((r, idx) =>
          idx === existingIdx
            ? { ...r, quantity: Number(r.quantity || 0) + 1, status: 'idle', errorMessage: undefined }
            : r
        )
      );
      showToast(`تم زيادة كمية "${prod?.name || 'الصنف'}" في الجدول`, 'info');
      return;
    }

    const whId = defaultWarehouseId || (warehouses[0]?.id ?? '');
    setRows((prev) => {
      const blankIdx = prev.findIndex((r) => !r.productId);
      if (blankIdx !== -1) {
        return prev.map((r, idx) =>
          idx === blankIdx
            ? { ...r, productId, quantity: Number(r.quantity) > 0 ? r.quantity : 1, warehouseId: r.warehouseId || whId }
            : r
        );
      }
      return [
        ...prev,
        {
          rowId: createEmptyRowId(),
          productId,
          quantity: 1,
          warehouseId: whId,
          notes: '',
          status: 'idle',
        },
      ];
    });
  };

  const handleAddEmptyRow = () => {
    const whId = defaultWarehouseId || (warehouses[0]?.id ?? '');
    setRows((prev) => [...prev, createBlankRow(whId)]);
  };

  // Load all manufacturable products in selected category
  const handleLoadAllWithRouting = () => {
    if (productsWithRoutingOptions.length === 0) {
      showToast('لا توجد أصناف معرفة بمسار تصنيع أو BOM حتى الآن', 'warning');
      return;
    }

    const existingIds = new Set(rows.map((r) => r.productId).filter(Boolean));
    const whId = defaultWarehouseId || (typedWarehouses[0]?.id ?? '');
    const newRows: DailyBatchRow[] = productsWithRoutingOptions
      .filter((opt) => !existingIds.has(opt.product.id))
      .map((opt) => ({
        rowId: createEmptyRowId(),
        productId: opt.product.id,
        quantity: 0,
        warehouseId: whId,
        notes: '',
        status: 'idle',
      }));

    if (newRows.length === 0) {
      showToast('جميع الأصناف التي لها مسار ومراحل تصنيع مضافة بالفعل في الجدول', 'info');
      return;
    }

    setRows((prev) => [...prev.filter((r) => Boolean(r.productId)), ...newRows]);
    showToast(`تم تحميل ${newRows.length} صنف لها مسار ومراحل تصنيع (BOM/Routing) — أدخل الكميات المطلوبة`, 'success');
  };

  const handleLoadCategory = (catIdOverride?: string) => {
    const targetCatId = catIdOverride ?? selectedCategoryId;
    if (!targetCatId) {
      showToast('اختر التصنيف أولاً (مثل: التورتات، الجاتوهات، الشرقي)', 'warning');
      return;
    }
    const matching = manufacturableProducts.filter((p) =>
      targetCatId === '__ALL__' ? true : p.category_id === targetCatId
    );
    if (matching.length === 0) {
      showToast('لا توجد أصناف مصنّعة ضمن هذا التصنيف', 'warning');
      return;
    }

    const existingIds = new Set(rows.map((r) => r.productId).filter(Boolean));
    const whId = defaultWarehouseId || (warehouses[0]?.id ?? '');
    const newRows: DailyBatchRow[] = matching
      .filter((p) => !existingIds.has(p.id))
      .map((p) => ({
        rowId: createEmptyRowId(),
        productId: p.id,
        quantity: 0,
        warehouseId: whId,
        notes: '',
        status: 'idle',
      }));

    if (newRows.length === 0) {
      showToast('جميع أصناف هذا التصنيف مضافة بالفعل في الجدول', 'info');
      return;
    }

    setRows((prev) => [...prev.filter((r) => Boolean(r.productId)), ...newRows]);
    showToast(`تم تحميل ${newRows.length} صنف — أدخل الكميات المنتجة اليوم`, 'success');
  };

  const handleUpdateRow = (rowId: string, patch: Partial<DailyBatchRow>) => {
    setRows((prev) =>
      prev.map((r) => (r.rowId === rowId ? { ...r, ...patch } : r))
    );
  };

  const handleRemoveRow = (rowId: string) => {
    setRows((prev) => prev.filter((r) => r.rowId !== rowId));
  };

  const handleClearZeroQtyRows = () => {
    const before = rows.length;
    const filtered = rows.filter((r) => !r.productId || Number(r.quantity) > 0);
    setRows(filtered);
    showToast(`تمت إزالة ${before - filtered.length} صف بكمية صفر`, 'info');
  };

  const handleApplyDefaultWarehouseToAll = (whId: string) => {
    setDefaultWarehouseId(whId);
    setRows((prev) => prev.map((r) => ({ ...r, warehouseId: whId })));
  };

  // Templates handlers
  const handleSaveTemplate = () => {
    const itemsToSave = rows
      .filter((r) => r.productId)
      .map((r) => ({
        productId: r.productId,
        quantity: Number(r.quantity) || 0,
        warehouseId: r.warehouseId,
        notes: r.notes,
      }));
    if (itemsToSave.length === 0) {
      showToast('أضف صنفاً واحداً على الأقل قبل حفظ القالب', 'warning');
      return;
    }
    if (!templateNameInput.trim()) {
      showToast('اكتب اسماً واضحاً للقالب (مثال: وردية الصباح - تورتات)', 'warning');
      return;
    }
    const updated = saveShiftTemplate(activeOrgId, templateNameInput, itemsToSave);
    setTemplates(updated);
    setTemplateNameInput('');
    setShowSaveTemplateBox(false);
    showToast('تم حفظ قالب الوردية اليومية بنجاح ✅', 'success');
  };

  const handleLoadTemplate = (tpl: ShiftTemplate) => {
    const loadedRows: DailyBatchRow[] = tpl.items
      .filter((item) => productMap.has(item.productId))
      .map((item) => ({
        rowId: createEmptyRowId(),
        productId: item.productId,
        quantity: Number(item.quantity) || 0,
        warehouseId: item.warehouseId || defaultWarehouseId || (warehouses[0]?.id ?? ''),
        notes: item.notes || '',
        status: 'idle',
      }));
    if (loadedRows.length === 0) {
      showToast('أصناف هذا القالب غير موجودة في دليل الأصناف الحالي', 'warning');
      return;
    }
    setRows(loadedRows);
    showToast(`تم تحميل قالب "${tpl.name}" (${loadedRows.length} صنف)`, 'success');
  };

  const handleDeleteTemplate = (tplId: string) => {
    const updated = deleteShiftTemplate(activeOrgId, tplId);
    setTemplates(updated);
    showToast('تم حذف القالب', 'info');
  };

  // Execute a single production row safely using TriPro's verified RPC pipeline
  const executeSingleBatchRow = async (
    row: DailyBatchRow,
    index: number,
    resolvedOrgId: string,
    currentBatchRef: string
  ): Promise<{ orderNumber: string }> => {
    const orderId = crypto.randomUUID();
    const orderNumber = `${currentBatchRef}-${String(index + 1).padStart(2, '0')}`;
    const targetWarehouseId = row.warehouseId || defaultWarehouseId;
    const qty = Number(row.quantity);
    const combinedNotes = [
      `أمر إنتاج يومي مجمّع (${currentBatchRef})`,
      batchNotes.trim(),
      row.notes.trim(),
    ]
      .filter(Boolean)
      .join(' | ');

    // 1. Insert production order linked by batch_number
    const { error: insertErr } = await supabase.from('mfg_production_orders').insert({
      id: orderId,
      order_number: orderNumber,
      product_id: row.productId,
      warehouse_id: targetWarehouseId,
      quantity_to_produce: qty,
      start_date: productionDate,
      end_date: productionDate,
      batch_number: currentBatchRef,
      status: 'draft',
      notes: combinedNotes,
      organization_id: resolvedOrgId,
    });
    if (insertErr) throw insertErr;

    try {
      await completeOrderLifecycle({
        orderId,
        orderNumber,
        productId: row.productId,
        quantity: qty,
        orgId: resolvedOrgId,
        productionDate,
        qcNotes: `اعتماد إنتاج يومي مجمّع (${currentBatchRef})`,
        skipRecalc: true,
        routings,
        routingSteps,
        bomLines,
      });

      return { orderNumber };
    } catch (err) {
      await cleanupFailedProductionOrder(orderId);
      throw err;
    }
  };

  // Execute all valid rows (or only failed rows when retrying)
  const handleExecuteBatch = async (retryFailedOnly = false) => {
    if (isSubmittingRef.current) return;

    const targetRows = retryFailedOnly
      ? rows.filter((r) => r.status === 'error' && r.productId && Number(r.quantity) > 0)
      : rows.filter((r) => r.productId && Number(r.quantity) > 0 && r.status !== 'success');

    if (targetRows.length === 0) {
      showToast('لا توجد أصناف بكميات أكبر من الصفر للتنفيذ', 'warning');
      return;
    }

    const missingWh = targetRows.find((r) => !(r.warehouseId || defaultWarehouseId));
    if (missingWh) {
      showToast('يرجى تحديد المستودع المستهدف لجميع الأصناف', 'warning');
      return;
    }

    if (!productionDate) {
      showToast('يرجى تحديد تاريخ الإنتاج', 'warning');
      return;
    }

    if (batchCalc.productsWithoutRecipe.length > 0) {
      const missingNames = batchCalc.productsWithoutRecipe
        .map((id) => productMap.get(id)?.name || id)
        .slice(0, 3)
        .join('، ');
      showToast(`توجد أصناف بدون وصفة تصنيع (BOM/Routing): ${missingNames}`, 'error');
      return;
    }

    if (batchCalc.shortages.length > 0 && !allowShortageExecution) {
      showToast('يوجد عجز في بعض المواد الخام. راجع جدول الاحتياجات أو فعّل خيار السماح بالتنفيذ مع العجز.', 'warning');
      return;
    }

    isSubmittingRef.current = true;
    setExecuting(true);

    let successCount = 0;
    let errorCount = 0;

    try {
      const resolvedOrgId =
        activeOrgId || (await resolveActiveOrgId(currentSelectedOrgId || currentUser?.organization_id));
      if (!resolvedOrgId) {
        throw new Error('تعذر تحديد المنشأة النشطة. يرجى إعادة تسجيل الدخول.');
      }

      const activeBatchRef = batchRef.trim() || generateBatchReference(productionDate);
      if (!batchRef.trim()) setBatchRef(activeBatchRef);

      for (let i = 0; i < targetRows.length; i++) {
        const row = targetRows[i];
        const prod = productMap.get(row.productId);

        setExecutionProgress({
          current: i + 1,
          total: targetRows.length,
          currentProductName: prod?.name || 'صنف مصنّع',
        });
        handleUpdateRow(row.rowId, { status: 'running', errorMessage: undefined });

        try {
          const { orderNumber } = await executeSingleBatchRow(row, i, resolvedOrgId, activeBatchRef);
          successCount += 1;
          handleUpdateRow(row.rowId, {
            status: 'success',
            orderNumber,
            errorMessage: undefined,
          });
        } catch (rowErr: unknown) {
          errorCount += 1;
          logger.error(`Daily batch row failed for product ${row.productId}:`, rowErr);
          const rowErrMsg = rowErr instanceof Error ? rowErr.message : 'فشل تنفيذ الصنف';
          handleUpdateRow(row.rowId, {
            status: 'error',
            errorMessage: rowErrMsg,
          });
        }
      }

      if (successCount > 0) {
        const { error: recalcErr } = await supabase.rpc('recalculate_stock_rpc', {
          p_org_id: resolvedOrgId,
          p_product_id: null,
        });
        if (recalcErr) {
          logger.warn('recalculate_stock_rpc warning after batch:', recalcErr);
        }

        invalidateProducts(resolvedOrgId);
        if (typeof refreshProducts === 'function') {
          await refreshProducts();
        } else if (typeof refreshData === 'function') {
          await refreshData();
        }
      }

      if (errorCount === 0) {
        showToast(
          `تم تصنيع واعتماد ${successCount} صنف بنجاح تحت مرجع الدفعة ${activeBatchRef} ✅`,
          'success'
        );
      } else if (successCount > 0) {
        showToast(
          `تم اعتماد ${successCount} صنف وتعذر ${errorCount} صنف — يمكنك مراجعة الأخطاء وإعادة محاولة المتعثر فقط`,
          'warning'
        );
      } else {
        showToast(`تعذر تنفيذ الدفعة (${errorCount} أخطاء) — راجع رسائل الخطأ بجانب كل صنف`, 'error');
      }
    } catch (err: unknown) {
      logger.error('Batch execution error:', err);
      const errMsg = err instanceof Error ? err.message : 'خطأ غير متوقع';
      showToast('فشل تنفيذ دفعة الإنتاج: ' + errMsg, 'error');
    } finally {
      isSubmittingRef.current = false;
      setExecuting(false);
      setExecutionProgress(null);
    }
  };

  const handleStartNewBatch = () => {
    const whId = defaultWarehouseId || (warehouses[0]?.id ?? '');
    setActiveTab('create');
    setBatchRef(generateBatchReference(productionDate));
    setBatchNotes('');
    setRows([createBlankRow(whId)]);
    setTimeout(() => quickSearchInputRef.current?.focus(), 50);
  };

  const handlePrintBatchReport = (customBatch?: BatchHistoryGroup) => {
    const printWin = window.open('', '_blank', 'width=900,height=700');
    if (!printWin) {
      showToast('يرجى السماح بالنوافذ المنبثقة لطباعة التقرير', 'warning');
      return;
    }

    const titleRef = customBatch ? customBatch.batchNumber : batchRef;
    const dateVal = customBatch ? customBatch.date : productionDate;
    const itemsHtml = customBatch
      ? customBatch.orders
          .map(
            (o, i) => `
          <tr>
            <td>${i + 1}</td>
            <td>${escapeHtml(o.orderNumber)}</td>
            <td>${escapeHtml(o.productName)}</td>
            <td>${escapeHtml(o.sku || '-')}</td>
            <td>${o.qty} ${escapeHtml(o.unit)}</td>
            <td>${o.status === 'completed' ? 'مكتمل ✅' : escapeHtml(o.status)}</td>
          </tr>`
          )
          .join('')
      : validActiveRows
          .map((r, i) => {
            const p = productMap.get(r.productId);
            return `
          <tr>
            <td>${i + 1}</td>
            <td>${escapeHtml(r.orderNumber || '-')}</td>
            <td>${escapeHtml(p?.name || '')}</td>
            <td>${escapeHtml(p?.sku || '-')}</td>
            <td>${r.quantity} ${escapeHtml(p?.unit || 'وحدة')}</td>
            <td>${r.status === 'success' ? 'مكتمل ✅' : r.status === 'error' ? 'فشل' : 'مجدول'}</td>
          </tr>`;
          })
          .join('');

    printWin.document.write(`<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
  <meta charset="utf-8" />
  <title>تقرير دفعة الإنتاج اليومي - ${escapeHtml(titleRef)}</title>
  <style>
    body { font-family: Tahoma, Arial, sans-serif; padding: 24px; color: #1e293b; }
    h1 { font-size: 20px; margin-bottom: 4px; }
    .meta { font-size: 13px; color: #475569; margin-bottom: 16px; }
    table { width: 100%; border-collapse: collapse; margin-top: 12px; font-size: 13px; }
    th, td { border: 1px solid #cbd5e1; padding: 8px 10px; text-align: right; }
    th { background: #f1f5f9; }
    @media print { button { display: none; } }
  </style>
</head>
<body>
  <h1>${escapeHtml(organization?.name || 'TriPro ERP')} — بيان الإنتاج اليومي المجمّع</h1>
  <div class="meta">
    مرجع الدفعة: <strong>${escapeHtml(titleRef)}</strong> |
    تاريخ الإنتاج: <strong>${escapeHtml(dateVal)}</strong>
  </div>
  <table>
    <thead>
      <tr>
        <th>#</th>
        <th>رقم أمر التشغيل</th>
        <th>الصنف</th>
        <th>الكود</th>
        <th>الكمية المنتجة</th>
        <th>الحالة</th>
      </tr>
    </thead>
    <tbody>${itemsHtml}</tbody>
  </table>
  <script>window.print();</script>
</body>
</html>`);
    printWin.document.close();
  };

  return (
    <div className="p-4 md:p-6 bg-slate-50 min-h-screen space-y-6" dir="rtl">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2.5">
            <Factory className="text-amber-600" size={28} />
            أمر الإنتاج اليومي المجمّع (Multi-Product Batch)
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            اختر الأصناف من الجدول أو حمّل تصنيفاً كاملاً (تورتات، جاتوهات، حلويات شرقية) وأدخل الكميات ثم اضغط اعتماد وتصنيع الكل.
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={() => setActiveTab('create')}
            className={`px-4 py-2.5 rounded-xl text-sm font-bold flex items-center gap-2 transition-all ${
              activeTab === 'create'
                ? 'bg-amber-600 text-white shadow-md shadow-amber-200'
                : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
            }`}
          >
            <Layers size={16} />
            شاشة الإدخال والتنفيذ
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('history')}
            className={`px-4 py-2.5 rounded-xl text-sm font-bold flex items-center gap-2 transition-all ${
              activeTab === 'history'
                ? 'bg-slate-800 text-white shadow-md'
                : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
            }`}
          >
            <History size={16} />
            سجل الدفعات السابقة
          </button>
          <button
            type="button"
            onClick={fetchManufacturingMetadata}
            disabled={loadingRecipes}
            className="px-3 py-2.5 rounded-xl bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 text-sm font-bold flex items-center gap-1.5"
            title="تحديث الوصفات والأرصدة"
          >
            <RefreshCw size={15} className={loadingRecipes ? 'animate-spin' : ''} />
            تحديث الوصفات
          </button>
        </div>
      </div>

      {activeTab === 'history' ? (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="p-4 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
            <h2 className="font-bold text-slate-800 flex items-center gap-2">
              <History size={18} className="text-amber-600" />
              أحدث دفعات الإنتاج اليومي المجمّعة
            </h2>
            <button
              type="button"
              onClick={fetchRecentBatches}
              className="text-xs font-bold text-blue-600 hover:underline flex items-center gap-1"
            >
              <RefreshCw size={13} /> تحديث السجل
            </button>
          </div>

          {historyLoading ? (
            <div className="p-16 text-center text-slate-400">
              <Loader2 className="animate-spin mx-auto mb-2 text-amber-600" size={32} />
              جاري تحميل سجل الدفعات...
            </div>
          ) : recentBatches.length === 0 ? (
            <div className="p-16 text-center text-slate-400">
              لا توجد دفعات إنتاج يومي مسجلة حتى الآن.
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {recentBatches.map((batch) => (
                <div key={batch.batchNumber} className="p-4 hover:bg-slate-50/70 transition-colors">
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2.5 flex-wrap">
                        <span className="font-mono font-bold text-amber-700 bg-amber-50 border border-amber-200 px-2.5 py-0.5 rounded-lg text-sm">
                          {batch.batchNumber}
                        </span>
                        <span className="text-xs text-slate-500">تاريخ: {batch.date}</span>
                        <span className="text-xs text-slate-500">• {batch.warehouseName}</span>
                      </div>
                      <p className="text-xs text-slate-600 mt-1.5">
                        عدد الأصناف: <strong>{batch.itemsCount}</strong> | إجمالي الكميات: <strong>{batch.totalQty}</strong> | مكتمل: <strong>{batch.completedCount}/{batch.itemsCount}</strong>
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => handlePrintBatchReport(batch)}
                      className="px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold flex items-center gap-1.5 w-fit"
                    >
                      <Printer size={14} /> طباعة بيان الدفعة
                    </button>
                  </div>

                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {batch.orders.slice(0, 12).map((o) => (
                      <span
                        key={o.id}
                        className="text-xs bg-white border border-slate-200 rounded-md px-2 py-1 text-slate-700"
                      >
                        {o.productName} <strong className="text-emerald-700">×{o.qty}</strong>
                      </span>
                    ))}
                    {batch.orders.length > 12 && (
                      <span className="text-xs text-slate-400 px-2 py-1">
                        +{batch.orders.length - 12} أصناف أخرى
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        <>
          {/* KPI Summary Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
              <div className="text-xs text-slate-500 font-medium">عدد الأصناف بالدفعة</div>
              <div className="text-2xl font-bold text-slate-800 mt-1">
                {validActiveRows.length}
                <span className="text-xs text-slate-400 font-normal mr-1">/ {manufacturableProducts.length} صنف متاح</span>
              </div>
            </div>
            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
              <div className="text-xs text-slate-500 font-medium">إجمالي الوحدات المنتجة</div>
              <div className="text-2xl font-bold text-amber-600 mt-1">{batchCalc.totalUnits.toLocaleString()}</div>
            </div>
            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
              <div className="text-xs text-slate-500 font-medium">التكلفة التقديرية للدفعة</div>
              <div className="text-2xl font-bold text-emerald-700 mt-1">
                {batchCalc.totalEstimatedCost.toLocaleString()} <span className="text-xs font-normal">ج.م</span>
              </div>
            </div>
            <div
              className={`p-4 rounded-2xl border shadow-sm ${
                batchCalc.shortages.length > 0
                  ? 'bg-red-50 border-red-200'
                  : 'bg-emerald-50 border-emerald-200'
              }`}
            >
              <div className="text-xs font-medium text-slate-600">حالة توفر الخامات</div>
              <div
                className={`text-lg font-bold mt-1 flex items-center gap-1.5 ${
                  batchCalc.shortages.length > 0 ? 'text-red-700' : 'text-emerald-700'
                }`}
              >
                {batchCalc.shortages.length > 0 ? (
                  <>
                    <AlertTriangle size={18} />
                    عجز في {batchCalc.shortages.length} خامة
                  </>
                ) : (
                  <>
                    <CheckCircle size={18} />
                    الخامات متوفرة ({batchCalc.materialRequirements.length})
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Batch Metadata & Quick Load Tools */}
          <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200 space-y-5">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1">مرجع الدفعة الموحد</label>
                <div className="flex gap-1.5">
                  <input
                    type="text"
                    value={batchRef}
                    onChange={(e) => setBatchRef(e.target.value)}
                    disabled={executing}
                    className="w-full border border-slate-300 rounded-xl px-3 py-2 text-sm font-mono font-bold text-slate-800 focus:ring-2 focus:ring-amber-500 outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => setBatchRef(generateBatchReference(productionDate))}
                    disabled={executing}
                    className="px-2.5 border border-slate-300 rounded-xl hover:bg-slate-50 text-slate-600"
                    title="توليد مرجع جديد"
                  >
                    <RefreshCw size={15} />
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1">تاريخ الإنتاج</label>
                <input
                  type="date"
                  value={productionDate}
                  onChange={(e) => setProductionDate(e.target.value)}
                  disabled={executing}
                  className="w-full border border-slate-300 rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-amber-500 outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1">المستودع المستهدف الافتراضي</label>
                <select
                  value={defaultWarehouseId}
                  onChange={(e) => handleApplyDefaultWarehouseToAll(e.target.value)}
                  disabled={executing}
                  className="w-full border border-slate-300 rounded-xl px-3 py-2 text-sm bg-white focus:ring-2 focus:ring-amber-500 outline-none"
                >
                  {(typedWarehouses).map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1">ملاحظات الدفعة / الوردية</label>
                <input
                  type="text"
                  value={batchNotes}
                  onChange={(e) => setBatchNotes(e.target.value)}
                  disabled={executing}
                  placeholder="مثال: وردية الصباح - قسم الحلواني"
                  className="w-full border border-slate-300 rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-amber-500 outline-none"
                />
              </div>
            </div>

            {/* Product Add + Category Quick Load + BOM/Routing Selector */}
            <div className="pt-4 border-t border-slate-100 grid grid-cols-1 lg:grid-cols-12 gap-4 items-end">
              <div className="lg:col-span-4">
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  إضافة صنف سريع (بالاسم / الكود / الباركود)
                </label>
                <ProductSearchSelect
                  products={manufacturableProducts}
                  value=""
                  onChange={(prodId, prod) => handleAddProduct(prodId, prod)}
                  clearOnSelect
                  inputRef={quickSearchInputRef}
                  warehouseId={defaultWarehouseId}
                  disabled={executing}
                  placeholder="ابحث عن تورتة، جاتوه، شرقي، أو امسح الباركود..."
                />
              </div>

              <div className="lg:col-span-4">
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  أو تحميل تصنيف كامل دفعة واحدة
                </label>
                <div className="flex gap-2">
                  <select
                    value={selectedCategoryId}
                    onChange={(e) => setSelectedCategoryId(e.target.value)}
                    disabled={executing}
                    className="flex-1 border border-slate-300 rounded-xl px-3 py-2.5 text-sm bg-white focus:ring-2 focus:ring-amber-500 outline-none"
                  >
                    <option value="">-- اختر التصنيف (تورتات / جاتوه / شرقي) --</option>
                    <option value="__ALL__">كل الأصناف المصنّعة ({manufacturableProducts.length})</option>
                    {typedCategories.map((cat) => (
                      <option key={cat.id} value={cat.id}>
                        {cat.name} ({categoryCounts.get(cat.id) || 0})
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={() => handleLoadCategory()}
                    disabled={executing || !selectedCategoryId}
                    className="px-3.5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 disabled:opacity-50 shrink-0"
                  >
                    <FolderPlus size={15} />
                    تحميل
                  </button>
                </div>
              </div>

              <div className="lg:col-span-4">
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-bold text-slate-700 flex items-center gap-1">
                    <GitBranch size={13} className="text-emerald-600" />
                    مسار ومراحل التصنيع (BOM/Routing)
                  </label>
                  <a
                    href="#/mfg/routing-bom"
                    className="text-[11px] font-bold text-emerald-700 hover:underline inline-flex items-center gap-0.5"
                    title="فتح شاشة تعريف مسارات التصنيع وقوائم المواد"
                  >
                    إدارة المسارات <ExternalLink size={10} />
                  </a>
                </div>
                <div className="flex gap-2">
                  <select
                    aria-label="مسار ومراحل التصنيع (BOM/Routing)"
                    value={selectedRoutingProductId}
                    onChange={(e) => {
                      const prodId = e.target.value;
                      if (!prodId) return;
                      handleAddProduct(prodId, productMap.get(prodId));
                      setSelectedRoutingProductId('');
                    }}
                    disabled={executing}
                    className="flex-1 border border-emerald-300 rounded-xl px-3 py-2.5 text-sm bg-white focus:ring-2 focus:ring-emerald-500 outline-none"
                  >
                    <option value="">
                      -- اختر صنفاً له مسار / BOM ({productsWithRoutingOptions.length}) --
                    </option>
                    {productsWithRoutingOptions.map((opt) => (
                      <option key={opt.product.id} value={opt.product.id}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={handleLoadAllWithRouting}
                    disabled={executing || productsWithRoutingOptions.length === 0}
                    className="px-3 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 disabled:opacity-50 shrink-0"
                    title="تحميل كل الأصناف التي لها مسار أو وصفة BOM دفعة واحدة"
                  >
                    <GitBranch size={14} />
                    تحميل الكل ({productsWithRoutingOptions.length})
                  </button>
                </div>
              </div>
            </div>

            {/* Quick Category Chips & Template Actions */}
            <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
              <div className="flex items-center gap-2 flex-wrap">
                {populatedCategories.length > 0 && (
                  <>
                    <span className="text-xs font-bold text-slate-500">تحميل سريع حسب التصنيف:</span>
                    {populatedCategories.map((cat) => (
                      <button
                        key={cat.id}
                        type="button"
                        disabled={executing}
                        onClick={() => handleLoadCategory(cat.id)}
                        className="px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 rounded-lg text-xs font-bold transition-colors disabled:opacity-50"
                      >
                        + {cat.name} ({categoryCounts.get(cat.id) || 0})
                      </button>
                    ))}
                  </>
                )}
              </div>

              <div className="flex gap-2 items-center flex-wrap">
                <button
                  type="button"
                  onClick={() => setShowSaveTemplateBox((prev) => !prev)}
                  disabled={executing || rows.every((r) => !r.productId)}
                  className="px-3 py-2 bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 rounded-xl text-xs font-bold flex items-center gap-1.5 disabled:opacity-50"
                >
                  <Bookmark size={14} />
                  حفظ كقالب وردية
                </button>
                {rows.some((r) => r.productId && Number(r.quantity) === 0) && (
                  <button
                    type="button"
                    onClick={handleClearZeroQtyRows}
                    disabled={executing}
                    className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold flex items-center gap-1.5"
                    title="إزالة الأصناف التي كميتها صفر"
                  >
                    <Eraser size={14} />
                    تنظيف الأصفار
                  </button>
                )}
              </div>
            </div>

            {/* Save Template Drawer */}
            {showSaveTemplateBox && (
              <div className="p-3.5 bg-amber-50/70 border border-amber-200 rounded-xl flex flex-col sm:flex-row items-center gap-3">
                <Sparkles size={18} className="text-amber-600 shrink-0" />
                <input
                  type="text"
                  value={templateNameInput}
                  onChange={(e) => setTemplateNameInput(e.target.value)}
                  placeholder="اسم القالب (مثال: وردية الصباح - تورتات وجاتوهات)"
                  className="flex-1 w-full border border-amber-300 rounded-lg px-3 py-2 text-sm bg-white focus:ring-2 focus:ring-amber-500 outline-none"
                />
                <button
                  type="button"
                  onClick={handleSaveTemplate}
                  className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-xs font-bold shrink-0"
                >
                  حفظ القالب الآن
                </button>
              </div>
            )}

            {/* Saved Templates Bar */}
            {templates.length > 0 && (
              <div className="flex items-center gap-2 flex-wrap pt-2">
                <span className="text-xs font-bold text-slate-500 flex items-center gap-1">
                  <Bookmark size={13} className="text-amber-600" />
                  قوالب الورديات المحفوظة:
                </span>
                {templates.map((tpl) => (
                  <div
                    key={tpl.id}
                    className="inline-flex items-center bg-slate-100 border border-slate-200 rounded-lg overflow-hidden text-xs"
                  >
                    <button
                      type="button"
                      onClick={() => handleLoadTemplate(tpl)}
                      disabled={executing}
                      className="px-2.5 py-1.5 font-bold text-slate-700 hover:bg-amber-50 hover:text-amber-800 transition-colors"
                    >
                      {tpl.name} ({tpl.items.length})
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteTemplate(tpl.id)}
                      disabled={executing}
                      className="px-1.5 py-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors border-r border-slate-200"
                      title="حذف القالب"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Multi-Product Batch Table */}
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-visible">
            <div className="p-4 border-b border-slate-100 bg-slate-50 flex flex-wrap items-center justify-between gap-3 rounded-t-2xl">
              <h2 className="font-bold text-slate-800 flex items-center gap-2">
                <Package size={18} className="text-amber-600" />
                قائمة الأصناف المقرر إنتاجها ({rows.filter((r) => Boolean(r.productId)).length})
              </h2>
              <div className="flex items-center gap-2 flex-wrap">
                <button
                  type="button"
                  onClick={handleAddEmptyRow}
                  disabled={executing}
                  className="px-3.5 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 shadow-sm disabled:opacity-50"
                >
                  <Plus size={14} /> إضافة سطر صنف
                </button>
                {rows.length > 0 && (
                  <>
                    <button
                      type="button"
                      onClick={() => handlePrintBatchReport()}
                      disabled={validActiveRows.length === 0}
                      className="px-3 py-1.5 bg-white border border-slate-200 hover:bg-slate-100 text-slate-700 rounded-lg text-xs font-bold flex items-center gap-1.5 disabled:opacity-50"
                    >
                      <Printer size={14} /> طباعة البيان
                    </button>
                    <button
                      type="button"
                      onClick={handleStartNewBatch}
                      disabled={executing}
                      className="px-3 py-1.5 bg-white border border-slate-200 hover:bg-red-50 hover:text-red-700 text-slate-600 rounded-lg text-xs font-bold flex items-center gap-1.5"
                    >
                      <RotateCcw size={13} /> دفعة جديدة (تصفير)
                    </button>
                  </>
                )}
              </div>
            </div>

            {rows.length === 0 ? (
              <div className="p-12 text-center text-slate-400 space-y-3">
                <Factory size={44} className="mx-auto text-slate-300" />
                <p className="font-bold text-slate-600">ابدأ بإضافة الأصناف المنتجة اليوم</p>
                <p className="text-xs">
                  اضغط على زر "+ إضافة سطر صنف" أو اختر تصنيفاً من الأزرار بالأعلى.
                </p>
                <button
                  type="button"
                  onClick={handleAddEmptyRow}
                  className="inline-flex items-center gap-1.5 px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-bold"
                >
                  <Plus size={14} /> إضافة سطر صنف الآن
                </button>
              </div>
            ) : (
              <div className="overflow-x-auto overflow-y-visible">
                <table className="w-full text-right text-sm">
                  <thead>
                    <tr className="bg-slate-50 text-slate-500 text-xs border-b border-slate-200">
                      <th className="p-3 w-10 text-center">#</th>
                      <th className="p-3 min-w-[260px]">الصنف المصنّع وجاهزية الوصفة</th>
                      <th className="p-3">التصنيف</th>
                      <th className="p-3 w-44 text-center">الكمية المنتجة</th>
                      <th className="p-3">المستودع</th>
                      <th className="p-3 text-center">التكلفة التقديرية</th>
                      <th className="p-3">ملاحظات الصنف</th>
                      <th className="p-3 text-center">الحالة</th>
                      <th className="p-3 w-12 text-center">حذف</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {rows.map((row, idx) => {
                      const prod = row.productId ? productMap.get(row.productId) : undefined;
                      const recipe = row.productId ? batchCalc.recipeByProductId.get(row.productId) : undefined;
                      const unitCost = recipe?.estimatedUnitCost || 0;
                      const lineCost = Number((unitCost * (Number(row.quantity) || 0)).toFixed(2));
                      const categoryName = prod ? getCategoryNameById(categories, prod.category_id) : '-';

                      return (
                        <tr
                          key={row.rowId}
                          className={`transition-colors ${
                            row.status === 'success'
                              ? 'bg-emerald-50/50'
                              : row.status === 'error'
                              ? 'bg-red-50/60'
                              : row.status === 'running'
                              ? 'bg-amber-50/70'
                              : 'hover:bg-slate-50/80'
                          }`}
                        >
                          <td className="p-3 text-center font-mono text-xs text-slate-400">{idx + 1}</td>
                          <td className="p-3">
                            {!row.productId ? (
                              <ProductSearchSelect
                                products={manufacturableProducts}
                                value={row.productId}
                                onChange={(newProdId) => {
                                  if (!newProdId) return;
                                  const duplicate = rows.some((r) => r.rowId !== row.rowId && r.productId === newProdId);
                                  if (duplicate) {
                                    showToast('هذا الصنف مضاف بالفعل في صف آخر', 'warning');
                                    return;
                                  }
                                  handleUpdateRow(row.rowId, { productId: newProdId, status: 'idle' });
                                }}
                                warehouseId={row.warehouseId || defaultWarehouseId}
                                disabled={executing}
                                placeholder="اختر الصنف المصنّع (تورتة / جاتوه / شرقي)..."
                              />
                            ) : (
                              <>
                                <div className="font-bold text-slate-800">{prod?.name || 'صنف غير معروف'}</div>
                                <div className="flex items-center gap-2 mt-1 flex-wrap text-[11px]">
                                  {prod?.sku && (
                                    <span className="font-mono bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded">
                                      {prod.sku}
                                    </span>
                                  )}
                                  {recipe?.source === 'routing' && (
                                    <span className="bg-emerald-50 text-emerald-700 border border-emerald-200 px-1.5 py-0.5 rounded font-bold">
                                      مسار + وصفة ({recipe.materials.length} خامة)
                                    </span>
                                  )}
                                  {recipe?.source === 'bom' && (
                                    <span className="bg-blue-50 text-blue-700 border border-blue-200 px-1.5 py-0.5 rounded font-bold">
                                      BOM ({recipe.materials.length} خامة)
                                    </span>
                                  )}
                                  {(!recipe || recipe.source === 'none') && (
                                    <a
                                      href={`#/mfg/routing-bom?productId=${row.productId}`}
                                      className="bg-red-50 text-red-700 border border-red-200 px-1.5 py-0.5 rounded font-bold inline-flex items-center gap-1 hover:bg-red-100"
                                    >
                                      ⚠️ بدون وصفة تصنيع <ExternalLink size={10} />
                                    </a>
                                  )}
                                </div>
                              </>
                            )}
                          </td>
                          <td className="p-3 text-xs text-slate-600">{categoryName}</td>
                          <td className="p-3">
                            <div className="flex items-center justify-center gap-1">
                              <input
                                type="number"
                                min="0"
                                step="any"
                                aria-label={`كمية ${prod?.name || idx + 1}`}
                                value={row.quantity}
                                disabled={executing || row.status === 'success'}
                                onChange={(e) => {
                                  const val = e.target.value === '' ? 0 : parseFloat(e.target.value);
                                  handleUpdateRow(row.rowId, {
                                    quantity: Number.isFinite(val) && val >= 0 ? val : 0,
                                  });
                                }}
                                className="w-24 border border-slate-300 rounded-lg px-2.5 py-1.5 text-center font-bold text-slate-800 focus:ring-2 focus:ring-amber-500 outline-none bg-white"
                              />
                              <span className="text-xs text-slate-500">{prod?.unit || 'وحدة'}</span>
                            </div>
                          </td>
                          <td className="p-3">
                            <select
                              value={row.warehouseId || defaultWarehouseId}
                              disabled={executing || row.status === 'success'}
                              onChange={(e) => handleUpdateRow(row.rowId, { warehouseId: e.target.value })}
                              className="border border-slate-300 rounded-lg px-2 py-1.5 text-xs bg-white focus:ring-2 focus:ring-amber-500 outline-none"
                            >
                              {typedWarehouses.map((w) => (
                                <option key={w.id} value={w.id}>
                                  {w.name}
                                </option>
                              ))}
                            </select>
                          </td>
                          <td className="p-3 text-center">
                            <div className="font-bold text-slate-800">{lineCost.toLocaleString()} ج.م</div>
                            <div className="text-[10px] text-slate-400">للوحدة: {unitCost.toLocaleString()}</div>
                          </td>
                          <td className="p-3">
                            <input
                              type="text"
                              value={row.notes}
                              disabled={executing || row.status === 'success'}
                              onChange={(e) => handleUpdateRow(row.rowId, { notes: e.target.value })}
                              placeholder="ملاحظة..."
                              className="w-full min-w-[110px] border border-slate-200 rounded-lg px-2 py-1 text-xs focus:ring-2 focus:ring-amber-500 outline-none bg-white"
                            />
                          </td>
                          <td className="p-3 text-center">
                            {row.status === 'running' && (
                              <span className="inline-flex items-center gap-1 text-xs font-bold text-amber-700">
                                <Loader2 size={14} className="animate-spin" /> جاري...
                              </span>
                            )}
                            {row.status === 'success' && (
                              <div className="inline-flex flex-col items-center">
                                <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-700">
                                  <CheckCircle size={14} /> تم
                                </span>
                                {row.orderNumber && (
                                  <span className="text-[10px] font-mono text-slate-500">{row.orderNumber}</span>
                                )}
                              </div>
                            )}
                            {row.status === 'error' && (
                              <span
                                className="inline-flex items-center gap-1 text-xs font-bold text-red-700 cursor-help"
                                title={row.errorMessage}
                              >
                                <XCircle size={14} /> {row.errorMessage || 'فشل'}
                              </span>
                            )}
                            {(!row.status || row.status === 'idle') && (
                              <span className="text-xs text-slate-400">جاهز</span>
                            )}
                          </td>
                          <td className="p-3 text-center">
                            <button
                              type="button"
                              onClick={() => handleRemoveRow(row.rowId)}
                              disabled={executing || row.status === 'success'}
                              className="p-1.5 text-slate-400 hover:text-red-600 rounded-lg hover:bg-red-50 disabled:opacity-30"
                              title="حذف الصنف"
                            >
                              <Trash2 size={15} />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Pre-flight Raw Materials Availability Panel */}
          {batchCalc.materialRequirements.length > 0 && (
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
              <div className="p-4 border-b border-slate-100 bg-slate-50 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="font-bold text-slate-800 flex items-center gap-2">
                    <AlertCircle
                      size={18}
                      className={batchCalc.shortages.length > 0 ? 'text-red-600' : 'text-emerald-600'}
                    />
                    فحص احتياجات وتوفر المواد الخام المجمّعة ({batchCalc.materialRequirements.length} خامة)
                  </h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    تجميع آلي لكل الخامات المطلوبة لإنتاج الأصناف المحددة أعلاه ومقارنتها بالرصيد الفعلي في المخزن.
                  </p>
                </div>

                <div className="flex items-center gap-3">
                  {batchCalc.shortages.length > 0 && (
                    <label className="inline-flex items-center gap-2 text-xs font-bold text-amber-800 bg-amber-50 border border-amber-200 px-3 py-1.5 rounded-lg cursor-pointer">
                      <input
                        type="checkbox"
                        checked={allowShortageExecution}
                        onChange={(e) => setAllowShortageExecution(e.target.checked)}
                        className="rounded text-amber-600"
                      />
                      السماح بالتصنيع رغم العجز (البيع/الصرف بالسالب)
                    </label>
                  )}
                  <button
                    type="button"
                    onClick={() => setShowMaterialsDetail((prev) => !prev)}
                    className="text-xs font-bold text-blue-600 hover:underline"
                  >
                    {showMaterialsDetail ? 'إخفاء التفاصيل' : 'عرض التفاصيل'}
                  </button>
                </div>
              </div>

              {showMaterialsDetail && (
                <div className="overflow-x-auto max-h-80">
                  <table className="w-full text-right text-xs">
                    <thead className="sticky top-0 bg-slate-100 text-slate-600">
                      <tr>
                        <th className="p-3">المادة الخام</th>
                        <th className="p-3 text-center">إجمالي الاحتياج</th>
                        <th className="p-3 text-center">الرصيد المتاح</th>
                        <th className="p-3 text-center">العجز / الحالة</th>
                        <th className="p-3 text-center">التكلفة التقديرية</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {batchCalc.materialRequirements.map((mat) => (
                        <tr
                          key={mat.rawMaterialId}
                          className={mat.shortageQty > 0 ? 'bg-red-50/70' : 'hover:bg-slate-50'}
                        >
                          <td className="p-3 font-bold text-slate-800">
                            {mat.materialName}
                            {mat.sku && (
                              <span className="font-mono text-[10px] text-slate-400 mr-1.5">[{mat.sku}]</span>
                            )}
                          </td>
                          <td className="p-3 text-center font-bold">
                            {mat.requiredQty.toLocaleString()} {mat.unit}
                          </td>
                          <td className="p-3 text-center text-slate-600">
                            {mat.availableStock.toLocaleString()} {mat.unit}
                          </td>
                          <td className="p-3 text-center">
                            {mat.shortageQty > 0 ? (
                              <span className="bg-red-100 text-red-700 px-2 py-0.5 rounded-full font-bold">
                                عجز {mat.shortageQty.toLocaleString()} {mat.unit}
                              </span>
                            ) : (
                              <span className="bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full font-bold">
                                متوفر ✅
                              </span>
                            )}
                          </td>
                          <td className="p-3 text-center font-bold text-slate-700">
                            {mat.estimatedCost.toLocaleString()} ج.م
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* Execution Bar */}
          <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200 flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="text-sm text-slate-600">
              {executionProgress ? (
                <div className="flex items-center gap-3 font-bold text-amber-700">
                  <Loader2 className="animate-spin" size={20} />
                  <span>
                    جاري تصنيع ({executionProgress.current} / {executionProgress.total}):{' '}
                    {executionProgress.currentProductName}
                  </span>
                </div>
              ) : (
                <span>
                  سيتم إنشاء أوامر إنتاج مكتملة بمرجع موحد (<strong className="font-mono">{batchRef}</strong>) وخصم الخامات وإثبات المنتج التام وإعادة احتساب التكلفة المرجحة (WAC).
                </span>
              )}
            </div>

            <div className="flex items-center gap-3 shrink-0">
              {failedRows.length > 0 && !executing && (
                <button
                  type="button"
                  onClick={() => handleExecuteBatch(true)}
                  className="bg-rose-600 hover:bg-rose-700 text-white px-5 py-3 rounded-xl font-bold text-sm flex items-center gap-2 shadow-md"
                >
                  <RotateCcw size={17} />
                  إعادة محاولة المتعثر ({failedRows.length})
                </button>
              )}

              <button
                type="button"
                onClick={() => handleExecuteBatch(false)}
                disabled={executing || validActiveRows.length === 0}
                className="bg-emerald-600 hover:bg-emerald-700 text-white px-7 py-3 rounded-xl font-bold text-sm flex items-center gap-2 shadow-lg shadow-emerald-100 transition-all disabled:opacity-50"
              >
                {executing ? <Loader2 className="animate-spin" size={18} /> : <Play size={18} />}
                اعتماد وتصنيع الكل ({validActiveRows.filter((r) => r.status !== 'success').length})
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default DailyBatchProduction;

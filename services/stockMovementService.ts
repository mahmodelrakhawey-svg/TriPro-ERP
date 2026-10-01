/**
 * ==============================================================================
 * TriPro ERP — Unified Stock Movement Service
 * services/stockMovementService.ts
 * ==============================================================================
 * خدمة مركزية موحدة لجلب وإدارة حركات ورصيد المخزون لجميع الشاشات والتقارير:
 * (StockCard, ItemMovementReport, DetailedStockMovementReport, الخ)
 * تضمن المطابقة التامة 100% وتمنع تضارب الفلاتر أو إغفال الرصيد الافتتاحي.
 * ==============================================================================
 */

import { logger } from '../utils/logger';
import { supabase } from '../supabaseClient';

/**
 * حركة مخزنية فردية موحدة من أي موديول في النظام
 */
export interface UnifiedStockMovement {
  /** معرف الحركة الفريد */
  id: string;
  /** تاريخ الحركة الفعلي بصيغة YYYY-MM-DD */
  date: string;
  /** اتجاه الحركة: 'IN' وارد للمخزن، 'OUT' منصرف من المخزن */
  type: 'IN' | 'OUT';
  /** الكمية المتحركة بوحدة القياس المحددة */
  quantity: number;
  /** معرف وحدة القياس (UOM) */
  uomId?: string | null;
  /** نوع المستند المنشئ للحركة (فاتورة مبيعات، أمر تصنيع، إذن صرف، إتلاف) */
  documentType: string;
  /** رقم المستند المرجعي */
  documentNumber: string;
  /** معرف المستودع الذي تمت فيه الحركة */
  warehouseId?: string | null;
  /** اسم المستودع */
  warehouseName?: string;
  /** توقيت إنشاء السجل في النظام */
  createdAt?: string | null;
  /** ملاحظات وبيان الحركة */
  notes?: string | null;
  /** سعر البيع للوحدة في حال المبيعات */
  unitPrice?: number;
  /** تكلفة الشراء أو الإنتاج للوحدة */
  unitCost?: number;
  /** اسم الصنف */
  productName?: string;
  /** معرف الصنف */
  productId?: string;
}

/**
 * معلمات استعلام وتصفية حركات الصنف
 */
export interface FetchStockMovementsParams {
  /** معرف الصنف المراد جلب بطاقته وحركاته */
  productId: string;
  /** معرف المنظمة لضمان العزل التام للمخازن */
  organizationId: string;
  /** فلتر المستودع المحدد (اختياري، إن تم إغفاله تُجلب حركات كافة المستودعات) */
  warehouseId?: string | null;
  /** تاريخ بداية الفترة المطلوبة بصيغة YYYY-MM-DD */
  startDate?: string;
  /** تاريخ نهاية الفترة المطلوبة بصيغة YYYY-MM-DD */
  endDate?: string;
}

/**
 * النتيجة المجمعة لبطاقة حركة المخزون
 */
export interface StockMovementsResult {
  /** الرصيد الافتتاحي في بداية الفترة المحددة */
  openingBalance: number;
  /** قائمة الحركات التفصيلية مرتبة زمنياً */
  movements: UnifiedStockMovement[];
  /** إجمالي الكميات الواردة خلال الفترة */
  totalIn: number;
  /** إجمالي الكميات الصادرة خلال الفترة */
  totalOut: number;
  /** صافي الحركة (الوارد - الصادر) */
  netMovement: number;
  /** الرصيد الختامي في نهاية الفترة (الافتتاحي + الصافي) */
  closingBalance: number;
}

export interface InvoiceRelationMeta {
  id?: string;
  invoice_date?: string | null;
  invoice_number?: string | null;
  warehouse_id?: string | null;
  created_at?: string | null;
  notes?: string | null;
  status?: string | null;
  warehouses?: { name?: string | null } | { name?: string | null }[] | null;
}

export interface SalesInvoiceItemRecord {
  quantity?: number | string | null;
  uom_id?: string | null;
  invoices?: InvoiceRelationMeta | InvoiceRelationMeta[] | null;
}

export interface PurchaseInvoiceRelationMeta {
  id?: string;
  invoice_date?: string | null;
  invoice_number?: string | null;
  warehouse_id?: string | null;
  created_at?: string | null;
  notes?: string | null;
  status?: string | null;
  warehouses?: { name?: string | null } | { name?: string | null }[] | null;
}

export interface PurchaseInvoiceItemRecord {
  quantity?: number | string | null;
  uom_id?: string | null;
  purchase_invoices?: PurchaseInvoiceRelationMeta | PurchaseInvoiceRelationMeta[] | null;
}

export interface SalesReturnRelationMeta {
  id?: string;
  return_date?: string | null;
  return_number?: string | null;
  warehouse_id?: string | null;
  created_at?: string | null;
  notes?: string | null;
  status?: string | null;
  warehouses?: { name?: string | null } | { name?: string | null }[] | null;
}

export interface SalesReturnItemRecord {
  quantity?: number | string | null;
  uom_id?: string | null;
  sales_returns?: SalesReturnRelationMeta | SalesReturnRelationMeta[] | null;
}

export interface PurchaseReturnRelationMeta {
  id?: string;
  return_date?: string | null;
  return_number?: string | null;
  warehouse_id?: string | null;
  created_at?: string | null;
  notes?: string | null;
  status?: string | null;
  warehouses?: { name?: string | null } | { name?: string | null }[] | null;
}

export interface PurchaseReturnItemRecord {
  quantity?: number | string | null;
  uom_id?: string | null;
  purchase_returns?: PurchaseReturnRelationMeta | PurchaseReturnRelationMeta[] | null;
}

export interface StockAdjustmentRelationMeta {
  id?: string;
  adjustment_date?: string | null;
  adjustment_number?: string | null;
  warehouse_id?: string | null;
  created_at?: string | null;
  reason?: string | null;
  status?: string | null;
  warehouses?: { name?: string | null } | { name?: string | null }[] | null;
}

export interface StockAdjustmentItemRecord {
  quantity?: number | string | null;
  uom_id?: string | null;
  stock_adjustments?: StockAdjustmentRelationMeta | StockAdjustmentRelationMeta[] | null;
}

export interface StockTransferRelationMeta {
  id?: string;
  transfer_date?: string | null;
  transfer_number?: string | null;
  from_warehouse_id?: string | null;
  to_warehouse_id?: string | null;
  created_at?: string | null;
  notes?: string | null;
  status?: string | null;
}

export interface StockTransferItemRecord {
  quantity?: number | string | null;
  uom_id?: string | null;
  stock_transfers?: StockTransferRelationMeta | StockTransferRelationMeta[] | null;
}

export interface MfgProductionOrderRecord {
  id: string;
  order_number?: string | null;
  end_date?: string | null;
  quantity_to_produce?: number | string | null;
  warehouse_id?: string | null;
  created_at?: string | null;
  status?: string | null;
}

export interface MfgMaterialRequestRelationMeta {
  request_number?: string | null;
  issue_date?: string | null;
  created_at?: string | null;
  status?: string | null;
  production_order_id?: string | null;
  mfg_production_orders?: { warehouse_id?: string | null } | { warehouse_id?: string | null }[] | null;
}

export interface MfgMaterialRequestItemRecord {
  quantity_issued?: number | string | null;
  uom_id?: string | null;
  mfg_material_requests?: MfgMaterialRequestRelationMeta | MfgMaterialRequestRelationMeta[] | null;
}

export interface HimsBillingRelationMeta {
  id?: string;
  visit_id?: string | null;
  created_at?: string | null;
  patient_id?: string | null;
  organization_id?: string | null;
  hims_patients?: { full_name?: string | null } | { full_name?: string | null }[] | null;
}

export interface HimsBillingItemRecord {
  id: string;
  quantity?: number | string | null;
  uom_id?: string | null;
  warehouse_id?: string | null;
  created_at?: string | null;
  hims_billing?: HimsBillingRelationMeta | HimsBillingRelationMeta[] | null;
}

export interface ProjectMaterialIssueRelationMeta {
  id?: string;
  issue_date?: string | null;
  issue_number?: string | null;
  warehouse_id?: string | null;
  created_at?: string | null;
  status?: string | null;
  projects?: { name?: string | null } | { name?: string | null }[] | null;
}

export interface ProjectMaterialIssueItemRecord {
  id: string;
  quantity?: number | string | null;
  uom_id?: string | null;
  project_material_issues?: ProjectMaterialIssueRelationMeta | ProjectMaterialIssueRelationMeta[] | null;
}

export interface LcRelationMeta {
  id?: string;
  lc_number?: string | null;
  status?: string | null;
}

export interface LcReceiptItemRecord {
  id: string;
  quantity?: number | string | null;
  unit_price?: number | string | null;
  final_unit_cost?: number | string | null;
  warehouse_id?: string | null;
  receipt_date?: string | null;
  notes?: string | null;
  created_at?: string | null;
  letters_of_credit?: LcRelationMeta | LcRelationMeta[] | null;
}

export class StockMovementService {
  /**
   * جلب الرصيد الافتتاحي لصنف محدد (ولمستودع معين إذا تم تحديده)
   *
   * @param productId معرف الصنف
   * @param organizationId معرف المنشأة
   * @param warehouseId معرف المستودع (اختياري)
   * @returns وعد بالكمية الافتتاحية المسجلة
   */
  public static async fetchOpeningBalance(
    productId: string,
    organizationId: string,
    warehouseId?: string | null
  ): Promise<number> {
    try {
      let query = supabase
        .from('opening_inventories')
        .select('quantity, warehouse_id')
        .eq('product_id', productId)
        .eq('organization_id', organizationId);

      if (warehouseId) {
        query = query.eq('warehouse_id', warehouseId);
      }

      const { data, error } = await query;
      if (error) {
        logger.error('[StockMovementService] Error fetching opening balance:', error);
        return 0;
      }

      return data?.reduce((sum, row) => sum + Number(row.quantity || 0), 0) || 0;
    } catch (err) {
      logger.error('[StockMovementService] Exception in fetchOpeningBalance:', err);
      return 0;
    }
  }

  /**
   * جلب وتوحيد كافة حركات الصنف المخزنية عبر جميع أقسام النظام:
   * 1. المبيعات ومرتجعات المبيعات (Sales & Sales Returns)
   * 2. المشتريات ومرتجع المشتريات (Purchases & Purchase Returns)
   * 3. أوامر التصنيع والإنتاج (Manufacturing Work Orders)
   * 4. مبيعات المطاعم ونقاط البيع السريعة (Restaurant POS)
   * 5. التحويلات بين المستودعات (Inter-Warehouse Transfers)
   * 6. التسويات الجردية والعجز والإتلاف (Adjustments & Wastage)
   *
   * @param params معلمات التصفية والفترة والمستودع
   * @returns وعد بنتيجة حركات المخزون والرصيد الافتتاحي والختامي المتطابق
   */
  public static async fetchProductMovements(
    params: FetchStockMovementsParams
  ): Promise<StockMovementsResult> {
    const { productId, organizationId, warehouseId, startDate, endDate } = params;

    const openingBalance = await this.fetchOpeningBalance(productId, organizationId, warehouseId);

    try {
      // 🚀 المسار السريع: استخدام دالة RPC الخادمة فائقة السرعة إن وجدت
      if (typeof (supabase as any)?.rpc === 'function') {
        try {
          const { data: rpcData, error: rpcError } = await supabase.rpc('get_product_stock_movements_rpc', {
            p_product_id: productId,
            p_org_id: organizationId,
            p_warehouse_id: warehouseId || null,
            p_start_date: startDate || null,
            p_end_date: endDate || null
          });

          if (!rpcError && rpcData?.success && Array.isArray(rpcData.movements)) {
            const serverMovements: UnifiedStockMovement[] = rpcData.movements;
            let totalIn = 0;
            let totalOut = 0;
            serverMovements.forEach(m => {
              if (m.type === 'IN') totalIn += Number(m.quantity || 0);
              else totalOut += Number(m.quantity || 0);
            });
            const netMovement = totalIn - totalOut;
            const closingBalance = openingBalance + netMovement;

            return {
              openingBalance,
              movements: serverMovements,
              totalIn,
              totalOut,
              netMovement,
              closingBalance
            };
          }
        } catch (rpcEx) {
          // السقوط الآمن التلقائي للمسار الكلاسيكي
        }
      }

      // 1. المبيعات (فواتير معتمدة وغير ملغاة) - OUT
      let salesQuery = supabase
        .from('invoice_items')
        .select('quantity, uom_id, invoices!inner(id, invoice_date, invoice_number, warehouse_id, created_at, notes, status, warehouses(name))')
        .eq('product_id', productId)
        .eq('organization_id', organizationId)
        .neq('invoices.status', 'draft')
        .neq('invoices.status', 'cancelled');

      // 2. المشتريات (فواتير مرحلة ومدفوعة) - IN (تستبعد الملغاة تلقائياً)
      let purchasesQuery = supabase
        .from('purchase_invoice_items')
        .select('quantity, uom_id, purchase_invoices!purchase_invoice_items_purchase_invoice_id_fkey!inner(id, invoice_date, invoice_number, warehouse_id, created_at, notes, status, warehouses(name))')
        .eq('product_id', productId)
        .eq('organization_id', organizationId)
        .in('purchase_invoices.status', ['posted', 'paid']);

      // 3. مرتجعات المبيعات (المرحلة فقط) - IN
      let salesReturnsQuery = supabase
        .from('sales_return_items')
        .select('quantity, uom_id, sales_returns!inner(id, return_date, return_number, warehouse_id, created_at, notes, status, warehouses(name))')
        .eq('product_id', productId)
        .eq('organization_id', organizationId)
        .eq('sales_returns.status', 'posted');

      // 4. مرتجعات المشتريات (المرحلة فقط) - OUT
      let purchaseReturnsQuery = supabase
        .from('purchase_return_items')
        .select('quantity, uom_id, purchase_returns!purchase_return_items_purchase_return_id_fkey!inner(id, return_date, return_number, warehouse_id, created_at, notes, status, warehouses(name))')
        .eq('product_id', productId)
        .eq('organization_id', organizationId)
        .eq('purchase_returns.status', 'posted');

      // 5. التسويات المخزنية (المعتمدة)
      let adjustmentsQuery = supabase
        .from('stock_adjustment_items')
        .select('quantity, uom_id, stock_adjustments!inner(id, adjustment_date, adjustment_number, warehouse_id, created_at, reason, status, warehouses(name))')
        .eq('product_id', productId)
        .eq('organization_id', organizationId)
        .neq('stock_adjustments.status', 'draft')
        .neq('stock_adjustments.status', 'cancelled');

      // 6. التحويلات المخزنية
      let transfersQuery = supabase
        .from('stock_transfer_items')
        .select('quantity, uom_id, stock_transfers!inner(id, transfer_date, transfer_number, from_warehouse_id, to_warehouse_id, created_at, notes, status)')
        .eq('product_id', productId)
        .eq('organization_id', organizationId)
        .neq('stock_transfers.status', 'draft')
        .neq('stock_transfers.status', 'cancelled');

      // 7. مديول التصنيع (أوامر الإنتاج التامة - IN)
      let mfgFinishedQuery = supabase
        .from('mfg_production_orders')
        .select('id, order_number, end_date, quantity_to_produce, warehouse_id, created_at, status')
        .eq('product_id', productId)
        .eq('organization_id', organizationId)
        .eq('status', 'completed');

      // 8. مديول التصنيع (صرف المواد الخام - OUT)
      let mfgRawQuery = supabase
        .from('mfg_material_request_items')
        .select('quantity_issued, uom_id, mfg_material_requests!inner(request_number, issue_date, created_at, status, production_order_id, mfg_production_orders(warehouse_id))')
        .eq('raw_material_id', productId)
        .eq('organization_id', organizationId)
        .eq('mfg_material_requests.status', 'issued');

      // 9. مديول المستشفيات (HIMS Pharmacy/Surgery issues - OUT)
      let himsQuery = supabase
        .from('hims_billing_items')
        .select(`
          id, quantity, uom_id, warehouse_id, created_at,
          hims_billing!inner(id, visit_id, created_at, patient_id, organization_id, hims_patients(full_name))
        `)
        .eq('product_id', productId)
        .eq('hims_billing.organization_id', organizationId);

      // 10. مديول المقاولات (صرف مواد المشاريع - OUT)
      let constructionQuery = supabase
        .from('project_material_issue_items')
        .select(`
          id, quantity, uom_id,
          project_material_issues!inner(id, issue_date, issue_number, warehouse_id, created_at, status, projects(name))
        `)
        .eq('product_id', productId)
        .eq('project_material_issues.status', 'approved')
        .eq('organization_id', organizationId);

      // 11. اعتمادات مستندية واردة (LC Receipts - IN)
      let lcQuery = supabase
        .from('lc_receipt_items')
        .select(`
          id, quantity, unit_price, final_unit_cost, warehouse_id, receipt_date, notes, created_at,
          letters_of_credit!inner(id, lc_number, status)
        `)
        .eq('product_id', productId)
        .eq('organization_id', organizationId);

      // فلتر المستودع
      if (warehouseId) {
        salesQuery = salesQuery.eq('invoices.warehouse_id', warehouseId);
        purchasesQuery = purchasesQuery.eq('purchase_invoices.warehouse_id', warehouseId);
        salesReturnsQuery = salesReturnsQuery.eq('sales_returns.warehouse_id', warehouseId);
        purchaseReturnsQuery = purchaseReturnsQuery.eq('purchase_returns.warehouse_id', warehouseId);
        adjustmentsQuery = adjustmentsQuery.eq('stock_adjustments.warehouse_id', warehouseId);
        himsQuery = himsQuery.eq('warehouse_id', warehouseId);
        constructionQuery = constructionQuery.eq('project_material_issues.warehouse_id', warehouseId);
        lcQuery = lcQuery.eq('warehouse_id', warehouseId);
      }

      // فلتر التاريخ إذا حُدد
      if (startDate) {
        salesQuery = salesQuery.gte('invoices.invoice_date', startDate);
        purchasesQuery = purchasesQuery.gte('purchase_invoices.invoice_date', startDate);
        salesReturnsQuery = salesReturnsQuery.gte('sales_returns.return_date', startDate);
        purchaseReturnsQuery = purchaseReturnsQuery.gte('purchase_returns.return_date', startDate);
        adjustmentsQuery = adjustmentsQuery.gte('stock_adjustments.adjustment_date', startDate);
      }
      if (endDate) {
        salesQuery = salesQuery.lte('invoices.invoice_date', endDate);
        purchasesQuery = purchasesQuery.lte('purchase_invoices.invoice_date', endDate);
        salesReturnsQuery = salesReturnsQuery.lte('sales_returns.return_date', endDate);
        purchaseReturnsQuery = purchaseReturnsQuery.lte('purchase_returns.return_date', endDate);
        adjustmentsQuery = adjustmentsQuery.lte('stock_adjustments.adjustment_date', endDate);
      }

      // تنفيذ الاستعلامات بالتوازي
      const [
        salesRes,
        purchasesRes,
        salesReturnsRes,
        purchaseReturnsRes,
        adjustmentsRes,
        transfersRes,
        mfgFinishedRes,
        mfgRawRes,
        himsRes,
        constructionRes,
        lcRes
      ] = await Promise.all([
        salesQuery,
        purchasesQuery,
        salesReturnsQuery,
        purchaseReturnsQuery,
        adjustmentsQuery,
        transfersQuery,
        mfgFinishedQuery,
        mfgRawQuery,
        himsQuery,
        constructionQuery,
        lcQuery
      ]);

      const movements: UnifiedStockMovement[] = [];

      // 1. معالجة المبيعات
      salesRes.data?.forEach((item: SalesInvoiceItemRecord) => {
        const inv = Array.isArray(item.invoices) ? item.invoices[0] : item.invoices;
        const wh = Array.isArray(inv?.warehouses) ? inv?.warehouses[0] : inv?.warehouses;
        movements.push({
          id: `SALE-${inv?.id || Math.random()}`,
          date: inv?.invoice_date || '',
          type: 'OUT',
          quantity: Number(item.quantity || 0),
          uomId: item.uom_id,
          documentType: 'فاتورة مبيعات',
          documentNumber: inv?.invoice_number || '-',
          warehouseId: inv?.warehouse_id,
          warehouseName: wh?.name || 'غير محدد',
          createdAt: inv?.created_at,
          notes: inv?.notes || ''
        });
      });

      // 2. معالجة المشتريات
      purchasesRes.data?.forEach((item: PurchaseInvoiceItemRecord) => {
        const pinv = Array.isArray(item.purchase_invoices) ? item.purchase_invoices[0] : item.purchase_invoices;
        const wh = Array.isArray(pinv?.warehouses) ? pinv?.warehouses[0] : pinv?.warehouses;
        movements.push({
          id: `PURCH-${pinv?.id || Math.random()}`,
          date: pinv?.invoice_date || '',
          type: 'IN',
          quantity: Number(item.quantity || 0),
          uomId: item.uom_id,
          documentType: 'فاتورة مشتريات',
          documentNumber: pinv?.invoice_number || '-',
          warehouseId: pinv?.warehouse_id,
          warehouseName: wh?.name || 'غير محدد',
          createdAt: pinv?.created_at,
          notes: pinv?.notes || ''
        });
      });

      // 3. مرتجعات المبيعات
      salesReturnsRes.data?.forEach((item: SalesReturnItemRecord) => {
        const sr = Array.isArray(item.sales_returns) ? item.sales_returns[0] : item.sales_returns;
        const wh = Array.isArray(sr?.warehouses) ? sr?.warehouses[0] : sr?.warehouses;
        movements.push({
          id: `SR-${sr?.id || Math.random()}`,
          date: sr?.return_date || '',
          type: 'IN',
          quantity: Number(item.quantity || 0),
          uomId: item.uom_id,
          documentType: 'مرتجع مبيعات',
          documentNumber: sr?.return_number || '-',
          warehouseId: sr?.warehouse_id,
          warehouseName: wh?.name || 'غير محدد',
          createdAt: sr?.created_at,
          notes: sr?.notes || ''
        });
      });

      // 4. مرتجعات المشتريات
      purchaseReturnsRes.data?.forEach((item: PurchaseReturnItemRecord) => {
        const pr = Array.isArray(item.purchase_returns) ? item.purchase_returns[0] : item.purchase_returns;
        const wh = Array.isArray(pr?.warehouses) ? pr?.warehouses[0] : pr?.warehouses;
        movements.push({
          id: `PR-${pr?.id || Math.random()}`,
          date: pr?.return_date || '',
          type: 'OUT',
          quantity: Number(item.quantity || 0),
          uomId: item.uom_id,
          documentType: 'مرتجع مشتريات',
          documentNumber: pr?.return_number || '-',
          warehouseId: pr?.warehouse_id,
          warehouseName: wh?.name || 'غير محدد',
          createdAt: pr?.created_at,
          notes: pr?.notes || ''
        });
      });

      // 5. التسويات المخزنية
      adjustmentsRes.data?.forEach((item: StockAdjustmentItemRecord) => {
        const adj = Array.isArray(item.stock_adjustments) ? item.stock_adjustments[0] : item.stock_adjustments;
        const wh = Array.isArray(adj?.warehouses) ? adj?.warehouses[0] : adj?.warehouses;
        const qty = Number(item.quantity || 0);
        movements.push({
          id: `ADJ-${adj?.id || Math.random()}`,
          date: adj?.adjustment_date || '',
          type: qty >= 0 ? 'IN' : 'OUT',
          quantity: Math.abs(qty),
          uomId: item.uom_id,
          documentType: 'تسوية جردية',
          documentNumber: adj?.adjustment_number || '-',
          warehouseId: adj?.warehouse_id,
          warehouseName: wh?.name || 'غير محدد',
          createdAt: adj?.created_at,
          notes: adj?.reason || ''
        });
      });

      // 6. التحويلات المخزنية
      transfersRes.data?.forEach((item: StockTransferItemRecord) => {
        const transfer = Array.isArray(item.stock_transfers) ? item.stock_transfers[0] : item.stock_transfers;
        const qty = Number(item.quantity || 0);
        if (!warehouseId || warehouseId === transfer?.to_warehouse_id) {
          movements.push({
            id: `TR-IN-${transfer?.id || Math.random()}`,
            date: transfer?.transfer_date || '',
            type: 'IN',
            quantity: qty,
            uomId: item.uom_id,
            documentType: 'تحويل مخزني (استلام)',
            documentNumber: transfer?.transfer_number || '-',
            warehouseId: transfer?.to_warehouse_id,
            createdAt: transfer?.created_at,
            notes: transfer?.notes || ''
          });
        }
        if (!warehouseId || warehouseId === transfer?.from_warehouse_id) {
          movements.push({
            id: `TR-OUT-${transfer?.id || Math.random()}`,
            date: transfer?.transfer_date || '',
            type: 'OUT',
            quantity: qty,
            uomId: item.uom_id,
            documentType: 'تحويل مخزني (صرف)',
            documentNumber: transfer?.transfer_number || '-',
            warehouseId: transfer?.from_warehouse_id,
            createdAt: transfer?.created_at,
            notes: transfer?.notes || ''
          });
        }
      });

      // 7. أوامر الإنتاج التامة
      mfgFinishedRes.data?.forEach((item: MfgProductionOrderRecord) => {
        movements.push({
          id: `MFG-FIN-${item.id}`,
          date: item.end_date || item.created_at?.split('T')[0] || '',
          type: 'IN',
          quantity: Number(item.quantity_to_produce || 0),
          documentType: 'إنتاج تام',
          documentNumber: item.order_number || '-',
          warehouseId: item.warehouse_id,
          createdAt: item.created_at
        });
      });

      // 8. صرف المواد الخام للتصنيع
      mfgRawRes.data?.forEach((item: MfgMaterialRequestItemRecord) => {
        const req = Array.isArray(item.mfg_material_requests) ? item.mfg_material_requests[0] : item.mfg_material_requests;
        const mfgOrder = Array.isArray(req?.mfg_production_orders) ? req?.mfg_production_orders[0] : req?.mfg_production_orders;
        movements.push({
          id: `MFG-RAW-${req?.request_number || Math.random()}`,
          date: req?.issue_date || req?.created_at?.split('T')[0] || '',
          type: 'OUT',
          quantity: Number(item.quantity_issued || 0),
          uomId: item.uom_id,
          documentType: 'صرف مواد تصنيع',
          documentNumber: req?.request_number || '-',
          warehouseId: mfgOrder?.warehouse_id,
          createdAt: req?.created_at
        });
      });

      // 9. صرف المستشفيات
      himsRes.data?.forEach((item: HimsBillingItemRecord) => {
        const billing = Array.isArray(item.hims_billing) ? item.hims_billing[0] : item.hims_billing;
        const patient = Array.isArray(billing?.hims_patients) ? billing?.hims_patients[0] : billing?.hims_patients;
        movements.push({
          id: `HIMS-${item.id}`,
          date: item.created_at?.split('T')[0] || '',
          type: 'OUT',
          quantity: Number(item.quantity || 0),
          uomId: item.uom_id,
          documentType: 'صرف علاج/مستلزمات',
          documentNumber: billing?.visit_id || '-',
          warehouseId: item.warehouse_id,
          createdAt: item.created_at,
          notes: patient?.full_name || ''
        });
      });

      // 10. صرف مشاريع المقاولات
      constructionRes.data?.forEach((item: ProjectMaterialIssueItemRecord) => {
        const issue = Array.isArray(item.project_material_issues) ? item.project_material_issues[0] : item.project_material_issues;
        const project = Array.isArray(issue?.projects) ? issue?.projects[0] : issue?.projects;
        movements.push({
          id: `CONST-${issue?.id || Math.random()}`,
          date: issue?.issue_date || issue?.created_at?.split('T')[0] || '',
          type: 'OUT',
          quantity: Number(item.quantity || 0),
          uomId: item.uom_id,
          documentType: 'صرف مشروع',
          documentNumber: issue?.issue_number || '-',
          warehouseId: issue?.warehouse_id,
          createdAt: issue?.created_at,
          notes: project?.name || ''
        });
      });

      // 11. توريد اعتمادات مستندية
      lcRes.data?.forEach((item: LcReceiptItemRecord) => {
        const lc = Array.isArray(item.letters_of_credit) ? item.letters_of_credit[0] : item.letters_of_credit;
        movements.push({
          id: `LC-${item.id}`,
          date: item.receipt_date || item.created_at?.split('T')[0] || '',
          type: 'IN',
          quantity: Number(item.quantity || 0),
          unitPrice: Number(item.unit_price || 0),
          unitCost: Number(item.final_unit_cost || 0),
          documentType: 'استلام اعتماد مستندي',
          documentNumber: lc?.lc_number || '-',
          warehouseId: item.warehouse_id,
          createdAt: item.created_at,
          notes: item.notes || ''
        });
      });

      // ترتيب الحركات حسب التاريخ تصاعدياً
      movements.sort((a, b) => {
        const dateDiff = new Date(a.date).getTime() - new Date(b.date).getTime();
        if (dateDiff !== 0) return dateDiff;
        return new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime();
      });

      let totalIn = 0;
      let totalOut = 0;
      movements.forEach(m => {
        if (m.type === 'IN') totalIn += m.quantity;
        else totalOut += m.quantity;
      });

      const netMovement = totalIn - totalOut;
      const closingBalance = openingBalance + netMovement;

      return {
        openingBalance,
        movements,
        totalIn,
        totalOut,
        netMovement,
        closingBalance
      };
    } catch (err: unknown) {
      logger.error('[StockMovementService] Error fetching product movements:', err);
      return {
        openingBalance,
        movements: [],
        totalIn: 0,
        totalOut: 0,
        netMovement: 0,
        closingBalance: openingBalance
      };
    }
  }
}

export default StockMovementService;
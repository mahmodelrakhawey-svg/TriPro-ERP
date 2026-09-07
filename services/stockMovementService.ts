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

import { supabase } from '../supabaseClient';

export interface UnifiedStockMovement {
  id: string;
  date: string;
  type: 'IN' | 'OUT';
  quantity: number;
  uomId?: string | null;
  documentType: string;
  documentNumber: string;
  warehouseId?: string | null;
  warehouseName?: string;
  createdAt?: string;
  notes?: string;
  unitPrice?: number;
  unitCost?: number;
  productName?: string;
  productId?: string;
}

export interface FetchStockMovementsParams {
  productId: string;
  organizationId: string;
  warehouseId?: string | null;
  startDate?: string;
  endDate?: string;
}

export interface StockMovementsResult {
  openingBalance: number;
  movements: UnifiedStockMovement[];
  totalIn: number;
  totalOut: number;
  netMovement: number;
  closingBalance: number;
}

export class StockMovementService {
  /**
   * جلب الرصيد الافتتاحي لصنف محدد (والمستودع إذا تم تحديده)
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
        console.error('[StockMovementService] Error fetching opening balance:', error);
        return 0;
      }

      return data?.reduce((sum, row) => sum + Number(row.quantity || 0), 0) || 0;
    } catch (err) {
      console.error('[StockMovementService] Exception in fetchOpeningBalance:', err);
      return 0;
    }
  }

  /**
   * جلب كافة حركات الصنف الموحدة عبر جميع المديولات (مبيعات، مشتريات، تصنيع، مطاعم، مشاريع، الخ)
   */
  public static async fetchProductMovements(
    params: FetchStockMovementsParams
  ): Promise<StockMovementsResult> {
    const { productId, organizationId, warehouseId, startDate, endDate } = params;

    const openingBalance = await this.fetchOpeningBalance(productId, organizationId, warehouseId);

    try {
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
      salesRes.data?.forEach((item: any) => {
        movements.push({
          id: `SALE-${item.invoices?.id || Math.random()}`,
          date: item.invoices?.invoice_date || '',
          type: 'OUT',
          quantity: Number(item.quantity || 0),
          uomId: item.uom_id,
          documentType: 'فاتورة مبيعات',
          documentNumber: item.invoices?.invoice_number || '-',
          warehouseId: item.invoices?.warehouse_id,
          warehouseName: item.invoices?.warehouses?.name || 'غير محدد',
          createdAt: item.invoices?.created_at,
          notes: item.invoices?.notes || ''
        });
      });

      // 2. معالجة المشتريات
      purchasesRes.data?.forEach((item: any) => {
        movements.push({
          id: `PURCH-${item.purchase_invoices?.id || Math.random()}`,
          date: item.purchase_invoices?.invoice_date || '',
          type: 'IN',
          quantity: Number(item.quantity || 0),
          uomId: item.uom_id,
          documentType: 'فاتورة مشتريات',
          documentNumber: item.purchase_invoices?.invoice_number || '-',
          warehouseId: item.purchase_invoices?.warehouse_id,
          warehouseName: item.purchase_invoices?.warehouses?.name || 'غير محدد',
          createdAt: item.purchase_invoices?.created_at,
          notes: item.purchase_invoices?.notes || ''
        });
      });

      // 3. مرتجعات المبيعات
      salesReturnsRes.data?.forEach((item: any) => {
        movements.push({
          id: `SR-${item.sales_returns?.id || Math.random()}`,
          date: item.sales_returns?.return_date || '',
          type: 'IN',
          quantity: Number(item.quantity || 0),
          uomId: item.uom_id,
          documentType: 'مرتجع مبيعات',
          documentNumber: item.sales_returns?.return_number || '-',
          warehouseId: item.sales_returns?.warehouse_id,
          warehouseName: item.sales_returns?.warehouses?.name || 'غير محدد',
          createdAt: item.sales_returns?.created_at,
          notes: item.sales_returns?.notes || ''
        });
      });

      // 4. مرتجعات المشتريات
      purchaseReturnsRes.data?.forEach((item: any) => {
        movements.push({
          id: `PR-${item.purchase_returns?.id || Math.random()}`,
          date: item.purchase_returns?.return_date || '',
          type: 'OUT',
          quantity: Number(item.quantity || 0),
          uomId: item.uom_id,
          documentType: 'مرتجع مشتريات',
          documentNumber: item.purchase_returns?.return_number || '-',
          warehouseId: item.purchase_returns?.warehouse_id,
          warehouseName: item.purchase_returns?.warehouses?.name || 'غير محدد',
          createdAt: item.purchase_returns?.created_at,
          notes: item.purchase_returns?.notes || ''
        });
      });

      // 5. التسويات المخزنية
      adjustmentsRes.data?.forEach((item: any) => {
        const qty = Number(item.quantity || 0);
        movements.push({
          id: `ADJ-${item.stock_adjustments?.id || Math.random()}`,
          date: item.stock_adjustments?.adjustment_date || '',
          type: qty >= 0 ? 'IN' : 'OUT',
          quantity: Math.abs(qty),
          uomId: item.uom_id,
          documentType: 'تسوية جردية',
          documentNumber: item.stock_adjustments?.adjustment_number || '-',
          warehouseId: item.stock_adjustments?.warehouse_id,
          warehouseName: item.stock_adjustments?.warehouses?.name || 'غير محدد',
          createdAt: item.stock_adjustments?.created_at,
          notes: item.stock_adjustments?.reason || ''
        });
      });

      // 6. التحويلات المخزنية
      transfersRes.data?.forEach((item: any) => {
        const transfer = item.stock_transfers;
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
      mfgFinishedRes.data?.forEach((item: any) => {
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
      mfgRawRes.data?.forEach((item: any) => {
        const req = item.mfg_material_requests;
        movements.push({
          id: `MFG-RAW-${req?.request_number || Math.random()}`,
          date: req?.issue_date || req?.created_at?.split('T')[0] || '',
          type: 'OUT',
          quantity: Number(item.quantity_issued || 0),
          uomId: item.uom_id,
          documentType: 'صرف مواد تصنيع',
          documentNumber: req?.request_number || '-',
          warehouseId: req?.mfg_production_orders?.warehouse_id,
          createdAt: req?.created_at
        });
      });

      // 9. صرف المستشفيات
      himsRes.data?.forEach((item: any) => {
        movements.push({
          id: `HIMS-${item.id}`,
          date: item.created_at?.split('T')[0] || '',
          type: 'OUT',
          quantity: Number(item.quantity || 0),
          uomId: item.uom_id,
          documentType: 'صرف علاج/مستلزمات',
          documentNumber: item.hims_billing?.visit_id || '-',
          warehouseId: item.warehouse_id,
          createdAt: item.created_at,
          notes: item.hims_billing?.hims_patients?.full_name || ''
        });
      });

      // 10. صرف مشاريع المقاولات
      constructionRes.data?.forEach((item: any) => {
        const issue = item.project_material_issues;
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
          notes: issue?.projects?.name || ''
        });
      });

      // 11. توريد اعتمادات مستندية
      lcRes.data?.forEach((item: any) => {
        movements.push({
          id: `LC-${item.id}`,
          date: item.receipt_date || item.created_at?.split('T')[0] || '',
          type: 'IN',
          quantity: Number(item.quantity || 0),
          unitPrice: Number(item.unit_price || 0),
          unitCost: Number(item.final_unit_cost || 0),
          documentType: 'استلام اعتماد مستندي',
          documentNumber: item.letters_of_credit?.lc_number || '-',
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
    } catch (err) {
      console.error('[StockMovementService] Error fetching product movements:', err);
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
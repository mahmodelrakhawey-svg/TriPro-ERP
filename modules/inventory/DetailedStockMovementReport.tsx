import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../../supabaseClient';
import { useAccounting } from '../../context/AccountingContext';
import { Search, Download, Printer, Loader2, ArrowRightLeft } from 'lucide-react';
import * as XLSX from 'xlsx';
import ReportHeader from '../../components/ReportHeader';

type StockMovement = {
  id: string;
  date: string;
  createdAt?: string;
  type: 'IN' | 'OUT';
  docType: string;
  docNumber: string;
  productId?: string;
  productName: string;
  quantity: number;
  uomId?: string | null;
  baseUomId?: string | null;
  baseUnitName?: string;
  displayQty?: number;
  displayUnitName?: string;
  runningBalance?: number;
  warehouseName: string;
  notes?: string;
};

const DetailedStockMovementReport = () => {
  const { products, warehouses, settings, currentUser, selectedFiscalYear, fiscalYearRange } = useAccounting();
  const [startDate, setStartDate] = useState(fiscalYearRange.startDate);
  const [endDate, setEndDate] = useState(`${selectedFiscalYear}-12-31`);
  const [selectedProduct, setSelectedProduct] = useState('');
  const [selectedWarehouse, setSelectedWarehouse] = useState('');
  const [movements, setMovements] = useState<StockMovement[]>([]);
  const [loading, setLoading] = useState(false);
  const [openingBalance, setOpeningBalance] = useState(0);
  const [uoms, setUoms] = useState<any[]>([]);
  const [displayUnit, setDisplayUnit] = useState<'base' | 'original'>('base');

  // مزامنة التواريخ تلقائياً عند تغيير السنة المالية المختارة من شريط النظام
  useEffect(() => {
    if (selectedFiscalYear) {
      setStartDate(`${selectedFiscalYear}-01-01`);
      setEndDate(`${selectedFiscalYear}-12-31`);
    }
  }, [selectedFiscalYear]);

  useEffect(() => {
    const fetchUoms = async () => {
      const { data } = await supabase.from('uoms').select('*');
      if (data) setUoms(data);
    };
    fetchUoms();
  }, []);

  const convertQty = (qty: number, fromUomId: string | null | undefined, toUomId: string | null | undefined) => {
    if (!fromUomId || !toUomId || fromUomId === toUomId) return qty;
    const fromUom = uoms.find(u => u.id === fromUomId);
    const toUom = uoms.find(u => u.id === toUomId);
    if (!fromUom || !toUom) return qty;
    
    let fromRatio = Number(fromUom.ratio) || 1;
    let toRatio = Number(toUom.ratio) || 1;
    
    if (fromUom.uom_type === 'smaller') fromRatio = 1.0 / fromRatio;
    if (toUom.uom_type === 'smaller') toRatio = 1.0 / toRatio;
    
    return (qty * fromRatio) / toRatio;
  };

  const fetchData = async () => {
    setLoading(true);
    if (currentUser?.role === 'demo') {
        setMovements([
            { id: 'd1', date: new Date().toISOString().split('T')[0], type: 'IN', docType: 'فاتورة مشتريات', docNumber: 'PINV-D-01', productName: 'لابتوب HP', quantity: 10, warehouseName: 'المستودع الرئيسي', notes: 'توريد بضاعة' },
            { id: 'd2', date: new Date().toISOString().split('T')[0], type: 'OUT', docType: 'فاتورة مبيعات', docNumber: 'INV-D-01', productName: 'لابتوب HP', quantity: 2, warehouseName: 'المستودع الرئيسي', notes: 'بيع للعميل' },
        ]);
        setLoading(false);
        return;
    }

    const allMovements: StockMovement[] = [];

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const userOrgId = session?.user?.user_metadata?.org_id;
      if (!userOrgId) return;

      const isStartAfterYearStart = selectedProduct && startDate > `${selectedFiscalYear || new Date().getFullYear()}-01-01`;

      // 1. المبيعات (Sales) - إخراج (OUT)
      let salesQuery = supabase
        .from('invoice_items')
        .select('quantity, uom_id, product_id, products(name, base_uom_id, unit), invoices!inner(id, invoice_number, invoice_date, status, warehouse_id, warehouses(name), notes)')
        .eq('organization_id', userOrgId)
        .neq('invoices.status', 'draft')
        .neq('invoices.status', 'cancelled')
        .gte('invoices.invoice_date', startDate)
        .lte('invoices.invoice_date', endDate);
      
      if (selectedProduct) salesQuery = salesQuery.eq('product_id', selectedProduct);
      if (selectedWarehouse) salesQuery = salesQuery.eq('invoices.warehouse_id', selectedWarehouse);

      const { data: sales } = await salesQuery;
      sales?.forEach((item: any) => {
        allMovements.push({
          id: `SALE-${item.invoices.invoice_number}-${item.product_id}`,
          date: item.invoices.invoice_date,
          type: 'OUT',
          docType: 'فاتورة مبيعات',
          docNumber: item.invoices.invoice_number,
          productName: item.products?.name,
          quantity: item.quantity,
          uomId: item.uom_id,
          baseUomId: item.products?.base_uom_id,
          baseUnitName: item.products?.unit,
          warehouseName: item.invoices.warehouses?.name,
          notes: item.invoices.notes
        });
      });

      // 2. المشتريات (Purchases) - إدخال (IN)
      let purchaseQuery = supabase
        .from('purchase_invoice_items')
        .select('quantity, uom_id, product_id, products(name, base_uom_id, unit), purchase_invoices!inner(id, invoice_number, invoice_date, status, warehouse_id, warehouses(name), notes)')
        .eq('organization_id', userOrgId)
        .in('purchase_invoices.status', ['posted', 'paid'])
        .gte('purchase_invoices.invoice_date', startDate)
        .lte('purchase_invoices.invoice_date', endDate);

      if (selectedProduct) purchaseQuery = purchaseQuery.eq('product_id', selectedProduct);
      if (selectedWarehouse) purchaseQuery = purchaseQuery.eq('purchase_invoices.warehouse_id', selectedWarehouse);

      const { data: purchases } = await purchaseQuery;
      purchases?.forEach((item: any) => {
        allMovements.push({
          id: `PUR-${item.purchase_invoices.invoice_number}-${item.product_id}`,
          date: item.purchase_invoices.invoice_date,
          type: 'IN',
          docType: 'فاتورة مشتريات',
          docNumber: item.purchase_invoices.invoice_number,
          productName: item.products?.name,
          quantity: item.quantity,
          uomId: item.uom_id,
          baseUomId: item.products?.base_uom_id,
          baseUnitName: item.products?.unit,
          warehouseName: item.purchase_invoices.warehouses?.name,
          notes: item.purchase_invoices.notes
        });
      });

      // 2.1 وارد اعتمادات مستندية (Letters of Credit Receipts) - إدخال (IN)
      let lcQuery = supabase
        .from('lc_receipt_items')
        .select('quantity, product_id, receipt_date, notes, products(name, base_uom_id, unit), warehouses(name), letters_of_credit!inner(id, lc_number, status)')
        .eq('organization_id', userOrgId)
        .gte('receipt_date', startDate)
        .lte('receipt_date', endDate);

      if (selectedProduct) lcQuery = lcQuery.eq('product_id', selectedProduct);
      if (selectedWarehouse) lcQuery = lcQuery.eq('warehouse_id', selectedWarehouse);

      const { data: lcReceipts } = await lcQuery;
      lcReceipts?.forEach((item: any) => {
        allMovements.push({
          id: `LC-${item.letters_of_credit?.lc_number}-${item.product_id}`,
          date: item.receipt_date,
          type: 'IN',
          docType: 'توريد اعتماد مستندي',
          docNumber: item.letters_of_credit?.lc_number || '-',
          productName: item.products?.name,
          quantity: item.quantity,
          uomId: null,
          baseUomId: item.products?.base_uom_id,
          baseUnitName: item.products?.unit,
          warehouseName: item.warehouses?.name || 'المستودع الرئيسي',
          notes: item.notes || 'استلام بضاعة شحنة اعتماد مستندي'
        });
      });

      // 3. مرتجع مبيعات (Sales Return) - إدخال (IN)
      let salesRetQuery = supabase
        .from('sales_return_items')
        .select('quantity, uom_id, product_id, products(name, base_uom_id, unit), sales_returns!inner(id, return_number, return_date, warehouse_id, warehouses(name), notes, status)')
        .eq('organization_id', userOrgId)
        .eq('sales_returns.status', 'posted')
        .gte('sales_returns.return_date', startDate)
        .lte('sales_returns.return_date', endDate);

      if (selectedProduct) salesRetQuery = salesRetQuery.eq('product_id', selectedProduct);
      if (selectedWarehouse) salesRetQuery = salesRetQuery.eq('sales_returns.warehouse_id', selectedWarehouse);

      const { data: salesReturns } = await salesRetQuery;
      salesReturns?.forEach((item: any) => {
        allMovements.push({
          id: `SR-${item.sales_returns.return_number}-${item.product_id}`,
          date: item.sales_returns.return_date,
          type: 'IN',
          docType: 'مرتجع مبيعات',
          docNumber: item.sales_returns.return_number,
          productName: item.products?.name,
          quantity: item.quantity,
          uomId: item.uom_id,
          baseUomId: item.products?.base_uom_id,
          baseUnitName: item.products?.unit,
          warehouseName: item.sales_returns.warehouses?.name,
          notes: item.sales_returns.notes
        });
      });

      // 4. مرتجع مشتريات (Purchase Return) - إخراج (OUT)
      let purRetQuery = supabase
        .from('purchase_return_items')
        .select('quantity, uom_id, product_id, products(name, base_uom_id, unit), purchase_returns!inner(return_number, return_date, warehouse_id, warehouses(name), notes, status)')
        .eq('organization_id', userOrgId)
        .eq('purchase_returns.status', 'posted')
        .gte('purchase_returns.return_date', startDate)
        .lte('purchase_returns.return_date', endDate);

      if (selectedProduct) purRetQuery = purRetQuery.eq('product_id', selectedProduct);
      if (selectedWarehouse) purRetQuery = purRetQuery.eq('purchase_returns.warehouse_id', selectedWarehouse);

      const { data: purReturns } = await purRetQuery;
      purReturns?.forEach((item: any) => {
        allMovements.push({
          id: `PR-${item.purchase_returns.return_number}-${item.product_id}`,
          date: item.purchase_returns.return_date,
          type: 'OUT',
          docType: 'مرتجع مشتريات',
          docNumber: item.purchase_returns.return_number,
          productName: item.products?.name,
          quantity: item.quantity,
          uomId: item.uom_id,
          baseUomId: item.products?.base_uom_id,
          baseUnitName: item.products?.unit,
          warehouseName: item.purchase_returns.warehouses?.name,
          notes: item.purchase_returns.notes
        });
      });

      // 5. التصنيع (Manufacturing)
      // أ. المنتج التام (IN)
      let productionInQuery = supabase
        .from('mfg_production_orders')
        .select('id, order_number, end_date, quantity_to_produce, product_id, products(name, base_uom_id, unit), warehouse_id, warehouses(name), notes')
        .eq('organization_id', userOrgId)
        .eq('status', 'completed')
        .gte('end_date', startDate)
        .lte('end_date', endDate);

      if (selectedProduct) productionInQuery = productionInQuery.eq('product_id', selectedProduct);
      if (selectedWarehouse) productionInQuery = productionInQuery.eq('warehouse_id', selectedWarehouse);

      const { data: productionIn } = await productionInQuery;
      productionIn?.forEach((item: any) => {
        allMovements.push({
          id: `MFG-IN-${item.id}`,
          date: item.end_date,
          type: 'IN',
          docType: 'تصنيع (منتج تام)',
          docNumber: item.order_number,
          productName: item.products?.name,
          quantity: item.quantity_to_produce,
          baseUomId: item.products?.base_uom_id,
          baseUnitName: item.products?.unit,
          warehouseName: item.warehouses?.name,
          notes: item.notes || 'إغلاق أمر إنتاج'
        });
      });

      // ب. المواد الخام المستهلكة فعلياً (OUT)
      let mfgActualQuery = supabase
        .from('mfg_actual_material_usage')
        .select(`
          id,
          actual_quantity,
          uom_id,
          created_at,
          raw_material_id,
          products:raw_material_id(name, base_uom_id, unit),
          mfg_order_progress!inner(
            id,
            production_order_id,
            mfg_production_orders!inner(
              id,
              order_number,
              warehouse_id,
              warehouses(name)
            )
          )
        `)
        .eq('organization_id', userOrgId)
        .gte('created_at', `${startDate}T00:00:00`)
        .lte('created_at', `${endDate}T23:59:59`);

      if (selectedProduct) mfgActualQuery = mfgActualQuery.eq('raw_material_id', selectedProduct);
      if (selectedWarehouse) mfgActualQuery = mfgActualQuery.eq('mfg_order_progress.mfg_production_orders.warehouse_id', selectedWarehouse);

      const { data: mfgActuals } = await mfgActualQuery;
      const ordersWithActualUsage = new Set<string>();
      
      mfgActuals?.forEach((item: any) => {
        const po = item.mfg_order_progress?.mfg_production_orders;
        if (!po) return;
        ordersWithActualUsage.add(po.id);
        
        allMovements.push({
          id: `MFG-ACTUAL-${item.id}`,
          date: item.created_at.split('T')[0],
          type: 'OUT',
          docType: 'استهلاك خامات (إنتاج)',
          docNumber: po.order_number,
          productName: item.products?.name,
          quantity: item.actual_quantity,
          uomId: item.uom_id,
          baseUomId: item.products?.base_uom_id,
          baseUnitName: item.products?.unit,
          warehouseName: po.warehouses?.name || 'المستودع الرئيسي',
          notes: 'استهلاك فعلي للمواد بالمرحلة'
        });
      });

      // ج. صرف خامات بطلبات صرف (فقط في حال عدم وجود استهلاك فعلي لنفس الأمر)
      let mfgRawQuery = supabase
        .from('mfg_material_request_items')
        .select(`
          quantity_issued,
          uom_id,
          raw_material_id,
          products:raw_material_id(name, base_uom_id, unit),
          mfg_material_requests!inner(
            request_number,
            issue_date,
            created_at,
            status,
            production_order_id,
            mfg_production_orders!inner(
              id,
              warehouse_id,
              warehouses(name)
            )
          )
        `)
        .eq('organization_id', userOrgId)
        .eq('mfg_material_requests.status', 'issued')
        .gte('mfg_material_requests.issue_date', startDate)
        .lte('mfg_material_requests.issue_date', endDate);

      if (selectedProduct) mfgRawQuery = mfgRawQuery.eq('raw_material_id', selectedProduct);
      if (selectedWarehouse) mfgRawQuery = mfgRawQuery.eq('mfg_material_requests.mfg_production_orders.warehouse_id', selectedWarehouse);

      const { data: mfgRaws } = await mfgRawQuery;
      mfgRaws?.forEach((item: any) => {
        const po = item.mfg_material_requests?.mfg_production_orders;
        const poId = item.mfg_material_requests?.production_order_id;
        if (poId && ordersWithActualUsage.has(poId)) {
          return; // تخطي طلب الصرف لتجنب الازدواجية
        }
        
        allMovements.push({
          id: `MFG-OUT-REQ-${item.mfg_material_requests.request_number}-${item.raw_material_id}`,
          date: item.mfg_material_requests.issue_date || item.mfg_material_requests.created_at.split('T')[0],
          type: 'OUT',
          docType: 'صرف خامات (إنتاج)',
          docNumber: item.mfg_material_requests.request_number,
          productName: item.products?.name,
          quantity: item.quantity_issued,
          uomId: item.uom_id,
          baseUomId: item.products?.base_uom_id,
          baseUnitName: item.products?.unit,
          warehouseName: po?.warehouses?.name || 'المستودع الرئيسي',
          notes: 'استهلاك مواد أولية (طلب صرف)'
        });
      });

      // د. الهالك الصناعي (OUT)
      let mfgScrapQuery = supabase
        .from('mfg_scrap_logs')
        .select(`
          id,
          quantity,
          reason,
          created_at,
          product_id,
          products(name, base_uom_id, unit),
          mfg_order_progress!inner(
            id,
            production_order_id,
            mfg_production_orders!inner(
              id,
              warehouse_id,
              warehouses(name)
            )
          )
        `)
        .eq('organization_id', userOrgId)
        .gte('created_at', `${startDate}T00:00:00`)
        .lte('created_at', `${endDate}T23:59:59`);

      if (selectedProduct) mfgScrapQuery = mfgScrapQuery.eq('product_id', selectedProduct);
      if (selectedWarehouse) mfgScrapQuery = mfgScrapQuery.eq('mfg_order_progress.mfg_production_orders.warehouse_id', selectedWarehouse);

      const { data: mfgScraps } = await mfgScrapQuery;
      mfgScraps?.forEach((item: any) => {
        const po = item.mfg_order_progress?.mfg_production_orders;
        allMovements.push({
          id: `MFG-SCRAP-${item.id}`,
          date: item.created_at.split('T')[0],
          type: 'OUT',
          docType: 'تصنيع (هالك)',
          docNumber: '-',
          productName: item.products?.name,
          quantity: item.quantity,
          baseUomId: item.products?.base_uom_id,
          baseUnitName: item.products?.unit,
          warehouseName: po?.warehouses?.name || 'المستودع الرئيسي',
          notes: `هالك صناعي: ${item.reason}`
        });
      });

      // 6. التسويات المخزنية (Stock Adjustments) - تشمل تسويات الجرد واليدوية
      let adjustmentsQuery = supabase
        .from('stock_adjustment_items')
        .select('quantity, uom_id, product_id, products(name, base_uom_id, unit), stock_adjustments!inner(adjustment_number, adjustment_date, status, warehouse_id, warehouses(name), reason)')
        .eq('organization_id', userOrgId)
        .eq('stock_adjustments.status', 'posted')
        .gte('stock_adjustments.adjustment_date', startDate)
        .lte('stock_adjustments.adjustment_date', endDate);

      if (selectedProduct) adjustmentsQuery = adjustmentsQuery.eq('product_id', selectedProduct);
      if (selectedWarehouse) adjustmentsQuery = adjustmentsQuery.eq('stock_adjustments.warehouse_id', selectedWarehouse);

      const { data: adjustments } = await adjustmentsQuery;
      
      adjustments?.forEach((item: any) => {
        const qty = Number(item.quantity);
        allMovements.push({
          id: `ADJ-${item.stock_adjustments.adjustment_number}-${item.product_id}`,
          date: item.stock_adjustments.adjustment_date,
          type: qty >= 0 ? 'IN' : 'OUT',
          docType: 'تسوية مخزنية',
          docNumber: item.stock_adjustments.adjustment_number,
          productName: item.products?.name,
          quantity: Math.abs(qty),
          uomId: item.uom_id,
          baseUomId: item.products?.base_uom_id,
          baseUnitName: item.products?.unit,
          warehouseName: item.stock_adjustments.warehouses?.name,
          notes: item.stock_adjustments.reason
        });
      });

      // 7. التحويلات المخزنية (Stock Transfers)
      let transfersQuery = supabase
        .from('stock_transfer_items')
        .select('quantity, uom_id, product_id, products(name, base_uom_id, unit), stock_transfers!inner(transfer_number, transfer_date, from_warehouse_id, to_warehouse_id, status, notes)')
        .eq('organization_id', userOrgId)
        .eq('stock_transfers.status', 'posted')
        .gte('stock_transfers.transfer_date', startDate)
        .lte('stock_transfers.transfer_date', endDate);

      if (selectedProduct) transfersQuery = transfersQuery.eq('product_id', selectedProduct);
      
      const { data: transfers } = await transfersQuery;
      const getWName = (id: string) => warehouses.find(w => w.id === id)?.name || 'غير محدد';

      transfers?.forEach((item: any) => {
          const t = item.stock_transfers;
          
          // إذا تم تحديد مستودع، نعرض الحركة الخاصة به فقط
          if (selectedWarehouse) {
              if (t.from_warehouse_id === selectedWarehouse) {
                  allMovements.push({
                      id: `TRN-OUT-${t.transfer_number}-${item.product_id}`,
                      date: t.transfer_date,
                      type: 'OUT',
                      docType: 'تحويل صادر',
                      docNumber: t.transfer_number,
                      productName: item.products?.name,
                      quantity: item.quantity,
                      uomId: item.uom_id,
                      baseUomId: item.products?.base_uom_id,
                      baseUnitName: item.products?.unit,
                      warehouseName: getWName(t.from_warehouse_id),
                      notes: `إلى: ${getWName(t.to_warehouse_id)} - ${t.notes || ''}`
                  });
              } else if (t.to_warehouse_id === selectedWarehouse) {
                  allMovements.push({
                      id: `TRN-IN-${t.transfer_number}-${item.product_id}`,
                      date: t.transfer_date,
                      type: 'IN',
                      docType: 'تحويل وارد',
                      docNumber: t.transfer_number,
                      productName: item.products?.name,
                      quantity: item.quantity,
                      uomId: item.uom_id,
                      baseUomId: item.products?.base_uom_id,
                      baseUnitName: item.products?.unit,
                      warehouseName: getWName(t.to_warehouse_id),
                      notes: `من: ${getWName(t.from_warehouse_id)} - ${t.notes || ''}`
                  });
              }
          } else {
              // عرض عام (بدون فلتر مستودع)
              allMovements.push({
                  id: `TRN-DOC-${t.transfer_number}-${item.product_id}`,
                  date: t.transfer_date,
                  type: 'IN',
                  quantity: 0,
                  uomId: item.uom_id,
                  baseUomId: item.products?.base_uom_id,
                  baseUnitName: item.products?.unit,
                  docType: 'تحويل مخزني (داخلي)',
                  docNumber: t.transfer_number,
                  productName: item.products?.name,
                  warehouseName: `${getWName(t.from_warehouse_id)} ➔ ${getWName(t.to_warehouse_id)}`,
                  notes: `نقل كمية (${item.quantity}) - ${t.notes || ''}`
              });
          }
      });

      // 9. مبيعات واستهلاك المطاعم (Restaurant)
      // أ. مبيعات مطعم مباشرة
      let restDirectQuery = supabase
        .from('order_items')
        .select('quantity, uom_id, product_id, products(name, base_uom_id, unit), orders!inner(created_at, order_number, status, warehouse_id)')
        .eq('orders.organization_id', userOrgId)
        .gte('orders.created_at', `${startDate}T00:00:00`)
        .lte('orders.created_at', `${endDate}T23:59:59`)
        .in('orders.status', ['COMPLETED', 'PAID']);

      if (selectedProduct) restDirectQuery = restDirectQuery.eq('product_id', selectedProduct);
      if (selectedWarehouse) restDirectQuery = restDirectQuery.eq('orders.warehouse_id', selectedWarehouse);

      const { data: restDirect } = await restDirectQuery;

      restDirect?.forEach((item: any) => {
          allMovements.push({
              id: `REST-SALE-${item.orders.order_number}-${item.product_id}`,
              date: item.orders.created_at.split('T')[0],
              createdAt: item.orders.created_at,
              type: 'OUT',
              docType: 'مبيعات مطعم',
              docNumber: item.orders.order_number,
              productId: item.product_id,
              productName: item.products?.name,
              quantity: item.quantity,
              uomId: item.uom_id,
              baseUomId: item.products?.base_uom_id,
              baseUnitName: item.products?.unit,
              warehouseName: getWName(item.orders.warehouse_id),
              notes: 'بيع مباشر'
          });
      });

      // ب. استهلاك المواد الخام في وجبات المطعم (Restaurant BOM Consumptions)
      let bomQuery = supabase
        .from('bill_of_materials')
        .select('product_id, raw_material_id, quantity_required, uom_id');
      
      if (selectedProduct) {
        bomQuery = bomQuery.eq('raw_material_id', selectedProduct);
      }
      const { data: boms } = await bomQuery;

      if (boms && boms.length > 0) {
        const parentMealIds = Array.from(new Set(boms.map((b: any) => b.product_id)));
        let restConsQuery = supabase
          .from('order_items')
          .select('id, product_id, quantity, uom_id, orders!inner(id, order_number, created_at, status, order_type, warehouse_id)')
          .eq('orders.organization_id', userOrgId)
          .in('product_id', parentMealIds)
          .in('orders.status', ['COMPLETED', 'PAID'])
          .gte('orders.created_at', `${startDate}T00:00:00`)
          .lte('orders.created_at', `${endDate}T23:59:59`);

        if (selectedWarehouse) {
          restConsQuery = restConsQuery.eq('orders.warehouse_id', selectedWarehouse);
        }

        const { data: restConsData } = await restConsQuery;
        restConsData?.forEach((item: any) => {
          const matchingBoms = boms.filter((b: any) => b.product_id === item.product_id && (!selectedProduct || b.raw_material_id === selectedProduct));
          matchingBoms.forEach((bom: any) => {
            const consumedQty = Number(item.quantity) * Number(bom.quantity_required);
            const rawProd = products.find(p => p.id === bom.raw_material_id);
            allMovements.push({
              id: `REST-CONS-${item.id}-${bom.raw_material_id}`,
              date: item.orders.created_at.split('T')[0],
              createdAt: item.orders.created_at,
              type: 'OUT',
              docType: 'استهلاك مطعم',
              docNumber: item.orders.order_number,
              productId: bom.raw_material_id,
              productName: rawProd?.name || 'مادة خام',
              quantity: consumedQty,
              uomId: bom.uom_id || null,
              baseUomId: rawProd?.base_uom_id,
              baseUnitName: rawProd?.unit || 'قطعة',
              warehouseName: getWName(item.orders.warehouse_id),
              notes: 'استهلاك في وجبة (BOM)'
            });
          });
        });
      }

      // 8. رصيد أول المدة (Opening Inventory)
      let openingQuery = supabase
        .from('opening_inventories')
        .select('quantity, uom_id, product_id, products(name, base_uom_id, unit), warehouse_id, created_at, organization_id')
        .eq('organization_id', userOrgId)
        .gte('created_at', `${startDate}T00:00:00`)
        .lte('created_at', `${endDate}T23:59:59`);

      if (selectedProduct) openingQuery = openingQuery.eq('product_id', selectedProduct);
      if (selectedWarehouse) openingQuery = openingQuery.eq('warehouse_id', selectedWarehouse);

      const { data: opening } = await openingQuery;
      opening?.forEach((item: any) => {
          allMovements.push({
              id: `OPEN-${item.product_id}-${item.created_at}`,
              date: item.created_at.split('T')[0],
              createdAt: item.created_at,
              type: 'IN',
              docType: 'رصيد افتتاحي',
              docNumber: '-',
              productId: item.product_id,
              productName: item.products?.name,
              quantity: item.quantity,
              uomId: item.uom_id,
              baseUomId: item.products?.base_uom_id,
              baseUnitName: item.products?.unit,
              warehouseName: getWName(item.warehouse_id),
              notes: 'بضاعة أول المدة'
          });
      });

      // 9. حركات المستشفيات (HIMS Pharmacy & Surgery Consumables) - صادر (OUT)
      let himsQuery = supabase
        .from('hims_billing_items')
        .select(`
          id, quantity, uom_id, product_id,
          products(name, base_uom_id, unit),
          warehouse_id, warehouses(name),
          hims_billing!inner(id, created_at, visit_id, patient_id, organization_id, hims_patients(full_name))
        `)
        .eq('hims_billing.organization_id', userOrgId)
        .not('product_id', 'is', null)
        .gte('hims_billing.created_at', `${startDate}T00:00:00`)
        .lte('hims_billing.created_at', `${endDate}T23:59:59`);

      if (selectedProduct) himsQuery = himsQuery.eq('product_id', selectedProduct);
      // 10. حركات صرف مواد المقاولات والمشاريع (Construction Material Issues) - صادر (OUT)
      let constructionQuery = supabase
        .from('project_material_issue_items')
        .select(`
          id, quantity, uom_id, product_id,
          products(name, base_uom_id, unit),
          project_material_issues!inner(id, issue_date, issue_number, warehouse_id, created_at, status, warehouses(name), projects(name))
        `)
        .eq('organization_id', userOrgId)
        .eq('project_material_issues.status', 'approved')
        .gte('project_material_issues.issue_date', startDate)
        .lte('project_material_issues.issue_date', endDate);

      if (selectedProduct) constructionQuery = constructionQuery.eq('product_id', selectedProduct);
      if (selectedWarehouse) constructionQuery = constructionQuery.eq('project_material_issues.warehouse_id', selectedWarehouse);

      const { data: constructionIssues } = await constructionQuery;
      constructionIssues?.forEach((item: any) => {
        const issue = item.project_material_issues;
        allMovements.push({
          id: `MAT-${issue?.id || item.id}-${item.product_id}`,
          date: issue?.issue_date || (issue?.created_at ? issue.created_at.split('T')[0] : ''),
          type: 'OUT',
          docType: 'إذن صرف موقع/مشروع',
          docNumber: issue?.issue_number || '-',
          productName: item.products?.name,
          quantity: Number(item.quantity),
          uomId: item.uom_id,
          baseUomId: item.products?.base_uom_id,
          baseUnitName: item.products?.unit,
          warehouseName: issue?.warehouses?.name || 'مستودع غير محدد',
          notes: `صرف لمشروع: ${issue?.projects?.name || ''}`
        });
      });

      // فرز الحركات زمنياً:
      // 1. التاريخ تصاعدياً
      // 2. إذا تساوى التاريخ: الرصيد الافتتاحي أولاً، ثم الوارد قبل الصادر
      // 3. ثم بحسب وقت الإنشاء createdAt
      allMovements.sort((a, b) => {
        const dateA = new Date(a.date).getTime();
        const dateB = new Date(b.date).getTime();
        if (dateA !== dateB) return dateA - dateB;

        // إعطاء الأولوية للرصيد الافتتاحي ليظهر أولاً في نفس اليوم
        if (a.docType === 'رصيد افتتاحي') return -1;
        if (b.docType === 'رصيد افتتاحي') return 1;

        // الوارد قبل الصادر في نفس اليوم
        if (a.type === 'IN' && b.type === 'OUT') return -1;
        if (a.type === 'OUT' && b.type === 'IN') return 1;

        const createdA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const createdB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return createdA - createdB;
      });

      let calculatedPriorBal = 0;
      const periodMovements: StockMovement[] = [];

      allMovements.forEach(m => {
        const movDateOnly = m.date?.includes('T') ? m.date.split('T')[0] : (m.date || '');
        if (movDateOnly < startDate) {
          const qtyInBase = convertQty(m.quantity, m.uomId, m.baseUomId);
          if (m.type === 'IN') calculatedPriorBal += qtyInBase;
          else calculatedPriorBal -= qtyInBase;
        } else if (movDateOnly <= endDate) {
          periodMovements.push(m);
        }
      });

      setOpeningBalance(calculatedPriorBal);
      setMovements(periodMovements);

    } catch (error) {
      console.error("Error fetching stock movements:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [startDate, endDate, selectedProduct, selectedWarehouse]);

  const processedMovements = useMemo(() => {
    let running = openingBalance || 0;
    const prodBalances: Record<string, number> = {};

    return movements.map(m => {
      const displayQty = displayUnit === 'base' ? convertQty(m.quantity, m.uomId, m.baseUomId) : m.quantity;
      const displayUnitName = displayUnit === 'base' ? (m.baseUnitName || 'قطعة') : (uoms.find(u => u.id === m.uomId)?.name || m.baseUnitName || 'قطعة');
      
      if (selectedProduct) {
        if (m.type === 'IN') running += displayQty;
        else running -= displayQty;
      } else {
        const key = m.productId || m.productName;
        if (prodBalances[key] === undefined) prodBalances[key] = 0;
        if (m.type === 'IN') prodBalances[key] += displayQty;
        else prodBalances[key] -= displayQty;
        running = prodBalances[key];
      }

      return {
        ...m,
        displayQty,
        displayUnitName,
        runningBalance: running
      };
    });
  }, [movements, displayUnit, uoms, openingBalance, selectedProduct]);

  const totalIn = useMemo(() => {
    return processedMovements.filter(m => m.type === 'IN').reduce((sum, m) => sum + (m.displayQty || 0), 0);
  }, [processedMovements]);

  const totalOut = useMemo(() => {
    return processedMovements.filter(m => m.type === 'OUT').reduce((sum, m) => sum + (m.displayQty || 0), 0);
  }, [processedMovements]);

  const netBalance = useMemo(() => {
    return (openingBalance || 0) + totalIn - totalOut;
  }, [openingBalance, totalIn, totalOut]);

  const selectedProductObj = useMemo(() => {
    return products.find(p => p.id === selectedProduct);
  }, [products, selectedProduct]);

  const currentUnitName = selectedProductObj?.unit || (displayUnit === 'base' ? 'وحدة أساسية' : 'قطعة');

  const exportToExcel = () => {
    const data = processedMovements.map(m => ({
      'التاريخ': m.date,
      'نوع المستند': m.docType,
      'رقم المستند': m.docNumber,
      'الصنف': m.productName,
      'المستودع': m.warehouseName,
      'وارد': m.type === 'IN' ? m.displayQty : 0,
      'صادر': m.type === 'OUT' ? m.displayQty : 0,
      'الرصيد': m.runningBalance ?? 0,
      'الوحدة': m.displayUnitName || '',
      'ملاحظات': m.notes || ''
    }));

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "حركة المخزون التفصيلي");
    XLSX.writeFile(wb, `Stock_Movement_${startDate}_${endDate}.xlsx`);
  };

  return (
    <div className="space-y-6 animate-in fade-in">
      <div className="flex flex-col md:flex-row justify-between items-center gap-4 print:hidden">
        <div>
          <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
            <ArrowRightLeft className="text-blue-600" /> تقرير حركة المخزون التفصيلي
          </h2>
          <p className="text-slate-500 text-sm">تتبع جميع حركات الأصناف (وارد/صادر) مع أرقام المستندات</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => window.print()} className="flex items-center gap-2 bg-slate-800 text-white px-4 py-2 rounded-lg hover:bg-slate-700 transition-colors">
            <Printer size={18} /> طباعة
          </button>
          <button onClick={exportToExcel} className="flex items-center gap-2 bg-emerald-600 text-white px-4 py-2 rounded-lg hover:bg-emerald-700 transition-colors">
            <Download size={18} /> تصدير Excel
          </button>
        </div>
      </div>

      <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 flex flex-wrap items-end gap-4 print:hidden">
        <div className="w-full md:w-auto">
          <label className="block text-sm font-bold text-slate-700 mb-1">من تاريخ</label>
          <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="w-full border rounded-lg p-2" />
        </div>
        <div className="w-full md:w-auto">
          <label className="block text-sm font-bold text-slate-700 mb-1">إلى تاريخ</label>
          <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="w-full border rounded-lg p-2" />
        </div>
        <div className="flex-1 min-w-[200px]">
          <label className="block text-sm font-bold text-slate-700 mb-1">الصنف</label>
          <select value={selectedProduct} onChange={e => setSelectedProduct(e.target.value)} className="w-full border rounded-lg p-2 bg-white">
            <option value="">-- كل الأصناف --</option>
            {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
        <div className="flex-1 min-w-[200px]">
          <label className="block text-sm font-bold text-slate-700 mb-1">المستودع</label>
          <select value={selectedWarehouse} onChange={e => setSelectedWarehouse(e.target.value)} className="w-full border rounded-lg p-2 bg-white">
            <option value="">-- كل المستودعات --</option>
            {warehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
          </select>
        </div>
        <div className="flex-1 min-w-[200px]">
          <label className="block text-sm font-bold text-slate-700 mb-1">وحدة عرض الكميات</label>
          <select value={displayUnit} onChange={e => setDisplayUnit(e.target.value as 'base' | 'original')} className="w-full border rounded-lg p-2 bg-white">
            <option value="base">الوحدة الأصغر (قطعة / زجاجة)</option>
            <option value="original">الوحدة الأصلية للحركة (كرتونة / قطعة)</option>
          </select>
        </div>
        <button onClick={fetchData} className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 font-bold h-[42px]">
            عرض
        </button>
      </div>

      {/* 📊 بطاقات مؤشرات حركة المخزون التلخيصية (KPI Summary Cards) */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 print:grid-cols-3">
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 shadow-sm">
          <div className="text-xs font-bold text-emerald-700 mb-1">إجمالي كمية الوارد (IN)</div>
          <div className="text-2xl font-black text-emerald-800 font-mono">
            +{totalIn.toLocaleString()} <span className="text-sm font-normal text-emerald-600">{currentUnitName}</span>
          </div>
        </div>

        <div className="bg-red-50 border border-red-200 rounded-xl p-4 shadow-sm">
          <div className="text-xs font-bold text-red-700 mb-1">إجمالي كمية الصادر (OUT)</div>
          <div className="text-2xl font-black text-red-800 font-mono">
            -{totalOut.toLocaleString()} <span className="text-sm font-normal text-red-600">{currentUnitName}</span>
          </div>
        </div>

        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 shadow-sm">
          <div className="text-xs font-bold text-blue-700 mb-1">صافي الرصيد المتبقي (الرصيد الحالي)</div>
          <div className="text-2xl font-black text-blue-900 font-mono">
            {netBalance.toLocaleString()} <span className="text-sm font-normal text-blue-700">{currentUnitName}</span>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden print:shadow-none print:border-none">
        <ReportHeader title="تقرير حركة المخزون التفصيلي" subtitle={`الفترة من ${startDate} إلى ${endDate}`} />
        
        {loading ? (
            <div className="p-12 text-center"><Loader2 className="animate-spin mx-auto text-blue-600" size={32} /></div>
        ) : processedMovements.length === 0 && openingBalance === 0 ? (
            <div className="p-12 text-center text-slate-500">لا توجد حركات مخزنية في هذه الفترة</div>
        ) : (
            <div className="overflow-x-auto">
                <table className="w-full text-right text-sm">
                    <thead className="bg-slate-50 text-slate-700 font-bold border-b border-slate-200">
                        <tr>
                            <th className="p-3">التاريخ</th>
                            <th className="p-3">نوع المستند</th>
                            <th className="p-3">رقم المستند</th>
                            <th className="p-3">الصنف</th>
                            <th className="p-3">المستودع</th>
                            <th className="p-3 text-center bg-emerald-50 text-emerald-800">وارد (+)</th>
                            <th className="p-3 text-center bg-red-50 text-red-800">صادر (-)</th>
                            <th className="p-3 text-center bg-blue-50 text-blue-800">الرصيد</th>
                            <th className="p-3">ملاحظات</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                        {openingBalance !== 0 && (
                            <tr className="bg-blue-50/90 font-bold border-b-2 border-blue-200">
                                <td className="p-3 text-blue-900">{startDate}</td>
                                <td className="p-3 text-blue-900" colSpan={4}>
                                  رصيد ما قبل الفترة (رصيد سابق منقول حتى {startDate})
                                </td>
                                <td className="p-3 text-center text-blue-900 bg-blue-100/50">
                                  {openingBalance > 0 ? `${openingBalance.toLocaleString()} ${currentUnitName}` : '-'}
                                </td>
                                <td className="p-3 text-center text-blue-900 bg-blue-100/50">
                                  {openingBalance < 0 ? `${Math.abs(openingBalance).toLocaleString()} ${currentUnitName}` : '-'}
                                </td>
                                <td className="p-3 text-center font-black text-blue-950 bg-blue-200/60 font-mono">
                                  {openingBalance.toLocaleString()} {currentUnitName}
                                </td>
                                <td className="p-3 text-blue-800 text-xs">رصيد المخزون الدفتري قبل بداية الفترة المختارة</td>
                            </tr>
                        )}
                        {processedMovements.map((move, idx) => (
                            <tr key={idx} className="hover:bg-slate-50">
                                <td className="p-3 whitespace-nowrap">{move.date}</td>
                                <td className="p-3">
                                    <span className={`px-2 py-1 rounded text-xs font-bold ${
                                        move.docType.includes('مبيعات') ? 'bg-blue-100 text-blue-700' :
                                        move.docType.includes('مشتريات') ? 'bg-purple-100 text-purple-700' :
                                        move.docType.includes('استهلاك') ? 'bg-amber-100 text-amber-700' :
                                        move.docType.includes('رصيد افتتاحي') ? 'bg-emerald-100 text-emerald-800' :
                                        'bg-slate-100 text-slate-700'
                                    }`}>
                                        {move.docType}
                                    </span>
                                </td>
                                <td className="p-3 font-mono font-bold text-slate-700">{move.docNumber}</td>
                                <td className="p-3 font-bold">{move.productName}</td>
                                <td className="p-3 text-slate-500">{move.warehouseName}</td>
                                <td className="p-3 text-center font-bold text-emerald-600 bg-emerald-50/30 font-mono">
                                    {move.type === 'IN' ? `+${move.displayQty?.toLocaleString()} ${move.displayUnitName}` : '-'}
                                </td>
                                <td className="p-3 text-center font-bold text-red-600 bg-red-50/30 font-mono">
                                    {move.type === 'OUT' ? `-${move.displayQty?.toLocaleString()} ${move.displayUnitName}` : '-'}
                                </td>
                                <td className="p-3 text-center font-bold text-blue-700 bg-blue-50/30 font-mono">
                                    {move.runningBalance !== undefined ? `${move.runningBalance.toLocaleString()} ${move.displayUnitName}` : '-'}
                                </td>
                                <td className="p-3 text-slate-500 text-xs max-w-xs truncate" title={move.notes}>{move.notes || '-'}</td>
                            </tr>
                        ))}
                    </tbody>
                    <tfoot className="bg-slate-100 font-bold border-t-2 border-slate-300">
                        <tr>
                            <td colSpan={5} className="p-3 text-left font-black text-slate-800">الإجمالي العام للفترة:</td>
                            <td className="p-3 text-center font-black font-mono text-emerald-700 bg-emerald-50">
                                +{totalIn.toLocaleString()} {currentUnitName}
                            </td>
                            <td className="p-3 text-center font-black font-mono text-red-700 bg-red-50">
                                -{totalOut.toLocaleString()} {currentUnitName}
                            </td>
                            <td className="p-3 text-center font-black font-mono text-blue-800 bg-blue-100 text-base">
                                {netBalance.toLocaleString()} {currentUnitName}
                            </td>
                            <td className="p-3 text-slate-600 text-xs font-semibold">
                                صافي رصيد المخزون (الوارد - الصادر)
                            </td>
                        </tr>
                    </tfoot>
                </table>
            </div>
        )}
      </div>
    </div>
  );
};

export default DetailedStockMovementReport;
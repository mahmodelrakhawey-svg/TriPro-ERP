import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../../supabaseClient';
import { useAccounting } from '../../context/AccountingContext';
import { Search, Download, Printer, Loader2, ArrowRightLeft } from 'lucide-react';
import * as XLSX from 'xlsx';
import ReportHeader from '../../components/ReportHeader';

type StockMovement = {
  id: string;
  date: string;
  type: 'IN' | 'OUT';
  docType: string;
  docNumber: string;
  productName: string;
  quantity: number;
  warehouseName: string;
  notes?: string;
};

const DetailedStockMovementReport = () => {
  const { products, warehouses, settings, currentUser } = useAccounting();
  const [startDate, setStartDate] = useState(`${new Date().getFullYear()}-01-01`);
  const [endDate, setEndDate] = useState(new Date().toISOString().split('T')[0]);
  const [selectedProduct, setSelectedProduct] = useState('');
  const [selectedWarehouse, setSelectedWarehouse] = useState('');
  const [movements, setMovements] = useState<StockMovement[]>([]);
  const [loading, setLoading] = useState(false);

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
      // 1. المبيعات (Sales) - إخراج (OUT)
      let salesQuery = supabase
        .from('invoice_items')
        .select('quantity, product_id, products(name), invoices!inner(invoice_number, invoice_date, status, warehouse_id, warehouses(name), notes)')
        .neq('invoices.status', 'draft')
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
          warehouseName: item.invoices.warehouses?.name,
          notes: item.invoices.notes
        });
      });

      // 2. المشتريات (Purchases) - إدخال (IN)
      let purchaseQuery = supabase
        .from('purchase_invoice_items')
        .select('quantity, product_id, products(name), purchase_invoices!purchase_invoice_items_purchase_invoice_id_fkey!inner(invoice_number, invoice_date, status, warehouse_id, warehouses(name), notes)')
        .neq('purchase_invoices.status', 'draft')
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
          warehouseName: item.purchase_invoices.warehouses?.name,
          notes: item.purchase_invoices.notes
        });
      });

      // 3. مرتجع مبيعات (Sales Return) - إدخال (IN)
      let salesRetQuery = supabase
        .from('sales_return_items')
        .select('quantity, product_id, products(name), sales_returns!inner(return_number, return_date, warehouse_id, warehouses(name), notes)')
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
          warehouseName: item.sales_returns.warehouses?.name,
          notes: item.sales_returns.notes
        });
      });

      // 4. مرتجع مشتريات (Purchase Return) - إخراج (OUT)
      let purRetQuery = supabase
        .from('purchase_return_items')
        .select('quantity, product_id, products(name), purchase_returns!inner(return_number, return_date, warehouse_id, warehouses(name), notes)')
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
          warehouseName: item.purchase_returns.warehouses?.name,
          notes: item.purchase_returns.notes
        });
      });

      // 5. التصنيع (Manufacturing)
      // أ. المنتج التام (IN)
      let productionInQuery = supabase
        .from('work_orders')
        .select('id, order_number, end_date, quantity, product_id, warehouse_id, products(name), warehouses(name), notes')
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
          quantity: item.quantity,
          warehouseName: item.warehouses?.name,
          notes: item.notes
        });
      });

      // ب. المواد الخام (OUT)
      let productionOutQuery = supabase
        .from('work_orders')
        .select('id, order_number, end_date, quantity, product_id, warehouse_id, warehouses(name), notes')
        .eq('status', 'completed')
        .gte('end_date', startDate)
        .lte('end_date', endDate);
      
      if (selectedWarehouse) productionOutQuery = productionOutQuery.eq('warehouse_id', selectedWarehouse);
      
      const { data: productionOut } = await productionOutQuery;
      
      if (productionOut && productionOut.length > 0) {
          const productIds = [...new Set(productionOut.map((wo: any) => wo.product_id))];
          
          const { data: boms } = await supabase
            .from('bill_of_materials')
            .select('product_id, raw_material_id, quantity_required, products:raw_material_id(name)')
            .in('product_id', productIds);
            
          if (boms) {
              productionOut.forEach((wo: any) => {
                  const productBoms = boms.filter((b: any) => b.product_id === wo.product_id);
                  productBoms.forEach((bom: any) => {
                      if (selectedProduct && bom.raw_material_id !== selectedProduct) return;
                      
                      const consumedQty = wo.quantity * bom.quantity_required;
                      allMovements.push({
                          id: `MFG-OUT-${wo.id}-${bom.raw_material_id}`,
                          date: wo.end_date,
                          type: 'OUT',
                          docType: 'تصنيع (مواد خام)',
                          docNumber: wo.order_number,
                          productName: bom.products?.name,
                          quantity: consumedQty,
                          warehouseName: wo.warehouses?.name,
                          notes: wo.notes
                      });
                  });
              });
          }
      }

      // 6. التسويات المخزنية (Stock Adjustments) - تشمل تسويات الجرد واليدوية
      let adjustmentsQuery = supabase
        .from('stock_adjustment_items')
        .select('quantity, product_id, products(name), stock_adjustments!inner(adjustment_number, adjustment_date, status, warehouse_id, warehouses(name), reason)')
        .neq('stock_adjustments.status', 'draft')
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
          warehouseName: item.stock_adjustments.warehouses?.name,
          notes: item.stock_adjustments.reason
        });
      });

      // 7. التحويلات المخزنية (Stock Transfers)
      let transfersQuery = supabase
        .from('stock_transfer_items')
        .select('quantity, product_id, products(name), stock_transfers!inner(transfer_number, transfer_date, from_warehouse_id, to_warehouse_id, status, notes)')
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
                      warehouseName: getWName(t.to_warehouse_id),
                      notes: `من: ${getWName(t.from_warehouse_id)} - ${t.notes || ''}`
                  });
              }
          } else {
              // عرض عام (بدون فلتر مستودع): نعرض التحويل كحركتين (أو حركة واحدة توضيحية)
              // الأفضل عرضها كحركة "نقل" ولكن الهيكل الحالي يدعم IN/OUT.
              // سنعرضها كحركة OUT من المصدر وحركة IN للمستلم ليكون التقرير دقيقاً وتفصيلياً
              allMovements.push({
                  id: `TRN-OUT-${t.transfer_number}-${item.product_id}`,
                  date: t.transfer_date,
                  type: 'OUT',
                  docType: 'تحويل صادر',
                  docNumber: t.transfer_number,
                  productName: item.products?.name,
                  quantity: item.quantity,
                  warehouseName: getWName(t.from_warehouse_id),
                  notes: `إلى: ${getWName(t.to_warehouse_id)}`
              });
              allMovements.push({
                  id: `TRN-IN-${t.transfer_number}-${item.product_id}`,
                  date: t.transfer_date,
                  type: 'IN',
                  docType: 'تحويل وارد',
                  docNumber: t.transfer_number,
                  productName: item.products?.name,
                  quantity: item.quantity,
                  warehouseName: getWName(t.to_warehouse_id),
                  notes: `من: ${getWName(t.from_warehouse_id)}`
              });
          }
      });

      // 8. رصيد أول المدة (Opening Inventory)
      let openingQuery = supabase
        .from('opening_inventories')
        .select('quantity, product_id, products(name), warehouse_id, created_at')
        // ملاحظة: تاريخ الإنشاء هو تاريخ الحركة هنا تقريباً
        .gte('created_at', `${startDate}T00:00:00`)
        .lte('created_at', `${endDate}T23:59:59`);

      if (selectedProduct) openingQuery = openingQuery.eq('product_id', selectedProduct);
      if (selectedWarehouse) openingQuery = openingQuery.eq('warehouse_id', selectedWarehouse);

      const { data: opening } = await openingQuery;
      opening?.forEach((item: any) => {
          allMovements.push({
              id: `OPEN-${item.product_id}-${item.created_at}`,
              date: item.created_at.split('T')[0],
              type: 'IN',
              docType: 'رصيد افتتاحي',
              docNumber: '-',
              productName: item.products?.name,
              quantity: item.quantity,
              warehouseName: getWName(item.warehouse_id),
              notes: 'بضاعة أول المدة'
          });
      });

      // ترتيب الحركات حسب التاريخ
      allMovements.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
      setMovements(allMovements);

    } catch (error) {
      console.error("Error fetching stock movements:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [startDate, endDate, selectedProduct, selectedWarehouse]);

  const exportToExcel = () => {
    const data = movements.map(m => ({
      'التاريخ': m.date,
      'نوع المستند': m.docType,
      'رقم المستند': m.docNumber,
      'الصنف': m.productName,
      'المستودع': m.warehouseName,
      'وارد': m.type === 'IN' ? m.quantity : 0,
      'صادر': m.type === 'OUT' ? m.quantity : 0,
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
        <button onClick={fetchData} className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 font-bold h-[42px]">
            عرض
        </button>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden print:shadow-none print:border-none">
        <ReportHeader title="تقرير حركة المخزون التفصيلي" subtitle={`الفترة من ${startDate} إلى ${endDate}`} />
        
        {loading ? (
            <div className="p-12 text-center"><Loader2 className="animate-spin mx-auto text-blue-600" size={32} /></div>
        ) : movements.length === 0 ? (
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
                            <th className="p-3 text-center bg-emerald-50 text-emerald-800">وارد</th>
                            <th className="p-3 text-center bg-red-50 text-red-800">صادر</th>
                            <th className="p-3">ملاحظات</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                        {movements.map((move, idx) => (
                            <tr key={idx} className="hover:bg-slate-50">
                                <td className="p-3 whitespace-nowrap">{move.date}</td>
                                <td className="p-3">
                                    <span className={`px-2 py-1 rounded text-xs font-bold ${
                                        move.docType.includes('مبيعات') ? 'bg-blue-100 text-blue-700' :
                                        move.docType.includes('مشتريات') ? 'bg-purple-100 text-purple-700' :
                                        'bg-slate-100 text-slate-700'
                                    }`}>
                                        {move.docType}
                                    </span>
                                </td>
                                <td className="p-3 font-mono font-bold text-slate-700">{move.docNumber}</td>
                                <td className="p-3 font-bold">{move.productName}</td>
                                <td className="p-3 text-slate-500">{move.warehouseName}</td>
                                <td className="p-3 text-center font-bold text-emerald-600 bg-emerald-50/30">
                                    {move.type === 'IN' ? move.quantity : '-'}
                                </td>
                                <td className="p-3 text-center font-bold text-red-600 bg-red-50/30">
                                    {move.type === 'OUT' ? move.quantity : '-'}
                                </td>
                                <td className="p-3 text-slate-500 text-xs max-w-xs truncate" title={move.notes}>{move.notes || '-'}</td>
                            </tr>
                        ))}
                    </tbody>
                    <tfoot className="bg-slate-100 font-bold border-t-2 border-slate-300">
                        <tr>
                            <td colSpan={5} className="p-3 text-left">الإجمالي:</td>
                            <td className="p-3 text-center text-emerald-700">
                                {movements.filter(m => m.type === 'IN').reduce((sum, m) => sum + m.quantity, 0)}
                            </td>
                            <td className="p-3 text-center text-red-700">
                                {movements.filter(m => m.type === 'OUT').reduce((sum, m) => sum + m.quantity, 0)}
                            </td>
                            <td></td>
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
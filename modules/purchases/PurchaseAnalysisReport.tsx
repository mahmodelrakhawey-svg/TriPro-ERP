import { useState, useEffect } from 'react';
import { useAccounting } from '../../context/AccountingContext';
import { supabase } from '../../supabaseClient';
import { BarChart2, Download, Printer, Loader2, Filter, Truck, Package } from 'lucide-react';
import * as XLSX from 'xlsx';
import ReportHeader from '../../components/ReportHeader';

type SupplierAnalysis = {
  supplierId: string;
  supplierName: string;
  totalAmount: number;
  orderCount: number;
};

type ItemAnalysis = {
  productId: string;
  productName: string;
  productSku: string;
  totalQuantity: number;
  totalAmount: number;
};

export default function PurchaseAnalysisReport() {
  const { currentUser } = useAccounting();
  const [loading, setLoading] = useState(false);
  const [startDate, setStartDate] = useState(new Date(new Date().getFullYear(), 0, 1).toISOString().split('T')[0]);
  const [endDate, setEndDate] = useState(new Date().toISOString().split('T')[0]);
  
  const [bySupplier, setBySupplier] = useState<SupplierAnalysis[]>([]);
  const [byItem, setByItem] = useState<ItemAnalysis[]>([]);

  useEffect(() => {
    fetchReport();
  }, []);

  const fetchReport = async () => {
    setLoading(true);
    if (currentUser?.role === 'demo') {
        setBySupplier([
            { supplierId: 'd1', supplierName: 'شركة التوريدات العالمية', totalAmount: 150000, orderCount: 12 },
            { supplierId: 'd2', supplierName: 'مصنع الجودة', totalAmount: 85000, orderCount: 5 }
        ]);
        setByItem([
            { productId: 'p1', productName: 'لابتوب HP', productSku: 'HP-001', totalQuantity: 10, totalAmount: 250000 },
            { productId: 'p2', productName: 'طابعة Canon', productSku: 'CN-002', totalQuantity: 5, totalAmount: 42500 }
        ]);
        setLoading(false);
        return;
    }

    try {
      const { data, error } = await supabase
        .from('purchase_invoice_items')
        .select(`
          quantity,
          price,
          purchase_invoices!purchase_invoice_items_purchase_invoice_id_fkey!inner (
            id,
            invoice_date,
            status,
            supplier_id,
            suppliers (name)
          ),
          products:product_id (id, name, sku)
        `)
        .gte('purchase_invoices.invoice_date', startDate)
        .lte('purchase_invoices.invoice_date', endDate)
        .eq('purchase_invoices.status', 'posted');

      if (error) throw error;

      const supplierMap: Record<string, SupplierAnalysis> = {};
      const itemMap: Record<string, ItemAnalysis> = {};
      const processedOrders = new Set<string>();

      data?.forEach((item: any) => {
        if (!item.purchase_invoices || !item.products) return;

        const supplierId = item.purchase_invoices.supplier_id;
        const supplierName = item.purchase_invoices.suppliers?.name || 'مورد غير محدد';
        const productId = item.products.id;
        const productName = item.products.name;
        const productSku = item.products.sku || '-';
        const amount = item.quantity * item.price;

        // Supplier Analysis
        if (!supplierMap[supplierId]) {
          supplierMap[supplierId] = { supplierId, supplierName, totalAmount: 0, orderCount: 0 };
        }
        supplierMap[supplierId].totalAmount += amount;
        if (!processedOrders.has(item.purchase_invoices.id)) {
            supplierMap[supplierId].orderCount++;
            processedOrders.add(item.purchase_invoices.id);
        }

        // Item Analysis
        if (!itemMap[productId]) {
          itemMap[productId] = { productId, productName, productSku, totalQuantity: 0, totalAmount: 0 };
        }
        itemMap[productId].totalQuantity += item.quantity;
        itemMap[productId].totalAmount += amount;
      });

      setBySupplier(Object.values(supplierMap).sort((a, b) => b.totalAmount - a.totalAmount));
      setByItem(Object.values(itemMap).sort((a, b) => b.totalAmount - a.totalAmount));

    } catch (err: any) {
      console.error("Error fetching purchase analysis:", err);
      alert("حدث خطأ: " + err.message);
    } finally {
      setLoading(false);
    }
  };
  
  const handleExportExcel = () => {
    const wb = XLSX.utils.book_new();
    
    const supplierData = bySupplier.map(s => ({
        'اسم المورد': s.supplierName,
        'إجمالي قيمة المشتريات': s.totalAmount,
        'عدد الفواتير': s.orderCount,
    }));
    const wsSupplier = XLSX.utils.json_to_sheet(supplierData);
    XLSX.utils.book_append_sheet(wb, wsSupplier, "تحليل حسب المورد");

    const itemData = byItem.map(i => ({
        'اسم الصنف': i.productName,
        'الكود': i.productSku,
        'إجمالي الكمية المشتراة': i.totalQuantity,
        'إجمالي قيمة المشتريات': i.totalAmount,
    }));
    const wsItem = XLSX.utils.json_to_sheet(itemData);
    XLSX.utils.book_append_sheet(wb, wsItem, "تحليل حسب الصنف");

    XLSX.writeFile(wb, `Purchase_Analysis_${startDate}_${endDate}.xlsx`);
  };

  return (
    <div className="max-w-6xl mx-auto p-6 animate-in fade-in space-y-6 print:p-0">
      <ReportHeader />
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 no-print">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
            <BarChart2 className="text-purple-600" /> تحليل المشتريات
          </h1>
          <p className="text-slate-500">نظرة عامة على المشتريات حسب المورد والصنف</p>
        </div>
        <div className="flex gap-2">
          <button onClick={handleExportExcel} className="flex items-center gap-2 bg-emerald-600 text-white px-4 py-2 rounded-lg hover:bg-emerald-700 font-bold text-sm shadow-sm">
            <Download size={16} /> تصدير Excel
          </button>
          <button onClick={() => window.print()} className="flex items-center gap-2 bg-slate-800 text-white px-4 py-2 rounded-lg hover:bg-slate-700 font-bold text-sm shadow-sm">
            <Printer size={16} /> طباعة
          </button>
        </div>
      </div>

      <div className="hidden print:block text-center mb-6">
          <h1 className="text-2xl font-bold">تقرير تحليل المشتريات</h1>
          <p className="text-sm text-slate-500">عن الفترة من {startDate} إلى {endDate}</p>
      </div>

      <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 no-print">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
          <div>
            <label className="block text-sm font-bold text-slate-700 mb-1">من تاريخ</label>
            <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="w-full border border-slate-300 rounded-lg px-3 py-2 focus:outline-none focus:border-purple-500" />
          </div>
          <div>
            <label className="block text-sm font-bold text-slate-700 mb-1">إلى تاريخ</label>
            <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="w-full border border-slate-300 rounded-lg px-3 py-2 focus:outline-none focus:border-purple-500" />
          </div>
          <button onClick={fetchReport} disabled={loading} className="bg-purple-600 text-white px-6 py-2 rounded-lg hover:bg-purple-700 font-bold shadow-sm disabled:opacity-50 flex items-center justify-center gap-2">
            {loading ? <Loader2 className="animate-spin" size={18} /> : <Filter size={18} />}
            عرض التقرير
          </button>
        </div>
      </div>

      {loading ? (
        <div className="text-center p-12"><Loader2 className="animate-spin text-purple-600" size={32} /></div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Analysis by Supplier */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
            <h3 className="text-lg font-bold text-slate-800 p-4 border-b border-slate-100 flex items-center gap-2 bg-slate-50">
              <Truck size={18} className="text-purple-600" /> تحليل حسب المورد
            </h3>
            <table className="w-full text-right text-sm">
              <thead className="text-slate-600 font-bold">
                <tr>
                  <th className="p-3">المورد</th>
                  <th className="p-3 text-center">عدد الفواتير</th>
                  <th className="p-3 text-left">إجمالي القيمة</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {bySupplier.map(s => (
                  <tr key={s.supplierId} className="hover:bg-purple-50">
                    <td className="p-3 font-medium text-slate-800">{s.supplierName}</td>
                    <td className="p-3 text-center font-mono">{s.orderCount}</td>
                    <td className="p-3 text-left font-bold text-purple-700">{s.totalAmount.toLocaleString(undefined, {minimumFractionDigits: 2})}</td>
                  </tr>
                ))}
                {bySupplier.length === 0 && (
                    <tr><td colSpan={3} className="p-8 text-center text-slate-400">لا توجد مشتريات في هذه الفترة</td></tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Analysis by Item */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
            <h3 className="text-lg font-bold text-slate-800 p-4 border-b border-slate-100 flex items-center gap-2 bg-slate-50">
              <Package size={18} className="text-purple-600" /> تحليل حسب الصنف
            </h3>
            <table className="w-full text-right text-sm">
              <thead className="text-slate-600 font-bold">
                <tr>
                  <th className="p-3">الصنف</th>
                  <th className="p-3 text-center">الكمية</th>
                  <th className="p-3 text-left">إجمالي القيمة</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {byItem.map(i => (
                  <tr key={i.productId} className="hover:bg-purple-50">
                    <td className="p-3 font-medium text-slate-800">
                        {i.productName}
                        <span className="block text-xs text-slate-400 font-mono">{i.productSku}</span>
                    </td>
                    <td className="p-3 text-center font-mono">{i.totalQuantity}</td>
                    <td className="p-3 text-left font-bold text-purple-700">{i.totalAmount.toLocaleString(undefined, {minimumFractionDigits: 2})}</td>
                  </tr>
                ))}
                {byItem.length === 0 && (
                    <tr><td colSpan={3} className="p-8 text-center text-slate-400">لا توجد مشتريات في هذه الفترة</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
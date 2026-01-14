﻿﻿﻿import React, { useState, useEffect } from 'react';
import { supabase } from '../../supabaseClient';
import { useAccounting } from '../../context/AccountingContext';
import { History, Search, ArrowUpRight, ArrowDownLeft, Filter, Loader2, Printer, Package, AlertCircle } from 'lucide-react';

type Transaction = {
  id: string;
  date: string;
  type: 'IN' | 'OUT';
  quantity: number;
  documentType: string;
  documentNumber: string;
  warehouseName?: string;
  balance?: number;
};

const StockCard = () => {
  const { currentUser, warehouses, products } = useAccounting();
  const [selectedProductId, setSelectedProductId] = useState('');
  const [selectedWarehouseId, setSelectedWarehouseId] = useState('');
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(false);
  const [currentStock, setCurrentStock] = useState(0);

  // جلب الحركات عند تغيير الصنف أو المستودع
  useEffect(() => {
    if (selectedProductId) {
      fetchTransactions();
    } else {
      setTransactions([]);
      setCurrentStock(0);
    }
  }, [selectedProductId, selectedWarehouseId]);

  const fetchTransactions = async () => {
    setLoading(true);
    if (currentUser?.role === 'demo') {
        setTransactions([
            { id: 'd1', date: new Date().toISOString().split('T')[0], type: 'IN', quantity: 10, documentType: 'فاتورة مشتريات', documentNumber: 'PINV-D-01', warehouseName: 'المستودع الرئيسي', balance: 10 },
            { id: 'd2', date: new Date().toISOString().split('T')[0], type: 'OUT', quantity: 2, documentType: 'فاتورة مبيعات', documentNumber: 'INV-D-01', warehouseName: 'المستودع الرئيسي', balance: 8 },
        ]);
        const product = products.find(p => p.id === selectedProductId);
        if (product) setCurrentStock(product.stock);
        setLoading(false);
        return;
    }

    try {
      const product = products.find(p => p.id === selectedProductId);
      if (product) setCurrentStock(product.stock);

      // بناء الاستعلامات لجلب الحركات من جداول مختلفة
      let querySales = supabase.from('invoice_items').select('quantity, invoices!inner(id, invoice_date, invoice_number, warehouse_id)').eq('product_id', selectedProductId);
      let queryPurchases = supabase.from('purchase_invoice_items').select('quantity, purchase_invoices!purchase_invoice_items_purchase_invoice_id_fkey!inner(id, invoice_date, invoice_number, warehouse_id)').eq('product_id', selectedProductId);
      let querySalesReturns = supabase.from('sales_return_items').select('quantity, sales_returns!inner(id, return_date, return_number, warehouse_id)').eq('product_id', selectedProductId);
      let queryPurchaseReturns = supabase.from('purchase_return_items').select('quantity, purchase_returns!inner(id, return_date, return_number, warehouse_id)').eq('product_id', selectedProductId);
      let queryAdjustments = supabase.from('stock_adjustment_items').select('quantity, stock_adjustments!inner(id, adjustment_date, adjustment_number, warehouse_id)').eq('product_id', selectedProductId);

      // تطبيق فلتر المستودع إذا تم اختياره
      if (selectedWarehouseId) {
        querySales = querySales.eq('invoices.warehouse_id', selectedWarehouseId);
        queryPurchases = queryPurchases.eq('purchase_invoices.warehouse_id', selectedWarehouseId);
        querySalesReturns = querySalesReturns.eq('sales_returns.warehouse_id', selectedWarehouseId);
        queryPurchaseReturns = queryPurchaseReturns.eq('purchase_returns.warehouse_id', selectedWarehouseId);
        queryAdjustments = queryAdjustments.eq('stock_adjustments.warehouse_id', selectedWarehouseId);
      }

      // تنفيذ الاستعلامات بالتوازي
      const [sales, purchases, sReturns, pReturns, adjustments] = await Promise.all([
        querySales, queryPurchases, querySalesReturns, queryPurchaseReturns, queryAdjustments
      ]);

      const allTxns: Transaction[] = [];
      const getWName = (id: string) => warehouses.find(w => w.id === id)?.name || '-';

      // معالجة المبيعات (صادر)
      sales.data?.forEach((item: any) => {
        allTxns.push({
          id: `SALE-${item.invoices.id}`,
          date: item.invoices.invoice_date,
          type: 'OUT',
          quantity: item.quantity,
          documentType: 'فاتورة مبيعات',
          documentNumber: item.invoices.invoice_number,
          warehouseName: getWName(item.invoices.warehouse_id)
        });
      });

      // معالجة المشتريات (وارد)
      purchases.data?.forEach((item: any) => {
        allTxns.push({
          id: `PUR-${item.purchase_invoices.id}`,
          date: item.purchase_invoices.invoice_date,
          type: 'IN',
          quantity: item.quantity,
          documentType: 'فاتورة مشتريات',
          documentNumber: item.purchase_invoices.invoice_number,
          warehouseName: getWName(item.purchase_invoices.warehouse_id)
        });
      });

      // معالجة مرتجعات المبيعات (وارد)
      sReturns.data?.forEach((item: any) => {
        allTxns.push({
          id: `SR-${item.sales_returns.id}`,
          date: item.sales_returns.return_date,
          type: 'IN',
          quantity: item.quantity,
          documentType: 'مرتجع مبيعات',
          documentNumber: item.sales_returns.return_number,
          warehouseName: getWName(item.sales_returns.warehouse_id)
        });
      });

      // معالجة مرتجعات المشتريات (صادر)
      pReturns.data?.forEach((item: any) => {
        allTxns.push({
          id: `PR-${item.purchase_returns.id}`,
          date: item.purchase_returns.return_date,
          type: 'OUT',
          quantity: item.quantity,
          documentType: 'مرتجع مشتريات',
          documentNumber: item.purchase_returns.return_number,
          warehouseName: getWName(item.purchase_returns.warehouse_id)
        });
      });

      // معالجة التسويات المخزنية (وارد أو صادر حسب الإشارة)
      adjustments.data?.forEach((item: any) => {
        allTxns.push({
          id: `ADJ-${item.stock_adjustments.id}`,
          date: item.stock_adjustments.adjustment_date,
          type: item.quantity >= 0 ? 'IN' : 'OUT',
          quantity: Math.abs(item.quantity),
          documentType: 'تسوية مخزنية',
          documentNumber: item.stock_adjustments.adjustment_number,
          warehouseName: getWName(item.stock_adjustments.warehouse_id)
        });
      });

      // ترتيب زمني (من الأقدم للأحدث) لحساب الرصيد التراكمي
      allTxns.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

      let balance = 0;
      const txnsWithBalance = allTxns.map(t => {
        if (t.type === 'IN') balance += t.quantity;
        else balance -= t.quantity;
        return { ...t, balance };
      });

      // عكس الترتيب للعرض (الأحدث أولاً)
      setTransactions(txnsWithBalance.reverse());

    } catch (error) {
      console.error("Error fetching transactions:", error);
    } finally {
      setLoading(false);
    }
  };

  const selectedProduct = products.find(p => p.id === selectedProductId);

  return (
    <div className="space-y-6 animate-in fade-in">
      <div className="flex justify-between items-center print:hidden">
        <div>
          <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
            <History className="text-blue-600" /> كارت الصنف (حركة المخزون)
          </h2>
          <p className="text-slate-500">تتبع حركات الوارد والصادر والرصيد لكل صنف</p>
        </div>
        <button onClick={() => window.print()} className="bg-slate-800 text-white px-4 py-2 rounded-lg flex items-center gap-2 hover:bg-slate-700">
            <Printer size={18} /> طباعة الكارت
        </button>
      </div>

      <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 grid grid-cols-1 md:grid-cols-2 gap-6 print:hidden">
        <div>
          <label className="block text-sm font-bold text-slate-700 mb-1">بحث واختيار الصنف</label>
          <div className="relative">
             <Search className="absolute right-3 top-3 text-slate-400" size={18} />
             <select 
                className="w-full border rounded-lg p-2.5 pr-10 appearance-none outline-none focus:ring-2 focus:ring-blue-500" 
                value={selectedProductId} 
                onChange={e => setSelectedProductId(e.target.value)}
             >
                <option value="">-- اختر الصنف --</option>
                {products.map(p => <option key={p.id} value={p.id}>{p.name} {p.sku ? `(${p.sku})` : ''}</option>)}
             </select>
          </div>
        </div>
        <div>
          <label className="block text-sm font-bold text-slate-700 mb-1">المستودع (اختياري)</label>
          <select className="w-full border rounded-lg p-2.5" value={selectedWarehouseId} onChange={e => setSelectedWarehouseId(e.target.value)}>
            <option value="">-- كل المستودعات --</option>
            {warehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
          </select>
        </div>
      </div>

      {selectedProductId && (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="p-6 bg-slate-50 border-b flex flex-col md:flex-row justify-between items-center gap-4">
            <div className="flex items-center gap-4">
                <div className="p-3 bg-white rounded-lg border border-slate-200 shadow-sm">
                    <Package size={32} className="text-blue-600" />
                </div>
                <div>
                    <h3 className="font-black text-xl text-slate-800">{selectedProduct?.name}</h3>
                    <p className="text-slate-500 font-mono text-sm">{selectedProduct?.sku || 'No SKU'}</p>
                </div>
            </div>
            <div className="flex gap-6 text-center">
                <div className="bg-white px-6 py-2 rounded-lg border border-slate-200 shadow-sm">
                    <p className="text-xs text-slate-500 font-bold uppercase">الرصيد الحالي</p>
                    <p className="text-2xl font-black text-blue-600" dir="ltr">
                        {transactions.length > 0 ? transactions[0].balance : (selectedProduct?.stock || 0)}
                    </p>
                </div>
                {selectedWarehouseId && (
                    <div className="bg-white px-6 py-2 rounded-lg border border-slate-200 shadow-sm">
                        <p className="text-xs text-slate-500 font-bold uppercase">رصيد المستودع</p>
                        <p className="text-2xl font-black text-slate-800" dir="ltr">
                            {transactions.length > 0 ? transactions[0].balance : 0}
                        </p>
                    </div>
                )}
            </div>
          </div>

          {loading ? (
              <div className="p-12 text-center flex justify-center">
                  <Loader2 className="animate-spin text-blue-600" size={32} />
              </div>
          ) : (
            <table className="w-full text-right">
                <thead className="bg-slate-100 text-slate-600 font-bold text-sm border-b">
                <tr>
                    <th className="p-4">التاريخ</th>
                    <th className="p-4">نوع الحركة</th>
                    <th className="p-4">المستند</th>
                    <th className="p-4">المستودع</th>
                    <th className="p-4 text-center text-emerald-700 bg-emerald-50">وارد (+)</th>
                    <th className="p-4 text-center text-red-700 bg-red-50">صادر (-)</th>
                    <th className="p-4 text-center">الرصيد</th>
                </tr>
                </thead>
                <tbody className="divide-y">
                {transactions.map(t => (
                    <tr key={t.id} className="hover:bg-slate-50 transition-colors">
                        <td className="p-4 text-slate-600 font-medium">{new Date(t.date).toLocaleDateString('ar-EG')}</td>
                        <td className="p-4 font-bold text-slate-700">{t.documentType}</td>
                        <td className="p-4 font-mono text-sm text-slate-500">{t.documentNumber || '-'}</td>
                        <td className="p-4 text-sm">{t.warehouseName}</td>
                        <td className="p-4 text-center font-bold text-emerald-600 bg-emerald-50/30">
                            {t.type === 'IN' ? t.quantity : '-'}
                        </td>
                        <td className="p-4 text-center font-bold text-red-600 bg-red-50/30">
                            {t.type === 'OUT' ? t.quantity : '-'}
                        </td>
                        <td className="p-4 text-center font-black text-slate-800 bg-slate-50" dir="ltr">
                            {t.balance}
                        </td>
                    </tr>
                ))}
                {transactions.length === 0 && (
                    <tr><td colSpan={7} className="p-12 text-center text-slate-400 flex flex-col items-center justify-center gap-2">
                        <AlertCircle size={32} />
                        لا توجد حركات مسجلة لهذا الصنف
                    </td></tr>
                )}
                </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
};

export default StockCard;

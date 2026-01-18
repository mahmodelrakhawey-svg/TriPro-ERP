import React, { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useAccounting } from '../../context/AccountingContext';
import { supabase } from '../../supabaseClient';
import { BarChart3, Calendar, Filter, Download, TrendingUp, Users, Package, UserCheck, Loader2, ShoppingCart, Wallet } from 'lucide-react';
import * as XLSX from 'xlsx';

const PurchaseReports = () => {
  const { currentUser } = useAccounting();
  const [invoices, setInvoices] = useState<any[]>([]);
  const [invoiceItems, setInvoiceItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [startDate, setStartDate] = useState(new Date(new Date().getFullYear(), 0, 1).toISOString().split('T')[0]);
  const [endDate, setEndDate] = useState(new Date().toISOString().split('T')[0]);
  const [activeTab, setActiveTab] = useState<'general' | 'suppliers' | 'products'>('general');

  useEffect(() => {
    if (currentUser?.role === 'demo') {
        setInvoices([
            { id: 'pi1', invoice_number: 'PINV-D-01', suppliers: { name: 'شركة التوريدات العالمية' }, total_amount: 15000, tax_amount: 2250, invoice_date: startDate },
            { id: 'pi2', invoice_number: 'PINV-D-02', suppliers: { name: 'مصنع الجودة' }, total_amount: 8000, tax_amount: 1200, invoice_date: startDate },
            { id: 'pi3', invoice_number: 'PINV-D-03', suppliers: { name: 'شركة التوريدات العالمية' }, total_amount: 10000, tax_amount: 1500, invoice_date: endDate },
        ]);
        setInvoiceItems([
            { products: { name: 'لابتوب HP' }, quantity: 5, total: 12500 },
            { products: { name: 'طابعة Canon' }, quantity: 2, total: 2500 },
            { products: { name: 'شاشة Dell' }, quantity: 4, total: 8000 },
        ]);
        setLoading(false);
    } else {
        fetchData();
    }
  }, [startDate, endDate]);

  const fetchData = async () => {
    setLoading(true);
    try {
      // Fetch Purchase Invoices
      const { data: invData, error: invError } = await supabase
        .from('purchase_invoices')
        .select('*, suppliers(name)')
        .gte('invoice_date', startDate)
        .lte('invoice_date', endDate);

      if (invError) throw invError;
      setInvoices(invData || []);

      if (invData && invData.length > 0) {
          const invIds = invData.map(i => i.id);
          // Fetch Invoice Items for product analysis
          const { data: itemsData, error: itemsError } = await supabase
            .from('purchase_invoice_items')
            .select('*, products(name)')
            .in('invoice_id', invIds);
            
          if (itemsError) throw itemsError;
          setInvoiceItems(itemsData || []);
      } else {
          setInvoiceItems([]);
      }

    } catch (error: any) {
      console.error('Error fetching purchase data:', error);
    } finally {
      setLoading(false);
    }
  };

  // Calculations
  const totalPurchases = invoices.reduce((sum, inv) => sum + (inv.total_amount || 0), 0);
  const totalTax = invoices.reduce((sum, inv) => sum + (inv.tax_amount || 0), 0);
  const netPurchases = totalPurchases - totalTax;
  const invoiceCount = invoices.length;
  const averageInvoiceValue = invoiceCount > 0 ? totalPurchases / invoiceCount : 0;

  // Purchases by Supplier
  const purchasesBySupplier = useMemo(() => {
      const grouped: Record<string, { name: string, count: number, total: number }> = {};
      invoices.forEach(inv => {
          const name = inv.suppliers?.name || 'Unknown';
          if (!grouped[name]) grouped[name] = { name, count: 0, total: 0 };
          grouped[name].count += 1;
          grouped[name].total += inv.total_amount || 0;
      });
      return Object.values(grouped).sort((a, b) => b.total - a.total);
  }, [invoices]);

  // Purchases by Product
  const purchasesByProduct = useMemo(() => {
      const grouped: Record<string, { name: string, quantity: number, total: number }> = {};
      invoiceItems.forEach(item => {
          const name = item.products?.name || 'Unknown';
          if (!grouped[name]) grouped[name] = { name, quantity: 0, total: 0 };
          grouped[name].quantity += item.quantity || 0;
          grouped[name].total += item.total || 0;
      });
      return Object.values(grouped).sort((a, b) => b.total - a.total);
  }, [invoiceItems]);

  const handleExport = () => {
      // Export logic based on active tab
      let dataToExport: any[] = [];
      let sheetName = '';

      if (activeTab === 'general') {
          dataToExport = invoices.map(inv => ({
              'رقم الفاتورة': inv.invoice_number,
              'التاريخ': inv.invoice_date,
              'المورد': inv.suppliers?.name,
              'الإجمالي': inv.total_amount
          }));
          sheetName = 'Purchases_General';
      } else if (activeTab === 'suppliers') {
          dataToExport = purchasesBySupplier.map(s => ({
              'المورد': s.name,
              'عدد الفواتير': s.count,
              'إجمالي المشتريات': s.total
          }));
          sheetName = 'Purchases_By_Supplier';
      } else if (activeTab === 'products') {
          dataToExport = purchasesByProduct.map(p => ({
              'المنتج': p.name,
              'الكمية المشتراة': p.quantity,
              'إجمالي التكلفة': p.total
          }));
          sheetName = 'Purchases_By_Product';
      }

      const ws = XLSX.utils.json_to_sheet(dataToExport);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, sheetName);
      XLSX.writeFile(wb, `${sheetName}_${startDate}_${endDate}.xlsx`);
  };

  return (
    <div className="space-y-6 animate-in fade-in">
        {/* Header */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
            <div>
                <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
                    <BarChart3 className="text-blue-600" /> تقارير المشتريات التفصيلية
                </h2>
                <p className="text-slate-500">تحليل شامل لأداء المشتريات، الموردين، والمنتجات</p>
            </div>
            <div className="flex gap-2">
                <Link to="/supplier-balances" className="flex items-center gap-2 bg-white border border-slate-300 text-slate-700 px-4 py-2 rounded-lg hover:bg-slate-50 font-bold text-sm shadow-sm transition-all">
                    <Wallet size={16} /> أرصدة الموردين
                </Link>
                <button onClick={handleExport} className="flex items-center gap-2 bg-emerald-600 text-white px-4 py-2 rounded-lg hover:bg-emerald-700 font-bold text-sm shadow-sm">
                    <Download size={16} /> تصدير Excel
                </button>
            </div>
        </div>

        {/* Filters */}
        <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 flex flex-wrap items-end gap-4">
            <div>
                <label className="block text-xs font-bold text-slate-500 mb-1">من تاريخ</label>
                <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500" />
            </div>
            <div>
                <label className="block text-xs font-bold text-slate-500 mb-1">إلى تاريخ</label>
                <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500" />
            </div>
            <button onClick={fetchData} className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 font-bold text-sm shadow-sm flex items-center gap-2">
                {loading ? <Loader2 className="animate-spin" size={16} /> : <Filter size={16} />} تحديث
            </button>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
                <div className="flex items-center gap-3 mb-2">
                    <div className="p-2 bg-blue-50 text-blue-600 rounded-lg"><ShoppingCart size={20} /></div>
                    <span className="text-sm font-bold text-slate-500">إجمالي المشتريات</span>
                </div>
                <h3 className="text-2xl font-black text-slate-800">{totalPurchases.toLocaleString()} <span className="text-xs font-normal text-slate-400">ج.م</span></h3>
            </div>
            <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
                <div className="flex items-center gap-3 mb-2">
                    <div className="p-2 bg-emerald-50 text-emerald-600 rounded-lg"><Package size={20} /></div>
                    <span className="text-sm font-bold text-slate-500">صافي المشتريات</span>
                </div>
                <h3 className="text-2xl font-black text-slate-800">{netPurchases.toLocaleString()} <span className="text-xs font-normal text-slate-400">ج.م</span></h3>
            </div>
            <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
                <div className="flex items-center gap-3 mb-2">
                    <div className="p-2 bg-indigo-50 text-indigo-600 rounded-lg"><Users size={20} /></div>
                    <span className="text-sm font-bold text-slate-500">عدد الفواتير</span>
                </div>
                <h3 className="text-2xl font-black text-slate-800">{invoiceCount}</h3>
            </div>
            <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
                <div className="flex items-center gap-3 mb-2">
                    <div className="p-2 bg-amber-50 text-amber-600 rounded-lg"><UserCheck size={20} /></div>
                    <span className="text-sm font-bold text-slate-500">متوسط الفاتورة</span>
                </div>
                <h3 className="text-2xl font-black text-slate-800">{averageInvoiceValue.toLocaleString(undefined, {maximumFractionDigits: 0})} <span className="text-xs font-normal text-slate-400">ج.م</span></h3>
            </div>
        </div>

        {/* Tabs */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden min-h-[400px]">
            <div className="flex border-b border-slate-100">
                <button 
                    onClick={() => setActiveTab('general')}
                    className={`flex-1 py-4 font-bold text-sm transition-colors ${activeTab === 'general' ? 'text-blue-600 border-b-2 border-blue-600 bg-blue-50/50' : 'text-slate-500 hover:bg-slate-50'}`}
                >
                    سجل الفواتير
                </button>
                <button 
                    onClick={() => setActiveTab('suppliers')}
                    className={`flex-1 py-4 font-bold text-sm transition-colors ${activeTab === 'suppliers' ? 'text-blue-600 border-b-2 border-blue-600 bg-blue-50/50' : 'text-slate-500 hover:bg-slate-50'}`}
                >
                    تحليل الموردين
                </button>
                <button 
                    onClick={() => setActiveTab('products')}
                    className={`flex-1 py-4 font-bold text-sm transition-colors ${activeTab === 'products' ? 'text-blue-600 border-b-2 border-blue-600 bg-blue-50/50' : 'text-slate-500 hover:bg-slate-50'}`}
                >
                    تحليل المنتجات
                </button>
            </div>

            <div className="p-0">
                {loading ? (
                    <div className="flex justify-center items-center h-64">
                        <Loader2 className="animate-spin text-blue-600" size={32} />
                    </div>
                ) : (
                    <>
                        {activeTab === 'general' && (
                            <table className="w-full text-right">
                                <thead className="bg-slate-50 text-slate-500 text-xs uppercase font-bold">
                                    <tr>
                                        <th className="px-6 py-3">رقم الفاتورة</th>
                                        <th className="px-6 py-3">التاريخ</th>
                                        <th className="px-6 py-3">المورد</th>
                                        <th className="px-6 py-3">الإجمالي</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {invoices.map(inv => (
                                        <tr key={inv.id} className="hover:bg-slate-50">
                                            <td className="px-6 py-3 font-mono text-blue-600">{inv.invoice_number}</td>
                                            <td className="px-6 py-3 text-slate-600">{inv.invoice_date}</td>
                                            <td className="px-6 py-3 font-bold text-slate-700">{inv.suppliers?.name}</td>
                                            <td className="px-6 py-3 font-bold">{inv.total_amount.toLocaleString()}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        )}

                        {activeTab === 'suppliers' && (
                            <table className="w-full text-right">
                                <thead className="bg-slate-50 text-slate-500 text-xs uppercase font-bold">
                                    <tr>
                                        <th className="px-6 py-3">المورد</th>
                                        <th className="px-6 py-3 text-center">عدد الفواتير</th>
                                        <th className="px-6 py-3 text-center">إجمالي المشتريات</th>
                                        <th className="px-6 py-3 text-center">النسبة</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {purchasesBySupplier.map((s, idx) => (
                                        <tr key={idx} className="hover:bg-slate-50">
                                            <td className="px-6 py-3 font-bold text-slate-700">{s.name}</td>
                                            <td className="px-6 py-3 text-center">{s.count}</td>
                                            <td className="px-6 py-3 text-center font-bold text-emerald-600">{s.total.toLocaleString()}</td>
                                            <td className="px-6 py-3 text-center">
                                                <div className="flex items-center gap-2 justify-center">
                                                    <div className="w-16 h-2 bg-slate-100 rounded-full overflow-hidden">
                                                        <div className="h-full bg-blue-500" style={{ width: `${(s.total / totalPurchases * 100) || 0}%` }}></div>
                                                    </div>
                                                    <span className="text-xs text-slate-500">{((s.total / totalPurchases * 100) || 0).toFixed(1)}%</span>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        )}

                        {activeTab === 'products' && (
                            <table className="w-full text-right">
                                <thead className="bg-slate-50 text-slate-500 text-xs uppercase font-bold">
                                    <tr>
                                        <th className="px-6 py-3">المنتج</th>
                                        <th className="px-6 py-3 text-center">الكمية المشتراة</th>
                                        <th className="px-6 py-3 text-center">إجمالي التكلفة</th>
                                        <th className="px-6 py-3 text-center">النسبة</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {purchasesByProduct.map((p, idx) => (
                                        <tr key={idx} className="hover:bg-slate-50">
                                            <td className="px-6 py-3 font-bold text-slate-700">{p.name}</td>
                                            <td className="px-6 py-3 text-center">{p.quantity}</td>
                                            <td className="px-6 py-3 text-center font-bold text-blue-600">{p.total.toLocaleString()}</td>
                                            <td className="px-6 py-3 text-center">
                                                <div className="flex items-center gap-2 justify-center">
                                                    <div className="w-16 h-2 bg-slate-100 rounded-full overflow-hidden">
                                                        <div className="h-full bg-blue-500" style={{ width: `${(p.total / totalPurchases * 100) || 0}%` }}></div>
                                                    </div>
                                                    <span className="text-xs text-slate-500">{((p.total / totalPurchases * 100) || 0).toFixed(1)}%</span>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        )}
                    </>
                )}
            </div>
        </div>
    </div>
  );
};

export default PurchaseReports;

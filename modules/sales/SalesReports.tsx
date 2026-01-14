import React, { useState, useMemo } from 'react';
import { useAccounting } from '../../context/AccountingContext';
import { 
    Users, User, Calendar, BarChart3, TrendingUp, 
    Target, Package, Download, Printer, Percent, CircleDollarSign,
    ListFilter, Award, Store, Smartphone, LayoutGrid, Building2, MapPin
} from 'lucide-react';
import * as XLSX from 'xlsx';

const SalesReports = () => {
  const { invoices, salespeople, customers, settings, warehouses } = useAccounting();
  
  // Tab State
  const [activeView, setActiveView] = useState<'products' | 'branches' | 'commissions'>('products');

  // Filter States
  const [salespersonId, setSalespersonId] = useState('all');
  const [customerId, setCustomerId] = useState('all');
  const [customerType, setCustomerType] = useState('all');
  const [startDate, setStartDate] = useState(new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0]);
  const [endDate, setEndDate] = useState(new Date().toISOString().split('T')[0]);
  const [commissionRate, setCommissionRate] = useState(2); 

  // --- CORE LOGIC ---
  const analytics = useMemo(() => {
    // 1. Filter Invoices
    const filteredInvoices = (invoices || []).filter((inv: any) => {
        const matchSalesperson = salespersonId === 'all' || inv.salespersonId === salespersonId;
        const matchCustomer = customerId === 'all' || inv.customerId === customerId;
        const matchDate = inv.date >= startDate && inv.date <= endDate;
        
        let matchType = true;
        if (customerType !== 'all') {
            const customer = (customers || []).find(c => c.id === inv.customerId);
            const type = customer?.customerType || 'store';
            matchType = type === customerType;
        }

        return matchSalesperson && matchCustomer && matchDate && matchType && inv.status !== 'draft';
    });

    // 2. Aggregate Data
    const productSalesMap: Record<string, { name: string, sku: string, qty: number, total: number }> = {};
    const salespersonStatsMap: Record<string, { name: string, qty: number, total: number, commission: number }> = {};
    const branchStatsMap: Record<string, { name: string, storeSales: number, onlineSales: number, total: number }> = {};
    
    let totalRevenue = 0;
    let totalItems = 0;

    filteredInvoices.forEach((inv: any) => {
        totalRevenue += inv.totalAmount;
        
        // --- Branch Analytics Logic ---
        const wid = inv.warehouseId || 'unassigned';
        if (!branchStatsMap[wid]) {
            const wName = (warehouses || []).find(w => w.id === wid)?.name || 'فرع غير معروف';
            branchStatsMap[wid] = { name: wName, storeSales: 0, onlineSales: 0, total: 0 };
        }
        
        const customer = (customers || []).find(c => c.id === inv.customerId);
        const isOnline = customer?.customerType === 'online';
        
        branchStatsMap[wid].total += inv.totalAmount;
        if (isOnline) branchStatsMap[wid].onlineSales += inv.totalAmount;
        else branchStatsMap[wid].storeSales += inv.totalAmount;

        // --- Salesperson Stats ---
        const sid = inv.salespersonId || 'unassigned';
        if (!salespersonStatsMap[sid]) {
            const sName = (salespeople || []).find(s => s.id === sid)?.name || 'غير محدد';
            salespersonStatsMap[sid] = { name: sName, qty: 0, total: 0, commission: 0 };
        }
        salespersonStatsMap[sid].total += inv.totalAmount;

        // --- Product Stats ---
        inv.items.forEach(item => {
            if (!item.productId) return;
            totalItems += item.quantity;
            salespersonStatsMap[sid].qty += item.quantity;

            if (!productSalesMap[item.productId]) {
                productSalesMap[item.productId] = { 
                    name: item.productName, 
                    sku: item.productSku || '-', 
                    qty: 0, 
                    total: 0 
                };
            }
            productSalesMap[item.productId].qty += item.quantity;
            productSalesMap[item.productId].total += item.total;
        });
    });

    Object.keys(salespersonStatsMap).forEach(key => {
        salespersonStatsMap[key].commission = (salespersonStatsMap[key].total * commissionRate) / 100;
    });

    const productList = Object.values(productSalesMap).sort((a, b) => b.total - a.total);
    const salespersonList = Object.values(salespersonStatsMap).sort((a, b) => b.total - a.total);
    const branchList = Object.values(branchStatsMap).sort((a, b) => b.total - a.total);
    const commission = (totalRevenue * commissionRate) / 100;

    return { productList, salespersonList, branchList, totalRevenue, totalItems, commission, invoiceCount: filteredInvoices.length };
  }, [invoices, salespersonId, customerId, customerType, startDate, endDate, commissionRate, salespeople, warehouses, customers]);

  // --- EXPORT LOGIC ---
  const handleExport = () => {
      let dataToExport: any[] = [];
      let sheetName = '';

      if (activeView === 'branches') {
          dataToExport = analytics.branchList.map(b => ({
              'الفرع / الموقع': b.name,
              'مبيعات الصالة': b.storeSales,
              'مبيعات الأونلاين': b.onlineSales,
              'إجمالي مبيعات الفرع': b.total,
              'العملة': settings.currency
          }));
          sheetName = `تحليل_مبيعات_الفروع_${startDate}_إلى_${endDate}`;
      } else if (salespersonId === 'all') {
          dataToExport = analytics.salespersonList.map(s => ({
              'اسم المندوب / البائع': s.name,
              'إجمالي القطع المباعة': s.qty,
              'إجمالي قيمة المبيعات': s.total,
              [`العمولة المستحقة (${commissionRate}%)`]: s.commission
          }));
          sheetName = `تقرير_عمولات_المناديب_${startDate}_إلى_${endDate}`;
      } else {
          dataToExport = analytics.productList.map(p => ({
              'اسم الصنف': p.name,
              'SKU': p.sku,
              'الكمية المباعة': p.qty,
              'إجمالي القيمة': p.total
          }));
          sheetName = `مبيعات_الأصناف_${startDate}_إلى_${endDate}`;
      }

      const ws = XLSX.utils.json_to_sheet(dataToExport);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "التقرير المستخرج");
      XLSX.writeFile(wb, `${sheetName}.xlsx`);
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500 pb-20">
        {/* Header */}
      <header className="flex flex-col md:flex-row justify-between items-center bg-white p-8 rounded-[40px] shadow-sm border border-slate-100 gap-6">
        <div>
            <h2 className="text-3xl font-black text-slate-900 tracking-tight flex items-center gap-3">
                <BarChart3 className="text-indigo-600 w-10 h-10" /> تقارير وذكاء المبيعات
            </h2>
            <p className="text-slate-500 font-medium">تحليل شامل لحركة الأصناف، أداء الفروع، والعمولات</p>
        </div>
        <div className="flex gap-3">
            <button onClick={handleExport} className="bg-emerald-600 text-white px-6 py-3 rounded-2xl font-black flex items-center gap-2 hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-100">
                <Download size={20} /> تصدير Excel
            </button>
            <button onClick={() => window.print()} className="bg-slate-900 text-white px-6 py-3 rounded-2xl font-black flex items-center gap-2 hover:bg-slate-800 transition-all">
                <Printer size={20} /> طباعة
            </button>
        </div>
      </header>

      {/* Modern Tabs */}
      <div className="flex bg-white p-2 rounded-3xl shadow-sm border border-slate-200 gap-2 max-w-2xl">
          <button onClick={() => setActiveView('products')} className={`flex-1 py-3 rounded-2xl font-black text-sm flex items-center justify-center gap-2 transition-all ${activeView === 'products' ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-400 hover:bg-slate-50'}`}>
              <LayoutGrid size={18} /> تحليل الأصناف
          </button>
          <button onClick={() => setActiveView('branches')} className={`flex-1 py-3 rounded-2xl font-black text-sm flex items-center justify-center gap-2 transition-all ${activeView === 'branches' ? 'bg-blue-600 text-white shadow-lg' : 'text-slate-400 hover:bg-slate-50'}`}>
              <Building2 size={18} /> تارجت الفروع
          </button>
          <button onClick={() => setActiveView('commissions')} className={`flex-1 py-3 rounded-2xl font-black text-sm flex items-center justify-center gap-2 transition-all ${activeView === 'commissions' ? 'bg-emerald-600 text-white shadow-lg' : 'text-slate-400 hover:bg-slate-50'}`}>
              <Award size={18} /> عمولات المناديب
          </button>
      </div>

      {/* Filters Card */}
      <div className="bg-white p-8 rounded-[40px] shadow-sm border border-slate-200 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-6 items-end">
          <div>
              <label className="block text-xs font-black text-slate-400 mb-2 uppercase tracking-widest">البائع (المندوب)</label>
              <select value={salespersonId} onChange={e => setSalespersonId(e.target.value)} className="w-full border-2 border-slate-100 rounded-2xl px-4 py-3 font-bold text-slate-700 bg-slate-50 focus:border-indigo-500 outline-none appearance-none">
                  <option value="all">كل البائعين</option>
                  {salespeople.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
          </div>
          <div>
              <label className="block text-xs font-black text-slate-400 mb-2 uppercase tracking-widest">العميل</label>
              <select value={customerId} onChange={e => setCustomerId(e.target.value)} className="w-full border-2 border-slate-100 rounded-2xl px-4 py-3 font-bold text-slate-700 bg-slate-50 focus:border-indigo-500 outline-none appearance-none">
                  <option value="all">كل العملاء</option>
                  {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
          </div>
          <div>
              <label className="block text-xs font-black text-slate-400 mb-2 uppercase tracking-widest">نوع العميل</label>
              <select value={customerType} onChange={e => setCustomerType(e.target.value)} className="w-full border-2 border-slate-100 rounded-2xl px-4 py-3 font-bold text-slate-700 bg-slate-50 focus:border-indigo-500 outline-none appearance-none">
                  <option value="all">الكل</option>
                  <option value="store">عميل صالة (Store)</option>
                  <option value="online">أونلاين (Online)</option>
              </select>
          </div>
          <div>
              <label className="block text-xs font-black text-slate-400 mb-2 uppercase tracking-widest">من تاريخ</label>
              <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="w-full px-4 py-3 border-2 border-slate-100 rounded-2xl font-bold bg-slate-50 outline-none focus:border-indigo-500" />
          </div>
          <div>
              <label className="block text-xs font-black text-slate-400 mb-2 uppercase tracking-widest">إلى تاريخ</label>
              <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="w-full px-4 py-3 border-2 border-slate-100 rounded-2xl font-bold bg-slate-50 outline-none focus:border-indigo-500" />
          </div>
          <div className="bg-indigo-50 p-4 rounded-2xl border border-indigo-100">
              <label className="block text-[10px] font-black text-indigo-400 mb-1 uppercase">نسبة العمولة %</label>
              <div className="flex items-center gap-2">
                  <Percent size={16} className="text-indigo-600" />
                  <input type="number" value={commissionRate} onChange={e => setCommissionRate(Number(e.target.value))} className="w-full bg-transparent font-black text-indigo-700 text-lg outline-none" />
              </div>
          </div>
      </div>

      {/* Conditional Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <div className="bg-white p-6 rounded-[32px] border border-slate-200 shadow-sm flex items-center gap-4">
              <div className="p-4 bg-blue-50 text-blue-600 rounded-2xl"><TrendingUp size={28}/></div>
              <div>
                  <p className="text-xs font-black text-slate-400 uppercase">إجمالي المبيعات</p>
                  <h3 className="text-2xl font-black text-slate-900">{analytics.totalRevenue.toLocaleString()} <span className="text-sm font-bold opacity-40">{settings.currency}</span></h3>
              </div>
          </div>
          {activeView === 'branches' ? (
              <>
                  <div className="bg-white p-6 rounded-[32px] border border-slate-200 shadow-sm flex items-center gap-4">
                      <div className="p-4 bg-purple-50 text-purple-600 rounded-2xl"><Smartphone size={28}/></div>
                      <div>
                          <p className="text-xs font-black text-slate-400 uppercase">مبيعات الأونلاين</p>
                          <h3 className="text-2xl font-black text-slate-900">{analytics.branchList.reduce((s,b)=>s+b.onlineSales, 0).toLocaleString()}</h3>
                      </div>
                  </div>
                  <div className="bg-white p-6 rounded-[32px] border border-slate-200 shadow-sm flex items-center gap-4">
                      <div className="p-4 bg-emerald-50 text-emerald-600 rounded-2xl"><Store size={28}/></div>
                      <div>
                          <p className="text-xs font-black text-slate-400 uppercase">مبيعات الصالة</p>
                          <h3 className="text-2xl font-black text-slate-900">{analytics.branchList.reduce((s,b)=>s+b.storeSales, 0).toLocaleString()}</h3>
                      </div>
                  </div>
              </>
          ) : (
              <>
                <div className="bg-white p-6 rounded-[32px] border border-slate-200 shadow-sm flex items-center gap-4">
                    <div className="p-4 bg-purple-50 text-purple-600 rounded-2xl"><Package size={28}/></div>
                    <div>
                        <p className="text-xs font-black text-slate-400 uppercase">قطع مباعة</p>
                        <h3 className="text-2xl font-black text-slate-900">{analytics.totalItems.toLocaleString()}</h3>
                    </div>
                </div>
                <div className="bg-slate-900 p-6 rounded-[32px] shadow-xl flex items-center gap-4 text-white">
                    <div className="p-4 bg-emerald-500/20 text-emerald-400 rounded-2xl"><CircleDollarSign size={28}/></div>
                    <div>
                        <p className="text-xs font-black text-slate-400 uppercase">العمولة المستحقة</p>
                        <h3 className="text-2xl font-black text-emerald-400">{analytics.commission.toLocaleString()}</h3>
                    </div>
                </div>
              </>
          )}
          <div className="bg-white p-6 rounded-[32px] border border-slate-200 shadow-sm flex items-center gap-4">
              <div className="p-4 bg-amber-50 text-amber-600 rounded-2xl"><Target size={28}/></div>
              <div>
                  <p className="text-xs font-black text-slate-400 uppercase">عدد الفواتير</p>
                  <h3 className="text-2xl font-black text-slate-900">{analytics.invoiceCount}</h3>
              </div>
          </div>
      </div>

      {/* BRANCH SALES REPORT VIEW */}
      {activeView === 'branches' && (
          <div className="bg-white rounded-[40px] shadow-sm border border-slate-200 overflow-hidden animate-in slide-in-from-bottom-4 duration-500">
              <div className="p-8 border-b bg-blue-50/30 flex items-center justify-between">
                  <h3 className="font-black text-blue-900 text-xl flex items-center gap-3">
                      <Building2 size={24} className="text-blue-600" /> تارجت مبيعات الفروع والقنوات
                  </h3>
                  <div className="flex gap-2">
                      <span className="bg-blue-600 text-white text-[10px] px-3 py-1 rounded-full font-black uppercase">تحليل جغرافي</span>
                  </div>
              </div>
              <table className="w-full text-right">
                  <thead>
                      <tr className="bg-slate-50 text-slate-400 text-[10px] font-black uppercase tracking-widest border-b">
                          <th className="py-6 px-8">اسم الفرع / الموقع</th>
                          <th className="py-6 px-8 text-center bg-indigo-50/30">مبيعات الصالة (Store)</th>
                          <th className="py-6 px-8 text-center bg-blue-50/30">مبيعات الأونلاين (Online)</th>
                          <th className="py-6 px-8 text-center font-black text-slate-900">إجمالي المبيعات</th>
                          <th className="py-6 px-8 text-center">النسبة من الإجمالي</th>
                      </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                      {analytics.branchList.map((branch, idx) => (
                          <tr key={idx} className="hover:bg-slate-50/50 transition-colors group">
                              <td className="py-6 px-8">
                                  <div className="flex items-center gap-3">
                                      <div className="p-3 bg-slate-100 rounded-xl text-slate-400 group-hover:bg-blue-600 group-hover:text-white transition-all shadow-sm">
                                          <MapPin size={18} />
                                      </div>
                                      <span className="font-black text-slate-800 text-lg">{branch.name}</span>
                                  </div>
                              </td>
                              <td className="py-6 px-8 text-center font-bold text-indigo-700 bg-indigo-50/10">
                                  {branch.storeSales.toLocaleString()} <span className="text-[10px] opacity-40">{settings.currency}</span>
                              </td>
                              <td className="py-6 px-8 text-center font-bold text-blue-700 bg-blue-50/10">
                                  {branch.onlineSales.toLocaleString()} <span className="text-[10px] opacity-40">{settings.currency}</span>
                              </td>
                              <td className="py-6 px-8 text-center font-black text-slate-900 text-xl">
                                  {branch.total.toLocaleString()} <span className="text-xs opacity-30 font-bold">{settings.currency}</span>
                              </td>
                              <td className="py-6 px-8">
                                  <div className="flex items-center justify-center gap-3">
                                      <div className="w-24 h-2.5 bg-slate-100 rounded-full overflow-hidden shadow-inner">
                                          <div className="h-full bg-blue-500 rounded-full transition-all duration-1000" style={{ width: `${(branch.total / (analytics.totalRevenue || 1)) * 100}%` }}></div>
                                      </div>
                                      <span className="text-xs font-black text-slate-400">{((branch.total / (analytics.totalRevenue || 1)) * 100).toFixed(1)}%</span>
                                  </div>
                              </td>
                          </tr>
                      ))}
                      {analytics.branchList.length === 0 && (
                          <tr><td colSpan={5} className="py-20 text-center text-slate-400 italic">لا توجد بيانات مبيعات لهذا الفرع</td></tr>
                      )}
                  </tbody>
              </table>
          </div>
      )}

      {/* COMMISSIONS REPORT VIEW */}
      {activeView === 'commissions' && (
          <div className="bg-white rounded-[40px] shadow-sm border border-slate-200 overflow-hidden animate-in slide-in-from-bottom-4 duration-500">
              <div className="p-6 border-b bg-emerald-50/30 flex items-center justify-between">
                  <h3 className="font-black text-emerald-900 text-lg flex items-center gap-2">
                      <Award size={22} className="text-emerald-600" /> تقرير عمولات المناديب المستحقة
                  </h3>
                  <div className="bg-emerald-100 text-emerald-800 px-3 py-1 rounded-full text-xs font-bold">
                      نسبة العمولة الحالية: {commissionRate}%
                  </div>
              </div>
              <table className="w-full text-right">
                  <thead>
                      <tr className="bg-slate-50 text-slate-400 text-[10px] font-black uppercase tracking-widest border-b">
                          <th className="py-5 px-8">اسم المندوب / البائع</th>
                          <th className="py-5 px-8 text-center">إجمالي القطع</th>
                          <th className="py-5 px-8 text-center">إجمالي المبيعات</th>
                          <th className="py-5 px-8 text-center">العمولة المستحقة</th>
                          <th className="py-5 px-8 text-center">كفاءة الأداء</th>
                      </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                      {analytics.salespersonList.map((salesperson, idx) => (
                          <tr key={idx} className="hover:bg-emerald-50/20 transition-colors">
                              <td className="py-5 px-8 font-black text-slate-800">{salesperson.name}</td>
                              <td className="py-5 px-8 text-center font-bold text-slate-600">{salesperson.qty}</td>
                              <td className="py-5 px-8 text-center font-black text-slate-900">{salesperson.total.toLocaleString()}</td>
                              <td className="py-5 px-8 text-center font-black text-emerald-600 bg-emerald-50/50">{salesperson.commission.toLocaleString()}</td>
                              <td className="py-5 px-8">
                                  <div className="flex items-center justify-center gap-2">
                                      <div className="w-24 h-2 bg-slate-100 rounded-full overflow-hidden">
                                          <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${(salesperson.total / (analytics.totalRevenue || 1)) * 100}%` }}></div>
                                      </div>
                                      <span className="text-[10px] font-black text-slate-400">{((salesperson.total / (analytics.totalRevenue || 1)) * 100).toFixed(1)}%</span>
                                  </div>
                              </td>
                          </tr>
                      ))}
                      {analytics.salespersonList.length === 0 && (
                          <tr><td colSpan={5} className="py-12 text-center text-slate-400">لا توجد بيانات للمناديب في هذه الفترة</td></tr>
                      )}
                  </tbody>
              </table>
          </div>
      )}
    </div>
  );
};

export default SalesReports;

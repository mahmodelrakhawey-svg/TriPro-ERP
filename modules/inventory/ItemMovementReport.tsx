import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../../supabaseClient';
import { useAccounting } from '../../context/AccountingContext';
import { useToast } from '../../context/ToastContext';
import { Package, Search, Printer, Loader2, ArrowUpRight, ArrowDownLeft, Filter, Download, X, User, ArrowRightLeft, Factory } from 'lucide-react';
import * as XLSX from 'xlsx';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

type Movement = {
  id: string;
  date: string;
  type: 'in' | 'out';
  quantity: number;
  documentType: string;
  documentNumber: string;
  description: string;
  balanceAfter: number;
  userName?: string;
};

const ItemMovementReport = () => {
  const { currentUser, products, warehouses, users } = useAccounting();
  const { showToast } = useToast();
  const [selectedProductId, setSelectedProductId] = useState<string>('');
  const [productSearchTerm, setProductSearchTerm] = useState('');
  const [selectedWarehouseId, setSelectedWarehouseId] = useState('');
  const [showProductDropdown, setShowProductDropdown] = useState(false);
  const [startDate, setStartDate] = useState(new Date(new Date().getFullYear(), 0, 1).toISOString().split('T')[0]);
  const [endDate, setEndDate] = useState(new Date().toISOString().split('T')[0]);
  const [movements, setMovements] = useState<Movement[]>([]);
  const [loading, setLoading] = useState(false);
  const [openingBalance, setOpeningBalance] = useState(0);
  const [currentStock, setCurrentStock] = useState(0);

  const fetchMovement = async () => {
    if (!selectedProductId) {
        showToast('الرجاء اختيار الصنف أولاً', 'warning');
        return;
    }
    setLoading(true);
    if (currentUser?.role === 'demo') {
        setMovements([
            { id: 'd1', date: new Date().toISOString().split('T')[0], type: 'in', quantity: 10, documentType: 'فاتورة مشتريات', documentNumber: 'PINV-D-01', description: 'توريد بضاعة', balanceAfter: 10, userName: 'المدير العام' },
            { id: 'd2', date: new Date().toISOString().split('T')[0], type: 'out', quantity: 2, documentType: 'فاتورة مبيعات', documentNumber: 'INV-D-01', description: 'بيع للعميل', balanceAfter: 8, userName: 'أحمد محمد' },
        ]);
        setOpeningBalance(0);
        const product = products.find(p => p.id === selectedProductId);
        if (product) setCurrentStock(product.stock);
        setLoading(false);
        return;
    }

    try {
      const product = products.find(p => p.id === selectedProductId);
      if (product) setCurrentStock(product.stock);

      const getUserName = (id: string) => users.find(u => u.id === id)?.name || 'غير معروف';

      // 1. جلب حركات المبيعات (Sales Invoices) - صادر
      let salesQuery = supabase
        .from('invoice_items')
        .select('quantity, invoice_id, invoices!inner(invoice_date, invoice_number, status, warehouse_id, created_by)')
        .eq('product_id', selectedProductId)
        .neq('invoices.status', 'draft');
      
      if (selectedWarehouseId) salesQuery = salesQuery.eq('invoices.warehouse_id', selectedWarehouseId);
      const { data: salesItems } = await salesQuery;

      // 2. جلب حركات المشتريات (Purchase Invoices) - وارد
      let purchaseQuery = supabase
        .from('purchase_invoice_items')
        .select('quantity, purchase_invoice_id, purchase_invoices!purchase_invoice_items_purchase_invoice_id_fkey!inner(invoice_date, invoice_number, status, warehouse_id, created_by)')
        .eq('product_id', selectedProductId)
        .neq('purchase_invoices.status', 'draft');

      if (selectedWarehouseId) purchaseQuery = purchaseQuery.eq('purchase_invoices.warehouse_id', selectedWarehouseId);
      const { data: purchaseItems } = await purchaseQuery;

      // 3. جلب مرتجعات المبيعات (Sales Returns) - وارد
      let salesReturnsQuery = supabase
        .from('sales_return_items')
        .select('quantity, sales_return_id, sales_returns!inner(return_date, return_number, status, warehouse_id, created_by)')
        .eq('product_id', selectedProductId)
        .neq('sales_returns.status', 'draft');

      if (selectedWarehouseId) salesReturnsQuery = salesReturnsQuery.eq('sales_returns.warehouse_id', selectedWarehouseId);
      const { data: salesReturns } = await salesReturnsQuery;

      // 4. جلب مرتجعات المشتريات (Purchase Returns) - صادر
      let purchaseReturnsQuery = supabase
        .from('purchase_return_items')
        .select('quantity, purchase_return_id, purchase_returns!inner(return_date, return_number, status, warehouse_id, created_by)')
        .eq('product_id', selectedProductId)
        .neq('purchase_returns.status', 'draft');

      if (selectedWarehouseId) purchaseReturnsQuery = purchaseReturnsQuery.eq('purchase_returns.warehouse_id', selectedWarehouseId);
      const { data: purchaseReturns } = await purchaseReturnsQuery;

      // 5. جلب التسويات المخزنية (Stock Adjustments)
      let adjustmentsQuery = supabase
        .from('stock_adjustment_items')
        .select('quantity, stock_adjustments!inner(adjustment_date, adjustment_number, status, warehouse_id, created_by)')
        .eq('product_id', selectedProductId)
        .neq('stock_adjustments.status', 'draft');

      if (selectedWarehouseId) adjustmentsQuery = adjustmentsQuery.eq('stock_adjustments.warehouse_id', selectedWarehouseId);
      const { data: adjustments } = await adjustmentsQuery;

      // 6. جلب رصيد أول المدة (Opening Inventory)
      let openingQuery = supabase
        .from('opening_inventories')
        .select('quantity, created_at, warehouse_id, created_by')
        .eq('product_id', selectedProductId);
      
      if (selectedWarehouseId) openingQuery = openingQuery.eq('warehouse_id', selectedWarehouseId);
      const { data: openingInventory } = await openingQuery;

      // 7. جلب التحويلات المخزنية (Stock Transfers) - هام جداً
      let transfersQuery = supabase
        .from('stock_transfer_items')
        .select('quantity, stock_transfers!inner(transfer_date, transfer_number, from_warehouse_id, to_warehouse_id, status, created_by)')
        .eq('product_id', selectedProductId)
        .eq('stock_transfers.status', 'posted');
      
      const { data: transfers } = await transfersQuery;

      // 8. جلب حركات التصنيع (Manufacturing)
      let manufacturingQuery = supabase
        .from('work_orders')
        .select('id, order_number, end_date, quantity, product_id, warehouse_id, status, created_by')
        .eq('status', 'completed');
        
      if (selectedWarehouseId) manufacturingQuery = manufacturingQuery.eq('warehouse_id', selectedWarehouseId);
      // ملاحظة: نجلب الكل ثم نفلتر حسب الصنف (منتج تام أو مادة خام) لاحقاً لتعقيد العلاقة
      const { data: workOrders } = await manufacturingQuery;


      // تجميع الحركات
      let allMovements: any[] = [];
      const getWName = (id: string) => warehouses.find(w => w.id === id)?.name || 'غير محدد';

      openingInventory?.forEach((item: any) => {
          allMovements.push({
              date: item.created_at ? item.created_at.split('T')[0] : new Date().toISOString().split('T')[0],
              type: 'in',
              quantity: Number(item.quantity),
              documentType: 'رصيد افتتاحي',
              documentNumber: '-',
              description: `بضاعة أول المدة - ${getWName(item.warehouse_id)}`,
              userName: getUserName(item.created_by)
          });
      });

      salesItems?.forEach((item: any) => {
          allMovements.push({
              date: item.invoices.invoice_date,
              type: 'out',
              quantity: item.quantity,
              documentType: 'فاتورة مبيعات',
              documentNumber: item.invoices.invoice_number,
              userName: getUserName(item.invoices.created_by)
          });
      });

      purchaseItems?.forEach((item: any) => {
          allMovements.push({
              date: item.purchase_invoices.invoice_date,
              type: 'in',
              quantity: item.quantity,
              documentType: 'فاتورة مشتريات',
              documentNumber: item.purchase_invoices.invoice_number,
              userName: getUserName(item.purchase_invoices.created_by)
          });
      });

      salesReturns?.forEach((item: any) => {
          allMovements.push({
              date: item.sales_returns.return_date,
              type: 'in',
              quantity: item.quantity,
              documentType: 'مرتجع مبيعات',
              documentNumber: item.sales_returns.return_number,
              userName: getUserName(item.sales_returns.created_by)
          });
      });

      purchaseReturns?.forEach((item: any) => {
          allMovements.push({
              date: item.purchase_returns.return_date,
              type: 'out',
              quantity: item.quantity,
              documentType: 'مرتجع مشتريات',
              documentNumber: item.purchase_returns.return_number,
              userName: getUserName(item.purchase_returns.created_by)
          });
      });

      adjustments?.forEach((item: any) => {
          const qty = Number(item.quantity);
          allMovements.push({
              date: item.stock_adjustments.adjustment_date,
              type: qty >= 0 ? 'in' : 'out',
              quantity: Math.abs(qty),
              documentType: 'تسوية مخزنية',
              documentNumber: item.stock_adjustments.adjustment_number,
              userName: getUserName(item.stock_adjustments.created_by)
          });
      });

      // معالجة التحويلات المخزنية
      transfers?.forEach((item: any) => {
          const t = item.stock_transfers;
          // إذا تم اختيار مستودع محدد
          if (selectedWarehouseId) {
              if (t.from_warehouse_id === selectedWarehouseId) {
                  // تحويل صادر (نقصان)
                  allMovements.push({
                      date: t.transfer_date,
                      type: 'out',
                      quantity: item.quantity,
                      documentType: 'تحويل صادر',
                      documentNumber: t.transfer_number,
                      description: `إلى: ${getWName(t.to_warehouse_id)}`,
                      userName: getUserName(t.created_by)
                  });
              } else if (t.to_warehouse_id === selectedWarehouseId) {
                  // تحويل وارد (زيادة)
                  allMovements.push({
                      date: t.transfer_date,
                      type: 'in',
                      quantity: item.quantity,
                      documentType: 'تحويل وارد',
                      documentNumber: t.transfer_number,
                      description: `من: ${getWName(t.from_warehouse_id)}`,
                      userName: getUserName(t.created_by)
                  });
              }
          } 
          // إذا لم يتم اختيار مستودع (عرض كلي)، التحويلات الداخلية لا تؤثر على الرصيد الإجمالي للشركة
          // لذلك لا نضيفها هنا لتجنب الازدواجية، أو يمكن إضافتها كحركة صفرية للتوضيح فقط.
          // في هذا التقرير المالي/الكمي، نفضل عدم إظهارها إذا لم تؤثر على الرصيد المختار.
      });

      // معالجة التصنيع
      if (workOrders) {
          // 1. المنتج التام (زيادة)
          workOrders.filter((wo: any) => wo.product_id === selectedProductId).forEach((wo: any) => {
              allMovements.push({
                  date: wo.end_date,
                  type: 'in',
                  quantity: wo.quantity,
                  documentType: 'تصنيع (منتج تام)',
                  documentNumber: wo.order_number,
                  userName: getUserName(wo.created_by)
              });
          });

          // 2. المواد الخام (نقصان) - يتطلب جلب BOM، للتبسيط سنفترض أن هذا التقرير للمنتج التام حالياً
          // أو يمكن إضافة منطق BOM هنا إذا لزم الأمر.
      }

      // ترتيب الحركات زمنياً
      allMovements.sort((a, b) => {
          const dateA = new Date(a.date).getTime();
          const dateB = new Date(b.date).getTime();
          if (dateA !== dateB) return dateA - dateB;
          return a.documentType === 'رصيد افتتاحي' ? -1 : 1; // الأولوية للرصيد الافتتاحي
      });

      // حساب الرصيد الافتراضي (ما قبل الفترة)
      let openBal = 0;
      const periodMovements: Movement[] = [];
      
      allMovements.forEach(mov => {
          if (mov.date < startDate) {
              if (mov.type === 'in') openBal += mov.quantity;
              else openBal -= mov.quantity;
          } else if (mov.date <= endDate) {
              periodMovements.push(mov);
          }
      });

      setOpeningBalance(openBal);

      // حساب الرصيد التراكمي للفترة
      let runningBalance = openBal;
      const finalMovements = periodMovements.map((mov, index) => {
          if (mov.type === 'in') runningBalance += mov.quantity;
          else runningBalance -= mov.quantity;
          
          return {
              id: index.toString(),
              ...mov,
              balanceAfter: runningBalance
          };
      });

      setMovements(finalMovements);

    } catch (error: any) {
      console.error(error);
      showToast('حدث خطأ أثناء جلب البيانات: ' + error.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleExportExcel = () => {
    const productName = products.find(p => p.id === selectedProductId)?.name || 'Product';
    
    const data = [
        ['تقرير حركة صنف'],
        ['الصنف:', productName],
        ['من تاريخ:', startDate, 'إلى تاريخ:', endDate],
        [],
        ['التاريخ', 'نوع المستند', 'رقم المستند', 'وارد', 'صادر', 'الرصيد'],
        ['-', 'الرصيد الافتراضي', '-', '-', '-', openingBalance],
        ...movements.map(m => [
            m.date,
            m.documentType,
            m.documentNumber,
            m.type === 'in' ? m.quantity : 0,
            m.type === 'out' ? m.quantity : 0,
            m.balanceAfter,
            m.userName || '-'
        ])
    ];
    
    const ws = XLSX.utils.aoa_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Item Movement");
    XLSX.writeFile(wb, `Item_Movement_${productName}_${startDate}.xlsx`);
  };

  const totalIn = movements.filter(m => m.type === 'in').reduce((sum, m) => sum + m.quantity, 0);
  const totalOut = movements.filter(m => m.type === 'out').reduce((sum, m) => sum + m.quantity, 0);

  // تجهيز بيانات الرسم البياني (إضافة نقطة البداية)
  const chartData = useMemo(() => {
    if (movements.length === 0) return [];
    // إضافة الرصيد الافتتاحي كنقطة بداية في الرسم
    return [{ date: startDate, balanceAfter: openingBalance }, ...movements];
  }, [movements, openingBalance, startDate]);

  return (
    <div className="space-y-6 animate-in fade-in">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
            <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
                <Package className="text-blue-600" /> تقرير حركة صنف تفصيلي
            </h2>
            <p className="text-slate-500">تتبع حركة الوارد والصادر والرصيد لكل صنف</p>
        </div>
        <div className="flex gap-2">
            <button onClick={handleExportExcel} disabled={movements.length === 0} className="flex items-center gap-2 bg-emerald-600 text-white px-4 py-2 rounded-lg hover:bg-emerald-700 font-bold text-sm shadow-sm disabled:opacity-50">
                <Download size={16} /> تصدير Excel
            </button>
            <button onClick={() => window.print()} className="flex items-center gap-2 bg-slate-800 text-white px-4 py-2 rounded-lg hover:bg-slate-700 font-bold text-sm shadow-sm">
                <Printer size={16} /> طباعة
            </button>
        </div>
      </div>

      <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 no-print">
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4 items-end">
            <div className="md:col-span-2 relative z-50">
                <label className="block text-sm font-bold text-slate-700 mb-1">الصنف</label>
                
                <div className="relative">
                    <input 
                        type="text"
                        value={productSearchTerm}
                        onChange={(e) => {
                            setProductSearchTerm(e.target.value);
                            setShowProductDropdown(true);
                            setSelectedProductId(''); // إعادة تعيين الاختيار عند الكتابة
                        }}
                        onFocus={() => setShowProductDropdown(true)}
                        onBlur={() => setTimeout(() => setShowProductDropdown(false), 200)}
                        placeholder="ابحث باسم الصنف أو الكود..."
                        className="w-full border border-slate-300 rounded-lg px-4 py-2.5 pl-10 focus:outline-none focus:border-blue-500"
                    />
                    <Search className="absolute left-3 top-3 text-slate-400 pointer-events-none" size={18} />
                    {selectedProductId && (
                        <button 
                            onClick={() => {
                                setSelectedProductId('');
                                setProductSearchTerm('');
                            }}
                            className="absolute right-3 top-3 text-slate-400 hover:text-red-500"
                        >
                            <X size={18} />
                        </button>
                    )}
                    
                    {showProductDropdown && (
                        <div className="absolute top-full left-0 w-full bg-white border border-slate-200 rounded-lg shadow-xl mt-1 max-h-60 overflow-y-auto">
                            {products.filter(p => 
                                (p.name || '').toLowerCase().includes(productSearchTerm.toLowerCase()) ||
                                (p.sku || '').toLowerCase().includes(productSearchTerm.toLowerCase())
                            ).map(p => (
                                <div 
                                    key={p.id}
                                    onMouseDown={(e) => {
                                        e.preventDefault(); // منع فقدان التركيز المفاجئ
                                        setSelectedProductId(p.id);
                                        setProductSearchTerm(p.name); // تحديث النص بالاسم المختار
                                        setShowProductDropdown(false);
                                    }}
                                    className="p-3 hover:bg-blue-50 cursor-pointer border-b border-slate-50 last:border-0"
                                >
                                    <div className="font-bold text-slate-800">{p.name}</div>
                                    <div className="text-xs text-slate-500 font-mono">{p.sku || 'No SKU'}</div>
                                </div>
                            ))}
                            {products.length > 0 && products.filter(p => (p.name || '').toLowerCase().includes(productSearchTerm.toLowerCase())).length === 0 && (
                                <div className="p-3 text-slate-400 text-center text-sm">لا توجد نتائج</div>
                            )}
                            {products.length === 0 && (
                                <div className="p-3 text-slate-400 text-center text-sm">جاري تحميل الأصناف...</div>
                            )}
                        </div>
                    )}
                </div>
            </div>
            <div>
                <label className="block text-sm font-bold text-slate-700 mb-1">المستودع</label>
                <select 
                    value={selectedWarehouseId} 
                    onChange={(e) => setSelectedWarehouseId(e.target.value)} 
                    className="w-full border border-slate-300 rounded-lg px-3 py-2.5 focus:outline-none focus:border-purple-500 bg-white"
                >
                    <option value="">كل المستودعات</option>
                    {warehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
                </select>
            </div>
            <div>
                <label className="block text-sm font-bold text-slate-700 mb-1">من تاريخ</label>
                <input 
                    type="date" 
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="w-full border border-slate-300 rounded-lg px-3 py-2.5 focus:outline-none focus:border-blue-500"
                />
            </div>
            <div>
                <label className="block text-sm font-bold text-slate-700 mb-1">إلى تاريخ</label>
                <input 
                    type="date" 
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="w-full border border-slate-300 rounded-lg px-3 py-2.5 focus:outline-none focus:border-blue-500"
                />
            </div>
        </div>
        <div className="mt-4 flex justify-end">
            <button 
                onClick={fetchMovement}
                disabled={loading || !selectedProductId}
                className="flex items-center gap-2 bg-blue-600 text-white px-8 py-2.5 rounded-lg hover:bg-blue-700 font-bold shadow-md disabled:opacity-50 transition-all"
            >
                {loading ? <Loader2 className="animate-spin" /> : <Filter size={18} />}
                عرض التقرير
            </button>
        </div>
      </div>

      {/* الرسم البياني لتطور الرصيد */}
      {!loading && movements.length > 0 && (
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 print:hidden">
            <h3 className="text-lg font-bold text-slate-800 mb-4">تطور رصيد الصنف خلال الفترة</h3>
            <div className="h-80 w-full" dir="ltr">
                <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                        <defs>
                            <linearGradient id="colorBalance" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.8}/>
                                <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                            </linearGradient>
                        </defs>
                        <XAxis dataKey="date" tick={{fontSize: 12}} />
                        <YAxis tick={{fontSize: 12}} />
                        <CartesianGrid strokeDasharray="3 3" vertical={false} />
                        <Tooltip 
                            contentStyle={{borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)'}}
                            formatter={(value: number) => [value.toLocaleString(), 'الرصيد']}
                            labelFormatter={(label) => `التاريخ: ${label}`}
                        />
                        <Area type="monotone" dataKey="balanceAfter" stroke="#3b82f6" fillOpacity={1} fill="url(#colorBalance)" />
                    </AreaChart>
                </ResponsiveContainer>
            </div>
        </div>
      )}

      {/* ترويسة الطباعة */}
      <div className="hidden print:block text-center mb-8 border-b-2 border-slate-800 pb-4">
          <h1 className="text-3xl font-bold mb-2">كشف حركة صنف</h1>
          <h2 className="text-xl text-slate-600">{products.find(p => p.id === selectedProductId)?.name}</h2>
          <p className="text-sm text-slate-500 mt-2">عن الفترة من {startDate} إلى {endDate}</p>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <table className="w-full text-right text-sm">
            <thead className="bg-slate-50 text-slate-700 font-bold border-b border-slate-200">
                <tr>
                    <th className="p-4">التاريخ</th>
                    <th className="p-4">نوع المستند</th>
                    <th className="p-4">رقم المستند</th>
                    <th className="p-4 text-center text-emerald-600">وارد</th>
                    <th className="p-4 text-center text-red-600">صادر</th>
                    <th className="p-4 text-center">الرصيد</th>
                    <th className="p-4 text-center">المستخدم</th>
                </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
                {/* الرصيد الافتراضي */}
                <tr className="bg-blue-50/50 font-bold text-slate-700">
                    <td className="p-4 text-center">-</td>
                    <td className="p-4 text-center">-</td>
                    <td className="p-4">الرصيد الافتراضي (ما قبل الفترة)</td>
                    <td className="p-4 text-center">-</td>
                    <td className="p-4 text-center">-</td>
                    <td className="p-4 text-center font-mono" dir="ltr">{openingBalance}</td>
                    <td className="p-4 text-center">-</td>
                </tr>

                {movements.map((mov) => (
                    <tr key={mov.id} className="hover:bg-slate-50 transition-colors">
                        <td className="p-4 whitespace-nowrap">{mov.date}</td>
                        <td className="p-4 font-bold text-slate-600">{mov.documentType}</td>
                        <td className="p-4 font-mono text-slate-500">{mov.documentNumber || '-'}</td>
                        <td className="p-4 text-center font-mono font-bold text-emerald-600 bg-emerald-50/30">
                            {mov.type === 'in' ? (
                                <span className="flex items-center justify-center gap-1"><ArrowDownLeft size={14} /> {mov.quantity}</span>
                            ) : '-'}
                        </td>
                        <td className="p-4 text-center font-mono font-bold text-red-600 bg-red-50/30">
                            {mov.type === 'out' ? (
                                <span className="flex items-center justify-center gap-1"><ArrowUpRight size={14} /> {mov.quantity}</span>
                            ) : '-'}
                        </td>
                        <td className="p-4 text-center font-mono font-black text-slate-800" dir="ltr">{mov.balanceAfter}</td>
                        <td className="p-4 text-center text-xs text-slate-500 flex items-center justify-center gap-1">
                            <User size={12} /> {mov.userName || 'غير معروف'}
                        </td>
                    </tr>
                ))}

                {movements.length === 0 && !loading && (
                    <tr><td colSpan={7} className="p-8 text-center text-slate-400">لا توجد حركات خلال هذه الفترة</td></tr>
                )}
            </tbody>
            <tfoot className="bg-slate-100 font-bold text-slate-800 border-t-2 border-slate-300">
                <tr>
                    <td colSpan={3} className="p-4 text-left">الإجمالي خلال الفترة:</td>
                    <td className="p-4 text-center text-emerald-700">{totalIn}</td>
                    <td className="p-4 text-center text-red-700">{totalOut}</td>
                    <td className="p-4 text-center bg-slate-200 text-lg" dir="ltr">
                        {movements.length > 0 ? movements[movements.length - 1].balanceAfter : openingBalance}
                    </td>
                </tr>
            </tfoot>
        </table>
      </div>
    </div>
  );
};

export default ItemMovementReport;

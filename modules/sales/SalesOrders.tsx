import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../../supabaseClient';
import { useAccounting } from '../../context/AccountingContext';
import { useToast } from '../../context/ToastContext';
import { 
  FileCheck, Search, Plus, Trash2, Edit, Printer, Download, 
  MessageCircle, Loader2, ArrowRightLeft, CheckCircle2, Clock, 
  AlertCircle, ChevronLeft, ChevronRight, RotateCcw, Warehouse as WarehouseIcon, 
  X, ShieldCheck, Factory, Layers
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import * as XLSX from 'xlsx';
import { SalesOrderPrint } from './SalesOrderPrint';

export const SalesOrders: React.FC = () => {
  const { customers, warehouses, currentUser, settings, selectedFiscalYear, fiscalYearRange } = useAccounting();
  const navigate = useNavigate();
  const { showToast } = useToast();

  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [startDate, setStartDate] = useState(fiscalYearRange.startDate);
  const [endDate, setEndDate] = useState(`${selectedFiscalYear}-12-31`);
  const [selectedCustomerId, setSelectedCustomerId] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'draft' | 'confirmed' | 'manufacturing' | 'ready' | 'invoiced' | 'cancelled'>('all');
  
  // Printing & Action States
  const [orderToPrint, setOrderToPrint] = useState<any | null>(null);
  const [companySettings, setCompanySettings] = useState<any>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);

  // Conversion Modal State
  const [isConvertModalOpen, setIsConvertModalOpen] = useState(false);
  const [selectedOrderForConvert, setSelectedOrderForConvert] = useState<any>(null);
  const [targetWarehouseId, setTargetWarehouseId] = useState('');
  const [converting, setConverting] = useState(false);

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 15;

  useEffect(() => {
    if (selectedFiscalYear) {
      setStartDate(`${selectedFiscalYear}-01-01`);
      setEndDate(`${selectedFiscalYear}-12-31`);
    }
  }, [selectedFiscalYear]);

  useEffect(() => {
    supabase.rpc('get_current_company_settings').maybeSingle().then(({ data }) => {
      if (data) setCompanySettings(data);
    });
  }, []);

  const fetchOrders = async () => {
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const userOrgId = session?.user?.user_metadata?.org_id;
      if (!userOrgId) {
        setLoading(false);
        return;
      }

      let query = supabase
        .from('sales_orders')
        .select(`
          *,
          customers(id, name, phone),
          sales_order_items(id, product_id, quantity, unit_price, uom_id, products(name, sku))
        `)
        .eq('organization_id', userOrgId)
        .order('order_date', { ascending: false })
        .order('created_at', { ascending: false });

      if (startDate) query = query.gte('order_date', startDate);
      if (endDate) query = query.lte('order_date', endDate);
      if (selectedCustomerId) query = query.eq('customer_id', selectedCustomerId);
      if (statusFilter !== 'all') query = query.eq('status', statusFilter);

      let { data, error } = await query;

      if (error && (error.code === 'PGRST201' || error.message?.includes('more than one relationship'))) {
        let retryQuery = supabase
          .from('sales_orders')
          .select(`
            *,
            customers(id, name, phone),
            sales_order_items!sales_order_id(id, product_id, quantity, unit_price, uom_id, products(name, sku))
          `)
          .eq('organization_id', userOrgId)
          .order('order_date', { ascending: false })
          .order('created_at', { ascending: false });

        if (startDate) retryQuery = retryQuery.gte('order_date', startDate);
        if (endDate) retryQuery = retryQuery.lte('order_date', endDate);
        if (selectedCustomerId) retryQuery = retryQuery.eq('customer_id', selectedCustomerId);
        if (statusFilter !== 'all') retryQuery = retryQuery.eq('status', statusFilter);

        const retryRes = await retryQuery;
        data = retryRes.data;
        error = retryRes.error;
      }

      if (error) throw error;

      setOrders(data || []);
    } catch (err: any) {
      console.error('Error fetching sales orders:', err);
      showToast('فشل تحميل سجل أوامر البيع: ' + err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOrders();
  }, [startDate, endDate, selectedCustomerId, statusFilter]);

  // Client-side search
  const filteredOrders = useMemo(() => {
    if (!searchTerm.trim()) return orders;
    const term = searchTerm.toLowerCase().trim();
    return orders.filter(o => 
      (o.order_number && o.order_number.toLowerCase().includes(term)) ||
      (o.customers?.name && o.customers.name.toLowerCase().includes(term)) ||
      (o.notes && o.notes.toLowerCase().includes(term))
    );
  }, [orders, searchTerm]);

  // Pagination calculation
  const totalPages = Math.ceil(filteredOrders.length / itemsPerPage) || 1;
  const paginatedOrders = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return filteredOrders.slice(start, start + itemsPerPage);
  }, [filteredOrders, currentPage]);

  // Summary KPIs
  const summary = useMemo(() => {
    const totalAmount = filteredOrders.reduce((sum, o) => sum + Number(o.total_amount || 0), 0);
    const confirmedCount = filteredOrders.filter(o => o.status === 'confirmed').length;
    const invoicedCount = filteredOrders.filter(o => o.status === 'invoiced').length;
    const draftCount = filteredOrders.filter(o => o.status === 'draft' || !o.status).length;

    return { totalAmount, confirmedCount, invoicedCount, draftCount, count: filteredOrders.length };
  }, [filteredOrders]);

  // تعميد أمر البيع
  const handleConfirm = async (order: any) => {
    setConfirmingId(order.id);
    try {
      const { error } = await supabase
        .from('sales_orders')
        .update({ status: 'confirmed' })
        .eq('id', order.id);

      if (error) throw error;
      showToast(`تم تعميد وتأكيد أمر البيع رقم (${order.order_number}) بنجاح 🛡️✅`, 'success');
      fetchOrders();
    } catch (err: any) {
      console.error(err);
      showToast('فشل تعميد أمر البيع: ' + err.message, 'error');
    } finally {
      setConfirmingId(null);
    }
  };

  const handleDelete = async (order: any) => {
    if (!window.confirm(`هل أنت متأكد من حذف أمر البيع رقم (${order.order_number})؟`)) {
      return;
    }

    setDeletingId(order.id);
    try {
      await supabase.from('sales_order_items').delete().eq('sales_order_id', order.id);
      const { error: delErr } = await supabase.from('sales_orders').delete().eq('id', order.id);
      if (delErr) throw delErr;

      showToast('تم حذف أمر البيع بنجاح ✅', 'success');
      fetchOrders();

    } catch (err: any) {
      console.error('Error deleting SO:', err);
      showToast('فشل حذف أمر البيع: ' + err.message, 'error');
    } finally {
      setDeletingId(null);
    }
  };

  const openConvertModal = (order: any) => {
    setSelectedOrderForConvert(order);
    const initialWh = settings.defaultWarehouseId || (warehouses.length > 0 ? warehouses[0].id : '');
    setTargetWarehouseId(initialWh);
    setIsConvertModalOpen(true);
  };

  const confirmConversion = async () => {
    if (!selectedOrderForConvert || !targetWarehouseId) {
      showToast('يرجى اختيار مستودع الصرف', 'warning');
      return;
    }

    setConverting(true);
    try {
      const { data, error } = await supabase.rpc('convert_so_to_invoice', {
        p_so_id: selectedOrderForConvert.id,
        p_warehouse_id: targetWarehouseId
      });

      if (error) throw error;
      showToast('تم تحويل أمر البيع إلى فاتورة مبيعات وخصم المخزون بنجاح ✅', 'success');
      setIsConvertModalOpen(false);
      setSelectedOrderForConvert(null);
      fetchOrders();
    } catch (err: any) {
      console.error(err);
      showToast('فشل تحويل أمر البيع: ' + err.message, 'error');
    } finally {
      setConverting(false);
    }
  };

  const handlePrint = (order: any) => {
    setOrderToPrint({
      orderNumber: order.order_number,
      date: order.order_date,
      deliveryDate: order.expected_delivery_date,
      customerName: order.customers?.name || 'عميل عام',
      notes: order.notes,
      totalAmount: order.total_amount,
      taxAmount: order.tax_amount,
      items: (order.sales_order_items || []).map((i: any) => ({
        name: i.products?.name || 'صنف',
        quantity: i.quantity,
        unitPrice: i.unit_price,
        total: (i.quantity || 0) * (i.unit_price || 0)
      }))
    });

    setTimeout(() => {
      window.print();
      setOrderToPrint(null);
    }, 200);
  };

  const handleShareWhatsApp = (order: any) => {
    const phone = order.customers?.phone ? order.customers.phone.replace(/[^0-9]/g, '') : '';
    const message = `مرحباً ${order.customers?.name || 'عميلنا العزيز'},\nنود إخطاركم بتأكيد وتعميد أمر البيع رقم: ${order.order_number}\nالتاريخ: ${order.order_date}\nتاريخ التسليم المتوقع: ${order.expected_delivery_date || 'حسب الاتفاق'}\nإجمالي المبلغ: ${Number(order.total_amount).toLocaleString()} ${settings.currency || 'ج.م'}\nالحالة: ${order.status === 'confirmed' ? 'معمد وجاري التجهيز' : 'مسجل'}\nشكراً لتعاملكم معنا.`;
    
    const url = phone 
      ? `https://wa.me/${phone.startsWith('0') ? '20' + phone.substring(1) : phone}?text=${encodeURIComponent(message)}`
      : `https://wa.me/?text=${encodeURIComponent(message)}`;
      
    window.open(url, '_blank');
  };

  const exportToExcel = () => {
    if (filteredOrders.length === 0) {
      showToast('لا توجد بيانات للتصدير', 'warning');
      return;
    }

    const dataToExport = filteredOrders.map((o, idx) => ({
      '#': idx + 1,
      'رقم أمر البيع': o.order_number || '-',
      'التاريخ': o.order_date,
      'تاريخ التسليم المتوقع': o.expected_delivery_date || '-',
      'العميل': o.customers?.name || 'عميل عام',
      'الإجمالي': o.total_amount,
      'الضريبة': o.tax_amount,
      'الحالة': o.status === 'confirmed' ? 'معمد ومؤكد' : o.status === 'invoiced' ? 'مفوتر ومصروف' : 'مسودة',
      'ملاحظات': o.notes || ''
    }));

    const ws = XLSX.utils.json_to_sheet(dataToExport);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'أوامر البيع والتعميد');
    XLSX.writeFile(wb, `سجل_أوامر_البيع_${new Date().toISOString().split('T')[0]}.xlsx`);
    showToast('تم تصدير سجل أوامر البيع إلى إكسيل بنجاح ✅', 'success');
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'confirmed':
        return <span className="bg-blue-100 text-blue-700 text-xs px-2.5 py-1 rounded-full font-bold inline-flex items-center gap-1"><ShieldCheck size={12} /> معمد ومؤكد</span>;
      case 'invoiced':
        return <span className="bg-purple-100 text-purple-700 text-xs px-2.5 py-1 rounded-full font-bold inline-flex items-center gap-1"><CheckCircle2 size={12} /> مفوتر ومصروف</span>;
      case 'manufacturing':
        return <span className="bg-amber-100 text-amber-700 text-xs px-2.5 py-1 rounded-full font-bold inline-flex items-center gap-1"><Factory size={12} /> قيد التصنيع</span>;
      case 'ready':
        return <span className="bg-emerald-100 text-emerald-700 text-xs px-2.5 py-1 rounded-full font-bold inline-flex items-center gap-1"><CheckCircle2 size={12} /> جاهز للتسليم</span>;
      case 'cancelled':
        return <span className="bg-red-100 text-red-700 text-xs px-2.5 py-1 rounded-full font-bold inline-flex items-center gap-1"><AlertCircle size={12} /> ملغي</span>;
      default:
        return <span className="bg-slate-100 text-slate-700 text-xs px-2.5 py-1 rounded-full font-bold inline-flex items-center gap-1">مسودة</span>;
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in">
      
      {/* 🚀 Header */}
      <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200 flex flex-col md:flex-row justify-between items-center gap-4">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-blue-50 text-blue-600 rounded-xl">
            <Layers size={28} />
          </div>
          <div>
            <h2 className="text-xl font-black text-slate-800 flex items-center gap-2">
              إدارة أوامر البيع والتعميد (Sales Orders)
              <span className="text-xs px-2.5 py-0.5 rounded-full bg-blue-100 text-blue-700 font-bold font-mono">
                {filteredOrders.length} أمر بيع
              </span>
            </h2>
            <p className="text-xs text-slate-400 font-bold">تسجيل وتعميد طلبات البيع وتوجيهها للتسليم المباشر أو خطوط التشغيل</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button 
            onClick={fetchOrders} 
            className="bg-slate-100 text-slate-700 hover:bg-slate-200 px-3.5 py-2.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors"
            title="تحديث البيانات"
          >
            <RotateCcw size={16} /> تحديث
          </button>

          <button 
            onClick={exportToExcel} 
            className="bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100 px-3.5 py-2.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors"
            title="تصدير إلى إكسيل"
          >
            <Download size={16} /> تصدير Excel
          </button>

          <button 
            onClick={() => navigate('/sales-order-new')} 
            className="bg-blue-600 text-white hover:bg-blue-700 px-4 py-2.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors shadow-sm"
          >
            <Plus size={16} /> أمر بيع وتعميد جديد
          </button>
        </div>
      </div>

      {/* 📊 KPI Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex justify-between items-center">
          <div>
            <span className="text-xs text-slate-400 font-bold block mb-1">إجمالي قيمة أوامر البيع</span>
            <span className="text-xl font-black text-slate-800 font-mono" dir="ltr">
              {summary.totalAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
            <span className="text-xs text-slate-400 font-bold mr-1">{settings.currency || 'ج.م'}</span>
          </div>
          <div className="p-3 bg-blue-50 text-blue-600 rounded-xl font-mono font-bold text-xs">
            {summary.count} أمر
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex justify-between items-center">
          <div>
            <span className="text-xs text-slate-400 font-bold block mb-1">أوامر معمدة للتشغيل</span>
            <span className="text-xl font-black text-blue-600 font-mono">
              {summary.confirmedCount}
            </span>
            <span className="text-xs text-slate-400 font-bold mr-1">أمر معمد 🛡️</span>
          </div>
          <div className="p-3 bg-blue-50 text-blue-600 rounded-xl">
            <ShieldCheck size={20} />
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex justify-between items-center">
          <div>
            <span className="text-xs text-slate-400 font-bold block mb-1">تم الفوترة والصرف</span>
            <span className="text-xl font-black text-purple-600 font-mono">
              {summary.invoicedCount}
            </span>
            <span className="text-xs text-slate-400 font-bold mr-1">أمر مكتمل</span>
          </div>
          <div className="p-3 bg-purple-50 text-purple-600 rounded-xl">
            <CheckCircle2 size={20} />
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex justify-between items-center">
          <div>
            <span className="text-xs text-slate-400 font-bold block mb-1">مسودات وبانتظار التعميد</span>
            <span className="text-xl font-black text-amber-600 font-mono">
              {summary.draftCount}
            </span>
            <span className="text-xs text-slate-400 font-bold mr-1">مسودة</span>
          </div>
          <div className="p-3 bg-amber-50 text-amber-600 rounded-xl">
            <Edit size={20} />
          </div>
        </div>
      </div>

      {/* 🔍 Multi-Filter Section */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm grid grid-cols-1 md:grid-cols-4 gap-3">
        <div className="relative">
          <Search className="absolute right-3 top-3 text-slate-400" size={16} />
          <input 
            type="text" 
            placeholder="بحث برقم أمر البيع، العميل..." 
            value={searchTerm}
            onChange={e => { setSearchTerm(e.target.value); setCurrentPage(1); }}
            className="w-full pr-9 pl-3 py-2 bg-slate-50 border rounded-xl text-xs font-bold outline-none focus:border-blue-500"
          />
        </div>

        <div>
          <select 
            value={selectedCustomerId} 
            onChange={e => { setSelectedCustomerId(e.target.value); setCurrentPage(1); }}
            className="w-full p-2 bg-slate-50 border rounded-xl text-xs font-bold outline-none focus:border-blue-500"
          >
            <option value="">جميع العملاء</option>
            {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>

        <div className="flex gap-2">
          <input 
            type="date" 
            value={startDate} 
            onChange={e => { setStartDate(e.target.value); setCurrentPage(1); }} 
            className="w-full p-2 bg-slate-50 border rounded-xl text-xs font-bold outline-none focus:border-blue-500"
            title="من تاريخ"
          />
          <input 
            type="date" 
            value={endDate} 
            onChange={e => { setEndDate(e.target.value); setCurrentPage(1); }} 
            className="w-full p-2 bg-slate-50 border rounded-xl text-xs font-bold outline-none focus:border-blue-500"
            title="إلى تاريخ"
          />
        </div>

        <div>
          <select 
            value={statusFilter} 
            onChange={e => { setStatusFilter(e.target.value as any); setCurrentPage(1); }}
            className="w-full p-2 bg-slate-50 border rounded-xl text-xs font-bold outline-none focus:border-blue-500"
          >
            <option value="all">جميع الحالات</option>
            <option value="confirmed">معمد ومؤكد 🛡️</option>
            <option value="invoiced">مفوتر ومصروف ✅</option>
            <option value="manufacturing">قيد التصنيع ⚙️</option>
            <option value="ready">جاهز للتسليم 📦</option>
            <option value="draft">مسودة 📝</option>
          </select>
        </div>
      </div>

      {/* 📋 Data Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-16 flex flex-col items-center justify-center text-slate-400 gap-3">
            <Loader2 className="animate-spin text-blue-600" size={36} />
            <span className="font-bold text-sm">جاري تحميل سجل أوامر البيع...</span>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-right text-sm">
              <thead className="bg-slate-50 text-xs font-black text-slate-600 border-b border-slate-200">
                <tr>
                  <th className="p-3.5">رقم أمر البيع</th>
                  <th className="p-3.5">التاريخ</th>
                  <th className="p-3.5">العميل</th>
                  <th className="p-3.5">تاريخ التسليم</th>
                  <th className="p-3.5 text-center">الإجمالي</th>
                  <th className="p-3.5 text-center">الضريبة</th>
                  <th className="p-3.5 text-center">الحالة والتعميد</th>
                  <th className="p-3.5 text-center">إجراءات التعميد والتشغيل</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {paginatedOrders.map((order) => {
                  const total = Number(order.total_amount || 0);

                  return (
                    <tr key={order.id} className="hover:bg-slate-50/60 transition-colors">
                      <td className="p-3.5 font-mono font-bold text-blue-700">{order.order_number || '-'}</td>
                      <td className="p-3.5 text-slate-600 font-mono text-xs">{order.order_date}</td>
                      <td className="p-3.5 font-bold text-slate-800">{order.customers?.name || 'عميل عام'}</td>
                      <td className="p-3.5 text-slate-500 text-xs">{order.expected_delivery_date || '-'}</td>
                      <td className="p-3.5 text-center font-mono font-black text-slate-900" dir="ltr">
                        {total.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                      <td className="p-3.5 text-center font-mono text-slate-600" dir="ltr">
                        {Number(order.tax_amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                      <td className="p-3.5 text-center">
                        {getStatusBadge(order.status)}
                      </td>
                      <td className="p-3.5">
                        <div className="flex items-center justify-center gap-1">
                          
                          {order.status !== 'confirmed' && order.status !== 'invoiced' && (
                            <button 
                              onClick={() => handleConfirm(order)}
                              disabled={confirmingId === order.id}
                              className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors font-bold text-xs flex items-center gap-1"
                              title="تعميد أمر البيع للتشغيل"
                            >
                              {confirmingId === order.id ? <Loader2 size={16} className="animate-spin" /> : <ShieldCheck size={16} />}
                            </button>
                          )}

                          {order.status !== 'invoiced' && (
                            <button 
                              onClick={() => openConvertModal(order)}
                              className="p-1.5 text-purple-600 hover:bg-purple-50 rounded-lg transition-colors"
                              title="تحويل أمر البيع لفاتورة مبيعات وصرف المخزون"
                            >
                              <ArrowRightLeft size={16} />
                            </button>
                          )}

                          <button 
                            onClick={() => navigate('/sales-order-new', { state: { orderToEdit: order } })}
                            className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                            title="عرض وتعديل"
                          >
                            <Edit size={16} />
                          </button>

                          <button 
                            onClick={() => handlePrint(order)}
                            className="p-1.5 text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                            title="طباعة أمر البيع"
                          >
                            <Printer size={16} />
                          </button>

                          <button 
                            onClick={() => handleShareWhatsApp(order)}
                            className="p-1.5 text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors"
                            title="مشاركة عبر واتساب"
                          >
                            <MessageCircle size={16} />
                          </button>

                          <button 
                            onClick={() => handleDelete(order)}
                            disabled={deletingId === order.id}
                            className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50"
                            title="حذف أمر البيع"
                          >
                            {deletingId === order.id ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}

                {filteredOrders.length === 0 && (
                  <tr>
                    <td colSpan={8} className="p-12 text-center text-slate-400 font-bold">
                      لا توجد أوامر بيع مطابقة للبحث أو الفلترة.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination Bar */}
        {filteredOrders.length > itemsPerPage && (
          <div className="p-4 border-t border-slate-200 bg-slate-50 flex items-center justify-between">
            <span className="text-xs text-slate-500 font-bold">
              عرض {paginatedOrders.length} من أصل {filteredOrders.length} أمر بيع
            </span>
            <div className="flex items-center gap-2">
              <button 
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="p-1.5 rounded-lg border bg-white text-slate-600 disabled:opacity-40"
              >
                <ChevronRight size={16} />
              </button>
              <span className="text-xs font-mono font-bold text-slate-700">
                صفحة {currentPage} من {totalPages}
              </span>
              <button 
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                className="p-1.5 rounded-lg border bg-white text-slate-600 disabled:opacity-40"
              >
                <ChevronLeft size={16} />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Convert to Invoice Modal */}
      {isConvertModalOpen && selectedOrderForConvert && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-in fade-in">
          <div className="bg-white rounded-3xl p-6 max-w-md w-full shadow-2xl border border-slate-100">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-black text-slate-800 flex items-center gap-2">
                <WarehouseIcon className="text-purple-600" /> اختيار مستودع الصرف
              </h3>
              <button onClick={() => setIsConvertModalOpen(false)} className="text-slate-400 hover:text-slate-600 p-1">
                <X size={20} />
              </button>
            </div>
            
            <p className="text-sm text-slate-600 mb-4">
              سيتم تحويل أمر البيع المعمد رقم <span className="font-mono font-bold text-purple-700">({selectedOrderForConvert.order_number})</span> إلى فاتورة مبيعات رسمية وخصم المخزون فوراً.
            </p>

            <div className="mb-6">
              <label className="block text-xs font-bold text-slate-700 mb-1">المستودع المصروف منه <span className="text-red-500">*</span></label>
              <select 
                value={targetWarehouseId} 
                onChange={e => setTargetWarehouseId(e.target.value)}
                className="w-full border rounded-xl p-3 bg-slate-50 font-bold text-sm outline-none focus:border-purple-500"
              >
                <option value="">-- اختر المستودع --</option>
                {warehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
              </select>
            </div>

            <div className="flex justify-end gap-2">
              <button 
                type="button" 
                onClick={() => setIsConvertModalOpen(false)} 
                className="px-4 py-2.5 rounded-xl border border-slate-200 text-slate-600 font-bold text-sm hover:bg-slate-50"
              >
                إلغاء
              </button>
              <button 
                type="button" 
                onClick={confirmConversion} 
                disabled={converting || !targetWarehouseId} 
                className="px-5 py-2.5 rounded-xl bg-purple-600 text-white font-bold text-sm hover:bg-purple-700 disabled:opacity-50 flex items-center gap-2"
              >
                {converting ? <Loader2 size={16} className="animate-spin" /> : <ArrowRightLeft size={16} />}
                تأكيد الفوترة والصرف
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Hidden printable order */}
      {orderToPrint && (
        <SalesOrderPrint orderData={orderToPrint} companySettings={companySettings} />
      )}
    </div>
  );
};

export default SalesOrders;

import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../../supabaseClient';
import { 
  FileCheck, Search, Plus, Trash2, Edit, Printer, Download, 
  MessageCircle, Loader2, ArrowRightLeft, CheckCircle2, Clock, 
  AlertCircle, ChevronLeft, ChevronRight, RotateCcw, Warehouse as WarehouseIcon, X 
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAccounting } from '../../context/AccountingContext';
import { useToast } from '../../context/ToastContext';
import * as XLSX from 'xlsx';
import { PurchaseOrderPrint } from './PurchaseOrderPrint';

export const PurchaseOrderList = () => {
  const { 
    suppliers, warehouses, currentUser, settings, 
    convertPoToInvoice, selectedFiscalYear, fiscalYearRange 
  } = useAccounting();
  const navigate = useNavigate();
  const { showToast } = useToast();

  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [startDate, setStartDate] = useState(fiscalYearRange.startDate);
  const [endDate, setEndDate] = useState(`${selectedFiscalYear}-12-31`);
  const [selectedSupplierId, setSelectedSupplierId] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'draft' | 'sent' | 'converted' | 'posted' | 'cancelled'>('all');
  
  // Printing & Action States
  const [orderToPrint, setOrderToPrint] = useState<any | null>(null);
  const [companySettings, setCompanySettings] = useState<any>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

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
        .from('purchase_orders')
        .select(`
          *,
          suppliers(id, name, phone),
          purchase_order_items(id, product_id, quantity, unit_price, total, uom_id, products(name, sku))
        `)
        .eq('organization_id', userOrgId)
        .order('order_date', { ascending: false })
        .order('created_at', { ascending: false });

      if (startDate) query = query.gte('order_date', startDate);
      if (endDate) query = query.lte('order_date', endDate);
      if (selectedSupplierId) query = query.eq('supplier_id', selectedSupplierId);
      if (statusFilter !== 'all') {
        if (statusFilter === 'converted') {
          query = query.in('status', ['converted', 'invoiced']);
        } else if (statusFilter === 'posted') {
          query = query.in('status', ['posted', 'completed']);
        } else {
          query = query.eq('status', statusFilter);
        }
      }

      let { data, error } = await query;

      if (error && (error.code === 'PGRST201' || error.message?.includes('more than one relationship'))) {
        let retryQuery = supabase
          .from('purchase_orders')
          .select(`
            *,
            suppliers(id, name, phone),
            purchase_order_items!purchase_order_id(id, product_id, quantity, unit_price, total, uom_id, products(name, sku))
          `)
          .eq('organization_id', userOrgId)
          .order('order_date', { ascending: false })
          .order('created_at', { ascending: false });

        if (startDate) retryQuery = retryQuery.gte('order_date', startDate);
        if (endDate) retryQuery = retryQuery.lte('order_date', endDate);
        if (selectedSupplierId) retryQuery = retryQuery.eq('supplier_id', selectedSupplierId);
        if (statusFilter !== 'all') {
          if (statusFilter === 'converted') {
            retryQuery = retryQuery.in('status', ['converted', 'invoiced']);
          } else if (statusFilter === 'posted') {
            retryQuery = retryQuery.in('status', ['posted', 'completed']);
          } else {
            retryQuery = retryQuery.eq('status', statusFilter);
          }
        }

        const retryRes = await retryQuery;
        data = retryRes.data;
        error = retryRes.error;
      }

      if (error) throw error;

      setOrders(data || []);
    } catch (err: any) {
      console.error('Error fetching purchase orders:', err);
      showToast('فشل تحميل سجل أوامر الشراء: ' + err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOrders();
  }, [startDate, endDate, selectedSupplierId, statusFilter]);

  // Client-side search
  const filteredOrders = useMemo(() => {
    if (!searchTerm.trim()) return orders;
    const term = searchTerm.toLowerCase().trim();
    return orders.filter(o => 
      ((o.po_number || o.order_number) && (o.po_number || o.order_number).toLowerCase().includes(term)) ||
      (o.suppliers?.name && o.suppliers.name.toLowerCase().includes(term)) ||
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
    const sentCount = filteredOrders.filter(o => o.status === 'sent').length;
    const convertedCount = filteredOrders.filter(o => ['converted', 'invoiced', 'posted', 'completed'].includes(o.status)).length;
    const draftCount = filteredOrders.filter(o => !o.status || o.status === 'draft').length;

    return { totalAmount, sentCount, convertedCount, draftCount, count: filteredOrders.length };
  }, [filteredOrders]);

  const handleDelete = async (order: any) => {
    const num = order.po_number || order.order_number || '';
    if (!window.confirm(`هل أنت متأكد من حذف أمر الشراء رقم (${num})؟`)) {
      return;
    }

    setDeletingId(order.id);
    try {
      let delItems = await supabase.from('purchase_order_items').delete().eq('purchase_order_id', order.id);
      if (delItems.error && delItems.error.message?.includes('purchase_order_id')) {
        await supabase.from('purchase_order_items').delete().eq('order_id', order.id);
      }
      const { error: delErr } = await supabase.from('purchase_orders').delete().eq('id', order.id);
      if (delErr) throw delErr;

      showToast('تم حذف أمر الشراء بنجاح ✅', 'success');
      fetchOrders();

    } catch (err: any) {
      console.error('Error deleting PO:', err);
      showToast('فشل حذف أمر الشراء: ' + err.message, 'error');
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
      showToast('يرجى اختيار مستودع الاستلام', 'warning');
      return;
    }

    setConverting(true);
    try {
      await convertPoToInvoice(selectedOrderForConvert.id, targetWarehouseId, selectedOrderForConvert.organization_id);
      showToast('تم تحويل أمر الشراء إلى فاتورة مشتريات واستلام المخزون بنجاح ✅', 'success');
      setIsConvertModalOpen(false);
      setSelectedOrderForConvert(null);
      fetchOrders();
    } catch (err: any) {
      console.error(err);
      showToast('فشل تحويل أمر الشراء: ' + err.message, 'error');
    } finally {
      setConverting(false);
    }
  };

  const handlePrint = (order: any) => {
    setOrderToPrint({
      orderNumber: order.po_number || order.order_number,
      date: order.order_date,
      deliveryDate: order.expected_delivery_date,
      supplierName: order.suppliers?.name || 'مورد عام',
      notes: order.notes,
      totalAmount: order.total_amount,
      taxAmount: order.tax_amount,
      items: (order.purchase_order_items || []).map((i: any) => ({
        name: i.products?.name || 'صنف',
        quantity: i.quantity,
        unitPrice: i.unit_price,
        total: i.total
      }))
    });

    setTimeout(() => {
      window.print();
      setOrderToPrint(null);
    }, 200);
  };

  const handleShareWhatsApp = (order: any) => {
    const phone = order.suppliers?.phone ? order.suppliers.phone.replace(/[^0-9]/g, '') : '';
    const num = order.po_number || order.order_number || '';
    const message = `مرحباً ${order.suppliers?.name || 'السادة المورد'},\nنود إخطاركم بطلب توريد / أمر شراء رقم: ${num}\nالتاريخ: ${order.order_date}\nالإجمالي التقديري: ${Number(order.total_amount).toLocaleString()} ${settings.currency || 'ج.م'}\nالحالة: ${order.status === 'sent' ? 'مرسل ومعتمد' : 'مسودة'}\nيرجى مراجعة وتجهيز الطلب. شكراً لكم.`;
    
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
      'رقم أمر الشراء': o.po_number || o.order_number || '-',
      'التاريخ': o.order_date,
      'تاريخ التسليم المتوقع': o.expected_delivery_date || '-',
      'المورد': o.suppliers?.name || 'مورد عام',
      'الإجمالي': o.total_amount,
      'الضريبة': o.tax_amount,
      'الحالة': (o.status === 'posted' || o.status === 'completed') ? 'مرحل ومكتمل' : (o.status === 'converted' || o.status === 'invoiced') ? 'محول لفاتورة' : o.status === 'sent' ? 'مرسل للمورد' : o.status === 'cancelled' ? 'ملغي' : 'مسودة',
      'ملاحظات': o.notes || ''
    }));

    const ws = XLSX.utils.json_to_sheet(dataToExport);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'أوامر الشراء');
    XLSX.writeFile(wb, `سجل_أوامر_الشراء_${new Date().toISOString().split('T')[0]}.xlsx`);
    showToast('تم تصدير سجل أوامر الشراء إلى إكسيل بنجاح ✅', 'success');
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'posted':
      case 'completed':
        return <span className="bg-emerald-100 text-emerald-700 text-xs px-2.5 py-1 rounded-full font-bold inline-flex items-center gap-1"><CheckCircle2 size={12} /> مرحّل (مكتمل) ✅</span>;
      case 'converted':
      case 'invoiced':
        return <span className="bg-purple-100 text-purple-700 text-xs px-2.5 py-1 rounded-full font-bold inline-flex items-center gap-1"><ArrowRightLeft size={12} /> محول لفاتورة 🔄</span>;
      case 'sent':
        return <span className="bg-blue-100 text-blue-700 text-xs px-2.5 py-1 rounded-full font-bold inline-flex items-center gap-1"><Clock size={12} /> مرسل للمورد 📬</span>;
      case 'cancelled':
        return <span className="bg-red-100 text-red-700 text-xs px-2.5 py-1 rounded-full font-bold inline-flex items-center gap-1"><AlertCircle size={12} /> ملغي ❌</span>;
      default:
        return <span className="bg-amber-100 text-amber-700 text-xs px-2.5 py-1 rounded-full font-bold inline-flex items-center gap-1">مسودة 📝</span>;
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in">
      
      {/* 🚀 Header */}
      <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200 flex flex-col md:flex-row justify-between items-center gap-4">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-blue-50 text-blue-600 rounded-xl">
            <FileCheck size={28} />
          </div>
          <div>
            <h2 className="text-xl font-black text-slate-800 flex items-center gap-2">
              سجل أوامر الشراء
              <span className="text-xs px-2.5 py-0.5 rounded-full bg-blue-100 text-blue-700 font-bold font-mono">
                {filteredOrders.length} أمر
              </span>
            </h2>
            <p className="text-xs text-slate-400 font-bold">متابعة وتعميد أوامر الشراء والتوريد وتحويلها لفواتير مخزنية</p>
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
            onClick={() => navigate('/purchase-order-new')} 
            className="bg-blue-600 text-white hover:bg-blue-700 px-4 py-2.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors shadow-sm"
          >
            <Plus size={16} /> أمر شراء جديد
          </button>
        </div>
      </div>

      {/* 📊 KPI Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex justify-between items-center">
          <div>
            <span className="text-xs text-slate-400 font-bold block mb-1">إجمالي قيمة الأوامر</span>
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
            <span className="text-xs text-slate-400 font-bold block mb-1">بانتظار التوريد</span>
            <span className="text-xl font-black text-blue-600 font-mono">
              {summary.sentCount}
            </span>
            <span className="text-xs text-slate-400 font-bold mr-1">أمر مرسل</span>
          </div>
          <div className="p-3 bg-blue-50 text-blue-600 rounded-xl">
            <Clock size={20} />
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex justify-between items-center">
          <div>
            <span className="text-xs text-slate-400 font-bold block mb-1">محولة لفواتير</span>
            <span className="text-xl font-black text-purple-600 font-mono">
              {summary.convertedCount}
            </span>
            <span className="text-xs text-slate-400 font-bold mr-1">أمر مكتمل</span>
          </div>
          <div className="p-3 bg-purple-50 text-purple-600 rounded-xl">
            <CheckCircle2 size={20} />
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex justify-between items-center">
          <div>
            <span className="text-xs text-slate-400 font-bold block mb-1">مسودات معلقة</span>
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
            placeholder="بحث برقم أمر الشراء، المورد..." 
            value={searchTerm}
            onChange={e => { setSearchTerm(e.target.value); setCurrentPage(1); }}
            className="w-full pr-9 pl-3 py-2 bg-slate-50 border rounded-xl text-xs font-bold outline-none focus:border-blue-500"
          />
        </div>

        <div>
          <select 
            value={selectedSupplierId} 
            onChange={e => { setSelectedSupplierId(e.target.value); setCurrentPage(1); }}
            className="w-full p-2 bg-slate-50 border rounded-xl text-xs font-bold outline-none focus:border-blue-500"
          >
            <option value="">جميع الموردين</option>
            {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
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
            <option value="sent">بانتظار التوريد 📬</option>
            <option value="converted">محول لفاتورة 🔄</option>
            <option value="posted">مرحّل (مكتمل) ✅</option>
            <option value="draft">مسودة 📝</option>
            <option value="cancelled">ملغي ❌</option>
          </select>
        </div>
      </div>

      {/* 📋 Data Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-16 flex flex-col items-center justify-center text-slate-400 gap-3">
            <Loader2 className="animate-spin text-blue-600" size={36} />
            <span className="font-bold text-sm">جاري تحميل سجل أوامر الشراء...</span>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-right text-sm">
              <thead className="bg-slate-50 text-xs font-black text-slate-600 border-b border-slate-200">
                <tr>
                  <th className="p-3.5">رقم الأمر</th>
                  <th className="p-3.5">التاريخ</th>
                  <th className="p-3.5">المورد</th>
                  <th className="p-3.5">تاريخ التسليم</th>
                  <th className="p-3.5 text-center">الإجمالي</th>
                  <th className="p-3.5 text-center">الضريبة</th>
                  <th className="p-3.5 text-center">الحالة</th>
                  <th className="p-3.5 text-center">إجراءات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {paginatedOrders.map((order) => {
                  const total = Number(order.total_amount || 0);

                  return (
                    <tr key={order.id} className="hover:bg-slate-50/60 transition-colors">
                      <td className="p-3.5 font-mono font-bold text-blue-700">{order.po_number || order.order_number || '-'}</td>
                      <td className="p-3.5 text-slate-600 font-mono text-xs">{order.order_date}</td>
                      <td className="p-3.5 font-bold text-slate-800">{order.suppliers?.name || 'مورد عام'}</td>
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
                          
                          {order.status !== 'converted' && order.status !== 'invoiced' && order.status !== 'posted' && order.status !== 'completed' && order.status !== 'cancelled' && (
                            <button 
                              onClick={() => openConvertModal(order)}
                              className="p-1.5 text-purple-600 hover:bg-purple-50 rounded-lg transition-colors"
                              title="تحويل أمر الشراء لفاتورة مشتريات"
                            >
                              <ArrowRightLeft size={16} />
                            </button>
                          )}

                          <button 
                            onClick={() => navigate('/purchase-order-new', { state: { orderToEdit: order } })}
                            className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                            title="عرض وتعديل"
                          >
                            <Edit size={16} />
                          </button>

                          <button 
                            onClick={() => handlePrint(order)}
                            className="p-1.5 text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                            title="طباعة أمر الشراء"
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
                            title="حذف أمر الشراء"
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
                      لا توجد أوامر شراء مطابقة للبحث أو الفلترة.
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
              عرض {paginatedOrders.length} من أصل {filteredOrders.length} أمر شراء
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
                <WarehouseIcon className="text-purple-600" /> اختيار مستودع الاستلام
              </h3>
              <button onClick={() => setIsConvertModalOpen(false)} className="text-slate-400 hover:text-slate-600 p-1">
                <X size={20} />
              </button>
            </div>
            
            <p className="text-sm text-slate-600 mb-4">
              سيتم تحويل أمر الشراء رقم <span className="font-mono font-bold text-purple-700">({selectedOrderForConvert.po_number || selectedOrderForConvert.order_number})</span> إلى فاتورة مشتريات رسمية وتحديث كميات المخزون فوراً.
            </p>

            <div className="mb-6">
              <label className="block text-xs font-bold text-slate-700 mb-1">المستودع المستلم <span className="text-red-500">*</span></label>
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
                تأكيد التحويل لفاتورة
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Hidden printable order */}
      {orderToPrint && (
        <PurchaseOrderPrint orderData={orderToPrint} companySettings={companySettings} />
      )}
    </div>
  );
};

export default PurchaseOrderList;

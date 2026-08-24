import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAccounting } from '../../context/AccountingContext';
import { supabase } from '../../supabaseClient';
import { 
  Search, Loader2, Edit, Plus, ChevronLeft, ChevronRight, 
  AlertCircle, FileText, CheckCircle, MessageCircle, Printer, 
  Landmark, RotateCcw, Download, Trash2, Warehouse as WarehouseIcon,
  DollarSign, Unlock
} from 'lucide-react';
import { etaService } from '../../services/etaService';
import { SalesInvoicePrint } from './SalesInvoicePrint';
import { useToast } from '../../context/ToastContext';
import * as XLSX from 'xlsx';

export const InvoiceList = () => {
  const { 
    settings, approveInvoice, currentUser, customers, warehouses, 
    selectedFiscalYear, fiscalYearRange 
  } = useAccounting();
  const navigate = useNavigate();
  const { showToast } = useToast();

  const [invoices, setInvoices] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [startDate, setStartDate] = useState(fiscalYearRange.startDate);
  const [endDate, setEndDate] = useState(`${selectedFiscalYear}-12-31`);
  const [selectedCustomerId, setSelectedCustomerId] = useState('');
  const [selectedWarehouseId, setSelectedWarehouseId] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'posted' | 'draft'>('all');
  
  // Printing & Action States
  const [invoiceToPrint, setInvoiceToPrint] = useState<any | null>(null);
  const [companySettings, setCompanySettings] = useState<any>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [submittingId, setSubmittingId] = useState<string | null>(null);

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

  const fetchInvoices = async () => {
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const userOrgId = session?.user?.user_metadata?.org_id;
      if (!userOrgId) {
        setLoading(false);
        return;
      }

      let query = supabase
        .from('invoices')
        .select(`
          *,
          customers(id, name, phone),
          warehouses(id, name),
          invoice_items(id, product_id, quantity, unit_price, total, products(name, sku))
        `)
        .eq('organization_id', userOrgId)
        .order('invoice_date', { ascending: false })
        .order('created_at', { ascending: false });

      if (startDate) query = query.gte('invoice_date', startDate);
      if (endDate) query = query.lte('invoice_date', endDate);
      if (selectedCustomerId) query = query.eq('customer_id', selectedCustomerId);
      if (selectedWarehouseId) query = query.eq('warehouse_id', selectedWarehouseId);
      if (statusFilter !== 'all') query = query.eq('status', statusFilter);

      const { data, error } = await query;
      if (error) throw error;

      setInvoices(data || []);
    } catch (err: any) {
      console.error('Error fetching sales invoices:', err);
      showToast('فشل تحميل سجل فواتير المبيعات: ' + err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchInvoices();
  }, [startDate, endDate, selectedCustomerId, selectedWarehouseId, statusFilter]);

  // Client-side search
  const filteredInvoices = useMemo(() => {
    if (!searchTerm.trim()) return invoices;
    const term = searchTerm.toLowerCase().trim();
    return invoices.filter(inv => 
      (inv.invoice_number && inv.invoice_number.toLowerCase().includes(term)) ||
      (inv.customers?.name && inv.customers.name.toLowerCase().includes(term)) ||
      (inv.notes && inv.notes.toLowerCase().includes(term))
    );
  }, [invoices, searchTerm]);

  // Pagination calculation
  const totalPages = Math.ceil(filteredInvoices.length / itemsPerPage) || 1;
  const paginatedInvoices = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return filteredInvoices.slice(start, start + itemsPerPage);
  }, [filteredInvoices, currentPage]);

  // Summary KPIs
  const summary = useMemo(() => {
    const totalAmount = filteredInvoices.reduce((sum, i) => sum + Number(i.total_amount || 0), 0);
    const totalTax = filteredInvoices.reduce((sum, i) => sum + Number(i.tax_amount || 0), 0);
    const totalPaid = filteredInvoices.reduce((sum, i) => sum + Number(i.paid_amount || 0), 0);
    const totalRemaining = totalAmount - totalPaid;
    const postedCount = filteredInvoices.filter(i => i.status === 'posted').length;
    const draftCount = filteredInvoices.filter(i => i.status === 'draft').length;

    return { totalAmount, totalTax, totalPaid, totalRemaining, postedCount, draftCount, count: filteredInvoices.length };
  }, [filteredInvoices]);

  const handleApprove = async (invoice: any) => {
    if (!window.confirm(`هل أنت متأكد من اعتماد وترحيل الفاتورة رقم (${invoice.invoice_number})؟\nسيتم إنشاء القيود المحاسبية وخصم الكميات من المخزن فوراً.`)) {
      return;
    }

    try {
      const success = await approveInvoice(invoice.id);
      if (success) {
        showToast('تم ترحيل الفاتورة بنجاح ✅', 'success');
        fetchInvoices();
      }
    } catch (err: any) {
      console.error(err);
      showToast('فشل ترحيل الفاتورة: ' + err.message, 'error');
    }
  };

  const handleUnpost = async (invoice: any) => {
    if (!window.confirm(`هل أنت متأكد من إلغاء ترحيل فاتورة المبيعات رقم (${invoice.invoice_number})؟\n\nسيتم:\n1- عكس حركة المخزون وإعادة الكميات للمستودع.\n2- حذف القيد المحاسبي بالكامل.\n3- تحويل الفاتورة إلى مسودة (Draft) لتتمكن من تعديلها.`)) {
      return;
    }

    setDeletingId(invoice.id);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const userOrgId = session?.user?.user_metadata?.org_id;

      // 1. عكس حركة المخزون
      for (const item of (invoice.invoice_items || [])) {
        if (item.product_id && item.quantity) {
          const { data: prod } = await supabase.from('products').select('stock, warehouse_stock').eq('id', item.product_id).single();
          if (prod) {
            const newStock = (Number(prod.stock) || 0) + Number(item.quantity);
            let newWStock = prod.warehouse_stock || {};
            if (invoice.warehouse_id && newWStock[invoice.warehouse_id] !== undefined) {
              newWStock[invoice.warehouse_id] = (Number(newWStock[invoice.warehouse_id]) || 0) + Number(item.quantity);
            }
            await supabase.from('products').update({ stock: newStock, warehouse_stock: newWStock }).eq('id', item.product_id);
          }
        }
      }

      // 2. حذف القيد المحاسبي المرتبط
      if (invoice.related_journal_entry_id) {
        await supabase.from('journal_entries').delete().eq('id', invoice.related_journal_entry_id);
      } else {
        await supabase.from('journal_entries').delete().eq('organization_id', userOrgId).eq('reference', invoice.invoice_number);
      }

      // 3. تحديث حالة الفاتورة لمسودة
      const { error: updateErr } = await supabase.from('invoices').update({
        status: 'draft',
        related_journal_entry_id: null
      }).eq('id', invoice.id);

      if (updateErr) throw updateErr;

      showToast('تم إلغاء ترحيل الفاتورة بنجاح وتحويلها لمسودة ✅', 'success');
      fetchInvoices();

    } catch (err: any) {
      console.error('Error unposting invoice:', err);
      showToast('فشل إلغاء ترحيل الفاتورة: ' + err.message, 'error');
    } finally {
      setDeletingId(null);
    }
  };

  const handleDelete = async (invoice: any) => {
    if (!window.confirm(`هل أنت متأكد من حذف فاتورة المبيعات رقم (${invoice.invoice_number})؟\nسيتم إلغاء أثرها على المخزون والقيد المحاسبي بالكامل.`)) {
      return;
    }

    setDeletingId(invoice.id);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const userOrgId = session?.user?.user_metadata?.org_id;

      if (invoice.status === 'posted') {
        // إعادة إضافة الكميات للمخزون
        for (const item of (invoice.invoice_items || [])) {
          if (item.product_id && item.quantity) {
            const { data: prod } = await supabase.from('products').select('stock, warehouse_stock').eq('id', item.product_id).single();
            if (prod) {
              const newStock = (Number(prod.stock) || 0) + Number(item.quantity);
              let newWStock = prod.warehouse_stock || {};
              if (invoice.warehouse_id && newWStock[invoice.warehouse_id] !== undefined) {
                newWStock[invoice.warehouse_id] = (Number(newWStock[invoice.warehouse_id]) || 0) + Number(item.quantity);
              }
              await supabase.from('products').update({ stock: newStock, warehouse_stock: newWStock }).eq('id', item.product_id);
            }
          }
        }

        // حذف القيد المحاسبي
        if (invoice.related_journal_entry_id) {
          await supabase.from('journal_entries').delete().eq('id', invoice.related_journal_entry_id);
        } else {
          await supabase.from('journal_entries').delete().eq('organization_id', userOrgId).eq('reference', invoice.invoice_number);
        }
      }

      await supabase.from('invoice_items').delete().eq('invoice_id', invoice.id);
      const { error: delErr } = await supabase.from('invoices').delete().eq('id', invoice.id);
      if (delErr) throw delErr;

      showToast('تم حذف فاتورة المبيعات وعكس الحركات بنجاح ✅', 'success');
      fetchInvoices();

    } catch (err: any) {
      console.error('Error deleting sales invoice:', err);
      showToast('فشل حذف الفاتورة: ' + err.message, 'error');
    } finally {
      setDeletingId(null);
    }
  };

  const handlePrint = (invoice: any) => {
    setInvoiceToPrint(invoice);
    setTimeout(() => {
      window.print();
      setInvoiceToPrint(null);
    }, 200);
  };

  const handleWhatsApp = (invoice: any) => {
    const phone = invoice.customers?.phone ? invoice.customers.phone.replace(/[^0-9]/g, '') : '';
    const message = `مرحباً ${invoice.customers?.name || 'عميلنا العزيز'},\nإليك تفاصيل فاتورة المبيعات رقم: ${invoice.invoice_number}\nالتاريخ: ${invoice.invoice_date}\nالإجمالي: ${Number(invoice.total_amount).toLocaleString()} ${settings.currency || 'ج.م'}\nالمسدد: ${Number(invoice.paid_amount || 0).toLocaleString()} ${settings.currency || 'ج.م'}\nالمتبقي: ${((invoice.total_amount || 0) - (invoice.paid_amount || 0)).toLocaleString()} ${settings.currency || 'ج.م'}\nشكراً لتعاملكم معنا.`;
    
    const url = phone 
      ? `https://wa.me/${phone.startsWith('0') ? '20' + phone.substring(1) : phone}?text=${encodeURIComponent(message)}`
      : `https://wa.me/?text=${encodeURIComponent(message)}`;
      
    window.open(url, '_blank');
  };

  const handleEtaSubmit = async (invoice: any) => {
    setSubmittingId(invoice.id);
    try {
      showToast('جاري إرسال الفاتورة لمنظومة الفاتورة الإلكترونية...', 'info');
      const response = await etaService.submitInvoiceToETA(invoice.id);
      if (response && response.uuid) {
        showToast('تم إرسال الفاتورة للضرائب بنجاح ✅', 'success');
        fetchInvoices();
      } else {
        showToast('فشل الإرسال لمنظومة الضرائب', 'error');
      }
    } catch (err: any) {
      console.error(err);
      showToast('خطأ في الإرسال: ' + err.message, 'error');
    } finally {
      setSubmittingId(null);
    }
  };

  const exportToExcel = () => {
    if (filteredInvoices.length === 0) {
      showToast('لا توجد بيانات للتصدير', 'warning');
      return;
    }

    const dataToExport = filteredInvoices.map((inv, idx) => ({
      '#': idx + 1,
      'رقم الفاتورة': inv.invoice_number || '-',
      'التاريخ': inv.invoice_date,
      'العميل': inv.customers?.name || 'عميل عام',
      'المستودع': inv.warehouses?.name || '-',
      'الإجمالي': inv.total_amount,
      'الضريبة': inv.tax_amount || 0,
      'المسدد': inv.paid_amount || 0,
      'المتبقي': (inv.total_amount || 0) - (inv.paid_amount || 0),
      'الحالة': inv.status === 'posted' ? 'مرحلة' : 'مسودة',
      'ملاحظات': inv.notes || ''
    }));

    const ws = XLSX.utils.json_to_sheet(dataToExport);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'فواتير المبيعات');
    XLSX.writeFile(wb, `سجل_فواتير_المبيعات_${new Date().toISOString().split('T')[0]}.xlsx`);
    showToast('تم تصدير سجل المبيعات إلى إكسيل بنجاح ✅', 'success');
  };

  return (
    <div className="space-y-6 animate-in fade-in">
      
      {/* 🚀 Header */}
      <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200 flex flex-col md:flex-row justify-between items-center gap-4">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-blue-50 text-blue-600 rounded-xl">
            <FileText size={28} />
          </div>
          <div>
            <h2 className="text-xl font-black text-slate-800 flex items-center gap-2">
              سجل فواتير المبيعات
              <span className="text-xs px-2.5 py-0.5 rounded-full bg-blue-100 text-blue-700 font-bold font-mono">
                {filteredInvoices.length} فاتورة
              </span>
            </h2>
            <p className="text-xs text-slate-400 font-bold">متابعة فواتير البيع وتحصيل المستحقات والربط مع منظومة الضرائب</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button 
            onClick={fetchInvoices} 
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
            onClick={() => navigate('/sales-invoice')} 
            className="bg-blue-600 text-white hover:bg-blue-700 px-4 py-2.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors shadow-sm"
          >
            <Plus size={16} /> فاتورة مبيعات جديدة
          </button>
        </div>
      </div>

      {/* 📊 KPI Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex justify-between items-center">
          <div>
            <span className="text-xs text-slate-400 font-bold block mb-1">إجمالي المبيعات</span>
            <span className="text-xl font-black text-slate-800 font-mono" dir="ltr">
              {summary.totalAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
            <span className="text-xs text-slate-400 font-bold mr-1">{settings.currency || 'ج.م'}</span>
          </div>
          <div className="p-3 bg-blue-50 text-blue-600 rounded-xl font-mono font-bold text-xs">
            {summary.count} فاتورة
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex justify-between items-center">
          <div>
            <span className="text-xs text-slate-400 font-bold block mb-1">المبالغ المحصلة</span>
            <span className="text-xl font-black text-emerald-600 font-mono" dir="ltr">
              {summary.totalPaid.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
            <span className="text-xs text-slate-400 font-bold mr-1">{settings.currency || 'ج.م'}</span>
          </div>
          <div className="p-3 bg-emerald-50 text-emerald-600 rounded-xl">
            <CheckCircle size={20} />
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex justify-between items-center">
          <div>
            <span className="text-xs text-slate-400 font-bold block mb-1">المتبقي والآجل</span>
            <span className="text-xl font-black text-red-600 font-mono" dir="ltr">
              {summary.totalRemaining.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
            <span className="text-xs text-slate-400 font-bold mr-1">{settings.currency || 'ج.م'}</span>
          </div>
          <div className="p-3 bg-red-50 text-red-600 rounded-xl font-bold text-xs">
            {summary.draftCount} مسودة
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex justify-between items-center">
          <div>
            <span className="text-xs text-slate-400 font-bold block mb-1">ضريبة القيمة المضافة</span>
            <span className="text-xl font-black text-purple-600 font-mono" dir="ltr">
              {summary.totalTax.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
            <span className="text-xs text-slate-400 font-bold mr-1">{settings.currency || 'ج.م'}</span>
          </div>
          <div className="p-3 bg-purple-50 text-purple-600 rounded-xl font-mono font-bold text-xs">
            {summary.postedCount} مرحلة
          </div>
        </div>
      </div>

      {/* 🔍 Multi-Filter Section */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm grid grid-cols-1 md:grid-cols-5 gap-3">
        <div className="relative">
          <Search className="absolute right-3 top-3 text-slate-400" size={16} />
          <input 
            type="text" 
            placeholder="بحث برقم الفاتورة، العميل..." 
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

        <div>
          <select 
            value={selectedWarehouseId} 
            onChange={e => { setSelectedWarehouseId(e.target.value); setCurrentPage(1); }}
            className="w-full p-2 bg-slate-50 border rounded-xl text-xs font-bold outline-none focus:border-blue-500"
          >
            <option value="">جميع المستودعات</option>
            {warehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
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
            <option value="posted">مرحلة ومكتملة ✅</option>
            <option value="draft">مسودة 📝</option>
          </select>
        </div>
      </div>

      {/* 📋 Data Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-16 flex flex-col items-center justify-center text-slate-400 gap-3">
            <Loader2 className="animate-spin text-blue-600" size={36} />
            <span className="font-bold text-sm">جاري تحميل سجل المبيعات...</span>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-right text-sm">
              <thead className="bg-slate-50 text-xs font-black text-slate-600 border-b border-slate-200">
                <tr>
                  <th className="p-3.5">رقم الفاتورة</th>
                  <th className="p-3.5">التاريخ</th>
                  <th className="p-3.5">العميل</th>
                  <th className="p-3.5">المستودع</th>
                  <th className="p-3.5 text-center">الإجمالي</th>
                  <th className="p-3.5 text-center">المحصل</th>
                  <th className="p-3.5 text-center">المتبقي</th>
                  <th className="p-3.5 text-center">الحالة</th>
                  <th className="p-3.5 text-center">إجراءات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {paginatedInvoices.map((inv) => {
                  const total = Number(inv.total_amount || 0);
                  const paid = Number(inv.paid_amount || 0);
                  const remaining = total - paid;

                  return (
                    <tr key={inv.id} className="hover:bg-slate-50/60 transition-colors">
                      <td className="p-3.5 font-mono font-bold text-blue-700">{inv.invoice_number || '-'}</td>
                      <td className="p-3.5 text-slate-600 font-mono text-xs">{inv.invoice_date}</td>
                      <td className="p-3.5 font-bold text-slate-800">{inv.customers?.name || 'عميل عام'}</td>
                      <td className="p-3.5 text-slate-600 text-xs">{inv.warehouses?.name || '-'}</td>
                      <td className="p-3.5 text-center font-mono font-black text-slate-900" dir="ltr">
                        {total.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                      <td className="p-3.5 text-center font-mono font-bold text-emerald-600" dir="ltr">
                        {paid.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                      <td className="p-3.5 text-center font-mono font-bold text-red-600" dir="ltr">
                        {remaining.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                      <td className="p-3.5 text-center">
                        <span className={`text-xs px-2.5 py-1 rounded-full font-bold inline-flex items-center gap-1 ${
                          inv.status === 'posted' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
                        }`}>
                          {inv.status === 'posted' ? <><CheckCircle size={12} /> مرحلة</> : 'مسودة'}
                        </span>
                      </td>
                      <td className="p-3.5">
                        <div className="flex items-center justify-center gap-1">
                          {inv.status === 'draft' ? (
                            <button 
                              onClick={() => handleApprove(inv)}
                              className="p-1.5 text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors"
                              title="ترحيل الفاتورة وتوليد القيد"
                            >
                              <CheckCircle size={16} />
                            </button>
                          ) : (
                            <button 
                              onClick={() => handleUnpost(inv)}
                              disabled={deletingId === inv.id}
                              className="p-1.5 text-amber-600 hover:bg-amber-50 rounded-lg transition-colors disabled:opacity-50"
                              title="إلغاء الترحيل وتحويل لمسودة للتعديل"
                            >
                              {deletingId === inv.id ? <Loader2 size={16} className="animate-spin" /> : <Unlock size={16} />}
                            </button>
                          )}

                          <button 
                            onClick={() => navigate('/sales-invoice', { state: { invoiceToEdit: inv } })}
                            className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                            title="عرض وتعديل"
                          >
                            <Edit size={16} />
                          </button>

                          <button 
                            onClick={() => handlePrint(inv)}
                            className="p-1.5 text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                            title="طباعة الفاتورة"
                          >
                            <Printer size={16} />
                          </button>

                          <button 
                            onClick={() => handleWhatsApp(inv)}
                            className="p-1.5 text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors"
                            title="مشاركة عبر واتساب"
                          >
                            <MessageCircle size={16} />
                          </button>

                          {settings.enableEta && (
                            <button 
                              onClick={() => handleEtaSubmit(inv)}
                              disabled={submittingId === inv.id}
                              className="p-1.5 text-amber-600 hover:bg-amber-50 rounded-lg transition-colors disabled:opacity-50"
                              title="إرسال لمنظومة الضرائب"
                            >
                              {submittingId === inv.id ? <Loader2 size={16} className="animate-spin" /> : <Landmark size={16} />}
                            </button>
                          )}

                          <button 
                            onClick={() => handleDelete(inv)}
                            disabled={deletingId === inv.id}
                            className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50"
                            title="حذف الفاتورة"
                          >
                            {deletingId === inv.id ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}

                {filteredInvoices.length === 0 && (
                  <tr>
                    <td colSpan={9} className="p-12 text-center text-slate-400 font-bold">
                      لا توجد فواتير مبيعات مطابقة للبحث أو الفلترة.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination Bar */}
        {filteredInvoices.length > itemsPerPage && (
          <div className="p-4 border-t border-slate-200 bg-slate-50 flex items-center justify-between">
            <span className="text-xs text-slate-500 font-bold">
              عرض {paginatedInvoices.length} من أصل {filteredInvoices.length} فاتورة
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

      {/* Hidden printable invoice */}
      {invoiceToPrint && (
        <SalesInvoicePrint invoice={invoiceToPrint} companySettings={companySettings} />
      )}
    </div>
  );
};

export default InvoiceList;

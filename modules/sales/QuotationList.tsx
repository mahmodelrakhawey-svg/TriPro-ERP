import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../../supabaseClient';
import { useAccounting } from '../../context/AccountingContext';
import { useToast } from '../../context/ToastContext';
import { 
  FileText, Search, Plus, Trash2, Edit, Printer, Download, 
  MessageCircle, Loader2, ArrowRightLeft, CheckCircle2, Clock, 
  AlertCircle, ChevronLeft, ChevronRight, RotateCcw, X, Warehouse as WarehouseIcon
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import * as XLSX from 'xlsx';
import { QuotationPrint } from './QuotationPrint';

export const QuotationList = () => {
  const { 
    customers, warehouses, currentUser, settings, 
    selectedFiscalYear, fiscalYearRange 
  } = useAccounting();
  const navigate = useNavigate();
  const { showToast } = useToast();

  const [quotations, setQuotations] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [startDate, setStartDate] = useState(fiscalYearRange.startDate);
  const [endDate, setEndDate] = useState(`${selectedFiscalYear}-12-31`);
  const [selectedCustomerId, setSelectedCustomerId] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'draft' | 'sent' | 'accepted' | 'expired'>('all');
  
  // Printing & Action States
  const [quoteToPrint, setQuoteToPrint] = useState<any | null>(null);
  const [companySettings, setCompanySettings] = useState<any>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

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

  const fetchQuotations = async () => {
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const userOrgId = session?.user?.user_metadata?.org_id;
      if (!userOrgId) {
        setLoading(false);
        return;
      }

      let query = supabase
        .from('quotations')
        .select(`
          *,
          customers(id, name, phone),
          quotation_items(id, product_id, quantity, unit_price, total, uom_id, products(name, sku))
        `)
        .eq('organization_id', userOrgId)
        .order('quotation_date', { ascending: false })
        .order('created_at', { ascending: false });

      if (startDate) query = query.gte('quotation_date', startDate);
      if (endDate) query = query.lte('quotation_date', endDate);
      if (selectedCustomerId) query = query.eq('customer_id', selectedCustomerId);
      if (statusFilter !== 'all') query = query.eq('status', statusFilter);

      const { data, error } = await query;
      if (error) throw error;

      setQuotations(data || []);
    } catch (err: any) {
      console.error('Error fetching quotations:', err);
      showToast('فشل تحميل سجل عروض الأسعار: ' + err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchQuotations();
  }, [startDate, endDate, selectedCustomerId, statusFilter]);

  // Client-side search
  const filteredQuotations = useMemo(() => {
    if (!searchTerm.trim()) return quotations;
    const term = searchTerm.toLowerCase().trim();
    return quotations.filter(q => 
      (q.quotation_number && q.quotation_number.toLowerCase().includes(term)) ||
      (q.customers?.name && q.customers.name.toLowerCase().includes(term)) ||
      (q.notes && q.notes.toLowerCase().includes(term))
    );
  }, [quotations, searchTerm]);

  // Pagination calculation
  const totalPages = Math.ceil(filteredQuotations.length / itemsPerPage) || 1;
  const paginatedQuotations = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return filteredQuotations.slice(start, start + itemsPerPage);
  }, [filteredQuotations, currentPage]);

  // Summary KPIs
  const summary = useMemo(() => {
    const totalAmount = filteredQuotations.reduce((sum, q) => sum + Number(q.total_amount || 0), 0);
    const acceptedCount = filteredQuotations.filter(q => q.status === 'accepted').length;
    const sentCount = filteredQuotations.filter(q => q.status === 'sent').length;
    const draftCount = filteredQuotations.filter(q => q.status === 'draft' || !q.status).length;

    return { totalAmount, acceptedCount, sentCount, draftCount, count: filteredQuotations.length };
  }, [filteredQuotations]);

  const handleDelete = async (quote: any) => {
    if (!window.confirm(`هل أنت متأكد من حذف عرض السعر رقم (${quote.quotation_number})؟`)) {
      return;
    }

    setDeletingId(quote.id);
    try {
      await supabase.from('quotation_items').delete().eq('quotation_id', quote.id);
      const { error: delErr } = await supabase.from('quotations').delete().eq('id', quote.id);
      if (delErr) throw delErr;

      showToast('تم حذف عرض السعر بنجاح ✅', 'success');
      fetchQuotations();

    } catch (err: any) {
      console.error('Error deleting quote:', err);
      showToast('فشل حذف عرض السعر: ' + err.message, 'error');
    } finally {
      setDeletingId(null);
    }
  };

  const handleConvertToInvoice = (quote: any) => {
    navigate('/sales-invoice', { 
      state: { 
        quotationToConvert: {
          customerId: quote.customer_id,
          notes: `محول من عرض السعر رقم: ${quote.quotation_number}`,
          items: (quote.quotation_items || []).map((i: any) => ({
            productId: i.product_id,
            quantity: i.quantity,
            unitPrice: i.unit_price,
            uomId: i.uom_id
          }))
        } 
      } 
    });
  };

  const handlePrint = (quote: any) => {
    setQuoteToPrint({
      quotationNumber: quote.quotation_number,
      date: quote.quotation_date,
      expiryDate: quote.expiry_date,
      customerName: quote.customers?.name || 'عميل عام',
      notes: quote.notes,
      totalAmount: quote.total_amount,
      taxAmount: quote.tax_amount,
      items: (quote.quotation_items || []).map((i: any) => ({
        name: i.products?.name || 'صنف',
        quantity: i.quantity,
        unitPrice: i.unit_price,
        total: i.total
      }))
    });

    setTimeout(() => {
      window.print();
      setQuoteToPrint(null);
    }, 200);
  };

  const handleShareWhatsApp = (quote: any) => {
    const phone = quote.customers?.phone ? quote.customers.phone.replace(/[^0-9]/g, '') : '';
    const message = `مرحباً ${quote.customers?.name || 'عميلنا العزيز'},\nيسرنا تقديم عرض الأسعار رقم: ${quote.quotation_number}\nالتاريخ: ${quote.quotation_date}\nتاريخ السريان حتى: ${quote.expiry_date || 'غير محدد'}\nإجمالي العرض: ${Number(quote.total_amount).toLocaleString()} ${settings.currency || 'ج.م'}\nشكراً لاهتمامكم ونرحب باستفساراتكم في أي وقت.`;
    
    const url = phone 
      ? `https://wa.me/${phone.startsWith('0') ? '20' + phone.substring(1) : phone}?text=${encodeURIComponent(message)}`
      : `https://wa.me/?text=${encodeURIComponent(message)}`;
      
    window.open(url, '_blank');
  };

  const exportToExcel = () => {
    if (filteredQuotations.length === 0) {
      showToast('لا توجد بيانات للتصدير', 'warning');
      return;
    }

    const dataToExport = filteredQuotations.map((q, idx) => ({
      '#': idx + 1,
      'رقم العرض': q.quotation_number || '-',
      'التاريخ': q.quotation_date,
      'تاريخ الانتهاء': q.expiry_date || '-',
      'العميل': q.customers?.name || 'عميل عام',
      'الإجمالي': q.total_amount,
      'الضريبة': q.tax_amount || 0,
      'الحالة': q.status === 'accepted' ? 'معتمد' : q.status === 'sent' ? 'مرسل' : 'مسودة',
      'ملاحظات': q.notes || ''
    }));

    const ws = XLSX.utils.json_to_sheet(dataToExport);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'عروض الأسعار');
    XLSX.writeFile(wb, `سجل_عروض_الأسعار_${new Date().toISOString().split('T')[0]}.xlsx`);
    showToast('تم تصدير سجل عروض الأسعار إلى إكسيل بنجاح ✅', 'success');
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'accepted':
        return <span className="bg-emerald-100 text-emerald-700 text-xs px-2.5 py-1 rounded-full font-bold inline-flex items-center gap-1"><CheckCircle2 size={12} /> معتمد</span>;
      case 'sent':
        return <span className="bg-blue-100 text-blue-700 text-xs px-2.5 py-1 rounded-full font-bold inline-flex items-center gap-1"><Clock size={12} /> مرسل للعميل</span>;
      case 'expired':
        return <span className="bg-red-100 text-red-700 text-xs px-2.5 py-1 rounded-full font-bold inline-flex items-center gap-1"><AlertCircle size={12} /> منتهي</span>;
      default:
        return <span className="bg-teal-100 text-teal-700 text-xs px-2.5 py-1 rounded-full font-bold inline-flex items-center gap-1">عرض سعر</span>;
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in">
      
      {/* 🚀 Header */}
      <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200 flex flex-col md:flex-row justify-between items-center gap-4">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-teal-50 text-teal-600 rounded-xl">
            <FileText size={28} />
          </div>
          <div>
            <h2 className="text-xl font-black text-slate-800 flex items-center gap-2">
              سجل عروض الأسعار
              <span className="text-xs px-2.5 py-0.5 rounded-full bg-teal-100 text-teal-700 font-bold font-mono">
                {filteredQuotations.length} عرض
              </span>
            </h2>
            <p className="text-xs text-slate-400 font-bold">متابعة عروض الأسعار المقدمة للعملاء وتحويلها المباشر لفواتير بيع</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button 
            onClick={fetchQuotations} 
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
            onClick={() => navigate('/quotation-new')} 
            className="bg-teal-600 text-white hover:bg-teal-700 px-4 py-2.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors shadow-sm"
          >
            <Plus size={16} /> عرض سعر جديد
          </button>
        </div>
      </div>

      {/* 📊 KPI Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex justify-between items-center">
          <div>
            <span className="text-xs text-slate-400 font-bold block mb-1">إجمالي قيمة العروض</span>
            <span className="text-xl font-black text-slate-800 font-mono" dir="ltr">
              {summary.totalAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
            <span className="text-xs text-slate-400 font-bold mr-1">{settings.currency || 'ج.م'}</span>
          </div>
          <div className="p-3 bg-teal-50 text-teal-600 rounded-xl font-mono font-bold text-xs">
            {summary.count} عرض
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex justify-between items-center">
          <div>
            <span className="text-xs text-slate-400 font-bold block mb-1">عروض معتمدة</span>
            <span className="text-xl font-black text-emerald-600 font-mono">
              {summary.acceptedCount}
            </span>
            <span className="text-xs text-slate-400 font-bold mr-1">عرض معتمد</span>
          </div>
          <div className="p-3 bg-emerald-50 text-emerald-600 rounded-xl">
            <CheckCircle2 size={20} />
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex justify-between items-center">
          <div>
            <span className="text-xs text-slate-400 font-bold block mb-1">مرسلة للعملاء</span>
            <span className="text-xl font-black text-blue-600 font-mono">
              {summary.sentCount}
            </span>
            <span className="text-xs text-slate-400 font-bold mr-1">بانتظار الرد</span>
          </div>
          <div className="p-3 bg-blue-50 text-blue-600 rounded-xl">
            <Clock size={20} />
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex justify-between items-center">
          <div>
            <span className="text-xs text-slate-400 font-bold block mb-1">مسودات</span>
            <span className="text-xl font-black text-teal-600 font-mono">
              {summary.draftCount}
            </span>
            <span className="text-xs text-slate-400 font-bold mr-1">مسودة</span>
          </div>
          <div className="p-3 bg-teal-50 text-teal-600 rounded-xl">
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
            placeholder="بحث برقم العرض، العميل..." 
            value={searchTerm}
            onChange={e => { setSearchTerm(e.target.value); setCurrentPage(1); }}
            className="w-full pr-9 pl-3 py-2 bg-slate-50 border rounded-xl text-xs font-bold outline-none focus:border-teal-500"
          />
        </div>

        <div>
          <select 
            value={selectedCustomerId} 
            onChange={e => { setSelectedCustomerId(e.target.value); setCurrentPage(1); }}
            className="w-full p-2 bg-slate-50 border rounded-xl text-xs font-bold outline-none focus:border-teal-500"
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
            className="w-full p-2 bg-slate-50 border rounded-xl text-xs font-bold outline-none focus:border-teal-500"
            title="من تاريخ"
          />
          <input 
            type="date" 
            value={endDate} 
            onChange={e => { setEndDate(e.target.value); setCurrentPage(1); }} 
            className="w-full p-2 bg-slate-50 border rounded-xl text-xs font-bold outline-none focus:border-teal-500"
            title="إلى تاريخ"
          />
        </div>

        <div>
          <select 
            value={statusFilter} 
            onChange={e => { setStatusFilter(e.target.value as any); setCurrentPage(1); }}
            className="w-full p-2 bg-slate-50 border rounded-xl text-xs font-bold outline-none focus:border-teal-500"
          >
            <option value="all">جميع الحالات</option>
            <option value="accepted">معتمد ومقبول ✅</option>
            <option value="sent">مرسل للعميل 📬</option>
            <option value="draft">مسودة 📝</option>
          </select>
        </div>
      </div>

      {/* 📋 Data Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-16 flex flex-col items-center justify-center text-slate-400 gap-3">
            <Loader2 className="animate-spin text-teal-600" size={36} />
            <span className="font-bold text-sm">جاري تحميل سجل عروض الأسعار...</span>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-right text-sm">
              <thead className="bg-slate-50 text-xs font-black text-slate-600 border-b border-slate-200">
                <tr>
                  <th className="p-3.5">رقم العرض</th>
                  <th className="p-3.5">تاريخ العرض</th>
                  <th className="p-3.5">العميل</th>
                  <th className="p-3.5">تاريخ الانتهاء</th>
                  <th className="p-3.5 text-center">الإجمالي</th>
                  <th className="p-3.5 text-center">الضريبة</th>
                  <th className="p-3.5 text-center">الحالة</th>
                  <th className="p-3.5 text-center">إجراءات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {paginatedQuotations.map((quote) => {
                  const total = Number(quote.total_amount || 0);

                  return (
                    <tr key={quote.id} className="hover:bg-slate-50/60 transition-colors">
                      <td className="p-3.5 font-mono font-bold text-teal-700">{quote.quotation_number || '-'}</td>
                      <td className="p-3.5 text-slate-600 font-mono text-xs">{quote.quotation_date}</td>
                      <td className="p-3.5 font-bold text-slate-800">{quote.customers?.name || 'عميل عام'}</td>
                      <td className="p-3.5 text-slate-500 text-xs">{quote.expiry_date || '-'}</td>
                      <td className="p-3.5 text-center font-mono font-black text-slate-900" dir="ltr">
                        {total.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                      <td className="p-3.5 text-center font-mono text-slate-600" dir="ltr">
                        {Number(quote.tax_amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                      <td className="p-3.5 text-center">
                        {getStatusBadge(quote.status)}
                      </td>
                      <td className="p-3.5">
                        <div className="flex items-center justify-center gap-1">
                          
                          <button 
                            onClick={() => handleConvertToInvoice(quote)}
                            className="p-1.5 text-purple-600 hover:bg-purple-50 rounded-lg transition-colors"
                            title="تحويل عرض السعر لفاتورة مبيعات"
                          >
                            <ArrowRightLeft size={16} />
                          </button>

                          <button 
                            onClick={() => navigate('/quotation-new', { state: { quoteToEdit: quote } })}
                            className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                            title="عرض وتعديل"
                          >
                            <Edit size={16} />
                          </button>

                          <button 
                            onClick={() => handlePrint(quote)}
                            className="p-1.5 text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                            title="طباعة عرض السعر"
                          >
                            <Printer size={16} />
                          </button>

                          <button 
                            onClick={() => handleShareWhatsApp(quote)}
                            className="p-1.5 text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors"
                            title="مشاركة عبر واتساب"
                          >
                            <MessageCircle size={16} />
                          </button>

                          <button 
                            onClick={() => handleDelete(quote)}
                            disabled={deletingId === quote.id}
                            className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50"
                            title="حذف عرض السعر"
                          >
                            {deletingId === quote.id ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}

                {filteredQuotations.length === 0 && (
                  <tr>
                    <td colSpan={8} className="p-12 text-center text-slate-400 font-bold">
                      لا توجد عروض أسعار مطابقة للبحث أو الفلترة.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination Bar */}
        {filteredQuotations.length > itemsPerPage && (
          <div className="p-4 border-t border-slate-200 bg-slate-50 flex items-center justify-between">
            <span className="text-xs text-slate-500 font-bold">
              عرض {paginatedQuotations.length} من أصل {filteredQuotations.length} عرض
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

      {/* Hidden printable quote */}
      {quoteToPrint && (
        <QuotationPrint quoteData={quoteToPrint} companySettings={companySettings} />
      )}
    </div>
  );
};

export default QuotationList;

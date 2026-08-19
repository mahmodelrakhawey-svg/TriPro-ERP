import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../../supabaseClient';
import { useAccounting } from '../../context/AccountingContext';
import { useToast } from '../../context/ToastContext';
import { 
  FileMinus, Search, Plus, Trash2, Edit, Printer, Download, 
  MessageCircle, Loader2, CheckCircle2, ChevronLeft, ChevronRight, 
  RotateCcw, X 
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import * as XLSX from 'xlsx';
import { CreditNotePrint } from './CreditNotePrint';

export const CreditNoteList = () => {
  const { customers, currentUser, settings, selectedFiscalYear, fiscalYearRange } = useAccounting();
  const navigate = useNavigate();
  const { showToast } = useToast();

  const [notes, setNotes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [startDate, setStartDate] = useState(fiscalYearRange.startDate);
  const [endDate, setEndDate] = useState(`${selectedFiscalYear}-12-31`);
  const [selectedCustomerId, setSelectedCustomerId] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'posted' | 'draft'>('all');
  
  // Printing & Action States
  const [noteToPrint, setNoteToPrint] = useState<any | null>(null);
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

  const fetchNotes = async () => {
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const userOrgId = session?.user?.user_metadata?.org_id;
      if (!userOrgId) {
        setLoading(false);
        return;
      }

      let query = supabase
        .from('credit_notes')
        .select(`
          *,
          customers(id, name, phone)
        `)
        .eq('organization_id', userOrgId)
        .order('note_date', { ascending: false })
        .order('created_at', { ascending: false });

      if (startDate) query = query.gte('note_date', startDate);
      if (endDate) query = query.lte('note_date', endDate);
      if (selectedCustomerId) query = query.eq('customer_id', selectedCustomerId);
      if (statusFilter !== 'all') query = query.eq('status', statusFilter);

      const { data, error } = await query;
      if (error) throw error;

      setNotes(data || []);
    } catch (err: any) {
      console.error('Error fetching credit notes:', err);
      showToast('فشل تحميل سجل الإشعارات الدائنة: ' + err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchNotes();
  }, [startDate, endDate, selectedCustomerId, statusFilter]);

  // Client-side search
  const filteredNotes = useMemo(() => {
    if (!searchTerm.trim()) return notes;
    const term = searchTerm.toLowerCase().trim();
    return notes.filter(n => 
      (n.credit_note_number && n.credit_note_number.toLowerCase().includes(term)) ||
      (n.customers?.name && n.customers.name.toLowerCase().includes(term)) ||
      (n.original_invoice_number && n.original_invoice_number.toLowerCase().includes(term)) ||
      (n.notes && n.notes.toLowerCase().includes(term))
    );
  }, [notes, searchTerm]);

  // Pagination calculation
  const totalPages = Math.ceil(filteredNotes.length / itemsPerPage) || 1;
  const paginatedNotes = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return filteredNotes.slice(start, start + itemsPerPage);
  }, [filteredNotes, currentPage]);

  // Summary KPIs
  const summary = useMemo(() => {
    const totalAmount = filteredNotes.reduce((sum, n) => sum + Number(n.total_amount || 0), 0);
    const totalTax = filteredNotes.reduce((sum, n) => sum + Number(n.tax_amount || 0), 0);
    const count = filteredNotes.length;
    const postedCount = filteredNotes.filter(n => n.status === 'posted' || !n.status).length;

    return { totalAmount, totalTax, count, postedCount };
  }, [filteredNotes]);

  const handleDelete = async (note: any) => {
    if (!window.confirm(`هل أنت متأكد من حذف الإشعار الدائن رقم (${note.credit_note_number})؟\nسيتم إلغاء القيد المحاسبي وعكس التسوية بالكامل.`)) {
      return;
    }

    setDeletingId(note.id);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const userOrgId = session?.user?.user_metadata?.org_id;

      await supabase.from('journal_entries').delete().eq('organization_id', userOrgId).eq('reference', note.credit_note_number);
      const { error: delErr } = await supabase.from('credit_notes').delete().eq('id', note.id);
      if (delErr) throw delErr;

      showToast('تم حذف الإشعار الدائن وعكس القيد بنجاح ✅', 'success');
      fetchNotes();

    } catch (err: any) {
      console.error('Error deleting credit note:', err);
      showToast('فشل حذف الإشعار الدائن: ' + err.message, 'error');
    } finally {
      setDeletingId(null);
    }
  };

  const handlePrint = (note: any) => {
    setNoteToPrint({
      noteNumber: note.credit_note_number,
      date: note.note_date,
      customerName: note.customers?.name || 'عميل عام',
      originalInvoiceNumber: note.original_invoice_number,
      notes: note.notes,
      amountBeforeTax: note.amount_before_tax,
      taxAmount: note.tax_amount,
      totalAmount: note.total_amount
    });

    setTimeout(() => {
      window.print();
      setNoteToPrint(null);
    }, 200);
  };

  const handleShareWhatsApp = (note: any) => {
    const phone = note.customers?.phone ? note.customers.phone.replace(/[^0-9]/g, '') : '';
    const message = `مرحباً ${note.customers?.name || 'عميلنا العزيز'},\nنود إخطاركم بصدور إشعار دائن وتسوية رقم: ${note.credit_note_number}\nالتاريخ: ${note.note_date}\nالمبلغ الإجمالي: ${Number(note.total_amount).toLocaleString()} ${settings.currency || 'ج.م'}\nالبيان: ${note.notes || '-'}\nتم تخفيض المبلغ من مديونيتكم. شكراً لتعاملكم معنا.`;
    
    const url = phone 
      ? `https://wa.me/${phone.startsWith('0') ? '20' + phone.substring(1) : phone}?text=${encodeURIComponent(message)}`
      : `https://wa.me/?text=${encodeURIComponent(message)}`;
      
    window.open(url, '_blank');
  };

  const exportToExcel = () => {
    if (filteredNotes.length === 0) {
      showToast('لا توجد بيانات للتصدير', 'warning');
      return;
    }

    const dataToExport = filteredNotes.map((n, idx) => ({
      '#': idx + 1,
      'رقم الإشعار': n.credit_note_number || '-',
      'التاريخ': n.note_date,
      'العميل': n.customers?.name || 'عميل عام',
      'رقم الفاتورة الأصلية': n.original_invoice_number || '-',
      'المبلغ قبل الضريبة': n.amount_before_tax,
      'الضريبة': n.tax_amount || 0,
      'إجمالي الإشعار الدائن': n.total_amount,
      'البيان': n.notes || ''
    }));

    const ws = XLSX.utils.json_to_sheet(dataToExport);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'الإشعارات الدائنة');
    XLSX.writeFile(wb, `سجل_الإشعارات_الدائنة_${new Date().toISOString().split('T')[0]}.xlsx`);
    showToast('تم تصدير سجل الإشعارات الدائنة إلى إكسيل بنجاح ✅', 'success');
  };

  return (
    <div className="space-y-6 animate-in fade-in">
      
      {/* 🚀 Header */}
      <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200 flex flex-col md:flex-row justify-between items-center gap-4">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-purple-50 text-purple-600 rounded-xl">
            <FileMinus size={28} />
          </div>
          <div>
            <h2 className="text-xl font-black text-slate-800 flex items-center gap-2">
              سجل الإشعارات الدائنة (Credit Notes)
              <span className="text-xs px-2.5 py-0.5 rounded-full bg-purple-100 text-purple-700 font-bold font-mono">
                {filteredNotes.length} إشعار
              </span>
            </h2>
            <p className="text-xs text-slate-400 font-bold">تسويات حسابات العملاء والخصومات اللاحقة والإشعارات الضريبية</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button 
            onClick={fetchNotes} 
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
            onClick={() => navigate('/credit-note')} 
            className="bg-purple-600 text-white hover:bg-purple-700 px-4 py-2.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors shadow-sm"
          >
            <Plus size={16} /> إشعار دائن جديد
          </button>
        </div>
      </div>

      {/* 📊 KPI Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex justify-between items-center">
          <div>
            <span className="text-xs text-slate-400 font-bold block mb-1">إجمالي التسويات الدائنة</span>
            <span className="text-xl font-black text-purple-700 font-mono" dir="ltr">
              {summary.totalAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
            <span className="text-xs text-slate-400 font-bold mr-1">{settings.currency || 'ج.م'}</span>
          </div>
          <div className="p-3 bg-purple-50 text-purple-600 rounded-xl font-mono font-bold text-xs">
            {summary.count} إشعار
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex justify-between items-center">
          <div>
            <span className="text-xs text-slate-400 font-bold block mb-1">ضريبة القيمة المضافة المخفضة</span>
            <span className="text-xl font-black text-slate-700 font-mono" dir="ltr">
              {summary.totalTax.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
            <span className="text-xs text-slate-400 font-bold mr-1">{settings.currency || 'ج.م'}</span>
          </div>
          <div className="p-3 bg-slate-50 text-slate-600 rounded-xl font-mono font-bold text-xs">
            VAT
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex justify-between items-center">
          <div>
            <span className="text-xs text-slate-400 font-bold block mb-1">حالة الترحيل</span>
            <span className="text-xl font-black text-emerald-600 font-mono">
              {summary.postedCount}
            </span>
            <span className="text-xs text-slate-400 font-bold mr-1">إشعار مرحل بالكامل</span>
          </div>
          <div className="p-3 bg-emerald-50 text-emerald-600 rounded-xl">
            <CheckCircle2 size={20} />
          </div>
        </div>
      </div>

      {/* 🔍 Multi-Filter Section */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="relative">
          <Search className="absolute right-3 top-3 text-slate-400" size={16} />
          <input 
            type="text" 
            placeholder="بحث برقم الإشعار، العميل، الفاتورة..." 
            value={searchTerm}
            onChange={e => { setSearchTerm(e.target.value); setCurrentPage(1); }}
            className="w-full pr-9 pl-3 py-2 bg-slate-50 border rounded-xl text-xs font-bold outline-none focus:border-purple-500"
          />
        </div>

        <div>
          <select 
            value={selectedCustomerId} 
            onChange={e => { setSelectedCustomerId(e.target.value); setCurrentPage(1); }}
            className="w-full p-2 bg-slate-50 border rounded-xl text-xs font-bold outline-none focus:border-purple-500"
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
            className="w-full p-2 bg-slate-50 border rounded-xl text-xs font-bold outline-none focus:border-purple-500"
            title="من تاريخ"
          />
          <input 
            type="date" 
            value={endDate} 
            onChange={e => { setEndDate(e.target.value); setCurrentPage(1); }} 
            className="w-full p-2 bg-slate-50 border rounded-xl text-xs font-bold outline-none focus:border-purple-500"
            title="إلى تاريخ"
          />
        </div>
      </div>

      {/* 📋 Data Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-16 flex flex-col items-center justify-center text-slate-400 gap-3">
            <Loader2 className="animate-spin text-purple-600" size={36} />
            <span className="font-bold text-sm">جاري تحميل سجل الإشعارات الدائنة...</span>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-right text-sm">
              <thead className="bg-slate-50 text-xs font-black text-slate-600 border-b border-slate-200">
                <tr>
                  <th className="p-3.5">رقم الإشعار</th>
                  <th className="p-3.5">التاريخ</th>
                  <th className="p-3.5">العميل</th>
                  <th className="p-3.5">الفاتورة الأصلية</th>
                  <th className="p-3.5 text-center">المبلغ قبل الضريبة</th>
                  <th className="p-3.5 text-center">الضريبة</th>
                  <th className="p-3.5 text-center">الإجمالي</th>
                  <th className="p-3.5">البيان والسبب</th>
                  <th className="p-3.5 text-center">إجراءات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {paginatedNotes.map((note) => (
                  <tr key={note.id} className="hover:bg-slate-50/60 transition-colors">
                    <td className="p-3.5 font-mono font-bold text-purple-700">{note.credit_note_number || '-'}</td>
                    <td className="p-3.5 text-slate-600 font-mono text-xs">{note.note_date}</td>
                    <td className="p-3.5 font-bold text-slate-800">{note.customers?.name || 'عميل عام'}</td>
                    <td className="p-3.5 font-mono text-xs text-slate-600">{note.original_invoice_number || '-'}</td>
                    <td className="p-3.5 text-center font-mono font-bold text-slate-700" dir="ltr">
                      {Number(note.amount_before_tax || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                    <td className="p-3.5 text-center font-mono text-slate-600" dir="ltr">
                      {Number(note.tax_amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                    <td className="p-3.5 text-center font-mono font-black text-purple-700" dir="ltr">
                      {Number(note.total_amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                    <td className="p-3.5 text-xs text-slate-600 max-w-xs truncate">{note.notes || '-'}</td>
                    <td className="p-3.5">
                      <div className="flex items-center justify-center gap-1">
                        
                        <button 
                          onClick={() => navigate('/credit-note', { state: { noteToEdit: note } })}
                          className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                          title="عرض وتعديل"
                        >
                          <Edit size={16} />
                        </button>

                        <button 
                          onClick={() => handlePrint(note)}
                          className="p-1.5 text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                          title="طباعة الإشعار الدائن"
                        >
                          <Printer size={16} />
                        </button>

                        <button 
                          onClick={() => handleShareWhatsApp(note)}
                          className="p-1.5 text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors"
                          title="مشاركة عبر واتساب"
                        >
                          <MessageCircle size={16} />
                        </button>

                        <button 
                          onClick={() => handleDelete(note)}
                          disabled={deletingId === note.id}
                          className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50"
                          title="حذف الإشعار الدائن"
                        >
                          {deletingId === note.id ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}

                {filteredNotes.length === 0 && (
                  <tr>
                    <td colSpan={9} className="p-12 text-center text-slate-400 font-bold">
                      لا توجد إشعارات دائنة مطابقة للبحث أو الفلترة.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination Bar */}
        {filteredNotes.length > itemsPerPage && (
          <div className="p-4 border-t border-slate-200 bg-slate-50 flex items-center justify-between">
            <span className="text-xs text-slate-500 font-bold">
              عرض {paginatedNotes.length} من أصل {filteredNotes.length} إشعار دائن
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

      {/* Hidden printable note */}
      {noteToPrint && (
        <CreditNotePrint noteData={noteToPrint} companySettings={companySettings} />
      )}
    </div>
  );
};

export default CreditNoteList;

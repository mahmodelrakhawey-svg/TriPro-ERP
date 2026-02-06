﻿﻿﻿﻿﻿﻿﻿import React, { useState, useEffect } from 'react';
import { supabase } from '../../supabaseClient';
import { BookOpen, Calendar, Filter, Loader2, Printer, CheckSquare, Edit, Trash2, Paperclip, Download, RefreshCw, AlertTriangle, User, ChevronLeft, ChevronRight } from 'lucide-react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAccounting } from '../../context/AccountingContext';
import { JournalEntry } from '../../types';

// دالة مساعدة لتحديد مصدر القيد بناءً على المرجع
const getEntrySource = (reference: string) => {
    if (!reference) return { label: 'قيد يدوي', color: 'bg-slate-200 text-slate-600' };
    const ref = reference.toUpperCase();
    if (ref.startsWith('INV-')) return { label: 'فاتورة مبيعات', color: 'bg-blue-100 text-blue-700' };
    if (ref.startsWith('PUR-')) return { label: 'فاتورة مشتريات', color: 'bg-purple-100 text-purple-700' };
    if (ref.startsWith('RCT-')) return { label: 'سند قبض', color: 'bg-emerald-100 text-emerald-700' };
    if (ref.startsWith('PAY-')) return { label: 'سند صرف', color: 'bg-orange-100 text-orange-700' };
    if (ref.startsWith('DEP-')) return { label: 'إهلاك/تأمين', color: 'bg-amber-100 text-amber-700' };
    if (ref.startsWith('TRN-')) return { label: 'تحويل', color: 'bg-indigo-100 text-indigo-700' };
    if (ref.startsWith('ADJ-')) return { label: 'تسوية مخزنية', color: 'bg-red-100 text-red-700' };
    if (ref.startsWith('PAYROLL-')) return { label: 'رواتب', color: 'bg-pink-100 text-pink-700' };
    if (ref.startsWith('CLOSE-')) return { label: 'إقفال سنة', color: 'bg-gray-800 text-white' };
    if (ref.startsWith('SR-')) return { label: 'مرتجع مبيعات', color: 'bg-blue-50 text-blue-600' };
    if (ref.startsWith('PR-')) return { label: 'مرتجع مشتريات', color: 'bg-purple-50 text-purple-600' };
    if (ref.startsWith('ASSET-')) return { label: 'أصل ثابت', color: 'bg-cyan-100 text-cyan-700' };
    return { label: 'قيد يدوي', color: 'bg-slate-200 text-slate-600' };
};

const GeneralJournal = () => {
  const { refreshData, can, clearCache, exportJournalToCSV, users, getJournalEntriesPaginated } = useAccounting();
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedUser, setSelectedUser] = useState('');
  const [isRefreshing, setIsRefreshing] = useState(false);
  
  // Pagination state
  const [journalEntries, setJournalEntries] = useState<JournalEntry[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const ITEMS_PER_PAGE = 20;

  const navigate = useNavigate();
  const location = useLocation();

  const supabaseUrl = 'https://pjvphxfschfllpawfewn.supabase.co';

  useEffect(() => {
    if (location.state?.initialSearch) {
        setSearchTerm(location.state.initialSearch);
    }
  }, [location.state]);

  const fetchEntries = async () => {
      setLoading(true);
      try {
        // استخدام الدالة المركزية من السياق لضمان دعم الديمو والأمان
        const { data, count } = await getJournalEntriesPaginated(page, ITEMS_PER_PAGE, searchTerm, selectedUser);

        setJournalEntries(data);
        setTotalCount(count);
        setTotalPages(Math.ceil(count / ITEMS_PER_PAGE));
      } catch (error) {
          console.error('Error fetching entries:', error);
      } finally {
          setLoading(false);
      }
  };

  useEffect(() => {
      const timer = setTimeout(() => {
          fetchEntries();
      }, 500);
      return () => clearTimeout(timer);
  }, [page, searchTerm, selectedUser]);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await clearCache(); // استخدام clearCache بدلاً من refreshData لضمان مسح الكاش
    await fetchEntries();
    setIsRefreshing(false);
  };

  const handlePostEntry = async (entryId: string) => {
    if (!window.confirm('هل أنت متأكد من ترحيل هذا القيد؟ لا يمكن التراجع عن هذه العملية بعد الترحيل.')) {
        return;
    }

    try {
      const { error } = await supabase
          .from('journal_entries')
          .update({ status: 'posted' })
          .eq('id', entryId);

      if (error) throw error;

      alert('تم ترحيل القيد بنجاح.');
      refreshData();
      fetchEntries();
    } catch (err: any) {
      alert('فشل ترحيل القيد: ' + err.message);
    }
  };

  const handleDeleteEntry = async (entryId: string) => {
    if (!window.confirm('هل أنت متأكد من حذف هذا القيد؟ لا يمكن التراجع عن هذا الإجراء.')) {
        return;
    }
    try {
        const { error } = await supabase.from('journal_entries').delete().eq('id', entryId);
        if (error) throw error;
        alert('تم حذف القيد بنجاح.');
        refreshData();
        fetchEntries();
    } catch (err: any) {
        alert('فشل حذف القيد: ' + err.message);
    }
  };

  const handlePrint = (entry: JournalEntry) => {
    const printWindow = window.open('', '_blank');
    if (printWindow) {
      const dateStr = entry.date || entry.transaction_date || entry.created_at;
      const formattedDate = dateStr ? new Date(dateStr).toLocaleDateString('ar-EG') : 'تاريخ غير متوفر';

      printWindow.document.write(`
        <html dir="rtl">
          <head>
            <title>سند قيد رقم ${entry.reference || entry.id.slice(0, 8)}</title>
            <style>
              body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; padding: 20px; }
              .header { text-align: center; margin-bottom: 30px; border-bottom: 2px solid #eee; padding-bottom: 20px; }
              .title { font-size: 24px; font-weight: bold; margin-bottom: 10px; }
              .meta { display: flex; justify-content: space-between; margin-bottom: 20px; }
              table { width: 100%; border-collapse: collapse; margin-bottom: 30px; }
              th, td { border: 1px solid #ddd; padding: 12px; text-align: right; }
              th { background-color: #f8f9fa; }
              .footer { margin-top: 50px; display: flex; justify-content: space-between; }
              .signature { border-top: 1px solid #000; width: 200px; text-align: center; padding-top: 10px; }
              @media print { .no-print { display: none; } }
            </style>
          </head>
          <body>
            <div class="header">
              <div class="title">سند قيد يومية</div>
              <div>رقم القيد: ${entry.reference || entry.id.slice(0, 8)}</div>
            </div>
            
            <div class="meta">
              <div><strong>التاريخ:</strong> ${formattedDate}</div>
              <div><strong>الحالة:</strong> ${entry.status === 'posted' ? 'مرحّل' : 'مسودة'}</div>
            </div>
            
            <div style="margin-bottom: 20px;"><strong>البيان:</strong> ${entry.description}</div>

            <table>
              <thead>
                <tr>
                  <th>اسم الحساب</th>
                  <th>رقم الحساب</th>
                  <th>مدين</th>
                  <th>دائن</th>
                </tr>
              </thead>
              <tbody>
                ${(entry.lines || []).map(line => `
                  <tr>
                    <td>${line.accountName || '-'}</td>
                    <td>${line.accountCode || '-'}</td>
                    <td>${line.debit > 0 ? line.debit.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2}) : '-'}</td>
                    <td>${line.credit > 0 ? line.credit.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2}) : '-'}</td>
                  </tr>
                `).join('')}
                <tr style="font-weight: bold; background-color: #f8f9fa;">
                    <td colspan="2" style="text-align: left;">الإجمالي</td>
                    <td>${(entry.lines || []).reduce((sum, line) => sum + (line.debit || 0), 0).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</td>
                    <td>${(entry.lines || []).reduce((sum, line) => sum + (line.credit || 0), 0).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</td>
                </tr>
              </tbody>
            </table>

            <div class="footer">
              <div class="signature">المحاسب</div>
              <div class="signature">المدير المالي</div>
              <div class="signature">المعتمد</div>
            </div>

            <script>
              window.onload = function() { window.print(); }
            </script>
          </body>
        </html>
      `);
      printWindow.document.close();
    }
  };

  const handleEditEntry = (entry: JournalEntry) => {
    const source = getEntrySource(entry.reference || '');
    if (source.label !== 'قيد يدوي') {
        alert('لا يمكن تعديل القيود التي تم إنشاؤها آلياً. يرجى تعديل المستند الأصلي (مثل الفاتورة أو السند).');
        return;
    }
    navigate('/journal', { state: { entryToEdit: entry } });
  };


  return (
    <div className="p-6 bg-white rounded-xl shadow-sm border border-slate-200">
      <div className="flex justify-between items-center mb-6 border-b border-slate-100 pb-4">
        <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
          <BookOpen className="text-blue-600" />
          دفتر اليومية العام
        </h1>
        <div className="flex gap-2">
            <div className="relative">
                <select
                    value={selectedUser}
                    onChange={(e) => setSelectedUser(e.target.value)}
                    className="pl-8 pr-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:border-blue-500 text-sm appearance-none bg-white transition-all h-full"
                    dir="rtl"
                >
                    <option value="">كل المستخدمين</option>
                    {users.map(u => (
                        <option key={u.id} value={u.id}>{u.name}</option>
                    ))}
                </select>
                <div className="absolute left-2 top-2.5 text-slate-400 pointer-events-none">
                    <User size={16} />
                </div>
            </div>
            <div className="relative">
                <input 
                    type="text" 
                    placeholder="بحث برقم القيد، المبلغ، أو البيان..." 
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10 pr-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:border-blue-500 text-sm w-64 transition-all"
                />
                <Filter className="absolute left-3 top-2.5 text-slate-400" size={16} />
            </div>
            <button onClick={() => window.print()} className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 font-bold text-sm">
                <Printer size={16} /> طباعة
            </button>
            <button 
                onClick={exportJournalToCSV} 
                className="flex items-center gap-2 bg-emerald-600 text-white px-4 py-2 rounded-lg hover:bg-emerald-700 font-bold text-sm"
            >
                <Download size={16} /> تصدير Excel
            </button>
            <button 
                onClick={handleRefresh} 
                className="flex items-center gap-2 bg-white border border-slate-300 text-slate-600 px-4 py-2 rounded-lg hover:bg-slate-50 font-bold text-sm transition-colors"
                title="تحديث البيانات من الخادم"
            >
                <RefreshCw size={16} className={isRefreshing ? "animate-spin" : ""} />
            </button>
        </div>
      </div>

      <div className="space-y-4">
        {loading ? (
            <div className="flex justify-center p-12"><Loader2 className="animate-spin text-blue-600" size={32} /></div>
        ) : journalEntries.length === 0 ? (
            <div className="text-center py-10 text-slate-500">لا توجد قيود مطابقة للبحث.</div>
        ) : (
            journalEntries.map((entry) => {
              const dateStr = entry.date || entry.transaction_date || entry.created_at;
              let formattedDate = 'تاريخ غير صالح';
              if (dateStr) {
                  const d = new Date(dateStr);
                  if (!isNaN(d.getTime())) {
                      formattedDate = d.toLocaleDateString('ar-EG', { year: 'numeric', month: 'long', day: 'numeric' });
                  }
              }
              const totalDebit = (entry.lines || []).reduce((sum, line) => sum + (line.debit || 0), 0);
              const totalCredit = (entry.lines || []).reduce((sum, line) => sum + (line.credit || 0), 0);
              const isBalanced = Math.abs(totalDebit - totalCredit) < 0.01;
              const source = getEntrySource(entry.reference || '');

              return (
            <div key={entry.id} className="border border-slate-200 rounded-lg overflow-hidden">
                <div className="bg-slate-50 p-3 flex justify-between items-center text-sm gap-4">
                <div className="flex-1">
                    <div className="font-bold text-slate-700 flex items-center gap-2">
                        <span>قيد رقم: <span className="font-mono">{entry.reference || entry.id.slice(0, 8)}</span></span>
                        <span className={`text-[10px] px-2 py-0.5 rounded-full ${source.color}`}>{source.label}</span>
                    </div>
                    <div className="flex items-center gap-2 text-slate-500 mt-1">
                    <Calendar size={14} />
                    <span>{formattedDate}</span>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    {entry.status === 'posted' ? (
                        <span className="flex items-center gap-1.5 font-bold text-emerald-600 bg-emerald-100 px-3 py-1.5 rounded-full text-xs">
                            <CheckSquare size={14} /> مرحّل
                        </span>
                    ) : (
                        <span className="flex items-center gap-1.5 font-bold text-amber-600 bg-amber-100 px-3 py-1.5 rounded-full text-xs">
                            مسودة
                        </span>
                    )}
                    {!isBalanced && (
                        <span className="flex items-center gap-1.5 font-bold text-red-600 bg-red-100 px-3 py-1.5 rounded-full text-xs" title={`غير متوازن! الفرق: ${(totalDebit - totalCredit).toFixed(2)}`}>
                            <AlertTriangle size={14} /> غير متوازن
                        </span>
                    )}
                    
                    {/* زر الترحيل يظهر فقط للمدراء وللقيود غير المرحلة */}
                    {can('journals', 'post') && entry.status !== 'posted' && (
                        <button 
                            onClick={() => handlePostEntry(entry.id)} 
                            className="bg-emerald-500 text-white px-4 py-1.5 rounded-lg text-xs font-bold hover:bg-emerald-600 transition-colors shadow-sm"
                        >
                            ترحيل
                        </button>
                    )}
                    <button onClick={() => handlePrint(entry)} className="p-2 text-slate-400 hover:text-blue-600 rounded-full hover:bg-slate-100 transition-colors" title="طباعة السند">
                        <Printer size={16} />
                    </button>
                    {source.label === 'قيد يدوي' ? (
                        <button onClick={() => handleEditEntry(entry)} className="p-2 text-slate-400 hover:text-amber-600 rounded-full hover:bg-slate-100 transition-colors" title="تعديل القيد">
                            <Edit size={16} />
                        </button>
                    ) : (
                        <span className="p-2 text-slate-300 cursor-not-allowed" title="لا يمكن تعديل القيود الآلية">
                            <Edit size={16} />
                        </span>
                    )}
                    <button onClick={() => handleDeleteEntry(entry.id)} className="p-2 text-slate-400 hover:text-red-600 rounded-full hover:bg-slate-100 transition-colors" title="حذف القيد">
                        <Trash2 size={16} />
                    </button>
                </div>
                </div>
                <div className="p-3 text-sm text-slate-600 border-b border-slate-100">
                    <span className="font-bold">البيان:</span> {entry.description}
                </div>
                <div className="p-3 text-sm font-bold text-slate-800 border-b border-slate-100 bg-slate-50/50">قيمة القيد: {totalDebit.toLocaleString()}</div>
                {(entry.lines || []).length === 0 ? (
                    <div className="p-4 text-center text-red-500 bg-red-50 text-sm font-bold border-b border-slate-100">
                        ⚠️ تنبيه: هذا القيد لا يحتوي على تفاصيل (أسطر). قد يكون ناتجاً عن خطأ سابق في الحفظ أو بيانات تالفة.
                    </div>
                ) : (
                <table className="w-full text-sm text-right">
                <thead className="bg-slate-100 text-slate-500">
                    <tr>
                    <th className="p-2">الحساب</th>
                    <th className="p-2 text-center">مدين</th>
                    <th className="p-2 text-center">دائن</th>
                    </tr>
                </thead>
                <tbody>
                    {(entry.lines || []).map((line, index) => (
                    <tr key={index} className="border-t border-slate-100">
                        <td className="p-2 font-medium text-slate-800">{line.accountName || 'حساب غير معروف'} <span className="text-xs text-slate-400">({line.accountCode})</span></td>
                        <td className="p-2 text-center font-mono text-emerald-600">{line.debit > 0 ? line.debit.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2}) : '-'}</td>
                        <td className="p-2 text-center font-mono text-red-600">{line.credit > 0 ? line.credit.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2}) : '-'}</td>
                    </tr>
                    ))}
                </tbody>
                </table>
                )}

                {/* Attachments Section */}
                {entry.journal_attachments && entry.journal_attachments.length > 0 && (
                  <div className="p-3 bg-slate-50 border-t border-slate-100">
                    <h4 className="text-xs font-bold text-slate-500 mb-2 flex items-center gap-1">
                      <Paperclip size={14} />
                      المرفقات ({entry.journal_attachments.length})
                    </h4>
                    <div className="flex flex-wrap gap-2">
                      {entry.journal_attachments.map((att: any) => (
                        <a
                          key={att.id}
                          href={`${supabaseUrl}/storage/v1/object/public/documents/${att.file_path}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1 bg-white border border-slate-200 px-3 py-1.5 rounded text-xs text-blue-600 hover:bg-blue-50 hover:border-blue-200 transition-colors"
                        >
                          <Download size={12} />
                          <span className="truncate max-w-[200px]">{att.file_name}</span>
                        </a>
                      ))}
                    </div>
                  </div>
                )}
            </div>
            )})
        )}

        {/* Pagination Controls */}
        <div className="bg-slate-50 p-4 border-t border-slate-200 flex items-center justify-between rounded-lg mt-4">
            <div className="text-xs font-bold text-slate-500">
                عرض {journalEntries.length} من أصل {totalCount} قيد
            </div>
            <div className="flex items-center gap-2">
                <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="p-2 rounded-lg hover:bg-white disabled:opacity-50 disabled:hover:bg-transparent transition-colors">
                    <ChevronRight size={20} />
                </button>
                <span className="text-sm font-black text-slate-700">صفحة {page} من {totalPages}</span>
                <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages} className="p-2 rounded-lg hover:bg-white disabled:opacity-50 disabled:hover:bg-transparent transition-colors">
                    <ChevronLeft size={20} />
                </button>
            </div>
        </div>
      </div>
    </div>
  );
};

export default GeneralJournal;

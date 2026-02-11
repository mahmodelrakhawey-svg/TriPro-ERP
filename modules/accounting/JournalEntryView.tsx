import React, { useState, useEffect } from 'react';
import { useParams, useLocation, useNavigate } from 'react-router-dom';
import { supabase } from '../../supabaseClient';
import { JournalEntry } from '../../types';
import { Loader2, ArrowLeft, ArrowRight, Printer, Edit, Calendar, AlertTriangle, CheckSquare, Paperclip, Download } from 'lucide-react';

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
    return { label: 'قيد يدوي', color: 'bg-slate-200 text-slate-600' };
};

const JournalEntryView = () => {
  const { entryId } = useParams<{ entryId: string }>();
  const location = useLocation();
  const navigate = useNavigate();

  const [entry, setEntry] = useState<JournalEntry | null>(null);
  const [loading, setLoading] = useState(true);
  const [entryIds, setEntryIds] = useState<string[]>(location.state?.ids || []);
  const [currentIndex, setCurrentIndex] = useState(-1);

  const supabaseUrl = 'https://pjvphxfschfllpawfewn.supabase.co';

  useEffect(() => {
    const fetchEntry = async () => {
      if (!entryId) return;
      setLoading(true);
      try {
        const { data, error } = await supabase
            .from('journal_entries')
            .select(`
                *,
                journal_lines (
                    *,
                    accounts (code, name)
                ),
                journal_attachments (*)
            `)
            .eq('id', entryId)
            .single();

        if (error) throw error;

        const formattedEntry: JournalEntry = {
            id: data.id,
            date: data.transaction_date,
            description: data.description,
            reference: data.reference,
            status: data.status,
            created_at: data.created_at,
            is_posted: data.status === 'posted',
            lines: data.journal_lines.map((line: any) => ({
                accountId: line.account_id,
                accountCode: line.accounts?.code,
                accountName: line.accounts?.name,
                debit: line.debit,
                credit: line.credit,
                description: line.description
            })),
            journal_attachments: data.journal_attachments
        };
        setEntry(formattedEntry);

      } catch (error) {
        console.error('Error fetching entry:', error);
        setEntry(null);
      } finally {
        setLoading(false);
      }
    };

    fetchEntry();
  }, [entryId]);

  useEffect(() => {
    if (entryIds.length > 0 && entryId) {
      const index = entryIds.indexOf(entryId);
      setCurrentIndex(index);
    }
  }, [entryIds, entryId]);

  const navigateToEntry = (index: number) => {
    if (index >= 0 && index < entryIds.length) {
      const nextId = entryIds[index];
      navigate(`/journal-entry/${nextId}`, { state: { ...location.state } });
    }
  };

  const handlePrint = () => {
    window.print();
  };

  const handleEdit = () => {
    if (!entry) return;
    const source = getEntrySource(entry.reference || '');
    if (source.label !== 'قيد يدوي') {
        alert('لا يمكن تعديل القيود التي تم إنشاؤها آلياً. يرجى تعديل المستند الأصلي (مثل الفاتورة أو السند).');
        return;
    }
    navigate('/journal', { state: { entryToEdit: entry } });
  };

  if (loading) {
    return <div className="flex justify-center items-center h-96"><Loader2 className="animate-spin text-blue-600" size={48} /></div>;
  }

  if (!entry) {
    return <div className="text-center py-10 text-red-500">لم يتم العثور على القيد المطلوب.</div>;
  }

  const totalDebit = (entry.lines || []).reduce((sum, line) => sum + (line.debit || 0), 0);
  const totalCredit = (entry.lines || []).reduce((sum, line) => sum + (line.credit || 0), 0);
  const isBalanced = Math.abs(totalDebit - totalCredit) < 0.01;
  const source = getEntrySource(entry.reference || '');
  const dateStr = entry.date || entry.transaction_date || entry.created_at;
  const formattedDate = dateStr ? new Date(dateStr).toLocaleDateString('ar-EG', { year: 'numeric', month: 'long', day: 'numeric' }) : 'تاريخ غير متوفر';

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6 animate-in fade-in">
      {/* Header and Navigation */}
      <div className="flex justify-between items-center print:hidden">
        <button onClick={() => navigate('/general-journal', { state: { ...location.state } })} className="flex items-center gap-2 text-slate-500 hover:text-blue-600 font-bold">
          <ArrowLeft size={18} />
          العودة لدفتر اليومية
        </button>
        <div className="flex items-center gap-2">
          <button onClick={() => navigateToEntry(currentIndex - 1)} disabled={currentIndex <= 0} className="p-2 rounded-lg bg-slate-100 hover:bg-slate-200 disabled:opacity-50">
            <ArrowRight size={20} />
          </button>
          <span className="text-sm font-bold text-slate-600">
            {currentIndex + 1} / {entryIds.length}
          </span>
          <button onClick={() => navigateToEntry(currentIndex + 1)} disabled={currentIndex === -1 || currentIndex >= entryIds.length - 1} className="p-2 rounded-lg bg-slate-100 hover:bg-slate-200 disabled:opacity-50">
            <ArrowLeft size={20} />
          </button>
        </div>
      </div>

      {/* Printable Voucher */}
      <div id="printable-voucher" className="bg-white rounded-xl shadow-lg border border-slate-200 overflow-hidden">
        <div className="p-8 border-b border-slate-100">
          <div className="flex justify-between items-start">
            <div>
              <h2 className="text-2xl font-bold text-slate-800">سند قيد يومية</h2>
              <div className="flex items-center gap-2 text-slate-500 mt-2">
                <Calendar size={14} />
                <span>{formattedDate}</span>
              </div>
            </div>
            <div className="text-left">
              <p className="font-mono font-bold text-slate-700">
                {entry.reference || entry.id.slice(0, 8)}
              </p>
              <span className={`text-xs px-2 py-0.5 rounded-full ${source.color} mt-1 inline-block`}>{source.label}</span>
            </div>
          </div>
          <div className="mt-4 flex justify-between items-center">
             <p className="text-sm text-slate-600 max-w-lg"><strong className="text-slate-800">البيان:</strong> {entry.description}</p>
             <div className="flex gap-2">
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
             </div>
          </div>
        </div>

        <table className="w-full text-sm text-right">
          <thead className="bg-slate-50 text-slate-500">
            <tr>
              <th className="p-3 font-medium">كود الحساب</th>
              <th className="p-3 font-medium">اسم الحساب</th>
              <th className="p-3 font-medium text-center">مدين</th>
              <th className="p-3 font-medium text-center">دائن</th>
            </tr>
          </thead>
          <tbody>
            {(entry.lines || []).map((line, index) => (
              <tr key={index} className="border-t border-slate-100">
                <td className="p-3 font-mono text-slate-500">{line.accountCode}</td>
                <td className="p-3 font-medium text-slate-800">{line.accountName || 'حساب غير معروف'}</td>
                <td className="p-3 text-center font-mono text-emerald-600">{line.debit > 0 ? line.debit.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2}) : '-'}</td>
                <td className="p-3 text-center font-mono text-red-600">{line.credit > 0 ? line.credit.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2}) : '-'}</td>
              </tr>
            ))}
          </tbody>
          <tfoot className="bg-slate-100 font-bold text-slate-800">
            <tr className="border-t-2 border-slate-200">
                <td colSpan={2} className="p-3 text-left">الإجمالي</td>
                <td className="p-3 text-center font-mono">{totalDebit.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</td>
                <td className="p-3 text-center font-mono">{totalCredit.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</td>
            </tr>
          </tfoot>
        </table>

        {/* Attachments */}
        {entry.journal_attachments && entry.journal_attachments.length > 0 && (
          <div className="p-6 bg-slate-50 border-t border-slate-200">
            <h4 className="text-sm font-bold text-slate-600 mb-3 flex items-center gap-2">
              <Paperclip size={16} /> المرفقات ({entry.journal_attachments.length})
            </h4>
            <div className="flex flex-wrap gap-3">
              {entry.journal_attachments.map((att: any) => (
                <a
                  key={att.id}
                  href={`${supabaseUrl}/storage/v1/object/public/documents/${att.file_path}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 bg-white border border-slate-200 px-3 py-2 rounded-lg text-sm text-blue-600 hover:bg-blue-50 hover:border-blue-200 transition-colors"
                >
                  <Download size={14} />
                  <span className="truncate max-w-[200px]">{att.file_name}</span>
                </a>
              ))}
            </div>
          </div>
        )}

        {/* Signatures for Print */}
        <div className="hidden print:block mt-24 p-8">
            <div className="flex justify-around text-center text-sm">
                <div>
                    <p className="mb-16">المحاسب</p>
                    <p className="border-t border-slate-400 pt-2">..............................</p>
                </div>
                <div>
                    <p className="mb-16">المدير المالي</p>
                    <p className="border-t border-slate-400 pt-2">..............................</p>
                </div>
                <div>
                    <p className="mb-16">المعتمد</p>
                    <p className="border-t border-slate-400 pt-2">..............................</p>
                </div>
            </div>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex justify-end gap-2 print:hidden">
        <button onClick={handlePrint} className="flex items-center gap-2 bg-slate-100 text-slate-600 px-4 py-2 rounded-lg hover:bg-slate-200 font-bold">
          <Printer size={16} /> طباعة
        </button>
        {source.label === 'قيد يدوي' && (
            <button onClick={handleEdit} className="flex items-center gap-2 bg-amber-500 text-white px-4 py-2 rounded-lg hover:bg-amber-600 font-bold">
                <Edit size={16} /> تعديل
            </button>
        )}
      </div>
    </div>
  );
};

export default JournalEntryView;
import React, { useState } from 'react';
import { supabase } from '../../supabaseClient';
import { Download, Calendar, Loader2, FileSpreadsheet } from 'lucide-react';
import * as XLSX from 'xlsx';

export default function JournalEntriesExport() {
  const [loading, setLoading] = useState(false);
  const [startDate, setStartDate] = useState(new Date(new Date().getFullYear(), 0, 1).toISOString().split('T')[0]);
  const [endDate, setEndDate] = useState(new Date().toISOString().split('T')[0]);

  const handleExport = async () => {
    setLoading(true);
    try {
      // جلب القيود مع التفاصيل وأسماء الحسابات
      const { data, error } = await supabase
        .from('journal_entries')
        .select(`
          id,
          transaction_date,
          reference,
          description,
          status,
          journal_lines (
            debit,
            credit,
            description,
            accounts (
              code,
              name
            )
          )
        `)
        .gte('transaction_date', startDate)
        .lte('transaction_date', endDate)
        .order('transaction_date', { ascending: true });

      if (error) throw error;

      if (!data || data.length === 0) {
        alert('لا توجد قيود في الفترة المحددة');
        return;
      }

      // تسطيح البيانات (Flattening) لتناسب ملف CSV
      const flatData: any[] = [];
      
      data.forEach((entry: any) => {
        entry.journal_lines.forEach((line: any) => {
          flatData.push({
            'التاريخ': entry.transaction_date,
            'المرجع': entry.reference,
            'وصف القيد الرئيسي': entry.description,
            'الحالة': entry.status === 'posted' ? 'مرحل' : 'مسودة',
            'كود الحساب': line.accounts?.code,
            'اسم الحساب': line.accounts?.name,
            'مدين': line.debit,
            'دائن': line.credit,
            'وصف السطر': line.description || '-'
          });
        });
      });

      // إنشاء ملف Excel/CSV
      const ws = XLSX.utils.json_to_sheet(flatData);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Journal Entries");

      // التصدير
      XLSX.writeFile(wb, `Journal_Entries_${startDate}_to_${endDate}.csv`);

    } catch (error: any) {
      console.error('Export error:', error);
      alert('حدث خطأ أثناء التصدير: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto p-6 animate-in fade-in">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
          <FileSpreadsheet className="text-emerald-600" /> تصدير القيود المحاسبية
        </h1>
        <p className="text-slate-500 mt-2">
          تصدير جميع حركات دفتر اليومية إلى ملف CSV للمراجعة والتدقيق الخارجي.
        </p>
      </div>

      <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
          <div>
            <label className="block text-sm font-bold text-slate-700 mb-1">من تاريخ</label>
            <div className="relative">
              <Calendar className="absolute top-2.5 right-3 text-slate-400" size={16} />
              <input 
                type="date" 
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 pr-10 focus:outline-none focus:border-emerald-500"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-bold text-slate-700 mb-1">إلى تاريخ</label>
            <div className="relative">
              <Calendar className="absolute top-2.5 right-3 text-slate-400" size={16} />
              <input 
                type="date" 
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 pr-10 focus:outline-none focus:border-emerald-500"
              />
            </div>
          </div>
          <button 
            onClick={handleExport}
            disabled={loading}
            className="bg-emerald-600 text-white px-6 py-2 rounded-lg hover:bg-emerald-700 font-bold shadow-sm disabled:opacity-50 flex items-center justify-center gap-2 transition-colors"
          >
            {loading ? <Loader2 className="animate-spin" size={18} /> : <Download size={18} />}
            تصدير ملف CSV
          </button>
        </div>
        
        <div className="mt-6 bg-slate-50 p-4 rounded-lg border border-slate-200 text-sm text-slate-600">
          <h4 className="font-bold mb-2 text-slate-800">ملاحظات التصدير:</h4>
          <ul className="list-disc list-inside space-y-1">
            <li>يتم تصدير البيانات بتنسيق CSV (قيم مفصولة بفواصل) المتوافق مع Excel.</li>
            <li>يشمل التقرير جميع القيود (المرحلة والمسودات) في الفترة المحددة.</li>
            <li>يتم عرض كل طرف من أطراف القيد في سطر منفصل لتسهيل الفلترة والمراجعة.</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
import React from 'react';
import { Calendar, CheckSquare, AlertTriangle, Eye, Printer, Copy, Edit, Trash2, Paperclip, Download, ShieldCheck } from 'lucide-react';
import { getEntrySource } from './journalSourceClassifier';

export interface JournalEntryCardProps {
  entry: any;
  canPost: boolean;
  onPost: (id: string) => void;
  onView: (id: string) => void;
  onPrint: (entry: any) => void;
  onDuplicate: (entry: any) => void;
  onEdit: (entry: any) => void;
  onDelete: (id: string) => void;
}

export const JournalEntryCard: React.FC<JournalEntryCardProps> = ({
  entry,
  canPost,
  onPost,
  onView,
  onPrint,
  onDuplicate,
  onEdit,
  onDelete
}) => {
  const supabaseUrl = 'https://pjvphxfschfllpawfewn.supabase.co';

  const dateStr = entry.date || entry.transaction_date || entry.created_at;
  let formattedDate = 'تاريخ غير صالح';
  if (dateStr) {
    const d = new Date(dateStr);
    if (!isNaN(d.getTime())) {
      formattedDate = d.toLocaleDateString('ar-EG', { year: 'numeric', month: 'long', day: 'numeric' });
    }
  }

  const totalDebit = (entry.lines || []).reduce((sum: number, line: any) => sum + (line.debit || 0), 0);
  const totalCredit = (entry.lines || []).reduce((sum: number, line: any) => sum + (line.credit || 0), 0);
  const isBalanced = Math.abs(totalDebit - totalCredit) < 0.01;
  const source = getEntrySource(entry.reference || '', entry.description || '');

  return (
    <div className="border border-slate-200 rounded-lg overflow-hidden">
      <div className="bg-slate-50 p-3 flex justify-between items-center text-sm gap-4">
        <div className="flex-1">
          <div className="font-bold text-slate-700 flex items-center gap-2 flex-wrap">
            <span>قيد رقم: <span className="font-mono">{entry.reference || entry.id.slice(0, 8)}</span></span>
            <span className={`text-[10px] px-2 py-0.5 rounded-full ${source.color}`}>{source.label}</span>
            {totalDebit >= 50000 && (
              <span 
                className="flex items-center gap-1 font-bold text-indigo-700 bg-indigo-50 border border-indigo-200 px-2 py-0.5 rounded-full text-[10px]" 
                title="قيد ذو أثر مالي جوهري (أكثر من 50,000 ج.م) يخضع لميثاق الاعتماد المالي المزدوج (Maker-Checker)"
              >
                <ShieldCheck size={12} className="text-indigo-600" />
                قيمة كبرى (اعتماد مالي)
              </span>
            )}
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
            <span 
              className="flex items-center gap-1.5 font-bold text-red-600 bg-red-100 px-3 py-1.5 rounded-full text-xs" 
              title={`غير متوازن! الفرق: ${(totalDebit - totalCredit).toFixed(2)}`}
            >
              <AlertTriangle size={14} /> غير متوازن
            </span>
          )}
          
          {/* زر الترحيل يظهر فقط للمدراء وللقيود غير المرحلة */}
          {canPost && entry.status !== 'posted' && (
            <button 
              onClick={() => onPost(entry.id)} 
              className="bg-emerald-500 text-white px-4 py-1.5 rounded-lg text-xs font-bold hover:bg-emerald-600 transition-colors shadow-sm"
            >
              ترحيل
            </button>
          )}
          <button 
            onClick={() => onView(entry.id)} 
            className="p-2 text-slate-400 hover:text-green-600 rounded-full hover:bg-slate-100 transition-colors" 
            title="عرض التفاصيل"
          >
            <Eye size={16} />
          </button>
          <button 
            onClick={() => onPrint(entry)} 
            className="p-2 text-slate-400 hover:text-blue-600 rounded-full hover:bg-slate-100 transition-colors" 
            title="طباعة السند"
          >
            <Printer size={16} />
          </button>
          <button 
            onClick={() => onDuplicate(entry)} 
            className="p-2 text-slate-400 hover:text-emerald-600 rounded-full hover:bg-slate-100 transition-colors" 
            title="تكرار / استنساخ هذا القيد"
          >
            <Copy size={16} />
          </button>
          {source.label === 'قيد يدوي' ? (
            <button 
              onClick={() => onEdit(entry)} 
              className="p-2 text-slate-400 hover:text-amber-600 rounded-full hover:bg-slate-100 transition-colors" 
              title="تعديل القيد"
            >
              <Edit size={16} />
            </button>
          ) : (
            <span className="p-2 text-slate-300 cursor-not-allowed" title="لا يمكن تعديل القيود الآلية">
              <Edit size={16} />
            </span>
          )}
          <button 
            onClick={() => onDelete(entry.id)} 
            className="p-2 text-slate-400 hover:text-red-600 rounded-full hover:bg-slate-100 transition-colors" 
            title="حذف القيد"
          >
            <Trash2 size={16} />
          </button>
        </div>
      </div>
      <div className="p-3 text-sm text-slate-600 border-b border-slate-100">
        <span className="font-bold">البيان:</span> {entry.description}
      </div>
      <div className="p-3 text-sm font-bold text-slate-800 border-b border-slate-100 bg-slate-50/50">
        قيمة القيد: {totalDebit.toLocaleString()}
      </div>
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
            {(entry.lines || []).map((line: any, index: number) => (
              <tr key={index} className="border-t border-slate-100">
                <td className="p-2 font-medium text-slate-800">
                  {line.accountName || 'حساب غير معروف'} <span className="text-xs text-slate-400">({line.accountCode})</span>
                </td>
                <td className="p-2 text-center font-mono text-emerald-600">
                  {line.debit > 0 ? line.debit.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2}) : '-'}
                </td>
                <td className="p-2 text-center font-mono text-red-600">
                  {line.credit > 0 ? line.credit.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2}) : '-'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {/* Attachments Section */}
      {entry.attachments && entry.attachments.length > 0 && (
        <div className="p-3 bg-slate-50 border-t border-slate-100">
          <h4 className="text-xs font-bold text-slate-500 mb-2 flex items-center gap-1">
            <Paperclip size={14} />
            المرفقات ({entry.attachments.length})
          </h4>
          <div className="flex flex-wrap gap-2">
            {entry.attachments.map((att: any) => (
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
  );
};

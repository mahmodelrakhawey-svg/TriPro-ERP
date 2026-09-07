import React from 'react';
import { tafqeet } from '../../utils/tafqeet';

interface DebitNotePrintProps {
  noteData: any;
  companySettings?: any;
}

export const DebitNotePrint: React.FC<DebitNotePrintProps> = ({ noteData, companySettings }) => {
  if (!noteData) return null;

  const amountBeforeTax = Number(noteData.amountBeforeTax ?? noteData.amount_before_tax ?? noteData.amount ?? 0);
  const taxAmount = Number(noteData.taxAmount ?? noteData.tax_amount ?? 0);
  const totalAmount = Number(noteData.totalAmount ?? noteData.total_amount ?? (amountBeforeTax + taxAmount));

  return (
    <div className="hidden print:block fixed inset-0 bg-white z-[9999] p-8 text-black font-sans" dir="rtl" id="printable-debit-note">
      <style>{`
        @media print {
          body * { visibility: hidden; }
          #printable-debit-note, #printable-debit-note * { visibility: visible; }
          #printable-debit-note { position: absolute; left: 0; top: 0; width: 100%; }
        }
      `}</style>
      
      {/* Header */}
      <div className="flex justify-between items-start border-b-2 border-slate-800 pb-6 mb-6">
        <div className="text-right">
            <h2 className="text-2xl font-bold text-slate-900">{companySettings?.company_name || 'اسم الشركة'}</h2>
            <p className="text-sm text-slate-600 mt-1">{companySettings?.address || 'العنوان'}</p>
            <p className="text-sm text-slate-600">{companySettings?.phone || 'الهاتف'}</p>
            {companySettings?.tax_number && <p className="text-sm text-slate-600">رقم ضريبي: {companySettings.tax_number}</p>}
        </div>
        <div className="text-center">
            <h1 className="text-3xl font-black text-slate-900 mb-1">إشعار مدين (تسوية مورد)</h1>
            <p className="text-base font-bold text-slate-500 uppercase tracking-widest">Debit Note / Supplier Debit Adjustment</p>
        </div>
        <div className="text-left">
             {companySettings?.logo_url ? (
                 <img src={companySettings.logo_url} alt="Logo" className="h-20 max-w-[140px] object-contain" />
             ) : (
                 <div className="w-20 h-20 bg-slate-100 flex items-center justify-center text-slate-400 font-bold border border-slate-300 rounded-lg">شعار</div>
             )}
        </div>
      </div>

      {/* Note Info Box */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-4 bg-slate-50 rounded-xl border border-slate-200 mb-6">
        <div>
            <span className="block text-xs text-slate-500 font-bold mb-0.5">رقم الإشعار المدين</span>
            <span className="text-lg font-black font-mono text-blue-700">{noteData.noteNumber || noteData.debit_note_number}</span>
        </div>
        <div>
            <span className="block text-xs text-slate-500 font-bold mb-0.5">تاريخ الإشعار</span>
            <span className="text-base font-bold">{noteData.date || noteData.note_date}</span>
        </div>
        <div>
            <span className="block text-xs text-slate-500 font-bold mb-0.5">اسم المورد</span>
            <span className="text-base font-bold">{noteData.supplierName || noteData.suppliers?.name || '-'}</span>
        </div>
        <div>
            <span className="block text-xs text-slate-500 font-bold mb-0.5">رقم الفاتورة الأصلية</span>
            <span className="text-base font-bold font-mono text-slate-700">{noteData.originalInvoiceNumber || noteData.original_invoice_number || 'تسوية عامة'}</span>
        </div>
        {noteData.notes && (
          <div className="col-span-4">
              <span className="block text-xs text-slate-500 font-bold mb-0.5">سبب الإشعار / البيان</span>
              <span className="text-sm text-slate-700">{noteData.notes}</span>
          </div>
        )}
      </div>

      {/* Financial Details Table */}
      <table className="w-full mb-6 text-right border border-slate-200">
        <thead className="bg-slate-100 border-b-2 border-slate-800 text-slate-800 font-bold text-sm">
            <tr>
                <th className="py-2.5 px-3">البيان والتفاصيل</th>
                <th className="py-2.5 px-3 text-center">المبلغ قبل الضريبة</th>
                <th className="py-2.5 px-3 text-center">ضريبة القيمة المضافة</th>
                <th className="py-2.5 px-3 text-center">إجمالي الإشعار المدين</th>
            </tr>
        </thead>
        <tbody className="divide-y divide-slate-200 text-sm">
            <tr className="bg-white">
                <td className="py-4 px-3 font-bold text-slate-900">
                  {noteData.notes || 'تسوية رصيد وتخفيض مستحقات المورد'}
                </td>
                <td className="py-4 px-3 text-center font-mono font-bold">
                  {amountBeforeTax.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </td>
                <td className="py-4 px-3 text-center font-mono text-slate-700">
                  {taxAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </td>
                <td className="py-4 px-3 text-center font-mono font-black text-blue-700 text-base">
                  {totalAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </td>
            </tr>
        </tbody>
      </table>

      {/* Totals Section */}
      <div className="flex justify-between items-start mb-8">
        <div className="w-1/2 p-4 bg-slate-50 rounded-xl border border-slate-200">
            <span className="block text-xs text-slate-500 font-bold mb-1">المبلغ بالحروف:</span>
            <p className="text-sm font-bold text-slate-800 leading-relaxed">
              فقط {tafqeet(totalAmount)} لا غير.
            </p>
        </div>
        <div className="w-1/3 space-y-2 text-sm">
            <div className="flex justify-between text-slate-600">
                <span>المبلغ الخاضع:</span>
                <span className="font-bold font-mono">{amountBeforeTax.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {companySettings?.currency || 'ج.م'}</span>
            </div>
            {taxAmount > 0 && (
              <div className="flex justify-between text-slate-600">
                  <span>قيمة الضريبة:</span>
                  <span className="font-bold font-mono">{taxAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {companySettings?.currency || 'ج.م'}</span>
              </div>
            )}
            <div className="flex justify-between text-base font-black text-blue-900 border-t-2 border-slate-800 pt-2">
                <span>إجمالي الخصم المعتمد:</span>
                <span className="font-mono">{totalAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {companySettings?.currency || 'ج.م'}</span>
            </div>
        </div>
      </div>

      {/* Signatures */}
      <div className="grid grid-cols-3 gap-8 pt-10 border-t border-slate-200 text-center text-xs font-bold text-slate-600 mt-12">
          <div>
              <p className="mb-8">المحاسب المسؤول</p>
              <div className="border-b border-dashed border-slate-400 w-32 mx-auto"></div>
          </div>
          <div>
              <p className="mb-8">المدير المالي</p>
              <div className="border-b border-dashed border-slate-400 w-32 mx-auto"></div>
          </div>
          <div>
              <p className="mb-8">توقيع وختم المورد بالعلم</p>
              <div className="border-b border-dashed border-slate-400 w-32 mx-auto"></div>
          </div>
      </div>
    </div>
  );
};

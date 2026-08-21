import React, { useRef, useState } from 'react';
import { useReactToPrint } from 'react-to-print';
import { X, Printer, Trophy, CheckCircle2, Share2, FileText } from 'lucide-react';
import { numberToArabicWords } from '../stadiumHelpers';

export interface ReceiptData {
  receiptNumber: string;
  receiptDate: string;
  receiptTypeLabel: string; // e.g. "إيصال سداد اشتراك عضو", "إيصال سداد حجز ملعب"
  partyName: string;
  partyPhone?: string;
  partyId?: string; // الرقم القومي أو رقم العضوية
  amount: number;
  paymentMethod: string;
  facilityOrProgramName?: string;
  periodOrDuration?: string;
  chequeNumber?: string;
  bankName?: string;
  notes?: string;
  receivedBy?: string;
}

interface ReceiptModalProps {
  isOpen: boolean;
  onClose: () => void;
  data: ReceiptData | null;
}

export const ReceiptModal: React.FC<ReceiptModalProps> = ({
  isOpen,
  onClose,
  data,
}) => {
  const [printFormat, setPrintFormat] = useState<'thermal' | 'a4'>('a4');
  const printReceiptRef = useRef<HTMLDivElement>(null);

  const handlePrint = useReactToPrint({
    contentRef: printReceiptRef,
    documentTitle: `إيصال_سداد_${data?.receiptNumber || 'استاد_المنصورة'}`,
  });

  if (!isOpen || !data) return null;

  const paymentMethodLabel =
    data.paymentMethod === 'cash' ? 'نقداً (خزينة)' :
    data.paymentMethod === 'cheque' ? `شيك بنكي (رقم: ${data.chequeNumber || '—'} مسحوب على: ${data.bankName || '—'})` :
    data.paymentMethod === 'card' ? 'بطاقة دفع إلكتروني' :
    data.paymentMethod === 'bank_transfer' ? 'تحويل بنكي' : data.paymentMethod;

  const arabicWords = numberToArabicWords(data.amount);

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" dir="rtl">
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex justify-between items-center p-5 border-b dark:border-gray-800 bg-slate-50 dark:bg-slate-850">
          <div>
            <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
              <FileText className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
              طباعة إيصال استلام النقدية والسداد
            </h2>
            <p className="text-xs text-gray-500 mt-0.5">رقم الإيصال: {data.receiptNumber}</p>
          </div>

          <div className="flex items-center gap-3">
            {/* Format toggle */}
            <div className="flex bg-gray-200 dark:bg-gray-700 p-0.5 rounded-lg text-xs font-semibold">
              <button
                onClick={() => setPrintFormat('a4')}
                className={`px-3 py-1 rounded-md transition ${printFormat === 'a4' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600 dark:text-gray-300'}`}
              >
                نموذج A4
              </button>
              <button
                onClick={() => setPrintFormat('thermal')}
                className={`px-3 py-1 rounded-md transition ${printFormat === 'thermal' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600 dark:text-gray-300'}`}
              >
                طابعة حرارية (80mm)
              </button>
            </div>

            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Printable Area Preview */}
        <div className="p-6 overflow-y-auto bg-gray-100 dark:bg-gray-950 flex justify-center">
          {printFormat === 'a4' ? (
            /* ──────────────── A4 Receipt Template ──────────────── */
            <div
              ref={printReceiptRef}
              className="bg-white text-black p-8 rounded-xl shadow-md w-full max-w-[560px] border border-gray-300 space-y-6 text-sm font-sans"
            >
              {/* Header */}
              <div className="border-b-2 border-black pb-4 flex justify-between items-center text-center">
                <div className="text-right">
                  <h3 className="font-bold text-base">جمهورية مصر العربية</h3>
                  <p className="text-xs text-gray-600">وزارة الشباب والرياضة</p>
                  <p className="text-xs font-bold text-gray-800">استاد المنصورة الرياضي</p>
                </div>

                <div className="w-14 h-14 rounded-full bg-emerald-50 border border-emerald-600 flex items-center justify-center">
                  <Trophy className="w-7 h-7 text-emerald-700" />
                </div>

                <div className="text-left font-mono text-xs">
                  <div><strong>رقم الإيصال:</strong> {data.receiptNumber}</div>
                  <div><strong>التاريخ:</strong> {data.receiptDate}</div>
                </div>
              </div>

              {/* Title */}
              <div className="text-center">
                <span className="inline-block bg-gray-100 border border-black px-6 py-1.5 rounded-md font-bold text-base">
                  {data.receiptTypeLabel}
                </span>
              </div>

              {/* Receipt Body Table */}
              <div className="border border-black rounded-lg overflow-hidden">
                <table className="w-full text-right border-collapse text-xs">
                  <tbody className="divide-y divide-gray-300">
                    <tr>
                      <td className="p-2.5 bg-gray-50 font-bold w-32">استلمنا من السيد/ة:</td>
                      <td className="p-2.5 font-bold text-sm">{data.partyName}</td>
                    </tr>
                    {data.partyId && (
                      <tr>
                        <td className="p-2.5 bg-gray-50 font-bold">الرقم القومي / الهوية:</td>
                        <td className="p-2.5 font-mono">{data.partyId}</td>
                      </tr>
                    )}
                    {data.facilityOrProgramName && (
                      <tr>
                        <td className="p-2.5 bg-gray-50 font-bold">المرفق / البرنامج:</td>
                        <td className="p-2.5 font-semibold text-emerald-800">{data.facilityOrProgramName}</td>
                      </tr>
                    )}
                    {data.periodOrDuration && (
                      <tr>
                        <td className="p-2.5 bg-gray-50 font-bold">المدة / الفترة:</td>
                        <td className="p-2.5">{data.periodOrDuration}</td>
                      </tr>
                    )}
                    <tr>
                      <td className="p-2.5 bg-gray-50 font-bold">المبلغ المسدد:</td>
                      <td className="p-2.5">
                        <span className="text-base font-bold font-mono text-green-700">
                          {data.amount.toLocaleString('ar-EG', { minimumFractionDigits: 2 })} ج.م
                        </span>
                      </td>
                    </tr>
                    <tr>
                      <td className="p-2.5 bg-gray-50 font-bold">فقط وقدره:</td>
                      <td className="p-2.5 font-semibold text-gray-800">{arabicWords}</td>
                    </tr>
                    <tr>
                      <td className="p-2.5 bg-gray-50 font-bold">طريقة السداد:</td>
                      <td className="p-2.5">{paymentMethodLabel}</td>
                    </tr>
                    {data.notes && (
                      <tr>
                        <td className="p-2.5 bg-gray-50 font-bold">ملاحظات وبيان:</td>
                        <td className="p-2.5 text-gray-600">{data.notes}</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              {/* Stamp & Signatures */}
              <div className="pt-4 grid grid-cols-2 text-center text-xs gap-4">
                <div className="space-y-8">
                  <p className="font-bold">المستلم / أمين الخزينة</p>
                  <p className="text-gray-500 font-mono">.....................................</p>
                </div>
                <div className="space-y-8">
                  <p className="font-bold">خاتم الإدارة المالية للاستاد</p>
                  <div className="w-20 h-20 border-2 border-dashed border-gray-400 rounded-full mx-auto flex items-center justify-center text-[10px] text-gray-400">
                    خاتم الخزينة
                  </div>
                </div>
              </div>

              <div className="text-center text-[10px] text-gray-400 border-t pt-2">
                * يُعتبر هذا الإيصال سنداً رسمياً مسجلاً ومعتمداً بالدفاتر الإلكترونية للاستاد
              </div>
            </div>
          ) : (
            /* ──────────────── Thermal POS 80mm Template ──────────────── */
            <div
              ref={printReceiptRef}
              className="bg-white text-black p-4 rounded shadow w-[300px] border border-gray-300 space-y-3 font-mono text-xs text-center"
            >
              <div className="border-b pb-2 space-y-1">
                <Trophy className="w-6 h-6 mx-auto text-black" />
                <h3 className="font-bold text-sm">استاد المنصورة الرياضي</h3>
                <p className="text-[10px] text-gray-600">مركز التنمية الشبابية</p>
                <div className="font-bold text-xs mt-1 border border-black py-0.5">
                  {data.receiptTypeLabel}
                </div>
              </div>

              <div className="text-right space-y-1.5 text-[11px] border-b pb-2">
                <div className="flex justify-between">
                  <span>رقم الإيصال:</span>
                  <span className="font-bold">{data.receiptNumber}</span>
                </div>
                <div className="flex justify-between">
                  <span>التاريخ:</span>
                  <span>{data.receiptDate}</span>
                </div>
                <div className="border-t border-dashed my-1"></div>
                <div>
                  <span className="text-gray-600 block">الاسم:</span>
                  <strong className="text-xs">{data.partyName}</strong>
                </div>
                {data.facilityOrProgramName && (
                  <div>
                    <span className="text-gray-600 block">البيان:</span>
                    <span>{data.facilityOrProgramName}</span>
                  </div>
                )}
                <div>
                  <span className="text-gray-600 block">طريقة الدفع:</span>
                  <span>{paymentMethodLabel}</span>
                </div>
              </div>

              {/* Total Amount Box */}
              <div className="bg-gray-100 p-2 border border-black rounded text-center my-2">
                <span className="text-[10px] block">المبلغ الإجمالي المسدد</span>
                <strong className="text-base font-bold">
                  {data.amount.toLocaleString('ar-EG', { minimumFractionDigits: 2 })} ج.م
                </strong>
                <p className="text-[9px] text-gray-600 mt-0.5">{arabicWords}</p>
              </div>

              <div className="pt-2 text-[9px] text-gray-500 space-y-1">
                <p>شكراً لزيارتكم استاد المنصورة</p>
                <p>سند إلكتروني معتمد</p>
              </div>
            </div>
          )}
        </div>

        {/* Modal Actions */}
        <div className="p-5 border-t dark:border-gray-800 bg-slate-50 dark:bg-slate-850 flex justify-between items-center gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 border rounded-xl text-xs font-medium text-gray-600 hover:bg-gray-100 dark:border-gray-700 dark:text-gray-300"
          >
            إغلاق
          </button>
          <button
            onClick={() => handlePrint()}
            className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-5 py-2 rounded-xl text-xs font-bold shadow-md transition"
          >
            <Printer className="w-4 h-4" />
            طباعة الإيصال فورياً ({printFormat === 'a4' ? 'A4' : 'حراري'})
          </button>
        </div>
      </div>
    </div>
  );
};

export default ReceiptModal;

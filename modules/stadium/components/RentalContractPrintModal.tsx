import React, { useRef } from 'react';
import { useReactToPrint } from 'react-to-print';
import { X, Printer, Trophy, FileText, CheckCircle2, Shield } from 'lucide-react';
import { StadiumRentalContract, RENTAL_CYCLE_LABELS } from '../stadium.types';
import { numberToArabicWords } from '../stadiumHelpers';

interface RentalContractPrintModalProps {
  isOpen: boolean;
  onClose: () => void;
  contract: StadiumRentalContract | null;
  facilityName?: string;
}

export const RentalContractPrintModal: React.FC<RentalContractPrintModalProps> = ({
  isOpen,
  onClose,
  contract,
  facilityName,
}) => {
  const printContractRef = useRef<HTMLDivElement>(null);

  const handlePrint = useReactToPrint({
    contentRef: printContractRef,
    documentTitle: `عقد_إيجار_${contract?.tenant_name || 'استاد_المنصورة'}`,
  });

  if (!isOpen || !contract) return null;

  const cycleText = RENTAL_CYCLE_LABELS[contract.billing_cycle] || contract.billing_cycle;
  const amountWords = numberToArabicWords(contract.amount_per_cycle);

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" dir="rtl">
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-3xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Modal Header */}
        <div className="flex justify-between items-center p-5 border-b dark:border-gray-800 bg-slate-50 dark:bg-slate-850">
          <div>
            <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
              <FileText className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
              طباعة عقد الاستغلال والإيجار الرسمي
            </h2>
            <p className="text-xs text-gray-500 mt-0.5">المستأجر: {contract.tenant_name}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Printable Contract Preview */}
        <div className="p-6 overflow-y-auto bg-gray-100 dark:bg-gray-950 flex justify-center">
          <div
            ref={printContractRef}
            className="bg-white text-black p-10 rounded-xl shadow-md w-full max-w-[650px] border border-gray-300 space-y-6 text-sm font-serif leading-relaxed"
          >
            {/* Republic Header */}
            <div className="border-b-2 border-black pb-4 text-center relative">
              <div className="flex justify-between items-center">
                <div className="text-right text-xs">
                  <h3 className="font-bold">جمهورية مصر العربية</h3>
                  <p>وزارة الشباب والرياضة</p>
                  <p className="font-bold">استاد المنصورة الرياضي</p>
                </div>
                <div className="w-14 h-14 rounded-full bg-slate-50 border border-slate-700 flex items-center justify-center">
                  <Trophy className="w-7 h-7 text-emerald-800" />
                </div>
                <div className="text-left text-xs font-mono">
                  <div><strong>رقم العقد:</strong> {contract.id.substring(0, 8).toUpperCase()}</div>
                  <div><strong>التاريخ:</strong> {contract.start_date}</div>
                </div>
              </div>
              <h2 className="text-xl font-bold mt-4 tracking-wide border-y border-black py-1.5 inline-block px-8">
                عقد حق استغلال وإيجار منشأة ومرفق
              </h2>
            </div>

            {/* Intro */}
            <p className="text-xs">
              إنه في يوم <strong>{contract.start_date}</strong>، تم الاتفاق والتراضي بين كل من:
            </p>

            {/* Parties */}
            <div className="space-y-3 bg-slate-50 p-4 rounded-lg border border-slate-300 text-xs">
              <div>
                <strong>الطرف الأول (المؤجر/صاحب حق الاستغلال):</strong> استاد المنصورة الرياضي ومركز التنمية الشبابية بالدقهلية، ويمثله قانوناً السيد المدير التنفيذي / رئيس مجلس الإدارة.
              </div>
              <div>
                <strong>الطرف الثاني (المستأجر/المستغل):</strong> السيد/ <strong>{contract.tenant_name}</strong>
                {contract.tenant_phone && <span> — هاتف: <span className="font-mono">{contract.tenant_phone}</span></span>}
              </div>
            </div>

            {/* Clauses */}
            <div className="space-y-4 text-xs">
              <h4 className="font-bold text-sm border-b pb-1">تمهيد وبنود التعاقد:</h4>
              
              <div>
                <strong>البند الأول (محل التعاقد):</strong> وافق الطرف الأول على منح الطرف الثاني حق استغلال وإيجار المرفق المسمى: <strong>{facilityName || 'المرفق الرياضي/الخدمي'}</strong> التابع لاستاد المنصورة، وذلك بغرض النشاط المصرح به فقط.
              </div>

              <div>
                <strong>البند الثاني (مدة العقد):</strong> تبدأ مدة هذا العقد اعتباراً من تاريخ <strong>{contract.start_date}</strong> وتنتهي في تاريخ <strong>{contract.end_date}</strong>، ولا يُجدد هذا العقد تلقائياً إلا بموافقة خطية من إدارة الاستاد.
              </div>

              <div>
                <strong>البند الثالث (المقابل المالي ودورة السداد):</strong> يلتزم الطرف الثاني بأن يسدد للطرف الأول مبلغاً وقدره:
                <div className="my-1.5 p-2 bg-emerald-50 border border-emerald-300 rounded font-bold font-mono text-sm text-emerald-900 text-center">
                  {contract.amount_per_cycle.toLocaleString('ar-EG', { minimumFractionDigits: 2 })} ج.م ({amountWords}) لكل {cycleText}
                </div>
                ويلتزم بالسداد في موعد أقصاه اليوم الخامس من بداية كل دورة استحقاق بخزينة الاستاد أو بحوالة بنكية معتمدة.
              </div>

              <div>
                <strong>البند الرابع (الالتزامات والتشغيل):</strong> يلتزم الطرف الثاني بالمحافظة على المرفق والأجهزة والمعدات بحالة جيدة، وتحمل كافة اشتراطات السلامة والصحة المهنية ومصاريف النظافة والصيانة الجارية، وعدم التنازل أو التأجير من الباطن نهائياً تحت طائلة فسخ العقد ومصادرة التأمين.
              </div>

              <div>
                <strong>البند الخامس (الفسخ والنزاع):</strong> في حالة تأخر الطرف الثاني عن سداد الدفعة الإيجارية لمدة تزيد عن 15 يوماً من تاريخ الاستحقاق، يُعتبر هذا العقد مفسوخاً من تلقاء نفسه دون حاجة لإنذار أو حكم قضائي، وتختص محاكم المنصورة بنظر أي نزاع لا قدر الله.
              </div>
            </div>

            {/* Signatures */}
            <div className="pt-6 border-t-2 border-black grid grid-cols-2 text-center text-xs gap-6">
              <div className="space-y-8">
                <p className="font-bold">الطرف الأول (إدارة الاستاد)</p>
                <p className="text-gray-400 font-mono">..........................................</p>
                <p className="text-[10px] text-gray-500">خاتم شعار المنشأة</p>
              </div>
              <div className="space-y-8">
                <p className="font-bold">الطرف الثاني (المستأجر)</p>
                <p className="text-gray-400 font-mono">..........................................</p>
                <p className="text-[10px] text-gray-500">التوقيع وبصمة الإبهام</p>
              </div>
            </div>
          </div>
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
            className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2 rounded-xl text-xs font-bold shadow-md transition"
          >
            <Printer className="w-4 h-4" />
            طباعة عقد الاستغلال الرسمي (A4)
          </button>
        </div>
      </div>
    </div>
  );
};

export default RentalContractPrintModal;

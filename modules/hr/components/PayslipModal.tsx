import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { useToast } from '../../../context/ToastContext';
import { Printer, X, MessageCircle, Copy } from 'lucide-react';

export interface PayslipData {
  employee_name: string;
  employee_code?: string;
  department?: string;
  job_title?: string;
  phone?: string;
  month: number;
  year: number;
  gross_salary: number;
  effective_days?: number;
  effective_salary?: number;
  additions: number;
  advances_deducted: number;
  payroll_tax: number;
  social_insurance?: number;
  other_deductions: number;
  net_salary: number;
  unpaid_leave_days?: number;
  unpaid_leave_deduction?: number;
  absence_days?: number;
  absence_deduction?: number;
  late_minutes?: number;
  late_deduction?: number;
  penalty_amount?: number;
  overtime_hours?: number;
  company_name?: string;
}

const MONTH_NAMES = [
  'يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو',
  'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'
];

interface PayslipCardProps {
  data: PayslipData;
  id?: string;
  className?: string;
}

export const PayslipCard: React.FC<PayslipCardProps> = ({ data, id = 'printable-payslip-card', className = '' }) => {
  const earnedBase = data.effective_salary ?? data.gross_salary;
  const isPartialMonth = (data.effective_days ?? 30) < 30;

  return (
    <div
      id={id}
      className={`space-y-6 border-2 border-slate-800 p-6 rounded-2xl print:border-2 print:border-black bg-white printable-card-content text-right text-slate-900 ${className}`}
      dir="rtl"
    >
      {/* Header */}
      <div className="flex justify-between items-start border-b-2 border-slate-800 pb-4">
        <div>
          <h2 className="text-xl font-black text-slate-900">{data.company_name || 'شركة TriPro ERP للأنظمة الإدارية'}</h2>
          <p className="text-xs text-slate-500 font-bold mt-0.5">إدارة الموارد البشرية والرواتب (HR Department)</p>
          <p className="text-[11px] text-slate-400">قسيمة راتب شهر: {MONTH_NAMES[data.month - 1]} {data.year}</p>
        </div>
        <div className="text-left font-mono">
          <span className="px-3 py-1 bg-slate-900 text-white rounded-lg text-xs font-bold inline-block print:bg-black print:text-white">
            PAYSLIP / قسيمة راتب
          </span>
          <span className="text-[10px] text-slate-400 block mt-1">تاريخ الإصدار: {new Date().toLocaleDateString('ar-EG')}</span>
        </div>
      </div>

      {/* Employee Details Grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3 bg-slate-50 p-4 rounded-xl border border-slate-200 text-xs">
        <div>
          <span className="text-slate-400 block text-[10px]">اسم الموظف:</span>
          <span className="font-bold text-sm text-slate-900">{data.employee_name}</span>
        </div>
        <div>
          <span className="text-slate-400 block text-[10px]">المسمى الوظيفي / القسم:</span>
          <span className="font-bold text-slate-800">{data.job_title || 'موظف بالشركة'} - {data.department || 'القسم الإداري'}</span>
        </div>
        <div>
          <span className="text-slate-400 block text-[10px]">أيام العمل المحتسبة:</span>
          <span className={`font-bold font-mono ${isPartialMonth ? 'text-amber-700' : 'text-slate-700'}`}>
            {data.effective_days ?? 30} يوماً {isPartialMonth && '(تعيين/إيقاف خلال الشهر)'}
          </span>
        </div>
      </div>

      {/* Earnings & Deductions Tables */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* الاستحقاقات (Earnings) */}
        <div className="space-y-2">
          <h4 className="font-bold text-xs text-emerald-800 bg-emerald-50 px-3 py-1.5 rounded-lg border border-emerald-200">
            1. الاستحقاقات والبدلات (+)
          </h4>
          <div className="space-y-1.5 text-xs">
            <div className="flex justify-between py-1 border-b border-slate-100 font-medium">
              <span className="text-slate-600">الراتب الأساسي التعاقدي:</span>
              <span className="font-mono font-bold">{data.gross_salary.toLocaleString()} ج.م</span>
            </div>
            {isPartialMonth && (
              <div className="flex justify-between py-1 border-b border-slate-100 font-medium text-amber-800 bg-amber-50/50 px-1 rounded">
                <span>المستحق الفعلي ({data.effective_days} يوم):</span>
                <span className="font-mono font-bold">{earnedBase.toLocaleString()} ج.م</span>
              </div>
            )}
            <div className="flex justify-between py-1 border-b border-slate-100 font-medium">
              <span className="text-slate-600">إضافي ومكافآت:</span>
              <span className="font-mono font-bold text-emerald-600">+{data.additions.toLocaleString()} ج.م</span>
            </div>
            <div className="flex justify-between py-1.5 font-bold text-slate-900 bg-slate-50 px-2 rounded">
              <span>إجمالي الاستحقاقات:</span>
              <span className="font-mono text-emerald-700">{(earnedBase + data.additions).toLocaleString()} ج.م</span>
            </div>
          </div>
        </div>

        {/* الاستقطاعات (Deductions) */}
        <div className="space-y-2">
          <h4 className="font-bold text-xs text-rose-800 bg-rose-50 px-3 py-1.5 rounded-lg border border-rose-200">
            2. الاستقطاعات والخصومات (-)
          </h4>
          <div className="space-y-1.5 text-xs">
            {data.advances_deducted > 0 && (
              <div className="flex justify-between py-1 border-b border-slate-100 font-medium">
                <span className="text-slate-600">سلف مستقطعة:</span>
                <span className="font-mono text-rose-600">-{data.advances_deducted.toLocaleString()} ج.م</span>
              </div>
            )}
            {data.absence_days && data.absence_days > 0 ? (
              <div className="flex justify-between py-1 border-b border-slate-100 font-medium">
                <span className="text-slate-600">خصم غياب ({data.absence_days} يوم):</span>
                <span className="font-mono text-rose-600">-{data.absence_deduction?.toLocaleString() || 0} ج.م</span>
              </div>
            ) : null}
            {data.late_minutes && data.late_minutes > 0 ? (
              <div className="flex justify-between py-1 border-b border-slate-100 font-medium">
                <span className="text-slate-600">خصم تأخير ({data.late_minutes} دقيقة):</span>
                <span className="font-mono text-amber-600">-{data.late_deduction?.toLocaleString() || 0} ج.م</span>
              </div>
            ) : null}
            {data.unpaid_leave_days && data.unpaid_leave_days > 0 ? (
              <div className="flex justify-between py-1 border-b border-slate-100 font-medium">
                <span className="text-slate-600">إجازات بدون أجر ({data.unpaid_leave_days} يوم):</span>
                <span className="font-mono text-purple-600">-{data.unpaid_leave_deduction?.toLocaleString() || 0} ج.م</span>
              </div>
            ) : null}
            {data.penalty_amount && data.penalty_amount > 0 ? (
              <div className="flex justify-between py-1 border-b border-slate-100 font-medium">
                <span className="text-slate-600">جزاءات إدارية معتمدة:</span>
                <span className="font-mono text-rose-600">-{data.penalty_amount.toLocaleString()} ج.م</span>
              </div>
            ) : null}
            {data.social_insurance && data.social_insurance > 0 ? (
              <div className="flex justify-between py-1 border-b border-slate-100 font-medium">
                <span className="text-slate-600">تأمينات اجتماعية:</span>
                <span className="font-mono text-rose-600">-{data.social_insurance.toLocaleString()} ج.م</span>
              </div>
            ) : null}
            {data.payroll_tax > 0 && (
              <div className="flex justify-between py-1 border-b border-slate-100 font-medium">
                <span className="text-slate-600">ضريبة كسب العمل:</span>
                <span className="font-mono text-slate-700">-{data.payroll_tax.toLocaleString()} ج.م</span>
              </div>
            )}
            {!data.absence_days && !data.late_minutes && !data.unpaid_leave_days && !data.penalty_amount && data.other_deductions > 0 ? (
              <div className="flex justify-between py-1 border-b border-slate-100 font-medium">
                <span className="text-slate-600">خصومات أخرى:</span>
                <span className="font-mono text-rose-600">-{data.other_deductions.toLocaleString()} ج.م</span>
              </div>
            ) : null}
            <div className="flex justify-between py-1.5 font-bold text-slate-900 bg-slate-50 px-2 rounded">
              <span>إجمالي الاستقطاعات:</span>
              <span className="font-mono text-rose-700">
                -{(data.advances_deducted + data.other_deductions + data.payroll_tax + (data.social_insurance || 0)).toLocaleString()} ج.م
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Net Salary Highlight */}
      <div className="bg-slate-900 text-white p-4 rounded-2xl flex justify-between items-center print:bg-black">
        <div>
          <span className="text-xs text-slate-300 font-bold block">صافي الراتب المستحق للصرف</span>
          <span className="text-[10px] text-slate-400">Net Payable Amount</span>
        </div>
        <div className="text-2xl font-black font-mono text-emerald-400 print:text-white">
          {data.net_salary.toLocaleString()} ج.م
        </div>
      </div>

      {/* Signatures */}
      <div className="grid grid-cols-2 gap-8 pt-6 border-t border-slate-200 text-xs text-center font-bold text-slate-700">
        <div className="space-y-8">
          <span>توقيع المدير المالي / الموارد البشرية</span>
          <div className="border-b border-slate-400 w-3/4 mx-auto"></div>
        </div>
        <div className="space-y-8">
          <span>توقيع واستلام الموظف</span>
          <div className="border-b border-slate-400 w-3/4 mx-auto"></div>
        </div>
      </div>
    </div>
  );
};

interface PayslipModalProps {
  data: PayslipData;
  onClose: () => void;
}

export const PayslipModal: React.FC<PayslipModalProps> = ({ data, onClose }) => {
  const { showToast } = useToast();
  const [copied, setCopied] = useState(false);

  const handlePrint = () => {
    window.print();
  };

  const earnedBase = data.effective_salary ?? data.gross_salary;
  const isPartialMonth = (data.effective_days ?? 30) < 30;

  // توليد نص مفردات الراتب لإرساله عبر الواتساب أو نسخه
  const generateTextMessage = () => {
    const lines = [
      `🏢 *${data.company_name || 'شركة TriPro ERP'}*`,
      `📄 *قسيمة مفردات الراتب (Payslip)*`,
      `📅 *شهر:* ${MONTH_NAMES[data.month - 1]} ${data.year}`,
      `👤 *الموظف:* ${data.employee_name}`,
      `🏢 *القسم / الفرع:* ${data.department || 'الرئيسي'}`,
      `---------------------------------`,
      `💵 *الراتب الأساسي:* ${data.gross_salary.toLocaleString()} ج.م`,
      ...(isPartialMonth ? [`⏱️ *أيام العمل الفعلية:* ${data.effective_days} يوم (المستحق: ${earnedBase.toLocaleString()} ج.م)`] : []),
      `➕ *إضافي ومكافآت:* +${data.additions.toLocaleString()} ج.م`,
      `---------------------------------`,
      ...(data.advances_deducted > 0 ? [`➖ *سلف مستقطعة:* -${data.advances_deducted.toLocaleString()} ج.م`] : []),
      ...(data.absence_days && data.absence_days > 0 ? [`➖ *خصم غياب (${data.absence_days} يوم):* -${(data.absence_deduction || 0).toLocaleString()} ج.م`] : []),
      ...(data.late_minutes && data.late_minutes > 0 ? [`➖ *خصم تأخير (${data.late_minutes} دقيقة):* -${(data.late_deduction || 0).toLocaleString()} ج.م`] : []),
      ...(data.penalty_amount && data.penalty_amount > 0 ? [`➖ *جزاءات إدارية:* -${data.penalty_amount.toLocaleString()} ج.م`] : []),
      ...(data.social_insurance && data.social_insurance > 0 ? [`➖ *تأمينات اجتماعية:* -${data.social_insurance.toLocaleString()} ج.م`] : []),
      ...(data.payroll_tax > 0 ? [`➖ *ضريبة كسب عمل:* -${data.payroll_tax.toLocaleString()} ج.م`] : []),
      `---------------------------------`,
      `💰 *صافي الراتب المستحق للصرف:* *${data.net_salary.toLocaleString()} ج.م*`,
      `---------------------------------`,
      `✅ مع تحيات إدارة الموارد البشرية والمالية`
    ];
    return lines.join('\n');
  };

  const handleShareWhatsApp = () => {
    const text = encodeURIComponent(generateTextMessage());
    const phone = data.phone ? data.phone.replace(/[^0-9]/g, '') : '';
    const url = phone ? `https://wa.me/${phone}?text=${text}` : `https://api.whatsapp.com/send?text=${text}`;
    window.open(url, '_blank');
  };

  const handleCopyText = () => {
    navigator.clipboard.writeText(generateTextMessage());
    setCopied(true);
    showToast('تم نسخ مفردات الراتب بنجاح! يمكنك لصقها الآن في أي محادثة.', 'success');
    setTimeout(() => setCopied(false), 2000);
  };

  return createPortal(
    <div
      id="payslip-modal-portal"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className="fixed inset-0 z-[9999] bg-slate-900/70 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto animate-in fade-in"
      dir="rtl"
    >
      {/* 🖨️ نمط الطباعة المعزول تماماً: يمنع تكرار القسيمة على 33 صفحة ويضمن طباعة صفحة واحدة نظيفة */}
      <style>{`
        @media print {
          /* 1. إخفاء شجرة التطبيق الأصلية بالكامل حتى لا تحجز أي ارتفاع في المتصفح وتسبب تكرار الصفحات */
          #root {
            display: none !important;
          }

          html, body {
            height: auto !important;
            min-height: 0 !important;
            overflow: visible !important;
            background: #ffffff !important;
            margin: 0 !important;
            padding: 0 !important;
          }

          /* 2. تحييد حاويات المودال وإلغاء التثبيت (Fixed) لمنع تكرار القسيمة على كل صفحة */
          #payslip-modal-portal {
            position: static !important;
            display: block !important;
            width: 100% !important;
            height: auto !important;
            margin: 0 !important;
            padding: 0 !important;
            background: transparent !important;
            overflow: visible !important;
            backdrop-filter: none !important;
            -webkit-backdrop-filter: none !important;
            animation: none !important;
            inset: auto !important;
          }

          #payslip-modal-container {
            position: static !important;
            display: block !important;
            width: 100% !important;
            max-width: 100% !important;
            margin: 0 !important;
            padding: 0 !important;
            border: none !important;
            box-shadow: none !important;
            border-radius: 0 !important;
            background: #ffffff !important;
          }

          /* 3. إخفاء شريط الإجراءات والأزرار */
          .payslip-no-print {
            display: none !important;
          }

          /* 4. كارت القسيمة - تثبيته في صفحة واحدة A4 نظيفة بدقة متناهية ومنع التكرار */
          #printable-payslip-card {
            position: static !important;
            display: block !important;
            width: 100% !important;
            max-width: 100% !important;
            margin: 0 auto !important;
            padding: 24px !important;
            background: #ffffff !important;
            color: #000000 !important;
            border: 2px solid #0f172a !important;
            border-radius: 12px !important;
            box-sizing: border-box !important;
            page-break-inside: avoid !important;
            page-break-after: avoid !important;
            page-break-before: avoid !important;
            break-inside: avoid !important;
            break-after: avoid !important;
            break-before: avoid !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }

          @page {
            size: A4 portrait;
            margin: 10mm;
          }
        }
      `}</style>

      <div
        id="payslip-modal-container"
        className="bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-2xl overflow-hidden p-6 md:p-8 space-y-6 text-right"
      >
        {/* Actions (Hidden in Print) */}
        <div className="flex justify-between items-center border-b pb-4 payslip-no-print flex-wrap gap-2">
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={handlePrint}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow transition active:scale-95"
              title="طباعة قسيمة الراتب (صفحة واحدة فقط)"
            >
              <Printer className="w-4 h-4" /> طباعة القسيمة
            </button>

            <button
              onClick={handleShareWhatsApp}
              className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow transition active:scale-95"
              title="إرسال كشف الراتب للموظف عبر WhatsApp"
            >
              <MessageCircle className="w-4 h-4" /> إرسال WhatsApp
            </button>

            <button
              onClick={handleCopyText}
              className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold flex items-center gap-1.5 border border-slate-200 transition active:scale-95"
              title="نسخ مفردات الراتب كنص"
            >
              <Copy className="w-4 h-4" /> {copied ? 'تم النسخ!' : 'نسخ'}
            </button>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-100 transition"
            title="إغلاق النافذة"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Printable Payslip Card */}
        <PayslipCard data={data} id="printable-payslip-card" />
      </div>
    </div>,
    document.body
  );
};

export default PayslipModal;

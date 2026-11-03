import React from 'react';
import { createPortal } from 'react-dom';
import { Printer, X, Users, CheckCircle2 } from 'lucide-react';
import { PayslipCard, PayslipData } from './PayslipModal';

interface BulkPayslipsModalProps {
  list: any[];
  month: number;
  year: number;
  companyName?: string;
  onClose: () => void;
}

export const BulkPayslipsModal: React.FC<BulkPayslipsModalProps> = ({
  list,
  month,
  year,
  companyName,
  onClose
}) => {
  const handlePrint = () => {
    window.print();
  };

  const payslipsList: PayslipData[] = list.map((emp) => {
    const isEmpObj = Boolean(emp.employees);
    const fullName = emp.full_name || emp.employees?.full_name || emp.employee_name || 'موظف';
    const dept = emp.department && emp.department !== '-' ? emp.department : (emp.employees?.department || undefined);
    const jobTitle = emp.job_title || emp.employees?.position || undefined;
    const phone = emp.phone || emp.employees?.phone || undefined;

    return {
      employee_name: fullName,
      department: dept,
      job_title: jobTitle,
      phone: phone,
      month: month,
      year: year,
      gross_salary: Number(emp.gross_salary || 0),
      effective_days: emp.effective_days,
      effective_salary: emp.effective_salary,
      additions: Number(emp.additions || 0),
      advances_deducted: Number(emp.advances_deducted || 0),
      payroll_tax: Number(emp.payroll_tax || 0),
      social_insurance: Number(emp.social_insurance || 0),
      other_deductions: Number(emp.other_deductions || 0),
      net_salary: Number(emp.net_salary || 0),
      unpaid_leave_days: emp.unpaid_leave_days,
      unpaid_leave_deduction: emp.unpaid_leave_deduction,
      absence_days: emp.absence_days,
      absence_deduction: emp.absence_deduction,
      late_minutes: emp.late_minutes,
      late_deduction: emp.late_deduction,
      penalty_amount: emp.penalty_amount,
      overtime_hours: emp.overtime_hours,
      company_name: companyName
    };
  });

  return createPortal(
    <div
      id="bulk-payslips-portal"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className="fixed inset-0 z-[9999] bg-slate-900/70 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto animate-in fade-in"
      dir="rtl"
    >
      {/* 🖨️ أنماط الطباعة المجمعة: كل موظف في صفحة مستقلة دون أي تكرار */}
      <style>{`
        @media print {
          /* 1. إخفاء شجرة التطبيق الأصلية بالكامل */
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

          /* 2. تحييد الحاويات وإلغاء التثبيت */
          #bulk-payslips-portal {
            position: static !important;
            display: block !important;
            width: 100% !important;
            height: auto !important;
            margin: 0 !important;
            padding: 0 !important;
            background: transparent !important;
            overflow: visible !important;
            backdrop-filter: none !important;
            animation: none !important;
            inset: auto !important;
          }

          #bulk-payslips-container {
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

          /* 3. إخفاء شريط الإجراءات */
          .bulk-no-print {
            display: none !important;
          }

          /* 4. فاصل صفحات إلزامي بعد كل قسيمة موظف */
          .bulk-payslip-page-wrapper {
            position: static !important;
            display: block !important;
            width: 100% !important;
            margin: 0 0 16px 0 !important;
            padding: 0 !important;
            box-sizing: border-box !important;
            page-break-after: always !important;
            break-after: page !important;
            page-break-inside: avoid !important;
            break-inside: avoid !important;
          }

          .bulk-payslip-page-wrapper:last-child {
            page-break-after: avoid !important;
            break-after: avoid !important;
          }

          .printable-card-content {
            border: 2px solid #0f172a !important;
            border-radius: 12px !important;
            padding: 24px !important;
            background: #ffffff !important;
            color: #000000 !important;
            page-break-inside: avoid !important;
            break-inside: avoid !important;
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
        id="bulk-payslips-container"
        className="bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-4xl max-h-[92vh] flex flex-col overflow-hidden text-right"
      >
        {/* Header Actions */}
        <div className="flex justify-between items-center border-b p-5 bulk-no-print flex-wrap gap-3 bg-slate-50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-100 text-blue-700 flex items-center justify-center font-bold">
              <Users className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-black text-slate-900 text-sm md:text-base">
                طباعة كافة قسائم الرواتب دفعة واحدة
              </h3>
              <p className="text-xs text-slate-500 font-medium">
                إجمالي الموظفين: <strong>{payslipsList.length} موظف</strong> (تتم طباعة كل موظف في صفحة A4 مستقلة)
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handlePrint}
              className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold flex items-center gap-2 shadow-lg shadow-blue-600/25 transition active:scale-95"
              title="بدء طباعة كافة القسائم (كل موظف في صفحة مستقلة)"
            >
              <Printer className="w-4 h-4" /> طباعة كافة القسائم ({payslipsList.length})
            </button>
            <button
              onClick={onClose}
              className="text-slate-400 hover:text-slate-600 p-2 rounded-lg hover:bg-slate-200 transition"
              title="إغلاق النافذة"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Scrollable Previews */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1 bg-slate-100/60 print:bg-white print:p-0 print:space-y-0">
          {payslipsList.map((payslip, idx) => (
            <div key={idx} className="bulk-payslip-page-wrapper">
              <div className="bulk-no-print flex items-center justify-between text-xs font-bold text-slate-500 mb-2 px-1">
                <span>قسيمة رقم {idx + 1} من {payslipsList.length} - {payslip.employee_name}</span>
                <span className="flex items-center gap-1 text-emerald-600 font-mono">
                  <CheckCircle2 className="w-3.5 h-3.5" /> الصافي: {payslip.net_salary.toLocaleString()} ج.م
                </span>
              </div>
              <PayslipCard data={payslip} id={`bulk-payslip-${idx}`} />
            </div>
          ))}
        </div>
      </div>
    </div>,
    document.body
  );
};

export default BulkPayslipsModal;

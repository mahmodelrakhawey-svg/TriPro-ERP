import React from 'react';
import { Printer, X, Download, Banknote, Building2, User, Calendar, ShieldCheck } from 'lucide-react';

export interface PayslipData {
  employee_name: string;
  employee_code?: string;
  department?: string;
  job_title?: string;
  month: number;
  year: number;
  gross_salary: number;
  additions: number;
  advances_deducted: number;
  payroll_tax: number;
  other_deductions: number;
  net_salary: number;
  unpaid_leave_days?: number;
  unpaid_leave_deduction?: number;
  absence_days?: number;
  overtime_hours?: number;
  company_name?: string;
}

interface PayslipModalProps {
  data: PayslipData;
  onClose: () => void;
}

export const PayslipModal: React.FC<PayslipModalProps> = ({ data, onClose }) => {
  const handlePrint = () => {
    window.print();
  };

  const monthNames = [
    'يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو',
    'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'
  ];

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto animate-in fade-in">
      <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-2xl overflow-hidden p-6 md:p-8 space-y-6 text-right print:shadow-none print:border-none print:m-0 print:p-0">
        {/* Actions (Hidden in Print) */}
        <div className="flex justify-between items-center border-b pb-4 print:hidden">
          <div className="flex items-center gap-2">
            <button
              onClick={handlePrint}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow transition"
            >
              <Printer className="w-4 h-4" /> طباعة مفردات المرتب
            </button>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 p-1">
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Printable Payslip Card */}
        <div className="space-y-6 border-2 border-slate-800 p-6 rounded-2xl print:border-2 print:border-black">
          {/* Header */}
          <div className="flex justify-between items-start border-b-2 border-slate-800 pb-4">
            <div>
              <h2 className="text-xl font-black text-slate-900">{data.company_name || 'شركة TriPro ERP للأنظمة الإدارية'}</h2>
              <p className="text-xs text-slate-500 font-bold mt-0.5">إدارة الموارد البشرية والرواتب (HR Department)</p>
              <p className="text-[11px] text-slate-400">قسيمة راتب شهر: {monthNames[data.month - 1]} {data.year}</p>
            </div>
            <div className="text-left font-mono">
              <span className="px-3 py-1 bg-slate-900 text-white rounded-lg text-xs font-bold inline-block">
                PAYSLIP / قسيمة راتب
              </span>
              <span className="text-[10px] text-slate-400 block mt-1">تاريخ الإصدار: {new Date().toLocaleDateString('ar-EG')}</span>
            </div>
          </div>

          {/* Employee Details Grid */}
          <div className="grid grid-cols-2 gap-3 bg-slate-50 p-4 rounded-xl border border-slate-200 text-xs">
            <div>
              <span className="text-slate-400 block text-[10px]">اسم الموظف:</span>
              <span className="font-bold text-sm text-slate-900">{data.employee_name}</span>
            </div>
            <div>
              <span className="text-slate-400 block text-[10px]">المسمى الوظيفي / القسم:</span>
              <span className="font-bold text-slate-800">{data.job_title || 'موظف بالشركة'} - {data.department || 'القسم الإداري'}</span>
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
                  <span className="text-slate-600">الراتب الأساسي:</span>
                  <span className="font-mono font-bold">{data.gross_salary.toLocaleString()} ج.م</span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-100 font-medium">
                  <span className="text-slate-600">إضافي ومكافآت:</span>
                  <span className="font-mono font-bold text-emerald-600">+{data.additions.toLocaleString()} ج.م</span>
                </div>
                <div className="flex justify-between py-1.5 font-bold text-slate-900 bg-slate-50 px-2 rounded">
                  <span>إجمالي الاستحقاقات:</span>
                  <span className="font-mono text-emerald-700">{(data.gross_salary + data.additions).toLocaleString()} ج.م</span>
                </div>
              </div>
            </div>

            {/* الاستقطاعات (Deductions) */}
            <div className="space-y-2">
              <h4 className="font-bold text-xs text-rose-800 bg-rose-50 px-3 py-1.5 rounded-lg border border-rose-200">
                2. الاستقطاعات والخصومات (-)
              </h4>
              <div className="space-y-1.5 text-xs">
                <div className="flex justify-between py-1 border-b border-slate-100 font-medium">
                  <span className="text-slate-600">سلف مستقطعة:</span>
                  <span className="font-mono text-rose-600">-{data.advances_deducted.toLocaleString()} ج.م</span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-100 font-medium">
                  <span className="text-slate-600">
                    خصومات وإجازات بدون أجر
                    {data.unpaid_leave_days && data.unpaid_leave_days > 0 ? ` (${data.unpaid_leave_days} يوم)` : ''}:
                  </span>
                  <span className="font-mono text-rose-600">-{data.other_deductions.toLocaleString()} ج.م</span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-100 font-medium">
                  <span className="text-slate-600">ضريبة كسب العمل:</span>
                  <span className="font-mono text-slate-700">-{data.payroll_tax.toLocaleString()} ج.م</span>
                </div>
                <div className="flex justify-between py-1.5 font-bold text-slate-900 bg-slate-50 px-2 rounded">
                  <span>إجمالي الاستقطاعات:</span>
                  <span className="font-mono text-rose-700">
                    -{(data.advances_deducted + data.other_deductions + data.payroll_tax).toLocaleString()} ج.م
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
      </div>
    </div>
  );
};

export default PayslipModal;

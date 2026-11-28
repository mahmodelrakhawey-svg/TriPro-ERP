import React from 'react';
import { Building2, Columns, Info, LayoutGrid, Printer, RotateCcw, User } from 'lucide-react';
import type { PayrollItem } from '../utils/payrollExcelUtils';

export interface PayrollTableSectionProps {
  tableMode: 'detailed' | 'summary';
  onTableModeChange: (mode: 'detailed' | 'summary') => void;
  payrollData: PayrollItem[];
  filteredPayrollData: PayrollItem[];
  isPaid: boolean;
  loading: boolean;
  searchTerm: string;
  onClearSearchTerm: () => void;
  onGrossChange: (employeeId: string, value: number) => void;
  onEffectiveDaysChange: (employeeId: string, days: number) => void;
  onOvertimePayChange: (employeeId: string, value: number) => void;
  onRewardChange: (employeeId: string, value: number) => void;
  onAdditionsChange: (employeeId: string, value: number) => void;
  onAbsenceDaysChange: (employeeId: string, days: number) => void;
  onAbsenceDeductionChange: (employeeId: string, value: number) => void;
  onLateDeductionChange: (employeeId: string, value: number) => void;
  onPenaltyChange: (employeeId: string, value: number) => void;
  onUnpaidLeaveDeductionChange: (employeeId: string, value: number) => void;
  onDeductionChange: (employeeId: string, value: number) => void;
  onTaxChange: (employeeId: string, value: number) => void;
  onSocialInsuranceChange: (employeeId: string, value: number) => void;
  onSelectPayslip: (emp: PayrollItem) => void;
}

/**
 * Renders payroll display mode toggle, editable detailed/summary employee table, and empty states.
 */
export const PayrollTableSection: React.FC<PayrollTableSectionProps> = ({
  tableMode,
  onTableModeChange,
  payrollData,
  filteredPayrollData,
  isPaid,
  loading,
  searchTerm,
  onClearSearchTerm,
  onGrossChange,
  onEffectiveDaysChange,
  onOvertimePayChange,
  onRewardChange,
  onAdditionsChange,
  onAbsenceDaysChange,
  onAbsenceDeductionChange,
  onLateDeductionChange,
  onPenaltyChange,
  onUnpaidLeaveDeductionChange,
  onDeductionChange,
  onTaxChange,
  onSocialInsuranceChange,
  onSelectPayslip,
}) => {
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
      {/* Table Controls Bar */}
      <div className="p-3.5 bg-slate-50/90 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="text-xs font-black text-slate-700">طريقة عرض كشف المسير:</span>
          <div className="flex items-center bg-slate-200/80 p-0.5 rounded-xl border border-slate-300/60">
            <button
              type="button"
              onClick={() => onTableModeChange('detailed')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 ${
                tableMode === 'detailed'
                  ? 'bg-white text-blue-600 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Columns className="w-3.5 h-3.5" />
              <span>عرض تفصيلي (أعمدة مخصصة لكل نوع)</span>
            </button>
            <button
              type="button"
              onClick={() => onTableModeChange('summary')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 ${
                tableMode === 'summary'
                  ? 'bg-white text-blue-600 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <LayoutGrid className="w-3.5 h-3.5" />
              <span>عرض مدمج (ملخص)</span>
            </button>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-500 font-medium">
            {tableMode === 'detailed'
              ? '💡 يمكنك تعديل كل بند من بنود الإضافي والغياب والتأخير والجزاءات مباشرة في عموده الخاص'
              : '💡 يعرض هذا الوضع الإضافي والخصومات مجمعة مع إمكانية التعديل الكلي'}
          </span>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-right border-collapse text-xs">
          <thead>
            {tableMode === 'detailed' ? (
              <tr className="bg-slate-50/75 border-b border-slate-200 text-slate-600 font-bold text-[11px]">
                <th className="p-3 text-right">الموظف</th>
                <th className="p-3 text-center">الفرع / القسم</th>
                <th className="p-3 text-center">الأساسي</th>
                <th className="p-3 text-center text-blue-700 bg-blue-50/40" title="الأيام الفعلية للعمل في الشهر مع مراعاة تاريخ التعيين/الإيقاف/انتهاء الخدمة">أيام فعلية</th>
                <th className="p-3 text-center text-emerald-700 bg-emerald-50/40">أجر الإضافي (+)</th>
                <th className="p-3 text-center text-emerald-700 bg-emerald-50/40">مكافآت (+)</th>
                <th className="p-3 text-center text-rose-700 bg-rose-50/30">خصم غياب (-)</th>
                <th className="p-3 text-center text-amber-700 bg-amber-50/30">خصم تأخير (-)</th>
                <th className="p-3 text-center text-rose-700 bg-rose-50/30">جزاءات (-)</th>
                <th className="p-3 text-center text-purple-700 bg-purple-50/30">إجازات (-)</th>
                <th className="p-3 text-center text-rose-700">السلف (-)</th>
                <th className="p-3 text-center text-rose-700 bg-rose-50/20" title="حصة الموظف المستقطعة من التأمينات الاجتماعية">تأمينات (-)</th>
                <th className="p-3 text-center text-rose-700">الضريبة (-)</th>
                <th className="p-3 text-center text-slate-700 bg-slate-100/60">إجمالي الخصم</th>
                <th className="p-3 text-center bg-emerald-100/60 text-emerald-900 font-black">صافي المستحق</th>
                <th className="p-3 text-center">إجراءات</th>
              </tr>
            ) : (
              <tr className="bg-slate-50/75 border-b border-slate-200 text-slate-600 font-bold">
                <th className="p-3.5">الموظف</th>
                <th className="p-3.5 text-center">الفرع / القسم</th>
                <th className="p-3.5 text-center">الراتب الأساسي</th>
                <th className="p-3.5 text-center">إضافي ومكافآت (+)</th>
                <th className="p-3.5 text-center">السلف (-)</th>
                <th className="p-3.5 text-center">تأمينات (-)</th>
                <th className="p-3.5 text-center">ضريبة كسب عمل (-)</th>
                <th className="p-3.5 text-center">خصومات وجزاءات (-)</th>
                <th className="p-3.5 text-center bg-emerald-50/50 text-emerald-800">صافي المستحق</th>
                <th className="p-3.5 text-center">إجراءات</th>
              </tr>
            )}
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filteredPayrollData.map((emp) => (
              tableMode === 'detailed' ? (
                <tr key={emp.employee_id} className="hover:bg-slate-50/60 transition text-xs">
                  {/* الموظف */}
                  <td className="p-2.5 font-bold text-slate-800">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center font-bold text-xs flex-shrink-0">
                        <User className="w-3.5 h-3.5" />
                      </div>
                      <div>
                        <span className="block whitespace-nowrap">{emp.full_name}</span>
                      </div>
                    </div>
                  </td>

                  {/* الفرع */}
                  <td className="p-2.5 text-center">
                    <span className="px-2 py-0.5 bg-slate-100 text-slate-700 rounded-lg text-[11px] font-bold border border-slate-200 inline-flex items-center gap-1 whitespace-nowrap">
                      <Building2 className="w-3 h-3 text-slate-400" />
                      {emp.department && emp.department !== '-' ? emp.department : 'بدون فرع'}
                    </span>
                  </td>

                  {/* الأساسي */}
                  <td className="p-2.5 text-center">
                    <input
                      type="number"
                      value={emp.gross_salary}
                      onChange={e => onGrossChange(emp.employee_id, Number(e.target.value))}
                      className="w-20 text-center border rounded-lg p-1 font-mono font-bold text-slate-700 bg-white"
                      disabled={isPaid}
                    />
                  </td>

                  {/* ✅ الأيام الفعلية قابلة للتعديل عند الاستثناءات */}
                  <td className="p-2.5 text-center bg-blue-50/20">
                    <div className="flex items-center justify-center gap-1">
                      <input
                        type="number"
                        min="0"
                        max="31"
                        value={emp.effective_days ?? 30}
                        onChange={e => onEffectiveDaysChange(emp.employee_id, Number(e.target.value))}
                        className={`w-12 text-center border rounded-lg p-1 font-mono font-bold text-xs ${
                          (emp.effective_days ?? 30) < 30
                            ? 'bg-amber-50 text-amber-800 border-amber-300'
                            : 'bg-white text-slate-700 border-slate-200'
                        }`}
                        disabled={isPaid}
                        title={`الراتب المستحق فعلاً: ${(emp.effective_salary ?? emp.gross_salary).toLocaleString()} ج.م (تعديل الأيام يعيد احتساب الراتب تلقائياً)`}
                      />
                      <span className="text-[10px] text-slate-400 font-bold">ي</span>
                    </div>
                  </td>

                  {/* أجر الإضافي */}
                  <td className="p-2.5 text-center bg-emerald-50/20">
                    <input
                      type="number"
                      value={emp.overtime_pay}
                      onChange={e => onOvertimePayChange(emp.employee_id, Number(e.target.value))}
                      className="w-20 text-center border rounded-lg p-1 font-mono font-bold text-emerald-600 bg-white"
                      disabled={isPaid}
                    />
                    {emp.overtime_hours > 0 && (
                      <span className="block text-[10px] text-emerald-600 font-semibold mt-0.5">
                        ({emp.overtime_hours} س)
                      </span>
                    )}
                  </td>

                  {/* المكافآت */}
                  <td className="p-2.5 text-center bg-emerald-50/20">
                    <input
                      type="number"
                      value={emp.reward_amount}
                      onChange={e => onRewardChange(emp.employee_id, Number(e.target.value))}
                      className="w-18 text-center border rounded-lg p-1 font-mono font-bold text-emerald-600 bg-white"
                      disabled={isPaid}
                    />
                  </td>

                  {/* خصم غياب */}
                  <td className="p-2.5 text-center bg-rose-50/20">
                    <div className="flex flex-col items-center gap-1">
                      <input
                        type="number"
                        value={emp.absence_deduction}
                        onChange={e => onAbsenceDeductionChange(emp.employee_id, Number(e.target.value))}
                        className="w-20 text-center border rounded-lg p-1 font-mono font-bold text-rose-600 bg-white"
                        disabled={isPaid}
                        title="قيمة خصم الغياب بالجنيه (تعديل المبلغ)"
                      />
                      <div className="flex items-center gap-0.5 text-[11px] text-rose-600 font-semibold">
                        <span>(</span>
                        <input
                          type="number"
                          step="0.5"
                          min="0"
                          value={emp.absence_days}
                          onChange={e => onAbsenceDaysChange(emp.employee_id, Number(e.target.value))}
                          className="w-11 text-center border border-rose-300 rounded px-1 py-0.5 font-mono text-[11px] bg-rose-50 hover:bg-white focus:bg-white text-rose-700 font-bold"
                          title="تعديل عدد أيام الغياب يدوياً (يُعاد احتساب المبلغ تلقائياً)"
                          disabled={isPaid}
                        />
                        <span>يوم)</span>
                      </div>
                    </div>
                  </td>

                  {/* خصم تأخير */}
                  <td className="p-2.5 text-center bg-amber-50/20">
                    <input
                      type="number"
                      value={emp.late_deduction}
                      onChange={e => onLateDeductionChange(emp.employee_id, Number(e.target.value))}
                      className="w-18 text-center border rounded-lg p-1 font-mono font-bold text-amber-600 bg-white"
                      disabled={isPaid}
                    />
                    {(emp.late_minutes || 0) > 0 && (
                      <span className="block text-[10px] text-amber-600 font-semibold mt-0.5">
                        ({emp.late_minutes} د)
                      </span>
                    )}
                  </td>

                  {/* جزاءات إدارية */}
                  <td className="p-2.5 text-center bg-rose-50/20">
                    <input
                      type="number"
                      value={emp.penalty_amount}
                      onChange={e => onPenaltyChange(emp.employee_id, Number(e.target.value))}
                      className="w-18 text-center border rounded-lg p-1 font-mono font-bold text-rose-700 bg-white"
                      disabled={isPaid}
                    />
                  </td>

                  {/* إجازات بدون راتب */}
                  <td className="p-2.5 text-center bg-purple-50/20">
                    <input
                      type="number"
                      value={emp.unpaid_leave_deduction}
                      onChange={e => onUnpaidLeaveDeductionChange(emp.employee_id, Number(e.target.value))}
                      className="w-18 text-center border rounded-lg p-1 font-mono font-bold text-purple-600 bg-white"
                      disabled={isPaid}
                    />
                    {emp.unpaid_leave_days > 0 && (
                      <span className="block text-[10px] text-purple-600 font-semibold mt-0.5">
                        ({emp.unpaid_leave_days} يوم)
                      </span>
                    )}
                  </td>

                  {/* السلف */}
                  <td className="p-2.5 text-center font-mono font-bold text-rose-600">
                    {emp.advances_deducted > 0 ? `-${emp.advances_deducted.toLocaleString()}` : '-'}
                  </td>

                  {/* التأمينات الاجتماعية */}
                  <td className="p-2.5 text-center bg-rose-50/20">
                    <input
                      type="number"
                      value={emp.social_insurance || 0}
                      onChange={e => onSocialInsuranceChange(emp.employee_id, Number(e.target.value))}
                      className="w-16 text-center border rounded-lg p-1 font-mono font-bold text-rose-700 bg-white"
                      disabled={isPaid}
                      title="حصة التأمينات الاجتماعية المستقطعة من الموظف"
                    />
                  </td>

                  {/* الضريبة */}
                  <td className="p-2.5 text-center">
                    <input
                      type="number"
                      value={emp.payroll_tax}
                      onChange={e => onTaxChange(emp.employee_id, Number(e.target.value))}
                      className="w-16 text-center border rounded-lg p-1 font-mono font-bold text-rose-600 bg-white"
                      disabled={isPaid}
                    />
                  </td>

                  {/* إجمالي الخصم */}
                  <td className="p-2.5 text-center font-mono font-bold text-rose-600 bg-slate-50/50">
                    {emp.other_deductions > 0 ? `-${emp.other_deductions.toLocaleString()}` : '0'}
                  </td>

                  {/* صافي المستحق */}
                  <td className="p-2.5 text-center font-mono font-black text-sm text-emerald-700 bg-emerald-50/40">
                    {emp.net_salary.toLocaleString()} ج.م
                  </td>

                  {/* إجراءات */}
                  <td className="p-2.5 text-center">
                    <button
                      onClick={() => onSelectPayslip(emp)}
                      className="px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 border rounded-lg text-[10px] font-bold inline-flex items-center gap-1 transition"
                      title="طباعة قسيمة الراتب"
                    >
                      <Printer className="w-3 h-3 text-blue-600" /> مفردات
                    </button>
                  </td>
                </tr>
              ) : (
                <tr key={emp.employee_id} className="hover:bg-slate-50/60 transition">
                  <td className="p-3.5 font-bold text-slate-800">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center font-bold text-xs">
                        <User className="w-3.5 h-3.5" />
                      </div>
                      <div>
                        <span>{emp.full_name}</span>
                        {(emp.overtime_hours > 0 || (emp.reward_amount || 0) > 0) && (
                          <div className="flex items-center gap-1 mt-0.5 text-[10px] text-emerald-600">
                            {emp.overtime_hours > 0 && <span>إضافي {emp.overtime_hours} س</span>}
                            {(emp.reward_amount || 0) > 0 && <span>• مكافأة {emp.reward_amount} ج</span>}
                          </div>
                        )}
                      </div>
                    </div>
                  </td>

                  <td className="p-3.5 text-center">
                    <span className="px-2.5 py-1 bg-slate-100 text-slate-700 rounded-lg text-xs font-bold border border-slate-200 inline-flex items-center gap-1">
                      <Building2 className="w-3 h-3 text-slate-400" />
                      {emp.department && emp.department !== '-' ? emp.department : 'بدون فرع'}
                    </span>
                  </td>

                  <td className="p-3.5 text-center">
                    <input
                      type="number"
                      value={emp.gross_salary}
                      onChange={e => onGrossChange(emp.employee_id, Number(e.target.value))}
                      className="w-24 text-center border rounded-lg p-1 font-mono font-bold text-slate-700 bg-white"
                      disabled={isPaid}
                    />
                  </td>

                  <td className="p-3.5 text-center">
                    <input
                      type="number"
                      value={emp.additions}
                      onChange={e => onAdditionsChange(emp.employee_id, Number(e.target.value))}
                      className="w-20 text-center border rounded-lg p-1 font-mono font-bold text-emerald-600 bg-white"
                      disabled={isPaid}
                    />
                  </td>

                  <td className="p-3.5 text-center font-mono font-bold text-rose-600">
                    {emp.advances_deducted > 0 ? `-${emp.advances_deducted.toLocaleString()}` : '-'}
                  </td>

                  <td className="p-3.5 text-center">
                    <input
                      type="number"
                      value={emp.social_insurance || 0}
                      onChange={e => onSocialInsuranceChange(emp.employee_id, Number(e.target.value))}
                      className="w-20 text-center border rounded-lg p-1 font-mono font-bold text-rose-700 bg-white"
                      disabled={isPaid}
                      title="تعديل التأمينات الاجتماعية المستقطعة"
                    />
                  </td>

                  <td className="p-3.5 text-center">
                    <input
                      type="number"
                      value={emp.payroll_tax}
                      onChange={e => onTaxChange(emp.employee_id, Number(e.target.value))}
                      className="w-20 text-center border rounded-lg p-1 font-mono font-bold text-rose-600 bg-white"
                      disabled={isPaid}
                    />
                  </td>

                  <td className="p-3.5 text-center">
                    <input
                      type="number"
                      value={emp.other_deductions}
                      onChange={e => onDeductionChange(emp.employee_id, Number(e.target.value))}
                      className="w-20 text-center border rounded-lg p-1 font-mono font-bold text-rose-600 bg-white"
                      disabled={isPaid}
                    />
                    <div className="space-y-0.5 mt-1 text-[10px]">
                      {emp.absence_days > 0 && (
                        <span className="text-rose-600 block font-semibold">
                          غياب: {emp.absence_days} يوم (-{emp.absence_deduction} ج)
                        </span>
                      )}
                      {(emp.late_minutes || 0) > 0 && (
                        <span className="text-amber-600 block font-semibold">
                          تأخير: {emp.late_minutes} د (-{emp.late_deduction} ج)
                        </span>
                      )}
                      {(emp.penalty_amount || 0) > 0 && (
                        <span className="text-rose-700 block font-semibold">
                          جزاءات: (-{emp.penalty_amount} ج)
                        </span>
                      )}
                      {emp.unpaid_leave_days > 0 && (
                        <span className="text-purple-600 block font-semibold">
                          إجازة: {emp.unpaid_leave_days} يوم (-{emp.unpaid_leave_deduction} ج)
                        </span>
                      )}
                    </div>
                  </td>

                  <td className="p-3.5 text-center font-mono font-black text-sm text-emerald-700 bg-emerald-50/30">
                    {emp.net_salary.toLocaleString()} ج.م
                  </td>

                  <td className="p-3.5 text-center">
                    <button
                      onClick={() => onSelectPayslip(emp)}
                      className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 border rounded-lg text-[10px] font-bold inline-flex items-center gap-1 transition"
                      title="طباعة قسيمة الراتب"
                    >
                      <Printer className="w-3 h-3 text-blue-600" /> مفردات
                    </button>
                  </td>
                </tr>
              )
            ))}

            {filteredPayrollData.length === 0 && !loading && (
              <tr>
                <td colSpan={tableMode === 'detailed' ? 16 : 10} className="p-10 text-center text-slate-400 space-y-2">
                  <Info className="w-8 h-8 text-slate-300 mx-auto" />
                  <p className="font-bold text-slate-600">
                    {payrollData.length === 0
                      ? 'لم يتم تجهيز المسير بعد'
                      : searchTerm
                        ? `لا توجد نتائج مطابقة لبحث: "${searchTerm}"`
                        : 'لا يوجد موظفون في هذا الفرع / القسم'}
                  </p>
                  <p className="text-[11px] text-slate-400">
                    {payrollData.length === 0
                      ? 'حدد الشهر والسنة ثم اضغط على "تجهيز واحتساب المسير" لجلب بيانات الموظفين والبدلات والسلف والغياب آلياً.'
                      : searchTerm
                        ? 'تأكد من كتابة اسم الموظف بشكل صحيح، أو اضغط أدناه لمسح نص البحث.'
                        : 'يمكنك اختيار "كل الفروع والأقسام" لعرض كافة موظفي المسير.'}
                  </p>
                  {searchTerm && (
                    <button
                      type="button"
                      onClick={onClearSearchTerm}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 text-blue-600 hover:bg-blue-100 rounded-xl text-xs font-bold transition mt-2"
                    >
                      <RotateCcw className="w-3.5 h-3.5" /> مسح نص البحث
                    </button>
                  )}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

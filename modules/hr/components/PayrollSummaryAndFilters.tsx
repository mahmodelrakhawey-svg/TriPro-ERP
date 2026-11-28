import React from 'react';
import { Building2, Search, X } from 'lucide-react';
import type { PayrollItem, PayrollTotals } from '../utils/payrollExcelUtils';

export interface PayrollSummaryAndFiltersProps {
  payrollData: PayrollItem[];
  filteredPayrollData: PayrollItem[];
  departments: string[];
  selectedDepartment: string;
  onSelectDepartment: (dept: string) => void;
  searchTerm: string;
  onSearchTermChange: (val: string) => void;
  displayedTotals: PayrollTotals;
}

/**
 * Renders search/department filter bar and 7 live payroll summary KPI cards.
 */
export const PayrollSummaryAndFilters: React.FC<PayrollSummaryAndFiltersProps> = ({
  payrollData,
  filteredPayrollData,
  departments,
  selectedDepartment,
  onSelectDepartment,
  searchTerm,
  onSearchTermChange,
  displayedTotals,
}) => {
  return (
    <>
      {/* Search & Department Filters Bar */}
      {payrollData.length > 0 && (
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            {/* حقل البحث باسم الموظف أو الفرع */}
            <div className="relative flex-1 min-w-[280px] max-w-md">
              <Search className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4 pointer-events-none" />
              <input
                type="text"
                value={searchTerm}
                onChange={e => onSearchTermChange(e.target.value)}
                placeholder="بحث باسم الموظف..."
                className="w-full pr-10 pl-9 py-2.5 rounded-xl border border-slate-300 text-xs font-bold text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition shadow-sm bg-slate-50/50"
              />
              {searchTerm && (
                <button
                  type="button"
                  onClick={() => onSearchTermChange('')}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5 rounded-full hover:bg-slate-200 transition"
                  title="مسح نص البحث"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* عداد الموظفين وحالة الفلترة */}
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold px-3 py-1.5 rounded-xl bg-slate-100 text-slate-700 border border-slate-200 flex items-center gap-1.5">
                <span>المعروض:</span>
                <strong className="text-blue-600 font-mono text-sm">{filteredPayrollData.length}</strong>
                <span>من إجمالي</span>
                <strong className="text-slate-800 font-mono">{payrollData.length}</strong>
                <span>موظف</span>
              </span>
              {(searchTerm || selectedDepartment !== 'all') && (
                <button
                  type="button"
                  onClick={() => {
                    onSearchTermChange('');
                    onSelectDepartment('all');
                  }}
                  className="text-xs font-bold text-rose-600 hover:text-rose-800 hover:bg-rose-50 px-2.5 py-1.5 rounded-lg transition"
                >
                  إعادة ضبط الفلاتر
                </button>
              )}
            </div>
          </div>

          {/* فلاتر الأقسام والفروع */}
          {departments.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 pt-2.5 border-t border-slate-100">
              <div className="flex items-center gap-1.5 text-xs font-bold text-slate-700 ml-2">
                <Building2 className="w-4 h-4 text-indigo-600" />
                <span>الفرع / القسم:</span>
              </div>
              <button
                type="button"
                onClick={() => onSelectDepartment('all')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 ${
                  selectedDepartment === 'all'
                    ? 'bg-blue-600 text-white shadow-sm shadow-blue-500/20'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                <span>كل الفروع والأقسام</span>
                <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${selectedDepartment === 'all' ? 'bg-blue-700 text-white' : 'bg-slate-200 text-slate-600'}`}>
                  {payrollData.length}
                </span>
              </button>
              {departments.map((dept) => {
                const count = payrollData.filter(p => (p.department || 'بدون فرع').trim() === dept).length;
                const isSelected = selectedDepartment === dept;
                return (
                  <button
                    key={dept}
                    type="button"
                    onClick={() => onSelectDepartment(dept)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 ${
                      isSelected
                        ? 'bg-blue-600 text-white shadow-sm shadow-blue-500/20'
                        : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                    }`}
                  >
                    <span>{dept}</span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${isSelected ? 'bg-blue-700 text-white' : 'bg-slate-200 text-slate-600'}`}>
                      {count}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Summary Cards */}
      {filteredPayrollData.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-7 gap-3">
          <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-sm">
            <span className="text-[11px] text-slate-500 font-bold block">إجمالي الأساسي</span>
            <span className="text-sm font-black text-slate-800 font-mono mt-1 block">
              {displayedTotals.gross.toLocaleString()} ج.م
            </span>
          </div>

          <div className="bg-white p-3.5 rounded-2xl border border-emerald-100 shadow-sm">
            <span className="text-[11px] text-emerald-700 font-bold block">إجمالي الإضافي (+)</span>
            <span className="text-sm font-black text-emerald-600 font-mono mt-1 block">
              +{displayedTotals.additions.toLocaleString()} ج.م
            </span>
          </div>

          <div className="bg-white p-3.5 rounded-2xl border border-rose-100 shadow-sm">
            <span className="text-[11px] text-rose-700 font-bold block">السلف المستقطعة (-)</span>
            <span className="text-sm font-black text-rose-600 font-mono mt-1 block">
              -{displayedTotals.advances.toLocaleString()} ج.م
            </span>
          </div>

          <div className="bg-white p-3.5 rounded-2xl border border-rose-100 shadow-sm">
            <span className="text-[11px] text-rose-700 font-bold block">الخصومات والجزاءات (-)</span>
            <span className="text-sm font-black text-rose-600 font-mono mt-1 block">
              -{displayedTotals.deductions.toLocaleString()} ج.م
            </span>
          </div>

          <div className="bg-white p-3.5 rounded-2xl border border-rose-100 shadow-sm">
            <span className="text-[11px] text-rose-700 font-bold block">تأمينات اجتماعية (-)</span>
            <span className="text-sm font-black text-rose-600 font-mono mt-1 block">
              -{displayedTotals.insurance.toLocaleString()} ج.م
            </span>
          </div>

          <div className="bg-white p-3.5 rounded-2xl border border-rose-100 shadow-sm">
            <span className="text-[11px] text-rose-700 font-bold block">ضريبة كسب العمل (-)</span>
            <span className="text-sm font-black text-rose-600 font-mono mt-1 block">
              -{displayedTotals.taxes.toLocaleString()} ج.م
            </span>
          </div>

          <div className="bg-emerald-50 p-3.5 rounded-2xl border border-emerald-200 shadow-sm">
            <span className="text-[11px] text-emerald-800 font-bold block">صافي الرواتب المستحق</span>
            <span className="text-base font-black text-emerald-700 font-mono mt-1 block">
              {displayedTotals.net.toLocaleString()} ج.م
            </span>
          </div>
        </div>
      )}
    </>
  );
};

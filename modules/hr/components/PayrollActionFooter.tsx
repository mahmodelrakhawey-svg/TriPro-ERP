import React from 'react';
import {
  Banknote,
  CheckCircle2,
  FileSpreadsheet,
  FileUp,
  Loader2,
  Printer,
  RotateCcw,
  Save,
  Wallet,
} from 'lucide-react';

export interface PayrollActionFooterProps {
  totalEmployees: number;
  filteredCount: number;
  totalNet: number;
  payrollStatus?: 'paid' | 'accrued' | string | null;
  importingExcel: boolean;
  savingAccrual: boolean;
  savingPayment: boolean;
  cancellingAccrual: boolean;
  onShowBulkPayslips: () => void;
  onExportExcel: () => void;
  onTriggerImportExcel: () => void;
  onRunAccrual: () => void;
  onCancelAccrual: () => void;
  onPayAccrued: () => void;
  onRunPayrollDirect: () => void;
}

/**
 * Renders the bottom payroll action bar: print, Excel import/export, accrual, cancel, and disbursement actions.
 */
export const PayrollActionFooter: React.FC<PayrollActionFooterProps> = ({
  totalEmployees,
  filteredCount,
  totalNet,
  payrollStatus,
  importingExcel,
  savingAccrual,
  savingPayment,
  cancellingAccrual,
  onShowBulkPayslips,
  onExportExcel,
  onTriggerImportExcel,
  onRunAccrual,
  onCancelAccrual,
  onPayAccrued,
  onRunPayrollDirect,
}) => {
  if (totalEmployees <= 0) return null;

  return (
    <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-wrap justify-between items-center gap-4">
      <div className="text-xs text-slate-600 flex items-center gap-2">
        <CheckCircle2 className="w-4 h-4 text-emerald-600" />
        <span>
          إجمالي الموظفين: <strong>{totalEmployees}</strong> | إجمالي صافي الرواتب:{' '}
          <strong className="text-emerald-700 font-mono text-sm">{totalNet.toLocaleString()} ج.م</strong>
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={onShowBulkPayslips}
          className="bg-slate-800 hover:bg-slate-900 text-white px-4 py-2.5 rounded-xl font-bold text-xs flex items-center gap-1.5 shadow-md shadow-slate-800/20 transition active:scale-95"
          title="طباعة قسائم الرواتب لجميع موظفي المسير دفعة واحدة (كل موظف في صفحة A4 مستقلة)"
        >
          <Printer className="w-4 h-4 text-sky-400" />
          <span>طباعة كافة القسائم ({filteredCount})</span>
        </button>

        <button
          type="button"
          onClick={onExportExcel}
          className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2.5 rounded-xl font-bold text-xs flex items-center gap-1.5 shadow-md shadow-emerald-600/20 transition active:scale-95"
          title="تصدير مسير الرواتب إلى Excel"
        >
          <FileSpreadsheet className="w-4 h-4" />
          <span>تصدير Excel</span>
        </button>

        {payrollStatus !== 'paid' && (
          <button
            type="button"
            onClick={onTriggerImportExcel}
            disabled={importingExcel}
            className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white px-4 py-2.5 rounded-xl font-bold text-xs flex items-center gap-1.5 shadow-md shadow-indigo-600/20 transition active:scale-95"
            title="استيراد التعديلات من ملف Excel وتطبيقها على المسير"
          >
            {importingExcel ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileUp className="w-4 h-4" />}
            <span>استيراد من Excel</span>
          </button>
        )}

        {payrollStatus === 'paid' ? (
          <div className="flex items-center gap-2 bg-emerald-50 text-emerald-800 border border-emerald-200 px-5 py-2.5 rounded-xl text-xs font-bold">
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            تم صرف هذا المسير وترحيل قيد النقدية بالكامل ✅
          </div>
        ) : payrollStatus === 'accrued' ? (
          <>
            <button
              onClick={onRunAccrual}
              disabled={savingAccrual || savingPayment || cancellingAccrual}
              className="bg-slate-100 hover:bg-slate-200 text-slate-700 px-4 py-2.5 rounded-xl font-bold text-xs flex items-center gap-1.5 border border-slate-300 transition"
              title="إعادة احتساب وتحديث قيد الاستحقاق بقيم المسير المعروضة"
            >
              {savingAccrual ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
              تحديث قيد الاستحقاق
            </button>

            <button
              onClick={onCancelAccrual}
              disabled={cancellingAccrual || savingAccrual || savingPayment}
              className="bg-rose-50 hover:bg-rose-100 text-rose-700 px-4 py-2.5 rounded-xl font-bold text-xs flex items-center gap-1.5 border border-rose-200 transition"
              title="إلغاء قيد الاستحقاق وحذف القيد وإعادة جميع السلف كـ قائمة"
            >
              {cancellingAccrual ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RotateCcw className="w-3.5 h-3.5" />}
              إلغاء الاستحقاق وإعادة ضبط السلف
            </button>

            <button
              onClick={onPayAccrued}
              disabled={savingPayment || savingAccrual || cancellingAccrual}
              className="bg-emerald-600 hover:bg-emerald-700 text-white px-6 py-2.5 rounded-xl font-bold text-xs flex items-center gap-2 shadow-lg shadow-emerald-600/25 transition"
            >
              {savingPayment ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wallet className="w-4 h-4" />}
              {savingPayment ? 'جاري تنفيذ قيد الصرف...' : 'صرف الرواتب وترحيل قيد النقدية (حـ/ 2251 ← الخزينة/البنك)'}
            </button>
          </>
        ) : (
          <>
            <button
              onClick={onRunAccrual}
              disabled={savingAccrual || savingPayment}
              className="bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-2.5 rounded-xl font-bold text-xs flex items-center gap-2 shadow-lg shadow-indigo-600/25 transition"
            >
              {savingAccrual ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              {savingAccrual ? 'جاري ترحيل الاستحقاق...' : 'إثبات قيد الاستحقاق (حـ/ 2251 رواتب مستحقة)'}
            </button>

            <button
              onClick={onRunPayrollDirect}
              disabled={savingPayment || savingAccrual}
              className="bg-emerald-600 hover:bg-emerald-700 text-white px-6 py-2.5 rounded-xl font-bold text-xs flex items-center gap-2 shadow-lg shadow-emerald-600/25 transition"
            >
              {savingPayment ? <Loader2 className="w-4 h-4 animate-spin" /> : <Banknote className="w-4 h-4" />}
              {savingPayment ? 'جاري الصرف المباشر...' : 'صرف نقدي مباشر (بديل بدون قيد استحقاق)'}
            </button>
          </>
        )}
      </div>
    </div>
  );
};

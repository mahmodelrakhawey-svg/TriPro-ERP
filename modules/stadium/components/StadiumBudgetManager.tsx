import React, { useState, useEffect } from 'react';
import { supabase } from '@/supabaseClient';
import { useAccounting } from '@/context/AccountingContext';
import toast from 'react-hot-toast';
import {
  PieChart,
  Plus,
  Edit,
  Trash2,
  TrendingDown,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Download,
  Calendar,
  X,
  FileSpreadsheet,
} from 'lucide-react';
import * as XLSX from 'xlsx';
import {
  StadiumBudget,
  StadiumExpenseCategory,
  EXPENSE_CATEGORY_LABELS,
  DEFAULT_STADIUM_ACCOUNTING,
} from '../stadium.types';

export const StadiumBudgetManager: React.FC = () => {
  const { currentUser, organization, currentSelectedOrgId } = useAccounting();
  const orgId = currentSelectedOrgId || (currentUser as any)?.organization_id || (organization as any)?.id;

  const [fiscalYear, setFiscalYear] = useState<number>(new Date().getFullYear());
  const [budgets, setBudgets] = useState<StadiumBudget[]>([]);
  const [loading, setLoading] = useState(true);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingBudget, setEditingBudget] = useState<StadiumBudget | null>(null);

  const [formData, setFormData] = useState({
    category: 'maintenance' as StadiumExpenseCategory,
    expense_account_code: '5101',
    allocated_amount: 100000,
    notes: '',
  });

  const categoryAccountMapping: Record<StadiumExpenseCategory, string> = {
    maintenance: '5101',
    supplies: '5102',
    tournaments: '5103',
    utilities: '5104',
    coaches: '5201',
    admin: '5301',
    other: '539',
  };

  const fetchBudgetsAndSpent = async () => {
    if (!orgId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      // 1. Fetch budget allocations
      const { data: budgetData, error: bErr } = await supabase
        .from('stadium_budgets')
        .select('*')
        .eq('organization_id', orgId)
        .eq('fiscal_year', fiscalYear);

      if (bErr) {
        console.warn('Budgets query warning:', bErr);
      }

      // 2. Fetch actual spent from journal entries for the fiscal year
      const startDate = `${fiscalYear}-01-01`;
      const endDate = `${fiscalYear}-12-31`;

      const { data: entries, error: jErr } = await supabase
        .from('journal_entries')
        .select('id, transaction_date, status, journal_lines(debit, credit, accounts:account_id(code))')
        .eq('organization_id', orgId)
        .gte('transaction_date', startDate)
        .lte('transaction_date', endDate);

      if (jErr) {
        console.warn('Journal entries query warning:', jErr);
      }

      const spentByCode: Record<string, number> = {};
      (entries || []).forEach((entry: any) => {
        (entry.journal_lines || []).forEach((line: any) => {
          const code = line.accounts?.code;
          if (code && Number(line.debit) > 0) {
            spentByCode[code] = (spentByCode[code] || 0) + Number(line.debit);
          }
        });
      });

      // Map spent into budgets
      const merged = (budgetData || []).map(b => {
        const spent = spentByCode[b.expense_account_code] || 0;
        return {
          ...b,
          spent_amount: spent,
        };
      });

      setBudgets(merged);
    } catch (err: any) {
      console.warn(err);
    } finally {
      setLoading(false);
    }

  };

  const seedDefaultBudgets = async () => {
    if (!orgId) return;
    const defaults: { category: StadiumExpenseCategory; code: string; amount: number; notes: string }[] = [
      { category: 'maintenance', code: '5101', amount: 150000, notes: 'موازنة صيانة نجيل الملاعب والمباني' },
      { category: 'supplies', code: '5102', amount: 50000, notes: 'موازنة الأدوات والمهمات الرياضية' },
      { category: 'tournaments', code: '5103', amount: 100000, notes: 'موازنة تنظيم الدوريات والمهرجانات والعهد' },
      { category: 'utilities', code: '5104', amount: 80000, notes: 'فواتير الكهرباء والمياه وتشغيل المرافق' },
      { category: 'coaches', code: '5201', amount: 120000, notes: 'مستحقات وعمولات المدربين والكوادر' },
      { category: 'admin', code: '5301', amount: 40000, notes: 'مصروفات إدارية وعمومية ومطبوعات' },
      { category: 'other', code: '539', amount: 30000, notes: 'مصروفات ضيافة وطوارئ متنوعة' },
    ];

    const records = defaults.map(d => ({
      organization_id: orgId,
      fiscal_year: fiscalYear,
      category: d.category,
      expense_account_code: d.code,
      allocated_amount: d.amount,
      spent_amount: 0,
      notes: d.notes,
    }));

    const { error } = await supabase.from('stadium_budgets').upsert(records, { onConflict: 'organization_id,fiscal_year,category' });
    if (error) {
      toast.error('حدث خطأ أثناء حفظ بنود الموازنة الافتراضية');
    } else {
      toast.success('تم إنشاء بنود الموازنة السنوية المعتمدة بنجاح!');
      fetchBudgetsAndSpent();
    }
  };

  useEffect(() => {
    fetchBudgetsAndSpent();
  }, [orgId, fiscalYear]);


  const handleSaveBudget = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!orgId) return;

    try {
      const payload = {
        organization_id: orgId,
        fiscal_year: fiscalYear,
        category: formData.category,
        expense_account_code: categoryAccountMapping[formData.category] || formData.expense_account_code,
        allocated_amount: Number(formData.allocated_amount) || 0,
        notes: formData.notes?.trim() || null,
      };

      if (editingBudget) {
        const { error } = await supabase
          .from('stadium_budgets')
          .update(payload)
          .eq('id', editingBudget.id);
        if (error) throw error;
        toast.success('تم تحديث مخصص البند بنجاح');
      } else {
        const { error } = await supabase
          .from('stadium_budgets')
          .upsert([payload], { onConflict: 'organization_id,fiscal_year,category' });
        if (error) throw error;
        toast.success('تم حفظ مخصص البند بنجاح');
      }

      setIsModalOpen(false);
      fetchBudgetsAndSpent();
    } catch (err: any) {
      console.error(err);
      toast.error('حدث خطأ أثناء الحفظ');
    }
  };

  const openAdd = () => {
    setEditingBudget(null);
    const existingCategories = new Set(budgets.map(b => b.category));
    const availableCat = (Object.keys(categoryAccountMapping) as StadiumExpenseCategory[]).find(c => !existingCategories.has(c)) || 'maintenance';
    setFormData({
      category: availableCat,
      expense_account_code: categoryAccountMapping[availableCat] || '5101',
      allocated_amount: 50000,
      notes: '',
    });
    setIsModalOpen(true);
  };


  const openEdit = (b: StadiumBudget) => {
    setEditingBudget(b);
    setFormData({
      category: b.category,
      expense_account_code: b.expense_account_code,
      allocated_amount: b.allocated_amount,
      notes: b.notes || '',
    });
    setIsModalOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('هل أنت متأكد من حذف هذا البند من الموازنة؟')) return;
    const { error } = await supabase.from('stadium_budgets').delete().eq('id', id);
    if (!error) {
      toast.success('تم الحذف بنجاح');
      fetchBudgetsAndSpent();
    }
  };

  const totalAllocated = budgets.reduce((sum, b) => sum + Number(b.allocated_amount), 0);
  const totalSpent = budgets.reduce((sum, b) => sum + Number(b.spent_amount), 0);
  const totalRemaining = totalAllocated - totalSpent;
  const overallPercentage = totalAllocated > 0 ? Math.round((totalSpent / totalAllocated) * 100) : 0;

  const exportToExcel = () => {
    const rows = budgets.map(b => {
      const remaining = Number(b.allocated_amount) - Number(b.spent_amount);
      const pct = Number(b.allocated_amount) > 0 ? ((Number(b.spent_amount) / Number(b.allocated_amount)) * 100).toFixed(1) : '0';
      return {
        'السنة المالية': b.fiscal_year,
        'البند': EXPENSE_CATEGORY_LABELS[b.category] || b.category,
        'كود الحساب': b.expense_account_code,
        'المعتمد بالموازنة (ج.م)': b.allocated_amount,
        'المنصرف الفعلي (ج.م)': b.spent_amount,
        'المتبقي من المخصص (ج.م)': remaining,
        'نسبة الاستهلاك': `${pct}%`,
        'ملاحظات': b.notes || '—',
      };
    });

    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, `موازنة_${fiscalYear}`);
    XLSX.writeFile(wb, `الموازنة_التقديرية_للاستاد_${fiscalYear}.xlsx`);
  };

  return (
    <div className="p-6 bg-gray-50 dark:bg-gray-900 min-h-screen text-right" dir="rtl">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
            <PieChart className="w-7 h-7 text-emerald-600 dark:text-emerald-400" />
            الموازنة التقديرية للاستاد والمركز الرياضي (Budget vs Actual)
          </h1>
          <p className="text-xs text-gray-500 mt-1">متابعة المخصصات السنوية المعتمدة ومقارنتها بالمنصرف الفعلي لكل بند</p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* Year selector */}
          <div className="flex items-center gap-2 bg-white dark:bg-gray-800 px-3 py-1.5 rounded-xl border dark:border-gray-700 shadow-sm text-xs font-bold">
            <Calendar className="w-4 h-4 text-gray-400" />
            <span>السنة المالية:</span>
            <select
              value={fiscalYear}
              onChange={(e) => setFiscalYear(Number(e.target.value))}
              className="bg-transparent border-none outline-none font-mono text-emerald-600 dark:text-emerald-400 font-bold"
            >
              {[2025, 2026, 2027, 2028].map(y => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </div>

          <button
            onClick={exportToExcel}
            className="flex items-center gap-2 bg-white dark:bg-gray-800 hover:bg-gray-100 text-gray-700 dark:text-gray-200 border dark:border-gray-700 px-3 py-2 rounded-xl text-xs font-semibold shadow-sm transition"
          >
            <Download className="w-4 h-4" />
            تصدير لـ Excel
          </button>

          <button
            onClick={openAdd}
            className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-xl text-xs font-bold shadow-sm transition"
          >
            <Plus className="w-4 h-4" />
            إضافة بند موازنة
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-white dark:bg-gray-800 p-5 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700">
          <p className="text-xs text-gray-500 font-medium">إجمالي الموازنة المعتمدة</p>
          <p className="text-2xl font-bold text-gray-900 dark:text-gray-100 font-mono mt-1">
            {totalAllocated.toLocaleString('ar-EG')} <span className="text-xs font-normal text-gray-400">ج.م</span>
          </p>
        </div>

        <div className="bg-white dark:bg-gray-800 p-5 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700">
          <p className="text-xs text-gray-500 font-medium">إجمالي المنصرف الفعلي</p>
          <p className="text-2xl font-bold text-red-600 dark:text-red-400 font-mono mt-1">
            {totalSpent.toLocaleString('ar-EG')} <span className="text-xs font-normal text-gray-400">ج.م</span>
          </p>
        </div>

        <div className="bg-white dark:bg-gray-800 p-5 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700">
          <p className="text-xs text-gray-500 font-medium">المتبقي من الموازنة</p>
          <p className={`text-2xl font-bold font-mono mt-1 ${totalRemaining >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600'}`}>
            {totalRemaining.toLocaleString('ar-EG')} <span className="text-xs font-normal text-gray-400">ج.م</span>
          </p>
        </div>

        <div className="bg-white dark:bg-gray-800 p-5 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700">
          <div className="flex justify-between items-center text-xs">
            <span className="text-gray-500 font-medium">نسبة الاستهلاك العام</span>
            <span className="font-bold text-emerald-600 font-mono">{overallPercentage}%</span>
          </div>
          <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2.5 mt-3 overflow-hidden">
            <div
              className={`h-2.5 rounded-full transition-all duration-500 ${
                overallPercentage > 100 ? 'bg-red-600' : overallPercentage > 80 ? 'bg-amber-500' : 'bg-emerald-500'
              }`}
              style={{ width: `${Math.min(overallPercentage, 100)}%` }}
            ></div>
          </div>
        </div>
      </div>

      {/* Budget Table */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-right text-sm">
            <thead className="bg-gray-50 dark:bg-gray-900/50 border-b dark:border-gray-700">
              <tr>
                <th className="px-5 py-3.5 font-semibold text-gray-600 dark:text-gray-300">البند والمصروف</th>
                <th className="px-5 py-3.5 font-semibold text-gray-600 dark:text-gray-300">كود الحساب</th>
                <th className="px-5 py-3.5 font-semibold text-gray-600 dark:text-gray-300">المعتمد بالموازنة (ج.م)</th>
                <th className="px-5 py-3.5 font-semibold text-gray-600 dark:text-gray-300">المنصرف الفعلي (ج.م)</th>
                <th className="px-5 py-3.5 font-semibold text-gray-600 dark:text-gray-300">المتبقي من المخصص</th>
                <th className="px-5 py-3.5 font-semibold text-gray-600 dark:text-gray-300">نسبة الاستهلاك</th>
                <th className="px-5 py-3.5 font-semibold text-gray-600 dark:text-gray-300 text-center">إجراءات</th>
              </tr>
            </thead>
            <tbody className="divide-y dark:divide-gray-700 text-xs">
              {loading ? (
                <tr>
                  <td colSpan={7} className="text-center py-10 text-gray-400">جاري تحميل بيانات الموازنة...</td>
                </tr>
              ) : budgets.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-12">
                    <div className="flex flex-col items-center justify-center gap-3">
                      <PieChart className="w-12 h-12 text-gray-300 dark:text-gray-600" />
                      <div className="text-sm font-bold text-gray-600 dark:text-gray-300">
                        لم يتم إدخال بنود الموازنة المعتمدة لسنة {fiscalYear} بعد
                      </div>
                      <p className="text-xs text-gray-400 max-w-md">
                        يمكنك إضافة بنود الموازنة يدوياً بنداً ببند، أو توليد البنود القياسية السنوية للاستاد (صيانة، أدوات، بطولات، مرافق، كوادر) بنقرة واحدة.
                      </p>
                      <div className="flex gap-2 mt-2">
                        <button
                          onClick={seedDefaultBudgets}
                          className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-xl text-xs font-bold shadow transition flex items-center gap-1.5"
                        >
                          <Plus className="w-4 h-4" />
                          توليد بنود الموازنة السنوية المقترحة تلقائياً
                        </button>
                        <button
                          onClick={openAdd}
                          className="bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 text-gray-700 dark:text-gray-200 px-4 py-2 rounded-xl text-xs font-bold transition"
                        >
                          إضافة بند مخصص يدوياً
                        </button>
                      </div>
                    </div>
                  </td>
                </tr>
              ) : (

                budgets.map((b) => {
                  const rem = Number(b.allocated_amount) - Number(b.spent_amount);
                  const pct = Number(b.allocated_amount) > 0 ? Math.round((Number(b.spent_amount) / Number(b.allocated_amount)) * 100) : 0;
                  return (
                    <tr key={b.id} className="hover:bg-gray-50 dark:hover:bg-gray-750">
                      <td className="px-5 py-3.5">
                        <div className="font-bold text-gray-900 dark:text-gray-100">{EXPENSE_CATEGORY_LABELS[b.category] || b.category}</div>
                        {b.notes && <div className="text-[10px] text-gray-400">{b.notes}</div>}
                      </td>
                      <td className="px-5 py-3.5 font-mono text-gray-500 font-bold">{b.expense_account_code}</td>
                      <td className="px-5 py-3.5 font-bold font-mono text-gray-900 dark:text-gray-100">
                        {Number(b.allocated_amount).toLocaleString('ar-EG')} ج.م
                      </td>
                      <td className="px-5 py-3.5 font-bold font-mono text-red-600 dark:text-red-400">
                        {Number(b.spent_amount).toLocaleString('ar-EG')} ج.م
                      </td>
                      <td className={`px-5 py-3.5 font-bold font-mono ${rem >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600'}`}>
                        {rem.toLocaleString('ar-EG')} ج.م
                      </td>
                      <td className="px-5 py-3.5 w-44">
                        <div className="flex items-center gap-2">
                          <div className="flex-1 bg-gray-200 dark:bg-gray-700 rounded-full h-2 overflow-hidden">
                            <div
                              className={`h-2 rounded-full ${pct > 100 ? 'bg-red-600' : pct > 80 ? 'bg-amber-500' : 'bg-emerald-500'}`}
                              style={{ width: `${Math.min(pct, 100)}%` }}
                            ></div>
                          </div>
                          <span className="font-bold font-mono text-[11px] w-10 text-left">{pct}%</span>
                        </div>
                      </td>
                      <td className="px-5 py-3.5">
                        <div className="flex gap-2 justify-center">
                          <button onClick={() => openEdit(b)} className="p-1 text-blue-600 hover:bg-blue-50 rounded">
                            <Edit className="w-4 h-4" />
                          </button>
                          <button onClick={() => handleDelete(b.id)} className="p-1 text-red-600 hover:bg-red-50 rounded">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add/Edit Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-md overflow-hidden p-6 text-xs">
            <div className="flex justify-between items-center pb-3 mb-4 border-b dark:border-gray-800">
              <h3 className="text-base font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
                <PieChart className="w-5 h-5 text-emerald-600" />
                {editingBudget ? 'تعديل مخصص بند في الموازنة' : 'إضافة مخصص بند جديد في الموازنة'}
              </h3>
              <button onClick={() => setIsModalOpen(false)} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveBudget} className="space-y-4">
              <div>
                <label className="block font-bold mb-1">تصنيف وبند المصروف *</label>
                <select
                  value={formData.category}
                  onChange={(e) => setFormData({
                    ...formData,
                    category: e.target.value as StadiumExpenseCategory,
                    expense_account_code: categoryAccountMapping[e.target.value as StadiumExpenseCategory] || '5101',
                  })}
                  className="w-full p-2 border rounded-xl dark:bg-gray-800 dark:border-gray-700"
                >
                  {Object.entries(EXPENSE_CATEGORY_LABELS).map(([k, v]) => (
                    <option key={k} value={k}>{String(v)}</option>
                  ))}

                </select>
              </div>

              <div>
                <label className="block font-bold mb-1">المبلغ المعتمد في الموازنة (ج.م) *</label>
                <input
                  type="number"
                  step="0.01"
                  required
                  value={formData.allocated_amount}
                  onChange={(e) => setFormData({ ...formData, allocated_amount: Number(e.target.value) })}
                  className="w-full p-2 border rounded-xl dark:bg-gray-800 dark:border-gray-700 font-bold font-mono text-emerald-600 text-sm"
                />
              </div>

              <div>
                <label className="block font-bold mb-1">ملاحظات واعتماد المخصص</label>
                <textarea
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  rows={2}
                  placeholder="رقم قرار مجلس الإدارة أو إشعار الاعتماد المالي..."
                  className="w-full p-2 border rounded-xl dark:bg-gray-800 dark:border-gray-700"
                />
              </div>

              <div className="flex justify-end gap-3 pt-3 border-t dark:border-gray-800">
                <button type="button" onClick={() => setIsModalOpen(false)} className="px-4 py-2 border rounded-xl text-gray-600 hover:bg-gray-100">إلغاء</button>
                <button type="submit" className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold shadow transition">حفظ المخصص</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default StadiumBudgetManager;

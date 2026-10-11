import { logger } from '../../../utils/logger';
import React, { useState, useEffect } from 'react';
import { useAccounting } from '../../../context/AccountingContext';
import { useToast } from '../../../context/ToastContext';
import {
  hrEnterpriseService,
  HrPenaltyReward
} from '../../../services/hrEnterpriseService';
import {
  ShieldAlert,
  Award,
  AlertTriangle,
  Plus,
  Trash2,
  CheckCircle2,
  Calendar,
  User,
  X,
  DollarSign,
  FileText,
  Filter,
  Pencil,
  Building2
} from 'lucide-react';

export const PenaltiesAndRewards: React.FC = () => {
  const { currentSelectedOrgId, currentUser, employees } = useAccounting();
  const { showToast } = useToast();

  const [items, setItems] = useState<HrPenaltyReward[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'ALL' | 'PENALTY' | 'REWARD' | 'WARNING'>('ALL');
  const [departmentFilter, setDepartmentFilter] = useState<string>('ALL');

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<HrPenaltyReward | null>(null);
  const [formType, setFormType] = useState<'PENALTY' | 'REWARD' | 'WARNING'>('PENALTY');
  const [formEmpId, setFormEmpId] = useState('');
  const [formCategory, setFormCategory] = useState('تأخير متكرر');
  const [formReason, setFormReason] = useState('');
  const [formAmountType, setFormAmountType] = useState<'DAYS' | 'FIXED_AMOUNT'>('DAYS');
  const [formAmountValue, setFormAmountValue] = useState<number>(1);
  const [formActionDate, setFormActionDate] = useState(new Date().toISOString().split('T')[0]);
  const [saving, setSaving] = useState(false);

  const orgId = currentSelectedOrgId || (currentUser as any)?.organization_id;

  const loadData = async () => {
    setLoading(true);
    try {
      const data = await hrEnterpriseService.getPenaltiesRewards(orgId);
      setItems(data);
    } catch (e) {
      logger.warn('Load penalties error:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [orgId]);

  const handleOpenCreate = () => {
    setEditingItem(null);
    setFormEmpId(employees[0]?.id || '');
    setFormType('PENALTY');
    setFormCategory('تأخير متكرر');
    setFormReason('');
    setFormAmountType('DAYS');
    setFormAmountValue(1);
    setFormActionDate(new Date().toISOString().split('T')[0]);
    setIsModalOpen(true);
  };

  const handleOpenEdit = (item: HrPenaltyReward) => {
    setEditingItem(item);
    setFormEmpId(item.employee_id);
    setFormType(item.type);
    setFormCategory(item.category || '');
    setFormReason(item.reason || '');
    setFormAmountType(item.amount_type || 'DAYS');
    setFormAmountValue(item.amount_value ?? 1);
    setFormActionDate(item.action_date || new Date().toISOString().split('T')[0]);
    setIsModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formEmpId || !formReason.trim()) {
      showToast('يرجى اختيار الموظف وكتابة سبب القرار', 'warning');
      return;
    }

    const selectedEmp = employees.find(e => e.id === formEmpId);
    const basicSal = Number(selectedEmp?.basic_salary || 0);

    setSaving(true);
    try {
      await hrEnterpriseService.savePenaltyReward(
        {
          id: editingItem?.id,
          employee_id: formEmpId,
          employee_name: selectedEmp?.full_name || selectedEmp?.name || editingItem?.employee_name,
          employee_department: selectedEmp?.department || editingItem?.employee_department,
          type: formType,
          category: formCategory,
          reason: formReason,
          amount_type: formAmountType,
          amount_value: formAmountValue,
          action_date: formActionDate,
          payroll_month: new Date(formActionDate).getMonth() + 1,
          payroll_year: new Date(formActionDate).getFullYear(),
          status: editingItem?.status || 'APPROVED'
        },
        basicSal,
        orgId
      );

      showToast(
        editingItem
          ? 'تم تعديل وتحديث القرار بنجاح ⚖️✏️'
          : 'تم اعتماد وتسجيل القرار بنجاح وسيتم ربطه تلقائياً بالمسير ⚖️✅',
        'success'
      );
      setIsModalOpen(false);
      setEditingItem(null);
      setFormReason('');
      setFormAmountValue(1);
      loadData();
    } catch (e: any) {
      showToast('خطأ: ' + e.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('هل أنت متأكد من إلغاء هذا القرار؟')) return;
    try {
      await hrEnterpriseService.deletePenaltyReward(id);
      showToast('تم إلغاء السجل بنجاح 🗑️', 'success');
      loadData();
    } catch (e: any) {
      showToast('خطأ: ' + e.message, 'error');
    }
  };

  const departments = React.useMemo(() => {
    const depts = new Set<string>();
    employees.forEach(e => {
      if (e.department?.trim()) depts.add(e.department.trim());
    });
    items.forEach(i => {
      if (i.employee_department?.trim()) depts.add(i.employee_department.trim());
    });
    return Array.from(depts);
  }, [employees, items]);

  const filteredItems = items.filter(i => {
    const matchesTab = activeTab === 'ALL' ? true : i.type === activeTab;
    if (!matchesTab) return false;
    if (departmentFilter !== 'ALL') {
      const emp = employees.find(e => e.id === i.employee_id);
      const dept = emp?.department || i.employee_department || '';
      if (dept !== departmentFilter) return false;
    }
    return true;
  });

  return (
    <div className="space-y-6 animate-in fade-in">
      {/* Header */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-wrap justify-between items-center gap-4">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-gradient-to-br from-rose-600 to-amber-600 rounded-2xl text-white shadow-md">
            <ShieldAlert className="w-8 h-8" />
          </div>
          <div>
            <h2 className="text-2xl font-black text-slate-800">
              لائحة الجزاءات والمكافآت الإدارية (Disciplinary & Rewards)
            </h2>
            <p className="text-xs text-slate-500 mt-1">
              تسجيل العقوبات والخصومات، حوافز التميز، والإنذارات الرسمية مع الربط الآلي بمسير الرواتب
            </p>
          </div>
        </div>

        <button
          onClick={handleOpenCreate}
          className="px-5 py-2.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold flex items-center gap-2 shadow-lg shadow-rose-600/20 transition"
        >
          <Plus className="w-4 h-4" /> إضافة قرار / جزاء / مكافأة
        </button>
      </div>

      {/* Tabs & Department Filter */}
      <div className="flex flex-wrap items-center justify-between border-b border-slate-200 gap-4 pb-2">
        <div className="flex gap-4">
          <button
            onClick={() => setActiveTab('ALL')}
            className={`pb-2 text-xs font-bold transition border-b-2 ${
              activeTab === 'ALL' ? 'border-rose-600 text-rose-600' : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            كل القرارات ({items.length})
          </button>
          <button
            onClick={() => setActiveTab('PENALTY')}
            className={`pb-2 text-xs font-bold transition border-b-2 ${
              activeTab === 'PENALTY' ? 'border-rose-600 text-rose-600' : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            الجزاءات والخصومات ({items.filter(i => i.type === 'PENALTY').length})
          </button>
          <button
            onClick={() => setActiveTab('REWARD')}
            className={`pb-2 text-xs font-bold transition border-b-2 ${
              activeTab === 'REWARD' ? 'border-emerald-600 text-emerald-600' : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            المكافآت والحوافز ({items.filter(i => i.type === 'REWARD').length})
          </button>
          <button
            onClick={() => setActiveTab('WARNING')}
            className={`pb-2 text-xs font-bold transition border-b-2 ${
              activeTab === 'WARNING' ? 'border-amber-600 text-amber-600' : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            الإنذارات ولفت النظر ({items.filter(i => i.type === 'WARNING').length})
          </button>
        </div>

        {departments.length > 0 && (
          <div className="flex items-center gap-2 pb-1">
            <Filter className="w-3.5 h-3.5 text-slate-400" />
            <span className="text-xs text-slate-500 font-bold">تصفية بالقسم:</span>
            <select
              value={departmentFilter}
              onChange={e => setDepartmentFilter(e.target.value)}
              className="text-xs bg-white border border-slate-200 rounded-lg px-2.5 py-1 text-slate-700 font-bold outline-none focus:border-rose-500 cursor-pointer"
            >
              <option value="ALL">كل الأقسام ({departments.length})</option>
              {departments.map(dept => (
                <option key={dept} value={dept}>{dept}</option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-right text-xs">
            <thead className="bg-slate-50 text-slate-500 font-bold border-b border-slate-100">
              <tr>
                <th className="p-3.5">الموظف</th>
                <th className="p-3.5">القسم</th>
                <th className="p-3.5 text-center">نوع القرار</th>
                <th className="p-3.5">التصنيف والسبب</th>
                <th className="p-3.5 text-center">قيمة الخصم / الحافز</th>
                <th className="p-3.5 text-center">تاريخ القرار</th>
                <th className="p-3.5 text-center">حالة المسير</th>
                <th className="p-3.5 text-center">إجراءات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredItems.map(item => {
                const emp = employees.find(e => e.id === item.employee_id);
                const employeeName = emp?.full_name || emp?.name || item.employee_name || 'موظف';
                const employeeDept = emp?.department || item.employee_department || 'العام';

                return (
                  <tr key={item.id} className="hover:bg-slate-50 transition">
                    <td className="p-3.5 font-bold text-slate-800">
                      <div className="flex items-center gap-2">
                        <User className="w-4 h-4 text-slate-400" />
                        <span>{employeeName}</span>
                      </div>
                    </td>

                    <td className="p-3.5">
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-blue-50/80 border border-blue-100 text-blue-700 rounded-lg text-xs font-bold">
                        <Building2 size={13} className="text-blue-500" />
                        {employeeDept}
                      </span>
                    </td>

                    <td className="p-3.5 text-center">
                      <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                        item.type === 'PENALTY'
                          ? 'bg-rose-100 text-rose-800'
                          : item.type === 'REWARD'
                          ? 'bg-emerald-100 text-emerald-800'
                          : 'bg-amber-100 text-amber-800'
                      }`}>
                        {item.type === 'PENALTY' ? 'خصم / جزاء 🔻' : item.type === 'REWARD' ? 'مكافأة 🏆' : 'إنذار إداري ⚠️'}
                      </span>
                    </td>

                    <td className="p-3.5">
                      <span className="font-bold text-slate-700 block">{item.category}</span>
                      <span className="text-[11px] text-slate-400 block">{item.reason}</span>
                    </td>

                    <td className="p-3.5 text-center font-mono font-bold">
                      {item.type === 'WARNING' ? (
                        <span className="text-slate-400">لفت نظر (0 ج)</span>
                      ) : item.amount_type === 'DAYS' ? (
                        <span className={item.type === 'PENALTY' ? 'text-rose-600' : 'text-emerald-600'}>
                          {item.amount_value} يوم ({item.calculated_amount.toLocaleString()} ج.م)
                        </span>
                      ) : (
                        <span className={item.type === 'PENALTY' ? 'text-rose-600' : 'text-emerald-600'}>
                          {item.amount_value.toLocaleString()} ج.م
                        </span>
                      )}
                    </td>

                    <td className="p-3.5 text-center font-mono text-slate-500">{item.action_date}</td>

                    <td className="p-3.5 text-center">
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                        معتمد ومدرج
                      </span>
                    </td>

                    <td className="p-3.5 text-center">
                      <div className="flex items-center justify-center gap-1">
                        <button
                          onClick={() => handleOpenEdit(item)}
                          className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition"
                          title="تعديل القرار (القلم)"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDelete(item.id)}
                          className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition"
                          title="إلغاء القرار"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}

              {filteredItems.length === 0 && (
                <tr>
                  <td colSpan={8} className="p-8 text-center text-slate-400">
                    لا توجد سجلات مسجلة في هذا القسم حالياً.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add / Edit Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto animate-in fade-in">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-lg overflow-hidden space-y-4 p-6 text-right">
            <div className="flex justify-between items-center border-b pb-3">
              <h3 className="font-bold text-base text-slate-800 flex items-center gap-2">
                {editingItem ? (
                  <>
                    <Pencil className="w-5 h-5 text-blue-600" />
                    <span>تعديل القرار الإداري / الجزاء / المكافأة</span>
                  </>
                ) : (
                  <>
                    <ShieldAlert className="w-5 h-5 text-rose-600" />
                    <span>تسجيل قرار إداري / جزاء / مكافأة</span>
                  </>
                )}
              </h3>
              <button 
                onClick={() => {
                  setIsModalOpen(false);
                  setEditingItem(null);
                }} 
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSave} className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">نوع القرار <span className="text-red-500">*</span></label>
                  <select
                    value={formType}
                    onChange={e => setFormType(e.target.value as any)}
                    className="w-full border border-slate-300 rounded-xl p-2.5 text-xs font-bold bg-white outline-none"
                  >
                    <option value="PENALTY">خصم / جزاء مالي</option>
                    <option value="REWARD">مكافأة / حافز تميز</option>
                    <option value="WARNING">إنذار / لفت نظر بدون خصم</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">الموظف المعني <span className="text-red-500">*</span></label>
                  <select
                    value={formEmpId}
                    onChange={e => setFormEmpId(e.target.value)}
                    className="w-full border border-slate-300 rounded-xl p-2.5 text-xs font-bold bg-white outline-none"
                  >
                    {employees.map(emp => (
                      <option key={emp.id} value={emp.id}>
                        {emp.name || emp.full_name} {emp.department ? `(${emp.department})` : ''} - (أساسي: {Number(emp.basic_salary || 0).toLocaleString()} ج)
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">تصنيف المخالفة أو المكافأة</label>
                  <input
                    type="text"
                    value={formCategory}
                    onChange={e => setFormCategory(e.target.value)}
                    placeholder="مثال: تأخير غير مبرر / تميز في العمل"
                    className="w-full border border-slate-300 rounded-xl p-2.5 text-xs outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">تاريخ القرار</label>
                  <input
                    type="date"
                    value={formActionDate}
                    onChange={e => setFormActionDate(e.target.value)}
                    className="w-full border border-slate-300 rounded-xl p-2.5 text-xs font-mono outline-none"
                  />
                </div>
              </div>

              {formType !== 'WARNING' && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">طريقة الحساب</label>
                    <select
                      value={formAmountType}
                      onChange={e => setFormAmountType(e.target.value as any)}
                      className="w-full border border-slate-300 rounded-xl p-2.5 text-xs font-bold bg-white outline-none"
                    >
                      <option value="DAYS">حسب أيام العمل (أيام أجر)</option>
                      <option value="FIXED_AMOUNT">مبلغ نقدي ثابت (ج.م)</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      {formAmountType === 'DAYS' ? 'عدد الأيام' : 'المبلغ بالجنيه'}
                    </label>
                    <input
                      type="number"
                      step={formAmountType === 'DAYS' ? '0.25' : '0.01'}
                      min={formAmountType === 'DAYS' ? '0.25' : '0'}
                      value={formAmountValue}
                      onChange={e => setFormAmountValue(Number(e.target.value))}
                      className="w-full border border-slate-300 rounded-xl p-2.5 text-xs font-mono font-bold outline-none"
                    />
                  </div>
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">أسباب وتفاصيل القرار الإداري <span className="text-red-500">*</span></label>
                <textarea
                  required
                  rows={3}
                  value={formReason}
                  onChange={e => setFormReason(e.target.value)}
                  placeholder="اكتب أسباب القرار والتحقيق أو خطاب الشكر بالتفصيل..."
                  className="w-full border border-slate-300 rounded-xl p-2.5 text-xs outline-none focus:ring-2 focus:ring-rose-500"
                />
              </div>

              <div className="border-t pt-4 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setIsModalOpen(false);
                    setEditingItem(null);
                  }}
                  className="px-4 py-2 border border-slate-300 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-50 transition"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className={`px-5 py-2 text-white rounded-xl text-xs font-bold shadow transition ${
                    editingItem 
                      ? 'bg-blue-600 hover:bg-blue-700 shadow-blue-600/20' 
                      : 'bg-rose-600 hover:bg-rose-700 shadow-rose-600/20'
                  }`}
                >
                  {saving 
                    ? 'جاري الحفظ...' 
                    : editingItem 
                    ? 'حفظ التعديلات' 
                    : 'اعتماد وتسجيل القرار'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default PenaltiesAndRewards;

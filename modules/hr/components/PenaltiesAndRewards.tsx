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
  Filter
} from 'lucide-react';

export const PenaltiesAndRewards: React.FC = () => {
  const { currentSelectedOrgId, currentUser, employees } = useAccounting();
  const { showToast } = useToast();

  const [items, setItems] = useState<HrPenaltyReward[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'ALL' | 'PENALTY' | 'REWARD' | 'WARNING'>('ALL');

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
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
    } catch (e: any) {
      console.warn('Load penalties error:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [orgId]);

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
          employee_id: formEmpId,
          type: formType,
          category: formCategory,
          reason: formReason,
          amount_type: formAmountType,
          amount_value: formAmountValue,
          action_date: formActionDate,
          payroll_month: new Date(formActionDate).getMonth() + 1,
          payroll_year: new Date(formActionDate).getFullYear(),
          status: 'APPROVED'
        },
        basicSal,
        orgId
      );

      showToast('تم اعتماد وتسجيل القرار بنجاح وسيتم ربطه تلقائياً بالمسير ⚖️✅', 'success');
      setIsModalOpen(false);
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

  const filteredItems = items.filter(i => (activeTab === 'ALL' ? true : i.type === activeTab));

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
          onClick={() => {
            setFormEmpId(employees[0]?.id || '');
            setIsModalOpen(true);
          }}
          className="px-5 py-2.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold flex items-center gap-2 shadow-lg shadow-rose-600/20 transition"
        >
          <Plus className="w-4 h-4" /> إضافة قرار / جزاء / مكافأة
        </button>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-200 gap-4">
        <button
          onClick={() => setActiveTab('ALL')}
          className={`pb-3 text-xs font-bold transition border-b-2 ${
            activeTab === 'ALL' ? 'border-rose-600 text-rose-600' : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          كل القرارات ({items.length})
        </button>
        <button
          onClick={() => setActiveTab('PENALTY')}
          className={`pb-3 text-xs font-bold transition border-b-2 ${
            activeTab === 'PENALTY' ? 'border-rose-600 text-rose-600' : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          الجزاءات والخصومات ({items.filter(i => i.type === 'PENALTY').length})
        </button>
        <button
          onClick={() => setActiveTab('REWARD')}
          className={`pb-3 text-xs font-bold transition border-b-2 ${
            activeTab === 'REWARD' ? 'border-emerald-600 text-emerald-600' : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          المكافآت والحوافز ({items.filter(i => i.type === 'REWARD').length})
        </button>
        <button
          onClick={() => setActiveTab('WARNING')}
          className={`pb-3 text-xs font-bold transition border-b-2 ${
            activeTab === 'WARNING' ? 'border-amber-600 text-amber-600' : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          الإنذارات ولفت النظر ({items.filter(i => i.type === 'WARNING').length})
        </button>
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-right text-xs">
            <thead className="bg-slate-50 text-slate-500 font-bold border-b border-slate-100">
              <tr>
                <th className="p-3.5">الموظف</th>
                <th className="p-3.5 text-center">نوع القرار</th>
                <th className="p-3.5">التصنيف والسبب</th>
                <th className="p-3.5 text-center">قيمة الخصم / الحافز</th>
                <th className="p-3.5 text-center">تاريخ القرار</th>
                <th className="p-3.5 text-center">حالة المسير</th>
                <th className="p-3.5 text-center">إجراءات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredItems.map(item => (
                <tr key={item.id} className="hover:bg-slate-50 transition">
                  <td className="p-3.5 font-bold text-slate-800 flex items-center gap-2">
                    <User className="w-4 h-4 text-slate-400" />
                    {item.employee_name || 'موظف'}
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
                    <button
                      onClick={() => handleDelete(item.id)}
                      className="p-1.5 text-slate-400 hover:text-rose-600 transition"
                      title="إلغاء القرار"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}

              {filteredItems.length === 0 && (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-slate-400">
                    لا توجد سجلات مسجلة في هذا القسم حالياً.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto animate-in fade-in">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-lg overflow-hidden space-y-4 p-6 text-right">
            <div className="flex justify-between items-center border-b pb-3">
              <h3 className="font-bold text-base text-slate-800 flex items-center gap-2">
                <ShieldAlert className="w-5 h-5 text-rose-600" />
                تسجيل قرار إداري / جزاء / مكافأة
              </h3>
              <button onClick={() => setIsModalOpen(false)} className="text-slate-400">
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
                      <option key={emp.id} value={emp.id}>{emp.name} (أساسي: {Number(emp.basic_salary || 0).toLocaleString()} ج)</option>
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
                      step={formAmountType === 'DAYS' ? '0.25' : '1'}
                      min="0.25"
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
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 border border-slate-300 rounded-xl text-xs font-bold text-slate-600"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-5 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold shadow"
                >
                  {saving ? 'جاري الحفظ...' : 'اعتماد وتسجيل القرار'}
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

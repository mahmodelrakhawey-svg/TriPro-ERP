import React, { useState, useEffect } from 'react';
import { useAccounting } from '../../../../context/AccountingContext';
import { useToast } from '../../../../context/ToastContext';
import {
  StaffTipShare,
  TipsDistributionRecord,
  tipsPoolService
} from '../../../../services/tipsPoolService';
import {
  Coins,
  Users,
  Utensils,
  ChefHat,
  Calculator,
  Save,
  CheckCircle2,
  DollarSign,
  PieChart,
  FileSpreadsheet,
  RefreshCw,
  Sparkles,
  Plus,
  Trash2,
  UserPlus,
  X
} from 'lucide-react';

export const TipsPoolManager: React.FC = () => {
  const { employees, currentUser } = useAccounting();
  const { showToast } = useToast();

  const [totalTipsInput, setTotalTipsInput] = useState<number>(1000);
  const [floorPct, setFloorPct] = useState<number>(60);
  const [kitchenPct, setKitchenPct] = useState<number>(40);

  const [staff, setStaff] = useState<Array<{
    id: string;
    name: string;
    role: 'WAITER' | 'RUNNER' | 'CHEF' | 'BARISTA' | 'HOST';
    category: 'FLOOR' | 'KITCHEN';
    hoursWorked: number;
    pointsWeight: number;
  }>>([]);

  const [calculatedShares, setCalculatedShares] = useState<StaffTipShare[]>([]);
  const [historyRecords, setHistoryRecords] = useState<TipsDistributionRecord[]>([]);
  const [isAddStaffModalOpen, setIsAddStaffModalOpen] = useState(false);
  const [newStaffForm, setNewStaffForm] = useState({
    name: '',
    role: 'WAITER' as 'WAITER' | 'RUNNER' | 'CHEF' | 'BARISTA' | 'HOST',
    category: 'FLOOR' as 'FLOOR' | 'KITCHEN',
    hoursWorked: 8,
    pointsWeight: 1
  });

  useEffect(() => {
    // جلب موظفي المنظمة الحقيقيين فقط
    if (employees && employees.length > 0) {
      const mapped = employees.map((emp, i) => {
        const role = emp.role || emp.job_title || emp.position || '';
        const isKitchen = role.toLowerCase().includes('chef') || role.toLowerCase().includes('طاه') || role.toLowerCase().includes('مطبخ') || role.toLowerCase().includes('cook') || (i % 2 === 0);
        return {
          id: emp.id,
          name: emp.full_name || emp.name || `موظف ${i + 1}`,
          role: isKitchen ? ('CHEF' as const) : ('WAITER' as const),
          category: isKitchen ? ('KITCHEN' as const) : ('FLOOR' as const),
          hoursWorked: 8,
          pointsWeight: 1
        };
      });
      setStaff(mapped);
    } else {
      setStaff([]);
    }

    setHistoryRecords(tipsPoolService.getRecords(currentUser?.organization_id || undefined));
  }, [employees, currentUser]);

  useEffect(() => {
    if (staff.length > 0) {
      const shares = tipsPoolService.calculateDistribution({
        totalTips: totalTipsInput,
        floorSharePct: floorPct,
        kitchenSharePct: kitchenPct,
        staffList: staff
      });
      setCalculatedShares(shares);
    } else {
      setCalculatedShares([]);
    }
  }, [totalTipsInput, floorPct, kitchenPct, staff]);

  const handleUpdateHours = (staffId: string, hours: number) => {
    setStaff(prev => prev.map(s => (s.id === staffId ? { ...s, hoursWorked: Math.max(0, hours) } : s)));
  };

  const handleUpdatePoints = (staffId: string, points: number) => {
    setStaff(prev => prev.map(s => (s.id === staffId ? { ...s, pointsWeight: Math.max(0.1, points) } : s)));
  };

  const handleRemoveStaff = (staffId: string) => {
    setStaff(prev => prev.filter(s => s.id !== staffId));
    showToast('تم حذف الموظف من كشف التوزيع 🗑️', 'info');
  };

  const handleAddStaff = () => {
    if (!newStaffForm.name.trim()) {
      showToast('يرجى كتابة اسم الموظف', 'warning');
      return;
    }
    const newEntry = {
      id: `staff_${Date.now()}`,
      name: newStaffForm.name.trim(),
      role: newStaffForm.role,
      category: newStaffForm.category,
      hoursWorked: Number(newStaffForm.hoursWorked) || 8,
      pointsWeight: Number(newStaffForm.pointsWeight) || 1
    };
    setStaff(prev => [...prev, newEntry]);
    setNewStaffForm({
      name: '',
      role: 'WAITER',
      category: 'FLOOR',
      hoursWorked: 8,
      pointsWeight: 1
    });
    setIsAddStaffModalOpen(false);
    showToast('تمت إضافة الموظف لكشف توزيع التبس بنجاح ✅', 'success');
  };

  const handleImportAllEmployees = () => {
    if (!employees || employees.length === 0) {
      showToast('لا يوجد موظفون مسجلون في شاشة شؤون الموظفين (HR)', 'warning');
      return;
    }
    const mapped = employees.map((emp, i) => {
      const role = emp.role || emp.job_title || emp.position || '';
      const isKitchen = role.toLowerCase().includes('chef') || role.toLowerCase().includes('طاه') || role.toLowerCase().includes('مطبخ') || (i % 2 === 0);
      return {
        id: emp.id,
        name: emp.full_name || emp.name || `موظف ${i + 1}`,
        role: isKitchen ? ('CHEF' as const) : ('WAITER' as const),
        category: isKitchen ? ('KITCHEN' as const) : ('FLOOR' as const),
        hoursWorked: 8,
        pointsWeight: 1
      };
    });
    setStaff(mapped);
    showToast(`تم استيراد ${mapped.length} موظف بنجاح ✅`, 'success');
  };

  const handleSaveDistribution = () => {
    if (totalTipsInput <= 0) {
      showToast('يرجى تحديد إجمالي مبلغ التبس', 'warning');
      return;
    }
    if (staff.length === 0) {
      showToast('يرجى إضافة موظفين أولاً لتوزيع التبس عليهم', 'warning');
      return;
    }

    const rec = tipsPoolService.saveDistribution({
      organization_id: currentUser?.organization_id || null,
      period_start: new Date().toISOString(),
      period_end: new Date().toISOString(),
      total_tips_collected: totalTipsInput,
      floor_share_pct: floorPct,
      kitchen_share_pct: kitchenPct,
      total_floor_amount: (totalTipsInput * floorPct) / 100,
      total_kitchen_amount: (totalTipsInput * kitchenPct) / 100,
      staff_shares: calculatedShares,
      status: 'DISTRIBUTED'
    });

    showToast('تم اعتماد وحفظ كشف توزيع التبس بنجاح 🎉', 'success');
    setHistoryRecords(tipsPoolService.getRecords(currentUser?.organization_id || undefined));
  };

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-7xl mx-auto animate-in fade-in">
      {/* Header */}
      <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm flex flex-wrap justify-between items-center gap-4">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-gradient-to-br from-amber-500 to-yellow-600 rounded-2xl text-white shadow-md">
            <Coins className="w-8 h-8" />
          </div>
          <div>
            <h2 className="text-2xl font-black text-slate-800">مجمع وتوزيع التبس والإكراميات (Tips Pooling)</h2>
            <p className="text-xs text-slate-500 mt-1">
              حساب مجمع خدمة وإكراميات الوردية وتوزيعها آلياً بنسب عادلة بين طاقم الصالة (Floor) والمطبخ (Kitchen)
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsAddStaffModalOpen(true)}
            className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold flex items-center gap-1.5 transition"
          >
            <UserPlus className="w-4 h-4 text-slate-600" /> إضافة موظف للكشف
          </button>
          <button
            onClick={handleSaveDistribution}
            disabled={staff.length === 0}
            className="px-6 py-2.5 bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white rounded-xl text-xs font-bold flex items-center gap-2 shadow-lg shadow-amber-600/20 transition"
          >
            <Save className="w-4 h-4" /> اعتماد وتوزيع التبس
          </button>
        </div>
      </div>

      {/* Control Configuration Bar */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Total Tips Input */}
        <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-sm space-y-2">
          <span className="text-xs font-bold text-slate-500 flex items-center gap-1.5">
            <Coins className="w-4 h-4 text-amber-500" /> إجمالي مجمع التبس المحصل
          </span>
          <div className="flex items-center gap-2">
            <input
              type="number"
              min="0"
              step="10"
              value={totalTipsInput}
              onChange={e => setTotalTipsInput(parseFloat(e.target.value) || 0)}
              className="w-full text-2xl font-black text-amber-600 font-mono border rounded-2xl p-2.5 text-center outline-none focus:ring-2 focus:ring-amber-500"
            />
            <span className="font-bold text-slate-600 text-sm">ج.م</span>
          </div>
        </div>

        {/* Floor Share Ratio */}
        <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-sm space-y-2">
          <div className="flex justify-between items-center text-xs font-bold text-slate-500">
            <span className="flex items-center gap-1.5">
              <Users className="w-4 h-4 text-indigo-500" /> نصيب طاقم الصالة (Floor)
            </span>
            <span className="text-indigo-600 font-black font-mono text-sm">{floorPct}%</span>
          </div>
          <input
            type="range"
            min="0"
            max="100"
            value={floorPct}
            onChange={e => {
              const val = parseInt(e.target.value);
              setFloorPct(val);
              setKitchenPct(100 - val);
            }}
            className="w-full accent-indigo-600 cursor-pointer"
          />
          <div className="flex justify-between text-xs text-slate-600 font-mono font-bold">
            <span>المبلغ المخصص:</span>
            <span className="text-indigo-600">{((totalTipsInput * floorPct) / 100).toFixed(2)} ج</span>
          </div>
        </div>

        {/* Kitchen Share Ratio */}
        <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-sm space-y-2">
          <div className="flex justify-between items-center text-xs font-bold text-slate-500">
            <span className="flex items-center gap-1.5">
              <ChefHat className="w-4 h-4 text-rose-500" /> نصيب طاقم المطبخ (Kitchen)
            </span>
            <span className="text-rose-600 font-black font-mono text-sm">{kitchenPct}%</span>
          </div>
          <input
            type="range"
            min="0"
            max="100"
            value={kitchenPct}
            onChange={e => {
              const val = parseInt(e.target.value);
              setKitchenPct(val);
              setFloorPct(100 - val);
            }}
            className="w-full accent-rose-600 cursor-pointer"
          />
          <div className="flex justify-between text-xs text-slate-600 font-mono font-bold">
            <span>المبلغ المخصص:</span>
            <span className="text-rose-600">{((totalTipsInput * kitchenPct) / 100).toFixed(2)} ج</span>
          </div>
        </div>
      </div>

      {/* Staff Breakdown Table */}
      <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-slate-100 bg-slate-50 flex flex-wrap justify-between items-center gap-2">
          <h3 className="font-bold text-sm text-slate-800 flex items-center gap-2">
            <Users className="w-4 h-4 text-slate-600" /> جدول استحقاق أفراد الطاقم ({calculatedShares.length} موظف)
          </h3>
          <div className="flex items-center gap-2">
            {employees && employees.length > 0 && staff.length === 0 && (
              <button
                onClick={handleImportAllEmployees}
                className="text-xs bg-indigo-50 text-indigo-700 hover:bg-indigo-100 font-bold px-3 py-1.5 rounded-lg border border-indigo-200 transition"
              >
                استيراد موظفي المنشأة ({employees.length})
              </button>
            )}
            <span className="text-xs text-slate-400 font-medium hidden sm:inline">
              يتم الحساب تلقائياً بناءً على ساعات العمل وأوزان النقاط
            </span>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-right text-xs">
            <thead className="bg-slate-50 text-slate-500 font-bold border-b border-slate-100">
              <tr>
                <th className="p-3.5">اسم الموظف</th>
                <th className="p-3.5 text-center">القسم</th>
                <th className="p-3.5 text-center">الوظيفة</th>
                <th className="p-3.5 text-center">ساعات العمل</th>
                <th className="p-3.5 text-center">وزن النقاط</th>
                <th className="p-3.5 text-left font-black text-amber-700">المبلغ المستحق من التبس</th>
                <th className="p-3.5 text-center w-12">حذف</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {calculatedShares.map((share, idx) => (
                <tr key={share.employee_id || idx} className="hover:bg-slate-50 transition">
                  <td className="p-3.5 font-bold text-slate-800">{share.employee_name}</td>
                  <td className="p-3.5 text-center">
                    <span
                      className={`px-2.5 py-1 rounded-full text-[10px] font-bold ${
                        share.category === 'FLOOR' ? 'bg-indigo-100 text-indigo-800' : 'bg-rose-100 text-rose-800'
                      }`}
                    >
                      {share.category === 'FLOOR' ? 'صالة' : 'مطبخ'}
                    </span>
                  </td>
                  <td className="p-3.5 text-center text-slate-500 font-mono">{share.role}</td>
                  <td className="p-3.5 text-center">
                    <input
                      type="number"
                      min="1"
                      max="24"
                      value={share.hours_worked}
                      onChange={e => handleUpdateHours(share.employee_id, parseFloat(e.target.value) || 0)}
                      className="w-16 border rounded-lg p-1 text-center font-bold outline-none focus:ring-1 focus:ring-amber-500"
                    />
                  </td>
                  <td className="p-3.5 text-center">
                    <input
                      type="number"
                      min="0.1"
                      step="0.1"
                      value={share.points_weight}
                      onChange={e => handleUpdatePoints(share.employee_id, parseFloat(e.target.value) || 1)}
                      className="w-16 border rounded-lg p-1 text-center font-bold outline-none focus:ring-1 focus:ring-amber-500"
                    />
                  </td>
                  <td className="p-3.5 text-left font-black text-sm font-mono text-emerald-600">
                    {share.tip_amount_earned.toFixed(2)} ج
                  </td>
                  <td className="p-3.5 text-center">
                    <button
                      onClick={() => handleRemoveStaff(share.employee_id)}
                      className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition"
                      title="حذف من الكشف"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
              {calculatedShares.length === 0 && (
                <tr>
                  <td colSpan={7} className="p-12 text-center text-slate-400 space-y-3">
                    <Users className="w-12 h-12 text-slate-300 mx-auto" />
                    <p className="font-bold text-slate-600">لا يوجد موظفون في كشف التوزيع حالياً</p>
                    <p className="text-xs">اضغط على زر "إضافة موظف للكشف" لإضافة موظفي الوردية وحساب نصيبهم</p>
                    <button
                      onClick={() => setIsAddStaffModalOpen(true)}
                      className="mt-2 px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-bold inline-flex items-center gap-1.5 transition shadow"
                    >
                      <UserPlus className="w-4 h-4" /> إضافة موظف جديد
                    </button>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add Staff Modal */}
      {isAddStaffModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-md overflow-hidden space-y-4 p-6">
            <div className="flex justify-between items-center border-b pb-3">
              <h3 className="font-bold text-base text-slate-800 flex items-center gap-2">
                <UserPlus className="w-5 h-5 text-amber-600" />
                إضافة فرد طاقم لكشف التبس
              </h3>
              <button onClick={() => setIsAddStaffModalOpen(false)} className="text-slate-400">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">اسم الموظف</label>
                {employees && employees.length > 0 ? (
                  <div className="space-y-1.5">
                    <select
                      onChange={e => {
                        const selectedEmp = employees.find(emp => emp.id === e.target.value);
                        if (selectedEmp) {
                          setNewStaffForm({
                            ...newStaffForm,
                            name: selectedEmp.full_name || selectedEmp.name
                          });
                        }
                      }}
                      className="w-full border border-slate-300 rounded-lg p-2 text-xs outline-none bg-white mb-1.5"
                    >
                      <option value="">-- اختر من موظفي المنشأة --</option>
                      {employees.map(emp => (
                        <option key={emp.id} value={emp.id}>{emp.full_name || emp.name}</option>
                      ))}
                    </select>
                    <input
                      type="text"
                      placeholder="أو اكتب اسماً يدوياً..."
                      value={newStaffForm.name}
                      onChange={e => setNewStaffForm({ ...newStaffForm, name: e.target.value })}
                      className="w-full border border-slate-300 rounded-lg p-2 text-xs outline-none"
                    />
                  </div>
                ) : (
                  <input
                    type="text"
                    placeholder="اسم الموظف (مثال: محمد علي)"
                    value={newStaffForm.name}
                    onChange={e => setNewStaffForm({ ...newStaffForm, name: e.target.value })}
                    className="w-full border border-slate-300 rounded-lg p-2 text-xs outline-none"
                  />
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">القسم</label>
                  <select
                    value={newStaffForm.category}
                    onChange={e => setNewStaffForm({ ...newStaffForm, category: e.target.value as any })}
                    className="w-full border border-slate-300 rounded-lg p-2 text-xs outline-none bg-white"
                  >
                    <option value="FLOOR">طاقم الصالة (Floor)</option>
                    <option value="KITCHEN">طاقم المطبخ (Kitchen)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">المسمى الوظيفي</label>
                  <select
                    value={newStaffForm.role}
                    onChange={e => setNewStaffForm({ ...newStaffForm, role: e.target.value as any })}
                    className="w-full border border-slate-300 rounded-lg p-2 text-xs outline-none bg-white"
                  >
                    <option value="WAITER">ويتر (Waiter)</option>
                    <option value="CHEF">طاهي / شيف (Chef)</option>
                    <option value="BARISTA">باريستا (Barista)</option>
                    <option value="RUNNER">مساعد صالة (Runner)</option>
                    <option value="HOST">مضيف (Host)</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">ساعات العمل بالوردية</label>
                  <input
                    type="number"
                    min="1"
                    max="24"
                    value={newStaffForm.hoursWorked}
                    onChange={e => setNewStaffForm({ ...newStaffForm, hoursWorked: parseFloat(e.target.value) || 8 })}
                    className="w-full border border-slate-300 rounded-lg p-2 text-xs outline-none text-center font-bold"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">وزن النقاط (Points)</label>
                  <input
                    type="number"
                    min="0.1"
                    step="0.1"
                    value={newStaffForm.pointsWeight}
                    onChange={e => setNewStaffForm({ ...newStaffForm, pointsWeight: parseFloat(e.target.value) || 1 })}
                    className="w-full border border-slate-300 rounded-lg p-2 text-xs outline-none text-center font-bold"
                  />
                </div>
              </div>
            </div>

            <div className="border-t pt-4 flex justify-end gap-2">
              <button
                onClick={() => setIsAddStaffModalOpen(false)}
                className="px-4 py-2 border border-slate-300 rounded-xl text-xs font-bold text-slate-600"
              >
                إلغاء
              </button>
              <button
                onClick={handleAddStaff}
                className="px-5 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow"
              >
                <Plus className="w-4 h-4" /> إضافة للكشف
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
export default TipsPoolManager;

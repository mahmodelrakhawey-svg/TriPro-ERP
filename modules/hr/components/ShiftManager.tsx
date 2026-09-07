import React, { useState, useEffect } from 'react';
import { useAccounting } from '../../../context/AccountingContext';
import { useToast } from '../../../context/ToastContext';
import { hrEnterpriseService, HrShift } from '../../../services/hrEnterpriseService';
import {
  Clock,
  Plus,
  Edit3,
  Trash2,
  CheckCircle2,
  Calendar,
  X,
  Sliders,
  Shield,
  Layers,
  Users,
  Sun,
  Moon
} from 'lucide-react';

export const ShiftManager: React.FC = () => {
  const { currentSelectedOrgId, currentUser, employees } = useAccounting();
  const { showToast } = useToast();

  const [shifts, setShifts] = useState<HrShift[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingShift, setEditingShift] = useState<Partial<HrShift>>({
    name: '',
    code: '',
    start_time: '09:00:00',
    end_time: '17:00:00',
    grace_period_minutes: 15,
    overtime_start_minutes: 30,
    half_day_hours: 4,
    color: '#3b82f6',
    is_active: true
  });
  const [saving, setSaving] = useState(false);

  const orgId = currentSelectedOrgId || (currentUser as any)?.organization_id;

  const loadShifts = async () => {
    setLoading(true);
    try {
      const data = await hrEnterpriseService.getShifts(orgId);
      setShifts(data);
    } catch (e: any) {
      console.warn('Load shifts error:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadShifts();
  }, [orgId]);

  const handleSaveShift = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingShift.name?.trim()) {
      showToast('يرجى إدخال اسم الوردية', 'warning');
      return;
    }

    setSaving(true);
    try {
      await hrEnterpriseService.saveShift(editingShift, orgId);
      showToast('تم حفظ الوردية وسياسة الدوام بنجاح ⏱️✅', 'success');
      setIsModalOpen(false);
      loadShifts();
    } catch (e: any) {
      showToast('خطأ أثناء حفظ الوردية: ' + e.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in">
      {/* Header */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-wrap justify-between items-center gap-4">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-gradient-to-br from-blue-600 to-indigo-600 rounded-2xl text-white shadow-md">
            <Clock className="w-8 h-8" />
          </div>
          <div>
            <h2 className="text-2xl font-black text-slate-800">
              إدارة الورديات وفترات الدوام (Smart Shifts & Policies)
            </h2>
            <p className="text-xs text-slate-500 mt-1">
              تحديد ساعات العمل الرسمية، دقائق السماح بالتأخير، وقواعد احتساب ساعات العمل الإضافي
            </p>
          </div>
        </div>

        <button
          onClick={() => {
            setEditingShift({
              name: '',
              code: `SHIFT-${Date.now().toString().slice(-4)}`,
              start_time: '09:00:00',
              end_time: '17:00:00',
              grace_period_minutes: 15,
              overtime_start_minutes: 30,
              half_day_hours: 4,
              color: '#3b82f6',
              is_active: true
            });
            setIsModalOpen(true);
          }}
          className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold flex items-center gap-2 shadow-lg shadow-blue-600/20 transition"
        >
          <Plus className="w-4 h-4" /> إضافة وردية جديدة
        </button>
      </div>

      {/* Shifts Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {shifts.map(sh => (
          <div
            key={sh.id}
            className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-between space-y-4 hover:border-blue-300 transition"
          >
            <div className="flex justify-between items-start">
              <div className="flex items-center gap-3">
                <div
                  className="w-10 h-10 rounded-2xl flex items-center justify-center text-white font-bold shadow"
                  style={{ backgroundColor: sh.color || '#3b82f6' }}
                >
                  <Clock className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="font-bold text-sm text-slate-800">{sh.name}</h4>
                  <span className="text-[10px] text-slate-400 font-mono block">{sh.code}</span>
                </div>
              </div>

              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                نشطة
              </span>
            </div>

            <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-100 space-y-2 text-xs">
              <div className="flex justify-between items-center">
                <span className="text-slate-500 font-bold">ساعات العمل:</span>
                <span className="font-mono font-black text-slate-800 dir-ltr">
                  {sh.start_time.slice(0, 5)} ⬅️ {sh.end_time.slice(0, 5)}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-500 font-bold">فترة السماح:</span>
                <span className="font-mono text-amber-700 font-bold">
                  {sh.grace_period_minutes} دقيقة
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-500 font-bold">احتساب الإضافي بعد:</span>
                <span className="font-mono text-emerald-700 font-bold">
                  {sh.overtime_start_minutes} دقيقة من الانتهاء
                </span>
              </div>
            </div>

            <div className="pt-2 border-t border-slate-100 flex justify-end">
              <button
                onClick={() => {
                  setEditingShift(sh);
                  setIsModalOpen(true);
                }}
                className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-bold flex items-center gap-1 transition"
              >
                <Edit3 className="w-3.5 h-3.5" /> تعديل السياسة
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Add / Edit Shift Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto animate-in fade-in">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-lg overflow-hidden space-y-4 p-6 text-right">
            <div className="flex justify-between items-center border-b pb-3">
              <h3 className="font-bold text-base text-slate-800 flex items-center gap-2">
                <Clock className="w-5 h-5 text-blue-600" />
                إعدادات الوردية وسياسة الدوام
              </h3>
              <button onClick={() => setIsModalOpen(false)} className="text-slate-400">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveShift} className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">اسم الوردية <span className="text-red-500">*</span></label>
                  <input
                    type="text"
                    required
                    value={editingShift.name || ''}
                    onChange={e => setEditingShift({ ...editingShift, name: e.target.value })}
                    placeholder="مثال: الوردية الصباحية"
                    className="w-full border border-slate-300 rounded-xl p-2.5 text-xs outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">كود الوردية</label>
                  <input
                    type="text"
                    value={editingShift.code || ''}
                    onChange={e => setEditingShift({ ...editingShift, code: e.target.value })}
                    className="w-full border border-slate-300 rounded-xl p-2.5 text-xs font-mono outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">وقت بدء العمل (الحضور)</label>
                  <input
                    type="time"
                    required
                    value={editingShift.start_time?.slice(0, 5) || '09:00'}
                    onChange={e => setEditingShift({ ...editingShift, start_time: e.target.value + ':00' })}
                    className="w-full border border-slate-300 rounded-xl p-2.5 text-xs font-mono outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">وقت انتهاء العمل (الانصراف)</label>
                  <input
                    type="time"
                    required
                    value={editingShift.end_time?.slice(0, 5) || '17:00'}
                    onChange={e => setEditingShift({ ...editingShift, end_time: e.target.value + ':00' })}
                    className="w-full border border-slate-300 rounded-xl p-2.5 text-xs font-mono outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">فترة السماح للتأخير (بالدقائق)</label>
                  <input
                    type="number"
                    value={editingShift.grace_period_minutes || 15}
                    onChange={e => setEditingShift({ ...editingShift, grace_period_minutes: Number(e.target.value) })}
                    className="w-full border border-slate-300 rounded-xl p-2.5 text-xs font-mono outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">بدء احتساب الإضافي بعد (دقيقة)</label>
                  <input
                    type="number"
                    value={editingShift.overtime_start_minutes || 30}
                    onChange={e => setEditingShift({ ...editingShift, overtime_start_minutes: Number(e.target.value) })}
                    className="w-full border border-slate-300 rounded-xl p-2.5 text-xs font-mono outline-none"
                  />
                </div>
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
                  className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow"
                >
                  {saving ? 'جاري الحفظ...' : 'حفظ الوردية'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default ShiftManager;

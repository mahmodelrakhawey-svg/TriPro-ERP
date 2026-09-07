import React, { useState, useEffect } from 'react';
import { useAccounting } from '../../../../context/AccountingContext';
import { useToast } from '../../../../context/ToastContext';
import {
  HappyHourSchedule,
  happyHourService,
  DEFAULT_HAPPY_HOURS
} from '../../../../services/happyHourService';
import {
  Clock,
  Plus,
  Save,
  Trash2,
  Edit2,
  Sparkles,
  Percent,
  Calendar,
  CheckCircle2,
  AlertCircle,
  Tag,
  X
} from 'lucide-react';

export const HappyHourManager: React.FC = () => {
  const { currentUser, products } = useAccounting();
  const { showToast } = useToast();

  const [schedules, setSchedules] = useState<HappyHourSchedule[]>([]);
  const [loading, setLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [saving, setSaving] = useState(false);

  const [formData, setFormData] = useState<Partial<HappyHourSchedule>>({
    name: '',
    discount_pct: 15,
    days_of_week: [0, 1, 2, 3, 4, 5, 6],
    start_time: '16:00',
    end_time: '19:00',
    applies_to_all_products: true,
    target_category_ids: [],
    target_product_ids: [],
    is_active: true
  });

  const fetchSchedules = async () => {
    setLoading(true);
    try {
      const data = await happyHourService.getSchedules(currentUser?.organization_id || undefined);
      setSchedules(data);
    } catch (e: any) {
      showToast('خطأ: ' + e.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSchedules();
  }, []);

  const handleStartNew = () => {
    setFormData({
      name: 'عرض الساعات السعيدة الجديد',
      discount_pct: 20,
      days_of_week: [0, 1, 2, 3, 4, 5, 6],
      start_time: '16:00',
      end_time: '19:00',
      applies_to_all_products: true,
      target_category_ids: [],
      target_product_ids: [],
      is_active: true
    });
    setIsEditing(true);
  };

  const handleStartEdit = (sch: HappyHourSchedule) => {
    setFormData(sch);
    setIsEditing(true);
  };

  const handleDeleteSchedule = async (id: string, name: string) => {
    if (!window.confirm(`هل أنت متأكد من رغبتك في حذف عرض الساعات السعيدة "${name}"؟`)) {
      return;
    }
    try {
      await happyHourService.deleteSchedule(id, currentUser?.organization_id || undefined);
      showToast('تم حذف جدول الساعات السعيدة بنجاح 🗑️', 'success');
      fetchSchedules();
    } catch (e: any) {
      showToast('خطأ أثناء الحذف: ' + e.message, 'error');
    }
  };

  const handleSave = async () => {
    if (!formData.name?.trim()) {
      showToast('يرجى إدخال اسم العرض', 'warning');
      return;
    }

    setSaving(true);
    try {
      await happyHourService.saveSchedule(formData, currentUser?.organization_id || undefined);
      showToast('تم حفظ جدول الساعات السعيدة بنجاح ⏰', 'success');
      setIsEditing(false);
      fetchSchedules();
    } catch (e: any) {
      showToast('خطأ: ' + e.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const daysNames = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];

  const toggleDay = (dayIdx: number) => {
    const current = formData.days_of_week || [];
    const updated = current.includes(dayIdx) ? current.filter(d => d !== dayIdx) : [...current, dayIdx];
    setFormData({ ...formData, days_of_week: updated.sort() });
  };

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-6xl mx-auto animate-in fade-in">
      {/* Top Header */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-wrap justify-between items-center gap-4">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-gradient-to-br from-pink-600 to-rose-600 rounded-2xl text-white shadow-md">
            <Clock className="w-8 h-8" />
          </div>
          <div>
            <h2 className="text-2xl font-black text-slate-800">
              الساعات السعيدة والتسعير الديناميكي (Happy Hours)
            </h2>
            <p className="text-xs text-slate-500 mt-1">
              جدولة عروض وتخفيضات آلية بالساعة والدقيقة وأيام الأسبوع تطبق فورياً على الـ POS وقائمة الـ QR
            </p>
          </div>
        </div>

        <button
          onClick={handleStartNew}
          className="px-5 py-2.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold flex items-center gap-2 shadow-lg shadow-rose-600/20 transition"
        >
          <Plus className="w-4 h-4" /> جدول ساعات سعيدة جديد
        </button>
      </div>

      {/* Grid: Active Schedules List */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {schedules.map(sch => {
          return (
            <div
              key={sch.id}
              className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-between space-y-4 hover:border-rose-300 transition"
            >
              <div className="flex justify-between items-start">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-black text-lg text-slate-800">{sch.name}</h3>
                    <span className="bg-rose-100 text-rose-800 text-xs px-2.5 py-0.5 rounded-full font-bold">
                      خصم {sch.discount_pct}%
                    </span>
                  </div>
                  <span className="text-xs text-slate-500 block mt-1 font-mono">
                    ⏰ يومياً من {sch.start_time} إلى {sch.end_time}
                  </span>
                </div>

                <div className="flex items-center gap-1">
                  <button
                    onClick={() => handleStartEdit(sch)}
                    className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition"
                    title="تعديل الجدول"
                  >
                    <Edit2 className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleDeleteSchedule(sch.id, sch.name)}
                    className="p-2 text-rose-400 hover:text-rose-700 hover:bg-rose-50 rounded-lg transition"
                    title="حذف الجدول"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Days Badges */}
              <div className="flex flex-wrap gap-1">
                {daysNames.map((d, idx) => {
                  const isActive = sch.days_of_week.includes(idx);
                  return (
                    <span
                      key={idx}
                      className={`text-[10px] px-2 py-0.5 rounded-md font-bold ${
                        isActive ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-400'
                      }`}
                    >
                      {d}
                    </span>
                  );
                })}
              </div>

              <div className="pt-2 border-t flex justify-between items-center text-xs text-slate-500">
                <span>{sch.applies_to_all_products ? 'يشمل كافة أصناف المنيو' : 'أصناف محددة'}</span>
                <span className="text-emerald-600 font-bold flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5" /> مفعل تلقائياً
                </span>
              </div>
            </div>
          );
        })}
        {schedules.length === 0 && !loading && (
          <div className="col-span-full bg-white p-12 text-center rounded-2xl border border-slate-200 shadow-sm space-y-3">
            <Clock className="w-12 h-12 text-slate-300 mx-auto" />
            <h4 className="font-bold text-slate-700">لا توجد جداول ساعات سعيدة مسجلة حالياً</h4>
            <p className="text-xs text-slate-400">يمكنك إنشاء عروض أسعار ديناميكية حسب الساعات وأيام الأسبوع بضغطة زر</p>
            <button
              onClick={handleStartNew}
              className="mt-2 px-4 py-2 bg-rose-600 text-white rounded-xl text-xs font-bold inline-flex items-center gap-2 hover:bg-rose-700 transition"
            >
              <Plus className="w-4 h-4" /> إضافة جدول جديد
            </button>
          </div>
        )}
      </div>

      {/* Edit Modal */}
      {isEditing && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto animate-in fade-in">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-lg overflow-hidden space-y-4 p-6">
            <div className="flex justify-between items-center border-b pb-3">
              <h3 className="font-bold text-lg text-slate-800 flex items-center gap-2">
                <Clock className="w-5 h-5 text-rose-600" />
                {formData.id ? 'تعديل جدول الساعات السعيدة' : 'إنشاء جدول جديد'}
              </h3>
              <button onClick={() => setIsEditing(false)} className="text-slate-400">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4 text-xs">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">اسم العرض</label>
                <input
                  type="text"
                  value={formData.name || ''}
                  onChange={e => setFormData({ ...formData, name: e.target.value })}
                  placeholder="مثال: ساعات الترويقة المسائية"
                  className="w-full border border-slate-300 rounded-lg p-2 text-xs outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">نسبة الخصم (%)</label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min="1"
                    max="100"
                    value={formData.discount_pct || 15}
                    onChange={e => setFormData({ ...formData, discount_pct: parseFloat(e.target.value) || 0 })}
                    className="w-24 text-lg font-bold border border-slate-300 rounded-lg p-2 text-center outline-none"
                  />
                  <span className="font-bold text-slate-500">% خصم على الفاتورة</span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">وقت البدء</label>
                  <input
                    type="time"
                    value={formData.start_time || '16:00'}
                    onChange={e => setFormData({ ...formData, start_time: e.target.value })}
                    className="w-full border border-slate-300 rounded-lg p-2 text-xs outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">وقت الانتهاء</label>
                  <input
                    type="time"
                    value={formData.end_time || '19:00'}
                    onChange={e => setFormData({ ...formData, end_time: e.target.value })}
                    className="w-full border border-slate-300 rounded-lg p-2 text-xs outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">أيام التطبيق الأسبوعية</label>
                <div className="flex flex-wrap gap-1.5">
                  {daysNames.map((d, idx) => {
                    const isSelected = (formData.days_of_week || []).includes(idx);
                    return (
                      <button
                        type="button"
                        key={idx}
                        onClick={() => toggleDay(idx)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                          isSelected ? 'bg-rose-600 text-white shadow-sm' : 'bg-slate-100 text-slate-600'
                        }`}
                      >
                        {d}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.applies_to_all_products}
                    onChange={e => setFormData({ ...formData, applies_to_all_products: e.target.checked })}
                    className="w-4 h-4 text-rose-600 rounded border-slate-300"
                  />
                  <span className="font-bold text-slate-700">تطبيق الخصم على جميع أصناف المطعم</span>
                </label>
              </div>
            </div>

            <div className="border-t pt-4 flex justify-end gap-2">
              <button
                onClick={() => setIsEditing(false)}
                className="px-4 py-2 border border-slate-300 rounded-xl text-xs font-bold text-slate-600"
              >
                إلغاء
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="px-5 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold flex items-center gap-2 shadow"
              >
                <Save className="w-4 h-4" /> {saving ? 'جاري الحفظ...' : 'حفظ الجدول'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
export default HappyHourManager;

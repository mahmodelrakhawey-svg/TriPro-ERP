import React, { useState, useEffect } from 'react';
import { 
  Ticket, Plus, Trash2, Edit3, CheckCircle2, XCircle, 
  Calendar, Percent, DollarSign, Users, AlertCircle, X, ShieldCheck 
} from 'lucide-react';
import { useAccounting } from '../../../../context/AccountingContext';
import { useToast } from '../../../../context/ToastContext';
import { couponService, RetailCoupon } from '../../services/couponService';

export default function CouponsManagerTab() {
  const { currentUser, currentSelectedOrgId } = useAccounting() as any;
  const { showToast } = useToast();
  const orgId = currentSelectedOrgId || currentUser?.organization_id;

  const [coupons, setCoupons] = useState<RetailCoupon[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const [formData, setFormData] = useState<Partial<RetailCoupon>>({
    code: '',
    name: '',
    discount_type: 'PERCENT',
    discount_value: 10,
    min_order_amount: 100,
    max_discount_amount: 50,
    usage_limit: 100,
    used_count: 0,
    start_date: new Date().toISOString().split('T')[0],
    end_date: '',
    is_active: true
  });

  const loadCoupons = async () => {
    setIsLoading(true);
    try {
      const data = await couponService.getCoupons(orgId);
      setCoupons(data);
    } catch (e: any) {
      showToast('فشل تحميل الكوبونات: ' + e.message, 'error');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadCoupons();
  }, [orgId]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.code?.trim() || !formData.name?.trim()) {
      showToast('يرجى ملء كود واسم الكوبون', 'error');
      return;
    }

    try {
      await couponService.saveCoupon({
        ...formData,
        id: editingId || undefined
      }, orgId);

      showToast(editingId ? 'تم تحديث الكوبون بنجاح' : 'تم إنشاء الكوبون بنجاح ✅', 'success');
      setIsModalOpen(false);
      loadCoupons();
    } catch (e: any) {
      showToast('فشل حفظ الكوبون: ' + e.message, 'error');
    }
  };

  const handleToggleActive = async (coupon: RetailCoupon) => {
    try {
      await couponService.saveCoupon({ ...coupon, is_active: !coupon.is_active }, orgId);
      showToast(coupon.is_active ? 'تم إيقاف الكوبون' : 'تم تفعيل الكوبون', 'info');
      loadCoupons();
    } catch (e: any) {
      showToast('فشل تحديث الحالة: ' + e.message, 'error');
    }
  };

  return (
    <div className="space-y-6">
      {/* Action Bar */}
      <div className="flex items-center justify-between bg-slate-900/40 p-4 rounded-2xl border border-slate-800">
        <div>
          <h2 className="text-lg font-black text-white flex items-center gap-2">
            <Ticket size={20} className="text-amber-400" />
            أكواد الخصم وقسائم الشراء الترويجية (Promo Codes)
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            أنشئ كوبونات تسويقية برمز كود مخصص ونسبة أو مبلغ خصم مع سقف الاستخدام وتاريخ الصلاحية
          </p>
        </div>

        <button
          onClick={() => {
            setEditingId(null);
            setFormData({
              code: '',
              name: '',
              discount_type: 'PERCENT',
              discount_value: 10,
              min_order_amount: 100,
              max_discount_amount: 50,
              usage_limit: 100,
              used_count: 0,
              start_date: new Date().toISOString().split('T')[0],
              end_date: '',
              is_active: true
            });
            setIsModalOpen(true);
          }}
          className="bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2.5 rounded-xl font-bold text-xs flex items-center gap-2 shadow-lg shadow-indigo-600/20 transition-all active:scale-95"
        >
          <Plus size={16} />
          إنشاء كود كوبون جديد
        </button>
      </div>

      {/* Coupons List Grid */}
      {coupons.length === 0 ? (
        <div className="text-center p-12 border border-dashed border-slate-800 rounded-2xl bg-slate-900/20">
          <Ticket size={40} className="mx-auto text-slate-600 mb-2" />
          <p className="text-slate-400 font-bold text-sm">لا توجد كوبونات مسجلة حالياً</p>
          <p className="text-xs text-slate-500 mt-1">اضغط على زر إنشاء كود كوبون جديد للبدء</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {coupons.map(coupon => (
            <div
              key={coupon.id}
              className={`rounded-2xl border p-5 transition-all flex flex-col justify-between relative overflow-hidden ${
                coupon.is_active 
                  ? 'bg-slate-900/90 border-slate-800 hover:border-slate-700 shadow-sm' 
                  : 'bg-slate-950 border-slate-900 opacity-60'
              }`}
            >
              <div>
                <div className="flex items-center justify-between mb-3">
                  <span className="font-mono font-black text-sm bg-indigo-950/80 text-indigo-300 border border-indigo-800 px-3 py-1 rounded-lg tracking-wider">
                    {coupon.code}
                  </span>
                  <button
                    onClick={() => handleToggleActive(coupon)}
                    className={`text-xs px-2.5 py-1 rounded-full font-bold flex items-center gap-1 transition-all ${
                      coupon.is_active 
                        ? 'bg-emerald-950/80 text-emerald-400 border border-emerald-800' 
                        : 'bg-rose-950/80 text-rose-400 border border-rose-800'
                    }`}
                  >
                    {coupon.is_active ? <CheckCircle2 size={12} /> : <XCircle size={12} />}
                    {coupon.is_active ? 'نشط' : 'متوقف'}
                  </button>
                </div>

                <h3 className="font-black text-white text-base mb-1">{coupon.name}</h3>
                <div className="text-sm font-bold text-amber-400 flex items-center gap-1 mt-2">
                  {coupon.discount_type === 'PERCENT' ? (
                    <>
                      <Percent size={14} /> خصم {coupon.discount_value}% 
                      {coupon.max_discount_amount && <span className="text-xs text-slate-400 font-normal">(بحد أقصى {coupon.max_discount_amount} ج.م)</span>}
                    </>
                  ) : (
                    <>
                      <DollarSign size={14} /> خصم ثابت {coupon.discount_value} ج.م
                    </>
                  )}
                </div>

                <div className="mt-3 pt-3 border-t border-slate-800/80 space-y-1.5 text-xs text-slate-400">
                  {coupon.min_order_amount && (
                    <div className="flex items-center justify-between">
                      <span>الحد الأدنى للطلب:</span>
                      <span className="font-bold text-slate-200">{coupon.min_order_amount} ج.م</span>
                    </div>
                  )}
                  <div className="flex items-center justify-between">
                    <span>مرات الاستخدام:</span>
                    <span className="font-bold text-indigo-400">
                      {coupon.used_count} {coupon.usage_limit ? `/ ${coupon.usage_limit}` : 'مرة'}
                    </span>
                  </div>
                  {coupon.end_date && (
                    <div className="flex items-center justify-between">
                      <span>تاريخ الانتهاء:</span>
                      <span className="font-mono text-slate-300">{coupon.end_date}</span>
                    </div>
                  )}
                </div>
              </div>

              <div className="mt-4 pt-3 border-t border-slate-800/80 flex items-center justify-end gap-2">
                <button
                  onClick={() => {
                    setEditingId(coupon.id);
                    setFormData(coupon);
                    setIsModalOpen(true);
                  }}
                  className="p-2 text-slate-400 hover:text-indigo-400 hover:bg-slate-800 rounded-lg transition-all"
                  title="تعديل الكوبون"
                >
                  <Edit3 size={16} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal for Creating / Editing Coupon */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4" dir="rtl">
          <div className="bg-slate-900 border border-slate-800 w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-150">
            <div className="bg-slate-950 p-4 px-6 border-b border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Ticket size={20} className="text-amber-400" />
                <h3 className="font-black text-white text-base">
                  {editingId ? 'تعديل بيانات الكوبون' : 'إنشاء كود كوبون جديد'}
                </h3>
              </div>
              <button 
                onClick={() => setIsModalOpen(false)}
                className="p-1.5 text-slate-400 hover:text-white rounded-lg"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSave} className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1">كود الكوبون (الرمز) *</label>
                  <input
                    type="text"
                    required
                    value={formData.code || ''}
                    onChange={e => setFormData({ ...formData, code: e.target.value.toUpperCase() })}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-white font-mono font-bold uppercase focus:border-indigo-500 focus:outline-none"
                    placeholder="مثال: SAVE20"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1">نوع الخصم *</label>
                  <select
                    value={formData.discount_type}
                    onChange={e => setFormData({ ...formData, discount_type: e.target.value as any })}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-white font-bold focus:border-indigo-500 focus:outline-none"
                  >
                    <option value="PERCENT">نسبة مئوية (%)</option>
                    <option value="FIXED">مبلغ ثابت (ج.م)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1">اسم / وصف الكوبون *</label>
                <input
                  type="text"
                  required
                  value={formData.name || ''}
                  onChange={e => setFormData({ ...formData, name: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-white font-bold focus:border-indigo-500 focus:outline-none"
                  placeholder="مثال: خصم الجمعة البيضاء"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1">قيمة الخصم *</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    required
                    value={formData.discount_value || ''}
                    onChange={e => setFormData({ ...formData, discount_value: parseFloat(e.target.value) || 0 })}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-amber-400 font-mono font-bold focus:border-indigo-500 focus:outline-none"
                    placeholder={formData.discount_type === 'PERCENT' ? "10%" : "50 ج.م"}
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1">الحد الأدنى للطلب (ج.م)</label>
                  <input
                    type="number"
                    step="1"
                    min="0"
                    value={formData.min_order_amount || ''}
                    onChange={e => setFormData({ ...formData, min_order_amount: parseFloat(e.target.value) || 0 })}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-white font-mono font-bold focus:border-indigo-500 focus:outline-none"
                    placeholder="100"
                  />
                </div>
              </div>

              {formData.discount_type === 'PERCENT' && (
                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1">الحد الأقصى لمبلغ الخصم (ج.م - اختياري)</label>
                  <input
                    type="number"
                    step="1"
                    min="0"
                    value={formData.max_discount_amount || ''}
                    onChange={e => setFormData({ ...formData, max_discount_amount: parseFloat(e.target.value) || undefined })}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-white font-mono font-bold focus:border-indigo-500 focus:outline-none"
                    placeholder="50"
                  />
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1">الحد الأقصى لمرات الاستخدام</label>
                  <input
                    type="number"
                    step="1"
                    min="1"
                    value={formData.usage_limit || ''}
                    onChange={e => setFormData({ ...formData, usage_limit: parseInt(e.target.value) || undefined })}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-white font-mono font-bold focus:border-indigo-500 focus:outline-none"
                    placeholder="100"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1">تاريخ الانتهاء</label>
                  <input
                    type="date"
                    value={formData.end_date || ''}
                    onChange={e => setFormData({ ...formData, end_date: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-white font-mono font-bold focus:border-indigo-500 focus:outline-none"
                  />
                </div>
              </div>

              <div className="pt-4 flex items-center justify-between border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl font-bold text-xs"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-bold text-xs shadow-lg shadow-indigo-600/20"
                >
                  حفظ واعتماد الكوبون
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

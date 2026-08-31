import React, { useState, useEffect } from 'react';
import { Tag, Plus, Sparkles, Calendar, Trash2, CheckCircle2, XCircle, Gift, Layers, ShoppingBag, Edit3, X, Percent, Ticket } from 'lucide-react';
import { supabase } from '../../../../supabaseClient';
import { useAccounting } from '../../../../context/AccountingContext';
import { useToast } from '../../../../context/ToastContext';
import { PromotionRule } from '../../services/promotionEngine';
import { secureStorage } from '../../../../utils/securityMiddleware';
import CouponsManagerTab from './CouponsManagerTab';

export default function PromotionsManager() {
  const { currentUser, currentSelectedOrgId } = useAccounting() as any;
  const { showToast } = useToast();
  const orgId = currentSelectedOrgId || currentUser?.organization_id;

  const [promotions, setPromotions] = useState<PromotionRule[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'promotions' | 'coupons'>('promotions');

  const [formData, setFormData] = useState<Partial<PromotionRule>>({
    name: '',
    type: 'BOGO',
    is_active: true,
    start_date: new Date().toISOString().split('T')[0],
    end_date: '',
    product_id: '',
    category_id: '',
    buy_qty: 2,
    get_free_qty: 1,
    tiered_qty: 3,
    tiered_fixed_price: 100,
    discount_percentage: 10,
    min_spend_amount: 500,
    discount_amount: 50
  });

  const loadData = async () => {
    if (!orgId) return;
    setIsLoading(true);
    try {
      // 1. Load Products & Categories
      const [prodRes, catRes] = await Promise.all([
        supabase.from('products').select('id, name, sales_price, sku, barcode').eq('organization_id', orgId).eq('is_active', true).order('name'),
        supabase.from('item_categories').select('id, name').order('name')
      ]);
      setProducts(prodRes.data || []);
      setCategories(catRes.data || []);

      // 2. Load Promotions (from DB table if exists, else fallback to localStorage)
      try {
        const { data: promoData, error } = await supabase
          .from('retail_promotions')
          .select('*')
          .eq('organization_id', orgId)
          .order('created_at', { ascending: false });
        if (!error && promoData) {
          setPromotions(promoData);
          return;
        }
      } catch (e) {
        // Table doesn't exist yet, fallback to localStorage
      }

      const localPromos = secureStorage.getItem(`tripro_promos_${orgId}`) as PromotionRule[];
      if (localPromos && Array.isArray(localPromos)) {
        setPromotions(localPromos);
      } else {
        // Seed default demo promos
        const defaultPromos: PromotionRule[] = [
          {
            id: 'promo-1',
            name: 'اشترِ 2 واحصل على 1 مجاناً',
            type: 'BOGO',
            is_active: true,
            buy_qty: 2,
            get_free_qty: 1,
            start_date: new Date().toISOString().split('T')[0]
          }
        ];
        setPromotions(defaultPromos);
        secureStorage.setItem(`tripro_promos_${orgId}`, defaultPromos);
      }
    } catch (err: any) {
      showToast('خطأ أثناء تحميل العروض: ' + err.message, 'error');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [orgId]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name?.trim()) {
      showToast('يرجى إدخال اسم العرض الترويجي', 'error');
      return;
    }

    try {
      const selectedProduct = products.find(p => p.id === formData.product_id);
      const newPromo: PromotionRule = {
        id: editingId || `promo_${Date.now()}`,
        name: formData.name,
        type: formData.type || 'BOGO',
        is_active: formData.is_active ?? true,
        start_date: formData.start_date || null,
        end_date: formData.end_date || null,
        product_id: formData.product_id || null,
        product_name: selectedProduct?.name,
        category_id: formData.category_id || null,
        buy_qty: Number(formData.buy_qty) || 2,
        get_free_qty: Number(formData.get_free_qty) || 1,
        tiered_qty: Number(formData.tiered_qty) || 3,
        tiered_fixed_price: Number(formData.tiered_fixed_price) || 0,
        discount_percentage: Number(formData.discount_percentage) || 0,
      };

      // Try save to Supabase
      try {
        await supabase.from('retail_promotions').upsert({
          ...newPromo,
          organization_id: orgId
        });
      } catch (e) {
        // Fallback local
      }

      let updated: PromotionRule[];
      if (editingId) {
        updated = promotions.map(p => p.id === editingId ? newPromo : p);
      } else {
        updated = [newPromo, ...promotions];
      }
      setPromotions(updated);
      secureStorage.setItem(`tripro_promos_${orgId}`, updated);

      showToast('تم حفظ العرض الترويجي بنجاح ✅', 'success');
      setIsModalOpen(false);
      setEditingId(null);
    } catch (err: any) {
      showToast('فشل حفظ العرض: ' + err.message, 'error');
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('هل أنت متأكد من حذف هذا العرض الترويجي؟')) return;
    try {
      try { await supabase.from('retail_promotions').delete().eq('id', id); } catch (e) {}
      const updated = promotions.filter(p => p.id !== id);
      setPromotions(updated);
      secureStorage.setItem(`tripro_promos_${orgId}`, updated);
      showToast('تم حذف العرض الترويجي بنجاح', 'success');
    } catch (err: any) {
      showToast('خطأ أثناء الحذف: ' + err.message, 'error');
    }
  };

  const handleToggleActive = async (promo: PromotionRule) => {
    const updated = promotions.map(p => p.id === promo.id ? { ...p, is_active: !p.is_active } : p);
    setPromotions(updated);
    secureStorage.setItem(`tripro_promos_${orgId}`, updated);
    showToast(promo.is_active ? 'تم إيقاف العرض' : 'تم تفعيل العرض بنجاح ✅', 'info');
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6 animate-in fade-in" dir="rtl">
      {/* Header */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 bg-gradient-to-r from-purple-700 via-indigo-700 to-purple-900 p-6 rounded-2xl text-white shadow-xl">
        <div>
          <div className="flex items-center gap-2">
            <Sparkles className="text-amber-300" size={28} />
            <h1 className="text-2xl font-black">إدارة العروض الترويجية والكوبونات (Promotions & Coupons)</h1>
          </div>
          <p className="text-purple-100 text-sm mt-1">
            صمم عروض الهايبر ماركت التلقائية (BOGO، عروض الكميات، خصومات الأقسام) وأكواد قسائم الشراء لتطبق فورياً في شاشة الكاشير.
          </p>
        </div>
        {activeTab === 'promotions' && (
          <button
            onClick={() => {
              setEditingId(null);
              setFormData({
                name: '',
                type: 'BOGO',
                is_active: true,
                start_date: new Date().toISOString().split('T')[0],
                buy_qty: 2,
                get_free_qty: 1,
                tiered_qty: 3,
                tiered_fixed_price: 100,
                discount_percentage: 10
              });
              setIsModalOpen(true);
            }}
            className="bg-amber-400 hover:bg-amber-300 text-slate-900 px-5 py-3 rounded-xl font-bold text-sm flex items-center gap-2 shadow-lg hover:shadow-amber-400/20 transition-all active:scale-95"
          >
            <Plus size={18} />
            <span>إنشاء عرض ترويجي جديد</span>
          </button>
        )}
      </div>

      {/* Navigation Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-200 pb-2">
        <button
          onClick={() => setActiveTab('promotions')}
          className={`px-5 py-2.5 rounded-xl font-bold text-sm flex items-center gap-2 transition-all ${
            activeTab === 'promotions'
              ? 'bg-purple-700 text-white shadow-md shadow-purple-700/20'
              : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
          }`}
        >
          <Sparkles size={16} />
          العروض الترويجية والخصومات التلقائية ({promotions.length})
        </button>

        <button
          onClick={() => setActiveTab('coupons')}
          className={`px-5 py-2.5 rounded-xl font-bold text-sm flex items-center gap-2 transition-all ${
            activeTab === 'coupons'
              ? 'bg-purple-700 text-white shadow-md shadow-purple-700/20'
              : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
          }`}
        >
          <Ticket size={16} />
          أكواد الخصم وقسائم الشراء (Promo Codes)
        </button>
      </div>

      {/* Tab Content */}
      {activeTab === 'coupons' ? (
        <CouponsManagerTab />
      ) : (
        <>
          {/* Promotions Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {promotions.map(promo => {
          const prod = products.find(p => p.id === promo.product_id);
          const cat = categories.find(c => c.id === promo.category_id);

          return (
            <div
              key={promo.id}
              className={`rounded-2xl border bg-white p-5 shadow-sm transition-all hover:shadow-md flex flex-col justify-between relative overflow-hidden ${
                promo.is_active ? 'border-purple-200' : 'border-slate-200 opacity-60 bg-slate-50'
              }`}
            >
              {/* Badge */}
              <div className="flex items-center justify-between mb-3">
                <span className={`text-xs font-bold px-2.5 py-1 rounded-full flex items-center gap-1 ${
                  promo.type === 'BOGO' ? 'bg-amber-100 text-amber-800' :
                  promo.type === 'TIERED_QTY' ? 'bg-blue-100 text-blue-800' : 'bg-emerald-100 text-emerald-800'
                }`}>
                  {promo.type === 'BOGO' && <Gift size={13} />}
                  {promo.type === 'TIERED_QTY' && <Layers size={13} />}
                  {promo.type === 'CATEGORY_DISCOUNT' && <Percent size={13} />}
                  {promo.type === 'BOGO' ? 'اشترِ X واحصل على Y' :
                   promo.type === 'TIERED_QTY' ? 'سعر خاص للكميات' : 'خصم نسبة على قسم'}
                </span>

                <button
                  onClick={() => handleToggleActive(promo)}
                  className={`text-xs font-bold px-2 py-0.5 rounded-md ${
                    promo.is_active ? 'bg-emerald-50 text-emerald-600 border border-emerald-200' : 'bg-slate-200 text-slate-600'
                  }`}
                >
                  {promo.is_active ? '● نشط بالكاشير' : 'موقف'}
                </button>
              </div>

              {/* Title & Details */}
              <div className="space-y-2 mb-4">
                <h3 className="text-base font-bold text-slate-800">{promo.name}</h3>
                
                {promo.type === 'BOGO' && (
                  <p className="text-xs text-slate-600 font-medium bg-purple-50 p-2.5 rounded-xl border border-purple-100">
                    🎁 اشترِ <span className="font-bold text-purple-700">{promo.buy_qty}</span> قطعة واحصل على <span className="font-bold text-emerald-600">{promo.get_free_qty}</span> مجاناً
                    {prod && <span className="block mt-1 font-bold text-slate-800">الصنف: {prod.name}</span>}
                  </p>
                )}

                {promo.type === 'TIERED_QTY' && (
                  <p className="text-xs text-slate-600 font-medium bg-blue-50 p-2.5 rounded-xl border border-blue-100">
                    🏷️ عند شراء <span className="font-bold text-blue-700">{promo.tiered_qty}</span> قطع يكون السعر الإجمالي <span className="font-bold text-emerald-600">{promo.tiered_fixed_price} ج.م</span>
                    {prod && <span className="block mt-1 font-bold text-slate-800">الصنف: {prod.name}</span>}
                  </p>
                )}

                {promo.type === 'CATEGORY_DISCOUNT' && (
                  <p className="text-xs text-slate-600 font-medium bg-emerald-50 p-2.5 rounded-xl border border-emerald-100">
                    % خصم بنسبة <span className="font-bold text-emerald-700">{promo.discount_percentage}%</span> على كافة منتجات:
                    <span className="block mt-1 font-bold text-slate-800">قسم {cat?.name || 'القسم المحدد'}</span>
                  </p>
                )}

                {/* Validity */}
                <div className="flex items-center gap-1.5 text-[11px] text-slate-500 pt-1">
                  <Calendar size={13} />
                  <span>
                    السريان: {promo.start_date || 'من الآن'} {promo.end_date ? `إلى ${promo.end_date}` : '(مستمر)'}
                  </span>
                </div>
              </div>

              {/* Actions */}
              <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
                <button
                  onClick={() => {
                    setEditingId(promo.id);
                    setFormData(promo);
                    setIsModalOpen(true);
                  }}
                  className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors text-xs font-bold flex items-center gap-1"
                >
                  <Edit3 size={15} />
                  <span>تعديل</span>
                </button>
                <button
                  onClick={() => handleDelete(promo.id)}
                  className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors text-xs font-bold flex items-center gap-1"
                >
                  <Trash2 size={15} />
                  <span>حذف</span>
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full border border-slate-200 overflow-hidden animate-in zoom-in-95">
            <div className="bg-gradient-to-r from-purple-700 to-indigo-700 text-white p-4 flex items-center justify-between">
              <h3 className="font-bold text-base flex items-center gap-2">
                <Sparkles size={20} className="text-amber-300" />
                <span>{editingId ? 'تعديل العرض الترويجي' : 'إنشاء عرض ترويجي جديد'}</span>
              </h3>
              <button onClick={() => setIsModalOpen(false)} className="text-white/80 hover:text-white">
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleSave} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">اسم العرض الترويجي *</label>
                <input
                  type="text"
                  required
                  placeholder="مثال: عرض الصيف على العصائر، أو اشتري 2 تونة + 1 مجاناً"
                  value={formData.name}
                  onChange={e => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl text-sm outline-none focus:ring-2 focus:ring-purple-500 font-medium"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">نوع العرض *</label>
                <select
                  value={formData.type}
                  onChange={e => setFormData({ ...formData, type: e.target.value as any })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl text-sm outline-none bg-white font-bold text-purple-900"
                >
                  <option value="BOGO">🎁 اشترِ X واحصل على Y مجاناً (Buy X Get Y Free)</option>
                  <option value="TIERED_QTY">🏷️ سعر خاص للكميات (مثال: 3 قطع بـ 100 ج.م)</option>
                  <option value="CATEGORY_DISCOUNT">% خصم نسبة مئوية على قسم / تصنيف كامل</option>
                </select>
              </div>

              {/* Dynamic Fields */}
              {formData.type === 'BOGO' && (
                <div className="space-y-3 bg-purple-50 p-3.5 rounded-xl border border-purple-100">
                  <div>
                    <label className="block text-xs font-bold text-purple-900 mb-1">الصنف المستهدف في العرض *</label>
                    <select
                      value={formData.product_id || ''}
                      onChange={e => setFormData({ ...formData, product_id: e.target.value })}
                      className="w-full px-3 py-2 border border-purple-300 rounded-lg text-sm bg-white"
                    >
                      <option value="">-- اختر الصنف --</option>
                      {products.map(p => (
                        <option key={p.id} value={p.id}>{p.name} ({p.sales_price} ج.م)</option>
                      ))}
                    </select>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">اشتري كمية (Buy)</label>
                      <input
                        type="number"
                        min="1"
                        value={formData.buy_qty}
                        onChange={e => setFormData({ ...formData, buy_qty: parseInt(e.target.value) || 1 })}
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">احصل مجاناً على (Get Free)</label>
                      <input
                        type="number"
                        min="1"
                        value={formData.get_free_qty}
                        onChange={e => setFormData({ ...formData, get_free_qty: parseInt(e.target.value) || 1 })}
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                      />
                    </div>
                  </div>
                </div>
              )}

              {formData.type === 'TIERED_QTY' && (
                <div className="space-y-3 bg-blue-50 p-3.5 rounded-xl border border-blue-100">
                  <div>
                    <label className="block text-xs font-bold text-blue-900 mb-1">الصنف المستهدف في العرض *</label>
                    <select
                      value={formData.product_id || ''}
                      onChange={e => setFormData({ ...formData, product_id: e.target.value })}
                      className="w-full px-3 py-2 border border-blue-300 rounded-lg text-sm bg-white"
                    >
                      <option value="">-- اختر الصنف --</option>
                      {products.map(p => (
                        <option key={p.id} value={p.id}>{p.name} ({p.sales_price} ج.م)</option>
                      ))}
                    </select>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">الكمية المطلوبة</label>
                      <input
                        type="number"
                        min="2"
                        value={formData.tiered_qty}
                        onChange={e => setFormData({ ...formData, tiered_qty: parseInt(e.target.value) || 2 })}
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">السعر الإجمالي للكمية (ج.م)</label>
                      <input
                        type="number"
                        step="0.01"
                        value={formData.tiered_fixed_price}
                        onChange={e => setFormData({ ...formData, tiered_fixed_price: parseFloat(e.target.value) || 0 })}
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                      />
                    </div>
                  </div>
                </div>
              )}

              {formData.type === 'CATEGORY_DISCOUNT' && (
                <div className="space-y-3 bg-emerald-50 p-3.5 rounded-xl border border-emerald-100">
                  <div>
                    <label className="block text-xs font-bold text-emerald-900 mb-1">القسم / التصنيف المستهدف *</label>
                    <select
                      value={formData.category_id || ''}
                      onChange={e => setFormData({ ...formData, category_id: e.target.value })}
                      className="w-full px-3 py-2 border border-emerald-300 rounded-lg text-sm bg-white"
                    >
                      <option value="">-- اختر القسم --</option>
                      {categories.map(c => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">نسبة الخصم %</label>
                    <input
                      type="number"
                      min="1"
                      max="100"
                      value={formData.discount_percentage}
                      onChange={e => setFormData({ ...formData, discount_percentage: parseFloat(e.target.value) || 0 })}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                    />
                  </div>
                </div>
              )}

              {/* Dates */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">تاريخ بداية العرض</label>
                  <input
                    type="date"
                    value={formData.start_date || ''}
                    onChange={e => setFormData({ ...formData, start_date: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">تاريخ نهاية العرض (اختياري)</label>
                  <input
                    type="date"
                    value={formData.end_date || ''}
                    onChange={e => setFormData({ ...formData, end_date: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl text-sm"
                  />
                </div>
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="w-1/2 py-2.5 rounded-xl border border-slate-300 text-slate-600 font-bold text-sm hover:bg-slate-50"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="w-1/2 py-2.5 rounded-xl bg-purple-700 hover:bg-purple-800 text-white font-bold text-sm shadow-md"
                >
                  حفظ وتفعيل العرض
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
        </>
      )}
    </div>
  );
}

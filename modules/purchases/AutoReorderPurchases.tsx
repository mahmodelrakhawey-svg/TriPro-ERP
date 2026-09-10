import React, { useState, useMemo, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAccounting } from '../../context/AccountingContext';
import { useToast } from '../../context/ToastContext';
import {
  ReorderItemRecommendation,
  autoReorderService
} from '../../services/autoReorderService';
import {
  FilePlus,
  Search,
  Zap,
  FileText,
  RefreshCw,
  ExternalLink,
  Truck,
  Filter,
  CheckSquare,
  Square,
  Layers,
  AlertCircle,
  Tag
} from 'lucide-react';

export const AutoReorderPurchases: React.FC = () => {
  const { products, suppliers, categories, currentUser } = useAccounting();
  const { showToast } = useToast();

  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [selectedSupplier, setSelectedSupplier] = useState<string>('ALL');
  const [selectedUrgency, setSelectedUrgency] = useState<string>('ALL');
  const [selectedItemIds, setSelectedItemIds] = useState<Set<string>>(new Set());
  const [isGenerating, setIsGenerating] = useState(false);
  const [recentOrders, setRecentOrders] = useState<any[]>([]);

  const fetchRecentOrders = async () => {
    const list = await autoReorderService.getRecentAutoPurchaseOrders(currentUser?.organization_id || undefined);
    setRecentOrders(list);
  };

  useEffect(() => {
    fetchRecentOrders();
  }, [currentUser]);

  // مسح وتحديد كافة النواقص مع ربط التصنيفات
  const allRecommendations = useMemo(() => {
    return autoReorderService.analyzeReorderNeeds(products, suppliers, categories);
  }, [products, suppliers, categories]);

  // تطبيق الفلاتر المختارة (التصنيف، المورد، درجة الإلحاح، والبحث)
  const filteredRecommendations = useMemo(() => {
    return allRecommendations.filter(r => {
      // فلتر التصنيف
      if (selectedCategory !== 'ALL' && r.categoryId !== selectedCategory) {
        return false;
      }
      // فلتر المورد
      if (selectedSupplier !== 'ALL' && r.preferredSupplierId !== selectedSupplier) {
        return false;
      }
      // فلتر درجة الإلحاح
      if (selectedUrgency !== 'ALL' && r.urgency !== selectedUrgency) {
        return false;
      }
      // فلتر البحث بالاسم أو الكود
      if (searchTerm.trim()) {
        const query = searchTerm.toLowerCase();
        const matchName = r.productName.toLowerCase().includes(query);
        const matchSku = r.sku.toLowerCase().includes(query);
        const matchSupplier = r.preferredSupplierName?.toLowerCase().includes(query) || false;
        const matchCategory = r.categoryName?.toLowerCase().includes(query) || false;
        if (!matchName && !matchSku && !matchSupplier && !matchCategory) return false;
      }
      return true;
    });
  }, [allRecommendations, selectedCategory, selectedSupplier, selectedUrgency, searchTerm]);

  // تحديث التحديد التلقائي عند تغيير الفلتر
  useEffect(() => {
    // تحديد كافة الأصناف الظاهرة في الفلتر الحالي افتراضياً
    const newSelected = new Set(filteredRecommendations.map(r => r.productId));
    setSelectedItemIds(newSelected);
  }, [filteredRecommendations]);

  // الأصناف المحددة فعلياً والمطلوب إنشاؤها
  const itemsToOrder = useMemo(() => {
    return filteredRecommendations.filter(r => selectedItemIds.has(r.productId));
  }, [filteredRecommendations, selectedItemIds]);

  // إجمالي الميزانية للأصناف المحددة فقط
  const totalEstimatedBudget = useMemo(() => {
    return itemsToOrder.reduce((sum, r) => sum + r.estimatedCost, 0);
  }, [itemsToOrder]);

  // الموردون المستهدفون في الأصناف المحددة فقط
  const targetedSuppliersCount = useMemo(() => {
    return new Set(itemsToOrder.map(r => r.preferredSupplierId || 'general')).size;
  }, [itemsToOrder]);

  // قائمة التصنيفات الفريدة التي بها نواقص فعلياً لتسهيل الفلترة السريعة
  const availableCategoriesInShortage = useMemo(() => {
    const catMap = new Map<string, { id: string; name: string; count: number }>();
    allRecommendations.forEach(r => {
      const catId = r.categoryId || 'uncategorized';
      const catName = r.categoryName || 'بدون تصنيف';
      if (!catMap.has(catId)) {
        catMap.set(catId, { id: catId, name: catName, count: 0 });
      }
      catMap.get(catId)!.count += 1;
    });
    return Array.from(catMap.values());
  }, [allRecommendations]);

  // تحديد / إلغاء تحديد الكل
  const handleToggleSelectAll = () => {
    if (selectedItemIds.size === filteredRecommendations.length) {
      setSelectedItemIds(new Set());
    } else {
      setSelectedItemIds(new Set(filteredRecommendations.map(r => r.productId)));
    }
  };

  const handleToggleItem = (id: string) => {
    setSelectedItemIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // توليد أوامر الشراء للأصناف المفلترة والمحددة فقط
  const handleGenerateOrders = async () => {
    if (itemsToOrder.length === 0) {
      showToast('يرجى تحديد صنف واحد على الأقل من الفلتر لتوليد أمر الشراء ⚠️', 'warning');
      return;
    }

    setIsGenerating(true);
    try {
      const res = await autoReorderService.generateDraftPurchaseOrders(
        itemsToOrder, // إرسال الأصناف المحددة بالفلتر فقط!
        currentUser?.organization_id || undefined,
        currentUser?.id
      );

      if (res.success) {
        showToast(`تم إنشاء ${res.createdOrdersCount} أوامر شراء بنجاح لـ ${itemsToOrder.length} صنف مفلتر 📋`, 'success');
        if (res.createdOrders && res.createdOrders.length > 0) {
          setRecentOrders(prev => [...res.createdOrders, ...prev]);
        } else {
          await fetchRecentOrders();
        }
      } else {
        showToast('خطأ: ' + (res.errors?.[0] || 'تعذر الإنشاء'), 'error');
      }
    } catch (e: any) {
      showToast('خطأ: ' + e.message, 'error');
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-7xl mx-auto animate-in fade-in" dir="rtl">
      {/* Header */}
      <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm flex flex-wrap justify-between items-center gap-4">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-gradient-to-br from-amber-500 to-orange-600 rounded-2xl text-white shadow-md">
            <Zap className="w-8 h-8" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-2xl font-black text-slate-800">أوامر الشراء التلقائية وفق حد الأمان (Auto Reorder)</h2>
              <span className="bg-orange-100 text-orange-800 text-xs px-2.5 py-0.5 rounded-full font-bold">
                إدارة المشتريات
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-1">
              فلترة وتحديد نواقص الأصناف حسب التصنيف أو المورد، وتوليد أوامر الشراء التلقائية للأصناف المفلترة فقط بنقرة واحدة.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Link
            to="/purchase-order-list"
            className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold flex items-center gap-1.5 transition"
          >
            <FileText className="w-4 h-4 text-slate-500" /> سجل أوامر الشراء
          </Link>
          <button
            onClick={handleGenerateOrders}
            disabled={isGenerating || itemsToOrder.length === 0}
            className="px-6 py-2.5 bg-orange-600 hover:bg-orange-700 disabled:opacity-40 text-white rounded-xl text-xs font-bold flex items-center gap-2 shadow-lg shadow-orange-600/20 transition"
          >
            <FilePlus className="w-4 h-4" />
            {isGenerating
              ? 'جاري التوليد...'
              : `توليد أوامر شراء للأصناف المفلترة (${itemsToOrder.length})`}
          </button>
        </div>
      </div>

      {/* KPI Cards (تتحدث ديناميكياً مع الفلتر) */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-sm">
          <span className="text-xs font-bold text-slate-500 block mb-1">الأصناف المحددة للشراء في الفلتر</span>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-black text-rose-600 font-mono">{itemsToOrder.length}</span>
            <span className="text-xs text-slate-400">من إجمالي {allRecommendations.length} صنف ناقص</span>
          </div>
          <span className="text-xs text-slate-400 block mt-1">
            {itemsToOrder.filter(r => r.urgency === 'CRITICAL').length} صنف نفد تماماً (رصيد 0)
          </span>
        </div>

        <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-sm">
          <span className="text-xs font-bold text-slate-500 block mb-1">الموردون المستهدفون في الفلتر</span>
          <span className="text-3xl font-black text-indigo-600 font-mono">
            {targetedSuppliersCount}
          </span>
          <span className="text-xs text-slate-400 block mt-1">سيتم إنشاء أمر شراء مستقل لكل مورد في القائمة</span>
        </div>

        <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-sm">
          <span className="text-xs font-bold text-slate-500 block mb-1">الميزانية التقديرية للأصناف المفلترة</span>
          <span className="text-3xl font-black text-emerald-600 font-mono">
            {totalEstimatedBudget.toLocaleString()} ج
          </span>
          <span className="text-xs text-slate-400 block mt-1">تكلفة الكميات اللازمة للوصول للحد الأقصى</span>
        </div>
      </div>

      {/* 🎯 لوحة الفلاتر التفاعلية المتقدمة */}
      <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-sm space-y-4">
        <div className="flex items-center justify-between border-b pb-3">
          <div className="flex items-center gap-2">
            <Filter className="w-5 h-5 text-orange-600" />
            <h3 className="font-bold text-slate-800 text-sm">فلترة النواقص قبل توليد أمر الشراء</h3>
          </div>
          {(selectedCategory !== 'ALL' || selectedSupplier !== 'ALL' || selectedUrgency !== 'ALL' || searchTerm) && (
            <button
              onClick={() => {
                setSelectedCategory('ALL');
                setSelectedSupplier('ALL');
                setSelectedUrgency('ALL');
                setSearchTerm('');
              }}
              className="text-xs text-orange-600 hover:text-orange-800 font-bold transition"
            >
              إعادة تعيين الفلاتر 🔄
            </button>
          )}
        </div>

        {/* أزرار سريعة للتصنيفات التي بها نواقص */}
        {availableCategoriesInShortage.length > 0 && (
          <div className="space-y-1.5">
            <span className="text-[11px] font-bold text-slate-500 flex items-center gap-1">
              <Tag className="w-3.5 h-3.5 text-slate-400" /> تصنيفات بها نواقص (اختيار سريع):
            </span>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => setSelectedCategory('ALL')}
                className={`px-3 py-1 rounded-xl text-xs font-bold transition flex items-center gap-1.5 ${
                  selectedCategory === 'ALL'
                    ? 'bg-orange-600 text-white shadow-sm'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                الكل ({allRecommendations.length})
              </button>
              {availableCategoriesInShortage.map(cat => (
                <button
                  key={cat.id}
                  onClick={() => setSelectedCategory(cat.id)}
                  className={`px-3 py-1 rounded-xl text-xs font-bold transition flex items-center gap-1.5 ${
                    selectedCategory === cat.id
                      ? 'bg-orange-600 text-white shadow-sm'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {cat.name}
                  <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono ${
                    selectedCategory === cat.id ? 'bg-orange-700 text-white' : 'bg-slate-200 text-slate-700'
                  }`}>
                    {cat.count}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-2">
          {/* فلتر التصنيف المنسدل */}
          <div>
            <label className="block text-xs font-bold text-slate-600 mb-1">تصنيف الصنف (Category)</label>
            <select
              value={selectedCategory}
              onChange={e => setSelectedCategory(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-700 outline-none focus:ring-2 focus:ring-orange-500"
            >
              <option value="ALL">جميع التصنيفات ({allRecommendations.length})</option>
              {categories.map(c => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          {/* فلتر المورد */}
          <div>
            <label className="block text-xs font-bold text-slate-600 mb-1">المورد المفضل (Supplier)</label>
            <select
              value={selectedSupplier}
              onChange={e => setSelectedSupplier(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-700 outline-none focus:ring-2 focus:ring-orange-500"
            >
              <option value="ALL">جميع الموردين</option>
              {suppliers.map(s => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>

          {/* فلتر درجة الإلحاح */}
          <div>
            <label className="block text-xs font-bold text-slate-600 mb-1">مستوى النقص (Urgency)</label>
            <select
              value={selectedUrgency}
              onChange={e => setSelectedUrgency(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-700 outline-none focus:ring-2 focus:ring-orange-500"
            >
              <option value="ALL">كافة المستويات</option>
              <option value="CRITICAL">🔴 حرج فقط (رصيد المخزون صفر)</option>
              <option value="LOW_STOCK">🟡 منخفض (أقل من نصف حد الأمان)</option>
              <option value="NORMAL">🟢 تحت حد الأمان</option>
            </select>
          </div>

          {/* شريط البحث النصي */}
          <div>
            <label className="block text-xs font-bold text-slate-600 mb-1">بحث بالاسم أو الكود</label>
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute right-3 top-2.5" />
              <input
                type="text"
                placeholder="اسم الصنف أو الكود..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl pr-9 pl-3 py-2 text-xs outline-none focus:ring-2 focus:ring-orange-500"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Reorder Table */}
      <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-4 bg-slate-50 border-b border-slate-100 flex justify-between items-center">
          <div className="flex items-center gap-2">
            <button
              onClick={handleToggleSelectAll}
              className="flex items-center gap-1.5 text-xs font-bold text-slate-700 hover:text-orange-600 transition"
            >
              {selectedItemIds.size === filteredRecommendations.length && filteredRecommendations.length > 0 ? (
                <CheckSquare className="w-4 h-4 text-orange-600" />
              ) : (
                <Square className="w-4 h-4 text-slate-400" />
              )}
              تحديد الكل بالفلتر ({selectedItemIds.size} من {filteredRecommendations.length})
            </button>
          </div>
          <span className="text-xs text-slate-400 font-bold">
            سيتم تضمين فقط الأصناف المحددة في أمر الشراء
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-right text-xs">
            <thead className="bg-slate-50/50 text-slate-500 font-bold border-b border-slate-100">
              <tr>
                <th className="p-4 w-12 text-center">اختيار</th>
                <th className="p-4">اسم الصنف</th>
                <th className="p-4 text-center">التصنيف</th>
                <th className="p-4 text-center">الرصيد الفعلي</th>
                <th className="p-4 text-center">حد الطلب</th>
                <th className="p-4 text-center">الكمية المقترح شراؤها</th>
                <th className="p-4 text-center">المورد المفضل</th>
                <th className="p-4 text-center">سعر الوحدة</th>
                <th className="p-4 text-left font-black text-slate-700">التكلفة التقديرية</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredRecommendations.length === 0 ? (
                <tr>
                  <td colSpan={9} className="p-12 text-center text-slate-400 font-bold">
                    لا توجد أصناف تطابق الفلتر المحدد حالياً 🎉
                  </td>
                </tr>
              ) : (
                filteredRecommendations.map(r => {
                  const isChecked = selectedItemIds.has(r.productId);
                  return (
                    <tr
                      key={r.productId}
                      onClick={() => handleToggleItem(r.productId)}
                      className={`cursor-pointer transition ${isChecked ? 'bg-orange-50/40 hover:bg-orange-50/70' : 'hover:bg-slate-50'}`}
                    >
                      <td className="p-4 text-center" onClick={e => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => handleToggleItem(r.productId)}
                          className="w-4 h-4 text-orange-600 rounded border-slate-300 focus:ring-orange-500 cursor-pointer"
                        />
                      </td>
                      <td className="p-4">
                        <div className="flex items-center gap-2">
                          <span
                            className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${
                              r.urgency === 'CRITICAL' ? 'bg-red-500 animate-ping' : 'bg-amber-500'
                            }`}
                          />
                          <div>
                            <span className="font-bold text-slate-800 text-sm block">{r.productName}</span>
                            <span className="text-[11px] text-slate-400 font-mono">{r.sku || '-'}</span>
                          </div>
                        </div>
                      </td>
                      <td className="p-4 text-center">
                        <span className="bg-slate-100 text-slate-700 px-2.5 py-0.5 rounded-lg text-[11px] font-bold">
                          {r.categoryName}
                        </span>
                      </td>
                      <td className="p-4 text-center font-bold font-mono text-sm">
                        <span className={r.currentStock <= 0 ? 'text-red-600' : 'text-amber-600'}>
                          {r.currentStock} {r.unit}
                        </span>
                      </td>
                      <td className="p-4 text-center font-bold font-mono text-slate-500">
                        {r.minSafetyStock} {r.unit}
                      </td>
                      <td className="p-4 text-center font-black font-mono text-orange-600 text-sm">
                        +{r.reorderQuantity} {r.unit}
                      </td>
                      <td className="p-4 text-center font-bold text-slate-700">
                        <span className="bg-slate-100 px-2.5 py-1 rounded-lg text-[11px]">{r.preferredSupplierName}</span>
                      </td>
                      <td className="p-4 text-center font-mono font-bold">{r.lastPurchasePrice.toFixed(2)} ج</td>
                      <td className="p-4 text-left font-black font-mono text-emerald-700 text-sm">
                        {r.estimatedCost.toFixed(2)} ج
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Generated Purchase Orders History */}
      <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden space-y-3 p-5">
        <div className="flex justify-between items-center border-b pb-3">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-orange-50 text-orange-600 rounded-xl">
              <Truck className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-sm text-slate-800">أوامر الشراء التي تم توليدها آلياً ({recentOrders.length})</h3>
              <p className="text-[11px] text-slate-400">سجل مسودات أوامر الشراء التلقائية المحفوظة بالنظام وجاهزة للمراجعة والتعميد</p>
            </div>
          </div>
          <button
            onClick={fetchRecentOrders}
            className="p-2 border rounded-xl text-slate-500 hover:bg-slate-50 text-xs flex items-center gap-1"
          >
            <RefreshCw className="w-3.5 h-3.5" /> تحديث
          </button>
        </div>

        {recentOrders.length === 0 ? (
          <div className="p-8 text-center text-slate-400 text-xs">
            لم يتم توليد أوامر شراء بعد. اضبط الفلتر واضغط على الزر البرتقالي بالأعلى لتجهيزها فورياً للأصناف المختارة.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-right text-xs">
              <thead className="bg-slate-50 text-slate-500 font-bold border-b border-slate-100">
                <tr>
                  <th className="p-3">رقم أمر الشراء</th>
                  <th className="p-3">المورد</th>
                  <th className="p-3 text-center">التاريخ</th>
                  <th className="p-3 text-center">الحالة</th>
                  <th className="p-3 text-left font-black text-slate-700">إجمالي القيمة</th>
                  <th className="p-3 text-center">الإجراء</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {recentOrders.map(ord => (
                  <tr key={ord.id} className="hover:bg-slate-50 transition">
                    <td className="p-3 font-mono font-bold text-orange-600">
                      {ord.po_number}
                    </td>
                    <td className="p-3 font-bold text-slate-800">
                      {ord.supplier_name}
                    </td>
                    <td className="p-3 text-center text-slate-500 font-mono">
                      {ord.order_date}
                    </td>
                    <td className="p-3 text-center">
                      <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800">
                        مسودة (Draft)
                      </span>
                    </td>
                    <td className="p-3 text-left font-black font-mono text-emerald-600 text-sm">
                      {ord.total_amount.toFixed(2)} ج
                    </td>
                    <td className="p-3 text-center">
                      <Link
                        to={`/purchase-order-new?id=${ord.id}`}
                        className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl font-bold flex items-center gap-1 justify-center mx-auto shadow transition text-[11px]"
                      >
                        <ExternalLink className="w-3 h-3" /> فتح في أوامر الشراء
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default AutoReorderPurchases;

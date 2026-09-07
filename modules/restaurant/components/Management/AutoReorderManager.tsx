import React, { useState, useMemo, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAccounting } from '../../../../context/AccountingContext';
import { useToast } from '../../../../context/ToastContext';
import {
  ReorderItemRecommendation,
  autoReorderService
} from '../../../../services/autoReorderService';
import {
  ShoppingCart,
  AlertTriangle,
  FilePlus,
  Truck,
  CheckCircle2,
  Sparkles,
  Search,
  Zap,
  Package,
  Layers,
  ExternalLink,
  FileText,
  RefreshCw
} from 'lucide-react';

export const AutoReorderManager: React.FC = () => {
  const { products, suppliers, currentUser } = useAccounting();
  const { showToast } = useToast();

  const [searchTerm, setSearchTerm] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [recentOrders, setRecentOrders] = useState<any[]>([]);

  const fetchRecentOrders = async () => {
    const list = await autoReorderService.getRecentAutoPurchaseOrders(currentUser?.organization_id || undefined);
    setRecentOrders(list);
  };

  useEffect(() => {
    fetchRecentOrders();
  }, [currentUser]);

  const recommendations = useMemo(() => {
    return autoReorderService.analyzeReorderNeeds(products, suppliers);
  }, [products, suppliers]);

  const filtered = recommendations.filter(
    r =>
      r.productName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      r.sku.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (r.preferredSupplierName && r.preferredSupplierName.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  const totalEstimatedBudget = useMemo(() => {
    return recommendations.reduce((sum, r) => sum + r.estimatedCost, 0);
  }, [recommendations]);

  const handleGenerateOrders = async () => {
    if (recommendations.length === 0) {
      showToast('لا توجد نواقص تستدعي إنشاء أوامر شراء حالياً 🎉', 'info');
      return;
    }

    setIsGenerating(true);
    try {
      const res = await autoReorderService.generateDraftPurchaseOrders(
        recommendations,
        currentUser?.organization_id || undefined,
        currentUser?.id
      );

      if (res.success) {
        showToast(`تم إنشاء ${res.createdOrdersCount} مسودات أوامر شراء للموردين بنجاح 📋`, 'success');
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
    <div className="p-4 md:p-6 space-y-6 max-w-7xl mx-auto animate-in fade-in">
      {/* Header */}
      <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm flex flex-wrap justify-between items-center gap-4">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-gradient-to-br from-emerald-500 to-teal-700 rounded-2xl text-white shadow-md">
            <Zap className="w-8 h-8" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-2xl font-black text-slate-800">أوامر الشراء التلقائية وفق حد الأمان (Auto Reorder)</h2>
              <span className="bg-emerald-100 text-emerald-800 text-xs px-2.5 py-0.5 rounded-full font-bold">
                Smart Procurement
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-1">
              مسح فوري لأرصدة الخامات والمكونات، واحتساب كميات النواقص وتوليد أوامر الشراء للموردين بنقرة واحدة
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Link
            to="/purchase-orders"
            className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold flex items-center gap-1.5 transition"
          >
            <FileText className="w-4 h-4 text-slate-500" /> سجل أوامر الشراء
          </Link>
          <button
            onClick={handleGenerateOrders}
            disabled={isGenerating || recommendations.length === 0}
            className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 text-white rounded-xl text-xs font-bold flex items-center gap-2 shadow-lg shadow-emerald-600/20 transition"
          >
            <FilePlus className="w-4 h-4" /> توليد مسودات أوامر الشراء للموردين الآن ({recommendations.length})
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-sm">
          <span className="text-xs font-bold text-slate-500 block mb-1">أصناف تحت حد الأمان (نواقص)</span>
          <span className="text-3xl font-black text-rose-600 font-mono">{recommendations.length}</span>
          <span className="text-xs text-slate-400 block mt-1">
            منها {recommendations.filter(r => r.urgency === 'CRITICAL').length} أصناف برصيد 0
          </span>
        </div>

        <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-sm">
          <span className="text-xs font-bold text-slate-500 block mb-1">الموردون المستهدفون</span>
          <span className="text-3xl font-black text-indigo-600 font-mono">
            {new Set(recommendations.map(r => r.preferredSupplierName)).size}
          </span>
          <span className="text-xs text-slate-400 block mt-1">سيتم إنشاء أمر شراء مستقل لكل مورد</span>
        </div>

        <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-sm">
          <span className="text-xs font-bold text-slate-500 block mb-1">إجمالي الميزانية التقديرية للطلبيات</span>
          <span className="text-3xl font-black text-emerald-600 font-mono">
            {totalEstimatedBudget.toLocaleString()} ج
          </span>
          <span className="text-xs text-slate-400 block mt-1">بناءً على آخر سعر شراء مسجل</span>
        </div>
      </div>

      {/* Search */}
      <div className="flex justify-between items-center gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-slate-400 absolute right-3.5 top-3" />
          <input
            type="text"
            placeholder="بحث بالصنف أو الكود أو المورد..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="w-full bg-white border border-slate-200 rounded-2xl pr-10 pl-4 py-2.5 text-xs outline-none focus:ring-2 focus:ring-emerald-500 shadow-sm"
          />
        </div>
      </div>

      {/* Reorder Table */}
      <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-right text-xs">
            <thead className="bg-slate-50 text-slate-500 font-bold border-b border-slate-100">
              <tr>
                <th className="p-4">اسم الصنف / المادة الخام</th>
                <th className="p-4 text-center">الرصيد الفعلي</th>
                <th className="p-4 text-center">حد الأمان (Min)</th>
                <th className="p-4 text-center">الكمية المقترح شراؤها</th>
                <th className="p-4 text-center">المورد المفضل</th>
                <th className="p-4 text-center">سعر الوحدة</th>
                <th className="p-4 text-left font-black text-slate-700">التكلفة التقديرية</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-12 text-center text-slate-400 font-bold">
                    المخازن بحالة ممتازة! لا توجد خامات هبطت عن حد الأمان 🎉
                  </td>
                </tr>
              ) : (
                filtered.map(r => (
                  <tr key={r.productId} className="hover:bg-slate-50 transition">
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
                    <td className="p-4 text-center font-bold font-mono text-sm">
                      <span className={r.currentStock <= 0 ? 'text-red-600' : 'text-amber-600'}>
                        {r.currentStock} {r.unit}
                      </span>
                    </td>
                    <td className="p-4 text-center font-bold font-mono text-slate-500">
                      {r.minSafetyStock} {r.unit}
                    </td>
                    <td className="p-4 text-center font-black font-mono text-emerald-600 text-sm">
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
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Generated Purchase Orders History */}
      <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden space-y-3 p-5">
        <div className="flex justify-between items-center border-b pb-3">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-indigo-50 text-indigo-600 rounded-xl">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-sm text-slate-800">أوامر الشراء التي تم إنشاؤها وتوليدها آلياً ({recentOrders.length})</h3>
              <p className="text-[11px] text-slate-400">سجل مسودات أوامر الشراء المحفوظة في النظام وجاهزة للمراجعة والتعميد</p>
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
            لم يتم توليد أوامر شراء بعد. اضغط على الزر الأخضر بالأعلى لإنشائها فورياً.
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
                    <td className="p-3 font-mono font-bold text-indigo-600">
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
export default AutoReorderManager;

import React, { useState, useEffect, useMemo } from 'react';
import {
  ButcheringOrder,
  ButcheringTemplate,
  butcheringYieldService,
  DEFAULT_BUTCHERING_TEMPLATES,
  BUTCHERING_SQL_SCHEMA
} from '../../../../services/butcheringYieldService';
import { useAccounting } from '../../../../context/AccountingContext';
import { useToast } from '../../../../context/ToastContext';
import { NewButcheringOrderModal } from './NewButcheringOrderModal';
import { YieldTemplatesModal } from './YieldTemplatesModal';
import { YieldAnalyticsReport } from './YieldAnalyticsReport';
import {
  Scale,
  Plus,
  Layers,
  Search,
  Calendar,
  Filter,
  Eye,
  Trash2,
  Printer,
  Sparkles,
  ChefHat,
  TrendingUp,
  AlertTriangle,
  CheckCircle2,
  FileText,
  DollarSign,
  Download,
  Loader2,
  Warehouse,
  Database,
  Copy,
  Check,
  X
} from 'lucide-react';

export const ButcheringYieldManager: React.FC = () => {
  const { currentUser, currentSelectedOrgId, warehouses, refreshData } = useAccounting();
  const { showToast } = useToast();

  const [activeTab, setActiveTab] = useState<'orders' | 'analytics' | 'templates'>('orders');
  const [orders, setOrders] = useState<ButcheringOrder[]>([]);
  const [templates, setTemplates] = useState<ButcheringTemplate[]>([]);
  const [loading, setLoading] = useState(true);

  // Modals state
  const [isNewOrderModalOpen, setIsNewOrderModalOpen] = useState(false);
  const [isTemplatesModalOpen, setIsTemplatesModalOpen] = useState(false);
  const [selectedOrderDetails, setSelectedOrderDetails] = useState<ButcheringOrder | null>(null);
  const [isSqlModalOpen, setIsSqlModalOpen] = useState(false);
  const [copiedSql, setCopiedSql] = useState(false);

  // Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [dateFilter, setDateFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  const fetchData = async () => {
    setLoading(true);
    try {
      const activeOrgId = currentSelectedOrgId || currentUser?.organization_id || undefined;
      const [fetchedOrders, fetchedTemplates] = await Promise.all([
        butcheringYieldService.getOrders(activeOrgId),
        butcheringYieldService.getTemplates(activeOrgId)
      ]);
      setOrders(fetchedOrders || []);
      setTemplates(fetchedTemplates || DEFAULT_BUTCHERING_TEMPLATES);
    } catch (err: any) {
      console.warn('Notice loading butchering data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [currentSelectedOrgId, currentUser?.organization_id]);

  // Filtered Orders
  const filteredOrders = useMemo(() => {
    return orders.filter(o => {
      const matchesSearch =
        o.order_number.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (o.source_product_name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (o.butcher_name || '').toLowerCase().includes(searchTerm.toLowerCase());

      const matchesDate = !dateFilter || o.order_date === dateFilter;
      const matchesStatus = statusFilter === 'all' || o.status === statusFilter;

      return matchesSearch && matchesDate && matchesStatus;
    });
  }, [orders, searchTerm, dateFilter, statusFilter]);

  // Overall KPIs
  const kpis = useMemo(() => {
    let totalKg = 0;
    let totalValue = 0;
    let totalOutputKg = 0;
    let totalShrinkageKg = 0;

    orders.forEach(o => {
      totalKg += Number(o.input_weight || 0);
      totalValue += Number(o.total_net_cost || 0);
      totalOutputKg += Number(o.total_output_weight || 0);
      totalShrinkageKg += Number(o.shrinkage_weight || 0);
    });

    const avgYield = totalKg > 0 ? (totalOutputKg / totalKg) * 100 : 0;
    const avgShrinkage = totalKg > 0 ? (totalShrinkageKg / totalKg) * 100 : 0;

    return {
      totalOrders: orders.length,
      totalKg,
      totalValue,
      avgYield,
      avgShrinkage
    };
  }, [orders]);

  const handleDeleteOrder = async (orderId: string) => {
    if (!window.confirm('هل أنت متأكد من حذف هذا الأمر؟')) return;
    try {
      await butcheringYieldService.deleteOrder(orderId);
      showToast('تم حذف أمر التشفية بنجاح', 'success');
      fetchData();
      if (refreshData) refreshData();
    } catch (err: any) {
      showToast('حدث خطأ أثناء الحذف: ' + err.message, 'error');
    }
  };

  const handlePrintOrder = (order: ButcheringOrder) => {
    setSelectedOrderDetails(order);
    setTimeout(() => {
      window.print();
    }, 300);
  };

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-7xl mx-auto animate-in fade-in">
      {/* Top Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-gradient-to-br from-rose-600 to-amber-600 text-white rounded-2xl shadow-md">
            <Scale className="w-8 h-8" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-2xl font-black text-slate-800">
                تشفية اللحوم وتفكيك الذبائح والدواجن
              </h2>
              <span className="text-xs bg-rose-100 text-rose-800 font-bold px-2.5 py-0.5 rounded-full">
                Butchering & Yield
              </span>
            </div>
            <p className="text-xs md:text-sm text-slate-500 mt-1">
              إدارة تفكيك الذبائح والدواجن إلى قطعيات، احتساب نسب الهدر والفاقد، والتوزيع المحاسبي الدقيق للتكلفة
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={() => setIsSqlModalOpen(true)}
            className="px-3.5 py-2.5 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-xl text-xs font-bold flex items-center gap-1.5 border border-blue-200 transition"
            title="عرض ونسخ كود SQL لإنشاء الجداول في Supabase"
          >
            <Database className="w-4 h-4 text-blue-600" />
            إعداد قاعدة البيانات (SQL)
          </button>

          <button
            onClick={() => setIsTemplatesModalOpen(true)}
            className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold flex items-center gap-2 border border-slate-300 transition"
          >
            <Layers className="w-4 h-4 text-slate-600" />
            القوالب المعيارية ({templates.length})
          </button>

          <button
            onClick={() => setIsNewOrderModalOpen(true)}
            className="px-5 py-2.5 bg-gradient-to-r from-rose-600 to-amber-600 hover:from-rose-700 hover:to-amber-700 text-white rounded-xl text-xs font-bold flex items-center gap-2 shadow-lg shadow-rose-600/20 transition"
          >
            <Plus className="w-4 h-4" />
            جلسة تشفية جديدة
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center gap-4">
          <div className="p-3 bg-rose-50 text-rose-600 rounded-xl">
            <Scale className="w-6 h-6" />
          </div>
          <div>
            <span className="text-xs text-slate-500 font-bold block">إجمالي الذبائح المشفاة</span>
            <span className="text-2xl font-black text-slate-900">
              {kpis.totalKg.toLocaleString(undefined, { maximumFractionDigits: 1 })}{' '}
              <span className="text-xs font-normal text-slate-400">كجم</span>
            </span>
            <span className="text-[11px] text-slate-500 block mt-0.5">
              عبر {kpis.totalOrders} أمر تشفية
            </span>
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center gap-4">
          <div className="p-3 bg-emerald-50 text-emerald-600 rounded-xl">
            <TrendingUp className="w-6 h-6" />
          </div>
          <div>
            <span className="text-xs text-slate-500 font-bold block">متوسط كفاءة الاستخراج</span>
            <span className="text-2xl font-black text-emerald-700">
              {kpis.avgYield.toFixed(1)}%
            </span>
            <span className="text-[11px] text-emerald-600 font-semibold block mt-0.5">
              نسبة اللحوم الصافية النافعة
            </span>
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center gap-4">
          <div className="p-3 bg-amber-50 text-amber-600 rounded-xl">
            <AlertTriangle className="w-6 h-6" />
          </div>
          <div>
            <span className="text-xs text-slate-500 font-bold block">متوسط الفاقد والهالك</span>
            <span className="text-2xl font-black text-amber-700">
              {kpis.avgShrinkage.toFixed(1)}%
            </span>
            <span className="text-[11px] text-slate-500 block mt-0.5">
              فاقد تنظيف وتبخر وسوائل
            </span>
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center gap-4">
          <div className="p-3 bg-indigo-50 text-indigo-600 rounded-xl">
            <DollarSign className="w-6 h-6" />
          </div>
          <div>
            <span className="text-xs text-slate-500 font-bold block">إجمالي قيمة اللحوم المشفاة</span>
            <span className="text-2xl font-black text-indigo-900">
              {kpis.totalValue.toLocaleString(undefined, { maximumFractionDigits: 0 })}{' '}
              <span className="text-xs font-normal text-slate-400">ج.م</span>
            </span>
            <span className="text-[11px] text-slate-500 block mt-0.5">
              محسوبة ومرحلة بالمخازن
            </span>
          </div>
        </div>
      </div>

      {/* Main Tabs Navigation */}
      <div className="flex items-center gap-2 border-b border-slate-200">
        <button
          onClick={() => setActiveTab('orders')}
          className={`px-5 py-3 text-xs md:text-sm font-bold flex items-center gap-2 border-b-2 transition ${
            activeTab === 'orders'
              ? 'border-rose-600 text-rose-600'
              : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          <FileText className="w-4 h-4" />
          أوامر وجلسات التشفية ({orders.length})
        </button>

        <button
          onClick={() => setActiveTab('analytics')}
          className={`px-5 py-3 text-xs md:text-sm font-bold flex items-center gap-2 border-b-2 transition ${
            activeTab === 'analytics'
              ? 'border-rose-600 text-rose-600'
              : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          <TrendingUp className="w-4 h-4" />
          تحليلات الاستخراج ومعدلات الهدر
        </button>
      </div>

      {/* Tab 1: Orders List */}
      {activeTab === 'orders' && (
        <div className="space-y-4">
          {/* Filters Bar */}
          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex flex-wrap gap-3 items-center justify-between">
            <div className="flex flex-wrap items-center gap-3 flex-1">
              <div className="relative flex-1 min-w-[200px] max-w-md">
                <Search className="w-4 h-4 text-slate-400 absolute right-3 top-3" />
                <input
                  type="text"
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                  placeholder="بحث برقم الأمر، الصنف، اسم الشيف..."
                  className="w-full pl-3 pr-9 py-2 text-xs border border-slate-300 rounded-xl outline-none focus:ring-2 focus:ring-rose-500"
                />
              </div>

              <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4 text-slate-400" />
                <input
                  type="date"
                  value={dateFilter}
                  onChange={e => setDateFilter(e.target.value)}
                  className="border border-slate-300 rounded-xl px-3 py-1.5 text-xs outline-none"
                />
              </div>

              {dateFilter && (
                <button
                  onClick={() => setDateFilter('')}
                  className="text-xs text-rose-600 hover:underline font-bold"
                >
                  مسح التاريخ
                </button>
              )}
            </div>

            <span className="text-xs text-slate-500 font-bold">
              عرض {filteredOrders.length} من {orders.length} أمر
            </span>
          </div>

          {/* Orders Table */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            {loading ? (
              <div className="p-12 text-center text-slate-400 flex flex-col items-center justify-center gap-2">
                <Loader2 className="w-8 h-8 animate-spin text-rose-600" />
                <span className="text-xs">جاري تحميل أوامر التشفية...</span>
              </div>
            ) : filteredOrders.length === 0 ? (
              <div className="p-12 text-center text-slate-400 flex flex-col items-center justify-center gap-3">
                <Scale className="w-12 h-12 stroke-1 text-slate-300" />
                <h4 className="font-bold text-slate-700 text-sm">لا توجد أوامر تشفية مسجلة بعد</h4>
                <p className="text-xs text-slate-500 max-w-sm">
                  قم بإنشاء أول جلسة تشفية لتفكيك الذبيحة إلى قطعيات وتوزيع التكلفة تلقائياً
                </p>
                <button
                  onClick={() => setIsNewOrderModalOpen(true)}
                  className="mt-2 px-4 py-2 bg-rose-600 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow"
                >
                  <Plus className="w-4 h-4" /> إنشاء جلسة تشفية الآن
                </button>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-right text-xs">
                  <thead className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200">
                    <tr>
                      <th className="p-3.5">رقم الأمر</th>
                      <th className="p-3.5">التاريخ</th>
                      <th className="p-3.5">صنف الذبيحة / الخام</th>
                      <th className="p-3.5 text-center">الوزن المدخل</th>
                      <th className="p-3.5 text-center">المخرجات الصافية</th>
                      <th className="p-3.5 text-center">نسبة الاستخراج</th>
                      <th className="p-3.5 text-center">الفاقد / الهالك</th>
                      <th className="p-3.5 text-center">إجمالي التكلفة</th>
                      <th className="p-3.5 text-center">الشيف المسؤول</th>
                      <th className="p-3.5 text-center">الإجراءات</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredOrders.map(order => (
                      <tr key={order.id} className="hover:bg-slate-50/80 transition">
                        <td className="p-3.5 font-bold font-mono text-rose-700">
                          {order.order_number}
                        </td>
                        <td className="p-3.5 text-slate-600 font-medium">{order.order_date}</td>
                        <td className="p-3.5 font-bold text-slate-800">
                          {order.source_product_name}
                        </td>
                        <td className="p-3.5 text-center font-bold text-slate-800">
                          {Number(order.input_weight).toFixed(1)} كجم
                        </td>
                        <td className="p-3.5 text-center font-bold text-emerald-700">
                          {Number(order.total_output_weight).toFixed(1)} كجم
                        </td>
                        <td className="p-3.5 text-center">
                          <span className="bg-emerald-50 text-emerald-800 font-bold px-2 py-0.5 rounded border border-emerald-200">
                            {Number(order.useful_yield_pct).toFixed(1)}%
                          </span>
                        </td>
                        <td className="p-3.5 text-center">
                          <span
                            className={`font-bold px-2 py-0.5 rounded ${
                              Number(order.shrinkage_pct) > 6
                                ? 'bg-red-50 text-red-700 border border-red-200'
                                : 'bg-slate-100 text-slate-700'
                            }`}
                          >
                            {Number(order.shrinkage_weight).toFixed(1)} كجم ({Number(order.shrinkage_pct).toFixed(1)}%)
                          </span>
                        </td>
                        <td className="p-3.5 text-center font-black text-slate-900">
                          {Number(order.total_net_cost).toLocaleString()} ج
                        </td>
                        <td className="p-3.5 text-center text-slate-600">
                          {order.butcher_name || 'غير محدد'}
                        </td>
                        <td className="p-3.5 text-center">
                          <div className="flex items-center justify-center gap-1.5">
                            <button
                              onClick={() => setSelectedOrderDetails(order)}
                              className="p-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg transition"
                              title="عرض تفاصيل التشفية وتوزيع التكلفة"
                            >
                              <Eye className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => handlePrintOrder(order)}
                              className="p-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-lg transition"
                              title="طباعة شهادة التشفية"
                            >
                              <Printer className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => order.id && handleDeleteOrder(order.id)}
                              className="p-1.5 bg-red-50 hover:bg-red-100 text-red-600 rounded-lg transition"
                              title="حذف"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Tab 2: Analytics */}
      {activeTab === 'analytics' && <YieldAnalyticsReport orders={orders} />}

      {/* Modals */}
      <NewButcheringOrderModal
        isOpen={isNewOrderModalOpen}
        onClose={() => setIsNewOrderModalOpen(false)}
        templates={templates}
        onOrderCreated={() => {
          fetchData();
          if (refreshData) refreshData();
        }}
      />

      <YieldTemplatesModal
        isOpen={isTemplatesModalOpen}
        onClose={() => setIsTemplatesModalOpen(false)}
        templates={templates}
        onTemplatesUpdated={fetchData}
      />

      {/* Order Details Preview & Printable Modal */}
      {selectedOrderDetails && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto animate-in fade-in">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-4xl overflow-hidden print:m-0 print:border-none print:shadow-none">
            {/* Modal Header */}
            <div className="bg-gradient-to-r from-slate-900 to-slate-800 text-white p-5 flex justify-between items-center print:hidden">
              <div className="flex items-center gap-3">
                <Scale className="w-6 h-6 text-amber-400" />
                <div>
                  <h3 className="font-bold text-lg">
                    تفاصيل أمر التشفية وتوزيع التكلفة ({selectedOrderDetails.order_number})
                  </h3>
                  <span className="text-xs text-slate-300">
                    تاريخ الجلسة: {selectedOrderDetails.order_date}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => window.print()}
                  className="px-3 py-1.5 bg-white/10 hover:bg-white/20 text-white rounded-lg text-xs font-bold flex items-center gap-1.5"
                >
                  <Printer className="w-4 h-4" /> طباعة
                </button>
                <button
                  onClick={() => setSelectedOrderDetails(null)}
                  className="text-white/70 hover:text-white p-1.5"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>
            </div>

            {/* Printable Content Body */}
            <div className="p-6 space-y-6">
              {/* Header Info Banner */}
              <div className="border-b pb-4 flex justify-between items-start">
                <div>
                  <h2 className="text-xl font-black text-slate-800">
                    شهادة تشفية وتفكيك ذبائح ولحوم
                  </h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    رقم الأمر: {selectedOrderDetails.order_number} | الصنف الخام: {selectedOrderDetails.source_product_name}
                  </p>
                </div>
                <div className="text-left text-xs text-slate-500">
                  <span>الشيف المسؤول: <strong>{selectedOrderDetails.butcher_name || 'الشيف'}</strong></span>
                  <br />
                  <span>طريقة التكلفة: <strong>{selectedOrderDetails.cost_allocation_method}</strong></span>
                </div>
              </div>

              {/* Summary Stats */}
              <div className="grid grid-cols-4 gap-3 text-center text-xs">
                <div className="bg-slate-50 p-3 rounded-xl border border-slate-200">
                  <span className="text-slate-500 block">الوزن الخام</span>
                  <span className="text-base font-extrabold text-slate-900">
                    {Number(selectedOrderDetails.input_weight).toFixed(1)} كجم
                  </span>
                </div>
                <div className="bg-emerald-50 p-3 rounded-xl border border-emerald-200">
                  <span className="text-emerald-700 block">الوزن المستخرج</span>
                  <span className="text-base font-extrabold text-emerald-900">
                    {Number(selectedOrderDetails.total_output_weight).toFixed(1)} كجم ({Number(selectedOrderDetails.useful_yield_pct).toFixed(1)}%)
                  </span>
                </div>
                <div className="bg-amber-50 p-3 rounded-xl border border-amber-200">
                  <span className="text-amber-700 block">الهالك / الفاقد</span>
                  <span className="text-base font-extrabold text-amber-900">
                    {Number(selectedOrderDetails.shrinkage_weight).toFixed(1)} كجم ({Number(selectedOrderDetails.shrinkage_pct).toFixed(1)}%)
                  </span>
                </div>
                <div className="bg-indigo-50 p-3 rounded-xl border border-indigo-200">
                  <span className="text-indigo-700 block">التكلفة الكلية</span>
                  <span className="text-base font-extrabold text-indigo-900">
                    {Number(selectedOrderDetails.total_net_cost).toLocaleString()} ج
                  </span>
                </div>
              </div>

              {/* Output Cuts Detailed Table */}
              <div>
                <h5 className="font-bold text-xs text-slate-700 mb-2">
                  بيان القطعيات الناتجة والتكلفة التفصيلية للكيلو
                </h5>
                <table className="w-full text-right text-xs border border-slate-200 rounded-xl overflow-hidden">
                  <thead className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200">
                    <tr>
                      <th className="p-2.5">#</th>
                      <th className="p-2.5">اسم القطعية الناتجة</th>
                      <th className="p-2.5 text-center">الوزن الفعلي</th>
                      <th className="p-2.5 text-center">نسبة الاستخراج</th>
                      <th className="p-2.5 text-center bg-indigo-50 text-indigo-900">تكلفة الكيلو المحسوبة</th>
                      <th className="p-2.5 text-center">إجمالي التكلفة</th>
                      <th className="p-2.5 text-center">النوع</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {(selectedOrderDetails.items || []).map((it, idx) => (
                      <tr key={idx} className="hover:bg-slate-50">
                        <td className="p-2.5 text-slate-400 font-bold">{idx + 1}</td>
                        <td className="p-2.5 font-bold text-slate-800">{it.output_name}</td>
                        <td className="p-2.5 text-center font-bold text-slate-900">
                          {Number(it.actual_weight).toFixed(2)} كجم
                        </td>
                        <td className="p-2.5 text-center text-slate-700">
                          {Number(it.yield_pct).toFixed(1)}%
                        </td>
                        <td className="p-2.5 text-center font-extrabold text-indigo-800 bg-indigo-50/40">
                          {Number(it.allocated_cost_per_kg).toFixed(2)} ج/كجم
                        </td>
                        <td className="p-2.5 text-center font-bold text-slate-800">
                          {Number(it.total_allocated_cost).toLocaleString()} ج
                        </td>
                        <td className="p-2.5 text-center">
                          {it.is_by_product ? (
                            <span className="text-[10px] bg-amber-100 text-amber-800 px-2 py-0.5 rounded font-bold">
                              عظم/دهن
                            </span>
                          ) : (
                            <span className="text-[10px] bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded font-bold">
                              لحم صافي
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-slate-50 font-bold border-t border-slate-200">
                    <tr>
                      <td colSpan={2} className="p-2.5 text-slate-800">الإجمالي:</td>
                      <td className="p-2.5 text-center font-black text-slate-900">
                        {Number(selectedOrderDetails.total_output_weight).toFixed(2)} كجم
                      </td>
                      <td className="p-2.5 text-center text-emerald-800">
                        {Number(selectedOrderDetails.useful_yield_pct).toFixed(1)}%
                      </td>
                      <td className="p-2.5 text-center text-indigo-800">تطابق التكلفة 100%</td>
                      <td className="p-2.5 text-center font-black text-slate-900">
                        {Number(selectedOrderDetails.total_net_cost).toLocaleString()} ج
                      </td>
                      <td />
                    </tr>
                  </tfoot>
                </table>
              </div>

              {selectedOrderDetails.notes && (
                <div className="p-3 bg-slate-50 rounded-xl text-xs text-slate-600 border border-slate-200">
                  <strong>ملاحظات:</strong> {selectedOrderDetails.notes}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="bg-slate-50 p-4 border-t border-slate-200 flex justify-end print:hidden">
              <button
                onClick={() => setSelectedOrderDetails(null)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-900 text-white rounded-xl text-xs font-bold"
              >
                إغلاق
              </button>
            </div>
          </div>
        </div>
      )}

      {/* SQL Setup Modal */}
      {isSqlModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto animate-in fade-in">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-3xl overflow-hidden flex flex-col max-h-[85vh]">
            <div className="bg-gradient-to-r from-blue-700 to-indigo-700 p-5 text-white flex justify-between items-center">
              <div className="flex items-center gap-3">
                <Database className="w-6 h-6 text-white" />
                <div>
                  <h3 className="font-bold text-lg">تثبيت جداول التشفية في قاعدة البيانات (Supabase)</h3>
                  <p className="text-xs text-blue-100 mt-0.5">
                    انسخ هذا الكود وقم بتشغيله في لوحة تحكم Supabase &gt; SQL Editor لإنشاء الجداول وحفظ البيانات سحابياً
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsSqlModalOpen(false)}
                className="text-white/80 hover:text-white p-1.5"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            <div className="p-5 overflow-y-auto space-y-4 flex-1 bg-slate-50">
              <div className="bg-blue-50 border border-blue-200 rounded-xl p-3.5 text-xs text-blue-900 space-y-1">
                <span className="font-bold block">💡 ملاحظة تشغيلية:</span>
                <p>
                  النظام يعمل حالياً بكامل وظائفه مع التخزين المحلي الآمن وتحديث المخزون والقيود المحاسبية.
                  لتفعيل الحفظ السحابي المركزي المتعدد للمستخدمين، انسخ الكود أدناه والصقه في نافذة <strong>SQL Editor</strong> داخل حساب Supabase الخاص بالمشروع واضغط <strong>Run</strong>.
                </p>
              </div>

              <div className="relative">
                <pre className="bg-slate-900 text-slate-100 p-4 rounded-xl text-xs font-mono overflow-x-auto max-h-80 border border-slate-700">
                  {BUTCHERING_SQL_SCHEMA}
                </pre>
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(BUTCHERING_SQL_SCHEMA);
                    setCopiedSql(true);
                    showToast('تم نسخ كود SQL إلى الحافظة بنجاح ✅', 'success');
                    setTimeout(() => setCopiedSql(false), 3000);
                  }}
                  className="absolute top-3 left-3 bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 shadow transition"
                >
                  {copiedSql ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  {copiedSql ? 'تم النسخ!' : 'نسخ الكود'}
                </button>
              </div>
            </div>

            <div className="bg-white p-4 border-t border-slate-200 flex justify-between items-center">
              <span className="text-xs text-slate-500">
                الملف محفوظ أيضاً في: <code className="bg-slate-100 px-1 py-0.5 rounded text-[11px]">services/migrations/2026-08-27_create_butchering_yield_module.sql</code>
              </span>
              <button
                onClick={() => setIsSqlModalOpen(false)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-900 text-white rounded-xl text-xs font-bold"
              >
                إغلاق
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
export default ButcheringYieldManager;

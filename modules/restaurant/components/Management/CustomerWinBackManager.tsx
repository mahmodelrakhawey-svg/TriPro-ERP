import React, { useState, useEffect, useMemo } from 'react';
import { useAccounting } from '../../../../context/AccountingContext';
import { useToast } from '../../../../context/ToastContext';
import { supabase } from '../../../../supabaseClient';
import {
  DormantCustomerInsight,
  customerWinBackService
} from '../../../../services/customerWinBackService';
import {
  Users,
  Send,
  Sparkles,
  Phone,
  Calendar,
  DollarSign,
  AlertTriangle,
  Gift,
  Search,
  MessageSquare,
  CheckCircle2,
  RefreshCw
} from 'lucide-react';

export const CustomerWinBackManager: React.FC = () => {
  const { organization } = useAccounting();
  const { showToast } = useToast();

  const [loading, setLoading] = useState(true);
  const [customers, setCustomers] = useState<any[]>([]);
  const [orders, setOrders] = useState<any[]>([]);
  const [filterRisk, setFilterRisk] = useState<string>('ALL');
  const [searchTerm, setSearchTerm] = useState('');

  const fetchWinBackData = async () => {
    setLoading(true);
    try {
      const [custRes, ordRes] = await Promise.all([
        supabase.from('customers').select('id, name, phone'),
        supabase.from('orders').select('id, customer_id, created_at, grand_total').order('created_at', { ascending: false }).limit(2000)
      ]);

      if (custRes.data) setCustomers(custRes.data);
      if (ordRes.data) setOrders(ordRes.data);
    } catch (e: any) {
      console.warn('Winback data load notice:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchWinBackData();
  }, []);

  const dormantInsights = useMemo(() => {
    return customerWinBackService.analyzeDormantCustomers(customers, orders);
  }, [customers, orders]);

  const filteredInsights = dormantInsights.filter(c => {
    const matchesSearch = c.customerName.toLowerCase().includes(searchTerm.toLowerCase()) || c.phone.includes(searchTerm);
    const matchesRisk = filterRisk === 'ALL' || c.churnRisk === filterRisk;
    return matchesSearch && matchesRisk;
  });

  const handleSendWhatsApp = (c: DormantCustomerInsight) => {
    if (!c.phone) {
      showToast('رقم هاتف العميل غير متوفر', 'warning');
      return;
    }
    const cleanPhone = c.phone.replace(/[^0-9]/g, '');
    const message = encodeURIComponent(
      customerWinBackService.generateWinBackMessage(c, organization?.name || 'مطعمنا')
    );
    window.open(`https://wa.me/${cleanPhone}?text=${message}`, '_blank');
  };

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-7xl mx-auto animate-in fade-in">
      {/* Header */}
      <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm flex flex-wrap justify-between items-center gap-4">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-gradient-to-br from-pink-500 to-rose-600 rounded-2xl text-white shadow-md">
            <Gift className="w-8 h-8" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-2xl font-black text-slate-800">إعادة استهداف العملاء الغائبين (Customer Win-Back)</h2>
              <span className="bg-pink-100 text-pink-800 text-xs px-2.5 py-0.5 rounded-full font-bold">
                Smart CRM Radar
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-1">
              اكتشاف العملاء المنقطعين عن الطلب وتوليد رسائل وعروض خصم آلية عبر WhatsApp لإعادة تنشيطهم وزيادة المبيعات
            </p>
          </div>
        </div>

        <button onClick={fetchWinBackData} className="p-2.5 border border-slate-200 text-slate-600 rounded-xl hover:bg-slate-50">
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-sm">
          <span className="text-xs font-bold text-slate-500 block mb-1">إجمالي العملاء المنقطعين</span>
          <span className="text-3xl font-black text-rose-600 font-mono">{dormantInsights.length}</span>
          <span className="text-xs text-slate-400 block mt-1">انقطاع لأكثر من 15 يوماً</span>
        </div>

        <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-sm">
          <span className="text-xs font-bold text-slate-500 block mb-1">عملاء بخطر انقطاع مرتفع (High Churn)</span>
          <span className="text-3xl font-black text-amber-600 font-mono">
            {dormantInsights.filter(c => c.churnRisk === 'HIGH').length}
          </span>
          <span className="text-xs text-slate-400 block mt-1">انقطاع لأكثر من 60 يوماً</span>
        </div>

        <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-sm">
          <span className="text-xs font-bold text-slate-500 block mb-1">إجمالي إنفاقهم التاريخي</span>
          <span className="text-3xl font-black text-emerald-600 font-mono">
            {dormantInsights.reduce((sum, c) => sum + c.totalSpent, 0).toLocaleString()} ج
          </span>
          <span className="text-xs text-slate-400 block mt-1">قيمة العملاء المستهدف استعادتهم</span>
        </div>
      </div>

      {/* Filter & Search Bar */}
      <div className="flex flex-wrap justify-between items-center gap-3">
        <div className="flex items-center gap-2">
          {['ALL', 'HIGH', 'MEDIUM', 'LOW'].map(risk => (
            <button
              key={risk}
              onClick={() => setFilterRisk(risk)}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition ${
                filterRisk === risk ? 'bg-slate-900 text-white' : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
              }`}
            >
              {risk === 'ALL'
                ? `الكل (${dormantInsights.length})`
                : risk === 'HIGH'
                ? 'خطر مرتفع (+60 يوم)'
                : risk === 'MEDIUM'
                ? 'خطر متوسط (+30 يوم)'
                : 'خطر منخفض (+15 يوم)'}
            </button>
          ))}
        </div>

        <div className="relative w-72">
          <Search className="w-4 h-4 text-slate-400 absolute right-3.5 top-3" />
          <input
            type="text"
            placeholder="بحث بالاسم أو الهاتف..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="w-full bg-white border border-slate-200 rounded-2xl pr-10 pl-4 py-2.5 text-xs outline-none focus:ring-2 focus:ring-rose-500 shadow-sm"
          />
        </div>
      </div>

      {/* Customer Insights Table */}
      <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-right text-xs">
            <thead className="bg-slate-50 text-slate-500 font-bold border-b border-slate-100">
              <tr>
                <th className="p-4">اسم العميل</th>
                <th className="p-4 text-center">أيام الانقطاع</th>
                <th className="p-4 text-center">مستوى الخطر</th>
                <th className="p-4 text-center">عدد الطلبات السابقة</th>
                <th className="p-4 text-center">إجمالي الإنفاق</th>
                <th className="p-4 text-center">الخصم المقترح</th>
                <th className="p-4 text-center">إرسال WhatsApp</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredInsights.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-12 text-center text-slate-400">
                    لا يوجد عملاء منقطعون يطابقون الفرز الحالي 🎉
                  </td>
                </tr>
              ) : (
                filteredInsights.map(c => (
                  <tr key={c.customerId} className="hover:bg-slate-50 transition">
                    <td className="p-4">
                      <span className="font-bold text-slate-800 text-sm block">{c.customerName}</span>
                      <span className="text-[11px] text-slate-400 font-mono">{c.phone || 'بدون هاتف'}</span>
                    </td>
                    <td className="p-4 text-center font-bold text-rose-600 font-mono text-sm">
                      منذ {c.daysSinceLastOrder} يوماً
                    </td>
                    <td className="p-4 text-center">
                      <span
                        className={`px-2.5 py-1 rounded-full text-[10px] font-bold ${
                          c.churnRisk === 'HIGH'
                            ? 'bg-red-100 text-red-800'
                            : c.churnRisk === 'MEDIUM'
                            ? 'bg-amber-100 text-amber-800'
                            : 'bg-blue-100 text-blue-800'
                        }`}
                      >
                        {c.churnRisk === 'HIGH' ? 'مرتفع جداً 🚨' : c.churnRisk === 'MEDIUM' ? 'متوسط ⚠️' : 'منخفض'}
                      </span>
                    </td>
                    <td className="p-4 text-center font-bold font-mono">{c.totalOrdersCount} طلب</td>
                    <td className="p-4 text-center font-bold font-mono text-emerald-600">{c.totalSpent.toFixed(2)} ج</td>
                    <td className="p-4 text-center font-black text-rose-600 font-mono">
                      خصم {c.suggestedPromoDiscount}%
                    </td>
                    <td className="p-4 text-center">
                      <button
                        onClick={() => handleSendWhatsApp(c)}
                        disabled={!c.phone}
                        className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-30 text-white rounded-xl font-bold flex items-center gap-1.5 mx-auto shadow transition"
                      >
                        <MessageSquare className="w-3.5 h-3.5" /> إرسال كود الخصم
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
export default CustomerWinBackManager;

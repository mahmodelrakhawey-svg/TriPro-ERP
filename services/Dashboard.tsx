import React, { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';
import { useToast } from '../context/ToastContext';
import { TrendingUp, ShoppingBag, Utensils, DollarSign, Loader2 } from 'lucide-react';

export const Dashboard: React.FC = () => {
  const [salesData, setSalesData] = useState({
    total: 0,
    invoices: 0,
    restaurant: 0,
    count: 0,
    profit: 0
  });
  const [loading, setLoading] = useState(true);
  const { showToast } = useToast();

  useEffect(() => {
    fetchStats();
  }, []);

  const fetchStats = async () => {
    try {
      // جلب تاريخ بداية الشهر الحالي (YYYY-MM-01)
      const now = new Date();
      const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
      
      // جلب كافة المبيعات من الرؤية الموحدة
      const { data, error } = await supabase
        .from('monthly_sales_dashboard')
        .select('*')
        .gte('transaction_date', firstDayOfMonth);

      if (error) throw error;

      // تحليل البيانات وتجميع الإجماليات
      const summary = (data || []).reduce((acc, curr) => {
        const amount = Number(curr.amount) || 0;
        const cost = Number(curr.total_cost) || 0;
        acc.total += amount;
        if (curr.type === 'Standard Invoice') acc.invoices += amount;
        if (curr.type === 'Restaurant Order') acc.restaurant += amount;
        acc.count += 1;
        acc.profit += (amount - cost);
        return acc;
      }, { total: 0, invoices: 0, restaurant: 0, count: 0, profit: 0 });

      setSalesData(summary);
    } catch (err: any) {
      showToast('حدث خطأ أثناء تحميل بيانات المبيعات الموحدة', 'error');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center p-20">
        <Loader2 className="animate-spin text-indigo-600" size={40} />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 bg-slate-50 min-h-screen">
      <h1 className="text-2xl font-black text-slate-800">لوحة القيادة - مبيعات الشهر</h1>
      
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        {/* إجمالي المبيعات الموحد */}
        <div className="bg-gradient-to-br from-indigo-600 to-blue-700 p-8 rounded-[2.5rem] text-white shadow-xl shadow-blue-100">
          <div className="flex justify-between items-start mb-6">
            <div className="p-4 bg-white/20 rounded-2xl">
              <TrendingUp size={28} />
            </div>
            <span className="text-[10px] font-black bg-white/20 px-3 py-1 rounded-full uppercase tracking-widest">Unified View</span>
          </div>
          <p className="text-blue-100 text-sm font-bold">إجمالي مبيعات الشهر (الموحدة)</p>
          <div className="text-4xl font-black mt-2 tracking-tighter">
            {salesData.total.toLocaleString()} <span className="text-lg">ر.س</span>
          </div>
        </div>

        {/* مجمل الربح الجديد */}
        <div className="bg-gradient-to-br from-emerald-600 to-teal-700 p-8 rounded-[2.5rem] text-white shadow-xl shadow-emerald-100">
          <div className="flex justify-between items-start mb-6">
            <div className="p-4 bg-white/20 rounded-2xl">
              <DollarSign size={28} />
            </div>
          </div>
          <p className="text-emerald-100 text-sm font-bold">مجمل ربح الشهر</p>
          <div className="text-4xl font-black mt-2 tracking-tighter">
            {salesData.profit.toLocaleString()} <span className="text-lg">ر.س</span>
          </div>
        </div>

        {/* مبيعات المطعم POS */}
        <div className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-sm hover:shadow-md transition-shadow">
          <div className="flex justify-between items-start mb-6">
            <div className="p-4 bg-orange-100 text-orange-600 rounded-2xl">
              <Utensils size={28} />
            </div>
          </div>
          <p className="text-slate-500 text-sm font-bold">مبيعات المطعم (POS)</p>
          <div className="text-3xl font-black text-slate-900 mt-2">
            {salesData.restaurant.toLocaleString()} <span className="text-base text-slate-400">ر.س</span>
          </div>
          <div className="mt-4 flex items-center gap-2 text-[10px] text-orange-600 font-bold bg-orange-50 w-fit px-3 py-1 rounded-full">
            <div className="w-1.5 h-1.5 bg-orange-600 rounded-full animate-pulse" />
            بيانات حية من موديول المطعم
          </div>
        </div>

        {/* مبيعات الفواتير العادية */}
        <div className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-sm hover:shadow-md transition-shadow">
          <div className="flex justify-between items-start mb-6">
            <div className="p-4 bg-emerald-100 text-emerald-600 rounded-2xl">
              <ShoppingBag size={28} />
            </div>
          </div>
          <p className="text-slate-500 text-sm font-bold">مبيعات الفواتير (Invoices)</p>
          <div className="text-3xl font-black text-slate-900 mt-2">
            {salesData.invoices.toLocaleString()} <span className="text-base text-slate-400">ر.س</span>
          </div>
        </div>
      </div>
    </div>
  );
};
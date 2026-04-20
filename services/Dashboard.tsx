import React, { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';
import { useAccounting } from '../context/AccountingContext';
import { useToast } from '../context/ToastContext';
import { TrendingUp, ShoppingBag, Utensils, DollarSign, Loader2, Activity, Truck } from 'lucide-react';

export const Dashboard: React.FC = () => {
  const { settings } = useAccounting();
  const [salesData, setSalesData] = useState({
    monthSales: 0,
    grossProfit: 0,
    netProfit: 0,
    monthPurchases: 0,
    monthExpenses: 0
  });
  const [loading, setLoading] = useState(true);
  const { showToast } = useToast();

  useEffect(() => {
    fetchStats();
  }, []);

  const fetchStats = async () => {
    try {
      const { data, error } = await supabase.rpc('get_dashboard_stats');
      if (error) throw error;
      setSalesData(data);
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
          <p className="text-blue-100 text-sm font-bold">مبيعات الشهر (صافي الإيرادات)</p>
          <div className="text-4xl font-black mt-2 tracking-tighter">
            {salesData.monthSales.toLocaleString()} <span className="text-lg">{settings?.currency || 'EGP'}</span>
          </div>
        </div>

        <div className="bg-gradient-to-br from-emerald-600 to-teal-700 p-8 rounded-[2.5rem] text-white shadow-xl shadow-emerald-100">
          <div className="flex justify-between items-start mb-6">
            <div className="p-4 bg-white/20 rounded-2xl">
              <DollarSign size={28} />
            </div>
          </div>
          <p className="text-emerald-100 text-sm font-bold">مجمل ربح الشهر</p>
          <div className="text-4xl font-black mt-2 tracking-tighter">
            {salesData.grossProfit.toLocaleString()} <span className="text-lg">{settings?.currency || 'EGP'}</span>
          </div>
        </div>

        {/* صافي الربح */}
        <div className="bg-gradient-to-br from-indigo-500 to-purple-600 p-8 rounded-[2.5rem] text-white shadow-xl shadow-indigo-100">
          <div className="flex justify-between items-start mb-6">
            <div className="p-4 bg-white/20 rounded-2xl">
              <Activity size={28} />
            </div>
          </div>
          <p className="text-indigo-100 text-sm font-bold">صافي الربح</p>
          <div className="text-4xl font-black mt-2 tracking-tighter">
            {salesData.netProfit.toLocaleString()} <span className="text-lg">{settings?.currency || 'EGP'}</span>
          </div>
          <p className="text-[10px] mt-2 opacity-80 font-bold">بعد خصم المصروفات والضرائب</p>
        </div>

        <div className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-sm hover:shadow-md transition-shadow">
          <div className="flex justify-between items-start mb-6">
            <div className="p-4 bg-slate-100 text-slate-600 rounded-2xl">
              <Truck size={28} />
            </div>
          </div>
          <p className="text-slate-500 text-sm font-bold">مشتريات الشهر</p>
          <div className="text-3xl font-black text-slate-900 mt-2 tracking-tighter">
            {salesData.monthPurchases.toLocaleString()} <span className="text-base text-slate-400">{settings?.currency || 'EGP'}</span>
          </div>
        </div>
      </div>
    </div>
  );
};
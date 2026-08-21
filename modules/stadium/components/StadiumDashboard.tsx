import React, { useState, useEffect } from 'react';
import { supabase } from '@/supabaseClient';
import { useAccounting } from '@/context/AccountingContext';
import { Trophy, Users, Calendar, TrendingUp, Building2, Dumbbell, AlertTriangle, Activity } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts';
import { format, subMonths, startOfMonth, endOfMonth, addDays, startOfDay, endOfDay } from 'date-fns';
import { ar } from 'date-fns/locale';
import { formatCurrency } from '../stadiumHelpers';
import toast from 'react-hot-toast';
import { StadiumMember, StadiumRentalContract } from '../stadium.types';

export default function StadiumDashboard() {
  const { currentUser } = useAccounting();
  const orgId = (currentUser as any)?.organization_id;

  const [loading, setLoading] = useState(true);
  const [kpis, setKpis] = useState({
    activeMembers: 0,
    todayRevenue: 0,
    monthRevenue: 0,
    todayBookings: 0,
    activeContracts: 0,
    activePrograms: 0
  });

  const [monthlyRevenueData, setMonthlyRevenueData] = useState<any[]>([]);
  const [revenueBreakdown, setRevenueBreakdown] = useState<any[]>([]);
  
  const [expiringMembers, setExpiringMembers] = useState<StadiumMember[]>([]);
  const [overdueContracts, setOverdueContracts] = useState<StadiumRentalContract[]>([]);

  const COLORS = ['#22c55e', '#3b82f6', '#f59e0b', '#8b5cf6'];

  useEffect(() => {
    if (!orgId) return;
    fetchDashboardData();
  }, [orgId]);

  const fetchDashboardData = async () => {
    try {
      setLoading(true);
      
      const today = new Date();
      const startOfTodayStr = startOfDay(today).toISOString();
      const endOfTodayStr = endOfDay(today).toISOString();
      
      const startOfThisMonthStr = startOfMonth(today).toISOString();
      const endOfThisMonthStr = endOfMonth(today).toISOString();

      // KPIs Fetch
      const [
        { count: activeMembers },
        { count: activeContracts },
        { count: activePrograms },
        { count: todayBookings },
      ] = await Promise.all([
        supabase.from('stadium_members').select('*', { count: 'exact', head: true }).eq('organization_id', orgId).eq('status', 'active'),
        supabase.from('stadium_rental_contracts').select('*', { count: 'exact', head: true }).eq('organization_id', orgId).eq('status', 'active'),
        supabase.from('stadium_training_programs').select('*', { count: 'exact', head: true }).eq('organization_id', orgId).eq('is_active', true),
        supabase.from('stadium_bookings').select('*', { count: 'exact', head: true }).eq('organization_id', orgId).gte('booking_date', startOfTodayStr).lte('booking_date', endOfTodayStr).neq('status', 'cancelled')
      ]);

      // Today Revenue
      const [
        { data: todaySubs },
        { data: todayBooks },
        { data: todayRents },
        { data: todayProgs }
      ] = await Promise.all([
        supabase.from('stadium_subscriptions').select('amount_paid').eq('organization_id', orgId).gte('payment_date', startOfTodayStr).lte('payment_date', endOfTodayStr),
        supabase.from('stadium_bookings').select('total_amount').eq('organization_id', orgId).gte('created_at', startOfTodayStr).lte('created_at', endOfTodayStr).in('status', ['confirmed', 'paid']),
        supabase.from('stadium_rental_payments').select('amount_paid').eq('organization_id', orgId).gte('payment_date', startOfTodayStr).lte('payment_date', endOfTodayStr),
        supabase.from('stadium_program_enrollments').select('amount_paid').eq('organization_id', orgId).gte('enrollment_date', startOfTodayStr).lte('enrollment_date', endOfTodayStr)
      ]);

      const tRev = 
        (todaySubs?.reduce((sum, item) => sum + (item.amount_paid || 0), 0) || 0) +
        (todayBooks?.reduce((sum, item) => sum + (item.total_amount || 0), 0) || 0) +
        (todayRents?.reduce((sum, item) => sum + (item.amount_paid || 0), 0) || 0) +
        (todayProgs?.reduce((sum, item) => sum + (item.amount_paid || 0), 0) || 0);

      // Month Revenue
      const [
        { data: monthSubs },
        { data: monthBooks },
        { data: monthRents },
        { data: monthProgs }
      ] = await Promise.all([
        supabase.from('stadium_subscriptions').select('amount_paid').eq('organization_id', orgId).gte('payment_date', startOfThisMonthStr).lte('payment_date', endOfThisMonthStr),
        supabase.from('stadium_bookings').select('total_amount').eq('organization_id', orgId).gte('created_at', startOfThisMonthStr).lte('created_at', endOfThisMonthStr).in('status', ['confirmed', 'paid']),
        supabase.from('stadium_rental_payments').select('amount_paid').eq('organization_id', orgId).gte('payment_date', startOfThisMonthStr).lte('payment_date', endOfThisMonthStr),
        supabase.from('stadium_program_enrollments').select('amount_paid').eq('organization_id', orgId).gte('enrollment_date', startOfThisMonthStr).lte('enrollment_date', endOfThisMonthStr)
      ]);

      const subsRev = (monthSubs?.reduce((sum, item) => sum + (item.amount_paid || 0), 0) || 0);
      const booksRev = (monthBooks?.reduce((sum, item) => sum + (item.total_amount || 0), 0) || 0);
      const rentsRev = (monthRents?.reduce((sum, item) => sum + (item.amount_paid || 0), 0) || 0);
      const progsRev = (monthProgs?.reduce((sum, item) => sum + (item.amount_paid || 0), 0) || 0);
      
      const mRev = subsRev + booksRev + rentsRev + progsRev;

      setKpis({
        activeMembers: activeMembers || 0,
        todayRevenue: tRev,
        monthRevenue: mRev,
        todayBookings: todayBookings || 0,
        activeContracts: activeContracts || 0,
        activePrograms: activePrograms || 0
      });

      setRevenueBreakdown([
        { name: 'الاشتراكات', value: subsRev },
        { name: 'الحجوزات', value: booksRev },
        { name: 'الإيجارات', value: rentsRev },
        { name: 'البرامج', value: progsRev }
      ].filter(item => item.value > 0));

      // Monthly Revenue for last 6 months
      const sixMonthsData = [];
      for (let i = 5; i >= 0; i--) {
        const d = subMonths(today, i);
        const sMonth = startOfMonth(d).toISOString();
        const eMonth = endOfMonth(d).toISOString();

        const [
          { data: sub }, { data: bking }, { data: rnt }, { data: prg }
        ] = await Promise.all([
          supabase.from('stadium_subscriptions').select('amount_paid').eq('organization_id', orgId).gte('payment_date', sMonth).lte('payment_date', eMonth),
          supabase.from('stadium_bookings').select('total_amount').eq('organization_id', orgId).gte('created_at', sMonth).lte('created_at', eMonth).in('status', ['confirmed', 'paid']),
          supabase.from('stadium_rental_payments').select('amount_paid').eq('organization_id', orgId).gte('payment_date', sMonth).lte('payment_date', eMonth),
          supabase.from('stadium_program_enrollments').select('amount_paid').eq('organization_id', orgId).gte('enrollment_date', sMonth).lte('enrollment_date', eMonth)
        ]);
        const mthTotal = 
          (sub?.reduce((sum, item) => sum + (item.amount_paid || 0), 0) || 0) +
          (bking?.reduce((sum, item) => sum + (item.total_amount || 0), 0) || 0) +
          (rnt?.reduce((sum, item) => sum + (item.amount_paid || 0), 0) || 0) +
          (prg?.reduce((sum, item) => sum + (item.amount_paid || 0), 0) || 0);

        sixMonthsData.push({
          month: format(d, 'MMM yyyy', { locale: ar }),
          الإيرادات: mthTotal
        });
      }
      setMonthlyRevenueData(sixMonthsData);

      // Alerts
      const nextWeek = addDays(today, 7).toISOString();
      const { data: expMembers } = await supabase.from('stadium_members')
        .select('*')
        .eq('organization_id', orgId)
        .eq('status', 'active')
        .lte('end_date', nextWeek);
      
      const { data: overContracts } = await supabase.from('stadium_rental_contracts')
        .select('*')
        .eq('organization_id', orgId)
        .eq('status', 'active')
        .lt('next_due_date', startOfTodayStr);

      setExpiringMembers(expMembers || []);
      setOverdueContracts(overContracts || []);

    } catch (error: any) {
      toast.error('حدث خطأ أثناء جلب بيانات لوحة القيادة');
      console.error('Dashboard fetch error:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-600"></div>
      </div>
    );
  }

  const kpiCards = [
    { title: 'الأعضاء النشطون', value: kpis.activeMembers, icon: Users, color: 'text-blue-600', bg: 'bg-blue-100' },
    { title: 'إيرادات اليوم', value: formatCurrency(kpis.todayRevenue), icon: TrendingUp, color: 'text-green-600', bg: 'bg-green-100' },
    { title: 'إيرادات الشهر', value: formatCurrency(kpis.monthRevenue), icon: Trophy, color: 'text-yellow-600', bg: 'bg-yellow-100' },
    { title: 'حجوزات اليوم', value: kpis.todayBookings, icon: Calendar, color: 'text-purple-600', bg: 'bg-purple-100' },
    { title: 'عقود الإيجار النشطة', value: kpis.activeContracts, icon: Building2, color: 'text-indigo-600', bg: 'bg-indigo-100' },
    { title: 'البرامج التدريبية', value: kpis.activePrograms, icon: Dumbbell, color: 'text-pink-600', bg: 'bg-pink-100' }
  ];

  return (
    <div className="space-y-6 bg-gray-50 p-6 min-h-screen" dir="rtl">
      {/* Header */}
      <div className="bg-gradient-to-r from-green-600 to-green-800 rounded-xl shadow-lg p-6 text-white flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-3">
            <Activity className="w-8 h-8" />
            لوحة تحكم الاستاد
          </h1>
          <p className="mt-2 opacity-90">ملخص سريع للنشاطات والإيرادات</p>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        {kpiCards.map((kpi, index) => (
          <div key={index} className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 flex flex-col items-center justify-center text-center hover:shadow-md transition-shadow">
            <div className={`p-3 rounded-full mb-3 ${kpi.bg}`}>
              <kpi.icon className={`w-6 h-6 ${kpi.color}`} />
            </div>
            <h3 className="text-sm font-medium text-gray-500 mb-1">{kpi.title}</h3>
            <p className="text-xl font-bold text-gray-900">{kpi.value}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Monthly Revenue Chart */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 min-w-0">
          <h2 className="text-lg font-bold text-gray-800 mb-6 flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-green-600" />
            تطور الإيرادات (6 أشهر)
          </h2>
          <div className="h-72 w-full min-w-0" dir="ltr">
            <ResponsiveContainer width="100%" height="100%" minWidth={0}>
              <BarChart data={monthlyRevenueData}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.5} />
                <XAxis dataKey="month" />
                <YAxis />
                <RechartsTooltip formatter={(value: number) => formatCurrency(value)} />
                <Bar dataKey="الإيرادات" fill="#16a34a" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Revenue Breakdown */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 min-w-0">
          <h2 className="text-lg font-bold text-gray-800 mb-6 flex items-center gap-2">
            <Trophy className="w-5 h-5 text-green-600" />
            توزيع الإيرادات (هذا الشهر)
          </h2>
          <div className="h-72 w-full min-w-0" dir="ltr">
            {revenueBreakdown.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                <PieChart>
                  <Pie
                    data={revenueBreakdown}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={100}
                    paddingAngle={5}
                    dataKey="value"
                  >
                    {revenueBreakdown.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <RechartsTooltip formatter={(value: number) => formatCurrency(value)} />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex h-full items-center justify-center text-gray-500" dir="rtl">
                لا توجد إيرادات مسجلة هذا الشهر
              </div>
            )}
          </div>
        </div>
      </div>


      {/* Alerts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Expiring Members */}
        <div className="bg-white rounded-xl shadow-sm border border-red-100 p-6">
          <h2 className="text-lg font-bold text-red-700 mb-4 flex items-center gap-2">
            <AlertTriangle className="w-5 h-5" />
            اشتراكات تنتهي قريباً (خلال 7 أيام)
            <span className="bg-red-100 text-red-800 text-xs py-1 px-2 rounded-full mr-auto">
              {expiringMembers.length}
            </span>
          </h2>
          <div className="space-y-3 max-h-60 overflow-y-auto pr-2">
            {expiringMembers.length === 0 ? (
              <p className="text-gray-500 text-sm">لا توجد اشتراكات تنتهي قريباً.</p>
            ) : (
              expiringMembers.map(member => (
                <div key={member.id} className="flex justify-between items-center p-3 bg-red-50 rounded-lg border border-red-100">
                  <div>
                    <p className="font-semibold text-gray-800">{member.full_name}</p>
                    <p className="text-xs text-gray-500">{member.phone || 'بدون هاتف'}</p>
                  </div>
                  <div className="text-left">
                    <p className="text-sm font-bold text-red-600">{member.end_date ? format(new Date(member.end_date), 'yyyy-MM-dd') : ''}</p>
                    <p className="text-xs text-gray-500">تاريخ الانتهاء</p>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Overdue Contracts */}
        <div className="bg-white rounded-xl shadow-sm border border-orange-100 p-6">
          <h2 className="text-lg font-bold text-orange-700 mb-4 flex items-center gap-2">
            <AlertTriangle className="w-5 h-5" />
            إيجارات متأخرة الدفع
            <span className="bg-orange-100 text-orange-800 text-xs py-1 px-2 rounded-full mr-auto">
              {overdueContracts.length}
            </span>
          </h2>
          <div className="space-y-3 max-h-60 overflow-y-auto pr-2">
            {overdueContracts.length === 0 ? (
              <p className="text-gray-500 text-sm">لا توجد عقود متأخرة.</p>
            ) : (
              overdueContracts.map(contract => (
                <div key={contract.id} className="flex justify-between items-center p-3 bg-orange-50 rounded-lg border border-orange-100">
                  <div>
                    <p className="font-semibold text-gray-800">{contract.tenant_name}</p>
                    <p className="text-xs text-gray-500">رقم العقد: {contract.id.slice(0, 8)}</p>
                  </div>
                  <div className="text-left">
                    <p className="text-sm font-bold text-orange-600">{contract.next_due_date ? format(new Date(contract.next_due_date), 'yyyy-MM-dd') : ''}</p>
                    <p className="text-xs text-gray-500">تاريخ الاستحقاق</p>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

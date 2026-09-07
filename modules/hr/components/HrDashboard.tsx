import React, { useState, useEffect } from 'react';
import { useAccounting } from '../../../context/AccountingContext';
import { supabase } from '../../../supabaseClient';
import { hrEnterpriseService } from '../../../services/hrEnterpriseService';
import {
  Users,
  Clock,
  Calendar,
  Banknote,
  ShieldAlert,
  Cpu,
  CheckCircle2,
  TrendingUp,
  Activity,
  UserCheck,
  AlertTriangle,
  ArrowRight,
  Plus
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export const HrDashboard: React.FC = () => {
  const { currentSelectedOrgId, currentUser, employees } = useAccounting();
  const navigate = useNavigate();

  const [stats, setStats] = useState({
    totalEmployees: 0,
    presentToday: 0,
    lateToday: 0,
    onLeaveToday: 0,
    pendingAdvancesCount: 0,
    totalAdvancesPending: 0,
    activeDevicesCount: 0,
    activePenaltiesCount: 0
  });

  const [recentPunches, setRecentPunches] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const orgId = currentSelectedOrgId || (currentUser as any)?.organization_id;

  const loadDashboardData = async () => {
    setLoading(true);
    try {
      const todayStr = new Date().toISOString().split('T')[0];

      const [attRes, advRes, devRes, penRes, logs] = await Promise.all([
        supabase.from('hr_attendance_logs').select('*').eq('organization_id', orgId).eq('log_date', todayStr),
        supabase.from('employee_advances').select('*').eq('organization_id', orgId).eq('status', 'paid').is('payroll_item_id', null),
        hrEnterpriseService.getDevices(orgId),
        hrEnterpriseService.getPenaltiesRewards(orgId),
        hrEnterpriseService.getRawLogs(orgId)
      ]);

      const attendanceLogs = attRes.data || [];
      const advances = advRes.data || [];
      const present = attendanceLogs.filter(a => a.status === 'PRESENT').length;
      const late = attendanceLogs.filter(a => a.status === 'LATE').length;
      const onLeave = attendanceLogs.filter(a => a.status === 'ON_LEAVE').length;

      const totalAdvances = advances.reduce((s, a) => s + Number(a.amount || 0), 0);

      setStats({
        totalEmployees: employees.length,
        presentToday: present,
        lateToday: late,
        onLeaveToday: onLeave,
        pendingAdvancesCount: advances.length,
        totalAdvancesPending: totalAdvances,
        activeDevicesCount: devRes.length,
        activePenaltiesCount: penRes.length
      });

      setRecentPunches(logs.slice(0, 6));
    } catch (e: any) {
      console.warn('Dashboard load notice:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDashboardData();
  }, [orgId, employees]);

  return (
    <div className="space-y-6 animate-in fade-in">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-blue-700 via-indigo-700 to-purple-800 p-6 md:p-8 rounded-3xl text-white shadow-xl flex flex-wrap justify-between items-center gap-4">
        <div className="space-y-1">
          <span className="px-3 py-1 bg-white/20 backdrop-blur rounded-full text-xs font-bold inline-block mb-2">
            HRMS 360 Dashboard • نظام الموارد البشرية المتكامل
          </span>
          <h2 className="text-2xl md:text-3xl font-black">مركز قيادة الموارد البشرية والرواتب</h2>
          <p className="text-xs text-blue-100 max-w-xl">
            متابعة حية للحضور بالبصمة، إدارة الورديات، صرف الرواتب الشهرية، والعهد والسلف التابعة للعاملين.
          </p>
        </div>

        <div className="flex gap-2">
          <button
            onClick={() => navigate('/hr/payroll')}
            className="px-4 py-2.5 bg-white text-blue-800 hover:bg-blue-50 rounded-xl text-xs font-bold flex items-center gap-2 shadow-lg transition"
          >
            <Banknote className="w-4 h-4 text-blue-600" /> مسير الرواتب
          </button>
          <button
            onClick={() => navigate('/hr/biometrics')}
            className="px-4 py-2.5 bg-indigo-500/30 hover:bg-indigo-500/40 text-white border border-white/20 rounded-xl text-xs font-bold flex items-center gap-2 transition backdrop-blur"
          >
            <Cpu className="w-4 h-4" /> ماكينات البصمة
          </button>
        </div>
      </div>

      {/* Metric Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-xs font-bold text-slate-400">إجمالي الموظفين</span>
            <h3 className="text-2xl font-black text-slate-800">{stats.totalEmployees}</h3>
            <span className="text-[10px] text-emerald-600 font-bold">على رأس العمل</span>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center">
            <Users className="w-6 h-6" />
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-xs font-bold text-slate-400">حضور اليوم (البصمة)</span>
            <h3 className="text-2xl font-black text-emerald-600">{stats.presentToday}</h3>
            <span className="text-[10px] text-slate-400 font-bold">{stats.lateToday} تأخير مسجل</span>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
            <UserCheck className="w-6 h-6" />
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-xs font-bold text-slate-400">السلف المستحقة للخصم</span>
            <h3 className="text-2xl font-black text-rose-600 font-mono">{stats.totalAdvancesPending.toLocaleString()} ج</h3>
            <span className="text-[10px] text-slate-400 font-bold">{stats.pendingAdvancesCount} سلفة جارية</span>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center">
            <Banknote className="w-6 h-6" />
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-xs font-bold text-slate-400">أجهزة البصمة النشطة</span>
            <h3 className="text-2xl font-black text-indigo-600">{stats.activeDevicesCount}</h3>
            <span className="text-[10px] text-indigo-600 font-bold">ZKTeco Push Live</span>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
            <Cpu className="w-6 h-6" />
          </div>
        </div>
      </div>

      {/* Quick Navigation Sections */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div
          onClick={() => navigate('/hr/biometrics')}
          className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm hover:border-indigo-500 cursor-pointer transition flex items-center gap-4 group"
        >
          <div className="p-3 bg-indigo-100 text-indigo-700 rounded-2xl group-hover:bg-indigo-600 group-hover:text-white transition">
            <Cpu className="w-6 h-6" />
          </div>
          <div>
            <h4 className="font-bold text-sm text-slate-800">أجهزة وماكينات البصمة</h4>
            <p className="text-[11px] text-slate-400">ربط وتزامن ZKTeco ومطابقة الحركات</p>
          </div>
        </div>

        <div
          onClick={() => navigate('/hr/shifts')}
          className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm hover:border-blue-500 cursor-pointer transition flex items-center gap-4 group"
        >
          <div className="p-3 bg-blue-100 text-blue-700 rounded-2xl group-hover:bg-blue-600 group-hover:text-white transition">
            <Clock className="w-6 h-6" />
          </div>
          <div>
            <h4 className="font-bold text-sm text-slate-800">الورديات ومواعيد العمل</h4>
            <p className="text-[11px] text-slate-400">سياسات السماح والإضافي والدوام</p>
          </div>
        </div>

        <div
          onClick={() => navigate('/hr/penalties')}
          className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm hover:border-rose-500 cursor-pointer transition flex items-center gap-4 group"
        >
          <div className="p-3 bg-rose-100 text-rose-700 rounded-2xl group-hover:bg-rose-600 group-hover:text-white transition">
            <ShieldAlert className="w-6 h-6" />
          </div>
          <div>
            <h4 className="font-bold text-sm text-slate-800">الجزاءات والمكافآت</h4>
            <p className="text-[11px] text-slate-400">لائحة العمل والربط الآلي بالمسير</p>
          </div>
        </div>
      </div>

      {/* Recent Punches Table */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-3">
        <div className="flex justify-between items-center">
          <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
            <Activity className="w-4 h-4 text-emerald-600" /> آخر حركات البصمة الحية
          </h3>
          <button
            onClick={() => navigate('/hr/biometrics')}
            className="text-xs text-indigo-600 hover:text-indigo-700 font-bold flex items-center gap-1"
          >
            عرض الكل <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-right text-xs">
            <thead className="bg-slate-50 text-slate-500 font-bold border-b">
              <tr>
                <th className="p-3">الموظف</th>
                <th className="p-3 text-center">كود البصمة</th>
                <th className="p-3 text-center">الوقت</th>
                <th className="p-3 text-center">نوع الحركة</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {recentPunches.map(p => (
                <tr key={p.id} className="hover:bg-slate-50">
                  <td className="p-3 font-bold text-slate-800">{p.employee_name || 'موظف'}</td>
                  <td className="p-3 text-center font-mono font-bold text-slate-600">{p.biometric_id}</td>
                  <td className="p-3 text-center font-mono text-slate-600">
                    {new Date(p.log_timestamp).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })}
                  </td>
                  <td className="p-3 text-center">
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-50 text-indigo-800">
                      {p.punch_state === 'CHECK_IN' ? 'دخول 🟢' : 'خروج 🔴'}
                    </span>
                  </td>
                </tr>
              ))}
              {recentPunches.length === 0 && (
                <tr>
                  <td colSpan={4} className="p-6 text-center text-slate-400">
                    لا توجد حركات بصمة حديثة
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default HrDashboard;

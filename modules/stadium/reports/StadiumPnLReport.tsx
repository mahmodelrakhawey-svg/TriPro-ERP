import React, { useState, useEffect } from 'react';
import { useAccounting } from '@/context/AccountingContext';
import { supabase } from '@/supabaseClient';

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import * as XLSX from 'xlsx';
import {
  TrendingUp,
  TrendingDown,
  DollarSign,
  Download,
  Calendar,
  PieChart,
  CheckCircle2,
  AlertCircle,
  FileSpreadsheet,
} from 'lucide-react';

interface RevenueBreakdown {
  subscriptions: number;
  bookings: number;
  rentals: number;
  programs: number;
  totalRevenue: number;
}

interface ExpenseBreakdown {
  maintenance: number;
  supplies: number;
  tournaments: number;
  utilities: number;
  coaches: number;
  admin: number;
  other: number;
  totalExpense: number;
}

export const StadiumPnLReport: React.FC = () => {
  const { currentUser, organization, currentSelectedOrgId } = useAccounting();
  const orgId = currentSelectedOrgId || (currentUser as any)?.organization_id || (organization as any)?.id;

  const [loading, setLoading] = useState(false);

  // Dates: Default to full current fiscal year
  const currentYear = new Date().getFullYear();
  const [startDate, setStartDate] = useState(`${currentYear}-01-01`);
  const [endDate, setEndDate] = useState(`${currentYear}-12-31`);

  const [revenues, setRevenues] = useState<RevenueBreakdown>({
    subscriptions: 0,
    bookings: 0,
    rentals: 0,
    programs: 0,
    totalRevenue: 0,
  });

  const [expenses, setExpenses] = useState<ExpenseBreakdown>({
    maintenance: 0,
    supplies: 0,
    tournaments: 0,
    utilities: 0,
    coaches: 0,
    admin: 0,
    other: 0,
    totalExpense: 0,
  });

  useEffect(() => {
    if (orgId) {
      fetchPnLData();
    }
  }, [orgId, startDate, endDate]);

  const fetchPnLData = async () => {
    if (!orgId) return;
    setLoading(true);
    try {
      // ─────────────────────────────────────────────
      // 1. جلب القيود المحاسبية من دفتر اليومية العام للمنشأة
      // ─────────────────────────────────────────────
      const { data: entries, error: jErr } = await supabase
        .from('journal_entries')
        .select('id, transaction_date, status, journal_lines(debit, credit, accounts:account_id(code, name, type))')
        .eq('organization_id', orgId)
        .gte('transaction_date', startDate)
        .lte('transaction_date', endDate);

      if (jErr) {
        console.warn('Journal entries query warning:', jErr);
      }

      if (entries && entries.length > 0) {
        let subTotal = 0;
        let bookTotal = 0;
        let rentTotal = 0;
        let progTotal = 0;

        let maintTotal = 0;
        let supTotal = 0;
        let tourTotal = 0;
        let utilTotal = 0;
        let coachTotal = 0;
        let adminTotal = 0;
        let otherTotal = 0;

        entries.forEach((entry: any) => {
          (entry.journal_lines || []).forEach((line: any) => {
            const code = String(line.accounts?.code || '');
            const netCredit = Number(line.credit || 0) - Number(line.debit || 0); // صافي حركة الإيراد الدائن
            const netDebit = Number(line.debit || 0) - Number(line.credit || 0);  // صافي حركة المصروف المدين

            // الإيرادات (حسابات 4xxx)
            if (code === '4101') subTotal += netCredit;
            else if (code === '4102') bookTotal += netCredit;
            else if (code === '4103') rentTotal += netCredit;
            else if (code === '4104') progTotal += netCredit;
            else if (code.startsWith('4')) progTotal += netCredit;

            // المصروفات والتكاليف (حسابات 5xxx)
            else if (code === '5101') maintTotal += netDebit; // صيانة الملاعب والمرافق
            else if (code === '5102') supTotal += netDebit;  // مهمات وأدوات رياضية
            else if (code === '5103') tourTotal += netDebit; // بطولات وفعاليات رياضية
            else if (code === '5104') utilTotal += netDebit; // إنارة وكهرباء ومياه
            else if (code === '5201') coachTotal += netDebit; // كوادر ومدربين
            else if (code === '5311') tourTotal += netDebit; // بدلات وانتقالات عهد الأنشطة
            else if (code === '539' || code === '5301' || code.startsWith('53')) adminTotal += netDebit; // ضيافة ومصروفات إدارية
            else if (code.startsWith('5')) otherTotal += netDebit;
          });
        });

        const totalRev = Math.max(0, subTotal) + Math.max(0, bookTotal) + Math.max(0, rentTotal) + Math.max(0, progTotal);
        const totalExp = Math.max(0, maintTotal) + Math.max(0, supTotal) + Math.max(0, tourTotal) + Math.max(0, utilTotal) + Math.max(0, coachTotal) + Math.max(0, adminTotal) + Math.max(0, otherTotal);

        setRevenues({
          subscriptions: Math.max(0, subTotal),
          bookings: Math.max(0, bookTotal),
          rentals: Math.max(0, rentTotal),
          programs: Math.max(0, progTotal),
          totalRevenue: totalRev,
        });

        setExpenses({
          maintenance: Math.max(0, maintTotal),
          supplies: Math.max(0, supTotal),
          tournaments: Math.max(0, tourTotal),
          utilities: Math.max(0, utilTotal),
          coaches: Math.max(0, coachTotal),
          admin: Math.max(0, adminTotal),
          other: Math.max(0, otherTotal),
          totalExpense: totalExp,
        });
        return;
      }

      // ─────────────────────────────────────────────
      // 2. خطة بديلة (Fallback) في حال عدم وجود قيود يومية مسجلة بعد
      // ─────────────────────────────────────────────
      const { data: subData } = await supabase
        .from('stadium_subscriptions')
        .select('amount_paid')
        .eq('organization_id', orgId)
        .gte('payment_date', startDate)
        .lte('payment_date', endDate);
      const subTotal = (subData || []).reduce((acc, r) => acc + Number(r.amount_paid || 0), 0);

      const { data: bookData } = await supabase
        .from('stadium_bookings')
        .select('total_amount')
        .eq('organization_id', orgId)
        .in('status', ['confirmed', 'paid'])
        .gte('booking_date', startDate)
        .lte('booking_date', endDate);
      const bookTotal = (bookData || []).reduce((acc, r) => acc + Number(r.total_amount || 0), 0);

      const { data: rentData } = await supabase
        .from('stadium_rental_payments')
        .select('amount_paid')
        .eq('organization_id', orgId)
        .gte('payment_date', startDate)
        .lte('payment_date', endDate);
      const rentTotal = (rentData || []).reduce((acc, r) => acc + Number(r.amount_paid || 0), 0);

      const { data: progData } = await supabase
        .from('stadium_program_enrollments')
        .select('amount_paid')
        .eq('organization_id', orgId)
        .gte('enrollment_date', startDate)
        .lte('enrollment_date', endDate);
      const progTotal = (progData || []).reduce((acc, r) => acc + Number(r.amount_paid || 0), 0);

      const totalRev = subTotal + bookTotal + rentTotal + progTotal;
      setRevenues({
        subscriptions: subTotal,
        bookings: bookTotal,
        rentals: rentTotal,
        programs: progTotal,
        totalRevenue: totalRev,
      });

      // المصروفات من الصيانة والطلبات
      let maintTotal = 0;
      let supTotal = 0;
      let tourTotal = 0;
      let utilTotal = 0;
      let adminTotal = 0;
      let otherTotal = 0;

      const { data: mntTickets } = await supabase
        .from('stadium_maintenance_tickets')
        .select('actual_cost')
        .eq('organization_id', orgId)
        .eq('status', 'completed')
        .gte('end_date', startDate)
        .lte('end_date', endDate);
      (mntTickets || []).forEach(t => {
        maintTotal += Number(t.actual_cost || 0);
      });

      const { data: disbData } = await supabase
        .from('stadium_disbursements')
        .select('amount, category')
        .eq('organization_id', orgId)
        .eq('status', 'paid')
        .gte('created_at', `${startDate}T00:00:00Z`)
        .lte('created_at', `${endDate}T23:59:59Z`);

      if (disbData) {
        disbData.forEach(d => {
          const amt = Number(d.amount || 0);
          if (d.category === 'maintenance') maintTotal += amt;
          else if (d.category === 'supplies') supTotal += amt;
          else if (d.category === 'tournament') tourTotal += amt;
          else if (d.category === 'utilities') utilTotal += amt;
          else if (d.category === 'administrative') adminTotal += amt;
          else otherTotal += amt;
        });
      }

      const { data: custData } = await supabase
        .from('stadium_custodies')
        .select('spent_amount')
        .eq('organization_id', orgId)
        .eq('status', 'settled')
        .gte('issue_date', startDate)
        .lte('issue_date', endDate);

      if (custData) {
        custData.forEach(c => {
          tourTotal += Number(c.spent_amount || 0);
        });
      }

      const { data: coachData } = await supabase
        .from('stadium_coach_payments')
        .select('amount_paid')
        .eq('organization_id', orgId)
        .gte('payment_date', startDate)
        .lte('payment_date', endDate);
      const coachesTotal = (coachData || []).reduce((acc, r) => acc + Number(r.amount_paid || 0), 0);

      const totalExp = maintTotal + supTotal + tourTotal + utilTotal + coachesTotal + adminTotal + otherTotal;
      setExpenses({
        maintenance: maintTotal,
        supplies: supTotal,
        tournaments: tourTotal,
        utilities: utilTotal,
        coaches: coachesTotal,
        admin: adminTotal,
        other: otherTotal,
        totalExpense: totalExp,
      });

    } catch (err: any) {
      console.error('Error fetching Stadium P&L data:', err);
    } finally {
      setLoading(false);
    }
  };


  const netResult = revenues.totalRevenue - expenses.totalExpense;
  const isSurplus = netResult >= 0;
  const marginPercent = revenues.totalRevenue > 0 ? (netResult / revenues.totalRevenue) * 100 : 0;

  const comparisonChartData = [
    {
      name: 'المركز المالي للفترة',
      'إجمالي الإيرادات': revenues.totalRevenue,
      'إجمالي المصروفات': expenses.totalExpense,
    },
  ];

  const exportToExcel = () => {
    const rows = [
      { 'البند': '=== الإيرادات الرياضية ===', 'القيمة (ج.م)': '' },
      { 'البند': 'إيرادات الاشتراكات الرياضية', 'القيمة (ج.م)': revenues.subscriptions },
      { 'البند': 'إيرادات حجوزات الملاعب والمرافق', 'القيمة (ج.م)': revenues.bookings },
      { 'البند': 'إيرادات عقود الإيجار والاستغلال', 'القيمة (ج.م)': revenues.rentals },
      { 'البند': 'إيرادات البرامج والأكاديميات التدريبية', 'القيمة (ج.م)': revenues.programs },
      { 'البند': 'إجمالي الإيرادات', 'القيمة (ج.م)': revenues.totalRevenue },
      { 'البند': '', 'القيمة (ج.م)': '' },
      { 'البند': '=== المصروفات والنفقات التشغيلية ===', 'القيمة (ج.م)': '' },
      { 'البند': 'مصروفات صيانة الملاعب والمرافق', 'القيمة (ج.م)': expenses.maintenance },
      { 'البند': 'مهمات وأدوات ومستلزمات رياضية', 'القيمة (ج.م)': expenses.supplies },
      { 'البند': 'مصروفات البطولات والمعسكرات والعهد', 'القيمة (ج.م)': expenses.tournaments },
      { 'البند': 'فواتير تشغيل ومرافق وخدمات', 'القيمة (ج.م)': expenses.utilities },
      { 'البند': 'مستحقات وعمولات الكوادر والمدربين', 'القيمة (ج.م)': expenses.coaches },
      { 'البند': 'مصروفات إدارية وعمومية', 'القيمة (ج.م)': expenses.admin },
      { 'البند': 'مصروفات أخرى', 'القيمة (ج.م)': expenses.other },
      { 'البند': 'إجمالي المصروفات', 'القيمة (ج.م)': expenses.totalExpense },
      { 'البند': '', 'القيمة (ج.م)': '' },
      { 'البند': isSurplus ? 'صافي الفائض (أرباح النشاط)' : 'صافي العجز (خسائر النشاط)', 'القيمة (ج.م)': netResult },
    ];

    const worksheet = XLSX.utils.json_to_sheet(rows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'قائمة الفائض والعجز');
    XLSX.writeFile(workbook, `قائمة_الفائض_والعجز_للاستاد_${startDate}_إلى_${endDate}.xlsx`);
  };


  return (
    <div className="p-6 bg-gray-50 dark:bg-gray-900 min-h-screen text-right" dir="rtl">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-800 dark:text-gray-100 flex items-center gap-2">
            <PieChart className="text-green-600 dark:text-green-400 w-7 h-7" />
            قائمة الفائض والعجز المالي (P&L) للاستاد والمركز الشبابي
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            مقارنة الإيرادات بالمصروفات وتحديد النتيجة المالية الصافية للنشاط الرياضي
          </p>
        </div>
        <button
          onClick={exportToExcel}
          className="bg-green-600 hover:bg-green-700 text-white px-4 py-2.5 rounded-lg flex items-center gap-2 shadow font-medium transition"
        >
          <Download size={18} />
          تصدير القائمة لـ Excel
        </button>
      </div>

      {/* Date Filter */}
      <div className="bg-white dark:bg-gray-800 p-4 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 mb-6 flex flex-wrap gap-4 items-center justify-between">
        <div className="flex flex-wrap gap-3 items-center">
          <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300">
            <Calendar size={18} className="text-gray-400" />
            <span>من تاريخ:</span>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="border rounded-lg p-2 text-sm bg-gray-50 dark:bg-gray-900 border-gray-200 dark:border-gray-700"
            />
          </div>

          <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300">
            <span>إلى تاريخ:</span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="border rounded-lg p-2 text-sm bg-gray-50 dark:bg-gray-900 border-gray-200 dark:border-gray-700"
            />
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500">حالة النتيجة:</span>
          {isSurplus ? (
            <span className="inline-flex items-center gap-1 text-sm bg-green-100 text-green-800 px-3 py-1 rounded-full font-bold">
              <CheckCircle2 size={16} /> فائض مالي ({marginPercent.toFixed(1)}%)
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 text-sm bg-red-100 text-red-800 px-3 py-1 rounded-full font-bold">
              <AlertCircle size={16} /> عجز مالي ({marginPercent.toFixed(1)}%)
            </span>
          )}
        </div>
      </div>

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <div className="bg-white dark:bg-gray-800 p-5 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700">
          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-500 font-medium">إجمالي الإيرادات المحققة</p>
            <div className="p-2 bg-green-50 text-green-600 rounded-lg">
              <TrendingUp size={22} />
            </div>
          </div>
          <p className="text-2xl font-bold text-green-600 dark:text-green-400 mt-2">
            {revenues.totalRevenue.toLocaleString('ar-EG')} ج.م
          </p>
          <span className="text-xs text-gray-400 mt-1 block">من 4 مصادر دخل رياضية</span>
        </div>

        <div className="bg-white dark:bg-gray-800 p-5 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700">
          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-500 font-medium">إجمالي المصروفات المنفذة</p>
            <div className="p-2 bg-red-50 text-red-600 rounded-lg">
              <TrendingDown size={22} />
            </div>
          </div>
          <p className="text-2xl font-bold text-red-600 dark:text-red-400 mt-2">
            {expenses.totalExpense.toLocaleString('ar-EG')} ج.م
          </p>
          <span className="text-xs text-gray-400 mt-1 block">شيكات صيانة وعهد وكوادر</span>
        </div>

        <div className="bg-white dark:bg-gray-800 p-5 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
              {isSurplus ? 'صافي الفائض المالي' : 'صافي العجز المالي'}
            </p>
            <div className={`p-2 rounded-lg ${isSurplus ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-600'}`}>
              <DollarSign size={22} />
            </div>
          </div>
          <p className={`text-2xl font-bold mt-2 ${isSurplus ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
            {netResult.toLocaleString('ar-EG')} ج.م
          </p>
          <span className="text-xs text-gray-400 mt-1 block">
            هامش الفائض: {marginPercent.toFixed(1)}%
          </span>
        </div>
      </div>

      {/* Comparison Chart */}
      <div className="bg-white dark:bg-gray-800 p-5 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 mb-6">
        <h3 className="font-bold text-gray-800 dark:text-gray-200 mb-4 flex items-center gap-2">
          <FileSpreadsheet size={18} className="text-indigo-600" />
          مقارنة الإيرادات والمصروفات الإجمالية للفترة (ج.م)
        </h3>
        <div className="h-64 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={comparisonChartData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
              <XAxis dataKey="name" />
              <YAxis />
              <Tooltip formatter={(val: any) => [`${Number(val).toLocaleString()} ج.م`]} />
              <Legend />
              <Bar dataKey="إجمالي الإيرادات" fill="#10b981" radius={[6, 6, 0, 0]} />
              <Bar dataKey="إجمالي المصروفات" fill="#ef4444" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Structured Income Statement (P&L) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Revenue Statement Side */}
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
          <div className="p-4 bg-green-50/70 dark:bg-green-950/30 border-b border-green-100 dark:border-green-900/50 flex justify-between items-center">
            <h3 className="font-bold text-green-900 dark:text-green-300 flex items-center gap-2">
              <TrendingUp size={18} /> الإيرادات الرياضية (Revenues)
            </h3>
            <span className="text-xs font-bold text-green-700 bg-green-100 px-2 py-0.5 rounded">
              {revenues.totalRevenue.toLocaleString('ar-EG')} ج.م
            </span>
          </div>
          <table className="w-full text-sm text-right">
            <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
              <tr className="hover:bg-gray-50/50 dark:hover:bg-gray-750">
                <td className="p-3.5 text-gray-700 dark:text-gray-300">إيرادات الاشتراكات الرياضية (4101)</td>
                <td className="p-3.5 text-left font-bold text-gray-900 dark:text-gray-100 font-mono">
                  {revenues.subscriptions.toLocaleString('ar-EG')} ج.م
                </td>
              </tr>
              <tr className="hover:bg-gray-50/50 dark:hover:bg-gray-750">
                <td className="p-3.5 text-gray-700 dark:text-gray-300">إيرادات حجوزات الملاعب والمرافق (4102)</td>
                <td className="p-3.5 text-left font-bold text-gray-900 dark:text-gray-100 font-mono">
                  {revenues.bookings.toLocaleString('ar-EG')} ج.م
                </td>
              </tr>
              <tr className="hover:bg-gray-50/50 dark:hover:bg-gray-750">
                <td className="p-3.5 text-gray-700 dark:text-gray-300">إيرادات عقود الإيجار والاستغلال (4103)</td>
                <td className="p-3.5 text-left font-bold text-gray-900 dark:text-gray-100 font-mono">
                  {revenues.rentals.toLocaleString('ar-EG')} ج.م
                </td>
              </tr>
              <tr className="hover:bg-gray-50/50 dark:hover:bg-gray-750">
                <td className="p-3.5 text-gray-700 dark:text-gray-300">إيرادات البرامج والأكاديميات التدريبية (4104)</td>
                <td className="p-3.5 text-left font-bold text-gray-900 dark:text-gray-100 font-mono">
                  {revenues.programs.toLocaleString('ar-EG')} ج.م
                </td>
              </tr>
            </tbody>
            <tfoot className="bg-green-50/40 dark:bg-green-950/20 font-bold border-t dark:border-gray-700">
              <tr>
                <td className="p-3.5 text-green-900 dark:text-green-300">مجموع الإيرادات:</td>
                <td className="p-3.5 text-left text-green-700 dark:text-green-400 font-mono text-base">
                  {revenues.totalRevenue.toLocaleString('ar-EG')} ج.م
                </td>
              </tr>
            </tfoot>
          </table>
        </div>

        {/* Expense Statement Side */}
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
          <div className="p-4 bg-red-50/70 dark:bg-red-950/30 border-b border-red-100 dark:border-red-900/50 flex justify-between items-center">
            <h3 className="font-bold text-red-900 dark:text-red-300 flex items-center gap-2">
              <TrendingDown size={18} /> المصروفات والنفقات (Expenses)
            </h3>
            <span className="text-xs font-bold text-red-700 bg-red-100 px-2 py-0.5 rounded">
              {expenses.totalExpense.toLocaleString('ar-EG')} ج.م
            </span>
          </div>
          <table className="w-full text-sm text-right">
            <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
              <tr className="hover:bg-gray-50/50 dark:hover:bg-gray-750">
                <td className="p-3 text-gray-700 dark:text-gray-300">مصروفات صيانة الملاعب والمرافق (5101)</td>
                <td className="p-3 text-left font-bold text-gray-900 dark:text-gray-100 font-mono">
                  {expenses.maintenance.toLocaleString('ar-EG')} ج.م
                </td>
              </tr>
              <tr className="hover:bg-gray-50/50 dark:hover:bg-gray-750">
                <td className="p-3 text-gray-700 dark:text-gray-300">مهمات وأدوات رياضية (5102)</td>
                <td className="p-3 text-left font-bold text-gray-900 dark:text-gray-100 font-mono">
                  {expenses.supplies.toLocaleString('ar-EG')} ج.م
                </td>
              </tr>
              <tr className="hover:bg-gray-50/50 dark:hover:bg-gray-750">
                <td className="p-3 text-gray-700 dark:text-gray-300">مصروفات البطولات والأنشطة والعهد (5103)</td>
                <td className="p-3 text-left font-bold text-gray-900 dark:text-gray-100 font-mono">
                  {expenses.tournaments.toLocaleString('ar-EG')} ج.م
                </td>
              </tr>
              <tr className="hover:bg-gray-50/50 dark:hover:bg-gray-750">
                <td className="p-3 text-gray-700 dark:text-gray-300">فواتير تشغيل وخدمات الاستاد (5104)</td>
                <td className="p-3 text-left font-bold text-gray-900 dark:text-gray-100 font-mono">
                  {expenses.utilities.toLocaleString('ar-EG')} ج.م
                </td>
              </tr>
              <tr className="hover:bg-gray-50/50 dark:hover:bg-gray-750">
                <td className="p-3 text-gray-700 dark:text-gray-300">مستحقات وعمولات الكوادر والمدربين (5201)</td>
                <td className="p-3 text-left font-bold text-gray-900 dark:text-gray-100 font-mono">
                  {expenses.coaches.toLocaleString('ar-EG')} ج.م
                </td>
              </tr>
              <tr className="hover:bg-gray-50/50 dark:hover:bg-gray-750">
                <td className="p-3 text-gray-700 dark:text-gray-300">مصروفات إدارية وعمومية (5301)</td>
                <td className="p-3 text-left font-bold text-gray-900 dark:text-gray-100 font-mono">
                  {expenses.admin.toLocaleString('ar-EG')} ج.م
                </td>
              </tr>
              <tr className="hover:bg-gray-50/50 dark:hover:bg-gray-750">
                <td className="p-3 text-gray-700 dark:text-gray-300">مصروفات أخرى متنوعة</td>
                <td className="p-3 text-left font-bold text-gray-900 dark:text-gray-100 font-mono">
                  {expenses.other.toLocaleString('ar-EG')} ج.م
                </td>
              </tr>
            </tbody>
            <tfoot className="bg-red-50/40 dark:bg-red-950/20 font-bold border-t dark:border-gray-700">
              <tr>
                <td className="p-3 text-red-900 dark:text-red-300">مجموع المصروفات:</td>
                <td className="p-3 text-left text-red-600 dark:text-red-400 font-mono text-base">
                  {expenses.totalExpense.toLocaleString('ar-EG')} ج.م
                </td>
              </tr>
            </tfoot>

          </table>
        </div>
      </div>
    </div>
  );
};

export default StadiumPnLReport;

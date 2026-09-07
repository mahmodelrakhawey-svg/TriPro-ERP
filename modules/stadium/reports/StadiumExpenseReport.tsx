import React, { useState, useEffect } from 'react';
import { useAccounting } from '@/context/AccountingContext';
import { supabase } from '@/supabaseClient';
import { DISBURSEMENT_CATEGORY_LABELS, StadiumDisbursementCategory } from '../stadium.types';

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from 'recharts';
import * as XLSX from 'xlsx';
import {
  DollarSign,
  Download,
  Calendar,
  Filter,
  PieChart as PieIcon,
  BarChart3,
  TrendingDown,
  Layers,
} from 'lucide-react';

interface ExpenseItem {
  id: string;
  date: string;
  type: 'disbursement' | 'custody' | 'coach_payment' | 'maintenance' | 'general_expense';
  typeLabel: string;
  category: string;
  categoryLabel: string;
  title: string;
  beneficiary: string;
  amount: number;
  paymentMethod: string;
  referenceDoc?: string;
}

const COLORS = ['#ef4444', '#f59e0b', '#3b82f6', '#10b981', '#8b5cf6', '#ec4899', '#6b7280'];

export const StadiumExpenseReport: React.FC = () => {
  const { currentUser, organization, currentSelectedOrgId } = useAccounting();
  const orgId = currentSelectedOrgId || (currentUser as any)?.organization_id || (organization as any)?.id;

  const [expenses, setExpenses] = useState<ExpenseItem[]>([]);
  const [loading, setLoading] = useState(false);

  // Filters: Default to full current fiscal year
  const currentYear = new Date().getFullYear();
  const [startDate, setStartDate] = useState(`${currentYear}-01-01`);
  const [endDate, setEndDate] = useState(`${currentYear}-12-31`);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');

  useEffect(() => {
    if (orgId) {
      fetchExpenseData();
    }
  }, [orgId, startDate, endDate]);

  const fetchExpenseData = async () => {
    if (!orgId) return;
    setLoading(true);
    try {
      const items: ExpenseItem[] = [];

      // 1. أوامر صيانة الملاعب والمرافق المكتملة (stadium_maintenance_tickets)
      const { data: maintData } = await supabase
        .from('stadium_maintenance_tickets')
        .select('*, stadium_facilities(name)')
        .eq('organization_id', orgId)
        .eq('status', 'completed')
        .gte('end_date', startDate)
        .lte('end_date', endDate);

      if (maintData) {
        maintData.forEach(m => {
          const cost = Number(m.actual_cost || 0);
          if (cost > 0) {
            items.push({
              id: m.id,
              date: m.end_date || m.start_date || startDate,
              type: 'maintenance',
              typeLabel: 'صيانة منشأة / ملعب',
              category: 'maintenance',
              categoryLabel: 'مصروفات صيانة الملاعب والمرافق (5101)',
              title: `صيانة: ${m.title} — ${(m as any).stadium_facilities?.name || 'منشأة'}`,
              beneficiary: m.assigned_technician || 'فني / مقاول صيانة',
              amount: cost,
              paymentMethod: m.payment_method === 'cheque' ? 'شيك صادر' : (m.payment_method === 'bank' ? 'تحويل بنكي' : 'نقدي'),
              referenceDoc: m.ticket_number || 'صيانة',
            });
          }
        });
      }

      // 2. طلبات الصرف المنفذة (stadium_disbursements)
      const { data: disbData } = await supabase
        .from('stadium_disbursements')
        .select('*')
        .eq('organization_id', orgId)
        .eq('status', 'paid')
        .gte('created_at', `${startDate}T00:00:00Z`)
        .lte('created_at', `${endDate}T23:59:59Z`);

      if (disbData) {
        disbData.forEach(d => {
          items.push({
            id: d.id,
            date: d.created_at ? d.created_at.split('T')[0] : startDate,
            type: 'disbursement',
            typeLabel: 'طلب صرف معتمد',
            category: d.category,
            categoryLabel: DISBURSEMENT_CATEGORY_LABELS[d.category as StadiumDisbursementCategory] || 'مصروف عام',
            title: d.title,
            beneficiary: d.beneficiary_name,
            amount: Number(d.amount),
            paymentMethod: d.payment_type === 'cheque' ? 'شيك صادر' : d.payment_type,
            referenceDoc: d.request_number,
          });
        });
      }

      // 3. العهد المسواة (stadium_custodies)
      const { data: custData } = await supabase
        .from('stadium_custodies')
        .select('*')
        .eq('organization_id', orgId)
        .eq('status', 'settled')
        .gte('issue_date', startDate)
        .lte('issue_date', endDate);

      if (custData) {
        custData.forEach(c => {
          if (Number(c.spent_amount) > 0) {
            items.push({
              id: c.id,
              date: c.settlement_date || c.issue_date,
              type: 'custody',
              typeLabel: 'عهدة نشاط / بطولة',
              category: 'tournament',
              categoryLabel: 'أنشطة وبطولات (عهدة)',
              title: `تسوية عهدة: ${c.purpose}`,
              beneficiary: c.custodian_name,
              amount: Number(c.spent_amount),
              paymentMethod: c.disbursement_method === 'cheque' ? 'شيك صادر' : 'نقدي',
              referenceDoc: c.cheque_number ? `شيك ${c.cheque_number}` : 'عهدة',
            });
          }
        });
      }

      // 4. عمولات ومستحقات المدربين والكوادر (stadium_coach_payments)
      const { data: coachData } = await supabase
        .from('stadium_coach_payments')
        .select('*, stadium_coaches(full_name)')
        .eq('organization_id', orgId)
        .gte('payment_date', startDate)
        .lte('payment_date', endDate);

      if (coachData) {
        coachData.forEach(cp => {
          items.push({
            id: cp.id,
            date: cp.payment_date,
            type: 'coach_payment',
            typeLabel: 'مستحقات مدربين',
            category: 'staff',
            categoryLabel: 'كوادر ومدربون',
            title: `مستحقات تدريب عن الفترة ${cp.period_from} إلى ${cp.period_to}`,
            beneficiary: (cp as any).stadium_coaches?.full_name || 'مدرب',
            amount: Number(cp.amount_paid),
            paymentMethod: cp.payment_method || 'نقدي',
            referenceDoc: 'عمولة تدريب',
          });
        });
      }

      items.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      setExpenses(items);
    } catch (err: any) {
      console.error('Error fetching stadium expenses:', err);
    } finally {
      setLoading(false);
    }
  };


  const filteredExpenses = expenses.filter(e => {
    if (selectedCategory === 'all') return true;
    return e.category === selectedCategory;
  });

  const totalExpenseAmount = filteredExpenses.reduce((acc, e) => acc + e.amount, 0);

  // Group by category for charts
  const categorySummary = expenses.reduce((acc: Record<string, { label: string; value: number }>, item) => {
    if (!acc[item.category]) {
      acc[item.category] = { label: item.categoryLabel, value: 0 };
    }
    acc[item.category].value += item.amount;
    return acc;
  }, {});

  const chartData = Object.values(categorySummary);

  const exportToExcel = () => {
    const rows = filteredExpenses.map(e => ({
      'التاريخ': e.date,
      'نوع المستند': e.typeLabel,
      'التصنيف / البند': e.categoryLabel,
      'البيان والموضوع': e.title,
      'المستفيد': e.beneficiary,
      'المبلغ (ج.م)': e.amount,
      'طريقة الصرف': e.paymentMethod,
      'رقم المرجع / الشيك': e.referenceDoc || '—',
    }));

    const worksheet = XLSX.utils.json_to_sheet(rows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'مصروفات الاستاد');
    XLSX.writeFile(workbook, `تقرير_مصروفات_الاستاد_${startDate}_إلى_${endDate}.xlsx`);
  };


  return (
    <div className="p-6 bg-gray-50 dark:bg-gray-900 min-h-screen text-right" dir="rtl">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-800 dark:text-gray-100 flex items-center gap-2">
            <TrendingDown className="text-red-600 dark:text-red-400 w-7 h-7" />
            تقرير مصروفات ونفقات الاستاد والمركز الرياضي
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            تحليل تفصيلي وإجمالي لبنود الصيانة والمهمات والبطولات ومستحقات الكوادر
          </p>
        </div>
        <button
          onClick={exportToExcel}
          disabled={filteredExpenses.length === 0}
          className="bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white px-4 py-2.5 rounded-lg flex items-center gap-2 shadow font-medium transition"
        >
          <Download size={18} />
          تصدير إلى Excel
        </button>
      </div>

      {/* Filters Bar */}
      <div className="bg-white dark:bg-gray-800 p-4 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 mb-6 flex flex-wrap gap-4 items-center justify-between">
        <div className="flex flex-wrap gap-3 items-center">
          <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300">
            <Calendar size={18} className="text-gray-400" />
            <span>من:</span>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="border rounded-lg p-2 text-sm bg-gray-50 dark:bg-gray-900 border-gray-200 dark:border-gray-700"
            />
          </div>

          <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300">
            <span>إلى:</span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="border rounded-lg p-2 text-sm bg-gray-50 dark:bg-gray-900 border-gray-200 dark:border-gray-700"
            />
          </div>

          <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300">
            <Filter size={16} className="text-gray-400" />
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="border rounded-lg p-2 text-sm bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700"
            >
              <option value="all">جميع بنود المصروفات</option>
              {Object.entries(DISBURSEMENT_CATEGORY_LABELS).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="text-left">
          <span className="text-xs text-gray-500 block">إجمالي المصروفات للفترة:</span>
          <span className="text-xl font-bold text-red-600 dark:text-red-400">
            {totalExpenseAmount.toLocaleString('ar-EG')} ج.م
          </span>
        </div>
      </div>

      {/* Visual Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        <div className="bg-white dark:bg-gray-800 p-5 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700">
          <h3 className="text-base font-bold mb-4 flex items-center gap-2 text-gray-800 dark:text-gray-200">
            <BarChart3 size={18} className="text-amber-500" /> توزيع النفقات حسب البنود (ج.م)
          </h3>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 10, right: 10, left: 10, bottom: 25 }}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                <XAxis dataKey="label" angle={-15} textAnchor="end" interval={0} tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip formatter={(val: any) => [`${Number(val).toLocaleString()} ج.م`, 'المصروف']} />
                <Bar dataKey="value" fill="#f59e0b" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 p-5 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700">
          <h3 className="text-base font-bold mb-4 flex items-center gap-2 text-gray-800 dark:text-gray-200">
            <PieIcon size={18} className="text-red-500" /> النسب المئوية للمصروفات
          </h3>
          <div className="h-64 w-full flex items-center justify-center">
            {chartData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={chartData}
                    dataKey="value"
                    nameKey="label"
                    cx="50%"
                    cy="50%"
                    outerRadius={80}
                    label={(entry: any) => entry.name || entry.label}
                  >
                    {chartData.map((_, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(val: any) => [`${Number(val).toLocaleString()} ج.م`, 'المبلغ']} />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-gray-400 text-sm">لا توجد بيانات للفترة المحددة</p>
            )}
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
        <div className="p-4 border-b dark:border-gray-700 flex justify-between items-center bg-gray-50/50 dark:bg-gray-900/30">
          <h3 className="font-bold text-gray-800 dark:text-gray-200 flex items-center gap-2">
            <Layers size={18} className="text-gray-500" />
            سجل المصروفات التفصيلي ({filteredExpenses.length} حركة)
          </h3>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm text-right">
            <thead className="bg-gray-50 dark:bg-gray-900/50 text-gray-500 dark:text-gray-400 border-b dark:border-gray-700">
              <tr>
                <th className="p-3.5">التاريخ</th>
                <th className="p-3.5">نوع المستند</th>
                <th className="p-3.5">البند والتصنيف</th>
                <th className="p-3.5">البيان والموضوع</th>
                <th className="p-3.5">المستفيد</th>
                <th className="p-3.5">طريقة الصرف</th>
                <th className="p-3.5 text-left">المبلغ المنصرف</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
              {loading ? (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-gray-500">جاري تحميل تقرير المصروفات...</td>
                </tr>
              ) : filteredExpenses.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-gray-500">لا توجد مصروفات مسجلة في هذا النطاق الزمني</td>
                </tr>
              ) : (
                filteredExpenses.map((e) => (
                  <tr key={e.id} className="hover:bg-gray-50/80 dark:hover:bg-gray-750 transition">
                    <td className="p-3.5 font-mono text-xs text-gray-600 dark:text-gray-400">{e.date}</td>
                    <td className="p-3.5">
                      <span className="text-xs bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded">
                        {e.typeLabel}
                      </span>
                    </td>
                    <td className="p-3.5">
                      <span className="text-xs text-amber-700 dark:text-amber-400 font-medium">
                        {e.categoryLabel}
                      </span>
                    </td>
                    <td className="p-3.5 font-medium text-gray-800 dark:text-gray-200">
                      {e.title}
                      {e.referenceDoc && (
                        <span className="text-[11px] text-gray-400 block font-mono">مرجع: {e.referenceDoc}</span>
                      )}
                    </td>
                    <td className="p-3.5 text-gray-700 dark:text-gray-300">{e.beneficiary}</td>
                    <td className="p-3.5 text-xs text-gray-600 dark:text-gray-400">{e.paymentMethod}</td>
                    <td className="p-3.5 text-left font-bold text-red-600 dark:text-red-400 font-mono">
                      {e.amount.toLocaleString('ar-EG')} ج.م
                    </td>
                  </tr>
                ))
              )}
            </tbody>
            {filteredExpenses.length > 0 && (
              <tfoot className="bg-gray-50 dark:bg-gray-900/80 font-bold border-t dark:border-gray-700">
                <tr>
                  <td colSpan={6} className="p-3.5 text-right">الإجمالي الكلي للمصروفات:</td>
                  <td className="p-3.5 text-left text-red-600 dark:text-red-400 font-mono text-base">
                    {totalExpenseAmount.toLocaleString('ar-EG')} ج.م
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
    </div>
  );
};


export default StadiumExpenseReport;

import { logger } from '../../utils/logger';
import { useState, useEffect } from 'react';
import { useAccounting } from '../../context/AccountingContext';
import { supabase } from '../../supabaseClient';
import { History, Printer, Download, Loader2 } from 'lucide-react';
import * as XLSX from 'xlsx';
import { fetchAllCustomerBalances, fetchCompleteDataset } from '../../services/balanceService';

const CustomerAgingReport = () => {
  const { currentUser } = useAccounting();
  const [loading, setLoading] = useState(true);
  const [reportData, setReportData] = useState<any[]>([]);

  useEffect(() => {
    fetchReport();
  }, []);

  const fetchReport = async () => {
    setLoading(true);
    if (currentUser?.role === 'demo') {
        setReportData([
            { id: 'd1', name: 'شركة الأفق للتجارة', balance: 45000, range0_30: 15000, range31_60: 10000, range61_90: 5000, range90_plus: 15000 },
            { id: 'd2', name: 'مؤسسة النور', balance: 12500, range0_30: 12500, range31_60: 0, range61_90: 0, range90_plus: 0 },
            { id: 'd3', name: 'سوبر ماركت البركة', balance: 8200, range0_30: 2000, range31_60: 6200, range61_90: 0, range90_plus: 0 }
        ]);
        setLoading(false);
        return;
    }

    try {
      const { data: { user } } = await supabase.auth.getUser();
      const userOrgId = user?.user_metadata?.org_id;

      if (!userOrgId) {
        setLoading(false);
        return;
      }

      const filter = { organization_id: userOrgId };

      // جلب العملاء، الأرصدة المعتمدة، والفواتير والمستخلصات لحساب التوزيع الزمني
      const [
        customers,
        balancesMap,
        invoicesRes,
        projectsRes,
        billingsRes,
        ordersRes
      ] = await Promise.all([
        fetchCompleteDataset<any>(async (from, to) =>
          supabase.from('customers').select('id, name, phone, opening_balance').match(filter).is('deleted_at', null).range(from, to)
        ),
        fetchAllCustomerBalances(userOrgId),
        fetchCompleteDataset<any>(async (from, to) =>
          supabase.from('invoices').select('id, customer_id, invoice_number, invoice_date, total_amount, paid_amount').match(filter).neq('status', 'draft').neq('status', 'cancelled').order('invoice_date', { ascending: false }).range(from, to)
        ),
        fetchCompleteDataset<any>(async (from, to) =>
          supabase.from('projects').select('id, customer_id, name').match(filter).range(from, to)
        ),
        fetchCompleteDataset<any>(async (from, to) =>
          supabase.from('project_progress_billings').select('id, project_id, billing_number, billing_date, net_amount').match(filter).neq('status', 'draft').neq('status', 'cancelled').order('billing_date', { ascending: false }).range(from, to)
        ),
        fetchCompleteDataset<any>(async (from, to) =>
          supabase.from('orders').select('id, customer_id, grand_total, created_at, status').match(filter).neq('status', 'CANCELLED').range(from, to)
        )
      ]);

      if (!customers || customers.length === 0) {
        setReportData([]);
        setLoading(false);
        return;
      }

      // خريطة المشاريع -> العميل
      const projectToCustomer = new Map<string, string>();
      projectsRes?.forEach(p => { if (p.id && p.customer_id) projectToCustomer.set(p.id, p.customer_id); });

      const today = new Date();

      const agingData = customers.map(customer => {
        // 🛡️ الاعتماد على محرك الأرصدة الموحد لضمان التطابق 100% مع شاشة إدارة العملاء والأستاذ العام
        const canonicalBalance = balancesMap.get(customer.id);

        // استبعاد العملاء الخالصين (0) أو أصحاب الأرصدة الدائنة (الدفعات المقدمة لا تدخل في أعمار الديون)
        if (canonicalBalance === undefined || canonicalBalance <= 0.01) {
          return null;
        }

        const netBalance = canonicalBalance;

        interface DebitItem {
          amount: number;
          ageDays: number;
        }

        const debitItems: DebitItem[] = [];

        // 1. الفواتير التجارية
        const custInvs = invoicesRes?.filter(i => i.customer_id === customer.id) || [];
        custInvs.forEach(inv => {
          const amt = Number(inv.total_amount || 0);
          if (amt > 0) {
            const invDate = new Date(inv.invoice_date || today);
            const diffDays = Math.ceil(Math.abs(today.getTime() - invDate.getTime()) / (1000 * 60 * 60 * 24));
            debitItems.push({ amount: amt, ageDays: diffDays });
          }
        });

        // 2. مستخلصات المقاولات
        billingsRes?.forEach(pb => {
          const custId = projectToCustomer.get(pb.project_id);
          if (custId === customer.id) {
            const amt = Number(pb.net_amount || 0);
            if (amt > 0) {
              const bDate = new Date(pb.billing_date || today);
              const diffDays = Math.ceil(Math.abs(today.getTime() - bDate.getTime()) / (1000 * 60 * 60 * 24));
              debitItems.push({ amount: amt, ageDays: diffDays });
            }
          }
        });

        // 3. طلبات المطاعم والمبيعات الفورية
        const custOrders = ordersRes?.filter(o => o.customer_id === customer.id) || [];
        custOrders.forEach(ord => {
          const amt = Number(ord.grand_total || 0);
          if (amt > 0) {
            const ordDate = new Date(ord.created_at || today);
            const diffDays = Math.ceil(Math.abs(today.getTime() - ordDate.getTime()) / (1000 * 60 * 60 * 24));
            debitItems.push({ amount: amt, ageDays: diffDays });
          }
        });

        // ترتيب بنود الاستحقاق من الأحدث للأقدم لتوزيع الرصيد المتبقي (FIFO)
        debitItems.sort((a, b) => a.ageDays - b.ageDays);

        let range0_30 = 0;
        let range31_60 = 0;
        let range61_90 = 0;
        let range90_plus = 0;

        let remainingToAllocate = netBalance;

        // توزيع الرصيد المعتمد على الفترات الزمنية (FIFO)
        for (const item of debitItems) {
          if (remainingToAllocate <= 0) break;

          const amountFromThisItem = Math.min(item.amount, remainingToAllocate);

          if (item.ageDays <= 30) range0_30 += amountFromThisItem;
          else if (item.ageDays <= 60) range31_60 += amountFromThisItem;
          else if (item.ageDays <= 90) range61_90 += amountFromThisItem;
          else range90_plus += amountFromThisItem;

          remainingToAllocate -= amountFromThisItem;
        }

        // أي رصيد متبقي (رصيد افتتاحي أو مديونيات قديمة) يوضع في أقدم فترة (+90 يوم)
        if (remainingToAllocate > 0) {
          range90_plus += remainingToAllocate;
          remainingToAllocate = 0;
        }

        // ضمان ألا يبقى أي صف برصيد موجب وجميع فتراته أصفار
        if ((range0_30 + range31_60 + range61_90 + range90_plus) === 0) {
          range90_plus = netBalance;
        }

        // تقريب الفترات وضمان انضباط المجموع بدقة السنتات
        range0_30 = Math.round(range0_30 * 100) / 100;
        range31_60 = Math.round(range31_60 * 100) / 100;
        range61_90 = Math.round(range61_90 * 100) / 100;
        range90_plus = Math.round((netBalance - range0_30 - range31_60 - range61_90) * 100) / 100;

        return {
          id: customer.id,
          name: customer.name,
          balance: netBalance,
          range0_30,
          range31_60,
          range61_90,
          range90_plus
        };
      })
      .filter((c): c is NonNullable<typeof c> => c !== null && c.balance > 0.01)
      .sort((a, b) => b.balance - a.balance);

      setReportData(agingData);
    } catch (error) {
      logger.error("Error fetching aging report:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleExportExcel = () => {
    const data = [
      ['تقرير أعمار ديون العملاء'],
      ['تاريخ التقرير:', new Date().toLocaleDateString('ar-EG')],
      [],
      ['العميل', 'إجمالي الرصيد', '0-30 يوم', '31-60 يوم', '61-90 يوم', '+90 يوم'],
      ...reportData.map(item => [
        item.name,
        item.balance,
        item.range0_30,
        item.range31_60,
        item.range61_90,
        item.range90_plus
      ])
    ];
    const ws = XLSX.utils.aoa_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Customer Aging");
    XLSX.writeFile(wb, `Customer_Aging_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  return (
    <div className="space-y-6 animate-in fade-in">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
            <History className="text-blue-600" /> أعمار ديون العملاء
          </h2>
          <p className="text-slate-500">تحليل المديونيات المستحقة حسب فترات التأخير</p>
        </div>
        <div className="flex gap-2">
            <button onClick={handleExportExcel} className="flex items-center gap-2 bg-emerald-600 text-white px-4 py-2 rounded-lg hover:bg-emerald-700 font-bold text-sm shadow-sm">
                <Download size={16} /> تصدير Excel
            </button>
            <button onClick={() => window.print()} className="flex items-center gap-2 bg-slate-800 text-white px-4 py-2 rounded-lg hover:bg-slate-700 font-bold text-sm shadow-sm">
                <Printer size={16} /> طباعة
            </button>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <table className="w-full text-right">
          <thead className="bg-slate-50 text-slate-600 font-bold text-sm border-b border-slate-200">
            <tr>
              <th className="p-4">العميل</th>
              <th className="p-4 text-center">إجمالي الرصيد</th>
              <th className="p-4 text-center text-emerald-600">0-30 يوم</th>
              <th className="p-4 text-center text-blue-600">31-60 يوم</th>
              <th className="p-4 text-center text-amber-600">61-90 يوم</th>
              <th className="p-4 text-center text-red-600">+90 يوم</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading ? (
               <tr><td colSpan={6} className="p-8 text-center"><Loader2 className="animate-spin mx-auto text-blue-600" /></td></tr>
            ) : reportData.length === 0 ? (
               <tr><td colSpan={6} className="p-8 text-center text-slate-400">لا توجد ديون مستحقة.</td></tr>
            ) : (
              reportData.map((item) => (
                <tr key={item.id} className="hover:bg-slate-50">
                  <td className="p-4 font-bold text-slate-800">{item.name}</td>
                  <td className="p-4 text-center font-black text-slate-900">{item.balance.toLocaleString()}</td>
                  <td className="p-4 text-center font-mono text-emerald-600 bg-emerald-50/30">{item.range0_30.toLocaleString()}</td>
                  <td className="p-4 text-center font-mono text-blue-600 bg-blue-50/30">{item.range31_60.toLocaleString()}</td>
                  <td className="p-4 text-center font-mono text-amber-600 bg-amber-50/30">{item.range61_90.toLocaleString()}</td>
                  <td className="p-4 text-center font-mono text-red-600 bg-red-50/30 font-bold">{item.range90_plus.toLocaleString()}</td>
                </tr>
              ))
            )}
          </tbody>
          <tfoot className="bg-slate-100 font-bold text-slate-800 border-t-2 border-slate-300">
            <tr>
                <td className="p-4">الإجمالي الكلي</td>
                <td className="p-4 text-center">{reportData.reduce((s, i) => s + i.balance, 0).toLocaleString()}</td>
                <td className="p-4 text-center text-emerald-700">{reportData.reduce((s, i) => s + i.range0_30, 0).toLocaleString()}</td>
                <td className="p-4 text-center text-blue-700">{reportData.reduce((s, i) => s + i.range31_60, 0).toLocaleString()}</td>
                <td className="p-4 text-center text-amber-700">{reportData.reduce((s, i) => s + i.range61_90, 0).toLocaleString()}</td>
                <td className="p-4 text-center text-red-700">{reportData.reduce((s, i) => s + i.range90_plus, 0).toLocaleString()}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
};

export default CustomerAgingReport;
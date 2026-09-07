import { useState, useEffect } from 'react';
import { useAccounting } from '../../context/AccountingContext';
import { supabase } from '../../supabaseClient';
import { History, Printer, Download, Loader2 } from 'lucide-react';
import * as XLSX from 'xlsx';

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

      // المحرك الشامل المباشر في المتصفح مطابقاً 100% لكشف الحساب والأستاذ العام
      const { fetchCompleteDataset } = await import('../../services/balanceService');
      const { SubledgerRegistry } = await import('../../services/subledgerRegistry');
      const filter = { organization_id: userOrgId };

      // جلب العملاء
      const { data: customers } = await supabase
        .from('customers')
        .select('id, name, phone, opening_balance')
        .match(filter)
        .is('deleted_at', null);

      if (!customers || customers.length === 0) {
        setReportData([]);
        setLoading(false);
        return;
      }

      // حساب مراقبة العملاء (Accounts Receivable): كود 1221 حصراً وما يتفرع منه (1221%) بدون حسابات أوراق القبض 1222
      const { data: customerAccounts } = await supabase
        .from('accounts')
        .select('id, code, name')
        .match(filter)
        .or('code.eq.1221,code.ilike.1221%')
        .limit(10);

      let arAccountIds = (customerAccounts || []).map(a => a.id);

      // احتياطي: إذا لم يوجد كود 1221، البحث بالاسم مع استبعاد أوراق القبض 1222
      if (arAccountIds.length === 0) {
        const { data: fallbackAccounts } = await supabase
          .from('accounts')
          .select('id, code, name')
          .match(filter)
          .or('name.ilike.%العملاء%,name.ilike.%عملاء%')
          .not('name', 'ilike', '%أوراق%')
          .not('name', 'ilike', '%اوراق%')
          .not('code', 'ilike', '1222%')
          .neq('code', '122')
          .limit(10);
        arAccountIds = (fallbackAccounts || []).map(a => a.id);
      }

      // جلب الفواتير والمستندات والقيود
      const [
        invoicesRes,
        projectsRes,
        billingsRes,
        receiptsRes,
        returnsRes,
        creditNotesRes,
        chequesRes,
        ordersRes,
        journalEntriesRes,
        modularCustomerDocs
      ] = await Promise.all([
        fetchCompleteDataset(async (from, to) =>
          supabase.from('invoices').select('id, customer_id, invoice_number, invoice_date, total_amount, paid_amount, related_journal_entry_id').match(filter).neq('status', 'draft').neq('status', 'cancelled').range(from, to)
        ),
        fetchCompleteDataset(async (from, to) =>
          supabase.from('projects').select('id, customer_id, name').match(filter).range(from, to)
        ),
        fetchCompleteDataset(async (from, to) =>
          supabase.from('project_progress_billings').select('id, project_id, billing_number, billing_date, net_amount, related_journal_entry_id').match(filter).neq('status', 'draft').neq('status', 'cancelled').range(from, to)
        ),
        fetchCompleteDataset(async (from, to) =>
          supabase.from('receipt_vouchers').select('id, customer_id, related_journal_entry_id, amount').match(filter).not('related_journal_entry_id', 'is', null).range(from, to)
        ),
        fetchCompleteDataset(async (from, to) =>
          supabase.from('sales_returns').select('id, customer_id, related_journal_entry_id, total_amount').match(filter).not('related_journal_entry_id', 'is', null).range(from, to)
        ),
        fetchCompleteDataset(async (from, to) =>
          supabase.from('credit_notes').select('id, customer_id, related_journal_entry_id, total_amount').match(filter).not('related_journal_entry_id', 'is', null).range(from, to)
        ),
        fetchCompleteDataset(async (from, to) =>
          supabase.from('cheques').select('id, party_id, party_name, related_journal_entry_id, amount').match(filter).not('related_journal_entry_id', 'is', null).range(from, to)
        ),
        fetchCompleteDataset(async (from, to) =>
          supabase.from('orders').select('id, customer_id, grand_total, created_at, related_journal_entry_id, status').match(filter).range(from, to)
        ),
        fetchCompleteDataset(async (from, to) =>
          supabase.from('journal_entries').select('id, description, reference, related_document_type, related_document_id').match(filter).neq('status', 'cancelled').range(from, to)
        ),
        SubledgerRegistry.fetchCustomerDocs(userOrgId).catch(() => [])
      ]);

      // خريطة المشاريع -> العميل
      const projectToCustomer = new Map<string, string>();
      projectsRes?.forEach(p => { if (p.id && p.customer_id) projectToCustomer.set(p.id, p.customer_id); });

      // خريطة قيد اليومية -> العميل (مطابق لكشف الحساب 100%)
      const entryToCustomer = new Map<string, string>();
      invoicesRes?.forEach(i => { if (i.related_journal_entry_id && i.customer_id) entryToCustomer.set(i.related_journal_entry_id, i.customer_id); });
      billingsRes?.forEach(pb => {
        const cId = projectToCustomer.get(pb.project_id);
        if (pb.related_journal_entry_id && cId) entryToCustomer.set(pb.related_journal_entry_id, cId);
      });
      receiptsRes?.forEach(r => { if (r.related_journal_entry_id && r.customer_id) entryToCustomer.set(r.related_journal_entry_id, r.customer_id); });
      returnsRes?.forEach(r => { if (r.related_journal_entry_id && r.customer_id) entryToCustomer.set(r.related_journal_entry_id, r.customer_id); });
      creditNotesRes?.forEach(c => { if (c.related_journal_entry_id && c.customer_id) entryToCustomer.set(c.related_journal_entry_id, c.customer_id); });
      ordersRes?.forEach(o => { if (o.related_journal_entry_id && o.customer_id) entryToCustomer.set(o.related_journal_entry_id, o.customer_id); });

      // الشيكات (ربط بمعرف الطرف أو اسمه)
      chequesRes?.forEach(ch => {
        if (ch.related_journal_entry_id) {
          if (ch.party_id) {
            entryToCustomer.set(ch.related_journal_entry_id, ch.party_id);
          }
          if (ch.party_name) {
            const pName = ch.party_name.trim().toLowerCase();
            const matched = customers.find(c => {
              const cName = (c.name || '').trim().toLowerCase();
              return cName && (pName.includes(cName) || cName.includes(pName));
            });
            if (matched) entryToCustomer.set(ch.related_journal_entry_id, matched.id);
          }
        }
      });

      // مستندات المديولات المتقدمة
      modularCustomerDocs?.forEach(doc => {
        let cId = doc.customerId;
        if (!cId && doc.customerName) {
          const docName = doc.customerName.trim().toLowerCase();
          const matched = customers.find(c => (c.name || '').trim().toLowerCase() === docName);
          if (matched) cId = matched.id;
        }
        if (doc.journalEntryId && cId) {
          entryToCustomer.set(doc.journalEntryId, cId);
        }
      });

      // جلب معرفات القيود الخاصة بكل عميل من المديولات (المقاولات والمستشفيات) بمطابقة كشف الحساب
      await Promise.all(
        customers.map(async (c) => {
          try {
            const entryIds = await SubledgerRegistry.fetchStatementCustomerEntryIds(userOrgId, c.id, c.name);
            entryIds?.forEach(eid => {
              if (eid) entryToCustomer.set(eid, c.id);
            });
          } catch {}
        })
      );

      // القيود اليومية والتسويات اليدوية باسم أو معرف العميل
      journalEntriesRes?.forEach((je: any) => {
        const desc = (je.description || '').toLowerCase();
        const ref = (je.reference || '').toLowerCase();
        const docId = je.related_document_id;
        customers.forEach(c => {
          const cName = (c.name || '').trim().toLowerCase();
          const isMatch = (docId && docId === c.id) ||
                          (cName && cName.length > 1 && (desc.includes(cName) || ref.includes(cName))) ||
                          (ref && ref.includes(c.id.toLowerCase())) ||
                          (ref && ref.includes(`op-cust-${c.id.toLowerCase()}`)) ||
                          (ref && ref.includes(`ob-${c.id.toLowerCase()}`));
          if (isMatch && !entryToCustomer.has(je.id)) {
            entryToCustomer.set(je.id, c.id);
          }
        });
      });

      // جلب سطور الأستاذ العام لحسابات العملاء بدون تجاوز سقف PostgREST (دفعات 300)
      const allEntryIds = Array.from(entryToCustomer.keys());
      const customerMovements = new Map<string, number>();

      if (allEntryIds.length > 0 && arAccountIds.length > 0) {
        for (let i = 0; i < allEntryIds.length; i += 300) {
          const chunk = allEntryIds.slice(i, i + 300);
          const { data: lines, error: linesErr } = await supabase
            .from('journal_lines')
            .select('journal_entry_id, debit, credit')
            .in('journal_entry_id', chunk)
            .in('account_id', arAccountIds);

          if (!linesErr && lines) {
            lines.forEach(line => {
              const custId = entryToCustomer.get(line.journal_entry_id);
              if (custId) {
                const current = customerMovements.get(custId) || 0;
                customerMovements.set(custId, current + (Number(line.debit || 0) - Number(line.credit || 0)));
              }
            });
          }
        }
      }

      // التحقق من وجود قيد افتتاحي
      const customersWithOpeningEntry = new Set<string>();
      journalEntriesRes?.forEach((je: any) => {
        const desc = (je.description || '').toLowerCase();
        const ref = (je.reference || '').toLowerCase();
        const isOpening = je.related_document_type === 'opening_balance' || ref.startsWith('op-cust-') || ref.startsWith('ob-') || desc.includes('رصيد افتتاحي');
        if (isOpening) {
          customers.forEach(c => {
            const cName = (c.name || '').trim().toLowerCase();
            if ((cName && desc.includes(cName)) || ref.includes(c.id.toLowerCase())) {
              customersWithOpeningEntry.add(c.id);
            }
          });
        }
      });

      // طلبات المطاعم غير المرحلة
      const unpostedOrders = new Map<string, number>();
      ordersRes?.forEach(ord => {
        if (!ord.related_journal_entry_id && ord.status !== 'CANCELLED' && ord.customer_id) {
          const cur = unpostedOrders.get(ord.customer_id) || 0;
          unpostedOrders.set(ord.customer_id, cur + Number(ord.grand_total || 0));
        }
      });

      // توزيع المديونية وحساب الأعمار الزمنية
      const today = new Date();
      const agingData = customers.map(customer => {
        const initialBal = customersWithOpeningEntry.has(customer.id) ? 0 : Number(customer.opening_balance || 0);
        const hasLedgerRecord = customerMovements.has(customer.id) || customersWithOpeningEntry.has(customer.id);
        const ledgerMovement = customerMovements.get(customer.id) || 0;
        const unposted = unpostedOrders.get(customer.id) || 0;

        let raw0_30 = 0;
        let raw31_60 = 0;
        let raw61_90 = 0;
        let raw90_plus = 0;

        // الفواتير التجارية
        const custInvs = invoicesRes?.filter(i => i.customer_id === customer.id) || [];
        custInvs.forEach(inv => {
          const amt = Number(inv.total_amount || 0);
          if (amt <= 0) return;
          const invDate = new Date(inv.invoice_date || today);
          const diffDays = Math.ceil(Math.abs(today.getTime() - invDate.getTime()) / (1000 * 60 * 60 * 24));
          if (diffDays <= 30) raw0_30 += amt;
          else if (diffDays <= 60) raw31_60 += amt;
          else if (diffDays <= 90) raw61_90 += amt;
          else raw90_plus += amt;
        });

        // مستخلصات المقاولات
        billingsRes?.forEach(pb => {
          const custId = projectToCustomer.get(pb.project_id);
          if (custId === customer.id) {
            const amt = Number(pb.net_amount || 0);
            if (amt <= 0) return;
            const bDate = new Date(pb.billing_date || today);
            const diffDays = Math.ceil(Math.abs(today.getTime() - bDate.getTime()) / (1000 * 60 * 60 * 24));
            if (diffDays <= 30) raw0_30 += amt;
            else if (diffDays <= 60) raw31_60 += amt;
            else if (diffDays <= 90) raw61_90 += amt;
            else raw90_plus += amt;
          }
        });

        if (unposted > 0) raw0_30 += unposted;

        // الرصيد الافتتاحي يوضع في أقدم فترة (+90 يوم)
        const rawOpening = Number(customer.opening_balance || 0);
        raw90_plus += rawOpening;

        // حساب الرصيد الحقيقي المعتمد (المطابق لكشف الحساب والأستاذ العام 100%)
        let trueBalance = 0;
        if (hasLedgerRecord) {
          trueBalance = Math.round((initialBal + ledgerMovement + unposted) * 100) / 100;
        } else {
          // حساب احتياطي في حال عدم وجود أي قيود مسجلة
          const recs = receiptsRes?.filter(r => r.customer_id === customer.id).reduce((s, r) => s + Number(r.amount || 0), 0) || 0;
          const rets = returnsRes?.filter(r => r.customer_id === customer.id).reduce((s, r) => s + Number(r.total_amount || 0), 0) || 0;
          const cns = creditNotesRes?.filter(c => c.customer_id === customer.id).reduce((s, c) => s + Number(c.total_amount || 0), 0) || 0;
          const chqs = chequesRes?.filter(c => c.party_id === customer.id).reduce((s, c) => s + Number(c.amount || 0), 0) || 0;
          const totalGross = raw0_30 + raw31_60 + raw61_90 + raw90_plus;
          trueBalance = Math.max(0, Math.round((totalGross - recs - rets - cns - chqs) * 100) / 100);
        }

        const totalGross = raw0_30 + raw31_60 + raw61_90 + raw90_plus;
        let range0_30 = 0;
        let range31_60 = 0;
        let range61_90 = 0;
        let range90_plus = 0;

        if (totalGross > 0 && trueBalance > 0) {
          const ratio = Math.min(1, Math.max(0, trueBalance / totalGross));
          range0_30 = Math.round(raw0_30 * ratio * 100) / 100;
          range31_60 = Math.round(raw31_60 * ratio * 100) / 100;
          range61_90 = Math.round(raw61_90 * ratio * 100) / 100;
          range90_plus = Math.max(0, Math.round((trueBalance - range0_30 - range31_60 - range61_90) * 100) / 100);
        } else if (trueBalance > 0) {
          range90_plus = trueBalance;
        }

        return {
          id: customer.id,
          name: customer.name,
          balance: trueBalance,
          range0_30,
          range31_60,
          range61_90,
          range90_plus
        };
      }).filter(c => c.balance > 0.01).sort((a, b) => b.balance - a.balance);

      setReportData(agingData);
    } catch (error) {
      console.error("Error fetching aging report:", error);
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
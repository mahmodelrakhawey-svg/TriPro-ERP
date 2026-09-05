import { useState, useEffect } from 'react';
import { useAccounting } from '../../context/AccountingContext';
import { supabase } from '../../supabaseClient';
import { History, Printer, Download, Loader2 } from 'lucide-react';
import * as XLSX from 'xlsx';

const SupplierAgingReport = () => {
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
            { id: 'd1', name: 'شركة التوريدات العالمية', balance: 65000, range0_30: 25000, range31_60: 20000, range61_90: 20000, range90_plus: 0 },
            { id: 'd2', name: 'مصنع الجودة', balance: 15000, range0_30: 15000, range31_60: 0, range61_90: 0, range90_plus: 0 }
        ]);
        setLoading(false);
        return;
    }

    try {
      const { data: { user } } = await supabase.auth.getUser();
      const userOrgId = user?.user_metadata?.org_id;

      if (!userOrgId) return;

      // 🚀 جلب أعمار ديون الموردين المباشرة من محرك قاعدة البيانات
      const { fetchSupplierAgingLedger } = await import('../../services/balanceService');
      const dbRows = await fetchSupplierAgingLedger(userOrgId);
      if (dbRows && dbRows.length > 0) {
        const agingData = dbRows.map(r => {
          let range0_30 = Number(r.range_0_30 || 0);
          let range31_60 = Number(r.range_31_60 || 0);
          let range61_90 = Number(r.range_61_90 || 0);
          let range90_plus = Number(r.range_90_plus || 0);
          const balance = Number(r.total_balance || 0);

          if (balance > 0.01 && (range0_30 + range31_60 + range61_90 + range90_plus) === 0) {
            range90_plus = balance;
          }

          return {
            id: r.party_id,
            name: r.party_name,
            balance,
            range0_30,
            range31_60,
            range61_90,
            range90_plus
          };
        }).filter(s => s.balance > 0.01).sort((a, b) => b.balance - a.balance);
        setReportData(agingData);
        setLoading(false);
        return;
      }

      const filter = { organization_id: userOrgId };

      // 1. جلب الموردين (احتياطي Fallback)
      const { data: suppliers } = await supabase.from('suppliers').select('id, name, opening_balance').match(filter).is('deleted_at', null);
      
      // 2. جلب الفواتير المرحلة والمدفوعة (مرتبة من الأحدث للأقدم لتطبيق FIFO)
      const { data: invoices } = await supabase
        .from('purchase_invoices')
        .select('id, supplier_id, invoice_number, invoice_date, total_amount, paid_amount')
        .eq('organization_id', userOrgId)
        .neq('status', 'draft')
        .order('invoice_date', { ascending: false });

      // 3. جلب كافة المدفوعات والخصومات لحساب الرصيد الفعلي
      const { data: payments } = await supabase.from('payment_vouchers').select('supplier_id, amount, notes').match(filter).not('supplier_id', 'is', null);
      const { data: returns } = await supabase.from('purchase_returns').select('supplier_id, total_amount').match(filter).neq('status', 'draft');
      const { data: debitNotes } = await supabase.from('debit_notes').select('supplier_id, total_amount').match(filter).eq('status', 'posted');
      const { data: cheques } = await supabase.from('cheques')
            .select('party_id, amount')
            .match(filter)
            .eq('type', 'outgoing')
            .neq('status', 'rejected');
      
      const { data: rebates } = await supabase.from('vendor_rebate_settlements')
            .select('vendor_id, total_claim_amount')
            .match(filter)
            .in('status', ['APPROVED', 'SETTLED']);
      
      // 4. جلب مقاولي الباطن ومستخلصاتهم
      const { data: subs } = await supabase.from('subcontractors').select('id, name, supplier_id').match(filter);
      const { data: contracts } = await supabase.from('subcontractor_contracts').select('id, subcontractor_id').match(filter);
      const { data: subBillings } = await supabase.from('subcontractor_billings').select('contract_id, net_amount, billing_date').match(filter).neq('status', 'draft').order('billing_date', { ascending: false });

      if (!suppliers || !invoices) return;

      const subContractMap = new Map<string, string>();
      contracts?.forEach(c => subContractMap.set(c.id, c.subcontractor_id));

      const today = new Date();
      
      const agingData = suppliers.map(supplier => {
        const opening = Number(supplier.opening_balance || 0);

        // 1. تحديد فواتير هذا المورد (مع خصم السداد الفوري على الفاتورة)
        const supplierInvoices = invoices.filter(inv => inv.supplier_id === supplier.id);

        // 2. تحديد مقاولي الباطن المرتبطين بهذا المورد
        const sName = (supplier.name || '').trim().toLowerCase();
        const matchedSubIds = new Set<string>();
        subs?.forEach(sub => {
            const subName = (sub.name || '').trim().toLowerCase();
            if ((sub as any).supplier_id === supplier.id || sub.id === supplier.id || (subName && (sName === subName || sName.includes(subName) || subName.includes(sName)))) {
                matchedSubIds.add(sub.id);
            }
        });

        // 3. بنود الاستحقاق (فواتير + مستخلصات مقاولي الباطن) مع العمر الزمني
        interface DebitItem {
            amount: number;
            date: string;
            ageDays: number;
        }

        const debitItems: DebitItem[] = [];

        supplierInvoices.forEach(inv => {
            const pvPaidForThisInvoice = payments?.filter(p => p.supplier_id === supplier.id && p.notes && inv.invoice_number && p.notes.includes(inv.invoice_number)).reduce((s, p) => s + Number(p.amount || 0), 0) || 0;
            const immediatePaidAtCheckout = Math.max(0, Number(inv.paid_amount || 0) - pvPaidForThisInvoice);
            const netInvAmount = Math.max(0, Number(inv.total_amount || 0) - immediatePaidAtCheckout);
            if (netInvAmount > 0) {
                const invDate = new Date(inv.invoice_date || today);
                const diffTime = Math.abs(today.getTime() - invDate.getTime());
                const ageDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                debitItems.push({ amount: netInvAmount, date: inv.invoice_date, ageDays });
            }
        });

        subBillings?.forEach(sb => {
            const subId = subContractMap.get(sb.contract_id);
            if (subId && matchedSubIds.has(subId)) {
                const netAmount = Number(sb.net_amount || 0);
                if (netAmount > 0) {
                    const bDate = new Date(sb.billing_date || today);
                    const diffTime = Math.abs(today.getTime() - bDate.getTime());
                    const ageDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                    debitItems.push({ amount: netAmount, date: sb.billing_date, ageDays });
                }
            }
        });

        // ترتيب بنود الاستحقاق من الأحدث للأقدم لتوزيع الرصيد المتبقي (FIFO)
        debitItems.sort((a, b) => a.ageDays - b.ageDays);

        // 4. السدادات والتخفيضات (سندات صرف + مردودات + إشعارات خصم + شيكات صادرة + بونص/ريبايت)
        const suppPayments = payments?.filter(p => p.supplier_id === supplier.id).reduce((sum, p) => sum + Number(p.amount), 0) || 0;
        const suppReturns = returns?.filter(r => r.supplier_id === supplier.id).reduce((sum, r) => sum + Number(r.total_amount), 0) || 0;
        const suppDebitNotes = debitNotes?.filter(d => d.supplier_id === supplier.id).reduce((sum, d) => sum + Number(d.total_amount), 0) || 0;
        const suppCheques = cheques?.filter(c => c.party_id === supplier.id).reduce((sum, c) => sum + Number(c.amount), 0) || 0;
        const suppRebates = rebates?.filter(reb => reb.vendor_id === supplier.id).reduce((sum, reb) => sum + Number(reb.total_claim_amount), 0) || 0;

        const totalCredits = suppPayments + suppReturns + suppDebitNotes + suppCheques + suppRebates;
        
        // الرصيد المستحق الحالي
        const totalDebits = debitItems.reduce((sum, item) => sum + item.amount, 0);
        const grossPayable = opening + totalDebits;
        const netBalance = Math.max(0, grossPayable - totalCredits);

        let range0_30 = 0;
        let range31_60 = 0;
        let range61_90 = 0;
        let range90_plus = 0;

        // توزيع الرصيد على الفترات الزمنية (FIFO)
        if (netBalance > 0.01) {
            let remainingToAllocate = netBalance;

            // نمر على بنود الاستحقاق من الأحدث للأقدم
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
        }

        return {
          id: supplier.id,
          name: supplier.name,
          balance: netBalance,
          range0_30,
          range31_60,
          range61_90,
          range90_plus
        };
      }).filter(s => s.balance > 0.01).sort((a, b) => b.balance - a.balance);

      setReportData(agingData);
    } catch (error) {
      console.error("Error fetching supplier aging report:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleExportExcel = () => {
    const data = [
      ['تقرير أعمار ديون الموردين'],
      ['تاريخ التقرير:', new Date().toLocaleDateString('ar-EG')],
      [],
      ['المورد', 'إجمالي الرصيد', '0-30 يوم', '31-60 يوم', '61-90 يوم', '+90 يوم'],
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
    XLSX.utils.book_append_sheet(wb, ws, "Supplier Aging");
    XLSX.writeFile(wb, `Supplier_Aging_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  return (
    <div className="space-y-6 animate-in fade-in">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
            <History className="text-red-600" /> أعمار ديون الموردين
          </h2>
          <p className="text-slate-500">تحليل المستحقات للموردين حسب فترات التأخير</p>
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
              <th className="p-4">المورد</th>
              <th className="p-4 text-center">إجمالي الرصيد</th>
              <th className="p-4 text-center text-emerald-600">0-30 يوم</th>
              <th className="p-4 text-center text-blue-600">31-60 يوم</th>
              <th className="p-4 text-center text-amber-600">61-90 يوم</th>
              <th className="p-4 text-center text-red-600">+90 يوم</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading ? (
               <tr><td colSpan={6} className="p-8 text-center"><Loader2 className="animate-spin mx-auto text-red-600" /></td></tr>
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

export default SupplierAgingReport;
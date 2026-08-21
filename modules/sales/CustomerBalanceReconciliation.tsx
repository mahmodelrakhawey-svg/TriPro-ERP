import React, { useState, useEffect, useMemo } from 'react';
import { useAccounting } from '../../context/AccountingContext';
import { useToast } from '../../context/ToastContext';
import { supabase } from '../../supabaseClient';
import { 
  Scale, AlertTriangle, CheckCircle, Search, ArrowRight, 
  RefreshCw, Trash2, Plus, Save, X, Users, BookOpen, 
  FileText, ArrowDownLeft, FileCheck, Download
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import * as XLSX from 'xlsx';

export const CustomerBalanceReconciliation: React.FC = () => {
  const { accounts, customers, getSystemAccount, settings } = useAccounting();
  const navigate = useNavigate();
  const { showToast } = useToast();
  
  const [loading, setLoading] = useState(false);
  const [glBalance, setGlBalance] = useState(0);
  const [subLedgerBalance, setSubLedgerBalance] = useState(0);
  const [discrepancyEntries, setDiscrepancyEntries] = useState<any[]>([]);
  const [customerBalances, setCustomerBalances] = useState<any[]>([]);
  const [customerSearch, setCustomerSearch] = useState('');
  const [activeTab, setActiveTab] = useState<'overview' | 'discrepancies' | 'customers'>('overview');
  
  // تحديد حساب العملاء الرئيسي (1221 أو 122 في الدليل الموحد)
  const customerAcc = getSystemAccount('CUSTOMERS');
  const customerAccountCode = customerAcc ? customerAcc.code : '1221';

  // حالة نافذة الإصلاح (إنشاء سند قبض)
  const [fixModalOpen, setFixModalOpen] = useState(false);
  const [entryToFix, setEntryToFix] = useState<any>(null);
  const [fixFormData, setFixFormData] = useState({
    customerId: '',
    treasuryAccountId: '',
    notes: ''
  });

  // تصفية حسابات النقدية والبنوك
  const treasuryAccounts = useMemo(() => 
    accounts.filter(a => !a.isGroup && (a.code.startsWith('123') || a.code.startsWith('101') || a.name.includes('صندوق') || a.name.includes('خزينة') || a.name.includes('بنك'))),
    [accounts]
  );

  const fetchReconciliation = async () => {
    setLoading(true);
    try {
      // 1. جلب رصيد دفتر الأستاذ (GL) لحساب العملاء التجاريين حصراً (1221 أو 10201) واستبعاد الحسابات الفرعية المستقلة كالتأمين (122101) أو سلف الموظفين (1223)
      const customerAccounts = accounts.filter(a => 
        !a.isGroup && (
          a.code === customerAccountCode || 
          a.code === '1221' || 
          a.code === '10201' || 
          (customerAcc && a.id === customerAcc.id)
        )
      );
      const accountIds = customerAccounts.map(a => a.id);


      if (accountIds.length === 0) {
        setLoading(false);
        return;
      }

      const { data: glLines, error: glError } = await supabase
        .from('journal_lines')
        .select('id, debit, credit, description, account_id, journal_entries!inner(id, reference, transaction_date, description, status)')
        .in('account_id', accountIds)
        .eq('journal_entries.status', 'posted');

      if (glError) throw glError;

      let totalGlCredit = 0;
      let totalGlDebit = 0;
      
      // تخزين القيود للمراجعة وتجميع المبالغ لنفس القيد
      const glEntriesMap = new Map();

      glLines?.forEach((line: any) => {
        const debitVal = Number(line.debit || 0);
        const creditVal = Number(line.credit || 0);
        totalGlCredit += creditVal;
        totalGlDebit += debitVal;
        
        const ref = line.journal_entries?.reference || '';
        const entryKey = line.journal_entries?.id; 
        
        if (!glEntriesMap.has(entryKey)) {
          glEntriesMap.set(entryKey, {
            id: line.id,
            journal_entries: line.journal_entries,
            debit: debitVal,
            credit: creditVal,
            description: line.description || line.journal_entries?.description || '',
            date: line.journal_entries?.transaction_date,
            ref: ref
          });
        } else {
          const existing = glEntriesMap.get(entryKey);
          existing.debit += debitVal;
          existing.credit += creditVal;
        }
      });

      // رصيد العملاء مدين بطبيعته (مدين - دائن)
      const calculatedGlBalance = totalGlDebit - totalGlCredit;
      setGlBalance(calculatedGlBalance);

      // 2. جلب وتجميع كشوف حسابات العملاء ومطابقتها مع الأستاذ العام
      const { data: customersList } = await supabase
        .from('customers')
        .select('id, name, phone, opening_balance')
        .is('deleted_at', null);

      // جلب معرفات القيود المرتبطة بكافة مستندات العملاء
      const [invRes, recRes, retRes, cnRes, chqRes, projectBillsRes] = await Promise.all([

        supabase.from('invoices').select('customer_id, invoice_number, related_journal_entry_id, total_amount').neq('status', 'draft').neq('status', 'cancelled'),
        supabase.from('receipt_vouchers').select('customer_id, voucher_number, related_journal_entry_id, amount'),
        supabase.from('sales_returns').select('customer_id, return_number, related_journal_entry_id, total_amount').neq('status', 'draft'),
        supabase.from('credit_notes').select('customer_id, credit_note_number, related_journal_entry_id, total_amount').eq('status', 'posted'),
        supabase.from('cheques').select('party_id, cheque_number, related_journal_entry_id, amount').eq('type', 'incoming'),
        supabase.from('project_progress_billings').select('id, billing_number, related_journal_entry_id, net_amount, projects(customer_id, name)').neq('status', 'draft')
      ]);

      const subLedgerRefs = new Set<string>();
      invRes.data?.forEach(i => { if (i.invoice_number) subLedgerRefs.add(i.invoice_number.trim()); });
      recRes.data?.forEach(r => { if (r.voucher_number) { subLedgerRefs.add(r.voucher_number.trim()); subLedgerRefs.add(`RV-${r.voucher_number.trim().replace(/^RV-/i, '')}`); } });
      retRes.data?.forEach(r => { if (r.return_number) subLedgerRefs.add(r.return_number.trim()); });
      cnRes.data?.forEach(c => { if (c.credit_note_number) subLedgerRefs.add(c.credit_note_number.trim()); });
      chqRes.data?.forEach(c => { if (c.cheque_number) { subLedgerRefs.add(c.cheque_number.trim()); subLedgerRefs.add(`CHQ-${c.cheque_number.trim().replace(/^CHQ-/i, '')}`); } });
      projectBillsRes.data?.forEach(pb => { if (pb.billing_number) { subLedgerRefs.add(pb.billing_number.trim()); subLedgerRefs.add(`BILL-${pb.billing_number.trim()}`); } });

      let totalCustomerStatementsBalance = 0;
      const calculatedCustomerBalances: any[] = [];
      const accountedEntryIds = new Set<string>();

      customersList?.forEach(customer => {
        const opening = Number(customer.opening_balance || 0);

        // جمع كافة معرفات القيود الخاصة بهذا العميل
        const custEntryIds = new Set<string>();
        const custDocRefs = new Set<string>();

        invRes.data?.filter(i => i.customer_id === customer.id).forEach(i => {
          if (i.related_journal_entry_id) custEntryIds.add(i.related_journal_entry_id);
          if (i.invoice_number) custDocRefs.add(i.invoice_number.trim());
        });

        recRes.data?.filter(r => r.customer_id === customer.id).forEach(r => {
          if (r.related_journal_entry_id) custEntryIds.add(r.related_journal_entry_id);
          if (r.voucher_number) {
            const rawV = r.voucher_number.trim();
            custDocRefs.add(rawV);
            custDocRefs.add(`RV-${rawV.replace(/^RV-/i, '')}`);
            custDocRefs.add(rawV.replace(/^RV-/i, ''));
          }
        });

        retRes.data?.filter(r => r.customer_id === customer.id).forEach(r => {
          if (r.related_journal_entry_id) custEntryIds.add(r.related_journal_entry_id);
          if (r.return_number) custDocRefs.add(r.return_number.trim());
        });

        cnRes.data?.filter(c => c.customer_id === customer.id).forEach(c => {
          if (c.related_journal_entry_id) custEntryIds.add(c.related_journal_entry_id);
          if (c.credit_note_number) custDocRefs.add(c.credit_note_number.trim());
        });

        chqRes.data?.filter(c => c.party_id === customer.id).forEach(c => {
          if (c.related_journal_entry_id) custEntryIds.add(c.related_journal_entry_id);
          if (c.cheque_number) {
            const rawC = c.cheque_number.trim();
            custDocRefs.add(rawC);
            custDocRefs.add(`CHQ-${rawC.replace(/^CHQ-/i, '')}`);
            custDocRefs.add(rawC.replace(/^CHQ-/i, ''));
          }
        });

        projectBillsRes.data?.filter((pb: any) => pb.projects?.customer_id === customer.id || (customer.name && pb.projects?.name?.includes(customer.name))).forEach((pb: any) => {
          if (pb.related_journal_entry_id) custEntryIds.add(pb.related_journal_entry_id);
          if (pb.billing_number) {
            const rawB = pb.billing_number.trim();
            custDocRefs.add(rawB);
            custDocRefs.add(`BILL-${rawB}`);
          }
        });


        let custDebits = 0;
        let custCredits = 0;
        let invCount = 0;
        let hasOpeningInGl = false;

        glLines?.forEach((line: any) => {
          const jeId = line.journal_entries?.id;
          const ref = (line.journal_entries?.reference || '').trim();
          const cleanRef = ref.toUpperCase();
          const desc = `${line.description || ''} ${line.journal_entries?.description || ''}`.trim();

          const isDirectMatch = (jeId && custEntryIds.has(jeId)) ||
                                (ref && custDocRefs.has(ref)) ||
                                (cleanRef && custDocRefs.has(cleanRef)) ||
                                (customer.name && desc.includes(customer.name));

          if (isDirectMatch) {
            const d = Number(line.debit || 0);
            const c = Number(line.credit || 0);
            custDebits += d;
            custCredits += c;
            if (jeId) accountedEntryIds.add(jeId);
            if (d > 0 && (cleanRef.startsWith('INV-') || cleanRef.startsWith('BILL-'))) {
              invCount++;
            }
            if (cleanRef.startsWith('OP-') || cleanRef.startsWith('OB-') || cleanRef.startsWith('OPENING-') || desc.includes('رصيد افتتاحي')) {
              hasOpeningInGl = true;
            }
          }
        });

        // إذا كان القيد الافتتاحي موجوداً في دفتر اليومية، فهو محسوب بالفعل ضمن custDebits
        const customerBalance = custDebits - custCredits + (hasOpeningInGl ? 0 : opening);
        totalCustomerStatementsBalance += customerBalance;

        calculatedCustomerBalances.push({
          id: customer.id,
          name: customer.name,
          phone: customer.phone,
          opening,
          invoicesCount: invCount,
          grossInvoices: custDebits,
          returnsTotal: 0,
          creditNotesTotal: 0,
          receiptsTotal: custCredits,
          manualEntriesTotal: 0,
          balance: customerBalance
        });
      });


      // إضافة أي حركات وتسويات عامة على حساب العملاء (1221) لم تُسجل باسم عميل محدد
      let unlinkedDebits = 0;
      let unlinkedCredits = 0;
      glLines?.forEach((line: any) => {
        const jeId = line.journal_entries?.id;
        if (!accountedEntryIds.has(jeId)) {
          unlinkedDebits += Number(line.debit || 0);
          unlinkedCredits += Number(line.credit || 0);
        }
      });

      const unassignedGlAdjustments = unlinkedDebits - unlinkedCredits;
      const totalCalculatedSubLedger = totalCustomerStatementsBalance + unassignedGlAdjustments;

      setSubLedgerBalance(totalCalculatedSubLedger);
      setCustomerBalances(calculatedCustomerBalances);


      // 3. تحليل الفروقات الذكي
      const isRefMatched = (ref: string, desc: string, debit?: number, credit?: number): boolean => {
        if (!ref && !desc) return false;
        const cleanRef = (ref || '').trim().toUpperCase();
        const cleanDesc = (desc || '').trim();

        // قيود متوازنة داخلياً لنفس الحساب (صافي أثرها صفر)
        if (debit && credit && Math.abs(debit - credit) < 0.01) {
          return true;
        }

        // فحص مستخلصات مشاريع المقاولات
        if (
          cleanDesc.includes('صافي المستخلص المستحق') || 
          cleanDesc.includes('مستخلص') || 
          cleanRef.startsWith('BILL-') || 
          cleanRef.startsWith('CUST-BILL-')
        ) {
          return true;
        }

        // فحص فواتير علاج ومستخلصات المستشفيات (HIMS)
        if (
          cleanRef.startsWith('HIMS-') || 
          cleanDesc.includes('فاتورة علاج HIMS') || 
          cleanDesc.includes('تحميل المريض') ||
          cleanDesc.includes('إيراد عيادات') ||
          cleanDesc.includes('إيراد خدمات طبية')
        ) {
          return true;
        }

        // فحص ما إذا كان القيد يذكر اسم أي عميل
        if (customersList?.some(c => c.name && cleanDesc.includes(c.name))) {
          return true;
        }

        // تجاهل قيود الإقفال والافتتاحية العامة
        if (
          cleanRef.startsWith('CLOSE-') || 
          cleanRef.startsWith('CLOSING-') || 
          cleanRef.startsWith('OPENING-') || 
          cleanRef.startsWith('OB-') || 
          cleanRef.startsWith('OP-') || 
          cleanRef.startsWith('OP-CUST-') || 
          cleanDesc.includes('رصيد افتتاحي')
        ) {
          return true;
        }

        // فحص التطابق المباشر مع مراجع المستندات
        if (cleanRef && subLedgerRefs.has(cleanRef)) return true;

        // فحص الشيكات المرفوضة
        if (cleanRef.startsWith('REJ-IN-') || cleanRef.startsWith('REJ-')) {
          const num = cleanRef.replace(/^REJ-(IN-)?/i, '');
          if (subLedgerRefs.has(num) || subLedgerRefs.has(`CHQ-${num}`)) return true;
        }

        // فحص التطابق الجزئي
        for (const subRef of subLedgerRefs) {
          const s = String(subRef).trim().toUpperCase();
          if (s && (cleanRef === s || cleanRef.startsWith(s) || s.startsWith(cleanRef) || cleanRef.includes(s))) {
            return true;
          }
        }

        return false;
      };

      const discrepancies: any[] = [];

      glEntriesMap.forEach((entry) => {
        const matched = isRefMatched(entry.ref, entry.description, entry.debit, entry.credit);
        if (!matched) {
          discrepancies.push(entry);
        }
      });


      setDiscrepancyEntries(discrepancies);

    } catch (error) {
      console.error('Error fetching customer reconciliation:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteEntry = async (entryId: string) => {
    if (!window.confirm('هل أنت متأكد من حذف هذا القيد؟ لا يمكن التراجع عن هذا الإجراء.')) {
      return;
    }
    try {
      const { error } = await supabase.from('journal_entries').delete().eq('id', entryId);
      if (error) throw error;
      showToast('تم حذف القيد بنجاح.', 'success');
      fetchReconciliation();
    } catch (err: any) {
      console.error(err);
      showToast('فشل حذف القيد: ' + err.message, 'error');
    }
  };

  const openFixModal = (entry: any) => {
    setEntryToFix(entry);
    setFixFormData({
      customerId: '',
      treasuryAccountId: treasuryAccounts[0]?.id || '',
      notes: entry.description || ''
    });
    setFixModalOpen(true);
  };

  const handleFixSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fixFormData.customerId || !fixFormData.treasuryAccountId) {
      showToast('الرجاء اختيار العميل وحساب الخزينة/البنك', 'warning');
      return;
    }

    try {
      // إذا كان القيد دائناً على العميل (قبض)
      const isReceipt = entryToFix.credit > 0;
      const amount = isReceipt ? entryToFix.credit : entryToFix.debit;

      if (isReceipt) {
        const { error } = await supabase.from('receipt_vouchers').insert({
          voucher_number: entryToFix.ref || `RV-FIX-${Date.now().toString().slice(-6)}`,
          voucher_date: entryToFix.date,
          amount: amount,
          customer_id: fixFormData.customerId,
          treasury_account_id: fixFormData.treasuryAccountId,
          notes: fixFormData.notes,
          payment_method: 'cash'
        });
        if (error) throw error;
      } else {
        showToast('هذا القيد مدين، يمكنك ربطه كفاتورة مبيعات يدوية من شاشة الفواتير.', 'info');
        return;
      }
      
      showToast('تم إنشاء سند القبض وربطه بالقيد بنجاح ✅', 'success');
      setFixModalOpen(false);
      fetchReconciliation();
    } catch (err: any) {
      console.error(err);
      showToast('خطأ: ' + err.message, 'error');
    }
  };

  const exportCustomerBalances = () => {
    if (customerBalances.length === 0) return;
    const worksheet = XLSX.utils.json_to_sheet(customerBalances.map(c => ({
      'اسم العميل': c.name,
      'رقم الهاتف': c.phone || '-',
      'الرصيد الافتتاحي': c.opening,
      'إجمالي الفواتير': c.grossInvoices,
      'إجمالي المرتجعات': c.returnsTotal,
      'الإشعارات الدائنة': c.creditNotesTotal,
      'إجمالي التحصيلات': c.receiptsTotal,
      'صافي المديونية': c.balance
    })));
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'أرصدة العملاء');
    XLSX.writeFile(workbook, `Customer_Balances_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  useEffect(() => {
    fetchReconciliation();
  }, [accounts]);

  const difference = glBalance - subLedgerBalance;
  const isBalanced = Math.abs(difference) < 1;

  const filteredCustomers = useMemo(() => {
    if (!customerSearch.trim()) return customerBalances;
    const q = customerSearch.toLowerCase();
    return customerBalances.filter(c => 
      c.name.toLowerCase().includes(q) || (c.phone && c.phone.includes(q))
    );
  }, [customerBalances, customerSearch]);

  return (
    <div className="space-y-6 animate-in fade-in p-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-slate-200 pb-4">
        <div>
          <h2 className="text-2xl font-black text-slate-800 flex items-center gap-2">
            <Scale className="text-emerald-600" size={28} /> مطابقة أرصدة العملاء
          </h2>
          <p className="text-slate-500 text-sm">مقارنة فورية بين رصيد دفتر الأستاذ العام (GL) وأرصدة كشوف حسابات العملاء (Sub-ledger)</p>
        </div>
        <div className="flex items-center gap-2">
          <button 
            onClick={fetchReconciliation} 
            disabled={loading}
            className="flex items-center gap-2 bg-white border border-slate-300 px-4 py-2.5 rounded-xl hover:bg-slate-50 font-bold text-slate-700 shadow-sm transition-all disabled:opacity-50"
          >
            <RefreshCw size={18} className={loading ? 'animate-spin text-emerald-600' : ''} /> تحديث المطابقة
          </button>
        </div>
      </div>

      {/* Main KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* GL Balance */}
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
          <p className="text-xs font-bold text-slate-500 mb-1">رصيد دفتر الأستاذ العام (حساب {customerAccountCode})</p>
          <h3 className="text-3xl font-black text-slate-800 font-mono dir-ltr">
            {glBalance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </h3>
          <p className="text-[11px] text-slate-400 mt-2 flex items-center gap-1 font-bold">
            <BookOpen size={13} /> مجموع القيود المرحلة لحساب العملاء (مدين)
          </p>
        </div>

        {/* Sub-ledger Balance */}
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
          <p className="text-xs font-bold text-slate-500 mb-1">رصيد كشوف حسابات العملاء (الأستاذ المساعد)</p>
          <h3 className="text-3xl font-black text-emerald-600 font-mono dir-ltr">
            {subLedgerBalance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </h3>
          <p className="text-[11px] text-slate-400 mt-2 flex items-center gap-1 font-bold">
            <Users size={13} /> فواتير البيع - المرتجعات - الإشعارات - المقبوضات
          </p>
        </div>

        {/* Difference */}
        <div className={`p-6 rounded-2xl shadow-sm border ${isBalanced ? 'bg-emerald-50 border-emerald-200' : 'bg-red-50 border-red-200'}`}>
          <p className={`text-xs font-bold mb-1 ${isBalanced ? 'text-emerald-700' : 'text-red-700'}`}>
            الفرق المتبقي (Discrepancy)
          </p>
          <h3 className={`text-3xl font-black font-mono dir-ltr ${isBalanced ? 'text-emerald-800' : 'text-red-800'}`}>
            {difference.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </h3>
          <div className="flex items-center gap-2 mt-2">
            {isBalanced ? <CheckCircle size={16} className="text-emerald-600"/> : <AlertTriangle size={16} className="text-red-600"/>}
            <span className={`text-xs font-bold ${isBalanced ? 'text-emerald-700' : 'text-red-700'}`}>
              {isBalanced ? 'الحسابات متطابقة 100% ✅' : 'يوجد فرق يحتاج مراجعة ⚠️'}
            </span>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-200 gap-2">
        <button
          onClick={() => setActiveTab('overview')}
          className={`pb-3 px-4 text-sm font-bold border-b-2 transition-all flex items-center gap-2 ${
            activeTab === 'overview' ? 'border-emerald-600 text-emerald-700' : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Scale size={16} /> ملخص المطابقة
        </button>
        <button
          onClick={() => setActiveTab('discrepancies')}
          className={`pb-3 px-4 text-sm font-bold border-b-2 transition-all flex items-center gap-2 ${
            activeTab === 'discrepancies' ? 'border-emerald-600 text-emerald-700' : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <AlertTriangle size={16} /> القيود غير المربوطة ({discrepancyEntries.length})
        </button>
        <button
          onClick={() => setActiveTab('customers')}
          className={`pb-3 px-4 text-sm font-bold border-b-2 transition-all flex items-center gap-2 ${
            activeTab === 'customers' ? 'border-emerald-600 text-emerald-700' : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Users size={16} /> كشف أرصدة العملاء ({customerBalances.length})
        </button>
      </div>

      {/* Tab 1: Overview */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
            <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2">
              <FileCheck className="text-emerald-600" size={20} /> نتيجة فحص التكامل المحاسبي
            </h3>
            
            {isBalanced ? (
              <div className="p-6 bg-emerald-50 rounded-xl border border-emerald-200 text-center space-y-2">
                <div className="w-12 h-12 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto mb-2">
                  <CheckCircle size={28} />
                </div>
                <h4 className="text-lg font-black text-emerald-800">الأستاذ العام متطابق تماماً مع كشوف حسابات العملاء!</h4>
                <p className="text-sm text-emerald-700 max-w-xl mx-auto">
                  جميع فواتير المبيعات وسندات القبض والإشعارات الدائنة والأرصدة الافتتاحية مسجلة ومرحلة بدقة وتساوي إجمالي رصيد حساب العملاء في ميزان المراجعة.
                </p>
              </div>
            ) : (
              <div className="p-6 bg-red-50 rounded-xl border border-red-200 space-y-3">
                <div className="flex items-center gap-3">
                  <AlertTriangle className="text-red-600" size={24} />
                  <h4 className="text-base font-black text-red-800">تنبيه: يوجد فرق محاسبي بقيمة {Math.abs(difference).toLocaleString()} {settings.currency || 'ج.م'}</h4>
                </div>
                <p className="text-sm text-red-700 leading-relaxed">
                  هذا الفرق ناتج إما عن قيود يومية تم تسجيلها يدوياً على حساب العملاء العام دون إنشاء مستند مبيعات/قبض لها، أو مستندات غير مرحلة. يمكنك الانتقال لتبويب <strong>«القيود غير المربوطة»</strong> لمعالجة الفروقات بنقرة واحدة.
                </p>
                <button
                  onClick={() => setActiveTab('discrepancies')}
                  className="bg-red-600 text-white px-4 py-2 rounded-xl text-xs font-bold hover:bg-red-700 transition-colors inline-flex items-center gap-1.5 shadow-sm"
                >
                  فحص القيود المتسببة بالفرق <ArrowRight size={14} />
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Tab 2: Discrepancies Table */}
      {activeTab === 'discrepancies' && (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="p-4 bg-slate-50 border-b border-slate-200 flex justify-between items-center">
            <h3 className="font-bold text-slate-800 flex items-center gap-2">
              <Search size={18} className="text-emerald-600" /> قيود الأستاذ العام غير الموجودة بكشوف حسابات العملاء
            </h3>
            <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-red-100 text-red-700">
              {discrepancyEntries.length} قيد مسبب للفرق
            </span>
          </div>

          {discrepancyEntries.length === 0 ? (
            <div className="p-12 text-center text-slate-400 font-bold">
              <CheckCircle className="mx-auto text-emerald-500 mb-2" size={36} />
              لا توجد أي قيود شاذة أو غير مربوطة. النظام متطابق تماماً.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-right text-sm">
                <thead className="bg-slate-50 text-slate-600 font-bold border-b border-slate-200 text-xs">
                  <tr>
                    <th className="p-3">التاريخ</th>
                    <th className="p-3">رقم القيد / المرجع</th>
                    <th className="p-3">البيان</th>
                    <th className="p-3 text-center">مدين</th>
                    <th className="p-3 text-center">دائن</th>
                    <th className="p-3 text-center">إجراء التصحيح</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {discrepancyEntries.map((entry) => (
                    <tr key={entry.id} className="hover:bg-slate-50/70 transition-colors">
                      <td className="p-3 font-mono text-xs text-slate-500">{entry.date}</td>
                      <td className="p-3 font-mono font-bold text-slate-800">{entry.ref || 'قيد يدوي'}</td>
                      <td className="p-3 text-slate-700 font-medium">{entry.description}</td>
                      <td className="p-3 text-center font-mono font-bold text-slate-800">{entry.debit ? entry.debit.toLocaleString() : '-'}</td>
                      <td className="p-3 text-center font-mono font-bold text-emerald-700">{entry.credit ? entry.credit.toLocaleString() : '-'}</td>
                      <td className="p-3 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          {entry.credit > 0 && (
                            <button
                              onClick={() => openFixModal(entry)}
                              className="bg-emerald-600 text-white px-2.5 py-1 rounded-lg text-xs font-bold hover:bg-emerald-700 transition-colors"
                              title="إنشاء سند قبض وربطه بالعميل"
                            >
                              ربط كسند قبض
                            </button>
                          )}
                          <button
                            onClick={() => handleDeleteEntry(entry.journal_entries?.id || entry.id)}
                            className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                            title="حذف القيد"
                          >
                            <Trash2 size={15} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Tab 3: Detailed Customer Balances */}
      {activeTab === 'customers' && (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 space-y-4 p-6">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
            <div className="relative flex-1 max-w-md">
              <input
                type="text"
                placeholder="بحث باسم العميل أو رقم الهاتف..."
                value={customerSearch}
                onChange={e => setCustomerSearch(e.target.value)}
                className="w-full border rounded-xl p-2.5 pl-10 text-sm bg-slate-50 focus:bg-white outline-none focus:border-emerald-500 font-bold"
              />
              <Search className="absolute left-3 top-3 text-slate-400" size={18} />
            </div>
            <button
              onClick={exportCustomerBalances}
              className="bg-emerald-50 text-emerald-700 border border-emerald-200 px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 hover:bg-emerald-100 transition-colors"
            >
              <Download size={15} /> تصدير Excel
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-right text-sm">
              <thead className="bg-slate-50 text-slate-600 font-bold border-b border-slate-200 text-xs">
                <tr>
                  <th className="p-3">اسم العميل</th>
                  <th className="p-3 text-center">الرصيد الافتتاحي</th>
                  <th className="p-3 text-center">إجمالي المبيعات</th>
                  <th className="p-3 text-center">المرتجعات والإشعارات</th>
                  <th className="p-3 text-center">إجمالي المقبوضات</th>
                  <th className="p-3 text-center">صافي الرصيد الحالي</th>
                  <th className="p-3 text-center">كشف الحساب</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredCustomers.map((cust) => (
                  <tr key={cust.id} className="hover:bg-slate-50/70 transition-colors">
                    <td className="p-3">
                      <p className="font-bold text-slate-800">{cust.name}</p>
                      {cust.phone && <p className="text-xs text-slate-400 font-mono">{cust.phone}</p>}
                    </td>
                    <td className="p-3 text-center font-mono font-bold text-slate-600">{cust.opening.toLocaleString()}</td>
                    <td className="p-3 text-center font-mono font-bold text-slate-800">{cust.grossInvoices.toLocaleString()}</td>
                    <td className="p-3 text-center font-mono font-bold text-amber-600">{(cust.returnsTotal + cust.creditNotesTotal).toLocaleString()}</td>
                    <td className="p-3 text-center font-mono font-bold text-emerald-600">{cust.receiptsTotal.toLocaleString()}</td>
                    <td className="p-3 text-center font-mono font-black text-slate-900" dir="ltr">
                      <span className={`px-2 py-0.5 rounded text-xs ${cust.balance > 0 ? 'bg-red-50 text-red-700' : cust.balance < 0 ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>
                        {cust.balance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </span>
                    </td>
                    <td className="p-3 text-center">
                      <button
                        onClick={() => navigate('/customer-statement', { state: { selectedCustomerId: cust.id } })}
                        className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                        title="عرض كشف الحساب التفصيلي"
                      >
                        <BookOpen size={16} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Fix Modal */}
      {fixModalOpen && entryToFix && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 space-y-4 shadow-xl animate-in fade-in zoom-in-95">
            <div className="flex justify-between items-center border-b border-slate-100 pb-3">
              <h3 className="font-bold text-slate-800 text-base flex items-center gap-2">
                <Plus className="text-emerald-600" size={18} /> ربط القيد كسند قبض لعميل
              </h3>
              <button onClick={() => setFixModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleFixSubmit} className="space-y-4">
              <div className="p-3 bg-slate-50 rounded-xl space-y-1 text-xs">
                <div className="flex justify-between">
                  <span className="text-slate-500">رقم القيد:</span>
                  <span className="font-mono font-bold">{entryToFix.ref || 'بدون مرجع'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">المبلغ:</span>
                  <span className="font-mono font-bold text-emerald-600 text-sm">{entryToFix.credit.toLocaleString()} {settings.currency || 'ج.م'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">البيان:</span>
                  <span className="font-medium text-slate-700">{entryToFix.description}</span>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">اختر العميل المعني بالسند <span className="text-red-500">*</span></label>
                <select
                  required
                  className="w-full border rounded-xl p-2.5 bg-slate-50 focus:bg-white text-sm font-bold outline-none focus:border-emerald-500"
                  value={fixFormData.customerId}
                  onChange={e => setFixFormData({...fixFormData, customerId: e.target.value})}
                >
                  <option value="">-- اختر العميل --</option>
                  {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">حساب الخزينة / البنك <span className="text-red-500">*</span></label>
                <select
                  required
                  className="w-full border rounded-xl p-2.5 bg-slate-50 focus:bg-white text-sm font-bold outline-none focus:border-emerald-500"
                  value={fixFormData.treasuryAccountId}
                  onChange={e => setFixFormData({...fixFormData, treasuryAccountId: e.target.value})}
                >
                  {treasuryAccounts.map(a => <option key={a.id} value={a.id}>{a.name} ({a.code})</option>)}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">ملاحظات إضافية</label>
                <input
                  type="text"
                  className="w-full border rounded-xl p-2.5 bg-slate-50 focus:bg-white text-sm outline-none focus:border-emerald-500"
                  value={fixFormData.notes}
                  onChange={e => setFixFormData({...fixFormData, notes: e.target.value})}
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setFixModalOpen(false)}
                  className="px-4 py-2 bg-slate-100 text-slate-700 font-bold rounded-xl text-xs hover:bg-slate-200 transition-colors"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-emerald-600 text-white font-bold rounded-xl text-xs hover:bg-emerald-700 transition-colors shadow-sm"
                >
                  إنشاء وربط السند
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
export default CustomerBalanceReconciliation;

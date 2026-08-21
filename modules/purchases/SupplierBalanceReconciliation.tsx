import React, { useState, useEffect, useMemo } from 'react';
import { useAccounting } from '../../context/AccountingContext';
import { useToast } from '../../context/ToastContext';
import { supabase } from '../../supabaseClient';
import { 
  Scale, AlertTriangle, CheckCircle, Search, ArrowRight, 
  RefreshCw, Trash2, Plus, Save, X, Truck, BookOpen, 
  FileText, FileCheck, Download, HardHat
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import * as XLSX from 'xlsx';

export const SupplierBalanceReconciliation: React.FC = () => {
  const { accounts, suppliers, getSystemAccount, settings } = useAccounting();
  const navigate = useNavigate();
  const { showToast } = useToast();
  
  const [loading, setLoading] = useState(false);
  const [glBalance, setGlBalance] = useState(0);
  const [subLedgerBalance, setSubLedgerBalance] = useState(0);
  const [discrepancyEntries, setDiscrepancyEntries] = useState<any[]>([]);
  const [supplierBalances, setSupplierBalances] = useState<any[]>([]);
  const [subcontractorBillings, setSubcontractorBillings] = useState<any[]>([]);
  const [supplierSearch, setSupplierSearch] = useState('');
  const [activeTab, setActiveTab] = useState<'overview' | 'discrepancies' | 'suppliers' | 'subcontractors'>('overview');
  
  // تحديد حساب الموردين الرئيسي (221 أو 201 في الدليل الموحد)
  const supplierAcc = getSystemAccount('SUPPLIERS');
  const supplierAccountCode = supplierAcc ? supplierAcc.code : '221';

  // حالة نافذة الإصلاح (إنشاء سند صرف)
  const [fixModalOpen, setFixModalOpen] = useState(false);
  const [entryToFix, setEntryToFix] = useState<any>(null);
  const [fixFormData, setFixFormData] = useState({
    supplierId: '',
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
      // 1. جلب رصيد دفتر الأستاذ (GL) لحساب الموردين حصراً (221 / 2211) واستبعاد أوراق الدفع أو الحسابات الدائنة الأخرى
      const supplierAccounts = accounts.filter(a => 
        !a.isGroup && (
          a.code === supplierAccountCode || 
          a.code === '2211' || 
          a.code === '221' || 
          a.code.startsWith('2211') || 
          a.code === '20101' || 
          a.code.startsWith('20101') || 
          (supplierAcc && a.id === supplierAcc.id)
        )
      );
      const accountIds = supplierAccounts.map(a => a.id);

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

      // رصيد الموردين دائن بطبيعته (دائن - مدين)
      const calculatedGlBalance = totalGlCredit - totalGlDebit;
      setGlBalance(calculatedGlBalance);

      // 2. جلب رصيد الأستاذ المساعد (Sub-ledger) من كشوف حسابات الموردين ومقاولي الباطن
      const { data: suppliersList } = await supabase
        .from('suppliers')
        .select('id, name, phone, opening_balance')
        .is('deleted_at', null);

      const { data: invoices } = await supabase
        .from('purchase_invoices')
        .select('supplier_id, total_amount, paid_amount, invoice_number, status')
        .neq('status', 'draft')
        .neq('status', 'cancelled');

      const { data: returns } = await supabase
        .from('purchase_returns')
        .select('supplier_id, total_amount, return_number, status')
        .neq('status', 'draft');

      const { data: debitNotes } = await supabase
        .from('debit_notes')
        .select('supplier_id, total_amount, debit_note_number, status')
        .eq('status', 'posted');

      const { data: payments } = await supabase
        .from('payment_vouchers')
        .select('supplier_id, amount, voucher_number, payment_method')
        .not('supplier_id', 'is', null);

      const { data: cheques } = await supabase
        .from('cheques')
        .select('party_id, amount, cheque_number, status, type')
        .eq('type', 'outgoing');

      let subBillingsNormalized: any[] = [];
      try {
        const { data: subBillings, error: sbError } = await supabase
          .from('subcontractor_billings')
          .select(`
            id,
            billing_number,
            net_amount,
            gross_amount,
            status,
            billing_date,
            subcontractor_contracts (
              subcontractors (
                name
              )
            )
          `)
          .neq('status', 'draft');

        if (!sbError && subBillings) {
          subBillingsNormalized = subBillings.map((sb: any) => ({
            id: sb.id,
            billing_number: sb.billing_number,
            net_amount: sb.net_amount,
            gross_amount: sb.gross_amount,
            status: sb.status,
            issue_date: sb.billing_date,
            subcontractor_name: sb.subcontractor_contracts?.subcontractors?.name || '-'
          }));
        } else {
          // خطة بديلة في حال عدم توفر العلاقات المتقدمة
          const { data: basicBillings } = await supabase
            .from('subcontractor_billings')
            .select('id, billing_number, net_amount, gross_amount, status, billing_date')
            .neq('status', 'draft');
          if (basicBillings) {
            subBillingsNormalized = basicBillings.map((sb: any) => ({
              id: sb.id,
              billing_number: sb.billing_number,
              net_amount: sb.net_amount,
              gross_amount: sb.gross_amount,
              status: sb.status,
              issue_date: sb.billing_date,
              subcontractor_name: '-'
            }));
          }
        }
      } catch (sbErr) {
        console.warn('Subcontractor billings fetch warning:', sbErr);
      }

      setSubcontractorBillings(subBillingsNormalized);


      const subLedgerRefs = new Set<string>();

      // تسجيل جميع مراجع المستندات للمطابقة
      invoices?.forEach(inv => { if (inv.invoice_number) subLedgerRefs.add(inv.invoice_number.trim()); });
      returns?.forEach(ret => { if (ret.return_number) subLedgerRefs.add(ret.return_number.trim()); });
      payments?.forEach(pay => { if (pay.voucher_number) subLedgerRefs.add(pay.voucher_number.trim()); });
      debitNotes?.forEach(dn => { if (dn.debit_note_number) subLedgerRefs.add(dn.debit_note_number.trim()); });
      
      subBillingsNormalized?.forEach(sb => {
        if (sb.billing_number) {
          subLedgerRefs.add(sb.billing_number.trim());
          subLedgerRefs.add(`SUB-BILL-${sb.billing_number.replace(/^SUB-(BILL-)?/i, '')}`);
        }
        if (sb.id) subLedgerRefs.add(sb.id);
      });


      cheques?.forEach(chq => {
        const rawNum = String(chq.cheque_number || '').trim();
        if (rawNum) {
          subLedgerRefs.add(`CHQ-${rawNum}`);
          subLedgerRefs.add(rawNum);
          subLedgerRefs.add(`REJ-OUT-${rawNum}`);
          subLedgerRefs.add(`REJ-${rawNum}`);
        }
      });

      // إعداد قائمة بأرقام الشيكات لمنع تكرار احتسابها
      const chequeNumbersSet = new Set<string>();
      cheques?.forEach(c => {
        const raw = String(c.cheque_number || '').trim().toUpperCase();
        if (raw) {
          chequeNumbersSet.add(raw);
          chequeNumbersSet.add(raw.replace(/^CHQ-/i, ''));
        }
      });

      // تجميع أرصدة كشوف حسابات الموردين
      let totalSupplierStatementsBalance = 0;
      const calculatedSupplierBalances: any[] = [];

      suppliersList?.forEach(supplier => {
        const opening = Number(supplier.opening_balance || 0);
        
        const supInvoices = invoices?.filter(i => i.supplier_id === supplier.id) || [];
        const supInvTotal = supInvoices.reduce((sum, i) => sum + (Number(i.total_amount || 0) - Number(i.paid_amount || 0)), 0);
        const supGrossInvTotal = supInvoices.reduce((sum, i) => sum + Number(i.total_amount || 0), 0);
        
        const supReturns = returns?.filter(r => r.supplier_id === supplier.id) || [];
        const supRetTotal = supReturns.reduce((sum, r) => sum + Number(r.total_amount || 0), 0);
        
        const supDebitNotes = debitNotes?.filter(d => d.supplier_id === supplier.id) || [];
        const supDnTotal = supDebitNotes.reduce((sum, d) => sum + Number(d.total_amount || 0), 0);
        
        const supCheques = cheques?.filter(c => c.party_id === supplier.id && c.status !== 'rejected') || [];
        const supChqTotal = supCheques.reduce((sum, c) => sum + Number(c.amount || 0), 0);
        
        const supPayments = payments?.filter(p => p.supplier_id === supplier.id) || [];
        const supPayTotal = supPayments.reduce((sum, p) => {
          const vNum = (p.voucher_number || '').trim().toUpperCase();
          const cleanNum = vNum.replace(/^(CHQ-|PV-)/i, '');
          const isChequeVoucher = vNum.startsWith('CHQ-') || p.payment_method === 'cheque' || chequeNumbersSet.has(cleanNum) || chequeNumbersSet.has(vNum);
          return isChequeVoucher ? sum : sum + Number(p.amount || 0);
        }, 0);

        // احتساب القيود اليدوية المسجلة باسم المورد مباشرة في اليومية العامة (مع استبعاد القيود الافتتاحية المضافة مسبقاً من جدول الموردين)
        let manualSupplierEntriesTotal = 0;
        glLines?.forEach((line: any) => {
          const ref = (line.journal_entries?.reference || '').trim().toUpperCase();
          const desc = `${line.description || ''} ${line.journal_entries?.description || ''}`.trim();
          
          const isAlreadyCounted = subLedgerRefs.has(ref) || ref.startsWith('PINV-') || ref.startsWith('PV-') || ref.startsWith('PRET-') || ref.startsWith('DN-') || ref.startsWith('SUB-');
          const isOpening = ref.startsWith('OP-') || ref.startsWith('OB-') || ref.startsWith('OPENING-') || desc.includes('رصيد افتتاحي');

          if (isOpening) {
            if (ref) subLedgerRefs.add(ref);
            if (!opening && supplier.name && desc.includes(supplier.name)) {
              // إذا لم يكن مسجلاً في جدول الموردين ويوجد قيد افتتاحي
              const netManual = Number(line.credit || 0) - Number(line.debit || 0);
              manualSupplierEntriesTotal += netManual;
            }
            return;
          }

          if (!isAlreadyCounted && supplier.name && desc.includes(supplier.name)) {
            const netManual = Number(line.credit || 0) - Number(line.debit || 0); // دائن - مدين للمورد
            manualSupplierEntriesTotal += netManual;
            if (ref) subLedgerRefs.add(ref);
          }
        });

        // رصيد المورد = الرصيد الافتتاحي + إجمالي فواتير المشتريات + القيود اليدوية باسم المورد - المرتجعات - الإشعارات المدينة - الشيكات - المدفوعات
        const supplierBalance = opening + supGrossInvTotal + manualSupplierEntriesTotal - supRetTotal - supDnTotal - supChqTotal - supPayTotal;
        totalSupplierStatementsBalance += supplierBalance;


        calculatedSupplierBalances.push({
          id: supplier.id,
          name: supplier.name,
          phone: supplier.phone,
          opening,
          invoicesCount: supInvoices.length,
          grossInvoices: supGrossInvTotal,
          returnsTotal: supRetTotal,
          debitNotesTotal: supDnTotal,
          paymentsTotal: supPayTotal + supChqTotal,
          manualEntriesTotal: manualSupplierEntriesTotal,
          balance: supplierBalance
        });
      });

      // إضافة إجمالي مستخلصات مقاولي الباطن المعتمدة
      const subBillingsTotal = subBillingsNormalized?.reduce((sum, sb) => sum + Number(sb.net_amount || 0), 0) || 0;
      const calculatedSubLedgerBalance = totalSupplierStatementsBalance + subBillingsTotal;


      setSubLedgerBalance(calculatedSubLedgerBalance);
      setSupplierBalances(calculatedSupplierBalances);

      // 3. تحليل الفروقات الذكي
      const isRefMatched = (ref: string, desc: string): boolean => {
        if (!ref && !desc) return false;
        const cleanRef = (ref || '').trim().toUpperCase();
        const cleanDesc = (desc || '').trim();

        // فحص ما إذا كان القيد يذكر اسم أي مورد
        if (suppliersList?.some(s => s.name && cleanDesc.includes(s.name))) {
          return true;
        }

        // تجاهل قيود الإقفال والافتتاحية
        if (
          cleanRef.startsWith('CLOSE-') || 
          cleanRef.startsWith('CLOSING-') || 
          cleanRef.startsWith('OPENING-') || 
          cleanRef.startsWith('OB-') || 
          cleanRef.startsWith('OP-') || 
          cleanDesc.includes('رصيد افتتاحي')
        ) {
          return true;
        }

        // فحص التطابق المباشر
        if (cleanRef && subLedgerRefs.has(cleanRef)) return true;

        // فحص تطابق بادئات ومقاطع الشيكات المرفوضة
        if (cleanRef.startsWith('REJ-OUT-') || cleanRef.startsWith('REJ-IN-') || cleanRef.startsWith('REJ-')) {
          const num = cleanRef.replace(/^REJ-(OUT-|IN-)?/i, '');
          if (subLedgerRefs.has(num) || subLedgerRefs.has(`CHQ-${num}`)) return true;
        }

        // فحص تطابق مستخلصات المقاولين
        if (cleanRef.startsWith('SUB-BILL-') || cleanRef.startsWith('SUB-')) {
          const num = cleanRef.replace(/^SUB-(BILL-)?/i, '');
          if (subLedgerRefs.has(num) || subLedgerRefs.has(`SUB-BILL-${num}`)) return true;
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
        const matched = isRefMatched(entry.ref, entry.description);
        if (!matched) {
          discrepancies.push(entry);
        }
      });

      setDiscrepancyEntries(discrepancies);

    } catch (error) {
      console.error('Error fetching supplier reconciliation:', error);
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
      supplierId: '',
      treasuryAccountId: treasuryAccounts[0]?.id || '',
      notes: entry.description || ''
    });
    setFixModalOpen(true);
  };

  const handleFixSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fixFormData.supplierId || !fixFormData.treasuryAccountId) {
      showToast('الرجاء اختيار المورد وحساب الخزينة/البنك', 'warning');
      return;
    }

    try {
      // إذا كان القيد مديناً على المورد (سند صرف)
      const isPayment = entryToFix.debit > 0;
      const amount = isPayment ? entryToFix.debit : entryToFix.credit;

      if (isPayment) {
        const { error } = await supabase.from('payment_vouchers').insert({
          voucher_number: entryToFix.ref || `PV-FIX-${Date.now().toString().slice(-6)}`,
          payment_date: entryToFix.date,
          amount: amount,
          supplier_id: fixFormData.supplierId,
          treasury_account_id: fixFormData.treasuryAccountId,
          notes: fixFormData.notes,
          payment_method: 'cash'
        });
        if (error) throw error;
      } else {
        showToast('هذا القيد دائن، يمكنك ربطه كفاتورة مشتريات من شاشة المشتريات.', 'info');
        return;
      }
      
      showToast('تم إنشاء سند الصرف وربطه بالقيد بنجاح ✅', 'success');
      setFixModalOpen(false);
      fetchReconciliation();
    } catch (err: any) {
      console.error(err);
      showToast('خطأ: ' + err.message, 'error');
    }
  };

  const exportSupplierBalances = () => {
    if (supplierBalances.length === 0) return;
    const worksheet = XLSX.utils.json_to_sheet(supplierBalances.map(s => ({
      'اسم المورد': s.name,
      'رقم الهاتف': s.phone || '-',
      'الرصيد الافتتاحي': s.opening,
      'إجمالي المشتريات': s.grossInvoices,
      'إجمالي المرتجعات': s.returnsTotal,
      'الإشعارات المدينة': s.debitNotesTotal,
      'إجمالي المدفوعات': s.paymentsTotal,
      'صافي مستحقات المورد': s.balance
    })));
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'أرصدة الموردين');
    XLSX.writeFile(workbook, `Supplier_Balances_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  useEffect(() => {
    fetchReconciliation();
  }, [accounts]);

  const difference = glBalance - subLedgerBalance;
  const isBalanced = Math.abs(difference) < 1;

  const filteredSuppliers = useMemo(() => {
    if (!supplierSearch.trim()) return supplierBalances;
    const q = supplierSearch.toLowerCase();
    return supplierBalances.filter(s => 
      s.name.toLowerCase().includes(q) || (s.phone && s.phone.includes(q))
    );
  }, [supplierBalances, supplierSearch]);

  return (
    <div className="space-y-6 animate-in fade-in p-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-slate-200 pb-4">
        <div>
          <h2 className="text-2xl font-black text-slate-800 flex items-center gap-2">
            <Scale className="text-orange-600" size={28} /> مطابقة أرصدة الموردين والمقاولين
          </h2>
          <p className="text-slate-500 text-sm">مقارنة فورية بين رصيد دفتر الأستاذ العام (GL) وأرصدة كشوف حسابات الموردين ومقاولي الباطن</p>
        </div>
        <div className="flex items-center gap-2">
          <button 
            onClick={fetchReconciliation} 
            disabled={loading}
            className="flex items-center gap-2 bg-white border border-slate-300 px-4 py-2.5 rounded-xl hover:bg-slate-50 font-bold text-slate-700 shadow-sm transition-all disabled:opacity-50"
          >
            <RefreshCw size={18} className={loading ? 'animate-spin text-orange-600' : ''} /> تحديث المطابقة
          </button>
        </div>
      </div>

      {/* Main KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* GL Balance */}
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
          <p className="text-xs font-bold text-slate-500 mb-1">رصيد دفتر الأستاذ العام (حساب {supplierAccountCode})</p>
          <h3 className="text-3xl font-black text-slate-800 font-mono dir-ltr">
            {glBalance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </h3>
          <p className="text-[11px] text-slate-400 mt-2 flex items-center gap-1 font-bold">
            <BookOpen size={13} /> مجموع القيود المرحلة لحساب الموردين (دائن)
          </p>
        </div>

        {/* Sub-ledger Balance */}
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
          <p className="text-xs font-bold text-slate-500 mb-1">رصيد كشوف حسابات الموردين (الأستاذ المساعد)</p>
          <h3 className="text-3xl font-black text-orange-600 font-mono dir-ltr">
            {subLedgerBalance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </h3>
          <p className="text-[11px] text-slate-400 mt-2 flex items-center gap-1 font-bold">
            <Truck size={13} /> فواتير الشراء + مستخلصات المقاولين - المرتجعات - السندات
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
            activeTab === 'overview' ? 'border-orange-600 text-orange-700' : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Scale size={16} /> ملخص المطابقة
        </button>
        <button
          onClick={() => setActiveTab('discrepancies')}
          className={`pb-3 px-4 text-sm font-bold border-b-2 transition-all flex items-center gap-2 ${
            activeTab === 'discrepancies' ? 'border-orange-600 text-orange-700' : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <AlertTriangle size={16} /> القيود غير المربوطة ({discrepancyEntries.length})
        </button>
        <button
          onClick={() => setActiveTab('suppliers')}
          className={`pb-3 px-4 text-sm font-bold border-b-2 transition-all flex items-center gap-2 ${
            activeTab === 'suppliers' ? 'border-orange-600 text-orange-700' : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Truck size={16} /> كشف أرصدة الموردين ({supplierBalances.length})
        </button>
        <button
          onClick={() => setActiveTab('subcontractors')}
          className={`pb-3 px-4 text-sm font-bold border-b-2 transition-all flex items-center gap-2 ${
            activeTab === 'subcontractors' ? 'border-orange-600 text-orange-700' : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <HardHat size={16} /> مستخلصات مقاولي الباطن ({subcontractorBillings.length})
        </button>
      </div>

      {/* Tab 1: Overview */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
            <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2">
              <FileCheck className="text-orange-600" size={20} /> نتيجة فحص التكامل المحاسبي
            </h3>
            
            {isBalanced ? (
              <div className="p-6 bg-emerald-50 rounded-xl border border-emerald-200 text-center space-y-2">
                <div className="w-12 h-12 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto mb-2">
                  <CheckCircle size={28} />
                </div>
                <h4 className="text-lg font-black text-emerald-800">الأستاذ العام متطابق تماماً مع كشوف حسابات الموردين والمقاولين!</h4>
                <p className="text-sm text-emerald-700 max-w-xl mx-auto">
                  جميع فواتير المشتريات، مستخلصات مقاولي الباطن، سندات الصرف، الإشعارات المدينة، والأرصدة الافتتاحية مسجلة ومرحلة بدقة وتساوي إجمالي رصيد حساب الموردين في ميزان المراجعة.
                </p>
              </div>
            ) : (
              <div className="p-6 bg-red-50 rounded-xl border border-red-200 space-y-3">
                <div className="flex items-center gap-3">
                  <AlertTriangle className="text-red-600" size={24} />
                  <h4 className="text-base font-black text-red-800">تنبيه: يوجد فرق محاسبي بقيمة {Math.abs(difference).toLocaleString()} {settings.currency || 'ج.م'}</h4>
                </div>
                <p className="text-sm text-red-700 leading-relaxed">
                  هذا الفرق ناتج إما عن قيود يومية تم تسجيلها يدوياً على حساب الموردين العام دون إنشاء مستند مشتريات/صرف لها، أو مستندات غير مرحلة. يمكنك الانتقال لتبويب <strong>«القيود غير المربوطة»</strong> لمعالجة الفروقات بنقرة واحدة.
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
              <Search size={18} className="text-orange-600" /> قيود الأستاذ العام غير الموجودة بكشوف حسابات الموردين
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
                      <td className="p-3 text-center font-mono font-bold text-emerald-700">{entry.debit ? entry.debit.toLocaleString() : '-'}</td>
                      <td className="p-3 text-center font-mono font-bold text-slate-800">{entry.credit ? entry.credit.toLocaleString() : '-'}</td>
                      <td className="p-3 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          <button 
                            onClick={() => navigate('/general-journal', { state: { initialSearch: entry.ref } })}
                            className="text-blue-600 hover:bg-blue-50 px-2 py-1 rounded text-xs font-bold transition-colors"
                            title="عرض القيد باليومية"
                          >
                            عرض القيد
                          </button>
                          {entry.debit > 0 && (
                            <button
                              onClick={() => openFixModal(entry)}
                              className="bg-orange-600 text-white px-2.5 py-1 rounded-lg text-xs font-bold hover:bg-orange-700 transition-colors"
                              title="إنشاء سند صرف وربطه بالمورد"
                            >
                              ربط كسند صرف
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

      {/* Tab 3: Detailed Supplier Balances */}
      {activeTab === 'suppliers' && (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 space-y-4 p-6">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
            <div className="relative flex-1 max-w-md">
              <input
                type="text"
                placeholder="بحث باسم المورد أو رقم الهاتف..."
                value={supplierSearch}
                onChange={e => setSupplierSearch(e.target.value)}
                className="w-full border rounded-xl p-2.5 pl-10 text-sm bg-slate-50 focus:bg-white outline-none focus:border-orange-500 font-bold"
              />
              <Search className="absolute left-3 top-3 text-slate-400" size={18} />
            </div>
            <button
              onClick={exportSupplierBalances}
              className="bg-orange-50 text-orange-700 border border-orange-200 px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 hover:bg-orange-100 transition-colors"
            >
              <Download size={15} /> تصدير Excel
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-right text-sm">
              <thead className="bg-slate-50 text-slate-600 font-bold border-b border-slate-200 text-xs">
                <tr>
                  <th className="p-3">اسم المورد</th>
                  <th className="p-3 text-center">الرصيد الافتتاحي</th>
                  <th className="p-3 text-center">إجمالي المشتريات</th>
                  <th className="p-3 text-center">المرتجعات والإشعارات</th>
                  <th className="p-3 text-center">إجمالي المدفوعات</th>
                  <th className="p-3 text-center">صافي الرصيد المستحق</th>
                  <th className="p-3 text-center">كشف الحساب</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredSuppliers.map((sup) => (
                  <tr key={sup.id} className="hover:bg-slate-50/70 transition-colors">
                    <td className="p-3">
                      <p className="font-bold text-slate-800">{sup.name}</p>
                      {sup.phone && <p className="text-xs text-slate-400 font-mono">{sup.phone}</p>}
                    </td>
                    <td className="p-3 text-center font-mono font-bold text-slate-600">{sup.opening.toLocaleString()}</td>
                    <td className="p-3 text-center font-mono font-bold text-slate-800">{sup.grossInvoices.toLocaleString()}</td>
                    <td className="p-3 text-center font-mono font-bold text-amber-600">{(sup.returnsTotal + sup.debitNotesTotal).toLocaleString()}</td>
                    <td className="p-3 text-center font-mono font-bold text-emerald-600">{sup.paymentsTotal.toLocaleString()}</td>
                    <td className="p-3 text-center font-mono font-black text-slate-900" dir="ltr">
                      <span className={`px-2 py-0.5 rounded text-xs ${sup.balance > 0 ? 'bg-orange-50 text-orange-700 font-black' : sup.balance < 0 ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>
                        {sup.balance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </span>
                    </td>
                    <td className="p-3 text-center">
                      <button
                        onClick={() => navigate('/supplier-statement', { state: { selectedSupplierId: sup.id } })}
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

      {/* Tab 4: Subcontractor Billings */}
      {activeTab === 'subcontractors' && (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 space-y-4 p-6">
          <div className="flex justify-between items-center">
            <h3 className="font-bold text-slate-800 flex items-center gap-2">
              <HardHat size={18} className="text-orange-600" /> مستخلصات مقاولي الباطن المعتمدة والمرحلة
            </h3>
            <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-orange-100 text-orange-700">
              {subcontractorBillings.length} مستخلص
            </span>
          </div>

          {subcontractorBillings.length === 0 ? (
            <div className="p-12 text-center text-slate-400 font-bold">
              لا توجد مستخلصات مقاولي باطن مسجلة حالياً.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-right text-sm">
                <thead className="bg-slate-50 text-slate-600 font-bold border-b border-slate-200 text-xs">
                  <tr>
                    <th className="p-3">رقم المستخلص</th>
                    <th className="p-3">اسم مقاول الباطن</th>
                    <th className="p-3 text-center">التاريخ</th>
                    <th className="p-3 text-center">إجمالي المستخلص</th>
                    <th className="p-3 text-center">صافي المستحق</th>
                    <th className="p-3 text-center">الحالة</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {subcontractorBillings.map((bill) => (
                    <tr key={bill.id} className="hover:bg-slate-50/70 transition-colors">
                      <td className="p-3 font-mono font-bold text-slate-800">{bill.billing_number || bill.id.slice(0, 8)}</td>
                      <td className="p-3 font-bold text-slate-700">{bill.subcontractor_name || '-'}</td>
                      <td className="p-3 text-center font-mono text-xs text-slate-500">{bill.issue_date || '-'}</td>
                      <td className="p-3 text-center font-mono font-bold text-slate-800">{(Number(bill.gross_amount) || 0).toLocaleString()}</td>
                      <td className="p-3 text-center font-mono font-black text-orange-700">{(Number(bill.net_amount) || 0).toLocaleString()}</td>
                      <td className="p-3 text-center">
                        <span className="bg-emerald-100 text-emerald-800 text-[10px] font-bold px-2 py-0.5 rounded-full">
                          {bill.status || 'معتمد'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Fix Modal */}
      {fixModalOpen && entryToFix && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 space-y-4 shadow-xl animate-in fade-in zoom-in-95">
            <div className="flex justify-between items-center border-b border-slate-100 pb-3">
              <h3 className="font-bold text-slate-800 text-base flex items-center gap-2">
                <Plus className="text-orange-600" size={18} /> ربط القيد كسند صرف لمورد
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
                  <span className="font-mono font-bold text-orange-600 text-sm">{entryToFix.debit.toLocaleString()} {settings.currency || 'ج.م'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">البيان:</span>
                  <span className="font-medium text-slate-700">{entryToFix.description}</span>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">اختر المورد المعني بالسند <span className="text-red-500">*</span></label>
                <select
                  required
                  className="w-full border rounded-xl p-2.5 bg-slate-50 focus:bg-white text-sm font-bold outline-none focus:border-orange-500"
                  value={fixFormData.supplierId}
                  onChange={e => setFixFormData({...fixFormData, supplierId: e.target.value})}
                >
                  <option value="">-- اختر المورد --</option>
                  {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">حساب الخزينة / البنك <span className="text-red-500">*</span></label>
                <select
                  required
                  className="w-full border rounded-xl p-2.5 bg-slate-50 focus:bg-white text-sm font-bold outline-none focus:border-orange-500"
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
                  className="w-full border rounded-xl p-2.5 bg-slate-50 focus:bg-white text-sm outline-none focus:border-orange-500"
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
                  className="px-5 py-2 bg-orange-600 text-white font-bold rounded-xl text-xs hover:bg-orange-700 transition-colors shadow-sm"
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

export default SupplierBalanceReconciliation;

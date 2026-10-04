import { logger } from '../../utils/logger';
import { useState, useEffect, useMemo } from 'react';
import { useLocation } from 'react-router-dom';
import { useAccounting } from '../../context/AccountingContext';
import { supabase } from '../../supabaseClient';
import { useToast } from '../../context/ToastContext';
import { Printer, FileText, Loader2, Search, Download, MessageCircle, ChevronLeft, ChevronRight } from 'lucide-react';
import * as XLSX from 'xlsx';
import SupplierSearchSelect from '../../components/SupplierSearchSelect';
import { PurchaseInvoicePrint } from './PurchaseInvoicePrint';
import { PaymentVoucherPrint } from '../finance/reports/PaymentVoucherPrint';

// 🚀 أداة استعلام تجلب جميع السجلات بأمان متجاوزة سقف الـ 1000 في Supabase عبر التجزئة التتابعية
async function fetchCompleteDataset<T>(
  queryBuilder: (from: number, to: number) => Promise<{ data: T[] | null; error: unknown }>
): Promise<T[]> {
  const CHUNK_SIZE = 1000;
  let allRows: T[] = [];
  let from = 0;
  while (true) {
    const { data, error } = await queryBuilder(from, from + CHUNK_SIZE - 1);
    if (error || !data || data.length === 0) break;
    allRows.push(...data);
    if (data.length < CHUNK_SIZE) break;
    from += CHUNK_SIZE;
  }
  return allRows;
}

type Transaction = {
  id: string;
  docId?: string;
  date: string;
  type: 'invoice' | 'payment' | 'return' | 'debit_note' | 'manual';
  reference: string;
  description: string;
  debit: number;  // مدين (سداد/مرتجع)
  credit: number; // دائن (مشتريات)
  paid_amount?: number;
  balance: number;
};

const SupplierStatement = () => {
  const { suppliers, settings, currentUser, selectedFiscalYear, fiscalYearRange } = useAccounting();
  const { showToast } = useToast();
  const [selectedSupplierId, setSelectedSupplierId] = useState('');
  const [startDate, setStartDate] = useState(fiscalYearRange.startDate);
  const [endDate, setEndDate] = useState(`${selectedFiscalYear}-12-31`);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [openingBalance, setOpeningBalance] = useState(0);
  const [closingBalance, setClosingBalance] = useState(0);
  const [loading, setLoading] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState<number | 'all'>(50);

  // حالة طباعة مستند مفرد (فاتورة أو سند)
  const [printingDocId, setPrintingDocId] = useState<string | null>(null);
  const [printDoc, setPrintDoc] = useState<{ type: 'invoice' | 'payment'; data: Record<string, unknown> } | null>(null);

  // إعادة التعيين للصفحة الأولى عند تغيير الفلاتر
  useEffect(() => {
    setCurrentPage(1);
  }, [selectedSupplierId, startDate, endDate]);

  // مزامنة التواريخ تلقائياً عند تغيير السنة المالية المختارة من شريط النظام
  useEffect(() => {
    if (selectedFiscalYear) {
      setStartDate(`${selectedFiscalYear}-01-01`);
      setEndDate(`${selectedFiscalYear}-12-31`);
    }
  }, [selectedFiscalYear]);
  
  const location = useLocation();

  // استقبال المورد المحال عبر state من شاشات المشتريات
  useEffect(() => {
    if (location.state && (location.state as any).selectedSupplierId) {
      setSelectedSupplierId((location.state as any).selectedSupplierId);
    }
  }, [location.state]);

  const selectedSupplier = suppliers.find(s => s.id.toString() === selectedSupplierId.toString());

  const fetchStatement = async () => {
    if (!selectedSupplierId) return;
    setLoading(true);

    if (currentUser?.role === 'demo') {
        setTransactions([
            { id: 'd1', docId: 'd1', date: new Date(Date.now() - 86400000 * 10).toISOString().split('T')[0], type: 'invoice', reference: 'PINV-DEMO-88', description: 'فاتورة مشتريات بضاعة', credit: 12000, debit: 0, balance: 12000 },
            { id: 'd2', docId: 'd2', date: new Date(Date.now() - 86400000 * 5).toISOString().split('T')[0], type: 'payment', reference: 'PV-DEMO-33', description: 'سداد دفعة للمورد', credit: 0, debit: 5000, balance: 7000 }
        ]);
        setOpeningBalance(0);
        setClosingBalance(7000);
        setLoading(false);
        return;
    }

    try {
        const { data: sessionData } = await supabase.auth.getSession();
        const userOrgId = sessionData?.session?.user?.user_metadata?.org_id;

        if (!userOrgId) return;

        const filter = { supplier_id: selectedSupplierId, organization_id: userOrgId };

        // 1. جلب الفواتير (دائن - تزيد الرصيد) مع تجاوز سقف الـ 1000 بأمان
        const invoices = await fetchCompleteDataset(async (from, to) => 
            supabase.from('purchase_invoices')
                .select('id, invoice_number, invoice_date, total_amount, notes, paid_amount')
                .match(filter)
                .neq('status', 'draft')
                .range(from, to)
        );

        // 2. جلب المرتجعات (مدين - تنقص الرصيد)
        const returns = await fetchCompleteDataset(async (from, to) =>
            supabase.from('purchase_returns')
                .select('id, return_number, return_date, total_amount, notes')
                .match(filter)
                .eq('status', 'posted')
                .range(from, to)
        );

        // 3. جلب سندات الصرف (مدين - تنقص الرصيد)
        const payments = await fetchCompleteDataset(async (from, to) =>
            supabase.from('payment_vouchers')
                .select('id, voucher_number, payment_date, amount, notes')
                .match(filter)
                .range(from, to)
        );

        // 4. جلب الإشعارات المدينة (مدين - تنقص الرصيد)
        const debitNotes = await fetchCompleteDataset(async (from, to) =>
            supabase.from('debit_notes')
                .select('id, debit_note_number, note_date, total_amount, notes')
                .match(filter)
                .eq('status', 'posted')
                .range(from, to)
        );

        // 5. جلب الشيكات الصادرة (مدين - تنقص الرصيد)
        const cheques = await fetchCompleteDataset(async (from, to) =>
            supabase.from('cheques')
                .select('id, cheque_number, due_date, amount, notes, created_at')
                .eq('party_id', selectedSupplierId)
                .eq('organization_id', userOrgId)
                .eq('type', 'outgoing')
                .neq('status', 'rejected')
                .range(from, to)
        );

        // 6. جلب مستخلصات مقاولي الباطن المعتمدة (إذا كان المورد مقاول باطن)
        let subBillingsData: any[] = [];
        if (selectedSupplier?.name) {
            const { data: matchedSubs } = await supabase.from('subcontractors')
                .select('id')
                .ilike('name', `%${selectedSupplier.name}%`)
                .eq('organization_id', userOrgId);

            if (matchedSubs && matchedSubs.length > 0) {
                const subIds = matchedSubs.map(s => s.id);
                const { data: contracts } = await supabase.from('subcontractor_contracts')
                    .select('id')
                    .in('subcontractor_id', subIds)
                    .eq('organization_id', userOrgId);

                if (contracts && contracts.length > 0) {
                    const contractIds = contracts.map(c => c.id);
                    const { data: billings } = await supabase.from('subcontractor_billings')
                        .select('id, billing_number, billing_date, net_amount')
                        .in('contract_id', contractIds)
                        .eq('organization_id', userOrgId)
                        .neq('status', 'draft');

                    if (billings) subBillingsData = billings;
                }
            }
        }

        // 7. جلب القيود اليدوية والافتتاحية (التي تؤثر على حسابات الموردين)
        const [manualEntriesRes, openingEntriesRes] = await Promise.all([
            supabase.from('journal_lines')
                .select('debit, credit, journal_entries!inner(id, transaction_date, description, reference, status, related_document_id), accounts!inner(code)')
                .eq('journal_entries.status', 'posted')
                .is('journal_entries.related_document_id', null)
                .or('code.ilike.201%,code.ilike.221%', { foreignTable: 'accounts' })
                .ilike('journal_entries.description', `%${selectedSupplier?.name}%`),
            supabase.from('journal_lines')
                .select('debit, credit, journal_entries!inner(id, transaction_date, description, reference, status, related_document_id, related_document_type), accounts!inner(code)')
                .eq('journal_entries.status', 'posted')
                .eq('journal_entries.related_document_id', selectedSupplierId)
                .eq('journal_entries.related_document_type', 'opening_balance')
                .or('code.ilike.201%,code.ilike.221%', { foreignTable: 'accounts' })
        ]);

        const manualEntries = manualEntriesRes.data;
        const openingEntries = openingEntriesRes.data;

        // تجميع كل الحركات
        let allTrans: any[] = [];

        invoices?.forEach(inv => {
            const pvPaidForThisInvoice = payments?.filter(p => p.notes && inv.invoice_number && p.notes.includes(inv.invoice_number)).reduce((s, p) => s + Number(p.amount || 0), 0) || 0;
            const immediatePaidAtCheckout = Math.max(0, Number(inv.paid_amount || 0) - pvPaidForThisInvoice);

            allTrans.push({
                docId: inv.id,
                date: inv.invoice_date, 
                type: 'invoice', 
                ref: inv.invoice_number, 
                desc: inv.notes?.trim() || 'فاتورة مشتريات', 
                credit: Number(inv.total_amount || 0), 
                debit: immediatePaidAtCheckout, 
                paid_amount: Number(inv.paid_amount || 0)
            });
        });

        // إضافة مستخلصات مقاولي الباطن كدائن
        subBillingsData.forEach(sb => {
            allTrans.push({
                docId: sb.id,
                date: sb.billing_date,
                type: 'invoice',
                ref: sb.billing_number,
                desc: `مستخلص أعمال مقاول (${sb.billing_number})`,
                credit: Number(sb.net_amount || 0),
                debit: 0
            });
        });

        returns?.forEach(ret => allTrans.push({
            docId: ret.id,
            date: ret.return_date, type: 'return', ref: ret.return_number, desc: ret.notes?.trim() || 'مرتجع مشتريات', 
            credit: 0, debit: ret.total_amount 
        }));

        payments?.forEach(pay => allTrans.push({
            docId: pay.id,
            date: pay.payment_date, type: 'payment', ref: pay.voucher_number, desc: pay.notes?.trim() || 'سند صرف', 
            credit: 0, debit: pay.amount 
        }));

        debitNotes?.forEach(dn => allTrans.push({
            docId: dn.id,
            date: dn.note_date, type: 'debit_note', ref: dn.debit_note_number, desc: dn.notes?.trim() || 'إشعار مدين', 
            credit: 0, debit: dn.total_amount 
        }));

        cheques?.forEach(chq => allTrans.push({
            docId: chq.id,
            date: chq.created_at ? chq.created_at.split('T')[0] : chq.due_date, 
            type: 'payment', 
            ref: chq.cheque_number, 
            desc: `شيك رقم ${chq.cheque_number} (استحقاق ${chq.due_date})`, 
            credit: 0, 
            debit: chq.amount 
        }));

        // إضافة القيود الافتتاحية المسجلة للمورد في دفتر اليومية
        openingEntries?.forEach((line: Record<string, any>) => {
            const isDuplicate = allTrans.some(t => {
                const clean = (r: unknown) => r?.toString().trim().toUpperCase()
                    .replace(/^(CHQ-|PV-|PINV-|PUR-|PR-|DN-|JV-|SUB-BILL-|SUB-|OP-SUPP-|OP-)/i, '') || '';
                return clean(t.ref) === clean(line.journal_entries.reference);
            });

            if (!isDuplicate) {
                allTrans.push({
                    docId: line.journal_entries?.id,
                    date: line.journal_entries.transaction_date,
                    type: 'manual',
                    ref: line.journal_entries.reference || 'OP-SUPP',
                    desc: line.journal_entries.description || `رصيد افتتاحي للمورد: ${selectedSupplier?.name}`,
                    credit: Number(line.credit),
                    debit: Number(line.debit)
                });
            }
        });

        manualEntries?.forEach((line: Record<string, any>) => {
            // 🛡️ منع تكرار المستندات إذا كانت مسجلة بالفعل (مثل الشيكات أو الفواتير)
            const isDuplicate = allTrans.some(t => {
                const clean = (r: unknown) => r?.toString().trim().toUpperCase()
                    .replace(/^(CHQ-|PV-|PINV-|PUR-|PR-|DN-|JV-|SUB-BILL-|SUB-|OP-SUPP-|OP-)/i, '') || '';
                const r1 = clean(t.ref);
                const r2 = clean(line.journal_entries.reference);
                return r1 === r2 && r1 !== '' && r1 !== 'NULL';
            });

            if (!isDuplicate) {
                allTrans.push({
                    docId: line.journal_entries?.id,
                    date: line.journal_entries.transaction_date, type: 'manual', 
                    ref: line.journal_entries.reference || 'JV', 
                    desc: line.journal_entries.description, 
                    credit: Number(line.credit), debit: Number(line.debit) 
                });
            }
        });

        // إذا لم يكن هناك قيد افتتاحي مسجل ولكن يوجد رصيد افتتاحي في بطاقة المورد
        const hasOpeningInTrans = allTrans.some(t => 
            t.ref?.startsWith('OP-SUPP-') || 
            t.ref?.startsWith('OB-') || 
            t.desc?.includes('رصيد افتتاحي')
        );

        if (!hasOpeningInTrans && Number(selectedSupplier?.opening_balance || 0) > 0) {
            allTrans.push({
                date: (selectedSupplier as any)?.created_at ? (selectedSupplier as any).created_at.split('T')[0] : startDate,
                type: 'manual',
                ref: 'OP-SUPP',
                desc: `رصيد افتتاحي للمورد: ${selectedSupplier?.name}`,
                credit: Number(selectedSupplier?.opening_balance || 0),
                debit: 0
            });
        }

        // ترتيب زمني
        allTrans.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

        // حساب الرصيد الافتتاحي والحركات
        let openBal = 0;
        const periodTrans: Transaction[] = [];

        allTrans.forEach(t => {
            if (t.date < startDate) {
                openBal += (t.credit - t.debit);
            } else if (t.date <= endDate) {
                periodTrans.push({
                    id: t.docId ? `${t.docId}-${t.type}` : Math.random().toString(),
                    docId: t.docId,
                    date: t.date,
                    type: t.type,
                    reference: t.ref,
                    description: t.desc,
                    debit: t.debit,
                    credit: t.credit,
                    paid_amount: t.paid_amount,
                    balance: 0
                });
            }
        });

        // حساب الرصيد التراكمي
        let runningBal = openBal;
        const finalTrans = periodTrans.map(t => {
            runningBal += (t.credit - t.debit);
            return { ...t, balance: runningBal };
        });

        setOpeningBalance(openBal);
        setTransactions(finalTrans);
        setClosingBalance(runningBal);

    } catch (error: unknown) {
        logger.error(error);
        const errMsg = error instanceof Error ? error.message : String(error);
        showToast('حدث خطأ أثناء جلب البيانات: ' + errMsg, 'error');
    } finally {
        setLoading(false);
    }
  };

  // جلب البيانات عند تغيير المحددات
  useEffect(() => {
      if (selectedSupplierId) {
          fetchStatement();
      } else {
          setTransactions([]);
          setOpeningBalance(0);
          setClosingBalance(0);
      }
  }, [selectedSupplierId, startDate, endDate]);

  // حساب إجماليات المدين والدائن في نهاية الكشف
  const totalDebit = useMemo(() => {
    return transactions.reduce((sum, t) => sum + (Number(t.debit) || 0), 0);
  }, [transactions]);

  const totalCredit = useMemo(() => {
    return transactions.reduce((sum, t) => sum + (Number(t.credit) || 0), 0);
  }, [transactions]);

  const totalPaidImmediate = useMemo(() => {
    return transactions.reduce((sum, t) => sum + (Number(t.paid_amount) || 0), 0);
  }, [transactions]);

  // دالة طباعة مستند مفرد (فاتورة أو سند صرف) من داخل كشف الحساب
  const handlePrintDoc = async (t: Transaction) => {
    setPrintingDocId(t.id);
    try {
      if (t.type === 'invoice') {
        showToast('جاري تجهيز الفاتورة للطباعة...', 'info');
        const cleanRef = t.reference?.replace(/^(PINV-|PUR-)/i, '') || '';
        
        let invData: Record<string, unknown> | null = null;
        if (t.docId) {
          const { data, error } = await supabase
            .from('purchase_invoices')
            .select(`
              *,
              suppliers(id, name, phone, address, tax_number),
              purchase_invoice_items(id, product_id, quantity, unit_price, total, discount, tax_rate, products(name, sku, unit, uom:uoms!base_uom_id(name)), uoms(name))
            `)
            .eq('id', t.docId)
            .maybeSingle();
          if (!error && data) invData = data;
        }

        if (!invData && t.reference) {
          const { data, error } = await supabase
            .from('purchase_invoices')
            .select(`
              *,
              suppliers(id, name, phone, address, tax_number),
              purchase_invoice_items(id, product_id, quantity, unit_price, total, discount, tax_rate, products(name, sku, unit, uom:uoms!base_uom_id(name)), uoms(name))
            `)
            .or(`invoice_number.eq.${t.reference},invoice_number.ilike.%${cleanRef}%`)
            .limit(1)
            .maybeSingle();
          if (!error && data) invData = data;
        }

        if (!invData) {
          invData = {
            invoice_number: t.reference,
            invoice_date: t.date,
            total_amount: t.credit,
            subtotal: t.credit,
            paid_amount: t.paid_amount || 0,
            suppliers: selectedSupplier,
            purchase_invoice_items: [
              {
                productName: t.description || 'مشتريات بضاعة',
                quantity: 1,
                unit_price: t.credit,
                total: t.credit
              }
            ]
          };
        }

        setPrintDoc({ type: 'invoice', data: invData });
        setTimeout(() => {
          window.print();
          setPrintDoc(null);
          setPrintingDocId(null);
        }, 300);
        return;
      }

      if (t.type === 'payment') {
        showToast('جاري تجهيز سند الصرف للطباعة...', 'info');
        let voucherData: Record<string, unknown> | null = null;
        if (t.docId) {
          const { data, error } = await supabase
            .from('payment_vouchers')
            .select('*, suppliers(id, name, phone, address)')
            .eq('id', t.docId)
            .maybeSingle();
          if (!error && data) voucherData = data;
        }

        if (!voucherData && t.reference) {
          const cleanRef = t.reference.replace(/^(PV-|CHQ-)/i, '');
          const { data, error } = await supabase
            .from('payment_vouchers')
            .select('*, suppliers(id, name, phone, address)')
            .or(`voucher_number.eq.${t.reference},voucher_number.ilike.%${cleanRef}%`)
            .limit(1)
            .maybeSingle();
          if (!error && data) voucherData = data;
        }

        if (!voucherData) {
          voucherData = {
            voucher_number: t.reference,
            payment_date: t.date,
            amount: t.debit,
            notes: t.description,
            suppliers: selectedSupplier,
            party_id: selectedSupplierId,
            subType: 'supplier',
            payment_method: t.reference?.startsWith('CHQ') ? 'cheque' : 'cash'
          };
        }

        setPrintDoc({ type: 'payment', data: voucherData });
        setTimeout(() => {
          window.print();
          setPrintDoc(null);
          setPrintingDocId(null);
        }, 300);
        return;
      }

      // Default fallback print (return, debit note, manual entry)
      showToast('جاري تجهيز المستند للطباعة...', 'info');
      const fallbackDoc = {
        invoice_number: t.reference,
        invoice_date: t.date,
        total_amount: t.debit || t.credit,
        subtotal: t.debit || t.credit,
        paid_amount: 0,
        suppliers: selectedSupplier,
        notes: t.description,
        purchase_invoice_items: [
          {
            productName: t.description,
            quantity: 1,
            unit_price: t.debit || t.credit,
            total: t.debit || t.credit
          }
        ]
      };
      setPrintDoc({ type: 'invoice', data: fallbackDoc });
      setTimeout(() => {
        window.print();
        setPrintDoc(null);
        setPrintingDocId(null);
      }, 300);

    } catch (err: unknown) {
      logger.error('Error printing doc:', err);
      const errMsg = err instanceof Error ? err.message : String(err);
      showToast('تعذر طباعة المستند: ' + (errMsg || ''), 'error');
      setPrintingDocId(null);
    }
  };

  const handleExportExcel = () => {
    const data = [
        ['كشف حساب مورد'],
        ['المورد:', selectedSupplier?.name],
        ['من تاريخ:', startDate, 'إلى تاريخ:', endDate],
        [],
        ['التاريخ', 'المستند', 'البيان', 'مدين (سداد)', 'دائن (مشتريات)', 'الرصيد'],
        ['-', '-', 'رصيد افتتاحي', '-', '-', openingBalance],
        ...transactions.map(t => [t.date, t.reference, t.description, t.debit, t.credit, t.balance]),
        [],
        ['الإجمالي', '', 'إجمالي الحركات', totalDebit, totalCredit, closingBalance]
    ];
    const ws = XLSX.utils.aoa_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Statement");
    XLSX.writeFile(wb, `Supplier_Statement_${selectedSupplier?.name}.xlsx`);
  };

  const handleWhatsApp = () => {
      if (!selectedSupplier) return;
      const phone = selectedSupplier.phone;
      if (!phone) {
          showToast('لا يوجد رقم هاتف مسجل لهذا المورد', 'warning');
          return;
      }
      
      const message = `كشف حساب من ${settings.companyName}
المورد: ${selectedSupplier.name}
الفترة: ${startDate} إلى ${endDate}
رصيد افتتاحي: ${openingBalance.toLocaleString()}
إجمالي المدين (سداد): ${totalDebit.toLocaleString()}
إجمالي الدائن (مشتريات): ${totalCredit.toLocaleString()}
الرصيد الختامي المستحق: ${closingBalance.toLocaleString()}
شكراً لتعاملكم معنا.`;

      window.open(`https://wa.me/${phone}?text=${encodeURIComponent(message)}`, '_blank');
  };

  // 📄 تصفية وتقطيع الحركات وفق ترقيم الصفحات
  const totalPages = useMemo(() => {
    if (pageSize === 'all') return 1;
    return Math.max(1, Math.ceil(transactions.length / pageSize));
  }, [transactions.length, pageSize]);

  const displayedTransactions = useMemo(() => {
    if (pageSize === 'all') return transactions;
    const start = (currentPage - 1) * pageSize;
    return transactions.slice(start, start + pageSize);
  }, [transactions, currentPage, pageSize]);

  return (
    <div className="space-y-6 animate-in fade-in">
      {/* فرد طباعة المستندات المستقلة */}
      {printDoc?.type === 'invoice' && (
        <PurchaseInvoicePrint invoiceData={printDoc.data} companySettings={settings} />
      )}
      {printDoc?.type === 'payment' && (
        <PaymentVoucherPrint voucher={printDoc.data} companySettings={settings} />
      )}

      <div className="flex justify-between items-center print:hidden">
          <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
            <FileText className="text-emerald-600" /> كشف حساب مورد
          </h2>
          <div className="flex gap-2">
            <button onClick={handleWhatsApp} disabled={!selectedSupplierId} className="bg-emerald-500 text-white px-4 py-2 rounded-lg flex items-center gap-2 shadow-sm hover:bg-emerald-600 disabled:opacity-50">
                <MessageCircle size={18}/> واتساب
            </button>
            <button onClick={handleExportExcel} disabled={!selectedSupplierId} className="bg-emerald-600 text-white px-4 py-2 rounded-lg flex items-center gap-2 shadow-sm hover:bg-emerald-700 disabled:opacity-50">
                <Download size={18}/> تصدير Excel
            </button>
            <button onClick={() => window.print()} disabled={!selectedSupplierId} className="bg-slate-800 text-white px-4 py-2 rounded-lg flex items-center gap-2 shadow-sm hover:bg-slate-700 disabled:opacity-50">
                <Printer size={18}/> طباعة الكشف
            </button>
          </div>
      </div>

      <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 print:hidden grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="md:col-span-3">
            <SupplierSearchSelect
              value={selectedSupplierId}
              onChange={(id) => setSelectedSupplierId(id)}
              suppliers={suppliers}
              theme="emerald"
              showStatementButton={false}
              label="المورد المطلوب لعرض كشف الحساب"
              overrideBalance={loading ? undefined : closingBalance}
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-400 mb-1 uppercase">من تاريخ</label>
            <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="w-full border rounded-lg p-2 bg-slate-50" />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-400 mb-1 uppercase">إلى تاريخ</label>
            <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="w-full border rounded-lg p-2 bg-slate-50" />
          </div>
      </div>

      {selectedSupplierId && (
          <div id="printable-statement" className={`bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden p-8 animate-in fade-in ${printDoc ? 'print:hidden' : ''}`}>
              <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 border-b pb-6 gap-4">
                  <div>
                      <h1 className="text-2xl font-bold text-slate-900">{settings.companyName}</h1>
                      <p className="text-slate-500 font-bold mt-1">كشف حساب المورد: {selectedSupplier?.name}</p>
                      {selectedSupplier?.phone && <p className="text-xs text-slate-400">هاتف: {selectedSupplier.phone}</p>}
                      <p className="text-xs text-slate-400 mt-0.5">الفترة: من {startDate} إلى {endDate}</p>
                  </div>

                  {/* بطاقات الإجماليات الملخصة في أعلى الكشف */}
                  <div className="flex items-center gap-3 flex-wrap">
                      <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-2 rounded-xl text-center">
                        <span className="text-[10px] font-bold block uppercase tracking-wider">إجمالي المدين (سداد)</span>
                        <span className="text-lg font-black font-mono" dir="ltr">{totalDebit.toLocaleString()}</span>
                      </div>
                      <div className="bg-emerald-50 border border-emerald-200 text-emerald-700 px-4 py-2 rounded-xl text-center">
                        <span className="text-[10px] font-bold block uppercase tracking-wider">إجمالي الدائن (مشتريات)</span>
                        <span className="text-lg font-black font-mono" dir="ltr">{totalCredit.toLocaleString()}</span>
                      </div>
                      <div className="bg-emerald-600 text-white px-5 py-2.5 rounded-xl text-center shadow-md">
                        <span className="text-[10px] text-emerald-100 font-bold block uppercase tracking-wider">الرصيد النهائي المستحق</span>
                        <span className="text-xl font-black font-mono" dir="ltr">{closingBalance.toLocaleString()} {settings.currency}</span>
                      </div>
                  </div>
              </div>

              {loading ? (
                  <div className="py-12 text-center"><Loader2 className="animate-spin mx-auto text-emerald-600" size={32} /></div>
              ) : (
                <>
                  <table className="w-full text-right text-sm">
                      <thead className="bg-slate-100 border-y border-slate-200 text-slate-500 font-black uppercase">
                          <tr>
                              <th className="p-4">التاريخ</th>
                              <th className="p-4">المستند</th>
                              <th className="p-4">البيان</th>
                              <th className="p-4 text-center">مدين (سداد)</th>
                              <th className="p-4 text-center">دائن (مشتريات)</th>
                              <th className="p-4 text-center">سداد فوري</th>
                              <th className="p-4 text-center">الرصيد</th>
                              <th className="p-4 text-center print:hidden w-16">طباعة</th>
                          </tr>
                      </thead>
                        {/* 🖥️ جدول العرض التفاعلي على الشاشة (يدعم ترقيم الصفحات وسرعة التصفح) */}
                        <tbody className="divide-y divide-slate-100 print:hidden">
                            <tr className="bg-slate-50 font-bold text-slate-500">
                                <td colSpan={6} className="p-4">رصيد افتتاحي (ما قبل الفترة)</td>
                                <td className="p-4 text-center font-mono" dir="ltr">{openingBalance.toLocaleString()}</td>
                                <td className="p-4 print:hidden"></td>
                            </tr>
                            {displayedTransactions.map((t: Record<string, any>, idx) => (
                                <tr key={t.id || idx} className="hover:bg-slate-50 transition-colors">
                                    <td className="p-4 text-slate-500 whitespace-nowrap">{t.date}</td>
                                    <td className="p-4 font-mono font-bold text-emerald-600">
                                        {t.reference?.startsWith('OP-SUPP') ? 'رصيد افتتاحي' : t.reference?.replace(/^(CHQ-|PV-|PINV-|PUR-|PR-|DN-|JV-|SUB-BILL-|SUB-|OP-SUPP-|OP-)/i, '')}
                                    </td>
                                    <td className="p-4 text-slate-700 whitespace-pre-line">{t.description}</td>
                                    <td className="p-4 text-center font-bold text-red-600">{t.debit > 0 ? t.debit.toLocaleString() : '-'}</td>
                                    <td className="p-4 text-center font-bold text-emerald-600">{t.credit > 0 ? t.credit.toLocaleString() : '-'}</td>
                                    <td className="p-4 text-center font-bold text-blue-600">{(t.paid_amount || 0) > 0 ? t.paid_amount.toLocaleString() : '-'}</td>
                                    <td className="p-4 text-center font-mono font-black bg-slate-50/50" dir="ltr">{t.balance.toLocaleString()}</td>
                                    <td className="p-4 text-center print:hidden">
                                        <button
                                          type="button"
                                          onClick={() => handlePrintDoc(t as Transaction)}
                                          disabled={printingDocId === t.id}
                                          className="p-1.5 text-slate-400 hover:text-emerald-700 hover:bg-emerald-50 rounded-lg border border-slate-200 transition-all shadow-sm hover:scale-105 active:scale-95"
                                          title={`طباعة ${t.type === 'invoice' ? 'فاتورة المشتريات' : t.type === 'payment' ? 'سند الصرف' : t.type === 'return' ? 'مرتجع المشتريات' : 'المستند'}`}
                                        >
                                          {printingDocId === t.id ? (
                                            <Loader2 size={15} className="animate-spin text-emerald-600" />
                                          ) : (
                                            <Printer size={15} />
                                          )}
                                        </button>
                                    </td>
                                </tr>
                            ))}
                            {displayedTransactions.length === 0 && (
                                <tr><td colSpan={8} className="p-8 text-center text-slate-400">لا توجد حركات خلال هذه الفترة</td></tr>
                            )}
                        </tbody>

                        {/* 🖨️ جدول الطباعة الشامل لكافة الحركات بدون اقتطاع */}
                        <tbody className="divide-y divide-slate-100 hidden print:table-row-group">
                            <tr className="bg-slate-50 font-bold text-slate-500">
                                <td colSpan={6} className="p-4">رصيد افتتاحي (ما قبل الفترة)</td>
                                <td className="p-4 text-center font-mono" dir="ltr">{openingBalance.toLocaleString()}</td>
                            </tr>
                            {transactions.map((t: Record<string, any>, idx) => (
                                <tr key={t.id || idx}>
                                    <td className="p-4 text-slate-500 whitespace-nowrap">{t.date}</td>
                                    <td className="p-4 font-mono font-bold text-emerald-600">
                                        {t.reference?.startsWith('OP-SUPP') ? 'رصيد افتتاحي' : t.reference?.replace(/^(CHQ-|PV-|PINV-|PUR-|PR-|DN-|JV-|SUB-BILL-|SUB-|OP-SUPP-|OP-)/i, '')}
                                    </td>
                                    <td className="p-4 text-slate-700 whitespace-pre-line">{t.description}</td>
                                    <td className="p-4 text-center font-bold text-red-600">{t.debit > 0 ? t.debit.toLocaleString() : '-'}</td>
                                    <td className="p-4 text-center font-bold text-emerald-600">{t.credit > 0 ? t.credit.toLocaleString() : '-'}</td>
                                    <td className="p-4 text-center font-bold text-blue-600">{(t.paid_amount || 0) > 0 ? t.paid_amount.toLocaleString() : '-'}</td>
                                    <td className="p-4 text-center font-mono font-black" dir="ltr">{t.balance.toLocaleString()}</td>
                                </tr>
                            ))}
                        </tbody>

                        {/* 🌟 خانة جمع المدين وخانة جمع الدائن في نهاية الكشف (تظهر في الشاشة والطباعة) */}
                        <tfoot className="border-t-2 border-slate-300 font-bold bg-slate-100/90 text-sm">
                          <tr className="border-b border-slate-200">
                            <td colSpan={3} className="p-4 text-slate-900 font-black">
                              إجمالي حركات الفترة ({transactions.length} حركة)
                            </td>
                            <td className="p-4 text-center font-black text-red-600 bg-red-50/70 font-mono text-base" dir="ltr">
                              {totalDebit.toLocaleString()}
                            </td>
                            <td className="p-4 text-center font-black text-emerald-600 bg-emerald-50/70 font-mono text-base" dir="ltr">
                              {totalCredit.toLocaleString()}
                            </td>
                            <td className="p-4 text-center font-black text-blue-600 bg-blue-50/70 font-mono text-base" dir="ltr">
                              {totalPaidImmediate > 0 ? totalPaidImmediate.toLocaleString() : '-'}
                            </td>
                            <td className="p-4 text-center font-mono font-black text-slate-900 bg-slate-200/80 text-base" dir="ltr">
                              {closingBalance.toLocaleString()}
                            </td>
                            <td className="p-4 print:hidden"></td>
                          </tr>
                        </tfoot>
                    </table>

                    {/* 📄 شريط ترقيم صفحات كشف الحساب وتحديد عدد الحركات */}
                    {transactions.length > 0 && (
                      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 mt-6 pt-4 border-t border-slate-200 text-xs text-slate-600 font-bold print:hidden">
                        <div className="flex items-center gap-3">
                          <span>عرض</span>
                          <select
                            value={pageSize}
                            onChange={(e) => {
                              const val = e.target.value === 'all' ? 'all' : Number(e.target.value);
                              setPageSize(val);
                              setCurrentPage(1);
                            }}
                            className="bg-slate-50 border border-slate-300 rounded-lg px-2.5 py-1 text-slate-800 font-bold focus:outline-none focus:ring-2 focus:ring-emerald-500"
                          >
                            <option value={25}>25 حركة</option>
                            <option value={50}>50 حركة</option>
                            <option value={100}>100 حركة</option>
                            <option value="all">عرض الكل ({transactions.length})</option>
                          </select>
                          <span>
                            | حركة {pageSize === 'all' ? 1 : (currentPage - 1) * pageSize + 1} إلى {pageSize === 'all' ? transactions.length : Math.min(currentPage * pageSize, transactions.length)} من أصل {transactions.length}
                          </span>
                        </div>

                        {pageSize !== 'all' && totalPages > 1 && (
                          <div className="flex items-center gap-1.5" dir="ltr">
                            <button
                              onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                              disabled={currentPage === 1}
                              className="px-2.5 py-1 rounded-lg border border-slate-300 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1"
                            >
                              <ChevronLeft size={14} />
                              <span>السابق</span>
                            </button>
                            <span className="px-3 py-1 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-lg font-black font-mono">
                              {currentPage} / {totalPages}
                            </span>
                            <button
                              onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                              disabled={currentPage === totalPages}
                              className="px-2.5 py-1 rounded-lg border border-slate-300 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1"
                            >
                              <span>التالي</span>
                              <ChevronRight size={14} />
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                </>
              )}
              
              <div className="hidden print:block mt-20 pt-8 border-t border-slate-100 text-center text-slate-400 text-xs font-bold">
                {settings.footerText} | طُبع في {new Date().toLocaleString('ar-EG')}
              </div>
          </div>
      )}
    </div>
  );
};

export default SupplierStatement;

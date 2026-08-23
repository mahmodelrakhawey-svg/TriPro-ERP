import React, { useState, useEffect, useMemo } from 'react';
import { useAccounting } from '../../context/AccountingContext';
import { useToast } from '../../context/ToastContext';
import { supabase } from '../../supabaseClient';
import { 
  Scale, AlertTriangle, CheckCircle, Search, ArrowRight, 
  RefreshCw, Trash2, Plus, X, Users, BookOpen, 
  FileText, FileCheck, Download
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import * as XLSX from 'xlsx';
import { SubledgerRegistry } from '../../services/subledgerRegistry';

export const CustomerBalanceReconciliation: React.FC = () => {
  const { accounts, customers, getSystemAccount, settings, currentUser } = useAccounting();
  const navigate = useNavigate();
  const { showToast } = useToast();
  
  const [loading, setLoading] = useState(false);
  const [glBalance, setGlBalance] = useState(0);
  const [subLedgerBalance, setSubLedgerBalance] = useState(0);
  const [discrepancyEntries, setDiscrepancyEntries] = useState<any[]>([]);
  const [customerBalances, setCustomerBalances] = useState<any[]>([]);
  const [customerSearch, setCustomerSearch] = useState('');
  const [activeTab, setActiveTab] = useState<'overview' | 'discrepancies' | 'customers'>('overview');
  
  // تحديد حساب العملاء الرئيسي
  const customerAcc = getSystemAccount('CUSTOMERS');
  const customerAccountCode = customerAcc ? customerAcc.code : '1221';

  // حالة نافذة الإصلاح
  const [fixModalOpen, setFixModalOpen] = useState(false);
  const [entryToFix, setEntryToFix] = useState<any>(null);
  const [fixFormData, setFixFormData] = useState({
    customerId: '',
    treasuryAccountId: '',
    notes: ''
  });

  const treasuryAccounts = useMemo(() => 
    accounts.filter(a => !a.isGroup && (
      a.code.startsWith('123') || 
      a.code.startsWith('101') || 
      a.name.includes('صندوق') || 
      a.name.includes('خزينة') || 
      a.name.includes('بنك')
    )),
    [accounts]
  );

  const fetchReconciliation = async () => {
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const userOrgId = (currentUser as any)?.organization_id || session?.user?.user_metadata?.org_id;
      // ============================================================
      // الجزء الأول: رصيد الأستاذ العام (GL)
      // نأخذ فقط حساب العملاء المحدد (وليس كل الحسابات الفرعية)
      // ============================================================
      const customerAccounts = accounts.filter(a => 
        !a.isGroup && (
          a.code === customerAccountCode || 
          (customerAcc && a.id === customerAcc.id)
        )
      );
      let accountIds = customerAccounts.map(a => a.id);

      if (accountIds.length === 0) {
        const { data: dbAccs } = await supabase
          .from('accounts')
          .select('id, code, name')
          .eq('code', customerAccountCode);
        if (dbAccs && dbAccs.length > 0) {
          accountIds = dbAccs.map(a => a.id);
        }
      }

      if (accountIds.length === 0) {
        showToast('لم يتم العثور على حساب العملاء في دليل الحسابات', 'warning');
        setLoading(false);
        return;
      }

      const { data: glLines, error: glError } = await supabase
        .from('journal_lines')
        .select('id, debit, credit, description, account_id, journal_entries!inner(id, reference, transaction_date, description, status, related_document_id, related_document_type)')
        .in('account_id', accountIds)
        .eq('journal_entries.status', 'posted');

      if (glError) throw glError;

      let totalGlDebit = 0;
      let totalGlCredit = 0;
      const glEntriesMap = new Map<string, any>();

      // نفصل القيود الافتتاحية عن باقي القيود لمنع ازدواجية الحساب
      const openingEntryIds = new Set<string>();

      glLines?.forEach((line: any) => {
        const debitVal  = Number(line.debit  || 0);
        const creditVal = Number(line.credit || 0);
        totalGlDebit  += debitVal;
        totalGlCredit += creditVal;

        const ref      = (line.journal_entries?.reference || '').trim();
        const entryKey = line.journal_entries?.id;
        const desc     = `${line.description || ''} ${line.journal_entries?.description || ''}`.trim();
        const cleanRef = ref.toUpperCase();

        // نُعلِّم القيود الافتتاحية
        const isOpening = 
          cleanRef.startsWith('OP-') || 
          cleanRef.startsWith('OB-') || 
          cleanRef.startsWith('OPENING-') || 
          cleanRef.startsWith('OP-CUST-') ||
          desc.includes('رصيد افتتاحي') ||
          desc.includes('رصيد أول المدة');
        
        if (isOpening && entryKey) {
          openingEntryIds.add(entryKey);
        }

        if (!glEntriesMap.has(entryKey)) {
          glEntriesMap.set(entryKey, {
            id: line.id,
            journal_entries: line.journal_entries,
            debit: debitVal,
            credit: creditVal,
            description: desc,
            date: line.journal_entries?.transaction_date,
            ref,
            isOpening
          });
        } else {
          const ex = glEntriesMap.get(entryKey);
          ex.debit  += debitVal;
          ex.credit += creditVal;
          if (isOpening) ex.isOpening = true;
        }
      });

      // رصيد العملاء مدين بطبيعته
      const calculatedGlBalance = totalGlDebit - totalGlCredit;
      setGlBalance(calculatedGlBalance);

      // ============================================================
      // الجزء الثاني: رصيد الأستاذ المساعد (Sub-ledger)
      // جلب المديولات المسموحة للمنظمة من جدول organizations
      const { data: orgData } = await supabase
        .from('organizations')
        .select('allowed_modules')
        .eq('id', userOrgId)
        .maybeSingle();
      const allowedModules: string[] | undefined = orgData?.allowed_modules || undefined;

      const { data: customersList } = await supabase
        .from('customers')
        .select('id, name, phone, opening_balance')
        .is('deleted_at', null);

      // جلب المستندات الأساسية + المستندات الموديلية من مجمع الأستاذ المساعد
      const [
        invRes,
        recRes,
        retRes,
        cnRes,
        chqRes,
        ordRes,
        modularCustomerDocs
      ] = await Promise.all([
        supabase.from('invoices').select('id, customer_id, invoice_number, total_amount, paid_amount, related_journal_entry_id').not('status', 'in', '("draft","cancelled")'),
        supabase.from('receipt_vouchers').select('id, customer_id, voucher_number, amount, related_journal_entry_id'),
        supabase.from('sales_returns').select('id, customer_id, return_number, total_amount, related_journal_entry_id').not('status', 'in', '("draft","cancelled")'),
        supabase.from('credit_notes').select('id, customer_id, credit_note_number, total_amount, related_journal_entry_id').eq('status', 'posted'),
        supabase.from('cheques').select('id, party_id, party_name, cheque_number, amount, status, related_journal_entry_id').eq('type', 'incoming'),
        supabase.from('orders').select('id, customer_id, order_number, related_journal_entry_id').not('status', 'eq', 'CANCELLED'),
        SubledgerRegistry.fetchCustomerDocs(userOrgId, allowedModules)
      ]);

      // خريطة أسماء وأرقام هواتف العملاء للربط التلقائي
      const customerNameToIdMap = new Map<string, string>();
      const customerPhoneToIdMap = new Map<string, string>();
      customersList?.forEach(c => {
        if (c.name) {
          const norm = c.name.trim().toLowerCase().replace(/ى/g, 'ي').replace(/أ|إ|آ/g, 'ا').replace(/ة/g, 'ه');
          customerNameToIdMap.set(c.name.trim().toLowerCase(), c.id);
          customerNameToIdMap.set(norm, c.id);
        }
        if (c.phone) {
          const cleanP = c.phone.replace(/[^0-9]/g, '');
          if (cleanP) customerPhoneToIdMap.set(cleanP, c.id);
        }
      });

      // خريطة تربط كل قيد يومية أو مستند أو مرجع بالعميل المعني به
      const entryIdToCustomerId = new Map<string, string>();
      const docIdToCustomerId = new Map<string, string>();
      const refToCustomerId = new Map<string, string>();
      const subLedgerRefs = new Set<string>();

      const registerDoc = (docId: string | null | undefined, jeId: string | null | undefined, custId: string | null | undefined, ref?: string) => {
        if (custId) {
          if (docId) docIdToCustomerId.set(docId, custId);
          if (jeId) entryIdToCustomerId.set(jeId, custId);
          if (ref) {
            const clean = ref.trim().toUpperCase();
            subLedgerRefs.add(clean);
            refToCustomerId.set(clean, custId);
            const rawNum = clean.replace(/^(INV-|RV-|SR-|CN-|CHQ-|REJ-CHQ-|REJ-OUT-|REJ-|BILL-|CLAIM-|HIMS-|STD-|RENT-|BOOK-|TOURN-|PROG-)/i, '');
            if (rawNum) {
              refToCustomerId.set(rawNum, custId);
              refToCustomerId.set(`INV-${rawNum}`, custId);
              refToCustomerId.set(`RV-${rawNum}`, custId);
              refToCustomerId.set(`SR-${rawNum}`, custId);
              refToCustomerId.set(`CN-${rawNum}`, custId);
              refToCustomerId.set(`CHQ-${rawNum}`, custId);
              refToCustomerId.set(`REJ-CHQ-${rawNum}`, custId);
              refToCustomerId.set(`REJ-${rawNum}`, custId);
              refToCustomerId.set(`STD-${rawNum}`, custId);
            }
          }
        }
      };

      invRes.data?.forEach(i => registerDoc(i.id, i.related_journal_entry_id, i.customer_id, i.invoice_number));
      recRes.data?.forEach(r => registerDoc(r.id, r.related_journal_entry_id, r.customer_id, r.voucher_number));
      retRes.data?.forEach(r => registerDoc(r.id, r.related_journal_entry_id, r.customer_id, r.return_number));
      cnRes.data?.forEach(c => registerDoc(c.id, c.related_journal_entry_id, c.customer_id, c.credit_note_number));
      
      // ربط الشيكات بالعميل إما بالـ party_id أو بمطابقة party_name مع اسم العميل
      chqRes.data?.forEach(c => {
        let custId = c.party_id;
        if (!custId && c.party_name) {
          const pName = c.party_name.trim().toLowerCase().replace(/ى/g, 'ي').replace(/أ|إ|آ/g, 'ا').replace(/ة/g, 'ه');
          custId = customerNameToIdMap.get(pName) || customersList?.find(cust => {
            if (!cust.name) return false;
            const cNorm = cust.name.trim().toLowerCase().replace(/ى/g, 'ي').replace(/أ|إ|آ/g, 'ا').replace(/ة/g, 'ه');
            return cNorm.includes(pName) || pName.includes(cNorm) || 
                   cNorm.split(' ').some(w => w.length > 2 && pName.includes(w)) ||
                   pName.split(' ').some(w => w.length > 2 && cNorm.includes(w));
          })?.id;
        }
        registerDoc(c.id, c.related_journal_entry_id, custId, String(c.cheque_number));
      });
      
      ordRes.data?.forEach(o => registerDoc(o.id, o.related_journal_entry_id, o.customer_id, o.order_number));

      // ربط المستندات الواردة من مجمع الأستاذ المساعد للمديولات المفعلة
      modularCustomerDocs.forEach(doc => {
        let custId = doc.customerId;
        if (!custId && doc.customerName) {
          const pName = doc.customerName.trim().toLowerCase().replace(/ى/g, 'ي').replace(/أ|إ|آ/g, 'ا').replace(/ة/g, 'ه');
          custId = customerNameToIdMap.get(pName) || customersList?.find(cust => {
            if (!cust.name) return false;
            const cNorm = cust.name.trim().toLowerCase().replace(/ى/g, 'ي').replace(/أ|إ|آ/g, 'ا').replace(/ة/g, 'ه');
            return cNorm.includes(pName) || pName.includes(cNorm) || 
                   cNorm.split(' ').some(w => w.length > 2 && pName.includes(w)) ||
                   pName.split(' ').some(w => w.length > 2 && cNorm.includes(w));
          })?.id;
        }
        if (!custId && doc.customerPhone) {
          const cleanP = doc.customerPhone.replace(/[^0-9]/g, '');
          if (cleanP) custId = customerPhoneToIdMap.get(cleanP);
        }
        registerDoc(doc.docId, doc.journalEntryId, custId, doc.ref || undefined);
      });

      // ربط القيود اليدوية بأسماء العملاء
      customersList?.forEach(cust => {
        if (!cust.name) return;
        const custName = cust.name.trim().toLowerCase();
        glLines?.forEach((line: any) => {
          const jeId = line.journal_entries?.id;
          if (!jeId || entryIdToCustomerId.has(jeId)) return;
          const desc = `${line.description || ''} ${line.journal_entries?.description || ''}`.toLowerCase();
          const ref = (line.journal_entries?.reference || '').toLowerCase();
          if (desc.includes(custName) || ref.includes(cust.id.toLowerCase())) {
            entryIdToCustomerId.set(jeId, cust.id);
          }
        });
      });

      // حساب رصيد كل عميل من خلال قيود الأستاذ العام المرتبطة به
      const customerBreakdown = new Map<string, {
        grossInvoices: number,
        billingsTotal: number,
        invoiceImmediatePayments: number,
        returnsTotal: number,
        creditNotesTotal: number,
        receiptsTotal: number,
        chequesTotal: number,
        totalDebit: number,
        totalCredit: number
      }>();

      customersList?.forEach(c => {
        customerBreakdown.set(c.id, {
          grossInvoices: 0,
          billingsTotal: 0,
          invoiceImmediatePayments: 0,
          returnsTotal: 0,
          creditNotesTotal: 0,
          receiptsTotal: 0,
          chequesTotal: 0,
          totalDebit: 0,
          totalCredit: 0
        });
      });

      // تصنيف خطوط الأستاذ العام
      const matchedEntryIds = new Set<string>();

      glLines?.forEach((line: any) => {
        const jeId = line.journal_entries?.id;
        const docId = line.journal_entries?.related_document_id;
        const debit = Number(line.debit || 0);
        const credit = Number(line.credit || 0);
        const ref = (line.journal_entries?.reference || '').toUpperCase().trim();
        const desc = `${line.description || ''} ${line.journal_entries?.description || ''}`;

        // القيود الافتتاحية والإقفال
        if (openingEntryIds.has(jeId)) {
          matchedEntryIds.add(jeId);
          // إذا كان القيد الافتتاحي يخص عميلاً محدداً
          customersList?.forEach(c => {
            if (c.name && desc.includes(c.name)) {
              const b = customerBreakdown.get(c.id);
              if (b) {
                b.totalDebit += debit;
                b.totalCredit += credit;
              }
            }
          });
          return;
        }

        // استنتاج العميل من: ID القيد -> مستند الأصل -> المرجع -> الاسم في البيان
        let custId = entryIdToCustomerId.get(jeId);
        if (!custId && docId) {
          custId = docIdToCustomerId.get(docId);
        }
        if (!custId && ref) {
          custId = refToCustomerId.get(ref);
          if (!custId) {
            const rawNum = ref.replace(/^(INV-|RV-|SR-|CN-|CHQ-|REJ-CHQ-|REJ-OUT-|REJ-|BILL-|CLAIM-|HIMS-)/i, '');
            if (rawNum) {
              custId = refToCustomerId.get(rawNum) || refToCustomerId.get(`CHQ-${rawNum}`) || refToCustomerId.get(`REJ-CHQ-${rawNum}`);
            }
          }
        }
        if (!custId) {
          const lowerDesc = desc.toLowerCase().replace(/ى/g, 'ي').replace(/أ|إ|آ/g, 'ا').replace(/ة/g, 'ه');
          const matchedCust = customersList?.find(c => {
            if (!c.name) return false;
            const cNorm = c.name.toLowerCase().replace(/ى/g, 'ي').replace(/أ|إ|آ/g, 'ا').replace(/ة/g, 'ه');
            return lowerDesc.includes(cNorm) || cNorm.split(' ').some(w => w.length > 2 && lowerDesc.includes(w));
          });
          if (matchedCust) custId = matchedCust.id;
        }

        if (custId && customerBreakdown.has(custId)) {
          matchedEntryIds.add(jeId);
          const b = customerBreakdown.get(custId)!;
          b.totalDebit += debit;
          b.totalCredit += credit;

          if (ref.startsWith('INV-') || desc.includes('فاتورة مبيعات')) {
            b.grossInvoices += debit;
          } else if (ref.startsWith('SR-') || desc.includes('مرتجع')) {
            b.returnsTotal += credit;
          } else if (ref.startsWith('CN-') || desc.includes('إشعار دائن')) {
            b.creditNotesTotal += credit;
          } else if (ref.startsWith('CHQ-') || ref.startsWith('REJ-') || desc.includes('شيك') || desc.includes('ارتداد') || desc.includes('رفض')) {
            // شيكات واردة أو شيكات مرتدة (سداد - ارتداد)
            b.chequesTotal += (credit - debit);
          } else if (desc.includes('مستخلص') || ref.startsWith('BILL-') || /^\d+$/.test(ref)) {
            b.billingsTotal += debit;
          } else {
            b.receiptsTotal += (credit - debit);
          }
        }
      });

      let totalSubLedger = 0;
      const calculatedCustomerBalances: any[] = [];

      customersList?.forEach(customer => {
        const opening = Number(customer.opening_balance || 0);
        const b = customerBreakdown.get(customer.id) || {
          grossInvoices: 0,
          billingsTotal: 0,
          invoiceImmediatePayments: 0,
          returnsTotal: 0,
          creditNotesTotal: 0,
          receiptsTotal: 0,
          chequesTotal: 0,
          totalDebit: 0,
          totalCredit: 0
        };

        // الرصيد الصافي للعميل = المدين - الدائن من واقع القيود المرتبطة به
        const customerBalance = (b.totalDebit - b.totalCredit);

        totalSubLedger += customerBalance;

        calculatedCustomerBalances.push({
          id: customer.id,
          name: customer.name,
          phone: customer.phone,
          opening: opening,
          hasGlOpening: false,
          grossInvoices: b.grossInvoices,
          billingsTotal: b.billingsTotal,
          invoiceImmediatePayments: b.invoiceImmediatePayments,
          returnsTotal: b.returnsTotal,
          creditNotesTotal: b.creditNotesTotal,
          chequesTotal: b.chequesTotal,
          receiptsTotal: b.receiptsTotal,
          balance: customerBalance
        });
      });

      setSubLedgerBalance(totalSubLedger);
      setCustomerBalances(calculatedCustomerBalances);

      // ============================================================
      // الجزء الثالث: تحليل الفروقات — القيود في GL غير المربوطة بأي عميل
      // ============================================================
      const isRefMatched = (ref: string, desc: string, jeId: string, debit?: number, credit?: number): boolean => {
        if (!ref && !desc) return false;
        const cleanRef = (ref || '').trim().toUpperCase();
        const cleanDesc = (desc || '').trim();

        // القيد مربوط بعميل
        if (matchedEntryIds.has(jeId)) return true;

        // القيود الافتتاحية
        if (openingEntryIds.has(jeId)) return true;

        // قيود متساوية مدين ودائن (صافي صفر)
        if (debit && credit && Math.abs(debit - credit) < 0.01) return true;

        // بادئات الإقفال والافتتاح
        if (
          cleanRef.startsWith('CLOSE-') || cleanRef.startsWith('CLOSING-') ||
          cleanRef.startsWith('OPENING-') || cleanRef.startsWith('OB-') ||
          cleanRef.startsWith('OP-') || cleanRef.startsWith('OP-CUST-') ||
          cleanDesc.includes('رصيد افتتاحي') || cleanDesc.includes('رصيد أول المدة')
        ) return true;

        // فواتير المستشفيات (HIMS)
        if (
          cleanRef.startsWith('HIMS-') ||
          cleanDesc.includes('فاتورة علاج') ||
          cleanDesc.includes('تحميل المريض') ||
          cleanDesc.includes('إيراد خدمات طبية') ||
          cleanDesc.includes('إيراد عيادات')
        ) return true;

        // معاملات وعمليات مديول الاستاد الرياضي (Stadium Module)
        if (
          cleanRef.startsWith('STD-') ||
          cleanRef.startsWith('RENT-') ||
          cleanRef.startsWith('BOOK-') ||
          cleanRef.startsWith('TOURN-') ||
          cleanRef.startsWith('PROG-') ||
          cleanRef.startsWith('DISB-') ||
          cleanRef.startsWith('CUST-') ||
          cleanRef.startsWith('SETTL-') ||
          cleanRef.startsWith('MAINT-') ||
          cleanDesc.includes('استاد المنصورة') ||
          cleanDesc.includes('اشتراك عضو') ||
          cleanDesc.includes('تجديد اشتراك') ||
          cleanDesc.includes('حجز ملعب') ||
          cleanDesc.includes('دفعة إيجار') ||
          cleanDesc.includes('إيرادات الاشتراكات') ||
          cleanDesc.includes('إيرادات حجوزات') ||
          cleanDesc.includes('إيرادات الإيجارات') ||
          cleanDesc.includes('إيرادات الأكاديميات') ||
          cleanDesc.includes('رسوم برنامج تدريبي') ||
          cleanDesc.includes('اشتراك بطولة') ||
          cleanDesc.includes('مصروفات الاستاد') ||
          cleanDesc.includes('صيانة ملاعب') ||
          cleanDesc.includes('صرف طلب') ||
          cleanDesc.includes('عهدة نشاط') ||
          cleanDesc.includes('تسوية عهدة')
        ) return true;

        // شيكات مرتدة أو مستندات معروفة في خرائط المراجع
        if (refToCustomerId.has(cleanRef)) return true;
        const rawNum = cleanRef.replace(/^(INV-|RV-|SR-|CN-|CHQ-|REJ-CHQ-|REJ-OUT-|REJ-|BILL-|CLAIM-|HIMS-|STD-|RENT-|BOOK-|TOURN-|PROG-)/i, '');
        if (rawNum && refToCustomerId.has(rawNum)) return true;

        // فحص اسم أي عميل في البيان
        if (customersList?.some(c => c.name && cleanDesc.includes(c.name))) return true;

        return false;
      };

      const discrepancies: any[] = [];
      glEntriesMap.forEach((entry) => {
        const matched = isRefMatched(
          entry.ref,
          entry.description,
          entry.journal_entries?.id,
          entry.debit,
          entry.credit
        );
        if (!matched) discrepancies.push(entry);
      });

      setDiscrepancyEntries(discrepancies);

    } catch (error: any) {
      console.error('Error fetching customer reconciliation:', error);
      showToast('خطأ في جلب بيانات المطابقة: ' + (error.message || ''), 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteEntry = async (entryId: string) => {
    if (!window.confirm('هل أنت متأكد من حذف هذا القيد؟ لا يمكن التراجع عن هذا الإجراء.')) return;
    try {
      const { error } = await supabase.from('journal_entries').delete().eq('id', entryId);
      if (error) throw error;
      showToast('تم حذف القيد بنجاح.', 'success');
      fetchReconciliation();
    } catch (err: any) {
      showToast('فشل حذف القيد: ' + err.message, 'error');
    }
  };

  const [extractedCustomerName, setExtractedCustomerName] = useState('');

  const openFixModal = (entry: any) => {
    setEntryToFix(entry);
    const desc = entry.description || '';
    const match = desc.match(/العميل\s+([^\s]+)/i) || desc.match(/عميل\s+([^\s]+)/i) || desc.match(/من\s+([^\s]+)/i) || desc.match(/طرف\s+([^\s]+)/i);
    const extName = match ? match[1].trim() : '';
    setExtractedCustomerName(extName);

    const existing = customers.find(c => c.name && extName && c.name.trim().toLowerCase() === extName.toLowerCase());
    setFixFormData({ 
      customerId: existing ? existing.id : '', 
      treasuryAccountId: treasuryAccounts[0]?.id || '', 
      notes: entry.description || '' 
    });
    setFixModalOpen(true);
  };

  const handleQuickCreateCustomerAndFix = async (nameToCreate: string) => {
    if (!nameToCreate?.trim() || !entryToFix) return;
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const userOrgId = (currentUser as any)?.organization_id || session?.user?.user_metadata?.org_id;

      // 1. إنشاء العميل الجديد
      const { data: newCust, error: custErr } = await supabase
        .from('customers')
        .insert({
          name: nameToCreate.trim(),
          organization_id: userOrgId,
          opening_balance: 0
        })
        .select('id, name')
        .single();

      if (custErr || !newCust) throw custErr || new Error('فشل إنشاء العميل');

      // 2. ربط الشيك أو إنشاء سند قبض
      const isCheque = entryToFix.ref?.startsWith('CHQ-') || (entryToFix.description || '').includes('شيك');
      const jeId = entryToFix.journal_entries?.id || entryToFix.id;
      const rawNum = entryToFix.ref?.replace('CHQ-', '').trim();

      if (isCheque) {
        if (jeId) {
          await supabase.from('cheques').update({ party_id: newCust.id }).eq('related_journal_entry_id', jeId);
        }
        if (rawNum) {
          await supabase.from('cheques').update({ party_id: newCust.id }).eq('cheque_number', rawNum);
        }
      } else {
        await supabase.from('receipt_vouchers').insert({
          voucher_number: entryToFix.ref || `RV-FIX-${Date.now().toString().slice(-6)}`,
          voucher_date: entryToFix.date,
          amount: entryToFix.credit || entryToFix.debit,
          customer_id: newCust.id,
          treasury_account_id: fixFormData.treasuryAccountId || treasuryAccounts[0]?.id,
          notes: entryToFix.description,
          payment_method: 'cash'
        });
      }

      showToast(`تم إنشاء العميل «${newCust.name}» وربط القيد بنجاح ✅`, 'success');
      setFixModalOpen(false);
      fetchReconciliation();
    } catch (err: any) {
      showToast('خطأ: ' + err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleFixSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const isCheque  = entryToFix.ref?.startsWith('CHQ-') || (entryToFix.description || '').includes('شيك');
    if (!fixFormData.customerId || (!isCheque && !fixFormData.treasuryAccountId)) {
      showToast(isCheque ? 'الرجاء اختيار العميل' : 'الرجاء اختيار العميل وحساب الخزينة/البنك', 'warning');
      return;
    }
    try {
      const isReceipt = entryToFix.credit > 0;
      const amount    = isReceipt ? entryToFix.credit : entryToFix.debit;
      const jeId      = entryToFix.journal_entries?.id || entryToFix.id;
      const rawNum    = entryToFix.ref?.replace('CHQ-', '').trim();

      if (isReceipt) {
        if (isCheque) {
          // تحديث العميل في جدول الشيكات مباشرة لربطه دون تكرار القيد
          if (jeId) {
            await supabase.from('cheques').update({ party_id: fixFormData.customerId }).eq('related_journal_entry_id', jeId);
          }
          if (rawNum) {
            await supabase.from('cheques').update({ party_id: fixFormData.customerId }).eq('cheque_number', rawNum);
          }
          showToast('تم ربط الشيك بالعميل بنجاح ومطابقة الأستاذ المساعد ✅', 'success');
        } else {
          const { error } = await supabase.from('receipt_vouchers').insert({
            voucher_number:       entryToFix.ref || `RV-FIX-${Date.now().toString().slice(-6)}`,
            voucher_date:         entryToFix.date,
            amount,
            customer_id:          fixFormData.customerId,
            treasury_account_id:  fixFormData.treasuryAccountId,
            notes:                fixFormData.notes,
            payment_method:       'cash'
          });
          if (error) throw error;
          showToast('تم إنشاء سند القبض وربطه بالقيد بنجاح ✅', 'success');
        }
      } else {
        showToast('هذا القيد مدين — يمكنك ربطه كفاتورة مبيعات من شاشة الفواتير.', 'info');
        return;
      }
      setFixModalOpen(false);
      fetchReconciliation();
    } catch (err: any) {
      showToast('خطأ: ' + err.message, 'error');
    }
  };

  const exportCustomerBalances = () => {
    if (customerBalances.length === 0) return;
    const worksheet = XLSX.utils.json_to_sheet(customerBalances.map(c => ({
      'اسم العميل':            c.name,
      'رقم الهاتف':            c.phone || '-',
      'الرصيد الافتتاحي':      c.opening,
      'قيد افتتاحي في الأستاذ': c.hasGlOpening ? 'نعم' : 'لا',
      'إجمالي الفواتير':        c.grossInvoices,
      'مستخلصات مقاولات':      c.billingsTotal,
      'تحصيل فوري من الفواتير': c.invoiceImmediatePayments,
      'إجمالي المرتجعات':       c.returnsTotal,
      'الإشعارات الدائنة':      c.creditNotesTotal,
      'سندات القبض':           c.receiptsTotal,
      'الشيكات الواردة':        c.chequesTotal,
      'صافي المديونية':         c.balance
    })));
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'أرصدة العملاء');
    XLSX.writeFile(workbook, `Customer_Balances_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  useEffect(() => { fetchReconciliation(); }, [accounts]);

  const difference   = glBalance - subLedgerBalance;
  const isBalanced   = Math.abs(difference) < 1;

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
          <p className="text-slate-500 text-sm">مقارنة فورية بين رصيد دفتر الأستاذ العام (GL) وأرصدة كشوف حسابات العملاء — يشمل جميع المديولات (تجاري، مطعم، مصنع، مقاولات، مستشفيات)</p>
        </div>
        <button 
          onClick={fetchReconciliation} 
          disabled={loading}
          className="flex items-center gap-2 bg-white border border-slate-300 px-4 py-2.5 rounded-xl hover:bg-slate-50 font-bold text-slate-700 shadow-sm transition-all disabled:opacity-50"
        >
          <RefreshCw size={18} className={loading ? 'animate-spin text-emerald-600' : ''} /> تحديث المطابقة
        </button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
          <p className="text-xs font-bold text-slate-500 mb-1">رصيد دفتر الأستاذ العام (حساب {customerAccountCode})</p>
          <h3 className="text-3xl font-black text-slate-800 font-mono dir-ltr">
            {glBalance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </h3>
          <p className="text-[11px] text-slate-400 mt-2 flex items-center gap-1 font-bold">
            <BookOpen size={13} /> مجموع القيود المرحلة لحساب العملاء (مدين - دائن)
          </p>
        </div>

        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
          <p className="text-xs font-bold text-slate-500 mb-1">رصيد كشوف حسابات العملاء (الأستاذ المساعد)</p>
          <h3 className="text-3xl font-black text-emerald-600 font-mono dir-ltr">
            {subLedgerBalance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </h3>
          <p className="text-[11px] text-slate-400 mt-2 flex items-center gap-1 font-bold">
            <Users size={13} /> افتتاحي + فواتير + مستخلصات - تحصيل فوري - سندات - شيكات - مرتجعات - إشعارات
          </p>
        </div>

        <div className={`p-6 rounded-2xl shadow-sm border ${isBalanced ? 'bg-emerald-50 border-emerald-200' : 'bg-red-50 border-red-200'}`}>
          <p className={`text-xs font-bold mb-1 ${isBalanced ? 'text-emerald-700' : 'text-red-700'}`}>
            الفرق المتبقي (Discrepancy)
          </p>
          <h3 className={`text-3xl font-black font-mono dir-ltr ${isBalanced ? 'text-emerald-800' : 'text-red-800'}`}>
            {difference.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </h3>
          <div className="flex items-center gap-2 mt-2">
            {isBalanced 
              ? <CheckCircle size={16} className="text-emerald-600"/>
              : <AlertTriangle size={16} className="text-red-600"/>
            }
            <span className={`text-xs font-bold ${isBalanced ? 'text-emerald-700' : 'text-red-700'}`}>
              {isBalanced ? 'الحسابات متطابقة 100% ✅' : 'يوجد فرق يحتاج مراجعة ⚠️'}
            </span>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-200 gap-2 overflow-x-auto">
        {(['overview', 'discrepancies', 'customers'] as const).map(tab => {
          const labels: Record<string, string> = {
            overview:      'ملخص المطابقة',
            discrepancies: `القيود غير المربوطة (${discrepancyEntries.length})`,
            customers:     `كشف أرصدة العملاء (${customerBalances.length})`
          };
          const icons: Record<string, React.ReactNode> = {
            overview:      <Scale size={16} />,
            discrepancies: <AlertTriangle size={16} />,
            customers:     <Users size={16} />
          };
          return (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`pb-3 px-4 text-sm font-bold border-b-2 whitespace-nowrap transition-all flex items-center gap-2 ${
                activeTab === tab ? 'border-emerald-600 text-emerald-700' : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              {icons[tab]} {labels[tab]}
            </button>
          );
        })}
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
                  جميع فواتير المبيعات، مستخلصات المقاولات، التحصيل الفوري، سندات القبض، الشيكات الواردة، الإشعارات الدائنة، والأرصدة الافتتاحية مسجلة بدقة.
                </p>
              </div>
            ) : (
              <div className="p-6 bg-red-50 rounded-xl border border-red-200 space-y-3">
                <div className="flex items-center gap-3">
                  <AlertTriangle className="text-red-600" size={24} />
                  <h4 className="text-base font-black text-red-800">تنبيه: يوجد فرق محاسبي بقيمة {Math.abs(difference).toLocaleString()} {settings.currency || 'ج.م'}</h4>
                </div>
                <p className="text-sm text-red-700 leading-relaxed">
                  هذا الفرق ناتج عن قيود يومية على حساب العملاء دون مستند مبيعات/قبض مرتبط، أو أرصدة افتتاحية غير متوافقة. انتقل لتبويب <strong>«القيود غير المربوطة»</strong> لمعالجة الفروقات.
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

          {/* ملاحظة منهجية */}
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-sm text-blue-800 space-y-1">
            <p className="font-bold flex items-center gap-1"><FileText size={15} /> منهجية حساب الأستاذ المساعد</p>
            <p>رصيد العميل = الرصيد الافتتاحي + إجمالي فواتير البيع + مستخلصات المقاولات − التحصيل الفوري من الفواتير − سندات القبض − الشيكات الواردة − المرتجعات − الإشعارات الدائنة</p>
            <p className="text-blue-600 text-xs font-bold">ملاحظة: لا يُضاف الرصيد الافتتاحي إذا كان موجوداً بالفعل في الأستاذ العام بقيد OP-/OB-/OPENING-</p>
          </div>
        </div>
      )}

      {/* Tab 2: Discrepancies */}
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
                    <th className="p-3">المرجع</th>
                    <th className="p-3">البيان</th>
                    <th className="p-3 text-center">مدين</th>
                    <th className="p-3 text-center">دائن</th>
                    <th className="p-3 text-center">إجراء</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {discrepancyEntries.map((entry) => (
                    <tr key={entry.id} className="hover:bg-slate-50/70 transition-colors">
                      <td className="p-3 font-mono text-xs text-slate-500">{entry.date}</td>
                      <td className="p-3 font-mono font-bold text-slate-800">{entry.ref || 'قيد يدوي'}</td>
                      <td className="p-3 text-slate-700 font-medium text-xs max-w-xs truncate">{entry.description}</td>
                      <td className="p-3 text-center font-mono font-bold text-slate-800">
                        {entry.debit ? entry.debit.toLocaleString(undefined, {minimumFractionDigits: 2}) : '-'}
                      </td>
                      <td className="p-3 text-center font-mono font-bold text-emerald-700">
                        {entry.credit ? entry.credit.toLocaleString(undefined, {minimumFractionDigits: 2}) : '-'}
                      </td>
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

      {/* Tab 3: Customer Balances */}
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
                  <th className="p-3 text-center">افتتاحي</th>
                  <th className="p-3 text-center">إجمالي الفواتير</th>
                  <th className="p-3 text-center">تحصيل فوري</th>
                  <th className="p-3 text-center">مرتجعات+إشعارات</th>
                  <th className="p-3 text-center">سندات+شيكات</th>
                  <th className="p-3 text-center">صافي الرصيد</th>
                  <th className="p-3 text-center">كشف الحساب</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredCustomers.map((cust) => (
                  <tr key={cust.id} className="hover:bg-slate-50/70 transition-colors">
                    <td className="p-3">
                      <p className="font-bold text-slate-800">{cust.name}</p>
                      {cust.phone && <p className="text-xs text-slate-400 font-mono">{cust.phone}</p>}
                      {cust.hasGlOpening && (
                        <span className="text-[10px] bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded font-bold">قيد افتتاحي في GL</span>
                      )}
                    </td>
                    <td className="p-3 text-center font-mono text-slate-600">
                      {cust.opening.toLocaleString(undefined, {minimumFractionDigits: 2})}
                    </td>
                    <td className="p-3 text-center font-mono font-bold text-slate-800">
                      {(cust.grossInvoices + cust.billingsTotal).toLocaleString(undefined, {minimumFractionDigits: 2})}
                    </td>
                    <td className="p-3 text-center font-mono text-blue-600">
                      {cust.invoiceImmediatePayments > 0 
                        ? `(${cust.invoiceImmediatePayments.toLocaleString(undefined, {minimumFractionDigits: 2})})` 
                        : '-'}
                    </td>
                    <td className="p-3 text-center font-mono text-amber-600">
                      {(cust.returnsTotal + cust.creditNotesTotal) > 0
                        ? `(${(cust.returnsTotal + cust.creditNotesTotal).toLocaleString(undefined, {minimumFractionDigits: 2})})`
                        : '-'}
                    </td>
                    <td className="p-3 text-center font-mono text-emerald-600">
                      {(cust.receiptsTotal + cust.chequesTotal) > 0
                        ? `(${(cust.receiptsTotal + cust.chequesTotal).toLocaleString(undefined, {minimumFractionDigits: 2})})`
                        : '-'}
                    </td>
                    <td className="p-3 text-center font-mono font-black text-slate-900" dir="ltr">
                      <span className={`px-2 py-0.5 rounded text-xs font-black ${
                        cust.balance > 0.01  ? 'bg-red-50 text-red-700' : 
                        cust.balance < -0.01 ? 'bg-emerald-50 text-emerald-700' : 
                        'bg-slate-100 text-slate-500'
                      }`}>
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
              <button onClick={() => setFixModalOpen(false)} className="text-slate-400 hover:text-slate-600"><X size={18} /></button>
            </div>

            <form onSubmit={handleFixSubmit} className="space-y-4">
              <div className="p-3 bg-slate-50 rounded-xl space-y-1 text-xs">
                <div className="flex justify-between">
                  <span className="text-slate-500">رقم القيد:</span>
                  <span className="font-mono font-bold">{entryToFix.ref || 'بدون مرجع'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">المبلغ الدائن:</span>
                  <span className="font-mono font-bold text-emerald-600 text-sm">{entryToFix.credit.toLocaleString()} {settings.currency || 'ج.م'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">البيان:</span>
                  <span className="font-medium text-slate-700 text-right max-w-xs">{entryToFix.description}</span>
                </div>
              </div>

              {extractedCustomerName && !customers.some(c => c.name?.trim().toLowerCase() === extractedCustomerName.toLowerCase()) && (
                <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl space-y-2">
                  <div className="text-xs text-emerald-800 font-bold flex items-center gap-1.5">
                    <AlertTriangle size={15} className="text-emerald-600" />
                    الطرف «{extractedCustomerName}» غير مسجل في قائمة العملاء الحالية.
                  </div>
                  <button
                    type="button"
                    onClick={() => handleQuickCreateCustomerAndFix(extractedCustomerName)}
                    className="w-full bg-emerald-600 text-white font-bold text-xs py-2 px-3 rounded-lg hover:bg-emerald-700 transition-colors shadow-sm flex items-center justify-center gap-1.5"
                  >
                    <Plus size={14} /> إضافة «{extractedCustomerName}» كعميل جديد وربط القيد فوراً
                  </button>
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">أو اختر عميل موجود <span className="text-red-500">*</span></label>
                <select
                  required
                  className="w-full border rounded-xl p-2.5 bg-slate-50 text-sm font-bold outline-none focus:border-emerald-500"
                  value={fixFormData.customerId}
                  onChange={e => setFixFormData({...fixFormData, customerId: e.target.value})}
                >
                  <option value="">-- اختر العميل --</option>
                  {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>

              {entryToFix.ref?.startsWith('CHQ-') || (entryToFix.description || '').includes('شيك') ? (
                <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl text-xs text-blue-800 space-y-1">
                  <p className="font-bold flex items-center gap-1.5">
                    <CheckCircle size={15} className="text-blue-600" />
                    شيك وارد مسجل مسبقاً بالأستاذ العام
                  </p>
                  <p className="leading-relaxed">
                    <strong>لن يتم إنشاء أي قيد محاسبي جديد</strong> (منعاً للازدواجية وتكرار المبالغ) — الربط سيقوم فقط بتعيين العميل للشيك ليظهر ضمن كشف حسابه ومطابقة الرصيد فوراً.
                  </p>
                </div>
              ) : (
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">حساب الخزينة / البنك <span className="text-red-500">*</span></label>
                  <select
                    required
                    className="w-full border rounded-xl p-2.5 bg-slate-50 text-sm font-bold outline-none focus:border-emerald-500"
                    value={fixFormData.treasuryAccountId}
                    onChange={e => setFixFormData({...fixFormData, treasuryAccountId: e.target.value})}
                  >
                    {treasuryAccounts.map(a => <option key={a.id} value={a.id}>{a.name} ({a.code})</option>)}
                  </select>
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">ملاحظات</label>
                <input
                  type="text"
                  className="w-full border rounded-xl p-2.5 bg-slate-50 text-sm outline-none focus:border-emerald-500"
                  value={fixFormData.notes}
                  onChange={e => setFixFormData({...fixFormData, notes: e.target.value})}
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                <button type="button" onClick={() => setFixModalOpen(false)} className="px-4 py-2 bg-slate-100 text-slate-700 font-bold rounded-xl text-xs hover:bg-slate-200">إلغاء</button>
                <button type="submit" className="px-5 py-2 bg-emerald-600 text-white font-bold rounded-xl text-xs hover:bg-emerald-700 shadow-sm">
                  {entryToFix.ref?.startsWith('CHQ-') ? 'ربط الشيك بالعميل' : 'إنشاء وربط السند'}
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

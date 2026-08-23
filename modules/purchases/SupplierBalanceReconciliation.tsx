import React, { useState, useEffect, useMemo } from 'react';
import { useAccounting } from '../../context/AccountingContext';
import { useToast } from '../../context/ToastContext';
import { supabase } from '../../supabaseClient';
import { 
  Scale, AlertTriangle, CheckCircle, Search, ArrowRight, 
  RefreshCw, Trash2, Plus, X, Truck, BookOpen, 
  FileText, FileCheck, Download, HardHat
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import * as XLSX from 'xlsx';
import { SubledgerRegistry } from '../../services/subledgerRegistry';

export const SupplierBalanceReconciliation: React.FC = () => {
  const { accounts, suppliers, getSystemAccount, settings, currentUser } = useAccounting();
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
  
  // تحديد حساب الموردين الرئيسي
  const supplierAcc = getSystemAccount('SUPPLIERS');
  const supplierAccountCode = supplierAcc ? supplierAcc.code : '221';

  // حالة نافذة الإصلاح
  const [fixModalOpen, setFixModalOpen] = useState(false);
  const [entryToFix, setEntryToFix] = useState<any>(null);
  const [fixFormData, setFixFormData] = useState({
    supplierId: '',
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
      // الجزء الأول: رصيد الأستاذ العام (GL) لحساب الموردين
      // ============================================================
      const supplierAccounts = accounts.filter(a =>
        !a.isGroup && (
          a.code === supplierAccountCode ||
          (supplierAcc && a.id === supplierAcc.id)
        )
      );
      let accountIds = supplierAccounts.map(a => a.id);

      if (accountIds.length === 0) {
        const { data: dbAccs } = await supabase
          .from('accounts')
          .select('id, code, name')
          .or(`code.eq.${supplierAccountCode},code.eq.201,code.eq.2101`);
        if (dbAccs && dbAccs.length > 0) {
          accountIds = dbAccs.map(a => a.id);
        }
      }

      if (accountIds.length === 0) {
        showToast('لم يتم العثور على حساب الموردين في دليل الحسابات', 'warning');
        setLoading(false);
        return;
      }

      const { data: glLines, error: glError } = await supabase
        .from('journal_lines')
        .select('id, debit, credit, description, account_id, journal_entries!inner(id, reference, transaction_date, description, status, related_document_id, related_document_type)')
        .in('account_id', accountIds)
        .eq('journal_entries.status', 'posted');

      if (glError) throw glError;

      let totalGlDebit  = 0;
      let totalGlCredit = 0;
      const glEntriesMap = new Map<string, any>();

      // نُعلِّم القيود الافتتاحية
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

        const isOpening =
          cleanRef.startsWith('OP-')      || cleanRef.startsWith('OB-')      ||
          cleanRef.startsWith('OPENING-') || cleanRef.startsWith('OP-SUP-')  ||
          cleanRef.startsWith('OP-SUPP-') ||
          desc.includes('رصيد افتتاحي')   || desc.includes('رصيد أول المدة');

        if (isOpening && entryKey) openingEntryIds.add(entryKey);

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

      // رصيد الموردين دائن بطبيعته
      const calculatedGlBalance = totalGlCredit - totalGlDebit;
      setGlBalance(calculatedGlBalance);

      // ============================================================
      // جلب المديولات المسموحة للمنظمة من جدول organizations
      const { data: orgData } = await supabase
        .from('organizations')
        .select('allowed_modules')
        .eq('id', userOrgId)
        .maybeSingle();
      const allowedModules: string[] | undefined = orgData?.allowed_modules || undefined;

      const { data: suppliersList } = await supabase
        .from('suppliers')
        .select('id, name, phone, opening_balance')
        .is('deleted_at', null);

      // جلب المستندات الأساسية + المستندات الموديلية من مجمع الأستاذ المساعد
      const [
        invRes,       // فواتير المشتريات
        retRes,       // مرتجعات المشتريات
        dnRes,        // الإشعارات المدينة
        pvRes,        // سندات الصرف
        chqRes,       // الشيكات الصادرة
        subBillRes,   // مستخلصات مقاولي الباطن (للعرض في التبويب)
        modularSupplierDocs // المستندات الموديلية المفعلة
      ] = await Promise.all([
        supabase
          .from('purchase_invoices')
          .select('id, supplier_id, invoice_number, total_amount, paid_amount, treasury_account_id, related_journal_entry_id, status')
          .not('status', 'in', '("draft","cancelled")'),

        supabase
          .from('purchase_returns')
          .select('id, supplier_id, return_number, total_amount, related_journal_entry_id, status')
          .not('status', 'in', '("draft","cancelled")'),

        supabase
          .from('debit_notes')
          .select('id, supplier_id, debit_note_number, total_amount, related_journal_entry_id, status')
          .eq('status', 'posted'),

        supabase
          .from('payment_vouchers')
          .select('id, supplier_id, voucher_number, amount, payment_method, related_journal_entry_id')
          .not('supplier_id', 'is', null),

        supabase
          .from('cheques')
          .select('id, party_id, party_name, cheque_number, amount, status, related_journal_entry_id')
          .eq('type', 'outgoing'),

        // مستخلصات مقاولي الباطن للتبويب المنفصل
        supabase
          .from('subcontractor_billings')
          .select(`
            id,
            billing_number,
            net_amount,
            gross_amount,
            status,
            billing_date,
            related_journal_entry_id,
            subcontractor_contracts (
              subcontractor_id,
              subcontractors ( id, name, supplier_id )
            )
          `)
          .not('status', 'in', '("draft","cancelled")'),

        SubledgerRegistry.fetchSupplierDocs(userOrgId, allowedModules)
      ]);

      // خريطة أسماء الموردين للربط التلقائي
      const supplierNameToIdMap = new Map<string, string>();
      suppliersList?.forEach(s => {
        if (s.name) {
          const norm = s.name.trim().toLowerCase().replace(/ى/g, 'ي').replace(/أ|إ|آ/g, 'ا').replace(/ة/g, 'ه');
          supplierNameToIdMap.set(s.name.trim().toLowerCase(), s.id);
          supplierNameToIdMap.set(norm, s.id);
        }
      });

      const subToSupplierMap = new Map<string, string>();
      const subNameToSupplierMap = new Map<string, string>();

      // بناء خريطة الربط بين مقاولي الباطن والموردين
      (chqRes as any); // Type safety
      const subcontractorsList = (subBillRes as any).data ? (await supabase.from('subcontractors').select('id, name, supplier_id')).data : [];
      
      subcontractorsList?.forEach((sub: any) => {
        if (sub.supplier_id) {
          subToSupplierMap.set(sub.id, sub.supplier_id);
        }
        if (sub.name) {
          const matchedSupplier = suppliersList?.find(s => 
            s.name && (s.name.trim().toLowerCase() === sub.name.trim().toLowerCase() || s.name.includes(sub.name) || sub.name.includes(s.name))
          );
          if (matchedSupplier) {
            subToSupplierMap.set(sub.id, matchedSupplier.id);
            subNameToSupplierMap.set(sub.name.trim().toLowerCase(), matchedSupplier.id);
          }
        }
      });

      // ============================================================
      // معالجة مستخلصات مقاولي الباطن
      // ============================================================
      let subBillingsNormalized: any[] = [];
      if (!subBillRes.error && subBillRes.data) {
        subBillingsNormalized = subBillRes.data.map((sb: any) => {
          const rawSub = sb.subcontractor_contracts?.subcontractors;
          const subId = sb.subcontractor_contracts?.subcontractor_id || rawSub?.id;
          const mappedSupplierId = (subId ? subToSupplierMap.get(subId) : null) || rawSub?.supplier_id || null;
          return {
            id:                       sb.id,
            billing_number:           sb.billing_number,
            net_amount:               Number(sb.net_amount  || 0),
            gross_amount:             Number(sb.gross_amount || 0),
            status:                   sb.status,
            issue_date:               sb.billing_date,
            related_journal_entry_id: sb.related_journal_entry_id,
            subcontractor_id:         subId,
            subcontractor_name:       rawSub?.name || '-',
            supplier_id:              mappedSupplierId
          };
        });
      } else {
        const { data: basicBillings } = await supabase
          .from('subcontractor_billings')
          .select('id, billing_number, net_amount, gross_amount, status, billing_date, related_journal_entry_id')
          .not('status', 'in', '("draft","cancelled")');
        if (basicBillings) {
          subBillingsNormalized = basicBillings.map((sb: any) => ({
            id:                       sb.id,
            billing_number:           sb.billing_number,
            net_amount:               Number(sb.net_amount  || 0),
            gross_amount:             Number(sb.gross_amount || 0),
            status:                   sb.status,
            issue_date:               sb.billing_date,
            related_journal_entry_id: sb.related_journal_entry_id,
            subcontractor_id:         null,
            subcontractor_name:       '-',
            supplier_id:              null
          }));
        }
      }
      setSubcontractorBillings(subBillingsNormalized);

      // ============================================================
      // بناء خريطة لربط كل قيد يومية أو مرجع بالمورد المعني
      // ============================================================
      const entryIdToSupplierId = new Map<string, string>();
      const docIdToSupplierId = new Map<string, string>();
      const refToSupplierId = new Map<string, string>();
      const subLedgerRefs = new Set<string>();

      const registerDoc = (docId: string | null | undefined, jeId: string | null | undefined, suppId: string | null | undefined, ref?: string) => {
        if (suppId) {
          if (docId) docIdToSupplierId.set(docId, suppId);
          if (jeId) entryIdToSupplierId.set(jeId, suppId);
          if (ref) {
            const clean = ref.trim().toUpperCase();
            refToSupplierId.set(clean, suppId);
            // إضافة بدائل البادئات الشائعة
            const rawNum = clean.replace(/^(PUR-|PI-|PV-|PR-|DN-|SUB-BILL-|SUB-|CHQ-|REJ-OUT-|REJ-CHQ-|REJ-|DISB-|CUST-|SETTL-|MAINT-|STD-)/i, '');
            if (rawNum) {
              refToSupplierId.set(rawNum, suppId);
              refToSupplierId.set(`PUR-${rawNum}`, suppId);
              refToSupplierId.set(`PI-${rawNum}`, suppId);
              refToSupplierId.set(`SUB-BILL-${rawNum}`, suppId);
              refToSupplierId.set(`SUB-${rawNum}`, suppId);
              refToSupplierId.set(`PV-${rawNum}`, suppId);
              refToSupplierId.set(`CHQ-${rawNum}`, suppId);
              refToSupplierId.set(`REJ-OUT-${rawNum}`, suppId);
              refToSupplierId.set(`REJ-CHQ-${rawNum}`, suppId);
              refToSupplierId.set(`DISB-${rawNum}`, suppId);
            }
          }
        }
        if (ref) subLedgerRefs.add(ref.trim().toUpperCase());
      };

      invRes.data?.forEach(i => registerDoc(i.id, i.related_journal_entry_id, i.supplier_id, i.invoice_number));
      retRes.data?.forEach(r => registerDoc(r.id, r.related_journal_entry_id, r.supplier_id, r.return_number));
      dnRes.data?.forEach(d => registerDoc(d.id, d.related_journal_entry_id, d.supplier_id, d.debit_note_number));
      pvRes.data?.forEach(p => registerDoc(p.id, p.related_journal_entry_id, p.supplier_id, p.voucher_number));
      
      // ربط الشيكات بالـ party_id أو بمطابقة party_name مع اسم المورد
      chqRes.data?.forEach(c => {
        let suppId = c.party_id;
        if (!suppId && c.party_name) {
          const pName = c.party_name.trim().toLowerCase().replace(/ى/g, 'ي').replace(/أ|إ|آ/g, 'ا').replace(/ة/g, 'ه');
          suppId = supplierNameToIdMap.get(pName) || suppliersList?.find(s => {
            if (!s.name) return false;
            const sNorm = s.name.trim().toLowerCase().replace(/ى/g, 'ي').replace(/أ|إ|آ/g, 'ا').replace(/ة/g, 'ه');
            return sNorm.includes(pName) || pName.includes(sNorm) || 
                   sNorm.split(' ').some(w => w.length > 2 && pName.includes(w)) ||
                   pName.split(' ').some(w => w.length > 2 && sNorm.includes(w));
          })?.id;
        }
        registerDoc(c.id, c.related_journal_entry_id, suppId, String(c.cheque_number));
      });

      // ربط مستندات الموردين الواردة من مجمع الأستاذ المساعد للمديولات المفعلة
      modularSupplierDocs.forEach(doc => {
        let suppId = doc.supplierId;
        if (!suppId && doc.supplierName) {
          const pName = doc.supplierName.trim().toLowerCase().replace(/ى/g, 'ي').replace(/أ|إ|آ/g, 'ا').replace(/ة/g, 'ه');
          suppId = supplierNameToIdMap.get(pName) || suppliersList?.find(s => {
            if (!s.name) return false;
            const sNorm = s.name.trim().toLowerCase().replace(/ى/g, 'ي').replace(/أ|إ|آ/g, 'ا').replace(/ة/g, 'ه');
            return sNorm.includes(pName) || pName.includes(sNorm) || 
                   sNorm.split(' ').some(w => w.length > 2 && pName.includes(w)) ||
                   pName.split(' ').some(w => w.length > 2 && sNorm.includes(w));
          })?.id;
        }
        registerDoc(doc.docId, doc.journalEntryId, suppId, doc.ref || undefined);
      });

      // ربط مستخلصات مقاولي الباطن بالموردين
      subBillingsNormalized.forEach(sb => {
        const suppId = sb.supplier_id || (sb.subcontractor_name ? subNameToSupplierMap.get(sb.subcontractor_name.trim().toLowerCase()) : null);
        registerDoc(sb.id, sb.related_journal_entry_id, suppId, sb.billing_number);
        registerDoc(sb.id, sb.related_journal_entry_id, suppId, `SUB-BILL-${sb.billing_number}`);
      });

      // ربط القيود اليدوية بأسماء الموردين أو مقاولي الباطن
      suppliersList?.forEach(supp => {
        if (!supp.name) return;
        const suppName = supp.name.trim().toLowerCase();
        glLines?.forEach((line: any) => {
          const jeId = line.journal_entries?.id;
          if (!jeId || entryIdToSupplierId.has(jeId)) return;
          const desc = `${line.description || ''} ${line.journal_entries?.description || ''}`.toLowerCase();
          const ref = (line.journal_entries?.reference || '').toLowerCase();
          if (desc.includes(suppName) || ref.includes(supp.id.toLowerCase())) {
            entryIdToSupplierId.set(jeId, supp.id);
          }
        });
      });

      // حساب رصيد كل مورد من خلال قيود الأستاذ العام المرتبطة به
      const supplierBreakdown = new Map<string, {
        grossInvoices: number,
        subBillingsForSupplier: number,
        invoiceImmediatePayments: number,
        returnsTotal: number,
        debitNotesTotal: number,
        paymentsTotal: number,
        chequesTotal: number,
        totalDebit: number,
        totalCredit: number
      }>();

      suppliersList?.forEach(s => {
        supplierBreakdown.set(s.id, {
          grossInvoices: 0,
          subBillingsForSupplier: 0,
          invoiceImmediatePayments: 0,
          returnsTotal: 0,
          debitNotesTotal: 0,
          paymentsTotal: 0,
          chequesTotal: 0,
          totalDebit: 0,
          totalCredit: 0
        });
      });

      const matchedEntryIds = new Set<string>();

      glLines?.forEach((line: any) => {
        const jeId = line.journal_entries?.id;
        const docId = line.journal_entries?.related_document_id;
        const debit = Number(line.debit || 0);
        const credit = Number(line.credit || 0);
        const ref = (line.journal_entries?.reference || '').trim().toUpperCase();
        const desc = `${line.description || ''} ${line.journal_entries?.description || ''}`;

        // القيود الافتتاحية والإقفال
        if (openingEntryIds.has(jeId)) {
          matchedEntryIds.add(jeId);
          suppliersList?.forEach(s => {
            if (s.name && desc.includes(s.name)) {
              const b = supplierBreakdown.get(s.id);
              if (b) {
                b.totalCredit += credit;
                b.totalDebit += debit;
              }
            }
          });
          return;
        }

        // استنتاج المورد من: ID القيد -> مستند الأصل -> المرجع -> الاسم في البيان
        let suppId = entryIdToSupplierId.get(jeId);
        if (!suppId && docId) {
          suppId = docIdToSupplierId.get(docId);
        }
        if (!suppId && ref) {
          suppId = refToSupplierId.get(ref);
          if (!suppId) {
            const rawRef = ref.replace(/^(PUR-|PI-|PV-|PR-|DN-|SUB-BILL-|SUB-|CHQ-|REJ-OUT-|REJ-CHQ-|REJ-|DISB-|CUST-|SETTL-|MAINT-|STD-|REQ-)/i, '');
            if (rawRef) {
              suppId = refToSupplierId.get(rawRef) || refToSupplierId.get(`PV-${rawRef}`) || refToSupplierId.get(`CHQ-${rawRef}`) || refToSupplierId.get(`DISB-${rawRef}`);
            }
          }
        }

        if (!suppId) {
          const lowerDesc = desc.toLowerCase();
          const matchedSupp = suppliersList?.find(s => {
            if (!s.name) return false;
            const sName = s.name.trim().toLowerCase();
            return lowerDesc.includes(sName) || (sName.length > 3 && sName.split(' ').some(w => w.length > 3 && lowerDesc.includes(w)));
          });
          if (matchedSupp) suppId = matchedSupp.id;
        }

        if (suppId && supplierBreakdown.has(suppId)) {
          matchedEntryIds.add(jeId);
          const b = supplierBreakdown.get(suppId)!;
          b.totalCredit += credit;
          b.totalDebit += debit;

          if (ref.startsWith('PUR-') || ref.startsWith('PI-') || desc.includes('مشتريات') || desc.includes('فاتورة مشتريات')) {
            b.grossInvoices += credit;
          } else if (ref.startsWith('PR-') || desc.includes('مرتجع مشتريات')) {
            b.returnsTotal += debit;
          } else if (ref.startsWith('DN-') || desc.includes('إشعار مدين')) {
            b.debitNotesTotal += debit;
          } else if (ref.startsWith('CHQ-') || ref.startsWith('REJ-') || desc.includes('شيك') || desc.includes('ارتداد') || desc.includes('رفض')) {
            b.chequesTotal += (debit - credit);
          } else if (desc.includes('مستخلص') || ref.startsWith('SUB-') || /^\d+$/.test(ref)) {
            b.subBillingsForSupplier += credit;
          } else {
            b.paymentsTotal += (debit - credit);
          }
        }
      });

      let totalSubLedger = 0;
      const calculatedSupplierBalances: any[] = [];

      suppliersList?.forEach(supplier => {
        const opening = Number(supplier.opening_balance || 0);
        const b = supplierBreakdown.get(supplier.id) || {
          grossInvoices: 0,
          subBillingsForSupplier: 0,
          invoiceImmediatePayments: 0,
          returnsTotal: 0,
          debitNotesTotal: 0,
          paymentsTotal: 0,
          chequesTotal: 0,
          totalDebit: 0,
          totalCredit: 0
        };

        // الرصيد الصافي للمورد = الدائن - المدين من واقع القيود المرتبطة به
        const supplierBalance = (b.totalCredit - b.totalDebit);

        totalSubLedger += supplierBalance;

        calculatedSupplierBalances.push({
          id: supplier.id,
          name: supplier.name,
          phone: supplier.phone,
          opening: opening,
          hasGlOpening: false,
          grossInvoices: b.grossInvoices,
          subBillingsForSupplier: b.subBillingsForSupplier,
          invoiceImmediatePayments: b.invoiceImmediatePayments,
          returnsTotal: b.returnsTotal,
          debitNotesTotal: b.debitNotesTotal,
          paymentsTotal: b.paymentsTotal,
          chequesTotal: b.chequesTotal,
          balance: supplierBalance
        });
      });

      setSubLedgerBalance(totalSubLedger);
      setSupplierBalances(calculatedSupplierBalances);

      // ============================================================
      // الجزء الثالث: تحليل الفروقات — القيود في GL غير المربوطة بأي مورد
      // ============================================================
      const isRefMatched = (ref: string, desc: string, jeId: string): boolean => {
        if (!ref && !desc) return false;
        const cleanRef = (ref || '').trim().toUpperCase();
        const cleanDesc = (desc || '').trim();

        if (matchedEntryIds.has(jeId)) return true;
        if (openingEntryIds.has(jeId)) return true;

        if (
          cleanRef.startsWith('CLOSE-') || cleanRef.startsWith('CLOSING-') ||
          cleanRef.startsWith('OPENING-') || cleanRef.startsWith('OB-') ||
          cleanRef.startsWith('OP-') || cleanRef.startsWith('OP-SUP-') ||
          cleanRef.startsWith('OP-SUPP-') ||
          cleanDesc.includes('رصيد افتتاحي') || cleanDesc.includes('رصيد أول المدة')
        ) return true;

        // معاملات وصرفيات وصيانة وعهد مديول الاستاد الرياضي (Stadium Module)
        if (
          cleanRef.startsWith('DISB-') ||
          cleanRef.startsWith('CUST-') ||
          cleanRef.startsWith('SETTL-') ||
          cleanRef.startsWith('MAINT-') ||
          cleanRef.startsWith('STD-') ||
          cleanRef.startsWith('TOURN-') ||
          cleanDesc.includes('استاد المنصورة') ||
          cleanDesc.includes('مصروفات الاستاد') ||
          cleanDesc.includes('صيانة ملاعب') ||
          cleanDesc.includes('صيانة منشأة') ||
          cleanDesc.includes('مهمات وأدوات رياضية') ||
          cleanDesc.includes('صرف طلب') ||
          cleanDesc.includes('عهدة نشاط') ||
          cleanDesc.includes('تسوية عهدة') ||
          cleanDesc.includes('مستحقات كوادر') ||
          cleanDesc.includes('عمولة مدرب') ||
          cleanDesc.includes('بطولات ومعسكرات') ||
          cleanDesc.includes('فواتير تشغيل ومرافق')
        ) return true;

        if (suppliersList?.some(s => s.name && cleanDesc.includes(s.name))) return true;

        return false;
      };

      const discrepancies: any[] = [];
      glEntriesMap.forEach((entry) => {
        const matched = isRefMatched(
          entry.ref,
          entry.description,
          entry.journal_entries?.id
        );
        if (!matched) discrepancies.push(entry);
      });

      setDiscrepancyEntries(discrepancies);

    } catch (error: any) {
      console.error('Error fetching supplier reconciliation:', error);
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

  const [extractedSupplierName, setExtractedSupplierName] = useState('');

  const openFixModal = (entry: any) => {
    setEntryToFix(entry);
    const desc = entry.description || '';
    const match = desc.match(/للمورد\s+([^\s]+)/i) || desc.match(/مورد\s+([^\s]+)/i) || desc.match(/طرف\s+([^\s]+)/i) || desc.match(/إلى\s+([^\s]+)/i);
    const extName = match ? match[1].trim() : '';
    setExtractedSupplierName(extName);

    const existing = suppliers.find(s => s.name && extName && s.name.trim().toLowerCase() === extName.toLowerCase());
    setFixFormData({ 
      supplierId: existing ? existing.id : '', 
      treasuryAccountId: treasuryAccounts[0]?.id || '', 
      notes: entry.description || '' 
    });
    setFixModalOpen(true);
  };

  const handleQuickCreateSupplierAndFix = async (nameToCreate: string) => {
    if (!nameToCreate?.trim() || !entryToFix) return;
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const userOrgId = (currentUser as any)?.organization_id || session?.user?.user_metadata?.org_id;

      // 1. إنشاء المورد الجديد
      const { data: newSupp, error: suppErr } = await supabase
        .from('suppliers')
        .insert({
          name: nameToCreate.trim(),
          organization_id: userOrgId,
          opening_balance: 0
        })
        .select('id, name')
        .single();

      if (suppErr || !newSupp) throw suppErr || new Error('فشل إنشاء المورد');

      // 2. ربط الشيك أو إنشاء سند صرف
      const isCheque = entryToFix.ref?.startsWith('CHQ-') || (entryToFix.description || '').includes('شيك');
      const jeId = entryToFix.journal_entries?.id || entryToFix.id;
      const rawNum = entryToFix.ref?.replace('CHQ-', '').trim();

      if (isCheque) {
        if (jeId) {
          await supabase.from('cheques').update({ party_id: newSupp.id }).eq('related_journal_entry_id', jeId);
        }
        if (rawNum) {
          await supabase.from('cheques').update({ party_id: newSupp.id }).eq('cheque_number', rawNum);
        }
      } else {
        await supabase.from('payment_vouchers').insert({
          voucher_number: entryToFix.ref || `PV-FIX-${Date.now().toString().slice(-6)}`,
          payment_date: entryToFix.date,
          amount: entryToFix.debit || entryToFix.credit,
          supplier_id: newSupp.id,
          treasury_account_id: fixFormData.treasuryAccountId || treasuryAccounts[0]?.id,
          notes: entryToFix.description,
          payment_method: 'cash'
        });
      }

      showToast(`تم إنشاء المورد «${newSupp.name}» وربط القيد بنجاح ✅`, 'success');
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
    if (!fixFormData.supplierId || (!isCheque && !fixFormData.treasuryAccountId)) {
      showToast(isCheque ? 'الرجاء اختيار المورد' : 'الرجاء اختيار المورد وحساب الخزينة/البنك', 'warning');
      return;
    }
    try {
      const isPayment = entryToFix.debit > 0;
      const amount    = isPayment ? entryToFix.debit : entryToFix.credit;
      const jeId      = entryToFix.journal_entries?.id || entryToFix.id;
      const rawNum    = entryToFix.ref?.replace('CHQ-', '').trim();

      if (isPayment) {
        if (isCheque) {
          // تحديث المورد في جدول الشيكات مباشرة لربطه دون إنشاء قيد مكرر
          if (jeId) {
            await supabase.from('cheques').update({ party_id: fixFormData.supplierId }).eq('related_journal_entry_id', jeId);
          }
          if (rawNum) {
            await supabase.from('cheques').update({ party_id: fixFormData.supplierId }).eq('cheque_number', rawNum);
          }
          showToast('تم ربط الشيك بالمورد بنجاح ومطابقة الأستاذ المساعد ✅', 'success');
        } else {
          const { error } = await supabase.from('payment_vouchers').insert({
            voucher_number:      entryToFix.ref || `PV-FIX-${Date.now().toString().slice(-6)}`,
            payment_date:        entryToFix.date,
            amount,
            supplier_id:         fixFormData.supplierId,
            treasury_account_id: fixFormData.treasuryAccountId,
            notes:               fixFormData.notes,
            payment_method:      'cash'
          });
          if (error) throw error;
          showToast('تم إنشاء سند الصرف وربطه بالقيد بنجاح ✅', 'success');
        }
      } else {
        showToast('هذا القيد دائن — يمكنك ربطه كفاتورة مشتريات من شاشة المشتريات.', 'info');
        return;
      }
      setFixModalOpen(false);
      fetchReconciliation();
    } catch (err: any) {
      showToast('خطأ: ' + err.message, 'error');
    }
  };

  const exportSupplierBalances = () => {
    if (supplierBalances.length === 0) return;
    const worksheet = XLSX.utils.json_to_sheet(supplierBalances.map(s => ({
      'اسم المورد':             s.name,
      'رقم الهاتف':             s.phone || '-',
      'الرصيد الافتتاحي':       s.opening,
      'قيد افتتاحي في الأستاذ': s.hasGlOpening ? 'نعم' : 'لا',
      'إجمالي المشتريات':       s.grossInvoices,
      'مستخلصات باطن':          s.subBillingsForSupplier,
      'سداد فوري من الفواتير':  s.invoiceImmediatePayments,
      'إجمالي المرتجعات':       s.returnsTotal,
      'الإشعارات المدينة':      s.debitNotesTotal,
      'سندات الصرف':            s.paymentsTotal,
      'الشيكات الصادرة':        s.chequesTotal,
      'صافي المستحق':           s.balance
    })));
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'أرصدة الموردين');
    XLSX.writeFile(workbook, `Supplier_Balances_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  useEffect(() => { fetchReconciliation(); }, [accounts]);

  const difference   = glBalance - subLedgerBalance;
  const isBalanced   = Math.abs(difference) < 1;

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
          <p className="text-slate-500 text-sm">مقارنة فورية بين الأستاذ العام (GL) وأرصدة كشوف حسابات الموردين ومقاولي الباطن — يشمل جميع المديولات</p>
        </div>
        <button
          onClick={fetchReconciliation}
          disabled={loading}
          className="flex items-center gap-2 bg-white border border-slate-300 px-4 py-2.5 rounded-xl hover:bg-slate-50 font-bold text-slate-700 shadow-sm transition-all disabled:opacity-50"
        >
          <RefreshCw size={18} className={loading ? 'animate-spin text-orange-600' : ''} /> تحديث المطابقة
        </button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
          <p className="text-xs font-bold text-slate-500 mb-1">رصيد دفتر الأستاذ العام (حساب {supplierAccountCode})</p>
          <h3 className="text-3xl font-black text-slate-800 font-mono dir-ltr">
            {glBalance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </h3>
          <p className="text-[11px] text-slate-400 mt-2 flex items-center gap-1 font-bold">
            <BookOpen size={13} /> مجموع القيود المرحلة لحساب الموردين (دائن - مدين)
          </p>
        </div>

        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
          <p className="text-xs font-bold text-slate-500 mb-1">رصيد كشوف حسابات الموردين (الأستاذ المساعد)</p>
          <h3 className="text-3xl font-black text-orange-600 font-mono dir-ltr">
            {subLedgerBalance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </h3>
          <p className="text-[11px] text-slate-400 mt-2 flex items-center gap-1 font-bold">
            <Truck size={13} /> افتتاحي + مشتريات + مستخلصات - سداد فوري - سندات - شيكات - مرتجعات - إشعارات
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
      <div className="flex border-b border-slate-200 gap-1 overflow-x-auto">
        {(['overview', 'discrepancies', 'suppliers', 'subcontractors'] as const).map(tab => {
          const labels: Record<string, string> = {
            overview:        'ملخص المطابقة',
            discrepancies:   `القيود غير المربوطة (${discrepancyEntries.length})`,
            suppliers:       `كشف أرصدة الموردين (${supplierBalances.length})`,
            subcontractors:  `مستخلصات الباطن (${subcontractorBillings.length})`
          };
          const icons: Record<string, React.ReactNode> = {
            overview:       <Scale size={16} />,
            discrepancies:  <AlertTriangle size={16} />,
            suppliers:      <Truck size={16} />,
            subcontractors: <HardHat size={16} />
          };
          return (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`pb-3 px-4 text-sm font-bold border-b-2 whitespace-nowrap transition-all flex items-center gap-2 ${
                activeTab === tab ? 'border-orange-600 text-orange-700' : 'border-transparent text-slate-500 hover:text-slate-800'
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
              <FileCheck className="text-orange-600" size={20} /> نتيجة فحص التكامل المحاسبي
            </h3>

            {isBalanced ? (
              <div className="p-6 bg-emerald-50 rounded-xl border border-emerald-200 text-center space-y-2">
                <div className="w-12 h-12 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto mb-2">
                  <CheckCircle size={28} />
                </div>
                <h4 className="text-lg font-black text-emerald-800">الأستاذ العام متطابق تماماً مع كشوف حسابات الموردين!</h4>
                <p className="text-sm text-emerald-700 max-w-xl mx-auto">
                  جميع فواتير المشتريات، مستخلصات مقاولي الباطن، السداد الفوري، سندات الصرف، الشيكات الصادرة، الإشعارات المدينة، والأرصدة الافتتاحية مسجلة بدقة.
                </p>
              </div>
            ) : (
              <div className="p-6 bg-red-50 rounded-xl border border-red-200 space-y-3">
                <div className="flex items-center gap-3">
                  <AlertTriangle className="text-red-600" size={24} />
                  <h4 className="text-base font-black text-red-800">تنبيه: يوجد فرق محاسبي بقيمة {Math.abs(difference).toLocaleString()} {settings.currency || 'ج.م'}</h4>
                </div>
                <p className="text-sm text-red-700 leading-relaxed">
                  هذا الفرق ناتج عن قيود على حساب الموردين دون مستند مشتريات/صرف مرتبط، أو أرصدة افتتاحية غير متوافقة. انتقل لتبويب <strong>«القيود غير المربوطة»</strong> لمعالجة الفروقات.
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

          <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-sm text-blue-800 space-y-1">
            <p className="font-bold flex items-center gap-1"><FileText size={15} /> منهجية حساب الأستاذ المساعد</p>
            <p>رصيد المورد = الرصيد الافتتاحي + إجمالي فواتير المشتريات + مستخلصات باطن − السداد الفوري من الفواتير − سندات الصرف − الشيكات الصادرة − المرتجعات − الإشعارات المدينة</p>
            <p className="text-blue-600 text-xs font-bold">ملاحظة: مستخلصات مقاولي الباطن تُضاف مرة واحدة فقط — إما ضمن المورد المطابق له أو كرصيد منفصل إذا لم يكن موجوداً في جدول الموردين</p>
          </div>
        </div>
      )}

      {/* Tab 2: Discrepancies */}
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
                      <td className="p-3 text-center font-mono font-bold text-emerald-700">
                        {entry.debit ? entry.debit.toLocaleString(undefined, {minimumFractionDigits: 2}) : '-'}
                      </td>
                      <td className="p-3 text-center font-mono font-bold text-slate-800">
                        {entry.credit ? entry.credit.toLocaleString(undefined, {minimumFractionDigits: 2}) : '-'}
                      </td>
                      <td className="p-3 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          <button
                            onClick={() => navigate('/general-journal', { state: { initialSearch: entry.ref } })}
                            className="text-blue-600 hover:bg-blue-50 px-2 py-1 rounded text-xs font-bold transition-colors"
                            title="عرض القيد باليومية"
                          >
                            عرض
                          </button>
                          {entry.debit > 0 && (
                            <button
                              onClick={() => openFixModal(entry)}
                              className="bg-orange-600 text-white px-2.5 py-1 rounded-lg text-xs font-bold hover:bg-orange-700 transition-colors"
                              title="ربط هذا القيد بمورد لمعالجة الفرق وتطابق الأستاذ المساعد"
                            >
                              {entry.ref?.startsWith('CHQ-') ? 'ربط الشيك بمورد' : 'ربط بمورد / إصلاح'}
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

      {/* Tab 3: Supplier Balances */}
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
                  <th className="p-3 text-center">افتتاحي</th>
                  <th className="p-3 text-center">إجمالي المشتريات</th>
                  <th className="p-3 text-center">سداد فوري</th>
                  <th className="p-3 text-center">مرتجعات+إشعارات</th>
                  <th className="p-3 text-center">سندات+شيكات</th>
                  <th className="p-3 text-center">صافي المستحق</th>
                  <th className="p-3 text-center">كشف الحساب</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredSuppliers.map((sup) => (
                  <tr key={sup.id} className="hover:bg-slate-50/70 transition-colors">
                    <td className="p-3">
                      <p className="font-bold text-slate-800">{sup.name}</p>
                      {sup.phone && <p className="text-xs text-slate-400 font-mono">{sup.phone}</p>}
                      {sup.hasGlOpening && (
                        <span className="text-[10px] bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded font-bold">قيد افتتاحي في GL</span>
                      )}
                      {sup.subBillingsForSupplier > 0 && (
                        <span className="text-[10px] bg-orange-100 text-orange-700 px-1.5 py-0.5 rounded font-bold mr-1">مقاول باطن</span>
                      )}
                    </td>
                    <td className="p-3 text-center font-mono text-slate-600">
                      {sup.opening.toLocaleString(undefined, {minimumFractionDigits: 2})}
                    </td>
                    <td className="p-3 text-center font-mono font-bold text-slate-800">
                      {(sup.grossInvoices + sup.subBillingsForSupplier).toLocaleString(undefined, {minimumFractionDigits: 2})}
                    </td>
                    <td className="p-3 text-center font-mono text-blue-600">
                      {sup.invoiceImmediatePayments > 0
                        ? `(${sup.invoiceImmediatePayments.toLocaleString(undefined, {minimumFractionDigits: 2})})`
                        : '-'}
                    </td>
                    <td className="p-3 text-center font-mono text-amber-600">
                      {(sup.returnsTotal + sup.debitNotesTotal) > 0
                        ? `(${(sup.returnsTotal + sup.debitNotesTotal).toLocaleString(undefined, {minimumFractionDigits: 2})})`
                        : '-'}
                    </td>
                    <td className="p-3 text-center font-mono text-emerald-600">
                      {(sup.paymentsTotal + sup.chequesTotal) > 0
                        ? `(${(sup.paymentsTotal + sup.chequesTotal).toLocaleString(undefined, {minimumFractionDigits: 2})})`
                        : '-'}
                    </td>
                    <td className="p-3 text-center font-mono font-black text-slate-900" dir="ltr">
                      <span className={`px-2 py-0.5 rounded text-xs font-black ${
                        sup.balance > 0.01  ? 'bg-orange-50 text-orange-700' :
                        sup.balance < -0.01 ? 'bg-emerald-50 text-emerald-700' :
                        'bg-slate-100 text-slate-500'
                      }`}>
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

          <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-800 font-bold">
            مستخلصات مقاولي الباطن المرتبطين بموردين في النظام تُدرج ضمن رصيد المورد في تبويب «أرصدة الموردين». المستخلصات المعروضة هنا لمقاولين غير مسجلين كموردين.
          </div>

          {subcontractorBillings.length === 0 ? (
            <div className="p-12 text-center text-slate-400 font-bold">لا توجد مستخلصات مقاولي باطن مسجلة حالياً.</div>
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
                    <th className="p-3 text-center">مسجل كمورد</th>
                    <th className="p-3 text-center">الحالة</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {subcontractorBillings.map((bill) => {
                    const isSupplier = bill.subcontractor_id && supplierBalances.some(s => s.id === bill.subcontractor_id);
                    return (
                      <tr key={bill.id} className={`hover:bg-slate-50/70 transition-colors ${isSupplier ? 'bg-blue-50/30' : ''}`}>
                        <td className="p-3 font-mono font-bold text-slate-800">{bill.billing_number || bill.id.slice(0, 8)}</td>
                        <td className="p-3 font-bold text-slate-700">{bill.subcontractor_name || '-'}</td>
                        <td className="p-3 text-center font-mono text-xs text-slate-500">{bill.issue_date || '-'}</td>
                        <td className="p-3 text-center font-mono font-bold text-slate-800">{bill.gross_amount.toLocaleString(undefined, {minimumFractionDigits: 2})}</td>
                        <td className="p-3 text-center font-mono font-black text-orange-700">{bill.net_amount.toLocaleString(undefined, {minimumFractionDigits: 2})}</td>
                        <td className="p-3 text-center">
                          {isSupplier
                            ? <span className="bg-blue-100 text-blue-700 text-[10px] font-bold px-2 py-0.5 rounded-full">مُدرج في المورد</span>
                            : <span className="bg-slate-100 text-slate-500 text-[10px] font-bold px-2 py-0.5 rounded-full">منفصل</span>
                          }
                        </td>
                        <td className="p-3 text-center">
                          <span className="bg-emerald-100 text-emerald-800 text-[10px] font-bold px-2 py-0.5 rounded-full">
                            {bill.status || 'معتمد'}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
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
              <button onClick={() => setFixModalOpen(false)} className="text-slate-400 hover:text-slate-600"><X size={18} /></button>
            </div>

            <form onSubmit={handleFixSubmit} className="space-y-4">
              <div className="p-3 bg-slate-50 rounded-xl space-y-1 text-xs">
                <div className="flex justify-between">
                  <span className="text-slate-500">رقم القيد:</span>
                  <span className="font-mono font-bold">{entryToFix.ref || 'بدون مرجع'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">المبلغ المدين:</span>
                  <span className="font-mono font-bold text-orange-600 text-sm">{entryToFix.debit.toLocaleString()} {settings.currency || 'ج.م'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">البيان:</span>
                  <span className="font-medium text-slate-700 text-right max-w-xs">{entryToFix.description}</span>
                </div>
              </div>

              {extractedSupplierName && !suppliers.some(s => s.name?.trim().toLowerCase() === extractedSupplierName.toLowerCase()) && (
                <div className="p-3 bg-orange-50 border border-orange-200 rounded-xl space-y-2">
                  <div className="text-xs text-orange-800 font-bold flex items-center gap-1.5">
                    <AlertTriangle size={15} className="text-orange-600" />
                    الطرف «{extractedSupplierName}» غير مسجل في قائمة الموردين الحالية.
                  </div>
                  <button
                    type="button"
                    onClick={() => handleQuickCreateSupplierAndFix(extractedSupplierName)}
                    className="w-full bg-orange-600 text-white font-bold text-xs py-2 px-3 rounded-lg hover:bg-orange-700 transition-colors shadow-sm flex items-center justify-center gap-1.5"
                  >
                    <Plus size={14} /> إضافة «{extractedSupplierName}» كمورد جديد وربط القيد فوراً
                  </button>
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">أو اختر مورد موجود <span className="text-red-500">*</span></label>
                <select
                  required
                  className="w-full border rounded-xl p-2.5 bg-slate-50 text-sm font-bold outline-none focus:border-orange-500"
                  value={fixFormData.supplierId}
                  onChange={e => setFixFormData({...fixFormData, supplierId: e.target.value})}
                >
                  <option value="">-- اختر المورد --</option>
                  {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>

              {entryToFix.ref?.startsWith('CHQ-') || (entryToFix.description || '').includes('شيك') ? (
                <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl text-xs text-blue-800 space-y-1">
                  <p className="font-bold flex items-center gap-1.5">
                    <CheckCircle size={15} className="text-blue-600" />
                    شيك صادر مسجل مسبقاً بالأستاذ العام
                  </p>
                  <p className="leading-relaxed">
                    <strong>لن يتم إنشاء أي قيد محاسبي جديد</strong> (منعاً للازدواجية وتكرار المبالغ) — الربط سيقوم فقط بتعيين المورد للشيك ليظهر ضمن كشف حسابه وتتطابق الأرصدة فوراً.
                  </p>
                </div>
              ) : (
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">حساب الخزينة / البنك <span className="text-red-500">*</span></label>
                  <select
                    required
                    className="w-full border rounded-xl p-2.5 bg-slate-50 text-sm font-bold outline-none focus:border-orange-500"
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
                  className="w-full border rounded-xl p-2.5 bg-slate-50 text-sm outline-none focus:border-orange-500"
                  value={fixFormData.notes}
                  onChange={e => setFixFormData({...fixFormData, notes: e.target.value})}
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                <button type="button" onClick={() => setFixModalOpen(false)} className="px-4 py-2 bg-slate-100 text-slate-700 font-bold rounded-xl text-xs hover:bg-slate-200">إلغاء</button>
                <button type="submit" className="px-5 py-2 bg-orange-600 text-white font-bold rounded-xl text-xs hover:bg-orange-700 shadow-sm">
                  {entryToFix.ref?.startsWith('CHQ-') ? 'ربط الشيك بالمورد' : 'إنشاء وربط السند'}
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

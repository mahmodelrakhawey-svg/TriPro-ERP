import { logger } from '../../utils/logger';
import React, { useState, useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAccounting } from '../../context/AccountingContext';
import { supabase } from '../../supabaseClient';
import { Printer, FileText, Loader2, Search, Download, MessageCircle, AlertTriangle, ShieldAlert, RefreshCw, ChevronLeft, ChevronRight, Eye, X } from 'lucide-react';
import * as XLSX from 'xlsx';
import { useToast } from '../../context/ToastContext';
import { SubledgerRegistry } from '../../services/subledgerRegistry';
import { SalesInvoicePrint } from './SalesInvoicePrint';
import { SalesReturnPrint } from './SalesReturnPrint';
import { ReceiptVoucherPrint } from '../finance/reports/ReceiptVoucherPrint';

// 🚀 دالة مساعدة لتجزئة استعلامات المعرفات في Supabase لتجنب تجاوز الحد الأقصى لطول الرابط (HTTP 414 URI Too Long)
async function fetchInChunks<T>(
  items: string[],
  chunkSize: number,
  fetcher: (chunk: string[]) => Promise<T[]>
): Promise<T[]> {
  if (!items || items.length === 0) return [];
  const results: T[] = [];
  for (let i = 0; i < items.length; i += chunkSize) {
    const chunk = items.slice(i, i + chunkSize);
    const res = await fetcher(chunk);
    if (res && res.length > 0) {
      results.push(...res);
    }
  }
  return results;
}

type Transaction = {
  id: string;
  date: string;
  type: 'invoice' | 'receipt' | 'return' | 'credit_note' | 'pos_order';
  reference: string;
  description: string;
  debit: number;  // مدين (فاتورة)
  credit: number; // دائن (سداد/مرتجع)
  balance: number;
  isPosted: boolean; // هل تم ترحيلها للقيد؟
  docId?: string;
};

interface CustomerStatementProps {
  initialCustomerId?: string;
}

const CustomerStatement: React.FC<CustomerStatementProps> = ({ initialCustomerId }) => {
  const { customers, settings, currentUser, approveInvoice, accounts, selectedFiscalYear, fiscalYearRange } = useAccounting();
  const [searchParams] = useSearchParams();
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>(initialCustomerId || '');
  const [startDate, setStartDate] = useState(fiscalYearRange.startDate);
  const [endDate, setEndDate] = useState(`${selectedFiscalYear}-12-31`);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [openingBalance, setOpeningBalance] = useState(0);
  const [closingBalance, setClosingBalance] = useState(0);
  const [loading, setLoading] = useState(false);
  const [showUnpostedOnly, setShowUnpostedOnly] = useState(false);
  const [unpostedCount, setUnpostedCount] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState<number | 'all'>(50);
  const [printingDocId, setPrintingDocId] = useState<string | null>(null);
  const [printDoc, setPrintDoc] = useState<{
    type: 'invoice' | 'receipt' | 'return' | 'credit_note';
    data: Record<string, unknown>;
  } | null>(null);
  const { showToast } = useToast();

  // إعادة التعيين للصفحة الأولى عند تغيير الفلاتر
  useEffect(() => {
    setCurrentPage(1);
  }, [selectedCustomerId, startDate, endDate, showUnpostedOnly]);

  // مزامنة التواريخ تلقائياً عند تغيير السنة المالية المختارة من شريط النظام
  useEffect(() => {
    if (selectedFiscalYear) {
      setStartDate(`${selectedFiscalYear}-01-01`);
      setEndDate(`${selectedFiscalYear}-12-31`);
    }
  }, [selectedFiscalYear]);
  
  const selectedCustomer = customers.find(c => c.id.toString() === selectedCustomerId.toString());

  // قراءة معرف العميل من الرابط عند التحميل
  useEffect(() => {
    if (initialCustomerId) {
        setSelectedCustomerId(initialCustomerId);
    } else {
        const cid = searchParams.get('customerId');
        if (cid) setSelectedCustomerId(cid);
    }
  }, [searchParams, initialCustomerId]);

  const handleFixAll = async () => {
    const unposted = transactions.filter(t => t.type === 'pos_order' && !t.isPosted);
    
    if (unposted.length === 0) {
      showToast('لا توجد طلبات غير مرحلة للعميل.', 'info');
      return;
    }

    setLoading(true);
    let successCount = 0;
    try {
      for (const ord of unposted) {
        const { error } = await supabase.rpc('post_order_journal_entry', {
          p_order_id: ord.id
        });

        if (error) {
          logger.error(`Failed to post order ${ord.reference}:`, error.message);
        } else {
          successCount++;
        }
      }

      if (successCount > 0) {
        showToast(`تم ترحيل عدد (${successCount}) طلبات بنجاح ومطابقة الأستاذ العام.`, 'success');
        await fetchStatement();
      } else {
        showToast('فشل ترحيل الطلبات. يرجى التحقق من قاعدة البيانات.', 'error');
      }
    } catch (err) {
      logger.error(err);
      showToast('حدث خطأ غير متوقع: ' + err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  const fetchStatement = async () => { // 🛡️ إعادة كتابة شاملة لضمان التطابق مع الأستاذ العام

    if (!selectedCustomerId) return;
    setLoading(true);

    if (currentUser?.role === 'demo') {
        setTransactions([
            { id: 'd1', date: new Date(Date.now() - 86400000 * 5).toISOString().split('T')[0], type: 'invoice', reference: 'INV-DEMO-101', description: 'فاتورة مبيعات آجلة', debit: 5000, credit: 0, balance: 5000, isPosted: true }, // Example data
            { id: 'd2', date: new Date(Date.now() - 86400000 * 2).toISOString().split('T')[0], type: 'receipt', reference: 'RV-DEMO-55', description: 'دفعة نقدية من الحساب', debit: 0, credit: 2000, balance: 3000, isPosted: true }, // Example data
            { id: 'd3', date: new Date().toISOString().split('T')[0], type: 'invoice', reference: 'INV-DEMO-102', description: 'فاتورة مبيعات جديدة', debit: 1500, credit: 0, balance: 4500, isPosted: true } // Example data
        ]);
        setOpeningBalance(0);
        setClosingBalance(4500);
        setLoading(false);
        return;
    }

    try {
        const { data: { session } } = await supabase.auth.getSession();
        const userOrgId = session?.user?.user_metadata?.org_id;

        if (!userOrgId) {
            showToast('تعذر تحديد المنظمة. يرجى تسجيل الدخول مرة أخرى.', 'error');
            setLoading(false);
            return;
        }

        // حساب العملاء: كود الدليل المصري هو 1221 (Accounts(code) = 1221)
        // مهم: لا نعتمد على accounts المحملة من الـ context لأن عند إنشاء شركة جديدة قد تكون غير محدثة/فارغة.
        const { data: customerAccounts, error: customerAccError } = await supabase
          .from('accounts')
          .select('id')
          .eq('organization_id', userOrgId)
          .eq('code', '1221')
          .limit(1);

        if (customerAccError) throw customerAccError;
        let customerAcc: { id: string } | null = customerAccounts?.[0] || null;

        // احتياطي: البحث بالاسم إذا لم يُوجد الكود 1221
        if (!customerAcc?.id) {
          const { data: fallbackAcc } = await supabase
            .from('accounts')
            .select('id')
            .eq('organization_id', userOrgId)
            .or('name.ilike.%العملاء%,name.ilike.%عملاء%,code.ilike.122%')
            .limit(1);
          customerAcc = fallbackAcc?.[0] || null;
        }

        if (!customerAcc?.id) {
          showToast('تعذر تحديد حساب العملاء لهذه المنظمة. تأكد من وجود حساب بكود 1221 أو اسم يحتوي على "العملاء".', 'error');
          setLoading(false);
          return;
        }




        let targetAccountId = customerAcc.id;
        if (selectedCustomer?.customer_type === 'insurance_provider') {
          const { data: insAcc } = await supabase
            .from('accounts')
            .select('id')
            .eq('organization_id', userOrgId)
            .eq('code', '122101')
            .limit(1);
          if (insAcc && insAcc.length > 0) {
            targetAccountId = insAcc[0].id;
          }
        }

        // جلب المديولات المسموحة للمنظمة من جدول organizations
        const { data: orgData } = await supabase
          .from('organizations')
          .select('allowed_modules')
          .eq('id', userOrgId)
          .maybeSingle();
        const allowedModules: string[] | undefined = orgData?.allowed_modules || undefined;

        // 1) جلب معرفات القيود المرتبطة بمستندات المديول الأساسي والقيود اليدوية التي تحوي اسمه
        const custName = selectedCustomer?.name?.trim();
        const custPhone = selectedCustomer?.phone?.replace(/[^0-9]/g, '');

        const [
          invRes, recRes, retRes, cnRes, chqRes, ordRes, manualEntriesRes,
          modularEntryIds
        ] = await Promise.all([
             supabase.from('invoices').select('id, related_journal_entry_id').eq('customer_id', selectedCustomerId).eq('organization_id', userOrgId).not('related_journal_entry_id', 'is', null),
             supabase.from('receipt_vouchers').select('id, related_journal_entry_id').eq('customer_id', selectedCustomerId).eq('organization_id', userOrgId).not('related_journal_entry_id', 'is', null),
             supabase.from('sales_returns').select('id, related_journal_entry_id').eq('customer_id', selectedCustomerId).eq('organization_id', userOrgId).not('related_journal_entry_id', 'is', null),
             supabase.from('credit_notes').select('id, related_journal_entry_id').eq('customer_id', selectedCustomerId).eq('organization_id', userOrgId).not('related_journal_entry_id', 'is', null),
             custName
               ? supabase.from('cheques').select('id, related_journal_entry_id').eq('organization_id', userOrgId).not('related_journal_entry_id', 'is', null).or(`party_id.eq.${selectedCustomerId},party_name.ilike.%${custName}%`)
               : supabase.from('cheques').select('id, related_journal_entry_id').eq('party_id', selectedCustomerId).eq('organization_id', userOrgId).not('related_journal_entry_id', 'is', null),
             supabase.from('orders').select('id, related_journal_entry_id').eq('customer_id', selectedCustomerId).eq('organization_id', userOrgId).not('related_journal_entry_id', 'is', null),
             custName
               ? supabase.from('journal_entries').select('id').eq('organization_id', userOrgId).eq('status', 'posted').ilike('description', `%${custName}%`)
               : Promise.resolve({ data: [] }),
             SubledgerRegistry.fetchStatementCustomerEntryIds(userOrgId, selectedCustomerId, custName, allowedModules)
        ]);

        const customerEntryIds = new Set<string>();
        const entryToDocMap = new Map<string, { id: string; type: string }>();

        invRes.data?.forEach(i => {
          if (i.related_journal_entry_id) {
            customerEntryIds.add(i.related_journal_entry_id);
            entryToDocMap.set(i.related_journal_entry_id, { id: i.id, type: 'invoice' });
          }
        });
        recRes.data?.forEach(r => {
          if (r.related_journal_entry_id) {
            customerEntryIds.add(r.related_journal_entry_id);
            entryToDocMap.set(r.related_journal_entry_id, { id: r.id, type: 'receipt' });
          }
        });
        retRes.data?.forEach(r => {
          if (r.related_journal_entry_id) {
            customerEntryIds.add(r.related_journal_entry_id);
            entryToDocMap.set(r.related_journal_entry_id, { id: r.id, type: 'return' });
          }
        });
        cnRes.data?.forEach(c => {
          if (c.related_journal_entry_id) {
            customerEntryIds.add(c.related_journal_entry_id);
            entryToDocMap.set(c.related_journal_entry_id, { id: c.id, type: 'credit_note' });
          }
        });
        chqRes.data?.forEach(c => {
          if (c.related_journal_entry_id) {
            customerEntryIds.add(c.related_journal_entry_id);
            entryToDocMap.set(c.related_journal_entry_id, { id: c.id, type: 'receipt' });
          }
        });
        ordRes.data?.forEach(o => {
          if (o.related_journal_entry_id) {
            customerEntryIds.add(o.related_journal_entry_id);
            entryToDocMap.set(o.related_journal_entry_id, { id: o.id, type: 'pos_order' });
          }
        });
        manualEntriesRes.data?.forEach(je => { customerEntryIds.add(je.id); });
        modularEntryIds.forEach(id => { if (id) customerEntryIds.add(id); });

        let ledgerLines: any[] = [];
        let journalEntries: any[] = [];

        if (customerEntryIds.size > 0) {
            const entryIdList = Array.from(customerEntryIds);
            ledgerLines = await fetchInChunks(entryIdList, 70, async (chunk) => {
                const { data: lines, error: ledgerError } = await supabase
                    .from('journal_lines')
                    .select('id, journal_entry_id, debit, credit, account_id, organization_id')
                    .eq('account_id', targetAccountId)
                    .eq('organization_id', userOrgId)
                    .in('journal_entry_id', chunk);

                if (ledgerError) throw ledgerError;
                return lines || [];
            });

            const journalEntryIds = Array.from(new Set(ledgerLines.map((l) => l.journal_entry_id).filter(Boolean)));
            if (journalEntryIds.length > 0) {
                journalEntries = await fetchInChunks(journalEntryIds, 70, async (chunk) => {
                    const { data: entries, error: journalEntriesError } = await supabase
                        .from('journal_entries')
                        .select('id, reference, transaction_date, description, status, related_document_id, related_document_type')
                        .in('id', chunk)
                        .eq('organization_id', userOrgId);

                    if (journalEntriesError) throw journalEntriesError;
                    return entries || [];
                });
            }
        }

        const journalEntryById = new Map((journalEntries || []).map((je) => [je.id, je]));

        let allTrans: Transaction[] = [];
        let unpostedCount = 0;

        // 2. معالجة كل سطر قيد من الأستاذ العام للعميل المختار
        ledgerLines.forEach(line => {
            const je = journalEntryById.get(line.journal_entry_id);
            if (!je) return;

            // تحديد نوع المستند من الوصف أو المرجع
            let type: Transaction['type'] = 'invoice';
            const jeAny: Record<string, any> = je;
            let ref = jeAny.reference || jeAny.id;
            let desc = jeAny.description || 'قيد يومية';
            let isPosted = jeAny.status === 'posted';

            if (ref.startsWith('INV-') || ref.startsWith('HIMS-') || jeAny.related_document_type === 'invoice') type = 'invoice';
            else if (ref.startsWith('RV-') || ref.startsWith('CLAIM-') || jeAny.related_document_type === 'receipt_voucher' || jeAny.related_document_type === 'receipt') type = 'receipt';
            else if (ref.startsWith('SR-') || jeAny.related_document_type === 'sales_return') type = 'return';
            else if (ref.startsWith('CN-') || jeAny.related_document_type === 'credit_note') type = 'credit_note';
            else if (ref.startsWith('CHQ-') || jeAny.related_document_type === 'cheque') type = 'receipt'; // For incoming cheques
            else if (ref.startsWith('REJ-')) type = 'receipt'; // For rejected cheques reversal
            else if (ref.startsWith('OB-') || jeAny.related_document_type === 'opening_balance') type = 'invoice'; // Opening Balance
            else if (jeAny.related_document_type === 'order') type = 'pos_order';
            else if (Number(line.credit) > 0 && Number(line.debit) === 0 && !ref.startsWith('INV-')) type = 'receipt'; // أي حركة دائنة بدون مدين هي سداد/دفعة

            // إذا كان القيد يمثل دفعة مقدمة مع فاتورة، يتم التعامل معه كـ receipt
            if (desc.includes('دفعة مقدمة مع الفاتورة') && type === 'invoice') {
                type = 'receipt';
            }

            const mappedDoc = entryToDocMap.get(line.journal_entry_id);
            const docId = jeAny.related_document_id || mappedDoc?.id || undefined;

            allTrans.push({
                id: line.id, // استخدام معرف سطر القيد لضمان التفرد
                date: je.transaction_date,
                type: type,
                reference: ref,
                description: desc,
                debit: Number(line.debit),
                credit: Number(line.credit),
                balance: 0, // سيتم حسابها لاحقاً
                isPosted: isPosted,
                docId: docId
            });
        });

        // 3. إضافة مبيعات المطاعم غير المرحّلة (التي لم تُنشأ لها قيود يومية بعد)
        const { data: openOrders } = await supabase.from('orders')
            .select('id, order_number, created_at, grand_total, order_type, status')
            .eq('customer_id', selectedCustomerId)
            .eq('organization_id', userOrgId)
            .is('related_journal_entry_id', null)
            .neq('status', 'CANCELLED');

        openOrders?.forEach(ord => {
            const total = Number(ord.grand_total) || 0;
            if (total > 0) {
                let typeLabel = 'طلب مطعم';
                if (ord.order_type === 'DELIVERY') typeLabel = 'طلب توصيل 🛵';
                else if (ord.order_type === 'TAKEAWAY') typeLabel = 'طلب سفري 🛍️';
                else if (ord.order_type === 'DINE_IN') typeLabel = 'طلب محلي 🍽️';

                allTrans.push({
                    id: ord.id,
                    date: ord.created_at ? ord.created_at.split('T')[0] : '',
                    type: 'pos_order',
                    reference: ord.order_number,
                    description: typeLabel,
                    debit: total,
                    credit: 0,
                    balance: 0,
                    isPosted: false, // غير مرحّل
                    docId: ord.id
                });
                unpostedCount++;
            }
        });


        // 4. فرز الحركات زمنياً
        allTrans.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

        // 5. حساب الرصيد الافتتاحي والرصيد الجاري بدون تكرار
        // إذا كان القيد الافتتاحي موجوداً بالفعل ضمن الحركات المجلوبة، نبدأ من 0 حتى لا يُحتسب مرتين
        const hasOpeningEntryInTrans = allTrans.some(t => 
            t.reference?.startsWith('OP-CUST-') || 
            t.reference?.startsWith('OB-') || 
            t.description?.includes('رصيد افتتاحي')
        );
        let openBal = hasOpeningEntryInTrans ? 0 : Number(selectedCustomer?.opening_balance || 0);
        const periodTrans: Transaction[] = [];

        allTrans.forEach(t => {
            if (t.date < startDate) {
                openBal += (t.debit - t.credit);
            } else if (t.date >= startDate && t.date <= endDate) {
                periodTrans.push(t);
            }
        });

        let runningBal = openBal;
        const finalTrans = periodTrans.map(t => {
            runningBal += (t.debit - t.credit);
            return { ...t, balance: runningBal };
        });

        // 6. تحديث الحالات
        setUnpostedCount(unpostedCount + finalTrans.filter(t => !t.isPosted && t.type !== 'pos_order').length);
        setOpeningBalance(openBal);
        setTransactions(finalTrans);
        setClosingBalance(runningBal);

    } catch (error) {
        logger.error(error);
        showToast('حدث خطأ أثناء جلب البيانات', 'error');
    } finally {
        setLoading(false);
    }
  };

  // Fetch data when filters change (including selectedCustomer for opening_balance)
  useEffect(() => {
      if (selectedCustomerId && selectedCustomer) {
          fetchStatement();
      } else {
          setTransactions([]);
          setOpeningBalance(0);
          setClosingBalance(0);
      }
  }, [selectedCustomerId, startDate, endDate, selectedCustomer]);

  const handleExportExcel = () => {
    const data = [
        ['كشف حساب عميل'],
        ['العميل:', selectedCustomer?.name],
        ['من تاريخ:', startDate, 'إلى تاريخ:', endDate],
        [],
        ['التاريخ', 'المستند', 'البيان', 'مدين (فاتورة)', 'دائن (سداد)', 'الرصيد'],
        ['-', '-', 'رصيد افتتاحي', '-', '-', openingBalance],
        ...transactions.map(t => [t.date, t.reference.replace(/^(CHQ-|RV-|INV-|SR-|OB-)/, ''), t.description, t.debit, t.credit, t.balance])
    ];
    const ws = XLSX.utils.aoa_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Statement");
    XLSX.writeFile(wb, `Customer_Statement_${selectedCustomer?.name}.xlsx`);
  };

  const handleWhatsApp = () => {
      if (!selectedCustomer) return;
      const phone = selectedCustomer.phone;
      if (!phone) {
          showToast('لا يوجد رقم هاتف لهذا العميل', 'warning');
          return;
      }
      
      const message = `كشف حساب من ${settings.companyName}
العميل: ${selectedCustomer.name}
الفترة: ${startDate} إلى ${endDate}
رصيد افتتاحي: ${openingBalance.toLocaleString()}
رصيد ختامي: ${closingBalance.toLocaleString()}
شكراً لتعاملكم معنا.`;

      window.open(`https://wa.me/${phone}?text=${encodeURIComponent(message)}`, '_blank');
  };

  // 📄 تصفية وتقطيع الحركات وفق ترقيم الصفحات
  const filteredTransactions = useMemo(() => {
    return transactions.filter(t => !showUnpostedOnly || !t.isPosted);
  }, [transactions, showUnpostedOnly]);

  const totalPages = useMemo(() => {
    if (pageSize === 'all') return 1;
    return Math.max(1, Math.ceil(filteredTransactions.length / pageSize));
  }, [filteredTransactions.length, pageSize]);

  const displayedTransactions = useMemo(() => {
    if (pageSize === 'all') return filteredTransactions;
    const start = (currentPage - 1) * pageSize;
    return filteredTransactions.slice(start, start + pageSize);
  }, [filteredTransactions, currentPage, pageSize]);

  // دالة طباعة مستند مفرد (فاتورة أو سند قبض أو طلب كاشير أو مرتجع) من داخل كشف الحساب
  const handlePrintDoc = async (t: Transaction) => {
    setPrintingDocId(t.id);
    try {
      if (t.type === 'invoice') {
        showToast('جاري تجهيز الفاتورة للطباعة...', 'info');
        const cleanRef = t.reference?.replace(/^(INV-)/i, '') || '';
        
        let invData: Record<string, unknown> | null = null;
        if (t.docId) {
          const { data, error } = await supabase
            .from('invoices')
            .select(`
              *,
              customers(id, name, phone, address, tax_number),
              warehouses(id, name),
              invoice_items(id, product_id, quantity, unit_price, total, cost, uoms(name), products(name, sku, unit, uom:uoms!base_uom_id(name)))
            `)
            .eq('id', t.docId)
            .maybeSingle();
          if (!error && data) invData = data;
        }

        if (!invData && t.reference) {
          const { data, error } = await supabase
            .from('invoices')
            .select(`
              *,
              customers(id, name, phone, address, tax_number),
              warehouses(id, name),
              invoice_items(id, product_id, quantity, unit_price, total, cost, uoms(name), products(name, sku, unit, uom:uoms!base_uom_id(name)))
            `)
            .or(`invoice_number.eq.${t.reference},invoice_number.ilike.%${cleanRef}%`)
            .limit(1)
            .maybeSingle();
          if (!error && data) invData = data;
        }

        if (invData) {
          const invObj = invData as Record<string, any>;
          const itemsList = (invObj.invoice_items || invObj.items || []) as Array<Record<string, any>>;
          if (!itemsList || itemsList.length === 0) {
            const { data: directItems } = await supabase
              .from('invoice_items')
              .select('id, product_id, quantity, unit_price, total, cost, uoms(name), products(name, sku, unit, uom:uoms!base_uom_id(name))')
              .eq('invoice_id', invObj.id)
              .limit(5000);
            if (directItems && directItems.length > 0) {
              invObj.invoice_items = directItems;
              invObj.items = directItems;
            }
          }
        }

        if (!invData) {
          invData = {
            invoice_number: t.reference,
            invoice_date: t.date,
            total_amount: t.debit,
            subtotal: t.debit,
            paid_amount: 0,
            customers: selectedCustomer,
            invoice_items: [
              {
                productName: t.description || 'مبيعات بضاعة / خدمات',
                quantity: 1,
                unit_price: t.debit,
                total: t.debit
              }
            ]
          };
        }

        setPrintDoc({ type: 'invoice', data: invData });
        setPrintingDocId(null);
        showToast('تم فتح معاينة الفاتورة بنجاح', 'success');
        return;
      }

      if (t.type === 'receipt') {
        showToast('جاري تجهيز سند القبض للطباعة...', 'info');
        let voucherData: Record<string, unknown> | null = null;
        if (t.docId) {
          const { data, error } = await supabase
            .from('receipt_vouchers')
            .select('*, customers(id, name, phone, address)')
            .eq('id', t.docId)
            .maybeSingle();
          if (!error && data) voucherData = data;
        }

        if (!voucherData && t.reference) {
          const cleanRef = t.reference.replace(/^(RV-|CHQ-)/i, '');
          const { data, error } = await supabase
            .from('receipt_vouchers')
            .select('*, customers(id, name, phone, address)')
            .or(`voucher_number.eq.${t.reference},voucher_number.ilike.%${cleanRef}%`)
            .limit(1)
            .maybeSingle();
          if (!error && data) voucherData = data;
        }

        if (!voucherData) {
          voucherData = {
            voucher_number: t.reference,
            receipt_date: t.date,
            amount: t.credit,
            notes: t.description,
            customers: selectedCustomer,
            party_id: selectedCustomerId,
            subType: 'customer',
            payment_method: t.reference?.startsWith('CHQ') ? 'cheque' : 'cash'
          };
        }

        setPrintDoc({ type: 'receipt', data: voucherData });
        setPrintingDocId(null);
        showToast('تم فتح معاينة سند القبض بنجاح', 'success');
        return;
      }

      if (t.type === 'pos_order') {
        showToast('جاري تجهيز طلب الكاشير للطباعة...', 'info');
        let orderData: Record<string, unknown> | null = null;
        if (t.docId) {
          const { data, error } = await supabase
            .from('orders')
            .select('*, order_items(*, products(name, sku, unit))')
            .eq('id', t.docId)
            .maybeSingle();
          if (!error && data) orderData = data;
        }
        if (!orderData && t.reference) {
          const { data, error } = await supabase
            .from('orders')
            .select('*, order_items(*, products(name, sku, unit))')
            .eq('order_number', t.reference)
            .limit(1)
            .maybeSingle();
          if (!error && data) orderData = data;
        }

        const rawOrder = (orderData || {}) as Record<string, unknown>;
        const rawOrderItems = (rawOrder.order_items as Array<Record<string, unknown>>) || [];
        const orderItems = rawOrderItems.map((oi, idx: number) => {
          const prod = oi.products as Record<string, unknown> | undefined;
          return {
            productName: (prod?.name as string) || (oi.product_name as string) || `وجبة / صنف #${idx + 1}`,
            quantity: Number(oi.quantity || 1),
            unit_price: Number(oi.unit_price || 0),
            total: Number(oi.total_price || (Number(oi.quantity || 1) * Number(oi.unit_price || 0)))
          };
        });

        const posInvData = {
          invoice_number: String(rawOrder.order_number || t.reference),
          invoice_date: typeof rawOrder.created_at === 'string' ? rawOrder.created_at.split('T')[0] : t.date,
          total_amount: Number(rawOrder.grand_total || t.debit),
          subtotal: Number(rawOrder.subtotal || t.debit),
          paid_amount: Number(rawOrder.paid_amount || 0),
          customers: selectedCustomer,
          invoice_items: orderItems.length > 0 ? orderItems : [
            {
              productName: t.description || 'طلب نقاط البيع / كاشير',
              quantity: 1,
              unit_price: t.debit,
              total: t.debit
            }
          ]
        };

        setPrintDoc({ type: 'invoice', data: posInvData });
        setPrintingDocId(null);
        showToast('تم فتح معاينة طلب الكاشير بنجاح', 'success');
        return;
      }

      if (t.type === 'return') {
        showToast('جاري تجهيز مرتجع المبيعات للطباعة...', 'info');
        let retData: Record<string, unknown> | null = null;
        if (t.docId) {
          const { data, error } = await supabase
            .from('sales_returns')
            .select('*, customers(id, name, phone, address), sales_return_items(*, products(name))')
            .eq('id', t.docId)
            .maybeSingle();
          if (!error && data) retData = data;
        }
        if (!retData && t.reference) {
          const cleanRef = t.reference.replace(/^SR-/i, '');
          const { data, error } = await supabase
            .from('sales_returns')
            .select('*, customers(id, name, phone, address), sales_return_items(*, products(name))')
            .or(`return_number.eq.${t.reference},return_number.ilike.%${cleanRef}%`)
            .limit(1)
            .maybeSingle();
          if (!error && data) retData = data;
        }
        if (!retData) {
          retData = {
            return_number: t.reference,
            return_date: t.date,
            total_amount: t.credit,
            customers: selectedCustomer,
            notes: t.description,
            sales_return_items: [
              {
                productName: t.description || 'مرتجع مبيعات',
                quantity: 1,
                unit_price: t.credit,
                total: t.credit
              }
            ]
          };
        }
        setPrintDoc({ type: 'return', data: retData });
        setPrintingDocId(null);
        showToast('تم فتح معاينة مرتجع المبيعات بنجاح', 'success');
        return;
      }

      // Default fallback print (credit note or manual journal entry)
      showToast('جاري تجهيز المستند للطباعة...', 'info');
      const fallbackDoc = {
        invoice_number: t.reference,
        invoice_date: t.date,
        total_amount: t.debit || t.credit,
        subtotal: t.debit || t.credit,
        paid_amount: 0,
        customers: selectedCustomer,
        notes: t.description,
        invoice_items: [
          {
            productName: t.description || 'حركة حساب عميل',
            quantity: 1,
            unit_price: t.debit || t.credit,
            total: t.debit || t.credit
          }
        ]
      };
      setPrintDoc({ type: 'invoice', data: fallbackDoc });
      setPrintingDocId(null);
      showToast('تم فتح معاينة المستند بنجاح', 'success');

    } catch (err: unknown) {
      logger.error('Error printing doc in CustomerStatement:', err);
      const errMsg = err instanceof Error ? err.message : String(err);
      showToast('تعذر طباعة المستند: ' + (errMsg || ''), 'error');
      setPrintingDocId(null);
    }
  };

  const handleShareDocWhatsApp = () => {
    if (!printDoc) return;
    const phone = selectedCustomer?.phone || '';
    let msg = '';
    if (printDoc.type === 'invoice') {
      const inv = printDoc.data as any;
      msg = `مرحباً ${selectedCustomer?.name || ''}،
مرفق تفاصيل فاتورة المبيعات من ${settings.companyName}:
رقم الفاتورة: ${inv.invoice_number || '-'}
التاريخ: ${inv.invoice_date || '-'}
المبلغ الإجمالي: ${Number(inv.total_amount || inv.total || 0).toLocaleString()} ${settings.currency}
المدفوع: ${Number(inv.paid_amount || 0).toLocaleString()} ${settings.currency}
المتبقي: ${Math.max(0, Number(inv.total_amount || 0) - Number(inv.paid_amount || 0)).toLocaleString()} ${settings.currency}
شكراً لتعاملكم معنا.`;
    } else if (printDoc.type === 'receipt') {
      const rv = printDoc.data as any;
      msg = `مرحباً ${selectedCustomer?.name || ''}،
مرفق تفاصيل سند القبض من ${settings.companyName}:
رقم السند: ${rv.voucher_number || '-'}
التاريخ: ${rv.receipt_date || rv.date || '-'}
المبلغ المستلم: ${Number(rv.amount || 0).toLocaleString()} ${settings.currency}
طريقة الدفع: ${rv.payment_method === 'cash' ? 'نقداً' : rv.payment_method === 'cheque' ? 'شيك' : 'تحويل بنكي'}
البيان: ${rv.notes || rv.description || 'تحصيل من عميل'}
شكراً لتعاملكم معنا.`;
    } else if (printDoc.type === 'return') {
      const ret = printDoc.data as any;
      msg = `مرحباً ${selectedCustomer?.name || ''}،
مرفق تفاصيل إشعار مرتجع المبيعات من ${settings.companyName}:
رقم الإشعار: ${ret.return_number || '-'}
التاريخ: ${ret.return_date || '-'}
المبلغ: ${Number(ret.total_amount || 0).toLocaleString()} ${settings.currency}
شكراً لتعاملكم معنا.`;
    } else {
      msg = `مرحباً ${selectedCustomer?.name || ''}،
مرفق تفاصيل حركة الحساب من ${settings.companyName}.
شكراً لتعاملكم معنا.`;
    }
    const cleanPhone = phone.replace(/[^0-9]/g, '');
    const url = cleanPhone 
      ? `https://wa.me/${cleanPhone}?text=${encodeURIComponent(msg)}`
      : `https://wa.me/?text=${encodeURIComponent(msg)}`;
    window.open(url, '_blank');
  };

  return (
    <div className="space-y-6 animate-in fade-in">
      {/* فرد طباعة المستندات المستقلة */}
      {printDoc?.type === 'invoice' && (
        <SalesInvoicePrint invoice={printDoc.data} companySettings={settings} />
      )}
      {printDoc?.type === 'receipt' && (
        <ReceiptVoucherPrint voucher={printDoc.data} companySettings={settings} />
      )}
      {printDoc?.type === 'return' && (
        <SalesReturnPrint returnData={printDoc.data} companySettings={settings} />
      )}

      {/* 📱 نافذة معاينة وطباعة المستند للموبايل وسطح المكتب */}
      {printDoc && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-3 sm:p-6 print:hidden animate-in fade-in">
          <div className="bg-white rounded-3xl w-full max-w-2xl max-h-[92vh] flex flex-col shadow-2xl border border-slate-200 overflow-hidden" dir="rtl">
            {/* Modal Header */}
            <div className="p-4 bg-slate-900 text-white flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-blue-500/20 text-blue-400 flex items-center justify-center">
                  <FileText size={18} />
                </div>
                <div>
                  <h3 className="font-black text-sm sm:text-base">
                    {printDoc.type === 'invoice' ? 'معاينة فاتورة المبيعات' : printDoc.type === 'receipt' ? 'معاينة سند القبض' : printDoc.type === 'return' ? 'معاينة مرتجع المبيعات' : 'معاينة المستند'}
                  </h3>
                  <p className="text-[10px] text-slate-400 font-mono">
                    {printDoc.type === 'invoice' 
                      ? (printDoc.data as any).invoice_number || '-'
                      : printDoc.type === 'receipt'
                      ? (printDoc.data as any).voucher_number || '-'
                      : printDoc.type === 'return'
                      ? (printDoc.data as any).return_number || '-'
                      : '-'}
                  </p>
                </div>
              </div>
              <button 
                type="button"
                onClick={() => setPrintDoc(null)}
                className="p-1.5 text-slate-400 hover:text-white rounded-xl hover:bg-slate-800 transition-colors"
                title="إغلاق"
              >
                <X size={20} />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-4 sm:p-6 overflow-y-auto flex-1 bg-slate-50 space-y-4">
              {printDoc.type === 'invoice' ? (() => {
                const inv = printDoc.data as any;
                const items = inv.items || inv.invoice_items || [];
                const total = Number(inv.total_amount || inv.total || 0);
                const paid = Number(inv.paid_amount || 0);
                const remaining = Math.max(0, total - paid);

                return (
                  <div className="space-y-4">
                    {/* معلومات أساسية */}
                    <div className="grid grid-cols-2 gap-3 bg-white p-3.5 rounded-2xl border border-slate-200 text-xs">
                      <div>
                        <span className="text-slate-400 font-bold block text-[10px]">العميل:</span>
                        <span className="font-black text-slate-800 text-sm">{selectedCustomer?.name || '-'}</span>
                      </div>
                      <div>
                        <span className="text-slate-400 font-bold block text-[10px]">تاريخ الفاتورة:</span>
                        <span className="font-mono font-bold text-slate-700">{inv.invoice_date || '-'}</span>
                      </div>
                    </div>

                    {/* جدول الأصناف المصغر */}
                    <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
                      <div className="p-3 bg-slate-100 border-b border-slate-200 font-black text-xs text-slate-700">
                        بنود الفاتورة ({items.length})
                      </div>
                      <div className="divide-y divide-slate-100 max-h-48 overflow-y-auto">
                        {items.map((rawItem: unknown, i: number) => {
                          const item = rawItem as Record<string, unknown>;
                          const productName = (item.products as Record<string, unknown> | undefined)?.name || item.productName || item.description || `بند #${i + 1}`;
                          const qty = Number(item.quantity || 1);
                          const unitPrice = Number(item.unit_price || item.unitPrice || 0);
                          const itemTotal = Number(item.total || (qty * unitPrice));

                          return (
                            <div key={i} className="p-3 flex justify-between items-center text-xs">
                              <div>
                                <div className="font-bold text-slate-800">{String(productName)}</div>
                                <div className="text-[10px] text-slate-400">
                                  {qty} × {unitPrice.toLocaleString()} {settings.currency}
                                </div>
                              </div>
                              <div className="font-mono font-black text-slate-900" dir="ltr">
                                {itemTotal.toLocaleString()}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* الملخص المالي */}
                    <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4 space-y-2">
                      <div className="flex justify-between items-center text-xs">
                        <span className="text-slate-600 font-bold">إجمالي الفاتورة:</span>
                        <span className="font-mono font-black text-blue-700 text-base" dir="ltr">{total.toLocaleString()} {settings.currency}</span>
                      </div>
                      <div className="flex justify-between items-center text-xs">
                        <span className="text-slate-600 font-bold">المسدد فورياً:</span>
                        <span className="font-mono font-black text-emerald-600" dir="ltr">{paid.toLocaleString()} {settings.currency}</span>
                      </div>
                      <div className="flex justify-between items-center text-xs pt-2 border-t border-blue-200/60 font-black">
                        <span className="text-slate-800">المتبقي على الحساب:</span>
                        <span className="font-mono font-black text-red-600" dir="ltr">{remaining.toLocaleString()} {settings.currency}</span>
                      </div>
                    </div>
                  </div>
                );
              })() : printDoc.type === 'receipt' ? (() => {
                const rv = printDoc.data as any;
                const amt = Number(rv.amount || 0);

                return (
                  <div className="space-y-4">
                    <div className="bg-white p-4 rounded-2xl border border-slate-200 text-center space-y-1">
                      <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">المبلغ المقبوض</span>
                      <div className="text-3xl font-black font-mono text-emerald-600" dir="ltr">
                        {amt.toLocaleString()} <span className="text-sm font-normal text-slate-600">{settings.currency}</span>
                      </div>
                    </div>

                    <div className="bg-white p-4 rounded-2xl border border-slate-200 space-y-2.5 text-xs">
                      <div className="flex justify-between items-center pb-2 border-b border-slate-100">
                        <span className="text-slate-400 font-bold">رقم السند:</span>
                        <span className="font-mono font-black text-slate-800">{rv.voucher_number || '-'}</span>
                      </div>
                      <div className="flex justify-between items-center pb-2 border-b border-slate-100">
                        <span className="text-slate-400 font-bold">التاريخ:</span>
                        <span className="font-mono font-bold text-slate-700">{rv.receipt_date || rv.date || '-'}</span>
                      </div>
                      <div className="flex justify-between items-center pb-2 border-b border-slate-100">
                        <span className="text-slate-400 font-bold">طريقة القبض:</span>
                        <span className="font-bold text-slate-800">
                          {rv.payment_method === 'cash' ? '💵 نقداً (خزينة)' : rv.payment_method === 'cheque' ? '🏦 شيك بنكي' : '💳 تحويل بنكي'}
                        </span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-slate-400 font-bold">البيان:</span>
                        <span className="font-medium text-slate-800">{rv.notes || rv.description || 'تحصيل من عميل'}</span>
                      </div>
                    </div>
                  </div>
                );
              })() : (() => {
                const doc = printDoc.data as any;
                const amt = Number(doc.total_amount || doc.amount || 0);

                return (
                  <div className="space-y-4">
                    <div className="bg-white p-4 rounded-2xl border border-slate-200 text-center space-y-1">
                      <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">قيمة المستند</span>
                      <div className="text-3xl font-black font-mono text-amber-600" dir="ltr">
                        {amt.toLocaleString()} <span className="text-sm font-normal text-slate-600">{settings.currency}</span>
                      </div>
                    </div>

                    <div className="bg-white p-4 rounded-2xl border border-slate-200 space-y-2.5 text-xs">
                      <div className="flex justify-between items-center pb-2 border-b border-slate-100">
                        <span className="text-slate-400 font-bold">رقم المستند:</span>
                        <span className="font-mono font-black text-slate-800">{doc.return_number || doc.invoice_number || '-'}</span>
                      </div>
                      <div className="flex justify-between items-center pb-2 border-b border-slate-100">
                        <span className="text-slate-400 font-bold">التاريخ:</span>
                        <span className="font-mono font-bold text-slate-700">{doc.return_date || doc.invoice_date || '-'}</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-slate-400 font-bold">البيان:</span>
                        <span className="font-medium text-slate-800">{doc.notes || doc.description || '-'}</span>
                      </div>
                    </div>
                  </div>
                );
              })()}
            </div>

            {/* Modal Footer */}
            <div className="p-4 bg-white border-t border-slate-200 flex flex-wrap items-center justify-between gap-2 shrink-0">
              <button
                type="button"
                onClick={() => setPrintDoc(null)}
                className="px-4 py-2 border border-slate-300 rounded-xl text-slate-700 hover:bg-slate-100 text-xs font-bold transition-all cursor-pointer"
              >
                إغلاق
              </button>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleShareDocWhatsApp}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-sm transition-all active:scale-95 cursor-pointer"
                >
                  <MessageCircle size={15} />
                  <span>مشاركة واتساب</span>
                </button>

                <button
                  type="button"
                  onClick={() => window.print()}
                  className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-sm transition-all active:scale-95 cursor-pointer"
                >
                  <Printer size={15} />
                  <span>طباعة / PDF</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      <div className="flex justify-between items-center print:hidden">
          <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
          <FileText className="text-blue-600" /> كشف حساب عميل
          </h2>
          <div className="flex gap-2">
            <button onClick={handleWhatsApp} disabled={!selectedCustomerId} className="bg-emerald-500 text-white px-4 py-2 rounded-lg flex items-center gap-2 shadow-sm hover:bg-emerald-600 disabled:opacity-50">
                <MessageCircle size={18}/> واتساب
            </button>
            <button onClick={handleExportExcel} disabled={!selectedCustomerId} className="bg-emerald-600 text-white px-4 py-2 rounded-lg flex items-center gap-2 shadow-sm hover:bg-emerald-700 disabled:opacity-50">
                <Download size={18}/> تصدير Excel
            </button>
            <button onClick={() => window.print()} className="bg-slate-800 text-white px-4 py-2 rounded-lg flex items-center gap-2 shadow-sm hover:bg-slate-700">
                <Printer size={18}/> طباعة
            </button>
          </div>
      </div>

      <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 print:hidden grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs font-bold text-slate-400 mb-1 uppercase">العميل</label>
            <div className="relative">
                <select value={selectedCustomerId} onChange={e => setSelectedCustomerId(e.target.value)} className="w-full border rounded-lg p-2.5 font-bold bg-slate-50 outline-none focus:border-blue-500 transition-all appearance-none">
                    <option value="">-- اختر العميل --</option>
                    {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
                <Search className="absolute left-3 top-3 text-slate-400" size={18} />
            </div>
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-400 mb-1 uppercase">من تاريخ</label>
            <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="w-full border rounded-lg p-2 bg-slate-50" />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-400 mb-1 uppercase">إلى تاريخ</label>
            <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="w-full border rounded-lg p-2 bg-slate-50" />
          </div>
          <div className="md:col-span-3 flex items-center gap-2 mt-2 pt-4 border-t border-slate-100">
            <input 
              type="checkbox" 
              id="unpostedFilter" 
              checked={showUnpostedOnly} 
              onChange={e => setShowUnpostedOnly(e.target.checked)} 
              className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500 cursor-pointer"
            />
            <label htmlFor="unpostedFilter" className="text-sm font-bold text-slate-700 cursor-pointer select-none">
              إظهار فقط الحركات التي ليس لها قيد يومية (وضع المراجعة والتدقيق)
            </label>
          </div>
      </div>

      {unpostedCount > 0 && (
          <div className="bg-red-50 border-2 border-red-200 p-4 rounded-xl flex items-center justify-between animate-bounce print:hidden">
              <div className="flex items-center gap-4">
                  <div className="bg-red-100 p-2 rounded-lg">
                      <ShieldAlert className="text-red-600" size={24} />
                  </div>
                  <div>
                      <h4 className="font-black text-red-900 text-sm">تنبيه عدم تطابق محاسبي!</h4>
                      <p className="text-red-700 text-xs font-bold">يوجد عدد ({unpostedCount}) مستندات في كشف الحساب لم يتم إنشاء قيود يومية لها. هذا سيجعل رصيد دفتر الأستاذ غير مطابق لرصيد العميل.</p>
                  </div>
              </div>
              <button 
                onClick={handleFixAll}
                disabled={loading}
                className="bg-red-600 text-white px-6 py-2 rounded-lg font-black text-sm hover:bg-red-700 transition-all shadow-md flex items-center gap-2 shrink-0"
              >
                {loading ? <Loader2 className="animate-spin" size={16} /> : <RefreshCw size={16} />}
                إصلاح الكل الآن
              </button>
          </div>
      )}

      {selectedCustomerId && (
          <div id="printable-statement" className={`bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden p-8 animate-in fade-in print:break-after-page ${printDoc ? 'print:hidden' : ''}`}>

              <div className="flex justify-between mb-8 border-b pb-6">
                  <div>
                      <h1 className="text-2xl font-bold text-slate-900">{settings.companyName}</h1>
                      <p className="text-slate-500 font-bold mt-1">كشف حساب العميل: {selectedCustomer?.name}</p>
                      {selectedCustomer?.phone && <p className="text-xs text-slate-400">هاتف: {selectedCustomer.phone}</p>}
                  </div>
                  <div className="text-left">
                      <div className="bg-blue-600 text-white px-4 py-2 rounded-lg inline-block font-black text-xl mb-2" dir="ltr">
                        {closingBalance.toLocaleString()} <span className="text-sm">{settings.currency}</span>
                      </div>
                      <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest">الرصيد الحالي (المستحق على العميل)</p>
                  </div>
              </div>

              {loading ? (
                  <div className="py-12 text-center"><Loader2 className="animate-spin mx-auto text-blue-600" size={32} /></div>
              ) : (
                <>
                  {/* 📱 عرض البطاقات المتجاوبة لشاشات الموبايل (Mobile Cards View) */}
                  <div className="md:hidden space-y-3 print:hidden">
                    {/* بطاقة الرصيد الافتتاحي */}
                    <div className="bg-slate-50 border border-slate-200 rounded-2xl p-3.5 flex justify-between items-center text-xs">
                      <span className="font-bold text-slate-600">رصيد افتتاحي (ما قبل الفترة)</span>
                      <span className="font-mono font-black text-slate-900" dir="ltr">{openingBalance.toLocaleString()} {settings.currency}</span>
                    </div>

                    {displayedTransactions.map((t, idx) => {
                      const isInvoice = t.type === 'invoice';
                      const isReceipt = t.type === 'receipt';
                      const isReturn = t.type === 'return';
                      const isPos = t.type === 'pos_order';
                      const badgeColor = isInvoice ? 'bg-blue-100 text-blue-800' : isReceipt ? 'bg-emerald-100 text-emerald-800' : isReturn ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-800';
                      const badgeLabel = isInvoice ? 'فاتورة مبيعات' : isReceipt ? 'سند قبض' : isReturn ? 'مرتجع مبيعات' : isPos ? 'طلب كاشير' : 'حركة';

                      return (
                        <div key={t.id || idx} className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs space-y-3">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <span className={`text-[10px] font-black px-2 py-0.5 rounded-lg ${badgeColor}`}>
                                {badgeLabel}
                              </span>
                              <span className="font-mono font-bold text-xs text-blue-600">
                                {t.reference?.startsWith('OP-CUST-') ? 'رصيد افتتاحي' : t.reference?.replace(/^(CHQ-|RV-|INV-|SR-|OB-|OP-CUST-|OP-)/, '')}
                              </span>
                            </div>
                            <span className="text-[11px] text-slate-400 font-bold">{t.date}</span>
                          </div>

                          {t.description && (
                            <p className="text-xs text-slate-700 font-medium whitespace-pre-line leading-relaxed">
                              {t.description}
                            </p>
                          )}

                          <div className="grid grid-cols-2 gap-2 bg-slate-50 p-2.5 rounded-xl text-xs">
                            <div>
                              <span className="text-[10px] text-slate-400 font-bold block">مدين (فاتورة):</span>
                              <span className={`font-mono font-black ${t.debit > 0 ? 'text-emerald-600' : 'text-slate-400'}`}>
                                {t.debit > 0 ? t.debit.toLocaleString() : '-'}
                              </span>
                            </div>
                            <div>
                              <span className="text-[10px] text-slate-400 font-bold block">دائن (سداد):</span>
                              <span className={`font-mono font-black ${t.credit > 0 ? 'text-red-600' : 'text-slate-400'}`}>
                                {t.credit > 0 ? t.credit.toLocaleString() : '-'}
                              </span>
                            </div>
                          </div>

                          <div className="flex items-center justify-between pt-1 border-t border-slate-100">
                            <div>
                              <span className="text-[10px] text-slate-400 font-bold block">الرصيد بعد الحركة:</span>
                              <span className="font-mono font-black text-slate-900 text-sm" dir="ltr">
                                {t.balance.toLocaleString()} {settings.currency}
                              </span>
                            </div>

                            <button
                              type="button"
                              onClick={() => handlePrintDoc(t)}
                              disabled={printingDocId === t.id}
                              className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-blue-50 text-slate-700 hover:text-blue-700 rounded-xl text-xs font-bold transition-all border border-slate-200 active:scale-95 cursor-pointer"
                            >
                              {printingDocId === t.id ? (
                                <Loader2 size={14} className="animate-spin text-blue-600" />
                              ) : (
                                <Printer size={14} />
                              )}
                              <span>معاينة المستند</span>
                            </button>
                          </div>
                        </div>
                      );
                    })}

                    {displayedTransactions.length === 0 && (
                      <div className="p-8 text-center text-slate-400 bg-slate-50 rounded-2xl border border-dashed border-slate-200 text-xs">
                        لا توجد حركات خلال هذه الفترة
                      </div>
                    )}
                  </div>

                  {/* 🖥️ جدول العرض المكتبي والطباعة الورقية */}
                  <div className="hidden md:block overflow-x-auto print:block">
                  <table className="w-full text-right text-sm">
                      <thead className="bg-slate-100 border-y border-slate-200 text-slate-500 font-black uppercase">
                          <tr>
                              <th className="p-4">التاريخ</th>
                              <th className="p-4">المستند</th>
                              <th className="p-4">البيان</th>
                              <th className="p-4 text-center">مدين (فاتورة)</th>
                              <th className="p-4 text-center">دائن (سداد)</th>
                              <th className="p-4 text-center">الرصيد</th>
                              <th className="p-4 text-center print:hidden w-16">طباعة</th>
                          </tr>
                      </thead>
                        {/* 🖥️ جدول العرض التفاعلي على الشاشة (يدعم ترقيم الصفحات وسرعة التصفح) */}
                        <tbody className="divide-y divide-slate-100 print:hidden">
                            <tr className="bg-slate-50 font-bold text-slate-500">
                                <td colSpan={5} className="p-4">رصيد افتتاحي (ما قبل الفترة)</td>
                                <td className="p-4 text-center font-mono" dir="ltr">{openingBalance.toLocaleString()}</td>
                                <td className="p-4 print:hidden"></td>
                            </tr>
                            {displayedTransactions.map((t, idx) => (
                                <tr key={t.id || idx} className="hover:bg-slate-50 transition-colors">
                                    <td className="p-4 text-slate-500 whitespace-nowrap">{t.date}</td>
                                    <td className="p-4 font-mono font-bold text-blue-600 flex items-center gap-2">
                                        {/* إخفاء البادئات عند العرض فقط ليكون المظهر أنيقاً وموحداً */}
                                        {t.reference.startsWith('OP-CUST-') ? 'رصيد افتتاحي' : t.reference.replace(/^(CHQ-|RV-|INV-|SR-|OB-|OP-CUST-|OP-)/, '')}
                                        {!t.isPosted && t.type !== 'pos_order' && (
                                            <span title="هذا المستند ليس له قيد يومية!"><AlertTriangle size={14} className="text-red-500" /></span>
                                        )}
                                        {t.type === 'pos_order' && !t.isPosted && (
                                            <span className="text-[10px] bg-amber-50 text-amber-600 px-2 py-0.5 rounded border border-amber-200 font-bold">
                                                بانتظار إغلاق الوردية
                                            </span>
                                        )}
                                    </td>
                                    <td className="p-4 text-slate-700">{t.description}</td>
                                    <td className="p-4 text-center font-bold text-emerald-600">{t.debit > 0 ? t.debit.toLocaleString() : '-'}</td>
                                    <td className="p-4 text-center font-bold text-red-600">{t.credit > 0 ? t.credit.toLocaleString() : '-'}</td>
                                    <td className="p-4 text-center font-mono font-black bg-slate-50/50" dir="ltr">{t.balance.toLocaleString()}</td>
                                    <td className="p-4 text-center print:hidden">
                                        <button
                                          type="button"
                                          onClick={() => handlePrintDoc(t)}
                                          disabled={printingDocId === t.id}
                                          className="p-1.5 text-slate-400 hover:text-blue-700 hover:bg-blue-50 rounded-lg border border-slate-200 transition-all shadow-sm hover:scale-105 active:scale-95 cursor-pointer"
                                          title={`طباعة ${t.type === 'invoice' ? 'فاتورة المبيعات' : t.type === 'receipt' ? 'سند القبض' : t.type === 'return' ? 'مرتجع المبيعات' : t.type === 'pos_order' ? 'طلب الكاشير' : 'المستند'}`}
                                        >
                                          {printingDocId === t.id ? (
                                            <Loader2 size={15} className="animate-spin text-blue-600" />
                                          ) : (
                                            <Printer size={15} />
                                          )}
                                        </button>
                                    </td>
                                </tr>
                            ))}
                            {displayedTransactions.length === 0 && (
                                <tr><td colSpan={7} className="p-8 text-center text-slate-400">لا توجد حركات خلال هذه الفترة</td></tr>
                            )}
                        </tbody>

                        {/* 🖨️ جدول الطباعة الشامل (يظهر فقط عند أمر الطباعة لطباعة 100% من الحركات) */}
                        <tbody className="divide-y divide-slate-100 hidden print:table-row-group">
                            <tr className="bg-slate-50 font-bold text-slate-500">
                                <td colSpan={5} className="p-4">رصيد افتتاحي (ما قبل الفترة)</td>
                                <td className="p-4 text-center font-mono" dir="ltr">{openingBalance.toLocaleString()}</td>
                            </tr>
                            {filteredTransactions.map((t, idx) => (
                                <tr key={t.id || idx}>
                                    <td className="p-4 text-slate-500 whitespace-nowrap">{t.date}</td>
                                    <td className="p-4 font-mono font-bold text-blue-600">
                                        {t.reference.startsWith('OP-CUST-') ? 'رصيد افتتاحي' : t.reference.replace(/^(CHQ-|RV-|INV-|SR-|OB-|OP-CUST-|OP-)/, '')}
                                    </td>
                                    <td className="p-4 text-slate-700">{t.description}</td>
                                    <td className="p-4 text-center font-bold text-emerald-600">{t.debit > 0 ? t.debit.toLocaleString() : '-'}</td>
                                    <td className="p-4 text-center font-bold text-red-600">{t.credit > 0 ? t.credit.toLocaleString() : '-'}</td>
                                    <td className="p-4 text-center font-mono font-black" dir="ltr">{t.balance.toLocaleString()}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                  </div>

                    {/* 📄 شريط ترقيم صفحات كشف الحساب وتحديد عدد الحركات */}
                    {filteredTransactions.length > 0 && (
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
                            className="bg-slate-50 border border-slate-300 rounded-lg px-2.5 py-1 text-slate-800 font-bold focus:outline-none focus:ring-2 focus:ring-blue-500"
                          >
                            <option value={25}>25 حركة</option>
                            <option value={50}>50 حركة</option>
                            <option value={100}>100 حركة</option>
                            <option value="all">عرض الكل ({filteredTransactions.length})</option>
                          </select>
                          <span>
                            | حركة {pageSize === 'all' ? 1 : (currentPage - 1) * pageSize + 1} إلى {pageSize === 'all' ? filteredTransactions.length : Math.min(currentPage * pageSize, filteredTransactions.length)} من أصل {filteredTransactions.length}
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
                            <span className="px-3 py-1 bg-blue-50 text-blue-700 border border-blue-200 rounded-lg font-black font-mono">
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

export default CustomerStatement;

import { supabase } from '../supabaseClient';

export interface PaginatedBalanceResult<T> {
  data: T[];
  totalCount: number;
}

export interface SupplierBalanceSummaryRow {
  supplier_id: string;
  supplier_name: string;
  phone: string;
  tax_number: string;
  opening_balance: number;
  total_purchases: number;
  balance: number;
  last_invoice: string | null;
  total_count: number;
}

export interface CustomerBalanceSummaryRow {
  customer_id: string;
  customer_name: string;
  phone: string;
  tax_number: string;
  opening_balance: number;
  total_sales: number;
  balance: number;
  last_invoice: string | null;
  total_count: number;
}

export interface AgingLedgerRow {
  party_id: string;
  party_name: string;
  phone: string;
  range_0_30: number;
  range_31_60: number;
  range_61_90: number;
  range_90_plus: number;
  total_balance: number;
}

/**
 * أداة استعلام تجلب جميع السجلات دفعة واحدة بأمان متجاوزة سقف الـ 1000 الافتراضي في Supabase
 * (تُستخدم كاحتياطي أمان Fallback في حال تعذر تشغيل RPC السيرفر)
 */
export async function fetchCompleteDataset<T = any>(
  buildQuery: (from: number, to: number) => Promise<{ data: T[] | null; error: any }>
): Promise<T[]> {
  const CHUNK_SIZE = 1000;
  let allRows: T[] = [];
  let currentStart = 0;

  while (true) {
    const { data, error } = await buildQuery(currentStart, currentStart + CHUNK_SIZE - 1);
    if (error) {
      console.error('[balanceService] Error fetching chunk:', error);
      break;
    }
    if (!data || data.length === 0) break;
    allRows = allRows.concat(data);
    if (data.length < CHUNK_SIZE) break;
    currentStart += CHUNK_SIZE;
  }

  return allRows;
}

/**
 * جلب أرصدة الموردين بالكامل (Map: supplierId -> balance)
 * الأولوية 1: استدعاء دالة قاعدة البيانات السريعة get_all_supplier_balances_fast (زمن استجابة < 20ms)
 * الأولوية 2: تجميع المتصفح كاحتياطي أمان (Fallback)
 */
export async function fetchAllSupplierBalances(orgId: string): Promise<Map<string, number>> {
  const balances = new Map<string, number>();
  if (!orgId) return balances;

  // 1. محاولة جلب الأرصدة عبر محرك قاعدة البيانات المباشر
  try {
    const { data: rpcRows, error: rpcError } = await (supabase.rpc as any)('get_all_supplier_balances_fast', {
      p_org_id: orgId,
      p_search: null,
      p_limit: 10000,
      p_offset: 0
    });

    if (!rpcError && Array.isArray(rpcRows)) {
      rpcRows.forEach((row: any) => {
        balances.set(row.supplier_id, Number(row.balance || 0));
      });
      return balances;
    }
  } catch (rpcEx) {
    console.warn('[balanceService] Fast RPC failed, falling back to dataset calculation:', rpcEx);
  }

  // 2. الاحتياطي: التجميع بالمتصفح
  const filter = { organization_id: orgId };

  const [
    suppliers,
    invoices,
    payments,
    returns,
    debitNotes,
    cheques,
    rebates,
    subs,
    contracts,
    subBillings,
    manualJournalLines,
    openingJournalLines
  ] = await Promise.all([
    fetchCompleteDataset(async (from, to) => supabase.from('suppliers').select('id, name, opening_balance').match(filter).is('deleted_at', null).range(from, to)),
    fetchCompleteDataset(async (from, to) => supabase.from('purchase_invoices').select('supplier_id, total_amount, paid_amount, invoice_number').match(filter).neq('status', 'draft').range(from, to)),
    fetchCompleteDataset(async (from, to) => supabase.from('payment_vouchers').select('supplier_id, amount, notes, voucher_number').match(filter).not('supplier_id', 'is', null).range(from, to)),
    fetchCompleteDataset(async (from, to) => supabase.from('purchase_returns').select('supplier_id, total_amount, return_number').match(filter).neq('status', 'draft').range(from, to)),
    fetchCompleteDataset(async (from, to) => supabase.from('debit_notes').select('supplier_id, total_amount, debit_note_number').match(filter).eq('status', 'posted').range(from, to)),
    fetchCompleteDataset(async (from, to) => supabase.from('cheques').select('party_id, amount, cheque_number').match(filter).eq('type', 'outgoing').neq('status', 'rejected').range(from, to)),
    fetchCompleteDataset(async (from, to) => supabase.from('vendor_rebate_settlements').select('vendor_id, total_claim_amount').match(filter).in('status', ['APPROVED', 'SETTLED']).range(from, to)),
    fetchCompleteDataset(async (from, to) => supabase.from('subcontractors').select('id, name, supplier_id').match(filter).range(from, to)),
    fetchCompleteDataset(async (from, to) => supabase.from('subcontractor_contracts').select('id, subcontractor_id').match(filter).range(from, to)),
    fetchCompleteDataset(async (from, to) => supabase.from('subcontractor_billings').select('contract_id, net_amount').match(filter).neq('status', 'draft').range(from, to)),
    // قيود اليومية اليدوية المؤثرة على حسابات الموردين
    fetchCompleteDataset(async (from, to) => 
      supabase.from('journal_lines')
        .select('debit, credit, account_id, journal_entries!inner(id, transaction_date, description, reference, status, related_document_id, related_document_type), accounts!inner(code, name)')
        .eq('journal_entries.status', 'posted')
        .or('code.ilike.201%,code.ilike.221%,code.ilike.2101%,name.ilike.%الموردين%,name.ilike.%موردين%', { foreignTable: 'accounts' })
        .match(filter)
        .range(from, to)
    ),
    // قيود الأرصدة الافتتاحية للموردين
    fetchCompleteDataset(async (from, to) =>
      supabase.from('journal_lines')
        .select('debit, credit, account_id, journal_entries!inner(id, transaction_date, description, reference, status, related_document_id, related_document_type), accounts!inner(code, name)')
        .eq('journal_entries.status', 'posted')
        .eq('journal_entries.related_document_type', 'opening_balance')
        .or('code.ilike.201%,code.ilike.221%,code.ilike.2101%,name.ilike.%الموردين%,name.ilike.%موردين%', { foreignTable: 'accounts' })
        .match(filter)
        .range(from, to)
    )
  ]);

  if (!suppliers) return balances;

  const subContractMap = new Map<string, string>();
  contracts?.forEach(c => subContractMap.set(c.id, c.subcontractor_id));

  const subBillingsTotalBySubId = new Map<string, number>();
  subBillings?.forEach(sb => {
    const subId = subContractMap.get(sb.contract_id);
    if (subId) {
      subBillingsTotalBySubId.set(subId, (subBillingsTotalBySubId.get(subId) || 0) + Number(sb.net_amount || 0));
    }
  });

  const cleanRef = (r: string) => (r || '').toString().trim().toUpperCase()
    .replace(/^(CHQ-|PV-|PINV-|PUR-|PR-|DN-|JV-|SUB-BILL-|SUB-|OP-SUPP-|OP-)/i, '');

  suppliers.forEach(supplier => {
    const rawOpening = Number(supplier.opening_balance || 0);
    const sName = (supplier.name || '').trim().toLowerCase();
    const cleanSupplierName = sName.replace(/[\u064B-\u065F\u0670\u0640]/g, '').replace(/[أإآٱ]/g, 'ا').replace(/ة/g, 'ه').replace(/[ىي]/g, 'ي');

    // 1. الفواتير
    const suppInvoices = invoices?.filter(i => i.supplier_id === supplier.id) || [];
    const totalInvoiced = suppInvoices.reduce((sum, inv) => {
      const pvPaidForThisInvoice = payments?.filter(p => p.supplier_id === supplier.id && p.notes && inv.invoice_number && p.notes.includes(inv.invoice_number)).reduce((s, p) => s + Number(p.amount || 0), 0) || 0;
      const immediatePaidAtCheckout = Math.max(0, Number(inv.paid_amount || 0) - pvPaidForThisInvoice);
      return sum + (Number(inv.total_amount || 0) - immediatePaidAtCheckout);
    }, 0);

    // 2. مستخلصات مقاولي الباطن
    let contractorBillings = 0;
    subs?.forEach(sub => {
      const subName = (sub.name || '').trim().toLowerCase();
      if ((sub as any).supplier_id === supplier.id || sub.id === supplier.id || (subName && (sName === subName || sName.includes(subName) || subName.includes(sName)))) {
        contractorBillings += (subBillingsTotalBySubId.get(sub.id) || 0);
      }
    });

    // 3. السدادات والمردودات والخصومات
    const totalRebates = rebates?.filter(reb => reb.vendor_id === supplier.id).reduce((sum, reb) => sum + Number(reb.total_claim_amount || 0), 0) || 0;
    const totalPaid = (payments?.filter(p => p.supplier_id === supplier.id).reduce((sum, p) => sum + Number(p.amount || 0), 0) || 0) +
                      (returns?.filter(r => r.supplier_id === supplier.id).reduce((sum, r) => sum + Number(r.total_amount || 0), 0) || 0) +
                      (debitNotes?.filter(d => d.supplier_id === supplier.id).reduce((sum, d) => sum + Number(d.total_amount || 0), 0) || 0) +
                      (cheques?.filter(c => c.party_id === supplier.id).reduce((sum, c) => sum + Number(c.amount || 0), 0) || 0) +
                      totalRebates;

    // 4. تجميع مراجع المستندات لمنع تكرار أي قيد متولد عن مستند
    const docRefs = new Set<string>();
    suppInvoices.forEach(i => i.invoice_number && docRefs.add(cleanRef(i.invoice_number)));
    returns?.filter(r => r.supplier_id === supplier.id).forEach(r => r.return_number && docRefs.add(cleanRef(r.return_number)));
    payments?.filter(p => p.supplier_id === supplier.id).forEach(p => p.voucher_number && docRefs.add(cleanRef(p.voucher_number)));
    debitNotes?.filter(d => d.supplier_id === supplier.id).forEach(d => d.debit_note_number && docRefs.add(cleanRef(d.debit_note_number)));
    cheques?.filter(c => c.party_id === supplier.id).forEach(c => c.cheque_number && docRefs.add(cleanRef(c.cheque_number)));

    // 5. قيود الرصيد الافتتاحي في اليومية
    let hasOpeningInEntries = false;
    let openingEntriesNet = 0;
    openingJournalLines?.forEach((line: any) => {
      if (line.journal_entries?.related_document_id === supplier.id) {
        hasOpeningInEntries = true;
        openingEntriesNet += (Number(line.credit || 0) - Number(line.debit || 0));
      }
    });

    // 6. قيود اليومية اليدوية والتسويات الخاصة بالمورد
    let manualEntriesNet = 0;
    manualJournalLines?.forEach((line: any) => {
      const je = line.journal_entries;
      if (!je) return;

      const jeDesc = (je.description || '').trim();
      const cleanDesc = jeDesc.replace(/[\u064B-\u065F\u0670\u0640]/g, '').replace(/[أإآٱ]/g, 'ا').replace(/ة/g, 'ه').replace(/[ىي]/g, 'ي');
      const jeRef = (je.reference || '').trim();
      const cleanJeRef = cleanRef(jeRef);

      const isRelated = je.related_document_id === supplier.id;
      const isNameMatched = cleanSupplierName && (
        cleanDesc.includes(cleanSupplierName) || 
        cleanJeRef.includes(cleanSupplierName) ||
        jeRef.includes(supplier.id)
      );

      if (!isRelated && !isNameMatched) return;

      // هل القيد مكرر لمستند مسجل بالفعل؟
      const isDuplicate = cleanJeRef && docRefs.has(cleanJeRef);
      if (isDuplicate) return;

      // هل هو قيد رصيد افتتاحي؟
      const isOpening = jeRef.startsWith('OP-') || jeRef.startsWith('OB-') ||
        je.related_document_type === 'opening_balance' ||
        jeDesc.includes('رصيد افتتاحي');

      if (isOpening) {
        if (!hasOpeningInEntries) {
          hasOpeningInEntries = true;
          openingEntriesNet += (Number(line.credit || 0) - Number(line.debit || 0));
        }
      } else {
        // قيد يدوي: دائن يزيد رصيد المورد، مدين ينقص رصيد المورد
        manualEntriesNet += (Number(line.credit || 0) - Number(line.debit || 0));
      }
    });

    const effectiveOpening = hasOpeningInEntries ? openingEntriesNet : rawOpening;
    const finalBalance = Math.round((effectiveOpening + totalInvoiced + contractorBillings + manualEntriesNet - totalPaid) * 100) / 100;

    balances.set(supplier.id, finalBalance);
  });

  return balances;
}

/**
 * جلب رصيد مورد فردي بدقة فورية فائقة مطابقة 100% لكشف الحساب
 * تشمل: الفواتير، السدادات، الشيكات، مستخلصات المقاولين، وقيود اليومية اليدوية والافتتاحية
 */
export async function fetchSingleSupplierBalance(
  supplierId: string, 
  orgId: string, 
  supplierName?: string
): Promise<number> {
  if (!supplierId || !orgId) return 0;

  try {
    let name = (supplierName || '').trim();
    let rawOpening = 0;

    // جلب بطاقة المورد للتأكد من الاسم والرصيد الافتتاحي
    const { data: supplierRecord } = await supabase
      .from('suppliers')
      .select('id, name, opening_balance')
      .eq('id', supplierId)
      .maybeSingle();

    if (supplierRecord) {
      if (!name) name = (supplierRecord.name || '').trim();
      rawOpening = Number(supplierRecord.opening_balance || 0);
    }

    const filter = { supplier_id: supplierId, organization_id: orgId };

    // جلب جميع الحركات ذات الصلة بالمورد في استعلامات متوازية سريعة
    const [
      invoicesRes,
      paymentsRes,
      returnsRes,
      debitNotesRes,
      chequesRes,
      manualEntriesRes,
      openingEntriesRes,
      subsRes
    ] = await Promise.all([
      supabase.from('purchase_invoices')
        .select('invoice_number, invoice_date, total_amount, paid_amount')
        .match(filter)
        .neq('status', 'draft'),

      supabase.from('payment_vouchers')
        .select('voucher_number, payment_date, amount, notes')
        .match(filter),

      supabase.from('purchase_returns')
        .select('return_number, total_amount')
        .match(filter)
        .neq('status', 'draft'),

      supabase.from('debit_notes')
        .select('debit_note_number, total_amount')
        .match(filter)
        .eq('status', 'posted'),

      supabase.from('cheques')
        .select('cheque_number, amount')
        .eq('party_id', supplierId)
        .eq('organization_id', orgId)
        .eq('type', 'outgoing')
        .neq('status', 'rejected'),

      // قيود اليومية اليدوية المؤثرة على حسابات الموردين 201 / 221 / 2101
      supabase.from('journal_lines')
        .select('debit, credit, journal_entries!inner(id, transaction_date, description, reference, status, related_document_id), accounts!inner(code, name)')
        .eq('journal_entries.status', 'posted')
        .or('code.ilike.201%,code.ilike.221%,code.ilike.2101%,name.ilike.%الموردين%,name.ilike.%موردين%', { foreignTable: 'accounts' }),

      // قيود الرصيد الافتتاحي في اليومية
      supabase.from('journal_lines')
        .select('debit, credit, journal_entries!inner(id, transaction_date, description, reference, status, related_document_id, related_document_type), accounts!inner(code, name)')
        .eq('journal_entries.status', 'posted')
        .eq('journal_entries.related_document_id', supplierId)
        .eq('journal_entries.related_document_type', 'opening_balance')
        .or('code.ilike.201%,code.ilike.221%,code.ilike.2101%,name.ilike.%الموردين%,name.ilike.%موردين%', { foreignTable: 'accounts' }),

      name ? supabase.from('subcontractors')
        .select('id, name')
        .ilike('name', `%${name}%`)
        .eq('organization_id', orgId)
        : Promise.resolve({ data: [] })
    ]);

    const invoices = invoicesRes.data || [];
    const payments = paymentsRes.data || [];
    const returns = returnsRes.data || [];
    const debitNotes = debitNotesRes.data || [];
    const cheques = chequesRes.data || [];
    const manualEntries = (manualEntriesRes as any).data || [];
    const openingEntries = (openingEntriesRes as any).data || [];
    const matchedSubs = (subsRes as any).data || [];

    // مستخلصات مقاولي الباطن إن وجدت
    let contractorBillings = 0;
    if (matchedSubs.length > 0) {
      const subIds = matchedSubs.map((s: any) => s.id);
      const { data: contracts } = await supabase.from('subcontractor_contracts')
        .select('id')
        .in('subcontractor_id', subIds)
        .eq('organization_id', orgId);

      if (contracts && contracts.length > 0) {
        const contractIds = contracts.map(c => c.id);
        const { data: billings } = await supabase.from('subcontractor_billings')
          .select('net_amount')
          .in('contract_id', contractIds)
          .eq('organization_id', orgId)
          .neq('status', 'draft');

        if (billings) {
          contractorBillings = billings.reduce((sum, b) => sum + Number(b.net_amount || 0), 0);
        }
      }
    }

    // حساب إجمالي الفواتير مع تجنب ازدواجية السداد الفوري
    let totalInvoiced = 0;
    invoices.forEach(inv => {
      const pvPaidForThisInvoice = payments
        .filter(p => p.notes && inv.invoice_number && p.notes.includes(inv.invoice_number))
        .reduce((s, p) => s + Number(p.amount || 0), 0);
      const immediatePaidAtCheckout = Math.max(0, Number(inv.paid_amount || 0) - pvPaidForThisInvoice);
      totalInvoiced += (Number(inv.total_amount || 0) - immediatePaidAtCheckout);
    });

    const totalPaid = (payments.reduce((sum, p) => sum + Number(p.amount || 0), 0)) +
                      (returns.reduce((sum, r) => sum + Number(r.total_amount || 0), 0)) +
                      (debitNotes.reduce((sum, d) => sum + Number(d.total_amount || 0), 0)) +
                      (cheques.reduce((sum, c) => sum + Number(c.amount || 0), 0));

    const cleanRef = (r: string) => (r || '').toString().trim().toUpperCase()
      .replace(/^(CHQ-|PV-|PINV-|PUR-|PR-|DN-|JV-|SUB-BILL-|SUB-|OP-SUPP-|OP-)/i, '');

    const docRefs = new Set<string>();
    invoices.forEach(i => i.invoice_number && docRefs.add(cleanRef(i.invoice_number)));
    returns.forEach((r: any) => r.return_number && docRefs.add(cleanRef(r.return_number)));
    payments.forEach(p => p.voucher_number && docRefs.add(cleanRef(p.voucher_number)));
    debitNotes.forEach((d: any) => d.debit_note_number && docRefs.add(cleanRef(d.debit_note_number)));
    cheques.forEach(c => c.cheque_number && docRefs.add(cleanRef(c.cheque_number)));

    // معالجة قيود الرصيد الافتتاحي
    let hasOpeningInEntries = false;
    let openingEntriesNet = 0;
    openingEntries.forEach((line: any) => {
      hasOpeningInEntries = true;
      openingEntriesNet += (Number(line.credit || 0) - Number(line.debit || 0));
    });

    // معالجة قيود اليومية اليدوية
    const cleanSupplierName = name
      .replace(/[\u064B-\u065F\u0670\u0640]/g, '')
      .replace(/[أإآٱ]/g, 'ا')
      .replace(/ة/g, 'ه')
      .replace(/[ىي]/g, 'ي')
      .toLowerCase();

    let manualEntriesNet = 0;
    manualEntries.forEach((line: any) => {
      const je = line.journal_entries;
      if (!je) return;

      const jeDesc = (je.description || '').trim();
      const cleanDesc = jeDesc.replace(/[\u064B-\u065F\u0670\u0640]/g, '').replace(/[أإآٱ]/g, 'ا').replace(/ة/g, 'ه').replace(/[ىي]/g, 'ي').toLowerCase();
      const jeRef = (je.reference || '').trim();
      const cleanJeRef = cleanRef(jeRef);

      const isRelated = je.related_document_id === supplierId;
      const isNameMatched = cleanSupplierName && (
        cleanDesc.includes(cleanSupplierName) || 
        cleanJeRef.includes(cleanSupplierName) ||
        jeRef.includes(supplierId)
      );

      if (!isRelated && !isNameMatched) return;

      // منع التكرار مع المستندات المسجلة
      const isDuplicate = cleanJeRef && docRefs.has(cleanJeRef);
      if (isDuplicate) return;

      // استبعاد قيود الرصيد الافتتاحي (تم حسابها مسبقاً)
      const isOpening = jeRef.startsWith('OP-') || jeRef.startsWith('OB-') ||
        je.related_document_type === 'opening_balance' ||
        jeDesc.includes('رصيد افتتاحي');

      if (isOpening) {
        if (!hasOpeningInEntries) {
          hasOpeningInEntries = true;
          openingEntriesNet += (Number(line.credit || 0) - Number(line.debit || 0));
        }
      } else {
        manualEntriesNet += (Number(line.credit || 0) - Number(line.debit || 0));
      }
    });

    const effectiveOpening = hasOpeningInEntries ? openingEntriesNet : rawOpening;
    const finalBalance = effectiveOpening + totalInvoiced + contractorBillings + manualEntriesNet - totalPaid;

    return Math.round(finalBalance * 100) / 100;
  } catch (err) {
    console.warn('[balanceService] fetchSingleSupplierBalance calculation error, falling back:', err);
    const balances = await fetchAllSupplierBalances(orgId);
    return balances.get(supplierId) || 0;
  }
}

/**
 * جلب أرصدة العملاء بالكامل (Map: customerId -> balance)
 * الأولوية 1: استدعاء دالة قاعدة البيانات السريعة get_all_customer_balances_fast
 * الأولوية 2: تجميع المتصفح كاحتياطي أمان (Fallback)
 */
export async function fetchAllCustomerBalances(orgId: string): Promise<Map<string, number>> {
  const balances = new Map<string, number>();
  if (!orgId) return balances;

  // 1. محاولة جلب الأرصدة عبر محرك قاعدة البيانات المباشر
  try {
    const { data: rpcRows, error: rpcError } = await (supabase.rpc as any)('get_all_customer_balances_fast', {
      p_org_id: orgId,
      p_search: null,
      p_limit: 10000,
      p_offset: 0
    });

    if (!rpcError && Array.isArray(rpcRows)) {
      rpcRows.forEach((row: any) => {
        balances.set(row.customer_id, Number(row.balance || 0));
      });
      return balances;
    }
  } catch (rpcEx) {
    console.warn('[balanceService] Fast customer RPC failed, falling back to dataset calculation:', rpcEx);
  }

  // 2. الاحتياطي: التجميع بالمتصفح
  const filter = { organization_id: orgId };

  const [
    customers,
    invoices,
    receipts,
    creditNotes,
    cheques,
    projectBillings
  ] = await Promise.all([
    fetchCompleteDataset(async (from, to) => supabase.from('customers').select('id, opening_balance').match(filter).is('deleted_at', null).range(from, to)),
    fetchCompleteDataset(async (from, to) => supabase.from('invoices').select('customer_id, total_amount, paid_amount').match(filter).neq('status', 'draft').neq('status', 'cancelled').range(from, to)),
    fetchCompleteDataset(async (from, to) => supabase.from('receipt_vouchers').select('customer_id, amount').match(filter).not('customer_id', 'is', null).range(from, to)),
    fetchCompleteDataset(async (from, to) => supabase.from('credit_notes').select('customer_id, total_amount').match(filter).eq('status', 'posted').range(from, to)),
    fetchCompleteDataset(async (from, to) => supabase.from('cheques').select('party_id, amount').match(filter).eq('type', 'incoming').neq('status', 'rejected').range(from, to)),
    fetchCompleteDataset(async (from, to) => supabase.from('project_progress_billings').select('customer_id, net_amount').match(filter).neq('status', 'draft').range(from, to))
  ]);

  if (!customers) return balances;

  customers.forEach(customer => {
    const opening = Number(customer.opening_balance || 0);

    const totalInvoiced = invoices?.filter(i => i.customer_id === customer.id).reduce((sum, inv) => {
      return sum + (Number(inv.total_amount || 0) - Number(inv.paid_amount || 0));
    }, 0) || 0;

    const totalProjectBillings = projectBillings?.filter(p => p.customer_id === customer.id).reduce((sum, p) => sum + Number(p.net_amount || 0), 0) || 0;

    const totalReceipts = receipts?.filter(r => r.customer_id === customer.id).reduce((sum, r) => sum + Number(r.amount || 0), 0) || 0;
    const totalCreditNotes = creditNotes?.filter(c => c.customer_id === customer.id).reduce((sum, c) => sum + Number(c.total_amount || 0), 0) || 0;
    const totalCheques = cheques?.filter(c => c.party_id === customer.id).reduce((sum, c) => sum + Number(c.amount || 0), 0) || 0;

    balances.set(customer.id, opening + totalInvoiced + totalProjectBillings - totalReceipts - totalCreditNotes - totalCheques);
  });

  return balances;
}

/**
 * جلب أرصدة الموردين مع الترقيم الصفحي والبحث المباشر من السيرفر (Server-Side Pagination)
 */
export async function fetchPaginatedSupplierBalances(
  orgId: string,
  options?: { search?: string; page?: number; pageSize?: number }
): Promise<PaginatedBalanceResult<SupplierBalanceSummaryRow>> {
  const page = Math.max(1, options?.page || 1);
  const pageSize = Math.max(1, options?.pageSize || 50);
  const offset = (page - 1) * pageSize;
  const search = options?.search?.trim() || null;

  try {
    const { data, error } = await (supabase.rpc as any)('get_all_supplier_balances_fast', {
      p_org_id: orgId,
      p_search: search,
      p_limit: pageSize,
      p_offset: offset
    });

    if (!error && Array.isArray(data)) {
      const totalCount = data.length > 0 ? Number(data[0].total_count || 0) : 0;
      return {
        data: data as SupplierBalanceSummaryRow[],
        totalCount
      };
    }
  } catch (err) {
    console.warn('[balanceService] Error in fetchPaginatedSupplierBalances:', err);
  }

  return { data: [], totalCount: 0 };
}

/**
 * جلب أرصدة العملاء مع الترقيم الصفحي والبحث المباشر من السيرفر (Server-Side Pagination)
 */
export async function fetchPaginatedCustomerBalances(
  orgId: string,
  options?: { search?: string; page?: number; pageSize?: number }
): Promise<PaginatedBalanceResult<CustomerBalanceSummaryRow>> {
  const page = Math.max(1, options?.page || 1);
  const pageSize = Math.max(1, options?.pageSize || 50);
  const offset = (page - 1) * pageSize;
  const search = options?.search?.trim() || null;

  try {
    const { data, error } = await (supabase.rpc as any)('get_all_customer_balances_fast', {
      p_org_id: orgId,
      p_search: search,
      p_limit: pageSize,
      p_offset: offset
    });

    if (!error && Array.isArray(data)) {
      const totalCount = data.length > 0 ? Number(data[0].total_count || 0) : 0;
      return {
        data: data as CustomerBalanceSummaryRow[],
        totalCount
      };
    }
  } catch (err) {
    console.warn('[balanceService] Error in fetchPaginatedCustomerBalances:', err);
  }

  return { data: [], totalCount: 0 };
}

/**
 * جلب تقرير أعمار ديون العملاء المباشر من قاعدة البيانات
 */
export async function fetchCustomerAgingLedger(orgId: string): Promise<AgingLedgerRow[]> {
  try {
    const { data, error } = await (supabase.rpc as any)('get_customer_aging_ledger', {
      p_org_id: orgId
    });

    if (!error && Array.isArray(data)) {
      return data.map((row: any) => ({
        party_id: row.customer_id,
        party_name: row.customer_name,
        phone: row.phone,
        range_0_30: Number(row.range_0_30 || 0),
        range_31_60: Number(row.range_31_60 || 0),
        range_61_90: Number(row.range_61_90 || 0),
        range_90_plus: Number(row.range_90_plus || 0),
        total_balance: Number(row.total_balance || 0)
      }));
    }
  } catch (err) {
    console.warn('[balanceService] Error in fetchCustomerAgingLedger:', err);
  }
  return [];
}

/**
 * جلب تقرير أعمار ديون الموردين المباشر من قاعدة البيانات
 */
export async function fetchSupplierAgingLedger(orgId: string): Promise<AgingLedgerRow[]> {
  try {
    const { data, error } = await (supabase.rpc as any)('get_supplier_aging_ledger', {
      p_org_id: orgId
    });

    if (!error && Array.isArray(data)) {
      return data.map((row: any) => ({
        party_id: row.supplier_id,
        party_name: row.supplier_name,
        phone: row.phone,
        range_0_30: Number(row.range_0_30 || 0),
        range_31_60: Number(row.range_31_60 || 0),
        range_61_90: Number(row.range_61_90 || 0),
        range_90_plus: Number(row.range_90_plus || 0),
        total_balance: Number(row.total_balance || 0)
      }));
    }
  } catch (err) {
    console.warn('[balanceService] Error in fetchSupplierAgingLedger:', err);
  }
  return [];
}

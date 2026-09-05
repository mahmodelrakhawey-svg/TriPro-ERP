import { supabase } from '../supabaseClient';

/**
 * أداة استعلام تجلب جميع السجلات دفعة واحدة بأمان متجاوزة سقف الـ 1000 الافتراضي في Supabase
 */
async function fetchCompleteDataset<T = any>(
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

export async function fetchAllSupplierBalances(orgId: string): Promise<Map<string, number>> {
  const balances = new Map<string, number>();

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
    subBillings
  ] = await Promise.all([
    fetchCompleteDataset(async (from, to) => supabase.from('suppliers').select('id, name, opening_balance').match(filter).is('deleted_at', null).range(from, to)),
    fetchCompleteDataset(async (from, to) => supabase.from('purchase_invoices').select('supplier_id, total_amount, paid_amount, invoice_number').match(filter).neq('status', 'draft').range(from, to)),
    fetchCompleteDataset(async (from, to) => supabase.from('payment_vouchers').select('supplier_id, amount, notes').match(filter).not('supplier_id', 'is', null).range(from, to)),
    fetchCompleteDataset(async (from, to) => supabase.from('purchase_returns').select('supplier_id, total_amount').match(filter).neq('status', 'draft').range(from, to)),
    fetchCompleteDataset(async (from, to) => supabase.from('debit_notes').select('supplier_id, total_amount').match(filter).eq('status', 'posted').range(from, to)),
    fetchCompleteDataset(async (from, to) => supabase.from('cheques').select('party_id, amount').match(filter).eq('type', 'outgoing').neq('status', 'rejected').range(from, to)),
    fetchCompleteDataset(async (from, to) => supabase.from('vendor_rebate_settlements').select('vendor_id, total_claim_amount').match(filter).in('status', ['APPROVED', 'SETTLED']).range(from, to)),
    fetchCompleteDataset(async (from, to) => supabase.from('subcontractors').select('id, name').match(filter).range(from, to)),
    fetchCompleteDataset(async (from, to) => supabase.from('subcontractor_contracts').select('id, subcontractor_id').match(filter).range(from, to)),
    fetchCompleteDataset(async (from, to) => supabase.from('subcontractor_billings').select('contract_id, net_amount').match(filter).neq('status', 'draft').range(from, to))
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

  suppliers.forEach(supplier => {
    const opening = Number(supplier.opening_balance || 0);
    
    const totalInvoiced = invoices?.filter(i => i.supplier_id === supplier.id).reduce((sum, inv) => {
      const pvPaidForThisInvoice = payments?.filter(p => p.supplier_id === supplier.id && p.notes && inv.invoice_number && p.notes.includes(inv.invoice_number)).reduce((s, p) => s + Number(p.amount || 0), 0) || 0;
      const immediatePaidAtCheckout = Math.max(0, Number(inv.paid_amount || 0) - pvPaidForThisInvoice);
      return sum + (Number(inv.total_amount || 0) - immediatePaidAtCheckout);
    }, 0) || 0;

    const sName = (supplier.name || '').trim().toLowerCase();
    let contractorBillings = 0;
    subs?.forEach(sub => {
      const subName = (sub.name || '').trim().toLowerCase();
      if (subName && (sName === subName || sName.includes(subName) || subName.includes(sName))) {
        contractorBillings += (subBillingsTotalBySubId.get(sub.id) || 0);
      }
    });

    const totalRebates = rebates?.filter(reb => reb.vendor_id === supplier.id).reduce((sum, reb) => sum + Number(reb.total_claim_amount), 0) || 0;

    const totalPaid = (payments?.filter(p => p.supplier_id === supplier.id).reduce((sum, p) => sum + Number(p.amount), 0) || 0) +
                      (returns?.filter(r => r.supplier_id === supplier.id).reduce((sum, r) => sum + Number(r.total_amount), 0) || 0) +
                      (debitNotes?.filter(d => d.supplier_id === supplier.id).reduce((sum, d) => sum + Number(d.total_amount), 0) || 0) +
                      (cheques?.filter(c => c.party_id === supplier.id).reduce((sum, c) => sum + Number(c.amount), 0) || 0) +
                      totalRebates;

    balances.set(supplier.id, opening + totalInvoiced + contractorBillings - totalPaid);
  });

  return balances;
}

export async function fetchSingleSupplierBalance(supplierId: string, orgId: string): Promise<number> {
  const balances = await fetchAllSupplierBalances(orgId);
  return balances.get(supplierId) || 0;
}

export async function fetchAllCustomerBalances(orgId: string): Promise<Map<string, number>> {
  const balances = new Map<string, number>();
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
    fetchCompleteDataset(async (from, to) => supabase.from('sales_invoices').select('customer_id, total_amount, paid_amount').match(filter).neq('status', 'draft').neq('status', 'cancelled').range(from, to)),
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

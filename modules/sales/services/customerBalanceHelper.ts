import { supabase } from '../../../supabaseClient';
import { logger } from '../../../utils/logger';
import { SubledgerRegistry } from '../../../services/subledgerRegistry';

export interface CustomerBalanceParams {
  customerId: string;
  userOrgId: string;
  customers: Array<Record<string, unknown>>;
  getSystemAccount: (key: string) => { id?: string } | undefined | null;
}

export interface CustomerBalanceResult {
  balance: number;
  overdueCount: number;
  foundAccount: boolean;
}

/**
 * Calculates live customer A/R balance from ledger entries, subledgers, unposted orders, and opening balance,
 * plus counts overdue unpaid invoices.
 */
export async function fetchCustomerBalanceAndOverdueCount(
  params: CustomerBalanceParams
): Promise<CustomerBalanceResult> {
  const { customerId, userOrgId, customers, getSystemAccount } = params;

  const customer = customers.find((c) => c.id === customerId);
  if (!customer) {
    return { balance: 0, overdueCount: 0, foundAccount: true };
  }

  let targetAccountId = getSystemAccount('CUSTOMERS')?.id;
  if (!targetAccountId) {
    const { data: customerAccounts } = await supabase
      .from('accounts')
      .select('id')
      .eq('organization_id', userOrgId)
      .eq('code', '1221')
      .limit(1);
    targetAccountId = customerAccounts?.[0]?.id;
  }

  if (customer.customer_type === 'insurance_provider') {
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

  if (!targetAccountId) {
    logger.error('Customer A/R account not found for balance calculation.');
    return { balance: 0, overdueCount: 0, foundAccount: false };
  }

  const { data: orgData } = await supabase
    .from('organizations')
    .select('allowed_modules')
    .eq('id', userOrgId)
    .maybeSingle();
  const allowedModules: string[] | undefined =
    (orgData?.allowed_modules as string[] | undefined) || undefined;

  const custName = typeof customer.name === 'string' ? customer.name.trim() : undefined;
  const custId = String(customer.id);

  const [
    invRes,
    recRes,
    retRes,
    cnRes,
    chqRes,
    ordRes,
    clientProjectsRes,
    manualEntriesRes,
    modularEntryIds,
  ] = await Promise.all([
    supabase
      .from('invoices')
      .select('related_journal_entry_id')
      .eq('customer_id', custId)
      .eq('organization_id', userOrgId)
      .not('related_journal_entry_id', 'is', null),
    supabase
      .from('receipt_vouchers')
      .select('related_journal_entry_id')
      .eq('customer_id', custId)
      .eq('organization_id', userOrgId)
      .not('related_journal_entry_id', 'is', null),
    supabase
      .from('sales_returns')
      .select('related_journal_entry_id')
      .eq('customer_id', custId)
      .eq('organization_id', userOrgId)
      .not('related_journal_entry_id', 'is', null),
    supabase
      .from('credit_notes')
      .select('related_journal_entry_id')
      .eq('customer_id', custId)
      .eq('organization_id', userOrgId)
      .not('related_journal_entry_id', 'is', null),
    custName
      ? supabase
          .from('cheques')
          .select('related_journal_entry_id')
          .eq('organization_id', userOrgId)
          .not('related_journal_entry_id', 'is', null)
          .or(`party_id.eq.${custId},party_name.ilike.%${custName}%`)
      : supabase
          .from('cheques')
          .select('related_journal_entry_id')
          .eq('party_id', custId)
          .eq('organization_id', userOrgId)
          .not('related_journal_entry_id', 'is', null),
    supabase
      .from('orders')
      .select('related_journal_entry_id')
      .eq('customer_id', custId)
      .eq('organization_id', userOrgId)
      .not('related_journal_entry_id', 'is', null),
    supabase
      .from('projects')
      .select('id, name')
      .eq('customer_id', custId)
      .eq('organization_id', userOrgId),
    custName
      ? supabase
          .from('journal_entries')
          .select('id, reference, description, related_document_type')
          .eq('organization_id', userOrgId)
          .eq('status', 'posted')
          .or(
            `description.ilike.%${custName}%,reference.ilike.%${custName}%,reference.ilike.%OP-CUST-${custId}%,reference.ilike.%OB-${custId}%`
          )
      : Promise.resolve({ data: [] as Array<{ id: string }> }),
    SubledgerRegistry.fetchStatementCustomerEntryIds(userOrgId, custId, custName, allowedModules),
  ]);

  const allEntryIds = new Set<string>();
  invRes.data?.forEach((i) => i.related_journal_entry_id && allEntryIds.add(i.related_journal_entry_id));
  recRes.data?.forEach((r) => r.related_journal_entry_id && allEntryIds.add(r.related_journal_entry_id));
  retRes.data?.forEach((r) => r.related_journal_entry_id && allEntryIds.add(r.related_journal_entry_id));
  cnRes.data?.forEach((c) => c.related_journal_entry_id && allEntryIds.add(c.related_journal_entry_id));
  chqRes.data?.forEach((c) => c.related_journal_entry_id && allEntryIds.add(c.related_journal_entry_id));
  ordRes.data?.forEach((o) => o.related_journal_entry_id && allEntryIds.add(o.related_journal_entry_id));
  manualEntriesRes.data?.forEach((je) => allEntryIds.add(je.id));
  modularEntryIds?.forEach((id) => {
    if (id) allEntryIds.add(id);
  });

  const projectIds = clientProjectsRes.data?.map((p) => p.id) || [];
  if (projectIds.length > 0) {
    const { data: billings } = await supabase
      .from('project_progress_billings')
      .select('related_journal_entry_id')
      .in('project_id', projectIds)
      .eq('organization_id', userOrgId)
      .not('related_journal_entry_id', 'is', null);
    billings?.forEach((b) => b.related_journal_entry_id && allEntryIds.add(b.related_journal_entry_id));
  }

  let movement = 0;
  let hasOpeningEntryInTrans = false;

  if (allEntryIds.size > 0) {
    const { data: ledgerLines } = await supabase
      .from('journal_lines')
      .select('journal_entry_id, debit, credit')
      .in('journal_entry_id', Array.from(allEntryIds))
      .eq('account_id', targetAccountId);

    movement =
      ledgerLines?.reduce((sum, l) => sum + (Number(l.debit) - Number(l.credit)), 0) || 0;

    const journalEntryIds = Array.from(
      new Set(ledgerLines?.map((l) => l.journal_entry_id).filter(Boolean) || [])
    );
    if (journalEntryIds.length > 0) {
      const { data: entries } = await supabase
        .from('journal_entries')
        .select('id, reference, description, related_document_type')
        .in('id', journalEntryIds)
        .eq('organization_id', userOrgId);

      hasOpeningEntryInTrans =
        entries?.some(
          (je) =>
            je.related_document_type === 'opening_balance' ||
            je.reference?.startsWith('OP-CUST-') ||
            je.reference?.startsWith('OB-') ||
            je.reference?.startsWith('OP-') ||
            je.reference?.startsWith('OPENING-') ||
            je.description?.includes('رصيد افتتاحي')
        ) || false;
    }
  }

  const { data: openOrders } = await supabase
    .from('orders')
    .select('grand_total')
    .eq('customer_id', custId)
    .eq('organization_id', userOrgId)
    .is('related_journal_entry_id', null)
    .neq('status', 'CANCELLED');

  const unpostedRestaurantSales =
    openOrders?.reduce((sum, o) => sum + Number(o.grand_total), 0) || 0;

  const initialBal = hasOpeningEntryInTrans ? 0 : Number(customer.opening_balance || 0);
  const balance = initialBal + movement + unpostedRestaurantSales;

  const { data: overdueData } = await supabase
    .from('invoices')
    .select('total_amount, paid_amount, due_date, status')
    .eq('customer_id', customerId)
    .eq('organization_id', userOrgId)
    .neq('status', 'draft');

  const today = new Date().toISOString().split('T')[0];
  const overdueInvoices =
    overdueData?.filter(
      (inv) =>
        inv.status !== 'paid' &&
        inv.due_date &&
        inv.due_date < today &&
        inv.total_amount - (inv.paid_amount || 0) > 0
    ) || [];

  return { balance, overdueCount: overdueInvoices.length, foundAccount: true };
}

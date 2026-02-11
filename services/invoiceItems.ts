import { supabase } from '../supabaseClient';

export type InvoiceItemInput = {
  line_no?: number;
  description?: string | null;
  quantity?: number;
  unit_price?: number;
  discount?: number;
  tax_rate?: number;
  custom_fields?: Record<string, any>;
  created_by?: string | null;
};

export async function addInvoiceItem(invoiceId: string, item: InvoiceItemInput) {
  const { data, error } = await supabase
    .from('invoice_items')
    .insert([{
      invoice_id: invoiceId,
      line_no: item.line_no ?? 1,
      description: item.description ?? null,
      quantity: item.quantity ?? 1,
      unit_price: item.unit_price ?? 0,
      discount: item.discount ?? 0,
      tax_rate: item.tax_rate ?? 0,
      custom_fields: item.custom_fields ?? {},
      created_by: item.created_by ?? null
    }])
    .select();
  if (error) throw error;
  return data;
}

export async function getInvoiceItems(invoiceId: string) {
  const { data, error } = await supabase
    .from('invoice_items')
    .select('*')
    .eq('invoice_id', invoiceId)
    .order('line_no', { ascending: true });
  if (error) throw error;
  return data;
}

export async function updateInvoiceItem(id: string, changes: Partial<InvoiceItemInput>) {
  const { data, error } = await supabase
    .from('invoice_items')
    .update(changes)
    .eq('id', id)
    .select();
  if (error) throw error;
  return data;
}

export async function deleteInvoiceItem(id: string) {
  const { data, error } = await supabase
    .from('invoice_items')
    .delete()
    .eq('id', id)
    .select();
  if (error) throw error;
  return data;
}

// ============= Advanced Functions =============

export type InvoiceItemWithTotals = {
  id: string;
  invoice_id: string;
  line_no: number;
  description: string | null;
  quantity: number;
  unit_price: number;
  discount: number;
  tax_rate: number;
  created_at: string;
  updated_at: string;
  line_total: number;
  tax_amount: number;
};

/**
 * الحصول على بنود الفاتورة مع حساب الإجماليات (مبلغ السطر، الضريبة)
 */
export async function getInvoiceItemsWithTotals(
  invoiceId: string
): Promise<InvoiceItemWithTotals[]> {
  const items = await getInvoiceItems(invoiceId);

  return items.map((item) => {
    const lineTotal = item.quantity * item.unit_price - item.discount;
    const taxAmount = lineTotal * (item.tax_rate / 100);

    return {
      ...item,
      line_total: lineTotal,
      tax_amount: taxAmount
    };
  });
}

/**
 * حساب مجموع الفاتورة: الإجمالي، الضرائب، الخصم الكلي
 */
export async function calculateInvoiceTotals(invoiceId: string) {
  const items = await getInvoiceItemsWithTotals(invoiceId);

  const subtotal = items.reduce((sum, item) => sum + (item.quantity * item.unit_price), 0);
  const totalDiscount = items.reduce((sum, item) => sum + item.discount, 0);
  const totalTax = items.reduce((sum, item) => sum + item.tax_amount, 0);
  const grandTotal = subtotal - totalDiscount + totalTax;

  return {
    subtotal,
    totalDiscount,
    totalTax,
    grandTotal,
    itemCount: items.length
  };
}

/**
 * تحديث عدة بنود دفعة واحدة
 */
export async function bulkUpdateInvoiceItems(
  updates: Array<{ id: string; changes: Partial<InvoiceItemInput> }>
) {
  const results = [];
  for (const { id, changes } of updates) {
    const result = await updateInvoiceItem(id, changes);
    results.push(result);
  }
  return results;
}

/**
 * حذف عدة بنود دفعة واحدة
 */
export async function bulkDeleteInvoiceItems(ids: string[]) {
  const { error } = await supabase
    .from('invoice_items')
    .delete()
    .in('id', ids);
  if (error) throw error;
  return { success: true };
}

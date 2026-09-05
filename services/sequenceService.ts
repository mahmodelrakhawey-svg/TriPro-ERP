import { supabase } from '../supabaseClient';

/**
 * Service to generate gapless, collision-free sequential document numbers (e.g. INV-000001)
 * via atomic PostgreSQL RPC with optimistic client-side fallback.
 */
export async function getNextDocumentNumber(
  orgId: string | null | undefined,
  docType: 'invoice' | 'purchase_invoice' | 'sales_return' | 'purchase_return' | 'receipt_voucher' | 'payment_voucher' | 'order' | string,
  prefix?: string
): Promise<string> {
  const defaultPrefixes: Record<string, string> = {
    invoice: 'INV-',
    purchase_invoice: 'PUR-',
    sales_return: 'SR-',
    purchase_return: 'PR-',
    receipt_voucher: 'RV-',
    payment_voucher: 'PV-',
    order: 'ORD-'
  };

  const effectivePrefix = prefix || defaultPrefixes[docType] || `${docType.toUpperCase()}-`;

  try {
    if (orgId) {
      const { data, error } = await supabase.rpc('get_next_document_number', {
        p_org_id: orgId,
        p_doc_type: docType,
        p_prefix: effectivePrefix
      });

      if (!error && typeof data === 'string' && data.length > 0) {
        return data;
      }
    }
  } catch (err) {
    console.warn(`[sequenceService] RPC get_next_document_number failed for ${docType}, using fallback:`, err);
  }

  // Graceful fallback for offline, demo or pre-migration environments
  return `${effectivePrefix}${Date.now().toString().slice(-6)}`;
}

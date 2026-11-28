import { supabase } from '../supabaseClient';
import { logger } from './logger';

const JOURNAL_PAGE_SIZE = 300;
const DEFAULT_JOURNAL_SELECT =
  'id, reference, transaction_date, description, status, organization_id, related_document_id, related_document_type, journal_lines(id, account_id, debit, credit, description, cost_center_id)';

/**
 * يجلب قيود اليومية مع أسطرها بنظام التصفح المعتمد على المؤشر (Keyset Pagination)
 * لتفادي بطء OFFSET وتجاوز مهلة الاستعلام (57014) عند تضخم دفتر اليومية.
 */
export async function fetchJournalEntriesWithLines<T = Record<string, unknown>>(
  orgId: string,
  startDate: string,
  endDate: string,
  selectClause: string = DEFAULT_JOURNAL_SELECT
): Promise<T[]> {
  if (!orgId) return [];

  const allRows: T[] = [];
  let cursorDate: string | null = null;
  let cursorId: string | null = null;

  while (true) {
    let query = supabase
      .from('journal_entries')
      .select(selectClause)
      .eq('organization_id', orgId)
      .gte('transaction_date', startDate)
      .lte('transaction_date', endDate)
      .order('transaction_date', { ascending: false })
      .order('id', { ascending: false });

    if (cursorDate && cursorId) {
      query = query.or(
        `transaction_date.lt.${cursorDate},and(transaction_date.eq.${cursorDate},id.lt.${cursorId})`
      );
    }

    const { data, error } = await query.limit(JOURNAL_PAGE_SIZE);
    if (error) {
      logger.error('[journalPagination] Error fetching journal entries page:', error);
      break;
    }
    if (!data || data.length === 0) break;

    allRows.push(...(data as T[]));
    if (data.length < JOURNAL_PAGE_SIZE) break;

    const lastRow = data[data.length - 1] as { transaction_date?: string | null; id?: string | null };
    if (
      !lastRow?.transaction_date ||
      !lastRow?.id ||
      (lastRow.transaction_date === cursorDate && lastRow.id === cursorId)
    ) {
      break;
    }

    cursorDate = lastRow.transaction_date;
    cursorId = lastRow.id;
  }

  return allRows;
}

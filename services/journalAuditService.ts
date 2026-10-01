/**
 * ==============================================================================
 * Journal Audit & Integrity Service
 * TriPro ERP — services/journalAuditService.ts
 * ==============================================================================
 * خدمة كشف وتدقيق القيود غير المتوازنة (مدين ≠ دائن) ومعالجة الفروقات في الأستاذ العام.
 * ==============================================================================
 */

import { supabase } from '../supabaseClient';

export interface UnbalancedJournalEntrySummary {
  id: string;
  reference: string;
  description: string;
  transaction_date: string;
  status: 'posted' | 'draft' | string;
  totalDebit: number;
  totalCredit: number;
  difference: number; // positive = debit > credit, negative = credit > debit
  absDifference: number;
}

export interface UnbalancedAuditResult {
  unbalancedIds: string[];
  entries: UnbalancedJournalEntrySummary[];
  totalDebit: number;
  totalCredit: number;
  totalDifference: number;
}

class JournalAuditService {
  /**
   * استخراج وتحديد منظمة المستخدم تلقائياً لضمان عدم حجب البيانات
   */
  private async resolveOrgId(providedOrgId?: string | null): Promise<string | null> {
    if (providedOrgId && providedOrgId !== '') return providedOrgId;
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const user = sessionData?.session?.user;
      if (!user) return null;
      return (
        user.user_metadata?.org_id ||
        (user as any)?.organization_id ||
        user.id ||
        null
      );
    } catch (_) {
      return null;
    }
  }

  /**
   * كشف جميع القيود غير المتوازنة داخل المنظمة المحددة
   * يدعم فحص القيود المرحلة أو المسودات أو الكل
   */
  public async findUnbalancedEntries(
    organizationId?: string | null,
    statusFilter: 'all' | 'posted' | 'draft' = 'all'
  ): Promise<UnbalancedAuditResult> {
    const effectiveOrgId = await this.resolveOrgId(organizationId);

    // 1. محاولة استدعاء الدالة البرمجية من PostgreSQL إذا كانت موجودة (أسرع وأدق)
    try {
      const { data: rpcData, error: rpcErr } = await supabase.rpc('get_unbalanced_journal_entries', {
        p_org_id: effectiveOrgId || null,
        p_status: statusFilter === 'all' ? null : statusFilter
      });

      if (!rpcErr && Array.isArray(rpcData) && rpcData.length > 0) {
        const entries: UnbalancedJournalEntrySummary[] = rpcData.map((r: any) => {
          const totDr = Number(r.total_debit || 0);
          const totCr = Number(r.total_credit || 0);
          const diff = Number(r.difference !== undefined ? r.difference : (totDr - totCr));
          return {
            id: r.entry_id || r.id,
            reference: r.reference || (r.entry_id || r.id).slice(0, 8),
            description: r.description || '',
            transaction_date: r.transaction_date || '',
            status: r.status || 'draft',
            totalDebit: Number(totDr.toFixed(2)),
            totalCredit: Number(totCr.toFixed(2)),
            difference: Number(diff.toFixed(2)),
            absDifference: Number(Math.abs(diff).toFixed(2))
          };
        });

        return {
          unbalancedIds: entries.map(e => e.id),
          entries,
          totalDebit: Number(entries.reduce((s, e) => s + e.totalDebit, 0).toFixed(2)),
          totalCredit: Number(entries.reduce((s, e) => s + e.totalCredit, 0).toFixed(2)),
          totalDifference: Number(entries.reduce((s, e) => s + e.absDifference, 0).toFixed(2))
        };
      }
    } catch (_) {
      // الاستكمال بالمسار الاحتياطي في حال عدم وجود الـ RPC
    }

    // 2. المسار الاحتياطي الأول: استعلام أسطر القيود journal_lines
    try {
      let allLines: any[] = [];
      let from = 0;
      const pageSize = 1000;

      while (true) {
        let query = supabase
          .from('journal_lines')
          .select('id, journal_entry_id, account_id, debit, credit, journal_entries!inner(id, reference, description, transaction_date, status, organization_id)')
          .range(from, from + pageSize - 1);

        if (effectiveOrgId && effectiveOrgId !== '') {
          query = query.eq('journal_entries.organization_id', effectiveOrgId);
        }

        if (statusFilter !== 'all') {
          query = query.eq('journal_entries.status', statusFilter);
        }

        const { data, error } = await query;
        if (error) {
          console.warn('Fallback 1 query notice in journalAuditService:', error.message);
          break;
        }
        if (!data || data.length === 0) break;

        allLines = allLines.concat(data);
        if (data.length < pageSize) break;
        from += pageSize;
      }

      // 3. المسار الاحتياطي الثاني: إذا لم ترجع أسطر القيود شيء، نستعلم journal_entries مباشرة
      if (allLines.length === 0) {
        let entriesQuery = supabase
          .from('journal_entries')
          .select('id, reference, description, transaction_date, status, organization_id, journal_lines(id, account_id, debit, credit)')
          .limit(1000);

        if (effectiveOrgId && effectiveOrgId !== '') {
          entriesQuery = entriesQuery.eq('organization_id', effectiveOrgId);
        }

        if (statusFilter !== 'all') {
          entriesQuery = entriesQuery.eq('status', statusFilter);
        }

        const { data: directEntries, error: directErr } = await entriesQuery;
        if (!directErr && Array.isArray(directEntries)) {
          for (const ent of directEntries) {
            const lines = ent.journal_lines || [];
            for (const l of lines) {
              allLines.push({
                journal_entry_id: ent.id,
                debit: l.debit,
                credit: l.credit,
                journal_entries: {
                  id: ent.id,
                  reference: ent.reference,
                  description: ent.description,
                  transaction_date: ent.transaction_date,
                  status: ent.status,
                  organization_id: ent.organization_id
                }
              });
            }
          }
        }
      }

      // تجميع الحركات حسب القيد
      const entryMap = new Map<string, {
        header: any;
        debit: number;
        credit: number;
      }>();

      for (const line of allLines) {
        const entryId = line.journal_entry_id;
        if (!entryId) continue;

        if (!entryMap.has(entryId)) {
          entryMap.set(entryId, {
            header: line.journal_entries,
            debit: 0,
            credit: 0
          });
        }

        const item = entryMap.get(entryId)!;
        item.debit += Number(line.debit) || 0;
        item.credit += Number(line.credit) || 0;
      }

      const entries: UnbalancedJournalEntrySummary[] = [];
      const unbalancedIds: string[] = [];
      let totalDebit = 0;
      let totalCredit = 0;
      let totalDiff = 0;

      for (const [id, data] of entryMap.entries()) {
        const diff = Number((data.debit - data.credit).toFixed(4));
        const absDiff = Math.abs(diff);

        // إذا كان الفارق أكبر من نصف قرش (0.005 ج.م)
        if (absDiff > 0.005) {
          unbalancedIds.push(id);
          entries.push({
            id,
            reference: data.header?.reference || id.slice(0, 8),
            description: data.header?.description || '',
            transaction_date: data.header?.transaction_date || '',
            status: data.header?.status || 'draft',
            totalDebit: Number(data.debit.toFixed(2)),
            totalCredit: Number(data.credit.toFixed(2)),
            difference: Number(diff.toFixed(2)),
            absDifference: Number(absDiff.toFixed(2))
          });

          totalDebit += data.debit;
          totalCredit += data.credit;
          totalDiff += absDiff;
        }
      }

      // الترتيب تنازلياً حسب قيمة الفارق
      entries.sort((a, b) => b.absDifference - a.absDifference);

      return {
        unbalancedIds,
        entries,
        totalDebit: Number(totalDebit.toFixed(2)),
        totalCredit: Number(totalCredit.toFixed(2)),
        totalDifference: Number(totalDiff.toFixed(2))
      };
    } catch (err) {
      console.error('Failed to audit journal balance:', err);
      return {
        unbalancedIds: [],
        entries: [],
        totalDebit: 0,
        totalCredit: 0,
        totalDifference: 0
      };
    }
  }

  /**
   * تحويل قيد مرحّل غير متوازن إلى مسودة لتسهيل تعديله وتصحيحه
   */
  public async unpostEntryForCorrection(entryId: string): Promise<{ success: boolean; message: string }> {
    try {
      const { error } = await supabase
        .from('journal_entries')
        .update({ status: 'draft', is_posted: false })
        .eq('id', entryId);

      if (error) throw error;
      return { success: true, message: 'تم تحويل القيد إلى مسودة بنجاح لتعديله وتصحيحه.' };
    } catch (err) {
      return { success: false, message: err.message || 'فشل إلغاء ترحيل القيد' };
    }
  }
}

export const journalAuditService = new JournalAuditService();
export default journalAuditService;

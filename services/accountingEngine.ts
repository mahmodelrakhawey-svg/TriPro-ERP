/**
 * ==============================================================================
 * Central Accounting Engine (المحرك المحاسبي المركزي الموحد)
 * TriPro ERP — services/accountingEngine.ts
 * ==============================================================================
 * الغرض المعماري:
 * توحيد هيكل وعقود إنشاء قيود اليومية لجميع المديولات (تجاري، مقاولات،
 * مستشفيات، استاد، مطاعم، مصانع) مع التحقق المسبق الصارم من التوازن ومراكز التكلفة.
 * ==============================================================================
 */

import { supabase } from '../supabaseClient';

export interface JournalLineItem {
  accountId: string;
  debit: number;
  credit: number;
  description?: string;
  costCenterId?: string | null;
  currency?: string;
  exchangeRate?: number;
}

export interface CreateJournalEntryParams {
  organizationId: string;
  transactionDate?: string;
  reference?: string;
  description: string;
  lines: JournalLineItem[];
  relatedDocumentId?: string | null;
  relatedDocumentType?: string | null;
  status?: 'posted' | 'draft';
  autoPost?: boolean;
  costCenterId?: string | null;
}

export interface AccountingEngineResult {
  success: boolean;
  journalEntryId?: string;
  reference?: string;
  totalDebit: number;
  totalCredit: number;
  error?: string;
}

class UnifiedAccountingEngine {
  /**
   * إنشاء قيد يومية متوازن وموثق بالكامل في دفتر الأستاذ العام
   */
  public async createJournalEntry(params: CreateJournalEntryParams): Promise<AccountingEngineResult> {
    const {
      organizationId,
      transactionDate = new Date().toISOString().split('T')[0],
      reference,
      description,
      lines,
      relatedDocumentId,
      relatedDocumentType,
      status = 'posted',
      costCenterId
    } = params;

    // 1. التحقق من وجود المنظمة والبيان
    if (!organizationId) {
      return { success: false, totalDebit: 0, totalCredit: 0, error: 'معرف المنظمة (organizationId) مطلوب' };
    }
    if (!lines || lines.length < 2) {
      return { success: false, totalDebit: 0, totalCredit: 0, error: 'يجب أن يحتوي القيد على طرفين محاسبيين على الأقل' };
    }

    // 2. التحقق المسبق من توازن القيد (Debit == Credit)
    let totalDebit = 0;
    let totalCredit = 0;

    for (const line of lines) {
      if (!line.accountId) {
        return { success: false, totalDebit: 0, totalCredit: 0, error: 'يوجد سطر في القيد بدون تحديد الحساب المالي' };
      }
      const d = Number(line.debit || 0);
      const c = Number(line.credit || 0);
      if (d < 0 || c < 0) {
        return { success: false, totalDebit: 0, totalCredit: 0, error: 'لا يمكن إدخال مبالغ سالبة في أطراف القيد' };
      }
      totalDebit += d;
      totalCredit += c;
    }

    const diff = Math.abs(totalDebit - totalCredit);
    if (diff > 0.005) {
      return {
        success: false,
        totalDebit,
        totalCredit,
        error: `القيد غير متوازن محاسبياً (المدين: ${totalDebit.toFixed(2)}, الدائن: ${totalCredit.toFixed(2)}, الفرق: ${diff.toFixed(2)})`
      };
    }

    try {
      // 3. إنشاء رأس القيد في جدول journal_entries كمسودة أولاً
      const entryRef = reference || `JE-${Date.now().toString().slice(-6)}`;
      const { data: entry, error: entryError } = await supabase
        .from('journal_entries')
        .insert({
          organization_id: organizationId,
          transaction_date: transactionDate,
          reference: entryRef,
          description: description.trim(),
          status: 'draft',
          is_posted: false,
          related_document_id: relatedDocumentId || null,
          related_document_type: relatedDocumentType || null,
          cost_center_id: costCenterId || null,
          auto_generated: true
        })
        .select('id, reference')
        .single();

      if (entryError || !entry) {
        throw new Error(entryError?.message || 'فشل في حفظ رأس قيد اليومية');
      }

      // 4. إنشاء أطراف القيد في جدول journal_lines
      const linesToInsert = lines.map(line => ({
        journal_entry_id: entry.id,
        account_id: line.accountId,
        debit: Number(line.debit || 0),
        credit: Number(line.credit || 0),
        description: (line.description || description).trim(),
        cost_center_id: line.costCenterId || costCenterId || null,
        organization_id: organizationId
      }));

      const { error: linesError } = await supabase
        .from('journal_lines')
        .insert(linesToInsert);

      if (linesError) {
        await supabase.from('journal_entries').delete().eq('id', entry.id);
        throw new Error(linesError.message);
      }

      // 5. ترحيل القيد إذا كانت الحالة المطلوبة posted
      if (status === 'posted') {
        const { error: postError } = await supabase
          .from('journal_entries')
          .update({
            status: 'posted',
            is_posted: true
          })
          .eq('id', entry.id);

        if (postError) {
          throw new Error('فشل ترحيل القيد: ' + postError.message);
        }
      }

      return {
        success: true,
        journalEntryId: entry.id,
        reference: entry.reference,
        totalDebit,
        totalCredit
      };
    } catch (err: any) {
      console.error('[UnifiedAccountingEngine] Error creating journal entry:', err);
      return {
        success: false,
        totalDebit,
        totalCredit,
        error: err.message || 'حدث خطأ أثناء ترحيل القيد المحاسبي'
      };
    }
  }

  // ============================================================================
  // دوال مساعدة معيارية للعمليات المحاسبية الشائعة
  // ============================================================================

  /**
   * إنشاء قيد سند قبض (Receipt Voucher): من الخزينة/البنك إلى العميل أو الإيراد
   */
  public async createReceiptVoucherEntry(params: {
    organizationId: string;
    voucherId: string;
    voucherNumber: string;
    amount: number;
    treasuryAccountId: string;
    customerAccountId?: string;
    revenueAccountId?: string;
    customerName?: string;
    date?: string;
    notes?: string;
  }): Promise<AccountingEngineResult> {
    const {
      organizationId,
      voucherId,
      voucherNumber,
      amount,
      treasuryAccountId,
      customerAccountId,
      revenueAccountId,
      customerName,
      date,
      notes
    } = params;

    const creditAccountId = customerAccountId || revenueAccountId;
    if (!creditAccountId) {
      return { success: false, totalDebit: 0, totalCredit: 0, error: 'يجب تحديد حساب العميل أو حساب الإيراد المقابل' };
    }

    const desc = notes || `سند قبض رقم ${voucherNumber}${customerName ? ` — ${customerName}` : ''}`;

    return this.createJournalEntry({
      organizationId,
      transactionDate: date,
      reference: voucherNumber.startsWith('RV-') ? voucherNumber : `RV-${voucherNumber}`,
      description: desc,
      relatedDocumentId: voucherId,
      relatedDocumentType: 'receipt_voucher',
      lines: [
        { accountId: treasuryAccountId, debit: amount, credit: 0, description: `استلام نقدية/بنك - سند ${voucherNumber}` },
        { accountId: creditAccountId, debit: 0, credit: amount, description: `تحصيل من ${customerName || 'العميل'}` }
      ]
    });
  }

  /**
   * إنشاء قيد استلام شيك وارد (Incoming Cheque): من أوراق القبض (1222) إلى العميل أو الإيراد
   */
  public async createIncomingChequeEntry(params: {
    organizationId: string;
    chequeId: string;
    chequeNumber: string;
    amount: number;
    notesReceivableAccountId: string; // 1222
    creditAccountId: string; // 1221 (عملاء) أو 4102 (إيراد نشاط)
    partyName?: string;
    date?: string;
  }): Promise<AccountingEngineResult> {
    const {
      organizationId,
      chequeId,
      chequeNumber,
      amount,
      notesReceivableAccountId,
      creditAccountId,
      partyName,
      date
    } = params;

    const desc = `استلام شيك وارد رقم ${chequeNumber}${partyName ? ` من ${partyName}` : ''}`;

    return this.createJournalEntry({
      organizationId,
      transactionDate: date,
      reference: `CHQ-${chequeNumber}`,
      description: desc,
      relatedDocumentId: chequeId,
      relatedDocumentType: 'cheque',
      lines: [
        { accountId: notesReceivableAccountId, debit: amount, credit: 0, description: `أوراق قبض شيك رقم ${chequeNumber}` },
        { accountId: creditAccountId, debit: 0, credit: amount, description: `سداد بشيك من ${partyName || 'العميل'}` }
      ]
    });
  }
}

export const AccountingEngine = new UnifiedAccountingEngine();

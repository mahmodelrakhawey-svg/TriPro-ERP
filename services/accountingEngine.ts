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

import { logger } from '../utils/logger';
import { supabase } from '../supabaseClient';

/**
 * سطر طرف القيد المحاسبي الفردي (طرف مدين أو دائن)
 */
export interface JournalLineItem {
  /** معرف الحساب المالي في دليل الحسابات (UUID) */
  accountId: string;
  /** المبلغ المدين بالعملة المحلية (>= 0) */
  debit: number;
  /** المبلغ الدائن بالعملة المحلية (>= 0) */
  credit: number;
  /** بيان توضيحي لسطر القيد (اختياري، يرث بيان القيد الرئيسي إذا لم يُحدد) */
  description?: string;
  /** معرف مركز التكلفة المرتبط بهذا الطرف المحاسبي (اختياري) */
  costCenterId?: string | null;
  /** رمز العملة في حال التعامل متعدد العملات (مثل: USD, EUR, SAR) */
  currency?: string;
  /** سعر صرف العملة الأجنبية مقابل العملة المحلية وقت المعاملة */
  exchangeRate?: number;
}

/**
 * معلمات إنشاء قيد اليومية في المحرك المحاسبي المركزي
 */
export interface CreateJournalEntryParams {
  /** معرف المنظمة أو الفرع لضمان عزل البيانات (Multi-Tenancy) - إلزامي */
  organizationId: string;
  /** تاريخ المعاملة بصيغة YYYY-MM-DD (افتراضياً تاريخ اليوم الحالي) */
  transactionDate?: string;
  /** المرجع الفريد للقيد (مثل: JE-2026-001) - يُنشأ تلقائياً إذا تُرك فارغاً */
  reference?: string;
  /** الشرح والبيان العام للقيد المحاسبي */
  description: string;
  /** قائمة أطراف القيد (يجب أن يحتوي على طرفين على الأقل وأن يتساوى مجموع المدين مع الدائن) */
  lines: JournalLineItem[];
  /** معرف المستند الأصلي المرتبط بالقيد (فاتورة، سند، إهلاك، أجور) إن وجد */
  relatedDocumentId?: string | null;
  /** نوع المستند الأصلي (مثل: sales_invoice, purchase_invoice, receipt_voucher, payroll) */
  relatedDocumentType?: string | null;
  /** حالة القيد: 'posted' معتمد ومرحل إلى دفتر الأستاذ، أو 'draft' مسودة غير مرحلة */
  status?: 'posted' | 'draft';
  /** علم الترحيل التلقائي الفوري */
  autoPost?: boolean;
  /** معرف مركز التكلفة العام للقيد */
  costCenterId?: string | null;
}

/**
 * نتيجة تنفيذ عملية إنشاء أو ترحيل القيد المحاسبي
 */
export interface AccountingEngineResult {
  /** مؤشر نجاح العملية بالكامل */
  success: boolean;
  /** معرف قيد اليومية المنشأ في جدول journal_entries */
  journalEntryId?: string;
  /** الرقم المرجعي للقيد */
  reference?: string;
  /** إجمالي المبلغ المدين للقيد المحسوب */
  totalDebit: number;
  /** إجمالي المبلغ الدائن للقيد المحسوب */
  totalCredit: number;
  /** رسالة الخطأ التوضيحية في حال تعذر الترحيل أو عدم التوازن */
  error?: string;
}

/**
 * حمولة إدراج رأس القيد المحاسبي في جدول journal_entries
 */
export interface JournalEntryHeaderPayload {
  organization_id: string | null;
  transaction_date: string;
  reference: string;
  description: string;
  status: 'draft' | 'posted';
  is_posted: boolean;
  related_document_id?: string | null;
  related_document_type?: string | null;
}

/**
 * حمولة إدراج رأس القيد المحاسبي بالحد الأدنى للأعمدة كإجراء احتياطي
 */
export interface MinimalJournalEntryHeaderPayload {
  organization_id: string;
  transaction_date: string;
  reference: string;
  description: string;
  status: 'draft' | 'posted';
  is_posted: boolean;
}

/**
 * المحرك المحاسبي المركزي الموحد (Unified Accounting Engine)
 * المسؤول الوحيد عن إنشاء قيود اليومية لجميع المديولات مع فرض قواعد القيد المزدوج:
 * 1. عزل المنشآت (Multi-Tenant Isolation via organizationId)
 * 2. توازن القيد الصارم (Debit == Credit مع هامش خطأ مسموح <= 0.005)
 * 3. منع المبالغ السالبة في أطراف القيد
 * 4. ترحيل متسق ذري (Atomic Transaction Lifecycle)
 */
class UnifiedAccountingEngine {
  /**
   * إنشاء قيد يومية متوازن وموثق بالكامل في دفتر الأستاذ العام
   *
   * @param params معلمات القيد المحاسبي
   * @returns وعد يحتوي على كائن AccountingEngineResult يوضح حالة النجاح والأرقام المرجعية
   * @throws لا تُرمى استثناءات غير معالجة بل تُعاد النتيجة مع تفاصيل الخطأ في الحقل error
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
      // 🚀 المسار الرئيسي: استخدام RPC أتومية لضمان ACID Compliance
      // دالة create_journal_entry_atomic تنفذ كل العملية داخل Transaction واحد
      const entryRef = reference || `JE-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2,6).toUpperCase()}`;

      const linesPayload = lines.map(line => ({
        account_id: line.accountId,
        debit: Number(line.debit || 0),
        credit: Number(line.credit || 0),
        description: (line.description || description).trim(),
        cost_center_id: line.costCenterId || costCenterId || null
      }));

      let rpcResult: any = null;
      let rpcError: any = null;

      if (typeof (supabase as any)?.rpc === 'function') {
        try {
          const res = await supabase.rpc(
            'create_journal_entry_atomic',
            {
              p_organization_id:  organizationId,
              p_transaction_date: transactionDate,
              p_reference:        entryRef,
              p_description:      description.trim(),
              p_status:           status,
              p_related_doc_id:   relatedDocumentId || null,
              p_related_doc_type: relatedDocumentType || null,
              p_cost_center_id:   costCenterId || null,
              p_lines:            linesPayload
            }
          );
          rpcResult = res.data;
          rpcError = res.error;
        } catch (callEx) {
          rpcError = callEx;
        }
      } else {
        rpcError = { message: 'supabase.rpc function is not configured' };
      }

      // إذا نجح RPC الأتومي — نعود بالنتيجة مباشرةً
      if (!rpcError && rpcResult?.success) {
        return {
          success:        true,
          journalEntryId: rpcResult.journal_entry_id,
          reference:      rpcResult.reference,
          totalDebit,
          totalCredit
        };
      }

      // إذا فشل RPC (ربما لأنه لم يُطبَّق بعد على قاعدة البيانات)
      // نسقط إلى المسار الاحتياطي الكلاسيكي مع تسجيل التحذير
      if (rpcError) {
        logger.warn('[AccountingEngine] Atomic RPC unavailable, using fallback:', rpcError.message);
      } else if (rpcResult && !rpcResult.success) {
        // الـ RPC موجود ورفض العملية (خطأ منطقي مثل فترة مقفلة أو عدم التوازن)
        return {
          success: false,
          totalDebit,
          totalCredit,
          error: rpcResult.error || 'فشل إنشاء القيد'
        };
      }

      // ======================================================================
      // 🔁 المسار الاحتياطي: إنشاء القيد بالخطوات الكلاسيكية
      // يُستخدم فقط عندما لا يكون RPC الأتومي متاحاً بعد في قاعدة البيانات
      // ======================================================================
      logger.warn('[AccountingEngine] ⚠️ Using non-atomic fallback — apply critical_security_fixes.sql to upgrade');

      // 3. إنشاء رأس القيد في جدول journal_entries كمسودة أولاً
      const entryPayload: JournalEntryHeaderPayload = {
        organization_id: organizationId || null,
        transaction_date: transactionDate,
        reference: entryRef,
        description: description.trim(),
        status: 'draft',
        is_posted: false,
        related_document_id: relatedDocumentId || null,
        related_document_type: relatedDocumentType || null
      };

      let { data: entry, error: entryError } = await supabase
        .from('journal_entries')
        .insert(entryPayload)
        .select('id, reference')
        .single();

      if (entryError) {
        // Fallback for minimal journal entry columns
        const minimalPayload: MinimalJournalEntryHeaderPayload = {
          organization_id: organizationId,
          transaction_date: transactionDate,
          reference: entryRef,
          description: description.trim(),
          status: 'draft',
          is_posted: false
        };
        const retry = await supabase
          .from('journal_entries')
          .insert(minimalPayload)
          .select('id, reference')
          .single();
        entry = retry.data;
        entryError = retry.error;
      }

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
        // محاولة تنظيف الـ header اليتيم — قد تفشل في حالة انقطاع الشبكة
        try {
          await supabase.from('journal_entries').delete().eq('id', entry.id);
        } catch (cleanupErr) {
          logger.error('[AccountingEngine] Orphan header cleanup failed:', cleanupErr);
        }
        throw new Error(linesError.message);
      }

      // 5. ترحيل القيد إذا كانت الحالة المطلوبة posted
      if (status === 'posted') {
        const { error: postError } = await supabase
          .from('journal_entries')
          .update({ status: 'posted', is_posted: true })
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
    } catch (err: unknown) {
      const errorMessage =
        err instanceof Error
          ? err.message
          : typeof err === 'object' && err !== null && 'message' in err
          ? String((err as { message: unknown }).message)
          : 'حدث خطأ أثناء ترحيل القيد المحاسبي';

      logger.error('[UnifiedAccountingEngine] Error creating journal entry:', err);
      return {
        success: false,
        totalDebit,
        totalCredit,
        error: errorMessage
      };
    }
  }

  // ============================================================================
  // دوال مساعدة معيارية للعمليات المحاسبية الشائعة
  // ============================================================================

  /**
   * إنشاء وتوثيق قيد سند قبض (Receipt Voucher Entry)
   * يمثل تحصيل نقدية أو إيداع بنكي من عميل أو إيراد مباشر:
   * - الطرف المدين: حساب الخزينة أو البنك (زيادة أصول نقدية)
   * - الطرف الدائن: حساب العميل المدين (نقص مديونية) أو حساب الإيراد المباشر
   *
   * @param params معلمات سند القبض
   * @param params.organizationId معرف المنظمة لعزل البيانات
   * @param params.voucherId معرف سند القبض الأصلي
   * @param params.voucherNumber رقم سند القبض (مثل: RV-1001)
   * @param params.amount المبلغ المحصل بالعملة المحلية
   * @param params.treasuryAccountId حساب الخزينة أو البنك المستلم
   * @param params.customerAccountId حساب العميل في حال سداد مديونية (اختياري)
   * @param params.revenueAccountId حساب الإيراد في حال التحصيل المباشر بدون عميل (اختياري)
   * @param params.customerName اسم العميل للبيان المحاسبي
   * @param params.date تاريخ السند
   * @param params.notes ملاحظات وبيان السند
   * @returns وعد بنتيجة القيد المحاسبي المنشأ
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
   * إنشاء وتوثيق قيد استلام شيك وارد (Incoming Cheque Entry)
   * يسجل الشيك في حساب أوراق القبض (1222) حتى موعد تحصيله الفعلي:
   * - الطرف المدين: أوراق قبض (1222)
   * - الطرف الدائن: حساب العميل أو الإيراد
   *
   * @param params معلمات استلام الشيك
   * @param params.organizationId معرف المنظمة لعزل الحسابات
   * @param params.chequeId معرف سجل الشيك الأصلي
   * @param params.chequeNumber رقم الشيك الورقي أو المصرفي
   * @param params.amount قيمة الشيك المالية
   * @param params.notesReceivableAccountId معرف حساب أوراق القبض (الافتراضي 1222)
   * @param params.creditAccountId معرف حساب العميل أو الإيراد المستحق
   * @param params.partyName اسم الساحب أو العميل
   * @param params.date تاريخ استحقاق أو تحرير الشيك
   * @returns وعد بنتيجة القيد المحاسبي المولد
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

/**
 * دالة التحقق الرياضي المسبق من توازن القيد المحاسبي (Double Entry Validation)
 * تفحص سلامة أطراف القيد وتساوي مجموع المدين مع الدائن قبل الإرسال لقاعدة البيانات:
 * - ترفض القيود التي تحتوي على أقل من طرفين
 * - تقارن الفرق المطلق بمستوى سماحية رقمي EPSILON = 0.0001
 *
 * @param entry كائن القيد المحتوي على مصفوفة lines
 * @returns كائن يوضح هل القيد صالح { isValid: true } أو نص الخطأ { isValid: false, error }
 */
export function validateJournalEntry(entry: { lines?: Array<{ debit?: number; credit?: number }> }): { isValid: boolean; error?: string } {
  if (!entry.lines || entry.lines.length < 2) {
    return { isValid: false, error: "يجب أن يحتوي القيد على طرفين على الأقل." };
  }
  const totalDebit = entry.lines.reduce((sum, line) => sum + Number(line.debit || 0), 0);
  const totalCredit = entry.lines.reduce((sum, line) => sum + Number(line.credit || 0), 0);

  const EPSILON = 0.0001;
  if (Math.abs(totalDebit - totalCredit) > EPSILON) {
    return { isValid: false, error: `القيد غير متوازن. المدين: ${totalDebit}, الدائن: ${totalCredit}` };
  }
  return { isValid: true };
}

export const AccountingEngine = new UnifiedAccountingEngine();
export const accountingEngine = AccountingEngine;
export default AccountingEngine;

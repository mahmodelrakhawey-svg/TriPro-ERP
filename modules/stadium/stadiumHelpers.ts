/**
 * ====================================================================
 * Stadium Module — Shared Helper Functions
 * إدارة استاد المنصورة ومركز التنمية الشبابية والمجتمعية
 * TriPro ERP — stadiumHelpers.ts
 * ====================================================================
 * دوال مساعدة مشتركة: توليد القيود المحاسبية الآلية + دوال مساعدة.
 * كل دالة مالية موثَّقة بتعليقات عربية كما اشترط المدير المالي.
 * ====================================================================
 */

import { supabase } from '@/supabaseClient';
import type {
  JournalEntryResult,
  StadiumAccountingConfig,
  PaymentMethod,
} from './stadium.types';
import { DEFAULT_STADIUM_ACCOUNTING } from './stadium.types';

// ─────────────────────────────────────────────
// 1. استخراج organization_id بأمان
// ─────────────────────────────────────────────
/**
 * يُعيد organization_id من المستخدم الحالي بأمان.
 * يُرجع null إذا لم يكن المستخدم مسجلاً أو لا ينتمي لمنظمة.
 */
export function getStadiumOrgId(currentUser: any): string | null {
  if (!currentUser) return null;
  return currentUser.organization_id || null;
}

// ─────────────────────────────────────────────
// 2. تنسيق التاريخ بالعربية
// ─────────────────────────────────────────────
/**
 * يُحوِّل تاريخ ISO إلى صيغة عربية مقروءة.
 * مثال: '2026-08-21' → '21 أغسطس 2026'
 */
export function formatStadiumDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '—';
  try {
    return new Date(dateStr).toLocaleDateString('ar-EG', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  } catch {
    return dateStr;
  }
}

// ─────────────────────────────────────────────
// 3. احتساب تاريخ انتهاء الاشتراك
// ─────────────────────────────────────────────
/**
 * يحتسب تاريخ انتهاء الاشتراك بناءً على نوع المدة.
 */
export function calcSubscriptionEndDate(
  startDate: string,
  duration: 'monthly' | 'quarterly' | 'semi_annual' | 'annual'
): string {
  const start = new Date(startDate);
  const monthsMap: Record<string, number> = {
    monthly: 1,
    quarterly: 3,
    semi_annual: 6,
    annual: 12,
  };
  const months = monthsMap[duration] ?? 1;
  start.setMonth(start.getMonth() + months);
  return start.toISOString().split('T')[0];
}

// ─────────────────────────────────────────────
// 4. حساب معدل الإشغال
// ─────────────────────────────────────────────
/**
 * يحتسب معدل الإشغال كنسبة مئوية.
 * المدخلات: ساعات محجوزة مقابل إجمالي ساعات متاحة.
 */
export function calculateOccupancyRate(bookedHours: number, availableHours: number): number {
  if (availableHours <= 0) return 0;
  return Math.min(100, Math.round((bookedHours / availableHours) * 100));
}

// ─────────────────────────────────────────────
// 5. التحقق من تعارض الأوقات (Client-side)
// ─────────────────────────────────────────────
/**
 * يتحقق ما إذا كان وقت الحجز الجديد يتعارض مع حجوزات موجودة.
 * يُستخدم كطبقة أولى قبل إرسال البيانات للقاعدة.
 * @returns true إذا كان هناك تعارض
 */
export async function checkBookingConflict(
  organizationId: string,
  facilityId: string,
  bookingDate: string,
  startTime: string,
  endTime: string,
  excludeBookingId?: string
): Promise<boolean> {
  // جلب الحجوزات الموجودة على نفس المرفق في نفس اليوم
  let query = supabase
    .from('stadium_bookings')
    .select('id, start_time, end_time')
    .eq('organization_id', organizationId)
    .eq('facility_id', facilityId)
    .eq('booking_date', bookingDate)
    .not('status', 'in', '("cancelled","no_show")');

  if (excludeBookingId) {
    query = query.neq('id', excludeBookingId);
  }

  const { data: existing } = await query;
  if (!existing || existing.length === 0) return false;

  // مقارنة الأوقات — التعارض يحدث عندما يتداخل النطاقان
  const newStart = startTime;
  const newEnd = endTime;

  return existing.some((booking: any) => {
    const existStart = booking.start_time;
    const existEnd = booking.end_time;
    // تعارض إذا بدأ الجديد قبل نهاية الموجود وانتهى بعد بداية الموجود
    return newStart < existEnd && newEnd > existStart;
  });
}

// ─────────────────────────────────────────────
// 6. تحويل PaymentMethod إلى عربي
// ─────────────────────────────────────────────
export function getPaymentMethodAr(method: PaymentMethod): string {
  const map: Record<PaymentMethod, string> = {
    cash: 'نقدي',
    bank_transfer: 'تحويل بنكي',
    card: 'بطاقة',
    cheque: 'شيك',
  };
  return map[method] ?? method;
}

// ─────────────────────────────────────────────
// 7. توليد قيد محاسبي: استلام اشتراك عضو
// ─────────────────────────────────────────────
/**
 * قيد استلام قيمة اشتراك عضو جديد أو تجديد.
 *
 * القيد:
 *   مدين  → الخزينة / البنك                (حساب الخزينة الرئيسية)
 *   دائن  → إيرادات الاشتراكات الرياضية    (حساب 4101 افتراضياً)
 *
 * @param orgId       - معرّف المنظمة
 * @param amount      - قيمة الاشتراك المحصَّلة
 * @param description - وصف القيد (اسم العضو + نوع الاشتراك)
 * @param date        - تاريخ الاشتراك
 * @param config      - إعدادات الحسابات المحاسبية
 * @returns JournalEntryResult
 */
// ─────────────────────────────────────────────
// 7. جلب حسابات الخزن والبنوك للمنشأة
// ─────────────────────────────────────────────
export interface ChequeDetails {
  cheque_number: string;
  bank_name: string;
  due_date: string;
  party_name?: string;
  notes?: string;
}

// ─────────────────────────────────────────────
// 7. جلب حسابات الخزن والبنوك للمنشأة
// ─────────────────────────────────────────────
export interface TreasuryAccountOption {
  id: string;
  code: string;
  name: string;
  type: string;
}

export async function getTreasuryAccounts(orgId: string): Promise<TreasuryAccountOption[]> {
  if (!orgId) return [];
  try {
    const { data } = await supabase
      .from('accounts')
      .select('id, code, name, type, is_group')
      .eq('organization_id', orgId)
      .eq('is_active', true)
      .eq('is_group', false)
      .order('code', { ascending: true });
    
    if (!data || data.length === 0) return [];
    
    // تصفية حسابات النقدية والبنوك
    const filtered = data.filter(a => 
      a.code?.startsWith('101') || 
      a.code?.startsWith('102') || 
      a.code?.startsWith('123') || 
      a.code?.startsWith('110') || 
      a.name?.includes('خزينة') || 
      a.name?.includes('خزنه') || 
      a.name?.includes('صندوق') || 
      a.name?.includes('بنك') || 
      a.name?.includes('نقدية') || 
      a.type === 'ASSET' || a.type === 'asset'
    );

    return filtered.length > 0 ? filtered : data;
  } catch (err) {
    console.error('Error fetching treasury accounts:', err);
    return [];
  }
}

// ─────────────────────────────────────────────
// 8. توليد قيد محاسبي: تجديد اشتراك عضو
// ─────────────────────────────────────────────
/**
 * قيد اشتراك عضو رياضي جديد أو تجديد اشتراك.
 *
 * في حال السداد بشيك:
 *   مدين  → أوراق القبض (1222) + إنشاء شيك قبض في إدارة الشيكات
 *   دائن  → إيرادات الاشتراكات الرياضية (4101)
 */
export async function createSubscriptionJournalEntry(
  orgId: string,
  amount: number,
  description: string,
  date: string,
  treasuryAccountIdOrCode?: string,
  paymentMethod?: string,
  chequeDetails?: ChequeDetails,
  config: StadiumAccountingConfig = DEFAULT_STADIUM_ACCOUNTING
): Promise<JournalEntryResult> {
  const isCheque = paymentMethod === 'cheque';
  const debitAccount = isCheque ? '1222' : (treasuryAccountIdOrCode || config.cash_account);
  
  return _createRevenueJournalEntry(
    orgId,
    amount,
    isCheque && chequeDetails ? `شيك قبض رقم ${chequeDetails.cheque_number} — ${description}` : description,
    date,
    debitAccount,
    config.subscriptions_revenue_account,
    'اشتراك عضو — استاد المنصورة الرياضي',
    isCheque ? chequeDetails : undefined
  );
}

// ─────────────────────────────────────────────
// 9. توليد قيد محاسبي: سداد حجز ملعب
// ─────────────────────────────────────────────
/**
 * قيد استلام قيمة حجز ملعب أو مرفق.
 */
export async function createBookingJournalEntry(
  orgId: string,
  amount: number,
  description: string,
  date: string,
  treasuryAccountIdOrCode?: string,
  paymentMethod?: string,
  chequeDetails?: ChequeDetails,
  config: StadiumAccountingConfig = DEFAULT_STADIUM_ACCOUNTING
): Promise<JournalEntryResult> {
  const isCheque = paymentMethod === 'cheque';
  const debitAccount = isCheque ? '1222' : (treasuryAccountIdOrCode || config.cash_account);

  return _createRevenueJournalEntry(
    orgId,
    amount,
    isCheque && chequeDetails ? `شيك قبض رقم ${chequeDetails.cheque_number} — ${description}` : description,
    date,
    debitAccount,
    config.bookings_revenue_account,
    'حجز ملعب — استاد المنصورة الرياضي',
    isCheque ? chequeDetails : undefined
  );
}

// ─────────────────────────────────────────────
// 10. توليد قيد محاسبي: استلام دفعة إيجار
// ─────────────────────────────────────────────
/**
 * قيد استلام دفعة إيجار دورية من مستأجر.
 */
export async function createRentalPaymentJournalEntry(
  orgId: string,
  amount: number,
  description: string,
  date: string,
  treasuryAccountIdOrCode?: string,
  paymentMethod?: string,
  chequeDetails?: ChequeDetails,
  config: StadiumAccountingConfig = DEFAULT_STADIUM_ACCOUNTING
): Promise<JournalEntryResult> {
  const isCheque = paymentMethod === 'cheque';
  const debitAccount = isCheque ? '1222' : (treasuryAccountIdOrCode || config.cash_account);

  return _createRevenueJournalEntry(
    orgId,
    amount,
    isCheque && chequeDetails ? `شيك قبض رقم ${chequeDetails.cheque_number} — ${description}` : description,
    date,
    debitAccount,
    config.rentals_revenue_account,
    'دفعة إيجار — استاد المنصورة الرياضي',
    isCheque ? chequeDetails : undefined
  );
}

// ─────────────────────────────────────────────
// 11. توليد قيد محاسبي: سداد رسوم برنامج
// ─────────────────────────────────────────────
/**
 * قيد استلام رسوم تسجيل مشارك في برنامج تدريبي.
 */
export async function createProgramEnrollmentJournalEntry(
  orgId: string,
  amount: number,
  description: string,
  date: string,
  treasuryAccountIdOrCode?: string,
  paymentMethod?: string,
  chequeDetails?: ChequeDetails,
  config: StadiumAccountingConfig = DEFAULT_STADIUM_ACCOUNTING
): Promise<JournalEntryResult> {
  const isCheque = paymentMethod === 'cheque';
  const debitAccount = isCheque ? '1222' : (treasuryAccountIdOrCode || config.cash_account);

  return _createRevenueJournalEntry(
    orgId,
    amount,
    isCheque && chequeDetails ? `شيك قبض رقم ${chequeDetails.cheque_number} — ${description}` : description,
    date,
    debitAccount,
    config.programs_revenue_account,
    'رسوم برنامج تدريبي — استاد المنصورة',
    isCheque ? chequeDetails : undefined
  );
}

// ─────────────────────────────────────────────
// 12. توليد قيد محاسبي: صرف عمولة مدرب
// ─────────────────────────────────────────────
/**
 * قيد صرف عمولة مدرب / كادر رياضي.
 */
export async function createCoachPaymentJournalEntry(
  orgId: string,
  amount: number,
  coachName: string,
  date: string,
  treasuryAccountIdOrCode?: string,
  config: StadiumAccountingConfig = DEFAULT_STADIUM_ACCOUNTING
): Promise<JournalEntryResult> {
  // صرف عمولة: المصروف في الجانب المدين والخزينة في الجانب الدائن
  return _createRevenueJournalEntry(
    orgId,
    amount,
    `عمولة مدرب: ${coachName} — استاد المنصورة`,
    date,
    config.coaches_expense_account,
    treasuryAccountIdOrCode || config.cash_account,
    'مصروف كوادر رياضية'
  );
}

// ─────────────────────────────────────────────
// الدوال الداخلية (Private helpers)
// ─────────────────────────────────────────────

/**
 * دالة مساعدة لتحديد الحساب أو إنشائه تلقائياً إذا لم يكن موجوداً
 */
async function _resolveAccount(
  orgId: string,
  accountRef: string,
  defaultMeta: { code: string; name: string; type: string }
): Promise<{ id: string; code: string; name: string } | null> {
  const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(accountRef);
  
  // 1. بحث بالـ UUID إذا كان المدخل معرّفاً
  if (isUUID) {
    const { data } = await supabase
      .from('accounts')
      .select('id, code, name')
      .eq('organization_id', orgId)
      .eq('id', accountRef)
      .maybeSingle();
    if (data) return data;
  }

  // 2. بحث بالكود المحدد
  const codeToLookup = isUUID ? defaultMeta.code : accountRef;
  const { data: byCode } = await supabase
    .from('accounts')
    .select('id, code, name')
    .eq('organization_id', orgId)
    .eq('code', codeToLookup)
    .maybeSingle();
  if (byCode) {
    // تصحيح مسمى الحساب تلقائياً إذا كان يحمل اسماً افتراضياً غير مطابق
    if (defaultMeta.code?.startsWith('5') && byCode.name?.includes('الخزينة')) {
      await supabase.from('accounts').update({ name: defaultMeta.name, type: 'EXPENSE' }).eq('id', byCode.id);
      byCode.name = defaultMeta.name;
    }
    return byCode;
  }

  // 3. بحث باسم الحساب (تقريبي)
  const { data: byName } = await supabase
    .from('accounts')
    .select('id, code, name')
    .eq('organization_id', orgId)
    .ilike('name', `%${defaultMeta.name}%`)
    .maybeSingle();
  if (byName) return byName;

  // 4. إنشاء الحساب تلقائياً في شجرة الحسابات إذا لم يكن موجوداً
  try {
    const { data: created } = await supabase
      .from('accounts')
      .insert({
        organization_id: orgId,
        code: defaultMeta.code,
        name: defaultMeta.name,
        type: defaultMeta.type,
        balance: 0,
        is_group: false,
        is_active: true
      })
      .select('id, code, name')
      .single();

    return created || null;
  } catch (err) {
    console.error(`[Stadium] Error creating default account ${defaultMeta.code}:`, err);
    return null;
  }
}

/**
 * [داخلي] يُنشئ قيد يومية محاسبي مرحل ويربطه بمركز تكلفة الاستاد
 * ويُنشئ شيك قبض في جدول cheques إذا كان الدفع بشيك
 */
async function _createRevenueJournalEntry(
  orgId: string,
  amount: number,
  description: string,
  date: string,
  debitAccountRef: string,    // حساب مدين (الخزينة أو أوراق القبض أو المصروف)
  creditAccountRef: string,   // حساب دائن (الإيراد أو الخزينة)
  reference: string,
  chequeDetails?: ChequeDetails
): Promise<JournalEntryResult> {
  try {
    if (amount <= 0) {
      return { success: false, error: 'قيمة القيد يجب أن تكون أكبر من صفر' };
    }

    const ACCOUNT_METAS: Record<string, { name: string; type: string }> = {
      '4101': { name: 'إيرادات الاشتراكات الرياضية', type: 'REVENUE' },
      '4102': { name: 'إيرادات حجوزات الملاعب والمرافق', type: 'REVENUE' },
      '4103': { name: 'إيرادات الإيجارات وحقوق الاستغلال', type: 'REVENUE' },
      '4104': { name: 'إيرادات الأكاديميات والبرامج التدريبية', type: 'REVENUE' },
      '5101': { name: 'مصروفات صيانة الملاعب والمرافق', type: 'EXPENSE' },
      '5102': { name: 'مهمات وأدوات ومستلزمات رياضية', type: 'EXPENSE' },
      '5103': { name: 'مصروفات بطولات وفعاليات رياضية', type: 'EXPENSE' },
      '5104': { name: 'مصروفات إنارة ومياه وكهرباء الملاعب', type: 'EXPENSE' },
      '5201': { name: 'تكاليف ومستحقات الكوادر والمدربين', type: 'EXPENSE' },
      '1011': { name: 'الخزينة الرئيسية', type: 'ASSET' },
      '1012': { name: 'البنك / الحساب الجاري', type: 'ASSET' },
      '1222': { name: 'أوراق القبض (شيكات واردة تحت التحصيل)', type: 'ASSET' },
      '2121': { name: 'أوراق الدفع (شيكات صادرة تحت الصرف)', type: 'LIABILITY' },
    };

    const debitMeta = ACCOUNT_METAS[debitAccountRef] || { name: 'الخزينة / النقدية', type: 'ASSET' };
    const creditMeta = ACCOUNT_METAS[creditAccountRef] || { name: 'إيرادات الاستاد', type: 'REVENUE' };

    const debitAccount = await _resolveAccount(orgId, debitAccountRef, { code: debitAccountRef, ...debitMeta });
    const creditAccount = await _resolveAccount(orgId, creditAccountRef, { code: creditAccountRef, ...creditMeta });


    if (!debitAccount || !creditAccount) {
      console.warn(`[Stadium] تعذر إيجاد أو إنشاء الحسابات: ${debitAccountRef} / ${creditAccountRef}`);
      return {
        success: false,
        error: `يرجى التأكد من توفر الحسابات المحاسبية في المنشأة`,
      };
    }

    // جلب مركز تكلفة الاستاد إن وُجد
    let stadiumCostCenterId: string | null = null;
    try {
      const { data: ccData } = await supabase
        .from('cost_centers')
        .select('id')
        .eq('organization_id', orgId)
        .eq('code', 'STADIUM')
        .maybeSingle();
      if (ccData?.id) {
        stadiumCostCenterId = ccData.id;
      }
    } catch {
      // تجاهل إذا لم يكن جدول مراكز التكلفة متاحاً
    }

    // إنشاء رأس القيد
    const ref = `STD-${Date.now().toString().slice(-6)}-${Math.floor(Math.random() * 1000)}`;
    const { data: journalEntry, error: jeError } = await supabase
      .from('journal_entries')
      .insert({
        organization_id: orgId,
        transaction_date: date || new Date().toISOString().split('T')[0],
        description: `${reference} — ${description}`.substring(0, 255),
        reference: ref,
        status: 'posted',
        is_posted: true,
        related_document_type: 'stadium',
      })
      .select('id')
      .single();

    if (jeError || !journalEntry) {
      console.error('[Stadium Journal Entry Error]:', jeError);
      return { success: false, error: jeError?.message ?? 'فشل إنشاء قيد اليومية' };
    }

    // إنشاء سطري القيد (مدين + دائن) في جدول journal_lines مع ربط مركز التكلفة
    const linesPayload = [
      {
        journal_entry_id: journalEntry.id,
        account_id: debitAccount.id,
        debit: amount,
        credit: 0,
        description: `مدين (${debitAccount.name}) — ${description}`.substring(0, 255),
        organization_id: orgId,
        cost_center_id: stadiumCostCenterId || null,
      },
      {
        journal_entry_id: journalEntry.id,
        account_id: creditAccount.id,
        debit: 0,
        credit: amount,
        description: `دائن (${creditAccount.name}) — ${description}`.substring(0, 255),
        organization_id: orgId,
        cost_center_id: stadiumCostCenterId || null,
      },
    ];

    const { error: linesError } = await supabase
      .from('journal_lines')
      .insert(linesPayload);

    if (linesError) {
      console.error('[Stadium Journal Lines Error]:', linesError);
      await supabase.from('journal_entries').delete().eq('id', journalEntry.id);
      return { success: false, error: linesError.message };
    }

    // 🌟 إذا كان الدفع بشيك، نقوم بإنشاء سجل شيك قبض وارد في جدول cheques
    if (chequeDetails && chequeDetails.cheque_number) {
      try {
        await supabase
          .from('cheques')
          .insert({
            organization_id: orgId,
            cheque_number: chequeDetails.cheque_number.trim(),
            bank_name: chequeDetails.bank_name?.trim() || 'بنك العميل',
            due_date: chequeDetails.due_date || date || new Date().toISOString().split('T')[0],
            party_name: chequeDetails.party_name?.trim() || description,
            amount: amount,
            type: 'incoming', // شيك قبض / وارد
            status: 'received', // مستلم تحت التحصيل
            notes: chequeDetails.notes || `شيك قبض وارد — مديول الاستاد: ${description}`,
            related_journal_entry_id: journalEntry.id
          });
      } catch (chqErr) {
        console.error('[Stadium] Error inserting incoming cheque:', chqErr);
      }
    }

    return { success: true, journalEntryId: journalEntry.id };
  } catch (err: any) {
    console.error('[Stadium Journal Error]:', err);
    return { success: false, error: err.message ?? 'خطأ غير متوقع' };
  }
}




/**
 * [داخلي] يُنشئ قيد مصروف (لصرف العمولات).
 * الاختلاف: المصروف مدين والخزينة دائن.
 */
async function _createExpenseJournalEntry(
  orgId: string,
  amount: number,
  description: string,
  date: string,
  debitAccountCode: string,   // حساب مدين (المصروف)
  creditAccountCode: string   // حساب دائن (الخزينة)
): Promise<JournalEntryResult> {
  return _createRevenueJournalEntry(
    orgId,
    amount,
    description,
    date,
    debitAccountCode,
    creditAccountCode,
    'مصروف كوادر رياضية'
  );
}

// ─────────────────────────────────────────────
// 12. رفع صورة إلى Supabase Storage
// ─────────────────────────────────────────────
/**
 * يرفع صورة إلى bucket "stadium-media" ويُعيد الرابط العام.
 * الحد الأقصى 5MB — يُرفض ما هو أكبر.
 *
 * @param file   - الملف المختار من input[type=file]
 * @param folder - المجلد داخل الـ bucket (مثال: 'members' أو 'facilities')
 * @returns الرابط العام أو null عند الفشل
 */
export async function uploadStadiumImage(
  file: File,
  folder: 'members' | 'facilities' | 'coaches'
): Promise<string | null> {
  // التحقق من الحجم — 5MB كحد أقصى للحفاظ على حصة Storage المجانية
  const MAX_SIZE = 5 * 1024 * 1024; // 5MB
  if (file.size > MAX_SIZE) {
    throw new Error('حجم الصورة يتجاوز 5MB — يرجى ضغط الصورة أولاً');
  }

  const ext = file.name.split('.').pop()?.toLowerCase() ?? 'jpg';
  const fileName = `${folder}/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;

  const { error } = await supabase.storage
    .from('stadium-media')
    .upload(fileName, file, { cacheControl: '3600', upsert: false });

  if (error) {
    console.error('[Stadium Storage]', error.message);
    return null;
  }

  const { data } = supabase.storage.from('stadium-media').getPublicUrl(fileName);
  return data?.publicUrl ?? null;
}

// ─────────────────────────────────────────────
// 13. تنسيق العملة
// ─────────────────────────────────────────────
export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('ar-EG', {
    style: 'currency',
    currency: 'EGP',
    maximumFractionDigits: 2,
  }).format(amount);
}

// ─────────────────────────────────────────────
// 14. لون حالة العضوية
// ─────────────────────────────────────────────
export function getMemberStatusColor(status: string): string {
  const colors: Record<string, string> = {
    active: 'bg-emerald-100 text-emerald-700',
    expired: 'bg-red-100 text-red-700',
    suspended: 'bg-amber-100 text-amber-700',
    cancelled: 'bg-slate-100 text-slate-500',
  };
  return colors[status] ?? 'bg-slate-100 text-slate-500';
}

// ─────────────────────────────────────────────
// 15. لون حالة الحجز
// ─────────────────────────────────────────────
export function getBookingStatusColor(status: string): string {
  const colors: Record<string, string> = {
    pending: 'bg-amber-100 text-amber-700',
    confirmed: 'bg-blue-100 text-blue-700',
    paid: 'bg-emerald-100 text-emerald-700',
    cancelled: 'bg-red-100 text-red-700',
    no_show: 'bg-slate-100 text-slate-500',
  };
  return colors[status] ?? 'bg-slate-100 text-slate-500';
}

// ─────────────────────────────────────────────
// 16. جلب حسابات المصروفات للمنشأة
// ─────────────────────────────────────────────
export async function getExpenseAccounts(orgId: string): Promise<TreasuryAccountOption[]> {
  if (!orgId) return [];
  try {
    const { data } = await supabase
      .from('accounts')
      .select('id, code, name, type, is_group')
      .eq('organization_id', orgId)
      .eq('is_active', true)
      .eq('is_group', false)
      .order('code', { ascending: true });
    
    if (!data || data.length === 0) return [];
    
    const filtered = data.filter(a => 
      a.code?.startsWith('5') || 
      a.type === 'EXPENSE' || a.type === 'expense' ||
      a.name?.includes('مصروف') ||
      a.name?.includes('صيانة') ||
      a.name?.includes('أدوات') ||
      a.name?.includes('مكافآت')
    );

    return filtered.length > 0 ? filtered : data;
  } catch (err) {
    console.error('Error fetching expense accounts:', err);
    return [];
  }
}

// ─────────────────────────────────────────────
// 17. معالجة صرف طلب استثمار/مصروف وإصدار الشيك
// ─────────────────────────────────────────────
export async function processDisbursementPayment(
  orgId: string,
  disbursement: {
    id: string;
    request_number: string;
    title: string;
    amount: number;
    beneficiary_name: string;
    expense_account_code: string;
    payment_type: string;
  },
  paymentData: {
    treasury_account_id?: string;
    cheque_number?: string;
    bank_name?: string;
    due_date?: string;
    notes?: string;
  }
): Promise<JournalEntryResult & { chequeId?: string }> {
  try {
    // 1. تحديد الحساب المدين (المصروف) والحساب الدائن (البنك / أوراق الدفع / الخزينة)
    const expenseCode = disbursement.expense_account_code || '5101';
    const isCheque = disbursement.payment_type === 'cheque';
    const creditRef = isCheque ? '2121' : (paymentData.treasury_account_id || '1011');

    const EXPENSE_NAMES: Record<string, string> = {
      '5101': 'مصروفات صيانة الملاعب والمرافق',
      '5102': 'مهمات وأدوات ومستلزمات رياضية',
      '5103': 'مصروفات البطولات والمعسكرات الرياضية',
      '5104': 'فواتير تشغيل ومرافق وخدمات الاستاد',
      '5201': 'تكاليف ومستحقات الكوادر والمدربين',
      '5301': 'مصروفات إدارية وعمومية للاستاد',
      '2121': 'أوراق الدفع (شيكات صادرة تحت الصرف)',
      '1011': 'الخزينة الرئيسية',
    };

    const debitAccount = await _resolveAccount(orgId, expenseCode, {
      code: expenseCode,
      name: EXPENSE_NAMES[expenseCode] || 'مصروفات الاستاد الرياضي',
      type: 'EXPENSE',
    });

    const creditAccount = await _resolveAccount(orgId, creditRef, {
      code: creditRef,
      name: EXPENSE_NAMES[creditRef] || (isCheque ? 'أوراق الدفع (شيكات صادرة)' : 'الخزينة / البنك'),
      type: isCheque ? 'LIABILITY' : 'ASSET',
    });

    if (!debitAccount || !creditAccount) {
      return { success: false, error: 'تعذر تهيئة الحسابات المحاسبية للصرف' };
    }

    // جلب مركز تكلفة الاستاد
    let stadiumCostCenterId: string | null = null;
    try {
      const { data: ccData } = await supabase
        .from('cost_centers')
        .select('id')
        .eq('organization_id', orgId)
        .eq('code', 'STADIUM')
        .maybeSingle();
      if (ccData?.id) stadiumCostCenterId = ccData.id;
    } catch {}

    // إنشاء رأس القيد
    const today = new Date().toISOString().split('T')[0];
    const ref = `DISB-${Date.now().toString().slice(-6)}`;
    const { data: journalEntry, error: jeError } = await supabase
      .from('journal_entries')
      .insert({
        organization_id: orgId,
        transaction_date: paymentData.due_date || today,
        description: `صرف طلب: ${disbursement.request_number} — ${disbursement.title} — المستفيد: ${disbursement.beneficiary_name}`,
        reference: ref,
        status: 'posted',
        is_posted: true,
        related_document_type: 'stadium_disbursement',
      })
      .select('id')
      .single();

    if (jeError || !journalEntry) {
      return { success: false, error: jeError?.message ?? 'فشل إنشاء قيد اليومية' };
    }

    // إنشاء سطري القيد
    const linesPayload = [
      {
        journal_entry_id: journalEntry.id,
        account_id: debitAccount.id,
        debit: disbursement.amount,
        credit: 0,
        description: `مدين (${debitAccount.name}) — ${disbursement.title}`,
        organization_id: orgId,
        cost_center_id: stadiumCostCenterId || null,
      },
      {
        journal_entry_id: journalEntry.id,
        account_id: creditAccount.id,
        debit: 0,
        credit: disbursement.amount,
        description: `دائن (${creditAccount.name}) — إلى: ${disbursement.beneficiary_name}`,
        organization_id: orgId,
        cost_center_id: stadiumCostCenterId || null,
      },
    ];

    const { error: linesError } = await supabase.from('journal_lines').insert(linesPayload);
    if (linesError) {
      await supabase.from('journal_entries').delete().eq('id', journalEntry.id);
      return { success: false, error: linesError.message };
    }

    let createdChequeId: string | undefined;

    // إذا كان الصرف بشيك، ننشئ شيك صادر في جدول cheques
    if (isCheque && paymentData.cheque_number) {
      const { data: chequeRec } = await supabase
        .from('cheques')
        .insert({
          organization_id: orgId,
          cheque_number: paymentData.cheque_number.trim(),
          bank_name: paymentData.bank_name?.trim() || 'البنك المسحوب عليه',
          due_date: paymentData.due_date || today,
          party_name: disbursement.beneficiary_name,
          amount: disbursement.amount,
          type: 'outgoing', // شيك صادر
          status: 'issued', // مُصدر تحت الصرف
          notes: `شيك صادر لمصروف الاستاد: ${disbursement.title} (طلب ${disbursement.request_number})`,
          related_journal_entry_id: journalEntry.id,
        })
        .select('id')
        .single();
      if (chequeRec) createdChequeId = chequeRec.id;
    }

    // تحديث حالة طلب الصرف
    await supabase
      .from('stadium_disbursements')
      .update({
        status: 'paid',
        journal_entry_id: journalEntry.id,
        cheque_id: createdChequeId || null,
      })
      .eq('id', disbursement.id);

    return { success: true, journalEntryId: journalEntry.id, chequeId: createdChequeId };
  } catch (err: any) {
    console.error('Error processing disbursement payment:', err);
    return { success: false, error: err.message };
  }
}

// ─────────────────────────────────────────────
// 18. معالجة صرف عهدة جديدة
// ─────────────────────────────────────────────
export async function createCustodyIssuanceJournalEntry(
  orgId: string,
  custody: {
    custodian_name: string;
    purpose: string;
    total_amount: number;
    disbursement_method: string;
  },
  paymentData: {
    treasury_account_id?: string;
    cheque_number?: string;
    bank_name?: string;
    due_date?: string;
  }
): Promise<JournalEntryResult & { chequeId?: string }> {
  try {
    const isCheque = custody.disbursement_method === 'cheque';
    const debitRef = '1224'; // حساب العهد النقدية
    const creditRef = isCheque ? '2121' : (paymentData.treasury_account_id || '1011');

    const debitAccount = await _resolveAccount(orgId, debitRef, {
      code: debitRef,
      name: 'العهد النقدية والأمانات المؤقتة',
      type: 'ASSET',
    });

    const creditAccount = await _resolveAccount(orgId, creditRef, {
      code: creditRef,
      name: isCheque ? 'أوراق الدفع (شيكات صادرة)' : 'الخزينة / البنك',
      type: isCheque ? 'LIABILITY' : 'ASSET',
    });

    if (!debitAccount || !creditAccount) {
      return { success: false, error: 'تعذر تهيئة حسابات العهد' };
    }

    const today = new Date().toISOString().split('T')[0];
    const ref = `CUST-${Date.now().toString().slice(-6)}`;
    const { data: journalEntry, error: jeError } = await supabase
      .from('journal_entries')
      .insert({
        organization_id: orgId,
        transaction_date: paymentData.due_date || today,
        description: `صرف عهدة: ${custody.custodian_name} — الغرض: ${custody.purpose}`,
        reference: ref,
        status: 'posted',
        is_posted: true,
        related_document_type: 'stadium_custody',
      })
      .select('id')
      .single();

    if (jeError || !journalEntry) {
      return { success: false, error: jeError?.message ?? 'فشل إنشاء قيد صرف العهدة' };
    }

    const linesPayload = [
      {
        journal_entry_id: journalEntry.id,
        account_id: debitAccount.id,
        debit: custody.total_amount,
        credit: 0,
        description: `مدين (${debitAccount.name}) — عهدة طرف ${custody.custodian_name}`,
        organization_id: orgId,
      },
      {
        journal_entry_id: journalEntry.id,
        account_id: creditAccount.id,
        debit: 0,
        credit: custody.total_amount,
        description: `دائن (${creditAccount.name}) — صرف عهدة ${custody.custodian_name}`,
        organization_id: orgId,
      },
    ];

    await supabase.from('journal_lines').insert(linesPayload);

    let createdChequeId: string | undefined;
    if (isCheque && paymentData.cheque_number) {
      const { data: chq } = await supabase
        .from('cheques')
        .insert({
          organization_id: orgId,
          cheque_number: paymentData.cheque_number.trim(),
          bank_name: paymentData.bank_name?.trim() || 'البنك المسحوب عليه',
          due_date: paymentData.due_date || today,
          party_name: custody.custodian_name,
          amount: custody.total_amount,
          type: 'outgoing',
          status: 'issued',
          notes: `شيك صرف عهدة: ${custody.purpose} — طرف: ${custody.custodian_name}`,
          related_journal_entry_id: journalEntry.id,
        })
        .select('id')
        .single();
      if (chq) createdChequeId = chq.id;
    }

    return { success: true, journalEntryId: journalEntry.id, chequeId: createdChequeId };
  } catch (err: any) {
    console.error('Error creating custody issuance entry:', err);
    return { success: false, error: err.message };
  }
}

// ─────────────────────────────────────────────
// 19. معالجة تسوية عهدة (فواتير فعلية + رد المتبقي)
// ─────────────────────────────────────────────
export async function createCustodySettlementJournalEntry(
  orgId: string,
  custody: {
    id: string;
    custodian_name: string;
    purpose: string;
    total_amount: number;
  },
  settlementData: {
    spent_amount: number;
    remaining_amount: number;
    expense_account_code: string;
    return_treasury_id?: string;
    notes?: string;
  }
): Promise<JournalEntryResult> {
  try {
    const custodyAccount = await _resolveAccount(orgId, '1224', {
      code: '1224',
      name: 'العهد النقدية والأمانات المؤقتة',
      type: 'ASSET',
    });

    const expenseAccount = await _resolveAccount(orgId, settlementData.expense_account_code || '5101', {
      code: settlementData.expense_account_code || '5101',
      name: 'مصروفات الأنشطة والبطولات والصيانة',
      type: 'EXPENSE',
    });

    if (!custodyAccount || !expenseAccount) {
      return { success: false, error: 'تعذر العثور على الحسابات المحاسبية للتسوية' };
    }

    // جلب مركز تكلفة الاستاد
    let stadiumCostCenterId: string | null = null;
    try {
      const { data: ccData } = await supabase
        .from('cost_centers')
        .select('id')
        .eq('organization_id', orgId)
        .eq('code', 'STADIUM')
        .maybeSingle();
      if (ccData?.id) stadiumCostCenterId = ccData.id;
    } catch {}

    const today = new Date().toISOString().split('T')[0];
    const ref = `SETTL-${Date.now().toString().slice(-6)}`;
    const { data: journalEntry, error: jeError } = await supabase
      .from('journal_entries')
      .insert({
        organization_id: orgId,
        transaction_date: today,
        description: `تسوية عهدة: ${custody.custodian_name} — ${custody.purpose}`,
        reference: ref,
        status: 'posted',
        is_posted: true,
        related_document_type: 'stadium_custody_settlement',
      })
      .select('id')
      .single();

    if (jeError || !journalEntry) {
      return { success: false, error: jeError?.message ?? 'فشل إنشاء قيد التسوية' };
    }

    const linesPayload: any[] = [];

    // مدين 1: المصروف الفعلي
    if (settlementData.spent_amount > 0) {
      linesPayload.push({
        journal_entry_id: journalEntry.id,
        account_id: expenseAccount.id,
        debit: settlementData.spent_amount,
        credit: 0,
        description: `مدين (${expenseAccount.name}) — تسوية عهدة ${custody.custodian_name}`,
        organization_id: orgId,
        cost_center_id: stadiumCostCenterId || null,
      });
    }

    // مدين 2: المتبقي المردود إلى الخزينة / البنك (إن وجد)
    if (settlementData.remaining_amount > 0) {
      const returnAccount = await _resolveAccount(
        orgId,
        settlementData.return_treasury_id || '1011',
        { code: '1011', name: 'الخزينة الرئيسية', type: 'ASSET' }
      );
      if (returnAccount) {
        linesPayload.push({
          journal_entry_id: journalEntry.id,
          account_id: returnAccount.id,
          debit: settlementData.remaining_amount,
          credit: 0,
          description: `مدين (${returnAccount.name}) — رد متبقي عهدة ${custody.custodian_name}`,
          organization_id: orgId,
        });
      }
    }

    // دائن: إقفال حساب العهدة بالمبلغ الكلي
    linesPayload.push({
      journal_entry_id: journalEntry.id,
      account_id: custodyAccount.id,
      debit: 0,
      credit: custody.total_amount,
      description: `دائن (${custodyAccount.name}) — إقفال عهدة ${custody.custodian_name}`,
      organization_id: orgId,
    });

    await supabase.from('journal_lines').insert(linesPayload);

    // تحديث سجل العهدة
    await supabase
      .from('stadium_custodies')
      .update({
        spent_amount: settlementData.spent_amount,
        remaining_amount: settlementData.remaining_amount,
        status: 'settled',
        settlement_date: today,
        settlement_journal_id: journalEntry.id,
        notes: settlementData.notes ? `${settlementData.notes}` : undefined,
      })
      .eq('id', custody.id);

    return { success: true, journalEntryId: journalEntry.id };
  } catch (err: any) {
    console.error('Error creating custody settlement entry:', err);
    return { success: false, error: err.message };
  }
}

// ─────────────────────────────────────────────
// 27. التحقق من تعارض الحجز مع مواعيد الصيانة
// ─────────────────────────────────────────────
export async function checkFacilityMaintenanceConflict(
  facilityId: string,
  bookingDate: string,
  startTime: string,
  endTime: string
): Promise<{ hasConflict: boolean; maintenanceTitle?: string }> {
  try {
    const { data: tickets, error } = await supabase
      .from('stadium_maintenance_tickets')
      .select('id, title, start_date, end_date, start_time, end_time, is_blocking_bookings')
      .eq('facility_id', facilityId)
      .eq('is_blocking_bookings', true)
      .in('status', ['scheduled', 'in_progress'])
      .lte('start_date', bookingDate)
      .gte('end_date', bookingDate);

    if (error || !tickets || tickets.length === 0) {
      return { hasConflict: false };
    }

    for (const t of tickets) {
      // If no specific times set, it blocks the whole day
      if (!t.start_time || !t.end_time) {
        return { hasConflict: true, maintenanceTitle: t.title };
      }
      // Check time overlap
      if (startTime < t.end_time && endTime > t.start_time) {
        return { hasConflict: true, maintenanceTitle: t.title };
      }
    }

    return { hasConflict: false };
  } catch (err) {
    console.error('Error checking maintenance conflict:', err);
    return { hasConflict: false };
  }
}

// ─────────────────────────────────────────────
// 28. تفقيط المبالغ المالية باللغة العربية (ج.م)
// ─────────────────────────────────────────────
export function numberToArabicWords(amount: number): string {
  if (!amount || isNaN(amount) || amount === 0) return 'صفر جنيه مصري';
  
  const ones = ['', 'واحد', 'اثنان', 'ثلاثة', 'أربعة', 'خمسة', 'ستة', 'سبعة', 'ثمانية', 'تسعة', 'عشرة',
    'أحد عشر', 'اثنا عشر', 'ثلاثة عشر', 'أربعة عشر', 'خمسة عشر', 'ستة عشر', 'سبعة عشر', 'ثمانية عشر', 'تسعة عشر'];
  const tens = ['', 'عشرة', 'عشرون', 'ثلاثون', 'أربعون', 'خمسون', 'ستون', 'سبعون', 'ثمانون', 'تسعون'];
  const hundreds = ['', 'مائة', 'مائتان', 'ثلاثمائة', 'أربعمائة', 'خمسمائة', 'ستمائة', 'سبعمائة', 'ثمانمائة', 'تسعمائة'];

  const convertChunk = (num: number): string => {
    let res = '';
    const h = Math.floor(num / 100);
    const remainder = num % 100;
    if (h > 0) res += hundreds[h];
    if (h > 0 && remainder > 0) res += ' و ';
    
    if (remainder > 0 && remainder < 20) {
      res += ones[remainder];
    } else if (remainder >= 20) {
      const o = remainder % 10;
      const t = Math.floor(remainder / 10);
      if (o > 0) res += ones[o] + ' و ';
      res += tens[t];
    }
    return res;
  };

  const integerPart = Math.floor(amount);
  const decimalPart = Math.round((amount - integerPart) * 100);

  let words = '';
  if (integerPart >= 1000000) {
    const millions = Math.floor(integerPart / 1000000);
    words += convertChunk(millions) + ' مليون ';
    const rem = integerPart % 1000000;
    if (rem > 0) words += 'و ' + numberToArabicWords(rem);
  } else if (integerPart >= 1000) {
    const thousands = Math.floor(integerPart / 1000);
    const rem = integerPart % 1000;
    if (thousands === 1) words += 'ألف ';
    else if (thousands === 2) words += 'ألفان ';
    else if (thousands >= 3 && thousands <= 10) words += convertChunk(thousands) + ' آلاف ';
    else words += convertChunk(thousands) + ' ألف ';
    if (rem > 0) words += 'و ' + convertChunk(rem);
  } else {
    words = convertChunk(integerPart);
  }

  let finalStr = 'فقط ' + words.trim() + ' جنيه مصري';
  if (decimalPart > 0) {
    finalStr += ' و ' + convertChunk(decimalPart) + ' قرشاً';
  }
  return finalStr + ' لا غير';
}

// ─────────────────────────────────────────────
// 29. روابط ورسائل WhatsApp للأعضاء والمستأجرين
// ─────────────────────────────────────────────
export function generateWhatsAppRenewalUrl(phone: string, memberName: string, endDate: string): string {
  const cleanPhone = phone.replace(/[^0-9]/g, '');
  const formattedPhone = cleanPhone.startsWith('0') ? '2' + cleanPhone : cleanPhone.startsWith('2') ? cleanPhone : '20' + cleanPhone;
  const msg = `السيد/ة ${memberName} المحترم/ة،\nتحية طيبة من إدارة استاد المنصورة الرياضي ومركز التنمية الشبابية 🏟️.\nنحيطكم علماً بأن موعد تجديد اشتراككم السنوي ينتهي في (${endDate}).\nيرجى التفضل بزيارة إدارة الاشتراكات والخزينة للتجديد واستلام بطاقة العضوية الحديثة.\nشاكرين ومقدرين تواصلكم معنا.`;
  return `https://wa.me/${formattedPhone}?text=${encodeURIComponent(msg)}`;
}

export function generateWhatsAppBookingUrl(phone: string, bookerName: string, facilityName: string, date: string, time: string, amount: number, refDoc: string): string {
  const cleanPhone = phone.replace(/[^0-9]/g, '');
  const formattedPhone = cleanPhone.startsWith('0') ? '2' + cleanPhone : cleanPhone.startsWith('2') ? cleanPhone : '20' + cleanPhone;
  const msg = `السيد/ة ${bookerName} المحترم/ة،\nتم تأكيد حجزكم بنجاح في استاد المنصورة الرياضي ⚽🏊‍♂️.\nالمرفق: ${facilityName}\nالتاريخ: ${date}\nالوقت: ${time}\nالمبلغ المسدد: ${amount.toLocaleString('ar-EG')} ج.م\nرقم الإيصال: ${refDoc}\nنتمنى لكم قضاء وقت رياضي ممتع!`;
  return `https://wa.me/${formattedPhone}?text=${encodeURIComponent(msg)}`;
}

// ─────────────────────────────────────────────
// 30. قيد اشتراك فريق في بطولة رياضية
// ─────────────────────────────────────────────
export async function createTournamentTeamJournalEntry(
  orgId: string,
  amount: number,
  teamName: string,
  tournamentName: string,
  date: string,
  treasuryAccountIdOrCode?: string
): Promise<JournalEntryResult> {
  return _createRevenueJournalEntry(
    orgId,
    amount,
    `رسوم اشتراك فريق: ${teamName} — بطولة: ${tournamentName}`,
    date,
    treasuryAccountIdOrCode || '1011',
    '4104', // إيرادات الأكاديميات والأنشطة والبطولات
    'اشتراك بطولة رياضية — استاد المنصورة'
  );
}

// ─────────────────────────────────────────────
// 31. قيد سداد مصروفات صيانة الملاعب والمرافق
// ─────────────────────────────────────────────
export async function createMaintenancePaymentJournalEntry(
  orgId: string,
  ticketId: string,
  amount: number,
  facilityName: string,
  ticketTitle: string,
  date: string,
  paymentMethod: 'cash' | 'bank_transfer' | 'cheque' = 'cash',
  treasuryAccountIdOrCode?: string,
  chequeDetails?: {
    cheque_number?: string;
    bank_name?: string;
    due_date?: string;
    notes?: string;
  }
): Promise<JournalEntryResult> {
  const isCheque = paymentMethod === 'cheque';
  const creditCode = isCheque ? '2121' : (treasuryAccountIdOrCode || '1011');
  const debitCode = '5101'; // مصروفات صيانة الملاعب والمرافق


  let chq: ChequeDetails | undefined;
  if (isCheque && chequeDetails?.cheque_number) {
    chq = {
      cheque_number: chequeDetails.cheque_number,
      bank_name: chequeDetails.bank_name || 'البنك',
      due_date: chequeDetails.due_date || date,
      notes: chequeDetails.notes,
    };
  }

  return _createRevenueJournalEntry(
    orgId,
    amount,
    `صيانة منشأة — ${facilityName} — ${ticketTitle}`,
    date,
    debitCode,   // مدين (المصروف 5101)
    creditCode,  // دائن (الخزينة 1011 أو البنك أو أوراق الدفع 2121)
    'مصروفات صيانة الملاعب والمرافق',
    chq
  );
}






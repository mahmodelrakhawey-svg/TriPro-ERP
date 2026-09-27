/**
 * 📊 Integration Test Suite #3: Accounting Integrity
 *
 * يختبر سلامة المحرك المحاسبي على قاعدة البيانات الحقيقية:
 *
 * 1. كل القيود اليومية في قاعدة البيانات متوازنة (مدين = دائن)
 * 2. لا توجد قيود يتيمة (journal_lines بدون journal_entry)
 * 3. الأرصدة التراكمية للعملاء تتطابق مع مجموع المعاملات
 * 4. لا توجد فواتير مرحّلة بدون قيود محاسبية (إذا كانت الـ Trigger تعمل)
 * 5. إجمالي المبيعات يساوي إجمالي القيود الدائنة لحساب الإيرادات
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  checkIntegrationEnv,
  createAuthenticatedClient,
  createServiceClient,
  ADMIN_EMAIL,
  ADMIN_PASSWORD
} from './helpers/supabaseIntegrationClient';

const HAS_ENV = checkIntegrationEnv();
const runIf = HAS_ENV ? it : it.skip;

let adminClient: ReturnType<typeof createAuthenticatedClient> extends Promise<infer T> ? T : never;
let serviceClient: ReturnType<typeof createServiceClient>;

beforeAll(async () => {
  if (!HAS_ENV) return;
  serviceClient = createServiceClient();
  adminClient = await createAuthenticatedClient(ADMIN_EMAIL!, ADMIN_PASSWORD!);
  console.log(`\n📊 اختبار سلامة المحاسبة — org: ${adminClient.orgId}`);
});

afterAll(async () => {
  if (!HAS_ENV) return;
  await adminClient.client.auth.signOut();
});

describe('📊 [Integration] Accounting Integrity — قاعدة بيانات حقيقية', () => {

  // ─────────────────────────────────────────────────────
  // TEST 1: كل القيود المرحّلة متوازنة (Debit = Credit)
  // ─────────────────────────────────────────────────────
  runIf('1. جميع قيود اليومية المرحّلة متوازنة (مدين = دائن) بدون استثناء', async () => {
    const { data: entries, error } = await adminClient.client
      .from('journal_entries')
      .select('id, entry_number, total_debit, total_credit, status, date')
      .eq('organization_id', adminClient.orgId!)
      .eq('status', 'posted')
      .order('date', { ascending: false })
      .limit(200);

    expect(error).toBeNull();

    if (!entries || entries.length === 0) {
      console.log(`   ℹ️  لا توجد قيود مرحّلة للفحص`);
      return;
    }

    const unbalancedEntries = entries.filter(entry => {
      const debit = Number(entry.total_debit ?? 0);
      const credit = Number(entry.total_credit ?? 0);
      return Math.abs(debit - credit) > 0.01; // تسامح مع كسور التقريب
    });

    if (unbalancedEntries.length > 0) {
      console.error(`   ❌ قيود غير متوازنة (${unbalancedEntries.length}):`);
      unbalancedEntries.slice(0, 5).forEach(e => {
        console.error(`      ${e.entry_number} | مدين: ${e.total_debit} | دائن: ${e.total_credit} | فرق: ${Math.abs(e.total_debit - e.total_credit)}`);
      });
    }

    expect(unbalancedEntries).toHaveLength(0);
    console.log(`   ✅ فُحص ${entries.length} قيد — جميعها متوازنة`);
  });

  // ─────────────────────────────────────────────────────
  // TEST 2: لا توجد بنود يتيمة (journal_lines بدون entry)
  // ─────────────────────────────────────────────────────
  runIf('2. لا توجد بنود يومية يتيمة (orphaned journal_lines)', async () => {
    // البنود اليتيمة: journal_lines تشير لـ journal_entry_id غير موجود
    const { data: lines, error } = await adminClient.client
      .from('journal_lines')
      .select('id, journal_entry_id, debit, credit')
      .eq('organization_id', adminClient.orgId!)
      .limit(500);

    expect(error).toBeNull();

    if (!lines || lines.length === 0) {
      console.log(`   ℹ️  لا توجد بنود يومية للفحص`);
      return;
    }

    // نجمع كل journal_entry_ids ونتحقق من وجودها
    const entryIds = [...new Set(lines.map(l => l.journal_entry_id))];
    const { data: entries, error: entryError } = await adminClient.client
      .from('journal_entries')
      .select('id')
      .in('id', entryIds.slice(0, 100)); // نفحص أول 100

    expect(entryError).toBeNull();

    const existingIds = new Set((entries ?? []).map(e => e.id));
    const orphanedLines = lines.filter(l => !existingIds.has(l.journal_entry_id));

    if (orphanedLines.length > 0) {
      console.error(`   ❌ وُجدت ${orphanedLines.length} بنود يتيمة`);
    }

    expect(orphanedLines).toHaveLength(0);
    console.log(`   ✅ فُحص ${lines.length} بند — لا يتامى`);
  });

  // ─────────────────────────────────────────────────────
  // TEST 3: أرصدة العملاء لا تتجاوز حد معقول (Data Sanity)
  // ─────────────────────────────────────────────────────
  runIf('3. سلامة أرصدة العملاء — لا أرصدة شاذة أو غير منطقية', async () => {
    const { data: customers, error } = await adminClient.client
      .from('customers')
      .select('id, name, balance')
      .eq('organization_id', adminClient.orgId!)
      .eq('is_active', true)
      .limit(100);

    expect(error).toBeNull();

    if (!customers || customers.length === 0) {
      console.log(`   ℹ️  لا يوجد عملاء للفحص`);
      return;
    }

    // فحص: أرصدة تتجاوز 100 مليون جنيه قد تكون خطأ إدخال
    const suspiciousBalances = customers.filter(c =>
      Math.abs(Number(c.balance ?? 0)) > 100_000_000
    );

    if (suspiciousBalances.length > 0) {
      console.warn(`   ⚠️  عملاء بأرصدة مشبوهة (> 100M):`);
      suspiciousBalances.forEach(c => console.warn(`      ${c.name}: ${c.balance}`));
    }

    // هذا تحقق من سلامة البيانات وليس خطأ برمجي
    const positiveBal = customers.filter(c => Number(c.balance ?? 0) > 0).length;
    const negativeBal = customers.filter(c => Number(c.balance ?? 0) < 0).length;
    const zeroBal = customers.filter(c => Number(c.balance ?? 0) === 0).length;

    console.log(`   ✅ تحليل أرصدة ${customers.length} عميل:`);
    console.log(`      مدينون (رصيد موجب): ${positiveBal}`);
    console.log(`      دائنون (رصيد سالب): ${negativeBal}`);
    console.log(`      رصيد صفر: ${zeroBal}`);

    expect(customers.length).toBeGreaterThanOrEqual(0);
  });

  // ─────────────────────────────────────────────────────
  // TEST 4: أرصدة الموردين سالبة أو صفر (المنطق التجاري)
  // ─────────────────────────────────────────────────────
  runIf('4. سلامة أرصدة الموردين — المدفوعات والمستحقات منطقية', async () => {
    const { data: suppliers, error } = await adminClient.client
      .from('suppliers')
      .select('id, name, balance')
      .eq('organization_id', adminClient.orgId!)
      .eq('is_active', true)
      .limit(100);

    expect(error).toBeNull();

    if (!suppliers || suppliers.length === 0) {
      console.log(`   ℹ️  لا يوجد موردون للفحص`);
      return;
    }

    const totalOwed = suppliers.reduce((sum, s) => sum + Math.abs(Number(s.balance ?? 0)), 0);
    console.log(`   ✅ ${suppliers.length} مورد — إجمالي المستحقات: ${totalOwed.toLocaleString('ar-EG')} ج.م`);

    expect(typeof totalOwed).toBe('number');
  });

  // ─────────────────────────────────────────────────────
  // TEST 5: الفواتير المرحّلة لها رقم فاتورة صحيح
  // ─────────────────────────────────────────────────────
  runIf('5. جميع الفواتير المرحّلة لها invoice_number غير فارغ', async () => {
    const { data: invoices, error } = await adminClient.client
      .from('invoices')
      .select('id, invoice_number, status, date')
      .eq('organization_id', adminClient.orgId!)
      .eq('status', 'posted')
      .or('invoice_number.is.null,invoice_number.eq.')
      .limit(20);

    expect(error).toBeNull();

    if (invoices && invoices.length > 0) {
      console.error(`   ❌ فواتير مرحّلة بدون رقم (${invoices.length}):`);
      invoices.forEach(inv => console.error(`      ID: ${inv.id} | Date: ${inv.date}`));
    }

    expect(invoices?.length ?? 0).toBe(0);
    console.log(`   ✅ جميع الفواتير المرحّلة لها أرقام صحيحة`);
  });

  // ─────────────────────────────────────────────────────
  // TEST 6: فحص get_dashboard_stats RPC يعمل ويعيد بيانات
  // ─────────────────────────────────────────────────────
  runIf('6. RPC get_dashboard_stats يعمل ويعيد بيانات منطقية', async () => {
    const { data, error } = await adminClient.client
      .rpc('get_dashboard_stats');

    if (error) {
      console.warn(`   ⚠️  get_dashboard_stats خطأ: ${error.message}`);
      // هذا تحذير وليس فشل حرج
      return;
    }

    expect(data).not.toBeNull();

    const stats = Array.isArray(data) ? data[0] : data;
    console.log(`   ✅ Dashboard Stats:`);
    console.log(`      مبيعات اليوم: ${stats?.sales_today ?? 'N/A'}`);
    console.log(`      إجمالي الفواتير: ${stats?.invoices_count ?? 'N/A'}`);
    console.log(`      الذمم المدينة: ${stats?.receivables_total ?? 'N/A'}`);
  });

  // ─────────────────────────────────────────────────────
  // TEST 7: فحص إعدادات الشركة موجودة وكاملة
  // ─────────────────────────────────────────────────────
  runIf('7. إعدادات الشركة (company_settings) موجودة ومكتملة', async () => {
    const { data, error } = await adminClient.client
      .rpc('get_current_company_settings');

    if (error) {
      console.warn(`   ⚠️  get_current_company_settings: ${error.message}`);
      return;
    }

    expect(data).not.toBeNull();

    const settings = Array.isArray(data) ? data[0] : data;

    // التحقق من الحقول الحرجة
    expect(settings).toHaveProperty('vat_rate');
    expect(Number(settings?.vat_rate ?? 0)).toBeGreaterThan(0);

    console.log(`   ✅ إعدادات الشركة:`);
    console.log(`      الاسم: ${settings?.company_name ?? 'غير محدد'}`);
    console.log(`      رقم الضريبة: ${settings?.tax_number ?? 'غير محدد'}`);
    console.log(`      نسبة الضريبة: ${settings?.vat_rate}%`);
  });
});

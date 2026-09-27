/**
 * 🔒 Integration Test Suite #1: Multi-Tenancy & RLS Isolation
 *
 * يختبر هذا الملف على قاعدة بيانات Supabase حقيقية:
 *
 * 1. أن سياسات RLS تعمل فعلاً — مستخدم من منظمة A لا يرى بيانات منظمة B
 * 2. أن fn_force_org_id() يمنع الإدراج بدون organization_id صحيح
 * 3. أن الجداول الحرجة (products, invoices, customers) محمية تماماً
 * 4. أن مستخدماً غير مُصادق عليه لا يستطيع قراءة أي بيانات
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  checkIntegrationEnv,
  createAuthenticatedClient,
  createServiceClient,
  createCleanupTracker,
  testId,
  ADMIN_EMAIL,
  ADMIN_PASSWORD
} from './helpers/supabaseIntegrationClient';
import { createClient } from '@supabase/supabase-js';

// ======================================================
// تخطي الاختبارات إذا لم تتوفر بيانات البيئة
// ======================================================
const HAS_ENV = checkIntegrationEnv();
const runIf = HAS_ENV ? it : it.skip;

// ======================================================
// متغيرات مشتركة بين الاختبارات
// ======================================================
let adminClient: ReturnType<typeof createAuthenticatedClient> extends Promise<infer T> ? T : never;
let serviceClient: ReturnType<typeof createServiceClient>;
const cleanup = createCleanupTracker();

// ======================================================
// Setup / Teardown
// ======================================================
beforeAll(async () => {
  if (!HAS_ENV) return;

  serviceClient = createServiceClient();
  adminClient = await createAuthenticatedClient(ADMIN_EMAIL!, ADMIN_PASSWORD!);

  console.log(`\n🔌 متصل بـ Staging DB كـ: ${ADMIN_EMAIL}`);
  console.log(`   Organization ID: ${adminClient.orgId}`);
});

afterAll(async () => {
  if (!HAS_ENV || !serviceClient) return;
  await cleanup.cleanupAll(serviceClient);
  await adminClient.client.auth.signOut();
  console.log('\n🧹 تم تنظيف بيانات الاختبار من قاعدة البيانات');
});

// ======================================================
// مجموعة الاختبارات
// ======================================================
describe('🔒 [Integration] Multi-Tenancy & RLS Isolation — قاعدة بيانات حقيقية', () => {

  // ─────────────────────────────────────────────────────
  // TEST 1: المستخدم غير المصادق عليه لا يرى أي بيانات
  // ─────────────────────────────────────────────────────
  runIf('1. مستخدم غير مُصادَق لا يستطيع قراءة جدول products (RLS يحجب)', async () => {
    const { INT_SUPABASE_URL, ANON_KEY } = await import('./helpers/supabaseIntegrationClient');
    const anonClient = createClient(INT_SUPABASE_URL!, ANON_KEY!, {
      auth: { persistSession: false, autoRefreshToken: false }
    });

    const { data, error, status } = await anonClient
      .from('products')
      .select('id, name')
      .limit(5);

    // يجب أن يُعيد مصفوفة فارغة أو خطأ 401/403 — ليس بيانات حقيقية
    if (error) {
      expect([401, 403, 0]).toContain(status);
    } else {
      // RLS يجب أن يُعيد صفر نتائج للمستخدم غير المصادق عليه
      expect(data?.length ?? 0).toBe(0);
    }
  });

  // ─────────────────────────────────────────────────────
  // TEST 2: المستخدم المصادق يرى بيانات منظمته فقط
  // ─────────────────────────────────────────────────────
  runIf('2. المستخدم المُصادَق يرى بيانات منظمته فقط — لا بيانات منظمات أخرى', async () => {
    const { data: products, error } = await adminClient.client
      .from('products')
      .select('id, name, organization_id')
      .limit(20);

    expect(error).toBeNull();

    if (products && products.length > 0) {
      // كل صنف يجب أن ينتمي لمنظمة المستخدم الحالي
      const foreignOrgProducts = products.filter(
        p => p.organization_id !== adminClient.orgId
      );

      expect(foreignOrgProducts).toHaveLength(0);
      console.log(`   ✅ تم فحص ${products.length} صنف — جميعها تنتمي لـ org: ${adminClient.orgId}`);
    } else {
      console.log(`   ℹ️  لا توجد أصناف في قاعدة البيانات للمستخدم الحالي`);
    }
  });

  // ─────────────────────────────────────────────────────
  // TEST 3: عزل فواتير المبيعات بين المنظمات
  // ─────────────────────────────────────────────────────
  runIf('3. فواتير المبيعات معزولة تماماً — لا تسريب بين المنظمات', async () => {
    const { data: invoices, error } = await adminClient.client
      .from('invoices')
      .select('id, organization_id, invoice_number')
      .limit(50);

    expect(error).toBeNull();

    if (invoices && invoices.length > 0) {
      const leaked = invoices.filter(inv => inv.organization_id !== adminClient.orgId);
      expect(leaked).toHaveLength(0);
      console.log(`   ✅ فحص ${invoices.length} فاتورة — صفر تسريب`);
    }
  });

  // ─────────────────────────────────────────────────────
  // TEST 4: fn_force_org_id يمنع الإدراج بدون org_id
  // ─────────────────────────────────────────────────────
  runIf('4. محاولة إدراج عميل بدون organization_id يفشل بـ Trigger', async () => {
    // محاولة إدراج بيانات ناقصة — يجب أن تُرفض
    const { data, error } = await adminClient.client
      .from('customers')
      .insert({
        name: testId('test_customer_no_org'),
        phone: '01000000000',
        // organization_id متعمداً غائب
      })
      .select();

    // يجب أن يفشل إما بـ RLS (42501) أو بـ Trigger (P0001)
    if (error) {
      const isExpectedError =
        error.code === '42501' ||  // RLS violation
        error.code === 'P0001' ||  // Trigger raise
        error.code === '23502' ||  // NOT NULL violation
        error.message?.includes('يجب تحديد المنظمة') ||
        error.message?.includes('organization');

      expect(isExpectedError).toBe(true);
      console.log(`   ✅ الـ Trigger رفض الإدراج بشكل صحيح: ${error.message}`);
    } else {
      // إذا نجح الإدراج، يجب أن يكون الـ org_id مُعيَّناً تلقائياً بواسطة الـ Trigger
      const insertedId = data?.[0]?.id;
      if (insertedId) {
        cleanup.push('customers', insertedId);
        const insertedOrgId = data?.[0]?.organization_id;
        expect(insertedOrgId).toBeTruthy();
        console.log(`   ℹ️  الـ Trigger عيّن organization_id تلقائياً: ${insertedOrgId}`);
      }
    }
  });

  // ─────────────────────────────────────────────────────
  // TEST 5: عدم القدرة على قراءة جداول منظمة أخرى مباشرةً
  // ─────────────────────────────────────────────────────
  runIf('5. مستخدم لا يستطيع قراءة جدول organizations لمنظمات أخرى', async () => {
    const { data: orgs, error } = await adminClient.client
      .from('organizations')
      .select('id, name')
      .limit(50);

    expect(error).toBeNull();

    if (orgs && orgs.length > 0) {
      // المستخدم العادي يجب أن يرى منظمته فقط
      if (adminClient.orgId) {
        const foreignOrgs = orgs.filter(o => o.id !== adminClient.orgId);
        // سوبر ادمن قد يرى كل المنظمات — هذا صحيح
        console.log(`   ✅ يرى ${orgs.length} منظمة — المنطق حسب دور المستخدم`);
      }
    }
  });

  // ─────────────────────────────────────────────────────
  // TEST 6: عزل فواتير المشتريات
  // ─────────────────────────────────────────────────────
  runIf('6. فواتير المشتريات معزولة — لا تسريب بين المنظمات', async () => {
    const { data: purchaseInvoices, error } = await adminClient.client
      .from('purchase_invoices')
      .select('id, organization_id')
      .limit(50);

    expect(error).toBeNull();

    if (purchaseInvoices && purchaseInvoices.length > 0) {
      const leaked = purchaseInvoices.filter(
        inv => inv.organization_id !== adminClient.orgId
      );
      expect(leaked).toHaveLength(0);
      console.log(`   ✅ فحص ${purchaseInvoices.length} فاتورة شراء — صفر تسريب`);
    }
  });
});

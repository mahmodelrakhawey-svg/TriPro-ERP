/**
 * ⚙️ Integration Test Client Setup
 *
 * ينشئ هذا الملف عميل Supabase مخصص لاختبارات الـ Integration
 * يعمل على قاعدة بيانات Staging حقيقية — ليس محاكاة.
 *
 * قراءة الـ credentials من ملف .env.integration
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';

// ======================================================
// قراءة متغيرات البيئة
// ======================================================
const SUPABASE_URL = process.env.INT_SUPABASE_URL;
const ANON_KEY = process.env.INT_SUPABASE_ANON_KEY;
const SERVICE_KEY = process.env.INT_SUPABASE_SERVICE_KEY;
const ADMIN_EMAIL = process.env.INT_TEST_ADMIN_EMAIL;
const ADMIN_PASSWORD = process.env.INT_TEST_ADMIN_PASSWORD;

// ======================================================
// تحقق من وجود متغيرات البيئة المطلوبة
// ======================================================
export function checkIntegrationEnv(): boolean {
  const missing: string[] = [];
  if (!SUPABASE_URL) missing.push('INT_SUPABASE_URL');
  if (!ANON_KEY) missing.push('INT_SUPABASE_ANON_KEY');
  if (!SERVICE_KEY) missing.push('INT_SUPABASE_SERVICE_KEY');
  if (!ADMIN_EMAIL) missing.push('INT_TEST_ADMIN_EMAIL');
  if (!ADMIN_PASSWORD) missing.push('INT_TEST_ADMIN_PASSWORD');

  if (missing.length > 0) {
    console.warn(
      `\n⚠️  اختبارات Integration تتطلب ملف .env.integration\n` +
      `   المتغيرات المفقودة: ${missing.join(', ')}\n` +
      `   راجع tests/integration/README.md للتفاصيل\n`
    );
    return false;
  }
  return true;
}

// ======================================================
// عميل Anon (مثل المتصفح العادي — يخضع لـ RLS)
// ======================================================
export function createAnonClient(): SupabaseClient {
  if (!SUPABASE_URL || !ANON_KEY) throw new Error('Missing INT_SUPABASE_URL or INT_SUPABASE_ANON_KEY');
  return createClient(SUPABASE_URL, ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
}

// ======================================================
// عميل Service Role (يتجاوز RLS — للتحقق والتنظيف فقط)
// ======================================================
export function createServiceClient(): SupabaseClient {
  if (!SUPABASE_URL || !SERVICE_KEY) throw new Error('Missing INT_SUPABASE_URL or INT_SUPABASE_SERVICE_KEY');
  return createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
}

// ======================================================
// تسجيل دخول مستخدم اختبار وإرجاع عميل مُصادق عليه
// ======================================================
export async function createAuthenticatedClient(
  email: string = ADMIN_EMAIL!,
  password: string = ADMIN_PASSWORD!
): Promise<{ client: SupabaseClient; userId: string; orgId: string | null }> {
  const client = createAnonClient();
  const { data, error } = await client.auth.signInWithPassword({ email, password });

  if (error || !data.session) {
    throw new Error(`فشل تسجيل الدخول في اختبار Integration: ${error?.message}`);
  }

  const userId = data.user.id;
  const orgId = data.user.user_metadata?.org_id ?? null;

  return { client, userId, orgId };
}

// ======================================================
// منطقة بيانات اختبارية للتنظيف التلقائي
// ======================================================
export interface TestCleanupTracker {
  tables: { table: string; ids: string[] }[];
  push(table: string, id: string): void;
  cleanupAll(serviceClient: SupabaseClient): Promise<void>;
}

export function createCleanupTracker(): TestCleanupTracker {
  const tracker: TestCleanupTracker = {
    tables: [],
    push(table: string, id: string) {
      const existing = this.tables.find(t => t.table === table);
      if (existing) {
        existing.ids.push(id);
      } else {
        this.tables.push({ table, ids: [id] });
      }
    },
    async cleanupAll(serviceClient: SupabaseClient) {
      // الحذف بالترتيب العكسي (Foreign Key safety)
      for (const entry of [...this.tables].reverse()) {
        if (entry.ids.length > 0) {
          await serviceClient.from(entry.table).delete().in('id', entry.ids);
        }
      }
      this.tables = [];
    }
  };
  return tracker;
}

// ======================================================
// مساعد: توليد اسم اختبار فريد لتجنب التعارض
// ======================================================
export function testId(prefix: string): string {
  return `${prefix}_test_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

export { SUPABASE_URL, ANON_KEY, SERVICE_KEY, ADMIN_EMAIL, ADMIN_PASSWORD };

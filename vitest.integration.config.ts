/**
 * ⚙️ Vitest Configuration — Integration Tests Only
 *
 * هذا الملف مخصص لاختبارات الـ Integration التي تتصل بقاعدة بيانات حقيقية.
 * يختلف عن vitest.config.ts (Unit Tests) في:
 * - environment: node بدلاً من jsdom (لا نحتاج DOM)
 * - timeout أطول (شبكة + قاعدة بيانات)
 * - تحميل متغيرات .env.integration تلقائياً
 * - تشغيل متسلسل (sequential) لأمان المعاملات
 */

import { defineConfig } from 'vitest/config';
import path from 'path';
import { loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
  // تحميل متغيرات البيئة من .env.integration
  const env = loadEnv(mode, process.cwd(), ['INT_', 'VITE_']);

  return {
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      }
    },
    test: {
      globals: true,

      // ✅ بيئة Node.js — لا نحتاج DOM لاختبارات قاعدة البيانات
      environment: 'node',

      // ✅ ملفات الاختبار — integration فقط
      include: ['tests/integration/**/*.integration.test.ts'],

      // ✅ timeout أطول لاستيعاب وقت الشبكة وقاعدة البيانات
      testTimeout: 30_000,
      hookTimeout: 20_000,

      // ✅ تشغيل متسلسل لضمان ترتيب العمليات (Create → Verify → Cleanup)
      sequence: {
        concurrent: false,
      },

      // ✅ حقن متغيرات البيئة
      env: {
        ...env,
        INT_SUPABASE_URL: env.INT_SUPABASE_URL ?? '',
        INT_SUPABASE_ANON_KEY: env.INT_SUPABASE_ANON_KEY ?? '',
        INT_SUPABASE_SERVICE_KEY: env.INT_SUPABASE_SERVICE_KEY ?? '',
        INT_TEST_ADMIN_EMAIL: env.INT_TEST_ADMIN_EMAIL ?? '',
        INT_TEST_ADMIN_PASSWORD: env.INT_TEST_ADMIN_PASSWORD ?? '',
      },

      // ✅ تقرير مفصل
      reporter: 'verbose',
    },
  };
});

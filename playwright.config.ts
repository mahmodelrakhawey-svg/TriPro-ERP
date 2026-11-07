import { defineConfig, devices } from '@playwright/test';
import fs from 'fs';
import path from 'path';

// ==============================================================================
// 🚨 صمام الأمان لمنع تشغيل اختبارات المتصفح على قاعدة لينزا الحية
// Lenza Production Database Circuit Breaker
// ==============================================================================
const LENZA_PROD_PROJECT_ID = 'jsgmrspnthtlsracbmcq';

// إذا كان متحول البيئة يشير صراحةً لبيانات لينزا الحية، نوقف الاختبار فوراً
if (process.env.VITE_SUPABASE_URL && process.env.VITE_SUPABASE_URL.includes(LENZA_PROD_PROJECT_ID)) {
  console.error('\n🛑 [CIRCUIT BREAKER] صمام أمان لينزا: تم إيقاف الاختبارات فوراً!');
  console.error('⛔ خطأ حرج: تم اكتشاف محاولة تشغيل اختبارات E2E ضد قاعدة بيانات لينزا التشغيلية!');
  console.error('🛡️ تم إحباط العملية لحماية بيانات وفواتير شركة لينزا.\n');
  throw new Error('SAFETY_LOCK: E2E tests are strictly forbidden from targeting Lenza production database!');
}

/**
 * See https://playwright.dev/docs/test-configuration.
 */
export default defineConfig({
  testDir: './e2e',
  /* Run tests sequentially to avoid local port and state collisions */
  fullyParallel: false,
  /* Fail the build on CI if you accidentally left test.only in the source code. */
  forbidOnly: !!process.env.CI,
  /* Retry on failure in CI */
  retries: 0,
  /* Single worker for deterministic ERP state tests */
  workers: 1,
  /* Reporter to use */
  reporter: [
    ['list'],
    ['html', { outputFolder: 'playwright-report', open: 'never' }]
  ],
  use: {
    /* Base URL to use in actions like `await page.goto('/')`. */
    baseURL: 'http://127.0.0.1:4173',

    /* Collect trace when retrying the failed test. */
    trace: 'on-first-retry',

    /* Capture screenshot automatically on failure */
    screenshot: 'only-on-failure',

    /* Increase action timeout for complex ERP rendering */
    actionTimeout: 10000,
  },

  /* Configure projects for major browsers */
  projects: [
    {
      name: 'chromium',
      use: { 
        ...devices['Desktop Chrome'],
        viewport: { width: 1366, height: 768 }
      },
    },
  ],

  /* Run server in test mode (--mode test) to force loading .env.test and isolate from production */
  webServer: {
    command: 'npx vite --port 4173 --host 127.0.0.1 --mode test',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: true,
    timeout: 60000,
  },
});

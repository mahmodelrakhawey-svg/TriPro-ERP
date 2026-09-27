import { test, expect, Page } from '@playwright/test';
import { loginToErp, navigateToHash, trackErpErrors } from './helpers/mockErpEnvironment';

/**
 * 🏢 E2E: سيناريو الشركة المتعددة وتكامل الشركات (Multi-Tenancy Flow)
 *
 * يختبر:
 * 1. استعراض شاشة إدارة الشركات أو النظام بدون أخطاء 400
 * 2. التحقق من سلامة فتح شاشات نقاط البيع والكاشير
 * 3. حفظ واستعراض إعدادات الشركة بدون أخطاء API
 */

const SUPER_ADMIN_EMAIL = process.env.E2E_SUPER_ADMIN_EMAIL ?? '';
const SUPER_ADMIN_PASSWORD = process.env.E2E_SUPER_ADMIN_PASSWORD ?? '';

async function loginAs(page: Page, email: string, password: string) {
  await page.goto('/');

  const loginBtn = page.getByRole('button', { name: /تسجيل دخول الموظفين|دخول المشتركين/i }).first();
  if (await loginBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
    await loginBtn.click();
  }

  await page.locator('input[type="text"], input[type="email"]').first().fill(email);
  await page.locator('input[type="password"]').first().fill(password);
  await page.locator('button[type="submit"]').click();

  await expect(
    page.locator('#root').getByRole('navigation').or(page.locator('.ant-layout-sider')).or(page.locator('[data-testid="sidebar"]'))
  ).toBeVisible({ timeout: 20000 });
}

test.describe('TriPro ERP - سيناريو إدارة الشركات والـ Multi-Tenancy', () => {

  test('يجب أن تفتح شاشة الكاشير بدون أخطاء 400', async ({ page }) => {
    const { apiErrors } = trackErpErrors(page);

    if (SUPER_ADMIN_EMAIL && SUPER_ADMIN_PASSWORD) {
      await loginAs(page, SUPER_ADMIN_EMAIL, SUPER_ADMIN_PASSWORD);
    } else {
      await loginToErp(page);
    }

    // التنقل لشاشة الكاشير أو التحقق من القائمة
    await navigateToHash(page, '/retail-pos');
    await page.waitForTimeout(2000);

    // التحقق من عدم ظهور أي خطأ 400 عند فتح شاشة الكاشير
    const posErrors = apiErrors.filter(e =>
      e.url.includes('start_pos_shift') || e.url.includes('shifts')
    );
    expect(
      posErrors,
      `خطأ في start_pos_shift: ${JSON.stringify(posErrors, null, 2)}`
    ).toHaveLength(0);
  });

  test('يجب أن تُستعرض إعدادات الشركة بدون خطأ 400', async ({ page }) => {
    const { apiErrors } = trackErpErrors(page);

    if (SUPER_ADMIN_EMAIL && SUPER_ADMIN_PASSWORD) {
      await loginAs(page, SUPER_ADMIN_EMAIL, SUPER_ADMIN_PASSWORD);
    } else {
      await loginToErp(page);
    }

    // التنقل لشاشة الإعدادات العامة
    await navigateToHash(page, '/settings');
    await page.waitForTimeout(2000);

    // التحقق من خلو طلبات الإعدادات من أي خطأ
    const settingsErrors = apiErrors.filter(e =>
      e.url.includes('company_settings') || e.url.includes('settings')
    );
    expect(
      settingsErrors,
      `خطأ في إعدادات الشركة: ${JSON.stringify(settingsErrors, null, 2)}`
    ).toHaveLength(0);
  });
});

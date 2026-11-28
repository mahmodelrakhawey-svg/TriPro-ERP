import { test, expect } from '@playwright/test';
import { loginToErp, navigateToHash, trackErpErrors } from './helpers/mockErpEnvironment';

test.describe('TriPro ERP - تسجيل الدخول والصلاحيات (Login & Permissions)', () => {
  test('يتحقق من استقرار شاشة الدخول وتوجيه المستخدم المصرح له للوحة التحكم', async ({ page }) => {
    const { apiErrors, consoleErrors, pageErrors } = trackErpErrors(page);

    await loginToErp(page);
    await navigateToHash(page, '/');
    await page.waitForTimeout(1000);

    await expect(page.locator('main, button:has-text("ملف (File)")').first()).toBeVisible({ timeout: 12000 });

    expect(apiErrors).toEqual([]);
    expect(consoleErrors).toEqual([]);
    expect(pageErrors).toEqual([]);
  });
});

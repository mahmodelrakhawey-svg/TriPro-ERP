import { test, expect } from '@playwright/test';
import { loginToErp, navigateToHash, trackErpErrors } from './helpers/mockErpEnvironment';

test.describe('TriPro ERP - دورة سند الصرف (Payment Voucher Flow)', () => {
  test('يفتح شاشة سند الصرف وقائمة سندات الصرف بدون أخطاء API أو كونسول', async ({ page }) => {
    const { apiErrors, consoleErrors, pageErrors } = trackErpErrors(page);

    await loginToErp(page);
    await navigateToHash(page, '/payment-voucher');
    await page.waitForTimeout(1200);

    await expect(page.locator('main, form').first()).toBeVisible({ timeout: 12000 });
    await expect(page.locator('main').getByText(/سند صرف/i).first()).toBeVisible({ timeout: 10000 });

    await navigateToHash(page, '/payment-vouchers-list');
    await page.waitForTimeout(1000);
    await expect(page.locator('main').first()).toBeVisible({ timeout: 10000 });

    expect(apiErrors).toEqual([]);
    expect(consoleErrors).toEqual([]);
    expect(pageErrors).toEqual([]);
  });
});

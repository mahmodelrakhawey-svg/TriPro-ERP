import { test, expect } from '@playwright/test';
import { loginToErp, navigateToHash, trackErpErrors } from './helpers/mockErpEnvironment';

test.describe('TriPro ERP - دورة التحويلات المخزنية (Inventory Transfer Flow)', () => {
  test('يفتح شاشة التحويل المخزني وسجل التحويلات ويتحقق من محددات المخازن', async ({ page }) => {
    const { apiErrors, consoleErrors, pageErrors } = trackErpErrors(page);

    await loginToErp(page);

    await navigateToHash(page, '/stock-transfer');
    await page.waitForTimeout(1200);
    await expect(page.locator('main, form').first()).toBeVisible({ timeout: 12000 });
    expect(await page.locator('select').count()).toBeGreaterThanOrEqual(2);

    await navigateToHash(page, '/stock-transfer-list');
    await page.waitForTimeout(1000);
    await expect(page.locator('main').first()).toBeVisible({ timeout: 12000 });

    expect(apiErrors).toEqual([]);
    expect(consoleErrors).toEqual([]);
    expect(pageErrors).toEqual([]);
  });
});

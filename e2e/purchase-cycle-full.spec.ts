import { test, expect } from '@playwright/test';
import { loginToErp, navigateToHash, trackErpErrors } from './helpers/mockErpEnvironment';

test.describe('TriPro ERP - دورة المشتريات الكاملة (Purchase Cycle)', () => {
  test('يتنقل بين أمر الشراء وفاتورة المشتريات وسجل الفواتير بدون أخطاء', async ({ page }) => {
    const { apiErrors, consoleErrors, pageErrors } = trackErpErrors(page);

    await loginToErp(page);

    await navigateToHash(page, '/purchase-order-new');
    await page.waitForTimeout(1000);
    await expect(page.locator('main').first()).toBeVisible({ timeout: 12000 });

    await navigateToHash(page, '/purchase-invoice');
    await page.waitForTimeout(1000);
    await expect(page.locator('main').first()).toBeVisible({ timeout: 12000 });

    await navigateToHash(page, '/purchase-invoices-list');
    await page.waitForTimeout(1000);
    await expect(page.locator('main').first()).toBeVisible({ timeout: 12000 });

    expect(apiErrors).toEqual([]);
    expect(consoleErrors).toEqual([]);
    expect(pageErrors).toEqual([]);
  });
});

import { test, expect } from '@playwright/test';
import { loginToErp, navigateToHash, trackErpErrors } from './helpers/mockErpEnvironment';

test.describe('TriPro ERP - مسير الرواتب وتقارير الأجور (Payroll Run)', () => {
  test('يفتح شاشة تشغيل مسير الرواتب وتقرير الرواتب دون أخطاء', async ({ page }) => {
    const { apiErrors, consoleErrors, pageErrors } = trackErpErrors(page);

    await loginToErp(page);

    await navigateToHash(page, '/payroll-run');
    await page.waitForTimeout(1200);
    await expect(page.locator('main').first()).toBeVisible({ timeout: 12000 });

    await navigateToHash(page, '/payroll-report');
    await page.waitForTimeout(1000);
    await expect(page.locator('main').first()).toBeVisible({ timeout: 12000 });

    expect(apiErrors).toEqual([]);
    expect(consoleErrors).toEqual([]);
    expect(pageErrors).toEqual([]);
  });
});

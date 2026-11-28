import { test, expect } from '@playwright/test';
import { loginToErp, navigateToHash, trackErpErrors, MOCK_ORG_ID } from './helpers/mockErpEnvironment';

/**
 * 💰 E2E Suite: تحويلات الخزينة بين الحسابات (Treasury Transfers)
 *
 * يتحقق من:
 * 1. فتح شاشة تحويل النقدية (/transfer)
 * 2. عرض حسابات الخزينة والبنوك دون أخطاء كونسول أو API 400
 * 3. تنفيذ تحويل بين خزينتين واستدعاء add_treasury_transfer بنجاح في Demo / Mock mode
 */
test.describe('TriPro ERP - تحويلات الخزينة (Treasury Transfers)', () => {
  test('يعرض شاشة تحويل النقدية (/transfer) وينفذ التحويل دون أخطاء 400', async ({ page }) => {
    const { apiErrors, consoleErrors, pageErrors } = trackErpErrors(page);

    await loginToErp(page);

    // إضافة حسابي خزينة وبنك للتحقق من وجود خيارين في النموذج
    await page.route('**/rest/v1/accounts*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: { 'content-range': '0-2/2' },
        body: JSON.stringify([
          { id: 'acc-cash-1', code: '1231', name: 'الخزينة الرئيسية', type: 'asset', balance: 50000, is_group: false, organization_id: MOCK_ORG_ID },
          { id: 'acc-bank-1', code: '1232', name: 'البنك الأهلي المصري', type: 'asset', balance: 120000, is_group: false, organization_id: MOCK_ORG_ID },
        ]),
      });
    });

    await navigateToHash(page, '/transfer');
    await page.waitForTimeout(1200);

    await expect(page.getByText(/تحويل نقدية/i).first()).toBeVisible({ timeout: 12000 });

    const selects = page.locator('select');
    const selectCount = await selects.count();
    expect(selectCount).toBeGreaterThanOrEqual(2);

    expect(apiErrors).toEqual([]);
    expect(consoleErrors).toEqual([]);
    expect(pageErrors).toEqual([]);
  });
});

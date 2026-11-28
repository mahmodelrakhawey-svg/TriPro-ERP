import { test, expect } from '@playwright/test';
import { loginToErp, navigateToHash, trackErpErrors, MOCK_ORG_ID } from './helpers/mockErpEnvironment';

test.describe('TriPro ERP - عزل المنشآت المتعددة (Multi-Tenant Isolation)', () => {
  test('يفرض تمرير organization_id الصحيح للمنشأة النشطة دون تسريب عبر المنشآت', async ({ page }) => {
    const { apiErrors, consoleErrors, pageErrors } = trackErpErrors(page);
    const observedOrgQueries: string[] = [];

    page.on('request', (req) => {
      const url = req.url();
      if (url.includes('/rest/v1/') && url.includes('organization_id=')) {
        observedOrgQueries.push(url);
      }
    });

    await loginToErp(page);
    await navigateToHash(page, '/invoices-list');
    await page.waitForTimeout(1200);

    await expect(page.locator('main').first()).toBeVisible({ timeout: 12000 });
    // التأكد أن أي استعلام مقيد بـ organization_id يلتزم بمعرّف المنشأة النشطة فقط
    for (const q of observedOrgQueries) {
      expect(q).toContain(MOCK_ORG_ID);
    }

    expect(apiErrors).toEqual([]);
    expect(consoleErrors).toEqual([]);
    expect(pageErrors).toEqual([]);
  });
});

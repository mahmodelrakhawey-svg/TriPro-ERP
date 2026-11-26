import { test, expect } from '@playwright/test';
import { loginToErp, navigateToHash, trackErpErrors } from './helpers/mockErpEnvironment';

/**
 * 🧪 E2E Submodules Smoke Suite: فحص استقرار جميع المديولات الفرعية
 * يتحقق من تحميل كل شاشة فرعية بدون شاشة بيضاء أو أخطاء API (4xx/5xx) أو استثناءات JS قاتلة.
 */
const SUBMODULE_ROUTES = [
  { name: 'المخازن - إدارة الأصناف', path: '/products' },
  { name: 'المخازن - التحويلات المخزنية', path: '/stock-transfer' },
  { name: 'المخازن - أذون الاستلام', path: '/goods-receipt' },
  { name: 'المخازن - رادار الصلاحية', path: '/expiry-radar' },
  { name: 'المخازن - تقرير حركة الصنف', path: '/item-movement-report' },
  { name: 'التصنيع - أوامر التشغيل', path: '/work-orders' },
  { name: 'البنوك - الشيكات', path: '/cheques' },
  { name: 'البنوك - الاعتمادات المستندية', path: '/letters-of-credit' },
  { name: 'البنوك - خطابات الضمان', path: '/letters-of-guarantee' },
  { name: 'الموارد البشرية - مسير الرواتب', path: '/payroll' },
  { name: 'المقاولات - المشاريع والمستخلصات', path: '/construction' },
  { name: 'المستشفيات - الاستقبال والتنويم', path: '/hims' },
  { name: 'الإدارة - الصلاحيات والأدوار', path: '/permissions' },
];

test.describe('TriPro ERP - فحص شامل لاستقرار المديولات الفرعية (Submodules Smoke)', () => {
  test('تحميل كافة شاشات المديولات الفرعية بدون أخطاء حرجة أو شاشة بيضاء', async ({ page }) => {
    const { apiErrors, consoleErrors } = trackErpErrors(page);

    await loginToErp(page);

    for (const mod of SUBMODULE_ROUTES) {
      await navigateToHash(page, mod.path);
      await page.waitForTimeout(400);

      const root = page.locator('#root');
      await expect(root, `Root should be visible on ${mod.name} (${mod.path})`).toBeVisible();

      const fallbackError = page.getByText('تعذر تحميل واجهة البرنامج');
      await expect(fallbackError, `Error fallback triggered on ${mod.name}`).not.toBeVisible();
    }

    expect(apiErrors, `API 4xx/5xx errors detected: ${apiErrors.join(' | ')}`).toHaveLength(0);
    expect(consoleErrors, `Critical console errors detected: ${consoleErrors.join(' | ')}`).toHaveLength(0);
  });
});

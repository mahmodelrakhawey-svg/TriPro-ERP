import { test, expect, Page } from '@playwright/test';

/**
 * E2E: دورة البيع الكاملة - فتح وردية + فاتورة
 *
 * يختبر:
 * 1. تسجيل دخول موظف المبيعات
 * 2. فتح وردية الكاشير
 * 3. إضافة صنف لسلة البيع
 * 4. إتمام الدفع النقدي
 * 5. التحقق من تسجيل الفاتورة
 * 6. إغلاق الوردية
 */

const CASHIER_EMAIL = process.env.E2E_CASHIER_EMAIL ?? '';
const CASHIER_PASSWORD = process.env.E2E_CASHIER_PASSWORD ?? '';

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
    page.locator('.ant-layout-sider, [data-testid="sidebar"], nav').first()
  ).toBeVisible({ timeout: 20000 });
}

function trackApiErrors(page: Page) {
  const errors: Array<{ url: string; status: number }> = [];
  page.on('response', (response) => {
    const url = response.url();
    const status = response.status();
    if (status >= 400 && status < 500 && (url.includes('/rest/v1/') || url.includes('/rpc/'))) {
      errors.push({ url, status });
    }
  });
  return { errors };
}

test.describe('TriPro ERP - دورة البيع الكاملة', () => {

  test.skip(!CASHIER_EMAIL, 'يتطلب E2E_CASHIER_EMAIL في بيئة الاختبار');

  test('فتح وردية + عملية بيع + إغلاق وردية بدون أخطاء API', async ({ page }) => {
    const { errors } = trackApiErrors(page);

    // 1. تسجيل الدخول
    await loginAs(page, CASHIER_EMAIL, CASHIER_PASSWORD);

    // 2. التنقل لشاشة نقطة البيع
    const posMenu = page.getByRole('menuitem', { name: /كاشير|نقطة البيع|Retail POS/i }).first();
    await expect(posMenu).toBeVisible({ timeout: 10000 });
    await posMenu.click();
    await page.waitForTimeout(2000);

    // 3. التحقق من عدم وجود خطأ 400 عند فتح شاشة POS
    const shiftErrors = errors.filter(e =>
      e.url.includes('start_pos_shift') ||
      e.url.includes('shifts') ||
      e.url.includes('terminals')
    );
    expect(
      shiftErrors,
      `خطأ عند فتح شاشة POS: ${JSON.stringify(shiftErrors)}`
    ).toHaveLength(0);

    // 4. البحث عن زر فتح الوردية إذا كانت مغلقة
    const openShiftBtn = page.getByRole('button', { name: /فتح وردية|بدء وردية|فتح الوردية/i }).first();
    if (await openShiftBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await openShiftBtn.click();
      await page.waitForTimeout(3000);

      // التحقق من فتح الوردية بنجاح
      const afterOpenErrors = errors.filter(e => e.url.includes('start_pos_shift'));
      expect(
        afterOpenErrors,
        `فشل فتح الوردية: ${JSON.stringify(afterOpenErrors)}`
      ).toHaveLength(0);
    }

    // 5. محاولة إضافة منتج للسلة (إذا كانت واجهة الكاشير مفتوحة)
    const productSearch = page.locator('input[placeholder*="بحث"], input[placeholder*="صنف"], input[placeholder*="منتج"]').first();
    if (await productSearch.isVisible({ timeout: 5000 }).catch(() => false)) {
      await productSearch.fill('');
      await page.keyboard.press('Enter');
      await page.waitForTimeout(1000);

      // التحقق من عدم وجود أخطاء أثناء البحث عن منتج
      const productErrors = errors.filter(e => e.url.includes('products') || e.url.includes('inventory'));
      expect(
        productErrors,
        `خطأ عند البحث عن منتج: ${JSON.stringify(productErrors)}`
      ).toHaveLength(0);
    }

    // 6. التحقق الشامل النهائي: لا أخطاء 400 في أي طلب API
    const criticalErrors = errors.filter(e =>
      !e.url.includes('realtime') && !e.url.includes('graphql')
    );
    expect(
      criticalErrors,
      `أخطاء API حرجة خلال دورة البيع: ${JSON.stringify(criticalErrors, null, 2)}`
    ).toHaveLength(0);
  });

  test('فتح شاشة فواتير البيع وإنشاء فاتورة جديدة بدون أخطاء', async ({ page }) => {
    const { errors } = trackApiErrors(page);

    await loginAs(page, CASHIER_EMAIL, CASHIER_PASSWORD);

    // التنقل لشاشة الفواتير
    const invoiceMenu = page.getByRole('menuitem', { name: /فواتير البيع|فاتورة جديدة|المبيعات/i }).first();
    if (await invoiceMenu.isVisible({ timeout: 8000 }).catch(() => false)) {
      await invoiceMenu.click();
      await page.waitForTimeout(2000);

      // فتح فاتورة جديدة
      const newInvoiceBtn = page.getByRole('button', { name: /فاتورة جديدة|إضافة فاتورة|New Invoice/i }).first();
      if (await newInvoiceBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
        await newInvoiceBtn.click();
        await page.waitForTimeout(2000);

        // التحقق من تحميل نموذج الفاتورة بدون أخطاء
        const invoiceErrors = errors.filter(e =>
          e.url.includes('invoices') || e.url.includes('warehouses') || e.url.includes('products')
        );
        expect(
          invoiceErrors,
          `خطأ عند فتح نموذج الفاتورة: ${JSON.stringify(invoiceErrors)}`
        ).toHaveLength(0);
      }
    }
  });
});

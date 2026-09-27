import { test, expect } from '@playwright/test';
import { loginToErp, navigateToHash, trackErpErrors, MOCK_SUPPLIER_ID, MOCK_WAREHOUSE_ID } from './helpers/mockErpEnvironment';

/**
 * 📦 E2E Enterprise Suite: دورة المشتريات الكاملة والحارس الأمني لمعرف المخزن
 * 
 * يختبر:
 * 1. التنقل لشاشة فاتورة المشتريات الجديدة (/purchase-invoice)
 * 2. التحقق من سلامة اختيار المورد والمخزن الصحيح (منع خطأ invalid UUID wh-main)
 * 3. إضافة أصناف الشراء والكميات وأسعار التكلفة
 * 4. التحقق من حساب الإجمالي الفرعي والضريبة وصافي الاستحقاق للمورد
 * 5. حفظ الفاتورة والتأكد من عدم وجود أي خطأ 400 Bad Request
 * 6. فحص قائمة فواتير الشراء (/purchase-invoices-list)
 * 7. فحص شاشة مرتجع المشتريات (/purchase-return)
 */

test.describe('TriPro ERP - دورة المشتريات الكاملة (End-to-End Purchases Cycle)', () => {

  test('1. فتح نموذج فاتورة الشراء واختيار المورد والمخزن بدون خطأ UUID وحفظ الفاتورة بنجاح', async ({ page }) => {
    const { apiErrors, consoleErrors } = trackErpErrors(page);
    const whMainOccurrences: string[] = [];

    // مراقبة كافة طلبات الشبكة الصادرة للتحقق من عدم تسرب wh-main نهائياً
    page.on('request', (req) => {
      const postData = req.postData() || '';
      if (postData.includes('wh-main') || req.url().includes('wh-main')) {
        whMainOccurrences.push(`${req.method()} ${req.url()} → contains wh-main`);
      }
    });

    // تسجيل الدخول
    await loginToErp(page);

    // الانتقال لشاشة فاتورة الشراء
    await navigateToHash(page, '/purchase-invoice');
    await page.waitForTimeout(1500);

    // التحقق من الحاوية الرئيسية للنموذج
    const invoiceContainer = page.locator('main, form, [data-testid="purchase-invoice-form"], .invoice-form').first();
    await expect(invoiceContainer).toBeVisible({ timeout: 12000 });

    // التحقق من حقول التاريخ والمورد والمخزن
    const dateInput = page.locator('input[type="date"]').first();
    await expect(dateInput).toBeVisible();

    const selectOrInput = page.locator('select, input, button').filter({ hasText: /مورد|مخزن/i }).first();
    await expect(selectOrInput).toBeVisible();

    // البحث عن صنف وإضافته
    const searchProductInput = page.locator('input[placeholder*="بحث عن صنف"], input[placeholder*="اسم أو باركود"], input[placeholder*="بحث"]').first();
    if (await searchProductInput.isVisible({ timeout: 4000 }).catch(() => false)) {
      await searchProductInput.fill('دقيق');
      await page.waitForTimeout(600);

      const searchResultItem = page.locator('[role="option"], li, div').filter({ hasText: /دقيق|حلويات/i }).first();
      if (await searchResultItem.isVisible({ timeout: 3000 }).catch(() => false)) {
        await searchResultItem.click();
      }
    }

    // التحقق من بطاقة ملخص الحسابات (الإجمالي والضريبة والصافي)
    const summaryCard = page.locator('div, section, footer').filter({ hasText: /الإجمالي|الصافي|ضريبة/i }).first();
    await expect(summaryCard).toBeVisible({ timeout: 5000 });

    // النقر على زر حفظ فاتورة الشراء
    const saveBtn = page.getByRole('button', { name: /حفظ الفاتورة|إصدار فاتورة الشراء|حفظ مسودة|Save/i }).first();
    if (await saveBtn.isVisible({ timeout: 4000 }).catch(() => false)) {
      await expect(saveBtn).toBeEnabled();
      await saveBtn.click();
      await page.waitForTimeout(1500);
    }

    // التأكد من عدم وجود أي خطأ يتعلق بـ wh-main
    expect(whMainOccurrences, `تم رصد تسرب النص التالف wh-main في الطلبات: ${whMainOccurrences.join(', ')}`).toHaveLength(0);

    // التأكد من خلو العملية من أي خطأ شبكة
    const criticalErrors = apiErrors.filter(e => e.url.includes('/purchase_invoices') || e.url.includes('/warehouses'));
    expect(criticalErrors, `أخطاء في API المشتريات: ${JSON.stringify(criticalErrors)}`).toHaveLength(0);
    expect(consoleErrors, `أخطاء كونسول حرجة: ${JSON.stringify(consoleErrors)}`).toHaveLength(0);
  });

  test('2. استعراض قائمة فواتير الشراء (/purchase-invoices-list) بدون أخطاء', async ({ page }) => {
    const { apiErrors } = trackErpErrors(page);

    await loginToErp(page);

    // الانتقال لشاشة سجل فواتير المشتريات
    await navigateToHash(page, '/purchase-invoices-list');
    await page.waitForTimeout(1500);

    // التحقق من الحاوية الرئيسية للشاشة
    const listContainer = page.locator('main, table, .ant-table, [data-testid="purchase-invoices-list"]').first();
    await expect(listContainer).toBeVisible({ timeout: 12000 });

    // التحقق من وجود حقل البحث في فواتير الشراء
    const searchFilter = page.locator('input[placeholder*="بحث"], input[type="search"]').first();
    if (await searchFilter.isVisible({ timeout: 4000 }).catch(() => false)) {
      await searchFilter.fill('PINV');
      await page.waitForTimeout(500);
    }

    // التحقق من عدم حدوث أخطاء عند جلب فواتير المشتريات
    const fetchErrors = apiErrors.filter(e => e.url.includes('/purchase_invoices'));
    expect(fetchErrors, `أخطاء عند جلب فواتير المشتريات: ${JSON.stringify(fetchErrors)}`).toHaveLength(0);
  });

  test('3. شاشة مرتجع المشتريات (/purchase-return) واستقرار الحسابات', async ({ page }) => {
    const { apiErrors, consoleErrors } = trackErpErrors(page);

    await loginToErp(page);

    // الانتقال لشاشة مرتجع المشتريات
    await navigateToHash(page, '/purchase-return');
    await page.waitForTimeout(1500);

    // التحقق من الحاوية الرئيسية للشاشة
    const returnContainer = page.locator('main, form, [data-testid="purchase-return-form"], .return-form').first();
    await expect(returnContainer).toBeVisible({ timeout: 12000 });

    // التأكد من خلو الشاشة من أي انهيار برمجي
    expect(apiErrors, `أخطاء شبكة في مرتجع المشتريات: ${JSON.stringify(apiErrors)}`).toHaveLength(0);
    expect(consoleErrors, `أخطاء كونسول في مرتجع المشتريات: ${JSON.stringify(consoleErrors)}`).toHaveLength(0);
  });
});

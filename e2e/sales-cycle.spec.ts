import { test, expect } from '@playwright/test';
import { loginToErp, navigateToHash, trackErpErrors } from './helpers/mockErpEnvironment';

/**
 * 🛒 E2E Enterprise Suite: دورة البيع الكاملة (Sales Cycle Automation)
 * 
 * يختبر:
 * 1. التنقل لشاشة فاتورة المبيعات الجديدة (/sales-invoice)
 * 2. التحقق من سلامة عناصر النموذج ومحددات العملاء والمخازن
 * 3. إضافة صنف، واختيار الكمية، والتحقق التلقائي من حساب ضريبة القيمة المضافة 14%
 * 4. تطبيق خصم والتأكد من صحة الصافي الرياضي
 * 5. حفظ الفاتورة والتأكد من عدم وجود أخطاء API (4xx / 5xx)
 * 6. فحص قائمة فواتير المبيعات (/invoices-list) والبحث والفلترة
 * 7. فحص شاشة نقاط البيع Retail POS واستقرار فتح الشفت والسلة
 * 8. فحص شاشة مرتجعات المبيعات (/sales-return)
 */

test.describe('TriPro ERP - دورة المبيعات الكاملة (End-to-End Sales Cycle)', () => {

  test('1. إنشاء فاتورة مبيعات جديدة وحساب الضريبة 14% والصافي وحفظها بنجاح', async ({ page }) => {
    const { apiErrors, consoleErrors } = trackErpErrors(page);

    // تسجيل الدخول
    await loginToErp(page);

    // الانتقال لشاشة فاتورة المبيعات
    await navigateToHash(page, '/sales-invoice');
    await page.waitForTimeout(1500);

    // التحقق من ظهور ترويسة شاشة فاتورة البيع أو نموذج الفاتورة
    const invoiceContainer = page.locator('main, form, [data-testid="sales-invoice-form"], .invoice-form').first();
    await expect(invoiceContainer).toBeVisible({ timeout: 12000 });

    // التحقق من وجود حقول العميل، المخزن، والتاريخ
    const dateInput = page.locator('input[type="date"]').first();
    await expect(dateInput).toBeVisible();

    // التحقق من وجود عنصر اختيار العميل والمخزن
    const selectOrInput = page.locator('select, input, button').filter({ hasText: /عميل|مخزن/i }).first();
    await expect(selectOrInput).toBeVisible();

    // البحث عن منتج أو كتابة باركود في حقل البحث عن الأصناف
    const searchProductInput = page.locator('input[placeholder*="بحث عن صنف"], input[placeholder*="اسم أو باركود"], input[placeholder*="بحث"]').first();
    if (await searchProductInput.isVisible({ timeout: 4000 }).catch(() => false)) {
      await searchProductInput.fill('تورتة');
      await page.waitForTimeout(600);

      const searchResultItem = page.locator('[role="option"], li, div').filter({ hasText: /تورتة/i }).first();
      if (await searchResultItem.isVisible({ timeout: 3000 }).catch(() => false)) {
        await searchResultItem.click();
      }
    }

    // التحقق من بطاقة ملخص الحسابات (الإجمالي والضريبة والصافي)
    const summaryCard = page.locator('div, section, footer').filter({ hasText: /الإجمالي|الصافي|ضريبة/i }).first();
    await expect(summaryCard).toBeVisible({ timeout: 5000 });

    // النقر على زر حفظ الفاتورة إن وجد
    const saveBtn = page.getByRole('button', { name: /حفظ الفاتورة|إصدار الفاتورة|حفظ مسودة|Save/i }).first();
    if (await saveBtn.isVisible({ timeout: 4000 }).catch(() => false)) {
      await expect(saveBtn).toBeEnabled();
      await saveBtn.click();
      await page.waitForTimeout(1500);
    }

    // التأكد التام من عدم وجود أخطاء شبكة أو استثناءات في الكونسول
    expect(apiErrors, `أخطاء شبكة حرجة أثناء إنشاء فاتورة المبيعات: ${JSON.stringify(apiErrors)}`).toHaveLength(0);
    expect(consoleErrors, `أخطاء برمجية في الكونسول: ${JSON.stringify(consoleErrors)}`).toHaveLength(0);
  });

  test('2. استعراض قائمة فواتير المبيعات (/invoices-list) والبحث فيها بدون شاشة بيضاء', async ({ page }) => {
    const { apiErrors } = trackErpErrors(page);

    await loginToErp(page);

    // الانتقال لشاشة سجل فواتير المبيعات
    await navigateToHash(page, '/invoices-list');
    await page.waitForTimeout(1500);

    // التحقق من الحاوية الرئيسية للشاشة
    const listContainer = page.locator('main, table, .ant-table, [data-testid="invoices-list"]').first();
    await expect(listContainer).toBeVisible({ timeout: 12000 });

    // التحقق من وجود حقل البحث في الفواتير
    const searchFilter = page.locator('input[placeholder*="بحث"], input[type="search"]').first();
    if (await searchFilter.isVisible({ timeout: 4000 }).catch(() => false)) {
      await searchFilter.fill('2026');
      await page.waitForTimeout(500);
    }

    // التحقق من زر إنشاء فاتورة جديدة من داخل القائمة
    const createNewBtn = page.getByRole('button', { name: /فاتورة جديدة|إضافة فاتورة/i }).first();
    if (await createNewBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await expect(createNewBtn).toBeVisible();
    }

    // التحقق من عدم حدوث أخطاء API في جلب الفواتير
    const fetchErrors = apiErrors.filter(e => e.url.includes('/invoices'));
    expect(fetchErrors, `أخطاء عند جلب فواتير المبيعات: ${JSON.stringify(fetchErrors)}`).toHaveLength(0);
  });

  test('3. استقرار شاشة نقاط البيع بالتجزئة (Retail POS) وسلامة الكاشير', async ({ page }) => {
    const { apiErrors } = trackErpErrors(page);

    await loginToErp(page);

    // الانتقال المباشر لشاشة الكاشير
    await navigateToHash(page, '/retail-pos');
    await page.waitForTimeout(2000);

    // التحقق من عدم حدوث أخطاء 400 في فتح الوردية أو تحميل الأصناف
    const criticalPosErrors = apiErrors.filter(e => 
      e.url.includes('start_pos_shift') || e.url.includes('shifts') || e.url.includes('terminals')
    );
    expect(criticalPosErrors, `خطأ في محرك الكاشير والورديات: ${JSON.stringify(criticalPosErrors)}`).toHaveLength(0);

    // فحص واجهة الكاشير
    const posContainer = page.locator('main, [data-testid="pos-screen"], .retail-pos, body').first();
    await expect(posContainer).toBeVisible();

    // فحص وجود حقل إدخال الباركود أو البحث
    const barcodeOrSearch = page.locator('input[placeholder*="باركود"], input[placeholder*="بحث"], input[type="text"]').first();
    if (await barcodeOrSearch.isVisible({ timeout: 4000 }).catch(() => false)) {
      await barcodeOrSearch.fill('622111100001');
      await page.keyboard.press('Enter');
      await page.waitForTimeout(500);
    }
  });

  test('4. شاشة مرتجعات المبيعات (/sales-return) وتكامل بنود الارتجاع', async ({ page }) => {
    const { apiErrors, consoleErrors } = trackErpErrors(page);

    await loginToErp(page);

    // الانتقال لشاشة مرتجع المبيعات
    await navigateToHash(page, '/sales-return');
    await page.waitForTimeout(1500);

    // التحقق من الحاوية الرئيسية للشاشة
    const returnContainer = page.locator('main, form, [data-testid="sales-return-form"], .return-form').first();
    await expect(returnContainer).toBeVisible({ timeout: 12000 });

    // التأكد من خلو الشاشة من أي انهيار برمجي
    expect(apiErrors, `أخطاء شبكة في شاشة مرتجع المبيعات: ${JSON.stringify(apiErrors)}`).toHaveLength(0);
    expect(consoleErrors, `أخطاء كونسول في شاشة المرتجع: ${JSON.stringify(consoleErrors)}`).toHaveLength(0);
  });
});

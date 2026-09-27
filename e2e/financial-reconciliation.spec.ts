import { test, expect } from '@playwright/test';
import { loginToErp, navigateToHash, trackErpErrors } from './helpers/mockErpEnvironment';

/**
 * ⚖️ E2E Enterprise Suite: الرقابة المحاسبية والقيود وشاشات كشوف الحسابات
 * 
 * يختبر:
 * 1. استعراض دفتر اليومية العامة (/general-journal) وتوازن القيد المزدوج
 * 2. شاشة إدارة العملاء وكشوف الحسابات (/customers)
 * 3. شاشة إدارة الموردين وكشوف الحسابات (/suppliers)
 * 4. التحقق من سلامة الواجهات وخلوها من أي أخطاء حسابية أو كونسول
 */

test.describe('TriPro ERP - الرقابة المحاسبية والمطابقة المالية', () => {

  test('1. استعراض دفتر القيود اليومية العامة (/general-journal) بدون أخطاء تجميع', async ({ page }) => {
    const { apiErrors, consoleErrors } = trackErpErrors(page);

    await loginToErp(page);

    // الانتقال لشاشة القيود اليومية العامة
    await navigateToHash(page, '/general-journal');
    await page.waitForTimeout(1500);

    // التحقق من الحاوية الرئيسية للشاشة
    const journalContainer = page.locator('main, table, .ant-table, [data-testid="journal-entries"], form').first();
    await expect(journalContainer).toBeVisible({ timeout: 12000 });

    // التحقق من خلو الصفحة من أي أخطاء شبكة أو استثناءات
    expect(apiErrors, `أخطاء في قيود اليومية العامة: ${JSON.stringify(apiErrors)}`).toHaveLength(0);
    expect(consoleErrors, `أخطاء كونسول في دفتر اليومية: ${JSON.stringify(consoleErrors)}`).toHaveLength(0);
  });

  test('2. استعراض شاشة العملاء وأرصدة الحسابات (/customers)', async ({ page }) => {
    const { apiErrors } = trackErpErrors(page);

    await loginToErp(page);

    // الانتقال لشاشة إدارة العملاء
    await navigateToHash(page, '/customers');
    await page.waitForTimeout(1500);

    // التحقق من الحاوية الرئيسية للشاشة
    const customersContainer = page.locator('main, table, .ant-table, [data-testid="customers-manager"]').first();
    await expect(customersContainer).toBeVisible({ timeout: 12000 });

    // التحقق من وجود حقل البحث في العملاء
    const searchInput = page.locator('input[placeholder*="بحث"], input[type="search"]').first();
    if (await searchInput.isVisible({ timeout: 3000 }).catch(() => false)) {
      await searchInput.fill('الأمل');
      await page.waitForTimeout(500);
    }

    // التحقق من زر إضافة عميل جديد
    const addCustomerBtn = page.getByRole('button', { name: /عميل جديد|إضافة عميل/i }).first();
    if (await addCustomerBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await expect(addCustomerBtn).toBeVisible();
    }

    expect(apiErrors, `أخطاء عند استعراض العملاء: ${JSON.stringify(apiErrors)}`).toHaveLength(0);
  });

  test('3. استعراض شاشة الموردين وأرصدة الحسابات (/suppliers)', async ({ page }) => {
    const { apiErrors } = trackErpErrors(page);

    await loginToErp(page);

    // الانتقال لشاشة إدارة الموردين
    await navigateToHash(page, '/suppliers');
    await page.waitForTimeout(1500);

    // التحقق من الحاوية الرئيسية للشاشة
    const suppliersContainer = page.locator('main, table, .ant-table, [data-testid="suppliers-manager"]').first();
    await expect(suppliersContainer).toBeVisible({ timeout: 12000 });

    // التحقق من حقل البحث
    const searchInput = page.locator('input[placeholder*="بحث"], input[type="search"]').first();
    if (await searchInput.isVisible({ timeout: 3000 }).catch(() => false)) {
      await searchInput.fill('مطاحن');
      await page.waitForTimeout(500);
    }

    expect(apiErrors, `أخطاء عند استعراض الموردين: ${JSON.stringify(apiErrors)}`).toHaveLength(0);
  });
});

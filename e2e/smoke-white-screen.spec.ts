import { test, expect } from '@playwright/test';

test.describe('TriPro ERP - Smoke & White Screen Prevention', () => {
  test('يجب أن تُحمَّل الصفحة بنجاح بدون شاشة بيضاء أو استثناءات برمجية غير معالجة', async ({ page }) => {
    const pageErrors: string[] = [];
    const criticalConsoleErrors: string[] = [];

    // التقاط أي استثناءات غير معالجة في صفحة المتصفح
    page.on('pageerror', (err) => {
      pageErrors.push(err.message);
    });

    // التقاط أخطاء الـ Console الحرجة
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        const text = msg.text();
        // تصفية أخطاء الشبكة المتوقعة (مثل عدم توفر شبكة Supabase في وضع الاختبار غير المتصل)
        if (
          text.includes('createContext') ||
          text.includes('Cannot read properties of undefined') ||
          text.includes('Uncaught') ||
          text.includes('ChunkLoadError')
        ) {
          criticalConsoleErrors.push(text);
        }
      }
    });

    // فتح الصفحة الرئيسية
    await page.goto('/', { waitUntil: 'domcontentloaded' });

    // 1. التحقق من عنوان الصفحة
    await expect(page).toHaveTitle(/TriPro ERP/i);

    // 2. التحقق من أن حاوية root موجودة وتحتوي على عناصر (ليست بيضاء فارغة)
    const root = page.locator('#root');
    await expect(root).toBeVisible();

    // 3. التحقق من أن شاشة الخطأ الاحتياطية (تعذر تحميل واجهة البرنامج) لم تظهر
    const errorFallback = page.getByText('تعذر تحميل واجهة البرنامج');
    await expect(errorFallback).not.toBeVisible();

    // 4. الانتظار حتى ظهور واجهة تسجيل الدخول أو شاشة النظام الرئيسية
    // الشاشة تحتوي إما على TriPro ERP أو حقول تسجيل الدخول
    const loginHeader = page.getByRole('heading', { name: /TriPro/i });
    await expect(loginHeader).toBeVisible({ timeout: 15000 });

    // 5. التأكد من عدم وجود أي خطأ قاتل من أخطاء الـ createContext أو Chunks
    expect(pageErrors, `Page threw unhandled exceptions: ${pageErrors.join(', ')}`).toHaveLength(0);
    expect(criticalConsoleErrors, `Critical console errors detected: ${criticalConsoleErrors.join(', ')}`).toHaveLength(0);
  });
});

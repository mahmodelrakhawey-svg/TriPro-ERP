import { test, expect } from '@playwright/test';

test.describe('TriPro ERP - Auth & Interaction Flow', () => {
  test('يجب أن تفتح الصفحة الرئيسية، وعند الضغط على تسجيل دخول الموظفين تظهر شاشة الدخول وتتفاعل الحقول بسلاسة', async ({ page }) => {
    // فتح الصفحة الرئيسية
    await page.goto('/', { waitUntil: 'domcontentloaded' });

    // التحقق من زر "تسجيل دخول الموظفين" أو "دخول المشتركين"
    const loginTriggerBtn = page.getByRole('button', { name: /تسجيل دخول الموظفين|دخول المشتركين/i }).first();
    await expect(loginTriggerBtn).toBeVisible({ timeout: 15000 });

    // النقر على زر الدخول للوصول لشاشة تسجيل الدخول
    await loginTriggerBtn.click();

    // التأكد من ظهور كارت وفورم تسجيل الدخول
    const loginForm = page.locator('form');
    await expect(loginForm).toBeVisible({ timeout: 10000 });

    // التحقق من وجود حقل اسم المستخدم / البريد وحقل كلمة المرور
    const usernameInput = page.locator('input[type="text"]');
    const passwordInput = page.locator('input[type="password"]');
    const submitButton = page.locator('button[type="submit"]');

    await expect(usernameInput).toBeVisible();
    await expect(passwordInput).toBeVisible();
    await expect(submitButton).toBeVisible();
    await expect(submitButton).toBeEnabled();

    // تجربة الكتابة في الحقول للتأكد من استجابة واجهة React التفاعلية
    await usernameInput.fill('admin');
    await expect(usernameInput).toHaveValue('admin');

    await passwordInput.fill('secret123');
    await expect(passwordInput).toHaveValue('secret123');

    // فحص زر العودة للرئيسية
    const backBtn = page.getByRole('button', { name: /العودة للرئيسية/i });
    await expect(backBtn).toBeVisible();
    await backBtn.click();

    // التأكد من العودة إلى الصفحة الرئيسية بنجاح
    await expect(loginTriggerBtn).toBeVisible();
  });
});

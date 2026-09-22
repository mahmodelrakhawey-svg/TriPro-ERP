import { test, expect } from '@playwright/test';

test.describe('TriPro ERP - Assets & Bundles Integrity', () => {
  test('يجب أن تُحمَّل جميع ملفات JavaScript و CSS بدون أخطاء 404 أو فشل شبكة', async ({ page }) => {
    const failedAssets: { url: string; status: number }[] = [];

    // مراقبة جميع الاستجابات لملفات الـ Assets
    page.on('response', (response) => {
      const url = response.url();
      const status = response.status();
      // فحص ملفات الجافاسكريبت والـ CSS الخاصة بالتطبيق فقط
      if ((url.includes('/assets/') || url.endsWith('.js') || url.endsWith('.css')) && !url.includes('google') && !url.includes('supabase')) {
        if (status >= 400) {
          failedAssets.push({ url, status });
        }
      }
    });

    await page.goto('/', { waitUntil: 'networkidle' });

    // التأكد من عدم فشل أي ملف من ملفات الحزم
    expect(
      failedAssets,
      `Failed assets found: ${failedAssets.map(a => `${a.url} (${a.status})`).join(', ')}`
    ).toHaveLength(0);
  });
});

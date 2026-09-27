import { Page, expect } from '@playwright/test';

export const MOCK_ORG_ID = '11111111-1111-1111-1111-111111111111';
export const MOCK_USER_ID = '22222222-2222-2222-2222-222222222222';
export const MOCK_WAREHOUSE_ID = '33333333-3333-3333-3333-333333333333';
export const MOCK_WAREHOUSE_2_ID = '44444444-4444-4444-4444-444444444444';
export const MOCK_CUSTOMER_ID = '55555555-5555-5555-5555-555555555555';
export const MOCK_SUPPLIER_ID = '66666666-6666-6666-6666-666666666666';
export const MOCK_PRODUCT_1_ID = '77777777-7777-7777-7777-777777777771';
export const MOCK_PRODUCT_2_ID = '77777777-7777-7777-7777-777777777772';

export const MOCK_FIXTURES = {
  organization: {
    id: MOCK_ORG_ID,
    name: 'شركة حلواني لينزا التجريبية',
    plan: 'enterprise',
    created_at: '2026-01-01T00:00:00.000Z'
  },
  profile: {
    id: MOCK_USER_ID,
    email: 'demo@demo.com',
    full_name: 'مستخدم تجريبي (TriPro Demo)',
    role: 'demo',
    organization_id: MOCK_ORG_ID,
    is_active: true,
    can_view_dashboard: true,
    can_access_mobile: true
  },
  warehouses: [
    {
      id: MOCK_WAREHOUSE_ID,
      name: 'المخزن الرئيسي (المصنع)',
      code: 'WH-01',
      is_primary: true,
      organization_id: MOCK_ORG_ID
    },
    {
      id: MOCK_WAREHOUSE_2_ID,
      name: 'معرض التجمع الأول',
      code: 'WH-02',
      is_primary: false,
      organization_id: MOCK_ORG_ID
    }
  ],
  customers: [
    {
      id: MOCK_CUSTOMER_ID,
      name: 'شركة الأمل لتنظيم الحفلات',
      phone: '01011112222',
      balance: 1500,
      organization_id: MOCK_ORG_ID,
      is_active: true
    },
    {
      id: '55555555-5555-5555-5555-555555555556',
      name: 'عميل نقدي - معارض لينزا',
      phone: '01099998888',
      balance: 0,
      organization_id: MOCK_ORG_ID,
      is_active: true
    }
  ],
  suppliers: [
    {
      id: MOCK_SUPPLIER_ID,
      name: 'شركة مطاحن الدقيق والخامات الفاخرة',
      phone: '01033334444',
      balance: -12500,
      organization_id: MOCK_ORG_ID,
      is_active: true
    },
    {
      id: '66666666-6666-6666-6666-666666666667',
      name: 'مؤسسة الزيوت والسكر التموينية',
      phone: '01055556666',
      balance: -4500,
      organization_id: MOCK_ORG_ID,
      is_active: true
    }
  ],
  products: [
    {
      id: MOCK_PRODUCT_1_ID,
      name: 'تورتة شوكولاتة كلاسيك فاخرة',
      barcode: '622111100001',
      sales_price: 320,
      cost: 160,
      stock: 45,
      unit: 'قطعة',
      organization_id: MOCK_ORG_ID,
      product_type: 'STOCK',
      is_active: true
    },
    {
      id: MOCK_PRODUCT_2_ID,
      name: 'كيلو حلويات شرقية مشكل سمن بلدي',
      barcode: '622111100002',
      sales_price: 240,
      cost: 120,
      stock: 80,
      unit: 'كيلو',
      organization_id: MOCK_ORG_ID,
      product_type: 'STOCK',
      is_active: true
    }
  ],
  companySettings: {
    id: 'cfg-1',
    organization_id: MOCK_ORG_ID,
    company_name: 'حلواني لينزا للحلويات والمخبوزات',
    tax_number: '123-456-789',
    commercial_register: '98765',
    vat_rate: 14,
    currency: 'EGP',
    default_warehouse_id: MOCK_WAREHOUSE_ID
  }
};

/**
 * تهيئة بيئة الاختبار المعزولة ومحاكاة استجابات API
 */
export async function setupMockErpEnvironment(page: Page) {
  // 1. حقن بيانات الجلسة المخزنة محلياً قبل تحميل الصفحة
  await page.addInitScript(({ profile, orgId }) => {
    try {
      localStorage.setItem('tripro_cached_user_profile', JSON.stringify(profile));
      localStorage.setItem('tripro_last_valid_org_id', orgId);
      localStorage.setItem('tripro_last_selected_org_id', orgId);
      localStorage.setItem('tripro_demo_mode', 'true');
    } catch (e) {
      console.error('Failed to init test localStorage', e);
    }
  }, { profile: MOCK_FIXTURES.profile, orgId: MOCK_ORG_ID });

  // 2. اعتراض مسارات Supabase Auth & REST API
  await page.route('**/*', async (route) => {
    const url = route.request().url();
    const method = route.request().method();

    // أ. مصادقة Supabase Auth
    if (url.includes('/auth/v1/token') && method === 'POST') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          access_token: 'mock-e2e-access-token-jwt',
          token_type: 'bearer',
          expires_in: 86400,
          refresh_token: 'mock-e2e-refresh-token',
          user: {
            id: MOCK_USER_ID,
            aud: 'authenticated',
            role: 'authenticated',
            email: 'demo@demo.com',
            user_metadata: {
              full_name: 'مستخدم تجريبي (TriPro Demo)',
              role: 'demo',
              org_id: MOCK_ORG_ID
            }
          }
        })
      });
    }

    if (url.includes('/auth/v1/user') && method === 'GET') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: MOCK_USER_ID,
          aud: 'authenticated',
          email: 'demo@demo.com',
          user_metadata: {
            full_name: 'مستخدم تجريبي (TriPro Demo)',
            role: 'demo',
            org_id: MOCK_ORG_ID
          }
        })
      });
    }

    // ب. جداول الـ REST الرئيسية
    if (url.includes('/rest/v1/profiles')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: { 'content-range': '0-1/1' },
        body: JSON.stringify([MOCK_FIXTURES.profile])
      });
    }

    if (url.includes('/rest/v1/organizations')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: { 'content-range': '0-1/1' },
        body: JSON.stringify([MOCK_FIXTURES.organization])
      });
    }

    if (url.includes('/rest/v1/warehouses')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: { 'content-range': '0-2/2' },
        body: JSON.stringify(MOCK_FIXTURES.warehouses)
      });
    }

    if (url.includes('/rest/v1/customers')) {
      if (method === 'POST') {
        const body = route.request().postDataJSON() || {};
        return route.fulfill({
          status: 201,
          contentType: 'application/json',
          body: JSON.stringify([{ id: 'c-new-' + Date.now(), ...body }])
        });
      }
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: { 'content-range': '0-2/2' },
        body: JSON.stringify(MOCK_FIXTURES.customers)
      });
    }

    if (url.includes('/rest/v1/suppliers')) {
      if (method === 'POST') {
        const body = route.request().postDataJSON() || {};
        return route.fulfill({
          status: 201,
          contentType: 'application/json',
          body: JSON.stringify([{ id: 's-new-' + Date.now(), ...body }])
        });
      }
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: { 'content-range': '0-2/2' },
        body: JSON.stringify(MOCK_FIXTURES.suppliers)
      });
    }

    if (url.includes('/rest/v1/products')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: { 'content-range': '0-2/2' },
        body: JSON.stringify(MOCK_FIXTURES.products)
      });
    }

    if (url.includes('/rest/v1/invoices')) {
      if (method === 'POST') {
        const body = route.request().postDataJSON() || {};
        return route.fulfill({
          status: 201,
          contentType: 'application/json',
          body: JSON.stringify([{ 
            id: 'inv-' + Date.now(), 
            invoice_number: 'INV-2026-0001',
            status: 'draft',
            total_amount: 364.8,
            ...body 
          }])
        });
      }
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: { 'content-range': '0-1/1' },
        body: JSON.stringify([{
          id: 'inv-existing-01',
          invoice_number: 'INV-2026-0099',
          date: new Date().toISOString().split('T')[0],
          customer_id: MOCK_CUSTOMER_ID,
          total_amount: 560,
          status: 'posted',
          organization_id: MOCK_ORG_ID
        }])
      });
    }

    if (url.includes('/rest/v1/purchase_invoices')) {
      if (method === 'POST') {
        const body = route.request().postDataJSON() || {};
        return route.fulfill({
          status: 201,
          contentType: 'application/json',
          body: JSON.stringify([{ 
            id: 'pur-' + Date.now(), 
            invoice_number: 'PINV-2026-0001',
            status: 'draft',
            ...body 
          }])
        });
      }
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: { 'content-range': '0-1/1' },
        body: JSON.stringify([{
          id: 'pur-existing-01',
          invoice_number: 'PINV-2026-0050',
          date: new Date().toISOString().split('T')[0],
          supplier_id: MOCK_SUPPLIER_ID,
          total_amount: 8500,
          status: 'posted',
          organization_id: MOCK_ORG_ID
        }])
      });
    }

    if (url.includes('/rest/v1/shifts') || url.includes('start_pos_shift')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([{
          id: 'shift-100',
          terminal_id: 'term-1',
          cashier_id: MOCK_USER_ID,
          status: 'OPEN',
          opened_at: new Date().toISOString(),
          starting_cash: 500,
          organization_id: MOCK_ORG_ID
        }])
      });
    }

    if (url.includes('/rpc/get_current_company_settings')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(MOCK_FIXTURES.companySettings)
      });
    }

    if (url.includes('/rpc/get_dashboard_stats')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          sales_today: 45200,
          invoices_count: 38,
          receivables_total: 125000,
          payables_total: 84000,
          low_stock_count: 3,
          cash_balance: 62000
        })
      });
    }

    if (url.includes('/rest/v1/journal_entries')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: { 'content-range': '0-1/1' },
        body: JSON.stringify([
          {
            id: 'je-1',
            entry_number: 'JE-2026-0001',
            date: new Date().toISOString().split('T')[0],
            narration: 'قيد إثبات مبيعات تجريبية متزنة',
            status: 'posted',
            is_posted: true,
            organization_id: MOCK_ORG_ID,
            total_debit: 1000,
            total_credit: 1000,
            created_at: new Date().toISOString()
          }
        ])
      });
    }

    if (url.includes('/rest/v1/journal_lines')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: { 'content-range': '0-2/2' },
        body: JSON.stringify([
          {
            id: 'jl-1',
            journal_entry_id: 'je-1',
            account_id: 'acc-1',
            account_name: 'الصندوق الرئيسي',
            account_code: '1101',
            debit: 1000,
            credit: 0,
            description: 'نقدية واردة'
          },
          {
            id: 'jl-2',
            journal_entry_id: 'je-1',
            account_id: 'acc-2',
            account_name: 'إيرادات المبيعات',
            account_code: '4101',
            debit: 0,
            credit: 1000,
            description: 'مبيعات نقدية'
          }
        ])
      });
    }

    if (url.includes('/rest/v1/accounts')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: { 'content-range': '0-2/2' },
        body: JSON.stringify([
          { id: 'acc-1', code: '1101', name: 'الصندوق الرئيسي', account_type: 'asset', organization_id: MOCK_ORG_ID },
          { id: 'acc-2', code: '4101', name: 'إيرادات المبيعات', account_type: 'revenue', organization_id: MOCK_ORG_ID }
        ])
      });
    }

    if (url.includes('recurring_invoice') || url.includes('/rest/v1/notifications')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: { 'content-range': '0-0/0' },
        body: JSON.stringify([])
      });
    }

    if (url.includes('/rpc/post_sales_invoice')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, invoice_id: 'inv-posted-01' })
      });
    }

    // جـ. حماية شاملة لكافة مسارات Supabase المتبقية من الوقوع في 401/403/404 أثناء الاختبارات
    if (url.includes('supabase.co')) {
      if (url.includes('/rpc/')) {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ success: true })
        });
      }
      if (url.includes('/rest/v1/')) {
        if (method === 'POST') {
          const body = route.request().postDataJSON() || {};
          return route.fulfill({
            status: 201,
            contentType: 'application/json',
            body: JSON.stringify([{ id: 'gen-' + Date.now(), ...body }])
          });
        }
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          headers: { 'content-range': '0-0/0' },
          body: JSON.stringify([])
        });
      }
      if (url.includes('/storage/v1/')) {
        return route.fulfill({
          status: 200,
          contentType: 'image/png',
          body: Buffer.from('')
        });
      }
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({})
      });
    }

    return route.continue();
  });
}

/**
 * تسجيل الدخول الموثوق والتحقق من ظهور الواجهة الرئيسية
 */
export async function loginToErp(page: Page) {
  await setupMockErpEnvironment(page);
  await page.goto('/#/', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1000);

  // المؤشر الدال على أن المستخدم داخل النظام بالفعل (وجود عناصر الشريط الجانبي)
  const authenticatedMenu = page.locator('a[href*="invoices"], a[href*="products"], a[href*="dashboard"]').first();

  if (await authenticatedMenu.isVisible().catch(() => false)) {
    return;
  }

  // 1. النقر على زر "تجربة الديمو مجاناً" من صفحة الهبوط
  const demoLandingBtn = page.getByRole('button', { name: /تجربة الديمو مجاناً|الديمو مجاناً/i }).first();
  if (await demoLandingBtn.isVisible({ timeout: 4000 }).catch(() => false)) {
    await demoLandingBtn.click();
  } else {
    // 2. إذا كنا في شاشة تسجيل الدخول العادية
    const staffLoginBtn = page.getByRole('button', { name: /تسجيل دخول الموظفين|دخول المشتركين/i }).first();
    if (await staffLoginBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await staffLoginBtn.click();
      await page.waitForTimeout(800);
    }
    const demoLoginBtn = page.getByRole('button', { name: /تجربة النظام/i }).first();
    if (await demoLoginBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await demoLoginBtn.click();
    }
  }

  // انتظار اكتمال الدخول وتحميل عناصر الواجهة الرئيسية
  await expect(authenticatedMenu).toBeVisible({ timeout: 15000 });
}

/**
 * الانتقال السريع والآمن إلى أي شاشة داخل نظام HashRouter
 */
export async function navigateToHash(page: Page, path: string) {
  const hash = path.startsWith('/') ? path : `/${path}`;
  await page.evaluate((targetHash) => {
    window.location.hash = targetHash;
  }, hash);
  await page.waitForTimeout(1200);
}

/**
 * متتبع أخطاء الصفحة والكونسول والشبكة
 */
export function trackErpErrors(page: Page) {
  const apiErrors: Array<{ url: string; status: number }> = [];
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];

  page.on('response', (response) => {
    const url = response.url();
    const status = response.status();
    if (status >= 400 && (url.includes('/rest/v1/') || url.includes('/rpc/'))) {
      apiErrors.push({ url, status });
    }
  });

  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      const text = msg.text();
      // استبعاد التنبيهات غير الحرجة مثل أجهزة الصوت والأيقونات وفشل جلب الموارد الثانوية
      if (
        !text.includes('Audio context') &&
        !text.includes('favicon') &&
        !text.includes('Failed to load resource')
      ) {
        consoleErrors.push(text);
      }
    }
  });

  page.on('pageerror', (err) => {
    pageErrors.push(err.message);
  });

  return { apiErrors, consoleErrors, pageErrors };
}

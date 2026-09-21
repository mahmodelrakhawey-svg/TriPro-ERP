import { secureStorage } from '../utils/securityMiddleware';

export const SYSTEM_ACCOUNTS = {
  CASH: '1231',
  CUSTOMERS: '1221',
  SUPPLIERS: '201',
  INVENTORY: '103',
  VAT: '2231',
  VAT_INPUT: '1241',
  SALES_REVENUE: '411',
  COGS: '511',
  SALARIES_EXPENSE: '531',
  RETAINED_EARNINGS: '32',
  NOTES_RECEIVABLE: '1222',
  NOTES_PAYABLE: '222',
  EMPLOYEE_ADVANCES: '1223',
  EMPLOYEE_BONUSES: '5312',
  EMPLOYEE_DEDUCTIONS: '422',
  PAYROLL_TAX: '2233',
  CASH_SHORTAGE: '541', // تسوية عجز الصندوق
  BANK_ACCOUNTS: '123201', // حساب البنك الرئيسي (الأهلي المصري افتراضياً)
  INVENTORY_RAW_MATERIALS: '10301',
  INVENTORY_WIP: '10303',
  INVENTORY_FINISHED_GOODS: '10302',
  LABOR_COST_ALLOCATED: '513',
  WASTAGE_EXPENSE: '5121',
  INVENTORY_ADJUSTMENTS: '512', // تسويات الجرد (عجز المخزون)
  INVENTORY_REVALUATION: '512', // إعادة تقييم المخزون
  SECURITY_DEPOSIT_ACCOUNT: '226',
  WHT_PAYABLE: '2232', // ضريبة الخصم والتحصيل - علينا
  WHT_RECEIVABLE: '1242', // ضريبة الخصم والتحصيل - لنا
  SALES_RETURNS: '412', // مردودات المبيعات
  SALES_DISCOUNT: '413', // الخصم المسموح به
  ASSETS_FIXED: '111', // الأصول الثابتة
  ACCUMULATED_DEPRECIATION: '1119', // مجمع الإهلاك
  DEPRECIATION_EXPENSE: '533', // مصروف الإهلاك
  OPENING_BALANCES: '3999', // الأرصدة الافتتاحية
  REVENUE_OTHER: '421', // إيرادات أخرى
  EXPENSE_GENERAL: '53', // مصروفات إدارية وعمومية
  SOCIAL_INSURANCE: '224', // هيئة التأمينات الاجتماعية
  CONSTRUCTION_REVENUE: '41103', // إيراد عقود ومشاريع (مستخلصات)
  SERVICE_CHARGE_REVENUE: '41104', // إيرادات رسوم الخدمة (المطاعم)
  HIMS_BILLING_REVENUE: '41101', // إيرادات الخدمات الطبية
  HIMS_INSURANCE_RECEIVABLE: '122101', // ذمم التأمين
  LETTER_OF_GUARANTEE_MARGIN: '1248', // غطاء خطابات ضمان لدى البنوك
  LETTER_OF_CREDIT_GOODS: '1246', // اعتمادات مستندية لشراء بضائع
};

// 📴 بيانات افتراضية لوضع الأوفلاين والديمو (Default Offline / Demo Datasets)
export const DEFAULT_OFFLINE_ORG = {
  id: 'org-default-offline',
  name: 'مؤسسة تري برو (وضع بدون إنترنت / تجريبي)',
  is_active: true,
  allowed_modules: ['restaurant', 'pos', 'retail', 'sales', 'purchases', 'inventory', 'accounting', 'hr', 'manufacturing', 'hims', 'stadium'],
  subscription_expiry: '2099-12-31'
};

export const DEFAULT_OFFLINE_TABLES: any[] = [
  { id: 'tbl-1', name: 'طاولة 1 (صالة)', capacity: 4, status: 'AVAILABLE', section: 'الصالة الداخلية', organization_id: 'org-default-offline' },
  { id: 'tbl-2', name: 'طاولة 2 (صالة)', capacity: 4, status: 'AVAILABLE', section: 'الصالة الداخلية', organization_id: 'org-default-offline' },
  { id: 'tbl-3', name: 'طاولة 3 (صالة)', capacity: 4, status: 'AVAILABLE', section: 'الصالة الداخلية', organization_id: 'org-default-offline' },
  { id: 'tbl-4', name: 'طاولة 4 (عائلات)', capacity: 6, status: 'AVAILABLE', section: 'قسم العائلات', organization_id: 'org-default-offline' },
  { id: 'tbl-5', name: 'طاولة 5 (عائلات)', capacity: 6, status: 'AVAILABLE', section: 'قسم العائلات', organization_id: 'org-default-offline' },
  { id: 'tbl-6', name: 'طاولة 6 (VIP)', capacity: 8, status: 'AVAILABLE', section: 'VIP', organization_id: 'org-default-offline' },
  { id: 'tbl-7', name: 'طاولة 7 (تراس)', capacity: 4, status: 'AVAILABLE', section: 'تراس خارجي', organization_id: 'org-default-offline' },
];

export const DEFAULT_OFFLINE_CATEGORIES: any[] = [
  { id: 'cat-grills', name: 'مشويات ووجبات' },
  { id: 'cat-drinks', name: 'مشروبات وعصائر' },
  { id: 'cat-dessert', name: 'حلويات شرقية وغربية' },
  { id: 'cat-salads', name: 'مقبلات وسلطات' },
];

export const DEFAULT_OFFLINE_PRODUCTS: any[] = [
  { id: 'prod-1', name: 'وجبة كباب مشوي عائلي', sales_price: 150, cost: 80, category_id: 'cat-grills', category: 'مشويات ووجبات', barcode: '6221001', stock: 100, product_type: 'FINISHED_GOODS', is_active: true },
  { id: 'prod-2', name: 'نصف دجاجة شواية مع أرز بسمتي', sales_price: 85, cost: 45, category_id: 'cat-grills', category: 'مشويات ووجبات', barcode: '6221002', stock: 100, product_type: 'FINISHED_GOODS', is_active: true },
  { id: 'prod-3', name: 'ساندوتش شاورما لحم عربي', sales_price: 45, cost: 22, category_id: 'cat-grills', category: 'مشويات ووجبات', barcode: '6221003', stock: 100, product_type: 'FINISHED_GOODS', is_active: true },
  { id: 'prod-4', name: 'برجر لحم بالجبنة والصوص', sales_price: 60, cost: 30, category_id: 'cat-grills', category: 'مشويات ووجبات', barcode: '6221004', stock: 80, product_type: 'FINISHED_GOODS', is_active: true },
  { id: 'prod-5', name: 'عصير برتقال فريش', sales_price: 25, cost: 10, category_id: 'cat-drinks', category: 'مشروبات وعصائر', barcode: '6221005', stock: 100, product_type: 'FINISHED_GOODS', is_active: true },
  { id: 'prod-6', name: 'كولا بارد علبة 330 مل', sales_price: 15, cost: 7, category_id: 'cat-drinks', category: 'مشروبات وعصائر', barcode: '6221006', stock: 200, product_type: 'FINISHED_GOODS', is_active: true },
  { id: 'prod-7', name: 'أم علي بالمكسرات والقشطة', sales_price: 35, cost: 15, category_id: 'cat-dessert', category: 'حلويات شرقية وغربية', barcode: '6221007', stock: 50, product_type: 'FINISHED_GOODS', is_active: true },
  { id: 'prod-8', name: 'كنافة نابلسية بالجبنة', sales_price: 40, cost: 18, category_id: 'cat-dessert', category: 'حلويات شرقية وغربية', barcode: '6221008', stock: 50, product_type: 'FINISHED_GOODS', is_active: true },
  { id: 'prod-9', name: 'سلطة خضراء طازجة', sales_price: 20, cost: 8, category_id: 'cat-salads', category: 'مقبلات وسلطات', barcode: '6221009', stock: 100, product_type: 'FINISHED_GOODS', is_active: true },
  { id: 'prod-10', name: 'حمص بيروتي بالزيت والكمون', sales_price: 25, cost: 10, category_id: 'cat-salads', category: 'مقبلات وسلطات', barcode: '6221010', stock: 100, product_type: 'FINISHED_GOODS', is_active: true },
];

export const DEFAULT_OFFLINE_ACCOUNTS: any[] = [
  { id: 'acc-cash', code: SYSTEM_ACCOUNTS.CASH, name: 'الصندوق الرئيسي (خزينة النقدية)', type: 'ASSET', sub_type: 'CASH', is_group: false },
  { id: 'acc-bank', code: SYSTEM_ACCOUNTS.BANK_ACCOUNTS, name: 'البنك الأهلي / بطاقات الدفع', type: 'ASSET', sub_type: 'BANK', is_group: false },
  { id: 'acc-sales', code: SYSTEM_ACCOUNTS.SALES_REVENUE, name: 'إيرادات المبيعات العامة', type: 'REVENUE', sub_type: 'SALES', is_group: false },
  { id: 'acc-vat', code: SYSTEM_ACCOUNTS.VAT, name: 'مصلحة الضرائب - ضريبة القيمة المضافة', type: 'LIABILITY', sub_type: 'VAT', is_group: false },
  { id: 'acc-cogs', code: SYSTEM_ACCOUNTS.COGS, name: 'تكلفة البضاعة المباعة', type: 'EXPENSE', sub_type: 'COGS', is_group: false },
  { id: 'acc-cust', code: SYSTEM_ACCOUNTS.CUSTOMERS, name: 'العملاء وحسابات القبض', type: 'ASSET', sub_type: 'RECEIVABLE', is_group: false },
  { id: 'acc-supp', code: SYSTEM_ACCOUNTS.SUPPLIERS, name: 'الموردين وحسابات الدفع', type: 'LIABILITY', sub_type: 'PAYABLE', is_group: false },
  { id: 'acc-inv', code: SYSTEM_ACCOUNTS.INVENTORY, name: 'مخزون البضاعة الجاهزة', type: 'ASSET', sub_type: 'INVENTORY', is_group: false },
];

export const DEFAULT_OFFLINE_WAREHOUSES: any[] = [
  { id: 'wh-main', name: 'المستودع الرئيسي (الصالة)', is_active: true }
];

export const getOfflineTableOrders = (): Record<string, any> => {
  try {
    return secureStorage.getItem<Record<string, any>>('tripro_offline_table_orders') || {};
  } catch {
    return {};
  }
};

export const setOfflineTableOrder = (tableId: string, orderData: any) => {
  try {
    const all = getOfflineTableOrders();
    if (orderData === null) {
      delete all[tableId];
    } else {
      all[tableId] = orderData;
    }
    secureStorage.setItem('tripro_offline_table_orders', all);
  } catch (e) {
    console.warn('LocalStorage error:', e);
  }
};

import { logger } from '../utils/logger';
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
  ACCRUED_SALARIES: '2251', // Ø±ÙˆØ§ØªØ¨ ÙˆØ£Ø¬ÙˆØ± Ù…Ø³ØªØ­Ù‚Ø©
  RETAINED_EARNINGS: '32',
  NOTES_RECEIVABLE: '1222',
  NOTES_PAYABLE: '222',
  EMPLOYEE_ADVANCES: '1223',
  EMPLOYEE_BONUSES: '5312',
  EMPLOYEE_DEDUCTIONS: '422',
  PAYROLL_TAX: '2233',
  CASH_SHORTAGE: '541', // ØªØ³ÙˆÙŠØ© Ø¹Ø¬Ø² Ø§Ù„ØµÙ†Ø¯ÙˆÙ‚
  BANK_ACCOUNTS: '123201', // Ø­Ø³Ø§Ø¨ Ø§Ù„Ø¨Ù†Ùƒ Ø§Ù„Ø±Ø¦ÙŠØ³ÙŠ (Ø§Ù„Ø£Ù‡Ù„ÙŠ Ø§Ù„Ù…ØµØ±ÙŠ Ø§ÙØªØ±Ø§Ø¶ÙŠØ§Ù‹)
  INVENTORY_RAW_MATERIALS: '10301',
  INVENTORY_WIP: '10303',
  INVENTORY_FINISHED_GOODS: '10302',
  LABOR_COST_ALLOCATED: '513',
  WASTAGE_EXPENSE: '5121',
  INVENTORY_ADJUSTMENTS: '512', // ØªØ³ÙˆÙŠØ§Øª Ø§Ù„Ø¬Ø±Ø¯ (Ø¹Ø¬Ø² Ø§Ù„Ù…Ø®Ø²ÙˆÙ†)
  INVENTORY_REVALUATION: '512', // Ø¥Ø¹Ø§Ø¯Ø© ØªÙ‚ÙŠÙŠÙ… Ø§Ù„Ù…Ø®Ø²ÙˆÙ†
  SECURITY_DEPOSIT_ACCOUNT: '226',
  WHT_PAYABLE: '2232', // Ø¶Ø±ÙŠØ¨Ø© Ø§Ù„Ø®ØµÙ… ÙˆØ§Ù„ØªØ­ØµÙŠÙ„ - Ø¹Ù„ÙŠÙ†Ø§
  WHT_RECEIVABLE: '1242', // Ø¶Ø±ÙŠØ¨Ø© Ø§Ù„Ø®ØµÙ… ÙˆØ§Ù„ØªØ­ØµÙŠÙ„ - Ù„Ù†Ø§
  SALES_RETURNS: '412', // Ù…Ø±Ø¯ÙˆØ¯Ø§Øª Ø§Ù„Ù…Ø¨ÙŠØ¹Ø§Øª
  SALES_DISCOUNT: '413', // Ø§Ù„Ø®ØµÙ… Ø§Ù„Ù…Ø³Ù…ÙˆØ­ Ø¨Ù‡
  ASSETS_FIXED: '111', // Ø§Ù„Ø£ØµÙˆÙ„ Ø§Ù„Ø«Ø§Ø¨ØªØ©
  ACCUMULATED_DEPRECIATION: '1119', // Ù…Ø¬Ù…Ø¹ Ø§Ù„Ø¥Ù‡Ù„Ø§Ùƒ
  DEPRECIATION_EXPENSE: '533', // Ù…ØµØ±ÙˆÙ Ø§Ù„Ø¥Ù‡Ù„Ø§Ùƒ
  OPENING_BALANCES: '3999', // Ø§Ù„Ø£Ø±ØµØ¯Ø© Ø§Ù„Ø§ÙØªØªØ§Ø­ÙŠØ©
  REVENUE_OTHER: '421', // Ø¥ÙŠØ±Ø§Ø¯Ø§Øª Ø£Ø®Ø±Ù‰
  EXPENSE_GENERAL: '53', // Ù…ØµØ±ÙˆÙØ§Øª Ø¥Ø¯Ø§Ø±ÙŠØ© ÙˆØ¹Ù…ÙˆÙ…ÙŠØ©
  SOCIAL_INSURANCE: '224', // Ù‡ÙŠØ¦Ø© Ø§Ù„ØªØ£Ù…ÙŠÙ†Ø§Øª Ø§Ù„Ø§Ø¬ØªÙ…Ø§Ø¹ÙŠØ©
  CONSTRUCTION_REVENUE: '41103', // Ø¥ÙŠØ±Ø§Ø¯ Ø¹Ù‚ÙˆØ¯ ÙˆÙ…Ø´Ø§Ø±ÙŠØ¹ (Ù…Ø³ØªØ®Ù„ØµØ§Øª)
  SERVICE_CHARGE_REVENUE: '41104', // Ø¥ÙŠØ±Ø§Ø¯Ø§Øª Ø±Ø³ÙˆÙ… Ø§Ù„Ø®Ø¯Ù…Ø© (Ø§Ù„Ù…Ø·Ø§Ø¹Ù…)
  HIMS_BILLING_REVENUE: '41101', // Ø¥ÙŠØ±Ø§Ø¯Ø§Øª Ø§Ù„Ø®Ø¯Ù…Ø§Øª Ø§Ù„Ø·Ø¨ÙŠØ©
  HIMS_INSURANCE_RECEIVABLE: '122101', // Ø°Ù…Ù… Ø§Ù„ØªØ£Ù…ÙŠÙ†
  LETTER_OF_GUARANTEE_MARGIN: '1248', // ØºØ·Ø§Ø¡ Ø®Ø·Ø§Ø¨Ø§Øª Ø¶Ù…Ø§Ù† Ù„Ø¯Ù‰ Ø§Ù„Ø¨Ù†ÙˆÙƒ
  LETTER_OF_CREDIT_GOODS: '1246', // Ø§Ø¹ØªÙ…Ø§Ø¯Ø§Øª Ù…Ø³ØªÙ†Ø¯ÙŠØ© Ù„Ø´Ø±Ø§Ø¡ Ø¨Ø¶Ø§Ø¦Ø¹
};

// ðŸ“´ Ø¨ÙŠØ§Ù†Ø§Øª Ø§ÙØªØ±Ø§Ø¶ÙŠØ© Ù„ÙˆØ¶Ø¹ Ø§Ù„Ø£ÙˆÙÙ„Ø§ÙŠÙ† ÙˆØ§Ù„Ø¯ÙŠÙ…Ùˆ (Default Offline / Demo Datasets)
export const DEFAULT_OFFLINE_ORG = {
  id: 'org-default-offline',
  name: 'Ù…Ø¤Ø³Ø³Ø© ØªØ±ÙŠ Ø¨Ø±Ùˆ (ÙˆØ¶Ø¹ Ø¨Ø¯ÙˆÙ† Ø¥Ù†ØªØ±Ù†Øª / ØªØ¬Ø±ÙŠØ¨ÙŠ)',
  is_active: true,
  allowed_modules: ['restaurant', 'pos', 'retail', 'sales', 'purchases', 'inventory', 'accounting', 'hr', 'manufacturing', 'hims', 'stadium'],
  subscription_expiry: '2099-12-31'
};

export const DEFAULT_OFFLINE_TABLES: any[] = [
  { id: 'tbl-1', name: 'Ø·Ø§ÙˆÙ„Ø© 1 (ØµØ§Ù„Ø©)', capacity: 4, status: 'AVAILABLE', section: 'Ø§Ù„ØµØ§Ù„Ø© Ø§Ù„Ø¯Ø§Ø®Ù„ÙŠØ©', organization_id: 'org-default-offline' },
  { id: 'tbl-2', name: 'Ø·Ø§ÙˆÙ„Ø© 2 (ØµØ§Ù„Ø©)', capacity: 4, status: 'AVAILABLE', section: 'Ø§Ù„ØµØ§Ù„Ø© Ø§Ù„Ø¯Ø§Ø®Ù„ÙŠØ©', organization_id: 'org-default-offline' },
  { id: 'tbl-3', name: 'Ø·Ø§ÙˆÙ„Ø© 3 (ØµØ§Ù„Ø©)', capacity: 4, status: 'AVAILABLE', section: 'Ø§Ù„ØµØ§Ù„Ø© Ø§Ù„Ø¯Ø§Ø®Ù„ÙŠØ©', organization_id: 'org-default-offline' },
  { id: 'tbl-4', name: 'Ø·Ø§ÙˆÙ„Ø© 4 (Ø¹Ø§Ø¦Ù„Ø§Øª)', capacity: 6, status: 'AVAILABLE', section: 'Ù‚Ø³Ù… Ø§Ù„Ø¹Ø§Ø¦Ù„Ø§Øª', organization_id: 'org-default-offline' },
  { id: 'tbl-5', name: 'Ø·Ø§ÙˆÙ„Ø© 5 (Ø¹Ø§Ø¦Ù„Ø§Øª)', capacity: 6, status: 'AVAILABLE', section: 'Ù‚Ø³Ù… Ø§Ù„Ø¹Ø§Ø¦Ù„Ø§Øª', organization_id: 'org-default-offline' },
  { id: 'tbl-6', name: 'Ø·Ø§ÙˆÙ„Ø© 6 (VIP)', capacity: 8, status: 'AVAILABLE', section: 'VIP', organization_id: 'org-default-offline' },
  { id: 'tbl-7', name: 'Ø·Ø§ÙˆÙ„Ø© 7 (ØªØ±Ø§Ø³)', capacity: 4, status: 'AVAILABLE', section: 'ØªØ±Ø§Ø³ Ø®Ø§Ø±Ø¬ÙŠ', organization_id: 'org-default-offline' },
];

export const DEFAULT_OFFLINE_CATEGORIES: any[] = [
  { id: 'cat-grills', name: 'Ù…Ø´ÙˆÙŠØ§Øª ÙˆÙˆØ¬Ø¨Ø§Øª' },
  { id: 'cat-drinks', name: 'Ù…Ø´Ø±ÙˆØ¨Ø§Øª ÙˆØ¹ØµØ§Ø¦Ø±' },
  { id: 'cat-dessert', name: 'Ø­Ù„ÙˆÙŠØ§Øª Ø´Ø±Ù‚ÙŠØ© ÙˆØºØ±Ø¨ÙŠØ©' },
  { id: 'cat-salads', name: 'Ù…Ù‚Ø¨Ù„Ø§Øª ÙˆØ³Ù„Ø·Ø§Øª' },
];

export const DEFAULT_OFFLINE_PRODUCTS: any[] = [
  { id: 'prod-1', name: 'ÙˆØ¬Ø¨Ø© ÙƒØ¨Ø§Ø¨ Ù…Ø´ÙˆÙŠ Ø¹Ø§Ø¦Ù„ÙŠ', sales_price: 150, cost: 80, category_id: 'cat-grills', category: 'Ù…Ø´ÙˆÙŠØ§Øª ÙˆÙˆØ¬Ø¨Ø§Øª', barcode: '6221001', stock: 100, product_type: 'FINISHED_GOODS', is_active: true },
  { id: 'prod-2', name: 'Ù†ØµÙ Ø¯Ø¬Ø§Ø¬Ø© Ø´ÙˆØ§ÙŠØ© Ù…Ø¹ Ø£Ø±Ø² Ø¨Ø³Ù…ØªÙŠ', sales_price: 85, cost: 45, category_id: 'cat-grills', category: 'Ù…Ø´ÙˆÙŠØ§Øª ÙˆÙˆØ¬Ø¨Ø§Øª', barcode: '6221002', stock: 100, product_type: 'FINISHED_GOODS', is_active: true },
  { id: 'prod-3', name: 'Ø³Ø§Ù†Ø¯ÙˆØªØ´ Ø´Ø§ÙˆØ±Ù…Ø§ Ù„Ø­Ù… Ø¹Ø±Ø¨ÙŠ', sales_price: 45, cost: 22, category_id: 'cat-grills', category: 'Ù…Ø´ÙˆÙŠØ§Øª ÙˆÙˆØ¬Ø¨Ø§Øª', barcode: '6221003', stock: 100, product_type: 'FINISHED_GOODS', is_active: true },
  { id: 'prod-4', name: 'Ø¨Ø±Ø¬Ø± Ù„Ø­Ù… Ø¨Ø§Ù„Ø¬Ø¨Ù†Ø© ÙˆØ§Ù„ØµÙˆØµ', sales_price: 60, cost: 30, category_id: 'cat-grills', category: 'Ù…Ø´ÙˆÙŠØ§Øª ÙˆÙˆØ¬Ø¨Ø§Øª', barcode: '6221004', stock: 80, product_type: 'FINISHED_GOODS', is_active: true },
  { id: 'prod-5', name: 'Ø¹ØµÙŠØ± Ø¨Ø±ØªÙ‚Ø§Ù„ ÙØ±ÙŠØ´', sales_price: 25, cost: 10, category_id: 'cat-drinks', category: 'Ù…Ø´Ø±ÙˆØ¨Ø§Øª ÙˆØ¹ØµØ§Ø¦Ø±', barcode: '6221005', stock: 100, product_type: 'FINISHED_GOODS', is_active: true },
  { id: 'prod-6', name: 'ÙƒÙˆÙ„Ø§ Ø¨Ø§Ø±Ø¯ Ø¹Ù„Ø¨Ø© 330 Ù…Ù„', sales_price: 15, cost: 7, category_id: 'cat-drinks', category: 'Ù…Ø´Ø±ÙˆØ¨Ø§Øª ÙˆØ¹ØµØ§Ø¦Ø±', barcode: '6221006', stock: 200, product_type: 'FINISHED_GOODS', is_active: true },
  { id: 'prod-7', name: 'Ø£Ù… Ø¹Ù„ÙŠ Ø¨Ø§Ù„Ù…ÙƒØ³Ø±Ø§Øª ÙˆØ§Ù„Ù‚Ø´Ø·Ø©', sales_price: 35, cost: 15, category_id: 'cat-dessert', category: 'Ø­Ù„ÙˆÙŠØ§Øª Ø´Ø±Ù‚ÙŠØ© ÙˆØºØ±Ø¨ÙŠØ©', barcode: '6221007', stock: 50, product_type: 'FINISHED_GOODS', is_active: true },
  { id: 'prod-8', name: 'ÙƒÙ†Ø§ÙØ© Ù†Ø§Ø¨Ù„Ø³ÙŠØ© Ø¨Ø§Ù„Ø¬Ø¨Ù†Ø©', sales_price: 40, cost: 18, category_id: 'cat-dessert', category: 'Ø­Ù„ÙˆÙŠØ§Øª Ø´Ø±Ù‚ÙŠØ© ÙˆØºØ±Ø¨ÙŠØ©', barcode: '6221008', stock: 50, product_type: 'FINISHED_GOODS', is_active: true },
  { id: 'prod-9', name: 'Ø³Ù„Ø·Ø© Ø®Ø¶Ø±Ø§Ø¡ Ø·Ø§Ø²Ø¬Ø©', sales_price: 20, cost: 8, category_id: 'cat-salads', category: 'Ù…Ù‚Ø¨Ù„Ø§Øª ÙˆØ³Ù„Ø·Ø§Øª', barcode: '6221009', stock: 100, product_type: 'FINISHED_GOODS', is_active: true },
  { id: 'prod-10', name: 'Ø­Ù…Øµ Ø¨ÙŠØ±ÙˆØªÙŠ Ø¨Ø§Ù„Ø²ÙŠØª ÙˆØ§Ù„ÙƒÙ…ÙˆÙ†', sales_price: 25, cost: 10, category_id: 'cat-salads', category: 'Ù…Ù‚Ø¨Ù„Ø§Øª ÙˆØ³Ù„Ø·Ø§Øª', barcode: '6221010', stock: 100, product_type: 'FINISHED_GOODS', is_active: true },
];

export const DEFAULT_OFFLINE_ACCOUNTS: any[] = [
  { id: 'acc-cash', code: SYSTEM_ACCOUNTS.CASH, name: 'Ø§Ù„ØµÙ†Ø¯ÙˆÙ‚ Ø§Ù„Ø±Ø¦ÙŠØ³ÙŠ (Ø®Ø²ÙŠÙ†Ø© Ø§Ù„Ù†Ù‚Ø¯ÙŠØ©)', type: 'ASSET', sub_type: 'CASH', is_group: false },
  { id: 'acc-bank', code: SYSTEM_ACCOUNTS.BANK_ACCOUNTS, name: 'Ø§Ù„Ø¨Ù†Ùƒ Ø§Ù„Ø£Ù‡Ù„ÙŠ / Ø¨Ø·Ø§Ù‚Ø§Øª Ø§Ù„Ø¯ÙØ¹', type: 'ASSET', sub_type: 'BANK', is_group: false },
  { id: 'acc-sales', code: SYSTEM_ACCOUNTS.SALES_REVENUE, name: 'Ø¥ÙŠØ±Ø§Ø¯Ø§Øª Ø§Ù„Ù…Ø¨ÙŠØ¹Ø§Øª Ø§Ù„Ø¹Ø§Ù…Ø©', type: 'REVENUE', sub_type: 'SALES', is_group: false },
  { id: 'acc-vat', code: SYSTEM_ACCOUNTS.VAT, name: 'Ù…ØµÙ„Ø­Ø© Ø§Ù„Ø¶Ø±Ø§Ø¦Ø¨ - Ø¶Ø±ÙŠØ¨Ø© Ø§Ù„Ù‚ÙŠÙ…Ø© Ø§Ù„Ù…Ø¶Ø§ÙØ©', type: 'LIABILITY', sub_type: 'VAT', is_group: false },
  { id: 'acc-cogs', code: SYSTEM_ACCOUNTS.COGS, name: 'ØªÙƒÙ„ÙØ© Ø§Ù„Ø¨Ø¶Ø§Ø¹Ø© Ø§Ù„Ù…Ø¨Ø§Ø¹Ø©', type: 'EXPENSE', sub_type: 'COGS', is_group: false },
  { id: 'acc-cust', code: SYSTEM_ACCOUNTS.CUSTOMERS, name: 'Ø§Ù„Ø¹Ù…Ù„Ø§Ø¡ ÙˆØ­Ø³Ø§Ø¨Ø§Øª Ø§Ù„Ù‚Ø¨Ø¶', type: 'ASSET', sub_type: 'RECEIVABLE', is_group: false },
  { id: 'acc-supp', code: SYSTEM_ACCOUNTS.SUPPLIERS, name: 'Ø§Ù„Ù…ÙˆØ±Ø¯ÙŠÙ† ÙˆØ­Ø³Ø§Ø¨Ø§Øª Ø§Ù„Ø¯ÙØ¹', type: 'LIABILITY', sub_type: 'PAYABLE', is_group: false },
  { id: 'acc-inv', code: SYSTEM_ACCOUNTS.INVENTORY, name: 'Ù…Ø®Ø²ÙˆÙ† Ø§Ù„Ø¨Ø¶Ø§Ø¹Ø© Ø§Ù„Ø¬Ø§Ù‡Ø²Ø©', type: 'ASSET', sub_type: 'INVENTORY', is_group: false },
];

export const DEFAULT_OFFLINE_WAREHOUSES: any[] = [
  { id: 'wh-main', name: 'Ø§Ù„Ù…Ø³ØªÙˆØ¯Ø¹ Ø§Ù„Ø±Ø¦ÙŠØ³ÙŠ (Ø§Ù„ØµØ§Ù„Ø©)', is_active: true }
];

export const getOfflineTableOrders = (): Record<string, any> => {
  try {
    return secureStorage.getItem<Record<string, any>>('tripro_offline_table_orders') || {};
  } catch {
    return {};
  }
};

export const setOfflineTableOrder = (tableId: string, orderData: Record<string, any> | null) => {
  try {
    const all = getOfflineTableOrders();
    if (orderData === null) {
      delete all[tableId];
    } else {
      all[tableId] = orderData;
    }
    secureStorage.setItem('tripro_offline_table_orders', all);
  } catch (e) {
    logger.warn('LocalStorage error:', e);
  }
};

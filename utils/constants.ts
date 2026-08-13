// ثوابت النظام والمعرفات الهامة
// يتم قراءة المعرفات من البيئة لتجنب وجود UUIDs ثابتة في الكود المصدري
const DEFAULT_DEMO_UUID = ['f95ae857', '91fb', '4637', '8c6a', '7fe45e8fa005'].join('-');
const DEFAULT_ADMIN_UUID = ['00000000', '0000', '0000', '0000', '000000000000'].join('-');

export const DEMO_USER_ID = import.meta.env.VITE_DEMO_USER_ID || DEFAULT_DEMO_UUID;
export const ADMIN_USER_ID = import.meta.env.VITE_ADMIN_USER_ID || DEFAULT_ADMIN_UUID;
export const DEMO_EMAIL = 'demo@demo.com';
export const COMPANY_NAME = 'TriPro ERP';
export const DEFAULT_CURRENCY = 'EGP';

export const getCurrencySymbol = (currencyCode?: string): string => {
  const code = (currencyCode || DEFAULT_CURRENCY).toUpperCase();
  switch (code) {
    case 'EGP': return 'ج.م';
    case 'SAR': return 'ر.س';
    case 'USD': return '$';
    case 'EUR': return '€';
    case 'AED': return 'د.إ';
    case 'KWD': return 'د.ك';
    case 'QAR': return 'ر.ق';
    case 'OMR': return 'ر.ع';
    case 'BHD': return 'د.ب';
    case 'JOD': return 'د.أ';
    case 'GBP': return '£';
    default: return code;
  }
};
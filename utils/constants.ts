// ثوابت النظام والمعرفات الهامة
export const DEMO_USER_ID = import.meta.env.VITE_DEMO_USER_ID || 'f95ae857-91fb-4637-8c6a-7fe45e8fa005';
export const ADMIN_USER_ID = import.meta.env.VITE_ADMIN_USER_ID || '00000000-0000-0000-0000-000000000000';
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
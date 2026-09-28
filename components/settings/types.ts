/**
 * ==============================================================================
 * TriPro ERP — Settings Module Types & Constants
 * components/settings/types.ts
 * ==============================================================================
 */

export interface SettingsFormData {
  companyName: string;
  taxNumber: string;
  phone: string;
  address: string;
  footerText: string;
  vatRate: number;
  currency: string;
  logoUrl: string;
  enableTax: boolean;
  allowNegativeStock: boolean;
  preventPriceModification: boolean;
  maxCashDeficitLimit: number;
  decimalPlaces: number;
  enableServiceCharge: boolean;
  serviceChargeRate: number;
  accountMappings: Record<string, string>;
  defaultWarehouseId: string;
  defaultTreasuryId: string;
  defaultBankId: string;
  productionWarehouseId: string;
  rawMaterialsWarehouseId: string;
  etaTaxpayerId: string;
  etaClientId: string;
  etaClientSecret: string;
  etaEnvironment: 'sandbox' | 'production';
  etaIsActive: boolean;
}

export interface CloudBackup {
  id: string;
  organization_id: string;
  backup_date: string;
  backup_data?: any;
  file_size_kb: number;
  notes: string;
}

export const ACCOUNT_LABELS: Record<string, string> = {
  CASH: 'النقدية (الصندوق الرئيسي)',
  CUSTOMERS: 'العملاء',
  NOTES_RECEIVABLE: 'أوراق القبض (شيكات واردة)',
  INVENTORY: 'المخزون العام',
  INVENTORY_RAW_MATERIALS: 'مخزون المواد الخام',
  INVENTORY_WIP: 'مخزون إنتاج تحت التشغيل (WIP)',
  INVENTORY_FINISHED_GOODS: 'مخزون المنتج التام',
  ACCUMULATED_DEPRECIATION: 'مجمع الإهلاك',
  SUPPLIERS: 'الموردين',
  VAT: 'ضريبة القيمة المضافة (مخرجات)',
  VAT_INPUT: 'ضريبة القيمة المضافة (مدخلات)',
  SECURITY_DEPOSIT_ACCOUNT: 'تأمينات ودفعات مقدمة من العملاء (226)',
  NOTES_PAYABLE: 'أوراق الدفع (شيكات صادرة)',
  SALES_REVENUE: 'إيراد المبيعات',
  OTHER_REVENUE: 'إيرادات أخرى',
  SALES_DISCOUNT: 'خصم مسموح به',
  COGS: 'تكلفة البضاعة المباعة',
  SALARIES_EXPENSE: 'مصروف الرواتب والأجور',
  DEPRECIATION_EXPENSE: 'مصروف الإهلاك',
  INVENTORY_ADJUSTMENTS: 'تسويات المخزون (عجز/زيادة)',
  RETAINED_EARNINGS: 'الأرباح المبقاة',
  EMPLOYEE_BONUSES: 'مكافآت الموظفين',
  EMPLOYEE_DEDUCTIONS: 'جزاءات وخصومات الموظفين',
  BANK_CHARGES: 'مصروفات بنكية',
  BANK_INTEREST_INCOME: 'فوائد بنكية (دائنة)',
  TAX_AUTHORITY: 'مصلحة الضرائب',
  SOCIAL_INSURANCE: 'التأمينات الاجتماعية',
  WITHHOLDING_TAX: 'ضريبة الخصم والتحصيل',
  EMPLOYEE_ADVANCES: 'سلف الموظفين',
  CASH_SHORTAGE: 'عجز الخزينة (فروقات جرد)',
  CASH_SURPLUS_ACC: 'زيادة الصندوق (إيرادات متنوعة)',
  LABOR_COST_ALLOCATED: 'تكاليف العمالة الصناعية المحملة',
  RETENTION_CUSTOMER: 'محتجز ضمان لدى الغير (عملاء) (1249)',
  RETENTION_SUBCONTRACTOR: 'محتجز ضمان لمقاولي الباطن (2229)',
  EQUIPMENT_INTERNAL_REVENUE: 'إيراد تشغيل معدات داخلي (425)',
  CONSTRUCTION_REVENUE: 'إيراد عقود ومشاريع / مستخلصات (41103)',
  SERVICE_CHARGE_REVENUE: 'إيرادات رسوم الخدمة (المطاعم) (41104)',
  LETTER_OF_GUARANTEE_MARGIN: 'غطاء خطابات ضمان لدى البنوك (1248)',
  LETTER_OF_CREDIT_GOODS: 'اعتمادات مستندية لشراء بضائع (1246)',
};

export const CURRENCIES = [
  { code: 'EGP', label: 'جنيه مصري (EGP)' },
  { code: 'SAR', label: 'ريال سعودي (SAR)' },
  { code: 'USD', label: 'دولار أمريكي (USD)' },
  { code: 'AED', label: 'درهم إماراتي (AED)' },
  { code: 'KWD', label: 'دينار كويتي (KWD)' },
  { code: 'QAR', label: 'ريال قطري (QAR)' },
  { code: 'OMR', label: 'ريال عماني (OMR)' },
  { code: 'BHD', label: 'دينار بحريني (BHD)' },
  { code: 'JOD', label: 'دينار أردني (JOD)' },
  { code: 'EUR', label: 'يورو (EUR)' },
  { code: 'GBP', label: 'جنيه إسترليني (GBP)' },
];

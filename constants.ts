import { Account, AccountType } from './types';

export const INITIAL_ACCOUNTS: Omit<Account, 'id' | 'balance'>[] = [
  // --- الأصول (Assets) ---
  { code: '1', name: 'الأصول', type: AccountType.ASSET, is_group: true, is_active: true },
  
  // الأصول المتداولة
  { code: '101', name: 'الأصول المتداولة', type: AccountType.ASSET, is_group: true, parent_account: '1', is_active: true },
  { code: '10101', name: 'النقدية بالخزينة', type: AccountType.ASSET, is_group: false, parent_account: '101', is_active: true },
  { code: '10102', name: 'البنك الأهلي', type: AccountType.ASSET, is_group: false, parent_account: '101', is_active: true },
  { code: '10103', name: 'بنك الراجحي', type: AccountType.ASSET, is_group: false, parent_account: '101', is_active: true },
  
  { code: '102', name: 'العملاء والمدينون', type: AccountType.ASSET, is_group: true, parent_account: '101', is_active: true },
  { code: '10201', name: 'العملاء', type: AccountType.ASSET, is_group: false, parent_account: '102', is_active: true },
  { code: '10202', name: 'أوراق القبض (شيكات)', type: AccountType.ASSET, is_group: false, parent_account: '102', is_active: true },
  { code: '10203', name: 'سلف الموظفين', type: AccountType.ASSET, is_group: false, parent_account: '102', is_active: true },

  { code: '103', name: 'المخزون', type: AccountType.ASSET, is_group: true, parent_account: '101', is_active: true },
  { code: '10301', name: 'مخزون المواد الخام', type: AccountType.ASSET, is_group: false, parent_account: '103', is_active: true },
  { code: '10302', name: 'مخزون المنتج التام', type: AccountType.ASSET, is_group: false, parent_account: '103', is_active: true },

  // الأصول الثابتة
  { code: '11', name: 'الأصول الثابتة', type: AccountType.ASSET, is_group: true, parent_account: '1', is_active: true },
  { code: '111', name: 'المباني والإنشاءات', type: AccountType.ASSET, is_group: false, parent_account: '11', is_active: true },
  { code: '112', name: 'السيارات ووسائل النقل', type: AccountType.ASSET, is_group: false, parent_account: '11', is_active: true },
  { code: '113', name: 'الأثاث والمفروشات', type: AccountType.ASSET, is_group: false, parent_account: '11', is_active: true },
  { code: '114', name: 'أجهزة ومعدات', type: AccountType.ASSET, is_group: false, parent_account: '11', is_active: true },
  { code: '11201', name: 'مجمع الإهلاك', type: AccountType.ASSET, is_group: false, parent_account: '11', is_active: true }, // يظهر بالسالب عادة

  // --- الخصوم (Liabilities) ---
  { code: '2', name: 'الخصوم', type: AccountType.LIABILITY, is_group: true, is_active: true },
  
  { code: '201', name: 'الموردين', type: AccountType.LIABILITY, is_group: false, parent_account: '2', is_active: true },
  { code: '202', name: 'ضريبة القيمة المضافة', type: AccountType.LIABILITY, is_group: false, parent_account: '2', is_active: true },
  { code: '203', name: 'تأمينات العملاء', type: AccountType.LIABILITY, is_group: false, parent_account: '2', is_active: true },
  { code: '204', name: 'أوراق الدفع', type: AccountType.LIABILITY, is_group: false, parent_account: '2', is_active: true },
  { code: '205', name: 'مصروفات مستحقة', type: AccountType.LIABILITY, is_group: false, parent_account: '2', is_active: true },

  // --- حقوق الملكية (Equity) ---
  { code: '3', name: 'حقوق الملكية', type: AccountType.EQUITY, is_group: true, is_active: true },
  { code: '301', name: 'رأس المال', type: AccountType.EQUITY, is_group: false, parent_account: '3', is_active: true },
  { code: '302', name: 'الأرباح المبقاة', type: AccountType.EQUITY, is_group: false, parent_account: '3', is_active: true },
  { code: '303', name: 'جاري المالك', type: AccountType.EQUITY, is_group: false, parent_account: '3', is_active: true },

  // --- الإيرادات (Revenue) ---
  { code: '4', name: 'الإيرادات', type: AccountType.REVENUE, is_group: true, is_active: true },
  { code: '401', name: 'إيرادات المبيعات', type: AccountType.REVENUE, is_group: false, parent_account: '4', is_active: true },
  { code: '402', name: 'إيرادات أخرى', type: AccountType.REVENUE, is_group: false, parent_account: '4', is_active: true },
  { code: '403', name: 'خصم مسموح به', type: AccountType.REVENUE, is_group: false, parent_account: '4', is_active: true }, // يخصم من الإيراد

  // --- المصروفات (Expenses) ---
  { code: '5', name: 'المصروفات', type: AccountType.EXPENSE, is_group: true, is_active: true },
  { code: '501', name: 'تكلفة البضاعة المباعة', type: AccountType.EXPENSE, is_group: false, parent_account: '5', is_active: true },
  { code: '502', name: 'الرواتب والأجور', type: AccountType.EXPENSE, is_group: false, parent_account: '5', is_active: true },
  { code: '503', name: 'الإيجارات', type: AccountType.EXPENSE, is_group: false, parent_account: '5', is_active: true },
  { code: '504', name: 'الكهرباء والمياه', type: AccountType.EXPENSE, is_group: false, parent_account: '5', is_active: true },
  { code: '505', name: 'مصروفات تسويق', type: AccountType.EXPENSE, is_group: false, parent_account: '5', is_active: true },
  { code: '506', name: 'مصروفات صيانة', type: AccountType.EXPENSE, is_group: false, parent_account: '5', is_active: true },
  { code: '507', name: 'مصروف الإهلاك', type: AccountType.EXPENSE, is_group: false, parent_account: '5', is_active: true },
  { code: '508', name: 'مصروفات بنكية', type: AccountType.EXPENSE, is_group: false, parent_account: '5', is_active: true },
  { code: '509', name: 'خصم مكتسب', type: AccountType.EXPENSE, is_group: false, parent_account: '5', is_active: true }, // يخصم من المصروف
];

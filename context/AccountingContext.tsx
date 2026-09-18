import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '../supabaseClient';
import { useAuth } from '../context/AuthContext';
import { Account, JournalEntry, JournalEntryLine, SystemSettings, UserRole, Organization, HrScope } from '../types';
import { useToast } from '../context/ToastContext';
import { secureStorage } from '../utils/securityMiddleware';

export interface UserProfile {
  id: string;
  full_name: string | null;
  role: UserRole;
  organization_id: string | null;
  is_active: boolean;
  avatar_url?: string;
  hr_scope?: HrScope;
}


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

import { offlineService } from '../services/offlineService';

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
    const raw = localStorage.getItem('tripro_offline_table_orders');
    return raw ? JSON.parse(raw) : {};
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
    localStorage.setItem('tripro_offline_table_orders', JSON.stringify(all));
  } catch (e) {
    console.warn('LocalStorage error:', e);
  }
};

interface AccountingContextType {
  organization: any;
  currentUser: UserProfile | null;
  organizations: any[];
  currentSelectedOrgId: string | null;
  setCurrentSelectedOrgId: (id: string | null) => void;
  isLoading: boolean;
  settings: any;
  accounts: any[];
  entries: any[];
  assets: any[];
  budgets: any[];
  vouchers: any[];
  costCenters: any[];
  employees: any[];
  products: any[];
  transfers: any[];
  purchaseInvoices: any[];
  lastUpdated: Date | null;
  invoices: any[];
  salespeople: any[];
  categories: any[];
  users: any[];
  warehouses: any[];
  restaurantTables: any[];
  menuCategories: any[];
  customers: any[];
  suppliers: any[];
  cheques: any[];
  currentShift: any;
  activityLog: any[];
  refreshData: () => Promise<void>;
  fetchEntriesPaged: (page: number, pageSize: number) => Promise<{ data: any[], count: number }>;

  isDemo: boolean;
  clearCache: () => void;
  getFinancialSummary: () => Promise<any>;
  // --- دالة الصلاحيات ---
  can: (module: string, action: string) => boolean;
  // --- الدوال المحاسبية ---
  addEntry: (entry: any) => Promise<void>;
  getSystemAccount: (key: string) => any;
  updateVoucher: (id: string, updates: any) => Promise<boolean>;
  getAccountBalanceInPeriod: (id: string, start: string, end: string) => Promise<number>;
  addAccount: (acc: any) => Promise<any>;
  updateAccount: (id: string, updates: any) => Promise<void>;
  deleteAccount: (id: string, reason?: string) => Promise<{ success: boolean; message?: string }>;
  clearTransactions: () => Promise<void>;
  emptyRecycleBin: (table: string) => Promise<void>;
  saveBudget: (budget: any) => Promise<void>;
  // --- دوال المخزون ---
  recalculateStock: (productId?: string) => Promise<void>;
  addProduct: (product: any) => Promise<any>;
  updateProduct: (id: string, updates: any) => Promise<void>;
  deleteProduct: (id: string, reason?: string) => Promise<void>;
  addStockTransfer: (transfer: any) => Promise<void>;
  approveStockTransfer: (id: string) => Promise<void>;
  cancelStockTransfer: (id: string) => Promise<void>;
  addWarehouse: (warehouse: any) => Promise<void>;
  updateWarehouse: (id: string, updates: any) => Promise<void>;
  deleteWarehouse: (id: string) => Promise<void>;
  addWastage: (wastage: any) => Promise<boolean>;
  produceItem: (id: string, qty: number, whId: string, date: string, cost: number, ref: string) => Promise<any>;
  // --- دوال المبيعات والمشتريات ---
  addCustomer: (customer: any) => Promise<any>;
  updateCustomer: (id: string, updates: any) => Promise<void>;
  deleteCustomer: (id: string, reason?: string) => Promise<void>;
  addSupplier: (supplier: any) => Promise<any>;
  updateSupplier: (id: string, updates: any) => Promise<void>;
  deleteSupplier: (id: string, reason?: string) => Promise<void>;
  approveInvoice: (id: string, orgId?: string, warehouseId?: string) => Promise<boolean>;
  unpostSalesInvoice: (id: string, orgId?: string) => Promise<boolean>;
  deleteSalesInvoice: (id: string, orgId?: string) => Promise<boolean>;
  approvePurchaseInvoice: (id: string, orgId?: string, warehouseId?: string) => Promise<void>;
  unpostPurchaseInvoice: (id: string, orgId?: string) => Promise<boolean>;
  deletePurchaseInvoice: (id: string, orgId?: string) => Promise<boolean>;
  convertPoToInvoice: (poId: string, warehouseId?: string, orgId?: string) => Promise<void>;
  addOpeningBalanceTransaction: (id: string, type: string, amount: number, date: string, name: string) => Promise<void>;
  addPaymentVoucher: (voucher: any) => Promise<void>;
  // --- دوال الأصول والشيكات ---
  addAsset: (asset: any) => Promise<void>;
  updateAsset: (id: string, updates: any) => Promise<void>;
  deleteAsset: (id: string) => Promise<void>;
  runDepreciation: (id?: string, amount?: number, date?: string) => Promise<void>;
  revaluateAsset: (id: string, val: number, date: string, accId: string) => Promise<void>;
  addCheque: (cheque: any) => Promise<void>;
  updateCheque: (id: string, cheque: any) => Promise<void>;
  deleteCheque: (id: string) => Promise<void>;
  updateChequeStatus: (id: string, status: string, date: string, bankId?: string) => Promise<void>;
  addTransfer: (transfer: any) => Promise<void>;
  updateTransfer: (id: string, transfer: any) => Promise<void>;
  deleteTransfer: (id: string) => Promise<void>;
  restoreItem: (table: string, id: string) => Promise<{ success: boolean; message?: string }>;
  permanentDeleteItem: (table: string, id: string) => Promise<{ success: boolean; message?: string }>;
  exportJournalToCSV: () => void;
  // --- دوال الموارد البشرية ---
  addEmployee: (employee: any) => Promise<void>;
  updateEmployee: (id: string, updates: any) => Promise<void>;
  deleteEmployee: (id: string, reason?: string) => Promise<void>;
  runPayroll: (month: number, year: number, date: string, treasuryId: string, data: any[], orgId?: string) => Promise<void>;
  // --- دوال المطاعم ---
  finalizeProductionOrder: (id: string, status: string, notes: string) => Promise<any>;
  openTableSession: (tableId: string) => Promise<string | null>;
  reserveTable: (tableId: string, name: string, time: string) => Promise<boolean>;
  cancelReservation: (tableId: string) => Promise<void>;
  transferTableSession: (sessionId: string, targetTableId: string) => Promise<boolean>;
  mergeTableSessions: (sourceId: string, targetId: string) => Promise<boolean>;
  createRestaurantOrder: (payload: any) => Promise<string>;
  getOpenTableOrder: (tableId: string) => Promise<any>;
  completeRestaurantOrder: (orderId: string, method: string, total: number, accountId: string | null, warehouseId?: string) => Promise<void>;
  processSplitPayment: (orderId: string, items: any[], method: string, total: number, accountId: string) => Promise<boolean>;
  addRestaurantTable: (data: any) => Promise<void>;
  updateRestaurantTable: (id: string, data: any) => Promise<void>;
  deleteRestaurantTable: (id: string) => Promise<void>;
  updateKitchenOrderStatus: (id: string, status: string) => Promise<void>;
  startShift: (amount: number) => Promise<void>;
  closeCurrentShift: (actualCash: number, notes: string) => Promise<void>;
  getCurrentShiftSummary: () => Promise<any>;
  createMissingSystemAccounts: () => Promise<any>;
  recalculateAllBalances: () => Promise<void>;
  purgeDeletedRecords: () => Promise<void>;
  refreshSaasSchema: () => Promise<void>;
  closeFinancialYear: (year: number, date: string) => Promise<boolean>;
  reopenFinancialYear: (year: number) => Promise<boolean>;
  exportData: () => Promise<void>;
  // --- دوال الديمو ---
  addDemoEntry: (entry: any) => void;
  addDemoPaymentVoucher: (voucher: any) => void;
  addDemoReceiptVoucher: (voucher: any) => void;
  addDemoInvoice: (invoice: any) => void;
  postDemoSalesInvoice: (invoice: any) => void;
  addDemoPurchaseInvoice: (invoice: any) => void;
  deleteOrganization: (orgId: string) => Promise<{ success: boolean; message?: string }>;
  selectedFiscalYear: number;
  setSelectedFiscalYear: (year: number) => void;
  fiscalYearRange: { startDate: string; endDate: string };
}

const AccountingContext = createContext<AccountingContextType | undefined>(undefined);

export const useAccounting = () => {
  const context = useContext(AccountingContext);
  if (!context) throw new Error('useAccounting must be used within an AccountingProvider');
  return context;
};

// --- Modular Domain Hooks (Facade Pattern) ---
export { useProductDomain } from './domains/ProductContext';
export { useCustomerDomain } from './domains/CustomerContext';
export { useSupplierDomain } from './domains/SupplierContext';
export { useSettingsDomain } from './domains/AccountingSettingsContext';
export { useSalesDomain } from './domains/SalesContext';
export { useBankingDomain } from './domains/BankingContext';
export { useGeneralLedgerDomain } from './domains/GeneralLedgerContext';

/**
 * دالة مساعدة عامة لجلب كافة سجلات الجداول الكبيرة التي تتجاوز حد 1000 سجل في Supabase/PostgREST
 */
async function fetchAllTableRecords<T = any>(
  tableName: string,
  filterFn: (query: any) => any,
  pageSize = 1000
): Promise<{ data: T[]; error: any }> {
  let allData: T[] = [];
  let from = 0;
  let hasMore = true;

  while (hasMore) {
    let query = supabase.from(tableName).select('*');
    query = filterFn(query);
    const { data, error } = await query.range(from, from + pageSize - 1);

    if (error) {
      console.error(`Error fetching ${tableName} chunk:`, error);
      return { data: allData, error };
    }

    if (data && data.length > 0) {
      allData = allData.concat(data as T[]);
      if (data.length < pageSize) {
        hasMore = false;
      } else {
        from += pageSize;
      }
    } else {
      hasMore = false;
    }
  }

  return { data: allData, error: null };
}

export const AccountingProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { currentUser: authUser, can } = useAuth();
  const { showToast } = useToast();
  const [organization, setOrganization] = useState<any>(null);
  const [currentSelectedOrgId, setCurrentSelectedOrgIdState] = useState<string | null>(() => {
    return secureStorage.getItem<string>('tripro_active_org_id') || null;
  });

  const setCurrentSelectedOrgId = useCallback((id: string | null) => {
    setCurrentSelectedOrgIdState(id);
    if (id) {
      secureStorage.setItem('tripro_active_org_id', id);
      if (id !== 'org-default-offline' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
        secureStorage.setItem('tripro_last_valid_org_id', id);
        try { window.localStorage?.setItem('tripro_last_valid_org_id', JSON.stringify(id)); } catch (e) {}
      }
    } else {
      secureStorage.removeItem('tripro_active_org_id');
    }
  }, []);

  const [organizations, setOrganizations] = useState<any[]>([]);
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(() => {
    const cachedLastOrg = secureStorage.getItem<string>('tripro_last_valid_org_id') || null;
    if (authUser) {
      return {
        id: authUser.id,
        full_name: authUser.name || 'مستخدم النظام',
        role: authUser.role as UserRole,
        organization_id: (authUser as any).organization_id || cachedLastOrg || 'org-default-offline',
        is_active: true
      };
    }
    return null;
  });

  useEffect(() => {
    const cachedLastOrg = secureStorage.getItem<string>('tripro_last_valid_org_id') || null;
    if (authUser && (!currentUser || currentUser.id !== authUser.id)) {
      setCurrentUser({
        id: authUser.id,
        full_name: authUser.name || 'مستخدم النظام',
        role: authUser.role as UserRole,
        organization_id: (authUser as any).organization_id || cachedLastOrg || 'org-default-offline',
        is_active: true
      });
    }
  }, [authUser]);

  const getEffectiveOrgId = useCallback(() => {
    const cachedValidOrg = secureStorage.getItem<string>('tripro_last_valid_org_id') || 
      (typeof window !== 'undefined' ? window.localStorage?.getItem('tripro_last_valid_org_id') : null);
    if (currentSelectedOrgId && currentSelectedOrgId !== 'org-default-offline') return currentSelectedOrgId;
    if (currentUser?.organization_id && currentUser.organization_id !== 'org-default-offline') return currentUser.organization_id;
    if (cachedValidOrg && cachedValidOrg !== 'org-default-offline') return cachedValidOrg;
    return 'org-default-offline';
  }, [currentSelectedOrgId, currentUser?.organization_id]);

  const [isLoading, setIsLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [settings, setSettings] = useState<any>({});
  const [selectedFiscalYear, setSelectedFiscalYearState] = useState<number>(() => {
    const saved = secureStorage.getItem<string | number>('tripro_selected_fiscal_year');
    if (saved) {
      const parsed = typeof saved === 'number' ? saved : parseInt(saved, 10);
      if (!isNaN(parsed) && parsed >= 2000 && parsed <= 2099) return parsed;
    }
    return new Date().getFullYear();
  });

  const setSelectedFiscalYear = (year: number) => {
    setSelectedFiscalYearState(year);
    secureStorage.setItem('tripro_selected_fiscal_year', year);
  };

  const fiscalYearRange = useMemo(() => ({
    startDate: `${selectedFiscalYear}-01-01`,
    endDate: `${selectedFiscalYear}-12-31`
  }), [selectedFiscalYear]);

  // 🛡️ عزل تام لبيانات المنظمات: تنظيف المفاتيح القديمة غير المعزولة لمنع تسريب العروض والكوبونات بين الشركات
  useEffect(() => {
    secureStorage.removeItem('tripro_promos_active');
    secureStorage.removeItem('tripro_retail_coupons');
  }, [currentSelectedOrgId]);
  const [accounts, setAccounts] = useState<any[]>([]);
  const [entries, setEntries] = useState<any[]>([]);
  const [assets, setAssets] = useState<any[]>([]);
  const [budgets, setBudgets] = useState<any[]>([]);
  const [vouchers, setVouchers] = useState<any[]>([]);
  const [costCenters, setCostCenters] = useState<any[]>([]);
  const [employees, setEmployees] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [transfers, setTransfers] = useState<any[]>([]);
  const [purchaseInvoices, setPurchaseInvoices] = useState<any[]>([]);
  const [invoices, setInvoices] = useState<any[]>([]);
  const [salespeople, setSalespeople] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [warehouses, setWarehouses] = useState<any[]>([]);
  const [restaurantTables, setRestaurantTables] = useState<any[]>([]);
  const [menuCategories, setMenuCategories] = useState<any[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [cheques, setCheques] = useState<any[]>([]);
  const [currentShift, setCurrentShift] = useState<any>(null);
  const [activityLog, setActivityLog] = useState<any[]>([]);

  const isDemo = authUser?.username === 'demo@demo.com' || authUser?.role === 'demo';

  // دالة مساعدة لتحميل بيانات الأوفلاين والديمو بسلاسة فائقة
  const loadOfflineFallbackData = useCallback(async () => {
    const cachedValidOrg = secureStorage.getItem<string>('tripro_last_valid_org_id') || 
      (typeof window !== 'undefined' ? window.localStorage?.getItem('tripro_last_valid_org_id') : null) ||
      ((currentSelectedOrgId && currentSelectedOrgId !== 'org-default-offline') ? currentSelectedOrgId : null);
    
    const effectiveOfflineOrgId = cachedValidOrg || DEFAULT_OFFLINE_ORG.id;
    const effectiveOrgObj = cachedValidOrg ? { ...DEFAULT_OFFLINE_ORG, id: cachedValidOrg } : DEFAULT_OFFLINE_ORG;

    const fallbackProfile: UserProfile = {
      id: authUser?.id || 'demo-user-id',
      full_name: authUser?.name || 'مستخدم تجريبي (TriPro Offline)',
      role: (authUser?.role as UserRole) || 'demo',
      organization_id: effectiveOfflineOrgId,
      is_active: true
    };
    setCurrentUser(fallbackProfile);
    setOrganization(effectiveOrgObj);
    setOrganizations([effectiveOrgObj]);
    setCurrentSelectedOrgId(effectiveOfflineOrgId);
    setAccounts(DEFAULT_OFFLINE_ACCOUNTS);
    setProducts(DEFAULT_OFFLINE_PRODUCTS);
    setRestaurantTables(DEFAULT_OFFLINE_TABLES);
    setMenuCategories(DEFAULT_OFFLINE_CATEGORIES);
    setCategories(DEFAULT_OFFLINE_CATEGORIES);
    setWarehouses(DEFAULT_OFFLINE_WAREHOUSES);
    setCustomers([{ id: 'cust-walkin', name: 'عميل نقدي صالة', phone: '0000000000' }]);
    setSuppliers([{ id: 'sup-main', name: 'مورد عام معتمد', phone: '01000000000' }]);

    // استرجاع الوردية المفتوحة محلياً أو إنشاء وردية جاهزة للعمل
    let localShift = null;
    try {
      const savedShift = localStorage.getItem('tripro_offline_current_shift');
      if (savedShift) localShift = JSON.parse(savedShift);
    } catch (e) {}

    if (!localShift) {
      localShift = {
        id: 'shift-offline-' + (authUser?.id || 'demo'),
        shift_number: 'SHIFT-001',
        user_id: authUser?.id || 'demo-user',
        cashier_id: authUser?.id || 'demo-user',
        opening_balance: 500,
        status: 'OPEN',
        start_time: new Date().toISOString()
      };
      try {
        localStorage.setItem('tripro_offline_current_shift', JSON.stringify(localShift));
      } catch (e) {}
    }
    setCurrentShift(localShift);

    // زراعة المنتجات في قاعدة IndexedDB المحلية ليعمل كود الباركود والبحث الفوري بالتجزئة
    await offlineService.seedFallbackProducts(DEFAULT_OFFLINE_PRODUCTS);
    setLastUpdated(new Date());
    setIsLoading(false);
  }, [authUser]);

  const refreshData = useCallback(async () => {
    if (!authUser) return;
    setIsLoading(true);

    // 📴 إذا كان التطبيق مفصولاً عن الإنترنت أو في وضع الديمو، ننتقل فوراً للبيانات المحلية بدون أي تأخير أو أخطاء
    if (!navigator.onLine || isDemo) {
      await loadOfflineFallbackData();
      return;
    }

    try {
      // جلب بيانات المنظمة والبروفايل
      let profile: any = null;
      try {
        const { data: pData, error: profileError } = await supabase.from('profiles').select('*, organizations(*)').eq('id', authUser.id).single();
        if (!profileError && pData) {
          profile = pData;
          setCurrentUser(profile);
        }
      } catch (pErr) {
        console.warn('Could not fetch online profile, using fallback:', pErr);
      }

      if (!profile) {
        await loadOfflineFallbackData();
        return;
      }

      // 🛡️ صمام أمان: جلب كافة الشركات لملء القائمة وضمان وجود منظمة نشطة حتمياً
      let allOrgs: any[] = [];
      try {
        const { data: orgsData } = await supabase.from('organizations').select('*').order('name');
        if (orgsData && orgsData.length > 0) {
          allOrgs = orgsData;
        }
      } catch (orgErr) {
        console.warn('Could not fetch organizations from Supabase, using fallback:', orgErr);
      }

      const validOrgs = allOrgs.length > 0 ? allOrgs : [DEFAULT_OFFLINE_ORG];
      setOrganizations(validOrgs);

      // تحديد معرف المنظمة النشطة مع اختيار تلقائي حتمي يمنع التوقف تماماً
      let fetchOrgId = currentSelectedOrgId || profile.organization_id;
      if (!fetchOrgId || !validOrgs.some(o => o.id === fetchOrgId)) {
        fetchOrgId = validOrgs[0].id;
        setCurrentSelectedOrgId(fetchOrgId);
      }

      // تحديث كائن المنظمة ليتوافق مع المنظمة النشطة
      const activeOrgObj = validOrgs.find(o => o.id === fetchOrgId) || profile.organizations || DEFAULT_OFFLINE_ORG;
      setOrganization(activeOrgObj);

      // تأكيد تعيين المنظمة في بيانات المستخدم لمنع أخطاء التريجرز والـ RLS
      setCurrentUser(prev => prev ? { ...prev, organization_id: fetchOrgId } : {
        id: authUser.id,
        full_name: authUser.name || 'مستخدم النظام',
        role: authUser.role as UserRole,
        organization_id: fetchOrgId,
        is_active: true
      });

      // جلب الإعدادات وتوحيد الحقول
      const { data: sett } = await supabase.rpc('get_current_company_settings', { p_org_id: fetchOrgId }).maybeSingle();
      
      const normalizeSettings = (raw: any) => {
        if (!raw || typeof raw !== 'object') return {};
        
        let vatRateNum = 14;
        if (raw.vatRate !== undefined && raw.vatRate !== null) {
          vatRateNum = Number(raw.vatRate);
        } else if (raw.vat_rate !== undefined && raw.vat_rate !== null) {
          vatRateNum = Number(raw.vat_rate);
        }
        
        const vatRatePercentage = vatRateNum <= 1 ? vatRateNum * 100 : vatRateNum;
        const vatRateDecimal = vatRatePercentage / 100;

        const isTaxEnabled = raw.enableTax !== undefined 
          ? Boolean(raw.enableTax) 
          : (raw.enable_tax !== undefined ? Boolean(raw.enable_tax) : true);

        const isServiceChargeEnabled = raw.enableServiceCharge !== undefined 
          ? Boolean(raw.enableServiceCharge) 
          : (raw.enable_service_charge !== undefined 
              ? Boolean(raw.enable_service_charge) 
              : (raw.account_mappings?.enable_service_charge !== undefined 
                  ? Boolean(raw.account_mappings.enable_service_charge) 
                  : false));

        let serviceRateNum = 12;
        if (raw.serviceChargeRate !== undefined && raw.serviceChargeRate !== null) {
          serviceRateNum = Number(raw.serviceChargeRate);
        } else if (raw.service_charge_rate !== undefined && raw.service_charge_rate !== null) {
          serviceRateNum = Number(raw.service_charge_rate);
        } else if (raw.account_mappings?.service_charge_rate !== undefined && raw.account_mappings?.service_charge_rate !== null) {
          serviceRateNum = Number(raw.account_mappings.service_charge_rate);
        }
        const serviceChargeRatePercentage = serviceRateNum <= 1 && serviceRateNum > 0 ? serviceRateNum * 100 : serviceRateNum;
        const serviceChargeRateDecimal = serviceChargeRatePercentage / 100;

        const allowNegativeStock = raw.allowNegativeStock !== undefined 
          ? Boolean(raw.allowNegativeStock) 
          : (raw.allow_negative_stock !== undefined ? Boolean(raw.allow_negative_stock) : false);

        const lockManualPrices = raw.lockManualPrices !== undefined
          ? Boolean(raw.lockManualPrices)
          : (raw.lock_manual_prices !== undefined ? Boolean(raw.lock_manual_prices) : false);

        const maxCashDeficitLimit = raw.maxCashDeficitLimit !== undefined && raw.maxCashDeficitLimit !== null
          ? Number(raw.maxCashDeficitLimit)
          : (raw.max_cash_deficit_limit !== undefined && raw.max_cash_deficit_limit !== null ? Number(raw.max_cash_deficit_limit) : 50);

        const decimalPlaces = raw.decimalPlaces !== undefined && raw.decimalPlaces !== null
          ? Number(raw.decimalPlaces)
          : (raw.decimal_places !== undefined && raw.decimal_places !== null ? Number(raw.decimal_places) : 2);

        const currency = raw.currency || 'EGP';

        return {
          ...raw,
          currency,
          enableTax: isTaxEnabled,
          enable_tax: isTaxEnabled,
          vatRate: vatRatePercentage,
          vat_rate: vatRateDecimal,
          enableServiceCharge: isServiceChargeEnabled,
          enable_service_charge: isServiceChargeEnabled,
          serviceChargeRate: serviceChargeRatePercentage,
          service_charge_rate: serviceChargeRateDecimal,
          allowNegativeStock,
          allow_negative_stock: allowNegativeStock,
          lockManualPrices,
          lock_manual_prices: lockManualPrices,
          maxCashDeficitLimit,
          max_cash_deficit_limit: maxCashDeficitLimit,
          decimalPlaces,
          decimal_places: decimalPlaces,
          defaultWarehouseId: raw.defaultWarehouseId || raw.default_warehouse_id || '',
          default_warehouse_id: raw.default_warehouse_id || raw.defaultWarehouseId || '',
          defaultTreasuryId: raw.defaultTreasuryId || raw.default_treasury_id || '',
          default_treasury_id: raw.default_treasury_id || raw.defaultTreasuryId || '',
          productionWarehouseId: raw.productionWarehouseId || raw.production_warehouse_id || '',
          production_warehouse_id: raw.production_warehouse_id || raw.productionWarehouseId || '',
          rawMaterialsWarehouseId: raw.rawMaterialsWarehouseId || raw.raw_material_warehouse_id || '',
          raw_material_warehouse_id: raw.raw_material_warehouse_id || raw.rawMaterialsWarehouseId || '',
          accountMappings: raw.accountMappings || raw.account_mappings || {},
          lastClosedYear: raw.lastClosedYear !== undefined && raw.lastClosedYear !== null ? Number(raw.lastClosedYear) : (raw.last_closed_year !== undefined && raw.last_closed_year !== null ? Number(raw.last_closed_year) : null),
          last_closed_year: raw.last_closed_year !== undefined && raw.last_closed_year !== null ? Number(raw.last_closed_year) : (raw.lastClosedYear !== undefined && raw.lastClosedYear !== null ? Number(raw.lastClosedYear) : null),
          lastClosedDate: raw.lastClosedDate || raw.last_closed_date || null,
          last_closed_date: raw.last_closed_date || raw.lastClosedDate || null
        };
      };

      setSettings(normalizeSettings(sett || {}));

      // جلب الحسابات والمستودعات مع ترشيد الاستعلامات المالية بالسنة المالية النشطة
      const [accs, ents, ccs, emps, prods, trns, pinvs, invs, cats, usrs, whs, rTables, custs, sups, chqs, shift, assetData, budgetData] = await Promise.all([
        supabase.from('accounts').select('*').eq('organization_id', fetchOrgId).order('code'),
        supabase.from('journal_entries')
          .select('*, journal_lines(*)')
          .eq('organization_id', fetchOrgId)
          .gte('transaction_date', fiscalYearRange.startDate)
          .lte('transaction_date', fiscalYearRange.endDate)
          .order('transaction_date', { ascending: false })
          .limit(1000),
        supabase.from('cost_centers').select('*').eq('organization_id', fetchOrgId).order('name'),
        supabase.from('employees').select('*').eq('organization_id', fetchOrgId).order('full_name'),
        fetchAllTableRecords('products', q => q.eq('organization_id', fetchOrgId).is('deleted_at', null).order('name')),
        supabase.from('stock_transfers').select('*').eq('organization_id', fetchOrgId).order('transfer_date', { ascending: false }).limit(500),
        supabase.from('purchase_invoices')
          .select('*')
          .eq('organization_id', fetchOrgId)
          .gte('invoice_date', fiscalYearRange.startDate)
          .lte('invoice_date', fiscalYearRange.endDate)
          .order('invoice_date', { ascending: false })
          .limit(1000),
        supabase.from('invoices')
          .select('*')
          .eq('organization_id', fetchOrgId)
          .gte('invoice_date', fiscalYearRange.startDate)
          .lte('invoice_date', fiscalYearRange.endDate)
          .order('invoice_date', { ascending: false })
          .limit(1000),
        supabase.from('item_categories').select('*').eq('organization_id', fetchOrgId).order('name'),
        supabase.from('profiles').select('*').eq('organization_id', fetchOrgId).order('full_name'),
        supabase.from('warehouses').select('*').eq('organization_id', fetchOrgId).eq('is_active', true),
        supabase.from('restaurant_tables').select('*').eq('organization_id', fetchOrgId).order('name'),
        fetchAllTableRecords('customers', q => q.eq('organization_id', fetchOrgId).is('deleted_at', null).order('name')),
        fetchAllTableRecords('suppliers', q => q.eq('organization_id', fetchOrgId).is('deleted_at', null).order('name')),
        supabase.from('cheques').select('*').eq('organization_id', fetchOrgId).order('due_date'),
        supabase.rpc('get_active_shift', { p_org_id: fetchOrgId }),
        supabase.from('assets').select('*').eq('organization_id', fetchOrgId).is('deleted_at', null),
        supabase.from('budgets').select('*').eq('organization_id', fetchOrgId)
      ]);

      const loadedAccounts = (accs.data && accs.data.length > 0) ? accs.data.map((acc: any) => ({
        ...acc,
        type: acc.type ? acc.type.toUpperCase() : acc.type
      })) : DEFAULT_OFFLINE_ACCOUNTS;

      setAccounts(loadedAccounts);
      setEntries(ents.data || []);
      setAssets(assetData?.data || []);
      setBudgets(budgetData?.data || []);
      setVouchers([]);
      setCostCenters(ccs.data || []);

      // 🛡️ عزل نطاق الإشراف للموارد البشرية والرواتب (HR Supervisory Scope)
      const rawEmployees = emps.data || [];
      const userHrScope = (profile as any)?.hr_scope || (authUser as any)?.hr_scope || (authUser as any)?.user_metadata?.hr_scope || 'all';

      const isFactoryDept = (dept: any) => {
        const d = String(dept || '').trim().toLowerCase();
        return d === 'المصنع' || d === 'مصنع' || d === 'factory';
      };

      let scopedEmployees = rawEmployees;
      if (userHrScope === 'factory') {
        scopedEmployees = rawEmployees.filter((e: any) => isFactoryDept(e.department));
      } else if (userHrScope === 'branches') {
        scopedEmployees = rawEmployees.filter((e: any) => !isFactoryDept(e.department));
      }

      setEmployees(scopedEmployees);
      setSalespeople(scopedEmployees);

      const loadedProducts = (prods.data && prods.data.length > 0) ? prods.data : DEFAULT_OFFLINE_PRODUCTS;
      setProducts(loadedProducts);
      setTransfers(trns.data || []);
      setPurchaseInvoices(pinvs.data || []);
      setInvoices(invs.data || []);

      const loadedCategories = (cats.data && cats.data.length > 0) ? cats.data : DEFAULT_OFFLINE_CATEGORIES;
      setCategories(loadedCategories);
      setMenuCategories(loadedCategories);

      setUsers(usrs.data || []);
      setWarehouses((whs.data && whs.data.length > 0) ? whs.data : DEFAULT_OFFLINE_WAREHOUSES);

      const loadedTables = (rTables.data && rTables.data.length > 0) ? rTables.data : DEFAULT_OFFLINE_TABLES;
      setRestaurantTables(loadedTables);

      setCustomers((custs.data && custs.data.length > 0) ? custs.data : [{ id: 'cust-walkin', name: 'عميل نقدي صالة', phone: '0000000000' }]);
      setSuppliers((sups.data && sups.data.length > 0) ? sups.data : [{ id: 'sup-main', name: 'مورد عام معتمد', phone: '01000000000' }]);
      setCheques(chqs.data || []);
      
      const activeShiftData = Array.isArray(shift.data) ? shift.data[0] : shift.data;
      if (activeShiftData && activeShiftData.id) {
        setCurrentShift(activeShiftData);
      } else {
        // إذا لم تكن هناك وردية نشطة أونلاين، نحتفظ بالوردية المحلية إن وجدت
        let localShift = null;
        try {
          const s = localStorage.getItem('tripro_offline_current_shift');
          if (s) localShift = JSON.parse(s);
        } catch (e) {}
        setCurrentShift(localShift || null);
      }
      setLastUpdated(new Date());

      // مزامنة المنتجات محلياً في الخلفية لدعم وضع الأوفلاين مستقبلاً
      offlineService.seedFallbackProducts(loadedProducts).catch(() => {});

    } catch (error) {
      if (import.meta.env.DEV) console.error('Error refreshing accounting data, loading offline fallback:', error);
      await loadOfflineFallbackData();
    } finally {
      setIsLoading(false);
    }
  }, [authUser, currentSelectedOrgId, fiscalYearRange, isDemo, loadOfflineFallbackData]);

  useEffect(() => {
    refreshData();
  }, [refreshData]);

  // --- تنفيذ الدوال المطلوبة (RPC Wrappers) ---
  const clearCache = () => { window.location.reload(); };
  const getFinancialSummary = async () => { const { data } = await supabase.rpc('get_financial_summary', { p_org_id: currentSelectedOrgId }); return data; };
 
  const fetchEntriesPaged = useCallback(async (page: number, pageSize: number) => {
    const targetOrgId = currentSelectedOrgId || currentUser?.organization_id;
    if (!targetOrgId) return { data: [], count: 0 };

    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    const { data, count, error } = await supabase
      .from('journal_entries')
      .select('*, journal_lines(*)', { count: 'exact' })
      .eq('organization_id', targetOrgId)
      .order('transaction_date', { ascending: false })
      .range(from, to);

    if (error) {
      if (process.env.NODE_ENV === 'development') {
        console.error('Error fetching paged entries:', error);
      }
      return { data: [], count: 0 };
    }

    return { data: data || [], count: count || 0 };
  }, [currentSelectedOrgId, currentUser?.organization_id]); 
  const addEntry = async (entry: any) => {
    const targetOrgId = entry.p_org_id || entry.organization_id || currentSelectedOrgId || currentUser?.organization_id;
    const sanitizedLines = (entry.lines || [])
      .filter((l: any) => {
        const accId = l.accountId || l.account_id;
        return accId && typeof accId === 'string' && accId.trim() !== '' && (Number(l.debit) > 0 || Number(l.credit) > 0);
      })
      .map((l: any) => ({
        accountId: l.accountId || l.account_id,
        account_id: l.accountId || l.account_id,
        debit: Number(l.debit || 0),
        credit: Number(l.credit || 0),
        description: l.description || entry.description || ''
      }));

    if (sanitizedLines.length === 0) {
      console.warn('addEntry: No valid lines to post journal entry');
      return;
    }

    const payload: any = {
      date: entry.date || new Date().toISOString().split('T')[0],
      description: entry.description || null,
      reference: entry.reference || null,
      status: entry.status || 'posted',
      lines: sanitizedLines,
      p_org_id: targetOrgId
    };

    const { error } = await supabase.rpc('add_journal_entry', payload);
    if (error) throw error;
    refreshData();
  };
  const getSystemAccount = (key: string) => {
    const mappingId = settings.account_mappings?.[key];
    if (mappingId) return accounts.find(a => a.id === mappingId);
    const defaultCode = SYSTEM_ACCOUNTS[key as keyof typeof SYSTEM_ACCOUNTS];
    if (defaultCode) {
      const matchByExactCode = accounts.find(a => a.code === defaultCode);
      if (matchByExactCode) return matchByExactCode;
      const matchByPrefix = accounts.find(a => a.code?.startsWith(defaultCode));
      if (matchByPrefix) return matchByPrefix;
    }
    // Fallback by name and alternate standard codes
    if (key === 'CUSTOMERS' || key === 'AR' || key === 'CUSTOMER') {
      return accounts.find(a => a.name?.includes('العملاء') || a.name?.includes('عملاء') || a.name?.toLowerCase().includes('customer') || a.name?.toLowerCase().includes('receivable') || a.code === '1221' || a.code === '1103' || a.code === '121' || a.code?.startsWith('122') || a.code?.startsWith('1103'));
    }
    if (key === 'SUPPLIERS' || key === 'AP' || key === 'SUPPLIER') {
      return accounts.find(a => a.name?.includes('الموردين') || a.name?.includes('موردين') || a.name?.toLowerCase().includes('supplier') || a.name?.toLowerCase().includes('payable') || a.code === '201' || a.code === '2101' || a.code === '221' || a.code?.startsWith('201') || a.code?.startsWith('2101'));
    }
    if (key === 'CASH' || key === 'TREASURY') {
      return accounts.find(a => a.name?.includes('الخزينة') || a.name?.includes('النقدية') || a.name?.includes('الصندوق') || a.name?.toLowerCase().includes('cash') || a.code === '1231' || a.code === '10101' || a.code === '123' || a.code?.startsWith('1231') || a.code?.startsWith('10101'));
    }
    if (key === 'VAT' || key === 'VAT_OUTPUT') {
      return accounts.find(a => (a.name?.includes('القيمة المضافة') || a.name?.includes('ضريبة المبيعات') || a.code === '2231' || a.code === '2105' || a.code?.startsWith('2231')) && !a.name?.includes('مدخلات') && !a.name?.includes('مشتريات'));
    }
    if (key === 'VAT_INPUT') {
      return accounts.find(a => a.name?.includes('مدخلات') || a.name?.includes('مشتريات') || a.code === '1241' || a.code === '1105');
    }
    if (key === 'OPENING_BALANCES') {
      return accounts.find(a => a.name?.includes('أرصدة افتتاحية') || a.name?.includes('افتتاحي') || a.name?.includes('افتتاحية') || a.name?.toLowerCase().includes('opening') || a.code === '3999' || a.code === '313' || a.code?.startsWith('39') || a.code?.startsWith('300'));
    }
    if (key === 'INVENTORY_FINISHED_GOODS' || key === 'INVENTORY') {
      return accounts.find(a => a.code === '10302' || a.code === '1213' || a.code === '103' || a.code === '122' || a.code === '121' || a.name?.includes('بضائع بغرض البيع') || a.name?.includes('منتج تام') || a.name?.includes('تام الصنع') || a.name?.includes('المخزون') || a.name?.includes('مخزون'));
    }
    if (key === 'INVENTORY_RAW_MATERIALS') {
      return accounts.find(a => a.code === '10301' || a.code === '1211' || a.code === '103' || a.name?.includes('خامات') || a.name?.includes('مواد خام') || a.name?.includes('المخزون') || a.name?.includes('مخزون'));
    }
    if (key === 'COGS') {
      return accounts.find(a => a.code === '511' || a.code === '311' || a.code?.startsWith('51') || a.name?.includes('تكلفة المبيعات') || a.name?.includes('تكلفة البضاعة'));
    }
    if (key === 'SALES_REVENUE') {
      return accounts.find(a => a.code === '411' || a.code === '41' || a.code?.startsWith('41') || a.name?.includes('المبيعات') || a.name?.includes('إيراد المبيعات'));
    }
    if (key === 'NOTES_RECEIVABLE') {
      return accounts.find(a => a.name?.includes('أوراق القبض') || a.name?.includes('أوراق قبض') || a.name?.includes('شيكات واردة') || a.name?.includes('تحت التحصيل') || a.code === '1222' || a.code?.startsWith('10103') || a.code?.startsWith('1231'));
    }
    if (key === 'NOTES_PAYABLE') {
      return accounts.find(a => a.name?.includes('أوراق الدفع') || a.name?.includes('أوراق دفع') || a.name?.includes('شيكات صادرة') || a.code === '222' || a.code?.startsWith('20102') || a.code?.startsWith('2202'));
    }
    if (key === 'BANK_ACCOUNTS' || key === 'BANK_MAIN') {
      return accounts.find(a => a.name?.includes('بنك') || a.name?.toLowerCase().includes('bank') || a.code?.startsWith('1232') || a.code?.startsWith('10102'));
    }
    if (key === 'INVENTORY_ADJUSTMENTS' || key === 'WASTAGE_EXPENSE' || key === 'INVENTORY_REVALUATION') {
      return accounts.find(a => (a.code === '512' || a.code === '5121' || a.name?.includes('تسويات الجرد') || a.name?.includes('عجز المخزون') || a.name?.includes('الهالك والفاقد') || a.name?.includes('تكلفة الهالك')) && !a.name?.includes('ضريب') && !a.code?.startsWith('223') && !a.code?.startsWith('124'));
    }
    if (key === 'CASH_SHORTAGE') {
      return accounts.find(a => (a.code === '541' || a.name?.includes('عجز الصندوق') || a.name?.includes('عجز الخزينة')) && !a.name?.includes('ضريب') && !a.code?.startsWith('223'));
    }
    if (key === 'REVENUE_OTHER' || key === 'OTHER_REVENUE') {
      return accounts.find(a => (a.code === '421' || a.code === '441' || a.name?.includes('إيرادات متنوعة') || a.name?.includes('إيرادات أخرى')) && !a.name?.includes('ضريب'));
    }
    if (key === 'LETTER_OF_GUARANTEE_MARGIN') {
      return accounts.find(a =>
        a.code === '1248' ||
        a.code?.startsWith('1248') ||
        a.name?.includes('غطاء خطابات ضمان') ||
        a.name?.includes('غطاء خطابات الضمان') ||
        a.name?.includes('غطاء الضمان')
      );
    }
    if (key === 'LETTER_OF_CREDIT_GOODS') {
      return accounts.find(a =>
        a.code === '1246' ||
        a.code?.startsWith('1246') ||
        a.name?.includes('اعتمادات مستندية') ||
        a.name?.includes('اعتماد مستندي') ||
        a.name?.includes('خطابات اعتماد')
      );
    }
    return undefined;
  };
  const updateVoucher = async () => true;
  const getAccountBalanceInPeriod = async (id: string, start: string, end: string) => { 
    const { data } = await supabase.rpc('get_account_balance_in_period', { p_account_id: id, p_start_date: start, p_end_date: end, p_org_id: currentSelectedOrgId });
    return data || 0;
  };
  const addAccount = async (acc: any) => { 
    const targetOrgId = currentSelectedOrgId || currentUser?.organization_id;
    const { data, error } = await supabase.from('accounts').insert({ ...acc, organization_id: targetOrgId }).select().single(); 
    if (error) throw error;
    await refreshData(); return data; 
  };
  const updateAccount = async (id: string, updates: any) => { await supabase.from('accounts').update(updates).eq('id', id); refreshData(); };
  const deleteAccount = async (id: string, reason?: string) => { const { error } = await supabase.from('accounts').delete().eq('id', id); refreshData(); return { success: !error, message: error?.message }; };
  const clearTransactions = async () => { await supabase.rpc('clear_all_transactions'); refreshData(); };
  const emptyRecycleBin = async (table: string) => { await supabase.rpc('empty_recycle_bin', { p_table_name: table }); refreshData(); };
  const saveBudget = async (budget: any) => { 
    const { error } = await supabase.from('budgets').upsert(budget); 
    if (error) {
      showToast('فشل حفظ الموازنة: ' + error.message, 'error');
    } else {
      showToast('تم حفظ الموازنة بنجاح ✅', 'success');
      refreshData(); 
    }
  };
  // Inventory
  const recalculateStock = async (productId?: string) => { 
    const { error } = await supabase.rpc('recalculate_stock_rpc', { 
      p_product_id: productId || null, 
      p_org_id: currentSelectedOrgId || currentUser?.organization_id || null 
    }); 
        if (error) {
      showToast('فشل إعادة حساب المخزون: ' + error.message, 'error');
    } else {
      showToast('تم تحديث المخزون بنجاح ✅', 'success');
      await refreshData(); // 🚀 الانتظار ضروري لتحديث الحالة قبل إغلاق اللودر في الواجهة
    }
  };  const addProduct = async (data: any) => { 
    const targetOrgId = currentSelectedOrgId || currentUser?.organization_id;
    const payload = { ...data, organization_id: targetOrgId };
    
    // إزالة الحقول غير الموجودة في جدول الأصناف بقاعدة البيانات
    const firstProd = products.length > 0 ? products[0] : null;
    if (firstProd) {
      if (!('supplier_id' in firstProd)) delete payload.supplier_id;
      if (!('egs_code' in firstProd)) delete payload.egs_code;
      if (!('item_code_type' in firstProd)) delete payload.item_code_type;
      if (!('eta_unit_code' in firstProd)) delete payload.eta_unit_code;
    }

    let p: any = null;
    let error: any = null;

    // محاولة الإدخال مع معالجة ديناميكية لأي عمود مفقود من قاعدة البيانات
    for (let attempt = 0; attempt < 5; attempt++) {
      const res = await supabase.from('products').insert(payload).select().single();
      p = res.data;
      error = res.error;
      if (!error) break;

      if (error.code === 'PGRST204' || error.message?.includes('schema cache')) {
        const match = error.message?.match(/Could not find the '([^']+)' column/i);
        if (match && match[1] && match[1] in payload) {
          delete payload[match[1]];
          continue;
        }
        if (error.message?.includes('supplier_id') && 'supplier_id' in payload) {
          delete payload.supplier_id;
          continue;
        }
      }
      break;
    }

    if (error) throw error;
    await refreshData(); return p; 
  };
  const updateProduct = async (id: string, data: any) => { 
    const payload = { ...data };
    
    // إزالة الحقول غير الموجودة في جدول الأصناف بقاعدة البيانات
    const firstProd = products.length > 0 ? products[0] : null;
    if (firstProd) {
      if (!('supplier_id' in firstProd)) delete payload.supplier_id;
      if (!('egs_code' in firstProd)) delete payload.egs_code;
      if (!('item_code_type' in firstProd)) delete payload.item_code_type;
      if (!('eta_unit_code' in firstProd)) delete payload.eta_unit_code;
    }

    let error: any = null;

    // محاولة التحديث مع معالجة ديناميكية لأي عمود مفقود من قاعدة البيانات
    for (let attempt = 0; attempt < 5; attempt++) {
      const res = await supabase.from('products').update(payload).eq('id', id);
      error = res.error;
      if (!error) break;

      if (error.code === 'PGRST204' || error.message?.includes('schema cache')) {
        const match = error.message?.match(/Could not find the '([^']+)' column/i);
        if (match && match[1] && match[1] in payload) {
          delete payload[match[1]];
          continue;
        }
        if (error.message?.includes('supplier_id') && 'supplier_id' in payload) {
          delete payload.supplier_id;
          continue;
        }
      }
      break;
    }

    if (error) throw error;
    refreshData(); 
  };
  const deleteProduct = async (id: string, reason?: string) => { 
    // تم إزالة تحديث حقل 'notes' لأن الجدول لا يحتوي عليه في قاعدة البيانات حالياً
    const { error } = await supabase.from('products').update({ deleted_at: new Date().toISOString() }).eq('id', id);
          
    if (error) throw error;
    showToast('تم نقل الصنف إلى سلة المحذوفات', 'success');
    refreshData(); 
  };
  const addStockTransfer = async (data: any) => { 
    const { error } = await supabase.from('stock_transfers').insert(data);
    if (error) throw error;
    refreshData(); 
  };
  const approveStockTransfer = async (id: string) => { 
    const { error } = await supabase.rpc('approve_stock_transfer', { p_transfer_id: id });
    if (error) throw error;
    refreshData(); 
  };
  const cancelStockTransfer = async (id: string) => { await supabase.from('stock_transfers').update({ status: 'cancelled' }).eq('id', id); showToast('تم إلغاء طلب التحويل', 'info'); refreshData(); };
  const addWarehouse = async (data: any) => { 
    const targetOrgId = currentSelectedOrgId || currentUser?.organization_id;
    const { error } = await supabase.from('warehouses').insert({ ...data, organization_id: targetOrgId }); 
    if (error) throw error;
    await refreshData(); 
  };
   const updateWarehouse = async (id: string, data: any) => { 
    const { error } = await supabase.from('warehouses').update(data).eq('id', id);
    if (error) throw error;
    refreshData(); 
  };
  const deleteWarehouse = async (id: string) => { 
    const { error } = await supabase.from('warehouses').update({ is_active: false }).eq('id', id);
    if (error) throw error;
    refreshData(); 
  };
  const addWastage = async (data: any) => { 
    const { error } = await supabase.rpc('record_wastage', data); 
    if (error) {
      showToast('فشل تسجيل الهالك: ' + error.message, 'error');
    } else {
      showToast('تم تسجيل الهالك وتحديث المخزن ✅', 'success');
      refreshData();
    }
    return !error; 
  };
  const produceItem = async (id: string, qty: number, whId: string, date: string, cost: number, ref: string) => { return await supabase.rpc('mfg_create_order_direct', { p_product_id: id, p_qty: qty, p_warehouse_id: whId, p_date: date, p_additional_cost: cost, p_reference: ref }); };

  // Sales & Purchases
  const addCustomer = async (data: any) => { 
    const targetOrgId = currentSelectedOrgId || currentUser?.organization_id;
    const { data: c, error } = await supabase.from('customers').insert({ ...data, organization_id: targetOrgId }).select().single(); 
    if (error) throw error;
    await refreshData(); return c; 
  };
  const updateCustomer = async (id: string, data: any) => { 
    const { error } = await supabase.from('customers').update(data).eq('id', id);
    if (error) throw error;
    refreshData(); 
  };
  const deleteCustomer = async (id: string, reason?: string) => { 
    const { error } = await supabase.from('customers').update({ deleted_at: new Date().toISOString(), deletion_reason: reason }).eq('id', id);
    if (error) throw error;
    refreshData(); 
  };
  const addSupplier = async (data: any) => { 
    const targetOrgId = currentSelectedOrgId || currentUser?.organization_id;
    const { data: s, error } = await supabase.from('suppliers').insert({ ...data, organization_id: targetOrgId }).select().single(); 
    if (error) {
      showToast('فشل إضافة المورد: ' + error.message, 'error');
      throw error;
    }
    showToast('تم إضافة المورد بنجاح ✅', 'success');
    await refreshData();
    return s; 
  };
    const updateSupplier = async (id: string, data: any) => { 
    const { error } = await supabase.from('suppliers').update(data).eq('id', id);
    if (error) throw error;
    refreshData(); 
  };
  const deleteSupplier = async (id: string, reason?: string) => { 
    const { error } = await supabase.from('suppliers').update({ deleted_at: new Date().toISOString(), deletion_reason: reason }).eq('id', id);
    if (error) throw error;
    refreshData(); 
  };
  const approveInvoice = async (id: string, orgId?: string, warehouseId?: string) => { 
    const { error } = await supabase.rpc('post_sales_invoice', { 
      p_invoice_id: id,
      p_org_id: orgId || currentSelectedOrgId || currentUser?.organization_id || null,
      p_warehouse_id: warehouseId
    }); 
    if (error) {
      console.error('approveInvoice RPC error:', error);
      throw error;
    }
    refreshData(); 
    return true; 
  };

  const unpostSalesInvoice = async (id: string, orgId?: string): Promise<boolean> => {
    const targetOrgId = orgId || currentSelectedOrgId || currentUser?.organization_id || null;
    const { error } = await supabase.rpc('unpost_sales_invoice', {
      p_invoice_id: id,
      p_org_id: targetOrgId
    });
    if (error) {
      console.warn('RPC unpost_sales_invoice error:', error);
      throw error;
    }
    refreshData();
    return true;
  };

  const deleteSalesInvoice = async (id: string, orgId?: string): Promise<boolean> => {
    const targetOrgId = orgId || currentSelectedOrgId || currentUser?.organization_id || null;
    const { error } = await supabase.rpc('delete_sales_invoice', {
      p_invoice_id: id,
      p_org_id: targetOrgId
    });
    if (error) {
      console.warn('RPC delete_sales_invoice error:', error);
      throw error;
    }
    refreshData();
    return true;
  };

  const approvePurchaseInvoice = async (id: string, orgId?: string, warehouseId?: string) => { 
    const { error } = await supabase.rpc('post_purchase_invoice', { 
      p_invoice_id: id,
      p_org_id: orgId || currentSelectedOrgId || currentUser?.organization_id,
      p_warehouse_id: warehouseId
    }); 
    if (error) {
      showToast('فشل اعتماد الفاتورة: ' + error.message, 'error');
      throw error;
    } else {
      showToast('تم اعتماد فاتورة المشتريات وتحديث المخزون بنجاح ✅', 'success');
      refreshData();
    }
  };

  const unpostPurchaseInvoice = async (id: string, orgId?: string): Promise<boolean> => {
    const targetOrgId = orgId || currentSelectedOrgId || currentUser?.organization_id || null;
    const { error } = await supabase.rpc('unpost_purchase_invoice', {
      p_invoice_id: id,
      p_org_id: targetOrgId
    });
    if (error) {
      console.warn('RPC unpost_purchase_invoice error:', error);
      throw error;
    }
    refreshData();
    return true;
  };

  const deletePurchaseInvoice = async (id: string, orgId?: string): Promise<boolean> => {
    const targetOrgId = orgId || currentSelectedOrgId || currentUser?.organization_id || null;
    const { error } = await supabase.rpc('delete_purchase_invoice', {
      p_invoice_id: id,
      p_org_id: targetOrgId
    });
    if (error) {
      console.warn('RPC delete_purchase_invoice error:', error);
      throw error;
    }
    refreshData();
    return true;
  };
  const convertPoToInvoice = async (id: string, warehouseId?: string, orgId?: string) => { 
    const { error } = await supabase.rpc('convert_po_to_invoice', { 
      p_po_id: id, 
      p_warehouse_id: warehouseId,
      p_org_id: orgId || currentSelectedOrgId || currentUser?.organization_id
    }); 
    if (error) {
      showToast('فشل تحويل أمر الشراء: ' + error.message, 'error');
    } else {
      showToast('تم تحويل أمر الشراء إلى فاتورة بنجاح ✅', 'success');
      refreshData();
    }
  };
  const addOpeningBalanceTransaction = async (id: string, type: string, amount: number, date: string, name: string) => {
    const { error } = await supabase.rpc('add_opening_balance', {
      p_id: id,
      p_type: type,
      p_amount: amount,
      p_date: date,
      p_name: name
    });
    if (error) {
      showToast('فشل تسجيل القيد الافتتاحي: ' + error.message, 'error');
    } else {
      showToast('تم تسجيل الرصيد الافتتاحي وتحديث الحسابات بنجاح ✅', 'success');
      refreshData();
    }
  };
  const addPaymentVoucher = async (data: any) => { 
    const { data: { session } } = await supabase.auth.getSession();
    const targetOrgId = currentSelectedOrgId || currentUser?.organization_id || session?.user?.user_metadata?.org_id || (currentUser as any)?.user_metadata?.org_id;
    const supplierId = data.partyId || data.supplierId || data.supplier_id;
    const treasuryId = data.treasuryAccountId || data.treasury_account_id || data.treasuryId;
    const amount = Number(data.amount) || 0;
    const date = data.date || data.payment_date || new Date().toISOString().split('T')[0];
    const notes = data.notes || data.description || '';
    const voucherNumber = data.voucher_number || data.voucherNumber || `PV-${Date.now().toString().slice(-8)}-${Math.floor(Math.random() * 1000)}`;

    const supplier = suppliers.find(s => s.id === supplierId);
    const supplierName = data.partyName || data.supplierName || supplier?.name || '';
    const fullDesc = notes 
      ? (supplierName && !notes.includes(supplierName) ? `${notes} (${supplierName})` : notes)
      : `سند صرف للمورد ${supplierName}`.trim();

    // 🛡️ تحديد حساب المورد المدين
    let supplierAccId = supplier?.account_id || supplier?.accountId || 
                          getSystemAccount('SUPPLIERS')?.id || 
                          accounts.find(a => a.code === '201' || a.code === '20101' || a.code === '2201' || a.code?.startsWith('201') || a.name?.includes('مورد'))?.id;

    if (!supplierAccId && targetOrgId) {
      const { data: dbAcc } = await supabase
        .from('accounts')
        .select('id')
        .eq('organization_id', targetOrgId)
        .or('code.eq.201,code.eq.20101,code.eq.2201,name.ilike.%مورد%')
        .limit(1)
        .maybeSingle();
      if (dbAcc) supplierAccId = dbAcc.id;
    }

    // 1. إدراج السند في جدول payment_vouchers
    const { data: pvData, error: pvError } = await supabase.from('payment_vouchers').insert({
      voucher_number: voucherNumber,
      payment_date: date,
      supplier_id: supplierId || null,
      amount: amount,
      treasury_account_id: treasuryId || null,
      notes: fullDesc,
      payment_method: data.paymentMethod || data.payment_method || 'cash',
      organization_id: targetOrgId
    }).select('id').maybeSingle();

    if (pvError) {
      console.warn('payment_vouchers insert warning:', pvError);
    }

    const voucherId = pvData?.id;

    // 2. إنشاء القيد المحاسبي لسند الصرف بشكل مضمون
    if (amount > 0 && supplierAccId && treasuryId) {
      let entryCreated = false;

      // محاولة 1: الدالة الآمنة في قاعدة البيانات
      if (voucherId) {
        try {
          const { error: rpcErr } = await supabase.rpc('approve_payment_voucher', {
            p_voucher_id: voucherId,
            p_debit_account_id: supplierAccId
          });
          if (!rpcErr) entryCreated = true;
        } catch (rpcEx) {
          console.warn('approve_payment_voucher RPC failed, falling back to manual entry:', rpcEx);
        }
      }

      // محاولة 2: استخدام دالة addEntry
      if (!entryCreated) {
        try {
          await addEntry({
            date: date,
            description: fullDesc,
            reference: voucherNumber,
            status: 'posted',
            p_org_id: targetOrgId,
            lines: [
              { account_id: supplierAccId, accountId: supplierAccId, debit: amount, credit: 0, description: fullDesc },
              { account_id: treasuryId, accountId: treasuryId, debit: 0, credit: amount, description: `سداد سند صرف ${voucherNumber}` }
            ]
          });
          entryCreated = true;
        } catch (addErr) {
          console.warn('addEntry RPC failed, falling back to direct table insert:', addErr);
        }
      }

      // محاولة 3: إدراج مباشر في journal_entries و journal_lines
      if (!entryCreated && targetOrgId) {
        try {
          const { data: newJe, error: jeErr } = await supabase
            .from('journal_entries')
            .insert({
              transaction_date: date,
              description: fullDesc,
              reference: voucherNumber,
              status: 'posted',
              is_posted: true,
              organization_id: targetOrgId,
              related_document_id: voucherId || data.invoiceId || null,
              related_document_type: 'payment_voucher'
            })
            .select('id')
            .single();

          if (!jeErr && newJe) {
            await supabase.from('journal_lines').insert([
              {
                journal_entry_id: newJe.id,
                account_id: supplierAccId,
                debit: amount,
                credit: 0,
                description: fullDesc,
                organization_id: targetOrgId
              },
              {
                journal_entry_id: newJe.id,
                account_id: treasuryId,
                debit: 0,
                credit: amount,
                description: `سداد سند صرف ${voucherNumber}`,
                organization_id: targetOrgId
              }
            ]);

            if (voucherId) {
              await supabase
                .from('payment_vouchers')
                .update({ related_journal_entry_id: newJe.id })
                .eq('id', voucherId);
            }
            entryCreated = true;
          }
        } catch (directErr) {
          console.error('Direct journal entry insert error:', directErr);
        }
      }
    }

    // 3. تحديث المبلغ المدفوع في فاتورة المشتريات إن وجدت
    if (data.invoiceId) {
      try {
        const { data: currentInv, error: fetchInvErr } = await supabase
          .from('purchase_invoices')
          .select('paid_amount, total_amount, status')
          .eq('id', data.invoiceId)
          .maybeSingle();

        if (!fetchInvErr && currentInv) {
          const newPaid = (Number(currentInv.paid_amount) || 0) + amount;
          const newStatus = newPaid >= Number(currentInv.total_amount) ? 'paid' : (currentInv.status === 'draft' ? 'draft' : 'posted');
          await supabase
            .from('purchase_invoices')
            .update({ paid_amount: newPaid, status: newStatus })
            .eq('id', data.invoiceId);
        }
      } catch (invErr) {
        console.error('Failed to update purchase invoice paid_amount:', invErr);
      }
    }

    // 4. إعادة مزامنة أرصدة الحسابات والموردين
    if (targetOrgId) {
      try {
        await supabase.rpc('recalculate_all_system_balances', { p_org_id: targetOrgId });
      } catch (recErr) {
        console.warn('recalculate balances error:', recErr);
      }
    }

    await refreshData(); 
  };

  // Assets & Cheques
  const addAsset = async (assetData: any) => { 
    const targetOrgId = currentSelectedOrgId || currentUser?.organization_id;
    
    // 1. فصل تعليمات القيد المحاسبي عن بيانات الجدول الفعلية لتجنب خطأ 400
    const { create_journal_entry, credit_account_id, ...dbPayload } = assetData;

    // 2. تنظيف البيانات (تحويل القيم الفارغة إلى null)
    const cleanedPayload = { ...dbPayload };
    ['accumulated_depreciation_account_id', 'depreciation_expense_account_id'].forEach(key => {
      if (cleanedPayload[key] === '') cleanedPayload[key] = null;
    });

    // 3. إدراج الأصل في قاعدة البيانات
    const { data: newAsset, error } = await supabase
      .from('assets')
      .insert({ ...cleanedPayload, organization_id: targetOrgId })
      .select()
      .single(); 
      
    if (error) throw error;

    // 4. إنشاء قيد اليومية آلياً إذا طلب المستخدم ذلك
    if (create_journal_entry && newAsset) {
      try {
        const refCode = `ASSET-${newAsset.id.split('-')[0].toUpperCase()}`;
        await addEntry({
          date: newAsset.purchase_date || new Date().toISOString().split('T')[0],
          description: `إثبات شراء أصل ثابت: ${newAsset.name}`,
          reference: refCode,
          status: 'posted',
          p_org_id: targetOrgId,
          lines: [
            {
              account_id: newAsset.asset_account_id,
              debit: newAsset.purchase_cost,
              credit: 0,
              description: `قيمة الأصل المشتري: ${newAsset.name}`
            },
            {
              account_id: credit_account_id || getSystemAccount('OPENING_BALANCES')?.id,
              debit: 0,
              credit: newAsset.purchase_cost,
              description: `سداد قيمة الأصل: ${newAsset.name}`
            }
          ]
        });

        // ربط القيد بـ related_document_id لتسهيل التتبع
        await supabase
          .from('journal_entries')
          .update({ related_document_id: newAsset.id, related_document_type: 'fixed_asset' })
          .eq('reference', refCode)
          .eq('organization_id', targetOrgId);
      } catch (jeError) {
        console.error("Failed to create asset journal entry:", jeError);
        showToast('تمت إضافة الأصل ولكن فشل إنشاء القيد آلياً، يرجى إنشاؤه يدوياً.', 'warning');
      }
    }

    await refreshData(); 
  };
  const updateAsset = async (id: string, updates: any) => {
    const { error } = await supabase.from('assets').update(updates).eq('id', id);
    if (error) throw error;
    await refreshData();
  };
  const deleteAsset = async (id: string) => {
    const targetOrgId = currentSelectedOrgId || currentUser?.organization_id;
    const { error } = await supabase.from('assets').update({ deleted_at: new Date().toISOString() }).eq('id', id);
    if (error) throw error;

    // إلغاء ترحيل قيود الأصل المرتبطة (الشراء والإهلاك) حتى لا تظهر في ميزان المراجعة أثناء وجود الأصل بالسلة
    try {
      const prefix = id.split('-')[0].toUpperCase();
      const shortId = id.slice(0, 6);
      await supabase
        .from('journal_entries')
        .update({ status: 'draft', is_posted: false })
        .eq('organization_id', targetOrgId)
        .or(`related_document_id.eq.${id},reference.ilike.ASSET-${prefix}%,reference.ilike.DEP-${shortId}%`);

      if (targetOrgId) {
        await supabase.rpc('recalculate_all_system_balances', { p_org_id: targetOrgId });
      }
    } catch (e) {
      console.warn('deleteAsset unpost fallback:', e);
    }

    await refreshData();
  };
  const runDepreciation = async (id?: string, amount?: number, date?: string) => { await supabase.rpc('run_monthly_depreciation', { p_asset_id: id, p_amount: amount, p_date: date }); refreshData(); };
  const revaluateAsset = async (id: string, val: number, date: string, accId: string) => { await supabase.from('assets').update({ current_value: val }).eq('id', id); refreshData(); };
  const addCheque = async (cheque: any) => { 
    const targetOrgId = currentSelectedOrgId || currentUser?.organization_id;
    const { error } = await supabase.from('cheques').insert({ ...cheque, organization_id: targetOrgId }); 
    if (error) throw error;
    await refreshData(); 
  };

  const updateCheque = async (id: string, cheque: any) => {
    const targetOrgId = currentSelectedOrgId || currentUser?.organization_id;
    const { error } = await supabase
      .from('cheques')
      .update({
        cheque_number: cheque.cheque_number,
        amount: cheque.amount,
        due_date: cheque.due_date,
        party_id: cheque.party_id,
        party_name: cheque.party_name,
        bank_name: cheque.bank_name,
        notes: cheque.notes
      })
      .eq('id', id)
      .eq('organization_id', targetOrgId);

    if (error) throw error;

    try {
      await supabase.rpc('post_cheque_journal_entry', { p_cheque_id: id });
    } catch (e) {
      console.warn('post_cheque_journal_entry fallback:', e);
    }

    try {
      await supabase.rpc('recalculate_all_system_balances', { p_org_id: targetOrgId });
    } catch (e) {
      // ignore
    }

    await refreshData();
  };

  const deleteCheque = async (id: string) => {
    const targetOrgId = currentSelectedOrgId || currentUser?.organization_id;
    
    // 1. جلب معرف القيد المحاسبي المربوط بالشيك
    const { data: chq } = await supabase.from('cheques').select('related_journal_entry_id').eq('id', id).single();
    
    // 2. حذف قيود اليومية المرتبطة بالشيك
    if (chq?.related_journal_entry_id) {
      await supabase.from('journal_lines').delete().eq('journal_entry_id', chq.related_journal_entry_id);
      await supabase.from('journal_entries').delete().eq('id', chq.related_journal_entry_id);
    }
    
    // حذف أي قيود أخرى مرتبطة بالشيك عن طريق related_document_id
    const { data: relatedEntries } = await supabase
      .from('journal_entries')
      .select('id')
      .eq('related_document_id', id)
      .eq('organization_id', targetOrgId);

    if (relatedEntries && relatedEntries.length > 0) {
      const entryIds = relatedEntries.map(e => e.id);
      await supabase.from('journal_lines').delete().in('journal_entry_id', entryIds);
      await supabase.from('journal_entries').delete().in('id', entryIds);
    }

    // 3. حذف مرفقات الشيك
    await supabase.from('cheque_attachments').delete().eq('cheque_id', id);

    // 4. حذف سجل الشيك
    const { error: delError } = await supabase.from('cheques').delete().eq('id', id);
    if (delError) throw delError;

    // 5. تحديث الأرصدة
    try {
      await supabase.rpc('recalculate_all_system_balances', { p_org_id: targetOrgId });
    } catch (e) {
      // ignore
    }

    await refreshData();
  };
  const updateChequeStatus = async (id: string, status: string, date: string, bankId?: string) => {
    const targetOrgId = currentSelectedOrgId || currentUser?.organization_id;
    const actionDate = date || new Date().toISOString().split('T')[0];

    // 1. محاولة استدعاء الدالة المباشرة RPC لصرف أو تحصيل الشيك
    if (status === 'cashed' || status === 'collected') {
      try {
        const { data: rpcRes, error: rpcError } = await supabase.rpc('cash_or_collect_cheque', {
          p_cheque_id: id,
          p_status: status,
          p_bank_account_id: bankId || null,
          p_action_date: actionDate,
          p_user_id: currentUser?.id || null
        });
        if (!rpcError && (rpcRes?.success || rpcRes === true)) {
          await refreshData();
          return;
        }
        if (rpcError) {
          console.warn('RPC cash_or_collect_cheque fallback to manual:', rpcError);
        }
      } catch (rpcErr) {
        console.warn('RPC cash_or_collect_cheque fallback:', rpcErr);
      }
    }

    // 2. إنشاء القيد المحاسبي المباشر عبر addEntry الآمنة
    try {
      const { data: cheque } = await supabase
        .from('cheques')
        .select('*')
        .eq('id', id)
        .maybeSingle();

      if (cheque && (status === 'cashed' || status === 'collected') && bankId) {
        const notesReceivableAcc = getSystemAccount('NOTES_RECEIVABLE') || accounts.find(a => a.code === '10103' || a.code === '1222' || a.name?.includes('أوراق قبض') || a.name?.includes('قبض'));
        const notesPayableAcc = getSystemAccount('NOTES_PAYABLE') || accounts.find(a => a.code === '20102' || a.code === '222' || a.name?.includes('أوراق دفع') || a.name?.includes('دفع'));
        const amount = Number(cheque.amount) || 0;

        if (amount > 0) {
          let lines: any[] = [];
          let desc = '';
          let ref = '';

          if (cheque.type === 'incoming' || cheque.type === 'in') {
            desc = `تحصيل شيك وارد رقم ${cheque.cheque_number || ''} - إيداع بنكي (${cheque.party_name || ''})`;
            ref = `CHQ-${cheque.cheque_number || id.slice(-8)}-COL`;
            if (notesReceivableAcc?.id) {
              lines = [
                { accountId: bankId, debit: amount, credit: 0, description: desc },
                { accountId: notesReceivableAcc.id, debit: 0, credit: amount, description: desc }
              ];
            }
          } else {
            desc = `صرف شيك صادر رقم ${cheque.cheque_number || ''} - خصم بنكي (${cheque.party_name || ''})`;
            ref = `CHQ-${cheque.cheque_number || id.slice(-8)}-CSH`;
            if (notesPayableAcc?.id) {
              lines = [
                { accountId: notesPayableAcc.id, debit: amount, credit: 0, description: desc },
                { accountId: bankId, debit: 0, credit: amount, description: desc }
              ];
            }
          }

          if (lines.length === 2) {
            // فحص هل القيد مسجل مسبقاً لنفس الشيك والمرجع لمنع التكرار نهائياً
            const { data: existingEntry } = await supabase
              .from('journal_entries')
              .select('id')
              .eq('organization_id', targetOrgId)
              .eq('reference', ref)
              .maybeSingle();

            if (!existingEntry) {
              await addEntry({
                date: actionDate,
                reference: ref,
                description: desc,
                status: 'posted',
                p_org_id: targetOrgId,
                lines: lines
              });
            }
          }
        }
      }
    } catch (entryErr) {
      console.warn('Cheque journal entry creation error:', entryErr);
    }

    // 3. التحديث عبر REST مع التراجع الذكي
    const updatePayload: { status: string; current_account_id?: string | null; transfer_date?: string } = { 
      status, 
      transfer_date: actionDate 
    };
    if (bankId !== undefined) {
      updatePayload.current_account_id = bankId;
    }
    
    let { error } = await supabase.from('cheques').update(updatePayload).eq('id', id); 
    if (error) {
      if (error.message?.includes('current_account_id') || error.code === 'PGRST204' || error.code === '42703') {
        const { error: fallbackError } = await supabase.from('cheques').update({ status }).eq('id', id);
        if (fallbackError) throw fallbackError;
      } else {
        throw error;
      }
    }
    await refreshData(); 
  };     
  const addTransfer = async (transfer: any) => { 
    const targetOrgId = currentSelectedOrgId || currentUser?.organization_id;
    const targetUserId = currentUser?.id;
    const { error } = await supabase.rpc('add_treasury_transfer', {
      p_from_account_id: transfer.sourceAccountId,
      p_to_account_id: transfer.destinationAccountId,
      p_amount: transfer.amount,
      p_transfer_date: transfer.date,
      p_notes: transfer.description || '',
      p_org_id: targetOrgId,
      p_user_id: targetUserId
    });
    if (error) throw error;
    await refreshData(); 
  };

  const updateTransfer = async (id: string, transfer: any) => {
    try {
      const { error } = await supabase.rpc('update_treasury_transfer', {
        p_journal_entry_id: id,
        p_from_account_id: transfer.sourceAccountId,
        p_to_account_id: transfer.destinationAccountId,
        p_amount: transfer.amount,
        p_transfer_date: transfer.date,
        p_notes: transfer.description || ''
      });
      
      if (error) {
        // Fallback to direct REST if RPC doesn't exist
        const isFuncMissing = error.code === 'P0001' || 
                              error.message?.includes('function') || 
                              error.message?.includes('does not exist');
        if (isFuncMissing) {
          console.warn("RPC update_treasury_transfer not found, falling back to direct REST updates");
          const targetOrgId = currentSelectedOrgId || currentUser?.organization_id;

          // Update journal entry
          const { error: entryError } = await supabase.from('journal_entries').update({
            transaction_date: transfer.date,
            description: transfer.description || ''
          }).eq('id', id);
          if (entryError) throw entryError;

          // Delete old journal lines
          const { error: linesDeleteError } = await supabase.from('journal_lines').delete().eq('journal_entry_id', id);
          if (linesDeleteError) throw linesDeleteError;

          // Insert new journal lines
          const { error: linesInsertError } = await supabase.from('journal_lines').insert([
            {
              journal_entry_id: id,
              account_id: transfer.destinationAccountId,
              debit: transfer.amount,
              credit: 0,
              description: 'تحويل وارد: ' + (transfer.description || ''),
              organization_id: targetOrgId
            },
            {
              journal_entry_id: id,
              account_id: transfer.sourceAccountId,
              debit: 0,
              credit: transfer.amount,
              description: 'تحويل صادر: ' + (transfer.description || ''),
              organization_id: targetOrgId
            }
          ]);
          if (linesInsertError) throw linesInsertError;

          // Recalculate balances
          await supabase.rpc('recalculate_all_system_balances', { p_org_id: targetOrgId });
        } else {
          throw error;
        }
      }
      await refreshData();
    } catch (error: any) {
      console.error('Error updating transfer:', error);
      throw error;
    }
  };

  const deleteTransfer = async (id: string) => {
    try {
      const { error } = await supabase.rpc('delete_treasury_transfer', {
        p_journal_entry_id: id
      });
      
      if (error) {
        // Fallback to direct REST if RPC doesn't exist
        const isFuncMissing = error.code === 'P0001' || 
                              error.message?.includes('function') || 
                              error.message?.includes('does not exist');
        if (isFuncMissing) {
          console.warn("RPC delete_treasury_transfer not found, falling back to direct REST deletion");
          const targetOrgId = currentSelectedOrgId || currentUser?.organization_id;

          // Delete journal lines first
          const { error: linesError } = await supabase.from('journal_lines').delete().eq('journal_entry_id', id);
          if (linesError) throw linesError;

          // Delete journal entry
          const { error: entryError } = await supabase.from('journal_entries').delete().eq('id', id);
          if (entryError) throw entryError;

          // Recalculate balances
          await supabase.rpc('recalculate_all_system_balances', { p_org_id: targetOrgId });
        } else {
          throw error;
        }
      }
      await refreshData();
    } catch (error: any) {
      console.error('Error deleting transfer:', error);
      throw error;
    }
  };

  const restoreItem = async (table: string, id: string) => { 
    const targetOrgId = currentSelectedOrgId || currentUser?.organization_id;
    const { error } = await supabase.from(table).update({ deleted_at: null }).eq('id', id); 
    if (!error && table === 'assets') {
      try {
        const prefix = id.split('-')[0].toUpperCase();
        const shortId = id.slice(0, 6);
        await supabase
          .from('journal_entries')
          .update({ status: 'posted', is_posted: true })
          .eq('organization_id', targetOrgId)
          .or(`related_document_id.eq.${id},reference.ilike.ASSET-${prefix}%,reference.ilike.DEP-${shortId}%`);

        if (targetOrgId) {
          await supabase.rpc('recalculate_all_system_balances', { p_org_id: targetOrgId });
        }
      } catch (e) {
        console.warn('restoreItem asset repost fallback:', e);
      }
    }
    refreshData(); 
    return { success: !error, message: error?.message }; 
  };

  const permanentDeleteItem = async (table: string, id: string) => { 
    const targetOrgId = currentSelectedOrgId || currentUser?.organization_id;
    if (table === 'assets') {
      try {
        const prefix = id.split('-')[0].toUpperCase();
        const shortId = id.slice(0, 6);

        // 1. العثور على قيود اليومية المرتبطة بالأصل (شراء وإهلاك)
        const { data: entries } = await supabase
          .from('journal_entries')
          .select('id')
          .eq('organization_id', targetOrgId)
          .or(`related_document_id.eq.${id},reference.ilike.ASSET-${prefix}%,reference.ilike.DEP-${shortId}%`);

        if (entries && entries.length > 0) {
          const entryIds = entries.map(e => e.id);
          // أ. إلغاء الترحيل أولاً لتخطي مشغل حماية القيود المرحلة
          await supabase.from('journal_entries').update({ status: 'draft', is_posted: false }).in('id', entryIds);
          // ب. حذف أسطر القيود
          await supabase.from('journal_lines').delete().in('journal_entry_id', entryIds);
          // ج. حذف رؤوس القيود
          await supabase.from('journal_entries').delete().in('id', entryIds);
        }

        // حذف السجلات التابعة
        await supabase.from('asset_audits').delete().eq('asset_id', id);
        await supabase.from('asset_transfers').delete().eq('asset_id', id);

        if (targetOrgId) {
          await supabase.rpc('recalculate_all_system_balances', { p_org_id: targetOrgId });
        }
      } catch (e) {
        console.warn('Error purging asset journal entries during permanent delete:', e);
      }
    }

    const { error } = await supabase.from(table).delete().eq('id', id); 
    refreshData(); 
    return { success: !error, message: error?.message }; 
  };
  const exportJournalToCSV = async () => {
    try {
      const orgId = currentSelectedOrgId || currentUser?.organization_id;
      let query = supabase
        .from('journal_entries')
        .select(`
          id,
          transaction_date,
          reference,
          description,
          status,
          journal_lines (
            debit,
            credit,
            description,
            account_id
          )
        `)
        .order('transaction_date', { ascending: false });

      if (orgId) {
        query = query.eq('organization_id', orgId);
      }

      const { data, error } = await query;
      if (error) throw error;

      if (!data || data.length === 0) {
        showToast('لا توجد قيود لتصديرها.', 'info');
        return;
      }

      const XLSX = await import('xlsx');
      const accountMap = new Map((accounts || []).map((a: any) => [a.id, a]));

      const flatData: any[] = [];
      data.forEach((entry: any) => {
        (entry.journal_lines || []).forEach((line: any) => {
          const acc = accountMap.get(line.account_id);
          flatData.push({
            'التاريخ': entry.transaction_date,
            'رقم القيد': entry.reference,
            'البيان الرئيسي': entry.description,
            'الحالة': entry.status === 'posted' ? 'مرحل' : 'مسودة',
            'كود الحساب': acc?.code || line.account_code || '-',
            'اسم الحساب': acc?.name || '-',
            'مدين': Number(line.debit) || 0,
            'دائن': Number(line.credit) || 0,
            'بيان الحركة': line.description || '-'
          });
        });
      });

      const ws = XLSX.utils.json_to_sheet(flatData);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Journal Entries");
      XLSX.writeFile(wb, `General_Journal_${new Date().toISOString().split('T')[0]}.xlsx`);
      showToast('تم تصدير القيود المحاسبية بنجاح ✅', 'success');
    } catch (err: any) {
      console.error('Export CSV error:', err);
      showToast('فشل تصدير القيود: ' + err.message, 'error');
    }
  };

  // HR
  const addEmployee = async (data: any) => { 
    const targetOrgId = currentSelectedOrgId || currentUser?.organization_id;
    const { error } = await supabase.from('employees').insert({ ...data, organization_id: targetOrgId }); 
    if (error) throw error;
    await refreshData(); 
  };
  const updateEmployee = async (id: string, data: any) => { await supabase.from('employees').update(data).eq('id', id); refreshData(); };
  const deleteEmployee = async (id: string, reason?: string) => { await supabase.from('employees').update({ status: 'terminated', notes: reason }).eq('id', id); refreshData(); };
  const runPayroll = async (month: number, year: number, date: string, treasuryId: string, data: any[], orgId?: string) => {
    const { error } = await supabase.rpc('run_payroll_rpc', {
      p_month: month,
      p_year: year,
      p_date: date,
      p_treasury_acc: treasuryId,
      p_items: data,
      p_org_id: orgId || currentSelectedOrgId || null // استخدام null لضمان صحة JSON
    });
    
    if (error) {
      if (process.env.NODE_ENV === 'development') console.error("Payroll RPC Error:", error);
      throw new Error(error.message || 'حدث خطأ أثناء تنفيذ مسير الرواتب');
    }
    
    await refreshData();
  };

  // --- Demo Stubs ---
  const addDemoEntry = (e: any) => console.log('Demo Entry:', e);
  const addDemoPaymentVoucher = (v: any) => console.log('Demo Payment:', v);
  const addDemoReceiptVoucher = (v: any) => console.log('Demo Receipt:', v);
  const addDemoInvoice = (i: any) => console.log('Demo Invoice:', i);
  const postDemoSalesInvoice = (inv: any) => console.log('Demo Post Invoice:', inv);
  const addDemoPurchaseInvoice = (i: any) => console.log('Demo Purchase:', i);

  // --- Restaurant Functions ---
  const finalizeProductionOrder = async (id: string, status: string, notes: string) => {
    return await supabase.rpc('mfg_finalize_order', { p_order_id: id, p_final_status: status, p_qc_notes: notes });
  };

  const openTableSession = async (tableId: string) => {
    if (!navigator.onLine || isDemo) {
      const sessionId = 'session-' + Date.now();
      setRestaurantTables(prev => prev.map(t => t.id === tableId ? { ...t, status: 'OCCUPIED', session_id: sessionId } : t));
      setOfflineTableOrder(tableId, { sessionId, orderId: null, items: [] });
      return sessionId;
    }
    try {
      const { data, error } = await supabase.rpc('open_table_session', { p_table_id: tableId });
      if (error) throw error;
      refreshData();
      return data;
    } catch (err: any) {
      const sessionId = 'session-' + Date.now();
      setRestaurantTables(prev => prev.map(t => t.id === tableId ? { ...t, status: 'OCCUPIED', session_id: sessionId } : t));
      setOfflineTableOrder(tableId, { sessionId, orderId: null, items: [] });
      return sessionId;
    }
  };

  const reserveTable = async (tableId: string, name: string, time: string) => {
    if (!navigator.onLine || isDemo) {
      setRestaurantTables(prev => prev.map(t => t.id === tableId ? { ...t, status: 'RESERVED', reservation_info: { customerName: name, arrivalTime: time } } : t));
      return true;
    }
    try {
      const { error } = await supabase.from('restaurant_tables').update({ status: 'RESERVED', reservation_info: { customerName: name, arrivalTime: time } }).eq('id', tableId);
      if (error) return false;
      refreshData();
      return true;
    } catch {
      setRestaurantTables(prev => prev.map(t => t.id === tableId ? { ...t, status: 'RESERVED', reservation_info: { customerName: name, arrivalTime: time } } : t));
      return true;
    }
  };

  const cancelReservation = async (tableId: string) => {
    if (!navigator.onLine || isDemo) {
      setRestaurantTables(prev => prev.map(t => t.id === tableId ? { ...t, status: 'AVAILABLE', reservation_info: null } : t));
      return;
    }
    try {
      await supabase.from('restaurant_tables').update({ status: 'AVAILABLE', reservation_info: null }).eq('id', tableId);
      refreshData();
    } catch {
      setRestaurantTables(prev => prev.map(t => t.id === tableId ? { ...t, status: 'AVAILABLE', reservation_info: null } : t));
    }
  };

  const transferTableSession = async (sessionId: string, targetTableId: string) => {
    if (!navigator.onLine || isDemo) {
      setRestaurantTables(prev => prev.map(t => {
        if (t.session_id === sessionId) return { ...t, status: 'AVAILABLE', session_id: null };
        if (t.id === targetTableId) return { ...t, status: 'OCCUPIED', session_id: sessionId };
        return t;
      }));
      showToast('تم نقل الطاولة بنجاح (محلياً)', 'success');
      return true;
    }
    try {
      const { error } = await supabase.rpc('transfer_table_session', { p_session_id: sessionId, p_target_table_id: targetTableId });
      if (error) { showToast(error.message, 'error'); return false; }
      refreshData();
      return true;
    } catch {
      return false;
    }
  };

  const mergeTableSessions = async (sourceId: string, targetId: string) => {
    if (!navigator.onLine || isDemo) {
      setRestaurantTables(prev => prev.map(t => t.session_id === sourceId ? { ...t, status: 'AVAILABLE', session_id: null } : t));
      showToast('تم دمج الطاولات بنجاح (محلياً)', 'success');
      return true;
    }
    try {
      const { error } = await supabase.rpc('merge_table_sessions', { p_source_session_id: sourceId, p_target_session_id: targetId });
      if (error) { showToast(error.message, 'error'); return false; }
      refreshData();
      return true;
    } catch {
      return false;
    }
  };

  const createRestaurantOrder = async (payload: any) => {
    const targetOrgId = getEffectiveOrgId();
    
    if (!navigator.onLine || isDemo) {
      const orderId = 'ord-offline-' + Date.now();
      const tableId = payload.p_table_id;
      const matchedTable = tableId ? { id: tableId } : restaurantTables.find(t => t.session_id === payload.p_session_id || t.id === payload.p_table_id);
      const effectiveTableId = matchedTable?.id || tableId;

      if (effectiveTableId) {
        const existing = getOfflineTableOrders()[effectiveTableId] || {};
        const formattedItems = (payload.p_items || []).map((item: any, idx: number) => ({
          id: item.id || ('item-' + Date.now() + '-' + idx),
          productId: item.product_id,
          name: item.name || products.find(p => p.id === item.product_id)?.name || 'صنف',
          quantity: Number(item.quantity || 1),
          unitPrice: Number(item.unit_price || 0),
          unitCost: Number(item.unit_cost || 0),
          notes: item.notes || '',
          selectedModifiers: item.modifiers || [],
          savedQuantity: Number(item.quantity || 1)
        }));
        setOfflineTableOrder(effectiveTableId, {
          sessionId: payload.p_session_id || existing.sessionId || ('session-' + Date.now()),
          orderId,
          warehouseId: payload.p_warehouse_id || 'wh-main',
          items: formattedItems
        });
        setRestaurantTables(prev => prev.map(t => t.id === effectiveTableId ? { ...t, status: 'OCCUPIED' } : t));
      }

      try {
        await offlineService.queueOrder({ ...payload, orderId, organization_id: targetOrgId });
      } catch (e) {
        console.warn('Offline order queue notice:', e);
      }
      return orderId;
    }

    try {
      const { data, error } = await supabase.rpc('create_restaurant_order', { 
        ...payload, 
        p_warehouse_id: payload.p_warehouse_id || settings?.default_warehouse_id,
        p_org_id: targetOrgId 
      });
      if (error) throw error;
      return data;
    } catch (err: any) {
      const orderId = 'ord-offline-' + Date.now();
      try {
        await offlineService.queueOrder({ ...payload, orderId, organization_id: targetOrgId });
      } catch (e) {}
      return orderId;
    }
  };

  const getOpenTableOrder = async (tableId: string) => {
    if (!navigator.onLine || isDemo) {
      const offlineOrders = getOfflineTableOrders();
      if (offlineOrders[tableId]) {
        return offlineOrders[tableId];
      }
      return { sessionId: 'session-' + Date.now(), orderId: null, items: [] };
    }

    try {
      const { data } = await supabase.rpc('get_open_table_order', { p_table_id: tableId });
      if (data?.orderId && data?.items && data.items.length > 0) {
        return data;
      }
    } catch (rpcErr) {
      console.warn('RPC get_open_table_order notice:', rpcErr);
    }

    try {
      const { data: session } = await supabase
        .from('table_sessions')
        .select('id, organization_id')
        .eq('table_id', tableId)
        .eq('status', 'OPEN')
        .is('end_time', null)
        .maybeSingle();

      if (session?.id) {
        const { data: order } = await supabase
          .from('orders')
          .select(`
            id, warehouse_id, status,
            order_items (
              id, product_id, quantity, unit_price, unit_cost, notes, modifiers,
              products (name)
            )
          `)
          .eq('session_id', session.id)
          .neq('status', 'PAID')
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (order?.id && order.order_items && order.order_items.length > 0) {
          const formattedItems = order.order_items.map((oi: any) => ({
            id: oi.id,
            productId: oi.product_id,
            name: oi.products?.name || 'صنف',
            quantity: Number(oi.quantity),
            unitPrice: Number(oi.unit_price),
            unitCost: Number(oi.unit_cost),
            notes: oi.notes,
            selectedModifiers: oi.modifiers || [],
            savedQuantity: Number(oi.quantity)
          }));

          return {
            sessionId: session.id,
            orderId: order.id,
            warehouseId: order.warehouse_id,
            items: formattedItems
          };
        }

        return { sessionId: session.id, orderId: null, items: [] };
      }
    } catch (fbErr) {
      console.warn('Fallback getOpenTableOrder notice:', fbErr);
    }

    const offlineOrders = getOfflineTableOrders();
    return offlineOrders[tableId] || null;
  };

  const completeRestaurantOrder = async (orderId: string, method: string, total: number, accountId: string | null, warehouseId?: string) => {
    if (!navigator.onLine || isDemo || String(orderId).startsWith('ord-offline-')) {
      const offlineOrders = getOfflineTableOrders();
      for (const [tableId, ord] of Object.entries(offlineOrders)) {
        if (ord.orderId === orderId || !orderId) {
          setOfflineTableOrder(tableId, null);
          setRestaurantTables(prev => prev.map(t => t.id === tableId ? { ...t, status: 'AVAILABLE', session_id: null } : t));
          break;
        }
      }
      showToast('تم إتمام الطلب بنجاح (وضع أوفلاين) ✅', 'success');
      return;
    }

    try {
      const { error } = await supabase.rpc('complete_restaurant_order', { 
        p_order_id: orderId, 
        p_payment_method: method, 
        p_amount: total, 
        p_cash_account_id: accountId, 
        p_org_id: currentSelectedOrgId || currentUser?.organization_id,
        p_warehouse_id: warehouseId
      });
      if (error) throw error;
      refreshData();
    } catch (err: any) {
      const offlineOrders = getOfflineTableOrders();
      for (const [tableId, ord] of Object.entries(offlineOrders)) {
        if (ord.orderId === orderId) {
          setOfflineTableOrder(tableId, null);
          setRestaurantTables(prev => prev.map(t => t.id === tableId ? { ...t, status: 'AVAILABLE', session_id: null } : t));
          break;
        }
      }
      showToast('تم حفظ العملية محلياً وإتمام السداد بنجاح ✅', 'success');
    }
  };

  const processSplitPayment = async (orderId: string, items: any[], method: string, total: number, accountId: string) => {
    if (!navigator.onLine || isDemo) {
      showToast('تم الدفع الجزئي بنجاح (محلياً)', 'success');
      return true;
    }
    try {
      const { error } = await supabase.rpc('process_split_payment', { p_order_id: orderId, p_items: items, p_payment_method: method, p_amount: total, p_cash_account_id: accountId, p_org_id: currentSelectedOrgId });
      if (error) { showToast(error.message, 'error'); return false; }
      refreshData();
      return true;
    } catch {
      return true;
    }
  };

  const addRestaurantTable = async (data: any) => { 
    const targetOrgId = getEffectiveOrgId();
    if (!navigator.onLine || isDemo) {
      const newT = { ...data, id: 'tbl-' + Date.now(), organization_id: targetOrgId, status: data.status || 'AVAILABLE' };
      setRestaurantTables(prev => [...prev, newT]);
      showToast('تمت إضافة الطاولة بنجاح (محلياً)', 'success');
      return;
    }
    try {
      const { error } = await supabase.from('restaurant_tables').insert({ ...data, organization_id: targetOrgId }); 
      if (error) throw error;
      await refreshData(); 
    } catch (err: any) {
      const newT = { ...data, id: 'tbl-' + Date.now(), organization_id: targetOrgId, status: data.status || 'AVAILABLE' };
      setRestaurantTables(prev => [...prev, newT]);
      showToast('تمت إضافة الطاولة بنجاح (محلياً)', 'success');
    }
  };
  const updateRestaurantTable = async (id: string, data: any) => { 
    if (!navigator.onLine || isDemo) {
      setRestaurantTables(prev => prev.map(t => t.id === id ? { ...t, ...data } : t));
      showToast('تم تحديث بيانات الطاولة بنجاح', 'success');
      return;
    }
    try {
      await supabase.from('restaurant_tables').update(data).eq('id', id); 
      refreshData(); 
    } catch {
      setRestaurantTables(prev => prev.map(t => t.id === id ? { ...t, ...data } : t));
    }
  };
  const deleteRestaurantTable = async (id: string) => { 
    if (!navigator.onLine || isDemo) {
      setRestaurantTables(prev => prev.filter(t => t.id !== id));
      showToast('تم حذف الطاولة بنجاح', 'success');
      return;
    }
    try {
      await supabase.from('restaurant_tables').delete().eq('id', id); 
      refreshData(); 
    } catch {
      setRestaurantTables(prev => prev.filter(t => t.id !== id));
    }
  };
  
  const updateKitchenOrderStatus = async (id: string, status: string) => {
    if (!navigator.onLine || isDemo) return;
    try {
      await supabase.from('kitchen_orders').update({ status }).eq('id', id);
    } catch (e) {}
  };

  const startShift = async (amount: number) => { 
    const targetOrgId = getEffectiveOrgId();
    const treasuryAcc = getSystemAccount('CASH');

    if (!navigator.onLine || isDemo) {
      const newShift = {
        id: 'shift-offline-' + Date.now(),
        shift_number: 'SHIFT-' + Math.floor(1000 + Math.random() * 9000),
        user_id: currentUser?.id || authUser?.id || 'demo-user',
        cashier_id: currentUser?.id || authUser?.id || 'demo-user',
        opening_balance: Number(amount) || 0,
        status: 'OPEN',
        start_time: new Date().toISOString(),
        organization_id: targetOrgId
      };
      setCurrentShift(newShift);
      try {
        localStorage.setItem('tripro_offline_current_shift', JSON.stringify(newShift));
      } catch (e) {}
      showToast('تم بدء وردية الكاشير بنجاح (محلياً) ✅', 'success');
      return;
    }

    try {
      const { error } = await supabase.rpc('start_pos_shift', { 
        p_opening_balance: Number(amount) || 0,
        p_resume_existing: false,
        p_treasury_account_id: treasuryAcc?.id || null,
        p_user_id: currentUser?.id,
        p_org_id: targetOrgId,
        p_terminal_id: null
      }); 
      if (error) throw error;
      await refreshData(); 
    } catch (err: any) {
      const newShift = {
        id: 'shift-offline-' + Date.now(),
        shift_number: 'SHIFT-' + Math.floor(1000 + Math.random() * 9000),
        user_id: currentUser?.id || authUser?.id || 'demo-user',
        cashier_id: currentUser?.id || authUser?.id || 'demo-user',
        opening_balance: Number(amount) || 0,
        status: 'OPEN',
        start_time: new Date().toISOString(),
        organization_id: targetOrgId
      };
      setCurrentShift(newShift);
      showToast('تم بدء الوردية محلياً (وضع أوفلاين) ✅', 'success');
    }
  };

  const closeCurrentShift = async (actualCash: number, notes: string) => { 
    if (!navigator.onLine || isDemo) {
      setCurrentShift(null);
      try {
        localStorage.removeItem('tripro_offline_current_shift');
      } catch (e) {}
      showToast('تم إغلاق الوردية محلياً بنجاح 🔒', 'success');
      return;
    }
    const shiftId = Array.isArray(currentShift) ? currentShift[0]?.id : currentShift?.id;
    if (!shiftId) {
      throw new Error('لا توجد وردية مفتوحة حالياً ليتم إغلاقها');
    }
    try {
      const { error } = await supabase.rpc('close_shift', { 
        p_shift_id: shiftId, 
        p_actual_cash: actualCash, 
        p_notes: notes,
        p_org_id: currentSelectedOrgId || currentUser?.organization_id
      }); 
      if (error) throw error;
      setCurrentShift(null);
    } catch (err) {
      setCurrentShift(null);
      showToast('تم إغلاق الوردية محلياً 🔒', 'success');
    }
  };

  const getCurrentShiftSummary = async () => { 
    const shiftId = Array.isArray(currentShift) ? currentShift[0]?.id : currentShift?.id;
    if (!shiftId) return null; 
    if (!navigator.onLine || isDemo || String(shiftId).startsWith('shift-offline-')) {
      return {
        opening_balance: Number(currentShift?.opening_balance || 0),
        total_sales: 0,
        cash_sales: 0,
        card_sales: 0,
        order_count: 0
      };
    }
    try {
      const { data, error } = await supabase.rpc('get_shift_summary', { p_shift_id: shiftId }); 
      if (error) throw error;
      return data; 
    } catch (err) {
      return {
        opening_balance: Number(currentShift?.opening_balance || 0),
        total_sales: 0,
        cash_sales: 0,
        card_sales: 0,
        order_count: 0
      };
    }
  };

  const createMissingSystemAccounts = async () => await supabase.rpc('create_missing_system_accounts');
  const recalculateAllBalances = async () => { await supabase.rpc('recalculate_all_balances'); showToast('تم تحديث الأرصدة', 'success'); };
    const purgeDeletedRecords = async () => { 
    const { error } = await supabase.rpc('purge_deleted_records'); 
    if (error) { showToast('فشل تنظيف السجلات: ' + error.message, 'error'); return; }
    showToast('تم تنظيف السجلات المحذوفة بنجاح ✅', 'success');
    refreshData(); 
  };
  const refreshSaasSchema = async () => { await supabase.rpc('refresh_saas_schema'); showToast('جاري تحديث هيكل النظام...', 'info'); setTimeout(() => window.location.reload(), 1500); };
  const closeFinancialYear = async (year: number, date: string) => {
    const targetOrgId = currentSelectedOrgId || currentUser?.organization_id;
    if (!targetOrgId) {
      showToast('تعذر تحديد معرف المؤسسة.', 'error');
      return false;
    }

    try {
      // 1. فحص وتصحيح حساب الأرباح المبقاة (32) ليكون حساباً فرعياً قابلاً للترحيل
      const { data: retAccounts } = await supabase
        .from('accounts')
        .select('id, code, is_group')
        .eq('organization_id', targetOrgId)
        .eq('code', '32');

      if (retAccounts && retAccounts.length > 0) {
        if (retAccounts[0].is_group) {
          await supabase
            .from('accounts')
            .update({ is_group: false })
            .eq('id', retAccounts[0].id);
        }
      } else {
        const { data: parent3 } = await supabase
          .from('accounts')
          .select('id')
          .eq('organization_id', targetOrgId)
          .eq('code', '3')
          .maybeSingle();

        await supabase.from('accounts').insert({
          organization_id: targetOrgId,
          code: '32',
          name: 'الأرباح المبقاة / المرحلة',
          type: 'EQUITY',
          is_group: false,
          is_active: true,
          parent_id: parent3?.id || null
        });
      }

      // 2. تصحيح أي حسابات إيرادات أو مصروفات (4/5) معلّمة بالخطأ كـ is_group ولها قيود مرحلة
      const { data: groupIncomeAccounts } = await supabase
        .from('accounts')
        .select('id, code, is_group')
        .eq('organization_id', targetOrgId)
        .eq('is_group', true)
        .or('code.like.4%,code.like.5%');

      if (groupIncomeAccounts && groupIncomeAccounts.length > 0) {
        for (const gAcc of groupIncomeAccounts) {
          const { data: hasLines } = await supabase
            .from('journal_lines')
            .select('id')
            .eq('account_id', gAcc.id)
            .limit(1);

          if (hasLines && hasLines.length > 0) {
            await supabase
              .from('accounts')
              .update({ is_group: false })
              .eq('id', gAcc.id);
          }
        }
      }

      // 3. استدعاء محرك الإقفال السنوي
      const { data, error } = await supabase.rpc('close_financial_year', { 
        p_year: year, 
        p_closing_date: date,
        p_org_id: targetOrgId
      });

      if (error) { 
        showToast('فشل إقفال السنة: ' + error.message, 'error'); 
        return false; 
      }

      showToast(typeof data === 'string' ? data : `تم إقفال السنة المالية ${year} بنجاح ✅`, 'success');
      await refreshData();
      return true;
    } catch (err: any) {
      console.error('Error during closeFinancialYear:', err);
      showToast('فشل إقفال السنة: ' + err.message, 'error');
      return false;
    }
  };

  const reopenFinancialYear = async (year: number) => {
    const targetOrgId = currentSelectedOrgId || currentUser?.organization_id;
    const { data, error } = await supabase.rpc('reopen_financial_year', { 
      p_year: year,
      p_org_id: targetOrgId || null
    });
    if (error) { 
      showToast('فشل إعادة فتح السنة: ' + error.message, 'error'); 
      return false; 
    }
    showToast(typeof data === 'string' ? data : `تم فتح السنة المالية ${year} بنجاح 🔓`, 'success');
    await refreshData();
    return true;
  };
  const exportData = async () => { /* Logic to export JSON */ };

  const deleteOrganization = useCallback(async (orgId: string) => {
    if (currentUser?.role !== 'super_admin' && currentUser?.role !== 'admin') {
      showToast('ليس لديك صلاحية لحذف الشركات.', 'error');
      return { success: false, message: 'ليس لديك صلاحية لحذف الشركات.' };
    }

    if (!window.confirm('⚠️ تحذير: سيتم حذف هذه الشركة وجميع بياناتها (الحسابات، الفواتير، المخزون...) بشكل نهائي.\n\nلا يمكن التراجع عن هذا الإجراء.\n\nهل أنت متأكد تماماً؟')) {
      return { success: false, message: 'تم إلغاء عملية الحذف.' };
    }

    try {
      // 1. استدعاء دالة الحذف الآمنة التي تتجاوز الحماية السيادية في قاعدة البيانات
      let deleteResult = await supabase.rpc('fn_delete_organization_safe', { p_org_id: orgId });

      // 2. إذا حدث خطأ قيود مرجعية نقوم بتفكيك القيود برمجياً وإعادة المحاولة
      if (deleteResult.error) {
        console.warn('RPC delete failed in context, initiating cascade cleanup...', deleteResult.error);
        try {
          await supabase.from('profiles').update({ organization_id: null }).eq('organization_id', orgId);
          await supabase.from('role_permissions').delete().eq('organization_id', orgId);
          await supabase.from('roles').delete().eq('organization_id', orgId);

          // استخراج معرفات الأصناف التابعة للمنظمة لفك أي قيود معلقة عليها
          const { data: orgProducts } = await supabase.from('products').select('id').eq('organization_id', orgId);
          const prodIds = (orgProducts || []).map((p: any) => p.id).filter(Boolean);

          // 1. تفكيك موديول التشفية والذبائح (Butchering Module)
          try {
            if (prodIds.length > 0) {
              await supabase.from('butchering_order_items').delete().in('output_product_id', prodIds);
              await supabase.from('butchering_template_items').delete().in('output_product_id', prodIds);
              await supabase.from('butchering_orders').delete().in('source_product_id', prodIds);
              await supabase.from('butchering_templates').delete().in('source_product_id', prodIds);
            }
            await supabase.from('butchering_orders').delete().eq('organization_id', orgId);
            await supabase.from('butchering_templates').delete().eq('organization_id', orgId);
          } catch (_) {}

          // 2. تفكيك موديول التصنيع (Manufacturing Module)
          try {
            if (prodIds.length > 0) {
              await supabase.from('mfg_actual_material_usage').delete().in('raw_material_id', prodIds);
              await supabase.from('mfg_scrap_logs').delete().in('product_id', prodIds);
              await supabase.from('mfg_batch_serials').delete().in('product_id', prodIds);
              await supabase.from('mfg_step_materials').delete().in('raw_material_id', prodIds);
              await supabase.from('bill_of_materials').delete().in('product_id', prodIds);
              await supabase.from('bill_of_materials').delete().in('raw_material_id', prodIds);
              await supabase.from('mfg_production_orders').delete().in('product_id', prodIds);
              await supabase.from('mfg_routings').delete().in('product_id', prodIds);
            }
          } catch (_) {}

          // 3. تفكيك قيود المطاعم ونقاط البيع (Restaurant & Channel Pricing)
          try {
            if (prodIds.length > 0) {
              await supabase.from('kitchen_ticket_items').delete().in('product_id', prodIds);
              await supabase.from('product_channel_prices').delete().in('product_id', prodIds);
              await supabase.from('recipe_items').delete().in('product_id', prodIds);
              await supabase.from('recipe_items').delete().in('ingredient_id', prodIds);
              await supabase.from('combo_items').delete().in('product_id', prodIds);
              await supabase.from('combo_items').delete().in('included_product_id', prodIds);
            }
          } catch (_) {}

          const tablesToClean = [
            'butchering_order_items', 'butchering_orders', 'butchering_template_items', 'butchering_templates',
            'mfg_actual_material_usage', 'mfg_scrap_logs', 'mfg_batch_serials', 'mfg_production_variances',
            'mfg_order_progress', 'mfg_step_materials', 'mfg_step_attachments', 'mfg_routing_steps',
            'mfg_production_order_materials', 'mfg_production_order_steps',
            'mfg_scrap_records', 'mfg_qc_inspections', 'mfg_production_orders', 'mfg_routings', 'mfg_work_centers',
            'order_item_modifiers', 'order_items', 'kitchen_ticket_items', 'kitchen_orders', 'orders',
            'product_channel_prices', 'recipe_items', 'restaurant_recipes', 'combo_items',
            'invoice_items', 'purchase_invoice_items', 'sales_return_items', 'purchase_return_items',
            'stock_adjustment_items', 'journal_lines', 'payroll_variables', 'payroll_items',
            'delivery_order_items', 'inventory_count_items', 'waste_records', 'transfer_items',
            'invoices', 'purchase_invoices', 'sales_returns', 'purchase_returns', 'journal_entries',
            'payments', 'receipt_vouchers', 'payment_vouchers', 'cheques', 'payrolls', 'stock_adjustments',
            'stock_transfers', 'inventory_counts', 'delivery_orders',
            'work_orders', 'bill_of_materials', 'credit_notes', 'debit_notes', 'shifts', 'table_sessions',
            'cashier_shifts', 'pos_petty_cash_payouts', 'waiter_call_requests', 'tips_distribution_records',
            'restaurant_tables', 'modifiers', 'modifier_groups',
            'promotions', 'retail_promotions', 'stadium_bookings', 'stadium_subscriptions', 'construction_projects',
            'products', 'customers', 'suppliers', 'accounts', 'warehouses', 'cost_centers', 'assets',
            'employees', 'company_settings', 'invitations', 'budgets', 'notification_preferences', 'security_logs', 'audit_logs'
          ];
          for (const tbl of tablesToClean) {
            try { await (supabase.from(tbl as any) as any).delete().eq('organization_id', orgId); } catch (_) {}
          }

          deleteResult = await supabase.rpc('fn_delete_organization_safe', { p_org_id: orgId });

          if (deleteResult.error) {
            const directDelete = await supabase.from('organizations').delete().eq('id', orgId);
            if (directDelete.error) {
              throw new Error(deleteResult.error.message || directDelete.error.message);
            }
          }
        } catch (cleanupErr: any) {
          throw new Error(deleteResult.error?.message || cleanupErr.message);
        }
      }

      showToast('تم حذف الشركة وجميع بياناتها بنجاح ✅', 'success');
      await refreshData(); // تحديث القائمة بعد الحذف
      return { success: true };
    } catch (e: any) {
      showToast(`حدث خطأ غير متوقع: ${e.message}`, 'error');
      return { success: false, message: e.message };
    }
  }, [currentUser, showToast, refreshData]);

  const value: AccountingContextType = {
    organization, currentUser, organizations, currentSelectedOrgId, setCurrentSelectedOrgId, isLoading, lastUpdated, settings, accounts, entries, assets, budgets, vouchers, costCenters, getFinancialSummary,
    fetchEntriesPaged, employees, products, transfers, purchaseInvoices, invoices, salespeople, categories,
    users, warehouses, restaurantTables, menuCategories, customers, suppliers, cheques,
    currentShift, activityLog, refreshData, isDemo, can, clearCache,
    // Accounting Functions
    addEntry, getSystemAccount, updateVoucher, getAccountBalanceInPeriod, addAccount, updateAccount, deleteAccount, clearTransactions, emptyRecycleBin, saveBudget,
    // Inventory Functions
    recalculateStock, addProduct, updateProduct, deleteProduct, addStockTransfer,
    approveStockTransfer, cancelStockTransfer, addWarehouse, updateWarehouse,
    deleteWarehouse, addWastage, produceItem,
    // Sales & Purchases
    addCustomer, updateCustomer, deleteCustomer, addSupplier, updateSupplier,
    deleteSupplier, approveInvoice, unpostSalesInvoice, deleteSalesInvoice, approvePurchaseInvoice, unpostPurchaseInvoice, deletePurchaseInvoice, convertPoToInvoice,
    addOpeningBalanceTransaction, addPaymentVoucher,
    // Assets & Cheques
    addAsset, updateAsset, deleteAsset, runDepreciation, revaluateAsset, addCheque, updateCheque, deleteCheque, updateChequeStatus, addTransfer, updateTransfer, deleteTransfer,
    restoreItem, permanentDeleteItem, exportJournalToCSV,
    // HR
    addEmployee, updateEmployee, deleteEmployee, runPayroll,
    // Restaurant
    finalizeProductionOrder, openTableSession, reserveTable, cancelReservation,
    transferTableSession, mergeTableSessions, createRestaurantOrder, getOpenTableOrder,
    completeRestaurantOrder, processSplitPayment, addRestaurantTable, updateRestaurantTable,
    deleteRestaurantTable, updateKitchenOrderStatus, startShift, closeCurrentShift,
    getCurrentShiftSummary, createMissingSystemAccounts, recalculateAllBalances,
    purgeDeletedRecords, refreshSaasSchema, closeFinancialYear, reopenFinancialYear, exportData,
    selectedFiscalYear, setSelectedFiscalYear, fiscalYearRange,
    // Demo
    addDemoEntry, addDemoPaymentVoucher, addDemoReceiptVoucher, addDemoInvoice,
    deleteOrganization,
    postDemoSalesInvoice, addDemoPurchaseInvoice
  };

  return (
    <AccountingContext.Provider value={value}>
      {children}
    </AccountingContext.Provider>
  );
};
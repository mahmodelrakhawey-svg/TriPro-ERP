import React, { createContext, useContext, useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { supabase } from '../supabaseClient';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { 
  Account, JournalEntry, JournalEntryLine, SystemSettings, UserRole, Organization, 
  HrScope, DashboardViewMode, Customer, Supplier, Warehouse, Category, Product, 
  Salesperson, Invoice, Employee, Cheque, Asset, Budget, CostCenter, PaymentVoucher, 
  PurchaseInvoice, RestaurantTable, MenuCategory, StockTransfer, User, ShiftReconciliationData 
} from '../types';
import { secureStorage } from '../utils/securityMiddleware';
import { logger } from '../utils/logger';
import { validateEntryBalance, deriveAccountMappings } from '../utils/financialSafety';

export interface UserProfile {
  id: string;
  full_name: string | null;
  role: UserRole;
  organization_id: string | null;
  is_active: boolean;
  avatar_url?: string;
  hr_scope?: HrScope;
  can_view_dashboard?: boolean;
  can_access_mobile?: boolean;
  dashboard_view_mode?: DashboardViewMode;
  allowed_treasury_ids?: string[];
}


import { offlineService, isValidUUID } from '../services/offlineService';
import { setActiveOrgId, getActiveOrgIdSync } from '../services/tenantContext';
import { deleteOrganizationSafe } from '../services/organizationService';
import { fetchCompleteDataset } from '../services/balanceService';
import { fetchJournalEntriesWithLines } from '../utils/journalPagination';
import { normalizeCompanySettings, syncLenzaNegativeStockIfNeeded, resolveSystemAccount } from './domains/domainUtils';
import {
  restoreRecycleItem,
  permanentDeleteRecycleItem,
  clearAllOrgTransactions,
  emptyOrgRecycleBin,
  purgeOrgDeletedRecords,
  refreshOrgSaasSchema,
  exportOrganizationDataset,
} from '../services/systemMaintenanceService';
import {
  SYSTEM_ACCOUNTS,
  DEFAULT_OFFLINE_ORG,
  DEFAULT_OFFLINE_TABLES,
  DEFAULT_OFFLINE_CATEGORIES,
  DEFAULT_OFFLINE_PRODUCTS,
  DEFAULT_OFFLINE_ACCOUNTS,
  DEFAULT_OFFLINE_WAREHOUSES,
  getOfflineTableOrders,
  setOfflineTableOrder
} from './accountingConstants';

type DynamicQuery = any;
type DynamicParam = any;

export {
  SYSTEM_ACCOUNTS,
  DEFAULT_OFFLINE_ORG,
  DEFAULT_OFFLINE_TABLES,
  DEFAULT_OFFLINE_CATEGORIES,
  DEFAULT_OFFLINE_PRODUCTS,
  DEFAULT_OFFLINE_ACCOUNTS,
  DEFAULT_OFFLINE_WAREHOUSES,
  getOfflineTableOrders,
  setOfflineTableOrder
};

interface AccountingContextType {
  organization: any;
  currentUser: UserProfile | null;
  organizations: any[];
  currentSelectedOrgId: string | null;
  setCurrentSelectedOrgId: (id: string | null) => void;
  effectiveOrgId: string;
  getEffectiveOrgId: () => string;
  isLoading: boolean;
  settings: any;
  accounts: Account[];
  entries: JournalEntry[];
  assets: any[];
  budgets: any[];
  vouchers: any[];
  costCenters: any[];
  employees: any[];
  products: Product[];
  transfers: any[];
  purchaseInvoices: any[];
  lastUpdated: Date | null;
  invoices: any[];
  salespeople: Salesperson[];
  categories: Category[];
  users: any[];
  warehouses: Warehouse[];
  restaurantTables: any[];
  menuCategories: any[];
  customers: Customer[];
  suppliers: Supplier[];
  cheques: any[];
  currentShift: any;
  activityLog: any[];
  logActivity?: (action: string, details: string) => void;
  refreshData: () => Promise<void>;
  refreshCustomers?: () => Promise<void>;
  refreshSuppliers?: () => Promise<void>;
  refreshSalesAndPurchases?: () => Promise<void>;
  refreshBanking?: () => Promise<void>;
  refreshBankingAndShift?: () => Promise<void>;
  refreshAccountsAndLedger?: () => Promise<void>;
  refreshLedger?: () => Promise<void>;
  refreshSettings?: () => Promise<void>;
  refreshEmployees?: () => Promise<void>;
  updateSettings?: (newSettings: Record<string, unknown>) => Promise<void>;
  fetchEntriesPaged: (page: number, pageSize: number) => Promise<{ data: any[], count: number }>;

  isDemo: boolean;
  clearCache: () => void;
  getFinancialSummary: () => Promise<any>;
  // --- دالة الصلاحيات ---
  can: (module: string, action: string) => boolean;
  // --- الدوال المحاسبية ---
  addEntry: (entry: DynamicParam) => Promise<void>;
  getSystemAccount: (key: string) => any;
  updateVoucher: (id: string, updates: DynamicParam) => Promise<boolean>;
  getAccountBalanceInPeriod: (id: string, start: string, end: string) => Promise<number>;
  addAccount: (acc: Partial<Account>) => Promise<any>;
  updateAccount: (id: string, updates: Partial<Account>) => Promise<void>;
  deleteAccount: (id: string, reason?: string) => Promise<{ success: boolean; message?: string }>;
  clearTransactions: () => Promise<void>;
  emptyRecycleBin: (table: string) => Promise<void>;
  saveBudget: (budget: DynamicParam) => Promise<void>;
  // --- دوال المخزون ---
  recalculateStock: (productId?: string) => Promise<void>;
  addProduct: (product: Partial<Product>) => Promise<any>;
  updateProduct: (id: string, updates: Partial<Product>) => Promise<void>;
  deleteProduct: (id: string, reason?: string) => Promise<void>;
  addStockTransfer: (transfer: DynamicParam) => Promise<void>;
  approveStockTransfer: (id: string) => Promise<void>;
  cancelStockTransfer: (id: string) => Promise<void>;
  addWarehouse: (warehouse: Partial<Warehouse>) => Promise<void>;
  updateWarehouse: (id: string, updates: Partial<Warehouse>) => Promise<void>;
  deleteWarehouse: (id: string) => Promise<void>;
  addWastage: (wastage: DynamicParam) => Promise<boolean>;
  produceItem: (id: string, qty: number, whId: string, date: string, cost: number, ref: string) => Promise<any>;
  // --- دوال المبيعات والمشتريات ---
  addCustomer: (customer: Partial<Customer>) => Promise<any>;
  updateCustomer: (id: string, updates: Partial<Customer>) => Promise<void>;
  deleteCustomer: (id: string, reason?: string) => Promise<void>;
  addSupplier: (supplier: Partial<Supplier>) => Promise<any>;
  updateSupplier: (id: string, updates: Partial<Supplier>) => Promise<void>;
  deleteSupplier: (id: string, reason?: string) => Promise<void>;
  approveInvoice: (id: string, orgId?: string, warehouseId?: string) => Promise<boolean>;
  unpostSalesInvoice: (id: string, orgId?: string) => Promise<boolean>;
  deleteSalesInvoice: (id: string, orgId?: string) => Promise<boolean>;
  approvePurchaseInvoice: (id: string, orgId?: string, warehouseId?: string) => Promise<void>;
  unpostPurchaseInvoice: (id: string, orgId?: string) => Promise<boolean>;
  deletePurchaseInvoice: (id: string, orgId?: string) => Promise<boolean>;
  unpostPurchaseReturn: (id: string, orgId?: string) => Promise<boolean>;
  deletePurchaseReturn: (id: string, orgId?: string) => Promise<boolean>;
  unpostSalesReturn: (id: string, orgId?: string) => Promise<boolean>;
  deleteSalesReturn: (id: string, orgId?: string) => Promise<boolean>;
  convertPoToInvoice: (poId: string, warehouseId?: string, orgId?: string) => Promise<void>;
  addOpeningBalanceTransaction: (id: string, type: string, amount: number, date: string, name: string) => Promise<void>;
  addPaymentVoucher: (voucher: DynamicParam) => Promise<void>;
  // --- دوال الأصول والشيكات ---
  addAsset: (asset: Partial<Asset>) => Promise<void>;
  updateAsset: (id: string, updates: Partial<Asset>) => Promise<void>;
  deleteAsset: (id: string) => Promise<void>;
  runDepreciation: (id?: string, amount?: number, date?: string) => Promise<void>;
  revaluateAsset: (id: string, val: number, date: string, accId: string) => Promise<void>;
  refreshAssets?: () => Promise<void>;
  addCheque: (cheque: Partial<Cheque>) => Promise<void>;
  updateCheque: (id: string, cheque: Partial<Cheque>) => Promise<void>;
  deleteCheque: (id: string) => Promise<void>;
  updateChequeStatus: (id: string, status: string, date: string, bankId?: string) => Promise<void>;
  addTransfer: (transfer: DynamicParam) => Promise<void>;
  updateTransfer: (id: string, transfer: DynamicParam) => Promise<void>;
  deleteTransfer: (id: string) => Promise<void>;
  restoreItem: (table: string, id: string) => Promise<{ success: boolean; message?: string }>;
  permanentDeleteItem: (table: string, id: string) => Promise<{ success: boolean; message?: string }>;
  exportJournalToCSV: () => void;
  // --- دوال الموارد البشرية ---
  addEmployee: (employee: Partial<Employee>) => Promise<void>;
  updateEmployee: (id: string, updates: Partial<Employee>) => Promise<void>;
  deleteEmployee: (id: string, reason?: string) => Promise<void>;
  runPayroll: (month: number, year: number, date: string, treasuryId: string, data: any[], orgId?: string) => Promise<void>;
  runPayrollAccrual: (month: number, year: number, date: string, data: any[], orgId?: string) => Promise<any>;
  payAccruedPayroll: (params: { payrollId?: string; month?: number; year?: number; paymentDate: string; treasuryId: string; orgId?: string }) => Promise<any>;
  cancelPayrollAccrual: (payrollId: string, orgId?: string) => Promise<void>;
  // --- دوال المطاعم ---
  finalizeProductionOrder: (id: string, status: string, notes: string) => Promise<any>;
  openTableSession: (tableId: string) => Promise<string | null>;
  reserveTable: (tableId: string, name: string, time: string) => Promise<boolean>;
  cancelReservation: (tableId: string) => Promise<void>;
  transferTableSession: (sessionId: string, targetTableId: string) => Promise<boolean>;
  mergeTableSessions: (sourceId: string, targetId: string) => Promise<boolean>;
  createRestaurantOrder: (payload: DynamicParam) => Promise<string>;
  getOpenTableOrder: (tableId: string) => Promise<any>;
  completeRestaurantOrder: (orderId: string, method: string, total: number, accountId: string | null, warehouseId?: string) => Promise<void>;
  processSplitPayment: (orderId: string, items: any[], method: string, total: number, accountId: string) => Promise<boolean>;
  addRestaurantTable: (data: DynamicParam) => Promise<void>;
  updateRestaurantTable: (id: string, data: DynamicParam) => Promise<void>;
  deleteRestaurantTable: (id: string) => Promise<void>;
  updateKitchenOrderStatus: (id: string, status: string) => Promise<void>;
  startShift: (amount: number) => Promise<void>;
  closeCurrentShift: (actualCash: number, notes: string, reconciliation?: ShiftReconciliationData | null) => Promise<void>;
  getCurrentShiftSummary: () => Promise<any>;
  refreshRestaurant?: () => Promise<void>;
  createMissingSystemAccounts: () => Promise<any>;
  recalculateAllBalances: () => Promise<void>;
  purgeDeletedRecords: () => Promise<void>;
  refreshSaasSchema: () => Promise<void>;
  closeFinancialYear: (year: number, date: string) => Promise<boolean>;
  reopenFinancialYear: (year: number) => Promise<boolean>;
  exportData: () => Promise<void>;
  // --- دوال الديمو ---
  addDemoEntry: (entry: Partial<JournalEntry>) => void;
  addDemoPaymentVoucher: (voucher: DynamicParam) => void;
  addDemoReceiptVoucher: (voucher: DynamicParam) => void;
  addDemoInvoice: (invoice: Partial<Invoice>) => void;
  postDemoSalesInvoice: (invoice: Partial<Invoice>) => void;
  addDemoPurchaseInvoice: (invoice: Partial<Invoice>) => void;
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
export { useProductDomain, ProductProvider } from './domains/ProductContext';
export { useCustomerDomain, CustomerProvider } from './domains/CustomerContext';
export { useSupplierDomain, SupplierProvider } from './domains/SupplierContext';
export { useSettingsDomain, SettingsProvider } from './domains/AccountingSettingsContext';
export { useSalesDomain, SalesProvider } from './domains/SalesContext';
export { useBankingDomain, BankingProvider } from './domains/BankingContext';
export { useGeneralLedgerDomain, GeneralLedgerProvider } from './domains/GeneralLedgerContext';
export { useHrDomain, HrProvider } from './domains/HrContext';
export { useRestaurantDomain, RestaurantProvider } from './domains/RestaurantContext';
export { useAssetDomain, AssetProvider } from './domains/AssetContext';
export { fetchAllTableRecords } from './domains/domainUtils';

import { useSettingsDomain, SettingsProvider } from './domains/AccountingSettingsContext';
import { useCustomerDomain, CustomerProvider } from './domains/CustomerContext';
import { useSupplierDomain, SupplierProvider } from './domains/SupplierContext';
import { useProductDomain, ProductProvider } from './domains/ProductContext';
import { useSalesDomain, SalesProvider } from './domains/SalesContext';
import { useBankingDomain, BankingProvider } from './domains/BankingContext';
import { useGeneralLedgerDomain, GeneralLedgerProvider } from './domains/GeneralLedgerContext';
import { useHrDomain, HrProvider } from './domains/HrContext';
import { useRestaurantDomain, RestaurantProvider } from './domains/RestaurantContext';
import { useAssetDomain, AssetProvider } from './domains/AssetContext';
import { fetchAllTableRecords } from './domains/domainUtils';

export const AccountingProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { currentUser: authUser, can } = useAuth();
  const { showToast } = useToast();
  const [organization, setOrganization] = useState<any>(null);
  const lenzaNegativeStockSyncedRef = useRef<Set<string>>(new Set());
  const [currentSelectedOrgId, setCurrentSelectedOrgIdState] = useState<string | null>(() => {
    return getActiveOrgIdSync() || secureStorage.getItem<string>('tripro_active_org_id') || null;
  });

  const setCurrentSelectedOrgId = useCallback((id: string | null) => {
    setCurrentSelectedOrgIdState(id);
    if (id) {
      secureStorage.setItem('tripro_active_org_id', id);
      if (id !== 'org-default-offline' && isValidUUID(id)) {
        setActiveOrgId(id);
      }
    } else {
      setActiveOrgId(null);
    }
  }, []);

  useEffect(() => {
    const handleOrgChange = (e: DynamicParam) => {
      const newOrgId = e.detail?.orgId || null;
      setCurrentSelectedOrgIdState(prev => (prev !== newOrgId ? newOrgId : prev));
    };
    if (typeof window !== 'undefined') {
      window.addEventListener('tripro:organization_changed', handleOrgChange);
      return () => window.removeEventListener('tripro:organization_changed', handleOrgChange);
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
        is_active: true,
        hr_scope: authUser.hr_scope,
        can_view_dashboard: authUser.can_view_dashboard,
        can_access_mobile: authUser.can_access_mobile,
        dashboard_view_mode: authUser.dashboard_view_mode,
        allowed_treasury_ids: authUser.allowed_treasury_ids,
      };
    }
    return null;
  });

  useEffect(() => {
    const cachedLastOrg = secureStorage.getItem<string>('tripro_last_valid_org_id') || null;
    if (authUser) {
      setCurrentUser(prev => ({
        id: authUser.id,
        full_name: authUser.name || prev?.full_name || 'مستخدم النظام',
        role: (authUser.role || prev?.role || 'viewer') as UserRole,
        organization_id: (authUser as any).organization_id || prev?.organization_id || cachedLastOrg || 'org-default-offline',
        is_active: prev?.is_active ?? true,
        hr_scope: authUser.hr_scope || prev?.hr_scope,
        can_view_dashboard: authUser.can_view_dashboard ?? prev?.can_view_dashboard,
        can_access_mobile: authUser.can_access_mobile ?? prev?.can_access_mobile,
        dashboard_view_mode: authUser.dashboard_view_mode || prev?.dashboard_view_mode || 'both',
        allowed_treasury_ids: authUser.allowed_treasury_ids || prev?.allowed_treasury_ids,
        avatar_url: prev?.avatar_url
      }));
    }
  }, [authUser]);

  const getEffectiveOrgId = useCallback(() => {
    const tenantActive = getActiveOrgIdSync(currentSelectedOrgId);
    if (tenantActive) return tenantActive;
    if (currentSelectedOrgId && currentSelectedOrgId !== 'org-default-offline') return currentSelectedOrgId;
    if (currentUser?.organization_id && currentUser.organization_id !== 'org-default-offline') return currentUser.organization_id;
    const cachedValidOrg = secureStorage.getItem<string>('tripro_last_valid_org_id') || 
      (typeof window !== 'undefined' ? window.localStorage?.getItem('tripro_last_valid_org_id') : null);
    if (cachedValidOrg && cachedValidOrg !== 'org-default-offline') return cachedValidOrg;
    return 'org-default-offline';
  }, [currentSelectedOrgId, currentUser?.organization_id]);

  const effectiveOrgId = useMemo(() => getEffectiveOrgId(), [getEffectiveOrgId]);

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
  const refreshDataPromiseRef = useRef<Promise<void> | null>(null);

  const logActivity = useCallback((action: string, details: string) => {
    const newLog = {
      id: `act-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      user: currentUser?.full_name || (currentUser as any)?.username || 'مستخدم النظام',
      action,
      details,
      date: new Date().toISOString()
    };
    setActivityLog(prev => [newLog, ...prev.slice(0, 49)]);
  }, [currentUser]);

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
      is_active: true,
      hr_scope: authUser?.hr_scope,
      can_view_dashboard: authUser?.can_view_dashboard,
      can_access_mobile: authUser?.can_access_mobile,
      dashboard_view_mode: authUser?.dashboard_view_mode || 'both',
      allowed_treasury_ids: authUser?.allowed_treasury_ids
    };
    setCurrentUser(fallbackProfile);
    setOrganization(effectiveOrgObj);
    setOrganizations([effectiveOrgObj]);
    setCurrentSelectedOrgId(effectiveOfflineOrgId);
    setAccounts(DEFAULT_OFFLINE_ACCOUNTS.map((a: Record<string, any>) => ({ ...a, isGroup: Boolean(a.is_group ?? a.isGroup) })));
    setProducts(DEFAULT_OFFLINE_PRODUCTS);
    setRestaurantTables(DEFAULT_OFFLINE_TABLES);
    setMenuCategories(DEFAULT_OFFLINE_CATEGORIES);
    setCategories(DEFAULT_OFFLINE_CATEGORIES);
    setWarehouses(DEFAULT_OFFLINE_WAREHOUSES);
    setCustomers([{ id: 'cust-walkin', name: 'عميل نقدي صالة', phone: '0000000000' }]);
    setSuppliers([{ id: 'sup-main', name: 'مورد عام معتمد', phone: '01000000000' }]);

    // استرجاع الوردية المفتوحة محلياً أو إنشاء وردية جاهزة للعمل
    let localShift: Record<string, any> | null = null;
    try {
      localShift = secureStorage.getItem<any>('tripro_offline_current_shift');
    } catch (e) {
      logger.warn('[AccountingContext] Failed to read offline shift from secureStorage:', e);
    }

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
        secureStorage.setItem('tripro_offline_current_shift', localShift);
      } catch (e) {
        logger.warn('[AccountingContext] Failed to save offline shift to secureStorage:', e);
      }
    }
    setCurrentShift(localShift);

    // زراعة المنتجات في قاعدة IndexedDB المحلية ليعمل كود الباركود والبحث الفوري بالتجزئة
    await offlineService.seedFallbackProducts(DEFAULT_OFFLINE_PRODUCTS);
    setLastUpdated(new Date());
    setIsLoading(false);
  }, [authUser]);

  const refreshData = useCallback(async () => {
    if (refreshDataPromiseRef.current) {
      return refreshDataPromiseRef.current;
    }
    const currentPromise = (async () => {
      if (!authUser) return;
      setIsLoading(true);

    // 📴 إذا كان التطبيق مفصولاً عن الإنترنت أو في وضع الديمو، ننتقل فوراً للبيانات المحلية بدون أي تأخير أو أخطاء
    if (!navigator.onLine || isDemo) {
      await loadOfflineFallbackData();
      return;
    }

    try {
      // جلب بيانات المنظمة والبروفايل
      let profile: DynamicParam = null;
      try {
        const { data: pData, error: profileError } = await supabase.from('profiles').select('*, organizations(*)').eq('id', authUser.id).single();
        if (!profileError && pData) {
          profile = pData;
          setCurrentUser({
            ...pData,
            dashboard_view_mode: pData.dashboard_view_mode || authUser?.dashboard_view_mode || 'both',
            can_view_dashboard: pData.can_view_dashboard ?? authUser?.can_view_dashboard ?? true
          } as UserProfile);
        }
      } catch (pErr) {
        logger.warn('Could not fetch online profile, using fallback:', pErr);
      }

      if (!profile) {
        await loadOfflineFallbackData();
        return;
      }

      // 🛡️ صمام أمان: جلب كافة الشركات لملء القائمة وضمان وجود منظمة نشطة حتمياً
      let allOrgs: Organization[] = [];
      try {
        const { data: orgsData } = await supabase.from('organizations').select('*').order('name');
        if (orgsData && orgsData.length > 0) {
          allOrgs = orgsData;
        }
      } catch (orgErr) {
        logger.warn('Could not fetch organizations from Supabase, using fallback:', orgErr);
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
      setCurrentUser(prev => prev ? { 
        ...prev, 
        organization_id: fetchOrgId,
        dashboard_view_mode: prev.dashboard_view_mode || authUser?.dashboard_view_mode || 'both',
        can_view_dashboard: prev.can_view_dashboard ?? authUser?.can_view_dashboard ?? true
      } : {
        id: authUser.id,
        full_name: authUser.name || 'مستخدم النظام',
        role: authUser.role as UserRole,
        organization_id: fetchOrgId,
        is_active: true,
        hr_scope: authUser.hr_scope,
        can_view_dashboard: authUser.can_view_dashboard ?? true,
        can_access_mobile: authUser.can_access_mobile,
        dashboard_view_mode: authUser.dashboard_view_mode || 'both',
        allowed_treasury_ids: authUser.allowed_treasury_ids
      });

      // جلب الإعدادات وتوحيد الحقول عبر الدالة المشتركة الآمنة
      const { data: sett } = await supabase.rpc('get_current_company_settings', { p_org_id: fetchOrgId }).maybeSingle();

      setSettings(normalizeCompanySettings((sett || {}) as Record<string, any>, activeOrgObj as Record<string, any> | null));

      syncLenzaNegativeStockIfNeeded({
        supabaseClient: supabase,
        orgId: fetchOrgId,
        orgObj: activeOrgObj as Record<string, any> | null,
        rawSettings: (sett || null) as Record<string, any> | null,
        userRole: authUser?.role,
        syncedOrgIds: lenzaNegativeStockSyncedRef.current,
      });

      // جلب الحسابات والمستودعات مع ترشيد الاستعلامات المالية بالسنة المالية النشطة
      const [accs, ents, ccs, emps, prods, trns, pinvs, invs, cats, usrs, whs, rTables, custs, sups, chqs, shift, assetData, budgetData] = await Promise.all([
        supabase.from('accounts').select('*').eq('organization_id', fetchOrgId).order('code'),
        Promise.resolve({ data: [] as JournalEntry[], error: null }), // مُعالج بالكامل في سياق النطاق GeneralLedgerProvider
        Promise.resolve({ data: [] as CostCenter[], error: null }), // مُعالج بالكامل في سياق النطاق GeneralLedgerProvider
        Promise.resolve({ data: [] as Employee[], error: null }), // مُعالج بالكامل في سياق النطاق HrProvider
        Promise.resolve({ data: [] as Product[], error: null }), // مُعالج بالكامل في سياق النطاق ProductProvider
        Promise.resolve({ data: [] as StockTransfer[], error: null }), // مُعالج بالكامل في سياق النطاق ProductProvider
        Promise.resolve({ data: [] as PurchaseInvoice[], error: null }), // مُعالج بالكامل في سياق النطاق SupplierProvider
        Promise.resolve({ data: [] as Invoice[], error: null }), // مُعالج بالكامل في سياق النطاق SalesProvider
        Promise.resolve({ data: [] as Category[], error: null }), // مُعالج بالكامل في سياق النطاق ProductProvider
        supabase.from('profiles').select('*').eq('organization_id', fetchOrgId).order('full_name'),
        Promise.resolve({ data: [] as Warehouse[], error: null }), // مُعالج بالكامل في سياق النطاق ProductProvider
        supabase.from('restaurant_tables').select('*').eq('organization_id', fetchOrgId).order('name'),
        Promise.resolve({ data: [] as Customer[], error: null }), // مُعالج بالكامل في سياق النطاق CustomerProvider
        Promise.resolve({ data: [] as Supplier[], error: null }), // مُعالج بالكامل في سياق النطاق SupplierProvider
        Promise.resolve({ data: [] as Cheque[], error: null }), // مُعالج بالكامل في سياق النطاق BankingProvider
        supabase.rpc('get_active_shift', { p_org_id: fetchOrgId }),
        Promise.resolve({ data: [] as Asset[], error: null }), // مُعالج بالكامل في سياق النطاق AssetProvider
        Promise.resolve({ data: [] as Budget[], error: null }) // مُعالج بالكامل في سياق النطاق GeneralLedgerProvider
      ]);

      const loadedAccounts = (accs.data && accs.data.length > 0) ? accs.data.map((acc: Record<string, any>) => ({
        ...acc,
        isGroup: Boolean(acc.is_group ?? acc.isGroup),
        type: acc.type ? acc.type.toUpperCase() : acc.type
      })) : DEFAULT_OFFLINE_ACCOUNTS.map((acc: Record<string, any>) => ({
        ...acc,
        isGroup: Boolean(acc.is_group ?? acc.isGroup)
      }));

      setAccounts(loadedAccounts);

      // 🛡️ فحص وتهيئة ربط الحسابات الافتراضية تلقائياً (Default Account Mappings Auto-Derivation & Verification)
      const currentRawMappings = { ...((sett as any)?.account_mappings || (sett as any)?.accountMappings || {}) };
      const { mappings: autoDerivedMappings, hasNewMappings } = deriveAccountMappings(loadedAccounts as any, currentRawMappings);
      if (hasNewMappings) {
        setSettings((prev: Record<string, any>) => ({
          ...prev,
          account_mappings: autoDerivedMappings,
          accountMappings: autoDerivedMappings
        }));

        if (fetchOrgId && fetchOrgId !== 'org-default-offline') {
          supabase
            .from('company_settings')
            .update({ account_mappings: autoDerivedMappings })
            .eq('organization_id', fetchOrgId)
            .then(({ error: mapErr }) => {
              if (mapErr) logger.warn('[AccountingContext] Auto-persist account_mappings notice:', mapErr);
            });
        }
      }

      setEntries(ents.data || []);
      setAssets(assetData?.data || []);
      setBudgets(budgetData?.data || []);

      // السندات تُجلب مركزياً عبر BankingProvider لتفادي التكرار في التهيئة
      setVouchers([]);
      setCostCenters(ccs.data || []);

      // 🛡️ عزل نطاق الإشراف للموارد البشرية والرواتب (HR Supervisory Scope)
      const rawEmployees = emps.data || [];
      const userHrScope = (profile as any)?.hr_scope || (authUser as any)?.hr_scope || (authUser as any)?.user_metadata?.hr_scope || 'all';

      const isFactoryDept = (dept: unknown) => {
        const d = String(dept || '').trim().toLowerCase();
        return d === 'المصنع' || d === 'مصنع' || d === 'factory';
      };

      let scopedEmployees = rawEmployees;
      if (userHrScope === 'factory') {
        scopedEmployees = rawEmployees.filter((e: Record<string, any>) => isFactoryDept(e.department));
      } else if (userHrScope === 'branches') {
        scopedEmployees = rawEmployees.filter((e: Record<string, any>) => !isFactoryDept(e.department));
      }

      setEmployees(scopedEmployees);
      const mappedSalespeople: Salesperson[] = scopedEmployees.map((e: { id: string; name?: string; full_name?: string }) => ({
        id: e.id,
        name: e.name || e.full_name || 'مندوب'
      }));
      setSalespeople(mappedSalespeople);

      const loadedProducts = (prods.data && prods.data.length > 0) ? prods.data : (currentUser?.role === 'demo' ? DEFAULT_OFFLINE_PRODUCTS : []);
      setProducts(loadedProducts);
      setTransfers(trns.data || []);
      setPurchaseInvoices(pinvs.data || []);
      setInvoices(invs.data || []);

      const loadedCategories = (cats.data && cats.data.length > 0) ? cats.data : (currentUser?.role === 'demo' ? DEFAULT_OFFLINE_CATEGORIES : []);
      setCategories(loadedCategories);
      setMenuCategories(loadedCategories);

      setUsers(usrs.data || []);

      const loadedWhs = whs.data || [];
      setWarehouses(loadedWhs.length > 0 ? loadedWhs : (currentUser?.role === 'demo' ? DEFAULT_OFFLINE_WAREHOUSES : []));

      const loadedTables = (rTables.data && rTables.data.length > 0) ? rTables.data : DEFAULT_OFFLINE_TABLES;
      setRestaurantTables(loadedTables);

      setCustomers((custs.data && custs.data.length > 0) ? custs.data : (currentUser?.role === 'demo' ? [{ id: 'cust-walkin', name: 'عميل نقدي صالة', phone: '0000000000' }] : []));
      setSuppliers((sups.data && sups.data.length > 0) ? sups.data : (currentUser?.role === 'demo' ? [{ id: 'sup-main', name: 'مورد عام معتمد', phone: '01000000000' }] : []));
      setCheques(chqs.data || []);
      
      const activeShiftData = Array.isArray(shift.data) ? shift.data[0] : shift.data;
      if (activeShiftData && activeShiftData.id) {
        setCurrentShift(activeShiftData);
      } else {
        // إذا لم تكن هناك وردية نشطة أونلاين، نحتفظ بالوردية المحلية إن وجدت
        let localShift = null;
        try {
          localShift = secureStorage.getItem<any>('tripro_offline_current_shift');
        } catch (e) {
          logger.warn('[AccountingContext] Failed to read online fallback shift from secureStorage:', e);
        }
        setCurrentShift(localShift || null);
      }
      setLastUpdated(new Date());

      // مزامنة المنتجات محلياً في الخلفية لدعم وضع الأوفلاين مستقبلاً
      offlineService.seedFallbackProducts(loadedProducts).catch(() => {});

    } catch (error) {
      logger.error('Error refreshing accounting data, loading offline fallback:', error);
      await loadOfflineFallbackData();
    } finally {
      setIsLoading(false);
    }
  })();

  refreshDataPromiseRef.current = currentPromise;
  try {
    await currentPromise;
  } finally {
    refreshDataPromiseRef.current = null;
  }
}, [authUser, currentSelectedOrgId, fiscalYearRange.startDate, fiscalYearRange.endDate, isDemo, loadOfflineFallbackData]);

  useEffect(() => {
    refreshData();
  }, [refreshData]);

  // --- دوال التحديث المجزأة لكل نطاق لترشيد الأداء ومنع شلال الـ 18 استعلاماً ---
  const refreshAccountsAndLedger = useCallback(async () => {
    const targetOrg = getEffectiveOrgId();
    if (!targetOrg || targetOrg === 'org-default-offline') return;
    try {
      const userRole = (currentUser?.role || '').toLowerCase();
      const isOperational = ['cashier', 'retail_cashier', 'restaurant_cashier', 'restaurant_waiter', 'restaurant_chef', 'restaurant_cook', 'restaurant_driver', 'storekeeper', 'worker', 'van_sales'].includes(userRole);

      const [accs, ents, ccs, budgetData] = await Promise.all([
        supabase.from('accounts').select('*').eq('organization_id', targetOrg).order('code'),
        isOperational
          ? Promise.resolve({ data: [] as JournalEntry[], error: null })
          : fetchJournalEntriesWithLines<JournalEntry>(
              targetOrg,
              fiscalYearRange.startDate,
              fiscalYearRange.endDate
            ).then(data => ({ data, error: null })),
        supabase.from('cost_centers').select('*').eq('organization_id', targetOrg).order('name'),
        supabase.from('budgets').select('*').eq('organization_id', targetOrg)
      ]);
      if (accs.data) {
        setAccounts(accs.data.map((acc: Record<string, any>) => ({
          ...acc,
          isGroup: Boolean(acc.is_group ?? acc.isGroup),
          type: acc.type ? acc.type.toUpperCase() : acc.type
        })));
      }
      if (ents.data) setEntries(ents.data);
      if (ccs.data) setCostCenters(ccs.data);
      if (budgetData.data) setBudgets(budgetData.data);
      setLastUpdated(new Date());
    } catch (e) {
      logger.error('Error in refreshAccountsAndLedger:', e);
    }
  }, [getEffectiveOrgId, fiscalYearRange.startDate, fiscalYearRange.endDate]);

  const refreshBankingAndShift = useCallback(async () => {
    const targetOrg = getEffectiveOrgId();
    if (!targetOrg || targetOrg === 'org-default-offline') return;
    try {
      interface RawVoucherFetchRow {
        payment_date?: string | null;
        date?: string | null;
        created_at?: string | null;
        notes?: string | null;
        description?: string | null;
        supplier_id?: string | null;
        party_id?: string | null;
        [key: string]: unknown;
      }

      const [chqs, shift, vchrs] = await Promise.all([
        fetchCompleteDataset<Record<string, unknown>>(async (from, to) =>
          supabase.from('cheques')
            .select('*')
            .eq('organization_id', targetOrg)
            .order('due_date')
            .range(from, to)
        ).then(data => ({ data, error: null })),
        supabase.rpc('get_active_shift', { p_org_id: targetOrg }),
        fetchCompleteDataset<RawVoucherFetchRow>(async (from, to) =>
          supabase.from('payment_vouchers')
            .select('*')
            .eq('organization_id', targetOrg)
            .is('deleted_at', null)
            .order('payment_date', { ascending: false })
            .range(from, to)
        ).then(data => ({ data, error: null }))
      ]);
      if (chqs.data) setCheques(chqs.data);
      if (vchrs.data) {
        const mappedVchrs = (vchrs.data || []).map((row: RawVoucherFetchRow) => ({
          ...row,
          date: (row.payment_date || row.date || (row.created_at ? row.created_at.split('T')[0] : '')) as string,
          payment_date: (row.payment_date || row.date || (row.created_at ? row.created_at.split('T')[0] : '')) as string,
          description: (row.notes || row.description || '') as string,
          notes: (row.notes || row.description || '') as string,
          type: 'payment',
          subType: row.supplier_id ? 'supplier' : 'account',
          party_id: (row.supplier_id || row.party_id) as string,
        }));
        setVouchers(mappedVchrs);
      }
      const activeShiftData = Array.isArray(shift.data) ? shift.data[0] : shift.data;
      if (activeShiftData && activeShiftData.id) {
        setCurrentShift(activeShiftData);
      }
      setLastUpdated(new Date());
    } catch (e) {
      logger.error('Error in refreshBankingAndShift:', e);
    }
  }, [getEffectiveOrgId]);

  // --- تنفيذ الدوال الأساسية غير المنقولة للنطاقات ---
  const clearCache = () => { window.location.reload(); };
  const getFinancialSummary = async () => { const { data } = await supabase.rpc('get_financial_summary', { p_org_id: currentSelectedOrgId }); return data; };
  const addEntry = async (entry: DynamicParam) => {
    const targetOrgId = entry.p_org_id || entry.organization_id || currentSelectedOrgId || currentUser?.organization_id;
    const sanitizedLines = (entry.lines || [])
      .filter((l: Record<string, any>) => {
        const accId = l.accountId || l.account_id;
        return accId && typeof accId === 'string' && accId.trim() !== '' && (Number(l.debit) > 0 || Number(l.credit) > 0);
      })
      .map((l: Record<string, any>) => ({
        accountId: l.accountId || l.account_id,
        account_id: l.accountId || l.account_id,
        debit: Number(l.debit || 0),
        credit: Number(l.credit || 0),
        description: l.description || entry.description || ''
      }));

    if (sanitizedLines.length === 0) {
      logger.warn('addEntry: No valid lines to post journal entry');
      return;
    }

    const payload: Record<string, any> = {
      date: entry.date || new Date().toISOString().split('T')[0],
      description: entry.description || null,
      reference: entry.reference || null,
      status: entry.status || 'posted',
      lines: sanitizedLines,
      p_org_id: targetOrgId
    };

    const balanceCheck = validateEntryBalance({
      reference: entry.reference || 'JE-DRAFT',
      date: payload.date,
      lines: sanitizedLines
    });

    if (!balanceCheck.isBalanced) {
      const errMsg = `القيد المحاسبي غير متوازن: إجمالي المدين (${balanceCheck.totalDebit}) لا يساوي إجمالي الدائن (${balanceCheck.totalCredit}) بفارق ${balanceCheck.difference}`;
      logger.error('addEntry balance error:', errMsg);
      showToast(errMsg, 'error');
      throw new Error(errMsg);
    }

    const { error } = await supabase.rpc('add_journal_entry', payload);
    if (error) throw error;
    logActivity('إنشاء قيد يومية', `قيد مرجعي: ${payload.reference || 'عام'}`);
    await refreshAccountsAndLedger();
  };
  const getSystemAccount = useCallback(
    (key: string) => resolveSystemAccount(accounts, settings, key),
    [accounts, settings]
  );

  const clearTransactions = async () =>
    clearAllOrgTransactions({ supabaseClient: supabase, refreshAccountsAndLedger });
  const emptyRecycleBin = async (table: string) =>
    emptyOrgRecycleBin({ supabaseClient: supabase, table, refreshData });

  // Assets & Cheques
  const restoreItem = async (table: string, id: string) =>
    restoreRecycleItem({
      supabaseClient: supabase,
      table,
      id,
      orgId: currentSelectedOrgId || currentUser?.organization_id,
      refreshData,
    });

  const permanentDeleteItem = async (table: string, id: string) =>
    permanentDeleteRecycleItem({
      supabaseClient: supabase,
      table,
      id,
      orgId: currentSelectedOrgId || currentUser?.organization_id,
      refreshData,
    });
  // --- Demo Stubs ---
  const addDemoEntry = (e: Partial<JournalEntry> | Record<string, any>) => logger.log('Demo Entry:', e);
  const addDemoPaymentVoucher = (v: Record<string, any>) => logger.log('Demo Payment:', v);
  const addDemoReceiptVoucher = (v: Record<string, any>) => logger.log('Demo Receipt:', v);
  const addDemoInvoice = (i: Partial<Invoice> | Record<string, any>) => logger.log('Demo Invoice:', i);
  const postDemoSalesInvoice = (inv: Partial<Invoice> | Record<string, any>) => logger.log('Demo Post Invoice:', inv);
  const addDemoPurchaseInvoice = (i: Partial<Invoice> | Record<string, any>) => logger.log('Demo Purchase:', i);

  const purgeDeletedRecords = async () =>
    purgeOrgDeletedRecords({ supabaseClient: supabase, showToast, refreshData });
  const refreshSaasSchema = async () =>
    refreshOrgSaasSchema({ supabaseClient: supabase, showToast });
  const exportData = async () =>
    exportOrganizationDataset({
      effectiveOrgId,
      organizationName: organization?.name,
      settings,
      accounts,
      customers,
      suppliers,
      products,
      logActivity,
      showToast,
    });

  const deleteOrganization = useCallback(async (orgId: string) => {
    const res = await deleteOrganizationSafe({ supabase, orgId, currentUser });
    if (res.success) {
      showToast('تم حذف الشركة وجميع بياناتها بنجاح ✅', 'success');
      await refreshData();
      return { success: true };
    } else {
      if (res.message && res.message !== 'تم إلغاء عملية الحذف.') {
        showToast(res.message, 'error');
      }
      return { success: false, message: res.message };
    }
  }, [currentUser, showToast, refreshData]);

  const coreValue = useMemo(() => ({
    organization, currentUser, organizations, currentSelectedOrgId, setCurrentSelectedOrgId, effectiveOrgId, getEffectiveOrgId, isLoading, lastUpdated, settings, accounts, entries, assets, budgets, vouchers, costCenters, getFinancialSummary,
    employees, products, transfers, purchaseInvoices, invoices, salespeople, categories,
    users, warehouses, restaurantTables, menuCategories, customers, suppliers, cheques,
    currentShift, activityLog, logActivity, refreshData, refreshBankingAndShift, isDemo, can, clearCache,
    addEntry, getSystemAccount, clearTransactions, emptyRecycleBin,
    restoreItem, permanentDeleteItem, purgeDeletedRecords, refreshSaasSchema, exportData,
    selectedFiscalYear, setSelectedFiscalYear, fiscalYearRange,
    addDemoEntry, addDemoPaymentVoucher, addDemoReceiptVoucher, addDemoInvoice,
    deleteOrganization,
    postDemoSalesInvoice, addDemoPurchaseInvoice
  }), [
    organization, currentUser, organizations, currentSelectedOrgId, effectiveOrgId, getEffectiveOrgId, isLoading, lastUpdated, settings, accounts, entries, assets, budgets, vouchers, costCenters, getFinancialSummary,
    employees, products, transfers, purchaseInvoices, invoices, salespeople, categories,
    users, warehouses, restaurantTables, menuCategories, customers, suppliers, cheques,
    currentShift, activityLog, logActivity, refreshData, refreshBankingAndShift, isDemo, can, clearCache,
    addEntry, getSystemAccount, clearTransactions, emptyRecycleBin,
    restoreItem, permanentDeleteItem, purgeDeletedRecords, refreshSaasSchema, exportData,
    selectedFiscalYear, fiscalYearRange,
    deleteOrganization
  ]);

  return (
    <SettingsProvider
      orgId={effectiveOrgId}
      currentUser={currentUser}
      can={can}
      logActivity={logActivity}
      showToast={showToast}
      isDemo={isDemo}
      initialOrganization={organization}
      initialSettings={settings}
      initialAccounts={accounts}
    >
      <CustomerProvider
        orgId={effectiveOrgId}
        currentUser={currentUser}
        logActivity={logActivity}
        isDemo={isDemo}
        initialCustomers={customers}
      >
        <SupplierProvider
          orgId={effectiveOrgId}
          currentUser={currentUser}
          logActivity={logActivity}
          showToast={showToast}
          isDemo={isDemo}
          initialSuppliers={suppliers}
          initialPurchaseInvoices={purchaseInvoices}
        >
          <ProductProvider
            orgId={effectiveOrgId}
            currentUser={currentUser}
            logActivity={logActivity}
            showToast={showToast}
            isDemo={isDemo}
            initialProducts={products}
            initialWarehouses={warehouses}
            initialCategories={categories}
            initialTransfers={transfers}
          >
            <SalesProvider
              orgId={effectiveOrgId}
              currentUser={currentUser}
              logActivity={logActivity}
              showToast={showToast}
              isDemo={isDemo}
              initialInvoices={invoices}
              initialCustomers={customers}
              initialSalespeople={salespeople}
              fiscalYearRange={fiscalYearRange}
            >
              <BankingProvider
                orgId={effectiveOrgId}
                currentUser={currentUser}
                logActivity={logActivity}
                showToast={showToast}
                isDemo={isDemo}
                initialCheques={cheques}
                initialVouchers={vouchers}
                suppliers={suppliers}
                accounts={accounts}
                getSystemAccount={getSystemAccount}
                addEntry={addEntry}
                refreshAllData={refreshData}
              >
                <GeneralLedgerProvider
                  orgId={effectiveOrgId}
                  currentUser={currentUser}
                  settings={settings}
                  logActivity={logActivity}
                  showToast={showToast}
                  isDemo={isDemo}
                  initialEntries={entries}
                  initialAccounts={accounts}
                  initialCostCenters={costCenters}
                  initialBudgets={budgets}
                  initialYear={selectedFiscalYear}
                  fiscalYearRange={fiscalYearRange}
                >
                  <HrProvider
                    orgId={effectiveOrgId}
                    currentUser={currentUser}
                    logActivity={logActivity}
                    showToast={showToast}
                    isDemo={isDemo}
                    initialEmployees={employees}
                  >
                    <RestaurantProvider
                      orgId={effectiveOrgId}
                      currentUser={currentUser}
                      logActivity={logActivity}
                      showToast={showToast}
                      isDemo={isDemo}
                      initialTables={restaurantTables}
                      initialShift={currentShift}
                      products={products}
                      defaultWarehouseId={settings?.default_warehouse_id}
                      getSystemAccount={getSystemAccount}
                      refreshData={refreshData}
                    >
                      <AssetProvider
                        orgId={effectiveOrgId}
                        currentUser={currentUser}
                        logActivity={logActivity}
                        showToast={showToast}
                        isDemo={isDemo}
                        initialAssets={assets}
                        addEntry={addEntry}
                        getSystemAccount={getSystemAccount}
                      >
                        <AccountingFacadeBridge coreValue={coreValue}>
                          {children}
                        </AccountingFacadeBridge>
                      </AssetProvider>
                    </RestaurantProvider>
                  </HrProvider>
                </GeneralLedgerProvider>
              </BankingProvider>
            </SalesProvider>
          </ProductProvider>
        </SupplierProvider>
      </CustomerProvider>
    </SettingsProvider>
  );
};

const AccountingFacadeBridge: React.FC<{
  coreValue: Record<string, any>;
  children: React.ReactNode;
}> = ({ coreValue, children }) => {
  const customerDomain = useCustomerDomain();
  const supplierDomain = useSupplierDomain();
  const productDomain = useProductDomain();
  const salesDomain = useSalesDomain();
  const bankingDomain = useBankingDomain();
  const glDomain = useGeneralLedgerDomain();
  const settingsDomain = useSettingsDomain();
  const hrDomain = useHrDomain();
  const restaurantDomain = useRestaurantDomain();
  const assetDomain = useAssetDomain();

  const domainsRef = useRef({
    coreValue,
    customerDomain,
    supplierDomain,
    productDomain,
    salesDomain,
    bankingDomain,
    glDomain,
    settingsDomain,
    hrDomain,
    restaurantDomain,
    assetDomain
  });
  domainsRef.current = {
    coreValue,
    customerDomain,
    supplierDomain,
    productDomain,
    salesDomain,
    bankingDomain,
    glDomain,
    settingsDomain,
    hrDomain,
    restaurantDomain,
    assetDomain
  };

  const handleRefreshData = useCallback(async () => {
    const d = domainsRef.current;
    await Promise.all([
      d.coreValue.refreshData(),
      d.customerDomain.refreshCustomers ? d.customerDomain.refreshCustomers() : Promise.resolve(),
      d.supplierDomain.refreshSuppliers ? d.supplierDomain.refreshSuppliers() : Promise.resolve(),
      d.supplierDomain.refreshPurchaseInvoices ? d.supplierDomain.refreshPurchaseInvoices() : Promise.resolve(),
      d.productDomain.refreshProducts ? d.productDomain.refreshProducts() : Promise.resolve(),
      d.productDomain.refreshWarehouses ? d.productDomain.refreshWarehouses() : Promise.resolve(),
      d.productDomain.refreshCategories ? d.productDomain.refreshCategories() : Promise.resolve(),
      d.productDomain.refreshTransfers ? d.productDomain.refreshTransfers() : Promise.resolve(),
      d.salesDomain.refreshSales ? d.salesDomain.refreshSales() : Promise.resolve(),
      d.bankingDomain.refreshBanking ? d.bankingDomain.refreshBanking() : Promise.resolve(),
      d.glDomain.refreshLedger ? d.glDomain.refreshLedger() : Promise.resolve(),
      d.settingsDomain.refreshSettings ? d.settingsDomain.refreshSettings() : Promise.resolve(),
      d.hrDomain.refreshEmployees ? d.hrDomain.refreshEmployees() : Promise.resolve(),
      d.restaurantDomain.refreshRestaurant ? d.restaurantDomain.refreshRestaurant() : Promise.resolve(),
      d.restaurantDomain.refreshShift ? d.restaurantDomain.refreshShift() : Promise.resolve(),
      d.assetDomain.refreshAssets ? d.assetDomain.refreshAssets() : Promise.resolve(),
    ]);
  }, []);

  const handleRefreshSalesAndPurchases = useCallback(async () => {
    const d = domainsRef.current;
    await Promise.all([
      d.salesDomain.refreshSales ? d.salesDomain.refreshSales() : Promise.resolve(),
      d.supplierDomain.refreshPurchaseInvoices ? d.supplierDomain.refreshPurchaseInvoices() : Promise.resolve(),
    ]);
  }, []);

  const handleRefreshBankingAndShift = useCallback(async () => {
    const d = domainsRef.current;
    await Promise.all([
      d.bankingDomain.refreshBanking ? d.bankingDomain.refreshBanking() : Promise.resolve(),
      d.restaurantDomain.refreshShift ? d.restaurantDomain.refreshShift() : Promise.resolve(),
      d.coreValue.refreshBankingAndShift ? d.coreValue.refreshBankingAndShift() : Promise.resolve(),
    ]);
  }, []);

  const facadeValue: AccountingContextType = useMemo(() => ({
    ...(coreValue as unknown as AccountingContextType),
    // Settings Domain Delegation
    settings: settingsDomain.settings,
    organization: settingsDomain.organization || coreValue.organization,
    can: settingsDomain.can,
    updateSettings: settingsDomain.updateSettings,
    refreshSettings: settingsDomain.refreshSettings,
    // Customer Domain Delegation
    customers: customerDomain.customers,
    addCustomer: customerDomain.addCustomer as (data: Partial<Customer>) => Promise<any>,
    updateCustomer: customerDomain.updateCustomer,
    deleteCustomer: customerDomain.deleteCustomer,
    refreshCustomers: customerDomain.refreshCustomers,
    // Supplier Domain Delegation
    suppliers: supplierDomain.suppliers,
    purchaseInvoices: supplierDomain.purchaseInvoices,
    addSupplier: supplierDomain.addSupplier as (data: Partial<Supplier>) => Promise<any>,
    updateSupplier: supplierDomain.updateSupplier,
    deleteSupplier: supplierDomain.deleteSupplier,
    approvePurchaseInvoice: supplierDomain.approvePurchaseInvoice,
    unpostPurchaseInvoice: supplierDomain.unpostPurchaseInvoice,
    deletePurchaseInvoice: supplierDomain.deletePurchaseInvoice,
    unpostPurchaseReturn: supplierDomain.unpostPurchaseReturn,
    deletePurchaseReturn: supplierDomain.deletePurchaseReturn,
    convertPoToInvoice: supplierDomain.convertPoToInvoice,
    refreshSuppliers: supplierDomain.refreshSuppliers,
    // Product & Inventory Domain Delegation
    products: productDomain.products,
    warehouses: productDomain.warehouses,
    categories: productDomain.categories,
    menuCategories: productDomain.categories,
    transfers: productDomain.transfers,
    recalculateStock: productDomain.recalculateStock,
    addProduct: productDomain.addProduct as (data: Partial<Product>) => Promise<any>,
    updateProduct: productDomain.updateProduct,
    deleteProduct: productDomain.deleteProduct,
    addStockTransfer: productDomain.addStockTransfer,
    approveStockTransfer: productDomain.approveStockTransfer,
    cancelStockTransfer: productDomain.cancelStockTransfer,
    addWarehouse: productDomain.addWarehouse,
    updateWarehouse: productDomain.updateWarehouse,
    deleteWarehouse: productDomain.deleteWarehouse,
    addWastage: productDomain.addWastage,
    produceItem: productDomain.produceItem,
    // Sales Domain Delegation
    invoices: salesDomain.invoices,
    salespeople: salesDomain.salespeople,
    approveInvoice: salesDomain.approveInvoice,
    unpostSalesInvoice: salesDomain.unpostSalesInvoice,
    deleteSalesInvoice: salesDomain.deleteSalesInvoice,
    unpostSalesReturn: salesDomain.unpostSalesReturn,
    deleteSalesReturn: salesDomain.deleteSalesReturn,
    refreshSalesAndPurchases: handleRefreshSalesAndPurchases,
    // Banking & Treasury Domain Delegation
    cheques: bankingDomain.cheques,
    vouchers: bankingDomain.vouchers,
    addCheque: bankingDomain.addCheque,
    updateCheque: bankingDomain.updateCheque,
    deleteCheque: bankingDomain.deleteCheque,
    updateChequeStatus: bankingDomain.updateChequeStatus,
    addPaymentVoucher: bankingDomain.addPaymentVoucher,
    updateVoucher: bankingDomain.updateVoucher,
    addTransfer: bankingDomain.addTransfer,
    updateTransfer: bankingDomain.updateTransfer,
    deleteTransfer: bankingDomain.deleteTransfer,
    refreshBanking: bankingDomain.refreshBanking,
    refreshBankingAndShift: handleRefreshBankingAndShift,
    // General Ledger Domain Delegation
    entries: glDomain.entries,
    accounts: glDomain.accounts,
    costCenters: glDomain.costCenters,
    budgets: glDomain.budgets,
    fiscalYearRange: glDomain.fiscalYearRange,
    selectedFiscalYear: glDomain.selectedFiscalYear,
    setSelectedFiscalYear: glDomain.setSelectedFiscalYear,
    addEntry: glDomain.addEntry,
    fetchEntriesPaged: glDomain.fetchEntriesPaged,
    getAccountBalanceInPeriod: glDomain.getAccountBalanceInPeriod,
    addAccount: glDomain.addAccount,
    updateAccount: glDomain.updateAccount,
    deleteAccount: glDomain.deleteAccount,
    getSystemAccount: glDomain.getSystemAccount,
    saveBudget: glDomain.saveBudget,
    exportJournalToCSV: glDomain.exportJournalToCSV,
    closeFinancialYear: glDomain.closeFinancialYear,
    reopenFinancialYear: glDomain.reopenFinancialYear,
    recalculateAllBalances: glDomain.recalculateAllBalances,
    addOpeningBalanceTransaction: glDomain.addOpeningBalanceTransaction,
    createMissingSystemAccounts: glDomain.createMissingSystemAccounts,
    refreshAccountsAndLedger: glDomain.refreshLedger,
    refreshLedger: glDomain.refreshLedger,
    // HR Domain Delegation
    employees: hrDomain.employees,
    addEmployee: hrDomain.addEmployee,
    updateEmployee: hrDomain.updateEmployee,
    deleteEmployee: hrDomain.deleteEmployee,
    runPayroll: hrDomain.runPayroll,
    runPayrollAccrual: hrDomain.runPayrollAccrual,
    payAccruedPayroll: hrDomain.payAccruedPayroll,
    cancelPayrollAccrual: hrDomain.cancelPayrollAccrual,
    refreshEmployees: hrDomain.refreshEmployees,
    // Restaurant & POS Shift Domain Delegation
    restaurantTables: restaurantDomain.restaurantTables,
    currentShift: restaurantDomain.currentShift,
    openTableSession: restaurantDomain.openTableSession,
    reserveTable: restaurantDomain.reserveTable,
    cancelReservation: restaurantDomain.cancelReservation,
    transferTableSession: restaurantDomain.transferTableSession,
    mergeTableSessions: restaurantDomain.mergeTableSessions,
    createRestaurantOrder: restaurantDomain.createRestaurantOrder,
    getOpenTableOrder: restaurantDomain.getOpenTableOrder,
    completeRestaurantOrder: restaurantDomain.completeRestaurantOrder,
    processSplitPayment: restaurantDomain.processSplitPayment,
    addRestaurantTable: restaurantDomain.addRestaurantTable,
    updateRestaurantTable: restaurantDomain.updateRestaurantTable,
    deleteRestaurantTable: restaurantDomain.deleteRestaurantTable,
    updateKitchenOrderStatus: restaurantDomain.updateKitchenOrderStatus,
    startShift: restaurantDomain.startShift,
    closeCurrentShift: restaurantDomain.closeCurrentShift,
    getCurrentShiftSummary: restaurantDomain.getCurrentShiftSummary,
    finalizeProductionOrder: restaurantDomain.finalizeProductionOrder,
    refreshRestaurant: restaurantDomain.refreshRestaurant,
    // Asset Domain Delegation
    assets: assetDomain.assets,
    addAsset: assetDomain.addAsset,
    updateAsset: assetDomain.updateAsset,
    deleteAsset: assetDomain.deleteAsset,
    runDepreciation: assetDomain.runDepreciation,
    revaluateAsset: assetDomain.revaluateAsset,
    refreshAssets: assetDomain.refreshAssets,
    refreshData: handleRefreshData
  }), [
    coreValue,
    customerDomain,
    supplierDomain,
    productDomain,
    salesDomain,
    bankingDomain,
    glDomain,
    settingsDomain,
    hrDomain,
    restaurantDomain,
    assetDomain,
    handleRefreshData,
    handleRefreshSalesAndPurchases,
    handleRefreshBankingAndShift
  ]);

  return (
    <AccountingContext.Provider value={facadeValue}>
      {children}
    </AccountingContext.Provider>
  );
};
import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '../supabaseClient';
import { useAuth } from '../context/AuthContext';
import { Account, JournalEntry, JournalEntryLine, SystemSettings, UserRole, Organization } from '../types';
import { useToast } from '../context/ToastContext';
import { secureStorage } from '../utils/securityMiddleware';

export interface UserProfile {
  id: string;
  full_name: string | null;
  role: UserRole;
  organization_id: string | null;
  is_active: boolean;
  avatar_url?: string;
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
  approvePurchaseInvoice: (id: string, orgId?: string, warehouseId?: string) => Promise<void>;
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

export const AccountingProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { currentUser: authUser, can } = useAuth();
  const { showToast } = useToast();
  const [organization, setOrganization] = useState<any>(null);
  const [organizations, setOrganizations] = useState<any[]>([]);
  const [currentSelectedOrgId, setCurrentSelectedOrgId] = useState<string | null>(null); // New state for super admin's selected org
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(null);
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

  const refreshData = useCallback(async () => {
    if (!authUser) return;
    setIsLoading(true);
    try {
      // جلب بيانات المنظمة والبروفايل
      const { data: profile, error: profileError } = await supabase.from('profiles').select('*, organizations(*)').eq('id', authUser.id).single();
      if (profileError) throw profileError;
      if (profile) {
        setCurrentUser(profile);
      }

      // 🛡️ صمام أمان: جلب قائمة الشركات للسوبر أدمن فوراً لملء القائمة المنسدلة
      const isSuperAdmin = authUser.role === 'super_admin' || (profile && profile.role === 'super_admin');
      if (isSuperAdmin) {
        const { data: allOrgs } = await supabase.from('organizations').select('id, name').order('name');
        setOrganizations(allOrgs || []);
      }

      // Determine the organization ID to use for fetching data
      let fetchOrgId = profile.organization_id;

      if (isSuperAdmin) {
          if (currentSelectedOrgId) {
              fetchOrgId = currentSelectedOrgId;
          } else if (profile.organization_id) {
              fetchOrgId = profile.organization_id;
              setCurrentSelectedOrgId(profile.organization_id); 
          }
      }

      // إذا لم يكن هناك شركة مختارة (حتى للسوبر أدمن)، نتوقف عن جلب البيانات المالية فقط ونعرض الواجهة
      if (!fetchOrgId) {
        setIsLoading(false);
        return;
      }

      // تحديث كائن المنظمة ليتوافق مع المنظمة النشطة (دعم السوبر أدمن)
      if (fetchOrgId === profile.organization_id) {
        setOrganization(profile.organizations);
      } else {
        // جلب تفاصيل المنظمة المختارة يدوياً
        const { data: selectedOrg } = await supabase.from('organizations').select('*').eq('id', fetchOrgId).single();
        if (selectedOrg) setOrganization(selectedOrg);
      }

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

        const preventPriceModification = raw.preventPriceModification !== undefined 
          ? Boolean(raw.preventPriceModification) 
          : (raw.prevent_price_modification !== undefined ? Boolean(raw.prevent_price_modification) : false);

        const maxCashDeficitLimit = raw.maxCashDeficitLimit !== undefined 
          ? Number(raw.maxCashDeficitLimit) 
          : (raw.max_cash_deficit_limit !== undefined ? Number(raw.max_cash_deficit_limit) : 500);

        const decimalPlaces = raw.decimalPlaces !== undefined
          ? Number(raw.decimalPlaces)
          : (raw.decimal_places !== undefined ? Number(raw.decimal_places) : 2);

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
          preventPriceModification,
          prevent_price_modification: preventPriceModification,
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

      // جلب الحسابات والمستودعات
      const [accs, ents, ccs, emps, prods, trns, pinvs, invs, cats, usrs, whs, rTables, custs, sups, chqs, shift, assetData, budgetData] = await Promise.all([
        supabase.from('accounts').select('*').eq('organization_id', fetchOrgId).order('code'),
        supabase.from('journal_entries').select('*, journal_lines(*)').eq('organization_id', fetchOrgId).order('transaction_date', { ascending: false }),
        supabase.from('cost_centers').select('*').eq('organization_id', fetchOrgId).order('name'),
        supabase.from('employees').select('*').eq('organization_id', fetchOrgId).order('full_name'),
        supabase.from('products').select('*').eq('organization_id', fetchOrgId).order('name'),
        supabase.from('stock_transfers').select('*').eq('organization_id', fetchOrgId).order('transfer_date', { ascending: false }),
        supabase.from('purchase_invoices').select('*').eq('organization_id', fetchOrgId).order('invoice_date', { ascending: false }),
        supabase.from('invoices').select('*').eq('organization_id', fetchOrgId).order('invoice_date', { ascending: false }),
        supabase.from('item_categories').select('*').eq('organization_id', fetchOrgId).order('name'),
        supabase.from('profiles').select('*').eq('organization_id', fetchOrgId).order('full_name'),
        supabase.from('warehouses').select('*').eq('organization_id', fetchOrgId).eq('is_active', true),
        supabase.from('restaurant_tables').select('*').eq('organization_id', fetchOrgId).order('name'),
        supabase.from('customers').select('*').eq('organization_id', fetchOrgId).is('deleted_at', null),
        supabase.from('suppliers').select('*').eq('organization_id', fetchOrgId).is('deleted_at', null),
        supabase.from('cheques').select('*').eq('organization_id', fetchOrgId).order('due_date'),
        supabase.rpc('get_active_shift', { p_org_id: fetchOrgId }),
        supabase.from('assets').select('*').eq('organization_id', fetchOrgId).is('deleted_at', null),
        supabase.from('budgets').select('*').eq('organization_id', fetchOrgId)
      ]);

      setAccounts((accs.data || []).map((acc: any) => ({
        ...acc,
        type: acc.type ? acc.type.toUpperCase() : acc.type
      })));
      setEntries(ents.data || []);
      setAssets(assetData?.data || []);
      setBudgets(budgetData?.data || []);
      setVouchers([]);
      setCostCenters(ccs.data || []);
      setEmployees(emps.data || []);
      setProducts(prods.data || []);
      setTransfers(trns.data || []);
      setPurchaseInvoices(pinvs.data || []);
      setInvoices(invs.data || []);
      setSalespeople(emps.data || []);
      setCategories(cats.data || []);
      setUsers(usrs.data || []);
      setWarehouses(whs.data || []);
      setRestaurantTables(rTables.data || []);
      setMenuCategories([]);
      setCustomers(custs.data || []);
      setSuppliers(sups.data || []);
      setCheques(chqs.data || []);
      
      // 🛡️ تصحيح جذري: التحقق من وجود ID حقيقي للوردية لمنع الوردية "الوهمية"
      const activeShiftData = Array.isArray(shift.data) ? shift.data[0] : shift.data;
      setCurrentShift(activeShiftData && activeShiftData.id ? activeShiftData : null);
      setLastUpdated(new Date());

    } catch (error) {
      if (import.meta.env.DEV) console.error('Error refreshing accounting data:', error);
      showToast('فشل تحديث البيانات، يرجى التحقق من اتصال الإنترنت', 'error');    } finally {
      setIsLoading(false);
    }
  }, [authUser, currentSelectedOrgId]); // Add currentSelectedOrgId to dependencies

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
    const { data: p, error } = await supabase.from('products').insert({ ...data, organization_id: targetOrgId }).select().single();
    if (error) throw error;
    await refreshData(); return p; 
  };
   const updateProduct = async (id: string, data: any) => { 
    const { error } = await supabase.from('products').update(data).eq('id', id);
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
    refreshData(); 
    return !error; 
  };
   const approvePurchaseInvoice = async (id: string, orgId?: string, warehouseId?: string) => { 
    const { error } = await supabase.rpc('post_purchase_invoice', { 
      p_invoice_id: id,
      p_org_id: orgId || currentSelectedOrgId || currentUser?.organization_id,
      p_warehouse_id: warehouseId
    }); 
    if (error) {
      showToast('فشل اعتماد الفاتورة: ' + error.message, 'error');
    } else {
      showToast('تم اعتماد فاتورة المشتريات وتحديث المخزون بنجاح ✅', 'success');
      refreshData();
    }
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
        await addEntry({
          date: newAsset.purchase_date || new Date().toISOString().split('T')[0],
          description: `إثبات شراء أصل ثابت: ${newAsset.name}`,
          reference: `ASSET-${newAsset.id.split('-')[0].toUpperCase()}`,
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
    const { error } = await supabase.from('assets').update({ deleted_at: new Date().toISOString() }).eq('id', id);
    if (error) throw error;
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

  const restoreItem = async (table: string, id: string) => { const { error } = await supabase.from(table).update({ deleted_at: null }).eq('id', id); refreshData(); return { success: !error, message: error?.message }; };
  const permanentDeleteItem = async (table: string, id: string) => { const { error } = await supabase.from(table).delete().eq('id', id); refreshData(); return { success: !error, message: error?.message }; };
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
    const { data, error } = await supabase.rpc('open_table_session', { p_table_id: tableId });
    if (error) { showToast(error.message, 'error'); return null; }
    refreshData();
    return data;
  };

  const reserveTable = async (tableId: string, name: string, time: string) => {
    const { error } = await supabase.from('restaurant_tables').update({ status: 'RESERVED', reservation_info: { customerName: name, arrivalTime: time } }).eq('id', tableId);
    if (error) return false;
    refreshData();
    return true;
  };

  const cancelReservation = async (tableId: string) => {
    await supabase.from('restaurant_tables').update({ status: 'AVAILABLE', reservation_info: null }).eq('id', tableId);
    refreshData();
  };

  const transferTableSession = async (sessionId: string, targetTableId: string) => {
    const { error } = await supabase.rpc('transfer_table_session', { p_session_id: sessionId, p_target_table_id: targetTableId });
    if (error) { showToast(error.message, 'error'); return false; }
    refreshData();
    return true;
  };

  const mergeTableSessions = async (sourceId: string, targetId: string) => {
    const { error } = await supabase.rpc('merge_table_sessions', { p_source_session_id: sourceId, p_target_session_id: targetId });
    if (error) { showToast(error.message, 'error'); return false; }
    refreshData();
    return true;
  };

  const createRestaurantOrder = async (payload: any) => {
    const targetOrgId = currentSelectedOrgId || currentUser?.organization_id;
    const { data, error } = await supabase.rpc('create_restaurant_order', { 
      ...payload, 
      p_warehouse_id: payload.p_warehouse_id || settings?.default_warehouse_id,
      p_org_id: targetOrgId 
    });
    if (error) throw error;
    return data;
  };

  const getOpenTableOrder = async (tableId: string) => {
    try {
      const { data } = await supabase.rpc('get_open_table_order', { p_table_id: tableId });
      if (data?.orderId && data?.items && data.items.length > 0) {
        return data;
      }
    } catch (rpcErr) {
      console.warn('RPC get_open_table_order notice:', rpcErr);
    }

    // 🛡️ Fallback: إذا أعادت الدالة طلباً فارغاً (مثلاً تم تغيير الحالة إلى SERVED/COMPLETED قبل السداد)،
    // نبحث عن أحدث طلب غير مسدد مرتبط بجلسة الطاولة المفتوحة الحالية
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

    return null;
  };

  const completeRestaurantOrder = async (orderId: string, method: string, total: number, accountId: string | null, warehouseId?: string) => {
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
  };

  const processSplitPayment = async (orderId: string, items: any[], method: string, total: number, accountId: string) => {
    const { error } = await supabase.rpc('process_split_payment', { p_order_id: orderId, p_items: items, p_payment_method: method, p_amount: total, p_cash_account_id: accountId, p_org_id: currentSelectedOrgId });
    if (error) { showToast(error.message, 'error'); return false; }
    refreshData();
    return true;
  };

  const addRestaurantTable = async (data: any) => { 
    const targetOrgId = currentSelectedOrgId || currentUser?.organization_id;
    const { error } = await supabase.from('restaurant_tables').insert({ ...data, organization_id: targetOrgId }); 
    if (error) throw error;
    await refreshData(); 
  };
  const updateRestaurantTable = async (id: string, data: any) => { await supabase.from('restaurant_tables').update(data).eq('id', id); refreshData(); };
  const deleteRestaurantTable = async (id: string) => { await supabase.from('restaurant_tables').delete().eq('id', id); refreshData(); };
  
  const updateKitchenOrderStatus = async (id: string, status: string) => {
    await supabase.from('kitchen_orders').update({ status }).eq('id', id);
  };

  const startShift = async (amount: number) => { 
    const targetOrgId = currentSelectedOrgId || currentUser?.organization_id;
    const treasuryAcc = getSystemAccount('CASH');
    const { error } = await supabase.rpc('start_pos_shift', { 
      p_opening_balance: Number(amount) || 0,
      p_resume_existing: false, // 🛡️ تصحيح: عند الضغط على زر "بدء" نريد إنشاء وردية جديدة فعلاً وليس مجرد استئناف
      p_treasury_account_id: treasuryAcc?.id || null,
      p_user_id: currentUser?.id,
      p_org_id: targetOrgId,
      p_terminal_id: null // 🛡️ نمرر null صراحة لمنع تداخل توقيع الدالة (Overload Ambiguity) في PostgreSQL
    }); 
    if (error) throw error;
    await refreshData(); 
  };
  const closeCurrentShift = async (actualCash: number, notes: string) => { 
    const shiftId = Array.isArray(currentShift) ? currentShift[0]?.id : currentShift?.id;
    if (!shiftId) {
      throw new Error('لا توجد وردية مفتوحة حالياً ليتم إغلاقها');
    }
    const { error } = await supabase.rpc('close_shift', { 
      p_shift_id: shiftId, 
      p_actual_cash: actualCash, 
      p_notes: notes,
      p_org_id: currentSelectedOrgId || currentUser?.organization_id
    }); 
    if (error) throw error;
  };
  const getCurrentShiftSummary = async () => { 
    const shiftId = Array.isArray(currentShift) ? currentShift[0]?.id : currentShift?.id;
    if (!shiftId) return null; 
    const { data, error } = await supabase.rpc('get_shift_summary', { p_shift_id: shiftId }); 
    if (error) throw error;
    return data; 
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
    if (currentUser?.role !== 'super_admin') {
      showToast('ليس لديك صلاحية لحذف الشركات.', 'error');
      return { success: false, message: 'ليس لديك صلاحية لحذف الشركات.' };
    }

    if (!window.confirm('⚠️ تحذير: سيتم حذف هذه الشركة وجميع بياناتها (الحسابات، الفواتير، المخزون...) بشكل نهائي.\n\nلا يمكن التراجع عن هذا الإجراء.\n\nهل أنت متأكد تماماً؟')) {
      return { success: false, message: 'تم إلغاء عملية الحذف.' };
    }

    try {
      // استدعاء دالة الحذف الآمنة التي تتجاوز الحماية السيادية في قاعدة البيانات
      const { error } = await supabase.rpc('fn_delete_organization_safe', { p_org_id: orgId });

      if (error) {
        console.error('Error deleting organization:', error);
        showToast(`فشل حذف الشركة: ${error.message}`, 'error');
        return { success: false, message: `فشل حذف الشركة: ${error.message}` };
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
    deleteSupplier, approveInvoice, approvePurchaseInvoice, convertPoToInvoice,
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
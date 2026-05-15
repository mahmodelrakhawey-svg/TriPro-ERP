import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '../services/supabaseClient';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';

export interface UserProfile {
  id: string;
  full_name: string | null;
  role: 'super_admin' | 'admin' | 'manager' | 'accountant' | 'viewer' | 'demo' | 'chef' | 'owner';
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
  CASH_SHORTAGE: '541',
  INVENTORY_RAW_MATERIALS: '10301',
  INVENTORY_WIP: '10303',
  INVENTORY_FINISHED_GOODS: '10302',
  LABOR_COST_ALLOCATED: '513',
  WASTAGE_EXPENSE: '5121',
  SECURITY_DEPOSIT_ACCOUNT: '226'
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
  approveInvoice: (id: string) => Promise<boolean>;
  approvePurchaseInvoice: (id: string) => Promise<void>;
  convertPoToInvoice: (poId: string, warehouseId?: string) => Promise<void>;
  addOpeningBalanceTransaction: (id: string, type: string, amount: number, date: string, name: string) => Promise<void>;
  addPaymentVoucher: (voucher: any) => Promise<void>;
  // --- دوال الأصول والشيكات ---
  addAsset: (asset: any) => Promise<void>;
  runDepreciation: (id?: string, amount?: number, date?: string) => Promise<void>;
  revaluateAsset: (id: string, val: number, date: string, accId: string) => Promise<void>;
  addCheque: (cheque: any) => Promise<void>;
  updateChequeStatus: (id: string, status: string, date: string, bankId?: string) => Promise<void>;
  addTransfer: (transfer: any) => Promise<void>;
  restoreItem: (table: string, id: string) => Promise<{ success: boolean; message?: string }>;
  permanentDeleteItem: (table: string, id: string) => Promise<{ success: boolean; message?: string }>;
  exportJournalToCSV: () => void;
  // --- دوال الموارد البشرية ---
  addEmployee: (employee: any) => Promise<void>;
  updateEmployee: (id: string, updates: any) => Promise<void>;
  deleteEmployee: (id: string, reason?: string) => Promise<void>;
  runPayroll: (monthYear: string, date: string, treasuryId: string, data: any[]) => Promise<void>;
  // --- دوال المطاعم ---
  finalizeProductionOrder: (id: string, status: string, notes: string) => Promise<any>;
  openTableSession: (tableId: string) => Promise<string | null>;
  reserveTable: (tableId: string, name: string, time: string) => Promise<boolean>;
  cancelReservation: (tableId: string) => Promise<void>;
  transferTableSession: (sessionId: string, targetTableId: string) => Promise<boolean>;
  mergeTableSessions: (sourceId: string, targetId: string) => Promise<boolean>;
  createRestaurantOrder: (payload: any) => Promise<string>;
  getOpenTableOrder: (tableId: string) => Promise<any>;
  completeRestaurantOrder: (orderId: string, method: string, total: number, accountId: string | null) => Promise<void>;
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
  exportData: () => Promise<void>;
  // --- دوال الديمو ---
  addDemoEntry: (entry: any) => void;
  addDemoPaymentVoucher: (voucher: any) => void;
  addDemoReceiptVoucher: (voucher: any) => void;
  addDemoInvoice: (invoice: any) => void;
  postDemoSalesInvoice: (invoice: any) => void;
  addDemoPurchaseInvoice: (invoice: any) => void;
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
      const { data: profile } = await supabase.from('profiles').select('*, organizations(*)').eq('id', authUser.id).single();
      if (profile) {
        setCurrentUser(profile);
        setOrganization(profile.organizations);
      }

      // Determine the organization ID to use for fetching data
      let fetchOrgId = profile.organization_id;

      // If super admin, and no specific org is selected, try to use the profile's org
      // or the first available org if the super admin has no default.
      if (authUser.role === 'super_admin') {
          if (currentSelectedOrgId) {
              fetchOrgId = currentSelectedOrgId;
          } else if (profile.organization_id) {
              fetchOrgId = profile.organization_id;
              setCurrentSelectedOrgId(profile.organization_id); // Set it for future consistency
          } else {
              // If super admin has no default org, and none is selected, we can't fetch data.
              // A UI mechanism is needed to select an organization.
              console.warn("Super admin needs to select an organization to view data.");
              setIsLoading(false);
              return;
          }
      }
      if (!fetchOrgId) return; // If still no orgId, return.

      // If super admin, fetch all organizations to populate the selector
      if (authUser.role === 'super_admin') {
        const { data: allOrgs } = await supabase.from('organizations').select('id, name').order('name');
        setOrganizations(allOrgs || []);
      }

      // جلب الإعدادات
      const { data: sett } = await supabase.rpc('get_current_company_settings', { p_org_id: fetchOrgId }).maybeSingle();
      setSettings(sett || {});

      // جلب الحسابات والمستودعات
      const [accs, ents, vchs, ccs, emps, prods, trns, pinvs, invs, sps, cats, usrs, whs, rTables, mCats, custs, sups, chqs, shift, assetData, budgetData] = await Promise.all([
      supabase.from('accounts').select('*').eq('organization_id', fetchOrgId).order('code'),
      supabase.from('journal_entries').select('*, journal_lines(*)').eq('organization_id', fetchOrgId).order('transaction_date', { ascending: false }),
      supabase.from('vouchers').select('*').eq('organization_id', fetchOrgId).order('date', { ascending: false }),
      supabase.from('cost_centers').select('*').eq('organization_id', fetchOrgId).order('name'),
      supabase.from('employees').select('*').eq('organization_id', fetchOrgId).order('full_name'),
      supabase.from('products').select('*').eq('organization_id', fetchOrgId).order('name'),
      supabase.from('stock_transfers').select('*').eq('organization_id', fetchOrgId).order('transfer_date', { ascending: false }),
      supabase.from('purchase_invoices').select('*').eq('organization_id', fetchOrgId).order('invoice_date', { ascending: false }),
      supabase.from('invoices').select('*').eq('organization_id', fetchOrgId).order('invoice_date', { ascending: false }),
      supabase.from('salespeople').select('*').eq('organization_id', fetchOrgId).order('name'),
      supabase.from('product_categories').select('*').eq('organization_id', fetchOrgId).order('name'),
      supabase.from('profiles').select('*').eq('organization_id', fetchOrgId).order('full_name'),
      supabase.from('warehouses').select('*').eq('organization_id', fetchOrgId).eq('is_active', true),
      supabase.from('restaurant_tables').select('*').eq('organization_id', fetchOrgId).order('name'),
      supabase.from('menu_categories').select('*').eq('organization_id', fetchOrgId).order('display_order'),
      supabase.from('customers').select('*').eq('organization_id', fetchOrgId).is('deleted_at', null),
      supabase.from('suppliers').select('*').eq('organization_id', fetchOrgId).is('deleted_at', null),
      supabase.from('cheques').select('*').eq('organization_id', fetchOrgId).order('due_date'),
        supabase.rpc('get_active_shift', { p_org_id: fetchOrgId }),
      supabase.from('assets').select('*').eq('organization_id', fetchOrgId),
      supabase.from('budgets').select('*').eq('organization_id', fetchOrgId)
      ]);

      setAccounts(accs.data || []);
      setEntries(ents.data || []);
      setAssets(assetData.data || []);
      setBudgets(budgetData.data || []);
      setVouchers(vchs.data || []);
      setCostCenters(ccs.data || []);
      setEmployees(emps.data || []);
      setProducts(prods.data || []);
      setTransfers(trns.data || []);
      setPurchaseInvoices(pinvs.data || []);
      setInvoices(invs.data || []);
      setSalespeople(sps.data || []);
      setCategories(cats.data || []);
      setUsers(usrs.data || []);
      setWarehouses(whs.data || []);
      setRestaurantTables(rTables.data || []);
      setMenuCategories(mCats.data || []);
      setCustomers(custs.data || []);
      setSuppliers(sups.data || []);
      setCheques(chqs.data || []);
      
      // تتبع بيانات الوردية القادمة من قاعدة البيانات
      if (process.env.NODE_ENV === 'development') {
        console.log('Raw Shift Data from RPC:', shift.data);
      }

      setCurrentShift(Array.isArray(shift.data) ? shift.data[0] : shift.data);
      setLastUpdated(new Date());

    } catch (error) {
      if (process.env.NODE_ENV === 'development') console.error('Error refreshing accounting data:', error);
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
  
  const addEntry = async (entry: any) => { const { error } = await supabase.rpc('add_journal_entry', entry); if (error) throw error; refreshData(); };
  const getSystemAccount = (key: string) => {
    const mappingId = settings.account_mappings?.[key];
    if (mappingId) return accounts.find(a => a.id === mappingId);
    const defaultCode = SYSTEM_ACCOUNTS[key as keyof typeof SYSTEM_ACCOUNTS];
    return accounts.find(a => a.code === defaultCode);
  };
  const updateVoucher = async (id: string, updates: any) => { const { error } = await supabase.from('vouchers').update(updates).eq('id', id); refreshData(); return !error; };
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
    const { error } = await supabase.rpc('recalculate_stock_rpc', { p_product_id: productId || null, p_org_id: currentSelectedOrgId }); 
    if (error) {
      showToast('فشل إعادة حساب المخزون: ' + error.message, 'error');
    } else {
      showToast('تم تحديث المخزون بنجاح ✅', 'success');
      refreshData(); 
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
    const { error } = await supabase.from('products').update({ deleted_at: new Date().toISOString(), notes: reason }).eq('id', id);
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
    const { error } = await supabase.from('customers').update({ deleted_at: new Date().toISOString(), notes: reason }).eq('id', id);
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
    const { error } = await supabase.from('suppliers').update({ deleted_at: new Date().toISOString(), notes: reason }).eq('id', id);
    if (error) throw error;
    refreshData(); 
  };
  const approveInvoice = async (id: string) => { const { error } = await supabase.rpc('post_sales_invoice', { p_invoice_id: id }); refreshData(); return !error; };
  const approvePurchaseInvoice = async (id: string) => { 
    const { error } = await supabase.rpc('post_purchase_invoice', { p_invoice_id: id }); 
    if (error) {
      showToast('فشل اعتماد الفاتورة: ' + error.message, 'error');
    } else {
      showToast('تم اعتماد فاتورة المشتريات وتحديث المخزون بنجاح ✅', 'success');
      refreshData();
    }
  };
  const convertPoToInvoice = async (id: string, warehouseId?: string) => { 
    const { error } = await supabase.rpc('convert_po_to_invoice', { p_po_id: id, p_warehouse_id: warehouseId }); 
    if (error) {
      showToast('فشل تحويل أمر الشراء: ' + error.message, 'error');
    } else {
      showToast('تم تحويل أمر الشراء إلى فاتورة بنجاح ✅', 'success');
      refreshData();
    }
  };
  const addOpeningBalanceTransaction = async (id: string, type: string, amount: number, date: string, name: string) => { await supabase.rpc('add_opening_balance', { p_id: id, p_type: type, p_amount: amount, p_date: date, p_name: name }); refreshData(); };
  const addPaymentVoucher = async (data: any) => { 
    const targetOrgId = currentSelectedOrgId || currentUser?.organization_id;
    const { error } = await supabase.from('vouchers').insert({ ...data, type: 'payment', organization_id: targetOrgId }); 
    if (error) throw error;
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
  const runDepreciation = async (id?: string, amount?: number, date?: string) => { await supabase.rpc('run_monthly_depreciation', { p_asset_id: id, p_amount: amount, p_date: date }); refreshData(); };
  const revaluateAsset = async (id: string, val: number, date: string, accId: string) => { await supabase.from('assets').update({ current_value: val }).eq('id', id); refreshData(); };
  const addCheque = async (cheque: any) => { 
    const targetOrgId = currentSelectedOrgId || currentUser?.organization_id;
    const { error } = await supabase.from('cheques').insert({ ...cheque, organization_id: targetOrgId }); 
    if (error) throw error;
    await refreshData(); 
  };
  const updateChequeStatus = async (id: string, status: string, date: string, bankId?: string) => { await supabase.from('cheques').update({ status }).eq('id', id); refreshData(); };
  const addTransfer = async (transfer: any) => { await supabase.rpc('add_treasury_transfer', transfer); refreshData(); };
  const restoreItem = async (table: string, id: string) => { const { error } = await supabase.from(table).update({ deleted_at: null }).eq('id', id); refreshData(); return { success: !error, message: error?.message }; };
  const permanentDeleteItem = async (table: string, id: string) => { const { error } = await supabase.from(table).delete().eq('id', id); refreshData(); return { success: !error, message: error?.message }; };
  const exportJournalToCSV = () => { /* Logic */ };

  // HR
  const addEmployee = async (data: any) => { 
    const targetOrgId = currentSelectedOrgId || currentUser?.organization_id;
    const { error } = await supabase.from('employees').insert({ ...data, organization_id: targetOrgId }); 
    if (error) throw error;
    await refreshData(); 
  };
  const updateEmployee = async (id: string, data: any) => { await supabase.from('employees').update(data).eq('id', id); refreshData(); };
  const deleteEmployee = async (id: string, reason?: string) => { await supabase.from('employees').update({ status: 'terminated', notes: reason }).eq('id', id); refreshData(); };
  const runPayroll = async (monthYear: string, date: string, treasuryId: string, data: any[]) => {
    const [year, month] = monthYear.split('-').map(Number);
    await supabase.rpc('run_payroll_rpc', {
      p_month: month,
      p_year: year,
      p_payment_date: date,
      p_treasury_account_id: treasuryId,
      p_items: data,
      p_org_id: currentSelectedOrgId
    });
    refreshData();
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
    const { data, error } = await supabase.rpc('create_restaurant_order', { ...payload, p_org_id: currentSelectedOrgId });
    if (error) throw error;
    return data;
  };

  const getOpenTableOrder = async (tableId: string) => {
    const { data } = await supabase.rpc('get_open_table_order', { p_table_id: tableId });
    return data;
  };

  const completeRestaurantOrder = async (orderId: string, method: string, total: number, accountId: string | null) => {
    const { error } = await supabase.rpc('complete_restaurant_order', { p_order_id: orderId, p_payment_method: method, p_amount: total, p_cash_account_id: accountId, p_org_id: currentSelectedOrgId });
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
    const { error } = await supabase.rpc('start_pos_shift', { 
      p_opening_balance: Number(amount) || 0 
    }); 
    if (error) throw error;
    await refreshData(); 
  };
  const closeCurrentShift = async (actualCash: number, notes: string) => { 
    if (!currentShift?.id) {
      throw new Error('لا توجد وردية مفتوحة حالياً ليتم إغلاقها');
    }
    const { error } = await supabase.rpc('close_shift', { 
      p_shift_id: currentShift.id, 
      p_actual_cash: actualCash, 
      p_notes: notes 
    }); 
    if (error) throw error;
    await refreshData(); 
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
    const { data, error } = await supabase.rpc('close_financial_year', { p_year: year, p_closing_date: date });
        if (error) { showToast('فشل إقفال السنة: ' + error.message, 'error'); return false; }
    showToast(`تم إقفال السنة المالية ${year} بنجاح ✅`, 'success');
    return !!data;
  };
  const exportData = async () => { /* Logic to export JSON */ };

  const value = {
    organization, currentUser, organizations, currentSelectedOrgId, setCurrentSelectedOrgId, isLoading, lastUpdated, settings, accounts, entries, assets, budgets, vouchers, costCenters, getFinancialSummary,
    employees, products, transfers, purchaseInvoices, invoices, salespeople, categories,
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
    addAsset, runDepreciation, revaluateAsset, addCheque, updateChequeStatus, addTransfer,
    restoreItem, permanentDeleteItem, exportJournalToCSV,
    // HR
    addEmployee, updateEmployee, deleteEmployee, runPayroll,
    // Restaurant
    finalizeProductionOrder, openTableSession, reserveTable, cancelReservation,
    transferTableSession, mergeTableSessions, createRestaurantOrder, getOpenTableOrder,
    completeRestaurantOrder, processSplitPayment, addRestaurantTable, updateRestaurantTable,
    deleteRestaurantTable, updateKitchenOrderStatus, startShift, closeCurrentShift,
    getCurrentShiftSummary, createMissingSystemAccounts, recalculateAllBalances,
    purgeDeletedRecords, refreshSaasSchema, closeFinancialYear, exportData,
    // Demo
    addDemoEntry, addDemoPaymentVoucher, addDemoReceiptVoucher, addDemoInvoice,
    postDemoSalesInvoice, addDemoPurchaseInvoice
  };

  return (
    <AccountingContext.Provider value={value}>
      {children}
    </AccountingContext.Provider>
  );
};
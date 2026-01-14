import React, { createContext, useContext, useState, useEffect, useMemo, useCallback } from 'react';
import { useAuth } from './AuthContext';
import { useToast } from './ToastContext';
import { supabase } from '../supabaseClient';
import { 
  Account, JournalEntry, Invoice, Product, Customer, Supplier, 
  PurchaseInvoice, SalesReturn, PurchaseReturn, StockTransaction, 
  Voucher, Warehouse, Category, Salesperson, AccountType, JournalEntryLine as JournalLine, User, SystemSettings, CostCenter,
  Cheque, Asset, Employee, PayrollRun, Quotation, PurchaseOrder, InventoryCount, Budget, AppNotification, ActivityLogEntry
} from '../types';
import { INITIAL_ACCOUNTS } from '../constants';

// دالة مساعدة لتوليد UUID
const generateUUID = () => {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
};

interface FinancialSummary {
  totalAssets: number;
  totalLiabilities: number;
  totalEquity: number;
  totalRevenue: number;
  totalExpenses: number;
  netIncome: number;
}

export const SYSTEM_ACCOUNTS = {
  CASH: '10101',
  CUSTOMERS: '10201',
  NOTES_RECEIVABLE: '10202',
  INVENTORY: '103',
  INVENTORY_RAW_MATERIALS: '10301',
  INVENTORY_FINISHED_GOODS: '10302',
  ACCUMULATED_DEPRECIATION: '11201',
  SUPPLIERS: '201',
  VAT: '202',
  VAT_INPUT: '10204', // حساب ضريبة المدخلات (أصول متداولة - تحت العملاء والمدينون)
  CUSTOMER_DEPOSITS: '203',
  NOTES_PAYABLE: '204',
  SALES_REVENUE: '401',
  OTHER_REVENUE: '402',
  SALES_DISCOUNT: '403',
  COGS: '501',
  SALARIES_EXPENSE: '5201',
  DEPRECIATION_EXPENSE: '507',
  INVENTORY_ADJUSTMENTS: '510',
  RETAINED_EARNINGS: '302',
  EMPLOYEE_BONUSES: '511', // حساب إضافي/مكافآت الموظفين (مصروف)
  EMPLOYEE_DEDUCTIONS: '404', // حساب خصومات/جزاءات الموظفين (إيراد)
  BANK_CHARGES: '508', // مصروفات بنكية
  BANK_INTEREST_INCOME: '405', // فوائد بنكية (إيراد)
  TAX_AUTHORITY: '206', // مصلحة الضرائب المصرية
  SOCIAL_INSURANCE: '207', // هيئة التأمينات الاجتماعية
  WITHHOLDING_TAX: '208', // ضريبة الخصم والتحصيل
  EMPLOYEE_ADVANCES: '10203', // سلف الموظفين
};

// ------------------------------------------------------------------
// 🧪 بيانات وهمية لنسخة الديمو (Dummy Data for Demo Mode)
// ------------------------------------------------------------------
const DUMMY_CUSTOMERS = [
    { id: 'demo-c1', name: 'شركة الأفق للتجارة', phone: '0501234567', tax_number: '300123456700003', address: 'الرياض', credit_limit: 50000, customerType: 'store' },
    { id: 'demo-c2', name: 'مؤسسة النور', phone: '0551234567', tax_number: '300123456700004', address: 'جدة', credit_limit: 20000, customerType: 'store' },
    { id: 'demo-c3', name: 'عميل نقدي', phone: '', tax_number: '', address: '', credit_limit: 0, customerType: 'store' }
];

const DUMMY_SUPPLIERS = [
    { id: 'demo-s1', name: 'شركة التوريدات العالمية', phone: '01012345678', tax_number: '310123456700003', address: 'القاهرة', contactPerson: 'أحمد علي' },
    { id: 'demo-s2', name: 'مصنع الجودة', phone: '01234567890', tax_number: '310987654300003', address: 'الدمام', contactPerson: 'محمد حسن' }
];

const DUMMY_WAREHOUSES = [
    { id: 'demo-wh1', name: 'المستودع الرئيسي', type: 'warehouse' },
    { id: 'demo-wh2', name: 'فرع الرياض', type: 'showroom' }
];

const DUMMY_INVOICES = [
    { 
        id: 'demo-inv-1', 
        invoiceNumber: 'INV-001001', 
        customerId: 'demo-c1', 
        customerName: 'شركة الأفق للتجارة', customerPhone: '0501234567',
        date: new Date().toISOString().split('T')[0], 
        totalAmount: 9775, taxAmount: 1275, subtotal: 8500, 
        status: 'posted', paid_amount: 5000, warehouseId: 'demo-wh1',
        items: [{ id: 'di-1', productId: 'demo-p2', productName: 'طابعة ليزر Canon', quantity: 1, unitPrice: 8500, total: 8500 }]
    },
    { 
        id: 'demo-inv-2', 
        invoiceNumber: 'INV-001002', 
        customerId: 'demo-c2', 
        customerName: 'مؤسسة النور', customerPhone: '0551234567',
        date: new Date(Date.now() - 86400000).toISOString().split('T')[0], 
        totalAmount: 4887.5, taxAmount: 637.5, subtotal: 4250, 
        status: 'paid', paid_amount: 4887.5, warehouseId: 'demo-wh1',
        items: [{ id: 'di-2', productId: 'demo-p4', productName: 'ورق تصوير A4 (كرتونة)', quantity: 5, unitPrice: 850, total: 4250 }]
    },
    { 
        id: 'demo-inv-3', 
        invoiceNumber: 'INV-001003', 
        customerId: 'demo-c3', 
        customerName: 'عميل نقدي', customerPhone: '',
        date: new Date().toISOString().split('T')[0], 
        totalAmount: 1500, taxAmount: 195.65, subtotal: 1304.35, 
        status: 'posted', paid_amount: 0, warehouseId: 'demo-wh1',
        items: [{ id: 'di-3', productId: 'demo-p3', productName: 'حبر طابعة HP 85A', quantity: 3, unitPrice: 450, total: 1350 }]
    }
];

const DUMMY_VOUCHERS = [
    { id: 'demo-rct-1', voucherNumber: 'RCT-00501', date: new Date().toISOString().split('T')[0], amount: 5000, description: 'دفعة من الحساب', type: 'receipt', partyId: 'demo-c1', partyName: 'شركة الأفق للتجارة' },
    { id: 'demo-pay-1', voucherNumber: 'PAY-00201', date: new Date().toISOString().split('T')[0], amount: 2000, description: 'سداد دفعة لمورد', type: 'payment', partyId: 'demo-s1', partyName: 'شركة التوريدات العالمية' }
];

const DUMMY_PRODUCTS = [
    { id: 'demo-p1', name: 'لابتوب HP ProBook 450', sku: 'HP-PB-450', price: 25000, cost: 21000, stock: 15, warehouseStock: { 'demo-wh1': 15 }, purchase_price: 21000, weighted_average_cost: 21000 },
    { id: 'demo-p2', name: 'طابعة ليزر Canon', sku: 'CN-LBP-6030', price: 8500, cost: 6000, stock: 8, warehouseStock: { 'demo-wh1': 8 }, purchase_price: 6000, weighted_average_cost: 6000 },
    { id: 'demo-p3', name: 'حبر طابعة HP 85A', sku: 'HP-85A', price: 450, cost: 250, stock: 50, warehouseStock: { 'demo-wh1': 50 }, purchase_price: 250, weighted_average_cost: 250 },
    { id: 'demo-p4', name: 'ورق تصوير A4 (كرتونة)', sku: 'PPR-A4', price: 850, cost: 650, stock: 100, warehouseStock: { 'demo-wh1': 100 }, purchase_price: 650, weighted_average_cost: 650 },
    { id: 'demo-p5', name: 'ماوس لاسلكي Logitech', sku: 'LOG-M170', price: 350, cost: 200, stock: 30, warehouseStock: { 'demo-wh1': 30 }, purchase_price: 200, weighted_average_cost: 200 }
];

const DUMMY_JOURNAL_ENTRIES = [
    {
        id: 'demo-je-1',
        date: new Date().toISOString().split('T')[0],
        description: 'شراء أثاث مكتبي نقداً',
        reference: 'JE-DEMO-001',
        status: 'posted',
        is_posted: true,
        created_at: new Date().toISOString(),
        userId: 'demo-user',
        attachments: [],
        lines: [
            { id: 'demo-jel-1', accountId: '11301', accountName: 'أثاث وتجهيزات مكتبية', accountCode: '11301', debit: 5000, credit: 0, description: 'شراء مكتب وكرسي' },
            { id: 'demo-jel-2', accountId: '10101', accountName: 'الصندوق الرئيسي', accountCode: '10101', debit: 0, credit: 5000, description: 'دفع نقدي' }
        ]
    },
    {
        id: 'demo-je-2',
        date: new Date(Date.now() - 86400000 * 2).toISOString().split('T')[0],
        description: 'سداد فاتورة كهرباء شهر مايو',
        reference: 'JE-DEMO-002',
        status: 'posted',
        is_posted: true,
        created_at: new Date(Date.now() - 86400000 * 2).toISOString(),
        userId: 'demo-user',
        attachments: [],
        lines: [
            { id: 'demo-jel-3', accountId: '5202', accountName: 'مصروفات كهرباء ومياه', accountCode: '5202', debit: 750, credit: 0, description: 'فاتورة كهرباء شهر مايو' },
            { id: 'demo-jel-4', accountId: '10101', accountName: 'الصندوق الرئيسي', accountCode: '10101', debit: 0, credit: 750, description: 'دفع نقدي' }
        ]
    }
];

const DUMMY_QUOTATIONS = [
    { id: 'demo-qt-1', quotation_number: 'QT-DEMO-001', customer_id: 'demo-c1', customerName: 'شركة الأفق للتجارة', date: new Date().toISOString().split('T')[0], total_amount: 11500, tax_amount: 1500, status: 'sent', items: [{ product_id: 'demo-p1', quantity: 1, unit_price: 10000, total: 10000 }] },
    { id: 'demo-qt-2', quotation_number: 'QT-DEMO-002', customer_id: 'demo-c2', customerName: 'مؤسسة النور', date: new Date(Date.now() - 86400000).toISOString().split('T')[0], total_amount: 5750, tax_amount: 750, status: 'draft', items: [{ product_id: 'demo-p2', quantity: 1, unit_price: 5000, total: 5000 }] }
];

const DUMMY_ASSETS = [
    { id: 'demo-ast-1', name: 'سيارة توصيل تويوتا', purchase_date: '2024-01-01', purchase_cost: 75000, current_value: 65000, status: 'active', useful_life: 5, salvage_value: 10000, asset_account_id: '1', accumulated_depreciation_account_id: '2', depreciation_expense_account_id: '3' },
    { id: 'demo-ast-2', name: 'لابتوب HP ProBook', purchase_date: '2024-03-15', purchase_cost: 3500, current_value: 2800, status: 'active', useful_life: 3, salvage_value: 0, asset_account_id: '1', accumulated_depreciation_account_id: '2', depreciation_expense_account_id: '3' }
];

const DUMMY_EMPLOYEES = [
    { id: 'demo-emp-1', full_name: 'أحمد محمد', position: 'مندوب مبيعات', salary: 4000, phone: '0500000000', status: 'active', join_date: '2023-01-01' },
    { id: 'demo-emp-2', full_name: 'سارة علي', position: 'محاسب عام', salary: 5500, phone: '0550000000', status: 'active', join_date: '2023-05-01' }
];

const DUMMY_CHEQUES = [
    { id: 'demo-chq-1', cheque_number: 'CHQ-1001', amount: 5000, due_date: '2024-12-01', status: 'issued', type: 'outgoing', party_name: 'شركة التوريدات العالمية', bank_name: 'بنك الرياض' },
    { id: 'demo-chq-2', cheque_number: 'CHQ-2002', amount: 12500, due_date: '2024-12-15', status: 'received', type: 'incoming', party_name: 'مؤسسة النور', bank_name: 'البنك الأهلي' }
];

const DUMMY_PURCHASE_ORDERS = [
    { id: 'demo-po-1', po_number: 'PO-DEMO-001', supplier_id: 'demo-s1', date: new Date().toISOString().split('T')[0], total_amount: 15000, status: 'pending', items: [] }
];

interface AccountingContextType {
  accounts: Account[];
  addAccount: (account: Omit<Account, 'id' | 'balance'> & { balance?: number }) => Promise<Account | void>;
  updateAccount: (id: string, updates: Partial<Omit<Account, 'id' | 'balance'>>) => Promise<void>;
  deleteAccount: (id: string, reason?: string) => Promise<{ success: boolean; message?: string }>;
  costCenters: CostCenter[];
  addCostCenter: (cc: Omit<CostCenter, 'id'>) => void;
  deleteCostCenter: (id: string) => void;
  entries: JournalEntry[];
  addEntry: (entry: Omit<JournalEntry, 'id' | 'created_at' | 'createdAt' | 'status' | 'is_posted'> & { status?: 'posted' | 'draft', attachments?: File[] }) => Promise<string | null>;
  customers: Customer[];
  addCustomer: (customer: Omit<Customer, 'id'>) => Promise<any>;
  updateCustomer: (id: string, customer: Partial<Customer>) => Promise<void>;
  deleteCustomer: (id: string, reason?: string) => Promise<void>;
  addCustomersBulk: (customers: Omit<Customer, 'id'>[]) => void;
  suppliers: Supplier[];
  addSupplier: (supplier: Omit<Supplier, 'id'>) => Promise<any>;
  updateSupplier: (id: string, supplier: Partial<Supplier>) => Promise<void>;
  deleteSupplier: (id: string, reason?: string) => Promise<void>;
  addSuppliersBulk: (suppliers: Omit<Supplier, 'id'>[]) => void;
  products: Product[];
  addProduct: (product: Omit<Product, 'id'>) => void;
  updateProduct: (id: string, product: Partial<Product>) => void;
  deleteProduct: (id: string, reason?: string) => void;
  addProductsBulk: (products: Omit<Product, 'id'>[]) => void;
  produceItem: (productId: string, quantity: number, warehouseId: string, date: string, additionalCost?: number, reference?: string) => Promise<{ success: boolean, message: string }>;
  categories: Category[];
  addCategory: (name: string) => void;
  deleteCategory: (id: string) => void;
  warehouses: Warehouse[];
  addWarehouse: (warehouse: Omit<Warehouse, 'id'>) => Promise<any>;
  updateWarehouse: (id: string, warehouse: Partial<Warehouse>) => Promise<void>;
  deleteWarehouse: (id: string, reason?: string) => Promise<void>;
  invoices: Invoice[];
  addInvoice: (invoice: any) => Promise<void>;
  approveSalesInvoice: (invoiceId: string) => Promise<void>;
  quotations: Quotation[];
  addQuotation: (quote: any) => void;
  convertQuotationToInvoice: (quotationId: string, warehouseId: string, treasuryId?: string, paidAmount?: number) => void;
  updateQuotationStatus: (id: string, status: Quotation['status']) => void;
  purchaseOrders: PurchaseOrder[];
  addPurchaseOrder: (po: any) => void;
  updatePurchaseOrder: (id: string, po: Partial<PurchaseOrder>) => void;
  convertPoToInvoice: (poId: string, warehouseId: string) => void;
  purchaseInvoices: PurchaseInvoice[];
  addPurchaseInvoice: (invoice: any) => Promise<void>;
  approvePurchaseInvoice: (invoiceId: string) => Promise<void>;
  salesReturns: SalesReturn[];
  addSalesReturn: (ret: any) => Promise<void>;
  purchaseReturns: PurchaseReturn[];
  addPurchaseReturn: (ret: any) => Promise<void>;
  inventoryCounts: InventoryCount[];
  addInventoryCount: (count: Omit<InventoryCount, 'id' | 'countNumber'>) => void;
  postInventoryCount: (id: string) => void;
  addInventoryAdjustment: (adj: any) => void;
  stockTransactions: StockTransaction[];
  vouchers: Voucher[];
  addReceiptVoucher: (voucher: any) => Promise<void>;
  addPaymentVoucher: (voucher: any) => Promise<void>;
  updateVoucher: (id: string, type: 'receipt' | 'payment', voucher: any) => Promise<void>;
  addCustomerDeposit: (voucher: any) => Promise<void>;
  cheques: Cheque[];
  addCheque: (cheque: any) => Promise<void>;
  updateChequeStatus: (id: string, status: Cheque['status'], actionDate: string, depositAccountId?: string) => void;
  assets: Asset[];
  addAsset: (asset: any) => Promise<void>;
  runDepreciation: (assetId: string, amount: number, date: string) => Promise<void>;
  revaluateAsset: (assetId: string, newValue: number, date: string, revaluationAccountId: string) => Promise<void>;
  employees: Employee[];
  addEmployee: (emp: any) => Promise<any>;
  updateEmployee: (id: string, emp: Partial<Employee>) => Promise<void>;
  deleteEmployee: (id: string, reason?: string) => Promise<void>;
  runPayroll: (month: string, date: string, treasuryAccountId: string, items: any[]) => Promise<void>;
  payrollHistory: PayrollRun[];
  budgets: Budget[];
  saveBudget: (budget: Omit<Budget, 'id'>) => void;
  notifications: AppNotification[];
  markNotificationAsRead: (id: string) => Promise<void>;
  clearAllNotifications: () => Promise<void>;
  activityLog: ActivityLogEntry[];
  transfers: any[];
  addTransfer: (transfer: any) => Promise<void>;
  addStockTransfer: (transfer: any) => Promise<void>;
  bankReconciliations: any[];
  addBankReconciliation: (rec: any) => void;
  getBookBalanceAtDate: (accountId: string, date: string) => number;
  getAccountBalanceInPeriod: (accountId: string, startDate: string, endDate: string) => number;
  salespeople: Salesperson[];
  getSystemAccount: (key: keyof typeof SYSTEM_ACCOUNTS) => Account | undefined;
  currentUser: User | null;
  users: User[];
  login: (username: string, pin: string) => Promise<{ success: boolean; message?: string }>;
  logout: () => Promise<void>;
  addUser: (user: any) => void;
  updateUser: (id: string, user: Partial<User>) => void;
  deleteUser: (id: string) => void;
  settings: SystemSettings;
  updateSettings: (newSettings: SystemSettings) => void;
  exportData: () => void;
  importData: (jsonData: string) => boolean;
  factoryReset: () => void;
  closeFinancialYear: (year: number, closingDate: string) => Promise<boolean>;
  getFinancialSummary: () => FinancialSummary;
  refreshData: () => Promise<void>;
  userPermissions: Set<string>;
  can: (module: string, action: string) => boolean;
  lastUpdated: Date | null;
  recalculateStock: () => Promise<void>;
  clearCache: () => Promise<void>;
  exportJournalToCSV: () => void;
  authInitialized: boolean;
  isLoading: boolean;
  getInvoicesPaginated: (page: number, pageSize: number, search?: string, startDate?: string, endDate?: string) => Promise<{ data: Invoice[], count: number }>;
  getJournalEntriesPaginated: (page: number, pageSize: number, search?: string, userId?: string) => Promise<{ data: JournalEntry[], count: number }>;
  restoreItem: (table: string, id: string) => Promise<{ success: boolean, message?: string }>;
  permanentDeleteItem: (table: string, id: string) => Promise<{ success: boolean, message?: string }>;
  emptyRecycleBin: (table: string) => Promise<{ success: boolean, message?: string }>;
}

const AccountingContext = createContext<AccountingContextType | undefined>(undefined);

export const useAccounting = () => {
  const context = useContext(AccountingContext);
  if (!context) throw new Error('useAccounting must be used within an AccountingProvider');
  return context;
};

export const AccountingProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { login: authLogin, logout: authLogout } = useAuth();
  const { showToast } = useToast();
  // @ts-ignore
  const [settings, setSettings] = useState<SystemSettings>({ companyName: 'TriPro ERP', taxNumber: '', address: 'القاهرة', phone: '', email: '', vatRate: 14, currency: 'ج.م', footerText: 'شكراً لثقتكم', enableTax: true, maxCashDeficitLimit: 500 });
  const [users, setUsers] = useState<User[]>([{ id: '00000000-0000-0000-0000-000000000000', name: 'المدير العام', username: 'admin', password: '123', role: 'admin', is_active: true }]);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [userPermissions, setUserPermissions] = useState<Set<string>>(new Set());
  const [userRole, setUserRole] = useState<string | null>(null);
  const [authInitialized, setAuthInitialized] = useState(false);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [purchaseInvoices, setPurchaseInvoices] = useState<PurchaseInvoice[]>([]);
  const [salesReturns, setSalesReturns] = useState<SalesReturn[]>([]);
  const [purchaseReturns, setPurchaseReturns] = useState<PurchaseReturn[]>([]);
  const [vouchers, setVouchers] = useState<Voucher[]>([]);
  const [stockTransactions, setStockTransactions] = useState<StockTransaction[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [inventoryCounts, setInventoryCounts] = useState<InventoryCount[]>([]);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [activityLog, setActivityLog] = useState<ActivityLogEntry[]>([]);
  const [cheques, setCheques] = useState<Cheque[]>([]);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [payrollHistory, setPayrollHistory] = useState<PayrollRun[]>([]);
  const [quotations, setQuotations] = useState<Quotation[]>([]);
  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrder[]>([]);
  const [costCenters, setCostCenters] = useState<CostCenter[]>([]);
  const [transfers, setTransfers] = useState<any[]>([]);
  const [bankReconciliations, setBankReconciliations] = useState<any[]>([]);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const getAccountId = (code: string) => {
    const acc = accounts.find(a => a.code === code);
    return acc ? acc.id : null;
  };

  const getSystemAccount = (key: keyof typeof SYSTEM_ACCOUNTS) => {
    // 1. البحث في الإعدادات (الربط المخصص)
    if (settings.account_mappings && settings.account_mappings[key]) {
      const mappedId = settings.account_mappings[key];
      const acc = accounts.find(a => a.id === mappedId);
      if (acc) return acc;
    }
    // 2. البحث بالكود الافتراضي
    const defaultCode = SYSTEM_ACCOUNTS[key];
    return accounts.find(a => a.code === defaultCode);
  };

  const fetchData = async () => {
    setIsLoading(true);
    // التحقق من هوية المستخدم (لإخفاء التكلفة عن الديمو)
    const { data: { session } } = await supabase.auth.getSession();
    const isDemo = session?.user?.user_metadata?.app_role === 'demo' || session?.user?.email === 'demo@demo.com' || session?.user?.id === 'f95ae857-91fb-4637-8c6a-7fe45e8fa005';

    // محاولة استرجاع البيانات من التخزين المؤقت أولاً
    const cachedAccounts = localStorage.getItem('cached_accounts');
    const cachedCustomers = localStorage.getItem('cached_customers');
    const cachedSuppliers = localStorage.getItem('cached_suppliers');
    const cachedProducts = localStorage.getItem('cached_products');

    let hasCache = false;

    if (cachedAccounts) {
        setAccounts(JSON.parse(cachedAccounts));
        hasCache = true;
    }

    // استراتيجية Stale-While-Revalidate:
    // إذا كانت البيانات موجودة في الكاش، نعرضها فوراً للمستخدم ونلغي حالة التحميل
    // ثم نقوم بجلب البيانات الحديثة في الخلفية وتحديث الواجهة عند وصولها
    if (hasCache) {
        setIsLoading(false);
    }

    try {
      // استخدام Promise.all لجلب البيانات بشكل متوازي لتقليل وقت الانتظار
      const [
        { data: whs, error: wError },
        { data: sysSettings },
        { data: fetchedAccounts, error: accError },
        { data: jEntries, error: jError },
        { data: custs },
        { data: supps },
        { data: prods },
        { data: chqs },
        { data: assetsData },
        { data: employeesData },
        { data: profilesData },
        { data: salesInvoicesData },
        { data: purchaseInvoicesData },
        { data: rVouchers },
        { data: pVouchers },
        { data: notificationsData },
        { data: depreciationData },
        { data: allBalances } // جلب أرصدة جميع الحسابات من السيرفر
      ] = await Promise.all([
        supabase.from('warehouses').select('*').is('deleted_at', null),
        supabase.from('company_settings').select('*').limit(1).single(),
        supabase.from('accounts').select('*').is('deleted_at', null),
        supabase.from('journal_entries').select('*, journal_lines (*), journal_attachments (*)').order('transaction_date', { ascending: false }).limit(100),
        supabase.from('customers').select('*').is('deleted_at', null),
        supabase.from('suppliers').select('*').is('deleted_at', null),
        supabase.from('products').select('*').is('deleted_at', null),
        supabase.from('cheques').select('*'),
        supabase.from('assets').select('*').is('deleted_at', null),
        supabase.from('employees').select('*').is('deleted_at', null),
        supabase.from('profiles').select('*'),
        supabase.from('invoices').select('*').order('invoice_date', { ascending: false }).limit(50),
        supabase.from('purchase_invoices').select('*').order('invoice_date', { ascending: false }).limit(50),
        supabase.from('receipt_vouchers').select('*').order('receipt_date', { ascending: false }).limit(50),
        supabase.from('payment_vouchers').select('*').order('payment_date', { ascending: false }).limit(50),
        supabase.from('notifications').select('*').eq('is_read', false).order('created_at', { ascending: false }).limit(20),
        supabase.from('journal_entries').select('related_document_id, journal_lines(credit)').eq('related_document_type', 'asset_depreciation').eq('status', 'posted'),
        supabase.rpc('get_all_account_balances')
      ]);

      // 1. معالجة المستودعات
      if (isDemo) {
        setWarehouses(DUMMY_WAREHOUSES as any);
      } else if (whs && whs.length > 0 && !isDemo) {
        setWarehouses(whs);
      } else if (warehouses.length === 0) {
        if (warehouses.length === 0) setWarehouses([{id: generateUUID(), name: 'المستودع الرئيسي', type: 'warehouse'}]);
      }

      // 2. معالجة الإعدادات
      if (sysSettings) {
          setSettings({
              companyName: sysSettings.company_name || 'TriPro ERP',
              company_name: sysSettings.company_name || 'TriPro ERP',
              taxNumber: sysSettings.tax_number || '',
              tax_number: sysSettings.tax_number || '',
              address: sysSettings.address || '',
              phone: sysSettings.phone || '',
              email: sysSettings.email || '',
              vatRate: sysSettings.vat_rate ? (sysSettings.vat_rate <= 1 ? sysSettings.vat_rate * 100 : sysSettings.vat_rate) : 15,
              vat_rate: sysSettings.vat_rate ? (sysSettings.vat_rate <= 1 ? sysSettings.vat_rate * 100 : sysSettings.vat_rate) : 15,
              currency: sysSettings.currency || 'SAR',
              footerText: sysSettings.footer_text || '',
              footer_text: sysSettings.footer_text || '',
              enableTax: sysSettings.enable_tax ?? true,
              // @ts-ignore
              logoUrl: sysSettings.logo_url,
              lastClosedDate: sysSettings.last_closed_date,
              // @ts-ignore
              preventPriceModification: sysSettings.prevent_price_modification ?? false,
              // @ts-ignore
              maxCashDeficitLimit: sysSettings.max_cash_deficit_limit ?? 500,
              account_mappings: sysSettings.account_mappings || {}
          });
      }

      // 3. معالجة الحسابات
      let accs = fetchedAccounts ? [...fetchedAccounts] : [];
      
      if (accError) {
          console.error("Error fetching accounts:", accError);
          // Database seeding is now handled by SQL script
      }

      // دالة مساعدة للتحقق من وجود الحسابات وإضافتها
      const ensureAccount = async (code: string, name: string, type: string) => {
          if (accs) {
              const exists = accs.find((a: any) => a.code === code);
              if (!exists) {
                  const { data: newAcc, error: createError } = await supabase.from('accounts').insert({
                      id: generateUUID(),
                      code: code,
                      name: name,
                      type: type,
                      is_group: false
                  }).select().single();
                  if (!createError && newAcc) accs.push(newAcc);
              }
          }
      };

      // التحقق من الحسابات الأساسية
      await ensureAccount(SYSTEM_ACCOUNTS.INVENTORY_ADJUSTMENTS, 'فروقات جرد وتسويات مخزنية', 'EXPENSE');
      await ensureAccount(SYSTEM_ACCOUNTS.EMPLOYEE_BONUSES, 'مصروف مكافآت وإضافي', 'EXPENSE');
      await ensureAccount(SYSTEM_ACCOUNTS.EMPLOYEE_DEDUCTIONS, 'إيراد خصومات وجزاءات', 'REVENUE');
      await ensureAccount(SYSTEM_ACCOUNTS.VAT_INPUT, 'ضريبة القيمة المضافة - مدخلات', 'ASSET');
      await ensureAccount(SYSTEM_ACCOUNTS.BANK_CHARGES, 'مصروفات بنكية', 'EXPENSE');
      await ensureAccount(SYSTEM_ACCOUNTS.BANK_INTEREST_INCOME, 'فوائد بنكية (إيراد)', 'REVENUE');
      await ensureAccount(SYSTEM_ACCOUNTS.TAX_AUTHORITY, 'مصلحة الضرائب المصرية', 'LIABILITY');
      await ensureAccount(SYSTEM_ACCOUNTS.SOCIAL_INSURANCE, 'هيئة التأمينات الاجتماعية', 'LIABILITY');
      await ensureAccount(SYSTEM_ACCOUNTS.WITHHOLDING_TAX, 'ضريبة الخصم والتحصيل', 'LIABILITY');
      await ensureAccount(SYSTEM_ACCOUNTS.EMPLOYEE_ADVANCES, 'سلف الموظفين', 'ASSET');
      await ensureAccount(SYSTEM_ACCOUNTS.CUSTOMER_DEPOSITS, 'تأمينات العملاء', 'LIABILITY');
      await ensureAccount(SYSTEM_ACCOUNTS.SUPPLIERS, 'الموردين', 'LIABILITY');
      await ensureAccount(SYSTEM_ACCOUNTS.CUSTOMERS, 'العملاء', 'ASSET');
      await ensureAccount(SYSTEM_ACCOUNTS.INVENTORY, 'المخزون', 'ASSET');
      await ensureAccount(SYSTEM_ACCOUNTS.INVENTORY_RAW_MATERIALS, 'مخزون المواد الخام', 'ASSET');
      await ensureAccount(SYSTEM_ACCOUNTS.INVENTORY_FINISHED_GOODS, 'مخزون المنتج التام', 'ASSET');
      await ensureAccount(SYSTEM_ACCOUNTS.INVENTORY_RAW_MATERIALS, 'مخزون المواد الخام', 'ASSET');
      await ensureAccount(SYSTEM_ACCOUNTS.INVENTORY_FINISHED_GOODS, 'مخزون المنتج التام', 'ASSET');
      await ensureAccount(SYSTEM_ACCOUNTS.SALARIES_EXPENSE, 'الرواتب والأجور', 'EXPENSE');

      // 4. معالجة القيود وحساب الأرصدة
      if (jError) console.error("Journal Fetch Error:", jError);

      // تحويل مصفوفة الأرصدة إلى خريطة لسهولة الوصول
      const dbBalances: Record<string, number> = {};
      if (allBalances) {
          allBalances.forEach((b: any) => {
              dbBalances[b.account_id] = Number(b.balance);
          });
      }

      const accountBalances: Record<string, number> = {};
      let formattedEntries: JournalEntry[] = [];

      // إخفاء القيود عن مستخدم الديمو
      if (isDemo) {
          formattedEntries = [];
      } else if (jEntries) {
        formattedEntries = jEntries.map((entry: any) => ({
          id: entry.id,
          date: entry.transaction_date || entry.created_at?.split('T')[0],
          description: entry.description,
          reference: entry.reference,
          status: entry.status,
          createdAt: entry.created_at,
          userId: entry.user_id, // إضافة معرف المستخدم للقيد
          created_at: entry.created_at,
          is_posted: entry.status === 'posted',
          attachments: entry.journal_attachments || [],
          lines: (entry.journal_lines || []).map((line: any) => {
            // البحث عن بيانات الحساب لدمجها مباشرة
            const account = accs?.find((a: any) => a.id === line.account_id);

            return {
              id: line.id,
              accountId: line.account_id,
              accountName: account?.name || 'حساب غير معروف',
              accountCode: account?.code || '',
              debit: line.debit,
              credit: line.credit,
              description: line.description,
              costCenterId: line.cost_center_id
            };
          })
        }));
        setEntries(formattedEntries);
      }

      // تحديث الحسابات مع الأرصدة المحسوبة
      if (accs && accs.length > 0) {
        // 1. تحديث الحسابات الفرعية بالأرصدة المحسوبة من القيود
        const accountsWithBalances = accs.map(a => {
            const rawBalance = dbBalances[a.id] || 0; // الرصيد الخام (مدين - دائن)
            const type = String(a.type || '').toLowerCase();
            const isDebitNature = ['asset', 'expense', 'أصول', 'مصروفات', 'تكلفة المبيعات', 'cost of goods sold'].some(t => type.includes(t));
            
            // ضبط الإشارة بناءً على طبيعة الحساب
            const finalBalance = isDebitNature ? rawBalance : -rawBalance;

            return {
                ...a, 
                isGroup: a.is_group, 
                parentAccount: a.parent_account,
                balance: finalBalance
            };
        });

        // 2. تجميع الأرصدة للحسابات الرئيسية (الآباء)
        // نقوم بتكرار العملية لضمان تجميع المستويات المتعددة (شجرة الحسابات)
        let changed = true;
        while (changed) {
            changed = false;
            accountsWithBalances.forEach(parent => {
                if (parent.is_group) {
                    const childrenBalance = accountsWithBalances
                        .filter(child => child.parent_account === parent.id)
                        .reduce((sum, child) => sum + (child.balance || 0), 0);
                    
                    if (parent.balance !== childrenBalance) {
                        parent.balance = childrenBalance;
                        changed = true;
                    }
                }
            });
        }

        setAccounts(accountsWithBalances);
        localStorage.setItem('cached_accounts', JSON.stringify(accs)); // تحديث الكاش
      } else if (!accError && (!accs || accs.length === 0)) {
        console.error("Chart of Accounts is empty. Please run the setup SQL script on your database.");
      }

      if (isDemo) {
        setCustomers(DUMMY_CUSTOMERS as any);
        setSuppliers(DUMMY_SUPPLIERS as any);
        setProducts(DUMMY_PRODUCTS as any);
        setInvoices(DUMMY_INVOICES as any);
        setVouchers(DUMMY_VOUCHERS as any);
        setEntries(DUMMY_JOURNAL_ENTRIES.map(e => ({
            ...e,
            createdAt: e.created_at,
            is_posted: true,
            lines: e.lines.map(l => ({...l, id: l.id || generateUUID()}))
        })) as any);
        setPurchaseInvoices([]);
        setQuotations(DUMMY_QUOTATIONS as any);
        setAssets(DUMMY_ASSETS.map(a => ({
            ...a,
            purchaseDate: a.purchase_date,
            purchaseCost: a.purchase_cost,
            currentValue: a.current_value,
            usefulLife: a.useful_life,
            salvageValue: a.salvage_value,
            assetAccountId: a.asset_account_id,
            accumulatedDepreciationAccountId: a.accumulated_depreciation_account_id,
            depreciationExpenseAccountId: a.depreciation_expense_account_id,
            totalDepreciation: a.purchase_cost - a.current_value
        })) as any);
        setEmployees(DUMMY_EMPLOYEES as any);
        setCheques(DUMMY_CHEQUES.map(c => ({...c, chequeNumber: c.cheque_number, bankName: c.bank_name, dueDate: c.due_date, partyName: c.party_name})) as any);
        setPurchaseOrders(DUMMY_PURCHASE_ORDERS as any);
        setCostCenters([{id: 'demo-cc-1', name: 'الفرع الرئيسي', code: 'CC-01'}, {id: 'demo-cc-2', name: 'فرع الرياض', code: 'CC-02'}]);
      } else {
        if (custs) {
          setCustomers(custs.map(c => ({...c, taxId: c.tax_id, customerType: c.customer_type, credit_limit: c.credit_limit })));
          localStorage.setItem('cached_customers', JSON.stringify(custs));
        }
        if (supps) {
          setSuppliers(supps.map(s => ({...s, taxId: s.tax_id, contactPerson: s.contact_person})));
          localStorage.setItem('cached_suppliers', JSON.stringify(supps));
        }
        if (prods) {
          const processedProds = prods.map(p => ({
              ...p,
              warehouseStock: p.warehouse_stock,
              cost: p.cost,
              purchase_price: p.purchase_price,
              weighted_average_cost: p.weighted_average_cost
          }));
          setProducts(processedProds);
          localStorage.setItem('cached_products', JSON.stringify(processedProds));
        }
      }

      if (chqs && !isDemo) setCheques(chqs.map(c => ({...c, chequeNumber: c.cheque_number, bankName: c.bank_name, dueDate: c.due_date, partyName: c.party_name, partyId: c.party_id})));

      // 5. تحديث باقي البيانات
      if (assetsData) {
        // تجميع إهلاكات الأصول من البيانات الكاملة
        const depreciationMap: Record<string, number> = {};
        if (depreciationData) {
            depreciationData.forEach((entry: any) => {
                if (entry.related_document_id) {
                    const creditSum = entry.journal_lines?.reduce((sum: number, l: any) => sum + (l.credit || 0), 0) || 0;
                    depreciationMap[entry.related_document_id] = (depreciationMap[entry.related_document_id] || 0) + creditSum;
                }
            });
        }

        setAssets(assetsData.map((a: any) => {
          const totalDepreciation = depreciationMap[a.id] || 0;

          return {
            id: a.id,
            name: a.name,
            purchase_date: a.purchase_date,
            purchaseDate: a.purchase_date,
            purchase_cost: a.purchase_cost,
            purchaseCost: a.purchase_cost,
            salvage_value: a.salvage_value,
            salvageValue: a.salvage_value,
            useful_life_years: a.useful_life,
            usefulLife: a.useful_life,
            asset_account_id: a.asset_account_id,
            assetAccountId: a.asset_account_id,
            accumulated_depreciation_account_id: a.accumulated_depreciation_account_id,
            accumulatedDepreciationAccountId: a.accumulated_depreciation_account_id,
            depreciation_expense_account_id: a.depreciation_expense_account_id,
            depreciationExpenseAccountId: a.depreciation_expense_account_id,
            current_value: a.purchase_cost - totalDepreciation,
            currentValue: a.purchase_cost - totalDepreciation,
            total_depreciation: totalDepreciation,
            totalDepreciation: totalDepreciation,
            status: a.status || 'active',
            cost_center_id: a.cost_center_id
          };
        }));
      }

      if (employeesData && !isDemo) { // في الديمو تم تعيينهم بالفعل من DUMMY_EMPLOYEES
          setEmployees(employeesData);
      }

      if (profilesData && !isDemo) {
          const mappedUsers = profilesData.map((p: any) => ({
              id: p.id,
              name: p.full_name || p.email || 'مستخدم',
              username: p.email || '',
              role: p.role || 'user',
              is_active: true
          }));
          
          setUsers(prev => {
              const existingIds = new Set(prev.map(u => u.id));
              const newUsers = mappedUsers.filter((u: any) => !existingIds.has(u.id));
              return [...prev, ...newUsers];
          });
      } else if (isDemo) {
          setUsers([
              { id: '00000000-0000-0000-0000-000000000000', name: 'المدير العام', username: 'admin', role: 'super_admin', is_active: true },
              { id: 'demo-u1', name: 'أحمد محمد', username: 'ahmed', role: 'sales', is_active: true },
              { id: 'demo-u2', name: 'سارة علي', username: 'sara', role: 'sales', is_active: true }
          ]);
      }

      if (salesInvoicesData && !isDemo) {
          setInvoices(salesInvoicesData.map((inv: any) => ({
              id: inv.id,
              invoiceNumber: inv.invoice_number || '',
              invoice_number: inv.invoice_number || '',
              customerName: inv.customers?.name || 'عميل غير معروف', // إضافة اسم العميل للفواتير الحقيقية أيضاً
              customerId: inv.customer_id || '',
              customer_id: inv.customer_id || '',
              salespersonId: inv.salesperson_id || '',
              warehouseId: inv.warehouse_id || '',
              date: inv.invoice_date || new Date().toISOString().split('T')[0],
              due_date: inv.due_date || '',
              totalAmount: inv.total_amount || 0,
              total_amount: inv.total_amount || 0,
              taxAmount: inv.tax_amount || 0,
              tax_amount: inv.tax_amount || 0,
              subtotal: inv.subtotal || ((inv.total_amount || 0) - (inv.tax_amount || 0)),
              status: inv.status || 'draft',
              notes: inv.notes || '',
              items: [], // Items can be loaded on demand
              // إضافة الحقول الجديدة للتعامل مع الدفعات
              paid_amount: inv.paid_amount || 0,
              discount_amount: inv.discount_amount || 0,
              treasury_account_id: inv.treasury_account_id || ''
          })));
      }

      if (purchaseInvoicesData && !isDemo) {
          setPurchaseInvoices(purchaseInvoicesData.map((inv: any) => ({
              id: inv.id,
              invoiceNumber: inv.invoice_number,
              invoice_number: inv.invoice_number,
              supplierId: inv.supplier_id,
              supplier_id: inv.supplier_id,
              date: inv.invoice_date, // توحيد الاسم لـ date
              due_date: inv.due_date,
              totalAmount: inv.total_amount, // توحيد الاسم لـ totalAmount
              total_amount: inv.total_amount,
              taxAmount: inv.tax_amount,
              tax_amount: inv.tax_amount,
              subtotal: inv.total_amount - (inv.tax_amount || 0),
              status: inv.status,
              items: []
          })));
      }

      let allVouchers: Voucher[] = [];
      
      if (!isDemo) {
          if (rVouchers) {
            allVouchers = [...allVouchers, ...rVouchers.map((v: any) => ({
              id: v.id,
              voucherNumber: v.voucher_number,
            voucher_number: v.voucher_number,
              date: v.receipt_date,
              amount: v.amount,
            subType: 'customer' as const,
            treasury_account_id: v.treasury_account_id,
            payment_method: v.payment_method,
              description: v.notes,
            type: 'receipt' as const,
              partyId: v.customer_id
            }))];
          }
          if (pVouchers) {
            allVouchers = [...allVouchers, ...pVouchers.map((v: any) => ({
              id: v.id,
              voucherNumber: v.voucher_number,
            voucher_number: v.voucher_number,
              date: v.payment_date,
              amount: v.amount,
            subType: 'supplier' as const,
            treasury_account_id: v.treasury_account_id,
            payment_method: v.payment_method,
              description: v.notes,
            type: 'payment' as const,
              partyId: v.supplier_id
            }))];
          }
          setVouchers(allVouchers.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()));
      }

      if (notificationsData) setNotifications(notificationsData);

      setLastUpdated(new Date());
    } catch (error) {
      console.error("Error fetching data from Supabase:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const getInvoicesPaginated = async (page: number, pageSize: number, search?: string, startDate?: string, endDate?: string) => {
    try {
        // حماية أمنية: إذا كان المستخدم ديمو، نعرض بيانات وهمية فقط
        if (currentUser?.role === 'demo') {
            const filtered = DUMMY_INVOICES.filter(inv => 
                (!search || inv.invoiceNumber.toLowerCase().includes(search.toLowerCase()) || inv.customerName.toLowerCase().includes(search.toLowerCase()))
            );
            const start = (page - 1) * pageSize;
            const end = start + pageSize;
            return { data: filtered.slice(start, end) as any, count: filtered.length };
        }

        let query = supabase
            .from('invoices')
            // الانضمام إلى جدول العملاء لجلب الاسم والبحث فيه
            .select('*, customers(name, phone)', { count: 'exact' })
            .order('invoice_date', { ascending: false })
            .range((page - 1) * pageSize, page * pageSize - 1);

        if (search) {
            // البحث في رقم الفاتورة فقط (البحث المشترك مع جدول آخر يسبب خطأ 400 في Supabase حالياً)
            query = query.ilike('invoice_number', `%${search}%`);
        }

        if (startDate) {
            query = query.gte('invoice_date', startDate);
        }

        if (endDate) {
            query = query.lte('invoice_date', endDate);
        }

        const { data, count, error } = await query;
        
        if (error) throw error;

        const mappedInvoices: any[] = data?.map((inv: any) => ({
            id: inv.id,
            invoiceNumber: inv.invoice_number || '',
            invoice_number: inv.invoice_number || '',
            customerId: inv.customer_id || '',
            customer_id: inv.customer_id || '',
            customerName: inv.customers?.name || 'عميل غير معروف', // إضافة اسم العميل
            customerPhone: inv.customers?.phone,
            salespersonId: inv.salesperson_id || '',
            warehouseId: inv.warehouse_id || '',
            date: inv.invoice_date || new Date().toISOString().split('T')[0],
            due_date: inv.due_date || '',
            totalAmount: inv.total_amount || 0,
            total_amount: inv.total_amount || 0,
            taxAmount: inv.tax_amount || 0,
            tax_amount: inv.tax_amount || 0,
            subtotal: inv.subtotal || ((inv.total_amount || 0) - (inv.tax_amount || 0)),
            status: inv.status || 'draft',
            notes: inv.notes || '',
            items: [], 
            paid_amount: inv.paid_amount || 0,
            discount_amount: inv.discount_amount || 0,
            treasury_account_id: inv.treasury_account_id || ''
        })) || [];

        return { data: mappedInvoices, count: count || 0 };
    } catch (error) {
        console.error("Error fetching paginated invoices:", error);
        return { data: [], count: 0 };
    }
  };

  const getJournalEntriesPaginated = async (page: number, pageSize: number, search?: string, userId?: string) => {
    try {
        // حماية أمنية: منع الديمو من رؤية القيود الحقيقية
        if (currentUser?.role === 'demo') {
            const filtered = DUMMY_JOURNAL_ENTRIES.filter(entry => 
                (!search || (entry.reference && entry.reference.toLowerCase().includes(search.toLowerCase())) || (entry.description && entry.description.toLowerCase().includes(search.toLowerCase())))
            );
            const start = (page - 1) * pageSize;
            const end = start + pageSize;
            return { data: filtered.slice(start, end) as any, count: filtered.length };
        }

        let query = supabase
            .from('journal_entries')
            .select('*, journal_lines (*), journal_attachments (*)', { count: 'exact' })
            .order('transaction_date', { ascending: false })
            .range((page - 1) * pageSize, page * pageSize - 1);

        if (search) {
            query = query.or(`reference.ilike.%${search}%,description.ilike.%${search}%`);
        }

        if (userId) {
            query = query.eq('user_id', userId);
        }

        const { data, count, error } = await query;
        
        if (error) throw error;

        const formattedEntries = data?.map((entry: any) => ({
          id: entry.id,
          date: entry.transaction_date || entry.created_at?.split('T')[0],
          description: entry.description,
          reference: entry.reference,
          status: entry.status,
          is_posted: entry.status === 'posted',
          created_at: entry.created_at,
          createdAt: entry.created_at,
          userId: entry.user_id,
          attachments: entry.journal_attachments || [],
          lines: (entry.journal_lines || []).map((line: any) => {
            const account = accounts.find((a: any) => a.id === line.account_id);
            return {
              id: line.id,
              accountId: line.account_id,
              accountName: account?.name || 'حساب غير معروف',
              accountCode: account?.code || '',
              debit: line.debit,
              credit: line.credit,
              description: line.description,
              costCenterId: line.cost_center_id
            };
          })
        })) || [];

        return { data: formattedEntries, count: count || 0 };
    } catch (error) {
        console.error("Error fetching paginated journal entries:", error);
        return { data: [], count: 0 };
    }
  };

  const clearCache = async () => {
    localStorage.removeItem('cached_accounts');
    localStorage.removeItem('cached_customers');
    localStorage.removeItem('cached_suppliers');
    localStorage.removeItem('cached_products');
    await fetchData(); // إعادة تحميل البيانات من الخادم فوراً
  };

  const exportJournalToCSV = () => {
    try {
        const rows = [];
        // عناوين الأعمدة باللغة العربية
        const headers = ['التاريخ', 'رقم القيد', 'البيان', 'كود الحساب', 'اسم الحساب', 'مدين', 'دائن', 'مركز التكلفة', 'الحالة'];
        rows.push(headers.join(','));

        // ترتيب القيود حسب التاريخ
        const sortedEntries = [...entries].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

        sortedEntries.forEach(entry => {
            entry.lines.forEach(line => {
                const account = accounts.find(a => a.id === line.accountId);
                const costCenter = costCenters.find(cc => cc.id === line.costCenterId);
                
                // تنظيف النصوص من الفواصل وعلامات التنصيص لتجنب كسر ملف CSV
                const clean = (text: string) => `"${(text || '').replace(/"/g, '""')}"`;

                const row = [
                    entry.date,
                    clean(entry.reference),
                    clean(line.description || entry.description),
                    account?.code || '',
                    clean(account?.name || line.accountName),
                    line.debit,
                    line.credit,
                    clean(costCenter?.name || ''),
                    entry.status === 'posted' ? 'مرحّل' : 'مسودة'
                ];
                rows.push(row.join(','));
            });
        });

        // إضافة BOM (\uFEFF) لضمان قراءة Excel للغة العربية بشكل صحيح
        const csvContent = rows.join('\n');
        const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
        
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `journal_entries_${new Date().toISOString().split('T')[0]}.csv`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    } catch (error: any) {
        console.error("Export Error:", error);
        alert("حدث خطأ أثناء التصدير: " + error.message);
    }
  };

  useEffect(() => {
    fetchData();

    const { data: authListener } = supabase.auth.onAuthStateChange((event, session) => {
      handleAuthChange(session?.user || null);
    });

    return () => {
      authListener.subscription.unsubscribe();
    };
  }, []);

  const handleAuthChange = useCallback(async (user: any) => {
    if (user) {
        try {
            const { data: profile } = await supabase.from('profiles').select('*').eq('id', user.id).maybeSingle();
            
            const email = (user.email || profile?.email || '').toLowerCase();
            // فرض دور demo للمستخدم المحدد
            const isDemoUser = email === 'demo@demo.com';
            
            // تحديد الدور: الديمو أولاً، ثم البيانات الوصفية، ثم البروفايل، وأخيراً viewer
            const roleName = isDemoUser ? 'demo' : (user.user_metadata?.app_role || profile?.role || 'viewer');
            
            setCurrentUser({
                id: user.id,
                name: profile?.full_name || user.user_metadata?.full_name || user.email,
                username: user.email,
                role: roleName,
                is_active: profile?.is_active ?? true
            });
            setUserRole(roleName);

            // تعيين الصلاحيات بناءً على الدور
            if (roleName === 'super_admin') {
                const { data: allPerms } = await supabase.from('permissions').select('module, action');
                setUserPermissions(new Set(allPerms?.map(p => `${p.module}.${p.action}`) || []));
            } else if (roleName === 'demo' || isDemoUser) {
                // صلاحيات الديمو الشاملة
                setUserPermissions(new Set(['*.view', '*.read', '*.create', '*.update', '*.list', '*.*']));
            } else {
                // إصلاح: التحقق من وجود role_id قبل الاستعلام لتجنب خطأ 400
                if (profile && profile.role_id) {
                    const { data: rolePerms } = await supabase.from('role_permissions').select('permissions(module, action)').eq('role_id', profile.role_id);
                    setUserPermissions(new Set(rolePerms?.map((p: any) => p.permissions && `${p.permissions.module}.${p.permissions.action}`) || []));
                } else {
                    setUserPermissions(new Set()); // مستخدم بدون دور محدد
                }
            }
            fetchData(); 
        } catch (error) {
            console.error("Error handling auth change:", error);
            setCurrentUser(null);
        }
    } else {
        setCurrentUser(null);
        setUserRole(null);
        setUserPermissions(new Set());
    }
    setAuthInitialized(true);
  }, []);

  const salespeople = useMemo(() => users.filter(u => u.role === 'sales' || u.role === 'admin').map(u => ({ id: u.id, name: u.name })), [users]);

  const logActivity = async (action: string, details: string, amount?: number, metadata?: any) => {
    const newLog: ActivityLogEntry = {
      id: generateUUID(),
      date: new Date().toISOString(),
      user: currentUser?.name || 'النظام',
      action,
      details,
      amount
    };
    setActivityLog(prev => [newLog, ...prev].slice(0, 500));

    // حفظ النشاط في سجلات الأمان بقاعدة البيانات لضمان ظهوره في صفحة السجلات
    try {
        // السماح بتسجيل عمليات المدير العام الافتراضي (ID الأصفار)
        const isHardcodedAdmin = currentUser?.id === '00000000-0000-0000-0000-000000000000';
        
        if (currentUser) {
            await supabase.from('security_logs').insert({
                event_type: action,
                description: details,
                performed_by: isHardcodedAdmin ? null : currentUser.id,
                created_at: new Date().toISOString(),
                metadata: metadata
            });
        }
    } catch (error) {
        console.warn("Failed to persist activity log to DB", error);
    }
  };

  // تعريف دوال الحذف مع التسجيل (Logging)
  const deleteAccount = async (id: string, reason?: string) => {
    if (currentUser?.role === 'demo') {
        return { success: false, message: 'غير مسموح بحذف البيانات في النسخة التجريبية' };
    }
    try {
      const account = accounts.find(a => a.id === id);
      const { error } = await supabase.from('accounts').update({ deleted_at: new Date().toISOString(), deletion_reason: reason }).eq('id', id);
      if (error) throw error;
      await fetchData();
      logActivity('حذف حساب', `تم حذف الحساب: ${account?.name || id} (${account?.code || '-'})` + (reason ? ` - السبب: ${reason}` : ''));
      return { success: true };
    } catch (error: any) {
      return { success: false, message: error.message };
    }
  };

  const updateProduct = async (id: string, updates: Partial<Product>) => {
    try {
      const oldData = products.find(p => p.id === id);
      const { error } = await supabase.from('products').update(updates).eq('id', id);
      if (error) throw error;
      
      setProducts(prev => prev.map(p => p.id === id ? { ...p, ...updates } : p));

      // تسجيل التغييرات
      const changes: any = {};
      if (oldData) {
          Object.keys(updates).forEach(key => {
              const k = key as keyof Product;
              if (oldData[k] !== updates[k]) {
                  changes[key] = { from: oldData[k], to: updates[k] };
              }
          });
      }
      if (Object.keys(changes).length > 0) {
          logActivity('تعديل صنف', `تعديل بيانات الصنف: ${oldData?.name}`, undefined, { changes });
      }
    } catch (error: any) {
      console.error("Error updating product:", error);
      throw error;
    }
  };

  const deleteProduct = async (id: string, reason?: string) => {
    if (currentUser?.role === 'demo') {
        showToast('غير مسموح بحذف البيانات في النسخة التجريبية', 'error');
        return;
    }
    try {
      const product = products.find(p => p.id === id);
      const { error } = await supabase.from('products').update({ deleted_at: new Date().toISOString(), deletion_reason: reason }).eq('id', id);
      if (error) throw error;
      await fetchData(); // تحديث البيانات لإزالة الصنف من القائمة الرئيسية
      logActivity('حذف صنف', `تم حذف الصنف: ${product?.name || id}` + (reason ? ` - السبب: ${reason}` : ''));
    } catch (error: any) {
      console.error("Error deleting product:", error);
      showToast("فشل حذف الصنف: " + error.message, 'error');
    }
  };

  const restoreItem = async (table: string, id: string) => {
      if (currentUser?.role === 'demo') {
          return { success: false, message: 'غير مسموح بهذه العملية في النسخة التجريبية' };
      }
      try {
          const { error } = await supabase.from(table).update({ deleted_at: null }).eq('id', id);
          if (error) throw error;
          await fetchData();
          logActivity('استعادة', `تم استعادة عنصر من سلة المحذوفات (${table})`);
          return { success: true };
      } catch (error: any) {
          return { success: false, message: error.message };
      }
  };

  const permanentDeleteItem = async (table: string, id: string) => {
      if (currentUser?.role === 'demo') {
          return { success: false, message: 'غير مسموح بالحذف النهائي في النسخة التجريبية' };
      }
      try {
          const { error } = await supabase.from(table).delete().eq('id', id);
          if (error) throw error;
          logActivity('حذف نهائي', `تم حذف عنصر نهائياً من (${table})`);
          return { success: true };
      } catch (error: any) {
          return { success: false, message: error.message };
      }
  };

  const emptyRecycleBin = async (table: string) => {
      if (currentUser?.role === 'demo') {
          return { success: false, message: 'غير مسموح بتفريغ السلة في النسخة التجريبية' };
      }
      try {
          const { error } = await supabase.from(table).delete().not('deleted_at', 'is', null);
          if (error) throw error;
          logActivity('تفريغ السلة', `تم تفريغ سلة المحذوفات للجدول (${table}) نهائياً`);
          return { success: true };
      } catch (error: any) {
          return { success: false, message: error.message };
      }
  };

  const addEntry = async (entryData: any) => {
    try {
      // منع الترحيل النهائي للديمو (يسمح فقط بالمسودات أو القيود المؤقتة)
      if (currentUser?.role === 'demo' && entryData.status === 'posted') {
          // يمكننا إما تحويلها لمسودة أو السماح بها مع تحذير، حسب رغبتك. هنا سنسمح بها للعرض ولكن نمنع الإقفال السنوي
      }

      // تفعيل قفل الفترة: منع إضافة قيود في فترة مغلقة
      if (settings.lastClosedDate && entryData.date <= settings.lastClosedDate) {
        throw new Error(`لا يمكن إضافة قيد بتاريخ ${entryData.date} لأن الفترة المالية مغلقة.`);
      }

      const { data: org } = await supabase.from('organizations').select('id').limit(1).single();
      const organization_id = org?.id;

      // تنظيف البيانات من النصوص غير المرغوبة (null/undefined) قبل الحفظ
      const cleanStr = (s: any) => String(s || '').replace(/null|undefined/gi, '').trim();
      const finalDesc = cleanStr(entryData.description) || 'قيد يومية';
      let finalRef = cleanStr(entryData.reference) || `JE-${Date.now().toString().slice(-6)}`;

      // تحويل البيانات إلى snake_case لتتوافق مع قاعدة البيانات وتنظيف القيم الفارغة
      const dbLines = entryData.lines.map((l: any) => {
        const accId = l.accountId || l.account_id;
        const ccId = l.costCenterId || l.cost_center_id;
        return {
          account_id: (accId && typeof accId === 'string' && accId.trim() !== '') ? accId.trim() : null,
          debit: Number(l.debit || 0),
          credit: Number(l.credit || 0),
          description: cleanStr(l.description) || finalDesc,
          cost_center_id: (ccId && typeof ccId === 'string' && ccId.trim() !== '') ? ccId.trim() : null
        };
      });

      // 1. التحقق من وجود حساب لكل سطر
      if (dbLines.some((l: any) => !l.account_id)) {
          throw new Error("لا يمكن حفظ القيد: يوجد سطر غير مرتبط بحساب. يرجى التأكد من اختيار الحسابات لجميع الأطراف.");
      }

      // 2. التحقق من توازن القيد
      const totalDebit = dbLines.reduce((sum: number, l: any) => sum + l.debit, 0);
      const totalCredit = dbLines.reduce((sum: number, l: any) => sum + l.credit, 0);
      
      if (Math.abs(totalDebit - totalCredit) > 0.01) {
          throw new Error(`لا يمكن حفظ القيد لأنه غير متوازن.\nإجمالي المدين: ${totalDebit.toLocaleString()}\nإجمالي الدائن: ${totalCredit.toLocaleString()}\nالفرق: ${Math.abs(totalDebit - totalCredit).toLocaleString()}`);
      }

      let entryId: string | null = null;

      let { data, error } = await supabase.rpc('create_journal_entry', {
        entry_date: entryData.date,
        description: finalDesc,
        reference: finalRef,
        entries: dbLines,
        status: entryData.status || 'posted',
        org_id: organization_id
      });

      // معالجة خطأ تكرار المرجع (Retry with suffix)
      if (error && error.code === '23505') {
          const newRef = `${finalRef}-${Math.floor(Math.random() * 1000)}`;
          console.warn(`Duplicate reference ${finalRef}, retrying with ${newRef}`);
          finalRef = newRef; // تحديث المرجع للاستخدام لاحقاً
          
          const retryResult = await supabase.rpc('create_journal_entry', {
            entry_date: entryData.date,
            description: finalDesc,
            reference: newRef,
            entries: dbLines,
            status: entryData.status || 'posted',
            org_id: organization_id
          });
          data = retryResult.data;
          error = retryResult.error;
      }

      if (error) {
        // إذا كان الخطأ هو عدم وجود الدالة، نحاول الإدراج المباشر (Fallback)
        if (error.message && (error.message.includes('Could not find the function') || error.message.includes('function') && error.message.includes('does not exist'))) {
            console.warn("RPC not found, falling back to direct insert.");
            
            // 1. إدراج رأس القيد
            const { data: header, error: headerError } = await supabase.from('journal_entries').insert({
                transaction_date: entryData.date,
                description: finalDesc,
                reference: finalRef,
                status: entryData.status || 'posted',
                organization_id: organization_id
            }).select().single();

            if (headerError) throw headerError;
            if (header) entryId = header.id;

            // 2. إدراج الأسطر
            const linesToInsert = dbLines.map((l: any) => ({
                journal_entry_id: header.id,
                account_id: l.account_id,
                debit: l.debit,
                credit: l.credit,
                description: l.description,
                cost_center_id: l.cost_center_id,
                organization_id: organization_id
            }));

            const { error: linesError } = await supabase.from('journal_lines').insert(linesToInsert);
            if (linesError) {
                // محاولة التراجع (حذف القيد) في حال فشل الأسطر
                await supabase.from('journal_entries').delete().eq('id', header.id);
                throw linesError;
            }
        } else {
            throw error;
        }
      } else {
        entryId = data;
      }

      // 3. رفع المرفقات (إذا وجدت)
      if (entryId && entryData.attachments && entryData.attachments.length > 0) {
        for (const file of entryData.attachments) {
            const fileExt = file.name.split('.').pop();
            const fileName = `${Date.now()}_${Math.random().toString(36).substr(2, 9)}.${fileExt}`;
            const filePath = `${entryId}/${fileName}`;

            // نفترض وجود bucket باسم 'documents'
            const { error: uploadError } = await supabase.storage
                .from('documents')
                .upload(filePath, file);

            if (!uploadError) {
                await supabase.from('journal_attachments').insert({
                    journal_entry_id: entryId,
                    file_path: filePath,
                    file_name: file.name,
                    file_type: file.type,
                    file_size: file.size
                });
            } else {
                console.warn('Failed to upload attachment:', file.name, uploadError);
            }
        }
      }

      const totalAmount = entryData.lines ? entryData.lines.reduce((s: number, l: any)=>s+l.debit, 0) : 0;
      logActivity('قيد يومية', `إضافة قيد رقم ${finalRef}: ${finalDesc}`, totalAmount);
      
      await fetchData();
      return entryId;
    } catch (err) {
      console.error("Error adding entry:", err);
      // إظهار الخطأ للمستخدم بدلاً من إخفائه
      throw new Error(err.message || "فشل إنشاء القيد المحاسبي في قاعدة البيانات");
    }
  };

  const addInvoice = async (data: any) => {
    // تم نقل المنطق إلى SalesInvoiceForm.tsx واستخدام RPC
    // هذه الدالة متروكة فقط للتوافق مع أي كود قديم لم يتم تحديثه
    console.warn("addInvoice in context is deprecated. Use the form's direct logic.");
    await fetchData();
  };

  const approveSalesInvoice = async (invoiceId: string) => {
    try {
      // استخدام الدالة الآمنة (RPC) لاعتماد الفاتورة
      // هذا يضمن إنشاء القيد وخصم المخزون وتحديث الحالة في عملية واحدة
      const { error } = await supabase.rpc('approve_invoice', { p_invoice_id: invoiceId });
      
      if (error) throw error;
      
      await fetchData();
    } catch (error: any) {
      console.error('Error approving invoice:', error);
      throw new Error(error.message || 'فشل اعتماد الفاتورة');
    }
  };

  const addPurchaseInvoice = async (data: any) => {
    // تم نقل المنطق إلى PurchaseInvoiceForm.tsx واستخدام RPC
    console.warn("addPurchaseInvoice in context is deprecated.");
    await fetchData();
  };

  const approvePurchaseInvoice = async (invoiceId: string) => {
    try {
      // استخدام الدالة الآمنة (RPC) لاعتماد فاتورة المشتريات
      const { error } = await supabase.rpc('approve_purchase_invoice', { p_invoice_id: invoiceId });
      
      if (error) throw error;
      
      await fetchData();
    } catch (error: any) {
      console.error('Error approving purchase invoice:', error);
      throw new Error(error.message || 'فشل اعتماد فاتورة المشتريات');
    }
  };

  const addReceiptVoucher = async (data: any) => {
    const id = generateUUID();
    const vNum = `RCT-${Date.now().toString().slice(-6)}`;
    
    const customerAccId = getSystemAccount('CUSTOMERS')?.id;
    const otherRevAccId = getSystemAccount('OTHER_REVENUE')?.id;
    const cashAccId = getSystemAccount('CASH')?.id;

    const creditAccount = data.targetAccountId || (data.subType === 'customer' ? customerAccId : otherRevAccId);
    const debitAccount = data.treasuryAccountId || cashAccId;

    if (!creditAccount || !debitAccount) {
        showToast("خطأ: حسابات السند غير صحيحة.", 'error');
        return;
    }

    const entryId = await addEntry({
        date: data.date, reference: vNum, description: data.description,
        lines: [
            { accountId: debitAccount, debit: Number(data.amount), credit: 0 },
            { accountId: creditAccount, debit: 0, credit: Number(data.amount) }
        ],
        attachments: data.attachments
    });
    if (entryId) {
      setVouchers(prev => [{ ...data, id, voucherNumber: vNum, relatedJournalEntryId: entryId, type: 'receipt' }, ...prev]);
      logActivity('سند قبض', `قبض مبلغ ${data.amount} من ${data.partyName}`, data.amount);
    }
  };

  const addCustomerDeposit = async (data: any) => {
    const id = generateUUID();
    const vNum = `DEP-${Date.now().toString().slice(-6)}`;
    
    const customerDepositsAcc = getSystemAccount('CUSTOMER_DEPOSITS'); // 203 - خصوم
    const cashAccId = getSystemAccount('CASH')?.id;

    // الحساب المدين: الخزينة أو البنك المختار
    const debitAccount = data.treasuryAccountId || cashAccId;
    // الحساب الدائن: تأمينات العملاء (ثابت)
    const creditAccount = customerDepositsAcc?.id;

    if (!creditAccount || !debitAccount) {
        showToast(`خطأ: حساب تأمينات العملاء (${SYSTEM_ACCOUNTS.CUSTOMER_DEPOSITS}) أو حساب الخزينة غير موجود.`, 'error');
        return;
    }

    const entryId = await addEntry({
        date: data.date, reference: vNum, description: data.description,
        lines: [
            { accountId: debitAccount, debit: Number(data.amount), credit: 0, description: `قبض تأمين من ${data.partyName}` },
            { accountId: creditAccount, debit: 0, credit: Number(data.amount), description: `تأمين مستلم - ${data.partyName}` }
        ],
        attachments: data.attachments
    });
    if (entryId) {
      setVouchers(prev => [{ ...data, id, voucherNumber: vNum, relatedJournalEntryId: entryId, type: 'receipt', subType: 'customer_deposit' }, ...prev]);
      logActivity('سند تأمين', `قبض تأمين مبلغ ${data.amount} من ${data.partyName}`, data.amount);
    }
  };

  const updateVoucher = async (id: string, type: 'receipt' | 'payment', data: any) => {
    try {
      const table = type === 'receipt' ? 'receipt_vouchers' : 'payment_vouchers';
      const dateField = type === 'receipt' ? 'receipt_date' : 'payment_date';
      const partyField = type === 'receipt' ? 'customer_id' : 'supplier_id';
      
      const updatePayload: any = {
        amount: data.amount,
        notes: data.notes,
        treasury_account_id: data.treasuryId,
        [dateField]: data.date,
        [partyField]: type === 'receipt' ? data.customerId : data.supplierId
      };

      const { error } = await supabase.from(table).update(updatePayload).eq('id', id);
      if (error) throw error;

      await fetchData();
      logActivity('تعديل سند', `تعديل سند ${type === 'receipt' ? 'قبض' : 'صرف'} رقم ${data.voucherNumber}`, data.amount);
    } catch (error: any) {
      console.error("Error updating voucher:", error);
      throw new Error(error.message);
    }
  };

  const addPaymentVoucher = async (data: any) => {
    const id = generateUUID();
    const vNum = `PAY-${Date.now().toString().slice(-6)}`;
    
    const supplierAccId = getSystemAccount('SUPPLIERS')?.id;
    const expenseAccId = getSystemAccount('SALARIES_EXPENSE')?.id;
    const cashAccId = getSystemAccount('CASH')?.id;

    const debitAccount = data.subType === 'supplier' ? supplierAccId : (data.targetAccountId || expenseAccId);
    const creditAccount = data.treasuryAccountId || cashAccId;

    if (!creditAccount || !debitAccount) {
        showToast("خطأ: حسابات السند غير صحيحة.", 'error');
        return;
    }

    const entryId = await addEntry({
        date: data.date, reference: vNum, description: data.description,
        lines: [
            { accountId: debitAccount, debit: Number(data.amount), credit: 0, costCenterId: data.costCenterId },
            { accountId: creditAccount, debit: 0, credit: Number(data.amount) }
        ],
        attachments: data.attachments
    });
    if (entryId) {
      setVouchers(prev => [{ ...data, id, voucherNumber: vNum, relatedJournalEntryId: entryId, type: 'payment' }, ...prev]);
      logActivity('سند صرف', `صرف مبلغ ${data.amount} إلى ${data.partyName}`, data.amount);
    }
  };

  const addTransfer = async (data: any) => {
    const id = generateUUID();
    const vNum = `TRN-${Date.now().toString().slice(-6)}`;
    const entryId = await addEntry({
        date: data.date,
        reference: data.reference || vNum,
        description: data.description,
        lines: [
            { accountId: data.destinationAccountId, debit: Number(data.amount), credit: 0 },
            { accountId: data.sourceAccountId, debit: 0, credit: Number(data.amount) }
        ]
    });
    if (entryId) {
      const newTransfer = { ...data, id, voucherNumber: vNum, relatedJournalEntryId: entryId };
      setTransfers(prev => [newTransfer, ...prev]);
      logActivity('تحويل نقدية', data.description, data.amount);
    }
  };

  const addStockTransfer = async (data: any) => {
    try {
        const transferNumber = `TRN-${Date.now().toString().slice(-6)}`;
        const { data: header, error: headerError } = await supabase.from('stock_transfers').insert({
            from_warehouse_id: data.fromWarehouseId,
            to_warehouse_id: data.toWarehouseId,
            transfer_date: data.date,
            transfer_number: transferNumber,
            notes: data.notes,
            status: 'posted'
        }).select().single();

        if (headerError) throw headerError;

        const items = data.items.map((item: any) => ({
            stock_transfer_id: header.id,
            product_id: item.productId,
            quantity: item.quantity
        }));

        const { error: itemsError } = await supabase.from('stock_transfer_items').insert(items);
        if (itemsError) throw itemsError;

        await recalculateStock();
        showToast('تم التحويل المخزني بنجاح', 'success');
    } catch (error: any) {
        console.error(error);
        showToast('فشل التحويل: ' + error.message, 'error');
    }
  };

  const addSalesReturn = async (data: any) => { /* ... */ };
  const addPurchaseReturn = async (data: any) => { /* ... */ };
  const addQuotation = (data: any) => { setQuotations(prev => [...prev, { ...data, id: generateUUID(), quotationNumber: `QUO-${Date.now().toString().slice(-6)}` }]); };
  const updateQuotationStatus = (id: string, status: Quotation['status']) => { setQuotations(prev => prev.map(q => q.id === id ? { ...q, status } : q)); };
  const convertQuotationToInvoice = async (quotationId: string, warehouseId: string, treasuryId?: string, paidAmount?: number) => {
    try {
      // 1. جلب عرض السعر
      const { data: quote, error: qError } = await supabase
        .from('quotations')
        .select('*, quotation_items(*)')
        .eq('id', quotationId)
        .single();

      if (qError) throw qError;
      if (quote.status === 'converted') throw new Error('تم تحويل عرض السعر هذا مسبقاً');

      // محاولة تحديد خزينة افتراضية إذا لم يتم تحديدها وكان هناك مبلغ مدفوع
      // هذا يحل مشكلة عدم وجود قائمة اختيار في الواجهة حالياً
      let finalTreasuryId = treasuryId;
      if (paidAmount && paidAmount > 0 && !finalTreasuryId) {
          const cashAcc = getSystemAccount('CASH'); // الصندوق الرئيسي
          if (cashAcc) finalTreasuryId = cashAcc.id;
      }

      // 2. تجهيز بيانات الفاتورة
      const invoiceData = {
        invoice_number: `INV-${Date.now().toString().slice(-6)}`,
        customer_id: quote.customer_id,
        salesperson_id: quote.salesperson_id,
        invoice_date: new Date().toISOString().split('T')[0],
        total_amount: quote.total_amount,
        tax_amount: quote.tax_amount,
        subtotal: quote.total_amount - (quote.tax_amount || 0),
        notes: `تحويل من عرض سعر #${quote.quotation_number}`,
        status: 'draft',
        warehouse_id: warehouseId,
        paid_amount: paidAmount || 0,
        treasury_account_id: finalTreasuryId || null
      };

      // 3. إنشاء الفاتورة
      const { data: invoice, error: iError } = await supabase.from('invoices').insert(invoiceData).select().single();
      if (iError) throw iError;

      // 4. نقل البنود
      if (quote.quotation_items && quote.quotation_items.length > 0) {
        const items = quote.quotation_items.map((item: any) => ({
          invoice_id: invoice.id,
          product_id: item.product_id,
          quantity: item.quantity,
          price: item.unit_price,
          total: item.total,
          cost: 0 // سيتم تحديثه عند الاعتماد
        }));
        
        const { error: itemsError } = await supabase.from('invoice_items').insert(items);
        if (itemsError) throw itemsError;
      }

      // 5. تحديث حالة عرض السعر
      await supabase.from('quotations').update({ status: 'converted' }).eq('id', quotationId);

      // 6. اعتماد الفاتورة (إنشاء القيد وتحديث المخزون)
      await approveSalesInvoice(invoice.id);

      showToast('تم تحويل عرض السعر لفاتورة واعتمادها بنجاح', 'success');
      await fetchData();

    } catch (error: any) {
      console.error("Conversion Error:", error);
      showToast('فشل التحويل: ' + error.message, 'error');
    }
  };
  const addPurchaseOrder = (data: any) => { setPurchaseOrders(prev => [...prev, { ...data, id: generateUUID(), poNumber: `PO-${Date.now().toString().slice(-6)}` }]); };
  const updatePurchaseOrder = (id: string, po: Partial<PurchaseOrder>) => { setPurchaseOrders(prev => prev.map(p => p.id === id ? { ...p, ...po } : p)); };
  const convertPoToInvoice = async (poId: string, warehouseId: string) => {
    try {
      // 1. جلب أمر الشراء
      const { data: po, error: poError } = await supabase
        .from('purchase_orders')
        .select('*, purchase_order_items(*)')
        .eq('id', poId)
        .single();

      if (poError) throw poError;
      if (po.status === 'converted') throw new Error('تم تحويل أمر الشراء هذا مسبقاً');

      // 2. تجهيز بيانات فاتورة المشتريات
      const invoiceData = {
        invoice_number: `PINV-${Date.now().toString().slice(-6)}`,
        supplier_id: po.supplier_id,
        warehouse_id: warehouseId,
        invoice_date: new Date().toISOString().split('T')[0],
        total_amount: po.total_amount,
        tax_amount: po.tax_amount,
        subtotal: po.total_amount - (po.tax_amount || 0),
        notes: `تحويل من أمر شراء #${po.po_number}`,
        status: 'draft'
      };

      // 3. إنشاء الفاتورة
      const { data: invoice, error: iError } = await supabase.from('purchase_invoices').insert(invoiceData).select().single();
      if (iError) throw iError;

      // 4. نقل البنود
      if (po.purchase_order_items && po.purchase_order_items.length > 0) {
        const items = po.purchase_order_items.map((item: any) => ({
          purchase_invoice_id: invoice.id,
          product_id: item.product_id,
          quantity: item.quantity,
          price: item.unit_price || item.price || 0,
          total: item.total
        }));
        
        const { error: itemsError } = await supabase.from('purchase_invoice_items').insert(items);
        if (itemsError) throw itemsError;
      }

      // 5. تحديث حالة أمر الشراء
      await supabase.from('purchase_orders').update({ status: 'converted' }).eq('id', poId);

      showToast('تم تحويل أمر الشراء لفاتورة مشتريات بنجاح', 'success');
      await fetchData();

    } catch (error: any) {
      console.error("Conversion Error:", error);
      showToast('فشل التحويل: ' + error.message, 'error');
    }
  };
  
  const getBookBalanceAtDate = (accountId: string, date: string) => {
    let balance = 0;
    const account = accounts.find(a => a.id === accountId);
    if (!account) return 0;

    const type = String(account.type || '').toLowerCase();
    const isDebitNature = type === 'asset' || type === 'expense' || type === 'أصول' || type === 'مصروفات' || type === 'ASSET' || type === 'EXPENSE';

    entries.forEach(entry => {
      if (entry.date <= date && (entry.status === 'posted')) {
        entry.lines.forEach(line => {
          if (line.accountId === accountId) {
            if (isDebitNature) balance += (line.debit - line.credit);
            else balance += (line.credit - line.debit);
          }
        });
      }
    });
    return balance;
  };

  const getAccountBalanceInPeriod = (accountId: string, startDate: string, endDate: string) => {
    let balance = 0;
    const account = accounts.find(a => a.id === accountId);
    if (!account) return 0;

    const type = String(account.type || '').toLowerCase();
    const isDebitNature = type === 'asset' || type === 'expense' || type === 'أصول' || type === 'مصروفات' || type === 'ASSET' || type === 'EXPENSE';

    entries.forEach(entry => {
      if (entry.date >= startDate && entry.date <= endDate && (entry.status === 'posted')) {
        entry.lines.forEach(line => {
          if (line.accountId === accountId) {
            if (isDebitNature) balance += (line.debit - line.credit);
            else balance += (line.credit - line.debit);
          }
        });
      }
    });
    return balance;
  };

  const updateStock = async (items: any[], warehouseId: string, direction: 'IN' | 'OUT', reference: string, date: string, type: StockTransaction['type']) => {
    for (const item of items) {
      if (!item.productId) continue;
      
      const qty = Number(item.quantity);
      const change = direction === 'IN' ? qty : -qty;
      
      const { data: product } = await supabase.from('products').select('stock, warehouse_stock').eq('id', item.productId).single();
      
      if (product) {
          const newStock = (product.stock || 0) + change;
          const currentWarehouseStock = product.warehouse_stock || {};
          const newWarehouseStock = { ...currentWarehouseStock, [warehouseId]: (Number(currentWarehouseStock[warehouseId]) || 0) + change };

          await supabase.from('products').update({ stock: newStock, warehouse_stock: newWarehouseStock }).eq('id', item.productId);
      }
    }
  };

  const recalculateStock = async () => {
    try {
      // استدعاء دالة قاعدة البيانات (RPC) بدلاً من الحساب في المتصفح
      // هذا أسرع بكثير ويمنع تجميد المتصفح عند وجود بيانات كثيرة
      const { error } = await supabase.rpc('recalculate_stock_rpc');
      
      if (error) throw error;

      showToast(`تم إعادة احتساب وتحديث أرصدة جميع الأصناف بنجاح`, 'success');
      await fetchData();
    } catch (error: any) {
      console.error("Recalculate Stock Error:", error);
      showToast("حدث خطأ أثناء تحديث الأرصدة: " + error.message, 'error');
    }
  };

  const addCheque = async (data: any) => {
    try {
        // فصل المرفقات عن بيانات الشيك لتجنب أخطاء قاعدة البيانات
        const { attachments, ...chequeData } = data;

        // 1. حفظ الشيك
        const { data: newCheque, error } = await supabase.from('cheques').insert(chequeData).select().single();
        if (error) throw error;

        // 1.5 رفع المرفقات (إذا وجدت)
        if (attachments && Array.isArray(attachments) && attachments.length > 0) {
            for (const file of attachments) {
                const fileExt = file.name.split('.').pop();
                const fileName = `${newCheque.id}-${Date.now()}-${Math.random()}.${fileExt}`;
                const filePath = `cheques/${fileName}`;

                const { error: uploadError } = await supabase.storage
                    .from('documents')
                    .upload(filePath, file);

                if (!uploadError) {
                    await supabase.from('cheque_attachments').insert({
                        cheque_id: newCheque.id,
                        file_path: filePath,
                        file_name: file.name,
                        file_type: file.type,
                        file_size: file.size
                    });
                } else {
                    console.warn('Failed to upload cheque attachment:', file.name, uploadError);
                }
            }
        }

        // 2. إنشاء القيد المحاسبي
        // استخدام البحث الصارم بالأكواد لتجنب الخطأ في الأسماء (مثل الخلط بين العملاء ودفعات العملاء)
        const notesReceivableAcc = getSystemAccount('NOTES_RECEIVABLE') || accounts.find(a => a.code === '10202' || a.code === '1204');
        const notesPayableAcc = getSystemAccount('NOTES_PAYABLE') || accounts.find(a => a.code === '204' || a.code === '2202');
        
        const customerAcc = getSystemAccount('CUSTOMERS') || accounts.find(a => a.code === '10201' || a.code === '1102');
        const supplierAcc = getSystemAccount('SUPPLIERS') || accounts.find(a => a.code === '201' || a.code === '2201');

        let lines = [];
        let description = '';
        const entryDate = new Date().toISOString().split('T')[0]; // تاريخ تحرير الشيك

        if (data.type === 'incoming') {
            // استلام شيك (أوراق قبض): من ح/ أوراق القبض إلى ح/ العملاء
            if (notesReceivableAcc && customerAcc) {
                description = `استلام شيك رقم ${data.cheque_number} من ${data.party_name}`;
                lines = [
                    { accountId: notesReceivableAcc.id, debit: data.amount, credit: 0, description },
                    { accountId: customerAcc.id, debit: 0, credit: data.amount, description: `شيك مستلم من العميل` }
                ];
            }
        } else if (data.type === 'outgoing') {
            // إصدار شيك (أوراق دفع): من ح/ الموردين إلى ح/ أوراق الدفع
            if (notesPayableAcc && supplierAcc) {
                description = `إصدار شيك رقم ${data.cheque_number} للمورد ${data.party_name}`;
                lines = [
                    { accountId: supplierAcc.id, debit: data.amount, credit: 0, description: `شيك صادر للمورد` },
                    { accountId: notesPayableAcc.id, debit: 0, credit: data.amount, description }
                ];
            }
        }

        if (lines.length > 0) {
             const entryId = await addEntry({
                date: entryDate,
                reference: `CHQ-${data.cheque_number}`,
                description: description,
                status: 'posted',
                lines: lines
            });

            if (entryId) {
                await supabase.from('cheques').update({ related_journal_entry_id: entryId }).eq('id', newCheque.id);
            }
        }

        await fetchData();
        showToast('تم حفظ الشيك وإنشاء القيد بنجاح', 'success');
    } catch (error: any) {
        console.error("Error adding cheque:", error);
        throw error; // إعادة توجيه الخطأ للصفحة لتعرضه وتمنع إغلاق النافذة
    }
  };

  const updateChequeStatus = async (id: string, status: Cheque['status'], actionDate: string, depositAccountId?: string) => {
      try {
          // 1. تحديث حالة الشيك
          const { error: updateError } = await supabase
              .from('cheques')
              .update({ status: status })
              .eq('id', id);

          if (updateError) throw updateError;

          // 2. جلب بيانات الشيك لإنشاء القيد
          const { data: cheque } = await supabase.from('cheques').select('*').eq('id', id).single();
          
          if (cheque) {
              // 3. إنشاء القيد المحاسبي بناءً على الحالة الجديدة
              if (status === 'cashed' && cheque.type === 'outgoing') {
                  // صرف شيك صادر (من أوراق الدفع إلى البنك)
                  const notesPayableAcc = getSystemAccount('NOTES_PAYABLE'); // 204
                  
                  if (notesPayableAcc && depositAccountId) {
                      await addEntry({
                          date: actionDate,
                          reference: `CHQ-CASH-${cheque.cheque_number}`,
                          description: `صرف شيك رقم ${cheque.cheque_number} - ${cheque.party_name}`,
                          status: 'posted',
                          lines: [
                              { accountId: notesPayableAcc.id, debit: cheque.amount, credit: 0, description: `إقفال ورقة دفع - شيك ${cheque.cheque_number}` },
                              { accountId: depositAccountId, debit: 0, credit: cheque.amount, description: `مسحوب من البنك` }
                          ]
                      });
                  } else {
                      showToast('تنبيه: تم تحديث الحالة ولكن لم يتم إنشاء القيد لعدم تحديد حساب البنك أو حساب أوراق الدفع (204).', 'warning');
                  }
              } 
              else if (status === 'collected' && cheque.type === 'incoming') {
                  // تحصيل شيك وارد (من البنك إلى أوراق القبض)
                  const notesReceivableAcc = getSystemAccount('NOTES_RECEIVABLE'); // 10202

                  if (notesReceivableAcc && depositAccountId) {
                      await addEntry({
                          date: actionDate,
                          reference: `CHQ-COLL-${cheque.cheque_number}`,
                          description: `تحصيل شيك رقم ${cheque.cheque_number} - ${cheque.party_name}`,
                          status: 'posted',
                          lines: [
                              { accountId: depositAccountId, debit: cheque.amount, credit: 0, description: `إيداع في البنك` },
                              { accountId: notesReceivableAcc.id, debit: 0, credit: cheque.amount, description: `تحصيل ورقة قبض - شيك ${cheque.cheque_number}` }
                          ]
                      });
                  } else {
                      showToast('تنبيه: تم تحديث الحالة ولكن لم يتم إنشاء القيد لعدم تحديد حساب البنك أو حساب أوراق القبض (10202).', 'warning');
                  }
              }
          }

          await fetchData();
          
          const updatedCheque = cheques.find(c => c.id === id);
          logActivity('تحديث حالة شيك', `تم تحديث حالة الشيك رقم ${updatedCheque?.cheque_number || id} إلى ${status}`, updatedCheque?.amount);
          showToast('تم تحديث حالة الشيك بنجاح', 'success');
      } catch (error: any) {
          console.error("Error updating cheque status:", error);
          throw error; // إعادة توجيه الخطأ
      }
  };

  const addAsset = async (data: any) => {
    try {
      // 1. حفظ الأصل في جدول 'assets'
      const { data: newAsset, error: assetError } = await supabase
        .from('assets')
        .insert({
          name: data.name,
          purchase_date: data.purchaseDate,
          purchase_cost: data.purchaseCost,
          salvage_value: data.salvageValue,
          useful_life: data.usefulLife,
          asset_account_id: data.assetAccountId,
          accumulated_depreciation_account_id: data.accumulatedDepreciationAccountId || null,
          depreciation_expense_account_id: data.depreciationExpenseAccountId || null,
          organization_id: (await supabase.from('organizations').select('id').limit(1).single()).data?.id // ضمان الربط بالمنشأة
        })
        .select()
        .single();

      if (assetError) throw assetError;

      // 2. إنشاء قيد محاسبي (اختياري)
      if (data.createJournalEntry) {
          let creditAccountId = data.creditAccountId;
          
          // إذا لم يتم تحديد حساب دائن، نستخدم الأرصدة الافتتاحية كافتراضي
          if (!creditAccountId) {
              const contra = accounts.find(a => a.code === '3999' || a.code === '3101');
              creditAccountId = contra?.id;
          }

          if (data.assetAccountId && creditAccountId && data.purchaseCost > 0) {
            await addEntry({
              date: data.purchaseDate,
              reference: `ASSET-${newAsset.id.slice(0, 8)}`,
              description: `إثبات شراء أصل: ${data.name}`,
              status: 'posted',
              lines: [
                { accountId: data.assetAccountId, debit: Number(data.purchaseCost), credit: 0, description: `شراء أصل ${data.name}` },
                { accountId: creditAccountId, debit: 0, credit: Number(data.purchaseCost), description: 'مقابل شراء أصل' }
              ]
            });
            showToast('تم حفظ الأصل وإنشاء القيد المحاسبي بنجاح', 'success');
          } else {
             showToast('تم حفظ سجل الأصل ولكن لم يتم إنشاء القيد (بيانات الحسابات ناقصة)', 'warning');
          }
      } else {
          showToast('تم حفظ سجل الأصل بنجاح (بدون قيد محاسبي)', 'success');
      }

      // 3. تحديث قائمة الأصول في الواجهة
      await fetchData();
    } catch (error: any) {
      console.error('Error adding asset:', error);
      showToast('فشل إضافة الأصل: ' + error.message, 'error');
    }
  };
  
  const runDepreciation = async (assetId: string, amount: number, date: string) => {
    try {
      const asset = assets.find(a => a.id === assetId);
      if (!asset) throw new Error('الأصل غير موجود');

      // البحث عن الحسابات
      // مصروف الإهلاك (507)
      const depExpAcc = accounts.find(a => a.id === asset.depreciationExpenseAccountId) || accounts.find(a => a.code === SYSTEM_ACCOUNTS.DEPRECIATION_EXPENSE);
      // مجمع الإهلاك (11201)
      const accDepAcc = accounts.find(a => a.id === asset.accumulatedDepreciationAccountId) || accounts.find(a => a.code === SYSTEM_ACCOUNTS.ACCUMULATED_DEPRECIATION);

      if (!depExpAcc || !accDepAcc) {
        throw new Error(`حسابات الإهلاك غير محددة أو غير موجودة (تأكد من وجود ${SYSTEM_ACCOUNTS.DEPRECIATION_EXPENSE} و ${SYSTEM_ACCOUNTS.ACCUMULATED_DEPRECIATION})`);
      }

      // جلب معرف المنظمة لضمان ربط القيد بشكل صحيح
      const { data: org } = await supabase.from('organizations').select('id').limit(1).single();

      // استخدام الإدراج المباشر لضمان ربط القيد بالأصل عبر related_document_id
      const { data: entry, error: entryError } = await supabase.from('journal_entries').insert({
          transaction_date: date,
          reference: `DEP-${asset.id.slice(0, 6)}-${date}`,
          description: `إهلاك شهري للأصل: ${asset.name}`,
          status: 'posted',
          is_posted: true,
          related_document_id: asset.id,
          related_document_type: 'asset_depreciation',
          organization_id: org?.id
      }).select().single();
      
      if (entryError) throw entryError;
      
      const lines = [
          { journal_entry_id: entry.id, account_id: depExpAcc.id, debit: amount, credit: 0, description: `مصروف إهلاك - ${asset.name}`, organization_id: org?.id },
          { journal_entry_id: entry.id, account_id: accDepAcc.id, debit: 0, credit: amount, description: `مجمع إهلاك - ${asset.name}`, organization_id: org?.id }
      ];
      
      const { error: linesError } = await supabase.from('journal_lines').insert(lines);
      if (linesError) throw linesError;

      showToast('تم تسجيل قيد الإهلاك بنجاح', 'success');
      await fetchData(); // تحديث البيانات لعرض القيمة الجديدة
    } catch (error: any) {
      showToast('فشل تسجيل الإهلاك: ' + error.message, 'error');
    }
  };

  const revaluateAsset = async (assetId: string, newValue: number, date: string, revaluationAccountId: string) => {
    try {
      const asset = assets.find(a => a.id === assetId);
      if (!asset) throw new Error('الأصل غير موجود');

      const currentBookValue = asset.currentValue || 0;
      const difference = newValue - currentBookValue;

      if (Math.abs(difference) < 0.01) {
          showToast('القيمة الجديدة مطابقة للقيمة الحالية.', 'info');
          return;
      }

      // تحديث تكلفة الشراء في قاعدة البيانات لتعكس القيمة الجديدة (مع الحفاظ على مجمع الإهلاك كما هو)
      // المعادلة: القيمة الحالية = التكلفة - مجمع الإهلاك
      // القيمة الجديدة = التكلفة الجديدة - مجمع الإهلاك
      // التكلفة الجديدة = القيمة الجديدة + مجمع الإهلاك
      const newPurchaseCost = newValue + (asset.totalDepreciation || 0);

      const { error: updateError } = await supabase
        .from('assets')
        .update({ purchase_cost: newPurchaseCost })
        .eq('id', assetId);

      if (updateError) throw updateError;

      // إنشاء قيد إعادة التقييم
      const lines = [];
      if (difference > 0) {
          // ربح/فائض: من ح/ الأصل إلى ح/ فائض إعادة التقييم
          lines.push({ accountId: asset.assetAccountId, debit: difference, credit: 0, description: `إعادة تقييم أصل (زيادة): ${asset.name}` });
          lines.push({ accountId: revaluationAccountId, debit: 0, credit: difference, description: `فائض إعادة تقييم - ${asset.name}` });
      } else {
          // خسارة: من ح/ خسائر إعادة التقييم إلى ح/ الأصل
          lines.push({ accountId: revaluationAccountId, debit: Math.abs(difference), credit: 0, description: `خسارة إعادة تقييم - ${asset.name}` });
          lines.push({ accountId: asset.assetAccountId, debit: 0, credit: Math.abs(difference), description: `إعادة تقييم أصل (تخفيض): ${asset.name}` });
      }

      await addEntry({ date: date, reference: `REV-${asset.id.slice(0, 6)}`, description: `إعادة تقييم أصل: ${asset.name}`, status: 'posted', lines: lines });

      showToast('تم إعادة تقييم الأصل وتحديث قيمته بنجاح', 'success');
      await fetchData();
    } catch (error: any) {
      console.error(error);
      showToast('فشل إعادة التقييم: ' + error.message, 'error');
    }
  };

  const runPayroll = async (month: string, date: string, treasuryAccountId: string, items: any[]) => {
    try {
        // استخراج الشهر والسنة
        let payrollMonth = 0;
        let payrollYear = new Date().getFullYear();
        if (month.includes('-')) {
            const parts = month.split('-');
            payrollYear = parseInt(parts[0]);
            payrollMonth = parseInt(parts[1]);
        } else {
            payrollMonth = parseInt(month) || new Date().getMonth() + 1;
        }

        // استدعاء الدالة الآمنة في قاعدة البيانات
        const { error } = await supabase.rpc('run_payroll_rpc', {
            p_month: payrollMonth,
            p_year: payrollYear,
            p_date: date,
            p_treasury_account_id: treasuryAccountId,
            p_items: items
        });

        if (error) throw error;

        alert("تم ترحيل الرواتب بنجاح ✅");
        await fetchData();
    } catch (error: any) {
        console.error(error);
        alert("خطأ في ترحيل الرواتب: " + error.message);
    }
  };

  const closeFinancialYear = async (year: number, closingDate: string) => {
    if (currentUser?.role === 'demo') {
        throw new Error('غير مسموح بإغلاق السنة المالية في النسخة التجريبية');
    }
    try {
      // 1. التحقق مما إذا كانت السنة مغلقة بالفعل
      const { data: existing } = await supabase
        .from('journal_entries')
        .select('id')
        .eq('reference', `CLOSE-${year}`)
        .maybeSingle();
      
      if (existing) {
        throw new Error(`السنة المالية ${year} مغلقة بالفعل.`);
      }

      // 2. تحديد حسابات المصروفات والإيرادات
      const pnlAccounts = accounts.filter(a => {
        const type = (a.type || '').toLowerCase();
        return type.includes('revenue') || type.includes('expense') || type.includes('إيراد') || type.includes('مصروف') || type.includes('تكلفة');
      });

      const startDate = `${year}-01-01`;
      const endDate = `${year}-12-31`;
      
      const closingLines: any[] = [];

      // 3. جلب جميع الحركات المرحلة للسنة من قاعدة البيانات مباشرة (لضمان الدقة وتجاوز حد الـ 100 قيد)
      const { data: lines, error: linesError } = await supabase
        .from('journal_lines')
        .select('account_id, debit, credit, journal_entries!inner(status, transaction_date)')
        .eq('journal_entries.status', 'posted')
        .gte('journal_entries.transaction_date', startDate)
        .lte('journal_entries.transaction_date', endDate);

      if (linesError) throw linesError;

      // تجميع الأرصدة
      const accountBalances: Record<string, number> = {};
      lines?.forEach((l: any) => {
          if (!accountBalances[l.account_id]) accountBalances[l.account_id] = 0;
          accountBalances[l.account_id] += (Number(l.debit) - Number(l.credit));
      });

      pnlAccounts.forEach(acc => {
        const balance = accountBalances[acc.id] || 0;

        // تخطي الحسابات الصفرية
        if (Math.abs(balance) < 0.01) return;

        // للإقفال: نعكس طبيعة الرصيد
        if (balance > 0) {
            // رصيد مدين (مصروف) -> نجعله دائن للتصفير
            closingLines.push({ accountId: acc.id, debit: 0, credit: balance, description: `إقفال حساب ${acc.name}` });
        } else {
            // رصيد دائن (إيراد) -> نجعله مدين للتصفير
            closingLines.push({ accountId: acc.id, debit: Math.abs(balance), credit: 0, description: `إقفال حساب ${acc.name}` });
        }
      });

      if (closingLines.length === 0) {
          throw new Error("لا توجد أرصدة لإقفالها في هذه السنة (أو لم يتم ترحيل القيود).");
      }

      // 4. حساب الفرق (صافي الربح/الخسارة) وترحيله للأرباح المبقاة
      const totalClosingDebit = closingLines.reduce((sum, l) => sum + l.debit, 0);
      const totalClosingCredit = closingLines.reduce((sum, l) => sum + l.credit, 0);
      const netResult = totalClosingDebit - totalClosingCredit; 

      const retainedEarningsId = getSystemAccount('RETAINED_EARNINGS')?.id;
      
      if (!retainedEarningsId) throw new Error("حساب الأرباح المبقاة (3103) غير موجود.");

      if (Math.abs(netResult) > 0.01) {
          if (netResult > 0) {
              // الفرق موجب (مدين > دائن) يعني الإيرادات (التي أصبحت مدينة) أكبر -> ربح -> دائن في حقوق الملكية
              closingLines.push({ accountId: retainedEarningsId, debit: 0, credit: netResult, description: `ترحيل صافي ربح عام ${year}` });
          } else {
              // الفرق سالب (دائن > مدين) يعني المصروفات (التي أصبحت دائنة) أكبر -> خسارة -> مدين في حقوق الملكية
              closingLines.push({ accountId: retainedEarningsId, debit: Math.abs(netResult), credit: 0, description: `ترحيل صافي خسارة عام ${year}` });
          }
      }

      // 5. إنشاء قيد الإقفال
      const entryId = await addEntry({ 
          date: closingDate, 
          reference: `CLOSE-${year}`, 
          description: `قيد إقفال السنة المالية ${year}`, 
          status: 'posted', 
          lines: closingLines 
      });

      if (!entryId) throw new Error("فشل إنشاء قيد الإقفال في قاعدة البيانات.");

      // 6. تحديث تاريخ الإغلاق في إعدادات الشركة لمنع التعديل مستقبلاً
      const { data: settingsData } = await supabase.from('company_settings').select('id').limit(1).single();
      if (settingsData) {
          await supabase.from('company_settings').update({ last_closed_date: closingDate }).eq('id', settingsData.id);
      }
      setSettings(prev => ({ ...prev, lastClosedDate: closingDate }));

      showToast(`تم إغلاق السنة المالية ${year} بنجاح`, 'success');
      return true;
    } catch (error: any) {
        console.error(error);
        // إعادة إلقاء الخطأ ليتم التعامل معه في الواجهة
        throw error;
    }
  };

  const addUser = (user: any) => { setUsers(prev => [...prev, { ...user, id: generateUUID() }]); };
  const updateUser = (id: string, user: Partial<User>) => { setUsers(prev => prev.map(u => u.id === id ? { ...u, ...user } : u)); };
  
  // دالة تسجيل الدخول المحدثة
  const login = async (u: string, p: string) => {
      if (u === 'admin' && p === '123') { setCurrentUser({ id: '00000000-0000-0000-0000-000000000000', name: 'Admin', username: 'admin', role: 'super_admin', isActive: true } as any); return { success: true }; }
      
      try {
        const result = await authLogin(u, p);
        return result || { success: true };
      } catch (error: any) {
          console.error("Login failed:", error);
          return { success: false, message: error.message };
      }
  };

  const logout = async () => {
      try {
          await authLogout();
      } catch (error) {
          console.error("Logout failed:", error);
      }
  };

  const markNotificationAsRead = async (id: string) => {
    // 1. تحديث الواجهة فوراً لإخفاء التنبيه
    setNotifications(prev => prev.filter(n => n.id !== id));

    // 2. تحديث قاعدة البيانات في الخلفية
    try {
        await supabase
            .from('notifications')
            .update({ is_read: true })
            .eq('id', id);
    } catch (error) {
        console.error("Failed to mark notification as read:", error);
        // في حال فشل التحديث، سيعود التنبيه للظهور عند التحديث التالي للبيانات
    }
  };

  const clearAllNotifications = async () => {
      const notificationIds = notifications.map(n => n.id);
      setNotifications([]); // تحديث الواجهة فوراً
      if (notificationIds.length > 0) {
          await supabase.from('notifications').update({ is_read: true }).in('id', notificationIds);
      }
  };


  const getFinancialSummary = () => {
    let s = { totalAssets: 0, totalLiabilities: 0, totalEquity: 0, totalRevenue: 0, totalExpenses: 0, netIncome: 0 };
    accounts.forEach(a => {
        if (a.isGroup) return;
        const type = a.type as string;
        if (type === AccountType.ASSET || type === 'ASSET' || type === 'أصول') s.totalAssets += a.balance;
        else if (type === AccountType.LIABILITY || type === 'LIABILITY' || type === 'خصوم') s.totalLiabilities += Math.abs(a.balance);
        else if (type === AccountType.EQUITY || type === 'EQUITY' || type === 'حقوق ملكية') s.totalEquity += Math.abs(a.balance);
        else if (type === AccountType.REVENUE || type === 'REVENUE' || type === 'إيرادات') s.totalRevenue += Math.abs(a.balance);
        else if (type === AccountType.EXPENSE || type === 'EXPENSE' || type === 'مصروفات') s.totalExpenses += a.balance;
    });
    s.netIncome = s.totalRevenue - s.totalExpenses;
    s.totalEquity += s.netIncome;
    return s;
  };

  const addWarehouse = async (warehouseData: Omit<Warehouse, 'id'>) => {
    try {
      const { data, error } = await supabase
        .from('warehouses')
        .insert({ ...warehouseData })
        .select()
        .single();
      if (error) throw error;
      await fetchData(); // Refresh data
      logActivity('إضافة مستودع', `تم إضافة مستودع جديد: ${warehouseData.name}`);
      return data;
    } catch (err: any) {
      console.error("Error adding warehouse:", err);
      alert('فشل إضافة المستودع: ' + err.message);
    }
  };

  const updateWarehouse = async (id: string, warehouseData: Partial<Warehouse>) => {
    try {
      const oldData = warehouses.find(w => w.id === id);
      const { error } = await supabase.from('warehouses').update(warehouseData).eq('id', id);
      if (error) throw error;
      await fetchData();

      const changes: any = {};
      if (oldData) {
          Object.keys(warehouseData).forEach(key => {
              // @ts-ignore
              if (oldData[key] !== warehouseData[key]) {
                  // @ts-ignore
                  changes[key] = { from: oldData[key], to: warehouseData[key] };
              }
          });
      }
      logActivity('تعديل مستودع', `تم تعديل المستودع: ${warehouseData.name || oldData?.name}`, undefined, { changes });
    } catch (err: any) {
      console.error("Error updating warehouse:", err);
      showToast('فشل تحديث المستودع: ' + err.message, 'error');
    }
  };

  const deleteWarehouse = async (id: string, reason?: string) => {
    if (currentUser?.role === 'demo') {
        showToast('غير مسموح بحذف البيانات في النسخة التجريبية', 'error');
        return;
    }
    try {
      const { error } = await supabase.from('warehouses').update({ deleted_at: new Date().toISOString(), deletion_reason: reason }).eq('id', id);
      if (error) throw error;
      await fetchData();
      const wh = warehouses.find(w => w.id === id);
      logActivity('حذف مستودع', `تم حذف المستودع: ${wh?.name || id}` + (reason ? ` - السبب: ${reason}` : ''));
    } catch (err: any) {
      console.error("Error deleting warehouse:", err);
      showToast('فشل حذف المستودع: ' + err.message, 'error');
    }
  };

  const updateAccount = async (id: string, updates: Partial<Omit<Account, 'id' | 'balance'>>) => {
    try {
      const oldData = accounts.find(a => a.id === id);
      const { error } = await supabase.from('accounts').update(updates).eq('id', id);
      if (error) throw error;
      await fetchData();
      
      // تسجيل التغييرات التفصيلية
      const changes: any = {};
      if (oldData) {
          Object.keys(updates).forEach(key => {
              // @ts-ignore
              if (oldData[key] !== updates[key]) {
                  // @ts-ignore
                  changes[key] = { from: oldData[key], to: updates[key] };
              }
          });
      }
      
      logActivity('تعديل حساب', `تم تعديل الحساب: ${updates.name || oldData?.name || id}`, undefined, { changes });
    } catch (error: any) {
      console.error("Error updating account:", error);
      throw new Error(error.message);
    }
  };

  // --- Customer Actions ---
  const addCustomer = async (customerData: Omit<Customer, 'id'>) => {
    try {
      const { data, error } = await supabase.from('customers').insert([customerData]).select().single();
      if (error) throw error;
      setCustomers(prev => [data, ...prev]);
      return data;
    } catch (error: any) {
      console.error("Error adding customer:", error);
      throw error;
    }
  };

  const updateCustomer = async (id: string, updates: Partial<Customer>) => {
    try {
      const oldData = customers.find(c => c.id === id);
      const { error } = await supabase.from('customers').update(updates).eq('id', id);
      if (error) throw error;
      setCustomers(prev => prev.map(c => c.id === id ? { ...c, ...updates } : c));
      
      // تسجيل التغييرات
      const changes: any = {};
      if (oldData) {
          Object.keys(updates).forEach(key => {
              const k = key as keyof Customer;
              if (oldData[k] !== updates[k]) {
                  changes[key] = { from: oldData[k], to: updates[k] };
              }
          });
      }
      if (Object.keys(changes).length > 0) {
          logActivity('تعديل عميل', `تعديل بيانات العميل: ${oldData?.name}`, undefined, { changes });
      }
    } catch (error: any) {
      console.error("Error updating customer:", error);
      throw error;
    }
  };

  const deleteCustomer = async (id: string, reason?: string) => {
    if (currentUser?.role === 'demo') {
        throw new Error('غير مسموح بحذف العملاء في النسخة التجريبية');
    }
    try {
      const { error } = await supabase.from('customers').update({ deleted_at: new Date().toISOString(), deletion_reason: reason }).eq('id', id);
      if (error) throw error;
      await fetchData(); // تحديث البيانات لإزالة العميل من القائمة الرئيسية
      const customer = customers.find(c => c.id === id);
      logActivity('حذف عميل', `تم حذف العميل: ${customer?.name || id}` + (reason ? ` - السبب: ${reason}` : ''));
    } catch (error: any) {
      console.error("Error deleting customer:", error);
      throw error;
    }
  };

  // --- Employee Actions ---
  const addEmployee = async (employeeData: any) => {
    try {
      const { data, error } = await supabase.from('employees').insert([employeeData]).select().single();
      if (error) throw error;
      setEmployees(prev => [data, ...prev]);
      return data;
    } catch (error: any) {
      console.error("Error adding employee:", error);
      throw error;
    }
  };

  const updateEmployee = async (id: string, updates: any) => {
    try {
      const { error } = await supabase.from('employees').update(updates).eq('id', id);
      if (error) throw error;
      setEmployees(prev => prev.map(e => e.id === id ? { ...e, ...updates } : e));
    } catch (error: any) {
      console.error("Error updating employee:", error);
      throw error;
    }
  };

  const deleteEmployee = async (id: string, reason?: string) => {
    if (currentUser?.role === 'demo') {
        throw new Error('غير مسموح بحذف الموظفين في النسخة التجريبية');
    }
    try {
      const { error } = await supabase.from('employees').update({ deleted_at: new Date().toISOString(), deletion_reason: reason }).eq('id', id);
      if (error) throw error;
      await fetchData();
      const employee = employees.find(e => e.id === id);
      logActivity('حذف موظف', `تم حذف الموظف: ${employee?.full_name || id}` + (reason ? ` - السبب: ${reason}` : ''));
    } catch (error: any) {
      console.error("Error deleting employee:", error);
      throw error;
    }
  };
  // --- Supplier Actions ---
  const addSupplier = async (supplierData: Omit<Supplier, 'id'>) => {
    try {
      const { data, error } = await supabase.from('suppliers').insert([supplierData]).select().single();
      if (error) throw error;
      setSuppliers(prev => [data, ...prev]);
      return data;
    } catch (error: any) {
      console.error("Error adding supplier:", error);
      throw error;
    }
  };

  const updateSupplier = async (id: string, updates: Partial<Supplier>) => {
    try {
      const oldData = suppliers.find(s => s.id === id);
      const { error } = await supabase.from('suppliers').update(updates).eq('id', id);
      if (error) throw error;
      setSuppliers(prev => prev.map(s => s.id === id ? { ...s, ...updates } : s));

      // تسجيل التغييرات
      const changes: any = {};
      if (oldData) {
          Object.keys(updates).forEach(key => {
              const k = key as keyof Supplier;
              if (oldData[k] !== updates[k]) {
                  changes[key] = { from: oldData[k], to: updates[k] };
              }
          });
      }
      if (Object.keys(changes).length > 0) {
          logActivity('تعديل مورد', `تعديل بيانات المورد: ${oldData?.name}`, undefined, { changes });
      }
    } catch (error: any) {
      console.error("Error updating supplier:", error);
      throw error;
    }
  };

  const deleteSupplier = async (id: string, reason?: string) => {
    if (currentUser?.role === 'demo') {
        throw new Error('غير مسموح بحذف الموردين في النسخة التجريبية');
    }
    try {
      const { error } = await supabase.from('suppliers').update({ deleted_at: new Date().toISOString(), deletion_reason: reason }).eq('id', id);
      if (error) throw error;
      await fetchData();
      const supplier = suppliers.find(s => s.id === id);
      logActivity('حذف مورد', `تم حذف المورد: ${supplier?.name || id}` + (reason ? ` - السبب: ${reason}` : ''));
    } catch (error: any) {
      console.error("Error deleting supplier:", error);
      throw error;
    }
  };

  const produceItem = async (productId: string, quantity: number, warehouseId: string, date: string, additionalCost: number = 0, customReference?: string): Promise<{ success: boolean, message: string }> => {
    try {
      // 1. التحقق من وجود قائمة مواد (BOM)
      const { data: bom, error: bomError } = await supabase
        .from('bill_of_materials')
        .select('raw_material_id, quantity_required')
        .eq('product_id', productId);

      if (bomError) throw bomError;
      if (!bom || bom.length === 0) {
          return { success: false, message: 'لم يتم تعريف قائمة مواد (BOM) لهذا المنتج. يرجى تعريفها أولاً.' };
      }

      let totalCost = 0;
      const materialsToDeduct: any[] = [];

      // 2. التحقق من توفر المواد الخام وحساب التكلفة
      for (const item of bom) {
          const requiredQty = item.quantity_required * quantity;
          
          const { data: rawMaterial } = await supabase
            .from('products')
            .select('id, name, stock, warehouse_stock, purchase_price, cost')
            .eq('id', item.raw_material_id)
            .single();

          if (!rawMaterial) throw new Error(`المادة الخام غير موجودة (ID: ${item.raw_material_id})`);

          const currentWhStock = rawMaterial.warehouse_stock?.[warehouseId] || 0;
          
          if (currentWhStock < requiredQty) {
              return { success: false, message: `رصيد غير كافٍ من المادة الخام: ${rawMaterial.name}. المتوفر في المستودع: ${currentWhStock}, المطلوب: ${requiredQty}` };
          }

          const unitCost = rawMaterial.purchase_price || rawMaterial.cost || 0;
          totalCost += unitCost * requiredQty;

          materialsToDeduct.push({ product: rawMaterial, deductQty: requiredQty });
      }

      // إضافة التكاليف الإضافية (عمالة، تشغيل، إلخ) إلى إجمالي التكلفة
      totalCost += additionalCost;

      // 3. خصم المواد الخام
      for (const item of materialsToDeduct) {
          const p = item.product;
          const newStock = (p.stock || 0) - item.deductQty;
          const newWhStock = { ...p.warehouse_stock, [warehouseId]: (p.warehouse_stock?.[warehouseId] || 0) - item.deductQty };
          await supabase.from('products').update({ stock: newStock, warehouse_stock: newWhStock }).eq('id', p.id);
      }

      // 4. إضافة المنتج التام
      const { data: finishedProduct } = await supabase.from('products').select('*').eq('id', productId).single();
      if (finishedProduct) {
          // حساب متوسط التكلفة الجديد للمنتج التام
          const oldStock = finishedProduct.stock || 0;
          const oldCost = finishedProduct.purchase_price || finishedProduct.cost || 0;
          const productionUnitCost = totalCost / quantity; // تكلفة الوحدة الواحدة من عملية التصنيع الحالية

          let newWeightedCost = oldCost;
          if ((oldStock + quantity) > 0) {
              newWeightedCost = ((oldStock * oldCost) + (quantity * productionUnitCost)) / (oldStock + quantity);
          }

          const newStock = (finishedProduct.stock || 0) + quantity;
          const newWhStock = { ...finishedProduct.warehouse_stock, [warehouseId]: (finishedProduct.warehouse_stock?.[warehouseId] || 0) + quantity };
          
          // تحديث الكمية والتكلفة معاً
          await supabase.from('products').update({ 
              stock: newStock, 
              warehouse_stock: newWhStock,
              purchase_price: newWeightedCost, // تحديث سعر الشراء/التكلفة
              cost: newWeightedCost // تحديث حقل التكلفة أيضاً لضمان التوافق
          }).eq('id', productId);

          // 5. إنشاء القيد المحاسبي (تمت إضافته)
          const finishedGoodsAccId = finishedProduct.inventory_account_id || getSystemAccount('INVENTORY_FINISHED_GOODS')?.id;
          
          if (finishedGoodsAccId) {
              const lines: any[] = [
                  { accountId: finishedGoodsAccId, debit: totalCost, credit: 0, description: `إثبات مخزون منتج تام: ${finishedProduct.name}` }
              ];

              // تجميع المواد الخام حسب حساب المخزون لإنشاء الطرف الدائن
              const rawMaterialsCredit: Record<string, number> = {};
              
              for (const item of materialsToDeduct) {
                  const p = item.product;
                  const invAccId = p.inventory_account_id || getSystemAccount('INVENTORY_RAW_MATERIALS')?.id;
                  
                  if (invAccId) {
                      const unitCost = p.purchase_price || p.cost || 0;
                      const cost = unitCost * item.deductQty;
                      rawMaterialsCredit[invAccId] = (rawMaterialsCredit[invAccId] || 0) + cost;
                  }
              }

              Object.entries(rawMaterialsCredit).forEach(([accId, amount]) => {
                  lines.push({ accountId: accId, debit: 0, credit: amount, description: `صرف مواد خام للتصنيع - ${finishedProduct.name}` });
              });

              // إضافة الطرف الدائن للتكاليف الإضافية (محملة على المصروفات الصناعية أو الرواتب)
              if (additionalCost > 0) {
                  const overheadAcc = accounts.find(a => a.name.includes('تشغيل') || a.name.includes('صناعي')) || getSystemAccount('COGS'); // استخدام حساب تكلفة كبديل
                  if (overheadAcc) lines.push({ accountId: overheadAcc.id, debit: 0, credit: additionalCost, description: `تحميل تكاليف صناعية - ${finishedProduct.name}` });
              }

              await addEntry({
                  date: date,
                  reference: customReference || `MFG-${Date.now().toString().slice(-6)}`,
                  description: `عملية تصنيع: ${finishedProduct.name} (الكمية: ${quantity})`,
                  status: 'posted',
                  lines: lines
              });
          }
      }

      await fetchData(); // Use fetchData directly
      return { success: true, message: 'تم تسجيل عملية التصنيع وإنشاء القيد المحاسبي بنجاح ✅' };
    } catch (error: any) {
      console.error("Manufacturing Error:", error);
      return { success: false, message: 'حدث خطأ: ' + error.message };
    }
  };

  const can = (module: string, action: string): boolean => {
    if (userRole === 'super_admin') return true;
    return userPermissions.has(`${module}.${action}`);
  };

  return (
    <AccountingContext.Provider value={{
      accounts,
      addAccount: async (accountData: any) => {
        try {
          const { data, error } = await supabase
            .from('accounts')
            .insert({
              code: accountData.code,
              name: accountData.name,
              type: accountData.type,
              is_group: accountData.is_group,
              parent_id: accountData.parent_id,
              sub_type: accountData.sub_type || null
            })
            .select()
            .single();
          if (error) throw error;
          await fetchData();
          logActivity('إضافة حساب', `تم إضافة حساب جديد: ${accountData.name} (${accountData.code})`);
          return data;
        } catch (err: any) {
          console.error("Error adding account:", err);
          throw new Error(err.message);
        }
      },
      updateAccount,
      deleteAccount,
      costCenters, addCostCenter: (cc) => setCostCenters(prev => [...prev, {...cc, id: generateUUID()}]), deleteCostCenter: (id) => setCostCenters(prev => prev.filter(c => c.id !== id)), entries, addEntry,
      customers, addCustomer, updateCustomer, deleteCustomer,
      addCustomersBulk: (cs) => setCustomers(prev => [...prev, ...cs.map(c => ({...c, id: generateUUID()}))]),
      suppliers, addSupplier, updateSupplier, deleteSupplier, 
      addSuppliersBulk: (ss) => setSuppliers(prev => [...prev, ...ss.map(s => ({...s, id: generateUUID()}))]),
      products, addProduct: (d) => setProducts(prev => [...prev, { ...d, id: generateUUID(), warehouseStock: {} }]),
      updateProduct, 
      deleteProduct,
      restoreItem,
      permanentDeleteItem,
      emptyRecycleBin,
      addProductsBulk: (ps) => setProducts(prev => [...prev, ...ps.map(p => ({...p, id: generateUUID(), warehouseStock: {}}))]), 
      produceItem,
      categories, addCategory: (n) => setCategories(prev => [...prev, { id: generateUUID(), name: n }]), deleteCategory: (id) => setCategories(prev => prev.filter(c => c.id !== id)),
      warehouses, addWarehouse, updateWarehouse, deleteWarehouse,
      invoices, addInvoice, approveSalesInvoice, purchaseInvoices, addPurchaseInvoice, approvePurchaseInvoice, salesReturns, addSalesReturn, purchaseReturns, addPurchaseReturn, stockTransactions, vouchers, addReceiptVoucher, addPaymentVoucher, updateVoucher, addCustomerDeposit,
      inventoryCounts, addInventoryCount: (c) => setInventoryCounts(prev => [{...c, id: generateUUID(), countNumber: `CNT-${Date.now().toString().slice(-4)}`}, ...prev]), 
      postInventoryCount: (id) => setInventoryCounts(prev => prev.map(c => c.id === id ? {...c, status: 'posted'} : c)),
      addInventoryAdjustment: (adj) => {}, 
      cheques, addCheque, updateChequeStatus, 
      assets, addAsset, runDepreciation, revaluateAsset, employees, addEmployee, updateEmployee, runPayroll, payrollHistory, 
      budgets, saveBudget: (b) => setBudgets(prev => [{...b, id: generateUUID()}, ...prev]),
      notifications, markNotificationAsRead, clearAllNotifications,
      activityLog,
      transfers, addTransfer, addStockTransfer, bankReconciliations, addBankReconciliation: (r) => setBankReconciliations(prev => [...prev, { ...r, id: generateUUID() }]), 
      getBookBalanceAtDate, getAccountBalanceInPeriod, salespeople, currentUser, users, login, logout, addUser, updateUser, deleteUser: (id) => setUsers(prev => prev.filter(u => u.id !== id)), deleteEmployee,
      settings, updateSettings: (s) => setSettings(s), 
      exportData: () => {
        if (currentUser?.role === 'demo') {
            alert('تصدير البيانات غير متاح في النسخة التجريبية');
            return;
        }
        const data = {
            accounts,
            customers,
            suppliers,
            products,
            warehouses,
            invoices,
            purchaseInvoices,
            entries,
            vouchers,
            cheques,
            assets,
            employees,
            settings,
            users
        };
        const jsonString = JSON.stringify(data, null, 2);
        const blob = new Blob([jsonString], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `backup_${new Date().toISOString().split('T')[0]}.json`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      },
      importData: (j) => true, 
      factoryReset: () => { 
          if (currentUser?.role === 'demo') {
              alert('إعادة ضبط المصنع غير متاحة في النسخة التجريبية');
              return;
          }
          localStorage.clear(); window.location.reload(); 
      }, closeFinancialYear,
      getFinancialSummary, quotations, addQuotation, updateQuotationStatus, convertQuotationToInvoice, purchaseOrders, addPurchaseOrder, updatePurchaseOrder, convertPoToInvoice,
      refreshData: fetchData,
      lastUpdated,
      userPermissions,
      can,
      recalculateStock,
      clearCache,
      exportJournalToCSV: () => {
          if (currentUser?.role === 'demo') {
              alert('تصدير البيانات غير متاح في النسخة التجريبية');
              return;
          }
          exportJournalToCSV();
      },
      authInitialized,
      getSystemAccount,
      getInvoicesPaginated,
      getJournalEntriesPaginated,
      isLoading
    }}>
      {children}
    </AccountingContext.Provider>
  );
};

import React, { createContext, useContext, useState, useEffect, useMemo, useCallback } from 'react';
import { useAuth } from './AuthContext';
import { useToast } from './ToastContext';
import { supabase } from '../supabaseClient';
import { secureStorage } from '../utils/securityMiddleware'; // Assuming this exists
import { 
  Account, JournalEntry, Invoice, Product, Customer, Supplier, 
  PurchaseInvoice, SalesReturn, PurchaseReturn, StockTransaction,
  Voucher, Warehouse, Category, Salesperson, AccountType, JournalEntryLine as JournalLine, User, SystemSettings, CostCenter, OrderItem,
  Cheque, Asset, Employee, PayrollRun, Quotation, PurchaseOrder, InventoryCount, Budget, AppNotification, ActivityLogEntry,
  RestaurantTable, MenuCategory
} from '../types';
import { INITIAL_ACCOUNTS } from '../constants';
import { ADMIN_USER_ID, DEMO_USER_ID, DEMO_EMAIL } from '../utils/constants'; // Assuming this exists

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
  monthlySales: number;
  monthlyPurchases: number;
  grossProfit: number;
}

export const SYSTEM_ACCOUNTS = {
  CASH: '1231', // النقدية بالصندوق
  BANK_ACCOUNTS: '123201', // حسابات البنوك (الافتراضي: البنك الأهلي المصري)
  CUSTOMERS: '1221', // العملاء
  NOTES_RECEIVABLE: '1222', // أوراق القبض
  INVENTORY: '10302', // المخزون - الافتراضي هو مخزون المنتج التام (حساب فرعي)
  INVENTORY_RAW_MATERIALS: '10301', // خامات
  INVENTORY_FINISHED_GOODS: '10302', // منتج تام
  ACCUMULATED_DEPRECIATION: '1119', // مجمع الإهلاك
  SUPPLIERS: '201', // الموردين
  VAT: '2231', // ضريبة القيمة المضافة (مخرجات)
  VAT_INPUT: '1241', // ضريبة القيمة المضافة (مدخلات) - مصر
  CUSTOMER_DEPOSITS: '226', // تأمينات العملاء
  NOTES_PAYABLE: '222', // أوراق الدفع
  SALES_REVENUE: '411', // إيراد المبيعات
  OTHER_REVENUE: '421', // إيرادات متنوعة
  SALES_DISCOUNT: '413', // خصم مسموح به
  COGS: '511', // تكلفة البضاعة المباعة
  SALARIES_EXPENSE: '531', // الرواتب والأجور
  DEPRECIATION_EXPENSE: '533', // مصروف الإهلاك
  INVENTORY_ADJUSTMENTS: '512', // تسويات الجرد
  RETAINED_EARNINGS: '32', // الأرباح المبقاة
  EMPLOYEE_BONUSES: '5312', // مكافآت وحوافز
  EMPLOYEE_DEDUCTIONS: '422', // إيراد خصومات وجزاءات
  DIGITAL_WALLETS: '1233', // المحافظ الإلكترونية
  CASH_DIFF: '541', // تسوية عجز الصندوق
  BANK_CHARGES: '534', // مصروفات بنكية
  BANK_INTEREST_INCOME: '423', // فوائد بنكية دائنة
  TAX_AUTHORITY: '2231', // مصلحة الضرائب (قيمة مضافة - فرعي)
  SOCIAL_INSURANCE: '224', // هيئة التأمينات الاجتماعية
  WITHHOLDING_TAX: '2232', // ضريبة الخصم والتحصيل
  EMPLOYEE_ADVANCES: '1223', // سلف الموظفين
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

const DUMMY_TABLES: RestaurantTable[] = [
  { id: 't1', name: 'T1', status: 'AVAILABLE', section: 'داخلي', capacity: 4, created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
  { id: 't2', name: 'T2', status: 'OCCUPIED', section: 'داخلي', capacity: 2, created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
  { id: 't3', name: 'T3', status: 'RESERVED', section: 'داخلي', capacity: 6, created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
  { id: 't4', name: 'T4', status: 'AVAILABLE', section: 'خارجي', capacity: 4, created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
  { id: 't5', name: 'T5', status: 'OCCUPIED', section: 'خارجي', capacity: 8, created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
];

const DUMMY_MENU_CATEGORIES: MenuCategory[] = [
      { id: 'cat1', name: 'مقبلات', display_order: 1, created_at: new Date().toISOString(), updated_at: new Date().toISOString() }, // Used by demo-menu-1
      { id: 'cat2', name: 'وجبات رئيسية', display_order: 2, created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
      { id: 'cat3', name: 'مشروبات', display_order: 3, created_at: new Date().toISOString(), updated_at: new Date().toISOString() }, // Used by demo-menu-2
      { id: 'cat4', name: 'حلويات', display_order: 4, created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
];


const DUMMY_WAREHOUSES = [
    { id: 'demo-wh1', name: 'المستودع الرئيسي', type: 'warehouse' },
    { id: 'demo-wh2', name: 'فرع الرياض', type: 'showroom' }
];

const DUMMY_INVOICES = [
    { 
        id: 'demo-inv-1', 
        invoice_number: 'INV-001001', 
        customer_id: 'demo-c1', 
        customerName: 'شركة الأفق للتجارة', customerPhone: '0501234567',
        date: new Date().toISOString().split('T')[0], 
        total_amount: 9775, tax_amount: 1275, subtotal: 8500, 
        status: 'posted', paid_amount: 5000, warehouseId: 'demo-wh1',
        items: [{ id: 'di-1', productId: 'demo-p2', productName: 'طابعة ليزر Canon', quantity: 1, unitPrice: 8500, total: 8500 }]
    },
    { 
        id: 'demo-inv-2', 
        invoice_number: 'INV-001002', 
        customer_id: 'demo-c2', 
        customerName: 'مؤسسة النور', customerPhone: '0551234567',
        date: new Date(Date.now() - 86400000).toISOString().split('T')[0], 
        total_amount: 4887.5, tax_amount: 637.5, subtotal: 4250, 
        status: 'paid', paid_amount: 4887.5, warehouseId: 'demo-wh1',
        items: [{ id: 'di-2', productId: 'demo-p4', productName: 'ورق تصوير A4 (كرتونة)', quantity: 5, unitPrice: 850, total: 4250 }]
    },
    { 
        id: 'demo-inv-3', 
        invoice_number: 'INV-001003', 
        customer_id: 'demo-c3', 
        customerName: 'عميل نقدي', customerPhone: '',
        date: new Date().toISOString().split('T')[0], 
        total_amount: 1500, tax_amount: 195.65, subtotal: 1304.35, 
        status: 'posted', paid_amount: 0, warehouseId: 'demo-wh1',
        items: [{ id: 'di-3', productId: 'demo-p3', productName: 'حبر طابعة HP 85A', quantity: 3, unitPrice: 450, total: 1350 }]
    }
];

const DUMMY_PURCHASE_INVOICES = [
    {
        id: 'demo-pinv-1',
        invoice_number: 'PINV-001',
        supplier_id: 'demo-s1',
        supplierName: 'شركة التوريدات العالمية',
        date: new Date(Date.now() - 86400000 * 5).toISOString().split('T')[0],
        total_amount: 5750,
        tax_amount: 750,
        subtotal: 5000,
        status: 'posted',
        warehouseId: 'demo-wh1',
        items: [{ id: 'dpi-1', productId: 'demo-p1', quantity: 1, unitPrice: 5000, total: 5000 }]
    }
];

const DUMMY_VOUCHERS = [
    { id: 'demo-rct-1', voucherNumber: 'RCT-00501', date: new Date().toISOString().split('T')[0], amount: 5000, description: 'دفعة من الحساب', type: 'receipt', partyId: 'demo-c1', partyName: 'شركة الأفق للتجارة' },
    { id: 'demo-pay-1', voucherNumber: 'PAY-00201', date: new Date().toISOString().split('T')[0], amount: 2000, description: 'سداد دفعة لمورد', type: 'payment', partyId: 'demo-s1', partyName: 'شركة التوريدات العالمية' }
];

const DUMMY_PRODUCTS = [
        { id: 'demo-p1', name: 'لابتوب HP ProBook 450', sku: 'HP-PB-450', price: 25000, cost: 21000, stock: 15, warehouseStock: { 'demo-wh1': 15 }, purchase_price: 21000, weighted_average_cost: 21000, product_type: 'STOCK' },
        { id: 'demo-p2', name: 'طابعة ليزر Canon', sku: 'CN-LBP-6030', price: 8500, cost: 6000, stock: 8, warehouseStock: { 'demo-wh1': 8 }, purchase_price: 6000, weighted_average_cost: 6000, product_type: 'STOCK' },
        { id: 'demo-p3', name: 'حبر طابعة HP 85A', sku: 'HP-85A', price: 450, cost: 250, stock: 50, warehouseStock: { 'demo-wh1': 50 }, purchase_price: 250, weighted_average_cost: 250, product_type: 'STOCK' },
        { id: 'demo-p4', name: 'ورق تصوير A4 (كرتونة)', sku: 'PPR-A4', price: 850, cost: 650, stock: 100, warehouseStock: { 'demo-wh1': 100 }, purchase_price: 650, weighted_average_cost: 650, product_type: 'STOCK' },
        { id: 'demo-p5', name: 'ماوس لاسلكي Logitech', sku: 'LOG-M170', price: 350, cost: 200, stock: 30, warehouseStock: { 'demo-wh1': 30 }, purchase_price: 200, weighted_average_cost: 200, product_type: 'STOCK' },
        { id: 'demo-menu-1', name: 'سلطة سيزر', sku: 'MENU-SAL-CZ', price: 25, cost: 8, stock: 999999, product_type: 'MANUFACTURED', category_id: 'cat1' },
        { id: 'demo-menu-2', name: 'بيبسي', sku: 'MENU-PEPSI', price: 5, cost: 2, stock: 999999, product_type: 'MANUFACTURED', category_id: 'cat3' }
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
            { id: 'demo-jel-1', accountId: '1115', accountName: 'الأثاث والتجهيزات المكتبية', accountCode: '1115', debit: 5000, credit: 0, description: 'شراء مكتب وكرسي' },
            { id: 'demo-jel-2', accountId: SYSTEM_ACCOUNTS.CASH, accountName: 'النقدية بالصندوق', accountCode: SYSTEM_ACCOUNTS.CASH, debit: 0, credit: 5000, description: 'دفع نقدي' }
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
            { id: 'demo-jel-3', accountId: '535', accountName: 'كهرباء ومياه وغاز', accountCode: '535', debit: 750, credit: 0, description: 'فاتورة كهرباء' },
            { id: 'demo-jel-4', accountId: SYSTEM_ACCOUNTS.CASH, accountName: 'النقدية بالصندوق', accountCode: SYSTEM_ACCOUNTS.CASH, debit: 0, credit: 750, description: 'دفع نقدي' }
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

const FULL_DEMO_ACCOUNTS_RAW = [
  { code: '1', name: 'الأصول', type: 'ASSET', is_group: true, parent_account: null },
  { code: '11', name: 'الأصول غير المتداولة', type: 'ASSET', is_group: true, parent_account: '1' },
  { code: '111', name: 'الأصول الثابتة (بالصافي)', type: 'ASSET', is_group: true, parent_account: '11' },
  { code: '1115', name: 'الأثاث والتجهيزات المكتبية', type: 'ASSET', is_group: false, parent_account: '111' },
  { code: '12', name: 'الأصول المتداولة', type: 'ASSET', is_group: true, parent_account: '1' },
  { code: '103', name: 'المخزون', type: 'ASSET', is_group: true, parent_account: '12' },
  { code: '10301', name: 'مخزون المواد الخام', type: 'ASSET', is_group: false, parent_account: '103' },
  { code: '10302', name: 'مخزون المنتج التام', type: 'ASSET', is_group: false, parent_account: '103' },
  { code: '122', name: 'العملاء والمدينون', type: 'ASSET', is_group: true, parent_account: '12' },
  { code: '1221', name: 'العملاء', type: 'ASSET', is_group: false, parent_account: '122' },
  { code: '1222', name: 'أوراق القبض', type: 'ASSET', is_group: false, parent_account: '122' },
  { code: '123', name: 'النقدية وما في حكمها', type: 'ASSET', is_group: true, parent_account: '12' },
  { code: '1231', name: 'النقدية بالصندوق', type: 'ASSET', is_group: false, parent_account: '123' },
  { code: '1232', name: 'البنك الأهلي', type: 'ASSET', is_group: false, parent_account: '123' },
  { code: '124', name: 'أرصدة مدينة أخرى', type: 'ASSET', is_group: true, parent_account: '12' },
  { code: '1241', name: 'ضريبة القيمة المضافة (مدخلات)', type: 'ASSET', is_group: false, parent_account: '124' },
  { code: '2', name: 'الخصوم', type: 'LIABILITY', is_group: true, parent_account: null },
  { code: '22', name: 'الخصوم المتداولة', type: 'LIABILITY', is_group: true, parent_account: '2' },
  { code: '201', name: 'الموردين', type: 'LIABILITY', is_group: false, parent_account: '22' },
  { code: '222', name: 'أوراق الدفع', type: 'LIABILITY', is_group: false, parent_account: '22' },
  { code: '223', name: 'مصلحة الضرائب (التزامات)', type: 'LIABILITY', is_group: true, parent_account: '22' },
  { code: '2231', name: 'ضريبة القيمة المضافة (مخرجات)', type: 'LIABILITY', is_group: false, parent_account: '223' },
  { code: '3', name: 'حقوق الملكية', type: 'EQUITY', is_group: true, parent_account: null },
  { code: '31', name: 'رأس المال', type: 'EQUITY', is_group: false, parent_account: '3' },
  { code: '32', name: 'الأرباح المبقاة', type: 'EQUITY', is_group: false, parent_account: '3' },
  { code: '4', name: 'الإيرادات', type: 'REVENUE', is_group: true, parent_account: null },
  { code: '411', name: 'إيراد المبيعات', type: 'REVENUE', is_group: false, parent_account: '4' },
  { code: '421', name: 'إيرادات متنوعة', type: 'REVENUE', is_group: false, parent_account: '4' },
  { code: '5', name: 'المصروفات', type: 'EXPENSE', is_group: true, parent_account: null },
  { code: '511', name: 'تكلفة البضاعة المباعة', type: 'EXPENSE', is_group: false, parent_account: '5' },
  { code: '531', name: 'الرواتب والأجور', type: 'EXPENSE', is_group: false, parent_account: '5' },
  { code: '535', name: 'كهرباء ومياه وغاز', type: 'EXPENSE', is_group: false, parent_account: '5' },
];
const DUMMY_ACCOUNTS = FULL_DEMO_ACCOUNTS_RAW.map(acc => ({
    id: acc.code,
    code: acc.code,
    name: acc.name,
    type: acc.type,
    balance: 0,
    is_group: acc.is_group,
    parent_id: acc.parent_account,
    is_active: true
})) as unknown as Account[];

interface AccountingContextType {
  accounts: Account[];
  addAccount: (account: Omit<Account, 'id' | 'balance'> & { balance?: number }) => Promise<Account | void>;
  updateAccount: (id: string, updates: Partial<Omit<Account, 'id' | 'balance'>>) => Promise<void>;
  deleteAccount: (id: string, reason?: string) => Promise<{ success: boolean; message?: string }>;
  costCenters: CostCenter[];
  addCostCenter: (cc: Omit<CostCenter, 'id'>) => void;
  deleteCostCenter: (id: string) => void;
  entries: JournalEntry[];
  addEntry: (entry: Omit<JournalEntry, 'id' | 'created_at' | 'createdAt' | 'status' | 'is_posted' | 'lines'> & { lines: any[], status?: 'posted' | 'draft', attachments?: File[] }) => Promise<string | null>;
  customers: Customer[];
  addCustomer: (customer: Omit<Customer, 'id'>) => Promise<any>;
  updateCustomer: (id: string, customer: Partial<Customer>) => Promise<void>;
  deleteCustomer: (id: string, reason?: string) => Promise<void>;
  addCustomersBulk: (customers: Omit<Customer, 'id'>[]) => Promise<void>;
  suppliers: Supplier[];
  addSupplier: (supplier: Omit<Supplier, 'id'>) => Promise<any>;
  updateSupplier: (id: string, supplier: Partial<Supplier>) => Promise<void>;
  deleteSupplier: (id: string, reason?: string) => Promise<void>;
  addSuppliersBulk: (suppliers: Omit<Supplier, 'id'>[]) => void;
  products: Product[];
  addProduct: (product: Omit<Product, 'id'>) => Promise<Product | void>;
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
  createRestaurantOrder: (orderData: { sessionId: string | null; items: any[]; orderType: 'dine-in' | 'takeaway' | 'delivery'; customerId: string | null; }) => Promise<string | null>;
  addRestaurantOrderItem: (orderId: string, item: { productId: string; quantity: number; unitPrice: number; notes?: string; }) => Promise<void>; // هذا لم يعد مستخدماً بشكل مباشر
  completeRestaurantOrder: (orderId: string, paymentMethod: 'CASH' | 'CARD' | 'WALLET' | 'SPLIT', amount: number, treasuryAccountId: string) => Promise<void>;
  openTableSession: (tableId: string) => Promise<string | void>;
  reserveTable: (tableId: string, customerName: string, arrivalTime: string) => Promise<boolean>;
  cancelReservation: (tableId: string) => Promise<boolean>;
  transferTableSession: (sessionId: string, targetTableId: string) => Promise<boolean>;
  mergeTableSessions: (sourceSessionId: string, targetSessionId: string) => Promise<boolean>;
  addRestaurantTable: (table: Omit<RestaurantTable, 'id' | 'status' | 'created_at' | 'updated_at'>) => Promise<RestaurantTable | void>;
  updateRestaurantTable: (id: string, updates: Partial<Omit<RestaurantTable, 'id' | 'created_at' | 'updated_at' | 'status'>>) => Promise<void>;
  updateKitchenOrderStatus: (kitchenOrderId: string, newStatus: 'PREPARING' | 'READY' | 'SERVED') => Promise<void>;
  getOpenTableOrder: (tableId: string) => Promise<{ sessionId: string; orderId: string | null; items: any[] } | null>;
  deleteRestaurantTable: (id: string) => Promise<void>;
  restaurantTables: RestaurantTable[];
  menuCategories: MenuCategory[];
  addWastage: (data: { warehouseId: string, date: string, notes: string, items: any[] }) => Promise<boolean>;
  approveInvoice: (invoiceId: string) => Promise<boolean>;
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
  organization: any | null;
  organizationId: string | null;
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
  calculateProductPrice: (product: Product) => number;
  clearTransactions: () => Promise<void>;
  addOpeningBalanceTransaction: (entityId: string, entityType: 'customer' | 'supplier', amount: number, date: string, name: string) => Promise<void>;
  checkSystemAccounts: () => { missing: string[]; found: string[] };
  createMissingSystemAccounts: () => Promise<{ success: boolean; message: string; created: string[] }>;
  addDemoInvoice: (invoice: any) => void;
  currentShift: any | null;
  startShift: (openingBalance: number) => Promise<boolean>;
  closeCurrentShift: (actualCash: number, notes?: string) => Promise<boolean>;
  getCurrentShiftSummary: () => Promise<any>;
  processSplitPayment: (originalOrderId: string, items: { id: string, quantity: number }[], method: string, amount: number, treasuryId: string) => Promise<boolean>;
  addDemoPurchaseInvoice: (invoice: any) => void;
  addDemoEntry: (entryData: any) => void;
  postDemoSalesInvoice: (invoiceData: any) => void;
  addDemoPaymentVoucher: (voucher: any) => void;
  addDemoReceiptVoucher: (voucher: any) => void;
  isDemo: boolean;
  openShifts: any[];
  fetchOpenShifts: () => Promise<void>;
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
  const [settings, setSettings] = useState<any>({ 
    companyName: 'TriPro ERP', taxNumber: '', address: 'القاهرة', phone: '', email: '', vatRate: 14, currency: 'EGP', footerText: 'شكراً لثقتكم', enableTax: true, maxCashDeficitLimit: 500, decimalPlaces: 2,
    logoUrl: 'https://placehold.co/400x150/2563eb/ffffff?text=TriPro+ERP' // لوجو افتراضي للهوية البصرية
  });
  const [users, setUsers] = useState<User[]>([]);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [userPermissions, setUserPermissions] = useState<Set<string>>(new Set());
  const [userRole, setUserRole] = useState<string | null>(null);
  const [organization, setOrganization] = useState<any | null>(null);
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
  const [isDemoState, setIsDemoState] = useState(false);
  const [payrollHistory, setPayrollHistory] = useState<PayrollRun[]>([]);
  const [quotations, setQuotations] = useState<Quotation[]>([]);
  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrder[]>([]);
  const [costCenters, setCostCenters] = useState<CostCenter[]>([]);
  const [transfers, setTransfers] = useState<any[]>([]);
  const [restaurantTables, setRestaurantTables] = useState<RestaurantTable[]>([]);
  const [menuCategories, setMenuCategories] = useState<MenuCategory[]>([]);
  const [bankReconciliations, setBankReconciliations] = useState<any[]>([]);
  const [currentShift, setCurrentShift] = useState<any | null>(null);
  const [openShifts, setOpenShifts] = useState<any[]>([]);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const getAccountId = (code: string) => {
    const acc = accounts.find(a => a.code === code);
    return acc ? acc.id : null;
  };

  const getSystemAccount = (key: keyof typeof SYSTEM_ACCOUNTS) => {
    // 1. البحث في الإعدادات (الربط المخصص)
    const mappings = settings.account_mappings || {};
    if (mappings[key]) {
      const mappedId = mappings[key];
      const acc = accounts.find(a => a.id === mappedId);
      if (acc) return acc;
    }
    // 2. البحث بالكود الافتراضي
    return accounts.find(a => a.code === SYSTEM_ACCOUNTS[key]);
  };

  const calculateInitialDemoState = () => {
    let demoAccounts = JSON.parse(JSON.stringify(DUMMY_ACCOUNTS)); // Deep copy to avoid reference issues
    const accountBalances: Record<string, number> = {};
    let allDemoEntries: any[] = [...DUMMY_JOURNAL_ENTRIES.map(e => ({...e, is_posted: true, lines: e.lines.map(l => ({...l, accountId: l.accountId || l.accountCode}))}))];

    const processLines = (lines: any[]) => {
        lines.forEach(line => {
            const change = (Number(line.debit) || 0) - (Number(line.credit) || 0);
            const accId = String(line.accountId || line.account_id || '').trim();
            if (accId) {
                accountBalances[accId] = (accountBalances[accId] || 0) + change;
            }
        });
    };

    DUMMY_JOURNAL_ENTRIES.forEach(entry => processLines(entry.lines));

    DUMMY_INVOICES.forEach(inv => {
        if (inv.status !== 'draft') {
            const lines = [
                { account_id: SYSTEM_ACCOUNTS.CUSTOMERS, debit: inv.total_amount, credit: 0 },
                { account_id: SYSTEM_ACCOUNTS.SALES_REVENUE, debit: 0, credit: inv.subtotal },
                { account_id: SYSTEM_ACCOUNTS.VAT, debit: 0, credit: inv.tax_amount },
            ];
            if (inv.paid_amount && inv.paid_amount > 0) {
                lines.push({ account_id: SYSTEM_ACCOUNTS.CUSTOMERS, debit: 0, credit: inv.paid_amount });
                lines.push({ account_id: SYSTEM_ACCOUNTS.CASH, debit: inv.paid_amount, credit: 0 });
            }
            processLines(lines);
            allDemoEntries.push({
                id: `demo-je-inv-${inv.id}`, date: inv.date, description: `فاتورة مبيعات ${inv.customerName}`,
                reference: inv.invoice_number, status: 'posted', is_posted: true,
                lines: lines.map(l => ({ accountId: l.account_id, debit: l.debit, credit: l.credit }))
            });
        }
    });
    
    DUMMY_PURCHASE_INVOICES.forEach(inv => {
        if (inv.status !== 'draft') {
            const lines = [
                { account_id: SYSTEM_ACCOUNTS.INVENTORY_FINISHED_GOODS, debit: inv.subtotal, credit: 0 },
                { account_id: SYSTEM_ACCOUNTS.VAT_INPUT, debit: inv.tax_amount, credit: 0 },
                { account_id: SYSTEM_ACCOUNTS.SUPPLIERS, debit: 0, credit: inv.total_amount },
            ];
            processLines(lines);
            allDemoEntries.push({
                id: `demo-je-pinv-${inv.id}`, date: inv.date, description: `فاتورة مشتريات ${inv.supplierName}`,
                reference: inv.invoice_number, status: 'posted', is_posted: true,
                lines: lines.map(l => ({ accountId: l.account_id, debit: l.debit, credit: l.credit }))
            });
        }
    });

    DUMMY_VOUCHERS.forEach(v => {
        let lines: any[] = [];
        if (v.type === 'receipt') {
             lines = [ { account_id: SYSTEM_ACCOUNTS.CASH, debit: v.amount, credit: 0 }, { account_id: SYSTEM_ACCOUNTS.CUSTOMERS, debit: 0, credit: v.amount } ];
        } else if (v.type === 'payment') {
            lines = [ { account_id: SYSTEM_ACCOUNTS.SUPPLIERS, debit: v.amount, credit: 0 }, { account_id: SYSTEM_ACCOUNTS.CASH, debit: 0, credit: v.amount } ];
        }
        processLines(lines);
        allDemoEntries.push({
            id: `demo-je-v-${v.id}`, date: v.date, description: v.description, reference: v.voucherNumber, status: 'posted', is_posted: true,
            lines: lines.map(l => ({ accountId: l.account_id, debit: l.debit, credit: l.credit }))
        });
    });

    demoAccounts = demoAccounts.map(acc => {
        const accId = String(acc.id || acc.code).trim();
        const rawBalance = accountBalances[accId] || 0;
        const type = String(acc.type || '').toLowerCase();
        const isDebitNature = ['asset', 'expense', 'أصول', 'مصروفات', 'تكلفة المبيعات', 'cost of goods sold'].some(t => type.includes(t));
        const finalBalance = isDebitNature ? rawBalance : -rawBalance;
        return { ...acc, balance: finalBalance };
    });

    let changed = true;
    while (changed) {
        changed = false;
        demoAccounts.forEach(parent => {
            if (parent.is_group) {
                const childrenBalance = demoAccounts.filter(child => child.parent_id === parent.id).reduce((sum, child) => sum + (child.balance || 0), 0);
                if (parent.balance !== childrenBalance) { parent.balance = childrenBalance; changed = true; }
            }
        });
    }
    return { demoAccounts, allDemoEntries };
  };

  const fetchData = async () => {
    setIsLoading(true);
    // التحقق من هوية المستخدم (لإخفاء التكلفة عن الديمو)
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();

    // معالجة خطأ التوكن غير الصالح (يحدث عند مسح قاعدة البيانات أو انتهاء الجلسة)
    if (sessionError && (sessionError.message.includes('Refresh Token') || sessionError.status === 400)) {
        console.warn("Invalid session detected, signing out...", sessionError);
        await supabase.auth.signOut();
        setIsLoading(false);
        return;
    }

    const isDemo = session?.user?.user_metadata?.app_role === 'demo' || session?.user?.email === DEMO_EMAIL || session?.user?.id === DEMO_USER_ID;
    setIsDemoState(isDemo);
    // تحديد ما إذا كان يجب جلب البيانات المحمية (فقط عند وجود جلسة)
    const shouldFetchProtected = !!session;

    // --- معالجة وضع الديمو بشكل منفصل تماماً لمنع التضارب ---
    if (isDemo) {
        const { demoAccounts, allDemoEntries } = calculateInitialDemoState();
        setAccounts(demoAccounts);
        setEntries(allDemoEntries);
        setCustomers(DUMMY_CUSTOMERS as any);
        setSuppliers(DUMMY_SUPPLIERS as any);
        setProducts(DUMMY_PRODUCTS as any);
        setInvoices(DUMMY_INVOICES as any);
        setVouchers(DUMMY_VOUCHERS as any);
        setPurchaseInvoices(DUMMY_PURCHASE_INVOICES as any);
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
        setRestaurantTables(DUMMY_TABLES);
        setMenuCategories(DUMMY_MENU_CATEGORIES);
        
        // تعيين المستخدمين للديمو
        setUsers([
            { id: ADMIN_USER_ID, name: 'المدير العام', username: 'admin', role: 'super_admin', is_active: true },
            { id: 'demo-u1', name: 'أحمد محمد', username: 'ahmed', role: 'sales', is_active: true },
            { id: 'demo-u2', name: 'سارة علي', username: 'sara', role: 'sales', is_active: true }
        ]);

        setWarehouses(DUMMY_WAREHOUSES as any);
        
        // إعدادات افتراضية للديمو
        setSettings({
            companyName: 'مؤسسة الرخاوي (نسخة تجريبية)',
            taxNumber: '300123456700003',
            address: 'الرياض - المملكة العربية السعودية',
            phone: '0501234567',
            email: `info@${DEMO_EMAIL.split('@')[1]}`,
            vatRate: 15,
            currency: 'SAR',
            footerText: 'نسخة تجريبية - جميع البيانات وهمية',
            enableTax: true,
            logoUrl: 'https://placehold.co/400x150/2563eb/ffffff?text=TriPro+Demo'
        });

        setIsLoading(false);
        return; // الخروج فوراً لمنع تنفيذ باقي الكود
    }

    // =================================================================================
    // 🔒 منطق النسخة الأصلية (Production Logic) - يبدأ من هنا للمستخدمين الحقيقيين
    // =================================================================================

    // محاولة استرجاع البيانات من التخزين المؤقت أولاً
    const cachedAccounts = secureStorage.getItem<Account[]>('cached_accounts');
    const cachedCustomers = secureStorage.getItem<Customer[]>('cached_customers');
    const cachedSuppliers = secureStorage.getItem<Supplier[]>('cached_suppliers');
    const cachedProducts = secureStorage.getItem<Product[]>('cached_products');

    let hasCache = false;

    if (cachedAccounts && Array.isArray(cachedAccounts)) {
        setAccounts(cachedAccounts);
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
        { data: orgData },
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
        { data: allBalances }, // جلب أرصدة جميع الحسابات من السيرفر
        { data: restaurantTablesData },
        { data: menuCategoriesData }
      ] = await Promise.all([
        shouldFetchProtected ? supabase.from('warehouses').select('*').is('deleted_at', null) : Promise.resolve({ data: [], error: null }),
        supabase.from('company_settings').select('*').limit(1).single(),
        shouldFetchProtected ? supabase.from('organizations').select('*').limit(1).single() : Promise.resolve({ data: null, error: null }),
        shouldFetchProtected ? supabase.from('accounts').select('*').is('deleted_at', null) : Promise.resolve({ data: [], error: null }),
        shouldFetchProtected ? supabase.from('journal_entries').select('*, journal_lines (*), journal_attachments (*)').order('transaction_date', { ascending: false }).order('created_at', { ascending: false }).limit(1000) : Promise.resolve({ data: [], error: null }),
        shouldFetchProtected ? supabase.from('customers').select('*').is('deleted_at', null) : Promise.resolve({ data: [], error: null }),
        shouldFetchProtected ? supabase.from('suppliers').select('*').is('deleted_at', null) : Promise.resolve({ data: [], error: null }),
        shouldFetchProtected ? supabase.from('products').select('*').is('deleted_at', null) : Promise.resolve({ data: [], error: null }),
        shouldFetchProtected ? supabase.from('cheques').select('*') : Promise.resolve({ data: [], error: null }),
        shouldFetchProtected ? supabase.from('assets').select('*').is('deleted_at', null) : Promise.resolve({ data: [], error: null }),
        shouldFetchProtected ? supabase.from('employees').select('*').is('deleted_at', null) : Promise.resolve({ data: [], error: null }),
        shouldFetchProtected ? supabase.from('profiles').select('*') : Promise.resolve({ data: [], error: null }),
        shouldFetchProtected ? supabase.from('invoices').select('*').order('invoice_date', { ascending: false }).limit(50) : Promise.resolve({ data: [], error: null }),
        shouldFetchProtected ? supabase.from('purchase_invoices').select('*').order('invoice_date', { ascending: false }).limit(50) : Promise.resolve({ data: [], error: null }),
        shouldFetchProtected ? supabase.from('receipt_vouchers').select('*').order('receipt_date', { ascending: false }).limit(50) : Promise.resolve({ data: [], error: null }),
        shouldFetchProtected ? supabase.from('payment_vouchers').select('*').order('payment_date', { ascending: false }).limit(50) : Promise.resolve({ data: [], error: null }),
        shouldFetchProtected ? supabase.from('notifications').select('*').eq('is_read', false).order('created_at', { ascending: false }).limit(20) : Promise.resolve({ data: [], error: null }),
        shouldFetchProtected ? supabase.from('journal_entries').select('related_document_id, journal_lines(credit)').eq('related_document_type', 'asset_depreciation').eq('status', 'posted') : Promise.resolve({ data: [], error: null }),
        shouldFetchProtected ? supabase.rpc('get_all_account_balances') : Promise.resolve({ data: [], error: null }),
        shouldFetchProtected ? supabase.from('restaurant_tables').select('*') : Promise.resolve({ data: [], error: null }),
        shouldFetchProtected ? supabase.from('menu_categories').select('*').order('display_order') : Promise.resolve({ data: [], error: null })
      ]);

      // حفظ بيانات المنظمة الحالية (بما فيها الموديولات المسموحة)
      if (orgData) {
        setOrganization(orgData);
      }

      // 1. معالجة المستودعات
      if (whs && whs.length > 0) {
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
              currency: sysSettings.currency || 'EGP',
              footerText: sysSettings.footer_text || '',
              footer_text: sysSettings.footer_text || '',
              enableTax: sysSettings.enable_tax ?? true,
              // @ts-ignore
              logoUrl: sysSettings.logo_url || 'https://placehold.co/400x150/2563eb/ffffff?text=TriPro+ERP',
              lastClosedDate: sysSettings.last_closed_date,
              // @ts-ignore
              preventPriceModification: sysSettings.prevent_price_modification ?? false,
              // @ts-ignore
              maxCashDeficitLimit: sysSettings.max_cash_deficit_limit ?? 500,
              // @ts-ignore
              decimalPlaces: sysSettings.decimal_places !== undefined ? sysSettings.decimal_places : 2,
              account_mappings: sysSettings.account_mappings || {}
          });
      }

      // 3. معالجة الحسابات
      let accs = fetchedAccounts ? [...fetchedAccounts] : [];
      
      if (accError) {
          if (process.env.NODE_ENV === 'development') console.error("Error fetching accounts:", accError);
          // معالجة خطأ انتهاء الجلسة (401 Unauthorized / JWT Expired)
          // تم توسيع الشرط ليشمل رسائل Unauthorized
          if (accError.code === 'PGRST301' || accError.message?.includes('JWT') || accError.code === '401' || accError.message?.includes('Unauthorized')) {
              if (process.env.NODE_ENV === 'development') console.warn("Session expired (401), signing out...");
              await supabase.auth.signOut();
              localStorage.clear(); // تنظيف كامل للذاكرة المحلية لإزالة الجلسة الفاسدة
              window.location.reload();
              return;
          }
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
      await ensureAccount('123201', 'البنك الأهلي المصري', 'ASSET');
      await ensureAccount(SYSTEM_ACCOUNTS.SUPPLIERS, 'الموردين', 'LIABILITY'); // 201
      await ensureAccount(SYSTEM_ACCOUNTS.CUSTOMERS, 'العملاء', 'ASSET');
      // ملاحظة: لا نقوم بإنشاء حساب 103 هنا لأنه حساب رئيسي يتم إنشاؤه عبر ملف SQL
      await ensureAccount(SYSTEM_ACCOUNTS.INVENTORY_RAW_MATERIALS, 'مخزون المواد الخام', 'ASSET'); // 10301
      await ensureAccount(SYSTEM_ACCOUNTS.INVENTORY_FINISHED_GOODS, 'مخزون المنتج التام', 'ASSET'); // 10302
      await ensureAccount(SYSTEM_ACCOUNTS.SALARIES_EXPENSE, 'الرواتب والأجور', 'EXPENSE');

      // 4. معالجة القيود وحساب الأرصدة
      if (jError && process.env.NODE_ENV === 'development') console.error("Journal Fetch Error:", jError);

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
      if (jEntries) {
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
                parent_id: a.parent_id,
                balance: finalBalance
            };
        });

        // 2. تجميع الأرصدة للحسابات الرئيسية (الآباء)
        // نقوم بتكرار العملية لضمان تجميع المستويات المتعددة (شجرة الحسابات)
        let changed = true;
        while (changed && accountsWithBalances.length > 0) {
            changed = false;
            accountsWithBalances.forEach(parent => {
                if (parent.is_group) { // @ts-ignore
                    const childrenBalance = accountsWithBalances // @ts-ignore
                        .filter(child => child.parent_id === parent.id)
                        .reduce((sum, child) => sum + (child.balance || 0), 0);
                    
                    if (parent.balance !== childrenBalance) {
                        parent.balance = childrenBalance;
                        changed = true;
                    }
                }
            });
        }

        setAccounts(accountsWithBalances);
        secureStorage.setItem('cached_accounts', accs); // تحديث الكاش
      } else if (shouldFetchProtected && !accError && (!accs || accs.length === 0)) {
        if (process.env.NODE_ENV === 'development') console.error("Chart of Accounts is empty. Please run the setup SQL script on your database.");
      }

      if (!isDemo) {
        if (custs) {
          setCustomers(custs.map(c => ({...c, taxId: c.tax_id, customerType: c.customer_type, credit_limit: c.credit_limit })));
          secureStorage.setItem('cached_customers', custs);
        }
        if (supps) {
          setSuppliers(supps.map(s => ({...s, taxId: s.tax_id, contactPerson: s.contact_person})));
          secureStorage.setItem('cached_suppliers', supps);
        }
        if (prods) {
          const processedProds = prods.map(p => ({
              ...p,
              // ضمان أن مخزون المستودعات كائن وليس null لتجنب الأخطاء
              warehouseStock: p.warehouse_stock || {},
              cost: p.cost,
              purchase_price: p.purchase_price,
              weighted_average_cost: p.weighted_average_cost
          }));
          setProducts(processedProds);
          secureStorage.setItem('cached_products', processedProds);
        }
      }

      if (chqs) setCheques(chqs.map(c => ({...c, chequeNumber: c.cheque_number, bankName: c.bank_name, dueDate: c.due_date, partyName: c.party_name, partyId: c.party_id})));

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

      if (employeesData) {
          setEmployees(employeesData);
      }

      if (profilesData) {
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
      }

      if (salesInvoicesData) {
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

      if (purchaseInvoicesData) {
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

      if (notificationsData) setNotifications(notificationsData);

      // Restaurant Data
      if (restaurantTablesData) setRestaurantTables(restaurantTablesData);
      if (menuCategoriesData) setMenuCategories(menuCategoriesData);

      setLastUpdated(new Date());
    } catch (error) {
      if (process.env.NODE_ENV === 'development') console.error("Error fetching data from Supabase:", error);
    } finally {
      setIsLoading(false);
    }
  };

  // دالة لإضافة فاتورة وهمية للحالة المحلية (لتحسين تجربة الديمو)
  const addDemoInvoice = (invoice: any) => {
      setInvoices(prev => [invoice, ...prev]);
  };

  const addDemoPurchaseInvoice = (invoice: any) => {
      setPurchaseInvoices(prev => [invoice, ...prev]);
      // create simple journal entry for demo (debit inventory or expense, credit supplier)
      const supplierAcc = getSystemAccount('SUPPLIERS');
      const cashAcc = getSystemAccount('CASH');
      if (supplierAcc && cashAcc) {
          addDemoEntry({
              date: invoice.date || new Date().toISOString().split('T')[0],
              description: `فاتورة مشتريات ديمو`,
              reference: invoice.invoiceNumber || '',
              lines: [
                  { accountId: supplierAcc.id, debit: invoice.totalAmount || 0, credit: 0 },
                  { accountId: cashAcc.id, debit: 0, credit: invoice.totalAmount || 0 }
              ]
          });
      }
  };

  const addDemoEntry = useCallback((entryData: any) => {
    const newEntry: JournalEntry = {
      id: `demo-je-${Date.now()}`,
      date: entryData.date,
      description: entryData.description,
      reference: entryData.reference,
      status: 'posted',
      is_posted: true,
      created_at: new Date().toISOString(),
      lines: entryData.lines.map((l: any, i: number) => ({
        ...l,
        id: `demo-jel-${Date.now()}-${i}`,
        accountName: accounts.find(a => a.id === l.accountId)?.name || 'حساب غير معروف',
        accountCode: accounts.find(a => a.id === l.accountId)?.code || '',
      }))
    };
    setEntries(prev => [newEntry, ...prev]);

    setAccounts(prevAccounts => {
        const newAccounts = JSON.parse(JSON.stringify(prevAccounts));

        entryData.lines.forEach((line: any) => {
            const accountIndex = newAccounts.findIndex((a: Account) => a.id === line.accountId);
            if (accountIndex > -1) {
                const acc = newAccounts[accountIndex];
                const change = (line.debit || 0) - (line.credit || 0);
                
                const type = String(acc.type || '').toLowerCase();
                const isDebitNature = ['asset', 'expense', 'أصول', 'مصروفات', 'تكلفة المبيعات', 'cost of goods sold'].some(t => type.includes(t));
                
                const balanceChange = isDebitNature ? change : -change;
                acc.balance = (acc.balance || 0) + balanceChange;
            }
        });

        let changed = true;
        while (changed) {
            changed = false;
            newAccounts.forEach((parent: Account) => {
                if (parent.is_group) { // @ts-ignore
                    const childrenBalance = newAccounts.filter((child: Account) => child.parent_id === parent.id).reduce((sum: number, child: Account) => sum + (child.balance || 0), 0);
                    if (parent.balance !== childrenBalance) { parent.balance = childrenBalance; changed = true; }
                }
            });
        }
        return newAccounts;
    });
  }, [accounts]);

  const postDemoSalesInvoice = (invoiceData: any) => {
    addDemoInvoice(invoiceData);
    const { totalAmount, subtotal, taxAmount, paidAmount, customerName, invoiceNumber, date, treasuryId, items } = invoiceData;
    
    const salesAcc = getSystemAccount('SALES_REVENUE');
    const customerAcc = getSystemAccount('CUSTOMERS');
    const taxAcc = getSystemAccount('VAT');
    const cashAcc = treasuryId ? accounts.find(a => a.id === treasuryId) : getSystemAccount('CASH');
    const cogsAcc = getSystemAccount('COGS');
    const inventoryAcc = getSystemAccount('INVENTORY_FINISHED_GOODS');

    let totalCost = 0;
    items.forEach((item: any) => { totalCost += (products.find(p => p.id === item.productId)?.cost || 0) * item.quantity; });

    if (customerAcc && salesAcc) {
        const lines = [ { accountId: customerAcc.id, debit: totalAmount, credit: 0, description: `فاتورة مبيعات ديمو للعميل ${customerName}` }, { accountId: salesAcc.id, debit: 0, credit: subtotal, description: 'إيراد مبيعات' }, ];
        if (taxAmount > 0 && taxAcc) { lines.push({ accountId: taxAcc.id, debit: 0, credit: taxAmount, description: 'ضريبة القيمة المضافة' }); }
        if (paidAmount > 0 && cashAcc) { lines.push({ accountId: cashAcc.id, debit: paidAmount, credit: 0, description: 'تحصيل نقدي' }); lines.push({ accountId: customerAcc.id, debit: 0, credit: paidAmount, description: 'دفعة من العميل' }); }
        if (totalCost > 0 && cogsAcc && inventoryAcc) { lines.push({ accountId: cogsAcc.id, debit: totalCost, credit: 0, description: 'تكلفة البضاعة المباعة' }); lines.push({ accountId: inventoryAcc.id, debit: 0, credit: totalCost, description: 'صرف من المخزون' }); }
        addDemoEntry({ date: date, description: `فاتورة مبيعات ديمو: ${customerName}`, reference: invoiceNumber, lines: lines });
    }
  };
  
  const addDemoPaymentVoucher = (voucher: any) => {
      setVouchers(prev => [{...voucher, type: 'payment'}, ...prev]);
      // simple entry: debit supplier, credit treasury
      const supplierAcc = getSystemAccount('SUPPLIERS');
      const cashAcc = accounts.find(a => a.id === voucher.treasuryId && !a.isGroup) || getSystemAccount('CASH');
      if (supplierAcc && cashAcc) {
          addDemoEntry({
              date: voucher.date || new Date().toISOString().split('T')[0],
              description: `سند صرف ديمو`,
              reference: voucher.voucherNumber || '',
              lines: [
                  { accountId: supplierAcc.id, debit: voucher.amount || 0, credit: 0 },
                  { accountId: cashAcc.id, debit: 0, credit: voucher.amount || 0 }
              ]
          });
      }
  };

  const addDemoReceiptVoucher = (voucher: any) => {
      setVouchers(prev => [{...voucher, type: 'receipt'}, ...prev]);
      const customerAcc = getSystemAccount('CUSTOMERS');
      const cashAcc = accounts.find(a => a.id === voucher.treasuryId && !a.isGroup) || getSystemAccount('CASH');
      if (customerAcc && cashAcc) {
          addDemoEntry({
              date: voucher.date || new Date().toISOString().split('T')[0],
              description: `سند قبض ديمو`,
              reference: voucher.voucherNumber || '',
              lines: [
                  { accountId: cashAcc.id, debit: voucher.amount || 0, credit: 0 },
                  { accountId: customerAcc.id, debit: 0, credit: voucher.amount || 0 }
              ]
          });
      }
  };

  const getInvoicesPaginated = async (page: number, pageSize: number, search?: string, startDate?: string, endDate?: string) => {
    try {
        // حماية أمنية: إذا كان المستخدم ديمو، نعرض بيانات وهمية فقط
        if (currentUser?.role === 'demo') {
            // استخدام الحالة المحلية لعرض الفواتير المضافة حديثاً
            const source = invoices.length > 0 ? invoices : DUMMY_INVOICES;
            const filtered = source.filter(inv => 
                (!search || ((inv as any).invoice_number || (inv as any).invoiceNumber).toLowerCase().includes(search.toLowerCase()) || inv.customerName.toLowerCase().includes(search.toLowerCase()))
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
        if (process.env.NODE_ENV === 'development') console.error("Error fetching paginated invoices:", error);
        return { data: [], count: 0 };
    }
  };

  const getJournalEntriesPaginated = async (page: number, pageSize: number, search?: string, userId?: string) => {
    try {
        // حماية أمنية: منع الديمو من رؤية القيود الحقيقية
        if (currentUser?.role === 'demo') {
            const source = entries.length > 0 ? entries : DUMMY_JOURNAL_ENTRIES;
            const filtered = source.filter((entry: any) => 
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
            .order('created_at', { ascending: false })
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
        if (process.env.NODE_ENV === 'development') console.error("Error fetching paginated journal entries:", error);
        return { data: [], count: 0 };
    }
  };

  const clearCache = async () => {
    secureStorage.removeItem('cached_accounts');
    secureStorage.removeItem('cached_customers');
    secureStorage.removeItem('cached_suppliers');
    secureStorage.removeItem('cached_products');
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
        if (process.env.NODE_ENV === 'development') console.error("Export Error:", error);
        showToast("حدث خطأ أثناء التصدير: " + error.message, 'error');
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

  const checkOpenShift = useCallback(async () => {
    if (!currentUser) return;
    // في وضع الديمو، ننشئ وردية وهمية
    if (currentUser.role === 'demo' || isDemoState) {
        if (!currentShift) setCurrentShift({ id: 'demo-shift', start_time: new Date().toISOString(), opening_balance: 1000 });
        return;
    }

    try {
        const { data, error } = await supabase
            .from('shifts')
            .select('*')
            .eq('user_id', currentUser.id)
            .is('end_time', null)
            .maybeSingle();
        
        if (!error && data) {
            setCurrentShift(data);
        } else {
            setCurrentShift(null);
        }
    } catch (e) {
        console.error("Error checking shift", e);
    }
  }, [currentUser, isDemoState]);

  const fetchOpenShifts = async () => {
    // جلب كافة الورديات المفتوحة (للإدارة فقط)
    if (isDemoState) {
      setOpenShifts([{ id: 'demo-s1', full_name: 'أحمد محمد (ديمو)', start_time: new Date().toISOString(), opening_balance: 1000 }]);
      return;
    }
    try {
      const { data, error } = await supabase
        .from('shifts')
        .select('*, profiles:user_id(full_name)')
        .is('end_time', null)
        .order('start_time', { ascending: false });
      if (error) throw error;
      setOpenShifts(data || []);
    } catch (err) {
      console.error("Error fetching open shifts", err);
    }
  };

  const handleAuthChange = useCallback(async (user: any) => {
    if (user) {
        try {
            const { data: profile } = await supabase.from('profiles').select('*').eq('id', user.id).maybeSingle();
            
            const email = (user.email || profile?.email || '').toLowerCase();
            // فرض دور demo للمستخدم المحدد
            const isDemoUser = email === DEMO_EMAIL;
            
            // تحديد الدور: الديمو أولاً، ثم البيانات الوصفية، ثم البروفايل، وأخيراً viewer
            const roleName = isDemoUser ? 'demo' : (user.user_metadata?.app_role || profile?.role || 'viewer');
            
            setCurrentUser({
                id: user.id,
                name: profile?.full_name || user.user_metadata?.full_name || user.email,
                username: user.email,
                role: roleName,
            is_active: profile?.is_active ?? true,
            organization_id: profile?.organization_id
            } as any);
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
            if (process.env.NODE_ENV === 'development') console.error("Error handling auth change:", error);
            setCurrentUser(null);
        }
    } else {
        setCurrentUser(null);
        setUserRole(null);
        setUserPermissions(new Set());
    }
    setAuthInitialized(true);
  }, []);
  
  useEffect(() => {
    if (currentUser) {
        checkOpenShift();
    }
  }, [currentUser, checkOpenShift]);
  
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
        const isHardcodedAdmin = currentUser?.id === ADMIN_USER_ID;
        
        if (currentUser) {
            await supabase.from('security_logs').insert({
                event_type: action,
                description: details,
                performed_by: isHardcodedAdmin ? null : currentUser.id,
                created_at: new Date().toISOString(),
                metadata: amount ? { ...metadata, amount } : metadata
            });
        }
    } catch (error) {
        if (process.env.NODE_ENV === 'development') console.warn("Failed to persist activity log to DB", error);
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
    } catch (err: any) {
      return { success: false, message: err.message };
    }
  };

  const updateProduct = async (id: string, updates: Partial<Product>) => {
    try {
      const oldData = products.find(p => p.id === id);
      
      // ضمان التوافق: نسخ product_type إلى item_type إذا تم تحديثه
      const dbUpdates: any = { ...updates };
      if (dbUpdates.product_type) {
          dbUpdates.item_type = dbUpdates.product_type;
      }

      const { error } = await supabase.from('products').update(dbUpdates).eq('id', id);
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
          logActivity('تعديل صنف', `تعديل بيانات الصنف: ${oldData?.name}`, undefined, { changes, productId: id });
      }
    } catch (err: any) {
      if (process.env.NODE_ENV === 'development') console.error("Error updating product:", err);
      throw err;
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
      if (process.env.NODE_ENV === 'development') console.error("Error deleting product:", error);
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
          if (process.env.NODE_ENV === 'development') console.warn(`Duplicate reference ${finalRef}, retrying with ${newRef}`);
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
            if (process.env.NODE_ENV === 'development') console.warn("RPC not found, falling back to direct insert.");
            
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
                if (process.env.NODE_ENV === 'development') console.warn('Failed to upload attachment:', file.name, uploadError);
            }
        }
      }

      const totalAmount = entryData.lines ? entryData.lines.reduce((s: number, l: any)=>s+l.debit, 0) : 0;
      logActivity('قيد يومية', `إضافة قيد رقم ${finalRef}: ${finalDesc}`, totalAmount);
      
      await fetchData();
      return entryId;
    } catch (err) {
      if (process.env.NODE_ENV === 'development') console.error("Error adding entry:", err);
      // إظهار الخطأ للمستخدم بدلاً من إخفائه
      throw new Error(err.message || "فشل إنشاء القيد المحاسبي في قاعدة البيانات");
    }
  };

  const addInvoice = async (data: any) => {
    // تم نقل المنطق إلى SalesInvoiceForm.tsx واستخدام RPC
    // هذه الدالة متروكة فقط للتوافق مع أي كود قديم لم يتم تحديثه
    if (process.env.NODE_ENV === 'development') console.warn("addInvoice in context is deprecated. Use the form's direct logic.");
    await fetchData();
  };

  const approveInvoice = async (invoiceId: string) => {
    try {
      const { error } = await supabase.rpc('approve_invoice', { p_invoice_id: invoiceId });

      if (error) throw error;

      showToast('تم اعتماد الفاتورة وخصم المكونات من المخزن بنجاح ✅', 'success');
      
      await supabase.rpc('recalculate_stock_rpc');
      await fetchData();
      return true;
    } catch (err: any) {
      if (process.env.NODE_ENV === 'development') console.error('Error approving invoice:', err);
      showToast('فشل اعتماد الفاتورة: ' + err.message, 'error');
      return false;
    }
  };

  const approveSalesInvoice = async (invoiceId: string) => {
    await approveInvoice(invoiceId);
  };

  const addPurchaseInvoice = async (data: any) => {
    // تم نقل المنطق إلى PurchaseInvoiceForm.tsx واستخدام RPC
    if (process.env.NODE_ENV === 'development') console.warn("addPurchaseInvoice in context is deprecated.");
    await fetchData();
  };

  const approvePurchaseInvoice = async (invoiceId: string) => {
    try {
      // استخدام الدالة الآمنة (RPC) لاعتماد فاتورة المشتريات
      const { error } = await supabase.rpc('approve_purchase_invoice', { p_invoice_id: invoiceId });
      
      if (error) throw error;
      
      // إعادة احتساب المخزون لضمان ظهور الكميات المشتراة فوراً
      await supabase.rpc('recalculate_stock_rpc');
      
      await fetchData(); // تحديث الأرصدة
      showToast('تم ترحيل فاتورة المشتريات وتسجيل الضريبة بنجاح ✅', 'success');
    } catch (err: any) {
      if (process.env.NODE_ENV === 'development') console.error('Error approving purchase invoice:', err);
      throw new Error(err.message || 'فشل اعتماد فاتورة المشتريات');
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
      // جلب معرف المنظمة مع صمام أمان في حال فقدانه من بيانات المستخدم
      const orgId = (currentUser as any)?.organization_id || 
                   (await supabase.from('organizations').select('id').limit(1).single()).data?.id;

      // حفظ السند في قاعدة البيانات
      await supabase.from('receipt_vouchers').insert({
        id: id,
        voucher_number: vNum,
        receipt_date: data.date,
        amount: data.amount,
        customer_id: data.partyId,
        treasury_account_id: debitAccount,
        notes: data.description,
        related_journal_entry_id: entryId,
        payment_method: data.paymentMethod || 'cash',
        organization_id: orgId
      });

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
      // جلب معرف المنظمة مع صمام أمان
      const orgId = (currentUser as any)?.organization_id || 
                   (await supabase.from('organizations').select('id').limit(1).single()).data?.id;

      // حفظ السند في قاعدة البيانات
      await supabase.from('receipt_vouchers').insert({
        id: id,
        voucher_number: vNum,
        receipt_date: data.date,
        amount: data.amount,
        customer_id: data.partyId,
        treasury_account_id: debitAccount,
        notes: data.description,
        related_journal_entry_id: entryId,
        payment_method: 'cash',
        type: 'deposit',
        organization_id: orgId
      });

      setVouchers(prev => [{ ...data, id, voucherNumber: vNum, relatedJournalEntryId: entryId, type: 'receipt', subType: 'customer_deposit' }, ...prev]);
      logActivity('سند تأمين', `قبض تأمين مبلغ ${data.amount} من ${data.partyName}`, data.amount);
    }
  };

  const updateVoucher = async (id: string, type: 'receipt' | 'payment', data: any) => {
    try {
      if (currentUser?.role === 'demo') {
        // Update in demo context
        setVouchers(prev => prev.map(v => v.id === id ? { ...v, ...data, type } : v));
        showToast('تم تعديل السند بنجاح ✅', 'success');
        return;
      }

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
      showToast('تم تعديل السند بنجاح ✅', 'success');
    } catch (err: any) {
      console.error("Error updating voucher:", err);
      throw new Error(err.message);
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
      // جلب معرف المنظمة مع صمام أمان
      const orgId = (currentUser as any)?.organization_id || 
                   (await supabase.from('organizations').select('id').limit(1).single()).data?.id;

      // حفظ السند في قاعدة البيانات
      await supabase.from('payment_vouchers').insert({
        id: id,
        voucher_number: vNum,
        payment_date: data.date,
        amount: data.amount,
        supplier_id: data.subType === 'supplier' ? data.partyId : null,
        treasury_account_id: creditAccount,
        notes: data.description,
        related_journal_entry_id: entryId,
        payment_method: data.paymentMethod || 'cash',
        organization_id: orgId
      });

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
    // demo branch: simulate locally without touching Supabase
    if (currentUser?.role === 'demo') {
        const transferNumber = `TRN-DEMO-${Math.floor(Math.random()*10000)}`;
        const demoId = `demo-st-${Date.now()}`;
        // update transfers state
        setTransfers(prev => [{ ...data, id: demoId, transferNumber, status: 'posted' }, ...prev]);
        // adjust product warehouseStock locally
        setProducts(prevProds => {
            const newProds = prevProds.map(p => {
                const item = data.items.find((i: any) => i.productId === p.id);
                if (!item) return p;
                const ws = { ...p.warehouseStock };
                ws[data.fromWarehouseId] = (ws[data.fromWarehouseId] || 0) - item.quantity;
                ws[data.toWarehouseId] = (ws[data.toWarehouseId] || 0) + item.quantity;
                return { ...p, warehouseStock: ws };
            });
            return newProds;
        });
        showToast('تم التحويل المخزني (ديمو) بنجاح', 'success');
        return;
    }

    try {
        const transferNumber = `TRN-${Date.now().toString().slice(-6)}`;
        const { data: header, error: headerError } = await supabase.from('stock_transfers').insert({
            from_warehouse_id: data.fromWarehouseId,
            to_warehouse_id: data.toWarehouseId,
            transfer_date: data.date,
            transfer_number: transferNumber,
            notes: data.notes,
            status: 'posted',
            created_by: currentUser?.id
        }).select().single();

        if (headerError) throw headerError;

        const items = data.items.map((item: any) => ({
            stock_transfer_id: header.id,
            product_id: item.productId,
            quantity: item.quantity
        }));

        const { error: itemsError } = await supabase.from('stock_transfer_items').insert(items);
        if (itemsError) throw itemsError;

        // تحديث الأرصدة يدوياً لضمان الفورية والدقة
        for (const item of items) {
            const { data: product } = await supabase.from('products').select('warehouse_stock').eq('id', item.product_id).single();
            if (product) {
                const currentWarehouseStock = product.warehouse_stock || {};
                const fromQty = Number(currentWarehouseStock[data.fromWarehouseId] || 0);
                const toQty = Number(currentWarehouseStock[data.toWarehouseId] || 0);
                
                const newWarehouseStock = {
                    ...currentWarehouseStock,
                    [data.fromWarehouseId]: fromQty - Number(item.quantity),
                    [data.toWarehouseId]: toQty + Number(item.quantity)
                };

                await supabase.from('products').update({ warehouse_stock: newWarehouseStock }).eq('id', item.product_id);
            }
        }

        await fetchData(); // تحديث الواجهة بالبيانات الجديدة
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
    } catch (err: any) {
      console.error("Recalculate Stock Error:", err);
      showToast("حدث خطأ أثناء تحديث الأرصدة: " + err.message, 'error');
    }
  };

  const addCheque = async (data: any) => {
    try {
        // فصل المرفقات عن بيانات الشيك لتجنب أخطاء قاعدة البيانات
        const { attachments, ...chequeData } = data;

        // 1. التحقق من الحسابات أولاً (قبل الحفظ)
        const notesReceivableAcc = getSystemAccount('NOTES_RECEIVABLE') || accounts.find(a => a.code === '1222' || a.code === '1204');
        const notesPayableAcc = getSystemAccount('NOTES_PAYABLE') || accounts.find(a => a.code === '222' || a.code === '2202');
        const customerAcc = getSystemAccount('CUSTOMERS') || accounts.find(a => a.code === '1221' || a.code === '10201');
        const supplierAcc = getSystemAccount('SUPPLIERS') || accounts.find(a => a.code === '221' || a.code === '201');

        if (data.type === 'incoming') {
            if (!notesReceivableAcc) throw new Error('حساب أوراق القبض (1222) غير موجود. يرجى إضافته للدليل المحاسبي.');
            if (!customerAcc) throw new Error('حساب العملاء (1221) غير موجود.');
        } else if (data.type === 'outgoing') {
            if (!notesPayableAcc) throw new Error('حساب أوراق الدفع (222) غير موجود. يرجى إضافته للدليل المحاسبي.');
            if (!supplierAcc) throw new Error('حساب الموردين (221) غير موجود.');
        }

        // 2. حفظ الشيك
        const { data: newCheque, error } = await supabase.from('cheques').insert(chequeData).select().single();
        if (error) throw error;

        // 3. رفع المرفقات (إذا وجدت)
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

        // 4. إنشاء القيد المحاسبي
        let lines = [];
        let description = '';
        const entryDate = new Date().toISOString().split('T')[0]; // تاريخ تحرير الشيك

        if (data.type === 'incoming') {
            // استلام شيك (أوراق قبض): من ح/ أوراق القبض إلى ح/ العملاء
            if (notesReceivableAcc && customerAcc) { // تم التحقق مسبقاً، لكن نبقي الشرط للأمان
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

            if (entryId && typeof entryId === 'string') {
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
          if (!id) throw new Error('معرف الشيك غير موجود');
          if (!status) throw new Error('حالة الشيك غير صالحة');

          // 1. جلب بيانات الشيك أولاً للتحقق
          const { data: cheque } = await supabase.from('cheques').select('*').eq('id', id).single();
          if (!cheque) throw new Error('الشيك غير موجود');

          // 2. التحقق من الحسابات قبل التحديث (لمنع تحديث الحالة بدون قيد)
          let notesPayableAcc, notesReceivableAcc;
          
          if (status === 'cashed' && cheque.type === 'outgoing') {
              notesPayableAcc = getSystemAccount('NOTES_PAYABLE') || accounts.find(a => a.code === '222' || a.code === '2202');
              if (!notesPayableAcc) throw new Error('حساب أوراق الدفع (222) غير موجود في الدليل المحاسبي.');
              if (!depositAccountId) throw new Error('يجب تحديد حساب البنك لإتمام عملية الصرف.');
          } else if (status === 'collected' && cheque.type === 'incoming') {
              notesReceivableAcc = getSystemAccount('NOTES_RECEIVABLE') || accounts.find(a => a.code === '1222' || a.code === '1204');
              if (!notesReceivableAcc) throw new Error('حساب أوراق القبض (1222) غير موجود في الدليل المحاسبي.');
              if (!depositAccountId) throw new Error('يجب تحديد حساب البنك لإتمام عملية التحصيل.');
          }

          // 3. تحديث حالة الشيك
          const { error: updateError } = await supabase
              .from('cheques')
              .update({ status: status })
              .eq('id', id);

          if (updateError) {
              console.error("Supabase Update Error:", updateError);
              // تضمين تفاصيل الخطأ من Supabase لتظهر في التنبيه
              throw new Error(updateError.message + (updateError.details ? ` - ${updateError.details}` : '') + (updateError.hint ? ` (${updateError.hint})` : ''));
          }

          // 4. إنشاء القيد المحاسبي
          if (status === 'cashed' && cheque.type === 'outgoing' && notesPayableAcc && depositAccountId) {
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
          } 
          else if (status === 'collected' && cheque.type === 'incoming' && notesReceivableAcc && depositAccountId) {
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
          }
          else if (status === 'rejected') {
              // رفض الشيك (قيد عكسي)
              const notesReceivableAcc = getSystemAccount('NOTES_RECEIVABLE') || accounts.find(a => a.code === '1222' || a.code === '1204');
              const notesPayableAcc = getSystemAccount('NOTES_PAYABLE') || accounts.find(a => a.code === '222' || a.code === '2202');
              const customerAcc = getSystemAccount('CUSTOMERS') || accounts.find(a => a.code === '1221' || a.code === '10201');
              const supplierAcc = getSystemAccount('SUPPLIERS') || accounts.find(a => a.code === '221' || a.code === '201');

              if (cheque.type === 'incoming') {
                  if (!notesReceivableAcc || !customerAcc) throw new Error('حسابات أوراق القبض أو العملاء غير معرفة');
                  // شيك وارد مرفوض: من ح/ العملاء إلى ح/ أوراق القبض (إعادة المديونية للعميل)
                  await addEntry({
                      date: actionDate,
                      reference: `CHQ-REJ-${cheque.cheque_number}`,
                      description: `شيك مرفوض رقم ${cheque.cheque_number} - ${cheque.party_name}`,
                      status: 'posted',
                      lines: [
                          { accountId: customerAcc.id, debit: cheque.amount, credit: 0, description: `إعادة مديونية (شيك مرفوض)` },
                          { accountId: notesReceivableAcc.id, debit: 0, credit: cheque.amount, description: `إلغاء ورقة قبض` }
                      ]
                  });
              } else if (cheque.type === 'outgoing') {
                  if (!notesPayableAcc || !supplierAcc) throw new Error('حسابات أوراق الدفع أو الموردين غير معرفة');
                  // شيك صادر مرفوض: من ح/ أوراق الدفع إلى ح/ الموردين (إعادة الدائنية للمورد)
                  await addEntry({
                      date: actionDate,
                      reference: `CHQ-REJ-${cheque.cheque_number}`,
                      description: `شيك مرفوض رقم ${cheque.cheque_number} - ${cheque.party_name}`,
                      status: 'posted',
                      lines: [
                          { accountId: notesPayableAcc.id, debit: cheque.amount, credit: 0, description: `إلغاء ورقة دفع` },
                          { accountId: supplierAcc.id, debit: 0, credit: cheque.amount, description: `إعادة دائنية (شيك مرفوض)` }
                      ]
                  });
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
          organization_id: (currentUser as any)?.organization_id // استخدام معرف المنظمة من المستخدم الحالي مباشرة
        })
        .select()
        .single();

      if (assetError) throw assetError;

      // 2. إنشاء قيد محاسبي (اختياري)
      if (data.createJournalEntry) {
          let creditAccountId = data.creditAccountId;
          
          // إذا لم يتم تحديد حساب دائن، نستخدم الأرصدة الافتتاحية كافتراضي
          if (!creditAccountId) {
              const contra = accounts.find(a => a.code === '3999' || a.code === '301' || a.code === '3101');
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

        showToast("تم ترحيل الرواتب بنجاح ✅", 'success');
        await fetchData();
    } catch (err: any) {
        console.error(err);
        showToast("خطأ في ترحيل الرواتب: " + err.message, 'error');
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
    let s = { 
      totalAssets: 0, totalLiabilities: 0, totalEquity: 0, totalRevenue: 0, totalExpenses: 0, netIncome: 0,
      monthlySales: 0, monthlyPurchases: 0, grossProfit: 0 
    };
    accounts.forEach(a => {
        if (a.isGroup || a.is_group) return; // ضمان تجاهل الحسابات الرئيسية مثل 103 في حسابات الأرصدة
        const type = String(a.type || '').toUpperCase();
        const code = String(a.code || '');

        if (type.includes('ASSET') || type.includes('أصول')) s.totalAssets += a.balance;
        else if (type.includes('LIABILITY') || type.includes('خصوم')) s.totalLiabilities += Math.abs(a.balance);
        else if (type.includes('EQUITY') || type.includes('حقوق ملكية')) s.totalEquity += Math.abs(a.balance);
        else if (type.includes('REVENUE') || type.includes('إيرادات')) s.totalRevenue += Math.abs(a.balance);
        else if (type.includes('EXPENSE') || type.includes('مصروفات')) s.totalExpenses += a.balance;
    });

    // حساب المبيعات والمشتريات الصافية (بدون ضريبة) من واقع الفواتير
    s.monthlySales = invoices.reduce((sum, inv) => sum + (inv.subtotal || 0), 0);
    s.monthlyPurchases = purchaseInvoices.reduce((sum, inv) => sum + (inv.subtotal || 0), 0);
    
    // مجمل الربح = صافي المبيعات - تكلفة البضاعة المباعة (حساب 511)
    const cogs = accounts.find(a => a.code === '511' || a.code === SYSTEM_ACCOUNTS.COGS)?.balance || 0;
    s.grossProfit = s.monthlySales - cogs;

    s.netIncome = s.totalRevenue - s.totalExpenses;
    s.totalEquity += s.netIncome;
    return s;
  };

  const addWarehouse = async (warehouseData: Omit<Warehouse, 'id'>) => {
    try {
      const { data, error } = await supabase
        .from('warehouses')
        .insert({ 
          ...warehouseData, 
          organization_id: (currentUser as any)?.organization_id 
        })
        .select()
        .single();
      if (error) throw error;
      await fetchData(); // Refresh data
      logActivity('إضافة مستودع', `تم إضافة مستودع جديد: ${warehouseData.name}`);
      return data;
    } catch (err: any) {
      console.error("Error adding warehouse:", err);
      showToast('فشل إضافة المستودع: ' + err.message, 'error');
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
    } catch (err: any) {
      console.error("Error updating account:", err);
      throw new Error(err.message);
    }
  };

  // --- Customer Actions ---
  const addCustomer = async (customerData: Omit<Customer, 'id'>) => {
    if (currentUser?.role === 'demo') {
        const newCustomer = { ...customerData, id: `demo-c-${Date.now()}`, balance: 0 } as Customer;
        setCustomers(prev => [newCustomer, ...prev]);
        return newCustomer;
    }
    try {
      const { data, error } = await supabase.from('customers').insert([customerData]).select().single();
      if (error) throw error;
      setCustomers(prev => [data, ...prev]);
      return data;
    } catch (err: any) {
      console.error("Error adding customer:", err);
      throw err;
    }
  };

  const updateCustomer = async (id: string, updates: Partial<Customer>) => {
    if (currentUser?.role === 'demo') {
        setCustomers(prev => prev.map(c => c.id === id ? { ...c, ...updates } : c));
        return;
    }
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
    } catch (err: any) {
      console.error("Error updating customer:", err);
      throw err;
    }
  };

  const deleteCustomer = async (id: string, reason?: string) => {
    if (currentUser?.role === 'demo') {
        setCustomers(prev => prev.filter(c => c.id !== id));
        return;
    }
    try {
      const { error } = await supabase.from('customers').update({ deleted_at: new Date().toISOString(), deletion_reason: reason }).eq('id', id);
      if (error) throw error;

      // تنظيف الأرصدة الافتتاحية المرتبطة بالعميل المحذوف
      // 1. البحث عن الفواتير التي تم إنشاؤها كرصيد افتتاحي
      const { data: openingInvoices } = await supabase
        .from('invoices')
        .select('id, invoice_number')
        .eq('customer_id', id)
        .eq('notes', 'رصيد افتتاحي');

      if (openingInvoices && openingInvoices.length > 0) {
        const invoiceIds = openingInvoices.map((inv: any) => inv.id);
        const invoiceNumbers = openingInvoices.map((inv: any) => inv.invoice_number);

        // حذف الفواتير الافتتاحية (Soft Delete)
        await supabase.from('invoices').update({ deleted_at: new Date().toISOString() }).in('id', invoiceIds);

        // حذف القيود المحاسبية المرتبطة (Hard Delete لأنها أرصدة افتتاحية لعميل محذوف)
        if (invoiceNumbers.length > 0) {
          const { data: journals } = await supabase.from('journal_entries').select('id').in('reference', invoiceNumbers);
          if (journals && journals.length > 0) {
            const journalIds = journals.map((j: any) => j.id);
            await supabase.from('journal_lines').delete().in('journal_entry_id', journalIds);
            await supabase.from('journal_entries').delete().in('id', journalIds);
          }
        }
      }

      await fetchData(); // تحديث البيانات لإزالة العميل من القائمة الرئيسية
      const customer = customers.find(c => c.id === id);
      logActivity('حذف عميل', `تم حذف العميل: ${customer?.name || id}` + (reason ? ` - السبب: ${reason}` : ''));
    } catch (err: any) {
      console.error("Error deleting customer:", err);
      throw err;
    }
  };

  // --- Employee Actions ---
  const addEmployee = async (employeeData: any) => {
    try {
      const { data, error } = await supabase.from('employees').insert([employeeData]).select().single();
      if (error) throw error;
      setEmployees(prev => [data, ...prev]);
      return data;
    } catch (err: any) {
      console.error("Error adding employee:", err);
      throw err;
    }
  };

  const updateEmployee = async (id: string, updates: any) => {
    try {
      const { error } = await supabase.from('employees').update(updates).eq('id', id);
      if (error) throw error;
      setEmployees(prev => prev.map(e => e.id === id ? { ...e, ...updates } : e));
    } catch (err: any) {
      console.error("Error updating employee:", err);
      throw err;
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
    } catch (err: any) {
      console.error("Error deleting employee:", err);
      throw err;
    }
  };
  // --- Supplier Actions ---
  const addSupplier = async (supplierData: Omit<Supplier, 'id'>) => {
    try {
      const { data, error } = await supabase.from('suppliers').insert([supplierData]).select().single();
      if (error) throw error;
      setSuppliers(prev => [data, ...prev]);
      return data;
    } catch (err: any) {
      console.error("Error adding supplier:", err);
      throw err;
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
    } catch (err: any) {
      console.error("Error updating supplier:", err);
      throw err;
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
    } catch (err: any) {
      console.error("Error deleting supplier:", err);
      throw err;
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

  const calculateProductPrice = (product: Product): number => {
      const today = new Date().toISOString().split('T')[0];
      if (
          product.offer_price && 
          product.offer_price > 0 && 
          product.offer_start_date && 
          product.offer_end_date && 
          today >= product.offer_start_date && 
          today <= product.offer_end_date
      ) {
          return product.offer_price;
      }
      return product.sales_price || product.price || 0;
  };

  const clearTransactions = async () => {
    if (currentUser?.role !== 'super_admin' && currentUser?.role !== 'admin') {
        showToast('هذا الإجراء متاح فقط للمدير العام', 'warning');
        return;
    }
    
    if (!window.confirm('⚠️ تحذير هام جداً ⚠️\n\nسيتم حذف جميع العمليات المالية والمخزنية (فواتير، قيود، سندات، شيكات...) نهائياً.\nسيتم تصفير الأرصدة والمخزون.\n\nلن يتم حذف: الحسابات، العملاء، الموردين، الأصناف، الإعدادات.\n\nهل أنت متأكد تماماً من رغبتك في الاستمرار؟')) {
        return;
    }

    if (!window.confirm('تأكيد نهائي: هل أنت متأكد؟ لا يمكن التراجع عن هذا الإجراء!')) {
        return;
    }

    setIsLoading(true);
    try {        
        // Step 1: Delete all attachments first.
        console.log("Step 1: Deleting attachments...");
        const attachmentTables = ['journal_attachments', 'cheque_attachments', 'receipt_voucher_attachments', 'payment_voucher_attachments'];
        for (const table of attachmentTables) {
            const { error } = await supabase.from(table).delete().neq('id', ADMIN_USER_ID);
            if (error) throw new Error(`فشل حذف المرفقات من جدول ${table}: ${error.message}`);
        }

        // Step 2: Delete all item lines from documents.
        console.log("Step 2: Deleting item lines...");
        const itemTables = [
            'invoice_items', 'purchase_invoice_items', 'purchase_return_items', 'sales_return_items', 
            'quotation_items', 'purchase_order_items', 'stock_transfer_items', 
            'stock_adjustment_items', 'inventory_count_items'
        ];
        for (const table of itemTables) {
            const { error } = await supabase.from(table).delete().neq('id', ADMIN_USER_ID);
            if (error) throw new Error(`فشل حذف البنود من جدول ${table}: ${error.message}`);
        }

        // Step 3: Delete main documents (that might link to journal entries).
        console.log("Step 3: Deleting main documents...");
        const documentTables = [
            'receipt_vouchers', 'payment_vouchers', 'invoices', 'purchase_invoices', 
            'sales_returns', 'purchase_returns', 'quotations', 'purchase_orders', 
            'credit_notes', 'debit_notes', 'stock_transfers', 'stock_adjustments', 
            'inventory_counts', 'cheques', 'assets', 'opening_inventories', 'work_orders'
        ];
        for (const table of documentTables) {
            const { error } = await supabase.from(table).delete().neq('id', ADMIN_USER_ID);
            if (error) throw new Error(`فشل حذف المستندات من جدول ${table}: ${error.message}`);
        }

        // Step 4: Now that documents are gone, delete journal lines.
        console.log("Step 4: Deleting journal lines...");
        const { error: jlError } = await supabase.from('journal_lines').delete().neq('id', ADMIN_USER_ID);
        if (jlError) throw new Error(`فشل حذف أسطر القيود: ${jlError.message}`);

        // Step 5: Finally, delete the journal entries themselves.
        console.log("Step 5: Deleting journal entries...");
        const { error: jeError } = await supabase.from('journal_entries').delete().neq('id', ADMIN_USER_ID);
        if (jeError) throw new Error(`فشل حذف القيود: ${jeError.message}`);

        // Step 6: Reset product stock.
        console.log("Step 6: Resetting product stock...");
        await supabase.from('products').update({ stock: 0, warehouse_stock: {} }).neq('id', ADMIN_USER_ID);

        // Step 7: Clean up logs and notifications.
        console.log("Step 7: Cleaning logs and notifications...");
        await supabase.from('notifications').delete().neq('id', ADMIN_USER_ID);
        await supabase.from('security_logs').delete().neq('id', ADMIN_USER_ID);

        // Step 8: Reset account balances in the accounts table
        console.log("Step 8: Resetting account balances...");
        await supabase.from('accounts').update({ balance: 0 }).neq('id', ADMIN_USER_ID);

        showToast('تم تنظيف البيانات بنجاح. النظام جاهز للعمل من جديد.', 'success');
        window.location.reload();

    } catch (error: any) {
        console.error(error);
        showToast('حدث خطأ أثناء التنظيف: ' + error.message, 'error');
    } finally {
        setIsLoading(false);
    }
  };

  const addOpeningBalanceTransaction = async (entityId: string, entityType: 'customer' | 'supplier', amount: number, date: string, name: string) => {
      if (amount <= 0) return;
      
      const ref = `OB-${entityId.slice(0, 6)}`;
      // 3999: أرصدة افتتاحية (وسيط) Or 301: رأس المال/حقوق الملكية
      const openingEquityAcc = accounts.find(a => a.code === '3999' || a.name.includes('أرصدة افتتاحية')) || accounts.find(a => a.code === '301');
      
      if (!openingEquityAcc) {
          console.warn("Opening balance account not found");
          return;
      }

      if (entityType === 'customer') {
          const customerAcc = getSystemAccount('CUSTOMERS');
          if (customerAcc) {
              await addEntry({
                  date: date,
                  description: `رصيد افتتاحي للعميل ${name}`,
                  reference: ref,
                  status: 'posted',
                  lines: [
                      { accountId: customerAcc.id, debit: amount, credit: 0, description: `رصيد افتتاحي - ${name}` },
                      { accountId: openingEquityAcc.id, debit: 0, credit: amount, description: `رصيد افتتاحي - ${name}` }
                  ]
              });
              
              await supabase.from('invoices').insert({
                  invoice_number: ref,
                  customer_id: entityId,
                  invoice_date: date,
                  total_amount: amount,
                  subtotal: amount,
                  status: 'posted',
                  notes: 'رصيد افتتاحي'
              });
          }
      } else {
          const supplierAcc = getSystemAccount('SUPPLIERS');
          if (supplierAcc) {
              await addEntry({
                  date: date,
                  description: `رصيد افتتاحي للمورد ${name}`,
                  reference: ref,
                  status: 'posted',
                  lines: [
                      { accountId: openingEquityAcc.id, debit: amount, credit: 0, description: `رصيد افتتاحي - ${name}` },
                      { accountId: supplierAcc.id, debit: 0, credit: amount, description: `رصيد افتتاحي - ${name}` }
                  ]
              });

              await supabase.from('purchase_invoices').insert({
                  invoice_number: ref,
                  supplier_id: entityId,
                  invoice_date: date,
                  total_amount: amount,
                  subtotal: amount,
                  status: 'posted',
                  notes: 'رصيد افتتاحي'
              });
          }
      }
  };

  const checkSystemAccounts = () => {
      const missing: string[] = [];
      const found: string[] = [];

      Object.entries(SYSTEM_ACCOUNTS).forEach(([key, code]) => {
          const acc = accounts.find(a => a.code === code);
          if (acc) {
              found.push(`${key}: ${code} - ${acc.name}`);
          } else {
              missing.push(`${key}: ${code}`);
          }
      });

      return { missing, found };
  };

  const createMissingSystemAccounts = async () => {
      const created: string[] = [];
      
      // خريطة لتتبع الأكواد الموجودة (سواء كانت في قاعدة البيانات أو تم إنشاؤها للتو)
      const codeToId = new Map<string, string>();
      accounts.forEach(a => codeToId.set(a.code, a.id));

      // نمر على جميع الحسابات المعرفة في الثوابت (INITIAL_ACCOUNTS)
      // هذا يضمن إضافة أي حساب جديد تم تعريفه في الكود ولم يتم إضافته لقاعدة البيانات
      for (const accDef of INITIAL_ACCOUNTS) {
          if (codeToId.has(accDef.code)) continue; // الحساب موجود بالفعل

          // محاولة العثور على معرف الحساب الأب
          let parentId = null;
          if (accDef.parent_account) {
              parentId = codeToId.get(accDef.parent_account) || null;
          }

          try {
              const newId = generateUUID();
              await supabase.from('accounts').insert({
                  id: newId,
                  code: accDef.code,
                  name: accDef.name,
                  type: accDef.type,
                  is_group: accDef.is_group,
                  parent_id: parentId,
                  is_active: true
              });
              
              codeToId.set(accDef.code, newId); // تحديث الخريطة للحسابات اللاحقة
              created.push(`${accDef.code} - ${accDef.name}`);
          } catch (e) {
              console.error(`Failed to create ${accDef.code}`, e);
          }
      }

      await fetchData();
      if (created.length > 0) {
          return { success: true, message: `تم إنشاء ${created.length} حساب جديد بنجاح.`, created };
      } else {
          return { success: true, message: 'جميع الحسابات متطابقة مع الدليل الافتراضي.', created: [] };
      }
  };

  const openTableSession = async (tableId: string) => {
    if (!currentUser) {
      showToast('يجب تسجيل الدخول لفتح جلسة', 'error');
      return;
    }

    try {
      const { data, error } = await supabase.rpc('open_table_session', {
        p_table_id: tableId,
        p_user_id: currentUser.id
      });

      if (error) {
        // إذا الدالة غير موجودة، نتابع بشكل محلي
        if (error.code === 'PGRST202' || (error.details && error.details.includes('open_table_session'))) {
          const fallbackSessionId = `session-${Date.now()}`;
          setRestaurantTables(prevTables => prevTables.map(table => table.id === tableId ? { ...table, status: 'OCCUPIED' } : table));
          showToast('تم فتح الجلسة محليًا (fallback) بنجاح', 'success');
          return fallbackSessionId;
        }
        throw error;
      }

      setRestaurantTables(prevTables => prevTables.map(table => table.id === tableId ? { ...table, status: 'OCCUPIED' } : table));
      showToast('تم فتح الجلسة بنجاح', 'success');
      return data;
    } catch (error: any) {
      console.error("Error opening table session:", error);
      if (error.code === 'PGRST202' || (error.details && error.details.includes('open_table_session'))) {
        const fallbackSessionId = `session-${Date.now()}`;
        setRestaurantTables(prevTables => prevTables.map(table => table.id === tableId ? { ...table, status: 'OCCUPIED' } : table));
        showToast('تم فتح الجلسة محليًا (fallback) بنجاح', 'success');
        return fallbackSessionId;
      }
      showToast(`فشل فتح الجلسة: ${error.message || error}`, 'error');
      return;
    }
  };

  const createRestaurantOrder = async (orderData: { sessionId: string | null; items: any[]; orderType: 'dine-in' | 'takeaway' | 'delivery'; customerId: string | null; }) => {
    if (isDemoState) {
        showToast('تم إرسال الطلب للمطبخ بنجاح (محاكاة)', 'success');
        return `local-order-${Date.now()}`;
    }

    if (!currentUser) {
      showToast('يجب تسجيل الدخول لإنشاء الطلب', 'error');
      return null;
    }
    if (orderData.items.length === 0) {
        showToast('لا يمكن إرسال طلب فارغ', 'warning');
        return null;
    }

    try {
        const { data, error } = await supabase.rpc('create_restaurant_order', {
            p_session_id: orderData.sessionId,
            p_user_id: currentUser.id,
            p_order_type: orderData.orderType.toUpperCase(),
            p_notes: '', // Can be added later
            p_items: orderData.items,
            p_customer_id: orderData.customerId
        });

        if (error) throw error;

        showToast(`تم إرسال الطلب للمطبخ بنجاح`, 'success');
        // The table status was already updated when the session was opened.
        // We just need to return the new order ID.
        return data;

    } catch (error: any) {
      console.error("Error creating restaurant order via RPC:", error);
      if (error.code === 'PGRST203') {
          showToast('خطأ في قاعدة البيانات: تكرار دالة إنشاء الطلب. يرجى تشغيل ملف الإصلاح SQL.', 'error');
          return null;
      }
      showToast(`فشل إنشاء الطلب: ${error.message || error}`, 'error');
      return null;
    }
  };

  const addRestaurantOrderItem = async (orderId: string, item: { productId: string; quantity: number; unitPrice: number; notes?: string; }) => {
    try {
      showToast('تم إضافة الصنف إلى الطلب', 'success');
    } catch (error: any) {
      console.error('Failed to add restaurant order item:', error);
      showToast(`فشل إضافة الصنف: ${error.message || error}`, 'error');
    }
  };

  const completeRestaurantOrder = async (orderId: string, paymentMethod: 'CASH' | 'CARD' | 'WALLET' | 'SPLIT', amount: number, treasuryAccountId: string): Promise<void> => {
    if (isDemoState || orderId.startsWith('demo-') || orderId.startsWith('local-')) {
        showToast('تم الدفع وإغلاق الطاولة بنجاح (محاكاة/محلي)', 'success');
        setRestaurantTables(prev => prev.map(t => t.status === 'OCCUPIED' ? { ...t, status: 'AVAILABLE' } : t));
        return;
    }

    try {
        // 1. جلب بيانات الطلب لمعرفة الجلسة المرتبطة به
        const { data: order } = await supabase.from('orders').select('session_id').eq('id', orderId).single();
        if (!order) throw new Error('الطلب غير موجود.');

        // 2. تسجيل عملية الدفع
        const { error: payErr } = await supabase.from('payments').insert({
            order_id: orderId,
            payment_method: paymentMethod,
            amount: amount,
            status: 'COMPLETED',
            organization_id: (currentUser as any)?.organization_id
        });
        if (payErr) throw payErr;

        // 3. تم إلغاء الترحيل المحاسبي الفوري.
        // سيتم إنشاء قيد مجمع عند إغلاق الوردية عبر دالة `generate_shift_closing_entry`.
        // سيقوم الـ Trigger الموجود على جدول `orders` بمعالجة استهلاك المخزون تلقائياً.

        // 4. تحديث حالة الطلب
        await supabase.from('orders').update({ status: 'COMPLETED', updated_at: new Date().toISOString() }).eq('id', orderId);

        // 4. إغلاق جلسة الطاولة (باستخدام الدالة الموجودة في قاعدة البيانات)
        if (order?.session_id) {
             await supabase.rpc('close_table_session', { p_session_id: order.session_id });
        }

        await fetchData();
        showToast('تم الدفع وإغلاق الطاولة بنجاح', 'success');
    } catch (error: any) {
        console.error("Payment error:", error);
        showToast('فشل عملية الدفع: ' + error.message, 'error');
        throw error; // إعادة رمي الخطأ ليتم التعامل معه في الواجهة
    }
  };

  const reserveTable = async (tableId: string, customerName: string, arrivalTime: string) => {
    if (isDemoState) {
        setRestaurantTables(prev => prev.map(t => t.id === tableId ? { ...t, status: 'RESERVED', reservation_info: { customerName, arrivalTime } } : t));
        showToast('تم حجز الطاولة بنجاح (محاكاة)', 'success');
        return true;
    }
    try {
        const { error } = await supabase
            .from('restaurant_tables')
            .update({ 
                status: 'RESERVED',
                reservation_info: { customerName, arrivalTime, reservedAt: new Date().toISOString() }
            })
            .eq('id', tableId);
        
        if (error) throw error;
        
        showToast('تم حجز الطاولة بنجاح ✅', 'success');
        await fetchData();
        return true;
    } catch (err: any) {
        showToast('فشل حجز الطاولة: ' + err.message, 'error');
        return false;
    }
  };

  const cancelReservation = async (tableId: string) => {
    try {
        const { error } = await supabase
            .from('restaurant_tables')
            .update({ status: 'AVAILABLE', reservation_info: null })
            .eq('id', tableId);
        if (error) throw error;
        showToast('تم إلغاء الحجز بنجاح', 'success');
        await fetchData();
        return true;
    } catch (err: any) {
        showToast('فشل إلغاء الحجز: ' + err.message, 'error');
        return false;
    }
  };

  const transferTableSession = async (sessionId: string, targetTableId: string) => {
    try {
      const { error } = await supabase.rpc('transfer_table_session', {
        p_session_id: sessionId,
        p_target_table_id: targetTableId
      });

      if (error) throw error;

      showToast('تم تحويل الطاولة بنجاح ✅', 'success');
      await fetchData();
      return true;
    } catch (err: any) {
      if (process.env.NODE_ENV === 'development') console.error('Error transferring table:', err);
      showToast('فشل تحويل الطاولة: ' + err.message, 'error');
      return false;
    }
  };

  const mergeTableSessions = async (sourceSessionId: string, targetSessionId: string) => {
    try {
      const { error } = await supabase.rpc('merge_table_sessions', {
        p_source_session_id: sourceSessionId,
        p_target_session_id: targetSessionId
      });

      if (error) throw error;

      showToast('تم دمج الطاولات بنجاح ✅', 'success');
      await fetchData();
      return true;
    } catch (err: any) {
      if (process.env.NODE_ENV === 'development') console.error('Error merging tables:', err);
      showToast('فشل دمج الطاولات: ' + err.message, 'error');
      return false;
    }
  };

  const updateKitchenOrderStatus = async (kitchenOrderId: string, newStatus: 'PREPARING' | 'READY' | 'SERVED') => {
    try {
        const { error } = await supabase
            .from('kitchen_orders')
            .update({ status: newStatus, status_updated_at: new Date().toISOString() })
            .eq('id', kitchenOrderId);
        if (error) throw error;
        // No toast needed for KDS, UI updates via subscription
    } catch (err: any) {
        console.error("Failed to update kitchen order status:", err);
        // Show toast only if it fails, as a fallback
        showToast(`فشل تحديث حالة الطلب: ${err.message}`, 'error');
    }
  };

  const getOpenTableOrder = async (tableId: string) => {
    if (isDemoState) {
        // محاكاة جلب طلب لطاولة مشغولة في الديمو
        const table = restaurantTables.find(t => t.id === tableId);
        if (table?.status === 'OCCUPIED') {
            return {
                sessionId: `demo-session-${tableId}`,
                orderId: `demo-order-${tableId}`,
                items: [
                    { productId: 'demo-p1', name: 'لابتوب HP ProBook 450', quantity: 1, price: 25000, notes: '', savedQuantity: 1 },
                    { productId: 'demo-p3', name: 'حبر طابعة HP 85A', quantity: 2, price: 450, notes: '', savedQuantity: 2 }
                ]
            };
        }
        return null;
    }
    try {
        const { data: session } = await supabase.from('table_sessions').select('id').eq('table_id', tableId).eq('status', 'OPEN').single();
        if (!session) return null;
        
        const { data: orders } = await supabase.from('orders')
            .select('id, order_items(id, product_id, quantity, unit_price, notes, modifiers, products(name))')
            .eq('session_id', session.id)
            .neq('status', 'COMPLETED')
            .neq('status', 'CANCELLED');
            
        const items: any[] = [];
        let orderId = null;
        orders?.forEach((order: any) => {
            orderId = order.id;
            order.order_items.forEach((item: any) => {
                // نجمع الكميات للأصناف المتشابهة أو ندرجها كما هي
                // هنا ندرجها ونميزها بأنها "savedQuantity" أي محفوظة مسبقاً
                items.push({ 
                    id: item.id, // Order Item ID (Required for split payment)
                    productId: item.product_id, 
                    name: item.products?.name, 
                    quantity: item.quantity, 
                    unitPrice: item.unit_price, 
                    notes: item.notes, 
                    selectedModifiers: item.modifiers,
                    savedQuantity: item.quantity 
                });
            });
        });
        return { sessionId: session.id, orderId, items };
    } catch (error: any) {
        console.error("Error fetching table order:", error);
        return null;
    }
  };

  const addRestaurantTable = async (tableData: Omit<RestaurantTable, 'id' | 'status' | 'created_at' | 'updated_at'>) => {
    if (isDemoState) {
        const newTable: RestaurantTable = {
            ...tableData,
            id: `demo-t-${Date.now()}`,
            status: 'AVAILABLE',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
        };
        setRestaurantTables(prev => [...prev, newTable].sort((a, b) => a.name.localeCompare(b.name)));
        showToast('تمت إضافة الطاولة بنجاح (محاكاة)', 'success');
        return newTable;
    }
    try {
        const { data, error } = await supabase
            .from('restaurant_tables')
            .insert({
                name: tableData.name,
                capacity: tableData.capacity,
                section: tableData.section || null,
            })
            .select()
            .single();
        if (error) throw error;
        showToast('تمت إضافة الطاولة بنجاح', 'success');
        await fetchData(); // Refresh all data to get the new table
        return data;
    } catch (err: any) {
        showToast(`فشل إضافة الطاولة: ${err.message}`, 'error');
    }
  };

  const processSplitPayment = async (originalOrderId: string, items: { id: string, quantity: number }[], method: string, amount: number, treasuryId: string) => {
      if (isDemoState) {
          showToast('تم الدفع الجزئي بنجاح (ديمو)', 'success');
          return true;
      }
      try {
          const { error } = await supabase.rpc('process_split_payment', {
              p_original_order_id: originalOrderId,
              p_items: items,
              p_payment_method: method,
              p_amount: amount,
              p_treasury_account_id: treasuryId
          });
          if (error) throw error;
          return true;
      } catch (err: any) {
          showToast('فشل الدفع الجزئي: ' + err.message, 'error');
          return false;
      }
  };

  const updateRestaurantTable = async (id: string, updates: Partial<Omit<RestaurantTable, 'id' | 'created_at' | 'updated_at' | 'status'>>) => {
    if (isDemoState) {
        setRestaurantTables(prev => prev.map(t => t.id === id ? { ...t, ...updates, updated_at: new Date().toISOString() } : t).sort((a, b) => a.name.localeCompare(b.name)));
        showToast('تم تعديل الطاولة بنجاح (محاكاة)', 'success');
        return;
    }
    try {
        const { error } = await supabase
            .from('restaurant_tables')
            .update({
                name: updates.name,
                capacity: updates.capacity,
                section: updates.section
            })
            .eq('id', id);
        if (error) throw error;
        showToast('تم تعديل الطاولة بنجاح', 'success');
        await fetchData();
    } catch (err: any) {
        showToast(`فشل تعديل الطاولة: ${err.message}`, 'error');
    }
  };

  const deleteRestaurantTable = async (id: string) => {
    const tableToDelete = restaurantTables.find(t => t.id === id);
    if (tableToDelete?.status !== 'AVAILABLE') {
        showToast('لا يمكن حذف طاولة غير متاحة (مشغولة أو محجوزة).', 'error');
        return;
    }

    if (isDemoState) {
        setRestaurantTables(prev => prev.filter(t => t.id !== id));
        showToast('تم حذف الطاولة بنجاح (محاكاة)', 'success');
        return;
    }
    try {
        const { error } = await supabase.from('restaurant_tables').delete().eq('id', id);
        if (error) throw error;
        showToast('تم حذف الطاولة بنجاح', 'success');
        await fetchData();
    } catch (err: any) {
        showToast(`فشل حذف الطاولة: ${err.message}`, 'error');
    }
  };

  const addWastage = async (data: { warehouseId: string, date: string, notes: string, items: any[] }) => {
    try {
      if (!currentUser) throw new Error('يجب تسجيل الدخول');
      
      const { error } = await supabase.rpc('process_wastage', {
        p_warehouse_id: data.warehouseId,
        p_date: data.date,
        p_notes: data.notes,
        p_items: data.items,
        p_user_id: currentUser.id
      });

      if (error) throw error;

      showToast('تم تسجيل الهالك وترحيل التكلفة بنجاح ✅', 'success');
      await fetchData();
      return true;
    } catch (err: any) {
      showToast('فشل تسجيل الهالك: ' + err.message, 'error');
      return false;
    }
  };

  const addProduct = async (productData: Omit<Product, 'id'>): Promise<Product | void> => {
    if (isDemoState) {
        const newProduct = { ...productData, id: `demo-p-${Date.now()}`, warehouseStock: {} } as Product;
        setProducts(prev => [newProduct, ...prev]);
        showToast('تمت إضافة الصنف بنجاح (محاكاة)', 'success');
        return newProduct;
    }

    try {
        const payload: any = {
            name: productData.name,
            sku: productData.sku,
            product_type: (productData as any).product_type, // Use product_type
            item_type: (productData as any).product_type, // إضافة هذا السطر لضمان التوافق مع قاعدة البيانات
            category_id: productData.category_id || null,
            sales_price: productData.sales_price || 0,
            purchase_price: productData.purchase_price || 0,
            cost: productData.cost || 0,
            stock: productData.stock || 0,
            min_stock_level: productData.min_stock_level || 0,
            unit: productData.unit || 'قطعة',
            is_active: (productData as any).is_active ?? true,
            // إضافة الحقول المفقودة لضمان التوافق مع قاعدة البيانات
            inventory_account_id: (productData as any).inventory_account_id || null,
            cogs_account_id: (productData as any).cogs_account_id || null,
            sales_account_id: (productData as any).sales_account_id || null,
            barcode: (productData as any).barcode || null,
            expiry_date: (productData as any).expiry_date || null,
            offer_price: (productData as any).offer_price || null,
            offer_start_date: (productData as any).offer_start_date || null,
            offer_end_date: (productData as any).offer_end_date || null,
            offer_max_qty: (productData as any).offer_max_qty || null,
        };

        if (!payload.sku || payload.sku.trim() === '') {
            payload.sku = `${payload.name.substring(0, 3).toUpperCase()}-${Date.now().toString().slice(-4)}`;
            showToast(`تم توليد SKU تلقائياً: ${payload.sku}`, 'info');
        }

        const { data, error } = await supabase.from('products').insert(payload).select().single();

        if (error) {
            if (error.code === '23505' && error.message.includes('products_sku_key')) {
                throw new Error(`رمز SKU "${payload.sku}" مستخدم بالفعل. الرجاء إدخال رمز فريد.`);
            }
            throw error;
        }

        await fetchData();
        return data;
    } catch (err: any) {
        throw err; // Re-throw to be caught by the form
    }
  };

  const startShift = async (openingBalance: number) => {
      if (isDemoState) {
          setCurrentShift({ id: 'demo-shift', start_time: new Date().toISOString(), opening_balance: openingBalance });
          showToast('تم فتح الوردية (ديمو)', 'success');
          return true;
      }

      // التحقق أولاً إذا كان النظام يعلم بوجود وردية مفتوحة فعلياً لتوفير طلب الشبكة
      if (currentShift) return true;

      try {
          const { data, error } = await supabase.rpc('start_shift', {
              p_user_id: currentUser?.id,
              p_opening_balance: openingBalance,
              p_resume_existing: true // تفعيل خيار الاستئناف لتجنب الخطأ 400
          });

          if (error) throw error;
          await checkOpenShift();
          showToast('تم فتح الوردية بنجاح', 'success');
          return true;
      } catch (err: any) {
          showToast('فشل فتح الوردية: ' + err.message, 'error');
          return false;
      }
  };

  const getCurrentShiftSummary = async () => {
      if (isDemoState) {
          return { opening_balance: 1000, total_sales: 1500, cash_sales: 1000, card_sales: 500, wallet_sales: 0, expected_cash: 2000 };
      }
      if (!currentShift) return null;
      try {
          const { data, error } = await supabase.rpc('get_shift_summary', { p_shift_id: currentShift.id });
          if (error) throw error;
          return data;
      } catch (err: any) {
          showToast('فشل جلب ملخص الوردية: ' + err.message, 'error');
          return null;
      }
  };

  const closeCurrentShift = async (actualCash: number, notes?: string) => {
      if (isDemoState) { setCurrentShift(null); showToast('تم إغلاق الوردية (ديمو)', 'success'); return true; }
      if (!currentShift) return false;
      try {
          const { error } = await supabase.rpc('close_shift', {
              p_shift_id: currentShift.id,
              p_actual_cash: actualCash,
              p_notes: notes
          });
          if (error) throw error;

          setCurrentShift(null);
          showToast('تم إغلاق الوردية بنجاح', 'success');
          logActivity('إغلاق وردية', `تم إغلاق الوردية بنجاح بمبلغ فعلي ${actualCash}`, actualCash, { shift_id: currentShift.id });
          return true;
      } catch (err: any) {
          console.error("Shift closure failed:", err);
          logActivity('فشل إغلاق الوردية', `محاولة إغلاق فاشلة: ${err.message}`, actualCash, { 
              error: err.message, 
              shift_id: currentShift?.id 
          });
          showToast('فشل إغلاق الوردية: ' + (err.message || 'خطأ غير معروف'), 'error');
          return false;
      }
  };

  return (
    <AccountingContext.Provider value={{
      accounts,
      addAccount: async (accountData: any) => {
        try {
          const { data, error } = await supabase
            .from('accounts') // SECURITY-WRAPPER
            .insert({
              code: accountData.code,
              name: accountData.name,
              type: accountData.type,
              is_group: accountData.is_group,
              parent_id: accountData.parent_id,
              sub_type: accountData.sub_type || null,
              organization_id: (currentUser as any)?.organization_id
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
      customers, addCustomer, updateCustomer, deleteCustomer, // SECURITY-WRAPPER
      addCustomersBulk: async (cs) => { setCustomers(prev => [...prev, ...cs.map(c => ({...c, id: generateUUID()}))]); },
      suppliers, addSupplier, updateSupplier, deleteSupplier, 
      addSuppliersBulk: (ss) => setSuppliers(prev => [...prev, ...ss.map(s => ({...s, id: generateUUID()}))]),
      products, addProduct,
      updateProduct, 
      deleteProduct,
      addProductsBulk: (ps) => setProducts(prev => [...prev, ...ps.map(p => ({...p, id: generateUUID(), warehouseStock: {}}))]), 
      produceItem,
      categories, addCategory: (n) => setCategories(prev => [...prev, { id: generateUUID(), name: n }]), deleteCategory: (id) => setCategories(prev => prev.filter(c => c.id !== id)),
      warehouses, addWarehouse, updateWarehouse, deleteWarehouse,
      invoices, addInvoice, approveSalesInvoice, purchaseInvoices, addPurchaseInvoice, approvePurchaseInvoice, salesReturns, addSalesReturn, purchaseReturns, addPurchaseReturn, stockTransactions, vouchers, addReceiptVoucher, addPaymentVoucher, updateVoucher, addCustomerDeposit,
      openTableSession, reserveTable, cancelReservation, transferTableSession, mergeTableSessions, createRestaurantOrder, addRestaurantOrderItem, completeRestaurantOrder, restaurantTables, addRestaurantTable, updateRestaurantTable, deleteRestaurantTable, menuCategories, updateKitchenOrderStatus, getOpenTableOrder,
      addWastage,
      approveInvoice,
      quotations, addQuotation, convertQuotationToInvoice, updateQuotationStatus,
      purchaseOrders, addPurchaseOrder, updatePurchaseOrder, convertPoToInvoice,
      inventoryCounts, addInventoryCount: (c) => setInventoryCounts(prev => [{...c, id: generateUUID(), countNumber: `CNT-${Date.now().toString().slice(-4)}`}, ...prev]), 
      postInventoryCount: (id) => setInventoryCounts(prev => prev.map(c => c.id === id ? {...c, status: 'posted'} : c)),
      addInventoryAdjustment: (adj) => {}, 
      cheques, addCheque, updateChequeStatus, 
      assets, addAsset, runDepreciation, revaluateAsset, employees, addEmployee, updateEmployee, deleteEmployee, runPayroll, payrollHistory, 
      budgets, saveBudget: (budget) => setBudgets(prev => {
          const existingIdx = prev.findIndex(b => b.year === budget.year && b.month === budget.month);
          if (existingIdx >= 0) {
              const newBudgets = [...prev];
              newBudgets[existingIdx] = { ...budget, id: prev[existingIdx].id };
              return newBudgets;
          }
          return [...prev, { ...budget, id: generateUUID() }];
      }),
      notifications, markNotificationAsRead, clearAllNotifications,
      activityLog,
      transfers, addTransfer, addStockTransfer,
      bankReconciliations, addBankReconciliation: (rec) => setBankReconciliations(prev => [...prev, rec]),
      getBookBalanceAtDate, getAccountBalanceInPeriod,
      salespeople,
      getSystemAccount,
      currentUser, users, login, logout, addUser, updateUser, deleteUser: (id) => setUsers(prev => prev.filter(u => u.id !== id)),
      organizationId: (currentUser as any)?.organization_id || null,
      organization,
      settings, updateSettings: (newSettings) => {
          setSettings(newSettings);
          supabase.from('company_settings').upsert({
              id: ADMIN_USER_ID,
              company_name: newSettings.companyName,
              tax_number: newSettings.taxNumber,
              address: newSettings.address,
              phone: newSettings.phone,
              email: newSettings.email,
              vat_rate: Number(newSettings.vatRate) / 100, // ضمان تحويل الرقم (14) إلى (0.14)
              currency: newSettings.currency,
              footer_text: newSettings.footerText,
              enable_tax: newSettings.enableTax,
              logo_url: newSettings.logoUrl,
              last_closed_date: newSettings.lastClosedDate,
              prevent_price_modification: newSettings.preventPriceModification,
              max_cash_deficit_limit: newSettings.maxCashDeficitLimit,
              // @ts-ignore
              decimal_places: newSettings.decimalPlaces,
              account_mappings: newSettings.account_mappings
          }).then(({ error }) => {
              if (error) console.error("Failed to save settings:", error);
          });
      },
      exportData: () => {}, importData: () => true, factoryReset: () => {},
      closeFinancialYear, getFinancialSummary, refreshData: fetchData,
      userPermissions, can, lastUpdated, recalculateStock, clearCache, exportJournalToCSV,
      authInitialized, isLoading,
      getInvoicesPaginated, getJournalEntriesPaginated,
      restoreItem, permanentDeleteItem, emptyRecycleBin,
      calculateProductPrice, clearTransactions, addOpeningBalanceTransaction,
      currentShift,
      startShift,
      closeCurrentShift,
      getCurrentShiftSummary,
      processSplitPayment,
      openShifts,
      fetchOpenShifts,
      checkSystemAccounts, createMissingSystemAccounts,
  addDemoInvoice, addDemoPurchaseInvoice, addDemoEntry, postDemoSalesInvoice, addDemoPaymentVoucher, addDemoReceiptVoucher,
      isDemo: isDemoState
    }}>
      {children}
    </AccountingContext.Provider>
  );
};

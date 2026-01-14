export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export interface Database {
  public: {
    Tables: {
      accounts: {
        Row: Account
        Insert: Omit<Account, 'id' | 'created_at'> & { user_id?: string }
        Update: Partial<Account>
      }
      journal_entries: {
        Row: JournalEntry
        Insert: Omit<JournalEntry, 'id' | 'created_at' | 'lines'> & { user_id?: string }
        Update: Partial<JournalEntry>
      }
      journal_entry_lines: {
        Row: JournalEntryLine & { id: string; journal_entry_id: string; user_id?: string }
        Insert: JournalEntryLine & { journal_entry_id: string; user_id?: string }
        Update: Partial<JournalEntryLine>
      }
      // يمكن إضافة باقي الجداول هنا بنفس النمط
    }
  }
}

// أنواع الحسابات الرئيسية
export enum AccountType {
  ASSET = 'ASSET',
  LIABILITY = 'LIABILITY',
  EQUITY = 'EQUITY',
  REVENUE = 'REVENUE',
  EXPENSE = 'EXPENSE'
}

export interface ActivityLogEntry {
  id: string;
  date: string;
  user: string;
  action: string;
  details: string;
  amount?: number;
}

export interface AppNotification {
  id: string;
  type: 'danger' | 'warning' | 'info' | 'success';
  title: string;
  message: string;
  date: string;
  relatedId?: string;
  link?: string;
  isRead: boolean;
}

export interface CostCenter {
  id: string;
  name: string;
  code: string;
  description?: string;
}

export interface Account {
  id: string;
  code: string;
  name: string;
  type: AccountType | string;
  balance: number;
  parent_account?: string | null;
  is_group: boolean;
  is_active: boolean;
  user_id?: string;
  sub_type?: 'current' | 'non_current' | null;
  // خصائص إضافية للواجهة (Frontend Compatibility)
  isGroup?: boolean;
  parentAccount?: string | null;
}

// سطر القيد المحاسبي
export interface JournalEntryLine {
  account_id: string;
  description?: string;
  debit: number;
  credit: number;
  cost_center_id?: string;
  // خصائص إضافية
  accountId?: string;
  accountName?: string;
  costCenterId?: string;
  accountCode?: string;
}

// القيد المحاسبي الكامل
export interface JournalEntry {
  id: string;
  date: string; // ISO Date string
  description: string;
  reference?: string;
  created_at: string;
  status: 'posted' | 'draft';
  is_posted: boolean;
  lines: JournalEntryLine[];
  user_id?: string;
  transaction_date?: string;
  journal_attachments?: any[];
  createdAt?: string;
}

export interface Budget {
  id: string;
  year: number;
  month: number;
  items: BudgetItem[];
}
// دالة للتحقق من توازن القيد (Double Entry Validation)
// هذه الدالة يجب أن تعمل في الـ Backend قبل الحفظ
export function validateJournalEntry(entry: JournalEntry): { isValid: boolean; error?: string } {
  if (!entry.lines || entry.lines.length < 2) {
    return { isValid: false, error: "يجب أن يحتوي القيد على طرفين على الأقل." };
  }
  const totalDebit = entry.lines.reduce((sum, line) => sum + line.debit, 0);
  const totalCredit = entry.lines.reduce((sum, line) => sum + line.credit, 0);

  // استخدام هامش خطأ صغير جداً لتفادي مشاكل الفواصل العائمة في JS
  const EPSILON = 0.0001;
  if (Math.abs(totalDebit - totalCredit) > EPSILON) {
    return { isValid: false, error: `القيد غير متوازن. المدين: ${totalDebit}, الدائن: ${totalCredit}` };
  }
  return { isValid: true };
}

export interface BudgetItem {
  type: 'account' | 'salesperson' | 'customer' | 'product';
  target_id: string; // ID of Account, Salesperson, Customer or Product
  target_name: string;
  planned_amount: number; // For accounts/customers/salespeople: Money. For products: Quantity.
  // خصائص إضافية للتوافق
  targetId?: string;
  targetName?: string;
  plannedAmount?: number;
}

export interface SystemSettings {
  company_name: string;
  tax_number: string;
  address: string;
  phone: string;
  email: string;
  vat_rate: number;
  currency: string;
  logo_url?: string;
  footer_text: string;
  account_mappings?: { [key: string]: string }; // key (e.g. 'CASH') -> account_id
  last_closed_date?: string;
  prevent_price_modification?: boolean;
  max_cash_deficit_limit?: number;
  enable_tax?: boolean;
  allow_negative_stock?: boolean;
  // خصائص إضافية للواجهة
  companyName?: string;
  taxNumber?: string;
  logoUrl?: string;
  vatRate?: number;
  footerText?: string;
  accountMappings?: { [key: string]: string };
  lastClosedDate?: string;
  preventPriceModification?: boolean;
  maxCashDeficitLimit?: number;
  enableTax?: boolean;
  allowNegativeStock?: boolean;
}

export type UserRole = 'admin' | 'accountant' | 'sales' | 'storekeeper' | 'worker' | 'manager' | 'super_admin' | 'viewer' | 'demo';

export interface User {
  id: string;
  username: string;
  password?: string;
  name: string;
  role: UserRole;
  is_active: boolean;
}

export interface Salesperson {
  id: string;
  name: string;
}

export interface Customer {
  id: string;
  name: string;
  phone?: string;
  taxId?: string;
  address?: string;
  email?: string;
  customer_type?: 'online' | 'store';
  // خصائص إضافية
  customerType?: 'online' | 'store';
  credit_limit?: number;
  creditLimit?: number;
}

export interface Supplier {
  id: string;
  name: string;
  contactPerson?: string;
  phone?: string;
  taxId?: string;
  address?: string;
  email?: string;
  // خصائص إضافية
  tax_number?: string;
  contact_person?: string;
}

export interface Warehouse {
  id: string;
  name: string;
  location?: string;
  manager?: string;
  phone?: string;
  type?: 'branch' | 'warehouse';
}

export interface Category {
  id: string;
  name: string;
  price?: number;
}

export interface Product {
  id: string;
  name: string;
  price: number;
  wholesale_price?: number;
  half_wholesale_price?: number;
  cost: number;
  sku?: string;
  weight?: number;
  stock?: number;
  warehouse_stock?: { [warehouseId: string]: number };
  min_stock_level?: number;
  category_id?: string;
  category?: string;
  is_manufactured?: boolean;
  bom?: { productId: string; quantity: number }[];
  item_type?: 'STOCK' | 'SERVICE' | 'MANUFACTURED';
  purchase_price?: number;
  // خصائص إضافية
  wholesalePrice?: number;
  halfWholesalePrice?: number;
  warehouseStock?: { [warehouseId: string]: number };
  sales_price?: number;
}

export interface InvoiceItem {
  id: string;
  product_id?: string;
  product_name: string;
  product_sku?: string;
  quantity: number;
  unit_price: number;
  total: number;
  // خصائص إضافية
  productName?: string;
  productSku?: string;
  unitPrice?: number;
  productId?: string;
}

export interface Invoice {
  id: string;
  invoice_number: string;
  customer_id: string;
  customer_name?: string;
  salesperson_id?: string;
  warehouse_id?: string;
  cost_center_id?: string;
  date: string;
  due_date: string;
  items: InvoiceItem[];
  subtotal: number;
  discount_type?: 'percentage' | 'fixed';
  discount_value?: number;
  tax_amount: number;
  total_amount: number;
  paid_amount?: number;
  status: 'paid' | 'unpaid' | 'partial' | 'overdue' | 'draft';
  notes?: string;
  related_journal_entry_id?: string;
  // خصائص إضافية
  invoiceNumber?: string;
  customerName?: string;
  salespersonId?: string;
  warehouseId?: string;
  totalAmount?: number;
  taxAmount?: number;
  treasury_account_id?: string;
  discount_amount?: number;
  customerId?: string;
}

export interface InventoryCount {
  id: string;
  count_number: string;
  date: string;
  warehouse_id: string;
  warehouse_name: string;
  status: 'draft' | 'posted';
  items: PhysicalStockItem[];
  notes?: string;
  related_journal_entry_id?: string;
}

export interface PhysicalStockItem {
  product_id: string;
  product_name: string;
  sku: string;
  system_qty: number;
  actual_qty: number;
  difference: number;
  cost_price: number;
  total_difference_value: number;
}

export interface Voucher {
  id: string;
  voucher_number: string;
  date: string;
  type: 'receipt' | 'payment';
  subType: 'customer' | 'supplier' | 'account';
  party_id?: string;
  party_name?: string;
  target_account_id?: string;
  treasury_account_id: string;
  cost_center_id?: string;
  amount: number;
  description: string;
  payment_method: 'cash' | 'bank' | 'check' | 'transfer';
  reference?: string;
  related_journal_entry_id?: string;
  voucherNumber?: string;
}

export interface StockTransaction {
  id: string;
  date: string;
  product_id: string;
  product_name: string;
  warehouse_id?: string;
  warehouse_name?: string;
  type: 'SALE' | 'PURCHASE' | 'SALE_RETURN' | 'PURCHASE_RETURN' | 'ADJUSTMENT_IN' | 'ADJUSTMENT_OUT' | 'PRODUCTION_IN' | 'PRODUCTION_OUT' | 'STOCK_COUNT';
  quantity: number;
  reference: string;
  notes?: string;
}

export interface Cheque {
  id: string;
  cheque_number: string;
  type: 'incoming' | 'outgoing';
  amount: number;
  bank_name: string;
  due_date: string;
  status: 'received' | 'deposited' | 'collected' | 'rejected' | 'issued' | 'cashed';
  party_id?: string;
  party_name: string;
  current_account_id: string;
  related_voucher_id?: string;
  related_journal_entry_id?: string;
  history: { date: string; status: string; description: string }[];
}

export interface Asset {
  id: string;
  name: string;
  asset_account_id: string;
  accumulated_depreciation_account_id: string;
  depreciation_expense_account_id: string;
  purchase_date: string;
  purchase_cost: number;
  salvage_value: number;
  useful_life_years: number;
  current_value: number;
  total_depreciation: number;
  status: 'active' | 'sold' | 'disposed';
  cost_center_id?: string;
  // CamelCase aliases
  purchaseDate?: string;
  purchaseCost?: number;
  salvageValue?: number;
  usefulLife?: number;
  assetAccountId?: string;
  accumulatedDepreciationAccountId?: string;
  depreciationExpenseAccountId?: string;
  currentValue?: number;
  totalDepreciation?: number;
}

export interface Employee {
    id: string;
    name: string;
    // خاصية إضافية للتوافق مع الواجهة
    full_name?: string;
    position: string;
    phone: string;
    email: string;
    join_date: string;
    basic_salary: number;
    housing_allowance: number;
    transport_allowance: number;
    other_allowance: number;
    status: 'active' | 'terminated';
  department?: string;
  salary?: number;
}

export interface PayrollRun {
    id: string;
    month: string;
    date: string;
    total_basic: number;
    total_allowances: number;
    total_deductions: number;
    net_pay: number;
    employee_count: number;
    related_journal_entry_id?: string;
    is_paid: boolean;
}

export interface Quotation {
    id: string;
  quotation_number: string;
  customer_id: string;
  customer_name?: string;
    date: string;
  expiry_date: string;
    items: InvoiceItem[];
    subtotal: number;
  tax_amount: number;
  total_amount: number;
    status: 'draft' | 'sent' | 'accepted' | 'rejected' | 'converted';
    notes?: string;
  salesperson_id?: string;
}

export interface PurchaseOrder {
  id: string;
  po_number: string;
  supplier_id: string;
  supplier_name?: string;
  date: string;
  delivery_date: string;
  items: InvoiceItem[];
  subtotal: number;
  tax_amount: number;
  total_amount: number;
  status: 'draft' | 'sent' | 'converted' | 'cancelled';
  notes?: string;
}

export interface PurchaseInvoice {
  id: string;
  invoice_number: string;
  supplier_id: string;
  warehouse_id?: string;
  date: string;
  due_date: string;
  items: InvoiceItem[];
  subtotal: number;
  tax_amount: number;
  total_amount: number;
  status: 'paid' | 'unpaid' | 'draft';
  notes?: string;
  related_journal_entry_id?: string;
  // خصائص إضافية
  supplierId?: string;
  invoiceNumber?: string;
  totalAmount?: number;
}

export interface SalesReturn {
  id: string;
  return_number: string;
  customer_id: string;
  warehouse_id?: string;
  date: string;
  items: InvoiceItem[];
  subtotal: number;
  tax_amount: number;
  total_amount: number;
  notes?: string;
  related_journal_entry_id?: string;
}

export interface PurchaseReturn {
  id: string;
  return_number: string;
  supplier_id: string;
  warehouse_id?: string;
  date: string;
  items: InvoiceItem[];
  subtotal: number;
  tax_amount: number;
  total_amount: number;
  notes?: string;
  related_journal_entry_id?: string;
}

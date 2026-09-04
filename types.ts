export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export interface Organization {
  id: string;
  name: string;
  vat_number?: string;
  address?: string;
  phone?: string;
  email?: string;
  logo_url?: string;
  footer_text?: string;
  allowed_modules?: string[];
  is_active: boolean;
  subscription_expiry?: string;
  max_users: number;
  created_at: string;
}

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
  enable_service_charge?: boolean;
  service_charge_rate?: number;
  // خصائص إضافية للواجهة
  companyName?: string;
  taxNumber?: string;
  logoUrl?: string;
  vatRate?: number;
  enableServiceCharge?: boolean;
  serviceChargeRate?: number;
  footerText?: string;
  accountMappings?: { [key: string]: string };
  lastClosedDate?: string;
  preventPriceModification?: boolean;
  maxCashDeficitLimit?: number;
  enableTax?: boolean;
  allowNegativeStock?: boolean;
}

export type UserRole = 
  | 'admin' 
  | 'accountant' 
  | 'sales' 
  | 'storekeeper' 
  | 'worker' 
  | 'manager' 
  | 'super_admin' 
  | 'viewer' 
  | 'demo'
  | 'chef'
  | 'owner'
  | 'cashier'
  | 'pos_supervisor'
  | 'retail_supervisor'
  | 'restaurant_cashier'
  | 'restaurant_waiter'
  | 'restaurant_chef'
  | 'restaurant_cook'
  | 'restaurant_driver'
  | 'medical_director'
  | 'stadium_director'
  | 'stadium_receptionist'
  | 'stadium_booking_officer'
  | 'stadium_gate_security'
  | 'stadium_maintenance_lead'
  | 'stadium_sports_supervisor';


export interface User {
  id: string;
  username: string;
  password?: string;
  name: string;
  role: UserRole;
  is_active: boolean;
  organization_id?: string;
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
  barcode?: string | null;
  barcode2?: string | null;
  unit_barcodes?: Array<{ uom_id?: string; barcode: string; price?: number; uom_name?: string }>;
  weight?: number;
  stock?: number;
  warehouse_stock?: { [warehouseId: string]: number };
  min_stock_level?: number;
  category_id?: string;
  category?: string;
  is_manufactured?: boolean;
  bom?: { productId: string; quantity: number }[];
  product_type: string;
  item_type?: 'STOCK' | 'SERVICE' | 'MANUFACTURED';
  purchase_price?: number;
  unit?: string;
  base_uom_id?: string | null;
  purchase_uom_id?: string | null;
  sale_uom_id?: string | null;
  // خصائص إضافية
  wholesalePrice?: number;
  halfWholesalePrice?: number;
  warehouseStock?: { [warehouseId: string]: number };
  sales_price?: number;
  expiry_date?: string;
  offer_price?: number;
  offer_start_date?: string;
  offer_end_date?: string;
  offer_max_qty?: number;
  station_id?: string | null;
  prep_time_minutes?: number;
  is_86?: boolean;
}

export interface InvoiceItem {
  id: string;
  product_id?: string;
  product_name: string;
  product_sku?: string;
  quantity: number;
  uom_id?: string;
  unit_price: number;
  total: number;
  // خصائص إضافية
  productName?: string;
  productSku?: string;
  unitPrice?: number;
  productId?: string;
  uomId?: string;
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
  created_at?: string;
  notes?: string;
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

export interface RestaurantTable {
  id: string;
  name: string;
  capacity: number;
  section: string;
  status: 'AVAILABLE' | 'OCCUPIED' | 'RESERVED';
  created_at: string;
  updated_at: string;
}

export interface MenuCategory {
  id: string;
  name: string;
  display_order: number;
  created_at: string;
  updated_at: string;
}

export interface Modifier {
  id: string;
  name: string;
  unit_price: number;
  cost: number;
  modifier_group_id: string;
  is_default: boolean;
  display_order: number;
}

export interface ModifierGroup {
  id: string;
  name: string;
  product_id: string;
  selection_type: 'SINGLE' | 'MULTIPLE';
  is_required: boolean;
  min_selection: number;
  max_selection: number | null;
  display_order: number;
  modifiers: Modifier[];
}

export interface SelectedModifier {
  modifierId?: string; // Optional because legacy code might not use it immediately
  id?: string;        // Legacy support
  name: string;
  unit_price: number;
  cost?: number;      // Legacy support for PosScreen logic
  groupId?: string;
  groupName?: string;
}

export interface OrderItem {
  productId: string;
  name: string;
  quantity: number;
  uomId?: string;
  uom_id?: string;
  price: number;      // السعر الأساسي
  unitPrice: number;  // السعر شامل الإضافات
  unitCost: number;   // التكلفة الإجمالية
  total?: number;
  notes?: string;
  selectedModifiers?: SelectedModifier[];
  savedQuantity?: number;
}

// 🔁 الفواتير الدورية والاشتراكات (Recurring Invoices & Subscriptions)
export type RecurringFrequency = 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'semi_annual' | 'annual' | 'custom';
export type RecurringStatus = 'active' | 'paused' | 'completed' | 'cancelled';

export interface RecurringInvoiceItem {
  id?: string;
  recurring_invoice_id?: string;
  product_id?: string;
  product_name: string;
  product_sku?: string;
  quantity: number;
  uom_id?: string;
  unit_price: number;
  discount_percent?: number;
  tax_percent?: number;
  total: number;
}

export interface RecurringInvoice {
  id: string;
  organization_id: string;
  subscription_number: string;
  customer_id: string;
  customer_name?: string;
  customer_phone?: string;
  warehouse_id?: string;
  salesperson_id?: string;
  cost_center_id?: string;
  
  title: string;
  frequency: RecurringFrequency;
  custom_interval_days?: number | null;
  
  start_date: string;
  end_date?: string | null;
  next_run_date: string;
  last_run_date?: string | null;
  
  total_cycles?: number | null;
  completed_cycles: number;
  
  auto_post: boolean;
  send_whatsapp: boolean;
  send_email: boolean;
  
  status: RecurringStatus;
  
  subtotal: number;
  discount_type?: 'fixed' | 'percentage';
  discount_value?: number;
  tax_amount: number;
  total_amount: number;
  currency: string;
  
  notes?: string;
  created_by?: string;
  created_at?: string;
  updated_at?: string;
  
  items?: RecurringInvoiceItem[];
  customers?: { id: string; name: string; phone?: string };
}

export interface RecurringInvoiceLog {
  id: string;
  organization_id: string;
  recurring_invoice_id: string;
  generated_invoice_id?: string;
  run_date: string;
  status: 'success' | 'failed';
  error_message?: string;
  notified_whatsapp: boolean;
  notified_email: boolean;
  amount: number;
  created_at: string;
  invoices?: { id: string; invoice_number: string; total_amount: number };
}

// 📦 إدارة المواقع التخزينية والرفوف (WMS Bin & Shelf Locations)
export type BinType = 'storage' | 'cold_storage' | 'fast_moving' | 'receiving' | 'shipping' | 'quarantine';

export interface WarehouseBin {
  id: string;
  organization_id: string;
  warehouse_id: string;
  warehouse_name?: string;
  
  bin_code: string;
  bin_name: string;
  barcode?: string;
  
  zone_name: string;
  aisle: string;
  rack: string;
  shelf: string;
  bin_number: string;
  
  bin_type: BinType;
  max_capacity_qty?: number;
  max_weight_kg?: number;
  
  is_active: boolean;
  notes?: string;
  created_at?: string;
  updated_at?: string;
  
  allocated_items?: BinStockAllocation[];
  current_qty?: number;
  occupancy_pct?: number;
}

export interface BinStockAllocation {
  id: string;
  organization_id: string;
  warehouse_id: string;
  bin_id: string;
  product_id: string;
  product_name?: string;
  product_sku?: string;
  
  quantity: number;
  batch_number?: string | null;
  expiry_date?: string | null;
  
  last_putaway_at?: string;
  last_picked_at?: string | null;
  created_at?: string;
  updated_at?: string;
  
  bins?: WarehouseBin;
  products?: Product;
}

// 🚚 التحويلات المخزنية والبضاعة بالطريق (In-Transit Inter-Warehouse Transfers)
export type TransferType = 'direct' | 'in_transit';
export type InTransitStatus = 'pending_dispatch' | 'in_transit' | 'partially_received' | 'received_full' | 'cancelled';

export interface InTransitTransferItem {
  id?: string;
  stock_transfer_id?: string;
  product_id: string;
  product_name?: string;
  product_sku?: string;
  quantity: number;
  dispatched_qty?: number;
  received_qty?: number;
  variance_qty?: number;
  unit_cost?: number;
  from_bin_id?: string | null;
  to_bin_id?: string | null;
}

export interface InTransitTransfer {
  id: string;
  organization_id: string;
  transfer_number: string;
  transfer_date: string;
  from_warehouse_id: string;
  to_warehouse_id: string;
  from_warehouse_name?: string;
  to_warehouse_name?: string;
  
  transfer_type: TransferType;
  in_transit_status: InTransitStatus;
  status: 'draft' | 'posted' | 'cancelled';
  
  carrier_name?: string | null;
  driver_name?: string | null;
  driver_phone?: string | null;
  vehicle_number?: string | null;
  tracking_number?: string | null;
  
  dispatched_at?: string | null;
  estimated_arrival?: string | null;
  received_at?: string | null;
  received_by?: string | null;
  receipt_notes?: string | null;
  
  notes?: string;
  created_at?: string;
  items?: InTransitTransferItem[];
}

// 📑 طلبات عروض الأسعار ومناقصات الموردين (RFQ & Vendor Bidding)
export type PurchaseRfqStatus = 'draft' | 'open' | 'under_evaluation' | 'awarded' | 'cancelled';

export interface PurchaseRfqItem {
  id?: string;
  rfq_id?: string;
  product_id?: string | null;
  product_name: string;
  product_sku?: string;
  uom_id?: string | null;
  quantity: number;
  target_price?: number | null;
  specifications?: string;
}

export interface VendorQuotationBidItem {
  id?: string;
  bid_id?: string;
  rfq_item_id?: string;
  product_id?: string | null;
  product_name: string;
  offered_quantity: number;
  unit_price: number;
  discount_percent?: number;
  tax_percent?: number;
  total_price: number;
  brand_or_model?: string;
  notes?: string;
}

export interface VendorQuotationBid {
  id: string;
  organization_id: string;
  rfq_id: string;
  supplier_id: string;
  supplier_name?: string;
  supplier_phone?: string;
  
  quotation_reference?: string;
  bid_date: string;
  valid_until?: string | null;
  
  subtotal: number;
  tax_amount: number;
  discount_amount: number;
  shipping_cost: number;
  total_amount: number;
  currency: string;
  
  lead_time_days: number;
  payment_terms: string;
  warranty_terms?: string | null;
  
  is_awarded: boolean;
  score_points?: number;
  evaluation_notes?: string;
  
  created_at?: string;
  items?: VendorQuotationBidItem[];
}

export interface PurchaseRfq {
  id: string;
  organization_id: string;
  rfq_number: string;
  title: string;
  issue_date: string;
  deadline_date: string;
  
  status: PurchaseRfqStatus;
  target_warehouse_id?: string | null;
  target_warehouse_name?: string;
  
  notes?: string;
  created_by?: string;
  awarded_bid_id?: string | null;
  generated_po_id?: string | null;
  
  created_at?: string;
  items?: PurchaseRfqItem[];
  bids?: VendorQuotationBid[];
}




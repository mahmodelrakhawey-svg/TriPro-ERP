/**
 * Shared Test Data Factories for TriPro ERP
 * مصنع بيانات اختبارية موحدة لجميع وحدات النظام
 */

export const TEST_ORG_ID = '11111111-1111-4111-8111-111111111111';
export const TEST_USER_ID = '22222222-2222-4222-8222-222222222222';
export const TEST_CASH_ACC_ID = '33333333-3333-4333-8333-333333333331';
export const TEST_BANK_ACC_ID = '33333333-3333-4333-8333-333333333332';
export const TEST_WAREHOUSE_ID = '44444444-4444-4444-8444-444444444441';
export const TEST_WAREHOUSE_2_ID = '44444444-4444-4444-8444-444444444442';
export const TEST_CUSTOMER_ID = '55555555-5555-4555-8555-555555555551';
export const TEST_SUPPLIER_ID = '66666666-6666-4666-8666-666666666661';

export const makeProfile = (overrides: Record<string, any> = {}) => ({
  id: TEST_USER_ID,
  email: 'mohamed.mohsen@lenza.test',
  full_name: 'محمد محسن',
  role: 'cashier',
  organization_id: TEST_ORG_ID,
  is_active: true,
  ...overrides,
});

export const makeAccount = (overrides: Record<string, any> = {}) => ({
  id: TEST_CASH_ACC_ID,
  code: '1231',
  name: 'الخزينة الرئيسية',
  type: 'asset',
  balance: 50000,
  is_group: false,
  isGroup: false,
  organization_id: TEST_ORG_ID,
  ...overrides,
});

export const makeTransferPayload = (overrides: Record<string, any> = {}) => ({
  sourceAccountId: TEST_CASH_ACC_ID,
  destinationAccountId: TEST_BANK_ACC_ID,
  amount: 5000,
  date: '2026-11-28',
  description: 'تحويل نقدية إلى البنك',
  ...overrides,
});

export const makeInvoice = (overrides: Record<string, any> = {}) => ({
  id: 'inv-test-001',
  invoice_number: 'INV-000101',
  customer_id: TEST_CUSTOMER_ID,
  warehouse_id: TEST_WAREHOUSE_ID,
  invoice_date: '2026-11-28',
  subtotal: 1000,
  tax_amount: 140,
  total_amount: 1140,
  paid_amount: 0,
  status: 'draft',
  organization_id: TEST_ORG_ID,
  ...overrides,
});

export const makePaymentVoucher = (overrides: Record<string, any> = {}) => ({
  id: 'pv-test-001',
  voucher_number: 'PV-000101',
  supplier_id: TEST_SUPPLIER_ID,
  treasury_account_id: TEST_CASH_ACC_ID,
  payment_date: '2026-11-28',
  amount: 2500,
  payment_method: 'cash',
  currency: 'EGP',
  exchange_rate: 1,
  notes: 'سداد دفعة مورد',
  organization_id: TEST_ORG_ID,
  ...overrides,
});

export const makeReceiptVoucher = (overrides: Record<string, any> = {}) => ({
  id: 'rv-test-001',
  voucher_number: 'RV-000101',
  customer_id: TEST_CUSTOMER_ID,
  treasury_account_id: TEST_CASH_ACC_ID,
  receipt_date: '2026-11-28',
  amount: 3000,
  payment_method: 'cash',
  currency: 'EGP',
  exchange_rate: 1,
  notes: 'تحصيل دفعة عميل',
  organization_id: TEST_ORG_ID,
  ...overrides,
});

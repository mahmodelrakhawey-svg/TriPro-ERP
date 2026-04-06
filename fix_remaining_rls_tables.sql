-- ============================================
-- إضافة سياسات RLS للجداول المتبقية
-- ============================================

-- حذف السياسات القديمة من الجداول المتبقية
DROP POLICY IF EXISTS "assets_read" ON public.assets CASCADE;
DROP POLICY IF EXISTS "assets_write" ON public.assets CASCADE;
DROP POLICY IF EXISTS "assets_update" ON public.assets CASCADE;
DROP POLICY IF EXISTS "assets_delete" ON public.assets CASCADE;

DROP POLICY IF EXISTS "bank_reconciliations_read" ON public.bank_reconciliations CASCADE;
DROP POLICY IF EXISTS "bank_reconciliations_write" ON public.bank_reconciliations CASCADE;

DROP POLICY IF EXISTS "bill_of_materials_read" ON public.bill_of_materials CASCADE;
DROP POLICY IF EXISTS "bill_of_materials_write" ON public.bill_of_materials CASCADE;

DROP POLICY IF EXISTS "budgets_read" ON public.budgets CASCADE;
DROP POLICY IF EXISTS "budgets_write" ON public.budgets CASCADE;

DROP POLICY IF EXISTS "cash_closings_read" ON public.cash_closings CASCADE;
DROP POLICY IF EXISTS "cash_closings_write" ON public.cash_closings CASCADE;

DROP POLICY IF EXISTS "cost_centers_read" ON public.cost_centers CASCADE;
DROP POLICY IF EXISTS "cost_centers_write" ON public.cost_centers CASCADE;

DROP POLICY IF EXISTS "credit_notes_read" ON public.credit_notes CASCADE;
DROP POLICY IF EXISTS "credit_notes_write" ON public.credit_notes CASCADE;

DROP POLICY IF EXISTS "debit_notes_read" ON public.debit_notes CASCADE;
DROP POLICY IF EXISTS "debit_notes_write" ON public.debit_notes CASCADE;

DROP POLICY IF EXISTS "employee_advances_read" ON public.employee_advances CASCADE;
DROP POLICY IF EXISTS "employee_advances_write" ON public.employee_advances CASCADE;

DROP POLICY IF EXISTS "inventory_count_items_read" ON public.inventory_count_items CASCADE;
DROP POLICY IF EXISTS "inventory_count_items_write" ON public.inventory_count_items CASCADE;

DROP POLICY IF EXISTS "inventory_counts_read" ON public.inventory_counts CASCADE;
DROP POLICY IF EXISTS "inventory_counts_write" ON public.inventory_counts CASCADE;

DROP POLICY IF EXISTS "item_categories_read" ON public.item_categories CASCADE;
DROP POLICY IF EXISTS "item_categories_write" ON public.item_categories CASCADE;

DROP POLICY IF EXISTS "kitchen_orders_read" ON public.kitchen_orders CASCADE;
DROP POLICY IF EXISTS "kitchen_orders_write" ON public.kitchen_orders CASCADE;

DROP POLICY IF EXISTS "order_items_read" ON public.order_items CASCADE;
DROP POLICY IF EXISTS "order_items_write" ON public.order_items CASCADE;

DROP POLICY IF EXISTS "orders_read" ON public.orders CASCADE;
DROP POLICY IF EXISTS "orders_write" ON public.orders CASCADE;

DROP POLICY IF EXISTS "organizations_read" ON public.organizations CASCADE;
DROP POLICY IF EXISTS "organizations_write" ON public.organizations CASCADE;

DROP POLICY IF EXISTS "payments_read" ON public.payments CASCADE;
DROP POLICY IF EXISTS "payments_write" ON public.payments CASCADE;

DROP POLICY IF EXISTS "payroll_items_read" ON public.payroll_items CASCADE;
DROP POLICY IF EXISTS "payroll_items_write" ON public.payroll_items CASCADE;

DROP POLICY IF EXISTS "payrolls_read" ON public.payrolls CASCADE;
DROP POLICY IF EXISTS "payrolls_write" ON public.payrolls CASCADE;

DROP POLICY IF EXISTS "profiles_read" ON public.profiles CASCADE;
DROP POLICY IF EXISTS "profiles_write" ON public.profiles CASCADE;

DROP POLICY IF EXISTS "purchase_return_items_read" ON public.purchase_return_items CASCADE;
DROP POLICY IF EXISTS "purchase_return_items_write" ON public.purchase_return_items CASCADE;

DROP POLICY IF EXISTS "purchase_returns_read" ON public.purchase_returns CASCADE;
DROP POLICY IF EXISTS "purchase_returns_write" ON public.purchase_returns CASCADE;

DROP POLICY IF EXISTS "rejected_cash_closings_read" ON public.rejected_cash_closings CASCADE;
DROP POLICY IF EXISTS "rejected_cash_closings_write" ON public.rejected_cash_closings CASCADE;

DROP POLICY IF EXISTS "restaurant_tables_read" ON public.restaurant_tables CASCADE;
DROP POLICY IF EXISTS "restaurant_tables_write" ON public.restaurant_tables CASCADE;

DROP POLICY IF EXISTS "sales_return_items_read" ON public.sales_return_items CASCADE;
DROP POLICY IF EXISTS "sales_return_items_write" ON public.sales_return_items CASCADE;

DROP POLICY IF EXISTS "sales_returns_read" ON public.sales_returns CASCADE;
DROP POLICY IF EXISTS "sales_returns_write" ON public.sales_returns CASCADE;

DROP POLICY IF EXISTS "stock_adjustments_read" ON public.stock_adjustments CASCADE;
DROP POLICY IF EXISTS "stock_adjustments_write" ON public.stock_adjustments CASCADE;

DROP POLICY IF EXISTS "stock_transfers_read" ON public.stock_transfers CASCADE;
DROP POLICY IF EXISTS "stock_transfers_write" ON public.stock_transfers CASCADE;

DROP POLICY IF EXISTS "system_error_logs_read" ON public.system_error_logs CASCADE;
DROP POLICY IF EXISTS "system_error_logs_write" ON public.system_error_logs CASCADE;

DROP POLICY IF EXISTS "work_order_costs_read" ON public.work_order_costs CASCADE;
DROP POLICY IF EXISTS "work_order_costs_write" ON public.work_order_costs CASCADE;

DROP POLICY IF EXISTS "work_orders_read" ON public.work_orders CASCADE;
DROP POLICY IF EXISTS "work_orders_write" ON public.work_orders CASCADE;

DROP POLICY IF EXISTS "invitations_read" ON public.invitations CASCADE;
DROP POLICY IF EXISTS "invitations_write" ON public.invitations CASCADE;

-- تفعيل RLS على جميع الجداول المتبقية
ALTER TABLE public.assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bank_reconciliations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bill_of_materials ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.budgets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cash_closings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cost_centers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.credit_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.debit_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employee_advances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_count_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_counts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.item_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kitchen_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payroll_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payrolls ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_return_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_returns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rejected_cash_closings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.restaurant_tables ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales_return_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales_returns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_adjustments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_transfers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.system_error_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.work_order_costs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.work_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invitations ENABLE ROW LEVEL SECURITY;

-- إنشاء سياسات بسيطة لجميع الجداول المتبقية
-- assets
CREATE POLICY "assets_read" ON public.assets FOR SELECT TO authenticated USING (true);
CREATE POLICY "assets_write" ON public.assets FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "assets_update" ON public.assets FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "assets_delete" ON public.assets FOR DELETE TO authenticated USING (true);

-- bank_reconciliations
CREATE POLICY "bank_reconciliations_read" ON public.bank_reconciliations FOR SELECT TO authenticated USING (true);
CREATE POLICY "bank_reconciliations_write" ON public.bank_reconciliations FOR INSERT TO authenticated WITH CHECK (true);

-- bill_of_materials
CREATE POLICY "bill_of_materials_read" ON public.bill_of_materials FOR SELECT TO authenticated USING (true);
CREATE POLICY "bill_of_materials_write" ON public.bill_of_materials FOR INSERT TO authenticated WITH CHECK (true);

-- budgets
CREATE POLICY "budgets_read" ON public.budgets FOR SELECT TO authenticated USING (true);
CREATE POLICY "budgets_write" ON public.budgets FOR INSERT TO authenticated WITH CHECK (true);

-- cash_closings
CREATE POLICY "cash_closings_read" ON public.cash_closings FOR SELECT TO authenticated USING (true);
CREATE POLICY "cash_closings_write" ON public.cash_closings FOR INSERT TO authenticated WITH CHECK (true);

-- cost_centers
CREATE POLICY "cost_centers_read" ON public.cost_centers FOR SELECT TO authenticated USING (true);
CREATE POLICY "cost_centers_write" ON public.cost_centers FOR INSERT TO authenticated WITH CHECK (true);

-- credit_notes
CREATE POLICY "credit_notes_read" ON public.credit_notes FOR SELECT TO authenticated USING (true);
CREATE POLICY "credit_notes_write" ON public.credit_notes FOR INSERT TO authenticated WITH CHECK (true);

-- debit_notes
CREATE POLICY "debit_notes_read" ON public.debit_notes FOR SELECT TO authenticated USING (true);
CREATE POLICY "debit_notes_write" ON public.debit_notes FOR INSERT TO authenticated WITH CHECK (true);

-- employee_advances
CREATE POLICY "employee_advances_read" ON public.employee_advances FOR SELECT TO authenticated USING (true);
CREATE POLICY "employee_advances_write" ON public.employee_advances FOR INSERT TO authenticated WITH CHECK (true);

-- inventory_count_items
CREATE POLICY "inventory_count_items_read" ON public.inventory_count_items FOR SELECT TO authenticated USING (true);
CREATE POLICY "inventory_count_items_write" ON public.inventory_count_items FOR INSERT TO authenticated WITH CHECK (true);

-- inventory_counts
CREATE POLICY "inventory_counts_read" ON public.inventory_counts FOR SELECT TO authenticated USING (true);
CREATE POLICY "inventory_counts_write" ON public.inventory_counts FOR INSERT TO authenticated WITH CHECK (true);

-- item_categories
CREATE POLICY "item_categories_read" ON public.item_categories FOR SELECT TO authenticated USING (true);
CREATE POLICY "item_categories_write" ON public.item_categories FOR INSERT TO authenticated WITH CHECK (true);

-- kitchen_orders
CREATE POLICY "kitchen_orders_read" ON public.kitchen_orders FOR SELECT TO authenticated USING (true);
CREATE POLICY "kitchen_orders_write" ON public.kitchen_orders FOR INSERT TO authenticated WITH CHECK (true);

-- order_items
CREATE POLICY "order_items_read" ON public.order_items FOR SELECT TO authenticated USING (true);
CREATE POLICY "order_items_write" ON public.order_items FOR INSERT TO authenticated WITH CHECK (true);

-- orders
CREATE POLICY "orders_read" ON public.orders FOR SELECT TO authenticated USING (true);
CREATE POLICY "orders_write" ON public.orders FOR INSERT TO authenticated WITH CHECK (true);

-- organizations
CREATE POLICY "organizations_read" ON public.organizations FOR SELECT TO authenticated USING (true);
CREATE POLICY "organizations_write" ON public.organizations FOR INSERT TO authenticated WITH CHECK (true);

-- payments
CREATE POLICY "payments_read" ON public.payments FOR SELECT TO authenticated USING (true);
CREATE POLICY "payments_write" ON public.payments FOR INSERT TO authenticated WITH CHECK (true);

-- payroll_items
CREATE POLICY "payroll_items_read" ON public.payroll_items FOR SELECT TO authenticated USING (true);
CREATE POLICY "payroll_items_write" ON public.payroll_items FOR INSERT TO authenticated WITH CHECK (true);

-- payrolls
CREATE POLICY "payrolls_read" ON public.payrolls FOR SELECT TO authenticated USING (true);
CREATE POLICY "payrolls_write" ON public.payrolls FOR INSERT TO authenticated WITH CHECK (true);

-- profiles
CREATE POLICY "profiles_read" ON public.profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "profiles_write" ON public.profiles FOR INSERT TO authenticated WITH CHECK (true);

-- purchase_return_items
CREATE POLICY "purchase_return_items_read" ON public.purchase_return_items FOR SELECT TO authenticated USING (true);
CREATE POLICY "purchase_return_items_write" ON public.purchase_return_items FOR INSERT TO authenticated WITH CHECK (true);

-- purchase_returns
CREATE POLICY "purchase_returns_read" ON public.purchase_returns FOR SELECT TO authenticated USING (true);
CREATE POLICY "purchase_returns_write" ON public.purchase_returns FOR INSERT TO authenticated WITH CHECK (true);

-- rejected_cash_closings
CREATE POLICY "rejected_cash_closings_read" ON public.rejected_cash_closings FOR SELECT TO authenticated USING (true);
CREATE POLICY "rejected_cash_closings_write" ON public.rejected_cash_closings FOR INSERT TO authenticated WITH CHECK (true);

-- restaurant_tables
CREATE POLICY "restaurant_tables_read" ON public.restaurant_tables FOR SELECT TO authenticated USING (true);
CREATE POLICY "restaurant_tables_write" ON public.restaurant_tables FOR INSERT TO authenticated WITH CHECK (true);

-- sales_return_items
CREATE POLICY "sales_return_items_read" ON public.sales_return_items FOR SELECT TO authenticated USING (true);
CREATE POLICY "sales_return_items_write" ON public.sales_return_items FOR INSERT TO authenticated WITH CHECK (true);

-- sales_returns
CREATE POLICY "sales_returns_read" ON public.sales_returns FOR SELECT TO authenticated USING (true);
CREATE POLICY "sales_returns_write" ON public.sales_returns FOR INSERT TO authenticated WITH CHECK (true);

-- stock_adjustments
CREATE POLICY "stock_adjustments_read" ON public.stock_adjustments FOR SELECT TO authenticated USING (true);
CREATE POLICY "stock_adjustments_write" ON public.stock_adjustments FOR INSERT TO authenticated WITH CHECK (true);

-- stock_transfers
CREATE POLICY "stock_transfers_read" ON public.stock_transfers FOR SELECT TO authenticated USING (true);
CREATE POLICY "stock_transfers_write" ON public.stock_transfers FOR INSERT TO authenticated WITH CHECK (true);

-- system_error_logs
CREATE POLICY "system_error_logs_read" ON public.system_error_logs FOR SELECT TO authenticated USING (true);
CREATE POLICY "system_error_logs_write" ON public.system_error_logs FOR INSERT TO authenticated WITH CHECK (true);

-- work_order_costs
CREATE POLICY "work_order_costs_read" ON public.work_order_costs FOR SELECT TO authenticated USING (true);
CREATE POLICY "work_order_costs_write" ON public.work_order_costs FOR INSERT TO authenticated WITH CHECK (true);

-- work_orders
CREATE POLICY "work_orders_read" ON public.work_orders FOR SELECT TO authenticated USING (true);
CREATE POLICY "work_orders_write" ON public.work_orders FOR INSERT TO authenticated WITH CHECK (true);

-- invitations
CREATE POLICY "invitations_read" ON public.invitations FOR SELECT TO authenticated USING (true);
CREATE POLICY "invitations_write" ON public.invitations FOR INSERT TO authenticated WITH CHECK (true);

-- التحقق من النتائج
SELECT '✅ تم إضافة سياسات RLS للجداول المتبقية!' as النتيجة;

SELECT
    tablename,
    COUNT(*) as عدد_السياسات
FROM pg_policies
WHERE schemaname = 'public'
GROUP BY tablename
ORDER BY tablename;
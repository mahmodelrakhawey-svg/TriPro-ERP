-- ============================================
-- إضافة سياسات RLS للـ 20 جداول الأخيرة المتبقية
-- ============================================

-- حذف السياسات القديمة من جميع الجداول
DROP POLICY IF EXISTS "cheque_attachments_read" ON public.cheque_attachments CASCADE;
DROP POLICY IF EXISTS "cheque_attachments_write" ON public.cheque_attachments CASCADE;
DROP POLICY IF EXISTS "delivery_orders_read" ON public.delivery_orders CASCADE;
DROP POLICY IF EXISTS "delivery_orders_write" ON public.delivery_orders CASCADE;
DROP POLICY IF EXISTS "journal_attachments_read" ON public.journal_attachments CASCADE;
DROP POLICY IF EXISTS "journal_attachments_write" ON public.journal_attachments CASCADE;
DROP POLICY IF EXISTS "notification_audit_log_read" ON public.notification_audit_log CASCADE;
DROP POLICY IF EXISTS "notification_audit_log_write" ON public.notification_audit_log CASCADE;
DROP POLICY IF EXISTS "notification_preferences_read" ON public.notification_preferences CASCADE;
DROP POLICY IF EXISTS "notification_preferences_write" ON public.notification_preferences CASCADE;
DROP POLICY IF EXISTS "opening_inventories_read" ON public.opening_inventories CASCADE;
DROP POLICY IF EXISTS "opening_inventories_write" ON public.opening_inventories CASCADE;
DROP POLICY IF EXISTS "payment_voucher_attachments_read" ON public.payment_voucher_attachments CASCADE;
DROP POLICY IF EXISTS "payment_voucher_attachments_write" ON public.payment_voucher_attachments CASCADE;
DROP POLICY IF EXISTS "permissions_read" ON public.permissions CASCADE;
DROP POLICY IF EXISTS "permissions_write" ON public.permissions CASCADE;
DROP POLICY IF EXISTS "purchase_order_items_read" ON public.purchase_order_items CASCADE;
DROP POLICY IF EXISTS "purchase_order_items_write" ON public.purchase_order_items CASCADE;
DROP POLICY IF EXISTS "purchase_orders_read" ON public.purchase_orders CASCADE;
DROP POLICY IF EXISTS "purchase_orders_write" ON public.purchase_orders CASCADE;
DROP POLICY IF EXISTS "quotation_items_read" ON public.quotation_items CASCADE;
DROP POLICY IF EXISTS "quotation_items_write" ON public.quotation_items CASCADE;
DROP POLICY IF EXISTS "quotations_read" ON public.quotations CASCADE;
DROP POLICY IF EXISTS "quotations_write" ON public.quotations CASCADE;
DROP POLICY IF EXISTS "receipt_voucher_attachments_read" ON public.receipt_voucher_attachments CASCADE;
DROP POLICY IF EXISTS "receipt_voucher_attachments_write" ON public.receipt_voucher_attachments CASCADE;
DROP POLICY IF EXISTS "role_permissions_read" ON public.role_permissions CASCADE;
DROP POLICY IF EXISTS "role_permissions_write" ON public.role_permissions CASCADE;
DROP POLICY IF EXISTS "roles_read" ON public.roles CASCADE;
DROP POLICY IF EXISTS "roles_write" ON public.roles CASCADE;
DROP POLICY IF EXISTS "shifts_read" ON public.shifts CASCADE;
DROP POLICY IF EXISTS "shifts_write" ON public.shifts CASCADE;
DROP POLICY IF EXISTS "stock_adjustment_items_read" ON public.stock_adjustment_items CASCADE;
DROP POLICY IF EXISTS "stock_adjustment_items_write" ON public.stock_adjustment_items CASCADE;
DROP POLICY IF EXISTS "stock_transfer_items_read" ON public.stock_transfer_items CASCADE;
DROP POLICY IF EXISTS "stock_transfer_items_write" ON public.stock_transfer_items CASCADE;
DROP POLICY IF EXISTS "table_sessions_read" ON public.table_sessions CASCADE;
DROP POLICY IF EXISTS "table_sessions_write" ON public.table_sessions CASCADE;
DROP POLICY IF EXISTS "user_permissions_read" ON public.user_permissions CASCADE;
DROP POLICY IF EXISTS "user_permissions_write" ON public.user_permissions CASCADE;

-- تفعيل RLS على جميع الجداول
ALTER TABLE public.cheque_attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.delivery_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.journal_attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.opening_inventories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_voucher_attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quotation_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quotations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.receipt_voucher_attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.role_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shifts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_adjustment_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_transfer_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.table_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_permissions ENABLE ROW LEVEL SECURITY;

-- إنشاء سياسات بسيطة لجميع الجداول
-- cheque_attachments
CREATE POLICY "cheque_attachments_read" ON public.cheque_attachments FOR SELECT TO authenticated USING (true);
CREATE POLICY "cheque_attachments_write" ON public.cheque_attachments FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "cheque_attachments_update" ON public.cheque_attachments FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "cheque_attachments_delete" ON public.cheque_attachments FOR DELETE TO authenticated USING (true);

-- delivery_orders
CREATE POLICY "delivery_orders_read" ON public.delivery_orders FOR SELECT TO authenticated USING (true);
CREATE POLICY "delivery_orders_write" ON public.delivery_orders FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "delivery_orders_update" ON public.delivery_orders FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "delivery_orders_delete" ON public.delivery_orders FOR DELETE TO authenticated USING (true);

-- journal_attachments
CREATE POLICY "journal_attachments_read" ON public.journal_attachments FOR SELECT TO authenticated USING (true);
CREATE POLICY "journal_attachments_write" ON public.journal_attachments FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "journal_attachments_update" ON public.journal_attachments FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "journal_attachments_delete" ON public.journal_attachments FOR DELETE TO authenticated USING (true);

-- notification_audit_log
CREATE POLICY "notification_audit_log_read" ON public.notification_audit_log FOR SELECT TO authenticated USING (true);
CREATE POLICY "notification_audit_log_write" ON public.notification_audit_log FOR INSERT TO authenticated WITH CHECK (true);

-- notification_preferences
CREATE POLICY "notification_preferences_read" ON public.notification_preferences FOR SELECT TO authenticated USING (true);
CREATE POLICY "notification_preferences_write" ON public.notification_preferences FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "notification_preferences_update" ON public.notification_preferences FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "notification_preferences_delete" ON public.notification_preferences FOR DELETE TO authenticated USING (true);

-- opening_inventories
CREATE POLICY "opening_inventories_read" ON public.opening_inventories FOR SELECT TO authenticated USING (true);
CREATE POLICY "opening_inventories_write" ON public.opening_inventories FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "opening_inventories_update" ON public.opening_inventories FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "opening_inventories_delete" ON public.opening_inventories FOR DELETE TO authenticated USING (true);

-- payment_voucher_attachments
CREATE POLICY "payment_voucher_attachments_read" ON public.payment_voucher_attachments FOR SELECT TO authenticated USING (true);
CREATE POLICY "payment_voucher_attachments_write" ON public.payment_voucher_attachments FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "payment_voucher_attachments_update" ON public.payment_voucher_attachments FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "payment_voucher_attachments_delete" ON public.payment_voucher_attachments FOR DELETE TO authenticated USING (true);

-- permissions
CREATE POLICY "permissions_read" ON public.permissions FOR SELECT TO authenticated USING (true);
CREATE POLICY "permissions_write" ON public.permissions FOR INSERT TO authenticated WITH CHECK (true);

-- purchase_order_items
CREATE POLICY "purchase_order_items_read" ON public.purchase_order_items FOR SELECT TO authenticated USING (true);
CREATE POLICY "purchase_order_items_write" ON public.purchase_order_items FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "purchase_order_items_update" ON public.purchase_order_items FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "purchase_order_items_delete" ON public.purchase_order_items FOR DELETE TO authenticated USING (true);

-- purchase_orders
CREATE POLICY "purchase_orders_read" ON public.purchase_orders FOR SELECT TO authenticated USING (true);
CREATE POLICY "purchase_orders_write" ON public.purchase_orders FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "purchase_orders_update" ON public.purchase_orders FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "purchase_orders_delete" ON public.purchase_orders FOR DELETE TO authenticated USING (true);

-- quotation_items
CREATE POLICY "quotation_items_read" ON public.quotation_items FOR SELECT TO authenticated USING (true);
CREATE POLICY "quotation_items_write" ON public.quotation_items FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "quotation_items_update" ON public.quotation_items FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "quotation_items_delete" ON public.quotation_items FOR DELETE TO authenticated USING (true);

-- quotations
CREATE POLICY "quotations_read" ON public.quotations FOR SELECT TO authenticated USING (true);
CREATE POLICY "quotations_write" ON public.quotations FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "quotations_update" ON public.quotations FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "quotations_delete" ON public.quotations FOR DELETE TO authenticated USING (true);

-- receipt_voucher_attachments
CREATE POLICY "receipt_voucher_attachments_read" ON public.receipt_voucher_attachments FOR SELECT TO authenticated USING (true);
CREATE POLICY "receipt_voucher_attachments_write" ON public.receipt_voucher_attachments FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "receipt_voucher_attachments_update" ON public.receipt_voucher_attachments FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "receipt_voucher_attachments_delete" ON public.receipt_voucher_attachments FOR DELETE TO authenticated USING (true);

-- role_permissions
CREATE POLICY "role_permissions_read" ON public.role_permissions FOR SELECT TO authenticated USING (true);
CREATE POLICY "role_permissions_write" ON public.role_permissions FOR INSERT TO authenticated WITH CHECK (true);

-- roles
CREATE POLICY "roles_read" ON public.roles FOR SELECT TO authenticated USING (true);
CREATE POLICY "roles_write" ON public.roles FOR INSERT TO authenticated WITH CHECK (true);

-- shifts
CREATE POLICY "shifts_read" ON public.shifts FOR SELECT TO authenticated USING (true);
CREATE POLICY "shifts_write" ON public.shifts FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "shifts_update" ON public.shifts FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "shifts_delete" ON public.shifts FOR DELETE TO authenticated USING (true);

-- stock_adjustment_items
CREATE POLICY "stock_adjustment_items_read" ON public.stock_adjustment_items FOR SELECT TO authenticated USING (true);
CREATE POLICY "stock_adjustment_items_write" ON public.stock_adjustment_items FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "stock_adjustment_items_update" ON public.stock_adjustment_items FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "stock_adjustment_items_delete" ON public.stock_adjustment_items FOR DELETE TO authenticated USING (true);

-- stock_transfer_items
CREATE POLICY "stock_transfer_items_read" ON public.stock_transfer_items FOR SELECT TO authenticated USING (true);
CREATE POLICY "stock_transfer_items_write" ON public.stock_transfer_items FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "stock_transfer_items_update" ON public.stock_transfer_items FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "stock_transfer_items_delete" ON public.stock_transfer_items FOR DELETE TO authenticated USING (true);

-- table_sessions
CREATE POLICY "table_sessions_read" ON public.table_sessions FOR SELECT TO authenticated USING (true);
CREATE POLICY "table_sessions_write" ON public.table_sessions FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "table_sessions_update" ON public.table_sessions FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "table_sessions_delete" ON public.table_sessions FOR DELETE TO authenticated USING (true);

-- user_permissions
CREATE POLICY "user_permissions_read" ON public.user_permissions FOR SELECT TO authenticated USING (true);
CREATE POLICY "user_permissions_write" ON public.user_permissions FOR INSERT TO authenticated WITH CHECK (true);

-- التحقق من النتائج
SELECT '✅ تم إضافة سياسات RLS لجميع الـ 20 جداول الأخيرة!' as النتيجة;

SELECT
    tablename,
    COUNT(*) as عدد_السياسات
FROM pg_policies
WHERE tablename IN (
    'cheque_attachments', 'delivery_orders', 'journal_attachments', 'notification_audit_log',
    'notification_preferences', 'opening_inventories', 'payment_voucher_attachments', 'permissions',
    'purchase_order_items', 'purchase_orders', 'quotation_items', 'quotations',
    'receipt_voucher_attachments', 'role_permissions', 'roles', 'shifts',
    'stock_adjustment_items', 'stock_transfer_items', 'table_sessions', 'user_permissions'
)
GROUP BY tablename
ORDER BY tablename;
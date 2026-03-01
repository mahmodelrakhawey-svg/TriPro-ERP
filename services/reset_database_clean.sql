-- 🧹 ملف تنظيف قاعدة البيانات (Reset Data)
-- 🧹 ملف إعادة الضبط السريع (Quick Reset - Truncate)
-- 📅 تاريخ التحديث: 2026-03-01
-- ℹ️ الوصف: يقوم هذا الملف بمسح جميع البيانات التشغيلية والأساسية (Truncate) بسرعة فائقة
-- مع الحفاظ على الهيكل الأساسي (المستخدمين، الصلاحيات، دليل الحسابات، الإعدادات).
-- ⚠️ تحذير: هذا الإجراء لا يمكن التراجع عنه!

BEGIN;

-- استخدام TRUNCATE مع CASCADE لحذف البيانات المرتبطة تلقائياً
-- هذا سيحذف الجداول الرئيسية وما يتبعها من تفاصيل (Items/Lines/Attachments)
-- ويقوم بإعادة تعيين العدادات (IDs)

TRUNCATE TABLE 
    public.journal_entries,
    public.invoices,
    public.purchase_invoices,
    public.sales_returns,
    public.purchase_returns,
    public.quotations,
    public.purchase_orders,
    public.receipt_vouchers,
    public.payment_vouchers,
    public.cheques,
    public.credit_notes,
    public.debit_notes,
    public.stock_transfers,
    public.stock_adjustments,
    public.inventory_counts,
    public.work_orders,
    public.payrolls,
    public.employee_advances,
    public.opening_inventories,
    public.bank_reconciliations,
    public.cash_closings,
    public.rejected_cash_closings,
    public.security_logs,
    public.notifications,
    public.products,
    public.customers,
    public.suppliers,
    public.assets,
    public.employees,
    public.budgets,
    public.warehouses
RESTART IDENTITY CASCADE;

-- ملاحظة: الجداول التالية لم يتم مسحها للحفاظ على تكوين النظام:
-- public.organizations
-- public.company_settings
-- public.accounts
-- public.cost_centers
-- public.profiles
-- public.roles
-- public.permissions
-- public.role_permissions
-- public.notification_preferences

-- إعادة تعيين أرصدة الحسابات إلى الصفر (لأن القيود حذفت)
UPDATE public.accounts SET balance = 0;

-- ضمان وجود بروفايل للمدير العام الافتراضي (System Admin)
-- هذا يضمن وجود مستخدم بصلاحيات كاملة حتى لو تم مسح المستخدمين بالخطأ
DO $$
BEGIN
    INSERT INTO public.profiles (id, full_name, role, is_active)
    VALUES ('00000000-0000-0000-0000-000000000000', 'المدير العام', 'super_admin', true)
    ON CONFLICT (id) DO UPDATE SET role = 'super_admin', is_active = true;
EXCEPTION WHEN foreign_key_violation THEN
    -- تجاهل الخطأ إذا لم يكن المستخدم موجوداً في auth.users
    NULL;
END $$;

COMMIT;

SELECT 'تم تصفير البيانات بنجاح! النظام جاهز للعمل من جديد 🚀' as result;
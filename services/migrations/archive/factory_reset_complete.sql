-- 🏭 ملف إعادة ضبط المصنع بالكامل (Full Factory Reset)
-- ⚠️ تحذير شديد: هذا الملف سيقوم بمسح كل شيء في قاعدة البيانات!
-- بما في ذلك: المستخدمين، الإعدادات، دليل الحسابات، وجميع العمليات.
-- سيتم إعادة النظام إلى نقطة الصفر (كأنه مشروع جديد تماماً).

BEGIN;

-- استخدام TRUNCATE مع CASCADE لحذف جميع البيانات من جميع الجداول وإعادة تعيين العدادات
-- هذا أسرع وأكثر كفاءة من DELETE ويضمن تنظيف كل شيء
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
    public.warehouses,
    public.accounts,
    public.cost_centers,
    public.profiles,
    public.company_settings,
    public.organizations,
    public.item_categories,
    public.notification_preferences
RESTART IDENTITY CASCADE;

COMMIT;

SELECT 'تمت إعادة ضبط المصنع بالكامل! النظام الآن فارغ تماماً 🗑️' as result;
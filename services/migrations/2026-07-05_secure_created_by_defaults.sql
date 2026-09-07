-- =================================================================
-- 🔒 تأمين وتثبيت هويات منشئي المستندات والفواتير (Secure Document Creators)
-- التاريخ: 5 يوليو 2026
-- الوصف: إضافة عمود created_by بشكل آمن وتعريفه تلقائياً (auth.uid())
--        لجميع جداول الفواتير والسندات لضمان تسجيل هوية منشئي المستندات.
-- =================================================================

DO $$
DECLARE
    t text;
    -- قائمة الجداول التي نريد تسجيل وتأمين هوية المنشئ فيها
    tables_list text[] := ARRAY[
        'invoices', 'purchase_invoices', 'sales_returns', 'purchase_returns', 
        'stock_adjustments', 'opening_inventories', 'stock_transfers', 'work_orders',
        'journal_entries', 'receipt_vouchers', 'payment_vouchers'
    ];
BEGIN
    FOREACH t IN ARRAY tables_list LOOP
        -- التحقق من وجود الجدول أولاً
        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = t) THEN
            
            -- أ. إذا كان عمود created_by غير موجود، نقوم بإنشائه مع القيمة الافتراضية
            IF NOT EXISTS (
                SELECT 1 FROM information_schema.columns 
                WHERE table_schema = 'public' AND table_name = t AND column_name = 'created_by'
            ) THEN
                EXECUTE format('ALTER TABLE public.%I ADD COLUMN created_by UUID REFERENCES auth.users(id) DEFAULT auth.uid()', t);
            ELSE
                -- ب. إذا كان موجوداً بالفعل، نقوم بتحديث القيمة الافتراضية فقط لتكون تلقائية
                EXECUTE format('ALTER TABLE public.%I ALTER COLUMN created_by SET DEFAULT auth.uid()', t);
            END IF;
            
        END IF;
    END LOOP;
END $$;

-- تحديث ذاكرة التخزين المؤقت
NOTIFY pgrst, 'reload schema';

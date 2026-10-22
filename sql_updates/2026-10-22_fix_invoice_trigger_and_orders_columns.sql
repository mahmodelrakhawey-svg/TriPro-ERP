-- ==============================================================================
-- إصلاح خطأ: record "new" has no field "type" عند حفظ فاتورة المبيعات
-- وإصلاح خطأ: column orders.payment_method does not exist
-- التاريخ: 2026-10-22
-- ==============================================================================

-- 1. إضافة عمود type إلى جدول invoices إذا لم يكن موجوداً (لتفادي أي أخطاء في المشغلات القديمة)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
          AND table_name = 'invoices' 
          AND column_name = 'type'
    ) THEN
        ALTER TABLE public.invoices ADD COLUMN type text DEFAULT 'sale';
        RAISE NOTICE 'Added column type to public.invoices';
    END IF;
END $$;

-- 2. إضافة عمود payment_method إلى جدول orders إذا لم يكن موجوداً
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
          AND table_name = 'orders' 
          AND column_name = 'payment_method'
    ) THEN
        ALTER TABLE public.orders ADD COLUMN payment_method text DEFAULT 'CASH';
        RAISE NOTICE 'Added column payment_method to public.orders';
    END IF;
END $$;

-- 3. تصحيح دالة مشغل اعتماد الفاتورة التلقائي (إزالة الاعتماد على عمود type)
CREATE OR REPLACE FUNCTION public.fn_auto_approve_invoice_on_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    -- حارس إعادة الدخول لتجنب التكرار
    IF current_setting('app.allow_financial_ledger_mutation', true) = 'true' THEN
        RETURN NEW;
    END IF;

    -- تشغيل الاعتماد التلقائي وقيد اليومية عند اعتماد الفاتورة وعدم وجود قيد مرتبط
    IF NEW.status = 'posted'
       AND NEW.related_journal_entry_id IS NULL
    THEN
        PERFORM public.approve_invoice(
            NEW.id,
            NEW.organization_id,
            NEW.warehouse_id
        );
    END IF;

    RETURN NEW;
END;
$$;

-- 4. تصحيح دالة مشغل بنود الفاتورة
CREATE OR REPLACE FUNCTION public.fn_auto_approve_invoice_on_items_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF current_setting('app.allow_financial_ledger_mutation', true) = 'true' THEN
        RETURN NEW;
    END IF;

    IF EXISTS (
        SELECT 1 FROM public.invoices
        WHERE id = NEW.invoice_id
          AND status = 'posted'
          AND related_journal_entry_id IS NULL
    ) THEN
        PERFORM public.approve_invoice(
            NEW.invoice_id,
            (SELECT organization_id FROM public.invoices WHERE id = NEW.invoice_id),
            (SELECT warehouse_id    FROM public.invoices WHERE id = NEW.invoice_id)
        );
    END IF;

    RETURN NEW;
END;
$$;

-- إعادة ربط المشغلات للتأكد من جاهزيتها
DROP TRIGGER IF EXISTS trg_auto_approve_invoice ON public.invoices;
CREATE TRIGGER trg_auto_approve_invoice
    AFTER INSERT OR UPDATE OF status ON public.invoices
    FOR EACH ROW
    EXECUTE FUNCTION public.fn_auto_approve_invoice_on_insert();

DROP TRIGGER IF EXISTS trg_auto_approve_invoice_items ON public.invoice_items;
CREATE TRIGGER trg_auto_approve_invoice_items
    AFTER INSERT ON public.invoice_items
    FOR EACH ROW
    EXECUTE FUNCTION public.fn_auto_approve_invoice_on_items_insert();

-- ==============================================================================
-- 🚀 TriPro ERP - Migration: Synchronize Quotation Status with Sales Invoices
-- When a Quotation is converted to invoice -> status becomes 'converted'
-- When the Sales Invoice is approved/posted -> status becomes 'posted' (مرحل / مكتمل)
-- ==============================================================================

-- 1. التأكد من وجود عمود quotation_id في جدول فواتير المبيعات
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'invoices' AND column_name = 'quotation_id') THEN 
        ALTER TABLE public.invoices ADD COLUMN quotation_id uuid REFERENCES public.quotations(id) ON DELETE SET NULL; 
    END IF; 
END $$;

-- 2. دالة المزامنة التلقائية لحالة عرض السعر مع حالة فاتورة المبيعات
CREATE OR REPLACE FUNCTION public.fn_sync_quotation_status_from_invoice()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_quote_id uuid;
BEGIN
    v_quote_id := COALESCE(NEW.quotation_id, OLD.quotation_id);
    
    -- إذا لم يكن الربط بالمعرف موجوداً، نبحث بالملاحظات أو رقم العرض
    IF v_quote_id IS NULL AND (NEW.notes IS NOT NULL OR OLD.notes IS NOT NULL) THEN
        SELECT id INTO v_quote_id FROM public.quotations
        WHERE (NEW.notes ILIKE '%' || quotation_number || '%')
           OR (OLD.notes ILIKE '%' || quotation_number || '%')
        LIMIT 1;
    END IF;

    IF v_quote_id IS NOT NULL THEN
        IF TG_OP = 'DELETE' THEN
            -- عند حذف الفاتورة يعود عرض السعر لحالة مرسل
            UPDATE public.quotations SET status = 'sent' WHERE id = v_quote_id;
        ELSE
            -- عند ترحيل الفاتورة تصبح حالة عرض السعر مرحل (posted)
            IF NEW.status IN ('posted', 'paid') THEN
                UPDATE public.quotations SET status = 'posted' WHERE id = v_quote_id;
            -- عند بقاء الفاتورة كمسودة تصبح الحالة محول لفاتورة (converted)
            ELSIF NEW.status = 'draft' THEN
                UPDATE public.quotations SET status = 'converted' WHERE id = v_quote_id;
            END IF;
        END IF;
    END IF;

    RETURN COALESCE(NEW, OLD);
END;
$$;

-- 3. ربط التريجر بجدول فواتير المبيعات
DROP TRIGGER IF EXISTS trg_sync_quotation_status ON public.invoices;
CREATE TRIGGER trg_sync_quotation_status
AFTER INSERT OR UPDATE OF status, quotation_id OR DELETE ON public.invoices
FOR EACH ROW EXECUTE FUNCTION public.fn_sync_quotation_status_from_invoice();

-- 🚀 4. ترميم ومزامنة الحالات الحالية لعرض السعر QT-076308 وكافة العروض السابقة فوراً
DO $$
DECLARE
    r RECORD;
    v_inv record;
BEGIN
    FOR r IN SELECT * FROM public.quotations LOOP
        SELECT * INTO v_inv FROM public.invoices
        WHERE quotation_id = r.id
           OR (notes ILIKE '%' || r.quotation_number || '%')
        ORDER BY created_at DESC LIMIT 1;

        IF v_inv.id IS NOT NULL THEN
            UPDATE public.invoices SET quotation_id = r.id WHERE id = v_inv.id AND quotation_id IS NULL;

            IF v_inv.status IN ('posted', 'paid') THEN
                UPDATE public.quotations SET status = 'posted' WHERE id = r.id;
            ELSE
                UPDATE public.quotations SET status = 'converted' WHERE id = r.id;
            END IF;
        END IF;
    END LOOP;

    NOTIFY pgrst, 'reload schema';
END $$;

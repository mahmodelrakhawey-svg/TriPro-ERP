-- =================================================================
-- TriPro ERP - Wastage Management Module
-- التاريخ: 26 مارس 2026
-- الوصف: إضافة نظام لتسجيل الهدر في المطبخ مع ترحيل محاسبي آلي
-- =================================================================

-- 1. جدول لتسجيل عمليات الهدر
CREATE TABLE IF NOT EXISTS public.wastage_logs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id uuid NOT NULL REFERENCES public.products(id),
    quantity NUMERIC(10, 2) NOT NULL CHECK (quantity > 0),
    reason TEXT,
    user_id uuid REFERENCES auth.users(id),
    wastage_date TIMESTAMPTZ DEFAULT NOW(),
    related_journal_entry_id uuid REFERENCES public.journal_entries(id),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE public.wastage_logs IS 'سجل لعمليات الهدر والتالف للمواد الخام والمنتجات.';
COMMENT ON COLUMN public.wastage_logs.reason IS 'سبب الهدر (مثال: انتهاء صلاحية، احتراق، تلف).';
COMMENT ON COLUMN public.wastage_logs.related_journal_entry_id IS 'رابط للقيد المحاسبي الذي تم إنشاؤه لهذه العملية.';

-- 2. دالة RPC لتسجيل الهدر وترحيله
CREATE OR REPLACE FUNCTION public.record_wastage(
    p_product_id UUID,
    p_quantity NUMERIC,
    p_reason TEXT,
    p_user_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_product RECORD;
    v_wastage_acc_id UUID;
    v_inventory_acc_id UUID;
    v_wastage_cost NUMERIC;
    v_journal_entry_id UUID;
    v_wastage_log_id UUID;
BEGIN
    -- أ. التحقق من المدخلات
    IF p_quantity <= 0 THEN
        RAISE EXCEPTION 'الكمية يجب أن تكون أكبر من صفر.';
    END IF;

    -- ب. جلب بيانات المنتج وتكلفته
    SELECT id, name, cost, inventory_account_id INTO v_product FROM public.products WHERE id = p_product_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'المنتج غير موجود.'; END IF;

    v_wastage_cost := COALESCE(v_product.cost, 0) * p_quantity;

    -- ج. جلب الحسابات المحاسبية
    SELECT id INTO v_wastage_acc_id FROM public.accounts WHERE code = '542' LIMIT 1; -- مصروف هدر وتالف
    v_inventory_acc_id := COALESCE(v_product.inventory_account_id, (SELECT id FROM public.accounts WHERE code = '10301' LIMIT 1));

    IF v_wastage_acc_id IS NULL OR v_inventory_acc_id IS NULL THEN
        RAISE EXCEPTION 'حسابات الهدر (542) أو المخزون (10301) غير معرفة في دليل الحسابات.';
    END IF;

    -- د. خصم الكمية من المخزون
    UPDATE public.products SET stock = stock - p_quantity WHERE id = p_product_id;

    -- هـ. إنشاء القيد المحاسبي (فقط إذا كانت هناك تكلفة)
    IF v_wastage_cost > 0 THEN
        INSERT INTO public.journal_entries (transaction_date, description, reference, status, user_id)
        VALUES (now(), 'إثبات هدر للمنتج: ' || v_product.name, 'WASTAGE', 'posted', p_user_id)
        RETURNING id INTO v_journal_entry_id;

        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description)
        VALUES
            (v_journal_entry_id, v_wastage_acc_id, v_wastage_cost, 0, 'مصروف هدر وتالف'),
            (v_journal_entry_id, v_inventory_acc_id, 0, v_wastage_cost, 'تخفيض المخزون بسبب الهدر');
    END IF;

    -- و. تسجيل العملية في سجل الهدر
    INSERT INTO public.wastage_logs (product_id, quantity, reason, user_id, related_journal_entry_id)
    VALUES (p_product_id, p_quantity, p_reason, p_user_id, v_journal_entry_id)
    RETURNING id INTO v_wastage_log_id;

    RETURN jsonb_build_object('success', true, 'wastage_log_id', v_wastage_log_id, 'journal_entry_id', v_journal_entry_id);
END;
$$;

-- تفعيل RLS
ALTER TABLE public.wastage_logs ENABLE ROW LEVEL SECURITY;
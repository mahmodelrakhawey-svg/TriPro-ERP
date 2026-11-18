-- ==============================================================================
-- 🛡️ TriPro ERP — دالة حذف وإلغاء ترحيل الجرد المخزني بأمان تام (Delete & Unpost Inventory Count)
-- File: services/migrations/2026-11-18_rpc_delete_inventory_count.sql
-- ==============================================================================
-- الغرض: تمكين حذف أو التراجع عن كشف جرد مخزني مرحل مع فك تحصين القيود المحاسبية
--        المرتبطة به داخل معاملة ذرية آمنة (Atomic Transaction) وإعادة احتساب الأرصدة.
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.delete_inventory_count(p_count_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_count record;
    v_adj record;
    v_je record;
    v_adj_no text;
BEGIN
    -- 1. التحقق من وجود كشف الجرد
    SELECT * INTO v_count FROM public.inventory_counts WHERE id = p_count_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'كشف الجرد المطلوب حذفه غير موجود (ID: %)', p_count_id;
    END IF;

    -- 2. تفعيل صلاحية تعديل القيود المحاسبية داخلياً للأمان (Bypass Immutability Trigger)
    PERFORM set_config('app.allow_financial_ledger_mutation', 'true', true);

    -- 3. في حال كان كشف الجرد مرحلاً (Posted)
    IF v_count.status = 'posted' THEN
        v_adj_no := 'ADJ-CNT-' || v_count.count_number;

        -- أ. البحث عن التسويات المخزنية المرتبطة برقم هذا الجرد
        FOR v_adj IN 
            SELECT id FROM public.stock_adjustments 
            WHERE adjustment_number = v_adj_no 
               OR reason LIKE '%' || v_count.count_number || '%'
        LOOP
            -- ب. البحث عن قيود اليومية المرتبطة بالتسوية أو برقم الجرد وحذف سطورها وقيدها
            FOR v_je IN 
                SELECT id FROM public.journal_entries 
                WHERE reference = v_adj_no 
                   OR (related_document_id = v_adj.id AND related_document_type = 'stock_adjustment')
            LOOP
                DELETE FROM public.journal_lines WHERE journal_entry_id = v_je.id;
                DELETE FROM public.journal_entries WHERE id = v_je.id;
            END LOOP;

            -- ج. حذف بنود التسوية ورأس التسوية
            DELETE FROM public.stock_adjustment_items WHERE stock_adjustment_id = v_adj.id;
            DELETE FROM public.stock_adjustments WHERE id = v_adj.id;
        END LOOP;

        -- د. تحصين إضافي: حذف أي قيد يومية ما زال يحمل نفس المرجع
        FOR v_je IN SELECT id FROM public.journal_entries WHERE reference = v_adj_no LOOP
            DELETE FROM public.journal_lines WHERE journal_entry_id = v_je.id;
            DELETE FROM public.journal_entries WHERE id = v_je.id;
        END LOOP;
    END IF;

    -- 4. حذف بنود كشف الجرد
    DELETE FROM public.inventory_count_items WHERE inventory_count_id = p_count_id;

    -- 5. حذف رأس كشف الجرد
    DELETE FROM public.inventory_counts WHERE id = p_count_id;

    -- 6. إعادة احتساب أرصدة المخزون بالكامل للمنظمة
    IF v_count.organization_id IS NOT NULL THEN
        PERFORM public.recalculate_stock_rpc(v_count.organization_id);
    ELSE
        PERFORM public.recalculate_stock_rpc();
    END IF;

    -- 7. إغلاق الصلاحية المؤقتة للأمان
    PERFORM set_config('app.allow_financial_ledger_mutation', 'false', true);

    RETURN true;
EXCEPTION WHEN OTHERS THEN
    PERFORM set_config('app.allow_financial_ledger_mutation', 'false', true);
    RAISE;
END;
$$;

-- منح الصلاحيات للمستخدمين الموثقين
GRANT EXECUTE ON FUNCTION public.delete_inventory_count(uuid) TO authenticated, service_role;

COMMENT ON FUNCTION public.delete_inventory_count(uuid) IS 'دالة آمنة لحذف كشف الجرد المخزني وعكس التسويات المخزنية والقيود المحاسبية المرتبطة به تلقائياً';

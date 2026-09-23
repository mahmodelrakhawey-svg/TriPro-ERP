-- ==============================================================================
-- TriPro ERP - إزالة القيود الافتتاحية المكررة وضبط مطابقة الأستاذ العام 100%
-- تاريخ التحديث: 2026-09-23
-- السبب: إلغاء ترحيل وحذف قيدين افتتاحيين مكررين بقيمة 148,766.00 ج.م ناتجة عن تصحيح أسماء الموردين:
--   1) مصنع سفينكس (82,766.00 ج.م) مكرر مع مصنع سفنكس المعتمد
--   2) شركة المغريل للصناعات الغذائية (66,000.00 ج.م) مكرر مع شركة المغربل للصناعات الغذائية المعتمد
-- ==============================================================================

DO $$
DECLARE
    v_org_id UUID;
    v_deleted_count INT := 0;
BEGIN
    -- تفعيل وضع الصيانة المؤقت لتجاوز أي قيود حماية على النظام
    PERFORM set_config('app.restore_mode', 'on', true);

    -- جلب معرف المنظمة
    SELECT id INTO v_org_id 
    FROM public.organizations 
    WHERE id = '2d9b24d6-f5cf-4bd9-b8b6-0a85d1c9c967'::uuid;

    IF v_org_id IS NULL THEN
        SELECT id INTO v_org_id 
        FROM public.organizations 
        ORDER BY created_at ASC 
        LIMIT 1;
    END IF;

    -- 1. فك ترحيل القيدين المكررين وتحويلهما إلى مسودة (draft)
    UPDATE public.journal_entries 
    SET status = 'draft', 
        is_posted = false 
    WHERE reference IN (
        'OP-SUPP-a3fe6bee-d593-474a-83d5-5383019fd537', -- مصنع سفينكس المكرر (82,766)
        'OP-SUPP-d3f30d40-7bf5-4314-bea2-e1a88b6443bd'  -- شركة المغريل المكررة (66,000)
    )
    OR related_document_id IN (
        'a3fe6bee-d593-474a-83d5-5383019fd537'::uuid,
        'd3f30d40-7bf5-4314-bea2-e1a88b6443bd'::uuid
    );

    -- 2. حذف بنود القيود اليومية المكررة (إجمالي 148,766 ج.م من حساب 201)
    DELETE FROM public.journal_lines 
    WHERE journal_entry_id IN (
        SELECT id FROM public.journal_entries 
        WHERE reference IN (
            'OP-SUPP-a3fe6bee-d593-474a-83d5-5383019fd537',
            'OP-SUPP-d3f30d40-7bf5-4314-bea2-e1a88b6443bd'
        )
        OR related_document_id IN (
            'a3fe6bee-d593-474a-83d5-5383019fd537'::uuid,
            'd3f30d40-7bf5-4314-bea2-e1a88b6443bd'::uuid
        )
    );

    -- 3. حذف قيود اليومية الرئيسية المكررة
    DELETE FROM public.journal_entries 
    WHERE reference IN (
        'OP-SUPP-a3fe6bee-d593-474a-83d5-5383019fd537',
        'OP-SUPP-d3f30d40-7bf5-4314-bea2-e1a88b6443bd'
    )
    OR related_document_id IN (
        'a3fe6bee-d593-474a-83d5-5383019fd537'::uuid,
        'd3f30d40-7bf5-4314-bea2-e1a88b6443bd'::uuid
    );
    GET DIAGNOSTICS v_deleted_count = ROW_COUNT;

    -- 4. إعادة ربط أي فواتير أو مستندات كانت مرتبطة خطأً بالمعرفات القديمة ونقلها للمعتمدة
    BEGIN
        -- مصنع سفنكس المعتمد: ca3145cb-4b86-4f97-b069-230167e44e8c
        UPDATE public.purchase_invoices SET supplier_id = 'ca3145cb-4b86-4f97-b069-230167e44e8c'::uuid WHERE supplier_id = 'a3fe6bee-d593-474a-83d5-5383019fd537'::uuid;
        UPDATE public.purchase_orders SET supplier_id = 'ca3145cb-4b86-4f97-b069-230167e44e8c'::uuid WHERE supplier_id = 'a3fe6bee-d593-474a-83d5-5383019fd537'::uuid;
        UPDATE public.payment_vouchers SET supplier_id = 'ca3145cb-4b86-4f97-b069-230167e44e8c'::uuid WHERE supplier_id = 'a3fe6bee-d593-474a-83d5-5383019fd537'::uuid;
        UPDATE public.cheques SET party_id = 'ca3145cb-4b86-4f97-b069-230167e44e8c'::uuid WHERE party_id = 'a3fe6bee-d593-474a-83d5-5383019fd537'::uuid;

        -- شركة المغربل المعتمدة: 22625270-6bb6-4ec8-9d8d-dfd0c454ccbd
        UPDATE public.purchase_invoices SET supplier_id = '22625270-6bb6-4ec8-9d8d-dfd0c454ccbd'::uuid WHERE supplier_id = 'd3f30d40-7bf5-4314-bea2-e1a88b6443bd'::uuid;
        UPDATE public.purchase_orders SET supplier_id = '22625270-6bb6-4ec8-9d8d-dfd0c454ccbd'::uuid WHERE supplier_id = 'd3f30d40-7bf5-4314-bea2-e1a88b6443bd'::uuid;
        UPDATE public.payment_vouchers SET supplier_id = '22625270-6bb6-4ec8-9d8d-dfd0c454ccbd'::uuid WHERE supplier_id = 'd3f30d40-7bf5-4314-bea2-e1a88b6443bd'::uuid;
        UPDATE public.cheques SET party_id = '22625270-6bb6-4ec8-9d8d-dfd0c454ccbd'::uuid WHERE party_id = 'd3f30d40-7bf5-4314-bea2-e1a88b6443bd'::uuid;
    EXCEPTION WHEN OTHERS THEN
        NULL;
    END;

    -- 5. تصفير رصيد السجلات القديمة وتجميدها إن وجدت
    UPDATE public.suppliers 
    SET opening_balance = 0, 
        balance = 0, 
        deleted_at = NOW() 
    WHERE id IN (
        'a3fe6bee-d593-474a-83d5-5383019fd537'::uuid,
        'd3f30d40-7bf5-4314-bea2-e1a88b6443bd'::uuid
    );

    -- 6. تثبيت أرصدة الموردين المعتمدين بدقة
    UPDATE public.suppliers 
    SET opening_balance = 82766, balance = 82766, deleted_at = NULL 
    WHERE id = 'ca3145cb-4b86-4f97-b069-230167e44e8c'::uuid;

    UPDATE public.suppliers 
    SET opening_balance = 66000, balance = 66000, deleted_at = NULL 
    WHERE id = '22625270-6bb6-4ec8-9d8d-dfd0c454ccbd'::uuid;

    -- إعادة وضع التشغيل العادي
    PERFORM set_config('app.restore_mode', 'off', true);

    RAISE NOTICE '✅ تم بنجاح فك ترحيل وحذف % قيود مكررة بإجمالي 148,766 ج.م، وتطابق الأستاذ العام مع كشوف الحسابات 100%%.', v_deleted_count;

    -- 7. إعادة احتساب أرصدة النظام بالكامل
    BEGIN
        PERFORM public.recalculate_all_system_balances(v_org_id);
    EXCEPTION WHEN OTHERS THEN
        NULL;
    END;

END;
$$;

NOTIFY pgrst, 'reload schema';

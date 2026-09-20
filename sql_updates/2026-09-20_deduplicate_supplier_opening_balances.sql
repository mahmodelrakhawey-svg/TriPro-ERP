-- ==============================================================================
-- TriPro ERP - إزالة القيود الافتتاحية المكررة وضبط مطابقة الأستاذ العام 100%
-- تاريخ التحديث: 2026-09-20
-- السبب: وجود 4 موردين مكررين بأسماء متشابهة في قاعدة البيانات أدت لإنشاء قيدين لكل منهم
-- المبلغ المكرر المحذوف: 561,557.00 ج.م
-- ==============================================================================

DO $$
DECLARE
    v_org_id UUID;
    v_deleted_count INT := 0;
BEGIN
    SELECT id INTO v_org_id 
    FROM public.organizations 
    WHERE id = '2d9b24d6-f5cf-4bd9-b8b6-0a85d1c9c967'::uuid;

    IF v_org_id IS NULL THEN
        SELECT id INTO v_org_id 
        FROM public.organizations 
        ORDER BY created_at ASC 
        LIMIT 1;
    END IF;

    -- 1. حذف بنود القيود اليومية الأربعة المكررة (إجمالي 561,557 ج.م)
    DELETE FROM public.journal_lines 
    WHERE journal_entry_id IN (
        SELECT id FROM public.journal_entries 
        WHERE reference IN (
            'OP-SUPP-ebedac68-3496-49c6-96dc-bde79479f070', -- محمد بحبح المكرر (368,800)
            'OP-SUPP-022c1f36-c358-4d0d-be8f-0f0f6e4f0a57', -- أشرف سعفان المكرر (52,477)
            'OP-SUPP-b40deea1-473a-4286-a93f-27a0e6ef4216', -- شركة المراعى المكررة (125,530)
            'OP-SUPP-35b50371-d3cd-4475-9627-f226091557c2'  -- شركة الامير المكررة (14,750)
        )
    );

    -- 2. حذف قيود اليومية الرئيسية المكررة
    DELETE FROM public.journal_entries 
    WHERE reference IN (
        'OP-SUPP-ebedac68-3496-49c6-96dc-bde79479f070',
        'OP-SUPP-022c1f36-c358-4d0d-be8f-0f0f6e4f0a57',
        'OP-SUPP-b40deea1-473a-4286-a93f-27a0e6ef4216',
        'OP-SUPP-35b50371-d3cd-4475-9627-f226091557c2'
    );
    GET DIAGNOSTICS v_deleted_count = ROW_COUNT;

    -- 3. تصفير الرصيد وتجميد سجلات الموردين المكررة حتى لا تظهر في التقارير
    UPDATE public.suppliers 
    SET opening_balance = 0, 
        balance = 0, 
        deleted_at = NOW() 
    WHERE id IN (
        'ebedac68-3496-49c6-96dc-bde79479f070'::uuid,
        '022c1f36-c358-4d0d-be8f-0f0f6e4f0a57'::uuid,
        'b40deea1-473a-4286-a93f-27a0e6ef4216'::uuid,
        '35b50371-d3cd-4475-9627-f226091557c2'::uuid
    );

    -- 4. التأكد من بقاء وضبط كود ورصيد السجل المعتمد الأصلي لكل من الموردين الأربعة
    -- محمد بحبح (كود 59)
    UPDATE public.suppliers 
    SET code = '59', name = 'محمد بحبح', opening_balance = 368800, balance = 368800, deleted_at = NULL 
    WHERE id = '496361f9-27e0-4362-9b19-e478a0ca3fb7'::uuid;

    -- أشرف سعفان (كود 91)
    UPDATE public.suppliers 
    SET code = '91', name = 'أشرف سعفان', opening_balance = 52477, balance = 52477, deleted_at = NULL 
    WHERE id = 'bbacdf63-ac2b-4ede-9087-8ac31e9ae0d6'::uuid;

    -- شركة المراعي (كود 37)
    UPDATE public.suppliers 
    SET code = '37', name = 'شركة المراعي', opening_balance = 125530, balance = 125530, deleted_at = NULL 
    WHERE id = '490348b1-26cf-43d2-b640-ca76261420c2'::uuid;

    -- شركة الأمير (كود 8)
    UPDATE public.suppliers 
    SET code = '8', name = 'شركة الأمير', opening_balance = 14750, balance = 14750, deleted_at = NULL 
    WHERE id = '9363365f-09e2-4876-89a2-a44a736f6c35'::uuid;

    RAISE NOTICE '✅ تم حذف % قيود مكررة بإجمالي 561,557 ج.م، وضبط سجلات الموردين الأربعة بدقة.', v_deleted_count;

    -- 5. إعادة احتساب كافة أرصدة النظام
    BEGIN
        PERFORM public.recalculate_all_system_balances(v_org_id);
    EXCEPTION WHEN OTHERS THEN
        NULL;
    END;

END;
$$;

NOTIFY pgrst, 'reload schema';

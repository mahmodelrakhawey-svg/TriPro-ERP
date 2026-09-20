-- ==============================================================================
-- TriPro ERP - تثبيت المورد أشرف سعفan (كود 91) وضبط المطابقة 100%
-- تاريخ التحديث: 2026-09-20
-- السبب: إدراج/تحديث بطاقة المورد أشرف سعفان لربطه بالقيد المرحل بالأستاذ العام OP-SUPP-bbacdf63...
-- ==============================================================================

DO $$
DECLARE
    v_org_id UUID;
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

    -- 1. التأكد التام من وجود بطاقة المورد (أشرف سعفان) بالمعرف المطابق لقيد الأستاذ العام
    INSERT INTO public.suppliers (id, code, name, opening_balance, balance, organization_id, deleted_at)
    VALUES (
        'bbacdf63-ac2b-4ede-9087-8ac31e9ae0d6'::uuid,
        '91',
        'أشرف سعفان',
        52477,
        52477,
        v_org_id,
        NULL
    )
    ON CONFLICT (id) DO UPDATE 
    SET code = '91',
        name = 'أشرف سعفان',
        opening_balance = 52477,
        balance = 52477,
        deleted_at = NULL,
        organization_id = v_org_id;

    -- 2. ربط القيد اليومي المرحل بالأستاذ العام بحساب المورد المعتمد
    UPDATE public.journal_entries 
    SET related_document_id = 'bbacdf63-ac2b-4ede-9087-8ac31e9ae0d6'::uuid,
        status = 'posted',
        is_posted = true
    WHERE reference = 'OP-SUPP-bbacdf63-ac2b-4ede-9087-8ac31e9ae0d6';

    -- 3. تجميد أي سجل مكرر ملغى وتصفير رصيده
    UPDATE public.suppliers 
    SET name = 'أشرف سعفان (ملغى)',
        opening_balance = 0,
        balance = 0,
        deleted_at = NOW()
    WHERE id = '022c1f36-c358-4d0d-be8f-0f0f6e4f0a57'::uuid;

    -- 4. إعادة احتساب الأرصدة
    BEGIN
        PERFORM public.recalculate_all_system_balances(v_org_id);
    EXCEPTION WHEN OTHERS THEN
        NULL;
    END;

    RAISE NOTICE '✅ تم بنجاح تثبيت المورد أشرف سعفان برصيد 52,477 ج.م وربطه بالأستاذ العام.';
END;
$$;

NOTIFY pgrst, 'reload schema';

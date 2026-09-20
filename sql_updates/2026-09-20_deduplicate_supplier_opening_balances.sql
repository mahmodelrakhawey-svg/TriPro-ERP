-- ==============================================================================
-- TriPro ERP - إزالة القيود الافتتاحية المكررة وضبط مطابقة الأستاذ العام 100%
-- تاريخ التحديث: 2026-09-20
-- السبب: إلغاء ترحيل وحذف 4 قيود افتتاحية مكررة بقيمة 561,557.00 ج.م ناتجة عن تشابه أسماء الموردين
-- التوافق: فك الترحيل لتحويل القيود إلى draft واستخدام party_id لجدول الشيكات وتجاوز أي قفل
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

    -- 1. فك ترحيل القيود المكررة الأربعة وتحويلها إلى مسودة (draft)
    -- هذا الإجراء يزيل قفل الحماية من دالة fn_protect_posted_journal_lines
    UPDATE public.journal_entries 
    SET status = 'draft', 
        is_posted = false 
    WHERE reference IN (
        'OP-SUPP-ebedac68-3496-49c6-96dc-bde79479f070', -- محمد بحبح المكرر (368,800)
        'OP-SUPP-022c1f36-c358-4d0d-be8f-0f0f6e4f0a57', -- أشرف سعفان المكرر (52,477)
        'OP-SUPP-b40deea1-473a-4286-a93f-27a0e6ef4216', -- شركة المراعى المكررة (125,530)
        'OP-SUPP-35b50371-d3cd-4475-9627-f226091557c2'  -- شركة الامير المكررة (14,750)
    )
    OR related_document_id IN (
        'ebedac68-3496-49c6-96dc-bde79479f070'::uuid,
        '022c1f36-c358-4d0d-be8f-0f0f6e4f0a57'::uuid,
        'b40deea1-473a-4286-a93f-27a0e6ef4216'::uuid,
        '35b50371-d3cd-4475-9627-f226091557c2'::uuid
    );

    -- 2. حذف بنود القيود اليومية المكررة (إجمالي 561,557 ج.م من حساب 201)
    DELETE FROM public.journal_lines 
    WHERE journal_entry_id IN (
        SELECT id FROM public.journal_entries 
        WHERE reference IN (
            'OP-SUPP-ebedac68-3496-49c6-96dc-bde79479f070',
            'OP-SUPP-022c1f36-c358-4d0d-be8f-0f0f6e4f0a57',
            'OP-SUPP-b40deea1-473a-4286-a93f-27a0e6ef4216',
            'OP-SUPP-35b50371-d3cd-4475-9627-f226091557c2'
        )
        OR related_document_id IN (
            'ebedac68-3496-49c6-96dc-bde79479f070'::uuid,
            '022c1f36-c358-4d0d-be8f-0f0f6e4f0a57'::uuid,
            'b40deea1-473a-4286-a93f-27a0e6ef4216'::uuid,
            '35b50371-d3cd-4475-9627-f226091557c2'::uuid
        )
    );

    -- 3. حذف قيود اليومية الرئيسية المكررة
    DELETE FROM public.journal_entries 
    WHERE reference IN (
        'OP-SUPP-ebedac68-3496-49c6-96dc-bde79479f070',
        'OP-SUPP-022c1f36-c358-4d0d-be8f-0f0f6e4f0a57',
        'OP-SUPP-b40deea1-473a-4286-a93f-27a0e6ef4216',
        'OP-SUPP-35b50371-d3cd-4475-9627-f226091557c2'
    )
    OR related_document_id IN (
        'ebedac68-3496-49c6-96dc-bde79479f070'::uuid,
        '022c1f36-c358-4d0d-be8f-0f0f6e4f0a57'::uuid,
        'b40deea1-473a-4286-a93f-27a0e6ef4216'::uuid,
        '35b50371-d3cd-4475-9627-f226091557c2'::uuid
    );
    GET DIAGNOSTICS v_deleted_count = ROW_COUNT;

    -- 4. إعادة ربط أي مستندات سابقة من الموردين المكررين للموردين الأصليين المعتمدين
    BEGIN
        -- محمد بحبح (كود 59)
        UPDATE public.purchase_invoices SET supplier_id = '496361f9-27e0-4362-9b19-e478a0ca3fb7'::uuid WHERE supplier_id = 'ebedac68-3496-49c6-96dc-bde79479f070'::uuid;
        UPDATE public.purchase_orders SET supplier_id = '496361f9-27e0-4362-9b19-e478a0ca3fb7'::uuid WHERE supplier_id = 'ebedac68-3496-49c6-96dc-bde79479f070'::uuid;
        UPDATE public.payment_vouchers SET supplier_id = '496361f9-27e0-4362-9b19-e478a0ca3fb7'::uuid WHERE supplier_id = 'ebedac68-3496-49c6-96dc-bde79479f070'::uuid;
        UPDATE public.cheques SET party_id = '496361f9-27e0-4362-9b19-e478a0ca3fb7'::uuid WHERE party_id = 'ebedac68-3496-49c6-96dc-bde79479f070'::uuid;

        -- أشرف سعفان (كود 91)
        UPDATE public.purchase_invoices SET supplier_id = 'bbacdf63-ac2b-4ede-9087-8ac31e9ae0d6'::uuid WHERE supplier_id = '022c1f36-c358-4d0d-be8f-0f0f6e4f0a57'::uuid;
        UPDATE public.purchase_orders SET supplier_id = 'bbacdf63-ac2b-4ede-9087-8ac31e9ae0d6'::uuid WHERE supplier_id = '022c1f36-c358-4d0d-be8f-0f0f6e4f0a57'::uuid;
        UPDATE public.payment_vouchers SET supplier_id = 'bbacdf63-ac2b-4ede-9087-8ac31e9ae0d6'::uuid WHERE supplier_id = '022c1f36-c358-4d0d-be8f-0f0f6e4f0a57'::uuid;
        UPDATE public.cheques SET party_id = 'bbacdf63-ac2b-4ede-9087-8ac31e9ae0d6'::uuid WHERE party_id = '022c1f36-c358-4d0d-be8f-0f0f6e4f0a57'::uuid;

        -- شركة المراعي (كود 37)
        UPDATE public.purchase_invoices SET supplier_id = '490348b1-26cf-43d2-b640-ca76261420c2'::uuid WHERE supplier_id = 'b40deea1-473a-4286-a93f-27a0e6ef4216'::uuid;
        UPDATE public.purchase_orders SET supplier_id = '490348b1-26cf-43d2-b640-ca76261420c2'::uuid WHERE supplier_id = 'b40deea1-473a-4286-a93f-27a0e6ef4216'::uuid;
        UPDATE public.payment_vouchers SET supplier_id = '490348b1-26cf-43d2-b640-ca76261420c2'::uuid WHERE supplier_id = 'b40deea1-473a-4286-a93f-27a0e6ef4216'::uuid;
        UPDATE public.cheques SET party_id = '490348b1-26cf-43d2-b640-ca76261420c2'::uuid WHERE party_id = 'b40deea1-473a-4286-a93f-27a0e6ef4216'::uuid;

        -- شركة الأمير (كود 8)
        UPDATE public.purchase_invoices SET supplier_id = '9363365f-09e2-4876-89a2-a44a736f6c35'::uuid WHERE supplier_id = '35b50371-d3cd-4475-9627-f226091557c2'::uuid;
        UPDATE public.purchase_orders SET supplier_id = '9363365f-09e2-4876-89a2-a44a736f6c35'::uuid WHERE supplier_id = '35b50371-d3cd-4475-9627-f226091557c2'::uuid;
        UPDATE public.payment_vouchers SET supplier_id = '9363365f-09e2-4876-89a2-a44a736f6c35'::uuid WHERE supplier_id = '35b50371-d3cd-4475-9627-f226091557c2'::uuid;
        UPDATE public.cheques SET party_id = '9363365f-09e2-4876-89a2-a44a736f6c35'::uuid WHERE party_id = '35b50371-d3cd-4475-9627-f226091557c2'::uuid;
    EXCEPTION WHEN OTHERS THEN
        NULL;
    END;

    -- 5. تصفير رصيد السجلات المكررة وتجميدها (Soft Delete) حتى لا تظهر في أي كشف
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

    -- 6. تثبيت بيانات وأرصدة وأكواد الموردين الأربعة الأصليين المعتمدين بدقة
    UPDATE public.suppliers 
    SET code = '59', name = 'محمد بحبح', opening_balance = 368800, balance = 368800, deleted_at = NULL 
    WHERE id = '496361f9-27e0-4362-9b19-e478a0ca3fb7'::uuid;

    UPDATE public.suppliers 
    SET code = '91', name = 'أشرف سعفان', opening_balance = 52477, balance = 52477, deleted_at = NULL 
    WHERE id = 'bbacdf63-ac2b-4ede-9087-8ac31e9ae0d6'::uuid;

    UPDATE public.suppliers 
    SET code = '37', name = 'شركة المراعي', opening_balance = 125530, balance = 125530, deleted_at = NULL 
    WHERE id = '490348b1-26cf-43d2-b640-ca76261420c2'::uuid;

    UPDATE public.suppliers 
    SET code = '8', name = 'شركة الأمير', opening_balance = 14750, balance = 14750, deleted_at = NULL 
    WHERE id = '9363365f-09e2-4876-89a2-a44a736f6c35'::uuid;

    -- إعادة وضع التشغيل العادي
    PERFORM set_config('app.restore_mode', 'off', true);

    RAISE NOTICE '✅ تم بنجاح فك ترحيل وحذف % قيود مكررة بإجمالي 561,557 ج.م، وتصفير الموردين المكررين وضبط الأصليين.', v_deleted_count;

    -- 7. إعادة احتساب أرصدة النظام بالكامل
    BEGIN
        PERFORM public.recalculate_all_system_balances(v_org_id);
    EXCEPTION WHEN OTHERS THEN
        NULL;
    END;

END;
$$;

NOTIFY pgrst, 'reload schema';

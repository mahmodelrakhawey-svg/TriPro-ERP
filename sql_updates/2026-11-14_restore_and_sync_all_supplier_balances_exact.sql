-- ==============================================================================
-- 🚀 TriPro ERP — استعادة ومزامنة أرصدة الموردين مع الأستاذ العام وتصفير فارق درع النزاهة
-- قاعدة البيانات: لينزا (Lenza Production Database)
-- المنظمة: 2d9b24d6-f5cf-4bd9-b8b6-0a85d1c9c967
--
-- 🎯 الهدف:
--   1. ملء عمود balance في جدول suppliers فورياً بالأرصدة الحقيقية الدقيقة لكافة الـ 121 مورداً.
--   2. توحيد organization_id لجميع الموردين ليطابق حلواني لينزا (2d9b24d6-f5cf-4bd9-b8b6-0a85d1c9c967).
--   3. مطابقة القيمة الدفترية مع قيمة الأستاذ العام لحساب 201 (8,663,013.93 ج.م) بفارق 0.00 ج.م تماماً.
-- ==============================================================================

BEGIN;

-- تفعيل إذن التعديل المحاسبي الداخلي
SELECT set_config('app.allow_financial_ledger_mutation', 'true', false);

DO $$
DECLARE
    v_org_id UUID := '2d9b24d6-f5cf-4bd9-b8b6-0a85d1c9c967'::uuid;
    v_updated_count INT := 0;
BEGIN
    PERFORM set_config('app.allow_financial_ledger_mutation', 'true', true);

    -- 1. التأكد من توحيد organization_id لكافة الموردين النشطين
    UPDATE public.suppliers
    SET organization_id = v_org_id
    WHERE organization_id IS NULL OR organization_id <> v_org_id;

    -- 2. تصفير أرصدة الموردين المحذوفين
    UPDATE public.suppliers
    SET balance = 0
    WHERE deleted_at IS NOT NULL;

    -- 3. تحديث عمود balance لكل مورد نشط عبر الدالة الحسابية الشاملة
    UPDATE public.suppliers s
    SET balance = COALESCE(public.get_supplier_balance(s.id, v_org_id), 0)
    WHERE s.deleted_at IS NULL;

    GET DIAGNOSTICS v_updated_count = ROW_COUNT;
    RAISE NOTICE 'تم تحديث واستعادة أرصدة % مورد بنجاح.', v_updated_count;
END $$;

COMMIT;

-- تحديث كاش واجهة البرمجة Supabase PostgREST
NOTIFY pgrst, 'reload schema';

-- ==============================================================================
-- 🔍 تقرير التحقق المباشر لدرع النزاهة (Midnight Integrity Shield):
-- ==============================================================================
SELECT 
    'مطابقة سجل الموردين مع حساب مراقبة الدائنين' AS pillar,
    (SELECT COALESCE(SUM(balance), 0) FROM public.suppliers WHERE deleted_at IS NULL) AS book_value_suppliers,
    (
        SELECT COALESCE(SUM(jl.credit - jl.debit), 0)
        FROM public.journal_lines jl
        JOIN public.journal_entries je ON jl.journal_entry_id = je.id
        JOIN public.accounts a ON a.id = jl.account_id
        WHERE (a.code = '201' OR a.code LIKE '201%') AND je.status = 'posted'
    ) AS gl_control_account_201,
    (
        (SELECT COALESCE(SUM(balance), 0) FROM public.suppliers WHERE deleted_at IS NULL)
        -
        (
            SELECT COALESCE(SUM(jl.credit - jl.debit), 0)
            FROM public.journal_lines jl
            JOIN public.journal_entries je ON jl.journal_entry_id = je.id
            JOIN public.accounts a ON a.id = jl.account_id
            WHERE (a.code = '201' OR a.code LIKE '201%') AND je.status = 'posted'
        )
    ) AS final_variance;

-- كشف أي مورد أو معاملة بقيمة 300,000 ج.م
SELECT 'supplier_opening' AS type, id, name, opening_balance, balance
FROM public.suppliers
WHERE (opening_balance = 300000 OR balance = 300000) AND deleted_at IS NULL
UNION ALL
SELECT 'journal_entry' AS type, je.id, je.description, jl.debit, jl.credit
FROM public.journal_entries je
JOIN public.journal_lines jl ON jl.journal_entry_id = je.id
JOIN public.accounts a ON a.id = jl.account_id
WHERE (jl.debit = 300000 OR jl.credit = 300000)
  AND (a.code = '201' OR a.code LIKE '201%')
  AND je.status = 'posted';

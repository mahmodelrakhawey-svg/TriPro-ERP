-- ==============================================================================
-- TriPro ERP - استيراد وتثبيت الأرصدة الافتتاحية للموردين (50 مورداً)
-- تاريخ التحديث: 2026-09-20
-- المتطلبات: تطبيق السكربت على قاعدة بيانات حلواني لينزا (jsgmrspnthtlsracbmcq) وقاعدة الإنتاج (pjvphxfschfllpawfewn)
-- ==============================================================================

-- 1. التأكد من وجود عمود كود المورد وفهرس البحث وأعمدة التوقيت
ALTER TABLE public.suppliers ADD COLUMN IF NOT EXISTS code text;
ALTER TABLE public.suppliers ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();
ALTER TABLE public.suppliers ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();
CREATE INDEX IF NOT EXISTS idx_suppliers_code ON public.suppliers(organization_id, code);

-- 2. تحديث وتطوير دالة تسجيل الرصيد الافتتاحي (add_opening_balance) لدعم المبالغ الموجبة والسالبة بدقة محاسبية متوازنة
CREATE OR REPLACE FUNCTION public.add_opening_balance(
    p_id uuid,
    p_type text,
    p_amount numeric,
    p_date date,
    p_name text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_org_id uuid;
    v_mappings jsonb;
    v_opening_bal_acc_id uuid;
    v_partner_acc_id uuid;
    v_journal_id uuid;
    v_ref text;
    v_desc text;
    v_user_id uuid;
    v_abs_amount numeric;
BEGIN
    -- 1. التحقق من المؤسسة ونوع الشريك
    IF p_type = 'customer' THEN
        SELECT organization_id INTO v_org_id FROM public.customers WHERE id = p_id;
        IF NOT FOUND THEN
            RAISE EXCEPTION 'العميل غير موجود.';
        END IF;
        v_ref := 'OP-CUST-' || p_id;
        v_desc := 'رصيد افتتاحي للعميل: ' || p_name;
    ELSIF p_type = 'supplier' THEN
        SELECT organization_id INTO v_org_id FROM public.suppliers WHERE id = p_id;
        IF NOT FOUND THEN
            RAISE EXCEPTION 'المورد غير موجود.';
        END IF;
        v_ref := 'OP-SUPP-' || p_id;
        v_desc := 'رصيد افتتاحي للمورد: ' || p_name;
    ELSE
        RAISE EXCEPTION 'نوع الشريك غير صالح. يجب أن يكون customer أو supplier.';
    END IF;

    -- 2. تحديد حساب الأرصدة الافتتاحية (OPENING_BALANCES: 3999 أو 313)
    SELECT account_mappings INTO v_mappings FROM public.company_settings WHERE organization_id = v_org_id;
    IF v_mappings IS NOT NULL AND v_mappings->>'OPENING_BALANCES' IS NOT NULL THEN
        v_opening_bal_acc_id := (v_mappings->>'OPENING_BALANCES')::uuid;
    END IF;

    IF v_opening_bal_acc_id IS NULL THEN
        SELECT id INTO v_opening_bal_acc_id 
        FROM public.accounts 
        WHERE code IN ('3999', '313', '3103') 
          AND (organization_id = v_org_id OR organization_id IS NULL) 
        ORDER BY organization_id NULLS LAST 
        LIMIT 1;
    END IF;

    -- 3. تحديد حساب العملاء أو الموردين
    IF p_type = 'customer' THEN
        IF v_mappings IS NOT NULL AND v_mappings->>'CUSTOMERS' IS NOT NULL THEN
            v_partner_acc_id := (v_mappings->>'CUSTOMERS')::uuid;
        END IF;
        IF v_partner_acc_id IS NULL THEN
            SELECT id INTO v_partner_acc_id 
            FROM public.accounts 
            WHERE code IN ('1221', '1102', '121') 
              AND (organization_id = v_org_id OR organization_id IS NULL) 
            ORDER BY organization_id NULLS LAST 
            LIMIT 1;
        END IF;
    ELSE
        IF v_mappings IS NOT NULL AND v_mappings->>'SUPPLIERS' IS NOT NULL THEN
            v_partner_acc_id := (v_mappings->>'SUPPLIERS')::uuid;
        END IF;
        IF v_partner_acc_id IS NULL THEN
            SELECT id INTO v_partner_acc_id 
            FROM public.accounts 
            WHERE code IN ('2201', '201', '2101', '211') 
              AND (organization_id = v_org_id OR organization_id IS NULL) 
            ORDER BY organization_id NULLS LAST 
            LIMIT 1;
        END IF;
    END IF;

    -- 4. إزالة أي قيود سابقة لهذا الشريك لضمان idempotency
    DELETE FROM public.journal_entries 
    WHERE (organization_id = v_org_id OR organization_id IS NULL)
      AND (
          (related_document_id = p_id AND related_document_type = 'opening_balance')
          OR reference = v_ref
      );

    -- إذا كان المبلغ صفراً لا داعي لإنشاء قيد
    IF p_amount IS NULL OR p_amount = 0 THEN
        IF p_type = 'customer' THEN
            UPDATE public.customers SET opening_balance = 0 WHERE id = p_id;
        ELSE
            UPDATE public.suppliers SET opening_balance = 0 WHERE id = p_id;
        END IF;
        RETURN;
    END IF;

    -- محاولة الحصول على مستخدم نشط للقيد
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        SELECT id INTO v_user_id FROM auth.users ORDER BY created_at ASC LIMIT 1;
    END IF;

    v_abs_amount := ABS(p_amount);

    -- 5. إنشاء القيد اليومي الرئيسي
    INSERT INTO public.journal_entries (
        transaction_date, 
        description, 
        reference, 
        status, 
        organization_id, 
        related_document_id, 
        related_document_type, 
        is_posted, 
        user_id
    ) 
    VALUES (
        p_date, 
        v_desc, 
        v_ref, 
        'posted', 
        v_org_id, 
        p_id, 
        'opening_balance', 
        true, 
        v_user_id
    ) 
    RETURNING id INTO v_journal_id;

    -- 6. بنود القيد المتوازنة بدقة وفق الإشارات المحاسبية (موجب دائن، سالب مدين للمورد)
    IF v_opening_bal_acc_id IS NOT NULL AND v_partner_acc_id IS NOT NULL THEN
        IF p_type = 'customer' THEN
            IF p_amount >= 0 THEN
                -- عميل رصيد موجب: مدين عملاء / دائن أرصدة افتتاحية
                INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) 
                VALUES (v_journal_id, v_partner_acc_id, v_abs_amount, 0, v_desc, v_org_id);
                INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) 
                VALUES (v_journal_id, v_opening_bal_acc_id, 0, v_abs_amount, v_desc, v_org_id);
            ELSE
                -- عميل رصيد سالب: دائن عملاء / مدين أرصدة افتتاحية
                INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) 
                VALUES (v_journal_id, v_opening_bal_acc_id, v_abs_amount, 0, v_desc, v_org_id);
                INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) 
                VALUES (v_journal_id, v_partner_acc_id, 0, v_abs_amount, v_desc, v_org_id);
            END IF;
        ELSE
            IF p_amount >= 0 THEN
                -- مورد رصيد موجب (دائن): مدين أرصدة افتتاحية / دائن موردين
                INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) 
                VALUES (v_journal_id, v_opening_bal_acc_id, v_abs_amount, 0, v_desc, v_org_id);
                INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) 
                VALUES (v_journal_id, v_partner_acc_id, 0, v_abs_amount, v_desc, v_org_id);
            ELSE
                -- مورد رصيد سالب (مدين / دفعات مقدمة): مدين موردين / دائن أرصدة افتتاحية
                INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) 
                VALUES (v_journal_id, v_partner_acc_id, v_abs_amount, 0, v_desc, v_org_id);
                INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) 
                VALUES (v_journal_id, v_opening_bal_acc_id, 0, v_abs_amount, v_desc, v_org_id);
            END IF;
        END IF;
    END IF;

    -- 7. تحديث بطاقة الشريك
    IF p_type = 'customer' THEN
        UPDATE public.customers 
        SET opening_balance = p_amount,
            balance = COALESCE(balance, 0)
        WHERE id = p_id;
    ELSE
        UPDATE public.suppliers 
        SET opening_balance = p_amount,
            balance = COALESCE(balance, 0)
        WHERE id = p_id;
    END IF;

END;
$$;

GRANT EXECUTE ON FUNCTION public.add_opening_balance(uuid, text, numeric, date, text) TO authenticated, service_role, anon;

-- ==============================================================================
-- 3. ترحيل وتثبيت بيانات الـ 50 مورداً
-- ==============================================================================
DO $$
DECLARE
    v_org_id UUID;
    v_supp_id UUID;
    r RECORD;
    v_count_updated INT := 0;
    v_count_inserted INT := 0;
BEGIN
    -- أ. استهداف مؤسسة حلواني لينزا، أو المؤسسة الأولى في قاعدة الإنتاج
    SELECT id INTO v_org_id 
    FROM public.organizations 
    WHERE id = '2d9b24d6-f5cf-4bd9-b8b6-0a85d1c9c967'::uuid;

    IF v_org_id IS NULL THEN
        SELECT id INTO v_org_id 
        FROM public.organizations 
        ORDER BY created_at ASC 
        LIMIT 1;
    END IF;

    IF v_org_id IS NULL THEN
        RAISE EXCEPTION 'لم يتم العثور على أي مؤسسة نشطة في قاعدة البيانات!';
    END IF;

    RAISE NOTICE 'بدء استيراد أرصدة الموردين للمؤسسة: %', v_org_id;

    -- ب. جدول مؤقت ببيانات الـ 50 مورداً المستخرجة بدقة من الصورتين
    CREATE TEMP TABLE tmp_supplier_import (
        code text,
        name text,
        balance numeric
    ) ON COMMIT DROP;

    INSERT INTO tmp_supplier_import (code, name, balance) VALUES
        ('1', 'شركة محمد حسن', 558494),
        ('2', 'شركة آل عطية', 493346),
        ('3', 'SBS PRO الشركة العربية إمبريد', 111297),
        ('4', 'رضا سمنة', 33839),
        ('5', 'شركه الندى مدحت', 47216),
        ('7', 'مؤمن ماهر(فاكو)', 248275),
        ('8', 'شركة الأمل', 14750),
        ('9', 'مصطفى نور', 38678.5),
        ('10', 'عمر كبشه', 557551.5),
        ('12', 'العلا مصر', 127855.5),
        ('13', 'الموجي', 11063),
        ('14', 'كريستشن إيجيبت', 34238),
        ('15', 'مصر لمستلزمات المخابز', 116000),
        ('16', 'احمد جابر كيك بوب', 18577),
        ('19', 'احمد ابراهيم البركة', 163640),
        ('21', 'شركة جهينه', 46788),
        ('22', 'بلال أظرف عجين سكر وألوان غذائية', 14875),
        ('24', 'شركة مكة', 1155817),
        ('26', 'بيض فريش', 9000),
        ('27', 'بيض كريستال (إستار إيج)', 125990),
        ('28', '(سكاي هيلثي فود) OVO بيض', 176139),
        ('29', 'سويفاكس', 74750),
        ('31', 'ثروت الزامل', 40315.5),
        ('32', 'محمود طلعت', 93720),
        ('33', 'الفارس باك للطباعة والتغليف', 788427.8),
        ('34', 'صالح قواعد القاهره(الرحاب)', 69890),
        ('35', 'شركة المغريل للصناعات الغذائية', 66000),
        ('36', 'مورد نقدى', -116872),
        ('37', 'شركة العراصي', 125530),
        ('39', 'برج إيفل', 33590),
        ('41', 'شركة الكمال ( الدلتا سابقا)', 2040),
        ('42', 'خالد التوابتي', 26890),
        ('45', 'شركة الهنا لتعبئة وتغليف المواد الغذائية (الحاره)', 231300),
        ('47', 'إبراهيم جاز', 13100),
        ('49', 'الشركة الدولية للصناعات الغذائية (جولدن باك)', 53428.47),
        ('50', 'مصنع سيتكس', 82766),
        ('53', 'تاج باك', 233),
        ('54', 'شركة هاي مكس للصناعات الغذائية', 9114),
        ('55', 'أمين الغمريطي', 73880),
        ('56', 'الغمري', 46560),
        ('58', 'جامبو للصناعات (محمد عطيه)', 61908),
        ('59', 'محمد بخيت', 368800),
        ('60', 'MR for trade مستلزمات حفلات', 63142),
        ('67', 'الشركة الإسلامية (محمد يسري)', 35450),
        ('77', 'مصنع البلاستيك قواعد الجاتوه', 4050),
        ('79', 'محمد الزامل', 15790),
        ('84', 'يوسف سمير هيروكيم', 257000),
        ('86', 'سمنه بلدي أبوالفتوح', 191920),
        ('91', 'أشرف سعدان', 52477),
        ('94', 'مصنع شهاب(أحمد شهاب)', 11900);

    -- ج. التكرار على السجلات وتحديثها أو إدراجها بشكل آمن
    FOR r IN SELECT code, name, balance FROM tmp_supplier_import ORDER BY (code::int) ASC
    LOOP
        v_supp_id := NULL;

        -- 1. محاولة المطابقة بالكود أولاً
        SELECT id INTO v_supp_id 
        FROM public.suppliers 
        WHERE organization_id = v_org_id 
          AND code = r.code 
        LIMIT 1;

        -- 2. إن لم يوجد، محاولة المطابقة بالاسم الدقيق
        IF v_supp_id IS NULL THEN
            SELECT id INTO v_supp_id 
            FROM public.suppliers 
            WHERE organization_id = v_org_id 
              AND TRIM(name) = TRIM(r.name) 
            LIMIT 1;
        END IF;

        -- 3. إن لم يوجد، محاولة المطابقة بالاسم بدون الكلمات الشائعة
        IF v_supp_id IS NULL THEN
            SELECT id INTO v_supp_id 
            FROM public.suppliers 
            WHERE organization_id = v_org_id 
              AND (
                  name ILIKE '%' || TRIM(REPLACE(REPLACE(r.name, 'شركة ', ''), 'شركه ', '')) || '%'
                  OR TRIM(REPLACE(REPLACE(r.name, 'شركة ', ''), 'شركه ', '')) ILIKE '%' || name || '%'
              )
            LIMIT 1;
        END IF;

        -- 4. إجراء التحديث أو الإدراج (باستخدام الحقول الأساسية المؤكدة فقط)
        IF v_supp_id IS NOT NULL THEN
            UPDATE public.suppliers 
            SET code = r.code,
                name = r.name,
                opening_balance = r.balance,
                deleted_at = NULL
            WHERE id = v_supp_id;
            
            v_count_updated := v_count_updated + 1;
        ELSE
            INSERT INTO public.suppliers (
                id, 
                organization_id, 
                name, 
                code, 
                opening_balance, 
                balance
            ) VALUES (
                gen_random_uuid(), 
                v_org_id, 
                r.name, 
                r.code, 
                r.balance, 
                r.balance
            ) 
            RETURNING id INTO v_supp_id;
            
            v_count_inserted := v_count_inserted + 1;
        END IF;

        -- 5. توليد قيد الأستاذ العام المتوازن للرصيد الافتتاحي
        PERFORM public.add_opening_balance(v_supp_id, 'supplier', r.balance, CURRENT_DATE, r.name);

    END LOOP;

    RAISE NOTICE '✅ تم الانتهاء بنجاح: تم تحديث % مورد وإضافة % مورد جديد بإجمالي 50 مورداً.', v_count_updated, v_count_inserted;

    -- د. إعادة احتساب الأرصدة المتزامنة إن كانت الدالة متوفرة
    BEGIN
        PERFORM public.recalculate_all_system_balances(v_org_id);
    EXCEPTION WHEN OTHERS THEN
        NULL;
    END;

END;
$$;

-- 4. إشعار PostgREST بتحديث كاش الجداول
NOTIFY pgrst, 'reload schema';

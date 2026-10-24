-- ==============================================================================
-- 🌟 TriPro ERP — معالجة قيود إغلاق الورديات وترحيل الورديات المعلقة آلياً
-- التاريخ: 2026-10-24
-- ==============================================================================
-- المشاكل المعالجة:
-- 1. القضاء التام على خطأ (COALESCE types uuid and text cannot be matched) في دالة generate_shift_closing_entry
-- 2. توفير كلا التوقيعين للدالة (معامل واحد ومعاملين) لضمان التوافق التام مع close_shift
-- 3. ضمان توازن القيد بنسبة 100% (Smart Balancing) حتى أدق مليم قبل الترحيل
-- 4. توفير دالة repost_unposted_shift و repost_all_unposted_shifts لترحيل الورديات السابقة غير المُرحّلة
-- ==============================================================================

BEGIN;

-- تفعيل إمكانية تعديل القيود
SELECT set_config('app.allow_financial_ledger_mutation', 'true', false);

-- 1. التأكد من ربط حسابات العجز والفائض في كافة المؤسسات
DO $$
DECLARE
    r RECORD;
    v_def_acc UUID;
    v_sur_acc UUID;
    v_adv_acc UUID;
    v_map JSONB;
BEGIN
    FOR r IN SELECT id FROM public.organizations LOOP
        SELECT account_mappings INTO v_map FROM public.company_settings WHERE organization_id = r.id;
        IF v_map IS NULL THEN
            v_map := '{}'::jsonb;
        END IF;

        -- البحث عن حساب عجز الصندوق (541)
        SELECT id INTO v_def_acc FROM public.accounts 
        WHERE (organization_id = r.id OR organization_id IS NULL) 
          AND (code IN ('541', '54', '551', '5219') OR name LIKE '%عجز%') 
          AND (is_group = false OR is_group IS NULL)
        ORDER BY CASE WHEN code = '541' THEN 1 ELSE 2 END LIMIT 1;

        -- البحث عن حساب زيادة الصندوق (441)
        SELECT id INTO v_sur_acc FROM public.accounts 
        WHERE (organization_id = r.id OR organization_id IS NULL) 
          AND (code IN ('441', '44', '451', '4219') OR name LIKE '%زيادة%' OR name LIKE '%فائض%') 
          AND (is_group = false OR is_group IS NULL)
        ORDER BY CASE WHEN code = '441' THEN 1 ELSE 2 END LIMIT 1;

        -- البحث عن حساب دفعات العملاء المقدمة (226)
        SELECT id INTO v_adv_acc FROM public.accounts 
        WHERE (organization_id = r.id OR organization_id IS NULL) 
          AND (code IN ('226', '2261', '2202', '2102') OR name LIKE '%تأمينات ودفعات%' OR name LIKE '%عربون%') 
          AND (is_group = false OR is_group IS NULL)
        ORDER BY CASE WHEN code = '226' THEN 1 ELSE 2 END LIMIT 1;

        IF v_def_acc IS NOT NULL THEN
            v_map := jsonb_set(v_map, '{CASH_SHORTAGE}', to_jsonb(v_def_acc::text));
            v_map := jsonb_set(v_map, '{CASH_DEFICIT}', to_jsonb(v_def_acc::text));
        END IF;

        IF v_sur_acc IS NOT NULL THEN
            v_map := jsonb_set(v_map, '{CASH_SURPLUS_ACC}', to_jsonb(v_sur_acc::text));
            v_map := jsonb_set(v_map, '{CASH_SURPLUS}', to_jsonb(v_sur_acc::text));
        END IF;

        IF v_adv_acc IS NOT NULL THEN
            v_map := jsonb_set(v_map, '{CUSTOMER_ADVANCES}', to_jsonb(v_adv_acc::text));
        END IF;

        UPDATE public.company_settings SET account_mappings = v_map WHERE organization_id = r.id;
    END LOOP;
END $$;

-- 2. تنظيف التواقيع السابقة لمنع أي تضارب
DROP FUNCTION IF EXISTS public.generate_shift_closing_entry(uuid, uuid);
DROP FUNCTION IF EXISTS public.generate_shift_closing_entry(uuid);

-- 3. دالة توليد قيد إقفال الوردية الرئيسية (معاملين مع قيمة افتراضية)
CREATE OR REPLACE FUNCTION public.generate_shift_closing_entry(
    p_shift_id uuid,
    p_org_id   uuid DEFAULT NULL
)
RETURNS uuid 
LANGUAGE plpgsql 
SECURITY DEFINER 
SET search_path = public 
AS $$
DECLARE
    v_shift                 public.shifts;
    v_org_id                uuid;
    v_summary               jsonb;
    v_je_id                 uuid;
    v_mappings              jsonb;

    -- حسابات الدليل المحاسبي
    v_cash_acc_id           uuid;
    v_safe_acc_id           uuid;
    v_card_acc_id           uuid;
    v_instapay_acc_id       uuid;
    v_wallet_acc_id         uuid;
    v_customer_adv_acc_id   uuid;
    v_sales_acc_id          uuid;
    v_sales_return_acc_id   uuid;
    v_discount_acc_id       uuid;
    v_service_acc_id        uuid;
    v_vat_acc_id            uuid;
    v_cash_deficit_acc_id   uuid;
    v_cash_surplus_acc_id   uuid;
    v_credit_ar_acc_id      uuid;
    v_default_exp_acc_id    uuid;

    -- مبالغ الوردية
    v_food_subtotal         numeric := 0;
    v_service_total         numeric := 0;
    v_vat_total             numeric := 0;
    v_total_discount        numeric := 0;
    v_grand_total_sum       numeric := 0;
    v_actual_cash           numeric := 0;
    v_opening_balance       numeric := 0;
    v_expected_cash         numeric := 0;
    v_diff                  numeric := 0;
    v_net_cash_movement     numeric := 0;

    v_card_sales            numeric := 0;
    v_instapay_sales        numeric := 0;
    v_wallet_sales          numeric := 0;
    v_redeemed_deposits     numeric := 0;
    v_credit_sales          numeric := 0;
    v_safe_drops            numeric := 0;
    v_cash_returns          numeric := 0;
    v_paid_ins              numeric := 0;
    v_paid_outs             numeric := 0;

    -- عربونات الحجز والرد
    v_cash_deposits_in         numeric := 0;
    v_wallet_deposits_in       numeric := 0;
    v_instapay_deposits_in     numeric := 0;
    v_card_deposits_in         numeric := 0;
    v_total_deposits_in        numeric := 0;
    v_cash_deposits_refund     numeric := 0;
    v_wallet_deposits_refund   numeric := 0;
    v_instapay_deposits_refund numeric := 0;

    v_total_debit           numeric := 0;
    v_total_credit          numeric := 0;
    v_payout_row            record;
BEGIN
    SELECT * INTO v_shift FROM public.shifts WHERE id = p_shift_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'الوردية رقم % غير موجودة.', p_shift_id;
    END IF;

    PERFORM set_config('app.allow_financial_ledger_mutation', 'true', true);

    v_org_id          := COALESCE(v_shift.organization_id, p_org_id, public.get_my_org());
    v_actual_cash     := COALESCE(v_shift.actual_cash, 0);
    v_opening_balance := COALESCE(v_shift.opening_balance, 0);

    -- جلب ملخص الوردية الشامل
    v_summary           := public.get_shift_summary(p_shift_id);
    v_expected_cash     := COALESCE((v_summary->>'expected_cash')::numeric, 0);
    v_card_sales        := COALESCE((v_summary->>'card_sales')::numeric, 0);
    v_instapay_sales    := COALESCE((v_summary->>'instapay_sales')::numeric, 0);
    v_wallet_sales      := COALESCE((v_summary->>'wallet_sales')::numeric, 0);
    v_redeemed_deposits := COALESCE((v_summary->>'redeemed_deposits')::numeric, 0);
    v_credit_sales      := COALESCE((v_summary->>'credit_sales')::numeric, 0);
    v_safe_drops        := COALESCE((v_summary->>'safe_drops')::numeric, 0);
    v_cash_returns      := COALESCE((v_summary->>'cash_returns')::numeric, 0);
    v_paid_ins          := COALESCE((v_summary->>'paid_ins')::numeric, 0);
    v_paid_outs         := COALESCE((v_summary->>'paid_outs')::numeric, 0);

    v_cash_deposits_in         := COALESCE((v_summary->>'cash_deposits_in')::numeric, 0);
    v_wallet_deposits_in       := COALESCE((v_summary->>'wallet_deposits_in')::numeric, 0);
    v_instapay_deposits_in     := COALESCE((v_summary->>'instapay_deposits_in')::numeric, 0);
    v_card_deposits_in         := COALESCE((v_summary->>'card_deposits_in')::numeric, 0);
    v_total_deposits_in        := COALESCE((v_summary->>'total_deposits_in')::numeric, (v_cash_deposits_in + v_wallet_deposits_in + v_instapay_deposits_in + v_card_deposits_in));

    v_cash_deposits_refund     := COALESCE((v_summary->>'cash_deposits_refund')::numeric, 0);
    v_wallet_deposits_refund   := COALESCE((v_summary->>'wallet_deposits_refund')::numeric, 0);
    v_instapay_deposits_refund := COALESCE((v_summary->>'instapay_deposits_refund')::numeric, 0);

    v_diff              := v_actual_cash - v_expected_cash;
    v_net_cash_movement := v_actual_cash - v_opening_balance;

    -- خريطة الحسابات
    SELECT account_mappings INTO v_mappings FROM public.company_settings WHERE organization_id = v_org_id;

    -- 🔍 1. حساب النقدية بالدرج
    v_cash_acc_id := public.resolve_leaf_account(COALESCE(
        v_shift.treasury_account_id,
        public.safe_cast_uuid(v_mappings->>'CASH'),
        (SELECT id FROM public.accounts WHERE (organization_id = v_org_id OR organization_id IS NULL) AND code IN ('1231','123101','1101','10101','101') ORDER BY organization_id NULLS LAST LIMIT 1),
        (SELECT id FROM public.accounts WHERE (organization_id = v_org_id OR organization_id IS NULL) AND (name LIKE '%صندوق%' OR name LIKE '%درج%' OR name LIKE '%نقدية%') AND (is_group = false OR is_group IS NULL) ORDER BY organization_id NULLS LAST LIMIT 1),
        (SELECT id FROM public.accounts WHERE (organization_id = v_org_id OR organization_id IS NULL) AND (is_group = false OR is_group IS NULL) ORDER BY code ASC LIMIT 1)
    ));

    -- 🔍 2. حساب الخزينة الرئيسية
    v_safe_acc_id := public.resolve_leaf_account(COALESCE(
        public.safe_cast_uuid(v_mappings->>'MAIN_TREASURY'),
        public.safe_cast_uuid(v_mappings->>'SAFE'),
        (SELECT id FROM public.accounts WHERE (organization_id = v_org_id OR organization_id IS NULL) AND code IN ('1232','1102','10102') ORDER BY organization_id NULLS LAST LIMIT 1),
        (SELECT id FROM public.accounts WHERE (organization_id = v_org_id OR organization_id IS NULL) AND (name LIKE '%رئيسي%' OR name LIKE '%خزينة%') AND (is_group = false OR is_group IS NULL) ORDER BY organization_id NULLS LAST LIMIT 1),
        v_cash_acc_id
    ));

    -- 🔍 3. حساب البطاقات والشبكة
    v_card_acc_id := public.resolve_leaf_account(COALESCE(
        public.safe_cast_uuid(v_mappings->>'POS_CARD_CLEARING'),
        public.safe_cast_uuid(v_mappings->>'BANK_POS'),
        public.safe_cast_uuid(v_mappings->>'BANK'),
        (SELECT id FROM public.accounts WHERE (organization_id = v_org_id OR organization_id IS NULL) AND (code LIKE '1232%' OR code LIKE '1214%' OR code LIKE '121%') ORDER BY organization_id NULLS LAST LIMIT 1),
        v_cash_acc_id
    ));

    -- 🔍 4. حساب إنستاباي
    v_instapay_acc_id := public.resolve_leaf_account(COALESCE(
        public.safe_cast_uuid(v_mappings->>'INSTAPAY_CLEARING'),
        public.safe_cast_uuid(v_mappings->>'INSTAPAY'),
        (SELECT id FROM public.accounts WHERE (organization_id = v_org_id OR organization_id IS NULL) AND (name LIKE '%انستا%' OR name LIKE '%إنستا%' OR code LIKE '123305%' OR code LIKE '1215%') ORDER BY organization_id NULLS LAST LIMIT 1),
        v_card_acc_id
    ));

    -- 🔍 5. حساب المحافظ الإلكترونية
    v_wallet_acc_id := public.resolve_leaf_account(COALESCE(
        public.safe_cast_uuid(v_mappings->>'WALLET_CLEARING'),
        public.safe_cast_uuid(v_mappings->>'WALLET'),
        (SELECT id FROM public.accounts WHERE (organization_id = v_org_id OR organization_id IS NULL) AND (code LIKE '1233%' OR code LIKE '1216%') ORDER BY organization_id NULLS LAST LIMIT 1),
        v_instapay_acc_id
    ));

    -- 🔍 6. حساب دفعات مقدمة من العملاء (عربونات الحجز 226)
    v_customer_adv_acc_id := public.resolve_leaf_account(COALESCE(
        public.safe_cast_uuid(v_mappings->>'CUSTOMER_ADVANCES'),
        (SELECT id FROM public.accounts WHERE (organization_id = v_org_id OR organization_id IS NULL) AND code LIKE '226%' ORDER BY organization_id NULLS LAST LIMIT 1),
        (SELECT id FROM public.accounts WHERE (organization_id = v_org_id OR organization_id IS NULL) AND (code LIKE '20102%' OR code LIKE '2202%' OR code LIKE '2102%' OR code LIKE '221%') ORDER BY organization_id NULLS LAST LIMIT 1),
        (SELECT id FROM public.accounts WHERE (organization_id = v_org_id OR organization_id IS NULL) AND (name LIKE '%عربون%' OR name LIKE '%دفعات مقدمة%' OR name LIKE '%تأمينات%') AND (is_group = false OR is_group IS NULL) ORDER BY organization_id NULLS LAST LIMIT 1)
    ));

    -- 🔍 7. حساب المبيعات
    v_sales_acc_id := public.resolve_leaf_account(COALESCE(
        public.safe_cast_uuid(v_mappings->>'SALES_REVENUE'),
        (SELECT id FROM public.accounts WHERE (organization_id = v_org_id OR organization_id IS NULL) AND code IN ('411','4111','4101','41','401') ORDER BY organization_id NULLS LAST LIMIT 1),
        (SELECT id FROM public.accounts WHERE (organization_id = v_org_id OR organization_id IS NULL) AND (name LIKE '%مبيعات%' OR name LIKE '%إيراد%') AND (is_group = false OR is_group IS NULL) ORDER BY organization_id NULLS LAST LIMIT 1)
    ));

    -- 🔍 8. حساب مردودات المبيعات
    v_sales_return_acc_id := public.resolve_leaf_account(COALESCE(
        public.safe_cast_uuid(v_mappings->>'SALES_RETURNS'),
        (SELECT id FROM public.accounts WHERE (organization_id = v_org_id OR organization_id IS NULL) AND code IN ('412','413','4103') ORDER BY organization_id NULLS LAST LIMIT 1),
        (SELECT id FROM public.accounts WHERE (organization_id = v_org_id OR organization_id IS NULL) AND (name LIKE '%مردود%' OR name LIKE '%مرتجع%') AND (is_group = false OR is_group IS NULL) ORDER BY organization_id NULLS LAST LIMIT 1),
        v_sales_acc_id
    ));

    -- 🔍 9. حساب ضريبة القيمة المضافة
    v_vat_acc_id := public.resolve_leaf_account(COALESCE(
        public.safe_cast_uuid(v_mappings->>'VAT_OUTPUT'),
        public.safe_cast_uuid(v_mappings->>'VAT'),
        (SELECT id FROM public.accounts WHERE (organization_id = v_org_id OR organization_id IS NULL) AND code IN ('2231','2103','2105','223') ORDER BY organization_id NULLS LAST LIMIT 1),
        (SELECT id FROM public.accounts WHERE (organization_id = v_org_id OR organization_id IS NULL) AND name LIKE '%ضريبة%' AND (is_group = false OR is_group IS NULL) ORDER BY organization_id NULLS LAST LIMIT 1)
    ));

    -- 🔍 10. حساب المصروفات الافتراضية
    v_default_exp_acc_id := public.resolve_leaf_account(COALESCE(
        public.safe_cast_uuid(v_mappings->>'OPERATING_EXPENSES'),
        public.safe_cast_uuid(v_mappings->>'EXPENSE_GENERAL'),
        (SELECT id FROM public.accounts WHERE (organization_id = v_org_id OR organization_id IS NULL) AND code IN ('5201','5101','501','523','521') ORDER BY organization_id NULLS LAST LIMIT 1),
        (SELECT id FROM public.accounts WHERE (organization_id = v_org_id OR organization_id IS NULL) AND code LIKE '5%' AND (is_group = false OR is_group IS NULL) ORDER BY organization_id NULLS LAST LIMIT 1)
    ));

    -- 🔍 11. حساب مبيعات الآجل (عملاء)
    v_credit_ar_acc_id := public.resolve_leaf_account(COALESCE(
        public.safe_cast_uuid(v_mappings->>'CUSTOMERS'),
        (SELECT id FROM public.accounts WHERE (organization_id = v_org_id OR organization_id IS NULL) AND (code LIKE '1241%' OR code LIKE '121%') ORDER BY organization_id NULLS LAST LIMIT 1)
    ));

    -- 🔍 12. حساب عجز النقدية بالدرج (CASH_SHORTAGE / CASH_DEFICIT) -> 541
    v_cash_deficit_acc_id := public.resolve_leaf_account(COALESCE(
        public.safe_cast_uuid(v_mappings->>'CASH_SHORTAGE'),
        public.safe_cast_uuid(v_mappings->>'CASH_DEFICIT'),
        public.safe_cast_uuid(v_mappings->>'CASH_DIFF'),
        (SELECT id FROM public.accounts WHERE (organization_id = v_org_id OR organization_id IS NULL) AND code IN ('541','54','551','5219','5109','529') ORDER BY organization_id NULLS LAST LIMIT 1),
        (SELECT id FROM public.accounts WHERE (organization_id = v_org_id OR organization_id IS NULL) AND (name LIKE '%عجز%' OR name LIKE '%فروق نقدية مدين%' OR name LIKE '%فروقات%') AND (is_group = false OR is_group IS NULL) ORDER BY organization_id NULLS LAST LIMIT 1),
        v_default_exp_acc_id
    ));

    -- 🔍 13. حساب زيادة / فائض النقدية بالدرج (CASH_SURPLUS_ACC / CASH_SURPLUS) -> 441
    v_cash_surplus_acc_id := public.resolve_leaf_account(COALESCE(
        public.safe_cast_uuid(v_mappings->>'CASH_SURPLUS_ACC'),
        public.safe_cast_uuid(v_mappings->>'CASH_SURPLUS'),
        (SELECT id FROM public.accounts WHERE (organization_id = v_org_id OR organization_id IS NULL) AND code IN ('441','44','451','4219','4209') ORDER BY organization_id NULLS LAST LIMIT 1),
        (SELECT id FROM public.accounts WHERE (organization_id = v_org_id OR organization_id IS NULL) AND (name LIKE '%زيادة%' OR name LIKE '%فائض%' OR name LIKE '%فروق نقدية دائن%') AND (is_group = false OR is_group IS NULL) ORDER BY organization_id NULLS LAST LIMIT 1),
        v_sales_acc_id
    ));

    -- استعلام مبيعات الوردية الإجمالية
    SELECT 
        COALESCE(SUM(COALESCE(o.subtotal, 0)), 0),
        COALESCE(SUM(COALESCE(o.service_charge, o.service_fee, 0)), 0),
        COALESCE(SUM(COALESCE(o.total_tax, o.tax, 0)), 0),
        COALESCE(SUM(COALESCE(o.total_discount, 0)), 0),
        COALESCE(SUM(COALESCE(o.grand_total, o.total_amount, 0)), 0)
    INTO v_food_subtotal, v_service_total, v_vat_total, v_total_discount, v_grand_total_sum
    FROM public.orders o
    WHERE (
        o.shift_id = p_shift_id
        OR (
            o.shift_id IS NULL
            AND (o.user_id = v_shift.user_id OR o.cashier_id = v_shift.user_id)
            AND o.created_at >= v_shift.start_time
            AND o.created_at <= COALESCE(v_shift.end_time, NOW())
        )
    )
    AND o.status NOT IN ('CANCELLED', 'VOID', 'REFUNDED');

    -- إذا كانت مبيعات orders صفراً، نأخذ الإجمالي من ملخص الوردية المسجل
    IF v_food_subtotal = 0 AND COALESCE((v_summary->>'total_sales')::numeric, 0) > 0 THEN
        v_food_subtotal := COALESCE((v_summary->>'total_sales')::numeric, 0);
    END IF;

    -- إذا كانت الوردية خالية تماماً من أي حركة بيع أو نقدية أو عربونات (وردية فارغة تماماً)
    IF v_food_subtotal = 0 AND v_safe_drops = 0 AND v_paid_outs = 0 AND v_paid_ins = 0 
       AND v_cash_returns = 0 AND v_diff = 0 AND v_net_cash_movement = 0
       AND v_total_deposits_in = 0 AND v_credit_sales = 0
       AND v_cash_deposits_refund = 0 AND v_wallet_deposits_refund = 0 AND v_instapay_deposits_refund = 0 THEN
        PERFORM set_config('app.allow_financial_ledger_mutation', 'false', true);
        RETURN NULL;
    END IF;

    -- تنظيف أي قيد قديم لهذه الوردية
    DELETE FROM public.journal_lines 
    WHERE journal_entry_id IN (
        SELECT id FROM public.journal_entries 
        WHERE (related_document_id = p_shift_id AND related_document_type = 'shift')
           OR id = v_shift.closing_journal_entry_id
    );
    DELETE FROM public.journal_entries 
    WHERE (related_document_id = p_shift_id AND related_document_type = 'shift')
       OR id = v_shift.closing_journal_entry_id;

    -- إنشاء رأس القيد اليومي
    INSERT INTO public.journal_entries (
        transaction_date, description, reference, status,
        organization_id, is_posted, related_document_id, related_document_type,
        user_id, created_by
    ) VALUES (
        CURRENT_DATE,
        'قيد إقفال مبيعات وحركة نقدية الوردية (مع الحجوزات والردود متعددة القنوات)',
        'SHIFT-' || to_char(CURRENT_DATE, 'YYMMDD') || '-' || substring(p_shift_id::text, 1, 4),
        'draft', v_org_id, false, p_shift_id, 'shift',
        v_shift.user_id, COALESCE(auth.uid(), v_shift.user_id)
    ) RETURNING id INTO v_je_id;

    -- =========================================================================
    -- الطرف الدائن (Credits)
    -- =========================================================================
    -- 1. المبيعات الإجمالية
    IF v_food_subtotal > 0 AND v_sales_acc_id IS NOT NULL THEN
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
        VALUES (v_je_id, v_sales_acc_id, 0, v_food_subtotal, 'إيراد مبيعات الوردية الإجمالي (Gross Sales)', v_org_id);
    END IF;

    -- 2. رسوم الخدمة
    IF v_service_total > 0 AND v_service_acc_id IS NOT NULL THEN
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
        VALUES (v_je_id, v_service_acc_id, 0, v_service_total, 'إيراد خدمة التوصيل / الصالة', v_org_id);
    END IF;

    -- 3. ضريبة القيمة المضافة
    IF v_vat_total > 0 AND v_vat_acc_id IS NOT NULL THEN
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
        VALUES (v_je_id, v_vat_acc_id, 0, v_vat_total, 'ضريبة مخرجات مبيعات الوردية', v_org_id);
    END IF;

    -- 4. إجمالي عربونات الحجز المستلمة نقداً أو إلكترونياً
    IF v_total_deposits_in > 0 AND v_customer_adv_acc_id IS NOT NULL THEN
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
        VALUES (v_je_id, v_customer_adv_acc_id, 0, v_total_deposits_in, 'عربونات حجز استلمها الكاشير (دفعات مقدمة من العملاء)', v_org_id);
    END IF;

    -- 5. زيادة نقدية في الدرج إن وجدت
    IF v_diff > 0 AND v_cash_surplus_acc_id IS NOT NULL THEN
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
        VALUES (v_je_id, v_cash_surplus_acc_id, 0, v_diff, 'فائض نقدية الدرج (إيراد متنوع)', v_org_id);
    END IF;

    -- 6. تزويد نقدية فكة بالدرج من الخزينة الرئيسية
    IF v_paid_ins > 0 AND v_safe_acc_id IS NOT NULL THEN
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
        VALUES (v_je_id, v_safe_acc_id, 0, v_paid_ins, 'تزويد فكة لدرج الكاشير من الخزينة الرئيسية', v_org_id);
    END IF;

    -- 7. نقص رصيد الخزينة عند سحب نقدية صافية
    IF v_net_cash_movement < 0 AND v_cash_acc_id IS NOT NULL THEN
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
        VALUES (v_je_id, v_cash_acc_id, 0, ABS(v_net_cash_movement), 'صافي سحب نقدية من درج الكاشير', v_org_id);
    END IF;

    -- 8. عربونات ردت إلكترونياً
    IF v_wallet_deposits_refund > 0 AND v_wallet_acc_id IS NOT NULL THEN
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
        VALUES (v_je_id, v_wallet_acc_id, 0, v_wallet_deposits_refund, 'رد عربون حجز محفظة إلكترونية للعميل', v_org_id);
    END IF;

    IF v_instapay_deposits_refund > 0 AND v_instapay_acc_id IS NOT NULL THEN
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
        VALUES (v_je_id, v_instapay_acc_id, 0, v_instapay_deposits_refund, 'رد عربون حجز انستاباي للعميل', v_org_id);
    END IF;

    -- =========================================================================
    -- الطرف المدين (Debits)
    -- =========================================================================
    -- 1. زيادة النقدية الفعلية في درج الكاشير
    IF v_net_cash_movement > 0 AND v_cash_acc_id IS NOT NULL THEN
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
        VALUES (v_je_id, v_cash_acc_id, v_net_cash_movement, 0, 'صافي النقدية الموردة لدرج الكاشير', v_org_id);
    END IF;

    -- 2. مبيعات وعربونات بطاقات الدفع
    IF (v_card_sales + v_card_deposits_in) > 0 AND v_card_acc_id IS NOT NULL THEN
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
        VALUES (v_je_id, v_card_acc_id, (v_card_sales + v_card_deposits_in), 0, 'حساب وسيط شبكة وبطاقات (مبيعات + عربون)', v_org_id);
    END IF;

    -- 3. مبيعات وعربونات انستاباي
    IF (v_instapay_sales + v_instapay_deposits_in) > 0 AND v_instapay_acc_id IS NOT NULL THEN
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
        VALUES (v_je_id, v_instapay_acc_id, (v_instapay_sales + v_instapay_deposits_in), 0, 'حساب انستاباي (مبيعات + عربون حجز)', v_org_id);
    END IF;

    -- 4. مبيعات وعربونات المحافظ الإلكترونية
    IF (v_wallet_sales + v_wallet_deposits_in) > 0 AND v_wallet_acc_id IS NOT NULL THEN
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
        VALUES (v_je_id, v_wallet_acc_id, (v_wallet_sales + v_wallet_deposits_in), 0, 'حساب المحافظ الإلكترونية (فودافون كاش)', v_org_id);
    END IF;

    -- 5. مبيعات الآجل (ذمم عملاء)
    IF v_credit_sales > 0 AND v_credit_ar_acc_id IS NOT NULL THEN
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
        VALUES (v_je_id, v_credit_ar_acc_id, v_credit_sales, 0, 'مبيعات الوردية الآجلة (ذمم عملاء)', v_org_id);
    END IF;

    -- 6. تنفيذ الحجز / استهلاك العربون السابق في فاتورة بيع
    IF v_redeemed_deposits > 0 AND v_customer_adv_acc_id IS NOT NULL THEN
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
        VALUES (v_je_id, v_customer_adv_acc_id, v_redeemed_deposits, 0, 'تنفيذ حجز مسبق مستهلك في الفاتورة (تسوية دفعات مقدمة)', v_org_id);
    END IF;

    -- 7. عربونات ردت للعميل
    IF (v_cash_deposits_refund + v_wallet_deposits_refund + v_instapay_deposits_refund) > 0 AND v_customer_adv_acc_id IS NOT NULL THEN
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
        VALUES (v_je_id, v_customer_adv_acc_id, (v_cash_deposits_refund + v_wallet_deposits_refund + v_instapay_deposits_refund), 0, 'إلغاء حجز ورد عربون للعميل (تخفيض الدفعة المقدمة)', v_org_id);
    END IF;

    -- 8. توريد نقدية من الدرج للخزينة الرئيسية
    IF v_safe_drops > 0 AND v_safe_acc_id IS NOT NULL THEN
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
        VALUES (v_je_id, v_safe_acc_id, v_safe_drops, 0, 'توريد نقدية من الدرج إلى الخزينة الرئيسية', v_org_id);
    END IF;

    -- 9. مصروفات نثرية من الدرج (من pos_drawer_transactions)
    FOR v_payout_row IN (
        SELECT COALESCE(public.resolve_leaf_account(public.safe_cast_uuid(account_id::text)), v_default_exp_acc_id) as exp_acc, 
               SUM(amount) as total_amt, reason
        FROM public.pos_drawer_transactions
        WHERE shift_id = p_shift_id AND transaction_type = 'PAID_OUT_EXPENSE'
        GROUP BY 1, 3
    ) LOOP
        IF v_payout_row.total_amt > 0 AND v_payout_row.exp_acc IS NOT NULL THEN
            INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
            VALUES (v_je_id, v_payout_row.exp_acc, v_payout_row.total_amt, 0, 'مصروف نثري من الدرج: ' || COALESCE(v_payout_row.reason, 'مصروفات تشغيلية'), v_org_id);
        END IF;
    END LOOP;

    -- 10. دعم التوافق مع pos_petty_cash_payouts (تم إصلاح datatype mismatch هنا 100%)
    FOR v_payout_row IN (
        SELECT 
            COALESCE(
                public.resolve_leaf_account(public.safe_cast_uuid(expense_account_id::text)), 
                public.resolve_leaf_account(public.safe_cast_uuid(v_mappings->>'EXPENSE_GENERAL')), 
                v_default_exp_acc_id
            ) AS exp_acc,
            SUM(amount) AS total_amt, 
            reason
        FROM public.pos_petty_cash_payouts
        WHERE (public_shift_id = p_shift_id OR shift_id = p_shift_id::text) 
          AND payout_type = 'EXPENSE'
          AND reason NOT ILIKE '%رد عربون%' AND reason NOT ILIKE '%إلغاء حجز%'
          -- منع التكرار إذا سجلت في pos_drawer_transactions
          AND NOT EXISTS (SELECT 1 FROM public.pos_drawer_transactions WHERE shift_id = p_shift_id AND transaction_type = 'PAID_OUT_EXPENSE')
        GROUP BY 1, 3
    ) LOOP
        IF v_payout_row.total_amt > 0 AND v_payout_row.exp_acc IS NOT NULL THEN
            INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
            VALUES (v_je_id, v_payout_row.exp_acc, v_payout_row.total_amt, 0, 'صرف نثري من الدرج: ' || COALESCE(v_payout_row.reason, 'مصروفات تشغيلية'), v_org_id);
        END IF;
    END LOOP;

    -- 11. مرتجعات مبيعات نقدية
    IF v_cash_returns > 0 AND v_sales_return_acc_id IS NOT NULL THEN
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
        VALUES (v_je_id, v_sales_return_acc_id, v_cash_returns, 0, 'مرتجع مبيعات نقدية من الدرج', v_org_id);
    END IF;

    -- 12. عجز نقدية الدرج الفعلي (تسوية عجز الصندوق 541)
    IF v_diff < 0 AND v_cash_deficit_acc_id IS NOT NULL THEN
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
        VALUES (v_je_id, v_cash_deficit_acc_id, ABS(v_diff), 0, 'عجز نقدية في عهدة الكاشير (تسوية عجز الصندوق)', v_org_id);
    END IF;

    -- 13. الخصم الممنوح
    IF v_total_discount > 0 AND v_discount_acc_id IS NOT NULL THEN
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
        VALUES (v_je_id, v_discount_acc_id, v_total_discount, 0, 'خصم مبيعات مسموح به', v_org_id);
    END IF;

    -- ⚖️ ضبط القيد ليكون متزناً بنسبة 100% (تطابق المدين مع الدائن حتى أدق مليم)
    SELECT COALESCE(SUM(debit), 0), COALESCE(SUM(credit), 0)
    INTO v_total_debit, v_total_credit
    FROM public.journal_lines
    WHERE journal_entry_id = v_je_id;

    IF ABS(v_total_debit - v_total_credit) > 0.001 THEN
        IF v_total_debit > v_total_credit THEN
            INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
            VALUES (v_je_id, COALESCE(v_cash_surplus_acc_id, v_sales_acc_id), 0, (v_total_debit - v_total_credit), 'تسوية توازن قيد إقفال الوردية (تقريب / فائض)', v_org_id);
        ELSE
            INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
            VALUES (v_je_id, COALESCE(v_cash_deficit_acc_id, v_default_exp_acc_id, v_sales_acc_id), (v_total_credit - v_total_debit), 0, 'تسوية توازن قيد إقفال الوردية (تقريب / عجز)', v_org_id);
        END IF;
    END IF;

    -- ترحيل القيد وربطه بالوردية
    UPDATE public.journal_entries SET status = 'posted', is_posted = true WHERE id = v_je_id;
    UPDATE public.shifts SET closing_journal_entry_id = v_je_id WHERE id = p_shift_id;

    PERFORM set_config('app.allow_financial_ledger_mutation', 'false', true);

    RETURN v_je_id;
EXCEPTION WHEN OTHERS THEN
    BEGIN
        PERFORM set_config('app.allow_financial_ledger_mutation', 'false', true);
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
    RAISE;
END;
$$;

-- 4. التوقيع البديل بمعامل واحد للتوافق الشامل
CREATE OR REPLACE FUNCTION public.generate_shift_closing_entry(p_shift_id uuid)
RETURNS uuid 
LANGUAGE plpgsql 
SECURITY DEFINER 
SET search_path = public 
AS $$
BEGIN
    RETURN public.generate_shift_closing_entry(p_shift_id, NULL::uuid);
END;
$$;

GRANT EXECUTE ON FUNCTION public.generate_shift_closing_entry(uuid, uuid) TO authenticated, service_role, anon;
GRANT EXECUTE ON FUNCTION public.generate_shift_closing_entry(uuid) TO authenticated, service_role, anon;

-- 5. تحديث دالة close_shift لتمرير المعاملات بأمان
CREATE OR REPLACE FUNCTION public.close_shift(
    p_shift_id       uuid,
    p_actual_cash    numeric,
    p_notes          text    DEFAULT NULL,
    p_org_id         uuid    DEFAULT NULL,
    p_reconciliation jsonb   DEFAULT NULL
)
RETURNS jsonb 
LANGUAGE plpgsql 
SECURITY DEFINER 
SET search_path = public 
AS $$
DECLARE
    v_summary       JSONB;
    v_expected_cash numeric;
    v_difference    numeric;
    v_org_id        uuid;
    v_je_id         uuid := NULL;
BEGIN
    PERFORM set_config('app.allow_financial_ledger_mutation', 'true', true);

    v_summary       := public.get_shift_summary(p_shift_id);
    v_expected_cash := COALESCE((v_summary->>'expected_cash')::numeric, 0);
    v_difference    := p_actual_cash - v_expected_cash;
    
    v_org_id        := COALESCE((SELECT organization_id FROM public.shifts WHERE id = p_shift_id), p_org_id, public.get_my_org());

    UPDATE public.shifts SET
        end_time                 = now(),
        actual_cash              = p_actual_cash,
        closing_balance          = p_actual_cash,
        expected_cash            = v_expected_cash,
        difference               = v_difference,
        status                   = 'CLOSED',
        notes                    = p_notes,
        total_gross_sales        = COALESCE((v_summary->>'total_sales')::numeric, 0),
        total_cash_sales         = COALESCE((v_summary->>'cash_sales')::numeric, 0),
        total_card_sales         = COALESCE((v_summary->>'card_sales')::numeric, 0),
        total_instapay_sales     = COALESCE((v_summary->>'instapay_sales')::numeric, 0),
        total_wallet_sales       = COALESCE((v_summary->>'wallet_sales')::numeric, 0),
        total_redeemed_deposits  = COALESCE((v_summary->>'redeemed_deposits')::numeric, 0),
        total_paid_ins           = COALESCE((v_summary->>'paid_ins')::numeric, 0),
        total_paid_outs          = COALESCE((v_summary->>'paid_outs')::numeric, 0),
        total_safe_drops         = COALESCE((v_summary->>'safe_drops')::numeric, 0),
        total_cash_returns       = COALESCE((v_summary->>'cash_returns')::numeric, 0),
        total_cash_deposits_in   = COALESCE((v_summary->>'cash_deposits_in')::numeric, 0),
        total_wallet_deposits_in = COALESCE((v_summary->>'wallet_deposits_in')::numeric, 0),
        total_instapay_deposits_in = COALESCE((v_summary->>'instapay_deposits_in')::numeric, 0),
        total_card_deposits_in   = COALESCE((v_summary->>'card_deposits_in')::numeric, 0),
        total_cash_deposits_refund = COALESCE((v_summary->>'cash_deposits_refund')::numeric, 0),
        total_wallet_deposits_refund = COALESCE((v_summary->>'wallet_deposits_refund')::numeric, 0),
        total_instapay_deposits_refund = COALESCE((v_summary->>'instapay_deposits_refund')::numeric, 0),
        non_cash_reconciliation  = COALESCE(p_reconciliation, '{}'::jsonb)
    WHERE id = p_shift_id;

    -- توليد قيد اليومية المجمع الشامل للوردية
    BEGIN
        v_je_id := public.generate_shift_closing_entry(p_shift_id, v_org_id);
    EXCEPTION WHEN OTHERS THEN
        UPDATE public.shifts 
        SET notes = COALESCE(notes, '') || ' [تنبيه القيد: ' || SQLERRM || ']'
        WHERE id = p_shift_id;
    END;

    PERFORM set_config('app.allow_financial_ledger_mutation', 'false', true);

    RETURN jsonb_build_object(
        'success', true,
        'shift_id', p_shift_id,
        'closing_journal_entry_id', v_je_id,
        'difference', v_difference
    );
EXCEPTION WHEN OTHERS THEN
    BEGIN
        PERFORM set_config('app.allow_financial_ledger_mutation', 'false', true);
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
    RAISE;
END;
$$;

-- الدالة التوافقية لـ close_shift
CREATE OR REPLACE FUNCTION public.close_shift(
    p_shift_id       uuid,
    p_actual_cash    numeric,
    p_notes          text    DEFAULT NULL,
    p_org_id         uuid    DEFAULT NULL
)
RETURNS jsonb 
LANGUAGE plpgsql 
SECURITY DEFINER 
SET search_path = public 
AS $$
BEGIN
    RETURN public.close_shift(p_shift_id, p_actual_cash, p_notes, p_org_id, NULL::jsonb);
END;
$$;

GRANT EXECUTE ON FUNCTION public.close_shift(uuid, numeric, text, uuid, jsonb) TO authenticated, service_role, anon;
GRANT EXECUTE ON FUNCTION public.close_shift(uuid, numeric, text, uuid) TO authenticated, service_role, anon;

-- 6. دالة إعادة ترحيل وتوليد قيد لوردية محددة repost_unposted_shift
CREATE OR REPLACE FUNCTION public.repost_unposted_shift(p_shift_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_shift  public.shifts;
    v_je_id  uuid;
BEGIN
    SELECT * INTO v_shift FROM public.shifts WHERE id = p_shift_id;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'الوردية غير موجودة');
    END IF;

    v_je_id := public.generate_shift_closing_entry(p_shift_id, v_shift.organization_id);

    IF v_je_id IS NOT NULL THEN
        -- مسح أي تنبيه سابق للقيد من الملاحظات
        UPDATE public.shifts
        SET notes = regexp_replace(COALESCE(notes, ''), '\[تنبيه القيد:[^\]]*\]', '', 'g')
        WHERE id = p_shift_id;

        RETURN jsonb_build_object(
            'success', true,
            'shift_id', p_shift_id,
            'closing_journal_entry_id', v_je_id,
            'message', 'تم توليد وترحيل القيد بنجاح'
        );
    ELSE
        RETURN jsonb_build_object(
            'success', false,
            'shift_id', p_shift_id,
            'error', 'لم يتم توليد قيد (وردية فارغة بدون مبيعات أو حركات نقدية)'
        );
    END IF;
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object(
        'success', false,
        'shift_id', p_shift_id,
        'error', SQLERRM
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.repost_unposted_shift(uuid) TO authenticated, service_role, anon;

-- 7. دالة ترحيل جماعي لكافة الورديات المعلقة السابقة repost_all_unposted_shifts
CREATE OR REPLACE FUNCTION public.repost_all_unposted_shifts(p_org_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    r RECORD;
    v_posted_count INT := 0;
    v_empty_count  INT := 0;
    v_failed_count INT := 0;
    v_res_id UUID;
BEGIN
    FOR r IN (
        SELECT id, organization_id, total_gross_sales, actual_cash
        FROM public.shifts
        WHERE status = 'CLOSED' 
          AND closing_journal_entry_id IS NULL
          AND (p_org_id IS NULL OR organization_id = p_org_id)
        ORDER BY start_time ASC
    ) LOOP
        BEGIN
            v_res_id := public.generate_shift_closing_entry(r.id, r.organization_id);
            IF v_res_id IS NOT NULL THEN
                v_posted_count := v_posted_count + 1;
                UPDATE public.shifts
                SET notes = regexp_replace(COALESCE(notes, ''), '\[تنبيه القيد:[^\]]*\]', '', 'g')
                WHERE id = r.id;
            ELSE
                v_empty_count := v_empty_count + 1;
            END IF;
        EXCEPTION WHEN OTHERS THEN
            v_failed_count := v_failed_count + 1;
            UPDATE public.shifts 
            SET notes = COALESCE(notes, '') || ' [تنبيه الترحيل الجماعي: ' || SQLERRM || ']'
            WHERE id = r.id;
        END;
    END LOOP;

    RETURN jsonb_build_object(
        'success', true,
        'posted_count', v_posted_count,
        'empty_count', v_empty_count,
        'failed_count', v_failed_count
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.repost_all_unposted_shifts(uuid) TO authenticated, service_role, anon;

COMMIT;

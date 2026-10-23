BEGIN;

-- 1. إضافة ربط حساب العربونات وحجوزات العملاء CUSTOMER_ADVANCES في company_settings
UPDATE public.company_settings 
SET account_mappings = account_mappings || jsonb_build_object('CUSTOMER_ADVANCES', '67a3d670-c743-4202-9bff-aaa241e7eb27')
WHERE organization_id = 'ec2b2ab5-be72-452f-ae44-ec1b4a4736db';

-- 2. ترقية استنتاج حساب دفعات العملاء المقدمة في generate_shift_closing_entry
-- ليعطي الأولوية لحساب (226 تأمينات ودفعات مقدمة من العملاء) قبل أي حساب آخر
CREATE OR REPLACE FUNCTION public.generate_shift_closing_entry(p_shift_id uuid)
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

    -- حسابات الدليل
    v_cash_acc_id           uuid;
    v_safe_acc_id           uuid;
    v_card_acc_id           uuid;
    v_instapay_acc_id       uuid;
    v_wallet_acc_id         uuid;
    v_sales_acc_id          uuid;
    v_vat_acc_id            uuid;
    v_returns_acc_id        uuid;
    v_shortage_acc_id       uuid;
    v_surplus_acc_id        uuid;
    v_customer_adv_acc_id   uuid;
    v_credit_ar_acc_id      uuid;

    -- المبالغ من ملخص الوردية
    v_gross_sales           numeric := 0;
    v_net_sales             numeric := 0;
    v_vat_amount            numeric := 0;
    v_cash_sales            numeric := 0;
    v_card_sales            numeric := 0;
    v_instapay_sales        numeric := 0;
    v_wallet_sales          numeric := 0;
    v_redeemed_deposits     numeric := 0;
    v_credit_sales          numeric := 0;
    v_safe_drops            numeric := 0;
    v_cash_returns          numeric := 0;
    v_paid_ins              numeric := 0;
    v_paid_outs             numeric := 0;

    v_cash_deposits_in      numeric := 0;
    v_wallet_deposits_in    numeric := 0;
    v_instapay_deposits_in  numeric := 0;
    v_card_deposits_in      numeric := 0;
    v_total_deposits_in     numeric := 0;

    v_cash_deposits_refund  numeric := 0;
    v_wallet_deposits_refund numeric := 0;
    v_instapay_deposits_refund numeric := 0;

    v_opening_balance       numeric := 0;
    v_expected_cash         numeric := 0;
    v_actual_cash           numeric := 0;
    v_diff                  numeric := 0;
    v_net_cash_to_post      numeric := 0;
    v_ref_no                text;
    v_petty_rec             RECORD;
BEGIN
    PERFORM set_config('app.allow_financial_ledger_mutation', 'true', true);

    SELECT * INTO v_shift FROM public.shifts WHERE id = p_shift_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'الوردية رقم % غير موجودة.', p_shift_id;
    END IF;

    v_org_id := COALESCE(v_shift.organization_id, public.get_my_org());

    -- جلب خريطة الحسابات
    SELECT account_mappings INTO v_mappings 
    FROM public.company_settings 
    WHERE organization_id = v_org_id;

    -- استدعاء ملخص الوردية الكامل
    v_summary := public.get_shift_summary(p_shift_id);

    v_opening_balance          := COALESCE((v_summary->>'opening_balance')::numeric, 0);
    v_gross_sales              := COALESCE((v_summary->>'total_sales')::numeric, 0);
    v_cash_sales               := COALESCE((v_summary->>'cash_sales')::numeric, 0);
    v_card_sales               := COALESCE((v_summary->>'card_sales')::numeric, 0);
    v_instapay_sales           := COALESCE((v_summary->>'instapay_sales')::numeric, 0);
    v_wallet_sales             := COALESCE((v_summary->>'wallet_sales')::numeric, 0);
    v_redeemed_deposits        := COALESCE((v_summary->>'redeemed_deposits')::numeric, 0);
    v_credit_sales             := COALESCE((v_summary->>'credit_sales')::numeric, 0);
    v_safe_drops               := COALESCE((v_summary->>'safe_drops')::numeric, 0);
    v_cash_returns             := COALESCE((v_summary->>'cash_returns')::numeric, 0);
    v_paid_ins                 := COALESCE((v_summary->>'paid_ins')::numeric, 0);
    v_paid_outs                := COALESCE((v_summary->>'paid_outs')::numeric, 0);

    v_cash_deposits_in         := COALESCE((v_summary->>'cash_deposits_in')::numeric, 0);
    v_wallet_deposits_in       := COALESCE((v_summary->>'wallet_deposits_in')::numeric, 0);
    v_instapay_deposits_in     := COALESCE((v_summary->>'instapay_deposits_in')::numeric, 0);
    v_card_deposits_in         := COALESCE((v_summary->>'card_deposits_in')::numeric, 0);
    v_total_deposits_in        := COALESCE((v_summary->>'total_deposits_in')::numeric, (v_cash_deposits_in + v_wallet_deposits_in + v_instapay_deposits_in + v_card_deposits_in));

    v_cash_deposits_refund     := COALESCE((v_summary->>'cash_deposits_refund')::numeric, 0);
    v_wallet_deposits_refund   := COALESCE((v_summary->>'wallet_deposits_refund')::numeric, 0);
    v_instapay_deposits_refund := COALESCE((v_summary->>'instapay_deposits_refund')::numeric, 0);

    v_expected_cash            := COALESCE((v_summary->>'expected_cash')::numeric, 0);
    v_actual_cash              := COALESCE(v_shift.actual_cash, v_expected_cash);
    v_diff                     := v_actual_cash - v_expected_cash;

    -- حساب صافي النقدية الموردة
    v_net_cash_to_post := GREATEST(0, (v_actual_cash - v_opening_balance));

    -- حل الحسابات الأساسية
    v_cash_acc_id := public.resolve_leaf_account(COALESCE(
        v_shift.treasury_account_id,
        public.safe_cast_uuid(v_mappings->>'CASH'),
        (SELECT id FROM public.accounts WHERE (organization_id = v_org_id OR organization_id IS NULL) AND code LIKE '1231%' ORDER BY organization_id NULLS LAST LIMIT 1)
    ));

    v_safe_acc_id := public.resolve_leaf_account(COALESCE(
        public.safe_cast_uuid(v_mappings->>'MAIN_VAULT'),
        public.safe_cast_uuid(v_mappings->>'SAFE'),
        (SELECT id FROM public.accounts WHERE (organization_id = v_org_id OR organization_id IS NULL) AND (code LIKE '1231%' OR name LIKE '%خزينة%') ORDER BY organization_id NULLS LAST LIMIT 1)
    ));

    v_card_acc_id := public.resolve_leaf_account(COALESCE(
        public.safe_cast_uuid(v_mappings->>'BANK_POS'),
        public.safe_cast_uuid(v_mappings->>'BANK'),
        (SELECT id FROM public.accounts WHERE (organization_id = v_org_id OR organization_id IS NULL) AND (code LIKE '1232%' OR code LIKE '122%') ORDER BY organization_id NULLS LAST LIMIT 1)
    ));

    v_instapay_acc_id := public.resolve_leaf_account(COALESCE(
        public.safe_cast_uuid(v_mappings->>'INSTAPAY'),
        (SELECT id FROM public.accounts WHERE (organization_id = v_org_id OR organization_id IS NULL) AND (name LIKE '%انستا%' OR name LIKE '%إنستا%' OR code = '123305') ORDER BY organization_id NULLS LAST LIMIT 1),
        v_card_acc_id
    ));

    v_wallet_acc_id := public.resolve_leaf_account(COALESCE(
        public.safe_cast_uuid(v_mappings->>'WALLET'),
        (SELECT id FROM public.accounts WHERE (organization_id = v_org_id OR organization_id IS NULL) AND (code LIKE '1233%' OR name LIKE '%محفظ%') ORDER BY organization_id NULLS LAST LIMIT 1),
        v_card_acc_id
    ));

    v_sales_acc_id := public.resolve_leaf_account(COALESCE(
        public.safe_cast_uuid(v_mappings->>'SALES_REVENUE'),
        (SELECT id FROM public.accounts WHERE (organization_id = v_org_id OR organization_id IS NULL) AND code LIKE '411%' ORDER BY organization_id NULLS LAST LIMIT 1)
    ));

    v_vat_acc_id := public.resolve_leaf_account(COALESCE(
        public.safe_cast_uuid(v_mappings->>'VAT_OUTPUT'),
        public.safe_cast_uuid(v_mappings->>'VAT'),
        (SELECT id FROM public.accounts WHERE (organization_id = v_org_id OR organization_id IS NULL) AND code LIKE '2231%' ORDER BY organization_id NULLS LAST LIMIT 1)
    ));

    v_returns_acc_id := public.resolve_leaf_account(COALESCE(
        public.safe_cast_uuid(v_mappings->>'SALES_RETURNS'),
        (SELECT id FROM public.accounts WHERE (organization_id = v_org_id OR organization_id IS NULL) AND (code LIKE '412%' OR code LIKE '413%') ORDER BY organization_id NULLS LAST LIMIT 1)
    ));

    -- 🌟 حل دقيق لحساب عربونات ودفعات العملاء المقدمة (إعطاء الأولوية لكود 226 ثم CUSTOMER_ADVANCES ثم SECURITY_DEPOSIT_ACCOUNT)
    v_customer_adv_acc_id := public.resolve_leaf_account(COALESCE(
        public.safe_cast_uuid(v_mappings->>'CUSTOMER_ADVANCES'),
        public.safe_cast_uuid(v_mappings->>'SECURITY_DEPOSIT_ACCOUNT'),
        (SELECT id FROM public.accounts WHERE (organization_id = v_org_id OR organization_id IS NULL) AND code LIKE '226%' ORDER BY organization_id NULLS LAST LIMIT 1),
        (SELECT id FROM public.accounts WHERE (organization_id = v_org_id OR organization_id IS NULL) AND (code LIKE '20102%' OR code LIKE '2202%' OR code LIKE '2102%' OR code LIKE '221%') ORDER BY organization_id NULLS LAST LIMIT 1),
        (SELECT id FROM public.accounts WHERE (organization_id = v_org_id OR organization_id IS NULL) AND name LIKE '%تأمينات ودفعات مقدمة من العملاء%' AND is_group = false ORDER BY organization_id NULLS LAST LIMIT 1)
    ));

    v_credit_ar_acc_id := public.resolve_leaf_account(COALESCE(
        public.safe_cast_uuid(v_mappings->>'CUSTOMERS'),
        (SELECT id FROM public.accounts WHERE (organization_id = v_org_id OR organization_id IS NULL) AND (code LIKE '1241%' OR code LIKE '121%') ORDER BY organization_id NULLS LAST LIMIT 1)
    ));

    v_shortage_acc_id := public.resolve_leaf_account(COALESCE(
        public.safe_cast_uuid(v_mappings->>'CASH_SHORTAGE'),
        public.safe_cast_uuid(v_mappings->>'CASH_DEFICIT'),
        (SELECT id FROM public.accounts WHERE (organization_id = v_org_id OR organization_id IS NULL) AND code LIKE '541%' ORDER BY organization_id NULLS LAST LIMIT 1),
        (SELECT id FROM public.accounts WHERE (organization_id = v_org_id OR organization_id IS NULL) AND name LIKE '%عجز%' AND is_group = false ORDER BY organization_id NULLS LAST LIMIT 1)
    ));

    v_surplus_acc_id := public.resolve_leaf_account(COALESCE(
        public.safe_cast_uuid(v_mappings->>'CASH_SURPLUS_ACC'),
        public.safe_cast_uuid(v_mappings->>'CASH_SURPLUS'),
        (SELECT id FROM public.accounts WHERE (organization_id = v_org_id OR organization_id IS NULL) AND code LIKE '441%' ORDER BY organization_id NULLS LAST LIMIT 1),
        (SELECT id FROM public.accounts WHERE (organization_id = v_org_id OR organization_id IS NULL) AND name LIKE '%زيادة الصندوق%' AND is_group = false ORDER BY organization_id NULLS LAST LIMIT 1)
    ));

    -- استخراج ضريبة القيمة المضافة من إجمالي المبيعات
    IF v_vat_acc_id IS NOT NULL AND v_gross_sales > 0 THEN
        v_net_sales  := ROUND(v_gross_sales / 1.14, 2);
        v_vat_amount := v_gross_sales - v_net_sales;
    ELSE
        v_net_sales  := v_gross_sales;
        v_vat_amount := 0;
    END IF;

    -- رقم إسناد القيد
    v_ref_no := 'SHIFT-' || TO_CHAR(NOW(), 'YYMMDD') || '-' || SUBSTRING(p_shift_id::text, 1, 4);

    -- إنشاء رأس القيد
    INSERT INTO public.journal_entries (
        organization_id, transaction_date, description, reference, status, is_posted,
        related_document_id, related_document_type, created_by
    ) VALUES (
        v_org_id, CURRENT_DATE, 'قيد إقفال مبيعات وحركة نقدية الوردية (مع الحجوزات والردود متعددة القنوات)',
        v_ref_no, 'draft', false, p_shift_id, 'shift', auth.uid()
    ) RETURNING id INTO v_je_id;

    -- ══════════════════════════════════════════════════════════════════════════════
    -- 🟢 طرف المدين (Debits): الموارد والأصول والمصروفات والردود المحققة
    -- ══════════════════════════════════════════════════════════════════════════════

    -- 1. النقدية الفعلية الموردة لدرج الكاشير
    IF v_net_cash_to_post > 0 AND v_cash_acc_id IS NOT NULL THEN
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
        VALUES (v_je_id, v_cash_acc_id, v_net_cash_to_post, 0, 'صافي النقدية الموردة لدرج الكاشير بعد خصم العهدة', v_org_id);
    END IF;

    -- 2. مبيعات البطاقات وشبكة نقاط البيع
    IF (v_card_sales + v_card_deposits_in) > 0 AND v_card_acc_id IS NOT NULL THEN
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
        VALUES (v_je_id, v_card_acc_id, (v_card_sales + v_card_deposits_in), 0, 'مقبوضات نقاط البيع وشبكة البطاقات (مبيعات + عربون)', v_org_id);
    END IF;

    -- 3. مقبوضات إنستاباي
    IF (v_instapay_sales + v_instapay_deposits_in) > 0 AND v_instapay_acc_id IS NOT NULL THEN
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
        VALUES (v_je_id, v_instapay_acc_id, (v_instapay_sales + v_instapay_deposits_in), 0, 'مقبوضات إنستاباي (مبيعات + عربون حجز)', v_org_id);
    END IF;

    -- 4. مقبوضات المحافظ الإلكترونية
    IF (v_wallet_sales + v_wallet_deposits_in) > 0 AND v_wallet_acc_id IS NOT NULL THEN
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
        VALUES (v_je_id, v_wallet_acc_id, (v_wallet_sales + v_wallet_deposits_in), 0, 'مقبوضات محافظ إلكترونية (فودافون كاش)', v_org_id);
    END IF;

    -- 5. تنفيذ الحجز / استهلاك العربون المسبق (تسوية تخفيض التزام الدفعة المقدمة)
    IF v_redeemed_deposits > 0 AND v_customer_adv_acc_id IS NOT NULL THEN
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
        VALUES (v_je_id, v_customer_adv_acc_id, v_redeemed_deposits, 0, 'تنفيذ حجز مسبق مستهلك في الفاتورة (تسوية دفعات مقدمة)', v_org_id);
    END IF;

    -- 6. ردود عربون الحجز الملغي للعملاء
    IF (v_cash_deposits_refund + v_wallet_deposits_refund + v_instapay_deposits_refund) > 0 AND v_customer_adv_acc_id IS NOT NULL THEN
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
        VALUES (v_je_id, v_customer_adv_acc_id, (v_cash_deposits_refund + v_wallet_deposits_refund + v_instapay_deposits_refund), 0, 'إلغاء حجز ورد عربون للعميل (تخفيض الدفعة المقدمة)', v_org_id);
    END IF;

    -- 7. مبيعات الآجل (ذمم عملاء)
    IF v_credit_sales > 0 AND v_credit_ar_acc_id IS NOT NULL THEN
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
        VALUES (v_je_id, v_credit_ar_acc_id, v_credit_sales, 0, 'مبيعات الوردية الآجلة (ذمم عملاء)', v_org_id);
    END IF;

    -- 8. مرتجعات المبيعات النقدية
    IF v_cash_returns > 0 AND v_returns_acc_id IS NOT NULL THEN
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
        VALUES (v_je_id, v_returns_acc_id, v_cash_returns, 0, 'مردودات مبيعات نقدية للوردية', v_org_id);
    END IF;

    -- 9. المصروفات النثرية المنصرفة من الدرج
    FOR v_petty_rec IN 
        SELECT 
            amount, 
            reason, 
            COALESCE(expense_account_id, v_mappings->>'EXPENSE_GENERAL', (SELECT id FROM accounts WHERE (organization_id = v_org_id OR organization_id IS NULL) AND code LIKE '523%' LIMIT 1))::uuid AS acc_id
        FROM public.pos_petty_cash_payouts
        WHERE (public_shift_id = p_shift_id OR shift_id = p_shift_id::text) 
          AND payout_type = 'EXPENSE'
          AND reason NOT ILIKE '%رد عربون%' AND reason NOT ILIKE '%إلغاء حجز%'
    LOOP
        IF v_petty_rec.amount > 0 AND v_petty_rec.acc_id IS NOT NULL THEN
            INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
            VALUES (v_je_id, public.resolve_leaf_account(v_petty_rec.acc_id), v_petty_rec.amount, 0, 'مصروف نثري من الدرج: ' || COALESCE(v_petty_rec.reason, ''), v_org_id);
        END IF;
    END LOOP;

    -- 10. توريد نقدية من الدرج للخزينة الرئيسية
    IF v_safe_drops > 0 AND v_safe_acc_id IS NOT NULL THEN
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
        VALUES (v_je_id, v_safe_acc_id, v_safe_drops, 0, 'توريد نقدية من درج الكاشير إلى الخزينة الرئيسية', v_org_id);
    END IF;

    -- 11. عجز الصندوق (إن وجد)
    IF v_diff < -0.01 AND v_shortage_acc_id IS NOT NULL THEN
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
        VALUES (v_je_id, v_shortage_acc_id, ABS(v_diff), 0, 'عجز نقدية في عهدة الكاشير (تسوية عجز الصندوق)', v_org_id);
    END IF;

    -- ══════════════════════════════════════════════════════════════════════════════
    -- 🔴 طرف الدائن (Credits): الإيرادات والضرائب والعربونات المستلمة والزيادة
    -- ══════════════════════════════════════════════════════════════════════════════

    -- 12. صافي إيراد المبيعات
    IF v_net_sales > 0 AND v_sales_acc_id IS NOT NULL THEN
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
        VALUES (v_je_id, v_sales_acc_id, 0, v_net_sales, 'إيراد مبيعات بضاعة الوردية (قبل الضريبة)', v_org_id);
    END IF;

    -- 13. ضريبة القيمة المضافة (مخرجات)
    IF v_vat_amount > 0 AND v_vat_acc_id IS NOT NULL THEN
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
        VALUES (v_je_id, v_vat_acc_id, 0, v_vat_amount, 'ضريبة القيمة المضافة المحصلة من مبيعات الوردية (14%)', v_org_id);
    END IF;

    -- 14. عربونات حجز استلمها الكاشير (دفعات مقدمة من العملاء)
    IF v_total_deposits_in > 0 AND v_customer_adv_acc_id IS NOT NULL THEN
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
        VALUES (v_je_id, v_customer_adv_acc_id, 0, v_total_deposits_in, 'عربونات حجز استلمها الكاشير (دفعات مقدمة من العملاء)', v_org_id);
    END IF;

    -- 15. تزويد نقدية فكة بالدرج
    IF v_paid_ins > 0 AND v_safe_acc_id IS NOT NULL THEN
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
        VALUES (v_je_id, v_safe_acc_id, 0, v_paid_ins, 'تزويد فكة لدرج الكاشير من الخزينة الرئيسية', v_org_id);
    END IF;

    -- 16. زيادة الصندوق (إن وجدت)
    IF v_diff > 0.01 AND v_surplus_acc_id IS NOT NULL THEN
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
        VALUES (v_je_id, v_surplus_acc_id, 0, v_diff, 'فائض نقدية في عهدة الكاشير (زيادة الصندوق)', v_org_id);
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

GRANT EXECUTE ON FUNCTION public.generate_shift_closing_entry(uuid) TO authenticated, service_role, anon;

COMMIT;

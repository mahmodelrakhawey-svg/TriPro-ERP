-- =================================================================
-- إصلاح مشكلة عدم توازن قيود إقفال الورديات
-- التاريخ: 30 مارس 2026
-- =================================================================

CREATE OR REPLACE FUNCTION public.generate_shift_closing_entry(p_shift_id UUID)
RETURNS UUID
LANGUAGE plpgsql
AS $$
DECLARE
    v_shift RECORD;
    v_sales_acc UUID;
    v_vat_acc UUID;
    v_cash_acc UUID;
    v_bank_acc UUID;
    v_shortage_acc UUID;
    v_overage_acc UUID;
    v_cogs_acc UUID;
    v_inventory_acc UUID;
    v_rounding_diff_acc UUID; -- حساب فروقات التقريب
    
    v_journal_entry_id UUID;
    v_journal_lines JSONB[] := ARRAY[]::JSONB[];
    
    v_total_tax NUMERIC := 0;
    v_net_sales NUMERIC := 0;
    
    v_cash_sales NUMERIC := 0;
    v_card_sales NUMERIC := 0;
    v_wallet_sales NUMERIC := 0;
    
    v_diff NUMERIC := 0; -- فرق العجز/الزيادة في الصندوق
    v_total_cogs NUMERIC := 0;
    
    v_total_debits NUMERIC := 0;
    v_total_credits NUMERIC := 0;
    v_balancing_diff NUMERIC := 0;
BEGIN
    -- 1. التحقق من الوردية
    SELECT * INTO v_shift FROM public.shifts WHERE id = p_shift_id;
    IF v_shift IS NULL THEN RAISE EXCEPTION 'Shift not found'; END IF;
    IF v_shift.end_time IS NULL THEN RAISE EXCEPTION 'Shift is not closed yet'; END IF;

    -- 2. حساب المجاميع من الطلبات (المبيعات والضريبة)
    SELECT 
        COALESCE(SUM(total_tax), 0),
        COALESCE(SUM(subtotal), 0)
    INTO v_total_tax, v_net_sales
    FROM public.orders
    WHERE user_id = v_shift.user_id 
      AND created_at >= v_shift.start_time 
      AND created_at <= v_shift.end_time
      AND status = 'COMPLETED';

    -- 3. تفصيل المدفوعات (النقدية والبنك)
    SELECT 
        COALESCE(SUM(CASE WHEN payment_method = 'CASH' THEN amount ELSE 0 END), 0),
        COALESCE(SUM(CASE WHEN payment_method = 'CARD' THEN amount ELSE 0 END), 0),
        COALESCE(SUM(CASE WHEN payment_method = 'WALLET' THEN amount ELSE 0 END), 0)
    INTO v_cash_sales, v_card_sales, v_wallet_sales
    FROM public.payments p
    JOIN public.orders o ON p.order_id = o.id
    WHERE o.user_id = v_shift.user_id
      AND o.created_at >= v_shift.start_time
      AND o.created_at <= v_shift.end_time
      AND p.status = 'COMPLETED';

    -- 4. حساب التكلفة (COGS)
    SELECT COALESCE(SUM(
        COALESCE(r.quantity_required, 0) * COALESCE(oi.quantity, 0) * COALESCE(ing.cost, 0)
    ), 0)
    INTO v_total_cogs
    FROM public.orders o
    JOIN public.order_items oi ON o.id = oi.order_id
    JOIN public.recipes r ON oi.product_id = r.product_id
    JOIN public.products ing ON r.ingredient_id = ing.id
    WHERE o.user_id = v_shift.user_id
      AND o.created_at >= v_shift.start_time
      AND o.created_at <= v_shift.end_time
      AND o.status = 'COMPLETED';

    v_diff := COALESCE(v_shift.difference, 0);

    -- 5. جلب الحسابات (مع Fallback لتجنب NULL)
    SELECT id INTO v_sales_acc FROM public.accounts WHERE code = '411' LIMIT 1;
    SELECT id INTO v_vat_acc FROM public.accounts WHERE code = '2231' LIMIT 1;
    SELECT id INTO v_cash_acc FROM public.accounts WHERE code = '1231' LIMIT 1;
    SELECT id INTO v_bank_acc FROM public.accounts WHERE code = '123201' LIMIT 1; -- البنك الأهلي كافتراضي
    IF v_bank_acc IS NULL THEN SELECT id INTO v_bank_acc FROM public.accounts WHERE code = '1232' LIMIT 1; END IF;
    
    SELECT id INTO v_shortage_acc FROM public.accounts WHERE code = '541' LIMIT 1;
    SELECT id INTO v_overage_acc FROM public.accounts WHERE code = '421' LIMIT 1;
    SELECT id INTO v_cogs_acc FROM public.accounts WHERE code = '511' LIMIT 1;
    SELECT id INTO v_inventory_acc FROM public.accounts WHERE code = '10301' LIMIT 1;
    
    -- حساب لتسوية الفروقات (مثلاً إيرادات متنوعة أو مصروفات متنوعة)
    SELECT id INTO v_rounding_diff_acc FROM public.accounts WHERE code = '421' LIMIT 1; 

    -- 6. بناء أسطر القيد
    
    -- أ. الإيرادات (دائن)
    IF v_net_sales > 0 AND v_sales_acc IS NOT NULL THEN 
        v_journal_lines := array_append(v_journal_lines, jsonb_build_object('account_id', v_sales_acc, 'debit', 0, 'credit', v_net_sales, 'description', 'إيراد مبيعات وردية'));
        v_total_credits := v_total_credits + v_net_sales;
    END IF;
    
    -- ب. الضريبة (دائن)
    IF v_total_tax > 0 AND v_vat_acc IS NOT NULL THEN 
        v_journal_lines := array_append(v_journal_lines, jsonb_build_object('account_id', v_vat_acc, 'debit', 0, 'credit', v_total_tax, 'description', 'ضريبة مبيعات وردية'));
        v_total_credits := v_total_credits + v_total_tax;
    ELSIF v_total_tax > 0 AND v_vat_acc IS NULL THEN
        -- إذا لم يوجد حساب ضريبة، أضفها للمبيعات لتجنب عدم التوازن
        RAISE NOTICE 'VAT Account 2231 not found, adding tax to sales revenue';
        v_journal_lines := array_append(v_journal_lines, jsonb_build_object('account_id', v_sales_acc, 'debit', 0, 'credit', v_total_tax, 'description', 'ضريبة (مضافة للمبيعات لعدم وجود حساب)'));
        v_total_credits := v_total_credits + v_total_tax;
    END IF;

    -- ج. المدفوعات البنكية (مدين)
    IF (v_card_sales + v_wallet_sales) > 0 AND v_bank_acc IS NOT NULL THEN 
        v_journal_lines := array_append(v_journal_lines, jsonb_build_object('account_id', v_bank_acc, 'debit', (v_card_sales + v_wallet_sales), 'credit', 0, 'description', 'متحصلات شبكة/محفظة'));
        v_total_debits := v_total_debits + (v_card_sales + v_wallet_sales);
    END IF;
    
    -- د. المدفوعات النقدية "المتوقعة" (مدين)
    -- ملاحظة: نحن نثبت النقدية المتوقعة أولاً، ثم نعالج العجز/الزيادة في خطوة منفصلة
    IF v_cash_sales > 0 AND v_cash_acc IS NOT NULL THEN 
        v_journal_lines := array_append(v_journal_lines, jsonb_build_object('account_id', v_cash_acc, 'debit', v_cash_sales, 'credit', 0, 'description', 'متحصلات نقدية (مبيعات)'));
        v_total_debits := v_total_debits + v_cash_sales;
    END IF;

    -- هـ. التحقق من التوازن الإجباري (Data Integrity Check)
    -- قد يختلف مجموع المدفوعات عن مجموع الفواتير بسبب كسور الهللات أو أخطاء برمجية
    v_balancing_diff := v_total_debits - v_total_credits;
    
    IF v_balancing_diff != 0 AND v_rounding_diff_acc IS NOT NULL THEN
        IF v_balancing_diff > 0 THEN
            -- المدين (المدفوعات) أكبر من الدائن (المبيعات) -> الفرق هو إيراد إضافي أو زيادة
            v_journal_lines := array_append(v_journal_lines, jsonb_build_object('account_id', v_rounding_diff_acc, 'debit', 0, 'credit', ABS(v_balancing_diff), 'description', 'فروقات تسوية مبيعات'));
        ELSE
            -- الدائن (المبيعات) أكبر من المدين (المدفوعات) -> الفرق هو عجز في التحصيل أو خصم
            v_journal_lines := array_append(v_journal_lines, jsonb_build_object('account_id', v_rounding_diff_acc, 'debit', ABS(v_balancing_diff), 'credit', 0, 'description', 'فروقات تسوية مبيعات'));
        END IF;
    END IF;

    -- و. قيد التكلفة والمخزون (منفصل ومتوازن ذاتياً)
    IF v_total_cogs > 0 AND v_cogs_acc IS NOT NULL AND v_inventory_acc IS NOT NULL THEN
        v_journal_lines := array_append(v_journal_lines, jsonb_build_object('account_id', v_cogs_acc, 'debit', v_total_cogs, 'credit', 0, 'description', 'تكلفة مبيعات الوردية'));
        v_journal_lines := array_append(v_journal_lines, jsonb_build_object('account_id', v_inventory_acc, 'debit', 0, 'credit', v_total_cogs, 'description', 'صرف مخزون للوردية'));
    END IF;

    -- ز. تسوية العجز والزيادة الفعلي (Shift Difference)
    -- هذا يعالج الفرق بين الكاش المتوقع (v_cash_sales) والكاش الفعلي المدخل
    IF v_diff < 0 AND v_shortage_acc IS NOT NULL THEN -- عجز
        v_journal_lines := array_append(v_journal_lines, jsonb_build_object('account_id', v_cash_acc, 'debit', 0, 'credit', ABS(v_diff), 'description', 'إثبات عجز وردية'));
        v_journal_lines := array_append(v_journal_lines, jsonb_build_object('account_id', v_shortage_acc, 'debit', ABS(v_diff), 'credit', 0, 'description', 'مصروف عجز وردية'));
    ELSIF v_diff > 0 AND v_overage_acc IS NOT NULL THEN -- زيادة
        v_journal_lines := array_append(v_journal_lines, jsonb_build_object('account_id', v_cash_acc, 'debit', v_diff, 'credit', 0, 'description', 'إثبات زيادة وردية'));
        v_journal_lines := array_append(v_journal_lines, jsonb_build_object('account_id', v_overage_acc, 'debit', 0, 'credit', v_diff, 'description', 'إيراد زيادة وردية'));
    END IF;

    -- 7. إنشاء القيد
    IF array_length(v_journal_lines, 1) > 0 THEN
        INSERT INTO public.journal_entries (transaction_date, description, reference, status, user_id)
        VALUES (now(), 'إقفال وردية - ' || to_char(v_shift.start_time, 'YYYY-MM-DD HH24:MI'), 'SHIFT-' || substring(p_shift_id::text, 1, 8), 'posted', v_shift.user_id)
        RETURNING id INTO v_journal_entry_id;

        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description)
        SELECT v_journal_entry_id, (line->>'account_id')::uuid, (line->>'debit')::numeric, (line->>'credit')::numeric, line->>'description'
        FROM jsonb_array_elements(to_jsonb(v_journal_lines)) AS line;

        UPDATE public.shifts SET related_journal_entry_id = v_journal_entry_id WHERE id = p_shift_id;
    END IF;
    
    RETURN v_journal_entry_id;
END;
$$;

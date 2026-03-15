-- =================================================================
-- TriPro ERP - Phase 3: Consolidated Accounting Integration
-- Date: 19 March 2026
-- Description: Auto-generate consolidated journal entry for shifts
-- =================================================================

-- 1. Add column to link shift with journal entry
ALTER TABLE public.shifts 
ADD COLUMN IF NOT EXISTS related_journal_entry_id UUID REFERENCES public.journal_entries(id);

-- 2. Function to generate consolidated entry
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
    v_journal_entry_id UUID;
    v_journal_lines JSONB[] := ARRAY[]::JSONB[];
    
    v_total_tax NUMERIC := 0;
    v_net_sales NUMERIC := 0;
    
    v_cash_sales NUMERIC := 0;
    v_card_sales NUMERIC := 0;
    v_wallet_sales NUMERIC := 0;
    
    v_diff NUMERIC := 0;
BEGIN
    -- أ. التحقق من الوردية
    SELECT * INTO v_shift FROM public.shifts WHERE id = p_shift_id;
    IF v_shift IS NULL THEN RAISE EXCEPTION 'Shift not found'; END IF;
    IF v_shift.end_time IS NULL THEN RAISE EXCEPTION 'Shift is not closed yet'; END IF;

    -- ب. حساب المجاميع من الطلبات والمدفوعات
    -- 1. المبيعات والضرائب (للوقت الحالي والمستخدم)
    SELECT 
        COALESCE(SUM(total_tax), 0),
        COALESCE(SUM(subtotal), 0)
    INTO v_total_tax, v_net_sales
    FROM public.orders
    WHERE user_id = v_shift.user_id 
      AND created_at >= v_shift.start_time 
      AND created_at <= v_shift.end_time
      AND status = 'COMPLETED';

    -- 2. تفصيل المدفوعات
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

    v_diff := v_shift.difference; -- الفروقات (فعلي - متوقع)

    -- ج. تحديد الحسابات (يجب التأكد من وجود هذه الأكواد في دليل الحسابات)
    SELECT id INTO v_sales_acc FROM public.accounts WHERE code = '411' LIMIT 1;
    SELECT id INTO v_vat_acc FROM public.accounts WHERE code = '2231' LIMIT 1;
    SELECT id INTO v_cash_acc FROM public.accounts WHERE code = '1231' LIMIT 1;
    SELECT id INTO v_bank_acc FROM public.accounts WHERE code = '1232' LIMIT 1; -- بنك افتراضي
    SELECT id INTO v_shortage_acc FROM public.accounts WHERE code = '541' LIMIT 1; -- عجز
    SELECT id INTO v_overage_acc FROM public.accounts WHERE code = '421' LIMIT 1; -- زيادة

    -- د. بناء أسطر القيد
    -- 1. الطرف الدائن (المبيعات والضريبة)
    IF v_net_sales > 0 THEN v_journal_lines := array_append(v_journal_lines, jsonb_build_object('account_id', v_sales_acc, 'debit', 0, 'credit', v_net_sales, 'description', 'إيراد مبيعات وردية ' || to_char(v_shift.start_time, 'YYYY-MM-DD'))); END IF;
    IF v_total_tax > 0 THEN v_journal_lines := array_append(v_journal_lines, jsonb_build_object('account_id', v_vat_acc, 'debit', 0, 'credit', v_total_tax, 'description', 'ضريبة مبيعات وردية')); END IF;

    -- 2. الطرف المدين (البنوك والنقدية)
    IF (v_card_sales + v_wallet_sales) > 0 THEN v_journal_lines := array_append(v_journal_lines, jsonb_build_object('account_id', v_bank_acc, 'debit', (v_card_sales + v_wallet_sales), 'credit', 0, 'description', 'متحصلات شبكة/محفظة')); END IF;
    IF v_cash_sales > 0 THEN v_journal_lines := array_append(v_journal_lines, jsonb_build_object('account_id', v_cash_acc, 'debit', v_cash_sales, 'credit', 0, 'description', 'متحصلات نقدية (مبيعات)')); END IF;

    -- 3. تسوية الفروقات (عجز أو زيادة)
    IF v_diff < 0 THEN -- عجز: الصندوق ينقص (دائن) والمصروف يزيد (مدين)
        v_journal_lines := array_append(v_journal_lines, jsonb_build_object('account_id', v_cash_acc, 'debit', 0, 'credit', ABS(v_diff), 'description', 'إثبات عجز وردية'));
        v_journal_lines := array_append(v_journal_lines, jsonb_build_object('account_id', v_shortage_acc, 'debit', ABS(v_diff), 'credit', 0, 'description', 'مصروف عجز وردية'));
    ELSIF v_diff > 0 THEN -- زيادة: الصندوق يزيد (مدين) والإيراد يزيد (دائن)
        v_journal_lines := array_append(v_journal_lines, jsonb_build_object('account_id', v_cash_acc, 'debit', v_diff, 'credit', 0, 'description', 'إثبات زيادة وردية'));
        v_journal_lines := array_append(v_journal_lines, jsonb_build_object('account_id', v_overage_acc, 'debit', 0, 'credit', v_diff, 'description', 'إيراد زيادة وردية'));
    END IF;

    -- هـ. إنشاء القيد
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
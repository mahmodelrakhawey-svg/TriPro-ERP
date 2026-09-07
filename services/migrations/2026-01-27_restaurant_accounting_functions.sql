-- =================================================================
-- TriPro ERP - Restaurant Accounting Functions
-- التاريخ: 27 يناير 2026
-- هذا الملف يحتوي على الدالة المحاسبية الرئيسية لإغلاق وردية المطعم
-- =================================================================

CREATE OR REPLACE FUNCTION public.generate_shift_closing_entry(p_shift_id UUID)
RETURNS UUID -- returns the new journal_entry_id
LANGUAGE plpgsql
AS $$
DECLARE
    v_shift RECORD;
    v_journal_entry_id UUID;
    v_total_revenue NUMERIC := 0;
    v_total_tax NUMERIC := 0;
    v_total_cogs NUMERIC := 0;
    v_total_cash NUMERIC := 0;
    v_total_card NUMERIC := 0;
    v_total_discount NUMERIC := 0;
    
    -- Account IDs
    acc_sales_revenue UUID;
    acc_vat UUID;
    acc_cogs UUID;
    acc_inventory UUID;
    acc_cash UUID;
    acc_card UUID;
    acc_sales_discount UUID;

BEGIN
    -- 1. Get shift details
    SELECT * INTO v_shift FROM public.shifts WHERE id = p_shift_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Shift not found: %', p_shift_id;
    END IF;

    -- 2. Get system account IDs (using codes for reliability)
    SELECT id INTO acc_sales_revenue FROM public.accounts WHERE code = '411';
    SELECT id INTO acc_vat FROM public.accounts WHERE code = '2231';
    SELECT id INTO acc_cogs FROM public.accounts WHERE code = '511';
    SELECT id INTO acc_inventory FROM public.accounts WHERE code = '10302'; -- Finished Goods
    SELECT id INTO acc_cash FROM public.accounts WHERE code = '1231';
    SELECT id INTO acc_card FROM public.accounts WHERE code = '1232'; -- Assuming Al Ahli Bank for cards
    SELECT id INTO acc_sales_discount FROM public.accounts WHERE code = '413';

    -- Check if all accounts are found
    IF acc_sales_revenue IS NULL OR acc_vat IS NULL OR acc_cogs IS NULL OR acc_inventory IS NULL OR acc_cash IS NULL OR acc_card IS NULL OR acc_sales_discount IS NULL THEN
        RAISE EXCEPTION 'One or more system accounts are not defined. Please check codes: 411, 2231, 511, 10302, 1231, 1232, 413.';
    END IF;

    -- 3. Aggregate financial data from completed orders within the shift
    WITH shift_orders AS (
        SELECT o.id, o.subtotal, o.total_tax, o.total_discount
        FROM public.orders o
        WHERE o.user_id = v_shift.user_id
          AND o.status = 'COMPLETED'
          AND o.created_at >= v_shift.start_time
          AND o.created_at <= COALESCE(v_shift.end_time, now())
    )
    SELECT COALESCE(SUM(so.subtotal), 0), COALESCE(SUM(so.total_tax), 0), COALESCE(SUM(so.total_discount), 0)
    INTO v_total_revenue, v_total_tax, v_total_discount
    FROM shift_orders;

    -- Aggregate payments
    SELECT COALESCE(SUM(CASE WHEN p.payment_method = 'CASH' THEN p.amount ELSE 0 END), 0), COALESCE(SUM(CASE WHEN p.payment_method = 'CARD' THEN p.amount ELSE 0 END), 0)
    INTO v_total_cash, v_total_card
    FROM public.payments p JOIN public.orders o ON p.order_id = o.id
    WHERE o.user_id = v_shift.user_id AND o.status = 'COMPLETED' AND o.created_at >= v_shift.start_time AND o.created_at <= COALESCE(v_shift.end_time, now());

    -- Aggregate COGS from order_items
    SELECT COALESCE(SUM(oi.quantity * oi.unit_cost), 0)
    INTO v_total_cogs
    FROM public.order_items oi JOIN public.orders o ON oi.order_id = o.id
    WHERE o.user_id = v_shift.user_id AND o.status = 'COMPLETED' AND o.created_at >= v_shift.start_time AND o.created_at <= COALESCE(v_shift.end_time, now());

    -- 4. Create Journal Entry if there are transactions
    IF v_total_revenue > 0 OR v_total_cogs > 0 THEN
        INSERT INTO public.journal_entries (transaction_date, description, reference, status, user_id)
        VALUES (v_shift.end_time::date, 'قيد إغلاق وردية المطعم للمستخدم ' || (SELECT full_name FROM public.profiles WHERE id = v_shift.user_id), 'SHIFT-' || v_shift.id::text, 'posted', v_shift.user_id)
        RETURNING id INTO v_journal_entry_id;

        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description)
        VALUES
            (v_journal_entry_id, acc_cash, v_total_cash, 0, 'إجمالي مبيعات الكاش'),
            (v_journal_entry_id, acc_card, v_total_card, 0, 'إجمالي مبيعات الشبكة'),
            (v_journal_entry_id, acc_sales_discount, v_total_discount, 0, 'إجمالي الخصومات'),
            (v_journal_entry_id, acc_sales_revenue, 0, v_total_revenue, 'إجمالي إيراد المبيعات'),
            (v_journal_entry_id, acc_vat, 0, v_total_tax, 'إجمالي ضريبة القيمة المضافة'),
            (v_journal_entry_id, acc_cogs, v_total_cogs, 0, 'تكلفة البضاعة المباعة للمطعم'),
            (v_journal_entry_id, acc_inventory, 0, v_total_cogs, 'صرف من مخزون المنتجات التامة');
            
        RETURN v_journal_entry_id;
    ELSE
        RETURN NULL;
    END IF;
END;
$$;
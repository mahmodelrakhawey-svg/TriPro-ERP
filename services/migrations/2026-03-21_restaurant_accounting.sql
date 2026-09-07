-- =================================================================
-- TriPro ERP - Restaurant Accounting Integration
-- Date: 21 March 2026
-- Description: Creates the function to post restaurant sales to accounting.
-- =================================================================

CREATE OR REPLACE FUNCTION public.post_restaurant_sale_to_accounting(
    p_order_id UUID,
    p_treasury_account_id UUID,
    p_payment_method payment_method
)
RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
    v_order RECORD;
    v_sales_acc UUID;
    v_vat_acc UUID;
    v_cogs_acc UUID;
    v_inventory_acc UUID;
    v_journal_entry_id UUID;
    v_total_cost NUMERIC := 0;
BEGIN
    -- 1. Get order details
    SELECT * INTO v_order FROM public.orders WHERE id = p_order_id;
    IF v_order IS NULL THEN RAISE EXCEPTION 'Order not found'; END IF;

    -- 2. Get system accounts
    SELECT id INTO v_sales_acc FROM public.accounts WHERE code = '411' LIMIT 1;
    SELECT id INTO v_vat_acc FROM public.accounts WHERE code = '2231' LIMIT 1;
    SELECT id INTO v_cogs_acc FROM public.accounts WHERE code = '511' LIMIT 1;
    SELECT id INTO v_inventory_acc FROM public.accounts WHERE code = '10302' LIMIT 1; -- Finished Goods

    -- Check if accounts exist
    IF v_sales_acc IS NULL OR v_vat_acc IS NULL OR v_cogs_acc IS NULL OR v_inventory_acc IS NULL THEN
        RAISE EXCEPTION 'One or more required system accounts are missing (Sales, VAT, COGS, Inventory).';
    END IF;

    -- 3. Calculate total cost of goods sold for the order
    SELECT COALESCE(SUM(oi.quantity * p.purchase_price), 0)
    INTO v_total_cost
    FROM public.order_items oi
    JOIN public.products p ON oi.product_id = p.id
    WHERE oi.order_id = p_order_id;

    -- 4. Create the journal entry
    INSERT INTO public.journal_entries (
        transaction_date,
        description,
        reference,
        status,
        user_id
    )
    VALUES (
        v_order.created_at,
        'فاتورة مطعم رقم ' || v_order.order_number,
        v_order.order_number,
        'posted',
        v_order.user_id
    )
    RETURNING id INTO v_journal_entry_id;

    -- 5. Insert journal lines
    INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description)
    VALUES
        -- Debit Treasury/Bank
        (v_journal_entry_id, p_treasury_account_id, v_order.grand_total, 0, 'متحصلات فاتورة مطعم'),
        -- Credit Sales Revenue
        (v_journal_entry_id, v_sales_acc, 0, v_order.subtotal, 'إيراد مبيعات مطعم'),
        -- Credit VAT
        (v_journal_entry_id, v_vat_acc, 0, v_order.total_tax, 'ضريبة القيمة المضافة'),
        -- Debit COGS
        (v_journal_entry_id, v_cogs_acc, v_total_cost, 0, 'تكلفة مبيعات مطعم'),
        -- Credit Inventory
        (v_journal_entry_id, v_inventory_acc, 0, v_total_cost, 'صرف من المخزون');

END;
$$;
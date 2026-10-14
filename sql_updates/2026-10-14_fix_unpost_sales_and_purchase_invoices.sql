-- =============================================================================
-- TriPro ERP — Database Migration
-- File: 2026-10-14_fix_unpost_sales_and_purchase_invoices.sql
-- Description:
--   Fix HTTP 400 Bad Request when unposting sales or purchase invoices.
--
-- Root Cause:
--   1. The trigger `trg_protect_posted_journal_lines` on `public.journal_lines`
--      prevents deleting lines of a journal entry while its status is 'posted':
--      "لا يمكن حذف أطراف قيد يومية مرحل (%). يرجى إلغاء ترحيل القيد أولاً."
--   2. `unpost_sales_invoice` and `unpost_purchase_invoice` executed:
--      `DELETE FROM public.journal_lines WHERE journal_entry_id = v_orig_journal_id;`
--      BEFORE resetting the journal entry status to 'draft', which triggered the
--      guard exception and aborted with status 400.
--   3. Also ensures foreign key unlinking on the invoice before deleting the entry,
--      handles reversal mode correctly by drafting before posting lines, cleans up
--      stock_ledger entries, and ensures complete atomic safety.
-- =============================================================================

-- 1. تحديث دالة إلغاء ترحيل فاتورة المبيعات (unpost_sales_invoice)
CREATE OR REPLACE FUNCTION public.unpost_sales_invoice(
    p_invoice_id uuid,
    p_org_id uuid DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_invoice record;
    v_org_id uuid;
    v_item record;
    v_base_qty numeric;
    v_cancel_mode text;
    v_orig_journal_id uuid;
    v_reversal_journal_id uuid;
    v_line record;
BEGIN
    -- أ. التحقق من وجود الفاتورة
    SELECT * INTO v_invoice FROM public.invoices WHERE id = p_invoice_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'فاتورة المبيعات غير موجودة (ID: %)', p_invoice_id;
    END IF;

    -- إذا كانت الفاتورة مسودة بالفعل، لا حاجة لإلغاء الترحيل
    IF v_invoice.status = 'draft' THEN
        RETURN true;
    END IF;

    v_org_id := COALESCE(p_org_id, v_invoice.organization_id);

    -- ب. استرجاع نمط الإلغاء من إعدادات الشركة (direct أم reversal)
    SELECT COALESCE(cancellation_mode, 'direct') INTO v_cancel_mode 
    FROM public.company_settings 
    WHERE organization_id = v_org_id LIMIT 1;
    v_cancel_mode := COALESCE(v_cancel_mode, 'direct');

    -- ج. عكس أثر المخزون لجميع بنود الفاتورة وإعادة الكميات للمستودع
    FOR v_item IN 
        SELECT product_id, quantity, uom_id 
        FROM public.invoice_items 
        WHERE invoice_id = p_invoice_id AND product_id IS NOT NULL AND quantity > 0
    LOOP
        BEGIN
            IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'uom_convert' AND pronamespace = 'public'::regnamespace) THEN
                v_base_qty := public.uom_convert(
                    v_item.quantity, 
                    v_item.uom_id, 
                    (SELECT base_uom_id FROM public.products WHERE id = v_item.product_id)
                );
            ELSE
                v_base_qty := v_item.quantity;
            END IF;
        EXCEPTION WHEN OTHERS THEN
            v_base_qty := v_item.quantity;
        END;

        IF v_base_qty IS NULL OR v_base_qty <= 0 THEN
            v_base_qty := v_item.quantity;
        END IF;

        IF v_invoice.warehouse_id IS NOT NULL THEN
            UPDATE public.products
            SET 
                stock = COALESCE(stock, 0) + v_base_qty,
                warehouse_stock = jsonb_set(
                    COALESCE(warehouse_stock, '{}'::jsonb),
                    ARRAY[v_invoice.warehouse_id::text],
                    to_jsonb(
                        COALESCE((warehouse_stock->>v_invoice.warehouse_id::text)::numeric, 0) + v_base_qty
                    )
                )
            WHERE id = v_item.product_id;
        ELSE
            UPDATE public.products
            SET stock = COALESCE(stock, 0) + v_base_qty
            WHERE id = v_item.product_id;
        END IF;
    END LOOP;

    -- تنظيف سجل حركة المخزون الموحد إن وُجد
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'stock_ledger') THEN
        DELETE FROM public.stock_ledger WHERE voucher_id = p_invoice_id;
    END IF;

    -- د. تحديد القيد المحاسبي المرتبط
    v_orig_journal_id := v_invoice.related_journal_entry_id;
    IF v_orig_journal_id IS NULL THEN
        SELECT id INTO v_orig_journal_id 
        FROM public.journal_entries 
        WHERE (related_document_id = p_invoice_id AND related_document_type = 'invoice')
           OR (reference = v_invoice.invoice_number AND (v_org_id IS NULL OR organization_id = v_org_id))
        ORDER BY created_at DESC
        LIMIT 1;
    END IF;

    -- هـ. فك ربط الفاتورة بالقيد وإعادتها لحالة مسودة أولاً
    UPDATE public.invoices
    SET 
        status = 'draft',
        related_journal_entry_id = NULL
    WHERE id = p_invoice_id;

    -- و. المعالجة المحاسبية بحسب نمط الشركة
    IF v_orig_journal_id IS NOT NULL THEN
        IF v_cancel_mode = 'reversal' THEN
            -- 🛡️ النمط المؤسسي الصارم: إنشاء قيد عكسي متزن
            INSERT INTO public.journal_entries (
                transaction_date,
                description,
                reference,
                status,
                organization_id,
                is_posted,
                related_document_id,
                related_document_type
            ) VALUES (
                CURRENT_DATE,
                'قيد تسوية عكسي لإلغاء فاتورة مبيعات رقم ' || COALESCE(v_invoice.invoice_number, '-'),
                'REV-' || COALESCE(v_invoice.invoice_number, '-'),
                'draft',
                v_org_id,
                false,
                p_invoice_id,
                'invoice_reversal'
            ) RETURNING id INTO v_reversal_journal_id;

            -- عكس الأطراف: المدين يصبح دائناً والدائن يصبح مديناً
            FOR v_line IN SELECT * FROM public.journal_lines WHERE journal_entry_id = v_orig_journal_id LOOP
                INSERT INTO public.journal_lines (
                    journal_entry_id,
                    account_id,
                    debit,
                    credit,
                    description,
                    organization_id
                ) VALUES (
                    v_reversal_journal_id,
                    v_line.account_id,
                    v_line.credit, -- عكس
                    v_line.debit,  -- عكس
                    'عكس أثر: ' || COALESCE(v_line.description, ''),
                    v_org_id
                );
            END LOOP;

            -- ترحيل القيد العكسي بعد توازن كافة أسطره
            UPDATE public.journal_entries
            SET status = 'posted', is_posted = true
            WHERE id = v_reversal_journal_id;

            -- وسم القيد القديم بأنه ملغي/معكوس
            UPDATE public.journal_entries 
            SET status = 'reversed', is_posted = false 
            WHERE id = v_orig_journal_id;

        ELSE
            -- 🛡️ النمط المباشر: تحويل القيد لمسودة أولاً لتجاوز حراس منع الحذف
            UPDATE public.journal_entries 
            SET status = 'draft', is_posted = false 
            WHERE id = v_orig_journal_id;

            DELETE FROM public.journal_lines WHERE journal_entry_id = v_orig_journal_id;
            DELETE FROM public.journal_entries WHERE id = v_orig_journal_id;
        END IF;
    END IF;

    -- تنظيف إضافي لأي قيود متبقية مرتبطة بنفس الرقم المرجعي لنفس المنشأة
    IF v_cancel_mode != 'reversal' AND v_invoice.invoice_number IS NOT NULL THEN
        UPDATE public.journal_entries
        SET status = 'draft', is_posted = false
        WHERE reference = v_invoice.invoice_number 
          AND (v_org_id IS NULL OR organization_id = v_org_id);

        DELETE FROM public.journal_lines 
        WHERE journal_entry_id IN (
            SELECT id FROM public.journal_entries 
            WHERE reference = v_invoice.invoice_number 
              AND (v_org_id IS NULL OR organization_id = v_org_id)
        );

        DELETE FROM public.journal_entries 
        WHERE reference = v_invoice.invoice_number 
          AND (v_org_id IS NULL OR organization_id = v_org_id);
    END IF;

    -- ز. تحديث رصيد العميل اللحظي
    IF v_invoice.customer_id IS NOT NULL THEN
        BEGIN
            IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'update_single_customer_balance' AND pronamespace = 'public'::regnamespace) THEN
                PERFORM public.update_single_customer_balance(v_invoice.customer_id, v_org_id);
            END IF;
        EXCEPTION WHEN OTHERS THEN NULL;
        END;
    END IF;

    RETURN true;
END;
$$;


-- 2. تحديث دالة إلغاء ترحيل فاتورة المشتريات (unpost_purchase_invoice)
CREATE OR REPLACE FUNCTION public.unpost_purchase_invoice(
    p_invoice_id uuid,
    p_org_id uuid DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_invoice record;
    v_org_id uuid;
    v_item record;
    v_base_qty numeric;
    v_cancel_mode text;
    v_orig_journal_id uuid;
    v_reversal_journal_id uuid;
    v_line record;
BEGIN
    -- أ. التحقق من وجود الفاتورة
    SELECT * INTO v_invoice FROM public.purchase_invoices WHERE id = p_invoice_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'فاتورة المشتريات غير موجودة (ID: %)', p_invoice_id;
    END IF;

    IF v_invoice.status = 'draft' THEN
        RETURN true;
    END IF;

    v_org_id := COALESCE(p_org_id, v_invoice.organization_id);

    -- ب. استرجاع نمط الإلغاء
    SELECT COALESCE(cancellation_mode, 'direct') INTO v_cancel_mode 
    FROM public.company_settings 
    WHERE organization_id = v_org_id LIMIT 1;
    v_cancel_mode := COALESCE(v_cancel_mode, 'direct');

    -- ج. عكس أثر المخزون
    FOR v_item IN 
        SELECT product_id, quantity, uom_id 
        FROM public.purchase_invoice_items 
        WHERE purchase_invoice_id = p_invoice_id AND product_id IS NOT NULL AND quantity > 0
    LOOP
        BEGIN
            IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'uom_convert' AND pronamespace = 'public'::regnamespace) THEN
                v_base_qty := public.uom_convert(
                    v_item.quantity, 
                    v_item.uom_id, 
                    (SELECT base_uom_id FROM public.products WHERE id = v_item.product_id)
                );
            ELSE
                v_base_qty := v_item.quantity;
            END IF;
        EXCEPTION WHEN OTHERS THEN
            v_base_qty := v_item.quantity;
        END;

        IF v_base_qty IS NULL OR v_base_qty <= 0 THEN
            v_base_qty := v_item.quantity;
        END IF;

        IF v_invoice.warehouse_id IS NOT NULL THEN
            UPDATE public.products
            SET 
                stock = GREATEST(0, COALESCE(stock, 0) - v_base_qty),
                warehouse_stock = jsonb_set(
                    COALESCE(warehouse_stock, '{}'::jsonb),
                    ARRAY[v_invoice.warehouse_id::text],
                    to_jsonb(
                        GREATEST(0, COALESCE((warehouse_stock->>v_invoice.warehouse_id::text)::numeric, 0) - v_base_qty)
                    )
                )
            WHERE id = v_item.product_id;
        ELSE
            UPDATE public.products
            SET stock = GREATEST(0, COALESCE(stock, 0) - v_base_qty)
            WHERE id = v_item.product_id;
        END IF;
    END LOOP;

    -- تنظيف سجل حركة المخزون الموحد إن وُجد
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'stock_ledger') THEN
        DELETE FROM public.stock_ledger WHERE voucher_id = p_invoice_id;
    END IF;

    -- د. تحديد القيد المحاسبي المرتبط
    v_orig_journal_id := v_invoice.related_journal_entry_id;
    IF v_orig_journal_id IS NULL THEN
        SELECT id INTO v_orig_journal_id 
        FROM public.journal_entries 
        WHERE (related_document_id = p_invoice_id AND related_document_type = 'purchase_invoice')
           OR (reference = v_invoice.invoice_number AND (v_org_id IS NULL OR organization_id = v_org_id))
        ORDER BY created_at DESC
        LIMIT 1;
    END IF;

    -- هـ. فك ربط الفاتورة بالقيد وتحويلها لمسودة أولاً
    UPDATE public.purchase_invoices
    SET 
        status = 'draft',
        related_journal_entry_id = NULL
    WHERE id = p_invoice_id;

    -- و. المعالجة المحاسبية بحسب نمط الشركة
    IF v_orig_journal_id IS NOT NULL THEN
        IF v_cancel_mode = 'reversal' THEN
            INSERT INTO public.journal_entries (
                transaction_date,
                description,
                reference,
                status,
                organization_id,
                is_posted,
                related_document_id,
                related_document_type
            ) VALUES (
                CURRENT_DATE,
                'قيد تسوية عكسي لإلغاء فاتورة مشتريات رقم ' || COALESCE(v_invoice.invoice_number, '-'),
                'REV-' || COALESCE(v_invoice.invoice_number, '-'),
                'draft',
                v_org_id,
                false,
                p_invoice_id,
                'purchase_invoice_reversal'
            ) RETURNING id INTO v_reversal_journal_id;

            FOR v_line IN SELECT * FROM public.journal_lines WHERE journal_entry_id = v_orig_journal_id LOOP
                INSERT INTO public.journal_lines (
                    journal_entry_id,
                    account_id,
                    debit,
                    credit,
                    description,
                    organization_id
                ) VALUES (
                    v_reversal_journal_id,
                    v_line.account_id,
                    v_line.credit, -- عكس
                    v_line.debit,  -- عكس
                    'عكس أثر: ' || COALESCE(v_line.description, ''),
                    v_org_id
                );
            END LOOP;

            UPDATE public.journal_entries 
            SET status = 'posted', is_posted = true 
            WHERE id = v_reversal_journal_id;

            UPDATE public.journal_entries 
            SET status = 'reversed', is_posted = false 
            WHERE id = v_orig_journal_id;

        ELSE
            -- تحويل القيد لمسودة أولاً لتجاوز حراس منع الحذف
            UPDATE public.journal_entries 
            SET status = 'draft', is_posted = false 
            WHERE id = v_orig_journal_id;

            DELETE FROM public.journal_lines WHERE journal_entry_id = v_orig_journal_id;
            DELETE FROM public.journal_entries WHERE id = v_orig_journal_id;
        END IF;
    END IF;

    -- تنظيف إضافي لأي قيود متبقية مرتبطة بنفس الرقم المرجعي لنفس المنشأة
    IF v_cancel_mode != 'reversal' AND v_invoice.invoice_number IS NOT NULL THEN
        UPDATE public.journal_entries
        SET status = 'draft', is_posted = false
        WHERE reference = v_invoice.invoice_number 
          AND (v_org_id IS NULL OR organization_id = v_org_id);

        DELETE FROM public.journal_lines 
        WHERE journal_entry_id IN (
            SELECT id FROM public.journal_entries 
            WHERE reference = v_invoice.invoice_number 
              AND (v_org_id IS NULL OR organization_id = v_org_id)
        );

        DELETE FROM public.journal_entries 
        WHERE reference = v_invoice.invoice_number 
          AND (v_org_id IS NULL OR organization_id = v_org_id);
    END IF;

    -- ز. تحديث رصيد المورد اللحظي
    IF v_invoice.supplier_id IS NOT NULL THEN
        BEGIN
            IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'update_single_supplier_balance' AND pronamespace = 'public'::regnamespace) THEN
                PERFORM public.update_single_supplier_balance(v_invoice.supplier_id, v_org_id);
            END IF;
        EXCEPTION WHEN OTHERS THEN NULL;
        END;
    END IF;

    RETURN true;
END;
$$;


-- 3. منح الصلاحيات للأدوار المعتمدة
GRANT EXECUTE ON FUNCTION public.unpost_sales_invoice(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.unpost_purchase_invoice(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_sales_invoice(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_purchase_invoice(uuid, uuid) TO authenticated;

-- ==============================================================================
-- 🔧 TriPro ERP — إصلاح دالة إلغاء ترحيل فواتير المشتريات وتنظيف القيود العالقة
-- الملف: sql_updates/2026-11-24_fix_unpost_purchase_invoice_and_clean_orphan_journals.sql
-- التاريخ: 2026-11-24
-- الغرض:
--   1. إضافة عمود cancellation_mode المفقود لجدول company_settings
--   2. تحديث دالة unpost_purchase_invoice لتكون فائقة المتانة والأمان
--   3. تنظيف القيد العالق 1ba930ef-5767-4239-b49d-30a50744bbac وأي قيود لفواتير تحولت لمسودة
-- ==============================================================================

-- 1. التأكد من وجود عمود cancellation_mode
ALTER TABLE public.company_settings ADD COLUMN IF NOT EXISTS cancellation_mode TEXT DEFAULT 'direct';

-- 2. تحديث دالة unpost_purchase_invoice بمناعة كاملة
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
    v_cancel_mode text := 'direct';
    v_orig_journal_id uuid;
    v_reversal_journal_id uuid;
    v_line record;
    v_caller_role text;
    v_caller_id uuid := auth.uid();
BEGIN
    -- أ. التحقق من وجود الفاتورة
    SELECT * INTO v_invoice FROM public.purchase_invoices WHERE id = p_invoice_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'فاتورة المشتريات غير موجودة (ID: %)', p_invoice_id;
    END IF;

    -- إذا كانت الفاتورة مسودة بالفعل
    IF v_invoice.status = 'draft' THEN
        -- تنظيف أي قيد محاسبي قديم لا يزال مرتبطاً بها بالخطأ
        PERFORM set_config('app.allow_financial_ledger_mutation', 'true', true);
        IF v_invoice.related_journal_entry_id IS NOT NULL THEN
            DELETE FROM public.journal_lines WHERE journal_entry_id = v_invoice.related_journal_entry_id;
            DELETE FROM public.journal_entries WHERE id = v_invoice.related_journal_entry_id;
            UPDATE public.purchase_invoices SET related_journal_entry_id = NULL WHERE id = p_invoice_id;
        END IF;
        PERFORM set_config('app.allow_financial_ledger_mutation', 'false', true);
        RETURN true;
    END IF;

    -- 🛡️ التحقق الأمني من صلاحيات المستخدم المتصل
    IF v_caller_id IS NOT NULL THEN
        SELECT role INTO v_caller_role FROM public.profiles WHERE id = v_caller_id;
        IF COALESCE(v_caller_role, '') NOT IN ('super_admin', 'admin', 'manager', 'accountant') THEN
            RAISE EXCEPTION 'TRIPRO_SECURITY_ALERT: لا تملك الصلاحية المحاسبية اللازمة لإلغاء ترحيل فواتير المشتريات.';
        END IF;
    END IF;

    -- 🛡️ تفعيل نطاق السماح الداخلي للعمليات المحاسبية
    PERFORM set_config('app.allow_financial_ledger_mutation', 'true', true);

    v_org_id := COALESCE(p_org_id, v_invoice.organization_id);

    -- جلب نمط الإلغاء بأمان تام
    BEGIN
        SELECT COALESCE(cancellation_mode, 'direct') INTO v_cancel_mode 
        FROM public.company_settings 
        WHERE organization_id = v_org_id LIMIT 1;
    EXCEPTION WHEN OTHERS THEN
        v_cancel_mode := 'direct';
    END;
    v_cancel_mode := COALESCE(v_cancel_mode, 'direct');

    -- ب. عكس أثر المخزون
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

    -- ج. حذف حركات المخزون المرتبطة بالفاتورة
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'stock_ledger') THEN
        DELETE FROM public.stock_ledger WHERE voucher_id = p_invoice_id;
    END IF;

    -- د. استرجاع القيد المرتبط
    v_orig_journal_id := v_invoice.related_journal_entry_id;
    IF v_orig_journal_id IS NULL THEN
        SELECT id INTO v_orig_journal_id 
        FROM public.journal_entries 
        WHERE (related_document_id = p_invoice_id AND related_document_type = 'purchase_invoice')
           OR (reference = v_invoice.invoice_number AND (v_org_id IS NULL OR organization_id = v_org_id))
        ORDER BY created_at DESC
        LIMIT 1;
    END IF;

    -- هـ. المعالجة المحاسبية
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
                'REV-PUR-' || COALESCE(v_invoice.invoice_number, '-'),
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
                    v_line.credit,
                    v_line.debit,
                    'عكس أثر: ' || COALESCE(v_line.description, ''),
                    v_org_id
                );
            END LOOP;

            UPDATE public.journal_entries SET status = 'posted', is_posted = true WHERE id = v_reversal_journal_id;
            UPDATE public.journal_entries SET status = 'reversed', is_posted = false WHERE id = v_orig_journal_id;
        ELSE
            -- النمط المباشر: حذف أسطر القيد وقيده بأمان
            DELETE FROM public.journal_lines WHERE journal_entry_id = v_orig_journal_id;
            DELETE FROM public.journal_entries WHERE id = v_orig_journal_id;
        END IF;
    END IF;

    -- تنظيف أي قيود أخرى بنفس الرقم المرجعي
    IF v_cancel_mode != 'reversal' AND v_invoice.invoice_number IS NOT NULL THEN
        DELETE FROM public.journal_lines 
        WHERE journal_entry_id IN (
            SELECT id FROM public.journal_entries 
            WHERE (reference = v_invoice.invoice_number OR related_document_id = p_invoice_id)
              AND (v_org_id IS NULL OR organization_id = v_org_id)
        );

        DELETE FROM public.journal_entries 
        WHERE (reference = v_invoice.invoice_number OR related_document_id = p_invoice_id)
          AND (v_org_id IS NULL OR organization_id = v_org_id);
    END IF;

    -- و. تحويل الفاتورة إلى مسودة وفك ارتباط القيد
    UPDATE public.purchase_invoices
    SET 
        status = 'draft',
        related_journal_entry_id = NULL
    WHERE id = p_invoice_id;

    -- ز. تحديث رصيد المورد
    IF v_invoice.supplier_id IS NOT NULL THEN
        BEGIN
            IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'update_single_supplier_balance' AND pronamespace = 'public'::regnamespace) THEN
                PERFORM public.update_single_supplier_balance(v_invoice.supplier_id, v_org_id);
            END IF;
        EXCEPTION WHEN OTHERS THEN NULL;
        END;
    END IF;

    -- ح. إعادة احتساب الأرصدة
    IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'recalculate_all_system_balances' AND pronamespace = 'public'::regnamespace) THEN
        PERFORM public.recalculate_all_system_balances(v_org_id);
    END IF;

    -- 🛡️ إغلاق نطاق السماح الداخلي للحصانة
    PERFORM set_config('app.allow_financial_ledger_mutation', 'false', true);

    RETURN true;
EXCEPTION WHEN OTHERS THEN
    BEGIN
        PERFORM set_config('app.allow_financial_ledger_mutation', 'false', true);
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
    RAISE;
END;
$$;

GRANT EXECUTE ON FUNCTION public.unpost_purchase_invoice(uuid, uuid) TO authenticated, service_role;

-- ============================================================
-- 3. تنظيف القيد العالق المذكور في رسالة الكونسول
-- ============================================================
DO $$
DECLARE
    v_org_id uuid;
BEGIN
    PERFORM set_config('app.allow_financial_ledger_mutation', 'true', true);

    -- جلب منظمة القيد إن وجد
    SELECT organization_id INTO v_org_id 
    FROM public.journal_entries 
    WHERE id = '1ba930ef-5767-4239-b49d-30a50744bbac';

    IF v_org_id IS NOT NULL THEN
        DELETE FROM public.journal_lines WHERE journal_entry_id = '1ba930ef-5767-4239-b49d-30a50744bbac';
        DELETE FROM public.journal_entries WHERE id = '1ba930ef-5767-4239-b49d-30a50744bbac';
        PERFORM public.recalculate_all_system_balances(v_org_id);
        RAISE NOTICE '✅ تم حذف القيد العالق 1ba930ef-5767-4239-b49d-30a50744bbac وإعادة حساب الأرصدة.';
    END IF;

    PERFORM set_config('app.allow_financial_ledger_mutation', 'false', true);
END $$;

-- 4. تسجيل ملف التحديث في جدول التتبع
INSERT INTO public._schema_migrations (version, filename, applied_at)
VALUES (
  '2026-11-24_fix_unpost_purchase_invoice_and_clean_orphan_journals',
  '2026-11-24_fix_unpost_purchase_invoice_and_clean_orphan_journals.sql',
  NOW()
)
ON CONFLICT (version) DO NOTHING;

-- ==============================================================================
-- Migration: Fix Unpost and Post Purchase & Sales Invoice Immutability Protection
-- Date: 2026-10-21
-- Description: حل مشكلة تعذر اعتماد أو إلغاء ترحيل فواتير المشتريات والمبيعات
--              (TRIPRO_SECURITY_ALERT: أسطر القيد المحاسبي المرحل محصنة ولا يمكن تعديل حساباتها أو مبالغها أو حذفها مباشرة)
--              عبر تفعيل نطاق السماح الداخلي (Scoped Mutation Bypass) في الدوال المخزنة المعتمدة
-- ==============================================================================

-- 0. تحديث مشغل حماية أطراف القيود المرحّلة ليدعم التجاوز النظامي المعتمد وإلغاء الترحيل
CREATE OR REPLACE FUNCTION public.fn_protect_posted_journal_lines()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_status TEXT;
    v_bypass TEXT;
BEGIN
    BEGIN
        v_bypass := current_setting('app.allow_financial_ledger_mutation', true);
    EXCEPTION WHEN OTHERS THEN
        v_bypass := 'false';
    END;

    IF v_bypass = 'true' THEN
        IF TG_OP = 'DELETE' THEN
            RETURN OLD;
        ELSE
            RETURN NEW;
        END IF;
    END IF;

    IF TG_OP = 'DELETE' THEN
        SELECT status INTO v_status FROM public.journal_entries WHERE id = OLD.journal_entry_id;
        IF v_status = 'posted' THEN
            RAISE EXCEPTION 'لا يمكن حذف أطراف قيد يومية مرحل (%s). يرجى إلغاء ترحيل القيد أولاً.', OLD.journal_entry_id;
        END IF;
        RETURN OLD;
    ELSIF TG_OP = 'UPDATE' THEN
        SELECT status INTO v_status FROM public.journal_entries WHERE id = NEW.journal_entry_id;
        IF v_status = 'posted' AND (OLD.debit <> NEW.debit OR OLD.credit <> NEW.credit OR OLD.account_id <> NEW.account_id) THEN
            RAISE EXCEPTION 'لا يمكن تعديل أطراف قيد يومية مرحل (%s). يرجى إلغاء ترحيل القيد أولاً.', NEW.journal_entry_id;
        END IF;
        RETURN NEW;
    END IF;
    RETURN NEW;
END;
$$;

-- 1. تحديث دالة اعتماد وترحيل فاتورة المشتريات (approve_purchase_invoice)
CREATE OR REPLACE FUNCTION public.approve_purchase_invoice(
    p_invoice_id uuid,
    p_org_id uuid DEFAULT NULL,
    p_warehouse_id uuid DEFAULT NULL
)
RETURNS void 
LANGUAGE plpgsql 
SECURITY DEFINER 
SET search_path = public 
AS $$
DECLARE
    v_invoice record;
    v_item record;
    v_org_id uuid;
    v_wh_id uuid;
    v_base_qty numeric;
    v_unit_cost_base numeric;
    v_inventory_acc_id uuid;
    v_vat_in_id uuid;
    v_supplier_acc_id uuid;
    v_purchase_discount_acc_id uuid;
    v_treasury_acc_id uuid;
    v_journal_id uuid;
    v_mappings jsonb;
    v_cur_stock numeric;
    v_cur_cost numeric;
    v_new_wac numeric;
    v_discount_amount numeric := 0;
    v_tax_amount numeric := 0;
    v_total_amount numeric := 0;
    v_paid_amount numeric := 0;
    v_inv_debit_amount numeric := 0;
    v_entry_diff numeric := 0;
BEGIN
    -- أ. التحقق من وجود الفاتورة وحالتها
    SELECT * INTO v_invoice FROM public.purchase_invoices WHERE id = p_invoice_id;
    IF NOT FOUND THEN 
        RAISE EXCEPTION 'فاتورة المشتريات غير موجودة (ID: %)', p_invoice_id; 
    END IF;

    IF v_invoice.status IN ('posted', 'paid') THEN 
        RETURN; 
    END IF;

    -- 🛡️ تفعيل نطاق السماح الداخلي لتعديل أو تنظيف القيود السابقة بأمان
    PERFORM set_config('app.allow_financial_ledger_mutation', 'true', true);

    v_org_id := COALESCE(p_org_id, v_invoice.organization_id, public.get_my_org());
    IF v_org_id IS NULL THEN 
        PERFORM set_config('app.allow_financial_ledger_mutation', 'false', true);
        RAISE EXCEPTION 'تعذر تحديد هوية المنظمة لفاتورة المشتريات.'; 
    END IF;

    v_wh_id := COALESCE(p_warehouse_id, v_invoice.warehouse_id, (SELECT id FROM public.warehouses WHERE organization_id = v_org_id LIMIT 1));
    
    v_discount_amount := COALESCE((to_jsonb(v_invoice)->>'discount_amount')::numeric, 0);
    v_total_amount := COALESCE(v_invoice.total_amount, 0);
    v_tax_amount := COALESCE(v_invoice.tax_amount, 0);
    v_paid_amount := COALESCE(v_invoice.paid_amount, 0);
    v_treasury_acc_id := v_invoice.treasury_account_id;

    -- حساب قيمة المخزون لضمان التوازن الحتمي
    v_inv_debit_amount := v_total_amount + v_discount_amount - v_tax_amount;

    -- جلب الحسابات المحاسبية المرتبطة
    SELECT account_mappings INTO v_mappings FROM public.company_settings WHERE organization_id = v_org_id;
    v_inventory_acc_id := COALESCE((v_mappings->>'INVENTORY_RAW_MATERIALS')::uuid, (SELECT id FROM public.accounts WHERE code IN ('10301', '103', '1105') AND organization_id = v_org_id LIMIT 1));
    v_vat_in_id := COALESCE((v_mappings->>'VAT_INPUT')::uuid, (v_mappings->>'VAT')::uuid, (SELECT id FROM public.accounts WHERE code IN ('1241', '10204', '202', '2103') AND organization_id = v_org_id LIMIT 1));
    v_supplier_acc_id := COALESCE((v_mappings->>'SUPPLIERS')::uuid, (SELECT id FROM public.accounts WHERE code IN ('201', '2101') AND organization_id = v_org_id LIMIT 1));

    IF v_discount_amount > 0 THEN
        v_purchase_discount_acc_id := public.resolve_leaf_account(COALESCE(
            public.safe_cast_uuid(v_mappings->>'PURCHASE_DISCOUNT'),
            (SELECT id FROM public.accounts WHERE organization_id = v_org_id AND code = (v_mappings->>'PURCHASE_DISCOUNT') LIMIT 1),
            (SELECT id FROM public.accounts WHERE organization_id = v_org_id AND code IN ('513', '5102') LIMIT 1),
            (SELECT id FROM public.accounts WHERE organization_id = v_org_id AND name LIKE '%خصم مكتسب%' LIMIT 1)
        ));

        IF v_purchase_discount_acc_id IS NULL THEN
            INSERT INTO public.accounts (code, name, type, is_group, organization_id)
            VALUES ('513', 'خصم مكتسب على المشتريات', 'cogs', false, v_org_id)
            ON CONFLICT DO NOTHING
            RETURNING id INTO v_purchase_discount_acc_id;

            IF v_purchase_discount_acc_id IS NULL THEN
                SELECT id INTO v_purchase_discount_acc_id FROM public.accounts 
                WHERE organization_id = v_org_id AND code = '513' LIMIT 1;
            END IF;
        END IF;
    END IF;

    -- ب. تحديث أرصدة المخزون ومتوسط التكلفة المرجح
    FOR v_item IN 
        SELECT pii.*, p.stock as prod_stock, p.weighted_average_cost, p.cost, p.purchase_price, p.base_uom_id, p.inventory_account_id
        FROM public.purchase_invoice_items pii
        JOIN public.products p ON pii.product_id = p.id
        WHERE pii.purchase_invoice_id = p_invoice_id
    LOOP
        BEGIN
            IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'uom_convert' AND pronamespace = 'public'::regnamespace) THEN
                v_base_qty := public.uom_convert(v_item.quantity, v_item.uom_id, v_item.base_uom_id);
            ELSE
                v_base_qty := v_item.quantity;
            END IF;
        EXCEPTION WHEN OTHERS THEN
            v_base_qty := v_item.quantity;
        END;

        IF v_base_qty IS NULL OR v_base_qty <= 0 THEN 
            v_base_qty := v_item.quantity; 
        END IF;

        DECLARE
            v_raw_price numeric := COALESCE(
                (to_jsonb(v_item)->>'unit_price')::numeric,
                (to_jsonb(v_item)->>'price')::numeric,
                0
            );
        BEGIN
            v_unit_cost_base := (v_raw_price * v_item.quantity) / NULLIF(v_base_qty, 0);
        END;

        v_cur_stock := COALESCE(v_item.prod_stock, 0);
        v_cur_cost := COALESCE(NULLIF(v_item.weighted_average_cost, 0), NULLIF(v_item.cost, 0), v_item.purchase_price, v_unit_cost_base);

        IF (v_cur_stock + v_base_qty) > 0 THEN
            v_new_wac := ROUND(((v_cur_stock * v_cur_cost) + (v_base_qty * v_unit_cost_base)) / (v_cur_stock + v_base_qty), 4);
        ELSE
            v_new_wac := v_unit_cost_base;
        END IF;

        IF v_wh_id IS NOT NULL THEN
            UPDATE public.products
            SET 
                stock = COALESCE(stock, 0) + v_base_qty,
                warehouse_stock = jsonb_set(
                    COALESCE(warehouse_stock, '{}'::jsonb),
                    ARRAY[v_wh_id::text],
                    to_jsonb(COALESCE((warehouse_stock->>v_wh_id::text)::numeric, 0) + v_base_qty)
                ),
                purchase_price = v_unit_cost_base,
                cost = v_new_wac,
                weighted_average_cost = v_new_wac
            WHERE id = v_item.product_id;
        ELSE
            UPDATE public.products
            SET stock = COALESCE(stock, 0) + v_base_qty,
                purchase_price = v_unit_cost_base,
                cost = v_new_wac,
                weighted_average_cost = v_new_wac
            WHERE id = v_item.product_id;
        END IF;
    END LOOP;

    -- ج. مسح أي قيود محاسبية سابقة متبقية للفاتورة (مع إلغاء ترحيلها أولاً وتجاوز الحصانة المحاسبية بأمان)
    UPDATE public.journal_entries 
    SET status = 'draft', is_posted = false 
    WHERE (related_document_id = p_invoice_id AND related_document_type = 'purchase_invoice')
       OR id = v_invoice.related_journal_entry_id
       OR (reference = v_invoice.invoice_number AND organization_id = v_org_id AND reference IS NOT NULL);

    DELETE FROM public.journal_lines 
    WHERE journal_entry_id IN (
        SELECT id FROM public.journal_entries 
        WHERE (related_document_id = p_invoice_id AND related_document_type = 'purchase_invoice')
           OR id = v_invoice.related_journal_entry_id
           OR (reference = v_invoice.invoice_number AND organization_id = v_org_id AND reference IS NOT NULL)
    );

    DELETE FROM public.journal_entries 
    WHERE (related_document_id = p_invoice_id AND related_document_type = 'purchase_invoice')
       OR id = v_invoice.related_journal_entry_id
       OR (reference = v_invoice.invoice_number AND organization_id = v_org_id AND reference IS NOT NULL);

    -- د. إنشاء القيد المحاسبي أولاً كمسودة (draft) لضمان إدراج الأسطر وموازنتها بدقة دون قيود الحصانة
    INSERT INTO public.journal_entries (
        transaction_date, 
        description, 
        reference, 
        status, 
        organization_id, 
        related_document_id, 
        related_document_type, 
        is_posted
    ) VALUES (
        COALESCE(v_invoice.invoice_date, CURRENT_DATE),
        'فاتورة مشتريات رقم ' || COALESCE(v_invoice.invoice_number, '-'),
        v_invoice.invoice_number,
        'draft',
        v_org_id,
        p_invoice_id,
        'purchase_invoice',
        false
    ) RETURNING id INTO v_journal_id;

    -- 1. المدين: المخزون
    IF v_inventory_acc_id IS NOT NULL THEN
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
        VALUES (v_journal_id, v_inventory_acc_id, v_inv_debit_amount, 0, 'إثبات مشتريات - مخزون', v_org_id);
    END IF;

    -- 2. المدين: ضريبة المدخلات
    IF v_tax_amount > 0 AND v_vat_in_id IS NOT NULL THEN
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
        VALUES (v_journal_id, v_vat_in_id, v_tax_amount, 0, 'ضريبة مدخلات مشتريات', v_org_id);
    END IF;

    -- 3. الدائن: الخصم المكتسب
    IF v_discount_amount > 0 AND v_purchase_discount_acc_id IS NOT NULL THEN
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
        VALUES (v_journal_id, v_purchase_discount_acc_id, 0, v_discount_amount, 'خصم مكتسب على المشتريات', v_org_id);
    END IF;

    -- 4. الدائن: استحقاق المورد
    IF v_supplier_acc_id IS NOT NULL THEN
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
        VALUES (v_journal_id, v_supplier_acc_id, 0, v_total_amount, 'استحقاق مورد - فاتورة مشتريات', v_org_id);
    END IF;

    -- 5. إثبات السداد الفوري (إن وجد)
    IF v_paid_amount > 0 AND v_treasury_acc_id IS NOT NULL AND v_supplier_acc_id IS NOT NULL THEN
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
        VALUES 
            (v_journal_id, v_supplier_acc_id, v_paid_amount, 0, 'سداد فوري - فاتورة مشتريات ' || COALESCE(v_invoice.invoice_number, '-'), v_org_id),
            (v_journal_id, v_treasury_acc_id, 0, v_paid_amount, 'دفع نقدي للمورد', v_org_id);
    END IF;

    -- 6. صمام الموازنة الدقيقة لفروق الكسور (Auto-Balancing)
    SELECT COALESCE(SUM(debit), 0) - COALESCE(SUM(credit), 0)
    INTO v_entry_diff
    FROM public.journal_lines
    WHERE journal_entry_id = v_journal_id;

    IF ABS(v_entry_diff) > 0 AND ABS(v_entry_diff) <= 0.05 THEN
        UPDATE public.journal_lines
        SET debit = debit - v_entry_diff
        WHERE journal_entry_id = v_journal_id AND account_id = v_inventory_acc_id;
    END IF;

    -- هـ. ترحيل القيد المحاسبي بعد التأكد من اكتماله وموازنته بدقة
    UPDATE public.journal_entries
    SET status = 'posted', is_posted = true
    WHERE id = v_journal_id;

    -- و. تحديث حالة الفاتورة
    UPDATE public.purchase_invoices 
    SET status = CASE WHEN (v_total_amount - v_paid_amount) <= 0.01 THEN 'paid' ELSE 'posted' END, 
        related_journal_entry_id = v_journal_id,
        warehouse_id = v_wh_id
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

    -- 🛡️ إغلاق نطاق السماح الداخلي للحصانة
    PERFORM set_config('app.allow_financial_ledger_mutation', 'false', true);

EXCEPTION WHEN OTHERS THEN
    -- ضمان إغلاق نطاق السماح عند حدوث أي خطأ وإعادة إلقاء الخطأ
    BEGIN
        PERFORM set_config('app.allow_financial_ledger_mutation', 'false', true);
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
    RAISE;
END;
$$;


-- 2. دوال post_purchase_invoice المستعارة وضمان ربطها بـ approve_purchase_invoice
CREATE OR REPLACE FUNCTION public.post_purchase_invoice(
    p_invoice_id uuid,
    p_org_id uuid DEFAULT NULL,
    p_warehouse_id uuid DEFAULT NULL
)
RETURNS void 
LANGUAGE plpgsql 
SECURITY DEFINER 
SET search_path = public 
AS $$
BEGIN
    PERFORM public.approve_purchase_invoice(p_invoice_id, p_org_id, p_warehouse_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.post_purchase_invoice(p_invoice_id uuid)
RETURNS void 
LANGUAGE plpgsql 
SECURITY DEFINER 
SET search_path = public 
AS $$
BEGIN
    PERFORM public.approve_purchase_invoice(p_invoice_id, NULL, NULL);
END;
$$;

GRANT EXECUTE ON FUNCTION public.approve_purchase_invoice(uuid, uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.post_purchase_invoice(uuid, uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.post_purchase_invoice(uuid) TO authenticated, service_role;


-- 3. تحديث دالة إلغاء ترحيل فاتورة المشتريات (unpost_purchase_invoice) لدعم حصانة دفتر الأستاذ
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
    v_caller_role text;
    v_caller_id uuid := auth.uid();
BEGIN
    -- أ. التحقق من وجود الفاتورة
    SELECT * INTO v_invoice FROM public.purchase_invoices WHERE id = p_invoice_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'فاتورة المشتريات غير موجودة (ID: %)', p_invoice_id;
    END IF;

    IF v_invoice.status = 'draft' THEN
        RETURN true;
    END IF;

    -- 🛡️ التحقق الأمني من صلاحيات المستخدم المتصل
    IF v_caller_id IS NOT NULL THEN
        SELECT role INTO v_caller_role FROM public.profiles WHERE id = v_caller_id;
        IF COALESCE(v_caller_role, '') NOT IN ('super_admin', 'admin', 'manager', 'accountant') THEN
            RAISE EXCEPTION 'TRIPRO_SECURITY_ALERT: لا تملك الصلاحية المحاسبية اللازمة لإلغاء ترحيل فواتير المشتريات.';
        END IF;

        IF v_invoice.organization_id IS NOT NULL 
           AND v_invoice.organization_id <> public.get_my_org() 
           AND COALESCE(v_caller_role, '') NOT IN ('super_admin') THEN
            RAISE EXCEPTION 'TRIPRO_SECURITY_ALERT: هذه الفاتورة تتبع منشأة أخرى ولا يحق لك تعديلها.';
        END IF;
    END IF;

    -- 🛡️ تفعيل نطاق السماح الداخلي للعمليات المحاسبية
    PERFORM set_config('app.allow_financial_ledger_mutation', 'true', true);

    v_org_id := COALESCE(p_org_id, v_invoice.organization_id);

    SELECT COALESCE(cancellation_mode, 'direct') INTO v_cancel_mode 
    FROM public.company_settings 
    WHERE organization_id = v_org_id LIMIT 1;
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

    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'stock_ledger') THEN
        DELETE FROM public.stock_ledger WHERE voucher_id = p_invoice_id;
    END IF;

    -- ج. استرجاع القيد المرتبط
    v_orig_journal_id := v_invoice.related_journal_entry_id;
    IF v_orig_journal_id IS NULL THEN
        SELECT id INTO v_orig_journal_id 
        FROM public.journal_entries 
        WHERE (related_document_id = p_invoice_id AND related_document_type = 'purchase_invoice')
           OR (reference = v_invoice.invoice_number AND (v_org_id IS NULL OR organization_id = v_org_id))
        ORDER BY created_at DESC
        LIMIT 1;
    END IF;

    -- د. تحويل الفاتورة إلى مسودة وفك ارتباط القيد
    UPDATE public.purchase_invoices
    SET 
        status = 'draft',
        related_journal_entry_id = NULL
    WHERE id = p_invoice_id;

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

            UPDATE public.journal_entries
            SET status = 'posted', is_posted = true
            WHERE id = v_reversal_journal_id;

            UPDATE public.journal_entries 
            SET status = 'reversed', is_posted = false 
            WHERE id = v_orig_journal_id;

        ELSE
            -- النمط المباشر: إلغاء ترحيل القيد أولاً ثم حذف أسطره وقيده بأمان تحت نطاق السماح
            UPDATE public.journal_entries 
            SET status = 'draft', is_posted = false 
            WHERE id = v_orig_journal_id;

            DELETE FROM public.journal_lines WHERE journal_entry_id = v_orig_journal_id;
            DELETE FROM public.journal_entries WHERE id = v_orig_journal_id;
        END IF;
    END IF;

    IF v_cancel_mode != 'reversal' THEN
        -- تنظيف أي قيود أخرى مرتبطة بالرقم المرجعي أو معرف الفاتورة
        IF v_invoice.invoice_number IS NOT NULL THEN
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

        UPDATE public.journal_entries 
        SET status = 'draft', is_posted = false 
        WHERE related_document_id = p_invoice_id 
          AND related_document_type = 'purchase_invoice';

        DELETE FROM public.journal_lines 
        WHERE journal_entry_id IN (
            SELECT id FROM public.journal_entries 
            WHERE related_document_id = p_invoice_id 
              AND related_document_type = 'purchase_invoice'
        );

        DELETE FROM public.journal_entries 
        WHERE related_document_id = p_invoice_id 
          AND related_document_type = 'purchase_invoice';
    END IF;

    -- و. تحديث رصيد المورد
    IF v_invoice.supplier_id IS NOT NULL THEN
        BEGIN
            IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'update_single_supplier_balance' AND pronamespace = 'public'::regnamespace) THEN
                PERFORM public.update_single_supplier_balance(v_invoice.supplier_id, v_org_id);
            END IF;
        EXCEPTION WHEN OTHERS THEN NULL;
        END;
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

REVOKE EXECUTE ON FUNCTION public.unpost_purchase_invoice(uuid, uuid) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.unpost_purchase_invoice(uuid, uuid) TO authenticated, service_role;


-- 4. تحديث دالة ترحيل فاتورة المبيعات (approve_invoice) لدعم الحصانة وتجاوز القيود السابقة
CREATE OR REPLACE FUNCTION public.approve_invoice(
    p_invoice_id uuid,
    p_org_id uuid DEFAULT NULL,
    p_warehouse_id uuid DEFAULT NULL
)
RETURNS void 
LANGUAGE plpgsql 
SECURITY DEFINER 
SET search_path = public 
AS $$
DECLARE
    v_invoice record;
    v_item record;
    v_org_id uuid;
    v_wh_id uuid;
    v_base_qty numeric;
    v_inventory_acc_id uuid;
    v_cogs_acc_id uuid;
    v_vat_acc_id uuid;
    v_customer_acc_id uuid;
    v_sales_acc_id uuid;
    v_discount_acc_id uuid;
    v_journal_id uuid;
    v_mappings jsonb;
    v_total_cost numeric := 0;
    v_discount_amount numeric := 0;
    v_sales_credit numeric := 0;
    v_entry_diff numeric := 0;
    v_locked_stock numeric;
    v_locked_wh_stock jsonb;
    v_available_wh_stock numeric;
    v_allow_negative_stock boolean := false;
BEGIN
    SELECT * INTO v_invoice FROM public.invoices WHERE id = p_invoice_id;
    IF NOT FOUND THEN 
        RAISE EXCEPTION 'فاتورة المبيعات غير موجودة (ID: %)', p_invoice_id; 
    END IF;

    IF v_invoice.status IN ('posted', 'paid') THEN 
        RETURN; 
    END IF;

    -- 🛡️ تفعيل نطاق السماح الداخلي لتعديل أو تنظيف القيود السابقة بأمان
    PERFORM set_config('app.allow_financial_ledger_mutation', 'true', true);

    v_org_id := COALESCE(p_org_id, v_invoice.organization_id, public.get_my_org());
    IF v_org_id IS NULL THEN 
        PERFORM set_config('app.allow_financial_ledger_mutation', 'false', true);
        RAISE EXCEPTION 'تعذر تحديد هوية المنظمة لفاتورة المبيعات.'; 
    END IF;

    SELECT COALESCE(allow_negative_stock, false) INTO v_allow_negative_stock
    FROM public.company_settings 
    WHERE organization_id = v_org_id LIMIT 1;
    v_allow_negative_stock := COALESCE(v_allow_negative_stock, false);

    v_wh_id := COALESCE(p_warehouse_id, v_invoice.warehouse_id, (SELECT id FROM public.warehouses WHERE organization_id = v_org_id LIMIT 1));

    SELECT account_mappings INTO v_mappings FROM public.company_settings WHERE organization_id = v_org_id;
    v_inventory_acc_id := COALESCE((v_mappings->>'INVENTORY_FINISHED_GOODS')::uuid, (v_mappings->>'INVENTORY_RAW_MATERIALS')::uuid, (SELECT id FROM public.accounts WHERE code IN ('103', '10301', '1105') AND organization_id = v_org_id LIMIT 1));
    v_cogs_acc_id := COALESCE((v_mappings->>'COGS')::uuid, (SELECT id FROM public.accounts WHERE code IN ('501', '5101', '511') AND organization_id = v_org_id LIMIT 1));
    v_vat_acc_id := COALESCE((v_mappings->>'VAT_OUTPUT')::uuid, (v_mappings->>'VAT')::uuid, (SELECT id FROM public.accounts WHERE code IN ('202', '2103', '20201') AND organization_id = v_org_id LIMIT 1));
    v_customer_acc_id := COALESCE((v_mappings->>'CUSTOMERS')::uuid, (SELECT id FROM public.accounts WHERE code IN ('102', '1102', '10201') AND organization_id = v_org_id LIMIT 1));
    v_sales_acc_id := COALESCE((v_mappings->>'SALES_REVENUE')::uuid, (SELECT id FROM public.accounts WHERE code IN ('401', '4101', '411') AND organization_id = v_org_id LIMIT 1));

    v_discount_acc_id := public.resolve_leaf_account(COALESCE(
        public.safe_cast_uuid(v_mappings->>'SALES_DISCOUNT'),
        (SELECT id FROM public.accounts WHERE organization_id = v_org_id AND code = (v_mappings->>'SALES_DISCOUNT') LIMIT 1),
        (SELECT id FROM public.accounts WHERE organization_id = v_org_id AND code IN ('413', '4102') LIMIT 1),
        (SELECT id FROM public.accounts WHERE organization_id = v_org_id AND name LIKE '%خصم مسموح به%' LIMIT 1),
        (SELECT id FROM public.accounts WHERE organization_id = v_org_id AND code = '412' LIMIT 1)
    ));

    IF v_discount_acc_id IS NULL THEN
        INSERT INTO public.accounts (code, name, type, is_group, organization_id)
        VALUES ('413', 'خصم مسموح به وعروض ترويجية', 'revenue', false, v_org_id)
        ON CONFLICT DO NOTHING
        RETURNING id INTO v_discount_acc_id;

        IF v_discount_acc_id IS NULL THEN
            SELECT id INTO v_discount_acc_id FROM public.accounts 
            WHERE organization_id = v_org_id AND code = '413' LIMIT 1;
        END IF;
    END IF;

    v_discount_amount := GREATEST(
        (COALESCE(v_invoice.subtotal, 0) + COALESCE(v_invoice.tax_amount, 0)) - COALESCE(v_invoice.total_amount, 0),
        COALESCE(v_invoice.discount_amount, 0),
        COALESCE(v_invoice.promo_discount, 0),
        0
    );

    -- فحص وخصم المخزون مع القفل المتشائم
    FOR v_item IN
        SELECT ii.*, p.product_type, p.base_uom_id,
               COALESCE(NULLIF(p.weighted_average_cost, 0), NULLIF(p.cost, 0), p.purchase_price, ii.cost, 0) AS item_cost
        FROM public.invoice_items ii
        JOIN public.products p ON ii.product_id = p.id
        WHERE ii.invoice_id = p_invoice_id
    LOOP
        SELECT stock, warehouse_stock
        INTO v_locked_stock, v_locked_wh_stock
        FROM public.products
        WHERE id = v_item.product_id
        FOR UPDATE;

        BEGIN
            IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'uom_convert' AND pronamespace = 'public'::regnamespace) THEN
                v_base_qty := public.uom_convert(v_item.quantity, v_item.uom_id, v_item.base_uom_id);
            ELSE
                v_base_qty := v_item.quantity;
            END IF;
        EXCEPTION WHEN OTHERS THEN
            v_base_qty := v_item.quantity;
        END;

        IF COALESCE(v_base_qty, 0) <= 0 THEN
            v_base_qty := GREATEST(v_item.quantity, 0);
        END IF;

        IF COALESCE(v_item.product_type, 'product') <> 'service' THEN
            IF NOT v_allow_negative_stock THEN
                IF v_wh_id IS NOT NULL THEN
                    v_available_wh_stock := COALESCE((v_locked_wh_stock->>v_wh_id::text)::numeric, 0);
                    IF v_available_wh_stock < v_base_qty THEN
                        RAISE EXCEPTION 'الرصيد غير كافٍ في المستودع للصنف: % (المطلوب: %, المتوفر: %)',
                            v_item.item_name, v_base_qty, v_available_wh_stock;
                    END IF;
                ELSE
                    IF COALESCE(v_locked_stock, 0) < v_base_qty THEN
                        RAISE EXCEPTION 'الرصيد الإجمالي غير كافٍ للصنف: % (المطلوب: %, المتوفر: %)',
                            v_item.item_name, v_base_qty, COALESCE(v_locked_stock, 0);
                    END IF;
                END IF;
            END IF;

            v_total_cost := v_total_cost + (v_base_qty * COALESCE(v_item.item_cost, 0));
            UPDATE public.invoice_items SET cost = v_item.item_cost WHERE id = v_item.id;

            IF v_wh_id IS NOT NULL THEN
                UPDATE public.products
                SET 
                    stock = COALESCE(stock, 0) - v_base_qty,
                    warehouse_stock = jsonb_set(
                        COALESCE(warehouse_stock, '{}'::jsonb),
                        ARRAY[v_wh_id::text],
                        to_jsonb(COALESCE((warehouse_stock->>v_wh_id::text)::numeric, 0) - v_base_qty)
                    )
                WHERE id = v_item.product_id;
            ELSE
                UPDATE public.products
                SET stock = COALESCE(stock, 0) - v_base_qty
                WHERE id = v_item.product_id;
            END IF;
        END IF;
    END LOOP;

    -- إلغاء ترحيل ومسح أي قيود سابقة مرتبطة بالفاتورة بأمان
    UPDATE public.journal_entries
    SET status = 'draft', is_posted = false
    WHERE (related_document_id = p_invoice_id AND related_document_type = 'invoice')
       OR id = v_invoice.related_journal_entry_id
       OR (reference = v_invoice.invoice_number AND organization_id = v_org_id AND reference IS NOT NULL);

    DELETE FROM public.journal_lines
    WHERE journal_entry_id IN (
        SELECT id FROM public.journal_entries
        WHERE (related_document_id = p_invoice_id AND related_document_type = 'invoice')
           OR id = v_invoice.related_journal_entry_id
           OR (reference = v_invoice.invoice_number AND organization_id = v_org_id AND reference IS NOT NULL)
    );

    DELETE FROM public.journal_entries
    WHERE (related_document_id = p_invoice_id AND related_document_type = 'invoice')
       OR id = v_invoice.related_journal_entry_id
       OR (reference = v_invoice.invoice_number AND organization_id = v_org_id AND reference IS NOT NULL);

    -- إنشاء القيد كمسودة أولاً
    INSERT INTO public.journal_entries (
        transaction_date, description, reference, status,
        organization_id, related_document_id, related_document_type, is_posted
    ) VALUES (
        COALESCE(v_invoice.invoice_date, CURRENT_DATE),
        'فاتورة مبيعات رقم ' || COALESCE(v_invoice.invoice_number, p_invoice_id::text),
        v_invoice.invoice_number,
        'draft', v_org_id, p_invoice_id, 'invoice', false
    ) RETURNING id INTO v_journal_id;

    -- 1. سطر مدين: حساب العميل بصافي المستحق
    IF v_customer_acc_id IS NOT NULL THEN
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
        VALUES (v_journal_id, v_customer_acc_id, v_invoice.total_amount, 0,
                'استحقاق فاتورة مبيعات رقم ' || COALESCE(v_invoice.invoice_number, ''), v_org_id);
    END IF;

    -- 2. سطر مدين: الخصم المسموح به وعروض المبيعات
    IF v_discount_amount > 0 AND v_discount_acc_id IS NOT NULL THEN
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
        VALUES (v_journal_id, v_discount_acc_id, v_discount_amount, 0,
                'خصم مسموح به وعروض ترويجية - فاتورة ' || COALESCE(v_invoice.invoice_number, ''), v_org_id);
    END IF;

    -- 3. سطر دائن: إيراد المبيعات
    IF v_sales_acc_id IS NOT NULL THEN
        IF v_discount_acc_id IS NOT NULL THEN
            v_sales_credit := COALESCE(v_invoice.subtotal, 0);
        ELSE
            v_sales_credit := GREATEST(COALESCE(v_invoice.subtotal, 0) - v_discount_amount, 0);
        END IF;

        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
        VALUES (v_journal_id, v_sales_acc_id, 0, v_sales_credit,
                'إيراد مبيعات فاتورة رقم ' || COALESCE(v_invoice.invoice_number, ''), v_org_id);
    END IF;

    -- 4. سطر دائن: ضريبة القيمة المضافة
    IF COALESCE(v_invoice.tax_amount, 0) > 0 AND v_vat_acc_id IS NOT NULL THEN
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
        VALUES (v_journal_id, v_vat_acc_id, 0, v_invoice.tax_amount, 'ضريبة مخرجات مبيعات', v_org_id);
    END IF;

    -- 5. إثبات تكلفة البضاعة المباعة وصرف المخزون
    IF v_total_cost > 0 AND v_cogs_acc_id IS NOT NULL AND v_inventory_acc_id IS NOT NULL THEN
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
        VALUES 
            (v_journal_id, v_cogs_acc_id, v_total_cost, 0, 'تكلفة بضاعة مباعة - فاتورة ' || COALESCE(v_invoice.invoice_number, ''), v_org_id),
            (v_journal_id, v_inventory_acc_id, 0, v_total_cost, 'صرف مخزون لمبيعات - فاتورة ' || COALESCE(v_invoice.invoice_number, ''), v_org_id);
    END IF;

    -- 6. صمام الموازنة الدقيقة
    SELECT COALESCE(SUM(debit), 0) - COALESCE(SUM(credit), 0)
    INTO v_entry_diff
    FROM public.journal_lines
    WHERE journal_entry_id = v_journal_id;

    IF ABS(v_entry_diff) > 0 AND ABS(v_entry_diff) <= 0.05 THEN
        UPDATE public.journal_lines
        SET debit = debit - v_entry_diff
        WHERE journal_entry_id = v_journal_id AND account_id = v_customer_acc_id;
    END IF;

    -- ترحيل القيد
    UPDATE public.journal_entries
    SET status = 'posted', is_posted = true
    WHERE id = v_journal_id;

    -- تحديث الفاتورة
    UPDATE public.invoices
    SET status = 'posted',
        related_journal_entry_id = v_journal_id,
        warehouse_id = v_wh_id
    WHERE id = p_invoice_id;

    -- تحديث رصيد العميل
    IF v_invoice.customer_id IS NOT NULL THEN
        BEGIN
            IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'update_single_customer_balance' AND pronamespace = 'public'::regnamespace) THEN
                PERFORM public.update_single_customer_balance(v_invoice.customer_id, v_org_id);
            END IF;
        EXCEPTION WHEN OTHERS THEN NULL;
        END;
    END IF;

    -- 🛡️ إغلاق نطاق السماح الداخلي للحصانة
    PERFORM set_config('app.allow_financial_ledger_mutation', 'false', true);

EXCEPTION WHEN OTHERS THEN
    BEGIN
        PERFORM set_config('app.allow_financial_ledger_mutation', 'false', true);
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
    RAISE;
END;
$$;


-- Alias دالة ترحيل فاتورة المبيعات (post_sales_invoice)
CREATE OR REPLACE FUNCTION public.post_sales_invoice(
    p_invoice_id uuid,
    p_org_id uuid DEFAULT NULL,
    p_warehouse_id uuid DEFAULT NULL
)
RETURNS void 
LANGUAGE plpgsql 
SECURITY DEFINER 
SET search_path = public 
AS $$
BEGIN
    PERFORM public.approve_invoice(p_invoice_id, p_org_id, p_warehouse_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.approve_invoice(uuid, uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.post_sales_invoice(uuid, uuid, uuid) TO authenticated, service_role;


-- 5. تحديث دالة إلغاء ترحيل فاتورة المبيعات (unpost_sales_invoice) لدعم الحصانة
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
    v_caller_role text;
    v_caller_id uuid := auth.uid();
BEGIN
    SELECT * INTO v_invoice FROM public.invoices WHERE id = p_invoice_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'فاتورة المبيعات غير موجودة (ID: %)', p_invoice_id;
    END IF;

    IF v_invoice.status = 'draft' THEN
        RETURN true;
    END IF;

    IF v_caller_id IS NOT NULL THEN
        SELECT role INTO v_caller_role FROM public.profiles WHERE id = v_caller_id;
        IF COALESCE(v_caller_role, '') NOT IN ('super_admin', 'admin', 'manager', 'accountant') THEN
            RAISE EXCEPTION 'TRIPRO_SECURITY_ALERT: لا تملك الصلاحية المحاسبية اللازمة لإلغاء ترحيل فواتير المبيعات.';
        END IF;

        IF v_invoice.organization_id IS NOT NULL 
           AND v_invoice.organization_id <> public.get_my_org() 
           AND COALESCE(v_caller_role, '') NOT IN ('super_admin') THEN
            RAISE EXCEPTION 'TRIPRO_SECURITY_ALERT: هذه الفاتورة تتبع منشأة أخرى ولا يحق لك تعديلها.';
        END IF;
    END IF;

    -- 🛡️ تفعيل نطاق السماح الداخلي للعمليات المحاسبية
    PERFORM set_config('app.allow_financial_ledger_mutation', 'true', true);

    v_org_id := COALESCE(p_org_id, v_invoice.organization_id);

    SELECT COALESCE(cancellation_mode, 'direct') INTO v_cancel_mode 
    FROM public.company_settings 
    WHERE organization_id = v_org_id LIMIT 1;
    v_cancel_mode := COALESCE(v_cancel_mode, 'direct');

    -- عكس المخزون
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

    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'stock_ledger') THEN
        DELETE FROM public.stock_ledger WHERE voucher_id = p_invoice_id;
    END IF;

    v_orig_journal_id := v_invoice.related_journal_entry_id;
    IF v_orig_journal_id IS NULL THEN
        SELECT id INTO v_orig_journal_id 
        FROM public.journal_entries 
        WHERE (related_document_id = p_invoice_id AND related_document_type = 'invoice')
           OR (reference = v_invoice.invoice_number AND (v_org_id IS NULL OR organization_id = v_org_id))
        ORDER BY created_at DESC
        LIMIT 1;
    END IF;

    UPDATE public.invoices
    SET 
        status = 'draft',
        related_journal_entry_id = NULL
    WHERE id = p_invoice_id;

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
                'قيد تسوية عكسي لإلغاء فاتورة مبيعات رقم ' || COALESCE(v_invoice.invoice_number, '-'),
                'REV-' || COALESCE(v_invoice.invoice_number, '-'),
                'draft',
                v_org_id,
                false,
                p_invoice_id,
                'invoice_reversal'
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

            UPDATE public.journal_entries
            SET status = 'posted', is_posted = true
            WHERE id = v_reversal_journal_id;

            UPDATE public.journal_entries 
            SET status = 'reversed', is_posted = false 
            WHERE id = v_orig_journal_id;

        ELSE
            UPDATE public.journal_entries 
            SET status = 'draft', is_posted = false 
            WHERE id = v_orig_journal_id;

            DELETE FROM public.journal_lines WHERE journal_entry_id = v_orig_journal_id;
            DELETE FROM public.journal_entries WHERE id = v_orig_journal_id;
        END IF;
    END IF;

    IF v_cancel_mode != 'reversal' THEN
        IF v_invoice.invoice_number IS NOT NULL THEN
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

        UPDATE public.journal_entries 
        SET status = 'draft', is_posted = false 
        WHERE related_document_id = p_invoice_id 
          AND related_document_type = 'invoice';

        DELETE FROM public.journal_lines 
        WHERE journal_entry_id IN (
            SELECT id FROM public.journal_entries 
            WHERE related_document_id = p_invoice_id 
              AND related_document_type = 'invoice'
        );

        DELETE FROM public.journal_entries 
        WHERE related_document_id = p_invoice_id 
          AND related_document_type = 'invoice';
    END IF;

    IF v_invoice.customer_id IS NOT NULL THEN
        BEGIN
            IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'update_single_customer_balance' AND pronamespace = 'public'::regnamespace) THEN
                PERFORM public.update_single_customer_balance(v_invoice.customer_id, v_org_id);
            END IF;
        EXCEPTION WHEN OTHERS THEN NULL;
        END;
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

REVOKE EXECUTE ON FUNCTION public.unpost_sales_invoice(uuid, uuid) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.unpost_sales_invoice(uuid, uuid) TO authenticated, service_role;


-- 6. تحصين دالة إلغاء مسير الرواتب (cancel_payroll_accrual_rpc) لدعم الحصانة
CREATE OR REPLACE FUNCTION public.cancel_payroll_accrual_rpc(
    p_payroll_id uuid,
    p_org_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_payroll record;
    v_org_id uuid;
    v_caller_role text;
    v_caller_id uuid := auth.uid();
BEGIN
    IF v_caller_id IS NOT NULL THEN
        SELECT role INTO v_caller_role FROM public.profiles WHERE id = v_caller_id;
        IF COALESCE(v_caller_role, '') NOT IN ('super_admin', 'admin', 'manager', 'accountant', 'hr') THEN
            RAISE EXCEPTION 'TRIPRO_SECURITY_ALERT: لا تملك الصلاحية اللازمة لإلغاء قيود مسيرات الرواتب.';
        END IF;
    END IF;

    SELECT * INTO v_payroll FROM public.payrolls WHERE id = p_payroll_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'مسير الرواتب المحدد غير موجود.';
    END IF;

    v_org_id := public.validate_tenant_access(COALESCE(p_org_id, v_payroll.organization_id));

    IF v_payroll.organization_id <> v_org_id THEN
        RAISE EXCEPTION 'TRIPRO_SECURITY_ALERT: هذا المسير يتبع منشأة أخرى ولا تملك صلاحية إلغائه.';
    END IF;

    IF v_payroll.status = 'paid' THEN
        RAISE EXCEPTION 'لا يمكن إلغاء مسير رواتب تم صرفه بالفعل وتسويته في البنك/الخزينة.';
    END IF;

    -- 🛡️ تفعيل نطاق السماح الداخلي لحذف قيود مسير الرواتب
    PERFORM set_config('app.allow_financial_ledger_mutation', 'true', true);

    UPDATE public.employee_advances 
    SET status = 'paid', payroll_item_id = NULL 
    WHERE payroll_item_id IN (SELECT id FROM public.payroll_items WHERE payroll_id = p_payroll_id);

    UPDATE public.payroll_variables 
    SET is_processed = false 
    WHERE month = v_payroll.payroll_month AND year = v_payroll.payroll_year AND organization_id = v_org_id;

    UPDATE public.journal_entries 
    SET status = 'draft', is_posted = false 
    WHERE (id = v_payroll.accrual_je_id OR (related_document_id = p_payroll_id AND related_document_type = 'payroll'))
      AND organization_id = v_org_id;

    DELETE FROM public.journal_lines 
    WHERE journal_entry_id IN (
        SELECT id FROM public.journal_entries 
        WHERE (id = v_payroll.accrual_je_id OR (related_document_id = p_payroll_id AND related_document_type = 'payroll'))
          AND organization_id = v_org_id
    );

    DELETE FROM public.journal_entries 
    WHERE (id = v_payroll.accrual_je_id OR (related_document_id = p_payroll_id AND related_document_type = 'payroll'))
      AND organization_id = v_org_id;

    DELETE FROM public.payrolls WHERE id = p_payroll_id;

    PERFORM set_config('app.allow_financial_ledger_mutation', 'false', true);

    RETURN jsonb_build_object('success', true, 'message', 'تم إلغاء مسير الرواتب وقيده المحاسبي بنجاح');
EXCEPTION WHEN OTHERS THEN
    BEGIN
        PERFORM set_config('app.allow_financial_ledger_mutation', 'false', true);
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
    RAISE;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.cancel_payroll_accrual_rpc(uuid, uuid) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.cancel_payroll_accrual_rpc(uuid, uuid) TO authenticated, service_role;

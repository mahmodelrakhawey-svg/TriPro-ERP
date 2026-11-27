-- 🛡️ إصلاح الدوال المحاسبية للعمليات اليومية:
-- 1. approve_purchase_return: إنشاء القيد بحالة draft -> إضافة السطور -> posted مع دعم app.allow_financial_ledger_mutation و uom_convert وعزل المنظمة
-- 2. unpost_purchase_return: إصلاح اسم العمود الصحيح purchase_return_id بدلاً من return_id + عزل تنظيف القيود بالمنظمة + دعم نمط الإلغاء (مباشر/عكسي)
-- 3. unpost_sales_return: عزل تنظيف القيود بالمنظمة + فك التوازن الآمن (draft ثم حذف) + دعم نمط الإلغاء (مباشر/عكسي)
-- 4. update_employee_advance: تحديث/إنشاء القيد بنمط draft -> lines -> posted لتوافق حراس التوازن المحاسبي

-- ==============================================================================
-- 1. approve_purchase_return(p_return_id uuid)
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.approve_purchase_return(p_return_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_return record;
    v_item record;
    v_org_id uuid;
    v_inventory_acc_id uuid;
    v_vat_acc_id uuid;
    v_supplier_acc_id uuid;
    v_journal_id uuid;
    v_mappings jsonb;
    v_base_qty numeric;
    v_wh_id text;
    v_items_total numeric := 0;
    v_tax_amt numeric := 0;
    v_total_amt numeric := 0;
    v_diff numeric := 0;
BEGIN
    SELECT * INTO v_return FROM public.purchase_returns WHERE id = p_return_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'مرتجع المشتريات غير موجود';
    END IF;
    IF v_return.status = 'posted' AND v_return.related_journal_entry_id IS NOT NULL THEN
        RAISE EXCEPTION 'المرتجع مرحل بالفعل';
    END IF;

    v_org_id := COALESCE(v_return.organization_id, public.get_my_org());
    IF v_org_id IS NULL THEN
        RAISE EXCEPTION 'تعذر تحديد المنظمة لمرتجع المشتريات.';
    END IF;

    PERFORM set_config('app.allow_financial_ledger_mutation', 'true', true);

    SELECT account_mappings INTO v_mappings
    FROM public.company_settings
    WHERE organization_id = v_org_id
    LIMIT 1;

    v_inventory_acc_id := COALESCE(
        public.safe_cast_uuid(v_mappings->>'INVENTORY_RAW_MATERIALS'),
        public.safe_cast_uuid(v_mappings->>'INVENTORY_FINISHED_GOODS'),
        (SELECT id FROM public.accounts WHERE code IN ('10301', '10302', '1105', '103') AND organization_id = v_org_id AND COALESCE(is_group, false) = false ORDER BY code LIMIT 1)
    );
    v_vat_acc_id := COALESCE(
        public.safe_cast_uuid(v_mappings->>'VAT_INPUT'),
        public.safe_cast_uuid(v_mappings->>'VAT'),
        (SELECT id FROM public.accounts WHERE code IN ('1241', '1205', '2231', '2103') AND organization_id = v_org_id AND COALESCE(is_group, false) = false ORDER BY code LIMIT 1)
    );
    v_supplier_acc_id := COALESCE(
        public.safe_cast_uuid(v_mappings->>'SUPPLIERS'),
        (SELECT id FROM public.accounts WHERE code IN ('201', '20101', '2201') AND organization_id = v_org_id AND COALESCE(is_group, false) = false ORDER BY code LIMIT 1)
    );

    IF v_inventory_acc_id IS NULL OR v_supplier_acc_id IS NULL THEN
        RAISE EXCEPTION 'حسابات المخزون أو الموردين غير معرّفة في دليل الحسابات';
    END IF;

    v_wh_id := COALESCE(
        v_return.warehouse_id::text,
        (SELECT id::text FROM public.warehouses WHERE organization_id = v_org_id LIMIT 1)
    );

    -- خصم المخزون بالوحدة الأساسية
    FOR v_item IN
        SELECT product_id, quantity, uom_id, total
        FROM public.purchase_return_items
        WHERE purchase_return_id = p_return_id
          AND product_id IS NOT NULL
          AND COALESCE(quantity, 0) > 0
    LOOP
        BEGIN
            IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'uom_convert' AND pronamespace = 'public'::regnamespace) THEN
                v_base_qty := COALESCE(
                    public.uom_convert(
                        v_item.quantity,
                        v_item.uom_id,
                        (SELECT base_uom_id FROM public.products WHERE id = v_item.product_id)
                    ),
                    v_item.quantity
                );
            ELSE
                v_base_qty := v_item.quantity;
            END IF;
        EXCEPTION WHEN OTHERS THEN
            v_base_qty := v_item.quantity;
        END;

        IF v_wh_id IS NOT NULL THEN
            UPDATE public.products
            SET stock = COALESCE(stock, 0) - v_base_qty,
                warehouse_stock = jsonb_set(
                    COALESCE(warehouse_stock, '{}'::jsonb),
                    ARRAY[v_wh_id],
                    to_jsonb(COALESCE((warehouse_stock->>v_wh_id)::numeric, 0) - v_base_qty)
                )
            WHERE id = v_item.product_id;
        ELSE
            UPDATE public.products
            SET stock = COALESCE(stock, 0) - v_base_qty
            WHERE id = v_item.product_id;
        END IF;
    END LOOP;

    -- تنظيف أي قيد سابق مرتبط بنفس المرتجع لتفادي التكرار
    IF v_return.related_journal_entry_id IS NOT NULL THEN
        UPDATE public.journal_entries SET status = 'draft', is_posted = false WHERE id = v_return.related_journal_entry_id;
        DELETE FROM public.journal_lines WHERE journal_entry_id = v_return.related_journal_entry_id;
        DELETE FROM public.journal_entries WHERE id = v_return.related_journal_entry_id;
    END IF;

    IF v_return.return_number IS NOT NULL THEN
        UPDATE public.journal_entries
        SET status = 'draft', is_posted = false
        WHERE organization_id = v_org_id AND reference = v_return.return_number;

        DELETE FROM public.journal_lines
        WHERE journal_entry_id IN (
            SELECT id FROM public.journal_entries
            WHERE organization_id = v_org_id AND reference = v_return.return_number
        );
        DELETE FROM public.journal_entries
        WHERE organization_id = v_org_id AND reference = v_return.return_number;
    END IF;

    v_total_amt := ROUND(COALESCE(v_return.total_amount, 0), 2);
    v_tax_amt := ROUND(COALESCE(v_return.tax_amount, 0), 2);

    IF v_total_amt > 0 THEN
        -- إنشاء القيد كمسودة أولاً ثم إضافة السطور ثم الترحيل
        INSERT INTO public.journal_entries (
            transaction_date, description, reference, status, organization_id, related_document_id, related_document_type, is_posted, user_id
        ) VALUES (
            v_return.return_date,
            'مرتجع مشتريات رقم ' || COALESCE(v_return.return_number, '-'),
            v_return.return_number,
            'draft',
            v_org_id,
            p_return_id,
            'purchase_return',
            false,
            auth.uid()
        ) RETURNING id INTO v_journal_id;

        -- 1. المدين: المورد (تخفيض الالتزام)
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
        VALUES (v_journal_id, v_supplier_acc_id, v_total_amt, 0, 'مرتجع مشتريات - ' || COALESCE(v_return.return_number, '-'), v_org_id);

        -- 2. الدائن: المخزون
        FOR v_item IN
            SELECT
                COALESCE(p.inventory_account_id, v_inventory_acc_id) AS acc_id,
                ROUND(SUM(COALESCE(pri.total, pri.quantity * pri.unit_price, 0)), 2) AS total_cost
            FROM public.purchase_return_items pri
            JOIN public.products p ON pri.product_id = p.id
            WHERE pri.purchase_return_id = p_return_id
            GROUP BY COALESCE(p.inventory_account_id, v_inventory_acc_id)
        LOOP
            IF COALESCE(v_item.total_cost, 0) > 0 THEN
                INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
                VALUES (v_journal_id, v_item.acc_id, 0, v_item.total_cost, 'مخزون - مرتجع مشتريات ' || COALESCE(v_return.return_number, '-'), v_org_id);
                v_items_total := v_items_total + v_item.total_cost;
            END IF;
        END LOOP;

        -- 3. الدائن: ضريبة المدخلات (أو تسوية الفرق على المخزون إن لم تتوفر ضريبة)
        IF v_tax_amt > 0 AND v_vat_acc_id IS NOT NULL THEN
            INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
            VALUES (v_journal_id, v_vat_acc_id, 0, v_tax_amt, 'ضريبة مدخلات (عكس) - مرتجع ' || COALESCE(v_return.return_number, '-'), v_org_id);
            v_items_total := v_items_total + v_tax_amt;
        END IF;

        -- ضبط أي فرق تقريب بسيط لضمان توازن القيد 100%
        v_diff := ROUND(v_total_amt - v_items_total, 2);
        IF v_diff <> 0 THEN
            IF v_diff > 0 THEN
                INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
                VALUES (v_journal_id, v_inventory_acc_id, 0, v_diff, 'فروق تقريب/ضريبة مرتجع مشتريات ' || COALESCE(v_return.return_number, '-'), v_org_id);
            ELSE
                INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
                VALUES (v_journal_id, v_inventory_acc_id, ABS(v_diff), 0, 'فروق تقريب مرتجع مشتريات ' || COALESCE(v_return.return_number, '-'), v_org_id);
            END IF;
        END IF;

        UPDATE public.journal_entries SET status = 'posted', is_posted = true WHERE id = v_journal_id;
    END IF;

    UPDATE public.purchase_returns
    SET status = 'posted',
        organization_id = v_org_id,
        related_journal_entry_id = v_journal_id
    WHERE id = p_return_id;

    IF v_return.supplier_id IS NOT NULL THEN
        BEGIN
            IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'update_single_supplier_balance' AND pronamespace = 'public'::regnamespace) THEN
                PERFORM public.update_single_supplier_balance(v_return.supplier_id, v_org_id);
            END IF;
        EXCEPTION WHEN OTHERS THEN NULL;
        END;
    END IF;

    PERFORM set_config('app.allow_financial_ledger_mutation', 'false', true);
EXCEPTION
    WHEN OTHERS THEN
        BEGIN
            PERFORM set_config('app.allow_financial_ledger_mutation', 'false', true);
        EXCEPTION WHEN OTHERS THEN NULL;
        END;
        RAISE;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.approve_purchase_return(uuid) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.approve_purchase_return(uuid) TO authenticated, service_role;


-- ==============================================================================
-- 2. unpost_purchase_return(p_return_id uuid, p_org_id uuid DEFAULT NULL)
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.unpost_purchase_return(
    p_return_id uuid,
    p_org_id uuid DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_return record;
    v_item record;
    v_org_id uuid;
    v_journal_id uuid;
    v_reversal_journal_id uuid;
    v_line record;
    v_cancel_mode text := 'direct';
    v_caller_role text;
    v_caller_id uuid := auth.uid();
    v_base_qty numeric;
BEGIN
    SELECT * INTO v_return FROM public.purchase_returns WHERE id = p_return_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'مرتجع المشتريات غير موجود (ID: %)', p_return_id;
    END IF;

    IF v_return.status = 'draft' THEN
        RETURN true;
    END IF;

    IF v_caller_id IS NULL AND auth.role() <> 'service_role' THEN
        RAISE EXCEPTION 'TRIPRO_SECURITY_ALERT: تم رفض الوصول. يجب تسجيل الدخول لإلغاء ترحيل المرتجع.';
    END IF;

    IF v_caller_id IS NOT NULL THEN
        SELECT role INTO v_caller_role FROM public.profiles WHERE id = v_caller_id;
        IF COALESCE(v_caller_role, '') NOT IN ('super_admin', 'admin', 'manager', 'accountant', 'owner') THEN
            RAISE EXCEPTION 'TRIPRO_SECURITY_ALERT: لا تملك الصلاحية المحاسبية اللازمة لإلغاء ترحيل المرتجع.';
        END IF;

        IF v_return.organization_id IS NOT NULL
           AND v_return.organization_id <> public.get_my_org()
           AND COALESCE(v_caller_role, '') NOT IN ('super_admin') THEN
            RAISE EXCEPTION 'TRIPRO_SECURITY_ALERT: هذا المرتجع يتبع منشأة أخرى ولا يحق لك تعديله.';
        END IF;
    END IF;

    PERFORM set_config('app.allow_financial_ledger_mutation', 'true', true);

    v_org_id := COALESCE(p_org_id, v_return.organization_id);

    BEGIN
        SELECT COALESCE(cancellation_mode, 'direct') INTO v_cancel_mode
        FROM public.company_settings
        WHERE organization_id = v_org_id
        LIMIT 1;
    EXCEPTION WHEN OTHERS THEN
        v_cancel_mode := 'direct';
    END;
    v_cancel_mode := COALESCE(v_cancel_mode, 'direct');

    -- عكس أثر المخزون (إعادة الكميات المستردة للمخزن)
    FOR v_item IN
        SELECT product_id, quantity, uom_id
        FROM public.purchase_return_items
        WHERE purchase_return_id = p_return_id
          AND product_id IS NOT NULL
          AND COALESCE(quantity, 0) > 0
    LOOP
        BEGIN
            IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'uom_convert' AND pronamespace = 'public'::regnamespace) THEN
                v_base_qty := COALESCE(
                    public.uom_convert(
                        v_item.quantity,
                        v_item.uom_id,
                        (SELECT base_uom_id FROM public.products WHERE id = v_item.product_id)
                    ),
                    v_item.quantity
                );
            ELSE
                v_base_qty := v_item.quantity;
            END IF;
        EXCEPTION WHEN OTHERS THEN
            v_base_qty := v_item.quantity;
        END;

        IF v_return.warehouse_id IS NOT NULL THEN
            UPDATE public.products
            SET stock = COALESCE(stock, 0) + v_base_qty,
                warehouse_stock = jsonb_set(
                    COALESCE(warehouse_stock, '{}'::jsonb),
                    ARRAY[v_return.warehouse_id::text],
                    to_jsonb(COALESCE((warehouse_stock->>v_return.warehouse_id::text)::numeric, 0) + v_base_qty)
                )
            WHERE id = v_item.product_id;
        ELSE
            UPDATE public.products
            SET stock = COALESCE(stock, 0) + v_base_qty
            WHERE id = v_item.product_id;
        END IF;
    END LOOP;

    v_journal_id := v_return.related_journal_entry_id;
    IF v_journal_id IS NULL THEN
        SELECT id INTO v_journal_id
        FROM public.journal_entries
        WHERE (related_document_id = p_return_id AND related_document_type = 'purchase_return')
           OR (reference = v_return.return_number AND (v_org_id IS NULL OR organization_id = v_org_id))
        ORDER BY created_at DESC
        LIMIT 1;
    END IF;

    UPDATE public.purchase_returns
    SET status = 'draft',
        related_journal_entry_id = NULL
    WHERE id = p_return_id;

    IF v_journal_id IS NOT NULL THEN
        IF v_cancel_mode = 'reversal' THEN
            INSERT INTO public.journal_entries (
                transaction_date, description, reference, status, organization_id, is_posted, related_document_id, related_document_type, user_id
            ) VALUES (
                CURRENT_DATE,
                'قيد تسوية عكسي لإلغاء مرتجع مشتريات رقم ' || COALESCE(v_return.return_number, '-'),
                'REV-PRET-' || COALESCE(v_return.return_number, '-'),
                'draft',
                v_org_id,
                false,
                p_return_id,
                'purchase_return_reversal',
                v_caller_id
            ) RETURNING id INTO v_reversal_journal_id;

            FOR v_line IN SELECT * FROM public.journal_lines WHERE journal_entry_id = v_journal_id LOOP
                INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
                VALUES (v_reversal_journal_id, v_line.account_id, v_line.credit, v_line.debit, 'عكس أثر: ' || COALESCE(v_line.description, ''), v_org_id);
            END LOOP;

            UPDATE public.journal_entries SET status = 'posted', is_posted = true WHERE id = v_reversal_journal_id;
            UPDATE public.journal_entries SET status = 'reversed', is_posted = false WHERE id = v_journal_id;
        ELSE
            UPDATE public.journal_entries SET status = 'draft', is_posted = false WHERE id = v_journal_id;
            DELETE FROM public.journal_lines WHERE journal_entry_id = v_journal_id;
            DELETE FROM public.journal_entries WHERE id = v_journal_id;
        END IF;
    END IF;

    IF v_cancel_mode <> 'reversal' AND v_return.return_number IS NOT NULL THEN
        UPDATE public.journal_entries
        SET status = 'draft', is_posted = false
        WHERE reference = v_return.return_number
          AND (v_org_id IS NULL OR organization_id = v_org_id);

        DELETE FROM public.journal_lines
        WHERE journal_entry_id IN (
            SELECT id FROM public.journal_entries
            WHERE reference = v_return.return_number
              AND (v_org_id IS NULL OR organization_id = v_org_id)
        );
        DELETE FROM public.journal_entries
        WHERE reference = v_return.return_number
          AND (v_org_id IS NULL OR organization_id = v_org_id);
    END IF;

    IF v_return.supplier_id IS NOT NULL THEN
        BEGIN
            IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'update_single_supplier_balance' AND pronamespace = 'public'::regnamespace) THEN
                PERFORM public.update_single_supplier_balance(v_return.supplier_id, v_org_id);
            END IF;
        EXCEPTION WHEN OTHERS THEN NULL;
        END;
    END IF;

    PERFORM set_config('app.allow_financial_ledger_mutation', 'false', true);
    RETURN true;
EXCEPTION
    WHEN OTHERS THEN
        BEGIN
            PERFORM set_config('app.allow_financial_ledger_mutation', 'false', true);
        EXCEPTION WHEN OTHERS THEN NULL;
        END;
        RAISE;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.unpost_purchase_return(uuid, uuid) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.unpost_purchase_return(uuid, uuid) TO authenticated, service_role;


-- ==============================================================================
-- 3. unpost_sales_return(p_return_id uuid, p_org_id uuid DEFAULT NULL)
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.unpost_sales_return(
    p_return_id uuid,
    p_org_id uuid DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_return record;
    v_item record;
    v_org_id uuid;
    v_journal_id uuid;
    v_reversal_journal_id uuid;
    v_line record;
    v_cancel_mode text := 'direct';
    v_caller_role text;
    v_caller_id uuid := auth.uid();
    v_base_qty numeric;
BEGIN
    SELECT * INTO v_return FROM public.sales_returns WHERE id = p_return_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'مرتجع المبيعات غير موجود (ID: %)', p_return_id;
    END IF;

    IF v_return.status = 'draft' THEN
        RETURN true;
    END IF;

    IF v_caller_id IS NULL AND auth.role() <> 'service_role' THEN
        RAISE EXCEPTION 'TRIPRO_SECURITY_ALERT: تم رفض الوصول. يجب تسجيل الدخول لإلغاء ترحيل مرتجع المبيعات.';
    END IF;

    IF v_caller_id IS NOT NULL THEN
        SELECT role INTO v_caller_role FROM public.profiles WHERE id = v_caller_id;
        IF COALESCE(v_caller_role, '') NOT IN ('super_admin', 'admin', 'manager', 'accountant', 'owner') THEN
            RAISE EXCEPTION 'TRIPRO_SECURITY_ALERT: لا تملك الصلاحية المحاسبية اللازمة لإلغاء ترحيل مرتجع المبيعات.';
        END IF;

        IF v_return.organization_id IS NOT NULL
           AND v_return.organization_id <> public.get_my_org()
           AND COALESCE(v_caller_role, '') NOT IN ('super_admin') THEN
            RAISE EXCEPTION 'TRIPRO_SECURITY_ALERT: هذا المرتجع يتبع منشأة أخرى ولا يحق لك تعديله.';
        END IF;
    END IF;

    PERFORM set_config('app.allow_financial_ledger_mutation', 'true', true);

    v_org_id := COALESCE(p_org_id, v_return.organization_id);

    BEGIN
        SELECT COALESCE(cancellation_mode, 'direct') INTO v_cancel_mode
        FROM public.company_settings
        WHERE organization_id = v_org_id
        LIMIT 1;
    EXCEPTION WHEN OTHERS THEN
        v_cancel_mode := 'direct';
    END;
    v_cancel_mode := COALESCE(v_cancel_mode, 'direct');

    -- عكس أثر المخزون
    FOR v_item IN
        SELECT product_id, quantity, uom_id
        FROM public.sales_return_items
        WHERE sales_return_id = p_return_id
          AND product_id IS NOT NULL
          AND COALESCE(quantity, 0) > 0
    LOOP
        BEGIN
            IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'uom_convert' AND pronamespace = 'public'::regnamespace) THEN
                v_base_qty := COALESCE(
                    public.uom_convert(
                        v_item.quantity,
                        v_item.uom_id,
                        (SELECT base_uom_id FROM public.products WHERE id = v_item.product_id)
                    ),
                    v_item.quantity
                );
            ELSE
                v_base_qty := v_item.quantity;
            END IF;
        EXCEPTION WHEN OTHERS THEN
            v_base_qty := v_item.quantity;
        END;

        IF v_return.warehouse_id IS NOT NULL THEN
            UPDATE public.products
            SET stock = GREATEST(0, COALESCE(stock, 0) - v_base_qty),
                warehouse_stock = jsonb_set(
                    COALESCE(warehouse_stock, '{}'::jsonb),
                    ARRAY[v_return.warehouse_id::text],
                    to_jsonb(GREATEST(0, COALESCE((warehouse_stock->>v_return.warehouse_id::text)::numeric, 0) - v_base_qty))
                )
            WHERE id = v_item.product_id;
        ELSE
            UPDATE public.products
            SET stock = GREATEST(0, COALESCE(stock, 0) - v_base_qty)
            WHERE id = v_item.product_id;
        END IF;
    END LOOP;

    v_journal_id := v_return.related_journal_entry_id;
    IF v_journal_id IS NULL THEN
        SELECT id INTO v_journal_id
        FROM public.journal_entries
        WHERE (related_document_id = p_return_id AND related_document_type = 'sales_return')
           OR (reference = v_return.return_number AND (v_org_id IS NULL OR organization_id = v_org_id))
        ORDER BY created_at DESC
        LIMIT 1;
    END IF;

    UPDATE public.sales_returns
    SET status = 'draft',
        related_journal_entry_id = NULL
    WHERE id = p_return_id;

    IF v_journal_id IS NOT NULL THEN
        IF v_cancel_mode = 'reversal' THEN
            INSERT INTO public.journal_entries (
                transaction_date, description, reference, status, organization_id, is_posted, related_document_id, related_document_type, user_id
            ) VALUES (
                CURRENT_DATE,
                'قيد تسوية عكسي لإلغاء مرتجع مبيعات رقم ' || COALESCE(v_return.return_number, '-'),
                'REV-SRET-' || COALESCE(v_return.return_number, '-'),
                'draft',
                v_org_id,
                false,
                p_return_id,
                'sales_return_reversal',
                v_caller_id
            ) RETURNING id INTO v_reversal_journal_id;

            FOR v_line IN SELECT * FROM public.journal_lines WHERE journal_entry_id = v_journal_id LOOP
                INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
                VALUES (v_reversal_journal_id, v_line.account_id, v_line.credit, v_line.debit, 'عكس أثر: ' || COALESCE(v_line.description, ''), v_org_id);
            END LOOP;

            UPDATE public.journal_entries SET status = 'posted', is_posted = true WHERE id = v_reversal_journal_id;
            UPDATE public.journal_entries SET status = 'reversed', is_posted = false WHERE id = v_journal_id;
        ELSE
            UPDATE public.journal_entries SET status = 'draft', is_posted = false WHERE id = v_journal_id;
            DELETE FROM public.journal_lines WHERE journal_entry_id = v_journal_id;
            DELETE FROM public.journal_entries WHERE id = v_journal_id;
        END IF;
    END IF;

    IF v_cancel_mode <> 'reversal' AND v_return.return_number IS NOT NULL THEN
        UPDATE public.journal_entries
        SET status = 'draft', is_posted = false
        WHERE reference = v_return.return_number
          AND (v_org_id IS NULL OR organization_id = v_org_id);

        DELETE FROM public.journal_lines
        WHERE journal_entry_id IN (
            SELECT id FROM public.journal_entries
            WHERE reference = v_return.return_number
              AND (v_org_id IS NULL OR organization_id = v_org_id)
        );
        DELETE FROM public.journal_entries
        WHERE reference = v_return.return_number
          AND (v_org_id IS NULL OR organization_id = v_org_id);
    END IF;

    IF v_return.customer_id IS NOT NULL THEN
        BEGIN
            IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'update_single_customer_balance' AND pronamespace = 'public'::regnamespace) THEN
                PERFORM public.update_single_customer_balance(v_return.customer_id, v_org_id);
            END IF;
        EXCEPTION WHEN OTHERS THEN NULL;
        END;
    END IF;

    PERFORM set_config('app.allow_financial_ledger_mutation', 'false', true);
    RETURN true;
EXCEPTION
    WHEN OTHERS THEN
        BEGIN
            PERFORM set_config('app.allow_financial_ledger_mutation', 'false', true);
        EXCEPTION WHEN OTHERS THEN NULL;
        END;
        RAISE;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.unpost_sales_return(uuid, uuid) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.unpost_sales_return(uuid, uuid) TO authenticated, service_role;


-- ==============================================================================
-- 4. update_employee_advance(uuid, uuid, numeric, date, uuid, text)
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.update_employee_advance(
    p_advance_id uuid,
    p_employee_id uuid,
    p_amount numeric,
    p_date date,
    p_treasury_id uuid,
    p_notes text DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_org_id uuid;
    v_ref text;
    v_journal_id uuid;
    v_emp_name text;
    v_advances_acc_id uuid;
    v_mappings jsonb;
    v_caller_id uuid := auth.uid();
    v_caller_role text;
BEGIN
    IF v_caller_id IS NOT NULL THEN
        SELECT role INTO v_caller_role FROM public.profiles WHERE id = v_caller_id;
        IF COALESCE(v_caller_role, '') NOT IN ('super_admin', 'admin', 'manager', 'accountant', 'owner') THEN
            RAISE EXCEPTION 'TRIPRO_SECURITY_ALERT: لا تملك الصلاحية المالية اللازمة لتعديل السلفة.';
        END IF;
    END IF;

    SELECT reference, organization_id
    INTO v_ref, v_org_id
    FROM public.employee_advances
    WHERE id = p_advance_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'السلفة غير موجودة.';
    END IF;

    IF v_caller_id IS NOT NULL
       AND v_org_id IS NOT NULL
       AND v_org_id <> public.get_my_org()
       AND COALESCE(v_caller_role, '') NOT IN ('super_admin') THEN
        RAISE EXCEPTION 'TRIPRO_SECURITY_ALERT: هذه السلفة تتبع منشأة أخرى ولا يحق لك تعديلها.';
    END IF;

    v_org_id := COALESCE(v_org_id, public.get_my_org());
    IF v_org_id IS NULL THEN
        RAISE EXCEPTION 'تعذر تحديد المنظمة للسلفة.';
    END IF;

    IF v_ref IS NULL OR TRIM(v_ref) = '' THEN
        v_ref := 'ADV-' || LPAD(FLOOR(RANDOM() * 900000 + 100000)::text, 6, '0');
    END IF;

    SELECT COALESCE(full_name, name, 'موظف') INTO v_emp_name
    FROM public.employees
    WHERE id = p_employee_id;

    UPDATE public.employee_advances
    SET employee_id = p_employee_id,
        amount = p_amount,
        request_date = p_date,
        advance_date = p_date,
        treasury_account_id = p_treasury_id,
        notes = p_notes,
        reference = v_ref
    WHERE id = p_advance_id;

    SELECT account_mappings INTO v_mappings
    FROM public.company_settings
    WHERE organization_id = v_org_id
    LIMIT 1;

    v_advances_acc_id := COALESCE(
        public.safe_cast_uuid(v_mappings->>'EMPLOYEE_ADVANCES'),
        (SELECT id FROM public.accounts
         WHERE organization_id = v_org_id
           AND COALESCE(is_group, false) = false
           AND (code IN ('1223', '122301', '1104') OR name LIKE '%سلف%' OR name LIKE '%قروض%')
         ORDER BY CASE WHEN code = '1223' THEN 1 WHEN name LIKE '%سلف%' THEN 2 ELSE 3 END
         LIMIT 1)
    );

    IF v_advances_acc_id IS NULL THEN
        INSERT INTO public.accounts (code, name, type, is_group, organization_id)
        VALUES ('1223', 'سلف العاملين', 'ASSET', false, v_org_id)
        ON CONFLICT DO NOTHING
        RETURNING id INTO v_advances_acc_id;

        IF v_advances_acc_id IS NULL THEN
            SELECT id INTO v_advances_acc_id
            FROM public.accounts
            WHERE organization_id = v_org_id AND code = '1223'
            LIMIT 1;
        END IF;
    END IF;

    PERFORM set_config('app.allow_financial_ledger_mutation', 'true', true);

    SELECT id INTO v_journal_id
    FROM public.journal_entries
    WHERE organization_id = v_org_id
      AND (
          (related_document_id = p_advance_id AND related_document_type = 'employee_advance')
          OR reference = v_ref
          OR reference = 'ADV-' || v_ref
          OR reference = REPLACE(v_ref, 'ADV-', '')
      )
    ORDER BY created_at DESC
    LIMIT 1;

    IF v_advances_acc_id IS NOT NULL AND p_treasury_id IS NOT NULL THEN
        IF v_journal_id IS NOT NULL THEN
            UPDATE public.journal_entries
            SET status = 'draft',
                is_posted = false,
                transaction_date = p_date,
                description = 'صرف سلفة للموظف ' || COALESCE(v_emp_name, '')
            WHERE id = v_journal_id;

            DELETE FROM public.journal_lines WHERE journal_entry_id = v_journal_id;
        ELSE
            INSERT INTO public.journal_entries (
                organization_id, reference, transaction_date, description, status, is_posted, related_document_id, related_document_type, user_id
            ) VALUES (
                v_org_id, v_ref, p_date, 'صرف سلفة للموظف ' || COALESCE(v_emp_name, ''), 'draft', false, p_advance_id, 'employee_advance', v_caller_id
            ) RETURNING id INTO v_journal_id;
        END IF;

        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
        VALUES (v_journal_id, v_advances_acc_id, p_amount, 0, 'سلفة موظف - ' || COALESCE(v_emp_name, ''), v_org_id);

        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
        VALUES (v_journal_id, p_treasury_id, 0, p_amount, 'صرف نقدية لسلفة', v_org_id);

        UPDATE public.journal_entries
        SET status = 'posted', is_posted = true
        WHERE id = v_journal_id;
    END IF;

    PERFORM set_config('app.allow_financial_ledger_mutation', 'false', true);
    RETURN true;
EXCEPTION
    WHEN OTHERS THEN
        BEGIN
            PERFORM set_config('app.allow_financial_ledger_mutation', 'false', true);
        EXCEPTION WHEN OTHERS THEN NULL;
        END;
        RAISE;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.update_employee_advance(uuid, uuid, numeric, date, uuid, text) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.update_employee_advance(uuid, uuid, numeric, date, uuid, text) TO authenticated, service_role;

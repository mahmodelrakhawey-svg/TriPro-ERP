-- =====================================================================
-- 🛡️ TriPro-ERP: Enterprise Core Optimizations (Phases 5, 6 & 7)
-- Date: 2026-09-05
-- Scope:
--   1. Gapless, Non-Colliding Document Sequences (Tax Compliance)
--   2. High-Speed Delta Approvals for Sales & Purchase Invoices (O(1) vs O(N))
--   3. Unified Function Signatures (Eliminate PGRST203 Candidate Ambiguity)
--   4. Atomic POS Checkout RPC (One Roundtrip Sale, Shift & Stock Deduction)
-- =====================================================================

-- =====================================================================
-- 1. جدول ودالة الترقيم التسلسلي غير القابل للتكرار (Gapless Sequences)
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.document_sequences (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id uuid NOT NULL,
    document_type text NOT NULL,
    prefix text NOT NULL DEFAULT '',
    current_number bigint NOT NULL DEFAULT 0,
    padding integer NOT NULL DEFAULT 6,
    updated_at timestamptz DEFAULT now(),
    CONSTRAINT uq_org_doc_type UNIQUE (organization_id, document_type)
);

CREATE INDEX IF NOT EXISTS idx_doc_sequences_org_type 
ON public.document_sequences (organization_id, document_type);

CREATE OR REPLACE FUNCTION public.get_next_document_number(
    p_org_id uuid,
    p_doc_type text,
    p_prefix text DEFAULT NULL
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_rec record;
    v_next_num bigint;
    v_prefix text;
    v_padding int;
    v_result text;
BEGIN
    IF p_org_id IS NULL THEN
        p_org_id := public.get_my_org();
    END IF;

    -- تحديد البادئة الافتراضية إذا لم تُمرر
    v_prefix := COALESCE(p_prefix, 
        CASE p_doc_type
            WHEN 'invoice' THEN 'INV-'
            WHEN 'purchase_invoice' THEN 'PUR-'
            WHEN 'sales_return' THEN 'SR-'
            WHEN 'purchase_return' THEN 'PR-'
            WHEN 'receipt_voucher' THEN 'RV-'
            WHEN 'payment_voucher' THEN 'PV-'
            WHEN 'journal_entry' THEN 'JV-'
            ELSE UPPER(p_doc_type) || '-'
        END
    );

    -- القفل الذري على مستوى المنظمة ونوع المستند لمنع تكرار الأرقام تحت أي ضغط
    INSERT INTO public.document_sequences (organization_id, document_type, prefix, current_number, padding, updated_at)
    VALUES (p_org_id, p_doc_type, v_prefix, 0, 6, now())
    ON CONFLICT (organization_id, document_type) DO NOTHING;

    SELECT current_number, padding, prefix
    INTO v_rec
    FROM public.document_sequences
    WHERE organization_id = p_org_id AND document_type = p_doc_type
    FOR UPDATE;

    IF p_prefix IS NOT NULL AND v_rec.prefix != p_prefix THEN
        v_prefix := p_prefix;
    ELSE
        v_prefix := v_rec.prefix;
    END IF;

    v_padding := COALESCE(v_rec.padding, 6);

    -- إذا كانت هذه أول مرة ويبدأ الترقيم من الصفر، نتحقق من أعلى رقم موجود في الجدول الفعلي لتفادي التعارض
    IF v_rec.current_number = 0 THEN
        IF p_doc_type = 'invoice' THEN
            SELECT COALESCE(MAX(NULLIF(SUBSTRING(invoice_number FROM '[0-9]+'), '')::bigint), 0)
            INTO v_next_num
            FROM public.invoices
            WHERE organization_id = p_org_id AND invoice_number ~ '[0-9]+';
        ELSIF p_doc_type = 'purchase_invoice' THEN
            SELECT COALESCE(MAX(NULLIF(SUBSTRING(invoice_number FROM '[0-9]+'), '')::bigint), 0)
            INTO v_next_num
            FROM public.purchase_invoices
            WHERE organization_id = p_org_id AND invoice_number ~ '[0-9]+';
        ELSE
            v_next_num := 0;
        END IF;
        v_next_num := v_next_num + 1;
    ELSE
        v_next_num := v_rec.current_number + 1;
    END IF;

    UPDATE public.document_sequences
    SET current_number = v_next_num,
        prefix = v_prefix,
        updated_at = now()
    WHERE organization_id = p_org_id AND document_type = p_doc_type;

    v_result := v_prefix || LPAD(v_next_num::text, v_padding, '0');
    RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_next_document_number(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_next_document_number(uuid, text, text) TO anon;

-- =====================================================================
-- 2. تنظيف التواقيع المتضاربة لمنع خطأ PGRST203 Candidate Ambiguity
-- =====================================================================

DO $$
BEGIN
    DROP FUNCTION IF EXISTS public.approve_invoice(uuid);
    DROP FUNCTION IF EXISTS public.post_sales_invoice(uuid);
    DROP FUNCTION IF EXISTS public.approve_purchase_invoice(uuid);
    DROP FUNCTION IF EXISTS public.post_purchase_invoice(uuid);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- =====================================================================
-- 3. ترحيل فاتورة المبيعات فائق السرعة عبر التحديث اللحظي (Delta Stock)
-- =====================================================================

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
    v_org_id uuid;
    v_item record;
    v_base_qty numeric;
    v_item_cost numeric;
    v_total_cost numeric := 0;
    v_mappings jsonb;
    v_allow_negative_stock boolean;
    v_sales_acc_id uuid;
    v_vat_acc_id uuid;
    v_customer_acc_id uuid;
    v_cogs_acc_id uuid;
    v_inv_acc_id uuid;
    v_treasury_acc_id uuid;
    v_journal_id uuid;
    v_wh_id uuid;
BEGIN
    -- أ. التحقق من وجود الفاتورة
    SELECT * INTO v_invoice FROM public.invoices WHERE id = p_invoice_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'فاتورة المبيعات غير موجودة (ID: %)', p_invoice_id;
    END IF;

    IF v_invoice.status IN ('posted', 'paid') THEN
        RETURN;
    END IF;

    v_org_id := COALESCE(p_org_id, v_invoice.organization_id, public.get_my_org());
    IF v_org_id IS NULL THEN
        RAISE EXCEPTION 'تعذر تحديد هوية المنظمة للفاتورة.';
    END IF;

    v_wh_id := COALESCE(p_warehouse_id, v_invoice.warehouse_id, (SELECT id FROM public.warehouses WHERE organization_id = v_org_id LIMIT 1));

    -- ب. جلب الحسابات وإعدادات المخزون السالب
    SELECT account_mappings, allow_negative_stock 
    INTO v_mappings, v_allow_negative_stock 
    FROM public.company_settings 
    WHERE organization_id = v_org_id LIMIT 1;

    v_sales_acc_id := COALESCE((v_mappings->>'SALES_REVENUE')::uuid, (SELECT id FROM public.accounts WHERE code IN ('411', '4101') AND organization_id = v_org_id LIMIT 1));
    v_vat_acc_id := COALESCE((v_mappings->>'VAT')::uuid, (SELECT id FROM public.accounts WHERE code IN ('2231', '2103') AND organization_id = v_org_id LIMIT 1));
    v_customer_acc_id := COALESCE((v_mappings->>'CUSTOMERS')::uuid, (SELECT id FROM public.accounts WHERE code IN ('1221', '1102') AND organization_id = v_org_id LIMIT 1));
    v_cogs_acc_id := COALESCE((v_mappings->>'COGS')::uuid, (SELECT id FROM public.accounts WHERE code IN ('511', '5101') AND organization_id = v_org_id LIMIT 1));
    v_inv_acc_id := COALESCE((v_mappings->>'INVENTORY_FINISHED_GOODS')::uuid, (SELECT id FROM public.accounts WHERE code IN ('10302', '1105') AND organization_id = v_org_id LIMIT 1));
    v_treasury_acc_id := v_invoice.treasury_account_id;

    -- ج. التحقق من المخزون والتحديث اللحظي (Delta Stock)
    FOR v_item IN 
        SELECT ii.*, p.product_type, p.stock as current_stock, p.warehouse_stock, p.base_uom_id
        FROM public.invoice_items ii 
        JOIN public.products p ON ii.product_id = p.id 
        WHERE ii.invoice_id = p_invoice_id 
    LOOP
        -- حساب الكمية بالوحدة الأساسية
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

        -- فحص المخزون السالب إذا كان ممنوعاً
        IF COALESCE(v_allow_negative_stock, false) = false AND v_item.product_type NOT IN ('SERVICE', 'NON_STOCK') THEN
            IF v_wh_id IS NOT NULL THEN
                DECLARE
                    v_wh_qty numeric := COALESCE((v_item.warehouse_stock->>v_wh_id::text)::numeric, 0);
                BEGIN
                    IF v_wh_qty < v_base_qty THEN
                        RAISE EXCEPTION '❌ [عجز مخزون]: الصنف "%" رصيده الحالي (%) في المستودع المحدد، بينما المطلوب (%).',
                            (SELECT name FROM public.products WHERE id = v_item.product_id), v_wh_qty, v_base_qty;
                    END IF;
                END;
            ELSIF COALESCE(v_item.current_stock, 0) < v_base_qty THEN
                RAISE EXCEPTION '❌ [عجز مخزون]: الصنف "%" رصيده الحالي (%)، بينما المطلوب (%).',
                    (SELECT name FROM public.products WHERE id = v_item.product_id), v_item.current_stock, v_base_qty;
            END IF;
        END IF;

        -- حساب التكلفة
        SELECT COALESCE(cost, NULLIF(weighted_average_cost, 0), NULLIF(purchase_price, 0), 0)
        INTO v_item_cost
        FROM public.products
        WHERE id = v_item.product_id;

        v_total_cost := v_total_cost + (v_item_cost * v_base_qty);
        UPDATE public.invoice_items SET cost = v_item_cost WHERE id = v_item.id;

        -- خصم المخزون اللحظي (Delta Direct Update - لا إعادة احتساب شاملة)
        IF v_item.product_type NOT IN ('SERVICE', 'NON_STOCK') THEN
            IF v_wh_id IS NOT NULL THEN
                UPDATE public.products
                SET 
                    stock = COALESCE(stock, 0) - v_base_qty,
                    warehouse_stock = jsonb_set(
                        COALESCE(warehouse_stock, '{}'::jsonb),
                        ARRAY[v_wh_id::text],
                        to_jsonb(
                            COALESCE((warehouse_stock->>v_wh_id::text)::numeric, 0) - v_base_qty
                        )
                    )
                WHERE id = v_item.product_id;
            ELSE
                UPDATE public.products
                SET stock = COALESCE(stock, 0) - v_base_qty
                WHERE id = v_item.product_id;
            END IF;
        END IF;
    END LOOP;

    -- د. حذف أي قيود سابقة مرتبطة بالفاتورة منعاً للتكرار
    DELETE FROM public.journal_lines 
    WHERE journal_entry_id IN (
        SELECT id FROM public.journal_entries 
        WHERE related_document_id = p_invoice_id AND related_document_type = 'invoice'
    );
    DELETE FROM public.journal_entries 
    WHERE related_document_id = p_invoice_id AND related_document_type = 'invoice';

    -- هـ. إنشاء قيد اليومية المزدوج
    INSERT INTO public.journal_entries (
        transaction_date, description, reference, status, organization_id, related_document_id, related_document_type, is_posted
    ) VALUES (
        v_invoice.invoice_date,
        'فاتورة مبيعات رقم ' || COALESCE(v_invoice.invoice_number, '-'),
        v_invoice.invoice_number,
        'posted',
        v_org_id,
        p_invoice_id,
        'invoice',
        true
    ) RETURNING id INTO v_journal_id;

    -- سطر مدين للعميل بإجمالي الفاتورة
    IF v_customer_acc_id IS NOT NULL THEN
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
        VALUES (v_journal_id, v_customer_acc_id, v_invoice.total_amount, 0, 'استحقاق فاتورة مبيعات رقم ' || COALESCE(v_invoice.invoice_number, '-'), v_org_id);
    END IF;

    -- سطر دائن لإيراد المبيعات بالصافي
    IF v_sales_acc_id IS NOT NULL THEN
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
        VALUES (v_journal_id, v_sales_acc_id, 0, v_invoice.subtotal, 'إيراد مبيعات فاتورة رقم ' || COALESCE(v_invoice.invoice_number, '-'), v_org_id);
    END IF;

    -- سطر دائن لضريبة القيمة المضافة
    IF COALESCE(v_invoice.tax_amount, 0) > 0 AND v_vat_acc_id IS NOT NULL THEN
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
        VALUES (v_journal_id, v_vat_acc_id, 0, v_invoice.tax_amount, 'ضريبة مخرجات مبيعات', v_org_id);
    END IF;

    -- سطر تكلفة البضاعة المباعة وصرف المخزون
    IF v_total_cost > 0 AND v_cogs_acc_id IS NOT NULL AND v_inv_acc_id IS NOT NULL THEN
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
        VALUES 
            (v_journal_id, v_cogs_acc_id, v_total_cost, 0, 'تكلفة بضاعة مباعة', v_org_id),
            (v_journal_id, v_inv_acc_id, 0, v_total_cost, 'صرف مخزون بضاعة مباعة', v_org_id);
    END IF;

    -- إثبات السداد الفوري (إن وجد)
    IF COALESCE(v_invoice.paid_amount, 0) > 0 AND v_treasury_acc_id IS NOT NULL AND v_customer_acc_id IS NOT NULL THEN
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
        VALUES 
            (v_journal_id, v_treasury_acc_id, v_invoice.paid_amount, 0, 'تحصيل نقدي - فاتورة ' || COALESCE(v_invoice.invoice_number, '-'), v_org_id),
            (v_journal_id, v_customer_acc_id, 0, v_invoice.paid_amount, 'سداد فوري من العميل - فاتورة ' || COALESCE(v_invoice.invoice_number, '-'), v_org_id);
    END IF;

    -- و. تحديث حالة الفاتورة وربطها بالقيد
    UPDATE public.invoices 
    SET status = CASE WHEN (v_invoice.total_amount - COALESCE(v_invoice.paid_amount, 0)) <= 0.01 THEN 'paid' ELSE 'posted' END, 
        related_journal_entry_id = v_journal_id,
        warehouse_id = v_wh_id
    WHERE id = p_invoice_id;

    -- تحديث رصيد العميل اللحظي الفردي فقط (بدون فحص كامل قاعدة البيانات)
    IF v_invoice.customer_id IS NOT NULL THEN
        BEGIN
            IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'update_single_customer_balance' AND pronamespace = 'public'::regnamespace) THEN
                PERFORM public.update_single_customer_balance(v_invoice.customer_id, v_org_id);
            END IF;
        EXCEPTION WHEN OTHERS THEN NULL;
        END;
    END IF;
END;
$$;

-- Alias دالة ترحيل المبيعات
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

GRANT EXECUTE ON FUNCTION public.approve_invoice(uuid, uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.approve_invoice(uuid, uuid, uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.post_sales_invoice(uuid, uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.post_sales_invoice(uuid, uuid, uuid) TO anon;

-- =====================================================================
-- 4. ترحيل فاتورة المشتريات اللحظي السريع (Delta Stock & WAC)
-- =====================================================================

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
    v_treasury_acc_id uuid;
    v_journal_id uuid;
    v_mappings jsonb;
    v_cur_stock numeric;
    v_cur_cost numeric;
    v_new_wac numeric;
BEGIN
    SELECT * INTO v_invoice FROM public.purchase_invoices WHERE id = p_invoice_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'فاتورة المشتريات غير موجودة (ID: %)', p_invoice_id;
    END IF;

    IF v_invoice.status IN ('posted', 'paid') THEN
        RETURN;
    END IF;

    v_org_id := COALESCE(p_org_id, v_invoice.organization_id, public.get_my_org());
    v_wh_id := COALESCE(p_warehouse_id, v_invoice.warehouse_id, (SELECT id FROM public.warehouses WHERE organization_id = v_org_id LIMIT 1));

    -- جلب الحسابات
    SELECT account_mappings INTO v_mappings FROM public.company_settings WHERE organization_id = v_org_id;
    v_inventory_acc_id := COALESCE((v_mappings->>'INVENTORY_RAW_MATERIALS')::uuid, (SELECT id FROM public.accounts WHERE code IN ('10301', '1105') AND organization_id = v_org_id LIMIT 1));
    v_vat_in_id := COALESCE((v_mappings->>'VAT_INPUT')::uuid, (v_mappings->>'VAT')::uuid, (SELECT id FROM public.accounts WHERE code IN ('1241', '2103') AND organization_id = v_org_id LIMIT 1));
    v_supplier_acc_id := COALESCE((v_mappings->>'SUPPLIERS')::uuid, (SELECT id FROM public.accounts WHERE code IN ('201', '2101') AND organization_id = v_org_id LIMIT 1));
    v_treasury_acc_id := v_invoice.treasury_account_id;

    -- تحديث المخزون وحساب المتوسط المرجح للتكلفة (WAC) لحظياً
    FOR v_item IN 
        SELECT pii.*, p.stock as prod_stock, p.weighted_average_cost, p.cost, p.purchase_price, p.base_uom_id
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

        v_unit_cost_base := (v_item.unit_price * v_item.quantity) / NULLIF(v_base_qty, 0);
        v_cur_stock := COALESCE(v_item.prod_stock, 0);
        v_cur_cost := COALESCE(NULLIF(v_item.weighted_average_cost, 0), NULLIF(v_item.cost, 0), v_item.purchase_price, v_unit_cost_base);

        IF (v_cur_stock + v_base_qty) > 0 THEN
            v_new_wac := ROUND(((v_cur_stock * v_cur_cost) + (v_base_qty * v_unit_cost_base)) / (v_cur_stock + v_base_qty), 4);
        ELSE
            v_new_wac := v_unit_cost_base;
        END IF;

        -- تحديث المنتج (المخزون العام ومخزون المستودع والتكلفة)
        IF v_wh_id IS NOT NULL THEN
            UPDATE public.products
            SET 
                stock = COALESCE(stock, 0) + v_base_qty,
                warehouse_stock = jsonb_set(
                    COALESCE(warehouse_stock, '{}'::jsonb),
                    ARRAY[v_wh_id::text],
                    to_jsonb(
                        COALESCE((warehouse_stock->>v_wh_id::text)::numeric, 0) + v_base_qty
                    )
                ),
                purchase_price = v_unit_cost_base,
                cost = v_new_wac,
                weighted_average_cost = v_new_wac
            WHERE id = v_item.product_id;
        ELSE
            UPDATE public.products
            SET 
                stock = COALESCE(stock, 0) + v_base_qty,
                purchase_price = v_unit_cost_base,
                cost = v_new_wac,
                weighted_average_cost = v_new_wac
            WHERE id = v_item.product_id;
        END IF;
    END LOOP;

    -- تنظيف القيود المحاسبية السابقة المرتبطة
    DELETE FROM public.journal_lines 
    WHERE journal_entry_id IN (
        SELECT id FROM public.journal_entries 
        WHERE related_document_id = p_invoice_id AND related_document_type = 'purchase_invoice'
    );
    DELETE FROM public.journal_entries 
    WHERE related_document_id = p_invoice_id AND related_document_type = 'purchase_invoice';

    -- إنشاء قيد اليومية
    INSERT INTO public.journal_entries (
        transaction_date, description, reference, status, organization_id, related_document_id, related_document_type, is_posted
    ) VALUES (
        v_invoice.invoice_date,
        'فاتورة مشتريات رقم ' || COALESCE(v_invoice.invoice_number, '-'),
        v_invoice.invoice_number,
        'posted',
        v_org_id,
        p_invoice_id,
        'purchase_invoice',
        true
    ) RETURNING id INTO v_journal_id;

    -- أسطر القيد: المخزون مدين
    IF v_inventory_acc_id IS NOT NULL THEN
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
        VALUES (v_journal_id, v_inventory_acc_id, v_invoice.subtotal, 0, 'إثبات مشتريات - مخزون', v_org_id);
    END IF;

    -- ضريبة المدخلات مدين
    IF COALESCE(v_invoice.tax_amount, 0) > 0 AND v_vat_in_id IS NOT NULL THEN
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
        VALUES (v_journal_id, v_vat_in_id, v_invoice.tax_amount, 0, 'ضريبة مدخلات مشتريات', v_org_id);
    END IF;

    -- المورد دائن
    IF v_supplier_acc_id IS NOT NULL THEN
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
        VALUES (v_journal_id, v_supplier_acc_id, 0, v_invoice.total_amount, 'استحقاق مورد - فاتورة مشتريات', v_org_id);
    END IF;

    -- السداد الفوري (إن وجد)
    IF COALESCE(v_invoice.paid_amount, 0) > 0 AND v_treasury_acc_id IS NOT NULL AND v_supplier_acc_id IS NOT NULL THEN
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
        VALUES 
            (v_journal_id, v_supplier_acc_id, v_invoice.paid_amount, 0, 'سداد فوري - فاتورة مشتريات ' || v_invoice.invoice_number, v_org_id),
            (v_journal_id, v_treasury_acc_id, 0, v_invoice.paid_amount, 'دفع نقدي للمورد', v_org_id);
    END IF;

    -- تحديث حالة الفاتورة
    UPDATE public.purchase_invoices 
    SET status = CASE WHEN (v_invoice.total_amount - COALESCE(v_invoice.paid_amount, 0)) <= 0.01 THEN 'paid' ELSE 'posted' END,
        related_journal_entry_id = v_journal_id,
        warehouse_id = v_wh_id
    WHERE id = p_invoice_id;

    -- تحديث رصيد المورد الفردي
    IF v_invoice.supplier_id IS NOT NULL THEN
        BEGIN
            IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'update_single_supplier_balance' AND pronamespace = 'public'::regnamespace) THEN
                PERFORM public.update_single_supplier_balance(v_invoice.supplier_id, v_org_id);
            END IF;
        EXCEPTION WHEN OTHERS THEN NULL;
        END;
    END IF;
END;
$$;

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

GRANT EXECUTE ON FUNCTION public.approve_purchase_invoice(uuid, uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.approve_purchase_invoice(uuid, uuid, uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.post_purchase_invoice(uuid, uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.post_purchase_invoice(uuid, uuid, uuid) TO anon;

-- =====================================================================
-- 5. المعاملة الذرية لنقاط البيع (Atomic POS Checkout RPC)
-- =====================================================================

CREATE OR REPLACE FUNCTION public.complete_pos_sale_atomic(
    p_items jsonb,                 -- مصفوفة أصناف السلة [{product_id, quantity, unit_price, uom_id}]
    p_org_id uuid,
    p_user_id uuid,
    p_warehouse_id uuid DEFAULT NULL,
    p_customer_id uuid DEFAULT NULL,
    p_payment_method text DEFAULT 'CASH',
    p_payment_amount numeric DEFAULT 0,
    p_shift_id uuid DEFAULT NULL,
    p_terminal_id uuid DEFAULT NULL,
    p_total_discount numeric DEFAULT 0,
    p_notes text DEFAULT NULL,
    p_cash_account_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_order_id uuid;
    v_order_number text;
    v_wh_id uuid;
    v_subtotal numeric := 0;
    v_item jsonb;
    v_prod_id uuid;
    v_qty numeric;
    v_price numeric;
    v_uom_id uuid;
    v_cost numeric;
    v_base_qty numeric;
    v_tax numeric := 0;
    v_grand_total numeric := 0;
    v_vat_rate numeric := 0.14; -- القيمة الافتراضية
BEGIN
    IF p_org_id IS NULL THEN
        p_org_id := public.get_my_org();
    END IF;

    v_wh_id := COALESCE(p_warehouse_id, (SELECT id FROM public.warehouses WHERE organization_id = p_org_id LIMIT 1));

    -- استخراج رقم الطلب من التسلسل الآمن
    v_order_number := public.get_next_document_number(p_org_id, 'order', 'ORD-');

    -- إنشاء الطلب المباشر
    INSERT INTO public.orders (
        order_number,
        order_type,
        status,
        subtotal,
        total_tax,
        grand_total,
        total_discount,
        user_id,
        organization_id,
        customer_id,
        shift_id,
        terminal_id,
        notes,
        created_at
    ) VALUES (
        v_order_number,
        'TAKEAWAY',
        'PAID',
        0, 0, 0,
        COALESCE(p_total_discount, 0),
        p_user_id,
        p_org_id,
        p_customer_id,
        p_shift_id,
        p_terminal_id,
        p_notes,
        now()
    ) RETURNING id INTO v_order_id;

    -- إدراج بنود الطلب وخصم المخزون اللحظي
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
        v_prod_id := (v_item->>'product_id')::uuid;
        v_qty := COALESCE((v_item->>'quantity')::numeric, 1);
        v_price := COALESCE((v_item->>'unit_price')::numeric, 0);
        v_uom_id := NULLIF(v_item->>'uom_id', '')::uuid;

        SELECT COALESCE(cost, purchase_price, 0) INTO v_cost
        FROM public.products WHERE id = v_prod_id;

        INSERT INTO public.order_items (
            order_id,
            product_id,
            quantity,
            unit_price,
            unit_cost,
            uom_id,
            organization_id
        ) VALUES (
            v_order_id,
            v_prod_id,
            v_qty,
            v_price,
            v_cost,
            v_uom_id,
            p_org_id
        );

        v_subtotal := v_subtotal + (v_qty * v_price);

        -- خصم مخزون الصنف مباشرة
        BEGIN
            IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'uom_convert' AND pronamespace = 'public'::regnamespace) THEN
                v_base_qty := public.uom_convert(v_qty, v_uom_id, (SELECT base_uom_id FROM public.products WHERE id = v_prod_id));
            ELSE
                v_base_qty := v_qty;
            END IF;
        EXCEPTION WHEN OTHERS THEN
            v_base_qty := v_qty;
        END;

        IF v_base_qty IS NULL OR v_base_qty <= 0 THEN
            v_base_qty := v_qty;
        END IF;

        IF v_wh_id IS NOT NULL THEN
            UPDATE public.products
            SET stock = COALESCE(stock, 0) - v_base_qty,
                warehouse_stock = jsonb_set(
                    COALESCE(warehouse_stock, '{}'::jsonb),
                    ARRAY[v_wh_id::text],
                    to_jsonb(
                        COALESCE((warehouse_stock->>v_wh_id::text)::numeric, 0) - v_base_qty
                    )
                )
            WHERE id = v_prod_id;
        ELSE
            UPDATE public.products
            SET stock = COALESCE(stock, 0) - v_base_qty
            WHERE id = v_prod_id;
        END IF;
    END LOOP;

    -- احتساب الإجماليات بدقة
    v_subtotal := GREATEST(0, v_subtotal - COALESCE(p_total_discount, 0));
    v_tax := 0; -- يمكن ضبطها حسب ضريبة الشركة
    v_grand_total := v_subtotal + v_tax;

    UPDATE public.orders
    SET subtotal = v_subtotal,
        total_tax = v_tax,
        grand_total = v_grand_total
    WHERE id = v_order_id;

    -- إدراج سجل السداد في payments
    INSERT INTO public.payments (
        order_id,
        amount,
        payment_method,
        status,
        organization_id,
        cash_account_id
    ) VALUES (
        v_order_id,
        COALESCE(p_payment_amount, v_grand_total),
        p_payment_method,
        'COMPLETED',
        p_org_id,
        p_cash_account_id
    );

    -- استهلاك وصفات التصنيع إن وجدت (BOM recipe deduction)
    BEGIN
        IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'mfg_deduct_stock_from_order' AND pronamespace = 'public'::regnamespace) THEN
            PERFORM public.mfg_deduct_stock_from_order(v_order_id);
        END IF;
    EXCEPTION WHEN OTHERS THEN NULL;
    END;

    RETURN jsonb_build_object(
        'success', true,
        'order_id', v_order_id,
        'order_number', v_order_number,
        'grand_total', v_grand_total
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.complete_pos_sale_atomic(
    jsonb, uuid, uuid, uuid, uuid, text, numeric, uuid, uuid, numeric, text, uuid
) TO authenticated;

GRANT EXECUTE ON FUNCTION public.complete_pos_sale_atomic(
    jsonb, uuid, uuid, uuid, uuid, text, numeric, uuid, uuid, numeric, text, uuid
) TO anon;

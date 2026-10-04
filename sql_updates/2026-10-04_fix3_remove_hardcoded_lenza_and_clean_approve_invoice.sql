-- =============================================================================
-- ملف الترحيل / Migration File
-- =============================================================================
-- الملف   : 2026-10-04_fix3_remove_hardcoded_lenza_and_clean_approve_invoice.sql
-- File    : 2026-10-04_fix3_remove_hardcoded_lenza_and_clean_approve_invoice.sql
-- التاريخ : 2026-10-04
-- Date    : 2026-10-04
-- الأولوية: حرجة / Priority: CRITICAL
-- -----------------------------------------------------------------------------
-- الغرض / Purpose:
--   إصلاح ثغرة أمنية خطيرة: إزالة الـ Hardcoded Tenant Bypass حيث كان اسم
--   الشركة 'لينزا' / 'lenza' مُضمَّنًا بشكل صريح داخل دالة approve_invoice.
--
--   Fix a critical security vulnerability: remove the Hardcoded Tenant Bypass
--   where the company name 'لينزا' / 'lenza' was explicitly embedded inside
--   the approve_invoice SQL function.
--
-- ما الذي يُصلحه هذا الملف / What this file fixes:
--   1. [SECURITY] إزالة جميع شروط ILIKE '%لينزا%' / '%lenza%' من منطق الدالة
--      Remove all ILIKE '%لينزا%' / '%lenza%' conditions from function logic
--   2. [CORRECTNESS] قراءة allow_negative_stock حصريًا من company_settings
--      Read allow_negative_stock exclusively from company_settings table
--   3. [FEATURE] الإبقاء على فحص الصلاحية على مستوى المستخدم عبر user_permissions
--      Keep user-level permission check via user_permissions table
--   4. [INTEGRITY] الحفاظ على القفل المتشائم (FOR UPDATE) وحارس الرصيد
--      Preserve pessimistic locking (FOR UPDATE) and balance guard logic
--   5. [DATA] ضمان أن منظمة لينزا لديها allow_negative_stock = true في company_settings
--      Ensure lenza org has allow_negative_stock = true in company_settings
--
-- الترتيب / Execution Order:
--   1. إعادة إنشاء الدالة approve_invoice نظيفة بلا hardcoding
--   2. تعديل البيانات: ضبط allow_negative_stock لمنظمة لينزا
--   3. ضبط صلاحيات GRANT / REVOKE
-- =============================================================================

-- ============================================================
-- الخطوة 1: إعادة إنشاء الدالة approve_invoice (نسخة نظيفة)
-- Step  1: Recreate approve_invoice function (clean version)
-- ============================================================

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
    v_allow_negative_stock boolean := false;
    v_sales_acc_id uuid;
    v_vat_acc_id uuid;
    v_customer_acc_id uuid;
    v_cogs_acc_id uuid;
    v_inv_acc_id uuid;
    v_treasury_acc_id uuid;
    v_journal_id uuid;
    v_wh_id uuid;
    v_locked_stock numeric;
    v_locked_wh_stock jsonb;
    v_has_user_perm boolean := false;
BEGIN
    -- أ. التحقق من وجود الفاتورة وحالتها
    -- A. Verify invoice existence and status
    SELECT * INTO v_invoice FROM public.invoices WHERE id = p_invoice_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'فاتورة المبيعات غير موجودة (ID: %)', p_invoice_id;
    END IF;

    IF v_invoice.status IN ('posted', 'paid') THEN
        RETURN; -- idempotent: already posted
    END IF;

    v_org_id := COALESCE(p_org_id, v_invoice.organization_id, public.get_my_org());
    IF v_org_id IS NULL THEN
        RAISE EXCEPTION 'تعذر تحديد هوية المنظمة للفاتورة.';
    END IF;

    v_wh_id := COALESCE(
        p_warehouse_id,
        v_invoice.warehouse_id,
        (SELECT id FROM public.warehouses WHERE organization_id = v_org_id ORDER BY created_at LIMIT 1)
    );

    -- ب. جلب إعدادات الشركة: allow_negative_stock من company_settings فقط (لا hardcoding)
    -- B. Fetch company settings: allow_negative_stock from company_settings ONLY (no hardcoding)
    SELECT
        account_mappings,
        COALESCE(allow_negative_stock, false)
    INTO v_mappings, v_allow_negative_stock
    FROM public.company_settings
    WHERE organization_id = v_org_id
    LIMIT 1;

    -- 🛡️ فحص صلاحية البيع بالسالب على مستوى المستخدم (user_permissions)
    -- 🛡️ Check user-level negative stock permission via user_permissions table
    IF NOT v_allow_negative_stock AND v_invoice.created_by IS NOT NULL THEN
        BEGIN
            IF EXISTS (
                SELECT 1 FROM information_schema.tables
                WHERE table_schema = 'public' AND table_name = 'user_permissions'
            ) THEN
                SELECT EXISTS (
                    SELECT 1 FROM public.user_permissions up
                    JOIN public.permissions p ON up.permission_id = p.id
                    WHERE up.user_id = v_invoice.created_by
                      AND up.granted = true
                      AND p.module IN ('sales', 'inventory')
                      AND p.action = 'negative_stock'
                ) INTO v_has_user_perm;

                IF v_has_user_perm THEN
                    v_allow_negative_stock := true;
                END IF;
            END IF;
        EXCEPTION WHEN OTHERS THEN
            -- تجاهل أخطاء جدول الصلاحيات
            -- Silently ignore user_permissions table errors
            NULL;
        END;
    END IF;

    -- ج. جلب معرّفات الحسابات من الربط المحاسبي
    -- C. Resolve account IDs from account mappings
    v_sales_acc_id     := COALESCE((v_mappings->>'SALES_REVENUE')::uuid,
        (SELECT id FROM public.accounts WHERE code IN ('411','4101') AND organization_id = v_org_id LIMIT 1));
    v_vat_acc_id       := COALESCE((v_mappings->>'VAT')::uuid,
        (SELECT id FROM public.accounts WHERE code IN ('2231','2103') AND organization_id = v_org_id LIMIT 1));
    v_customer_acc_id  := COALESCE((v_mappings->>'CUSTOMERS')::uuid,
        (SELECT id FROM public.accounts WHERE code IN ('1221','1102') AND organization_id = v_org_id LIMIT 1));
    v_cogs_acc_id      := COALESCE((v_mappings->>'COGS')::uuid,
        (SELECT id FROM public.accounts WHERE code IN ('511','5101') AND organization_id = v_org_id LIMIT 1));
    v_inv_acc_id       := COALESCE((v_mappings->>'INVENTORY_FINISHED_GOODS')::uuid,
        (SELECT id FROM public.accounts WHERE code IN ('10302','1105') AND organization_id = v_org_id LIMIT 1));
    v_treasury_acc_id  := v_invoice.treasury_account_id;

    -- د. حلقة فحص وخصم المخزون مع القفل المتشائم
    -- D. Stock validation & deduction loop with pessimistic locking
    FOR v_item IN
        SELECT ii.*, p.product_type, p.base_uom_id
        FROM public.invoice_items ii
        JOIN public.products p ON ii.product_id = p.id
        WHERE ii.invoice_id = p_invoice_id
    LOOP
        -- 🔒 القفل المتشائم الصارم (Pessimistic Lock)
        -- 🔒 Strict pessimistic row-level lock
        SELECT stock, warehouse_stock
        INTO v_locked_stock, v_locked_wh_stock
        FROM public.products
        WHERE id = v_item.product_id
        FOR UPDATE;

        -- تحويل الكمية للوحدة الأساسية
        -- Convert quantity to base UOM
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

        -- فحص كفاية المخزون
        -- Stock sufficiency check
        IF NOT v_allow_negative_stock AND v_item.product_type NOT IN ('SERVICE', 'NON_STOCK') THEN
            IF v_wh_id IS NOT NULL THEN
                IF COALESCE((v_locked_wh_stock->>v_wh_id::text)::numeric, 0) < v_base_qty THEN
                    RAISE EXCEPTION
                        '❌ [عجز مخزون]: الصنف "%" رصيده (%) في المستودع، والمطلوب (%)',
                        (SELECT name FROM public.products WHERE id = v_item.product_id),
                        COALESCE((v_locked_wh_stock->>v_wh_id::text)::numeric, 0),
                        v_base_qty;
                END IF;
            ELSIF COALESCE(v_locked_stock, 0) < v_base_qty THEN
                RAISE EXCEPTION
                    '❌ [عجز مخزون]: الصنف "%" رصيده العام (%)، والمطلوب (%)',
                    (SELECT name FROM public.products WHERE id = v_item.product_id),
                    v_locked_stock, v_base_qty;
            END IF;
        END IF;

        -- حساب تكلفة الصنف
        -- Calculate item cost
        SELECT COALESCE(cost, NULLIF(weighted_average_cost, 0), NULLIF(purchase_price, 0), 0)
        INTO v_item_cost
        FROM public.products WHERE id = v_item.product_id;

        v_total_cost := v_total_cost + (COALESCE(v_item_cost, 0) * v_base_qty);
        UPDATE public.invoice_items SET cost = v_item_cost WHERE id = v_item.id;

        -- خصم المخزون تحت القفل
        -- Deduct stock under lock
        IF v_item.product_type NOT IN ('SERVICE', 'NON_STOCK') THEN
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

    -- هـ. حذف قيود سابقة مرتبطة (idempotent re-post)
    -- E. Delete prior linked journal entries (idempotent re-post safety)
    DELETE FROM public.journal_lines
    WHERE journal_entry_id IN (
        SELECT id FROM public.journal_entries
        WHERE related_document_id = p_invoice_id AND related_document_type = 'invoice'
    );
    DELETE FROM public.journal_entries
    WHERE related_document_id = p_invoice_id AND related_document_type = 'invoice';

    -- و. إنشاء قيد اليومية المزدوج
    -- F. Create double-entry journal entry
    INSERT INTO public.journal_entries (
        transaction_date, description, reference, status,
        organization_id, related_document_id, related_document_type, is_posted
    ) VALUES (
        v_invoice.invoice_date,
        'فاتورة مبيعات رقم ' || COALESCE(v_invoice.invoice_number, p_invoice_id::text),
        v_invoice.invoice_number,
        'posted', v_org_id, p_invoice_id, 'invoice', true
    ) RETURNING id INTO v_journal_id;

    -- سطر مدين: حساب العميل
    -- Debit line: accounts receivable (customer)
    IF v_customer_acc_id IS NOT NULL THEN
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
        VALUES (v_journal_id, v_customer_acc_id, v_invoice.total_amount, 0,
                'استحقاق فاتورة مبيعات ' || COALESCE(v_invoice.invoice_number, ''), v_org_id);
    END IF;

    -- سطر دائن: إيراد المبيعات (الصافي)
    -- Credit line: sales revenue (net)
    IF v_sales_acc_id IS NOT NULL THEN
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
        VALUES (v_journal_id, v_sales_acc_id, 0, v_invoice.subtotal,
                'إيراد مبيعات فاتورة ' || COALESCE(v_invoice.invoice_number, ''), v_org_id);
    END IF;

    -- سطر دائن: ضريبة القيمة المضافة
    -- Credit line: output VAT
    IF COALESCE(v_invoice.tax_amount, 0) > 0 AND v_vat_acc_id IS NOT NULL THEN
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
        VALUES (v_journal_id, v_vat_acc_id, 0, v_invoice.tax_amount, 'ضريبة مخرجات مبيعات', v_org_id);
    END IF;

    -- سطران: تكلفة البضاعة المباعة وصرف المخزون
    -- Two lines: COGS debit + inventory credit
    IF v_total_cost > 0 AND v_cogs_acc_id IS NOT NULL AND v_inv_acc_id IS NOT NULL THEN
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
        VALUES
            (v_journal_id, v_cogs_acc_id, v_total_cost, 0, 'تكلفة بضاعة مباعة', v_org_id),
            (v_journal_id, v_inv_acc_id, 0, v_total_cost, 'صرف مخزون بضاعة مباعة', v_org_id);
    END IF;

    -- سطران: إثبات السداد الفوري (إن وجد)
    -- Two lines: immediate cash settlement (if applicable)
    IF COALESCE(v_invoice.paid_amount, 0) > 0
       AND v_treasury_acc_id IS NOT NULL
       AND v_customer_acc_id IS NOT NULL THEN
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
        VALUES
            (v_journal_id, v_treasury_acc_id, v_invoice.paid_amount, 0,
             'تحصيل نقدي - فاتورة ' || COALESCE(v_invoice.invoice_number, ''), v_org_id),
            (v_journal_id, v_customer_acc_id, 0, v_invoice.paid_amount,
             'سداد فوري من العميل - فاتورة ' || COALESCE(v_invoice.invoice_number, ''), v_org_id);
    END IF;

    -- ز. تحديث حالة الفاتورة وربطها بالقيد
    -- G. Update invoice status and link to journal entry
    UPDATE public.invoices
    SET
        status = CASE
            WHEN (v_invoice.total_amount - COALESCE(v_invoice.paid_amount, 0)) <= 0.01 THEN 'paid'
            ELSE 'posted'
        END,
        related_journal_entry_id = v_journal_id,
        warehouse_id = v_wh_id
    WHERE id = p_invoice_id;

    -- تحديث رصيد العميل
    -- Update customer balance
    IF v_invoice.customer_id IS NOT NULL THEN
        BEGIN
            IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'update_single_customer_balance'
                       AND pronamespace = 'public'::regnamespace) THEN
                PERFORM public.update_single_customer_balance(v_invoice.customer_id, v_org_id);
            END IF;
        EXCEPTION WHEN OTHERS THEN NULL;
        END;
    END IF;
END;
$$;

-- ============================================================
-- الخطوة 2: ضبط البيانات — ضمان allow_negative_stock لمنظمة لينزا
-- Step  2: Data fix — ensure allow_negative_stock for lenza org
-- ============================================================
-- ملاحظة: هذا تحديث بيانات آمن (data-only). بعد هذا الإصلاح، تُقرأ القيمة
--         دائمًا من company_settings وليس من اسم الشركة المُضمَّن في الكود.
-- Note : This is a safe data-only UPDATE. After this fix the value is always
--        read from company_settings — never from a hardcoded company name.
UPDATE public.company_settings
SET allow_negative_stock = true
WHERE organization_id IN (
    SELECT id FROM public.organizations
    WHERE name ILIKE '%لينزا%' OR name ILIKE '%lenza%'
);

-- ============================================================
-- الخطوة 3: ضبط الصلاحيات
-- Step  3: Permission hardening (GRANT / REVOKE)
-- ============================================================

-- منح الصلاحية للمستخدمين المصادق عليهم فقط
-- Grant EXECUTE only to authenticated users
GRANT EXECUTE ON FUNCTION public.approve_invoice(uuid, uuid, uuid) TO authenticated;

-- إلغاء منح anon و public صراحةً — يمنع أي وصول غير مصادق
-- Explicitly revoke from anon and public — prevents any unauthenticated access
REVOKE EXECUTE ON FUNCTION public.approve_invoice(uuid, uuid, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.approve_invoice(uuid, uuid, uuid) FROM public;

-- ============================================================
-- نهاية ملف الترحيل / End of migration file
-- ============================================================

-- =============================================================================
-- MIGRATION FILE: 2026-10-15_ultimate_security_shield.sql
-- نظام إدارة موارد المؤسسات • TriPro ERP — Enterprise Edition
-- الدرع الأمني الشامل وتحصين قاعدة البيانات ضد ثغرات الكونسول وتصعيد الصلاحيات
-- =============================================================================
-- التاريخ: 2026-10-15
-- الأولوية: 🔴 حرجة جداً (CRITICAL SECURITY HARDENING)
-- =============================================================================

-- #############################################################################
-- 1. سد الثغرة SEC-01: منع تصعيد الرتب وتعديل بيانات المنظمة ذاتياً عبر profiles
-- #############################################################################

CREATE OR REPLACE FUNCTION public.fn_guard_profile_role_tampering()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_caller_role TEXT;
    v_caller_id UUID := auth.uid();
BEGIN
    -- إذا كان التحديث يتم بواسطة service_role أو داخلياً بدون جلسة auth (مثل سكريبتات الخادم والهجرات)، نسمح به
    IF v_caller_id IS NULL THEN
        RETURN NEW;
    END IF;

    -- جلب رتبة المستخدم الذي يقوم بعملية التعديل
    SELECT role INTO v_caller_role FROM public.profiles WHERE id = v_caller_id;

    -- إذا حاول المستخدم تعديل رتبته أو منظمته أو حالة تفعيل الحساب وهو ليس super_admin
    IF (NEW.role IS DISTINCT FROM OLD.role 
        OR NEW.organization_id IS DISTINCT FROM OLD.organization_id 
        OR NEW.role_id IS DISTINCT FROM OLD.role_id
        OR NEW.is_active IS DISTINCT FROM OLD.is_active) THEN
        
        IF COALESCE(v_caller_role, '') NOT IN ('super_admin') THEN
            RAISE EXCEPTION 'TRIPRO_SECURITY_ALERT: غير مصرح لك بتعديل الرتبة أو المنظمة أو الصلاحيات الإدارية الخاصة بحسابك عبر كونسول المتصفح.';
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_profile_role_tampering ON public.profiles;
CREATE TRIGGER trg_guard_profile_role_tampering
BEFORE UPDATE ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.fn_guard_profile_role_tampering();

COMMENT ON FUNCTION public.fn_guard_profile_role_tampering() IS 'حارس أمني لمنع أي مستخدم عادي من رفع رتبته إلى super_admin أو تغيير منظمته';


-- #############################################################################
-- 2. سد الثغرة SEC-02: تحصين دالة منح الصلاحيات المباشرة sync_user_permissions
-- #############################################################################

CREATE OR REPLACE FUNCTION public.sync_user_permissions(
  p_user_id        uuid,
  p_permission_ids uuid[]
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_role TEXT;
  v_caller_id UUID := auth.uid();
BEGIN
  -- التحقق من هوية ورتبة المستدعي (يُشترط أن يكون super_admin أو admin)
  IF v_caller_id IS NOT NULL THEN
    SELECT role INTO v_caller_role FROM public.profiles WHERE id = v_caller_id;
    IF COALESCE(v_caller_role, '') NOT IN ('super_admin', 'admin') THEN
      RAISE EXCEPTION 'TRIPRO_SECURITY_ALERT: إدارة الصلاحيات المباشرة تقتصر على مدراء النظام المعتمدين فقط.';
    END IF;
  END IF;

  DELETE FROM public.user_permissions WHERE user_id = p_user_id;

  IF array_length(p_permission_ids, 1) > 0 THEN
    INSERT INTO public.user_permissions (user_id, permission_id, granted)
    SELECT p_user_id, unnest(p_permission_ids), true
    ON CONFLICT (user_id, permission_id) DO UPDATE SET granted = true;
  END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.sync_user_permissions(uuid, uuid[]) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.sync_user_permissions(uuid, uuid[]) TO authenticated, service_role;


-- #############################################################################
-- 3. سد الثغرة SEC-03: عزل المنشآت الصارم ومنع تسريب التقارير عبر باراميتر p_org_id
-- #############################################################################

CREATE OR REPLACE FUNCTION public.validate_tenant_access(p_target_org uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_my_org uuid;
    v_my_role text;
    v_caller_id uuid := auth.uid();
BEGIN
    -- إذا كان الاستدعاء داخلياً من خادم النظام
    IF v_caller_id IS NULL THEN
        RETURN p_target_org;
    END IF;

    v_my_org := public.get_my_org();
    SELECT role INTO v_my_role FROM public.profiles WHERE id = v_caller_id;

    -- السوبر أدمن فقط من يحق له استعراض أي منظمة
    IF v_my_role = 'super_admin' THEN
        RETURN COALESCE(p_target_org, v_my_org);
    END IF;

    -- رفض أي استعلام لمنظمة أخرى غير منظمة المستخدم المصادق عليها
    IF p_target_org IS NOT NULL AND p_target_org <> v_my_org THEN
        RAISE EXCEPTION 'TRIPRO_SECURITY_ALERT: تم رفض الوصول. لا تملك صلاحية استعراض بيانات أو تقارير مالية لمنشأة أخرى.';
    END IF;

    IF v_my_org IS NULL THEN
        RAISE EXCEPTION 'TRIPRO_SECURITY_ALERT: تعذر التحقق من المنظمة التابع لها حسابك.';
    END IF;

    RETURN v_my_org;
END;
$$;

-- تحديث دالة ميزان المراجعة لفرض التحقق من العزل الصارم
CREATE OR REPLACE FUNCTION public.get_trial_balance_rpc(
    p_org_id uuid DEFAULT NULL,
    p_start_date date DEFAULT CURRENT_DATE - INTERVAL '30 days',
    p_end_date date DEFAULT CURRENT_DATE
)
RETURNS TABLE (
    account_id uuid,
    account_code text,
    account_name text,
    account_type text,
    is_group boolean,
    parent_id uuid,
    opening_balance numeric,
    period_debit numeric,
    period_credit numeric,
    closing_balance numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_org_id uuid;
BEGIN
    -- تطبيق العزل التام وتأكيد ملكية البيانات
    v_org_id := public.validate_tenant_access(p_org_id);

    RETURN QUERY
    WITH tx AS (
        SELECT 
            jl.account_id,
            jl.debit,
            jl.credit,
            je.transaction_date
        FROM public.journal_lines jl
        JOIN public.journal_entries je ON jl.journal_entry_id = je.id
        WHERE je.status = 'posted'
          AND je.organization_id = v_org_id
          AND je.transaction_date <= p_end_date
    ),
    acc_summary AS (
        SELECT
            COALESCE(a.id, tx.account_id) AS acc_id,
            COALESCE(a.code, 'UNKNOWN') AS acc_code,
            COALESCE(a.name, 'حساب محذوف / غير معرف') AS acc_name,
            COALESCE(a.type, 'other') AS acc_type,
            COALESCE(a.is_group, false) AS acc_is_group,
            a.parent_id AS acc_parent_id,
            ROUND(COALESCE(SUM(CASE WHEN tx.transaction_date < p_start_date THEN tx.debit - tx.credit ELSE 0 END), 0), 4) AS op_bal,
            ROUND(COALESCE(SUM(CASE WHEN tx.transaction_date BETWEEN p_start_date AND p_end_date THEN tx.debit ELSE 0 END), 0), 4) AS per_deb,
            ROUND(COALESCE(SUM(CASE WHEN tx.transaction_date BETWEEN p_start_date AND p_end_date THEN tx.credit ELSE 0 END), 0), 4) AS per_crd,
            ROUND(COALESCE(SUM(tx.debit - tx.credit), 0), 4) AS cls_bal
        FROM public.accounts a
        FULL OUTER JOIN tx ON a.id = tx.account_id
        WHERE a.organization_id = v_org_id OR a.organization_id IS NULL
        GROUP BY a.id, a.code, a.name, a.type, a.is_group, a.parent_id, tx.account_id
    )
    SELECT
        acc_id,
        acc_code,
        acc_name,
        acc_type,
        acc_is_group,
        acc_parent_id,
        op_bal,
        per_deb,
        per_crd,
        cls_bal
    FROM acc_summary
    ORDER BY acc_code ASC;
END;
$$;


-- #############################################################################
-- 4. سد الثغرة SEC-04: سحب الصلاحيات من anon فوراً على دوال السندات والترحيل
-- #############################################################################

DO $$
BEGIN
    REVOKE EXECUTE ON FUNCTION public.approve_payment_voucher(uuid, uuid) FROM anon, public;
    REVOKE EXECUTE ON FUNCTION public.approve_receipt_voucher(uuid, uuid) FROM anon, public;
    REVOKE EXECUTE ON FUNCTION public.auto_reconcile_all_vouchers_with_gl(uuid) FROM anon, public;
    REVOKE EXECUTE ON FUNCTION public.recalculate_all_system_balances(uuid) FROM anon, public;

    GRANT EXECUTE ON FUNCTION public.approve_payment_voucher(uuid, uuid) TO authenticated, service_role;
    GRANT EXECUTE ON FUNCTION public.approve_receipt_voucher(uuid, uuid) TO authenticated, service_role;
    GRANT EXECUTE ON FUNCTION public.auto_reconcile_all_vouchers_with_gl(uuid) TO authenticated, service_role;
    GRANT EXECUTE ON FUNCTION public.recalculate_all_system_balances(uuid) TO authenticated, service_role;
EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE '⚠️ تم تجاوز بعض الدوال في حال عدم وجودها في هذه البيئة: %', SQLERRM;
END $$;


-- #############################################################################
-- 5. سد الثغرة SEC-05: حماية دوال إلغاء ترحيل الفواتير unpost_sales_invoice
-- #############################################################################

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
    -- أ. التحقق من وجود الفاتورة
    SELECT * INTO v_invoice FROM public.invoices WHERE id = p_invoice_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'فاتورة المبيعات غير موجودة (ID: %)', p_invoice_id;
    END IF;

    -- إذا كانت الفاتورة مسودة بالفعل، لا حاجة لإلغاء الترحيل
    IF v_invoice.status = 'draft' THEN
        RETURN true;
    END IF;

    -- 🛡️ التحقق الأمني من هوية ورتبة المستخدم المتصل
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
            -- النمط المؤسسي الصارم: إنشاء قيد عكسي متزن
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
            -- النمط المباشر: تحويل القيد لمسودة أولاً لتجاوز حراس منع الحذف
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

REVOKE EXECUTE ON FUNCTION public.unpost_sales_invoice(uuid, uuid) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.unpost_sales_invoice(uuid, uuid) TO authenticated, service_role;


-- حماية مماثلة لدالة إلغاء ترحيل فواتير المشتريات unpost_purchase_invoice
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
    SELECT * INTO v_invoice FROM public.purchase_invoices WHERE id = p_invoice_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'فاتورة المشتريات غير موجودة (ID: %)', p_invoice_id;
    END IF;

    IF v_invoice.status = 'draft' THEN
        RETURN true;
    END IF;

    -- 🛡️ التحقق الأمني من هوية ورتبة المستخدم المتصل
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

    v_org_id := COALESCE(p_org_id, v_invoice.organization_id);

    SELECT COALESCE(cancellation_mode, 'direct') INTO v_cancel_mode 
    FROM public.company_settings 
    WHERE organization_id = v_org_id LIMIT 1;
    v_cancel_mode := COALESCE(v_cancel_mode, 'direct');

    -- عكس أثر المخزون
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

    v_orig_journal_id := v_invoice.related_journal_entry_id;
    IF v_orig_journal_id IS NULL THEN
        SELECT id INTO v_orig_journal_id 
        FROM public.journal_entries 
        WHERE (related_document_id = p_invoice_id AND related_document_type = 'purchase_invoice')
           OR (reference = v_invoice.invoice_number AND (v_org_id IS NULL OR organization_id = v_org_id))
        ORDER BY created_at DESC
        LIMIT 1;
    END IF;

    UPDATE public.purchase_invoices
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
            UPDATE public.journal_entries 
            SET status = 'draft', is_posted = false 
            WHERE id = v_orig_journal_id;

            DELETE FROM public.journal_lines WHERE journal_entry_id = v_orig_journal_id;
            DELETE FROM public.journal_entries WHERE id = v_orig_journal_id;
        END IF;
    END IF;

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

REVOKE EXECUTE ON FUNCTION public.unpost_purchase_invoice(uuid, uuid) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.unpost_purchase_invoice(uuid, uuid) TO authenticated, service_role;

-- نهاية سكريبت التحصين الأمني الشامل

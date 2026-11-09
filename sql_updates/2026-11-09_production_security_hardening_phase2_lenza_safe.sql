-- =============================================================================
-- MIGRATION FILE: 2026-11-09_production_security_hardening_phase2_lenza_safe.sql
-- نظام تريبرو لإدارة الموارد المؤسسية (TriPro ERP - Enterprise Edition)
-- ترقيع الأمان المتقدم وسد ثغرات العزل والتفويض (Multi-Tenancy & Authorization Hardening)
-- =============================================================================
-- تاريخ الإنشاء : 2026-11-09
-- الأولوية      : حرجة جداً (CRITICAL - PRODUCTION SECURITY HARDENING)
-- التوافق       : متوافق 100% مع بيئة شركة لينزا وجميع المنشآت النشطة (Zero Downtime)
-- =============================================================================

-- #############################################################################
-- #############################################################################
-- 0. تعريف دالة التحقق الأمني لعزل المنشآت (validate_tenant_access)
-- #############################################################################
CREATE OR REPLACE FUNCTION public.validate_tenant_access(p_target_org uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $
DECLARE
    v_my_org uuid;
    v_my_role text;
    v_caller_id uuid := auth.uid();
BEGIN
    -- 1. إذا كان الاستدعاء داخلياً من خادم النظام / Service Role / Cron Trigger
    IF v_caller_id IS NULL THEN
        IF auth.role() = 'service_role' OR current_user IN ('postgres', 'service_role', 'supabase_admin') THEN
            RETURN p_target_org;
        END IF;
        RAISE EXCEPTION 'TRIPRO_SECURITY_ALERT: تم رفض الوصول. يجب تسجيل الدخول للوصول إلى بيانات المنشأة.';
    END IF;

    -- 2. جلب منظمة ورتبة المستخدم المصادق عليه
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
$;

-- 1. تحصين دالة حذف المنشآت بالكامل ومنع أي أدمن من حذف شركات أخرى (SEC-01)
-- #############################################################################
-- الهدف: حصر حذف أي منشأة في super_admin فقط، مع وضع درع دائم لحماية شركة لينزا
-- وحرمان anon و public من أي إمكانية لاستدعاء الدالة.

CREATE OR REPLACE FUNCTION public.fn_delete_organization_safe(p_org_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
    v_tables text[] := ARRAY[
        'notification_audit_log', 'cheque_attachments', 'receipt_voucher_attachments', 
        'payment_voucher_attachments', 'journal_attachments', 'notification_preferences', 
        'security_logs', 'audit_logs', 'organization_backups',
        'mfg_step_materials', 'mfg_step_attachments', 'mfg_production_order_materials', 
        'mfg_production_order_steps', 'mfg_scrap_records', 'mfg_qc_inspections',
        'mfg_production_orders', 'mfg_routings', 'mfg_work_centers',
        'order_item_modifiers', 'order_items', 'kitchen_orders', 'orders', 
        'table_sessions', 'shifts', 'restaurant_tables', 'modifiers', 'modifier_groups',
        'stadium_court_pricing', 'stadium_subscriptions', 'stadium_bookings', 'stadium_academy_trainees',
        'stadium_courts', 'stadium_members', 'stadium_academies',
        'construction_boq_items', 'construction_progress_billings', 'construction_subcontracts', 'construction_projects',
        'hims_prescription_items', 'hims_invoice_items', 'hims_lab_order_items', 'hims_radiology_order_items',
        'hims_vital_signs', 'hims_visits', 'hims_inpatient_admissions', 'hims_appointments',
        'hims_patients', 'hims_doctors', 'hims_departments', 'hims_rooms', 'hims_beds',
        'invoice_items', 'purchase_invoice_items', 'sales_return_items', 'purchase_return_items', 
        'stock_adjustment_items', 'payroll_variables', 'payroll_items', 'journal_lines',
        'delivery_orders', 'payments', 'invoices', 'purchase_invoices', 'sales_returns', 'purchase_returns', 
        'journal_entries', 'payrolls', 'stock_adjustments', 'cheques', 'receipt_vouchers', 'payment_vouchers', 
        'work_orders', 'bill_of_materials', 'credit_notes', 'debit_notes', 'promotions', 'retail_promotions',
        'opening_inventories',
        'assets', 'products', 'customers', 'suppliers', 'employees', 'accounts', 
        'cost_centers', 'warehouses', 'invitations', 'budgets', 'company_settings'
    ];
    v_t text;
    v_dyn RECORD;
    v_caller_role text;
BEGIN
    -- 1. التحقق من المدخلات
    IF p_org_id IS NULL THEN
        RAISE EXCEPTION 'TRIPRO_SECURITY_ALERT: معرف المنظمة المطلوب حذفها غير صالح أو فارغ.';
    END IF;

    -- 2. 🛡️ التحقق الصارم من الصلاحية: super_admin حصراً
    v_caller_role := COALESCE(public.get_my_role(), auth.jwt() ->> 'role', '');
    IF v_caller_role <> 'super_admin' AND auth.role() <> 'service_role' THEN
        RAISE EXCEPTION 'TRIPRO_SECURITY_ALERT: عملية محظورة. صلاحية حذف المنشآت مقتصرة حصرياً على الإدارة العليا للنظام (Super Admin).';
    END IF;

    -- 3. 🛡️ درع الأمان الدائم لحماية شركة لينزا (Lenza Production Shield)
    IF EXISTS (
        SELECT 1 FROM public.organizations 
        WHERE id = p_org_id AND (name ILIKE '%لينزا%' OR name ILIKE '%lenza%')
    ) THEN
        RAISE EXCEPTION 'TRIPRO_SECURITY_ALERT: شركة حلواني لينزا محمية بشكل دائم ومطلق ضد الحذف (Production Critical Tenant Protected).';
    END IF;

    -- 4. تفعيل وضع التجاوز (Restore Mode) لتعطيل موانع الحذف التابعة للقيود
    PERFORM set_config('app.restore_mode', 'on', true);

    -- 5. فك ارتباط المستخدمين بالمنظمة في جدول profiles
    BEGIN
        UPDATE public.profiles 
        SET organization_id = NULL 
        WHERE organization_id = p_org_id;
    EXCEPTION WHEN OTHERS THEN NULL; END;

    -- 6. حذف صلاحيات وأدوار المنظمة
    BEGIN
        DELETE FROM public.role_permissions WHERE organization_id = p_org_id;
        DELETE FROM public.roles WHERE organization_id = p_org_id;
    EXCEPTION WHEN OTHERS THEN NULL; END;

    -- 7. المسح المتسلسل لكافة الجداول المعروفة
    FOREACH v_t IN ARRAY v_tables
    LOOP
        BEGIN
            EXECUTE format('DELETE FROM public.%I WHERE organization_id = %L', v_t, p_org_id);
        EXCEPTION WHEN OTHERS THEN NULL; END;
    END LOOP;

    -- 8. شبكة الأمان الديناميكية: فحص وحذف أي جدول مرتبط بمفتاح أجنبي
    FOR v_dyn IN (
        SELECT DISTINCT
            c.conrelid::regclass::text AS tbl,
            a.attname AS col
        FROM pg_constraint c
        JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY(c.conkey)
        WHERE c.confrelid = 'public.organizations'::regclass
          AND c.contype = 'f'
          AND c.conrelid::regclass::text NOT IN ('public.organizations', 'public.profiles')
    ) LOOP
        BEGIN
            EXECUTE format('DELETE FROM %s WHERE %I = %L', v_dyn.tbl, v_dyn.col, p_org_id);
        EXCEPTION WHEN OTHERS THEN NULL; END;
    END LOOP;

    -- 9. حذف سجل المنظمة نهائياً
    DELETE FROM public.organizations WHERE id = p_org_id;

    -- 10. إعادة وضع الحماية الطبيعي
    PERFORM set_config('app.restore_mode', 'off', true);

END; 
$function$;

REVOKE EXECUTE ON FUNCTION public.fn_delete_organization_safe(uuid) FROM anon, public;
GRANT  EXECUTE ON FUNCTION public.fn_delete_organization_safe(uuid) TO authenticated, service_role;


-- #############################################################################
-- 2. تحصين دالة قائمة أرصدة العملاء وفرض validate_tenant_access (SEC-02)
-- #############################################################################
CREATE OR REPLACE FUNCTION public.get_all_customer_balances_fast(
    p_org_id uuid,
    p_search text DEFAULT NULL,
    p_limit int DEFAULT 1000,
    p_offset int DEFAULT 0
)
RETURNS TABLE (
    customer_id uuid,
    customer_name text,
    phone text,
    tax_number text,
    opening_balance numeric,
    total_sales numeric,
    balance numeric,
    last_invoice text,
    total_count bigint,
    pricing_tier text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
#variable_conflict use_column
DECLARE
    v_search text;
    v_total_rows bigint;
BEGIN
    -- 🛡️ التحقق الأمني الصارم من عزل المنشأة
    p_org_id := public.validate_tenant_access(p_org_id);
    v_search := NULLIF(TRIM(p_search), '');

    SELECT COUNT(*) INTO v_total_rows
    FROM public.customers c
    WHERE c.organization_id = p_org_id
      AND c.deleted_at IS NULL
      AND (
          v_search IS NULL
          OR c.name ILIKE '%' || v_search || '%'
          OR c.phone ILIKE '%' || v_search || '%'
          OR c.tax_number ILIKE '%' || v_search || '%'
      );

    RETURN QUERY
    WITH 
    customer_accounts AS (
        SELECT a.id AS account_id
        FROM public.accounts a
        WHERE (a.organization_id = p_org_id OR a.organization_id IS NULL)
          AND (
              a.code = '1221' 
              OR a.code LIKE '1221%' 
              OR (
                  (a.name ILIKE '%العملاء%' OR a.name ILIKE '%عملاء%')
                  AND a.name NOT ILIKE '%أوراق%'
                  AND a.name NOT ILIKE '%اوراق%'
                  AND a.code NOT LIKE '1222%'
                  AND a.code != '122'
              )
          )
    ),
    entry_to_customer AS (
        SELECT i.related_journal_entry_id AS je_id, i.customer_id
        FROM public.invoices i
        WHERE i.organization_id = p_org_id AND i.related_journal_entry_id IS NOT NULL AND i.customer_id IS NOT NULL
        UNION ALL
        SELECT ppb.related_journal_entry_id AS je_id, p.customer_id
        FROM public.project_progress_billings ppb
        JOIN public.projects p ON p.id = ppb.project_id
        WHERE ppb.organization_id = p_org_id AND ppb.related_journal_entry_id IS NOT NULL AND p.customer_id IS NOT NULL
        UNION ALL
        SELECT rv.related_journal_entry_id AS je_id, rv.customer_id
        FROM public.receipt_vouchers rv
        WHERE rv.organization_id = p_org_id AND rv.related_journal_entry_id IS NOT NULL AND rv.customer_id IS NOT NULL
        UNION ALL
        SELECT ch.related_journal_entry_id AS je_id, ch.party_id AS customer_id
        FROM public.cheques ch
        WHERE ch.organization_id = p_org_id AND ch.related_journal_entry_id IS NOT NULL AND ch.party_id IS NOT NULL
        UNION ALL
        SELECT ch.related_journal_entry_id AS je_id, c.id AS customer_id
        FROM public.cheques ch
        JOIN public.customers c 
          ON c.organization_id = p_org_id 
         AND (
             ch.party_name ILIKE '%' || TRIM(c.name) || '%' 
             OR TRIM(c.name) ILIKE '%' || TRIM(ch.party_name) || '%'
         )
        WHERE ch.organization_id = p_org_id AND ch.related_journal_entry_id IS NOT NULL AND (ch.party_id IS NULL OR ch.party_id != c.id)
        UNION ALL
        SELECT cn.related_journal_entry_id AS je_id, cn.customer_id
        FROM public.credit_notes cn
        WHERE cn.organization_id = p_org_id AND cn.related_journal_entry_id IS NOT NULL AND cn.customer_id IS NOT NULL
        UNION ALL
        SELECT sr.related_journal_entry_id AS je_id, sr.customer_id
        FROM public.sales_returns sr
        WHERE sr.organization_id = p_org_id AND sr.related_journal_entry_id IS NOT NULL AND sr.customer_id IS NOT NULL
        UNION ALL
        SELECT o.related_journal_entry_id AS je_id, o.customer_id
        FROM public.orders o
        WHERE o.organization_id = p_org_id AND o.related_journal_entry_id IS NOT NULL AND o.customer_id IS NOT NULL
    ),
    manual_entries AS (
        SELECT je.id AS je_id, c.id AS customer_id
        FROM public.customers c
        JOIN public.journal_entries je 
          ON (je.organization_id = p_org_id OR je.organization_id IS NULL)
         AND (je.status IS NULL OR je.status NOT IN ('cancelled', 'rejected'))
         AND (
             je.description ILIKE '%' || TRIM(c.name) || '%'
             OR je.reference ILIKE '%' || TRIM(c.name) || '%'
             OR je.reference ILIKE '%OP-CUST-' || c.id::text || '%'
             OR je.reference ILIKE '%OB-' || c.id::text || '%'
         )
        WHERE c.organization_id = p_org_id
          AND c.deleted_at IS NULL
          AND c.name IS NOT NULL
          AND LENGTH(TRIM(c.name)) > 1
    ),
    all_customer_entries AS (
        SELECT DISTINCT combined.je_id, combined.customer_id FROM (
            SELECT etc.je_id, etc.customer_id FROM entry_to_customer etc
            UNION ALL
            SELECT me.je_id, me.customer_id FROM manual_entries me
        ) combined
    ),
    ledger_balances AS (
        SELECT 
            ace.customer_id,
            COALESCE(SUM(jl.debit), 0) - COALESCE(SUM(jl.credit), 0) AS net_balance
        FROM all_customer_entries ace
        JOIN public.journal_lines jl 
          ON jl.journal_entry_id = ace.je_id
         AND jl.account_id IN (SELECT ca.account_id FROM customer_accounts ca)
        JOIN public.journal_entries je
          ON je.id = ace.je_id
         AND (je.status IS NULL OR je.status NOT IN ('cancelled', 'rejected'))
        GROUP BY ace.customer_id
    ),
    opening_check AS (
        SELECT 
            ace.customer_id,
            COUNT(*) FILTER (
                WHERE je.description ILIKE '%رصيد افتتاحي%' 
                   OR je.reference ILIKE 'OP-%' 
                   OR je.reference ILIKE 'OB-%'
                   OR je.related_document_type = 'opening_balance'
            ) AS op_count
        FROM all_customer_entries ace
        JOIN public.journal_entries je ON je.id = ace.je_id
        GROUP BY ace.customer_id
    ),
    unposted_orders AS (
        SELECT o.customer_id, COALESCE(SUM(o.grand_total), 0) AS unposted_total
        FROM public.orders o
        WHERE o.organization_id = p_org_id
          AND o.related_journal_entry_id IS NULL
          AND o.status != 'CANCELLED'
          AND o.customer_id IS NOT NULL
        GROUP BY o.customer_id
    ),
    agg_invoices AS (
        SELECT 
            si.customer_id,
            COALESCE(SUM(si.total_amount), 0) AS gross_sales,
            MAX(si.invoice_date::text) AS max_inv_date
        FROM public.invoices si
        WHERE si.organization_id = p_org_id
          AND si.customer_id IS NOT NULL
          AND si.status NOT IN ('draft', 'cancelled')
        GROUP BY si.customer_id
    )
    SELECT 
        c.id AS customer_id,
        c.name::text AS customer_name,
        COALESCE(c.phone, '')::text AS phone,
        COALESCE(c.tax_number, '')::text AS tax_number,
        COALESCE(c.opening_balance, 0)::numeric AS opening_balance,
        COALESCE(inv.gross_sales, 0)::numeric AS total_sales,
        ROUND(
            COALESCE(lb.net_balance, 0) + 
            CASE WHEN COALESCE(oc.op_count, 0) > 0 THEN 0 ELSE COALESCE(c.opening_balance, 0) END +
            COALESCE(uo.unposted_total, 0)
        , 2)::numeric AS balance,
        inv.max_inv_date AS last_invoice,
        v_total_rows AS total_count,
        COALESCE(c.pricing_tier, 'retail')::text AS pricing_tier
    FROM public.customers c
    LEFT JOIN ledger_balances lb ON lb.customer_id = c.id
    LEFT JOIN opening_check oc ON oc.customer_id = c.id
    LEFT JOIN unposted_orders uo ON uo.customer_id = c.id
    LEFT JOIN agg_invoices inv ON inv.customer_id = c.id
    WHERE c.organization_id = p_org_id
      AND c.deleted_at IS NULL
      AND (
          v_search IS NULL
          OR c.name ILIKE '%' || v_search || '%'
          OR c.phone ILIKE '%' || v_search || '%'
          OR c.tax_number ILIKE '%' || v_search || '%'
      )
    ORDER BY c.name ASC
    LIMIT p_limit
    OFFSET p_offset;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_all_customer_balances_fast(uuid, text, int, int) FROM anon, public;
GRANT  EXECUTE ON FUNCTION public.get_all_customer_balances_fast(uuid, text, int, int) TO authenticated, service_role;


-- #############################################################################
-- 3. تحصين دالة قائمة أرصدة الموردين وفرض validate_tenant_access (SEC-03)
-- #############################################################################
CREATE OR REPLACE FUNCTION public.get_all_supplier_balances_fast(
    p_org_id uuid,
    p_search text DEFAULT NULL,
    p_limit int DEFAULT 1000,
    p_offset int DEFAULT 0
)
RETURNS TABLE (
    supplier_id uuid,
    supplier_name text,
    phone text,
    tax_number text,
    opening_balance numeric,
    total_purchases numeric,
    balance numeric,
    last_invoice text,
    total_count bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
#variable_conflict use_column
DECLARE
    v_search text;
    v_total_rows bigint;
BEGIN
    -- 🛡️ التحقق الأمني الصارم من عزل المنشأة
    p_org_id := public.validate_tenant_access(p_org_id);
    v_search := NULLIF(TRIM(p_search), '');

    SELECT COUNT(*) INTO v_total_rows
    FROM public.suppliers s
    WHERE s.organization_id = p_org_id
      AND s.deleted_at IS NULL
      AND (
          v_search IS NULL
          OR s.name ILIKE '%' || v_search || '%'
          OR s.phone ILIKE '%' || v_search || '%'
          OR s.tax_number ILIKE '%' || v_search || '%'
      );

    RETURN QUERY
    WITH 
    supplier_accounts AS (
        SELECT a.id AS account_id
        FROM public.accounts a
        WHERE (a.organization_id = p_org_id OR a.organization_id IS NULL)
          AND (
              a.code = '201' 
              OR a.code LIKE '201%' 
              OR a.code = '2101'
              OR a.code LIKE '2101%'
              OR a.code = '221'
              OR a.code LIKE '221%'
              OR (
                  (a.name ILIKE '%الموردين%' OR a.name ILIKE '%موردين%')
                  AND a.name NOT ILIKE '%أوراق%'
                  AND a.name NOT ILIKE '%اوراق%'
                  AND a.code NOT LIKE '202%'
                  AND a.code != '20'
              )
          )
    ),
    agg_invoices AS (
        SELECT 
            pi.supplier_id,
            COALESCE(SUM(pi.total_amount), 0) AS gross_purchases,
            COALESCE(SUM(
                pi.total_amount - GREATEST(0, COALESCE(pi.paid_amount, 0) - COALESCE((
                    SELECT SUM(pv.amount) 
                    FROM public.payment_vouchers pv 
                    WHERE pv.supplier_id = pi.supplier_id 
                      AND pi.invoice_number IS NOT NULL
                      AND pv.notes ILIKE '%' || pi.invoice_number || '%'
                ), 0))
            ), 0) AS total_invoiced,
            MAX(pi.invoice_date::text) AS max_inv_date
        FROM public.purchase_invoices pi
        WHERE pi.organization_id = p_org_id
          AND pi.supplier_id IS NOT NULL
          AND pi.status != 'draft'
        GROUP BY pi.supplier_id
    ),
    agg_payments AS (
        SELECT 
            pv.supplier_id,
            COALESCE(SUM(pv.amount), 0) AS total_payments
        FROM public.payment_vouchers pv
        WHERE pv.organization_id = p_org_id
          AND pv.supplier_id IS NOT NULL
          AND pv.deleted_at IS NULL
          AND (pv.status IS NULL OR pv.status NOT IN ('rejected', 'cancelled', 'draft', 'pending_approval'))
          AND (pv.notes IS NULL OR (pv.notes NOT ILIKE '[مرفوض%' AND pv.notes NOT ILIKE '[معلق للاعتماد%'))
        GROUP BY pv.supplier_id
    ),
    agg_cheques AS (
        SELECT 
            ch.party_id AS supplier_id,
            COALESCE(SUM(ch.amount), 0) AS total_cheques
        FROM public.cheques ch
        WHERE ch.organization_id = p_org_id
          AND ch.party_id IS NOT NULL
          AND ch.type = 'outgoing'
          AND ch.status NOT IN ('rejected', 'cancelled')
        GROUP BY ch.party_id
    ),
    agg_returns AS (
        SELECT 
            pr.supplier_id,
            COALESCE(SUM(pr.total_amount), 0) AS total_returns
        FROM public.purchase_returns pr
        WHERE pr.organization_id = p_org_id
          AND pr.supplier_id IS NOT NULL
          AND pr.status != 'draft'
        GROUP BY pr.supplier_id
    ),
    agg_debit_notes AS (
        SELECT 
            dn.supplier_id,
            COALESCE(SUM(dn.total_amount), 0) AS total_debit_notes
        FROM public.debit_notes dn
        WHERE dn.organization_id = p_org_id
          AND dn.supplier_id IS NOT NULL
          AND dn.status = 'posted'
        GROUP BY dn.supplier_id
    ),
    manual_entries AS (
        SELECT 
            s.id AS supplier_id,
            COALESCE(SUM(jl.credit), 0) - COALESCE(SUM(jl.debit), 0) AS manual_balance
        FROM public.suppliers s
        JOIN public.journal_entries je 
          ON (je.organization_id = p_org_id OR je.organization_id IS NULL)
         AND je.status = 'posted'
         AND je.is_posted = true
         AND (
             (je.description ILIKE '%' || TRIM(s.name) || '%' AND LENGTH(TRIM(s.name)) > 1)
             OR (je.reference ILIKE '%' || s.id::text || '%')
         )
         AND (je.reference IS NULL OR (
             je.reference NOT LIKE 'PINV-%' AND 
             je.reference NOT LIKE 'PUR-%' AND 
             je.reference NOT LIKE 'PV-%' AND 
             je.reference NOT LIKE 'PR-%' AND 
             je.reference NOT LIKE 'DN-%' AND 
             je.reference NOT LIKE 'CHQ-%' AND 
             je.reference NOT LIKE 'OP-%' AND 
             je.reference NOT LIKE 'OB-%'
         ))
        JOIN public.journal_lines jl 
          ON jl.journal_entry_id = je.id
         AND jl.account_id IN (SELECT sa.account_id FROM supplier_accounts sa)
        WHERE s.organization_id = p_org_id
          AND s.deleted_at IS NULL
        GROUP BY s.id
    )
    SELECT 
        s.id AS supplier_id,
        s.name::text AS supplier_name,
        COALESCE(s.phone, '')::text AS phone,
        COALESCE(s.tax_number, '')::text AS tax_number,
        COALESCE(s.opening_balance, 0)::numeric AS opening_balance,
        COALESCE(inv.gross_purchases, 0)::numeric AS total_purchases,
        ROUND(
            (COALESCE(s.opening_balance, 0) + COALESCE(inv.total_invoiced, 0) + COALESCE(me.manual_balance, 0))
            - (COALESCE(pay.total_payments, 0) + COALESCE(chq.total_cheques, 0) + COALESCE(ret.total_returns, 0) + COALESCE(dn.total_debit_notes, 0))
        , 2)::numeric AS balance,
        inv.max_inv_date AS last_invoice,
        v_total_rows AS total_count
    FROM public.suppliers s
    LEFT JOIN agg_invoices inv ON inv.supplier_id = s.id
    LEFT JOIN agg_payments pay ON pay.supplier_id = s.id
    LEFT JOIN agg_cheques chq ON chq.supplier_id = s.id
    LEFT JOIN agg_returns ret ON ret.supplier_id = s.id
    LEFT JOIN agg_debit_notes dn ON dn.supplier_id = s.id
    LEFT JOIN manual_entries me ON me.supplier_id = s.id
    WHERE s.organization_id = p_org_id
      AND s.deleted_at IS NULL
      AND (
          v_search IS NULL
          OR s.name ILIKE '%' || v_search || '%'
          OR s.phone ILIKE '%' || v_search || '%'
          OR s.tax_number ILIKE '%' || v_search || '%'
      )
    ORDER BY s.name ASC
    LIMIT p_limit
    OFFSET p_offset;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_all_supplier_balances_fast(uuid, text, int, int) FROM anon, public;
GRANT  EXECUTE ON FUNCTION public.get_all_supplier_balances_fast(uuid, text, int, int) TO authenticated, service_role;


-- #############################################################################
-- 4. تحصين دوال أعمار ديون العملاء والموردين المباشرة (SEC-04)
-- #############################################################################
CREATE OR REPLACE FUNCTION public.get_customer_aging_ledger(p_org_id uuid)
RETURNS TABLE (
    customer_id   uuid,
    customer_name text,
    phone         text,
    range_0_30    numeric,
    range_31_60   numeric,
    range_61_90   numeric,
    range_90_plus numeric,
    total_balance numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
#variable_conflict use_column
BEGIN
    p_org_id := public.validate_tenant_access(p_org_id);

    RETURN QUERY
    WITH
    customer_accounts AS (
        SELECT a.id AS account_id
        FROM public.accounts a
        WHERE (a.organization_id = p_org_id OR a.organization_id IS NULL)
          AND (
              a.code = '1221' 
              OR a.code LIKE '1221%' 
              OR (
                  (a.name ILIKE '%العملاء%' OR a.name ILIKE '%عملاء%')
                  AND a.name NOT ILIKE '%أوراق%'
                  AND a.name NOT ILIKE '%اوراق%'
                  AND a.code NOT LIKE '1222%'
                  AND a.code != '122'
              )
          )
    ),
    entry_to_customer AS (
        SELECT i.related_journal_entry_id AS je_id, i.customer_id
        FROM public.invoices i
        WHERE i.organization_id = p_org_id 
          AND i.related_journal_entry_id IS NOT NULL 
          AND i.customer_id IS NOT NULL
        UNION ALL
        SELECT ppb.related_journal_entry_id AS je_id, p.customer_id
        FROM public.project_progress_billings ppb
        JOIN public.projects p ON p.id = ppb.project_id
        WHERE ppb.organization_id = p_org_id 
          AND ppb.related_journal_entry_id IS NOT NULL 
          AND p.customer_id IS NOT NULL
        UNION ALL
        SELECT rv.related_journal_entry_id AS je_id, rv.customer_id
        FROM public.receipt_vouchers rv
        WHERE rv.organization_id = p_org_id 
          AND rv.related_journal_entry_id IS NOT NULL 
          AND rv.customer_id IS NOT NULL
        UNION ALL
        SELECT ch.related_journal_entry_id AS je_id, ch.party_id AS customer_id
        FROM public.cheques ch
        WHERE ch.organization_id = p_org_id 
          AND ch.related_journal_entry_id IS NOT NULL 
          AND ch.party_id IS NOT NULL
        UNION ALL
        SELECT ch.related_journal_entry_id AS je_id, c.id AS customer_id
        FROM public.cheques ch
        JOIN public.customers c 
          ON c.organization_id = p_org_id 
         AND (
             ch.party_name ILIKE '%' || TRIM(c.name) || '%'
             OR TRIM(c.name) ILIKE '%' || TRIM(ch.party_name) || '%'
         )
        WHERE ch.organization_id = p_org_id 
          AND ch.related_journal_entry_id IS NOT NULL 
          AND (ch.party_id IS NULL OR ch.party_id != c.id)
          AND c.name IS NOT NULL 
          AND LENGTH(TRIM(c.name)) > 1
        UNION ALL
        SELECT cn.related_journal_entry_id AS je_id, cn.customer_id
        FROM public.credit_notes cn
        WHERE cn.organization_id = p_org_id 
          AND cn.related_journal_entry_id IS NOT NULL 
          AND cn.customer_id IS NOT NULL
        UNION ALL
        SELECT sr.related_journal_entry_id AS je_id, sr.customer_id
        FROM public.sales_returns sr
        WHERE sr.organization_id = p_org_id 
          AND sr.related_journal_entry_id IS NOT NULL 
          AND sr.customer_id IS NOT NULL
        UNION ALL
        SELECT o.related_journal_entry_id AS je_id, o.customer_id
        FROM public.orders o
        WHERE o.organization_id = p_org_id 
          AND o.related_journal_entry_id IS NOT NULL 
          AND o.customer_id IS NOT NULL
    ),
    manual_entries AS (
        SELECT je.id AS je_id, c.id AS customer_id
        FROM public.customers c
        JOIN public.journal_entries je 
          ON (je.organization_id = p_org_id OR je.organization_id IS NULL)
         AND (je.status IS NULL OR je.status NOT IN ('cancelled', 'rejected'))
         AND (
             je.description ILIKE '%' || TRIM(c.name) || '%'
             OR je.reference ILIKE '%' || TRIM(c.name) || '%'
             OR je.reference ILIKE '%OP-CUST-' || c.id::text || '%'
             OR je.reference ILIKE '%OB-' || c.id::text || '%'
         )
        WHERE c.organization_id = p_org_id
          AND c.deleted_at IS NULL
          AND c.name IS NOT NULL
          AND LENGTH(TRIM(c.name)) > 1
    ),
    all_customer_entries AS (
        SELECT DISTINCT combined.je_id, combined.customer_id FROM (
            SELECT etc.je_id, etc.customer_id FROM entry_to_customer etc
            UNION ALL
            SELECT me.je_id, me.customer_id FROM manual_entries me
        ) combined
    ),
    ledger_balances AS (
        SELECT 
            ace.customer_id,
            COALESCE(SUM(jl.debit), 0) - COALESCE(SUM(jl.credit), 0) AS net_balance
        FROM all_customer_entries ace
        JOIN public.journal_lines jl 
          ON jl.journal_entry_id = ace.je_id
         AND jl.account_id IN (SELECT ca.account_id FROM customer_accounts ca)
        JOIN public.journal_entries je
          ON je.id = ace.je_id
         AND (je.status IS NULL OR je.status NOT IN ('cancelled', 'rejected'))
        GROUP BY ace.customer_id
    ),
    opening_check AS (
        SELECT 
            ace.customer_id,
            COUNT(*) FILTER (
                WHERE je.description ILIKE '%رصيد افتتاحي%' 
                   OR je.reference ILIKE 'OP-%' 
                   OR je.reference ILIKE 'OB-%'
                   OR je.related_document_type = 'opening_balance'
            ) AS op_count
        FROM all_customer_entries ace
        JOIN public.journal_entries je ON je.id = ace.je_id
        GROUP BY ace.customer_id
    ),
    unposted_orders AS (
        SELECT o.customer_id, COALESCE(SUM(o.grand_total), 0) AS unposted_total
        FROM public.orders o
        WHERE o.organization_id = p_org_id
          AND o.related_journal_entry_id IS NULL
          AND o.status != 'CANCELLED'
          AND o.customer_id IS NOT NULL
        GROUP BY o.customer_id
    ),
    true_balances AS (
        SELECT 
            c.id AS customer_id,
            c.name::text AS customer_name,
            COALESCE(c.phone, '')::text AS phone,
            ROUND(
                COALESCE(lb.net_balance, 0) + 
                CASE WHEN COALESCE(oc.op_count, 0) > 0 THEN 0 ELSE COALESCE(c.opening_balance, 0) END +
                COALESCE(uo.unposted_total, 0)
            , 2) AS real_balance,
            CASE WHEN COALESCE(oc.op_count, 0) > 0 THEN 0 ELSE COALESCE(c.opening_balance, 0) END AS raw_opening
        FROM public.customers c
        LEFT JOIN ledger_balances lb ON lb.customer_id = c.id
        LEFT JOIN opening_check oc ON oc.customer_id = c.id
        LEFT JOIN unposted_orders uo ON uo.customer_id = c.id
        WHERE c.organization_id = p_org_id
          AND c.deleted_at IS NULL
    ),
    inv_items AS (
        SELECT 
            si.customer_id,
            (CURRENT_DATE - si.invoice_date::date) AS age_days,
            GREATEST(0::numeric, si.total_amount) AS amount
        FROM public.invoices si
        WHERE si.organization_id = p_org_id
          AND si.customer_id IS NOT NULL
          AND si.status NOT IN ('draft', 'cancelled')
    ),
    billing_items AS (
        SELECT 
            p.customer_id,
            (CURRENT_DATE - ppb.billing_date::date) AS age_days,
            GREATEST(0::numeric, ppb.net_amount) AS amount
        FROM public.project_progress_billings ppb
        JOIN public.projects p ON p.id = ppb.project_id
        WHERE ppb.organization_id = p_org_id
          AND p.customer_id IS NOT NULL
          AND ppb.status != 'draft'
    ),
    all_debit_items AS (
        SELECT ii.customer_id, ii.age_days, ii.amount FROM inv_items ii
        UNION ALL
        SELECT bi.customer_id, bi.age_days, bi.amount FROM billing_items bi
    ),
    debit_buckets AS (
        SELECT 
            di.customer_id,
            COALESCE(SUM(CASE WHEN di.age_days <= 30 THEN di.amount ELSE 0 END), 0) AS b_0_30,
            COALESCE(SUM(CASE WHEN di.age_days BETWEEN 31 AND 60 THEN di.amount ELSE 0 END), 0) AS b_31_60,
            COALESCE(SUM(CASE WHEN di.age_days BETWEEN 61 AND 90 THEN di.amount ELSE 0 END), 0) AS b_61_90,
            COALESCE(SUM(CASE WHEN di.age_days > 90 THEN di.amount ELSE 0 END), 0) AS b_90_plus,
            COALESCE(SUM(di.amount), 0) AS total_deb
        FROM all_debit_items di
        GROUP BY di.customer_id
    ),
    final_merged AS (
        SELECT 
            tb.customer_id,
            tb.customer_name,
            tb.phone,
            tb.real_balance,
            COALESCE(db.b_0_30, 0) AS raw_0_30,
            COALESCE(db.b_31_60, 0) AS raw_31_60,
            COALESCE(db.b_61_90, 0) AS raw_61_90,
            (COALESCE(db.b_90_plus, 0) + tb.raw_opening) AS raw_90_plus,
            (COALESCE(db.total_deb, 0) + tb.raw_opening) AS total_gross
        FROM true_balances tb
        LEFT JOIN debit_buckets db ON db.customer_id = tb.customer_id
        WHERE tb.real_balance > 0.01
    ),
    scaled AS (
        SELECT 
            fm.customer_id,
            fm.customer_name,
            fm.phone,
            fm.real_balance AS total_balance,
            CASE 
                WHEN fm.total_gross > 0 THEN ROUND(GREATEST(0::numeric, fm.raw_0_30 * LEAST(1::numeric, fm.real_balance / fm.total_gross)), 2)
                ELSE 0::numeric 
            END AS r_0_30,
            CASE 
                WHEN fm.total_gross > 0 THEN ROUND(GREATEST(0::numeric, fm.raw_31_60 * LEAST(1::numeric, fm.real_balance / fm.total_gross)), 2)
                ELSE 0::numeric 
            END AS r_31_60,
            CASE 
                WHEN fm.total_gross > 0 THEN ROUND(GREATEST(0::numeric, fm.raw_61_90 * LEAST(1::numeric, fm.real_balance / fm.total_gross)), 2)
                ELSE 0::numeric 
            END AS r_61_90
        FROM final_merged fm
    )
    SELECT 
        s.customer_id,
        s.customer_name,
        s.phone,
        s.r_0_30 AS range_0_30,
        s.r_31_60 AS range_31_60,
        s.r_61_90 AS range_61_90,
        GREATEST(0::numeric, ROUND(s.total_balance - s.r_0_30 - s.r_31_60 - s.r_61_90, 2)) AS range_90_plus,
        s.total_balance
    FROM scaled s
    ORDER BY s.total_balance DESC;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_customer_aging_ledger(uuid) FROM anon, public;
GRANT  EXECUTE ON FUNCTION public.get_customer_aging_ledger(uuid) TO authenticated, service_role;


CREATE OR REPLACE FUNCTION public.get_supplier_aging_ledger(p_org_id uuid DEFAULT NULL)
RETURNS TABLE (
    supplier_id   uuid,
    supplier_name text,
    phone         text,
    range_0_30    numeric,
    range_31_60   numeric,
    range_61_90   numeric,
    range_90_plus numeric,
    total_balance numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
#variable_conflict use_column
BEGIN
    p_org_id := public.validate_tenant_access(p_org_id);

    RETURN QUERY
    WITH
    supplier_accounts AS (
        SELECT a.id AS account_id
        FROM public.accounts a
        WHERE (a.organization_id = p_org_id OR a.organization_id IS NULL)
          AND (
              a.code = '201' 
              OR a.code LIKE '201%' 
              OR a.code = '2101'
              OR a.code LIKE '2101%'
              OR (
                  (a.name ILIKE '%الموردين%' OR a.name ILIKE '%موردين%')
                  AND a.name NOT ILIKE '%أوراق%'
                  AND a.name NOT ILIKE '%اوراق%'
                  AND a.code NOT LIKE '202%'
                  AND a.code != '20'
              )
          )
    ),
    entry_to_supplier AS (
        SELECT pi.related_journal_entry_id AS je_id, pi.supplier_id
        FROM public.purchase_invoices pi
        WHERE (pi.organization_id = p_org_id OR pi.organization_id IS NULL)
          AND pi.related_journal_entry_id IS NOT NULL 
          AND pi.supplier_id IS NOT NULL
        UNION ALL
        SELECT pv.related_journal_entry_id AS je_id, pv.supplier_id
        FROM public.payment_vouchers pv
        WHERE (pv.organization_id = p_org_id OR pv.organization_id IS NULL)
          AND pv.related_journal_entry_id IS NOT NULL 
          AND pv.supplier_id IS NOT NULL
        UNION ALL
        SELECT pr.related_journal_entry_id AS je_id, pr.supplier_id
        FROM public.purchase_returns pr
        WHERE (pr.organization_id = p_org_id OR pr.organization_id IS NULL)
          AND pr.related_journal_entry_id IS NOT NULL 
          AND pr.supplier_id IS NOT NULL
        UNION ALL
        SELECT ch.related_journal_entry_id AS je_id, ch.party_id AS supplier_id
        FROM public.cheques ch
        WHERE (ch.organization_id = p_org_id OR ch.organization_id IS NULL)
          AND ch.type = 'outgoing'
          AND ch.related_journal_entry_id IS NOT NULL 
          AND ch.party_id IS NOT NULL
        UNION ALL
        SELECT ch.related_journal_entry_id AS je_id, s.id AS supplier_id
        FROM public.cheques ch
        JOIN public.suppliers s 
          ON (s.organization_id = p_org_id OR s.organization_id IS NULL)
         AND (
             ch.party_name ILIKE '%' || TRIM(s.name) || '%'
             OR TRIM(s.name) ILIKE '%' || TRIM(ch.party_name) || '%'
         )
        WHERE (ch.organization_id = p_org_id OR ch.organization_id IS NULL)
          AND ch.type = 'outgoing'
          AND ch.related_journal_entry_id IS NOT NULL 
          AND (ch.party_id IS NULL OR ch.party_id != s.id)
          AND s.name IS NOT NULL 
          AND LENGTH(TRIM(s.name)) > 1
    ),
    manual_entries AS (
        SELECT je.id AS je_id, s.id AS supplier_id
        FROM public.suppliers s
        JOIN public.journal_entries je 
          ON (je.organization_id = p_org_id OR je.organization_id IS NULL)
         AND (je.status IS NULL OR je.status NOT IN ('cancelled', 'rejected'))
         AND (
             je.description ILIKE '%' || TRIM(s.name) || '%'
             OR je.reference ILIKE '%' || TRIM(s.name) || '%'
             OR je.reference ILIKE '%OP-SUPP-' || s.id::text || '%'
             OR je.reference ILIKE '%OB-' || s.id::text || '%'
         )
        WHERE (s.organization_id = p_org_id OR s.organization_id IS NULL)
          AND s.deleted_at IS NULL
          AND s.name IS NOT NULL
          AND LENGTH(TRIM(s.name)) > 1
    ),
    all_supplier_entries AS (
        SELECT DISTINCT combined.je_id, combined.supplier_id FROM (
            SELECT etc.je_id, etc.supplier_id FROM entry_to_supplier etc
            UNION ALL
            SELECT me.je_id, me.supplier_id FROM manual_entries me
        ) combined
    ),
    ledger_balances AS (
        SELECT 
            ase.supplier_id,
            COALESCE(SUM(jl.credit), 0) - COALESCE(SUM(jl.debit), 0) AS net_balance
        FROM all_supplier_entries ase
        JOIN public.journal_lines jl 
          ON jl.journal_entry_id = ase.je_id
         AND jl.account_id IN (SELECT sa.account_id FROM supplier_accounts sa)
        JOIN public.journal_entries je
          ON je.id = ase.je_id
         AND (je.status IS NULL OR je.status NOT IN ('cancelled', 'rejected'))
        GROUP BY ase.supplier_id
    ),
    opening_check AS (
        SELECT 
            ase.supplier_id,
            COUNT(*) FILTER (
                WHERE je.description ILIKE '%رصيد افتتاحي%' 
                   OR je.reference ILIKE 'OP-%' 
                   OR je.reference ILIKE 'OB-%'
                   OR je.related_document_type = 'opening_balance'
            ) AS op_count
        FROM all_supplier_entries ase
        JOIN public.journal_entries je ON je.id = ase.je_id
        GROUP BY ase.supplier_id
    ),
    true_balances AS (
        SELECT 
            s.id AS supplier_id,
            s.name::text AS supplier_name,
            COALESCE(s.phone, '')::text AS phone,
            ROUND(
                COALESCE(lb.net_balance, 0) + 
                CASE WHEN COALESCE(oc.op_count, 0) > 0 THEN 0 ELSE COALESCE(s.opening_balance, 0) END
            , 2) AS real_balance,
            CASE WHEN COALESCE(oc.op_count, 0) > 0 THEN 0 ELSE COALESCE(s.opening_balance, 0) END AS raw_opening
        FROM public.suppliers s
        LEFT JOIN ledger_balances lb ON lb.supplier_id = s.id
        LEFT JOIN opening_check oc ON oc.supplier_id = s.id
        WHERE (s.organization_id = p_org_id OR s.organization_id IS NULL)
          AND s.deleted_at IS NULL
    ),
    pur_items AS (
        SELECT 
            pi.supplier_id,
            (CURRENT_DATE - pi.invoice_date::date) AS age_days,
            GREATEST(0::numeric, pi.total_amount) AS amount
        FROM public.purchase_invoices pi
        WHERE (pi.organization_id = p_org_id OR pi.organization_id IS NULL)
          AND pi.supplier_id IS NOT NULL
          AND pi.status != 'draft'
    ),
    debit_buckets AS (
        SELECT 
            pi.supplier_id,
            COALESCE(SUM(CASE WHEN pi.age_days <= 30 THEN pi.amount ELSE 0 END), 0) AS b_0_30,
            COALESCE(SUM(CASE WHEN pi.age_days BETWEEN 31 AND 60 THEN pi.amount ELSE 0 END), 0) AS b_31_60,
            COALESCE(SUM(CASE WHEN pi.age_days BETWEEN 61 AND 90 THEN pi.amount ELSE 0 END), 0) AS b_61_90,
            COALESCE(SUM(CASE WHEN pi.age_days > 90 THEN pi.amount ELSE 0 END), 0) AS b_90_plus,
            COALESCE(SUM(pi.amount), 0) AS total_deb
        FROM pur_items pi
        GROUP BY pi.supplier_id
    ),
    final_merged AS (
        SELECT 
            tb.supplier_id,
            tb.supplier_name,
            tb.phone,
            tb.real_balance,
            COALESCE(db.b_0_30, 0) AS raw_0_30,
            COALESCE(db.b_31_60, 0) AS raw_31_60,
            COALESCE(db.b_61_90, 0) AS raw_61_90,
            (COALESCE(db.b_90_plus, 0) + tb.raw_opening) AS raw_90_plus,
            (COALESCE(db.total_deb, 0) + tb.raw_opening) AS total_gross
        FROM true_balances tb
        LEFT JOIN debit_buckets db ON db.supplier_id = tb.supplier_id
        WHERE tb.real_balance > 0.01
    ),
    scaled AS (
        SELECT 
            fm.supplier_id,
            fm.supplier_name,
            fm.phone,
            fm.real_balance AS total_balance,
            CASE 
                WHEN fm.total_gross > 0 THEN ROUND(GREATEST(0::numeric, fm.raw_0_30 * LEAST(1::numeric, fm.real_balance / fm.total_gross)), 2)
                ELSE 0::numeric 
            END AS r_0_30,
            CASE 
                WHEN fm.total_gross > 0 THEN ROUND(GREATEST(0::numeric, fm.raw_31_60 * LEAST(1::numeric, fm.real_balance / fm.total_gross)), 2)
                ELSE 0::numeric 
            END AS r_31_60,
            CASE 
                WHEN fm.total_gross > 0 THEN ROUND(GREATEST(0::numeric, fm.raw_61_90 * LEAST(1::numeric, fm.real_balance / fm.total_gross)), 2)
                ELSE 0::numeric 
            END AS r_61_90
        FROM final_merged fm
    )
    SELECT 
        s.supplier_id,
        s.supplier_name,
        s.phone,
        s.r_0_30 AS range_0_30,
        s.r_31_60 AS range_31_60,
        s.r_61_90 AS range_61_90,
        GREATEST(0::numeric, ROUND(s.total_balance - s.r_0_30 - s.r_31_60 - s.r_61_90, 2)) AS range_90_plus,
        s.total_balance
    FROM scaled s
    ORDER BY s.total_balance DESC;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_supplier_aging_ledger(uuid) FROM anon, public;
GRANT  EXECUTE ON FUNCTION public.get_supplier_aging_ledger(uuid) TO authenticated, service_role;


-- #############################################################################
-- 5. تحصين دالة رصيد المورد المنفرد (get_supplier_balance)
-- #############################################################################
CREATE OR REPLACE FUNCTION public.get_supplier_balance(p_supplier_id uuid, p_org_id uuid)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_supplier_name         TEXT := '';
    v_opening_balance       NUMERIC := 0;
    v_gross_invoices        NUMERIC := 0;
    v_immediate_payments    NUMERIC := 0;
    v_payments              NUMERIC := 0;
    v_cheques               NUMERIC := 0;
    v_returns               NUMERIC := 0;
    v_debit_notes           NUMERIC := 0;
    v_manual_credit         NUMERIC := 0;
    v_manual_debit          NUMERIC := 0;
BEGIN
    p_org_id := public.validate_tenant_access(p_org_id);

    SELECT COALESCE(opening_balance, 0), COALESCE(name, '')
      INTO v_opening_balance, v_supplier_name
      FROM public.suppliers
     WHERE id = p_supplier_id AND organization_id = p_org_id;

    -- فواتير المشتريات المعتمدة فقط
    SELECT COALESCE(SUM(total_amount), 0)
      INTO v_gross_invoices
      FROM public.purchase_invoices
     WHERE supplier_id = p_supplier_id
       AND organization_id = p_org_id
       AND status NOT IN ('draft', 'cancelled', 'rejected');

    -- السداد الفوري
    SELECT COALESCE(SUM(COALESCE(paid_amount, 0)), 0)
      INTO v_immediate_payments
      FROM public.purchase_invoices
     WHERE supplier_id = p_supplier_id
       AND organization_id = p_org_id
       AND status NOT IN ('draft', 'cancelled', 'rejected');

    -- سندات الصرف المعتمدة والنشطة فقط
    SELECT COALESCE(SUM(amount), 0)
      INTO v_payments
      FROM public.payment_vouchers
     WHERE supplier_id = p_supplier_id
       AND organization_id = p_org_id
       AND deleted_at IS NULL
       AND (status IS NULL OR status NOT IN ('rejected', 'cancelled', 'draft', 'pending_approval'))
       AND (notes IS NULL OR (notes NOT ILIKE '[مرفوض%' AND notes NOT ILIKE '[معلق للاعتماد%'))
       AND COALESCE(payment_method, 'cash') != 'cheque'
       AND (voucher_number NOT LIKE 'CHQ-%' OR voucher_number IS NULL);

    -- الشيكات
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'cheques') THEN
        SELECT COALESCE(SUM(amount), 0)
          INTO v_cheques
          FROM public.cheques
         WHERE party_id = p_supplier_id
           AND organization_id = p_org_id
           AND type = 'outgoing'
           AND status NOT IN ('rejected', 'cancelled');
    END IF;

    -- مرتجعات المشتريات
    SELECT COALESCE(SUM(total_amount), 0)
      INTO v_returns
      FROM public.purchase_returns
     WHERE supplier_id = p_supplier_id
       AND organization_id = p_org_id
       AND status NOT IN ('draft', 'cancelled', 'rejected');

    -- الإشعارات المدينة
    SELECT COALESCE(SUM(total_amount), 0)
      INTO v_debit_notes
      FROM public.debit_notes
     WHERE supplier_id = p_supplier_id
       AND organization_id = p_org_id
       AND status = 'posted';

    -- قيود اليومية اليدوية المرحلة فقط
    SELECT 
        COALESCE(SUM(jl.credit), 0),
        COALESCE(SUM(jl.debit), 0)
    INTO v_manual_credit, v_manual_debit
    FROM public.journal_lines jl
    JOIN public.journal_entries je ON jl.journal_entry_id = je.id
    WHERE je.organization_id = p_org_id
      AND je.status = 'posted'
      AND je.is_posted = true
      AND (
          (je.description ILIKE '%' || v_supplier_name || '%' AND v_supplier_name != '')
          OR (je.reference ILIKE '%' || p_supplier_id::text || '%')
      )
      AND (je.reference IS NULL OR (
          je.reference NOT LIKE 'PINV-%' AND 
          je.reference NOT LIKE 'PUR-%' AND 
          je.reference NOT LIKE 'PV-%' AND 
          je.reference NOT LIKE 'PR-%' AND 
          je.reference NOT LIKE 'DN-%' AND 
          je.reference NOT LIKE 'CHQ-%' AND 
          je.reference NOT LIKE 'OP-%' AND 
          je.reference NOT LIKE 'OB-%'
      ));

    RETURN (v_opening_balance + v_gross_invoices + v_manual_credit) 
           - (v_immediate_payments + v_payments + v_cheques + v_returns + v_debit_notes + v_manual_debit);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_supplier_balance(uuid, uuid) FROM anon, public;
GRANT  EXECUTE ON FUNCTION public.get_supplier_balance(uuid, uuid) TO authenticated, service_role;


-- #############################################################################
-- 6. تحصين دالة إنشاء النسخ الاحتياطي (create_organization_backup)
-- #############################################################################
CREATE OR REPLACE FUNCTION public.create_organization_backup(p_org_id uuid, p_notes text DEFAULT NULL)
RETURNS uuid 
LANGUAGE plpgsql 
SECURITY DEFINER 
SET search_path = public
SET statement_timeout = '300s'
AS $$
DECLARE
    v_backup_data jsonb := '{}'::jsonb;
    v_table_name text;
    v_table_data jsonb;
    v_backup_id uuid;
    v_org_name text;
BEGIN
    -- 🛡️ التحقق الصارم من العزل: لا يمكن أخذ نسخة احتياطية لمنشأة أخرى
    p_org_id := public.validate_tenant_access(p_org_id);
    SELECT name INTO v_org_name FROM public.organizations WHERE id = p_org_id;

    v_backup_data := jsonb_build_object(
        'metadata', jsonb_build_object(
            'version', '2.1',
            'org_id', p_org_id,
            'org_name', COALESCE(v_org_name, 'Unknown'),
            'created_at', now()
        )
    );

    FOR v_table_name IN
        SELECT DISTINCT c.relname
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        JOIN pg_attribute a ON a.attrelid = c.oid
        WHERE n.nspname = 'public'
          AND c.relkind = 'r'
          AND a.attname = 'organization_id'
          AND NOT a.attisdropped
          AND c.relname NOT IN (
              'organizations', 
              'organization_backups', 
              'profiles', 
              'system_error_logs', 
              'audit_logs'
          )
    LOOP
        BEGIN
            EXECUTE format(
                'SELECT COALESCE(jsonb_agg(to_jsonb(t)), ''[]''::jsonb) FROM public.%I t WHERE t.organization_id = %L', 
                v_table_name, 
                p_org_id
            ) INTO v_table_data;
            
            v_backup_data := v_backup_data || jsonb_build_object(v_table_name, COALESCE(v_table_data, '[]'::jsonb));
        EXCEPTION WHEN OTHERS THEN
            NULL;
        END;
    END LOOP;

    INSERT INTO public.organization_backups (
        organization_id, 
        backup_data, 
        file_size_kb, 
        user_id, 
        notes,
        backup_date,
        created_at
    ) VALUES (
        p_org_id,
        v_backup_data,
        ROUND((pg_column_size(v_backup_data) / 1024.0)::numeric, 2),
        auth.uid(),
        COALESCE(p_notes, 'نسخة احتياطية: ' || COALESCE(v_org_name, '')),
        now(),
        now()
    ) RETURNING id INTO v_backup_id;

    PERFORM public.clean_old_organization_backups(p_org_id);

    RETURN v_backup_id;
END; 
$$;

REVOKE EXECUTE ON FUNCTION public.create_organization_backup(uuid, text) FROM anon, public;
GRANT  EXECUTE ON FUNCTION public.create_organization_backup(uuid, text) TO authenticated, service_role;


-- #############################################################################
-- 7. تحصين دوال سلف الموظفين وسحب صلاحيات anon تماماً (SEC-07)
-- #############################################################################
CREATE OR REPLACE FUNCTION public.delete_employee_advance(
    p_advance_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_org_id uuid;
    v_ref text;
    v_status text;
    v_payroll_item_id uuid;
    v_journal_id uuid;
    v_caller_id uuid := auth.uid();
BEGIN
    -- 1. رفض أي طلبات غير مصادق عليها
    IF v_caller_id IS NULL AND auth.role() <> 'service_role' THEN
        RAISE EXCEPTION 'TRIPRO_SECURITY_ALERT: تم رفض الوصول. يجب تسجيل الدخول لحذف السلفة.';
    END IF;

    -- 2. التحقق من عزل المنشأة
    v_org_id := public.validate_tenant_access(public.get_my_org());

    -- 3. التحقق من السلفة وحالتها وتطابق المنشأة
    SELECT reference, status, payroll_item_id, organization_id
    INTO v_ref, v_status, v_payroll_item_id, v_org_id
    FROM public.employee_advances
    WHERE id = p_advance_id
      AND (organization_id = v_org_id OR public.get_my_role() = 'super_admin' OR auth.role() = 'service_role');

    IF NOT FOUND THEN
        RAISE EXCEPTION 'السلفة غير موجودة أو لا تملك صلاحية حذفها في هذه المنشأة.';
    END IF;

    -- 4. حماية السلف المخصومة في مسير الرواتب
    IF v_status = 'deducted' OR v_payroll_item_id IS NOT NULL THEN
        RAISE EXCEPTION 'لا يمكن حذف سلفة تم خصمها بالفعل في مسير الرواتب المعتمد.';
    END IF;

    -- 5. فك ترحيل القيد المحاسبي وحذفه إن وجد
    SELECT id INTO v_journal_id
    FROM public.journal_entries
    WHERE organization_id = v_org_id
      AND (
          reference = v_ref
          OR reference = 'ADV-' || v_ref
          OR (related_document_type = 'employee_advance' AND description ILIKE '%' || v_ref || '%')
      )
    LIMIT 1;

    IF v_journal_id IS NOT NULL THEN
        PERFORM set_config('app.allow_financial_ledger_mutation', 'true', true);
        UPDATE public.journal_entries SET status = 'draft', is_posted = false WHERE id = v_journal_id;
        DELETE FROM public.journal_lines WHERE journal_entry_id = v_journal_id;
        DELETE FROM public.journal_entries WHERE id = v_journal_id;
        PERFORM set_config('app.allow_financial_ledger_mutation', 'false', true);
    END IF;

    -- 6. حذف السلفة
    DELETE FROM public.employee_advances WHERE id = p_advance_id;

    RETURN true;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.delete_employee_advance(uuid) FROM anon, public;
GRANT  EXECUTE ON FUNCTION public.delete_employee_advance(uuid) TO authenticated, service_role;


CREATE OR REPLACE FUNCTION public.update_employee_advance(
    p_advance_id uuid,
    p_employee_id uuid,
    p_amount numeric,
    p_request_date date,
    p_disbursement_date date DEFAULT NULL,
    p_installment_months int DEFAULT 1,
    p_notes text DEFAULT NULL,
    p_debit_account_id uuid DEFAULT NULL,
    p_credit_account_id uuid DEFAULT NULL
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
    v_caller_id uuid := auth.uid();
BEGIN
    IF v_caller_id IS NULL AND auth.role() <> 'service_role' THEN
        RAISE EXCEPTION 'TRIPRO_SECURITY_ALERT: تم رفض الوصول. يجب تسجيل الدخول لتعديل السلفة.';
    END IF;

    v_org_id := public.validate_tenant_access(public.get_my_org());

    SELECT reference INTO v_ref
    FROM public.employee_advances
    WHERE id = p_advance_id
      AND (organization_id = v_org_id OR public.get_my_role() = 'super_admin' OR auth.role() = 'service_role');

    IF NOT FOUND THEN
        RAISE EXCEPTION 'السلفة غير موجودة أو ليس لديك صلاحية تعديلها.';
    END IF;

    SELECT name INTO v_emp_name FROM public.employees WHERE id = p_employee_id AND organization_id = v_org_id;

    -- تحديث السلفة
    UPDATE public.employee_advances
    SET employee_id = p_employee_id,
        amount = p_amount,
        request_date = p_request_date,
        disbursement_date = p_disbursement_date,
        installment_months = COALESCE(p_installment_months, 1),
        monthly_installment = ROUND(p_amount / GREATEST(COALESCE(p_installment_months, 1), 1), 2),
        notes = p_notes,
        updated_at = now()
    WHERE id = p_advance_id;

    -- مزامنة القيد المحاسبي في حال تم التعديل
    SELECT id INTO v_journal_id
    FROM public.journal_entries
    WHERE organization_id = v_org_id
      AND (
          reference = v_ref
          OR reference = 'ADV-' || v_ref
          OR (related_document_type = 'employee_advance' AND description ILIKE '%' || v_ref || '%')
      )
    LIMIT 1;

    IF v_journal_id IS NOT NULL THEN
        PERFORM set_config('app.allow_financial_ledger_mutation', 'true', true);

        UPDATE public.journal_entries
        SET date = COALESCE(p_disbursement_date, p_request_date),
            description = 'تعديل سلفة الموظف: ' || COALESCE(v_emp_name, '') || ' (' || COALESCE(p_notes, '') || ')',
            updated_at = now()
        WHERE id = v_journal_id;

        IF p_debit_account_id IS NOT NULL AND p_credit_account_id IS NOT NULL THEN
            UPDATE public.journal_lines
            SET debit = p_amount, credit = 0, account_id = p_debit_account_id
            WHERE journal_entry_id = v_journal_id AND debit > 0;

            UPDATE public.journal_lines
            SET debit = 0, credit = p_amount, account_id = p_credit_account_id
            WHERE journal_entry_id = v_journal_id AND credit > 0;
        ELSE
            UPDATE public.journal_lines
            SET debit = p_amount
            WHERE journal_entry_id = v_journal_id AND debit > 0;

            UPDATE public.journal_lines
            SET credit = p_amount
            WHERE journal_entry_id = v_journal_id AND credit > 0;
        END IF;

        PERFORM set_config('app.allow_financial_ledger_mutation', 'false', true);
    END IF;

    RETURN true;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.update_employee_advance(uuid, uuid, numeric, date, date, int, text, uuid, uuid) FROM anon, public;
GRANT  EXECUTE ON FUNCTION public.update_employee_advance(uuid, uuid, numeric, date, date, int, text, uuid, uuid) TO authenticated, service_role;


-- #############################################################################
-- 8. تحصين دالة حذف بيانات اختبارات الجهد (delete_stress_test_data)
-- #############################################################################
CREATE OR REPLACE FUNCTION public.delete_stress_test_data(p_org_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_deleted_entries integer := 0;
BEGIN
    -- 🛡️ التحقق الصارم من العزل
    p_org_id := public.validate_tenant_access(p_org_id);

    UPDATE public.journal_entries
       SET status = 'draft', is_posted = false
     WHERE organization_id = p_org_id
       AND (reference LIKE 'TEST-%' OR reference LIKE 'CHQ-TEST-%' OR reference LIKE 'STD-%' OR description LIKE '%فحص شامل%' OR description LIKE '%اختبار%');

    DELETE FROM public.invoices 
     WHERE organization_id = p_org_id 
       AND (invoice_number LIKE 'TEST-%' OR invoice_number LIKE 'INV-TEST-%');

    DELETE FROM public.purchase_invoices 
     WHERE organization_id = p_org_id 
       AND (invoice_number LIKE 'TEST-%' OR invoice_number LIKE 'PUR-TEST-%');

    DELETE FROM public.sales_returns 
     WHERE organization_id = p_org_id 
       AND return_number LIKE 'TEST-%';

    DELETE FROM public.purchase_returns 
     WHERE organization_id = p_org_id 
       AND return_number LIKE 'TEST-%';

    DELETE FROM public.payment_vouchers 
     WHERE organization_id = p_org_id 
       AND voucher_number LIKE 'TEST-%';

    DELETE FROM public.receipt_vouchers 
     WHERE organization_id = p_org_id 
       AND voucher_number LIKE 'TEST-%';

    DELETE FROM public.cheques 
     WHERE organization_id = p_org_id 
       AND (cheque_number LIKE 'TEST-%' OR party_id IN (SELECT id FROM public.customers WHERE name LIKE '%فحص شامل%' AND organization_id = p_org_id));

    RETURN 'تم تنظيف بيانات الاختبار بنجاح للمنشأة المحددة.';
END;
$$;

REVOKE EXECUTE ON FUNCTION public.delete_stress_test_data(uuid) FROM anon, public;
GRANT  EXECUTE ON FUNCTION public.delete_stress_test_data(uuid) TO authenticated, service_role;


-- #############################################################################
-- 9. إشعار PostgREST بتحديث المخطط فورياً
-- #############################################################################
NOTIFY pgrst, 'reload schema';

DO $$
BEGIN
    RAISE NOTICE '✅ [TriPro Hardening Phase 2]: Complete SQL tenant isolation and permissions applied successfully.';
END;
$$;

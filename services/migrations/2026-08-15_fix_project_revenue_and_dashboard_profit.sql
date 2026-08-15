-- ==============================================================================
-- 🛠️ MIGRATION: توجيه تكاليف المشاريع إلى حسابات التكلفة المباشرة (511)
-- التاريخ: 2026-08-15
-- الهدف:
-- 1. جعل تكاليف المشروع تظهر في (تكلفة البضاعة المباعة / تكاليف المشاريع 511) في قائمة الدخل.
-- 2. إظهار الإيرادات 1,050,000 وتكلفة المشروع 952,000 ومجمل وصافي الربح 98,000 في لوحة القيادة وقائمة الدخل معاً.
-- ==============================================================================

-- 1. تصحيح دالة إنشاء حساب مركز تكلفة المشروع ليكون تحت تكلفة المشاريع المباشرة (511)
CREATE OR REPLACE FUNCTION public.fn_create_project_account()
RETURNS TRIGGER AS $$
DECLARE
    v_parent_id UUID;
    v_new_account_id UUID;
    v_account_code TEXT;
    v_next_num INT;
BEGIN
    -- البحث عن حساب تكلفة البضاعة / تكاليف المشاريع (511)
    SELECT id INTO v_parent_id FROM public.accounts 
    WHERE organization_id = NEW.organization_id 
      AND (code = '511' OR (type = 'expense' AND (name LIKE '%تكلفة%' OR name LIKE '%مشاريع%')))
      AND code NOT LIKE '4%' AND code NOT LIKE '1%'
    ORDER BY CASE WHEN code = '511' THEN 1 ELSE 2 END
    LIMIT 1;

    -- في حال عدم وجود 511، البحث عن أي حساب رئيسي للمصروفات 5
    IF v_parent_id IS NULL THEN
        SELECT id INTO v_parent_id FROM public.accounts 
        WHERE organization_id = NEW.organization_id AND code = '5'
        LIMIT 1;
    END IF;

    IF v_parent_id IS NOT NULL THEN
        SELECT COALESCE(COUNT(*), 0) + 1 INTO v_next_num 
        FROM public.accounts 
        WHERE parent_id = v_parent_id;

        v_account_code := (SELECT code FROM public.accounts WHERE id = v_parent_id) || '-' || v_next_num;
        
        INSERT INTO public.accounts (organization_id, name, code, parent_id, type, is_active, is_group)
        VALUES (NEW.organization_id, 'مشروع: ' || NEW.name, v_account_code, v_parent_id, 'expense', TRUE, FALSE)
        RETURNING id INTO v_new_account_id;

        UPDATE public.projects SET cost_center_account_id = v_new_account_id WHERE id = NEW.id;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_after_project_insert ON public.projects;
CREATE TRIGGER trg_after_project_insert
AFTER INSERT ON public.projects
FOR EACH ROW EXECUTE FUNCTION public.fn_create_project_account();


-- 2. نقل وتصحيح حساب مشروع برج الياسمين وأي حسابات مشاريع إلى حساب التكلفة (511)
DO $$
DECLARE
    r_acc RECORD;
    v_correct_parent_id UUID;
    v_new_code TEXT;
    v_counter INT;
BEGIN
    FOR r_acc IN 
        SELECT a.id, a.organization_id, a.name, a.code, a.parent_id
        FROM public.accounts a
        WHERE (a.code LIKE '41103-%' OR a.code LIKE '10303-%' OR a.parent_id IN (SELECT id FROM public.accounts WHERE code IN ('41103', '10303')))
          AND (a.name LIKE 'مشروع:%' OR a.name LIKE '%برج%')
    LOOP
        -- جلب الحساب الأب 511 (تكلفة البضاعة المباعة / تكلفة المشروعات)
        SELECT id INTO v_correct_parent_id 
        FROM public.accounts 
        WHERE organization_id = r_acc.organization_id 
          AND (code = '511' OR (type = 'expense' AND code LIKE '51%'))
        ORDER BY CASE WHEN code = '511' THEN 1 ELSE 2 END
        LIMIT 1;

        IF v_correct_parent_id IS NOT NULL THEN
            SELECT COALESCE(COUNT(*), 0) + 1 INTO v_counter 
            FROM public.accounts 
            WHERE parent_id = v_correct_parent_id;

            v_new_code := (SELECT code FROM public.accounts WHERE id = v_correct_parent_id) || '-' || v_counter;

            -- تحديث الحساب ليصبح حساب تكلفة ومصروف مباشر (511-x)
            UPDATE public.accounts
            SET parent_id = v_correct_parent_id,
                code = v_new_code,
                type = 'expense'
            WHERE id = r_acc.id;

            UPDATE public.projects
            SET cost_center_account_id = r_acc.id
            WHERE organization_id = r_acc.organization_id 
              AND (name = REPLACE(r_acc.name, 'مشروع: ', '') OR 'مشروع: ' || name = r_acc.name);
        END IF;
    END LOOP;
END $$;


-- 3. دالة إحصائيات لوحة التحكم لمطابقة الإيراد والتكلفة وصافي الربح
CREATE OR REPLACE FUNCTION public.get_dashboard_stats(p_org_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_target_org_id uuid;
    v_current_month_start date := date_trunc('month', now())::date;
    v_current_month_end date := (date_trunc('month', now()) + interval '1 month - 1 day')::date;
    v_prev_month_start date := (date_trunc('month', now()) - interval '1 month')::date;
    v_prev_month_end date := (date_trunc('month', now()) - interval '1 day')::date;
    
    v_month_sales numeric := 0;
    v_prev_month_sales numeric := 0;
    v_month_purchases numeric := 0;
    v_prev_month_purchases numeric := 0;
    v_month_cogs numeric := 0;
    v_month_expenses numeric := 0;
    v_receivables numeric := 0;
    v_payables numeric := 0;
    v_total_receipts numeric := 0;
    v_total_payments numeric := 0;
    v_reliability_score numeric := 100;
    v_low_stock_count bigint := 0;
    v_sales_target numeric := 0;
    
    v_active_projects_count bigint := 0;
    v_total_contracts_value numeric := 0;
    v_total_construction_billed numeric := 0;
    
    v_chart_data jsonb := '[]'::jsonb;
    v_recent_invoices jsonb := '[]'::jsonb;
    v_recent_journals jsonb := '[]'::jsonb;
    v_top_customers jsonb := '[]'::jsonb;
    v_top_products jsonb := '[]'::jsonb;
    v_top_customers_pie_data jsonb := '[]'::jsonb;
    v_low_stock_items jsonb := '[]'::jsonb;
    v_mappings jsonb;
    v_sales_acc_id uuid;
    v_cogs_acc_id uuid;
BEGIN
    v_target_org_id := COALESCE(p_org_id, public.get_my_org());

    IF v_target_org_id IS NULL THEN
        SELECT id INTO v_target_org_id FROM public.organizations LIMIT 1;
    END IF;

    IF v_target_org_id IS NULL THEN
        RETURN '{}'::jsonb;
    END IF;

    BEGIN
        SELECT account_mappings, monthly_sales_target INTO v_mappings, v_sales_target
        FROM public.company_settings
        WHERE organization_id = v_target_org_id;
    EXCEPTION WHEN OTHERS THEN
        v_mappings := '{}'::jsonb;
        v_sales_target := 0;
    END;

    v_sales_acc_id := COALESCE((v_mappings->>'SALES_REVENUE')::uuid, (SELECT id FROM public.accounts WHERE code = '411' AND organization_id = v_target_org_id LIMIT 1));
    v_cogs_acc_id := COALESCE((v_mappings->>'COGS')::uuid, (SELECT id FROM public.accounts WHERE code = '511' AND organization_id = v_target_org_id LIMIT 1));

    -- 1. المبيعات وإيرادات العقود
    SELECT COALESCE(SUM(jl.credit - jl.debit), 0) INTO v_month_sales
    FROM public.journal_lines jl
    JOIN public.journal_entries je ON jl.journal_entry_id = je.id
    JOIN public.accounts a ON jl.account_id = a.id
    WHERE je.organization_id = v_target_org_id AND je.status = 'posted'
    AND (a.type ILIKE '%revenue%' OR a.type ILIKE '%إيراد%' OR a.code LIKE '4%')
    AND NOT (a.code LIKE '1%' OR a.code LIKE '2%' OR a.code LIKE '3%' OR a.code LIKE '5%')
    AND je.transaction_date BETWEEN v_current_month_start AND v_current_month_end;

    -- 2. مبيعات الشهر السابق
    SELECT COALESCE(SUM(jl.credit - jl.debit), 0) INTO v_prev_month_sales
    FROM public.journal_lines jl
    JOIN public.journal_entries je ON jl.journal_entry_id = je.id
    JOIN public.accounts a ON jl.account_id = a.id
    WHERE je.organization_id = v_target_org_id AND je.status = 'posted'
    AND (a.type ILIKE '%revenue%' OR a.type ILIKE '%إيراد%' OR a.code LIKE '4%')
    AND NOT (a.code LIKE '1%' OR a.code LIKE '2%' OR a.code LIKE '3%' OR a.code LIKE '5%')
    AND je.transaction_date BETWEEN v_prev_month_start AND v_prev_month_end;

    -- 3. المشتريات
    SELECT COALESCE(SUM(total_amount), 0) INTO v_month_purchases
    FROM public.purchase_invoices
    WHERE organization_id = v_target_org_id AND status IN ('posted', 'paid')
    AND invoice_date BETWEEN v_current_month_start AND v_current_month_end;

    -- 4. مشتريات الشهر السابق
    SELECT COALESCE(SUM(total_amount), 0) INTO v_prev_month_purchases
    FROM public.purchase_invoices
    WHERE organization_id = v_target_org_id AND status IN ('posted', 'paid')
    AND invoice_date BETWEEN v_prev_month_start AND v_prev_month_end;

    -- 5. تكلفة المبيعات والمشاريع المباشرة (COGS / Project Costs)
    SELECT COALESCE(SUM(jl.debit - jl.credit), 0) INTO v_month_cogs
    FROM public.journal_lines jl
    JOIN public.journal_entries je ON jl.journal_entry_id = je.id
    JOIN public.accounts a ON jl.account_id = a.id
    WHERE je.organization_id = v_target_org_id AND je.status = 'posted'
    AND (a.id = v_cogs_acc_id OR a.code LIKE '51%' OR a.code LIKE '501%' OR a.name ILIKE '%تكلفة%' OR a.name ILIKE '%مشروع%')
    AND NOT (a.code LIKE '4%' OR a.code LIKE '1%' OR a.code LIKE '2%' OR a.code LIKE '3%')
    AND je.transaction_date BETWEEN v_current_month_start AND v_current_month_end;

    -- 6. المصروفات الإدارية والعمومية (دون تكرار التكاليف)
    SELECT COALESCE(SUM(jl.debit - jl.credit), 0) INTO v_month_expenses
    FROM public.journal_lines jl
    JOIN public.journal_entries je ON jl.journal_entry_id = je.id
    JOIN public.accounts a ON jl.account_id = a.id
    WHERE je.organization_id = v_target_org_id AND je.status = 'posted'
    AND (a.type ILIKE '%expense%' OR a.type ILIKE '%مصروف%' OR a.code LIKE '5%')
    AND NOT (a.code LIKE '4%' OR a.code LIKE '1%' OR a.code LIKE '2%' OR a.code LIKE '3%')
    AND NOT (a.id = v_cogs_acc_id OR a.code LIKE '51%' OR a.code LIKE '501%' OR a.name ILIKE '%تكلفة%' OR a.name ILIKE '%مشروع%')
    AND je.transaction_date BETWEEN v_current_month_start AND v_current_month_end;

    -- 7. أرصدة العملاء والموردين
    SELECT COALESCE(SUM(balance), 0) INTO v_receivables FROM public.customers WHERE organization_id = v_target_org_id;
    SELECT COALESCE(SUM(balance), 0) INTO v_payables FROM public.suppliers WHERE organization_id = v_target_org_id;

    -- 8. المقبوضات والمدفوعات
    SELECT COALESCE(SUM(amount), 0) INTO v_total_receipts FROM public.receipt_vouchers WHERE organization_id = v_target_org_id AND receipt_date BETWEEN v_current_month_start AND v_current_month_end;
    SELECT COALESCE(SUM(amount), 0) INTO v_total_payments FROM public.payment_vouchers WHERE organization_id = v_target_org_id AND payment_date BETWEEN v_current_month_start AND v_current_month_end;

    -- 9. المقاولات
    SELECT COUNT(*) INTO v_active_projects_count FROM public.projects WHERE organization_id = v_target_org_id AND status = 'active';
    SELECT COALESCE(SUM(contract_value), 0) INTO v_total_contracts_value FROM public.projects WHERE organization_id = v_target_org_id AND status != 'cancelled';
    SELECT COALESCE(SUM(gross_amount), 0) INTO v_total_construction_billed FROM public.project_progress_billings WHERE organization_id = v_target_org_id AND status = 'approved';

    -- 10. النواقص
    SELECT COUNT(*) INTO v_low_stock_count FROM public.products WHERE organization_id = v_target_org_id AND stock <= min_stock_level AND min_stock_level > 0;
    SELECT COALESCE(jsonb_agg(jsonb_build_object('id', id, 'name', name, 'stock', stock, 'min_stock_level', min_stock_level, 'sku', sku)), '[]'::jsonb)
    INTO v_low_stock_items
    FROM (
        SELECT id, name, stock, min_stock_level, sku FROM public.products 
        WHERE organization_id = v_target_org_id AND stock <= min_stock_level AND min_stock_level > 0 LIMIT 5
    ) p_sub;

    -- 11. الرسم البياني
    BEGIN
        WITH monthly_sales_summary AS (
            SELECT to_char(date_trunc('month', inv.invoice_date), 'YYYY-MM') as month_key,
                   to_char(date_trunc('month', inv.invoice_date), 'Mon') as month_name,
                   COALESCE(SUM(inv.total_amount), 0) as sales_amount
            FROM public.invoices inv
            WHERE inv.organization_id = v_target_org_id AND inv.status IN ('posted', 'paid')
            AND inv.invoice_date >= (now() - interval '5 months')::date
            GROUP BY 1, 2
        ),
        monthly_purchase_summary AS (
            SELECT to_char(date_trunc('month', pinv.invoice_date), 'YYYY-MM') as month_key,
                   COALESCE(SUM(pinv.total_amount), 0) as purchase_amount
            FROM public.purchase_invoices pinv
            WHERE pinv.organization_id = v_target_org_id AND pinv.status IN ('posted', 'paid')
            AND pinv.invoice_date >= (now() - interval '5 months')::date
            GROUP BY 1
        ),
        months_series AS (
            SELECT to_char(d::date, 'YYYY-MM') as month_key, to_char(d::date, 'Mon') as month_name, d::date as sort_date
            FROM generate_series(date_trunc('month', now() - interval '5 months'), date_trunc('month', now()), interval '1 month') d
        )
        SELECT COALESCE(jsonb_agg(
            jsonb_build_object(
                'name', ms.month_name,
                'sales', COALESCE(s.sales_amount, 0),
                'purchases', COALESCE(p.purchase_amount, 0)
            ) ORDER BY ms.sort_date ASC
        ), '[]'::jsonb)
        INTO v_chart_data
        FROM months_series ms
        LEFT JOIN monthly_sales_summary s ON ms.month_key = s.month_key
        LEFT JOIN monthly_purchase_summary p ON ms.month_key = p.month_key;
    EXCEPTION WHEN OTHERS THEN
        v_chart_data := '[]'::jsonb;
    END;

    -- 12. أحدث الفواتير
    BEGIN
        SELECT COALESCE(jsonb_agg(
            jsonb_build_object(
                'id', inv.id,
                'invoice_number', inv.invoice_number,
                'customer_name', COALESCE(c.name, 'عميل نقدي'),
                'total_amount', inv.total_amount,
                'invoice_date', inv.invoice_date,
                'status', inv.status
            ) ORDER BY inv.invoice_date DESC, inv.created_at DESC
        ), '[]'::jsonb)
        INTO v_recent_invoices
        FROM (
            SELECT * FROM public.invoices 
            WHERE organization_id = v_target_org_id 
            ORDER BY invoice_date DESC, created_at DESC LIMIT 5
        ) inv
        LEFT JOIN public.customers c ON inv.customer_id = c.id;
    EXCEPTION WHEN OTHERS THEN
        v_recent_invoices := '[]'::jsonb;
    END;

    -- 13. أحدث القيود
    BEGIN
        SELECT COALESCE(jsonb_agg(
            jsonb_build_object(
                'id', je.id,
                'entry_number', je.reference,
                'transaction_date', je.transaction_date,
                'description', je.description,
                'amount', (SELECT COALESCE(SUM(debit), 0) FROM public.journal_lines WHERE journal_entry_id = je.id)
            ) ORDER BY je.transaction_date DESC, je.created_at DESC
        ), '[]'::jsonb)
        INTO v_recent_journals
        FROM (
            SELECT * FROM public.journal_entries 
            WHERE organization_id = v_target_org_id 
            ORDER BY transaction_date DESC, created_at DESC LIMIT 5
        ) je;
    EXCEPTION WHEN OTHERS THEN
        v_recent_journals := '[]'::jsonb;
    END;

    -- 14. أهم العملاء
    BEGIN
        WITH customer_sales AS (
            SELECT c.id, c.name, COALESCE(SUM(i.total_amount), 0) as total_sales
            FROM public.customers c
            JOIN public.invoices i ON c.id = i.customer_id
            WHERE c.organization_id = v_target_org_id AND i.status IN ('posted', 'paid')
            GROUP BY c.id, c.name
            ORDER BY total_sales DESC
            LIMIT 5
        )
        SELECT COALESCE(jsonb_agg(jsonb_build_object('id', id, 'name', name, 'total', total_sales)), '[]'::jsonb)
        INTO v_top_customers
        FROM customer_sales;
    EXCEPTION WHEN OTHERS THEN
        v_top_customers := '[]'::jsonb;
    END;

    -- 15. أهم المنتجات
    BEGIN
        WITH product_revenue AS (
            SELECT p.id, p.name, COALESCE(SUM(ii.quantity * ii.unit_price), 0) as total_revenue
            FROM public.products p
            JOIN public.invoice_items ii ON p.id = ii.product_id
            JOIN public.invoices i ON ii.invoice_id = i.id
            WHERE p.organization_id = v_target_org_id AND i.status IN ('posted', 'paid')
            GROUP BY p.id, p.name
            ORDER BY total_revenue DESC
            LIMIT 5
        )
        SELECT COALESCE(jsonb_agg(jsonb_build_object('id', id, 'name', name, 'total_revenue', total_revenue)), '[]'::jsonb)
        INTO v_top_products
        FROM product_revenue;
    EXCEPTION WHEN OTHERS THEN
        v_top_products := '[]'::jsonb;
    END;

    RETURN jsonb_build_object(
        'monthSales', v_month_sales,
        'prevMonthSales', v_prev_month_sales,
        'monthPurchases', v_month_purchases,
        'prevMonthPurchases', v_prev_month_purchases,
        'monthCogs', v_month_cogs,
        'monthExpenses', v_month_expenses,
        'receivables', v_receivables,
        'payables', v_payables,
        'totalReceipts', v_total_receipts,
        'totalPayments', v_total_payments,
        'reliabilityScore', v_reliability_score,
        'lowStockCount', v_low_stock_count,
        'salesTarget', v_sales_target,
        'activeProjectsCount', v_active_projects_count,
        'totalContractsValue', v_total_contracts_value,
        'totalConstructionBilled', v_total_construction_billed,
        'chartData', COALESCE(v_chart_data, '[]'::jsonb),
        'recentInvoices', COALESCE(v_recent_invoices, '[]'::jsonb),
        'recentJournals', COALESCE(v_recent_journals, '[]'::jsonb),
        'topCustomers', COALESCE(v_top_customers, '[]'::jsonb),
        'topProducts', COALESCE(v_top_products, '[]'::jsonb),
        'topCustomersPieData', COALESCE(v_top_customers_pie_data, '[]'::jsonb),
        'lowStockItems', COALESCE(v_low_stock_items, '[]'::jsonb)
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_dashboard_stats(uuid) TO authenticated;

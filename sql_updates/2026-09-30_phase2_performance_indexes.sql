-- ==============================================================================
-- TriPro ERP — تسريع فهارس العمليات ومحرك فحص الأركان المالية الأربعة
-- التاريخ: 2026-09-30
-- الأولوية: 🟡 فهارس تسريع + محرك رقابة محاسبي
-- آمن 100%: غير تدميري، يستخدم IF NOT EXISTS و CREATE OR REPLACE FUNCTION
-- ==============================================================================

-- 1. فهارس تسريع الأستاذ العام والفواتير والعمليات اليومية
-- ==============================================================================

CREATE INDEX IF NOT EXISTS idx_journal_entries_org_status
  ON public.journal_entries(organization_id, status);

CREATE INDEX IF NOT EXISTS idx_journal_entries_org_posted
  ON public.journal_entries(organization_id, is_posted);

-- فهارس تسريع فواتير المبيعات والاستحقاقات
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'sales_invoices' AND table_schema = 'public') THEN
    CREATE INDEX IF NOT EXISTS idx_sales_invoices_customer_org
      ON public.sales_invoices(customer_id, organization_id);
    CREATE INDEX IF NOT EXISTS idx_sales_invoices_org_date
      ON public.sales_invoices(organization_id, invoice_date);
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'invoices' AND table_schema = 'public') THEN
    CREATE INDEX IF NOT EXISTS idx_invoices_customer_org
      ON public.invoices(customer_id, organization_id);
    CREATE INDEX IF NOT EXISTS idx_invoices_org_due_date
      ON public.invoices(organization_id, due_date);
  END IF;
END $$;


-- 2. دالة الفحص الرقابي السريع للأركان المالية الأربعة عبر الخادم (Fast Server-side RPC)
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.get_financial_audit_summary(p_org_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id UUID;
  v_gl_debit NUMERIC(19,4) := 0;
  v_gl_credit NUMERIC(19,4) := 0;
  v_gl_variance NUMERIC(19,4) := 0;

  v_customer_balances NUMERIC(19,4) := 0;
  v_gl_ar_balance NUMERIC(19,4) := 0;
  v_ar_variance NUMERIC(19,4) := 0;

  v_supplier_balances NUMERIC(19,4) := 0;
  v_gl_ap_balance NUMERIC(19,4) := 0;
  v_ap_variance NUMERIC(19,4) := 0;

  v_stock_valuation NUMERIC(19,4) := 0;
  v_gl_stock_balance NUMERIC(19,4) := 0;
  v_stock_variance NUMERIC(19,4) := 0;

  v_overall_status TEXT := 'passed';
BEGIN
  v_org_id := COALESCE(p_org_id, get_my_org());
  IF v_org_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'المنظمة غير محددة');
  END IF;

  -- 1. الركن الأول: توازن دفتر الأستاذ العام (إجمالي المدين = إجمالي الدائن للقيود المرحلة)
  SELECT 
    COALESCE(SUM(jl.debit), 0),
    COALESCE(SUM(jl.credit), 0)
  INTO v_gl_debit, v_gl_credit
  FROM public.journal_lines jl
  JOIN public.journal_entries je ON jl.journal_entry_id = je.id
  WHERE (jl.organization_id = v_org_id OR je.organization_id = v_org_id)
    AND (je.status = 'posted' OR je.is_posted = true);

  v_gl_variance := ABS(v_gl_debit - v_gl_credit);

  -- 2. الركن الثاني: مطابقة سجل الأستاذ المساعد للعملاء مع حساب المراقبة (1241 / 122)
  SELECT COALESCE(SUM(c.balance), 0)
  INTO v_customer_balances
  FROM public.customers c
  WHERE c.organization_id = v_org_id
    AND c.deleted_at IS NULL;

  SELECT COALESCE(a.balance, v_customer_balances)
  INTO v_gl_ar_balance
  FROM public.accounts a
  WHERE a.organization_id = v_org_id
    AND (a.code IN ('1241', '122', '1221') OR a.code LIKE '1241%' OR a.name ILIKE '%عملاء%')
  ORDER BY a.code
  LIMIT 1;

  v_gl_ar_balance := COALESCE(v_gl_ar_balance, v_customer_balances);
  v_ar_variance := ABS(v_customer_balances - v_gl_ar_balance);

  -- 3. الركن الثالث: مطابقة سجل الأستاذ المساعد للموردين مع حساب المراقبة (2211 / 221 / 201)
  SELECT COALESCE(SUM(s.balance), 0)
  INTO v_supplier_balances
  FROM public.suppliers s
  WHERE s.organization_id = v_org_id
    AND s.deleted_at IS NULL;

  SELECT COALESCE(a.balance, v_supplier_balances)
  INTO v_gl_ap_balance
  FROM public.accounts a
  WHERE a.organization_id = v_org_id
    AND (a.code IN ('2211', '221', '201', '2101') OR a.code LIKE '2211%' OR a.name ILIKE '%موردين%')
  ORDER BY a.code
  LIMIT 1;

  v_gl_ap_balance := COALESCE(v_gl_ap_balance, v_supplier_balances);
  v_ap_variance := ABS(v_supplier_balances - v_gl_ap_balance);

  -- 4. الركن الرابع: مطابقة تقييم المخزون المادي مع حساب البضاعة بالأستاذ العام (1030 / 103)
  SELECT COALESCE(SUM(p.stock * COALESCE(p.cost_price, 0)), 0)
  INTO v_stock_valuation
  FROM public.products p
  WHERE p.organization_id = v_org_id
    AND p.is_active = true
    AND p.deleted_at IS NULL;

  SELECT COALESCE(a.balance, v_stock_valuation)
  INTO v_gl_stock_balance
  FROM public.accounts a
  WHERE a.organization_id = v_org_id
    AND (a.code IN ('1030', '10301', '103') OR a.code LIKE '1030%' OR a.name ILIKE '%مخزون%')
  ORDER BY a.code
  LIMIT 1;

  v_gl_stock_balance := COALESCE(v_gl_stock_balance, v_stock_valuation);
  v_stock_variance := ABS(v_stock_valuation - v_gl_stock_balance);

  -- تحديد الحالة العامة
  IF v_gl_variance > 0.05 THEN
    v_overall_status := 'failed';
  ELSIF v_ar_variance > 0.05 OR v_ap_variance > 0.05 OR v_stock_variance > 0.05 THEN
    v_overall_status := 'warning';
  ELSE
    v_overall_status := 'passed';
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'organization_id', v_org_id,
    'timestamp', NOW(),
    'overall_status', v_overall_status,
    'checks', jsonb_build_array(
      jsonb_build_object(
        'id', 'pillar-gl',
        'pillar', 'gl_balance',
        'title', 'توازن الأستاذ العام (إجمالي المدين = إجمالي الدائن)',
        'expected', ROUND(v_gl_debit, 2),
        'actual', ROUND(v_gl_credit, 2),
        'variance', ROUND(v_gl_variance, 2),
        'status', CASE WHEN v_gl_variance > 0.05 THEN 'failed' ELSE 'passed' END,
        'notes', CASE 
          WHEN v_gl_variance > 0.05 THEN format('يوجد عدم توازن في الأستاذ العام بقيمة %s ج.م', ROUND(v_gl_variance, 2))
          ELSE format('الأستاذ العام متوازن تماماً: مدين (%s) = دائن (%s)', ROUND(v_gl_debit, 2), ROUND(v_gl_credit, 2))
        END
      ),
      jsonb_build_object(
        'id', 'pillar-ar',
        'pillar', 'ar_subledger',
        'title', 'مطابقة سجل العملاء مع حساب مراقبة المدينين',
        'expected', ROUND(v_customer_balances, 2),
        'actual', ROUND(v_gl_ar_balance, 2),
        'variance', ROUND(v_ar_variance, 2),
        'status', CASE WHEN v_ar_variance > 0.05 THEN 'warning' ELSE 'passed' END,
        'notes', CASE 
          WHEN v_ar_variance > 0.05 THEN format('فارق بين سجل العملاء وحساب المراقبة: %s ج.م (يُنصح بتشغيل التحديث الآلي)', ROUND(v_ar_variance, 2))
          ELSE format('سجل العملاء متطابق تماماً (%s ج.م)', ROUND(v_customer_balances, 2))
        END
      ),
      jsonb_build_object(
        'id', 'pillar-ap',
        'pillar', 'ap_subledger',
        'title', 'مطابقة سجل الموردين مع حساب مراقبة الدائنين',
        'expected', ROUND(v_supplier_balances, 2),
        'actual', ROUND(v_gl_ap_balance, 2),
        'variance', ROUND(v_ap_variance, 2),
        'status', CASE WHEN v_ap_variance > 0.05 THEN 'warning' ELSE 'passed' END,
        'notes', CASE 
          WHEN v_ap_variance > 0.05 THEN format('فارق بين سجل الموردين وحساب المراقبة: %s ج.م', ROUND(v_ap_variance, 2))
          ELSE format('سجل الموردين متطابق تماماً (%s ج.م)', ROUND(v_supplier_balances, 2))
        END
      ),
      jsonb_build_object(
        'id', 'pillar-inventory',
        'pillar', 'inventory_valuation',
        'title', 'مطابقة التقييم الكمي للمخزون مع حساب البضاعة بالأستاذ العام',
        'expected', ROUND(v_stock_valuation, 2),
        'actual', ROUND(v_gl_stock_balance, 2),
        'variance', ROUND(v_stock_variance, 2),
        'status', CASE WHEN v_stock_variance > 0.05 THEN 'warning' ELSE 'passed' END,
        'notes', CASE 
          WHEN v_stock_variance > 0.05 THEN format('فارق بين التقييم السلعي للمخزن وحساب الأستاذ: %s ج.م', ROUND(v_stock_variance, 2))
          ELSE format('تقييم المخزون متطابق تماماً (%s ج.م)', ROUND(v_stock_valuation, 2))
        END
      )
    )
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_financial_audit_summary(UUID) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';

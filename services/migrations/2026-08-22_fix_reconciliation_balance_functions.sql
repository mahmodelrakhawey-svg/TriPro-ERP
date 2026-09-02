-- ==============================================================================
-- 🛠️ إصلاح دوال مطابقة أرصدة العملاء والموردين
-- التاريخ: 2026-08-22
-- الغرض: توحيد منطق حساب الأرصدة بين الواجهة (Frontend) وقاعدة البيانات (Backend)
-- يضمن:
--   1. عدم تكرار الرصيد الافتتاحي
--   2. احتساب التحصيل/السداد الفوري من الفواتير (paid_amount)
--   3. عدم ازدواجية الشيكات مع سندات القبض/الصرف
--   4. عدم ازدواجية مستخلصات مقاولي الباطن
--   5. ربط صحيح لمستخلصات المشاريع بـ customer_id
-- ==============================================================================

BEGIN;

-- ==============================================================================
-- 1. تأكد من وجود الأعمدة المطلوبة في الجداول
-- ==============================================================================

-- عمود paid_amount في invoices (إذا لم يكن موجوداً)
ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS paid_amount NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS treasury_account_id UUID REFERENCES public.accounts(id) ON DELETE SET NULL;

-- عمود paid_amount في purchase_invoices (إذا لم يكن موجوداً)
ALTER TABLE public.purchase_invoices
  ADD COLUMN IF NOT EXISTS paid_amount NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS treasury_account_id UUID REFERENCES public.accounts(id) ON DELETE SET NULL;

-- عمود payment_method في سندات القبض والصرف (إذا لم يكن موجوداً)
ALTER TABLE public.receipt_vouchers
  ADD COLUMN IF NOT EXISTS payment_method TEXT DEFAULT 'cash';

ALTER TABLE public.payment_vouchers
  ADD COLUMN IF NOT EXISTS payment_method TEXT DEFAULT 'cash';

-- عمود customer_id في جدول projects (للمقاولات)
ALTER TABLE IF EXISTS public.projects
  ADD COLUMN IF NOT EXISTS customer_id UUID REFERENCES public.customers(id) ON DELETE SET NULL;

-- عمود supplier_id في جدول subcontractors (لمنع ازدواجية المستخلصات)
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'subcontractors') THEN
    ALTER TABLE public.subcontractors
      ADD COLUMN IF NOT EXISTS supplier_id UUID REFERENCES public.suppliers(id) ON DELETE SET NULL;
  END IF;
END $$;

-- ==============================================================================
-- 2. دالة حساب رصيد العميل المُحدَّثة
--    المعادلة الصحيحة:
--    رصيد العميل = الرصيد الافتتاحي
--                 + إجمالي فواتير البيع
--                 + مستخلصات مشاريع المقاولات (مرتبطة بـ customer_id)
--                 - المبالغ المحصلة فوراً من داخل الفواتير (paid_amount)
--                 - سندات القبض المستقلة (طريقة الدفع ≠ شيك)
--                 - الشيكات الواردة غير المرفوضة (من جدول cheques)
--                 - مرتجعات المبيعات المرحلة
--                 - الإشعارات الدائنة المرحلة
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.get_customer_balance(p_customer_id uuid, p_org_id uuid)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_opening_balance       NUMERIC := 0;
    v_gross_invoices        NUMERIC := 0;  -- إجمالي الفواتير
    v_immediate_payments    NUMERIC := 0;  -- تحصيل فوري من الفواتير
    v_project_billings      NUMERIC := 0;  -- مستخلصات مشاريع المقاولات
    v_receipts              NUMERIC := 0;  -- سندات القبض المستقلة (غير الشيكات)
    v_cheques               NUMERIC := 0;  -- شيكات واردة غير مرفوضة
    v_returns               NUMERIC := 0;  -- مرتجعات مبيعات
    v_credit_notes          NUMERIC := 0;  -- إشعارات دائنة
BEGIN
    -- أ. الرصيد الافتتاحي للعميل
    SELECT COALESCE(opening_balance, 0)
      INTO v_opening_balance
      FROM public.customers
     WHERE id = p_customer_id AND organization_id = p_org_id;

    -- ب. إجمالي فواتير البيع المرحلة (كامل قيمة الفاتورة)
    SELECT COALESCE(SUM(total_amount), 0)
      INTO v_gross_invoices
      FROM public.invoices
     WHERE customer_id = p_customer_id
       AND organization_id = p_org_id
       AND status NOT IN ('draft', 'cancelled');

    -- ج. المبالغ المحصلة فوراً من داخل الفواتير (تُطرح مرة واحدة فقط)
    SELECT COALESCE(SUM(COALESCE(paid_amount, 0)), 0)
      INTO v_immediate_payments
      FROM public.invoices
     WHERE customer_id = p_customer_id
       AND organization_id = p_org_id
       AND status NOT IN ('draft', 'cancelled');

    -- د. مستخلصات مشاريع المقاولات المرتبطة بالعميل عبر customer_id
    IF EXISTS (
      SELECT 1 FROM information_schema.tables
       WHERE table_schema = 'public' AND table_name = 'project_progress_billings'
    ) AND EXISTS (
      SELECT 1 FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'projects' AND column_name = 'customer_id'
    ) THEN
        SELECT COALESCE(SUM(ppb.net_amount), 0)
          INTO v_project_billings
          FROM public.project_progress_billings ppb
          JOIN public.projects pr ON ppb.project_id = pr.id
         WHERE pr.customer_id = p_customer_id
           AND pr.organization_id = p_org_id
           AND ppb.status NOT IN ('draft', 'cancelled');
    END IF;

    -- هـ. سندات القبض المستقلة (باستثناء الشيكات لمنع التكرار)
    SELECT COALESCE(SUM(amount), 0)
      INTO v_receipts
      FROM public.receipt_vouchers
     WHERE customer_id = p_customer_id
       AND organization_id = p_org_id
       AND COALESCE(payment_method, 'cash') != 'cheque'
       AND (voucher_number NOT LIKE 'CHQ-%' OR voucher_number IS NULL);

    -- و. الشيكات الواردة غير المرفوضة (مرة واحدة من جدول cheques)
    IF EXISTS (
      SELECT 1 FROM information_schema.tables
       WHERE table_schema = 'public' AND table_name = 'cheques'
    ) THEN
        SELECT COALESCE(SUM(amount), 0)
          INTO v_cheques
          FROM public.cheques
         WHERE party_id = p_customer_id
           AND organization_id = p_org_id
           AND type = 'incoming'
           AND status != 'rejected';
    END IF;

    -- ز. مرتجعات المبيعات المرحلة
    SELECT COALESCE(SUM(total_amount), 0)
      INTO v_returns
      FROM public.sales_returns
     WHERE customer_id = p_customer_id
       AND organization_id = p_org_id
       AND status NOT IN ('draft', 'cancelled');

    -- ح. الإشعارات الدائنة المرحلة
    IF EXISTS (
      SELECT 1 FROM information_schema.tables
       WHERE table_schema = 'public' AND table_name = 'credit_notes'
    ) THEN
        SELECT COALESCE(SUM(total_amount), 0)
          INTO v_credit_notes
          FROM public.credit_notes
         WHERE customer_id = p_customer_id
           AND organization_id = p_org_id
           AND status = 'posted';
    END IF;

    RETURN v_opening_balance
         + v_gross_invoices
         + v_project_billings
         - v_immediate_payments
         - v_receipts
         - v_cheques
         - v_returns
         - v_credit_notes;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_customer_balance(uuid, uuid) TO authenticated;


-- ==============================================================================
-- 3. دالة حساب رصيد المورد المُحدَّثة
--    المعادلة الصحيحة:
--    رصيد المورد = الرصيد الافتتاحي
--                + إجمالي فواتير المشتريات
--                + مستخلصات مقاولي الباطن المرتبطين بهذا المورد (supplier_id)
--                - المبالغ المسددة فوراً من داخل الفواتير (paid_amount)
--                - سندات الصرف المستقلة (طريقة الدفع ≠ شيك)
--                - الشيكات الصادرة غير المرفوضة (من جدول cheques)
--                - مرتجعات المشتريات المرحلة
--                - الإشعارات المدينة المرحلة
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.get_supplier_balance(p_supplier_id uuid, p_org_id uuid)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_opening_balance       NUMERIC := 0;
    v_gross_invoices        NUMERIC := 0;  -- إجمالي فواتير المشتريات
    v_immediate_payments    NUMERIC := 0;  -- سداد فوري من الفواتير
    v_sub_billings          NUMERIC := 0;  -- مستخلصات مقاولي الباطن المرتبطين بالمورد
    v_payments              NUMERIC := 0;  -- سندات الصرف المستقلة (غير الشيكات)
    v_cheques               NUMERIC := 0;  -- شيكات صادرة غير مرفوضة
    v_returns               NUMERIC := 0;  -- مرتجعات مشتريات
    v_debit_notes           NUMERIC := 0;  -- إشعارات مدينة
BEGIN
    -- أ. الرصيد الافتتاحي للمورد
    SELECT COALESCE(opening_balance, 0)
      INTO v_opening_balance
      FROM public.suppliers
     WHERE id = p_supplier_id AND organization_id = p_org_id;

    -- ب. إجمالي فواتير المشتريات المرحلة (كامل قيمة الفاتورة)
    SELECT COALESCE(SUM(total_amount), 0)
      INTO v_gross_invoices
      FROM public.purchase_invoices
     WHERE supplier_id = p_supplier_id
       AND organization_id = p_org_id
       AND status NOT IN ('draft', 'cancelled');

    -- ج. المبالغ المسددة فوراً من داخل فواتير المشتريات
    SELECT COALESCE(SUM(COALESCE(paid_amount, 0)), 0)
      INTO v_immediate_payments
      FROM public.purchase_invoices
     WHERE supplier_id = p_supplier_id
       AND organization_id = p_org_id
       AND status NOT IN ('draft', 'cancelled');

    -- د. مستخلصات مقاولي الباطن المرتبطين بهذا المورد عبر supplier_id
    --    (تُضاف مرة واحدة فقط — إذا كان المقاول مسجلاً كمورد)
    IF EXISTS (
      SELECT 1 FROM information_schema.tables
       WHERE table_schema = 'public' AND table_name = 'subcontractor_billings'
    ) AND EXISTS (
      SELECT 1 FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'subcontractors' AND column_name = 'supplier_id'
    ) THEN
        SELECT COALESCE(SUM(sb.net_amount), 0)
          INTO v_sub_billings
          FROM public.subcontractor_billings sb
          JOIN public.subcontractor_contracts sc ON (sb.contract_id = sc.id)
          JOIN public.subcontractors s ON sc.subcontractor_id = s.id
         WHERE s.supplier_id = p_supplier_id
           AND sb.organization_id = p_org_id
           AND sb.status NOT IN ('draft', 'cancelled');
    END IF;

    -- هـ. سندات الصرف المستقلة (باستثناء الشيكات لمنع التكرار)
    SELECT COALESCE(SUM(amount), 0)
      INTO v_payments
      FROM public.payment_vouchers
     WHERE supplier_id = p_supplier_id
       AND organization_id = p_org_id
       AND COALESCE(payment_method, 'cash') != 'cheque'
       AND (voucher_number NOT LIKE 'CHQ-%' OR voucher_number IS NULL);

    -- و. الشيكات الصادرة غير المرفوضة (مرة واحدة من جدول cheques)
    IF EXISTS (
      SELECT 1 FROM information_schema.tables
       WHERE table_schema = 'public' AND table_name = 'cheques'
    ) THEN
        SELECT COALESCE(SUM(amount), 0)
          INTO v_cheques
          FROM public.cheques
         WHERE party_id = p_supplier_id
           AND organization_id = p_org_id
           AND type = 'outgoing'
           AND status != 'rejected';
    END IF;

    -- ز. مرتجعات المشتريات المرحلة
    SELECT COALESCE(SUM(total_amount), 0)
      INTO v_returns
      FROM public.purchase_returns
     WHERE supplier_id = p_supplier_id
       AND organization_id = p_org_id
       AND status NOT IN ('draft', 'cancelled');

    -- ح. الإشعارات المدينة المرحلة
    IF EXISTS (
      SELECT 1 FROM information_schema.tables
       WHERE table_schema = 'public' AND table_name = 'debit_notes'
    ) THEN
        SELECT COALESCE(SUM(total_amount), 0)
          INTO v_debit_notes
          FROM public.debit_notes
         WHERE supplier_id = p_supplier_id
           AND organization_id = p_org_id
           AND status = 'posted';
    END IF;

    RETURN v_opening_balance
         + v_gross_invoices
         + v_sub_billings
         - v_immediate_payments
         - v_payments
         - v_cheques
         - v_returns
         - v_debit_notes;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_supplier_balance(uuid, uuid) TO authenticated;


-- ==============================================================================
-- 4. إعادة بناء دالة recalculate_all_balances لتستخدم الدوال المحدثة
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.recalculate_all_balances(p_org_id uuid DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_org_id uuid;
BEGIN
    v_org_id := COALESCE(p_org_id, public.get_my_org());
    IF v_org_id IS NULL THEN RETURN; END IF;

    -- أ. تحديث أرصدة الحسابات في الأستاذ العام
    UPDATE public.accounts a
       SET balance = (
           SELECT COALESCE(SUM(jl.debit - jl.credit), 0)
             FROM public.journal_lines jl
             JOIN public.journal_entries je ON jl.journal_entry_id = je.id
            WHERE jl.account_id = a.id
              AND je.status = 'posted'
              AND je.organization_id = v_org_id
       )
     WHERE a.organization_id = v_org_id;

    -- ب. تحديث أرصدة العملاء بالمنطق المحدث
    UPDATE public.customers c
       SET balance = public.get_customer_balance(c.id, v_org_id)
     WHERE c.organization_id = v_org_id
       AND c.deleted_at IS NULL;

    -- ج. تحديث أرصدة الموردين بالمنطق المحدث
    UPDATE public.suppliers s
       SET balance = public.get_supplier_balance(s.id, v_org_id)
     WHERE s.organization_id = v_org_id
       AND s.deleted_at IS NULL;

    -- د. إعادة حساب المخزون
    PERFORM public.recalculate_stock_rpc(v_org_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.recalculate_all_balances(uuid) TO authenticated;


-- ==============================================================================
-- 5. دالة مساعدة: إعادة حساب أرصدة منظمة واحدة (تُستدعى من الواجهة)
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.recalculate_all_system_balances(p_org_id uuid DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    PERFORM public.recalculate_all_balances(p_org_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.recalculate_all_system_balances(uuid) TO authenticated;


-- ==============================================================================
-- 6. تشغيل إعادة الحساب الشامل على كافة الشركات الآن لتصحيح البيانات الحالية
-- ==============================================================================
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN SELECT id FROM public.organizations LOOP
        BEGIN
            PERFORM public.recalculate_all_balances(r.id);
        EXCEPTION WHEN OTHERS THEN
            RAISE WARNING 'فشل إعادة الحساب للشركة %: %', r.id, SQLERRM;
        END;
    END LOOP;
END $$;


-- ==============================================================================
-- 7. فهرسة إضافية لتحسين أداء الاستعلامات (إذا لم تكن موجودة)
-- ==============================================================================

-- فهرس على invoices.customer_id + status
CREATE INDEX IF NOT EXISTS idx_invoices_customer_status
  ON public.invoices(customer_id, status)
  WHERE status NOT IN ('draft', 'cancelled');

-- فهرس على purchase_invoices.supplier_id + status
CREATE INDEX IF NOT EXISTS idx_purchase_invoices_supplier_status
  ON public.purchase_invoices(supplier_id, status)
  WHERE status NOT IN ('draft', 'cancelled');

-- فهرس على receipt_vouchers.customer_id + payment_method
CREATE INDEX IF NOT EXISTS idx_receipt_vouchers_customer_method
  ON public.receipt_vouchers(customer_id, payment_method);

-- فهرس على payment_vouchers.supplier_id + payment_method
CREATE INDEX IF NOT EXISTS idx_payment_vouchers_supplier_method
  ON public.payment_vouchers(supplier_id, payment_method);

-- فهرس على cheques.party_id + type + status
CREATE INDEX IF NOT EXISTS idx_cheques_party_type_status
  ON public.cheques(party_id, type, status);

-- فهرس على journal_lines.account_id (إن لم يكن موجوداً)
CREATE INDEX IF NOT EXISTS idx_journal_lines_account_id
  ON public.journal_lines(account_id);

-- فهرس على projects.customer_id
CREATE INDEX IF NOT EXISTS idx_projects_customer_id
  ON public.projects(customer_id)
  WHERE customer_id IS NOT NULL;

COMMIT;

-- ==============================================================================
-- ✅ ملاحظات للمطور:
-- 1. هذا الملف آمن للتشغيل أكثر من مرة (كل الأوامر تستخدم IF NOT EXISTS أو CREATE OR REPLACE)
-- 2. تأكد أن جدول projects يحتوي على عمود customer_id قبل ربط المستخلصات بالعملاء
-- 3. تأكد أن جدول subcontractors يحتوي على عمود supplier_id لمنع ازدواجية المستخلصات
-- 4. إذا كان عمود paid_amount غير موجود في invoices/purchase_invoices، سيُضاف تلقائياً
-- ==============================================================================

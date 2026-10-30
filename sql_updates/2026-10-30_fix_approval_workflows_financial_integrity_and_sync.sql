-- ==============================================================================
-- TriPro-ERP: درع النزاهة المالية الشامل لمسارات الاعتماد وسندات الصرف واليومية العامة
-- النسخة المحسنة فائقة السرعة (Ultra-Fast Lightweight Migration - Zero Timeout)
-- التاريخ: 30 أكتوبر 2026
-- ==============================================================================

BEGIN;

-- تفعيل إذن التعديل المالي محلياً
SELECT set_config('app.allow_financial_ledger_mutation', 'true', false);

-- 1. التأكد من وجود أعمدة status و deleted_at لسندات الصرف والقبض
ALTER TABLE public.payment_vouchers ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'posted';
ALTER TABLE public.payment_vouchers ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ DEFAULT NULL;
CREATE INDEX IF NOT EXISTS idx_payment_vouchers_status ON public.payment_vouchers(status);
CREATE INDEX IF NOT EXISTS idx_payment_vouchers_deleted_at ON public.payment_vouchers(deleted_at) WHERE deleted_at IS NULL;

ALTER TABLE public.receipt_vouchers ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'posted';
ALTER TABLE public.receipt_vouchers ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ DEFAULT NULL;
CREATE INDEX IF NOT EXISTS idx_receipt_vouchers_status ON public.receipt_vouchers(status);
CREATE INDEX IF NOT EXISTS idx_receipt_vouchers_deleted_at ON public.receipt_vouchers(deleted_at) WHERE deleted_at IS NULL;

-- 2. تحسين حارس أسطر القيود: السماح بتحديث البيان والوصف مع استمرار الحظر الصارم على تعديل الحسابات أو المبالغ أو الحذف
CREATE OR REPLACE FUNCTION public.fn_guard_journal_lines_immutability()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_parent_status text;
    v_parent_is_posted boolean;
    v_target_entry_id uuid;
    v_bypass text;
BEGIN
    BEGIN
        v_bypass := current_setting('app.allow_financial_ledger_mutation', true);
        IF v_bypass = 'true' THEN
            RETURN COALESCE(NEW, OLD);
        END IF;
    EXCEPTION WHEN OTHERS THEN
        NULL;
    END;

    v_target_entry_id := COALESCE(OLD.journal_entry_id, NEW.journal_entry_id);

    SELECT status, is_posted INTO v_parent_status, v_parent_is_posted
    FROM public.journal_entries
    WHERE id = v_target_entry_id;

    IF v_parent_status = 'posted' OR v_parent_is_posted = true THEN
        -- منع الحذف التام للأسطر المرحلة للأستاذ العام
        IF TG_OP = 'DELETE' THEN
            RAISE EXCEPTION 'TRIPRO_SECURITY_ALERT: لا يمكن حذف أسطر القيد المحاسبي بعد ترحيله للأستاذ العام.';
        END IF;

        -- منع تعديل الحسابات والمبالغ (يُسمح فقط بتصحيح البيان الوصفي دون المساس بالأثر المالي)
        IF TG_OP = 'UPDATE' THEN
            IF (NEW.account_id IS DISTINCT FROM OLD.account_id OR
                NEW.debit IS DISTINCT FROM OLD.debit OR
                NEW.credit IS DISTINCT FROM OLD.credit OR
                NEW.journal_entry_id IS DISTINCT FROM OLD.journal_entry_id) THEN
                RAISE EXCEPTION 'TRIPRO_SECURITY_ALERT: أسطر القيد المحاسبي المرحل محصنة ولا يمكن تعديل حساباتها أو مبالغها مباشرة. يتوجب عمل قيد عكسي.';
            END IF;
        END IF;
    END IF;

    RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_journal_lines_immutability ON public.journal_lines;
CREATE TRIGGER trg_guard_journal_lines_immutability
BEFORE UPDATE OR DELETE ON public.journal_lines
FOR EACH ROW
EXECUTE FUNCTION public.fn_guard_journal_lines_immutability();

-- 3. تحديث تريجر تزامن قيود سندات الصرف لمنع إنشاء أو ترحيل قيود عند الرفض أو الإلغاء
CREATE OR REPLACE FUNCTION public.fn_sync_payment_voucher_journal()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_journal_id uuid;
    v_debit_acc_id uuid;
    v_org_id uuid;
    v_prev_bypass text;
BEGIN
    IF pg_trigger_depth() > 1 THEN
        IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
    END IF;

    v_prev_bypass := current_setting('app.allow_financial_ledger_mutation', true);

    -- أ. معالجة الحذف الفعلي (Hard Delete)
    IF TG_OP = 'DELETE' THEN
        v_journal_id := OLD.related_journal_entry_id;
        IF v_journal_id IS NOT NULL THEN
            PERFORM set_config('app.allow_financial_ledger_mutation', 'true', true);
            UPDATE public.journal_entries SET status = 'draft', is_posted = false WHERE id = v_journal_id;
            DELETE FROM public.journal_lines WHERE journal_entry_id = v_journal_id;
            DELETE FROM public.journal_entries WHERE id = v_journal_id;
            IF v_prev_bypass IS DISTINCT FROM 'true' THEN
                PERFORM set_config('app.allow_financial_ledger_mutation', 'false', true);
            END IF;
        END IF;
        RETURN OLD;
    END IF;

    -- ب. معالجة التعديل (UPDATE)
    IF TG_OP = 'UPDATE' THEN
        IF (NEW.deleted_at IS NOT NULL AND OLD.deleted_at IS NULL)
           OR (NEW.status IN ('rejected', 'cancelled') AND (OLD.status IS NULL OR OLD.status NOT IN ('rejected', 'cancelled')))
           OR (NEW.notes ILIKE '[مرفوض%' AND (OLD.notes IS NULL OR OLD.notes NOT ILIKE '[مرفوض%')) THEN

            PERFORM set_config('app.allow_financial_ledger_mutation', 'true', true);

            v_journal_id := COALESCE(NEW.related_journal_entry_id, OLD.related_journal_entry_id);
            IF v_journal_id IS NOT NULL THEN
                UPDATE public.journal_entries SET status = 'rejected', is_posted = false WHERE id = v_journal_id;
                DELETE FROM public.journal_lines WHERE journal_entry_id = v_journal_id;
                DELETE FROM public.journal_entries WHERE id = v_journal_id;
            END IF;

            IF NEW.voucher_number IS NOT NULL THEN
                DELETE FROM public.journal_lines WHERE journal_entry_id IN (
                    SELECT id FROM public.journal_entries WHERE reference = NEW.voucher_number
                );
                DELETE FROM public.journal_entries WHERE reference = NEW.voucher_number;
            END IF;

            IF v_prev_bypass IS DISTINCT FROM 'true' THEN
                PERFORM set_config('app.allow_financial_ledger_mutation', 'false', true);
            END IF;

            NEW.related_journal_entry_id := NULL;
            RETURN NEW;
        END IF;

        IF NEW.status IN ('pending_approval', 'draft') OR NEW.notes ILIKE '[معلق للاعتماد%' THEN
            RETURN NEW;
        END IF;

        IF (OLD.treasury_account_id IS DISTINCT FROM NEW.treasury_account_id)
           OR (OLD.amount IS DISTINCT FROM NEW.amount)
           OR (OLD.payment_date IS DISTINCT FROM NEW.payment_date)
           OR (OLD.notes IS DISTINCT FROM NEW.notes)
           OR (OLD.cost_center_id IS DISTINCT FROM NEW.cost_center_id) THEN

            v_journal_id := NEW.related_journal_entry_id;
            v_org_id := COALESCE(NEW.organization_id, OLD.organization_id, public.get_my_org());

            IF v_journal_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.journal_entries WHERE id = v_journal_id) THEN
                SELECT account_id INTO v_debit_acc_id 
                FROM public.journal_lines 
                WHERE journal_entry_id = v_journal_id AND debit > 0 
                LIMIT 1;

                IF v_debit_acc_id IS NULL AND NEW.supplier_id IS NOT NULL THEN
                    SELECT id INTO v_debit_acc_id 
                    FROM public.accounts 
                    WHERE organization_id = v_org_id AND (code = '201' OR code LIKE '201%' OR name ILIKE '%مورد%') 
                    LIMIT 1;
                END IF;

                IF v_debit_acc_id IS NOT NULL AND NEW.treasury_account_id IS NOT NULL THEN
                    PERFORM public.approve_payment_voucher(NEW.id, v_debit_acc_id);
                END IF;
            END IF;
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_payment_voucher_journal ON public.payment_vouchers;
CREATE TRIGGER trg_sync_payment_voucher_journal
AFTER UPDATE OR DELETE ON public.payment_vouchers
FOR EACH ROW EXECUTE FUNCTION public.fn_sync_payment_voucher_journal();

-- 4. تحديث تريجر تزامن قيود سندات القبض بالمثل
CREATE OR REPLACE FUNCTION public.fn_sync_receipt_voucher_journal()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_journal_id uuid;
    v_credit_acc_id uuid;
    v_org_id uuid;
    v_prev_bypass text;
BEGIN
    IF pg_trigger_depth() > 1 THEN
        IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
    END IF;

    v_prev_bypass := current_setting('app.allow_financial_ledger_mutation', true);

    IF TG_OP = 'DELETE' THEN
        v_journal_id := OLD.related_journal_entry_id;
        IF v_journal_id IS NOT NULL THEN
            PERFORM set_config('app.allow_financial_ledger_mutation', 'true', true);
            UPDATE public.journal_entries SET status = 'draft', is_posted = false WHERE id = v_journal_id;
            DELETE FROM public.journal_lines WHERE journal_entry_id = v_journal_id;
            DELETE FROM public.journal_entries WHERE id = v_journal_id;
            IF v_prev_bypass IS DISTINCT FROM 'true' THEN
                PERFORM set_config('app.allow_financial_ledger_mutation', 'false', true);
            END IF;
        END IF;
        RETURN OLD;
    END IF;

    IF TG_OP = 'UPDATE' THEN
        IF (NEW.deleted_at IS NOT NULL AND OLD.deleted_at IS NULL)
           OR (NEW.status IN ('rejected', 'cancelled') AND (OLD.status IS NULL OR OLD.status NOT IN ('rejected', 'cancelled')))
           OR (NEW.notes ILIKE '[مرفوض%' AND (OLD.notes IS NULL OR OLD.notes NOT ILIKE '[مرفوض%')) THEN

            PERFORM set_config('app.allow_financial_ledger_mutation', 'true', true);

            v_journal_id := COALESCE(NEW.related_journal_entry_id, OLD.related_journal_entry_id);
            IF v_journal_id IS NOT NULL THEN
                UPDATE public.journal_entries SET status = 'rejected', is_posted = false WHERE id = v_journal_id;
                DELETE FROM public.journal_lines WHERE journal_entry_id = v_journal_id;
                DELETE FROM public.journal_entries WHERE id = v_journal_id;
            END IF;

            IF NEW.voucher_number IS NOT NULL THEN
                DELETE FROM public.journal_lines WHERE journal_entry_id IN (
                    SELECT id FROM public.journal_entries WHERE reference = NEW.voucher_number
                );
                DELETE FROM public.journal_entries WHERE reference = NEW.voucher_number;
            END IF;

            IF v_prev_bypass IS DISTINCT FROM 'true' THEN
                PERFORM set_config('app.allow_financial_ledger_mutation', 'false', true);
            END IF;

            NEW.related_journal_entry_id := NULL;
            RETURN NEW;
        END IF;

        IF NEW.status IN ('pending_approval', 'draft') OR NEW.notes ILIKE '[معلق للاعتماد%' THEN
            RETURN NEW;
        END IF;

        IF (OLD.treasury_account_id IS DISTINCT FROM NEW.treasury_account_id)
           OR (OLD.amount IS DISTINCT FROM NEW.amount)
           OR (OLD.receipt_date IS DISTINCT FROM NEW.receipt_date)
           OR (OLD.notes IS DISTINCT FROM NEW.notes) THEN

            v_journal_id := NEW.related_journal_entry_id;
            v_org_id := COALESCE(NEW.organization_id, OLD.organization_id, public.get_my_org());

            IF v_journal_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.journal_entries WHERE id = v_journal_id) THEN
                SELECT account_id INTO v_credit_acc_id 
                FROM public.journal_lines 
                WHERE journal_entry_id = v_journal_id AND credit > 0 
                LIMIT 1;

                IF v_credit_acc_id IS NULL AND NEW.customer_id IS NOT NULL THEN
                    SELECT id INTO v_credit_acc_id 
                    FROM public.accounts 
                    WHERE organization_id = v_org_id AND (code = '1221' OR code LIKE '122%' OR name ILIKE '%عميل%' OR name ILIKE '%عملاء%') 
                    LIMIT 1;
                END IF;

                IF v_credit_acc_id IS NOT NULL AND NEW.treasury_account_id IS NOT NULL THEN
                    PERFORM public.approve_receipt_voucher(NEW.id, v_credit_acc_id);
                END IF;
            END IF;
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_receipt_voucher_journal ON public.receipt_vouchers;
CREATE TRIGGER trg_sync_receipt_voucher_journal
AFTER UPDATE OR DELETE ON public.receipt_vouchers
FOR EACH ROW EXECUTE FUNCTION public.fn_sync_receipt_voucher_journal();

-- 5. تنظيف القيود والسندات المحددة بسرعة فائقة باستخدام الفهارس المباشرة
DO $$
BEGIN
    PERFORM set_config('app.allow_financial_ledger_mutation', 'true', true);

    -- أ. تصحيح سند الصرف PV-224290
    UPDATE public.payment_vouchers
    SET status = 'rejected',
        deleted_at = COALESCE(deleted_at, now()),
        related_journal_entry_id = NULL
    WHERE voucher_number = 'PV-224290';

    -- ب. حذف وتصفير قيد اليومية المرتبط بسند الصرف المرفوض PV-224290
    DELETE FROM public.journal_lines 
    WHERE journal_entry_id IN (
        SELECT id FROM public.journal_entries 
        WHERE reference = 'PV-224290'
    );

    DELETE FROM public.journal_entries 
    WHERE reference = 'PV-224290';

    -- ج. تنظيف بيان القيد اليدوي المعتمد MAN-849265
    UPDATE public.journal_entries
    SET description = REGEXP_REPLACE(description, '^\[قيد معلق للاعتماد:[^\]]*\]\s*', ''),
        status = 'posted',
        is_posted = true
    WHERE reference = 'MAN-849265';

    UPDATE public.journal_lines
    SET description = REGEXP_REPLACE(description, '^\[قيد معلق للاعتماد:[^\]]*\]\s*', '')
    WHERE journal_entry_id IN (
        SELECT id FROM public.journal_entries WHERE reference = 'MAN-849265'
    );

    PERFORM set_config('app.allow_financial_ledger_mutation', 'false', true);
END $$;

-- 6. حارس إضافي على جدول القيود لمنع ترحيل أي مسودة معلقة أو مرفوضة في قاعدة البيانات
CREATE OR REPLACE FUNCTION public.fn_guard_journal_entry_approval()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_bypass text;
    v_has_pending_approval boolean;
BEGIN
    BEGIN
        v_bypass := current_setting('app.allow_financial_ledger_mutation', true);
        IF v_bypass = 'true' THEN
            RETURN NEW;
        END IF;
    EXCEPTION WHEN OTHERS THEN
        NULL;
    END;

    IF (NEW.status = 'posted' OR NEW.is_posted = true) THEN
        IF NEW.description ILIKE '%[قيد معلق للاعتماد%' THEN
            RAISE EXCEPTION 'TRIPRO_SECURITY_ALERT: لا يمكن ترحيل هذا القيد للأستاذ العام! القيد معلق بانتظار موافقة مسار الاعتماد الإداري والمالي.';
        END IF;

        IF NEW.description ILIKE '%[مرفوض%' OR NEW.status = 'rejected' THEN
            RAISE EXCEPTION 'TRIPRO_SECURITY_ALERT: محظور: تم رفض هذا القيد رسمياً من مسار الاعتماد ولا يمكن ترحيله للأستاذ العام نهائياً.';
        END IF;

        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'approval_requests') THEN
            SELECT EXISTS (
                SELECT 1 FROM public.approval_requests 
                WHERE (document_id = NEW.id OR document_reference = NEW.reference)
                  AND status = 'PENDING'
            ) INTO v_has_pending_approval;

            IF v_has_pending_approval THEN
                RAISE EXCEPTION 'TRIPRO_SECURITY_ALERT: لا يمكن ترحيل القيد (%) لوجود طلب اعتماد معلق بانتظار الموافقة في مسارات الاعتماد.', COALESCE(NEW.reference, NEW.id::text);
            END IF;
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_journal_entry_approval ON public.journal_entries;
CREATE TRIGGER trg_guard_journal_entry_approval
BEFORE INSERT OR UPDATE ON public.journal_entries
FOR EACH ROW EXECUTE FUNCTION public.fn_guard_journal_entry_approval();

-- 7. تحديث دالة get_supplier_balance لاستبعاد السندات المرفوضة أو المحذوفة
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
    SELECT COALESCE(opening_balance, 0), COALESCE(name, '')
      INTO v_opening_balance, v_supplier_name
      FROM public.suppliers
     WHERE id = p_supplier_id AND (organization_id = p_org_id OR p_org_id IS NULL);

    -- فواتير المشتريات المعتمدة فقط
    SELECT COALESCE(SUM(total_amount), 0)
      INTO v_gross_invoices
      FROM public.purchase_invoices
     WHERE supplier_id = p_supplier_id
       AND (organization_id = p_org_id OR p_org_id IS NULL)
       AND status NOT IN ('draft', 'cancelled', 'rejected');

    -- السداد الفوري
    SELECT COALESCE(SUM(COALESCE(paid_amount, 0)), 0)
      INTO v_immediate_payments
      FROM public.purchase_invoices
     WHERE supplier_id = p_supplier_id
       AND (organization_id = p_org_id OR p_org_id IS NULL)
       AND status NOT IN ('draft', 'cancelled', 'rejected');

    -- سندات الصرف المعتمدة والنشطة فقط
    SELECT COALESCE(SUM(amount), 0)
      INTO v_payments
      FROM public.payment_vouchers
     WHERE supplier_id = p_supplier_id
       AND (organization_id = p_org_id OR p_org_id IS NULL)
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
           AND (organization_id = p_org_id OR p_org_id IS NULL)
           AND type = 'outgoing'
           AND status NOT IN ('rejected', 'cancelled');
    END IF;

    -- مرتجعات المشتريات
    SELECT COALESCE(SUM(total_amount), 0)
      INTO v_returns
      FROM public.purchase_returns
     WHERE supplier_id = p_supplier_id
       AND (organization_id = p_org_id OR p_org_id IS NULL)
       AND status NOT IN ('draft', 'cancelled', 'rejected');

    -- الإشعارات المدينة
    SELECT COALESCE(SUM(total_amount), 0)
      INTO v_debit_notes
      FROM public.debit_notes
     WHERE supplier_id = p_supplier_id
       AND (organization_id = p_org_id OR p_org_id IS NULL)
       AND status = 'posted';

    -- قيود اليومية اليدوية المرحلة فقط
    SELECT 
        COALESCE(SUM(jl.credit), 0),
        COALESCE(SUM(jl.debit), 0)
    INTO v_manual_credit, v_manual_debit
    FROM public.journal_lines jl
    JOIN public.journal_entries je ON jl.journal_entry_id = je.id
    WHERE (je.organization_id = p_org_id OR p_org_id IS NULL)
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

-- إغلاق إذن التعديل المالي
SELECT set_config('app.allow_financial_ledger_mutation', 'false', false);

COMMIT;

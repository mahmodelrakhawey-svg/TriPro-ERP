-- ========================================================================================
-- TriPro ERP — Enterprise Data Integrity & Accounting Constraints Migration
-- تاريخ الإنشاء: 2026-08-23
-- الغرض: تشديد محددات سلامة البيانات وحماية دفتر الأستاذ العام وشجرة الحسابات من أي اختلال
-- ========================================================================================

-- ----------------------------------------------------------------------------------------
-- 1. حماية توازن القيود المحاسبية (Zero-Imbalance Constraint on Posted Entries)
-- ----------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_enforce_journal_entry_balance()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_total_debit NUMERIC(15, 2);
    v_total_credit NUMERIC(15, 2);
    v_lines_count INTEGER;
BEGIN
    -- إذا كان القيد مرحلاً (posted)
    IF NEW.status = 'posted' THEN
        SELECT 
            COALESCE(SUM(debit), 0),
            COALESCE(SUM(credit), 0),
            COUNT(*)
        INTO 
            v_total_debit,
            v_total_credit,
            v_lines_count
        FROM public.journal_lines
        WHERE journal_entry_id = NEW.id;

        -- التحقق من وجود طرفين على الأقل للقيد
        IF v_lines_count < 2 THEN
            RAISE EXCEPTION 'لا يمكن ترحيل قيد يومية يحتوي على أقل من طرفين محاسبيين (قيد: %)', NEW.id;
        END IF;

        -- التحقق من تطابق المدين والدائن 100%
        IF ABS(v_total_debit - v_total_credit) > 0.001 THEN
            RAISE EXCEPTION 'لا يمكن ترحيل قيد يومية غير متوازن (إجمالي المدين: %, إجمالي الدائن: %)', v_total_debit, v_total_credit;
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_journal_entry_balance ON public.journal_entries;
CREATE CONSTRAINT TRIGGER trg_enforce_journal_entry_balance
AFTER INSERT OR UPDATE OF status ON public.journal_entries
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION public.fn_enforce_journal_entry_balance();


-- ----------------------------------------------------------------------------------------
-- 2. حظر تعديل أو حذف سطور القيود المحاسبية بعد ترحيلها (Immutability of Posted Lines)
-- ----------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_protect_posted_journal_lines()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_status TEXT;
BEGIN
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

DROP TRIGGER IF EXISTS trg_protect_posted_journal_lines ON public.journal_lines;
CREATE TRIGGER trg_protect_posted_journal_lines
BEFORE UPDATE OR DELETE ON public.journal_lines
FOR EACH ROW
EXECUTE FUNCTION public.fn_protect_posted_journal_lines();


-- ----------------------------------------------------------------------------------------
-- 3. حماية شجرة الحسابات من الحذف في حال وجود حركات مسجلة
-- ----------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_protect_accounts_with_entries()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO v_count FROM public.journal_lines WHERE account_id = OLD.id;
    IF v_count > 0 THEN
        RAISE EXCEPTION 'لا يمكن حذف الحساب (% - %) لوجود % حركة/حركات محاسبية مسجلة عليه.', OLD.code, OLD.name, v_count;
    END IF;
    RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_accounts_with_entries ON public.accounts;
CREATE TRIGGER trg_protect_accounts_with_entries
BEFORE DELETE ON public.accounts
FOR EACH ROW
EXECUTE FUNCTION public.fn_protect_accounts_with_entries();


-- ----------------------------------------------------------------------------------------
-- 4. حماية العملاء والموردين من الحذف الصلب (Hard Delete) في حال وجود فواتير أو سندات
-- ----------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_protect_customers_with_transactions()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_inv_count INTEGER;
    v_rv_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO v_inv_count FROM public.invoices WHERE customer_id = OLD.id;
    SELECT COUNT(*) INTO v_rv_count FROM public.receipt_vouchers WHERE customer_id = OLD.id;
    
    IF (v_inv_count + v_rv_count) > 0 THEN
        RAISE EXCEPTION 'لا يمكن الحذف النهائي للعميل (%) لوجود مستندات مالية مرتبطة به. استخدم الحذف المنطقي (Archive/Soft Delete).', OLD.name;
    END IF;
    RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_customers_with_transactions ON public.customers;
CREATE TRIGGER trg_protect_customers_with_transactions
BEFORE DELETE ON public.customers
FOR EACH ROW
EXECUTE FUNCTION public.fn_protect_customers_with_transactions();


CREATE OR REPLACE FUNCTION public.fn_protect_suppliers_with_transactions()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_pi_count INTEGER;
    v_pv_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO v_pi_count FROM public.purchase_invoices WHERE supplier_id = OLD.id;
    SELECT COUNT(*) INTO v_pv_count FROM public.payment_vouchers WHERE supplier_id = OLD.id;
    
    IF (v_pi_count + v_pv_count) > 0 THEN
        RAISE EXCEPTION 'لا يمكن الحذف النهائي للمورد (%) لوجود مستندات مالية مرتبطة به.', OLD.name;
    END IF;
    RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_suppliers_with_transactions ON public.suppliers;
CREATE TRIGGER trg_protect_suppliers_with_transactions
BEFORE DELETE ON public.suppliers
FOR EACH ROW
EXECUTE FUNCTION public.fn_protect_suppliers_with_transactions();


-- ----------------------------------------------------------------------------------------
-- 5. فهارس منع تكرار أرقام المستندات للمنظمة الواحدة (Unique Numbering per Tenant)
-- ----------------------------------------------------------------------------------------
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_unique_invoices_per_org') THEN
        CREATE UNIQUE INDEX idx_unique_invoices_per_org 
        ON public.invoices (organization_id, invoice_number) 
        WHERE status NOT IN ('draft', 'cancelled');
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_unique_purchases_per_org') THEN
        CREATE UNIQUE INDEX idx_unique_purchases_per_org 
        ON public.purchase_invoices (organization_id, invoice_number) 
        WHERE status NOT IN ('draft', 'cancelled');
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_unique_rv_per_org') THEN
        CREATE UNIQUE INDEX idx_unique_rv_per_org 
        ON public.receipt_vouchers (organization_id, voucher_number);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_unique_pv_per_org') THEN
        CREATE UNIQUE INDEX idx_unique_pv_per_org 
        ON public.payment_vouchers (organization_id, voucher_number);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_unique_progress_billings_per_org') THEN
        CREATE UNIQUE INDEX idx_unique_progress_billings_per_org 
        ON public.project_progress_billings (organization_id, billing_number) 
        WHERE status NOT IN ('draft', 'cancelled');
    END IF;
END $$;

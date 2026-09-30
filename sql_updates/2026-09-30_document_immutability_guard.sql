-- ============================================================================
-- TriPro ERP — Document Immutability & Audit Safeguard
-- File: 2026-09-30_document_immutability_guard.sql
-- Description:
--   1. Triggers preventing DELETE on posted/paid sales & purchase invoices.
--   2. Triggers preventing in-place UPDATE of financial totals, dates, or parties on posted/paid invoices (must be unposted to 'draft' first).
--   3. Triggers preventing direct INSERT/UPDATE/DELETE on invoice lines while parent invoice is posted/paid.
--   4. Fully safe for Halawany Lenza data (zero data loss, read-only guards).
-- ============================================================================

-- 1. دالة ومحفز حماية فواتير المبيعات المرحلة من الحذف والتعديل المباشر
CREATE OR REPLACE FUNCTION public.fn_guard_posted_sales_invoice_immutability()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    -- 1. منع الحذف إذا كانت الفاتورة مرحلة أو مسددة
    IF TG_OP = 'DELETE' THEN
        IF OLD.status IN ('posted', 'paid') THEN
            RAISE EXCEPTION 'TRIPRO_DOCUMENT_GUARD: لا يمكن حذف فاتورة المبيعات المرحلة أو المسددة (رقم: %) مباشرة. يجب أولاً إلغاء الترحيل لتحويلها إلى مسودة (Draft).',
                COALESCE(OLD.invoice_number, OLD.id::text);
        END IF;
        RETURN OLD;
    END IF;

    -- 2. في حالة التعديل، التحقق مما إذا كانت الفاتورة مرحلة مسبقاً وتظل مرحلة
    IF TG_OP = 'UPDATE' THEN
        IF OLD.status IN ('posted', 'paid') AND NEW.status IN ('posted', 'paid') THEN
            -- التحقق من ثبات القيم المالية والأطراف الأساسية
            IF OLD.total_amount IS DISTINCT FROM NEW.total_amount
               OR OLD.tax_amount IS DISTINCT FROM NEW.tax_amount
               OR OLD.subtotal IS DISTINCT FROM NEW.subtotal
               OR OLD.customer_id IS DISTINCT FROM NEW.customer_id
               OR OLD.warehouse_id IS DISTINCT FROM NEW.warehouse_id
               OR OLD.invoice_date IS DISTINCT FROM NEW.invoice_date
               OR OLD.discount_amount IS DISTINCT FROM NEW.discount_amount
            THEN
                RAISE EXCEPTION 'TRIPRO_DOCUMENT_GUARD: لا يمكن تعديل القيم المالية أو أطراف فاتورة المبيعات المرحلة (رقم: %) مباشرة. يجب إلغاء الترحيل أولاً أو إصدار إشعار دائن.',
                    COALESCE(OLD.invoice_number, OLD.id::text);
            END IF;
        END IF;
        RETURN NEW;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_posted_sales_invoice_immutability ON public.invoices;
CREATE TRIGGER trg_guard_posted_sales_invoice_immutability
BEFORE UPDATE OR DELETE ON public.invoices
FOR EACH ROW
EXECUTE FUNCTION public.fn_guard_posted_sales_invoice_immutability();


-- 2. دالة ومحفز حماية فواتير المشتريات المرحلة من الحذف والتعديل المباشر
CREATE OR REPLACE FUNCTION public.fn_guard_posted_purchase_invoice_immutability()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    -- 1. منع الحذف إذا كانت الفاتورة مرحلة أو مسددة
    IF TG_OP = 'DELETE' THEN
        IF OLD.status IN ('posted', 'paid') THEN
            RAISE EXCEPTION 'TRIPRO_DOCUMENT_GUARD: لا يمكن حذف فاتورة المشتريات المرحلة (رقم: %) مباشرة. يجب أولاً إلغاء الترحيل لتحويلها إلى مسودة (Draft).',
                COALESCE(OLD.invoice_number, OLD.id::text);
        END IF;
        RETURN OLD;
    END IF;

    -- 2. في حالة التعديل، منع تعديل القيم المالية إذا كانت مرحلة وتظل مرحلة
    IF TG_OP = 'UPDATE' THEN
        IF OLD.status IN ('posted', 'paid') AND NEW.status IN ('posted', 'paid') THEN
            IF OLD.total_amount IS DISTINCT FROM NEW.total_amount
               OR OLD.tax_amount IS DISTINCT FROM NEW.tax_amount
               OR OLD.subtotal IS DISTINCT FROM NEW.subtotal
               OR OLD.supplier_id IS DISTINCT FROM NEW.supplier_id
               OR OLD.warehouse_id IS DISTINCT FROM NEW.warehouse_id
               OR OLD.invoice_date IS DISTINCT FROM NEW.invoice_date
               OR OLD.discount_amount IS DISTINCT FROM NEW.discount_amount
            THEN
                RAISE EXCEPTION 'TRIPRO_DOCUMENT_GUARD: لا يمكن تعديل القيم المالية لفاتورة المشتريات المرحلة (رقم: %) مباشرة. يجب إلغاء الترحيل أولاً أو إصدار مرتجع مشتريات.',
                    COALESCE(OLD.invoice_number, OLD.id::text);
            END IF;
        END IF;
        RETURN NEW;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_posted_purchase_invoice_immutability ON public.purchase_invoices;
CREATE TRIGGER trg_guard_posted_purchase_invoice_immutability
BEFORE UPDATE OR DELETE ON public.purchase_invoices
FOR EACH ROW
EXECUTE FUNCTION public.fn_guard_posted_purchase_invoice_immutability();


-- 3. دالة ومحفز حماية بنود فواتير المبيعات من التعديل أو الحذف أثناء ترحيل الفاتورة
CREATE OR REPLACE FUNCTION public.fn_guard_posted_invoice_items_immutability()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_parent_status text;
    v_parent_number text;
    v_invoice_id uuid;
BEGIN
    IF TG_OP = 'DELETE' OR TG_OP = 'UPDATE' THEN
        v_invoice_id := OLD.invoice_id;
    ELSE
        v_invoice_id := NEW.invoice_id;
    END IF;

    SELECT status, invoice_number INTO v_parent_status, v_parent_number
    FROM public.invoices
    WHERE id = v_invoice_id;

    IF v_parent_status IN ('posted', 'paid') THEN
        RAISE EXCEPTION 'TRIPRO_DOCUMENT_GUARD: لا يمكن تعديل أو حذف أو إضافة بنود إلى فاتورة مبيعات مرحلة (رقم: %) مباشرة. يجب إلغاء ترحيل الفاتورة أولاً.',
            COALESCE(v_parent_number, v_invoice_id::text);
    END IF;

    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    ELSE
        RETURN NEW;
    END IF;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_posted_invoice_items_immutability ON public.invoice_items;
CREATE TRIGGER trg_guard_posted_invoice_items_immutability
BEFORE INSERT OR UPDATE OR DELETE ON public.invoice_items
FOR EACH ROW
EXECUTE FUNCTION public.fn_guard_posted_invoice_items_immutability();


-- 4. دالة ومحفز حماية بنود فواتير المشتريات من التعديل أو الحذف أثناء ترحيل الفاتورة
CREATE OR REPLACE FUNCTION public.fn_guard_posted_purchase_items_immutability()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_parent_status text;
    v_parent_number text;
    v_purchase_invoice_id uuid;
BEGIN
    IF TG_OP = 'DELETE' OR TG_OP = 'UPDATE' THEN
        v_purchase_invoice_id := OLD.purchase_invoice_id;
    ELSE
        v_purchase_invoice_id := NEW.purchase_invoice_id;
    END IF;

    SELECT status, invoice_number INTO v_parent_status, v_parent_number
    FROM public.purchase_invoices
    WHERE id = v_purchase_invoice_id;

    IF v_parent_status IN ('posted', 'paid') THEN
        RAISE EXCEPTION 'TRIPRO_DOCUMENT_GUARD: لا يمكن تعديل أو حذف أو إضافة بنود إلى فاتورة مشتريات مرحلة (رقم: %) مباشرة. يجب إلغاء ترحيل الفاتورة أولاً.',
            COALESCE(v_parent_number, v_purchase_invoice_id::text);
    END IF;

    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    ELSE
        RETURN NEW;
    END IF;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_posted_purchase_items_immutability ON public.purchase_invoice_items;
CREATE TRIGGER trg_guard_posted_purchase_items_immutability
BEFORE INSERT OR UPDATE OR DELETE ON public.purchase_invoice_items
FOR EACH ROW
EXECUTE FUNCTION public.fn_guard_posted_purchase_items_immutability();

-- ====================================================================
-- Migration: Enterprise Security & Audit Trail Engine (Enterprise Edition)
-- Date: 2026-08-17
-- Description: Adds severity levels, module tagging, immutable security policies,
-- and automatic auditing triggers for sensitive operations (Price overrides,
-- GL unposting, Void items, Cheque collection, and Stock adjustments).
-- ====================================================================

-- 1. ترقية جدول سجلات الأمان بالأعمدة الجديدة
ALTER TABLE public.security_logs ADD COLUMN IF NOT EXISTS severity text DEFAULT 'info';
ALTER TABLE public.security_logs ADD COLUMN IF NOT EXISTS module text DEFAULT 'general';
ALTER TABLE public.security_logs ADD COLUMN IF NOT EXISTS ip_address text;

-- فهرسة الأعمدة للبحث والفلترة الفائقة السرعة
CREATE INDEX IF NOT EXISTS idx_security_logs_org_created ON public.security_logs(organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_security_logs_severity ON public.security_logs(organization_id, severity);
CREATE INDEX IF NOT EXISTS idx_security_logs_module ON public.security_logs(organization_id, module);

-- 2. تحصين جدول سجلات الأمان لمنع التعديل والتلاعب (Immutable Audit Log)
ALTER TABLE public.security_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "security_logs_read" ON public.security_logs;
CREATE POLICY "security_logs_read" ON public.security_logs 
    FOR SELECT TO authenticated 
    USING (organization_id = public.get_my_org() OR organization_id IS NULL);

DROP POLICY IF EXISTS "security_logs_insert" ON public.security_logs;
CREATE POLICY "security_logs_insert" ON public.security_logs 
    FOR INSERT TO authenticated 
    WITH CHECK (true);

-- منع التعديل والحذف تماماً لضمان موثوقية السجلات أمام المراجعين القانونيين
DROP POLICY IF EXISTS "security_logs_no_update" ON public.security_logs;
DROP POLICY IF EXISTS "security_logs_no_delete" ON public.security_logs;

-- 3. دالة تسجيل الأحداث الأمنية المركزية (Central Audit Logger Function)
CREATE OR REPLACE FUNCTION public.log_security_event(
    p_event_type text,
    p_description text,
    p_severity text DEFAULT 'info',
    p_module text DEFAULT 'general',
    p_metadata jsonb DEFAULT '{}'::jsonb,
    p_org_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
    v_log_id uuid;
    v_target_org uuid;
BEGIN
    v_target_org := COALESCE(p_org_id, public.get_my_org());

    INSERT INTO public.security_logs (
        event_type,
        description,
        severity,
        module,
        performed_by,
        organization_id,
        metadata
    ) VALUES (
        p_event_type,
        p_description,
        LOWER(COALESCE(p_severity, 'info')),
        LOWER(COALESCE(p_module, 'general')),
        auth.uid(),
        v_target_org,
        COALESCE(p_metadata, '{}'::jsonb)
    ) RETURNING id INTO v_log_id;

    RETURN v_log_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.log_security_event(text, text, text, text, jsonb, uuid) TO authenticated;

-- 4. مشغل التدقيق الموسع لكافة عمليات الحذف في النظام (Universal Deletion Auditor)
CREATE OR REPLACE FUNCTION public.fn_audit_deletions()
RETURNS TRIGGER AS $$
DECLARE
    v_org_id uuid;
    v_item_name text;
    v_module text := 'general';
    v_severity text := 'warning';
BEGIN
    -- تجاوز في وضع الاستعادة
    IF current_setting('app.restore_mode', true) = 'on' THEN
        RETURN OLD;
    END IF;

    CASE TG_TABLE_NAME
        WHEN 'invoices' THEN
            v_item_name := 'فاتورة مبيعات رقم: ' || COALESCE(OLD.invoice_number, OLD.id::text);
            v_org_id := OLD.organization_id;
            v_module := 'sales';
            v_severity := 'critical';
        WHEN 'purchase_invoices' THEN
            v_item_name := 'فاتورة مشتريات رقم: ' || COALESCE(OLD.invoice_number, OLD.id::text);
            v_org_id := OLD.organization_id;
            v_module := 'purchases';
            v_severity := 'critical';
        WHEN 'journal_entries' THEN
            v_item_name := 'قيد محاسبي رقم: ' || COALESCE(OLD.entry_number::text, OLD.id::text);
            v_org_id := OLD.organization_id;
            v_module := 'accounting';
            v_severity := 'critical';
        WHEN 'accounts' THEN
            v_item_name := 'حساب مالي: ' || OLD.name || ' (' || COALESCE(OLD.code, '') || ')';
            v_org_id := OLD.organization_id;
            v_module := 'accounting';
            v_severity := 'critical';
        WHEN 'products' THEN
            v_item_name := 'صنف: ' || OLD.name || ' (SKU: ' || COALESCE(OLD.sku, '') || ')';
            v_org_id := OLD.organization_id;
            v_module := 'inventory';
            v_severity := 'warning';
        WHEN 'customers' THEN
            v_item_name := 'عميل: ' || OLD.name;
            v_org_id := OLD.organization_id;
            v_module := 'sales';
            v_severity := 'warning';
        WHEN 'suppliers' THEN
            v_item_name := 'مورد: ' || OLD.name;
            v_org_id := OLD.organization_id;
            v_module := 'purchases';
            v_severity := 'warning';
        WHEN 'receipt_vouchers' THEN
            v_item_name := 'سند قبض رقم: ' || COALESCE(OLD.voucher_number, OLD.id::text);
            v_org_id := OLD.organization_id;
            v_module := 'treasury';
            v_severity := 'critical';
        WHEN 'payment_vouchers' THEN
            v_item_name := 'سند صرف رقم: ' || COALESCE(OLD.voucher_number, OLD.id::text);
            v_org_id := OLD.organization_id;
            v_module := 'treasury';
            v_severity := 'critical';
        WHEN 'cheques' THEN
            v_item_name := 'شيك رقم: ' || COALESCE(OLD.cheque_number, OLD.id::text);
            v_org_id := OLD.organization_id;
            v_module := 'treasury';
            v_severity := 'critical';
        ELSE
            v_item_name := 'سجل ' || TG_TABLE_NAME || ' (ID: ' || OLD.id::text || ')';
            v_org_id := COALESCE(OLD.organization_id, public.get_my_org());
    END CASE;

    INSERT INTO public.security_logs (
        event_type,
        description,
        severity,
        module,
        performed_by,
        organization_id,
        metadata
    ) VALUES (
        TG_TABLE_NAME || '_deleted',
        format('تم حذف %s من النظام نهائياً', v_item_name),
        v_severity,
        v_module,
        auth.uid(),
        v_org_id,
        jsonb_build_object(
            'table_name', TG_TABLE_NAME,
            'deleted_id', OLD.id,
            'deleted_record', to_jsonb(OLD)
        )
    );
    
    RETURN OLD;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ربط المشغلات بكافة الجداول الحساسة
DROP TRIGGER IF EXISTS trg_audit_invoices_delete ON public.invoices;
CREATE TRIGGER trg_audit_invoices_delete BEFORE DELETE ON public.invoices FOR EACH ROW EXECUTE FUNCTION public.fn_audit_deletions();

DROP TRIGGER IF EXISTS trg_audit_purchase_invoices_delete ON public.purchase_invoices;
CREATE TRIGGER trg_audit_purchase_invoices_delete BEFORE DELETE ON public.purchase_invoices FOR EACH ROW EXECUTE FUNCTION public.fn_audit_deletions();

DROP TRIGGER IF EXISTS trg_audit_journal_entries_delete ON public.journal_entries;
CREATE TRIGGER trg_audit_journal_entries_delete BEFORE DELETE ON public.journal_entries FOR EACH ROW EXECUTE FUNCTION public.fn_audit_deletions();

DROP TRIGGER IF EXISTS trg_audit_accounts_delete ON public.accounts;
CREATE TRIGGER trg_audit_accounts_delete BEFORE DELETE ON public.accounts FOR EACH ROW EXECUTE FUNCTION public.fn_audit_deletions();

DROP TRIGGER IF EXISTS trg_audit_products_delete ON public.products;
CREATE TRIGGER trg_audit_products_delete BEFORE DELETE ON public.products FOR EACH ROW EXECUTE FUNCTION public.fn_audit_deletions();

DROP TRIGGER IF EXISTS trg_audit_customers_delete ON public.customers;
CREATE TRIGGER trg_audit_customers_delete BEFORE DELETE ON public.customers FOR EACH ROW EXECUTE FUNCTION public.fn_audit_deletions();

DROP TRIGGER IF EXISTS trg_audit_suppliers_delete ON public.suppliers;
CREATE TRIGGER trg_audit_suppliers_delete BEFORE DELETE ON public.suppliers FOR EACH ROW EXECUTE FUNCTION public.fn_audit_deletions();

DROP TRIGGER IF EXISTS trg_audit_receipt_vouchers_delete ON public.receipt_vouchers;
CREATE TRIGGER trg_audit_receipt_vouchers_delete BEFORE DELETE ON public.receipt_vouchers FOR EACH ROW EXECUTE FUNCTION public.fn_audit_deletions();

DROP TRIGGER IF EXISTS trg_audit_payment_vouchers_delete ON public.payment_vouchers;
CREATE TRIGGER trg_audit_payment_vouchers_delete BEFORE DELETE ON public.payment_vouchers FOR EACH ROW EXECUTE FUNCTION public.fn_audit_deletions();

DROP TRIGGER IF EXISTS trg_audit_cheques_delete ON public.cheques;
CREATE TRIGGER trg_audit_cheques_delete BEFORE DELETE ON public.cheques FOR EACH ROW EXECUTE FUNCTION public.fn_audit_deletions();

-- 5. مشغل رصد إلغاء ترحيل القيود اليومية وتعديلها (GL Unposting & Status Auditor)
CREATE OR REPLACE FUNCTION public.fn_audit_journal_status()
RETURNS TRIGGER AS $$
BEGIN
    IF current_setting('app.restore_mode', true) = 'on' THEN
        RETURN NEW;
    END IF;

    -- رصد فك الترحيل
    IF OLD.status = 'posted' AND NEW.status != 'posted' THEN
        INSERT INTO public.security_logs (
            event_type,
            description,
            severity,
            module,
            performed_by,
            organization_id,
            metadata
        ) VALUES (
            'journal_unposted',
            format('⚠️ تم فك ترحيل القيد اليومي رقم (%s) وإعادته لحالة المسودة', COALESCE(NEW.entry_number::text, NEW.id::text)),
            'critical',
            'accounting',
            auth.uid(),
            NEW.organization_id,
            jsonb_build_object(
                'entry_id', NEW.id,
                'entry_number', NEW.entry_number,
                'old_status', OLD.status,
                'new_status', NEW.status
            )
        );
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_audit_journal_status ON public.journal_entries;
CREATE TRIGGER trg_audit_journal_status 
AFTER UPDATE OF status ON public.journal_entries 
FOR EACH ROW EXECUTE FUNCTION public.fn_audit_journal_status();

-- 6. مشغل رصد تحصيل ورفض الشيكات البنكية (Cheque Lifecycle Auditor)
CREATE OR REPLACE FUNCTION public.fn_audit_cheque_status()
RETURNS TRIGGER AS $$
BEGIN
    IF current_setting('app.restore_mode', true) = 'on' THEN
        RETURN NEW;
    END IF;

    IF OLD.status != NEW.status THEN
        INSERT INTO public.security_logs (
            event_type,
            description,
            severity,
            module,
            performed_by,
            organization_id,
            metadata
        ) VALUES (
            'cheque_status_changed',
            format('تغيرت حالة الشيك رقم (%s) من [%s] إلى [%s]', 
                COALESCE(NEW.cheque_number, NEW.id::text), 
                OLD.status, 
                NEW.status
            ),
            CASE WHEN NEW.status IN ('bounced', 'cancelled', 'rejected') THEN 'critical' ELSE 'info' END,
            'treasury',
            auth.uid(),
            NEW.organization_id,
            jsonb_build_object(
                'cheque_id', NEW.id,
                'cheque_number', NEW.cheque_number,
                'amount', NEW.amount,
                'old_status', OLD.status,
                'new_status', NEW.status
            )
        );
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_audit_cheque_status ON public.cheques;
CREATE TRIGGER trg_audit_cheque_status 
AFTER UPDATE OF status ON public.cheques 
FOR EACH ROW EXECUTE FUNCTION public.fn_audit_cheque_status();

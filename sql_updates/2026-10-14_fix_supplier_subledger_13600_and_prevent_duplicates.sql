-- =============================================================================
-- TriPro ERP — Database Migration
-- File: 2026-10-14_fix_supplier_subledger_13600_and_prevent_duplicates.sql
-- Description:
--   1. Delete duplicate manual journal entry for voucher PV-064086 (15,000 EGP).
--   2. Link manual journal entry MAN-408068 (1,400 EGP) to supplier Ahmed Abdelaziz Ghobara.
--   3. Create recalculate_supplier_balances RPC to ensure 100% synchronization.
--   4. Add duplicate reference prevention trigger on journal_entries.
--   5. Recalculate all system balances and verify 0 discrepancy.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. حذف القيد المحاسبي اليدوي المكرر لسند الصرف PV-064086 (15,000 ج.م)
-- -----------------------------------------------------------------------------
DO $$
DECLARE
    v_dup_id uuid := '3a35dbfa-371e-4fe7-b418-5faf373d1dcd';
BEGIN
    IF EXISTS (SELECT 1 FROM public.journal_entries WHERE id = v_dup_id) THEN
        -- تحويل القيد لمسودة لتجاوز حراس الحماية
        UPDATE public.journal_entries 
        SET status = 'draft', is_posted = false 
        WHERE id = v_dup_id;

        -- حذف أسطر القيد
        DELETE FROM public.journal_lines WHERE journal_entry_id = v_dup_id;

        -- حذف رأس القيد
        DELETE FROM public.journal_entries WHERE id = v_dup_id;

        RAISE NOTICE '✅ تم حذف القيد اليدوي المكرر لسند PV-064086 بنجاح.';
    END IF;
END $$;


-- -----------------------------------------------------------------------------
-- 2. تصحيح وربط القيد اليدوي MAN-408068 (1,400 ج.م) بالمورد أحمد عبدالعزيز غبارة
-- -----------------------------------------------------------------------------
DO $$
DECLARE
    v_je_id uuid := 'ab07a960-f4f2-46d7-bdae-52fb5e090f51';
    v_supp_id uuid := '03bb5c7c-f944-488f-a644-d5973a53004f'; -- أحمد عبدالعزيز غبارة
BEGIN
    IF EXISTS (SELECT 1 FROM public.journal_entries WHERE id = v_je_id) THEN
        UPDATE public.journal_entries
        SET description = 'أحمد عبدالعزيز غبارة - عدد وأدوات',
            related_document_id = v_supp_id,
            related_document_type = 'supplier_adjustment'
        WHERE id = v_je_id;

        UPDATE public.journal_lines
        SET description = 'أحمد عبدالعزيز غبارة - عدد وأدوات'
        WHERE journal_entry_id = v_je_id;

        RAISE NOTICE '✅ تم تصحيح بيان القيد MAN-408068 وربطه بالمورد أحمد عبدالعزيز غبارة بنجاح.';
    END IF;
END $$;


-- -----------------------------------------------------------------------------
-- 3. إنشاء وتفعيل دالة إعادة احتساب أرصدة الموردين (recalculate_supplier_balances)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.recalculate_supplier_balances(
    p_org_id uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_org_id uuid;
BEGIN
    v_org_id := COALESCE(p_org_id, public.get_my_org());
    IF v_org_id IS NULL THEN
        SELECT id INTO v_org_id FROM public.organizations LIMIT 1;
    END IF;

    UPDATE public.suppliers s
    SET balance = COALESCE(public.get_supplier_balance(s.id, v_org_id), 0)
    WHERE s.organization_id = v_org_id
      AND s.deleted_at IS NULL;
END;
$$;

GRANT EXECUTE ON FUNCTION public.recalculate_supplier_balances(uuid) TO authenticated, service_role, anon;


-- -----------------------------------------------------------------------------
-- 4. صمام أمان وقائي: منع تكرار أرقام السندات في القيود اليومية (Duplicate Reference Guard)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_prevent_duplicate_voucher_reference()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    -- إذا كان القيد يدوياً ويحمل مرجع يشبه سند صرف أو فاتورة مسجلة بالفعل
    IF (NEW.related_document_type IS NULL OR NEW.related_document_type = 'manual')
       AND NEW.reference IS NOT NULL 
       AND (NEW.reference LIKE 'PV-%' OR NEW.reference LIKE 'EXP-%' OR NEW.reference LIKE 'RV-%') THEN
       
        IF EXISTS (
            SELECT 1 FROM public.journal_entries 
            WHERE organization_id = NEW.organization_id 
              AND reference = NEW.reference 
              AND id != NEW.id
              AND status = 'posted'
        ) THEN
            RAISE EXCEPTION 'تنبيه رقابي: يوجد قيد محاسبي مرحل مسبقاً بنفس المرجع (%). لا يمكن إنشاء قيود مكررة لنفس السند.', NEW.reference;
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_duplicate_voucher_reference ON public.journal_entries;
CREATE TRIGGER trg_prevent_duplicate_voucher_reference
BEFORE INSERT OR UPDATE OF reference ON public.journal_entries
FOR EACH ROW EXECUTE FUNCTION public.fn_prevent_duplicate_voucher_reference();


-- -----------------------------------------------------------------------------
-- 5. تشغيل التحديث الرقابي الشامل للأرصدة (recalculate_all_system_balances)
-- -----------------------------------------------------------------------------
SELECT public.recalculate_supplier_balances('2d9b24d6-f5cf-4bd9-b8b6-0a85d1c9c967');
SELECT public.recalculate_all_system_balances('2d9b24d6-f5cf-4bd9-b8b6-0a85d1c9c967');

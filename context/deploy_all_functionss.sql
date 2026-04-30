-- 🛠️ دالة إصلاح الأرصدة الشاملة
-- تقوم هذه الدالة بإعادة حساب أرصدة كافة الحسابات من واقع قيود اليومية لضمان الدقة 100%

CREATE OR REPLACE FUNCTION public.recalculate_all_system_balances(p_org_id UUID)
RETURNS TEXT AS $$
DECLARE
    v_count INTEGER;
BEGIN
    -- 1. تصفير كافة الأرصدة أولاً في جدول الحسابات لهذه المنظمة
    UPDATE public.accounts 
    SET balance = 0 
    WHERE organization_id = p_org_id;

    -- 2. تحديث الحسابات الفرعية (Leaf Accounts) من واقع الحركات المرحلة فقط
    WITH actual_balances AS (
        SELECT 
            l.account_id,
            SUM(l.debit - l.credit) as net_balance
        FROM public.journal_lines l
        JOIN public.journal_entries e ON l.journal_entry_id = e.id
        WHERE e.organization_id = p_org_id 
          AND e.status = 'posted'
          AND e.deleted_at IS NULL
        GROUP BY l.account_id
    )
    UPDATE public.accounts a
    SET balance = CASE 
        WHEN a.type IN ('ASSET', 'EXPENSE') THEN b.net_balance 
        ELSE -b.net_balance 
    END
    FROM actual_balances b
    WHERE a.id = b.account_id;

    -- 3. تحديث الحسابات الرئيسية (Groups) سيتم تلقائياً في المرة القادمة التي يتم فيها طلب البيانات في React
    -- ولكن الأفضل دائماً الاعتماد على الـ View للأرصدة الكلية.

    GET DIAGNOSTICS v_count = ROW_COUNT;
    RETURN 'تمت إعادة مطابقة ' || v_count || ' حساباً بنجاح.';
END;
$$ LANGUAGE plpgsql;

-- 🛠️ دالة إصلاح الحسابات المفقودة (وتشمل الآن حسابات التصنيع والهالك)
CREATE OR REPLACE FUNCTION public.repair_missing_accounts()
RETURNS TEXT AS $$
DECLARE
    v_org_id UUID;
    v_acc_id UUID;
    v_count INTEGER := 0;
BEGIN
    FOR v_org_id IN SELECT id FROM public.organizations LOOP
        -- 1. إضافة حساب الهالك والفاقد الصناعي 5121 إذا فقد
        IF NOT EXISTS (SELECT 1 FROM public.accounts WHERE organization_id = v_org_id AND code = '5121') THEN
            INSERT INTO public.accounts (organization_id, code, name, type, is_group, parent_id)
            VALUES (
                v_org_id, 
                '5121', 
                'مصروف الهالك والفاقد الصناعي', 
                'EXPENSE', 
                false, 
                (SELECT id FROM public.accounts WHERE organization_id = v_org_id AND code = '5' LIMIT 1)
            ) RETURNING id INTO v_acc_id;
            v_count := v_count + 1;
        ELSE
            SELECT id INTO v_acc_id FROM public.accounts WHERE organization_id = v_org_id AND code = '5121';
        END IF;

        -- التأكد من وجود الربط في جدول الإعدادات
        UPDATE public.company_settings 
        SET account_mappings = COALESCE(account_mappings, '{}'::jsonb) || jsonb_build_object('WASTAGE_EXPENSE', v_acc_id)
        WHERE organization_id = v_org_id AND NOT (account_mappings ? 'WASTAGE_EXPENSE');

        -- 2. ربط الحساب تلقائياً في الإعدادات لضمان اختفاء تحذير "غير مربوط"
        UPDATE public.company_settings 
        SET account_mappings = COALESCE(account_mappings, '{}'::jsonb) || jsonb_build_object('WASTAGE_EXPENSE', v_acc_id)
        WHERE organization_id = v_org_id AND NOT (account_mappings ? 'WASTAGE_EXPENSE');

        -- 3. إضافة حساب تكاليف العمالة المحملة 513 إذا فقد
        IF NOT EXISTS (SELECT 1 FROM public.accounts WHERE organization_id = v_org_id AND code = '513') THEN
            INSERT INTO public.accounts (organization_id, code, name, type, is_group, parent_id)
            VALUES (
                v_org_id, 
                '513', 
                'تكاليف العمالة الصناعية المحملة', 
                'EXPENSE', 
                false, 
                (SELECT id FROM public.accounts WHERE organization_id = v_org_id AND code = '5' LIMIT 1)
            );
            v_count := v_count + 1;
        END IF;
    END LOOP;

    -- تحديث كاش النظام بعد الإضافة
    PERFORM public.refresh_saas_schema();
    
    RETURN 'تم فحص النظام وإضافة ' || v_count || ' حساباً مفقوداً.';
END;
$$ LANGUAGE plpgsql;

-- 🧹 دالة حذف السجلات المعلمة "كمحذوفة" نهائياً (Purge Soft-Deleted)
CREATE OR REPLACE FUNCTION public.purge_deleted_records(p_org_id UUID)
RETURNS TEXT AS $$
DECLARE
    v_total INTEGER := 0;
    v_count INTEGER;
BEGIN
    DELETE FROM public.journal_entries WHERE organization_id = p_org_id AND deleted_at IS NOT NULL;
    GET DIAGNOSTICS v_count = ROW_COUNT; v_total := v_total + v_count;

    DELETE FROM public.invoices WHERE organization_id = p_org_id AND deleted_at IS NOT NULL;
    GET DIAGNOSTICS v_count = ROW_COUNT; v_total := v_total + v_count;

    DELETE FROM public.products WHERE organization_id = p_org_id AND deleted_at IS NOT NULL;
    GET DIAGNOSTICS v_count = ROW_COUNT; v_total := v_total + v_count;

    RETURN 'تم تنظيف ' || v_total || ' سجل من سلة المحذوفات بنجاح.';
END;
$$ LANGUAGE plpgsql;

-- 🧹 دالة تنظيف الحركات اليتيمة (Orphaned Records Cleanup)
CREATE OR REPLACE FUNCTION public.purge_orphaned_financial_records()
RETURNS TEXT AS $$
DECLARE
    v_lines_deleted INTEGER := 0;
    v_entries_deleted INTEGER := 0;
    v_items_deleted INTEGER := 0;
BEGIN
    -- 1. حذف أسطر القيود التي ليس لها قيد أب (Orphaned Lines)
    DELETE FROM public.journal_lines
    WHERE journal_entry_id NOT IN (SELECT id FROM public.journal_entries);
    GET DIAGNOSTICS v_lines_deleted = ROW_COUNT;

    -- 2. حذف القيود المرحلة التي ليس لها أسطر (Posted entries with no lines - خلل تقني)
    DELETE FROM public.journal_entries
    WHERE status = 'posted' 
      AND id NOT IN (SELECT DISTINCT journal_entry_id FROM public.journal_lines);
    GET DIAGNOSTICS v_entries_deleted = ROW_COUNT;

    -- 3. حذف بنود الفواتير اليتيمة (بدون فاتورة أب)
    DELETE FROM public.invoice_items
    WHERE invoice_id NOT IN (SELECT id FROM public.invoices);
    DELETE FROM public.purchase_invoice_items
    WHERE purchase_invoice_id NOT IN (SELECT id FROM public.purchase_invoices);
    GET DIAGNOSTICS v_items_deleted = ROW_COUNT;

    RETURN format('تم تنظيف النظام بنجاح: %s سطر يتيم، %s قيد فارغ، %s بند فاتورة يتيم.', 
                  v_lines_deleted, v_entries_deleted, v_items_deleted);
END;
$$ LANGUAGE plpgsql;
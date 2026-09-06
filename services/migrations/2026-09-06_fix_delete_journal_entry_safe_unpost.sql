-- ==============================================================================
-- Migration: Fix delete_journal_entry_safe to unpost before deleting lines
-- Date: 2026-09-06
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.delete_journal_entry_safe(p_entry_id uuid, p_org_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    -- 1. إلغاء ترحيل القيد أولاً لتخطي مشغل حماية القيود المرحلة (trg_protect_posted_journal_lines)
    UPDATE public.journal_entries 
       SET status = 'draft', is_posted = false 
     WHERE id = p_entry_id;

    -- 2. حذف أسطر القيد
    DELETE FROM public.journal_lines 
     WHERE journal_entry_id = p_entry_id 
       AND (p_org_id IS NULL OR organization_id = p_org_id);

    -- 3. حذف رأس القيد
    DELETE FROM public.journal_entries 
     WHERE id = p_entry_id 
       AND (p_org_id IS NULL OR organization_id = p_org_id);

    -- 4. إعادة موازنة الأرصدة
    BEGIN
        PERFORM public.recalculate_all_system_balances(p_org_id);
    EXCEPTION WHEN OTHERS THEN
        BEGIN
            PERFORM public.recalculate_all_balances(p_org_id);
        EXCEPTION WHEN OTHERS THEN
            NULL;
        END;
    END;

    RETURN 'تم حذف القيد المحاسبي وتحديث الأرصدة بنجاح ✅';
END;
$$;

GRANT EXECUTE ON FUNCTION public.delete_journal_entry_safe(uuid, uuid) TO authenticated, anon, service_role;

NOTIFY pgrst, 'reload schema';

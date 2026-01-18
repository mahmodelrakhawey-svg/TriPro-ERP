-- services/sync_missing_accounts.sql
-- هذا السكربت يضيف الحسابات الجديدة (مثل 1209 و 515) إذا لم تكن موجودة
DO $$
DECLARE
    v_parent_id uuid;
BEGIN
    -- 1. إضافة حساب عهد موظفين (1209) تحت العملاء والمدينون (102)
    IF NOT EXISTS (SELECT 1 FROM accounts WHERE code = '1209') THEN
        SELECT id INTO v_parent_id FROM accounts WHERE code = '102';
        IF v_parent_id IS NOT NULL THEN
            INSERT INTO accounts (code, name, type, is_group, parent_id, is_active)
            VALUES ('1209', 'عهد موظفين', 'ASSET', false, v_parent_id, true);
        END IF;
    END IF;

    -- 2. إضافة حساب مصروفات مكتبية (515) تحت المصروفات (5)
    IF NOT EXISTS (SELECT 1 FROM accounts WHERE code = '515') THEN
        SELECT id INTO v_parent_id FROM accounts WHERE code = '5'; -- أو تحت المصروفات الإدارية إذا وجدت
        IF v_parent_id IS NOT NULL THEN
            INSERT INTO accounts (code, name, type, is_group, parent_id, is_active)
            VALUES ('515', 'مصروفات مكتبية', 'EXPENSE', false, v_parent_id, true);
        END IF;
    END IF;
END $$;
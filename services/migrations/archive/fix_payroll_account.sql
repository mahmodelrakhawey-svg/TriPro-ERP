-- 1. التأكد من وجود حساب مكافآت الموظفين (5312)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM public.accounts WHERE code = '5312') THEN
        INSERT INTO public.accounts (id, code, name, type, is_group, parent_id)
        VALUES (
            gen_random_uuid(), 
            '5312', 
            'مكافآت وحوافز', 
            'EXPENSE', 
            false, 
            (SELECT id FROM public.accounts WHERE code = '53' LIMIT 1)
        );
    END IF;
END $$;
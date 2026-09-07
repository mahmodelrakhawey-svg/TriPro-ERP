-- 🏗️ إضافة حقل items_progress لجدول المستخلصات
-- الغرض: تخزين نسب الإنجاز التفصيلية للبنود في المستخلص
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='project_progress_billings' AND column_name='items_progress') THEN
        ALTER TABLE public.project_progress_billings ADD COLUMN items_progress JSONB DEFAULT '{}';
    END IF;
END $$;

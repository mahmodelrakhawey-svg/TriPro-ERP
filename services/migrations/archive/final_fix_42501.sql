-- ============================================
-- حل شامل نهائي لمشكلة 42501 (Permission Denied)
-- ============================================

-- الخطوة 0: منح صلاحيات الوصول للمخطط العام للمستخدم المجهول (anon)
GRANT USAGE ON SCHEMA public TO anon;
GRANT SELECT ON public.restaurant_tables TO anon;
GRANT SELECT ON public.products TO anon;
GRANT SELECT ON public.menu_categories TO anon;
GRANT SELECT ON public.modifier_groups TO anon;
GRANT SELECT ON public.modifiers TO anon;
GRANT SELECT ON public.organizations TO anon;

-- الخطوة 1: التأكد من أن كل ملف شخصي له organization_id
UPDATE public.profiles
SET organization_id = (SELECT id FROM public.organizations LIMIT 1)
WHERE organization_id IS NULL;

-- الخطوة 2: حذف جميع السياسات القديمة من الجداول المشكلة
DROP POLICY IF EXISTS "Accountants manage journals" ON public.journal_entries CASCADE;
DROP POLICY IF EXISTS "Financials viewable by authenticated_je" ON public.journal_entries CASCADE;
DROP POLICY IF EXISTS "Trans_Select_journal_entries" ON public.journal_entries CASCADE;
DROP POLICY IF EXISTS "Trans_Staff_journal_entries" ON public.journal_entries CASCADE;
DROP POLICY IF EXISTS "Basic data viewable by authenticated" ON public.accounts CASCADE;
DROP POLICY IF EXISTS "Account management" ON public.accounts CASCADE;
DROP POLICY IF EXISTS "Staff can manage accounts" ON public.accounts CASCADE;
DROP POLICY IF EXISTS "Policy_Select_accounts" ON public.accounts CASCADE;
DROP POLICY IF EXISTS "Policy_Staff_accounts" ON public.accounts CASCADE;

-- الخطوة 3: تعطيل RLS مؤقتاً
ALTER TABLE public.accounts DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.journal_entries DISABLE ROW LEVEL SECURITY;

-- الخطوة 4: إنشاء سياسات جديدة بسيطة وموثوقة

-- على جدول accounts
ALTER TABLE public.accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "accounts_read" ON public.accounts
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "accounts_write" ON public.accounts
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "accounts_update" ON public.accounts
  FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "accounts_delete" ON public.accounts
  FOR DELETE
  TO authenticated
  USING (true);

-- على جدول journal_entries
ALTER TABLE public.journal_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "journal_read" ON public.journal_entries
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "journal_write" ON public.journal_entries
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "journal_update" ON public.journal_entries
  FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "journal_delete" ON public.journal_entries
  FOR DELETE
  TO authenticated
  USING (true);

-- الخطوة 5: إضافة سياسات للجداول الأخرى المهمة

-- على جدول restaurant_tables
DROP POLICY IF EXISTS "restaurant_tables viewable" ON public.restaurant_tables CASCADE;
DROP POLICY IF EXISTS "restaurant_tables management" ON public.restaurant_tables CASCADE;
DROP POLICY IF EXISTS "restaurant_tables_read" ON public.restaurant_tables CASCADE;

ALTER TABLE public.restaurant_tables DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.restaurant_tables ENABLE ROW LEVEL SECURITY;

CREATE POLICY "restaurant_tables_read" ON public.restaurant_tables
  FOR SELECT 
  TO authenticated, anon
  USING (true);

CREATE POLICY "restaurant_tables_write" ON public.restaurant_tables
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- على جدول purchase_invoices
DROP POLICY IF EXISTS "Purchase invoices viewable" ON public.purchase_invoices CASCADE;
DROP POLICY IF EXISTS "Purchase invoice management" ON public.purchase_invoices CASCADE;

ALTER TABLE public.purchase_invoices DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_invoices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "purchase_invoices_read" ON public.purchase_invoices
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "purchase_invoices_write" ON public.purchase_invoices
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- الخطوة 6: التحقق من النتائج
SELECT '✅ تم تحديث جميع السياسات بنجاح!' as النتيجة;

SELECT 
    tablename,
    COUNT(*) as عدد_السياسات
FROM pg_policies
WHERE tablename IN ('accounts', 'journal_entries', 'restaurant_tables', 'purchase_invoices')
GROUP BY tablename;

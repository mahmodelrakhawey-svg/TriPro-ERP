-- ============================================
-- إصلاح سياسات RLS الصارمة (42501)
-- ============================================

-- الخطوة 1: تعطيل RLS مؤقتاً للتشخيص والإصلاح
ALTER TABLE public.accounts DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.journal_entries DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.restaurant_tables DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_invoices DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.organizations DISABLE ROW LEVEL SECURITY;

-- الخطوة 2: حذف السياسات القديمة الصارمة
DROP POLICY IF EXISTS "Basic data viewable by authenticated" ON public.accounts CASCADE;
DROP POLICY IF EXISTS "Account management" ON public.accounts CASCADE;
DROP POLICY IF EXISTS "Staff can manage accounts" ON public.accounts CASCADE;
DROP POLICY IF EXISTS "Policy_Select_accounts" ON public.accounts CASCADE;
DROP POLICY IF EXISTS "Policy_Staff_accounts" ON public.accounts CASCADE;

DROP POLICY IF EXISTS "Journal viewable by authorized" ON public.journal_entries CASCADE;
DROP POLICY IF EXISTS "Journal management" ON public.journal_entries CASCADE;
DROP POLICY IF EXISTS "Policy_Select_journal_entries" ON public.journal_entries CASCADE;
DROP POLICY IF EXISTS "Policy_Staff_journal_entries" ON public.journal_entries CASCADE;

DROP POLICY IF EXISTS "Restaurant tables viewable" ON public.restaurant_tables CASCADE;
DROP POLICY IF EXISTS "Restaurant table management" ON public.restaurant_tables CASCADE;

DROP POLICY IF EXISTS "Purchase invoices viewable" ON public.purchase_invoices CASCADE;
DROP POLICY IF EXISTS "Purchase invoice management" ON public.purchase_invoices CASCADE;

-- الخطوة 3: إعادة تفعيل RLS
ALTER TABLE public.accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.journal_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.restaurant_tables ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;

-- الخطوة 4: إنشاء سياسات جديدة بسيطة وفعالة

-- سياسات جدول accounts (الحسابات)
CREATE POLICY "accounts_select_policy" ON public.accounts
  FOR SELECT
  TO authenticated
  USING (organization_id = public.get_my_org());

CREATE POLICY "accounts_insert_policy" ON public.accounts
  FOR INSERT
  TO authenticated
  WITH CHECK (organization_id = public.get_my_org());

CREATE POLICY "accounts_update_policy" ON public.accounts
  FOR UPDATE
  TO authenticated
  USING (organization_id = public.get_my_org())
  WITH CHECK (organization_id = public.get_my_org());

CREATE POLICY "accounts_delete_policy" ON public.accounts
  FOR DELETE
  TO authenticated
  USING (organization_id = public.get_my_org());

-- سياسات جدول journal_entries (القيود المحاسبية)
CREATE POLICY "journal_entries_select_policy" ON public.journal_entries
  FOR SELECT
  TO authenticated
  USING (organization_id = public.get_my_org());

CREATE POLICY "journal_entries_insert_policy" ON public.journal_entries
  FOR INSERT
  TO authenticated
  WITH CHECK (organization_id = public.get_my_org());

CREATE POLICY "journal_entries_update_policy" ON public.journal_entries
  FOR UPDATE
  TO authenticated
  USING (organization_id = public.get_my_org())
  WITH CHECK (organization_id = public.get_my_org());

CREATE POLICY "journal_entries_delete_policy" ON public.journal_entries
  FOR DELETE
  TO authenticated
  USING (organization_id = public.get_my_org());

-- سياسات جدول restaurant_tables (طاولات المطعم)
CREATE POLICY "restaurant_tables_select_policy" ON public.restaurant_tables
  FOR SELECT
  TO authenticated
  USING (organization_id = public.get_my_org());

CREATE POLICY "restaurant_tables_insert_policy" ON public.restaurant_tables
  FOR INSERT
  TO authenticated
  WITH CHECK (organization_id = public.get_my_org());

CREATE POLICY "restaurant_tables_update_policy" ON public.restaurant_tables
  FOR UPDATE
  TO authenticated
  USING (organization_id = public.get_my_org())
  WITH CHECK (organization_id = public.get_my_org());

CREATE POLICY "restaurant_tables_delete_policy" ON public.restaurant_tables
  FOR DELETE
  TO authenticated
  USING (organization_id = public.get_my_org());

-- سياسات جدول purchase_invoices (فواتير الشراء)
CREATE POLICY "purchase_invoices_select_policy" ON public.purchase_invoices
  FOR SELECT
  TO authenticated
  USING (organization_id = public.get_my_org());

CREATE POLICY "purchase_invoices_insert_policy" ON public.purchase_invoices
  FOR INSERT
  TO authenticated
  WITH CHECK (organization_id = public.get_my_org());

CREATE POLICY "purchase_invoices_update_policy" ON public.purchase_invoices
  FOR UPDATE
  TO authenticated
  USING (organization_id = public.get_my_org())
  WITH CHECK (organization_id = public.get_my_org());

CREATE POLICY "purchase_invoices_delete_policy" ON public.purchase_invoices
  FOR DELETE
  TO authenticated
  USING (organization_id = public.get_my_org());

-- الخطوة 5: إضافة سياسات الملفات الشخصية
CREATE POLICY "profiles_own_profile" ON public.profiles
  FOR SELECT
  TO authenticated
  USING (id = auth.uid() OR organization_id = public.get_my_org());

CREATE POLICY "profiles_own_update" ON public.profiles
  FOR UPDATE
  TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

-- الخطوة 6: إضافة سياسات المنظمات
CREATE POLICY "organizations_view" ON public.organizations
  FOR SELECT
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE profiles.organization_id = organizations.id 
    AND profiles.id = auth.uid()
  ));

SELECT '✅ تم إصلاح جميع سياسات RLS بنجاح!' as النتيجة;

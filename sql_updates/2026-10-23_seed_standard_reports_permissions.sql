-- ==============================================================================
-- 🌟 TriPro ERP — تأكيد وتثبيت صلاحيات التقارير القياسية في جدول الصلاحيات permissions
-- التاريخ: 2026-10-23
-- الغرض: منع خطأ 403 Forbidden عند محاولة الواجهة إدراج صلاحيات التقارير الناقصة
-- ==============================================================================

INSERT INTO public.permissions (module, action, description, is_sensitive) VALUES
('reports', 'multi_currency_statement', 'عرض تقرير كشف حساب (متعدد العملات)', true),
('reports', 'cash_bank_movement', 'عرض تقرير حركة الصندوق والبنوك', true),
('reports', 'income_statement', 'عرض تقرير قائمة الدخل الشامل (IFRS 18)', true),
('reports', 'balance_sheet', 'عرض تقرير قائمة المركز المالي (الميزانية العمومية)', true),
('reports', 'trial_balance', 'عرض تقرير ميزان المراجعة', true),
('reports', 'cash_flow', 'عرض تقرير قائمة التدفقات النقدية (IAS 7)', true),
('reports', 'changes_in_equity', 'عرض تقرير قائمة التغير في حقوق الملكية', true),
('reports', 'general_ledger', 'عرض تقرير دفتر الأستاذ العام', true),
('reports', 'financial_ratios', 'عرض تقرير النسب المالية ومؤشرات الأداء', false),
('reports', 'tax_return', 'عرض تقرير الإقرار الضريبي (VAT)', true),
('reports', 'customer_aging', 'عرض تقرير أعمار ديون العملاء', false),
('reports', 'supplier_aging', 'عرض تقرير أعمار ديون الموردين', false),
('reports', 'customer_statement', 'عرض تقرير كشف حساب عميل', false),
('reports', 'supplier_statement', 'عرض تقرير كشف حساب مورد', false),
('reports', 'employee_statement', 'عرض تقرير كشف حساب موظف', false),
('reports', 'sales_summary', 'عرض تقارير وتحليلات المبيعات', false)
ON CONFLICT (module, action) DO UPDATE SET
  description = EXCLUDED.description,
  is_sensitive = EXCLUDED.is_sensitive;

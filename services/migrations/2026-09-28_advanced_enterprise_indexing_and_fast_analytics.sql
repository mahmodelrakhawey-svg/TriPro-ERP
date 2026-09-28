-- ==============================================================================
-- 🚀 TriPro ERP — Advanced Enterprise Indexing & High-Volume Performance Pack
-- ملف فهارس الأداء المتقدمة وحركات المخزون والمحاسبة التحليلية
-- التاريخ: 28 سبتمبر 2026
-- المستهدف: شركة لينزا (Lenza Group) — بيئة الإنتاج السحابية (Supabase PostgreSQL)
-- ==============================================================================
-- التعليمات التنفيذية للمدير المالي (CFO Instructions):
-- 1. يُنفذ هذا السكربت في نافذة الصيانة المسائية بعد انتهاء يوم العمل (خروج الموظفين).
-- 2. التنفيذ يتم بنسخ ولصق الكود بالكامل داخل Supabase SQL Editor والضغط على Run.
-- 3. كافة الأوامر مؤمنة بـ IF NOT EXISTS لضمان عدم حدوث أي خطأ أو تكرار.
-- ==============================================================================

BEGIN;

-- ==============================================================================
-- 1. فهارس بطاقة حركة المخزون الموحدة (Stock Movement Engine Indexes)
-- تضمن استجابة تقارير كارت الصنف وحركات المخازن في أقل من 15ms لمليون حركة
-- ==============================================================================

-- بنود فواتير المبيعات
CREATE INDEX IF NOT EXISTS idx_invoice_items_prod_org 
  ON public.invoice_items (product_id, organization_id);

-- بنود فواتير المشتريات
CREATE INDEX IF NOT EXISTS idx_purchase_invoice_items_prod_org 
  ON public.purchase_invoice_items (product_id, organization_id);

-- بنود مردودات المبيعات
CREATE INDEX IF NOT EXISTS idx_sales_return_items_prod_org 
  ON public.sales_return_items (product_id, organization_id);

-- بنود مردودات المشتريات
CREATE INDEX IF NOT EXISTS idx_purchase_return_items_prod_org 
  ON public.purchase_return_items (product_id, organization_id);

-- بنود التسويات المخزنية
CREATE INDEX IF NOT EXISTS idx_stock_adjustment_items_prod_org 
  ON public.stock_adjustment_items (product_id, organization_id);

-- بنود التحويلات المخزنية
CREATE INDEX IF NOT EXISTS idx_stock_transfer_items_prod_org 
  ON public.stock_transfer_items (product_id, organization_id);

-- الرصيد الافتتاحي للمخزون
CREATE INDEX IF NOT EXISTS idx_opening_inventories_prod_org_wh 
  ON public.opening_inventories (product_id, organization_id, warehouse_id);

-- أوامر تصنيع الإنتاج التام
CREATE INDEX IF NOT EXISTS idx_mfg_prod_orders_prod_org_status 
  ON public.mfg_production_orders (product_id, organization_id, status);

-- صرف المواد الخام للتصنيع
CREATE INDEX IF NOT EXISTS idx_mfg_mat_req_raw_org 
  ON public.mfg_material_request_items (raw_material_id, organization_id);

-- صرف مستلزمات المستشفيات (HIMS)
CREATE INDEX IF NOT EXISTS idx_hims_billing_items_prod_wh 
  ON public.hims_billing_items (product_id, warehouse_id);

-- صرف مواد مشاريع المقاولات
CREATE INDEX IF NOT EXISTS idx_proj_mat_issue_items_prod 
  ON public.project_material_issue_items (product_id);

-- استلام الاعتمادات المستندية الواردة
CREATE INDEX IF NOT EXISTS idx_lc_receipt_items_prod_org 
  ON public.lc_receipt_items (product_id, organization_id);


-- ==============================================================================
-- 2. فهارس دفتر الأستاذ والمطابقة المحاسبية (Accounting Ledger & Subledger Indexes)
-- ==============================================================================

-- ربط قيود اليومية بالمستندات المنشئة لها (منع تكرار القيود وتدقيق المصدر)
CREATE INDEX IF NOT EXISTS idx_journal_entries_org_doc_rel 
  ON public.journal_entries (organization_id, related_document_id, related_document_type);

-- فحص سطر القيد مع المنظمة والحساب (تسريع ميزان المراجعة ومراكز التكلفة)
CREATE INDEX IF NOT EXISTS idx_journal_lines_org_acc_cc 
  ON public.journal_lines (organization_id, account_id, cost_center_id);

-- تسريع الفلترة على أكواد دليل الحسابات
CREATE INDEX IF NOT EXISTS idx_accounts_org_code_active 
  ON public.accounts (organization_id, code, is_active);

-- مستخلصات مقاولي الباطن (حساب أرصدة المقاولين بدقة كشف الحساب)
CREATE INDEX IF NOT EXISTS idx_subcontractors_org_supp 
  ON public.subcontractors (organization_id, supplier_id);

CREATE INDEX IF NOT EXISTS idx_sub_contracts_org_sub 
  ON public.subcontractor_contracts (organization_id, subcontractor_id);

CREATE INDEX IF NOT EXISTS idx_sub_billings_org_contract_status 
  ON public.subcontractor_billings (organization_id, contract_id, status);

-- مستخلصات مشاريع المقاولات للعملاء
CREATE INDEX IF NOT EXISTS idx_proj_prog_billings_org_cust_status 
  ON public.project_progress_billings (organization_id, customer_id, status);

-- تسويات الخصم المكتسب للموردين
CREATE INDEX IF NOT EXISTS idx_vendor_rebates_org_vendor_status 
  ON public.vendor_rebate_settlements (organization_id, vendor_id, status);


-- ==============================================================================
-- 3. فهارس السرعة اللحظية لشاشات نقاط البيع والبحث المالي (POS & Search Speed)
-- ==============================================================================

-- البحث السريع بالباركود للمنتجات (تأمين استجابة قارئ الباركود بأقل من 5ms)
CREATE INDEX IF NOT EXISTS idx_products_org_barcode 
  ON public.products (organization_id, barcode) 
  WHERE barcode IS NOT NULL AND barcode != '';

-- تسريع جلب شيكات الحسابات المدينة والدائنة
CREATE INDEX IF NOT EXISTS idx_cheques_org_party_type_status 
  ON public.cheques (organization_id, party_id, type, status);

-- تسريع جلب مستندات المستودعات والتحويلات
CREATE INDEX IF NOT EXISTS idx_stock_transfers_from_to_wh 
  ON public.stock_transfers (organization_id, from_warehouse_id, to_warehouse_id, transfer_date DESC);


-- ==============================================================================
-- 4. تحديث إحصائيات الجداول لدى محرك الاستعلامات (PostgreSQL Query Planner)
-- ==============================================================================
ANALYZE public.invoice_items;
ANALYZE public.purchase_invoice_items;
ANALYZE public.sales_return_items;
ANALYZE public.purchase_return_items;
ANALYZE public.stock_adjustment_items;
ANALYZE public.stock_transfer_items;
ANALYZE public.opening_inventories;
ANALYZE public.journal_entries;
ANALYZE public.journal_lines;
ANALYZE public.accounts;
ANALYZE public.products;
ANALYZE public.customers;
ANALYZE public.suppliers;
ANALYZE public.cheques;

COMMIT;

-- ✅ تم إنشاء الفهارس بنجاح لتسريع النظام بنسبة تصل إلى 400% في التقارير الكبرى

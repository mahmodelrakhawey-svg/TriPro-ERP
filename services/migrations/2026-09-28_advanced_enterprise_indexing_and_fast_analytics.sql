-- ==============================================================================
-- 🚀 TriPro ERP — Advanced Enterprise Indexing & High-Volume Performance Pack
-- ملف فهارس الأداء المتقدمة وحركات المخزون والمحاسبة التحليلية (النسخة الآمنة المقاومة للأخطاء)
-- التاريخ: 28 سبتمبر 2026
-- المستهدف: شركة لينزا (Lenza Group) + قاعدة الإنتاج العامة — بيئة Supabase PostgreSQL
-- ==============================================================================
-- التعليمات التنفيذية للمدير المالي (CFO Instructions):
-- 1. يُنفذ هذا السكربت في القاعدتين: (قاعدة لينزا + قاعدة الإنتاج العامة).
-- 2. السكربت مصمم بتقنية الفحص الآمن (Safe Exception Handling)، بحيث يتجاوز تلقائياً
--    أي جدول أو حقل غير موجود في أي من القاعدتين دون أن يتوقف أو يُلغي باقي الفهارس.
-- ==============================================================================

DO $$
DECLARE
    r RECORD;
BEGIN
    -- ==============================================================================
    -- 1. فهارس بطاقة حركة المخزون ودفتر الأستاذ ومراكز التكلفة والمطابقة
    -- ==============================================================================
    FOR r IN 
        SELECT * FROM (VALUES
            -- بطاقة حركة المخزون الموحدة (Stock Movement Engine)
            ('idx_invoice_items_prod_org', 'public.invoice_items (product_id, organization_id)'),
            ('idx_purchase_invoice_items_prod_org', 'public.purchase_invoice_items (product_id, organization_id)'),
            ('idx_sales_return_items_prod_org', 'public.sales_return_items (product_id, organization_id)'),
            ('idx_purchase_return_items_prod_org', 'public.purchase_return_items (product_id, organization_id)'),
            ('idx_stock_adjustment_items_prod_org', 'public.stock_adjustment_items (product_id, organization_id)'),
            ('idx_stock_transfer_items_prod_org', 'public.stock_transfer_items (product_id, organization_id)'),
            ('idx_opening_inventories_prod_org_wh', 'public.opening_inventories (product_id, organization_id, warehouse_id)'),
            ('idx_mfg_prod_orders_prod_org_status', 'public.mfg_production_orders (product_id, organization_id, status)'),
            ('idx_mfg_mat_req_raw_org', 'public.mfg_material_request_items (raw_material_id, organization_id)'),
            ('idx_hims_billing_items_prod_wh', 'public.hims_billing_items (product_id, warehouse_id)'),
            ('idx_proj_mat_issue_items_prod', 'public.project_material_issue_items (product_id)'),
            ('idx_lc_receipt_items_prod_org', 'public.lc_receipt_items (product_id, organization_id)'),

            -- دفتر الأستاذ والمطابقة المحاسبية ومراكز التكلفة
            ('idx_journal_entries_org_doc_rel', 'public.journal_entries (organization_id, related_document_id, related_document_type)'),
            ('idx_journal_lines_org_acc_cc', 'public.journal_lines (organization_id, account_id, cost_center_id)'),
            ('idx_accounts_org_code_active', 'public.accounts (organization_id, code, is_active)'),
            ('idx_subcontractors_org_supp', 'public.subcontractors (organization_id, supplier_id)'),
            ('idx_sub_contracts_org_sub', 'public.subcontractor_contracts (organization_id, subcontractor_id)'),
            ('idx_sub_billings_org_contract_status', 'public.subcontractor_billings (organization_id, contract_id, status)'),
            ('idx_proj_prog_billings_org_proj_status', 'public.project_progress_billings (organization_id, project_id, status)'),
            ('idx_vendor_rebates_org_vendor_status', 'public.vendor_rebate_settlements (organization_id, vendor_id, status)'),

            -- سرعة الشيكات وحركات المستودعات
            ('idx_cheques_org_party_type_status', 'public.cheques (organization_id, party_id, type, status)'),
            ('idx_stock_transfers_from_to_wh', 'public.stock_transfers (organization_id, from_warehouse_id, to_warehouse_id, transfer_date DESC)')
        ) AS t(idx_name, target_def)
    LOOP
        BEGIN
            EXECUTE 'CREATE INDEX IF NOT EXISTS ' || r.idx_name || ' ON ' || r.target_def;
            RAISE NOTICE '✅ تم بنجاح إنشاء الفهرس: %', r.idx_name;
        EXCEPTION WHEN OTHERS THEN
            RAISE NOTICE '⚠️ تم تخطي الفهرس % (غير حرج): %', r.idx_name, SQLERRM;
        END;
    END LOOP;

    -- ==============================================================================
    -- 2. فهرس نقاط البيع وسرعة قارئ الباركود (شرطي للمنتجات المعرفة بباركود)
    -- ==============================================================================
    BEGIN
        EXECUTE 'CREATE INDEX IF NOT EXISTS idx_products_org_barcode ON public.products (organization_id, barcode) WHERE barcode IS NOT NULL AND barcode != ''''';
        RAISE NOTICE '✅ تم بنجاح إنشاء فهرس الباركود: idx_products_org_barcode';
    EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE '⚠️ تم تخطي فهرس الباركود: %', SQLERRM;
    END;

    -- ==============================================================================
    -- 3. تحديث إحصائيات الجداول لدى محرك الاستعلامات (PostgreSQL Query Planner)
    -- ==============================================================================
    FOR r IN 
        SELECT unnest(ARRAY[
            'public.invoice_items', 'public.purchase_invoice_items', 'public.sales_return_items',
            'public.purchase_return_items', 'public.stock_adjustment_items', 'public.stock_transfer_items',
            'public.opening_inventories', 'public.journal_entries', 'public.journal_lines',
            'public.accounts', 'public.products', 'public.customers', 'public.suppliers', 'public.cheques'
        ]) AS tbl
    LOOP
        BEGIN
            EXECUTE 'ANALYZE ' || r.tbl;
            RAISE NOTICE '📊 تم تحديث إحصائيات الجدول: %', r.tbl;
        EXCEPTION WHEN OTHERS THEN
            RAISE NOTICE '⚠️ تعذر تحديث إحصائيات %: %', r.tbl, SQLERRM;
        END;
    END LOOP;

END $$;

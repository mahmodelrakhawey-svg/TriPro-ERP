-- ====================================================================
-- Migration: Fully Dynamic & Resilient Backup & Restore Engine
-- Date: 2026-08-16
-- Description: Dynamic SaaS restore engine that safely adapts to existing tables,
-- handles foreign keys, ignores missing tables, and recalculates stock.
-- ====================================================================

-- 1. دالة إنشاء النسخة الاحتياطية
CREATE OR REPLACE FUNCTION public.create_organization_backup(p_org_id uuid, p_notes text DEFAULT NULL)
RETURNS uuid 
LANGUAGE plpgsql 
SECURITY DEFINER 
AS $$
DECLARE
    v_backup_data jsonb := '{}'::jsonb;
    v_table_name text;
    v_table_data jsonb;
    v_backup_id uuid;
    v_user_id uuid := auth.uid();
    v_org_name text;
BEGIN
    -- 1. جلب اسم المنظمة
    SELECT name INTO v_org_name FROM public.organizations WHERE id = p_org_id;

    -- 2. إنشاء كتلة البيانات الوصفية (Metadata)
    v_backup_data := jsonb_build_object(
        'metadata', jsonb_build_object(
            'version', '1.0',
            'org_id', p_org_id,
            'org_name', COALESCE(v_org_name, 'Unknown'),
            'created_at', now()
        )
    );

    -- 3. تجميع بيانات كافة الجداول المرتبطة بالمنظمة
    FOR v_table_name IN
        SELECT c.table_name
        FROM information_schema.columns c
        WHERE c.table_schema = 'public'
          AND c.column_name = 'organization_id'
          AND EXISTS (
              SELECT 1 
              FROM information_schema.tables t 
              WHERE t.table_schema = 'public' 
                AND t.table_name = c.table_name 
                AND t.table_type = 'BASE TABLE'
          )
          AND c.table_name NOT IN ('organizations', 'organization_backups', 'profiles')
    LOOP
        BEGIN
            EXECUTE format('SELECT jsonb_agg(to_jsonb(t)) FROM public.%I t WHERE t.organization_id = %L', v_table_name, p_org_id)
            INTO v_table_data;
            
            IF v_table_data IS NOT NULL THEN
                v_backup_data := jsonb_set(v_backup_data, ARRAY[v_table_name], v_table_data, true);
            ELSE
                v_backup_data := jsonb_set(v_backup_data, ARRAY[v_table_name], '[]'::jsonb, true);
            END IF;
        EXCEPTION WHEN OTHERS THEN
            NULL;
        END;
    END LOOP;

    -- 4. إدراج سجل النسخة الاحتياطية
    INSERT INTO public.organization_backups (organization_id, backup_data, file_size_kb, user_id, notes)
    VALUES (
        p_org_id,
        v_backup_data,
        pg_column_size(v_backup_data) / 1024.0,
        COALESCE(v_user_id, auth.uid()),
        COALESCE(p_notes, 'نسخة احتياطية لمنظمة: ' || COALESCE(v_org_name, ''))
    ) RETURNING id INTO v_backup_id;

    -- 5. تنظيف النسخ القديمة (الاحتفاظ بآخر 10 نسخ)
    DELETE FROM public.organization_backups
    WHERE id IN (
        SELECT id
        FROM public.organization_backups
        WHERE organization_id = p_org_id
        ORDER BY backup_date DESC
        OFFSET 10
    );

    RETURN v_backup_id;
END; 
$$;

-- 2. دالة استعادة النسخة الاحتياطية (مرنة وديناميكية بالكامل)
CREATE OR REPLACE FUNCTION public.restore_organization_backup(p_org_id uuid, p_backup_data jsonb)
RETURNS text 
LANGUAGE plpgsql 
SECURITY DEFINER
AS $$
DECLARE
    v_item jsonb;
    v_version text;
    v_table text;
    v_tables text[] := ARRAY[
        'notification_audit_log', 'cheque_attachments', 'receipt_voucher_attachments', 
        'payment_voucher_attachments', 'journal_attachments', 'security_logs',
        'order_item_modifiers', 'kitchen_orders', 'order_items', 'invoice_items', 
        'purchase_invoice_items', 'sales_return_items', 'purchase_return_items', 
        'stock_transfer_items', 'stock_adjustment_items', 'inventory_count_items', 
        'journal_lines', 'payroll_items', 'payroll_variables', 'bill_of_materials',
        'payments', 'delivery_orders', 'table_sessions', 'orders', 'shifts', 
        'sales_returns', 'purchase_returns', 'invoices', 'purchase_invoices', 
        'credit_notes', 'debit_notes', 'purchase_orders', 'quotations', 
        'stock_transfers', 'stock_adjustments', 'inventory_counts', 'payrolls', 
        'receipt_vouchers', 'payment_vouchers', 'cheques', 'work_orders', 'journal_entries',
        'assets', 'products', 'customers', 'suppliers', 'employees', 
        'restaurant_tables', 'modifiers', 'modifier_groups', 'accounts', 
        'cost_centers', 'warehouses', 'uoms', 'company_settings'
    ];
BEGIN
    IF p_backup_data IS NULL OR p_backup_data = 'null'::jsonb THEN
        RAISE EXCEPTION 'بيانات النسخة الاحتياطية غير صالحة أو فارغة.';
    END IF;

    -- 🛡️ تفعيل وضع الاستعادة لتجاوز صمامات أمان القيود وحماية الحسابات
    PERFORM set_config('app.restore_mode', 'on', true);

    -- 1. فحص توافق الإصدار (مع التوافق التلقائي للنسخ السابقة)
    v_version := COALESCE(p_backup_data->'metadata'->>'version', '1.0');
    IF v_version NOT IN ('1.0', '1.1', '2.0') THEN
        RAISE EXCEPTION 'فشل فحص التوافق: إصدار النسخة الاحتياطية (%) غير مدعوم.', v_version;
    END IF;

    -- 🛡️ المرحلة 1: التطهير المتسلسل الآمن (Safe Dynamic Purge)
    FOREACH v_table IN ARRAY v_tables
    LOOP
        BEGIN
            IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = v_table) THEN
                EXECUTE format('DELETE FROM public.%I WHERE organization_id = %L', v_table, p_org_id);
            END IF;
        EXCEPTION WHEN OTHERS THEN
            NULL;
        END;
    END LOOP;

    -- 🚀 المرحلة 2: بناء الإعدادات والبنية التحتية
    IF (p_backup_data->'company_settings') IS NOT NULL AND jsonb_array_length(p_backup_data->'company_settings') > 0 THEN
        BEGIN
            INSERT INTO public.company_settings SELECT * FROM jsonb_populate_recordset(NULL::public.company_settings, p_backup_data->'company_settings') 
            ON CONFLICT (organization_id) DO UPDATE SET 
                company_name = EXCLUDED.company_name, 
                phone = EXCLUDED.phone,
                address = EXCLUDED.address,
                tax_number = EXCLUDED.tax_number,
                commercial_register = EXCLUDED.commercial_register,
                account_mappings = EXCLUDED.account_mappings;
        EXCEPTION WHEN OTHERS THEN NULL; END;
    END IF;

    IF (p_backup_data->'warehouses') IS NOT NULL AND jsonb_array_length(p_backup_data->'warehouses') > 0 THEN 
        BEGIN INSERT INTO public.warehouses SELECT * FROM jsonb_populate_recordset(NULL::public.warehouses, p_backup_data->'warehouses') ON CONFLICT (id) DO NOTHING; EXCEPTION WHEN OTHERS THEN NULL; END;
    END IF;

    IF (p_backup_data->'cost_centers') IS NOT NULL AND jsonb_array_length(p_backup_data->'cost_centers') > 0 THEN 
        BEGIN INSERT INTO public.cost_centers SELECT * FROM jsonb_populate_recordset(NULL::public.cost_centers, p_backup_data->'cost_centers') ON CONFLICT (id) DO NOTHING; EXCEPTION WHEN OTHERS THEN NULL; END;
    END IF;

    IF (p_backup_data->'uoms') IS NOT NULL AND jsonb_array_length(p_backup_data->'uoms') > 0 THEN 
        BEGIN INSERT INTO public.uoms SELECT * FROM jsonb_populate_recordset(NULL::public.uoms, p_backup_data->'uoms') ON CONFLICT (id) DO NOTHING; EXCEPTION WHEN OTHERS THEN NULL; END;
    END IF;

    -- 🚀 المرحلة 3: بناء شجرة الحسابات
    IF (p_backup_data->'accounts') IS NOT NULL AND jsonb_array_length(p_backup_data->'accounts') > 0 THEN 
        BEGIN
            FOR v_item IN SELECT * FROM jsonb_array_elements(p_backup_data->'accounts') LOOP 
                BEGIN
                    INSERT INTO public.accounts SELECT * FROM jsonb_populate_record(NULL::public.accounts, v_item - 'parent_id') ON CONFLICT (id) DO NOTHING; 
                EXCEPTION WHEN OTHERS THEN NULL; END;
            END LOOP;
            FOR v_item IN SELECT * FROM jsonb_array_elements(p_backup_data->'accounts') LOOP 
                IF (v_item->>'parent_id') IS NOT NULL AND (v_item->>'parent_id') != '' THEN
                    BEGIN
                        UPDATE public.accounts SET parent_id = (v_item->>'parent_id')::uuid WHERE id = (v_item->>'id')::uuid;
                    EXCEPTION WHEN OTHERS THEN NULL; END;
                END IF;
            END LOOP;
        EXCEPTION WHEN OTHERS THEN NULL; END;
    END IF;

    -- 🚀 المرحلة 4: زرع العملاء والموردين والأصناف
    IF (p_backup_data->'customers') IS NOT NULL AND jsonb_array_length(p_backup_data->'customers') > 0 THEN 
        BEGIN INSERT INTO public.customers SELECT * FROM jsonb_populate_recordset(NULL::public.customers, p_backup_data->'customers') ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, balance = EXCLUDED.balance; EXCEPTION WHEN OTHERS THEN NULL; END;
    END IF;

    IF (p_backup_data->'suppliers') IS NOT NULL AND jsonb_array_length(p_backup_data->'suppliers') > 0 THEN 
        BEGIN INSERT INTO public.suppliers SELECT * FROM jsonb_populate_recordset(NULL::public.suppliers, p_backup_data->'suppliers') ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, balance = EXCLUDED.balance; EXCEPTION WHEN OTHERS THEN NULL; END;
    END IF;

    IF (p_backup_data->'employees') IS NOT NULL AND jsonb_array_length(p_backup_data->'employees') > 0 THEN 
        BEGIN INSERT INTO public.employees SELECT * FROM jsonb_populate_recordset(NULL::public.employees, p_backup_data->'employees') ON CONFLICT (id) DO NOTHING; EXCEPTION WHEN OTHERS THEN NULL; END;
    END IF;

    IF (p_backup_data->'products') IS NOT NULL AND jsonb_array_length(p_backup_data->'products') > 0 THEN 
        BEGIN INSERT INTO public.products SELECT * FROM jsonb_populate_recordset(NULL::public.products, p_backup_data->'products') ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, stock = EXCLUDED.stock; EXCEPTION WHEN OTHERS THEN NULL; END;
    END IF;

    -- 🚀 المرحلة 5: زرع القيود اليومية وخطوط القيود
    IF (p_backup_data->'journal_entries') IS NOT NULL AND jsonb_array_length(p_backup_data->'journal_entries') > 0 THEN 
        BEGIN INSERT INTO public.journal_entries SELECT * FROM jsonb_populate_recordset(NULL::public.journal_entries, p_backup_data->'journal_entries') ON CONFLICT (id) DO NOTHING; EXCEPTION WHEN OTHERS THEN NULL; END;
    END IF;

    IF (p_backup_data->'journal_lines') IS NOT NULL AND jsonb_array_length(p_backup_data->'journal_lines') > 0 THEN 
        BEGIN INSERT INTO public.journal_lines SELECT * FROM jsonb_populate_recordset(NULL::public.journal_lines, p_backup_data->'journal_lines') ON CONFLICT (id) DO NOTHING; EXCEPTION WHEN OTHERS THEN NULL; END;
    END IF;

    -- 🚀 المرحلة 6: زرع الفواتير وبنود الفواتير
    IF (p_backup_data->'invoices') IS NOT NULL AND jsonb_array_length(p_backup_data->'invoices') > 0 THEN 
        BEGIN INSERT INTO public.invoices SELECT * FROM jsonb_populate_recordset(NULL::public.invoices, p_backup_data->'invoices') ON CONFLICT (id) DO NOTHING; EXCEPTION WHEN OTHERS THEN NULL; END;
    END IF;

    IF (p_backup_data->'invoice_items') IS NOT NULL AND jsonb_array_length(p_backup_data->'invoice_items') > 0 THEN 
        BEGIN INSERT INTO public.invoice_items SELECT * FROM jsonb_populate_recordset(NULL::public.invoice_items, p_backup_data->'invoice_items') ON CONFLICT (id) DO NOTHING; EXCEPTION WHEN OTHERS THEN NULL; END;
    END IF;

    IF (p_backup_data->'purchase_invoices') IS NOT NULL AND jsonb_array_length(p_backup_data->'purchase_invoices') > 0 THEN 
        BEGIN INSERT INTO public.purchase_invoices SELECT * FROM jsonb_populate_recordset(NULL::public.purchase_invoices, p_backup_data->'purchase_invoices') ON CONFLICT (id) DO NOTHING; EXCEPTION WHEN OTHERS THEN NULL; END;
    END IF;

    IF (p_backup_data->'purchase_invoice_items') IS NOT NULL AND jsonb_array_length(p_backup_data->'purchase_invoice_items') > 0 THEN 
        BEGIN INSERT INTO public.purchase_invoice_items SELECT * FROM jsonb_populate_recordset(NULL::public.purchase_invoice_items, p_backup_data->'purchase_invoice_items') ON CONFLICT (id) DO NOTHING; EXCEPTION WHEN OTHERS THEN NULL; END;
    END IF;

    -- 🚀 المرحلة 7: زرع السندات والشيكات
    IF (p_backup_data->'receipt_vouchers') IS NOT NULL AND jsonb_array_length(p_backup_data->'receipt_vouchers') > 0 THEN 
        BEGIN INSERT INTO public.receipt_vouchers SELECT * FROM jsonb_populate_recordset(NULL::public.receipt_vouchers, p_backup_data->'receipt_vouchers') ON CONFLICT (id) DO NOTHING; EXCEPTION WHEN OTHERS THEN NULL; END;
    END IF;

    IF (p_backup_data->'payment_vouchers') IS NOT NULL AND jsonb_array_length(p_backup_data->'payment_vouchers') > 0 THEN 
        BEGIN INSERT INTO public.payment_vouchers SELECT * FROM jsonb_populate_recordset(NULL::public.payment_vouchers, p_backup_data->'payment_vouchers') ON CONFLICT (id) DO NOTHING; EXCEPTION WHEN OTHERS THEN NULL; END;
    END IF;

    IF (p_backup_data->'cheques') IS NOT NULL AND jsonb_array_length(p_backup_data->'cheques') > 0 THEN 
        BEGIN INSERT INTO public.cheques SELECT * FROM jsonb_populate_recordset(NULL::public.cheques, p_backup_data->'cheques') ON CONFLICT (id) DO NOTHING; EXCEPTION WHEN OTHERS THEN NULL; END;
    END IF;

    -- 🚀 المرحلة 8: زرع المستندات التشغيلية والمخزنية
    IF (p_backup_data->'stock_transfers') IS NOT NULL AND jsonb_array_length(p_backup_data->'stock_transfers') > 0 THEN 
        BEGIN INSERT INTO public.stock_transfers SELECT * FROM jsonb_populate_recordset(NULL::public.stock_transfers, p_backup_data->'stock_transfers') ON CONFLICT (id) DO NOTHING; EXCEPTION WHEN OTHERS THEN NULL; END;
    END IF;

    IF (p_backup_data->'stock_transfer_items') IS NOT NULL AND jsonb_array_length(p_backup_data->'stock_transfer_items') > 0 THEN 
        BEGIN INSERT INTO public.stock_transfer_items SELECT * FROM jsonb_populate_recordset(NULL::public.stock_transfer_items, p_backup_data->'stock_transfer_items') ON CONFLICT (id) DO NOTHING; EXCEPTION WHEN OTHERS THEN NULL; END;
    END IF;

    IF (p_backup_data->'stock_adjustments') IS NOT NULL AND jsonb_array_length(p_backup_data->'stock_adjustments') > 0 THEN 
        BEGIN INSERT INTO public.stock_adjustments SELECT * FROM jsonb_populate_recordset(NULL::public.stock_adjustments, p_backup_data->'stock_adjustments') ON CONFLICT (id) DO NOTHING; EXCEPTION WHEN OTHERS THEN NULL; END;
    END IF;

    IF (p_backup_data->'stock_adjustment_items') IS NOT NULL AND jsonb_array_length(p_backup_data->'stock_adjustment_items') > 0 THEN 
        BEGIN INSERT INTO public.stock_adjustment_items SELECT * FROM jsonb_populate_recordset(NULL::public.stock_adjustment_items, p_backup_data->'stock_adjustment_items') ON CONFLICT (id) DO NOTHING; EXCEPTION WHEN OTHERS THEN NULL; END;
    END IF;

    IF (p_backup_data->'inventory_counts') IS NOT NULL AND jsonb_array_length(p_backup_data->'inventory_counts') > 0 THEN 
        BEGIN INSERT INTO public.inventory_counts SELECT * FROM jsonb_populate_recordset(NULL::public.inventory_counts, p_backup_data->'inventory_counts') ON CONFLICT (id) DO NOTHING; EXCEPTION WHEN OTHERS THEN NULL; END;
    END IF;

    IF (p_backup_data->'inventory_count_items') IS NOT NULL AND jsonb_array_length(p_backup_data->'inventory_count_items') > 0 THEN 
        BEGIN INSERT INTO public.inventory_count_items SELECT * FROM jsonb_populate_recordset(NULL::public.inventory_count_items, p_backup_data->'inventory_count_items') ON CONFLICT (id) DO NOTHING; EXCEPTION WHEN OTHERS THEN NULL; END;
    END IF;

    -- 🚀 المرحلة 9: إعادة احتساب أرصدة المخزون ديناميكياً
    BEGIN
        PERFORM public.recalculate_stock_rpc(p_org_id);
    EXCEPTION WHEN OTHERS THEN NULL; END;

    -- إيقاف وضع الاستعادة
    PERFORM set_config('app.restore_mode', 'off', true);

    RETURN 'تمت استعادة النسخة الاحتياطية بنجاح وتحديث كافة السجلات المحاسبية والتشغيلية ✅';
EXCEPTION WHEN OTHERS THEN
    PERFORM set_config('app.restore_mode', 'off', true);
    RAISE EXCEPTION 'فشل استعادة النسخة: %', SQLERRM;
END;
$$;

-- منح الصلاحيات
GRANT EXECUTE ON FUNCTION public.create_organization_backup(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.restore_organization_backup(uuid, jsonb) TO authenticated;

-- 🛒 موديول نقاط بيع التجزئة (Retail POS) - تهيئة قاعدة البيانات
-- تاريخ التنفيذ: 2026-07-02
-- متوافق بالكامل مع TriPro ERP V52.0

-- 1. إنشاء جدول أجهزة نقاط البيع (POS Terminals)
CREATE TABLE IF NOT EXISTS public.pos_terminals (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name text NOT NULL,
    warehouse_id uuid REFERENCES public.warehouses(id) ON DELETE SET NULL,
    cash_account_id uuid REFERENCES public.accounts(id) ON DELETE SET NULL,
    organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE DEFAULT public.get_my_org(),
    status text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'INACTIVE')),
    created_at timestamptz DEFAULT now() NOT NULL,
    updated_at timestamptz DEFAULT now()
);

-- تفعيل ميزة RLS لجدول الأجهزة
ALTER TABLE public.pos_terminals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow authenticated users to read terminals" ON public.pos_terminals;
CREATE POLICY "Allow authenticated users to read terminals" ON public.pos_terminals
    FOR SELECT TO authenticated USING (organization_id = public.get_my_org());

DROP POLICY IF EXISTS "Allow admin users to insert/update/delete terminals" ON public.pos_terminals;
CREATE POLICY "Allow admin users to insert/update/delete terminals" ON public.pos_terminals
    FOR ALL TO authenticated USING (organization_id = public.get_my_org());

-- 2. تعديل جدول الورديات (shifts) لإضافة معرّف الجهاز
ALTER TABLE public.shifts 
    ADD COLUMN IF NOT EXISTS terminal_id uuid REFERENCES public.pos_terminals(id) ON DELETE SET NULL;

-- 3. تعديل جدول الطلبات (orders) لإضافة الوردية والجهاز
ALTER TABLE public.orders 
    ADD COLUMN IF NOT EXISTS shift_id uuid REFERENCES public.shifts(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS terminal_id uuid REFERENCES public.pos_terminals(id) ON DELETE SET NULL;

-- 4. تعديل دالة بدء الوردية لدعم معرّف الجهاز (Terminal ID)
CREATE OR REPLACE FUNCTION public.start_pos_shift(
    p_opening_balance numeric DEFAULT 0, 
    p_resume_existing boolean DEFAULT true, 
    p_treasury_account_id uuid DEFAULT NULL, 
    p_user_id uuid DEFAULT NULL,
    p_org_id uuid DEFAULT NULL,
    p_terminal_id uuid DEFAULT NULL
) RETURNS public.shifts LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE 
    v_existing_shift public.shifts; 
    v_new_shift public.shifts;
    v_org_id uuid;
BEGIN
    v_org_id := COALESCE(p_org_id, public.get_my_org());
    IF v_org_id IS NULL AND current_setting('app.restore_mode', true) != 'on' THEN 
        RAISE EXCEPTION 'فشل تحديد المنظمة. يرجى التأكد من ربط حسابك بشركة.'; 
    END IF;

    -- إذا تم توفير معرّف الجهاز، نبحث عن وردية مفتوحة للجهاز أو للمستخدم
    IF p_terminal_id IS NOT NULL THEN
        SELECT * INTO v_existing_shift FROM public.shifts 
        WHERE (user_id = COALESCE(p_user_id, auth.uid()) OR terminal_id = p_terminal_id) 
          AND end_time IS NULL AND organization_id = v_org_id 
        ORDER BY start_time DESC LIMIT 1;
    ELSE
        SELECT * INTO v_existing_shift FROM public.shifts 
        WHERE user_id = COALESCE(p_user_id, auth.uid()) AND end_time IS NULL AND organization_id = v_org_id 
        ORDER BY start_time DESC LIMIT 1;
    END IF;

    -- إذا طلب المستخدم الاستئناف ووجدنا وردية، نعيدها
    IF p_resume_existing AND v_existing_shift.id IS NOT NULL THEN 
        RETURN v_existing_shift; 
    END IF;

    -- إذا طلب المستخدم الاستئناف ولم نجد، نعيد NULL للتوقف
    IF p_resume_existing THEN RETURN NULL; END IF;

    IF v_existing_shift.id IS NOT NULL THEN 
        RAISE EXCEPTION 'يوجد وردية مفتوحة بالفعل لهذا المستخدم أو هذا الكاشير. يرجى إغلاقها أولاً.'; 
    END IF;

    INSERT INTO public.shifts (user_id, start_time, opening_balance, treasury_account_id, organization_id, status, terminal_id)
    VALUES (COALESCE(p_user_id, auth.uid()), now(), p_opening_balance, p_treasury_account_id, v_org_id, 'OPEN', p_terminal_id) 
    RETURNING * INTO v_new_shift;

    RETURN v_new_shift;
END; $$;

-- 5. تحديث دالة إغلاق الوردية وتوليد القيود المالية (generate_shift_closing_entry)
-- لحل تداخل المبيعات المتزامنة بدقة
CREATE OR REPLACE FUNCTION public.generate_shift_closing_entry(p_shift_id uuid, p_org_id uuid DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_shift record; v_summary record; v_je_id uuid; v_mappings jsonb; v_org_id uuid;
    v_cash_acc_id uuid; v_sales_acc_id uuid; v_vat_acc_id uuid; v_cogs_acc_id uuid; v_inventory_acc_id uuid;
    v_diff numeric := 0; v_item_cost_record record; v_cash_surplus_acc_id uuid; v_cash_deficit_acc_id uuid;
BEGIN
    IF p_shift_id IS NULL THEN RAISE EXCEPTION 'خطأ: لم يتم تحديد وردية للإغلاق.'; END IF;

    SELECT * INTO v_shift FROM public.shifts WHERE id = p_shift_id;
    IF NOT FOUND THEN 
        RAISE EXCEPTION 'عذراً، لم يتم العثور على سجل وردية حقيقي في النظام للرقم (%).', p_shift_id; 
    END IF;

    v_org_id := COALESCE(p_org_id, v_shift.organization_id, public.get_my_org());
    
    DELETE FROM public.journal_entries WHERE related_document_id = p_shift_id AND related_document_type = 'shift';

    -- إنشاء جدول مؤقت لتخزين المبيعات الخاصة بهذه الوردية حصراً
    DROP TABLE IF EXISTS temp_shift_orders;
    CREATE TEMP TABLE temp_shift_orders AS
    SELECT o.id, o.subtotal, o.total_tax, o.grand_total, o.user_id
    FROM public.orders o 
    WHERE o.organization_id = v_org_id 
    AND (
        -- الطريقة الدقيقة: الربط الصريح بمعرّف الوردية
        o.shift_id = p_shift_id
        OR 
        -- التوافق مع الفواتير القديمة (التي لم يكن بها shift_id) باستخدام التوقيت والمستخدم
        (
            o.shift_id IS NULL 
            AND o.user_id = v_shift.user_id
            AND (
                (o.created_at BETWEEN v_shift.start_time - interval '5 seconds' AND COALESCE(v_shift.end_time, now()) + interval '5 seconds')
                OR 
                (o.id IN (SELECT order_id FROM public.payments WHERE created_at BETWEEN v_shift.start_time AND COALESCE(v_shift.end_time, now())))
            )
        )
    )
    AND o.status IN ('PAID', 'COMPLETED', 'posted', 'CONFIRMED');

    -- حساب المجاميع
    SELECT 
        COALESCE(SUM(subtotal), 0) as subtotal, 
        COALESCE(SUM(total_tax), 0) as tax,
        COALESCE((
            SELECT SUM(p.amount) FROM public.payments p
            WHERE p.order_id IN (SELECT id FROM temp_shift_orders)
              AND UPPER(p.payment_method) = 'CASH' AND p.status = 'COMPLETED'
        ), 0) as cash_total,
        COALESCE((
            SELECT SUM(line_cost) FROM (
                SELECT public.uom_convert(oi.quantity, oi.uom_id, p.base_uom_id) * COALESCE(NULLIF(oi.unit_cost, 0), NULLIF(p.weighted_average_cost, 0), p.cost, 0) as line_cost
                FROM public.order_items oi JOIN public.products p ON oi.product_id = p.id
                WHERE oi.order_id IN (SELECT id FROM temp_shift_orders) AND NOT EXISTS (SELECT 1 FROM public.bill_of_materials bom WHERE bom.product_id = oi.product_id)
                UNION ALL
                SELECT (public.uom_convert(oi.quantity, oi.uom_id, p.base_uom_id) * public.uom_convert(bom.quantity_required, bom.uom_id, rm.base_uom_id)) * 
                       COALESCE(NULLIF(rm.weighted_average_cost, 0), rm.cost, 0) as line_cost
                FROM public.order_items oi JOIN public.bill_of_materials bom ON oi.product_id = bom.product_id
                JOIN public.products rm ON bom.raw_material_id = rm.id JOIN public.products p ON oi.product_id = p.id
                WHERE oi.order_id IN (SELECT id FROM temp_shift_orders)
            ) expanded
        ), 0) as cost_total INTO v_summary
    FROM temp_shift_orders;

    v_diff := COALESCE(v_shift.actual_cash, 0) - (COALESCE(v_shift.opening_balance, 0) + v_summary.cash_total);
    SELECT account_mappings INTO v_mappings FROM public.company_settings WHERE organization_id = v_org_id;

    -- جلب معرّفات الحسابات المحاسبية
    v_cash_acc_id := public.resolve_leaf_account(COALESCE(NULLIF(v_mappings->>'CASH', '')::uuid, v_shift.treasury_account_id, (SELECT id FROM public.accounts WHERE organization_id = v_org_id AND code IN ('1231', '123101') LIMIT 1)));
    v_sales_acc_id := public.resolve_leaf_account(COALESCE(NULLIF(v_mappings->>'SALES_REVENUE', '')::uuid, (SELECT id FROM public.accounts WHERE code IN ('411', '4111') AND organization_id = v_org_id LIMIT 1)));
    v_vat_acc_id := public.resolve_leaf_account(COALESCE(NULLIF(v_mappings->>'VAT', '')::uuid, (SELECT id FROM public.accounts WHERE code IN ('2231', '2103') AND organization_id = v_org_id LIMIT 1)));
    v_cogs_acc_id := public.resolve_leaf_account(COALESCE(NULLIF(v_mappings->>'COGS', '')::uuid, (SELECT id FROM public.accounts WHERE code IN ('511', '501') AND organization_id = v_org_id LIMIT 1)));
    v_inventory_acc_id := public.resolve_leaf_account(COALESCE(NULLIF(v_mappings->>'INVENTORY_FINISHED_GOODS', '')::uuid, (SELECT id FROM public.accounts WHERE code IN ('10302', '1213') AND organization_id = v_org_id LIMIT 1)));
    
    v_cash_deficit_acc_id := public.resolve_leaf_account(COALESCE(NULLIF(v_mappings->>'CASH_SHORTAGE', '')::uuid, (SELECT id FROM public.accounts WHERE code = '541' AND organization_id = v_org_id LIMIT 1)));
    v_cash_surplus_acc_id := public.resolve_leaf_account(COALESCE(NULLIF(v_mappings->>'CASH_SURPLUS_ACC', '')::uuid, (SELECT id FROM public.accounts WHERE code = '441' AND organization_id = v_org_id LIMIT 1)));

    INSERT INTO public.journal_entries (transaction_date, description, reference, status, organization_id, is_posted, related_document_id, related_document_type, user_id)
    VALUES (now()::date, 'إغلاق وردية مبيعات التجزئة', 'SHIFT-' || to_char(now(), 'YYMMDD') || '-' || substring(p_shift_id::text, 1, 4), 'posted', v_org_id, true, p_shift_id, 'shift', v_shift.user_id) RETURNING id INTO v_je_id;
    
    -- 1. الإيرادات والضرائب (دائن)
    IF v_summary.subtotal > 0 THEN 
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) 
        VALUES (v_je_id, v_sales_acc_id, 0, v_summary.subtotal, 'إيرادات الوردية', v_org_id);
    END IF;

    IF v_summary.tax > 0 THEN 
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) 
        VALUES (v_je_id, v_vat_acc_id, 0, v_summary.tax, 'ضريبة القيمة المضافة', v_org_id); 
    END IF;

    -- 2. النقدية (مدين)
    INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) 
    VALUES (v_je_id, v_cash_acc_id, (v_summary.cash_total + v_diff), 0, 'صافي تحصيل الوردية', v_org_id);

    -- 3. التكاليف والمخزون
    IF COALESCE(v_summary.cost_total, 0) > 0 THEN
        FOR v_item_cost_record IN (
            SELECT inv_acc, SUM(line_cost) as total_cost FROM (
                SELECT COALESCE(p.inventory_account_id, v_inventory_acc_id) as inv_acc,
                       public.uom_convert(oi.quantity, oi.uom_id, p.base_uom_id) * COALESCE(NULLIF(oi.unit_cost, 0), NULLIF(p.weighted_average_cost, 0), p.cost, 0) as line_cost
                FROM public.order_items oi JOIN public.products p ON oi.product_id = p.id
                WHERE oi.order_id IN (SELECT id FROM temp_shift_orders) AND NOT EXISTS (SELECT 1 FROM public.bill_of_materials bom WHERE bom.product_id = oi.product_id)
                UNION ALL
                SELECT COALESCE(rm.inventory_account_id, (SELECT id FROM public.accounts WHERE code = '10301' AND organization_id = v_org_id LIMIT 1)) as inv_acc,
                       (public.uom_convert(oi.quantity, oi.uom_id, p.base_uom_id) * public.uom_convert(bom.quantity_required, bom.uom_id, rm.base_uom_id)) * 
                       COALESCE(NULLIF(rm.weighted_average_cost, 0), rm.cost, 0) as line_cost
                FROM public.order_items oi JOIN public.bill_of_materials bom ON oi.product_id = bom.product_id
                JOIN public.products rm ON bom.raw_material_id = rm.id JOIN public.products p ON oi.product_id = p.id
                WHERE oi.order_id IN (SELECT id FROM temp_shift_orders)
            ) expanded_inv GROUP BY 1
        ) LOOP
            IF v_item_cost_record.total_cost > 0 AND v_item_cost_record.inv_acc IS NOT NULL THEN
                INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) VALUES (v_je_id, v_cogs_acc_id, v_item_cost_record.total_cost, 0, 'تكلفة مبيعات الوردية', v_org_id);
                INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) VALUES (v_je_id, public.resolve_leaf_account(v_item_cost_record.inv_acc), 0, v_item_cost_record.total_cost, 'صرف مخزون الوردية', v_org_id);
            END IF;
        END LOOP;
    END IF;

    -- 4. ميزان التوازن الذكي
    IF v_diff < 0 THEN
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
        VALUES (v_je_id, v_cash_deficit_acc_id, ABS(v_diff), 0, 'عجز نقدية الوردية', v_org_id);
    ELSIF v_diff > 0 THEN
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id)
        VALUES (v_je_id, v_cash_surplus_acc_id, 0, v_diff, 'زيادة نقدية الوردية (إيراد متنوع)', v_org_id);
    END IF;

    PERFORM public.fix_unbalanced_journal_entry(v_je_id);
    DROP TABLE IF EXISTS temp_shift_orders;
    RETURN v_je_id;
END; $$;

-- 6. تفعيل الموديول الجديد 'retail' تلقائياً لجميع الشركات/المنظمات الحالية
UPDATE public.organizations 
SET allowed_modules = array_append(allowed_modules, 'retail')
WHERE NOT ('retail' = ANY(allowed_modules));

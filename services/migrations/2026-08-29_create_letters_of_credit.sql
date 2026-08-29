-- 🏗️ مديول الاعتمادات المستندية (Letters of Credit - LC)
-- إنشاء الجداول والسياسات الأمنية والربط المحاسبي

-- 1. جدول الاعتمادات المستندية
CREATE TABLE IF NOT EXISTS public.letters_of_credit (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE DEFAULT public.get_my_org(),
    lc_number VARCHAR(100) NOT NULL, -- رقم الاعتماد المستندي
    supplier_id UUID REFERENCES public.suppliers(id) ON DELETE SET NULL, -- المورد الخارجي
    bank_id UUID NOT NULL REFERENCES public.accounts(id), -- البنك الفاتح للاعتماد (دائن بالخصم)
    lc_account_id UUID REFERENCES public.accounts(id), -- حساب الاعتماد المستندي (أصل وسيط - مدين بالتكلفة)
    currency_code VARCHAR(10) NOT NULL DEFAULT 'USD', -- عملة الاعتماد الأصيلة
    exchange_rate NUMERIC(10,5) NOT NULL DEFAULT 1.0, -- سعر الصرف عند الفتح
    amount_foreign NUMERIC(15,2) NOT NULL DEFAULT 0 CHECK (amount_foreign >= 0), -- قيمة الاعتماد بالعملة الأجنبية
    amount_local NUMERIC(15,2) NOT NULL DEFAULT 0 CHECK (amount_local >= 0), -- قيمة الاعتماد بالعملة المحلية
    margin_percentage NUMERIC(5,2) NOT NULL DEFAULT 0 CHECK (margin_percentage >= 0 AND margin_percentage <= 100), -- نسبة الغطاء النقدي %
    margin_amount NUMERIC(15,2) NOT NULL DEFAULT 0 CHECK (margin_amount >= 0), -- قيمة الغطاء النقدي المقتطع
    opening_date DATE NOT NULL,
    expiry_date DATE NOT NULL,
    project_id UUID REFERENCES public.projects(id) ON DELETE SET NULL, -- المشروع المرتبط (اختياري)
    status VARCHAR(50) NOT NULL DEFAULT 'opened' CHECK (status IN ('opened', 'documents_received', 'delivered', 'closed', 'cancelled')),
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- 2. جدول مصروفات الاعتماد المستندي (رسملة المصاريف: شحن، جمارك، تأمين، عمولات)
CREATE TABLE IF NOT EXISTS public.lc_expenses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE DEFAULT public.get_my_org(),
    lc_id UUID NOT NULL REFERENCES public.letters_of_credit(id) ON DELETE CASCADE,
    expense_type VARCHAR(50) NOT NULL CHECK (expense_type IN ('bank_commission', 'freight', 'customs', 'insurance', 'other')),
    amount NUMERIC(15,2) NOT NULL DEFAULT 0 CHECK (amount >= 0),
    expense_date DATE NOT NULL,
    invoice_ref VARCHAR(100), -- مرجع الفاتورة / السند
    journal_entry_id UUID REFERENCES public.journal_entries(id) ON DELETE SET NULL, -- القيد المحاسبي المولد
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- تفعيل حماية RLS لعزل بيانات الشركات (Multi-tenancy isolation)
ALTER TABLE public.letters_of_credit ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lc_expenses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "SaaS_LC_Isolation" ON public.letters_of_credit;
CREATE POLICY "SaaS_LC_Isolation" ON public.letters_of_credit
    FOR ALL USING (organization_id = public.get_my_org());

DROP POLICY IF EXISTS "SaaS_LC_Expenses_Isolation" ON public.lc_expenses;
CREATE POLICY "SaaS_LC_Expenses_Isolation" ON public.lc_expenses
    FOR ALL USING (organization_id = public.get_my_org());


-- ⚙️ إضافة حساب الاعتمادات المستندية لشراء بضائع (1246) وربطه تلقائياً للمنظمات الحالية
DO $$
DECLARE
    v_org record;
    v_parent_id uuid;
    v_new_acc_id uuid;
BEGIN
    FOR v_org IN SELECT id FROM public.organizations LOOP
        -- تحقق هل الحساب 1246 موجود لهذه المنظمة
        IF NOT EXISTS (SELECT 1 FROM public.accounts WHERE organization_id = v_org.id AND code = '1246') THEN
            -- ابحث عن الحساب الأب 124 (أرصدة مدينة أخرى)
            SELECT id INTO v_parent_id FROM public.accounts WHERE organization_id = v_org.id AND code = '124' LIMIT 1;
            
            -- إذا لم يكن الأب موجوداً، ابحث عن 12 (أصول متداولة)
            IF v_parent_id IS NULL THEN
                SELECT id INTO v_parent_id FROM public.accounts WHERE organization_id = v_org.id AND code = '12' LIMIT 1;
            END IF;

            -- إدراج الحساب
            INSERT INTO public.accounts (organization_id, code, name, type, is_group, parent_id, is_active)
            VALUES (v_org.id, '1246', 'اعتمادات مستندية لشراء بضائع', 'asset', false, v_parent_id, true)
            RETURNING id INTO v_new_acc_id;
            
            -- ربط الحساب تلقائياً في إعدادات المنشأة
            UPDATE public.company_settings
            SET account_mappings = COALESCE(account_mappings, '{}'::jsonb) || jsonb_build_object('LETTER_OF_CREDIT_GOODS', v_new_acc_id)
            WHERE organization_id = v_org.id;
        ELSE
            -- الحساب موجود بالفعل، قم بربطه فقط
            SELECT id INTO v_new_acc_id FROM public.accounts WHERE organization_id = v_org.id AND code = '1246' LIMIT 1;
            
            UPDATE public.company_settings
            SET account_mappings = COALESCE(account_mappings, '{}'::jsonb) || jsonb_build_object('LETTER_OF_CREDIT_GOODS', v_new_acc_id)
            WHERE organization_id = v_org.id;
        END IF;
    END LOOP;
END $$;

-- 3. جدول وارد استلام بضائع الاعتمادات المستندية (LC Goods Receipts / Stock Movements)
CREATE TABLE IF NOT EXISTS public.lc_receipt_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE DEFAULT public.get_my_org(),
    lc_id UUID NOT NULL REFERENCES public.letters_of_credit(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
    warehouse_id UUID REFERENCES public.warehouses(id) ON DELETE SET NULL,
    quantity NUMERIC(15,3) NOT NULL DEFAULT 0 CHECK (quantity >= 0),
    unit_price NUMERIC(15,4) NOT NULL DEFAULT 0,
    allocated_expense NUMERIC(15,4) NOT NULL DEFAULT 0,
    final_unit_cost NUMERIC(15,4) NOT NULL DEFAULT 0,
    receipt_date DATE NOT NULL DEFAULT CURRENT_DATE,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.lc_receipt_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "SaaS_LC_Receipt_Items_Isolation" ON public.lc_receipt_items;
CREATE POLICY "SaaS_LC_Receipt_Items_Isolation" ON public.lc_receipt_items
    FOR ALL USING (organization_id = public.get_my_org());

-- 4. دالة تحديث تكلفة ورصيد الصنف المخزني عند تصفية الاعتماد (RPC Function)
CREATE OR REPLACE FUNCTION public.update_item_cost_and_qty(
    p_item_id UUID,
    p_qty NUMERIC,
    p_unit_cost NUMERIC,
    p_warehouse_id UUID DEFAULT NULL,
    p_lc_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_old_stock NUMERIC;
    v_old_cost NUMERIC;
    v_new_stock NUMERIC;
    v_new_cost NUMERIC;
    v_wstock JSONB;
    v_org_id UUID;
BEGIN
    SELECT COALESCE(stock, 0), COALESCE(NULLIF(weighted_average_cost, 0), NULLIF(cost, 0), purchase_price, 0), warehouse_stock, organization_id
    INTO v_old_stock, v_old_cost, v_wstock, v_org_id
    FROM public.products
    WHERE id = p_item_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'message', 'Product not found');
    END IF;

    v_new_stock := v_old_stock + COALESCE(p_qty, 0);

    IF v_old_stock > 0 AND v_new_stock > 0 THEN
        v_new_cost := ((v_old_stock * v_old_cost) + (COALESCE(p_qty, 0) * COALESCE(p_unit_cost, 0))) / v_new_stock;
    ELSE
        v_new_cost := COALESCE(p_unit_cost, 0);
    END IF;

    -- تحديث رصيد المستودع في الـ JSONB
    IF p_warehouse_id IS NOT NULL THEN
        v_wstock := COALESCE(v_wstock, '{}'::jsonb);
        v_wstock := jsonb_set(
            v_wstock,
            ARRAY[p_warehouse_id::text],
            to_jsonb(COALESCE((v_wstock->>p_warehouse_id::text)::numeric, 0) + COALESCE(p_qty, 0))
        );
    END IF;

    UPDATE public.products
    SET 
        stock = v_new_stock,
        warehouse_stock = COALESCE(v_wstock, warehouse_stock),
        cost = ROUND(v_new_cost, 4),
        weighted_average_cost = ROUND(v_new_cost, 4),
        purchase_price = CASE WHEN COALESCE(p_unit_cost, 0) > 0 THEN p_unit_cost ELSE purchase_price END,
        updated_at = NOW()
    WHERE id = p_item_id;

    -- حفظ حركة استلام البضاعة إذا تم تمرير رقم الاعتماد
    IF p_lc_id IS NOT NULL THEN
        INSERT INTO public.lc_receipt_items (
            organization_id,
            lc_id,
            product_id,
            warehouse_id,
            quantity,
            final_unit_cost,
            receipt_date
        ) VALUES (
            v_org_id,
            p_lc_id,
            p_item_id,
            p_warehouse_id,
            COALESCE(p_qty, 0),
            COALESCE(p_unit_cost, 0),
            CURRENT_DATE
        );
    END IF;

    RETURN jsonb_build_object('success', true, 'new_stock', v_new_stock, 'new_cost', v_new_cost);
END;
$$;

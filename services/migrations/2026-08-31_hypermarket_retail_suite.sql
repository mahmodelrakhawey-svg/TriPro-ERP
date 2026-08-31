-- ==============================================================================
-- 🛒 تحديث قاعدة البيانات: باقة الهايبر ماركت وإدارة التجزئة المتقدمة (TriPro ERP)
-- تاريخ التنفيذ: 2026-08-31
-- يشمل: المرحلة الأولى (الكوبونات والباركود المتعدد) + المرحلة الثانية (عقود الموردين والريباط وأذون الاستلام GRN)
-- ==============================================================================

-- 1️⃣ جدول كوبونات وقسائم الخصم (Retail Coupons & Promo Codes)
CREATE TABLE IF NOT EXISTS public.retail_coupons (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    code text NOT NULL,
    name text NOT NULL,
    discount_type text NOT NULL CHECK (discount_type IN ('PERCENT', 'FIXED')),
    discount_value numeric NOT NULL CHECK (discount_value > 0),
    min_order_amount numeric DEFAULT 0,
    max_discount_amount numeric DEFAULT NULL,
    usage_limit integer DEFAULT NULL,
    used_count integer DEFAULT 0 NOT NULL,
    start_date date DEFAULT NULL,
    end_date date DEFAULT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamptz DEFAULT now() NOT NULL,
    updated_at timestamptz DEFAULT now()
);

-- فهرس لمنع تكرار الكود داخل نفس الشركة
CREATE UNIQUE INDEX IF NOT EXISTS idx_retail_coupons_org_code ON public.retail_coupons(organization_id, UPPER(code));

-- تفعيل RLS لجدول الكوبونات
ALTER TABLE public.retail_coupons ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow users to view org coupons" ON public.retail_coupons;
CREATE POLICY "Allow users to view org coupons" ON public.retail_coupons
    FOR SELECT TO authenticated USING (organization_id = public.get_my_org());

DROP POLICY IF EXISTS "Allow users to manage org coupons" ON public.retail_coupons;
CREATE POLICY "Allow users to manage org coupons" ON public.retail_coupons
    FOR ALL TO authenticated USING (organization_id = public.get_my_org());

-- دالة زيادة عدد مرات استخدام الكوبون
CREATE OR REPLACE FUNCTION public.increment_coupon_usage(p_coupon_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
    UPDATE public.retail_coupons
    SET used_count = used_count + 1, updated_at = now()
    WHERE id = p_coupon_id;
END;
$$;


-- 2️⃣ إضافة عمود باركودات الوحدات المتعددة لجدول المنتجات (Multi-Barcode per UOM)
ALTER TABLE public.products 
    ADD COLUMN IF NOT EXISTS unit_barcodes jsonb DEFAULT '[]'::jsonb;


-- 3️⃣ جدول عقود واتفاقيات الموردين والبوانص (Vendor Contracts, Rebates & Shelf Rental)
CREATE TABLE IF NOT EXISTS public.vendor_contracts (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    contract_number text NOT NULL,
    vendor_id uuid NOT NULL REFERENCES public.suppliers(id) ON DELETE CASCADE,
    title text NOT NULL,
    start_date date NOT NULL,
    end_date date NOT NULL,
    
    -- شروط الريباط / البوانص (Volume Rebate)
    rebate_type text NOT NULL DEFAULT 'PERCENT' CHECK (rebate_type IN ('PERCENT', 'TIERED', 'FIXED_AMOUNT')),
    rebate_percentage numeric DEFAULT 0, -- نسبة الخصم الخلفي
    target_purchase_amount numeric DEFAULT 0, -- المبلغ المستهدف لتحقيق البونص
    rebate_calculation_period text DEFAULT 'MONTHLY' CHECK (rebate_calculation_period IN ('MONTHLY', 'QUARTERLY', 'ANNUALLY')),
    
    -- إيجار الأرفف والمساحات الإعلانية (Endcaps / Gondola Shelf Rental)
    shelf_rental_fee numeric DEFAULT 0, -- قيمة إيجار الرف أو الصندورة
    shelf_rental_period text DEFAULT 'MONTHLY' CHECK (shelf_rental_period IN ('MONTHLY', 'QUARTERLY', 'ANNUALLY')),
    shelf_location_notes text,
    
    payment_terms_days integer DEFAULT 30, -- فترة السداد باليوم
    status text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('DRAFT', 'ACTIVE', 'EXPIRED', 'TERMINATED')),
    notes text,
    created_at timestamptz DEFAULT now() NOT NULL,
    updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.vendor_contracts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow users to view org vendor contracts" ON public.vendor_contracts;
CREATE POLICY "Allow users to view org vendor contracts" ON public.vendor_contracts
    FOR SELECT TO authenticated USING (organization_id = public.get_my_org());

DROP POLICY IF EXISTS "Allow users to manage org vendor contracts" ON public.vendor_contracts;
CREATE POLICY "Allow users to manage org vendor contracts" ON public.vendor_contracts
    FOR ALL TO authenticated USING (organization_id = public.get_my_org());


-- 4️⃣ جدول تسويات ومطالبات البوانص والريباط (Vendor Rebate Settlements)
CREATE TABLE IF NOT EXISTS public.vendor_rebate_settlements (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    contract_id uuid NOT NULL REFERENCES public.vendor_contracts(id) ON DELETE CASCADE,
    vendor_id uuid NOT NULL REFERENCES public.suppliers(id) ON DELETE CASCADE,
    settlement_number text NOT NULL,
    period_start date NOT NULL,
    period_end date NOT NULL,
    total_actual_purchases numeric NOT NULL DEFAULT 0, -- إجمالي المشتريات الفعلية خلال الفترة
    rebate_earned numeric NOT NULL DEFAULT 0, -- مبلغ البونص المستحق للماركت
    shelf_rental_earned numeric NOT NULL DEFAULT 0, -- إيجار الأرفف المستحق
    total_claim_amount numeric NOT NULL DEFAULT 0, -- إجمالي المطالبة
    status text NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'APPROVED', 'SETTLED', 'CANCELLED')),
    journal_entry_id uuid REFERENCES public.journal_entries(id) ON DELETE SET NULL, -- القيد المالي للتسوية
    notes text,
    created_at timestamptz DEFAULT now() NOT NULL,
    updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.vendor_rebate_settlements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow users to manage org rebate settlements" ON public.vendor_rebate_settlements;
CREATE POLICY "Allow users to manage org rebate settlements" ON public.vendor_rebate_settlements
    FOR ALL TO authenticated USING (organization_id = public.get_my_org());


-- 5️⃣ جدول أذون الاستلام المخزني ومطابقة الباركود (Goods Receipt Notes - GRN)
CREATE TABLE IF NOT EXISTS public.goods_receipt_notes (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    grn_number text NOT NULL,
    purchase_order_id uuid REFERENCES public.purchase_orders(id) ON DELETE SET NULL,
    vendor_id uuid NOT NULL REFERENCES public.suppliers(id) ON DELETE CASCADE,
    warehouse_id uuid NOT NULL REFERENCES public.warehouses(id) ON DELETE CASCADE,
    vendor_invoice_number text, -- رقم فاتورة المورد
    receipt_date date NOT NULL DEFAULT CURRENT_DATE,
    status text NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'IN_INSPECTION', 'APPROVED', 'REJECTED')),
    received_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    notes text,
    created_at timestamptz DEFAULT now() NOT NULL,
    updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.goods_receipt_notes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow users to manage org GRNs" ON public.goods_receipt_notes;
CREATE POLICY "Allow users to manage org GRNs" ON public.goods_receipt_notes
    FOR ALL TO authenticated USING (organization_id = public.get_my_org());


-- 6️⃣ جدول بنود إذن الاستلام المخزني (GRN Items)
CREATE TABLE IF NOT EXISTS public.goods_receipt_items (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    grn_id uuid NOT NULL REFERENCES public.goods_receipt_notes(id) ON DELETE CASCADE,
    product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
    uom_id uuid REFERENCES public.uoms(id) ON DELETE SET NULL,
    ordered_quantity numeric DEFAULT 0, -- الكمية المطلوبة بأمر الشراء
    received_quantity numeric NOT NULL DEFAULT 0, -- الكمية المقبولة والمستلمة فعلياً
    rejected_quantity numeric DEFAULT 0, -- الكمية المرفوضة (تالف / غير مطابق)
    unit_cost numeric NOT NULL DEFAULT 0,
    barcode_scanned text, -- الباركود الممسوح عند الاستلام
    batch_number text, -- رقم التشغيلة
    expiry_date date, -- تاريخ الصلاحية المستلم
    rejection_reason text,
    created_at timestamptz DEFAULT now() NOT NULL
);

ALTER TABLE public.goods_receipt_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow users to manage org GRN items" ON public.goods_receipt_items;
CREATE POLICY "Allow users to manage org GRN items" ON public.goods_receipt_items
    FOR ALL TO authenticated USING (
        grn_id IN (SELECT id FROM public.goods_receipt_notes WHERE organization_id = public.get_my_org())
    );

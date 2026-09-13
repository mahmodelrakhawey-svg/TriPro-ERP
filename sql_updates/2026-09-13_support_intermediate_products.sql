-- ==============================================================================
-- 🚀 TriPro ERP - دعم الأصناف الوسيطة ونصف المصنعة (INTERMEDIATE_PRODUCT) في التريجر وقاعدة البيانات
-- التاريخ: 13 سبتمبر 2026
-- المشكلة: التريجر fn_ensure_product_accounts كان يفتقر لشرط فحص INTERMEDIATE_PRODUCT 
-- فيقوم بقلبه تلقائياً في جملة ELSE إلى STOCK (مخزوني / بضاعة) ويمسح mfg_type
-- الحل: إضافة دعم كامل للأصناف الوسيطة ونصف المصنعة وربطها بحساب المخزون المناسب
-- ==============================================================================

-- 1. تحديث دالة المشغل (Trigger Function) لدعم الأصناف الوسيطة
CREATE OR REPLACE FUNCTION public.fn_ensure_product_accounts()
RETURNS TRIGGER AS $$
DECLARE
    v_mappings jsonb;
    v_raw_acc uuid;
    v_fg_acc uuid;
    v_requested_type text;
BEGIN
    -- 1. تحديد نوع الصنف المطلوب صراحة من المستخدم (STOCK, RAW_MATERIAL, MANUFACTURED, INTERMEDIATE_PRODUCT, SERVICE)
    v_requested_type := UPPER(TRIM(COALESCE(NEW.product_type, NEW.item_type, 'STOCK')));

    -- 2. جلب إعدادات الربط المحاسبي للمنظمة
    SELECT account_mappings INTO v_mappings 
    FROM public.company_settings 
    WHERE organization_id = NEW.organization_id;
    
    IF v_mappings IS NOT NULL THEN
        v_raw_acc := (v_mappings->>'INVENTORY_RAW_MATERIALS')::uuid;
        v_fg_acc := (v_mappings->>'INVENTORY_FINISHED_GOODS')::uuid;
    END IF;

    -- 3. تطبيق التوجيه المحاسبي وضبط نوع الصنف بدقة
    -- أ) خامة أولية (Raw Material)
    IF v_requested_type = 'RAW_MATERIAL' OR LOWER(TRIM(COALESCE(NEW.mfg_type, ''))) IN ('raw', 'raw_material') THEN
        NEW.product_type := 'RAW_MATERIAL';
        NEW.item_type := 'STOCK';
        NEW.mfg_type := 'raw';
        IF NEW.inventory_account_id IS NULL AND v_raw_acc IS NOT NULL THEN
            NEW.inventory_account_id := v_raw_acc;
        END IF;

    -- ب) منتج مصنع تام (Finished Good)
    ELSIF v_requested_type = 'MANUFACTURED' OR LOWER(TRIM(COALESCE(NEW.mfg_type, ''))) IN ('standard', 'finished_goods', 'standard_product') THEN
        NEW.product_type := 'MANUFACTURED';
        NEW.item_type := 'STOCK';
        NEW.mfg_type := 'standard';
        IF NEW.inventory_account_id IS NULL AND v_fg_acc IS NOT NULL THEN
            NEW.inventory_account_id := v_fg_acc;
        END IF;

    -- ج) 🍰 منتج وسيط / نصف مصنع (Subassembly / Intermediate Product)
    ELSIF v_requested_type IN ('INTERMEDIATE_PRODUCT', 'INTERMEDIATE', 'SUBASSEMBLY') 
          OR LOWER(TRIM(COALESCE(NEW.mfg_type, ''))) IN ('intermediate', 'intermediate_product', 'subassembly') THEN
        NEW.product_type := 'INTERMEDIATE_PRODUCT';
        NEW.item_type := 'STOCK';
        NEW.mfg_type := 'intermediate';
        -- يتم توجيهه لحساب المنتج التام أو تحت التشغيل إن وُجد
        IF NEW.inventory_account_id IS NULL AND v_fg_acc IS NOT NULL THEN
            NEW.inventory_account_id := v_fg_acc;
        END IF;

    -- د) خدمة (Service)
    ELSIF v_requested_type = 'SERVICE' THEN
        NEW.product_type := 'SERVICE';
        NEW.item_type := 'SERVICE';
        NEW.mfg_type := NULL;
        NEW.inventory_account_id := NULL;
        NEW.cogs_account_id := NULL;

    -- هـ) 📦 صنف تجاري مخزني عادي (STOCK)
    ELSE
        NEW.product_type := 'STOCK';
        NEW.item_type := 'STOCK';
        NEW.mfg_type := NULL;
        IF NEW.inventory_account_id IS NULL AND v_fg_acc IS NOT NULL THEN
            NEW.inventory_account_id := v_fg_acc;
        END IF;
    END IF;

    RETURN NEW;
END; $$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. إعادة ربط المشغل (Trigger)
DROP TRIGGER IF EXISTS trg_ensure_product_accounts ON public.products;
CREATE TRIGGER trg_ensure_product_accounts
BEFORE INSERT OR UPDATE ON public.products
FOR EACH ROW EXECUTE FUNCTION public.fn_ensure_product_accounts();

-- 3. تصحيح صنف "عجينه سبونش فانيليا" وكافة الأصناف الوسيطة المماثلة
UPDATE public.products
SET 
    product_type = 'INTERMEDIATE_PRODUCT',
    item_type = 'STOCK',
    mfg_type = 'intermediate'
WHERE name ILIKE '%عجينه سبونش فانيليا%' 
   OR name ILIKE '%عجينة سبونش فانيليا%'
   OR sku = 'SKU-00021';

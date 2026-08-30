-- =================================================================
-- TriPro ERP - Fix Product Type Auto-Flipping to MANUFACTURED
-- التاريخ: 30 أغسطس 2026
-- المشكلة: التريجر كان يقوم تلقائياً بقلب الأصناف المخزنية STOCK إلى MANUFACTURED
-- =================================================================

-- 1. إزالة القيمة الافتراضية 'standard' من عمود mfg_type
ALTER TABLE public.products ALTER COLUMN mfg_type DROP DEFAULT;
ALTER TABLE public.products ALTER COLUMN mfg_type SET DEFAULT NULL;

-- 2. تحديث دالة التريجر لضمان احترام اختيار المستخدم الصريح
CREATE OR REPLACE FUNCTION public.fn_ensure_product_accounts()
RETURNS TRIGGER AS $$
DECLARE
    v_mappings jsonb;
    v_raw_acc uuid;
    v_fg_acc uuid;
    v_requested_type text;
BEGIN
    -- 1. تحديد نوع الصنف المطلوب صراحة من المستخدم (STOCK, RAW_MATERIAL, MANUFACTURED, SERVICE)
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
    IF v_requested_type = 'RAW_MATERIAL' OR LOWER(TRIM(COALESCE(NEW.mfg_type, ''))) IN ('raw', 'raw_material') THEN
        NEW.product_type := 'RAW_MATERIAL';
        NEW.item_type := 'STOCK';
        NEW.mfg_type := 'raw';
        IF NEW.inventory_account_id IS NULL AND v_raw_acc IS NOT NULL THEN
            NEW.inventory_account_id := v_raw_acc;
        END IF;

    ELSIF v_requested_type = 'MANUFACTURED' THEN
        NEW.product_type := 'MANUFACTURED';
        NEW.item_type := 'STOCK';
        NEW.mfg_type := 'standard';
        IF NEW.inventory_account_id IS NULL AND v_fg_acc IS NOT NULL THEN
            NEW.inventory_account_id := v_fg_acc;
        END IF;

    ELSIF v_requested_type = 'SERVICE' THEN
        NEW.product_type := 'SERVICE';
        NEW.item_type := 'SERVICE';
        NEW.mfg_type := NULL;
        NEW.inventory_account_id := NULL;
        NEW.cogs_account_id := NULL;

    ELSE
        -- 📦 الصنف التجاري المخزني العادي (STOCK) - نمنع قلبه نهائياً إلى منتج مصنع
        NEW.product_type := 'STOCK';
        NEW.item_type := 'STOCK';
        NEW.mfg_type := NULL;
        IF NEW.inventory_account_id IS NULL AND v_fg_acc IS NOT NULL THEN
            NEW.inventory_account_id := v_fg_acc;
        END IF;
    END IF;

    RETURN NEW;
END; $$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. إعادة ربط المشغل (Trigger)
DROP TRIGGER IF EXISTS trg_ensure_product_accounts ON public.products;
CREATE TRIGGER trg_ensure_product_accounts
BEFORE INSERT OR UPDATE ON public.products
FOR EACH ROW EXECUTE FUNCTION public.fn_ensure_product_accounts();

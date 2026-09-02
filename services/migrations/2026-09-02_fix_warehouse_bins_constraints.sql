-- ==============================================================================
-- TriPro ERP - Migration: Fix Warehouse Bins Constraints (Solve 409 Conflict & 23505 Duplicate Key)
-- Date: 2026-09-02
-- 1. Drops global barcode unique constraint
-- 2. Deduplicates any existing bin_codes and barcodes
-- 3. Creates organization & warehouse scoped unique indexes
-- ==============================================================================

-- 1. إزالة قيد التفرد العام على الباركود الذي يسبب خطأ 409
ALTER TABLE public.warehouse_bins DROP CONSTRAINT IF EXISTS warehouse_bins_barcode_key;

-- 2. معالجة وتعديل أي أكواد رفوف مكررة حالياً في المستودع (مثل ZONEA-A1-R1-S1-B2) لمنع خطأ 23505
WITH ranked_bins AS (
    SELECT id, bin_code,
           ROW_NUMBER() OVER (
               PARTITION BY organization_id, warehouse_id, bin_code 
               ORDER BY created_at ASC, id ASC
           ) as rn
    FROM public.warehouse_bins
)
UPDATE public.warehouse_bins b
SET bin_code = b.bin_code || '-' || rb.rn,
    barcode = 'BIN-' || b.bin_code || '-' || rb.rn
FROM ranked_bins rb
WHERE b.id = rb.id AND rb.rn > 1;

-- 3. معالجة أي باركودات فارغة أو مكررة حالياً
WITH ranked_barcodes AS (
    SELECT id, barcode,
           ROW_NUMBER() OVER (
               PARTITION BY organization_id, barcode 
               ORDER BY created_at ASC, id ASC
           ) as rn
    FROM public.warehouse_bins
    WHERE barcode IS NOT NULL AND barcode != ''
)
UPDATE public.warehouse_bins b
SET barcode = b.barcode || '-' || rb.rn
FROM ranked_barcodes rb
WHERE b.id = rb.id AND rb.rn > 1;

UPDATE public.warehouse_bins
SET barcode = 'BIN-' || SUBSTRING(id::text, 1, 8)
WHERE barcode IS NULL OR barcode = '';

-- 4. إنشاء قيد تفرد كود الرف/الموقع داخل نفس المستودع والمنشأة حصراً
DROP INDEX IF EXISTS idx_wh_bins_code;
DROP INDEX IF EXISTS uq_wh_bins_org_wh_code;
CREATE UNIQUE INDEX uq_wh_bins_org_wh_code 
ON public.warehouse_bins(organization_id, warehouse_id, bin_code);

-- 5. إنشاء قيد تفرد الباركود داخل المنشأة حصراً
DROP INDEX IF EXISTS uq_wh_bins_org_barcode;
CREATE UNIQUE INDEX uq_wh_bins_org_barcode 
ON public.warehouse_bins(organization_id, barcode) 
WHERE barcode IS NOT NULL AND barcode != '';

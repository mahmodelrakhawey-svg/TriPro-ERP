-- ===========================
-- Invoice Items SQL Queries
-- ===========================

-- 1. حساب إجمالي الفاتورة مع البنود
-- (استخدم لعرض في التقارير أو لتحديث sales_invoices تلقائياً)
SELECT
  ii.invoice_id,
  COUNT(ii.id) as item_count,
  SUM(ii.quantity) as total_quantity,
  SUM(ii.quantity * ii.unit_price) as subtotal,
  SUM(ii.discount) as total_discount,
  SUM((ii.quantity * ii.unit_price - ii.discount) * (ii.tax_rate / 100)) as total_tax,
  (SUM(ii.quantity * ii.unit_price) - SUM(ii.discount) + SUM((ii.quantity * ii.unit_price - ii.discount) * (ii.tax_rate / 100))) as grand_total
FROM invoice_items ii
GROUP BY ii.invoice_id;

-- 2. الحصول على بنود فاتورة محددة مع حساب مفاصيل السطر
-- استبدل 'INVOICE_ID_HERE' بـ invoice_id الفعلي
SELECT
  ii.id,
  ii.invoice_id,
  ii.line_no,
  ii.description,
  ii.quantity,
  ii.unit_price,
  ii.discount,
  ii.tax_rate,
  (ii.quantity * ii.unit_price) as line_amount,
  (ii.quantity * ii.unit_price - ii.discount) as line_subtotal,
  ((ii.quantity * ii.unit_price - ii.discount) * (ii.tax_rate / 100)) as line_tax,
  (ii.quantity * ii.unit_price - ii.discount + ((ii.quantity * ii.unit_price - ii.discount) * (ii.tax_rate / 100))) as line_total,
  ii.created_at,
  ii.updated_at
FROM invoice_items ii
WHERE ii.invoice_id = 'INVOICE_ID_HERE'
ORDER BY ii.line_no ASC;

-- 3. ربط بنود الفاتورة مع معلومات الفاتورة الأم
-- (مفيد للتقارير المفصلة)
SELECT
  si.id as invoice_id,
  si.invoice_number,
  si.customer_id,
  si.invoice_date,
  si.total_amount as invoice_recorded_total,
  COUNT(ii.id) as item_count,
  SUM(ii.quantity * ii.unit_price) as calculated_subtotal,
  SUM(ii.discount) as calculated_discount,
  SUM((ii.quantity * ii.unit_price - ii.discount) * (ii.tax_rate / 100)) as calculated_tax,
  (SUM(ii.quantity * ii.unit_price) - SUM(ii.discount) + SUM((ii.quantity * ii.unit_price - ii.discount) * (ii.tax_rate / 100))) as calculated_total
FROM invoices si
LEFT JOIN invoice_items ii ON si.id = ii.invoice_id
GROUP BY si.id, si.invoice_number, si.customer_id, si.invoice_date, si.total_amount;

-- 4. فحص الفواتير التي قد يكون فيها عدم توافق بين المبلغ المسجل والمحسوب
-- (للتحقق من سلامة البيانات)
SELECT
  si.id,
  si.invoice_number,
  si.total_amount as recorded_total,
  (SUM(ii.quantity * ii.unit_price) - SUM(ii.discount) + SUM((ii.quantity * ii.unit_price - ii.discount) * (ii.tax_rate / 100))) as calculated_total,
  (si.total_amount - (SUM(ii.quantity * ii.unit_price) - SUM(ii.discount) + SUM((ii.quantity * ii.unit_price - ii.discount) * (ii.tax_rate / 100)))) as variance
FROM invoices si
LEFT JOIN invoice_items ii ON si.id = ii.invoice_id
GROUP BY si.id, si.invoice_number, si.total_amount
HAVING si.total_amount != (SUM(ii.quantity * ii.unit_price) - SUM(ii.discount) + SUM((ii.quantity * ii.unit_price - ii.discount) * (ii.tax_rate / 100)))
ORDER BY variance DESC;

-- 5. إحصائيات عامة عن البنود
-- (للتقارير الإدارية)
SELECT
  'إجمالي البنود' as metric, COUNT(*) as value
FROM invoice_items
UNION ALL
SELECT
  'إجمالي الفواتير ذات بنود', COUNT(DISTINCT invoice_id)
FROM invoice_items
UNION ALL
SELECT
  'متوسط البنود لكل فاتورة', ROUND(AVG(item_count)::numeric, 2)
FROM (
  SELECT COUNT(*) as item_count FROM invoice_items GROUP BY invoice_id
) subq
UNION ALL
SELECT
  'أعلى مبلغ فاتورة محسوب', ROUND(MAX(grand_total)::numeric, 2)
FROM (
  SELECT
    SUM(ii.quantity * ii.unit_price) - SUM(ii.discount) + SUM((ii.quantity * ii.unit_price - ii.discount) * (ii.tax_rate / 100)) as grand_total
  FROM invoice_items ii
  GROUP BY ii.invoice_id
) subq
UNION ALL
SELECT
  'أقل مبلغ فاتورة محسوب', ROUND(MIN(grand_total)::numeric, 2)
FROM (
  SELECT
    SUM(ii.quantity * ii.unit_price) - SUM(ii.discount) + SUM((ii.quantity * ii.unit_price - ii.discount) * (ii.tax_rate / 100)) as grand_total
  FROM invoice_items ii
  GROUP BY ii.invoice_id
) subq;

-- 6. تقرير تفصيلي: معلومات المنتجات في البنود (إذا كان هناك تكامل مع جدول products)
-- ملاحظة: قد تحتاج لتعديل هذا الاستعلام حسب هيكل جدول products لديك
SELECT
  ii.id,
  ii.description,
  ii.quantity,
  ii.unit_price,
  ii.discount,
  ii.tax_rate,
  (ii.quantity * ii.unit_price) as line_amount,
  (ii.quantity * ii.unit_price - ii.discount) as line_subtotal,
  ((ii.quantity * ii.unit_price - ii.discount) * (ii.tax_rate / 100)) as line_tax,
  ii.created_at,
  ii.created_by
FROM invoice_items ii
ORDER BY ii.created_at DESC
LIMIT 100; -- آخر 100 بند

-- 7. تحديث الفواتير الأم بناءً على المجاميع المحسوبة من البنود
-- (استخدم بحذر - تأكد من عمل نسخة احتياطية قبل التشغيل)
-- UPDATE invoices si
-- SET
--   total_amount = subq.grand_total,
--   subtotal = subq.subtotal,
--   tax_amount = subq.total_tax,
--   discount_amount = subq.total_discount
-- FROM (
--   SELECT
--     ii.invoice_id,
--     SUM(ii.quantity * ii.unit_price) as subtotal,
--     SUM(ii.discount) as total_discount,
--     SUM((ii.quantity * ii.unit_price - ii.discount) * (ii.tax_rate / 100)) as total_tax,
--     (SUM(ii.quantity * ii.unit_price) - SUM(ii.discount) + SUM((ii.quantity * ii.unit_price - ii.discount) * (ii.tax_rate / 100))) as grand_total
--   FROM invoice_items ii
--   GROUP BY ii.invoice_id
-- ) subq
-- WHERE si.id = subq.invoice_id;

-- 8. استعلام لإيجاد البنود المُضافة حديثاً (آخر 24 ساعة)
SELECT
  ii.id,
  ii.invoice_id,
  ii.description,
  ii.quantity,
  ii.unit_price,
  ii.created_at,
  ii.created_by
FROM invoice_items ii
WHERE ii.created_at >= NOW() - INTERVAL '24 hours'
ORDER BY ii.created_at DESC;

-- 9. تقرير: مجموع الفواتير حسب العملة (إذا كانت الفواتير تحتوي على عمود currency)
-- ملاحظة: عدّل حسب رغبتك
SELECT
  si.currency,
  COUNT(DISTINCT si.id) as invoice_count,
  SUM(
    COALESCE(
      (SUM(ii.quantity * ii.unit_price) - SUM(ii.discount) + SUM((ii.quantity * ii.unit_price - ii.discount) * (ii.tax_rate / 100))),
      0
    )
  ) as total_amount
FROM invoices si
LEFT JOIN invoice_items ii ON si.id = ii.invoice_id
GROUP BY si.currency;

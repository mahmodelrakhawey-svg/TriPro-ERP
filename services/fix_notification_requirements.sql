--- /dev/null
-- c:/Users/pc/Desktop/TriPro-ERP/services/fix_notification_requirements.sql
--@@ -0,0 +1,38 @@
-- 1. إضافة الأعمدة الناقصة في جدول المنتجات والفواتير
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS min_stock numeric DEFAULT 5;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS reference text;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS approver_id uuid REFERENCES auth.users(id);

-- تحديث المرجع للفواتير القديمة
UPDATE public.invoices SET reference = invoice_number WHERE reference IS NULL;

-- 2. إنشاء دالة لجلب العملاء الذين تجاوزوا حد الائتمان
-- هذا يحل مشكلة الخطأ 400 (Bad Request)
CREATE OR REPLACE FUNCTION get_over_limit_customers()
RETURNS TABLE (
  id uuid,
  name text,
  phone text,
  credit_limit numeric,
  total_debt numeric
) LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  RETURN QUERY
  WITH customer_debt AS (
    SELECT 
      c.id,
      c.name,
      c.phone,
      c.credit_limit,
      -- حساب الدين: إجمالي الفواتير المرحلة وغير المدفوعة - المدفوعات
      COALESCE(SUM(i.total_amount - COALESCE(i.paid_amount, 0)), 0) as current_debt
    FROM customers c
    LEFT JOIN invoices i ON c.id = i.customer_id AND i.status NOT IN ('draft', 'paid', 'cancelled')
    WHERE c.deleted_at IS NULL
    GROUP BY c.id
  )
  SELECT 
    cd.id, cd.name, cd.phone, cd.credit_limit, cd.current_debt
  FROM customer_debt cd
  WHERE cd.credit_limit > 0 AND cd.current_debt > cd.credit_limit;
END;
$$;

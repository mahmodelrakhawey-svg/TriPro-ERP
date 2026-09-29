-- ==============================================================================
-- تاريخ التحديث: 2026-09-29
-- الميزة / التعديل: دالة رقابية لكشف القيود المحاسبية غير المتوازنة (مدين != دائن)
-- البيئة: بيئة تطوير معزولة
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.get_unbalanced_journal_entries(
  p_org_id uuid DEFAULT NULL,
  p_status text DEFAULT NULL
)
RETURNS TABLE (
  entry_id uuid,
  reference text,
  description text,
  transaction_date date,
  status text,
  total_debit numeric,
  total_credit numeric,
  difference numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    je.id AS entry_id,
    je.reference,
    je.description,
    je.transaction_date,
    je.status,
    COALESCE(SUM(jl.debit), 0)::numeric(19,4) AS total_debit,
    COALESCE(SUM(jl.credit), 0)::numeric(19,4) AS total_credit,
    (COALESCE(SUM(jl.debit), 0) - COALESCE(SUM(jl.credit), 0))::numeric(19,4) AS difference
  FROM journal_entries je
  JOIN journal_lines jl ON jl.journal_entry_id = je.id
  WHERE (p_org_id IS NULL OR je.organization_id = p_org_id)
    AND (p_status IS NULL OR je.status = p_status)
  GROUP BY je.id, je.reference, je.description, je.transaction_date, je.status
  HAVING ABS(COALESCE(SUM(jl.debit), 0) - COALESCE(SUM(jl.credit), 0)) > 0.005
  ORDER BY ABS(COALESCE(SUM(jl.debit), 0) - COALESCE(SUM(jl.credit), 0)) DESC;
END;
$$;

-- منح الصلاحيات للأدوار المصرح لها
GRANT EXECUTE ON FUNCTION public.get_unbalanced_journal_entries(uuid, text) TO authenticated, anon;

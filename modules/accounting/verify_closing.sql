-- كاشف صحة الإقفال السنوي

-- 1. فحص هل تم تصفير المصروفات والإيرادات لعام 2025؟ (يجب أن تكون النتيجة 0 أو قريبة جداً من الصفر)
SELECT 
    'صافي دخل 2025 (يجب أن يكون 0)' as check_type,
    SUM(jl.debit - jl.credit) as balance
FROM journal_lines jl
JOIN journal_entries je ON jl.journal_entry_id = je.id
JOIN accounts a ON jl.account_id = a.id
WHERE je.transaction_date BETWEEN '2025-01-01' AND '2025-12-31'
AND je.status = 'posted'
AND (a.type IN ('REVENUE', 'EXPENSE') OR a.code LIKE '4%' OR a.code LIKE '5%');

-- 2. فحص رصيد الأرباح المبقاة (يجب أن يحتوي على قيمة الربح/الخسارة)
SELECT 
    'رصيد الأرباح المبقاة' as check_type,
    SUM(jl.credit - jl.debit) as balance
FROM journal_lines jl
JOIN journal_entries je ON jl.journal_entry_id = je.id
JOIN accounts a ON jl.account_id = a.id
WHERE a.code = '3103' -- كود الأرباح المبقاة
AND je.status = 'posted';

-- 3. التأكد من وجود القيد نفسه
SELECT 'بيانات قيد الإقفال' as check_type, 1 as balance, reference, transaction_date, status FROM journal_entries WHERE reference = 'CLOSE-2025';
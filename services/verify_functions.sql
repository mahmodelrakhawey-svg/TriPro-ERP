-- 🕵️ سكربت التحقق من وجود دوال النظام (Verify System Functions)
-- قم بتشغيل هذا السكربت في Supabase SQL Editor للتأكد من أن جميع الدوال قد تم إنشاؤها بنجاح.

SELECT 
    routine_name,
    data_type AS return_type,
    created
FROM information_schema.routines 
WHERE routine_type = 'FUNCTION' 
AND specific_schema = 'public'
AND routine_name IN (
    'approve_invoice',
    'approve_purchase_invoice',
    'approve_receipt_voucher',
    'approve_payment_voucher',
    'approve_sales_return',
    'approve_purchase_return',
    'approve_credit_note',
    'approve_debit_note',
    'recalculate_stock_rpc',
    'run_period_depreciation',
    'fix_returns_schema',
    'create_journal_entry',
    'calculate_sales_commission',
    'clear_demo_data'
)
ORDER BY routine_name;
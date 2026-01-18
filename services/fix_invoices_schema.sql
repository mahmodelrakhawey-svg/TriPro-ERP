-- 🛠️ إصلاح هيكل جدول الفواتير (إضافة الأعمدة الناقصة)
-- هذا السكربت يضيف أعمدة paid_amount و due_date إذا كانت غير موجودة
-- لحل مشكلة 400 Bad Request عند جلب رصيد العميل

DO $$
BEGIN
    -- 1. التحقق من عمود paid_amount (المبلغ المدفوع)
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'invoices' AND column_name = 'paid_amount') THEN
        ALTER TABLE public.invoices ADD COLUMN paid_amount numeric DEFAULT 0;
    END IF;

    -- 2. التحقق من عمود due_date (تاريخ الاستحقاق)
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'invoices' AND column_name = 'due_date') THEN
        ALTER TABLE public.invoices ADD COLUMN due_date date;
    END IF;

    -- 3. التحقق من عمود discount_amount (قيمة الخصم)
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'invoices' AND column_name = 'discount_amount') THEN
        ALTER TABLE public.invoices ADD COLUMN discount_amount numeric DEFAULT 0;
    END IF;
    
    -- 4. التحقق من عمود treasury_account_id (حساب الخزينة/البنك)
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'invoices' AND column_name = 'treasury_account_id') THEN
        ALTER TABLE public.invoices ADD COLUMN treasury_account_id uuid REFERENCES public.accounts(id);
    END IF;

    -- 5. تحديث البيانات القديمة (اختياري): إذا كانت الفاتورة مدفوعة، اجعل المدفوع = الإجمالي
    UPDATE public.invoices 
    SET paid_amount = total_amount 
    WHERE status = 'paid' AND (paid_amount IS NULL OR paid_amount = 0);
    
    RAISE NOTICE 'تم فحص وإصلاح هيكل جدول الفواتير بنجاح';
END $$;
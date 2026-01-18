-- 🛠️ ربط المرتجعات القديمة بالفواتير الأصلية بناءً على الملاحظات
-- يقوم هذا السكربت بالبحث عن رقم الفاتورة (مثل INV-123456) داخل حقل الملاحظات
-- وتحديث عمود original_invoice_id إذا تم العثور على الفاتورة

DO $$
DECLARE
    r RECORD;
    inv_id uuid;
    extracted_inv_num text;
    updated_count integer := 0;
BEGIN
    -- الدوران على جميع المرتجعات التي ليس لها فاتورة أصلية ولديها ملاحظات
    FOR r IN SELECT id, notes FROM sales_returns WHERE original_invoice_id IS NULL AND notes IS NOT NULL LOOP
        
        -- محاولة استخراج رقم الفاتورة باستخدام التعبير النمطي (Regex)
        -- يبحث عن نمط يبدأ بـ INV- يليه أرقام أو حروف
        extracted_inv_num := substring(r.notes from 'INV-[A-Za-z0-9]+');
        
        IF extracted_inv_num IS NOT NULL THEN
            -- البحث عن الفاتورة بهذا الرقم
            SELECT id INTO inv_id FROM invoices WHERE invoice_number = extracted_inv_num LIMIT 1;
            
            IF inv_id IS NOT NULL THEN
                -- تحديث المرتجع
                UPDATE sales_returns 
                SET original_invoice_id = inv_id 
                WHERE id = r.id;
                
                updated_count := updated_count + 1;
            END IF;
        END IF;
        
        -- إعادة تعيين المتغيرات للدورة التالية
        inv_id := NULL;
        extracted_inv_num := NULL;
    END LOOP;
    
    RAISE NOTICE 'تم تحديث % سجل بنجاح.', updated_count;
END $$;
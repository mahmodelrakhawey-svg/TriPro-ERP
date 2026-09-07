-- =================================================================
-- TriPro ERP - QR Menu Online Payment Integration
-- التاريخ: 04 يوليو 2026
-- الوصف: تحديث دالة طلبات الـ QR لدعم الدفع المباشر (Online Payment) 
-- وتأكيد الطلب مالياً ومخزنياً تلقائياً عند السداد الإلكتروني.
-- =================================================================

-- 1. إسقاط الدالة القديمة لتجنب تعارض البارامترات
DROP FUNCTION IF EXISTS public.create_public_order(uuid, jsonb, uuid);

-- 2. إعادة إنشاء الدالة بدعم خيارات الدفع
CREATE OR REPLACE FUNCTION public.create_public_order(
    p_qr_key uuid, 
    p_items jsonb, 
    p_org_id uuid DEFAULT NULL,
    p_is_paid boolean DEFAULT false,
    p_payment_method text DEFAULT 'CARD'
) 
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_table record; 
    v_session_id uuid; 
    v_order_id uuid;
    v_bank_acc_id uuid; 
    v_mappings jsonb;
BEGIN
    -- التحقق من صحة رمز QR للطاولة
    SELECT * INTO v_table FROM public.restaurant_tables WHERE qr_access_key = p_qr_key;
    IF NOT FOUND THEN RAISE EXCEPTION 'رمز طاولة غير صالح.'; END IF;

    -- إيجاد الجلسة النشطة أو فتح جلسة جديدة للطاولة
    SELECT id INTO v_session_id FROM public.table_sessions 
    WHERE table_id = v_table.id AND status = 'OPEN' AND organization_id = v_table.organization_id LIMIT 1;

    IF v_session_id IS NULL THEN
        INSERT INTO public.table_sessions (table_id, organization_id, status)
        VALUES (v_table.id, v_table.organization_id, 'OPEN') RETURNING id INTO v_session_id;
    END IF;

    -- إنشاء الطلب الأساسي في نظام المطاعم (يكون بحالة PENDING افتراضياً)
    v_order_id := public.create_restaurant_order(
        v_session_id, NULL, 'DINE_IN', 'طلب عبر QR', p_items, NULL, NULL, NULL, COALESCE(p_org_id, v_table.organization_id)
    );

    -- تعديل حالة الطاولة لتصبح مشغولة
    UPDATE public.restaurant_tables SET status = 'OCCUPIED', session_start = now() WHERE id = v_table.id;

    -- 💳 إذا دفع العميل أونلاين بنجاح، نقوم باعتماد الطلب مالياً ومخزنياً فوراً
    IF p_is_paid THEN
        -- جلب إعدادات الحسابات لتحديد حساب البنك لشركة المطعم
        SELECT account_mappings INTO v_mappings FROM public.company_settings WHERE organization_id = v_table.organization_id;
        
        -- حل حساب البنك الافتراضي (10102) أو الموجه في الإعدادات
        v_bank_acc_id := public.resolve_leaf_account(COALESCE(
            (v_mappings->>'BANK')::uuid,
            (SELECT id FROM public.accounts WHERE organization_id = v_table.organization_id AND code = '10102' LIMIT 1)
        ));
        
        -- إتمام الطلب ماليًا ومخزنيًا (تسجيل الدفع في جدول Payments، تغيير حالة الطلب لـ PAID، خصم المخزن، ترحيل قيد اليومية)
        PERFORM public.complete_restaurant_order(
            v_order_id, 
            p_payment_method, 
            (SELECT grand_total FROM public.orders WHERE id = v_order_id), 
            v_bank_acc_id, 
            v_table.organization_id
        );
    END IF;

    RETURN v_order_id;
END; $$;

-- 3. منح الصلاحيات للمستخدمين الضيوف (الموقع العام لرمز QR) والمصادق عليهم
GRANT EXECUTE ON FUNCTION public.create_public_order(uuid, jsonb, uuid, boolean, text) TO anon, authenticated;

-- رسالة تأكيد
SELECT '✅ تم ترقية دالة create_public_order لدعم الدفع الإلكتروني بنجاح.' as status;

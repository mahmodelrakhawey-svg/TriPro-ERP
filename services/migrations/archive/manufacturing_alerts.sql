-- 🔔 نظام التنبيهات الذكية لانحرافات التصنيع

CREATE OR REPLACE FUNCTION public.mfg_check_variance_alerts(p_threshold numeric DEFAULT 10)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER 
SET search_path = public AS $$
DECLARE
    v_row record;
    v_alert_count integer := 0;
    v_admin_id uuid;
    v_org_id uuid;
BEGIN
    v_org_id := public.get_my_org();
    
    -- جلب المسئولين في المنظمة
    FOR v_admin_id IN SELECT id FROM public.profiles WHERE organization_id = v_org_id AND role IN ('admin', 'manager') LOOP
        
        -- البحث عن انحرافات تتجاوز العتبة المحددة (10%)
        FOR v_row IN 
            SELECT * FROM public.v_mfg_bom_variance 
            WHERE ABS(variance_percentage) > p_threshold AND organization_id = v_org_id
        LOOP
            INSERT INTO public.notifications (
                user_id, 
                title, 
                message, 
                type,
                priority, 
                organization_id
            ) VALUES (
                v_admin_id,
                'تنبيه: انحراف مواد خطير',
                format('المادة (%s) في الطلب (%s) سجلت انحرافاً بنسبة %s%%', 
                       v_row.material_name, v_row.order_number, v_row.variance_percentage),
                'high_debt', -- نستخدم نوع متاح في نظام الإخطارات للأولوية
                'high',
                v_org_id
            );
            v_alert_count := v_alert_count + 1;
        END LOOP;
    END LOOP;
    
    RETURN v_alert_count;
END; $$;

-- 🔔 دالة تنبيهات تجاوز تكلفة الإنتاج المعيارية
-- تتحقق من أوامر الإنتاج المكتملة وتقارن التكلفة الفعلية بالمعيارية
CREATE OR REPLACE FUNCTION public.mfg_check_cost_overrun_alerts(p_threshold_percentage numeric DEFAULT 5)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER 
SET search_path = public AS $$
DECLARE
    v_row record;
    v_alert_count integer := 0;
    v_admin_id uuid;
    v_org_id uuid;
    v_standard_cost_per_unit numeric;
    v_expected_total_standard_cost numeric;
    v_cost_overrun_percentage numeric;
BEGIN
    v_org_id := public.get_my_org();

    -- جلب المسئولين في المنظمة
    FOR v_admin_id IN SELECT id FROM public.profiles WHERE organization_id = v_org_id AND role IN ('admin', 'manager') LOOP

        -- البحث عن أوامر إنتاج مكتملة تجاوزت تكلفتها الفعلية التكلفة المعيارية بحد معين
        FOR v_row IN 
            SELECT 
                vpop.order_id,
                vpop.order_number,
                vpop.product_name,
                vpop.qty,
                vpop.total_actual_cost,
                po.product_id -- نحتاج معرف المنتج لحساب التكلفة المعيارية
            FROM public.v_mfg_order_profitability vpop
            JOIN public.mfg_production_orders po ON vpop.order_id = po.id
            WHERE vpop.organization_id = v_org_id
              AND po.status = 'completed' -- فقط الأوامر المكتملة
        LOOP
            -- حساب التكلفة المعيارية للمنتج الواحد باستخدام الدالة الموجودة
            v_standard_cost_per_unit := public.mfg_calculate_standard_cost(v_row.product_id);
            v_expected_total_standard_cost := v_standard_cost_per_unit * v_row.qty;

            IF v_expected_total_standard_cost > 0 THEN
                v_cost_overrun_percentage := ROUND(((v_row.total_actual_cost - v_expected_total_standard_cost) / v_expected_total_standard_cost) * 100, 2);
            ELSE
                v_cost_overrun_percentage := 0; -- تجنب القسمة على صفر إذا كانت التكلفة المعيارية صفر
            END IF;

            IF v_cost_overrun_percentage > p_threshold_percentage THEN
                INSERT INTO public.notifications (user_id, title, message, type, priority, organization_id) 
                VALUES (v_admin_id, 'تنبيه: تجاوز تكلفة الإنتاج المعيارية', 
                        format('أمر الإنتاج (%s) للمنتج (%s) تجاوز التكلفة المعيارية بنسبة %s%%. التكلفة الفعلية: %s، المعيارية: %s',
                               v_row.order_number, v_row.product_name, v_cost_overrun_percentage, v_row.total_actual_cost, v_expected_total_standard_cost),
                        'cost_overrun', 'high', v_org_id);
                v_alert_count := v_alert_count + 1;
            END IF;
        END LOOP;
    END LOOP;
    
    RETURN v_alert_count;
END; $$;

-- 🔔 تنبيه نقص الأرقام التسلسلية عند الإغلاق
-- يتحقق من أوامر الإنتاج المكتملة التي تتطلب سيريالات ولم يتم توليد الكمية كاملة لها
CREATE OR REPLACE FUNCTION public.mfg_check_missing_serials_alerts()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER 
SET search_path = public AS $$
DECLARE
    v_row record;
    v_alert_count integer := 0;
    v_admin_id uuid;
    v_org_id uuid;
BEGIN
    v_org_id := public.get_my_org();
    
    FOR v_admin_id IN SELECT id FROM public.profiles WHERE organization_id = v_org_id AND role IN ('admin', 'manager') LOOP
        FOR v_row IN 
            SELECT order_number, product_name, quantity_to_produce, total_serials_generated
            FROM public.v_mfg_dashboard
            WHERE organization_id = v_org_id 
              AND status = 'completed' 
              AND requires_serial = true
              AND total_serials_generated < quantity_to_produce
        LOOP
            INSERT INTO public.notifications (user_id, title, message, type, priority, organization_id)
            VALUES (v_admin_id, 'تنبيه: نقص أرقام تسلسلية', 
                    format('أمر الإنتاج (%s) للمنتج (%s) اكتمل بـ %s سيريال فقط من أصل %s مطلوب.',
                           v_row.order_number, v_row.product_name, v_row.total_serials_generated, v_row.quantity_to_produce),
                    'missing_serials', 'medium', v_org_id);
            v_alert_count := v_alert_count + 1;
        END LOOP;
    END LOOP;
    
    RETURN v_alert_count;
END; $$;
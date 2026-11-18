-- ==============================================================================
-- 🔄 دالة السيرفر الفورية لعكس كشف الجرد واستعادة الأصناف دفعة واحدة
-- Function: reverse_inventory_count(p_count_id uuid)
-- Target: Lenza Database (jsgmrspnthtlsracbmcq) & General Database (pjvphxfschfllpawfewn)
-- ==============================================================================

-- 1. تسريع الاستعلامات بفهارس مخصصة
CREATE INDEX IF NOT EXISTS idx_inventory_count_items_count_diff 
ON public.inventory_count_items (inventory_count_id, difference);

CREATE INDEX IF NOT EXISTS idx_stock_adjustment_items_adj_id 
ON public.stock_adjustment_items (stock_adjustment_id);

-- 2. دالة العكس الذرية فائقة السرعة والأمان
CREATE OR REPLACE FUNCTION public.reverse_inventory_count(p_count_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_count record;
    v_item record;
    v_adj_id uuid;
    v_adj_no text;
    v_total_val numeric := 0;
    v_inv_acc uuid;
    v_adj_acc uuid;
    v_je_id uuid;
    v_mappings jsonb;
    v_diff_count integer := 0;
    v_rev_val numeric := 0;
BEGIN
    -- أ. التحقق من وجود كشف الجرد
    SELECT * INTO v_count FROM public.inventory_counts WHERE id = p_count_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'كشف الجرد رقم % غير موجود', p_count_id;
    END IF;

    -- ب. منع التكرار إذا كان الجرد معكوساً بالفعل
    IF v_count.notes LIKE '%[تم عكس أثر الجرد]%' OR v_count.notes LIKE '%[تمت استعادة الأصناف وعكس أثره%' THEN
        RAISE EXCEPTION 'تم عكس هذا الجرد مسبقاً ولا يمكن تكرار العملية لتجنب مضاعفة الأرصدة.';
    END IF;

    -- ج. حصر البنود التي بها فروقات
    SELECT COUNT(*) INTO v_diff_count 
    FROM public.inventory_count_items 
    WHERE inventory_count_id = p_count_id AND difference <> 0;

    IF v_diff_count = 0 THEN
        RAISE EXCEPTION 'لا توجد فروقات مسجلة في هذا الجرد لعكسها (كافة الأصناف مطابقة للرصيد الدفتري).';
    END IF;

    -- د. توليد رقم تسوية عكسية فريد
    v_adj_no := 'ADJ-REV-' || REPLACE(v_count.count_number, 'CNT-', '') || '-' || TO_CHAR(NOW(), 'HH24MISS');

    -- هـ. إنشاء رأس التسوية المخزنية العكسية
    INSERT INTO public.stock_adjustments (
        organization_id, warehouse_id, adjustment_date, adjustment_number, reason, status
    ) VALUES (
        v_count.organization_id,
        v_count.warehouse_id,
        CURRENT_DATE,
        v_adj_no,
        'تسوية عكسية شاملة لتصحيح واستعادة أصناف كشف الجرد رقم: ' || v_count.count_number || ' (' || v_diff_count || ' صنف)',
        'posted'
    ) RETURNING id INTO v_adj_id;

    -- و. إدراج بنود التسوية المعكوسة
    -- إذا كان الفرق سالباً (عجز/تصفير): تصبح كمية واردة 'in' لاسترجاع الرصيد
    -- إذا كان الفرق موجباً (زيادة): تصبح كمية منصرفة 'out' لتخفيض الزيادة
    FOR v_item IN 
        SELECT ici.product_id, ici.difference,
               COALESCE(NULLIF(p.weighted_average_cost, 0), NULLIF(p.cost, 0), p.purchase_price, 0) as item_cost
        FROM public.inventory_count_items ici
        LEFT JOIN public.products p ON ici.product_id = p.id
        WHERE ici.inventory_count_id = p_count_id AND ici.difference <> 0
    LOOP
        INSERT INTO public.stock_adjustment_items (
            organization_id, stock_adjustment_id, product_id, quantity, type
        ) VALUES (
            v_count.organization_id,
            v_adj_id,
            v_item.product_id,
            -v_item.difference,
            CASE WHEN v_item.difference < 0 THEN 'in' ELSE 'out' END
        );

        v_total_val := v_total_val + (v_item.difference * COALESCE(v_item.item_cost, 0));
    END LOOP;

    -- ز. إنشاء القيد المحاسبي العكسي للفروقات
    v_rev_val := -v_total_val;
    IF ABS(v_rev_val) > 0.01 THEN
        SELECT account_mappings INTO v_mappings FROM public.company_settings WHERE organization_id = v_count.organization_id;
        v_inv_acc := COALESCE(
            (v_mappings->>'INVENTORY_FINISHED_GOODS')::uuid,
            (SELECT id FROM public.accounts WHERE code = '10302' AND organization_id = v_count.organization_id LIMIT 1)
        );
        v_adj_acc := COALESCE(
            (v_mappings->>'INVENTORY_ADJUSTMENTS')::uuid,
            (SELECT id FROM public.accounts WHERE code = '512' AND organization_id = v_count.organization_id LIMIT 1)
        );

        IF v_inv_acc IS NOT NULL AND v_adj_acc IS NOT NULL THEN
            INSERT INTO public.journal_entries (
                transaction_date, description, reference, status, organization_id, is_posted, related_document_id, related_document_type
            ) VALUES (
                CURRENT_DATE,
                'قيد تسوية عكسية لإلغاء أثر كشف جرد رقم ' || v_count.count_number,
                v_adj_no,
                'posted',
                v_count.organization_id,
                true,
                v_adj_id,
                'stock_adjustment'
            ) RETURNING id INTO v_je_id;

            IF v_rev_val > 0 THEN
                INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, organization_id)
                VALUES 
                    (v_je_id, v_inv_acc, v_rev_val, 0, v_count.organization_id),
                    (v_je_id, v_adj_acc, 0, v_rev_val, v_count.organization_id);
            ELSE
                INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, organization_id)
                VALUES 
                    (v_je_id, v_adj_acc, ABS(v_rev_val), 0, v_count.organization_id),
                    (v_je_id, v_inv_acc, 0, ABS(v_rev_val), v_count.organization_id);
            END IF;
        END IF;
    END IF;

    -- ح. وسم ملاحظات كشف الجرد
    UPDATE public.inventory_counts 
    SET notes = TRIM(COALESCE(notes, '') || ' [تمت استعادة الأصناف وعكس أثره بتسوية عكسية رقم ' || v_adj_no || ']')
    WHERE id = p_count_id;

    -- ط. إعادة احتساب المخزون الشامل
    BEGIN
        PERFORM public.recalculate_stock_rpc(v_count.organization_id);
    EXCEPTION WHEN OTHERS THEN
        -- عدم إفشال المعاملة في حال حدوث خطأ بإعادة الاحتساب الشامل، حيث أن حركات المخزن أدرجت بالفعل
        NULL;
    END;

    RETURN jsonb_build_object(
        'success', true,
        'adjustment_number', v_adj_no,
        'items_count', v_diff_count,
        'reversed_value', v_rev_val
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.reverse_inventory_count(uuid) TO authenticated;

-- 🏥 hims_complete_surgery_and_consume
-- محرك إنهاء العمليات الجراحية والربط المحاسبي والمخزني الموحد

CREATE OR REPLACE FUNCTION public.hims_complete_surgery_and_consume(
    p_surgery_id UUID,
    p_warehouse_id UUID,
    p_consumables JSONB -- مصفوفة من {product_id, qty}
)
RETURNS VOID AS $$
DECLARE
    v_org_id UUID;
    v_journal_id UUID;
    v_total_cost DECIMAL(18,2) := 0;
    v_item JSONB;
    v_prd_id UUID;
    v_qty DECIMAL;
    v_cost_price DECIMAL;
    v_inv_account_id UUID;
    v_exp_account_id UUID;
    v_surgery_name TEXT;
BEGIN
    -- 🛡️ 1. التحقق من عزل البيانات (Multi-tenancy Security)
    SELECT organization_id, surgery_name INTO v_org_id, v_surgery_name 
    FROM hims_surgeries WHERE id = p_surgery_id;
    
    IF v_org_id IS NULL THEN
        RAISE EXCEPTION 'Surgery record not found or access denied for this organization';
    END IF;

    -- 🎯 2. جلب الحسابات باستخدام محرك التوجيه الذكي (Resolve Leaf Account)
    -- الحسابات يتم جلبها من إعدادات الـ HIMS للمنظمة لضمان المرونة
    v_inv_account_id := public.resolve_leaf_account((SELECT account_id FROM hims_settings WHERE organization_id = v_org_id AND setting_key = 'medical_supplies_inventory_acc'));
    v_exp_account_id := public.resolve_leaf_account((SELECT account_id FROM hims_settings WHERE organization_id = v_org_id AND setting_key = 'surgery_expense_acc'));

    IF v_inv_account_id IS NULL OR v_exp_account_id IS NULL THEN
        RAISE EXCEPTION 'Accounting Configuration Missing: Please set Inventory and Expense accounts in HIMS settings';
    END IF;

    -- 📓 3. إنشاء رأس القيد المحاسبي للعملية (Journal Entry Header)
    INSERT INTO journal_entries (organization_id, transaction_date, description, reference, status)
    VALUES (v_org_id, CURRENT_DATE, 'صرف مستلزمات طبية - عملية: ' || v_surgery_name, p_surgery_id::TEXT, 'posted')
    RETURNING id INTO v_journal_id;

    -- 📦 4. معالجة استهلاك المخزن وحساب التكاليف
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_consumables)
    LOOP
        v_prd_id := (v_item->>'product_id')::UUID;
        v_qty := (v_item->>'qty')::DECIMAL;

        -- جلب تكلفة الصنف (من جدول المنتجات الخاص بالمنظمة)
        SELECT COALESCE(purchase_price, 0) INTO v_cost_price 
        FROM products WHERE id = v_prd_id AND organization_id = v_org_id;

        -- الرقابة المحاسبية: التحقق من توافر المخزون
        IF (SELECT stock FROM products WHERE id = v_prd_id) < v_qty THEN
            RAISE EXCEPTION 'Insufficient stock for product ID: %', v_prd_id;
        END IF;

        -- أ. تسجيل حركة مخزنية (إذن صرف)
        INSERT INTO inventory_transactions (
            organization_id, product_id, warehouse_id, transaction_type, 
            quantity, reference_id, description
        ) VALUES (
            v_org_id, v_prd_id, p_warehouse_id, 'out', 
            v_qty, p_surgery_id, 'استهلاك جراحي: ' || v_surgery_name
        );

        -- ب. تحديث الرصيد اللحظي في موديول المخازن
        UPDATE products SET stock = stock - v_qty WHERE id = v_prd_id;

        v_total_cost := v_total_cost + (v_qty * v_cost_price);
    END LOOP;

    -- ⚖️ 5. تسجيل أطراف القيد المزدوج لضمان التوازن المالي
    -- الطرف المدين: مصروفات العمليات
    INSERT INTO journal_lines (journal_id, account_id, debit, credit, description)
    VALUES (v_journal_id, v_exp_account_id, v_total_cost, 0, 'تكلفة مستلزمات جراحة: ' || v_surgery_name);

    -- الطرف الدائن: مخزون المستلزمات الطبية
    INSERT INTO journal_lines (journal_id, account_id, debit, credit, description)
    VALUES (v_journal_id, v_inv_account_id, 0, v_total_cost, 'تخفيض المخزن مقابل استهلاك جراحي');

    -- ✅ 6. تحديث حالة العملية لضمان عدم تكرار الصرف المالي
    UPDATE hims_surgeries SET status = 'completed', completed_at = NOW() WHERE id = p_surgery_id;

END;
$$ LANGUAGE plpgsql;
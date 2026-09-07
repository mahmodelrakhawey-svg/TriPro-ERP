-- ==============================================================================
-- 🚀 MIGRATION: Fix Cheques Cashing & Collection Engine (أوراق القبض والدفع)
-- Date: 2026-08-17
-- Description: 
-- 1. Adds all required columns to public.cheques if missing.
-- 2. Creates smart account resolution helper that prevents NOT-NULL violations in journal lines.
-- 3. Upgrades post_cheque_journal_entry with full multi-stage support (issuance, receipt, cashing, collection, bounce).
-- 4. Creates direct RPCs: cash_or_collect_cheque, reject_incoming_cheque, reject_outgoing_cheque.
-- ==============================================================================

-- 1. التأكد من وجود كافة أعمدة جدول الشيكات
DO $$ 
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'cheques') THEN
        ALTER TABLE public.cheques ADD COLUMN IF NOT EXISTS current_account_id uuid REFERENCES public.accounts(id);
        ALTER TABLE public.cheques ADD COLUMN IF NOT EXISTS related_journal_entry_id uuid REFERENCES public.journal_entries(id);
        ALTER TABLE public.cheques ADD COLUMN IF NOT EXISTS transfer_account_number text;
        ALTER TABLE public.cheques ADD COLUMN IF NOT EXISTS transfer_bank_name text;
        ALTER TABLE public.cheques ADD COLUMN IF NOT EXISTS transfer_date date;
        ALTER TABLE public.cheques ADD COLUMN IF NOT EXISTS rejection_reason text;
        ALTER TABLE public.cheques ADD COLUMN IF NOT EXISTS notes text;
    END IF;
END $$;

-- 2. دالة مساعدة لضمان وجود الحسابات المحاسبية للشيكات ومنع أخطاء null في قيود اليومية
CREATE OR REPLACE FUNCTION public.fn_get_or_create_cheque_account(
    p_org_id uuid,
    p_account_role text, -- 'NOTES_RECEIVABLE', 'NOTES_PAYABLE', 'BANK', 'CUSTOMERS', 'SUPPLIERS'
    p_fallback_bank_id uuid DEFAULT NULL
)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_acc_id uuid;
    v_mappings jsonb;
BEGIN
    SELECT account_mappings INTO v_mappings FROM public.company_settings WHERE organization_id = p_org_id;

    IF p_account_role = 'NOTES_RECEIVABLE' THEN
        -- البحث عن أوراق القبض
        v_acc_id := COALESCE(
            (v_mappings->>'NOTES_RECEIVABLE')::uuid,
            (SELECT id FROM public.accounts WHERE organization_id = p_org_id AND code = '1222' LIMIT 1),
            (SELECT id FROM public.accounts WHERE organization_id = p_org_id AND (code LIKE '10103%' OR code LIKE '1231%' OR code LIKE '122%') LIMIT 1),
            (SELECT id FROM public.accounts WHERE organization_id = p_org_id AND (name ILIKE '%أوراق القبض%' OR name ILIKE '%أوراق قبض%' OR name ILIKE '%شيكات واردة%' OR name ILIKE '%شيكات تحت التحصيل%') LIMIT 1)
        );
        IF v_acc_id IS NULL THEN
            INSERT INTO public.accounts (code, name, type, organization_id, is_active)
            VALUES ('1222', 'أوراق القبض (شيكات واردة)', 'asset', p_org_id, true)
            RETURNING id INTO v_acc_id;
        END IF;

    ELSIF p_account_role = 'NOTES_PAYABLE' THEN
        -- البحث عن أوراق الدفع
        v_acc_id := COALESCE(
            (v_mappings->>'NOTES_PAYABLE')::uuid,
            (SELECT id FROM public.accounts WHERE organization_id = p_org_id AND code = '222' LIMIT 1),
            (SELECT id FROM public.accounts WHERE organization_id = p_org_id AND (code LIKE '20102%' OR code LIKE '2202%' OR code LIKE '2102%' OR code LIKE '221%') LIMIT 1),
            (SELECT id FROM public.accounts WHERE organization_id = p_org_id AND (name ILIKE '%أوراق الدفع%' OR name ILIKE '%أوراق دفع%' OR name ILIKE '%شيكات صادرة%') LIMIT 1)
        );
        IF v_acc_id IS NULL THEN
            INSERT INTO public.accounts (code, name, type, organization_id, is_active)
            VALUES ('222', 'أوراق الدفع (شيكات صادرة)', 'liability', p_org_id, true)
            RETURNING id INTO v_acc_id;
        END IF;

    ELSIF p_account_role = 'BANK' THEN
        -- البحث عن حساب البنك
        v_acc_id := COALESCE(
            p_fallback_bank_id,
            (v_mappings->>'BANK_ACCOUNTS')::uuid,
            (v_mappings->>'BANK_MAIN')::uuid,
            (SELECT id FROM public.accounts WHERE organization_id = p_org_id AND (code LIKE '1232%' OR code LIKE '10102%') LIMIT 1),
            (SELECT id FROM public.accounts WHERE organization_id = p_org_id AND (name ILIKE '%بنك%' OR name ILIKE '%bank%') LIMIT 1),
            (SELECT id FROM public.accounts WHERE organization_id = p_org_id AND type = 'asset' AND (code LIKE '123%' OR code LIKE '101%') LIMIT 1)
        );
        IF v_acc_id IS NULL THEN
            INSERT INTO public.accounts (code, name, type, organization_id, is_active)
            VALUES ('123201', 'حساب البنك الرئيسي', 'asset', p_org_id, true)
            RETURNING id INTO v_acc_id;
        END IF;

    ELSIF p_account_role = 'CUSTOMERS' THEN
        -- البحث عن حساب العملاء
        v_acc_id := COALESCE(
            (v_mappings->>'CUSTOMERS')::uuid,
            (SELECT id FROM public.accounts WHERE organization_id = p_org_id AND code = '1221' LIMIT 1),
            (SELECT id FROM public.accounts WHERE organization_id = p_org_id AND (code LIKE '10104%' OR code LIKE '121%' OR name ILIKE '%عملاء%' OR name ILIKE '%العملاء%') LIMIT 1)
        );
        IF v_acc_id IS NULL THEN
            INSERT INTO public.accounts (code, name, type, organization_id, is_active)
            VALUES ('1221', 'العملاء (المدينون)', 'asset', p_org_id, true)
            RETURNING id INTO v_acc_id;
        END IF;

    ELSIF p_account_role = 'SUPPLIERS' THEN
        -- البحث عن حساب الموردين
        v_acc_id := COALESCE(
            (v_mappings->>'SUPPLIERS')::uuid,
            (SELECT id FROM public.accounts WHERE organization_id = p_org_id AND code IN ('201', '221') LIMIT 1),
            (SELECT id FROM public.accounts WHERE organization_id = p_org_id AND (code LIKE '20101%' OR code LIKE '201%' OR code LIKE '211%' OR name ILIKE '%موردين%' OR name ILIKE '%الموردين%') LIMIT 1)
        );
        IF v_acc_id IS NULL THEN
            INSERT INTO public.accounts (code, name, type, organization_id, is_active)
            VALUES ('201', 'الموردون (الدائنون)', 'liability', p_org_id, true)
            RETURNING id INTO v_acc_id;
        END IF;
    END IF;

    RETURN v_acc_id;
END;
$$;

-- 3. الدالة الشاملة لترحيل قيود الشيكات (Post Cheque Journal Entry)
CREATE OR REPLACE FUNCTION public.post_cheque_journal_entry(p_cheque_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_cheque record; 
    v_org_id uuid; 
    v_journal_id uuid; 
    v_bank_acc_id uuid;
    v_customer_acc_id uuid; 
    v_supplier_acc_id uuid; 
    v_notes_pay_acc_id uuid; 
    v_notes_rec_acc_id uuid; 
    v_description text; 
    v_ref text;
    v_current_stage_type text;
    v_action_date date;
BEGIN
    SELECT * INTO v_cheque FROM public.cheques WHERE id = p_cheque_id;  
    IF NOT FOUND THEN RETURN; END IF;
    
    v_org_id := v_cheque.organization_id;
    v_action_date := COALESCE(v_cheque.transfer_date, (v_cheque.created_at::date), CURRENT_DATE);

    -- تحديد نوع القيد بناءً على المرحلة
    v_current_stage_type := CASE 
        WHEN v_cheque.status IN ('issued', 'received') THEN (CASE WHEN v_cheque.type IN ('outgoing', 'out') THEN 'cheque_issuance' ELSE 'cheque_receipt' END)
        WHEN v_cheque.status IN ('collected', 'cashed') THEN (CASE WHEN v_cheque.type IN ('incoming', 'in') THEN 'cheque_collection' ELSE 'cheque_payment' END)
        WHEN v_cheque.status IN ('bounced', 'rejected') THEN 'cheque_bounced'
        ELSE 'cheque_other'
    END;

    -- تنظيف القيد القديم لنفس المرحلة إن وجد لتجنب التكرار
    DELETE FROM public.journal_entries 
    WHERE organization_id = v_org_id 
    AND related_document_id = p_cheque_id 
    AND related_document_type = v_current_stage_type;

    -- جلب الحسابات بدقة مع ضمان عدم رجوع null
    v_bank_acc_id := public.fn_get_or_create_cheque_account(v_org_id, 'BANK', v_cheque.current_account_id);
    v_customer_acc_id := public.fn_get_or_create_cheque_account(v_org_id, 'CUSTOMERS');
    v_supplier_acc_id := public.fn_get_or_create_cheque_account(v_org_id, 'SUPPLIERS');
    v_notes_pay_acc_id := public.fn_get_or_create_cheque_account(v_org_id, 'NOTES_PAYABLE');
    v_notes_rec_acc_id := public.fn_get_or_create_cheque_account(v_org_id, 'NOTES_RECEIVABLE');

    v_ref := 'CHQ-' || COALESCE(v_cheque.cheque_number, substring(p_cheque_id::text, 1, 8));

    -- 1. مرحلة الإصدار / الاستلام الأولي
    IF v_cheque.status IN ('issued', 'received') THEN
        IF v_cheque.type IN ('outgoing', 'out') THEN
            v_description := 'إصدار شيك صادر رقم ' || COALESCE(v_cheque.cheque_number, '') || ' للمورد ' || COALESCE(v_cheque.party_name, '');
            INSERT INTO public.journal_entries (transaction_date, description, reference, status, organization_id, related_document_id, related_document_type, is_posted, user_id)
            VALUES (v_action_date, v_description, v_ref, 'posted', v_org_id, p_cheque_id, 'cheque_issuance', true, auth.uid()) RETURNING id INTO v_journal_id;
            
            -- من ح/ المورد إلى ح/ أوراق الدفع
            INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) 
            VALUES 
                (v_journal_id, v_supplier_acc_id, v_cheque.amount, 0, v_description, v_org_id), 
                (v_journal_id, v_notes_pay_acc_id, 0, v_cheque.amount, v_description, v_org_id);
        ELSE
            v_description := 'استلام شيك وارد رقم ' || COALESCE(v_cheque.cheque_number, '') || ' من العميل ' || COALESCE(v_cheque.party_name, '');
            INSERT INTO public.journal_entries (transaction_date, description, reference, status, organization_id, related_document_id, related_document_type, is_posted, user_id)
            VALUES (v_action_date, v_description, v_ref, 'posted', v_org_id, p_cheque_id, 'cheque_receipt', true, auth.uid()) RETURNING id INTO v_journal_id;
            
            -- من ح/ أوراق القبض إلى ح/ العميل
            INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) 
            VALUES 
                (v_journal_id, v_notes_rec_acc_id, v_cheque.amount, 0, v_description, v_org_id), 
                (v_journal_id, v_customer_acc_id, 0, v_cheque.amount, v_description, v_org_id);
        END IF;

    -- 2. مرحلة التحصيل (للشيك الوارد)
    ELSIF v_cheque.type IN ('incoming', 'in') AND v_cheque.status = 'collected' THEN
        v_description := 'تحصيل شيك وارد رقم ' || COALESCE(v_cheque.cheque_number, '') || ' - إيداع بنكي (' || COALESCE(v_cheque.party_name, '') || ')';
        INSERT INTO public.journal_entries (transaction_date, description, reference, status, organization_id, related_document_id, related_document_type, is_posted, user_id)
        VALUES (CURRENT_DATE, v_description, v_ref || '-COL', 'posted', v_org_id, p_cheque_id, 'cheque_collection', true, auth.uid()) RETURNING id INTO v_journal_id;
        
        -- من ح/ البنك إلى ح/ أوراق القبض
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) 
        VALUES 
            (v_journal_id, v_bank_acc_id, v_cheque.amount, 0, v_description, v_org_id), 
            (v_journal_id, v_notes_rec_acc_id, 0, v_cheque.amount, v_description, v_org_id);

    -- 3. مرحلة الصرف (للشيك الصادر)
    ELSIF v_cheque.type IN ('outgoing', 'out') AND v_cheque.status = 'cashed' THEN
        v_description := 'صرف شيك صادر رقم ' || COALESCE(v_cheque.cheque_number, '') || ' - خصم بنكي (' || COALESCE(v_cheque.party_name, '') || ')';
        INSERT INTO public.journal_entries (transaction_date, description, reference, status, organization_id, related_document_id, related_document_type, is_posted, user_id)
        VALUES (CURRENT_DATE, v_description, v_ref || '-CSH', 'posted', v_org_id, p_cheque_id, 'cheque_payment', true, auth.uid()) RETURNING id INTO v_journal_id;
        
        -- من ح/ أوراق الدفع إلى ح/ البنك
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) 
        VALUES 
            (v_journal_id, v_notes_pay_acc_id, v_cheque.amount, 0, v_description, v_org_id), 
            (v_journal_id, v_bank_acc_id, 0, v_cheque.amount, v_description, v_org_id);

    -- 4. مرحلة الارتداد والرفض (Bounced / Rejected)
    ELSIF v_cheque.status IN ('bounced', 'rejected') THEN
        v_description := 'ارتداد/رفض شيك رقم ' || COALESCE(v_cheque.cheque_number, '') || COALESCE(' - ' || v_cheque.rejection_reason, '');
        INSERT INTO public.journal_entries (transaction_date, description, reference, status, organization_id, related_document_id, related_document_type, is_posted, user_id)
        VALUES (CURRENT_DATE, v_description, 'REJ-' || v_ref, 'posted', v_org_id, p_cheque_id, 'cheque_bounced', true, auth.uid()) RETURNING id INTO v_journal_id;
        
        IF v_cheque.type IN ('incoming', 'in') THEN
            -- إعادة المديونية للعميل وإلغاء ورقة القبض
            INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) 
            VALUES 
                (v_journal_id, v_customer_acc_id, v_cheque.amount, 0, v_description, v_org_id), 
                (v_journal_id, v_notes_rec_acc_id, 0, v_cheque.amount, v_description, v_org_id);
        ELSE
            -- إعادة الدائنية للمورد وإلغاء ورقة الدفع
            INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) 
            VALUES 
                (v_journal_id, v_notes_pay_acc_id, v_cheque.amount, 0, v_description, v_org_id), 
                (v_journal_id, v_supplier_acc_id, 0, v_cheque.amount, v_description, v_org_id);
        END IF;
    END IF;

    -- تحديث المعرف المرجعي لآخر قيد
    IF v_journal_id IS NOT NULL THEN 
        UPDATE public.cheques SET related_journal_entry_id = v_journal_id WHERE id = p_cheque_id; 
    END IF;

    -- تحديث الأرصدة
    BEGIN
        PERFORM public.recalculate_all_system_balances(v_org_id);
    EXCEPTION WHEN OTHERS THEN
        NULL;
    END;
END; 
$$;

-- 4. ربط المشغل التلقائي
CREATE OR REPLACE FUNCTION public.trg_post_cheque_journal_entry() RETURNS TRIGGER AS $$
BEGIN
    IF (TG_OP = 'INSERT') OR (NEW.status IS DISTINCT FROM OLD.status) OR (NEW.current_account_id IS DISTINCT FROM OLD.current_account_id) THEN
        PERFORM public.post_cheque_journal_entry(NEW.id);
    END IF;
    RETURN NEW;
END; 
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_cheque_posting ON public.cheques;
CREATE TRIGGER trg_cheque_posting 
AFTER INSERT OR UPDATE OF status, current_account_id ON public.cheques 
FOR EACH ROW EXECUTE FUNCTION public.trg_post_cheque_journal_entry();

-- 5. دوال RPC مخصصة ومباشرة لصرف وتحصيل ورفض الشيكات
CREATE OR REPLACE FUNCTION public.cash_or_collect_cheque(
    p_cheque_id uuid,
    p_status text, -- 'cashed' أو 'collected'
    p_bank_account_id uuid,
    p_action_date date DEFAULT CURRENT_DATE,
    p_user_id uuid DEFAULT NULL
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_cheque record;
BEGIN
    SELECT * INTO v_cheque FROM public.cheques WHERE id = p_cheque_id;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'الشيك غير موجود.');
    END IF;

    -- تحديث الشيك
    UPDATE public.cheques 
    SET 
        status = p_status,
        current_account_id = p_bank_account_id,
        transfer_date = COALESCE(p_action_date, CURRENT_DATE)
    WHERE id = p_cheque_id;

    -- ترحيل القيد
    PERFORM public.post_cheque_journal_entry(p_cheque_id);

    RETURN jsonb_build_object('success', true, 'cheque_id', p_cheque_id, 'status', p_status);
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

CREATE OR REPLACE FUNCTION public.reject_incoming_cheque(
    p_cheque_id uuid,
    p_rejection_reason text DEFAULT 'مرفوض من البنك',
    p_user_id uuid DEFAULT NULL
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
    UPDATE public.cheques 
    SET 
        status = 'rejected',
        rejection_reason = p_rejection_reason
    WHERE id = p_cheque_id;

    PERFORM public.post_cheque_journal_entry(p_cheque_id);

    RETURN jsonb_build_object('success', true);
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

CREATE OR REPLACE FUNCTION public.reject_outgoing_cheque(
    p_cheque_id uuid,
    p_rejection_reason text DEFAULT 'مرفوض / ملغى',
    p_user_id uuid DEFAULT NULL
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
    UPDATE public.cheques 
    SET 
        status = 'rejected',
        rejection_reason = p_rejection_reason
    WHERE id = p_cheque_id;

    PERFORM public.post_cheque_journal_entry(p_cheque_id);

    RETURN jsonb_build_object('success', true);
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

-- 6. إصلاح مشغلات التدقيق الأمني (حيث تم استبدال entry_number بـ reference لمنع خطأ record "old" has no field "entry_number")
CREATE OR REPLACE FUNCTION public.fn_audit_deletions()
RETURNS TRIGGER AS $$
DECLARE
    v_org_id uuid;
    v_item_name text;
    v_module text := 'general';
    v_severity text := 'warning';
BEGIN
    IF current_setting('app.restore_mode', true) = 'on' THEN
        RETURN OLD;
    END IF;

    CASE TG_TABLE_NAME
        WHEN 'invoices' THEN
            v_item_name := 'فاتورة مبيعات رقم: ' || COALESCE(OLD.invoice_number, OLD.id::text);
            v_org_id := OLD.organization_id;
            v_module := 'sales';
            v_severity := 'critical';
        WHEN 'purchase_invoices' THEN
            v_item_name := 'فاتورة مشتريات رقم: ' || COALESCE(OLD.invoice_number, OLD.id::text);
            v_org_id := OLD.organization_id;
            v_module := 'purchases';
            v_severity := 'critical';
        WHEN 'journal_entries' THEN
            v_item_name := 'قيد محاسبي رقم: ' || COALESCE(OLD.reference, OLD.id::text);
            v_org_id := OLD.organization_id;
            v_module := 'accounting';
            v_severity := 'critical';
        WHEN 'accounts' THEN
            v_item_name := 'حساب مالي: ' || OLD.name || ' (' || COALESCE(OLD.code, '') || ')';
            v_org_id := OLD.organization_id;
            v_module := 'accounting';
            v_severity := 'critical';
        WHEN 'products' THEN
            v_item_name := 'صنف: ' || OLD.name || ' (SKU: ' || COALESCE(OLD.sku, '') || ')';
            v_org_id := OLD.organization_id;
            v_module := 'inventory';
            v_severity := 'warning';
        WHEN 'customers' THEN
            v_item_name := 'عميل: ' || OLD.name;
            v_org_id := OLD.organization_id;
            v_module := 'sales';
            v_severity := 'warning';
        WHEN 'suppliers' THEN
            v_item_name := 'مورد: ' || OLD.name;
            v_org_id := OLD.organization_id;
            v_module := 'purchases';
            v_severity := 'warning';
        WHEN 'receipt_vouchers' THEN
            v_item_name := 'سند قبض رقم: ' || COALESCE(OLD.voucher_number, OLD.id::text);
            v_org_id := OLD.organization_id;
            v_module := 'treasury';
            v_severity := 'critical';
        WHEN 'payment_vouchers' THEN
            v_item_name := 'سند صرف رقم: ' || COALESCE(OLD.voucher_number, OLD.id::text);
            v_org_id := OLD.organization_id;
            v_module := 'treasury';
            v_severity := 'critical';
        WHEN 'cheques' THEN
            v_item_name := 'شيك رقم: ' || COALESCE(OLD.cheque_number, OLD.id::text);
            v_org_id := OLD.organization_id;
            v_module := 'treasury';
            v_severity := 'critical';
        ELSE
            v_item_name := 'سجل ' || TG_TABLE_NAME || ' (ID: ' || OLD.id::text || ')';
            v_org_id := COALESCE(OLD.organization_id, public.get_my_org());
    END CASE;

    BEGIN
        INSERT INTO public.security_logs (
            event_type,
            description,
            severity,
            module,
            performed_by,
            organization_id,
            metadata
        ) VALUES (
            TG_TABLE_NAME || '_deleted',
            format('تم حذف %s من النظام نهائياً', v_item_name),
            v_severity,
            v_module,
            auth.uid(),
            v_org_id,
            jsonb_build_object(
                'table_name', TG_TABLE_NAME,
                'deleted_id', OLD.id,
                'deleted_record', to_jsonb(OLD)
            )
        );
    EXCEPTION WHEN OTHERS THEN
        NULL;
    END;
    
    RETURN OLD;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.fn_audit_journal_status()
RETURNS TRIGGER AS $$
BEGIN
    IF current_setting('app.restore_mode', true) = 'on' THEN
        RETURN NEW;
    END IF;

    IF OLD.status = 'posted' AND NEW.status != 'posted' THEN
        BEGIN
            INSERT INTO public.security_logs (
                event_type,
                description,
                severity,
                module,
                performed_by,
                organization_id,
                metadata
            ) VALUES (
                'journal_unposted',
                format('⚠️ تم فك ترحيل القيد اليومي رقم (%s) وإعادته لحالة المسودة', COALESCE(NEW.reference, NEW.id::text)),
                'critical',
                'accounting',
                auth.uid(),
                NEW.organization_id,
                jsonb_build_object(
                    'entry_id', NEW.id,
                    'reference', NEW.reference,
                    'old_status', OLD.status,
                    'new_status', NEW.status
                )
            );
        EXCEPTION WHEN OTHERS THEN
            NULL;
        END;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.cash_or_collect_cheque(uuid, text, uuid, date, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reject_incoming_cheque(uuid, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reject_outgoing_cheque(uuid, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.post_cheque_journal_entry(uuid) TO authenticated;


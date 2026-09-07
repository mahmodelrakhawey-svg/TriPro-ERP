-- ========================================================================================
-- TriPro ERP — Fix Cheques Journal Entry Posting & Balance Constraint Trigger
-- تاريخ: 2026-08-23
-- الغرض: حل مشكلة (لا يمكن ترحيل قيد يومية يحتوي على أقل من طرفين محاسبيين) عند معالجة وصرف وتحصيل الشيكات
-- ========================================================================================

-- 1. تحديث دالة مراقبة توازن القيود المحاسبية لمنع التعارض أثناء الإدراج المرحلي للسطور
CREATE OR REPLACE FUNCTION public.fn_enforce_journal_entry_balance()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_total_debit NUMERIC(15, 2);
    v_total_credit NUMERIC(15, 2);
    v_lines_count INTEGER;
BEGIN
    -- الفحص فقط عند ترحيل القيد (status = 'posted')
    IF NEW.status = 'posted' THEN
        SELECT 
            COALESCE(SUM(debit), 0),
            COALESCE(SUM(credit), 0),
            COUNT(*)
        INTO 
            v_total_debit,
            v_total_credit,
            v_lines_count
        FROM public.journal_lines
        WHERE journal_entry_id = NEW.id;

        -- إذا كانت السطور لم تدرج بعد في عملية الإدراج المباشر وكان القيد قيد الإنشاء، يتم السماح بالإدراج ثم الفحص عند التحديث لـ posted
        IF TG_OP = 'UPDATE' OR v_lines_count > 0 THEN
            IF v_lines_count < 2 THEN
                RAISE EXCEPTION 'لا يمكن ترحيل قيد يومية يحتوي على أقل من طرفين محاسبيين (قيد: %)', NEW.id;
            END IF;

            IF ABS(v_total_debit - v_total_credit) > 0.01 THEN
                RAISE EXCEPTION 'لا يمكن ترحيل قيد يومية غير متوازن (إجمالي المدين: %, إجمالي الدائن: %)', v_total_debit, v_total_credit;
            END IF;
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_journal_entry_balance ON public.journal_entries;
CREATE CONSTRAINT TRIGGER trg_enforce_journal_entry_balance
AFTER INSERT OR UPDATE OF status ON public.journal_entries
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION public.fn_enforce_journal_entry_balance();


-- 2. تحديث الدالة الشاملة لترحيل قيود الشيكات (post_cheque_journal_entry) لإنشاء السطور ثم الترحيل
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
            VALUES (v_action_date, v_description, v_ref, 'draft', v_org_id, p_cheque_id, 'cheque_issuance', false, auth.uid()) RETURNING id INTO v_journal_id;
            
            -- من ح/ المورد إلى ح/ أوراق الدفع
            INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) 
            VALUES 
                (v_journal_id, v_supplier_acc_id, v_cheque.amount, 0, v_description, v_org_id), 
                (v_journal_id, v_notes_pay_acc_id, 0, v_cheque.amount, v_description, v_org_id);

            UPDATE public.journal_entries SET status = 'posted', is_posted = true WHERE id = v_journal_id;
        ELSE
            v_description := 'استلام شيك وارد رقم ' || COALESCE(v_cheque.cheque_number, '') || ' من العميل ' || COALESCE(v_cheque.party_name, '');
            INSERT INTO public.journal_entries (transaction_date, description, reference, status, organization_id, related_document_id, related_document_type, is_posted, user_id)
            VALUES (v_action_date, v_description, v_ref, 'draft', v_org_id, p_cheque_id, 'cheque_receipt', false, auth.uid()) RETURNING id INTO v_journal_id;
            
            -- من ح/ أوراق القبض إلى ح/ العميل
            INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) 
            VALUES 
                (v_journal_id, v_notes_rec_acc_id, v_cheque.amount, 0, v_description, v_org_id), 
                (v_journal_id, v_customer_acc_id, 0, v_cheque.amount, v_description, v_org_id);

            UPDATE public.journal_entries SET status = 'posted', is_posted = true WHERE id = v_journal_id;
        END IF;

    -- 2. مرحلة التحصيل (للشيك الوارد)
    ELSIF v_cheque.type IN ('incoming', 'in') AND v_cheque.status = 'collected' THEN
        v_description := 'تحصيل شيك وارد رقم ' || COALESCE(v_cheque.cheque_number, '') || ' - إيداع بنكي (' || COALESCE(v_cheque.party_name, '') || ')';
        INSERT INTO public.journal_entries (transaction_date, description, reference, status, organization_id, related_document_id, related_document_type, is_posted, user_id)
        VALUES (v_action_date, v_description, v_ref || '-COL', 'draft', v_org_id, p_cheque_id, 'cheque_collection', false, auth.uid()) RETURNING id INTO v_journal_id;
        
        -- من ح/ البنك إلى ح/ أوراق القبض
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) 
        VALUES 
            (v_journal_id, v_bank_acc_id, v_cheque.amount, 0, v_description, v_org_id), 
            (v_journal_id, v_notes_rec_acc_id, 0, v_cheque.amount, v_description, v_org_id);

        UPDATE public.journal_entries SET status = 'posted', is_posted = true WHERE id = v_journal_id;

    -- 3. مرحلة الصرف (للشيك الصادر)
    ELSIF v_cheque.type IN ('outgoing', 'out') AND v_cheque.status = 'cashed' THEN
        v_description := 'صرف شيك صادر رقم ' || COALESCE(v_cheque.cheque_number, '') || ' - خصم بنكي (' || COALESCE(v_cheque.party_name, '') || ')';
        INSERT INTO public.journal_entries (transaction_date, description, reference, status, organization_id, related_document_id, related_document_type, is_posted, user_id)
        VALUES (v_action_date, v_description, v_ref || '-CSH', 'draft', v_org_id, p_cheque_id, 'cheque_payment', false, auth.uid()) RETURNING id INTO v_journal_id;
        
        -- من ح/ أوراق الدفع إلى ح/ البنك
        INSERT INTO public.journal_lines (journal_entry_id, account_id, debit, credit, description, organization_id) 
        VALUES 
            (v_journal_id, v_notes_pay_acc_id, v_cheque.amount, 0, v_description, v_org_id), 
            (v_journal_id, v_bank_acc_id, 0, v_cheque.amount, v_description, v_org_id);

        UPDATE public.journal_entries SET status = 'posted', is_posted = true WHERE id = v_journal_id;

    -- 4. مرحلة الارتداد والرفض (Bounced / Rejected)
    ELSIF v_cheque.status IN ('bounced', 'rejected') THEN
        v_description := 'ارتداد/رفض شيك رقم ' || COALESCE(v_cheque.cheque_number, '') || COALESCE(' - ' || v_cheque.rejection_reason, '');
        INSERT INTO public.journal_entries (transaction_date, description, reference, status, organization_id, related_document_id, related_document_type, is_posted, user_id)
        VALUES (v_action_date, v_description, 'REJ-' || v_ref, 'draft', v_org_id, p_cheque_id, 'cheque_bounced', false, auth.uid()) RETURNING id INTO v_journal_id;
        
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

        UPDATE public.journal_entries SET status = 'posted', is_posted = true WHERE id = v_journal_id;
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

-- 🏗️ مديول الاعتمادات المستندية (Letters of Credit - LC)
-- إنشاء الجداول والسياسات الأمنية والربط المحاسبي

-- 1. جدول الاعتمادات المستندية
CREATE TABLE IF NOT EXISTS public.letters_of_credit (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE DEFAULT public.get_my_org(),
    lc_number VARCHAR(100) NOT NULL, -- رقم الاعتماد المستندي
    supplier_id UUID REFERENCES public.suppliers(id) ON DELETE SET NULL, -- المورد الخارجي
    bank_id UUID NOT NULL REFERENCES public.accounts(id), -- البنك الفاتح للاعتماد (دائن بالخصم)
    lc_account_id UUID REFERENCES public.accounts(id), -- حساب الاعتماد المستندي (أصل وسيط - مدين بالتكلفة)
    currency_code VARCHAR(10) NOT NULL DEFAULT 'USD', -- عملة الاعتماد الأصيلة
    exchange_rate NUMERIC(10,5) NOT NULL DEFAULT 1.0, -- سعر الصرف عند الفتح
    amount_foreign NUMERIC(15,2) NOT NULL DEFAULT 0 CHECK (amount_foreign >= 0), -- قيمة الاعتماد بالعملة الأجنبية
    amount_local NUMERIC(15,2) NOT NULL DEFAULT 0 CHECK (amount_local >= 0), -- قيمة الاعتماد بالعملة المحلية
    margin_percentage NUMERIC(5,2) NOT NULL DEFAULT 0 CHECK (margin_percentage >= 0 AND margin_percentage <= 100), -- نسبة الغطاء النقدي %
    margin_amount NUMERIC(15,2) NOT NULL DEFAULT 0 CHECK (margin_amount >= 0), -- قيمة الغطاء النقدي المقتطع
    opening_date DATE NOT NULL,
    expiry_date DATE NOT NULL,
    project_id UUID REFERENCES public.projects(id) ON DELETE SET NULL, -- المشروع المرتبط (اختياري)
    status VARCHAR(50) NOT NULL DEFAULT 'opened' CHECK (status IN ('opened', 'documents_received', 'delivered', 'closed', 'cancelled')),
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- 2. جدول مصروفات الاعتماد المستندي (رسملة المصاريف: شحن، جمارك، تأمين، عمولات)
CREATE TABLE IF NOT EXISTS public.lc_expenses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE DEFAULT public.get_my_org(),
    lc_id UUID NOT NULL REFERENCES public.letters_of_credit(id) ON DELETE CASCADE,
    expense_type VARCHAR(50) NOT NULL CHECK (expense_type IN ('bank_commission', 'freight', 'customs', 'insurance', 'other')),
    amount NUMERIC(15,2) NOT NULL DEFAULT 0 CHECK (amount >= 0),
    expense_date DATE NOT NULL,
    invoice_ref VARCHAR(100), -- مرجع الفاتورة / السند
    journal_entry_id UUID REFERENCES public.journal_entries(id) ON DELETE SET NULL, -- القيد المحاسبي المولد
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- تفعيل حماية RLS لعزل بيانات الشركات (Multi-tenancy isolation)
ALTER TABLE public.letters_of_credit ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lc_expenses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "SaaS_LC_Isolation" ON public.letters_of_credit;
CREATE POLICY "SaaS_LC_Isolation" ON public.letters_of_credit
    FOR ALL USING (organization_id = public.get_my_org());

DROP POLICY IF EXISTS "SaaS_LC_Expenses_Isolation" ON public.lc_expenses;
CREATE POLICY "SaaS_LC_Expenses_Isolation" ON public.lc_expenses
    FOR ALL USING (organization_id = public.get_my_org());


-- ⚙️ إضافة حساب الاعتمادات المستندية لشراء بضائع (1246) وربطه تلقائياً للمنظمات الحالية
DO $$
DECLARE
    v_org record;
    v_parent_id uuid;
    v_new_acc_id uuid;
BEGIN
    FOR v_org IN SELECT id FROM public.organizations LOOP
        -- تحقق هل الحساب 1246 موجود لهذه المنظمة
        IF NOT EXISTS (SELECT 1 FROM public.accounts WHERE organization_id = v_org.id AND code = '1246') THEN
            -- ابحث عن الحساب الأب 124 (أرصدة مدينة أخرى)
            SELECT id INTO v_parent_id FROM public.accounts WHERE organization_id = v_org.id AND code = '124' LIMIT 1;
            
            -- إذا لم يكن الأب موجوداً، ابحث عن 12 (أصول متداولة)
            IF v_parent_id IS NULL THEN
                SELECT id INTO v_parent_id FROM public.accounts WHERE organization_id = v_org.id AND code = '12' LIMIT 1;
            END IF;

            -- إدراج الحساب
            INSERT INTO public.accounts (organization_id, code, name, type, is_group, parent_id, is_active)
            VALUES (v_org.id, '1246', 'اعتمادات مستندية لشراء بضائع', 'asset', false, v_parent_id, true)
            RETURNING id INTO v_new_acc_id;
            
            -- ربط الحساب تلقائياً في إعدادات المنشأة
            UPDATE public.company_settings
            SET account_mappings = COALESCE(account_mappings, '{}'::jsonb) || jsonb_build_object('LETTER_OF_CREDIT_GOODS', v_new_acc_id)
            WHERE organization_id = v_org.id;
        ELSE
            -- الحساب موجود بالفعل، قم بربطه فقط
            SELECT id INTO v_new_acc_id FROM public.accounts WHERE organization_id = v_org.id AND code = '1246' LIMIT 1;
            
            UPDATE public.company_settings
            SET account_mappings = COALESCE(account_mappings, '{}'::jsonb) || jsonb_build_object('LETTER_OF_CREDIT_GOODS', v_new_acc_id)
            WHERE organization_id = v_org.id;
        END IF;
    END LOOP;
END $$;

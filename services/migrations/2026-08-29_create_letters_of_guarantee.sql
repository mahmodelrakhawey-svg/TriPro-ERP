-- 🏗️ مديول خطابات الضمان البنكية (Letters of Guarantee)
-- إنشاء جدول خطابات الضمان وإعدادات الحماية والتكامل

CREATE TABLE IF NOT EXISTS public.letters_of_guarantee (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE DEFAULT public.get_my_org(),
    lg_number VARCHAR(100) NOT NULL,
    type VARCHAR(50) NOT NULL CHECK (type IN ('bid_bond', 'performance_bond', 'advance_payment', 'other')),
    issuing_bank_id UUID NOT NULL REFERENCES public.accounts(id), -- البنك الجاري المصدر
    margin_account_id UUID NOT NULL REFERENCES public.accounts(id), -- حساب غطاء خطاب الضمان (أصل)
    expense_account_id UUID REFERENCES public.accounts(id), -- حساب عمولات ومصاريف البنك (مصروف)
    project_id UUID REFERENCES public.projects(id) ON DELETE SET NULL, -- المشروع المرتبط
    beneficiary VARCHAR(255) NOT NULL, -- الجهة المستفيدة (المالك / العميل)
    amount NUMERIC(15,2) NOT NULL DEFAULT 0 CHECK (amount >= 0), -- قيمة خطاب الضمان الإجمالية
    margin_percentage NUMERIC(5,2) NOT NULL DEFAULT 0 CHECK (margin_percentage >= 0 AND margin_percentage <= 100), -- نسبة الغطاء النقدى %
    margin_amount NUMERIC(15,2) NOT NULL DEFAULT 0 CHECK (margin_amount >= 0), -- قيمة الغطاء النقدي المحجوز
    commission_amount NUMERIC(15,2) NOT NULL DEFAULT 0 CHECK (commission_amount >= 0), -- عمولة الإصدار
    issue_date DATE NOT NULL,
    expiry_date DATE NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'extended', 'returned', 'liquidated')),
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- تفعيل الـ Row Level Security (RLS) لعزل بيانات الشركات
ALTER TABLE public.letters_of_guarantee ENABLE ROW LEVEL SECURITY;

-- حذف السياسة إذا كانت موجودة مسبقاً وتجنب التكرار
DROP POLICY IF EXISTS "SaaS_LG_Isolation" ON public.letters_of_guarantee;

-- سياسة الوصول وعزل البيانات المشتركة (Multi-tenancy isolation)
CREATE POLICY "SaaS_LG_Isolation" ON public.letters_of_guarantee
    FOR ALL
    USING (organization_id = public.get_my_org());


-- ⚙️ إضافة حساب غطاء خطابات الضمان (1248) وربطه تلقائياً للمنظمات الحالية لتجنب الأخطاء
DO $$
DECLARE
    v_org record;
    v_parent_id uuid;
    v_new_acc_id uuid;
BEGIN
    FOR v_org IN SELECT id FROM public.organizations LOOP
        -- تحقق هل الحساب 1248 موجود لهذه المنظمة
        IF NOT EXISTS (SELECT 1 FROM public.accounts WHERE organization_id = v_org.id AND code = '1248') THEN
            -- ابحث عن الحساب الأب 124 (أرصدة مدينة أخرى)
            SELECT id INTO v_parent_id FROM public.accounts WHERE organization_id = v_org.id AND code = '124' LIMIT 1;
            
            -- إذا لم يكن الأب موجوداً، ابحث عن 12 (أصول متداولة)
            IF v_parent_id IS NULL THEN
                SELECT id INTO v_parent_id FROM public.accounts WHERE organization_id = v_org.id AND code = '12' LIMIT 1;
            END IF;

            -- إدراج الحساب
            INSERT INTO public.accounts (organization_id, code, name, type, is_group, parent_id, is_active)
            VALUES (v_org.id, '1248', 'غطاء خطابات ضمان لدى البنوك', 'asset', false, v_parent_id, true)
            RETURNING id INTO v_new_acc_id;
            
            -- ربط الحساب تلقائياً في إعدادات المنشأة
            UPDATE public.company_settings
            SET account_mappings = COALESCE(account_mappings, '{}'::jsonb) || jsonb_build_object('LETTER_OF_GUARANTEE_MARGIN', v_new_acc_id)
            WHERE organization_id = v_org.id;
        ELSE
            -- الحساب موجود بالفعل، قم بربطه فقط
            SELECT id INTO v_new_acc_id FROM public.accounts WHERE organization_id = v_org.id AND code = '1248' LIMIT 1;
            
            UPDATE public.company_settings
            SET account_mappings = COALESCE(account_mappings, '{}'::jsonb) || jsonb_build_object('LETTER_OF_GUARANTEE_MARGIN', v_new_acc_id)
            WHERE organization_id = v_org.id;
        END IF;
    END LOOP;
END $$;

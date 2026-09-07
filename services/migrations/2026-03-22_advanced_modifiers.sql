-- 🌶️ نظام الإضافات المتقدم (Advanced Modifiers)
-- تاريخ الإنشاء: 22 مارس 2026

-- 1. جدول مجموعات الإضافات (Modifier Groups)
-- هذا الجدول يحدد القواعد لمجموعة من الخيارات، مثل "الحجم" أو "الإضافات".
CREATE TABLE IF NOT EXISTS public.modifier_groups (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
    selection_type TEXT NOT NULL CHECK (selection_type IN ('SINGLE', 'MULTIPLE')) DEFAULT 'MULTIPLE', -- هل يمكن اختيار واحد فقط أم عدة خيارات؟
    is_required BOOLEAN NOT NULL DEFAULT false, -- هل هذه المجموعة إجبارية؟
    min_selection INT NOT NULL DEFAULT 0,
    max_selection INT,
    display_order INT DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE public.modifier_groups IS 'مجموعات الإضافات المرتبطة بالمنتجات، مثل الحجم، الصوصات، إلخ.';
COMMENT ON COLUMN public.modifier_groups.name IS 'اسم المجموعة (مثال: حجم البيتزا، الإضافات)';
COMMENT ON COLUMN public.modifier_groups.product_id IS 'المنتج الذي تنتمي إليه هذه المجموعة';
COMMENT ON COLUMN public.modifier_groups.selection_type IS 'نوع الاختيار: SINGLE (واحد فقط) أو MULTIPLE (متعدد)';
COMMENT ON COLUMN public.modifier_groups.is_required IS 'هل يجب على المستخدم اختيار خيار واحد على الأقل من هذه المجموعة؟';
COMMENT ON COLUMN public.modifier_groups.min_selection IS 'الحد الأدنى لعدد الخيارات التي يجب تحديدها';
COMMENT ON COLUMN public.modifier_groups.max_selection IS 'الحد الأقصى لعدد الخيارات التي يمكن تحديدها';

-- 2. جدول الإضافات (Modifiers)
-- هذا الجدول يحتوي على الخيارات الفردية داخل كل مجموعة.
CREATE TABLE IF NOT EXISTS public.modifiers (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    price NUMERIC(10, 2) NOT NULL DEFAULT 0,
    modifier_group_id uuid NOT NULL REFERENCES public.modifier_groups(id) ON DELETE CASCADE,
    is_default BOOLEAN NOT NULL DEFAULT false, -- هل هذا الخيار محدد بشكل افتراضي؟
    display_order INT DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE public.modifiers IS 'الخيارات الفردية داخل كل مجموعة إضافات، مثل "صغير"، "وسط"، "جبنة إضافية".';
COMMENT ON COLUMN public.modifiers.name IS 'اسم الإضافة (مثال: صغير، جبنة إضافية)';
COMMENT ON COLUMN public.modifiers.price IS 'السعر الإضافي لهذه الإضافة';
COMMENT ON COLUMN public.modifiers.modifier_group_id IS 'المجموعة التي تنتمي إليها هذه الإضافة';

-- 3. جدول ربط الإضافات ببنود الطلب (Order Item Modifiers)
-- هذا الجدول يسجل الإضافات التي تم اختيارها لكل صنف في طلب معين.
CREATE TABLE IF NOT EXISTS public.order_item_modifiers (
    order_item_id uuid NOT NULL REFERENCES public.order_items(id) ON DELETE CASCADE,
    modifier_id uuid NOT NULL REFERENCES public.modifiers(id) ON DELETE CASCADE,
    quantity INT NOT NULL DEFAULT 1,
    price_at_order NUMERIC(10, 2) NOT NULL, -- سعر الإضافة وقت الطلب
    PRIMARY KEY (order_item_id, modifier_id)
);

COMMENT ON TABLE public.order_item_modifiers IS 'جدول الربط لتسجيل الإضافات المختارة لكل صنف في الطلب.';
COMMENT ON COLUMN public.order_item_modifiers.quantity IS 'كمية الإضافة (مثال: 2x جبنة إضافية)';
COMMENT ON COLUMN public.order_item_modifiers.price_at_order IS 'تسجيل سعر الإضافة وقت الطلب لتجنب مشاكل تغيير الأسعار مستقبلاً';

-- تفعيل RLS للجداول الجديدة
ALTER TABLE public.modifier_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.modifiers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_item_modifiers ENABLE ROW LEVEL SECURITY;

-- يمكنك إضافة سياسات RLS هنا لاحقاً حسب الحاجة
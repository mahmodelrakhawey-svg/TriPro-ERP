-- ====================================================================
-- Migration: Enterprise Granular RBAC Permissions Seed & Sync Engine
-- Date: 2026-08-17
-- Description: Comprehensive permissions seed with 75+ granular actions
-- with safety guards against old organization triggers in SQL Editor.
-- ====================================================================

-- 🛡️ 1. تفعيل وضع التجاوز الآمن لحماية عمليات الصيانة والإدراج المباشر
SET app.restore_mode = 'on';

-- إسقاط أي مشغلات قديمة أو خاطئة تم ربطها بجدول الصلاحيات العام سابقاً
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'permissions') THEN
        DROP TRIGGER IF EXISTS trg_force_org_id ON public.permissions;
        DROP TRIGGER IF EXISTS trg_force_org_id_on_insert ON public.permissions;
        DROP TRIGGER IF EXISTS trg_force_org_id_universal ON public.permissions;
        DROP TRIGGER IF EXISTS trg_ensure_org_id ON public.permissions;
        DROP TRIGGER IF EXISTS trg_permissions_org ON public.permissions;
    END IF;
END $$;

-- 2. التأكد من وجود الأعمدة اللازمة في جدول الصلاحيات
CREATE TABLE IF NOT EXISTS public.permissions (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    module text NOT NULL,
    action text NOT NULL,
    description text,
    is_sensitive boolean DEFAULT false,
    category text DEFAULT 'general',
    UNIQUE(module, action)
);

ALTER TABLE public.permissions ADD COLUMN IF NOT EXISTS description text;
ALTER TABLE public.permissions ADD COLUMN IF NOT EXISTS is_sensitive boolean DEFAULT false;
ALTER TABLE public.permissions ADD COLUMN IF NOT EXISTS category text DEFAULT 'general';

-- 3. زرع وتحديث حزم الصلاحيات المفصلة والشاملة (75+ صلاحية)
INSERT INTO public.permissions (module, action, description, is_sensitive, category) VALUES

-- -------------------------------------------------------------
-- 🟢 1. موديول المبيعات والعملاء (Sales & Customers)
-- -------------------------------------------------------------
('sales', 'view', 'عرض قائمة وسجلات فواتير المبيعات', false, 'sales'),
('sales', 'create', 'إنشاء فاتورة مبيعات جديدة', false, 'sales'),
('sales', 'update', 'تعديل فواتير المبيعات غير المعتمدة', false, 'sales'),
('sales', 'delete', 'حذف فواتير المبيعات غير المرحلة', true, 'sales'),
('sales', 'approve', 'اعتماد الفواتير وترحيلها المحاسبي والمخزني', true, 'sales'),
('sales', 'void', 'إلغاء / إبطال الفواتير المعتمدة وإصدار إشعار دائن', true, 'sales'),
('sales', 'change_price', 'تعديل وتغيير الأسعار يدوياً أثناء البيع وكسر السعر الافتراضي', true, 'sales'),
('sales', 'apply_discount', 'منح خصومات على الفاتورة وتجاوز النسبة المحددة', true, 'sales'),
('sales', 'override_credit_limit', 'البيع الآجل وتجاوز الحد الائتماني المسموح به للعميل', true, 'sales'),
('sales', 'negative_stock', 'البيع بالسالب والسماح بالصرف دون توفر رصيد مخزني', true, 'sales'),
('sales', 'view_cost_profit', 'الاطلاع على تكلفة البضاعة المباعة وهامش الربح بالفاتورة', true, 'sales'),
('sales', 'quotation', 'إنشاء وإدارة عروض الأسعار وتحويلها لفواتير', false, 'sales'),
('sales', 'return', 'إنشاء واعتماد مرتجعات المبيعات وتأثيرها المالي', false, 'sales'),
('sales', 'export', 'تصدير بيانات وفواتير المبيعات إلى Excel / PDF', false, 'sales'),
('customers', 'view', 'عرض قائمة وسجلات العملاء', false, 'sales'),
('customers', 'create', 'إضافة عميل جديد', false, 'sales'),
('customers', 'update', 'تعديل بيانات العملاء وجهات الاتصال', false, 'sales'),
('customers', 'delete', 'حذف سجل عميل', true, 'sales'),
('customers', 'manage_balance', 'تعديل رصيد أول المدة والحد الائتماني للعميل', true, 'sales'),

-- -------------------------------------------------------------
-- 🔵 2. موديول المشتريات والموردين (Purchases & Suppliers)
-- -------------------------------------------------------------
('purchases', 'view', 'عرض فواتير وسجلات المشتريات', false, 'purchases'),
('purchases', 'po_manage', 'إنشاء وإدارة وتأكيد أوامر الشراء (PO)', false, 'purchases'),
('purchases', 'create', 'تسجيل فاتورة مشتريات واستلام بضاعة', false, 'purchases'),
('purchases', 'update', 'تعديل فواتير المشتريات غير المرحلة', false, 'purchases'),
('purchases', 'delete', 'حذف فواتير المشتريات', true, 'purchases'),
('purchases', 'approve', 'اعتماد وترحيل فواتير المشتريات وتحديث التكاليف', true, 'purchases'),
('purchases', 'return', 'إدارة واعتماد مرتجعات المشتريات (إشعار مدين)', false, 'purchases'),
('purchases', 'price_history', 'الاطلاع على سجل ومقارنة أسعار الموردين التاريخية', false, 'purchases'),
('purchases', 'export', 'تصدير تقارير المشتريات إلى ملفات خارجية', false, 'purchases'),
('suppliers', 'view', 'عرض قائمة الموردين وسجلاتهم', false, 'purchases'),
('suppliers', 'create', 'إضافة مورد جديد', false, 'purchases'),
('suppliers', 'update', 'تعديل بيانات الموردين والشروط التجارية', false, 'purchases'),
('suppliers', 'delete', 'حذف سجل مورد', true, 'purchases'),
('suppliers', 'manage_balance', 'تعديل رصيد أول المدة للمورد يدوياً', true, 'purchases'),

-- -------------------------------------------------------------
-- 📦 3. موديول المخازن والأصناف والتسويات (Inventory & Products)
-- -------------------------------------------------------------
('products', 'view', 'عرض قائمة المنتجات والأصناف وأرصدتها', false, 'inventory'),
('products', 'create', 'إضافة صنف أو منتج جديد وتوليد باركود', false, 'inventory'),
('products', 'update', 'تعديل بيانات الصنف والوصفات والمواصفات', false, 'inventory'),
('products', 'edit_pricing', 'تعديل سعر الشراء والتكلفة وسعر البيع للأصناف', true, 'inventory'),
('products', 'delete', 'حذف منتج أو صنف من النظام', true, 'inventory'),
('inventory', 'view', 'عرض حركات المخزون وبطاقة الصنف وتقارير الأرصدة', false, 'inventory'),
('inventory', 'transfer', 'إنشاء وتنفيذ طلبات التحويل بين المستودعات', false, 'inventory'),
('inventory', 'adjustment', 'تسجيل محاضر الجرد الدوري والمفاجئ', false, 'inventory'),
('inventory', 'adjustment_approve', 'اعتماد فروق الجرد وترحيل التسويات للقيود آلياً', true, 'inventory'),
('inventory', 'wastage', 'تسجيل وإثبات الهالك والتالف وتحديد أسبابه ومسؤوليته', false, 'inventory'),
('inventory', 'recalculate_cost', 'إعادة احتساب متوسط التكلفة المرجح (WAC) ديناميكياً', true, 'inventory'),
('inventory', 'uom_manage', 'إدارة وتعديل وحدات القياس ومعاملات التحويل', false, 'inventory'),

-- -------------------------------------------------------------
-- 💰 4. الخزينة والبنوك والمقبوضات والشيكات (Treasury & Banking)
-- -------------------------------------------------------------
('treasury', 'view', 'عرض الخزن والحسابات البنكية وحركاتها', false, 'treasury'),
('treasury', 'view_balances', 'الاطلاع على الأرصدة النقدية والبنكية الفعلية والسرية', true, 'treasury'),
('treasury', 'receipt_create', 'إنشاء سند قبض نقدي أو بنكي (عميل / إيراد)', false, 'treasury'),
('treasury', 'receipt_approve', 'اعتماد وترحيل سندات القبض وتأثيرها المالي', false, 'treasury'),
('treasury', 'payment_create', 'إنشاء سند صرف نقدي أو بنكي (مورد / مصروف)', false, 'treasury'),
('treasury', 'payment_approve', 'اعتماد وترحيل سندات الصرف وخصمها من الخزينة', true, 'treasury'),
('treasury', 'voucher_delete', 'حذف أو إلغاء السندات المالية المقيدة', true, 'treasury'),
('treasury', 'transfer', 'تنفيذ التحويلات المالية بين الخزائن والحسابات البنكية', false, 'treasury'),
('treasury', 'cheque_manage', 'تسجيل واستلام وحفظ شيكات القبض والدفع في الحافظة', false, 'treasury'),
('treasury', 'cheque_collect', 'تحصيل الشيكات وإثبات قيد دخول النقدية للحساب', true, 'treasury'),
('treasury', 'cheque_bounce', 'إثبات رفض الشيك وارتداده وإرجاعه للعميل', false, 'treasury'),
('treasury', 'bank_reconciliation', 'إجراء التسويات والمطابقات البنكية الشهرية', false, 'treasury'),

-- -------------------------------------------------------------
-- 📑 5. المحاسبة العامة وشجرة الحسابات والقيود (Accounting & GL)
-- -------------------------------------------------------------
('accounting', 'view', 'عرض دفتر اليومية وميزان المراجعة والأستاذ العام', false, 'accounting'),
('accounting', 'coa', 'عرض وإدارة وتعديل شجرة الحسابات (دليل الحسابات)', true, 'accounting'),
('accounting', 'journal_create', 'إنشاء قيد يومية يدوي مركب أو تسوية', false, 'accounting'),
('accounting', 'journal_update', 'تعديل القيود اليومية غير المرحلة', false, 'accounting'),
('accounting', 'journal_post', 'ترحيل القيود اليومية للحسابات العامة (Post GL)', true, 'accounting'),
('accounting', 'journal_unpost', 'إلغاء ترحيل القيود اليومية وتعديلها (Unpost)', true, 'accounting'),
('accounting', 'journal_delete', 'حذف القيود اليومية من السجلات', true, 'accounting'),
('accounting', 'period_closing', 'إقفال الفترات المالية وتدوير وإقفال السنة المالية', true, 'accounting'),
('accounting', 'mappings_manage', 'إدارة وتعديل التوجيه المحاسبي التلقائي للعمليات', true, 'accounting'),
('accounting', 'depreciation_run', 'احتساب وإثبات قيود الإهلاك الدوري للأصول الثابتة', false, 'accounting'),

-- -------------------------------------------------------------
-- 🏢 6. الأصول الثابتة (Fixed Assets)
-- -------------------------------------------------------------
('assets', 'view', 'عرض سجل وبيانات ومواقع الأصول الثابتة', false, 'assets'),
('assets', 'manage', 'إضافة واستبعاد وتكهين وإعادة تقييم الأصول الثابتة', true, 'assets'),
('assets', 'depreciate', 'تنفيذ وحساب الإهلاك التلقائي للأصول', false, 'assets'),

-- -------------------------------------------------------------
-- 👥 7. الموارد البشرية والرواتب (HR & Payroll)
-- -------------------------------------------------------------
('hr', 'view', 'عرض قائمة وسجلات الموظفين والملفات الشخصية', false, 'hr'),
('hr', 'manage_employee', 'إضافة وتعديل بيانات الموظفين وتفاصيل العقود', false, 'hr'),
('hr', 'advances_penalties', 'تسجيل السلف، المكافآت، الخصومات، والبدلات', false, 'hr'),
('hr', 'payroll_process', 'معالجة واحتساب مسير الرواتب الشهري', false, 'hr'),
('hr', 'payroll_approve', 'اعتماد وترحيل مسير الرواتب للمصروفات المالية', true, 'hr'),
('hr', 'delete_employee', 'حذف سجل موظف أو إنهاء خدماته', true, 'hr'),

-- -------------------------------------------------------------
-- ⚙️ 8. التصنيع والإنتاج (Manufacturing & Production)
-- -------------------------------------------------------------
('manufacturing', 'view', 'عرض لوحة تحكم أوامر الإنتاج ومراحل التشغيل', false, 'manufacturing'),
('manufacturing', 'bom_manage', 'إنشاء وتعديل بطاقات المقادير ومعادلات التصنيع (BOM)', true, 'manufacturing'),
('manufacturing', 'order_create', 'إنشاء وإطلاق أوامر التشغيل والإنتاج', false, 'manufacturing'),
('manufacturing', 'material_issue', 'صرف وصرف إضافي للمواد الخام من المستودع لأمر الإنتاج', false, 'manufacturing'),
('manufacturing', 'production_finish', 'استلام المنتجات التامة وتخزينها في مستودع التام', false, 'manufacturing'),
('manufacturing', 'wip_close', 'إقفال أوامر التشغيل واحتساب فروق التكلفة والانحرافات', true, 'manufacturing'),
('manufacturing', 'scrap_record', 'تسجيل وإثبات الهالك الصناعي والمعيب (Scrap)', false, 'manufacturing'),
('manufacturing', 'qc_inspect', 'إجراء فحص واختبار رقابة الجودة (QC) والموافقة عليها', false, 'manufacturing'),

-- -------------------------------------------------------------
-- 🍽️ 9. نقاط البيع والمطاعم والكافيهات (Restaurant & POS)
-- -------------------------------------------------------------
('pos', 'open_shift', 'الوصول لنقطة البيع وبدء شفت الكاشير', false, 'pos'),
('pos', 'close_shift', 'إغلاق الشفت وتوريد النقدية ومطابقة العهدة وحصر العجز/الزيادة', true, 'pos'),
('restaurant', 'manage', 'إدارة الطاولات، الجلسات، والحجوزات', false, 'restaurant'),
('restaurant', 'discount_comp', 'منح خصم على الطاولة أو ضيافة مجانية (Comp/Discount)', true, 'restaurant'),
('restaurant', 'void_order_item', 'إلغاء أو تعديل صنف بعد إرساله للمطبخ (Void Item)', true, 'restaurant'),
('restaurant', 'split_bill', 'تقسيم الشيك وفصل الحسابات لطاولات ومجموعات', false, 'restaurant'),
('restaurant', 'transfer_table', 'نقل الطاولات ودمج الجلسات وتحويل الأصناف', false, 'restaurant'),
('restaurant', 'menu_manage', 'إدارة قائمة الطعام، الأسعار، الإضافات، والمجموعات', true, 'restaurant'),
('restaurant', 'kitchen_view', 'عرض والتعامل مع شاشة المطبخ وإشعارات التحضير (KDS)', false, 'restaurant'),

-- -------------------------------------------------------------
-- 🏗️ 10. المقاولات وإدارة المشاريع (Construction & Projects)
-- -------------------------------------------------------------
('construction', 'view', 'عرض المشاريع والمقايسات ونسب الإنجاز الفعلي', false, 'construction'),
('construction', 'create_project', 'إنشاء مشروع وتحديد الميزانية وبنود الأعمال', false, 'construction'),
('construction', 'billing_manage', 'إصدار واعتماد المستخلصات الجارية والختامية (Progress Billing)', true, 'construction'),
('construction', 'subcontractor_manage', 'إدارة مستخلصات مقاولي الباطن والخصومات والتشوينات', false, 'construction'),
('construction', 'project_close', 'إقفال المشروع واحتساب الأرباح المعترف بها', true, 'construction'),

-- -------------------------------------------------------------
-- 🏥 11. المنظومة الطبية والمستشفيات (HIMS Healthcare)
-- -------------------------------------------------------------
('hims', 'reception_manage', 'استقبال المرضى وفتح الملفات وحجز المواعيد', false, 'hims'),
('hims', 'doctor_consultation', 'الكشف الطبي والتشخيص وكتابة الوصفات الطبية', false, 'hims'),
('hims', 'lab_results', 'استلام عينات المختبر وإدخال واعتماد النتائج الطبية', false, 'hims'),
('hims', 'radiology_results', 'تنفيذ طلبات الأشعة وإرفاق التقارير التشخيصية', false, 'hims'),
('hims', 'inpatient_manage', 'تسكين وإدارة أجنحة التنويم، العمليات، والأسرّة', false, 'hims'),
('hims', 'insurance_billing', 'إصدار الفواتير الطبية ومطالبات شركات التأمين والموافقات', true, 'hims'),

-- -------------------------------------------------------------
-- 📊 12. التقارير والإحصائيات والبيانات الحساسة (Reports & Analytics)
-- -------------------------------------------------------------
('reports', 'general_view', 'عرض التقارير التشغيلية اليومية وحركات المبيعات والمخازن', false, 'reports'),
('reports', 'financial_statements', 'عرض القوائم المالية (قائمة الدخل، الميزانية، التدفقات النقدية)', true, 'reports'),
('reports', 'profit_margins', 'عرض تقارير ربحية الفواتير والأصناف والعملاء وهامش المساهمة', true, 'reports'),
('reports', 'aging_reports', 'عرض تقارير أعمار الديون والتحصيلات المتأخرة للعملاء والموردين', false, 'reports'),
('reports', 'export_data', 'تصدير التقارير وجداول البيانات إلى ملفات Excel / PDF', true, 'reports'),

-- -------------------------------------------------------------
-- 🛡️ 13. إدارة النظام والأمان والنسخ الاحتياطي (Administration & Security)
-- -------------------------------------------------------------
('admin', 'users_manage', 'إدارة حسابات المستخدمين، كلمات المرور، وتعيين الأدوار', true, 'admin'),
('admin', 'roles_manage', 'إنشاء وتعديل الأدوار والصلاحيات المخصصة', true, 'admin'),
('admin', 'settings_manage', 'تعديل إعدادات المنشأة، الضرائب، والفاتورة الإلكترونية', true, 'admin'),
('admin', 'backups_manage', 'إنشاء واستعادة وتحميل النسخ الاحتياطية للنظام', true, 'admin'),
('admin', 'audit_logs', 'استعراض سجلات الرقابة الأمنية وعمليات الحذف والتعديل (Audit Trail)', true, 'admin')

ON CONFLICT (module, action) DO UPDATE SET 
    description = EXCLUDED.description,
    is_sensitive = EXCLUDED.is_sensitive,
    category = EXCLUDED.category;

-- -------------------------------------------------------------
-- 4. دالة المزامنة الشاملة لربط الصلاحيات بالأدوار (Hardened RPC)
-- -------------------------------------------------------------
DROP FUNCTION IF EXISTS public.sync_role_permissions(uuid, uuid[]) CASCADE;
DROP FUNCTION IF EXISTS public.sync_role_permissions(uuid, integer[]) CASCADE;

CREATE OR REPLACE FUNCTION public.sync_role_permissions(
    p_role_id uuid,
    p_permission_ids uuid[]
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
    v_org_id uuid;
    v_perm_id uuid;
BEGIN
    -- 1. استخراج منظمة الدور للتحقق والأمان
    SELECT organization_id INTO v_org_id 
    FROM public.roles 
    WHERE id = p_role_id;

    IF v_org_id IS NULL THEN
        v_org_id := public.get_my_org();
    END IF;

    -- 2. حذف الصلاحيات السابقة لهذا الدور داخل نفس المنظمة
    DELETE FROM public.role_permissions 
    WHERE role_id = p_role_id 
      AND (organization_id = v_org_id OR organization_id IS NULL);

    -- 3. زرع الصلاحيات المختارة الجديدة دفعة واحدة
    IF p_permission_ids IS NOT NULL AND array_length(p_permission_ids, 1) > 0 THEN
        FOREACH v_perm_id IN ARRAY p_permission_ids
        LOOP
            INSERT INTO public.role_permissions (role_id, permission_id, organization_id)
            VALUES (p_role_id, v_perm_id, v_org_id)
            ON CONFLICT DO NOTHING;
        END LOOP;
    END IF;

    RETURN true;
END;
$$;

-- منح الصلاحيات للأدمن والمستخدمين الموثقين
GRANT EXECUTE ON FUNCTION public.sync_role_permissions(uuid, uuid[]) TO authenticated;

-- إعادة ضبط وضع الاستعادة للوضع الطبيعي
SET app.restore_mode = 'off';

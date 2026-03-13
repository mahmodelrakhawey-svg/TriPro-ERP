-- 🇪🇬 دليل الحسابات المصري الشامل (نظام الجرد المستمر)
-- يشمل البنوك المصرية، المحافظ الإلكترونية، وتفاصيل المصروفات والأصول

BEGIN;

-- حذف البيانات المرتبطة أولاً لتجنب أخطاء المفتاح الخارجي
DELETE FROM public.journal_lines;
DELETE FROM public.journal_entries;
DELETE FROM public.payment_vouchers;
DELETE FROM public.receipt_vouchers;
DELETE FROM public.sales_returns;
DELETE FROM public.credit_notes;
DELETE FROM public.invoices;
DELETE FROM public.purchase_invoices;
DELETE FROM public.customers;
DELETE FROM public.suppliers;
DELETE FROM public.products;
DELETE FROM public.warehouses;

-- 1. تنظيف الجدول الحالي لضمان عدم التضارب
DELETE FROM public.accounts;

-- 2. الحسابات الرئيسية (المستوى الأول)
INSERT INTO public.accounts (code, name, type, is_group, parent_id) VALUES
('1', 'الأصول', 'ASSET', true, NULL),
('2', 'الخصوم (الإلتزامات)', 'LIABILITY', true, NULL),
('3', 'حقوق الملكية', 'EQUITY', true, NULL),
('4', 'الإيرادات', 'REVENUE', true, NULL),
('5', 'المصروفات', 'EXPENSE', true, NULL);

-- ============================================================
-- 1. الأصول (Assets)
-- ============================================================

-- 11 الأصول غير المتداولة
INSERT INTO public.accounts (code, name, type, is_group, parent_id) VALUES
('11', 'الأصول غير المتداولة', 'ASSET', true, (SELECT id FROM accounts WHERE code = '1'));

INSERT INTO public.accounts (code, name, type, is_group, parent_id) VALUES
('111', 'الأصول الثابتة (بالصافي)', 'ASSET', true, (SELECT id FROM accounts WHERE code = '11')),
('1111', 'الأراضي', 'ASSET', false, (SELECT id FROM accounts WHERE code = '111')),
('1112', 'المباني والإنشاءات', 'ASSET', false, (SELECT id FROM accounts WHERE code = '111')),
('1113', 'الآلات والمعدات', 'ASSET', false, (SELECT id FROM accounts WHERE code = '111')),
('1114', 'وسائل النقل والانتقال', 'ASSET', false, (SELECT id FROM accounts WHERE code = '111')),
('1115', 'الأثاث والتجهيزات المكتبية', 'ASSET', false, (SELECT id FROM accounts WHERE code = '111')),
('1116', 'أجهزة حاسب آلي وبرمجيات', 'ASSET', false, (SELECT id FROM accounts WHERE code = '111')),
('1119', 'مجمع إهلاك الأصول الثابتة', 'ASSET', false, (SELECT id FROM accounts WHERE code = '111')); -- طبيعته دائنة

-- 12 الأصول المتداولة
INSERT INTO public.accounts (code, name, type, is_group, parent_id) VALUES
('12', 'الأصول المتداولة', 'ASSET', true, (SELECT id FROM accounts WHERE code = '1'));

-- 103 المخزون (النظام الموحد)
INSERT INTO public.accounts (code, name, type, is_group, parent_id) VALUES
('103', 'المخزون', 'ASSET', true, (SELECT id FROM accounts WHERE code = '12')),
('10301', 'مخزون المواد الخام', 'ASSET', false, (SELECT id FROM accounts WHERE code = '103')),
('10302', 'مخزون المنتج التام', 'ASSET', false, (SELECT id FROM accounts WHERE code = '103'));

-- 122 العملاء والمدينون
INSERT INTO public.accounts (code, name, type, is_group, parent_id) VALUES
('122', 'العملاء والمدينون', 'ASSET', true, (SELECT id FROM accounts WHERE code = '12')),
('1221', 'العملاء', 'ASSET', false, (SELECT id FROM accounts WHERE code = '122')),
('1222', 'أوراق القبض (شيكات تحت التحصيل)', 'ASSET', false, (SELECT id FROM accounts WHERE code = '122')),
('1223', 'سلف الموظفين', 'ASSET', false, (SELECT id FROM accounts WHERE code = '122')),
('1224', 'عهد موظفين', 'ASSET', false, (SELECT id FROM accounts WHERE code = '122'));

-- 123 النقدية وما في حكمها (بنوك ومحافظ)
INSERT INTO public.accounts (code, name, type, is_group, parent_id) VALUES
('123', 'النقدية وما في حكمها', 'ASSET', true, (SELECT id FROM accounts WHERE code = '12')),
('1231', 'النقدية بالصندوق (الخزينة الرئيسية)', 'ASSET', false, (SELECT id FROM accounts WHERE code = '123')),
('1232', 'البنوك (حسابات جارية)', 'ASSET', true, (SELECT id FROM accounts WHERE code = '123')),
-- تفاصيل البنوك المصرية
('123201', 'البنك الأهلي المصري', 'ASSET', false, (SELECT id FROM accounts WHERE code = '1232')),
('123202', 'بنك مصر', 'ASSET', false, (SELECT id FROM accounts WHERE code = '1232')),
('123203', 'البنك التجاري الدولي (CIB)', 'ASSET', false, (SELECT id FROM accounts WHERE code = '1232')),
('123204', 'بنك QNB الأهلي', 'ASSET', false, (SELECT id FROM accounts WHERE code = '1232')),
('123205', 'بنك القاهرة', 'ASSET', false, (SELECT id FROM accounts WHERE code = '1232')),
('123206', 'بنك فيصل الإسلامي', 'ASSET', false, (SELECT id FROM accounts WHERE code = '1232')),
('123207', 'بنك الإسكندرية', 'ASSET', false, (SELECT id FROM accounts WHERE code = '1232')),
('1233', 'المحافظ الإلكترونية (Digital Wallets)', 'ASSET', true, (SELECT id FROM accounts WHERE code = '123')),
-- تفاصيل المحافظ
('123301', 'فودافون كاش (Vodafone Cash)', 'ASSET', false, (SELECT id FROM accounts WHERE code = '1233')),
('123302', 'اتصالات كاش (Etisalat Cash)', 'ASSET', false, (SELECT id FROM accounts WHERE code = '1233')),
('123303', 'أورنج كاش (Orange Cash)', 'ASSET', false, (SELECT id FROM accounts WHERE code = '1233')),
('123304', 'وي باي (WE Pay)', 'ASSET', false, (SELECT id FROM accounts WHERE code = '1233')),
('123305', 'انستا باي (InstaPay - تسوية)', 'ASSET', false, (SELECT id FROM accounts WHERE code = '1233'));

-- 124 أرصدة مدينة أخرى (مصروفات مقدمة وضرائب)
INSERT INTO public.accounts (code, name, type, is_group, parent_id) VALUES
('124', 'أرصدة مدينة أخرى', 'ASSET', true, (SELECT id FROM accounts WHERE code = '12')),
('1241', 'ضريبة القيمة المضافة (مدخلات)', 'ASSET', false, (SELECT id FROM accounts WHERE code = '124')),
('1242', 'ضريبة الخصم والتحصيل (لنا)', 'ASSET', false, (SELECT id FROM accounts WHERE code = '124')),
('1243', 'مصروفات مدفوعة مقدماً', 'ASSET', true, (SELECT id FROM accounts WHERE code = '124')),
-- تفاصيل المصروفات المقدمة
('124301', 'إيجار مقدم', 'ASSET', false, (SELECT id FROM accounts WHERE code = '1243')),
('124302', 'تأمين طبي مقدم', 'ASSET', false, (SELECT id FROM accounts WHERE code = '1243')),
('124303', 'اشتراكات برامج وسيرفرات مقدمة', 'ASSET', false, (SELECT id FROM accounts WHERE code = '1243')),
('124304', 'حملات إعلانية مقدمة', 'ASSET', false, (SELECT id FROM accounts WHERE code = '1243')),
('124305', 'عقود صيانة مقدمة', 'ASSET', false, (SELECT id FROM accounts WHERE code = '1243')),
('1244', 'إيرادات مستحقة', 'ASSET', true, (SELECT id FROM accounts WHERE code = '124')),
-- تفاصيل الإيرادات المستحقة
('124401', 'إيرادات خدمات مستحقة (غير مفوترة)', 'ASSET', false, (SELECT id FROM accounts WHERE code = '1244')),
('124402', 'فوائد بنكية مستحقة القبض', 'ASSET', false, (SELECT id FROM accounts WHERE code = '1244')),
('124403', 'إيجارات دائنة مستحقة', 'ASSET', false, (SELECT id FROM accounts WHERE code = '1244')),
('124404', 'إيرادات أوراق مالية مستحقة', 'ASSET', false, (SELECT id FROM accounts WHERE code = '1244'));

-- ============================================================
-- 2. الخصوم (Liabilities)
-- ============================================================

-- 21 الخصوم غير المتداولة
INSERT INTO public.accounts (code, name, type, is_group, parent_id) VALUES
('21', 'الخصوم غير المتداولة', 'LIABILITY', true, (SELECT id FROM accounts WHERE code = '2')),
('211', 'قروض طويلة الأجل', 'LIABILITY', false, (SELECT id FROM accounts WHERE code = '21'));

-- 22 الخصوم المتداولة
INSERT INTO public.accounts (code, name, type, is_group, parent_id) VALUES
('22', 'الخصوم المتداولة', 'LIABILITY', true, (SELECT id FROM accounts WHERE code = '2')),
('201', 'الموردين', 'LIABILITY', false, (SELECT id FROM accounts WHERE code = '22')), -- Corrected: Should be under Current Liabilities
('222', 'أوراق الدفع (شيكات صادرة)', 'LIABILITY', false, (SELECT id FROM accounts WHERE code = '22')),
('223', 'مصلحة الضرائب (التزامات)', 'LIABILITY', true, (SELECT id FROM accounts WHERE code = '22')),
('2231', 'ضريبة القيمة المضافة (مخرجات)', 'LIABILITY', false, (SELECT id FROM accounts WHERE code = '223')),
('2232', 'ضريبة الخصم والتحصيل (علينا)', 'LIABILITY', false, (SELECT id FROM accounts WHERE code = '223')),
('2233', 'ضريبة كسب العمل', 'LIABILITY', false, (SELECT id FROM accounts WHERE code = '223')),
('224', 'هيئة التأمينات الاجتماعية', 'LIABILITY', false, (SELECT id FROM accounts WHERE code = '22')),
('225', 'مصروفات مستحقة', 'LIABILITY', true, (SELECT id FROM accounts WHERE code = '22')),
-- تفاصيل المصروفات المستحقة (لمنع الأخطاء المحاسبية)
('2251', 'رواتب وأجور مستحقة', 'LIABILITY', false, (SELECT id FROM accounts WHERE code = '225')),
('2252', 'إيجارات مستحقة', 'LIABILITY', false, (SELECT id FROM accounts WHERE code = '225')),
('2253', 'كهرباء ومياه وغاز مستحقة', 'LIABILITY', false, (SELECT id FROM accounts WHERE code = '225')),
('2254', 'أتعاب مهنية ومراجعة مستحقة', 'LIABILITY', false, (SELECT id FROM accounts WHERE code = '225')),
('2255', 'عمولات بيع مستحقة', 'LIABILITY', false, (SELECT id FROM accounts WHERE code = '225')),
('2256', 'فوائد بنكية مستحقة', 'LIABILITY', false, (SELECT id FROM accounts WHERE code = '225')),
('2257', 'اشتراكات وتراخيص مستحقة', 'LIABILITY', false, (SELECT id FROM accounts WHERE code = '225')),
('226', 'تأمينات ودفعات مقدمة من العملاء', 'LIABILITY', false, (SELECT id FROM accounts WHERE code = '22'));

-- ============================================================
-- 3. حقوق الملكية (Equity)
-- ============================================================
INSERT INTO public.accounts (code, name, type, is_group, parent_id) VALUES
('31', 'رأس المال', 'EQUITY', false, (SELECT id FROM accounts WHERE code = '3')),
('32', 'الأرباح المبقاة / المرحلة', 'EQUITY', false, (SELECT id FROM accounts WHERE code = '3')),
('33', 'جاري الشركاء', 'EQUITY', false, (SELECT id FROM accounts WHERE code = '3')),
('34', 'احتياطيات', 'EQUITY', false, (SELECT id FROM accounts WHERE code = '3')),
('3999', 'الأرصدة الافتتاحية (حساب وسيط)', 'EQUITY', false, (SELECT id FROM accounts WHERE code = '3'));

-- ============================================================
-- 4. الإيرادات (Revenue)
-- ============================================================
INSERT INTO public.accounts (code, name, type, is_group, parent_id) VALUES
('41', 'إيرادات النشاط (المبيعات)', 'REVENUE', true, (SELECT id FROM accounts WHERE code = '4')),
('411', 'إيراد المبيعات', 'REVENUE', false, (SELECT id FROM accounts WHERE code = '41')),
('412', 'مردودات المبيعات', 'REVENUE', false, (SELECT id FROM accounts WHERE code = '41')), -- مدين
('413', 'خصم مسموح به', 'REVENUE', false, (SELECT id FROM accounts WHERE code = '41')), -- مدين
('42', 'إيرادات أخرى', 'REVENUE', true, (SELECT id FROM accounts WHERE code = '4')),
('421', 'إيرادات متنوعة', 'REVENUE', false, (SELECT id FROM accounts WHERE code = '42')),
('422', 'إيراد خصومات وجزاءات الموظفين', 'REVENUE', false, (SELECT id FROM accounts WHERE code = '42')),
('423', 'فوائد بنكية دائنة', 'REVENUE', false, (SELECT id FROM accounts WHERE code = '42'));

-- ============================================================
-- 5. المصروفات (Expenses)
-- ============================================================
INSERT INTO public.accounts (code, name, type, is_group, parent_id) VALUES
('51', 'تكلفة المبيعات (COGS)', 'EXPENSE', true, (SELECT id FROM accounts WHERE code = '5')),
('511', 'تكلفة البضاعة المباعة', 'EXPENSE', false, (SELECT id FROM accounts WHERE code = '51')),
('512', 'تسويات الجرد (عجز المخزون)', 'EXPENSE', false, (SELECT id FROM accounts WHERE code = '51')),

('52', 'مصروفات البيع والتسويق', 'EXPENSE', true, (SELECT id FROM accounts WHERE code = '5')),
('521', 'دعاية وإعلان', 'EXPENSE', false, (SELECT id FROM accounts WHERE code = '52')),
('522', 'عمولات بيع وتسويق', 'EXPENSE', false, (SELECT id FROM accounts WHERE code = '52')),
('523', 'نقل ومشال للخارج', 'EXPENSE', false, (SELECT id FROM accounts WHERE code = '52')),
('524', 'تعبئة وتغليف', 'EXPENSE', false, (SELECT id FROM accounts WHERE code = '52')),
('525', 'عمولات تحصيل إلكتروني', 'EXPENSE', true, (SELECT id FROM accounts WHERE code = '52')),
('5251', 'عمولة فودافون كاش', 'EXPENSE', false, (SELECT id FROM accounts WHERE code = '525')),
('5252', 'عمولة فوري', 'EXPENSE', false, (SELECT id FROM accounts WHERE code = '525')),
('5253', 'عمولة تحويلات بنكية', 'EXPENSE', false, (SELECT id FROM accounts WHERE code = '525')),

('53', 'المصروفات الإدارية والعمومية', 'EXPENSE', true, (SELECT id FROM accounts WHERE code = '5')),
('531', 'الرواتب والأجور', 'EXPENSE', false, (SELECT id FROM accounts WHERE code = '53')),
('5311', 'بدلات وانتقالات', 'EXPENSE', false, (SELECT id FROM accounts WHERE code = '53')),
('5312', 'مكافآت وحوافز', 'EXPENSE', false, (SELECT id FROM accounts WHERE code = '53')),
('532', 'إيجار مقرات إدارية', 'EXPENSE', false, (SELECT id FROM accounts WHERE code = '53')),
('533', 'إهلاك الأصول الثابتة', 'EXPENSE', false, (SELECT id FROM accounts WHERE code = '53')),
('534', 'رسوم ومصروفات بنكية', 'EXPENSE', false, (SELECT id FROM accounts WHERE code = '53')),
('535', 'كهرباء ومياه وغاز', 'EXPENSE', false, (SELECT id FROM accounts WHERE code = '53')),
('536', 'اتصالات وإنترنت', 'EXPENSE', false, (SELECT id FROM accounts WHERE code = '53')),
('537', 'صيانة وإصلاح', 'EXPENSE', false, (SELECT id FROM accounts WHERE code = '53')),
('538', 'أدوات مكتبية ومطبوعات', 'EXPENSE', false, (SELECT id FROM accounts WHERE code = '53')),
('539', 'ضيافة واستقبال', 'EXPENSE', false, (SELECT id FROM accounts WHERE code = '53')),
('541', 'تسوية عجز الصندوق', 'EXPENSE', false, (SELECT id FROM accounts WHERE code = '53')),
('542', 'إكراميات', 'EXPENSE', false, (SELECT id FROM accounts WHERE code = '53')),
('543', 'مصاريف نظافة', 'EXPENSE', false, (SELECT id FROM accounts WHERE code = '53'));

COMMIT;
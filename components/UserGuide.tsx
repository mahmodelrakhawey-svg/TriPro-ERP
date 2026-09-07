import React, { useState, useMemo } from 'react';
import { 
  BookOpen, Search, HelpCircle, FileText, Users, ShoppingCart, Truck, 
  Package, Wallet, Settings, Database, Heart, ShieldCheck, 
  Layers, UtensilsCrossed, HardHat, RefreshCw, Printer, 
  ChevronDown, ChevronUp, Sparkles, CheckCircle2, AlertTriangle, 
  Lightbulb, ArrowRight, ExternalLink, Activity, Lock, Landmark, 
  Scale, FileSpreadsheet, Trash2, SlidersHorizontal, KeyRound,
  Compass
} from 'lucide-react';
import { Link } from 'react-router-dom';

interface GuideQuickLink {
  label: string;
  path: string;
}

interface GuideTopic {
  id: string;
  category: 'core' | 'finance' | 'operations' | 'industry' | 'admin';
  title: string;
  badge?: string;
  icon: any;
  color: string;
  summary: string;
  keywords: string[];
  linkPath: string;
  quickLinks: GuideQuickLink[];
  steps?: string[];
  tips?: string[];
  warnings?: string[];
}

const guideTopics: GuideTopic[] = [
  {
    id: 'getting-started',
    category: 'core',
    title: '🚀 البداية السريعة والتهيئة الأولى للمنشأة',
    badge: 'خطوة أولى',
    icon: HelpCircle,
    color: 'from-blue-500 to-indigo-600',
    summary: 'خطوات إعداد المنشأة وضبط البيانات الأساسية لبدء العمل في أقل من 15 دقيقة.',
    keywords: ['بداية', 'تهيئة', 'إعدادات', 'شعار', 'عملة', 'ضريبة', 'بيانات الشركة'],
    linkPath: '/settings',
    quickLinks: [
      { label: 'إعدادات المنشأة والضرائب', path: '/settings' },
      { label: 'دليل الحسابات', path: '/accounts' },
      { label: 'مركز ترحيل واستيراد البيانات', path: '/data-migration' },
      { label: 'إدارة المستخدمين', path: '/users' }
    ],
    steps: [
      'الدخول إلى صفحة (الإعدادات): ضبط اسم المنشأة، الشعار، الرقم الضريبي، والعملة الافتراضية.',
      'مراجعة وتخصيص دليل الحسابات (شجرة الحسابات) وربط الخزن والحسابات البنكية.',
      'إدخال الفروع والمستودعات ومصادر الصرف من موديول المخازن.',
      'استيراد أو إدخال بيانات العملاء والموردين وقوائم الأصناف.',
      'تسجيل الأرصدة الافتتاحية عبر (مركز ترحيل البيانات) لبدء العمل المحاسبي المتزن.'
    ],
    tips: [
      'استخدم مركز ترحيل البيانات لاستيراد ملفات Excel الجاهزة بدلاً من الإدخال اليدوي الفردي.',
      'تأكد من ضبط معدل ضريبة القيمة المضافة (14% أو 15%) من شاشة إعدادات الضرائب.'
    ]
  },
  {
    id: 'accounting-gl',
    category: 'finance',
    title: '📑 المحاسبة العامة وشجرة الحسابات والقيود',
    badge: 'القلب المالي',
    icon: Scale,
    color: 'from-emerald-500 to-teal-700',
    summary: 'إدارة الدورة المحاسبية المتكاملة، قيود اليومية، ميزان المراجعة، والقوائم الختامية.',
    keywords: ['قيود', 'يومية', 'أستاذ', 'ميزان مراجعة', 'قائمة دخل', 'ميزانية', 'دليل الحسابات', 'ترحيل'],
    linkPath: '/general-journal',
    quickLinks: [
      { label: 'دفتر اليومية العامة', path: '/general-journal' },
      { label: 'دليل الحسابات', path: '/accounts' },
      { label: 'قيد يومية جديد', path: '/journal' },
      { label: 'الأستاذ العام', path: '/ledger' },
      { label: 'ميزان المراجعة المتقدم', path: '/trial-balance-advanced' },
      { label: 'قائمة الدخل', path: '/income-statement' },
      { label: 'الميزانية العمومية', path: '/balance-sheet' },
      { label: 'إقفال السنة المالية', path: '/fiscal-year-closing' }
    ],
    steps: [
      'دليل الحسابات الشجري: هيكلة وتصنيف الحسابات إلى 5 مجموعات رئيسية (أصول، خصوم، حقوق ملكية، إيرادات، مصروفات).',
      'القيود اليومية الآلية: يولد النظام قيوداً متزنة تلقائياً عند اعتماد فواتير البيع، الشراء، الصرف، والقبض.',
      'القيود اليدوية والتسويات: إنشاء قيود مركبة متعددة الأطراف مع إرفاق المستندات الداعمة.',
      'الترحيل المحاسبي (Post GL): مراجعة القيود في شاشة القيود غير المرحلة وترحيلها للأستاذ العام.',
      'إقفال السنة المالية: أداة إقفال السنة وترحيل صافي النتيجة لحساب الأرباح المبقاة (32) وتدوير الأرصدة.'
    ],
    tips: [
      'يدعم النظام التوجيه المحاسبي التلقائي (Automatic Account Mapping) لكل موديول في النظام.',
      'يمكنك استعراض ميزان المراجعة بالمجاميع والأرصدة مع إمكانية النقر على أي حساب لكشف حركته التفصيلية.'
    ],
    warnings: [
      'لا يمكن حذف أو تعديل أي قيد مرحل إلا بعد فك ترحيله بمعرفة المشرف المعتمد، ويتم توثيق ذلك في سجلات الأمان.'
    ]
  },
  {
    id: 'treasury-banking',
    category: 'finance',
    title: '💰 الخزينة، البنوك، وحافظة الشيكات البنكية',
    badge: 'السيولة والشيكات',
    icon: Landmark,
    color: 'from-amber-500 to-yellow-600',
    summary: 'التحكم بالتدفقات النقدية، سندات القبض والصرف، التحويلات، ودورة حياة الشيكات.',
    keywords: ['خزينة', 'بنك', 'شيكات', 'سند قبض', 'سند صرف', 'تحويل', 'تحصيل', 'ارتداد'],
    linkPath: '/receipt-vouchers-list',
    quickLinks: [
      { label: 'سندات القبض', path: '/receipt-vouchers-list' },
      { label: 'سند قبض جديد', path: '/receipt-voucher' },
      { label: 'سندات الصرف', path: '/payment-vouchers-list' },
      { label: 'سند صرف جديد', path: '/payment-voucher' },
      { label: 'حافظة الشيكات', path: '/cheques' },
      { label: 'التحويل بين الخزن والبنوك', path: '/transfer' },
      { label: 'المطابقة والتسوية البنكية', path: '/bank-reconciliation' }
    ],
    steps: [
      'سندات القبض (Receipts): إثبات تحصيل مبالغ من العملاء نقداً أو بشيك أو بتحويل بنكي.',
      'سندات الصرف (Payments): صرف مستحقات الموردين وسداد المصروفات التشغيلية والنثرية.',
      'حافظة الشيكات (Cheque Vault): إدارة شيكات القبض تحت التحصيل ومتابعة تواريخ الاستحقاق.',
      'تحصيل / رفض الشيكات: إثبات تحصيل الشيك وإيداعه بالبنك أو إثبات ارتداده (Bounce) وتحديث حساب العميل.',
      'التحويل بين الخزائن والبنوك: نقل النقدية بين الفروع مع إثبات قيد التحويل المالي التلقائي.'
    ],
    tips: [
      'شاشة الشيكات تفرز لك الشيكات المستحقة هذا الأسبوع لتفادي أي تأخير في إيداعها لدى البنك.'
    ]
  },
  {
    id: 'sales-einvoicing',
    category: 'operations',
    title: '🛍️ المبيعات والعملاء والفاتورة الإلكترونية',
    badge: 'ETA & ZATCA',
    icon: ShoppingCart,
    color: 'from-blue-600 to-indigo-700',
    summary: 'دورة المبيعات الشاملة، عروض الأسعار، نقاط البيع، والربط اللحظي مع مصلحة الضرائب.',
    keywords: ['مبيعات', 'فواتير', 'عملاء', 'عروض أسعار', 'ضرائب', 'فاتورة إلكترونية', 'ZATCA', 'ETA', 'QR Code'],
    linkPath: '/invoices-list',
    quickLinks: [
      { label: 'فواتير المبيعات', path: '/invoices-list' },
      { label: 'إصدار فاتورة جديدة', path: '/sales-invoice' },
      { label: 'عروض الأسعار', path: '/quotations-list' },
      { label: 'قاعدة بيانات العملاء', path: '/customers' },
      { label: 'كشف حساب عميل', path: '/customer-statement' },
      { label: 'مرتجعات المبيعات', path: '/sales-return' },
      { label: 'تقارير المبيعات والأرباح', path: '/sales-reports' }
    ],
    steps: [
      'عروض الأسعار (Quotations): تصميم عروض أسعار تفصيلية وتحويلها لفواتير مبيعات بضغطة زر.',
      'فواتير المبيعات: إصدار الفواتير النقدية والآجلة مع تطبيق الخصومات وحساب الضريبة آلياً.',
      'الربط مع الفاتورة الإلكترونية المصرية (ETA): إرسال الفواتير لمصلحة الضرائب والتحقق من صحتها وتوليد الـ UUID.',
      'الفوترة الإلكترونية السعودية (ZATCA Phase 2): ختم الفواتير برمز الاستجابة السريعة المعتمد (Cryptographic QR).',
      'مرتجعات المبيعات (Credit Notes): إصدار إشعار دائن وتسوية التأثير المالي ورصيد المخزون فوراً.'
    ],
    warnings: [
      'تغيير السعر يدوياً أو منح خصم استثنائي يتطلب صلاحية مخصصة من لوحة الأدوار والصلاحيات.'
    ]
  },
  {
    id: 'purchases-vendors',
    category: 'operations',
    title: '🚚 المشتريات والموردين ودورة التوريد',
    badge: 'التوريد والمخزون',
    icon: Truck,
    color: 'from-orange-500 to-red-600',
    summary: 'إدارة أوامر الشراء، فواتير المشتريات، متابعة مديونيات الموردين، واحتساب تكلفة الوارد.',
    keywords: ['مشتريات', 'موردين', 'أوامر شراء', 'فواتير شراء', 'مرتجع مشتريات', 'استلام'],
    linkPath: '/purchase-invoices-list',
    quickLinks: [
      { label: 'فواتير المشتريات', path: '/purchase-invoices-list' },
      { label: 'فاتورة شراء جديدة', path: '/purchase-invoice' },
      { label: 'أوامر الشراء (PO)', path: '/purchase-order-list' },
      { label: 'سجل الموردين', path: '/suppliers' },
      { label: 'كشف حساب مورد', path: '/supplier-statement' },
      { label: 'مرتجعات المشتريات', path: '/purchase-return' },
      { label: 'تقارير المشتريات', path: '/purchase-reports' }
    ],
    steps: [
      'أوامر الشراء (Purchase Orders): إصدار أوامر التوريد للمورد ومتابعة حالة الاستلام الجزئي أو الكلي.',
      'فواتير المشتريات: إثبات استلام البضاعة في المستودع وتحديث متوسط تكلفة الشراء (WAC) تلقائياً.',
      'كشوف حساب الموردين: تقارير أعمار الديون وجداول سداد الدفعات والمستحقات المالية.',
      'مرتجعات المشتريات (Debit Notes): إثبات رد البضاعة للمورد وخفض المديونية والتكلفة المخزنية.'
    ]
  },
  {
    id: 'inventory-wac',
    category: 'operations',
    title: '📦 المخازن، الأصناف، ومحرك التكلفة WAC',
    badge: 'المخزون الدقيق',
    icon: Package,
    color: 'from-purple-500 to-indigo-700',
    summary: 'إدارة بطاقات الأصناف، الجرد الدوري والمفاجئ، التحويلات، ومحرك إعادة احتساب التكاليف.',
    keywords: ['مخازن', 'أصناف', 'جرد', 'تسويات', 'تحويلات', 'WAC', 'متوسط مرجح', 'باركود', 'FEFO'],
    linkPath: '/products',
    quickLinks: [
      { label: 'قائمة الأصناف والمنتجات', path: '/products' },
      { label: 'إدارة المستودعات', path: '/warehouses' },
      { label: 'التحويل بين المستودعات', path: '/stock-transfer' },
      { label: 'محضر الجرد الفعلي', path: '/inventory-count' },
      { label: 'التسويات المخزنية', path: '/stock-adjustment' },
      { label: 'إثبات الهالك والتالف', path: '/wastage' },
      { label: 'بطاقة حركة الصنف', path: '/stock-card' }
    ],
    steps: [
      'بطاقة الصنف المتطورة: تعريف الباركود، وحدات القياس المتعددة (UOM)، أسعار البيع والشراء، ونقاط إعادة الطلب.',
      'التحويل بين المستودعات: نقل الأصناف بين الفروع مع تتبع أوامر الشحن والاستلام.',
      'الجرد والتسويات المخزنية: إثبات الفروقات الجردية وتوليد قيود العجز والزيادة المحاسبية آلياً.',
      'إدارة الهالك والتالف (Wastage): تسجيل التوالف وتحديد أسبابها ومراكز التكلفة المسؤولة.',
      'محرك WAC Recalculation: إعادة احتساب متوسط التكلفة المرجح لجميع الأصناف تاريخياً بضغطة زر واحدة من الإعدادات.'
    ],
    tips: [
      'يدعم النظام تتبع التشغيلات وتواريخ الصلاحية (FEFO - First Expire, First Out) للأدوية والمواد الغذائية.'
    ]
  },
  {
    id: 'manufacturing-bom',
    category: 'industry',
    title: '⚙️ التصنيع وقوائم المقادير وأوامر التشغيل',
    badge: 'المنظومة الصناعية',
    icon: SlidersHorizontal,
    color: 'from-slate-700 to-slate-900',
    summary: 'شجرة المواد (BOM)، مراحل الإنتاج، أوامر التشغيل، واحتساب تكلفة المنتج التام وفروق التكلفة.',
    keywords: ['تصنيع', 'إنتاج', 'BOM', 'شجرة مواد', 'خامات', 'أوامر تشغيل', 'تكاليف صناعية', 'WIP'],
    linkPath: '/mfg/dashboard',
    quickLinks: [
      { label: 'لوحة تحكم الإنتاج', path: '/mfg/dashboard' },
      { label: 'أوامر التشغيل والعمل', path: '/mfg/orders' },
      { label: 'شجرة المواد ومسار الإنتاج BOM', path: '/mfg/routing-bom' },
      { label: 'رقابة الجودة (QC)', path: '/mfg/quality-control' },
      { label: 'إغلاق فترات التكلفة', path: '/mfg/closing' }
    ],
    steps: [
      'قوائم المواد والمقادير (Bill of Materials): تحديد كميات الخامات وساعات العمل والتكاليف الصناعية غير المباشرة.',
      'إطلاق أوامر التشغيل (Production Orders): جدولة خطوط الإنتاج والكميات المستهدفة وتواريخ التسليم.',
      'صرف الخامات للمصنع: خصم المواد الخام من مستودع الخامات وتحميلها على حساب الإنتاج تحت التشغيل (WIP).',
      'استلام المنتج التام: إضافة المنتجات الجاهزة لمستودع التام وتسوية تكلفة التصنيع الفعلية ضد المقدرة.'
    ]
  },
  {
    id: 'restaurant-pos',
    category: 'industry',
    title: '🍽️ نقاط البيع والمطاعم والكافيهات وشاشة المطبخ',
    badge: 'POS & KDS',
    icon: UtensilsCrossed,
    color: 'from-amber-600 to-rose-700',
    summary: 'إدارة الطاولات، التيك أواي، الدليفري، شاشة المطبخ KDS، وفتح وإغلاق شفتات الكاشير.',
    keywords: ['مطعم', 'كافيه', 'طاولات', 'كاشير', 'شفت', 'KDS', 'مطبخ', 'تقسيم شيك', 'وجبات'],
    linkPath: '/pos',
    quickLinks: [
      { label: 'شاشة نقطة البيع (POS)', path: '/pos' },
      { label: 'شاشة المطبخ (KDS)', path: '/kds' },
      { label: 'إحصائيات وتقارير المطعم', path: '/restaurant-analytics' },
      { label: 'جرد نهاية اليوم بالمطبخ', path: '/kitchen-end-day' }
    ],
    steps: [
      'فتح وإغلاق الشفت: تسجيل الرصيد الافتتاحي للعهدة، وتوريد النقدية ومطابقة العجز والزيادة عند الإغلاق.',
      'إدارة الطاولات والجلسات: حجز الطاولات، نقل الطلبات، تقسيم الشيك (Split Bill)، ودمج الحسابات.',
      'شاشة المطبخ الذكية (KDS): إرسال الطلبات للمطبخ لحظياً مع مؤقت تحضير وتنبيهات صوتية وبصرية.',
      'الخصم والضيافة وإلغاء الأصناف (Void Items): حماية النظام بإلزام تسجيل سبب الإلغاء مع إشعار فوري للمشرف.'
    ]
  },
  {
    id: 'construction-projects',
    category: 'industry',
    title: '🏗️ المقاولات وإدارة المشاريع والمستخلصات',
    badge: 'المقاولات والمشاريع',
    icon: HardHat,
    color: 'from-yellow-600 to-amber-800',
    summary: 'مقايسات الأعمال (BOQ)، مستخلصات المالك، مقاولي الباطن، مراكز التكلفة، وإغلاق المشاريع.',
    keywords: ['مقاولات', 'مشاريع', 'مستخلص', 'مقايسة', 'BOQ', 'مقاول باطن', 'محتجز ضمان', 'تشوينات'],
    linkPath: '/construction',
    quickLinks: [
      { label: 'إدارة المشاريع والمقايسات', path: '/construction' },
      { label: 'مقاولي الباطن', path: '/subcontractors' },
      { label: 'لوحة تحليلات المشاريع', path: '/construction/analytics' },
      { label: 'تقرير تكاليف العمالة', path: '/construction/labor-reports' }
    ],
    steps: [
      'تعريف المشروع وبنود المقايسة (BOQ): تسجيل بنود الأعمال، الكميات التعاقدية، وفئات الأسعار.',
      'مستخلصات المالك (Progress Billing): احتساب نسب الإنجاز التراكمية وخصم الدفعة المقدمة ومحتجز الضمان.',
      'مستخلصات مقاولي الباطن: إثبات مستحقات المقاولين وخصم التأمينات والتشوينات آلياً.',
      'إغلاق المشروع وتقرير الربحية: مقارنة الإيرادات المعتمدة بالتكاليف الفعلية وقفل مركز التكلفة.'
    ]
  },
  {
    id: 'hims-healthcare',
    category: 'industry',
    title: '🏥 المنظومة الطبية الشاملة والمستشفيات',
    badge: 'HIMS & EMR',
    icon: Heart,
    color: 'from-rose-500 to-pink-700',
    summary: 'الملف الطبي الإلكتروني، العيادات، الطوارئ، العمليات، الصيدلية، ومطالبات التأمين XML.',
    keywords: ['مستشفى', 'عيادة', 'طبيب', 'ملف طبي', 'EMR', 'تأمين', 'صيدلية', 'مختبر', 'أشعة', 'تنويم'],
    linkPath: '/hims/patients',
    quickLinks: [
      { label: 'ملفات المرضى والاستقبال', path: '/hims/patients' },
      { label: 'المكتب الطبي للطبيب', path: '/hims/doctor-desktop' },
      { label: 'حجز المواعيد والعيادات', path: '/hims/appointments' },
      { label: 'الصيدلية وصرف الأدوية', path: '/hims/pharmacy' },
      { label: 'المختبر والتحاليل', path: '/hims/lab' },
      { label: 'قسم الأشعة التشخيصية', path: '/hims/radiology' },
      { label: 'محطة التمريض والأسرة', path: '/hims/nurse-station' },
      { label: 'مطالبات التأمين الطبي', path: '/hims/insurance-claims' }
    ],
    steps: [
      'الاستقبال وحجز المواعيد: فتح الملف الطبي للمريض، التحقق من التأمين، وتوجيه المريض للعيادة.',
      'شاشة الطبيب والتشخيص: كتابة الملاحظات السريرية (SOAP)، طلب الفحوصات، والوصفة الطبية الإلكترونية.',
      'الصيدلية الداخلية وصرف الأدوية: صرف الوصفات وخصمها من صيدلية المستشفى وإضافتها لفاتورة المريض.',
      'المختبر والأشعة: استلام طلبات التحاليل وإدخال نتائج الفحوصات واعتمادها رقمياً.',
      'مطالبات التأمين وتصدير XML: تجميع مطالبات شركات التأمين وتصديرها بصيغة XML المعتمدة لتسريع السداد.'
    ]
  },
  {
    id: 'rbac-security',
    category: 'admin',
    title: '🛡️ إدارة الأدوار والصلاحيات وسجلات الرقابة',
    badge: 'Enterprise Security',
    icon: ShieldCheck,
    color: 'from-red-600 to-rose-800',
    summary: 'عزل الصلاحيات، الرقابة على كسر الأسعار والبيع بالسالب، وتتبع سجلات التدقيق (Audit Trail).',
    keywords: ['صلاحيات', 'أدوار', 'مستخدمين', 'رقابة', 'أمان', 'حذف', 'سجلات أمان', 'Audit Trail', 'RBAC'],
    linkPath: '/permissions',
    quickLinks: [
      { label: 'إدارة الأدوار والصلاحيات', path: '/permissions' },
      { label: 'سجلات الأمان والرقابة (Audit Trail)', path: '/security-logs' },
      { label: 'إدارة حسابات المستخدمين', path: '/users' }
    ],
    steps: [
      'تخصيص الأدوار: استخدام القوالب الجاهزة (كاشير، محاسب، أمين مخزن، مدير مالي) أو إنشاء أدوار مخصصة.',
      'الصلاحيات الحساسة (🚨): عزل صلاحيات مسح السجلات، كسر الأسعار، وتجاوز الحدود الائتمانية.',
      'سجلات الأمان والرقابة (Audit Trail): رصد كافة العمليات الحساسة وتصنيفها (حرج، تحذيري، معلوماتي).',
      'فحص الفروقات (Old vs New Diff): استعراض القيم السابقة والجديدة لأي تعديل أو حذف في النظام.'
    ]
  },
  {
    id: 'data-migration-trash',
    category: 'admin',
    title: '🔄 مركز ترحيل البيانات وسلة المحذوفات والنسخ الاحتياطي',
    badge: 'استيراد وأمان',
    icon: Database,
    color: 'from-indigo-600 to-purple-800',
    summary: 'استيراد البيانات من Excel، استعادة المحذوفات الآمنة، وإنشاء واستعادة النسخ الاحتياطية JSON.',
    keywords: ['استيراد', 'ترحيل بيانات', 'سلة المحذوفات', 'نسخ احتياطي', 'استعادة', 'Excel', 'JSON'],
    linkPath: '/data-migration',
    quickLinks: [
      { label: 'مركز ترحيل واستيراد البيانات', path: '/data-migration' },
      { label: 'سلة المحذوفات الآمنة', path: '/recycle-bin' },
      { label: 'النسخ الاحتياطي السحابي والمحلي', path: '/settings' }
    ],
    steps: [
      'مركز ترحيل البيانات: استيراد دليل الحسابات، الأصناف، العملاء، الموردين، والأصول من Excel مع توليد القيود الافتتاحية آلياً.',
      'سلة المحذوفات الآمنة (Recycle Bin): استعادة العناصر المحذوفة، مع تفعيل درع الحماية المحاسبية لمنع الحذف النهائي للبيانات المرتبطة بقيود.',
      'النسخ الاحتياطي السحابي والمحلي: إنشاء نسخة كاملة وتنزيل ملف JSON لجهازك، أو استعادة المنظومة بضغطة زر واحدة.'
    ]
  }
];

const UserGuide = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [openSectionId, setOpenSectionId] = useState<string | null>('getting-started');

  const categories = [
    { id: 'all', label: 'كافة المواضيع والأقسام' },
    { id: 'core', label: '🚀 البداية والإعداد' },
    { id: 'finance', label: '💰 المحاسبة والمالية' },
    { id: 'operations', label: '📦 التجارة والمخازن' },
    { id: 'industry', label: '🏭 الحلول القطاعية المتخصصة' },
    { id: 'admin', label: '🛡️ الأمان والترحيل' },
  ];

  const filteredTopics = useMemo(() => {
    return guideTopics.filter(topic => {
      if (selectedCategory !== 'all' && topic.category !== selectedCategory) {
        return false;
      }

      if (!searchTerm.trim()) return true;
      const term = searchTerm.toLowerCase().trim();
      const matchTitle = topic.title.toLowerCase().includes(term);
      const matchSummary = topic.summary.toLowerCase().includes(term);
      const matchKeywords = topic.keywords.some(k => k.toLowerCase().includes(term));
      const matchSteps = topic.steps?.some(s => s.toLowerCase().includes(term));
      const matchTips = topic.tips?.some(t => t.toLowerCase().includes(term));
      const matchLinks = topic.quickLinks.some(l => l.label.toLowerCase().includes(term));

      return matchTitle || matchSummary || matchKeywords || matchSteps || matchTips || matchLinks;
    });
  }, [searchTerm, selectedCategory]);

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="max-w-6xl mx-auto space-y-8 animate-in fade-in pb-20">
      
      {/* 👑 واجهة الترحيب والبحث العالمية */}
      <div className="relative overflow-hidden bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 text-white rounded-[36px] p-8 md:p-12 shadow-2xl border border-indigo-500/20">
        <div className="absolute top-0 left-0 w-96 h-96 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 right-0 w-96 h-96 bg-rose-500/10 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 max-w-3xl mx-auto text-center space-y-6">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-white/10 backdrop-blur-md border border-white/15 text-indigo-200 text-xs font-bold shadow-xs">
            <Sparkles size={14} className="text-amber-400" />
            <span>الدليل المرجعي والموسوعة التشغيلية الشاملة لـ TriPro ERP</span>
          </div>

          <h1 className="text-3xl md:text-5xl font-black tracking-tight text-white leading-tight">
            دليل استخدام المنظومة المؤسسية
          </h1>

          <p className="text-slate-300 text-sm md:text-base leading-relaxed">
            شرح تفصيلي معتمد لكافة الموديولات المالية، التجارية، الصناعية، والطبية مع روابط انتقال سريعة ومباشرة.
          </p>

          {/* حقل البحث الذكي الفوري */}
          <div className="relative max-w-2xl mx-auto pt-2">
            <Search className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400" size={22} />
            <input
              type="text"
              placeholder="ابحث عن أي شاشة أو عملية (فواتير، شيكات، جرد، مستخلصات، صلاحيات، ترحيل، WAC)..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pr-12 pl-12 py-4 bg-white text-slate-900 rounded-2xl text-sm md:text-base font-bold shadow-xl focus:outline-none focus:ring-4 focus:ring-indigo-400 placeholder:text-slate-400 placeholder:font-normal"
            />
            {searchTerm && (
              <button
                onClick={() => setSearchTerm('')}
                className="absolute left-4 top-1/2 -translate-y-1/2 text-xs font-black text-slate-400 hover:text-slate-700 bg-slate-100 px-2 py-1 rounded-lg"
              >
                مسح
              </button>
            )}
          </div>
        </div>

        {/* أزرار الإجراءات السريعة */}
        <div className="relative z-10 flex flex-wrap items-center justify-between gap-4 mt-8 pt-8 border-t border-white/10 text-xs">
          <div className="flex items-center gap-4 text-slate-300 font-medium">
            <span className="flex items-center gap-1.5"><CheckCircle2 size={14} className="text-emerald-400" /> 12 موديول متكامل</span>
            <span className="flex items-center gap-1.5"><ShieldCheck size={14} className="text-indigo-400" /> روابط تنقل سريعة ومباشرة</span>
          </div>

          <button
            onClick={handlePrint}
            className="flex items-center gap-2 bg-white/10 hover:bg-white/20 text-white px-4 py-2 rounded-xl backdrop-blur-md border border-white/20 font-bold transition-all"
            title="طباعة الدليل أو حفظه بصيغة PDF"
          >
            <Printer size={15} />
            <span>طباعة الدليل / PDF</span>
          </button>
        </div>
      </div>

      {/* 🧭 تبويبات الفئات */}
      <div className="flex gap-2 overflow-x-auto pb-2 border-b border-slate-200 scrollbar-none">
        {categories.map(cat => (
          <button
            key={cat.id}
            onClick={() => setSelectedCategory(cat.id)}
            className={`px-5 py-2.5 rounded-2xl font-bold text-xs md:text-sm whitespace-nowrap transition-all ${
              selectedCategory === cat.id
                ? 'bg-indigo-600 text-white shadow-md shadow-indigo-200'
                : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
            }`}
          >
            {cat.label}
          </button>
        ))}
      </div>

      {/* 📜 محتوى الدليل وبطاقات الشرح التفاعلية */}
      <div className="space-y-4">
        {filteredTopics.length === 0 ? (
          <div className="bg-white rounded-3xl p-16 text-center border border-slate-200 shadow-sm space-y-3">
            <BookOpen size={48} className="mx-auto text-slate-300 stroke-[1.5]" />
            <h3 className="text-lg font-bold text-slate-700">لم يتم العثور على نتائج تطابق بحثك</h3>
            <p className="text-xs text-slate-400">جرب كتابة كلمات مفتاحية أخرى مثل: فواتير، شيكات، مستودع، قيود، صلاحيات.</p>
            <button
              onClick={() => { setSearchTerm(''); setSelectedCategory('all'); }}
              className="mt-2 text-indigo-600 text-xs font-black hover:underline"
            >
              إعادة ضبط البحث
            </button>
          </div>
        ) : (
          filteredTopics.map((topic) => {
            const isOpen = openSectionId === topic.id;
            const Icon = topic.icon;

            return (
              <div
                key={topic.id}
                className="bg-white rounded-3xl border border-slate-200 shadow-xs hover:shadow-md transition-all overflow-hidden"
              >
                {/* رأس البطاقة */}
                <button
                  onClick={() => setOpenSectionId(isOpen ? null : topic.id)}
                  className="w-full text-right p-6 flex items-start md:items-center justify-between gap-4 bg-white hover:bg-slate-50/70 transition-colors"
                >
                  <div className="flex items-start md:items-center gap-4">
                    <div className={`p-3.5 rounded-2xl bg-gradient-to-br ${topic.color} text-white shadow-md shrink-0`}>
                      <Icon size={24} />
                    </div>

                    <div>
                      <div className="flex items-center gap-2.5 flex-wrap">
                        <h3 className="text-lg md:text-xl font-black text-slate-900">
                          {topic.title}
                        </h3>
                        {topic.badge && (
                          <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-slate-100 text-slate-700 border border-slate-200">
                            {topic.badge}
                          </span>
                        )}
                      </div>
                      <p className="text-slate-500 text-xs md:text-sm mt-1 leading-relaxed">
                        {topic.summary}
                      </p>
                    </div>
                  </div>

                  <div className="p-2 rounded-xl bg-slate-100 text-slate-400 shrink-0 mt-1 md:mt-0">
                    {isOpen ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
                  </div>
                </button>

                {/* التفاصيل الممتدة */}
                {isOpen && (
                  <div className="p-6 md:p-8 pt-2 border-t border-slate-100 bg-slate-50/50 space-y-6 animate-in slide-in-from-top-2">
                    
                    {/* 🚀 شريط الروابط السريعة للشاشات الفرعية */}
                    {topic.quickLinks && topic.quickLinks.length > 0 && (
                      <div className="p-4 bg-indigo-50/50 border border-indigo-100 rounded-2xl space-y-2.5">
                        <div className="flex items-center gap-2 text-indigo-900 font-bold text-xs">
                          <Compass size={16} className="text-indigo-600" />
                          <span>شاشات وصفحات هذا الموديول في النظام:</span>
                        </div>
                        <div className="flex flex-wrap gap-2 pt-1">
                          {topic.quickLinks.map((ql, idx) => (
                            <Link
                              key={idx}
                              to={ql.path}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white hover:bg-indigo-600 hover:text-white text-slate-700 border border-indigo-200/80 rounded-xl text-xs font-bold transition-all shadow-2xs group"
                            >
                              <span>{ql.label}</span>
                              <ExternalLink size={12} className="text-slate-400 group-hover:text-white" />
                            </Link>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* خطوات العمل المتسلسلة */}
                    {topic.steps && (
                      <div className="space-y-3">
                        <h4 className="text-xs font-black text-slate-700 uppercase tracking-wider flex items-center gap-2">
                          <CheckCircle2 size={16} className="text-indigo-600" />
                          دورة العمل والخطوات التشغيلية:
                        </h4>
                        <div className="space-y-2 mr-2">
                          {topic.steps.map((step, idx) => (
                            <div key={idx} className="flex items-start gap-3 bg-white p-3.5 rounded-2xl border border-slate-200/80 shadow-2xs">
                              <span className="w-6 h-6 rounded-full bg-indigo-50 text-indigo-700 text-xs font-black flex items-center justify-center shrink-0 mt-0.5">
                                {idx + 1}
                              </span>
                              <p className="text-xs md:text-sm text-slate-700 font-medium leading-relaxed">
                                {step}
                              </p>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* نصائح وممارسات ذهبية */}
                    {topic.tips && (
                      <div className="p-4 bg-emerald-50/70 border border-emerald-200 rounded-2xl space-y-2">
                        <div className="flex items-center gap-2 text-emerald-800 font-bold text-xs">
                          <Lightbulb size={16} className="text-emerald-600" />
                          <span>نصيحة وخبرة احترافية (Pro Tip):</span>
                        </div>
                        <ul className="space-y-1 mr-5 list-disc text-xs text-emerald-700 leading-relaxed font-medium">
                          {topic.tips.map((tip, i) => (
                            <li key={i}>{tip}</li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {/* تحذيرات أمان ومحاسبة */}
                    {topic.warnings && (
                      <div className="p-4 bg-rose-50/70 border border-rose-200 rounded-2xl space-y-2">
                        <div className="flex items-center gap-2 text-rose-800 font-bold text-xs">
                          <AlertTriangle size={16} className="text-rose-600" />
                          <span>تنبيه أمان ورقابة مالية:</span>
                        </div>
                        <ul className="space-y-1 mr-5 list-disc text-xs text-rose-700 leading-relaxed font-medium">
                          {topic.warnings.map((warn, i) => (
                            <li key={i}>{warn}</li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {/* زر الانتقال المباشر للموديول الرئيسي */}
                    <div className="pt-2 flex justify-end">
                      <Link
                        to={topic.linkPath}
                        className="inline-flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2.5 rounded-xl font-bold text-xs shadow-md shadow-indigo-200 transition-all"
                      >
                        <span>الانتقال إلى شاشة الموديول الرئيسية</span>
                        <ArrowRight size={15} />
                      </Link>
                    </div>

                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* 📞 بطاقة الدعم الفني والاستشارات */}
      <div className="bg-white rounded-[32px] p-8 border border-slate-200 shadow-sm flex flex-col md:flex-row items-center justify-between gap-6">
        <div className="flex items-center gap-4 text-right">
          <div className="p-4 bg-indigo-50 text-indigo-600 rounded-2xl">
            <HelpCircle size={32} />
          </div>
          <div>
            <h3 className="text-lg font-black text-slate-800">هل تحتاج إلى استشارة محاسبية أو تدريب؟</h3>
            <p className="text-slate-500 text-xs mt-1">فريق الدعم الفني والخبراء المحاسبيين جاهزون لمساعدتك في أي استفسار.</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <a
            href="mailto:support@tripro.app"
            className="inline-flex items-center gap-2 bg-slate-900 hover:bg-black text-white px-6 py-3 rounded-xl font-bold text-xs transition-all shadow-md"
          >
            <span>مراسلة فريق الدعم</span>
            <ExternalLink size={14} />
          </a>
        </div>
      </div>

    </div>
  );
};

export default UserGuide;
/**
 * 🗺️ خريطة العناوين المعيارية لشاشات ومسارات النظام
 * TriPro ERP — utils/routeTitles.ts
 */

export const ROUTE_TITLES: Record<string, string> = {
  // 📊 لوحات القيادة والعامة
  '/': 'لوحة القيادة والتحكم الرئيسية',
  '/dashboard': 'لوحة القيادة والتحكم الرئيسية',
  '/cfo-dashboard': 'لوحة قيادة المدير المالي (CFO)',
  '/financial-ratios': 'التحليل المالي ومؤشرات الأداء',
  '/about': 'حول نظام TriPro ERP',
  '/profile': 'الملف الشخصي وإعدادات الحساب',
  '/admin/test-dashboard': 'لوحة الفحص والتشخيص الإداري',
  '/mobile': 'تطبيق الموبايل الميداني (PWA Companion)',

  // 📈 المبيعات والعملاء
  '/sales-invoice': 'فاتورة مبيعات جديدة',
  '/invoices-list': 'سجل فواتير المبيعات',
  '/eta-invoices': 'الفاتورة والإيصال الإلكتروني (منظومة الضرائب المصرية ETA)',
  '/recurring-invoices': 'الفواتير الدورية والاشتراكات المجدولة',
  '/quotations-new': 'إنشاء عرض سعر جديد',
  '/quotations-list': 'سجل عروض الأسعار',
  '/sales-order-new': 'أمر بيع وتعميد جديد',
  '/sales-orders': 'سجل أوامر البيع والتعميد',
  '/sales-return': 'تسجيل مرتجع مبيعات',
  '/sales-returns-list': 'سجل مرتجعات المبيعات',
  '/free-returns-report': 'تقرير المرتجعات الحرة (بدون فاتورة أصلية)',
  '/credit-note': 'إنشاء إشعار دائن جديد',
  '/credit-notes-list': 'سجل الإشعارات الدائنة',
  '/offer-beneficiaries': 'تقرير المستفيدين من العروض الترويجية',
  '/customers': 'إدارة حسابات وبيانات العملاء',
  '/customer-statement': 'كشف حساب عميل تفصيلي',
  '/customer-reconciliation': 'مطابقة ومصادقة أرصدة العملاء',
  '/customer-aging': 'تقرير أعمار ديون العملاء',
  '/item-sales-analysis': 'تحليل مبيعات وربحية الأصناف',
  '/reports/sales-by-user': 'تقرير مبيعات الكاشير والمستخدمين',
  '/sales-reports': 'مركز تقارير المبيعات الشاملة',

  // 🛒 المشتريات والموردين
  '/purchases/rfq': 'طلبات عروض الأسعار والمناقصات (RFQ)',
  '/purchase-invoice': 'فاتورة مشتريات جديدة',
  '/purchase-invoices-list': 'سجل فواتير المشتريات',
  '/purchase-order-new': 'أمر شراء جديد للمورد',
  '/purchase-order-list': 'سجل أوامر الشراء',
  '/purchases/auto-reorder': 'أوامر الشراء التلقائية (حد الأمان)',
  '/purchase-return': 'تسجيل مرتجع مشتريات',
  '/purchase-returns-list': 'سجل مرتجعات المشتريات',
  '/debit-note': 'إنشاء إشعار مدين للمورد',
  '/debit-notes-list': 'سجل الإشعارات المدينة للموردين',
  '/net-purchases-report': 'تقرير صافي المشتريات والخصومات',
  '/supplier-reconciliation': 'مطابقة ومصادقة أرصدة الموردين',
  '/supplier-balances': 'تقرير أرصدة الموردين الإجمالية',
  '/suppliers': 'إدارة حسابات وبيانات الموردين',
  '/supplier-statement': 'كشف حساب مورد تفصيلي',
  '/supplier-aging': 'تقرير أعمار ديون الموردين',
  '/purchases/vendor-contracts': 'عقود الموردين وحوافز البوانص (Rebates)',
  '/purchase-analysis': 'تحليل المشتريات وسلاسل الإمداد',
  '/purchase-reports': 'مركز تقارير المشتريات الشاملة',

  // 📦 المخازن وإدارة المخزون
  '/products': 'دليل الأصناف والمنتجات والخدمات',
  '/inventory/goods-receipt': 'محاضر الفحص والاستلام المخزني',
  '/inventory/pda-stocktaking': 'الجرد الميداني بالأجهزة الكفية (PDA)',
  '/inventory/expiry-radar': 'رادار متابعة تواريخ الصلاحية والتنبيهات',
  '/inventory/shelf-restock': 'تقرير إعادة ملء الأرفف ونقاط البيع',
  '/inventory/replenishment': 'التغذية التلقائية للمخازن والفروع',
  '/inventory/bin-locations': 'إدارة مواقع التخزين وعناوين الأرفف (WMS)',
  '/inventory/in-transit': 'البضاعة المحولة والواردة بالطريق',
  '/inventory-transfer': 'التحويل المخزني بين المستودعات',
  '/inventory-transfers-list': 'سجل تحويلات البضاعة بين المخازن',
  '/inventory-count': 'الجرد المخزني وتسوية الفروقات',
  '/inventory-adjustments-list': 'سجل تسويات الجرد المخزني',
  '/warehouse-items': 'تقرير أرصدة المخازن التفصيلي',
  '/wastage-report': 'تقرير الهوالك والتالف المخزني',
  '/stock-card': 'بطاقة حركة صنف (أستاذ المخزن)',
  '/reorder-levels': 'مراقبة حد إعادة الطلب ونواقص المخزون',
  '/inventory-valuation': 'تقييم المخزون المالي (متوسط التكلفة WAC)',
  '/units-of-measure': 'وحدات القياس والتحويلات المعيارية',

  // 🏛️ المحاسبة العامة والتقارير المالية
  '/general-journal': 'دفتر اليومية العامة',
  '/journal-entry': 'قيد يومية يدوي جديد',
  '/draft-journals': 'القيود المحاسبية المسودة (غير المرحلة)',
  '/accounts': 'دليل الحسابات المالي الشامل (COA)',
  '/ledger': 'دفتر الأستاذ العام',
  '/trial-balance': 'ميزان المراجعة المتقدم بالمجاميع والأرصدة',
  '/income-statement': 'قائمة الدخل الشامل (IFRS 18)',
  '/balance-sheet': 'قائمة المركز المالي والميزانية العمومية',
  '/changes-in-equity': 'قائمة التغير في حقوق الملكية',
  '/cash-flow-statement': 'قائمة التدفقات النقدية المعيارية',
  '/annual-report': 'كتاب التقرير المالي السنوي الموحد (IAS 1)',
  '/budget-manager': 'إدارة الموازنات التقديرية والتخطيط المالي',
  '/budget-variance': 'تقرير انحرافات الموازنة التقديرية',
  '/accounting/fiscal-closing': 'الإقفال المالي السنوي وترحيل الأرباح',
  '/accounting/fiscal-periods': 'إدارة وقفل الفترات المحاسبية',
  '/accounting/export': 'تصدير وأرشفة القيود اليومية المحاسبية',

  // 🏦 النقدية والبنوك والشيكات
  '/treasury': 'إدارة الخزائن النقدية والصناديق',
  '/bank-accounts': 'الحسابات المصرفية والأرصدة البنكية',
  '/receipt-voucher': 'سند قبض نقدي / بنكي',
  '/receipt-vouchers-list': 'سجل سندات القبض',
  '/payment-voucher': 'سند صرف نقدي / بنكي',
  '/payment-vouchers-list': 'سجل سندات الصرف',
  '/petty-cash': 'العهد النقدية والمصاريف النثرية',
  '/petty-cash-list': 'سجل تسويات العهد النقدية',
  '/incoming-cheques': 'حافظة الشيكات الواردة (تحت التحصيل)',
  '/outgoing-cheques': 'حافظة الشيكات الصادرة (أوراق الدفع)',
  '/bank-reconciliation': 'مذكرة التسوية البنكية ومطابقة الحساب',
  '/cash-shifts': 'ورديات الصناديق وتقفيل الكاش',
  '/banking/cheque-movement': 'تقرير مسار ودورة حياة الشيكات',
  '/banking/returned-cheques': 'تقرير الشيكات المرتدة والمرفوضة',

  // 👥 الموارد البشرية والرواتب (HR)
  '/hr/dashboard': 'لوحة قيادة الموارد البشرية',
  '/hr/employees': 'دليل وملفات الموظفين',
  '/hr/payroll': 'مسير ومسيرات الرواتب الشهرية',
  '/hr/advances': 'السلف النقدية والقروض الشخصية للموظفين',
  '/hr/leaves': 'إدارة الإجازات والأذونات والغياب',
  '/hr/attendance': 'سجل الحضور والانصراف والبصمات',
  '/hr/biometrics': 'ربط ومزامنة أجهزة البصمة الذكية',
  '/hr/shifts': 'إدارة الورديات وتوزيع جداول العمل',
  '/hr/penalties-rewards': 'لائحة الجزاءات والمكافآت التقديرية',
  '/hr/end-of-service': 'احتساب مكافأة نهاية الخدمة والمستحقات',
  '/hr/reports/payroll': 'تقرير تحليلي لمسيرات الرواتب والبدلات',
  '/hr/reports/statement': 'كشف حساب واستحقاقات موظف',
  '/hr/reports/general': 'تقارير الموارد البشرية الإحصائية',

  // 🏭 التصنيع والإنتاج وقوائم المواد
  '/manufacturing/dashboard': 'لوحة قيادة التصنيع ومؤشرات الإنتاج',
  '/manufacturing/work-orders': 'أوامر الشغل وأوامر الإنتاج (Work Orders)',
  '/manufacturing/batch-orders': 'أوامر التشغيل وتتبع الدفعات (Batches)',
  '/manufacturing/shop-floor': 'صالة التصنيع وتتبع خطوط الإنتاج (Shop Floor)',
  '/manufacturing/qc': 'مراقبة الجودة وفحص العينات (QC)',
  '/manufacturing/bom': 'قوائم المواد ومراحل التصنيع (BOM & Routing)',
  '/manufacturing/material-requests': 'أذون طلب وصرف خامات التصنيع',
  '/manufacturing/oee': 'الكفاءة الشاملة للمعدات والماكينات (OEE)',
  '/manufacturing/maintenance': 'صيانة الماكينات وخطوط الإنتاج الوقائية',
  '/manufacturing/capacity': 'تخطيط الطاقة الإنتاجية والتحميل',
  '/manufacturing/gantt': 'مخطط جانت الزمني للجدولة الإنتاجية',
  '/manufacturing/cost-closing': 'تقفيل وتوزيع تكاليف التشغيل الصناعية',
  '/manufacturing/reports/cost-analysis': 'تحليل تكاليف أوامر الإنتاج والتكاليف الإضافية',
  '/manufacturing/reports/unit-cost': 'تحليل تكلفة الوحدة المنتجة',
  '/manufacturing/reports/bom-variance': 'تقرير انحرافات استهلاك الخامات المعيارية (BOM Variance)',
  '/manufacturing/reports/genealogy': 'شجرة التتبع والأصل الوراثي للدفعات (Batch Genealogy)',
  '/manufacturing/reports/profitability': 'تقرير ربحية خطوط الإنتاج والمنتجات المصنعة',
  '/manufacturing/reports/raw-turnover': 'معدل دوران المواد الخام والمستلزمات',
  '/manufacturing/reports/wip': 'تقرير الإنتاج تحت التشغيل الشهري (WIP)',
  '/manufacturing/alerts': 'سجل إنذارات ومخاطر خطوط الإنتاج',

  // 🍽️ المطاعم والمطابخ والكافيهات
  '/restaurant/pos': 'نقطة بيع المطاعم السريعة (POS)',
  '/restaurant/kds': 'شاشة عرض المطبخ الذكية (KDS)',
  '/restaurant/expo': 'شاشة مراقب ومجهز الطلبات (Expo)',
  '/restaurant/waiter': 'تطبيق الويتر المحمول لأخذ الطلبات',
  '/restaurant/customer-display': 'شاشة عرض العميل المقابلة (Customer Display)',
  '/restaurant/kiosk': 'كشك الطلب الذاتي للعملاء (Self-Ordering Kiosk)',
  '/restaurant/stations': 'توجيه طلبات محطات المطبخ والأقسام',
  '/restaurant/printers': 'إدارة الطابعات الحرارية وطابعات البونات',
  '/restaurant/driver-dispatch': 'شاشة تتبع وتوجيه طياري التوصيل (Dispatch)',
  '/restaurant/aggregators': 'ربط تطبيقات التوصيل والمنصات الخارجية (Aggregators)',
  '/restaurant/happy-hours': 'عروض الساعات السعيدة والتسعير الزمني',
  '/restaurant/channel-pricing': 'التسعير المتعدد حسب قنوات البيع (صالات/سفري/تطبيقات)',
  '/restaurant/loyalty': 'برنامج ولاء ونقاط العملاء',
  '/restaurant/tips-pool': 'تجميع وتوزيع بقشيش العاملين (Tips Pool)',
  '/restaurant/win-back': 'حملات استعادة العملاء المتغيبين (Win-Back)',
  '/restaurant/auto-reorder': 'إعادة الطلب التلقائي لمستلزمات المطبخ',
  '/restaurant/butchering-yield': 'معدل تصافي اللحوم والتقطيع (Butchering Yield)',
  '/restaurant/menu': 'قائمة الطعام الرقمية (Digital QR Menu)',
  '/kitchen-end-day': 'الجرد اليومي وتقفيل مستلزمات المطبخ',
  '/restaurant/reports/sales': 'تقرير مبيعات المطعم التفصيلي والورديات',
  '/restaurant/reports/wastage': 'تقرير هوالك وإهدار المطبخ والوجبات',
  '/restaurant/reports/profit': 'تقرير ربحية قائمة الطعام والأطباق',
  '/restaurant/analytics': 'تحليلات ذكاء أعمال المطاعم ومؤشرات الذروة',

  // 🛒 التجزئة والهايبر ماركت (Retail POS)
  '/retail/pos': 'نقطة بيع التجزئة والباركود المباشر (Retail POS)',
  '/retail/price-checker': 'كشك استعلام الأسعار للجمهور (Price Checker)',
  '/retail/promotions': 'عروض وتخفيضات التجزئة المتقدمة',

  // 🏗️ المقاولات وإدارة المشاريع الإنشائية
  '/construction/dashboard': 'لوحة قيادة قطاع المقاولات والمشاريع',
  '/construction/projects': 'إدارة المشاريع الإنشائية ومواقع العمل',
  '/construction/subcontractors': 'إدارة مقاولي الباطن والموردين المتخصصين',
  '/construction/daily-logs': 'اليوميات وسجلات الموقع اليومية',
  '/construction/rfi': 'طلبات المعلومات والاستفسارات الفنية (RFI)',
  '/construction/inspections': 'محاضر استلام الأعمال والفحص الهندسي',
  '/construction/waste-analytics': 'تحليل فاقد وهدر مواد البناء بالموقع',
  '/construction/escalation': 'حاسبة فروق الأسعار وتعديل تكاليف العقود',
  '/construction/reports/labor': 'تقرير تكلفة العمالة المباشرة والميدانية',
  '/construction/reports/analytics': 'تحليلات أداء عقود ومستخلصات مقاولي الباطن',

  // 🏥 المنظومة الطبية والمستشفيات (HIMS)
  '/hims/dashboard': 'لوحة قيادة المنظومة الطبية والمستشفيات',
  '/hims/patients': 'سجل وبيانات المرضى (الملف الطبي الموحد)',
  '/hims/doctor-desktop': 'المحطة الإكلينيكية للطبيب المعالج',
  '/hims/doctors': 'دليل الأطباء والاستشاريين',
  '/hims/appointments': 'جدول المواعيد والعيادات الخارجية',
  '/hims/billing': 'الفواتير والمطالبات الطبية',
  '/hims/lab': 'المختبر ومعامل التحاليل الطبية',
  '/hims/lab/tracking': 'تتبع العينات المخبرية ونتائج الفحص',
  '/hims/blood-bank': 'إدارة بنك الدم ومشتقاته',
  '/hims/radiology': 'قسم الأشعة والتصوير الطبي',
  '/hims/nursing': 'محطة التمريض ومتابعة المرضى',
  '/hims/er': 'لوحة فرز واستقبال طوارئ المستشفى (ER Triage)',
  '/hims/pharmacy': 'الصيدلية الداخلية وصرف الروشتات',
  '/hims/admissions': 'الدخول والتنويم الداخلي',
  '/hims/wards': 'إدارة الأجنحة والغرف وتسكين الأسِرّة',
  '/hims/surgeries': 'جدولة العمليات وغرف الجراحة المجهزة',
  '/hims/staff-roster': 'نوبتجيات وجداول الفريق الطبي والتمريض',
  '/hims/insurance': 'إدارة شركات التأمين والتعاقدات الطبية',
  '/hims/reports/executive': 'التقرير الإحصائي والتنفيذي لإدارة المستشفى',
  '/hims/reports/profitability': 'تقرير ربحية الخدمات والأقسام الطبية',
  '/hims/services': 'دليل الخدمات الطبية ولائحة الأسعار',

  // 🏟️ إدارة الأندية والاستادات والمنشآت الرياضية
  '/stadium/dashboard': 'لوحة قيادة إدارة الاستاد والمنشآت الرياضية',
  '/stadium/members': 'عضويات واشتراكات النادي الرياضي',
  '/stadium/facilities': 'الملاعب والصالات والمرافق الرياضية',
  '/stadium/bookings': 'حجوزات الملاعب والفعاليات الرياضية',
  '/stadium/rentals': 'تأجير المعدات والمرافق والمساحات',
  '/stadium/programs': 'الأكاديميات والبرامج التدريبية',
  '/stadium/coaches': 'سجل المدربين والكوادر الفنية',
  '/stadium/tournaments': 'إدارة الدوريات والبطولات والمنافسات',
  '/stadium/gate-scanner': 'بوابات الدخول والمسح الإلكتروني للتذاكر',
  '/stadium/maintenance': 'صيانة الملاعب والنجيلة والمنشآت',
  '/stadium/budget': 'موازنة ومصروفات الاستاد التقديرية',
  '/stadium/disbursements': 'أذون الصرف والمستحقات الرياضية',
  '/stadium/custody': 'سجل العهد والأدوات الرياضية والمعدات',
  '/stadium/reports/revenue': 'تقرير إيرادات الاستاد والأنشطة الرياضية',
  '/stadium/reports/expense': 'تقرير مصروفات وتكاليف تشغيل الاستاد',
  '/stadium/reports/pnl': 'قائمة الأرباح والخسائر للقطاع الرياضي',
  '/stadium/reports/occupancy': 'تقرير نسب إشغال الملاعب والمرافق',
  '/stadium/reports/member-aging': 'تقرير أعمار مديونيات الأعضاء والاشتراكات',
  '/stadium/reports/program-profit': 'تقرير ربحية الأكاديميات والأنشطة الرياضية',

  // ⚙️ إعدادات النظام والأمان
  '/settings': 'إعدادات المنشأة العامة وتفضيلات النظام',
  '/settings/users': 'إدارة المستخدمين والصلاحيات والوصول',
  '/settings/roles': 'إدارة الأدوار والمجموعات الوظيفية',
  '/settings/security': 'مركز الأمان والمراقبة والنسخ الاحتياطي',
  '/settings/company': 'بيانات الشركة والترويسة والرقم الضريبي',
  '/settings/accounting': 'التوجيه المحاسبي وربط الحسابات التلقائي',
  '/settings/print': 'تنسيق قوالب وتصميمات الطباعة',
  '/admin/audit-logs': 'سجل الرقابة والتدقيق الأمني الذاتي',
};

/**
 * دالة مساعدة لجلب عنوان المسار مع دعم المعلمات الديناميكية
 */
export function getRouteTitle(pathname: string): string {
  // مطابقة مباشرة
  if (ROUTE_TITLES[pathname]) {
    return ROUTE_TITLES[pathname];
  }

  // مطابقة جزئية للمسارات التي تحتوي على معرفات ديناميكية مثل /public/hims/visit/:id
  for (const [route, title] of Object.entries(ROUTE_TITLES)) {
    if (pathname.startsWith(route) && route !== '/') {
      return title;
    }
  }

  return 'نظام TriPro ERP المؤسسي المتكامل';
}

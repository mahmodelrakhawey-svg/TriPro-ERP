import React, { useState } from 'react';
import { BookOpen, ChevronDown, ChevronUp, HelpCircle, FileText, Users, ShoppingCart, Truck, Package, Wallet, Settings } from 'lucide-react';

const UserGuide = () => {
  const [openSection, setOpenSection] = useState<string | null>(null);

  const toggleSection = (section: string) => {
    setOpenSection(openSection === section ? null : section);
  };

  const sections = [
    {
      id: 'getting-started',
      title: 'البداية السريعة',
      icon: <HelpCircle className="text-blue-600" size={20} />,
      content: (
        <div className="space-y-2 text-slate-600">
          <p>أهلاً بك في نظام TriPro ERP. إليك خطوات سريعة للبدء:</p>
          <ol className="list-decimal list-inside space-y-1 mr-4">
            <li>قم بتهيئة إعدادات الشركة من صفحة <strong>الإعدادات</strong>.</li>
            <li>أضف حساباتك البنكية والصناديق من <strong>دليل الحسابات</strong>.</li>
            <li>ابدأ بإضافة المنتجات والخدمات من <strong>إدارة المخزون</strong>.</li>
            <li>سجل بيانات عملائك ومورديك.</li>
            <li>الآن أنت جاهز لإنشاء الفواتير والسندات!</li>
          </ol>
        </div>
      )
    },
    {
      id: 'sales',
      title: 'المبيعات والعملاء',
      icon: <ShoppingCart className="text-emerald-600" size={20} />,
      content: (
        <div className="space-y-2 text-slate-600">
          <p>إدارة دورة المبيعات كاملة:</p>
          <ul className="list-disc list-inside space-y-1 mr-4">
            <li><strong>عروض الأسعار:</strong> إنشاء عروض أسعار للعملاء وتحويلها لفواتير بضغطة زر.</li>
            <li><strong>فواتير المبيعات:</strong> إصدار فواتير ضريبية، دعم تعدد العملات، والخصومات.</li>
            <li><strong>العملاء:</strong> إدارة ملفات العملاء، حدود الائتمان، وكشوف الحسابات.</li>
            <li><strong>المرتجعات:</strong> تسجيل مرتجعات المبيعات وتأثيرها على المخزون والحسابات.</li>
          </ul>
        </div>
      )
    },
    {
      id: 'purchases',
      title: 'المشتريات والموردين',
      icon: <Truck className="text-orange-600" size={20} />,
      content: (
        <div className="space-y-2 text-slate-600">
          <p>تتبع مشترياتك ومستحقات الموردين:</p>
          <ul className="list-disc list-inside space-y-1 mr-4">
            <li><strong>أوامر الشراء:</strong> إرسال طلبات الشراء للموردين.</li>
            <li><strong>فواتير المشتريات:</strong> تسجيل الفواتير الواردة وتحديث تكلفة المخزون (المتوسط المرجح).</li>
            <li><strong>الموردين:</strong> إدارة بيانات الموردين ومتابعة كشوف حساباتهم.</li>
          </ul>
        </div>
      )
    },
    {
      id: 'inventory',
      title: 'إدارة المخزون',
      icon: <Package className="text-purple-600" size={20} />,
      content: (
        <div className="space-y-2 text-slate-600">
          <p>التحكم الكامل في مخزونك:</p>
          <ul className="list-disc list-inside space-y-1 mr-4">
            <li><strong>المنتجات:</strong> تعريف الأصناف (مخزونية/خدمية)، الباركود، والأسعار.</li>
            <li><strong>المستودعات:</strong> إدارة مستودعات متعددة والتحويل بينها.</li>
            <li><strong>الجرد:</strong> إجراء عمليات الجرد والتسويات المخزنية.</li>
            <li><strong>التصنيع:</strong> إدارة أوامر التصنيع وقوائم المواد (BOM).</li>
          </ul>
        </div>
      )
    },
    {
      id: 'finance',
      title: 'المالية والمحاسبة',
      icon: <Wallet className="text-red-600" size={20} />,
      content: (
        <div className="space-y-2 text-slate-600">
          <p>الإدارة المالية الدقيقة:</p>
          <ul className="list-disc list-inside space-y-1 mr-4">
            <li><strong>السندات:</strong> إنشاء سندات القبض والصرف وتسجيل المصروفات.</li>
            <li><strong>القيود اليومية:</strong> إنشاء قيود يدوية أو آلية ومراجعتها.</li>
            <li><strong>التقارير المالية:</strong> ميزان المراجعة، قائمة الدخل، الميزانية العمومية، والتدفقات النقدية.</li>
            <li><strong>الأصول الثابتة:</strong> تسجيل الأصول وإهلاكها شهرياً.</li>
          </ul>
        </div>
      )
    },
    {
      id: 'settings',
      title: 'الإعدادات والأمان',
      icon: <Settings className="text-slate-600" size={20} />,
      content: (
        <div className="space-y-2 text-slate-600">
          <p>تخصيص النظام وحمايته:</p>
          <ul className="list-disc list-inside space-y-1 mr-4">
            <li><strong>إعدادات الشركة:</strong> الشعار، البيانات الضريبية، والعملة الافتراضية.</li>
            <li><strong>المستخدمين والصلاحيات:</strong> إضافة مستخدمين وتحديد أدوارهم وصلاحياتهم بدقة.</li>
            <li><strong>النسخ الاحتياطي:</strong> تصدير واستيراد البيانات للحفاظ عليها.</li>
            <li><strong>إقفال السنة:</strong> أدوات إقفال السنة المالية وترحيل الأرصدة.</li>
          </ul>
        </div>
      )
    }
  ];

  return (
    <div className="max-w-4xl mx-auto space-y-8 animate-in fade-in pb-12">
      <div className="text-center space-y-4">
        <h1 className="text-3xl font-bold text-slate-800 flex items-center justify-center gap-3">
          <BookOpen className="text-blue-600" size={32} /> دليل المستخدم
        </h1>
        <p className="text-slate-500 max-w-2xl mx-auto">
          مرجعك الشامل لاستخدام نظام TriPro ERP. ستجد هنا شرحاً لأهم الوظائف والأقسام لمساعدتك في إدارة أعمالك بكفاءة.
        </p>
      </div>

      <div className="grid gap-4">
        {sections.map((section) => (
          <div 
            key={section.id} 
            className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm hover:shadow-md transition-shadow"
          >
            <button
              onClick={() => toggleSection(section.id)}
              className="w-full flex items-center justify-between p-5 text-right bg-white hover:bg-slate-50 transition-colors"
            >
              <div className="flex items-center gap-4">
                <div className="p-2 bg-slate-100 rounded-lg">
                  {section.icon}
                </div>
                <span className="font-bold text-lg text-slate-800">{section.title}</span>
              </div>
              {openSection === section.id ? (
                <ChevronUp className="text-slate-400" />
              ) : (
                <ChevronDown className="text-slate-400" />
              )}
            </button>
            
            {openSection === section.id && (
              <div className="p-5 pt-0 border-t border-slate-100 bg-slate-50/50 animate-in slide-in-from-top-2">
                <div className="prose prose-slate max-w-none">
                  {section.content}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="bg-blue-50 border border-blue-100 rounded-xl p-6 text-center">
        <h3 className="font-bold text-blue-800 mb-2">هل تحتاج لمساعدة إضافية؟</h3>
        <p className="text-blue-600 text-sm mb-4">فريق الدعم الفني جاهز لمساعدتك في أي وقت.</p>
        <a href="mailto:support@tripro.app" className="inline-flex items-center gap-2 bg-blue-600 text-white px-6 py-2.5 rounded-lg font-bold hover:bg-blue-700 transition-colors">
            <Users size={18} /> تواصل مع الدعم
        </a>
      </div>
    </div>
  );
};

export default UserGuide;
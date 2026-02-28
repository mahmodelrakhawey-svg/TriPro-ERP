import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useAccounting } from '../context/AccountingContext';
import { useToast } from '../context/ToastContext';
import { Landmark, ArrowLeft, ShieldCheck, Play, Loader2, CheckCircle, BarChart3, Users, Globe, ChevronDown, ChevronUp, HelpCircle, Facebook, Twitter, Instagram, Linkedin } from 'lucide-react';
import Login from './Login';

const LandingPage = () => {
  const { login } = useAuth();
  const { settings } = useAccounting();
  const { showToast } = useToast();
  const [showLogin, setShowLogin] = useState(false);
  const [loading, setLoading] = useState(false);
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  // 💰 إعدادات الباقات والأسعار (يمكنك تعديلها من هنا مباشرة)
  const PRICING_PLANS = [
    {
      id: 'basic',
      title: 'الباقة الأساسية',
      price: 'مجاناً',
      period: '/ للأبد',
      features: ['مستخدم واحد', '100 فاتورة شهرياً', 'إدارة المخزون الأساسية', 'تقارير محدودة'],
      buttonText: 'ابدأ الآن',
      highlight: false, // هل هذه الباقة مميزة؟
      whatsappMessage: 'مرحباً، أود الاستفسار عن الباقة الأساسية المجانية'
    },
    {
      id: 'pro',
      title: 'باقة المحترفين',
      price: '499',
      period: 'ج.م / شهرياً',
      features: ['5 مستخدمين', 'فواتير غير محدودة', 'إدارة مخزون متقدمة', 'الموارد البشرية والرواتب', 'دعم فني عبر الواتساب'],
      buttonText: 'اشترك الآن',
      highlight: true, // تمييز هذه الباقة (الأكثر طلباً)
      whatsappMessage: 'مرحباً، أرغب في الاشتراك في باقة المحترفين (499 ج.م)'
    },
    {
      id: 'enterprise',
      title: 'باقة المؤسسات',
      price: '999',
      period: 'ج.م / شهرياً',
      features: ['مستخدمين غير محدودين', 'جميع مميزات المحترفين', 'التصنيع والتكاليف', 'ربط API مخصص', 'مدير حساب خاص'],
      buttonText: 'تواصل معنا',
      highlight: false,
      whatsappMessage: 'مرحباً، لدي استفسار بخصوص باقة المؤسسات والحلول المخصصة'
    }
  ];

  // ❓ الأسئلة الشائعة (قم بتعديل النصوص هنا لتغيير الأسئلة والإجابات في الموقع)
  const FAQS = [
    {
      question: "هل يمكنني تجربة النظام قبل الشراء؟",
      answer: "نعم، نوفر نسخة تجريبية (ديمو) مجانية بالكامل يمكنك استخدامها لاستكشاف جميع مميزات النظام قبل اتخاذ قرار الشراء."
    },
    {
      question: "هل بياناتي آمنة؟",
      answer: "بالتأكيد. نحن نستخدم أحدث تقنيات التشفير لحماية بياناتك، ونقوم بعمل نسخ احتياطي دوري لضمان عدم فقدان أي معلومات."
    },
    {
      question: "هل يدعم النظام الفاتورة الإلكترونية؟",
      answer: "نعم، نظام TriPro ERP متوافق تماماً مع متطلبات الفاتورة الإلكترونية والضريبة المضافة في مصر والسعودية."
    },
    {
      question: "هل يمكنني ترقية الباقة لاحقاً؟",
      answer: "نعم، يمكنك الترقية إلى باقة أعلى في أي وقت مع الاحتفاظ بجميع بياناتك الحالية دون أي تأثير على سير العمل."
    },
    {
      question: "هل يعمل النظام بدون إنترنت؟",
      answer: "النظام سحابي (Cloud-based) ويتطلب اتصالاً بالإنترنت لضمان الوصول للبيانات من أي مكان وتحديثها لحظياً."
    }
  ];

  const handleDemoLogin = async () => {
    setLoading(true);
    try {
      // تسجيل الدخول ببيانات الديمو الثابتة
      await login('demo@demo.com', '123456');
    } catch (error) {
      console.error(error);
      showToast('فشل الدخول للنسخة التجريبية', 'error');
    } finally {
      setLoading(false);
    }
  };

  // إذا ضغط المستخدم على "دخول المشتركين"، نعرض له شاشة تسجيل الدخول العادية
  if (showLogin) {
    return (
      <div className="relative min-h-screen bg-slate-100">
        <button 
          onClick={() => setShowLogin(false)}
          className="absolute top-6 right-6 text-slate-500 hover:text-blue-600 flex items-center gap-2 z-50 font-bold bg-white px-4 py-2 rounded-xl shadow-sm transition-all"
        >
          <ArrowLeft size={20} /> العودة
        </button>
        <Login />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-900 text-white font-sans relative overflow-hidden" dir="rtl">
      {/* 🎥 خلفية الفيديو (Video Background) */}
      <div className="absolute inset-0 z-0">
          {/* طبقة شفافة لتغميق الفيديو وجعل النص مقروءاً */}
          <div className="absolute inset-0 bg-slate-900/85 z-10"></div>
          <video 
              autoPlay 
              loop 
              muted 
              playsInline
              className="w-full h-full object-cover opacity-60"
          >
              {/* فيديو تجريبي (شبكة رقمية) - يمكنك استبداله بملف محلي أو رابط آخر */}
              <source src="https://assets.mixkit.co/videos/preview/mixkit-digital-animation-of-a-network-of-lines-and-dots-17924-large.mp4" type="video/mp4" />
          </video>
      </div>

      <div className="relative z-10">
      {/* Navbar */}
      <nav className="container mx-auto px-6 py-6 flex justify-between items-center">
        <div className="flex items-center gap-3">
          {settings?.logoUrl ? (
             <img src={settings.logoUrl} alt="Logo" className="w-14 h-14 object-contain" />
          ) : (
             <img src="/logo.jpg" alt="Logo" className="w-14 h-14 object-contain" />
          )}
          <span className="text-2xl font-black tracking-tight">TriPro ERP</span>
        </div>
        <button 
          onClick={() => setShowLogin(true)}
          className="text-sm font-bold text-slate-300 hover:text-white transition-colors border border-white/20 px-4 py-2 rounded-lg hover:bg-white/10"
        >
          تسجيل دخول الموظفين
        </button>
      </nav>

      {/* Hero Section */}
      <div className="container mx-auto px-6 py-12 flex flex-col lg:flex-row items-center gap-12">
        <div className="lg:w-1/2 space-y-8">
          <div className="inline-flex items-center gap-2 bg-blue-800/50 border border-blue-700/50 px-4 py-2 rounded-full text-blue-200 text-sm font-medium animate-in fade-in slide-in-from-bottom-4">
            <span className="relative flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
            </span>
            الإصدار السابع متاح الآن
          </div>
          
          <h1 className="text-5xl lg:text-7xl font-black leading-tight animate-in fade-in slide-in-from-bottom-8 duration-700">
            نظام <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-emerald-400">ERP</span> متكامل لإدارة أعمالك بذكاء
          </h1>
          
          <p className="text-lg text-slate-300 leading-relaxed max-w-xl animate-in fade-in slide-in-from-bottom-8 duration-700 delay-150">
            الحل الأمثل لإدارة المحاسبة، المخزون، الموارد البشرية، والمبيعات في منصة واحدة سحابية آمنة وسهلة الاستخدام.
          </p>

          <div className="flex flex-col sm:flex-row gap-4 pt-4 animate-in fade-in slide-in-from-bottom-8 duration-700 delay-300">
            <button 
              onClick={handleDemoLogin}
              disabled={loading}
              className="bg-emerald-500 hover:bg-emerald-600 text-white px-8 py-4 rounded-2xl font-black text-lg shadow-xl shadow-emerald-500/20 transition-all transform hover:scale-105 flex items-center justify-center gap-3"
            >
              {loading ? <Loader2 className="animate-spin" /> : <Play size={24} fill="currentColor" />}
              تجربة الديمو مجاناً
            </button>
            <button 
              onClick={() => setShowLogin(true)}
              className="bg-white/10 hover:bg-white/20 text-white px-8 py-4 rounded-2xl font-bold text-lg backdrop-blur-sm transition-all flex items-center justify-center gap-3"
            >
              <ShieldCheck size={24} />
              دخول المشتركين
            </button>
          </div>

          <div className="pt-8 flex items-center gap-8 text-slate-400 text-sm font-medium animate-in fade-in slide-in-from-bottom-8 duration-700 delay-500">
            <div className="flex items-center gap-2">
              <CheckCircle size={18} className="text-emerald-500" />
              <span>بدون بطاقة ائتمان</span>
            </div>
            <div className="flex items-center gap-2">
              <CheckCircle size={18} className="text-emerald-500" />
              <span>تجربة فورية</span>
            </div>
            <div className="flex items-center gap-2">
              <CheckCircle size={18} className="text-emerald-500" />
              <span>بيانات آمنة</span>
            </div>
          </div>
        </div>

        {/* Visual / Image */}
        <div className="lg:w-1/2 relative hidden lg:block">
          <div className="absolute -inset-4 bg-gradient-to-r from-blue-500 to-purple-600 rounded-[40px] blur-2xl opacity-30 animate-pulse"></div>
          <div className="relative bg-slate-800 border border-slate-700 rounded-[32px] p-6 shadow-2xl transform rotate-2 hover:rotate-0 transition-transform duration-500">
             {/* Abstract UI Representation */}
             <div className="flex gap-4 mb-6">
                <div className="w-1/3 bg-slate-700/50 h-24 rounded-2xl animate-pulse"></div>
                <div className="w-1/3 bg-slate-700/50 h-24 rounded-2xl animate-pulse delay-75"></div>
                <div className="w-1/3 bg-slate-700/50 h-24 rounded-2xl animate-pulse delay-150"></div>
             </div>
             <div className="flex gap-4">
                <div className="w-1/4 bg-slate-700/30 h-64 rounded-2xl"></div>
                <div className="w-3/4 bg-slate-700/30 h-64 rounded-2xl"></div>
             </div>
             
             {/* Floating Badge */}
             <div className="absolute -bottom-6 -right-6 bg-white text-slate-900 p-4 rounded-2xl shadow-xl flex items-center gap-3 animate-bounce">
                <div className="bg-blue-100 p-2 rounded-full text-blue-600">
                    <Users size={24} />
                </div>
                <div>
                    <p className="text-xs font-bold text-slate-500">مستخدمين نشطين</p>
                    <p className="text-xl font-black">+10,000</p>
                </div>
             </div>
          </div>
        </div>
      </div>
      
      {/* Features Grid */}
      <div className="container mx-auto px-6 py-20 border-t border-white/10">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              <div className="bg-white/5 p-6 rounded-3xl border border-white/5 hover:bg-white/10 transition-colors animate-in fade-in slide-in-from-bottom-8 duration-700 delay-100">
                  <BarChart3 size={32} className="text-blue-400 mb-4" />
                  <h3 className="text-xl font-bold mb-2">تقارير ذكية</h3>
                  <p className="text-slate-400 text-sm leading-relaxed">لوحات قيادة تفاعلية وتقارير لحظية تساعدك على اتخاذ القرارات الصحيحة.</p>
              </div>
              <div className="bg-white/5 p-6 rounded-3xl border border-white/5 hover:bg-white/10 transition-colors animate-in fade-in slide-in-from-bottom-8 duration-700 delay-200">
                  <Globe size={32} className="text-emerald-400 mb-4" />
                  <h3 className="text-xl font-bold mb-2">وصول من أي مكان</h3>
                  <p className="text-slate-400 text-sm leading-relaxed">نظام سحابي يعمل على جميع الأجهزة، تابع أعمالك من المكتب أو المنزل.</p>
              </div>
              <div className="bg-white/5 p-6 rounded-3xl border border-white/5 hover:bg-white/10 transition-colors animate-in fade-in slide-in-from-bottom-8 duration-700 delay-300">
                  <ShieldCheck size={32} className="text-amber-400 mb-4" />
                  <h3 className="text-xl font-bold mb-2">أمان وخصوصية</h3>
                  <p className="text-slate-400 text-sm leading-relaxed">تشفير كامل للبيانات ونسخ احتياطي تلقائي لضمان سلامة معلوماتك.</p>
              </div>
          </div>
      </div>

      {/* Pricing Section */}
      <div className="container mx-auto px-6 py-20 border-t border-white/10">
        <div className="text-center mb-16 animate-in fade-in slide-in-from-bottom-8 duration-700">
          <h2 className="text-3xl md:text-4xl font-black mb-4">خطط أسعار تناسب الجميع</h2>
          <p className="text-slate-400 max-w-2xl mx-auto">اختر الباقة التي تناسب حجم أعمالك، وابدأ رحلة النجاح اليوم مع أفضل نظام ERP سحابي.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {PRICING_PLANS.map((plan, index) => (
            <div 
              key={plan.id} 
              className={`
                rounded-3xl p-8 border transition-all relative group
                animate-in fade-in slide-in-from-bottom-8 duration-700
                ${index === 0 ? 'delay-100' : index === 1 ? 'delay-200' : 'delay-300'}
                ${plan.highlight 
                  ? 'bg-gradient-to-b from-blue-900/50 to-slate-900 border-blue-500 transform md:-translate-y-4 shadow-2xl shadow-blue-900/20' 
                  : 'bg-white/5 border-white/10 hover:border-blue-500/50'}
              `}
            >
              {plan.highlight && (
                <div className="absolute top-0 right-0 bg-blue-500 text-white text-xs font-bold px-3 py-1 rounded-bl-xl rounded-tr-xl">الأكثر طلباً</div>
              )}
              
              <h3 className={`text-xl font-bold mb-2 ${plan.highlight ? 'text-white' : index === 2 ? 'text-purple-400' : 'text-blue-400'}`}>
                {plan.title}
              </h3>
              
              <div className="text-4xl font-black mb-6">
                {plan.price} <span className={`text-sm font-medium ${plan.highlight ? 'text-slate-400' : 'text-slate-500'}`}>{plan.period}</span>
              </div>
              
              <ul className="space-y-4 text-slate-300 text-sm mb-8">
                {plan.features.map((feature, idx) => (
                  <li key={idx} className="flex items-center gap-2">
                    <CheckCircle size={16} className={plan.highlight ? 'text-emerald-400' : index === 2 ? 'text-purple-500' : 'text-blue-500'} /> 
                    {feature}
                  </li>
                ))}
              </ul>
              
              <a 
                href={`https://wa.me/201008495405?text=${encodeURIComponent(plan.whatsappMessage)}`}
                target="_blank"
                rel="noopener noreferrer"
                className={`
                  w-full py-3 rounded-xl font-bold transition-all block text-center
                  ${plan.highlight 
                    ? 'bg-blue-500 text-white hover:bg-blue-600 shadow-lg shadow-blue-500/25' 
                    : index === 2 
                      ? 'border border-purple-500 text-purple-400 hover:bg-purple-500 hover:text-white'
                      : 'border border-blue-500 text-blue-400 hover:bg-blue-500 hover:text-white'}
                `}
              >
                {plan.buttonText}
              </a>
            </div>
          ))}
        </div>
      </div>

      {/* FAQ Section */}
      <div className="container mx-auto px-6 py-20 border-t border-white/10">
        <div className="text-center mb-12 animate-in fade-in slide-in-from-bottom-8 duration-700">
          <h2 className="text-3xl md:text-4xl font-black mb-4 flex items-center justify-center gap-3">
             <HelpCircle className="text-amber-400" size={32} /> الأسئلة الشائعة
          </h2>
          <p className="text-slate-400">إجابات على أكثر الأسئلة تداولاً حول النظام</p>
        </div>

        <div className="max-w-3xl mx-auto space-y-4">
          {FAQS.map((faq, index) => (
            <div 
              key={index} 
              className="bg-white/5 rounded-2xl border border-white/10 overflow-hidden transition-all hover:bg-white/10 animate-in fade-in slide-in-from-bottom-4 duration-500"
              style={{ animationDelay: `${index * 100}ms` }}
            >
              <button 
                onClick={() => setOpenFaq(openFaq === index ? null : index)}
                className="w-full flex items-center justify-between p-6 text-right focus:outline-none"
              >
                <span className="font-bold text-lg text-slate-200">{faq.question}</span>
                {openFaq === index ? <ChevronUp className="text-blue-400" /> : <ChevronDown className="text-slate-500" />}
              </button>
              {openFaq === index && (
                <div className="p-6 pt-0 text-slate-400 leading-relaxed animate-in slide-in-from-top-2 fade-in duration-300 border-t border-white/5">
                  {faq.answer}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Footer */}
      <footer className="border-t border-white/10 bg-slate-900/50 backdrop-blur-sm mt-20">
          <div className="container mx-auto px-6 py-12">
              <div className="flex flex-col md:flex-row justify-between items-center gap-6">
                  <div className="flex items-center gap-2">
                      {settings?.logoUrl ? (
                        <img src={settings.logoUrl} alt="Logo" className="w-12 h-12 object-contain" />
                      ) : (
                        <img src="/logo.jpg" alt="Logo" className="w-12 h-12 object-contain" />
                      )}
                      <div>
                          <h4 className="text-lg font-black text-white">TriPro ERP</h4>
                          <p className="text-xs text-slate-400">نظام ERP متكامل للأعمال</p>
                      </div>
                  </div>

                  <div className="flex gap-6">
                      <a href="#" className="text-slate-400 hover:text-blue-500 transition-colors transform hover:scale-110"><Facebook size={24} /></a>
                      <a href="#" className="text-slate-400 hover:text-sky-400 transition-colors transform hover:scale-110"><Twitter size={24} /></a>
                      <a href="#" className="text-slate-400 hover:text-pink-500 transition-colors transform hover:scale-110"><Instagram size={24} /></a>
                      <a href="#" className="text-slate-400 hover:text-blue-700 transition-colors transform hover:scale-110"><Linkedin size={24} /></a>
                  </div>
              </div>
              
              <div className="border-t border-white/5 mt-8 pt-8 text-center text-slate-500 text-sm flex flex-col md:flex-row justify-between items-center gap-4">
                  <p>© {new Date().getFullYear()} TriPro ERP. جميع الحقوق محفوظة.</p>
                  <div className="flex gap-6">
                      <a href="#" className="hover:text-white transition-colors">سياسة الخصوصية</a>
                      <a href="#" className="hover:text-white transition-colors">شروط الاستخدام</a>
                      <a href="#" className="hover:text-white transition-colors">الدعم الفني</a>
                  </div>
              </div>
          </div>
      </footer>
      </div>
    </div>
  );
};

export default LandingPage;

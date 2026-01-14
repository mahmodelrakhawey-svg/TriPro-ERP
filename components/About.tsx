import React from 'react';
import { useAccounting } from '../context/AccountingContext';
import { Landmark, Info, ShieldCheck, Heart, Globe, Mail, Phone } from 'lucide-react';

const About = () => {
  const { settings } = useAccounting();
  const appVersion = "7.0.0";

  return (
    <div className="max-w-3xl mx-auto animate-in fade-in space-y-8 py-12">
      <div className="text-center space-y-4">
        {settings?.logoUrl ? (
            <img src={settings.logoUrl} alt="Logo" className="w-48 h-48 object-contain mx-auto mb-2 transform hover:scale-105 transition-transform duration-300" />
        ) : (
            <img src="/logo.jpg" alt="Logo" className="w-48 h-48 object-contain mx-auto mb-2 transform hover:scale-105 transition-transform duration-300" />
        )}
        <h1 className="text-5xl font-black text-slate-900 tracking-tight">TriPro ERP</h1>
        <p className="text-xl text-slate-500 font-medium">نظام تخطيط موارد المؤسسات المتكامل</p>
        <div className="inline-block px-4 py-1 bg-slate-100 rounded-full text-sm font-bold text-slate-600 border border-slate-200">
            الإصدار {appVersion}
        </div>
      </div>

      <div className="bg-white rounded-[32px] shadow-sm border border-slate-200 overflow-hidden">
          <div className="p-8 space-y-8">
              <div className="flex gap-5 items-start">
                  <div className="p-4 bg-blue-50 text-blue-900 rounded-2xl shrink-0">
                      <Info size={28} />
                  </div>
                  <div>
                      <h3 className="text-xl font-bold text-slate-800 mb-2">عن النظام</h3>
                      <p className="text-slate-600 leading-relaxed text-lg">
                          TriPro ERP هو الحل الأمثل لإدارة أعمالك بكفاءة واحترافية. تم تصميم النظام خصيصاً ليتناسب مع متطلبات السوق العربي، موفراً أدوات قوية للمحاسبة، إدارة المخزون، الموارد البشرية، والتصنيع، كل ذلك في واجهة عصرية وسهلة الاستخدام.
                      </p>
                  </div>
              </div>

              <div className="flex gap-5 items-start">
                  <div className="p-4 bg-amber-50 text-amber-600 rounded-2xl shrink-0">
                      <ShieldCheck size={28} />
                  </div>
                  <div>
                      <h3 className="text-xl font-bold text-slate-800 mb-2">الموثوقية والأمان</h3>
                      <p className="text-slate-600 leading-relaxed text-lg">
                          بني النظام على أحدث تقنيات الويب وقواعد البيانات السحابية لضمان سرعة الأداء وحماية البيانات. نحن نضع أمان معلوماتك على رأس أولوياتنا.
                      </p>
                  </div>
              </div>
          </div>
          
          <div className="bg-slate-50 p-8 border-t border-slate-100">
              <div className="text-center mb-8">
                <p className="text-slate-500 text-sm mb-2">تم التطوير بكل <Heart size={14} className="inline text-red-500 mx-1 fill-current animate-pulse" /> بواسطة</p>
                <h4 className="text-xl font-black text-slate-800">TriPro Software Solutions</h4>
              </div>

              <div className="flex flex-wrap justify-center gap-4 text-sm">
                  <a href="https://tripro.app" target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 rounded-xl text-slate-600 hover:text-blue-600 hover:border-blue-200 transition-colors">
                      <Globe size={16} />
                      <span>www.tripro.app</span>
                  </a>
                  <a href="mailto:support@tripro.app" className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 rounded-xl text-slate-600 hover:text-blue-600 hover:border-blue-200 transition-colors">
                      <Mail size={16} />
                      <span>support@tripro.app</span>
                  </a>
                  <a href="tel:+201008495405" className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 rounded-xl text-slate-600 hover:text-blue-600 hover:border-blue-200 transition-colors">
                      <Phone size={16} />
                      <span>+20 100 849 5405</span>
                  </a>
              </div>
              
              <p className="text-xs text-slate-400 mt-8 text-center">TriPro Software © {new Date().getFullYear()}. جميع الحقوق محفوظة</p>
          </div>
      </div>
    </div>
  );
};

export default About;

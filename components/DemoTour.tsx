import React, { useState, useEffect } from 'react';
import { useAccounting } from '../context/AccountingContext';
import { X, ChevronLeft } from 'lucide-react';

const TOUR_STEPS = [
    {
        target: 'aside', 
        title: 'القائمة الجانبية',
        content: 'هنا تجد جميع أقسام النظام: المبيعات، المشتريات، المخزون، والتقارير.',
        position: 'left'
    },
    {
        target: 'header',
        title: 'شريط الأدوات',
        content: 'يحتوي على التنبيهات، البحث، ومعلومات المستخدم.',
        position: 'bottom'
    },
    {
        target: '.dashboard-stats',
        title: 'لوحة القيادة',
        content: 'نظرة سريعة على أداء الشركة، المبيعات، والمصروفات.',
        position: 'bottom'
    },
    {
        target: '.quick-actions',
        title: 'الوصول السريع',
        content: 'أزرار مختصرة لإنشاء الفواتير والسندات بسرعة.',
        position: 'top'
    }
];

export const DemoTour = () => {
    const { currentUser } = useAccounting();
    const [currentStep, setCurrentStep] = useState(-1);
    const [style, setStyle] = useState<React.CSSProperties>({});
    const [isVisible, setIsVisible] = useState(false);

    useEffect(() => {
        const handleStart = () => {
            setCurrentStep(0);
            setIsVisible(true);
        };

        window.addEventListener('start-demo-tour', handleStart);
        return () => window.removeEventListener('start-demo-tour', handleStart);
    }, []);

    useEffect(() => {
        if (currentStep >= 0 && currentStep < TOUR_STEPS.length) {
            const step = TOUR_STEPS[currentStep];
            const element = document.querySelector(step.target);
            
            if (element) {
                const rect = element.getBoundingClientRect();
                setStyle({
                    top: rect.top,
                    left: rect.left,
                    width: rect.width,
                    height: rect.height,
                });
                element.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
        } else if (currentStep >= TOUR_STEPS.length) {
            finishTour();
        }
    }, [currentStep]);

    const finishTour = () => {
        setIsVisible(false);
        setCurrentStep(-1);
        localStorage.setItem('demo_tour_seen', 'true');
    };

    if (!isVisible || currentStep < 0 || !TOUR_STEPS[currentStep]) return null;

    const step = TOUR_STEPS[currentStep];

    // حساب موقع النافذة المنبثقة
    const tooltipStyle: React.CSSProperties = {
        position: 'fixed',
        zIndex: 10000,
        width: '300px'
    };

    if (step.position === 'bottom') {
        tooltipStyle.top = (style.top as number) + (style.height as number) + 20;
        tooltipStyle.left = (style.left as number);
    } else if (step.position === 'top') {
        tooltipStyle.bottom = window.innerHeight - (style.top as number) + 20;
        tooltipStyle.left = (style.left as number);
    } else if (step.position === 'left') {
        tooltipStyle.top = (style.top as number);
        tooltipStyle.right = window.innerWidth - (style.left as number) + 20;
    }

    return (
        <>
            {/* Highlight Box Overlay */}
            <div 
                className="fixed z-[9999] border-4 border-blue-500 rounded-lg shadow-[0_0_0_9999px_rgba(0,0,0,0.7)] transition-all duration-300 pointer-events-none"
                style={{ ...style }}
            ></div>

            {/* Tooltip */}
            <div className="bg-white p-6 rounded-2xl shadow-2xl animate-in fade-in zoom-in-95 duration-300 border border-slate-100" style={tooltipStyle}>
                <div className="flex justify-between items-start mb-2">
                    <h3 className="font-black text-lg text-slate-800">{step.title}</h3>
                    <button onClick={finishTour} className="text-slate-400 hover:text-red-500"><X size={20} /></button>
                </div>
                <p className="text-slate-600 text-sm mb-6 leading-relaxed">{step.content}</p>
                
                <div className="flex justify-between items-center">
                    <span className="text-xs font-bold text-slate-400">خطوة {currentStep + 1} من {TOUR_STEPS.length}</span>
                    <div className="flex gap-2">
                        {currentStep > 0 && (
                            <button onClick={() => setCurrentStep(p => p - 1)} className="px-3 py-2 rounded-lg text-slate-600 hover:bg-slate-100 font-bold text-sm">السابق</button>
                        )}
                        <button onClick={() => setCurrentStep(p => p + 1)} className="px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 font-bold text-sm flex items-center gap-1">
                            {currentStep === TOUR_STEPS.length - 1 ? 'إنهاء' : 'التالي'}
                            {currentStep < TOUR_STEPS.length - 1 && <ChevronLeft size={16} />}
                        </button>
                    </div>
                </div>
            </div>
        </>
    );
};

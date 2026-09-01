import React, { useState, useEffect, memo } from 'react';
import { scaleService, ScaleReading, ScaleConfig } from '../../services/scaleService';
import { useToast } from '../../../../context/ToastContext';
import { Scale, X, Check, RefreshCw, Power, Radio, Sliders, ShieldCheck, CheckCircle2 } from 'lucide-react';

interface ScaleConnectModalProps {
  isOpen: boolean;
  onClose: () => void;
  onApplyWeight?: (weight: number) => void;
}

// 📟 Separate memoized Digital LCD Display to prevent jittering of config controls
const ScaleDisplayScreen = memo(({ reading }: { reading: ScaleReading }) => {
  return (
    <div className="bg-slate-950 border-2 border-emerald-500/40 rounded-3xl p-6 text-center space-y-2 shadow-inner">
      <div className="flex justify-between items-center text-xs text-slate-400 font-bold">
        <span className="flex items-center gap-2">
          <span className={`w-3 h-3 rounded-full ${reading.connected ? 'bg-emerald-400 animate-ping' : 'bg-rose-500'}`} />
          <span className={reading.connected ? 'text-emerald-400 font-black' : 'text-slate-500'}>
            {reading.connected ? 'متصل بالميزان (Online)' : 'غير متصل (Offline)'}
          </span>
        </span>
        <span className={reading.isStable ? 'text-emerald-400 font-bold' : 'text-amber-400 font-bold'}>
          {reading.isStable ? '🟢 وزن مستقر (Stable)' : '🟡 جاري الوزن (Motion)'}
        </span>
      </div>

      <div className="py-4">
        <span className="font-mono text-6xl font-black text-emerald-400 tracking-wider drop-shadow-md">
          {reading.weight.toFixed(3)}
        </span>
        <span className="text-emerald-500 font-black text-xl mr-2">كجم (Kg)</span>
      </div>

      {reading.raw && (
        <div className="text-[10px] font-mono text-slate-500 bg-slate-900/80 px-3 py-1 rounded-xl truncate">
          بيانات المنفذ: {reading.raw}
        </div>
      )}
    </div>
  );
});

export default function ScaleConnectModal({ isOpen, onClose, onApplyWeight }: ScaleConnectModalProps) {
  const { showToast } = useToast();
  const [scaleReading, setScaleReading] = useState<ScaleReading>(scaleService.currentReading);
  const [isConnecting, setIsConnecting] = useState(false);
  const [config, setConfig] = useState<ScaleConfig>({
    baudRate: 9600,
    protocol: 'STANDARD'
  });

  // Throttled subscription to prevent rapid re-rendering
  useEffect(() => {
    let lastUpdate = 0;
    const unsubscribe = scaleService.subscribe(reading => {
      const now = Date.now();
      // Throttle updates to at most once per 100ms for stable rendering
      if (now - lastUpdate > 100 || reading.connected !== scaleReading.connected) {
        lastUpdate = now;
        setScaleReading({ ...reading });
      }
    });
    return () => unsubscribe();
  }, []);

  if (!isOpen) return null;

  const handleConnect = async () => {
    setIsConnecting(true);
    try {
      await scaleService.connect(config);
      showToast('تم الاتصال بالميزان الإلكتروني بنجاح ⚖️✅', 'success');
    } catch (err: any) {
      showToast(err.message || 'فشل الاتصال بالميزان', 'error');
    } finally {
      setIsConnecting(false);
    }
  };

  const handleDisconnect = async () => {
    await scaleService.disconnect();
    showToast('تم فصل الاتصال بالميزان', 'info');
  };

  const handleZero = async () => {
    await scaleService.sendCommand('ZERO');
    showToast('تم إرسال أمر التصفير (Zero)', 'info');
  };

  const handleTare = async () => {
    await scaleService.sendCommand('TARE');
    showToast('تم إرسال أمر خصم وزن العبوة (Tare)', 'info');
  };

  const baudRates = [
    { value: 9600, label: '9600 (الافتراضي والشائع)' },
    { value: 4800, label: '4800 (موازين قديمة)' },
    { value: 19200, label: '19200 (موازين سريعة)' },
    { value: 38400, label: '38400 (هاي سبيد)' },
  ];

  const protocols: Array<{ value: 'STANDARD' | 'DIBAL' | 'GENERIC_NUMERIC'; label: string; desc: string }> = [
    { value: 'STANDARD', label: 'قياسي عام (CAS / Toledo)', desc: 'أغلب موازين الكاشير والباركود' },
    { value: 'DIBAL', label: 'ديبال / ديجي (Dibal / Digi)', desc: 'موازين السوبرماركت الإسبانية' },
    { value: 'GENERIC_NUMERIC', label: 'أرقام فقط (Generic Numeric)', desc: 'لأي ميزان يرسل الوزن كنص رقمي' },
  ];

  return (
    <div className="fixed inset-0 bg-slate-950/85 backdrop-blur-sm z-50 flex items-center justify-center p-4" dir="rtl">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-lg w-full p-6 space-y-5 shadow-2xl animate-in zoom-in-95">
        
        {/* Header */}
        <div className="flex justify-between items-center pb-3 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-emerald-950 text-emerald-400 rounded-2xl border border-emerald-800">
              <Scale size={22} />
            </div>
            <div>
              <h2 className="font-black text-base text-white">إعدادات وربط الميزان الإلكتروني المباشر</h2>
              <p className="text-[11px] text-slate-400">توصيل ميزان الكاشير عبر منفذ USB / COM وقراءة الوزن لحظياً</p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white p-1 rounded-xl hover:bg-slate-800 transition-all">
            <X size={20} />
          </button>
        </div>

        {/* 📟 Digital LCD Scale Display (Isolated Component) */}
        <ScaleDisplayScreen reading={scaleReading} />

        {/* ⚙️ Stable Interactive Selection Cards (No Jitter) */}
        <div className="space-y-4">
          
          {/* 1. Baud Rate Selector */}
          <div>
            <label className="block text-xs font-black text-slate-300 mb-1.5 flex items-center gap-1.5">
              <Sliders size={14} className="text-indigo-400" />
              سرعة نقل البيانات (Baud Rate):
            </label>
            <div className="grid grid-cols-2 gap-2">
              {baudRates.map(b => {
                const isSelected = config.baudRate === b.value;
                return (
                  <button
                    key={b.value}
                    type="button"
                    disabled={scaleReading.connected}
                    onClick={() => setConfig(prev => ({ ...prev, baudRate: b.value }))}
                    className={`p-2.5 rounded-xl border text-right transition-all flex items-center justify-between ${
                      isSelected
                        ? 'bg-indigo-950/80 border-indigo-500 text-white shadow-md shadow-indigo-950'
                        : 'bg-slate-950 hover:bg-slate-850 border-slate-800 text-slate-400'
                    } ${scaleReading.connected ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'}`}
                  >
                    <div>
                      <span className="font-mono font-bold text-xs block">{b.value}</span>
                      <span className="text-[10px] text-slate-500">{b.label.split('(')[1]?.replace(')', '') || ''}</span>
                    </div>
                    {isSelected && <CheckCircle2 size={16} className="text-indigo-400" />}
                  </button>
                );
              })}
            </div>
          </div>

          {/* 2. Scale Protocol Selector */}
          <div>
            <label className="block text-xs font-black text-slate-300 mb-1.5 flex items-center gap-1.5">
              <Radio size={14} className="text-cyan-400" />
              نوع وبروتوكول الميزان (Scale Model):
            </label>
            <div className="space-y-2">
              {protocols.map(p => {
                const isSelected = config.protocol === p.value;
                return (
                  <button
                    key={p.value}
                    type="button"
                    disabled={scaleReading.connected}
                    onClick={() => setConfig(prev => ({ ...prev, protocol: p.value }))}
                    className={`w-full p-2.5 rounded-xl border text-right transition-all flex items-center justify-between ${
                      isSelected
                        ? 'bg-cyan-950/70 border-cyan-500 text-white shadow-md shadow-cyan-950'
                        : 'bg-slate-950 hover:bg-slate-850 border-slate-800 text-slate-400'
                    } ${scaleReading.connected ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'}`}
                  >
                    <div>
                      <span className="font-bold text-xs text-slate-200 block">{p.label}</span>
                      <span className="text-[10px] text-slate-500">{p.desc}</span>
                    </div>
                    {isSelected && <CheckCircle2 size={16} className="text-cyan-400" />}
                  </button>
                );
              })}
            </div>
          </div>

        </div>

        {/* Scale Controls */}
        {scaleReading.connected ? (
          <div className="grid grid-cols-3 gap-2 pt-2 border-t border-slate-800">
            <button
              onClick={handleZero}
              className="p-3 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-bold transition-all shadow-sm"
            >
              تصفير (Zero)
            </button>
            <button
              onClick={handleTare}
              className="p-3 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-bold transition-all shadow-sm"
            >
              خصم العبوة (Tare)
            </button>
            <button
              onClick={handleDisconnect}
              className="p-3 bg-rose-950/80 hover:bg-rose-900 border border-rose-900 text-rose-300 rounded-xl text-xs font-bold transition-all shadow-sm"
            >
              فصل الميزان
            </button>
          </div>
        ) : (
          <button
            onClick={handleConnect}
            disabled={isConnecting}
            className="w-full bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-black py-3.5 rounded-2xl text-xs flex items-center justify-center gap-2 shadow-lg shadow-emerald-600/20 transition-all"
          >
            <Scale size={18} />
            {isConnecting ? 'جاري فتح منفذ السيريال...' : 'ربط منفذ الميزان (اختيار USB / COM Port)'}
          </button>
        )}

        {/* Apply Weight Button */}
        {onApplyWeight && (
          <button
            onClick={() => {
              if (scaleReading.weight <= 0) {
                showToast('الوزن الحالي صفر', 'warning');
                return;
              }
              onApplyWeight(scaleReading.weight);
              onClose();
            }}
            className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-black py-3 rounded-2xl text-xs flex items-center justify-center gap-2 shadow-lg shadow-indigo-600/20 transition-all"
          >
            <Check size={16} /> تطبيق الوزن الحالي ({scaleReading.weight.toFixed(3)} كجم) على الصنف
          </button>
        )}

      </div>
    </div>
  );
}

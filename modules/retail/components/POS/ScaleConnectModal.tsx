import React, { useState, useEffect } from 'react';
import { scaleService, ScaleReading, ScaleConfig } from '../../services/scaleService';
import { useToast } from '../../../../context/ToastContext';
import { Scale, X, Check, RefreshCw, Power, Radio, Sliders, ShieldCheck } from 'lucide-react';

interface ScaleConnectModalProps {
  isOpen: boolean;
  onClose: () => void;
  onApplyWeight?: (weight: number) => void;
}

export default function ScaleConnectModal({ isOpen, onClose, onApplyWeight }: ScaleConnectModalProps) {
  const { showToast } = useToast();
  const [scaleReading, setScaleReading] = useState<ScaleReading>(scaleService.currentReading);
  const [isConnecting, setIsConnecting] = useState(false);
  const [config, setConfig] = useState<ScaleConfig>({
    baudRate: 9600,
    protocol: 'STANDARD'
  });

  useEffect(() => {
    const unsubscribe = scaleService.subscribe(reading => {
      setScaleReading(reading);
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

  return (
    <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4" dir="rtl">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-md w-full p-6 space-y-6 shadow-2xl">
        
        {/* Header */}
        <div className="flex justify-between items-center pb-3 border-b border-slate-800">
          <h2 className="font-black text-base text-white flex items-center gap-2">
            <Scale size={20} className="text-emerald-400" />
            إعدادات وربط الميزان الإلكتروني المباشر (Direct Serial Scale)
          </h2>
          <button onClick={onClose} className="text-slate-400 hover:text-white">
            <X size={20} />
          </button>
        </div>

        {/* 📟 Digital LCD Scale Display */}
        <div className="bg-slate-950 border-2 border-emerald-500/30 rounded-2xl p-6 text-center space-y-2 shadow-inner">
          <div className="flex justify-between items-center text-[11px] text-slate-500 font-bold">
            <span className="flex items-center gap-1.5">
              <span className={`w-2 h-2 rounded-full ${scaleReading.connected ? 'bg-emerald-500 animate-pulse' : 'bg-red-500'}`} />
              {scaleReading.connected ? 'متصل (Online)' : 'غير متصل (Offline)'}
            </span>
            <span>{scaleReading.isStable ? '🟢 وزن ثابت (Stable)' : '🟡 جاري الوزن (Motion)'}</span>
          </div>

          <div className="py-4">
            <span className="font-mono text-5xl font-black text-emerald-400 tracking-wider">
              {scaleReading.weight.toFixed(3)}
            </span>
            <span className="text-emerald-500 font-black text-lg mr-2">كجم (Kg)</span>
          </div>

          {scaleReading.raw && (
            <div className="text-[10px] font-mono text-slate-600 truncate">
              Raw Data: {scaleReading.raw}
            </div>
          )}
        </div>

        {/* Configuration settings */}
        <div className="space-y-3 text-xs">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-slate-400 font-bold mb-1">سرعة المنفذ (Baud Rate)</label>
              <select
                value={config.baudRate}
                disabled={scaleReading.connected}
                onChange={e => setConfig({ ...config, baudRate: parseInt(e.target.value) })}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-white outline-none"
              >
                <option value={9600}>9600 (افتراضي)</option>
                <option value={4800}>4800</option>
                <option value={19200}>19200</option>
                <option value={38400}>38400</option>
              </select>
            </div>

            <div>
              <label className="block text-slate-400 font-bold mb-1">بروتوكول الميزان</label>
              <select
                value={config.protocol}
                disabled={scaleReading.connected}
                onChange={e => setConfig({ ...config, protocol: e.target.value as any })}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-white outline-none"
              >
                <option value="STANDARD">قياسي / عام (CAS / Toledo)</option>
                <option value="DIBAL">ديبال / ديجي (Dibal / Digi)</option>
                <option value="GENERIC_NUMERIC">أرقام فقط (Generic Numeric)</option>
              </select>
            </div>
          </div>
        </div>

        {/* Scale Controls */}
        {scaleReading.connected ? (
          <div className="grid grid-cols-3 gap-2">
            <button
              onClick={handleZero}
              className="p-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-bold transition-all"
            >
              تصفير (Zero)
            </button>
            <button
              onClick={handleTare}
              className="p-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-bold transition-all"
            >
              خصم العبوة (Tare)
            </button>
            <button
              onClick={handleDisconnect}
              className="p-2.5 bg-rose-950/80 hover:bg-rose-900 border border-rose-900 text-rose-300 rounded-xl text-xs font-bold transition-all"
            >
              فصل الميزان
            </button>
          </div>
        ) : (
          <button
            onClick={handleConnect}
            disabled={isConnecting}
            className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-black py-3 rounded-2xl text-xs flex items-center justify-center gap-2 shadow-lg shadow-emerald-600/20 transition-all"
          >
            <Scale size={16} />
            {isConnecting ? 'جاري الاتصال...' : 'ربط منفذ الميزان (USB / COM Port)'}
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

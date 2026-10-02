import React from 'react';
import { Activity, Thermometer, Droplets, HeartPulse } from 'lucide-react';

interface VitalsProps {
  vitals: {
    temp: string;
    bp: string;
    pulse: string;
    spo2: string;
    weight: string;
  };
  onChange: (vitals: Record<string, any>) => void;
}

const VitalsForm: React.FC<VitalsProps> = ({ vitals, onChange }) => {
  const handleChange = (key: string, value: string) => {
    onChange({ ...vitals, [key]: value });
  };

  return (
    <div className="bg-slate-50 p-6 rounded-3xl border border-slate-200 space-y-4">
      <h4 className="font-black text-slate-700 flex items-center gap-2 mb-4">
        <Activity size={18} className="text-red-500" /> Ø§Ù„Ù…Ø¤Ø´Ø±Ø§Øª Ø§Ù„Ø­ÙŠÙˆÙŠØ© (Vitals)
      </h4>
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <div className="space-y-1">
          <label className="text-[10px] font-black text-slate-500 flex items-center gap-1">
            <Thermometer size={12} /> Ø§Ù„Ø­Ø±Ø§Ø±Ø© (Â°C)
          </label>
          <input 
            type="text" placeholder="37.0"
            className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-red-500 outline-none font-bold text-center"
            value={vitals.temp} onChange={e => handleChange('temp', e.target.value)}
          />
        </div>
        <div className="space-y-1">
          <label className="text-[10px] font-black text-slate-500 flex items-center gap-1">
            <HeartPulse size={12} /> Ø§Ù„Ø¶ØºØ· (mmHg)
          </label>
          <input 
            type="text" placeholder="120/80"
            className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-red-500 outline-none font-bold text-center"
            value={vitals.bp} onChange={e => handleChange('bp', e.target.value)}
          />
        </div>
        <div className="space-y-1">
          <label className="text-[10px] font-black text-slate-500 flex items-center gap-1">
            <Activity size={12} /> Ø§Ù„Ù†Ø¨Ø¶ (bpm)
          </label>
          <input 
            type="text" placeholder="72"
            className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-red-500 outline-none font-bold text-center"
            value={vitals.pulse} onChange={e => handleChange('pulse', e.target.value)}
          />
        </div>
        <div className="space-y-1">
          <label className="text-[10px] font-black text-slate-500 flex items-center gap-1">
            <Droplets size={12} /> Ø§Ù„Ø£ÙƒØ³Ø¬ÙŠÙ† (%)
          </label>
          <input 
            type="text" placeholder="98"
            className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-red-500 outline-none font-bold text-center"
            value={vitals.spo2} onChange={e => handleChange('spo2', e.target.value)}
          />
        </div>
        <div className="space-y-1">
          <label className="text-[10px] font-black text-slate-500">Ø§Ù„ÙˆØ²Ù† (kg)</label>
          <input 
            type="text" placeholder="70"
            className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-red-500 outline-none font-bold text-center"
            value={vitals.weight} onChange={e => handleChange('weight', e.target.value)}
          />
        </div>
      </div>
    </div>
  );
};

export default VitalsForm;

import React, { useState, useEffect, useRef } from 'react';
import { Modal, Slider, Button, Tooltip, Tag, Typography, Tabs, Input, message } from 'antd';
import {
  ZoomInOutlined, ZoomOutOutlined, RotateRightOutlined, RedoOutlined,
  BgColorsOutlined, EyeOutlined, FileTextOutlined, DownloadOutlined,
  FullscreenOutlined, CheckCircleOutlined, AlertOutlined, CameraOutlined,
  PlayCircleOutlined, PauseCircleOutlined, ColumnWidthOutlined, LeftOutlined, RightOutlined
} from '@ant-design/icons';
import { Activity, Sparkles, Brain, Bone, Wind, Layers, Ruler, ShieldCheck } from 'lucide-react';

const { TextArea } = Input;
const { Text } = Typography;

interface PACSViewerModalProps {
  visible: boolean;
  onClose: () => void;
  order: any;
  onSaveReport?: (reportText: string, impressions: string) => Promise<void>;
}

// Windowing Presets (HU Windows)
const WINDOW_PRESETS = [
  { key: 'SOFT_TISSUE', label: 'أنسجة رخوة (Soft Tissue)', icon: Layers, contrast: 100, brightness: 100, filter: 'contrast(1.2) brightness(1.0)' },
  { key: 'BONE', label: 'نافذة عظام (Bone Window)', icon: Bone, contrast: 160, brightness: 120, filter: 'contrast(1.8) brightness(1.3) grayscale(1)' },
  { key: 'LUNG', label: 'نافذة رئة (Lung Window)', icon: Wind, contrast: 140, brightness: 80, filter: 'contrast(1.5) brightness(0.75) invert(0.1)' },
  { key: 'BRAIN', label: 'نافذة دماغ ومخ (Brain Window)', icon: Brain, contrast: 120, brightness: 105, filter: 'contrast(1.3) brightness(1.1)' },
];

export const PACSViewerModal: React.FC<PACSViewerModalProps> = ({
  visible,
  onClose,
  order,
  onSaveReport
}) => {
  const [activeTab, setActiveTab] = useState<'VIEWER' | 'REPORT'>('VIEWER');
  
  // Image Transformations
  const [zoom, setZoom] = useState(1.0);
  const [rotate, setRotate] = useState(0);
  const [contrast, setContrast] = useState(100);
  const [brightness, setBrightness] = useState(100);
  const [inverted, setInverted] = useState(false);
  const [activePreset, setActivePreset] = useState('SOFT_TISSUE');

  // Slice Navigation (Multi-Slice CT/MRI)
  const totalSlices = 24;
  const [currentSlice, setCurrentSlice] = useState(12);
  const [isPlayingCine, setIsPlayingCine] = useState(false);

  // Measurement Tools
  const [rulerActive, setRulerActive] = useState(false);
  const [rulerPoints, setRulerPoints] = useState<{ x1: number; y1: number; x2: number; y2: number } | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [huProbe, setHuProbe] = useState<{ x: number; y: number; hu: number; tissue: string } | null>(null);

  // Radiology Report Form
  const [reportFindings, setReportFindings] = useState('');
  const [reportImpressions, setReportImpressions] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Canvas Ref
  const viewerRef = useRef<HTMLDivElement>(null);

  // Cine loop animation timer
  useEffect(() => {
    let timer: any;
    if (isPlayingCine) {
      timer = setInterval(() => {
        setCurrentSlice(prev => (prev % totalSlices) + 1);
      }, 150);
    }
    return () => clearInterval(timer);
  }, [isPlayingCine, totalSlices]);

  // Reset when order changes
  useEffect(() => {
    if (order) {
      setReportFindings(order.findings || '');
      setReportImpressions(order.impression || '');
      setZoom(1.0);
      setRotate(0);
      setContrast(100);
      setBrightness(100);
      setInverted(false);
      setRulerPoints(null);
      setRulerActive(false);
      setHuProbe(null);
      setCurrentSlice(12);
      setIsPlayingCine(false);
    }
  }, [order]);

  // Apply Window Preset
  const handleApplyPreset = (preset: typeof WINDOW_PRESETS[0]) => {
    setActivePreset(preset.key);
    setContrast(preset.contrast);
    setBrightness(preset.brightness);
    message.info(`تم تفعيل ${preset.label}`);
  };

  // Mouse HU Density Probe Simulation
  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!viewerRef.current) return;
    const rect = viewerRef.current.getBoundingClientRect();
    const x = Math.round(e.clientX - rect.left);
    const y = Math.round(e.clientY - rect.top);

    // Dynamic HU estimation based on position and active window
    const normalizedDist = Math.hypot(x - rect.width / 2, y - rect.height / 2);
    let estimatedHU = 40; // Soft tissue default
    let tissueType = 'أنسجة عضلية / رخوة (Soft Tissue)';

    if (activePreset === 'BONE' || normalizedDist < 80) {
      estimatedHU = Math.round(400 + Math.sin(x * y) * 350);
      tissueType = 'كثافة عظمية / تكلس (Cortical Bone)';
    } else if (activePreset === 'LUNG') {
      estimatedHU = Math.round(-650 + Math.cos(x) * 150);
      tissueType = 'أنسجة هوائية / رئة (Lung Parenchyma)';
    } else if (normalizedDist > 160) {
      estimatedHU = Math.round(-1000);
      tissueType = 'هواء خارجي (Air Background)';
    } else {
      estimatedHU = Math.round(35 + Math.sin(x + y) * 20);
      tissueType = 'كثافة سوائل / أنسجة دهنية (Fluid / Fat)';
    }

    setHuProbe({ x, y, hu: estimatedHU, tissue: tissueType });

    // Drawing Ruler
    if (rulerActive && isDrawing && rulerPoints) {
      setRulerPoints({ ...rulerPoints, x2: x, y2: y });
    }
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!rulerActive || !viewerRef.current) return;
    const rect = viewerRef.current.getBoundingClientRect();
    const x = Math.round(e.clientX - rect.left);
    const y = Math.round(e.clientY - rect.top);
    setRulerPoints({ x1: x, y1: y, x2: x, y2: y });
    setIsDrawing(true);
  };

  const handleMouseUp = () => {
    if (rulerActive && isDrawing) {
      setIsDrawing(false);
    }
  };

  // Distance calculation
  const rulerDistanceMm = rulerPoints
    ? Math.round(Math.hypot(rulerPoints.x2 - rulerPoints.x1, rulerPoints.y2 - rulerPoints.y1) * 0.45 * 10) / 10
    : null;

  // AI Diagnostic Assist
  const handleGenerateAIReport = () => {
    const modality = order?.scan_type || order?.modality || 'CT Chest with Contrast';
    const patient = order?.hims_visits?.hims_patients?.full_name || 'المريض';

    setReportFindings(`الفحص الإشعاعي: ${modality}
المريض: ${patient}
تاريخ الفحص: ${new Date().toISOString().split('T')[0]}

1. فحص المقاطع المحورية عالية الدقة:
- لا توجد دلائل على وجود انصباب جنبي أو ارتشاح رئوي نشط.
- التوزيع الوعائي والقصبي طبيعي وكثافة الأنسجة الرخوة ضمن الحدود الفسيولوجية.
- الهيكل العظمي للقفص الصدري سليم وخالٍ من الكسور أو الآفات التحللية.`);

    setReportImpressions(`الخلاصة التشخيصية (Impression):
✅ دراسة إشعاعية مطمئنة وخالية من الآفات الكتلية أو التغيرات الالتهابية الحادة.
كود التشخيص المقترح (ICD-10): Z01.89 (Encounters for other specified special examinations)`);

    message.success('تم توليد مسودة التقرير الإشعاعي بواسطة المساعد الذكي 🩺✨');
  };

  // Submit Final Report
  const handleSaveReportSubmit = async () => {
    if (!reportFindings.trim()) {
      message.warning('يرجى كتابة الملاحظات التشخيصية قبل الاعتماد');
      return;
    }
    setIsSubmitting(true);
    try {
      if (onSaveReport) {
        await onSaveReport(reportFindings, reportImpressions);
      }
      message.success('تم اعتماد وحفظ التقرير الإشعاعي وإرساله لملف المريض بنجاح ✅');
      onClose();
    } catch (err: any) {
      message.error('فشل حفظ التقرير: ' + err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal
      open={visible}
      onCancel={onClose}
      width={1200}
      footer={null}
      centered
      styles={{
        body: {
          padding: 0,
          height: '82vh',
          backgroundColor: '#020617',
          color: '#f8fafc',
          borderRadius: '1rem',
          overflow: 'hidden'
        }
      }}
    >
      <div className="flex flex-col h-full select-none" dir="rtl">
        
        {/* 🏷️ Top PACS Header Bar */}
        <div className="bg-slate-950 border-b border-slate-800 p-3 px-5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-indigo-600/20 text-indigo-400 rounded-xl border border-indigo-500/30">
              <CameraOutlined style={{ fontSize: 18 }} />
            </div>
            <div>
              <div className="flex items-center gap-2 font-black text-sm text-white">
                <span>{order?.hims_visits?.hims_patients?.full_name || 'مريض فحص إشعاعي'}</span>
                <Tag color="cyan" className="font-mono text-xs">{order?.scan_type || 'CT Scan (PACS DICOM)'}</Tag>
                <Tag color="purple" className="font-mono text-[10px]">MRN: #{order?.hims_visits?.hims_patients?.id?.slice(0, 8) || 'P-9801'}</Tag>
              </div>
              <div className="text-[11px] text-slate-400 mt-0.5 flex items-center gap-3 font-mono">
                <span>Acc#: {order?.id?.slice(0, 8) || 'ACC-2026-4401'}</span>
                <span>• المقطع: {currentSlice} / {totalSlices}</span>
                <span>• W/L: {contrast}/{brightness}</span>
              </div>
            </div>
          </div>

          {/* Tab Switcher & Actions */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => setActiveTab('VIEWER')}
              className={`px-3.5 py-1.5 rounded-xl font-bold text-xs transition-all flex items-center gap-1.5 ${
                activeTab === 'VIEWER' ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/30' : 'bg-slate-900 text-slate-400 hover:text-white'
              }`}
            >
              <EyeOutlined /> عارض المقاطع (PACS)
            </button>
            <button
              onClick={() => setActiveTab('REPORT')}
              className={`px-3.5 py-1.5 rounded-xl font-bold text-xs transition-all flex items-center gap-1.5 ${
                activeTab === 'REPORT' ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/30' : 'bg-slate-900 text-slate-400 hover:text-white'
              }`}
            >
              <FileTextOutlined /> التقرير والتشخيص الإشعاعي
            </button>
          </div>
        </div>

        {/* 🖥️ MAIN CONTENT AREA */}
        {activeTab === 'VIEWER' ? (
          <div className="flex-1 flex overflow-hidden">
            
            {/* Left Toolbar / Diagnostic Controls */}
            <div className="w-64 bg-slate-950 border-l border-slate-800 p-4 space-y-4 overflow-y-auto text-xs">
              
              {/* Window Presets */}
              <div>
                <span className="font-black text-slate-300 block mb-2">نوافذ الكثافة (Window Presets)</span>
                <div className="grid grid-cols-1 gap-1.5">
                  {WINDOW_PRESETS.map(p => {
                    const Icon = p.icon;
                    const isSelected = activePreset === p.key;
                    return (
                      <button
                        key={p.key}
                        onClick={() => handleApplyPreset(p)}
                        className={`p-2 rounded-xl text-right flex items-center gap-2 border transition-all ${
                          isSelected ? 'bg-indigo-950/80 border-indigo-500 text-indigo-200' : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white'
                        }`}
                      >
                        <Icon size={14} className={isSelected ? 'text-indigo-400' : 'text-slate-500'} />
                        <span className="font-bold text-[11px] truncate">{p.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Tools Controls */}
              <div className="space-y-2 pt-2 border-t border-slate-850">
                <span className="font-black text-slate-300 block mb-1">أدوات المعاينة والقياس</span>
                
                <div className="grid grid-cols-2 gap-1.5">
                  <button
                    onClick={() => setZoom(prev => Math.min(3.0, prev + 0.2))}
                    className="p-2 bg-slate-900 hover:bg-slate-800 border border-slate-800 rounded-xl text-slate-300 flex items-center justify-center gap-1"
                    title="تكبير"
                  >
                    <ZoomInOutlined /> +{Math.round(zoom * 100)}%
                  </button>
                  <button
                    onClick={() => setZoom(prev => Math.max(0.5, prev - 0.2))}
                    className="p-2 bg-slate-900 hover:bg-slate-800 border border-slate-800 rounded-xl text-slate-300 flex items-center justify-center gap-1"
                    title="تصغير"
                  >
                    <ZoomOutOutlined /> تصغير
                  </button>
                  <button
                    onClick={() => setRotate(prev => (prev + 90) % 360)}
                    className="p-2 bg-slate-900 hover:bg-slate-800 border border-slate-800 rounded-xl text-slate-300 flex items-center justify-center gap-1"
                    title="تدوير 90°"
                  >
                    <RotateRightOutlined /> {rotate}°
                  </button>
                  <button
                    onClick={() => setInverted(!inverted)}
                    className={`p-2 border rounded-xl flex items-center justify-center gap-1 transition-all ${
                      inverted ? 'bg-amber-950/80 border-amber-500 text-amber-300' : 'bg-slate-900 border-slate-800 text-slate-300'
                    }`}
                    title="عكس الألوان (Invert)"
                  >
                    <BgColorsOutlined /> عكس
                  </button>
                </div>

                <button
                  onClick={() => {
                    setRulerActive(!rulerActive);
                    if (rulerActive) setRulerPoints(null);
                  }}
                  className={`w-full p-2.5 rounded-xl font-bold flex items-center justify-center gap-2 border transition-all ${
                    rulerActive ? 'bg-cyan-950 border-cyan-500 text-cyan-300 shadow-md shadow-cyan-950' : 'bg-slate-900 border-slate-800 text-slate-300 hover:text-white'
                  }`}
                >
                  <Ruler size={14} />
                  {rulerActive ? 'المسطرة مفعلة (انقر واسحب)' : 'تفعيل مسطرة القياس (Caliper)'}
                </button>

                <button
                  onClick={() => {
                    setZoom(1.0);
                    setRotate(0);
                    setContrast(100);
                    setBrightness(100);
                    setInverted(false);
                    setRulerPoints(null);
                    setRulerActive(false);
                  }}
                  className="w-full p-2 bg-slate-900 hover:bg-slate-850 border border-slate-800 rounded-xl text-slate-400 hover:text-white flex items-center justify-center gap-1.5 text-[11px]"
                >
                  <RedoOutlined /> إعادة ضبط الصورة
                </button>
              </div>

              {/* Contrast & Brightness Sliders */}
              <div className="space-y-3 pt-2 border-t border-slate-850">
                <div>
                  <div className="flex justify-between text-[10px] text-slate-400 font-mono mb-1">
                    <span>التباين (Contrast)</span>
                    <span>{contrast}%</span>
                  </div>
                  <Slider min={50} max={200} value={contrast} onChange={setContrast} />
                </div>

                <div>
                  <div className="flex justify-between text-[10px] text-slate-400 font-mono mb-1">
                    <span>السطوع (Brightness)</span>
                    <span>{brightness}%</span>
                  </div>
                  <Slider min={50} max={200} value={brightness} onChange={setBrightness} />
                </div>
              </div>

            </div>

            {/* Central DICOM Viewport Canvas */}
            <div
              ref={viewerRef}
              onMouseMove={handleMouseMove}
              onMouseDown={handleMouseDown}
              onMouseUp={handleMouseUp}
              className="flex-1 bg-black relative flex items-center justify-center overflow-hidden cursor-crosshair"
            >
              {/* Simulated Multi-Slice CT/MRI Scan Canvas */}
              <div
                style={{
                  transform: `scale(${zoom}) rotate(${rotate}deg)`,
                  filter: `${inverted ? 'invert(1)' : ''} contrast(${contrast}%) brightness(${brightness}%)`,
                  transition: isPlayingCine ? 'none' : 'transform 0.1s ease-out'
                }}
                className="relative w-[480px] h-[480px] rounded-full border border-slate-800/60 shadow-2xl flex items-center justify-center bg-radial from-slate-800 via-slate-950 to-black overflow-hidden"
              >
                {/* Dynamic Slice SVG Graphic */}
                <svg className="w-full h-full p-8 opacity-85" viewBox="0 0 400 400">
                  {/* Bone Ring */}
                  <circle cx="200" cy="200" r={160 - (currentSlice % 6) * 4} fill="none" stroke="#e2e8f0" strokeWidth="8" opacity="0.9" />
                  {/* Soft Tissue Interior */}
                  <ellipse cx="200" cy="200" rx={140 - (currentSlice % 8) * 3} ry={130 - (currentSlice % 5) * 4} fill="#1e293b" opacity="0.75" />
                  {/* Lung / Brain Cavities */}
                  <ellipse cx="140" cy="180" rx={45 + (currentSlice % 4) * 2} ry={55 - (currentSlice % 3) * 2} fill="#020617" stroke="#475569" strokeWidth="2" opacity="0.9" />
                  <ellipse cx="260" cy="180" rx={45 + (currentSlice % 4) * 2} ry={55 - (currentSlice % 3) * 2} fill="#020617" stroke="#475569" strokeWidth="2" opacity="0.9" />
                  {/* Spine / Vertebra */}
                  <circle cx="200" cy="300" r="22" fill="#f8fafc" opacity="0.95" />
                  <circle cx="200" cy="300" r="10" fill="#0f172a" />
                  {/* Vascular / Bronchial Branching */}
                  <path d="M 140 180 Q 120 150 110 130 M 140 180 Q 150 210 160 230 M 260 180 Q 280 150 290 130" stroke="#94a3b8" strokeWidth="2" fill="none" opacity="0.6" />
                </svg>

                {/* Drawn Caliper Ruler Overlay */}
                {rulerPoints && (
                  <svg className="absolute inset-0 w-full h-full pointer-events-none">
                    <line
                      x1={rulerPoints.x1}
                      y1={rulerPoints.y1}
                      x2={rulerPoints.x2}
                      y2={rulerPoints.y2}
                      stroke="#22d3ee"
                      strokeWidth="2.5"
                      strokeDasharray="4 2"
                    />
                    <circle cx={rulerPoints.x1} cy={rulerPoints.y1} r="4" fill="#22d3ee" />
                    <circle cx={rulerPoints.x2} cy={rulerPoints.y2} r="4" fill="#22d3ee" />
                    <text
                      x={(rulerPoints.x1 + rulerPoints.x2) / 2 + 10}
                      y={(rulerPoints.y1 + rulerPoints.y2) / 2 - 10}
                      fill="#22d3ee"
                      fontSize="12"
                      fontWeight="bold"
                      className="font-mono"
                    >
                      {rulerDistanceMm} mm
                    </text>
                  </svg>
                )}
              </div>

              {/* Viewport Corner HUD Badges */}
              <div className="absolute top-4 right-4 text-[10px] font-mono text-cyan-400/90 bg-slate-950/70 p-2 rounded-xl border border-slate-800/80 space-y-0.5">
                <div>MODALITY: {order?.scan_type?.slice(0, 10) || 'CT MULTI'}</div>
                <div>SLICE THICKNESS: 1.25 mm</div>
                <div>FOV: 350 mm</div>
                <div>KV: 120 | MA: 280</div>
              </div>

              <div className="absolute bottom-4 right-4 text-[10px] font-mono text-amber-400/90 bg-slate-950/70 p-2 rounded-xl border border-slate-800/80">
                {huProbe && (
                  <div className="space-y-0.5">
                    <div className="font-bold">كثافة النسيج: {huProbe.hu} HU</div>
                    <div className="text-[9px] text-slate-300">{huProbe.tissue}</div>
                  </div>
                )}
              </div>

              <div className="absolute top-4 left-4 text-[10px] font-mono text-slate-400 bg-slate-950/70 p-2 rounded-xl border border-slate-800/80 space-y-0.5">
                <div>WINDOW: {activePreset}</div>
                <div>WL: {contrast} / WW: {brightness}</div>
                <div>ZOOM: {Math.round(zoom * 100)}%</div>
              </div>

              {/* Bottom Cine Loop & Slice Controls Bar */}
              <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-slate-950/90 border border-slate-800 p-2 px-4 rounded-2xl flex items-center gap-3 backdrop-blur-md">
                <button
                  onClick={() => setIsPlayingCine(!isPlayingCine)}
                  className="p-1.5 text-white hover:text-indigo-400 transition-colors"
                  title={isPlayingCine ? 'إيقاف مؤقت' : 'تشغيل تلقائي (Cine Loop)'}
                >
                  {isPlayingCine ? <PauseCircleOutlined style={{ fontSize: 18 }} /> : <PlayCircleOutlined style={{ fontSize: 18 }} />}
                </button>

                <button
                  onClick={() => setCurrentSlice(prev => Math.max(1, prev - 1))}
                  className="p-1 text-slate-400 hover:text-white"
                >
                  <RightOutlined style={{ fontSize: 12 }} />
                </button>

                <div className="flex items-center gap-2 font-mono text-xs text-white">
                  <span className="w-12 text-center font-bold">#{currentSlice} / {totalSlices}</span>
                  <input
                    type="range"
                    min={1}
                    max={totalSlices}
                    value={currentSlice}
                    onChange={e => setCurrentSlice(Number(e.target.value))}
                    className="w-44 accent-indigo-500 cursor-pointer"
                  />
                </div>

                <button
                  onClick={() => setCurrentSlice(prev => Math.min(totalSlices, prev + 1))}
                  className="p-1 text-slate-400 hover:text-white"
                >
                  <LeftOutlined style={{ fontSize: 12 }} />
                </button>
              </div>

            </div>

          </div>
        ) : (
          /* 📝 TAB 2: STRUCTURED RADIOLOGY REPORTING */
          <div className="flex-1 bg-slate-900 p-6 overflow-y-auto space-y-4 text-xs">
            <div className="flex justify-between items-center bg-slate-950 p-4 rounded-2xl border border-slate-800">
              <div>
                <h3 className="text-base font-black text-white flex items-center gap-2">
                  <FileTextOutlined className="text-indigo-400" />
                  توثيق التقرير الإشعاعي المعتمد (Structured Radiology Report)
                </h3>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  كتابة التقرير التشخيصي واعتماد كود الـ ICD-10 للربط بملف المريض الإلكتروني وفاتورة التأمين.
                </p>
              </div>

              <button
                onClick={handleGenerateAIReport}
                className="px-4 py-2 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white rounded-xl font-bold text-xs shadow-lg shadow-purple-600/20 transition-all flex items-center gap-2"
              >
                <Sparkles size={15} />
                توليد المسودة الذكية (AI Assist)
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-slate-300 font-bold mb-1">الملاحظات والنتائج التفصيلية (Findings) *</label>
                <TextArea
                  rows={8}
                  value={reportFindings}
                  onChange={e => setReportFindings(e.target.value)}
                  placeholder="اكتب التقرير الإشعاعي التفصيلي للأنسجة، العظام، الأوعية الدموية..."
                  className="bg-slate-950 text-white border-slate-800 rounded-2xl font-mono text-xs"
                />
              </div>

              <div>
                <label className="block text-slate-300 font-bold mb-1">الخلاصة والتشخيص النهائي (Impression & ICD-10)</label>
                <TextArea
                  rows={4}
                  value={reportImpressions}
                  onChange={e => setReportImpressions(e.target.value)}
                  placeholder="الاستنتاج التشخيصي النهائي واقتراح خطة المتابعة..."
                  className="bg-slate-950 text-white border-slate-800 rounded-2xl font-mono text-xs"
                />
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-3 border-t border-slate-800">
              <button
                onClick={onClose}
                className="px-5 py-2.5 bg-slate-800 hover:bg-slate-750 text-slate-300 rounded-xl font-bold text-xs transition-all"
              >
                إغلاق
              </button>

              <button
                onClick={handleSaveReportSubmit}
                disabled={isSubmitting}
                className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-black text-xs shadow-lg shadow-emerald-600/20 transition-all flex items-center gap-2"
              >
                <ShieldCheck size={16} />
                اعتماد التقرير وترحيله لملف المريض
              </button>
            </div>

          </div>
        )}

      </div>
    </Modal>
  );
};

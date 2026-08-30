import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../../../supabaseClient';
import { useAccounting } from '../../../context/AccountingContext';
import { db } from '../../../services/offlineService';
import { 
  Barcode, 
  Sparkles, 
  Maximize, 
  Minimize, 
  Volume2, 
  Tag, 
  Clock, 
  CheckCircle, 
  AlertCircle,
  Package,
  ArrowRight
} from 'lucide-react';
import { Link } from 'react-router-dom';

export default function PriceCheckerKiosk() {
  const { organization, settings } = useAccounting();
  const currencySymbol = settings?.currency || 'ج.م';

  const [barcodeInput, setBarcodeInput] = useState('');
  const [scannedProduct, setScannedProduct] = useState<any | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [isFullScreen, setIsFullScreen] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);

  const inputRef = useRef<HTMLInputElement>(null);
  const resetTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Auto-focus barcode scanner input always
  useEffect(() => {
    const keepFocus = () => {
      if (document.activeElement !== inputRef.current) {
        inputRef.current?.focus();
      }
    };
    keepFocus();
    const interval = setInterval(keepFocus, 1000);
    window.addEventListener('click', keepFocus);
    return () => {
      clearInterval(interval);
      window.removeEventListener('click', keepFocus);
    };
  }, []);

  // Audio Beep
  const playBeep = () => {
    try {
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(1046.5, audioCtx.currentTime); // C6 clear chime
      gain.gain.setValueAtTime(0.15, audioCtx.currentTime);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start();
      osc.stop(audioCtx.currentTime + 0.12);
    } catch {
      // Audio fallback
    }
  };

  // Text-to-speech announcement (Arabic voice)
  const speakPrice = (text: string) => {
    if (!soundEnabled || !('speechSynthesis' in window)) return;
    try {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = 'ar-SA';
      utterance.rate = 1.0;
      window.speechSynthesis.speak(utterance);
    } catch {
      // Voice fallback
    }
  };

  // Barcode scale parser
  const parseWeightBarcode = (barcode: string) => {
    if (barcode.length === 13) {
      const prefix = barcode.substring(0, 2);
      const validPrefixes = ['20', '21', '22', '23', '24', '25', '26', '27', '28', '29', '99'];
      if (validPrefixes.includes(prefix)) {
        const productCode = barcode.substring(2, 7);
        const weightString = barcode.substring(7, 12);
        const weight = Number(weightString) / 1000;
        return { productCode, weight };
      }
    }
    return null;
  };

  const handleScan = async (e: React.FormEvent) => {
    e.preventDefault();
    const code = barcodeInput.trim();
    if (!code) return;

    setBarcodeInput('');
    playBeep();

    if (resetTimerRef.current) clearTimeout(resetTimerRef.current);

    // 1. Try local offline cache first for instant response
    try {
      let matched: any = null;
      let calculatedWeight: number | undefined;

      const scaleInfo = parseWeightBarcode(code);
      if (scaleInfo) {
        const { productCode, weight } = scaleInfo;
        calculatedWeight = weight;
        const allCached = await db.products.toArray();
        matched = allCached.find(p => p.sku === productCode || p.barcode === productCode || p.sku === code || p.barcode === code);
      } else {
        matched = await db.products.where('barcode').equals(code).first();
        if (!matched) {
          matched = await db.products.where('sku').equals(code).first();
        }
      }

      // 2. If not found in local cache, query Supabase
      if (!matched) {
        const { data: { session } } = await supabase.auth.getSession();
        const userOrgId = session?.user?.user_metadata?.org_id;

        let query = supabase.from('products').select('*');
        if (userOrgId) query = query.eq('organization_id', userOrgId);

        if (scaleInfo) {
          query = query.or(`sku.eq.${scaleInfo.productCode},barcode.eq.${scaleInfo.productCode},sku.eq.${code},barcode.eq.${code}`);
        } else {
          query = query.or(`barcode.eq.${code},sku.eq.${code}`);
        }

        const { data: remoteData } = await query.maybeSingle();
        matched = remoteData;
      }

      if (matched) {
        // Calculate offer price if active
        const now = new Date().toISOString().split('T')[0];
        const isOfferActive = matched.offer_price && matched.offer_price > 0 &&
          (!matched.offer_start_date || matched.offer_start_date <= now) &&
          (!matched.offer_end_date || matched.offer_end_date >= now);

        const currentPrice = isOfferActive ? Number(matched.offer_price) : Number(matched.sales_price || 0);
        const originalPrice = Number(matched.sales_price || 0);
        const totalPrice = calculatedWeight ? currentPrice * calculatedWeight : currentPrice;

        const productResult = {
          ...matched,
          isOfferActive,
          currentPrice,
          originalPrice,
          totalPrice,
          weight: calculatedWeight
        };

        setScannedProduct(productResult);
        setNotFound(false);

        // Voice announcement
        const speechText = isOfferActive 
          ? `عرض خاص! ${matched.name} بسعر ${totalPrice.toFixed(2)} ${currencySymbol}` 
          : `${matched.name} بسعر ${totalPrice.toFixed(2)} ${currencySymbol}`;
        speakPrice(speechText);

      } else {
        setScannedProduct(null);
        setNotFound(true);
        speakPrice('عفواً الصنف غير مسجل بالنظام');
      }

      // Reset to idle screen after 7 seconds
      resetTimerRef.current = setTimeout(() => {
        setScannedProduct(null);
        setNotFound(false);
      }, 7000);

    } catch (err) {
      console.error('Error scanning price:', err);
      setNotFound(true);
    }
  };

  const toggleFullScreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().then(() => setIsFullScreen(true));
    } else {
      document.exitFullscreen().then(() => setIsFullScreen(false));
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-white flex flex-col font-sans select-none overflow-hidden" dir="rtl">
      
      {/* Hidden Barcode Form (Always Focused) */}
      <form onSubmit={handleScan} className="opacity-0 absolute top-0 left-0 pointer-events-none">
        <input 
          ref={inputRef}
          type="text" 
          value={barcodeInput} 
          onChange={e => setBarcodeInput(e.target.value)} 
          autoFocus 
        />
      </form>

      {/* Top Header */}
      <header className="px-8 py-5 flex justify-between items-center bg-slate-900/60 backdrop-blur border-b border-slate-800/80">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 bg-indigo-600 rounded-2xl flex items-center justify-center shadow-lg shadow-indigo-500/20">
            <Barcode size={28} className="text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-black tracking-tight text-white flex items-center gap-2">
              {organization?.name || 'هايبر ماركت TriPro'}
              <span className="text-xs bg-indigo-950 text-indigo-400 border border-indigo-800 px-2 py-0.5 rounded-full">
                كاشف الأسعار الذاتي
              </span>
            </h1>
            <p className="text-xs text-slate-400 font-bold">امسح باركود أي صنف لمعرفة السعر والعروض فوراً</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button 
            onClick={() => setSoundEnabled(!soundEnabled)}
            className={`p-3 rounded-xl border transition-all ${
              soundEnabled ? 'bg-indigo-950 text-indigo-400 border-indigo-800' : 'bg-slate-900 text-slate-500 border-slate-800'
            }`}
            title="الصوت الناطق"
          >
            <Volume2 size={20} />
          </button>
          <button 
            onClick={toggleFullScreen}
            className="p-3 bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-800 rounded-xl transition-all"
            title="شاشة كاملة"
          >
            {isFullScreen ? <Minimize size={20} /> : <Maximize size={20} />}
          </button>
          <Link 
            to="/retail/pos"
            className="flex items-center gap-1 text-xs bg-slate-900 hover:bg-slate-800 text-slate-400 px-3 py-3 rounded-xl border border-slate-800 transition-all font-bold"
          >
            العودة للكاشير <ArrowRight size={14} />
          </Link>
        </div>
      </header>

      {/* Main Kiosk Body */}
      <main className="flex-1 flex items-center justify-center p-8">
        
        {/* State 1: Idle Screen (Waiting for Scan) */}
        {!scannedProduct && !notFound && (
          <div className="text-center space-y-8 max-w-lg animate-in fade-in duration-500">
            <div className="relative mx-auto w-48 h-48 flex items-center justify-center">
              {/* Radar pulse animation */}
              <div className="absolute inset-0 bg-indigo-600/20 rounded-full animate-ping duration-1000" />
              <div className="absolute inset-4 bg-indigo-600/10 rounded-full animate-pulse" />
              <div className="relative w-36 h-36 bg-slate-900 border-2 border-indigo-500/50 rounded-3xl flex flex-col items-center justify-center shadow-2xl shadow-indigo-500/20">
                <Barcode size={54} className="text-indigo-400 mb-2" />
                <div className="w-24 h-1 bg-red-500 rounded-full animate-pulse shadow-lg shadow-red-500" />
              </div>
            </div>

            <div className="space-y-3">
              <h2 className="text-4xl font-black text-white tracking-tight">مرر الباركود أمام الماسح الضوئي</h2>
              <p className="text-lg text-slate-400 font-bold">
                ضع استيكر الباركود أو بطاقة الميزان أسفل القارئ لمعرفة السعر والمواصفات
              </p>
            </div>

            <div className="flex justify-center gap-3 pt-4">
              <div className="bg-slate-900 border border-slate-800 px-4 py-2 rounded-xl text-xs text-slate-400 flex items-center gap-2 font-bold">
                <Sparkles size={14} className="text-amber-400" /> عروض وتخفيضات لحظية
              </div>
              <div className="bg-slate-900 border border-slate-800 px-4 py-2 rounded-xl text-xs text-slate-400 flex items-center gap-2 font-bold">
                <CheckCircle size={14} className="text-emerald-400" /> دعم موازين الباركود
              </div>
            </div>
          </div>
        )}

        {/* State 2: Scanned Product Display Card */}
        {scannedProduct && (
          <div className="w-full max-w-2xl bg-slate-900 border-2 border-indigo-500/40 rounded-3xl p-8 shadow-2xl shadow-indigo-500/10 space-y-8 animate-in zoom-in-95 duration-300">
            
            {/* Header Badge */}
            <div className="flex justify-between items-center border-b border-slate-800 pb-4">
              <div className="flex items-center gap-2">
                <span className="bg-indigo-950 text-indigo-400 border border-indigo-800 text-xs px-3 py-1 rounded-full font-bold">
                  {scannedProduct.category || 'قسم البقالة والتجزئة'}
                </span>
                {scannedProduct.sku && (
                  <span className="font-mono text-xs text-slate-400 bg-slate-950 px-3 py-1 rounded-full border border-slate-800">
                    كود: {scannedProduct.sku}
                  </span>
                )}
              </div>

              {scannedProduct.isOfferActive && (
                <div className="bg-red-600 text-white font-black text-xs px-4 py-1.5 rounded-full flex items-center gap-1.5 shadow-lg shadow-red-600/30 animate-bounce">
                  <Tag size={14} /> عرض خاص وخصم فوري!
                </div>
              )}
            </div>

            {/* Product Info */}
            <div className="flex gap-6 items-center">
              <div className="w-28 h-28 bg-slate-950 rounded-2xl border border-slate-800 flex items-center justify-center p-3 flex-shrink-0 shadow-inner">
                {scannedProduct.image_url ? (
                  <img src={scannedProduct.image_url} alt={scannedProduct.name} className="w-full h-full object-contain rounded-xl" />
                ) : (
                  <Package size={48} className="text-slate-600" />
                )}
              </div>

              <div className="space-y-2 flex-1">
                <h2 className="text-3xl font-black text-white leading-tight">{scannedProduct.name}</h2>
                {scannedProduct.weight ? (
                  <p className="text-slate-400 text-sm font-bold flex items-center gap-1 text-amber-400">
                    ⚖️ وزن العبوة: <span className="font-mono font-black">{scannedProduct.weight} كجم</span>
                  </p>
                ) : (
                  <p className="text-slate-400 text-sm font-bold">
                    الوحدة: {scannedProduct.unit || 'قطعة / عبوة'}
                  </p>
                )}
              </div>
            </div>

            {/* Price Showcase Block */}
            <div className="bg-slate-950 border border-slate-850 rounded-3xl p-6 flex justify-between items-center shadow-inner">
              <div>
                <span className="block text-xs font-black text-slate-400 mb-1">السعر النهائي للعميل</span>
                <div className="flex items-baseline gap-2">
                  <span className="text-6xl font-black font-mono text-emerald-400 tracking-tight">
                    {scannedProduct.totalPrice.toFixed(2)}
                  </span>
                  <span className="text-2xl font-bold text-emerald-500">{currencySymbol}</span>
                </div>
              </div>

              {scannedProduct.isOfferActive && (
                <div className="text-left bg-slate-900 border border-slate-800 p-4 rounded-2xl">
                  <span className="block text-xs text-slate-500 line-through font-mono font-bold mb-1">
                    السعر السابق: {scannedProduct.originalPrice.toFixed(2)} {currencySymbol}
                  </span>
                  <span className="text-sm font-black text-red-400">
                    وفرت: {(scannedProduct.originalPrice - scannedProduct.currentPrice).toFixed(2)} {currencySymbol} 🎉
                  </span>
                </div>
              )}
            </div>

            {/* Expiry & Stock Extra Details */}
            <div className="grid grid-cols-2 gap-4 text-xs font-bold">
              {scannedProduct.expiry_date && (
                <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 flex items-center gap-2 text-slate-300">
                  <Clock size={16} className="text-indigo-400" />
                  <span>الصلاحية حتى: {scannedProduct.expiry_date}</span>
                </div>
              )}
              <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 flex items-center gap-2 text-slate-300">
                <CheckCircle size={16} className="text-emerald-400" />
                <span>متوفر بصالة العرض</span>
              </div>
            </div>

            {/* Auto reset progress bar */}
            <div className="text-center pt-2">
              <span className="text-xs text-slate-500 font-bold">ستعود الشاشة للوضع الرئيسي تلقائياً بعد لحظات...</span>
            </div>

          </div>
        )}

        {/* State 3: Not Found Screen */}
        {notFound && (
          <div className="text-center space-y-6 max-w-md bg-slate-900 border-2 border-red-500/40 rounded-3xl p-8 shadow-2xl animate-in shake duration-300">
            <div className="w-20 h-20 bg-red-950 text-red-400 border border-red-900/50 rounded-3xl flex items-center justify-center mx-auto shadow-lg shadow-red-600/20">
              <AlertCircle size={40} />
            </div>
            <div className="space-y-2">
              <h2 className="text-3xl font-black text-white">الصنف غير مسجل</h2>
              <p className="text-slate-400 text-sm font-bold">
                لم يتم العثور على المنتج بالباركود الممسوح، الرجاء مراجعة خدمة العملاء أو الكاشير.
              </p>
            </div>
          </div>
        )}

      </main>

      {/* Footer */}
      <footer className="px-8 py-3 bg-slate-950 border-t border-slate-900 flex justify-between items-center text-xs text-slate-500 font-bold">
        <span>TriPro ERP V52.0 - Hypermarket Interactive Kiosk</span>
        <span>جاهز لمسح الباركود والموازين 24/7 ⚡</span>
      </footer>

    </div>
  );
}

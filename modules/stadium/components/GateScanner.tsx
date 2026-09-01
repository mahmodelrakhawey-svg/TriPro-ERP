import React, { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '@/supabaseClient';
import { useAccounting } from '@/context/AccountingContext';
import toast from 'react-hot-toast';
import {
  ShieldCheck, QrCode, Search, CheckCircle2, XCircle,
  AlertTriangle, Users, Clock, LogOut, RefreshCw,
  Eye, Calendar, Building2, Cpu, Radio, Zap,
  Volume2, VolumeX, ShieldAlert, Sparkles, Sliders,
  Check, Lock, Unlock, AlertOctagon, Terminal
} from 'lucide-react';
import { StadiumMember, StadiumGateLog, MEMBERSHIP_CATEGORY_LABELS } from '../stadium.types';

export const GateScanner: React.FC = () => {
  const { currentUser, organization, currentSelectedOrgId } = useAccounting();
  const orgId = currentSelectedOrgId || (currentUser as any)?.organization_id || (organization as any)?.id;

  const [scanInput, setScanInput] = useState('');
  const [selectedGate, setSelectedGate] = useState('البوابة الرئيسية (Gate 01)');
  const [checking, setChecking] = useState(false);

  // Result state
  const [scanResult, setScanResult] = useState<{
    status: 'idle' | 'granted' | 'denied' | 'not_found' | 'antipassback';
    member?: StadiumMember;
    message?: string;
  }>({ status: 'idle' });

  // Today's logs
  const [todayLogs, setTodayLogs] = useState<StadiumGateLog[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);
  const [activeMembersList, setActiveMembersList] = useState<StadiumMember[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  // 🔌 Hardware Turnstile & RFID Web Serial States
  const [serialConnected, setSerialConnected] = useState(false);
  const [serialPort, setSerialPort] = useState<any>(null);
  const [hardwareRelayIp, setHardwareRelayIp] = useState('192.168.1.220');
  const [turnstileState, setTurnstileState] = useState<'LOCKED' | 'UNLOCKED' | 'PASSING'>('LOCKED');
  const [hardwareLogs, setHardwareLogs] = useState<string[]>([]);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [antiPassbackEnabled, setAntiPassbackEnabled] = useState(true);
  const [autoRelayPulse, setAutoRelayPulse] = useState(true);

  // Audio Synth for Hardware Beeps
  const playSound = (type: 'GRANT' | 'DENY' | 'EMERGENCY') => {
    if (!soundEnabled) return;
    try {
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.connect(gain);
      gain.connect(audioCtx.destination);

      if (type === 'GRANT') {
        osc.type = 'sine';
        osc.frequency.setValueAtTime(880, audioCtx.currentTime); // High A5
        osc.frequency.setValueAtTime(1760, audioCtx.currentTime + 0.1); // High A6
        gain.gain.setValueAtTime(0.3, audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.35);
        osc.start();
        osc.stop(audioCtx.currentTime + 0.35);
      } else if (type === 'DENY') {
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(220, audioCtx.currentTime); // Low A3
        osc.frequency.setValueAtTime(160, audioCtx.currentTime + 0.15);
        gain.gain.setValueAtTime(0.4, audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.4);
        osc.start();
        osc.stop(audioCtx.currentTime + 0.4);
      } else {
        osc.type = 'square';
        osc.frequency.setValueAtTime(440, audioCtx.currentTime);
        gain.gain.setValueAtTime(0.5, audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.8);
        osc.start();
        osc.stop(audioCtx.currentTime + 0.8);
      }
    } catch (e) {
      // Audio context may be restricted before user gesture
    }
  };

  // Add Hardware Debug Log Entry
  const addHardwareLog = (msg: string) => {
    const timestamp = new Date().toLocaleTimeString('ar-EG', { hour12: false });
    setHardwareLogs(prev => [`[${timestamp}] ${msg}`, ...prev.slice(0, 20)]);
  };

  // 🚀 Trigger Electronic Turnstile Hardware Relay (COM / TCP / Simulation Pulse)
  const triggerTurnstileUnlock = async (durationMs: number = 3500) => {
    setTurnstileState('UNLOCKED');
    addHardwareLog(`⚡ إرسال إشارة فتح كهرومغناطيسية للبوابة [Pulse: ${durationMs}ms]`);

    // Simulated / WebSerial Hardware Relay Packet
    if (serialPort && (serialPort as any).writable) {
      try {
        const textEncoder = new TextEncoderStream();
        const writableStreamClosed = textEncoder.readable.pipeTo((serialPort as any).writable);
        const writer = textEncoder.writable.getWriter();
        await writer.write('RELAY_ON_GATE_1\r\n');
        writer.releaseLock();
      } catch (err: any) {
        addHardwareLog(`⚠️ تعذر إرسال أمر السيريال: ${err.message}`);
      }
    }

    // Auto Lock Turnstile After Passage Duration
    setTimeout(() => {
      setTurnstileState('LOCKED');
      addHardwareLog('🔒 تم إغلاق القفل الكهروميكانيكي وتأمين ذراع البوابة (Turnstile Locked)');
    }, durationMs);
  };

  // Connect Physical USB RFID Reader via Web Serial API
  const handleConnectSerialPort = async () => {
    if (!('serial' in navigator)) {
      toast.error('المتصفح لا يدعم بروتوكول Web Serial API. يرجى استخدام Google Chrome أو Edge.');
      return;
    }

    try {
      const port = await (navigator as any).serial.requestPort();
      await port.open({ baudRate: 9600 });
      setSerialPort(port);
      setSerialConnected(true);
      addHardwareLog('✅ تم الاتصال بنجاح بقارئ البطاقات RFID عبر منفذ السيريال (Baud: 9600)');
      toast.success('تم الاتصال بقارئ البطاقات RFID بنجاح 🔌');

      // Continuous Serial Stream Reader Loop
      const textDecoder = new TextDecoderStream();
      const readableStreamClosed = port.readable.pipeTo(textDecoder.writable);
      const reader = textDecoder.readable.getReader();

      let buffer = '';
      (async () => {
        try {
          while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            if (value) {
              buffer += value;
              if (buffer.includes('\n') || buffer.includes('\r')) {
                const cleanUid = buffer.replace(/[\r\n]/g, '').trim();
                buffer = '';
                if (cleanUid) {
                  addHardwareLog(`📡 استلام بطاقة RFID Tag UID: [${cleanUid}]`);
                  processAccessCheck(cleanUid);
                }
              }
            }
          }
        } catch (e: any) {
          addHardwareLog(`❌ انقطع اتصال السيريال: ${e.message}`);
          setSerialConnected(false);
        } finally {
          reader.releaseLock();
        }
      })();
    } catch (err: any) {
      if (err.name !== 'NotFoundError') {
        toast.error('تعذر الاتصال بمنفذ السيريال: ' + err.message);
        addHardwareLog(`❌ خطأ اتصال: ${err.message}`);
      }
    }
  };

  // Fetch Active Members for Quick List
  const fetchActiveMembers = async () => {
    if (!orgId) return;
    try {
      const { data } = await supabase
        .from('stadium_members')
        .select('*')
        .eq('organization_id', orgId)
        .eq('status', 'active')
        .order('full_name', { ascending: true })
        .limit(20);
      setActiveMembersList(data || []);
    } catch (e) {
      console.error(e);
    }
  };

  // Fetch Today Logs
  const fetchTodayLogs = async () => {
    if (!orgId) {
      setLogsLoading(false);
      return;
    }
    setLogsLoading(true);
    try {
      const todayStart = new Date().toISOString().split('T')[0] + 'T00:00:00';
      const { data, error } = await supabase
        .from('stadium_gate_logs')
        .select('*')
        .eq('organization_id', orgId)
        .gte('scanned_at', todayStart)
        .order('scanned_at', { ascending: false })
        .limit(50);

      if (!error && data) {
        setTodayLogs(data);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLogsLoading(false);
    }
  };

  useEffect(() => {
    if (orgId) {
      fetchTodayLogs();
      fetchActiveMembers();
    } else {
      setLogsLoading(false);
    }
    if (inputRef.current) inputRef.current.focus();

    const interval = setInterval(() => {
      if (orgId) fetchTodayLogs();
    }, 60000);
    return () => clearInterval(interval);
  }, [orgId]);

  // Core Access Verification Processor
  const processAccessCheck = async (rawVal: string) => {
    if (!rawVal || !orgId) return;
    setChecking(true);
    setScanResult({ status: 'idle' });

    try {
      let memberId = '';
      let nationalId = rawVal;

      if (rawVal.startsWith('{') && rawVal.endsWith('}')) {
        try {
          const parsed = JSON.parse(rawVal);
          if (parsed.id) memberId = parsed.id;
          if (parsed.national_id) nationalId = parsed.national_id;
        } catch {}
      }

      const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(memberId || rawVal);

      let query = supabase.from('stadium_members').select('*').eq('organization_id', orgId);
      if (memberId && isUUID) {
        query = query.eq('id', memberId);
      } else if (isUUID) {
        query = query.eq('id', rawVal);
      } else {
        query = query.or(`national_id.eq.${nationalId},phone.eq.${rawVal},full_name.ilike.%${rawVal}%`);
      }

      const { data: members, error } = await query.limit(1);

      if (error || !members || members.length === 0) {
        playSound('DENY');
        setScanResult({
          status: 'not_found',
          message: 'لم يتم العثور على عضو مسجل بهذا الرمز أو بطاقة الـ RFID.',
        });
        addHardwareLog(`🚫 بطاقة غير مسجلة: [${rawVal}]`);
        await logAccess('غير مسجل', rawVal, null, 'denied', 'العضو غير مسجل بقاعدة البيانات');
      } else {
        const member = members[0];
        const today = new Date().toISOString().split('T')[0];
        const isExpired = member.end_date ? member.end_date < today : false;
        const isSuspended = member.status === 'suspended';

        // 🛡️ Anti-Passback Check (prevent duplicate scan within 15 mins)
        if (antiPassbackEnabled) {
          const fifteenMinsAgo = new Date(Date.now() - 15 * 60000).toISOString();
          const recentPass = todayLogs.find(
            l => l.member_id === member.id && l.access_status === 'granted' && l.scanned_at > fifteenMinsAgo
          );

          if (recentPass) {
            playSound('DENY');
            setScanResult({
              status: 'antipassback',
              member,
              message: `⚠️ تحذير منع التمرير (Anti-Passback)! تم تسجيل دخول هذا العضو منذ دقائق (${new Date(recentPass.scanned_at).toLocaleTimeString('ar-EG')}). لا يمكن تمرير نفس البطاقة مرتين.`,
            });
            addHardwareLog(`⚠️ محاولة تمرير مكررة (Anti-Passback) للعضو: ${member.full_name}`);
            await logAccess(member.full_name, member.national_id, member.membership_type, 'denied', 'مخالفة منع التمرير (Anti-Passback)', member.id);
            return;
          }
        }

        if (isSuspended) {
          playSound('DENY');
          setScanResult({
            status: 'denied',
            member,
            message: 'العضوية موقوفة إدارياً! يرجى مراجعة إدارة الشؤون القانونية أو الاشتراكات.',
          });
          addHardwareLog(`⛔ عضوية موقوفة: ${member.full_name}`);
          await logAccess(member.full_name, member.national_id, member.membership_type, 'denied', 'العضوية موقوفة إدارياً', member.id);
        } else if (isExpired || member.status === 'expired') {
          playSound('DENY');
          setScanResult({
            status: 'denied',
            member,
            message: `العضوية منتهية بتاريخ (${member.end_date || 'غير محدد'}). يرجى التوجه للخزينة لتجديد الاشتراك.`,
          });
          addHardwareLog(`⛔ عضوية منتهية (${member.end_date}): ${member.full_name}`);
          await logAccess(member.full_name, member.national_id, member.membership_type, 'denied', `عضوية منتهية في ${member.end_date}`, member.id);
        } else {
          // ✅ ACCESS GRANTED
          playSound('GRANT');
          setScanResult({
            status: 'granted',
            member,
            message: 'العضوية نشطة ومسددة. مرحباً بك في استاد المنصورة!',
          });
          addHardwareLog(`✅ دخول مصرح للعضو: ${member.full_name} (${member.membership_type || 'عضوية عامة'})`);
          await logAccess(member.full_name, member.national_id, member.membership_type, 'granted', 'دخول مسموح - عضوية سارية', member.id);

          // ⚡ Open Hardware Turnstile
          if (autoRelayPulse) {
            triggerTurnstileUnlock(3500);
          }
        }
      }
    } catch (err: any) {
      console.error(err);
      toast.error('حدث خطأ أثناء فحص البيانات');
    } finally {
      setChecking(false);
      setScanInput('');
      fetchTodayLogs();
      if (inputRef.current) inputRef.current.focus();
    }
  };

  const handleScanSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    processAccessCheck(scanInput.trim());
  };

  const logAccess = async (
    memberName: string,
    natId: string | null,
    memType: string | null,
    status: 'granted' | 'denied',
    reason: string,
    memberId?: string
  ) => {
    try {
      await supabase.from('stadium_gate_logs').insert([{
        organization_id: orgId,
        member_id: memberId || null,
        member_name: memberName,
        national_id: natId,
        membership_type: memType,
        gate_name: selectedGate,
        access_status: status,
        reason: reason,
        scanned_by: (currentUser as any)?.full_name || 'بوابة الدخول الذكية (Hardware Turnstile)',
      }]);
    } catch (e) {
      console.error('Error logging gate access:', e);
    }
  };

  const grantedCount = todayLogs.filter(l => l.access_status === 'granted').length;
  const deniedCount = todayLogs.filter(l => l.access_status === 'denied').length;

  return (
    <div className="p-6 bg-slate-900 min-h-screen text-slate-100 font-sans select-none text-right" dir="rtl">
      
      {/* 🏷️ Top Bar */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-black text-white flex items-center gap-3">
            <Cpu className="text-emerald-400" size={28} />
            منظومة بوابات الدخول الإلكترونية والتحكم الذكي (Turnstiles & Hardware RFID)
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            الربط اللحظي مع أذرع البوابات الكهروميكانيكية وقارئات RFID عبر منفذ الـ USB/Serial وشبكة الـ Relay لمنع التمرير وتأمين الملاعب.
          </p>
        </div>

        {/* Controls & Gate Selector */}
        <div className="flex items-center gap-2.5 flex-wrap">
          <button
            onClick={() => setSoundEnabled(!soundEnabled)}
            className={`p-2 rounded-xl border transition-all ${
              soundEnabled ? 'bg-indigo-950/80 border-indigo-500 text-indigo-300' : 'bg-slate-800 border-slate-700 text-slate-500'
            }`}
            title={soundEnabled ? 'كتم التنبيهات الصوتية' : 'تفعيل التنبيهات الصوتية'}
          >
            {soundEnabled ? <Volume2 size={16} /> : <VolumeX size={16} />}
          </button>

          <button
            onClick={handleConnectSerialPort}
            className={`px-3.5 py-2 rounded-xl font-bold text-xs border transition-all flex items-center gap-2 ${
              serialConnected
                ? 'bg-emerald-950/80 border-emerald-500 text-emerald-300 shadow-md shadow-emerald-950'
                : 'bg-slate-800 hover:bg-slate-750 border-slate-700 text-slate-300'
            }`}
          >
            <Radio size={14} className={serialConnected ? 'text-emerald-400 animate-pulse' : 'text-slate-500'} />
            {serialConnected ? 'قارئ RFID متصل (USB/COM)' : 'توصيل قارئ RFID المادي'}
          </button>

          {/* Gate Selector */}
          <div className="flex items-center gap-2 bg-slate-950 px-3 py-2 rounded-xl border border-slate-800 text-xs">
            <Building2 className="w-4 h-4 text-amber-400" />
            <select
              value={selectedGate}
              onChange={(e) => setSelectedGate(e.target.value)}
              className="bg-transparent font-bold text-white border-none outline-none text-xs"
            >
              <option value="البوابة الرئيسية (Gate 01)">البوابة الرئيسية (Gate 01)</option>
              <option value="بوابة 1 (مجمع ملاعب كرة القدم)">بوابة 1 (مجمع ملاعب كرة القدم)</option>
              <option value="بوابة 2 (مجمع حمامات السباحة الأولمبي)">بوابة 2 (مجمع حمامات السباحة الأولمبي)</option>
              <option value="بوابة 3 (الصالة المغطاة والجيم)">بوابة 3 (الصالة المغطاة والجيم)</option>
              <option value="بوابة كبار الزوار VIP">بوابة كبار الزوار VIP</option>
            </select>
          </div>
        </div>
      </div>

      {/* 📊 KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5 mb-6">
        <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800 space-y-1">
          <span className="text-slate-400 text-xs font-bold flex items-center gap-1.5">
            <Users size={14} className="text-indigo-400" /> إجمالي العبور اليوم
          </span>
          <div className="text-xl font-black font-mono text-white">{todayLogs.length} <span className="text-xs font-normal text-slate-500">حركة دخول</span></div>
        </div>

        <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800 space-y-1">
          <span className="text-slate-400 text-xs font-bold flex items-center gap-1.5">
            <CheckCircle2 size={14} className="text-emerald-400" /> دخول مصرح به
          </span>
          <div className="text-xl font-black font-mono text-emerald-400">{grantedCount} <span className="text-xs font-normal text-slate-500">عضوية سارية</span></div>
        </div>

        <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800 space-y-1">
          <span className="text-slate-400 text-xs font-bold flex items-center gap-1.5">
            <XCircle size={14} className="text-rose-400" /> محاولات مرفوضة
          </span>
          <div className="text-xl font-black font-mono text-rose-400">{deniedCount} <span className="text-xs font-normal text-slate-500">منتهية / مخالفة</span></div>
        </div>

        <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800 space-y-1">
          <span className="text-slate-400 text-xs font-bold flex items-center gap-1.5">
            <Cpu size={14} className="text-cyan-400" /> حالة القفل الكهروميكانيكي
          </span>
          <div className={`text-xl font-black font-mono flex items-center gap-2 ${
            turnstileState === 'UNLOCKED' ? 'text-emerald-400 animate-pulse' : 'text-slate-300'
          }`}>
            {turnstileState === 'UNLOCKED' ? <Unlock size={18} /> : <Lock size={18} />}
            {turnstileState === 'UNLOCKED' ? 'ذراع مفتوح (OPEN)' : 'مؤمن (LOCKED)'}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 mb-8">
        
        {/* 🕹️ Left Column: Scanner Box, Visual Turnstile & Member Result */}
        <div className="lg:col-span-7 space-y-6">
          
          {/* Visual Turnstile Arm Simulator Card */}
          <div className="bg-slate-950 rounded-2xl border border-slate-800 p-6 flex flex-col items-center justify-center relative overflow-hidden">
            <div className="absolute top-4 right-4 flex items-center gap-2">
              <span className="text-[10px] font-mono font-bold text-slate-500 uppercase">Hardware Relay Bridge</span>
              <span className={`w-2.5 h-2.5 rounded-full ${turnstileState === 'UNLOCKED' ? 'bg-emerald-400 animate-ping' : 'bg-rose-500'}`} />
            </div>

            {/* Turnstile Animated Graphic */}
            <div className="my-3 flex flex-col items-center">
              <div className={`w-24 h-24 rounded-full border-4 flex items-center justify-center transition-all duration-300 ${
                turnstileState === 'UNLOCKED'
                  ? 'border-emerald-400 bg-emerald-950/60 shadow-2xl shadow-emerald-500/50 scale-110'
                  : 'border-slate-700 bg-slate-900 shadow-lg'
              }`}>
                {turnstileState === 'UNLOCKED' ? (
                  <Unlock size={42} className="text-emerald-400 animate-bounce" />
                ) : (
                  <Lock size={38} className="text-slate-500" />
                )}
              </div>

              <div className="mt-3 text-center">
                <span className={`text-sm font-black tracking-wide ${
                  turnstileState === 'UNLOCKED' ? 'text-emerald-400' : 'text-slate-400'
                }`}>
                  {turnstileState === 'UNLOCKED' ? '⚡ القفل مفتوح - يرجى العبور' : '🔒 البوابة مغلقة بانتظار مسح البطاقة'}
                </span>
                <div className="text-[10px] font-mono text-slate-500 mt-0.5">
                  Controller IP: {hardwareRelayIp} | Port: 5000 | Relay 1
                </div>
              </div>
            </div>

            {/* Manual Emergency Override */}
            <div className="flex items-center gap-2 mt-2">
              <button
                type="button"
                onClick={() => {
                  playSound('EMERGENCY');
                  triggerTurnstileUnlock(6000);
                  toast('تم فتح البوابة اضطرارياً لمدة 6 ثوانٍ 🚨', { icon: '⚡' });
                }}
                className="px-4 py-1.5 bg-rose-950/60 hover:bg-rose-900 border border-rose-800 text-rose-300 rounded-xl text-xs font-black transition-all flex items-center gap-1.5"
              >
                <AlertOctagon size={14} />
                فتح البوابة اضطرارياً (Emergency Pulse)
              </button>
            </div>
          </div>

          {/* Scanner Input Form */}
          <div className="bg-slate-950 rounded-2xl border border-slate-800 p-6">
            <form onSubmit={handleScanSubmit} className="space-y-4">
              <div className="flex justify-between items-center mb-1">
                <label className="block text-xs font-black text-slate-300 flex items-center gap-2">
                  <QrCode className="w-4 h-4 text-emerald-400" />
                  مسح رمز الاستجابة السريعة (QR) أو بطاقة الـ RFID
                </label>
                <span className="text-[10px] text-slate-500 font-mono">
                  {serialConnected ? '🟢 متصل بالقارئ المادي' : '⌨️ جاهز للإدخال أو الباركود'}
                </span>
              </div>

              <div className="relative">
                <input
                  ref={inputRef}
                  type="text"
                  value={scanInput}
                  onChange={(e) => setScanInput(e.target.value)}
                  placeholder="مرر بطاقة RFID أو رمز الـ QR أو اكتب الرقم القومي..."
                  disabled={checking}
                  className="w-full bg-slate-900 border-2 border-slate-800 rounded-2xl py-3.5 pr-4 pl-24 text-sm text-white font-mono placeholder:text-slate-600 focus:border-emerald-500 focus:outline-none transition-all shadow-inner"
                />
                <button
                  type="submit"
                  disabled={checking || !scanInput.trim()}
                  className="absolute left-2 top-2 bottom-2 px-4 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white rounded-xl text-xs font-black shadow-md shadow-emerald-600/20 disabled:opacity-50 transition-all flex items-center gap-1.5"
                >
                  {checking ? <RefreshCw size={14} className="animate-spin" /> : <Check size={14} />}
                  فحص الدخول
                </button>
              </div>

              {/* Quick Member Quick-Select Buttons */}
              <div>
                <span className="text-[10px] text-slate-500 block mb-1.5">اختبار سريع بأعضاء مسجلين:</span>
                <div className="flex gap-1.5 overflow-x-auto pb-1">
                  {activeMembersList.slice(0, 5).map(m => (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => processAccessCheck(m.national_id)}
                      className="px-2.5 py-1 bg-slate-900 hover:bg-slate-850 border border-slate-800 rounded-lg text-[10px] text-slate-300 font-bold whitespace-nowrap transition-all"
                    >
                      {m.full_name}
                    </button>
                  ))}
                </div>
              </div>
            </form>
          </div>

          {/* Member Scan Verification Card Result */}
          {scanResult.status !== 'idle' && (
            <div className={`p-6 rounded-2xl border transition-all shadow-2xl ${
              scanResult.status === 'granted'
                ? 'bg-emerald-950/40 border-emerald-500 text-emerald-200'
                : scanResult.status === 'antipassback'
                ? 'bg-amber-950/40 border-amber-500 text-amber-200'
                : 'bg-rose-950/40 border-rose-500 text-rose-200'
            }`}>
              <div className="flex items-start gap-4">
                <div className={`p-3 rounded-2xl border ${
                  scanResult.status === 'granted'
                    ? 'bg-emerald-900/60 border-emerald-500 text-emerald-300'
                    : scanResult.status === 'antipassback'
                    ? 'bg-amber-900/60 border-amber-500 text-amber-300'
                    : 'bg-rose-900/60 border-rose-500 text-rose-300'
                }`}>
                  {scanResult.status === 'granted' ? <CheckCircle2 size={32} /> :
                   scanResult.status === 'antipassback' ? <ShieldAlert size={32} /> :
                   <XCircle size={32} />}
                </div>

                <div className="flex-1 space-y-1">
                  <div className="flex justify-between items-center">
                    <h3 className="text-base font-black text-white">
                      {scanResult.status === 'granted' ? 'دخول مصرح به ✅ (Access Granted)' :
                       scanResult.status === 'antipassback' ? 'تحذير منع التمرير (Anti-Passback Alert)' :
                       'دخول مرفوض ⛔ (Access Denied)'}
                    </h3>
                    <span className="text-[10px] font-mono text-slate-400">
                      {new Date().toLocaleTimeString('ar-EG')}
                    </span>
                  </div>

                  <p className="text-xs font-bold leading-relaxed">{scanResult.message}</p>

                  {scanResult.member && (
                    <div className="mt-3 pt-3 border-t border-slate-800/80 grid grid-cols-2 gap-2 text-xs">
                      <div>
                        <span className="text-slate-400 text-[10px] block">اسم العضو:</span>
                        <span className="text-white font-black">{scanResult.member.full_name}</span>
                      </div>
                      <div>
                        <span className="text-slate-400 text-[10px] block">نوع العضوية:</span>
                        <span className="text-amber-400 font-bold">{MEMBERSHIP_CATEGORY_LABELS[scanResult.member.membership_type] || scanResult.member.membership_type}</span>
                      </div>
                      <div>
                        <span className="text-slate-400 text-[10px] block">الرقم القومي:</span>
                        <span className="text-slate-300 font-mono">{scanResult.member.national_id}</span>
                      </div>
                      <div>
                        <span className="text-slate-400 text-[10px] block">تاريخ نهاية الاشتراك:</span>
                        <span className="text-slate-300 font-mono">{scanResult.member.end_date || 'غير محدد'}</span>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

        </div>

        {/* 📋 Right Column: Live Hardware Terminal Logs & Gate History */}
        <div className="lg:col-span-5 space-y-6">
          
          {/* Live Hardware Terminal Output */}
          <div className="bg-slate-950 rounded-2xl border border-slate-800 p-4 space-y-2">
            <div className="flex justify-between items-center pb-2 border-b border-slate-850">
              <span className="text-xs font-black text-slate-300 flex items-center gap-2">
                <Terminal size={14} className="text-emerald-400" />
                سجل إشارات الهاردوير اللحظي (Hardware Stream)
              </span>
              <span className="text-[10px] font-mono text-emerald-400">STATUS: READY</span>
            </div>

            <div className="bg-black p-3 rounded-xl font-mono text-[11px] text-emerald-400 h-44 overflow-y-auto space-y-1 shadow-inner select-text">
              {hardwareLogs.length === 0 ? (
                <div className="text-slate-600 text-center pt-14">في انتظار مسح بطاقات RFID أو إشارات البوابات...</div>
              ) : (
                hardwareLogs.map((log, idx) => (
                  <div key={idx} className="leading-tight">{log}</div>
                ))
              )}
            </div>
          </div>

          {/* Today Gate Access Log Table */}
          <div className="bg-slate-950 rounded-2xl border border-slate-800 p-4 space-y-3">
            <div className="flex justify-between items-center pb-2 border-b border-slate-850">
              <span className="text-xs font-black text-white flex items-center gap-2">
                <Clock size={14} className="text-indigo-400" />
                آخر حركات الدخول اليوم
              </span>
              <button onClick={fetchTodayLogs} className="p-1 hover:bg-slate-850 rounded-lg text-slate-400">
                <RefreshCw size={13} className={logsLoading ? 'animate-spin' : ''} />
              </button>
            </div>

            <div className="space-y-2 max-h-80 overflow-y-auto text-xs">
              {todayLogs.length === 0 ? (
                <div className="p-6 text-center text-slate-500 font-bold">لا توجد حركات دخول مسجلة اليوم حتى الآن</div>
              ) : (
                todayLogs.map(log => {
                  const isGranted = log.access_status === 'granted';
                  return (
                    <div
                      key={log.id}
                      className={`p-2.5 rounded-xl border flex items-center justify-between transition-colors ${
                        isGranted ? 'bg-slate-900/60 border-slate-800' : 'bg-rose-950/20 border-rose-900/40'
                      }`}
                    >
                      <div className="space-y-0.5">
                        <div className="font-bold text-white flex items-center gap-1.5">
                          <span>{log.member_name}</span>
                          <span className={`text-[9px] px-1.5 py-0.2 rounded-full font-black ${
                            isGranted ? 'bg-emerald-950 text-emerald-300 border border-emerald-800' : 'bg-rose-950 text-rose-300 border border-rose-800'
                          }`}>
                            {isGranted ? 'دخول مصرح' : 'مرفوض'}
                          </span>
                        </div>
                        <div className="text-[10px] text-slate-400 font-mono">
                          {log.gate_name} • {new Date(log.scanned_at).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })}
                        </div>
                      </div>

                      <div className="text-[10px] text-slate-500 max-w-[120px] truncate text-left font-sans">
                        {log.reason}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

        </div>

      </div>

    </div>
  );
};

export default GateScanner;

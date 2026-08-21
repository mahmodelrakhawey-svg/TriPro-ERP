import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '@/supabaseClient';
import { useAccounting } from '@/context/AccountingContext';
import toast from 'react-hot-toast';
import {
  ShieldCheck,
  QrCode,
  Search,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Users,
  Clock,
  LogOut,
  RefreshCw,
  Eye,
  Calendar,
  Building2,
} from 'lucide-react';
import { StadiumMember, StadiumGateLog, MEMBERSHIP_CATEGORY_LABELS } from '../stadium.types';

export const GateScanner: React.FC = () => {
  const { currentUser, organization, currentSelectedOrgId } = useAccounting();
  const orgId = currentSelectedOrgId || (currentUser as any)?.organization_id || (organization as any)?.id;

  const [scanInput, setScanInput] = useState('');
  const [selectedGate, setSelectedGate] = useState('البوابة الرئيسية');
  const [checking, setChecking] = useState(false);

  // Result state
  const [scanResult, setScanResult] = useState<{
    status: 'idle' | 'granted' | 'denied' | 'not_found';
    member?: StadiumMember;
    message?: string;
  }>({ status: 'idle' });

  // Today's logs
  const [todayLogs, setTodayLogs] = useState<StadiumGateLog[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);
  const [activeMembersList, setActiveMembersList] = useState<StadiumMember[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  const fetchActiveMembers = async () => {
    if (!orgId) return;
    try {
      const { data } = await supabase
        .from('stadium_members')
        .select('*')
        .eq('organization_id', orgId)
        .limit(10);
      setActiveMembersList(data || []);
    } catch (e) {
      console.error(e);
    }
  };

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
  }, [orgId]);


  const handleScanSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const rawVal = scanInput.trim();
    if (!rawVal || !orgId) return;

    setChecking(true);
    setScanResult({ status: 'idle' });

    try {
      let memberId = '';
      let nationalId = rawVal;

      // Check if scanned value is JSON (from QR card)
      if (rawVal.startsWith('{') && rawVal.endsWith('}')) {
        try {
          const parsed = JSON.parse(rawVal);
          if (parsed.id) memberId = parsed.id;
          if (parsed.national_id) nationalId = parsed.national_id;
        } catch {}
      }

      const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(memberId || rawVal);

      // Query stadium_members safely without invalid UUID cast
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
        setScanResult({
          status: 'not_found',
          message: 'لم يتم العثور على عضو مسجل بهذا الرمز أو الرقم القومي.',
        });
        // Log denied attempt
        await logAccess('غير مسجل', rawVal, null, 'denied', 'العضو غير مسجل بقاعدة البيانات');
      } else {
        const member = members[0];
        const today = new Date().toISOString().split('T')[0];
        const isExpired = member.end_date ? member.end_date < today : false;
        const isSuspended = member.status === 'suspended';

        if (isSuspended) {
          setScanResult({
            status: 'denied',
            member,
            message: 'العضوية موقوفة إدارياً! يرجى مراجعة إدارة الشؤون القانونية أو الاشتراكات.',
          });
          await logAccess(member.full_name, member.national_id, member.membership_type, 'denied', 'العضوية موقوفة إدارياً', member.id);
        } else if (isExpired || member.status === 'expired') {
          setScanResult({
            status: 'denied',
            member,
            message: `العضوية منتهية بتاريخ (${member.end_date || 'غير محدد'}). يرجى التوجه للخزينة لتجديد الاشتراك.`,
          });
          await logAccess(member.full_name, member.national_id, member.membership_type, 'denied', `عضوية منتهية في ${member.end_date}`, member.id);
        } else {
          setScanResult({
            status: 'granted',
            member,
            message: 'العضوية نشطة ومسددة. مرحباً بك في استاد المنصورة!',
          });
          await logAccess(member.full_name, member.national_id, member.membership_type, 'granted', 'دخول مسموح - عضوية سارية', member.id);
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
        scanned_by: (currentUser as any)?.full_name || 'مسؤول البوابة',
      }]);
    } catch (e) {
      console.error('Error logging gate access:', e);
    }
  };

  const grantedCount = todayLogs.filter(l => l.access_status === 'granted').length;
  const deniedCount = todayLogs.filter(l => l.access_status === 'denied').length;

  return (
    <div className="p-6 bg-gray-50 dark:bg-gray-900 min-h-screen text-right" dir="rtl">
      {/* Top Bar */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
            <ShieldCheck className="w-7 h-7 text-emerald-600 dark:text-emerald-400" />
            شاشة فحص البوابات والدخول الذكي (Gate Scanner)
          </h1>
          <p className="text-xs text-gray-500 mt-1">التحقق اللحظي من سريان العضوية وتسجيل حركات الدخول عبر رمز QR أو الرقم القومي</p>
        </div>

        {/* Gate Selector */}
        <div className="flex items-center gap-2 bg-white dark:bg-gray-800 px-3 py-1.5 rounded-xl border dark:border-gray-700 shadow-sm text-sm">
          <Building2 className="w-4 h-4 text-gray-400" />
          <span className="text-gray-600 dark:text-gray-400 text-xs">البوابة:</span>
          <select
            value={selectedGate}
            onChange={(e) => setSelectedGate(e.target.value)}
            className="bg-transparent font-bold text-gray-800 dark:text-gray-200 border-none outline-none text-xs"
          >
            <option value="البوابة الرئيسية">البوابة الرئيسية</option>
            <option value="بوابة 1 (الملاعب)">بوابة 1 (الملاعب)</option>
            <option value="بوابة 2 (مجمع السباحة)">بوابة 2 (مجمع السباحة)</option>
            <option value="بوابة 3 (الصالة المغطاة والجيم)">بوابة 3 (الصالة المغطاة والجيم)</option>
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Scanner Box & Result Verification */}
        <div className="lg:col-span-7 space-y-6">
          {/* Scan Input Card */}
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 p-6">
            <form onSubmit={handleScanSubmit} className="space-y-4">
              <div className="flex justify-between items-center mb-1">
                <label className="block text-sm font-bold text-gray-800 dark:text-gray-200 flex items-center gap-2">
                  <QrCode className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                  امسح رمز QR للكارنيه أو أدخل الرقم القومي:
                </label>
                <span className="text-xs text-emerald-600 bg-emerald-50 dark:bg-emerald-950/40 px-2 py-0.5 rounded font-mono">
                  جاهز للمسح 🟢
                </span>
              </div>

              <div className="relative">
                <input
                  ref={inputRef}
                  type="text"
                  value={scanInput}
                  onChange={(e) => setScanInput(e.target.value)}
                  placeholder="وجّه قارئ الباركود أو اكتب الرقم القومي واضغط Enter..."
                  autoFocus
                  className="w-full text-base p-4 pr-12 border-2 border-indigo-500 rounded-xl focus:ring-4 focus:ring-indigo-100 dark:bg-gray-900 dark:border-indigo-600 dark:text-white font-mono shadow-inner outline-none transition"
                />
                <Search className="w-6 h-6 text-gray-400 absolute right-4 top-4" />
              </div>

              <div className="flex justify-between items-center text-xs text-gray-500">
                <span>يدعم: مسدس الباركود السريع، كاميرات QR، وإدخال الرقم القومي يدوياً</span>
                <button
                  type="submit"
                  disabled={checking || !scanInput.trim()}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2 rounded-lg font-bold text-xs shadow-sm transition disabled:opacity-50"
                >
                  {checking ? 'جاري التحقق...' : 'فحص العضوية (Enter)'}
                </button>
              </div>

              {activeMembersList.length > 0 && (
                <div className="pt-2 border-t border-gray-100 dark:border-gray-800">
                  <div className="text-xs text-gray-500 mb-1.5 flex items-center gap-1">
                    <Users size={13} />
                    <span>تجربة فحص سريعة لأعضاء مسجلين:</span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {activeMembersList.map((m) => (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => {
                          setScanInput(m.national_id || m.id);
                          setTimeout(() => {
                            const event = new Event('submit', { cancelable: true });
                            inputRef.current?.form?.dispatchEvent(event);
                          }, 50);
                        }}
                        className="text-xs bg-gray-100 dark:bg-gray-800 hover:bg-indigo-50 dark:hover:bg-indigo-950/50 hover:text-indigo-600 px-2.5 py-1 rounded-full border dark:border-gray-700 transition"
                      >
                        {m.full_name} ({m.national_id ? `الرقم القومي: ${m.national_id}` : 'رقم العضوية'})
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </form>
          </div>


          {/* Realtime Result Banner */}
          {scanResult.status === 'granted' && scanResult.member && (
            <div className="bg-emerald-500 text-white rounded-2xl shadow-xl p-6 transition-all duration-300 animate-fadeIn">
              <div className="flex items-start gap-4">
                <div className="w-16 h-16 rounded-2xl bg-white/20 border-2 border-white flex items-center justify-center shrink-0">
                  <CheckCircle2 className="w-10 h-10 text-white" />
                </div>
                <div className="flex-1 space-y-1">
                  <div className="flex justify-between items-center">
                    <span className="bg-white text-emerald-900 px-3 py-0.5 rounded-full font-bold text-xs">
                      دخول مسموح — سارية ومسددة ✅
                    </span>
                    <span className="font-mono text-xs text-white/80">
                      {MEMBERSHIP_CATEGORY_LABELS[scanResult.member.membership_type] || scanResult.member.membership_type}
                    </span>
                  </div>
                  <h3 className="text-2xl font-bold text-white pt-1">{scanResult.member.full_name}</h3>
                  <div className="grid grid-cols-2 gap-2 text-xs text-emerald-100 pt-2 font-mono">
                    <div>الرقم القومي: <span className="font-bold text-white">{scanResult.member.national_id || '—'}</span></div>
                    <div>تاريخ الانتهاء: <span className="font-bold text-white">{scanResult.member.end_date || '—'}</span></div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {scanResult.status === 'denied' && (
            <div className="bg-red-600 text-white rounded-2xl shadow-xl p-6 transition-all duration-300 animate-fadeIn">
              <div className="flex items-start gap-4">
                <div className="w-16 h-16 rounded-2xl bg-white/20 border-2 border-white flex items-center justify-center shrink-0">
                  <XCircle className="w-10 h-10 text-white" />
                </div>
                <div className="flex-1 space-y-1">
                  <span className="bg-white text-red-950 px-3 py-0.5 rounded-full font-bold text-xs">
                    ممنوع الدخول ⛔
                  </span>
                  {scanResult.member && (
                    <h3 className="text-xl font-bold text-white pt-1">{scanResult.member.full_name}</h3>
                  )}
                  <p className="text-sm font-semibold text-red-100 pt-1 leading-relaxed">
                    {scanResult.message}
                  </p>
                </div>
              </div>
            </div>
          )}

          {scanResult.status === 'not_found' && (
            <div className="bg-amber-500 text-white rounded-2xl shadow-xl p-6 transition-all duration-300 animate-fadeIn">
              <div className="flex items-center gap-4">
                <AlertTriangle className="w-12 h-12 text-white shrink-0" />
                <div>
                  <h4 className="text-lg font-bold">عضو غير مسجل في النظام ⚠️</h4>
                  <p className="text-xs text-amber-100 mt-1">{scanResult.message}</p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Right Column: Attendance Counter & Recent Logs */}
        <div className="lg:col-span-5 space-y-6">
          {/* Today's Counters */}
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-white dark:bg-gray-800 p-4 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 flex items-center gap-3">
              <div className="p-3 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 rounded-xl">
                <CheckCircle2 className="w-6 h-6" />
              </div>
              <div>
                <p className="text-xs text-gray-500">حضور مسموح اليوم</p>
                <p className="text-2xl font-bold text-emerald-600 font-mono">{grantedCount}</p>
              </div>
            </div>

            <div className="bg-white dark:bg-gray-800 p-4 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 flex items-center gap-3">
              <div className="p-3 bg-red-50 dark:bg-red-950/40 text-red-600 rounded-xl">
                <XCircle className="w-6 h-6" />
              </div>
              <div>
                <p className="text-xs text-gray-500">دخول مرفوض اليوم</p>
                <p className="text-2xl font-bold text-red-600 font-mono">{deniedCount}</p>
              </div>
            </div>
          </div>

          {/* Today's Live Attendance Table */}
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden flex flex-col">
            <div className="p-4 border-b dark:border-gray-700 flex justify-between items-center bg-gray-50/50 dark:bg-gray-800">
              <h3 className="font-bold text-sm text-gray-800 dark:text-gray-200 flex items-center gap-2">
                <Clock className="w-4 h-4 text-indigo-600" />
                سجل الدخول اللحظي لليوم ({todayLogs.length})
              </h3>
              <button onClick={fetchTodayLogs} className="text-gray-400 hover:text-gray-600 p-1">
                <RefreshCw className="w-4 h-4" />
              </button>
            </div>

            <div className="overflow-y-auto max-h-[420px] divide-y dark:divide-gray-700 text-xs">
              {logsLoading ? (
                <div className="text-center py-8 text-gray-400">جاري التحميل...</div>
              ) : todayLogs.length === 0 ? (
                <div className="text-center py-8 text-gray-400">لم يتم تسجيل حركات دخول بعد اليوم</div>
              ) : (
                todayLogs.map((log) => (
                  <div key={log.id} className="p-3 hover:bg-gray-50 dark:hover:bg-gray-750 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2.5">
                      <span className={`w-2 h-2 rounded-full shrink-0 ${log.access_status === 'granted' ? 'bg-emerald-500' : 'bg-red-500'}`}></span>
                      <div>
                        <div className="font-bold text-gray-900 dark:text-gray-100">{log.member_name}</div>
                        <div className="text-[10px] text-gray-400 font-mono">{log.gate_name} • {log.reason || '—'}</div>
                      </div>
                    </div>
                    <div className="text-left font-mono text-[10px] text-gray-500 shrink-0">
                      {new Date(log.scanned_at).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default GateScanner;

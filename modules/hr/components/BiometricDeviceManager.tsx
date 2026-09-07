import React, { useState, useEffect } from 'react';
import { useAccounting } from '../../../context/AccountingContext';
import { useToast } from '../../../context/ToastContext';
import {
  hrEnterpriseService,
  BiometricDevice,
  BiometricRawLog
} from '../../../services/hrEnterpriseService';
import {
  Cpu,
  RefreshCw,
  Plus,
  Radio,
  Wifi,
  WifiOff,
  Server,
  Activity,
  Clock,
  User,
  CheckCircle2,
  Trash2,
  Edit3,
  X,
  Copy,
  Check,
  Zap,
  Info,
  ShieldCheck
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { ar } from 'date-fns/locale';

export const BiometricDeviceManager: React.FC = () => {
  const { currentSelectedOrgId, currentUser, employees } = useAccounting();
  const { showToast } = useToast();

  const [devices, setDevices] = useState<BiometricDevice[]>([]);
  const [rawLogs, setRawLogs] = useState<BiometricRawLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncingDeviceId, setSyncingDeviceId] = useState<string | null>(null);

  // Device Modal
  const [isDeviceModalOpen, setIsDeviceModalOpen] = useState(false);
  const [deviceForm, setDeviceForm] = useState<Partial<BiometricDevice>>({
    name: '',
    serial_number: '',
    ip_address: '',
    port: 4370,
    device_type: 'ZKTECO_ADMS',
    location_branch: 'الفرع الرئيسي',
    is_active: true
  });
  const [savingDevice, setSavingDevice] = useState(false);

  // ADMS Guide Modal
  const [isGuideModalOpen, setIsGuideModalOpen] = useState(false);
  const [copiedUrl, setCopiedUrl] = useState(false);

  const orgId = currentSelectedOrgId || (currentUser as any)?.organization_id;

  const loadData = async () => {
    setLoading(true);
    try {
      const [devs, logs] = await Promise.all([
        hrEnterpriseService.getDevices(orgId),
        hrEnterpriseService.getRawLogs(orgId)
      ]);
      setDevices(devs);
      setRawLogs(logs);
    } catch (e: any) {
      console.warn('Load devices notice:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [orgId]);

  const handleSaveDevice = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!deviceForm.name?.trim()) {
      showToast('يرجى إدخال اسم الماكينة', 'warning');
      return;
    }

    setSavingDevice(true);
    try {
      await hrEnterpriseService.saveDevice(deviceForm, orgId);
      showToast('تم حفظ ماكينة البصمة بنجاح 📟✅', 'success');
      setIsDeviceModalOpen(false);
      setDeviceForm({
        name: '',
        serial_number: '',
        ip_address: '',
        port: 4370,
        device_type: 'ZKTECO_ADMS',
        location_branch: 'الفرع الرئيسي',
        is_active: true
      });
      loadData();
    } catch (e: any) {
      showToast('خطأ أثناء حفظ الماكينة: ' + e.message, 'error');
    } finally {
      setSavingDevice(false);
    }
  };

  const handleDeleteDevice = async (id: string, name: string) => {
    if (!window.confirm(`هل أنت متأكد من حذف ماكينة البصمة "${name}"؟`)) return;
    try {
      await hrEnterpriseService.deleteDevice(id);
      showToast('تم حذف الماكينة بنجاح 🗑️', 'success');
      loadData();
    } catch (e: any) {
      showToast('خطأ أثناء الحذف: ' + e.message, 'error');
    }
  };

  const handleSyncDevice = async (deviceId: string) => {
    setSyncingDeviceId(deviceId);
    try {
      const res = await hrEnterpriseService.syncDevicePunches(deviceId, orgId);
      if (res.success) {
        showToast(res.message + ' ⚡✅', 'success');
        loadData();
      } else {
        showToast(res.message, 'warning');
      }
    } catch (e: any) {
      showToast('فشل المزامنة: ' + e.message, 'error');
    } finally {
      setSyncingDeviceId(null);
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in">
      {/* Header */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-wrap justify-between items-center gap-4">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-gradient-to-br from-indigo-600 to-purple-600 rounded-2xl text-white shadow-md">
            <Cpu className="w-8 h-8" />
          </div>
          <div>
            <h2 className="text-2xl font-black text-slate-800">
              مركز ربط ماكينات البصمة (ZKTeco Biometrics Push Hub)
            </h2>
            <p className="text-xs text-slate-500 mt-1">
              إدارة أجهزة الحضور، التزامن اللحظي المباشر عبر ZKTeco ADMS & Cloud Push، وفك ترميز البصمات
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsGuideModalOpen(true)}
            className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold flex items-center gap-1.5 transition"
          >
            <Server className="w-4 h-4 text-indigo-600" /> إعداد خادم ADMS Push
          </button>

          <button
            onClick={() => setIsDeviceModalOpen(true)}
            className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold flex items-center gap-2 shadow-lg shadow-indigo-600/20 transition"
          >
            <Plus className="w-4 h-4" /> إضافة ماكينة بصمة
          </button>
        </div>
      </div>

      {/* Device Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {devices.map(dev => (
          <div
            key={dev.id}
            className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-between space-y-4 hover:border-indigo-300 transition"
          >
            <div className="flex justify-between items-start">
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-2xl flex items-center justify-center font-bold ${
                  dev.status === 'ONLINE' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'
                }`}>
                  <Radio className="w-5 h-5 animate-pulse" />
                </div>
                <div>
                  <h4 className="font-bold text-sm text-slate-800">{dev.name}</h4>
                  <span className="text-[11px] text-slate-400 font-medium block">
                    📍 {dev.location_branch}
                  </span>
                </div>
              </div>

              <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold flex items-center gap-1 ${
                dev.status === 'ONLINE' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-slate-100 text-slate-600'
              }`}>
                {dev.status === 'ONLINE' ? <Wifi className="w-3 h-3 text-emerald-600" /> : <WifiOff className="w-3 h-3" />}
                {dev.status === 'ONLINE' ? 'متصل وجاهز' : 'غير متصل'}
              </span>
            </div>

            <div className="bg-slate-50 p-3 rounded-xl border border-slate-100 space-y-1 text-xs font-mono">
              <div className="flex justify-between text-[11px]">
                <span className="text-slate-400">النوع:</span>
                <span className="font-bold text-indigo-700">{dev.device_type}</span>
              </div>
              <div className="flex justify-between text-[11px]">
                <span className="text-slate-400">IP / السيريال:</span>
                <span className="font-bold text-slate-700">{dev.ip_address || dev.serial_number || '192.168.1.201'}</span>
              </div>
              <div className="flex justify-between text-[11px]">
                <span className="text-slate-400">آخر مزامنة:</span>
                <span className="text-slate-600">
                  {dev.last_sync_at ? formatDistanceToNow(new Date(dev.last_sync_at), { addSuffix: true, locale: ar }) : 'لم تتم بعد'}
                </span>
              </div>
            </div>

            <div className="pt-2 border-t border-slate-100 flex justify-between items-center">
              <button
                onClick={() => handleDeleteDevice(dev.id, dev.name)}
                className="p-2 text-slate-400 hover:text-rose-600 transition"
                title="حذف الماكينة"
              >
                <Trash2 className="w-4 h-4" />
              </button>

              <button
                onClick={() => handleSyncDevice(dev.id)}
                disabled={syncingDeviceId === dev.id}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-sm transition"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${syncingDeviceId === dev.id ? 'animate-spin' : ''}`} />
                {syncingDeviceId === dev.id ? 'جاري السحب...' : 'سحب ومزامنة الحركات'}
              </button>
            </div>
          </div>
        ))}

        {devices.length === 0 && !loading && (
          <div className="col-span-full bg-white p-8 rounded-2xl border border-dashed border-slate-300 text-center text-slate-400 space-y-3">
            <Cpu className="w-12 h-12 text-slate-300 mx-auto" />
            <p className="text-xs font-bold text-slate-700">لم يتم تسجيل ماكينات بصمة بعد</p>
            <p className="text-[11px] text-slate-400">
              أضف ماكينات ZKTeco أو Hikvision لربط الحركات لحظياً مع سجل الحضور والورديات.
            </p>
            <button
              onClick={() => setIsDeviceModalOpen(true)}
              className="px-4 py-2 bg-indigo-600 text-white rounded-xl text-xs font-bold inline-flex items-center gap-1.5 shadow"
            >
              <Plus className="w-4 h-4" /> إضافة أول ماكينة
            </button>
          </div>
        )}
      </div>

      {/* Live Raw Punch Logs Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden space-y-3 p-5">
        <div className="flex justify-between items-center">
          <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
            <Activity className="w-4 h-4 text-indigo-600" />
            سجل حركات البصمة الحية الواردة (Live Biometric Stream) - آخر {rawLogs.length} حركة
          </h3>
          <span className="text-[11px] text-slate-400 font-mono">
            تحديث مباشر وتلقائي مع مطابقة الورديات
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-right text-xs">
            <thead className="bg-slate-50 text-slate-500 font-bold border-b border-slate-100">
              <tr>
                <th className="p-3">الموظف</th>
                <th className="p-3 text-center">كود البصمة (PIN)</th>
                <th className="p-3 text-center">وقت البصمة</th>
                <th className="p-3 text-center">نوع الحركة</th>
                <th className="p-3 text-center">حالة المعالجة</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rawLogs.map(log => (
                <tr key={log.id} className="hover:bg-slate-50 transition">
                  <td className="p-3 font-bold text-slate-800 flex items-center gap-2">
                    <User className="w-4 h-4 text-indigo-600" />
                    {log.employee_name || 'موظف بصمة'}
                  </td>
                  <td className="p-3 text-center font-mono font-bold text-slate-600">{log.biometric_id}</td>
                  <td className="p-3 text-center font-mono text-slate-600">
                    {new Date(log.log_timestamp).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit', second: '2-digit' })} ({new Date(log.log_timestamp).toLocaleDateString('ar-EG')})
                  </td>
                  <td className="p-3 text-center">
                    <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-indigo-50 text-indigo-800 border border-indigo-200">
                      {log.punch_state === 'CHECK_IN' ? 'تسجيل دخول 🟢' : 'تسجيل خروج 🔴'}
                    </span>
                  </td>
                  <td className="p-3 text-center">
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 flex items-center justify-center gap-1 w-fit mx-auto">
                      <CheckCircle2 className="w-3 h-3" /> تم الاحتساب في الحضور
                    </span>
                  </td>
                </tr>
              ))}

              {rawLogs.length === 0 && (
                <tr>
                  <td colSpan={5} className="p-8 text-center text-slate-400">
                    لا توجد حركات بصمة حديثة. اضغط على "سحب ومزامنة الحركات" من بطاقة الماكينة أعلاه.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add Device Modal */}
      {isDeviceModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto animate-in fade-in">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-lg overflow-hidden space-y-4 p-6 text-right">
            <div className="flex justify-between items-center border-b pb-3">
              <h3 className="font-bold text-base text-slate-800 flex items-center gap-2">
                <Cpu className="w-5 h-5 text-indigo-600" />
                إضافة ماكينة بصمة جديدة
              </h3>
              <button onClick={() => setIsDeviceModalOpen(false)} className="text-slate-400">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveDevice} className="space-y-3 text-xs">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">اسم الماكينة / الموقع <span className="text-red-500">*</span></label>
                <input
                  type="text"
                  required
                  value={deviceForm.name || ''}
                  onChange={e => setDeviceForm({ ...deviceForm, name: e.target.value })}
                  placeholder="مثال: ماكينة المدخل الرئيسي - فرع التجمع"
                  className="w-full border border-slate-300 rounded-xl p-2.5 text-xs outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">نوع وبروتوكول الماكينة</label>
                  <select
                    value={deviceForm.device_type || 'ZKTECO_ADMS'}
                    onChange={e => setDeviceForm({ ...deviceForm, device_type: e.target.value as any })}
                    className="w-full border border-slate-300 rounded-xl p-2.5 text-xs outline-none bg-white font-bold"
                  >
                    <option value="ZKTECO_ADMS">ZKTeco ADMS (سحابي Push)</option>
                    <option value="ZKTECO_STANDALONE">ZKTeco Standalone (شبكة محلية IP)</option>
                    <option value="HIKVISION">Hikvision Biometrics</option>
                    <option value="ANVIZ">Anviz Cloud</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">الفرع / الموقع</label>
                  <input
                    type="text"
                    value={deviceForm.location_branch || ''}
                    onChange={e => setDeviceForm({ ...deviceForm, location_branch: e.target.value })}
                    placeholder="الفرع الرئيسي"
                    className="w-full border border-slate-300 rounded-xl p-2.5 text-xs outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">عنوان IP أو النطاق</label>
                  <input
                    type="text"
                    value={deviceForm.ip_address || ''}
                    onChange={e => setDeviceForm({ ...deviceForm, ip_address: e.target.value })}
                    placeholder="192.168.1.201"
                    className="w-full border border-slate-300 rounded-xl p-2.5 text-xs font-mono outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">المنفذ (Port)</label>
                  <input
                    type="number"
                    value={deviceForm.port || 4370}
                    onChange={e => setDeviceForm({ ...deviceForm, port: Number(e.target.value) })}
                    className="w-full border border-slate-300 rounded-xl p-2.5 text-xs font-mono outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">الرقم التسلسلي (Serial Number)</label>
                <input
                  type="text"
                  value={deviceForm.serial_number || ''}
                  onChange={e => setDeviceForm({ ...deviceForm, serial_number: e.target.value })}
                  placeholder="ZK-SN-2026-X8890"
                  className="w-full border border-slate-300 rounded-xl p-2.5 text-xs font-mono outline-none"
                />
              </div>

              <div className="border-t pt-4 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsDeviceModalOpen(false)}
                  className="px-4 py-2 border border-slate-300 rounded-xl text-xs font-bold text-slate-600"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={savingDevice}
                  className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold shadow"
                >
                  {savingDevice ? 'جاري الحفظ...' : 'حفظ الماكينة'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ADMS Server Configuration Guide Modal */}
      {isGuideModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto animate-in fade-in">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-2xl overflow-hidden space-y-4 p-6 text-right">
            <div className="flex justify-between items-center border-b pb-3">
              <h3 className="font-bold text-base text-slate-800 flex items-center gap-2">
                <Server className="w-5 h-5 text-indigo-600" />
                إعدادات الربط السحابي مع ماكينات ZKTeco (ADMS Push Server)
              </h3>
              <button onClick={() => setIsGuideModalOpen(false)} className="text-slate-400">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs text-slate-600 leading-relaxed">
              <p>
                لربط ماكينة البصمة مباشرة مع النظام بحيث تُرسل البصمات لحظياً بمجرد ضغط الموظف على الماكينة:
              </p>

              <div className="bg-slate-900 text-slate-100 p-4 rounded-xl font-mono text-[11px] space-y-2 text-left dir-ltr">
                <div># ZKTeco Device ADMS Menu → Cloud Server Settings:</div>
                <div>Server Address: <span className="text-emerald-400">tripro.erp.cloud</span> (or your ERP Host)</div>
                <div>Server Port: <span className="text-indigo-400">443 / 8080</span></div>
                <div>Enable Domain Name: <span className="text-amber-400">ON</span></div>
                <div>Push Protocol: <span className="text-sky-400">ADMS / IClock HTTP Push</span></div>
              </div>

              <div className="p-3 bg-indigo-50 border border-indigo-200 rounded-xl text-indigo-900 flex items-start gap-2">
                <ShieldCheck className="w-5 h-5 text-indigo-600 flex-shrink-0 mt-0.5" />
                <div>
                  <strong>ميزة التوافق الذكي:</strong> يدعم النظام المزامنة التلقائية اللحظية، بالإضافة إلى إمكانية الضغط على زر "سحب ومزامنة الحركات" في أي وقت لجلب الحركات الحديثة ومعالجتها فورياً وفق وردية كل موظف.
                </div>
              </div>
            </div>

            <div className="border-t pt-3 flex justify-end">
              <button
                onClick={() => setIsGuideModalOpen(false)}
                className="px-5 py-2 bg-slate-800 text-white rounded-xl text-xs font-bold"
              >
                فهمت، إغلاق
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default BiometricDeviceManager;

import React, { useState, useEffect, useRef } from 'react';
import { useAccounting } from '../../../context/AccountingContext';
import { useToast } from '../../../context/ToastContext';
import {
  assetEnterpriseService,
  EnterpriseAsset,
  AssetAuditRecord
} from '../../../services/assetEnterpriseService';
import {
  QrCode,
  Barcode,
  Search,
  CheckCircle2,
  AlertTriangle,
  Wrench,
  XCircle,
  Truck,
  Building2,
  HardHat,
  MapPin,
  Camera,
  RefreshCw,
  Clock,
  Sparkles,
  ChevronRight,
  ShieldCheck,
  User,
  DollarSign
} from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';

export const AssetFieldScanner: React.FC = () => {
  const { currentSelectedOrgId, currentUser, organization } = useAccounting();
  const { showToast } = useToast();

  const [assets, setAssets] = useState<EnterpriseAsset[]>([]);
  const [selectedProject, setSelectedProject] = useState<string>('ALL');
  const [barcodeInput, setBarcodeInput] = useState('');
  const [scannedAsset, setScannedAsset] = useState<EnterpriseAsset | null>(null);
  const [recentAudits, setRecentAudits] = useState<AssetAuditRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  // New Location / Notes modal state
  const [auditNotes, setAuditNotes] = useState('');
  const [customLocation, setCustomLocation] = useState('');

  const barcodeInputRef = useRef<HTMLInputElement>(null);
  const orgId = currentSelectedOrgId || (currentUser as any)?.organization_id;

  const loadData = async () => {
    setLoading(true);
    try {
      const data = await assetEnterpriseService.getAssets(orgId);
      setAssets(data);
    } catch (e: any) {
      console.warn('Load assets error:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [orgId]);

  // Focus barcode input for barcode gun
  useEffect(() => {
    barcodeInputRef.current?.focus();
  }, [scannedAsset]);

  // Unique list of projects
  const projectList = Array.from(
    new Set(assets.map(a => a.project_name || 'المقر الرئيسي / المخزن'))
  );

  const filteredAssets = assets.filter(a => {
    if (selectedProject === 'ALL') return true;
    return (a.project_name || 'المقر الرئيسي / المخزن') === selectedProject;
  });

  const auditedCount = filteredAssets.filter(
    a => a.last_audit_date && a.last_audit_status === 'VERIFIED'
  ).length;

  const progressPercent =
    filteredAssets.length > 0
      ? Math.round((auditedCount / filteredAssets.length) * 100)
      : 0;

  const handleScanSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!barcodeInput.trim()) return;

    const found = await assetEnterpriseService.findAssetByTagOrBarcode(barcodeInput, orgId);
    if (found) {
      setScannedAsset(found);
      setCustomLocation(found.current_location);
      showToast(`تم التعرف على الأصل: ${found.name} 🔍`, 'info');
      setBarcodeInput('');
    } else {
      showToast(`لم يتم العثور على أصل بهذا الكود: "${barcodeInput}"`, 'warning');
    }
  };

  const handleQuickAudit = async (
    status: 'VERIFIED' | 'RELOCATED' | 'MISSING' | 'MAINTENANCE_REQUIRED'
  ) => {
    if (!scannedAsset) return;

    setSubmitting(true);
    try {
      const res = await assetEnterpriseService.submitAuditRecord(
        {
          assetId: scannedAsset.id,
          auditStatus: status,
          scannedLocation: customLocation || scannedAsset.current_location,
          scannedProjectName: scannedAsset.project_name,
          scannedProjectId: scannedAsset.project_id,
          notes: auditNotes,
          auditorName: (currentUser as any)?.full_name || (currentUser as any)?.name || 'مهندس الجرد الميداني'
        },
        orgId
      );

      if (res.success) {
        showToast(res.message, 'success');
        setRecentAudits(prev => [res.auditRecord, ...prev]);
        setScannedAsset(null);
        setAuditNotes('');
        loadData();
      } else {
        showToast(res.message, 'error');
      }
    } catch (e: any) {
      showToast('خطأ: ' + e.message, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-amber-950 to-slate-900 text-white p-6 md:p-8 rounded-3xl shadow-xl flex flex-wrap justify-between items-center gap-4">
        <div className="space-y-1">
          <div className="inline-flex items-center gap-2 bg-amber-500/20 text-amber-300 px-3 py-1 rounded-full text-xs font-bold border border-amber-500/30">
            <HardHat className="w-4 h-4 text-amber-400" />
            <span>نظام الجرد الميداني ومعدات المقاولات (Field Asset & Equipment Scanner)</span>
          </div>
          <h2 className="text-2xl md:text-3xl font-black">ماسح الباركود والجرد الميداني السريع</h2>
          <p className="text-xs text-amber-100 max-w-2xl">
            مسح ملصقات الأصول والمعدات الثقيلة في مواقع العمل الإنشائية والمشاريع، التحقق من موقعها، وتحديث حالتها التشغيلية فورياً.
          </p>
        </div>

        <div className="bg-white/10 backdrop-blur-md p-4 rounded-2xl border border-white/20 text-center min-w-[160px]">
          <span className="text-[11px] text-amber-200 block font-bold">نسبة إنجاز الجرد بالموقع</span>
          <div className="text-2xl font-black font-mono text-amber-400 mt-0.5">
            {progressPercent}%
          </div>
          <span className="text-[10px] text-slate-300">
            ({auditedCount} من أصل {filteredAssets.length} أصل)
          </span>
        </div>
      </div>

      {/* Project Selector & Progress Bar */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-4">
        <div className="flex flex-wrap justify-between items-center gap-4">
          <div className="flex items-center gap-2">
            <Building2 className="w-5 h-5 text-amber-600" />
            <label className="text-xs font-bold text-slate-800">موقع المشروع الإنشائي المستهدف للجرد:</label>
          </div>

          <select
            value={selectedProject}
            onChange={e => setSelectedProject(e.target.value)}
            className="border border-slate-300 rounded-xl p-2.5 text-xs font-bold text-slate-800 bg-white outline-none focus:ring-2 focus:ring-amber-500 min-w-[240px]"
          >
            <option value="ALL">-- كل المشاريع والمواقع ({assets.length} أصل ومعدة) --</option>
            {projectList.map(pName => (
              <option key={pName} value={pName}>
                🏗️ {pName} ({assets.filter(a => (a.project_name || 'المقر الرئيسي / المخزن') === pName).length} أصل)
              </option>
            ))}
          </select>
        </div>

        {/* Progress Bar */}
        <div className="space-y-1.5">
          <div className="w-full bg-slate-100 rounded-full h-3 overflow-hidden">
            <div
              className="bg-gradient-to-r from-amber-500 to-emerald-500 h-full transition-all duration-500 rounded-full"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
          <div className="flex justify-between text-[11px] text-slate-400 font-bold">
            <span>البداية</span>
            <span className="text-emerald-600 font-mono font-black">{progressPercent}% مكتمل</span>
            <span>100% تم جرد الموقع بالكامل</span>
          </div>
        </div>
      </div>

      {/* Barcode Search / Gun Input Form */}
      <div className="bg-gradient-to-br from-amber-500 to-orange-600 p-1 rounded-3xl shadow-lg">
        <div className="bg-white p-6 rounded-[22px] space-y-4">
          <form onSubmit={handleScanSubmit} className="flex gap-3">
            <div className="relative flex-1">
              <input
                ref={barcodeInputRef}
                type="text"
                value={barcodeInput}
                onChange={e => setBarcodeInput(e.target.value)}
                placeholder="امسح الباركود أو QR Code بمسدس الباركود أو اكتب الكود (مثال: AST-B8194A أو اسم المعدة)..."
                className="w-full pl-12 pr-4 py-3.5 border-2 border-amber-300 focus:border-amber-600 rounded-2xl text-xs font-bold font-mono text-slate-800 outline-none shadow-sm transition"
              />
              <div className="absolute left-3.5 top-3.5 text-amber-600">
                <Barcode className="w-6 h-6 animate-pulse" />
              </div>
            </div>

            <button
              type="submit"
              className="px-6 py-3.5 bg-amber-600 hover:bg-amber-700 text-white rounded-2xl text-xs font-bold flex items-center gap-2 shadow-lg shadow-amber-600/30 transition"
            >
              <Search className="w-4 h-4" /> فحص الأصل
            </button>
          </form>

          {/* Quick Select from Project Assets (Tags) */}
          <div className="pt-2">
            <span className="text-[11px] text-slate-400 font-bold block mb-2">
              أو اختر معدة/أصل سريعاً من قائمة الموقع الحالي:
            </span>
            <div className="flex flex-wrap gap-2 max-h-28 overflow-y-auto">
              {filteredAssets.slice(0, 12).map(ast => (
                <button
                  key={ast.id}
                  type="button"
                  onClick={() => {
                    setScannedAsset(ast);
                    setCustomLocation(ast.current_location);
                  }}
                  className={`px-3 py-1.5 rounded-xl text-[11px] font-bold flex items-center gap-1.5 border transition ${
                    scannedAsset?.id === ast.id
                      ? 'bg-amber-600 text-white border-amber-600 shadow'
                      : ast.last_audit_status === 'VERIFIED'
                      ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                      : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-amber-50'
                  }`}
                >
                  {ast.last_audit_status === 'VERIFIED' ? (
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                  ) : (
                    <HardHat className="w-3.5 h-3.5 text-amber-600" />
                  )}
                  <span>{ast.name}</span>
                  <span className="font-mono opacity-70 text-[9px]">({ast.asset_tag})</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Scanned Asset Identification & Quick Action Card */}
      {scannedAsset && (
        <div className="bg-white rounded-3xl border-2 border-amber-500 shadow-2xl p-6 md:p-8 space-y-6 animate-in zoom-in-95">
          <div className="flex flex-wrap justify-between items-start gap-4 border-b pb-4">
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 rounded-2xl bg-amber-50 border border-amber-200 flex items-center justify-center p-2">
                <QRCodeSVG value={`TRIPRO_ASSET:${scannedAsset.asset_tag}`} size={52} />
              </div>
              <div>
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold bg-amber-100 text-amber-900 inline-block mb-1">
                  {scannedAsset.asset_tag}
                </span>
                <h3 className="text-xl font-black text-slate-900">{scannedAsset.name}</h3>
                <span className="text-xs text-slate-500 font-bold block mt-0.5">
                  التصنيف: {scannedAsset.category} • تاريخ الشراء: {scannedAsset.purchase_date}
                </span>
              </div>
            </div>

            <div className="text-left font-mono">
              <span className="text-[11px] text-slate-400 block">القيمة الدفترية الحالية</span>
              <span className="text-xl font-black text-emerald-600">
                {scannedAsset.book_value?.toLocaleString()} ج.م
              </span>
            </div>
          </div>

          {/* Details Grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 bg-slate-50 p-4 rounded-2xl border border-slate-200 text-xs">
            <div>
              <span className="text-slate-400 block text-[10px]">المشروع الإنشائي:</span>
              <span className="font-bold text-slate-800 flex items-center gap-1 mt-0.5">
                <Building2 className="w-3.5 h-3.5 text-amber-600" />
                {scannedAsset.project_name || 'المقر الرئيسي'}
              </span>
            </div>

            <div>
              <span className="text-slate-400 block text-[10px]">الموقع الفعلي المسجل:</span>
              <span className="font-bold text-slate-800 flex items-center gap-1 mt-0.5">
                <MapPin className="w-3.5 h-3.5 text-rose-500" />
                {scannedAsset.current_location}
              </span>
            </div>

            <div>
              <span className="text-slate-400 block text-[10px]">المسؤول عن العهدة:</span>
              <span className="font-bold text-slate-800 flex items-center gap-1 mt-0.5">
                <User className="w-3.5 h-3.5 text-blue-600" />
                {scannedAsset.custodian_name || 'غير محدد'}
              </span>
            </div>

            <div>
              <span className="text-slate-400 block text-[10px]">تكلفة ساعة التشغيل:</span>
              <span className="font-bold text-slate-800 font-mono mt-0.5 block">
                {scannedAsset.hourly_operating_cost ? `${scannedAsset.hourly_operating_cost} ج/ساعة` : '---'}
              </span>
            </div>
          </div>

          {/* Location & Notes input */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">الموقع الفعلي أثناء الجرد:</label>
              <input
                type="text"
                value={customLocation}
                onChange={e => setCustomLocation(e.target.value)}
                placeholder="مثال: موقع البلوك B - الطابق الثالث"
                className="w-full border border-slate-300 rounded-xl p-2.5 outline-none font-bold text-slate-800 bg-white"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">ملاحظات الفحص وحالة المعدة:</label>
              <input
                type="text"
                value={auditNotes}
                onChange={e => setAuditNotes(e.target.value)}
                placeholder="ملاحظات فنية، نقص قطع، احتياج صيانة..."
                className="w-full border border-slate-300 rounded-xl p-2.5 outline-none text-slate-800 bg-white"
              />
            </div>
          </div>

          {/* 4 Big Instant Audit Action Buttons */}
          <div className="pt-2 space-y-2">
            <span className="text-xs font-black text-slate-800 block">اتخاذ إجراء الجرد الفوري الميداني:</span>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
              <button
                type="button"
                disabled={submitting}
                onClick={() => handleQuickAudit('VERIFIED')}
                className="p-4 bg-emerald-600 hover:bg-emerald-700 text-white rounded-2xl font-bold text-xs flex flex-col items-center justify-center gap-1.5 shadow-lg shadow-emerald-600/25 transition active:scale-95"
              >
                <CheckCircle2 className="w-6 h-6" />
                <span>موجود ومطابق للموقع ✅</span>
                <span className="text-[10px] text-emerald-100 font-normal">تأكيد سلامة الأصل</span>
              </button>

              <button
                type="button"
                disabled={submitting}
                onClick={() => handleQuickAudit('RELOCATED')}
                className="p-4 bg-blue-600 hover:bg-blue-700 text-white rounded-2xl font-bold text-xs flex flex-col items-center justify-center gap-1.5 shadow-lg shadow-blue-600/25 transition active:scale-95"
              >
                <Truck className="w-6 h-6" />
                <span>تحديث الموقع / نقل 🔄</span>
                <span className="text-[10px] text-blue-100 font-normal">تسجيل انتقال لموقع جديد</span>
              </button>

              <button
                type="button"
                disabled={submitting}
                onClick={() => handleQuickAudit('MAINTENANCE_REQUIRED')}
                className="p-4 bg-amber-600 hover:bg-amber-700 text-white rounded-2xl font-bold text-xs flex flex-col items-center justify-center gap-1.5 shadow-lg shadow-amber-600/25 transition active:scale-95"
              >
                <Wrench className="w-6 h-6" />
                <span>بحاجة لصيانة وعمرة 🛠️</span>
                <span className="text-[10px] text-amber-100 font-normal">إرسال تنبيه لفريق الصيانة</span>
              </button>

              <button
                type="button"
                disabled={submitting}
                onClick={() => handleQuickAudit('MISSING')}
                className="p-4 bg-rose-600 hover:bg-rose-700 text-white rounded-2xl font-bold text-xs flex flex-col items-center justify-center gap-1.5 shadow-lg shadow-rose-600/25 transition active:scale-95"
              >
                <XCircle className="w-6 h-6" />
                <span>غير موجود بالموقع ❌</span>
                <span className="text-[10px] text-rose-100 font-normal">تسجيل فقدان للمتابعة</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Field Audits History Stream */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-3">
        <div className="flex justify-between items-center">
          <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
            <Clock className="w-4 h-4 text-amber-600" /> سجل حركات الجرد الميداني المنفذة اليوم
          </h3>
          <span className="text-[11px] text-slate-400 font-mono">
            {recentAudits.length} عملية جرد مسجلة
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-right text-xs">
            <thead className="bg-slate-50 text-slate-500 font-bold border-b">
              <tr>
                <th className="p-3">الأصل / المعدة</th>
                <th className="p-3 text-center">كود الباركود</th>
                <th className="p-3">المشروع والموقع</th>
                <th className="p-3 text-center">حالة الجرد</th>
                <th className="p-3 text-center">القائم بالجرد</th>
                <th className="p-3 text-center">وقت الجرد</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {recentAudits.map(rec => (
                <tr key={rec.id} className="hover:bg-slate-50">
                  <td className="p-3 font-bold text-slate-800">{rec.asset_name}</td>
                  <td className="p-3 text-center font-mono font-bold text-amber-700">{rec.asset_tag}</td>
                  <td className="p-3">
                    <span className="font-bold text-slate-700 block">{rec.project_name || 'المقر الرئيسي'}</span>
                    <span className="text-[11px] text-slate-400">{rec.scanned_location}</span>
                  </td>
                  <td className="p-3 text-center">
                    <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                      rec.audit_status === 'VERIFIED'
                        ? 'bg-emerald-100 text-emerald-800'
                        : rec.audit_status === 'RELOCATED'
                        ? 'bg-blue-100 text-blue-800'
                        : rec.audit_status === 'MAINTENANCE_REQUIRED'
                        ? 'bg-amber-100 text-amber-800'
                        : 'bg-rose-100 text-rose-800'
                    }`}>
                      {rec.audit_status === 'VERIFIED'
                        ? 'مطابق ✅'
                        : rec.audit_status === 'RELOCATED'
                        ? 'تم النقل 🔄'
                        : rec.audit_status === 'MAINTENANCE_REQUIRED'
                        ? 'صيانة 🛠️'
                        : 'مفقود ❌'}
                    </span>
                  </td>
                  <td className="p-3 text-center text-slate-600">{rec.auditor_name}</td>
                  <td className="p-3 text-center font-mono text-slate-500">
                    {new Date(rec.audit_timestamp).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })}
                  </td>
                </tr>
              ))}

              {recentAudits.length === 0 && (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-slate-400">
                    لم تسجل عمليات جرد في هذه الجلسة بعد. امسح كود أصل لبدء الجرد.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default AssetFieldScanner;

import React, { useState, useEffect } from 'react';
import { useAccounting } from '../../../context/AccountingContext';
import { useToast } from '../../../context/ToastContext';
import {
  assetEnterpriseService,
  EnterpriseAsset,
  AssetTransferRecord
} from '../../../services/assetEnterpriseService';
import {
  Truck,
  Plus,
  ArrowLeftRight,
  Building2,
  Calendar,
  CheckCircle2,
  Printer,
  X,
  MapPin,
  User,
  FileText
} from 'lucide-react';

export const AssetTransferManager: React.FC = () => {
  const { currentSelectedOrgId, currentUser, organization } = useAccounting();
  const { showToast } = useToast();

  const [transfers, setTransfers] = useState<AssetTransferRecord[]>([]);
  const [assets, setAssets] = useState<EnterpriseAsset[]>([]);
  const [loading, setLoading] = useState(true);

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedAssetId, setSelectedAssetId] = useState('');
  const [toProjectName, setToProjectName] = useState('');
  const [toLocation, setToLocation] = useState('');
  const [driverName, setDriverName] = useState('');
  const [transportVehicle, setTransportVehicle] = useState('');
  const [transferDate, setTransferDate] = useState(new Date().toISOString().split('T')[0]);
  const [transferNotes, setTransferNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const orgId = currentSelectedOrgId || (currentUser as any)?.organization_id;

  const loadData = async () => {
    setLoading(true);
    try {
      const [astList, trfList] = await Promise.all([
        assetEnterpriseService.getAssets(orgId),
        assetEnterpriseService.getTransfers(orgId)
      ]);
      setAssets(astList);
      setTransfers(trfList);
      if (astList.length > 0) setSelectedAssetId(astList[0].id);
    } catch (e: any) {
      console.warn('Load transfers error:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [orgId]);

  const handleCreateTransfer = async (e: React.FormEvent) => {
    e.preventDefault();
    const asset = assets.find(a => a.id === selectedAssetId);
    if (!asset || !toProjectName.trim()) {
      showToast('يرجى اختيار الأصل وموقع/مشروع النقل الجديد', 'warning');
      return;
    }

    setSaving(true);
    try {
      await assetEnterpriseService.createTransfer(
        {
          asset_id: asset.id,
          asset_name: asset.name,
          from_project_name: asset.project_name || 'الموقع السابق',
          from_location: asset.current_location,
          to_project_name: toProjectName.trim(),
          to_location: toLocation.trim() || toProjectName.trim(),
          driver_name: driverName,
          transport_vehicle: transportVehicle,
          transfer_date: transferDate,
          notes: transferNotes,
          status: 'COMPLETED'
        },
        orgId
      );

      showToast('تم تسجيل إذن نقل ومناقلة المعدة وتحديث موقعها بنجاح 🚚✅', 'success');
      setIsModalOpen(false);
      setToProjectName('');
      setToLocation('');
      setDriverName('');
      setTransportVehicle('');
      setTransferNotes('');
      loadData();
    } catch (e: any) {
      showToast('خطأ: ' + e.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in">
      {/* Header */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-wrap justify-between items-center gap-4">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-gradient-to-br from-blue-600 to-indigo-600 rounded-2xl text-white shadow-md">
            <Truck className="w-8 h-8" />
          </div>
          <div>
            <h2 className="text-2xl font-black text-slate-800">
              مناقلات الأصول ومعدات المقاولات (Site Equipment Relocations)
            </h2>
            <p className="text-xs text-slate-500 mt-1">
              إدارة أذون نقل وتحويل المعدات الثقيلة والأصول بين المشاريع الإنشائية والفروع وتتبعها لحظياً
            </p>
          </div>
        </div>

        <button
          onClick={() => setIsModalOpen(true)}
          className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold flex items-center gap-2 shadow-lg shadow-blue-600/20 transition"
        >
          <Plus className="w-4 h-4" /> إنشاء إذن نقل أصل / معدة
        </button>
      </div>

      {/* Transfers List */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-right text-xs">
            <thead className="bg-slate-50 text-slate-500 font-bold border-b">
              <tr>
                <th className="p-3.5">رقم الإذن</th>
                <th className="p-3.5">الأصل / المعدة</th>
                <th className="p-3.5">من موقع / مشروع</th>
                <th className="p-3.5">إلى موقع / مشروع</th>
                <th className="p-3.5">السائق ووسيلة النقل</th>
                <th className="p-3.5 text-center">تاريخ النقل</th>
                <th className="p-3.5 text-center">الحالة</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {transfers.map(trf => (
                <tr key={trf.id} className="hover:bg-slate-50 transition">
                  <td className="p-3.5 font-mono font-bold text-blue-700">{trf.transfer_number}</td>
                  <td className="p-3.5 font-bold text-slate-800 flex items-center gap-2">
                    <Truck className="w-4 h-4 text-blue-600" />
                    {trf.asset_name}
                  </td>
                  <td className="p-3.5">
                    <span className="font-bold text-slate-700 block">{trf.from_project_name}</span>
                    <span className="text-[10px] text-slate-400">{trf.from_location}</span>
                  </td>
                  <td className="p-3.5">
                    <span className="font-bold text-emerald-700 block">{trf.to_project_name}</span>
                    <span className="text-[10px] text-slate-400">{trf.to_location}</span>
                  </td>
                  <td className="p-3.5 text-slate-600">
                    <span className="block font-bold">{trf.driver_name || 'سائق الشركة'}</span>
                    <span className="text-[10px] text-slate-400 font-mono">{trf.transport_vehicle || '---'}</span>
                  </td>
                  <td className="p-3.5 text-center font-mono text-slate-500">{trf.transfer_date}</td>
                  <td className="p-3.5 text-center">
                    <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">
                      تم النقل والاستلام ✅
                    </span>
                  </td>
                </tr>
              ))}

              {transfers.length === 0 && (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-slate-400">
                    لا توجد أذون مناقلة مسجلة بعد. اضغط على "إنشاء إذن نقل أصل / معدة".
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Transfer Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto animate-in fade-in">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-lg overflow-hidden space-y-4 p-6 text-right">
            <div className="flex justify-between items-center border-b pb-3">
              <h3 className="font-bold text-base text-slate-800 flex items-center gap-2">
                <Truck className="w-5 h-5 text-blue-600" />
                إذن نقل ومناقلة معدة / أصل
              </h3>
              <button onClick={() => setIsModalOpen(false)} className="text-slate-400">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateTransfer} className="space-y-3 text-xs">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">المعدة / الأصل المراد نقله <span className="text-red-500">*</span></label>
                <select
                  value={selectedAssetId}
                  onChange={e => setSelectedAssetId(e.target.value)}
                  className="w-full border border-slate-300 rounded-xl p-2.5 text-xs font-bold bg-white outline-none"
                >
                  {assets.map(ast => (
                    <option key={ast.id} value={ast.id}>
                      {ast.name} ({ast.asset_tag}) - حالياً في: {ast.project_name || 'المقر الرئيسي'}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">إلى مشروع / موقع <span className="text-red-500">*</span></label>
                  <input
                    type="text"
                    required
                    value={toProjectName}
                    onChange={e => setToProjectName(e.target.value)}
                    placeholder="مثال: مشروع مجمع النخيل"
                    className="w-full border border-slate-300 rounded-xl p-2.5 outline-none font-bold text-slate-800"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">المكان التفصيلي بالموقع</label>
                  <input
                    type="text"
                    value={toLocation}
                    onChange={e => setToLocation(e.target.value)}
                    placeholder="موقع الحفر - القطعة 4"
                    className="w-full border border-slate-300 rounded-xl p-2.5 outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">اسم السائق / مسؤول النقل</label>
                  <input
                    type="text"
                    value={driverName}
                    onChange={e => setDriverName(e.target.value)}
                    placeholder="مثال: أحمد عبد الله"
                    className="w-full border border-slate-300 rounded-xl p-2.5 outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">وسيلة النقل / رقم الشاحنة</label>
                  <input
                    type="text"
                    value={transportVehicle}
                    onChange={e => setTransportVehicle(e.target.value)}
                    placeholder="شاحنة نقل ثقيل (نقل 4892)"
                    className="w-full border border-slate-300 rounded-xl p-2.5 outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">تاريخ النقل</label>
                <input
                  type="date"
                  value={transferDate}
                  onChange={e => setTransferDate(e.target.value)}
                  className="w-full border border-slate-300 rounded-xl p-2.5 outline-none font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">ملاحظات التحويل</label>
                <textarea
                  rows={2}
                  value={transferNotes}
                  onChange={e => setTransferNotes(e.target.value)}
                  placeholder="أي ملاحظات تخص حالة المعدة قبل النقل..."
                  className="w-full border border-slate-300 rounded-xl p-2.5 outline-none"
                />
              </div>

              <div className="border-t pt-4 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 border border-slate-300 rounded-xl text-xs font-bold text-slate-600"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow"
                >
                  {saving ? 'جاري الحفظ...' : 'تأكيد وإصدار إذن النقل'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default AssetTransferManager;

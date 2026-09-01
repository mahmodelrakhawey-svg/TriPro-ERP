import React, { useState, useEffect } from 'react';
import { useAccounting } from '../../../context/AccountingContext';
import { useToast } from '../../../context/ToastContext';
import { assetEnterpriseService, EnterpriseAsset } from '../../../services/assetEnterpriseService';
import { QRCodeSVG } from 'qrcode.react';
import {
  Printer,
  QrCode,
  Tag,
  Building2,
  HardHat,
  Filter,
  CheckSquare,
  Square,
  Layers,
  Sparkles
} from 'lucide-react';

export const AssetLabelStudio: React.FC = () => {
  const { currentSelectedOrgId, currentUser, organization } = useAccounting();
  const { showToast } = useToast();

  const [assets, setAssets] = useState<EnterpriseAsset[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [filterProject, setFilterProject] = useState<string>('ALL');
  const [filterCategory, setFilterCategory] = useState<string>('ALL');
  const [labelSize, setLabelSize] = useState<'STANDARD' | 'COMPACT' | 'BADGE'>('STANDARD');
  const [loading, setLoading] = useState(true);

  const orgId = currentSelectedOrgId || (currentUser as any)?.organization_id;

  const loadAssets = async () => {
    setLoading(true);
    try {
      const data = await assetEnterpriseService.getAssets(orgId);
      setAssets(data);
      // الافتراضي: تحديد الكل
      setSelectedIds(data.map(a => a.id));
    } catch (e: any) {
      console.warn('Load error:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAssets();
  }, [orgId]);

  const projects = Array.from(new Set(assets.map(a => a.project_name || 'المقر الرئيسي')));
  const categories = Array.from(new Set(assets.map(a => a.category || 'MACHINERY')));

  const filteredAssets = assets.filter(a => {
    const pMatch = filterProject === 'ALL' || (a.project_name || 'المقر الرئيسي') === filterProject;
    const cMatch = filterCategory === 'ALL' || a.category === filterCategory;
    return pMatch && cMatch;
  });

  const handleToggleSelectAll = () => {
    if (selectedIds.length === filteredAssets.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(filteredAssets.map(a => a.id));
    }
  };

  const handleToggleSelect = (id: string) => {
    setSelectedIds(prev => (prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]));
  };

  const printableAssets = filteredAssets.filter(a => selectedIds.includes(a.id));

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="space-y-6 animate-in fade-in">
      {/* Header (Hidden in Print) */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-wrap justify-between items-center gap-4 print:hidden">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-gradient-to-br from-indigo-600 to-purple-600 rounded-2xl text-white shadow-md">
            <Tag className="w-8 h-8" />
          </div>
          <div>
            <h2 className="text-2xl font-black text-slate-800">
              استوديو طباعة باركود وملصقات الأصول (Asset Tag & QR Studio)
            </h2>
            <p className="text-xs text-slate-500 mt-1">
              توليد وطباعة بطاقات وملصقات الباركود و QR Code الحرارية للأصول ومعدات المشاريع الإنشائية
            </p>
          </div>
        </div>

        <button
          onClick={handlePrint}
          disabled={printableAssets.length === 0}
          className="px-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold flex items-center gap-2 shadow-lg shadow-indigo-600/25 transition disabled:opacity-50"
        >
          <Printer className="w-4 h-4" />
          <span>طباعة ({printableAssets.length}) ملصق حراري</span>
        </button>
      </div>

      {/* Control Bar (Hidden in Print) */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 items-end print:hidden">
        <div>
          <label className="block text-xs font-bold text-slate-700 mb-1.5 flex items-center gap-1">
            <Building2 className="w-3.5 h-3.5 text-amber-600" /> فلترة حسب المشروع
          </label>
          <select
            value={filterProject}
            onChange={e => setFilterProject(e.target.value)}
            className="w-full border border-slate-300 rounded-xl p-2.5 text-xs font-bold text-slate-800 bg-white outline-none"
          >
            <option value="ALL">-- كل المشاريع والمواقع --</option>
            {projects.map(p => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs font-bold text-slate-700 mb-1.5 flex items-center gap-1">
            <HardHat className="w-3.5 h-3.5 text-indigo-600" /> التصنيف
          </label>
          <select
            value={filterCategory}
            onChange={e => setFilterCategory(e.target.value)}
            className="w-full border border-slate-300 rounded-xl p-2.5 text-xs font-bold text-slate-800 bg-white outline-none"
          >
            <option value="ALL">-- كل التصنيفات --</option>
            {categories.map(c => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs font-bold text-slate-700 mb-1.5">مقاس الملصق</label>
          <select
            value={labelSize}
            onChange={e => setLabelSize(e.target.value as any)}
            className="w-full border border-slate-300 rounded-xl p-2.5 text-xs font-bold text-slate-800 bg-white outline-none"
          >
            <option value="STANDARD">قياسي حراري (70 × 45 مم)</option>
            <option value="COMPACT">مدمج للمعدات الصغيرة (50 × 30 مم)</option>
            <option value="BADGE">بطاقة معدات إنشائية كبيرة (Badge)</option>
          </select>
        </div>

        <div>
          <button
            type="button"
            onClick={handleToggleSelectAll}
            className="w-full border border-slate-300 hover:bg-slate-50 text-slate-700 p-2.5 rounded-xl font-bold text-xs flex items-center justify-center gap-2 h-[42px] transition"
          >
            {selectedIds.length === filteredAssets.length ? (
              <CheckSquare className="w-4 h-4 text-indigo-600" />
            ) : (
              <Square className="w-4 h-4 text-slate-400" />
            )}
            <span>{selectedIds.length === filteredAssets.length ? 'إلغاء تحديد الكل' : 'تحديد كل المعروض'}</span>
          </button>
        </div>
      </div>

      {/* Printable Grid of Labels */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 print:grid-cols-3 print:gap-3">
        {printableAssets.map(ast => (
          <div
            key={ast.id}
            onClick={() => handleToggleSelect(ast.id)}
            className={`bg-white border-2 rounded-2xl p-4 flex flex-col justify-between space-y-3 cursor-pointer transition relative group print:cursor-default print:border-black print:rounded-none print:p-2 ${
              selectedIds.includes(ast.id) ? 'border-indigo-600 shadow-md' : 'border-slate-200 opacity-60'
            }`}
          >
            {/* Header / Org */}
            <div className="flex justify-between items-start border-b border-slate-200 pb-2 print:border-black">
              <div>
                <h4 className="font-black text-xs text-slate-900 leading-tight line-clamp-1">{organization?.name || 'TriPro ERP'}</h4>
                <span className="text-[9px] text-slate-500 font-bold block">إدارة الأصول الثابتة والمعدات</span>
              </div>
              <span className="text-[10px] font-mono font-black bg-slate-900 text-white px-1.5 py-0.5 rounded print:bg-black">
                {ast.asset_tag}
              </span>
            </div>

            {/* Middle: QR & Details */}
            <div className="flex items-center gap-3">
              <div className="bg-white p-1.5 border border-slate-300 rounded-xl flex-shrink-0 print:border-black">
                <QRCodeSVG value={`TRIPRO_ASSET:${ast.asset_tag}`} size={64} level="M" />
              </div>
              <div className="space-y-1 text-[11px] leading-tight flex-1">
                <div className="font-black text-slate-800 line-clamp-2 text-xs">{ast.name}</div>
                <div className="text-[10px] text-slate-500 font-bold">
                  🏗️ {ast.project_name || 'المقر الرئيسي'}
                </div>
                <div className="text-[9px] text-slate-400 font-mono">
                  📍 {ast.current_location}
                </div>
              </div>
            </div>

            {/* Footer / Barcode string */}
            <div className="border-t border-slate-200 pt-1.5 flex justify-between items-center text-[9px] text-slate-500 font-mono print:border-black">
              <span>{ast.category}</span>
              <span className="font-bold text-slate-700">{ast.purchase_date}</span>
            </div>
          </div>
        ))}
      </div>

      {printableAssets.length === 0 && (
        <div className="bg-white p-12 text-center text-slate-400 border border-dashed rounded-2xl print:hidden">
          لا توجد أصول محددة للطباعة. يرجى تعديل الفلترة أعلاه.
        </div>
      )}
    </div>
  );
};

export default AssetLabelStudio;

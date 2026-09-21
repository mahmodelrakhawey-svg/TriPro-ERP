import React from 'react';
import { 
  X, 
  Image as ImageIcon, 
  Upload, 
  Barcode, 
  Scale, 
  PlusCircle, 
  Trash2, 
  Sparkles, 
  Percent, 
  UtensilsCrossed, 
  AlertTriangle, 
  Plus, 
  Edit, 
  PackageOpen 
} from 'lucide-react';
import SearchableSelect from '../../../components/SearchableSelect';
import { getCurrencySymbol } from '../../../utils/constants';

export type ProductFormData = {
  name: string;
  sku: string;
  barcode: string;
  sales_price: number;
  description: string;
  purchase_price: number;
  unit: string;
  base_uom_id: string;
  purchase_uom_id: string;
  sale_uom_id: string;
  product_type: 'STOCK' | 'SERVICE' | 'RAW_MATERIAL' | 'MANUFACTURED' | 'INTERMEDIATE_PRODUCT';
  inventory_account_id: string;
  cogs_account_id: string;
  sales_account_id: string;
  image_url: string;
  opening_stock: number;
  opening_warehouse_id?: string;
  category_id: string | null;
  min_stock_level: number;
  requires_serial: boolean;
  expiry_date: string;
  offer_price: number;
  offer_start_date: string;
  offer_end_date: string;
  offer_max_qty: number;
  available_modifiers: any[];
  labor_cost: number;
  overhead_cost: number;
  is_overhead_percentage: boolean;
  // ========== حقول الهايبر ماركت ==========
  barcode2: string;
  is_scale_item: boolean;
  plu_number: number;
  scale_prefix: string;
  shelf_location: string;
  brand: string;
  country_of_origin: string;
  age_restricted: boolean;
  tax_rate_override: number;
  unit_barcodes: Array<{ uom_id?: string; barcode: string; price?: number; uom_name?: string }>;
  // ========== حدود التسعير والمخزون المتقدمة ==========
  min_sales_price: number;
  max_stock_level: number;
  wholesale_price: number;
  half_wholesale_price: number;
  supplier_id?: string | null;
  // ========== بيانات الفاتورة الإلكترونية المصرية ==========
  item_code_type?: 'GS1' | 'EGS';
  egs_code?: string;
  eta_unit_code?: string;
};

export interface ProductFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  editingId: string | null;
  formData: ProductFormData;
  setFormData: React.Dispatch<React.SetStateAction<ProductFormData>>;
  handleSubmit: (e: React.FormEvent) => Promise<void>;
  handleImageUpload: (e: React.ChangeEvent<HTMLInputElement>) => Promise<void>;
  uploading: boolean;
  categories: any[];
  warehouses: any[];
  uoms: any[];
  suppliers?: any[];
  hasSupplierColumn?: boolean;
  hasEtaColumns?: boolean;
  settings: any;
  accounts: {
    assets: any[];
    expenses: any[];
    revenue: any[];
  };
  recipeCost: number;
  existingOpenings: any[];
  generateUniqueSku: (prefix?: string) => string;
  generateUniqueBarcode: () => string;
  handleAddCategory: () => void;
  handleEditCategory: () => void;
  handleDeleteCategory: () => Promise<void>;
  getSystemAccount: (key: string) => any;
}

export const ProductFormModal: React.FC<ProductFormModalProps> = ({
  isOpen,
  onClose,
  editingId,
  formData,
  setFormData,
  handleSubmit,
  handleImageUpload,
  uploading,
  categories,
  warehouses,
  uoms,
  suppliers = [],
  hasSupplierColumn = false,
  hasEtaColumns = false,
  settings,
  accounts,
  recipeCost,
  existingOpenings,
  generateUniqueSku,
  generateUniqueBarcode,
  handleAddCategory,
  handleEditCategory,
  handleDeleteCategory,
  getSystemAccount,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl overflow-hidden animate-in zoom-in-95">
        <div className="bg-slate-50 px-6 py-4 border-b flex justify-between items-center">
          <h3 className="font-bold text-lg text-slate-800">{editingId ? 'تعديل صنف' : 'إضافة صنف جديد'}</h3>
          <button onClick={onClose}><X className="text-slate-400 hover:text-red-500" /></button>
        </div>
        
        <form onSubmit={handleSubmit} className="p-6 space-y-4 max-h-[80vh] overflow-y-auto">
          
          <div className="flex gap-4">
            {/* Image Upload */}
            <div className="w-24 flex-shrink-0">
              <div className="relative group cursor-pointer w-24 h-24 bg-slate-100 rounded-xl border-2 border-dashed border-slate-300 flex items-center justify-center overflow-hidden">
                {formData.image_url ? (
                  <img src={formData.image_url} alt="Preview" className="w-full h-full object-cover" />
                ) : (
                  <ImageIcon className="text-slate-400 w-8 h-8" />
                )}
                <label className="absolute inset-0 flex items-center justify-center bg-black/50 text-white opacity-0 group-hover:opacity-100 transition-opacity rounded-xl cursor-pointer">
                  <Upload size={20} />
                  <input type="file" accept="image/*" onChange={handleImageUpload} className="hidden" disabled={uploading} />
                </label>
              </div>
            </div>

            <div className="flex-1 space-y-4">
              <div>
                <label className="block text-sm font-bold mb-1 text-slate-700">اسم الصنف <span className="text-red-500">*</span></label>
                <input required type="text" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} className="w-full border rounded-lg p-2 focus:ring-2 focus:ring-emerald-500 outline-none" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-bold mb-1 text-slate-700">نوع الصنف</label>
                  <select 
                    value={formData.product_type} 
                    onChange={e => {
                      const newType = e.target.value as 'STOCK' | 'SERVICE' | 'MANUFACTURED' | 'RAW_MATERIAL' | 'INTERMEDIATE_PRODUCT';
                      let updatedInvAcc = formData.inventory_account_id;
                      if (newType === 'RAW_MATERIAL') {
                        updatedInvAcc = getSystemAccount('INVENTORY_RAW_MATERIALS')?.id || formData.inventory_account_id;
                      } else if (newType === 'MANUFACTURED' || newType === 'INTERMEDIATE_PRODUCT') {
                        updatedInvAcc = getSystemAccount('INVENTORY_FINISHED_GOODS')?.id || formData.inventory_account_id;
                      }
                      setFormData({
                        ...formData,
                        product_type: newType,
                        inventory_account_id: updatedInvAcc
                      });
                    }}
                    className="w-full border rounded-lg p-2 bg-white"
                  >
                    <option value="STOCK">مخزوني (بضاعة)</option>
                    <option value="RAW_MATERIAL">خامة أولية (Raw Material)</option>
                    <option value="MANUFACTURED">منتج مصنع (Finished Good)</option>
                    <option value="INTERMEDIATE_PRODUCT">منتج وسيط / نصف مصنع (Subassembly / Intermediate)</option>
                    <option value="SERVICE">خدمة (ليس لها مخزون)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-bold mb-1 text-slate-700">وحدة القياس</label>
                  <select 
                    value={formData.unit} 
                    onChange={e => setFormData({...formData, unit: e.target.value})}
                    className="w-full border rounded-lg p-2 bg-white"
                  >
                    <option value="piece">قطعة (Piece)</option>
                    <option value="count">عدد (Count)</option>
                    <option value="kg">كجم (KG)</option>
                    <option value="g">جرام (Gram)</option>
                    <option value="l">لتر (Liter)</option>
                    <option value="ml">مللي (ML)</option>
                    <option value="box">علبة/كرتون (Box)</option>
                    <option value="crate">صندوق (Crate)</option>
                    <option value="pallet">بالتة (Pallet)</option>
                    <option value="m">متر (Meter)</option>
                  </select>
                </div>
                <div className="col-span-2 bg-blue-50/50 p-4 rounded-xl border border-blue-100 space-y-3">
                    <div className="grid grid-cols-3 gap-4">
                        <div>
                            <label className="block text-[10px] font-black text-blue-600 mb-1">الوحدة الأساسية (للمخزن)</label>
                            <select value={formData.base_uom_id} onChange={e => setFormData({...formData, base_uom_id: e.target.value})} className="w-full border rounded-lg p-2 text-sm bg-white">
                                <option value="">-- اختر --</option>
                                {uoms.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                            </select>
                        </div>
                        <div>
                            <label className="block text-[10px] font-black text-blue-600 mb-1">وحدة المشتريات</label>
                            <select value={formData.purchase_uom_id} onChange={e => setFormData({...formData, purchase_uom_id: e.target.value})} className="w-full border rounded-lg p-2 text-sm bg-white">
                                <option value="">-- اختر --</option>
                                {uoms.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                            </select>
                        </div>
                        <div>
                            <label className="block text-[10px] font-black text-blue-600 mb-1">وحدة المبيعات</label>
                            <select value={formData.sale_uom_id} onChange={e => setFormData({...formData, sale_uom_id: e.target.value})} className="w-full border rounded-lg p-2 text-sm bg-white">
                                <option value="">-- اختر --</option>
                                {uoms.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                            </select>
                        </div>
                    </div>

                    {/* 🏷️ باركودات الوحدات المتعددة (Barcode per UOM) */}
                    <div className="pt-3 border-t border-blue-200/60">
                        <div className="flex items-center justify-between mb-2">
                            <span className="text-xs font-black text-slate-700 flex items-center gap-1.5">
                                <Barcode size={14} className="text-indigo-600" />
                                باركودات الوحدات الأخرى (مثال: باركود للعلبة أو الكرتونة)
                            </span>
                            <button
                                type="button"
                                onClick={() => {
                                    const current = Array.isArray(formData.unit_barcodes) ? formData.unit_barcodes : [];
                                    setFormData({
                                      ...formData,
                                      unit_barcodes: [...current, { uom_id: '', uom_name: '', barcode: '', price: 0 }]
                                    });
                                }}
                                className="text-[11px] bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold px-2.5 py-1 rounded-lg border border-indigo-200 flex items-center gap-1"
                            >
                                <PlusCircle size={12} /> إضافة باركود لوحدة
                            </button>
                        </div>

                        {Array.isArray(formData.unit_barcodes) && formData.unit_barcodes.length > 0 && (
                            <div className="space-y-2">
                                {formData.unit_barcodes.map((ub, idx) => (
                                    <div key={idx} className="grid grid-cols-12 gap-2 items-center bg-white p-2.5 rounded-lg border border-slate-200">
                                        <div className="col-span-4">
                                            <label className="text-[10px] text-slate-500 block">الوحدة</label>
                                            <select
                                                value={ub.uom_id || ''}
                                                onChange={e => {
                                                    const selectedUom = uoms.find(u => u.id === e.target.value);
                                                    const updated = [...formData.unit_barcodes];
                                                    updated[idx] = {
                                                        ...updated[idx],
                                                        uom_id: e.target.value,
                                                        uom_name: selectedUom?.name || ''
                                                    };
                                                    setFormData({ ...formData, unit_barcodes: updated });
                                                }}
                                                className="w-full border rounded p-1 text-xs"
                                            >
                                                <option value="">-- اختر الوحدة --</option>
                                                {uoms.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                                            </select>
                                        </div>
                                        <div className="col-span-4">
                                            <label className="text-[10px] text-slate-500 block">الباركود</label>
                                            <input
                                                type="text"
                                                value={ub.barcode || ''}
                                                onChange={e => {
                                                    const updated = [...formData.unit_barcodes];
                                                    updated[idx] = { ...updated[idx], barcode: e.target.value };
                                                    setFormData({ ...formData, unit_barcodes: updated });
                                                }}
                                                placeholder="Scan Barcode..."
                                                className="w-full border rounded p-1 text-xs font-mono"
                                            />
                                        </div>
                                        <div className="col-span-3">
                                            <label className="text-[10px] text-slate-500 block">سعر البيع المخصص (اختياري)</label>
                                            <input
                                                type="number"
                                                step="0.01"
                                                value={ub.price || ''}
                                                onChange={e => {
                                                    const updated = [...formData.unit_barcodes];
                                                    updated[idx] = { ...updated[idx], price: parseFloat(e.target.value) || 0 };
                                                    setFormData({ ...formData, unit_barcodes: updated });
                                                }}
                                                placeholder="0.00"
                                                className="w-full border rounded p-1 text-xs font-mono"
                                            />
                                        </div>
                                        <div className="col-span-1 text-center pt-3">
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    const updated = formData.unit_barcodes.filter((_, i) => i !== idx);
                                                    setFormData({ ...formData, unit_barcodes: updated });
                                                }}
                                                className="text-red-500 hover:text-red-700 p-1"
                                                title="حذف"
                                            >
                                                <Trash2 size={14} />
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
                <div className="col-span-2 md:col-span-1">
                    <div className="flex items-center justify-between mb-1">
                        <label className="block text-sm font-bold text-slate-700">الكود (SKU) *</label>
                        <button
                          type="button"
                          onClick={() => setFormData({ ...formData, sku: generateUniqueSku() })}
                          className="text-xs text-indigo-600 hover:text-indigo-800 font-bold flex items-center gap-1 bg-indigo-50 hover:bg-indigo-100 px-2 py-0.5 rounded transition-colors"
                          title="توليد كود تلقائي فريد"
                        >
                          <Sparkles size={13} className="text-indigo-600" />
                          توليد كود تلقائي
                        </button>
                    </div>
                    <input 
                      type="text" 
                      value={formData.sku} 
                      onChange={e => setFormData({...formData, sku: e.target.value})} 
                      onKeyDown={e => { if (e.key === 'Enter') e.preventDefault(); }}
                      className="w-full border border-slate-300 rounded-lg p-2 font-mono text-sm focus:ring-2 focus:ring-indigo-500 outline-none" 
                      placeholder="مثال: SKU-00001"
                    />
                    <span className="text-[10px] text-slate-400 block mt-0.5">معرف الصنف الفريد (يتم توليده تلقائياً إذا تُرك فارغاً)</span>
                </div>
                <div className="col-span-2 md:col-span-1">
                    <div className="flex items-center justify-between mb-1">
                        <label className="block text-sm font-bold text-slate-700">الباركود</label>
                        <button
                          type="button"
                          onClick={() => setFormData({ ...formData, barcode: generateUniqueBarcode() })}
                          className="text-xs text-purple-600 hover:text-purple-800 font-bold flex items-center gap-1 bg-purple-50 hover:bg-purple-100 px-2 py-0.5 rounded transition-colors"
                          title="توليد باركود تلقائي"
                        >
                          <Barcode size={13} className="text-purple-600" />
                          توليد باركود
                        </button>
                    </div>
                    <input 
                      type="text" 
                      value={formData.barcode} 
                      onChange={e => setFormData({...formData, barcode: e.target.value})} 
                      onKeyDown={e => { if (e.key === 'Enter') e.preventDefault(); }}
                      className="w-full border border-slate-300 rounded-lg p-2 font-mono text-sm focus:ring-2 focus:ring-purple-500 outline-none" 
                      placeholder="امسح الباركود بمسدس الليزر أو اضغط توليد..." 
                    />
                    <span className="text-[10px] text-slate-400 block mt-0.5">باركود المنتج للبيع عبر الكاشير بالليزر</span>
                </div>

                {/* 🏛️ بيانات الفاتورة الإلكترونية لمصلحة الضرائب المصرية (ETA e-Invoicing) */}
                <div className="col-span-2 bg-amber-50/60 p-4 rounded-xl border border-amber-200/80 space-y-3">
                  <div className="flex items-center gap-2 text-amber-900 font-bold text-xs">
                    <span className="text-base">🏛️</span>
                    <span>بيانات الربط مع مصلحة الضرائب المصرية (ETA e-Invoicing)</span>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div>
                      <label className="block text-[11px] font-bold text-slate-700 mb-1">نوع الكود الضريبي</label>
                      <select
                        value={formData.item_code_type || 'EGS'}
                        onChange={e => setFormData({ ...formData, item_code_type: e.target.value as 'GS1' | 'EGS' })}
                        className="w-full border border-slate-300 rounded-lg p-2 text-xs bg-white font-bold"
                      >
                        <option value="EGS">كود مصري موحد (EGS - EG-...)</option>
                        <option value="GS1">باركود عالمي دولي (GS1)</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-slate-700 mb-1">كود الصنف الضريبي (EGS / GS1)</label>
                      <input
                        type="text"
                        value={formData.egs_code || ''}
                        onChange={e => setFormData({ ...formData, egs_code: e.target.value })}
                        placeholder="مثال: EG-113327101-1001"
                        className="w-full border border-slate-300 rounded-lg p-2 text-xs font-mono"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-slate-700 mb-1">وحدة القياس الضريبية (ETA Code)</label>
                      <select
                        value={formData.eta_unit_code || ''}
                        onChange={e => setFormData({ ...formData, eta_unit_code: e.target.value })}
                        className="w-full border border-slate-300 rounded-lg p-2 text-xs bg-white font-mono"
                      >
                        <option value="">تلقائي من وحدة الصنف</option>
                        <option value="KGM">KGM - كيلوجرام</option>
                        <option value="EA">EA - قطعة / عدد</option>
                        <option value="BOX">BOX - كرتونة / علبة</option>
                        <option value="LTR">LTR - لتر</option>
                        <option value="TNE">TNE - طن متري</option>
                        <option value="GRM">GRM - جرام</option>
                        <option value="MTR">MTR - متر</option>
                      </select>
                    </div>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                    <div>
                        <label className="block text-xs font-bold mb-1 text-slate-700">حد الطلب (الأدنى)</label>
                        <input type="number" min="0" value={formData.min_stock_level} onChange={e => setFormData({...formData, min_stock_level: parseFloat(e.target.value) || 0})} className="w-full border rounded-lg p-2 text-sm" placeholder="0" />
                    </div>
                    <div>
                        <label className="block text-xs font-bold mb-1 text-slate-700">الحد الأقصى للمخزون</label>
                        <input type="number" min="0" value={formData.max_stock_level} onChange={e => setFormData({...formData, max_stock_level: parseFloat(e.target.value) || 0})} className="w-full border rounded-lg p-2 text-sm" placeholder="طاقة الرف القصوى" />
                    </div>
                </div>
                <div>
                    <label className="block text-sm font-bold mb-1 text-slate-700">تاريخ الصلاحية</label>
                    <input type="date" value={formData.expiry_date} onChange={e => setFormData({...formData, expiry_date: e.target.value})} className="w-full border rounded-lg p-2" />
                </div>                  
                <div className="flex items-center gap-2 pt-6">
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input type="checkbox" checked={formData.requires_serial} onChange={e => setFormData({...formData, requires_serial: e.target.checked})} className="sr-only peer" />
                      <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-emerald-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-600"></div>
                      <span className="mr-3 text-sm font-bold text-slate-700">يتطلب رقم تسلسلي (Serial Number)</span>
                    </label>
                </div>
              <div>
                <div className="flex items-end gap-2">
                    <div className="flex-1">
                        <SearchableSelect
                            label="التصنيف"
                            options={categories.map(cat => ({ 
                                id: cat.id, 
                                name: cat.name + ((cat as any).description ? ` (${(cat as any).description})` : '')
                            }))}
                            value={formData.category_id || ''}
                            placeholder="ابحث عن تصنيف..."
                            onChange={value => {
                                const selectedCat = categories.find(c => c.id === value);
                                let newInvAcc = formData.inventory_account_id;
                                const rawMaterialAcc = getSystemAccount('INVENTORY_RAW_MATERIALS')?.id || settings?.account_mappings?.INVENTORY_RAW_MATERIALS || '00bc8443-0ace-40ba-82c1-ce97f6a02e15';
                                const finishedGoodsAcc = getSystemAccount('INVENTORY_FINISHED_GOODS')?.id || settings?.account_mappings?.INVENTORY_FINISHED_GOODS || '90685bba-b765-4fe4-96a5-b3963a4ec085';
                                if (selectedCat) {
                                    if (selectedCat.default_inventory_account_id) {
                                        newInvAcc = selectedCat.default_inventory_account_id;
                                    } else if (['التورتات الغربية الفاخرة', 'الجاتوهات والقطع', 'الحلويات الشرقية', 'الشيكولاتة الفاخرة والهدايا', 'الآيس كريم والمثلجات'].includes(selectedCat.name)) {
                                        newInvAcc = finishedGoodsAcc;
                                    } else if (['خامات الحلويات الأولية', 'خامات التعبئة والتغليف'].includes(selectedCat.name)) {
                                        newInvAcc = rawMaterialAcc;
                                    }
                                }
                                setFormData(prev => ({
                                    ...prev,
                                    category_id: value,
                                    inventory_account_id: newInvAcc
                                }));
                            }}
                        />
                    </div>
                    {formData.category_id && categories.find(c => c.id === formData.category_id) && (categories.find(c => c.id === formData.category_id) as any).image_url && (
                        <img 
                            src={(categories.find(c => c.id === formData.category_id) as any).image_url} 
                            alt="Category" 
                            className="w-10 h-10 rounded-lg border object-cover bg-slate-50"
                        />
                    )}
                    <button type="button" onClick={handleAddCategory} className="bg-slate-100 text-slate-600 p-2 rounded-lg hover:bg-slate-200" title="إضافة تصنيف جديد"><Plus size={20} /></button>
                    {formData.category_id && (
                        <>
                            <button type="button" onClick={handleEditCategory} className="bg-blue-50 text-blue-600 p-2 rounded-lg hover:bg-blue-100" title="تعديل التصنيف"><Edit size={20} /></button>
                            <button type="button" onClick={handleDeleteCategory} className="bg-red-50 text-red-600 p-2 rounded-lg hover:bg-red-100" title="حذف التصنيف"><Trash2 size={20} /></button>
                        </>
                    )}
                </div>
              </div>
              <div>
                <SearchableSelect
                    label="المورد المفضل (المشتريات وإعادة الطلب)"
                    options={(suppliers || []).map((s: any) => ({ 
                        id: s.id, 
                        name: s.name + (s.contact_person ? ` (${s.contact_person})` : '') + (s.phone ? ` - ${s.phone}` : '')
                    }))}
                    value={formData.supplier_id || ''}
                    onChange={value => setFormData({...formData, supplier_id: value || null})}
                    placeholder="اختر المورد المعتمد / المفضل للصنف..."
                />
                {!hasSupplierColumn && (
                    <span className="text-[11px] text-amber-600 block mt-1">
                      ⚠️ يتطلب تشغيل استعلام SQL في Supabase لتفعيل عمود المورد المفضل في قاعدة البيانات.
                    </span>
                )}
              </div>
                  <div className="col-span-2">
                    <label className="block text-sm font-bold mb-1 text-slate-700">الوصف (Description)</label>
                    <textarea value={formData.description} onChange={e => setFormData({...formData, description: e.target.value})} className="w-full border rounded-lg p-2 focus:ring-2 focus:ring-emerald-500 outline-none" rows={2} placeholder="أدخل تفاصيل إضافية عن الصنف..." />
                  </div>
              </div>
            </div>
          </div>

          {/* قسم العروض والخصومات */}
          <div className="bg-yellow-50 p-4 rounded-xl border border-yellow-100">
            <h4 className="font-bold text-yellow-800 mb-3 flex items-center gap-2">
              <Percent size={16}/> العروض والخصومات
            </h4>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1">سعر العرض</label>
                <input type="number" min="0" value={formData.offer_price} onChange={e => setFormData({...formData, offer_price: parseFloat(e.target.value)})} className="w-full border border-yellow-200 rounded-lg p-2 text-sm bg-white" placeholder="0" />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1">تاريخ البداية</label>
                <input type="date" value={formData.offer_start_date} onChange={e => setFormData({...formData, offer_start_date: e.target.value})} className="w-full border border-yellow-200 rounded-lg p-2 text-sm bg-white" />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1">تاريخ النهاية</label>
                <input type="date" value={formData.offer_end_date} onChange={e => setFormData({...formData, offer_end_date: e.target.value})} className="w-full border border-yellow-200 rounded-lg p-2 text-sm bg-white" />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1">الحد الأقصى (للعميل)</label>
                <input type="number" min="0" value={formData.offer_max_qty} onChange={e => setFormData({...formData, offer_max_qty: parseFloat(e.target.value)})} className="w-full border border-yellow-200 rounded-lg p-2 text-sm bg-white" placeholder="0 (بلا حد)" />
              </div>
            </div>
          </div>

          {/* ========== قسم إعدادات الهايبر ماركت ========== */}
          <div className="bg-gradient-to-br from-sky-50 to-indigo-50 p-4 rounded-xl border border-sky-200">
            <h4 className="font-bold text-sky-800 mb-4 flex items-center gap-2 text-sm">
              <Scale size={16} className="text-sky-600" />
              إعدادات الهايبر ماركت والسوبر ماركت
            </h4>

            {/* الصف الأول: العلامة التجارية + بلد المنشأ + موقع الرف */}
            <div className="grid grid-cols-3 gap-3 mb-3">
              <div>
                <label className="block text-xs font-bold text-sky-700 mb-1">العلامة التجارية (Brand)</label>
                <input
                  type="text"
                  value={formData.brand}
                  onChange={e => setFormData({...formData, brand: e.target.value})}
                  className="w-full border border-sky-200 rounded-lg p-2 text-sm bg-white focus:ring-2 focus:ring-sky-400 outline-none"
                  placeholder="مثال: Nestlé، Unilever"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-sky-700 mb-1">بلد المنشأ</label>
                <select
                  value={formData.country_of_origin}
                  onChange={e => setFormData({...formData, country_of_origin: e.target.value})}
                  className="w-full border border-sky-200 rounded-lg p-2 text-sm bg-white focus:ring-2 focus:ring-sky-400 outline-none"
                >
                  <option value="">-- اختر --</option>
                  <option value="SA">🇸🇦 المملكة العربية السعودية</option>
                  <option value="EG">🇪🇬 مصر</option>
                  <option value="AE">🇦🇪 الإمارات</option>
                  <option value="TR">🇹🇷 تركيا</option>
                  <option value="CN">🇨🇳 الصين</option>
                  <option value="IN">🇮🇳 الهند</option>
                  <option value="US">🇺🇸 الولايات المتحدة</option>
                  <option value="DE">🇩🇪 ألمانيا</option>
                  <option value="FR">🇫🇷 فرنسا</option>
                  <option value="IT">🇮🇹 إيطاليا</option>
                  <option value="GB">🇬🇧 المملكة المتحدة</option>
                  <option value="BR">🇧🇷 البرازيل</option>
                  <option value="NL">🇳🇱 هولندا</option>
                  <option value="OTHER">🌍 دولة أخرى</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-sky-700 mb-1">موقع الرف (Aisle-Shelf)</label>
                <input
                  type="text"
                  value={formData.shelf_location}
                  onChange={e => setFormData({...formData, shelf_location: e.target.value})}
                  className="w-full border border-sky-200 rounded-lg p-2 text-sm bg-white font-mono focus:ring-2 focus:ring-sky-400 outline-none"
                  placeholder="مثال: A-03-R2"
                />
              </div>
            </div>

            {/* الصف الثاني: الباركود الثاني + نسبة الضريبة الخاصة */}
            <div className="grid grid-cols-2 gap-3 mb-3">
              <div>
                <label className="block text-xs font-bold text-sky-700 mb-1">باركود ثانٍ (EAN المصنع / Supplier Barcode)</label>
                <input
                  type="text"
                  value={formData.barcode2}
                  onChange={e => setFormData({...formData, barcode2: e.target.value})}
                  onKeyDown={e => { if (e.key === 'Enter') e.preventDefault(); }}
                  className="w-full border border-sky-200 rounded-lg p-2 text-sm bg-white font-mono focus:ring-2 focus:ring-sky-400 outline-none"
                  placeholder="Scan Supplier EAN..."
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-sky-700 mb-1">نسبة ضريبة خاصة % (تتجاوز الإعداد العام — اتركها 0 لاستخدام الإعداد العام)</label>
                <input
                  type="number"
                  min="0"
                  max="100"
                  step="0.01"
                  value={formData.tax_rate_override}
                  onChange={e => setFormData({...formData, tax_rate_override: parseFloat(e.target.value) || 0})}
                  className="w-full border border-sky-200 rounded-lg p-2 text-sm bg-white focus:ring-2 focus:ring-sky-400 outline-none"
                  placeholder="0 = استخدام الإعداد العام"
                />
              </div>
            </div>

            {/* الصف الثالث: إعدادات الميزان */}
            <div className="bg-white rounded-xl border border-sky-100 p-3">
              <div className="flex items-center gap-3 mb-3">
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.is_scale_item}
                    onChange={e => setFormData({...formData, is_scale_item: e.target.checked})}
                    className="sr-only peer"
                  />
                  <div className="w-10 h-5 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-sky-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-sky-600"></div>
                  <span className="mr-2 text-xs font-bold text-sky-800">⚖️ صنف يُوزن بالميزان (Scale Item)</span>
                </label>
              </div>
              {formData.is_scale_item && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-sky-700 mb-1">رقم PLU للميزان</label>
                    <input
                      type="number"
                      min="1"
                      max="99999"
                      value={formData.plu_number || ''}
                      onChange={e => setFormData({...formData, plu_number: parseInt(e.target.value) || 0})}
                      className="w-full border border-sky-300 rounded-lg p-2 text-sm bg-sky-50 font-mono focus:ring-2 focus:ring-sky-500 outline-none font-bold"
                      placeholder="مثال: 125"
                    />
                    <p className="text-[10px] text-sky-500 mt-1">الكود ذو 5 أرقام في باركود الميزان</p>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-sky-700 mb-1">بادئة الباركود (Scale Prefix)</label>
                    <select
                      value={formData.scale_prefix}
                      onChange={e => setFormData({...formData, scale_prefix: e.target.value})}
                      className="w-full border border-sky-300 rounded-lg p-2 text-sm bg-sky-50 focus:ring-2 focus:ring-sky-500 outline-none font-mono font-bold"
                    >
                      <option value="20">20 — وزن مباشر عام</option>
                      <option value="21">21 — وزن + سعر</option>
                      <option value="22">22 — CAS / Dibal Standard</option>
                      <option value="23">23 — Toledo Standard</option>
                      <option value="24">24 — Rongta Standard</option>
                      <option value="25">25 — وزن + تاريخ صلاحية</option>
                      <option value="29">29 — وزن + رقم دفعة</option>
                      <option value="99">99 — مخصص / Custom</option>
                    </select>
                    <p className="text-[10px] text-sky-500 mt-1">
                      باركود الميزان سيكون: <span className="font-mono font-bold text-sky-700">{formData.scale_prefix}{String(formData.plu_number || 0).padStart(5, '0')}WWWWWX</span>
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* الصف الرابع: تقييد العمر */}
            <div className="mt-3 flex items-center gap-3">
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={formData.age_restricted}
                  onChange={e => setFormData({...formData, age_restricted: e.target.checked})}
                  className="sr-only peer"
                />
                <div className="w-10 h-5 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-red-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-red-500"></div>
                <span className="mr-2 text-xs font-bold text-red-700">🔞 يتطلب التحقق من السن (Age Restricted +18)</span>
              </label>
              {formData.age_restricted && (
                <span className="text-xs bg-red-100 text-red-700 px-2 py-1 rounded-lg font-bold border border-red-200 animate-pulse">
                  ⚠️ سيظهر تنبيه للكاشير عند بيع هذا الصنف
                </span>
              )}
            </div>
          </div>

          {/* Modifiers for Restaurant Items */}
          {formData.product_type === 'MANUFACTURED' && (
            <div className="bg-indigo-50 p-4 rounded-xl border border-indigo-100">
              <h4 className="font-bold text-indigo-800 mb-3 flex items-center gap-2">
                <UtensilsCrossed size={16}/> الإضافات المتاحة (Modifiers)
              </h4>
              <div className="space-y-2">
                {formData.available_modifiers.map((mod, index) => (
                  <div key={index} className="grid grid-cols-12 gap-2 items-center">
                    <div className="col-span-5">
                      <label className="text-xs font-bold text-slate-600">اسم الإضافة</label>
                      <input type="text" value={mod.name} onChange={e => { const newMods = [...formData.available_modifiers]; newMods[index].name = e.target.value; setFormData({...formData, available_modifiers: newMods}); }} className="w-full border rounded-lg p-1.5 text-sm" />
                    </div>
                    <div className="col-span-3">
                      <label className="text-xs font-bold text-slate-600">السعر</label>
                      <input type="number" value={mod.unit_price} onChange={e => { const newMods = [...formData.available_modifiers]; newMods[index].unit_price = parseFloat(e.target.value); setFormData({...formData, available_modifiers: newMods}); }} className="w-full border rounded-lg p-1.5 text-sm" />
                    </div>
                    <div className="col-span-3">
                      <label className="text-xs font-bold text-slate-600">التكلفة</label>
                      <input type="number" value={mod.cost} onChange={e => { const newMods = [...formData.available_modifiers]; newMods[index].cost = parseFloat(e.target.value); setFormData({...formData, available_modifiers: newMods}); }} className="w-full border rounded-lg p-1.5 text-sm" />
                    </div>
                    <div className="col-span-1 self-end">
                      <button type="button" onClick={() => setFormData({...formData, available_modifiers: formData.available_modifiers.filter((_, i) => i !== index)})} className="text-red-500 hover:bg-red-100 p-1.5 rounded-lg">
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
              <button type="button" onClick={() => setFormData({...formData, available_modifiers: [...formData.available_modifiers, { name: '', unit_price: 0, cost: 0 }]})} className="mt-3 text-sm font-bold text-indigo-600 hover:text-indigo-800 flex items-center gap-1">
                <PlusCircle size={16} /> إضافة خيار جديد
              </button>
            </div>
          )}

          {/* قسم تكاليف التصنيع (للأصناف المصنعة فقط) */}
          {formData.product_type === 'MANUFACTURED' && (
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
                  <h4 className="font-bold text-slate-800 mb-3 text-sm">تكاليف التصنيع الإضافية (للوحدة الواحدة)</h4>
                  <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-bold text-slate-600 mb-1">تكلفة عمالة مباشرة</label>
                        <input 
                          type="number" 
                          min="0" 
                          step="0.01" 
                          value={formData.labor_cost || 0} 
                          onChange={e => setFormData({...formData, labor_cost: parseFloat(e.target.value) || 0})} 
                          className="w-full border rounded-lg p-2 text-sm" 
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-slate-600 mb-1">مصاريف غير مباشرة</label>
                        <div className="flex gap-2">
                          <input 
                            type="number" 
                            min="0" 
                            step="0.01" 
                            value={formData.overhead_cost || 0} 
                            onChange={e => setFormData({...formData, overhead_cost: parseFloat(e.target.value) || 0})} 
                            className="w-full border rounded-lg p-2 text-sm" 
                          />
                          <label className="flex items-center gap-1 cursor-pointer bg-slate-100 px-2 rounded border border-slate-200 text-xs font-bold">
                            <input type="checkbox" checked={formData.is_overhead_percentage} onChange={e => setFormData({...formData, is_overhead_percentage: e.target.checked})} className="rounded text-blue-600" />
                            <span>%</span>
                          </label>
                        </div>
                      </div>
                  </div>
                  
                  {/* 📊 ملخص التكلفة التقديرية (BOM Breakdown) */}
                  <div className="mt-4 pt-4 border-t border-slate-200">
                      <h5 className="font-bold text-slate-700 mb-2 text-sm">ملخص التكلفة التقديرية:</h5>
                      <div className="space-y-1 text-sm text-slate-600 bg-white p-3 rounded-lg border border-slate-100 shadow-sm">
                          <div className="flex justify-between">
                              <span>تكلفة المكونات (من الوصفة):</span>
                              <span className="font-mono font-bold text-indigo-600">{(Number(recipeCost) || 0).toFixed(2)}</span>
                          </div>
                          <div className="flex justify-between">
                              <span>تكلفة العمالة والمصاريف:</span>
                              <span className="font-mono font-bold">{Math.max(0, (Number(formData.purchase_price) || 0) - (Number(recipeCost) || 0)).toFixed(2)}</span>
                          </div>
                          <div className="flex justify-between font-black text-slate-800 border-t border-slate-200 pt-2 mt-2">
                              <span>إجمالي التكلفة النهائية:</span>
                              <span className="font-mono text-lg text-emerald-600">{(Number(formData.purchase_price) || 0).toFixed(2)}</span>
                          </div>
                      </div>
                  </div>
              </div>
          )}

          {/* حقل الرصيد الافتتاحي (يظهر للأصناف المخزنية والمواد الخام والتصنيعية) */}
          {(formData.product_type === 'STOCK' || formData.product_type === 'RAW_MATERIAL' || formData.product_type === 'MANUFACTURED') && (
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-3">
                  <h4 className="font-bold text-slate-800 flex items-center gap-2 text-sm">
                      <PackageOpen className="text-emerald-600" size={18} /> الرصيد الافتتاحي الأولي
                  </h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div>
                          <label className="block text-xs font-bold mb-1 text-slate-700">الكمية الافتتاحية</label>
                          <input 
                              type="number" 
                              min="0" 
                              value={formData.opening_stock || 0} 
                              onChange={e => setFormData({...formData, opening_stock: Math.max(0, parseFloat(e.target.value) || 0)})} 
                              className="w-full border rounded-lg p-2 focus:ring-2 focus:ring-emerald-500 outline-none text-left font-bold text-emerald-700 bg-white" 
                              placeholder="0" 
                          />
                      </div>
                      <div>
                          <label className="block text-xs font-bold mb-1 text-slate-700">المستودع المستهدف <span className="text-red-500">*</span></label>
                          <select 
                              className="w-full border rounded-lg p-2 focus:ring-2 focus:ring-emerald-500 outline-none bg-white text-slate-700"
                              value={formData.opening_warehouse_id || warehouses[0]?.id || ''}
                              onChange={e => setFormData({...formData, opening_warehouse_id: e.target.value})}
                          >
                              {warehouses.map(w => (
                                  <option key={w.id} value={w.id}>{w.name}</option>
                              ))}
                          </select>
                      </div>
                  </div>
                  {formData.opening_stock > 0 && (
                      <div className="bg-emerald-50 border border-emerald-200 p-2.5 rounded-lg text-xs text-emerald-800 space-y-1">
                          <div className="flex justify-between font-bold">
                              <span>قيمة القيد الافتتاحي التقديرية:</span>
                              <span>{(formData.opening_stock * (formData.purchase_price || 0)).toLocaleString()} {getCurrencySymbol(settings?.currency)}</span>
                          </div>
                          <p className="text-[11px] text-emerald-600">
                              سيتم إنشاء قيد افتتاحي متزن (من حـ/ المخزون إلى حـ/ الأرصدة الافتتاحية) وتسجيل الرصيد بالمستودع المحدد تلقائياً.
                          </p>
                          {formData.purchase_price <= 0 && (
                              <p className="text-amber-700 font-bold flex items-center gap-1 text-[11px]">
                                  <AlertTriangle size={12} /> تنبيه: سعر التكلفة صفر! يفضل تحديد سعر التكلفة لتقييم القيد الافتتاحي بشكل صحيح.
                              </p>
                          )}
                      </div>
                  )}
              </div>
          )}

          {/* إذا كان الصنف قيد التعديل، عرض سجل الرصيد الافتتاحي إن وجد */}
          {editingId && (formData.product_type === 'STOCK' || formData.product_type === 'RAW_MATERIAL' || formData.product_type === 'MANUFACTURED') && (
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-2">
                  <h4 className="font-bold text-slate-700 text-xs flex items-center gap-2">
                      <PackageOpen className="text-blue-600" size={16} /> سجل الرصيد الافتتاحي المسجل للصنف:
                  </h4>
                  {existingOpenings.length > 0 ? (
                      <div className="space-y-1 text-xs">
                          {existingOpenings.map((op: any) => (
                              <div key={op.id} className="flex justify-between items-center bg-white p-2.5 rounded-lg border border-slate-200 text-slate-700">
                                  <span>المستودع: <strong>{op.warehouses?.name || 'غير محدد'}</strong></span>
                                  <span>الكمية: <strong className="text-blue-600">{op.quantity}</strong></span>
                                  <span>التكلفة: <strong>{op.cost}</strong></span>
                                  <span>الإجمالي: <strong className="text-emerald-600">{(op.quantity * (op.cost || 0)).toLocaleString()} {getCurrencySymbol(settings?.currency)}</strong></span>
                              </div>
                          ))}
                      </div>
                  ) : (
                      <p className="text-xs text-slate-500 italic">لم يتم تسجيل رصيد افتتاحي لهذا الصنف عند إنشائه.</p>
                  )}
              </div>
          )}

          <div className="grid grid-cols-2 gap-4 border-t pt-4">
            <div>
                <label className="block text-sm font-bold mb-1 text-slate-700">سعر التكلفة (تقديري)</label>
                <input type="number" step="0.0001" value={formData.purchase_price ?? 0} onChange={e => setFormData({...formData, purchase_price: parseFloat(e.target.value) || 0})} className="w-full border rounded-lg p-2" />
            </div>
            <div>
                <label className="block text-sm font-bold mb-1 text-slate-700">سعر البيع (القطاعي)</label>
                <input type="number" step="0.0001" value={formData.sales_price ?? 0} onChange={e => setFormData({...formData, sales_price: parseFloat(e.target.value) || 0})} className="w-full border rounded-lg p-2" />
            </div>
          </div>

          {/* أسعار الفئات والحد الأدنى للبيع */}
          <div className="bg-slate-50 border border-slate-200 p-3 rounded-xl space-y-3">
            <span className="text-xs font-bold text-slate-700 block mb-1">فئات الأسعار والحدود المسموحة (Tiers & Limits):</span>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1">الحد الأدنى لسعر البيع</label>
                <input 
                  type="number" 
                  step="0.0001" 
                  min="0"
                  value={formData.min_sales_price ?? 0} 
                  onChange={e => setFormData({...formData, min_sales_price: parseFloat(e.target.value) || 0})} 
                  className="w-full border border-rose-200 bg-white rounded-lg p-2 text-sm focus:ring-2 focus:ring-rose-400 outline-none" 
                  placeholder="0 (بلا حد)"
                />
                <span className="text-[10px] text-slate-400 block mt-0.5">يمنع الكاشير والفاتورة من البيع بأقل منه</span>
              </div>
              <div>
                <label className="block text-xs font-bold text-blue-700 mb-1">سعر الجملة</label>
                <input 
                  type="number" 
                  step="0.0001" 
                  min="0"
                  value={formData.wholesale_price ?? 0} 
                  onChange={e => setFormData({...formData, wholesale_price: parseFloat(e.target.value) || 0})} 
                  className="w-full border border-blue-200 bg-white rounded-lg p-2 text-sm focus:ring-2 focus:ring-blue-400 outline-none" 
                  placeholder="0.00"
                />
                <span className="text-[10px] text-slate-400 block mt-0.5">لفواتير وكاشير تجار الجملة</span>
              </div>
              <div>
                <label className="block text-xs font-bold text-sky-700 mb-1">سعر نصف الجملة</label>
                <input 
                  type="number" 
                  step="0.0001" 
                  min="0"
                  value={formData.half_wholesale_price ?? 0} 
                  onChange={e => setFormData({...formData, half_wholesale_price: parseFloat(e.target.value) || 0})} 
                  className="w-full border border-sky-200 bg-white rounded-lg p-2 text-sm focus:ring-2 focus:ring-sky-400 outline-none" 
                  placeholder="0.00"
                />
                <span className="text-[10px] text-slate-400 block mt-0.5">للكميات المتوسطة والعملاء المميزين</span>
              </div>
            </div>
          </div>

          {formData.sales_price < formData.purchase_price && (
              <div className="bg-red-50 text-red-600 p-3 rounded-lg text-sm font-bold flex items-center gap-2 mt-2">
                  <AlertTriangle size={16} />
                  تنبيه: سعر البيع أقل من سعر التكلفة!
              </div>
          )}

          {formData.min_sales_price > 0 && formData.sales_price < formData.min_sales_price && (
              <div className="bg-amber-50 text-amber-700 border border-amber-200 p-3 rounded-lg text-sm font-bold flex items-center gap-2 mt-2">
                  <AlertTriangle size={16} />
                  تنبيه: سعر البيع المحدد أقل من الحد الأدنى للبيع ({formData.min_sales_price})!
              </div>
          )}

          {formData.sales_price > 0 && formData.purchase_price > 0 && formData.sales_price >= formData.purchase_price && (
            <div className="flex items-center justify-between bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs px-3 py-2 rounded-lg mt-2 font-medium flex-wrap gap-2">
              <span>هامش الربح (Margin): <strong className="font-mono text-emerald-700 font-bold">{(((formData.sales_price - formData.purchase_price) / formData.sales_price) * 100).toFixed(1)}%</strong></span>
              <span>نسبة الزيادة (Markup): <strong className="font-mono text-emerald-700 font-bold">{(((formData.sales_price - formData.purchase_price) / formData.purchase_price) * 100).toFixed(1)}%</strong></span>
              <span>ربح القطعة: <strong className="font-mono text-emerald-700 font-bold">{(formData.sales_price - formData.purchase_price).toFixed(2)} {getCurrencySymbol(settings?.currency)}</strong></span>
            </div>
          )}

          {/* التوجيه المحاسبي */}
          <div className="bg-blue-50 p-4 rounded-xl border border-blue-100 mt-4">
            <h4 className="font-bold text-blue-800 mb-3 flex items-center gap-2">
              <AlertTriangle size={16}/> التوجيه المحاسبي (إلزامي)
            </h4>
            
            <div className="space-y-3">
              {(formData.product_type === 'STOCK' || formData.product_type === 'MANUFACTURED' || formData.product_type === 'RAW_MATERIAL') && (
                <>
                  <div>
                    <SearchableSelect
                      label="حساب المخزون (أصول)"
                      options={accounts.assets.map(a => ({ id: a.id, name: a.name, code: a.code }))}
                      required 
                      value={formData.inventory_account_id} 
                      onChange={value => setFormData({...formData, inventory_account_id: value})}
                      placeholder="-- اختر حساب المخزون --"
                      className="w-full"
                    />
                  </div>

                  <div>
                    <SearchableSelect
                      label="حساب تكلفة البضاعة (مصروفات)"
                      options={accounts.expenses.map(a => ({ id: a.id, name: a.name, code: a.code }))}
                      required 
                      value={formData.cogs_account_id} 
                      onChange={value => setFormData({...formData, cogs_account_id: value})}
                      placeholder="-- اختر حساب التكلفة --"
                      className="w-full"
                    />
                  </div>
                </>
              )}

              <div>
                <SearchableSelect
                  label="حساب المبيعات (إيرادات)"
                  options={accounts.revenue.map(a => ({ id: a.id, name: a.name, code: a.code }))}
                  required 
                  value={formData.sales_account_id} 
                  onChange={value => setFormData({...formData, sales_account_id: value})}
                  placeholder="-- اختر حساب الإيراد --"
                  className="w-full"
                />
              </div>
            </div>
          </div>

          <button type="submit" disabled={uploading} className="w-full bg-emerald-600 text-white py-3 rounded-lg font-bold hover:bg-emerald-700 mt-4 disabled:opacity-50 shadow-md transition-all">
            {uploading ? 'جاري رفع الصورة...' : 'حفظ واعتماد الصنف'}
          </button>
        </form>
      </div>
    </div>
  );
};
export default ProductFormModal;

import React from 'react';
import {
  AlertTriangle,
  Barcode,
  CheckSquare,
  ChevronLeft,
  ChevronRight,
  Edit,
  Image as ImageIcon,
  Layers,
  Lock,
  Percent,
  PlusCircle,
  RefreshCw,
  Square,
  Trash2,
  UtensilsCrossed,
} from 'lucide-react';
import type { Item } from '../ProductManager';
import { isOfferActive, isOfferExpired } from '../utils/productAccountSyncUtils';

export interface ProductsTableProps {
  items: Item[];
  selectedIds: Set<string>;
  categories: any[];
  suppliers?: any[];
  warehouses: any[];
  warehouseFilter: string;
  routingsMap: Map<string, { routingId: string; routingName: string; stepsCount: number }>;
  reservedStock: Record<string, number>;
  page: number;
  totalPages: number;
  totalCount: number;
  loading: boolean;
  onSelectAll: () => void;
  onToggleSelection: (id: string) => void;
  onNavigateToRouting: (productId: string) => void;
  onPrintOfferBarcode: (item: Item) => void;
  onRenewOffer: (item: Item) => void;
  onOpenRecipeTarget: (target: { id: string; name: string }) => void;
  onOpenModifierTarget: (target: { id: string; name: string }) => void;
  onPrintBarcode: (item: Item) => void;
  onEditItem: (item: Item) => void;
  onDeleteItem: (id: string) => void;
  onPageChange: (updater: (prev: number) => number) => void;
}

/**
 * Renders the paginated products table, inline routing/offer badges, row actions, and pagination controls.
 */
export const ProductsTable: React.FC<ProductsTableProps> = ({
  items,
  selectedIds,
  categories,
  suppliers,
  warehouses,
  warehouseFilter,
  routingsMap,
  reservedStock,
  page,
  totalPages,
  totalCount,
  loading,
  onSelectAll,
  onToggleSelection,
  onNavigateToRouting,
  onPrintOfferBarcode,
  onRenewOffer,
  onOpenRecipeTarget,
  onOpenModifierTarget,
  onPrintBarcode,
  onEditItem,
  onDeleteItem,
  onPageChange,
}) => {
  const renderRoutingBadge = (item: Item, missingTitle: string) => {
    const routingInfo = routingsMap.get(item.id);
    if (routingInfo) {
      return (
        <button
          onClick={() => onNavigateToRouting(item.id)}
          title={`المسار: ${routingInfo.routingName} (${routingInfo.stepsCount} مراحل) - انقر لعرض المسار`}
          className={`mt-1.5 flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded border transition-all ${
            routingInfo.stepsCount > 0
              ? 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100'
              : 'bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100'
          }`}
        >
          <Layers size={11} className={routingInfo.stepsCount > 0 ? 'text-emerald-600' : 'text-amber-600'} />
          <span>{routingInfo.stepsCount > 0 ? `مسار ومراحل (${routingInfo.stepsCount})` : 'مسار بدون مراحل'}</span>
        </button>
      );
    }

    return (
      <button
        onClick={() => onNavigateToRouting(item.id)}
        title={missingTitle}
        className="mt-1.5 flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded border bg-rose-50 text-rose-700 border-rose-200 hover:bg-rose-100 transition-all"
      >
        <AlertTriangle size={11} className="text-rose-600" />
        <span>بدون مسار تصنيعي</span>
        <PlusCircle size={10} className="text-rose-500" />
      </button>
    );
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
      <table className="w-full text-right">
        <thead className="bg-slate-50 text-slate-600 font-bold text-sm border-b">
          <tr>
            <th className="p-4 w-10">
              <button onClick={onSelectAll} className="text-slate-400 hover:text-blue-600">
                {selectedIds.size === items.length && items.length > 0 ? <CheckSquare size={20} /> : <Square size={20} />}
              </button>
            </th>
            <th className="p-4 w-16">الصورة</th>
            <th className="p-4">اسم الصنف</th>
            <th className="p-4">التصنيف</th>
            <th className="p-4">النوع</th>
            <th className={`p-4 text-center ${warehouseFilter !== 'all' ? 'text-blue-700 bg-blue-50/60 font-black' : ''}`}>
              {warehouseFilter === 'all'
                ? 'الرصيد الحالي'
                : `رصيد (${warehouses.find((w) => w.id === warehouseFilter)?.name || 'المستودع'})`}
            </th>
            <th className="p-4 text-center">المحجوز</th>
            <th className="p-4 text-center">الصلاحية</th>
            <th className="p-4">متوسط التكلفة</th>
            <th className="p-4">سعر البيع</th>
            <th className="p-4 text-center">إجراءات</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {items.map((item) => {
            const effectiveType = item.product_type || (item as any).item_type || 'STOCK';
            return (
              <tr key={item.id} className="hover:bg-slate-50">
                <td className="p-4">
                  <button
                    onClick={() => onToggleSelection(item.id)}
                    className={selectedIds.has(item.id) ? 'text-blue-600' : 'text-slate-300'}
                  >
                    {selectedIds.has(item.id) ? <CheckSquare size={20} /> : <Square size={20} />}
                  </button>
                </td>
                <td className="p-4">
                  {item.image_url ? (
                    <img src={item.image_url} alt={item.name} className="w-10 h-10 object-cover rounded-lg border border-slate-200" />
                  ) : (
                    <div className="w-10 h-10 bg-slate-100 rounded-lg flex items-center justify-center text-slate-400">
                      <ImageIcon size={16} />
                    </div>
                  )}
                </td>
                <td className="p-4 font-bold text-slate-800">
                  <div className="flex items-center gap-2">
                    <span>{item.name}</span>
                    {isOfferActive(item) && (
                      <span className="inline-flex items-center gap-1 bg-red-100 text-red-600 text-[10px] px-2 py-0.5 rounded-full animate-pulse">
                        <Percent size={10} /> عرض خاص
                      </span>
                    )}
                  </div>
                  <div className="flex items-center flex-wrap gap-1.5 mt-1">
                    {item.sku ? (
                      <span className="inline-flex items-center gap-1 text-[11px] font-mono bg-indigo-50 text-indigo-700 font-bold px-2 py-0.5 rounded border border-indigo-100">
                        <span className="text-indigo-400 font-sans text-[10px]">كود:</span> {item.sku}
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-[10px] text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200 font-medium">
                        بدون كود SKU
                      </span>
                    )}
                    {item.barcode && (
                      <span className="inline-flex items-center gap-1 text-[11px] font-mono text-slate-600 bg-slate-50 px-1.5 py-0.5 rounded border border-slate-200">
                        <Barcode size={12} className="text-slate-400" /> {item.barcode}
                      </span>
                    )}
                  </div>
                </td>
                <td className="p-4 text-sm text-slate-500">
                  {item.category_id && (
                    <span className="bg-slate-100 text-slate-600 px-2 py-1 rounded text-xs font-medium">
                      {categories.find((c) => c.id === item.category_id)?.name || '-'}
                    </span>
                  )}
                  {(item as any).supplier_id && (
                    <span className="block mt-1 text-[11px] text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded border border-blue-100 font-medium">
                      🏢 {suppliers?.find((s: Record<string, any>) => s.id === (item as any).supplier_id)?.name || 'مورد محدد'}
                    </span>
                  )}
                </td>
                <td className="p-4">
                  {effectiveType === 'RAW_MATERIAL' ? (
                    <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-800 border border-amber-200">
                      🥩 مادة خام
                    </span>
                  ) : effectiveType === 'MANUFACTURED' ? (
                    <div>
                      <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-purple-100 text-purple-700 border border-purple-200">
                        🍲 منتج مصنع
                      </span>
                      {renderRoutingBadge(
                        item,
                        'هذا الصنف مصنع ولكن لم يتم إنشاء مسار إنتاج أو مراحل له بعد - انقر لإنشاء مسار'
                      )}
                    </div>
                  ) : effectiveType === 'INTERMEDIATE_PRODUCT' ? (
                    <div>
                      <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-indigo-100 text-indigo-700 border border-indigo-200">
                        🍰 منتج وسيط
                      </span>
                      {renderRoutingBadge(
                        item,
                        'هذا الصنف وسيط ولكن لم يتم إنشاء مسار إنتاج أو مراحل له بعد - انقر لإنشاء مسار'
                      )}
                    </div>
                  ) : effectiveType === 'SERVICE' ? (
                    <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-700 border border-emerald-200">
                      ⚙️ خدمي
                    </span>
                  ) : (
                    <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-blue-100 text-blue-700 border border-blue-200">
                      📦 مخزوني
                    </span>
                  )}
                </td>
                <td className="p-4 text-center font-bold text-slate-700">
                  {warehouseFilter === 'all' ? (
                    item.stock
                  ) : (
                    (() => {
                      let wStock = (item as any).warehouse_stock || (item as any).warehouseStock || {};
                      if (typeof wStock === 'string') {
                        try {
                          wStock = JSON.parse(wStock);
                        } catch {}
                      }
                      const qty = Number(wStock?.[warehouseFilter] || 0);
                      return (
                        <span
                          className={`inline-block px-2.5 py-1 rounded-lg font-mono font-black ${
                            qty > 0 ? 'bg-blue-50 text-blue-800 border border-blue-200' : 'text-slate-400'
                          }`}
                        >
                          {qty}
                        </span>
                      );
                    })()
                  )}
                </td>
                <td className="p-4 text-center font-bold text-amber-600">
                  {reservedStock[item.id] > 0 ? (
                    <span className="flex items-center justify-center gap-1 bg-amber-50 px-2 py-1 rounded-full text-xs border border-amber-100">
                      <Lock size={12} /> {reservedStock[item.id]}
                    </span>
                  ) : (
                    '-'
                  )}
                </td>
                <td className="p-4 text-center text-slate-600 font-mono text-xs">
                  {item.expiry_date || '-'}
                </td>
                <td className="p-4 text-slate-600 font-mono">
                  {item.weighted_average_cost
                    ? item.weighted_average_cost.toLocaleString()
                    : item.purchase_price?.toLocaleString()}
                  <span className="text-[10px] text-slate-400 block">
                    آخر شراء: {item.purchase_price?.toLocaleString()}
                  </span>
                </td>
                <td className="p-4 text-emerald-600 font-bold">
                  {isOfferActive(item) ? (
                    <div className="flex flex-col items-center">
                      <span className="text-red-500 font-black">{item.offer_price?.toLocaleString()}</span>
                      <span className="text-xs text-slate-400 line-through">{item.sales_price?.toLocaleString()}</span>
                      <span className="text-[10px] text-emerald-600 bg-emerald-50 px-1 rounded mt-0.5">عرض ساري</span>
                    </div>
                  ) : (
                    item.sales_price?.toLocaleString()
                  )}
                </td>
                <td className="p-4 flex justify-center gap-2 items-center">
                  {isOfferActive(item) && (
                    <button
                      onClick={() => onPrintOfferBarcode(item)}
                      className="p-2 text-purple-600 hover:bg-purple-50 rounded"
                      title="طباعة باركود العرض"
                    >
                      <Barcode size={18} />
                    </button>
                  )}
                  {isOfferExpired(item) && (
                    <button
                      onClick={() => onRenewOffer(item)}
                      className="p-2 text-amber-600 hover:bg-amber-50 rounded"
                      title="تجديد العرض المنتهي"
                    >
                      <RefreshCw size={18} />
                    </button>
                  )}
                  <button
                    onClick={() => onOpenRecipeTarget({ id: item.id, name: item.name })}
                    className="p-2 text-indigo-600 hover:bg-indigo-50 rounded"
                    title="إدارة المكونات (BOM)"
                  >
                    <UtensilsCrossed size={18} />
                  </button>
                  <button
                    onClick={() => onOpenModifierTarget({ id: item.id, name: item.name })}
                    className="p-2 text-teal-600 hover:bg-teal-50 rounded"
                    title="إدارة الإضافات (Modifiers)"
                  >
                    <Layers size={18} />
                  </button>
                  <button
                    onClick={() => onPrintBarcode(item)}
                    className="p-2 text-slate-500 hover:bg-slate-100 rounded"
                    title="طباعة باركود"
                  >
                    <Barcode size={18} />
                  </button>
                  <button onClick={() => onEditItem(item)} className="p-2 text-blue-500 hover:bg-blue-50 rounded">
                    <Edit size={18} />
                  </button>
                  <button onClick={() => onDeleteItem(item.id)} className="p-2 text-red-500 hover:bg-red-50 rounded">
                    <Trash2 size={18} />
                  </button>
                </td>
              </tr>
            );
          })}
          {items.length === 0 && (
            <tr>
              <td colSpan={11} className="p-8 text-center text-slate-400">
                لا توجد أصناف مسجلة
              </td>
            </tr>
          )}
        </tbody>
      </table>

      {/* Pagination Controls */}
      <div className="bg-slate-50 p-4 border-t border-slate-200 flex items-center justify-between">
        <div className="text-sm text-slate-500">
          عرض {items.length} من أصل {totalCount} صنف
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => onPageChange((p) => Math.max(1, p - 1))}
            disabled={page === 1 || loading}
            className="p-2 rounded-lg hover:bg-white disabled:opacity-50 transition-colors"
          >
            <ChevronRight size={20} />
          </button>
          <span className="font-bold text-slate-700">
            صفحة {page} من {totalPages}
          </span>
          <button
            onClick={() => onPageChange((p) => Math.min(totalPages, p + 1))}
            disabled={page === totalPages || loading}
            className="p-2 rounded-lg hover:bg-white disabled:opacity-50 transition-colors"
          >
            <ChevronLeft size={20} />
          </button>
        </div>
      </div>
    </div>
  );
};

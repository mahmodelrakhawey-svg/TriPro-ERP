import React from 'react';
import { Edit, Plus, Search, Trash2 } from 'lucide-react';
import type { Product } from '../../../types';

export interface PurchaseLineItem {
  productId: string;
  productName?: string;
  uomId?: string;
  quantity: number;
  unitPrice: number;
  discount?: number;
  discountPercent?: number;
  taxRate?: number;
  total?: number;
  batchNumber?: string;
  [key: string]: unknown;
}

export interface PurchaseUomItem {
  id: string;
  name: string;
  category_id?: string;
}

export interface PurchaseInvoiceItemsTableProps {
  productSearchTerm: string;
  showProductResults: boolean;
  filteredProducts: Product[];
  items: PurchaseLineItem[];
  products: Product[];
  uoms: PurchaseUomItem[];
  currency: string;
  onSearchTermChange: (val: string) => void;
  onSearchKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  onOpenAddProductModal: () => void;
  onAddProductToInvoice: (product: Product) => void;
  onOpenEditProductModal: (product: Product) => void;
  onItemChange: (index: number, field: string, value: unknown) => void;
  onRemoveItem: (index: number) => void;
  onMissingProductEdit: () => void;
}

/**
 * Renders the product live search bar and editable line-items table for a purchase invoice.
 */
export const PurchaseInvoiceItemsTable: React.FC<PurchaseInvoiceItemsTableProps> = ({
  productSearchTerm,
  showProductResults,
  filteredProducts,
  items,
  products,
  uoms,
  currency,
  onSearchTermChange,
  onSearchKeyDown,
  onOpenAddProductModal,
  onAddProductToInvoice,
  onOpenEditProductModal,
  onItemChange,
  onRemoveItem,
  onMissingProductEdit,
}) => {
  return (
    <>
      <div className="relative">
        <div className="flex items-center justify-between gap-2 mb-1">
          <label className="block text-xs font-bold text-slate-600">إضافة صنف للفاتورة (ابحث بالاسم أو الباركود)</label>
          <button
            type="button"
            onClick={onOpenAddProductModal}
            className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 shadow-sm transition-all"
            title="إضافة صنف جديد كلياً إلى قاعدة البيانات والفاتورة"
          >
            <Plus size={14} /> إضافة صنف جديد
          </button>
        </div>
        <div className="relative">
          <input
            type="text"
            placeholder="ابحث بالاسم، الكود، أو الباركود واضغط Enter..."
            value={productSearchTerm}
            onChange={(e) => onSearchTermChange(e.target.value)}
            onKeyDown={onSearchKeyDown}
            className="w-full border rounded-xl p-2.5 pl-10 bg-slate-50 focus:bg-white text-sm outline-none focus:border-emerald-500 transition-colors"
          />
          <Search className="absolute left-3 top-3 text-slate-400" size={18} />
        </div>

        {showProductResults && filteredProducts.length > 0 && (
          <div className="absolute top-full left-0 w-full bg-white border border-slate-200 shadow-xl rounded-xl mt-1 z-20 overflow-hidden divide-y divide-slate-100 max-h-72 overflow-y-auto">
            {filteredProducts.map((p) => (
              <div
                key={p.id}
                className="p-3 hover:bg-emerald-50 cursor-pointer flex justify-between items-center transition-colors group"
              >
                <div className="flex-1" onClick={() => onAddProductToInvoice(p)}>
                  <span className="font-bold text-slate-800 text-sm block">{p.name}</span>
                  <span className="text-xs text-slate-400 font-mono">
                    الكود: {p.sku || '-'} | الباركود: {p.barcode || '-'}
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <span
                    className="font-bold text-emerald-600 font-mono text-sm"
                    onClick={() => onAddProductToInvoice(p)}
                  >
                    {(p.purchase_price || p.cost || 0).toLocaleString()} {currency}
                  </span>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onOpenEditProductModal(p);
                    }}
                    className="p-1.5 text-blue-600 hover:bg-blue-100 rounded-lg transition"
                    title="تعديل كارت الصنف"
                  >
                    <Edit size={15} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[960px] text-right text-sm">
          <thead className="bg-slate-50 text-xs font-bold text-slate-600 border-b border-slate-200">
            <tr>
              <th className="p-3 min-w-[200px]">الصنف</th>
              <th className="p-3 min-w-[110px] text-center">الوحدة</th>
              <th className="p-3 min-w-[105px] text-center">الكمية</th>
              <th className="p-3 min-w-[145px] text-center" title="سعر الوحدة مع اتساع مرن للأرقام والكسور">سعر الوحدة</th>
              <th className="p-3 min-w-[110px] text-center" title="خصم خاص على مستوى هذا الصنف">خصم الصنف</th>
              <th className="p-3 min-w-[95px] text-center">ضريبة %</th>
              <th className="p-3 min-w-[135px] text-center" title="إجمالي البند (يمكنك إدخال الإجمالي مباشرة وسيتم حساب سعر الوحدة تلقائياً)">إجمالي البند</th>
              <th className="p-3 w-10 text-center"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {items.map((item, index) => (
              <tr key={index} className="hover:bg-slate-50/60 transition-colors">
                <td className="p-3 font-bold text-slate-800">
                  <div className="flex items-center flex-wrap gap-1.5">
                    <span>{item.productName || products.find((p) => p.id === item.productId)?.name || 'صنف'}</span>
                    {Number(item.taxRate) > 0 && (
                      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                        ضريبة {item.taxRate}%
                      </span>
                    )}
                  </div>
                </td>
                <td className="p-3">
                  <select
                    value={item.uomId || ''}
                    onChange={(e) => onItemChange(index, 'uomId', e.target.value)}
                    className="w-full border rounded-lg p-1.5 text-xs bg-white font-bold"
                  >
                    {uoms
                      .filter((u) => {
                        const prod = products.find((p) => p.id === item.productId);
                        const baseUom = uoms.find((ux) => ux.id === prod?.base_uom_id);
                        return !baseUom || u.category_id === baseUom.category_id;
                      })
                      .map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.name}
                        </option>
                      ))}
                  </select>
                </td>
                <td className="p-3 min-w-[105px]">
                  <div className="flex items-center justify-center">
                    <input
                      type="number"
                      step="any"
                      min="0.001"
                      value={item.quantity === 0 ? '' : item.quantity}
                      onChange={(e) =>
                        onItemChange(
                          index,
                          'quantity',
                          e.target.value === '' ? 0 : parseFloat(e.target.value) || 0
                        )
                      }
                      className="w-full min-w-[85px] border border-slate-200 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100 rounded-lg py-1.5 px-2 text-center font-mono font-bold text-emerald-700 bg-white shadow-sm transition-all [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none hover:border-slate-300"
                      style={{ width: `${Math.max(85, String(item.quantity || '').length * 11 + 25)}px` }}
                      placeholder="1"
                      title={`الكمية: ${item.quantity || 0}`}
                    />
                  </div>
                </td>
                <td className="p-3 min-w-[145px]">
                  <div className="flex items-center justify-center">
                    <input
                      type="number"
                      step="any"
                      min="0"
                      value={item.unitPrice === 0 ? '' : item.unitPrice}
                      onChange={(e) =>
                        onItemChange(
                          index,
                          'unitPrice',
                          e.target.value === '' ? 0 : parseFloat(e.target.value) || 0
                        )
                      }
                      className="w-full min-w-[125px] border border-slate-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 rounded-lg py-1.5 px-2 text-center font-mono font-bold text-slate-800 bg-white shadow-sm transition-all [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none hover:border-slate-300"
                      style={{ width: `${Math.max(125, String(item.unitPrice || '').length * 11 + 30)}px` }}
                      placeholder="0.00"
                      title={`سعر الوحدة: ${item.unitPrice || 0}`}
                    />
                  </div>
                </td>
                <td className="p-3 min-w-[110px] text-center">
                  <div className="flex items-center justify-center gap-1">
                    <input
                      type="number"
                      min="0"
                      step="any"
                      value={item.discount ?? 0}
                      onChange={(e) => onItemChange(index, 'discount', parseFloat(e.target.value) || 0)}
                      className="w-20 border rounded-lg p-1.5 text-center font-mono font-bold text-rose-700 bg-white focus:border-rose-500 outline-none"
                      placeholder="0.00"
                      title="قيمة الخصم المباشر على هذا البند (ج.م)"
                    />
                  </div>
                  {Number(item.discount) > 0 && Number(item.quantity) * Number(item.unitPrice) > 0 && (
                    <span
                      className="text-[10px] text-rose-600 font-mono font-bold block mt-0.5"
                      title="نسبة الخصم من إجمالي البند"
                    >
                      -{((Number(item.discount) / ((Number(item.quantity) || 0) * (Number(item.unitPrice) || 0))) * 100).toFixed(1)}%
                    </span>
                  )}
                </td>
                <td className="p-3 min-w-[95px] text-center">
                  <div className="flex items-center justify-center gap-1">
                    <input
                      type="number"
                      min="0"
                      max="100"
                      step="any"
                      value={item.taxRate ?? 0}
                      onChange={(e) => onItemChange(index, 'taxRate', parseFloat(e.target.value) || 0)}
                      className="w-16 border rounded-lg p-1.5 text-center font-mono font-bold text-slate-800 bg-white focus:border-emerald-500 outline-none"
                      title="نسبة الضريبة الخاصة بالبند"
                    />
                    <span className="text-xs text-slate-400 font-bold">%</span>
                  </div>
                  {Number(item.taxRate) > 0 && (
                    <span className="text-[10px] text-emerald-600 font-mono font-bold block mt-0.5" title="قيمة ضريبة هذا البند">
                      +{((Math.max(0, (Number(item.quantity) || 0) * (Number(item.unitPrice) || 0) - (Number(item.discount) || 0))) * ((Number(item.taxRate) || 0) / 100)).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                  )}
                </td>
                <td className="p-3 min-w-[135px]">
                  <div className="flex items-center justify-center">
                    <input
                      type="number"
                      step="any"
                      min="0"
                      value={
                        item.total === 0 && (item.unitPrice || 0) === 0
                          ? ''
                          : item.total !== undefined
                            ? item.total
                            : Math.round(
                                Math.max(
                                  0,
                                  (Number(item.quantity) || 0) * (Number(item.unitPrice) || 0) -
                                    (Number(item.discount) || 0)
                                ) * 100
                              ) / 100
                      }
                      onChange={(e) =>
                        onItemChange(
                          index,
                          'total',
                          e.target.value === '' ? 0 : parseFloat(e.target.value) || 0
                        )
                      }
                      className="w-full min-w-[115px] border border-slate-200 focus:border-amber-500 focus:ring-2 focus:ring-amber-100 rounded-lg py-1.5 px-2 text-center font-mono font-black text-slate-900 bg-white shadow-sm transition-all [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none hover:border-slate-300"
                      placeholder="0.00"
                      title="إجمالي البند (يمكنك إدخال الإجمالي مباشرة لحساب سعر الوحدة تلقائياً)"
                    />
                  </div>
                </td>
                <td className="p-3 text-center">
                  <div className="flex items-center justify-center gap-1">
                    <button
                      type="button"
                      onClick={() => {
                        const prod = products.find((p) => p.id === item.productId);
                        if (prod) onOpenEditProductModal(prod);
                        else onMissingProductEdit();
                      }}
                      className="p-1.5 text-blue-500 hover:bg-blue-50 rounded-lg transition-colors"
                      title="تعديل كارت الصنف"
                    >
                      <Edit size={16} />
                    </button>
                    <button
                      type="button"
                      onClick={() => onRemoveItem(index)}
                      className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                      title="حذف الصنف من الفاتورة"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {items.length === 0 && (
              <tr>
                <td colSpan={8} className="p-8 text-center text-slate-400 font-bold">
                  لم تتم إضافة أي أصناف بعد. ابحث عن صنف بالأعلى لإضافته.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
};

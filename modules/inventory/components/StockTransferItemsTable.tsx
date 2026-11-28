import React from 'react';
import {
  AlertTriangle,
  Box,
  CheckCircle2,
  Minus,
  Package,
  Plus,
  Trash2,
} from 'lucide-react';
import { getProductWarehouseStock } from '../../../components/ProductSearchSelect';
import type { TransferItem } from '../utils/stockTransferPackaging';

export interface StockTransferItemsTableProps {
  items: TransferItem[];
  products: any[];
  fromWarehouseId: string;
  totalBaseQuantity: number;
  overStockCount: number;
  onStepQuantity: (idx: number, delta: number) => void;
  onUpdateEnteredQty: (idx: number, newQty: number) => void;
  onRemoveItem: (idx: number) => void;
}

export const StockTransferItemsTable: React.FC<StockTransferItemsTableProps> = ({
  items,
  products,
  fromWarehouseId,
  totalBaseQuantity,
  overStockCount,
  onStepQuantity,
  onUpdateEnteredQty,
  onRemoveItem,
}) => {
  if (items.length === 0) {
    return (
      <div className="text-center py-10 border-2 border-dashed border-slate-200 rounded-2xl bg-slate-50/50">
        <Package size={40} className="mx-auto text-slate-300 mb-2" />
        <p className="text-sm font-bold text-slate-600">لم يتم إضافة أي أصناف للتحويل حتى الآن</p>
        <p className="text-xs text-slate-400 mt-1">
          اختر المستودع المصدر ثم استخدم البحث السريع أو مسدس الباركود لسحب الأصناف بأي وحدة مطلوبة
        </p>
      </div>
    );
  }

  return (
    <div className="border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
      <div className="overflow-x-auto">
        <table className="w-full text-right text-xs">
          <thead className="bg-slate-100 text-slate-700 font-black border-b">
            <tr>
              <th className="p-3 w-10 text-center">#</th>
              <th className="p-3">الصنف والكود</th>
              <th className="p-3 w-44 text-center">الكمية المسحوبة والوحدة</th>
              <th className="p-3 w-40 text-center">معامل التعبئة والتجزئة</th>
              <th className="p-3 w-32 text-center">المعادل بالمخزن</th>
              <th className="p-3 w-36 text-center">رصيد المصدر</th>
              <th className="p-3 w-28 text-center">حالة الرصيد</th>
              <th className="p-3 w-12 text-center">حذف</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {items.map((item, idx) => {
              const prod = products.find((p) => p.id === item.productId);
              const sourceStock = getProductWarehouseStock(prod, fromWarehouseId);
              const isOverStock = item.baseQuantity > sourceStock;
              const hasConversion = item.conversionRatio !== 1;
              const stockInSelectedUnit =
                item.conversionRatio > 0 ? (sourceStock / item.conversionRatio).toFixed(1) : '-';

              return (
                <tr key={idx} className="hover:bg-slate-50/80 transition-colors">
                  <td className="p-3 text-center font-bold text-slate-400">{idx + 1}</td>

                  <td className="p-3">
                    <div className="font-bold text-slate-800 text-sm">{item.productName}</div>
                    {item.sku && (
                      <div className="font-mono text-[10px] text-slate-400 mt-0.5">
                        كود: {item.sku}
                      </div>
                    )}
                  </td>

                  <td className="p-3 text-center">
                    <div className="inline-flex items-center gap-1 bg-white border border-slate-200 rounded-xl p-1 shadow-sm">
                      <button
                        type="button"
                        onClick={() => onStepQuantity(idx, -1)}
                        className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-slate-100 text-slate-600 transition-colors"
                        title="إنقاص وحدة"
                      >
                        <Minus size={13} />
                      </button>

                      <input
                        type="number"
                        min="0.001"
                        step="any"
                        value={item.enteredQty}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') e.preventDefault();
                        }}
                        onChange={(e) => onUpdateEnteredQty(idx, parseFloat(e.target.value) || 0)}
                        className="w-16 text-center text-sm font-black text-slate-800 focus:outline-none"
                      />

                      <span className="text-[11px] font-bold text-slate-600 pl-1 pr-0.5">
                        {item.selectedUnit}
                      </span>

                      <button
                        type="button"
                        onClick={() => onStepQuantity(idx, 1)}
                        className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-slate-100 text-slate-600 transition-colors"
                        title="زيادة وحدة"
                      >
                        <Plus size={13} />
                      </button>
                    </div>
                  </td>

                  <td className="p-3 text-center">
                    {hasConversion ? (
                      <div className="inline-flex flex-col items-center">
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-100">
                          <Box size={12} />
                          <span>
                            1 {item.selectedUnit} = {item.conversionRatio} {item.baseUnit}
                          </span>
                        </span>
                        {item.packagingNote && (
                          <span
                            className="text-[10px] text-slate-400 mt-0.5 line-clamp-1 max-w-[140px]"
                            title={item.packagingNote}
                          >
                            {item.packagingNote}
                          </span>
                        )}
                      </div>
                    ) : (
                      <span className="text-slate-400 text-[11px]">وحدة أساسية (1:1)</span>
                    )}
                  </td>

                  <td className="p-3 text-center">
                    <span className="inline-block px-2.5 py-1 rounded-lg font-black text-blue-700 bg-blue-50 border border-blue-100 text-xs">
                      {item.baseQuantity.toFixed(2)} {item.baseUnit}
                    </span>
                  </td>

                  <td className="p-3 text-center">
                    <div>
                      <span
                        className={`inline-block px-2 py-0.5 rounded text-xs font-bold ${
                          sourceStock > 0
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-100'
                            : 'bg-rose-50 text-rose-700 border border-rose-100'
                        }`}
                      >
                        {sourceStock} {item.baseUnit}
                      </span>
                      {hasConversion && sourceStock > 0 && (
                        <div className="text-[10px] text-slate-400 mt-0.5">
                          (~ {stockInSelectedUnit} {item.selectedUnit})
                        </div>
                      )}
                    </div>
                  </td>

                  <td className="p-3 text-center">
                    {isOverStock ? (
                      <span className="inline-flex items-center gap-1 text-[11px] font-bold text-rose-600 bg-rose-50 px-2 py-1 rounded-lg border border-rose-200">
                        <AlertTriangle size={12} /> عجز: {(item.baseQuantity - sourceStock).toFixed(2)}
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-600 bg-emerald-50 px-2 py-1 rounded-lg border border-emerald-200">
                        <CheckCircle2 size={12} /> رصيد كافٍ
                      </span>
                    )}
                  </td>

                  <td className="p-3 text-center">
                    <button
                      type="button"
                      onClick={() => onRemoveItem(idx)}
                      className="text-slate-400 hover:text-rose-600 hover:bg-rose-50 p-2 rounded-xl transition-all"
                      title="حذف البند"
                    >
                      <Trash2 size={16} />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="p-4 bg-slate-50 border-t border-slate-200 flex flex-col sm:flex-row justify-between items-center gap-3 text-xs">
        <div className="flex items-center gap-6">
          <div>
            <span className="text-slate-500">عدد الأصناف: </span>
            <span className="font-black text-slate-800 text-sm">{items.length} صنف</span>
          </div>
          <div>
            <span className="text-slate-500">إجمالي الكميات (بالمخزن): </span>
            <span className="font-black text-blue-700 text-sm">{totalBaseQuantity.toFixed(2)}</span>
          </div>
        </div>

        {overStockCount > 0 && (
          <div className="flex items-center gap-1.5 text-amber-700 bg-amber-50 px-3 py-1.5 rounded-xl border border-amber-200 font-bold text-[11px]">
            <AlertTriangle size={14} /> يوجد ({overStockCount}) صنف كميتها تتجاوز الرصيد الحالي بالمستودع المصدر
          </div>
        )}
      </div>
    </div>
  );
};

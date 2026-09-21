import React from 'react';
import { CheckSquare, X } from 'lucide-react';

interface AutoCreatedProduct {
  name: string;
  sku?: string | null;
  type: string;
}

interface AutoCreatedProductsModalProps {
  isOpen: boolean;
  onClose: () => void;
  products: AutoCreatedProduct[];
}

export const AutoCreatedProductsModal: React.FC<AutoCreatedProductsModalProps> = ({
  isOpen,
  onClose,
  products,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[80] p-4 backdrop-blur-sm">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl overflow-hidden animate-in zoom-in-95">
        <div className="bg-slate-50 px-6 py-4 border-b flex justify-between items-center">
          <h3 className="font-bold text-lg text-slate-800 flex items-center gap-2">
            <CheckSquare size={20} className="text-emerald-600" /> تقرير المنتجات التي تم إنشاؤها تلقائياً
          </h3>
          <button onClick={onClose}><X className="text-slate-400 hover:text-red-500" /></button>
        </div>
        <div className="p-6 max-h-[60vh] overflow-y-auto">
          <div className="bg-emerald-50 text-emerald-800 p-4 rounded-lg mb-4 text-sm font-medium">
            تم إنشاء {products.length} صنف جديد تلقائياً أثناء استيراد الوصفات لأنها لم تكن موجودة في النظام.
          </div>
          <table className="w-full text-right text-sm border rounded-lg overflow-hidden">
            <thead className="bg-slate-100 font-bold text-slate-700">
              <tr>
                <th className="p-3">اسم الصنف</th>
                <th className="p-3">الكود (SKU)</th>
                <th className="p-3">النوع</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {products.map((item, idx) => (
                <tr key={idx} className="hover:bg-slate-50">
                  <td className="p-3 font-bold">{item.name}</td>
                  <td className="p-3 font-mono text-slate-500">{item.sku || '-'}</td>
                  <td className="p-3">
                    <span className={`px-2 py-1 rounded-full text-xs font-bold ${(item.type || '').includes('Meal') ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'}`}>
                      {item.type}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="bg-slate-50 px-6 py-4 border-t flex justify-end">
          <button onClick={onClose} className="bg-slate-800 text-white px-6 py-2 rounded-lg font-bold hover:bg-slate-900">
            إغلاق
          </button>
        </div>
      </div>
    </div>
  );
};

import React from 'react';
import { AlertTriangle, Trash2 } from 'lucide-react';

export interface JournalOrphanAlertProps {
  detectedOrphanEntry: any;
  onDeleteOrphanSpecific: (entryId: string) => void;
}

export const JournalOrphanAlert: React.FC<JournalOrphanAlertProps> = ({
  detectedOrphanEntry,
  onDeleteOrphanSpecific
}) => {
  if (!detectedOrphanEntry) return null;

  return (
    <div className="bg-rose-50 border-2 border-rose-300 p-4 rounded-xl mb-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 animate-in fade-in shadow-sm">
      <div className="flex items-center gap-3">
        <div className="p-2.5 bg-rose-100 text-rose-700 rounded-xl shrink-0">
          <AlertTriangle size={24} />
        </div>
        <div>
          <h4 className="text-sm font-black text-rose-900">
            تنبيه محاسبي: تم اكتشاف قيد رصيد افتتاحي لمورد محذوف (شركة هاي مكس) معلق في دفتر الأستاذ العام!
          </h4>
          <p className="text-xs text-rose-700 mt-0.5">
            المرجع: <span className="font-mono font-bold bg-white/70 px-1.5 py-0.5 rounded border border-rose-200 text-rose-900">{detectedOrphanEntry.reference}</span>
            {' — '}
            {detectedOrphanEntry.description}
            {' — '}
            المبلغ: <strong className="font-mono">9,114.00 ج.م</strong>
          </p>
        </div>
      </div>
      <button
        onClick={() => onDeleteOrphanSpecific(detectedOrphanEntry.id)}
        className="bg-rose-600 hover:bg-rose-700 text-white px-4 py-2.5 rounded-xl font-bold text-xs transition-colors shrink-0 shadow-sm flex items-center gap-1.5"
      >
        <Trash2 size={15} />
        حذف هذا القيد وتصحيح الأستاذ العام فوراً
      </button>
    </div>
  );
};

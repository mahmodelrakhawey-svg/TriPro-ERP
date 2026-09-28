import React from 'react';

export interface RetailPosShortcutsFooterProps {
  heldOrdersCount: number;
}

export const RetailPosShortcutsFooter: React.FC<RetailPosShortcutsFooterProps> = ({
  heldOrdersCount
}) => {
  return (
    <footer className="bg-slate-950 border-t border-slate-800 px-6 py-2 flex justify-between items-center text-xs text-slate-500 font-bold select-none">
      <div className="flex items-center gap-4">
        <span>⌨️ أزرار التحكم السريع:</span>
        <span className="flex items-center gap-1">
          <kbd className="bg-slate-900 px-1.5 py-0.5 rounded border border-slate-700 text-slate-300">F8</kbd> الدفع والطباعة
        </span>
        <span className="flex items-center gap-1">
          <kbd className="bg-slate-900 px-1.5 py-0.5 rounded border border-slate-700 text-amber-400">F6</kbd> تعليق الفاتورة
        </span>
        <span className="flex items-center gap-1">
          <kbd className="bg-slate-900 px-1.5 py-0.5 rounded border border-slate-700 text-amber-400">F7</kbd> المعلقة ({heldOrdersCount})
        </span>
        <span className="flex items-center gap-1">
          <kbd className="bg-slate-900 px-1.5 py-0.5 rounded border border-slate-700 text-slate-300">F9</kbd> تحديد المستلم
        </span>
        <span className="flex items-center gap-1">
          <kbd className="bg-slate-900 px-1.5 py-0.5 rounded border border-slate-700 text-slate-300">F4</kbd> بحث
        </span>
      </div>
      <div>
        <span>💡 نصيحة للكاشير: يمكنك إدخال الكمية متبوعة بنجمة ثم الباركود للضرب السريع (مثال: <span className="font-mono text-indigo-400">5*barcode</span>)</span>
      </div>
    </footer>
  );
};

export default RetailPosShortcutsFooter;

import React from 'react';

interface TableSkeletonProps {
  rows?: number;
  columns?: number;
  showHeader?: boolean;
}

/**
 * 🦴 هيكل تحميل شبحي للجداول (Table Skeleton)
 * يمنع الوميض البصري وقفزات الشاشة أثناء جلب البيانات من الخادم
 */
export const TableSkeleton: React.FC<TableSkeletonProps> = ({
  rows = 6,
  columns = 5,
  showHeader = true,
}) => {
  return (
    <div className="w-full bg-white rounded-2xl border border-slate-200/80 p-5 shadow-sm animate-pulse" dir="rtl">
      {/* رأس الفلترة والأزرار */}
      <div className="flex justify-between items-center mb-6">
        <div className="h-9 bg-slate-200 rounded-xl w-64" />
        <div className="flex gap-2">
          <div className="h-9 bg-slate-200 rounded-xl w-24" />
          <div className="h-9 bg-slate-200 rounded-xl w-28" />
        </div>
      </div>

      {/* ترويسة الجدول */}
      {showHeader && (
        <div className="grid gap-4 mb-4 pb-3 border-b border-slate-100" style={{ gridTemplateColumns: `repeat(${columns}, 1fr)` }}>
          {Array.from({ length: columns }).map((_, i) => (
            <div key={i} className="h-4 bg-slate-200 rounded-md w-3/4" />
          ))}
        </div>
      )}

      {/* صفوف الجدول */}
      <div className="space-y-3">
        {Array.from({ length: rows }).map((_, r) => (
          <div
            key={r}
            className="grid gap-4 py-3 items-center border-b border-slate-50 last:border-b-0"
            style={{ gridTemplateColumns: `repeat(${columns}, 1fr)` }}
          >
            {Array.from({ length: columns }).map((_, c) => (
              <div
                key={c}
                className="h-4 bg-slate-100 rounded-md"
                style={{
                  width: `${60 + ((r * c * 17) % 35)}%`,
                }}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
};

/**
 * 🦴 هيكل تحميل كروت الإحصائيات (Stat Cards Skeleton)
 */
export const StatsSkeleton: React.FC<{ count?: number }> = ({ count = 4 }) => {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 animate-pulse" dir="rtl">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm space-y-3">
          <div className="flex justify-between items-center">
            <div className="h-4 bg-slate-200 rounded-md w-24" />
            <div className="w-10 h-10 bg-slate-100 rounded-xl" />
          </div>
          <div className="h-7 bg-slate-200 rounded-lg w-36" />
          <div className="h-3 bg-slate-100 rounded-md w-28" />
        </div>
      ))}
    </div>
  );
};

export default TableSkeleton;

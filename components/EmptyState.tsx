import React from 'react';
import { LucideIcon, FolderOpen, Plus } from 'lucide-react';

export interface EmptyStateProps {
  /** الأيقونة التوضيحية (افتراضياً FolderOpen) */
  icon?: LucideIcon;
  /** العنوان الرئيسي للحالة الفارغة */
  title: string;
  /** وصف توضيحي استرشادي للمستخدم */
  description?: string;
  /** زر الإجراء الأساسي (مثال: إضافة سجل جديد) */
  action?: {
    label: string;
    onClick: () => void;
    icon?: LucideIcon;
  };
  /** زر إجراء ثانوي اختياري */
  secondaryAction?: {
    label: string;
    onClick: () => void;
    icon?: LucideIcon;
  };
  /** نمط مدمج للمربعات الصغيرة أو النوافذ المنبثقة */
  compact?: boolean;
  /** أصناف CSS إضافية */
  className?: string;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  icon: Icon = FolderOpen,
  title,
  description,
  action,
  secondaryAction,
  compact = false,
  className = '',
}) => {
  const ActionIcon = action?.icon || Plus;
  const SecondaryIcon = secondaryAction?.icon;

  return (
    <div 
      className={`flex flex-col items-center justify-center text-center rounded-2xl border border-dashed border-slate-200 bg-slate-50/50 transition-all ${
        compact ? 'p-6' : 'p-10 sm:p-14'
      } ${className}`}
      role="status"
      aria-label={title}
    >
      {/* 🌟 هالة وتأثير الأيقونة */}
      <div className={`rounded-2xl bg-white border border-slate-200/80 shadow-xs flex items-center justify-center text-slate-400 mb-4 transition-transform hover:scale-105 ${
        compact ? 'w-12 h-12' : 'w-16 h-16'
      }`}>
        <Icon size={compact ? 24 : 32} className="text-slate-400" />
      </div>

      {/* 📝 النصوص التوضيحية */}
      <h3 className={`font-black text-slate-800 tracking-tight ${compact ? 'text-sm' : 'text-base sm:text-lg'}`}>
        {title}
      </h3>
      
      {description && (
        <p className={`text-slate-500 font-medium max-w-md mt-1.5 leading-relaxed ${
          compact ? 'text-xs' : 'text-xs sm:text-sm'
        }`}>
          {description}
        </p>
      )}

      {/* 🚀 أزرار الإجراءات */}
      {(action || secondaryAction) && (
        <div className={`flex flex-wrap items-center justify-center gap-2.5 mt-5`}>
          {action && (
            <button
              type="button"
              onClick={action.onClick}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs sm:text-sm font-bold bg-blue-600 text-white hover:bg-blue-700 active:scale-95 transition-all shadow-md shadow-blue-200 cursor-pointer"
            >
              <ActionIcon size={16} />
              <span>{action.label}</span>
            </button>
          )}

          {secondaryAction && (
            <button
              type="button"
              onClick={secondaryAction.onClick}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs sm:text-sm font-bold bg-white text-slate-700 hover:bg-slate-100 border border-slate-200 active:scale-95 transition-all cursor-pointer shadow-2xs"
            >
              {SecondaryIcon && <SecondaryIcon size={16} />}
              <span>{secondaryAction.label}</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
};

export default EmptyState;

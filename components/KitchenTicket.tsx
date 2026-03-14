import React from 'react';

interface KitchenTicketProps {
  tableName: string;
  items: any[];
}

export const KitchenTicket = React.forwardRef<HTMLDivElement, KitchenTicketProps>(({ tableName, items }, ref) => {
  if (!items || items.length === 0) return null;

  return (
    <div ref={ref} className="p-4 text-black bg-white w-[80mm] font-sans" dir="rtl">
      <div className="text-center border-b-2 border-black pb-2 mb-4">
        <h1 className="text-2xl font-black">طلب جديد للمطبخ</h1>
        <div className="bg-black text-white py-2 px-4 inline-block rounded mt-2">
            <span className="text-3xl font-black">{tableName}</span>
        </div>
        <p className="text-sm mt-2">{new Date().toLocaleString('ar-EG')}</p>
      </div>

      <div className="space-y-4">
        {items.map((item, index) => (
          <div key={index} className="border-b border-dashed border-gray-400 pb-2">
            <div className="flex justify-between items-start">
              <span className="text-2xl font-black ml-2">{item.quantity}x</span>
              <span className="text-xl font-bold flex-1">{item.name}</span>
            </div>
            
            {item.selectedModifiers && item.selectedModifiers.length > 0 && (
              <div className="mt-1 mr-8 flex flex-wrap gap-1">
                {item.selectedModifiers.map((mod: any, idx: number) => (
                  <div key={idx} className="text-sm font-bold bg-gray-100 px-2 py-0.5 rounded border border-gray-300">
                    + {mod.name}
                  </div>
                ))}
              </div>
            )}

            {item.notes && (
              <div className="mt-2 mr-8 p-2 bg-gray-50 border-r-4 border-black text-sm font-black italic">
                ⚠️ {item.notes}
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="mt-8 text-center text-xs border-t border-black pt-2">
        <p>نظام TriPro - نسخة المطبخ</p>
      </div>
    </div>
  );
});
import React from 'react';

interface KitchenTicketProps {
  tableName: string;
  items: any[];
}

export const KitchenTicket = React.forwardRef<HTMLDivElement, KitchenTicketProps>(({ tableName, items }, ref) => {
  if (!items || items.length === 0) return null;

  return (
    <div ref={ref} className="p-4 text-black bg-white w-[80mm] font-sans" dir="rtl">
      {/* Header */}
      <div className="border-b-4 border-black pb-2 mb-2 flex justify-between items-center">
        <div>
          <h1 className="text-xl font-bold">مطبخ</h1>
          <span className="text-sm font-bold">{new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}</span>
        </div>
        <div className="text-3xl font-black border-2 border-black px-2 rounded">
            {tableName}
        </div>
      </div>

      {/* Items */}
      <div className="space-y-4">
        {items.map((item, index) => (
          <div key={index} className="flex flex-col border-b-2 border-dashed border-black pb-2">
            <div className="flex justify-between items-start">
               <span className="text-xl font-black flex-1 leading-tight">{item.name}</span>
               <span className="text-2xl font-black ml-2 bg-black text-white px-2 rounded min-w-[40px] text-center font-mono">{item.quantity}</span>
            </div>
            
            {/* Modifiers */}
            {item.selectedModifiers && item.selectedModifiers.length > 0 && (
              <div className="mt-1 pr-2 flex flex-col gap-1">
                {item.selectedModifiers.map((mod: any, idx: number) => (
                  <div key={idx} className="text-base font-bold text-black flex items-center">
                    <span className="inline-block w-4 font-black">+</span> 
                    + {mod.name}
                  </div>
                ))}
              </div>
            )}

            {/* Notes */}
            {item.notes && (
              <div className="mt-2 pr-2 font-bold text-lg border-2 border-black p-1 rounded text-center">
                ملاحظة: {item.notes}
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="mt-4 text-center border-t-4 border-black pt-2 font-black text-xl">
        ### نهاية الطلب ###
      </div>
    </div>
  );
});
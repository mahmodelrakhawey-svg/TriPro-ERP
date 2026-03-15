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
          <div key={index} className="flex flex-col border-b border-gray-400 pb-2">
            <div className="flex justify-between items-baseline">
               <span className="text-lg font-bold flex-1">{item.name}</span>
               <span className="text-2xl font-black ml-2 bg-black text-white px-2 rounded-full min-w-[40px] text-center font-mono">{item.quantity}</span>
            </div>
            
            {/* Modifiers */}
            {item.selectedModifiers && item.selectedModifiers.length > 0 && (
              <div className="mt-1 pr-2 flex flex-wrap gap-1">
                {item.selectedModifiers.map((mod: any, idx: number) => (
                  <div key={idx} className="text-sm font-bold bg-gray-200 px-2 rounded">
                    + {mod.name}
                  </div>
                ))}
              </div>
            )}

            {/* Notes */}
            {item.notes && (
              <div className="mt-1 pr-2 font-bold text-lg uppercase underline">
                ⚠️ {item.notes}
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="mt-4 text-center border-t-2 border-black pt-1 font-bold">
        END OF TICKET
      </div>
    </div>
  );
});
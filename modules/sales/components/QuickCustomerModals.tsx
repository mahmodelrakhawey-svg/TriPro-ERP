import React from 'react';
import { X } from 'lucide-react';

export interface QuickCustomerModalsProps {
  isCustomerModalOpen: boolean;
  setIsCustomerModalOpen: (open: boolean) => void;
  newCustomerName: string;
  setNewCustomerName: (name: string) => void;
  newCustomerPhone: string;
  setNewCustomerPhone: (phone: string) => void;
  newCustomerOpeningBalance: string;
  setNewCustomerOpeningBalance: (bal: string) => void;
  handleQuickAddCustomer: (e: React.FormEvent) => void;

  isEditCustomerModalOpen: boolean;
  setIsEditCustomerModalOpen: (open: boolean) => void;
  editCustomerData: { name: string; phone: string };
  setEditCustomerData: React.Dispatch<React.SetStateAction<{ name: string; phone: string }>>;
  handleUpdateCustomerSubmit: (e: React.FormEvent) => void;
}

export const QuickCustomerModals: React.FC<QuickCustomerModalsProps> = ({
  isCustomerModalOpen,
  setIsCustomerModalOpen,
  newCustomerName,
  setNewCustomerName,
  newCustomerPhone,
  setNewCustomerPhone,
  newCustomerOpeningBalance,
  setNewCustomerOpeningBalance,
  handleQuickAddCustomer,
  isEditCustomerModalOpen,
  setIsEditCustomerModalOpen,
  editCustomerData,
  setEditCustomerData,
  handleUpdateCustomerSubmit
}) => {
  return (
    <>
      {/* Quick Add Customer Modal */}
      {isCustomerModalOpen && (
        <div className="fixed inset-0 bg-black/70 z-[60] flex items-center justify-center p-4 backdrop-blur-md">
          <div className="bg-white rounded-[32px] shadow-2xl w-full max-w-sm overflow-hidden animate-in zoom-in duration-300">
            <div className="bg-slate-50 px-8 py-6 border-b border-slate-100 flex justify-between items-center">
              <h3 className="font-black text-xl text-slate-800">إضافة عميل سريع</h3>
              <button
                type="button"
                onClick={() => setIsCustomerModalOpen(false)}
                className="p-2 hover:bg-red-50 hover:text-red-500 rounded-full transition-colors"
              >
                <X size={20} />
              </button>
            </div>
            <form onSubmit={handleQuickAddCustomer} className="p-8 space-y-6">
              <div className="space-y-2">
                <label className="text-xs font-black text-slate-400 pr-2 uppercase">اسم العميل بالكامل</label>
                <input
                  type="text"
                  placeholder="الاسم الثلاثي أو اسم المنشأة"
                  required
                  value={newCustomerName}
                  onChange={e => setNewCustomerName(e.target.value)}
                  className="w-full border-2 border-slate-50 rounded-2xl px-5 py-4 focus:outline-none focus:border-blue-500 bg-slate-50 font-bold"
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-black text-slate-400 pr-2 uppercase">رقم الجوال</label>
                <input
                  type="text"
                  placeholder="05xxxxxxxx"
                  value={newCustomerPhone}
                  onChange={e => setNewCustomerPhone(e.target.value)}
                  className="w-full border-2 border-slate-50 rounded-2xl px-5 py-4 focus:outline-none focus:border-blue-500 bg-slate-50 font-bold"
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-black text-slate-400 pr-2 uppercase">الرصيد الافتتاحي (عليه)</label>
                <input
                  type="number"
                  min="0"
                  placeholder="0.00"
                  value={newCustomerOpeningBalance}
                  onChange={e => setNewCustomerOpeningBalance(e.target.value)}
                  className="w-full border-2 border-slate-50 rounded-2xl px-5 py-4 focus:outline-none focus:border-blue-500 bg-slate-50 font-bold"
                />
              </div>
              <button
                type="submit"
                className="w-full bg-blue-600 text-white py-4 rounded-2xl font-black shadow-xl shadow-blue-200 hover:bg-blue-700 transition-all transform active:scale-95"
              >
                إضافة العميل
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Edit Customer Modal */}
      {isEditCustomerModalOpen && (
        <div className="fixed inset-0 bg-black/70 z-[60] flex items-center justify-center p-4 backdrop-blur-md">
          <div className="bg-white rounded-[32px] shadow-2xl w-full max-w-sm overflow-hidden animate-in zoom-in duration-300">
            <div className="bg-slate-50 px-8 py-6 border-b border-slate-100 flex justify-between items-center">
              <h3 className="font-black text-xl text-slate-800">تعديل بيانات العميل</h3>
              <button
                type="button"
                onClick={() => setIsEditCustomerModalOpen(false)}
                className="p-2 hover:bg-red-50 hover:text-red-500 rounded-full transition-colors"
              >
                <X size={20} />
              </button>
            </div>
            <form onSubmit={handleUpdateCustomerSubmit} className="p-8 space-y-6">
              <div className="space-y-2">
                <label className="text-xs font-black text-slate-400 pr-2 uppercase">اسم العميل بالكامل</label>
                <input
                  type="text"
                  required
                  value={editCustomerData.name}
                  onChange={e => setEditCustomerData({ ...editCustomerData, name: e.target.value })}
                  className="w-full border-2 border-slate-50 rounded-2xl px-5 py-4 focus:outline-none focus:border-amber-500 bg-slate-50 font-bold"
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-black text-slate-400 pr-2 uppercase">رقم الجوال</label>
                <input
                  type="text"
                  value={editCustomerData.phone}
                  onChange={e => setEditCustomerData({ ...editCustomerData, phone: e.target.value })}
                  className="w-full border-2 border-slate-50 rounded-2xl px-5 py-4 focus:outline-none focus:border-amber-500 bg-slate-50 font-bold"
                />
              </div>
              <button
                type="submit"
                className="w-full bg-amber-500 text-white py-4 rounded-2xl font-black shadow-xl shadow-amber-200 hover:bg-amber-600 transition-all transform active:scale-95"
              >
                حفظ التعديلات
              </button>
            </form>
          </div>
        </div>
      )}
    </>
  );
};

export default QuickCustomerModals;
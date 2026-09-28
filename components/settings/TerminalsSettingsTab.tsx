import React from 'react';
import { MonitorSmartphone, RefreshCw, Trash2 } from 'lucide-react';

interface TerminalsSettingsTabProps {
  handleAddTerminal: (e: React.FormEvent) => void;
  newTerminalData: { name: string; warehouseId: string; cashAccountId: string };
  setNewTerminalData: React.Dispatch<
    React.SetStateAction<{ name: string; warehouseId: string; cashAccountId: string }>
  >;
  warehouses: Array<{ id: string; name: string }>;
  accounts: Array<{ id: string; code: string; name: string; isGroup?: boolean }>;
  fetchTerminals: () => void;
  isTerminalsLoading: boolean;
  terminalsList: Array<{
    id: string;
    name: string;
    warehouse_id: string;
    cash_account_id: string;
    status: string;
  }>;
  handleDeleteTerminal: (id: string) => void;
}

export const TerminalsSettingsTab: React.FC<TerminalsSettingsTabProps> = ({
  handleAddTerminal,
  newTerminalData,
  setNewTerminalData,
  warehouses,
  accounts,
  fetchTerminals,
  isTerminalsLoading,
  terminalsList,
  handleDeleteTerminal,
}) => {
  return (
    <div className="space-y-8 animate-in fade-in" dir="rtl">
      {/* Form to add terminal */}
      <form onSubmit={handleAddTerminal} className="bg-slate-50 border border-slate-200 rounded-xl p-6 space-y-4">
        <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
          <MonitorSmartphone size={20} className="text-indigo-600" /> إضافة جهاز كاشير جديد
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-2">اسم الكاشير (الممر)</label>
            <input
              type="text"
              value={newTerminalData.name}
              onChange={(e) => setNewTerminalData((prev) => ({ ...prev, name: e.target.value }))}
              placeholder="مثال: كاشير 1"
              className="w-full border border-slate-300 rounded-lg p-2 text-sm focus:border-indigo-500 outline-none bg-white text-slate-800"
              required
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-2">المستودع المرتبط بخصم البضاعة</label>
            <select
              value={newTerminalData.warehouseId}
              onChange={(e) => setNewTerminalData((prev) => ({ ...prev, warehouseId: e.target.value }))}
              className="w-full border border-slate-300 bg-white rounded-lg p-2.5 text-sm focus:border-indigo-500 outline-none text-slate-800"
            >
              <option value="">-- اختر المستودع --</option>
              {warehouses.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-2">الخزينة المرتبطة بعهدة الكاشير</label>
            <select
              value={newTerminalData.cashAccountId}
              onChange={(e) => setNewTerminalData((prev) => ({ ...prev, cashAccountId: e.target.value }))}
              className="w-full border border-slate-300 bg-white rounded-lg p-2.5 text-sm focus:border-indigo-500 outline-none text-slate-800"
            >
              <option value="">-- اختر حساب الخزينة --</option>
              {accounts
                .filter((acc) => !acc.isGroup && acc.code?.startsWith('123'))
                .map((acc) => (
                  <option key={acc.id} value={acc.id}>
                    [{acc.code}] - {acc.name}
                  </option>
                ))}
            </select>
          </div>
        </div>
        <div className="pt-2 text-left">
          <button
            type="submit"
            className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold px-6 py-2.5 rounded-lg shadow-md transition-all"
          >
            إضافة الجهاز
          </button>
        </div>
      </form>

      {/* Terminals list table */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
        <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50 flex justify-between items-center">
          <h3 className="font-bold text-slate-800">الأجهزة المسجلة حالياً</h3>
          <button
            type="button"
            onClick={fetchTerminals}
            className="text-xs text-indigo-600 hover:text-indigo-700 font-bold flex items-center gap-1"
          >
            <RefreshCw size={12} /> تحديث القائمة
          </button>
        </div>
        {isTerminalsLoading ? (
          <div className="flex justify-center p-8">
            <RefreshCw className="animate-spin text-indigo-500" size={32} />
          </div>
        ) : terminalsList.length === 0 ? (
          <div className="p-8 text-center text-slate-500 text-sm">
            لا توجد أجهزة كاشير مسجلة حالياً.
          </div>
        ) : (
          <table className="w-full text-right border-collapse text-sm">
            <thead>
              <tr className="bg-slate-50 text-slate-600 border-b border-slate-200 font-bold">
                <th className="p-4">اسم الكاشير</th>
                <th className="p-4">المستودع الافتراضي</th>
                <th className="p-4">حساب الخزينة</th>
                <th className="p-4">الحالة</th>
                <th className="p-4 text-center">إجراءات</th>
              </tr>
            </thead>
            <tbody>
              {terminalsList.map((term) => {
                const wh = warehouses.find((w) => w.id === term.warehouse_id);
                const acc = accounts.find((a) => a.id === term.cash_account_id);
                return (
                  <tr key={term.id} className="border-b border-slate-150 hover:bg-slate-50/50">
                    <td className="p-4 font-bold text-slate-850">{term.name}</td>
                    <td className="p-4 text-slate-600">{wh?.name || 'غير محدد'}</td>
                    <td className="p-4 text-slate-600">{acc ? `[${acc.code}] ${acc.name}` : 'غير محدد'}</td>
                    <td className="p-4">
                      <span
                        className={`px-2 py-0.5 rounded-full text-xs font-bold ${
                          term.status === 'ACTIVE' ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-600'
                        }`}
                      >
                        {term.status === 'ACTIVE' ? 'نشط' : 'معطل'}
                      </span>
                    </td>
                    <td className="p-4 text-center">
                      <button
                        onClick={() => handleDeleteTerminal(term.id)}
                        className="text-red-650 hover:text-red-750 hover:bg-red-50 p-1.5 rounded transition-all"
                        title="حذف الجهاز"
                      >
                        <Trash2 size={16} />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};

export default TerminalsSettingsTab;

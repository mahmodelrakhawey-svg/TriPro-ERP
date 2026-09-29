import React from 'react';
import { Account } from '../../../../types';

export interface JournalAdvancedFiltersProps {
  show: boolean;
  filterAccountId: string;
  setFilterAccountId: (val: string) => void;
  filterAmount: string;
  setFilterAmount: (val: string) => void;
  filterSource: string;
  setFilterSource: (val: string) => void;
  filterStatus: string;
  setFilterStatus: (val: string) => void;
  startDate: string;
  setStartDate: (val: string) => void;
  endDate: string;
  setEndDate: (val: string) => void;
  sortedAccounts: Account[];
  onResetFilters: () => void;
}

export const JournalAdvancedFilters: React.FC<JournalAdvancedFiltersProps> = ({
  show,
  filterAccountId,
  setFilterAccountId,
  filterAmount,
  setFilterAmount,
  filterSource,
  setFilterSource,
  filterStatus,
  setFilterStatus,
  startDate,
  setStartDate,
  endDate,
  setEndDate,
  sortedAccounts,
  onResetFilters
}) => {
  if (!show) return null;

  return (
    <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 mb-6 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 animate-in fade-in slide-in-from-top-2 duration-200" dir="rtl">
      <div>
        <label className="block text-xs font-bold text-slate-500 mb-1">الحساب المتأثر</label>
        <select
          value={filterAccountId}
          onChange={(e) => setFilterAccountId(e.target.value)}
          className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500 bg-white"
        >
          <option value="">كل الحسابات</option>
          {sortedAccounts.map(a => (
            <option key={a.id} value={a.id}>{a.code} - {a.name}</option>
          ))}
        </select>
      </div>
      <div>
        <label className="block text-xs font-bold text-slate-500 mb-1">المبلغ المالي</label>
        <input
          type="number"
          step="any"
          placeholder="مبلغ مدين أو دائن..."
          value={filterAmount}
          onChange={(e) => setFilterAmount(e.target.value)}
          className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500 text-right"
          dir="ltr"
        />
      </div>
      <div>
        <label className="block text-xs font-bold text-slate-500 mb-1">مصدر القيد</label>
        <select
          value={filterSource}
          onChange={(e) => setFilterSource(e.target.value)}
          className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500 bg-white"
        >
          <option value="">كل المصادر</option>
          <option value="manual_journal">قيد يدوي (JE/MAN)</option>
          <option value="sales_invoice">فاتورة مبيعات (INV)</option>
          <option value="sales_return">مرتجع مبيعات (SR)</option>
          <option value="credit_note">إشعار دائن (CN)</option>
          <option value="purchase_invoice">فاتورة مشتريات (PI/PUR)</option>
          <option value="purchase_return">مرتجع مشتريات (PR)</option>
          <option value="debit_note">إشعار مدين (DN)</option>
          <option value="receipt_voucher">سند قبض (RCT/RV)</option>
          <option value="payment_voucher">سند صرف (PAY/PV/EXP)</option>
          <option value="cheque">شيكات (CHQ)</option>
          <option value="treasury_transfer">تحويل خزينة/أموال (TRN)</option>
          <option value="bank_adjustment">تسوية بنكية (BANK-ADJ)</option>
          <option value="cash_adjustment">تسوية فروقات صندوق (CASH-ADJ)</option>
          <option value="stock_adjustment">تسوية مخزنية (STK-ADJ/ADJ)</option>
          <option value="asset_depreciation">أصول وإهلاك (DEP/ASSET)</option>
          <option value="payroll">رواتب (PAYROLL)</option>
          <option value="shift_closing">إغلاق وردية (SHIFT)</option>
          <option value="pharmacy">صرف صيدلية (PHARM)</option>
          <option value="hims">فاتورة طبية (HIMS)</option>
          <option value="opening_balance">رصيد افتتاحي (OP/OB)</option>
        </select>
      </div>
      <div>
        <label className="block text-xs font-bold text-slate-500 mb-1">حالة القيد والتوازن</label>
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500 bg-white"
        >
          <option value="">كل الحالات</option>
          <option value="posted">مرحّل فقط</option>
          <option value="draft">مسودة فقط</option>
          <option value="unbalanced">⚠️ غير متوازن (المدين ≠ الدائن)</option>
          <option value="posted_unbalanced">🚨 مرحّل وغير متوازن (المسبب لفارق الميزان)</option>
        </select>
      </div>
      <div>
        <label className="block text-xs font-bold text-slate-500 mb-1">من تاريخ</label>
        <input
          type="date"
          value={startDate}
          onChange={(e) => setStartDate(e.target.value)}
          className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
        />
      </div>
      <div>
        <label className="block text-xs font-bold text-slate-500 mb-1">إلى تاريخ</label>
        <input
          type="date"
          value={endDate}
          onChange={(e) => setEndDate(e.target.value)}
          className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
        />
      </div>
      <div className="flex items-end md:col-span-2">
        <button
          onClick={onResetFilters}
          className="bg-slate-200 text-slate-700 px-4 py-2 rounded-lg hover:bg-slate-300 font-bold text-xs transition-colors"
        >
          إعادة تعيين الفلاتر
        </button>
      </div>
    </div>
  );
};

import React from 'react';
import { 
  User, 
  RefreshCw, 
  FileText, 
  Edit, 
  X, 
  ChevronDown, 
  Check, 
  AlertCircle, 
  UserCheck, 
  Warehouse, 
  Calendar, 
  CircleDollarSign 
} from 'lucide-react';

export interface InvoiceHeaderProps {
  formData: {
    customerId: string;
    salespersonId: string;
    warehouseId: string;
    date: string;
    dueDate: string;
    currency: string;
    exchangeRate: number;
    [key: string]: any;
  };
  setFormData: React.Dispatch<React.SetStateAction<any>>;
  customers: any[];
  customerSearchTerm: string;
  setCustomerSearchTerm: (term: string) => void;
  showCustomerDropdown: boolean;
  setShowCustomerDropdown: (show: boolean) => void;
  customerBalance: number;
  isRefreshingBalance: boolean;
  handleRefreshBalance: () => void;
  setIsStatementModalOpen: (open: boolean) => void;
  handleEditCustomerClick: () => void;
  setIsCustomerModalOpen: (open: boolean) => void;
  isOverLimit: boolean;
  selectedCustomer: any;
  totalProjectedDebt: number;
  salespeople: any[];
  warehouses: any[];
  pricingTier: 'retail' | 'wholesale' | 'half';
  setPricingTier: (tier: 'retail' | 'wholesale' | 'half') => void;
}

export const InvoiceHeader: React.FC<InvoiceHeaderProps> = ({
  formData,
  setFormData,
  customers,
  customerSearchTerm,
  setCustomerSearchTerm,
  showCustomerDropdown,
  setShowCustomerDropdown,
  customerBalance,
  isRefreshingBalance,
  handleRefreshBalance,
  setIsStatementModalOpen,
  handleEditCustomerClick,
  setIsCustomerModalOpen,
  isOverLimit,
  selectedCustomer,
  totalProjectedDebt,
  salespeople,
  warehouses,
  pricingTier,
  setPricingTier,
}) => {
  return (
    <div className="bg-white rounded-3xl shadow-sm border border-slate-200 overflow-hidden">
      <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-8">
        {/* Customer Selection */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <label className="text-sm font-black text-slate-700 flex items-center gap-2">
                <User className="text-blue-500" size={18} /> اختيار العميل
              </label>
              {formData.customerId && (
                <div className="flex items-center gap-2 text-xs font-bold text-slate-500 animate-in fade-in bg-slate-50 px-3 py-1 rounded-xl border border-slate-100 shadow-sm">
                  <span>الرصيد:</span>
                  <span className={`font-black ${customerBalance > 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                    {customerBalance.toLocaleString()}
                  </span>
                  <button 
                    type="button" 
                    onClick={handleRefreshBalance}
                    disabled={isRefreshingBalance}
                    className="p-1 hover:bg-slate-200 rounded-full text-blue-600 transition-colors disabled:opacity-50"
                    title="تحديث الرصيد"
                  >
                    <RefreshCw size={12} className={isRefreshingBalance ? 'animate-spin' : ''} />
                  </button>
                  <button 
                    type="button" 
                    onClick={() => setIsStatementModalOpen(true)}
                    className="p-1 hover:bg-slate-200 rounded-full text-purple-600 transition-colors"
                    title="عرض كشف حساب تفصيلي"
                  >
                    <FileText size={12} />
                  </button>
                </div>
              )}
            </div>
            <div className="flex gap-2">
              {formData.customerId && (
                <button 
                  type="button" 
                  onClick={handleEditCustomerClick}
                  className="text-amber-600 hover:bg-amber-50 px-3 py-1.5 rounded-xl text-xs font-bold transition-all border border-amber-100 flex items-center gap-1"
                >
                  <Edit size={14} /> تعديل
                </button>
              )}
              <button 
                type="button" 
                onClick={() => setIsCustomerModalOpen(true)}
                className="text-blue-600 hover:bg-blue-50 px-3 py-1.5 rounded-xl text-xs font-bold transition-all border border-blue-100"
              >
                + عميل جديد
              </button>
            </div>
          </div>
          <div className="relative group">
            <div className="relative">
              <input
                type="text"
                value={customerSearchTerm}
                onChange={(e) => {
                  setCustomerSearchTerm(e.target.value);
                  setShowCustomerDropdown(true);
                  if (e.target.value === '') setFormData((prev: any) => ({ ...prev, customerId: '' }));
                }}
                onFocus={() => setShowCustomerDropdown(true)}
                onBlur={() => setTimeout(() => setShowCustomerDropdown(false), 200)}
                placeholder="ابحث باسم العميل أو رقم الهاتف..."
                className="w-full border-2 border-slate-100 group-hover:border-slate-200 rounded-2xl px-4 py-4 text-lg font-bold focus:outline-none focus:border-blue-500 bg-slate-50 transition-all pr-12 shadow-inner"
              />
              <User className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
              {formData.customerId ? (
                <button 
                  type="button"
                  onClick={() => {
                    setFormData((prev: any) => ({ ...prev, customerId: '' }));
                    setCustomerSearchTerm('');
                  }}
                  className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-red-500"
                >
                  <X size={20} />
                </button>
              ) : (
                <ChevronDown className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300" size={20} />
              )}
            </div>

            {showCustomerDropdown && (
              <div className="absolute top-full left-0 right-0 z-50 mt-1 bg-white border border-slate-200 rounded-xl shadow-xl max-h-60 overflow-y-auto animate-in fade-in slide-in-from-top-2">
                {customers.filter(c => 
                  c.name.toLowerCase().includes(customerSearchTerm.toLowerCase()) ||
                  (c.phone && c.phone.includes(customerSearchTerm))
                ).map(c => (
                  <div 
                    key={c.id}
                    onMouseDown={() => {
                      setFormData((prev: any) => ({ ...prev, customerId: c.id }));
                      setCustomerSearchTerm(c.name);
                      setShowCustomerDropdown(false);
                    }}
                    className="p-3 hover:bg-blue-50 cursor-pointer border-b border-slate-50 last:border-0 flex justify-between items-center"
                  >
                    <div>
                      <div className="font-bold text-slate-800">{c.name}</div>
                      {c.phone && <div className="text-xs text-slate-500 font-mono">{c.phone}</div>}
                    </div>
                    {c.id === formData.customerId && <Check size={16} className="text-blue-600" />}
                  </div>
                ))}
                {customers.filter(c => c.name.toLowerCase().includes(customerSearchTerm.toLowerCase()) || (c.phone && c.phone.includes(customerSearchTerm))).length === 0 && (
                  <div className="p-4 text-center text-slate-500 text-sm">لا توجد نتائج</div>
                )}
              </div>
            )}
          </div>
          
          {/* Customer Balance & Refresh */}
          {formData.customerId && (
            <div className="mt-2 flex items-center gap-2 text-xs font-bold text-slate-500 px-1 animate-in fade-in">
              <span>الرصيد الحالي:</span>
              <span className={`font-black ${customerBalance > 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                {customerBalance.toLocaleString()}
              </span>
              <button 
                type="button" 
                onClick={handleRefreshBalance}
                disabled={isRefreshingBalance}
                className="p-1 hover:bg-slate-100 rounded-full text-blue-600 transition-colors disabled:opacity-50"
                title="تحديث الرصيد"
              >
                <RefreshCw size={14} className={isRefreshingBalance ? 'animate-spin' : ''} />
              </button>
              <button 
                type="button" 
                onClick={() => setIsStatementModalOpen(true)}
                className="p-1 hover:bg-slate-100 rounded-full text-purple-600 transition-colors"
                title="عرض كشف حساب"
              >
                <FileText size={14} />
              </button>
            </div>
          )}

          {/* تنبيه تجاوز حد الائتمان */}
          {isOverLimit && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-3 flex items-start gap-3 animate-in fade-in slide-in-from-top-2">
              <AlertCircle className="text-red-600 shrink-0 mt-0.5" size={18} />
              <div>
                <h4 className="text-sm font-bold text-red-800">تنبيه: تجاوز حد الائتمان</h4>
                <p className="text-xs text-red-600 mt-1">
                  رصيد العميل الحالي: {customerBalance.toLocaleString()} <br/>
                  حد الائتمان: {selectedCustomer?.credit_limit?.toLocaleString()} <br/>
                  الإجمالي المتوقع: <span className="font-bold">{totalProjectedDebt.toLocaleString()}</span>
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Salesperson & Warehouse & Date Selection */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-2">
            <label className="text-sm font-bold text-slate-700 flex items-center gap-2">
              <UserCheck className="text-indigo-500" size={16} /> البائع المسؤول
            </label>
            <select 
              required
              value={formData.salespersonId}
              onChange={(e) => setFormData({...formData, salespersonId: e.target.value})}
              className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:border-blue-500 outline-none bg-white"
            >
              <option value="">اختر البائع...</option>
              {salespeople.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div className="space-y-2">
            <label className="text-sm font-bold text-slate-700 flex items-center gap-2">
              <Warehouse className="text-amber-500" size={16} /> مستودع الصرف
            </label>
            <select 
              required
              value={formData.warehouseId}
              onChange={(e) => setFormData({...formData, warehouseId: e.target.value})}
              className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:border-blue-500 outline-none bg-white"
            >
              <option value="">-- اختر المستودع --</option>
              {warehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
            </select>
          </div>
          <div className="space-y-2 sm:col-span-2">
            <label className="text-sm font-bold text-slate-700 flex items-center gap-2">
              <Calendar className="text-purple-500" size={16} /> التاريخ
            </label>
            <input 
              type="date" 
              required
              value={formData.date}
              onChange={(e) => setFormData({...formData, date: e.target.value})}
              className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:border-blue-500 outline-none"
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-bold text-slate-700 flex items-center gap-2">
              <CircleDollarSign className="text-green-500" size={16} /> العملة
            </label>
            <div className="flex gap-2">
              <select 
                value={formData.currency}
                onChange={(e) => setFormData({...formData, currency: e.target.value})}
                className="w-2/3 border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:border-blue-500 outline-none bg-white"
              >
                <option value="EGP">EGP</option>
                <option value="SAR">SAR</option>
                <option value="USD">USD</option>
                <option value="EUR">EUR</option>
              </select>
              <input 
                type="number" 
                value={formData.exchangeRate}
                onChange={(e) => setFormData({...formData, exchangeRate: parseFloat(e.target.value)})}
                className="w-1/3 border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:border-blue-500 outline-none text-center"
                placeholder="سعر الصرف"
                step="0.01"
              />
            </div>
          </div>
        </div>
      </div>
      
      {/* Pricing Tier Selector - Modern Switch */}
      <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-3">
          <span className="text-xs font-black text-slate-500 uppercase tracking-wider">سياسة التسعير:</span>
          <div className="flex bg-white p-1 rounded-2xl border border-slate-200 shadow-sm">
            {[
              { id: 'retail', label: 'قطاعي', color: 'bg-indigo-600' },
              { id: 'wholesale', label: 'جملة', color: 'bg-blue-600' },
              { id: 'half', label: 'نصف جملة', color: 'bg-sky-600' }
            ].map((tier) => (
              <button
                key={tier.id}
                type="button"
                onClick={() => setPricingTier(tier.id as any)}
                className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${pricingTier === tier.id ? `${tier.color} text-white shadow-md` : 'text-slate-500 hover:bg-slate-50'}`}
              >
                {tier.label}
              </button>
            ))}
          </div>
        </div>
        
        <div className="flex items-center gap-4">
          <div className="text-sm">
            <span className="text-slate-400">تاريخ الاستحقاق:</span>
            <input 
              type="date" 
              value={formData.dueDate}
              onChange={e => setFormData({...formData, dueDate: e.target.value})}
              className="mr-2 border-b border-slate-200 bg-transparent focus:border-blue-500 outline-none font-bold text-slate-700"
            />
          </div>
        </div>
      </div>
    </div>
  );
};
export default InvoiceHeader;

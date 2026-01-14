﻿﻿﻿
import React, { useState, useEffect } from 'react';
import { useAccounting } from '../../context/AccountingContext';
import { AccountType, BudgetItem } from '../../types';
import { Save, Target, Plus, Trash2, User, Users, Package, Calculator } from 'lucide-react';

const BudgetManager = () => {
  const { accounts, budgets, saveBudget, salespeople, customers, products } = useAccounting();
  const [year, setYear] = useState(new Date().getFullYear());
  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const [items, setItems] = useState<BudgetItem[]>([]);

  const budgetableAccounts = accounts.filter(a => !a.isGroup && (a.type === AccountType.EXPENSE || a.type === AccountType.REVENUE));

  useEffect(() => {
      const existing = budgets.find(b => b.year === year && b.month === month);
      if (existing) {
          setItems(existing.items);
      } else {
          setItems([]);
      }
  }, [year, month, budgets]);

  const addItem = (type: BudgetItem['type']) => {
      setItems([...items, { type, targetId: '', target_id: '', targetName: '', target_name: '', plannedAmount: 0, planned_amount: 0 }]);
  };

  const removeItem = (idx: number) => setItems(items.filter((_, i) => i !== idx));

  const updateItem = (idx: number, field: keyof BudgetItem, val: any) => {
      const newItems = [...items];
      if (field === 'targetId') {
          const item = newItems[idx];
          let name = '';
          if (item.type === 'account') name = accounts.find(a => a.id === val)?.name || '';
          else if (item.type === 'salesperson') name = salespeople.find(s => s.id === val)?.name || '';
          else if (item.type === 'customer') name = customers.find(c => c.id === val)?.name || '';
          else if (item.type === 'product') name = products.find(p => p.id === val)?.name || '';
          newItems[idx].targetName = name;
      }
      
      // @ts-ignore
      newItems[idx][field] = val;
      // Sync snake_case properties
      if (field === 'targetId') newItems[idx].target_id = val;
      if (field === 'plannedAmount') newItems[idx].planned_amount = val;
      
      setItems(newItems);
  };

  const handleSave = (e: React.FormEvent) => {
      e.preventDefault();
      const validItems = items.filter(i => i.targetId && i.plannedAmount > 0);
      if (validItems.length === 0) return alert('الرجاء إضافة مستهدفات صحيحة');
      saveBudget({ year, month, items: validItems });
      alert('تم حفظ خطة المستهدفات بنجاح');
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <header className="flex justify-between items-center bg-white p-6 rounded-[32px] shadow-sm border border-slate-100">
        <div>
            <h2 className="text-3xl font-black text-slate-800 flex items-center gap-3">
                <Target className="text-blue-600 w-8 h-8" /> إعداد المستهدفات والموازنة
            </h2>
            <p className="text-slate-500 font-medium">تحديد مستهدفات البيع والمصاريف للمناديب والعملاء والأصناف</p>
        </div>
      </header>

      <div className="bg-white p-8 rounded-[40px] shadow-sm border border-slate-200">
          <div className="flex gap-6 mb-8 p-6 bg-slate-50 rounded-3xl border border-slate-100">
              <div className="flex-1">
                  <label className="block text-xs font-black text-slate-400 mb-2 uppercase tracking-widest">السنة</label>
                  <select value={year} onChange={e => setYear(Number(e.target.value))} className="w-full border-2 border-slate-100 rounded-2xl px-4 py-3 font-bold text-slate-700 bg-white shadow-sm appearance-none outline-none focus:border-blue-500">
                      {[2024, 2025, 2026].map(y => <option key={y} value={y}>{y}</option>)}
                  </select>
              </div>
              <div className="flex-1">
                  <label className="block text-xs font-black text-slate-400 mb-2 uppercase tracking-widest">الشهر</label>
                  <select value={month} onChange={e => setMonth(Number(e.target.value))} className="w-full border-2 border-slate-100 rounded-2xl px-4 py-3 font-bold text-slate-700 bg-white shadow-sm appearance-none outline-none focus:border-blue-500">
                      {Array.from({length: 12}, (_, i) => i + 1).map(m => (
                          <option key={m} value={m}>{new Intl.DateTimeFormat('ar-EG', {month: 'long'}).format(new Date(2024, m-1, 1))}</option>
                      ))}
                  </select>
              </div>
          </div>

          <div className="space-y-6">
              <div className="flex gap-2 mb-4">
                  <button onClick={() => addItem('salesperson')} className="flex-1 bg-indigo-50 text-indigo-700 py-3 rounded-2xl font-bold flex items-center justify-center gap-2 hover:bg-indigo-100 border border-indigo-100 transition-all"><User size={18}/> + تارجت مندوب</button>
                  <button onClick={() => addItem('customer')} className="flex-1 bg-blue-50 text-blue-700 py-3 rounded-2xl font-bold flex items-center justify-center gap-2 hover:bg-blue-100 border border-blue-100 transition-all"><Users size={18}/> + تارجت عميل</button>
                  <button onClick={() => addItem('product')} className="flex-1 bg-emerald-50 text-emerald-700 py-3 rounded-2xl font-bold flex items-center justify-center gap-2 hover:bg-emerald-100 border border-emerald-100 transition-all"><Package size={18}/> + تارجت صنف</button>
                  <button onClick={() => addItem('account')} className="flex-1 bg-slate-50 text-slate-700 py-3 rounded-2xl font-bold flex items-center justify-center gap-2 hover:bg-slate-100 border border-slate-200 transition-all"><Calculator size={18}/> + موازنة حساب</button>
              </div>

              <div className="grid grid-cols-12 gap-4 px-6 text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">
                  <div className="col-span-2">النوع</div>
                  <div className="col-span-6">الهدف / المستهدف</div>
                  <div className="col-span-3 text-center">المبلغ المخطط / الكمية</div>
                  <div className="col-span-1"></div>
              </div>

              {items.map((item, idx) => (
                  <div key={idx} className="grid grid-cols-12 gap-4 items-center bg-white border border-slate-100 p-4 rounded-3xl hover:border-blue-200 transition-all shadow-sm">
                      <div className="col-span-2">
                          <span className={`text-[10px] font-black px-3 py-1 rounded-full uppercase ${
                              item.type === 'salesperson' ? 'bg-indigo-100 text-indigo-700' :
                              item.type === 'customer' ? 'bg-blue-100 text-blue-700' :
                              item.type === 'product' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-700'
                          }`}>
                              {item.type === 'salesperson' ? 'مندوب' : item.type === 'customer' ? 'عميل' : item.type === 'product' ? 'صنف' : 'حساب'}
                          </span>
                      </div>
                      <div className="col-span-6">
                          <select 
                            value={item.targetId} 
                            onChange={e => updateItem(idx, 'targetId', e.target.value)}
                            className="w-full border-2 border-slate-50 rounded-2xl px-4 py-2 font-bold text-slate-700 outline-none focus:border-blue-500 bg-slate-50"
                          >
                              <option value="">-- اختر --</option>
                              {item.type === 'account' && budgetableAccounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                              {item.type === 'salesperson' && salespeople.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                              {item.type === 'customer' && customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                              {item.type === 'product' && products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                          </select>
                      </div>
                      <div className="col-span-3">
                          <input 
                            type="number" 
                            value={item.plannedAmount || item.planned_amount} 
                            onChange={e => updateItem(idx, 'plannedAmount', Number(e.target.value))}
                            className="w-full border-2 border-slate-50 rounded-2xl px-4 py-2 font-black text-blue-600 text-center outline-none focus:border-blue-500 bg-slate-50"
                            placeholder="0.00"
                          />
                      </div>
                      <div className="col-span-1 flex justify-center">
                          <button onClick={() => removeItem(idx)} className="p-2 text-slate-300 hover:text-red-500 transition-colors">
                              <Trash2 size={20} />
                          </button>
                      </div>
                  </div>
              ))}
              
              {items.length === 0 && (
                  <div className="py-20 text-center text-slate-400 border-2 border-dashed border-slate-100 rounded-[40px]">
                      <Target size={48} className="mx-auto mb-4 opacity-10" />
                      <p className="font-bold">ابدأ بإضافة مستهدفات جديدة لهذا الشهر</p>
                  </div>
              )}
          </div>

          <div className="mt-12 flex justify-end">
              <button 
                onClick={handleSave}
                className="bg-slate-900 text-white px-12 py-5 rounded-3xl font-black shadow-xl shadow-slate-200 hover:bg-slate-800 transition-all flex items-center gap-3"
              >
                  <Save size={24} /> حفظ خطة شهر {month} / {year}
              </button>
          </div>
      </div>
    </div>
  );
};

export default BudgetManager;

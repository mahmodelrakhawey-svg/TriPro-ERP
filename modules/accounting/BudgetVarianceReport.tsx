﻿  ﻿﻿
import React, { useMemo, useState } from 'react';
import { useAccounting } from '../../context/AccountingContext';
import { AccountType } from '../../types';
import { 
    Activity, TrendingUp, AlertCircle, Loader2, Sparkles,
    BarChart3, Info, Calendar, Filter, CheckCircle2, ArrowRight
} from 'lucide-react';
import { GoogleGenAI } from "@google/genai";

const BudgetVarianceReport = () => {
  // Fix: Added invoices to destructuring to calculate actuals for non-account budget items
  const { budgets, getAccountBalanceInPeriod, accounts, invoices, settings } = useAccounting();
  const [year, setYear] = useState(new Date().getFullYear());
  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const [aiReport, setAiReport] = useState('');
  const [isAiLoading, setIsAiLoading] = useState(false);

  const activeBudget = useMemo(() => {
      return budgets.find(b => b.year === year && b.month === month);
  }, [year, month, budgets]);

  const reportData = useMemo(() => {
      if (!activeBudget) return [];

      const startDate = new Date(year, month - 1, 1).toISOString().split('T')[0];
      const endDate = new Date(year, month, 0).toISOString().split('T')[0];

      // Need periodInvoices for non-account types (salesperson, customer, product)
      const periodInvoices = invoices.filter(inv => inv.date >= startDate && inv.date <= endDate && inv.status !== 'draft');

      return activeBudget.items.map(item => {
          let actual = 0;
          
          /* Fix: Calculate actuals based on the type of budget item (Account vs Sales/Product/Customer) and use targetId instead of non-existent accountId */
          if (item.type === 'account') {
              actual = Math.abs(getAccountBalanceInPeriod(item.targetId || item.target_id || '', startDate, endDate));
          } else if (item.type === 'salesperson') {
              actual = periodInvoices.filter(inv => inv.salespersonId === (item.targetId || item.target_id)).reduce((s, inv) => s + inv.totalAmount, 0);
          } else if (item.type === 'customer') {
              actual = periodInvoices.filter(inv => (inv.customerId || inv.customer_id) === (item.targetId || item.target_id)).reduce((s, inv) => s + inv.totalAmount, 0);
          } else if (item.type === 'product') {
              actual = periodInvoices.reduce((s, inv) => {
                  const line = inv.items.find(i => i.productId === (item.targetId || item.target_id));
                  return s + (line ? line.quantity : 0);
              }, 0);
          }

          const planned = item.plannedAmount || item.planned_amount || 0;
          const variance = planned - actual;
          const pct = planned > 0 ? (actual / planned) * 100 : 0;
          
          return {
              ...item,
              actual,
              variance,
              pct: Math.min(100, pct),
              rawPct: pct,
              status: pct > 100 ? 'danger' : pct > 85 ? 'warning' : 'success'
          };
      });
  }, [activeBudget, getAccountBalanceInPeriod, invoices, year, month]);

  const handleAiVarianceAnalysis = async () => {
      if (reportData.length === 0) return;
      setIsAiLoading(true);
      try {
          const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
          // Fix: Use targetName instead of non-existent accountName (Line 50)
          const summaryText = reportData.map(r => 
              `- ${r.type === 'account' ? 'الحساب' : 'المستهدف'}: ${r.targetName || r.target_name} | المخطط: ${r.plannedAmount || r.planned_amount} | الفعلي: ${r.actual} | الانحراف: ${r.variance}`
          ).join('\n');

          const prompt = `أنت خبير مراقبة تكاليف وأداء. حلل تقرير انحرافات الموازنة والمستهدفات التالي لشهر ${month}/${year} وقدم 3 نصائح عملية لتحسين الأداء المالي باللغة العربية:\n${summaryText}`;

          const response = await ai.models.generateContent({
              model: 'gemini-3-flash-preview',
              contents: prompt
          });
          setAiReport(response.text || '');
      } catch (e) {
          setAiReport('فشل الاتصال بـ Gemini AI. يرجى مراجعة الإعدادات.');
      } finally {
          setIsAiLoading(false);
      }
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <header className="flex flex-col md:flex-row justify-between items-end gap-6 bg-white p-8 rounded-[40px] shadow-sm border border-slate-100">
        <div>
            <h2 className="text-3xl font-black text-slate-900 tracking-tight flex items-center gap-3">
                <BarChart3 className="text-blue-600 w-8 h-8" /> متابعة انحرافات الموازنة
            </h2>
            <p className="text-slate-500 font-medium">مقارنة الأداء الفعلي بالمخطط له وتحليل فروقات المصاريف</p>
        </div>
        <div className="flex gap-4">
            <select value={year} onChange={e => setYear(Number(e.target.value))} className="bg-slate-50 border border-slate-200 rounded-2xl px-4 py-2 font-bold text-slate-700 outline-none">
                {[2024, 2025, 2026].map(y => <option key={y} value={y}>{y}</option>)}
            </select>
            <select value={month} onChange={e => setMonth(Number(e.target.value))} className="bg-slate-50 border border-slate-200 rounded-2xl px-4 py-2 font-bold text-slate-700 outline-none">
                {Array.from({length: 12}, (_, i) => i + 1).map(m => <option key={m} value={m}>{m}</option>)}
            </select>
        </div>
      </header>

      {!activeBudget ? (
          <div className="bg-amber-50 p-20 rounded-[40px] text-center border border-amber-100">
              <AlertCircle className="w-16 h-16 text-amber-500 mx-auto mb-4" />
              <h3 className="text-2xl font-black text-amber-900">لا توجد موازنة معتمدة لهذا الشهر</h3>
              <p className="text-amber-700 font-medium mt-2">يرجى الانتقال لشاشة إعداد الموازنة لتحديد الأهداف أولاً.</p>
          </div>
      ) : (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
              <div className="lg:col-span-8 space-y-4">
                  {reportData.map((item, idx) => (
                      <div key={idx} className="bg-white p-6 rounded-[32px] border border-slate-200 shadow-sm hover:shadow-md transition-all group relative overflow-hidden">
                          <div className={`absolute top-0 right-0 w-2 h-full ${item.status === 'danger' ? 'bg-red-500' : item.status === 'warning' ? 'bg-amber-500' : 'bg-emerald-500'}`}></div>
                          <div className="flex justify-between items-start mb-4">
                              <div>
                                  {/* Fix: Use targetName instead of non-existent accountName (Line 100) */}
                                  <h4 className="text-xl font-black text-slate-800">{item.targetName || item.target_name}</h4>
                                  <p className="text-xs font-bold text-slate-400 mt-1 uppercase">
                                      {item.type === 'account' ? 'موازنة حساب' : item.type === 'salesperson' ? 'تارجت مندوب' : item.type === 'customer' ? 'تارجت عميل' : 'تارجت صنف'} - شهر {month}/{year}
                                  </p>
                              </div>
                              <div className="text-left">
                                  <span className={`text-sm font-black px-3 py-1 rounded-full uppercase tracking-tighter ${
                                      item.status === 'danger' ? 'bg-red-50 text-red-600' : 
                                      item.status === 'warning' ? 'bg-amber-50 text-amber-600' : 
                                      'bg-emerald-50 text-emerald-600'
                                  }`}>
                                      {item.rawPct.toFixed(0)}%
                                  </span>
                              </div>
                          </div>

                          <div className="grid grid-cols-3 gap-4 mb-6">
                              <div className="bg-slate-50 p-3 rounded-2xl border border-slate-100 text-center">
                                  <p className="text-[10px] font-black text-slate-400 uppercase mb-1">المخطط (Target)</p>
                                  <p className="text-lg font-black text-slate-700">{(item.plannedAmount || item.planned_amount || 0).toLocaleString()}</p>
                              </div>
                              <div className="bg-slate-50 p-3 rounded-2xl border border-slate-100 text-center">
                                  <p className="text-[10px] font-black text-slate-400 uppercase mb-1">الفعلي (Actual)</p>
                                  <p className="text-lg font-black text-blue-600">{item.actual.toLocaleString()}</p>
                              </div>
                              <div className={`${item.variance >= 0 ? 'bg-emerald-50 border-emerald-100 text-emerald-700' : 'bg-red-50 border-red-100 text-red-700'} p-3 rounded-2xl border text-center`}>
                                  <p className="text-[10px] font-black opacity-60 uppercase mb-1">{item.variance >= 0 ? 'الوفر المتبقي' : 'تجاوز الميزانية'}</p>
                                  <p className="text-lg font-black">{Math.abs(item.variance).toLocaleString()}</p>
                              </div>
                          </div>

                          <div className="relative pt-1">
                              <div className="flex mb-2 items-center justify-between">
                                  <div>
                                      <span className="text-xs font-black inline-block py-1 px-2 uppercase rounded-full text-slate-600 bg-slate-100">مؤشر التقدم</span>
                                  </div>
                                  <div className="text-right">
                                      <span className="text-xs font-black inline-block text-slate-600">{item.rawPct.toFixed(1)}%</span>
                                  </div>
                              </div>
                              <div className="overflow-hidden h-3 mb-2 text-xs flex rounded-full bg-slate-100">
                                  <div style={{ width: `${item.pct}%` }} className={`shadow-none flex flex-col text-center whitespace-nowrap text-white justify-center transition-all duration-1000 ${
                                      item.status === 'danger' ? 'bg-red-500' : item.status === 'warning' ? 'bg-amber-500' : 'bg-emerald-500'
                                  }`}></div>
                              </div>
                          </div>
                      </div>
                  ))}
              </div>

              <div className="lg:col-span-4 space-y-6">
                  <div className="bg-slate-900 rounded-[40px] p-8 text-white shadow-2xl sticky top-6 overflow-hidden">
                      <div className="absolute top-0 right-0 w-32 h-32 bg-blue-500/20 rounded-bl-full -mr-16 -mt-16"></div>
                      <h3 className="text-xl font-black mb-6 flex items-center gap-3">
                          <Sparkles className="text-blue-400" /> تحليل الفروقات (AI)
                      </h3>
                      <p className="text-slate-400 text-sm font-medium leading-relaxed mb-8">
                          استخدم الذكاء الاصطناعي لتحليل الانحرافات بين الإنفاق الفعلي والمخطط وتقديم توصيات لضبط التكاليف التشغيلية.
                      </p>
                      
                      <button 
                        onClick={handleAiVarianceAnalysis}
                        disabled={isAiLoading}
                        className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white py-4 rounded-3xl font-black flex items-center justify-center gap-3 transition-all shadow-xl shadow-blue-900/40"
                      >
                          {isAiLoading ? <Loader2 className="animate-spin" /> : <Activity size={20} />}
                          طلب تحليل Gemini
                      </button>

                      {aiReport && (
                          <div className="mt-8 pt-8 border-t border-white/10 animate-in fade-in slide-in-from-bottom-2">
                              <div className="text-blue-50 font-medium leading-loose text-sm whitespace-pre-wrap">
                                  {aiReport}
                              </div>
                          </div>
                      )}
                  </div>

                  <div className="bg-blue-50 p-8 rounded-[40px] border border-blue-100">
                      <h4 className="font-black text-blue-900 text-sm mb-4 flex items-center gap-2">
                          <Info size={18} /> ملاحظة محاسبية
                      </h4>
                      <p className="text-blue-700/70 text-xs leading-loose font-bold">
                          يتم حساب الأرقام الفعلية بناءً على تاريخ القيود المكتملة (Posted) فقط خلال الشهر المختار. لا تدخل مسودات القيود في هذا التقرير.
                      </p>
                  </div>
              </div>
          </div>
      )}
    </div>
  );
};

export default BudgetVarianceReport;

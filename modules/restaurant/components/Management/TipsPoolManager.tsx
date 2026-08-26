import React, { useState, useEffect } from 'react';
import { useAccounting } from '../../../../context/AccountingContext';
import { useToast } from '../../../../context/ToastContext';
import {
  StaffTipShare,
  TipsDistributionRecord,
  tipsPoolService
} from '../../../../services/tipsPoolService';
import {
  Coins,
  Users,
  Utensils,
  ChefHat,
  Calculator,
  Save,
  CheckCircle2,
  DollarSign,
  PieChart,
  FileSpreadsheet,
  RefreshCw,
  Sparkles
} from 'lucide-react';

export const TipsPoolManager: React.FC = () => {
  const { employees, currentUser } = useAccounting();
  const { showToast } = useToast();

  const [totalTipsInput, setTotalTipsInput] = useState<number>(1500);
  const [floorPct, setFloorPct] = useState<number>(60);
  const [kitchenPct, setKitchenPct] = useState<number>(40);

  // Sample staff list based on system employees or default
  const [staff, setStaff] = useState<Array<{
    id: string;
    name: string;
    role: 'WAITER' | 'RUNNER' | 'CHEF' | 'BARISTA' | 'HOST';
    category: 'FLOOR' | 'KITCHEN';
    hoursWorked: number;
    pointsWeight: number;
  }>>([]);

  const [calculatedShares, setCalculatedShares] = useState<StaffTipShare[]>([]);
  const [historyRecords, setHistoryRecords] = useState<TipsDistributionRecord[]>([]);

  useEffect(() => {
    // Populate staff from employees
    if (employees && employees.length > 0) {
      const mapped = employees.slice(0, 10).map((emp, i) => {
        const isKitchen = i % 2 === 0;
        return {
          id: emp.id,
          name: emp.name || `موظف ${i + 1}`,
          role: isKitchen ? ('CHEF' as const) : ('WAITER' as const),
          category: isKitchen ? ('KITCHEN' as const) : ('FLOOR' as const),
          hoursWorked: 8,
          pointsWeight: 1
        };
      });
      setStaff(mapped);
    } else {
      // Default demo staff
      setStaff([
        { id: 'st1', name: 'أحمد محمود (كابتن صالة)', role: 'WAITER', category: 'FLOOR', hoursWorked: 8, pointsWeight: 1.2 },
        { id: 'st2', name: 'مصطفى علي (ويتر)', role: 'WAITER', category: 'FLOOR', hoursWorked: 8, pointsWeight: 1 },
        { id: 'st3', name: 'كريم حسن (مساعد صالة Runner)', role: 'RUNNER', category: 'FLOOR', hoursWorked: 6, pointsWeight: 0.8 },
        { id: 'st4', name: 'شيف طارق (رئيس المطبخ)', role: 'CHEF', category: 'KITCHEN', hoursWorked: 8, pointsWeight: 1.5 },
        { id: 'st5', name: 'شيف سامح (مساعد طاهي)', role: 'CHEF', category: 'KITCHEN', hoursWorked: 8, pointsWeight: 1 },
        { id: 'st6', name: 'عمر خالد (باريستا)', role: 'BARISTA', category: 'KITCHEN', hoursWorked: 7, pointsWeight: 1 }
      ]);
    }

    setHistoryRecords(tipsPoolService.getRecords(currentUser?.organization_id || undefined));
  }, [employees, currentUser]);

  useEffect(() => {
    if (staff.length > 0) {
      const shares = tipsPoolService.calculateDistribution({
        totalTips: totalTipsInput,
        floorSharePct: floorPct,
        kitchenSharePct: kitchenPct,
        staffList: staff
      });
      setCalculatedShares(shares);
    }
  }, [totalTipsInput, floorPct, kitchenPct, staff]);

  const handleUpdateHours = (staffId: string, hours: number) => {
    setStaff(prev => prev.map(s => (s.id === staffId ? { ...s, hoursWorked: Math.max(0, hours) } : s)));
  };

  const handleUpdatePoints = (staffId: string, points: number) => {
    setStaff(prev => prev.map(s => (s.id === staffId ? { ...s, pointsWeight: Math.max(0.1, points) } : s)));
  };

  const handleSaveDistribution = () => {
    if (totalTipsInput <= 0) {
      showToast('يرجى تحديد إجمالي مبلغ التبس', 'warning');
      return;
    }

    const rec = tipsPoolService.saveDistribution({
      organization_id: currentUser?.organization_id || null,
      period_start: new Date().toISOString(),
      period_end: new Date().toISOString(),
      total_tips_collected: totalTipsInput,
      floor_share_pct: floorPct,
      kitchen_share_pct: kitchenPct,
      total_floor_amount: (totalTipsInput * floorPct) / 100,
      total_kitchen_amount: (totalTipsInput * kitchenPct) / 100,
      staff_shares: calculatedShares,
      status: 'DISTRIBUTED'
    });

    showToast('تم اعتماد وحفظ كشف توزيع التبس بنجاح 🎉', 'success');
    setHistoryRecords(tipsPoolService.getRecords(currentUser?.organization_id || undefined));
  };

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-7xl mx-auto animate-in fade-in">
      {/* Header */}
      <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm flex flex-wrap justify-between items-center gap-4">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-gradient-to-br from-amber-500 to-yellow-600 rounded-2xl text-white shadow-md">
            <Coins className="w-8 h-8" />
          </div>
          <div>
            <h2 className="text-2xl font-black text-slate-800">مجمع وتوزيع التبس والإكراميات (Tips Pooling)</h2>
            <p className="text-xs text-slate-500 mt-1">
              حساب مجمع خدمة وإكراميات الوردية وتوزيعها آلياً بنسب عادلة بين طاقم الصالة (Floor) والمطبخ (Kitchen)
            </p>
          </div>
        </div>

        <button
          onClick={handleSaveDistribution}
          className="px-6 py-2.5 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-bold flex items-center gap-2 shadow-lg shadow-amber-600/20 transition"
        >
          <Save className="w-4 h-4" /> اعتماد وتوزيع التبس
        </button>
      </div>

      {/* Control Configuration Bar */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Total Tips Input */}
        <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-sm space-y-2">
          <span className="text-xs font-bold text-slate-500 flex items-center gap-1.5">
            <Coins className="w-4 h-4 text-amber-500" /> إجمالي مجمع التبس المحصل
          </span>
          <div className="flex items-center gap-2">
            <input
              type="number"
              min="0"
              step="10"
              value={totalTipsInput}
              onChange={e => setTotalTipsInput(parseFloat(e.target.value) || 0)}
              className="w-full text-2xl font-black text-amber-600 font-mono border rounded-2xl p-2.5 text-center outline-none focus:ring-2 focus:ring-amber-500"
            />
            <span className="font-bold text-slate-600 text-sm">ج.م</span>
          </div>
        </div>

        {/* Floor Share Ratio */}
        <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-sm space-y-2">
          <div className="flex justify-between items-center text-xs font-bold text-slate-500">
            <span className="flex items-center gap-1.5">
              <Users className="w-4 h-4 text-indigo-500" /> نصيب طاقم الصالة (Floor)
            </span>
            <span className="text-indigo-600 font-black font-mono text-sm">{floorPct}%</span>
          </div>
          <input
            type="range"
            min="0"
            max="100"
            value={floorPct}
            onChange={e => {
              const val = parseInt(e.target.value);
              setFloorPct(val);
              setKitchenPct(100 - val);
            }}
            className="w-full accent-indigo-600 cursor-pointer"
          />
          <div className="flex justify-between text-xs text-slate-600 font-mono font-bold">
            <span>المبلغ المخصص:</span>
            <span className="text-indigo-600">{((totalTipsInput * floorPct) / 100).toFixed(2)} ج</span>
          </div>
        </div>

        {/* Kitchen Share Ratio */}
        <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-sm space-y-2">
          <div className="flex justify-between items-center text-xs font-bold text-slate-500">
            <span className="flex items-center gap-1.5">
              <ChefHat className="w-4 h-4 text-rose-500" /> نصيب طاقم المطبخ (Kitchen)
            </span>
            <span className="text-rose-600 font-black font-mono text-sm">{kitchenPct}%</span>
          </div>
          <input
            type="range"
            min="0"
            max="100"
            value={kitchenPct}
            onChange={e => {
              const val = parseInt(e.target.value);
              setKitchenPct(val);
              setFloorPct(100 - val);
            }}
            className="w-full accent-rose-600 cursor-pointer"
          />
          <div className="flex justify-between text-xs text-slate-600 font-mono font-bold">
            <span>المبلغ المخصص:</span>
            <span className="text-rose-600">{((totalTipsInput * kitchenPct) / 100).toFixed(2)} ج</span>
          </div>
        </div>
      </div>

      {/* Staff Breakdown Table */}
      <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-slate-100 bg-slate-50 flex justify-between items-center">
          <h3 className="font-bold text-sm text-slate-800 flex items-center gap-2">
            <Users className="w-4 h-4 text-slate-600" /> جدول استحقاق أفراد الطاقم ({calculatedShares.length} موظف)
          </h3>
          <span className="text-xs text-slate-400 font-medium">يتم الحساب تلقائياً بناءً على ساعات العمل وأوزان النقاط</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-right text-xs">
            <thead className="bg-slate-50 text-slate-500 font-bold border-b border-slate-100">
              <tr>
                <th className="p-3.5">اسم الموظف</th>
                <th className="p-3.5 text-center">القسم</th>
                <th className="p-3.5 text-center">الوظيفة</th>
                <th className="p-3.5 text-center">ساعات العمل</th>
                <th className="p-3.5 text-center">وزن النقاط</th>
                <th className="p-3.5 text-left font-black text-amber-700">المبلغ المستحق من التبس</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {calculatedShares.map((share, idx) => (
                <tr key={share.employee_id || idx} className="hover:bg-slate-50 transition">
                  <td className="p-3.5 font-bold text-slate-800">{share.employee_name}</td>
                  <td className="p-3.5 text-center">
                    <span
                      className={`px-2.5 py-1 rounded-full text-[10px] font-bold ${
                        share.category === 'FLOOR' ? 'bg-indigo-100 text-indigo-800' : 'bg-rose-100 text-rose-800'
                      }`}
                    >
                      {share.category === 'FLOOR' ? 'صالة' : 'مطبخ'}
                    </span>
                  </td>
                  <td className="p-3.5 text-center text-slate-500 font-mono">{share.role}</td>
                  <td className="p-3.5 text-center">
                    <input
                      type="number"
                      min="1"
                      max="24"
                      value={share.hours_worked}
                      onChange={e => handleUpdateHours(share.employee_id, parseFloat(e.target.value) || 0)}
                      className="w-16 border rounded-lg p-1 text-center font-bold outline-none focus:ring-1 focus:ring-amber-500"
                    />
                  </td>
                  <td className="p-3.5 text-center">
                    <input
                      type="number"
                      min="0.1"
                      step="0.1"
                      value={share.points_weight}
                      onChange={e => handleUpdatePoints(share.employee_id, parseFloat(e.target.value) || 1)}
                      className="w-16 border rounded-lg p-1 text-center font-bold outline-none focus:ring-1 focus:ring-amber-500"
                    />
                  </td>
                  <td className="p-3.5 text-left font-black text-sm font-mono text-emerald-600">
                    {share.tip_amount_earned.toFixed(2)} ج
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
export default TipsPoolManager;

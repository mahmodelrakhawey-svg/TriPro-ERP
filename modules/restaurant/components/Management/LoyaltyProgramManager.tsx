import React, { useState, useEffect } from 'react';
import {
  LoyaltyConfig,
  CustomerLoyaltyAccount,
  loyaltyService,
  DEFAULT_LOYALTY_CONFIG
} from '../../../../services/loyaltyService';
import { useToast } from '../../../../context/ToastContext';
import {
  Gift,
  Award,
  Wallet,
  Coins,
  Users,
  Settings2,
  TrendingUp,
  Search,
  Sparkles,
  ShieldCheck,
  ChevronRight,
  RefreshCw,
  Plus
} from 'lucide-react';

export const LoyaltyProgramManager: React.FC = () => {
  const { showToast } = useToast();
  const [config, setConfig] = useState<LoyaltyConfig>(DEFAULT_LOYALTY_CONFIG);
  const [accounts, setAccounts] = useState<CustomerLoyaltyAccount[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [activeTab, setActiveTab] = useState<'leaderboard' | 'settings'>('leaderboard');
  const [isSaving, setIsSaving] = useState(false);

  const loadData = () => {
    setConfig(loyaltyService.getConfig());
    setAccounts(loyaltyService.getAccounts());
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleSaveConfig = (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      loyaltyService.saveConfig(config);
      showToast('تم حفظ إعدادات برنامج الولاء والمحفظة بنجاح 🎯', 'success');
    } catch (err: any) {
      showToast('خطأ: ' + err.message, 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const filteredAccounts = accounts.filter(
    a =>
      a.customerName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      a.customerPhone.includes(searchTerm)
  );

  const totalPointsInCirculation = accounts.reduce((sum, a) => sum + a.currentPointsBalance, 0);
  const totalWalletsValue = accounts.reduce((sum, a) => sum + a.walletBalance, 0);

  const getTierBadge = (tier: string) => {
    switch (tier) {
      case 'PLATINUM':
        return <span className="px-2.5 py-1 rounded-full text-xs font-black bg-purple-100 text-purple-800 flex items-center gap-1">💎 بلاتيني</span>;
      case 'GOLD':
        return <span className="px-2.5 py-1 rounded-full text-xs font-black bg-amber-100 text-amber-800 flex items-center gap-1">🥇 ذهبي</span>;
      case 'SILVER':
        return <span className="px-2.5 py-1 rounded-full text-xs font-black bg-slate-200 text-slate-700 flex items-center gap-1">🥈 فضي</span>;
      default:
        return <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-amber-50 text-amber-900 flex items-center gap-1">🥉 برونزي</span>;
    }
  };

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-7xl mx-auto animate-in fade-in">
      {/* Header */}
      <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm flex flex-wrap justify-between items-center gap-4">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-gradient-to-br from-purple-600 to-indigo-700 rounded-2xl text-white shadow-md">
            <Gift className="w-8 h-8" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-2xl font-black text-slate-800">برنامج ولاء العملاء والمحفظة الرقمية (Loyalty & Wallet)</h2>
              <span className="bg-purple-100 text-purple-800 text-xs px-2.5 py-0.5 rounded-full font-bold">
                Guest Retention
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-1">
              مكافأة العملاء بنقاط شراء تلقائية، كاش باك في المحفظة، وخصومات تصاعدية لزيادة تكرار زيارات الصالة
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setActiveTab(activeTab === 'leaderboard' ? 'settings' : 'leaderboard')}
            className="px-4 py-2.5 border border-slate-200 text-slate-700 hover:bg-slate-50 rounded-xl text-xs font-bold flex items-center gap-2 transition"
          >
            <Settings2 className="w-4 h-4 text-purple-600" />
            {activeTab === 'leaderboard' ? 'إعدادات وقواعد النقاط' : 'لوحة كبار العملاء'}
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-sm">
          <div className="flex justify-between items-center mb-1">
            <span className="text-xs font-bold text-slate-500">إجمالي العملاء المسجلين</span>
            <Users className="w-4 h-4 text-purple-600" />
          </div>
          <span className="text-3xl font-black text-slate-800 font-mono">{accounts.length}</span>
          <span className="text-xs text-slate-400 block mt-1">مشتركون في نظام المكافآت</span>
        </div>

        <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-sm">
          <div className="flex justify-between items-center mb-1">
            <span className="text-xs font-bold text-slate-500">النقاط المتداولة الحالية</span>
            <Coins className="w-4 h-4 text-amber-500" />
          </div>
          <span className="text-3xl font-black text-amber-600 font-mono">
            {totalPointsInCirculation.toLocaleString()}
          </span>
          <span className="text-xs text-slate-400 block mt-1">
            قيمتها المالية: {(totalPointsInCirculation * config.pointRedemptionValue).toFixed(2)} ج
          </span>
        </div>

        <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-sm">
          <div className="flex justify-between items-center mb-1">
            <span className="text-xs font-bold text-slate-500">أرصدة المحافظ الرقمية (Cashback)</span>
            <Wallet className="w-4 h-4 text-emerald-600" />
          </div>
          <span className="text-3xl font-black text-emerald-600 font-mono">
            {totalWalletsValue.toFixed(2)} ج
          </span>
          <span className="text-xs text-slate-400 block mt-1">رصيد جاهز للاستخدام في نقاط البيع</span>
        </div>
      </div>

      {activeTab === 'leaderboard' ? (
        /* Leaderboard Tab */
        <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden space-y-4 p-5">
          <div className="flex flex-wrap justify-between items-center gap-3">
            <div className="relative flex-1 max-w-md">
              <Search className="w-4 h-4 absolute right-3.5 top-3 text-slate-400" />
              <input
                type="text"
                placeholder="ابحث باسم العميل أو رقم الموبايل..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="w-full pl-4 pr-10 py-2 border rounded-xl text-xs outline-none focus:ring-1 focus:ring-purple-500"
              />
            </div>

            <button
              onClick={loadData}
              className="p-2 border rounded-xl text-slate-500 hover:bg-slate-50 text-xs flex items-center gap-1"
            >
              <RefreshCw className="w-3.5 h-3.5" /> تحديث
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-right text-xs">
              <thead className="bg-slate-50 text-slate-500 font-bold border-b border-slate-100">
                <tr>
                  <th className="p-3.5">العميل</th>
                  <th className="p-3.5 text-center">المستوى (Tier)</th>
                  <th className="p-3.5 text-center">النقاط المتاحة</th>
                  <th className="p-3.5 text-center">رصيد المحفظة</th>
                  <th className="p-3.5 text-center">عدد الزيارات</th>
                  <th className="p-3.5 text-left">إجمالي الإنفاق</th>
                  <th className="p-3.5 text-center">آخر زيارة</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-mono">
                {filteredAccounts.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="p-12 text-center text-slate-400 font-sans">
                      لا توجد بيانات عملاء مسجلة حالياً
                    </td>
                  </tr>
                ) : (
                  filteredAccounts.map(acc => (
                    <tr key={acc.customerId} className="hover:bg-slate-50 transition">
                      <td className="p-3.5 font-sans">
                        <span className="font-bold text-slate-800 text-sm block">{acc.customerName}</span>
                        <span className="text-[11px] text-slate-400">{acc.customerPhone}</span>
                      </td>
                      <td className="p-3.5 text-center font-sans">
                        {getTierBadge(acc.tier)}
                      </td>
                      <td className="p-3.5 text-center font-bold text-amber-600 text-sm">
                        ⭐ {acc.currentPointsBalance}
                      </td>
                      <td className="p-3.5 text-center font-bold text-emerald-600 text-sm">
                        💳 {acc.walletBalance.toFixed(2)} ج
                      </td>
                      <td className="p-3.5 text-center font-bold text-slate-700 font-sans">
                        {acc.totalVisits} زيارة
                      </td>
                      <td className="p-3.5 text-left font-black text-slate-800 text-sm">
                        {acc.totalSpent.toFixed(2)} ج
                      </td>
                      <td className="p-3.5 text-center text-slate-400 text-[11px]">
                        {acc.lastVisitDate || '-'}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        /* Settings Tab */
        <form onSubmit={handleSaveConfig} className="bg-white rounded-3xl border border-slate-200 p-6 shadow-sm space-y-6">
          <div className="border-b pb-3">
            <h3 className="font-bold text-base text-slate-800">قواعد احتساب النقاط والكاش باك</h3>
            <p className="text-xs text-slate-400">حدد معدل تراكم النقاط وقيمة الخصم عند الاستبدال</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
            <div>
              <label className="block font-bold text-slate-700 mb-1">النقاط المكتسبة لكل 100 جنيه إنفاق:</label>
              <input
                type="number"
                value={config.pointsPer100Currency}
                onChange={e => setConfig({ ...config, pointsPer100Currency: Number(e.target.value) })}
                className="w-full border rounded-xl p-2.5 font-mono"
              />
              <span className="text-[11px] text-slate-400 mt-1 block">مثال: 10 نقاط لكل 100 جنيه</span>
            </div>

            <div>
              <label className="block font-bold text-slate-700 mb-1">قيمة النقطة الواحدة بالجنيه عند الاستبدال:</label>
              <input
                type="number"
                step="0.01"
                value={config.pointRedemptionValue}
                onChange={e => setConfig({ ...config, pointRedemptionValue: Number(e.target.value) })}
                className="w-full border rounded-xl p-2.5 font-mono"
              />
              <span className="text-[11px] text-slate-400 mt-1 block">مثال: 0.10 ج (كل 100 نقطة = 10 ج خصم)</span>
            </div>

            <div>
              <label className="block font-bold text-slate-700 mb-1">نسبة الكاش باك في المحفظة (%):</label>
              <input
                type="number"
                step="0.5"
                value={config.cashbackPercentage}
                onChange={e => setConfig({ ...config, cashbackPercentage: Number(e.target.value) })}
                className="w-full border rounded-xl p-2.5 font-mono"
              />
              <span className="text-[11px] text-slate-400 mt-1 block">تضاف تلقائياً لرصيد المحفظة النقدية للعميل</span>
            </div>
          </div>

          <div className="border-t pt-4 space-y-3">
            <h4 className="font-bold text-xs text-slate-700">مستويات العضوية التنافسية (Tiers & Perks):</h4>
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 text-xs">
              <div className="p-3 rounded-2xl bg-amber-50/50 border border-amber-200">
                <span className="font-bold text-amber-900 block mb-1">🥉 البرونزي (Bronze)</span>
                <span className="text-[11px] text-slate-500">من 0 نقطة (خصم 0%)</span>
              </div>
              <div className="p-3 rounded-2xl bg-slate-50 border border-slate-200">
                <span className="font-bold text-slate-800 block mb-1">🥈 الفضي (Silver)</span>
                <span className="text-[11px] text-slate-500">من {config.tierPerks.SILVER.minPoints} نقطة (خصم 5%)</span>
              </div>
              <div className="p-3 rounded-2xl bg-amber-50 border border-amber-300">
                <span className="font-bold text-amber-800 block mb-1">🥇 الذهبي (Gold)</span>
                <span className="text-[11px] text-slate-500">من {config.tierPerks.GOLD.minPoints} نقطة (خصم 10%)</span>
              </div>
              <div className="p-3 rounded-2xl bg-purple-50 border border-purple-200">
                <span className="font-bold text-purple-900 block mb-1">💎 البلاتيني (Platinum)</span>
                <span className="text-[11px] text-slate-500">من {config.tierPerks.PLATINUM.minPoints} نقطة (خصم 15%)</span>
              </div>
            </div>
          </div>

          <div className="flex justify-end pt-4 border-t">
            <button
              type="submit"
              disabled={isSaving}
              className="px-6 py-2.5 bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-xs font-bold flex items-center gap-2 shadow-lg shadow-purple-600/20 transition"
            >
              <ShieldCheck className="w-4 h-4" /> حفظ القواعد والتحديث
            </button>
          </div>
        </form>
      )}
    </div>
  );
};
export default LoyaltyProgramManager;

import React, { useState, useEffect } from 'react';
import { supabase } from '../../../supabaseClient';
import { useAccounting } from '../../../context/AccountingContext';
import { useToast } from '../../../context/ToastContext';
import { 
  CreditCard, 
  ShieldCheck, 
  Save, 
  RefreshCw, 
  Key, 
  Building2, 
  CheckCircle2, 
  Globe, 
  Percent, 
  Smartphone,
  ExternalLink,
  Zap
} from 'lucide-react';
import { PaymentGateway, PaymentGatewayConfig } from '../../../services/paymentGatewayService';

export const PaymentGatewaySettings: React.FC = () => {
  const { accounts, currentUser } = useAccounting();
  const { showToast } = useToast();
  const [activeTab, setActiveTab] = useState<'paymob' | 'fawry' | 'stripe'>('paymob');
  const [loading, setLoading] = useState<boolean>(true);
  const [saving, setSaving] = useState<boolean>(false);

  const orgId = (currentUser as any)?.organization_id;

  const [configs, setConfigs] = useState<Record<string, PaymentGatewayConfig>>({
    paymob: {
      organization_id: orgId || '',
      provider: 'paymob',
      is_enabled: false,
      api_key: '',
      secret_key: '',
      merchant_id: '',
      integration_id: '',
      iframe_id: '',
      bank_account_id: '',
      commission_rate: 2.75,
      test_mode: true
    },
    fawry: {
      organization_id: orgId || '',
      provider: 'fawry',
      is_enabled: false,
      merchant_id: '',
      secret_key: '',
      bank_account_id: '',
      commission_rate: 2.0,
      test_mode: true
    },
    stripe: {
      organization_id: orgId || '',
      provider: 'stripe',
      is_enabled: false,
      api_key: '',
      secret_key: '',
      bank_account_id: '',
      commission_rate: 2.9,
      test_mode: true
    }
  });

  const fetchConfigs = async () => {
    if (!orgId) return;
    setLoading(true);
    try {
      const data = await PaymentGateway.getSettings(orgId);
      const newConfigs = { ...configs };
      data.forEach(cfg => {
        newConfigs[cfg.provider] = {
          ...newConfigs[cfg.provider],
          ...cfg
        };
      });
      setConfigs(newConfigs);
    } catch (err: any) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchConfigs();
  }, [orgId]);

  const handleSave = async () => {
    if (!orgId) return;
    setSaving(true);
    try {
      const currentConfig = {
        ...configs[activeTab],
        organization_id: orgId
      };
      const res = await PaymentGateway.saveSettings(currentConfig);
      if (res.success) {
        showToast(`تم حفظ إعدادات بوابة (${activeTab.toUpperCase()}) بنجاح ✅`, 'success');
        await fetchConfigs();
      } else {
        throw new Error(res.error);
      }
    } catch (err: any) {
      showToast('فشل حفظ الإعدادات: ' + err.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const current = configs[activeTab];
  const bankAccounts = accounts.filter(a => !a.isGroup && (a.code.startsWith('102') || a.code.startsWith('1232') || a.code.startsWith('123')));

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6" dir="rtl">
      {/* Header */}
      <div className="bg-gradient-to-r from-slate-900 via-blue-950 to-slate-900 text-white rounded-2xl p-6 shadow-xl border border-blue-900/50 flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-2xl bg-blue-600/30 border border-blue-400/30 flex items-center justify-center text-blue-300">
            <CreditCard size={28} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-black">إعدادات بوابات الدفع الإلكتروني (Online Gateways)</h1>
              <span className="bg-emerald-500/20 text-emerald-300 text-xs px-2.5 py-1 rounded-full font-bold border border-emerald-400/30 flex items-center gap-1">
                <Zap size={14} /> تحصيل فوري آلي
              </span>
            </div>
            <p className="text-slate-300 text-sm mt-1">
              ربط فواتير المبيعات وحجوزات الاستاد والمطاعم مع Visa, Mastercard, Fawry, Wallets
            </p>
          </div>
        </div>

        <button
          onClick={handleSave}
          disabled={saving}
          className="px-6 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-bold transition shadow-lg flex items-center gap-2 disabled:opacity-50"
        >
          {saving ? <RefreshCw size={18} className="animate-spin" /> : <Save size={18} />}
          <span>حفظ التغييرات</span>
        </button>
      </div>

      {/* Gateway Tabs */}
      <div className="flex gap-2 border-b border-slate-200 pb-2">
        <button
          onClick={() => setActiveTab('paymob')}
          className={`flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-sm transition ${
            activeTab === 'paymob'
              ? 'bg-blue-600 text-white shadow-md'
              : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
          }`}
        >
          <Smartphone size={16} /> 🇪🇬 Paymob (فيزا، كاش، فاليو)
        </button>

        <button
          onClick={() => setActiveTab('fawry')}
          className={`flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-sm transition ${
            activeTab === 'fawry'
              ? 'bg-amber-600 text-white shadow-md'
              : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
          }`}
        >
          <Building2 size={16} /> 🇪🇬 Fawry Pay (فوري باي)
        </button>

        <button
          onClick={() => setActiveTab('stripe')}
          className={`flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-sm transition ${
            activeTab === 'stripe'
              ? 'bg-purple-600 text-white shadow-md'
              : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
          }`}
        >
          <Globe size={16} /> 🌍 Stripe (الدفع الدولي والخليجي)
        </button>
      </div>

      {/* Configuration Form */}
      <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm space-y-6">
        {/* Toggle Enable */}
        <div className="flex items-center justify-between p-4 bg-slate-50 rounded-xl border border-slate-200">
          <div>
            <div className="font-bold text-slate-800 text-base">تفعيل بوابة {activeTab.toUpperCase()}</div>
            <div className="text-xs text-slate-500">إتاحة خيار السداد الإلكتروني لعملاء الفواتير والمطاعم والحجوزات</div>
          </div>
          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={current.is_enabled}
              onChange={(e) => setConfigs({
                ...configs,
                [activeTab]: { ...current, is_enabled: e.target.checked }
              })}
              className="sr-only peer"
            />
            <div className="w-11 h-6 bg-slate-300 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
          </label>
        </div>

        {/* Test Mode Toggle */}
        <div className="flex items-center justify-between p-4 bg-amber-50 rounded-xl border border-amber-200">
          <div>
            <div className="font-bold text-amber-800 text-sm">وضع الاختبار والتجربة (Sandbox / Test Mode)</div>
            <div className="text-xs text-amber-600">استخدام بيئة التجارب لاختبار السداد الوهمي بدون خصم أموال حقيقية</div>
          </div>
          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={current.test_mode}
              onChange={(e) => setConfigs({
                ...configs,
                [activeTab]: { ...current, test_mode: e.target.checked }
              })}
              className="sr-only peer"
            />
            <div className="w-11 h-6 bg-slate-300 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-amber-600"></div>
          </label>
        </div>

        {/* Input Fields */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {activeTab === 'paymob' && (
            <>
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Paymob API Key (مفتاح الـ API)</label>
                <input
                  type="password"
                  value={current.api_key || ''}
                  onChange={(e) => setConfigs({
                    ...configs,
                    paymob: { ...current, api_key: e.target.value }
                  })}
                  placeholder="ZXlKaGJHY2lPaUpJVXpVeE1pSXNJ..."
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-300 font-mono text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Paymob Merchant ID (معرف التاجر)</label>
                <input
                  type="text"
                  value={current.merchant_id || ''}
                  onChange={(e) => setConfigs({
                    ...configs,
                    paymob: { ...current, merchant_id: e.target.value }
                  })}
                  placeholder="123456"
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-300 font-mono text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Integration ID (معرف وسيلة الدفع - Card/Wallet)</label>
                <input
                  type="text"
                  value={current.integration_id || ''}
                  onChange={(e) => setConfigs({
                    ...configs,
                    paymob: { ...current, integration_id: e.target.value }
                  })}
                  placeholder="456789"
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-300 font-mono text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Iframe ID (معرف قالب الدفع)</label>
                <input
                  type="text"
                  value={current.iframe_id || ''}
                  onChange={(e) => setConfigs({
                    ...configs,
                    paymob: { ...current, iframe_id: e.target.value }
                  })}
                  placeholder="789012"
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-300 font-mono text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
                />
              </div>
            </>
          )}

          {activeTab === 'fawry' && (
            <>
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Fawry Merchant Code (كود التاجر)</label>
                <input
                  type="text"
                  value={current.merchant_id || ''}
                  onChange={(e) => setConfigs({
                    ...configs,
                    fawry: { ...current, merchant_id: e.target.value }
                  })}
                  placeholder="1000000123"
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-300 font-mono text-sm focus:ring-2 focus:ring-amber-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Fawry Security Key (مفتاح الأمان)</label>
                <input
                  type="password"
                  value={current.secret_key || ''}
                  onChange={(e) => setConfigs({
                    ...configs,
                    fawry: { ...current, secret_key: e.target.value }
                  })}
                  placeholder="f89c02-44a1-4321..."
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-300 font-mono text-sm focus:ring-2 focus:ring-amber-500 focus:outline-none"
                />
              </div>
            </>
          )}

          {activeTab === 'stripe' && (
            <>
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Stripe Publishable Key</label>
                <input
                  type="text"
                  value={current.api_key || ''}
                  onChange={(e) => setConfigs({
                    ...configs,
                    stripe: { ...current, api_key: e.target.value }
                  })}
                  placeholder="pk_test_51Mz..."
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-300 font-mono text-sm focus:ring-2 focus:ring-purple-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Stripe Secret Key</label>
                <input
                  type="password"
                  value={current.secret_key || ''}
                  onChange={(e) => setConfigs({
                    ...configs,
                    stripe: { ...current, secret_key: e.target.value }
                  })}
                  placeholder="sk_test_51Mz..."
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-300 font-mono text-sm focus:ring-2 focus:ring-purple-500 focus:outline-none"
                />
              </div>
            </>
          )}

          {/* Accounting Mapping */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">الحساب البنكي / وسيط التحصيل (شجرة الحسابات)</label>
            <select
              value={current.bank_account_id || ''}
              onChange={(e) => setConfigs({
                ...configs,
                [activeTab]: { ...current, bank_account_id: e.target.value }
              })}
              className="w-full px-4 py-2.5 rounded-xl border border-slate-300 text-sm font-bold focus:ring-2 focus:ring-blue-500 focus:outline-none"
            >
              <option value="">-- اختر الحساب البنكي لتسوية المدفوعات --</option>
              {bankAccounts.map(acc => (
                <option key={acc.id} value={acc.id}>{acc.code} - {acc.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">نسبة عمولة بوابة الدفع (%)</label>
            <div className="relative">
              <input
                type="number"
                step="0.01"
                value={current.commission_rate || 0}
                onChange={(e) => setConfigs({
                  ...configs,
                  [activeTab]: { ...current, commission_rate: parseFloat(e.target.value) || 0 }
                })}
                className="w-full px-4 py-2.5 rounded-xl border border-slate-300 text-sm font-bold focus:ring-2 focus:ring-blue-500 focus:outline-none"
              />
              <span className="absolute left-3 top-2.5 text-slate-400 font-bold">%</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

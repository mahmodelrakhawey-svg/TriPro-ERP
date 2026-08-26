import React, { useState } from 'react';
import { useAccounting } from '../../../../context/AccountingContext';
import { useToast } from '../../../../context/ToastContext';
import {
  SalesChannelType,
  channelPricingService
} from '../../../../services/channelPricingService';
import {
  DollarSign,
  Utensils,
  ShoppingBag,
  Truck,
  Sparkles,
  Search,
  CheckCircle2,
  Percent,
  Sliders,
  Filter
} from 'lucide-react';

export const MultiChannelPricingManager: React.FC = () => {
  const { products } = useAccounting();
  const { showToast } = useToast();

  const [searchTerm, setSearchTerm] = useState('');
  const [channelPrices, setChannelPrices] = useState(channelPricingService.getChannelPrices());
  const [bulkChannel, setBulkChannel] = useState<SalesChannelType>('AGGREGATORS');
  const [bulkMarkupPct, setBulkMarkupPct] = useState<number>(15);

  const filteredProducts = products.filter(
    p =>
      p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.sku?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleSetPrice = (productId: string, channel: SalesChannelType, customPrice?: number, markupPct?: number) => {
    channelPricingService.setProductChannelPrice(productId, channel, { customPrice, markupPct });
    setChannelPrices({ ...channelPricingService.getChannelPrices() });
    showToast('تم تحديث سعر القناة للصنف بنجاح ✅', 'success');
  };

  const handleApplyBulkMarkup = () => {
    if (bulkMarkupPct === 0) return;
    filteredProducts.forEach(p => {
      channelPricingService.setProductChannelPrice(p.id, bulkChannel, { markupPct: bulkMarkupPct });
    });
    setChannelPrices({ ...channelPricingService.getChannelPrices() });
    showToast(`تم تطبيق زيادة ${bulkMarkupPct}% على جميع الأصناف في قناة ${bulkChannel} بنجاح 🚀`, 'success');
  };

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-7xl mx-auto animate-in fade-in">
      {/* Header */}
      <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm flex flex-wrap justify-between items-center gap-4">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-gradient-to-br from-blue-600 to-indigo-700 rounded-2xl text-white shadow-md">
            <Sliders className="w-8 h-8" />
          </div>
          <div>
            <h2 className="text-2xl font-black text-slate-800">التسعير المتعدد حسب قنوات البيع (Multi-Channel Pricing)</h2>
            <p className="text-xs text-slate-500 mt-1">
              تحديد أسعار وهوامش مختلفة لنفس الصنف حسب القناة (صالة، سفري، توصيل منزلي، تطبيقات التوصيل لتعويض عمولتها)
            </p>
          </div>
        </div>
      </div>

      {/* Quick Bulk Markup Bar */}
      <div className="bg-slate-900 text-white p-5 rounded-3xl shadow-md flex flex-wrap justify-between items-center gap-4">
        <div className="flex items-center gap-3">
          <Sparkles className="w-6 h-6 text-amber-400" />
          <div>
            <span className="font-bold text-sm block">تطبيق نسبة زيادة شاملة على قناة كاملة:</span>
            <span className="text-xs text-slate-400">مثال: إضافة 15% على كل المنيو لقناة تطبيقات التوصيل لتغطية العمولة</span>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <select
            value={bulkChannel}
            onChange={e => setBulkChannel(e.target.value as SalesChannelType)}
            className="bg-slate-800 border border-slate-700 text-white rounded-xl p-2 text-xs font-bold outline-none"
          >
            <option value="AGGREGATORS">منصات التوصيل (جاهز / هنقرستيشن / طلبات)</option>
            <option value="DELIVERY">التوصيل المنزلي (Delivery)</option>
            <option value="TAKEAWAY">الطلبات الخارجية (Takeaway)</option>
          </select>

          <div className="flex items-center gap-1">
            <input
              type="number"
              value={bulkMarkupPct}
              onChange={e => setBulkMarkupPct(parseFloat(e.target.value) || 0)}
              className="w-20 bg-slate-800 border border-slate-700 text-white rounded-xl p-2 text-xs font-black text-center outline-none"
            />
            <span className="text-xs font-bold text-slate-400">%</span>
          </div>

          <button
            onClick={handleApplyBulkMarkup}
            className="px-5 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-bold shadow"
          >
            تطبيق على الأصناف المعروضة
          </button>
        </div>
      </div>

      {/* Search & Filter */}
      <div className="flex justify-between items-center gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-slate-400 absolute right-3.5 top-3" />
          <input
            type="text"
            placeholder="ابحث عن صنف بالاسم أو الكود..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="w-full bg-white border border-slate-200 rounded-2xl pr-10 pl-4 py-2.5 text-xs outline-none focus:ring-2 focus:ring-blue-500 shadow-sm"
          />
        </div>
        <span className="text-xs text-slate-500 font-bold">{filteredProducts.length} صنف</span>
      </div>

      {/* Pricing Matrix Table */}
      <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-right text-xs">
            <thead className="bg-slate-50 text-slate-600 font-bold border-b border-slate-100">
              <tr>
                <th className="p-4">الصنف</th>
                <th className="p-4 text-center">السعر الأساسي</th>
                <th className="p-4 text-center">سعر الصالة (Dine-In)</th>
                <th className="p-4 text-center">سعر السفري (Takeaway)</th>
                <th className="p-4 text-center">سعر التوصيل (Delivery)</th>
                <th className="p-4 text-center text-orange-600">سعر التطبيقات (Aggregators)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredProducts.slice(0, 50).map(p => {
                const base = Number(p.sales_price || 0);
                const rules = (channelPrices[p.id] || {}) as Record<SalesChannelType, { customPrice?: number; markupPct?: number }>;

                const dineInPrice = channelPricingService.getEffectivePrice(p.id, base, 'DINE_IN');
                const takeawayPrice = channelPricingService.getEffectivePrice(p.id, base, 'TAKEAWAY');
                const deliveryPrice = channelPricingService.getEffectivePrice(p.id, base, 'DELIVERY');
                const aggPrice = channelPricingService.getEffectivePrice(p.id, base, 'AGGREGATORS');

                return (
                  <tr key={p.id} className="hover:bg-slate-50 transition">
                    <td className="p-4">
                      <span className="font-bold text-slate-800 text-sm block">{p.name}</span>
                      <span className="text-[11px] text-slate-400 font-mono">{p.sku || p.barcode || '-'}</span>
                    </td>
                    <td className="p-4 text-center font-bold font-mono text-slate-600">{base.toFixed(2)} ج</td>

                    {/* Dine-In */}
                    <td className="p-4 text-center">
                      <input
                        type="number"
                        defaultValue={rules.DINE_IN?.customPrice || ''}
                        placeholder={base.toFixed(2)}
                        onBlur={e => {
                          const val = parseFloat(e.target.value);
                          handleSetPrice(p.id, 'DINE_IN', !isNaN(val) && val > 0 ? val : undefined);
                        }}
                        className="w-24 border rounded-xl p-1.5 text-center font-bold text-xs outline-none focus:ring-1 focus:ring-blue-500 font-mono"
                      />
                    </td>

                    {/* Takeaway */}
                    <td className="p-4 text-center">
                      <input
                        type="number"
                        defaultValue={rules.TAKEAWAY?.customPrice || ''}
                        placeholder={base.toFixed(2)}
                        onBlur={e => {
                          const val = parseFloat(e.target.value);
                          handleSetPrice(p.id, 'TAKEAWAY', !isNaN(val) && val > 0 ? val : undefined);
                        }}
                        className="w-24 border rounded-xl p-1.5 text-center font-bold text-xs outline-none focus:ring-1 focus:ring-blue-500 font-mono"
                      />
                    </td>

                    {/* Delivery */}
                    <td className="p-4 text-center">
                      <input
                        type="number"
                        defaultValue={rules.DELIVERY?.customPrice || ''}
                        placeholder={base.toFixed(2)}
                        onBlur={e => {
                          const val = parseFloat(e.target.value);
                          handleSetPrice(p.id, 'DELIVERY', !isNaN(val) && val > 0 ? val : undefined);
                        }}
                        className="w-24 border rounded-xl p-1.5 text-center font-bold text-xs outline-none focus:ring-1 focus:ring-blue-500 font-mono"
                      />
                    </td>

                    {/* Aggregators */}
                    <td className="p-4 text-center">
                      <div className="flex items-center justify-center gap-1.5">
                        <input
                          type="number"
                          defaultValue={rules.AGGREGATORS?.customPrice || (rules.AGGREGATORS?.markupPct ? aggPrice : '')}
                          placeholder={aggPrice.toFixed(2)}
                          onBlur={e => {
                            const val = parseFloat(e.target.value);
                            handleSetPrice(p.id, 'AGGREGATORS', !isNaN(val) && val > 0 ? val : undefined);
                          }}
                          className="w-24 border border-orange-200 bg-orange-50/40 rounded-xl p-1.5 text-center font-bold text-xs text-orange-700 outline-none focus:ring-1 focus:ring-orange-500 font-mono"
                        />
                        {rules.AGGREGATORS?.markupPct ? (
                          <span className="text-[10px] bg-orange-100 text-orange-800 px-1.5 py-0.5 rounded font-bold">
                            +{rules.AGGREGATORS.markupPct}%
                          </span>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
export default MultiChannelPricingManager;

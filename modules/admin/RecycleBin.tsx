import React, { useState, useEffect } from 'react';
import { supabase } from '../../supabaseClient';
import { useAccounting } from '../../context/AccountingContext';
import { useToast } from '../../context/ToastContext';
import { 
  Trash2, RotateCcw, AlertTriangle, Loader2, RefreshCw, Archive, 
  Search, ShieldAlert, CheckCircle2, Package, Users, Truck, 
  BookOpen, Building2, UserCheck, Layers
} from 'lucide-react';

const RecycleBin = () => {
  const { restoreItem, permanentDeleteItem, currentUser } = useAccounting();
  const { showToast } = useToast();
  const [activeTab, setActiveTab] = useState('accounts');
  const [items, setItems] = useState<any[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  const tabs = [
    { id: 'accounts', label: 'الحسابات', table: 'accounts', icon: BookOpen },
    { id: 'customers', label: 'العملاء', table: 'customers', icon: Users },
    { id: 'suppliers', label: 'الموردين', table: 'suppliers', icon: Truck },
    { id: 'products', label: 'المنتجات', table: 'products', icon: Package },
    { id: 'warehouses', label: 'المستودعات', table: 'warehouses', icon: Building2 },
    { id: 'assets', label: 'الأصول', table: 'assets', icon: Layers },
    { id: 'employees', label: 'الموظفين', table: 'employees', icon: UserCheck },
  ];

  const orgId = currentUser?.organization_id || (currentUser as any)?.user_metadata?.org_id;

  // جلب عدد العناصر المحذوفة في كافة الأقسام
  const fetchCounts = async () => {
    if (currentUser?.role === 'demo') {
      setCounts({ accounts: 1, customers: 2, suppliers: 0, products: 3, warehouses: 0, assets: 0, employees: 1 });
      return;
    }

    try {
      const countsMap: Record<string, number> = {};
      for (const tab of tabs) {
        let q = supabase
          .from(tab.table)
          .select('id', { count: 'exact', head: true })
          .not('deleted_at', 'is', null);

        if (orgId) {
          q = q.eq('organization_id', orgId);
        }

        const { count, error } = await q;
        if (!error && count !== null) {
          countsMap[tab.id] = count;
        }
      }
      setCounts(countsMap);
    } catch (err) {
      console.warn('Error fetching recycle bin counts:', err);
    }
  };

  const fetchDeletedItems = async () => {
    setLoading(true);
    const currentTab = tabs.find(t => t.id === activeTab);
    if (!currentTab) return;

    if (currentUser?.role === 'demo') {
      setItems([
        { id: 'demo-1', name: 'عميل سابق ملغي', code: 'CUST-009', deleted_at: new Date(Date.now() - 86400000).toISOString(), deletion_reason: 'توقف النشاط التجاري' },
        { id: 'demo-2', name: 'منتج قديم منتهي', sku: 'PRD-OLD', deleted_at: new Date(Date.now() - 172800000).toISOString(), deletion_reason: 'تم استبداله بموديل أحدث' }
      ]);
      setLoading(false);
      return;
    }

    try {
      let query = supabase
        .from(currentTab.table)
        .select('*')
        .not('deleted_at', 'is', null)
        .order('deleted_at', { ascending: false });

      if (orgId) {
        query = query.eq('organization_id', orgId);
      }

      const { data, error } = await query;
      if (error) throw error;
      setItems(data || []);
    } catch (error: any) {
      console.error('Error fetching deleted items:', error);
      showToast('خطأ في جلب عناصر سلة المحذوفات: ' + error.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDeletedItems();
    fetchCounts();
  }, [activeTab]);

  const handleRestore = async (id: string, name: string) => {
    const currentTab = tabs.find(t => t.id === activeTab);
    if (!currentTab) return;
    
    if (currentUser?.role === 'demo') {
      showToast('تم استعادة العنصر بنجاح ✅ (محاكاة)', 'success');
      setItems(prev => prev.filter(item => item.id !== id));
      return;
    }

    if (window.confirm(`هل أنت متأكد من استعادة "${name}" وإعادته للنظام الفعال؟`)) {
      const result = await restoreItem(currentTab.table, id);
      if (result.success) {
        showToast(`تم استعادة "${name}" بنجاح ✅`, 'success');
        fetchDeletedItems();
        fetchCounts();

        // تسجيل أمني
        try {
          await supabase.from('security_logs').insert({
            event_type: `${currentTab.table}_restored`,
            description: `تم استعادة [${name}] من سلة المحذوفات إلى جدول ${currentTab.table}`,
            severity: 'info',
            module: 'admin',
            organization_id: orgId
          });
        } catch (_) {}
      } else {
        showToast('فشل الاستعادة: ' + result.message, 'error');
      }
    }
  };

  const handlePermanentDelete = async (id: string, name: string) => {
    const currentTab = tabs.find(t => t.id === activeTab);
    if (!currentTab) return;

    if (currentUser?.role === 'demo') {
      showToast('تم الحذف النهائي بنجاح ✅ (محاكاة)', 'success');
      setItems(prev => prev.filter(item => item.id !== id));
      return;
    }

    // 🛡️ فحص استباقي صارم لسلامة وتكامل الروابط المحاسبية والمخزنية
    const dependencies: Record<string, { table: string; col: string; label: string }[]> = {
      accounts: [
        { table: 'journal_lines', col: 'account_id', label: 'قيود محاسبية' },
        { table: 'products', col: 'inventory_account_id', label: 'أصناف (حساب مخزون)' },
        { table: 'products', col: 'cogs_account_id', label: 'أصناف (حساب تكلفة)' },
        { table: 'products', col: 'sales_account_id', label: 'أصناف (حساب مبيعات)' },
        { table: 'assets', col: 'asset_account_id', label: 'أصول (حساب الأصل)' }
      ],
      customers: [
        { table: 'invoices', col: 'customer_id', label: 'فواتير مبيعات' },
        { table: 'quotations', col: 'customer_id', label: 'عروض أسعار' },
        { table: 'receipt_vouchers', col: 'customer_id', label: 'سندات قبض' }
      ],
      suppliers: [
        { table: 'purchase_invoices', col: 'supplier_id', label: 'فواتير مشتريات' },
        { table: 'purchase_orders', col: 'supplier_id', label: 'أوامر شراء' },
        { table: 'payment_vouchers', col: 'supplier_id', label: 'سندات صرف' }
      ],
      products: [
        { table: 'invoice_items', col: 'product_id', label: 'بنود فواتير مبيعات' },
        { table: 'purchase_invoice_items', col: 'product_id', label: 'بنود فواتير مشتريات' }
      ],
      employees: [
        { table: 'payroll_items', col: 'employee_id', label: 'مسيرات رواتب' },
        { table: 'employee_advances', col: 'employee_id', label: 'سلف موظفين' }
      ],
      warehouses: [
        { table: 'stock_transfers', col: 'from_warehouse_id', label: 'تحويلات مخزنية (مصدر)' },
        { table: 'stock_transfers', col: 'to_warehouse_id', label: 'تحويلات مخزنية (مستلم)' }
      ]
    };

    const checks = dependencies[currentTab.table];
    if (checks) {
      for (const check of checks) {
        const { count, error: checkError } = await supabase
          .from(check.table)
          .select('id', { count: 'exact', head: true })
          .eq(check.col, id);

        if (!checkError && count && count > 0) {
          showToast(`❌ لا يمكن حذف "${name}" نهائياً لوجود ${count} سجل مرتبط به في "${check.label}".`, 'warning');
          return;
        }
      }
    }

    if (window.confirm(`⚠️ تحذير شديد الأهمية:\n\nهل أنت متأكد من حذف "${name}" نهائياً من قاعدة البيانات؟\nلن يمكن استعادة هذا السجل بعد الآن.`)) {
      const result = await permanentDeleteItem(currentTab.table, id);
      if (result.success) {
        showToast('تم الحذف النهائي بنجاح 🗑️', 'success');
        fetchDeletedItems();
        fetchCounts();
      } else {
        if (result.message && result.message.includes('foreign key constraint')) {
          showToast('فشل الحذف النهائي: هذا العنصر مستخدم في عمليات تاريخية ولا يمكن مسحه حفاظاً على توازن السجلات.', 'error');
        } else {
          showToast('فشل الحذف النهائي: ' + result.message, 'error');
        }
      }
    }
  };

  // تصفية السجلات حسب البحث
  const filteredItems = items.filter(item => {
    if (!searchTerm.trim()) return true;
    const term = searchTerm.toLowerCase();
    const name = String(item.name || item.full_name || item.description || '').toLowerCase();
    const code = String(item.code || item.sku || '').toLowerCase();
    const reason = String(item.deletion_reason || '').toLowerCase();
    return name.includes(term) || code.includes(term) || reason.includes(term);
  });

  return (
    <div className="p-6 max-w-7xl mx-auto animate-in fade-in space-y-6">
      
      {/* 👑 رأس الشاشة */}
      <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div className="flex items-center gap-4">
          <div className="p-3.5 bg-rose-50 text-rose-600 rounded-2xl border border-rose-100 shadow-xs">
            <Trash2 size={32} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-black text-slate-800">سلة المحذوفات الآمنة</h1>
              <span className="px-2.5 py-0.5 bg-slate-100 text-slate-700 rounded-full text-xs font-bold">
                Soft Delete Engine
              </span>
            </div>
            <p className="text-slate-500 text-sm mt-1">
              مراجعة السجلات المعلقة في سلة المحذوفات، استعادتها بكامل روابطها، أو إفراغها نهائياً بعد التحقق من سلامة القيود.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button 
            onClick={() => { fetchDeletedItems(); fetchCounts(); }}
            className="p-2.5 bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 rounded-xl transition-all shadow-xs"
            title="تحديث القائمة"
          >
            <RefreshCw size={18} className={loading ? "animate-spin" : ""} />
          </button>
        </div>
      </div>

      {/* 🛡️ تنبيه الحماية المحاسبية */}
      <div className="p-4 bg-amber-50/70 border border-amber-200/80 rounded-2xl flex items-start gap-3 text-amber-900 text-xs">
        <AlertTriangle size={18} className="text-amber-600 shrink-0 mt-0.5" />
        <div className="leading-relaxed">
          <strong className="block font-bold mb-0.5">درع الحماية المحاسبية (Relational Integrity Shield):</strong>
          لا يسمح النظام بحذف أي حساب مالي، عميل، مورد، أو صنف نهائياً إذا كانت له حركات أو فواتير أو قيود مسجلة، وذلك لمنع أي خلل في ميزان المراجعة أو بطاقات الصنف.
        </div>
      </div>

      {/* 🧭 التبويبات والمحتوى */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        
        {/* التبويبات */}
        <div className="flex border-b border-slate-100 overflow-x-auto bg-slate-50/50 p-1.5 gap-1">
          {tabs.map(tab => {
            const Icon = tab.icon;
            const count = counts[tab.id] || 0;
            const isActive = activeTab === tab.id;

            return (
              <button
                key={tab.id}
                onClick={() => { setActiveTab(tab.id); setSearchTerm(''); }}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-xs whitespace-nowrap transition-all ${
                  isActive 
                    ? 'bg-white text-indigo-600 shadow-sm border border-slate-200' 
                    : 'text-slate-600 hover:bg-slate-100/70 hover:text-slate-800'
                }`}
              >
                <Icon size={16} className={isActive ? 'text-indigo-600' : 'text-slate-400'} />
                <span>{tab.label}</span>
                {count > 0 && (
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-black ${
                    isActive ? 'bg-indigo-100 text-indigo-700' : 'bg-rose-100 text-rose-700'
                  }`}>
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* شريط البحث الموضعي */}
        <div className="p-4 border-b border-slate-100 bg-white">
          <div className="relative max-w-md">
            <Search className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
            <input
              type="text"
              placeholder="بحث في العناصر المحذوفة..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pr-10 pl-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500 font-medium"
            />
          </div>
        </div>

        {/* الجدول والمحتوى */}
        <div className="p-6">
          {loading ? (
            <div className="text-center py-16 flex flex-col items-center justify-center text-slate-500 space-y-2">
              <Loader2 className="animate-spin text-indigo-600" size={32} />
              <p className="text-xs font-bold">جاري تحميل السجلات المحذوفة...</p>
            </div>
          ) : filteredItems.length === 0 ? (
            <div className="text-center py-16 text-slate-400 space-y-3">
              <Archive size={48} className="mx-auto text-slate-300 stroke-[1.5]" />
              <p className="text-base font-bold text-slate-600">سلة المحذوفات فارغة لهذا القسم</p>
              <p className="text-xs text-slate-400">لا توجد أي سجلات محذوفة بانتظار المعالجة.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-right border-collapse">
                <thead>
                  <tr className="bg-slate-50 text-slate-500 text-xs uppercase font-black border-b border-slate-100">
                    <th className="px-5 py-3.5">الاسم / البيان</th>
                    <th className="px-5 py-3.5 w-40">الكود / المعرف</th>
                    <th className="px-5 py-3.5">سبب الحذف</th>
                    <th className="px-5 py-3.5 w-48">تاريخ الحذف</th>
                    <th className="px-5 py-3.5 w-48 text-center">إجراءات الاستعادة والحذف</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-sm">
                  {filteredItems.map(item => {
                    const itemName = item.name || item.full_name || item.description || 'بدون اسم';
                    const itemCode = item.code || item.sku || item.id?.slice(0, 8);

                    return (
                      <tr key={item.id} className="hover:bg-slate-50/70 transition-colors">
                        <td className="px-5 py-4 font-bold text-slate-800 text-xs">
                          {itemName}
                        </td>
                        <td className="px-5 py-4 font-mono text-xs text-slate-500">
                          {itemCode}
                        </td>
                        <td className="px-5 py-4 text-slate-600 text-xs">
                          {item.deletion_reason || <span className="text-slate-300">غير محدد</span>}
                        </td>
                        <td className="px-5 py-4 text-slate-500 text-xs font-mono" dir="ltr">
                          {item.deleted_at ? new Date(item.deleted_at).toLocaleString('ar-EG') : '-'}
                        </td>
                        <td className="px-5 py-4">
                          <div className="flex items-center justify-center gap-2">
                            <button 
                              onClick={() => handleRestore(item.id, itemName)}
                              className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 rounded-lg font-bold text-xs transition-colors shadow-2xs"
                              title="استعادة السجل للعمل فوراً"
                            >
                              <RotateCcw size={13} />
                              <span>استعادة</span>
                            </button>
                            <button 
                              onClick={() => handlePermanentDelete(item.id, itemName)}
                              className="flex items-center gap-1.5 px-3 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-lg font-bold text-xs transition-colors shadow-2xs"
                              title="حذف نهائي من قاعدة البيانات"
                            >
                              <Trash2 size={13} />
                              <span>حذف نهائي</span>
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

      </div>

    </div>
  );
};

export default RecycleBin;
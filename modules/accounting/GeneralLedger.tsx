﻿import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { supabase } from '../../supabaseClient';
import { useToast } from '../../context/ToastContext';
import { useAccounting } from '../../context/AccountingContext';
import { Book, Filter, Search, Printer } from 'lucide-react';
import { useLocation } from 'react-router-dom';
import ReportHeader from '../../components/ReportHeader';

type Account = {
  id: string;
  code: string;
  name: string;
  parent_id: string | null;
  is_group: boolean;
};

type LedgerEntry = {
  id: string;
  debit: number;
  credit: number;
  balance: number; // إضافة حقل الرصيد هنا
  journal_entries: {
    id: string;
    transaction_date: string;
    reference: string;
    description: string;
    is_posted: boolean;
  };
};

const GeneralLedger = () => {
  const location = useLocation();
  const { accounts, currentUser } = useAccounting(); // استخدام السياق بدلاً من الجلب المحلي
  const { showToast } = useToast();
  const [selectedAccount, setSelectedAccount] = useState<string>('');
  const [accountSearch, setAccountSearch] = useState('');
  const [startDate, setStartDate] = useState(new Date(new Date().getFullYear(), 0, 1).toISOString().split('T')[0]);
  const [endDate, setEndDate] = useState(new Date().toISOString().split('T')[0]);
  const [entries, setEntries] = useState<LedgerEntry[]>([]);
  const [openingBalance, setOpeningBalance] = useState(0);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const PAGE_SIZE = 50;
  
  // لتخزين معايير البحث الحالية لضمان استمرار التحميل بنفس الشروط
  const [searchParamsState, setSearchParamsState] = useState<{ids: string[], start: string, end: string} | null>(null);
  
  const observer = useRef<IntersectionObserver | null>(null);
  const lastEntryRef = useCallback((node: HTMLTableRowElement) => {
    if (loading) return;
    if (observer.current) observer.current.disconnect();
    observer.current = new IntersectionObserver(entries => {
      if (entries[0].isIntersecting && hasMore) {
        setPage(prevPage => prevPage + 1);
      }
    });
    if (node) observer.current.observe(node);
  }, [loading, hasMore]);

  // استقبال البيانات من الصفحات الأخرى (Drill-down)
  useEffect(() => {
    if (location.state?.accountId) {
      setSelectedAccount(location.state.accountId);
      if (location.state.startDate) setStartDate(location.state.startDate);
      if (location.state.endDate) setEndDate(location.state.endDate);
      // تفعيل البحث تلقائياً بعد مهلة قصيرة لضمان تحميل الحالة
      setTimeout(() => document.getElementById('search-btn')?.click(), 100);
    }
  }, [location.state]);

  const filteredAccounts = useMemo(() => {
    return accounts.filter(acc => 
      acc.name.toLowerCase().includes(accountSearch.toLowerCase()) || 
      acc.code.includes(accountSearch)
    );
  }, [accounts, accountSearch]);

  // دالة مساعدة لجلب معرفات الحساب والحسابات الفرعية (شجرياً)
  const getAccountAndChildrenIds = (accountId: string, allAccounts: Account[]): string[] => {
    let ids: string[] = [accountId];
    const children = allAccounts.filter(a => a.parent_id === accountId);
    children.forEach(child => {
      ids = [...ids, ...getAccountAndChildrenIds(child.id, allAccounts)];
    });
    return ids;
  };

  const handleSearch = async () => {
    if (!selectedAccount) return;
    setPage(0);
    setLoading(true);

    // دعم وضع الديمو
    if (currentUser?.role === 'demo') {
        setTimeout(() => {
            setOpeningBalance(5000);
            setEntries([
                { 
                    id: 'demo-1', debit: 1000, credit: 0, balance: 6000, 
                    journal_entries: { id: 'j1', transaction_date: new Date().toISOString(), reference: 'INV-001', description: 'فاتورة مبيعات آجلة', is_posted: true } 
                },
                { 
                    id: 'demo-2', debit: 0, credit: 2000, balance: 4000, 
                    journal_entries: { id: 'j2', transaction_date: new Date().toISOString(), reference: 'RCT-001', description: 'سداد من العميل', is_posted: true } 
                }
            ]);
            setLoading(false);
        }, 500);
        return;
    }

    try {
      // تحديد الحسابات المستهدفة (الحساب المختار + أبنائه)
      const targetAccountIds = getAccountAndChildrenIds(selectedAccount, accounts as unknown as Account[]);
      
      const { data: { user } } = await supabase.auth.getUser();
      const userOrgId = user?.user_metadata?.org_id;

      if (!userOrgId) {
        throw new Error('تعذر تحديد المنظمة التابع لها.');
      }

      // حفظ المعايير لاستخدامها في التصفح اللانهائي
      setSearchParamsState({ ids: targetAccountIds, start: startDate, end: endDate });

      // 1. حساب رصيد ما قبل الفترة (Opening Balance)
      // نجمع كل الحركات المرحلة لهذا الحساب التي تاريخها قبل "تاريخ البداية"
      const { data: openingData, error: openingError } = await supabase
        .from('journal_lines')
        .select('debit, credit, journal_entries!inner(transaction_date, status, organization_id)')
        .in('account_id', targetAccountIds) // استخدام .in بدلاً من .eq
        .eq('journal_entries.status', 'posted') // الاعتماد على status='posted' أدق
        .eq('journal_entries.organization_id', userOrgId)
        .lt('journal_entries.transaction_date', startDate || '1970-01-01');

      if (openingError) throw openingError;

      // الرصيد الافتتاحي = مجموع المدين - مجموع الدائن (للفترة السابقة)
      const openBal = openingData?.reduce((sum, line) => sum + (line.debit - line.credit), 0) || 0;
      setOpeningBalance(openBal);

      // 2. جلب الصفحة الأولى من البيانات
      await fetchPageData(0, targetAccountIds, startDate, endDate, openBal, true);

    } catch (error: any) {
      showToast('حدث خطأ أثناء جلب البيانات: ' + error.message, 'error');
      setLoading(false);
    }
  };

  // دالة جلب البيانات (تستخدم للبحث الأولي ولتحميل المزيد)
  const fetchPageData = async (pageIndex: number, ids: string[], start: string, end: string, baseBalance: number, isReset: boolean) => {
    setLoading(true);
    try {
      const from = pageIndex * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;

      const { data: { user } } = await supabase.auth.getUser();
      const userOrgId = user?.user_metadata?.org_id;

      if (!userOrgId) {
        throw new Error('تعذر تحديد المنظمة.');
      }

      const { data: periodData, error: periodError } = await supabase
        .from('journal_lines')
        .select(`
          id, debit, credit,
          journal_entries!inner ( 
            id, transaction_date, reference, description, status, organization_id
          )
        `) 
        .in('account_id', ids)
        .eq('journal_entries.status', 'posted')
        .eq('journal_entries.organization_id', userOrgId)
        .gte('journal_entries.transaction_date', start || '1970-01-01')
        .lte('journal_entries.transaction_date', end)
        .order('transaction_date', { foreignTable: 'journal_entries', ascending: true }) // ترتيب من السيرفر
        .range(from, to);

      if (periodError) throw periodError;

      // حساب الرصيد التراكمي
      let running = baseBalance;
      
      const processedData = (periodData as any[]).map((item: any) => {
          running += (item.debit - item.credit);
          return { ...item, balance: running };
      });

      if (isReset) {
        setEntries(processedData);
      } else {
        setEntries(prev => [...prev, ...processedData]);
      }

      // التحقق مما إذا كان هناك المزيد من البيانات
      setHasMore(periodData.length === PAGE_SIZE);

    } catch (err: any) {
      console.error(err);
      showToast('خطأ في تحميل البيانات', 'error');
    } finally {
      setLoading(false);
    }
  };

  // Effect لتحميل المزيد عند تغيير الصفحة
  useEffect(() => {
    if (page > 0 && searchParamsState) {
      // حساب الرصيد الأخير من القائمة الحالية لنبدأ منه
      const lastBalance = entries.length > 0 ? entries[entries.length - 1].balance : openingBalance;
      fetchPageData(page, searchParamsState.ids, searchParamsState.start, searchParamsState.end, lastBalance, false);
    }
  }, [page]);

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="p-6 bg-white rounded-xl shadow-sm border border-slate-200 min-h-[80vh]">
      <div className="flex justify-between items-center mb-6 border-b border-slate-100 pb-4 no-print">
        <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
          <Book className="text-blue-600" />
          دفتر الأستاذ العام
        </h1>
        <button onClick={handlePrint} className="flex items-center gap-2 bg-slate-100 text-slate-600 px-4 py-2 rounded-lg hover:bg-slate-200 font-bold text-sm">
            <Printer size={16} /> طباعة
        </button>
      </div>

      {/* فلاتر البحث */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8 bg-slate-50 p-4 rounded-xl border border-slate-200 no-print">
        <div className="md:col-span-2">
            <label className="block text-sm font-bold text-slate-700 mb-1">ابحث واختر الحساب</label>
            <div className="flex gap-2">
                <div className="relative flex-1">
                    <input 
                        type="text" 
                        placeholder="بحث بالكود أو الاسم..."
                        value={accountSearch}
                        onChange={(e) => setAccountSearch(e.target.value)}
                        className="w-full border border-slate-300 rounded-lg px-3 py-2 pr-10 focus:outline-none focus:border-blue-500 text-sm"
                    />
                    <Search className="absolute right-3 top-2.5 text-slate-400" size={16} />
                </div>
                <select 
                    value={selectedAccount}
                    onChange={(e) => setSelectedAccount(e.target.value)}
                    className="border border-slate-300 rounded-lg px-3 py-2 focus:outline-none focus:border-blue-500 flex-[2]"
                >
                    <option value="">-- اختر حساب ({filteredAccounts.length}) --</option>
                    {filteredAccounts.map(acc => (
                        <option key={acc.id} value={acc.id} className={acc.is_group ? 'font-bold bg-slate-100' : ''}>
                            {acc.code} - {acc.name} {acc.is_group ? '(رئيسي)' : ''}
                        </option>
                    ))}
                </select>
            </div>
        </div>
        <div>
            <label className="block text-sm font-bold text-slate-700 mb-1">من تاريخ</label>
            <input 
                type="date" 
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 focus:outline-none focus:border-blue-500"
            />
        </div>
        <div>
            <label className="block text-sm font-bold text-slate-700 mb-1">إلى تاريخ</label>
            <input 
                type="date" 
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 focus:outline-none focus:border-blue-500"
            />
        </div>
        <div className="md:col-span-4 flex justify-end">
            <button 
                onClick={handleSearch}
                id="search-btn"
                disabled={!selectedAccount || loading}
                className="flex items-center gap-2 bg-blue-600 text-white px-6 py-2.5 rounded-lg hover:bg-blue-700 font-bold shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
            >
                {loading ? 'جاري البحث...' : <><Search size={18} /> عرض التقرير</>}
            </button>
        </div>
      </div>

      {/* ترويسة التقرير (للطباعة فقط) */}
      <ReportHeader 
        title="كشف حساب (دفتر الأستاذ)" 
        subtitle={`${accounts.find(a => a.id === selectedAccount)?.name || ''} - الفترة من ${startDate} إلى ${endDate}`} 
      />

      {/* جدول البيانات */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm text-right border-collapse">
            <thead className="bg-slate-100 text-slate-600 font-bold">
                <tr>
                    <th className="p-3 border border-slate-200">التاريخ</th>
                    <th className="p-3 border border-slate-200">رقم القيد</th>
                    <th className="p-3 border border-slate-200">البيان</th>
                    <th className="p-3 border border-slate-200 text-center">مدين</th>
                    <th className="p-3 border border-slate-200 text-center">دائن</th>
                    <th className="p-3 border border-slate-200 text-center">الرصيد</th>
                </tr>
            </thead>
            <tbody>
                {/* سطر الرصيد الافتتاحي */}
                <tr className="bg-yellow-50 font-bold">
                    <td className="p-3 border border-slate-200" colSpan={3}>رصيد ما قبل الفترة (افتتاحي)</td>
                    <td className="p-3 border border-slate-200 text-center">-</td>
                    <td className="p-3 border border-slate-200 text-center">-</td>
                    <td className="p-3 border border-slate-200 text-center" dir="ltr">{openingBalance.toFixed(2)}</td>
                </tr>

                {entries.length > 0 ? entries.map((entry, index) => {
                    // إضافة ref لآخر عنصر فقط لتفعيل التحميل اللانهائي
                    const isLastElement = index === entries.length - 1;
                    return (
                        <tr 
                            key={entry.id} 
                            ref={isLastElement ? lastEntryRef : null}
                            className="hover:bg-slate-50 transition-colors"
                        >
                            <td className="p-3 border border-slate-200 whitespace-nowrap">
                                {new Date(entry.journal_entries.transaction_date).toLocaleDateString('ar-EG')}
                            </td>
                            <td className="p-3 border border-slate-200 font-mono">
                                {entry.journal_entries.reference}
                            </td>
                            <td className="p-3 border border-slate-200 max-w-xs truncate">
                                {entry.journal_entries.description}
                            </td>
                            <td className="p-3 border border-slate-200 text-center font-mono text-emerald-600">
                                {entry.debit > 0 ? entry.debit.toFixed(2) : '-'}
                            </td>
                            <td className="p-3 border border-slate-200 text-center font-mono text-red-600">
                                {entry.credit > 0 ? entry.credit.toFixed(2) : '-'}
                            </td>
                            <td className="p-3 border border-slate-200 text-center font-mono font-bold" dir="ltr">
                                {entry.balance.toFixed(2)}
                            </td>
                        </tr>
                    );
                }) : (
                    <tr>
                        <td colSpan={6} className="p-8 text-center text-slate-500">
                            {loading ? 'جاري التحميل...' : 'لا توجد حركات مرحلة لهذا الحساب خلال الفترة المحددة'}
                        </td>
                    </tr>
                )}
                
                {loading && page > 0 && (
                    <tr><td colSpan={6} className="p-4 text-center text-blue-600 font-bold">جاري تحميل المزيد...</td></tr>
                )}
                
                {/* سطر الإجماليات */}
                <tr className="bg-slate-100 font-bold">
                    <td className="p-3 border border-slate-200" colSpan={3}>الإجمالي والرصيد الختامي</td>
                    <td className="p-3 border border-slate-200 text-center text-emerald-700">
                        {entries.reduce((sum, e) => sum + e.debit, 0).toFixed(2)}
                    </td>
                    <td className="p-3 border border-slate-200 text-center text-red-700">
                        {entries.reduce((sum, e) => sum + e.credit, 0).toFixed(2)}
                    </td>
                    <td className="p-3 border border-slate-200 text-center text-blue-700" dir="ltr">
                        {entries.length > 0 ? entries[entries.length - 1].balance.toFixed(2) : openingBalance.toFixed(2)}
                    </td>
                </tr>
            </tbody>
        </table>
      </div>
    </div>
  );
};

export default GeneralLedger;

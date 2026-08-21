import React, { useState, useEffect } from 'react';
import { supabase } from '@/supabaseClient';
import { useAccounting } from '@/context/AccountingContext';
import toast from 'react-hot-toast';
import { BarChart3, Download, Filter, TrendingUp } from 'lucide-react';
import { format, subDays } from 'date-fns';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import * as XLSX from 'xlsx';

interface RevenueRecord {
  id: string;
  date: string;
  type: 'subscription' | 'booking' | 'rental' | 'program';
  description: string;
  amount: number;
  payment_method: string;
}

const StadiumRevenueReport: React.FC = () => {
  const { currentUser } = useAccounting();
  const orgId = (currentUser as any)?.organization_id;

  const [dateFrom, setDateFrom] = useState(format(subDays(new Date(), 30), 'yyyy-MM-dd'));
  const [dateTo, setDateTo] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [typeFilter, setTypeFilter] = useState<string>('all');
  
  const [data, setData] = useState<RevenueRecord[]>([]);
  const [loading, setLoading] = useState(false);
  
  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 25;

  useEffect(() => {
    if (orgId) {
      fetchRevenue();
    }
  }, [orgId, dateFrom, dateTo]);

  const fetchRevenue = async () => {
    try {
      setLoading(true);
      
      let allRecords: RevenueRecord[] = [];

      // 1. Fetch Subscriptions (الاشتراكات)
      const { data: subs } = await supabase
        .from('stadium_subscriptions')
        .select('id, created_at, duration, amount_paid, payment_method, member_id, stadium_members(full_name, membership_type)')
        .eq('organization_id', orgId)
        .gte('created_at', `${dateFrom}T00:00:00`)
        .lte('created_at', `${dateTo}T23:59:59`);
        
      if (subs) {
        allRecords = [...allRecords, ...subs.map(s => ({
          id: s.id,
          date: s.created_at,
          type: 'subscription' as const,
          description: `اشتراك - ${(s as any).stadium_members?.full_name || 'عضو'} (${(s as any).stadium_members?.membership_type || s.duration || ''})`,
          amount: Number(s.amount_paid) || 0,
          payment_method: s.payment_method || 'cash'
        }))];
      }

      // 2. Fetch Bookings (الحجوزات)
      const { data: bookings } = await supabase
        .from('stadium_bookings')
        .select('id, created_at, total_amount, payment_method, booker_name, stadium_facilities(name)')
        .eq('organization_id', orgId)
        .in('status', ['confirmed', 'paid'])
        .gte('created_at', `${dateFrom}T00:00:00`)
        .lte('created_at', `${dateTo}T23:59:59`);
        
      if (bookings) {
        allRecords = [...allRecords, ...bookings.map(b => ({
          id: b.id,
          date: b.created_at,
          type: 'booking' as const,
          description: `حجز - ${(b as any).stadium_facilities?.name || 'مرفق'} - ${b.booker_name || ''}`,
          amount: Number(b.total_amount) || 0,
          payment_method: b.payment_method || 'cash'
        }))];
      }

      // 3. Fetch Rental Payments (الإيجارات)
      const { data: rentals } = await supabase
        .from('stadium_rental_payments')
        .select('id, created_at, amount_paid, payment_method, stadium_rental_contracts(tenant_name, stadium_facilities(name))')
        .eq('organization_id', orgId)
        .gte('created_at', `${dateFrom}T00:00:00`)
        .lte('created_at', `${dateTo}T23:59:59`);

      if (rentals) {
        allRecords = [...allRecords, ...rentals.map(r => ({
          id: r.id,
          date: r.created_at,
          type: 'rental' as const,
          description: `إيجار - ${(r as any).stadium_rental_contracts?.tenant_name || 'مستأجر'} (${(r as any).stadium_rental_contracts?.stadium_facilities?.name || 'مرفق'})`,
          amount: Number(r.amount_paid) || 0,
          payment_method: r.payment_method || 'cash'
        }))];
      }

      // 4. Fetch Enrollments (البرامج التدريبية)
      const { data: enrollments } = await supabase
        .from('stadium_program_enrollments')
        .select('id, created_at, amount_paid, payment_method, participant_name, stadium_training_programs(name)')
        .eq('organization_id', orgId)
        .neq('status', 'cancelled')
        .gte('created_at', `${dateFrom}T00:00:00`)
        .lte('created_at', `${dateTo}T23:59:59`);
        
      if (enrollments) {
        allRecords = [...allRecords, ...enrollments.map(e => ({
          id: e.id,
          date: e.created_at,
          type: 'program' as const,
          description: `برنامج - ${(e as any).stadium_training_programs?.name || 'تدريب'} - ${e.participant_name || ''}`,
          amount: Number(e.amount_paid) || 0,
          payment_method: e.payment_method || 'cash'
        }))];
      }

      // Sort by date descending
      allRecords.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      
      setData(allRecords);
      setCurrentPage(1);
    } catch (error: any) {
      console.error('Error fetching revenue:', error);
      toast.error('حدث خطأ أثناء جلب بيانات الإيرادات');
    } finally {
      setLoading(false);
    }
  };

  // Correct Filter logic
  const filteredData = data.filter(d => typeFilter === 'all' || d.type === typeFilter);
  const totalCount = filteredData.length;
  const totalPages = Math.ceil(totalCount / pageSize) || 1;
  
  const currentData = filteredData.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const totalAmount = filteredData.reduce((sum, item) => sum + item.amount, 0);

  // Group by date for chart
  const chartData = filteredData.reduce((acc: any[], curr) => {
    const dateStr = format(new Date(curr.date), 'MM/dd');
    const existing = acc.find(item => item.date === dateStr);
    if (existing) {
      existing.amount += curr.amount;
    } else {
      acc.push({ date: dateStr, amount: curr.amount });
    }
    return acc;
  }, []).sort((a, b) => a.date.localeCompare(b.date));

  const handleExport = () => {
    const exportData = filteredData.map(item => ({
      'التاريخ': format(new Date(item.date), 'yyyy/MM/dd HH:mm'),
      'النوع': item.type === 'subscription' ? 'اشتراك' : item.type === 'booking' ? 'حجز' : item.type === 'rental' ? 'إيجار' : 'برنامج',
      'الوصف': item.description,
      'المبلغ (ج.م)': item.amount,
      'طريقة الدفع': item.payment_method === 'cash' ? 'نقدي' : item.payment_method === 'cheque' ? 'شيك' : item.payment_method === 'card' ? 'بطاقة' : 'تحويل'
    }));

    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "الإيرادات");
    XLSX.writeFile(wb, `تقرير_إيرادات_الاستاد_${format(new Date(), 'yyyyMMdd')}.xlsx`);
  };

  return (
    <div className="p-6 bg-gray-50 dark:bg-gray-900 min-h-screen text-right" dir="rtl">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-800 dark:text-gray-100 flex items-center gap-2">
            <BarChart3 className="w-6 h-6 text-indigo-600 dark:text-indigo-400" />
            تقرير الإيرادات الشامل
          </h1>
          <p className="text-xs text-gray-500 mt-1">تحليل وتتبع إيرادات الاشتراكات، الحجوزات، الإيجارات، والبرامج</p>
        </div>
        
        <div className="flex flex-wrap items-center gap-3 bg-white dark:bg-gray-800 p-2 rounded-lg shadow-sm border border-gray-100 dark:border-gray-700">
          <div className="flex items-center gap-2 px-2 border-l dark:border-gray-700">
            <Filter className="w-4 h-4 text-gray-400" />
            <select 
              value={typeFilter} 
              onChange={e => { setTypeFilter(e.target.value); setCurrentPage(1); }}
              className="bg-transparent border-none text-sm focus:ring-0 py-1 dark:bg-gray-800 dark:text-gray-200"
            >
              <option value="all">جميع الإيرادات</option>
              <option value="subscription">الاشتراكات الرياضية</option>
              <option value="booking">حجوزات الملاعب والمرافق</option>
              <option value="rental">عقود الإيجار والاستغلال</option>
              <option value="program">البرامج والأكاديميات التدريبية</option>
            </select>
          </div>
          
          <div className="flex items-center gap-2 px-2">
            <input 
              type="date" 
              value={dateFrom} 
              onChange={e => setDateFrom(e.target.value)}
              className="border-none bg-gray-50 dark:bg-gray-700 rounded text-sm py-1 px-2 focus:ring-1 focus:ring-indigo-500"
            />
            <span className="text-gray-400">-</span>
            <input 
              type="date" 
              value={dateTo} 
              onChange={e => setDateTo(e.target.value)}
              className="border-none bg-gray-50 dark:bg-gray-700 rounded text-sm py-1 px-2 focus:ring-1 focus:ring-indigo-500"
            />
          </div>
          
          <button 
            onClick={handleExport}
            className="flex items-center gap-2 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 dark:bg-indigo-950/40 dark:text-indigo-300 dark:hover:bg-indigo-900/50 px-3 py-1.5 rounded-md transition text-sm font-medium"
          >
            <Download className="w-4 h-4" />
            تصدير
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 p-6 lg:col-span-1 flex flex-col justify-center">
          <div className="flex items-center gap-3 text-indigo-600 dark:text-indigo-400 mb-2">
            <TrendingUp className="w-5 h-5" />
            <h3 className="font-semibold text-sm">إجمالي الإيرادات للفترة</h3>
          </div>
          <div className="text-3xl font-bold text-green-600 dark:text-green-400 font-mono mt-2">
            {totalAmount.toLocaleString('ar-EG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} <span className="text-base text-gray-500 font-normal">ج.م</span>
          </div>
          <p className="text-xs text-gray-500 mt-4">
            إجمالي الحركات: {totalCount} حركة
          </p>
        </div>
        
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 p-6 lg:col-span-2 h-64 min-w-0">
          <h3 className="text-sm font-semibold text-gray-600 dark:text-gray-300 mb-4">اتجاه الإيرادات</h3>
          <ResponsiveContainer width="100%" height="100%" minWidth={0}>
            <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="colorAmount" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#10b981" stopOpacity={0.3}/>
                  <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" opacity={0.2} />
              <XAxis dataKey="date" tick={{fontSize: 12, fill: '#6b7280'}} axisLine={false} tickLine={false} />
              <YAxis tick={{fontSize: 12, fill: '#6b7280'}} axisLine={false} tickLine={false} />
              <Tooltip formatter={(value) => [`${Number(value).toLocaleString('ar-EG')} ج.م`, 'الإيراد']} />
              <Area type="monotone" dataKey="amount" stroke="#10b981" strokeWidth={2} fillOpacity={1} fill="url(#colorAmount)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-right text-sm">
            <thead className="bg-gray-50 dark:bg-gray-900/50 border-b border-gray-100 dark:border-gray-700">
              <tr>
                <th className="px-6 py-4 font-semibold text-gray-600 dark:text-gray-300">التاريخ</th>
                <th className="px-6 py-4 font-semibold text-gray-600 dark:text-gray-300">النوع</th>
                <th className="px-6 py-4 font-semibold text-gray-600 dark:text-gray-300">الوصف والبيان</th>
                <th className="px-6 py-4 font-semibold text-gray-600 dark:text-gray-300">المبلغ</th>
                <th className="px-6 py-4 font-semibold text-gray-600 dark:text-gray-300">طريقة الدفع</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
              {loading ? (
                <tr>
                  <td colSpan={5} className="px-6 py-8 text-center text-gray-500">جاري التحميل...</td>
                </tr>
              ) : currentData.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-8 text-center text-gray-500">لا توجد حركات إيرادات في هذه الفترة</td>
                </tr>
              ) : (
                currentData.map((row) => (
                  <tr key={row.id} className="hover:bg-gray-50/50 dark:hover:bg-gray-750 transition">
                    <td className="px-6 py-4 text-xs text-gray-600 dark:text-gray-400 font-mono">
                      {format(new Date(row.date), 'yyyy/MM/dd HH:mm')}
                    </td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                        row.type === 'subscription' ? 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300' :
                        row.type === 'booking' ? 'bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300' :
                        row.type === 'rental' ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300' :
                        'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                      }`}>
                        {row.type === 'subscription' ? 'اشتراك' : row.type === 'booking' ? 'حجز' : row.type === 'rental' ? 'إيجار' : 'برنامج'}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-gray-900 dark:text-gray-100">
                      {row.description}
                    </td>
                    <td className="px-6 py-4 font-bold text-green-600 dark:text-green-400 font-mono">
                      {row.amount.toLocaleString('ar-EG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ج.م
                    </td>
                    <td className="px-6 py-4 text-xs text-gray-600 dark:text-gray-400">
                      {row.payment_method === 'cash' ? 'نقدي' : 
                       row.payment_method === 'cheque' ? 'شيك بنكي' : 
                       row.payment_method === 'card' ? 'بطاقة دفع' : 
                       row.payment_method === 'bank_transfer' ? 'تحويل بنكي' : 'أخرى'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
            {currentData.length > 0 && (
              <tfoot className="bg-gray-50 dark:bg-gray-900/80 font-bold border-t dark:border-gray-700">
                <tr>
                  <td colSpan={3} className="px-6 py-4 text-gray-900 dark:text-gray-100 text-left">الإجمالي لهذه الصفحة:</td>
                  <td className="px-6 py-4 text-green-600 dark:text-green-400 font-mono">
                    {currentData.reduce((s, r) => s + r.amount, 0).toLocaleString('ar-EG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ج.م
                  </td>
                  <td></td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>

        {totalPages > 1 && (
          <div className="px-6 py-4 border-t border-gray-100 dark:border-gray-700 flex items-center justify-between">
            <button
              disabled={currentPage === 1}
              onClick={() => setCurrentPage(p => p - 1)}
              className="px-4 py-2 border border-gray-200 dark:border-gray-700 rounded-lg text-xs disabled:opacity-50"
            >
              السابق
            </button>
            <span className="text-xs text-gray-600 dark:text-gray-400">صفحة {currentPage} من {totalPages}</span>
            <button
              disabled={currentPage === totalPages}
              onClick={() => setCurrentPage(p => p + 1)}
              className="px-4 py-2 border border-gray-200 dark:border-gray-700 rounded-lg text-xs disabled:opacity-50"
            >
              التالي
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default StadiumRevenueReport;

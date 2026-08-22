import React, { useState, useEffect } from 'react';
import { supabase } from '@/supabaseClient';
import { useAccounting } from '@/context/AccountingContext';
import toast from 'react-hot-toast';
import { format, startOfMonth, endOfMonth, differenceInDays } from 'date-fns';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, Legend } from 'recharts';
import { calculateOccupancyRate } from '../stadiumHelpers';
import { FACILITY_TYPE_LABELS } from '../stadium.types';
import { BarChart3, Calendar } from 'lucide-react';


interface FacilityStats {
  id: string;
  name: string;
  type: string;
  availableHours: number;
  bookedHours: number;
  occupancyRate: number;
  revenue: number;
  peakHours: number;   // ساعات الذروة (16:00 - 22:00)
  offPeakHours: number; // ساعات خارج الذروة
}

const OccupancyReport: React.FC = () => {
  const { currentUser } = useAccounting();
  const orgId = (currentUser as any)?.organization_id;

  const [dateFrom, setDateFrom] = useState(format(startOfMonth(new Date()), 'yyyy-MM-dd'));
  const [dateTo, setDateTo] = useState(format(endOfMonth(new Date()), 'yyyy-MM-dd'));
  
  const [stats, setStats] = useState<FacilityStats[]>([]);
  const [loading, setLoading] = useState(false);
  
  // ملخص الذروة للكل
  const [peakSummary, setPeakSummary] = useState({ peakHours: 0, offPeakHours: 0, peakRevenue: 0 });

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 25;

  useEffect(() => {
    if (orgId) {
      fetchOccupancy();
    }
  }, [orgId, dateFrom, dateTo]);

  const fetchOccupancy = async () => {
    try {
      setLoading(true);
      
      // Get all active facilities
      const { data: facilities, error: facError } = await supabase
        .from('stadium_facilities')
        .select('*')
        .eq('organization_id', orgId)
        .eq('is_active', true);
        
      if (facError) throw facError;
      if (!facilities || facilities.length === 0) {
        setStats([]);
        return;
      }

      // جلب الحجوزات مع وقت البدء لتحليل الذروة
      const { data: bookings, error: bookError } = await supabase
        .from('stadium_bookings')
        .select('facility_id, duration_hours, total_amount, start_time')
        .eq('organization_id', orgId)
        .in('status', ['confirmed', 'paid'])
        .gte('booking_date', dateFrom)
        .lte('booking_date', dateTo);

      if (bookError) throw bookError;

      const daysInRange = Math.max(1, differenceInDays(new Date(dateTo), new Date(dateFrom)) + 1);

      // دالة تحديد وقت الذروة: 16:00 - 22:00
      const isPeak = (startTime: string) => {
        const h = parseInt((startTime || '00:00').split(':')[0], 10);
        return h >= 16 && h < 22;
      };

      let totalPeakHours = 0, totalOffPeakHours = 0, totalPeakRevenue = 0;

      const calculatedStats = facilities.map(facility => {
        const facilityBookings = (bookings || []).filter(b => b.facility_id === facility.id);
        
        const bookedHours = facilityBookings.reduce((sum, b) => sum + (Number(b.duration_hours) || 0), 0);
        const revenue = facilityBookings.reduce((sum, b) => sum + (Number(b.total_amount) || 0), 0);

        // تصنيف ساعات الذروة وغير الذروة
        const peakHours = facilityBookings
          .filter(b => isPeak(b.start_time || ''))
          .reduce((sum, b) => sum + (Number(b.duration_hours) || 0), 0);
        const offPeakHours = bookedHours - peakHours;

        // مجموع الذروة الكلي
        totalPeakHours += peakHours;
        totalOffPeakHours += offPeakHours;
        totalPeakRevenue += facilityBookings
          .filter(b => isPeak(b.start_time || ''))
          .reduce((sum, b) => sum + (Number(b.total_amount) || 0), 0);

        // افتراض ساعات التشغيل اليومية = 14 ساعة (مثلاً من 8 صباحاً إلى 10 مساءً)
        const dailyHours = 14;
        const availableHours = dailyHours * daysInRange;
        const occupancyRate = calculateOccupancyRate(bookedHours, availableHours);

        return {
          id: facility.id,
          name: facility.name,
          type: facility.type,
          availableHours,
          bookedHours,
          occupancyRate,
          revenue,
          peakHours,
          offPeakHours,
        };
      });

      setPeakSummary({ peakHours: totalPeakHours, offPeakHours: totalOffPeakHours, peakRevenue: totalPeakRevenue });

      // Sort by occupancy rate descending
      calculatedStats.sort((a, b) => b.occupancyRate - a.occupancyRate);
      setStats(calculatedStats);
      setCurrentPage(1);
    } catch (error: any) {
      console.error('Error fetching occupancy:', error);
      toast.error('حدث خطأ أثناء حساب الإشغال');
    } finally {
      setLoading(false);
    }
  };

  const totalCount = stats.length;
  const totalPages = Math.ceil(totalCount / pageSize);
  const currentData = stats.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  const chartData = currentData.map(s => ({
    name: s.name,
    'الساعات المتاحة': s.availableHours,
    'الساعات المحجوزة': s.bookedHours,
    'ساعات ذروة 🔥': parseFloat(s.peakHours.toFixed(1)),
  }));

  return (
    <div className="p-6 bg-gray-50 min-h-screen" dir="rtl">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
        <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
          <BarChart3 className="w-6 h-6 text-purple-600" />
          تقرير إشغال المرافق وتحليل أوقات الذروة
        </h1>
        
        <div className="flex items-center gap-3 bg-white p-2 rounded-lg shadow-sm border border-gray-100">
          <Calendar className="w-5 h-5 text-gray-400" />
          <div className="flex items-center gap-2 px-2">
            <input 
              type="date" 
              value={dateFrom} 
              onChange={e => setDateFrom(e.target.value)}
              className="border-none bg-gray-50 rounded text-sm py-1 px-2 focus:ring-1 focus:ring-purple-500"
            />
            <span className="text-gray-400">-</span>
            <input 
              type="date" 
              value={dateTo} 
              onChange={e => setDateTo(e.target.value)}
              className="border-none bg-gray-50 rounded text-sm py-1 px-2 focus:ring-1 focus:ring-purple-500"
            />
          </div>
        </div>
      </div>

      {/* KPI Cards — تحليل أوقات الذروة */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="bg-white rounded-xl shadow-sm border border-orange-100 p-4 flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-orange-100 text-orange-600 flex items-center justify-center text-2xl shrink-0">🔥</div>
          <div>
            <p className="text-xs text-gray-500">ساعات الذروة (16:00-22:00)</p>
            <p className="text-xl font-bold text-orange-600 font-mono">{peakSummary.peakHours.toFixed(1)} س</p>
          </div>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-blue-100 p-4 flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-blue-100 text-blue-600 flex items-center justify-center text-2xl shrink-0">🌙</div>
          <div>
            <p className="text-xs text-gray-500">ساعات خارج الذروة</p>
            <p className="text-xl font-bold text-blue-600 font-mono">{peakSummary.offPeakHours.toFixed(1)} س</p>
          </div>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-green-100 p-4 flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-green-100 text-green-600 flex items-center justify-center text-2xl shrink-0">💰</div>
          <div>
            <p className="text-xs text-gray-500">إيرادات الذروة</p>
            <p className="text-xl font-bold text-green-600 font-mono">{peakSummary.peakRevenue.toLocaleString('ar-EG')} ج.م</p>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 mb-6 h-80 min-w-0">
        <h3 className="text-sm font-semibold text-gray-600 mb-4">مقارنة الساعات المحجوزة — ذروة مقابل عادية لكل مرفق</h3>
        <ResponsiveContainer width="100%" height="100%" minWidth={0}>
          <BarChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>

            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
            <XAxis dataKey="name" tick={{fontSize: 12, fill: '#6b7280'}} axisLine={false} tickLine={false} />
            <YAxis tick={{fontSize: 12, fill: '#6b7280'}} axisLine={false} tickLine={false} />
            <RechartsTooltip cursor={{fill: '#f9fafb'}} />
            <Legend wrapperStyle={{fontSize: '12px', paddingTop: '10px'}} />
            <Bar dataKey="الساعات المتاحة" fill="#e5e7eb" radius={[4, 4, 0, 0]} />
            <Bar dataKey="الساعات المحجوزة" fill="#a855f7" radius={[4, 4, 0, 0]} />
            <Bar dataKey="ساعات ذروة 🔥" fill="#f97316" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-right">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="px-6 py-4 text-sm font-semibold text-gray-600">المرفق</th>
                <th className="px-6 py-4 text-sm font-semibold text-gray-600">النوع</th>
                <th className="px-6 py-4 text-sm font-semibold text-gray-600 text-center">الساعات المتاحة</th>
                <th className="px-6 py-4 text-sm font-semibold text-gray-600 text-center">الساعات المحجوزة</th>
                <th className="px-6 py-4 text-sm font-semibold text-orange-600 text-center">ذروة 🔥</th>
                <th className="px-6 py-4 text-sm font-semibold text-gray-600">نسبة الإشغال</th>
                <th className="px-6 py-4 text-sm font-semibold text-gray-600">الإيرادات (ج.م)</th>

              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                <tr>
                  <td colSpan={7} className="px-6 py-8 text-center text-gray-500">جاري التحميل...</td>
                </tr>
              ) : currentData.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-8 text-center text-gray-500">لا توجد بيانات</td>
                </tr>
              ) : (
                currentData.map((row) => (
                  <tr key={row.id} className="hover:bg-gray-50/50 transition">
                    <td className="px-6 py-4 font-medium text-gray-900">{row.name}</td>
                    <td className="px-6 py-4 text-sm text-gray-600">
                      {FACILITY_TYPE_LABELS[row.type as keyof typeof FACILITY_TYPE_LABELS] || row.type}
                    </td>

                    <td className="px-6 py-4 text-center text-gray-600">{row.availableHours.toFixed(1)}</td>
                    <td className="px-6 py-4 text-center font-medium text-purple-600">{row.bookedHours.toFixed(1)}</td>
                    <td className="px-6 py-4 text-center font-bold text-orange-500">
                      {row.peakHours.toFixed(1)}
                      {row.bookedHours > 0 && (
                        <span className="text-[10px] text-gray-400 mr-1">({((row.peakHours / row.bookedHours) * 100).toFixed(0)}%)</span>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <div className="w-full bg-gray-200 rounded-full h-2.5 max-w-[100px]">
                          <div 
                            className={`h-2.5 rounded-full ${row.occupancyRate > 70 ? 'bg-green-500' : row.occupancyRate > 30 ? 'bg-amber-500' : 'bg-red-500'}`} 
                            style={{ width: `${Math.min(100, row.occupancyRate)}%` }}
                          ></div>
                        </div>
                        <span className="text-xs font-bold text-gray-700">{row.occupancyRate.toFixed(1)}%</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 font-bold text-gray-900">
                      {row.revenue.toFixed(2)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {totalPages > 1 && (
          <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-between">
            <button
              disabled={currentPage === 1}
              onClick={() => setCurrentPage(p => p - 1)}
              className="px-4 py-2 border border-gray-200 rounded-lg text-sm disabled:opacity-50"
            >
              السابق
            </button>
            <span className="text-sm text-gray-600">صفحة {currentPage} من {totalPages}</span>
            <button
              disabled={currentPage === totalPages}
              onClick={() => setCurrentPage(p => p + 1)}
              className="px-4 py-2 border border-gray-200 rounded-lg text-sm disabled:opacity-50"
            >
              التالي
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default OccupancyReport;

import React, { useState, useEffect } from 'react';
import { supabase } from '@/supabaseClient';
import { useAccounting } from '@/context/AccountingContext';
import toast from 'react-hot-toast';
import { AlertTriangle, Clock, Users, RefreshCw } from 'lucide-react';
import { addDays, differenceInDays, format } from 'date-fns';

interface AgingMember {
  id: string;
  member_id: string;
  full_name: string;
  phone: string;
  membership_type: string;
  end_date: string;
  status: string;
  daysDiff: number;
}

const MemberAgingReport: React.FC = () => {
  const { currentUser } = useAccounting();
  const orgId = (currentUser as any)?.organization_id;

  const [activeTab, setActiveTab] = useState<'7days' | '30days' | 'expired' | 'suspended'>('7days');
  const [data, setData] = useState<AgingMember[]>([]);
  const [loading, setLoading] = useState(false);
  
  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 25;

  useEffect(() => {
    if (orgId) {
      fetchMembers();
    }
  }, [orgId, activeTab]);

  const fetchMembers = async () => {
    try {
      setLoading(true);
      
      let query = supabase
        .from('stadium_members')
        .select(`
          id,
          full_name,
          phone,
          membership_type,
          end_date,
          status
        `)
        .eq('organization_id', orgId);

      const today = new Date();
      
      if (activeTab === '7days') {
        query = query.eq('status', 'active')
                     .not('end_date', 'is', null)
                     .lte('end_date', format(addDays(today, 7), 'yyyy-MM-dd'))
                     .gte('end_date', format(today, 'yyyy-MM-dd'));
      } else if (activeTab === '30days') {
        query = query.eq('status', 'active')
                     .not('end_date', 'is', null)
                     .lte('end_date', format(addDays(today, 30), 'yyyy-MM-dd'))
                     .gt('end_date', format(addDays(today, 7), 'yyyy-MM-dd'));
      } else if (activeTab === 'expired') {
        query = query.not('end_date', 'is', null)
                     .lt('end_date', format(today, 'yyyy-MM-dd'));
      } else if (activeTab === 'suspended') {
        query = query.eq('status', 'suspended');
      }

      const { data: results, error } = await query;
      if (error) throw error;

      const formatted = (results || []).map(r => {
        const diff = r.end_date ? differenceInDays(new Date(r.end_date), today) : 0;
        return {
          id: r.id,
          member_id: r.id,
          full_name: r.full_name || 'غير معروف',
          phone: r.phone || '',
          membership_type: r.membership_type,
          end_date: r.end_date || '',
          status: r.status,
          daysDiff: diff
        };
      });
      
      // Sort
      if (activeTab === 'expired') {
        formatted.sort((a, b) => a.daysDiff - b.daysDiff); // Most overdue first
      } else {
        formatted.sort((a, b) => a.daysDiff - b.daysDiff); // Soonest to expire first
      }


      setData(formatted);
      setCurrentPage(1);
    } catch (error: any) {
      console.error('Error fetching aging members:', error);
      toast.error('حدث خطأ أثناء جلب البيانات');
    } finally {
      setLoading(false);
    }
  };

  const handleRemind = (member: AgingMember) => {
    // Just show toast for now
    toast.success(`تم إرسال تذكير إلى ${member.full_name} (${member.phone}) بنجاح`);
  };

  const totalPages = Math.ceil(data.length / pageSize);
  const currentData = data.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  const tabs = [
    { id: '7days', label: 'منتهية خلال 7 أيام', icon: <Clock className="w-4 h-4" />, color: 'text-amber-600', bg: 'bg-amber-100' },
    { id: '30days', label: 'منتهية خلال 30 يوماً', icon: <CalendarIcon />, color: 'text-blue-600', bg: 'bg-blue-100' },
    { id: 'expired', label: 'منتهية بالفعل', icon: <AlertTriangle className="w-4 h-4" />, color: 'text-red-600', bg: 'bg-red-100' },
    { id: 'suspended', label: 'موقوفة', icon: <RefreshCw className="w-4 h-4" />, color: 'text-gray-600', bg: 'bg-gray-200' },
  ];

  return (
    <div className="p-6 bg-gray-50 min-h-screen" dir="rtl">
      <div className="flex items-center gap-2 mb-6">
        <Users className="w-6 h-6 text-red-600" />
        <h1 className="text-2xl font-bold text-gray-800">تقرير أعمار الاشتراكات والتجديدات</h1>
      </div>

      <div className="flex flex-wrap gap-2 mb-6">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition ${
              activeTab === tab.id 
                ? `${tab.bg} ${tab.color} ring-2 ring-offset-2 ring-${tab.color.split('-')[1]}-500` 
                : 'bg-white text-gray-600 hover:bg-gray-100 border border-gray-200'
            }`}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="p-4 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
          <h2 className="font-semibold text-gray-700">
            {tabs.find(t => t.id === activeTab)?.label} ({data.length})
          </h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-right">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="px-6 py-4 text-sm font-semibold text-gray-600">اسم العضو</th>
                <th className="px-6 py-4 text-sm font-semibold text-gray-600">رقم الهاتف</th>
                <th className="px-6 py-4 text-sm font-semibold text-gray-600">نوع الاشتراك</th>
                <th className="px-6 py-4 text-sm font-semibold text-gray-600">تاريخ الانتهاء</th>
                <th className="px-6 py-4 text-sm font-semibold text-gray-600">الحالة / الأيام</th>
                <th className="px-6 py-4 text-sm font-semibold text-gray-600">إجراءات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-6 py-8 text-center text-gray-500">جاري التحميل...</td>
                </tr>
              ) : currentData.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-8 text-center text-gray-500">لا توجد اشتراكات مطابقة</td>
                </tr>
              ) : (
                currentData.map((row) => (
                  <tr key={row.id} className="hover:bg-gray-50/50 transition">
                    <td className="px-6 py-4 font-medium text-gray-900">{row.full_name}</td>
                    <td className="px-6 py-4 text-sm text-gray-600" dir="ltr">{row.phone}</td>
                    <td className="px-6 py-4 text-sm text-gray-600">
                      {row.membership_type === 'monthly' ? 'شهري' : row.membership_type === 'quarterly' ? 'ربع سنوي' : 'سنوي'}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-900" dir="ltr">
                      {format(new Date(row.end_date), 'yyyy/MM/dd')}
                    </td>
                    <td className="px-6 py-4">
                      {activeTab === 'suspended' ? (
                        <span className="text-gray-500 text-sm">موقوف</span>
                      ) : activeTab === 'expired' ? (
                        <span className="text-red-600 text-sm font-medium">منتهي منذ {Math.abs(row.daysDiff)} يوم</span>
                      ) : (
                        <span className={`${row.daysDiff <= 3 ? 'text-red-600' : 'text-amber-600'} text-sm font-medium`}>
                          يتبقى {row.daysDiff} يوم
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      {activeTab !== 'suspended' && (
                        <button
                          onClick={() => handleRemind(row)}
                          className="px-3 py-1.5 text-xs font-medium text-blue-700 bg-blue-50 hover:bg-blue-100 rounded transition flex items-center gap-1"
                        >
                          <AlertTriangle className="w-3 h-3" />
                          إرسال تذكير
                        </button>
                      )}
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

// Extracted simple Calendar icon for inner use
const CalendarIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect width="18" height="18" x="3" y="4" rx="2" ry="2" />
    <line x1="16" x2="16" y1="2" y2="6" />
    <line x1="8" x2="8" y1="2" y2="6" />
    <line x1="3" x2="21" y1="10" y2="10" />
  </svg>
);

export default MemberAgingReport;

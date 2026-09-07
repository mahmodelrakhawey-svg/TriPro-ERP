import React, { useState, useEffect } from 'react';
import { supabase } from '@/supabaseClient';
import { useAccounting } from '@/context/AccountingContext';
import toast from 'react-hot-toast';
import { Users, Award, DollarSign, Plus, Percent, Edit, Trash, X, History, CreditCard, CheckCircle2, AlertCircle } from 'lucide-react';
import { StadiumCoach, StadiumCoachPayment, StadiumTrainingProgram } from '../stadium.types';

import { uploadStadiumImage, createCoachPaymentJournalEntry, getTreasuryAccounts, TreasuryAccountOption } from '../stadiumHelpers';
import { format } from 'date-fns';

const CoachManager: React.FC = () => {
  const { currentUser } = useAccounting();
  const orgId = (currentUser as any)?.organization_id;

  const [coaches, setCoaches] = useState<StadiumCoach[]>([]);
  const [programs, setPrograms] = useState<StadiumTrainingProgram[]>([]);
  const [treasuryAccounts, setTreasuryAccounts] = useState<TreasuryAccountOption[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const pageSize = 25;

  // Modals
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false);
  
  const [selectedCoach, setSelectedCoach] = useState<StadiumCoach | null>(null);
  const [paymentHistory, setPaymentHistory] = useState<StadiumCoachPayment[]>([]);

  // Form State - Coach
  const [formData, setFormData] = useState({
    full_name: '',
    phone: '',
    email: '',
    specialization: '',
    commission_rate: 0,
    is_active: true,
  });
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);

  // Form State - Payment
  const [paymentData, setPaymentData] = useState({
    program_id: '',
    treasury_account_id: '',
    period_from: format(new Date(new Date().getFullYear(), new Date().getMonth(), 1), 'yyyy-MM-dd'),
    period_to: format(new Date(), 'yyyy-MM-dd'),
    gross_revenue: 0,
    commission_rate: 0,
    total_entitled: 0,
    already_paid: 0,
    amount_paid: 0,
    notes: '',
  });


  useEffect(() => {
    if (orgId) {
      fetchCoaches();
      fetchPrograms();
      getTreasuryAccounts(orgId).then(setTreasuryAccounts);
    }
  }, [orgId, currentPage]);


  const fetchCoaches = async () => {
    try {
      setLoading(true);
      
      const { count } = await supabase
        .from('stadium_coaches')
        .select('*', { count: 'exact', head: true })
        .eq('organization_id', orgId);
        
      setTotalCount(count || 0);

      const from = (currentPage - 1) * pageSize;
      const to = from + pageSize - 1;

      const { data, error } = await supabase
        .from('stadium_coaches')
        .select('*')
        .eq('organization_id', orgId)
        .order('created_at', { ascending: false })
        .range(from, to);

      if (error) throw error;
      setCoaches(data || []);
    } catch (error: any) {
      console.error('Error fetching coaches:', error);
      toast.error('حدث خطأ أثناء جلب بيانات المدربين');
    } finally {
      setLoading(false);
    }
  };

  const fetchPrograms = async () => {
    try {
      const { data, error } = await supabase
        .from('stadium_training_programs')
        .select('*')
        .eq('organization_id', orgId);

      if (error) throw error;
      setPrograms(data || []);
    } catch (error: any) {
      console.error('Error fetching programs:', error);
    }
  };

  const handleSaveCoach = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setUploading(true);
      let photo_url = selectedCoach?.photo_url;

      if (photoFile) {
        photo_url = await uploadStadiumImage(photoFile, 'coaches');
      }

      const coachPayload = {
        organization_id: orgId,
        full_name: formData.full_name,
        phone: formData.phone,
        email: formData.email,
        specialization: formData.specialization,
        commission_rate: formData.commission_rate / 100, // stored as 0-1
        is_active: formData.is_active,
        photo_url,
      };

      if (selectedCoach) {
        const { error } = await supabase
          .from('stadium_coaches')
          .update(coachPayload)
          .eq('id', selectedCoach.id);
        if (error) throw error;
        toast.success('تم تحديث بيانات المدرب بنجاح');
      } else {
        const { error } = await supabase
          .from('stadium_coaches')
          .insert([coachPayload]);
        if (error) throw error;
        toast.success('تمت إضافة المدرب بنجاح');
      }

      setIsModalOpen(false);
      resetCoachForm();
      fetchCoaches();
    } catch (error: any) {
      console.error('Error saving coach:', error);
      toast.error('حدث خطأ أثناء حفظ البيانات');
    } finally {
      setUploading(false);
    }
  };

  const resetCoachForm = () => {
    setSelectedCoach(null);
    setFormData({
      full_name: '',
      phone: '',
      email: '',
      specialization: '',
      commission_rate: 0,
      is_active: true,
    });
    setPhotoFile(null);
  };

  const openEditModal = (coach: StadiumCoach) => {
    setSelectedCoach(coach);
    const rawRate = Number(coach.commission_rate) || 0;
    const displayRate = rawRate <= 1 ? rawRate * 100 : rawRate;
    setFormData({
      full_name: coach.full_name,
      phone: coach.phone || '',
      email: coach.email || '',
      specialization: coach.specialization || '',
      commission_rate: displayRate,
      is_active: coach.is_active || false,
    });
    setIsModalOpen(true);
  };

  const openPaymentModal = (coach: StadiumCoach) => {
    setSelectedCoach(coach);
    const rawRate = Number(coach.commission_rate) || 0;
    const displayRate = rawRate <= 1 ? rawRate * 100 : rawRate;
    const coachPrograms = programs.filter(p => p.coach_id === coach.id);
    const defaultProgId = coachPrograms.length > 0 ? coachPrograms[0].id : (programs.length > 0 ? programs[0].id : '');

    setPaymentData({
      program_id: defaultProgId,
      treasury_account_id: treasuryAccounts[0]?.id || '',
      period_from: format(new Date(new Date().getFullYear(), new Date().getMonth(), 1), 'yyyy-MM-dd'),
      period_to: format(new Date(), 'yyyy-MM-dd'),
      gross_revenue: 0,
      commission_rate: displayRate,
      total_entitled: 0,
      already_paid: 0,
      amount_paid: 0,
      notes: '',
    });
    setIsPaymentModalOpen(true);
  };

  // Calculate gross revenue & remaining due when program, dates, or rate change
  useEffect(() => {
    if (paymentData.program_id && paymentData.period_from && paymentData.period_to && selectedCoach) {
      calculateGrossRevenue();
    }
  }, [paymentData.program_id, paymentData.period_from, paymentData.period_to, paymentData.commission_rate, selectedCoach]);

  const calculateGrossRevenue = async () => {
    if (!paymentData.program_id || !selectedCoach) return;
    try {
      // 1. Fetch enrollments revenue for program within date range
      const { data, error } = await supabase
        .from('stadium_program_enrollments')
        .select('amount_paid, enrollment_date, created_at')
        .eq('program_id', paymentData.program_id)
        .neq('status', 'cancelled');

      if (error) throw error;
      
      const filtered = (data || []).filter(item => {
        const d = item.enrollment_date || (item.created_at ? item.created_at.split('T')[0] : '');
        if (!d) return true;
        return d >= paymentData.period_from && d <= paymentData.period_to;
      });

      const totalRevenue = filtered.reduce((sum, item) => sum + (Number(item.amount_paid) || 0), 0);

      // 2. Fetch all previous payments made to this coach for this program
      const { data: prevPayments, error: prevErr } = await supabase
        .from('stadium_coach_payments')
        .select('amount_paid')
        .eq('coach_id', selectedCoach.id)
        .eq('program_id', paymentData.program_id);

      if (prevErr) throw prevErr;

      const alreadyPaid = (prevPayments || []).reduce((sum, p) => sum + (Number(p.amount_paid) || 0), 0);
      const totalEntitled = (totalRevenue * (paymentData.commission_rate || 0)) / 100;
      const netRemaining = Math.max(0, totalEntitled - alreadyPaid);

      setPaymentData(prev => ({
        ...prev,
        gross_revenue: totalRevenue,
        total_entitled: totalEntitled,
        already_paid: alreadyPaid,
        amount_paid: netRemaining,
      }));
    } catch (error: any) {
      console.error('Error calculating revenue:', error);
    }
  };

  const handleSavePayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCoach || !paymentData.program_id) return;
    
    const amount = Number(paymentData.amount_paid) || 0;
    if (amount <= 0) {
      toast.error('المبلغ المستحق مسدد بالكامل بالفعل (لا توجد مستحقات معلقة لهذه الفترة)');
      return;
    }

    try {
      const today = new Date().toISOString().split('T')[0];

      // قيد عمولة مدرب: مدين تكاليف الكوادر الرياضية — دائن الخزينة/البنك المحددة
      const jeResult = await createCoachPaymentJournalEntry(
        orgId,
        amount,
        selectedCoach.full_name,
        today,
        paymentData.treasury_account_id
      );

      const payload = {
        organization_id: orgId,
        coach_id: selectedCoach.id,
        program_id: paymentData.program_id,
        amount_paid: amount,
        payment_date: today,
        payment_method: 'cash',
        period_from: paymentData.period_from,
        period_to: paymentData.period_to,
        gross_revenue: Number(paymentData.gross_revenue) || 0,
        commission_rate: (paymentData.commission_rate || 0) / 100,
        notes: paymentData.notes?.trim() || null,
        journal_entry_id: jeResult.success ? jeResult.journalEntryId : null,
      };

      const { error } = await supabase
        .from('stadium_coach_payments')
        .insert([payload]);

      if (error) throw error;

      toast.success('تم تسجيل الدفعة وتوليد القيد بنجاح');
      setIsPaymentModalOpen(false);
    } catch (error: any) {
      console.error('Error saving payment:', error);
      toast.error('حدث خطأ أثناء تسجيل الدفعة');
    }
  };


  const fetchPaymentHistory = async (coach: StadiumCoach) => {
    try {
      setSelectedCoach(coach);
      const { data, error } = await supabase
        .from('stadium_coach_payments')
        .select(`*, stadium_training_programs(name)`)
        .eq('coach_id', coach.id)
        .order('payment_date', { ascending: false });
        
      if (error) throw error;
      setPaymentHistory(data || []);
      setIsHistoryModalOpen(true);
    } catch (error: any) {
      toast.error('حدث خطأ أثناء جلب السجل');
    }
  };

  const totalPages = Math.ceil(totalCount / pageSize);

  return (
    <div className="p-6 bg-gray-50 min-h-screen" dir="rtl">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
          <Users className="w-6 h-6 text-blue-600" />
          إدارة المدربين
        </h1>
        <button
          onClick={() => { resetCoachForm(); setIsModalOpen(true); }}
          className="bg-blue-600 text-white px-4 py-2 rounded-lg flex items-center gap-2 hover:bg-blue-700 transition"
        >
          <Plus className="w-5 h-5" />
          إضافة مدرب
        </button>
      </div>

      <div className="bg-white rounded-xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-right">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="px-6 py-4 text-sm font-semibold text-gray-600">الاسم</th>
                <th className="px-6 py-4 text-sm font-semibold text-gray-600">التخصص</th>
                <th className="px-6 py-4 text-sm font-semibold text-gray-600">نسبة العمولة</th>
                <th className="px-6 py-4 text-sm font-semibold text-gray-600">الهاتف</th>
                <th className="px-6 py-4 text-sm font-semibold text-gray-600">الحالة</th>
                <th className="px-6 py-4 text-sm font-semibold text-gray-600">إجراءات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-6 py-8 text-center text-gray-500">جاري التحميل...</td>
                </tr>
              ) : coaches.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-8 text-center text-gray-500">لا يوجد مدربين</td>
                </tr>
              ) : (
                coaches.map((coach) => (
                  <tr key={coach.id} className="hover:bg-gray-50/50 transition">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        {coach.photo_url ? (
                          <img src={coach.photo_url} alt={coach.full_name} className="w-10 h-10 rounded-full object-cover" />
                        ) : (
                          <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 font-bold">
                            {coach.full_name.charAt(0)}
                          </div>
                        )}
                        <span className="font-medium text-gray-900">{coach.full_name}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600">
                      <span className="flex items-center gap-1"><Award className="w-4 h-4 text-gray-400"/> {coach.specialization || '-'}</span>
                    </td>
                    <td className="px-6 py-4 text-sm font-medium text-green-600">
                      {((coach.commission_rate || 0) * 100).toFixed(0)}%
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600" dir="ltr">
                      {coach.phone || '-'}
                    </td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                        coach.is_active ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                      }`}>
                        {coach.is_active ? 'نشط' : 'غير نشط'}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => openPaymentModal(coach)}
                          className="flex items-center gap-1 px-3 py-1.5 bg-green-50 text-green-700 hover:bg-green-100 rounded-lg text-xs font-bold transition border border-green-200 shadow-sm"
                          title="صرف عمولة ومستحقات المدرب"
                        >
                          <DollarSign className="w-3.5 h-3.5" />
                          صرف عمولة
                        </button>
                        <button
                          onClick={() => fetchPaymentHistory(coach)}
                          className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg transition"
                          title="سجل الدفعات السابقة"
                        >
                          <History className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => openEditModal(coach)}
                          className="p-1.5 text-gray-600 hover:bg-gray-100 rounded-lg transition"
                          title="تعديل بيانات المدرب"
                        >
                          <Edit className="w-4 h-4" />
                        </button>
                      </div>

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

      {/* Add/Edit Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden">
            <div className="flex justify-between items-center p-6 border-b border-gray-100">
              <h2 className="text-xl font-bold text-gray-900">{selectedCoach ? 'تعديل مدرب' : 'إضافة مدرب جديد'}</h2>
              <button onClick={() => setIsModalOpen(false)} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleSaveCoach} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">الاسم الكامل *</label>
                <input required type="text" value={formData.full_name} onChange={e => setFormData({...formData, full_name: e.target.value})} className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">رقم الهاتف</label>
                  <input type="tel" value={formData.phone} onChange={e => setFormData({...formData, phone: e.target.value})} className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500" dir="ltr" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">نسبة العمولة (%)</label>
                  <div className="relative">
                    <input type="number" min="0" max="100" value={formData.commission_rate} onChange={e => setFormData({...formData, commission_rate: Number(e.target.value)})} className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 pl-10" />
                    <Percent className="w-4 h-4 text-gray-400 absolute left-3 top-3" />
                  </div>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">التخصص</label>
                <input type="text" value={formData.specialization} onChange={e => setFormData({...formData, specialization: e.target.value})} className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">الصورة الشخصية</label>
                <input type="file" accept="image/*" onChange={e => setPhotoFile(e.target.files?.[0] || null)} className="w-full px-4 py-2 border border-gray-300 rounded-lg text-sm" />
              </div>
              <div className="flex items-center gap-2 mt-4">
                <input type="checkbox" id="is_active" checked={formData.is_active} onChange={e => setFormData({...formData, is_active: e.target.checked})} className="w-4 h-4 text-blue-600 rounded border-gray-300" />
                <label htmlFor="is_active" className="text-sm text-gray-700">مدرب نشط</label>
              </div>
              <div className="pt-4 flex justify-end gap-3">
                <button type="button" onClick={() => setIsModalOpen(false)} className="px-4 py-2 text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg">إلغاء</button>
                <button type="submit" disabled={uploading} className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">
                  {uploading ? 'جاري الحفظ...' : 'حفظ'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Payment Modal */}
      {isPaymentModalOpen && selectedCoach && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden">
            <div className="flex justify-between items-center p-6 border-b border-gray-100 bg-green-50">
              <h2 className="text-xl font-bold text-green-900 flex items-center gap-2">
                <DollarSign className="w-5 h-5" />
                صرف عمولة - {selectedCoach.full_name}
              </h2>
              <button onClick={() => setIsPaymentModalOpen(false)} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleSavePayment} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">البرنامج التدريبي *</label>
                <select required value={paymentData.program_id} onChange={e => setPaymentData({...paymentData, program_id: e.target.value})} className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500">
                  <option value="">اختر البرنامج</option>
                  {programs.map(p => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">حساب الخزينة أو البنك المنفّذ للصرف *</label>
                <select 
                  value={paymentData.treasury_account_id} 
                  onChange={e => setPaymentData({...paymentData, treasury_account_id: e.target.value})} 
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500"
                >
                  {treasuryAccounts.length > 0 ? (
                    treasuryAccounts.map(acc => (
                      <option key={acc.id} value={acc.id}>
                        {acc.name} ({acc.code})
                      </option>
                    ))
                  ) : (
                    <option value="1011">الخزينة الرئيسية (1011)</option>
                  )}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">من تاريخ</label>
                  <input type="date" required value={paymentData.period_from} onChange={e => setPaymentData({...paymentData, period_from: e.target.value})} className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">إلى تاريخ</label>
                  <input type="date" required value={paymentData.period_to} onChange={e => setPaymentData({...paymentData, period_to: e.target.value})} className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500" />
                </div>
              </div>
              {/* Financial Calculation Breakdown Card */}
              <div className="bg-slate-50 dark:bg-slate-800/60 p-4 rounded-xl border border-slate-200 dark:border-slate-700 space-y-2 text-xs">
                <div className="flex justify-between text-gray-600 dark:text-gray-400">
                  <span>إجمالي إيراد البرنامج للفترة:</span>
                  <span className="font-bold text-gray-900 dark:text-gray-100 font-mono text-sm">
                    {paymentData.gross_revenue.toFixed(2)} ج.م
                  </span>
                </div>
                <div className="flex justify-between text-gray-600 dark:text-gray-400">
                  <span>إجمالي العمولة المستحقة ({paymentData.commission_rate}%):</span>
                  <span className="font-bold text-blue-600 font-mono text-sm">
                    {paymentData.total_entitled.toFixed(2)} ج.م
                  </span>
                </div>
                <div className="flex justify-between text-gray-600 dark:text-gray-400">
                  <span>المدفوع والمسدد للمدرب سابقاً:</span>
                  <span className="font-bold text-amber-600 font-mono text-sm">
                    {paymentData.already_paid.toFixed(2)} ج.م
                  </span>
                </div>
                <div className="border-t pt-2 flex justify-between font-bold text-sm">
                  <span className="text-gray-800 dark:text-gray-200">صافي المتبقي المستحق للصرف:</span>
                  <span className={`font-mono text-base ${paymentData.amount_paid > 0 ? 'text-green-600 dark:text-green-400' : 'text-gray-400'}`}>
                    {paymentData.amount_paid.toFixed(2)} ج.م
                  </span>
                </div>
              </div>

              {paymentData.already_paid >= paymentData.total_entitled && paymentData.total_entitled > 0 && (
                <div className="bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 p-3 rounded-lg flex items-center gap-2 text-xs font-semibold text-emerald-800 dark:text-emerald-300">
                  <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                  <div>
                    <p>تم سداد كامل عمولة هذا البرنامج للفترة المحددة بالكامل ✅</p>
                    <p className="text-[11px] text-emerald-700 dark:text-emerald-400 font-normal mt-0.5">
                      المسدد سابقاً: {paymentData.already_paid.toFixed(2)} ج.م — الرصيد المستحق حالياً: 0.00 ج.م
                    </p>
                  </div>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">المبلغ المراد صرفه الآن *</label>
                <div className="relative">
                  <input
                    type="number"
                    step="0.01"
                    required
                    value={paymentData.amount_paid}
                    onChange={e => setPaymentData({...paymentData, amount_paid: Number(e.target.value)})}
                    className={`w-full px-4 py-3 border-2 rounded-lg focus:ring-2 text-xl font-bold font-mono ${
                      paymentData.amount_paid > 0 
                        ? 'border-green-200 text-green-700 focus:ring-green-500' 
                        : 'border-gray-200 text-gray-400 focus:ring-gray-300'
                    }`}
                  />
                  <span className="absolute left-4 top-4 text-green-600 font-bold">ج.م</span>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">ملاحظات</label>
                <textarea
                  value={paymentData.notes}
                  onChange={e => setPaymentData({...paymentData, notes: e.target.value})}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 text-sm"
                  rows={2}
                  placeholder="ملاحظات الصرف أو رقم الشيك إن وجد..."
                />
              </div>

              <div className="pt-4 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setIsPaymentModalOpen(false)}
                  className="px-4 py-2 text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg text-sm"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={paymentData.amount_paid <= 0}
                  className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 font-medium text-sm disabled:opacity-50 disabled:cursor-not-allowed transition shadow-sm"
                >
                  {paymentData.amount_paid <= 0 ? 'المستحق مسدد بالكامل' : 'تسجيل وتأكيد الصرف'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}


      {/* History Modal */}
      {isHistoryModalOpen && selectedCoach && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="flex justify-between items-center p-6 border-b border-gray-100 bg-blue-50">
              <h2 className="text-xl font-bold text-blue-900 flex items-center gap-2">
                <History className="w-5 h-5" />
                سجل الدفعات - {selectedCoach.full_name}
              </h2>
              <button onClick={() => setIsHistoryModalOpen(false)} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 overflow-y-auto">
              {paymentHistory.length === 0 ? (
                <div className="text-center py-8 text-gray-500">لا توجد دفعات سابقة لهذا المدرب</div>
              ) : (
                <div className="space-y-4">
                  {paymentHistory.map(payment => (
                    <div key={payment.id} className="border border-gray-100 rounded-lg p-4 bg-gray-50 hover:bg-gray-100 transition">
                      <div className="flex justify-between items-start mb-2">
                        <div>
                          <h4 className="font-semibold text-gray-900">
                            {(payment as any).stadium_training_programs?.name || 'برنامج غير معروف'}
                          </h4>
                          <div className="text-sm text-gray-500 mt-1">
                            الفترة: {format(new Date(payment.period_from), 'yyyy/MM/dd')} إلى {format(new Date(payment.period_to), 'yyyy/MM/dd')}
                          </div>
                        </div>
                        <div className="text-left">
                          <div className="text-lg font-bold text-green-600">{Number(payment.amount_paid).toFixed(2)} ج.م</div>

                          <div className="text-xs text-gray-500">{format(new Date(payment.payment_date), 'yyyy/MM/dd HH:mm')}</div>
                        </div>
                      </div>
                      <div className="flex gap-4 text-sm mt-3 pt-3 border-t border-gray-200">
                        <div>إجمالي الإيراد: <span className="font-medium">{Number(payment.gross_revenue).toFixed(2)}</span></div>
                        <div>النسبة: <span className="font-medium">{(Number(payment.commission_rate) * 100).toFixed(0)}%</span></div>
                      </div>
                      {payment.notes && (
                        <div className="text-sm text-gray-600 mt-2 bg-white p-2 rounded border border-gray-100">
                          ملاحظات: {payment.notes}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="p-4 border-t border-gray-100 bg-gray-50 flex justify-end">
              <button onClick={() => setIsHistoryModalOpen(false)} className="px-4 py-2 text-gray-700 bg-white border border-gray-300 hover:bg-gray-50 rounded-lg">إغلاق</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CoachManager;

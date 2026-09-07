import React, { useState, useEffect } from 'react';
import { supabase } from '@/supabaseClient';
import { useAccounting } from '@/context/AccountingContext';
import toast from 'react-hot-toast';
import { 
  BookOpen, Users, Plus, Award, Calendar, TrendingUp, ChevronLeft, ChevronRight, X, Printer 
} from 'lucide-react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';

// Types
import { StadiumTrainingProgram, StadiumProgramEnrollment, StadiumCoach } from '../stadium.types';
import { createProgramEnrollmentJournalEntry, getTreasuryAccounts, TreasuryAccountOption } from '../stadiumHelpers';
import { ReceiptModal, ReceiptData } from './ReceiptModal';


const programSchema = z.object({
  name: z.string().min(1, { message: 'اسم البرنامج مطلوب' }),
  category: z.string().min(1, { message: 'التصنيف مطلوب' }),
  coach_id: z.string().min(1, { message: 'المدرب مطلوب' }),
  start_date: z.string().min(1, { message: 'تاريخ البداية مطلوب' }),
  end_date: z.string().min(1, { message: 'تاريخ النهاية مطلوب' }),
  schedule_description: z.string().optional(),
  capacity: z.number().min(1, { message: 'السعة مطلوبة' }),
  fee_per_participant: z.number().min(0, { message: 'الرسوم مطلوبة' }),
});
type ProgramFormValues = z.infer<typeof programSchema>;

const enrollmentSchema = z.object({
  participant_name: z.string().min(1, { message: 'اسم المشترك مطلوب' }),
  participant_phone: z.string().min(1, { message: 'رقم الهاتف مطلوب' }),
  member_id: z.string().optional(),
  amount_paid: z.number().min(0, { message: 'المبلغ المدفوع مطلوب' }),
  payment_method: z.enum(['cash', 'bank_transfer', 'card', 'cheque']),
  treasury_account_id: z.string().optional(),
  cheque_number: z.string().optional(),
  bank_name: z.string().optional(),
  due_date: z.string().optional(),
});
type EnrollmentFormValues = z.infer<typeof enrollmentSchema>;


const PROGRAMS_PER_PAGE = 12;
const ENROLLMENTS_PER_PAGE = 25;

const TrainingProgramManager: React.FC = () => {
  const { currentUser } = useAccounting();
  const orgId = (currentUser as any)?.organization_id;

  const [programs, setPrograms] = useState<StadiumTrainingProgram[]>([]);
  const [coaches, setCoaches] = useState<StadiumCoach[]>([]);
  const [treasuryAccounts, setTreasuryAccounts] = useState<TreasuryAccountOption[]>([]);
  const [totalPrograms, setTotalPrograms] = useState(0);
  const [currentProgramPage, setCurrentProgramPage] = useState(1);
  const [loadingPrograms, setLoadingPrograms] = useState(false);

  // Selected Program Details
  const [selectedProgram, setSelectedProgram] = useState<StadiumTrainingProgram | null>(null);
  const [enrollments, setEnrollments] = useState<StadiumProgramEnrollment[]>([]);
  const [totalEnrollments, setTotalEnrollments] = useState(0);
  const [currentEnrollmentPage, setCurrentEnrollmentPage] = useState(1);
  const [loadingEnrollments, setLoadingEnrollments] = useState(false);

  // Modals
  const [isProgramModalOpen, setIsProgramModalOpen] = useState(false);
  const [isEnrollmentModalOpen, setIsEnrollmentModalOpen] = useState(false);
  const [receiptModalData, setReceiptModalData] = useState<ReceiptData | null>(null);


  const { register: registerProgram, handleSubmit: handleProgramSubmit, reset: resetProgram, formState: { errors: programErrors } } = useForm<ProgramFormValues>({
    resolver: zodResolver(programSchema),
    defaultValues: { capacity: 10, fee_per_participant: 0 }
  });

  const { register: registerEnrollment, handleSubmit: handleEnrollmentSubmit, reset: resetEnrollment, watch: watchEnrollment, formState: { errors: enrollmentErrors } } = useForm<EnrollmentFormValues>({
    resolver: zodResolver(enrollmentSchema),
    defaultValues: { payment_method: 'cash', amount_paid: 0 }
  });


  useEffect(() => {
    if (orgId) {
      fetchCoaches();
      fetchPrograms();
      getTreasuryAccounts(orgId).then(setTreasuryAccounts);
    }
  }, [orgId, currentProgramPage]);


  useEffect(() => {
    if (selectedProgram) {
      fetchEnrollments();
    }
  }, [selectedProgram, currentEnrollmentPage]);

  const fetchCoaches = async () => {
    const { data } = await supabase.from('stadium_coaches').select('*').eq('organization_id', orgId);
    if (data) setCoaches(data);
  };

  const fetchPrograms = async () => {
    setLoadingPrograms(true);
    const start = (currentProgramPage - 1) * PROGRAMS_PER_PAGE;
    const end = start + PROGRAMS_PER_PAGE - 1;

    const { data, count, error } = await supabase
      .from('stadium_training_programs')
      .select('*, coach:stadium_coaches(*)', { count: 'exact' })
      .eq('organization_id', orgId)
      .order('created_at', { ascending: false })
      .range(start, end);

    if (!error && data) {
      setPrograms(data);
      setTotalPrograms(count || 0);
    }
    setLoadingPrograms(false);
  };

  const fetchEnrollments = async () => {
    if (!selectedProgram) return;
    setLoadingEnrollments(true);
    const start = (currentEnrollmentPage - 1) * ENROLLMENTS_PER_PAGE;
    const end = start + ENROLLMENTS_PER_PAGE - 1;

    const { data, count, error } = await supabase
      .from('stadium_program_enrollments')
      .select('*', { count: 'exact' })
      .eq('program_id', selectedProgram.id)
      .order('enrollment_date', { ascending: false })
      .range(start, end);

    if (!error && data) {
      setEnrollments(data);
      setTotalEnrollments(count || 0);
    }
    setLoadingEnrollments(false);
  };

  const onSubmitProgram = async (data: ProgramFormValues) => {
    const newProgram = {
      organization_id: orgId,
      name: data.name?.trim(),
      category: data.category?.trim() || null,
      coach_id: data.coach_id || null,
      start_date: data.start_date,
      end_date: data.end_date,
      schedule_description: data.schedule_description?.trim() || null,
      capacity: data.capacity || 20,
      fee_per_participant: data.fee_per_participant || 0,
      enrolled_count: 0,
      is_active: true
    };
    const { error } = await supabase.from('stadium_training_programs').insert([newProgram]);
    if (error) {
      toast.error('حدث خطأ أثناء إنشاء البرنامج');
    } else {
      toast.success('تم إنشاء البرنامج بنجاح');
      setIsProgramModalOpen(false);
      resetProgram();
      fetchPrograms();
    }
  };

  const onSubmitEnrollment = async (data: EnrollmentFormValues) => {
    if (!selectedProgram) return;

    if (selectedProgram.enrolled_count >= selectedProgram.capacity) {
      toast.error('البرنامج ممتلئ');
      return;
    }

    const today = new Date().toISOString().split('T')[0];
    const amount = Number(data.amount_paid) || 0;

    if (data.payment_method === 'cheque') {
      if (!data.cheque_number?.trim()) {
        toast.error('يرجى إدخال رقم الشيك');
        return;
      }
      if (!data.bank_name?.trim()) {
        toast.error('يرجى إدخال اسم البنك المسحوب عليه');
        return;
      }
    }

    const chequeDetails = data.payment_method === 'cheque' ? {
      cheque_number: data.cheque_number?.trim() || '',
      bank_name: data.bank_name?.trim() || '',
      due_date: data.due_date || today,
      party_name: data.participant_name,
      notes: `رسوم برنامج: ${selectedProgram.name} — ${data.participant_name}`
    } : undefined;

    // قيد رسوم برنامج: مدين الخزينة/البنك أو أوراق القبض — دائن إيرادات البرامج التدريبية
    const jeResult = await createProgramEnrollmentJournalEntry(
      orgId,
      amount,
      `رسوم برنامج: ${selectedProgram.name} — ${data.participant_name}`,
      today,
      data.treasury_account_id,
      data.payment_method,
      chequeDetails
    );



    const newEnrollment = {
      organization_id: orgId,
      program_id: selectedProgram.id,
      participant_name: data.participant_name?.trim(),
      participant_phone: data.participant_phone?.trim() || null,
      amount_paid: amount,
      payment_method: data.payment_method || 'cash',
      enrollment_date: today,
      journal_entry_id: jeResult.success ? jeResult.journalEntryId : null,
      status: 'active'
    };

    const { error: enrollError } = await supabase.from('stadium_program_enrollments').insert([newEnrollment]);
    if (enrollError) {
      toast.error('حدث خطأ أثناء التسجيل');
      return;
    }


    const { error: updateError } = await supabase
      .from('stadium_training_programs')
      .update({ enrolled_count: selectedProgram.enrolled_count + 1 })
      .eq('id', selectedProgram.id);

    if (!updateError) {
      toast.success('تم التسجيل بنجاح');
      setIsEnrollmentModalOpen(false);

      // Open receipt modal
      setReceiptModalData({
        receiptNumber: `PRG-${Math.floor(100000 + Math.random() * 900000)}`,
        receiptDate: today,
        receiptTypeLabel: 'إيصال سداد رسوم برنامج تدريبي وأكاديمية',
        partyName: data.participant_name,
        partyPhone: data.participant_phone,
        amount: amount,
        paymentMethod: data.payment_method || 'cash',
        facilityOrProgramName: `برنامج: ${selectedProgram.name}`,
        periodOrDuration: `${selectedProgram.start_date} إلى ${selectedProgram.end_date}`,
        chequeNumber: data.cheque_number,
        bankName: data.bank_name,
        notes: `اشتراك متدرب في ${selectedProgram.name}`,
      });

      resetEnrollment();
      
      // Update local state to reflect new count
      setSelectedProgram(prev => prev ? { ...prev, enrolled_count: prev.enrolled_count + 1 } : null);
      
      fetchEnrollments();
      fetchPrograms(); // Refresh grid
    }
  };


  const cancelEnrollment = async (enrollmentId: string) => {
    if (!window.confirm('هل أنت متأكد من إلغاء هذا الاشتراك؟')) return;

    const { error } = await supabase
      .from('stadium_program_enrollments')
      .update({ status: 'cancelled' })
      .eq('id', enrollmentId);

    if (!error && selectedProgram) {
      await supabase
        .from('stadium_training_programs')
        .update({ enrolled_count: Math.max(0, selectedProgram.enrolled_count - 1) })
        .eq('id', selectedProgram.id);
      
      toast.success('تم إلغاء الاشتراك');
      setSelectedProgram(prev => prev ? { ...prev, enrolled_count: Math.max(0, prev.enrolled_count - 1) } : null);
      fetchEnrollments();
      fetchPrograms();
    } else {
      toast.error('حدث خطأ أثناء الإلغاء');
    }
  };

  if (selectedProgram) {
    return (
      <div className="p-6 bg-gray-50 min-h-screen" dir="rtl">
        <button 
          onClick={() => setSelectedProgram(null)}
          className="mb-4 flex items-center text-gray-600 hover:text-indigo-600"
        >
          <ChevronRight size={20} />
          العودة للبرامج
        </button>

        <div className="bg-white p-6 rounded-lg shadow-sm border mb-6 flex justify-between items-start">
          <div>
            <h1 className="text-2xl font-bold text-gray-800 mb-2">{selectedProgram.name}</h1>
            <div className="flex gap-4 text-sm text-gray-600">
              <span className="flex items-center gap-1"><Award size={16}/> {(selectedProgram as any).coach?.name || 'بدون مدرب'}</span>
              <span className="flex items-center gap-1"><Calendar size={16}/> {selectedProgram.start_date} - {selectedProgram.end_date}</span>
            </div>
          </div>
          <button
            onClick={() => setIsEnrollmentModalOpen(true)}
            className="bg-indigo-600 text-white px-4 py-2 rounded-md hover:bg-indigo-700 flex items-center gap-2"
            disabled={selectedProgram.enrolled_count >= selectedProgram.capacity}
          >
            <Plus size={18} />
            تسجيل مشترك
          </button>
        </div>

        <div className="bg-white rounded-lg shadow overflow-hidden">
          <div className="p-4 border-b bg-gray-50">
            <h2 className="font-bold text-lg flex items-center gap-2">
              <Users className="text-indigo-600" />
              المشتركين ({totalEnrollments})
            </h2>
          </div>
          <table className="w-full text-right">
            <thead className="bg-gray-100">
              <tr>
                <th className="p-3">اسم المشترك</th>
                <th className="p-3">رقم الهاتف</th>
                <th className="p-3">تاريخ التسجيل</th>
                <th className="p-3">المبلغ المدفوع</th>
                <th className="p-3">الحالة</th>
                <th className="p-3 text-center">إجراءات</th>
              </tr>
            </thead>
            <tbody>
              {loadingEnrollments ? (
                <tr><td colSpan={6} className="p-4 text-center">جاري التحميل...</td></tr>
              ) : enrollments.length === 0 ? (
                <tr><td colSpan={6} className="p-4 text-center">لا يوجد مشتركين</td></tr>
              ) : (
                enrollments.map(en => (
                  <tr key={en.id} className="border-t hover:bg-gray-50">
                    <td className="p-3 font-medium">{en.participant_name}</td>
                    <td className="p-3">{en.participant_phone}</td>
                    <td className="p-3">{new Date(en.enrollment_date).toLocaleDateString()}</td>
                    <td className="p-3 text-green-600">{en.amount_paid}</td>
                    <td className="p-3">
                      <span className={`px-2 py-1 rounded text-xs ${en.status === 'active' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                        {en.status === 'active' ? 'نشط' : 'ملغي'}
                      </span>
                    </td>
                    <td className="p-3 text-center flex justify-center gap-1.5 items-center">
                      <button
                        onClick={() => {
                          setReceiptModalData({
                            receiptNumber: `PRG-${en.id.substring(0, 6).toUpperCase()}`,
                            receiptDate: en.enrollment_date,
                            receiptTypeLabel: 'إيصال سداد رسوم برنامج تدريبي وأكاديمية',
                            partyName: en.participant_name,
                            partyPhone: en.participant_phone || undefined,
                            amount: en.amount_paid,
                            paymentMethod: en.payment_method || 'cash',
                            facilityOrProgramName: `برنامج: ${selectedProgram.name}`,
                            periodOrDuration: `${selectedProgram.start_date} إلى ${selectedProgram.end_date}`,
                            notes: `اشتراك متدرب في ${selectedProgram.name}`,
                          });
                        }}
                        className="p-1 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 rounded text-xs inline-flex items-center gap-1"
                        title="طباعة إيصال الاشتراك"
                      >
                        <Printer size={14} />
                      </button>
                      {en.status === 'active' && (
                        <button 
                          onClick={() => cancelEnrollment(en.id)}
                          className="text-red-600 hover:text-red-800 p-1 bg-red-50 rounded"
                          title="إلغاء الاشتراك"
                        >
                          <X size={16} />
                        </button>
                      )}
                    </td>

                  </tr>
                ))
              )}
            </tbody>
          </table>
          {totalEnrollments > ENROLLMENTS_PER_PAGE && (
            <div className="flex items-center justify-between p-4 border-t bg-gray-50">
              <span className="text-sm text-gray-600">إجمالي: {totalEnrollments}</span>
              <div className="flex gap-2">
                <button
                  disabled={currentEnrollmentPage === 1}
                  onClick={() => setCurrentEnrollmentPage(prev => prev - 1)}
                  className="p-1 rounded bg-white border hover:bg-gray-100 disabled:opacity-50"
                >
                  <ChevronRight size={20} />
                </button>
                <button
                  disabled={currentEnrollmentPage * ENROLLMENTS_PER_PAGE >= totalEnrollments}
                  onClick={() => setCurrentEnrollmentPage(prev => prev + 1)}
                  className="p-1 rounded bg-white border hover:bg-gray-100 disabled:opacity-50"
                >
                  <ChevronLeft size={20} />
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Enrollment Modal */}
        {isEnrollmentModalOpen && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-lg shadow-xl w-full max-w-md overflow-hidden">
              <div className="p-4 border-b flex justify-between items-center bg-gray-50">
                <h2 className="text-lg font-bold">تسجيل مشترك جديد</h2>
                <button onClick={() => setIsEnrollmentModalOpen(false)} className="text-gray-500 hover:text-gray-700">
                  <X size={20} />
                </button>
              </div>
              <div className="p-6">
                <form onSubmit={handleEnrollmentSubmit(onSubmitEnrollment)} className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium mb-1">اسم المشترك</label>
                    <input {...registerEnrollment('participant_name')} className="w-full border rounded p-2" />
                    {enrollmentErrors.participant_name && <p className="text-red-500 text-xs mt-1">{enrollmentErrors.participant_name.message}</p>}
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">رقم الهاتف</label>
                    <input {...registerEnrollment('participant_phone')} className="w-full border rounded p-2" />
                    {enrollmentErrors.participant_phone && <p className="text-red-500 text-xs mt-1">{enrollmentErrors.participant_phone.message}</p>}
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">المبلغ المدفوع (الرسوم: {selectedProgram.fee_per_participant})</label>
                    <input type="number" {...registerEnrollment('amount_paid', { valueAsNumber: true })} className="w-full border rounded p-2" defaultValue={selectedProgram.fee_per_participant} />
                    {enrollmentErrors.amount_paid && <p className="text-red-500 text-xs mt-1">{enrollmentErrors.amount_paid.message}</p>}
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">طريقة الدفع *</label>
                    <select {...registerEnrollment('payment_method')} className="w-full border rounded p-2">
                      <option value="cash">نقدي</option>
                      <option value="card">بطاقة مدى / POS</option>
                      <option value="bank_transfer">تحويل بنكي</option>
                      <option value="cheque">شيك مصرفي (أوراق قبض)</option>
                    </select>
                  </div>

                  {watchEnrollment('payment_method') !== 'cheque' ? (
                    <div>
                      <label className="block text-sm font-medium mb-1">حساب الخزينة أو البنك المستلم *</label>
                      <select {...registerEnrollment('treasury_account_id')} className="w-full border rounded p-2">
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
                  ) : (
                    <div className="space-y-3 bg-amber-50 dark:bg-amber-950/30 p-3 rounded-lg border border-amber-200 dark:border-amber-800">
                      <div className="text-xs font-semibold text-amber-800 dark:text-amber-300">
                        📜 بيانات شيك القبض (سيُسجل في إدارة الشيكات)
                      </div>
                      <div>
                        <label className="block mb-1 text-xs font-medium">رقم الشيك *</label>
                        <input
                          type="text"
                          placeholder="مثال: 0008812"
                          {...registerEnrollment('cheque_number')}
                          className="w-full p-2 border rounded text-sm bg-white dark:bg-gray-800"
                        />
                      </div>
                      <div>
                        <label className="block mb-1 text-xs font-medium">البنك المسحوب عليه *</label>
                        <input
                          type="text"
                          placeholder="مثال: البنك الأهلي / بنك مصر / الراجحي..."
                          {...registerEnrollment('bank_name')}
                          className="w-full p-2 border rounded text-sm bg-white dark:bg-gray-800"
                        />
                      </div>
                      <div>
                        <label className="block mb-1 text-xs font-medium">تاريخ استحقاق الشيك</label>
                        <input
                          type="date"
                          {...registerEnrollment('due_date')}
                          className="w-full p-2 border rounded text-sm bg-white dark:bg-gray-800"
                        />
                      </div>
                      <p className="text-xs text-amber-700 dark:text-amber-400">
                        💡 سيتولد قيد لأوراق القبض (1222) ويُتاح تحصيله في البنك لاحقاً.
                      </p>
                    </div>
                  )}


                  <div className="flex justify-end gap-3 mt-6">
                    <button type="button" onClick={() => setIsEnrollmentModalOpen(false)} className="px-4 py-2 border rounded text-gray-600 hover:bg-gray-50">إلغاء</button>
                    <button type="submit" className="px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700">تسجيل الدفعة والاشتراك</button>
                  </div>
                </form>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // Programs Grid View
  return (
    <div className="p-6 bg-gray-50 min-h-screen" dir="rtl">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
          <BookOpen className="text-indigo-600" />
          البرامج التدريبية والأكاديميات
        </h1>
        <button
          onClick={() => setIsProgramModalOpen(true)}
          className="bg-indigo-600 text-white px-4 py-2 rounded-md hover:bg-indigo-700 flex items-center gap-2"
        >
          <Plus size={18} />
          برنامج جديد
        </button>
      </div>

      {loadingPrograms ? (
        <div className="text-center py-10">جاري التحميل...</div>
      ) : programs.length === 0 ? (
        <div className="text-center py-10 bg-white rounded-lg shadow border">لا توجد برامج تدريبية</div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {programs.map(program => {
              const occupancy = Math.round((program.enrolled_count / program.capacity) * 100);
              const occupancyColor = occupancy >= 100 ? 'bg-red-500' : occupancy > 75 ? 'bg-yellow-500' : 'bg-green-500';

              return (
                <div 
                  key={program.id} 
                  className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden hover:shadow-md transition-shadow cursor-pointer"
                  onClick={() => setSelectedProgram(program)}
                >
                  <div className="p-4 border-b bg-gray-50 flex justify-between items-start">
                    <div>
                      <span className="text-xs text-indigo-600 font-semibold bg-indigo-50 px-2 py-1 rounded">{program.category}</span>
                      <h3 className="font-bold text-gray-800 mt-2 text-lg">{program.name}</h3>
                    </div>
                    <span className={`px-2 py-1 rounded text-xs ${program.is_active ? 'bg-green-100 text-green-800' : 'bg-gray-200 text-gray-800'}`}>
                      {program.is_active ? 'نشط' : 'متوقف'}
                    </span>
                  </div>
                  <div className="p-4 space-y-3">
                    <div className="flex items-center text-sm text-gray-600 gap-2">
                      <Award size={16} className="text-gray-400" />
                      <span>المدرب: {(program as any).stadium_coaches?.full_name || (program as any).coach?.full_name || 'غير محدد'}</span>
                    </div>
                    <div className="flex items-center text-sm text-gray-600 gap-2">
                      <Calendar size={16} className="text-gray-400" />
                      <span>{program.start_date} / {program.end_date}</span>
                    </div>
                    <div className="flex items-center text-sm font-medium text-gray-800 gap-2">
                      <TrendingUp size={16} className="text-green-500" />
                      <span>الرسوم: {program.fee_per_participant} ج.م</span>
                    </div>

                    
                    <div className="mt-4 pt-4 border-t">
                      <div className="flex justify-between text-xs mb-1">
                        <span>الاستيعاب</span>
                        <span className="font-medium">{program.enrolled_count} / {program.capacity}</span>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-2">
                        <div className={`h-2 rounded-full ${occupancyColor}`} style={{ width: `${Math.min(occupancy, 100)}%` }}></div>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
          
          {totalPrograms > PROGRAMS_PER_PAGE && (
            <div className="flex items-center justify-between p-4 mt-6 bg-white rounded-lg shadow-sm border">
              <span className="text-sm text-gray-600">إجمالي: {totalPrograms}</span>
              <div className="flex gap-2">
                <button
                  disabled={currentProgramPage === 1}
                  onClick={() => setCurrentProgramPage(prev => prev - 1)}
                  className="p-1 rounded bg-white border hover:bg-gray-100 disabled:opacity-50"
                >
                  <ChevronRight size={20} />
                </button>
                <button
                  disabled={currentProgramPage * PROGRAMS_PER_PAGE >= totalPrograms}
                  onClick={() => setCurrentProgramPage(prev => prev + 1)}
                  className="p-1 rounded bg-white border hover:bg-gray-100 disabled:opacity-50"
                >
                  <ChevronLeft size={20} />
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {/* Program Modal */}
      {isProgramModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl overflow-hidden">
            <div className="p-4 border-b flex justify-between items-center bg-gray-50">
              <h2 className="text-lg font-bold">إضافة برنامج تدريبي جديد</h2>
              <button onClick={() => setIsProgramModalOpen(false)} className="text-gray-500 hover:text-gray-700">
                <X size={20} />
              </button>
            </div>
            <div className="p-6">
              <form onSubmit={handleProgramSubmit(onSubmitProgram)} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="col-span-2 md:col-span-1">
                    <label className="block text-sm font-medium mb-1">اسم البرنامج</label>
                    <input {...registerProgram('name')} className="w-full border rounded p-2" />
                    {programErrors.name && <p className="text-red-500 text-xs mt-1">{programErrors.name.message}</p>}
                  </div>
                  <div className="col-span-2 md:col-span-1">
                    <label className="block text-sm font-medium mb-1">التصنيف</label>
                    <input {...registerProgram('category')} className="w-full border rounded p-2" placeholder="أكاديمية كرة قدم، سباحة..." />
                    {programErrors.category && <p className="text-red-500 text-xs mt-1">{programErrors.category.message}</p>}
                  </div>
                  <div className="col-span-2">
                    <label className="block text-sm font-medium mb-1">المدرب المسؤول</label>
                    <select {...registerProgram('coach_id')} className="w-full border rounded p-2">
                      <option value="">اختر المدرب...</option>
                      {coaches.map(c => <option key={c.id} value={c.id}>{c.full_name}</option>)}
                    </select>
                    {programErrors.coach_id && <p className="text-red-500 text-xs mt-1">{programErrors.coach_id.message}</p>}
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">تاريخ البداية</label>
                    <input type="date" {...registerProgram('start_date')} className="w-full border rounded p-2" />
                    {programErrors.start_date && <p className="text-red-500 text-xs mt-1">{programErrors.start_date.message}</p>}
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">تاريخ النهاية</label>
                    <input type="date" {...registerProgram('end_date')} className="w-full border rounded p-2" />
                    {programErrors.end_date && <p className="text-red-500 text-xs mt-1">{programErrors.end_date.message}</p>}
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">السعة (أقصى عدد)</label>
                    <input type="number" {...registerProgram('capacity', { valueAsNumber: true })} className="w-full border rounded p-2" />
                    {programErrors.capacity && <p className="text-red-500 text-xs mt-1">{programErrors.capacity.message}</p>}
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">الرسوم لكل مشترك (ج.م)</label>
                    <input type="number" {...registerProgram('fee_per_participant', { valueAsNumber: true })} className="w-full border rounded p-2" />
                    {programErrors.fee_per_participant && <p className="text-red-500 text-xs mt-1">{programErrors.fee_per_participant.message}</p>}
                  </div>

                  <div className="col-span-2">
                    <label className="block text-sm font-medium mb-1">مواعيد البرنامج (نصي)</label>
                    <input {...registerProgram('schedule_description')} className="w-full border rounded p-2" placeholder="السبت والاثنين والأربعاء (4 - 6 مساءً)" />
                  </div>
                </div>
                <div className="flex justify-end gap-3 mt-6">
                  <button type="button" onClick={() => setIsProgramModalOpen(false)} className="px-4 py-2 border rounded text-gray-600 hover:bg-gray-50">إلغاء</button>
                  <button type="submit" className="px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700">حفظ البرنامج</button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Receipt Printable Modal */}
      <ReceiptModal
        isOpen={Boolean(receiptModalData)}
        onClose={() => setReceiptModalData(null)}
        data={receiptModalData}
      />
    </div>
  );
};

export default TrainingProgramManager;


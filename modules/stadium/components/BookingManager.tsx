import React, { useState, useEffect } from 'react';
import { supabase } from '@/supabaseClient';
import { useAccounting } from '@/context/AccountingContext';
import toast from 'react-hot-toast';
import { Calendar, Clock, MapPin, CheckCircle, XCircle, Plus, Filter, DollarSign, CreditCard, Printer, Share2 } from 'lucide-react';

import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { StadiumBooking, StadiumFacility } from '../stadium.types';
import {
  checkBookingConflict,
  checkFacilityMaintenanceConflict,
  createBookingJournalEntry,
  getTreasuryAccounts,
  TreasuryAccountOption,
  generateWhatsAppBookingUrl,
} from '../stadiumHelpers';
import { ReceiptModal, ReceiptData } from './ReceiptModal';


const bookingSchema = z.object({
  facility_id: z.string().min(1, 'يرجى اختيار المرفق'),
  booker_name: z.string().min(1, 'يرجى إدخال اسم الحاجز'),
  booker_phone: z.string().optional(),
  member_id: z.string().optional(),
  booking_date: z.string().min(1, 'يرجى تحديد التاريخ'),
  start_time: z.string().min(1, 'يرجى تحديد وقت البدء'),
  end_time: z.string().min(1, 'يرجى تحديد وقت الانتهاء'),
  notes: z.string().optional()
}).refine(data => {
  return data.start_time < data.end_time;
}, {
  message: 'وقت الانتهاء يجب أن يكون بعد وقت البدء',
  path: ['end_time']
});

type BookingFormValues = z.infer<typeof bookingSchema>;

const BookingManager: React.FC = () => {
  const { currentUser } = useAccounting();
  const orgId = (currentUser as any)?.organization_id;

  const [bookings, setBookings] = useState<StadiumBooking[]>([]);
  const [facilities, setFacilities] = useState<StadiumFacility[]>([]);
  const [treasuryAccounts, setTreasuryAccounts] = useState<TreasuryAccountOption[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [todaysCount, setTodaysCount] = useState(0);

  const [dateFilter, setDateFilter] = useState('');
  const [facilityFilter, setFacilityFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  
  // Payment Modal State
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [payingBooking, setPayingBooking] = useState<StadiumBooking | null>(null);
  const [selectedTreasuryId, setSelectedTreasuryId] = useState<string>('');
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState<string>('cash');
  const [chequeNumber, setChequeNumber] = useState<string>('');
  const [chequeBankName, setChequeBankName] = useState<string>('');
  const [chequeDueDate, setChequeDueDate] = useState<string>('');
  const [isProcessingPayment, setIsProcessingPayment] = useState(false);
  const [receiptModalData, setReceiptModalData] = useState<ReceiptData | null>(null);

  const { register, handleSubmit, formState: { errors }, reset, watch, setValue } = useForm<BookingFormValues>({
    resolver: zodResolver(bookingSchema)
  });


  const watchFacility = watch('facility_id');
  const watchStartTime = watch('start_time');
  const watchEndTime = watch('end_time');

  // مؤشر وقت الذروة: 16:00 → 22:00
  const [isPeakTime, setIsPeakTime] = useState(false);

  /**
   * يحدد ما إذا كان وقت الحجز يقع في فترة الذروة (أوقات الازدحام).
   * أوقات الذروة: 16:00 حتى 22:00 كل يوم.
   * إذا كان للمرفق peak_price_per_hour محدد يُطبَّق تلقائياً.
   */
  const isPeakTimeRange = (startTime: string): boolean => {
    const [h] = startTime.split(':').map(Number);
    return h >= 16 && h < 22;
  };

  useEffect(() => {
    if (watchFacility && watchStartTime && watchEndTime && facilities.length > 0) {
      const facility = facilities.find(f => f.id === watchFacility);
      if (facility && watchStartTime < watchEndTime) {
        const start = new Date(`2000-01-01T${watchStartTime}`);
        const end = new Date(`2000-01-01T${watchEndTime}`);
        const durationHours = (end.getTime() - start.getTime()) / (1000 * 60 * 60);

        // تحديد وقت الذروة وتطبيق السعر المناسب
        const peakApplied = isPeakTimeRange(watchStartTime) && !!facility.peak_price_per_hour;
        const effectivePrice = peakApplied ? (facility.peak_price_per_hour || facility.price_per_hour) : facility.price_per_hour;

        setIsPeakTime(peakApplied);
        setValue('duration_hours' as any, durationHours);
        setValue('total_amount' as any, durationHours * effectivePrice);
      }
    }
  }, [watchFacility, watchStartTime, watchEndTime, facilities, setValue]);

  const fetchFacilities = async () => {
    if (!orgId) return;
    const { data } = await supabase
      .from('stadium_facilities')
      .select('*')
      .eq('organization_id', orgId)
      .eq('is_active', true);
    setFacilities(data || []);
  };

  const fetchBookings = async () => {
    if (!orgId) return;
    setLoading(true);
    
    let query = supabase
      .from('stadium_bookings')
      .select('*, stadium_facilities(name)', { count: 'exact' })
      .eq('organization_id', orgId)
      .range((page - 1) * 25, page * 25 - 1)
      .order('booking_date', { ascending: false })
      .order('start_time', { ascending: true });

    if (dateFilter) query = query.eq('booking_date', dateFilter);
    if (facilityFilter) query = query.eq('facility_id', facilityFilter);
    if (statusFilter) query = query.eq('status', statusFilter);

    const { data, count, error } = await query;
    if (error) {
      toast.error('حدث خطأ أثناء جلب الحجوزات');
    } else {
      setBookings(data || []);
      setTotalPages(Math.ceil((count || 0) / 25));
    }
    
    // Get today's count
    const today = new Date().toISOString().split('T')[0];
    const { count: tCount } = await supabase
      .from('stadium_bookings')
      .select('*', { count: 'exact', head: true })
      .eq('organization_id', orgId)
      .eq('booking_date', today);
    setTodaysCount(tCount || 0);

    setLoading(false);
  };

  useEffect(() => {
    if (orgId) {
      fetchFacilities();
      getTreasuryAccounts(orgId).then(accs => {
        setTreasuryAccounts(accs);
        if (accs.length > 0) setSelectedTreasuryId(accs[0].id);
      });
    }
  }, [orgId]);

  useEffect(() => {
    fetchBookings();
  }, [page, orgId, dateFilter, facilityFilter, statusFilter]);

  const onSubmitBooking = async (data: BookingFormValues & { duration_hours?: number, total_amount?: number }) => {
    if (!orgId) return;
    
    const hasConflict = await checkBookingConflict(orgId, data.facility_id, data.booking_date, data.start_time, data.end_time);
    if (hasConflict) {
      toast.error('يوجد تعارض في الحجز مع حجز آخر في نفس الوقت.');
      return;
    }

    // Check Maintenance Blackout
    const maintenanceCheck = await checkFacilityMaintenanceConflict(data.facility_id, data.booking_date, data.start_time, data.end_time);
    if (maintenanceCheck.hasConflict) {
      toast.error(`المرفق محجوب لأعمال الصيانة: (${maintenanceCheck.maintenanceTitle || 'صيانة مجدولة'})`);
      return;
    }


    const selectedFacility = facilities.find(f => f.id === data.facility_id);
    const start = new Date(`2000-01-01T${data.start_time}`);
    const end = new Date(`2000-01-01T${data.end_time}`);
    const durationHours = Math.max(0.5, (end.getTime() - start.getTime()) / (1000 * 60 * 60));

    // تطبيق سعر الذروة عند الحجز (16:00 - 22:00) إذا كان محدداً للمرفق
    const peakApplied = isPeakTimeRange(data.start_time) && !!selectedFacility?.peak_price_per_hour;
    const pricePerHour = peakApplied
      ? (selectedFacility?.peak_price_per_hour || selectedFacility?.price_per_hour || 0)
      : (selectedFacility?.price_per_hour || 0);
    const totalAmount = durationHours * pricePerHour;

    const bookingData = {
      organization_id: orgId,
      facility_id: data.facility_id,
      booker_name: data.booker_name?.trim(),
      booker_phone: data.booker_phone?.trim() || null,
      member_id: data.member_id || null,
      booking_date: data.booking_date,
      start_time: data.start_time,
      end_time: data.end_time,
      duration_hours: durationHours,
      price_per_hour: pricePerHour,
      total_amount: totalAmount,
      status: 'confirmed'
    };

    const { error } = await supabase
      .from('stadium_bookings')
      .insert([bookingData]);

    if (error) {
      toast.error('حدث خطأ أثناء حفظ الحجز');
    } else {
      toast.success('تمت إضافة الحجز بنجاح');
      setIsAddModalOpen(false);
      reset();
      fetchBookings();
    }
  };

  const openPaymentModal = (booking: StadiumBooking) => {
    setPayingBooking(booking);
    if (treasuryAccounts.length > 0 && !selectedTreasuryId) {
      setSelectedTreasuryId(treasuryAccounts[0].id);
    }
    setSelectedPaymentMethod('cash');
    setChequeNumber('');
    setChequeBankName('');
    setChequeDueDate(booking.booking_date || new Date().toISOString().split('T')[0]);
    setIsPaymentModalOpen(true);
  };

  const handleConfirmPayment = async () => {
    if (!orgId || !payingBooking) return;

    if (selectedPaymentMethod === 'cheque') {
      if (!chequeNumber.trim()) {
        toast.error('يرجى إدخال رقم الشيك');
        return;
      }
      if (!chequeBankName.trim()) {
        toast.error('يرجى إدخال اسم البنك');
        return;
      }
    }

    setIsProcessingPayment(true);
    try {
      const chequeDetails = selectedPaymentMethod === 'cheque' ? {
        cheque_number: chequeNumber.trim(),
        bank_name: chequeBankName.trim(),
        due_date: chequeDueDate || payingBooking.booking_date,
        party_name: payingBooking.booker_name,
        notes: `حجز مرفق — ${payingBooking.booker_name}`
      } : undefined;

      // قيد حجز مدفوع: مدين الخزينة/البنك أو أوراق القبض — دائن إيرادات حجوزات الملاعب
      const jeResult = await createBookingJournalEntry(
        orgId,
        payingBooking.total_amount,
        `حجز مرفق — ${payingBooking.booker_name} — ${payingBooking.booking_date}`,
        payingBooking.booking_date,
        selectedTreasuryId,
        selectedPaymentMethod,
        chequeDetails
      );

      const updatePayload: any = { 
        status: 'paid', 
        payment_method: selectedPaymentMethod 
      };
      if (jeResult.success && jeResult.journalEntryId) {
        updatePayload.journal_entry_id = jeResult.journalEntryId;
      }

      const { error } = await supabase
        .from('stadium_bookings')
        .update(updatePayload)
        .eq('id', payingBooking.id);
        
      if (error) {
        toast.error('حدث خطأ أثناء تحديث حالة الدفع');
        return;
      }

      toast.success(
        selectedPaymentMethod === 'cheque'
          ? 'تم تسجيل الدفع وإنشاء شيك القبض في إدارة الشيكات بنجاح 📜'
          : 'تم تسجيل الدفع وتوليد القيد المحاسبي بنجاح'
      );
      setIsPaymentModalOpen(false);
      
      // Open receipt immediately
      setReceiptModalData({
        receiptNumber: `BKG-${payingBooking.id.substring(0, 6).toUpperCase()}`,
        receiptDate: payingBooking.booking_date,
        receiptTypeLabel: 'إيصال سداد حجز ملعب ومرفق رياضي',
        partyName: payingBooking.booker_name,
        partyPhone: payingBooking.booker_phone || undefined,
        amount: payingBooking.total_amount,
        paymentMethod: selectedPaymentMethod,
        facilityOrProgramName: (payingBooking as any).stadium_facilities?.name || 'مرفق رياضي',
        periodOrDuration: `${payingBooking.start_time} إلى ${payingBooking.end_time} (${payingBooking.duration_hours} ساعة)`,
        chequeNumber: chequeNumber,
        bankName: chequeBankName,
        notes: `حجز ${payingBooking.booker_name} بتاريخ ${payingBooking.booking_date}`,
      });

      setPayingBooking(null);
      fetchBookings();
    } catch (err: any) {
      console.error(err);
      toast.error('حدث خطأ أثناء تنفيذ الدفع');
    } finally {
      setIsProcessingPayment(false);
    }
  };





  const cancelBooking = async (id: string) => {
    if (!window.confirm('هل أنت متأكد من إلغاء هذا الحجز؟')) return;
    const { error } = await supabase
      .from('stadium_bookings')
      .update({ status: 'cancelled' })
      .eq('id', id);
    if (error) {
      toast.error('حدث خطأ أثناء إلغاء الحجز');
    } else {
      toast.success('تم إلغاء الحجز');
      fetchBookings();
    }
  };

  return (
    <div className="p-6 bg-white dark:bg-gray-900 rounded-lg shadow-md" dir="rtl">
      {/* Calendar Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2 text-blue-800 dark:text-blue-300">
            <Calendar className="w-6 h-6" /> إدارة الحجوزات
          </h2>
          <p className="text-sm mt-1 text-blue-600 dark:text-blue-400">حجوزات اليوم: {todaysCount} حجز</p>
        </div>
        <button
          onClick={() => { reset(); setIsAddModalOpen(true); }}
          className="mt-4 md:mt-0 flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 transition"
        >
          <Plus className="w-5 h-5" /> حجز جديد
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-4 mb-6">
        <div className="flex items-center gap-2 bg-gray-50 dark:bg-gray-800 p-2 rounded-md">
          <Filter className="w-5 h-5 text-gray-500" />
          <span className="font-medium">تصفية:</span>
        </div>
        <input
          type="date"
          value={dateFilter}
          onChange={(e) => { setDateFilter(e.target.value); setPage(1); }}
          className="px-4 py-2 border rounded-md dark:bg-gray-800 dark:border-gray-700"
        />
        <select
          value={facilityFilter}
          onChange={(e) => { setFacilityFilter(e.target.value); setPage(1); }}
          className="px-4 py-2 border rounded-md dark:bg-gray-800 dark:border-gray-700"
        >
          <option value="">كل المرافق</option>
          {facilities.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
        </select>
        <select
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
          className="px-4 py-2 border rounded-md dark:bg-gray-800 dark:border-gray-700"
        >
          <option value="">جميع الحالات</option>
          <option value="confirmed">مؤكد</option>
          <option value="paid">مدفوع</option>
          <option value="cancelled">ملغي</option>
        </select>
      </div>

      {/* Table */}
      {loading ? (
        <div className="text-center py-10">جاري التحميل...</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-right border-collapse">
            <thead>
              <tr className="bg-gray-100 dark:bg-gray-800">
                <th className="p-3 border-b">المرفق</th>
                <th className="p-3 border-b">الحاجز</th>
                <th className="p-3 border-b">التاريخ</th>
                <th className="p-3 border-b">الوقت</th>
                <th className="p-3 border-b">المدة</th>
                <th className="p-3 border-b">المبلغ</th>
                <th className="p-3 border-b">الحالة</th>
                <th className="p-3 border-b">إجراءات</th>
              </tr>
            </thead>
            <tbody>
              {bookings.map(booking => (
                <tr key={booking.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                  <td className="p-3 border-b">{(booking as any).stadium_facilities?.name || 'غير معروف'}</td>
                  <td className="p-3 border-b">
                    <div>{booking.booker_name}</div>
                    <div className="text-xs text-gray-500">{booking.booker_phone}</div>
                  </td>
                  <td className="p-3 border-b">{new Date(booking.booking_date).toLocaleDateString('ar-EG')}</td>
                  <td className="p-3 border-b" dir="ltr">{booking.start_time} - {booking.end_time}</td>
                  <td className="p-3 border-b">{booking.duration_hours} ساعة</td>
                  <td className="p-3 border-b font-medium text-green-600">{booking.total_amount}</td>
                  <td className="p-3 border-b">
                    <span className={`px-2 py-1 rounded text-sm ${
                      booking.status === 'paid' ? 'bg-green-100 text-green-800' :
                      booking.status === 'confirmed' ? 'bg-blue-100 text-blue-800' :
                      'bg-red-100 text-red-800'
                    }`}>
                      {booking.status === 'paid' ? 'مدفوع' : booking.status === 'confirmed' ? 'مؤكد' : 'ملغي'}
                    </span>
                  </td>
                  <td className="p-3 border-b flex gap-1.5 justify-center items-center">
                    {booking.status === 'paid' && (
                      <button
                        onClick={() => {
                          setReceiptModalData({
                            receiptNumber: `BKG-${booking.id.substring(0, 6).toUpperCase()}`,
                            receiptDate: booking.booking_date,
                            receiptTypeLabel: 'إيصال سداد حجز ملعب ومرفق رياضي',
                            partyName: booking.booker_name,
                            partyPhone: booking.booker_phone || undefined,
                            amount: booking.total_amount,
                            paymentMethod: booking.payment_method || 'cash',
                            facilityOrProgramName: (booking as any).stadium_facilities?.name || 'مرفق رياضي',
                            periodOrDuration: `${booking.start_time} إلى ${booking.end_time} (${booking.duration_hours} ساعة)`,
                            notes: `حجز ${booking.booker_name} بتاريخ ${booking.booking_date}`,
                          });
                        }}
                        title="طباعة إيصال الحجز"
                        className="p-1 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 rounded"
                      >
                        <Printer className="w-4 h-4" />
                      </button>
                    )}

                    {booking.booker_phone && (
                      <a
                        href={generateWhatsAppBookingUrl(
                          booking.booker_phone,
                          booking.booker_name,
                          (booking as any).stadium_facilities?.name || 'الملعب',
                          booking.booking_date,
                          `${booking.start_time} - ${booking.end_time}`,
                          booking.total_amount,
                          `BKG-${booking.id.substring(0, 6).toUpperCase()}`
                        )}
                        target="_blank"
                        rel="noopener noreferrer"
                        title="إرسال تأكيد عبر WhatsApp"
                        className="p-1 bg-green-50 text-green-600 hover:bg-green-100 rounded"
                      >
                        <Share2 className="w-4 h-4" />
                      </a>
                    )}

                    {booking.status === 'confirmed' && (
                      <button onClick={() => openPaymentModal(booking)} className="text-green-600 hover:bg-green-50 p-1 rounded flex items-center gap-1" title="تسجيل الدفع وترحيل القيد">
                        <CheckCircle className="w-5 h-5" />
                        <span className="text-xs font-bold">سداد</span>
                      </button>
                    )}
                    {(booking.status === 'confirmed' || booking.status === 'paid') && (
                      <button onClick={() => cancelBooking(booking.id)} className="text-red-500 hover:bg-red-50 p-1 rounded flex items-center gap-1" title="إلغاء الحجز">
                        <XCircle className="w-5 h-5" />
                      </button>
                    )}
                  </td>

                </tr>
              ))}
              {bookings.length === 0 && (
                <tr><td colSpan={8} className="text-center p-6 text-gray-500">لا توجد حجوزات</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex justify-center gap-2 mt-6">
          <button disabled={page === 1} onClick={() => setPage(p => p - 1)} className="px-3 py-1 border rounded disabled:opacity-50">السابق</button>
          <span className="px-3 py-1">صفحة {page} من {totalPages}</span>
          <button disabled={page === totalPages} onClick={() => setPage(p => p + 1)} className="px-3 py-1 border rounded disabled:opacity-50">التالي</button>
        </div>
      )}

      {/* Add Booking Modal */}
      {isAddModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-900 rounded-lg shadow-lg max-w-2xl w-full p-6">
            <h3 className="text-xl font-bold mb-4 flex items-center gap-2">
              <MapPin className="w-5 h-5" /> إضافة حجز جديد
            </h3>
            <form onSubmit={handleSubmit(onSubmitBooking)} className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block mb-1">المرفق *</label>
                <select {...register('facility_id')} className="w-full p-2 border rounded">
                  <option value="">اختر المرفق</option>
                  {facilities.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
                </select>
                {errors.facility_id && <p className="text-red-500 text-sm mt-1">{errors.facility_id.message}</p>}
              </div>
              
              <div>
                <label className="block mb-1">تاريخ الحجز *</label>
                <input type="date" {...register('booking_date')} className="w-full p-2 border rounded" />
                {errors.booking_date && <p className="text-red-500 text-sm mt-1">{errors.booking_date.message}</p>}
              </div>

              <div>
                <label className="block mb-1">وقت البدء *</label>
                <input type="time" {...register('start_time')} className="w-full p-2 border rounded" />
                {errors.start_time && <p className="text-red-500 text-sm mt-1">{errors.start_time.message}</p>}
                {isPeakTime && (
                  <p className="text-xs mt-1 font-bold text-orange-600 dark:text-orange-400 flex items-center gap-1">
                    🔥 وقت ذروة (16:00 - 22:00) — سعر الذروة مطبق
                  </p>
                )}
              </div>

              <div>
                <label className="block mb-1">وقت الانتهاء *</label>
                <input type="time" {...register('end_time')} className="w-full p-2 border rounded" />
                {errors.end_time && <p className="text-red-500 text-sm mt-1">{errors.end_time.message}</p>}
              </div>

              <div className="md:col-span-2 border-t pt-4 mt-2">
                <h4 className="font-semibold mb-2">بيانات الحاجز</h4>
              </div>

              <div>
                <label className="block mb-1">اسم الحاجز *</label>
                <input type="text" {...register('booker_name')} className="w-full p-2 border rounded" />
                {errors.booker_name && <p className="text-red-500 text-sm mt-1">{errors.booker_name.message}</p>}
              </div>

              <div>
                <label className="block mb-1">رقم الهاتف *</label>
                <input type="text" {...register('booker_phone')} className="w-full p-2 border rounded" dir="ltr" />
                {errors.booker_phone && <p className="text-red-500 text-sm mt-1">{errors.booker_phone.message}</p>}
              </div>

              <div className={`md:col-span-2 p-4 rounded-md flex items-center justify-between mt-2 ${isPeakTime ? 'bg-orange-50 dark:bg-orange-950/30 border border-orange-200 dark:border-orange-800' : 'bg-gray-50 dark:bg-gray-800'}`}>
                <div className="flex items-center gap-2">
                  <Clock className="w-5 h-5 text-gray-500" />
                  <span className="font-medium">المدة:</span>
                  <span>{watch('duration_hours' as any) || 0} ساعة</span>
                </div>
                <div className="flex items-center gap-2">
                  <DollarSign className={`w-5 h-5 ${isPeakTime ? 'text-orange-500' : 'text-gray-500'}`} />
                  <span className="font-medium">الإجمالي {isPeakTime ? '(سعر ذروة 🔥)' : ''}:</span>
                  <span className={`text-lg font-bold ${isPeakTime ? 'text-orange-600 dark:text-orange-400' : 'text-green-600'}`}>
                    {watch('total_amount' as any) || 0} ج.م
                  </span>
                </div>
              </div>

              <div className="md:col-span-2 flex justify-end gap-2 mt-4">
                <button type="button" onClick={() => setIsAddModalOpen(false)} className="px-4 py-2 border rounded hover:bg-gray-100 dark:hover:bg-gray-800">إلغاء</button>
                <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">تأكيد الحجز</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Payment & Journal Entry Modal */}
      {isPaymentModalOpen && payingBooking && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-900 rounded-lg shadow-lg max-w-md w-full p-6">
            <h3 className="text-xl font-bold mb-4 flex items-center gap-2 text-green-700 dark:text-green-400">
              <CreditCard className="w-6 h-6" /> تسجيل سداد الحجز وترحيل القيد
            </h3>
            
            <div className="space-y-4">
              <div className="bg-gray-50 dark:bg-gray-800 p-3 rounded-md space-y-1">
                <div className="text-sm"><span className="text-gray-500">الحاجز:</span> <strong>{payingBooking.booker_name}</strong></div>
                <div className="text-sm"><span className="text-gray-500">المرفق:</span> <strong>{(payingBooking as any).stadium_facilities?.name || 'مرفق رياضي'}</strong></div>
                <div className="text-sm"><span className="text-gray-500">المبلغ المطلوب:</span> <strong className="text-green-600 text-base">{payingBooking.total_amount} ج.م</strong></div>

              </div>

              <div>
                <label className="block mb-1 font-medium text-sm">طريقة الدفع *</label>
                <select
                  value={selectedPaymentMethod}
                  onChange={(e) => setSelectedPaymentMethod(e.target.value)}
                  className="w-full p-2 border rounded bg-white dark:bg-gray-800"
                >
                  <option value="cash">نقداً (كاش)</option>
                  <option value="card">بطاقة مدى / POS / إلكتروني</option>
                  <option value="bank_transfer">تحويل بنكي</option>
                  <option value="cheque">شيك مصرفي (أوراق قبض)</option>
                </select>
              </div>

              {selectedPaymentMethod !== 'cheque' ? (
                <div>
                  <label className="block mb-1 font-medium text-sm">حساب الخزينة أو البنك المستلم *</label>
                  <select
                    value={selectedTreasuryId}
                    onChange={(e) => setSelectedTreasuryId(e.target.value)}
                    className="w-full p-2 border rounded bg-white dark:bg-gray-800"
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
                  <p className="text-xs text-gray-500 mt-1">سيتم جعل هذا الحساب مديناً وإيرادات الملاعب دائنة في دفتر اليومية.</p>
                </div>
              ) : (
                <div className="space-y-3 bg-amber-50 dark:bg-amber-950/30 p-3 rounded-lg border border-amber-200 dark:border-amber-800">
                  <div className="text-xs font-semibold text-amber-800 dark:text-amber-300 flex items-center gap-1">
                    <span>📜 بيانات شيك القبض (سيُسجل تلقائياً في إدارة الشيكات)</span>
                  </div>
                  <div>
                    <label className="block mb-1 text-xs font-medium">رقم الشيك *</label>
                    <input
                      type="text"
                      placeholder="مثال: 0004521"
                      value={chequeNumber}
                      onChange={(e) => setChequeNumber(e.target.value)}
                      className="w-full p-2 border rounded text-sm bg-white dark:bg-gray-800"
                      required
                    />
                  </div>
                  <div>
                    <label className="block mb-1 text-xs font-medium">البنك المسحوب عليه (اسم البنك) *</label>
                    <input
                      type="text"
                      placeholder="مثال: البنك الأهلي المصري / بنك مصر / الراجحي..."
                      value={chequeBankName}
                      onChange={(e) => setChequeBankName(e.target.value)}
                      className="w-full p-2 border rounded text-sm bg-white dark:bg-gray-800"
                      required
                    />
                  </div>
                  <div>
                    <label className="block mb-1 text-xs font-medium">تاريخ استحقاق الشيك *</label>
                    <input
                      type="date"
                      value={chequeDueDate}
                      onChange={(e) => setChequeDueDate(e.target.value)}
                      className="w-full p-2 border rounded text-sm bg-white dark:bg-gray-800"
                      required
                    />
                  </div>
                  <p className="text-xs text-amber-700 dark:text-amber-400 leading-relaxed">
                    💡 سيتم توجيه القيد إلى <strong>حساب أوراق القبض (1222)</strong>، وإنشاء شيك وارد في مديول <strong>الخزن والبنوك</strong> لتحصيله لاحقاً عند استحقاقه.
                  </p>
                </div>
              )}


              <div className="flex justify-end gap-2 pt-3 border-t">
                <button
                  type="button"
                  disabled={isProcessingPayment}
                  onClick={() => { setIsPaymentModalOpen(false); setPayingBooking(null); }}
                  className="px-4 py-2 border rounded hover:bg-gray-100 dark:hover:bg-gray-800"
                >
                  إلغاء
                </button>
                <button
                  type="button"
                  disabled={isProcessingPayment}
                  onClick={handleConfirmPayment}
                  className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 flex items-center gap-2"
                >
                  {isProcessingPayment ? 'جاري الترحيل...' : 'تأكيد السداد وتوليد القيد'}
                </button>
              </div>
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

export default BookingManager;



import { logger } from '../../../utils/logger';
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
  facility_id: z.string().min(1, 'ÙŠØ±Ø¬Ù‰ Ø§Ø®ØªÙŠØ§Ø± Ø§Ù„Ù…Ø±ÙÙ‚'),
  booker_name: z.string().min(1, 'ÙŠØ±Ø¬Ù‰ Ø¥Ø¯Ø®Ø§Ù„ Ø§Ø³Ù… Ø§Ù„Ø­Ø§Ø¬Ø²'),
  booker_phone: z.string().optional(),
  member_id: z.string().optional(),
  booking_date: z.string().min(1, 'ÙŠØ±Ø¬Ù‰ ØªØ­Ø¯ÙŠØ¯ Ø§Ù„ØªØ§Ø±ÙŠØ®'),
  start_time: z.string().min(1, 'ÙŠØ±Ø¬Ù‰ ØªØ­Ø¯ÙŠØ¯ ÙˆÙ‚Øª Ø§Ù„Ø¨Ø¯Ø¡'),
  end_time: z.string().min(1, 'ÙŠØ±Ø¬Ù‰ ØªØ­Ø¯ÙŠØ¯ ÙˆÙ‚Øª Ø§Ù„Ø§Ù†ØªÙ‡Ø§Ø¡'),
  notes: z.string().optional()
}).refine(data => {
  return data.start_time < data.end_time;
}, {
  message: 'ÙˆÙ‚Øª Ø§Ù„Ø§Ù†ØªÙ‡Ø§Ø¡ ÙŠØ¬Ø¨ Ø£Ù† ÙŠÙƒÙˆÙ† Ø¨Ø¹Ø¯ ÙˆÙ‚Øª Ø§Ù„Ø¨Ø¯Ø¡',
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

  // Ù…Ø¤Ø´Ø± ÙˆÙ‚Øª Ø§Ù„Ø°Ø±ÙˆØ©: 16:00 â†’ 22:00
  const [isPeakTime, setIsPeakTime] = useState(false);

  /**
   * ÙŠØ­Ø¯Ø¯ Ù…Ø§ Ø¥Ø°Ø§ ÙƒØ§Ù† ÙˆÙ‚Øª Ø§Ù„Ø­Ø¬Ø² ÙŠÙ‚Ø¹ ÙÙŠ ÙØªØ±Ø© Ø§Ù„Ø°Ø±ÙˆØ© (Ø£ÙˆÙ‚Ø§Øª Ø§Ù„Ø§Ø²Ø¯Ø­Ø§Ù…).
   * Ø£ÙˆÙ‚Ø§Øª Ø§Ù„Ø°Ø±ÙˆØ©: 16:00 Ø­ØªÙ‰ 22:00 ÙƒÙ„ ÙŠÙˆÙ….
   * Ø¥Ø°Ø§ ÙƒØ§Ù† Ù„Ù„Ù…Ø±ÙÙ‚ peak_price_per_hour Ù…Ø­Ø¯Ø¯ ÙŠÙØ·Ø¨ÙŽÙ‘Ù‚ ØªÙ„Ù‚Ø§Ø¦ÙŠØ§Ù‹.
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

        // ØªØ­Ø¯ÙŠØ¯ ÙˆÙ‚Øª Ø§Ù„Ø°Ø±ÙˆØ© ÙˆØªØ·Ø¨ÙŠÙ‚ Ø§Ù„Ø³Ø¹Ø± Ø§Ù„Ù…Ù†Ø§Ø³Ø¨
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
      toast.error('Ø­Ø¯Ø« Ø®Ø·Ø£ Ø£Ø«Ù†Ø§Ø¡ Ø¬Ù„Ø¨ Ø§Ù„Ø­Ø¬ÙˆØ²Ø§Øª');
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
      toast.error('ÙŠÙˆØ¬Ø¯ ØªØ¹Ø§Ø±Ø¶ ÙÙŠ Ø§Ù„Ø­Ø¬Ø² Ù…Ø¹ Ø­Ø¬Ø² Ø¢Ø®Ø± ÙÙŠ Ù†ÙØ³ Ø§Ù„ÙˆÙ‚Øª.');
      return;
    }

    // Check Maintenance Blackout
    const maintenanceCheck = await checkFacilityMaintenanceConflict(data.facility_id, data.booking_date, data.start_time, data.end_time);
    if (maintenanceCheck.hasConflict) {
      toast.error(`Ø§Ù„Ù…Ø±ÙÙ‚ Ù…Ø­Ø¬ÙˆØ¨ Ù„Ø£Ø¹Ù…Ø§Ù„ Ø§Ù„ØµÙŠØ§Ù†Ø©: (${maintenanceCheck.maintenanceTitle || 'ØµÙŠØ§Ù†Ø© Ù…Ø¬Ø¯ÙˆÙ„Ø©'})`);
      return;
    }


    const selectedFacility = facilities.find(f => f.id === data.facility_id);
    const start = new Date(`2000-01-01T${data.start_time}`);
    const end = new Date(`2000-01-01T${data.end_time}`);
    const durationHours = Math.max(0.5, (end.getTime() - start.getTime()) / (1000 * 60 * 60));

    // ØªØ·Ø¨ÙŠÙ‚ Ø³Ø¹Ø± Ø§Ù„Ø°Ø±ÙˆØ© Ø¹Ù†Ø¯ Ø§Ù„Ø­Ø¬Ø² (16:00 - 22:00) Ø¥Ø°Ø§ ÙƒØ§Ù† Ù…Ø­Ø¯Ø¯Ø§Ù‹ Ù„Ù„Ù…Ø±ÙÙ‚
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
      toast.error('Ø­Ø¯Ø« Ø®Ø·Ø£ Ø£Ø«Ù†Ø§Ø¡ Ø­ÙØ¸ Ø§Ù„Ø­Ø¬Ø²');
    } else {
      toast.success('ØªÙ…Øª Ø¥Ø¶Ø§ÙØ© Ø§Ù„Ø­Ø¬Ø² Ø¨Ù†Ø¬Ø§Ø­');
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
        toast.error('ÙŠØ±Ø¬Ù‰ Ø¥Ø¯Ø®Ø§Ù„ Ø±Ù‚Ù… Ø§Ù„Ø´ÙŠÙƒ');
        return;
      }
      if (!chequeBankName.trim()) {
        toast.error('ÙŠØ±Ø¬Ù‰ Ø¥Ø¯Ø®Ø§Ù„ Ø§Ø³Ù… Ø§Ù„Ø¨Ù†Ùƒ');
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
        notes: `Ø­Ø¬Ø² Ù…Ø±ÙÙ‚ â€” ${payingBooking.booker_name}`
      } : undefined;

      // Ù‚ÙŠØ¯ Ø­Ø¬Ø² Ù…Ø¯ÙÙˆØ¹: Ù…Ø¯ÙŠÙ† Ø§Ù„Ø®Ø²ÙŠÙ†Ø©/Ø§Ù„Ø¨Ù†Ùƒ Ø£Ùˆ Ø£ÙˆØ±Ø§Ù‚ Ø§Ù„Ù‚Ø¨Ø¶ â€” Ø¯Ø§Ø¦Ù† Ø¥ÙŠØ±Ø§Ø¯Ø§Øª Ø­Ø¬ÙˆØ²Ø§Øª Ø§Ù„Ù…Ù„Ø§Ø¹Ø¨
      const jeResult = await createBookingJournalEntry(
        orgId,
        payingBooking.total_amount,
        `Ø­Ø¬Ø² Ù…Ø±ÙÙ‚ â€” ${payingBooking.booker_name} â€” ${payingBooking.booking_date}`,
        payingBooking.booking_date,
        selectedTreasuryId,
        selectedPaymentMethod,
        chequeDetails
      );

      const updatePayload: Record<string, any> = { 
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
        toast.error('Ø­Ø¯Ø« Ø®Ø·Ø£ Ø£Ø«Ù†Ø§Ø¡ ØªØ­Ø¯ÙŠØ« Ø­Ø§Ù„Ø© Ø§Ù„Ø¯ÙØ¹');
        return;
      }

      toast.success(
        selectedPaymentMethod === 'cheque'
          ? 'ØªÙ… ØªØ³Ø¬ÙŠÙ„ Ø§Ù„Ø¯ÙØ¹ ÙˆØ¥Ù†Ø´Ø§Ø¡ Ø´ÙŠÙƒ Ø§Ù„Ù‚Ø¨Ø¶ ÙÙŠ Ø¥Ø¯Ø§Ø±Ø© Ø§Ù„Ø´ÙŠÙƒØ§Øª Ø¨Ù†Ø¬Ø§Ø­ ðŸ“œ'
          : 'ØªÙ… ØªØ³Ø¬ÙŠÙ„ Ø§Ù„Ø¯ÙØ¹ ÙˆØªÙˆÙ„ÙŠØ¯ Ø§Ù„Ù‚ÙŠØ¯ Ø§Ù„Ù…Ø­Ø§Ø³Ø¨ÙŠ Ø¨Ù†Ø¬Ø§Ø­'
      );
      setIsPaymentModalOpen(false);
      
      // Open receipt immediately
      setReceiptModalData({
        receiptNumber: `BKG-${payingBooking.id.substring(0, 6).toUpperCase()}`,
        receiptDate: payingBooking.booking_date,
        receiptTypeLabel: 'Ø¥ÙŠØµØ§Ù„ Ø³Ø¯Ø§Ø¯ Ø­Ø¬Ø² Ù…Ù„Ø¹Ø¨ ÙˆÙ…Ø±ÙÙ‚ Ø±ÙŠØ§Ø¶ÙŠ',
        partyName: payingBooking.booker_name,
        partyPhone: payingBooking.booker_phone || undefined,
        amount: payingBooking.total_amount,
        paymentMethod: selectedPaymentMethod,
        facilityOrProgramName: (payingBooking as any).stadium_facilities?.name || 'Ù…Ø±ÙÙ‚ Ø±ÙŠØ§Ø¶ÙŠ',
        periodOrDuration: `${payingBooking.start_time} Ø¥Ù„Ù‰ ${payingBooking.end_time} (${payingBooking.duration_hours} Ø³Ø§Ø¹Ø©)`,
        chequeNumber: chequeNumber,
        bankName: chequeBankName,
        notes: `Ø­Ø¬Ø² ${payingBooking.booker_name} Ø¨ØªØ§Ø±ÙŠØ® ${payingBooking.booking_date}`,
      });

      setPayingBooking(null);
      fetchBookings();
    } catch (err) {
      logger.error(err);
      toast.error('Ø­Ø¯Ø« Ø®Ø·Ø£ Ø£Ø«Ù†Ø§Ø¡ ØªÙ†ÙÙŠØ° Ø§Ù„Ø¯ÙØ¹');
    } finally {
      setIsProcessingPayment(false);
    }
  };





  const cancelBooking = async (id: string) => {
    if (!window.confirm('Ù‡Ù„ Ø£Ù†Øª Ù…ØªØ£ÙƒØ¯ Ù…Ù† Ø¥Ù„ØºØ§Ø¡ Ù‡Ø°Ø§ Ø§Ù„Ø­Ø¬Ø²ØŸ')) return;
    const { error } = await supabase
      .from('stadium_bookings')
      .update({ status: 'cancelled' })
      .eq('id', id);
    if (error) {
      toast.error('Ø­Ø¯Ø« Ø®Ø·Ø£ Ø£Ø«Ù†Ø§Ø¡ Ø¥Ù„ØºØ§Ø¡ Ø§Ù„Ø­Ø¬Ø²');
    } else {
      toast.success('ØªÙ… Ø¥Ù„ØºØ§Ø¡ Ø§Ù„Ø­Ø¬Ø²');
      fetchBookings();
    }
  };

  return (
    <div className="p-6 bg-white dark:bg-gray-900 rounded-lg shadow-md" dir="rtl">
      {/* Calendar Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2 text-blue-800 dark:text-blue-300">
            <Calendar className="w-6 h-6" /> Ø¥Ø¯Ø§Ø±Ø© Ø§Ù„Ø­Ø¬ÙˆØ²Ø§Øª
          </h2>
          <p className="text-sm mt-1 text-blue-600 dark:text-blue-400">Ø­Ø¬ÙˆØ²Ø§Øª Ø§Ù„ÙŠÙˆÙ…: {todaysCount} Ø­Ø¬Ø²</p>
        </div>
        <button
          onClick={() => { reset(); setIsAddModalOpen(true); }}
          className="mt-4 md:mt-0 flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 transition"
        >
          <Plus className="w-5 h-5" /> Ø­Ø¬Ø² Ø¬Ø¯ÙŠØ¯
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-4 mb-6">
        <div className="flex items-center gap-2 bg-gray-50 dark:bg-gray-800 p-2 rounded-md">
          <Filter className="w-5 h-5 text-gray-500" />
          <span className="font-medium">ØªØµÙÙŠØ©:</span>
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
          <option value="">ÙƒÙ„ Ø§Ù„Ù…Ø±Ø§ÙÙ‚</option>
          {facilities.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
        </select>
        <select
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
          className="px-4 py-2 border rounded-md dark:bg-gray-800 dark:border-gray-700"
        >
          <option value="">Ø¬Ù…ÙŠØ¹ Ø§Ù„Ø­Ø§Ù„Ø§Øª</option>
          <option value="confirmed">Ù…Ø¤ÙƒØ¯</option>
          <option value="paid">Ù…Ø¯ÙÙˆØ¹</option>
          <option value="cancelled">Ù…Ù„ØºÙŠ</option>
        </select>
      </div>

      {/* Table */}
      {loading ? (
        <div className="text-center py-10">Ø¬Ø§Ø±ÙŠ Ø§Ù„ØªØ­Ù…ÙŠÙ„...</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-right border-collapse">
            <thead>
              <tr className="bg-gray-100 dark:bg-gray-800">
                <th className="p-3 border-b">Ø§Ù„Ù…Ø±ÙÙ‚</th>
                <th className="p-3 border-b">Ø§Ù„Ø­Ø§Ø¬Ø²</th>
                <th className="p-3 border-b">Ø§Ù„ØªØ§Ø±ÙŠØ®</th>
                <th className="p-3 border-b">Ø§Ù„ÙˆÙ‚Øª</th>
                <th className="p-3 border-b">Ø§Ù„Ù…Ø¯Ø©</th>
                <th className="p-3 border-b">Ø§Ù„Ù…Ø¨Ù„Øº</th>
                <th className="p-3 border-b">Ø§Ù„Ø­Ø§Ù„Ø©</th>
                <th className="p-3 border-b">Ø¥Ø¬Ø±Ø§Ø¡Ø§Øª</th>
              </tr>
            </thead>
            <tbody>
              {bookings.map(booking => (
                <tr key={booking.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                  <td className="p-3 border-b">{(booking as any).stadium_facilities?.name || 'ØºÙŠØ± Ù…Ø¹Ø±ÙˆÙ'}</td>
                  <td className="p-3 border-b">
                    <div>{booking.booker_name}</div>
                    <div className="text-xs text-gray-500">{booking.booker_phone}</div>
                  </td>
                  <td className="p-3 border-b">{new Date(booking.booking_date).toLocaleDateString('ar-EG')}</td>
                  <td className="p-3 border-b" dir="ltr">{booking.start_time} - {booking.end_time}</td>
                  <td className="p-3 border-b">{booking.duration_hours} Ø³Ø§Ø¹Ø©</td>
                  <td className="p-3 border-b font-medium text-green-600">{booking.total_amount}</td>
                  <td className="p-3 border-b">
                    <span className={`px-2 py-1 rounded text-sm ${
                      booking.status === 'paid' ? 'bg-green-100 text-green-800' :
                      booking.status === 'confirmed' ? 'bg-blue-100 text-blue-800' :
                      'bg-red-100 text-red-800'
                    }`}>
                      {booking.status === 'paid' ? 'Ù…Ø¯ÙÙˆØ¹' : booking.status === 'confirmed' ? 'Ù…Ø¤ÙƒØ¯' : 'Ù…Ù„ØºÙŠ'}
                    </span>
                  </td>
                  <td className="p-3 border-b flex gap-1.5 justify-center items-center">
                    {booking.status === 'paid' && (
                      <button
                        onClick={() => {
                          setReceiptModalData({
                            receiptNumber: `BKG-${booking.id.substring(0, 6).toUpperCase()}`,
                            receiptDate: booking.booking_date,
                            receiptTypeLabel: 'Ø¥ÙŠØµØ§Ù„ Ø³Ø¯Ø§Ø¯ Ø­Ø¬Ø² Ù…Ù„Ø¹Ø¨ ÙˆÙ…Ø±ÙÙ‚ Ø±ÙŠØ§Ø¶ÙŠ',
                            partyName: booking.booker_name,
                            partyPhone: booking.booker_phone || undefined,
                            amount: booking.total_amount,
                            paymentMethod: booking.payment_method || 'cash',
                            facilityOrProgramName: (booking as any).stadium_facilities?.name || 'Ù…Ø±ÙÙ‚ Ø±ÙŠØ§Ø¶ÙŠ',
                            periodOrDuration: `${booking.start_time} Ø¥Ù„Ù‰ ${booking.end_time} (${booking.duration_hours} Ø³Ø§Ø¹Ø©)`,
                            notes: `Ø­Ø¬Ø² ${booking.booker_name} Ø¨ØªØ§Ø±ÙŠØ® ${booking.booking_date}`,
                          });
                        }}
                        title="Ø·Ø¨Ø§Ø¹Ø© Ø¥ÙŠØµØ§Ù„ Ø§Ù„Ø­Ø¬Ø²"
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
                          (booking as any).stadium_facilities?.name || 'Ø§Ù„Ù…Ù„Ø¹Ø¨',
                          booking.booking_date,
                          `${booking.start_time} - ${booking.end_time}`,
                          booking.total_amount,
                          `BKG-${booking.id.substring(0, 6).toUpperCase()}`
                        )}
                        target="_blank"
                        rel="noopener noreferrer"
                        title="Ø¥Ø±Ø³Ø§Ù„ ØªØ£ÙƒÙŠØ¯ Ø¹Ø¨Ø± WhatsApp"
                        className="p-1 bg-green-50 text-green-600 hover:bg-green-100 rounded"
                      >
                        <Share2 className="w-4 h-4" />
                      </a>
                    )}

                    {booking.status === 'confirmed' && (
                      <button onClick={() => openPaymentModal(booking)} className="text-green-600 hover:bg-green-50 p-1 rounded flex items-center gap-1" title="ØªØ³Ø¬ÙŠÙ„ Ø§Ù„Ø¯ÙØ¹ ÙˆØªØ±Ø­ÙŠÙ„ Ø§Ù„Ù‚ÙŠØ¯">
                        <CheckCircle className="w-5 h-5" />
                        <span className="text-xs font-bold">Ø³Ø¯Ø§Ø¯</span>
                      </button>
                    )}
                    {(booking.status === 'confirmed' || booking.status === 'paid') && (
                      <button onClick={() => cancelBooking(booking.id)} className="text-red-500 hover:bg-red-50 p-1 rounded flex items-center gap-1" title="Ø¥Ù„ØºØ§Ø¡ Ø§Ù„Ø­Ø¬Ø²">
                        <XCircle className="w-5 h-5" />
                      </button>
                    )}
                  </td>

                </tr>
              ))}
              {bookings.length === 0 && (
                <tr><td colSpan={8} className="text-center p-6 text-gray-500">Ù„Ø§ ØªÙˆØ¬Ø¯ Ø­Ø¬ÙˆØ²Ø§Øª</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex justify-center gap-2 mt-6">
          <button disabled={page === 1} onClick={() => setPage(p => p - 1)} className="px-3 py-1 border rounded disabled:opacity-50">Ø§Ù„Ø³Ø§Ø¨Ù‚</button>
          <span className="px-3 py-1">ØµÙØ­Ø© {page} Ù…Ù† {totalPages}</span>
          <button disabled={page === totalPages} onClick={() => setPage(p => p + 1)} className="px-3 py-1 border rounded disabled:opacity-50">Ø§Ù„ØªØ§Ù„ÙŠ</button>
        </div>
      )}

      {/* Add Booking Modal */}
      {isAddModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-900 rounded-lg shadow-lg max-w-2xl w-full p-6">
            <h3 className="text-xl font-bold mb-4 flex items-center gap-2">
              <MapPin className="w-5 h-5" /> Ø¥Ø¶Ø§ÙØ© Ø­Ø¬Ø² Ø¬Ø¯ÙŠØ¯
            </h3>
            <form onSubmit={handleSubmit(onSubmitBooking)} className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block mb-1">Ø§Ù„Ù…Ø±ÙÙ‚ *</label>
                <select {...register('facility_id')} className="w-full p-2 border rounded">
                  <option value="">Ø§Ø®ØªØ± Ø§Ù„Ù…Ø±ÙÙ‚</option>
                  {facilities.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
                </select>
                {errors.facility_id && <p className="text-red-500 text-sm mt-1">{errors.facility_id.message}</p>}
              </div>
              
              <div>
                <label className="block mb-1">ØªØ§Ø±ÙŠØ® Ø§Ù„Ø­Ø¬Ø² *</label>
                <input type="date" {...register('booking_date')} className="w-full p-2 border rounded" />
                {errors.booking_date && <p className="text-red-500 text-sm mt-1">{errors.booking_date.message}</p>}
              </div>

              <div>
                <label className="block mb-1">ÙˆÙ‚Øª Ø§Ù„Ø¨Ø¯Ø¡ *</label>
                <input type="time" {...register('start_time')} className="w-full p-2 border rounded" />
                {errors.start_time && <p className="text-red-500 text-sm mt-1">{errors.start_time.message}</p>}
                {isPeakTime && (
                  <p className="text-xs mt-1 font-bold text-orange-600 dark:text-orange-400 flex items-center gap-1">
                    ðŸ”¥ ÙˆÙ‚Øª Ø°Ø±ÙˆØ© (16:00 - 22:00) â€” Ø³Ø¹Ø± Ø§Ù„Ø°Ø±ÙˆØ© Ù…Ø·Ø¨Ù‚
                  </p>
                )}
              </div>

              <div>
                <label className="block mb-1">ÙˆÙ‚Øª Ø§Ù„Ø§Ù†ØªÙ‡Ø§Ø¡ *</label>
                <input type="time" {...register('end_time')} className="w-full p-2 border rounded" />
                {errors.end_time && <p className="text-red-500 text-sm mt-1">{errors.end_time.message}</p>}
              </div>

              <div className="md:col-span-2 border-t pt-4 mt-2">
                <h4 className="font-semibold mb-2">Ø¨ÙŠØ§Ù†Ø§Øª Ø§Ù„Ø­Ø§Ø¬Ø²</h4>
              </div>

              <div>
                <label className="block mb-1">Ø§Ø³Ù… Ø§Ù„Ø­Ø§Ø¬Ø² *</label>
                <input type="text" {...register('booker_name')} className="w-full p-2 border rounded" />
                {errors.booker_name && <p className="text-red-500 text-sm mt-1">{errors.booker_name.message}</p>}
              </div>

              <div>
                <label className="block mb-1">Ø±Ù‚Ù… Ø§Ù„Ù‡Ø§ØªÙ *</label>
                <input type="text" {...register('booker_phone')} className="w-full p-2 border rounded" dir="ltr" />
                {errors.booker_phone && <p className="text-red-500 text-sm mt-1">{errors.booker_phone.message}</p>}
              </div>

              <div className={`md:col-span-2 p-4 rounded-md flex items-center justify-between mt-2 ${isPeakTime ? 'bg-orange-50 dark:bg-orange-950/30 border border-orange-200 dark:border-orange-800' : 'bg-gray-50 dark:bg-gray-800'}`}>
                <div className="flex items-center gap-2">
                  <Clock className="w-5 h-5 text-gray-500" />
                  <span className="font-medium">Ø§Ù„Ù…Ø¯Ø©:</span>
                  <span>{watch('duration_hours' as any) || 0} Ø³Ø§Ø¹Ø©</span>
                </div>
                <div className="flex items-center gap-2">
                  <DollarSign className={`w-5 h-5 ${isPeakTime ? 'text-orange-500' : 'text-gray-500'}`} />
                  <span className="font-medium">Ø§Ù„Ø¥Ø¬Ù…Ø§Ù„ÙŠ {isPeakTime ? '(Ø³Ø¹Ø± Ø°Ø±ÙˆØ© ðŸ”¥)' : ''}:</span>
                  <span className={`text-lg font-bold ${isPeakTime ? 'text-orange-600 dark:text-orange-400' : 'text-green-600'}`}>
                    {watch('total_amount' as any) || 0} Ø¬.Ù…
                  </span>
                </div>
              </div>

              <div className="md:col-span-2 flex justify-end gap-2 mt-4">
                <button type="button" onClick={() => setIsAddModalOpen(false)} className="px-4 py-2 border rounded hover:bg-gray-100 dark:hover:bg-gray-800">Ø¥Ù„ØºØ§Ø¡</button>
                <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">ØªØ£ÙƒÙŠØ¯ Ø§Ù„Ø­Ø¬Ø²</button>
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
              <CreditCard className="w-6 h-6" /> ØªØ³Ø¬ÙŠÙ„ Ø³Ø¯Ø§Ø¯ Ø§Ù„Ø­Ø¬Ø² ÙˆØªØ±Ø­ÙŠÙ„ Ø§Ù„Ù‚ÙŠØ¯
            </h3>
            
            <div className="space-y-4">
              <div className="bg-gray-50 dark:bg-gray-800 p-3 rounded-md space-y-1">
                <div className="text-sm"><span className="text-gray-500">Ø§Ù„Ø­Ø§Ø¬Ø²:</span> <strong>{payingBooking.booker_name}</strong></div>
                <div className="text-sm"><span className="text-gray-500">Ø§Ù„Ù…Ø±ÙÙ‚:</span> <strong>{(payingBooking as any).stadium_facilities?.name || 'Ù…Ø±ÙÙ‚ Ø±ÙŠØ§Ø¶ÙŠ'}</strong></div>
                <div className="text-sm"><span className="text-gray-500">Ø§Ù„Ù…Ø¨Ù„Øº Ø§Ù„Ù…Ø·Ù„ÙˆØ¨:</span> <strong className="text-green-600 text-base">{payingBooking.total_amount} Ø¬.Ù…</strong></div>

              </div>

              <div>
                <label className="block mb-1 font-medium text-sm">Ø·Ø±ÙŠÙ‚Ø© Ø§Ù„Ø¯ÙØ¹ *</label>
                <select
                  value={selectedPaymentMethod}
                  onChange={(e) => setSelectedPaymentMethod(e.target.value)}
                  className="w-full p-2 border rounded bg-white dark:bg-gray-800"
                >
                  <option value="cash">Ù†Ù‚Ø¯Ø§Ù‹ (ÙƒØ§Ø´)</option>
                  <option value="card">Ø¨Ø·Ø§Ù‚Ø© Ù…Ø¯Ù‰ / POS / Ø¥Ù„ÙƒØªØ±ÙˆÙ†ÙŠ</option>
                  <option value="bank_transfer">ØªØ­ÙˆÙŠÙ„ Ø¨Ù†ÙƒÙŠ</option>
                  <option value="cheque">Ø´ÙŠÙƒ Ù…ØµØ±ÙÙŠ (Ø£ÙˆØ±Ø§Ù‚ Ù‚Ø¨Ø¶)</option>
                </select>
              </div>

              {selectedPaymentMethod !== 'cheque' ? (
                <div>
                  <label className="block mb-1 font-medium text-sm">Ø­Ø³Ø§Ø¨ Ø§Ù„Ø®Ø²ÙŠÙ†Ø© Ø£Ùˆ Ø§Ù„Ø¨Ù†Ùƒ Ø§Ù„Ù…Ø³ØªÙ„Ù… *</label>
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
                      <option value="1011">Ø§Ù„Ø®Ø²ÙŠÙ†Ø© Ø§Ù„Ø±Ø¦ÙŠØ³ÙŠØ© (1011)</option>
                    )}
                  </select>
                  <p className="text-xs text-gray-500 mt-1">Ø³ÙŠØªÙ… Ø¬Ø¹Ù„ Ù‡Ø°Ø§ Ø§Ù„Ø­Ø³Ø§Ø¨ Ù…Ø¯ÙŠÙ†Ø§Ù‹ ÙˆØ¥ÙŠØ±Ø§Ø¯Ø§Øª Ø§Ù„Ù…Ù„Ø§Ø¹Ø¨ Ø¯Ø§Ø¦Ù†Ø© ÙÙŠ Ø¯ÙØªØ± Ø§Ù„ÙŠÙˆÙ…ÙŠØ©.</p>
                </div>
              ) : (
                <div className="space-y-3 bg-amber-50 dark:bg-amber-950/30 p-3 rounded-lg border border-amber-200 dark:border-amber-800">
                  <div className="text-xs font-semibold text-amber-800 dark:text-amber-300 flex items-center gap-1">
                    <span>ðŸ“œ Ø¨ÙŠØ§Ù†Ø§Øª Ø´ÙŠÙƒ Ø§Ù„Ù‚Ø¨Ø¶ (Ø³ÙŠÙØ³Ø¬Ù„ ØªÙ„Ù‚Ø§Ø¦ÙŠØ§Ù‹ ÙÙŠ Ø¥Ø¯Ø§Ø±Ø© Ø§Ù„Ø´ÙŠÙƒØ§Øª)</span>
                  </div>
                  <div>
                    <label className="block mb-1 text-xs font-medium">Ø±Ù‚Ù… Ø§Ù„Ø´ÙŠÙƒ *</label>
                    <input
                      type="text"
                      placeholder="Ù…Ø«Ø§Ù„: 0004521"
                      value={chequeNumber}
                      onChange={(e) => setChequeNumber(e.target.value)}
                      className="w-full p-2 border rounded text-sm bg-white dark:bg-gray-800"
                      required
                    />
                  </div>
                  <div>
                    <label className="block mb-1 text-xs font-medium">Ø§Ù„Ø¨Ù†Ùƒ Ø§Ù„Ù…Ø³Ø­ÙˆØ¨ Ø¹Ù„ÙŠÙ‡ (Ø§Ø³Ù… Ø§Ù„Ø¨Ù†Ùƒ) *</label>
                    <input
                      type="text"
                      placeholder="Ù…Ø«Ø§Ù„: Ø§Ù„Ø¨Ù†Ùƒ Ø§Ù„Ø£Ù‡Ù„ÙŠ Ø§Ù„Ù…ØµØ±ÙŠ / Ø¨Ù†Ùƒ Ù…ØµØ± / Ø§Ù„Ø±Ø§Ø¬Ø­ÙŠ..."
                      value={chequeBankName}
                      onChange={(e) => setChequeBankName(e.target.value)}
                      className="w-full p-2 border rounded text-sm bg-white dark:bg-gray-800"
                      required
                    />
                  </div>
                  <div>
                    <label className="block mb-1 text-xs font-medium">ØªØ§Ø±ÙŠØ® Ø§Ø³ØªØ­Ù‚Ø§Ù‚ Ø§Ù„Ø´ÙŠÙƒ *</label>
                    <input
                      type="date"
                      value={chequeDueDate}
                      onChange={(e) => setChequeDueDate(e.target.value)}
                      className="w-full p-2 border rounded text-sm bg-white dark:bg-gray-800"
                      required
                    />
                  </div>
                  <p className="text-xs text-amber-700 dark:text-amber-400 leading-relaxed">
                    ðŸ’¡ Ø³ÙŠØªÙ… ØªÙˆØ¬ÙŠÙ‡ Ø§Ù„Ù‚ÙŠØ¯ Ø¥Ù„Ù‰ <strong>Ø­Ø³Ø§Ø¨ Ø£ÙˆØ±Ø§Ù‚ Ø§Ù„Ù‚Ø¨Ø¶ (1222)</strong>ØŒ ÙˆØ¥Ù†Ø´Ø§Ø¡ Ø´ÙŠÙƒ ÙˆØ§Ø±Ø¯ ÙÙŠ Ù…Ø¯ÙŠÙˆÙ„ <strong>Ø§Ù„Ø®Ø²Ù† ÙˆØ§Ù„Ø¨Ù†ÙˆÙƒ</strong> Ù„ØªØ­ØµÙŠÙ„Ù‡ Ù„Ø§Ø­Ù‚Ø§Ù‹ Ø¹Ù†Ø¯ Ø§Ø³ØªØ­Ù‚Ø§Ù‚Ù‡.
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
                  Ø¥Ù„ØºØ§Ø¡
                </button>
                <button
                  type="button"
                  disabled={isProcessingPayment}
                  onClick={handleConfirmPayment}
                  className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 flex items-center gap-2"
                >
                  {isProcessingPayment ? 'Ø¬Ø§Ø±ÙŠ Ø§Ù„ØªØ±Ø­ÙŠÙ„...' : 'ØªØ£ÙƒÙŠØ¯ Ø§Ù„Ø³Ø¯Ø§Ø¯ ÙˆØªÙˆÙ„ÙŠØ¯ Ø§Ù„Ù‚ÙŠØ¯'}
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



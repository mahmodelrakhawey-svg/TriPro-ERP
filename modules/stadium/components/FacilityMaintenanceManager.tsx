import React, { useState, useEffect } from 'react';
import { supabase } from '@/supabaseClient';
import { useAccounting } from '@/context/AccountingContext';
import toast from 'react-hot-toast';
import {
  Wrench,
  Plus,
  Search,
  Filter,
  Calendar,
  Clock,
  CheckCircle2,
  AlertCircle,
  X,
  Edit,
  Trash2,
  Building2,
  ShieldAlert,
  Printer,
  DollarSign,
  CheckSquare,
} from 'lucide-react';
import { useForm } from 'react-hook-form';
import {
  StadiumMaintenanceTicket,
  StadiumFacility,
  MaintenanceType,
  MAINTENANCE_TYPE_LABELS,
  MAINTENANCE_STATUS_LABELS,
  MAINTENANCE_STATUS_COLORS,
} from '../stadium.types';
import {
  getTreasuryAccounts,
  TreasuryAccountOption,
  createMaintenancePaymentJournalEntry,
} from '../stadiumHelpers';
import { ReceiptModal, ReceiptData } from './ReceiptModal';

export const FacilityMaintenanceManager: React.FC = () => {
  const { currentUser, organization, currentSelectedOrgId } = useAccounting();
  const orgId = currentSelectedOrgId || (currentUser as any)?.organization_id || (organization as any)?.id;

  const [tickets, setTickets] = useState<StadiumMaintenanceTicket[]>([]);
  const [facilities, setFacilities] = useState<StadiumFacility[]>([]);
  const [treasuryAccounts, setTreasuryAccounts] = useState<TreasuryAccountOption[]>([]);
  const [loading, setLoading] = useState(true);

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [facilityFilter, setFacilityFilter] = useState('');

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingTicket, setEditingTicket] = useState<StadiumMaintenanceTicket | null>(null);

  // Financial Options State
  const [generateJournal, setGenerateJournal] = useState(true);
  const [receiptModalData, setReceiptModalData] = useState<ReceiptData | null>(null);

  const { register, handleSubmit, reset, setValue, watch } = useForm();
  const watchStatus = watch('status');
  const watchActualCost = watch('actual_cost');
  const watchPaymentMethod = watch('payment_method') || 'cash';


  const fetchFacilities = async () => {
    if (!orgId) return;
    try {
      const { data } = await supabase
        .from('stadium_facilities')
        .select('*')
        .eq('organization_id', orgId)
        .order('name');
      setFacilities(data || []);
      getTreasuryAccounts(orgId).then(setTreasuryAccounts);
    } catch (e) {
      console.error(e);
    }
  };

  const fetchTickets = async () => {
    if (!orgId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      let query = supabase
        .from('stadium_maintenance_tickets')
        .select('*, stadium_facilities(name, type)')
        .eq('organization_id', orgId)
        .order('start_date', { ascending: false });

      if (search) {
        query = query.or(`title.ilike.%${search}%,ticket_number.ilike.%${search}%,assigned_technician.ilike.%${search}%`);
      }
      if (statusFilter) {
        query = query.eq('status', statusFilter);
      }
      if (facilityFilter) {
        query = query.eq('facility_id', facilityFilter);
      }

      const { data, error } = await query;
      if (error) {
        console.warn('Maintenance fetch error:', error);
      } else {
        setTickets(data || []);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (orgId) {
      fetchFacilities();
      // تصحيح تلقائي لمسمى حساب صيانة الملاعب 5101 في قاعدة البيانات
      supabase
        .from('accounts')
        .update({ name: 'مصروفات صيانة الملاعب والمرافق', type: 'EXPENSE' })
        .eq('organization_id', orgId)
        .eq('code', '5101')
        .ilike('name', '%الخزينة%')
        .then(() => {});
    }
  }, [orgId]);

  useEffect(() => {
    fetchTickets();
  }, [orgId, search, statusFilter, facilityFilter]);


  const onSaveTicket = async (data: any) => {
    if (!orgId) return;
    const actualCost = parseFloat(data.actual_cost) || 0;
    const isCompleted = data.status === 'completed';
    let journalId = editingTicket?.journal_entry_id || null;

    const ticketNumber = editingTicket ? editingTicket.ticket_number : `MNT-${Math.floor(100000 + Math.random() * 900000)}`;
    const facilityObj = facilities.find(f => f.id === data.facility_id);
    const facilityName = facilityObj?.name || 'مرفق الاستاد';

    // 🌟 توليد القيد المحاسبي المباشر لمصروف الصيانة عند إكمال الأمر
    if (isCompleted && actualCost > 0 && generateJournal && !journalId) {
      const jeRes = await createMaintenancePaymentJournalEntry(
        orgId,
        editingTicket?.id || '',
        actualCost,
        facilityName,
        data.title?.trim() || 'صيانة منشأة',
        data.end_date || new Date().toISOString().split('T')[0],
        data.payment_method || 'cash',
        data.treasury_account_id,
        {
          cheque_number: data.cheque_number,
          bank_name: data.bank_name,
          due_date: data.due_date,
          notes: `سداد تكلفة أمر صيانة: ${ticketNumber}`,
        }
      );

      if (jeRes.success && jeRes.journalEntryId) {
        journalId = jeRes.journalEntryId;
        toast.success('تم توليد وترحيل قيد سداد الصيانة بنجاح (5101 ➔ الخزينة)');

        // فتح إيصال الصرف الفوري للطباعة
        setReceiptModalData({
          receiptNumber: ticketNumber,
          receiptDate: data.end_date || new Date().toISOString().split('T')[0],
          receiptTypeLabel: 'إيصال سداد وصرف مصروفات صيانة منشأة',
          partyName: data.assigned_technician?.trim() || 'مسؤول الصيانة الميدانية',
          partyPhone: undefined,
          amount: actualCost,
          paymentMethod: data.payment_method || 'cash',
          facilityOrProgramName: `مرفق: ${facilityName}`,
          periodOrDuration: `${data.start_date} إلى ${data.end_date}`,
          chequeNumber: data.cheque_number,
          bankName: data.bank_name,
          notes: `أمر صيانة: ${data.title?.trim()} (${MAINTENANCE_TYPE_LABELS[data.maintenance_type as MaintenanceType] || ''})`,
        });
      }
    }

    const startTime = data.start_time?.trim() || null;
    const endTime = data.end_time?.trim() || null;

    let notesText = data.notes?.trim() || null;
    if (journalId && !notesText?.includes('قيد صرف')) {
      notesText = `${notesText ? notesText + ' | ' : ''}قيد صرف: ${journalId}`;
    }

    const ticketPayload: any = {
      organization_id: orgId,
      facility_id: data.facility_id,
      ticket_number: ticketNumber,
      title: data.title?.trim(),
      maintenance_type: data.maintenance_type || 'routine',
      priority: data.priority || 'normal',
      start_date: data.start_date,
      end_date: data.end_date,
      start_time: startTime,
      end_time: endTime,
      is_blocking_bookings: data.is_blocking_bookings === true || data.is_blocking_bookings === 'true',
      estimated_cost: parseFloat(data.estimated_cost) || 0,
      actual_cost: actualCost,
      assigned_technician: data.assigned_technician?.trim() || null,
      status: data.status || 'scheduled',
      journal_entry_id: journalId,
      payment_method: data.payment_method || 'cash',
      notes: notesText,
    };

    if (editingTicket) {
      let { error } = await supabase
        .from('stadium_maintenance_tickets')
        .update(ticketPayload)
        .eq('id', editingTicket.id);

      // Fallback if journal_entry_id / payment_method columns are not yet present
      if (error) {
        console.warn('Initial update failed, retrying without optional columns:', error);
        delete ticketPayload.journal_entry_id;
        delete ticketPayload.payment_method;
        const res2 = await supabase
          .from('stadium_maintenance_tickets')
          .update(ticketPayload)
          .eq('id', editingTicket.id);
        error = res2.error;
      }

      if (error) {
        console.error('Update ticket error:', error);
        toast.error('حدث خطأ أثناء تعديل أمر الصيانة');
      } else {
        toast.success('تم تحديث أمر الصيانة بنجاح');
        setIsModalOpen(false);
        fetchTickets();
      }
    } else {
      let { error } = await supabase
        .from('stadium_maintenance_tickets')
        .insert([ticketPayload]);

      if (error) {
        console.warn('Initial insert failed, retrying without optional columns:', error);
        delete ticketPayload.journal_entry_id;
        delete ticketPayload.payment_method;
        const res2 = await supabase
          .from('stadium_maintenance_tickets')
          .insert([ticketPayload]);
        error = res2.error;
      }

      if (error) {
        console.error('Insert ticket error:', error);
        toast.error('حدث خطأ أثناء إنشاء أمر الصيانة');
      } else {
        toast.success('تم جدولة أمر الصيانة بنجاح');
        setIsModalOpen(false);
        fetchTickets();
      }
    }
  };


  const openAdd = () => {
    setEditingTicket(null);
    setGenerateJournal(true);
    const today = new Date().toISOString().split('T')[0];
    reset({
      facility_id: facilities[0]?.id || '',
      title: '',
      maintenance_type: 'routine',
      priority: 'normal',
      start_date: today,
      end_date: today,
      start_time: '08:00',
      end_time: '14:00',
      is_blocking_bookings: true,
      estimated_cost: 0,
      actual_cost: 0,
      assigned_technician: '',
      status: 'scheduled',
      payment_method: 'cash',
      treasury_account_id: treasuryAccounts[0]?.id || '1011',
      notes: '',
    });
    setIsModalOpen(true);
  };

  const openEdit = (ticket: StadiumMaintenanceTicket) => {
    setEditingTicket(ticket);
    setGenerateJournal(!ticket.journal_entry_id);
    reset({
      facility_id: ticket.facility_id,
      title: ticket.title,
      maintenance_type: ticket.maintenance_type,
      priority: ticket.priority,
      start_date: ticket.start_date,
      end_date: ticket.end_date,
      start_time: ticket.start_time || '',
      end_time: ticket.end_time || '',
      is_blocking_bookings: ticket.is_blocking_bookings,
      estimated_cost: ticket.estimated_cost,
      actual_cost: ticket.actual_cost,
      assigned_technician: ticket.assigned_technician || '',
      status: ticket.status,
      payment_method: ticket.payment_method || 'cash',
      treasury_account_id: treasuryAccounts[0]?.id || '1011',
      notes: ticket.notes || '',
    });
    setIsModalOpen(true);
  };


  const handleDelete = async (id: string) => {
    if (!window.confirm('هل أنت متأكد من حذف أمر الصيانة هذا؟')) return;
    const { error } = await supabase.from('stadium_maintenance_tickets').delete().eq('id', id);
    if (error) {
      toast.error('حدث خطأ أثناء الحذف');
    } else {
      toast.success('تم حذف أمر الصيانة بنجاح');
      fetchTickets();
    }
  };

  const updateStatus = async (ticket: StadiumMaintenanceTicket, newStatus: string) => {
    const { error } = await supabase
      .from('stadium_maintenance_tickets')
      .update({ status: newStatus })
      .eq('id', ticket.id);
    if (!error) {
      toast.success(`تم تغيير الحالة إلى ${MAINTENANCE_STATUS_LABELS[newStatus as any]}`);
      fetchTickets();
    }
  };

  return (
    <div className="p-6 bg-gray-50 dark:bg-gray-900 min-h-screen text-right" dir="rtl">
      {/* Top Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
            <Wrench className="w-7 h-7 text-indigo-600 dark:text-indigo-400" />
            إدارة الصيانة الميدانية للملاعب والمرافق
          </h1>
          <p className="text-xs text-gray-500 mt-1">جدولة أعمال صيانة النجيل والكشافات والفلاتر وحجب الملاعب أثناء الصيانة تلقائياً</p>
        </div>

        <button
          onClick={openAdd}
          className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-xl text-xs font-bold shadow-sm transition"
        >
          <Plus className="w-4 h-4" />
          جدولة أمر صيانة جديد
        </button>
      </div>

      {/* Filters Bar */}
      <div className="flex flex-wrap gap-4 mb-6">
        <div className="flex-1 min-w-[240px] relative">
          <Search className="w-5 h-5 absolute right-3 top-2.5 text-gray-400" />
          <input
            type="text"
            placeholder="بحث بالموضوع، رقم الأمر، أو الفني المسؤول..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pr-10 py-2 border rounded-xl dark:bg-gray-800 dark:border-gray-700 text-xs"
          />
        </div>

        <select
          value={facilityFilter}
          onChange={(e) => setFacilityFilter(e.target.value)}
          className="px-3 py-2 border rounded-xl dark:bg-gray-800 dark:border-gray-700 text-xs"
        >
          <option value="">جميع المرافق والملاعب</option>
          {facilities.map(f => (
            <option key={f.id} value={f.id}>{f.name}</option>
          ))}
        </select>

        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="px-3 py-2 border rounded-xl dark:bg-gray-800 dark:border-gray-700 text-xs"
        >
          <option value="">جميع الحالات</option>
          <option value="scheduled">مجدولة</option>
          <option value="in_progress">قيد التنفيذ</option>
          <option value="completed">مكتملة</option>
          <option value="cancelled">ملغاة</option>
        </select>
      </div>

      {/* Tickets Table */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-right text-sm">
            <thead className="bg-gray-50 dark:bg-gray-900/50 border-b dark:border-gray-700">
              <tr>
                <th className="px-5 py-3.5 font-semibold text-gray-600 dark:text-gray-300">أمر الصيانة</th>
                <th className="px-5 py-3.5 font-semibold text-gray-600 dark:text-gray-300">المرفق المستهدف</th>
                <th className="px-5 py-3.5 font-semibold text-gray-600 dark:text-gray-300">النوع</th>
                <th className="px-5 py-3.5 font-semibold text-gray-600 dark:text-gray-300">الفترة الزمنية</th>
                <th className="px-5 py-3.5 font-semibold text-gray-600 dark:text-gray-300">حجب الحجوزات</th>
                <th className="px-5 py-3.5 font-semibold text-gray-600 dark:text-gray-300">التكلفة (ج.م)</th>
                <th className="px-5 py-3.5 font-semibold text-gray-600 dark:text-gray-300">الحالة</th>
                <th className="px-5 py-3.5 font-semibold text-gray-600 dark:text-gray-300 text-center">إجراءات</th>
              </tr>
            </thead>
            <tbody className="divide-y dark:divide-gray-700 text-xs">
              {loading ? (
                <tr>
                  <td colSpan={8} className="text-center py-10 text-gray-400">جاري تحميل أوامر الصيانة...</td>
                </tr>
              ) : tickets.length === 0 ? (
                <tr>
                  <td colSpan={8} className="text-center py-10 text-gray-400">لا توجد أوامر صيانة مسجلة حالياً</td>
                </tr>
              ) : (
                tickets.map((ticket) => (
                  <tr key={ticket.id} className="hover:bg-gray-50 dark:hover:bg-gray-750">
                    <td className="px-5 py-3.5">
                      <div className="font-bold text-gray-900 dark:text-gray-100">{ticket.title}</div>
                      <div className="text-[10px] text-gray-400 font-mono">{ticket.ticket_number} • الفني: {ticket.assigned_technician || '—'}</div>
                    </td>
                    <td className="px-5 py-3.5 font-semibold text-indigo-700 dark:text-indigo-400">
                      {ticket.stadium_facilities?.name || 'مرفق'}
                    </td>
                    <td className="px-5 py-3.5">
                      <span className="bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded text-[11px]">
                        {MAINTENANCE_TYPE_LABELS[ticket.maintenance_type] || ticket.maintenance_type}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 font-mono">
                      <div>{ticket.start_date} إلى {ticket.end_date}</div>
                      {ticket.start_time && <div className="text-[10px] text-gray-400">{ticket.start_time} - {ticket.end_time}</div>}
                    </td>
                    <td className="px-5 py-3.5">
                      {ticket.is_blocking_bookings ? (
                        <span className="inline-flex items-center gap-1 bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300 px-2 py-0.5 rounded font-semibold text-[10px]">
                          <ShieldAlert className="w-3 h-3" /> محجوب عن الحجز
                        </span>
                      ) : (
                        <span className="text-gray-400">متاح للحجز</span>
                      )}
                    </td>
                    <td className="px-5 py-3.5 font-bold font-mono">
                      {ticket.actual_cost > 0 ? (
                        <span className="text-red-600">{ticket.actual_cost.toLocaleString('ar-EG')} ج.م</span>
                      ) : (
                        <span className="text-gray-500">تقديري: {ticket.estimated_cost.toLocaleString('ar-EG')} ج.م</span>
                      )}
                    </td>
                    <td className="px-5 py-3.5">
                      <select
                        value={ticket.status}
                        onChange={(e) => updateStatus(ticket, e.target.value)}
                        className={`text-xs font-bold rounded-lg px-2 py-1 border-none ${MAINTENANCE_STATUS_COLORS[ticket.status]}`}
                      >
                        <option value="scheduled">مجدولة</option>
                        <option value="in_progress">قيد التنفيذ</option>
                        <option value="completed">مكتملة</option>
                        <option value="cancelled">ملغاة</option>
                      </select>
                      {ticket.journal_entry_id && (
                        <div className="text-[10px] text-emerald-600 dark:text-emerald-400 font-mono mt-1 font-bold">
                          قيد صرف مرحّل 🟢
                        </div>
                      )}
                    </td>
                    <td className="px-5 py-3.5">
                      <div className="flex gap-1.5 justify-center items-center">
                        {ticket.actual_cost > 0 && (
                          <button
                            onClick={() => {
                              setReceiptModalData({
                                receiptNumber: ticket.ticket_number,
                                receiptDate: ticket.end_date || new Date().toISOString().split('T')[0],
                                receiptTypeLabel: 'إيصال سداد وصرف مصروفات صيانة منشأة',
                                partyName: ticket.assigned_technician?.trim() || 'مسؤول الصيانة الميدانية',
                                amount: Number(ticket.actual_cost),
                                paymentMethod: ticket.payment_method || 'cash',
                                facilityOrProgramName: `مرفق: ${ticket.stadium_facilities?.name || 'مرفق الاستاد'}`,
                                periodOrDuration: `${ticket.start_date} إلى ${ticket.end_date}`,
                                notes: `أمر صيانة: ${ticket.title} (${MAINTENANCE_TYPE_LABELS[ticket.maintenance_type] || ''})`,
                              });
                            }}
                            className="p-1 text-emerald-700 bg-emerald-50 hover:bg-emerald-100 rounded"
                            title="طباعة إيصال سداد الصيانة"
                          >
                            <Printer className="w-4 h-4" />
                          </button>
                        )}
                        <button onClick={() => openEdit(ticket)} className="p-1 text-blue-600 hover:bg-blue-50 rounded" title="تعديل">
                          <Edit className="w-4 h-4" />
                        </button>
                        <button onClick={() => handleDelete(ticket.id)} className="p-1 text-red-600 hover:bg-red-50 rounded" title="حذف">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add / Edit Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]">
            <div className="flex justify-between items-center p-5 border-b dark:border-gray-800 bg-slate-50 dark:bg-slate-850">
              <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
                <Wrench className="w-5 h-5 text-indigo-600" />
                {editingTicket ? 'تعديل أمر صيانة' : 'جدولة أمر صيانة جديد'}
              </h3>
              <button onClick={() => setIsModalOpen(false)} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit(onSaveTicket)} className="p-6 space-y-4 overflow-y-auto text-xs">
              <div>
                <label className="block font-bold mb-1">المرفق / الملعب المستهدف *</label>
                <select {...register('facility_id', { required: true })} className="w-full p-2 border rounded-xl dark:bg-gray-800 dark:border-gray-700">
                  {facilities.map(f => (
                    <option key={f.id} value={f.id}>{f.name} ({f.type})</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-bold mb-1">موضوع / بيان الصيانة *</label>
                <input {...register('title', { required: true })} placeholder="مثال: تغيير رول النجيل الصناعي لكامل الملعب" className="w-full p-2 border rounded-xl dark:bg-gray-800 dark:border-gray-700" />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block font-bold mb-1">نوع الصيانة</label>
                  <select {...register('maintenance_type')} className="w-full p-2 border rounded-xl dark:bg-gray-800 dark:border-gray-700">
                    {Object.entries(MAINTENANCE_TYPE_LABELS).map(([k, v]) => (
                      <option key={k} value={k}>{v}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block font-bold mb-1">الأولوية</label>
                  <select {...register('priority')} className="w-full p-2 border rounded-xl dark:bg-gray-800 dark:border-gray-700">
                    <option value="low">منخفضة</option>
                    <option value="normal">عادية</option>
                    <option value="high">عالية</option>
                    <option value="urgent">طارئة وعاجلة</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block font-bold mb-1">حالة أمر الصيانة</label>
                  <select {...register('status')} className="w-full p-2 border rounded-xl dark:bg-gray-800 dark:border-gray-700 font-bold">
                    <option value="scheduled">مجدولة</option>
                    <option value="in_progress">قيد التنفيذ</option>
                    <option value="completed">مكتملة</option>
                    <option value="cancelled">ملغاة</option>
                  </select>
                </div>
                <div>
                  <label className="block font-bold mb-1">الفني / الشركة المسؤولة</label>
                  <input {...register('assigned_technician')} placeholder="مثال: شركة المقاولون للنجيل" className="w-full p-2 border rounded-xl dark:bg-gray-800 dark:border-gray-700" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block font-bold mb-1">تاريخ البدء *</label>
                  <input type="date" {...register('start_date', { required: true })} className="w-full p-2 border rounded-xl dark:bg-gray-800 dark:border-gray-700" />
                </div>
                <div>
                  <label className="block font-bold mb-1">تاريخ الانتهاء *</label>
                  <input type="date" {...register('end_date', { required: true })} className="w-full p-2 border rounded-xl dark:bg-gray-800 dark:border-gray-700" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block font-bold mb-1">ساعة البدء (اختياري)</label>
                  <input type="time" {...register('start_time')} className="w-full p-2 border rounded-xl dark:bg-gray-800 dark:border-gray-700" />
                </div>
                <div>
                  <label className="block font-bold mb-1">ساعة الانتهاء (اختياري)</label>
                  <input type="time" {...register('end_time')} className="w-full p-2 border rounded-xl dark:bg-gray-800 dark:border-gray-700" />
                </div>
              </div>

              <div className="p-3 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 rounded-xl flex items-center justify-between">
                <div>
                  <span className="font-bold text-amber-900 dark:text-amber-200 block">حجب المرفق عن الحجوزات؟</span>
                  <span className="text-[11px] text-amber-700 dark:text-amber-300">يمنع حجز الملعب في هذه الفترة الزمنية تلقائياً</span>
                </div>
                <input type="checkbox" {...register('is_blocking_bookings')} className="w-5 h-5 rounded text-indigo-600" />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block font-bold mb-1">التكلفة التقديرية (ج.م)</label>
                  <input type="number" step="0.01" {...register('estimated_cost')} className="w-full p-2 border rounded-xl dark:bg-gray-800 dark:border-gray-700" />
                </div>
                <div>
                  <label className="block font-bold mb-1">التكلفة الفعلية (ج.م)</label>
                  <input type="number" step="0.01" {...register('actual_cost')} className="w-full p-2 border rounded-xl dark:bg-gray-800 dark:border-gray-700 font-bold font-mono text-indigo-600" />
                </div>
              </div>

              {/* Financial Box: Journal Entry Generation when Completed & Actual Cost > 0 */}
              {watchStatus === 'completed' && Number(watchActualCost) > 0 && (
                <div className="bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 rounded-xl p-3.5 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <DollarSign className="w-4 h-4 text-emerald-600" />
                      <span className="font-bold text-emerald-900 dark:text-emerald-200">
                        {editingTicket?.journal_entry_id ? 'القيد المحاسبي مسجل ومرحّل بالفعل 🟢' : 'توليد قيد صرف وسداد التكلفة فورياً؟'}
                      </span>
                    </div>
                    {!editingTicket?.journal_entry_id && (
                      <input
                        type="checkbox"
                        checked={generateJournal}
                        onChange={(e) => setGenerateJournal(e.target.checked)}
                        className="w-5 h-5 rounded text-emerald-600"
                      />
                    )}
                  </div>

                  {generateJournal && !editingTicket?.journal_entry_id && (
                    <div className="space-y-3 pt-2 border-t border-emerald-200/60 dark:border-emerald-800">
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block font-medium text-[11px] mb-1">طريقة السداد</label>
                          <select {...register('payment_method')} className="w-full p-1.5 border rounded-lg bg-white dark:bg-gray-800">
                            <option value="cash">نقدي (الخزينة)</option>
                            <option value="bank_transfer">تحويل بنكي</option>
                            <option value="cheque">شيك صادر</option>
                          </select>
                        </div>
                        <div>
                          <label className="block font-medium text-[11px] mb-1">الخزينة / الحساب الدائن</label>
                          <select {...register('treasury_account_id')} className="w-full p-1.5 border rounded-lg bg-white dark:bg-gray-800">
                            {treasuryAccounts.map(acc => (
                              <option key={acc.id} value={acc.id}>{acc.name} ({acc.code})</option>
                            ))}
                          </select>
                        </div>
                      </div>

                      {watchPaymentMethod === 'cheque' && (
                        <div className="grid grid-cols-3 gap-2 bg-white dark:bg-gray-900 p-2.5 rounded-lg border">
                          <div>
                            <label className="block text-[10px] mb-1">رقم الشيك *</label>
                            <input {...register('cheque_number')} placeholder="مثال: 00984" className="w-full p-1 border rounded text-xs" />
                          </div>
                          <div>
                            <label className="block text-[10px] mb-1">اسم البنك *</label>
                            <input {...register('bank_name')} placeholder="مثال: الأهلي / مصر" className="w-full p-1 border rounded text-xs" />
                          </div>
                          <div>
                            <label className="block text-[10px] mb-1">تاريخ الاستحقاق</label>
                            <input type="date" {...register('due_date')} className="w-full p-1 border rounded text-xs" />
                          </div>
                        </div>
                      )}

                      <div className="text-[11px] text-emerald-700 dark:text-emerald-300 font-mono bg-white/70 dark:bg-black/30 p-2 rounded-lg">
                        💡 سيتم توليد القيد تلقائياً: <strong>مدين (5101 صيانة الملاعب) ➔ دائن (الخزينة/البنك {Number(watchActualCost).toLocaleString('ar-EG')} ج.م)</strong>
                      </div>
                    </div>
                  )}
                </div>
              )}

              <div>
                <label className="block font-bold mb-1">ملاحظات</label>
                <textarea {...register('notes')} rows={2} className="w-full p-2 border rounded-xl dark:bg-gray-800 dark:border-gray-700"></textarea>
              </div>

              <div className="flex justify-end gap-3 pt-3 border-t dark:border-gray-800">
                <button type="button" onClick={() => setIsModalOpen(false)} className="px-4 py-2 border rounded-xl text-gray-600 hover:bg-gray-100">إلغاء</button>
                <button type="submit" className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold shadow transition">حفظ أمر الصيانة</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Printable Receipt Modal */}
      <ReceiptModal
        isOpen={Boolean(receiptModalData)}
        onClose={() => setReceiptModalData(null)}
        data={receiptModalData}
      />
    </div>
  );
};

export default FacilityMaintenanceManager;


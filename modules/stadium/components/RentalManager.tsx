import React, { useState, useEffect } from 'react';
import { supabase } from '@/supabaseClient';
import { useAccounting } from '@/context/AccountingContext';
import toast from 'react-hot-toast';
import { 
  FileText, DollarSign, AlertTriangle, Plus, Eye, CheckCircle, Calendar, 
  X, ChevronLeft, ChevronRight, Printer 
} from 'lucide-react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { addDays, addMonths, addWeeks, isBefore, parseISO, startOfDay } from 'date-fns';

// Types
import { StadiumRentalContract, StadiumRentalPayment, StadiumFacility } from '../stadium.types';
import { createRentalPaymentJournalEntry, getTreasuryAccounts, TreasuryAccountOption } from '../stadiumHelpers';
import { RentalContractPrintModal } from './RentalContractPrintModal';
import { ReceiptModal, ReceiptData } from './ReceiptModal';


const contractSchema = z.object({
  tenant_name: z.string().min(1, { message: 'اسم المستأجر مطلوب' }),
  tenant_phone: z.string().optional(),
  tenant_email: z.string().optional(),
  facility_id: z.string().min(1, { message: 'المرفق مطلوب' }),
  start_date: z.string().min(1, { message: 'تاريخ البداية مطلوب' }),
  end_date: z.string().min(1, { message: 'تاريخ النهاية مطلوب' }),
  billing_cycle: z.enum(['weekly', 'monthly']),
  amount_per_cycle: z.number().min(0, { message: 'المبلغ مطلوب' }),
  notes: z.string().optional(),
});

type ContractFormValues = z.infer<typeof contractSchema>;

const paymentSchema = z.object({
  amount_paid: z.number().min(1, { message: 'المبلغ مطلوب' }),
  payment_method: z.enum(['cash', 'bank_transfer', 'card', 'cheque']),
  treasury_account_id: z.string().optional(),
  cheque_number: z.string().optional(),
  bank_name: z.string().optional(),
  due_date: z.string().optional(),
  period_from: z.string().min(1, { message: 'الفترة من مطلوبة' }),
  period_to: z.string().min(1, { message: 'الفترة إلى مطلوبة' }),
});

type PaymentFormValues = z.infer<typeof paymentSchema>;

const ITEMS_PER_PAGE = 25;

const RentalManager: React.FC = () => {
  const { currentUser } = useAccounting();
  const orgId = (currentUser as any)?.organization_id;

  const [contracts, setContracts] = useState<StadiumRentalContract[]>([]);
  const [facilities, setFacilities] = useState<StadiumFacility[]>([]);
  const [treasuryAccounts, setTreasuryAccounts] = useState<TreasuryAccountOption[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [loading, setLoading] = useState(false);

  const [alerts, setAlerts] = useState<StadiumRentalContract[]>([]);

  const [isContractModalOpen, setIsContractModalOpen] = useState(false);
  const [paymentModalContract, setPaymentModalContract] = useState<StadiumRentalContract | null>(null);
  const [viewHistoryContractId, setViewHistoryContractId] = useState<string | null>(null);
  const [paymentsHistory, setPaymentsHistory] = useState<StadiumRentalPayment[]>([]);
  
  const [printContract, setPrintContract] = useState<StadiumRentalContract | null>(null);
  const [receiptModalData, setReceiptModalData] = useState<ReceiptData | null>(null);


  const { register: registerContract, handleSubmit: handleContractSubmit, control: controlContract, reset: resetContract, formState: { errors: contractErrors } } = useForm<ContractFormValues>({
    resolver: zodResolver(contractSchema),
    defaultValues: { billing_cycle: 'monthly', amount_per_cycle: 0 }
  });

  const { register: registerPayment, handleSubmit: handlePaymentSubmit, reset: resetPayment, watch: watchPayment, formState: { errors: paymentErrors } } = useForm<PaymentFormValues>({
    resolver: zodResolver(paymentSchema),
    defaultValues: { payment_method: 'cash', amount_paid: 0 }
  });


  useEffect(() => {
    if (orgId) {
      fetchFacilities();
      fetchContracts();
      fetchAlerts();
      getTreasuryAccounts(orgId).then(setTreasuryAccounts);
    }
  }, [orgId, currentPage]);


  const fetchFacilities = async () => {
    const { data, error } = await supabase
      .from('stadium_facilities')
      .select('*')
      .eq('organization_id', orgId);
    if (!error && data) setFacilities(data);
  };

  const fetchContracts = async () => {
    setLoading(true);
    const start = (currentPage - 1) * ITEMS_PER_PAGE;
    const end = start + ITEMS_PER_PAGE - 1;

    const { data, error, count } = await supabase
      .from('stadium_rental_contracts')
      .select('*, facility:stadium_facilities(*)', { count: 'exact' })
      .eq('organization_id', orgId)
      .order('created_at', { ascending: false })
      .range(start, end);

    if (error) {
      toast.error('حدث خطأ أثناء جلب العقود');
    } else {
      setContracts(data || []);
      setTotalCount(count || 0);
    }
    setLoading(false);
  };

  const fetchAlerts = async () => {
    const targetDate = addDays(new Date(), 7).toISOString();
    const { data, error } = await supabase
      .from('stadium_rental_contracts')
      .select('*, facility:stadium_facilities(*)')
      .eq('organization_id', orgId)
      .eq('status', 'active')
      .lte('next_due_date', targetDate)
      .order('next_due_date', { ascending: true });
    
    if (!error && data) {
      setAlerts(data);
    }
  };

  const onSubmitContract = async (data: ContractFormValues) => {
    let nextDueDate = parseISO(data.start_date);
    if (data.billing_cycle === 'monthly') {
      nextDueDate = addMonths(nextDueDate, 1);
    } else {
      nextDueDate = addWeeks(nextDueDate, 1);
    }

    const newContract = {
      organization_id: orgId,
      facility_id: data.facility_id,
      tenant_name: data.tenant_name?.trim(),
      tenant_phone: data.tenant_phone?.trim() || null,
      tenant_email: data.tenant_email?.trim() || null,
      start_date: data.start_date,
      end_date: data.end_date,
      billing_cycle: data.billing_cycle,
      amount_per_cycle: data.amount_per_cycle,
      notes: (data as any).notes?.trim() || null,
      next_due_date: nextDueDate.toISOString().split('T')[0],
      status: 'active'
    };


    const { error } = await supabase.from('stadium_rental_contracts').insert([newContract]);
    if (error) {
      toast.error('حدث خطأ أثناء إنشاء العقد');
    } else {
      toast.success('تم إنشاء العقد بنجاح');
      setIsContractModalOpen(false);
      resetContract();
      fetchContracts();
      fetchAlerts();
    }
  };

  const onSubmitPayment = async (data: PaymentFormValues) => {
    if (!paymentModalContract) return;
    const today = new Date().toISOString().split('T')[0];
    const amount = parseFloat(String(data.amount_paid)) || 0;

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
      party_name: paymentModalContract.tenant_name,
      notes: `دفعة إيجار — ${paymentModalContract.tenant_name}`
    } : undefined;

    // قيد دفعة إيجار: مدين الخزينة/البنك أو أوراق القبض — دائن إيرادات الإيجارات
    const jeResult = await createRentalPaymentJournalEntry(
      orgId,
      amount,
      `دفعة إيجار — ${paymentModalContract.tenant_name}`,
      today,
      data.treasury_account_id,
      data.payment_method,
      chequeDetails
    );

    const newPayment = {
      organization_id: orgId,
      contract_id: paymentModalContract.id,
      amount_paid: amount,
      payment_method: data.payment_method || 'cash',
      period_from: data.period_from,
      period_to: data.period_to,
      payment_date: today,
      journal_entry_id: jeResult.success ? jeResult.journalEntryId : null,
    };

    const { error: paymentError } = await supabase.from('stadium_rental_payments').insert([newPayment]);


    
    if (paymentError) {
      toast.error('حدث خطأ أثناء تسجيل الدفعة');
      return;
    }

    let newNextDueDate = parseISO(paymentModalContract.next_due_date);
    if (paymentModalContract.billing_cycle === 'monthly') {
      newNextDueDate = addMonths(newNextDueDate, 1);
    } else {
      newNextDueDate = addWeeks(newNextDueDate, 1);
    }

    const { error: updateError } = await supabase
      .from('stadium_rental_contracts')
      .update({ next_due_date: newNextDueDate.toISOString().split('T')[0] })
      .eq('id', paymentModalContract.id);

    if (updateError) {
      toast.error('حدث خطأ أثناء تحديث تاريخ الاستحقاق');
    } else {
      toast.success('تم تسجيل الدفعة بنجاح');

      // Open receipt modal
      setReceiptModalData({
        receiptNumber: `RNT-${paymentModalContract.id.substring(0, 6).toUpperCase()}`,
        receiptDate: today,
        receiptTypeLabel: 'إيصال سداد دفعة إيجار واستغلال منشأة',
        partyName: paymentModalContract.tenant_name,
        partyPhone: paymentModalContract.tenant_phone || undefined,
        amount: amount,
        paymentMethod: data.payment_method || 'cash',
        facilityOrProgramName: `إيجار مرفق: ${(paymentModalContract as any).facility?.name || 'مرفق'}`,
        periodOrDuration: `عن الفترة من ${data.period_from} إلى ${data.period_to}`,
        chequeNumber: data.cheque_number,
        bankName: data.bank_name,
        notes: `دفعة إيجار ${paymentModalContract.tenant_name}`,
      });

      setPaymentModalContract(null);
      resetPayment();
      fetchContracts();
      fetchAlerts();
    }
  };


  const loadHistory = async (contractId: string) => {
    if (viewHistoryContractId === contractId) {
      setViewHistoryContractId(null);
      return;
    }
    const { data, error } = await supabase
      .from('stadium_rental_payments')
      .select('*')
      .eq('contract_id', contractId)
      .order('payment_date', { ascending: false });
    
    if (!error && data) {
      setPaymentsHistory(data);
      setViewHistoryContractId(contractId);
    }
  };

  const terminateContract = async (contractId: string) => {
    if (!window.confirm('هل أنت متأكد من إنهاء هذا العقد؟')) return;
    const { error } = await supabase
      .from('stadium_rental_contracts')
      .update({ status: 'terminated' })
      .eq('id', contractId);
    
    if (error) toast.error('خطأ في إنهاء العقد');
    else {
      toast.success('تم إنهاء العقد');
      fetchContracts();
      fetchAlerts();
    }
  };

  return (
    <div className="p-6 bg-gray-50 min-h-screen" dir="rtl">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
          <FileText className="text-indigo-600" />
          إدارة عقود الإيجار
        </h1>
        <button
          onClick={() => setIsContractModalOpen(true)}
          className="bg-indigo-600 text-white px-4 py-2 rounded-md hover:bg-indigo-700 flex items-center gap-2"
        >
          <Plus size={18} />
          عقد جديد
        </button>
      </div>

      {alerts.length > 0 && (
        <div className="mb-6 bg-red-50 border border-red-200 rounded-lg p-4">
          <h3 className="text-red-800 font-bold flex items-center gap-2 mb-3">
            <AlertTriangle size={20} />
            تنبيه: عقود تستحق السداد قريباً أو متأخرة
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {alerts.map(alert => (
              <div key={alert.id} className="bg-white p-3 rounded shadow-sm border border-red-100 flex justify-between items-center">
                <div>
                  <p className="font-semibold text-gray-800">{alert.tenant_name}</p>
                  <p className="text-sm text-gray-500">المرفق: {(alert.stadium_facilities as any)?.name || 'غير معروف'}</p>
                  <p className="text-sm text-red-600 font-medium">الاستحقاق: {alert.next_due_date}</p>
                </div>
                <button 
                  onClick={() => setPaymentModalContract(alert)}
                  className="bg-red-100 text-red-700 p-2 rounded hover:bg-red-200"
                  title="تسجيل دفعة"
                >
                  <DollarSign size={18} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="bg-white rounded-lg shadow overflow-hidden">
        <table className="w-full text-right">
          <thead className="bg-gray-100">
            <tr>
              <th className="p-3">المستأجر</th>
              <th className="p-3">المرفق</th>
              <th className="p-3">بداية العقد</th>
              <th className="p-3">نهاية العقد</th>
              <th className="p-3">دورة السداد</th>
              <th className="p-3">المبلغ/دورة</th>
              <th className="p-3">الاستحقاق القادم</th>
              <th className="p-3">الحالة</th>
              <th className="p-3 text-center">إجراءات</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={9} className="p-4 text-center">جاري التحميل...</td></tr>
            ) : contracts.length === 0 ? (
              <tr><td colSpan={9} className="p-4 text-center">لا توجد عقود</td></tr>
            ) : (
              contracts.map(contract => (
                <React.Fragment key={contract.id}>
                  <tr className="border-t hover:bg-gray-50">
                    <td className="p-3">
                      <div>{contract.tenant_name}</div>
                      <div className="text-xs text-gray-500">{contract.tenant_phone}</div>
                    </td>
                    <td className="p-3">{(contract as any).facility?.name || '-'}</td>
                    <td className="p-3">{contract.start_date}</td>
                    <td className="p-3">{contract.end_date}</td>
                    <td className="p-3">{contract.billing_cycle === 'monthly' ? 'شهري' : 'أسبوعي'}</td>
                    <td className="p-3">{contract.amount_per_cycle}</td>
                    <td className="p-3 text-red-600 font-medium">{contract.next_due_date}</td>
                    <td className="p-3">
                      <span className={`px-2 py-1 rounded text-xs ${contract.status === 'active' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'}`}>
                        {contract.status === 'active' ? 'نشط' : 'منتهي'}
                      </span>
                    </td>
                    <td className="p-3 flex justify-center gap-2">
                      <button
                        onClick={() => setPrintContract(contract)}
                        className="text-gray-700 hover:text-gray-900 p-1"
                        title="طباعة عقد الاستغلال الرسمي (A4)"
                      >
                        <Printer size={18} />
                      </button>
                      {contract.status === 'active' && (
                        <>
                          <button onClick={() => setPaymentModalContract(contract)} className="text-indigo-600 hover:text-indigo-800 p-1" title="تسجيل دفعة">
                            <DollarSign size={18} />
                          </button>
                          <button onClick={() => terminateContract(contract.id)} className="text-red-600 hover:text-red-800 p-1" title="إنهاء العقد">
                            <X size={18} />
                          </button>
                        </>
                      )}
                      <button onClick={() => loadHistory(contract.id)} className="text-gray-600 hover:text-gray-800 p-1" title="سجل الدفعات">
                        <Calendar size={18} />
                      </button>
                    </td>

                  </tr>
                  {viewHistoryContractId === contract.id && (
                    <tr className="bg-gray-50 border-t">
                      <td colSpan={9} className="p-4">
                        <h4 className="font-bold mb-2">سجل الدفعات</h4>
                        {paymentsHistory.length === 0 ? (
                          <p className="text-sm text-gray-500">لا توجد دفعات مسجلة</p>
                        ) : (
                          <table className="w-full text-sm">
                            <thead>
                              <tr className="bg-gray-200">
                                <th className="p-2 text-right">التاريخ</th>
                                <th className="p-2 text-right">المبلغ</th>
                                <th className="p-2 text-right">طريقة الدفع</th>
                                <th className="p-2 text-right">الفترة</th>
                                <th className="p-2 text-center">الإيصال</th>
                              </tr>
                            </thead>
                            <tbody>
                              {paymentsHistory.map(ph => (
                                <tr key={ph.id} className="border-b">
                                  <td className="p-2">{new Date(ph.payment_date).toLocaleDateString()}</td>
                                  <td className="p-2 text-green-600 font-medium">{ph.amount_paid}</td>
                                  <td className="p-2">{ph.payment_method === 'cash' ? 'نقدي' : ph.payment_method === 'card' ? 'بطاقة' : ph.payment_method === 'cheque' ? 'شيك' : 'تحويل بنكي'}</td>
                                  <td className="p-2">{ph.period_from} - {ph.period_to}</td>
                                  <td className="p-2 text-center">
                                    <button
                                      onClick={() => {
                                        setReceiptModalData({
                                          receiptNumber: `RNT-${ph.id.substring(0, 6).toUpperCase()}`,
                                          receiptDate: ph.payment_date,
                                          receiptTypeLabel: 'إيصال سداد دفعة إيجار واستغلال منشأة',
                                          partyName: contract.tenant_name,
                                          partyPhone: contract.tenant_phone || undefined,
                                          amount: ph.amount_paid,
                                          paymentMethod: ph.payment_method,
                                          facilityOrProgramName: `إيجار مرفق: ${(contract as any).facility?.name || 'مرفق'}`,
                                          periodOrDuration: `عن الفترة من ${ph.period_from} إلى ${ph.period_to}`,
                                          notes: `دفعة إيجار ${contract.tenant_name}`,
                                        });
                                      }}
                                      className="p-1 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 rounded text-xs inline-flex items-center gap-1"
                                    >
                                      <Printer size={14} />
                                      إيصال
                                    </button>
                                  </td>
                                </tr>
                              ))}

                            </tbody>
                          </table>
                        )}
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))
            )}
          </tbody>
        </table>
        
        {totalCount > ITEMS_PER_PAGE && (
          <div className="flex items-center justify-between p-4 border-t bg-gray-50">
            <span className="text-sm text-gray-600">
              إجمالي: {totalCount} عقد
            </span>
            <div className="flex gap-2">
              <button
                disabled={currentPage === 1}
                onClick={() => setCurrentPage(prev => prev - 1)}
                className="p-1 rounded bg-white border hover:bg-gray-100 disabled:opacity-50"
              >
                <ChevronRight size={20} />
              </button>
              <button
                disabled={currentPage * ITEMS_PER_PAGE >= totalCount}
                onClick={() => setCurrentPage(prev => prev + 1)}
                className="p-1 rounded bg-white border hover:bg-gray-100 disabled:opacity-50"
              >
                <ChevronLeft size={20} />
              </button>
            </div>
          </div>
        )}
      </div>

      {isContractModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl overflow-hidden">
            <div className="p-4 border-b flex justify-between items-center bg-gray-50">
              <h2 className="text-lg font-bold">عقد إيجار جديد</h2>
              <button onClick={() => setIsContractModalOpen(false)} className="text-gray-500 hover:text-gray-700">
                <X size={20} />
              </button>
            </div>
            <div className="p-6">
              <form onSubmit={handleContractSubmit(onSubmitContract)} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-1">اسم المستأجر</label>
                    <input {...registerContract('tenant_name')} className="w-full border rounded p-2" />
                    {contractErrors.tenant_name && <p className="text-red-500 text-xs mt-1">{contractErrors.tenant_name.message}</p>}
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">رقم الهاتف</label>
                    <input {...registerContract('tenant_phone')} className="w-full border rounded p-2" />
                    {contractErrors.tenant_phone && <p className="text-red-500 text-xs mt-1">{contractErrors.tenant_phone.message}</p>}
                  </div>
                  <div className="col-span-2">
                    <label className="block text-sm font-medium mb-1">المرفق</label>
                    <select {...registerContract('facility_id')} className="w-full border rounded p-2">
                      <option value="">اختر المرفق...</option>
                      {facilities.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
                    </select>
                    {contractErrors.facility_id && <p className="text-red-500 text-xs mt-1">{contractErrors.facility_id.message}</p>}
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">بداية العقد</label>
                    <input type="date" {...registerContract('start_date')} className="w-full border rounded p-2" />
                    {contractErrors.start_date && <p className="text-red-500 text-xs mt-1">{contractErrors.start_date.message}</p>}
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">نهاية العقد</label>
                    <input type="date" {...registerContract('end_date')} className="w-full border rounded p-2" />
                    {contractErrors.end_date && <p className="text-red-500 text-xs mt-1">{contractErrors.end_date.message}</p>}
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">دورة السداد</label>
                    <select {...registerContract('billing_cycle')} className="w-full border rounded p-2">
                      <option value="monthly">شهري</option>
                      <option value="weekly">أسبوعي</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">المبلغ لكل دورة</label>
                    <input type="number" {...registerContract('amount_per_cycle', { valueAsNumber: true })} className="w-full border rounded p-2" />
                    {contractErrors.amount_per_cycle && <p className="text-red-500 text-xs mt-1">{contractErrors.amount_per_cycle.message}</p>}
                  </div>
                </div>
                <div className="flex justify-end gap-3 mt-6">
                  <button type="button" onClick={() => setIsContractModalOpen(false)} className="px-4 py-2 border rounded text-gray-600 hover:bg-gray-50">إلغاء</button>
                  <button type="submit" className="px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700">حفظ</button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {paymentModalContract && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md overflow-hidden">
            <div className="p-4 border-b flex justify-between items-center bg-gray-50">
              <h2 className="text-lg font-bold">تسجيل دفعة إيجار</h2>
              <button onClick={() => setPaymentModalContract(null)} className="text-gray-500 hover:text-gray-700">
                <X size={20} />
              </button>
            </div>
            <div className="p-6">
              <div className="mb-4 bg-blue-50 p-3 rounded text-sm text-blue-800">
                المستأجر: {paymentModalContract.tenant_name}<br/>
                المبلغ المستحق: {paymentModalContract.amount_per_cycle}
              </div>
              <form onSubmit={handlePaymentSubmit(onSubmitPayment)} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-1">المبلغ المدفوع</label>
                  <input type="number" {...registerPayment('amount_paid', { valueAsNumber: true })} className="w-full border rounded p-2" />
                  {paymentErrors.amount_paid && <p className="text-red-500 text-xs mt-1">{paymentErrors.amount_paid.message}</p>}
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">طريقة الدفع *</label>
                  <select {...registerPayment('payment_method')} className="w-full border rounded p-2">
                    <option value="cash">نقدي</option>
                    <option value="card">بطاقة مدى / POS</option>
                    <option value="bank_transfer">تحويل بنكي</option>
                    <option value="cheque">شيك مصرفي (أوراق قبض)</option>
                  </select>
                </div>

                {watchPayment('payment_method') !== 'cheque' ? (
                  <div>
                    <label className="block text-sm font-medium mb-1">حساب الخزينة أو البنك المستلم *</label>
                    <select {...registerPayment('treasury_account_id')} className="w-full border rounded p-2">
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
                        placeholder="مثال: 0005432"
                        {...registerPayment('cheque_number')}
                        className="w-full p-2 border rounded text-sm bg-white dark:bg-gray-800"
                      />
                    </div>
                    <div>
                      <label className="block mb-1 text-xs font-medium">البنك المسحوب عليه *</label>
                      <input
                        type="text"
                        placeholder="مثال: البنك الأهلي / الراجحي..."
                        {...registerPayment('bank_name')}
                        className="w-full p-2 border rounded text-sm bg-white dark:bg-gray-800"
                      />
                    </div>
                    <div>
                      <label className="block mb-1 text-xs font-medium">تاريخ استحقاق الشيك</label>
                      <input
                        type="date"
                        {...registerPayment('due_date')}
                        className="w-full p-2 border rounded text-sm bg-white dark:bg-gray-800"
                      />
                    </div>
                    <p className="text-xs text-amber-700 dark:text-amber-400">
                      💡 سيتولد قيد لأوراق القبض (1222) ويُتاح تحصيله في البنك لاحقاً.
                    </p>
                  </div>
                )}


                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-1">عن الفترة من</label>
                    <input type="date" {...registerPayment('period_from')} className="w-full border rounded p-2" />
                    {paymentErrors.period_from && <p className="text-red-500 text-xs mt-1">{paymentErrors.period_from.message}</p>}
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">عن الفترة إلى</label>
                    <input type="date" {...registerPayment('period_to')} className="w-full border rounded p-2" />
                    {paymentErrors.period_to && <p className="text-red-500 text-xs mt-1">{paymentErrors.period_to.message}</p>}
                  </div>
                </div>
                <div className="flex justify-end gap-3 mt-6">
                  <button type="button" onClick={() => setPaymentModalContract(null)} className="px-4 py-2 border rounded text-gray-600 hover:bg-gray-50">إلغاء</button>
                  <button type="submit" className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700">تسجيل الدفعة</button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Official Rental Contract Print Modal */}
      <RentalContractPrintModal
        isOpen={Boolean(printContract)}
        onClose={() => setPrintContract(null)}
        contract={printContract}
        facilityName={(printContract as any)?.facility?.name}
      />

      {/* Receipt Printable Modal */}
      <ReceiptModal
        isOpen={Boolean(receiptModalData)}
        onClose={() => setReceiptModalData(null)}
        data={receiptModalData}
      />
    </div>
  );
};

export default RentalManager;


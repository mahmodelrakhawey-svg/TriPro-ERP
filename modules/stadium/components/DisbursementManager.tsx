import React, { useState, useEffect } from 'react';
import { useAccounting } from '@/context/AccountingContext';
import { supabase } from '@/supabaseClient';

import {
  StadiumDisbursementRequest,
  StadiumFacility,
  StadiumDisbursementCategory,
  StadiumDisbursementStatus,
  DISBURSEMENT_CATEGORY_LABELS,
  DISBURSEMENT_STATUS_LABELS,
  DISBURSEMENT_STATUS_COLORS,
} from '../stadium.types';
import {
  getExpenseAccounts,
  getTreasuryAccounts,
  processDisbursementPayment,
  TreasuryAccountOption,
} from '../stadiumHelpers';
import {
  FileText,
  Plus,
  CheckCircle,
  Clock,
  DollarSign,
  Filter,
  Search,
  Building2,
  CreditCard,
  XCircle,
  Trash2,
  Eye,
  AlertTriangle,
} from 'lucide-react';
import toast from 'react-hot-toast';

const ITEMS_PER_PAGE = 25;

export const DisbursementManager: React.FC = () => {
  const { currentUser } = useAccounting();
  const orgId = (currentUser as any)?.organization_id;

  const [disbursements, setDisbursements] = useState<StadiumDisbursementRequest[]>([]);
  const [facilities, setFacilities] = useState<{ id: string; name: string }[]>([]);
  const [expenseAccounts, setExpenseAccounts] = useState<TreasuryAccountOption[]>([]);

  const [treasuryAccounts, setTreasuryAccounts] = useState<TreasuryAccountOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [totalCount, setTotalCount] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);

  // Filters
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Modals
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isPayModalOpen, setIsPayModalOpen] = useState(false);
  const [isRejectModalOpen, setIsRejectModalOpen] = useState(false);
  const [selectedDisbursement, setSelectedDisbursement] = useState<StadiumDisbursementRequest | null>(null);

  // New Request Form State
  const [formData, setFormData] = useState({
    title: '',
    purpose: '',
    category: 'maintenance' as StadiumDisbursementCategory,
    facility_id: '',
    amount: '',
    payment_type: 'cheque' as 'cheque' | 'custody' | 'bank_transfer' | 'cash',
    beneficiary_name: '',
    beneficiary_details: '',
    expense_account_code: '5101',
    notes: '',
  });

  // Payment Form State
  const [paymentData, setPaymentData] = useState({
    treasury_account_id: '',
    cheque_number: '',
    bank_name: '',
    due_date: new Date().toISOString().split('T')[0],
    notes: '',
  });
  const [isProcessingPay, setIsProcessingPay] = useState(false);

  // Rejection State
  const [rejectionReason, setRejectionReason] = useState('');

  useEffect(() => {
    if (orgId) {
      fetchFacilities();
      fetchExpenseAccounts();
      fetchTreasuryAccounts();
      fetchDisbursements();
    }
  }, [orgId, currentPage, statusFilter, categoryFilter]);

  const fetchFacilities = async () => {
    try {
      const { data } = await supabase
        .from('stadium_facilities')
        .select('id, name')
        .eq('organization_id', orgId)
        .eq('is_active', true);
      setFacilities(data || []);
    } catch (err) {
      console.error('Error fetching facilities:', err);
    }
  };

  const fetchExpenseAccounts = async () => {
    if (orgId) {
      const accs = await getExpenseAccounts(orgId);
      setExpenseAccounts(accs);
    }
  };

  const fetchTreasuryAccounts = async () => {
    if (orgId) {
      const accs = await getTreasuryAccounts(orgId);
      setTreasuryAccounts(accs);
      if (accs.length > 0) {
        setPaymentData(prev => ({ ...prev, treasury_account_id: accs[0].id }));
      }
    }
  };

  const fetchDisbursements = async () => {
    if (!orgId) return;
    setLoading(true);
    try {
      let query = supabase
        .from('stadium_disbursements')
        .select('*, stadium_facilities(name), cheques(cheque_number, bank_name, status)', { count: 'exact' })
        .eq('organization_id', orgId)
        .order('created_at', { ascending: false });

      if (statusFilter !== 'all') {
        query = query.eq('status', statusFilter);
      }
      if (categoryFilter !== 'all') {
        query = query.eq('category', categoryFilter);
      }

      const from = (currentPage - 1) * ITEMS_PER_PAGE;
      const to = from + ITEMS_PER_PAGE - 1;
      const { data, count, error } = await query.range(from, to);

      if (error) {
        // Table might not exist yet if migration wasn't run in Supabase directly
        console.warn('Disbursements query info:', error.message);
      } else {
        setDisbursements(data || []);
        setTotalCount(count || 0);
      }
    } catch (err: any) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!orgId) return;

    if (!formData.title || !formData.amount || !formData.beneficiary_name) {
      toast.error('يرجى ملء جميع الحقول الإلزامية');
      return;
    }

    try {
      const reqNum = `REQ-STD-${Date.now().toString().slice(-5)}`;
      const payload = {
        organization_id: orgId,
        request_number: reqNum,
        title: formData.title.trim(),
        purpose: formData.purpose.trim() || formData.title.trim(),
        category: formData.category,
        facility_id: formData.facility_id || null,
        amount: parseFloat(formData.amount),
        payment_type: formData.payment_type,
        beneficiary_name: formData.beneficiary_name.trim(),
        beneficiary_details: formData.beneficiary_details.trim() || null,
        expense_account_code: formData.expense_account_code,
        status: 'draft',
        notes: formData.notes.trim() || null,
      };

      const { error } = await supabase.from('stadium_disbursements').insert([payload]);
      if (error) throw error;

      toast.success(`تم حفظ طلب الصرف رقم ${reqNum} كمسودة بنجاح`);
      setIsAddModalOpen(false);
      setFormData({
        title: '',
        purpose: '',
        category: 'maintenance',
        facility_id: '',
        amount: '',
        payment_type: 'cheque',
        beneficiary_name: '',
        beneficiary_details: '',
        expense_account_code: '5101',
        notes: '',
      });
      fetchDisbursements();
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || 'حدث خطأ أثناء حفظ طلب الصرف');
    }
  };

  const handleAdminApproval = async (disbursement: StadiumDisbursementRequest) => {
    if (!window.confirm(`هل أنت متأكد من اعتماد طلب الصرف (${disbursement.request_number}) إدارياً؟`)) return;
    try {
      const { error } = await supabase
        .from('stadium_disbursements')
        .update({ status: 'pending_finance' })
        .eq('id', disbursement.id);
      if (error) throw error;
      toast.success('تم الاعتماد الإداري وإحالة الطلب للإدارة المالية');
      fetchDisbursements();
    } catch (err: any) {
      toast.error(err.message || 'فشل اعتماد الطلب');
    }
  };

  const openPayModal = (disbursement: StadiumDisbursementRequest) => {
    setSelectedDisbursement(disbursement);
    setPaymentData({
      treasury_account_id: treasuryAccounts.length > 0 ? treasuryAccounts[0].id : '',
      cheque_number: '',
      bank_name: '',
      due_date: new Date().toISOString().split('T')[0],
      notes: '',
    });
    setIsPayModalOpen(true);
  };

  const handleConfirmPay = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!orgId || !selectedDisbursement) return;

    if (selectedDisbursement.payment_type === 'cheque') {
      if (!paymentData.cheque_number.trim()) {
        toast.error('يرجى إدخال رقم الشيك الصادر');
        return;
      }
      if (!paymentData.bank_name.trim()) {
        toast.error('يرجى إدخال اسم البنك المسحوب عليه');
        return;
      }
    }

    setIsProcessingPay(true);
    try {
      const result = await processDisbursementPayment(
        orgId,
        {
          id: selectedDisbursement.id,
          request_number: selectedDisbursement.request_number,
          title: selectedDisbursement.title,
          amount: selectedDisbursement.amount,
          beneficiary_name: selectedDisbursement.beneficiary_name,
          expense_account_code: selectedDisbursement.expense_account_code,
          payment_type: selectedDisbursement.payment_type,
        },
        paymentData
      );

      if (!result.success) {
        toast.error(result.error || 'فشلت معالجة الصرف');
        return;
      }

      toast.success(
        selectedDisbursement.payment_type === 'cheque'
          ? 'تم اعتماد الصرف وتوليد الشيك الصادر والقيد المحاسبي بنجاح 📜'
          : 'تم ترحيل قيد الصرف واعتماد السداد بنجاح'
      );
      setIsPayModalOpen(false);
      setSelectedDisbursement(null);
      fetchDisbursements();
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || 'حدث خطأ أثناء الصرف');
    } finally {
      setIsProcessingPay(false);
    }
  };

  const openRejectModal = (disbursement: StadiumDisbursementRequest) => {
    setSelectedDisbursement(disbursement);
    setRejectionReason('');
    setIsRejectModalOpen(true);
  };

  const handleConfirmReject = async () => {
    if (!selectedDisbursement) return;
    if (!rejectionReason.trim()) {
      toast.error('يرجى كتابة سبب الرفض');
      return;
    }
    try {
      const { error } = await supabase
        .from('stadium_disbursements')
        .update({
          status: 'rejected',
          rejection_reason: rejectionReason.trim(),
        })
        .eq('id', selectedDisbursement.id);
      if (error) throw error;
      toast.success('تم رفض طلب الصرف');
      setIsRejectModalOpen(false);
      setSelectedDisbursement(null);
      fetchDisbursements();
    } catch (err: any) {
      toast.error(err.message || 'فشل رفض الطلب');
    }
  };

  const handleDeleteDraft = async (id: string) => {
    if (!window.confirm('هل أنت متأكد من حذف مسودة طلب الصرف؟')) return;
    try {
      const { error } = await supabase.from('stadium_disbursements').delete().eq('id', id);
      if (error) throw error;
      toast.success('تم حذف المسودة بنجاح');
      fetchDisbursements();
    } catch (err: any) {
      toast.error(err.message || 'فشل حذف الطلب');
    }
  };

  const filteredDisbursements = disbursements.filter(d => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      d.request_number.toLowerCase().includes(q) ||
      d.title.toLowerCase().includes(q) ||
      d.beneficiary_name.toLowerCase().includes(q) ||
      d.purpose.toLowerCase().includes(q)
    );
  });

  // Calculate summary stats
  const totalDraft = disbursements.filter(d => d.status === 'draft').length;
  const totalPending = disbursements.filter(d => d.status === 'pending_admin' || d.status === 'pending_finance').length;
  const totalPaidAmount = disbursements
    .filter(d => d.status === 'paid')
    .reduce((acc, d) => acc + Number(d.amount), 0);

  return (
    <div className="p-6 bg-gray-50 dark:bg-gray-900 min-h-screen text-right" dir="rtl">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-800 dark:text-gray-100 flex items-center gap-2">
            <FileText className="text-amber-600 dark:text-amber-400 w-7 h-7" />
            طلبات واعتمادات الصرف المالي للاستاد
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            وفقاً للائحة المالية لوزارة الشباب والرياضة — دورة الاعتماد وإصدار الشيكات المسحوبة على البنوك والعهد
          </p>
        </div>
        <button
          onClick={() => setIsAddModalOpen(true)}
          className="bg-amber-600 hover:bg-amber-700 text-white px-4 py-2.5 rounded-lg flex items-center gap-2 shadow font-medium transition"
        >
          <Plus size={20} />
          طلب صرف جديد
        </button>
      </div>

      {/* KPI Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <div className="bg-white dark:bg-gray-800 p-4 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 flex items-center justify-between">
          <div>
            <p className="text-xs text-gray-500 dark:text-gray-400 font-medium">طلبات بانتظار الاعتماد</p>
            <p className="text-2xl font-bold text-amber-600 dark:text-amber-400 mt-1">{totalPending}</p>
          </div>
          <div className="p-3 bg-amber-50 dark:bg-amber-950/40 text-amber-600 rounded-lg">
            <Clock size={24} />
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 p-4 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 flex items-center justify-between">
          <div>
            <p className="text-xs text-gray-500 dark:text-gray-400 font-medium">إجمالي المصروفات المنفذة</p>
            <p className="text-2xl font-bold text-green-600 dark:text-green-400 mt-1">
              {totalPaidAmount.toLocaleString('ar-EG')} ج.م
            </p>

          </div>
          <div className="p-3 bg-green-50 dark:bg-green-950/40 text-green-600 rounded-lg">
            <DollarSign size={24} />
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 p-4 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 flex items-center justify-between">
          <div>
            <p className="text-xs text-gray-500 dark:text-gray-400 font-medium">مسودات قيد التجهيز</p>
            <p className="text-2xl font-bold text-gray-700 dark:text-gray-300 mt-1">{totalDraft}</p>
          </div>
          <div className="p-3 bg-gray-100 dark:bg-gray-700 text-gray-600 rounded-lg">
            <FileText size={24} />
          </div>
        </div>
      </div>

      {/* Filters & Search */}
      <div className="bg-white dark:bg-gray-800 p-4 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 mb-6 flex flex-wrap gap-4 items-center justify-between">
        <div className="flex flex-wrap gap-3 items-center flex-1">
          <div className="relative min-w-[240px]">
            <Search className="absolute right-3 top-2.5 text-gray-400" size={18} />
            <input
              type="text"
              placeholder="بحث برقم الطلب، العنوان، أو المستفيد..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-3 pr-9 py-2 border rounded-lg text-sm bg-gray-50 dark:bg-gray-900 border-gray-200 dark:border-gray-700"
            />
          </div>

          <div className="flex items-center gap-2">
            <Filter size={16} className="text-gray-400" />
            <select
              value={statusFilter}
              onChange={(e) => { setStatusFilter(e.target.value); setCurrentPage(1); }}
              className="border rounded-lg p-2 text-sm bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700"
            >
              <option value="all">جميع الحالات</option>
              <option value="draft">مسودة</option>
              <option value="pending_admin">بانتظار الاعتماد الإداري</option>
              <option value="pending_finance">بانتظار الاعتماد المالي</option>
              <option value="paid">تم الصرف والشيك</option>
              <option value="rejected">مرفوض</option>
            </select>
          </div>

          <div>
            <select
              value={categoryFilter}
              onChange={(e) => { setCategoryFilter(e.target.value); setCurrentPage(1); }}
              className="border rounded-lg p-2 text-sm bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700"
            >
              <option value="all">جميع البنود والتصنيفات</option>
              {Object.entries(DISBURSEMENT_CATEGORY_LABELS).map(([cat, label]) => (
                <option key={cat} value={cat}>{label}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-right">
            <thead className="bg-gray-50 dark:bg-gray-900/50 text-gray-500 dark:text-gray-400 border-b dark:border-gray-700 font-medium">
              <tr>
                <th className="p-3.5">رقم الطلب</th>
                <th className="p-3.5">العنوان والبند</th>
                <th className="p-3.5">المرفق / النشاط</th>
                <th className="p-3.5">المبلغ</th>
                <th className="p-3.5">طريقة الصرف</th>
                <th className="p-3.5">المستفيد</th>
                <th className="p-3.5">الحالة</th>
                <th className="p-3.5 text-center">الإجراءات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
              {loading ? (
                <tr>
                  <td colSpan={8} className="p-8 text-center text-gray-500">جاري تحميل طلبات الصرف...</td>
                </tr>
              ) : filteredDisbursements.length === 0 ? (
                <tr>
                  <td colSpan={8} className="p-8 text-center text-gray-500">
                    لا توجد طلبات صرف مطابقة للمحددات
                  </td>
                </tr>
              ) : (
                filteredDisbursements.map((d) => (
                  <tr key={d.id} className="hover:bg-gray-50/80 dark:hover:bg-gray-750 transition">
                    <td className="p-3.5 font-bold text-gray-900 dark:text-gray-100 font-mono text-xs">
                      {d.request_number}
                    </td>
                    <td className="p-3.5">
                      <div className="font-semibold text-gray-800 dark:text-gray-200">{d.title}</div>
                      <div className="text-xs text-amber-700 dark:text-amber-400">
                        {DISBURSEMENT_CATEGORY_LABELS[d.category]}
                      </div>
                    </td>
                    <td className="p-3.5 text-gray-600 dark:text-gray-400">
                      {d.stadium_facilities?.name ? (
                        <span className="flex items-center gap-1">
                          <Building2 size={14} className="text-gray-400" />
                          {d.stadium_facilities.name}
                        </span>
                      ) : (
                        <span className="text-gray-400 text-xs">عام للاستاد</span>
                      )}
                    </td>
                    <td className="p-3.5 font-bold text-gray-900 dark:text-gray-100">
                      {Number(d.amount).toLocaleString('ar-EG')} ج.م
                    </td>

                    <td className="p-3.5">
                      {d.payment_type === 'cheque' && (
                        <span className="inline-flex items-center gap-1 text-xs bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300 px-2 py-0.5 rounded border border-amber-200">
                          📜 شيك بنكي صادر
                        </span>
                      )}
                      {d.payment_type === 'custody' && (
                        <span className="inline-flex items-center gap-1 text-xs bg-purple-50 text-purple-800 dark:bg-purple-950/40 dark:text-purple-300 px-2 py-0.5 rounded">
                          💼 خصم من عهدة
                        </span>
                      )}
                      {d.payment_type === 'bank_transfer' && (
                        <span className="text-xs bg-blue-50 text-blue-800 px-2 py-0.5 rounded">تحويل بنكي</span>
                      )}
                      {d.payment_type === 'cash' && (
                        <span className="text-xs bg-gray-100 text-gray-800 px-2 py-0.5 rounded">نقدي</span>
                      )}
                    </td>
                    <td className="p-3.5 text-gray-700 dark:text-gray-300">
                      {d.beneficiary_name}
                    </td>
                    <td className="p-3.5">
                      <span className={`inline-block px-2.5 py-1 rounded-full text-xs font-medium ${DISBURSEMENT_STATUS_COLORS[d.status]}`}>
                        {DISBURSEMENT_STATUS_LABELS[d.status]}
                      </span>
                      {d.status === 'rejected' && d.rejection_reason && (
                        <p className="text-[11px] text-red-500 mt-0.5 truncate max-w-[120px]" title={d.rejection_reason}>
                          السبب: {d.rejection_reason}
                        </p>
                      )}
                    </td>
                    <td className="p-3.5 text-center">
                      <div className="flex items-center justify-center gap-1">
                        {d.status === 'draft' && (
                          <>
                            <button
                              onClick={() => handleAdminApproval(d)}
                              className="px-2 py-1 text-xs bg-amber-100 text-amber-800 hover:bg-amber-200 rounded font-medium"
                              title="إرسال للاعتماد الإداري"
                            >
                              إرسال للاعتماد
                            </button>
                            <button
                              onClick={() => handleDeleteDraft(d.id)}
                              className="p-1 text-red-500 hover:bg-red-50 rounded"
                              title="حذف المسودة"
                            >
                              <Trash2 size={16} />
                            </button>
                          </>
                        )}

                        {d.status === 'pending_admin' && (
                          <button
                            onClick={() => handleAdminApproval(d)}
                            className="px-2.5 py-1 text-xs bg-blue-600 text-white hover:bg-blue-700 rounded font-medium"
                          >
                            اعتماد إداري ✓
                          </button>
                        )}

                        {d.status === 'pending_finance' && (
                          <button
                            onClick={() => openPayModal(d)}
                            className="px-2.5 py-1 text-xs bg-green-600 text-white hover:bg-green-700 rounded font-medium flex items-center gap-1"
                          >
                            <CreditCard size={13} />
                            صرف بشيك / قيد
                          </button>
                        )}

                        {d.status === 'paid' && (
                          <span className="text-xs text-green-600 font-semibold flex items-center gap-0.5">
                            <CheckCircle size={14} /> منصرف
                          </span>
                        )}

                        {(d.status === 'pending_admin' || d.status === 'pending_finance') && (
                          <button
                            onClick={() => openRejectModal(d)}
                            className="p-1 text-red-500 hover:bg-red-50 rounded"
                            title="رفض الطلب"
                          >
                            <XCircle size={16} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalCount > ITEMS_PER_PAGE && (
          <div className="p-4 border-t dark:border-gray-700 flex justify-between items-center text-sm text-gray-500">
            <span>إجمالي الطلبات: {totalCount}</span>
            <div className="flex gap-1">
              <button
                disabled={currentPage === 1}
                onClick={() => setCurrentPage(p => p - 1)}
                className="px-3 py-1 border rounded disabled:opacity-50"
              >
                السابق
              </button>
              <span className="px-3 py-1 bg-amber-50 text-amber-700 rounded font-bold">{currentPage}</span>
              <button
                disabled={currentPage * ITEMS_PER_PAGE >= totalCount}
                onClick={() => setCurrentPage(p => p + 1)}
                className="px-3 py-1 border rounded disabled:opacity-50"
              >
                التالي
              </button>
            </div>
          </div>
        )}
      </div>

      {/* New Request Modal */}
      {isAddModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-900 rounded-xl shadow-xl max-w-xl w-full p-6 max-h-[90vh] overflow-y-auto">
            <h3 className="text-xl font-bold mb-4 text-gray-900 dark:text-white flex items-center gap-2">
              <FileText className="text-amber-600" /> تسجيل طلب صرف مصروف / مستلزمات للاستاد
            </h3>

            <form onSubmit={handleCreateRequest} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="sm:col-span-2">
                  <label className="block text-sm font-medium mb-1">عنوان الطلب / الموضوع *</label>
                  <input
                    type="text"
                    required
                    placeholder="مثال: شراء كرات وشباك لملعب كرة القدم الرئيسي"
                    value={formData.title}
                    onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                    className="w-full p-2.5 border rounded-lg text-sm bg-white dark:bg-gray-800"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">بند المصروف / التصنيف *</label>
                  <select
                    value={formData.category}
                    onChange={(e) => setFormData({ ...formData, category: e.target.value as StadiumDisbursementCategory })}
                    className="w-full p-2.5 border rounded-lg text-sm bg-white dark:bg-gray-800"
                  >
                    {Object.entries(DISBURSEMENT_CATEGORY_LABELS).map(([cat, label]) => (
                      <option key={cat} value={cat}>{label}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">المرفق المعني (اختياري)</label>
                  <select
                    value={formData.facility_id}
                    onChange={(e) => setFormData({ ...formData, facility_id: e.target.value })}
                    className="w-full p-2.5 border rounded-lg text-sm bg-white dark:bg-gray-800"
                  >
                    <option value="">عام لكامل الاستاد والمركز</option>
                    {facilities.map(f => (
                      <option key={f.id} value={f.id}>{f.name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">المبلغ المطلوب (ج.م) *</label>
                  <input
                    type="number"
                    step="0.01"
                    min="1"
                    required
                    placeholder="0.00"
                    value={formData.amount}
                    onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                    className="w-full p-2.5 border rounded-lg text-sm bg-white dark:bg-gray-800"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">طريقة الصرف المقترحة *</label>
                  <select
                    value={formData.payment_type}
                    onChange={(e) => setFormData({ ...formData, payment_type: e.target.value as any })}
                    className="w-full p-2.5 border rounded-lg text-sm bg-white dark:bg-gray-800"
                  >
                    <option value="cheque">شيك بنكي صادر (وفق اللائحة)</option>
                    <option value="custody">خصم من عهدة نشاط / بطولة</option>
                    <option value="bank_transfer">تحويل بنكي مباشر</option>
                    <option value="cash">نقدي (عهدة نثرية)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">اسم المستفيد / المورد / مسؤول الصرف *</label>
                  <input
                    type="text"
                    required
                    placeholder="مثال: شركة الأهرام للمهمات الرياضية"
                    value={formData.beneficiary_name}
                    onChange={(e) => setFormData({ ...formData, beneficiary_name: e.target.value })}
                    className="w-full p-2.5 border rounded-lg text-sm bg-white dark:bg-gray-800"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">الحساب المحاسبي للمصروف</label>
                  <select
                    value={formData.expense_account_code}
                    onChange={(e) => setFormData({ ...formData, expense_account_code: e.target.value })}
                    className="w-full p-2.5 border rounded-lg text-sm bg-white dark:bg-gray-800"
                  >
                    {expenseAccounts.length > 0 ? (
                      expenseAccounts.map(acc => (
                        <option key={acc.id} value={acc.code}>
                          {acc.name} ({acc.code})
                        </option>
                      ))
                    ) : (
                      <>
                        <option value="5101">مصروفات صيانة الملاعب والمرافق (5101)</option>
                        <option value="5102">مهمات وأدوات ومستلزمات رياضية (5102)</option>
                        <option value="5103">مصروفات البطولات والمعسكرات (5103)</option>
                        <option value="5104">فواتير تشغيل وخدمات الاستاد (5104)</option>
                        <option value="5201">تكاليف ومستحقات الكوادر والمدربين (5201)</option>
                      </>
                    )}
                  </select>
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-sm font-medium mb-1">الغرض وأسباب الصرف والملاحظات</label>
                  <textarea
                    rows={2}
                    placeholder="تفاصيل الاحتياج ومبررات الصرف وأي فواتير أو عروض أسعار مرفقة..."
                    value={formData.purpose}
                    onChange={(e) => setFormData({ ...formData, purpose: e.target.value })}
                    className="w-full p-2.5 border rounded-lg text-sm bg-white dark:bg-gray-800"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-4 border-t dark:border-gray-700">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="px-4 py-2 border rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-sm"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-sm font-medium"
                >
                  حفظ الطلب
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Pay / Issue Cheque Modal */}
      {isPayModalOpen && selectedDisbursement && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-900 rounded-xl shadow-xl max-w-md w-full p-6">
            <h3 className="text-xl font-bold mb-3 text-green-700 dark:text-green-400 flex items-center gap-2">
              <CreditCard size={22} /> اعتماد الصرف المالي وإصدار الشيك
            </h3>

            <div className="bg-gray-50 dark:bg-gray-800 p-3 rounded-lg text-sm space-y-1 mb-4">
              <div><span className="text-gray-500">رقم الطلب:</span> <strong>{selectedDisbursement.request_number}</strong></div>
              <div><span className="text-gray-500">الموضوع:</span> <strong>{selectedDisbursement.title}</strong></div>
              <div><span className="text-gray-500">المستفيد:</span> <strong>{selectedDisbursement.beneficiary_name}</strong></div>
              <div><span className="text-gray-500">المبلغ المطلوب:</span> <strong className="text-green-600 text-base">{Number(selectedDisbursement.amount).toLocaleString('ar-EG')} ج.م</strong></div>

            </div>

            <form onSubmit={handleConfirmPay} className="space-y-3">
              {selectedDisbursement.payment_type === 'cheque' ? (
                <div className="space-y-3 bg-amber-50 dark:bg-amber-950/30 p-3 rounded-lg border border-amber-200 dark:border-amber-800">
                  <div className="text-xs font-semibold text-amber-800 dark:text-amber-300">
                    📜 تحرير شيك صادر مسحوب على البنك (أوراق دفع 2121)
                  </div>
                  <div>
                    <label className="block text-xs font-medium mb-1">رقم الشيك الصادر *</label>
                    <input
                      type="text"
                      required
                      placeholder="مثال: 0009412"
                      value={paymentData.cheque_number}
                      onChange={(e) => setPaymentData({ ...paymentData, cheque_number: e.target.value })}
                      className="w-full p-2 border rounded text-sm bg-white dark:bg-gray-800"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium mb-1">البنك المسحوب عليه *</label>
                    <input
                      type="text"
                      required
                      placeholder="مثال: البنك الأهلي المصري / بنك مصر..."
                      value={paymentData.bank_name}
                      onChange={(e) => setPaymentData({ ...paymentData, bank_name: e.target.value })}
                      className="w-full p-2 border rounded text-sm bg-white dark:bg-gray-800"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium mb-1">تاريخ استحقاق الشيك *</label>
                    <input
                      type="date"
                      required
                      value={paymentData.due_date}
                      onChange={(e) => setPaymentData({ ...paymentData, due_date: e.target.value })}
                      className="w-full p-2 border rounded text-sm bg-white dark:bg-gray-800"
                    />
                  </div>
                </div>
              ) : (
                <div>
                  <label className="block text-sm font-medium mb-1">حساب الخزينة أو البنك المسحوب منه *</label>
                  <select
                    value={paymentData.treasury_account_id}
                    onChange={(e) => setPaymentData({ ...paymentData, treasury_account_id: e.target.value })}
                    className="w-full p-2.5 border rounded-lg text-sm bg-white dark:bg-gray-800"
                  >
                    {treasuryAccounts.map(acc => (
                      <option key={acc.id} value={acc.id}>{acc.name} ({acc.code})</option>
                    ))}
                  </select>
                </div>
              )}

              <div className="flex justify-end gap-2 pt-3 border-t dark:border-gray-700">
                <button
                  type="button"
                  disabled={isProcessingPay}
                  onClick={() => setIsPayModalOpen(false)}
                  className="px-4 py-2 border rounded-lg text-sm"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={isProcessingPay}
                  className="px-5 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm font-medium flex items-center gap-1"
                >
                  {isProcessingPay ? 'جاري الترحيل...' : 'تأكيد الصرف وتوليد الشيك'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Reject Modal */}
      {isRejectModalOpen && selectedDisbursement && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-900 rounded-xl shadow-xl max-w-sm w-full p-5">
            <h3 className="text-lg font-bold mb-3 text-red-600 flex items-center gap-1">
              <AlertTriangle size={20} /> رفض طلب الصرف
            </h3>
            <p className="text-xs text-gray-500 mb-3">
              يرجى توضيح سبب رفض الطلب رقم {selectedDisbursement.request_number}:
            </p>
            <textarea
              rows={3}
              required
              placeholder="سبب الرفض..."
              value={rejectionReason}
              onChange={(e) => setRejectionReason(e.target.value)}
              className="w-full p-2 border rounded text-sm mb-4 bg-white dark:bg-gray-800"
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setIsRejectModalOpen(false)}
                className="px-3 py-1.5 border rounded text-sm"
              >
                إلغاء
              </button>
              <button
                type="button"
                onClick={handleConfirmReject}
                className="px-4 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded text-sm font-medium"
              >
                تأكيد الرفض
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default DisbursementManager;

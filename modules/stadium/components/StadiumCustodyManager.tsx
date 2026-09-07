import React, { useState, useEffect } from 'react';
import { useAccounting } from '@/context/AccountingContext';
import { supabase } from '@/supabaseClient';

import {
  StadiumCustody,
  StadiumCustodyType,
  CUSTODY_TYPE_LABELS,
  CUSTODY_STATUS_LABELS,
  CUSTODY_STATUS_COLORS,
} from '../stadium.types';
import {
  getExpenseAccounts,
  getTreasuryAccounts,
  createCustodyIssuanceJournalEntry,
  createCustodySettlementJournalEntry,
  TreasuryAccountOption,
} from '../stadiumHelpers';
import {
  Wallet,
  Plus,
  CheckCircle,
  Clock,
  DollarSign,
  Search,
  CheckSquare,
  AlertTriangle,
  Receipt,
  User,
  Phone,
} from 'lucide-react';
import toast from 'react-hot-toast';

const ITEMS_PER_PAGE = 25;

export const StadiumCustodyManager: React.FC = () => {
  const { currentUser } = useAccounting();
  const orgId = (currentUser as any)?.organization_id;

  const [custodies, setCustodies] = useState<StadiumCustody[]>([]);
  const [expenseAccounts, setExpenseAccounts] = useState<TreasuryAccountOption[]>([]);
  const [treasuryAccounts, setTreasuryAccounts] = useState<TreasuryAccountOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [totalCount, setTotalCount] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);

  // Filters & Search
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Modals
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isSettleModalOpen, setIsSettleModalOpen] = useState(false);
  const [selectedCustody, setSelectedCustody] = useState<StadiumCustody | null>(null);

  // Form: New Custody
  const [formData, setFormData] = useState({
    custodian_name: '',
    custodian_phone: '',
    purpose: '',
    total_amount: '',
    custody_type: 'temporary' as StadiumCustodyType,
    disbursement_method: 'cheque' as 'cheque' | 'cash' | 'bank_transfer',
    cheque_number: '',
    bank_name: '',
    treasury_account_id: '',
    notes: '',
  });

  // Form: Settlement
  const [settleData, setSettleData] = useState({
    spent_amount: '',
    remaining_amount: '0',
    expense_account_code: '5103',
    return_treasury_id: '',
    notes: '',
  });
  const [isProcessingSettle, setIsProcessingSettle] = useState(false);

  useEffect(() => {
    if (orgId) {
      fetchExpenseAccounts();
      fetchTreasuryAccounts();
      fetchCustodies();
    }
  }, [orgId, currentPage, statusFilter]);

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
        setFormData(prev => ({ ...prev, treasury_account_id: accs[0].id }));
        setSettleData(prev => ({ ...prev, return_treasury_id: accs[0].id }));
      }
    }
  };

  const fetchCustodies = async () => {
    if (!orgId) return;
    setLoading(true);
    try {
      let query = supabase
        .from('stadium_custodies')
        .select('*', { count: 'exact' })
        .eq('organization_id', orgId)
        .order('created_at', { ascending: false });

      if (statusFilter !== 'all') {
        query = query.eq('status', statusFilter);
      }

      const from = (currentPage - 1) * ITEMS_PER_PAGE;
      const to = from + ITEMS_PER_PAGE - 1;
      const { data, count, error } = await query.range(from, to);

      if (!error) {
        setCustodies(data || []);
        setTotalCount(count || 0);
      }
    } catch (err: any) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateCustody = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!orgId) return;

    if (!formData.custodian_name || !formData.purpose || !formData.total_amount) {
      toast.error('يرجى ملء جميع الحقول الإلزامية');
      return;
    }

    const totalAmt = parseFloat(formData.total_amount);
    if (totalAmt <= 0) {
      toast.error('مبلغ العهدة يجب أن يكون أكبر من صفر');
      return;
    }

    if (formData.disbursement_method === 'cheque') {
      if (!formData.cheque_number.trim()) {
        toast.error('يرجى إدخال رقم الشيك الصادر للعهدة');
        return;
      }
      if (!formData.bank_name.trim()) {
        toast.error('يرجى إدخال اسم البنك المسحوب عليه');
        return;
      }
    }

    try {
      const jeResult = await createCustodyIssuanceJournalEntry(
        orgId,
        {
          custodian_name: formData.custodian_name.trim(),
          purpose: formData.purpose.trim(),
          total_amount: totalAmt,
          disbursement_method: formData.disbursement_method,
        },
        {
          treasury_account_id: formData.treasury_account_id,
          cheque_number: formData.cheque_number,
          bank_name: formData.bank_name,
        }
      );

      const payload = {
        organization_id: orgId,
        custodian_name: formData.custodian_name.trim(),
        custodian_phone: formData.custodian_phone.trim() || null,
        purpose: formData.purpose.trim(),
        total_amount: totalAmt,
        spent_amount: 0,
        remaining_amount: totalAmt,
        custody_type: formData.custody_type,
        disbursement_method: formData.disbursement_method,
        cheque_number: formData.cheque_number.trim() || null,
        status: 'active',
        issue_date: new Date().toISOString().split('T')[0],
        journal_entry_id: jeResult.success ? jeResult.journalEntryId : null,
        notes: formData.notes.trim() || null,
      };

      const { error } = await supabase.from('stadium_custodies').insert([payload]);
      if (error) throw error;

      toast.success(
        formData.disbursement_method === 'cheque'
          ? 'تم صرف العهدة وإصدار الشيك الصادر والقيد المحاسبي بنجاح 📜'
          : 'تم تسجيل وصرف العهدة وتوليد القيد بنجاح'
      );
      setIsAddModalOpen(false);
      setFormData({
        custodian_name: '',
        custodian_phone: '',
        purpose: '',
        total_amount: '',
        custody_type: 'temporary',
        disbursement_method: 'cheque',
        cheque_number: '',
        bank_name: '',
        treasury_account_id: treasuryAccounts.length > 0 ? treasuryAccounts[0].id : '',
        notes: '',
      });
      fetchCustodies();
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || 'حدث خطأ أثناء صرف العهدة');
    }
  };

  const openSettleModal = (custody: StadiumCustody) => {
    setSelectedCustody(custody);
    setSettleData({
      spent_amount: String(custody.total_amount),
      remaining_amount: '0',
      expense_account_code: '5103',
      return_treasury_id: treasuryAccounts.length > 0 ? treasuryAccounts[0].id : '',
      notes: '',
    });
    setIsSettleModalOpen(true);
  };

  const handleSpentChange = (val: string) => {
    if (!selectedCustody) return;
    const spent = parseFloat(val) || 0;
    const remaining = Math.max(0, Number(selectedCustody.total_amount) - spent);
    setSettleData(prev => ({
      ...prev,
      spent_amount: val,
      remaining_amount: remaining.toFixed(2),
    }));
  };

  const handleConfirmSettle = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!orgId || !selectedCustody) return;

    const spent = parseFloat(settleData.spent_amount) || 0;
    const remaining = parseFloat(settleData.remaining_amount) || 0;

    if (spent + remaining !== Number(selectedCustody.total_amount)) {
      toast.error('مجموع المصروف الفعلي والمتبقي يجب أن يعادل إجمالي مبلغ العهدة');
      return;
    }

    setIsProcessingSettle(true);
    try {
      const res = await createCustodySettlementJournalEntry(
        orgId,
        {
          id: selectedCustody.id,
          custodian_name: selectedCustody.custodian_name,
          purpose: selectedCustody.purpose,
          total_amount: Number(selectedCustody.total_amount),
        },
        {
          spent_amount: spent,
          remaining_amount: remaining,
          expense_account_code: settleData.expense_account_code,
          return_treasury_id: settleData.return_treasury_id,
          notes: settleData.notes,
        }
      );

      if (!res.success) {
        toast.error(res.error || 'فشلت تسوية العهدة');
        return;
      }

      toast.success('تمت تسوية العهدة وترحيل قيود المصروفات ورد المتبقي بنجاح ✓');
      setIsSettleModalOpen(false);
      setSelectedCustody(null);
      fetchCustodies();
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || 'حدث خطأ أثناء تسوية العهدة');
    } finally {
      setIsProcessingSettle(false);
    }
  };

  const filteredCustodies = custodies.filter(c => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      c.custodian_name.toLowerCase().includes(q) ||
      c.purpose.toLowerCase().includes(q) ||
      (c.cheque_number && c.cheque_number.toLowerCase().includes(q))
    );
  });

  const totalActiveCustodies = custodies.filter(c => c.status === 'active').length;
  const totalActiveAmount = custodies
    .filter(c => c.status === 'active')
    .reduce((acc, c) => acc + Number(c.total_amount), 0);
  const totalSettledAmount = custodies
    .filter(c => c.status === 'settled')
    .reduce((acc, c) => acc + Number(c.spent_amount), 0);

  return (
    <div className="p-6 bg-gray-50 dark:bg-gray-900 min-h-screen text-right" dir="rtl">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-800 dark:text-gray-100 flex items-center gap-2">
            <Wallet className="text-amber-600 dark:text-amber-400 w-7 h-7" />
            إدارة عهد الأنشطة والبطولات والصيانة للاستاد
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            صرف وتسوية العهد المؤقتة والمستديمة لمأموريات الفرق والبطولات الرياضية والصيانة النثرية
          </p>
        </div>
        <button
          onClick={() => setIsAddModalOpen(true)}
          className="bg-amber-600 hover:bg-amber-700 text-white px-4 py-2.5 rounded-lg flex items-center gap-2 shadow font-medium transition"
        >
          <Plus size={20} />
          صرف عهدة جديدة
        </button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <div className="bg-white dark:bg-gray-800 p-4 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 flex items-center justify-between">
          <div>
            <p className="text-xs text-gray-500 dark:text-gray-400 font-medium">العهد المفتوحة / الجارية</p>
            <p className="text-2xl font-bold text-blue-600 dark:text-blue-400 mt-1">{totalActiveCustodies}</p>
          </div>
          <div className="p-3 bg-blue-50 dark:bg-blue-950/40 text-blue-600 rounded-lg">
            <Clock size={24} />
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 p-4 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 flex items-center justify-between">
          <div>
            <p className="text-xs text-gray-500 dark:text-gray-400 font-medium">إجمالي مبالغ العهد الجارية</p>
            <p className="text-2xl font-bold text-amber-600 dark:text-amber-400 mt-1">
              {totalActiveAmount.toLocaleString('ar-EG')} ج.م
            </p>
          </div>
          <div className="p-3 bg-amber-50 dark:bg-amber-950/40 text-amber-600 rounded-lg">
            <Wallet size={24} />
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 p-4 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 flex items-center justify-between">
          <div>
            <p className="text-xs text-gray-500 dark:text-gray-400 font-medium">المصروف الفعلي للعهد المسواة</p>
            <p className="text-2xl font-bold text-green-600 dark:text-green-400 mt-1">
              {totalSettledAmount.toLocaleString('ar-EG')} ج.م
            </p>
          </div>

          <div className="p-3 bg-green-50 dark:bg-green-950/40 text-green-600 rounded-lg">
            <CheckCircle size={24} />
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white dark:bg-gray-800 p-4 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 mb-6 flex flex-wrap gap-4 items-center justify-between">
        <div className="flex flex-wrap gap-3 items-center flex-1">
          <div className="relative min-w-[240px]">
            <Search className="absolute right-3 top-2.5 text-gray-400" size={18} />
            <input
              type="text"
              placeholder="بحث باسم المسؤول، الغرض، أو رقم الشيك..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-3 pr-9 py-2 border rounded-lg text-sm bg-gray-50 dark:bg-gray-900 border-gray-200 dark:border-gray-700"
            />
          </div>

          <select
            value={statusFilter}
            onChange={(e) => { setStatusFilter(e.target.value); setCurrentPage(1); }}
            className="border rounded-lg p-2 text-sm bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700"
          >
            <option value="all">جميع الحالات</option>
            <option value="active">جارية / مفتوحة</option>
            <option value="settled">تمت التسوية</option>
            <option value="overdue">متأخرة</option>
          </select>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-right">
            <thead className="bg-gray-50 dark:bg-gray-900/50 text-gray-500 dark:text-gray-400 border-b dark:border-gray-700 font-medium">
              <tr>
                <th className="p-3.5">مسؤول العهدة</th>
                <th className="p-3.5">الغرض والنشاط</th>
                <th className="p-3.5">نوع العهدة</th>
                <th className="p-3.5">مبلغ العهدة</th>
                <th className="p-3.5">المصروف الفعلي</th>
                <th className="p-3.5">تاريخ الصرف</th>
                <th className="p-3.5">الحالة</th>
                <th className="p-3.5 text-center">الإجراءات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
              {loading ? (
                <tr>
                  <td colSpan={8} className="p-8 text-center text-gray-500">جاري تحميل سجل العهد...</td>
                </tr>
              ) : filteredCustodies.length === 0 ? (
                <tr>
                  <td colSpan={8} className="p-8 text-center text-gray-500">
                    لا توجد عهد مسجلة حالياً
                  </td>
                </tr>
              ) : (
                filteredCustodies.map((c) => (
                  <tr key={c.id} className="hover:bg-gray-50/80 dark:hover:bg-gray-750 transition">
                    <td className="p-3.5">
                      <div className="font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-1.5">
                        <User size={15} className="text-gray-400" />
                        {c.custodian_name}
                      </div>
                      {c.custodian_phone && (
                        <div className="text-xs text-gray-500 flex items-center gap-1 mt-0.5">
                          <Phone size={12} /> {c.custodian_phone}
                        </div>
                      )}
                    </td>
                    <td className="p-3.5">
                      <div className="font-medium text-gray-800 dark:text-gray-200">{c.purpose}</div>
                      {c.cheque_number && (
                        <div className="text-xs text-amber-600 dark:text-amber-400 font-mono">
                          شيك رقم: {c.cheque_number}
                        </div>
                      )}
                    </td>
                    <td className="p-3.5">
                      <span className="text-xs bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded">
                        {CUSTODY_TYPE_LABELS[c.custody_type]}
                      </span>
                    </td>
                    <td className="p-3.5 font-bold text-gray-900 dark:text-gray-100">
                      {Number(c.total_amount).toLocaleString('ar-EG')} ج.م
                    </td>
                    <td className="p-3.5 font-semibold text-green-700 dark:text-green-400">
                      {c.status === 'settled' ? `${Number(c.spent_amount).toLocaleString('ar-EG')} ج.م` : '—'}
                    </td>

                    <td className="p-3.5 text-gray-500 text-xs font-mono">
                      {c.issue_date}
                    </td>
                    <td className="p-3.5">
                      <span className={`inline-block px-2.5 py-1 rounded-full text-xs font-medium ${CUSTODY_STATUS_COLORS[c.status]}`}>
                        {CUSTODY_STATUS_LABELS[c.status]}
                      </span>
                    </td>
                    <td className="p-3.5 text-center">
                      {c.status === 'active' ? (
                        <button
                          onClick={() => openSettleModal(c)}
                          className="px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white rounded text-xs font-medium flex items-center gap-1 mx-auto"
                        >
                          <Receipt size={14} />
                          تسوية العهدة
                        </button>
                      ) : (
                        <span className="text-xs text-green-600 font-semibold flex items-center justify-center gap-1">
                          <CheckCircle size={14} /> مسواة بتاريخ {c.settlement_date}
                        </span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add Custody Modal */}
      {isAddModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-900 rounded-xl shadow-xl max-w-lg w-full p-6 max-h-[90vh] overflow-y-auto">
            <h3 className="text-xl font-bold mb-4 text-gray-900 dark:text-white flex items-center gap-2">
              <Wallet className="text-amber-600" /> صرف عهدة جديدة (مأمورية / بطولة / صيانة)
            </h3>

            <form onSubmit={handleCreateCustody} className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">اسم المسؤول عن العهدة (الموظف / المشرف) *</label>
                <input
                  type="text"
                  required
                  placeholder="مثال: كابتن أحمد محمود (مشرف البطولة)"
                  value={formData.custodian_name}
                  onChange={(e) => setFormData({ ...formData, custodian_name: e.target.value })}
                  className="w-full p-2.5 border rounded-lg text-sm bg-white dark:bg-gray-800"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">رقم الهاتف</label>
                  <input
                    type="text"
                    placeholder="010..."
                    value={formData.custodian_phone}
                    onChange={(e) => setFormData({ ...formData, custodian_phone: e.target.value })}
                    className="w-full p-2.5 border rounded-lg text-sm bg-white dark:bg-gray-800"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">نوع العهدة *</label>
                  <select
                    value={formData.custody_type}
                    onChange={(e) => setFormData({ ...formData, custody_type: e.target.value as StadiumCustodyType })}
                    className="w-full p-2.5 border rounded-lg text-sm bg-white dark:bg-gray-800"
                  >
                    <option value="temporary">عهدة مؤقتة (بطولة / مأمورية)</option>
                    <option value="permanent">عهدة مستديمة (نثرية)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">الغرض من العهدة بالتفصيل *</label>
                <textarea
                  rows={2}
                  required
                  placeholder="مثال: مصاريف تنظيم بطولة دوري الناشئين وشراء المياه والوجبات وبدلات الحكام"
                  value={formData.purpose}
                  onChange={(e) => setFormData({ ...formData, purpose: e.target.value })}
                  className="w-full p-2.5 border rounded-lg text-sm bg-white dark:bg-gray-800"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">مبلغ العهدة (ج.م) *</label>
                  <input
                    type="number"
                    step="0.01"
                    min="1"
                    required
                    placeholder="0.00"
                    value={formData.total_amount}
                    onChange={(e) => setFormData({ ...formData, total_amount: e.target.value })}
                    className="w-full p-2.5 border rounded-lg text-sm bg-white dark:bg-gray-800"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">طريقة صرف العهدة *</label>
                  <select
                    value={formData.disbursement_method}
                    onChange={(e) => setFormData({ ...formData, disbursement_method: e.target.value as any })}
                    className="w-full p-2.5 border rounded-lg text-sm bg-white dark:bg-gray-800"
                  >
                    <option value="cheque">شيك بنكي صادر (وفق اللائحة)</option>
                    <option value="cash">نقداً من الخزينة</option>
                    <option value="bank_transfer">تحويل بنكي</option>
                  </select>
                </div>
              </div>

              {formData.disbursement_method === 'cheque' ? (
                <div className="space-y-3 bg-amber-50 dark:bg-amber-950/30 p-3 rounded-lg border border-amber-200 dark:border-amber-800">
                  <div className="text-xs font-semibold text-amber-800 dark:text-amber-300">
                    📜 تحرير شيك صادر للعهدة (يُسجل في إدارة الشيكات)
                  </div>
                  <div>
                    <label className="block text-xs font-medium mb-1">رقم الشيك الصادر *</label>
                    <input
                      type="text"
                      required
                      placeholder="مثال: 0007812"
                      value={formData.cheque_number}
                      onChange={(e) => setFormData({ ...formData, cheque_number: e.target.value })}
                      className="w-full p-2 border rounded text-sm bg-white dark:bg-gray-800"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium mb-1">البنك المسحوب عليه *</label>
                    <input
                      type="text"
                      required
                      placeholder="مثال: البنك الأهلي المصري"
                      value={formData.bank_name}
                      onChange={(e) => setFormData({ ...formData, bank_name: e.target.value })}
                      className="w-full p-2 border rounded text-sm bg-white dark:bg-gray-800"
                    />
                  </div>
                </div>
              ) : (
                <div>
                  <label className="block text-sm font-medium mb-1">حساب الخزينة المسحوب منها *</label>
                  <select
                    value={formData.treasury_account_id}
                    onChange={(e) => setFormData({ ...formData, treasury_account_id: e.target.value })}
                    className="w-full p-2.5 border rounded-lg text-sm bg-white dark:bg-gray-800"
                  >
                    {treasuryAccounts.map(acc => (
                      <option key={acc.id} value={acc.id}>{acc.name} ({acc.code})</option>
                    ))}
                  </select>
                </div>
              )}

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
                  صرف العهدة وتوليد القيد
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Settle Custody Modal */}
      {isSettleModalOpen && selectedCustody && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-900 rounded-xl shadow-xl max-w-md w-full p-6 max-h-[90vh] overflow-y-auto">
            <h3 className="text-xl font-bold mb-3 text-green-700 dark:text-green-400 flex items-center gap-2">
              <Receipt size={22} /> تسوية عهدة: {selectedCustody.custodian_name}
            </h3>

            <div className="bg-gray-50 dark:bg-gray-800 p-3 rounded-lg text-sm space-y-1 mb-4">
              <div><span className="text-gray-500">الغرض:</span> <strong>{selectedCustody.purpose}</strong></div>
              <div><span className="text-gray-500">إجمالي مبلغ العهدة:</span> <strong className="text-blue-600 text-base">{Number(selectedCustody.total_amount).toLocaleString('ar-EG')} ج.م</strong></div>
            </div>

            <form onSubmit={handleConfirmSettle} className="space-y-3">
              <div>
                <label className="block text-sm font-medium mb-1">المصروف الفعلي بموجب الفواتير (ج.م) *</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  max={selectedCustody.total_amount}
                  required
                  value={settleData.spent_amount}
                  onChange={(e) => handleSpentChange(e.target.value)}
                  className="w-full p-2.5 border rounded-lg text-sm bg-white dark:bg-gray-800 font-bold"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">المبلغ المتبقي المردود للخزينة (ج.م)</label>
                <input
                  type="number"
                  readOnly
                  value={settleData.remaining_amount}
                  className="w-full p-2.5 border rounded-lg text-sm bg-gray-100 dark:bg-gray-700 font-bold text-green-600 cursor-not-allowed"
                />
              </div>


              <div>
                <label className="block text-sm font-medium mb-1">حساب المصروف المحاسبي الموجه إليه *</label>
                <select
                  value={settleData.expense_account_code}
                  onChange={(e) => setSettleData({ ...settleData, expense_account_code: e.target.value })}
                  className="w-full p-2.5 border rounded-lg text-sm bg-white dark:bg-gray-800"
                >
                  {expenseAccounts.length > 0 ? (
                    expenseAccounts.map(acc => (
                      <option key={acc.id} value={acc.code}>{acc.name} ({acc.code})</option>
                    ))
                  ) : (
                    <>
                      <option value="5103">مصروفات البطولات والمعسكرات (5103)</option>
                      <option value="5101">مصروفات صيانة الملاعب والمرافق (5101)</option>
                      <option value="5102">مهمات وأدوات رياضية (5102)</option>
                      <option value="5301">مصروفات نثرية وإدارية (5301)</option>
                    </>
                  )}
                </select>
              </div>

              {Number(settleData.remaining_amount) > 0 && (
                <div>
                  <label className="block text-sm font-medium mb-1">الخزينة المودع بها المبلغ المتبقي *</label>
                  <select
                    value={settleData.return_treasury_id}
                    onChange={(e) => setSettleData({ ...settleData, return_treasury_id: e.target.value })}
                    className="w-full p-2.5 border rounded-lg text-sm bg-white dark:bg-gray-800"
                  >
                    {treasuryAccounts.map(acc => (
                      <option key={acc.id} value={acc.id}>{acc.name} ({acc.code})</option>
                    ))}
                  </select>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium mb-1">ملاحظات التسوية وأرقام الفواتير</label>
                <textarea
                  rows={2}
                  placeholder="أرقام الفواتير المرفقة ومستندات الصرف..."
                  value={settleData.notes}
                  onChange={(e) => setSettleData({ ...settleData, notes: e.target.value })}
                  className="w-full p-2.5 border rounded-lg text-sm bg-white dark:bg-gray-800"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t dark:border-gray-700">
                <button
                  type="button"
                  disabled={isProcessingSettle}
                  onClick={() => setIsSettleModalOpen(false)}
                  className="px-4 py-2 border rounded-lg text-sm"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={isProcessingSettle}
                  className="px-5 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm font-medium"
                >
                  {isProcessingSettle ? 'جاري الترحيل...' : 'تأكيد التسوية وإقفال العهدة'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default StadiumCustodyManager;

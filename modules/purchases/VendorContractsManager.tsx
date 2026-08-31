import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../../supabaseClient';
import { useAccounting } from '../../context/AccountingContext';
import { useToast } from '../../context/ToastContext';
import { 
  ScrollText, Plus, Search, Edit2, Trash2, X, Calendar, 
  Percent, DollarSign, TrendingUp, Store, FileText, CheckCircle, 
  Clock, AlertCircle, Printer, Download, Eye, RefreshCw, Layers,
  ChevronRight, Building2, Tag, ShieldCheck, ArrowUpRight
} from 'lucide-react';

export interface VendorContract {
  id: string;
  contract_number: string;
  vendor_id: string;
  vendor_name?: string;
  title: string;
  start_date: string;
  end_date: string;
  rebate_type: 'PERCENT' | 'TIERED' | 'FIXED_AMOUNT';
  rebate_percentage: number;
  target_purchase_amount: number;
  rebate_calculation_period: 'MONTHLY' | 'QUARTERLY' | 'ANNUALLY';
  shelf_rental_fee: number;
  shelf_rental_period: 'MONTHLY' | 'QUARTERLY' | 'ANNUALLY';
  shelf_location_notes?: string;
  payment_terms_days: number;
  status: 'DRAFT' | 'ACTIVE' | 'EXPIRED' | 'TERMINATED';
  notes?: string;
  created_at: string;
}

export interface RebateSettlement {
  id: string;
  contract_id: string;
  vendor_id: string;
  vendor_name?: string;
  settlement_number: string;
  period_start: string;
  period_end: string;
  total_actual_purchases: number;
  rebate_earned: number;
  shelf_rental_earned: number;
  total_claim_amount: number;
  status: 'PENDING' | 'APPROVED' | 'SETTLED' | 'CANCELLED';
  journal_entry_id?: string;
  notes?: string;
  created_at: string;
}

export default function VendorContractsManager() {
  const { currentUser, suppliers, settings } = useAccounting();
  const { showToast } = useToast();
  const currencySymbol = settings?.currency || 'ج.م';

  const [activeTab, setActiveTab] = useState<'contracts' | 'settlements' | 'shelf_rentals'>('contracts');
  const [contracts, setContracts] = useState<VendorContract[]>([]);
  const [settlements, setSettlements] = useState<RebateSettlement[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');

  // Modal States
  const [isContractModalOpen, setIsContractModalOpen] = useState(false);
  const [editingContractId, setEditingContractId] = useState<string | null>(null);
  const [isSettlementModalOpen, setIsSettlementModalOpen] = useState(false);
  const [calculatingVendorId, setCalculatingVendorId] = useState<string>('');
  const [calculatingContractId, setCalculatingContractId] = useState<string>('');
  const [calcPeriodStart, setCalcPeriodStart] = useState<string>(
    new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0]
  );
  const [calcPeriodEnd, setCalcPeriodEnd] = useState<string>(
    new Date().toISOString().split('T')[0]
  );
  const [calculatedActualPurchases, setCalculatedActualPurchases] = useState<number>(0);
  const [calculatedRebate, setCalculatedRebate] = useState<number>(0);
  const [calculatedShelfRental, setCalculatedShelfRental] = useState<number>(0);
  const [isCalculating, setIsCalculating] = useState(false);

  // Contract Form Data
  const [contractForm, setContractForm] = useState({
    contract_number: '',
    vendor_id: '',
    title: '',
    start_date: new Date().toISOString().split('T')[0],
    end_date: new Date(new Date().setFullYear(new Date().getFullYear() + 1)).toISOString().split('T')[0],
    rebate_type: 'PERCENT' as 'PERCENT' | 'TIERED' | 'FIXED_AMOUNT',
    rebate_percentage: 5,
    target_purchase_amount: 100000,
    rebate_calculation_period: 'MONTHLY' as 'MONTHLY' | 'QUARTERLY' | 'ANNUALLY',
    shelf_rental_fee: 1500,
    shelf_rental_period: 'MONTHLY' as 'MONTHLY' | 'QUARTERLY' | 'ANNUALLY',
    shelf_location_notes: 'صندورة مدخل رئيسي (Endcap Aisle 1)',
    payment_terms_days: 30,
    status: 'ACTIVE' as 'DRAFT' | 'ACTIVE' | 'EXPIRED' | 'TERMINATED',
    notes: ''
  });

  const orgId = currentUser?.organization_id;

  // 📥 Fetch Contracts and Settlements
  const fetchData = async () => {
    if (!orgId) return;
    setIsLoading(true);
    try {
      // 1. Contracts
      const { data: contractsData, error: cErr } = await supabase
        .from('vendor_contracts')
        .select('*')
        .eq('organization_id', orgId)
        .order('created_at', { ascending: false });

      if (cErr) throw cErr;

      const formattedContracts = (contractsData || []).map(c => ({
        ...c,
        vendor_name: suppliers.find(s => s.id === c.vendor_id)?.name || 'مورد غير معروف'
      }));
      setContracts(formattedContracts);

      // 2. Settlements
      const { data: settlementsData, error: sErr } = await supabase
        .from('vendor_rebate_settlements')
        .select('*')
        .eq('organization_id', orgId)
        .order('created_at', { ascending: false });

      if (sErr) throw sErr;

      const formattedSettlements = (settlementsData || []).map(s => ({
        ...s,
        vendor_name: suppliers.find(sup => sup.id === s.vendor_id)?.name || 'مورد غير معروف'
      }));
      setSettlements(formattedSettlements);
    } catch (err: any) {
      console.error(err);
      showToast('خطأ أثناء جلب بيانات العقود والريباط', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [orgId, suppliers]);

  // 🧮 Stats Summary
  const stats = useMemo(() => {
    const activeContracts = contracts.filter(c => c.status === 'ACTIVE').length;
    const totalRebatesEarned = settlements.reduce((sum, s) => sum + Number(s.rebate_earned || 0), 0);
    const totalShelfRentals = contracts.reduce((sum, c) => sum + Number(c.shelf_rental_fee || 0), 0);
    const pendingSettlements = settlements.filter(s => s.status === 'PENDING').length;
    return { activeContracts, totalRebatesEarned, totalShelfRentals, pendingSettlements };
  }, [contracts, settlements]);

  // 📝 Open Create / Edit Contract
  const handleOpenContractModal = (contract?: VendorContract) => {
    if (contract) {
      setEditingContractId(contract.id);
      setContractForm({
        contract_number: contract.contract_number,
        vendor_id: contract.vendor_id,
        title: contract.title,
        start_date: contract.start_date,
        end_date: contract.end_date,
        rebate_type: contract.rebate_type,
        rebate_percentage: Number(contract.rebate_percentage) || 0,
        target_purchase_amount: Number(contract.target_purchase_amount) || 0,
        rebate_calculation_period: contract.rebate_calculation_period,
        shelf_rental_fee: Number(contract.shelf_rental_fee) || 0,
        shelf_rental_period: contract.shelf_rental_period,
        shelf_location_notes: contract.shelf_location_notes || '',
        payment_terms_days: contract.payment_terms_days || 30,
        status: contract.status,
        notes: contract.notes || ''
      });
    } else {
      setEditingContractId(null);
      setContractForm({
        contract_number: `CNT-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`,
        vendor_id: suppliers[0]?.id || '',
        title: 'عقد توريد وبوانص سنوي',
        start_date: new Date().toISOString().split('T')[0],
        end_date: new Date(new Date().setFullYear(new Date().getFullYear() + 1)).toISOString().split('T')[0],
        rebate_type: 'PERCENT',
        rebate_percentage: 5,
        target_purchase_amount: 100000,
        rebate_calculation_period: 'MONTHLY',
        shelf_rental_fee: 1500,
        shelf_rental_period: 'MONTHLY',
        shelf_location_notes: 'صندورة مدخل رئيسي (Endcap Aisle 1)',
        payment_terms_days: 30,
        status: 'ACTIVE',
        notes: ''
      });
    }
    setIsContractModalOpen(true);
  };

  // 💾 Save Contract
  const handleSaveContract = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!contractForm.vendor_id) {
      showToast('يرجى اختيار المورد', 'error');
      return;
    }
    if (!contractForm.contract_number) {
      showToast('يرجى إدخال رقم العقد', 'error');
      return;
    }

    try {
      const payload = {
        organization_id: orgId,
        contract_number: contractForm.contract_number,
        vendor_id: contractForm.vendor_id,
        title: contractForm.title,
        start_date: contractForm.start_date,
        end_date: contractForm.end_date,
        rebate_type: contractForm.rebate_type,
        rebate_percentage: Number(contractForm.rebate_percentage) || 0,
        target_purchase_amount: Number(contractForm.target_purchase_amount) || 0,
        rebate_calculation_period: contractForm.rebate_calculation_period,
        shelf_rental_fee: Number(contractForm.shelf_rental_fee) || 0,
        shelf_rental_period: contractForm.shelf_rental_period,
        shelf_location_notes: contractForm.shelf_location_notes || null,
        payment_terms_days: Number(contractForm.payment_terms_days) || 30,
        status: contractForm.status,
        notes: contractForm.notes || null,
        updated_at: new Date().toISOString()
      };

      if (editingContractId) {
        const { error } = await supabase
          .from('vendor_contracts')
          .update(payload)
          .eq('id', editingContractId);
        if (error) throw error;
        showToast('تم تحديث العقد بنجاح ✅', 'success');
      } else {
        const { error } = await supabase
          .from('vendor_contracts')
          .insert([payload]);
        if (error) throw error;
        showToast('تم إنشاء عقد المورد الجديد بنجاح ✅', 'success');
      }

      setIsContractModalOpen(false);
      fetchData();
    } catch (err: any) {
      console.error(err);
      showToast(err.message || 'فشل حفظ العقد', 'error');
    }
  };

  // 🗑️ Delete Contract
  const handleDeleteContract = async (id: string) => {
    if (!window.confirm('هل أنت متأكد من رغبتك في حذف هذا العقد؟')) return;
    try {
      const { error } = await supabase
        .from('vendor_contracts')
        .delete()
        .eq('id', id);
      if (error) throw error;
      showToast('تم حذف العقد بنجاح', 'info');
      fetchData();
    } catch (err: any) {
      showToast('فشل حذف العقد', 'error');
    }
  };

  // 🔍 Calculate Actual Purchases for Rebate Settlement
  const handleCalculateRebate = async () => {
    if (!calculatingContractId) {
      showToast('يرجى اختيار العقد', 'error');
      return;
    }
    const contract = contracts.find(c => c.id === calculatingContractId);
    if (!contract) return;

    setIsCalculating(true);
    try {
      // Fetch purchase invoices for this vendor in the date range
      const { data: invoices, error } = await supabase
        .from('purchase_invoices')
        .select('total_amount, subtotal')
        .eq('organization_id', orgId)
        .eq('supplier_id', contract.vendor_id)
        .gte('invoice_date', calcPeriodStart)
        .lte('invoice_date', calcPeriodEnd)
        .is('deleted_at', null);

      if (error) throw error;

      const actualPurchases = (invoices || []).reduce(
        (sum, inv) => sum + Number(inv.subtotal || inv.total_amount || 0), 
        0
      );

      setCalculatedActualPurchases(actualPurchases);

      // Rebate calculation
      let rebateAmount = 0;
      if (contract.rebate_type === 'PERCENT') {
        rebateAmount = actualPurchases * (Number(contract.rebate_percentage) / 100);
      } else if (contract.rebate_type === 'FIXED_AMOUNT') {
        rebateAmount = Number(contract.rebate_percentage) || 0;
      } else if (contract.rebate_type === 'TIERED') {
        if (actualPurchases >= Number(contract.target_purchase_amount)) {
          rebateAmount = actualPurchases * (Number(contract.rebate_percentage) / 100);
        } else {
          rebateAmount = actualPurchases * ((Number(contract.rebate_percentage) * 0.5) / 100);
        }
      }

      setCalculatedRebate(rebateAmount);
      setCalculatedShelfRental(Number(contract.shelf_rental_fee) || 0);

      showToast(`تم احتساب المشتريات الفعلية (${actualPurchases.toFixed(2)} ${currencySymbol})`, 'success');
    } catch (err: any) {
      console.error(err);
      showToast('فشل احتساب المشتريات', 'error');
    } finally {
      setIsCalculating(false);
    }
  };

  // 💾 Confirm & Save Settlement Claim
  const handleSaveSettlement = async () => {
    const contract = contracts.find(c => c.id === calculatingContractId);
    if (!contract) return;

    const totalClaim = calculatedRebate + calculatedShelfRental;
    if (totalClaim <= 0) {
      showToast('إجمالي المطالبة يجب أن يكون أكبر من الصفر', 'warning');
      return;
    }

    try {
      const settlementPayload = {
        organization_id: orgId,
        contract_id: contract.id,
        vendor_id: contract.vendor_id,
        settlement_number: `REB-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`,
        period_start: calcPeriodStart,
        period_end: calcPeriodEnd,
        total_actual_purchases: calculatedActualPurchases,
        rebate_earned: calculatedRebate,
        shelf_rental_earned: calculatedShelfRental,
        total_claim_amount: totalClaim,
        status: 'PENDING',
        notes: `مطالبة بوانص وإيجار أرفف عن الفترة من ${calcPeriodStart} إلى ${calcPeriodEnd}`
      };

      const { error } = await supabase
        .from('vendor_rebate_settlements')
        .insert([settlementPayload]);

      if (error) throw error;

      showToast('تم إصدار وتسجيل مطالبة البونص بنجاح 📋', 'success');
      setIsSettlementModalOpen(false);
      fetchData();
    } catch (err: any) {
      showToast(err.message || 'فشل حفظ التسوية', 'error');
    }
  };

  // Filtered Contracts
  const filteredContracts = useMemo(() => {
    return contracts.filter(c => {
      const matchSearch = 
        c.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
        c.contract_number.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (c.vendor_name && c.vendor_name.toLowerCase().includes(searchTerm.toLowerCase()));
      const matchStatus = statusFilter === 'ALL' || c.status === statusFilter;
      return matchSearch && matchStatus;
    });
  }, [contracts, searchTerm, statusFilter]);

  return (
    <div className="p-6 bg-slate-900 min-h-screen text-slate-100 font-sans" dir="rtl">
      
      {/* 🏷️ Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-black text-white flex items-center gap-3">
            <ScrollText className="text-indigo-400" size={28} />
            إدارة عقود الموردين والبوانص (Vendor Rebates & Shelf Rental)
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            إدارة اتفاقيات التوريد للهايبرماركت، احتساب نسب الخصم الخلفي (Rebates)، وإيرادات إيجارات الأرفف والصندورات الإعلانية.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => {
              if (contracts.length === 0) {
                showToast('يرجى إضافة عقد مورد أولاً', 'warning');
                return;
              }
              setCalculatingContractId(contracts[0].id);
              setIsSettlementModalOpen(true);
            }}
            className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-black px-4 py-2.5 rounded-xl flex items-center gap-2 shadow-lg shadow-emerald-600/20 transition-all"
          >
            <DollarSign size={16} /> احتساب وتسوية بونص جديد
          </button>

          <button
            onClick={() => handleOpenContractModal()}
            className="bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-black px-4 py-2.5 rounded-xl flex items-center gap-2 shadow-lg shadow-indigo-600/20 transition-all"
          >
            <Plus size={16} /> إضافة عقد مورد جديد
          </button>
        </div>
      </div>

      {/* 📊 KPI Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <div className="bg-slate-950 border border-slate-800 rounded-2xl p-4 flex items-center justify-between">
          <div>
            <span className="text-xs text-slate-400 block font-bold">العقود النشطة</span>
            <span className="text-2xl font-black font-mono text-indigo-400 mt-1 block">
              {stats.activeContracts}
            </span>
          </div>
          <div className="w-12 h-12 rounded-xl bg-indigo-950/50 border border-indigo-900/40 flex items-center justify-center text-indigo-400">
            <ScrollText size={24} />
          </div>
        </div>

        <div className="bg-slate-950 border border-slate-800 rounded-2xl p-4 flex items-center justify-between">
          <div>
            <span className="text-xs text-slate-400 block font-bold">إجمالي البوانص المحققة</span>
            <span className="text-2xl font-black font-mono text-emerald-400 mt-1 block">
              {stats.totalRebatesEarned.toFixed(2)} {currencySymbol}
            </span>
          </div>
          <div className="w-12 h-12 rounded-xl bg-emerald-950/50 border border-emerald-900/40 flex items-center justify-center text-emerald-400">
            <Percent size={24} />
          </div>
        </div>

        <div className="bg-slate-950 border border-slate-800 rounded-2xl p-4 flex items-center justify-between">
          <div>
            <span className="text-xs text-slate-400 block font-bold">إيجارات الأرفف الشهرية</span>
            <span className="text-2xl font-black font-mono text-amber-400 mt-1 block">
              {stats.totalShelfRentals.toFixed(2)} {currencySymbol}
            </span>
          </div>
          <div className="w-12 h-12 rounded-xl bg-amber-950/50 border border-amber-900/40 flex items-center justify-center text-amber-400">
            <Store size={24} />
          </div>
        </div>

        <div className="bg-slate-950 border border-slate-800 rounded-2xl p-4 flex items-center justify-between">
          <div>
            <span className="text-xs text-slate-400 block font-bold">تسويات معلقة التحصيل</span>
            <span className="text-2xl font-black font-mono text-rose-400 mt-1 block">
              {stats.pendingSettlements}
            </span>
          </div>
          <div className="w-12 h-12 rounded-xl bg-rose-950/50 border border-rose-900/40 flex items-center justify-center text-rose-400">
            <Clock size={24} />
          </div>
        </div>
      </div>

      {/* 🧭 Tabs Navigation */}
      <div className="flex border-b border-slate-800 mb-6 gap-2">
        <button
          onClick={() => setActiveTab('contracts')}
          className={`pb-3 px-4 text-xs font-black flex items-center gap-2 border-b-2 transition-all ${
            activeTab === 'contracts'
              ? 'border-indigo-500 text-indigo-400'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <ScrollText size={16} /> عقود واتفاقيات الموردين ({contracts.length})
        </button>

        <button
          onClick={() => setActiveTab('settlements')}
          className={`pb-3 px-4 text-xs font-black flex items-center gap-2 border-b-2 transition-all ${
            activeTab === 'settlements'
              ? 'border-emerald-500 text-emerald-400'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <DollarSign size={16} /> تسويات ومطالبات البوانص ({settlements.length})
        </button>

        <button
          onClick={() => setActiveTab('shelf_rentals')}
          className={`pb-3 px-4 text-xs font-black flex items-center gap-2 border-b-2 transition-all ${
            activeTab === 'shelf_rentals'
              ? 'border-amber-500 text-amber-400'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <Store size={16} /> إيجارات الأرفف والصندورات (Endcaps)
        </button>
      </div>

      {/* 📑 TAB 1: Contracts List */}
      {activeTab === 'contracts' && (
        <div className="space-y-4">
          {/* Controls bar */}
          <div className="flex flex-col sm:flex-row justify-between items-center gap-3 bg-slate-950 p-4 rounded-2xl border border-slate-800">
            <div className="relative w-full sm:w-80">
              <Search size={16} className="absolute right-3 top-3 text-slate-500" />
              <input
                type="text"
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                placeholder="بحث برقم العقد، اسم المورد..."
                className="w-full bg-slate-900 border border-slate-800 rounded-xl pr-9 pl-4 py-2 text-xs text-white placeholder:text-slate-600 focus:border-indigo-500 outline-none"
              />
            </div>

            <div className="flex items-center gap-2 w-full sm:w-auto">
              <select
                value={statusFilter}
                onChange={e => setStatusFilter(e.target.value)}
                className="bg-slate-900 border border-slate-800 text-xs text-slate-300 rounded-xl px-3 py-2 outline-none"
              >
                <option value="ALL">جميع الحالات</option>
                <option value="ACTIVE">نشط (Active)</option>
                <option value="DRAFT">مسودة (Draft)</option>
                <option value="EXPIRED">منتهي (Expired)</option>
                <option value="TERMINATED">ملغى (Terminated)</option>
              </select>

              <button
                onClick={fetchData}
                className="p-2 bg-slate-900 hover:bg-slate-850 rounded-xl border border-slate-800 text-slate-400 hover:text-white transition-all"
                title="تحديث البيانات"
              >
                <RefreshCw size={14} className={isLoading ? 'animate-spin' : ''} />
              </button>
            </div>
          </div>

          {/* Table */}
          <div className="bg-slate-950 border border-slate-800 rounded-2xl overflow-hidden">
            <table className="w-full text-right border-collapse text-xs">
              <thead>
                <tr className="bg-slate-900/60 border-b border-slate-800 font-black text-slate-400">
                  <th className="p-3.5">رقم العقد / المورد</th>
                  <th className="p-3.5">عنوان الاتفاقية</th>
                  <th className="p-3.5">نسبة البونص (Rebate)</th>
                  <th className="p-3.5">المستهدف الشرائي</th>
                  <th className="p-3.5">إيجار الرف</th>
                  <th className="p-3.5">فترة الصلاحية</th>
                  <th className="p-3.5 text-center">الحالة</th>
                  <th className="p-3.5 text-center">إجراءات</th>
                </tr>
              </thead>
              <tbody>
                {filteredContracts.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="text-center py-12 text-slate-500">
                      لا توجد عقود موردين مسجلة حتى الآن
                    </td>
                  </tr>
                ) : (
                  filteredContracts.map(c => (
                    <tr key={c.id} className="border-b border-slate-850 hover:bg-slate-900/40 transition-all">
                      <td className="p-3.5">
                        <div className="font-mono font-black text-indigo-400">{c.contract_number}</div>
                        <div className="font-bold text-white mt-0.5">{c.vendor_name}</div>
                      </td>
                      <td className="p-3.5 text-slate-300 font-bold">{c.title}</td>
                      <td className="p-3.5">
                        <span className="bg-emerald-950 text-emerald-400 border border-emerald-900/50 px-2 py-0.5 rounded font-black font-mono">
                          {c.rebate_percentage}% ({c.rebate_type === 'PERCENT' ? 'نسبة' : c.rebate_type === 'TIERED' ? 'متدرج' : 'مبلغ ثابت'})
                        </span>
                        <div className="text-[10px] text-slate-500 mt-0.5">{c.rebate_calculation_period}</div>
                      </td>
                      <td className="p-3.5 font-mono font-bold text-slate-200">
                        {Number(c.target_purchase_amount).toFixed(2)} {currencySymbol}
                      </td>
                      <td className="p-3.5">
                        <div className="font-mono font-black text-amber-400">
                          {Number(c.shelf_rental_fee).toFixed(2)} {currencySymbol}
                        </div>
                        <div className="text-[10px] text-slate-500">{c.shelf_rental_period}</div>
                      </td>
                      <td className="p-3.5 font-mono text-slate-400">
                        <div>من: {c.start_date}</div>
                        <div>إلى: {c.end_date}</div>
                      </td>
                      <td className="p-3.5 text-center">
                        <span className={`px-2.5 py-1 rounded-full text-[10px] font-black ${
                          c.status === 'ACTIVE' ? 'bg-emerald-950 text-emerald-400 border border-emerald-900' :
                          c.status === 'DRAFT' ? 'bg-amber-950 text-amber-400 border border-amber-900' :
                          'bg-slate-800 text-slate-400'
                        }`}>
                          {c.status === 'ACTIVE' ? 'نشط' : c.status === 'DRAFT' ? 'مسودة' : c.status}
                        </span>
                      </td>
                      <td className="p-3.5 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          <button
                            onClick={() => handleOpenContractModal(c)}
                            className="p-1.5 bg-slate-900 hover:bg-slate-800 text-indigo-400 rounded-lg transition-all"
                            title="تعديل العقد"
                          >
                            <Edit2 size={13} />
                          </button>
                          <button
                            onClick={() => handleDeleteContract(c.id)}
                            className="p-1.5 bg-slate-900 hover:bg-red-950 text-red-400 rounded-lg transition-all"
                            title="حذف العقد"
                          >
                            <Trash2 size={13} />
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
      )}

      {/* 💵 TAB 2: Rebate Settlements */}
      {activeTab === 'settlements' && (
        <div className="space-y-4">
          <div className="bg-slate-950 border border-slate-800 rounded-2xl overflow-hidden">
            <table className="w-full text-right border-collapse text-xs">
              <thead>
                <tr className="bg-slate-900/60 border-b border-slate-800 font-black text-slate-400">
                  <th className="p-3.5">رقم التسوية</th>
                  <th className="p-3.5">المورد</th>
                  <th className="p-3.5">فترة التسوية</th>
                  <th className="p-3.5">إجمالي المشتريات الفعلية</th>
                  <th className="p-3.5">البونص المستحق (Rebate)</th>
                  <th className="p-3.5">إيجار الأرفف</th>
                  <th className="p-3.5">إجمالي المطالبة</th>
                  <th className="p-3.5 text-center">الحالة</th>
                </tr>
              </thead>
              <tbody>
                {settlements.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="text-center py-12 text-slate-500">
                      لا توجد تسويات بوانص مسجلة حتى الآن. اضغط "احتساب وتسوية بونص جديد" بالأعلى لإنشاء تسوية.
                    </td>
                  </tr>
                ) : (
                  settlements.map(s => (
                    <tr key={s.id} className="border-b border-slate-850 hover:bg-slate-900/40 transition-all">
                      <td className="p-3.5 font-mono font-black text-indigo-400">{s.settlement_number}</td>
                      <td className="p-3.5 font-bold text-white">{s.vendor_name}</td>
                      <td className="p-3.5 font-mono text-slate-400">{s.period_start} ⬅️ {s.period_end}</td>
                      <td className="p-3.5 font-mono font-bold text-slate-300">{Number(s.total_actual_purchases).toFixed(2)} {currencySymbol}</td>
                      <td className="p-3.5 font-mono font-black text-emerald-400">+{Number(s.rebate_earned).toFixed(2)} {currencySymbol}</td>
                      <td className="p-3.5 font-mono font-black text-amber-400">+{Number(s.shelf_rental_earned).toFixed(2)} {currencySymbol}</td>
                      <td className="p-3.5 font-mono font-black text-indigo-300 text-sm bg-indigo-950/20 px-3 py-2 rounded-lg">
                        {Number(s.total_claim_amount).toFixed(2)} {currencySymbol}
                      </td>
                      <td className="p-3.5 text-center">
                        <span className={`px-2.5 py-1 rounded-full text-[10px] font-black ${
                          s.status === 'APPROVED' ? 'bg-emerald-950 text-emerald-400 border border-emerald-900' :
                          s.status === 'PENDING' ? 'bg-amber-950 text-amber-400 border border-amber-900' :
                          'bg-slate-800 text-slate-400'
                        }`}>
                          {s.status === 'APPROVED' ? 'معتمد' : s.status === 'PENDING' ? 'قيد المراجعة' : s.status}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 🏬 TAB 3: Shelf Rentals */}
      {activeTab === 'shelf_rentals' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {contracts.filter(c => Number(c.shelf_rental_fee) > 0).map(c => (
            <div key={c.id} className="bg-slate-950 border border-slate-800 rounded-2xl p-5 space-y-3">
              <div className="flex justify-between items-start">
                <div>
                  <span className="text-[10px] font-mono text-indigo-400">{c.contract_number}</span>
                  <h3 className="font-black text-white text-sm">{c.vendor_name}</h3>
                </div>
                <span className="text-base font-black font-mono text-amber-400">
                  {Number(c.shelf_rental_fee).toFixed(2)} {currencySymbol}
                </span>
              </div>

              <div className="bg-slate-900/60 p-3 rounded-xl border border-slate-800/40 text-xs space-y-1">
                <div className="text-slate-400 font-bold">موقع ومواصفات الرف:</div>
                <div className="text-white font-bold">{c.shelf_location_notes || 'غير محدد'}</div>
              </div>

              <div className="flex justify-between text-xs text-slate-500 pt-2 border-t border-slate-850">
                <span>الدورية: {c.shelf_rental_period}</span>
                <span>الحالة: {c.status}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 📝 Create / Edit Contract Modal */}
      {isContractModalOpen && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4" dir="rtl">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-2xl w-full p-6 space-y-5 shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center pb-3 border-b border-slate-800">
              <h2 className="font-black text-base text-white flex items-center gap-2">
                <ScrollText size={18} className="text-indigo-400" />
                {editingContractId ? 'تعديل عقد المورد' : 'إنشاء عقد مورد جديد'}
              </h2>
              <button onClick={() => setIsContractModalOpen(false)} className="text-slate-400 hover:text-white">
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSaveContract} className="space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-400 font-bold mb-1">رقم العقد *</label>
                  <input
                    type="text"
                    value={contractForm.contract_number}
                    onChange={e => setContractForm({ ...contractForm, contract_number: e.target.value })}
                    required
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 font-mono text-white outline-none focus:border-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-slate-400 font-bold mb-1">المورد *</label>
                  <select
                    value={contractForm.vendor_id}
                    onChange={e => setContractForm({ ...contractForm, vendor_id: e.target.value })}
                    required
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white outline-none focus:border-indigo-500"
                  >
                    <option value="">-- اختر المورد --</option>
                    {suppliers.map(s => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-slate-400 font-bold mb-1">عنوان العقد / الاتفاقية *</label>
                <input
                  type="text"
                  value={contractForm.title}
                  onChange={e => setContractForm({ ...contractForm, title: e.target.value })}
                  placeholder="مثال: اتفاقية التوريد السنوية لمنتجات الألبان"
                  required
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white outline-none focus:border-indigo-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-400 font-bold mb-1">تاريخ البداية</label>
                  <input
                    type="date"
                    value={contractForm.start_date}
                    onChange={e => setContractForm({ ...contractForm, start_date: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white outline-none focus:border-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 font-bold mb-1">تاريخ النهاية</label>
                  <input
                    type="date"
                    value={contractForm.end_date}
                    onChange={e => setContractForm({ ...contractForm, end_date: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white outline-none focus:border-indigo-500"
                  />
                </div>
              </div>

              {/* Rebate Section */}
              <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-3">
                <h3 className="font-black text-indigo-400 flex items-center gap-1.5 text-xs">
                  <Percent size={14} /> شروط البونص والخصم الخلفي (Volume Rebate)
                </h3>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="block text-slate-400 mb-1">نوع البونص</label>
                    <select
                      value={contractForm.rebate_type}
                      onChange={e => setContractForm({ ...contractForm, rebate_type: e.target.value as any })}
                      className="w-full bg-slate-900 border border-slate-800 rounded-lg p-2 text-white outline-none"
                    >
                      <option value="PERCENT">نسبة مئوية (%)</option>
                      <option value="TIERED">متدرج حسب المستهدف</option>
                      <option value="FIXED_AMOUNT">مبلغ ثابت</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-slate-400 mb-1">نسبة البونص (%)</label>
                    <input
                      type="number"
                      step="0.1"
                      value={contractForm.rebate_percentage}
                      onChange={e => setContractForm({ ...contractForm, rebate_percentage: parseFloat(e.target.value) || 0 })}
                      className="w-full bg-slate-900 border border-slate-800 rounded-lg p-2 font-mono text-white outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-400 mb-1">المستهدف الشرائي</label>
                    <input
                      type="number"
                      value={contractForm.target_purchase_amount}
                      onChange={e => setContractForm({ ...contractForm, target_purchase_amount: parseFloat(e.target.value) || 0 })}
                      className="w-full bg-slate-900 border border-slate-800 rounded-lg p-2 font-mono text-white outline-none"
                    />
                  </div>
                </div>
              </div>

              {/* Shelf Rental Section */}
              <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-3">
                <h3 className="font-black text-amber-400 flex items-center gap-1.5 text-xs">
                  <Store size={14} /> إيجار الأرفف والمساحات الإعلانية (Shelf & Gondola Rental)
                </h3>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-slate-400 mb-1">قيمة الإيجار ({currencySymbol})</label>
                    <input
                      type="number"
                      value={contractForm.shelf_rental_fee}
                      onChange={e => setContractForm({ ...contractForm, shelf_rental_fee: parseFloat(e.target.value) || 0 })}
                      className="w-full bg-slate-900 border border-slate-800 rounded-lg p-2 font-mono text-white outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-400 mb-1">دورية الاستحقاق</label>
                    <select
                      value={contractForm.shelf_rental_period}
                      onChange={e => setContractForm({ ...contractForm, shelf_rental_period: e.target.value as any })}
                      className="w-full bg-slate-900 border border-slate-800 rounded-lg p-2 text-white outline-none"
                    >
                      <option value="MONTHLY">شهرياً (Monthly)</option>
                      <option value="QUARTERLY">ربع سنوي (Quarterly)</option>
                      <option value="ANNUALLY">سنوياً (Annually)</option>
                    </select>
                  </div>
                  <div className="col-span-2">
                    <label className="block text-slate-400 mb-1">موقع وتفاصيل الرف المؤجر</label>
                    <input
                      type="text"
                      value={contractForm.shelf_location_notes}
                      onChange={e => setContractForm({ ...contractForm, shelf_location_notes: e.target.value })}
                      placeholder="مثال: صندورة الواجهة الرئيسية A1"
                      className="w-full bg-slate-900 border border-slate-800 rounded-lg p-2 text-white outline-none"
                    />
                  </div>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsContractModalOpen(false)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl font-bold transition-all"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-black shadow-lg shadow-indigo-600/20 transition-all"
                >
                  حفظ العقد
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 🧮 Settlement Calculation Modal */}
      {isSettlementModalOpen && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4" dir="rtl">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-xl w-full p-6 space-y-5 shadow-2xl">
            <div className="flex justify-between items-center pb-3 border-b border-slate-800">
              <h2 className="font-black text-base text-white flex items-center gap-2">
                <DollarSign size={18} className="text-emerald-400" />
                احتساب وتسوية بونص المورد
              </h2>
              <button onClick={() => setIsSettlementModalOpen(false)} className="text-slate-400 hover:text-white">
                <X size={18} />
              </button>
            </div>

            <div className="space-y-4 text-xs">
              <div>
                <label className="block text-slate-400 font-bold mb-1">اختر عقد المورد المراد تسويته *</label>
                <select
                  value={calculatingContractId}
                  onChange={e => setCalculatingContractId(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-white outline-none focus:border-indigo-500"
                >
                  {contracts.map(c => (
                    <option key={c.id} value={c.id}>
                      {c.contract_number} - {c.vendor_name} ({c.title})
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-400 font-bold mb-1">بداية الفترة</label>
                  <input
                    type="date"
                    value={calcPeriodStart}
                    onChange={e => setCalcPeriodStart(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-white outline-none"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 font-bold mb-1">نهاية الفترة</label>
                  <input
                    type="date"
                    value={calcPeriodEnd}
                    onChange={e => setCalcPeriodEnd(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-white outline-none"
                  />
                </div>
              </div>

              <button
                type="button"
                onClick={handleCalculateRebate}
                disabled={isCalculating}
                className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-black py-2.5 rounded-xl transition-all flex items-center justify-center gap-2"
              >
                <RefreshCw size={14} className={isCalculating ? 'animate-spin' : ''} />
                فحص فواتير المشتريات واحتساب البونص تلقائياً
              </button>

              {/* Results Breakdown */}
              <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-2.5">
                <div className="flex justify-between text-slate-300">
                  <span>إجمالي المشتريات الفعلية بالفترة:</span>
                  <span className="font-mono font-bold">{calculatedActualPurchases.toFixed(2)} {currencySymbol}</span>
                </div>
                <div className="flex justify-between text-emerald-400 font-bold">
                  <span>قيمة البونص المستحق (Rebate):</span>
                  <span className="font-mono">+{calculatedRebate.toFixed(2)} {currencySymbol}</span>
                </div>
                <div className="flex justify-between text-amber-400 font-bold">
                  <span>قيمة إيجار الرف المستحق:</span>
                  <span className="font-mono">+{calculatedShelfRental.toFixed(2)} {currencySymbol}</span>
                </div>
                <div className="border-t border-slate-800 pt-2 flex justify-between text-white font-black text-sm">
                  <span>إجمالي المطالبة المالية:</span>
                  <span className="font-mono text-indigo-400">
                    {(calculatedRebate + calculatedShelfRental).toFixed(2)} {currencySymbol}
                  </span>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsSettlementModalOpen(false)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl font-bold transition-all"
                >
                  إلغاء
                </button>
                <button
                  type="button"
                  onClick={handleSaveSettlement}
                  className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-black shadow-lg shadow-emerald-600/20 transition-all"
                >
                  اعتماد وحفظ المطالبة المالية
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

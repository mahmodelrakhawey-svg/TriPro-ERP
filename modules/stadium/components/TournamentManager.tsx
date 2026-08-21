import React, { useState, useEffect } from 'react';
import { supabase } from '@/supabaseClient';
import { useAccounting } from '@/context/AccountingContext';
import toast from 'react-hot-toast';
import {
  Trophy,
  Plus,
  Search,
  Calendar,
  DollarSign,
  Users,
  Award,
  ChevronLeft,
  X,
  Printer,
  Download,
  Building2,
  Phone,
  CheckCircle2,
  TrendingUp,
} from 'lucide-react';
import { useForm } from 'react-hook-form';
import * as XLSX from 'xlsx';
import {
  StadiumTournament,
  StadiumTournamentTeam,
  StadiumFacility,
  TOURNAMENT_STATUS_LABELS,
  TOURNAMENT_STATUS_COLORS,
} from '../stadium.types';
import {
  createTournamentTeamJournalEntry,
  getTreasuryAccounts,
  TreasuryAccountOption,
} from '../stadiumHelpers';
import { ReceiptModal, ReceiptData } from './ReceiptModal';

export const TournamentManager: React.FC = () => {
  const { currentUser, organization, currentSelectedOrgId } = useAccounting();
  const orgId = currentSelectedOrgId || (currentUser as any)?.organization_id || (organization as any)?.id;

  const [tournaments, setTournaments] = useState<StadiumTournament[]>([]);
  const [facilities, setFacilities] = useState<StadiumFacility[]>([]);
  const [treasuryAccounts, setTreasuryAccounts] = useState<TreasuryAccountOption[]>([]);
  const [loading, setLoading] = useState(true);

  const [selectedTournament, setSelectedTournament] = useState<StadiumTournament | null>(null);
  const [teams, setTeams] = useState<StadiumTournamentTeam[]>([]);
  const [teamsLoading, setTeamsLoading] = useState(false);

  // Modals
  const [isTournamentModalOpen, setIsTournamentModalOpen] = useState(false);
  const [editingTournament, setEditingTournament] = useState<StadiumTournament | null>(null);

  const [isTeamModalOpen, setIsTeamModalOpen] = useState(false);
  const [receiptModalData, setReceiptModalData] = useState<ReceiptData | null>(null);

  const { register: registerT, handleSubmit: handleSubmitT, reset: resetT } = useForm();
  const { register: registerTeam, handleSubmit: handleSubmitTeam, reset: resetTeam } = useForm();

  const fetchTournaments = async () => {
    if (!orgId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('stadium_tournaments')
        .select('*, stadium_facilities(name)')
        .eq('organization_id', orgId)
        .order('start_date', { ascending: false });

      if (!error && data) {
        setTournaments(data);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const fetchFacilities = async () => {
    if (!orgId) return;
    try {
      const { data } = await supabase
        .from('stadium_facilities')
        .select('*')
        .eq('organization_id', orgId);
      setFacilities(data || []);
    } catch (e) {
      console.error(e);
    }
  };

  const fetchTeams = async (tournamentId: string) => {
    setTeamsLoading(true);
    try {
      const { data, error } = await supabase
        .from('stadium_tournament_teams')
        .select('*')
        .eq('tournament_id', tournamentId)
        .order('created_at', { ascending: true });

      if (!error && data) {
        setTeams(data);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setTeamsLoading(false);
    }
  };

  useEffect(() => {
    if (orgId) {
      fetchTournaments();
      fetchFacilities();
      getTreasuryAccounts(orgId).then(setTreasuryAccounts);
    } else {
      setLoading(false);
    }
  }, [orgId]);


  const onSaveTournament = async (data: any) => {
    if (!orgId) return;
    const payload = {
      organization_id: orgId,
      name: data.name?.trim(),
      sport_type: data.sport_type || 'كرة قدم',
      facility_id: data.facility_id || null,
      start_date: data.start_date,
      end_date: data.end_date,
      team_entry_fee: parseFloat(data.team_entry_fee) || 0,
      max_teams: parseInt(data.max_teams) || 16,
      total_prizes: parseFloat(data.total_prizes) || 0,
      total_sponsorship: parseFloat(data.total_sponsorship) || 0,
      estimated_budget: parseFloat(data.estimated_budget) || 0,
      actual_expenses: parseFloat(data.actual_expenses) || 0,
      status: data.status || 'upcoming',
      organizer_name: data.organizer_name?.trim() || null,
      notes: data.notes?.trim() || null,
    };

    if (editingTournament) {
      const { error } = await supabase
        .from('stadium_tournaments')
        .update(payload)
        .eq('id', editingTournament.id);
      if (error) {
        toast.error('حدث خطأ أثناء التحديث');
      } else {
        toast.success('تم تحديث البطولة بنجاح');
        setIsTournamentModalOpen(false);
        fetchTournaments();
      }
    } else {
      const { error } = await supabase
        .from('stadium_tournaments')
        .insert([payload]);
      if (error) {
        toast.error('حدث خطأ أثناء الإنشاء');
      } else {
        toast.success('تم إنشاء البطولة بنجاح');
        setIsTournamentModalOpen(false);
        fetchTournaments();
      }
    }
  };

  const onSaveTeam = async (data: any) => {
    if (!orgId || !selectedTournament) return;
    const today = new Date().toISOString().split('T')[0];
    const amount = parseFloat(data.entry_fee_paid) || 0;

    // 1. توليد القيد المحاسبي لرسوم الاشتراك
    const jeResult = await createTournamentTeamJournalEntry(
      orgId,
      amount,
      data.team_name?.trim(),
      selectedTournament.name,
      today,
      data.treasury_account_id
    );

    // 2. إدراج الفريق
    const payload = {
      organization_id: orgId,
      tournament_id: selectedTournament.id,
      team_name: data.team_name?.trim(),
      captain_name: data.captain_name?.trim(),
      captain_phone: data.captain_phone?.trim(),
      entry_fee_paid: amount,
      payment_status: amount >= selectedTournament.team_entry_fee ? 'paid' : amount > 0 ? 'partial' : 'unpaid',
      payment_method: data.payment_method || 'cash',
      journal_entry_id: jeResult.success ? jeResult.journalEntryId : null,
      notes: data.notes?.trim() || null,
    };

    const { data: newTeam, error } = await supabase
      .from('stadium_tournament_teams')
      .insert([payload])
      .select()
      .single();

    if (error) {
      toast.error('حدث خطأ أثناء تسجيل الفريق');
    } else {
      toast.success('تم تسجيل الفريق وتوليد القيد المحاسبي بنجاح 🎉');
      setIsTeamModalOpen(false);
      fetchTeams(selectedTournament.id);

      // Open Receipt
      setReceiptModalData({
        receiptNumber: `TRN-${Math.floor(100000 + Math.random() * 900000)}`,
        receiptDate: today,
        receiptTypeLabel: 'إيصال سداد رسوم اشتراك بطولة رياضية',
        partyName: `${data.team_name} (ك/ ${data.captain_name})`,
        partyPhone: data.captain_phone,
        amount: amount,
        paymentMethod: data.payment_method || 'cash',
        facilityOrProgramName: `بطولة: ${selectedTournament.name}`,
        notes: `رسوم اشتراك الفريق في بطولة ${selectedTournament.name}`,
      });
    }
  };

  const openAddTournament = () => {
    setEditingTournament(null);
    const today = new Date().toISOString().split('T')[0];
    resetT({
      name: '',
      sport_type: 'كرة قدم خماسي',
      facility_id: facilities[0]?.id || '',
      start_date: today,
      end_date: today,
      team_entry_fee: 500,
      max_teams: 16,
      total_prizes: 3000,
      total_sponsorship: 5000,
      estimated_budget: 2000,
      actual_expenses: 0,
      status: 'upcoming',
      organizer_name: 'إدارة النشاط الرياضي',
      notes: '',
    });
    setIsTournamentModalOpen(true);
  };

  const openTournamentDetail = (t: StadiumTournament) => {
    setSelectedTournament(t);
    fetchTeams(t.id);
  };

  const exportTeamsToExcel = () => {
    if (!selectedTournament) return;
    const rows = teams.map(t => ({
      'اسم الفريق': t.team_name,
      'اسم الكابتن / المسؤول': t.captain_name,
      'رقم الهاتف': t.captain_phone,
      'المبلغ المسدد (ج.م)': t.entry_fee_paid,
      'حالة السداد': t.payment_status === 'paid' ? 'مسدد بالكامل' : t.payment_status === 'partial' ? 'سداد جزئي' : 'غير مسدد',
      'طريقة الدفع': t.payment_method === 'cash' ? 'نقدي' : t.payment_method,
      'الترتيب في البطولة': t.ranking || '—',
      'تاريخ التسجيل': t.created_at ? t.created_at.split('T')[0] : '—',
    }));

    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'الفرق المشاركة');
    XLSX.writeFile(wb, `فرق_بطولة_${selectedTournament.name}.xlsx`);
  };

  // Calculation for tournament financial summary
  const totalTeamFeesCollected = teams.reduce((sum, t) => sum + Number(t.entry_fee_paid), 0);
  const totalTournamentRevenue = totalTeamFeesCollected + (selectedTournament ? Number(selectedTournament.total_sponsorship) : 0);
  const totalTournamentCost = selectedTournament ? Number(selectedTournament.actual_expenses) + Number(selectedTournament.total_prizes) : 0;
  const netTournamentProfit = totalTournamentRevenue - totalTournamentCost;

  return (
    <div className="p-6 bg-gray-50 dark:bg-gray-900 min-h-screen text-right" dir="rtl">
      {/* ──────────────── View 1: Tournament Detail View ──────────────── */}
      {selectedTournament ? (
        <div className="space-y-6">
          {/* Header with Back Button */}
          <div className="flex justify-between items-center bg-white dark:bg-gray-800 p-5 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700">
            <div className="flex items-center gap-3">
              <button
                onClick={() => setSelectedTournament(null)}
                className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-xl text-gray-600 dark:text-gray-300"
              >
                <ChevronLeft className="w-6 h-6" />
              </button>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">{selectedTournament.name}</h2>
                  <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold ${TOURNAMENT_STATUS_COLORS[selectedTournament.status]}`}>
                    {TOURNAMENT_STATUS_LABELS[selectedTournament.status]}
                  </span>
                </div>
                <p className="text-xs text-gray-500 mt-0.5">
                  رياضة: {selectedTournament.sport_type} • الفترة: {selectedTournament.start_date} إلى {selectedTournament.end_date}
                </p>
              </div>
            </div>

            <div className="flex gap-2">
              <button
                onClick={exportTeamsToExcel}
                className="flex items-center gap-2 bg-gray-100 hover:bg-gray-200 text-gray-700 dark:bg-gray-700 dark:text-gray-200 px-3.5 py-2 rounded-xl text-xs font-semibold"
              >
                <Download className="w-4 h-4" />
                تصدير الفرق لـ Excel
              </button>

              <button
                onClick={() => {
                  resetTeam({
                    team_name: '',
                    captain_name: '',
                    captain_phone: '',
                    entry_fee_paid: selectedTournament.team_entry_fee,
                    payment_method: 'cash',
                    treasury_account_id: treasuryAccounts[0]?.id || '',
                    notes: '',
                  });
                  setIsTeamModalOpen(true);
                }}
                className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-xl text-xs font-bold shadow-sm transition"
              >
                <Plus className="w-4 h-4" />
                تسجيل فريق جديد في البطولة
              </button>
            </div>
          </div>

          {/* Tournament Financial Performance Card */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="bg-white dark:bg-gray-800 p-4 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700">
              <p className="text-xs text-gray-500">الفرق المسجلة</p>
              <p className="text-2xl font-bold font-mono text-gray-900 dark:text-gray-100 mt-1">
                {teams.length} / {selectedTournament.max_teams}
              </p>
            </div>

            <div className="bg-white dark:bg-gray-800 p-4 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700">
              <p className="text-xs text-gray-500">إجمالي إيراد البطولة (اشتراكات + رعاية)</p>
              <p className="text-2xl font-bold font-mono text-green-600 dark:text-green-400 mt-1">
                {totalTournamentRevenue.toLocaleString('ar-EG')} ج.م
              </p>
            </div>

            <div className="bg-white dark:bg-gray-800 p-4 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700">
              <p className="text-xs text-gray-500">إجمالي تكلفة البطولة (مصروفات + جوائز)</p>
              <p className="text-2xl font-bold font-mono text-red-600 dark:text-red-400 mt-1">
                {totalTournamentCost.toLocaleString('ar-EG')} ج.م
              </p>
            </div>

            <div className="bg-white dark:bg-gray-800 p-4 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700">
              <p className="text-xs text-gray-500">صافي ربح / فائض البطولة</p>
              <p className={`text-2xl font-bold font-mono mt-1 ${netTournamentProfit >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600'}`}>
                {netTournamentProfit.toLocaleString('ar-EG')} ج.م
              </p>
            </div>
          </div>

          {/* Teams Table */}
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
            <div className="p-4 border-b dark:border-gray-700 font-bold text-sm text-gray-800 dark:text-gray-200">
              قائمة الفرق المشاركة ({teams.length})
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-right text-sm">
                <thead className="bg-gray-50 dark:bg-gray-900/50 border-b dark:border-gray-700 text-xs">
                  <tr>
                    <th className="px-5 py-3 font-semibold text-gray-600 dark:text-gray-300">اسم الفريق</th>
                    <th className="px-5 py-3 font-semibold text-gray-600 dark:text-gray-300">الكابتن / المسؤول</th>
                    <th className="px-5 py-3 font-semibold text-gray-600 dark:text-gray-300">الهاتف</th>
                    <th className="px-5 py-3 font-semibold text-gray-600 dark:text-gray-300">المبلغ المسدد</th>
                    <th className="px-5 py-3 font-semibold text-gray-600 dark:text-gray-300">حالة السداد</th>
                    <th className="px-5 py-3 font-semibold text-gray-600 dark:text-gray-300 text-center">الإيصال</th>
                  </tr>
                </thead>
                <tbody className="divide-y dark:divide-gray-700 text-xs">
                  {teamsLoading ? (
                    <tr>
                      <td colSpan={6} className="text-center py-8 text-gray-400">جاري التحميل...</td>
                    </tr>
                  ) : teams.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="text-center py-8 text-gray-400">لم يتم تسجيل فرق في هذه البطولة بعد</td>
                    </tr>
                  ) : (
                    teams.map((t) => (
                      <tr key={t.id} className="hover:bg-gray-50 dark:hover:bg-gray-750">
                        <td className="px-5 py-3.5 font-bold text-gray-900 dark:text-gray-100">{t.team_name}</td>
                        <td className="px-5 py-3.5">{t.captain_name}</td>
                        <td className="px-5 py-3.5 font-mono">{t.captain_phone}</td>
                        <td className="px-5 py-3.5 font-bold font-mono text-green-600">{t.entry_fee_paid.toLocaleString('ar-EG')} ج.م</td>
                        <td className="px-5 py-3.5">
                          <span className={`px-2 py-0.5 rounded text-[11px] font-bold ${
                            t.payment_status === 'paid' ? 'bg-green-100 text-green-800' : 'bg-amber-100 text-amber-800'
                          }`}>
                            {t.payment_status === 'paid' ? 'مسدد بالكامل' : 'سداد جزئي'}
                          </span>
                        </td>
                        <td className="px-5 py-3.5 text-center">
                          <button
                            onClick={() => {
                              setReceiptModalData({
                                receiptNumber: `TRN-${t.id.substring(0, 6).toUpperCase()}`,
                                receiptDate: t.created_at ? t.created_at.split('T')[0] : new Date().toISOString().split('T')[0],
                                receiptTypeLabel: 'إيصال سداد رسوم اشتراك بطولة رياضية',
                                partyName: `${t.team_name} (ك/ ${t.captain_name})`,
                                partyPhone: t.captain_phone,
                                amount: t.entry_fee_paid,
                                paymentMethod: t.payment_method || 'cash',
                                facilityOrProgramName: `بطولة: ${selectedTournament.name}`,
                                notes: `رسوم اشتراك فريق ${t.team_name}`,
                              });
                            }}
                            className="p-1.5 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 rounded-lg text-xs font-semibold inline-flex items-center gap-1"
                          >
                            <Printer className="w-3.5 h-3.5" />
                            طباعة الإيصال
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : (
        /* ──────────────── View 2: All Tournaments Grid ──────────────── */
        <div>
          {/* Top Bar */}
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
            <div>
              <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
                <Trophy className="w-7 h-7 text-amber-500" />
                إدارة البطولات والفعاليات الرياضية (Tournaments & Events)
              </h1>
              <p className="text-xs text-gray-500 mt-1">تنظيم الدوريات والمهرجانات والمسابقات الرياضية ومتابعة تحصيلات الفرق والرعاة وأرباح البطولة</p>
            </div>

            <button
              onClick={openAddTournament}
              className="flex items-center gap-2 bg-amber-500 hover:bg-amber-600 text-white px-4 py-2 rounded-xl text-xs font-bold shadow-sm transition"
            >
              <Plus className="w-4 h-4" />
              إنشاء بطولة جديدة
            </button>
          </div>

          {/* Tournaments Grid */}
          {loading ? (
            <div className="text-center py-16 text-gray-400">جاري تحميل البطولات...</div>
          ) : tournaments.length === 0 ? (
            <div className="bg-white dark:bg-gray-800 p-12 rounded-2xl border border-dashed border-gray-200 dark:border-gray-700 text-center space-y-4">
              <div className="w-16 h-16 bg-amber-50 dark:bg-amber-950/40 rounded-full flex items-center justify-center mx-auto text-amber-500">
                <Trophy className="w-8 h-8" />
              </div>
              <div>
                <h3 className="text-base font-bold text-gray-800 dark:text-gray-200">لا توجد بطولات أو فعاليات مسجلة حالياً</h3>
                <p className="text-xs text-gray-400 mt-1 max-w-md mx-auto">
                  يمكنك تنظيم وإدارة دوريات كرة القدم، بطولات السباحة، والتنس، وتسجيل الفرق المشاركة وتحصيل الرسوم والرعاة بسهولة.
                </p>
              </div>
              <button
                onClick={openAddTournament}
                className="bg-amber-500 hover:bg-amber-600 text-white px-5 py-2.5 rounded-xl font-bold text-xs shadow-md transition inline-flex items-center gap-2"
              >
                <Plus className="w-4 h-4" />
                إنشاء أول بطولة رياضية الآن
              </button>
            </div>
          ) : (

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {tournaments.map((t) => (
                <div
                  key={t.id}
                  onClick={() => openTournamentDetail(t)}
                  className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm hover:shadow-md border border-gray-100 dark:border-gray-700 p-5 cursor-pointer transition flex flex-col justify-between"
                >
                  <div className="space-y-3">
                    <div className="flex justify-between items-start">
                      <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold ${TOURNAMENT_STATUS_COLORS[t.status]}`}>
                        {TOURNAMENT_STATUS_LABELS[t.status]}
                      </span>
                      <span className="text-xs bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200 px-2 py-0.5 rounded-md font-semibold">
                        {t.sport_type}
                      </span>
                    </div>

                    <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100">{t.name}</h3>

                    <div className="text-xs text-gray-500 space-y-1 font-mono">
                      <div className="flex items-center gap-1.5">
                        <Calendar className="w-3.5 h-3.5 text-gray-400" />
                        <span>{t.start_date} إلى {t.end_date}</span>
                      </div>
                      {t.stadium_facilities?.name && (
                        <div className="flex items-center gap-1.5">
                          <Building2 className="w-3.5 h-3.5 text-gray-400" />
                          <span>{t.stadium_facilities.name}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="border-t dark:border-gray-700 pt-3 mt-4 flex justify-between items-center text-xs">
                    <div>
                      <span className="text-gray-400 block text-[10px]">رسوم اشتراك الفريق</span>
                      <strong className="text-sm font-bold text-gray-900 dark:text-gray-100 font-mono">
                        {t.team_entry_fee.toLocaleString('ar-EG')} ج.م
                      </strong>
                    </div>
                    <div>
                      <span className="text-gray-400 block text-[10px]">الجوائز المرصودة</span>
                      <strong className="text-sm font-bold text-amber-600 font-mono">
                        {t.total_prizes.toLocaleString('ar-EG')} ج.م
                      </strong>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ──────────────── Modal 1: Add Tournament ──────────────── */}
      {isTournamentModalOpen && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="flex justify-between items-center p-5 border-b dark:border-gray-800 bg-slate-50 dark:bg-slate-850">
              <h3 className="text-base font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
                <Trophy className="w-5 h-5 text-amber-500" />
                إنشاء بطولة / فعالية رياضية جديدة
              </h3>
              <button onClick={() => setIsTournamentModalOpen(false)} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmitT(onSaveTournament)} className="p-6 space-y-4 overflow-y-auto text-xs">
              <div>
                <label className="block font-bold mb-1">اسم البطولة / المهرجان *</label>
                <input {...registerT('name', { required: true })} placeholder="مثال: بطولة دوري الشركات الصيفي لكرة القدم" className="w-full p-2 border rounded-xl dark:bg-gray-800 dark:border-gray-700" />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block font-bold mb-1">نوع الرياضة</label>
                  <input {...registerT('sport_type')} placeholder="كرة قدم، سباحة، تنس..." className="w-full p-2 border rounded-xl dark:bg-gray-800 dark:border-gray-700" />
                </div>
                <div>
                  <label className="block font-bold mb-1">المرفق / الملعب المخصص</label>
                  <select {...registerT('facility_id')} className="w-full p-2 border rounded-xl dark:bg-gray-800 dark:border-gray-700">
                    <option value="">غير محدد</option>
                    {facilities.map(f => (
                      <option key={f.id} value={f.id}>{f.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block font-bold mb-1">تاريخ البدء *</label>
                  <input type="date" {...registerT('start_date', { required: true })} className="w-full p-2 border rounded-xl dark:bg-gray-800 dark:border-gray-700" />
                </div>
                <div>
                  <label className="block font-bold mb-1">تاريخ النهاية *</label>
                  <input type="date" {...registerT('end_date', { required: true })} className="w-full p-2 border rounded-xl dark:bg-gray-800 dark:border-gray-700" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block font-bold mb-1">رسوم اشتراك الفريق (ج.م)</label>
                  <input type="number" step="0.01" {...registerT('team_entry_fee')} className="w-full p-2 border rounded-xl dark:bg-gray-800 dark:border-gray-700 font-bold text-green-600 font-mono" />
                </div>
                <div>
                  <label className="block font-bold mb-1">أقصى عدد للفرق</label>
                  <input type="number" {...registerT('max_teams')} className="w-full p-2 border rounded-xl dark:bg-gray-800 dark:border-gray-700 font-mono" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block font-bold mb-1">إجمالي الجوائز المالية (ج.م)</label>
                  <input type="number" step="0.01" {...registerT('total_prizes')} className="w-full p-2 border rounded-xl dark:bg-gray-800 dark:border-gray-700 font-bold text-amber-600 font-mono" />
                </div>
                <div>
                  <label className="block font-bold mb-1">إجمالي الرعايات المتوقعة (ج.م)</label>
                  <input type="number" step="0.01" {...registerT('total_sponsorship')} className="w-full p-2 border rounded-xl dark:bg-gray-800 dark:border-gray-700 font-bold text-blue-600 font-mono" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block font-bold mb-1">المصروفات الفعلية / الحكام (ج.م)</label>
                  <input type="number" step="0.01" {...registerT('actual_expenses')} className="w-full p-2 border rounded-xl dark:bg-gray-800 dark:border-gray-700 font-bold text-red-600 font-mono" />
                </div>
                <div>
                  <label className="block font-bold mb-1">حالة البطولة</label>
                  <select {...registerT('status')} className="w-full p-2 border rounded-xl dark:bg-gray-800 dark:border-gray-700">
                    <option value="upcoming">قادمة / تسجيل الفرق</option>
                    <option value="ongoing">جارية حالياً</option>
                    <option value="completed">مكتملة</option>
                    <option value="cancelled">ملغاة</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block font-bold mb-1">الجهة / المشرف المنظم</label>
                <input {...registerT('organizer_name')} className="w-full p-2 border rounded-xl dark:bg-gray-800 dark:border-gray-700" />
              </div>

              <div className="flex justify-end gap-3 pt-3 border-t dark:border-gray-800">
                <button type="button" onClick={() => setIsTournamentModalOpen(false)} className="px-4 py-2 border rounded-xl text-gray-600 hover:bg-gray-100">إلغاء</button>
                <button type="submit" className="px-5 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-xl font-bold shadow transition">حفظ البطولة</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ──────────────── Modal 2: Register Team ──────────────── */}
      {isTeamModalOpen && selectedTournament && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-md overflow-hidden p-6 text-xs">
            <div className="flex justify-between items-center pb-3 mb-4 border-b dark:border-gray-800">
              <h3 className="text-base font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
                <Users className="w-5 h-5 text-emerald-600" />
                تسجيل فريق في بطولة: {selectedTournament.name}
              </h3>
              <button onClick={() => setIsTeamModalOpen(false)} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmitTeam(onSaveTeam)} className="space-y-4">
              <div>
                <label className="block font-bold mb-1">اسم الفريق *</label>
                <input {...registerTeam('team_name', { required: true })} placeholder="مثال: فريق الدلتا الرياضي" className="w-full p-2 border rounded-xl dark:bg-gray-800 dark:border-gray-700" />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block font-bold mb-1">اسم الكابتن / المسؤول *</label>
                  <input {...registerTeam('captain_name', { required: true })} className="w-full p-2 border rounded-xl dark:bg-gray-800 dark:border-gray-700" />
                </div>
                <div>
                  <label className="block font-bold mb-1">رقم الهاتف *</label>
                  <input {...registerTeam('captain_phone', { required: true })} className="w-full p-2 border rounded-xl dark:bg-gray-800 dark:border-gray-700 font-mono" />
                </div>
              </div>

              <div>
                <label className="block font-bold mb-1">المبلغ المسدد (ج.م) *</label>
                <input
                  type="number"
                  step="0.01"
                  {...registerTeam('entry_fee_paid', { required: true })}
                  className="w-full p-2 border rounded-xl dark:bg-gray-800 dark:border-gray-700 font-bold font-mono text-green-600 text-sm"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block font-bold mb-1">طريقة السداد</label>
                  <select {...registerTeam('payment_method')} className="w-full p-2 border rounded-xl dark:bg-gray-800 dark:border-gray-700">
                    <option value="cash">نقداً (خزينة)</option>
                    <option value="card">بطاقة دفع</option>
                    <option value="bank_transfer">تحويل بنكي</option>
                  </select>
                </div>
                <div>
                  <label className="block font-bold mb-1">حساب الخزينة / البنك المستلم</label>
                  <select {...registerTeam('treasury_account_id')} className="w-full p-2 border rounded-xl dark:bg-gray-800 dark:border-gray-700">
                    {treasuryAccounts.map(acc => (
                      <option key={acc.id} value={acc.id}>{acc.name} ({acc.code})</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-3 border-t dark:border-gray-800">
                <button type="button" onClick={() => setIsTeamModalOpen(false)} className="px-4 py-2 border rounded-xl text-gray-600 hover:bg-gray-100">إلغاء</button>
                <button type="submit" className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold shadow transition">تأكيد التسجيل وقيد الإيراد</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ──────────────── Modal 3: Receipt Modal ──────────────── */}
      <ReceiptModal
        isOpen={Boolean(receiptModalData)}
        onClose={() => setReceiptModalData(null)}
        data={receiptModalData}
      />
    </div>
  );
};

export default TournamentManager;

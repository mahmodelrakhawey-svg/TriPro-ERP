import { logger } from '../../../utils/logger';
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
      logger.error(e);
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
      logger.error(e);
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
      logger.error(e);
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


  const onSaveTournament = async (data: Record<string, any>) => {
    if (!orgId) return;
    const payload = {
      organization_id: orgId,
      name: data.name?.trim(),
      sport_type: data.sport_type || 'ÙƒØ±Ø© Ù‚Ø¯Ù…',
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
        toast.error('Ø­Ø¯Ø« Ø®Ø·Ø£ Ø£Ø«Ù†Ø§Ø¡ Ø§Ù„ØªØ­Ø¯ÙŠØ«');
      } else {
        toast.success('ØªÙ… ØªØ­Ø¯ÙŠØ« Ø§Ù„Ø¨Ø·ÙˆÙ„Ø© Ø¨Ù†Ø¬Ø§Ø­');
        setIsTournamentModalOpen(false);
        fetchTournaments();
      }
    } else {
      const { error } = await supabase
        .from('stadium_tournaments')
        .insert([payload]);
      if (error) {
        toast.error('Ø­Ø¯Ø« Ø®Ø·Ø£ Ø£Ø«Ù†Ø§Ø¡ Ø§Ù„Ø¥Ù†Ø´Ø§Ø¡');
      } else {
        toast.success('ØªÙ… Ø¥Ù†Ø´Ø§Ø¡ Ø§Ù„Ø¨Ø·ÙˆÙ„Ø© Ø¨Ù†Ø¬Ø§Ø­');
        setIsTournamentModalOpen(false);
        fetchTournaments();
      }
    }
  };

  const onSaveTeam = async (data: Record<string, any>) => {
    if (!orgId || !selectedTournament) return;
    const today = new Date().toISOString().split('T')[0];
    const amount = parseFloat(data.entry_fee_paid) || 0;

    // 1. ØªÙˆÙ„ÙŠØ¯ Ø§Ù„Ù‚ÙŠØ¯ Ø§Ù„Ù…Ø­Ø§Ø³Ø¨ÙŠ Ù„Ø±Ø³ÙˆÙ… Ø§Ù„Ø§Ø´ØªØ±Ø§Ùƒ
    const jeResult = await createTournamentTeamJournalEntry(
      orgId,
      amount,
      data.team_name?.trim(),
      selectedTournament.name,
      today,
      data.treasury_account_id
    );

    // 2. Ø¥Ø¯Ø±Ø§Ø¬ Ø§Ù„ÙØ±ÙŠÙ‚
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
      toast.error('Ø­Ø¯Ø« Ø®Ø·Ø£ Ø£Ø«Ù†Ø§Ø¡ ØªØ³Ø¬ÙŠÙ„ Ø§Ù„ÙØ±ÙŠÙ‚');
    } else {
      toast.success('ØªÙ… ØªØ³Ø¬ÙŠÙ„ Ø§Ù„ÙØ±ÙŠÙ‚ ÙˆØªÙˆÙ„ÙŠØ¯ Ø§Ù„Ù‚ÙŠØ¯ Ø§Ù„Ù…Ø­Ø§Ø³Ø¨ÙŠ Ø¨Ù†Ø¬Ø§Ø­ ðŸŽ‰');
      setIsTeamModalOpen(false);
      fetchTeams(selectedTournament.id);

      // Open Receipt
      setReceiptModalData({
        receiptNumber: `TRN-${Math.floor(100000 + Math.random() * 900000)}`,
        receiptDate: today,
        receiptTypeLabel: 'Ø¥ÙŠØµØ§Ù„ Ø³Ø¯Ø§Ø¯ Ø±Ø³ÙˆÙ… Ø§Ø´ØªØ±Ø§Ùƒ Ø¨Ø·ÙˆÙ„Ø© Ø±ÙŠØ§Ø¶ÙŠØ©',
        partyName: `${data.team_name} (Ùƒ/ ${data.captain_name})`,
        partyPhone: data.captain_phone,
        amount: amount,
        paymentMethod: data.payment_method || 'cash',
        facilityOrProgramName: `Ø¨Ø·ÙˆÙ„Ø©: ${selectedTournament.name}`,
        notes: `Ø±Ø³ÙˆÙ… Ø§Ø´ØªØ±Ø§Ùƒ Ø§Ù„ÙØ±ÙŠÙ‚ ÙÙŠ Ø¨Ø·ÙˆÙ„Ø© ${selectedTournament.name}`,
      });
    }
  };

  const openAddTournament = () => {
    setEditingTournament(null);
    const today = new Date().toISOString().split('T')[0];
    resetT({
      name: '',
      sport_type: 'ÙƒØ±Ø© Ù‚Ø¯Ù… Ø®Ù…Ø§Ø³ÙŠ',
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
      organizer_name: 'Ø¥Ø¯Ø§Ø±Ø© Ø§Ù„Ù†Ø´Ø§Ø· Ø§Ù„Ø±ÙŠØ§Ø¶ÙŠ',
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
      'Ø§Ø³Ù… Ø§Ù„ÙØ±ÙŠÙ‚': t.team_name,
      'Ø§Ø³Ù… Ø§Ù„ÙƒØ§Ø¨ØªÙ† / Ø§Ù„Ù…Ø³Ø¤ÙˆÙ„': t.captain_name,
      'Ø±Ù‚Ù… Ø§Ù„Ù‡Ø§ØªÙ': t.captain_phone,
      'Ø§Ù„Ù…Ø¨Ù„Øº Ø§Ù„Ù…Ø³Ø¯Ø¯ (Ø¬.Ù…)': t.entry_fee_paid,
      'Ø­Ø§Ù„Ø© Ø§Ù„Ø³Ø¯Ø§Ø¯': t.payment_status === 'paid' ? 'Ù…Ø³Ø¯Ø¯ Ø¨Ø§Ù„ÙƒØ§Ù…Ù„' : t.payment_status === 'partial' ? 'Ø³Ø¯Ø§Ø¯ Ø¬Ø²Ø¦ÙŠ' : 'ØºÙŠØ± Ù…Ø³Ø¯Ø¯',
      'Ø·Ø±ÙŠÙ‚Ø© Ø§Ù„Ø¯ÙØ¹': t.payment_method === 'cash' ? 'Ù†Ù‚Ø¯ÙŠ' : t.payment_method,
      'Ø§Ù„ØªØ±ØªÙŠØ¨ ÙÙŠ Ø§Ù„Ø¨Ø·ÙˆÙ„Ø©': t.ranking || 'â€”',
      'ØªØ§Ø±ÙŠØ® Ø§Ù„ØªØ³Ø¬ÙŠÙ„': t.created_at ? t.created_at.split('T')[0] : 'â€”',
    }));

    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Ø§Ù„ÙØ±Ù‚ Ø§Ù„Ù…Ø´Ø§Ø±ÙƒØ©');
    XLSX.writeFile(wb, `ÙØ±Ù‚_Ø¨Ø·ÙˆÙ„Ø©_${selectedTournament.name}.xlsx`);
  };

  // Calculation for tournament financial summary
  const totalTeamFeesCollected = teams.reduce((sum, t) => sum + Number(t.entry_fee_paid), 0);
  const totalTournamentRevenue = totalTeamFeesCollected + (selectedTournament ? Number(selectedTournament.total_sponsorship) : 0);
  const totalTournamentCost = selectedTournament ? Number(selectedTournament.actual_expenses) + Number(selectedTournament.total_prizes) : 0;
  const netTournamentProfit = totalTournamentRevenue - totalTournamentCost;

  return (
    <div className="p-6 bg-gray-50 dark:bg-gray-900 min-h-screen text-right" dir="rtl">
      {/* â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ View 1: Tournament Detail View â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
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
                  Ø±ÙŠØ§Ø¶Ø©: {selectedTournament.sport_type} â€¢ Ø§Ù„ÙØªØ±Ø©: {selectedTournament.start_date} Ø¥Ù„Ù‰ {selectedTournament.end_date}
                </p>
              </div>
            </div>

            <div className="flex gap-2">
              <button
                onClick={exportTeamsToExcel}
                className="flex items-center gap-2 bg-gray-100 hover:bg-gray-200 text-gray-700 dark:bg-gray-700 dark:text-gray-200 px-3.5 py-2 rounded-xl text-xs font-semibold"
              >
                <Download className="w-4 h-4" />
                ØªØµØ¯ÙŠØ± Ø§Ù„ÙØ±Ù‚ Ù„Ù€ Excel
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
                ØªØ³Ø¬ÙŠÙ„ ÙØ±ÙŠÙ‚ Ø¬Ø¯ÙŠØ¯ ÙÙŠ Ø§Ù„Ø¨Ø·ÙˆÙ„Ø©
              </button>
            </div>
          </div>

          {/* Tournament Financial Performance Card */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="bg-white dark:bg-gray-800 p-4 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700">
              <p className="text-xs text-gray-500">Ø§Ù„ÙØ±Ù‚ Ø§Ù„Ù…Ø³Ø¬Ù„Ø©</p>
              <p className="text-2xl font-bold font-mono text-gray-900 dark:text-gray-100 mt-1">
                {teams.length} / {selectedTournament.max_teams}
              </p>
            </div>

            <div className="bg-white dark:bg-gray-800 p-4 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700">
              <p className="text-xs text-gray-500">Ø¥Ø¬Ù…Ø§Ù„ÙŠ Ø¥ÙŠØ±Ø§Ø¯ Ø§Ù„Ø¨Ø·ÙˆÙ„Ø© (Ø§Ø´ØªØ±Ø§ÙƒØ§Øª + Ø±Ø¹Ø§ÙŠØ©)</p>
              <p className="text-2xl font-bold font-mono text-green-600 dark:text-green-400 mt-1">
                {totalTournamentRevenue.toLocaleString('ar-EG')} Ø¬.Ù…
              </p>
            </div>

            <div className="bg-white dark:bg-gray-800 p-4 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700">
              <p className="text-xs text-gray-500">Ø¥Ø¬Ù…Ø§Ù„ÙŠ ØªÙƒÙ„ÙØ© Ø§Ù„Ø¨Ø·ÙˆÙ„Ø© (Ù…ØµØ±ÙˆÙØ§Øª + Ø¬ÙˆØ§Ø¦Ø²)</p>
              <p className="text-2xl font-bold font-mono text-red-600 dark:text-red-400 mt-1">
                {totalTournamentCost.toLocaleString('ar-EG')} Ø¬.Ù…
              </p>
            </div>

            <div className="bg-white dark:bg-gray-800 p-4 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700">
              <p className="text-xs text-gray-500">ØµØ§ÙÙŠ Ø±Ø¨Ø­ / ÙØ§Ø¦Ø¶ Ø§Ù„Ø¨Ø·ÙˆÙ„Ø©</p>
              <p className={`text-2xl font-bold font-mono mt-1 ${netTournamentProfit >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600'}`}>
                {netTournamentProfit.toLocaleString('ar-EG')} Ø¬.Ù…
              </p>
            </div>
          </div>

          {/* Teams Table */}
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
            <div className="p-4 border-b dark:border-gray-700 font-bold text-sm text-gray-800 dark:text-gray-200">
              Ù‚Ø§Ø¦Ù…Ø© Ø§Ù„ÙØ±Ù‚ Ø§Ù„Ù…Ø´Ø§Ø±ÙƒØ© ({teams.length})
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-right text-sm">
                <thead className="bg-gray-50 dark:bg-gray-900/50 border-b dark:border-gray-700 text-xs">
                  <tr>
                    <th className="px-5 py-3 font-semibold text-gray-600 dark:text-gray-300">Ø§Ø³Ù… Ø§Ù„ÙØ±ÙŠÙ‚</th>
                    <th className="px-5 py-3 font-semibold text-gray-600 dark:text-gray-300">Ø§Ù„ÙƒØ§Ø¨ØªÙ† / Ø§Ù„Ù…Ø³Ø¤ÙˆÙ„</th>
                    <th className="px-5 py-3 font-semibold text-gray-600 dark:text-gray-300">Ø§Ù„Ù‡Ø§ØªÙ</th>
                    <th className="px-5 py-3 font-semibold text-gray-600 dark:text-gray-300">Ø§Ù„Ù…Ø¨Ù„Øº Ø§Ù„Ù…Ø³Ø¯Ø¯</th>
                    <th className="px-5 py-3 font-semibold text-gray-600 dark:text-gray-300">Ø­Ø§Ù„Ø© Ø§Ù„Ø³Ø¯Ø§Ø¯</th>
                    <th className="px-5 py-3 font-semibold text-gray-600 dark:text-gray-300 text-center">Ø§Ù„Ø¥ÙŠØµØ§Ù„</th>
                  </tr>
                </thead>
                <tbody className="divide-y dark:divide-gray-700 text-xs">
                  {teamsLoading ? (
                    <tr>
                      <td colSpan={6} className="text-center py-8 text-gray-400">Ø¬Ø§Ø±ÙŠ Ø§Ù„ØªØ­Ù…ÙŠÙ„...</td>
                    </tr>
                  ) : teams.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="text-center py-8 text-gray-400">Ù„Ù… ÙŠØªÙ… ØªØ³Ø¬ÙŠÙ„ ÙØ±Ù‚ ÙÙŠ Ù‡Ø°Ù‡ Ø§Ù„Ø¨Ø·ÙˆÙ„Ø© Ø¨Ø¹Ø¯</td>
                    </tr>
                  ) : (
                    teams.map((t) => (
                      <tr key={t.id} className="hover:bg-gray-50 dark:hover:bg-gray-750">
                        <td className="px-5 py-3.5 font-bold text-gray-900 dark:text-gray-100">{t.team_name}</td>
                        <td className="px-5 py-3.5">{t.captain_name}</td>
                        <td className="px-5 py-3.5 font-mono">{t.captain_phone}</td>
                        <td className="px-5 py-3.5 font-bold font-mono text-green-600">{t.entry_fee_paid.toLocaleString('ar-EG')} Ø¬.Ù…</td>
                        <td className="px-5 py-3.5">
                          <span className={`px-2 py-0.5 rounded text-[11px] font-bold ${
                            t.payment_status === 'paid' ? 'bg-green-100 text-green-800' : 'bg-amber-100 text-amber-800'
                          }`}>
                            {t.payment_status === 'paid' ? 'Ù…Ø³Ø¯Ø¯ Ø¨Ø§Ù„ÙƒØ§Ù…Ù„' : 'Ø³Ø¯Ø§Ø¯ Ø¬Ø²Ø¦ÙŠ'}
                          </span>
                        </td>
                        <td className="px-5 py-3.5 text-center">
                          <button
                            onClick={() => {
                              setReceiptModalData({
                                receiptNumber: `TRN-${t.id.substring(0, 6).toUpperCase()}`,
                                receiptDate: t.created_at ? t.created_at.split('T')[0] : new Date().toISOString().split('T')[0],
                                receiptTypeLabel: 'Ø¥ÙŠØµØ§Ù„ Ø³Ø¯Ø§Ø¯ Ø±Ø³ÙˆÙ… Ø§Ø´ØªØ±Ø§Ùƒ Ø¨Ø·ÙˆÙ„Ø© Ø±ÙŠØ§Ø¶ÙŠØ©',
                                partyName: `${t.team_name} (Ùƒ/ ${t.captain_name})`,
                                partyPhone: t.captain_phone,
                                amount: t.entry_fee_paid,
                                paymentMethod: t.payment_method || 'cash',
                                facilityOrProgramName: `Ø¨Ø·ÙˆÙ„Ø©: ${selectedTournament.name}`,
                                notes: `Ø±Ø³ÙˆÙ… Ø§Ø´ØªØ±Ø§Ùƒ ÙØ±ÙŠÙ‚ ${t.team_name}`,
                              });
                            }}
                            className="p-1.5 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 rounded-lg text-xs font-semibold inline-flex items-center gap-1"
                          >
                            <Printer className="w-3.5 h-3.5" />
                            Ø·Ø¨Ø§Ø¹Ø© Ø§Ù„Ø¥ÙŠØµØ§Ù„
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
        /* â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ View 2: All Tournaments Grid â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
        <div>
          {/* Top Bar */}
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
            <div>
              <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
                <Trophy className="w-7 h-7 text-amber-500" />
                Ø¥Ø¯Ø§Ø±Ø© Ø§Ù„Ø¨Ø·ÙˆÙ„Ø§Øª ÙˆØ§Ù„ÙØ¹Ø§Ù„ÙŠØ§Øª Ø§Ù„Ø±ÙŠØ§Ø¶ÙŠØ© (Tournaments & Events)
              </h1>
              <p className="text-xs text-gray-500 mt-1">ØªÙ†Ø¸ÙŠÙ… Ø§Ù„Ø¯ÙˆØ±ÙŠØ§Øª ÙˆØ§Ù„Ù…Ù‡Ø±Ø¬Ø§Ù†Ø§Øª ÙˆØ§Ù„Ù…Ø³Ø§Ø¨Ù‚Ø§Øª Ø§Ù„Ø±ÙŠØ§Ø¶ÙŠØ© ÙˆÙ…ØªØ§Ø¨Ø¹Ø© ØªØ­ØµÙŠÙ„Ø§Øª Ø§Ù„ÙØ±Ù‚ ÙˆØ§Ù„Ø±Ø¹Ø§Ø© ÙˆØ£Ø±Ø¨Ø§Ø­ Ø§Ù„Ø¨Ø·ÙˆÙ„Ø©</p>
            </div>

            <button
              onClick={openAddTournament}
              className="flex items-center gap-2 bg-amber-500 hover:bg-amber-600 text-white px-4 py-2 rounded-xl text-xs font-bold shadow-sm transition"
            >
              <Plus className="w-4 h-4" />
              Ø¥Ù†Ø´Ø§Ø¡ Ø¨Ø·ÙˆÙ„Ø© Ø¬Ø¯ÙŠØ¯Ø©
            </button>
          </div>

          {/* Tournaments Grid */}
          {loading ? (
            <div className="text-center py-16 text-gray-400">Ø¬Ø§Ø±ÙŠ ØªØ­Ù…ÙŠÙ„ Ø§Ù„Ø¨Ø·ÙˆÙ„Ø§Øª...</div>
          ) : tournaments.length === 0 ? (
            <div className="bg-white dark:bg-gray-800 p-12 rounded-2xl border border-dashed border-gray-200 dark:border-gray-700 text-center space-y-4">
              <div className="w-16 h-16 bg-amber-50 dark:bg-amber-950/40 rounded-full flex items-center justify-center mx-auto text-amber-500">
                <Trophy className="w-8 h-8" />
              </div>
              <div>
                <h3 className="text-base font-bold text-gray-800 dark:text-gray-200">Ù„Ø§ ØªÙˆØ¬Ø¯ Ø¨Ø·ÙˆÙ„Ø§Øª Ø£Ùˆ ÙØ¹Ø§Ù„ÙŠØ§Øª Ù…Ø³Ø¬Ù„Ø© Ø­Ø§Ù„ÙŠØ§Ù‹</h3>
                <p className="text-xs text-gray-400 mt-1 max-w-md mx-auto">
                  ÙŠÙ…ÙƒÙ†Ùƒ ØªÙ†Ø¸ÙŠÙ… ÙˆØ¥Ø¯Ø§Ø±Ø© Ø¯ÙˆØ±ÙŠØ§Øª ÙƒØ±Ø© Ø§Ù„Ù‚Ø¯Ù…ØŒ Ø¨Ø·ÙˆÙ„Ø§Øª Ø§Ù„Ø³Ø¨Ø§Ø­Ø©ØŒ ÙˆØ§Ù„ØªÙ†Ø³ØŒ ÙˆØªØ³Ø¬ÙŠÙ„ Ø§Ù„ÙØ±Ù‚ Ø§Ù„Ù…Ø´Ø§Ø±ÙƒØ© ÙˆØªØ­ØµÙŠÙ„ Ø§Ù„Ø±Ø³ÙˆÙ… ÙˆØ§Ù„Ø±Ø¹Ø§Ø© Ø¨Ø³Ù‡ÙˆÙ„Ø©.
                </p>
              </div>
              <button
                onClick={openAddTournament}
                className="bg-amber-500 hover:bg-amber-600 text-white px-5 py-2.5 rounded-xl font-bold text-xs shadow-md transition inline-flex items-center gap-2"
              >
                <Plus className="w-4 h-4" />
                Ø¥Ù†Ø´Ø§Ø¡ Ø£ÙˆÙ„ Ø¨Ø·ÙˆÙ„Ø© Ø±ÙŠØ§Ø¶ÙŠØ© Ø§Ù„Ø¢Ù†
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
                        <span>{t.start_date} Ø¥Ù„Ù‰ {t.end_date}</span>
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
                      <span className="text-gray-400 block text-[10px]">Ø±Ø³ÙˆÙ… Ø§Ø´ØªØ±Ø§Ùƒ Ø§Ù„ÙØ±ÙŠÙ‚</span>
                      <strong className="text-sm font-bold text-gray-900 dark:text-gray-100 font-mono">
                        {t.team_entry_fee.toLocaleString('ar-EG')} Ø¬.Ù…
                      </strong>
                    </div>
                    <div>
                      <span className="text-gray-400 block text-[10px]">Ø§Ù„Ø¬ÙˆØ§Ø¦Ø² Ø§Ù„Ù…Ø±ØµÙˆØ¯Ø©</span>
                      <strong className="text-sm font-bold text-amber-600 font-mono">
                        {t.total_prizes.toLocaleString('ar-EG')} Ø¬.Ù…
                      </strong>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ Modal 1: Add Tournament â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      {isTournamentModalOpen && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="flex justify-between items-center p-5 border-b dark:border-gray-800 bg-slate-50 dark:bg-slate-850">
              <h3 className="text-base font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
                <Trophy className="w-5 h-5 text-amber-500" />
                Ø¥Ù†Ø´Ø§Ø¡ Ø¨Ø·ÙˆÙ„Ø© / ÙØ¹Ø§Ù„ÙŠØ© Ø±ÙŠØ§Ø¶ÙŠØ© Ø¬Ø¯ÙŠØ¯Ø©
              </h3>
              <button onClick={() => setIsTournamentModalOpen(false)} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmitT(onSaveTournament)} className="p-6 space-y-4 overflow-y-auto text-xs">
              <div>
                <label className="block font-bold mb-1">Ø§Ø³Ù… Ø§Ù„Ø¨Ø·ÙˆÙ„Ø© / Ø§Ù„Ù…Ù‡Ø±Ø¬Ø§Ù† *</label>
                <input {...registerT('name', { required: true })} placeholder="Ù…Ø«Ø§Ù„: Ø¨Ø·ÙˆÙ„Ø© Ø¯ÙˆØ±ÙŠ Ø§Ù„Ø´Ø±ÙƒØ§Øª Ø§Ù„ØµÙŠÙÙŠ Ù„ÙƒØ±Ø© Ø§Ù„Ù‚Ø¯Ù…" className="w-full p-2 border rounded-xl dark:bg-gray-800 dark:border-gray-700" />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block font-bold mb-1">Ù†ÙˆØ¹ Ø§Ù„Ø±ÙŠØ§Ø¶Ø©</label>
                  <input {...registerT('sport_type')} placeholder="ÙƒØ±Ø© Ù‚Ø¯Ù…ØŒ Ø³Ø¨Ø§Ø­Ø©ØŒ ØªÙ†Ø³..." className="w-full p-2 border rounded-xl dark:bg-gray-800 dark:border-gray-700" />
                </div>
                <div>
                  <label className="block font-bold mb-1">Ø§Ù„Ù…Ø±ÙÙ‚ / Ø§Ù„Ù…Ù„Ø¹Ø¨ Ø§Ù„Ù…Ø®ØµØµ</label>
                  <select {...registerT('facility_id')} className="w-full p-2 border rounded-xl dark:bg-gray-800 dark:border-gray-700">
                    <option value="">ØºÙŠØ± Ù…Ø­Ø¯Ø¯</option>
                    {facilities.map(f => (
                      <option key={f.id} value={f.id}>{f.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block font-bold mb-1">ØªØ§Ø±ÙŠØ® Ø§Ù„Ø¨Ø¯Ø¡ *</label>
                  <input type="date" {...registerT('start_date', { required: true })} className="w-full p-2 border rounded-xl dark:bg-gray-800 dark:border-gray-700" />
                </div>
                <div>
                  <label className="block font-bold mb-1">ØªØ§Ø±ÙŠØ® Ø§Ù„Ù†Ù‡Ø§ÙŠØ© *</label>
                  <input type="date" {...registerT('end_date', { required: true })} className="w-full p-2 border rounded-xl dark:bg-gray-800 dark:border-gray-700" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block font-bold mb-1">Ø±Ø³ÙˆÙ… Ø§Ø´ØªØ±Ø§Ùƒ Ø§Ù„ÙØ±ÙŠÙ‚ (Ø¬.Ù…)</label>
                  <input type="number" step="0.01" {...registerT('team_entry_fee')} className="w-full p-2 border rounded-xl dark:bg-gray-800 dark:border-gray-700 font-bold text-green-600 font-mono" />
                </div>
                <div>
                  <label className="block font-bold mb-1">Ø£Ù‚ØµÙ‰ Ø¹Ø¯Ø¯ Ù„Ù„ÙØ±Ù‚</label>
                  <input type="number" {...registerT('max_teams')} className="w-full p-2 border rounded-xl dark:bg-gray-800 dark:border-gray-700 font-mono" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block font-bold mb-1">Ø¥Ø¬Ù…Ø§Ù„ÙŠ Ø§Ù„Ø¬ÙˆØ§Ø¦Ø² Ø§Ù„Ù…Ø§Ù„ÙŠØ© (Ø¬.Ù…)</label>
                  <input type="number" step="0.01" {...registerT('total_prizes')} className="w-full p-2 border rounded-xl dark:bg-gray-800 dark:border-gray-700 font-bold text-amber-600 font-mono" />
                </div>
                <div>
                  <label className="block font-bold mb-1">Ø¥Ø¬Ù…Ø§Ù„ÙŠ Ø§Ù„Ø±Ø¹Ø§ÙŠØ§Øª Ø§Ù„Ù…ØªÙˆÙ‚Ø¹Ø© (Ø¬.Ù…)</label>
                  <input type="number" step="0.01" {...registerT('total_sponsorship')} className="w-full p-2 border rounded-xl dark:bg-gray-800 dark:border-gray-700 font-bold text-blue-600 font-mono" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block font-bold mb-1">Ø§Ù„Ù…ØµØ±ÙˆÙØ§Øª Ø§Ù„ÙØ¹Ù„ÙŠØ© / Ø§Ù„Ø­ÙƒØ§Ù… (Ø¬.Ù…)</label>
                  <input type="number" step="0.01" {...registerT('actual_expenses')} className="w-full p-2 border rounded-xl dark:bg-gray-800 dark:border-gray-700 font-bold text-red-600 font-mono" />
                </div>
                <div>
                  <label className="block font-bold mb-1">Ø­Ø§Ù„Ø© Ø§Ù„Ø¨Ø·ÙˆÙ„Ø©</label>
                  <select {...registerT('status')} className="w-full p-2 border rounded-xl dark:bg-gray-800 dark:border-gray-700">
                    <option value="upcoming">Ù‚Ø§Ø¯Ù…Ø© / ØªØ³Ø¬ÙŠÙ„ Ø§Ù„ÙØ±Ù‚</option>
                    <option value="ongoing">Ø¬Ø§Ø±ÙŠØ© Ø­Ø§Ù„ÙŠØ§Ù‹</option>
                    <option value="completed">Ù…ÙƒØªÙ…Ù„Ø©</option>
                    <option value="cancelled">Ù…Ù„ØºØ§Ø©</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block font-bold mb-1">Ø§Ù„Ø¬Ù‡Ø© / Ø§Ù„Ù…Ø´Ø±Ù Ø§Ù„Ù…Ù†Ø¸Ù…</label>
                <input {...registerT('organizer_name')} className="w-full p-2 border rounded-xl dark:bg-gray-800 dark:border-gray-700" />
              </div>

              <div className="flex justify-end gap-3 pt-3 border-t dark:border-gray-800">
                <button type="button" onClick={() => setIsTournamentModalOpen(false)} className="px-4 py-2 border rounded-xl text-gray-600 hover:bg-gray-100">Ø¥Ù„ØºØ§Ø¡</button>
                <button type="submit" className="px-5 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-xl font-bold shadow transition">Ø­ÙØ¸ Ø§Ù„Ø¨Ø·ÙˆÙ„Ø©</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ Modal 2: Register Team â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      {isTeamModalOpen && selectedTournament && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-md overflow-hidden p-6 text-xs">
            <div className="flex justify-between items-center pb-3 mb-4 border-b dark:border-gray-800">
              <h3 className="text-base font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
                <Users className="w-5 h-5 text-emerald-600" />
                ØªØ³Ø¬ÙŠÙ„ ÙØ±ÙŠÙ‚ ÙÙŠ Ø¨Ø·ÙˆÙ„Ø©: {selectedTournament.name}
              </h3>
              <button onClick={() => setIsTeamModalOpen(false)} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmitTeam(onSaveTeam)} className="space-y-4">
              <div>
                <label className="block font-bold mb-1">Ø§Ø³Ù… Ø§Ù„ÙØ±ÙŠÙ‚ *</label>
                <input {...registerTeam('team_name', { required: true })} placeholder="Ù…Ø«Ø§Ù„: ÙØ±ÙŠÙ‚ Ø§Ù„Ø¯Ù„ØªØ§ Ø§Ù„Ø±ÙŠØ§Ø¶ÙŠ" className="w-full p-2 border rounded-xl dark:bg-gray-800 dark:border-gray-700" />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block font-bold mb-1">Ø§Ø³Ù… Ø§Ù„ÙƒØ§Ø¨ØªÙ† / Ø§Ù„Ù…Ø³Ø¤ÙˆÙ„ *</label>
                  <input {...registerTeam('captain_name', { required: true })} className="w-full p-2 border rounded-xl dark:bg-gray-800 dark:border-gray-700" />
                </div>
                <div>
                  <label className="block font-bold mb-1">Ø±Ù‚Ù… Ø§Ù„Ù‡Ø§ØªÙ *</label>
                  <input {...registerTeam('captain_phone', { required: true })} className="w-full p-2 border rounded-xl dark:bg-gray-800 dark:border-gray-700 font-mono" />
                </div>
              </div>

              <div>
                <label className="block font-bold mb-1">Ø§Ù„Ù…Ø¨Ù„Øº Ø§Ù„Ù…Ø³Ø¯Ø¯ (Ø¬.Ù…) *</label>
                <input
                  type="number"
                  step="0.01"
                  {...registerTeam('entry_fee_paid', { required: true })}
                  className="w-full p-2 border rounded-xl dark:bg-gray-800 dark:border-gray-700 font-bold font-mono text-green-600 text-sm"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block font-bold mb-1">Ø·Ø±ÙŠÙ‚Ø© Ø§Ù„Ø³Ø¯Ø§Ø¯</label>
                  <select {...registerTeam('payment_method')} className="w-full p-2 border rounded-xl dark:bg-gray-800 dark:border-gray-700">
                    <option value="cash">Ù†Ù‚Ø¯Ø§Ù‹ (Ø®Ø²ÙŠÙ†Ø©)</option>
                    <option value="card">Ø¨Ø·Ø§Ù‚Ø© Ø¯ÙØ¹</option>
                    <option value="bank_transfer">ØªØ­ÙˆÙŠÙ„ Ø¨Ù†ÙƒÙŠ</option>
                  </select>
                </div>
                <div>
                  <label className="block font-bold mb-1">Ø­Ø³Ø§Ø¨ Ø§Ù„Ø®Ø²ÙŠÙ†Ø© / Ø§Ù„Ø¨Ù†Ùƒ Ø§Ù„Ù…Ø³ØªÙ„Ù…</label>
                  <select {...registerTeam('treasury_account_id')} className="w-full p-2 border rounded-xl dark:bg-gray-800 dark:border-gray-700">
                    {treasuryAccounts.map(acc => (
                      <option key={acc.id} value={acc.id}>{acc.name} ({acc.code})</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-3 border-t dark:border-gray-800">
                <button type="button" onClick={() => setIsTeamModalOpen(false)} className="px-4 py-2 border rounded-xl text-gray-600 hover:bg-gray-100">Ø¥Ù„ØºØ§Ø¡</button>
                <button type="submit" className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold shadow transition">ØªØ£ÙƒÙŠØ¯ Ø§Ù„ØªØ³Ø¬ÙŠÙ„ ÙˆÙ‚ÙŠØ¯ Ø§Ù„Ø¥ÙŠØ±Ø§Ø¯</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ Modal 3: Receipt Modal â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      <ReceiptModal
        isOpen={Boolean(receiptModalData)}
        onClose={() => setReceiptModalData(null)}
        data={receiptModalData}
      />
    </div>
  );
};

export default TournamentManager;

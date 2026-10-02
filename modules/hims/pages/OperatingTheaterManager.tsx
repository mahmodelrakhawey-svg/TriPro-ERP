import { logger } from '../../../utils/logger';
import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../../../supabaseClient';
import { useAccounting } from '../../../context/AccountingContext';
import { useToast } from '../../../context/ToastContext';
import * as XLSX from 'xlsx';
import {
  Scissors, Activity, CheckCircle2, Clock, AlertTriangle,
  Plus, Search, Filter, FileSpreadsheet, Printer, Layers,
  HeartPulse, ShieldAlert, ShieldCheck, UserCheck, Calendar,
  Bed, RefreshCw, X, Edit3, Trash2, Sparkles, ChevronRight,
  Eye, FileText, CheckSquare, Zap, AlertCircle
} from 'lucide-react';

export interface SurgeryCase {
  id: string;
  surgery_name: string;
  patient_id?: string;
  patient_name: string;
  mrn: string;
  lead_surgeon: string;
  anesthesiologist: string;
  scrub_nurse?: string;
  room_number: string;
  scheduled_start: string;
  scheduled_end: string;
  status: 'SCHEDULED' | 'PRE_OP' | 'IN_SURGERY' | 'PACU_RECOVERY' | 'COMPLETED' | 'CANCELLED';
  anesthesia_type: 'GENERAL' | 'SPINAL' | 'EPIDURAL' | 'LOCAL' | 'SEDATION';
  who_sign_in: boolean;
  who_time_out: boolean;
  who_sign_out: boolean;
  implants_used?: { item: string; serial: string; lot: string; qty: number }[];
  estimated_blood_loss_ml?: number;
  antibiotic_prophylaxis: boolean;
  notes?: string;
}

const DEFAULT_OR_ROOMS = [
  { id: 'OR-1', name: 'ØºØ±ÙØ© 1 - Ø¬Ø±Ø§Ø­Ø© Ø¹Ø§Ù…Ø© ÙˆÙ…Ù†Ø§Ø¸ÙŠØ±', color: 'indigo', type: 'GENERAL' },
  { id: 'OR-2', name: 'ØºØ±ÙØ© 2 - Ø¹Ø¸Ø§Ù… ÙˆØ¬Ø±Ø§Ø­Ø© Ù…ÙØ§ØµÙ„', color: 'emerald', type: 'ORTHO' },
  { id: 'OR-3', name: 'ØºØ±ÙØ© 3 - Ù‚Ø³Ø·Ø±Ø© ÙˆÙ‚Ù„Ø¨ Ù…ÙØªÙˆØ­', color: 'rose', type: 'CARDIAC' },
  { id: 'OR-4', name: 'ØºØ±ÙØ© 4 - Ù†Ø³Ø§Ø¡ ÙˆÙˆÙ„Ø§Ø¯Ø© ÙˆØ·ÙˆØ§Ø±Ø¦', color: 'amber', type: 'OBGYN' },
  { id: 'PACU', name: 'ÙˆØ­Ø¯Ø© Ø§Ù„Ø¥ÙØ§Ù‚Ø© ÙˆØ±Ø¹Ø§ÙŠØ© Ù…Ø§ Ø¨Ø¹Ø¯ Ø§Ù„Ø¬Ø±Ø§Ø­Ø© (PACU)', color: 'cyan', type: 'RECOVERY' }
];

export default function OperatingTheaterManager() {
  const { organization, currentSelectedOrgId, currentUser } = useAccounting();
  const { showToast } = useToast();
  const orgId = organization?.id || currentSelectedOrgId || currentUser?.organization_id;

  const [cases, setCases] = useState<SurgeryCase[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [selectedRoom, setSelectedRoom] = useState('ALL');

  // Active Surgery for WHO Checklist & Execution Modal
  const [selectedCaseForChecklist, setSelectedCaseForChecklist] = useState<SurgeryCase | null>(null);
  const [isNewBookingModalOpen, setIsNewBookingModalOpen] = useState(false);

  // New Surgery Form State
  const [newCaseForm, setNewCaseForm] = useState({
    surgery_name: 'Ø§Ø³ØªØ¦ØµØ§Ù„ Ø§Ù„Ø²Ø§Ø¦Ø¯Ø© Ø§Ù„Ø¯ÙˆØ¯ÙŠØ© Ø¨Ø§Ù„Ù…Ù†Ø¸Ø§Ø± (Laparoscopic Appendectomy)',
    patient_name: 'Ø£Ø­Ù…Ø¯ Ù…Ø­Ù…ÙˆØ¯ Ø¹Ø¨Ø¯ Ø§Ù„Ø¹Ø²ÙŠØ²',
    mrn: 'MRN-2026-904',
    lead_surgeon: 'Ø¯. Ø·Ø§Ø±Ù‚ Ø§Ù„Ø³Ø¹ÙŠØ¯ (Ø§Ø³ØªØ´Ø§Ø±ÙŠ Ø¬Ø±Ø§Ø­Ø© Ø¹Ø§Ù…Ø©)',
    anesthesiologist: 'Ø¯. ÙˆØ§Ø¦Ù„ Ø­Ø³Ù†ÙŠ (Ø§Ø³ØªØ´Ø§Ø±ÙŠ ØªØ®Ø¯ÙŠØ±)',
    scrub_nurse: 'Ù…/ Ù…Ø±ÙˆØ© ÙŠÙˆØ³Ù',
    room_number: 'OR-1',
    scheduled_start: new Date().toISOString().slice(0, 16),
    scheduled_end: new Date(Date.now() + 2 * 3600000).toISOString().slice(0, 16),
    anesthesia_type: 'GENERAL' as 'GENERAL' | 'SPINAL' | 'EPIDURAL' | 'LOCAL' | 'SEDATION',
    antibiotic_prophylaxis: true,
    notes: 'ØªØ­Ø¶ÙŠØ± Ù…Ø³Ø¨Ù‚ - ØµÙŠØ§Ù… 8 Ø³Ø§Ø¹Ø§Øª - Ø§Ø®ØªØ¨Ø§Ø± Ø­Ø³Ø§Ø³ÙŠØ© Ø§Ù„Ø¨Ù†Ø³Ù„ÙŠÙ† Ø³Ù„ÙŠÙ…'
  });

  // Fetch Surgeries Data
  const fetchData = async () => {
    if (!orgId) return;
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('hims_surgeries')
        .select('*, doctor:lead_surgeon_id(profiles(full_name)), hims_visits(id, hims_patients(id, full_name))')
        .eq('organization_id', orgId)
        .order('scheduled_start', { ascending: true });

      if (error) {
        logger.warn('hims_surgeries query notice:', error.message);
        setCases([]);
      } else if (data && data.length > 0) {
        const mapped: SurgeryCase[] = data.map((d: Record<string, any>, idx: number) => ({
          id: d.id,
          surgery_name: d.surgery_name || 'Ø¹Ù…Ù„ÙŠØ© Ø¬Ø±Ø§Ø­ÙŠØ©',
          patient_id: d.hims_visits?.hims_patients?.id,
          patient_name: d.hims_visits?.hims_patients?.full_name || 'Ù…Ø±ÙŠØ¶ Ø¬Ø±Ø§Ø­Ø©',
          mrn: `MRN-${1000 + idx}`,
          lead_surgeon: d.doctor?.profiles?.full_name || 'Ø§Ø³ØªØ´Ø§Ø±ÙŠ Ø§Ù„Ø¬Ø±Ø§Ø­Ø©',
          anesthesiologist: d.anaesthetist_name || 'Ø§Ø³ØªØ´Ø§Ø±ÙŠ Ø§Ù„ØªØ®Ø¯ÙŠØ±',
          room_number: d.room_number || DEFAULT_OR_ROOMS[idx % DEFAULT_OR_ROOMS.length].id,
          scheduled_start: d.scheduled_start || new Date().toISOString(),
          scheduled_end: d.scheduled_end || new Date(Date.now() + 2 * 3600000).toISOString(),
          status: (d.status?.toUpperCase() || 'SCHEDULED') as any,
          anesthesia_type: 'GENERAL',
          who_sign_in: true,
          who_time_out: d.status === 'in_progress' || d.status === 'completed',
          who_sign_out: d.status === 'completed',
          antibiotic_prophylaxis: true,
          notes: d.notes || ''
        }));
        setCases(mapped);
      } else {
        setCases([]);
      }
    } catch (err) {
      logger.warn('Error fetching surgeries:', err.message);
      setCases([]);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [orgId]);

  // Filtered Cases
  const filteredCases = useMemo(() => {
    return cases.filter(c => {
      const matchSearch =
        c.surgery_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        c.patient_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        c.lead_surgeon.toLowerCase().includes(searchTerm.toLowerCase()) ||
        c.mrn.toLowerCase().includes(searchTerm.toLowerCase());
      const matchStatus = statusFilter === 'ALL' || c.status === statusFilter;
      const matchRoom = selectedRoom === 'ALL' || c.room_number === selectedRoom;
      return matchSearch && matchStatus && matchRoom;
    });
  }, [cases, searchTerm, statusFilter, selectedRoom]);

  // Advance Surgery State (Sign In -> Time Out -> Sign Out -> PACU -> Discharge)
  const handleAdvanceState = (caseItem: SurgeryCase) => {
    let nextStatus: SurgeryCase['status'] = caseItem.status;
    let updatedSignIn = caseItem.who_sign_in;
    let updatedTimeOut = caseItem.who_time_out;
    let updatedSignOut = caseItem.who_sign_out;

    if (caseItem.status === 'SCHEDULED') {
      nextStatus = 'PRE_OP';
      updatedSignIn = true;
    } else if (caseItem.status === 'PRE_OP') {
      nextStatus = 'IN_SURGERY';
      updatedTimeOut = true;
    } else if (caseItem.status === 'IN_SURGERY') {
      nextStatus = 'PACU_RECOVERY';
      updatedSignOut = true;
    } else if (caseItem.status === 'PACU_RECOVERY') {
      nextStatus = 'COMPLETED';
    }

    setCases(prev => prev.map(c => c.id === caseItem.id ? {
      ...c,
      status: nextStatus,
      who_sign_in: updatedSignIn,
      who_time_out: updatedTimeOut,
      who_sign_out: updatedSignOut
    } : c));

    showToast(`ØªÙ… Ù†Ù‚Ù„ Ø­Ø§Ù„Ø© Ø§Ù„Ù…Ø±ÙŠØ¶ Ø¥Ù„Ù‰ Ù…Ø±Ø­Ù„Ø© [${nextStatus}] Ø¨Ù†Ø¬Ø§Ø­ ðŸ©º`, 'success');
  };

  // Add New Booking
  const handleCreateNewBooking = async (e: React.FormEvent) => {
    e.preventDefault();
    const newCase: SurgeryCase = {
      id: `sur-${Date.now()}`,
      surgery_name: newCaseForm.surgery_name,
      patient_name: newCaseForm.patient_name,
      mrn: newCaseForm.mrn,
      lead_surgeon: newCaseForm.lead_surgeon,
      anesthesiologist: newCaseForm.anesthesiologist,
      scrub_nurse: newCaseForm.scrub_nurse,
      room_number: newCaseForm.room_number,
      scheduled_start: newCaseForm.scheduled_start,
      scheduled_end: newCaseForm.scheduled_end,
      status: 'SCHEDULED',
      anesthesia_type: newCaseForm.anesthesia_type,
      who_sign_in: false,
      who_time_out: false,
      who_sign_out: false,
      antibiotic_prophylaxis: newCaseForm.antibiotic_prophylaxis,
      notes: newCaseForm.notes
    };

    setCases(prev => [newCase, ...prev]);
    setIsNewBookingModalOpen(false);
    showToast(`ØªÙ… Ø­Ø¬Ø² ÙˆØ¬Ø¯ÙˆÙ„Ø© Ø§Ù„Ø¹Ù…Ù„ÙŠØ© Ø§Ù„Ø¬Ø±Ø§Ø­ÙŠØ© ÙÙŠ ${newCaseForm.room_number} Ø¨Ù†Ø¬Ø§Ø­ âœ…`, 'success');
  };

  // Export Excel
  const handleExportExcel = () => {
    const exportData = filteredCases.map(c => ({
      'Ø§Ø³Ù… Ø§Ù„Ù…Ø±ÙŠØ¶': c.patient_name,
      'Ø±Ù‚Ù… Ø§Ù„Ù…Ù„Ù (MRN)': c.mrn,
      'Ø§Ø³Ù… Ø§Ù„Ø¹Ù…Ù„ÙŠØ© Ø§Ù„Ø¬Ø±Ø§Ø­ÙŠØ©': c.surgery_name,
      'Ø§Ù„Ø¬Ø±Ø§Ø­ Ø§Ù„Ø±Ø¦ÙŠØ³ÙŠ': c.lead_surgeon,
      'Ø§Ø³ØªØ´Ø§Ø±ÙŠ Ø§Ù„ØªØ®Ø¯ÙŠØ±': c.anesthesiologist,
      'ØºØ±ÙØ© Ø§Ù„Ø¹Ù…Ù„ÙŠØ§Øª': c.room_number,
      'Ø§Ù„Ù…ÙˆØ¹Ø¯ Ø§Ù„Ù…Ø¬Ø¯ÙˆÙ„': `${c.scheduled_start} Ø¥Ù„Ù‰ ${c.scheduled_end}`,
      'Ù†ÙˆØ¹ Ø§Ù„ØªØ®Ø¯ÙŠØ±': c.anesthesia_type,
      'Ø§Ù„Ø­Ø§Ù„Ø© Ø§Ù„Ø­Ø§Ù„ÙŠØ©': c.status,
      'Sign In (WHO)': c.who_sign_in ? 'Ù…ÙƒØªÙ…Ù„' : 'Ù…Ø¹Ù„Ù‚',
      'Time Out (WHO)': c.who_time_out ? 'Ù…ÙƒØªÙ…Ù„' : 'Ù…Ø¹Ù„Ù‚',
      'Sign Out (WHO)': c.who_sign_out ? 'Ù…ÙƒØªÙ…Ù„' : 'Ù…Ø¹Ù„Ù‚',
      'Ù…Ù„Ø§Ø­Ø¸Ø§Øª': c.notes || ''
    }));

    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Ø¬Ø¯ÙˆÙ„_Ø§Ù„Ø¹Ù…Ù„ÙŠØ§Øª_Ø§Ù„Ø¬Ø±Ø§Ø­ÙŠØ©');
    XLSX.writeFile(wb, `Operating_Theater_Schedule_${new Date().toISOString().split('T')[0]}.xlsx`);
    showToast('ØªÙ… ØªØµØ¯ÙŠØ± Ø³Ø¬Ù„ Ø¬Ù†Ø§Ø­ Ø§Ù„Ø¹Ù…Ù„ÙŠØ§Øª Ø¨Ù†Ø¬Ø§Ø­ ðŸ“Š', 'success');
  };

  // KPIs
  const totalCases = cases.length;
  const inSurgeryCount = cases.filter(c => c.status === 'IN_SURGERY').length;
  const inPACUCount = cases.filter(c => c.status === 'PACU_RECOVERY').length;
  const completedCount = cases.filter(c => c.status === 'COMPLETED').length;

  return (
    <div className="p-6 bg-slate-900 min-h-screen text-slate-100 font-sans select-none" dir="rtl">
      
      {/* ðŸ·ï¸ Top Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-black text-white flex items-center gap-3">
            <Scissors className="text-emerald-400" size={28} />
            Ø¬Ù†Ø§Ø­ ÙˆØ§Ø³ØªÙ‚Ø¨Ø§Ù„ ØºØ±Ù Ø§Ù„Ø¹Ù…Ù„ÙŠØ§Øª Ø§Ù„Ø¬Ø±Ø§Ø­ÙŠØ© (Operating Theater & Surgical Suite)
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Ø¥Ø¯Ø§Ø±Ø© ØªØ¯ÙÙ‚ Ø§Ù„Ù…Ø±Ø¶Ù‰ØŒ Ù‚Ø§Ø¦Ù…Ø© Ø§Ù„Ø£Ù…Ø§Ù† Ø§Ù„Ø¬Ø±Ø§Ø­ÙŠ Ø§Ù„Ø¹Ø§Ù„Ù…ÙŠØ© (WHO Checklist)ØŒ Ø¬Ø¯ÙˆÙ„Ø© ØºØ±Ù Ø§Ù„Ø¹Ù…Ù„ÙŠØ§ØªØŒ ÙˆØ±Ø¹Ø§ÙŠØ© Ù…Ø§ Ø¨Ø¹Ø¯ Ø§Ù„Ø¬Ø±Ø§Ø­Ø© (PACU).
          </p>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          <button
            onClick={() => setIsNewBookingModalOpen(true)}
            className="px-4 py-2 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white rounded-xl font-black text-xs shadow-lg shadow-emerald-600/20 transition-all flex items-center gap-1.5"
          >
            <Plus size={15} />
            Ø­Ø¬Ø² ÙˆØ¬Ø¯ÙˆÙ„Ø© Ø¹Ù…Ù„ÙŠØ© Ø¬Ø¯ÙŠØ¯Ø©
          </button>

          <button
            onClick={handleExportExcel}
            className="p-2 bg-slate-800 hover:bg-slate-750 border border-slate-700 rounded-xl text-slate-300 hover:text-white transition-all"
            title="ØªØµØ¯ÙŠØ± Ø¥ÙƒØ³ÙŠÙ„"
          >
            <FileSpreadsheet size={16} />
          </button>

          <button
            onClick={() => window.print()}
            className="p-2 bg-slate-800 hover:bg-slate-750 border border-slate-700 rounded-xl text-slate-300 hover:text-white transition-all"
            title="Ø·Ø¨Ø§Ø¹Ø© Ø§Ù„Ø¬Ø¯ÙˆÙ„ Ø§Ù„ÙŠÙˆÙ…ÙŠ"
          >
            <Printer size={16} />
          </button>

          <button
            onClick={fetchData}
            className="p-2 bg-slate-800 hover:bg-slate-750 border border-slate-700 rounded-xl text-slate-400 hover:text-white transition-all"
            title="ØªØ­Ø¯ÙŠØ« Ø§Ù„Ø¨ÙŠØ§Ù†Ø§Øª"
          >
            <RefreshCw size={15} className={isLoading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* ðŸ“Š KPI Metric Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5 mb-6">
        <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800 space-y-1">
          <span className="text-slate-400 text-xs font-bold flex items-center gap-1.5">
            <Calendar size={14} className="text-emerald-400" /> Ø¥Ø¬Ù…Ø§Ù„ÙŠ Ø¹Ù…Ù„ÙŠØ§Øª Ø§Ù„ÙŠÙˆÙ…
          </span>
          <div className="text-xl font-black font-mono text-white">{totalCases} <span className="text-xs font-normal text-slate-500">Ø­Ø§Ù„Ø© Ø¬Ø±Ø§Ø­ÙŠØ©</span></div>
        </div>

        <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800 space-y-1">
          <span className="text-slate-400 text-xs font-bold flex items-center gap-1.5">
            <Activity size={14} className="text-indigo-400" /> Ø¯Ø§Ø®Ù„ ØºØ±Ù Ø§Ù„Ø¹Ù…Ù„ÙŠØ§Øª Ø§Ù„Ø¢Ù†
          </span>
          <div className="text-xl font-black font-mono text-indigo-400">{inSurgeryCount} <span className="text-xs font-normal text-slate-500">ØªØ­Øª Ø§Ù„ØªØ®Ø¯ÙŠØ± ÙˆØ§Ù„Ø¬Ø±Ø§Ø­Ø©</span></div>
        </div>

        <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800 space-y-1">
          <span className="text-slate-400 text-xs font-bold flex items-center gap-1.5">
            <Bed size={14} className="text-cyan-400" /> ÙÙŠ Ø§Ù„Ø¥ÙØ§Ù‚Ø© (PACU)
          </span>
          <div className="text-xl font-black font-mono text-cyan-400">{inPACUCount} <span className="text-xs font-normal text-slate-500">ØªØ­Øª Ø§Ù„Ù…Ù„Ø§Ø­Ø¸Ø©</span></div>
        </div>

        <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800 space-y-1">
          <span className="text-slate-400 text-xs font-bold flex items-center gap-1.5">
            <CheckCircle2 size={14} className="text-emerald-400" /> Ù…ÙƒØªÙ…Ù„Ø© Ø¨Ù†Ø¬Ø§Ø­
          </span>
          <div className="text-xl font-black font-mono text-emerald-400">{completedCount} <span className="text-xs font-normal text-slate-500">Ø­Ø§Ù„Ø© Ù…Ù†ØªÙ‡ÙŠØ©</span></div>
        </div>
      </div>

      {/* ðŸŽ›ï¸ Search & Filter Controls */}
      <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800 flex flex-col md:flex-row justify-between items-center gap-3 mb-6">
        <div className="flex items-center gap-2 w-full md:w-auto flex-1 max-w-xl">
          <div className="relative flex-1">
            <Search size={15} className="absolute right-3 top-3 text-slate-500" />
            <input
              type="text"
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              placeholder="Ø¨Ø­Ø« Ø¨Ø§Ø³Ù… Ø§Ù„Ù…Ø±ÙŠØ¶ØŒ Ø±Ù‚Ù… Ø§Ù„Ù…Ù„Ù MRNØŒ Ø§Ù„Ø¹Ù…Ù„ÙŠØ© Ø§Ù„Ø¬Ø±Ø§Ø­ÙŠØ©ØŒ Ø§Ù„Ø¬Ø±Ø§Ø­..."
              className="w-full bg-slate-900 border border-slate-800 rounded-xl pr-9 pl-4 py-2 text-xs text-white placeholder:text-slate-600 outline-none focus:border-emerald-500"
            />
          </div>

          <select
            value={selectedRoom}
            onChange={e => setSelectedRoom(e.target.value)}
            className="bg-slate-900 border border-slate-800 text-xs text-slate-300 rounded-xl px-3 py-2 outline-none"
          >
            <option value="ALL">Ø¬Ù…ÙŠØ¹ ØºØ±Ù Ø§Ù„Ø¹Ù…Ù„ÙŠØ§Øª (All ORs)</option>
            {DEFAULT_OR_ROOMS.map(r => (
              <option key={r.id} value={r.id}>{r.name}</option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-1 bg-slate-900 p-1 rounded-xl border border-slate-800 text-xs">
          <button
            onClick={() => setStatusFilter('ALL')}
            className={`px-3 py-1 rounded-lg font-bold transition-all ${statusFilter === 'ALL' ? 'bg-emerald-600 text-white' : 'text-slate-400 hover:text-white'}`}
          >
            Ø§Ù„ÙƒÙ„
          </button>
          <button
            onClick={() => setStatusFilter('IN_SURGERY')}
            className={`px-3 py-1 rounded-lg font-bold transition-all ${statusFilter === 'IN_SURGERY' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'}`}
          >
            Ù‚ÙŠØ¯ Ø§Ù„Ø¬Ø±Ø§Ø­Ø© âš™ï¸
          </button>
          <button
            onClick={() => setStatusFilter('PACU_RECOVERY')}
            className={`px-3 py-1 rounded-lg font-bold transition-all ${statusFilter === 'PACU_RECOVERY' ? 'bg-cyan-600 text-white' : 'text-slate-400 hover:text-white'}`}
          >
            Ø§Ù„Ø¥ÙØ§Ù‚Ø© ðŸ›Œ
          </button>
        </div>
      </div>

      {/* ðŸ¥ SURGERIES & OR RECEPTION BOARD */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
        {filteredCases.map((c) => {
          const isInSurgery = c.status === 'IN_SURGERY';
          const isPACU = c.status === 'PACU_RECOVERY';
          const isCompleted = c.status === 'COMPLETED';

          return (
            <div
              key={c.id}
              className={`p-5 rounded-2xl border transition-all shadow-xl flex flex-col justify-between space-y-4 ${
                isInSurgery ? 'bg-slate-950 border-indigo-500/80 shadow-indigo-950/30' :
                isPACU ? 'bg-slate-950 border-cyan-500/80 shadow-cyan-950/30' :
                isCompleted ? 'bg-slate-950/80 border-slate-800 opacity-90' :
                'bg-slate-950 border-slate-800'
              }`}
            >
              <div>
                {/* Header Room Tag & Status */}
                <div className="flex justify-between items-center mb-2.5">
                  <span className="text-[11px] font-black px-2.5 py-1 rounded-xl bg-slate-900 border border-slate-800 text-emerald-400">
                    ðŸ¥ {c.room_number}
                  </span>
                  
                  <span className={`text-[10px] font-black px-2.5 py-1 rounded-xl flex items-center gap-1 ${
                    isInSurgery ? 'bg-indigo-900/80 text-indigo-300 border border-indigo-700 animate-pulse' :
                    isPACU ? 'bg-cyan-900/80 text-cyan-300 border border-cyan-700' :
                    isCompleted ? 'bg-emerald-900/80 text-emerald-300 border border-emerald-700' :
                    'bg-slate-800 text-slate-400'
                  }`}>
                    {isInSurgery ? 'âš™ï¸ Ù‚ÙŠØ¯ Ø§Ù„Ø¬Ø±Ø§Ø­Ø© ÙˆØ§Ù„ØªØ®Ø¯ÙŠØ±' :
                     isPACU ? 'ðŸ›Œ Ø±Ø¹Ø§ÙŠØ© Ø§Ù„Ø¥ÙØ§Ù‚Ø© (PACU)' :
                     isCompleted ? 'âœ… Ù…Ù†ØªÙ‡ÙŠØ©' : 'ðŸ“… Ù…Ø¬Ø¯ÙˆÙ„Ø© ÙˆÙ…Ø¬Ù‡Ø²Ø©'}
                  </span>
                </div>

                {/* Patient & Surgery Title */}
                <h3 className="text-sm font-black text-white">{c.surgery_name}</h3>
                
                <div className="flex items-center gap-2 text-xs text-slate-300 font-bold mt-1">
                  <span>Ø§Ù„Ù…Ø±ÙŠØ¶: {c.patient_name}</span>
                  <span className="font-mono text-[10px] text-slate-500">({c.mrn})</span>
                </div>

                {/* Team Info */}
                <div className="text-[11px] text-slate-400 space-y-0.5 mt-3 pt-3 border-t border-slate-850">
                  <div>ðŸ‘¨â€âš•ï¸ Ø§Ù„Ø¬Ø±Ø§Ø­: <span className="text-slate-200 font-bold">{c.lead_surgeon}</span></div>
                  <div>ðŸ’‰ Ø§Ù„ØªØ®Ø¯ÙŠØ±: <span className="text-slate-200 font-bold">{c.anesthesiologist}</span> ({c.anesthesia_type})</div>
                  <div>ðŸ•’ Ø§Ù„Ù…ÙˆØ¹Ø¯: <span className="font-mono text-slate-300">{c.scheduled_start.slice(11, 16)} â¬…ï¸ {c.scheduled_end.slice(11, 16)}</span></div>
                </div>

                {/* WHO Checklist Indicators */}
                <div className="mt-3 pt-3 border-t border-slate-850 flex items-center justify-between text-[10px] font-bold">
                  <span className="text-slate-500">WHO Checklist:</span>
                  <div className="flex items-center gap-1.5">
                    <span className={`px-1.5 py-0.5 rounded ${c.who_sign_in ? 'bg-emerald-950 text-emerald-400 border border-emerald-800' : 'bg-slate-900 text-slate-600'}`}>
                      {c.who_sign_in ? 'âœ“ Sign In' : 'Sign In'}
                    </span>
                    <span className={`px-1.5 py-0.5 rounded ${c.who_time_out ? 'bg-emerald-950 text-emerald-400 border border-emerald-800' : 'bg-slate-900 text-slate-600'}`}>
                      {c.who_time_out ? 'âœ“ Time Out' : 'Time Out'}
                    </span>
                    <span className={`px-1.5 py-0.5 rounded ${c.who_sign_out ? 'bg-emerald-950 text-emerald-400 border border-emerald-800' : 'bg-slate-900 text-slate-600'}`}>
                      {c.who_sign_out ? 'âœ“ Sign Out' : 'Sign Out'}
                    </span>
                  </div>
                </div>

                {/* Implants & Special Notes */}
                {c.implants_used && c.implants_used.length > 0 && (
                  <div className="mt-2.5 p-2 bg-slate-900/90 rounded-xl border border-slate-800 text-[10px] text-amber-400">
                    âš™ï¸ <strong>Ù…Ø³ØªÙ„Ø²Ù…Ø§Øª Ù…Ø²Ø±ÙˆØ¹Ø© (Implant):</strong> {c.implants_used[0].item} ({c.implants_used[0].serial})
                  </div>
                )}
              </div>

              {/* Action Buttons */}
              <div className="pt-2 border-t border-slate-850 flex items-center gap-2">
                <button
                  onClick={() => setSelectedCaseForChecklist(c)}
                  className="flex-1 py-2 bg-slate-900 hover:bg-slate-800 border border-slate-800 rounded-xl text-xs font-bold text-slate-300 hover:text-white transition-all flex items-center justify-center gap-1.5"
                >
                  <ShieldCheck size={14} className="text-emerald-400" />
                  Ù‚Ø§Ø¦Ù…Ø© Ø§Ù„Ø£Ù…Ø§Ù† (WHO)
                </button>

                {!isCompleted && (
                  <button
                    onClick={() => handleAdvanceState(c)}
                    className="py-2 px-3 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-black shadow-lg shadow-emerald-600/20 transition-all flex items-center justify-center gap-1"
                    title="Ù†Ù‚Ù„ Ù„Ù„Ù…Ø±Ø­Ù„Ø© Ø§Ù„ØªØ§Ù„ÙŠØ©"
                  >
                    <span>Ø§Ù„Ù…Ø±Ø­Ù„Ø© Ø§Ù„ØªØ§Ù„ÙŠØ©</span>
                    <ChevronRight size={14} />
                  </button>
                )}
              </div>

            </div>
          );
        })}
      </div>

      {/* ðŸ›¡ï¸ WHO SURGICAL SAFETY CHECKLIST MODAL */}
      {selectedCaseForChecklist && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4" dir="rtl">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-2xl w-full p-6 space-y-4 shadow-2xl">
            <div className="flex justify-between items-center pb-3 border-b border-slate-800">
              <h2 className="font-black text-white text-base flex items-center gap-2">
                <ShieldCheck size={20} className="text-emerald-400" />
                Ù‚Ø§Ø¦Ù…Ø© Ø§Ù„Ø£Ù…Ø§Ù† Ø§Ù„Ø¬Ø±Ø§Ø­ÙŠ Ø§Ù„Ø¹Ø§Ù„Ù…ÙŠØ© (WHO Surgical Safety Checklist)
              </h2>
              <button onClick={() => setSelectedCaseForChecklist(null)} className="text-slate-400 hover:text-white">
                <X size={18} />
              </button>
            </div>

            <div className="space-y-4 text-xs">
              {/* Section 1: SIGN IN (Before Induction) */}
              <div className="p-3.5 bg-slate-950 rounded-xl border border-slate-800 space-y-2">
                <span className="font-black text-emerald-400 text-xs block">1. Ù‚Ø¨Ù„ Ø§Ù„ØªØ®Ø¯ÙŠØ± (SIGN IN)</span>
                <div className="space-y-1.5 text-slate-300">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={selectedCaseForChecklist.who_sign_in} readOnly className="accent-emerald-500" />
                    <span>ØªÙ… ØªØ£ÙƒÙŠØ¯ Ù‡ÙˆÙŠØ© Ø§Ù„Ù…Ø±ÙŠØ¶ ÙˆÙ…ÙˆÙ‚Ø¹ Ø§Ù„Ø¬Ø±Ø§Ø­Ø© ÙˆØ§Ù„Ø¥Ù‚Ø±Ø§Ø± Ø§Ù„Ø·Ø¨ÙŠ Ø§Ù„Ù…ÙˆÙ‚Ø¹</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={selectedCaseForChecklist.who_sign_in} readOnly className="accent-emerald-500" />
                    <span>ÙØ­Øµ Ø¬Ù‡Ø§Ø² Ø§Ù„ØªØ®Ø¯ÙŠØ± ÙˆØ£Ø¯ÙˆÙŠØ© Ø§Ù„Ø·ÙˆØ§Ø±Ø¦ ÙˆÙ…Ù‚ÙŠØ§Ø³ Ø§Ù„Ø£ÙƒØ³Ø¬ÙŠÙ† ÙŠØ¹Ù…Ù„</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={selectedCaseForChecklist.who_sign_in} readOnly className="accent-emerald-500" />
                    <span>ÙØ­Øµ Ø®Ø·Ø± Ø§Ù„Ø­Ø³Ø§Ø³ÙŠØ© ÙˆÙ…Ø¬Ø±Ù‰ Ø§Ù„Ù‡ÙˆØ§Ø¡ ÙˆØµØ¹ÙˆØ¨Ø© Ø§Ù„ØªÙ†Ø¨ÙŠØ¨ ÙˆØ§Ù„Ù†Ø²ÙŠÙ Ø§Ù„Ù…ØªÙˆÙ‚Ø¹</span>
                  </label>
                </div>
              </div>

              {/* Section 2: TIME OUT (Before Skin Incision) */}
              <div className="p-3.5 bg-slate-950 rounded-xl border border-slate-800 space-y-2">
                <span className="font-black text-indigo-400 text-xs block">2. Ù‚Ø¨Ù„ Ø´Ù‚ Ø§Ù„Ø¬Ù„Ø¯ (TIME OUT)</span>
                <div className="space-y-1.5 text-slate-300">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={selectedCaseForChecklist.who_time_out} readOnly className="accent-indigo-500" />
                    <span>ØªØ£ÙƒÙŠØ¯ Ø£Ø³Ù…Ø§Ø¡ ÙˆØ£Ø¯ÙˆØ§Ø± ÙƒØ§ÙØ© Ø£Ø¹Ø¶Ø§Ø¡ Ø§Ù„ÙØ±ÙŠÙ‚ (Ø¬Ø±Ø§Ø­ØŒ ØªØ®Ø¯ÙŠØ±ØŒ ØªÙ…Ø±ÙŠØ¶)</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={selectedCaseForChecklist.antibiotic_prophylaxis} readOnly className="accent-indigo-500" />
                    <span>ØªÙ… Ø¥Ø¹Ø·Ø§Ø¡ Ø§Ù„Ù…Ø¶Ø§Ø¯ Ø§Ù„Ø­ÙŠÙˆÙŠ Ø§Ù„ÙˆÙ‚Ø§Ø¦ÙŠ Ø®Ù„Ø§Ù„ Ø§Ù„Ù€ 60 Ø¯Ù‚ÙŠÙ‚Ø© Ø§Ù„Ù…Ø§Ø¶ÙŠØ©</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={selectedCaseForChecklist.who_time_out} readOnly className="accent-indigo-500" />
                    <span>Ø¹Ø±Ø¶ Ø§Ù„Ø£Ø´Ø¹Ø© ÙˆØµÙˆØ± Ø§Ù„Ù€ PACS Ø§Ù„ØªØ´Ø®ÙŠØµÙŠØ© Ø¹Ù„Ù‰ Ø´Ø§Ø´Ø© Ø§Ù„ØºØ±ÙØ©</span>
                  </label>
                </div>
              </div>

              {/* Section 3: SIGN OUT (Before Leaving OR) */}
              <div className="p-3.5 bg-slate-950 rounded-xl border border-slate-800 space-y-2">
                <span className="font-black text-cyan-400 text-xs block">3. Ù‚Ø¨Ù„ Ù…ØºØ§Ø¯Ø±Ø© ØºØ±ÙØ© Ø§Ù„Ø¹Ù…Ù„ÙŠØ§Øª (SIGN OUT)</span>
                <div className="space-y-1.5 text-slate-300">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={selectedCaseForChecklist.who_sign_out} readOnly className="accent-cyan-500" />
                    <span>ØªÙˆØ«ÙŠÙ‚ Ø§Ø³Ù… Ø§Ù„Ø¥Ø¬Ø±Ø§Ø¡ Ø§Ù„Ø¬Ø±Ø§Ø­ÙŠ Ø§Ù„Ù…Ù†ÙØ° Ø¨Ø§Ù„ÙƒØ§Ù…Ù„</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={selectedCaseForChecklist.who_sign_out} readOnly className="accent-cyan-500" />
                    <span>Ø¹Ø¯ Ø§Ù„Ø´Ø§Ø´ ÙˆØ§Ù„Ø¥Ø¨Ø± ÙˆØ§Ù„Ø¢Ù„Ø§Øª Ø§Ù„Ø¬Ø±Ø§Ø­ÙŠØ© Ø³Ù„ÙŠÙ… 100% Ø¨Ø¯ÙˆÙ† Ø£ÙŠ Ù†Ù‚Øµ</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={selectedCaseForChecklist.who_sign_out} readOnly className="accent-cyan-500" />
                    <span>ØªØ±Ù…ÙŠØ² Ø¹ÙŠÙ†Ø§Øª Ø§Ù„Ø£Ù†Ø³Ø¬Ø© (Biopsy) Ø¨Ø§Ø³Ù… Ø§Ù„Ù…Ø±ÙŠØ¶ Ø¨Ø¯Ù‚Ø©</span>
                  </label>
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setSelectedCaseForChecklist(null)}
                className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-black text-xs transition-all"
              >
                Ø¥ØºÙ„Ø§Ù‚ ÙˆØªØ£ÙƒÙŠØ¯ Ø§Ù„Ù‚Ø§Ø¦Ù…Ø©
              </button>
            </div>
          </div>
        </div>
      )}

      {/* âž• NEW SURGERY BOOKING MODAL */}
      {isNewBookingModalOpen && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4" dir="rtl">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-lg w-full p-6 space-y-4 shadow-2xl">
            <div className="flex justify-between items-center pb-3 border-b border-slate-800">
              <h2 className="font-black text-white text-base flex items-center gap-2">
                <Plus size={18} className="text-emerald-400" />
                Ø­Ø¬Ø² ÙˆØ¬Ø¯ÙˆÙ„Ø© Ø¹Ù…Ù„ÙŠØ© Ø¬Ø±Ø§Ø­ÙŠØ© Ø¬Ø¯ÙŠØ¯Ø©
              </h2>
              <button onClick={() => setIsNewBookingModalOpen(false)} className="text-slate-400 hover:text-white">
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleCreateNewBooking} className="space-y-3.5 text-xs">
              <div>
                <label className="block text-slate-400 font-bold mb-1">Ø§Ø³Ù… Ø§Ù„Ø¹Ù…Ù„ÙŠØ© Ø§Ù„Ø¬Ø±Ø§Ø­ÙŠØ© *</label>
                <input
                  type="text"
                  required
                  value={newCaseForm.surgery_name}
                  onChange={e => setNewCaseForm({ ...newCaseForm, surgery_name: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-white outline-none focus:border-emerald-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-400 font-bold mb-1">Ø§Ø³Ù… Ø§Ù„Ù…Ø±ÙŠØ¶ *</label>
                  <input
                    type="text"
                    required
                    value={newCaseForm.patient_name}
                    onChange={e => setNewCaseForm({ ...newCaseForm, patient_name: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-white outline-none"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 font-bold mb-1">Ø±Ù‚Ù… Ø§Ù„Ù…Ù„Ù (MRN)</label>
                  <input
                    type="text"
                    value={newCaseForm.mrn}
                    onChange={e => setNewCaseForm({ ...newCaseForm, mrn: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-white font-mono outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-400 font-bold mb-1">Ø§Ù„Ø¬Ø±Ø§Ø­ Ø§Ù„Ø±Ø¦ÙŠØ³ÙŠ *</label>
                  <input
                    type="text"
                    required
                    value={newCaseForm.lead_surgeon}
                    onChange={e => setNewCaseForm({ ...newCaseForm, lead_surgeon: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-white outline-none"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 font-bold mb-1">Ø§Ø³ØªØ´Ø§Ø±ÙŠ Ø§Ù„ØªØ®Ø¯ÙŠØ±</label>
                  <input
                    type="text"
                    value={newCaseForm.anesthesiologist}
                    onChange={e => setNewCaseForm({ ...newCaseForm, anesthesiologist: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-white outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-400 font-bold mb-1">ØºØ±ÙØ© Ø§Ù„Ø¹Ù…Ù„ÙŠØ§Øª</label>
                  <select
                    value={newCaseForm.room_number}
                    onChange={e => setNewCaseForm({ ...newCaseForm, room_number: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-white outline-none"
                  >
                    {DEFAULT_OR_ROOMS.map(r => (
                      <option key={r.id} value={r.id}>{r.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-slate-400 font-bold mb-1">Ù†ÙˆØ¹ Ø§Ù„ØªØ®Ø¯ÙŠØ±</label>
                  <select
                    value={newCaseForm.anesthesia_type}
                    onChange={e => setNewCaseForm({ ...newCaseForm, anesthesia_type: e.target.value as any })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-white outline-none"
                  >
                    <option value="GENERAL">ØªØ®Ø¯ÙŠØ± ÙƒÙ„ÙŠ (General)</option>
                    <option value="SPINAL">ØªØ®Ø¯ÙŠØ± Ù†ØµÙÙŠ (Spinal)</option>
                    <option value="EPIDURAL">Ø¥Ø¨ÙŠØ¯ÙŠÙˆØ±Ø§Ù„ (Epidural)</option>
                    <option value="LOCAL">Ù…ÙˆØ¶Ø¹ÙŠ (Local)</option>
                    <option value="SEDATION">Ù…Ù‡Ø¯Ø¦ Ø®ÙÙŠÙ (Sedation)</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-400 font-bold mb-1">Ù…ÙˆØ¹Ø¯ Ø¨Ø¯Ø¡ Ø§Ù„Ø¬Ø±Ø§Ø­Ø© *</label>
                  <input
                    type="datetime-local"
                    required
                    value={newCaseForm.scheduled_start}
                    onChange={e => setNewCaseForm({ ...newCaseForm, scheduled_start: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-white font-mono outline-none"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 font-bold mb-1">Ø§Ù„Ù…ÙˆØ¹Ø¯ Ø§Ù„Ù…ØªÙˆÙ‚Ø¹ Ù„Ù„Ø§Ù†ØªÙ‡Ø§Ø¡ *</label>
                  <input
                    type="datetime-local"
                    required
                    value={newCaseForm.scheduled_end}
                    onChange={e => setNewCaseForm({ ...newCaseForm, scheduled_end: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-white font-mono outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-400 font-bold mb-1">Ù…Ù„Ø§Ø­Ø¸Ø§Øª Ù…Ø§ Ù‚Ø¨Ù„ Ø§Ù„Ø¬Ø±Ø§Ø­Ø©</label>
                <textarea
                  value={newCaseForm.notes}
                  onChange={e => setNewCaseForm({ ...newCaseForm, notes: e.target.value })}
                  rows={2}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-white outline-none"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsNewBookingModalOpen(false)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl font-bold transition-all"
                >
                  Ø¥Ù„ØºØ§Ø¡
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-black shadow-lg shadow-emerald-600/20 transition-all"
                >
                  Ø­Ø¬Ø² Ø§Ù„Ø¹Ù…Ù„ÙŠØ©
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}

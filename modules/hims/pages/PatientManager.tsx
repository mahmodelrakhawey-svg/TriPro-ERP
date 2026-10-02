import { logger } from '../../../utils/logger';
import React, { useState, useEffect } from 'react';
import { UserPlus, Search, FileText, Activity, CreditCard, Calendar, Filter, Plus, Edit2, Trash2, Camera, Loader2, X, Key } from 'lucide-react';
import { supabase } from '@/supabaseClient';
import { useAccounting } from '../../../context/AccountingContext';
import { scanNationalID } from '@/services/geminiService';
import { offlineService, db } from '../../../services/offlineService';
import { useToast } from '../../../context/ToastContext';
import { usePagination } from '../../../components/usePagination';
import { Modal, Form, Select, Input, Button } from 'antd';
import { PatientMedicalRecord } from '../components/PatientMedicalRecord';
import { validateEgyptianNationalId, parseNationalId } from '../himsHelpers';
import { secureStorage } from '../../../utils/securityMiddleware';

type Patient = {
  id: string;
  full_name: string;
  national_id: string;
  dob: string;
  gender: 'male' | 'female' | 'other';
  blood_type: string;
  customer_id: string;
  phone?: string;
};

const PatientManager = () => {
  const { organization, currentUser } = useAccounting();
  const { showToast } = useToast();
  const [searchTerm, setSearchTerm] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isVisitModalOpen, setIsVisitModalOpen] = useState(false);
  const [isMedicalRecordModalOpen, setIsMedicalRecordModalOpen] = useState(false);
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);
  const [doctors, setDoctors] = useState<any[]>([]);
  const [loadingDoctors, setLoadingDoctors] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isKeyModalOpen, setIsKeyModalOpen] = useState(false);
  const [apiKeyInput, setApiKeyInput] = useState(() => (typeof window !== 'undefined' ? ((secureStorage.getItem('user_gemini_api_key') as string) || '') : ''));

  const handleSaveApiKey = () => {
    const val = apiKeyInput.replace(/["'\s]/g, '').trim();
    // ØªØ­Ù‚Ù‚ Ù…Ù† Ø£Ù† Ø§Ù„Ù…ÙØªØ§Ø­ ØµØ§Ù„Ø­ â€” Ù„Ø§ Ø¹Ø±Ø¨ÙŠØŒ Ù„Ø§ Ø¥ÙŠÙ…ÙˆØ¬ÙŠØŒ Ù„Ø§ Ø£Ù‚ØµØ± Ù…Ù† 20 Ø­Ø±Ù
    const isValid = val.length >= 20 
      && /^[A-Za-z0-9._\-]+$/.test(val)
      && !/[\u0600-\u06FF]/.test(val);

    if (val && !isValid) {
      showToast('âŒ Ø§Ù„Ù…ÙØªØ§Ø­ Ø§Ù„Ù…ÙØ¯Ø®Ù„ ØºÙŠØ± ØµØ§Ù„Ø­. ÙŠØ¬Ø¨ Ø£Ù† ÙŠÙƒÙˆÙ† Ù…ÙØªØ§Ø­ API ÙŠØ¨Ø¯Ø£ Ø¨Ù€ AIzaSy... Ø£Ùˆ AQ. ÙˆÙ…ÙƒÙˆÙ‘Ù† Ù…Ù† Ø£Ø­Ø±Ù Ø¥Ù†Ø¬Ù„ÙŠØ²ÙŠØ© ÙˆØ£Ø±Ù‚Ø§Ù… ÙÙ‚Ø·.', 'error');
      return;
    }

    if (val && isValid) {
      secureStorage.setItem('user_gemini_api_key', val);
      setApiKeyInput(val);
      showToast('ØªÙ… Ø­ÙØ¸ Ù…ÙØªØ§Ø­ AI Ø§Ù„Ù…Ø¨Ø§Ø´Ø± ÙÙŠ Ø§Ù„Ù…ØªØµÙØ­ Ø¨Ù†Ø¬Ø§Ø­! ðŸŸ¢', 'success');
    } else {
      secureStorage.removeItem('user_gemini_api_key');
      showToast('ØªÙ… Ø¥Ø²Ø§Ù„Ø© Ù…ÙØªØ§Ø­ AI Ø§Ù„Ù…Ø¨Ø§Ø´Ø± ÙˆØ§Ø³ØªØ®Ø¯Ø§Ù… Ø§Ù„ÙˆØ¶Ø¹ Ø§Ù„ØªÙ„Ù‚Ø§Ø¦ÙŠ', 'info');
    }
    setIsKeyModalOpen(false);
  };
  
  const [formData, setFormData] = useState<{
    full_name: string;
    national_id: string;
    dob: string;
    gender: Patient['gender'];
    blood_type: string;
    phone: string;
  }>({
    full_name: '',
    national_id: '',
    dob: '',
    gender: 'male',
    blood_type: 'O+',
    phone: ''
  });

  const queryModifier = React.useCallback((query: Record<string, any>) => {
    if (searchTerm) {
      query = query.or(`full_name.ilike.%${searchTerm}%,national_id.ilike.%${searchTerm}%`);
    }
    return query;
  }, [searchTerm]);

  const currentOrgId = organization?.id || currentUser?.organization_id;

  const { data: patients, loading, refresh } = usePagination<Patient>('hims_patients', {
    select: '*',
    pageSize: 15,
    orderBy: 'full_name',
    organizationId: currentOrgId
  }, queryModifier);

  const [displayedPatients, setDisplayedPatients] = useState<Patient[]>([]);

  const loadPatients = React.useCallback(async () => {
    if (navigator.onLine) {
      if (patients) {
        setDisplayedPatients(patients);
        const orgId = organization?.id || currentUser?.organization_id;
        if (orgId) {
          offlineService.syncPatientsLocally(orgId);
        }
      }
    } else {
      try {
        const cached = await db.himsPatients.toArray();
        const queued = await db.queuedPatients.toArray();
        
        let offlineList = [
          ...queued.map(q => ({
            id: `queued-${q.id}`,
            ...q.payload
          })),
          ...cached
        ];

        if (searchTerm) {
          const lowerSearch = searchTerm.toLowerCase();
          offlineList = offlineList.filter(p => 
            p.full_name?.toLowerCase().includes(lowerSearch) || 
            p.national_id?.includes(lowerSearch)
          );
        }

        if (offlineList.length === 0) {
          offlineList = [
            { id: '11111111-1111-4111-a111-222222222222', full_name: 'Ø£Ø­Ù…Ø¯ Ù…Ø­Ù…ÙˆØ¯ Ø¹Ù„ÙŠ', national_id: '29508120101543', dob: '1995-08-12', gender: 'male', blood_type: 'O+', phone: '01012345678', customer_id: 'cust-1' },
            { id: '11111111-1111-4111-a111-444444444444', full_name: 'Ø³Ø§Ø±Ø© Ø¥Ø¨Ø±Ø§Ù‡ÙŠÙ… Ø§Ù„Ø´Ø±ÙŠÙ', national_id: '29803241402212', dob: '1998-03-24', gender: 'female', blood_type: 'A+', phone: '01123456789', customer_id: 'cust-2' },
            { id: '11111111-1111-4111-a111-555555555555', full_name: 'Ù…Ø­Ù…Ø¯ Ø¹Ø¨Ø¯ Ø§Ù„Ø±Ø­Ù…Ù† Ø®Ø§Ù„Ø¯', national_id: '28911050203341', dob: '1989-11-05', gender: 'male', blood_type: 'B+', phone: '01234567890', customer_id: 'cust-3' },
            { id: '11111111-1111-4111-a111-666666666666', full_name: 'ÙØ§Ø·Ù…Ø© Ø§Ù„Ø²Ù‡Ø±Ø§Ø¡ Ø­Ø³Ù†', national_id: '30105150104432', dob: '2001-05-15', gender: 'female', blood_type: 'AB+', phone: '01543216789', customer_id: 'cust-4' }
          ];
        }

        setDisplayedPatients(offlineList);
      } catch (err) {
        logger.error('Failed to load offline patients:', err);
      }
    }
  }, [patients, searchTerm, organization?.id, currentUser?.organization_id]);

  useEffect(() => {
    loadPatients();
  }, [loadPatients, patients]);

  useEffect(() => {
    const handleConnectivityChange = () => {
      loadPatients();
    };
    window.addEventListener('online', handleConnectivityChange);
    window.addEventListener('offline', handleConnectivityChange);
    return () => {
      window.removeEventListener('online', handleConnectivityChange);
      window.removeEventListener('offline', handleConnectivityChange);
    };
  }, [loadPatients]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const patientData = {
        ...formData,
        organization_id: organization?.id
      };

      if (!navigator.onLine && !editingId) {
        await offlineService.queuePatient(patientData);
        showToast('ØªÙ… ØªØ³Ø¬ÙŠÙ„ Ø§Ù„Ù…Ø±ÙŠØ¶ Ù…Ø­Ù„ÙŠØ§Ù‹ Ø¨Ù†Ø¬Ø§Ø­ (Ø³ÙŠØªÙ… Ø§Ù„ØªØ²Ø§Ù…Ù† ØªÙ„Ù‚Ø§Ø¦ÙŠØ§Ù‹ Ø¹Ù†Ø¯ Ø¹ÙˆØ¯Ø© Ø§Ù„Ø§ØªØµØ§Ù„) ðŸ“¶', 'warning');
        setIsModalOpen(false);
        setEditingId(null);
        loadPatients();
        return;
      }

      if (editingId) {
        const { error } = await supabase.from('hims_patients').update(patientData).eq('id', editingId);
        if (error) throw error;
        showToast('ØªÙ… ØªØ­Ø¯ÙŠØ« Ø¨ÙŠØ§Ù†Ø§Øª Ø§Ù„Ù…Ø±ÙŠØ¶ Ø¨Ù†Ø¬Ø§Ø­', 'success');
      } else {
        const { error } = await supabase.from('hims_patients').insert(patientData);
        if (error) throw error;
        showToast('ØªÙ… ØªØ³Ø¬ÙŠÙ„ Ø§Ù„Ù…Ø±ÙŠØ¶ ÙˆÙØªØ­ Ù…Ù„Ù Ù…Ø§Ù„ÙŠ Ø¢Ù„ÙŠØ§Ù‹', 'success');
      }

      setIsModalOpen(false);
      setEditingId(null);
      refresh();
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  useEffect(() => {
    if (isVisitModalOpen) {
      const fetchDoctors = async () => {
        const orgId = organization?.id || currentUser?.organization_id;
        if (!orgId) return;

        setLoadingDoctors(true);
        const { data } = await supabase
          .from('hims_doctors')
          // ðŸ›¡ï¸ ØªÙˆØ­ÙŠØ¯: Ø¬Ù„Ø¨ Ø§Ù„Ø§Ø³Ù… Ù…Ù† Ø±Ø§Ø¨Ø· Ø§Ù„Ø¨Ø±ÙˆÙØ§ÙŠÙ„ Ø§Ù„ØµØ­ÙŠØ­ Ù„Ø¶Ù…Ø§Ù† Ø¸Ù‡ÙˆØ± Ø§Ø³Ù… Ø§Ù„Ø·Ø¨ÙŠØ¨ ÙÙŠ Ø§Ù„Ù‚Ø§Ø¦Ù…Ø©
          .select('id, specialization, is_active, profile:profile_id(full_name)')
          .eq('organization_id', orgId)
          .eq('is_active', true);
        setDoctors(data || []);
        setLoadingDoctors(false);
      };
      fetchDoctors();
    }
  }, [isVisitModalOpen, organization?.id, currentUser?.organization_id]);

  const handleStartVisit = async (values: Record<string, any>) => {
    try {
      const visitPayload = {
        patient_id: selectedPatient?.id,
        doctor_id: values.doctor_id,
        visit_type: values.visit_type,
        chief_complaint: values.chief_complaint,
        triage_level: values.triage_level || 'level_5_non_urgent',
        status: 'triaged',
        organization_id: organization?.id || currentUser?.organization_id
      };

      if (!navigator.onLine) {
        await offlineService.queueVisit(visitPayload);
        showToast('ØªÙ… ÙØªØ­ Ø§Ù„Ø²ÙŠØ§Ø±Ø© Ù…Ø­Ù„ÙŠØ§Ù‹ Ø¨Ù†Ø¬Ø§Ø­ (Ø³ÙŠØªÙ… Ø§Ù„ØªØ²Ø§Ù…Ù† ØªÙ„Ù‚Ø§Ø¦ÙŠØ§Ù‹ Ø¹Ù†Ø¯ Ø¹ÙˆØ¯Ø© Ø§Ù„Ø§ØªØµØ§Ù„) ðŸ“¶', 'warning');
        setIsVisitModalOpen(false);
        return;
      }

      const { error } = await supabase.from('hims_visits').insert([visitPayload]);
      if (error) throw error;
      showToast('ØªÙ… ÙØªØ­ Ø§Ù„Ø²ÙŠØ§Ø±Ø© ÙˆØ¥Ø±Ø³Ø§Ù„ Ø§Ù„Ù…Ø±ÙŠØ¶ Ù„Ù„Ø¹ÙŠØ§Ø¯Ø© Ø¨Ù†Ø¬Ø§Ø­ âœ…', 'success');
      setIsVisitModalOpen(false);
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  const handleViewMedicalRecord = (patient: Patient) => {
    setSelectedPatient(patient);
    setIsMedicalRecordModalOpen(true);
  };

  // ðŸš€ Ù…Ø­Ø±Ùƒ Ø§Ù„Ù…Ø³Ø­ Ø§Ù„Ø¶ÙˆØ¦ÙŠ Ù„Ù„Ø¨Ø·Ø§Ù‚Ø© (OCR Simulation & Intelligence)
  const handleIDScan = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsScanning(true);
    try {
      const reader = new FileReader();
      const base64Promise = new Promise<string>((resolve, reject) => {
        reader.onload = () => {
          const result = reader.result as string;
          const base64Data = result.split(',')[1];
          resolve(base64Data);
        };
        reader.onerror = (error) => reject(error);
      });
      reader.readAsDataURL(file);
      const base64Data = await base64Promise;

      const extracted = await scanNationalID(base64Data, file.type);

      setFormData(prev => ({
        ...prev,
        full_name: extracted.full_name || '',
        national_id: extracted.national_id || '',
        dob: extracted.dob || '',
        gender: extracted.gender || 'male'
      }));

      showToast('ØªÙ… Ù…Ø³Ø­ Ø§Ù„Ø¨Ø·Ø§Ù‚Ø© ÙˆØ§Ø³ØªØ®Ø±Ø§Ø¬ Ø§Ù„Ø¨ÙŠØ§Ù†Ø§Øª Ø¢Ù„ÙŠØ§Ù‹ Ø¨Ù†Ø¬Ø§Ø­ âœ…', 'success');
    } catch (err) {
      const msg: string = err?.message || String(err);

      // Ø§Ù„ØªØ­Ù‚Ù‚ Ù…Ù† ÙˆØ¬ÙˆØ¯ Ù…ÙØªØ§Ø­ Ù…Ø­ÙÙˆØ¸ ÙØ¹Ù„ÙŠØ§Ù‹ ÙÙŠ Ø§Ù„Ù…ØªØµÙØ­
      const storedKey = secureStorage.getItem<string>('user_gemini_api_key');
      const hasStoredValidKey = !!(
        storedKey &&
        typeof storedKey === 'string' &&
        storedKey.length >= 10 &&
        /^[A-Za-z0-9._\-]+$/.test(storedKey.trim())
      );

      if (!hasStoredValidKey && !import.meta.env.VITE_GEMINI_API_KEY) {
        // Ù„Ø§ ÙŠÙˆØ¬Ø¯ Ù…ÙØªØ§Ø­ Ù…Ø­ÙÙˆØ¸ Ø¨Ø§Ù„Ù…Ø±Ø© â€” Ø§ÙØªØ­ Ù…ÙˆØ¯Ø§Ù„ Ø§Ù„Ø¥Ø¯Ø®Ø§Ù„
        showToast('ðŸ”‘ ÙŠØ¬Ø¨ Ø¥Ø¯Ø®Ø§Ù„ Ù…ÙØªØ§Ø­ Gemini API Ø£ÙˆÙ„Ø§Ù‹ Ù„ØªÙØ¹ÙŠÙ„ Ù…Ø³Ø­ Ø§Ù„Ø¨Ø·Ø§Ù‚Ø©.', 'error');
        setIsKeyModalOpen(true);
      } else if (msg.includes('ØºÙŠØ± ØµØ§Ù„Ø­') || msg.includes('INVALID') || msg.includes('401') || msg.includes('403')) {
        // Ø§Ù„Ù…ÙØªØ§Ø­ Ù…ÙˆØ¬ÙˆØ¯ Ù„ÙƒÙ† Ø¬ÙˆØ¬Ù„ Ø±ÙØ¶Ù‡
        showToast('âŒ Ù…ÙØªØ§Ø­ API Ù…Ø±ÙÙˆØ¶ Ù…Ù† Google â€” ØªØ£ÙƒØ¯ Ù…Ù† ØµØ­Ø© Ø§Ù„Ù…ÙØªØ§Ø­ Ø«Ù… Ø£Ø¹Ø¯ Ø§Ù„Ù…Ø­Ø§ÙˆÙ„Ø©.', 'error');
        setIsKeyModalOpen(true);
      } else if (msg.includes('429') || msg.includes('RESOURCE_EXHAUSTED') || msg.includes('ØªØ¬Ø§ÙˆØ² Ø­Ø¯')) {
        // ØªØ¬Ø§ÙˆØ² Ø§Ù„Ø­Ø¯ Ø§Ù„Ù…Ø³Ù…ÙˆØ­
        showToast('â³ ØªÙ… Ø§Ù„ÙˆØµÙˆÙ„ Ù„Ù„Ø­Ø¯ Ø§Ù„Ù…Ø¬Ø§Ù†ÙŠ Ø§Ù„Ù…Ø¤Ù‚Øª (15 Ø·Ù„Ø¨/Ø¯Ù‚ÙŠÙ‚Ø©) â€” Ø§Ù†ØªØ¸Ø± 30 Ø«Ø§Ù†ÙŠØ© ÙˆØ£Ø¹Ø¯ Ø§Ù„Ù…Ø­Ø§ÙˆÙ„Ø©.', 'warning');
      } else {
        // Ø®Ø·Ø£ Ø¢Ø®Ø± (Ø´Ø¨ÙƒØ©ØŒ ØªÙ†Ø³ÙŠÙ‚ ØµÙˆØ±Ø©ØŒ Ø¥Ù„Ø®)
        showToast('âš ï¸ ÙØ´Ù„ Ù‚Ø±Ø§Ø¡Ø© Ø§Ù„Ø¨Ø·Ø§Ù‚Ø©: ' + msg, 'error');
      }
    } finally {
      setIsScanning(false);
      // Ø¥Ø¹Ø§Ø¯Ø© Ø¶Ø¨Ø· Ø­Ù‚Ù„ Ø§Ù„Ù…Ù„Ù Ù„Ù†Ø³Ù…Ø­ Ø¨Ø±ÙØ¹ Ù†ÙØ³ Ø§Ù„ØµÙˆØ±Ø© Ù…Ø¬Ø¯Ø¯Ù‹Ø§
      (document.querySelector('input[type="file"]') as HTMLInputElement | null)?.removeAttribute('value');
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-black text-slate-800 flex items-center gap-2">
            <Activity className="text-blue-600" /> Ø¥Ø¯Ø§Ø±Ø© Ø§Ù„Ø³Ø¬Ù„Ø§Øª Ø§Ù„Ø·Ø¨ÙŠØ©
          </h1>
          <p className="text-slate-500 text-sm">ØªØ³Ø¬ÙŠÙ„ Ø§Ù„Ù…Ø±Ø¶Ù‰ ÙˆÙ…ØªØ§Ø¨Ø¹Ø© Ø­Ø§Ù„Ø§ØªÙ‡Ù… Ø§Ù„ØµØ­ÙŠØ© ÙˆØ§Ù„Ù…Ø§Ù„ÙŠØ©</p>
        </div>
        <button 
          onClick={() => {
            setEditingId(null);
            setFormData({ full_name: '', national_id: '', dob: '', gender: 'male', blood_type: 'O+', phone: '' });
            setIsModalOpen(true);
          }}
          className="bg-blue-600 text-white px-5 py-2.5 rounded-xl font-bold flex items-center gap-2 hover:bg-blue-700 shadow-lg shadow-blue-200 transition-all"
        >
          <UserPlus size={20} /> ØªØ³Ø¬ÙŠÙ„ Ù…Ø±ÙŠØ¶ Ø¬Ø¯ÙŠØ¯
        </button>
      </div>

      <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-200 flex gap-4">
        <div className="relative flex-1">
          <Search className="absolute right-3 top-3 text-slate-400" size={20} />
          <input 
            type="text"
            placeholder="Ø¨Ø­Ø« Ø¨Ø§Ø³Ù… Ø§Ù„Ù…Ø±ÙŠØ¶ Ø£Ùˆ Ø§Ù„Ø±Ù‚Ù… Ø§Ù„Ù‚ÙˆÙ…ÙŠ..."
            className="w-full pr-10 pl-4 py-2.5 border border-slate-200 rounded-xl outline-none focus:border-blue-500 transition-colors"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <button className="bg-slate-50 text-slate-600 px-4 py-2.5 rounded-xl border border-slate-200 font-bold flex items-center gap-2 hover:bg-slate-100">
          <Filter size={18} /> ØªØµÙÙŠØ©
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {displayedPatients.map((patient) => (
          <div key={patient.id} className="bg-white p-5 rounded-2xl border border-slate-200 hover:border-blue-300 transition-all group shadow-sm">
            <div className="flex justify-between items-start mb-4">
              <div className="w-12 h-12 bg-blue-50 rounded-2xl flex items-center justify-center text-blue-600 font-black text-xl">
                {patient.full_name[0]}
              </div>
              <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button 
                  onClick={() => {
                    setEditingId(patient.id);
                    setFormData({
                      full_name: patient.full_name,
                      national_id: patient.national_id,
                      dob: patient.dob,
                      gender: patient.gender,
                      blood_type: patient.blood_type,
                      phone: patient.phone || ''
                    });
                    setIsModalOpen(true);
                  }}
                  className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg"
                >
                  <Edit2 size={16} />
                </button>
                <button 
                  onClick={async () => {
                    if (window.confirm('Ù‡Ù„ Ø£Ù†Øª Ù…ØªØ£ÙƒØ¯ Ù…Ù† Ø­Ø°Ù Ø¨ÙŠØ§Ù†Ø§Øª Ù‡Ø°Ø§ Ø§Ù„Ù…Ø±ÙŠØ¶ Ù†Ù‡Ø§Ø¦ÙŠØ§Ù‹ØŸ')) {
                      const { error } = await supabase.from('hims_patients').delete().eq('id', patient.id);
                      if (error) showToast(error.message, 'error');
                      else {
                        showToast('ØªÙ… Ø­Ø°Ù Ø§Ù„Ù…Ø±ÙŠØ¶ Ø¨Ù†Ø¬Ø§Ø­', 'success');
                        refresh();
                      }
                    }
                  }}
                  className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg">
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
            <h3 className="font-bold text-slate-800 text-lg mb-1">{patient.full_name}</h3>
            <div className="space-y-2 text-sm">
              <div className="flex items-center gap-2 text-slate-500">
                <CreditCard size={14} /> <span>{patient.national_id}</span>
              </div>
              <div className="flex items-center gap-2 text-slate-500">
                <Calendar size={14} /> <span>{new Date(patient.dob).toLocaleDateString('ar-EG')}</span>
              </div>
              <div className="flex gap-2 mt-4">
                <span className={`px-2 py-1 rounded-lg text-xs font-bold ${patient.gender === 'male' ? 'bg-blue-100 text-blue-700' : 'bg-pink-100 text-pink-700'}`}>
                  {patient.gender === 'male' ? 'Ø°ÙƒØ±' : 'Ø£Ù†Ø«Ù‰'}
                </span>
                <span className="px-2 py-1 bg-red-100 text-red-700 rounded-lg text-xs font-bold">
                  ÙØµÙŠÙ„Ø©: {patient.blood_type}
                </span>
              </div>
            </div>
            <div className="mt-5 pt-4 border-t border-slate-100 grid grid-cols-2 gap-2">
                <button 
                  onClick={() => handleViewMedicalRecord(patient)}
                  className="bg-slate-800 text-white py-2 rounded-xl text-xs font-bold hover:bg-slate-900 transition-colors flex items-center justify-center gap-1"
                >
                  <FileText size={14} /> Ù…Ù„Ù Ø§Ù„Ù…Ø±ÙŠØ¶
                </button>
               <button 
                onClick={() => { setSelectedPatient(patient); setIsVisitModalOpen(true); }}
                className="bg-blue-50 text-blue-700 py-2 rounded-xl text-xs font-bold hover:bg-blue-100 transition-colors flex items-center justify-center gap-1"
               >
                 <Plus size={14} /> Ø²ÙŠØ§Ø±Ø© Ø¬Ø¯ÙŠØ¯Ø©
               </button>
            </div>
          </div>
        ))}
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-white rounded-[32px] shadow-2xl w-full max-w-lg overflow-hidden animate-in zoom-in-95 duration-300">
            <div className="bg-slate-50 p-6 border-b border-slate-100 flex justify-between items-center">
              <h2 className="text-xl font-black text-slate-800">
                {editingId ? 'ØªØ¹Ø¯ÙŠÙ„ Ø¨ÙŠØ§Ù†Ø§Øª Ø§Ù„Ù…Ø±ÙŠØ¶' : 'ØªØ³Ø¬ÙŠÙ„ Ù…Ø±ÙŠØ¶ Ø¬Ø¯ÙŠØ¯'}
              </h2>
              <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-red-500 transition-colors"><X size={24} /></button>
            </div>
            <form onSubmit={handleSave} className="p-8 space-y-5">
              {/* ðŸ“¸ Ø²Ø± Ø§Ù„Ù…Ø³Ø­ Ø§Ù„Ø¶ÙˆØ¦ÙŠ Ø§Ù„Ø°ÙƒÙŠ (ID OCR Scanner) + Ø²Ø± Ø§Ù„Ù…ÙØªØ§Ø­ Ø§Ù„Ù…Ø¨Ø§Ø´Ø± */}
              <div className="bg-indigo-50 p-4 rounded-[2rem] border-2 border-dashed border-indigo-200 mb-2 hover:bg-indigo-100/80 transition-all">
                <div className="flex items-center justify-between gap-2 mb-2 pb-2 border-b border-indigo-100">
                  <span className="text-xs font-black text-indigo-900 flex items-center gap-1">
                    <Camera size={16} /> Ù…Ø³Ø­ ÙˆØªØ¹Ø¨Ø¦Ø© Ø§Ù„Ø¨ÙŠØ§Ù†Ø§Øª ØªÙ„Ù‚Ø§Ø¦ÙŠØ§Ù‹
                  </span>
                  <button 
                    type="button"
                    onClick={() => setIsKeyModalOpen(true)}
                    className="text-xs text-indigo-700 hover:text-indigo-900 bg-white px-2.5 py-1 rounded-xl border border-indigo-200 font-bold flex items-center gap-1 shadow-sm transition-all hover:bg-indigo-50"
                  >
                    <Key size={13} /> {(typeof window !== 'undefined' && (secureStorage.getItem('user_gemini_api_key'))) ? 'Ù…ÙØªØ§Ø­ AI Ø§Ù„Ù…Ø¨Ø§Ø´Ø±: ðŸŸ¢' : 'Ø¥Ø¯Ø®Ø§Ù„ Ù…ÙØªØ§Ø­ AI Ø§Ù„Ù…Ø¨Ø§Ø´Ø± ðŸ”‘'}
                  </button>
                </div>
                <label className="flex flex-col items-center justify-center cursor-pointer py-1">
                  <div className="flex items-center gap-2 text-indigo-700 font-black">
                    {isScanning ? <Loader2 className="animate-spin" size={20} /> : <Camera size={20} />}
                    <span>{isScanning ? 'Ø¬Ø§Ø±ÙŠ ØªØ­Ù„ÙŠÙ„ Ø¨ÙŠØ§Ù†Ø§Øª Ø§Ù„Ø¨Ø·Ø§Ù‚Ø©...' : 'Ø±ÙØ¹ ØµÙˆØ±Ø© Ø§Ù„Ø¨Ø·Ø§Ù‚Ø© Ø§Ù„Ø´Ø®ØµÙŠØ© (OCR)'}</span>
                  </div>
                  <input type="file" accept="image/*" className="hidden" onChange={handleIDScan} disabled={isScanning} />
                  <p className="text-[10px] text-indigo-400 mt-1 font-bold">Ø§Ø±ÙØ¹ ØµÙˆØ±Ø© ÙˆØ§Ø¶Ø­Ø© Ù„Ù„Ø¨Ø·Ø§Ù‚Ø© (ÙˆØ¬Ù‡ Ø£Ù…Ø§Ù…ÙŠ) Ù„Ù…Ù„Ø¡ Ø§Ù„Ø¨ÙŠØ§Ù†Ø§Øª Ø¢Ù„ÙŠØ§Ù‹</p>
                </label>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-1">Ø§Ù„Ø§Ø³Ù… Ø¨Ø§Ù„ÙƒØ§Ù…Ù„</label>
                  <input 
                    required
                    type="text"
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-blue-500 outline-none"
                    placeholder="Ø£Ø¯Ø®Ù„ Ø§Ù„Ø§Ø³Ù… Ø±Ø¨Ø§Ø¹ÙŠ..."
                    value={formData.full_name}
                    onChange={e => setFormData({...formData, full_name: e.target.value})}
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-bold text-slate-700 mb-1">Ø§Ù„Ø±Ù‚Ù… Ø§Ù„Ù‚ÙˆÙ…ÙŠ (14 Ø±Ù‚Ù…)</label>
                    <input 
                      required
                      type="text"
                      maxLength={14}
                      className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-blue-500 outline-none font-mono"
                      placeholder="2920101......"
                      value={formData.national_id}
                      onChange={e => {
                        const val = e.target.value;
                        let updatedDob = formData.dob;
                        let updatedGender = formData.gender;
                        if (val.trim().length === 14) {
                          const parsed = parseNationalId(val.trim());
                          if (parsed.isValid) {
                            if (parsed.dob) updatedDob = parsed.dob;
                            if (parsed.gender) updatedGender = parsed.gender;
                          }
                        }
                        setFormData({...formData, national_id: val, dob: updatedDob, gender: updatedGender});
                      }}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-slate-700 mb-1">ØªØ§Ø±ÙŠØ® Ø§Ù„Ù…ÙŠÙ„Ø§Ø¯</label>
                    <input 
                      required
                      type="date"
                      className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-blue-500 outline-none"
                      value={formData.dob}
                      onChange={e => setFormData({...formData, dob: e.target.value})}
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-bold text-slate-700 mb-1">Ø§Ù„Ø¬Ù†Ø³</label>
                    <select 
                      className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-blue-500 outline-none"
                      value={formData.gender}
                      onChange={e => setFormData({...formData, gender: e.target.value as any})}
                    >
                      <option value="male">Ø°ÙƒØ±</option>
                      <option value="female">Ø£Ù†Ø«Ù‰</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-slate-700 mb-1">ÙØµÙŠÙ„Ø© Ø§Ù„Ø¯Ù…</label>
                    <select 
                      className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-blue-500 outline-none"
                      value={formData.blood_type}
                      onChange={e => setFormData({...formData, blood_type: e.target.value})}
                    >
                      {['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'].map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-1">Ø±Ù‚Ù… Ø§Ù„Ù‡Ø§ØªÙ</label>
                  <input 
                    type="tel"
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-blue-500 outline-none"
                    placeholder="01xxxxxxxxx"
                    value={formData.phone}
                    onChange={e => setFormData({...formData, phone: e.target.value})}
                  />
                </div>
              </div>
              <button type="submit" className="w-full bg-blue-600 text-white py-4 rounded-2xl font-black text-lg hover:bg-blue-700 shadow-xl shadow-blue-100 transition-all active:scale-95">
                {editingId ? 'ØªØ­Ø¯ÙŠØ« Ø§Ù„Ø¨ÙŠØ§Ù†Ø§Øª' : 'Ø­ÙØ¸ Ø¨ÙŠØ§Ù†Ø§Øª Ø§Ù„Ù…Ø±ÙŠØ¶ ÙˆÙØªØ­ Ù…Ù„Ù Ù…Ø§Ù„ÙŠ'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Ù…ÙˆØ¯Ø§Ù„ ÙØªØ­ Ø²ÙŠØ§Ø±Ø© Ø¬Ø¯ÙŠØ¯Ø© */}
      <Modal
        title={<b>ØªØ³Ø¬ÙŠÙ„ Ø¯Ø®ÙˆÙ„ Ù…Ø±ÙŠØ¶ - ÙØªØ­ Ø²ÙŠØ§Ø±Ø© Ø¹ÙŠØ§Ø¯Ø©/Ø·ÙˆØ§Ø±Ø¦</b>}
        open={isVisitModalOpen}
        onCancel={() => setIsVisitModalOpen(false)}
        footer={null}
      >
        <Form layout="vertical" onFinish={handleStartVisit} className="pt-4">
          <div className="bg-blue-50 p-4 rounded-xl mb-4 border border-blue-100">
            <b>Ø§Ù„Ù…Ø±ÙŠØ¶:</b> {selectedPatient?.full_name}
          </div>
          <Form.Item name="visit_type" label="Ù†ÙˆØ¹ Ø§Ù„Ø¯Ø®ÙˆÙ„" initialValue="outpatient" rules={[{required: true}]}>
            <Select options={[
              { label: 'ðŸ¥ Ø¹ÙŠØ§Ø¯Ø© Ø®Ø§Ø±Ø¬ÙŠØ©', value: 'outpatient' },
              { label: 'ðŸš¨ Ø·ÙˆØ§Ø±Ø¦ ÙˆØ§Ø³ØªÙ‚Ø¨Ø§Ù„', value: 'emergency' },
              { label: 'ðŸ›Œ ØªÙ†ÙˆÙŠÙ… Ø¯Ø§Ø®Ù„ÙŠ', value: 'inpatient' }
            ]} />
          </Form.Item>
          <Form.Item name="doctor_id" label="Ø§Ù„Ø·Ø¨ÙŠØ¨ Ø§Ù„Ù…Ø¹Ø§Ù„Ø¬" rules={[{required: true}]}>
            <Select 
              loading={loadingDoctors} 
              placeholder="Ø§Ø®ØªØ± Ø§Ù„Ø·Ø¨ÙŠØ¨ Ø§Ù„Ù…Ù†Ø§Ø³Ø¨..."
              options={doctors.map(d => ({ label: `${d.profile?.full_name || 'Ø·Ø¨ÙŠØ¨ ØºÙŠØ± Ù…Ø³Ù…Ù‰'} (${d.specialization})`, value: d.id }))}
            />
          </Form.Item>
          <Form.Item name="triage_level" label="Ù…Ø³ØªÙˆÙ‰ Ø§Ù„ÙØ±Ø² (Ù„Ù„Ø·ÙˆØ§Ø±Ø¦ ÙÙ‚Ø·)">
            <Select placeholder="Ø­Ø¯Ø¯ Ø¯Ø±Ø¬Ø© Ø§Ù„Ø®Ø·ÙˆØ±Ø©" options={[
              { label: 'ðŸ”´ Ø¥Ù†Ø¹Ø§Ø´ ÙÙˆØ±ÙŠ', value: 'level_1_resuscitation' },
              { label: 'ðŸŸ  Ø·Ø§Ø±Ø¦ Ø¬Ø¯Ø§Ù‹', value: 'level_2_emergent' },
              { label: 'ðŸŸ¡ Ø¹Ø§Ø¬Ù„', value: 'level_3_urgent' },
              { label: 'ðŸŸ¢ Ù…Ø³ØªÙ‚Ø±', value: 'level_5_non_urgent' }
            ]} />
          </Form.Item>
          <Form.Item name="chief_complaint" label="Ø§Ù„Ø´ÙƒÙˆÙ‰ Ø§Ù„Ø±Ø¦ÙŠØ³ÙŠØ© / Ù…Ù„Ø§Ø­Ø¸Ø§Øª Ø§Ù„Ø§Ø³ØªÙ‚Ø¨Ø§Ù„">
            <Input.TextArea placeholder="Ù…Ø«Ø§Ù„: Ø§Ø±ØªÙØ§Ø¹ ÙÙŠ Ø§Ù„Ø­Ø±Ø§Ø±Ø©ØŒ Ø£Ù„Ù… ÙÙŠ Ø§Ù„Ø¸Ù‡Ø±..." />
          </Form.Item>
          <Button type="primary" htmlType="submit" block size="large" className="bg-blue-600 rounded-xl font-bold h-12">Ø§Ø¹ØªÙ…Ø§Ø¯ Ø§Ù„Ø¯Ø®ÙˆÙ„ ÙˆØªØ­ÙˆÙŠÙ„ Ù„Ù„Ø·Ø¨ÙŠØ¨</Button>
        </Form>
      </Modal>

      {/* Ù…ÙˆØ¯Ø§Ù„ Ø¹Ø±Ø¶ Ø§Ù„Ù…Ù„Ù Ø§Ù„Ø·Ø¨ÙŠ */}
      <Modal
        title={<b>Ø§Ù„Ù…Ù„Ù Ø§Ù„Ø·Ø¨ÙŠ Ù„Ù„Ù…Ø±ÙŠØ¶: {selectedPatient?.full_name}</b>}
        open={isMedicalRecordModalOpen}
        onCancel={() => setIsMedicalRecordModalOpen(false)}
        footer={null}
        width="80%"
      >
        {selectedPatient && <PatientMedicalRecord patientId={selectedPatient.id} />}
      </Modal>

      {/* Ù…ÙˆØ¯Ø§Ù„ Ø¥Ø¯Ø®Ø§Ù„ Ù…ÙØªØ§Ø­ AI Ø§Ù„Ù…Ø¨Ø§Ø´Ø± Ù„Ù„Ù…ØªØµÙØ­ */}
      {isKeyModalOpen && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-[110] flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md p-6 space-y-4 border border-slate-100 animate-in zoom-in-95 duration-200">
            <div className="flex justify-between items-center border-b border-slate-100 pb-3">
              <h3 className="text-lg font-black text-slate-800 flex items-center gap-2">
                <Key className="text-indigo-600" size={20} /> Ø¥Ø¹Ø¯Ø§Ø¯ Ù…ÙØªØ§Ø­ Ø§Ù„Ø°ÙƒØ§Ø¡ Ø§Ù„Ø§ØµØ·Ù†Ø§Ø¹ÙŠ Ø§Ù„Ù…Ø¨Ø§Ø´Ø±
              </h3>
              <button onClick={() => setIsKeyModalOpen(false)} className="text-slate-400 hover:text-red-500 transition-colors"><X size={20} /></button>
            </div>
            <p className="text-xs text-slate-500 leading-relaxed">
              Ù‚Ù… Ø¨Ø¥Ø¯Ø®Ø§Ù„ Ù…ÙØªØ§Ø­ <b>Gemini API Key</b> Ø§Ù„Ø®Ø§Øµ Ø¨Ùƒ Ù„ÙŠØ¹Ù…Ù„ Ù…Ø³Ø­ Ø§Ù„Ø¨Ø·Ø§Ù‚Ø§Øª Ù…Ø¨Ø§Ø´Ø±Ø© Ù…Ù† Ù…ØªØµÙØ­Ùƒ Ø¯ÙˆÙ† Ø£ÙŠ Ù…Ø±Ø§Ø¬Ø¹Ø© Ù„Ø³ÙŠØ±ÙØ±Ø§Øª Vercel Ø£Ùˆ Ø§Ù„Ø¨ÙŠØ¦Ø§Øª Ø§Ù„Ø®Ø§Ø±Ø¬ÙŠØ©.
            </p>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Ù…ÙØªØ§Ø­ API Key (Ù…Ù† Google AI Studio):</label>
              <input 
                type="text"
                className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none text-sm font-mono"
                placeholder="AQ.Ab8RN6... Ø£Ùˆ AIzaSy..."
                value={apiKeyInput}
                onChange={e => setApiKeyInput(e.target.value)}
                autoFocus
              />
              <p className="text-[10px] text-slate-400 mt-1">
                âš ï¸ Ø§Ù„Ù…ÙØªØ§Ø­ ÙŠØ¬Ø¨ Ø£Ù† ÙŠØ¨Ø¯Ø£ Ø¨Ù€ <b>AQ.</b> Ø£Ùˆ <b>AIzaSy</b> ÙˆÙŠØªÙƒÙˆÙ† Ù…Ù† Ø­Ø±ÙˆÙ Ø¥Ù†Ø¬Ù„ÙŠØ²ÙŠØ© ÙˆØ£Ø±Ù‚Ø§Ù… ÙÙ‚Ø·
              </p>
            </div>
            <div className="flex gap-2 justify-between pt-2 flex-wrap">
              <button 
                type="button" 
                onClick={() => {
                  secureStorage.removeItem('user_gemini_api_key');
                  setApiKeyInput('');
                  showToast('ØªÙ… Ù…Ø³Ø­ Ø§Ù„Ù…ÙØªØ§Ø­ Ø§Ù„Ù…Ø­ÙÙˆØ¸ Ù…Ù† Ø§Ù„Ù…ØªØµÙØ­ ðŸ—‘ï¸', 'info');
                }}
                className="px-3 py-2 text-xs font-bold text-red-500 hover:bg-red-50 rounded-xl transition-colors border border-red-100"
              >
                Ù…Ø³Ø­ Ø§Ù„Ù…ÙØªØ§Ø­ Ø§Ù„Ù…Ø­ÙÙˆØ¸ ðŸ—‘ï¸
              </button>
              <div className="flex gap-2">
                <button 
                  type="button" 
                  onClick={() => setIsKeyModalOpen(false)}
                  className="px-4 py-2 text-xs font-bold text-slate-500 hover:bg-slate-100 rounded-xl transition-colors"
                >
                  Ø¥Ù„ØºØ§Ø¡
                </button>
                <button 
                  type="button" 
                  onClick={handleSaveApiKey}
                  className="px-5 py-2 text-xs font-bold bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 shadow-md shadow-indigo-100 transition-all"
                >
                  Ø­ÙØ¸ Ø§Ù„Ù…ÙØªØ§Ø­ Ø¨Ø§Ù„Ù…Ø³ØªØ¹Ø±Ø¶ ðŸ’¾
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PatientManager;

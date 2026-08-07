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
  const [apiKeyInput, setApiKeyInput] = useState(() => (typeof window !== 'undefined' ? (localStorage.getItem('user_gemini_api_key') || (secureStorage.getItem('user_gemini_api_key') as string) || '') : ''));

  const handleSaveApiKey = () => {
    const val = apiKeyInput.trim();
    if (val) {
      localStorage.setItem('user_gemini_api_key', val);
      secureStorage.setItem('user_gemini_api_key', val);
      showToast('تم حفظ مفتاح AI المباشر بنجاح! 🟢', 'success');
    } else {
      localStorage.removeItem('user_gemini_api_key');
      secureStorage.removeItem('user_gemini_api_key');
      showToast('تم إزالة مفتاح AI المباشر واستخدام الوضع التلقائي', 'info');
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

  const queryModifier = (query: any) => {
    if (searchTerm) {
      query = query.or(`full_name.ilike.%${searchTerm}%,national_id.ilike.%${searchTerm}%`);
    }
    return query;
  };

  const { data: patients, loading, refresh } = usePagination<Patient>('hims_patients', {
    select: '*',
    pageSize: 15,
    orderBy: 'full_name'
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
            { id: '11111111-1111-4111-a111-222222222222', full_name: 'أحمد محمود علي', national_id: '29508120101543', dob: '1995-08-12', gender: 'male', blood_type: 'O+', phone: '01012345678', customer_id: 'cust-1' },
            { id: '11111111-1111-4111-a111-444444444444', full_name: 'سارة إبراهيم الشريف', national_id: '29803241402212', dob: '1998-03-24', gender: 'female', blood_type: 'A+', phone: '01123456789', customer_id: 'cust-2' },
            { id: '11111111-1111-4111-a111-555555555555', full_name: 'محمد عبد الرحمن خالد', national_id: '28911050203341', dob: '1989-11-05', gender: 'male', blood_type: 'B+', phone: '01234567890', customer_id: 'cust-3' },
            { id: '11111111-1111-4111-a111-666666666666', full_name: 'فاطمة الزهراء حسن', national_id: '30105150104432', dob: '2001-05-15', gender: 'female', blood_type: 'AB+', phone: '01543216789', customer_id: 'cust-4' }
          ];
        }

        setDisplayedPatients(offlineList);
      } catch (err) {
        console.error('Failed to load offline patients:', err);
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
        showToast('تم تسجيل المريض محلياً بنجاح (سيتم التزامن تلقائياً عند عودة الاتصال) 📶', 'warning');
        setIsModalOpen(false);
        setEditingId(null);
        loadPatients();
        return;
      }

      if (editingId) {
        const { error } = await supabase.from('hims_patients').update(patientData).eq('id', editingId);
        if (error) throw error;
        showToast('تم تحديث بيانات المريض بنجاح', 'success');
      } else {
        const { error } = await supabase.from('hims_patients').insert(patientData);
        if (error) throw error;
        showToast('تم تسجيل المريض وفتح ملف مالي آلياً', 'success');
      }

      setIsModalOpen(false);
      setEditingId(null);
      refresh();
    } catch (err: any) {
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
          // 🛡️ توحيد: جلب الاسم من رابط البروفايل الصحيح لضمان ظهور اسم الطبيب في القائمة
          .select('id, specialization, is_active, profile:profile_id(full_name)')
          .eq('organization_id', orgId)
          .eq('is_active', true);
        setDoctors(data || []);
        setLoadingDoctors(false);
      };
      fetchDoctors();
    }
  }, [isVisitModalOpen, organization?.id, currentUser?.organization_id]);

  const handleStartVisit = async (values: any) => {
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
        showToast('تم فتح الزيارة محلياً بنجاح (سيتم التزامن تلقائياً عند عودة الاتصال) 📶', 'warning');
        setIsVisitModalOpen(false);
        return;
      }

      const { error } = await supabase.from('hims_visits').insert([visitPayload]);
      if (error) throw error;
      showToast('تم فتح الزيارة وإرسال المريض للعيادة بنجاح ✅', 'success');
      setIsVisitModalOpen(false);
    } catch (err: any) {
      showToast(err.message, 'error');
    }
  };

  const handleViewMedicalRecord = (patient: Patient) => {
    setSelectedPatient(patient);
    setIsMedicalRecordModalOpen(true);
  };

  // 🚀 محرك المسح الضوئي للبطاقة (OCR Simulation & Intelligence)
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

      showToast('تم مسح البطاقة واستخراج البيانات آلياً بنجاح ✅', 'success');
    } catch (err: any) {
      showToast('فشل في قراءة بيانات البطاقة: ' + err.message, 'error');
    } finally {
      setIsScanning(false);
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-black text-slate-800 flex items-center gap-2">
            <Activity className="text-blue-600" /> إدارة السجلات الطبية
          </h1>
          <p className="text-slate-500 text-sm">تسجيل المرضى ومتابعة حالاتهم الصحية والمالية</p>
        </div>
        <button 
          onClick={() => {
            setEditingId(null);
            setFormData({ full_name: '', national_id: '', dob: '', gender: 'male', blood_type: 'O+', phone: '' });
            setIsModalOpen(true);
          }}
          className="bg-blue-600 text-white px-5 py-2.5 rounded-xl font-bold flex items-center gap-2 hover:bg-blue-700 shadow-lg shadow-blue-200 transition-all"
        >
          <UserPlus size={20} /> تسجيل مريض جديد
        </button>
      </div>

      <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-200 flex gap-4">
        <div className="relative flex-1">
          <Search className="absolute right-3 top-3 text-slate-400" size={20} />
          <input 
            type="text"
            placeholder="بحث باسم المريض أو الرقم القومي..."
            className="w-full pr-10 pl-4 py-2.5 border border-slate-200 rounded-xl outline-none focus:border-blue-500 transition-colors"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <button className="bg-slate-50 text-slate-600 px-4 py-2.5 rounded-xl border border-slate-200 font-bold flex items-center gap-2 hover:bg-slate-100">
          <Filter size={18} /> تصفية
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
                    if (window.confirm('هل أنت متأكد من حذف بيانات هذا المريض نهائياً؟')) {
                      const { error } = await supabase.from('hims_patients').delete().eq('id', patient.id);
                      if (error) showToast(error.message, 'error');
                      else {
                        showToast('تم حذف المريض بنجاح', 'success');
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
                  {patient.gender === 'male' ? 'ذكر' : 'أنثى'}
                </span>
                <span className="px-2 py-1 bg-red-100 text-red-700 rounded-lg text-xs font-bold">
                  فصيلة: {patient.blood_type}
                </span>
              </div>
            </div>
            <div className="mt-5 pt-4 border-t border-slate-100 grid grid-cols-2 gap-2">
                <button 
                  onClick={() => handleViewMedicalRecord(patient)}
                  className="bg-slate-800 text-white py-2 rounded-xl text-xs font-bold hover:bg-slate-900 transition-colors flex items-center justify-center gap-1"
                >
                  <FileText size={14} /> ملف المريض
                </button>
               <button 
                onClick={() => { setSelectedPatient(patient); setIsVisitModalOpen(true); }}
                className="bg-blue-50 text-blue-700 py-2 rounded-xl text-xs font-bold hover:bg-blue-100 transition-colors flex items-center justify-center gap-1"
               >
                 <Plus size={14} /> زيارة جديدة
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
                {editingId ? 'تعديل بيانات المريض' : 'تسجيل مريض جديد'}
              </h2>
              <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-red-500 transition-colors"><X size={24} /></button>
            </div>
            <form onSubmit={handleSave} className="p-8 space-y-5">
              {/* 📸 زر المسح الضوئي الذكي (ID OCR Scanner) + زر المفتاح المباشر */}
              <div className="bg-indigo-50 p-4 rounded-[2rem] border-2 border-dashed border-indigo-200 mb-2 hover:bg-indigo-100/80 transition-all">
                <div className="flex items-center justify-between gap-2 mb-2 pb-2 border-b border-indigo-100">
                  <span className="text-xs font-black text-indigo-900 flex items-center gap-1">
                    <Camera size={16} /> مسح وتعبئة البيانات تلقائياً
                  </span>
                  <button 
                    type="button"
                    onClick={() => setIsKeyModalOpen(true)}
                    className="text-xs text-indigo-700 hover:text-indigo-900 bg-white px-2.5 py-1 rounded-xl border border-indigo-200 font-bold flex items-center gap-1 shadow-sm transition-all hover:bg-indigo-50"
                  >
                    <Key size={13} /> {(typeof window !== 'undefined' && (localStorage.getItem('user_gemini_api_key') || secureStorage.getItem('user_gemini_api_key'))) ? 'مفتاح AI المباشر: 🟢' : 'إدخال مفتاح AI المباشر 🔑'}
                  </button>
                </div>
                <label className="flex flex-col items-center justify-center cursor-pointer py-1">
                  <div className="flex items-center gap-2 text-indigo-700 font-black">
                    {isScanning ? <Loader2 className="animate-spin" size={20} /> : <Camera size={20} />}
                    <span>{isScanning ? 'جاري تحليل بيانات البطاقة...' : 'رفع صورة البطاقة الشخصية (OCR)'}</span>
                  </div>
                  <input type="file" accept="image/*" className="hidden" onChange={handleIDScan} disabled={isScanning} />
                  <p className="text-[10px] text-indigo-400 mt-1 font-bold">ارفع صورة واضحة للبطاقة (وجه أمامي) لملء البيانات آلياً</p>
                </label>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-1">الاسم بالكامل</label>
                  <input 
                    required
                    type="text"
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-blue-500 outline-none"
                    placeholder="أدخل الاسم رباعي..."
                    value={formData.full_name}
                    onChange={e => setFormData({...formData, full_name: e.target.value})}
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-bold text-slate-700 mb-1">الرقم القومي (14 رقم)</label>
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
                    <label className="block text-sm font-bold text-slate-700 mb-1">تاريخ الميلاد</label>
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
                    <label className="block text-sm font-bold text-slate-700 mb-1">الجنس</label>
                    <select 
                      className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-blue-500 outline-none"
                      value={formData.gender}
                      onChange={e => setFormData({...formData, gender: e.target.value as any})}
                    >
                      <option value="male">ذكر</option>
                      <option value="female">أنثى</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-slate-700 mb-1">فصيلة الدم</label>
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
                  <label className="block text-sm font-bold text-slate-700 mb-1">رقم الهاتف</label>
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
                {editingId ? 'تحديث البيانات' : 'حفظ بيانات المريض وفتح ملف مالي'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* مودال فتح زيارة جديدة */}
      <Modal
        title={<b>تسجيل دخول مريض - فتح زيارة عيادة/طوارئ</b>}
        open={isVisitModalOpen}
        onCancel={() => setIsVisitModalOpen(false)}
        footer={null}
      >
        <Form layout="vertical" onFinish={handleStartVisit} className="pt-4">
          <div className="bg-blue-50 p-4 rounded-xl mb-4 border border-blue-100">
            <b>المريض:</b> {selectedPatient?.full_name}
          </div>
          <Form.Item name="visit_type" label="نوع الدخول" initialValue="outpatient" rules={[{required: true}]}>
            <Select options={[
              { label: '🏥 عيادة خارجية', value: 'outpatient' },
              { label: '🚨 طوارئ واستقبال', value: 'emergency' },
              { label: '🛌 تنويم داخلي', value: 'inpatient' }
            ]} />
          </Form.Item>
          <Form.Item name="doctor_id" label="الطبيب المعالج" rules={[{required: true}]}>
            <Select 
              loading={loadingDoctors} 
              placeholder="اختر الطبيب المناسب..."
              options={doctors.map(d => ({ label: `${d.profile?.full_name || 'طبيب غير مسمى'} (${d.specialization})`, value: d.id }))}
            />
          </Form.Item>
          <Form.Item name="triage_level" label="مستوى الفرز (للطوارئ فقط)">
            <Select placeholder="حدد درجة الخطورة" options={[
              { label: '🔴 إنعاش فوري', value: 'level_1_resuscitation' },
              { label: '🟠 طارئ جداً', value: 'level_2_emergent' },
              { label: '🟡 عاجل', value: 'level_3_urgent' },
              { label: '🟢 مستقر', value: 'level_5_non_urgent' }
            ]} />
          </Form.Item>
          <Form.Item name="chief_complaint" label="الشكوى الرئيسية / ملاحظات الاستقبال">
            <Input.TextArea placeholder="مثال: ارتفاع في الحرارة، ألم في الظهر..." />
          </Form.Item>
          <Button type="primary" htmlType="submit" block size="large" className="bg-blue-600 rounded-xl font-bold h-12">اعتماد الدخول وتحويل للطبيب</Button>
        </Form>
      </Modal>

      {/* مودال عرض الملف الطبي */}
      <Modal
        title={<b>الملف الطبي للمريض: {selectedPatient?.full_name}</b>}
        open={isMedicalRecordModalOpen}
        onCancel={() => setIsMedicalRecordModalOpen(false)}
        footer={null}
        width="80%"
      >
        {selectedPatient && <PatientMedicalRecord patientId={selectedPatient.id} />}
      </Modal>

      {/* مودال إدخال مفتاح AI المباشر للمتصفح */}
      {isKeyModalOpen && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-[110] flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md p-6 space-y-4 border border-slate-100 animate-in zoom-in-95 duration-200">
            <div className="flex justify-between items-center border-b border-slate-100 pb-3">
              <h3 className="text-lg font-black text-slate-800 flex items-center gap-2">
                <Key className="text-indigo-600" size={20} /> إعداد مفتاح الذكاء الاصطناعي المباشر
              </h3>
              <button onClick={() => setIsKeyModalOpen(false)} className="text-slate-400 hover:text-red-500 transition-colors"><X size={20} /></button>
            </div>
            <p className="text-xs text-slate-500 leading-relaxed">
              قم بإدخال مفتاح <b>Gemini API Key</b> الخاص بك ليعمل مسح البطاقات مباشرة من متصفحك دون أي مراجعة لسيرفرات Vercel أو البيئات الخارجية.
            </p>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">مفتاح API Key (من Google AI Studio):</label>
              <input 
                type="password"
                className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none text-sm font-mono"
                placeholder="AIzaSy..."
                value={apiKeyInput}
                onChange={e => setApiKeyInput(e.target.value)}
              />
            </div>
            <div className="flex gap-2 justify-end pt-2">
              <button 
                type="button" 
                onClick={() => setIsKeyModalOpen(false)}
                className="px-4 py-2 text-xs font-bold text-slate-500 hover:bg-slate-100 rounded-xl transition-colors"
              >
                إلغاء
              </button>
              <button 
                type="button" 
                onClick={handleSaveApiKey}
                className="px-5 py-2 text-xs font-bold bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 shadow-md shadow-indigo-100 transition-all"
              >
                حفظ المفتاح بالمستعرض 💾
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PatientManager;
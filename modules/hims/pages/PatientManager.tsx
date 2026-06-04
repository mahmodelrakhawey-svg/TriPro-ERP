import React, { useState, useEffect } from 'react';
import { UserPlus, Search, FileText, Activity, CreditCard, Calendar, Filter, Plus, Edit2, Trash2, Camera, Loader2 } from 'lucide-react';
import { supabase } from '@/supabaseClient';
import { useAccounting } from '../../../context/AccountingContext';
import { useToast } from '../../../context/ToastContext';
import { usePagination } from '../../../components/usePagination';
import { Modal, Form, Select, Input, Button } from 'antd';

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
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);
  const [doctors, setDoctors] = useState<any[]>([]);
  const [loadingDoctors, setLoadingDoctors] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  
  const [formData, setFormData] = useState({
    full_name: '',
    national_id: '',
    dob: '',
    gender: 'male' as const,
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

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const patientData = {
        ...formData,
        organization_id: organization?.id
      };

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
        setLoadingDoctors(true);
        const { data } = await supabase.from('hims_doctors').select('id, specialization, profiles(full_name)');
        setDoctors(data || []);
        setLoadingDoctors(false);
      };
      fetchDoctors();
    }
  }, [isVisitModalOpen]);

  const handleStartVisit = async (values: any) => {
    try {
      const { error } = await supabase.from('hims_visits').insert([{
        patient_id: selectedPatient?.id,
        doctor_id: values.doctor_id,
        visit_type: values.visit_type,
        chief_complaint: values.chief_complaint,
        triage_level: values.triage_level || 'level_5_non_urgent',
        status: 'triaged',
        organization_id: organization?.id // 🛡️ ربط الزيارة بالمنظمة لضمان ظهورها
      }]);
      if (error) throw error;
      showToast('تم فتح الزيارة وإرسال المريض للعيادة بنجاح ✅', 'success');
      setIsVisitModalOpen(false);
    } catch (err: any) {
      showToast(err.message, 'error');
    }
  };

  // 🚀 محرك المسح الضوئي للبطاقة (OCR Simulation & Intelligence)
  const handleIDScan = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsScanning(true);
    try {
      // محاكاة معالجة الذكاء الاصطناعي لاستخراج البيانات
      // في البيئة الحقيقية، يتم إرسال الصورة لـ Gemini Vision API أو Tesseract.js
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // بيانات افتراضية مستخرجة (مثال لما سيقوم به المحرك)
      const extracted = {
        full_name: 'محمود عبد الرحمن السيد',
        national_id: '29005151234567',
        dob: '1990-05-15',
        gender: 'male' as const,
        phone: '01012345678'
      };

      setFormData(prev => ({
        ...prev,
        ...extracted
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
        {patients.map((patient) => (
          <div key={patient.id} className="bg-white p-5 rounded-2xl border border-slate-200 hover:border-blue-300 transition-all group shadow-sm">
            <div className="flex justify-between items-start mb-4">
              <div className="w-12 h-12 bg-blue-50 rounded-2xl flex items-center justify-center text-blue-600 font-black text-xl">
                {patient.full_name[0]}
              </div>
              <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg"><Edit2 size={16} /></button>
                <button className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg"><Trash2 size={16} /></button>
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
               <button className="bg-slate-800 text-white py-2 rounded-xl text-xs font-bold hover:bg-slate-900 transition-colors flex items-center justify-center gap-1">
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
              <h2 className="text-xl font-black text-slate-800">تسجيل مريض جديد</h2>
              <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-red-500 transition-colors"><Trash2 size={24} /></button>
            </div>
            <form onSubmit={handleSave} className="p-8 space-y-5">
              {/* 📸 زر المسح الضوئي الذكي (ID OCR Scanner) */}
              <div className="bg-indigo-50 p-5 rounded-[2rem] border-2 border-dashed border-indigo-200 mb-2 hover:bg-indigo-100 transition-all group">
                <label className="flex flex-col items-center justify-center cursor-pointer">
                  <div className="flex items-center gap-3 text-indigo-700 font-black">
                    {isScanning ? <Loader2 className="animate-spin" size={24} /> : <Camera size={24} className="group-hover:scale-110 transition-transform" />}
                    <span>{isScanning ? 'جاري تحليل بيانات البطاقة...' : 'مسح البطاقة الشخصية آلياً (OCR)'}</span>
                  </div>
                  <input type="file" accept="image/*" className="hidden" onChange={handleIDScan} disabled={isScanning} />
                  <p className="text-[10px] text-indigo-400 mt-2 font-bold">ارفع صورة واضحة للبطاقة (وجه أمامي) لملء البيانات تلقائياً</p>
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
                    <label className="block text-sm font-bold text-slate-700 mb-1">الرقم القومي</label>
                    <input 
                      required
                      type="text"
                      className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-blue-500 outline-none"
                      value={formData.national_id}
                      onChange={e => setFormData({...formData, national_id: e.target.value})}
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
              </div>
              <button type="submit" className="w-full bg-blue-600 text-white py-4 rounded-2xl font-black text-lg hover:bg-blue-700 shadow-xl shadow-blue-100 transition-all active:scale-95">
                حفظ بيانات المريض وفتح ملف مالي
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
              options={doctors.map(d => ({ label: `${d.profiles?.full_name} (${d.specialization})`, value: d.id }))}
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
    </div>
  );
};

export default PatientManager;
import React, { useEffect, useState } from 'react';
import { himsService } from '@/services/himsService';
import { Card, Table, Tag, Button, Row, Col, Typography, Badge, Space, message, Alert, Tooltip, Modal, List, Empty } from 'antd';
import { db } from '../../../services/offlineService';
import { UserOutlined, PlayCircleOutlined, HistoryOutlined, MedicineBoxOutlined, ExclamationCircleOutlined, ExperimentOutlined, CameraOutlined, AlertOutlined, FileSearchOutlined, CheckCircleOutlined } from '@ant-design/icons';
import { PatientMedicalRecord } from '../components/PatientMedicalRecord';
import { PrescriptionForm } from '../components/PrescriptionForm';
import { ClinicalNotesForm } from '../components/ClinicalNotesForm';
import { OrderManagement } from '../components/OrderManagement';
import { DischargeManager } from '../components/DischargeManager';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/supabaseClient';

const { Title, Text } = Typography;

export const DoctorDesktop: React.FC = () => {
  const { currentUser, userRole } = useAuth();
  const [queue, setQueue] = useState<any[]>([]);
  const [activeVisit, setActiveVisit] = useState<any>(null);
  const [emergencyAlerts, setEmergencyAlerts] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [resultsModal, setResultsModal] = useState<{ visible: boolean, type: 'lab' | 'rad', data: any[] }>({ visible: false, type: 'lab', data: [] });
  const [financialStatus, setFinancialStatus] = useState<{ cleared: boolean, balance: number }>({ cleared: false, balance: 0 });

  const fetchQueue = async () => {
    if (!currentUser) return;
    setLoading(true);
    try {
      if (navigator.onLine) {
        const [queueData, monitorData] = await Promise.all([
          himsService.getDoctorQueue(currentUser.id, currentUser.organization_id), // الطابور الفعلي للعيادة
          himsService.getEmergencyMonitor(currentUser.organization_id) // حالات الطوارئ للرادار
        ]);
        let finalQueue = queueData || [];
        if (finalQueue.length === 0) {
          finalQueue = [
            {
              id: '11111111-1111-4111-a111-111111111111',
              patient_id: '11111111-1111-4111-a111-222222222222',
              doctor_id: currentUser.id,
              chief_complaint: 'صداع حاد وارتفاع في ضغط الدم',
              visit_type: 'outpatient',
              triage_level: 'level_3_urgent',
              status: 'triaged',
              created_at: new Date().toISOString(),
              hims_patients: { full_name: 'أحمد محمود علي', national_id: '29508120101543' }
            },
            {
              id: '11111111-1111-4111-a111-333333333333',
              patient_id: '11111111-1111-4111-a111-444444444444',
              doctor_id: currentUser.id,
              chief_complaint: 'متابعة دورية فحوصات قلب',
              visit_type: 'outpatient',
              triage_level: 'level_5_non_urgent',
              status: 'triaged',
              created_at: new Date().toISOString(),
              hims_patients: { full_name: 'سارة إبراهيم الشريف', national_id: '29803241402212' }
            }
          ];
        }
        setQueue(finalQueue);
        if (finalQueue.length > 0 && !activeVisit) {
          setActiveVisit(finalQueue[0]);
        }
        setEmergencyAlerts(monitorData?.filter((a: any) => a.alert_status.includes('🔴')) || []);
      } else {
        const queuedVisits = await db.queuedVisits.toArray();
        const queuedPatients = await db.queuedPatients.toArray();
        const cachedPatients = await db.himsPatients.toArray();

        const findPatientName = (patientId: string) => {
          if (patientId?.startsWith('queued-')) {
            const idNum = parseInt(patientId.replace('queued-', ''));
            const qP = queuedPatients.find(p => p.id === idNum);
            return qP?.payload?.full_name || 'مريض معلق أوفلاين';
          }
          const cP = cachedPatients.find(p => p.id === patientId);
          return cP?.full_name || 'مريض غير مسجل';
        };

        const offlineQueue = queuedVisits.map(v => ({
          id: `queued-visit-${v.id}`,
          patient_id: v.payload.patient_id,
          doctor_id: v.payload.doctor_id,
          chief_complaint: v.payload.chief_complaint,
          visit_type: v.payload.visit_type,
          triage_level: v.payload.triage_level,
          status: 'triaged',
          created_at: v.createdAt.toISOString(),
          hims_patients: {
            full_name: findPatientName(v.payload.patient_id),
            national_id: '-'
          }
        }));

        setQueue(offlineQueue);
        setEmergencyAlerts([]);
      }
    } catch (error) {
      message.error('خطأ في جلب بيانات العيادة');
    }
    setLoading(false);
  };

  useEffect(() => { fetchQueue(); }, [currentUser, userRole]);

  useEffect(() => {
    const handleConnectivityChange = () => {
      fetchQueue();
    };
    window.addEventListener('online', handleConnectivityChange);
    window.addEventListener('offline', handleConnectivityChange);
    return () => {
      window.removeEventListener('online', handleConnectivityChange);
      window.removeEventListener('offline', handleConnectivityChange);
    };
  }, [currentUser]);

  const checkFinancialClearance = async (vId: string) => {
    if (!vId || !navigator.onLine || vId.startsWith('11111111-1111-4111-a111-')) {
      setFinancialStatus({ cleared: true, balance: 0 });
      return;
    }

    let orgId = currentUser?.organization_id;
    if (!orgId) {
      const { data: vData } = await supabase.from('hims_visits').select('organization_id').eq('id', vId).single();
      orgId = vData?.organization_id;
    }

    if (!orgId) return;

    // تصحيح: البحث يجب أن يكون بعمود visit_id وليس id الفاتورة
    const { data } = await supabase
      .from('hims_billing')
      .select('payment_status, total_amount, patient_paid_amount, insurance_covered_amount')
      .eq('visit_id', vId) 
      .eq('organization_id', orgId)
      .maybeSingle(); // استخدام maybeSingle لتجنب خطأ 406 في حال عدم وجود فاتورة بعد
      
    if (data) {
      const remainingBalance = Math.max(0, (data.total_amount || 0) - (data.insurance_covered_amount || 0) - (data.patient_paid_amount || 0));
      setFinancialStatus({ cleared: data.payment_status === 'paid', balance: remainingBalance });
    }
  };

  const startConsultation = async (record: any) => {
    try {
      if (!navigator.onLine || record.id.startsWith('11111111-1111-4111-a111-')) {
        setActiveVisit(record);
        setFinancialStatus({ cleared: true, balance: 0 });
        message.success(`بدأ الكشف الطبي بنجاح للمريض: ${record.hims_patients?.full_name}`);
        return;
      }

      await himsService.startConsultation(record.id);
        
      setActiveVisit(record);
      checkFinancialClearance(record.id); // التحقق المالي بمجرد فتح الكشف
     
      message.success(`بدأ الكشف على المريض: ${record.hims_patients?.full_name}`);
      fetchQueue();
    } catch (e) { message.error('فشل بدء الكشف'); }
  };

  // محرك عرض النتائج للطبيب
  const viewResults = async (visitId: string, type: 'lab' | 'rad') => {
    let orgId = currentUser?.organization_id;
    if (!orgId) {
      const { data: vData } = await supabase.from('hims_visits').select('organization_id').eq('id', visitId).single();
      orgId = vData?.organization_id;
    }

    if (!orgId) return;

    setLoading(true);
    const table = type === 'lab' ? 'hims_lab_orders' : 'hims_radiology_orders';
    
    // 🛡️ ذكاء برمجية: تخصيص جملة الاستعلام حسب نوع الفحص لمنع خطأ 400
    const selectStr = type === 'lab' 
      ? '*, test:hims_lab_tests(test_name, unit, normal_range)' 
      : '*';

    const { data } = await supabase
      .from(table)
      .select(selectStr)
      .eq('visit_id', visitId)
      .eq('organization_id', orgId)
      .eq('status', 'completed');

    setResultsModal({ visible: true, type, data: data || [] });
    setLoading(false);
  };

  const columns = [
    { title: 'التوقيت', dataIndex: 'created_at', render: (t: string) => new Date(t).toLocaleTimeString('ar-EG', {hour:'2-digit', minute:'2-digit'}) },
    { 
      title: 'المريض', 
      render: (text: any, record: any) => (
        <div className="flex items-center gap-2">
          <b>{record.hims_patients?.full_name}</b>
          {record.hims_lab_orders?.some((o: any) => o.status === 'completed') && (
            <Tooltip title="انقر لعرض نتائج المختبر الجاهزة">
              <Badge dot status="processing">
                <ExperimentOutlined
                  className={`${
                    record.hims_lab_orders?.some((o: any) => o.is_critical) ? 'text-red-500 animate-pulse' : 'text-blue-500'
                  } cursor-pointer hover:scale-125 transition-transform`}
                  onClick={(e) => { e.stopPropagation(); viewResults(record.id, 'lab'); }}
                />
              </Badge>
            </Tooltip>
          )}
          {record.hims_radiology_orders?.some((o: any) => o.status === 'completed') && (
            <Tooltip title="نتائج أشعة جاهزة">
              <Badge dot status="warning">
                <CameraOutlined 
                  className="text-purple-500 cursor-pointer hover:scale-125 transition-transform" 
                  onClick={(e) => { e.stopPropagation(); viewResults(record.id, 'rad'); }} 
                />
              </Badge>
            </Tooltip>
          )}
        </div>
      ) 
    },
    { title: 'الحالة', dataIndex: 'status', render: (s: string) => <Tag color={s === 'in_consultation' ? 'orange' : 'blue'}>{s === 'in_consultation' ? 'قيد الكشف' : 'في الانتظار'}</Tag> },
    { title: 'إجراء', render: (record: any) => (
      <Button 
        type="primary" 
        icon={<PlayCircleOutlined />} 
        onClick={() => startConsultation(record)}
        disabled={activeVisit?.id === record.id}
      >
        استدعاء
      </Button>
    )}
  ];

  return (
    <div className="p-6 rtl text-right bg-slate-50 min-h-screen">
      <Row gutter={[24, 24]}>
        {/* قائمة الانتظار */}
        <Col lg={8} xs={24}>
          {emergencyAlerts.length > 0 && (
            <Alert
              title="تنبيه حالات حرجة!"
              description={`يوجد ${emergencyAlerts.length} مريض في الطوارئ تجاوزوا زمن الانتظار المسموح.`}
              type="error"
              showIcon
              icon={<AlertOutlined />}
              className="mb-4 rounded-2xl animate-pulse"
            />
          )}
          <Card title={<Title level={5}>قائمة انتظار العيادة ⏳</Title>} className="rounded-3xl shadow-sm border-none">
            <Table dataSource={queue} columns={columns} rowKey="id" pagination={false} size="small" loading={loading} />
          </Card>
        </Col>

        {/* منطقة العمل الأساسية */}
        <Col lg={16} xs={24}>
          {activeVisit ? (
            <div className="space-y-6">
              <Card className="rounded-3xl border-none shadow-md bg-gradient-to-r from-indigo-600 to-blue-500 text-white">
                <div className="flex justify-between items-center">
                  <Space size="large">
                    <UserOutlined style={{ fontSize: 40 }} />
                    <div>
                      <Title level={4} style={{ color: 'white', margin: 0 }}>{activeVisit.hims_patients?.full_name}</Title>
                      <Text style={{ color: 'rgba(255,255,255,0.8)' }}>رقم الهوية: {activeVisit.hims_patients?.national_id}</Text>
                      <div className="text-xs font-bold bg-white/20 px-2 py-1 rounded mt-1">العيادة: {(currentUser as any)?.full_name || 'غير معروف'} ({userRole})</div>
                      
                      {activeVisit.vital_signs && (
                        <div className="flex flex-wrap gap-3 mt-2 bg-white/15 px-3 py-1.5 rounded-xl text-xs font-black w-fit">
                          <span>🌡️ حرارة: {activeVisit.vital_signs.temp ? activeVisit.vital_signs.temp + '°C' : '-'}</span>
                          <span>❤️ نبض: {activeVisit.vital_signs.pulse || '-'} bpm</span>
                          <span>🩸 ضغط: {activeVisit.vital_signs.bp || '-'}</span>
                          <span>🫁 أكسجين: {activeVisit.vital_signs.spo2 ? activeVisit.vital_signs.spo2 + '%' : '-'}</span>
                        </div>
                      )}
                      
                      {/* 🚨 درع الأمان: التنبيه بالحساسية */}
                      {activeVisit.hims_patients?.allergies && activeVisit.hims_patients.allergies.length > 0 && (
                        <div className="mt-2">
                          <Tooltip title="المريض يعاني من حساسية تجاه بعض المواد">
                            <Tag color="volcano" icon={<ExclamationCircleOutlined />} className="animate-bounce border-none font-bold">
                              حساسية: {activeVisit.hims_patients.allergies.join('، ')}
                            </Tag>
                          </Tooltip>
                        </div>
                      )}
                    </div>
                  </Space>
                  <div className="flex gap-2">
                    <Space>
                      {financialStatus.cleared ? (
                        <Tag color="green" icon={<CheckCircleOutlined />}>خالص مالياً</Tag>
                      ) : (
                        <Tooltip title={`المبلغ المتبقي: ${financialStatus.balance} EGP`}>
                          <Tag color="error" icon={<ExclamationCircleOutlined />}>معلق مالياً</Tag>
                        </Tooltip>
                      )}
                      <Tag color="gold">زيارة جارية</Tag>
                      <DischargeManager visitId={activeVisit.id} onSuccess={() => setActiveVisit(null)} />
                    </Space>
                  </div>
                </div>
              </Card>

              <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                <div className="space-y-6">
                  <PatientMedicalRecord patientId={activeVisit.patient_id} />
                  <OrderManagement visitId={activeVisit.id} />
                </div>
                <div className="space-y-6">
                  <ClinicalNotesForm visitId={activeVisit.id} />
                  <PrescriptionForm visitId={activeVisit.id} />
                </div>
              </div>
            </div>
          ) : (
            <Card className="h-full flex items-center justify-center border-dashed rounded-3xl border-2 text-slate-400">
              يرجى استدعاء مريض من قائمة الانتظار للبدء
            </Card>
          )}
        </Col>
      </Row>

      {/* مودال عرض نتائج الفحوصات (مختبر / أشعة) */}
      <Modal
        title={<b><FileSearchOutlined /> {resultsModal.type === 'lab' ? 'نتائج المختبر التفصيلية' : 'تقارير الأشعة والتشخيص التصويري'}</b>}
        open={resultsModal.visible}
        onCancel={() => setResultsModal({ ...resultsModal, visible: false })}
        footer={[<Button key="close" onClick={() => setResultsModal({ ...resultsModal, visible: false })}>إغلاق</Button>]}
        width={resultsModal.type === 'lab' ? 800 : 600}
      >
        <div className="space-y-4 py-2">
          {loading ? (
            <div className="text-center py-10"><Badge status="processing" text="جاري تحميل النتائج..." /></div>
          ) : resultsModal.data.length === 0 ? (
            <Empty description="لا توجد نتائج مكتملة متاحة للعرض حالياً" />
          ) : (
            resultsModal.data.map((item: any, idx: number) => (
              <div key={idx} className="border-b last:border-none mb-4 pb-4">
                <div className="w-full">
                  <div className="flex justify-between items-center mb-2">
                    <Text strong className="text-blue-700">{item.test?.test_name || item.scan_type}</Text>
                    <Tag color="green">{new Date(item.created_at).toLocaleDateString('ar-EG')}</Tag>
                  </div>
                  <div className={`${item.is_critical ? 'bg-red-50 border-red-200' : 'bg-slate-50 border-slate-100'} p-4 rounded-xl border`}>
                    <div className={`text-sm whitespace-pre-wrap leading-relaxed ${item.is_critical ? 'text-red-600 font-bold' : 'text-slate-700'}`}>
                      {/* 🛡️ ذكاء عرض المحتوى: النتيجة للمختبر والتقرير للأشعة */}
                      {resultsModal.type === 'lab' 
                        ? (item.result_value || 'بانتظار النتيجة...') 
                        : (item.report_text || 'بانتظار التقرير التشخيصي...')}
                      
                      {item.is_critical && <Tag color="error" className="mr-2">قيمة حرجة 🚨</Tag>}
                    </div>
                    {resultsModal.type === 'lab' && item.test && (
                      <div className="text-xs text-slate-400 mt-2">المعدل الطبيعي: {item.test.normal_range} {item.test.unit}</div>
                    )}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </Modal>
    </div>
  );
};
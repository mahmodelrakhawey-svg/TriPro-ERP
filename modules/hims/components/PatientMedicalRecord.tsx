import React, { useEffect, useState, useCallback } from 'react';
import { Tabs, Timeline, List, Badge, Card, Statistic, Row, Col, Spin, Empty, Tag, Button, Popconfirm } from 'antd';
import { HistoryOutlined, MedicineBoxOutlined, FileSearchOutlined, HeartOutlined, CalendarOutlined, UndoOutlined } from '@ant-design/icons';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { supabase } from '@/supabaseClient';
import { useAuth } from '@/context/AuthContext';
import dayjs from 'dayjs';

export const PatientMedicalRecord: React.FC<{ patientId: string }> = ({ patientId }) => {
  const { currentUser } = useAuth();
  const [loading, setLoading] = useState(false);
  const [history, setHistory] = useState<any[]>([]);
  const [labResults, setLabResults] = useState<any[]>([]);
  const [vitalsHistory, setVitalsHistory] = useState<any[]>([]);
  const [currentMedications, setCurrentMedications] = useState<any[]>([]);
  const [vitalsChartData, setVitalsChartData] = useState<any[]>([]);
  const [clinicalNotes, setClinicalNotes] = useState<any[]>([]);
  const [radiologyReports, setRadiologyReports] = useState<any[]>([]);
  const [surgeries, setSurgeries] = useState<any[]>([]);

  const canReactivate =
    currentUser?.role === 'admin' ||
    currentUser?.role === 'super_admin' ||
    (currentUser as any)?.role === 'medical_director';

  const handleUndoDischarge = async (visitId: string) => {
    setLoading(true);
    try {
      const { error } = await supabase
        .from('hims_visits')
        .update({ status: 'in_consultation', check_out_time: null })
        .eq('id', visitId);

      if (error) throw error;
      import('antd').then(({ message }) => message.success('تم التراجع عن خروج المريض بنجاح وإعادة تنشيط الزيارة ✅'));
      fetchData();
    } catch (e: any) {
      console.error('[PatientMedicalRecord] Error undoing discharge:', e);
      import('antd').then(({ message }) => message.error('فشل التراجع عن الخروج: ' + e.message));
    } finally {
      setLoading(false);
    }
  };

  const fetchData = useCallback(async () => {
    if (!patientId || patientId === '') return;
    setLoading(true);
    try {
      // 🚀 تشغيل الاستعلامات بالتوازي بدلاً من 7 استعلامات متسلسلة
      const [visitsRes, labsRes, vitalsRes] = await Promise.all([
        supabase
          .from('hims_visits')
          .select('*')
          .eq('patient_id', patientId)
          .order('created_at', { ascending: false }),
        supabase
          .from('hims_lab_orders')
          .select('*, hims_visits!inner(patient_id), hims_lab_tests(*)')
          .eq('hims_visits.patient_id', patientId)
          .eq('status', 'completed')
          .order('created_at', { ascending: false }),
        supabase
          .from('hims_visits')
          .select('created_at, vital_signs')
          .eq('patient_id', patientId)
          .not('vital_signs', 'is', null)
          .order('created_at', { ascending: false }),
      ]);

      if (visitsRes.error) throw visitsRes.error;
      if (labsRes.error) throw labsRes.error;
      if (vitalsRes.error) throw vitalsRes.error;

      const visitIds = (visitsRes.data || []).map(v => v.id);

      // استعلامات تعتمد على visitIds — تعمل بالتوازي أيضاً
      const dependentQueries = visitIds.length > 0
        ? await Promise.all([
            supabase
              .from('hims_prescriptions')
              .select('medications')
              .in('visit_id', visitIds),
            supabase
              .from('hims_clinical_notes')
              .select('*, doctor:doctor_id(profiles(full_name))')
              .in('visit_id', visitIds)
              .order('created_at', { ascending: false }),
            supabase
              .from('hims_radiology_orders')
              .select('*')
              .in('visit_id', visitIds)
              .eq('status', 'completed')
              .order('created_at', { ascending: false }),
            supabase
              .from('hims_surgeries')
              .select('*, doctor:lead_surgeon_id(profiles(full_name))')
              .in('visit_id', visitIds)
              .order('scheduled_start', { ascending: false }),
          ])
        : [{ data: [] }, { data: [] }, { data: [] }, { data: [] }];

      const [prescRes, notesRes, radsRes, surgsRes] = dependentQueries;

      // تجهيز بيانات المخطط الزمني
      const chartData = (vitalsRes.data || []).map((v: any) => {
        const vs = v.vital_signs || {};
        const bpParts = vs.bp?.split('/') || [];
        const safeParse = (val: any) => { const p = parseFloat(val); return isNaN(p) ? 0 : p; };
        return {
          date: dayjs(v.created_at).format('YYYY-MM-DD HH:mm'),
          temp: safeParse(vs.temp),
          pulse: safeParse(vs.pulse),
          spo2: safeParse(vs.spo2),
          systolic_bp: safeParse(bpParts[0]),
          diastolic_bp: safeParse(bpParts[1]),
        };
      }).filter((d: any) => d.temp > 0 || d.pulse > 0 || d.spo2 > 0 || d.systolic_bp > 0).reverse();

      setHistory(visitsRes.data || []);
      setLabResults(labsRes.data || []);
      setVitalsHistory(vitalsRes.data || []);
      setCurrentMedications((prescRes.data || []).flatMap((p: any) => p.medications));
      setVitalsChartData(chartData);
      setClinicalNotes(notesRes.data || []);
      setRadiologyReports(radsRes.data || []);
      setSurgeries(surgsRes.data || []);
    } catch (error: any) {
      console.error('[PatientMedicalRecord] Error fetching data:', error);
      // إظهار رسالة للمستخدم بدلاً من ابتلاعها بصمت
      import('antd').then(({ message }) => message.error('فشل تحميل الملف الطبي: ' + (error?.message || 'خطأ غير متوقع')));
    } finally {
      setLoading(false);
    }
  }, [patientId]);

  useEffect(() => {
    if (patientId) fetchData();
  }, [patientId]);

  const renderVitalsChart = () => (
    <Card className="rounded-2xl border-none min-h-[300px]">
      {vitalsChartData && vitalsChartData.length > 0 ? (
        <ResponsiveContainer width="100%" height={300}>
          <LineChart
            data={vitalsChartData || []} // 🛡️ ضمان تمرير مصفوفة دائماً لمنع خطأ slice
            margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
          >
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="date" />
            <YAxis />
            <Tooltip />
            <Legend />
            <Line type="monotone" dataKey="temp" stroke="#8884d8" name="الحرارة (°C)" />
            <Line type="monotone" dataKey="pulse" stroke="#82ca9d" name="النبض (bpm)" />
            <Line type="monotone" dataKey="spo2" stroke="#ffc658" name="الأكسجين (%)" />
            <Line type="monotone" dataKey="systolic_bp" stroke="#ff7300" name="الضغط الانقباضي" />
            <Line type="monotone" dataKey="diastolic_bp" stroke="#0088FE" name="الضغط الانبساطي" />
          </LineChart>
        </ResponsiveContainer>
      ) : (
        <Empty description="لا توجد بيانات علامات حيوية للرسم البياني" />
      )}
    </Card>
  );

  return (
    <div className="bg-slate-50 rtl text-right">
      <Row gutter={16} className="mb-6">
        <Col span={24}>
          <Card className="rounded-3xl shadow-sm border-none bg-gradient-to-l from-blue-600 to-blue-400 text-white">
            <h1 className="text-2xl font-black m-0">الملف الطبي الرقمي الموحد 📁</h1>
            <p className="opacity-80">الوصول السريع لتاريخ المريض، التشخيصات، والنتائج المخبرية</p>
          </Card>
        </Col>
      </Row>

      <Spin spinning={loading}>
        <Tabs 
          defaultActiveKey="1" 
          type="card"
          items={[
            {
              key: '1',
              label: <span><HistoryOutlined /> سجل الزيارات</span>,
              children: (
                <Card className="rounded-2xl border-none min-h-[300px]">
                  {history.length > 0 ? (
                    <Timeline 
                      mode="end" // تحديث من right إلى end
                      items={history.map(visit => ({
                        color: visit.status === 'discharged' ? 'green' : 'blue',
                        title: dayjs(visit.created_at).format('YYYY-MM-DD HH:mm'),
                        content: (
                          <div className="flex justify-between items-center bg-white p-3 rounded-xl border border-slate-100 shadow-sm">
                            <div>
                              <b className="text-slate-800">{visit.visit_type === 'emergency' ? '🚨 طوارئ' : visit.visit_type === 'inpatient' ? '🛌 تنويم داخلي' : visit.visit_type === 'surgery' ? '🏥 عمليات' : '📅 عيادة'}</b>: <span className="text-slate-600">{visit.chief_complaint || 'كشف دوري'}</span>
                              {visit.status === 'discharged' && <Tag color="green" className="mr-2 font-bold">تم الخروج</Tag>}
                              {visit.status === 'in_consultation' && <Tag color="orange" className="mr-2 font-bold animate-pulse">قيد الكشف</Tag>}
                            </div>
                            {visit.status === 'discharged' && canReactivate && (
                              <Popconfirm
                                title="إلغاء إجراءات خروج المريض"
                                description="هل أنت متأكد من إلغاء خروج المريض وإعادة تنشيط هذه الزيارة في العيادة؟"
                                onConfirm={() => handleUndoDischarge(visit.id)}
                                okText="نعم، تراجع"
                                cancelText="إلغاء"
                                icon={<UndoOutlined className="text-red-500" />}
                              >
                                <Button size="small" type="dashed" danger icon={<UndoOutlined />}>
                                  تراجع عن الخروج
                                </Button>
                              </Popconfirm>
                            )}
                          </div>
                        )
                      }))}
                    />
                  ) : <Empty description="لا توجد زيارات سابقة" />}
                </Card>
              )
            },
            {
              key: '2',
              label: <span><FileSearchOutlined /> المختبر</span>,
              children: (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {labResults.map(res => (
                    <Card key={res.id} title={res.hims_lab_tests?.test_name} className="rounded-2xl shadow-sm border-slate-100">
                      <div className="flex justify-between items-center">
                        <Statistic 
                          value={res.result_value} 
                          suffix={res.hims_lab_tests?.unit} 
                          styles={{ content: { color: '#1677ff' } }} // 🎨 تحديث لمعايير AntD v5
                        />
                        <Badge status="processing" text={dayjs(res.created_at).format('DD/MM')} />
                      </div>
                    </Card>
                  ))}
                </div>
              )
            },
          {
            key: '3',
            label: <span><HeartOutlined /> المؤشرات الحيوية</span>,
            children: (
              <List
                dataSource={vitalsHistory}
                renderItem={(item) => (
                  <Card size="small" className="mb-3 rounded-xl shadow-sm border-slate-100">
                    <div className="flex justify-between items-center mb-2">
                       <Tag color="blue">{dayjs(item.created_at).format('YYYY-MM-DD HH:mm')}</Tag>
                       <Tag color="magenta">{item.vital_signs?.temp}°C</Tag>
                    </div>
                    <div className="grid grid-cols-3 gap-2 text-center">
                      <div><p className="text-[10px] text-slate-400 m-0">BP</p><b>{item.vital_signs?.bp}</b></div>
                      <div><p className="text-[10px] text-slate-400 m-0">Pulse</p><b>{item.vital_signs?.pulse}</b></div>
                      <div><p className="text-[10px] text-slate-400 m-0">SPO2</p><b>{item.vital_signs?.spo2}</b></div>
                    </div>
                  </Card>
                )}
              />
            )
          },
          {
            key: '4',
            label: <span><MedicineBoxOutlined /> الأدوية الحالية</span>,
            children: (
              <List 
                bordered 
                className="bg-white rounded-2xl" 
                dataSource={currentMedications} 
                renderItem={item => (
                  <List.Item className="flex justify-between items-center">
                    <span className="font-bold text-slate-800">{item.drug_name}</span>
                    <div className="flex gap-2">
                      {item.qty && <Tag color="blue">الكمية: {item.qty}</Tag>}
                      {item.dosage && <Tag color="green">الجرعة: {item.dosage}</Tag>}
                      {item.frequency && <Tag color="orange">التكرار: {item.frequency}</Tag>}
                    </div>
                  </List.Item>
                )} 
                locale={{ emptyText: "لا توجد أدوية جارية حالياً" }}
              />
            )
          },
          {
            key: '5',
            label: <span><HeartOutlined /> رسم بياني للعلامات الحيوية</span>,
            children: renderVitalsChart()
          },
          {
            key: '6',
            label: <span><FileSearchOutlined /> الملاحظات السريرية (SOAP)</span>,
            children: (
              <div className="space-y-4">
                {clinicalNotes.length > 0 ? (
                  clinicalNotes.map(note => (
                    <Card key={note.id} className="rounded-2xl shadow-sm border-slate-100" title={<div className="flex justify-between"><b>التاريخ: {dayjs(note.created_at).format('YYYY-MM-DD HH:mm')}</b><Tag color="blue">الطبيب: {note.doctor?.profiles?.full_name || 'غير محدد'}</Tag></div>}>
                      <div className="space-y-2">
                        {note.subjective && <div><span className="text-slate-400 block text-xs">الشكوى والملاحظات الذاتية (Subjective):</span><p className="bg-slate-50 p-2 rounded-lg text-sm m-0">"{note.subjective}"</p></div>}
                        {note.objective && <div><span className="text-slate-400 block text-xs">الفحص السريري (Objective):</span><p className="bg-slate-50 p-2 rounded-lg text-sm m-0">"{note.objective}"</p></div>}
                        {note.assessment && <div><span className="text-slate-400 block text-xs">التشخيص والتقييم (Assessment):</span><p className="bg-slate-50 p-2 rounded-lg text-sm m-0 font-bold">"{note.assessment}"</p></div>}
                        {note.plan && <div><span className="text-slate-400 block text-xs">الخطة العلاجية والتعليمات (Plan):</span><p className="bg-slate-50 p-2 rounded-lg text-sm m-0 text-indigo-700">"{note.plan}"</p></div>}
                      </div>
                    </Card>
                  ))
                ) : <Empty description="لا توجد ملاحظات سريرية SOAP مسجلة" />}
              </div>
            )
          },
          {
            key: '7',
            label: <span><FileSearchOutlined /> تقارير الأشعة</span>,
            children: (
              <div className="space-y-4">
                {radiologyReports.length > 0 ? (
                  radiologyReports.map(report => (
                    <Card key={report.id} title={<b>نوع الأشعة: {report.scan_type}</b>} extra={<Tag color="green">{dayjs(report.created_at).format('YYYY-MM-DD')}</Tag>} className="rounded-2xl shadow-sm border-slate-100">
                      <div>
                        <span className="text-slate-400 block text-xs mb-1">التقرير النهائي للأشعة:</span>
                        <p className="bg-slate-50 p-4 rounded-xl text-sm whitespace-pre-wrap leading-relaxed m-0 text-slate-800 border">
                          {report.report_text || 'لا يوجد تقرير مسجل.'}
                        </p>
                      </div>
                    </Card>
                  ))
                ) : <Empty description="لا توجد تقارير أشعة مكتملة" />}
              </div>
            )
          },
          {
            key: '8',
            label: <span><MedicineBoxOutlined /> العمليات الجراحية</span>,
            children: (
              <div className="space-y-4">
                {surgeries.length > 0 ? (
                  surgeries.map(surg => (
                    <Card key={surg.id} title={<b>عملية: {surg.surgery_name}</b>} extra={<Tag color={surg.status === 'completed' ? 'green' : 'blue'}>{surg.status === 'completed' ? 'مكتملة' : 'مجدولة'}</Tag>} className="rounded-2xl shadow-sm border-slate-100">
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <span className="text-slate-400 block text-xs">الجراح المسؤول:</span>
                          <b className="text-sm">{surg.doctor?.profiles?.full_name || 'غير محدد'}</b>
                        </div>
                        <div>
                          <span className="text-slate-400 block text-xs">تاريخ الإجراء:</span>
                          <b className="text-sm">{dayjs(surg.scheduled_start).format('YYYY-MM-DD HH:mm')}</b>
                        </div>
                        {surg.room_number && (
                          <div>
                            <span className="text-slate-400 block text-xs">غرفة العمليات:</span>
                            <b className="text-sm">غرفة رقم {surg.room_number}</b>
                          </div>
                        )}
                        {surg.notes && (
                          <div className="col-span-2">
                            <span className="text-slate-400 block text-xs">ملاحظات الجراحة:</span>
                            <p className="bg-slate-50 p-2 rounded-lg text-sm m-0">{surg.notes}</p>
                          </div>
                        )}
                      </div>
                    </Card>
                  ))
                ) : <Empty description="لا يوجد تاريخ جراحي مسجل" />}
              </div>
            )
          }
        ]}
      />
      </Spin>
    </div>
  );
};
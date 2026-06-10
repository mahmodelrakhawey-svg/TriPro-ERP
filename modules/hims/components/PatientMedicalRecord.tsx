import React, { useEffect, useState } from 'react';
import { Tabs, Timeline, List, Badge, Card, Statistic, Row, Col, Spin, Empty, Tag } from 'antd';
import { HistoryOutlined, MedicineBoxOutlined, FileSearchOutlined, HeartOutlined, CalendarOutlined } from '@ant-design/icons';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { supabase } from '@/supabaseClient';
import dayjs from 'dayjs';

export const PatientMedicalRecord: React.FC<{ patientId: string }> = ({ patientId }) => {
  const [loading, setLoading] = useState(false);
  const [history, setHistory] = useState<any[]>([]);
  const [labResults, setLabResults] = useState<any[]>([]);
  const [vitalsHistory, setVitalsHistory] = useState<any[]>([]);
  const [currentMedications, setCurrentMedications] = useState<any[]>([]);
  const [vitalsChartData, setVitalsChartData] = useState<any[]>([]);

  const fetchData = async () => {
    if (!patientId || patientId === "") return; // 🛡️ حماية من خطأ UUID الفارغ
    setLoading(true);
    try {
      // جلب سجل الزيارات
      const { data: visits, error: visitsError } = await supabase
        .from('hims_visits')
        .select('*')
        .eq('patient_id', patientId)
        .order('created_at', { ascending: false });
      if (visitsError) throw visitsError;

      // جلب نتائج المختبرات
      const { data: labs, error: labsError } = await supabase
        .from('hims_lab_orders')
        .select('*, hims_visits!inner(patient_id), hims_lab_tests(*)')
        .eq('hims_visits.patient_id', patientId)
        .eq('status', 'completed')
        .order('created_at', { ascending: false });
      if (labsError) throw labsError;

      // جلب سجل العلامات الحيوية من الزيارات السابقة
      const { data: vitals, error: vitalsError } = await supabase
        .from('hims_visits')
        .select('created_at, vital_signs')
        .eq('patient_id', patientId)
        .not('vital_signs', 'is', null)
        .order('created_at', { ascending: false });
      if (vitalsError) throw vitalsError;

      // جلب الأدوية الحالية (الروشتات) من جميع زيارات المريض
      const visitIds = (visits || []).map(v => v.id);
      let allMedications: any[] = [];
      if (visitIds.length > 0) {
        const { data: prescriptions, error: prescriptionsError } = await supabase
          .from('hims_prescriptions')
          .select('medications')
          .in('visit_id', visitIds);
        if (prescriptionsError) throw prescriptionsError;
        allMedications = prescriptions?.flatMap(p => p.medications) || [];
      }

      // Prepare vital signs data for charting
      const chartData = (vitals || []).map((v: any) => {
        const vs = v.vital_signs || {};
        const bpParts = vs.bp?.split('/') || [];
        const safeParse = (val: any) => {
          const p = parseFloat(val);
          return isNaN(p) ? 0 : p;
        };
        return {
          date: dayjs(v.created_at).format('YYYY-MM-DD HH:mm'),
          temp: safeParse(vs.temp),
          pulse: safeParse(vs.pulse),
          spo2: safeParse(vs.spo2),
          systolic_bp: safeParse(bpParts[0]),
          diastolic_bp: safeParse(bpParts[1]),
        };
      }).filter((d: any) => d.temp > 0 || d.pulse > 0 || d.spo2 > 0 || d.systolic_bp > 0)
        .reverse(); // Charting usually goes from oldest to newest

      setHistory(visits || []);
      setLabResults(labs || []);
      setVitalsHistory(vitals || []);
      setCurrentMedications(allMedications);
      setVitalsChartData(chartData);
    } catch (error: any) {
      console.error("Error fetching patient medical record data:", error);
      // يمكنك إضافة رسالة تنبيه للمستخدم هنا إذا أردت
      // message.error("فشل في جلب بيانات الملف الطبي: " + error.message);
    } finally {
      setLoading(false);
    }
  };

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
                        title: dayjs(visit.created_at).format('YYYY-MM-DD'),
                        content: (
                          <>
                            <b>{visit.visit_type === 'emergency' ? '🚨 طوارئ' : '📅 عيادة'}</b>: {visit.chief_complaint || 'كشف دوري'}
                          </>
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
                          valueStyle={{ color: '#1677ff' }} // 🎨 تحديث لمعايير AntD v5
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
                  <List.Item>
                    {item.drug_name} - {item.dosage} ({item.frequency})
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
          }
        ]}
      />
      </Spin>
    </div>
  );
};
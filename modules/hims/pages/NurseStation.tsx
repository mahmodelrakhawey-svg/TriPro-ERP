import React, { useEffect, useState } from 'react';
import { supabase } from '@/supabaseClient';
import { Card, Tag, Row, Col, Progress, Badge, Tooltip, Empty, Modal, Form, Input, message, List, Button } from 'antd';
import { HeartOutlined, MedicineBoxOutlined, UserOutlined, CheckCircleOutlined, ClockCircleOutlined } from '@ant-design/icons';

const VitalsModal: React.FC<{ visible: boolean; visitId: string; onCancel: () => void; onSuccess: () => void }> = ({ visible, visitId, onCancel, onSuccess }) => {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);

  const handleSave = async (values: any) => {
    setLoading(true);
    const { error } = await supabase
      .from('hims_visits')
      .update({ vital_signs: values })
      .eq('id', visitId);

    if (!error) {
      message.success('تم تسجيل العلامات الحيوية بنجاح');
      onSuccess();
    }
    setLoading(false);
  };

  return (
    <Modal title="تسجيل العلامات الحيوية" open={visible} onCancel={onCancel} onOk={() => form.submit()} confirmLoading={loading}>
      <Form form={form} layout="vertical" onFinish={handleSave}>
        <div className="grid grid-cols-2 gap-4">
          <Form.Item name="bp" label="ضغط الدم"><Input placeholder="120/80" /></Form.Item>
          <Form.Item name="temp" label="الحرارة"><Input placeholder="37.5" /></Form.Item>
          <Form.Item name="pulse" label="النبض"><Input placeholder="75" /></Form.Item>
          <Form.Item name="spo2" label="نسبة الأكسجين"><Input placeholder="98%" /></Form.Item>
        </div>
      </Form>
    </Modal>
  );
};

const MedicationMARModal: React.FC<{ visible: boolean; visitId: string; onCancel: () => void }> = ({ visible, visitId, onCancel }) => {
  const [prescriptions, setPrescriptions] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchMedications = async () => {
    const { data } = await supabase
      .from('hims_prescriptions')
      .select('*')
      .eq('visit_id', visitId);
    
    // تسطيح قائمة الأدوية من كافة الروشتات
    const allMeds = data?.flatMap(p => p.medications.map((m: any) => ({ ...m, p_id: p.id }))) || [];
    setPrescriptions(allMeds);
  };

  useEffect(() => { if (visible) fetchMedications(); }, [visible]);

  const giveMedication = async (med: any) => {
    setLoading(true);
    const { error } = await supabase.rpc('hims_log_medication_administration', {
      p_visit_id: visitId,
      p_drug_name: med.drug_name,
      p_dosage: med.dosage
    });
    if (!error) {
      message.success(`تم تسجيل إعطاء ${med.drug_name} بنجاح ✅`);
    }
    setLoading(false);
  };

  return (
    <Modal title={<b>سجل إعطاء الأدوية (MAR) 💊</b>} open={visible} onCancel={onCancel} footer={null} width={600}>
      <List
        dataSource={prescriptions}
        renderItem={(item) => (
          <List.Item className="flex justify-between items-center bg-slate-50 mb-2 p-4 rounded-xl">
            <div>
              <b className="text-indigo-600 block">{item.drug_name}</b>
              <small className="text-slate-500">الجرعة: {item.dosage} | التكرار: {item.frequency}</small>
            </div>
            <Button 
              type="primary" 
              className="bg-emerald-600 border-none rounded-lg"
              icon={<CheckCircleOutlined />} 
              onClick={() => giveMedication(item)}
            >إعطاء الآن</Button>
          </List.Item>
        )}
        locale={{ emptyText: "لا توجد أدوية جارية حالياً لهذا المريض" }}
      />
    </Modal>
  );
};

export const NurseStation: React.FC = () => {
  const [beds, setBeds] = useState<any[]>([]);
  const [selectedVisit, setSelectedVisit] = useState<string | null>(null);
  const [marVisit, setMarVisit] = useState<string | null>(null);

  useEffect(() => {
    const sub = supabase.channel('bed-updates')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'hims_beds' }, fetchBeds)
      .subscribe();
    fetchBeds();
    return () => { supabase.removeChannel(sub) };
  }, []);

  const fetchBeds = async () => {
    const { data } = await supabase
      .from('hims_beds')
      .select('*, hims_patients(id, full_name, blood_type), hims_wards(name)')
      .order('bed_number', { ascending: true });
    
    setBeds(data || []);
  };

  return (
    <div className="p-6 bg-slate-50 min-h-screen rtl text-right">
      <h1 className="text-2xl font-black text-slate-800 mb-6 flex items-center gap-3">
        <Badge status="processing" /> محطة التمريض ومراقبة الأسرة 🏥
      </h1>
      
      <Row gutter={[16, 16]}>
        {beds.length === 0 ? <Empty className="w-full" description="لا توجد أجنحة مفعّلة حالياً" /> : 
          beds.map(bed => (
          <Col key={bed.id} xs={24} sm={12} md={8} lg={6}>
            <Card 
              hoverable 
              className={`rounded-2xl border-2 transition-all ${bed.status === 'occupied' ? 'border-red-100' : 'border-emerald-50'}`}
              title={<div className="flex justify-between font-bold"><span>سرير {bed.bed_number}</span><Tag color="blue">{bed.hims_wards?.name}</Tag></div>}
            >
              {bed.status === 'occupied' ? (
                <div className="space-y-3">
                  <div className="flex items-center gap-2 text-slate-700 font-bold">
                    <UserOutlined className="text-blue-500" /> {bed.hims_patients?.full_name}
                  </div>
                  <div className="flex justify-between text-xs font-black">
                    <span>فصيلة الدم:</span>
                    <Tag color="red">{bed.hims_patients?.blood_type || 'غير مسجل'}</Tag>
                  </div>
                  <div className="mt-4 pt-4 border-t flex gap-2">
                    {bed.current_visit_id && (
                      <Tooltip title="تسجيل العلامات الحيوية">
                        <HeartOutlined 
                          className="text-rose-500 text-lg cursor-pointer hover:scale-125 transition-transform" 
                          onClick={() => setSelectedVisit(bed.current_visit_id)} 
                        />
                      </Tooltip>
                    )}
                    <Tooltip title="الأدوية المطلوبة"><MedicineBoxOutlined className="text-indigo-500 text-lg cursor-pointer" /></Tooltip>
                  </div>
                </div>
              ) : (
                <div className="py-6 text-center">
                  <Tag color="success" className="rounded-full px-4">جاهز للاستقبال</Tag>
                  <p className="text-slate-400 text-[10px] mt-2 font-bold">معدل الإقامة: {bed.daily_rate} EGP</p>
                </div>
              )}
            </Card>
          </Col>
        ))}
      </Row>

      {selectedVisit && (
        <VitalsModal 
          visible={!!selectedVisit} 
          visitId={selectedVisit} 
          onCancel={() => setSelectedVisit(null)} 
          onSuccess={() => { setSelectedVisit(null); fetchBeds(); }} 
        />
      )}

      {marVisit && (
        <MedicationMARModal 
          visible={!!marVisit} 
          visitId={marVisit} 
          onCancel={() => setMarVisit(null)} 
        />
      )}
    </div>
  );
};
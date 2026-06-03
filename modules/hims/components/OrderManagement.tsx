import React, { useState, useEffect } from 'react';
import { supabase } from '@/supabaseClient';
import { Card, Tabs, Select, Button, Table, Tag, message, Typography, InputNumber, Input, DatePicker } from 'antd';
import { ExperimentOutlined, CameraOutlined, MedicineBoxOutlined, PlusOutlined, HeartOutlined, ToolOutlined } from '@ant-design/icons';

const { Option } = Select;

export const OrderManagement: React.FC<{ visitId: string }> = ({ visitId }) => {
  const [labTests, setLabTests] = useState<any[]>([]);
  const [radTypes, setRadTypes] = useState<any[]>([]);
  const [selectedTests, setSelectedTests] = useState<string[]>([]);
  const [selectedRads, setSelectedRads] = useState<string[]>([]);
  const [bloodRequest, setBloodRequest] = useState({ type: 'O+', units: 1 });
  const [surgeryRequest, setSurgeryRequest] = useState({ name: '', date: null as any });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const fetchMasters = async () => {
      const [labRes, radRes] = await Promise.all([
        supabase.from('hims_lab_tests').select('*'),
        supabase.from('hims_radiology_types').select('*')
      ]);
      setLabTests(labRes.data || []);
      setRadTypes(radRes.data || []);
    };
    fetchMasters();
  }, []);

  const placeOrders = async (type: 'lab' | 'radiology') => {
    setLoading(true);
    try {
      if (type === 'lab') {
        const orders = selectedTests.map(testId => ({
          visit_id: visitId,
          test_id: testId,
          status: 'pending'
        }));
        const { error } = await supabase.from('hims_lab_orders').insert(orders);
        if (error) throw error;
      } else if (type === 'radiology') {
        const orders = selectedRads.map(radId => ({
          visit_id: visitId,
          rad_type_id: radId,
          status: 'pending'
        }));
        const { error } = await supabase.from('hims_radiology_orders').insert(orders);
        if (error) throw error;
      }
      message.success('تم إرسال الطلبات للأقسام المعنية بنجاح ✅');
      type === 'lab' ? setSelectedTests([]) : setSelectedRads([]);
    } catch (err: any) {
      message.error('خطأ في إرسال الطلب: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const requestBlood = async () => {
    setLoading(true);
    const { error } = await supabase.rpc('hims_request_blood', {
      p_visit_id: visitId,
      p_blood_type: bloodRequest.type,
      p_units: bloodRequest.units,
      p_urgency: 'normal'
    });
    if (!error) message.success('تم إرسال طلب الدم لبنك الدم المركزي 🩸');
    setLoading(false);
  };

  const requestSurgery = async () => {
    if (!surgeryRequest.name || !surgeryRequest.date) return message.warning('يرجى إكمال بيانات الجراحة');
    setLoading(true);
    const { error } = await supabase.from('hims_surgeries').insert([{
      visit_id: visitId,
      surgery_name: surgeryRequest.name,
      scheduled_start: surgeryRequest.date.toISOString(),
      status: 'scheduled',
      organization_id: (await supabase.from('hims_visits').select('organization_id').eq('id', visitId).single()).data?.organization_id
    }]);
    if (!error) {
        message.success('تمت جدولة العملية الجراحية وإخطار غرفة العمليات 🏥');
        setSurgeryRequest({ name: '', date: null });
    }
    setLoading(false);
  };

  return (
    <Card className="rounded-2xl shadow-sm border-slate-200">
      <Tabs defaultActiveKey="1">
        <Tabs.TabPane tab={<span><ExperimentOutlined /> طلب تحاليل</span>} key="1">
          <div className="space-y-4">
            <Select
              mode="multiple"
              style={{ width: '100%' }}
              placeholder="اختر الفحوصات المطلوبة..."
              value={selectedTests}
              onChange={setSelectedTests}
            >
              {labTests.map(t => <Option key={t.id} value={t.id}>{t.test_name}</Option>)}
            </Select>
            <Button 
              type="primary" 
              block 
              icon={<PlusOutlined />} 
              onClick={() => placeOrders('lab')}
              loading={loading}
              disabled={selectedTests.length === 0}
            >
              اعتماد طلب المختبر
            </Button>
          </div>
        </Tabs.TabPane>
        
        <Tabs.TabPane tab={<span><CameraOutlined /> طلب أشعة</span>} key="2">
          <div className="space-y-4">
            <Select
              mode="multiple"
              style={{ width: '100%' }}
              placeholder="اختر الفحوصات التصويرية المطلوبة..."
              value={selectedRads}
              onChange={setSelectedRads}
            >
              {radTypes.map(t => <Option key={t.id} value={t.id}>{t.name}</Option>)}
            </Select>
            <Button 
              type="primary" 
              block 
              icon={<PlusOutlined />} 
              onClick={() => placeOrders('radiology')}
              loading={loading}
              disabled={selectedRads.length === 0}
            >
              اعتماد طلب الأشعة
            </Button>
          </div>
        </Tabs.TabPane>

        <Tabs.TabPane tab={<span><HeartOutlined /> بنك الدم</span>} key="4">
          <div className="flex gap-2">
            <Select className="flex-1" value={bloodRequest.type} onChange={v => setBloodRequest({...bloodRequest, type: v})}>
              {['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'].map(t => <Option key={t} value={t}>{t}</Option>)}
            </Select>
            <InputNumber min={1} value={bloodRequest.units} onChange={v => setBloodRequest({...bloodRequest, units: v || 1})} />
            <Button danger icon={<PlusOutlined />} onClick={requestBlood} loading={loading}>طلب دم</Button>
          </div>
        </Tabs.TabPane>

        <Tabs.TabPane tab={<span><ToolOutlined /> طلب جراحة</span>} key="5">
          <div className="space-y-3">
            <Input 
                placeholder="اسم العملية الجراحية..." 
                value={surgeryRequest.name} 
                onChange={e => setSurgeryRequest({...surgeryRequest, name: e.target.value})} 
            />
            <DatePicker showTime className="w-full" placeholder="موعد العملية المقترح" onChange={v => setSurgeryRequest({...surgeryRequest, date: v})} />
            <Button type="primary" block icon={<PlusOutlined />} onClick={requestSurgery} loading={loading}>تأكيد طلب الجراحة</Button>
          </div>
        </Tabs.TabPane>

        <Tabs.TabPane tab={<span><MedicineBoxOutlined /> خدمات تمريضية</span>} key="3">
          <div className="space-y-2">
             <Tag closable>غيار على جرح</Tag>
             <Tag closable>تركيب محاليل</Tag>
             <Button type="dashed" block size="small">إضافة خدمة إضافية</Button>
          </div>
        </Tabs.TabPane>
      </Tabs>
    </Card>
  );
};
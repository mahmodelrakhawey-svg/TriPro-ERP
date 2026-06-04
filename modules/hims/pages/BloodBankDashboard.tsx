import React, { useEffect, useState } from 'react';
import { Table, Tag, Card, Typography, Row, Col, Statistic, Tabs, Button, Modal, Form, Input, Select, message } from 'antd';
import { HeartTwoTone, MedicineBoxOutlined, UserAddOutlined, PlusCircleOutlined, ExperimentOutlined } from '@ant-design/icons';
import { Users } from 'lucide-react';
import { supabase } from '@/supabaseClient';
import { himsService } from '@/services/himsService';

const { Option } = Select;

export const BloodBankDashboard: React.FC = () => {
  const [inventory, setInventory] = useState<any[]>([]);
  const [donors, setDonors] = useState<any[]>([]);
  const [isDonorModalVisible, setIsDonorModalOpen] = useState(false);
  const [form] = Form.useForm();

  const fetchStock = async () => {
    const { data } = await supabase
      .from('hims_blood_donations')
      .select('*')
      .eq('status', 'available');
    setInventory(data || []);

    const donorData = await himsService.getDonors();
    setDonors(donorData || []);
  };

  useEffect(() => { fetchStock(); }, []);

  const handleAddDonor = async (values: any) => {
    try {
      await himsService.registerDonor(values);
      message.success('تم تسجيل المتبرع بنجاح ✅');
      setIsDonorModalOpen(false);
      fetchStock();
    } catch (e) { message.error('فشل التسجيل'); }
  };

  return (
    <div className="p-6 rtl text-right">
      <div className="flex justify-between items-center mb-6">
        <Typography.Title level={2}><HeartTwoTone twoToneColor="#eb2f96" /> نظام إدارة بنك الدم المركزي</Typography.Title>
        <Button type="primary" icon={<UserAddOutlined />} onClick={() => setIsDonorModalOpen(true)} className="bg-pink-600 border-none rounded-xl h-12">
          تسجيل متبرع جديد
        </Button>
      </div>

      <Tabs defaultActiveKey="1" items={[
        {
          key: '1',
          label: <span><ExperimentOutlined /> رصيد بنك الدم</span>,
          children: (
            <>
              <Row gutter={16} className="mb-6">
                {['A+', 'A-', 'B+', 'B-', 'O+', 'O-', 'AB+', 'AB-'].map(type => (
                  <Col span={3} key={type}>
                    <Card size="small" className="text-center rounded-2xl shadow-sm border-pink-50">
                      <Statistic title={type} value={inventory.filter(i => i.blood_type === type).length} styles={{ content: { color: '#cf1322', fontWeight: 900 } }} />
                    </Card>
                  </Col>
                ))}
              </Row>
              <Table 
                dataSource={inventory} 
                columns={[
                  { title: 'كود الكيس', dataIndex: 'bag_code', render: (c) => <Tag color="black">{c}</Tag> },
                  { title: 'فصيلة الدم', dataIndex: 'blood_type', render: (t) => <Tag color="red" className="font-bold">{t}</Tag> },
                  { title: 'تاريخ الانتهاء', dataIndex: 'expiry_date', render: (d) => <span className="text-red-500 font-mono">{d}</span> },
                  { title: 'الحجم (مل)', dataIndex: 'volume_ml' }
                ]} 
              />
            </>
          )
        },
        {
          key: '2',
          label: <span><Users /> سجل المتبرعين</span>,
          children: (
            <Table 
              dataSource={donors}
              columns={[
                { title: 'الاسم', dataIndex: 'full_name' },
                { title: 'الفصيلة', dataIndex: 'blood_type', render: (t) => <Tag color="red">{t}</Tag> },
                { title: 'آخر تبرع', dataIndex: 'last_donation_date' },
                { title: 'الحالة الصحية', dataIndex: 'health_status', render: () => <Tag color="green">لائق</Tag> },
                { title: 'إجراء', render: () => <Button size="small" icon={<PlusCircleOutlined />}>تبرع جديد</Button> }
              ]}
            />
          )
        }
      ]} />

      <Modal title="تسجيل متبرع جديد في القاعدة" open={isDonorModalVisible} onCancel={() => setIsDonorModalOpen(false)} onOk={() => form.submit()} okText="حفظ البيانات" cancelText="إلغاء">
        <Form form={form} layout="vertical" onFinish={handleAddDonor} className="pt-4">
          <Form.Item name="full_name" label="الاسم الكامل" rules={[{ required: true }]}>
            <Input placeholder="أدخل اسم المتبرع رباعي..." />
          </Form.Item>
          <div className="grid grid-cols-2 gap-4">
            <Form.Item name="blood_type" label="فصيلة الدم" rules={[{ required: true }]}>
              <Select placeholder="اختر الفصيلة">
                {['A+', 'A-', 'B+', 'B-', 'O+', 'O-', 'AB+', 'AB-'].map(t => <Option key={t} value={t}>{t}</Option>)}
              </Select>
            </Form.Item>
            <Form.Item name="national_id" label="الرقم القومي" rules={[{ required: true }]}>
              <Input placeholder="14 رقم" />
            </Form.Item>
          </div>
          <Form.Item name="phone" label="رقم الهاتف">
            <Input placeholder="01xxxxxxxxx" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};
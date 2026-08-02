import React, { useEffect, useState } from 'react';
import { Table, Tag, Card, Typography, Row, Col, Statistic, Tabs, Button, Modal, Form, Input, Select, message, DatePicker } from 'antd';
import { HeartTwoTone, MedicineBoxOutlined, UserAddOutlined, PlusCircleOutlined, ExperimentOutlined } from '@ant-design/icons';
import { Users } from 'lucide-react';
import { supabase } from '@/supabaseClient';
import { himsService } from '@/services/himsService';
import { useAuth } from '@/context/AuthContext';

const { Option } = Select;

export const BloodBankDashboard: React.FC = () => {
  const { currentUser } = useAuth();
  const [inventory, setInventory] = useState<any[]>([]);
  const [donors, setDonors] = useState<any[]>([]);
  const [requests, setRequests] = useState<any[]>([]);
  const [isDonorModalVisible, setIsDonorModalOpen] = useState(false);
  const [isDonationModalVisible, setIsDonationModalVisible] = useState(false);
  const [isFulfillModalVisible, setIsFulfillModalVisible] = useState(false);
  const [selectedDonor, setSelectedDonor] = useState<any>(null);
  const [selectedRequest, setSelectedRequest] = useState<any>(null);
  const [selectedBagId, setSelectedBagId] = useState<string | null>(null);
  const [form] = Form.useForm();
  const [donationForm] = Form.useForm();

  const fetchStock = async () => {
    if (!currentUser?.organization_id) return;
    const { data } = await supabase
      .from('hims_blood_donations')
      .select('*, donor:donor_id(blood_type)')
      .eq('status', 'available')
      .eq('organization_id', currentUser.organization_id);
    
    const mapped = (data || []).map((item: any) => ({
      ...item,
      blood_type: item.donor?.blood_type
    }));
    setInventory(mapped);

    const donorData = await himsService.getDonors(currentUser.organization_id);
    setDonors(donorData || []);

    const reqData = await himsService.getPendingBloodRequests(currentUser.organization_id);
    setRequests(reqData || []);
  };

  useEffect(() => { fetchStock(); }, [currentUser?.organization_id]);

  const handleAddDonor = async (values: any) => {
    try {
      await himsService.registerDonor(values);
      message.success('تم تسجيل المتبرع بنجاح ✅');
      setIsDonorModalOpen(false);
      fetchStock();
    } catch (e) { message.error('فشل التسجيل'); }
  };

  const handleOpenDonationModal = (donor: any) => {
    setSelectedDonor(donor);
    setIsDonationModalVisible(true);
  };

  const handleRecordDonation = async (values: any) => {
    if (!selectedDonor) return;
    try {
      await himsService.processDonation(
        selectedDonor.id,
        values.bag_code,
        values.expiry_date.format('YYYY-MM-DD')
      );
      message.success('تم تسجيل كيس التبرع بالدم وتحديث رصيد البنك بنجاح ✅');
      setIsDonationModalVisible(false);
      donationForm.resetFields();
      fetchStock();
    } catch (e: any) {
      message.error('فشل تسجيل التبرع: ' + e.message);
    }
  };

  const handleOpenFulfillModal = (request: any) => {
    setSelectedRequest(request);
    setSelectedBagId(null);
    setIsFulfillModalVisible(true);
  };

  const handleFulfillRequest = async () => {
    if (!selectedRequest || !selectedBagId) return message.warning('يرجى اختيار كيس الدم المطلوب صرفه أولاً');
    try {
      await himsService.fulfillBloodRequest(selectedRequest.id, selectedBagId);
      message.success('تم صرف كيس الدم وتلبية الطلب بنجاح ✅');
      setIsFulfillModalVisible(false);
      fetchStock();
    } catch (e: any) {
      message.error('فشل صرف الطلب: ' + e.message);
    }
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
                rowKey="id"
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
              rowKey="id"
              columns={[
                { title: 'الاسم', dataIndex: 'full_name' },
                { title: 'الفصيلة', dataIndex: 'blood_type', render: (t) => <Tag color="red">{t}</Tag> },
                { title: 'آخر تبرع', dataIndex: 'last_donation_date' },
                { title: 'الحالة الصحية', dataIndex: 'health_status', render: () => <Tag color="green">لائق</Tag> },
                { title: 'إجراء', render: (_, record) => <Button size="small" icon={<PlusCircleOutlined />} onClick={() => handleOpenDonationModal(record)}>تبرع جديد</Button> }
              ]}
            />
          )
        },
        {
          key: '3',
          label: <span><MedicineBoxOutlined /> طلبات نقل الدم</span>,
          children: (
            <Table 
              dataSource={requests}
              rowKey="id"
              columns={[
                { title: 'المريض', render: (_, r) => <b>{r.visit?.hims_patients?.full_name || 'غير معروف'}</b> },
                { title: 'الفصيلة المطلوبة', dataIndex: 'blood_type', render: (t) => <Tag color="red" className="font-bold">{t}</Tag> },
                { title: 'عدد الوحدات', dataIndex: 'units', align: 'center' },
                { 
                  title: 'درجة العجلة', 
                  dataIndex: 'urgency', 
                  render: (u) => (
                    <Tag color={u === 'urgent' ? 'volcano' : 'blue'}>
                      {u === 'urgent' ? 'عاجل جداً 🚨' : 'عادي'}
                    </Tag>
                  )
                },
                { title: 'تاريخ الطلب', dataIndex: 'created_at', render: (d) => new Date(d).toLocaleString('ar-EG') },
                { 
                  title: 'إجراء', 
                  render: (_, record) => {
                    const availableBags = inventory.filter(b => b.blood_type === record.blood_type);
                    return (
                      <Button 
                        type="primary" 
                        size="small" 
                        onClick={() => handleOpenFulfillModal(record)}
                        disabled={availableBags.length === 0}
                        className="bg-indigo-600 border-none rounded-lg"
                      >
                        {availableBags.length > 0 ? 'صرف وتلبية الطلب' : 'عجز بالرصيد ⚠️'}
                      </Button>
                    );
                  }
                }
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

      <Modal title="تسجيل تبرع بالدم جديد" open={isDonationModalVisible} onCancel={() => setIsDonationModalVisible(false)} onOk={() => donationForm.submit()} okText="حفظ التبرع" cancelText="إلغاء">
        <Form form={donationForm} layout="vertical" onFinish={handleRecordDonation} className="pt-4">
          <Form.Item label="المتبرع">
            <Input value={selectedDonor?.full_name} disabled className="font-bold text-slate-800" />
          </Form.Item>
          <Form.Item label="فصيلة الدم">
            <Tag color="red" className="font-bold text-sm px-4 py-1">{selectedDonor?.blood_type}</Tag>
          </Form.Item>
          <Form.Item name="bag_code" label="كود كيس الدم" rules={[{ required: true, message: 'يرجى إدخال كود الكيس' }]}>
            <Input placeholder="مثال: BAG-A-100234" />
          </Form.Item>
          <Form.Item name="expiry_date" label="تاريخ انتهاء الصلاحية" rules={[{ required: true, message: 'يرجى اختيار تاريخ انتهاء الصلاحية' }]}>
            <DatePicker className="w-full" placeholder="اختر التاريخ" format="YYYY-MM-DD" />
          </Form.Item>
        </Form>
      </Modal>

      <Modal 
        title="تلبية طلب نقل الدم وصرف كيس الدم" 
        open={isFulfillModalVisible} 
        onCancel={() => setIsFulfillModalVisible(false)} 
        onOk={handleFulfillRequest} 
        okText="صرف كيس الدم" 
        cancelText="إلغاء"
      >
        {selectedRequest && (
          <div className="space-y-4 pt-4">
            <div className="bg-slate-50 p-4 rounded-xl border">
              <p><b>المريض:</b> {selectedRequest.visit?.hims_patients?.full_name}</p>
              <p><b>الفصيلة المطلوبة:</b> <Tag color="red" className="font-bold">{selectedRequest.blood_type}</Tag></p>
              <p><b>عدد الوحدات المطلوبة:</b> {selectedRequest.units} وحدة</p>
            </div>
            
            <Form.Item label="اختر كيس الدم المناسب من الرصيد المتوفر" required>
              <Select 
                placeholder="اختر كيس الدم..." 
                className="w-full"
                onChange={v => setSelectedBagId(v)}
                value={selectedBagId}
                options={inventory
                  .filter(b => b.blood_type === selectedRequest.blood_type)
                  .map(b => ({
                    label: `كيس: ${b.bag_code} | الحجم: ${b.volume_ml} مل | انتهاء: ${b.expiry_date}`,
                    value: b.id
                  }))
                }
              />
            </Form.Item>
          </div>
        )}
      </Modal>
    </div>
  );
};
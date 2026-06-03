import React, { useEffect, useState } from 'react';
import { supabase } from '@/supabaseClient';
import { Table, Tag, Input, Button, Modal, message, Card, Typography, Select, Space, Divider, InputNumber } from 'antd';
import { ExperimentOutlined, CheckCircleOutlined, EditOutlined, BoxPlotOutlined, DeleteOutlined, PlusOutlined } from '@ant-design/icons';
import { useAuth } from '@/context/AuthContext';

export const LabDashboard: React.FC = () => {
  const { currentUser } = useAuth();
  const [orders, setOrders] = useState<any[]>([]);
  const [selectedOrder, setSelectedOrder] = useState<any>(null);
  const [resultValue, setResultValue] = useState('');
  const [reagents, setReagents] = useState<any[]>([]);
  const [selectedReagents, setSelectedReagents] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchOrders = async () => {
    if (!currentUser?.organization_id) return;
    const { data } = await supabase.from('hims_lab_orders')
      .select('*, hims_visits(doctor_id, hims_patients(id, full_name)), hims_lab_tests(test_name, normal_range, unit)')
      .eq('organization_id', currentUser.organization_id)
      .eq('status', 'pending');
    setOrders(data || []);
  };

  const fetchStock = async () => {
    if (!currentUser?.organization_id) return;
    // جلب الأصناف التي تملك رصيداً في المخزن والتابعة للمنظمة فقط
    const { data } = await supabase.from('products')
      .select('id, name, stock')
      .eq('organization_id', currentUser.organization_id)
      .gt('stock', 0);
    setReagents(data || []);
  };

  useEffect(() => { 
    if (currentUser) {
      fetchOrders();
      fetchStock();
    }
  }, [currentUser]);

  const addReagent = (id: string) => {
    const reagent = reagents.find(r => r.id === id);
    if (!reagent || selectedReagents.find(r => r.product_id === id)) return;
    setSelectedReagents([...selectedReagents, { product_id: reagent.id, name: reagent.name, qty: 1 }]);
  };

  const submitResult = async () => {
    if (!resultValue) return message.warning('يرجى إدخال النتيجة أولاً');
    setLoading(true);
    const { error } = await supabase.rpc('hims_complete_lab_with_inventory', {
      p_order_id: selectedOrder.id,
      p_result: resultValue,
      p_consumables: selectedReagents.map(r => ({ product_id: r.product_id, qty: r.qty }))
    });

    setLoading(false);
    if (error) {
      message.error('فشل حفظ النتيجة: ' + error.message);
    } else {
      message.success('تم تسجيل النتيجة وتحديث حساب المريض ✅');
      setSelectedOrder(null);
      // ملاحظة: يتم إنشاء الإخطار الآن آلياً من طرف الخادم (SQL Trigger)

      setSelectedReagents([]);
      setResultValue('');
      fetchOrders();
    }
  };

  const columns = [
    { title: 'المريض', dataIndex: ['hims_visits', 'hims_patients', 'full_name'] },
    { title: 'الفحص المطلوب', dataIndex: ['hims_lab_tests', 'test_name'] },
    { title: 'الحالة', render: () => <Tag color="orange">قيد الانتظار</Tag> },
    { title: 'إجراء', render: (record: any) => (
      <Button icon={<EditOutlined />} onClick={() => setSelectedOrder(record)}>إدخال النتيجة</Button>
    )}
  ];

  return (
    <div className="p-6 rtl text-right">
      <Card className="rounded-3xl shadow-lg border-none">
        <Typography.Title level={3}><ExperimentOutlined /> وحدة المختبر والتحاليل الطبية</Typography.Title>
        <Table dataSource={orders} columns={columns} rowKey="id" />
      </Card>

      <Modal
        title="تسجيل نتيجة الفحص"
        open={!!selectedOrder}
        onOk={submitResult}
        confirmLoading={loading}
        onCancel={() => setSelectedOrder(null)}
        width={600}
      >
        {selectedOrder && (
          <div className="space-y-4 pt-4">
            <div className="bg-blue-50 p-4 rounded-xl border border-blue-100">
              <p><b>الفحص:</b> {selectedOrder.hims_lab_tests.test_name}</p>
              <p><b>المعدل الطبيعي:</b> {selectedOrder.hims_lab_tests.normal_range} {selectedOrder.hims_lab_tests.unit}</p>
            </div>
            
            <Typography.Text strong>النتيجة المخبرية:</Typography.Text>
            <Input 
              placeholder="أدخل القيمة الناتجة هنا..." 
              size="large" 
              value={resultValue} 
              onChange={e => setResultValue(e.target.value)} 
            />

            <Divider><BoxPlotOutlined /> المستهلكات (المحاليل المستعملة)</Divider>
            <Typography.Text type="secondary" className="mb-2 block">ابحث عن محلول لإضافته لقائمة الاستهلاك:</Typography.Text>
            <Select
              style={{ width: '100%' }}
              showSearch
              placeholder="ابحث باسم المحلول..."
              onChange={addReagent}
              value={null}
              options={reagents.map(r => ({ label: `${r.name} (المخزون: ${r.stock})`, value: r.id }))}
            />

            <Table
              dataSource={selectedReagents}
              rowKey="product_id"
              size="small"
              pagination={false}
              className="mt-4"
              columns={[
                { title: 'المحلول', dataIndex: 'name' },
                { 
                  title: 'الكمية', 
                  render: (_, record, idx) => (
                    <InputNumber 
                      min={0.01} 
                      value={record.qty} 
                      onChange={(val) => {
                        const newR = [...selectedReagents];
                        newR[idx].qty = val;
                        setSelectedReagents(newR);
                      }} 
                    />
                  ) 
                },
                { title: '', render: (_, __, idx) => <Button type="text" danger icon={<DeleteOutlined />} onClick={() => setSelectedReagents(selectedReagents.filter((_, i) => i !== idx))} /> }
              ]}
            />
          </div>
        )}
      </Modal>
    </div>
  );
};
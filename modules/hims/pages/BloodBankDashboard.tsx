import React, { useEffect, useState } from 'react';
import { Table, Tag, Card, Typography, Row, Col, Statistic } from 'antd';
import { HeartTwoTone, MedicineBoxOutlined } from '@ant-design/icons';
import { supabase } from '@/supabaseClient';

export const BloodBankDashboard: React.FC = () => {
  const [inventory, setInventory] = useState<any[]>([]);

  const fetchStock = async () => {
    const { data } = await supabase
      .from('hims_blood_donations')
      .select('*')
      .eq('status', 'available');
    setInventory(data || []);
  };

  useEffect(() => { fetchStock(); }, []);

  return (
    <div className="p-6 rtl text-right">
      <Typography.Title level={3}><HeartTwoTone twoToneColor="#eb2f96" /> مخزون بنك الدم المركزي</Typography.Title>
      <Row gutter={16} className="mb-6">
        {['A+', 'A-', 'B+', 'B-', 'O+', 'O-', 'AB+', 'AB-'].map(type => (
          <Col span={3} key={type}>
            <Card size="small" className="text-center rounded-xl shadow-sm">
              <Statistic title={type} value={inventory.filter(i => i.blood_type === type).length} styles={{ content: { color: '#cf1322' } }} />
            </Card>
          </Col>
        ))}
      </Row>
      <Card className="rounded-3xl border-none shadow-sm">
        <Typography.Title level={4}>الأكياس المتوفرة (Available Bags)</Typography.Title>
        <Table 
          dataSource={inventory} 
          columns={[
            { title: 'كود الكيس', dataIndex: 'bag_code' },
            { title: 'فصيلة الدم', dataIndex: 'blood_type', render: (t) => <Tag color="red">{t}</Tag> },
            { title: 'تاريخ الانتهاء', dataIndex: 'expiry_date', render: (d) => <span className="text-red-500">{d}</span> },
            { title: 'الحجم (مل)', dataIndex: 'volume_ml' }
          ]} 
          rowKey="id" 
        />
      </Card>
    </div>
  );
};
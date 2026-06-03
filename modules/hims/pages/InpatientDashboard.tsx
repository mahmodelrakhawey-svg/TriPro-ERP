import React, { useEffect, useState } from 'react';
import { Row, Col, Card, Badge, Statistic, Typography, Tag, Space } from 'antd';
import { HomeOutlined, DesktopOutlined } from '@ant-design/icons';
import { supabase } from '@/supabaseClient';

export const InpatientDashboard: React.FC = () => {
  const [beds, setBeds] = useState<any[]>([]);

  const fetchBeds = async () => {
    const { data } = await supabase
      .from('hims_beds')
      .select('*, hims_wards(name), hims_patients(full_name)');
    setBeds(data || []);
  };

  useEffect(() => { fetchBeds(); }, []);

  return (
    <div className="p-6 rtl text-right">
      <Typography.Title level={3}><HomeOutlined /> حالة الأجنحة والأسرة</Typography.Title>
      <Row gutter={[16, 16]}>
        {beds.map(bed => (
          <Col xs={24} sm={12} md={8} lg={6} key={bed.id}>
            <Card 
              hoverable 
              className={`rounded-2xl border-2 ${bed.status === 'occupied' ? 'border-blue-500' : 'border-green-400'}`}
            >
              <div className="flex justify-between items-start">
                <Statistic title="رقم السرير" value={bed.bed_number} prefix={<DesktopOutlined />} />
                <Badge status={bed.status === 'occupied' ? 'error' : 'success'} text={bed.status === 'occupied' ? 'مشغول' : 'متاح'} />
              </div>
              <div className="mt-4">
                <p className="text-slate-400 m-0">الجناح: {bed.hims_wards?.name}</p>
                {bed.status === 'occupied' && (
                  <div className="bg-blue-50 p-2 rounded-lg mt-2">
                    <small className="block text-blue-600 font-bold">المريض الحالي:</small>
                    <span>{bed.hims_patients?.full_name}</span>
                  </div>
                )}
              </div>
            </Card>
          </Col>
        ))}
      </Row>
    </div>
  );
};
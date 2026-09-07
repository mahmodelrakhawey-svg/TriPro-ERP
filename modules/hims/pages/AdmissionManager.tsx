import React, { useEffect, useState } from 'react';
import { supabase } from '@/supabaseClient';
import { Table, Button, Card, Tag, Select, message, Row, Col, Statistic } from 'antd';
import { LoginOutlined, BankOutlined } from '@ant-design/icons';
import { useAccounting } from '@/context/AccountingContext';

export const AdmissionManager: React.FC = () => {
  const { organization } = useAccounting();
  const [pendingVisits, setPendingVisits] = useState<any[]>([]);
  const [availableBeds, setAvailableBeds] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedBeds, setSelectedBeds] = useState<Record<string, string>>({});

  const fetchData = async () => {
    if (!organization?.id) return;
    setLoading(true);
    // جلب الحالات التي تحتاج تنويم ولم تُسكن بعد
    const { data: visits } = await supabase
      .from('hims_visits')
      .select('*, hims_patients(full_name)')
      .eq('organization_id', organization.id)
      .eq('visit_type', 'inpatient')
      .eq('status', 'triaged');

    // جلب الأسرة المتاحة
    const { data: beds } = await supabase
      .from('hims_beds')
      .select('*, hims_wards(name)')
      .eq('organization_id', organization.id)
      .eq('status', 'available');

    setPendingVisits(visits || []);
    setAvailableBeds(beds || []);
    setLoading(false);
  };

  useEffect(() => { 
    fetchData(); 

    // 📡 تفعيل المراقبة اللحظية لضمان تحديث قائمة الأسرة والزيارات فوراً
    const channel = supabase.channel('hims-admission-sync')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'hims_beds' }, () => {
        fetchData();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'hims_visits' }, () => {
        fetchData();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [organization?.id]);

  const handleAdmission = async (visitId: string, bedId: string) => {
    if (!bedId) return message.warning('يرجى اختيار السرير أولاً');
    
    const { error } = await supabase.rpc('hims_admit_patient', {
      p_visit_id: visitId,
      p_bed_id: bedId
    });

    if (error) message.error(error.message);
    else {
      message.success('تم تسكين المريض بنجاح ✅');
      fetchData();
    }
  };

  const columns = [
    { title: 'المريض', dataIndex: ['hims_patients', 'full_name'] },
    { title: 'تاريخ الطلب', dataIndex: 'created_at', render: (d: string) => new Date(d).toLocaleString('ar-EG') },
    { title: 'السرير المقترح', render: (_: any, record: any) => (
      <Select 
        style={{ width: 200 }} 
        placeholder="اختر سريراً متاحاً" 
        onChange={(val) => setSelectedBeds(prev => ({ ...prev, [record.id]: val }))}
        options={availableBeds.map(bed => ({
          label: `${bed.hims_wards.name} - سرير ${bed.bed_number}`,
          value: bed.id
        }))}
      />
    )},
    { title: 'إجراء', render: (record: any) => (
      <Button 
        type="primary" 
        icon={<LoginOutlined />} 
        onClick={() => handleAdmission(record.id, selectedBeds[record.id])}
      >
        إتمام التسكين
      </Button>
    )}
  ];

  return (
    <div className="p-6 rtl text-right">
      <Row gutter={16} className="mb-6">
        <Col span={12}>
          <Card className="rounded-2xl shadow-sm"><Statistic title="حالات بانتظار أسرة" value={pendingVisits.length} prefix={<BankOutlined />} styles={{ content: { color: '#faad14' } }} /></Card>
        </Col>
        <Col span={12}>
          <Card className="rounded-2xl shadow-sm"><Statistic title="أسرة متاحة حالياً" value={availableBeds.length} styles={{ content: { color: '#52c41a' } }} /></Card>
        </Col>
      </Row>
      <Card title={<b>إدارة تسكين المرضى المنومين 🏥</b>} className="rounded-3xl shadow-lg border-none">
        <Table dataSource={pendingVisits} columns={columns} rowKey="id" loading={loading} />
      </Card>
    </div>
  );
};
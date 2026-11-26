import React, { useEffect, useState } from 'react';
import { supabase } from '@/supabaseClient';
import { Table, Button, Card, Tag, Select, message, Row, Col, Statistic } from 'antd';
import { LoginOutlined, BankOutlined } from '@ant-design/icons';
import { useAccounting } from '@/context/AccountingContext';
import { getActiveOrgIdSync, resolveActiveOrgId } from '../../../services/tenantContext';

export const AdmissionManager: React.FC = () => {
  const { organization } = useAccounting();
  const [pendingVisits, setPendingVisits] = useState<any[]>([]);
  const [availableBeds, setAvailableBeds] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedBeds, setSelectedBeds] = useState<Record<string, string>>({});

  const fetchData = async (resolvedOrgId?: string) => {
    const orgId = resolvedOrgId || getActiveOrgIdSync(organization?.id) || await resolveActiveOrgId(organization?.id);
    if (!orgId) return;
    setLoading(true);
    // جلب الحالات التي تحتاج تنويم ولم تُسكن بعد
    const [visitsRes, bedsRes] = await Promise.all([
      supabase
        .from('hims_visits')
        .select('id, visit_date, chief_complaint, patient_id, hims_patients(full_name)')
        .eq('organization_id', orgId)
        .eq('visit_type', 'inpatient')
        .eq('status', 'triaged')
        .limit(200),
      supabase
        .from('hims_beds')
        .select('id, bed_number, daily_rate, ward_id, hims_wards(name)')
        .eq('organization_id', orgId)
        .eq('status', 'available')
        .limit(200)
    ]);

    setPendingVisits(visitsRes.data || []);
    setAvailableBeds(bedsRes.data || []);
    setLoading(false);
  };

  useEffect(() => {
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let isMounted = true;

    const init = async () => {
      const orgId = getActiveOrgIdSync(organization?.id) || await resolveActiveOrgId(organization?.id);
      if (!orgId || !isMounted) return;
      await fetchData(orgId);

      // 📡 تفعيل المراقبة اللحظية المعزولة بالمنشأة لضمان تحديث قائمة الأسرة والزيارات فوراً
      channel = supabase.channel(`hims-admission-sync-${orgId}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'hims_beds', filter: `organization_id=eq.${orgId}` }, () => {
          fetchData(orgId);
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'hims_visits', filter: `organization_id=eq.${orgId}` }, () => {
          fetchData(orgId);
        })
        .subscribe();
    };

    init();

    return () => {
      isMounted = false;
      if (channel) supabase.removeChannel(channel);
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
    { title: 'السرير المقترح', render: (_: unknown, record: Record<string, any>) => (
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
    { title: 'إجراء', render: (record: Record<string, any>) => (
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
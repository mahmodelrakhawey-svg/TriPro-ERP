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
    // Ø¬Ù„Ø¨ Ø§Ù„Ø­Ø§Ù„Ø§Øª Ø§Ù„ØªÙŠ ØªØ­ØªØ§Ø¬ ØªÙ†ÙˆÙŠÙ… ÙˆÙ„Ù… ØªÙØ³ÙƒÙ† Ø¨Ø¹Ø¯
    const { data: visits } = await supabase
      .from('hims_visits')
      .select('*, hims_patients(full_name)')
      .eq('organization_id', organization.id)
      .eq('visit_type', 'inpatient')
      .eq('status', 'triaged');

    // Ø¬Ù„Ø¨ Ø§Ù„Ø£Ø³Ø±Ø© Ø§Ù„Ù…ØªØ§Ø­Ø©
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

    // ðŸ“¡ ØªÙØ¹ÙŠÙ„ Ø§Ù„Ù…Ø±Ø§Ù‚Ø¨Ø© Ø§Ù„Ù„Ø­Ø¸ÙŠØ© Ù„Ø¶Ù…Ø§Ù† ØªØ­Ø¯ÙŠØ« Ù‚Ø§Ø¦Ù…Ø© Ø§Ù„Ø£Ø³Ø±Ø© ÙˆØ§Ù„Ø²ÙŠØ§Ø±Ø§Øª ÙÙˆØ±Ø§Ù‹
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
    if (!bedId) return message.warning('ÙŠØ±Ø¬Ù‰ Ø§Ø®ØªÙŠØ§Ø± Ø§Ù„Ø³Ø±ÙŠØ± Ø£ÙˆÙ„Ø§Ù‹');
    
    const { error } = await supabase.rpc('hims_admit_patient', {
      p_visit_id: visitId,
      p_bed_id: bedId
    });

    if (error) message.error(error.message);
    else {
      message.success('ØªÙ… ØªØ³ÙƒÙŠÙ† Ø§Ù„Ù…Ø±ÙŠØ¶ Ø¨Ù†Ø¬Ø§Ø­ âœ…');
      fetchData();
    }
  };

  const columns = [
    { title: 'Ø§Ù„Ù…Ø±ÙŠØ¶', dataIndex: ['hims_patients', 'full_name'] },
    { title: 'ØªØ§Ø±ÙŠØ® Ø§Ù„Ø·Ù„Ø¨', dataIndex: 'created_at', render: (d: string) => new Date(d).toLocaleString('ar-EG') },
    { title: 'Ø§Ù„Ø³Ø±ÙŠØ± Ø§Ù„Ù…Ù‚ØªØ±Ø­', render: (_: unknown, record: Record<string, any>) => (
      <Select 
        style={{ width: 200 }} 
        placeholder="Ø§Ø®ØªØ± Ø³Ø±ÙŠØ±Ø§Ù‹ Ù…ØªØ§Ø­Ø§Ù‹" 
        onChange={(val) => setSelectedBeds(prev => ({ ...prev, [record.id]: val }))}
        options={availableBeds.map(bed => ({
          label: `${bed.hims_wards.name} - Ø³Ø±ÙŠØ± ${bed.bed_number}`,
          value: bed.id
        }))}
      />
    )},
    { title: 'Ø¥Ø¬Ø±Ø§Ø¡', render: (record: Record<string, any>) => (
      <Button 
        type="primary" 
        icon={<LoginOutlined />} 
        onClick={() => handleAdmission(record.id, selectedBeds[record.id])}
      >
        Ø¥ØªÙ…Ø§Ù… Ø§Ù„ØªØ³ÙƒÙŠÙ†
      </Button>
    )}
  ];

  return (
    <div className="p-6 rtl text-right">
      <Row gutter={16} className="mb-6">
        <Col span={12}>
          <Card className="rounded-2xl shadow-sm"><Statistic title="Ø­Ø§Ù„Ø§Øª Ø¨Ø§Ù†ØªØ¸Ø§Ø± Ø£Ø³Ø±Ø©" value={pendingVisits.length} prefix={<BankOutlined />} styles={{ content: { color: '#faad14' } }} /></Card>
        </Col>
        <Col span={12}>
          <Card className="rounded-2xl shadow-sm"><Statistic title="Ø£Ø³Ø±Ø© Ù…ØªØ§Ø­Ø© Ø­Ø§Ù„ÙŠØ§Ù‹" value={availableBeds.length} styles={{ content: { color: '#52c41a' } }} /></Card>
        </Col>
      </Row>
      <Card title={<b>Ø¥Ø¯Ø§Ø±Ø© ØªØ³ÙƒÙŠÙ† Ø§Ù„Ù…Ø±Ø¶Ù‰ Ø§Ù„Ù…Ù†ÙˆÙ…ÙŠÙ† ðŸ¥</b>} className="rounded-3xl shadow-lg border-none">
        <Table dataSource={pendingVisits} columns={columns} rowKey="id" loading={loading} />
      </Card>
    </div>
  );
};

import React, { useState, useEffect, useCallback } from 'react';
import { HospitalBillingEngine } from '../components/HospitalBillingEngine';
import { Card, Select, Empty, Spin, Table, Tag, Button, Tooltip, Row, Col, Statistic } from 'antd';
import { SearchOutlined, CreditCardOutlined, UserOutlined, ClockCircleOutlined, DollarOutlined } from '@ant-design/icons';
import { supabase } from '@/supabaseClient';
import { useAuth } from '@/context/AuthContext';
import dayjs from 'dayjs';

const MedicalBilling: React.FC = () => {
  const [visitId, setVisitId] = useState<string>('');
  const [visits, setVisits] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeBills, setActiveBills] = useState<any[]>([]);
  const [billsLoading, setBillsLoading] = useState(false);
  const { currentUser } = useAuth();

  const handleSearch = async (value: string) => {
    if (!value || value.length < 2) return;
    setLoading(true);
    
    // جلب الزيارات التي تطابق البحث (باسم المريض) وغير المغلقة مالياً
    const { data } = await supabase
      .from('hims_visits')
      .select('id, created_at, hims_patients!inner(full_name)')
      .eq('organization_id', currentUser?.organization_id)
      .ilike('hims_patients.full_name', `%${value}%`)
      .neq('status', 'discharged') // الزيارات التي لا تزال جارية أو بانتظار الخروج
      .limit(20);

    setVisits(data || []);
    setLoading(false);
  };

  const fetchActiveBills = useCallback(async () => {
    const orgId = currentUser?.organization_id;
    if (!orgId) return;
    setBillsLoading(true);
    try {
      const { data, error } = await supabase
        .from('hims_billing')
        .select('*, hims_patients(full_name), hims_visits!inner(id, status, created_at, visit_type)')
        .eq('organization_id', orgId)
        .neq('hims_visits.status', 'discharged')
        .order('created_at', { ascending: false });
      
      if (!error) {
        setActiveBills(data || []);
      }
    } catch (e) {
      console.error('[MedicalBilling] Error fetching active bills:', e);
    } finally {
      setBillsLoading(false);
    }
  }, [currentUser?.organization_id]);

  useEffect(() => {
    fetchActiveBills();
  }, [fetchActiveBills]);

  // 📡 بث حي لتحديث المبالغ والزيارات فور تعديلها بالخزينة أو من الأطباء
  useEffect(() => {
    const orgId = currentUser?.organization_id;
    if (!orgId) return;

    const channel = supabase
      .channel('hims-billing-dashboard-sync')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'hims_billing' }, () => {
        fetchActiveBills();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'hims_visits' }, () => {
        fetchActiveBills();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [currentUser, fetchActiveBills]);

  const columns = [
    {
      title: 'المريض',
      render: (r: any) => (
        <div>
          <div className="font-bold text-slate-800">{r.hims_patients?.full_name || 'مريض غير مسجل'}</div>
          <div className="text-[10px] text-slate-400">زيارة: {r.visit_id.substring(0, 8)}</div>
        </div>
      )
    },
    {
      title: 'نوع الخدمة',
      dataIndex: ['hims_visits', 'visit_type'],
      render: (type: string) => {
        const typesMap: Record<string, { label: string, color: string }> = {
          outpatient: { label: 'عيادة خارجية', color: 'blue' },
          inpatient: { label: 'تنوم داخلي', color: 'purple' },
          emergency: { label: 'طوارئ 🚨', color: 'red' },
          surgery: { label: 'عمليات', color: 'volcano' }
        };
        const cfg = typesMap[type] || { label: type || 'أخرى', color: 'default' };
        return <Tag color={cfg.color} className="font-bold">{cfg.label}</Tag>;
      }
    },
    {
      title: 'المبلغ المطلوب',
      dataIndex: 'total_amount',
      render: (v: number) => <span className="font-bold text-slate-700">{Number(v || 0).toLocaleString()} EGP</span>
    },
    {
      title: 'المدفوع',
      dataIndex: 'patient_paid_amount',
      render: (v: number) => <span className="text-emerald-600 font-medium">{Number(v || 0).toLocaleString()} EGP</span>
    },
    {
      title: 'المتبقي المستحق',
      render: (r: any) => {
        const remaining = Math.max(0, (r.total_amount || 0) - (r.patient_paid_amount || 0) - (r.insurance_covered_amount || 0));
        return remaining > 0 ? (
          <b className="text-rose-600 font-bold">{remaining.toLocaleString()} EGP</b>
        ) : (
          <Tag color="success">مسدد بالكامل ✅</Tag>
        );
      }
    },
    {
      title: 'الإجراء',
      render: (record: any) => (
        <Button 
          type="primary" 
          icon={<CreditCardOutlined />} 
          size="small"
          onClick={() => setVisitId(record.visit_id)}
          className="bg-indigo-600 border-none font-bold"
        >
          محاسبة وتحصيل
        </Button>
      )
    }
  ];

  // حسابات إجمالية للملخص العلوي
  const totalPendingBalance = activeBills.reduce((acc, r) => {
    const rem = (r.total_amount || 0) - (r.patient_paid_amount || 0) - (r.insurance_covered_amount || 0);
    return acc + Math.max(0, rem);
  }, 0);

  return (
    <div className="p-6 rtl text-right space-y-6 bg-slate-50 min-h-screen">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-black text-slate-800">صندوق المحاسبة الطبية 🧾</h1>
          <p className="text-slate-400 text-xs mt-1">إدارة الفواتير والتحصيل المالي والربط مع الأستاذ العام</p>
        </div>
      </div>

      <Row gutter={[16, 16]} className="mb-6">
        <Col xs={24} md={8}>
          <Card className="rounded-2xl border-none shadow-sm text-center">
            <Statistic 
              title="إجمالي المبالغ المعلقة المطلوبة" 
              value={totalPendingBalance} 
              precision={2}
              suffix="EGP" 
              styles={{ content: { color: '#ef4444', fontWeight: 900 } }}
              prefix={<DollarOutlined />} 
            />
          </Card>
        </Col>
        <Col xs={24} md={8}>
          <Card className="rounded-2xl border-none shadow-sm text-center">
            <Statistic 
              title="عدد المرضى المعلقين مالياً" 
              value={activeBills.length} 
              prefix={<UserOutlined className="text-blue-500" />} 
            />
          </Card>
        </Col>
        <Col xs={24} md={8}>
          <Card className="rounded-2xl border-none shadow-sm text-center">
            <Statistic 
              title="آخر تحديث للبيانات" 
              value={dayjs().format('HH:mm:ss')} 
              prefix={<ClockCircleOutlined className="text-emerald-500" />} 
            />
          </Card>
        </Col>
      </Row>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-1 space-y-4">
          <Card title="البحث الفوري عن مريض" className="rounded-2xl shadow-sm border-none">
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-500">ابحث باسم المريض:</label>
              <Select
                showSearch
                className="w-full"
                placeholder="اكتب اسم المريض للبحث..."
                filterOption={false}
                onSearch={handleSearch}
                onChange={(val) => setVisitId(val)}
                notFoundContent={loading ? <Spin size="small" /> : <Empty description="لا توجد زيارات مطابقة" />}
                options={visits.map(v => ({
                  label: `${v.hims_patients?.full_name} (${dayjs(v.created_at).format('DD/MM HH:mm')})`,
                  value: v.id
                }))}
              />
              {visitId && (
                <Button 
                  block 
                  className="mt-3 font-bold" 
                  onClick={() => { setVisitId(''); setVisits([]); }}
                >
                  العودة لقائمة الحالات النشطة
                </Button>
              )}
            </div>
          </Card>
        </div>

        <div className="lg:col-span-2">
          {visitId ? (
            <HospitalBillingEngine visitId={visitId} />
          ) : (
            <Card title="كشف الحالات النشطة المطلوب تحصيلها مالياً" className="rounded-3xl border-none shadow-sm overflow-hidden">
              <Table 
                dataSource={activeBills} 
                columns={columns} 
                rowKey="id" 
                loading={billsLoading}
                pagination={{ pageSize: 8 }}
                locale={{ emptyText: <Empty description="لا توجد أي زيارات نشطة معلقة مالياً في الوقت الحالي 🎉" /> }}
              />
            </Card>
          )}
        </div>
      </div>
    </div>
  );
};

export default MedicalBilling;
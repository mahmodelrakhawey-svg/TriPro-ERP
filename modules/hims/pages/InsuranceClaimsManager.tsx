import React, { useState, useEffect } from 'react';
import { supabase } from '@/supabaseClient';
import { Card, Table, Button, Tag, Space, message, Statistic, Divider, Modal, Select, Empty, Tabs } from 'antd';
import { himsService } from '@/services/himsService';
import { SafetyCertificateOutlined, SendOutlined, DollarOutlined, CheckCircleOutlined, HistoryOutlined } from '@ant-design/icons';
import { useAccounting } from '@/context/AccountingContext';
import { useAuth } from '@/context/AuthContext';

export const InsuranceClaimsManager: React.FC = () => {
  const { currentUser } = useAuth();
  const [pendingBills, setPendingBills] = useState<any[]>([]);
  const [submittedClaims, setSubmittedClaims] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [insuranceProviders, setInsuranceProviders] = useState<any[]>([]);
  const { accounts, settings } = useAccounting();
  const [isSettleModalOpen, setIsSettleModalOpen] = useState(false);
  const [selectedClaim, setSelectedClaim] = useState<any>(null);
  const [settleBankAcc, setSettleBankAcc] = useState<string>('');
  const [selectedInsuranceProvider, setSelectedInsuranceProvider] = useState<string | null>(null);

  const fetchPendingInsuranceBills = async () => {
    if (!currentUser?.organization_id) return;
    setLoading(true);

    // جلب شركات التأمين المتاحة (من العملاء الذين تم استخدامهم كشركات تأمين)
    const { data: providersData, error: providersError } = await supabase
      .from('customers')
      .select('id, name')
      .eq('organization_id', currentUser.organization_id)
      .eq('customer_type', 'insurance_provider'); // افتراض أن لدينا نوع عميل لشركات التأمين
    
    if (providersError) message.error('فشل جلب شركات التأمين');
    else setInsuranceProviders(providersData || []);

    // جلب الفواتير المعلقة
    if (!currentUser?.organization_id) return;
    setLoading(true);
    const { data } = await supabase
      .from('hims_billing')
      .select('*, hims_patients(full_name), insurance:insurance_provider_id(name)')
      .gt('insurance_covered_amount', 0)
      .is('insurance_claim_id', null) // فقط الفواتير التي لم تُربط بمطالبة بعد
      .order('created_at', { ascending: true });
    
    // فلترة إضافية حسب شركة التأمين المختارة
    const filteredData = selectedInsuranceProvider
      ? data?.filter(bill => bill.insurance_provider_id === selectedInsuranceProvider)
      : data;

    setPendingBills(filteredData || []);

    // جلب المطالبات التي تم إرسالها ولم تُسدد بعد
    const { data: claims } = await supabase
      .from('hims_insurance_claims')
      .select('*, insurance:insurance_provider_id(name)')
      .eq('organization_id', currentUser.organization_id)
      .eq('status', 'submitted');
    
    setSubmittedClaims(claims || []);
    setLoading(false);
  };

  useEffect(() => { fetchPendingInsuranceBills(); }, [selectedInsuranceProvider, currentUser?.organization_id]);

  const generateBatchClaim = async () => {
    if (pendingBills.length === 0 || !selectedInsuranceProvider) {
      return message.warning('يرجى اختيار شركة تأمين وتوفر فواتير معلقة لتوليد المطالبة.');
    }
    
    setLoading(true);
    const batchRef = `CLAIM-BATCH-${Date.now()}`;

    try {
      // 🚀 استدعاء العقل المدبر في قاعدة البيانات لتجميع المطالبة في عملية واحدة
      const { data: claimId, error } = await supabase.rpc('hims_create_insurance_batch', {
        p_insurance_provider_id: selectedInsuranceProvider,
        p_batch_ref: batchRef
      });

      if (error) throw error;

      message.success(`تم توليد مطالبة مجمعة بنجاح ✅ مرجع: ${batchRef}`);
      await fetchPendingInsuranceBills();
    } catch (err: any) {
      message.error('فشل تجميع المطالبة: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSettleClaim = async () => {
    if (!settleBankAcc) return message.warning('يرجى اختيار الحساب البنكي للتحصيل');
    setLoading(true); // يجب أن يكون هنا
    try {
      await himsService.settleInsuranceClaim(
        selectedClaim.id,
        selectedClaim.total_claim_amount, // نفترض تحصيل المبلغ بالكامل
        settleBankAcc
      );
      message.success('تمت تسوية المطالبة وترحيل المبلغ للبنك بنجاح ✅');
      setIsSettleModalOpen(false);
      fetchPendingInsuranceBills();
    } catch (error: any) {
      message.error(error.message || 'فشل في تسوية المطالبة');
    } finally {
      setLoading(false); // يجب أن يكون هنا
    }
  };

  return (
    <div className="p-6 rtl text-right">
      <Card className="rounded-3xl shadow-lg border-none">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-black m-0 flex items-center gap-2">
            <SafetyCertificateOutlined className="text-blue-600" /> إدارة مطالبات التأمين الطبي
          </h2>
          <div className="flex items-center gap-2">
            <label className="text-sm font-bold text-slate-600">شركة التأمين:</label>
            <Select
              style={{ width: 200 }}
              placeholder="اختر شركة التأمين"
              onChange={setSelectedInsuranceProvider}
              value={selectedInsuranceProvider}
              options={[
                { label: 'كل الشركات', value: null },
                ...insuranceProviders.map(provider => ({
                  label: provider.name,
                  value: provider.id
                }))
              ]}
            />
          </div>
          <Button 
            type="primary" 
            size="large" 
            icon={<SendOutlined />} 
            onClick={generateBatchClaim}
            disabled={pendingBills.length === 0}
            className="bg-indigo-600 border-none rounded-xl"
          >
            توليد مطالبة مجمعة (Batch)
          </Button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <Statistic title="عدد الفواتير المعلقة" value={pendingBills.length} prefix={<DollarOutlined />} />
          <Statistic 
            title="إجمالي المبلغ المستحق من التأمين" 
            value={pendingBills.reduce((acc, curr) => acc + curr.insurance_covered_amount, 0)} 
            suffix="EGP" 
            styles={{ content: { color: '#1890ff', fontWeight: 'bold' } }}
          />
          <Statistic title="المطالبات المفتوحة" value={submittedClaims.length} suffix="مطالبة" />
        </div>

        <Tabs defaultActiveKey="1" items={[
          {
            key: '1',
            label: <span><SendOutlined /> فواتير بانتظار التجميع</span>,
            children: (
              <Table 
                dataSource={pendingBills} 
                rowKey="id"
                columns={[
                  { title: 'المريض', dataIndex: ['hims_patients', 'full_name'] },
                  { title: 'شركة التأمين', dataIndex: ['insurance', 'name'], render: (name) => <Tag color="blue">{name}</Tag> },
                  { title: 'المبلغ المغطى', dataIndex: 'insurance_covered_amount', render: (v) => <b className="text-blue-600">{v?.toLocaleString()} {settings?.currency || 'EGP'}</b> },
                  { title: 'تاريخ الفاتورة', dataIndex: 'created_at', render: (d) => new Date(d).toLocaleDateString('ar-EG') },
                ]}
              />
            )
          },
          {
            key: '2',
            label: <span><HistoryOutlined /> مطالبات تم إرسالها</span>,
            children: (
              <Table 
                dataSource={submittedClaims} 
                rowKey="id"
                columns={[
                  { title: 'رقم المطالبة', dataIndex: 'batch_reference', render: (ref) => <Tag color="purple">{ref}</Tag> },
                  { title: 'شركة التأمين', dataIndex: ['insurance', 'name'] },
                  { title: 'إجمالي المبلغ', dataIndex: 'total_claim_amount', render: (v) => <b className="text-emerald-600">{v?.toLocaleString()} {settings?.currency || 'EGP'}</b> },
                  { title: 'تاريخ الإرسال', dataIndex: 'submission_date', render: (d) => new Date(d).toLocaleDateString('ar-EG') },
                  { title: 'إجراء', render: (record: any) => (
                    <Button type="primary" icon={<CheckCircleOutlined />} onClick={() => { setSelectedClaim(record); setIsSettleModalOpen(true); }}>تسوية وتحصيل</Button>
                  )}
                ]}
              />
            )
          }
        ]} />
      </Card>

      <Modal
        title="تسوية تحصيل من شركة تأمين"
        open={isSettleModalOpen}
        onOk={handleSettleClaim}
        confirmLoading={loading}
        onCancel={() => setIsSettleModalOpen(false)}
      >
        <div className="space-y-4 pt-4">
          <p>سيتم تحصيل مبلغ <b>{selectedClaim?.total_claim_amount} {settings?.currency || 'EGP'}</b> من شركة التأمين.</p>
          <label className="block text-xs font-bold text-slate-500">اختر حساب البنك/الخزينة المستلم:</label>
          <Select 
            className="w-full" 
            placeholder="اختر الحساب..." 
            onChange={setSettleBankAcc}
            options={accounts.filter(a => a.code.startsWith('123')).map(a => ({ label: a.name, value: a.id }))}
          />
        </div>
      </Modal>
    </div>
  );
};
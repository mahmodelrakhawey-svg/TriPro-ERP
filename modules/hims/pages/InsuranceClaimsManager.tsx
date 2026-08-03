import React, { useState, useEffect } from 'react';
import { supabase } from '@/supabaseClient';
import { Card, Table, Button, Tag, Space, message, Statistic, Divider, Modal, Select, Empty, Tabs } from 'antd';
import { himsService } from '@/services/himsService';
import { SafetyCertificateOutlined, SendOutlined, DollarOutlined, CheckCircleOutlined, HistoryOutlined, DownloadOutlined } from '@ant-design/icons';
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
  const [selectedInsuranceProvider, setSelectedInsuranceProvider] = useState<string>('all');

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
    const filteredData = selectedInsuranceProvider && selectedInsuranceProvider !== 'all'
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
    if (pendingBills.length === 0 || !selectedInsuranceProvider || selectedInsuranceProvider === 'all') {
      return message.warning('يرجى اختيار شركة تأمين محددة وتوفر فواتير معلقة لتوليد المطالبة.');
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

  const exportClaimToXML = async (claim: any) => {
    setLoading(true);
    message.loading({ content: 'جاري توليد ملف XML للمطالبة... ⏳', key: 'xml_export' });
    try {
      const { data: bills, error: billsError } = await supabase
        .from('hims_billing')
        .select(`
          id,
          total_amount,
          tax_amount,
          insurance_covered_amount,
          patient_paid_amount,
          created_at,
          patient:patient_id(full_name, national_id, dob, gender),
          items:hims_billing_items(description, quantity, unit_price, total_price, item_type)
        `)
        .eq('insurance_claim_id', claim.id);

      if (billsError) throw billsError;

      if (!bills || bills.length === 0) {
        message.warning({ content: 'لا توجد فواتير مرتبطة بهذه المطالبة للتصدير.', key: 'xml_export' });
        return;
      }

      // Build XML string
      let xml = `<?xml version="1.0" encoding="UTF-8"?>\n`;
      xml += `<Claim.Request>\n`;
      
      // Header Section
      xml += `  <Header>\n`;
      xml += `    <SenderID>${currentUser?.organization_id || 'ORG-UNKNOWN'}</SenderID>\n`;
      xml += `    <ReceiverID>${claim.insurance_provider_id || 'INS-UNKNOWN'}</ReceiverID>\n`;
      xml += `    <TransactionDate>${new Date().toISOString().split('T')[0]}</TransactionDate>\n`;
      xml += `    <RecordCount>${bills.length}</RecordCount>\n`;
      xml += `    <BatchReference>${claim.batch_reference}</BatchReference>\n`;
      xml += `  </Header>\n`;

      // Claims Section
      xml += `  <Claims>\n`;
      for (const bill of bills) {
        const patientObj = Array.isArray(bill.patient) ? bill.patient[0] : bill.patient;
        xml += `    <Claim>\n`;
        xml += `      <ID>${bill.id}</ID>\n`;
        xml += `      <Patient>\n`;
        xml += `        <Name>${patientObj?.full_name || 'N/A'}</Name>\n`;
        xml += `        <NationalID>${patientObj?.national_id || 'N/A'}</NationalID>\n`;
        xml += `        <DOB>${patientObj?.dob || 'N/A'}</DOB>\n`;
        xml += `        <Gender>${patientObj?.gender || 'N/A'}</Gender>\n`;
        xml += `      </Patient>\n`;
        
        xml += `      <Encounter>\n`;
        xml += `        <Date>${new Date(bill.created_at).toISOString().split('T')[0]}</Date>\n`;
        xml += `        <TotalAmount>${bill.total_amount}</TotalAmount>\n`;
        xml += `        <TaxAmount>${bill.tax_amount}</TaxAmount>\n`;
        xml += `        <InsuranceCoveredAmount>${bill.insurance_covered_amount}</InsuranceCoveredAmount>\n`;
        xml += `      </Encounter>\n`;

        xml += `      <Details>\n`;
        if (bill.items && Array.isArray(bill.items)) {
          for (const item of bill.items) {
            xml += `        <Item>\n`;
            xml += `          <Type>${item.item_type || 'other'}</Type>\n`;
            xml += `          <Description>${item.description}</Description>\n`;
            xml += `          <Quantity>${item.quantity}</Quantity>\n`;
            xml += `          <UnitPrice>${item.unit_price}</UnitPrice>\n`;
            xml += `          <TotalPrice>${item.total_price}</TotalPrice>\n`;
            xml += `        </Item>\n`;
          }
        }
        xml += `      </Details>\n`;
        xml += `    </Claim>\n`;
      }
      xml += `  </Claims>\n`;
      xml += `</Claim.Request>\n`;

      // Download file in browser
      const blob = new Blob([xml], { type: 'application/xml;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `${claim.batch_reference}.xml`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      message.success({ content: 'تم تصدير ملف XML بنجاح ✅', key: 'xml_export' });
    } catch (e: any) {
      console.error(e);
      message.error({ content: `فشل تصدير XML: ${e.message}`, key: 'xml_export' });
    } finally {
      setLoading(false);
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
                { label: 'كل الشركات', value: 'all' },
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
                    <Space size="middle">
                      <Button type="primary" icon={<CheckCircleOutlined />} onClick={() => { setSelectedClaim(record); setIsSettleModalOpen(true); }}>تسوية وتحصيل</Button>
                      <Button type="default" icon={<DownloadOutlined />} onClick={() => exportClaimToXML(record)}>تصدير XML</Button>
                    </Space>
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
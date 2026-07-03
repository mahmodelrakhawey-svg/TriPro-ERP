import React, { useState, useEffect } from 'react';
import { supabase } from '@/supabaseClient';
import { Button, Card, Descriptions, Divider, Statistic, message, Tag, Space, Table, InputNumber, Tooltip, Checkbox, Select } from 'antd';
import { DollarOutlined, AuditOutlined, PrinterOutlined, ClockCircleOutlined, SolutionOutlined, SafetyCertificateOutlined, InfoCircleOutlined } from '@ant-design/icons';
import { useAccounting } from '@/context/AccountingContext';
import dayjs from 'dayjs';
import { LuxuryReportEngine } from '../../../components/LuxuryReportEngine';

export const HospitalBillingEngine: React.FC<{ visitId: string }> = ({ visitId }) => {
  const [loading, setLoading] = useState(false);
  const [bill, setBill] = useState<any>(null);
  const [billItems, setBillItems] = useState<any[]>([]);
  const { settings } = useAccounting();
  const [manualDiscount, setManualDiscount] = useState(0);
  const [isDepositMode, setIsDepositMode] = useState(false);
  const [depositAmount, setDepositAmount] = useState<number>(0);
  const [insuranceProviders, setInsuranceProviders] = useState<any[]>([]);
  const [isInsuranceMode, setIsInsuranceMode] = useState(false);
  const [selectedInsurance, setSelectedInsurance] = useState<string | null>(null);
  const [insuranceAmount, setInsuranceAmount] = useState<number>(0);

  useEffect(() => {
    const fetchInsurance = async () => {
      const orgId = settings?.organization_id || settings?.id;
      if (!orgId) return;
      const { data } = await supabase.from('customers').select('id, name');
      setInsuranceProviders(data || []);
    };
    fetchInsurance();
  }, [settings]);

  const calculateBill = async () => {
    // 🛡️ التحقق من صحة تنسيق المعرف قبل الإرسال لتجنب خطأ 400
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(visitId)) {
      return message.error('عذراً، يجب إدخال كود الزيارة بشكل صحيح (UUID). تأكد من اختيار الزيارة من القائمة.');
    }

    setLoading(true);
    try {
      // 1. استدعاء العقل المدبر لحساب التكاليف
      const { data: billId, error: rpcError } = await supabase.rpc('hims_prepare_invoice', { p_visit_id: visitId });
      
      if (rpcError) throw rpcError;
      if (!billId) throw new Error('لم يتم العثور على سجلات مالية لهذه الزيارة');

      // 2. جلب تفاصيل الفاتورة
      const { data, error: fetchError } = await supabase.from('hims_billing').select('*, hims_patients(*), insurance:insurance_provider_id(name)').eq('id', billId).single();
      if (fetchError) throw fetchError;

      // 3. جلب تفاصيل الخدمات (أدوية، تحاليل، إقامة) لضمان الشفافية المحاسبية الكاملة
      const { data: items } = await supabase
        .from('hims_billing_items')
        .select('*')
        .eq('billing_id', billId)
        .order('item_type', { ascending: true });

      setBillItems(items || []);
      setBill(data);
    } catch (err: any) {
      message.error('فشل معالجة الفاتورة: ' + (err.message || 'خطأ غير معروف'));
    } finally {
      setLoading(false);
    }
  };
  // 🚀 استدعاء المحرك الفاخر (لا يستهلك موارد إلا عند الضغط)
  const printLuxuryInvoice = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.rpc('hims_get_luxury_invoice_data', { p_visit_id: visitId });
      if (error) throw error;
      await LuxuryReportEngine.generatePDF(data, 'invoice');
    } catch (err: any) {
      message.error('فشل جلب البيانات الفاخرة: ' + err.message);
    }
    setLoading(false);
  };

  const postToGL = async () => {
    if (!bill) return;

    const treasuryId = settings?.defaultTreasuryId ?? settings?.default_treasury_id;

    if (!treasuryId) {
      return message.error('يرجى ضبط الخزينة الافتراضية في إعدادات المنشأة أولاً ⚠️');
    }

    if (isInsuranceMode) {
      if (!selectedInsurance) {
        return message.error('يرجى اختيار شركة التأمين أولاً ⚠️');
      }
      if (insuranceAmount <= 0 || insuranceAmount > totalAmount) {
        return message.error('يرجى إدخال مبلغ تغطية تأمينية صحيح ⚠️');
      }
    }

    if (isDepositMode && depositAmount <= 0) {
      return message.error('يرجى تحديد مبلغ مقدم أكبر من الصفر ⚠️');
    }

    setLoading(true);

    // 1. تحديث بيانات شركة التأمين ونسبة التحمل بالخلفية لترحيلها محاسبياً بشكل سليم
    const { error: updateErr } = await supabase.from('hims_billing').update({
      insurance_provider_id: isInsuranceMode ? selectedInsurance : null,
      insurance_covered_amount: isInsuranceMode ? insuranceAmount : 0
    }).eq('id', bill.id);

    if (updateErr) {
      setLoading(false);
      return message.error('فشل تحديث بيانات التأمين في الفاتورة: ' + updateErr.message);
    }

    // 2. ترحيل المعاملة وإنشاء قيود المحاسبة لدفتر الأستاذ العام
    const { error } = await supabase.rpc('hims_finalize_billing', {
      p_billing_id: bill.id,
      p_cash_acc: treasuryId,
      p_custom_amount: isDepositMode ? depositAmount : null
    });

    if (error) message.error(error.message);
    else {
      message.success(isDepositMode ? 'تم تسجيل دفعة المقدم وترحيل القيد بنجاح ✅' : 'تم تحصيل الفاتورة وترحيل القيود للأستاذ العام بنجاح ✅');
      setBill(null);
      setIsDepositMode(false);
      setDepositAmount(0);
      setIsInsuranceMode(false);
      setSelectedInsurance(null);
      setInsuranceAmount(0);
    }
    setLoading(false);
  };

  // حسابات محرك التعاقدات اللحظية
  const totalAmount = bill?.total_amount || 0;
  const insuranceCoverage = isInsuranceMode ? insuranceAmount : (bill?.insurance_covered_amount || 0);
  const paidAmount = bill?.patient_paid_amount || 0;
  const initialPatientShare = totalAmount - insuranceCoverage; // ⚡️ تجاوز الحقل المولد بقاعدة البيانات لتجنب الخطأ
  const remainingShare = Math.max(0, initialPatientShare - paidAmount);
  const finalAmountToPay = isDepositMode ? depositAmount : Math.max(0, remainingShare - manualDiscount);

  return (
    <Card className="rounded-3xl shadow-xl overflow-hidden border-none bg-white">
      <div className="bg-slate-900 p-6 -m-6 mb-6 text-white flex justify-between items-center">
        <h2 className="font-black text-xl m-0 flex items-center gap-2"><DollarOutlined /> مركز التحصيل المالي الموحد</h2>
        {!bill && <Button type="primary" onClick={calculateBill} loading={loading} className="bg-blue-600 border-none font-bold">إصدار الفاتورة اللحظية</Button>}
      </div>

      {bill && (
        <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
          {bill.insurance_provider_id && (
            <div className="mb-4 bg-emerald-50 border border-emerald-100 p-4 rounded-2xl flex items-center justify-between">
              <div className="flex items-center gap-3">
                <SafetyCertificateOutlined className="text-emerald-600 text-2xl" />
                <div>
                  <div className="font-black text-emerald-800">مريض تأميني: {bill.insurance?.name}</div>
                  <div className="text-xs text-emerald-600">سيتم ترحيل المبلغ المغطى تلقائياً إلى حساب ذمم التأمين</div>
                </div>
              </div>
              <Tag color="green" className="rounded-full px-4 font-bold">مفعل</Tag>
            </div>
          )}

          <Descriptions title="تفاصيل المحاسبة النهائية" bordered column={2} size="small" className="font-bold">
            <Descriptions.Item label="المريض">{bill.hims_patients?.full_name}</Descriptions.Item>
            <Descriptions.Item label="تاريخ الدخول">{dayjs(bill.created_at).format('YYYY-MM-DD')}</Descriptions.Item>
            <Descriptions.Item label="مدة الإقامة">
              <Tag color="blue" icon={<ClockCircleOutlined />}>
                {Math.max(1, dayjs().diff(dayjs(bill.created_at), 'day'))} يوم
              </Tag>
            </Descriptions.Item>
            <Descriptions.Item label="إجمالي قيمة الخدمات">{totalAmount.toLocaleString()} EGP</Descriptions.Item>
            <Descriptions.Item label="تغطية التأمين">
              <span className="text-emerald-600">{insuranceCoverage.toLocaleString()} EGP</span>
            </Descriptions.Item>
            <Descriptions.Item label="المسدد سابقاً">
              <span className="text-slate-500">{paidAmount.toLocaleString()} EGP</span>
            </Descriptions.Item>
            <Descriptions.Item label="المطلوب سداده حالياً">
              <span className="text-blue-700">{remainingShare.toLocaleString()} EGP</span>
            </Descriptions.Item>
          </Descriptions>

          <Divider><SolutionOutlined /> المراجعة المالية للخدمات</Divider>
          <Table 
            dataSource={billItems} 
            rowKey="id"
            size="small" 
            pagination={false}
            className="mb-6 border rounded-xl overflow-hidden"
            columns={[
              { 
                title: 'التصنيف', 
                dataIndex: 'item_type', 
                render: (type) => {
                  let color = 'orange';
                  let label = 'خدمات أخرى';
                  if (type === 'consultation') { color = 'orange'; label = 'كشف عيادة'; }
                  else if (type === 'pharmacy') { color = 'blue'; label = 'دواء'; }
                  else if (type === 'lab') { color = 'purple'; label = 'تحاليل'; }
                  else if (type === 'radiology') { color = 'cyan'; label = 'أشعة'; }
                  else if (type === 'surgery') { color = 'volcano'; label = 'عمليات'; }
                  else if (type === 'accommodation') { color = 'gold'; label = 'إقامة'; }
                  return <Tag color={color}>{label}</Tag>;
                }
              },
              { title: 'البند', dataIndex: 'description' },
              { title: 'الكمية', dataIndex: 'quantity', align: 'center' },
              { title: 'سعر الوحدة', dataIndex: 'unit_price', render: (v) => v?.toLocaleString() },
              { title: 'الإجمالي', dataIndex: 'total_price', render: (v) => <b>{v?.toLocaleString()}</b> },
            ]}
          />

          <div className="bg-slate-50 p-4 rounded-2xl mb-6 border border-slate-200 flex flex-col gap-4">
            <div className="flex justify-between items-center">
              <div className="flex items-center gap-3">
                <Checkbox 
                  checked={isDepositMode} 
                  onChange={(e) => {
                    setIsDepositMode(e.target.checked);
                    if (e.target.checked) {
                      setIsInsuranceMode(false);
                      setSelectedInsurance(null);
                      setInsuranceAmount(0);
                    }
                    if (!e.target.checked) setDepositAmount(0);
                  }}
                  className="font-black text-slate-700"
                  disabled={isInsuranceMode}
                >
                  سداد دفعة مقدمة / مقدم دخول سرير (Admission Deposit)
                </Checkbox>
                {isDepositMode && (
                  <InputNumber
                    min={1}
                    placeholder="أدخل مبلغ الدفعة..."
                    value={depositAmount}
                    onChange={(v) => setDepositAmount(v || 0)}
                    className="w-48 font-bold"
                  />
                )}
              </div>

              <div className="text-left">
                <div className="text-xs font-bold text-slate-500 flex items-center gap-1 justify-end">
                  خصم إضافي (يدوي) <Tooltip title="يستخدم في حالات الخصم الاستثنائي للمرضى النقديين"><InfoCircleOutlined /></Tooltip>
                </div>
                <InputNumber 
                  min={0} 
                  max={initialPatientShare}
                  value={manualDiscount} 
                  onChange={(v) => setManualDiscount(v || 0)} 
                  className="w-40 font-bold"
                  disabled={isDepositMode || isInsuranceMode}
                />
              </div>
            </div>

            <Divider className="my-1" />

            <div className="flex items-center gap-4">
              <Checkbox
                checked={isInsuranceMode}
                onChange={(e) => {
                  setIsInsuranceMode(e.target.checked);
                  if (e.target.checked) {
                    setIsDepositMode(false);
                    setDepositAmount(0);
                  } else {
                    setSelectedInsurance(null);
                    setInsuranceAmount(0);
                  }
                }}
                className="font-black text-slate-700"
                disabled={isDepositMode}
              >
                تطبيق مظلة التأمين الطبي (Apply Insurance)
              </Checkbox>
              {isInsuranceMode && (
                <Space>
                  <Select
                    placeholder="اختر شركة التأمين..."
                    style={{ width: 220 }}
                    value={selectedInsurance}
                    onChange={(v) => setSelectedInsurance(v)}
                    options={insuranceProviders.map(p => ({ label: p.name, value: p.id }))}
                  />
                  <InputNumber
                    min={1}
                    max={totalAmount}
                    placeholder="مبلغ التغطية تأمينياً..."
                    value={insuranceAmount}
                    onChange={(v) => setInsuranceAmount(v || 0)}
                    className="w-48 font-bold"
                  />
                </Space>
              )}
            </div>
          </div>

          <div className="bg-blue-50 p-6 mt-6 rounded-2xl flex justify-between items-center border border-blue-100">
            <Statistic 
              title={<span className="font-black text-blue-800">صافي المطلوب تحصيله الآن</span>} 
              value={finalAmountToPay} 
              precision={2} 
              suffix="EGP" 
              valueStyle={{ color: '#1d4ed8', fontWeight: 900, fontSize: '2rem' }}
            />
            <div className="flex flex-col gap-2">
               <Button icon={<PrinterOutlined />} block onClick={printLuxuryInvoice} className="bg-slate-800 text-white border-none">طباعة فاتورة فندقية</Button>
               {finalAmountToPay <= 0 && bill.payment_status === 'paid' ? (
                 <Tag color="success" className="px-6 py-4 font-bold text-sm rounded-xl">تم السداد والترحيل بالكامل ✅</Tag>
               ) : (
                 <Button 
                  type="primary" 
                  size="large" 
                  icon={<AuditOutlined />} 
                  className="bg-emerald-600 border-none h-14 px-8 font-black"
                  onClick={postToGL}
                  loading={loading}
                 >
                   اعتماد وترحيل للقيد المزدوج
                 </Button>
               )}
            </div>
          </div>
          
          <p className="text-[10px] text-slate-400 mt-4 text-center font-bold">
            * عند الاعتماد سيتم إنشاء قيد: من ح/ الصندوق و ح/ ذمم التأمين - إلى ح/ إيرادات الخدمات الطبية
          </p>
        </div>
      )}
    </Card>
  );
};
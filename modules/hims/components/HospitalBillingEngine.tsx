import React, { useState } from 'react';
import { supabase } from '@/supabaseClient';
import { Button, Card, Descriptions, Divider, Statistic, message, Tag, Space, Table, InputNumber, Tooltip } from 'antd';
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
      const { data, error: fetchError } = await supabase.from('hims_billing').select('*, hims_patients(*)').eq('id', billId).single();
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

    // يدعم اسمي الحقل المحتملين حسب ما يرجعه الـ RPC:
    // - defaultTreasuryId (CamelCase)
    // - default_treasury_id (SnakeCase)
    const treasuryId = settings?.defaultTreasuryId ?? settings?.default_treasury_id;

    if (!treasuryId) {
      return message.error('يرجى ضبط الخزينة الافتراضية في إعدادات المنشأة أولاً ⚠️');
    }

    setLoading(true);
    const { error } = await supabase.rpc('hims_finalize_billing', {
      p_billing_id: bill.id,
      p_cash_acc: treasuryId
    });

    if (error) message.error(error.message);
    else {
      message.success('تم تحصيل الفاتورة وترحيل القيود للأستاذ العام بنجاح ✅');
      setBill(null);
    }
    setLoading(false);
  };

  // حسابات محرك التعاقدات اللحظية
  const totalAmount = bill?.total_amount || 0;
  const insuranceCoverage = bill?.insurance_covered_amount || 0;
  const initialPatientShare = bill?.patient_share_amount || (totalAmount - insuranceCoverage);
  const finalAmountToPay = Math.max(0, initialPatientShare - manualDiscount);

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
            <Descriptions.Item label="التحمل النقدي الأساسي">
              <span className="text-blue-700">{initialPatientShare.toLocaleString()} EGP</span>
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
                render: (type) => (
                  <Tag color={type === 'medication' ? 'blue' : type === 'lab' ? 'purple' : 'orange'}>
                    {type === 'medication' ? 'دواء' : type === 'lab' ? 'تحاليل' : 'خدمات/إقامة'}
                  </Tag>
                )
              },
              { title: 'البند', dataIndex: 'item_name' },
              { title: 'الكمية', dataIndex: 'quantity', align: 'center' },
              { title: 'سعر الوحدة', dataIndex: 'unit_price', render: (v) => v?.toLocaleString() },
              { title: 'الإجمالي', dataIndex: 'total_price', render: (v) => <b>{v?.toLocaleString()}</b> },
            ]}
          />

          <div className="flex justify-end gap-4 items-center mb-6 bg-slate-50 p-4 rounded-2xl">
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
              />
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
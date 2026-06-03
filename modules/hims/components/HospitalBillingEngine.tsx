import React, { useState } from 'react';
import { supabase } from '@/supabaseClient';
import { Button, Card, Descriptions, Divider, Statistic, message, Tag, Space } from 'antd';
import { DollarOutlined, AuditOutlined, PrinterOutlined, ClockCircleOutlined } from '@ant-design/icons';
import { useAccounting } from '@/context/AccountingContext';
import dayjs from 'dayjs';

export const HospitalBillingEngine: React.FC<{ visitId: string }> = ({ visitId }) => {
  const [loading, setLoading] = useState(false);
  const [bill, setBill] = useState<any>(null);
  const { settings } = useAccounting();

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

      setBill(data);
    } catch (err: any) {
      message.error('فشل معالجة الفاتورة: ' + (err.message || 'خطأ غير معروف'));
    } finally {
      setLoading(false);
    }
  };

  const postToGL = async () => {
    if (!bill) return;
    if (!settings?.defaultTreasuryId) {
      return message.error('يرجى ضبط الخزينة الافتراضية في إعدادات المنشأة أولاً ⚠️');
    }

    setLoading(true);
    const { error } = await supabase.rpc('hims_finalize_billing', { 
      p_billing_id: bill.id, 
      p_cash_acc: settings.defaultTreasuryId
    });

    if (error) message.error(error.message);
    else {
      message.success('تم تحصيل الفاتورة وترحيل القيود للأستاذ العام بنجاح ✅');
      setBill(null);
    }
    setLoading(false);
  };

  return (
    <Card className="rounded-3xl shadow-xl overflow-hidden border-none bg-white">
      <div className="bg-slate-900 p-6 -m-6 mb-6 text-white flex justify-between items-center">
        <h2 className="font-black text-xl m-0 flex items-center gap-2"><DollarOutlined /> محرك الفوترة الطبية</h2>
        {!bill && <Button type="primary" onClick={calculateBill} loading={loading} className="bg-blue-600 border-none font-bold">إصدار الفاتورة اللحظية</Button>}
      </div>

      {bill && (
        <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
          <Descriptions title="تفاصيل المحاسبة النهائية" bordered column={2} size="small" className="font-bold">
            <Descriptions.Item label="المريض">{bill.hims_patients?.full_name}</Descriptions.Item>
            <Descriptions.Item label="تاريخ الدخول">{dayjs(bill.created_at).format('YYYY-MM-DD')}</Descriptions.Item>
            <Descriptions.Item label="مدة الإقامة">
              <Tag color="blue" icon={<ClockCircleOutlined />}>
                {dayjs().diff(dayjs(bill.created_at), 'day') || 1} يوم
              </Tag>
            </Descriptions.Item>
            <Descriptions.Item label="إجمالي الخدمات">{(bill.total_amount || 0).toLocaleString()} EGP</Descriptions.Item>
            <Descriptions.Item label="تغطية التأمين">
              <span className="text-emerald-600">{(bill.insurance_covered_amount || 0).toLocaleString()} EGP</span>
            </Descriptions.Item>
            <Descriptions.Item label="نسبة التحمل المريض">{(bill.patient_share_amount || 0).toLocaleString()} EGP</Descriptions.Item>
          </Descriptions>

          <div className="bg-blue-50 p-6 mt-6 rounded-2xl flex justify-between items-center border border-blue-100">
            <Statistic 
              title={<span className="font-black text-blue-800">المبلغ المطلوب تحصيله نقداً</span>} 
              value={bill.patient_share_amount || bill.total_amount} 
              precision={2} 
              suffix="EGP" 
              styles={{ content: { color: '#1d4ed8', fontWeight: 900, fontSize: '2rem' } }}
            />
            <div className="flex flex-col gap-2">
               <Button icon={<PrinterOutlined />} block>طباعة المسودة</Button>
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
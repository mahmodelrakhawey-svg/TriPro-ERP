import React, { useState } from 'react';
import { supabase } from '../supabaseClient';
import { Button, Modal, Result, Typography, Descriptions, message } from 'antd';
import { BankOutlined, DownloadOutlined } from '@ant-design/icons';

const { Text } = Typography;

export const SubcontractorPaymentButton: React.FC<{ billingId: string }> = ({ billingId }) => {
  const [visible, setVisible] = useState(false);
  const [orderData, setOrderData] = useState<any>(null);

  const handleGenerate = async () => {
    const { data, error } = await supabase.rpc('get_subcontractor_payment_order', { p_billing_id: billingId });
    if (error) {
      message.error('فشل جلب بيانات الدفع: ' + error.message);
      return;
    }
    setOrderData(data);
    setVisible(true);
  };

  return (
    <>
      <Button 
        type="primary" 
        icon={<BankOutlined />} 
        onClick={handleGenerate}
        className="bg-indigo-600 hover:bg-indigo-700"
      >
        توليد أمر دفع بنكي
      </Button>

      <Modal
        title="تأكيد أمر الدفع البنكي"
        open={visible}
        onCancel={() => setVisible(false)}
        footer={[
          <Button key="close" onClick={() => setVisible(false)}>إغلاق</Button>,
          <Button key="download" type="primary" icon={<DownloadOutlined />} className="bg-green-600">
            تحميل ملف (Excel/CSV) للبنك
          </Button>
        ]}
        width={600}
      >
        {orderData && (
          <div className="p-2">
            <Result
              status="info"
              title="أمر الدفع جاهز"
              subTitle={`المرجع: ${orderData.payment_ref}`}
            />
            <Descriptions bordered column={1} size="small">
              <Descriptions.Item label="اسم المستفيد">{orderData.beneficiary}</Descriptions.Item>
              <Descriptions.Item label="البنك">{orderData.bank}</Descriptions.Item>
              <Descriptions.Item label="رقم الآيبان (IBAN)">
                <Text copyable className="text-blue-600 font-mono">{orderData.iban}</Text>
              </Descriptions.Item>
              <Descriptions.Item label="المبلغ الصافي">{orderData.amount.toLocaleString()} EGP</Descriptions.Item>
            </Descriptions>
          </div>
        )}
      </Modal>
    </>
  );
};
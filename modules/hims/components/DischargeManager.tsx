import React, { useState } from 'react';
import { Button, Modal, Result, message } from 'antd';
import { LogoutOutlined, CheckCircleOutlined } from '@ant-design/icons';
import { supabase } from '@/supabaseClient';

export const DischargeManager: React.FC<{ visitId: string, onSuccess: () => void }> = ({ visitId, onSuccess }) => {
  const [visible, setVisible] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleDischarge = async () => {
    setLoading(true);
    // تحديث حالة الزيارة وإخلاء السرير آلياً عبر RPC
    const { error } = await supabase.rpc('hims_process_discharge', {
      p_visit_id: visitId
    });

    if (error) {
      message.error('فشل إجراء الخروج: ' + error.message);
    } else {
      message.success('تم إنهاء الزيارة وإخطار الحسابات بنجاح ✅');
      setVisible(false);
      onSuccess();
    }
    setLoading(false);
  };

  return (
    <>
      <Button danger icon={<LogoutOutlined />} onClick={() => setVisible(true)}>إنهاء الزيارة / خروج</Button>
      <Modal
        open={visible}
        onCancel={() => setVisible(false)}
        onOk={handleDischarge}
        confirmLoading={loading}
        title="تأكيد إجراءات الخروج"
      >
        <Result
          status="warning"
          title="هل أنت متأكد من اعتماد خروج المريض؟"
          subTitle="سيتم إخلاء السرير فوراً وإرسال إشعار للمحاسبة لإصدار الفاتورة النهائية."
        />
      </Modal>
    </>
  );
};
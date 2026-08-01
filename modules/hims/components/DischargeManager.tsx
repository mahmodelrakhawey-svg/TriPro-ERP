import React, { useState, useEffect } from 'react';
import { Button, Modal, Result, message, Space, Input } from 'antd';
import { LogoutOutlined, PrinterOutlined, FileSearchOutlined } from '@ant-design/icons';
import { supabase } from '@/supabaseClient';
import { LuxuryReportEngine } from '../../../components/LuxuryReportEngine'; // المسار الصحيح للمحرك

export const DischargeManager: React.FC<{ visitId: string, onSuccess: () => void }> = ({ visitId, onSuccess }) => {
  const [visible, setVisible] = useState(false);
  const [loading, setLoading] = useState(false);
  const [overridePwd, setOverridePwd] = useState('');
  const [showOverride, setShowOverride] = useState(false);

  const handleDischarge = async () => {
    setLoading(true);
    // 🛡️ تمرير كلمة السر (إن وجدت) لتجاوز درع المديونية
    const { error } = await supabase.rpc('hims_process_discharge', {
      p_visit_id: visitId,
      p_override_pwd: overridePwd || null
    });

    if (error) {
      if (error.message.includes('مديونية')) {
        setShowOverride(true);
      }
      message.error('عذراً، لا يمكن إتمام الخروج: ' + error.message);
    } else {
      message.success('تم إنهاء الزيارة بنجاح ✅ وجاري إرسال رابط البوابة للمريض عبر الواتساب.');
      setVisible(false);
      setShowOverride(false);
      onSuccess();
    }
    setLoading(false);
  };

  const printDischargeSummary = async (lang: 'ar' | 'en' = 'ar') => {
    setLoading(true);
    try {
      // 🚀 استدعاء دالة SQL التي تجمع البيانات
      const { data, error } = await supabase.rpc('get_patient_discharge_summary', { p_visit_id: visitId });
      if (error) throw error;
      const enrichedData = { ...data, visit_id: visitId };
      await LuxuryReportEngine.generatePDF(enrichedData, 'discharge', lang);
      message.success(lang === 'ar' ? 'تم توليد تقرير الخروج بنجاح ✅' : 'Discharge summary generated successfully ✅');
    } catch (e) {
      message.error(lang === 'ar' ? 'فشل جلب بيانات التقرير' : 'Failed to generate summary report');
    }
    setLoading(false);
  };

  return (
    <Space>
      <Button icon={<PrinterOutlined />} onClick={() => printDischargeSummary('ar')} loading={loading}>طباعة الملخص (عربي)</Button>
      <Button icon={<PrinterOutlined />} onClick={() => printDischargeSummary('en')} loading={loading}>Print Summary (EN)</Button>
      <Button danger icon={<LogoutOutlined />} onClick={() => setVisible(true)}>خروج نهائي</Button>
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
          subTitle={
            <div className="space-y-4">
              <p>سيتم إخلاء السرير، إصدار الفاتورة النهائية، وإرسال رابط بوابة المريض الرقمية آلياً.</p>
              {showOverride && (
                <div className="bg-red-50 p-4 rounded-xl border border-red-100 animate-pulse">
                  <label className="block text-red-600 font-bold mb-2 text-xs">يتطلب تجاوز المدير (المديونية غير مسددة):</label>
                  <Input.Password 
                    placeholder="أدخل كلمة سر التجاوز..." 
                    value={overridePwd} 
                    onChange={e => setOverridePwd(e.target.value)} 
                  />
                </div>
              )}
            </div>
          }
        />
      </Modal>
    </Space>
  );
};
import React, { useState } from 'react';
import { Button, Modal, Result, message, Space, Alert } from 'antd';
import { LogoutOutlined, PrinterOutlined, LockOutlined, CheckCircleOutlined } from '@ant-design/icons';
import { supabase } from '@/supabaseClient';
import { LuxuryReportEngine } from '../../../components/LuxuryReportEngine';
import { useAuth } from '@/context/AuthContext';

export const DischargeManager: React.FC<{ visitId: string, onSuccess: () => void }> = ({ visitId, onSuccess }) => {
  const { currentUser } = useAuth();
  const [visible, setVisible] = useState(false);
  const [loading, setLoading] = useState(false);
  const [debtBlocked, setDebtBlocked] = useState(false);

  // 🛡️ RBAC: التحقق من الصلاحية بناءً على الدور وليس كلمة مرور plain-text
  const canOverrideDebt =
    currentUser?.role === 'admin' ||
    currentUser?.role === 'super_admin' ||
    (currentUser as any)?.role === 'medical_director';

  const handleDischarge = async () => {
    setLoading(true);
    setDebtBlocked(false);
    try {
      const { error } = await supabase.rpc('hims_process_discharge', {
        p_visit_id: visitId,
        // 🛡️ نمرر رمز التجاوز الخاص بالدالة 'MANAGER_OVERRIDE' فقط إذا كان المستخدم يملك صلاحية المدير (RBAC)
        p_override_pwd: canOverrideDebt ? 'MANAGER_OVERRIDE' : null
      });

      if (error) {
        if (error.message.includes('مديونية') || error.message.includes('debt')) {
          setDebtBlocked(true);
          message.error('⚠️ لا يمكن إتمام الخروج: يوجد مديونية غير مسددة');
        } else {
          message.error('عذراً، لا يمكن إتمام الخروج: ' + error.message);
        }
      } else {
        message.success('تم إنهاء الزيارة بنجاح ✅ وجاري إرسال رابط البوابة للمريض عبر الواتساب.');
        setVisible(false);
        setDebtBlocked(false);
        onSuccess();
      }
    } catch (err: any) {
      message.error('حدث خطأ غير متوقع: ' + (err?.message || ''));
    } finally {
      setLoading(false);
    }
  };

  const printDischargeSummary = async (lang: 'ar' | 'en' = 'ar') => {
    setLoading(true);
    try {
      const { data, error } = await supabase.rpc('get_patient_discharge_summary', { p_visit_id: visitId });
      if (error) throw error;
      const enrichedData = { ...data, visit_id: visitId };
      await LuxuryReportEngine.generatePDF(enrichedData, 'discharge', lang);
      message.success(lang === 'ar' ? 'تم توليد تقرير الخروج بنجاح ✅' : 'Discharge summary generated successfully ✅');
    } catch (e: any) {
      message.error(lang === 'ar' ? 'فشل جلب بيانات التقرير: ' + e.message : 'Failed to generate summary report: ' + e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Space wrap>
      <Button icon={<PrinterOutlined />} onClick={() => printDischargeSummary('ar')} loading={loading}>طباعة الملخص (عربي)</Button>
      <Button icon={<PrinterOutlined />} onClick={() => printDischargeSummary('en')} loading={loading}>Print Summary (EN)</Button>
      <Button danger icon={<LogoutOutlined />} onClick={() => setVisible(true)}>خروج نهائي</Button>

      <Modal
        open={visible}
        onCancel={() => { setVisible(false); setDebtBlocked(false); }}
        onOk={handleDischarge}
        okButtonProps={{
          disabled: debtBlocked && !canOverrideDebt,
          danger: debtBlocked,
        }}
        okText={debtBlocked && canOverrideDebt ? '⚠️ تجاوز المديونية وتأكيد الخروج' : 'تأكيد الخروج'}
        confirmLoading={loading}
        title="تأكيد إجراءات الخروج"
      >
        <Result
          status="warning"
          title="هل أنت متأكد من اعتماد خروج المريض؟"
          subTitle={
            <div className="space-y-3 text-right">
              <p>سيتم إخلاء السرير، إصدار الفاتورة النهائية، وإرسال رابط بوابة المريض الرقمية آلياً.</p>

              {/* 🛡️ تحذير المديونية مع التحقق من الدور */}
              {debtBlocked && (
                <Alert
                  type="error"
                  showIcon
                  message="مديونية غير مسددة"
                  description={
                    canOverrideDebt
                      ? <span>أنت تملك صلاحية <strong>المدير</strong> لتجاوز هذا التحذير والإتمام. اضغط "تجاوز المديونية وتأكيد الخروج" للمتابعة.</span>
                      : <span>لا يمكن إتمام الخروج قبل سداد المبلغ المستحق. يرجى التواصل مع <strong>المدير</strong> أو إتمام السداد أولاً.</span>
                  }
                />
              )}

              {debtBlocked && canOverrideDebt && (
                <div className="bg-orange-50 p-3 rounded-xl border border-orange-200 flex items-center gap-2 text-orange-700 text-sm font-bold">
                  <CheckCircleOutlined />
                  <span>سيتم تسجيل التجاوز باسم: <strong>{(currentUser as any)?.name || currentUser?.username}</strong></span>
                </div>
              )}
            </div>
          }
        />
      </Modal>
    </Space>
  );
};

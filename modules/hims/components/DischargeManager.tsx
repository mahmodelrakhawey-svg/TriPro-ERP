import React, { useState, useEffect } from 'react';
import { Button, Modal, Result, message, Space, Alert, Spin } from 'antd';
import { LogoutOutlined, PrinterOutlined, LockOutlined, CheckCircleOutlined, WarningOutlined } from '@ant-design/icons';
import { supabase } from '@/supabaseClient';
import { LuxuryReportEngine } from '../../../components/LuxuryReportEngine';
import { useAuth } from '@/context/AuthContext';

export const DischargeManager: React.FC<{ visitId: string, onSuccess: () => void }> = ({ visitId, onSuccess }) => {
  const { currentUser } = useAuth();
  const [visible, setVisible] = useState(false);
  const [loading, setLoading] = useState(false);
  const [debtBlocked, setDebtBlocked] = useState(false);
  const [clinicalWarnings, setClinicalWarnings] = useState<string[]>([]);
  const [checkingWarnings, setCheckingWarnings] = useState(false);

  // 🛡️ RBAC: التحقق من الصلاحية بناءً على الدور وليس كلمة مرور plain-text
  const canOverrideDebt =
    currentUser?.role === 'admin' ||
    currentUser?.role === 'super_admin' ||
    (currentUser as any)?.role === 'medical_director';

  const checkClinicalWarnings = async () => {
    if (!visitId) return;
    setCheckingWarnings(true);
    setClinicalWarnings([]);
    try {
      const [surgeriesRes, labsRes, radsRes, prescRes] = await Promise.all([
        supabase.from('hims_surgeries').select('id, surgery_name').eq('visit_id', visitId).neq('status', 'completed').neq('status', 'cancelled'),
        supabase.from('hims_lab_orders').select('id, hims_lab_tests(test_name)').eq('visit_id', visitId).eq('status', 'pending'),
        supabase.from('hims_radiology_orders').select('id, scan_type').eq('visit_id', visitId).eq('status', 'pending'),
        supabase.from('hims_prescriptions').select('id').eq('visit_id', visitId).eq('status', 'pending')
      ]);

      const warningsList: string[] = [];
      if (surgeriesRes.data && surgeriesRes.data.length > 0) {
        warningsList.push(`⚠️ المريض مسجل له عمليات جراحية لم تكتمل بعد: ${surgeriesRes.data.map(s => s.surgery_name).join(', ')}`);
      }
      if (labsRes.data && labsRes.data.length > 0) {
        const names = labsRes.data.map((l: any) => l.hims_lab_tests?.test_name).filter(Boolean);
        warningsList.push(`⚠️ تحاليل مخبرية معلقة لم تسجل نتيجتها بعد: ${names.length > 0 ? names.join(', ') : 'تحاليل قيد الانتظار'}`);
      }
      if (radsRes.data && radsRes.data.length > 0) {
        warningsList.push(`⚠️ فحوصات أشعة مطلوبة لم يعتمد تقريرها بعد: ${radsRes.data.map(r => r.scan_type).join(', ')}`);
      }
      if (prescRes.data && prescRes.data.length > 0) {
        warningsList.push(`⚠️ روشتة أدوية نشطة معلقة لم تصرف بالكامل من الصيدلية.`);
      }
      setClinicalWarnings(warningsList);
    } catch (e) {
      console.error('[DischargeManager] Error checking clinical warnings:', e);
    } finally {
      setCheckingWarnings(false);
    }
  };

  useEffect(() => {
    if (visible) {
      checkClinicalWarnings();
    }
  }, [visible]);

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

              {/* 🚨 تحذيرات طبية سريرية نشطة */}
              {checkingWarnings ? (
                <div className="text-center p-3 bg-slate-50 rounded-xl"><Spin size="small" /> جاري التحقق من الفحوصات والعمليات النشطة للمريض...</div>
              ) : (
                clinicalWarnings.map((warn, index) => (
                  <Alert
                    key={index}
                    type="warning"
                    showIcon
                    message="إجراءات طبية معلقة"
                    description={warn}
                  />
                ))
              )}

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

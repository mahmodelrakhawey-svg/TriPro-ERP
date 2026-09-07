import React, { useState, useEffect } from 'react';
import { Card, Form, Input, Button, message, Spin } from 'antd';
import { SaveOutlined } from '@ant-design/icons';
import { supabase } from '@/supabaseClient';
import { offlineService } from '../../../services/offlineService';

const { TextArea } = Input;

export const ClinicalNotesForm: React.FC<{ visitId: string }> = ({ visitId }) => {
  const [loading, setLoading] = useState(false);
  const [noteId, setNoteId] = useState<string | null>(null);
  const [subjective, setSubjective] = useState('');
  const [objective, setObjective] = useState('');
  const [assessment, setAssessment] = useState('');
  const [plan, setPlan] = useState('');

  const fetchNote = async () => {
    if (!visitId) return;

    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(visitId);
    if (!isUuid) {
      setSubjective('');
      setObjective('');
      setAssessment('');
      setPlan('');
      setNoteId(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('hims_clinical_notes')
        .select('*')
        .eq('visit_id', visitId)
        .maybeSingle();

      if (error) throw error;

      if (data) {
        setSubjective(data.subjective || '');
        setObjective(data.objective || '');
        setAssessment(data.assessment || '');
        setPlan(data.plan || '');
        setNoteId(data.id);
      } else {
        setSubjective('');
        setObjective('');
        setAssessment('');
        setPlan('');
        setNoteId(null);
      }
    } catch (e: any) {
      console.error("Error fetching clinical note:", e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchNote();
  }, [visitId]);

  const handleSave = async () => {
    if (!visitId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(visitId)) {
      message.error('يرجى تحديد زيارة طبية صالحة أولاً');
      return;
    }
    setLoading(true);
    try {
      if (noteId) {
        // تحديث الملاحظة الحالية
        const { error } = await supabase
          .from('hims_clinical_notes')
          .update({
            subjective,
            objective,
            assessment,
            plan
          })
          .eq('id', noteId);

        if (error) throw error;
        message.success('تم تحديث الملاحظات الطبية (SOAP) بنجاح ✅');
      } else {
        if (!navigator.onLine) {
          let docId = null;
          let orgId = null;
          try {
            const { data: { session } } = await supabase.auth.getSession();
            docId = session?.user?.id;
            orgId = session?.user?.user_metadata?.org_id;
          } catch (e) {}

          const notePayload = {
            visit_id: visitId,
            doctor_id: docId,
            organization_id: orgId,
            subjective,
            objective,
            assessment,
            plan
          };

          await offlineService.queueClinicalNote(notePayload);
          message.warning('تم حفظ الملاحظات الطبية محلياً بنجاح (سيتم التزامن تلقائياً عند عودة الاتصال) 📶');
          return;
        }

        // جلب بيانات الزيارة لربط المنظمة والطبيب
        const { data: visitData, error: visitErr } = await supabase
          .from('hims_visits')
          .select('organization_id, doctor_id')
          .eq('id', visitId)
          .single();

        if (visitErr) throw visitErr;

        // إدراج ملاحظة جديدة
        const { data: inserted, error: insertErr } = await supabase
          .from('hims_clinical_notes')
          .insert([{
            visit_id: visitId,
            doctor_id: visitData?.doctor_id,
            organization_id: visitData?.organization_id,
            subjective,
            objective,
            assessment,
            plan
          }])
          .select()
          .single();

        if (insertErr) throw insertErr;
        if (inserted) {
          setNoteId(inserted.id);
        }
        message.success('تم حفظ الملاحظات الطبية (SOAP) لأول مرة بنجاح ✅');
      }
    } catch (e: any) {
      message.error('فشل في حفظ الملاحظات: ' + e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card 
      title={<b>🩺 كتابة الملاحظات السريرية الطبية (SOAP)</b>} 
      className="rounded-3xl shadow-sm border-slate-200"
    >
      <Spin spinning={loading}>
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-slate-500 mb-1">
              الشكوى والملاحظات الذاتية للمريض (Subjective - S):
            </label>
            <TextArea 
              rows={3} 
              placeholder="مثال: يشتكي المريض من ألم شديد في البطن مصحوب بغثيان منذ يومين..." 
              value={subjective}
              onChange={e => setSubjective(e.target.value)}
              className="rounded-xl"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-500 mb-1">
              المؤشرات الموضوعية ونتائج الفحص السريري (Objective - O):
            </label>
            <TextArea 
              rows={3} 
              placeholder="مثال: الضغط 120/80، النبض 75، وجود ألم بالضغط على الجانب الأيمن السفلي..." 
              value={objective}
              onChange={e => setObjective(e.target.value)}
              className="rounded-xl"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-500 mb-1">
              التشخيص المبدئي والتقييم الطبي (Assessment - A):
            </label>
            <TextArea 
              rows={2} 
              placeholder="مثال: اشتباه التهاب الزائدة الدودية الحاد..." 
              value={assessment}
              onChange={e => setAssessment(e.target.value)}
              className="rounded-xl font-bold"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-500 mb-1">
              الخطة العلاجية والتعليمات الطبية (Plan - P):
            </label>
            <TextArea 
              rows={3} 
              placeholder="مثال: طلب صورة دم كاملة وأشعة تلفزيونية، الحفاظ على الصيام، وتجهيز المريض..." 
              value={plan}
              onChange={e => setPlan(e.target.value)}
              className="rounded-xl"
            />
          </div>

          <Button 
            type="primary" 
            block 
            icon={<SaveOutlined />} 
            onClick={handleSave} 
            loading={loading}
            className="bg-indigo-600 border-none rounded-xl h-11 text-sm font-bold mt-2"
          >
            حفظ الملاحظة الطبية (SOAP)
          </Button>
        </div>
      </Spin>
    </Card>
  );
};

import React from 'react';
import { useForm, useFieldArray, SubmitHandler } from 'react-hook-form';
import { Button, Input, Table, Space, Card, Typography, message } from 'antd';
import { PlusOutlined, DeleteOutlined, SaveOutlined } from '@ant-design/icons';
import { supabase } from '@/supabaseClient';

export interface Medication {
  product_id?: string;
  drug_name: string;
  qty: number;
  dosage: string;
  frequency: string;
}

export interface Prescription {
  visit_id: string;
  diagnosis: string;
  medications: Medication[];
}

export const PrescriptionForm: React.FC<{ visitId: string }> = ({ visitId }) => {
  const { register, control, handleSubmit, setValue } = useForm<Prescription>({
    defaultValues: { visit_id: visitId, medications: [] }
  });

  const { fields, append, remove } = useFieldArray({ control, name: 'medications' as never });

  const onSave: SubmitHandler<Prescription> = async (data) => {
    const { error } = await supabase.from('hims_prescriptions').insert(data);
    if (error) {
      message.error("خطأ في حفظ الروشتة الطبية ❌");
    } else {
      message.success("تم اعتماد الروشتة وإرسالها للصيدلية بنجاح ✅");
    }
  };

  return (
    <Card title={<Typography.Title level={4}>تشخيص الحالة والروشتة الإلكترونية 🩺</Typography.Title>}>
      <form onSubmit={handleSubmit(onSave)}>
        <div className="mb-4">
          <label className="block font-bold mb-2">التشخيص النهائي</label>
          <Input.TextArea {...register('diagnosis')} rows={3} placeholder="اكتب التشخيص هنا..." />
        </div>

        <Typography.Text strong>الأدوية والعلاجات الموصوفة:</Typography.Text>
        <div className="mt-2 border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-right">
              <tr>
                <th className="p-2">الدواء</th>
                <th className="p-2">الكمية</th>
                <th className="p-2">الجرعة</th>
                <th className="p-2">التكرار</th>
                <th className="p-2"></th>
              </tr>
            </thead>
            <tbody>
              {fields.map((field, index) => (
                <tr key={field.id} className="border-t">
                  <td className="p-2"><Input {...register(`medications.${index}.drug_name`)} placeholder="اسم الدواء" /></td>
                  <td className="p-2"><Input type="number" {...register(`medications.${index}.qty`)} style={{ width: 80 }} /></td>
                  <td className="p-2"><Input {...register(`medications.${index}.dosage`)} placeholder="500mg" /></td>
                  <td className="p-2"><Input {...register(`medications.${index}.frequency`)} placeholder="1-0-1" /></td>
                  <td className="p-2">
                    <Button danger icon={<DeleteOutlined />} onClick={() => remove(index)} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <Button block type="dashed" icon={<PlusOutlined />} onClick={() => append({ product_id: '', drug_name: '', qty: 1, dosage: '', frequency: '' })}>
            إضافة دواء
          </Button>
        </div>

        <Button type="primary" size="large" icon={<SaveOutlined />} className="mt-6 w-full" htmlType="submit">
          اعتماد الروشتة وصرف العلاج
        </Button>
      </form>
    </Card>
  );
};
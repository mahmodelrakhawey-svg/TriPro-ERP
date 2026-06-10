import React, { useState, useEffect } from 'react';
import { useForm, useFieldArray, SubmitHandler, Controller } from 'react-hook-form';
import { Button, Input, Table, Space, Card, Typography, message, Select, Spin, InputNumber } from 'antd';
import { PlusOutlined, DeleteOutlined, SaveOutlined } from '@ant-design/icons';
import { supabase } from '@/supabaseClient';
import { useAuth } from '@/context/AuthContext';

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
  const { currentUser } = useAuth();
  const { register, control, handleSubmit, setValue, watch } = useForm<Prescription>({
    defaultValues: { visit_id: visitId, medications: [] }
  });

  const [icdOptions, setIcdOptions] = useState<{ label: string; value: string }[]>([]);
  const [loadingICD, setLoadingICD] = useState(false);

  const [productOptions, setProductOptions] = useState<{ label: string; value: string; price: number }[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(false);

  // محرك البحث في الأصناف المخزنية (الأدوية)
  const handleProductSearch = async (query: string = "") => {
    setLoadingProducts(true);

    // 🛡️ ذكاء برمجي: جلب كود المؤسسة من الزيارة إذا لم يتوفر في حساب الطبيب
    let orgId = currentUser?.organization_id;
    if (!orgId && visitId) {
      const { data: vData } = await supabase.from('hims_visits').select('organization_id').eq('id', visitId).single();
      orgId = vData?.organization_id;
    }

    console.log("PrescriptionForm: Final orgId used for product search:", orgId); // Added for debugging

    if (!orgId) {
      setLoadingProducts(false);
      console.warn("PrescriptionForm: Org ID is null or undefined, cannot fetch products."); // Added for debugging
      return;
    }
    
    let queryBuilder = supabase
      .from('products')
      .select('id, name, sales_price, stock')
      .eq('organization_id', orgId)
      // 🛡️ مرونة برمجية: التحقق من نوع الصنف في الحقلين (Product/Item) لضمان ظهور الأدوية في المستشفيات القديمة
      // كما تم إزالة فلتر الكمية (>0) ليتمكن الطبيب من رؤية الدواء المتاح في الدليل حتى لو نفذ رصيده
      .or('product_type.eq.STOCK,item_type.eq.STOCK')
      .is('deleted_at', null); 

    // لم نعد بحاجة لهذا الشرط لأننا نريد البحث حتى بحرف واحد أو بدون حروف للتحميل الأولي
    // if (!query || query.length < 2) return;
    if (query) {
      queryBuilder = queryBuilder.ilike('name', `%${query}%`);
    }

    const { data, error } = await queryBuilder.limit(20);

    if (error) {
      console.error("PrescriptionForm: Error fetching products:", error); // Keep this
      // لا تزعج الطبيب برسائل خطأ متكررة إذا كان يبحث
      setProductOptions([]); // التأكد من مسح الخيارات على الخطأ
    }

    setProductOptions(data?.map(p => ({
      label: `${p.name} (المتوفر: ${p.stock})`,
      value: p.id,
      name: p.name,
      price: p.sales_price || 0
    })) || []);
    console.log("PrescriptionForm: Products fetched:", data); // Added for debugging
    setLoadingProducts(false);
  };
  const handleICDSearch = async (query: string) => {
    if (!query || query.length < 2) return;
    setLoadingICD(true);
    const { data } = await supabase
      .from('v_hims_icd10_search') 
      .select('display_name')
      .or(`code.ilike.%${query}%,description_ar.ilike.%${query}%`)
      .limit(20);

    setIcdOptions(data?.map(i => ({
      label: i.display_name,
      value: i.display_name
    })) || []);
    setLoadingICD(false);
  };

  // جلب قائمة أولية للأدوية عند تحميل الشاشة
  useEffect(() => {
    handleProductSearch();
  }, [currentUser?.organization_id, visitId]);

  const { fields, append, remove } = useFieldArray({ control, name: 'medications' as never });

  const onSave: SubmitHandler<Prescription> = async (data) => {
    let orgId = currentUser?.organization_id;
    if (!orgId) {
      const { data: vData } = await supabase.from('hims_visits').select('organization_id').eq('id', visitId).single();
      orgId = vData?.organization_id;
    }

    const payload = {
        ...data,
        organization_id: orgId
    };

    const { error } = await supabase.from('hims_prescriptions').insert(payload);
    if (error) {
      message.error(error.message || "خطأ في حفظ الروشتة الطبية ❌");
    } else {
      message.success("تم اعتماد الروشتة وإرسالها للصيدلية بنجاح ✅");
    }
  };

  return (
    <Card title={<Typography.Title level={4}>تشخيص الحالة والروشتة الإلكترونية 🩺</Typography.Title>}>
      <form onSubmit={handleSubmit(onSave)}>
        <div className="mb-4">
          <label className="block font-bold mb-2 text-indigo-700">البحث في الأكواد العالمية (ICD-10)</label>
          <Select
            showSearch
            className="w-full mb-3"
            placeholder="ابحث بالكود أو اسم المرض (مثلاً: E11, Diabetes, Fever)..."
            filterOption={false}
            onSearch={handleICDSearch}
            loading={loadingICD}
            notFoundContent={loadingICD ? <Spin size="small" /> : 'لم يتم العثور على نتائج'}
            options={icdOptions}
            onChange={(val) => {
              const currentDiag = watch('diagnosis') || '';
              setValue('diagnosis', currentDiag ? `${currentDiag}\n${val}` : val);
            }}
          />
          <label className="block font-bold mb-2">وصف التشخيص / ملاحظات إضافية</label>
          <Input.TextArea {...register('diagnosis')} rows={3} placeholder="اكتب التفاصيل الطبية الإضافية هنا..." />
        </div>

        <Typography.Text strong>الأدوية والعلاجات الموصوفة:</Typography.Text>
        <div className="mt-2 border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-right">
              <tr className="border-b">
                <th className="p-2">الدواء</th>
                <th className="p-2 w-24">الكمية</th>
                <th className="p-2">الجرعة</th>
                <th className="p-2">التكرار</th>
                <th className="p-2 w-10"></th>
              </tr>
            </thead>
            <tbody>
              {fields.map((field, index) => (
                <tr key={field.id} className="border-t">
                  <td className="p-2">
                    <Controller
                      name={`medications.${index}.product_id` as any}
                      control={control}
                      render={({ field: selectField }) => (
                        <Select
                          {...selectField}
                          showSearch
                          className="w-full"
                          placeholder="ابحث عن الدواء..."
                          filterOption={false}
                          onSearch={handleProductSearch}
                          onFocus={() => { if (productOptions.length === 0) handleProductSearch(); }}
                          loading={loadingProducts}
                          options={productOptions}
                          onChange={(val, option: any) => {
                            selectField.onChange(val);
                            setValue(`medications.${index}.drug_name`, option.name);
                          }}
                        />
                      )}
                    />
                  </td>
                  <td className="p-2">
                    <Controller
                      name={`medications.${index}.qty` as any}
                      control={control}
                      render={({ field }) => (
                        <InputNumber {...field} min={1} className="w-full" />
                      )}
                    />
                  </td>
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
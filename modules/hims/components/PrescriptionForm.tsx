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

// قائمة أكواد ICD-10 الأكثر شيوعاً لتشخيص الأمراض والفوترة الطبية للتأمين
const COMMON_ICD10_CODES = [
  { code: 'I10', descAr: 'ارتفاع ضغط الدم الأساسي', descEn: 'Essential (primary) hypertension' },
  { code: 'E11.9', descAr: 'داء السكري من النوع الثاني بدون مضاعفات', descEn: 'Type 2 diabetes mellitus without complications' },
  { code: 'J06.9', descAr: 'التهاب حاد في الجهاز التنفسي العلوي غير محدد', descEn: 'Acute upper respiratory infection, unspecified' },
  { code: 'R50.9', descAr: 'حمى غير محددة', descEn: 'Fever, unspecified' },
  { code: 'R10.9', descAr: 'ألم في البطن غير محدد', descEn: 'Unspecified abdominal pain' },
  { code: 'K21.9', descAr: 'ارتجاع المريء بدون التهاب مريء', descEn: 'Gastro-esophageal reflux disease without esophagitis' },
  { code: 'M54.5', descAr: 'ألم أسفل الظهر', descEn: 'Low back pain' },
  { code: 'N39.0', descAr: 'التهاب المسالك البولية، موقع غير محدد', descEn: 'Urinary tract infection, site not specified' },
  { code: 'J45.909', descAr: 'الربو غير المحدد بدون مضاعفات', descEn: 'Unspecified asthma, uncomplicated' },
  { code: 'R05', descAr: 'سعال / كحة', descEn: 'Cough' },
  { code: 'H66.90', descAr: 'التهاب الأذن الوسطى غير محدد', descEn: 'Otitis media, unspecified' },
  { code: 'G43.909', descAr: 'الصداع النصفي غير محدد', descEn: 'Migraine, unspecified' },
  { code: 'R51', descAr: 'صداع', descEn: 'Headache' },
  { code: 'K29.70', descAr: 'التهاب المعدة غير محدد بدون نزيف', descEn: 'Gastritis, unspecified, without bleeding' },
  { code: 'B34.9', descAr: 'عدوى فيروسية غير محددة', descEn: 'Viral infection, unspecified' },
  { code: 'L20.9', descAr: 'التهاب الجلد التأتبي غير محدد (إكزيما)', descEn: 'Atopic dermatitis, unspecified' },
  { code: 'A09', descAr: 'التهاب المعدة والأمعاء المعدي (نزلات معوية حادة)', descEn: 'Infectious gastroenteritis and colitis, unspecified' },
  { code: 'R11.10', descAr: 'قيء غير محدد', descEn: 'Vomiting, unspecified' },
  { code: 'E03.9', descAr: 'قصور الغدة الدرقية غير محدد', descEn: 'Hypothyroidism, unspecified' },
  { code: 'F41.9', descAr: 'اضطراب القلق غير محدد', descEn: 'Anxiety disorder, unspecified' },
  { code: 'F32.9', descAr: 'اضطراب اكتئابي جسيم غير محدد', descEn: 'Major depressive disorder, unspecified' },
  { code: 'J02.9', descAr: 'التهاب البلعوم الحاد غير محدد (التهاب اللوزتين/الحلق)', descEn: 'Acute pharyngitis, unspecified' },
  { code: 'J01.90', descAr: 'التهاب الجيوب الأنفية الحاد غير محدد', descEn: 'Acute sinusitis, unspecified' },
  { code: 'K52.9', descAr: 'التهاب الأمعاء والمعدة غير المعدي غير محدد', descEn: 'Noninfective gastroenteritis and colitis, unspecified' },
  { code: 'M79.1', descAr: 'آلام العضلات (التهاب عضلي)', descEn: 'Myalgia' },
  { code: 'N18.9', descAr: 'مرض الكلى المزمن غير محدد', descEn: 'Chronic kidney disease, unspecified' },
  { code: 'E78.5', descAr: 'ارتفاع دهون الدم غير محدد', descEn: 'Hyperlipidemia, unspecified' },
  { code: 'D64.9', descAr: 'أنيميا / فقر الدم غير محدد', descEn: 'Anemia, unspecified' },
  { code: 'R07.9', descAr: 'ألم في الصدر غير محدد', descEn: 'Chest pain, unspecified' },
  { code: 'R42', descAr: 'دوار ودوخة', descEn: 'Dizziness and giddiness' }
];

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

  const handleICDSearch = async (query: string = "") => {
    setLoadingICD(true);
    
    // 1. فلترة القائمة المحلية كبداية وسرعة استجابة فورية
    const localFiltered = COMMON_ICD10_CODES.filter(i => 
      !query || 
      i.code.toLowerCase().includes(query.toLowerCase()) ||
      i.descAr.includes(query) ||
      i.descEn.toLowerCase().includes(query.toLowerCase())
    ).map(i => ({
      label: `${i.code} - ${i.descAr} (${i.descEn})`,
      value: `${i.code} - ${i.descAr}`
    }));

    // 2. البحث في قاعدة البيانات إذا كان هناك نص بحث يزيد عن أو يساوي حرفين
    let dbResults: { label: string; value: string }[] = [];
    if (query && query.length >= 2) {
      try {
        const { data, error } = await supabase
          .from('v_hims_icd10_search') 
          .select('display_name')
          .or(`code.ilike.%${query}%,description_ar.ilike.%${query}%`)
          .limit(20);

        if (!error && data) {
          dbResults = data.map(i => ({
            label: i.display_name,
            value: i.display_name
          }));
        }
      } catch (err) {
        console.error("Failed to query ICD10 from database:", err);
      }
    }

    // 3. دمج النتائج بدون تكرار
    const merged = [...localFiltered, ...dbResults];
    const uniqueMap = new Map();
    merged.forEach(item => {
      uniqueMap.set(item.value, item);
    });

    setIcdOptions(Array.from(uniqueMap.values()).slice(0, 30));
    setLoadingICD(false);
  };

  // جلب قائمة أولية للأدوية والأكواد عند تحميل الشاشة
  useEffect(() => {
    handleProductSearch();
    handleICDSearch("");
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
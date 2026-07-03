import React, { useState, useEffect } from 'react';
import { Table, Button, Modal, Form, Select, Input, Tag, Card, Typography, Popconfirm, InputNumber, Space } from 'antd';
import { UserOutlined, PlusOutlined, DeleteOutlined, MedicineBoxOutlined, EditOutlined } from '@ant-design/icons';
import { supabase } from '@/supabaseClient';
import { useAccounting } from '@/context/AccountingContext';
import { useToast } from '@/context/ToastContext';

const { Title, Text } = Typography;

const DoctorManager: React.FC = () => {
    const { organization, currentUser } = useAccounting();
    const { showToast } = useToast();
    const [loading, setLoading] = useState(false);
    const [doctors, setDoctors] = useState<any[]>([]);
    const [staffList, setStaffList] = useState<any[]>([]);
    const [isModalVisible, setIsModalVisible] = useState(false);
    const [editingDoctor, setEditingDoctor] = useState<any | null>(null);
    const [form] = Form.useForm();

    const orgId = organization?.id || currentUser?.organization_id;

    const fetchData = async () => {
        if (!orgId) return;

        setLoading(true);
        try {
            // 1. جلب قائمة الأطباء الحالية مع أسمائهم من البروفايل
            const { data: drData } = await supabase
                .from('hims_doctors')
                .select('*, employee:profile_id(full_name)')
                .eq('organization_id', orgId);
            setDoctors(drData || []);
            const existingDoctorIds = (drData || []).map(d => d.profile_id);

            // 2. جلب كافة الموظفين المتاحين في الشركة لتعيينهم كأطباء
            let query = supabase
                .from('profiles')
                .select('id, full_name')
                .eq('organization_id', orgId);

            if (existingDoctorIds.length > 0) {
                // 🛡️ تصحيح: التأكد من إحاطة قائمة المعرفات بأقواس دائرية صريحة لمتطلبات PostGREST
                query = query.filter('id', 'not.in', `(${existingDoctorIds.filter(Boolean).join(',')})`);
            }

            const { data: profilesData } = await query;
            setStaffList(profilesData || []);
        } catch (error: any) {
            showToast(error.message, 'error');
        } finally {
            showToast('تم تحديث الطاقم الطبي بنجاح', 'success');
            setLoading(false);
        }
    };

    useEffect(() => {
        if (orgId) {
            fetchData();
        }
    }, [orgId]);

    const handleSaveDoctor = async (values: any) => {
        setLoading(true);
        try {
            if (editingDoctor) {
                // تحديث طبيب موجود
                const { error } = await supabase
                    .from('hims_doctors')
                    .update({
                        specialization: values.specialization,
                        consultation_fee: values.consultation_fee || 0,
                        is_active: values.is_active
                    })
                    .eq('id', editingDoctor.id);

                if (error) throw error;
                showToast('تم تحديث بيانات الطبيب بنجاح ✅', 'success');
            } else {
                // إضافة طبيب جديد
                const { error } = await supabase.from('hims_doctors').insert([{
                    organization_id: orgId,
                    profile_id: values.employee_id,
                    specialization: values.specialization,
                    consultation_fee: values.consultation_fee || 0,
                    is_active: true
                }]);

                if (error) throw error;
                showToast('تم إضافة الطبيب للطاقم الطبي بنجاح ✅', 'success');
            }

            setIsModalVisible(false);
            setEditingDoctor(null);
            form.resetFields();
            fetchData();
        } catch (error: any) {
            showToast(error.message || 'حدث خطأ أثناء حفظ البيانات', 'error');
        } finally {
            setLoading(false);
        }
    };

    const handleOpenEdit = (record: any) => {
        setEditingDoctor(record);
        form.setFieldsValue({
            employee_id: record.profile_id,
            specialization: record.specialization,
            consultation_fee: record.consultation_fee || 0,
            is_active: record.is_active
        });
        setIsModalVisible(true);
    };

    const handleOpenCreate = () => {
        setEditingDoctor(null);
        form.resetFields();
        setIsModalVisible(true);
    };

    const columns = [
        { title: 'اسم الطبيب', dataIndex: ['employee', 'full_name'], key: 'name' },
        { title: 'التخصص', dataIndex: 'specialization', key: 'specialization', render: (s: string) => <Tag color="blue" className="font-bold">{s}</Tag> },
        { title: 'سعر الكشف', dataIndex: 'consultation_fee', key: 'consultation_fee', render: (fee: number) => <b>{fee?.toLocaleString() || 0} EGP</b> },
        { title: 'الحالة', dataIndex: 'is_active', render: (active: boolean) => <Tag color={active ? 'green' : 'red'}>{active ? 'نشط' : 'غير نشط'}</Tag> },
        { 
            title: 'إجراءات', 
            render: (_: any, record: any) => (
                <Space>
                    <Button 
                        type="text" 
                        icon={<EditOutlined className="text-blue-600" />} 
                        onClick={() => handleOpenEdit(record)} 
                    />
                    <Popconfirm title="هل تريد إلغاء تسجيل هذا الطبيب؟" onConfirm={async () => {
                        await supabase.from('hims_doctors').delete().eq('id', record.id);
                        fetchData();
                    }}>
                        <Button type="text" danger icon={<DeleteOutlined />} />
                    </Popconfirm>
                </Space>
            ) 
        }
    ];

    return (
        <div className="p-6 bg-slate-50 min-h-screen rtl text-right" dir="rtl">
            <div className="flex justify-between items-center mb-6 bg-white p-6 rounded-2xl shadow-sm">
                <div>
                    <Title level={3} className="m-0"><MedicineBoxOutlined className="text-blue-600" /> إعداد الطاقم الطبي</Title>
                    <p className="text-slate-400 text-xs font-bold mt-1">تحديد الموظفين الذين يمتلكون صلاحية الكشف الطبي والعمليات</p>
                </div>
                <Button type="primary" icon={<PlusOutlined />} onClick={handleOpenCreate} size="large" className="rounded-xl font-bold h-12 bg-blue-600 shadow-lg shadow-blue-100">
                    تسجيل طبيب جديد
                </Button>
            </div>

            <Card className="rounded-2xl shadow-sm border-none overflow-hidden">
                <Table dataSource={doctors} columns={columns} rowKey="id" loading={loading} />
            </Card>

            <Modal 
                title={<b>{editingDoctor ? 'تعديل بيانات الطبيب' : 'تسجيل طبيب جديد في المنظومة'}</b>} 
                open={isModalVisible} 
                onCancel={() => { setIsModalVisible(false); setEditingDoctor(null); }} 
                onOk={() => form.submit()} 
                confirmLoading={loading} 
                okText="حفظ واعتماد" 
                cancelText="إلغاء"
            >
                <Form form={form} layout="vertical" onFinish={handleSaveDoctor} className="pt-4">
                    {!editingDoctor ? (
                        <Form.Item name="employee_id" label="اختيار الموظف" rules={[{ required: true, message: 'يرجى اختيار موظف' }]}>
                            <Select placeholder="ابحث عن اسم الموظف..." showSearch optionFilterProp="children">
                                {staffList.map(s => <Select.Option key={s.id} value={s.id}>{s.full_name}</Select.Option>)}
                            </Select>
                        </Form.Item>
                    ) : (
                        <div className="mb-4 bg-slate-50 p-4 rounded-xl border">
                            <Text strong>الطبيب المعالج: </Text>
                            <Text className="text-indigo-600 font-bold">{editingDoctor.employee?.full_name}</Text>
                        </div>
                    )}
                    <Form.Item name="specialization" label="التخصص الطبي" rules={[{ required: true, message: 'يرجى كتابة التخصص' }]}>
                        <Input placeholder="مثال: جراحة قلب، عيون، باطنة..." />
                    </Form.Item>
                    <Form.Item name="consultation_fee" label="سعر الكشف الطبي (EGP)" rules={[{ required: true, message: 'يرجى تحديد سعر الكشف' }]} initialValue={0}>
                        <InputNumber min={0} className="w-full" />
                    </Form.Item>
                    {editingDoctor && (
                        <Form.Item name="is_active" label="حالة النشاط" rules={[{ required: true }]}>
                            <Select options={[{ label: 'نشط', value: true }, { label: 'غير نشط', value: false }]} />
                        </Form.Item>
                    )}
                </Form>
            </Modal>
        </div>
    );
};

export default DoctorManager;
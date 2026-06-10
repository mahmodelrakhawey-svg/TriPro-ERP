import React, { useState, useEffect } from 'react';
import { Table, Button, Modal, Form, Select, Input, Tag, Card, Typography, Popconfirm } from 'antd';
import { UserOutlined, PlusOutlined, DeleteOutlined, MedicineBoxOutlined } from '@ant-design/icons';
import { supabase } from '@/supabaseClient';
import { useAccounting } from '@/context/AccountingContext';
import { useToast } from '@/context/ToastContext';

const { Title } = Typography;

const DoctorManager: React.FC = () => {
    const { organization, currentUser } = useAccounting();
    const { showToast } = useToast();
    const [loading, setLoading] = useState(false);
    const [doctors, setDoctors] = useState<any[]>([]);
    const [staffList, setStaffList] = useState<any[]>([]);
    const [isModalVisible, setIsModalVisible] = useState(false);
    const [form] = Form.useForm();

    const fetchData = async () => {
        const orgId = organization?.id || currentUser?.organization_id;
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
            setLoading(false);
        }
    };

    useEffect(() => { fetchData(); }, [organization?.id, currentUser?.organization_id]);

    const handleAddDoctor = async (values: any) => {
        const orgId = organization?.id || currentUser?.organization_id;
        setLoading(true);
        try {
            const { error } = await supabase.from('hims_doctors').insert([{
                organization_id: orgId,
                profile_id: values.employee_id, // الربط الأساسي بحساب المستخدم (Profile)
                // employee_id: values.employee_id, // تم التعليق: يجب ربط هذا بجدول الموظفين (employees) بشكل صريح إذا كان مختلفاً عن profile_id
                specialization: values.specialization,
                is_active: true
            }]);

            if (error) throw error;
            showToast('تم إضافة الطبيب للطاقم الطبي بنجاح ✅', 'success');
            setIsModalVisible(false);
            form.resetFields();
            fetchData();
        } catch (error: any) {
            showToast('فشل الإضافة: تأكد أن الموظف غير مسجل كطبيب مسبقاً', 'error');
        } finally {
            setLoading(false);
        }
    };

    const columns = [
        { title: 'اسم الطبيب', dataIndex: ['employee', 'full_name'], key: 'name' },
        { title: 'التخصص', dataIndex: 'specialization', key: 'specialization', render: (s: string) => <Tag color="blue" className="font-bold">{s}</Tag> },
        { title: 'الحالة', dataIndex: 'is_active', render: (active: boolean) => <Tag color={active ? 'green' : 'red'}>{active ? 'نشط' : 'غير نشط'}</Tag> },
        { 
            title: 'إجراءات', 
            render: (_: any, record: any) => (
                <Popconfirm title="هل تريد إلغاء تسجيل هذا الطبيب؟" onConfirm={async () => {
                    await supabase.from('hims_doctors').delete().eq('id', record.id);
                    fetchData();
                }}>
                    <Button type="text" danger icon={<DeleteOutlined />} />
                </Popconfirm>
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
                <Button type="primary" icon={<PlusOutlined />} onClick={() => setIsModalVisible(true)} size="large" className="rounded-xl font-bold h-12 bg-blue-600 shadow-lg shadow-blue-100">
                    تسجيل طبيب جديد
                </Button>
            </div>

            <Card className="rounded-2xl shadow-sm border-none overflow-hidden">
                <Table dataSource={doctors} columns={columns} rowKey="id" loading={loading} />
            </Card>

            <Modal title={<b>تسجيل طبيب جديد في المنظومة</b>} open={isModalVisible} onCancel={() => setIsModalVisible(false)} onOk={() => form.submit()} confirmLoading={loading} okText="حفظ واعتماد" cancelText="إلغاء">
                <Form form={form} layout="vertical" onFinish={handleAddDoctor} className="pt-4">
                    <Form.Item name="employee_id" label="اختيار الموظف" rules={[{ required: true, message: 'يرجى اختيار موظف' }]}>
                        <Select placeholder="ابحث عن اسم الموظف..." showSearch optionFilterProp="children">
                            {staffList.map(s => <Select.Option key={s.id} value={s.id}>{s.full_name}</Select.Option>)}
                        </Select>
                    </Form.Item>
                    <Form.Item name="specialization" label="التخصص الطبي" rules={[{ required: true, message: 'يرجى كتابة التخصص' }]}>
                        <Input placeholder="مثال: جراحة قلب، عيون، باطنة..." />
                    </Form.Item>
                </Form>
            </Modal>
        </div>
    );
};

export default DoctorManager;
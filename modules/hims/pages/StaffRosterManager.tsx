import React, { useState, useEffect } from 'react';
import { Table, Button, Modal, Form, Select, DatePicker, Tag, Space, Card, Typography, Row, Col, Badge } from 'antd';
import { CalendarOutlined, PlusOutlined, UserOutlined, ClockCircleOutlined } from '@ant-design/icons';
import { supabase } from '../../../supabaseClient';
import { useAccounting } from '../../../context/AccountingContext';
import { useToast } from '../../../context/ToastContext';
import { useAuth } from '@/context/AuthContext';
import dayjs from 'dayjs';

const { Title, Text } = Typography;
const { RangePicker } = DatePicker;

const StaffRosterManager: React.FC = () => {
    const { organization } = useAccounting();
    const { showToast } = useToast();
    const { currentUser } = useAuth(); // إضافة currentUser من AuthContext
    const [loading, setLoading] = useState(false);
    const [rosterData, setRosterData] = useState([]);
    const [onDutyData, setOnDutyData] = useState([]);
    const [staffList, setStaffList] = useState([]);
    const [wards, setWards] = useState([]);
    const [isModalVisible, setIsModalVisible] = useState(false);
    const [form] = Form.useForm();

    const fetchData = async () => {
        const orgId = organization?.id || currentUser?.organization_id;
        if (!orgId) return;

        setLoading(true);
        try {
            // 1. جلب سجل المناوبات الكامل
            const { data: roster } = await supabase
                .from('hims_staff_roster')
                .select('*, staff:profiles(full_name), ward:hims_wards(name)')
                .eq('organization_id', orgId)
                .order('shift_start', { ascending: false });
            setRosterData(roster || []);

            // 2. استدعاء الدالة الذكية: من المناوب الآن؟
            const { data: onDuty } = await supabase.rpc('hims_get_current_on_duty', { p_dept_id: null });
            setOnDutyData(onDuty || []);

            // 3. جلب القوائم المساعدة (الموظفين والأجنحة)
            const { data: profiles } = await supabase.from('profiles').select('id, full_name').eq('organization_id', orgId);
            const { data: wardList } = await supabase.from('hims_wards').select('id, name').eq('organization_id', orgId);
            
            setStaffList(profiles || []);
            setWards(wardList || []);
        } catch (error) {
            showToast('خطأ في جلب البيانات', 'error');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, []);

    const handleAddShift = async (values: any) => {
        setLoading(true);
        try {
            const { error } = await supabase.from('hims_staff_roster').insert([{
                staff_id: values.staff_id,
                department_id: values.department_id,
                shift_start: values.shift_range[0].toISOString(),
                shift_end: values.shift_range[1].toISOString(),
                role_on_duty: values.role_on_duty,
                is_backup: values.is_backup || false
            }]);

            if (error) throw error;
            showToast('تم إضافة المناوبة بنجاح', 'success');
            setIsModalVisible(false);
            form.resetFields();
            fetchData();
        } catch (error: any) {
            showToast(error.message, 'error');
        } finally {
            setLoading(false);
        }
    };

    const columns = [
        { title: 'الموظف', dataIndex: ['staff', 'full_name'], key: 'staff' },
        { title: 'القسم', dataIndex: ['ward', 'name'], key: 'ward' },
        { title: 'الدور', dataIndex: 'role_on_duty', key: 'role', render: (role: string) => <Tag color="blue">{role}</Tag> },
        { title: 'البداية', dataIndex: 'shift_start', render: (d: string) => dayjs(d).format('YYYY-MM-DD HH:mm') },
        { title: 'النهاية', dataIndex: 'shift_end', render: (d: string) => dayjs(d).format('YYYY-MM-DD HH:mm') },
        { title: 'حالة الاحتياط', dataIndex: 'is_backup', render: (b: boolean) => b ? <Badge status="warning" text="احتياط" /> : <Badge status="success" text="أساسي" /> }
    ];

    return (
        <div className="p-6 bg-slate-50 min-h-screen" dir="rtl">
            <Row gutter={[16, 16]} className="mb-6">
                <Col span={24} className="flex justify-between items-center bg-white p-4 rounded-xl shadow-sm">
                    <Title level={3} className="m-0"><CalendarOutlined /> إدارة مناوبات الطاقم الطبي</Title>
                    <Button type="primary" icon={<PlusOutlined />} onClick={() => setIsModalVisible(true)} size="large" className="rounded-lg">
                        إضافة مناوبة جديدة
                    </Button>
                </Col>
            </Row>

            <Row gutter={[16, 16]}>
                <Col xs={24} lg={18}>
                    <Card title="سجل المناوبات المجدولة" className="rounded-xl shadow-sm">
                        <Table 
                            dataSource={rosterData} 
                            columns={columns} 
                            rowKey="id" 
                            loading={loading}
                            pagination={{ pageSize: 8 }}
                        />
                    </Card>
                </Col>
                <Col xs={24} lg={6}>
                    <Card title="المناوبون الآن 🚨" styles={{ header: { background: '#f5222d', color: '#fff', borderRadius: '12px 12px 0 0' } }} className="rounded-xl shadow-sm overflow-hidden">
                        {onDutyData.length === 0 ? <Text type="secondary">لا يوجد طاقم مناوب حالياً</Text> : (
                            <div className="space-y-4">
                                {onDutyData.map((staff: any, idx) => (
                                    <div key={idx} className="p-3 border rounded-lg bg-red-50 border-red-100">
                                        <div className="font-bold text-slate-800"><UserOutlined /> {staff.staff_name}</div>
                                        <div className="text-xs text-red-600 font-bold mt-1">{staff.role} - {staff.dept_name}</div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </Card>
                </Col>
            </Row>

            <Modal
                title="جدولة مناوبة جديدة"
                open={isModalVisible}
                onCancel={() => setIsModalVisible(false)}
                onOk={() => form.submit()}
                confirmLoading={loading}
                width={600}
                okText="حفظ المناوبة"
                cancelText="إلغاء"
            >
                <Form form={form} layout="vertical" onFinish={handleAddShift}>
                    <Row gutter={16}>
                        <Col span={12}>
                            <Form.Item name="staff_id" label="الموظف" rules={[{ required: true, message: 'يرجى اختيار الموظف' }]}>
                                <Select placeholder="اختر الموظف" showSearch optionFilterProp="children">
                                    {staffList.map(s => <Select.Option key={s.id} value={s.id}>{s.full_name}</Select.Option>)}
                                </Select>
                            </Form.Item>
                        </Col>
                        <Col span={12}>
                            <Form.Item name="department_id" label="القسم/الجناح" rules={[{ required: true }]}>
                                <Select placeholder="اختر القسم">
                                    {wards.map(w => <Select.Option key={w.id} value={w.id}>{w.name}</Select.Option>)}
                                </Select>
                            </Form.Item>
                        </Col>
                    </Row>
                    <Form.Item name="shift_range" label="وقت المناوبة (البداية والنهاية)" rules={[{ required: true }]}>
                        <RangePicker showTime format="YYYY-MM-DD HH:mm" className="w-full" placeholder={['وقت البدء', 'وقت الانتهاء']} />
                    </Form.Item>
                    <Row gutter={16}>
                        <Col span={12}>
                            <Form.Item name="role_on_duty" label="الدور الوظيفي" rules={[{ required: true }]}>
                                <Select>
                                    <Select.Option value="on_call">On Call (تحت الطلب)</Select.Option>
                                    <Select.Option value="in_house">In-House (مقيم)</Select.Option>
                                    <Select.Option value="emergency_lead">Emergency Lead (قائد طوارئ)</Select.Option>
                                </Select>
                            </Form.Item>
                        </Col>
                        <Col span={12}>
                            <Form.Item name="is_backup" label="نوع المناوبة" initialValue={false}>
                                <Select><Select.Option value={false}>أساسي</Select.Option><Select.Option value={true}>احتياط</Select.Option></Select>
                            </Form.Item>
                        </Col>
                    </Row>
                </Form>
            </Modal>
        </div>
    );
};

export default StaffRosterManager;
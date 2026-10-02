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
    const { currentUser } = useAuth(); // Ø¥Ø¶Ø§ÙØ© currentUser Ù…Ù† AuthContext
    const [loading, setLoading] = useState(false);
    const [rosterData, setRosterData] = useState<any[]>([]);
    const [onDutyData, setOnDutyData] = useState<any[]>([]);
    const [staffList, setStaffList] = useState<any[]>([]);
    const [wards, setWards] = useState<any[]>([]);
    const [isModalVisible, setIsModalVisible] = useState(false);
    const [form] = Form.useForm();

    const fetchData = async () => {
        const orgId = organization?.id || currentUser?.organization_id;
        if (!orgId) return;

        setLoading(true);
        try {
            // 1. Ø¬Ù„Ø¨ Ø³Ø¬Ù„ Ø§Ù„Ù…Ù†Ø§ÙˆØ¨Ø§Øª Ø§Ù„ÙƒØ§Ù…Ù„
            const { data: roster } = await supabase
                .from('hims_staff_roster')
                .select('*, staff:profiles(full_name), ward:hims_wards(name)')
                .eq('organization_id', orgId)
                .order('shift_start', { ascending: false });
            setRosterData(roster || []);

            // 2. Ø§Ø³ØªØ¯Ø¹Ø§Ø¡ Ø§Ù„Ø¯Ø§Ù„Ø© Ø§Ù„Ø°ÙƒÙŠØ©: Ù…Ù† Ø§Ù„Ù…Ù†Ø§ÙˆØ¨ Ø§Ù„Ø¢Ù†ØŸ
            const { data: onDuty } = await supabase.rpc('hims_get_current_on_duty', { p_dept_id: null });
            setOnDutyData(onDuty || []);

            // 3. Ø¬Ù„Ø¨ Ø§Ù„Ù‚ÙˆØ§Ø¦Ù… Ø§Ù„Ù…Ø³Ø§Ø¹Ø¯Ø© (Ø§Ù„Ù…ÙˆØ¸ÙÙŠÙ† ÙˆØ§Ù„Ø£Ø¬Ù†Ø­Ø©)
            const { data: profiles } = await supabase.from('profiles').select('id, full_name').eq('organization_id', orgId);
            const { data: wardList } = await supabase.from('hims_wards').select('id, name').eq('organization_id', orgId);
            
            setStaffList(profiles || []);
            setWards(wardList || []);
        } catch (error) {
            showToast('Ø®Ø·Ø£ ÙÙŠ Ø¬Ù„Ø¨ Ø§Ù„Ø¨ÙŠØ§Ù†Ø§Øª', 'error');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, []);

    const handleAddShift = async (values: Record<string, any>) => {
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
            showToast('ØªÙ… Ø¥Ø¶Ø§ÙØ© Ø§Ù„Ù…Ù†Ø§ÙˆØ¨Ø© Ø¨Ù†Ø¬Ø§Ø­', 'success');
            setIsModalVisible(false);
            form.resetFields();
            fetchData();
        } catch (error) {
            showToast(error.message, 'error');
        } finally {
            setLoading(false);
        }
    };

    const columns = [
        { title: 'Ø§Ù„Ù…ÙˆØ¸Ù', dataIndex: ['staff', 'full_name'], key: 'staff' },
        { title: 'Ø§Ù„Ù‚Ø³Ù…', dataIndex: ['ward', 'name'], key: 'ward' },
        { title: 'Ø§Ù„Ø¯ÙˆØ±', dataIndex: 'role_on_duty', key: 'role', render: (role: string) => <Tag color="blue">{role}</Tag> },
        { title: 'Ø§Ù„Ø¨Ø¯Ø§ÙŠØ©', dataIndex: 'shift_start', render: (d: string) => dayjs(d).format('YYYY-MM-DD HH:mm') },
        { title: 'Ø§Ù„Ù†Ù‡Ø§ÙŠØ©', dataIndex: 'shift_end', render: (d: string) => dayjs(d).format('YYYY-MM-DD HH:mm') },
        { title: 'Ø­Ø§Ù„Ø© Ø§Ù„Ø§Ø­ØªÙŠØ§Ø·', dataIndex: 'is_backup', render: (b: boolean) => b ? <Badge status="warning" text="Ø§Ø­ØªÙŠØ§Ø·" /> : <Badge status="success" text="Ø£Ø³Ø§Ø³ÙŠ" /> }
    ];

    return (
        <div className="p-6 bg-slate-50 min-h-screen" dir="rtl">
            <Row gutter={[16, 16]} className="mb-6">
                <Col span={24} className="flex justify-between items-center bg-white p-4 rounded-xl shadow-sm">
                    <Title level={3} className="m-0"><CalendarOutlined /> Ø¥Ø¯Ø§Ø±Ø© Ù…Ù†Ø§ÙˆØ¨Ø§Øª Ø§Ù„Ø·Ø§Ù‚Ù… Ø§Ù„Ø·Ø¨ÙŠ</Title>
                    <Button type="primary" icon={<PlusOutlined />} onClick={() => setIsModalVisible(true)} size="large" className="rounded-lg">
                        Ø¥Ø¶Ø§ÙØ© Ù…Ù†Ø§ÙˆØ¨Ø© Ø¬Ø¯ÙŠØ¯Ø©
                    </Button>
                </Col>
            </Row>

            <Row gutter={[16, 16]}>
                <Col xs={24} lg={18}>
                    <Card title="Ø³Ø¬Ù„ Ø§Ù„Ù…Ù†Ø§ÙˆØ¨Ø§Øª Ø§Ù„Ù…Ø¬Ø¯ÙˆÙ„Ø©" className="rounded-xl shadow-sm">
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
                    <Card title="Ø§Ù„Ù…Ù†Ø§ÙˆØ¨ÙˆÙ† Ø§Ù„Ø¢Ù† ðŸš¨" styles={{ header: { background: '#f5222d', color: '#fff', borderRadius: '12px 12px 0 0' } }} className="rounded-xl shadow-sm overflow-hidden">
                        {onDutyData.length === 0 ? <Text type="secondary">Ù„Ø§ ÙŠÙˆØ¬Ø¯ Ø·Ø§Ù‚Ù… Ù…Ù†Ø§ÙˆØ¨ Ø­Ø§Ù„ÙŠØ§Ù‹</Text> : (
                            <div className="space-y-4">
                                {onDutyData.map((staff: Record<string, any>, idx) => (
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
                title="Ø¬Ø¯ÙˆÙ„Ø© Ù…Ù†Ø§ÙˆØ¨Ø© Ø¬Ø¯ÙŠØ¯Ø©"
                open={isModalVisible}
                onCancel={() => setIsModalVisible(false)}
                onOk={() => form.submit()}
                confirmLoading={loading}
                width={600}
                okText="Ø­ÙØ¸ Ø§Ù„Ù…Ù†Ø§ÙˆØ¨Ø©"
                cancelText="Ø¥Ù„ØºØ§Ø¡"
            >
                <Form form={form} layout="vertical" onFinish={handleAddShift}>
                    <Row gutter={16}>
                        <Col span={12}>
                            <Form.Item name="staff_id" label="Ø§Ù„Ù…ÙˆØ¸Ù" rules={[{ required: true, message: 'ÙŠØ±Ø¬Ù‰ Ø§Ø®ØªÙŠØ§Ø± Ø§Ù„Ù…ÙˆØ¸Ù' }]}>
                                <Select placeholder="Ø§Ø®ØªØ± Ø§Ù„Ù…ÙˆØ¸Ù" showSearch optionFilterProp="children">
                                    {staffList.map(s => <Select.Option key={s.id} value={s.id}>{s.full_name}</Select.Option>)}
                                </Select>
                            </Form.Item>
                        </Col>
                        <Col span={12}>
                            <Form.Item name="department_id" label="Ø§Ù„Ù‚Ø³Ù…/Ø§Ù„Ø¬Ù†Ø§Ø­" rules={[{ required: true }]}>
                                <Select placeholder="Ø§Ø®ØªØ± Ø§Ù„Ù‚Ø³Ù…">
                                    {wards.map(w => <Select.Option key={w.id} value={w.id}>{w.name}</Select.Option>)}
                                </Select>
                            </Form.Item>
                        </Col>
                    </Row>
                    <Form.Item name="shift_range" label="ÙˆÙ‚Øª Ø§Ù„Ù…Ù†Ø§ÙˆØ¨Ø© (Ø§Ù„Ø¨Ø¯Ø§ÙŠØ© ÙˆØ§Ù„Ù†Ù‡Ø§ÙŠØ©)" rules={[{ required: true }]}>
                        <RangePicker showTime format="YYYY-MM-DD HH:mm" className="w-full" placeholder={['ÙˆÙ‚Øª Ø§Ù„Ø¨Ø¯Ø¡', 'ÙˆÙ‚Øª Ø§Ù„Ø§Ù†ØªÙ‡Ø§Ø¡']} />
                    </Form.Item>
                    <Row gutter={16}>
                        <Col span={12}>
                            <Form.Item name="role_on_duty" label="Ø§Ù„Ø¯ÙˆØ± Ø§Ù„ÙˆØ¸ÙŠÙÙŠ" rules={[{ required: true }]}>
                                <Select>
                                    <Select.Option value="on_call">On Call (ØªØ­Øª Ø§Ù„Ø·Ù„Ø¨)</Select.Option>
                                    <Select.Option value="in_house">In-House (Ù…Ù‚ÙŠÙ…)</Select.Option>
                                    <Select.Option value="emergency_lead">Emergency Lead (Ù‚Ø§Ø¦Ø¯ Ø·ÙˆØ§Ø±Ø¦)</Select.Option>
                                </Select>
                            </Form.Item>
                        </Col>
                        <Col span={12}>
                            <Form.Item name="is_backup" label="Ù†ÙˆØ¹ Ø§Ù„Ù…Ù†Ø§ÙˆØ¨Ø©" initialValue={false}>
                                <Select><Select.Option value={false}>Ø£Ø³Ø§Ø³ÙŠ</Select.Option><Select.Option value={true}>Ø§Ø­ØªÙŠØ§Ø·</Select.Option></Select>
                            </Form.Item>
                        </Col>
                    </Row>
                </Form>
            </Modal>
        </div>
    );
};

export default StaffRosterManager;

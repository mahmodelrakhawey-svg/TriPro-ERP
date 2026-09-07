import React, { useEffect, useState } from 'react';
import { Card, Row, Col, Table, Tag, Button, message, Typography, Badge, Space, Modal, Form, Input, InputNumber, Select } from 'antd';
import { CheckCircleOutlined, ToolOutlined, ClearOutlined, HomeOutlined, PlusOutlined } from '@ant-design/icons';
import { supabase } from '@/supabaseClient';
import { useAuth } from '@/context/AuthContext';

export const WardBedManager: React.FC = () => {
  const { currentUser } = useAuth();
  const [beds, setBeds] = useState<any[]>([]);
  const [wards, setWards] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [viewMode, setViewMode] = useState<'grid' | 'table'>('grid');

  const [isWardModalVisible, setIsWardModalVisible] = useState(false);
  const [isBedModalVisible, setIsBedModalVisible] = useState(false);

  const [isWardEditModalVisible, setIsWardEditModalVisible] = useState(false);
  const [isBedEditModalVisible, setIsBedEditModalVisible] = useState(false);

  const [editingWard, setEditingWard] = useState<any | null>(null);
  const [editingBed, setEditingBed] = useState<any | null>(null);

  const [wardForm] = Form.useForm();
  const [bedForm] = Form.useForm();

  const [wardEditForm] = Form.useForm();
  const [bedEditForm] = Form.useForm();

  const fetchBedsStatus = async () => {
    if (!currentUser?.organization_id) return;
    setLoading(true);
    const { data, error } = await supabase
      .from('hims_beds')
      .select('*, ward:ward_id(name, floor)')
      .eq('organization_id', currentUser.organization_id)
      .order('bed_number', { ascending: true });

    if (error) message.error('فشل جلب حالة الأسرة');
    else {
      let bedList = data || [];
      if (bedList.length === 0) {
        bedList = [
          { id: 'b-101', bed_number: 'A-101', status: 'available', daily_rate: 350, ward: { name: 'جناح الباطنة (العام)', floor: 'الطابق الأول' } },
          { id: 'b-102', bed_number: 'A-102', status: 'occupied', daily_rate: 350, ward: { name: 'جناح الباطنة (العام)', floor: 'الطابق الأول' } },
          { id: 'b-103', bed_number: 'A-103', status: 'cleaning', daily_rate: 350, ward: { name: 'جناح الباطنة (العام)', floor: 'الطابق الأول' } },
          { id: 'b-201', bed_number: 'ICU-01', status: 'occupied', daily_rate: 1500, ward: { name: 'العناية المركزة (ICU)', floor: 'الطابق الثاني' } },
          { id: 'b-202', bed_number: 'ICU-02', status: 'available', daily_rate: 1500, ward: { name: 'العناية المركزة (ICU)', floor: 'الطابق الثاني' } },
          { id: 'b-301', bed_number: 'P-301', status: 'available', daily_rate: 800, ward: { name: 'الجناح الملكي الخاص', floor: 'الطابق الثالث' } },
          { id: 'b-302', bed_number: 'P-302', status: 'maintenance', daily_rate: 800, ward: { name: 'الجناح الملكي الخاص', floor: 'الطابق الثالث' } },
          { id: 'b-401', bed_number: 'SURG-01', status: 'occupied', daily_rate: 600, ward: { name: 'جناح جراحة العظام', floor: 'الطابق الرابع' } }
        ];
      }
      setBeds(bedList);
    }
    setLoading(false);
  };

  const fetchWards = async () => {
    if (!currentUser?.organization_id) return;
    const { data } = await supabase
      .from('hims_wards')
      .select('*')
      .eq('organization_id', currentUser.organization_id)
      .order('name', { ascending: true });
    setWards(data || []);
  };

  useEffect(() => { 
    fetchBedsStatus(); 
    fetchWards();
  }, [currentUser]);

  const handleMarkReady = async (bedId: string) => {
    setLoading(true);
    // 🧼 استدعاء محرك كفاءة تشغيل الأسرة في SQL
    const { error } = await supabase.rpc('hims_mark_bed_ready', {
      p_bed_id: bedId
    });

    if (error) {
      message.error('فشل تحديث حالة السرير: ' + error.message);
    } else {
      message.success('تم تأكيد جاهزية السرير ✅ هو الآن متاح للاستقبال.');
      fetchBedsStatus();
    }
    setLoading(false);
  };

  const handleCreateWard = async (values: any) => {
    setLoading(true);
    const { error } = await supabase.from('hims_wards').insert([{
      ...values,
      organization_id: currentUser?.organization_id
    }]);

    if (error) {
      message.error('فشل إضافة الجناح: ' + error.message);
    } else {
      message.success('تم إضافة الجناح بنجاح ✅');
      setIsWardModalVisible(false);
      wardForm.resetFields();
      fetchWards();
    }
    setLoading(false);
  };

  const handleCreateBed = async (values: any) => {
    setLoading(true);
    const { error } = await supabase.from('hims_beds').insert([{
      ...values,
      organization_id: currentUser?.organization_id,
      status: 'available'
    }]);

    if (error) {
      message.error('فشل إضافة السرير: ' + error.message);
    } else {
      message.success('تم إضافة السرير بنجاح ✅');
      setIsBedModalVisible(false);
      bedForm.resetFields();
      fetchBedsStatus();
    }
    setLoading(false);
  };

  const handleDeleteWard = async (wardId: string) => {
    setLoading(true);
    const { error } = await supabase.from('hims_wards').delete().eq('id', wardId);
    if (error) message.error('فشل حذف الجناح: ' + error.message);
    else {
      message.success('تم حذف الجناح بنجاح ✅');
      fetchWards();
      fetchBedsStatus();
    }
    setLoading(false);
  };

  const handleDeleteBed = async (bedId: string) => {
    setLoading(true);
    const { error } = await supabase.from('hims_beds').delete().eq('id', bedId);
    if (error) message.error('فشل حذف السرير: ' + error.message);
    else {
      message.success('تم حذف السرير بنجاح ✅');
      fetchBedsStatus();
    }
    setLoading(false);
  };

  const handleUpdateWard = async (values: any) => {
    if (!editingWard?.id) return;
    setLoading(true);
    const { error } = await supabase.from('hims_wards').update({
      name: values.name,
      floor: values.floor,
      ward_type: values.ward_type
    }).eq('id', editingWard.id);

    if (error) message.error('فشل تعديل الجناح: ' + error.message);
    else {
      message.success('تم تعديل الجناح بنجاح ✅');
      setIsWardEditModalVisible(false);
      setEditingWard(null);
      fetchWards();
      fetchBedsStatus();
    }
    setLoading(false);
  };

  const handleUpdateBed = async (values: any) => {
    if (!editingBed?.id) return;
    setLoading(true);
    const { error } = await supabase.from('hims_beds').update({
      ward_id: values.ward_id,
      bed_number: values.bed_number,
      daily_rate: values.daily_rate
    }).eq('id', editingBed.id);

    if (error) message.error('فشل تعديل السرير: ' + error.message);
    else {
      message.success('تم تعديل السرير بنجاح ✅');
      setIsBedEditModalVisible(false);
      setEditingBed(null);
      fetchBedsStatus();
      fetchWards();
    }
    setLoading(false);
  };

  const columns = [
    {
      title: 'رقم السرير',
      dataIndex: 'bed_number',
      key: 'bed_number',
      render: (text: string) => <b className="text-blue-700">{text}</b>
    },
    {
      title: 'الجناح / القسم',
      render: (r: any) => (
        <div className="flex items-center gap-2">
          <span>{r.ward?.name} (الطابق: {r.ward?.floor})</span>
        </div>
      )
    },
    {
      title: 'الحالة الحالية',
      dataIndex: 'status',
      render: (status: string) => {
        const colors: any = {
          available: 'success',
          occupied: 'error',
          cleaning: 'warning',
          maintenance: 'default'
        };
        const labels: any = {
          available: 'متاح',
          occupied: 'مشغول',
          cleaning: 'جاري التنظيف',
          maintenance: 'صيانة'
        };
        return <Tag color={colors[status]}>{labels[status]}</Tag>;
      }
    },
    {
      title: 'إجراءات التجهيز',
      key: 'action',
      render: (record: any) => (
        <Space>
          {record.status === 'cleaning' && (
            <Button
              type="primary"
              icon={<CheckCircleOutlined />}
              className="bg-emerald-600 border-none"
              onClick={() => handleMarkReady(record.id)}
              loading={loading}
            >
              تأكيد جاهزية السرير
            </Button>
          )}
          {record.status === 'available' && (
            <Button icon={<ToolOutlined />} size="small">طلب صيانة</Button>
          )}
        </Space>
      ),
    },
    {
      title: 'تعديل / حذف',
      key: 'edit_delete',
      render: (record: any) => (
        <Space>
          <Button
            size="small"
            onClick={() => {
              setEditingBed(record);
              bedEditForm.setFieldsValue({
                ward_id: record.ward_id,
                bed_number: record.bed_number,
                daily_rate: record.daily_rate ?? 0,
              });
              setIsBedEditModalVisible(true);
            }}
          >
            تعديل السرير
          </Button>
          <Button
            size="small"
            danger
            onClick={() => {
              Modal.confirm({
                title: 'حذف السرير؟',
                content: `سيتم حذف السرير رقم ${record.bed_number}`,
                okText: 'حذف',
                cancelText: 'إلغاء',
                okButtonProps: { danger: true, loading },
                onOk: () => handleDeleteBed(record.id)
              });
            }}
          >
            حذف
          </Button>

          <Button
            size="small"
            onClick={() => {
              const ward = wards.find(w => w.id === record.ward_id);
              if (!ward) {
                message.error('تعذر العثور على بيانات الجناح');
                return;
              }
              setEditingWard(ward);
              wardEditForm.setFieldsValue({
                name: ward.name,
                floor: ward.floor,
                ward_type: ward.ward_type,
              });
              setIsWardEditModalVisible(true);
            }}
          >
            تعديل الجناح
          </Button>
          <Button
            size="small"
            danger
            onClick={() => {
              const wardId = record.ward_id;
              if (!wardId) return;
              Modal.confirm({
                title: 'حذف الجناح؟',
                content: 'سيتم حذف الجناح مع جميع أسرّته المرتبطة (Cascade).',
                okText: 'حذف',
                cancelText: 'إلغاء',
                okButtonProps: { danger: true, loading },
                onOk: () => handleDeleteWard(wardId)
              });
            }}
          >
            حذف الجناح
          </Button>
        </Space>
      ),
    },
  ];

  return (
    <div className="p-6 rtl text-right">
      <div className="mb-6 flex justify-between items-center">
        <Typography.Title level={2}>
          <HomeOutlined className="text-indigo-600" /> إدارة حالات الأسرة والأجنحة
        </Typography.Title>
        <Space>
          <Button onClick={() => setIsWardModalVisible(true)} icon={<PlusOutlined />} className="bg-indigo-50 text-indigo-700 border-indigo-200">إضافة جناح</Button>
          <Button onClick={() => setIsBedModalVisible(true)} type="primary" icon={<PlusOutlined />} className="bg-indigo-600">إضافة سرير</Button>
          <Button onClick={fetchBedsStatus} icon={<ClearOutlined />}>تحديث الحالة</Button>
        </Space>
      </div>

      <div className="mb-4 flex justify-between items-center bg-white p-4 rounded-2xl shadow-sm">
        <div className="flex items-center gap-3">
          <span className="font-bold text-slate-700">طريقة العرض:</span>
          <Space>
            <Button 
              type={viewMode === 'grid' ? 'primary' : 'default'}
              className={viewMode === 'grid' ? 'bg-indigo-600 border-none' : ''}
              onClick={() => setViewMode('grid')}
            >
              🗺️ خريطة الأسرة البصرية
            </Button>
            <Button 
              type={viewMode === 'table' ? 'primary' : 'default'}
              className={viewMode === 'table' ? 'bg-indigo-600 border-none' : ''}
              onClick={() => setViewMode('table')}
            >
              📊 جدول البيانات
            </Button>
          </Space>
        </div>
        <div className="flex items-center gap-4 text-xs font-bold">
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-emerald-500 inline-block"></span> متاح ({beds.filter(b => b.status === 'available').length})</span>
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-rose-500 inline-block"></span> مشغول ({beds.filter(b => b.status === 'occupied').length})</span>
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-amber-500 inline-block"></span> تنظيف ({beds.filter(b => b.status === 'cleaning').length})</span>
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-slate-400 inline-block"></span> صيانة ({beds.filter(b => b.status === 'maintenance').length})</span>
        </div>
      </div>

      {viewMode === 'grid' ? (
        <Row gutter={[16, 16]}>
          {beds.map((bed) => {
            const statusConfig: any = {
              available: { bg: 'bg-emerald-50 border-emerald-200 text-emerald-800', badge: 'bg-emerald-500', text: 'متاح للاستقبال 🟢' },
              occupied: { bg: 'bg-rose-50 border-rose-200 text-rose-800', badge: 'bg-rose-500', text: 'مشغول بمرض 🔴' },
              cleaning: { bg: 'bg-amber-50 border-amber-200 text-amber-800', badge: 'bg-amber-500', text: 'جاري التطهير 🟡' },
              maintenance: { bg: 'bg-slate-100 border-slate-300 text-slate-700', badge: 'bg-slate-500', text: 'صيانة وتجهيز ⚫' }
            };
            const cfg = statusConfig[bed.status] || statusConfig.available;
            return (
              <Col xs={24} sm={12} md={8} lg={6} key={bed.id}>
                <Card className={`rounded-3xl border-2 shadow-sm transition-all hover:shadow-md ${cfg.bg}`}>
                  <div className="flex justify-between items-start mb-3">
                    <span className="font-black text-xl tracking-wider">{bed.bed_number}</span>
                    <span className={`text-[11px] px-2.5 py-1 rounded-full text-white font-bold ${cfg.badge}`}>
                      {cfg.text}
                    </span>
                  </div>
                  <div className="text-xs space-y-1 mb-4 opacity-90">
                    <div><b>الجناح:</b> {bed.ward?.name || 'عام'}</div>
                    <div><b>الطابق:</b> {bed.ward?.floor || '-'}</div>
                    <div><b>أجر اليوم:</b> {bed.daily_rate || 0} EGP</div>
                  </div>
                  {bed.status === 'cleaning' && (
                    <Button 
                      block
                      type="primary"
                      icon={<CheckCircleOutlined />}
                      className="bg-emerald-600 border-none rounded-xl font-bold"
                      onClick={() => handleMarkReady(bed.id)}
                    >
                      تأكيد جاهزية السرير
                    </Button>
                  )}
                </Card>
              </Col>
            );
          })}
        </Row>
      ) : (
        <Card className="rounded-3xl shadow-lg border-none overflow-hidden">
          <Table 
            dataSource={beds} 
            columns={columns} 
            rowKey="id" 
            loading={loading}
            pagination={false}
          />
        </Card>
      )}

      {/* مودال إضافة جناح */}
      <Modal title="إضافة جناح / قسم جديد" open={isWardModalVisible} onCancel={() => setIsWardModalVisible(false)} onOk={() => wardForm.submit()} confirmLoading={loading}>
        <Form form={wardForm} layout="vertical" onFinish={handleCreateWard}>
          <Form.Item name="name" label="اسم الجناح" rules={[{ required: true, message: 'يرجى إدخال اسم الجناح' }]}>
            <Input placeholder="مثال: جناح العمليات، قسم الباطنة" />
          </Form.Item>
          <Form.Item name="floor" label="الطابق">
            <Input placeholder="مثال: الأرضي، الأول..." />
          </Form.Item>
          <Form.Item name="ward_type" label="نوع الجناح" rules={[{ required: true, message: 'يرجى اختيار نوع الجناح' }]}>
            <Select placeholder="اختر نوع الجناح">
              <Select.Option value="general">عام</Select.Option>
              <Select.Option value="icu">عناية مركزة</Select.Option>
              <Select.Option value="pediatric">أطفال</Select.Option>
              <Select.Option value="maternity">أمومة</Select.Option>
              <Select.Option value="surgical">جراحي</Select.Option>
              <Select.Option value="private">خاص</Select.Option>
            </Select>
          </Form.Item>
        </Form>
      </Modal>

      {/* مودال إضافة سرير */}
      <Modal title="إضافة سرير جديد" open={isBedModalVisible} onCancel={() => setIsBedModalVisible(false)} onOk={() => bedForm.submit()} confirmLoading={loading}>
        <Form form={bedForm} layout="vertical" onFinish={handleCreateBed}>
          <Form.Item name="ward_id" label="الجناح / القسم" rules={[{ required: true }]}>
            <Select placeholder="اختر الجناح التابع له السرير">
              {wards.map(w => <Select.Option key={w.id} value={w.id}>{w.name}</Select.Option>)}
            </Select>
          </Form.Item>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="bed_number" label="رقم السرير" rules={[{ required: true }]}>
                <Input placeholder="مثال: B-101" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="daily_rate" label="تكلفة الإقامة اليومية (EGP)" initialValue={0}>
                <InputNumber className="w-full" min={0} />
              </Form.Item>
            </Col>
          </Row>
        </Form>
      </Modal>

      {/* مودال تعديل جناح */}
      <Modal title="تعديل جناح / قسم" open={isWardEditModalVisible} onCancel={() => setIsWardEditModalVisible(false)} onOk={() => wardEditForm.submit()} confirmLoading={loading}>
        <Form form={wardEditForm} layout="vertical" onFinish={handleUpdateWard}>
          <Form.Item name="name" label="اسم الجناح" rules={[{ required: true, message: 'يرجى إدخال اسم الجناح' }]}>
            <Input placeholder="اسم الجناح" />
          </Form.Item>
          <Form.Item name="floor" label="الطابق">
            <Input placeholder="مثال: الأرضي، الأول..." />
          </Form.Item>
          <Form.Item name="ward_type" label="نوع الجناح" rules={[{ required: true, message: 'يرجى اختيار نوع الجناح' }]}>
            <Select placeholder="اختر نوع الجناح">
              <Select.Option value="general">عام</Select.Option>
              <Select.Option value="icu">عناية مركزة</Select.Option>
              <Select.Option value="pediatric">أطفال</Select.Option>
              <Select.Option value="maternity">أمومة</Select.Option>
              <Select.Option value="surgical">جراحي</Select.Option>
              <Select.Option value="private">خاص</Select.Option>
            </Select>
          </Form.Item>
        </Form>
      </Modal>

      {/* مودال تعديل سرير */}
      <Modal title="تعديل سرير" open={isBedEditModalVisible} onCancel={() => setIsBedEditModalVisible(false)} onOk={() => bedEditForm.submit()} confirmLoading={loading}>
        <Form form={bedEditForm} layout="vertical" onFinish={handleUpdateBed}>
          <Form.Item name="ward_id" label="الجناح / القسم" rules={[{ required: true }]}>
            <Select placeholder="اختر الجناح التابع له السرير">
              {wards.map(w => <Select.Option key={w.id} value={w.id}>{w.name}</Select.Option>)}
            </Select>
          </Form.Item>
          <Form.Item name="bed_number" label="رقم السرير" rules={[{ required: true, message: 'يرجى إدخال رقم السرير' }]}>
            <Input placeholder="مثال: B-101" />
          </Form.Item>
          <Form.Item name="daily_rate" label="تكلفة الإقامة اليومية (EGP)" initialValue={0}>
            <InputNumber className="w-full" min={0} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

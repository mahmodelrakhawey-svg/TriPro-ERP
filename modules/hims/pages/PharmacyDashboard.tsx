import React, { useEffect, useState } from 'react';
import { supabase } from '@/supabaseClient';
import { Table, Card, Tag, Button, Row, Col, Typography, Badge, message, Modal, List, Empty, Tooltip, Divider, Statistic, Input, Tabs } from 'antd';
import { MedicineBoxOutlined, SendOutlined, HistoryOutlined, CheckCircleOutlined, BarcodeOutlined, SafetyCertificateOutlined } from '@ant-design/icons';
import { useAuth } from '@/context/AuthContext';
import dayjs from 'dayjs';

export const PharmacyDashboard: React.FC = () => {
  const { currentUser } = useAuth();
  const [prescriptions, setPrescriptions] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<any>(null);
  const [checkedMeds, setCheckedMeds] = useState<any[]>([]);
  const [barcodeInput, setBarcodeInput] = useState('');
  const [activeTab, setActiveTab] = useState('1');
  const [allBatches, setAllBatches] = useState<any[]>([]);
  const [reportLoading, setReportLoading] = useState(false);

  const fetchPendingPrescriptions = async () => {
    if (!currentUser) return;
    setLoading(true);
    
    let orgId = (currentUser as any)?.organization_id;
    if (!orgId) {
      const { data: profile } = await supabase.from('profiles').select('organization_id').eq('id', currentUser.id).single();
      orgId = profile?.organization_id;
    }

    const { data } = await supabase
      .from('hims_prescriptions')
      .select('*, hims_visits!inner(hims_patients(id, full_name, national_id, phone, allergies), hims_billing(payment_status, insurance_provider_id))')
      .eq('status', 'pending')
      .eq('organization_id', orgId)
      .order('created_at', { ascending: false });

    setPrescriptions(data || []);
    setLoading(false);
  };

  // مراجعة الصلاحية والمخزون قبل الصرف
  const handleReviewOrder = async (order: any) => {
    setLoading(true);
    const productIds = order.medications.map((m: any) => m.product_id).filter(Boolean); // تأكد من وجود product_id
    const { data: products } = await supabase.from('products').select('id, name, stock, sales_price, expiry_date, barcode').in('id', productIds);
    
    // جلب التشغيلات وتواريخ الصلاحية من جدول product_batches للفرز حسب الأقرب انتهاءً (FEFO)
    let orgId = (currentUser as any)?.organization_id;
    if (!orgId) {
      const { data: profile } = await supabase.from('profiles').select('organization_id').eq('id', currentUser.id).single();
      orgId = profile?.organization_id;
    }
    
    const { data: batches } = await supabase
      .from('product_batches')
      .select('product_id, batch_number, expiry_date, quantity')
      .in('product_id', productIds)
      .gt('quantity', 0)
      .eq('organization_id', orgId)
      .order('expiry_date', { ascending: true });

    const enriched = order.medications.map((med: any) => {
      const prod = products?.find(p => p.id === med.product_id);
      const prodBatches = batches?.filter(b => b.product_id === med.product_id) || [];
      return {
        ...med,
        current_stock: prod?.stock || 0,
        price: prod?.sales_price || 0,
        expiry_date: prod?.expiry_date || null,
        is_scanned: false, // حالة لتتبع ما إذا تم مسحه بالباركود
        batches: prodBatches
      };
    });
    
    setCheckedMeds(enriched);
    setSelectedOrder(order);
    setLoading(false);
  };

  const fetchAllBatches = async () => {
    if (!currentUser) return;
    setReportLoading(true);
    try {
      let orgId = (currentUser as any)?.organization_id;
      if (!orgId) {
        const { data: profile } = await supabase.from('profiles').select('organization_id').eq('id', currentUser.id).single();
        orgId = profile?.organization_id;
      }
      
      const { data, error } = await supabase
        .from('product_batches')
        .select('*, product:product_id(name, sku, sales_price), warehouse:warehouse_id(name)')
        .eq('organization_id', orgId)
        .order('expiry_date', { ascending: true });
        
      if (error) throw error;
      setAllBatches(data || []);
    } catch (err: any) {
      message.error('فشل جلب تقرير الصلاحيات: ' + err.message);
    } finally {
      setReportLoading(false);
    }
  };

  useEffect(() => { 
    fetchPendingPrescriptions(); 
  }, [currentUser]);

  useEffect(() => {
    if (activeTab === '2') {
      fetchAllBatches();
    }
  }, [activeTab, currentUser]);

  const dispenseMedication = async (orderId: string) => {
    if (!orderId || orderId === "") return message.error("عذراً، معرف الروشتة غير صالح");
    
    setLoading(true);
    // استدعاء RPC لمعالجة الصرف (خصم مخزون + تحديث حالة الروشتة + إضافة تكلفة للفاتورة)
    const { error } = await supabase.rpc('hims_dispense_prescription', {
      p_prescription_id: orderId
    });

    if (error) {
      message.error('فشل عملية الصرف: ' + error.message);
    } else {
      message.success('تم صرف العلاج وتحديث المخزون وقيود التكلفة بنجاح ✅');
      setSelectedOrder(null);
      fetchPendingPrescriptions();
    }
    setLoading(false);
  };

  // 🚀 دالة معالجة مسح الباركود
  const handleBarcodeScan = async () => {
    if (!barcodeInput) return;
    setLoading(true);
    try {
      // 1. البحث عن المنتج بالباركود
      const { data: product, error: productError } = await supabase
        .from('products')
        .select('id, name, stock, sales_price, expiry_date')
        .eq('barcode', barcodeInput)
        .single();

      if (productError || !product) {
        message.error('لم يتم العثور على دواء بهذا الباركود.');
        return;
      }

      // 2. التحقق مما إذا كان الدواء ضمن الروشتة الحالية
      const existingMedIndex = checkedMeds.findIndex(med => med.product_id === product.id);
      if (existingMedIndex === -1) {
        message.warning(`الدواء "${product.name}" ليس ضمن الروشتة الحالية.`);
        return;
      }

      // 3. تحديث حالة الدواء في قائمة الصرف (تم مسحه)
      const updatedMeds = [...checkedMeds];
      updatedMeds[existingMedIndex] = {
        ...updatedMeds[existingMedIndex],
        is_scanned: true,
        current_stock: product.stock,
        expiry_date: product.expiry_date
      };
      setCheckedMeds(updatedMeds);
      message.success(`تم مسح الدواء "${product.name}" بنجاح.`);
    } catch (error: any) { message.error('خطأ في مسح الباركود: ' + error.message); }
    finally { setLoading(false); setBarcodeInput(''); }
  };

  const columns = [
    { title: 'التوقيت', dataIndex: 'created_at', render: (d: string) => dayjs(d).format('HH:mm') },
    { title: 'المريض', dataIndex: ['hims_visits', 'hims_patients', 'full_name'] },
    { 
      title: 'بيانات الهوية', 
      render: (_: any, record: any) => (
        <Typography.Text type="secondary" className="text-xs">
          {record.hims_visits?.hims_patients?.national_id || 'بدون رقم هوية'}
        </Typography.Text>
      ) 
    },
    { title: 'التشخيص الطبي', dataIndex: 'diagnosis', ellipsis: true },
    { 
      title: 'عدد الأصناف', 
      dataIndex: 'medications', 
      render: (meds: any[]) => <Badge count={meds?.length} showZero color="blue" /> 
    },
    { 
      title: 'حالة السداد بالخزينة', 
      render: (record: any) => {
        const visitBilling = record.hims_visits?.hims_billing;
        const billing = Array.isArray(visitBilling) ? visitBilling[0] : visitBilling;
        if (billing?.insurance_provider_id) {
          return <Tag color="green">موافقة تأمينية 🛡️</Tag>;
        }
        const isPaid = billing?.payment_status === 'paid';
        return isPaid ? (
          <Tag color="success">مدفوع بالخزينة ✅</Tag>
        ) : (
          <Tag color="error">غير مدفوع (توجيه للصندوق) ⚠️</Tag>
        );
      }
    },
    { 
      title: 'إجراء', 
      render: (record: any) => {
        const visitBilling = record.hims_visits?.hims_billing;
        const billing = Array.isArray(visitBilling) ? visitBilling[0] : visitBilling;
        const isPaid = billing?.payment_status === 'paid' || billing?.insurance_provider_id;
        return (
          <Tooltip title={!isPaid ? "يجب سداد قيمة الروشتة بالخزينة أولاً" : "فتح تفاصيل الروشتة لتجهيز العلاج"}>
            <Button 
              type="primary" 
              icon={<MedicineBoxOutlined />} 
              onClick={() => handleReviewOrder(record)}
              className={isPaid ? "bg-emerald-600 border-none rounded-lg font-bold" : ""}
              disabled={!isPaid}
            >
              تحضير وصرف
            </Button>
          </Tooltip>
        );
      } 
    }
  ];

  return (
    <div className="p-6 rtl text-right bg-slate-50 min-h-screen">
      <div className="flex justify-between items-center mb-6">
        <Typography.Title level={2} className="m-0">
          <MedicineBoxOutlined className="text-emerald-600" /> صيدلية المستشفى الداخلية
        </Typography.Title>
        <Button icon={<HistoryOutlined />} onClick={fetchPendingPrescriptions}>تحديث القائمة</Button>
      </div>

      <Row gutter={[24, 24]}>
        <Col span={24}>
          <Card className="rounded-3xl shadow-sm border-none overflow-hidden">
            <Tabs 
              activeKey={activeTab} 
              onChange={setActiveTab} 
              className="px-6 pt-4"
              items={[
                {
                  key: '1',
                  label: <span className="font-bold">الروشتات الطبية المعلقة</span>,
                  children: (
                    prescriptions.length === 0 && !loading ? (
                      <Empty 
                        image={Empty.PRESENTED_IMAGE_SIMPLE} 
                        description="لا توجد روشتات بانتظار الصرف حالياً"
                        className="py-10"
                      />
                    ) : (
                      <Table 
                        dataSource={prescriptions} 
                        columns={columns} 
                        rowKey="id" 
                        loading={loading}
                        pagination={{ pageSize: 8 }}
                        locale={{ emptyText: "جاري جلب البيانات من نظام الطبيب..." }}
                      />
                    )
                  )
                },
                {
                  key: '2',
                  label: <span className="font-bold">تقرير صلاحيات وتشغيلات الأدوية</span>,
                  children: (
                    <Table
                      dataSource={allBatches}
                      loading={reportLoading}
                      rowKey="id"
                      pagination={{ pageSize: 10 }}
                      columns={[
                        { title: 'كود الصنف (SKU)', dataIndex: ['product', 'sku'] },
                        { title: 'اسم الدواء', dataIndex: ['product', 'name'], render: (n) => <b>{n}</b> },
                        { title: 'رقم التشغيلة', dataIndex: 'batch_number', render: (b) => <Tag color="blue">{b}</Tag> },
                        { 
                          title: 'تاريخ الصلاحية', 
                          dataIndex: 'expiry_date', 
                          render: (d) => {
                            const expiryDate = dayjs(d);
                            const isExpired = expiryDate.isBefore(dayjs(), 'day');
                            const isNearExpiry = expiryDate.isBefore(dayjs().add(3, 'month'), 'day');
                            
                            return (
                              <Tag color={isExpired ? 'red' : isNearExpiry ? 'orange' : 'green'}>
                                {expiryDate.format('YYYY-MM-DD')} {isExpired ? '(منتهية!)' : isNearExpiry ? '(قريب الانتهاء)' : ''}
                              </Tag>
                            );
                          }
                        },
                        { title: 'الكمية المتوفرة', dataIndex: 'quantity', align: 'center', render: (q) => <b>{q}</b> },
                        { title: 'المستودع', dataIndex: ['warehouse', 'name'] }
                      ]}
                    />
                  )
                }
              ]}
            />
          </Card>
        </Col>
      </Row>

      <Modal
        title={<b>تفاصيل صرف الروشتة الإلكترونية</b>}
        open={!!selectedOrder}
        onCancel={() => setSelectedOrder(null)}
        onOk={() => Modal.confirm({ title: 'تأكيد الصرف', content: 'سيتم خصم الأدوية من المخزن وترحيل قيمتها لفاتورة المريض، هل أنت متأكد؟', onOk: () => dispenseMedication(selectedOrder.id) })}
        okText="تأكيد الصرف النهائي"
        cancelText="إغلاق"
        confirmLoading={loading}
        width={600}
      >
        {selectedOrder && (
          <div className="py-4">
            <div className="bg-blue-50 p-4 rounded-2xl mb-6 border border-blue-100">
              <Typography.Title level={5} className="m-0 text-blue-800">
                المريض: {selectedOrder.hims_visits?.hims_patients?.full_name}
              </Typography.Title>
              <div className="flex gap-4 mt-2">
                <Tag color="cyan">هاتف: {selectedOrder.hims_visits?.hims_patients?.phone || 'غير مسجل'}</Tag>
                <Tag color="blue">تاريخ: {dayjs(selectedOrder.created_at).format('YYYY/MM/DD')}</Tag>
              </div>
              
              {/* 🚨 تنبيه الحساسية في الصيدلية */}
              {selectedOrder.hims_visits?.hims_patients?.allergies?.length > 0 && (
                <div className="mt-4 p-3 bg-white/50 rounded-xl border border-volcano-200">
                  <b className="text-volcano-600 flex items-center gap-2">
                    <SafetyCertificateOutlined /> تنبيه الحساسية للصيدلي:
                  </b>
                  <div className="text-volcano-500 font-bold mt-1">
                    {selectedOrder.hims_visits.hims_patients.allergies.join('، ')}
                  </div>
                </div>
              )}
            </div>
            <Typography.Text strong className="block mb-2">قائمة الأدوية المطلوبة:</Typography.Text>
            
            {/* 🚀 حقل مسح الباركود */}
            <Input 
              placeholder="امسح باركود الدواء هنا..." 
              prefix={<BarcodeOutlined />} 
              value={barcodeInput}
              onChange={(e) => setBarcodeInput(e.target.value)}
              onPressEnter={handleBarcodeScan}
              className="mb-4 rounded-lg"
              disabled={loading}
            />
            <Table
              className="mb-4"
              dataSource={checkedMeds}
              pagination={false}
              size="small"
              rowKey="product_id"
              columns={[
                { title: 'الدواء', dataIndex: 'drug_name', render: (n) => <b>{n}</b> },
                { title: 'المطلوب', dataIndex: 'qty', align: 'center' },
                { title: 'المخزن', dataIndex: 'current_stock', render: (s, r) => <Tag color={s >= r.qty ? 'green' : 'red'}>{s}</Tag> }, // ✅ عرض المخزون الفعلي
                { 
                  title: 'التشغيلات والصلاحية (FEFO)', 
                  dataIndex: 'batches', 
                  render: (batchesList: any[]) => {
                    if (!batchesList || batchesList.length === 0) {
                      return <Tag color="red">لا توجد تشغيلات متوفرة!</Tag>;
                    }
                    return (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        {batchesList.map((b, idx) => {
                          const isExpired = dayjs(b.expiry_date).isBefore(dayjs(), 'day');
                          const isNearExpiry = dayjs(b.expiry_date).isBefore(dayjs().add(3, 'month'), 'day');
                          return (
                            <div key={idx} style={{ fontSize: '11px' }}>
                              <Tag color={isExpired ? 'red' : isNearExpiry ? 'orange' : 'blue'} style={{ margin: 0 }}>
                                {b.batch_number} ({b.quantity} وحدة) - {dayjs(b.expiry_date).format('YYYY-MM-DD')}
                              </Tag>
                            </div>
                          );
                        })}
                      </div>
                    );
                  }
                },
                { title: 'الحالة', render: (_, r) => ( // ✅ حالة المسح
                  r.is_scanned ? <Tag color="blue" icon={<CheckCircleOutlined />}>تم المسح</Tag> : <Tag>بانتظار المسح</Tag>
                )},
                { title: 'الإجمالي', render: (_, r) => <Typography.Text strong>{(r.qty * r.price).toLocaleString()} EGP</Typography.Text> }
                // ✅ يمكن إضافة عمود للتحقق من أن كل الأدوية المطلوبة تم مسحها قبل تفعيل زر الصرف
                // disabled={checkedMeds.some(med => !med.is_scanned)}
              ]}
            />
            <Divider />
            <div className="flex justify-between items-center bg-slate-900 p-4 rounded-xl text-white">
              <Statistic 
                title={<span className="text-slate-400">إجمالي قيمة الصرفية</span>} 
                value={checkedMeds.reduce((acc, curr) => acc + (curr.qty * curr.price), 0)} 
                precision={2} 
                suffix="EGP" 
                styles={{ content: { color: '#fff', fontWeight: 900 } }}
              />
              <BarcodeOutlined style={{ fontSize: 40, opacity: 0.3 }} />
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};
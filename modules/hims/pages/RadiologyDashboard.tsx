import React, { useEffect, useState } from 'react';
import { Table, Tag, Button, Card, Typography, Empty, message, Modal, Form, Input, Divider, Space, Tooltip } from 'antd';
import { CameraOutlined, FileImageOutlined, SendOutlined, CheckCircleOutlined, FileTextOutlined, ZoomInOutlined, ZoomOutOutlined, RotateRightOutlined, RedoOutlined, AimOutlined, BgColorsOutlined } from '@ant-design/icons';
import { supabase } from '@/supabaseClient';
import { useAuth } from '@/context/AuthContext';
import { db } from '../../../services/offlineService';
import { PACSViewerModal } from '../components/PACSViewerModal';

const { Title, Text } = Typography;

export const RadiologyDashboard: React.FC = () => {
  const { currentUser } = useAuth();
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<any>(null);
  const [pacsModalVisible, setPacsModalVisible] = useState(false);
  const [pacsOrder, setPacsOrder] = useState<any>(null);
  const [form] = Form.useForm();

  // DICOM Viewer Simulator States
  const [zoom, setZoom] = useState(1.0);
  const [rotate, setRotate] = useState(0);
  const [contrast, setContrast] = useState(100);
  const [rulerActive, setRulerActive] = useState(false);
  const [rulerPoints, setRulerPoints] = useState<{ x1: number; y1: number; x2: number; y2: number } | null>(null);
  const [isDrawingRuler, setIsDrawingRuler] = useState(false);
  
  // Real DICOM integration states
  const [localDicomScans, setLocalDicomScans] = useState<string[]>([]);
  const [activeScanIndex, setActiveScanIndex] = useState(0);

  const checkLocalPACS = async () => {
    // Graceful PACS integration check
    setLocalDicomScans([]);
  };

  const resetDicomViewer = () => {
    setZoom(1.0);
    setRotate(0);
    setContrast(100);
    setRulerPoints(null);
    setRulerActive(false);
    setLocalDicomScans([]);
    setActiveScanIndex(0);
  };

  const fetchOrders = async () => {
    const orgId = currentUser?.organization_id;
    if (!orgId) return;

    setLoading(true);
    try {
      if (navigator.onLine) {
        const { data } = await supabase
          .from('hims_radiology_orders') 
          .select('*, hims_visits(id, doctor_id, hims_patients(id, full_name), hims_billing(payment_status, insurance_provider_id))')
          .eq('organization_id', orgId)
          .eq('status', 'pending');
        setOrders(data || []);
      } else {
        const queuedRad = await db.queuedRadiologyOrders.toArray();
        const queuedPatients = await db.queuedPatients.toArray();
        const cachedPatients = await db.himsPatients.toArray();
        const queuedVisits = await db.queuedVisits.toArray();

        const findPatientName = (patientId: string) => {
          if (patientId?.startsWith('queued-')) {
            const idNum = parseInt(patientId.replace('queued-', ''));
            const qP = queuedPatients.find(p => p.id === idNum);
            return qP?.payload?.full_name || 'مريض معلق أوفلاين';
          }
          const cP = cachedPatients.find(p => p.id === patientId);
          return cP?.full_name || 'مريض غير مسجل';
        };

        const offlineOrders: any[] = [];
        let index = 1;
        for (const batch of queuedRad) {
          if (Array.isArray(batch.payload)) {
            for (const o of batch.payload) {
              let patName = 'مريض معلق';
              const tempVisitId = o.visit_id;
              if (tempVisitId?.startsWith('queued-visit-')) {
                const idNum = parseInt(tempVisitId.replace('queued-visit-', ''));
                const qV = queuedVisits.find(v => v.id === idNum);
                if (qV) {
                  patName = findPatientName(qV.payload.patient_id);
                }
              }

              offlineOrders.push({
                id: `queued-rad-${batch.id}-${index++}`,
                status: 'pending',
                scan_type: o.scan_type || 'أشعة أوفلاين',
                hims_visits: {
                  id: tempVisitId,
                  hims_patients: { full_name: patName },
                  hims_billing: { payment_status: 'paid' }
                }
              });
            }
          }
        }

        // فلترة الطلبات المكتملة أوفلاين من IndexedDB بدل localStorage
        const completedOffline = await db.queuedRadiologyOrders
          .where('type').equals('completed_rad')
          .toArray();
        const completedIds = new Set(completedOffline.map((r: any) => r.tempId));
        setOrders(offlineOrders.filter(o => !completedIds.has(o.id)));
      }
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  };

  // 🔄 جلب البيانات تلقائياً عند تحميل الصفحة وتغيير المستخدم
  useEffect(() => {
    if (currentUser) {
      fetchOrders();
    }
  }, [currentUser]);

  // 📡 تحديث القائمة لحظياً عند إضافة طلب أشعة جديد من الطبيب
  useEffect(() => {
    const orgId = currentUser?.organization_id;
    if (!orgId) return;

    const channel = supabase
      .channel(`hims-radiology-orders-sync-${orgId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'hims_radiology_orders',
          filter: `organization_id=eq.${orgId}`
        },
        () => { fetchOrders(); }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [currentUser]);

  useEffect(() => {
    const handleConnectivityChange = () => {
      fetchOrders();
    };
    window.addEventListener('online', handleConnectivityChange);
    window.addEventListener('offline', handleConnectivityChange);
    return () => {
      window.removeEventListener('online', handleConnectivityChange);
      window.removeEventListener('offline', handleConnectivityChange);
    };
  }, [currentUser]);



  const handleSubmitReport = async (values: any) => {
    if (!selectedOrder) return;
    
    setLoading(true);
    try {
      if (!navigator.onLine && selectedOrder.id.startsWith('queued-rad-')) {
        // حفظ التقرير أوفلاين في IndexedDB بدل localStorage
        await db.queuedRadiologyOrders.add({
          payload: {
            type: 'completed_rad',
            tempId: selectedOrder.id,
            report_text: values.report_text,
            order_id: selectedOrder.id,
          },
          createdAt: new Date(),
          status: 'pending',
          attempts: 0,
        });
        message.warning('تم تسجيل تقرير الأشعة محلياً بنجاح! سيتم رفعه سحابياً فور عودة الاتصال 📶');
        setSelectedOrder(null);
        resetDicomViewer();
        form.resetFields();
        fetchOrders();
        setLoading(false);
        return;
      }

      const { error } = await supabase.rpc('hims_complete_radiology', {
        p_order_id: selectedOrder.id,
        p_report: values.report_text,
        p_images: []
      });

      if (error) throw error;

      message.success('تم اعتماد تقرير الأشعة وإخطار الطبيب المعالج فوراً ✅');
      setSelectedOrder(null);
      resetDicomViewer();
      form.resetFields();
      fetchOrders();
    } catch (err: any) {
      message.error('فشل في حفظ التقرير: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const openReportModal = (order: any) => {
    resetDicomViewer();
    setSelectedOrder(order);
    form.setFieldsValue({
      patient_name: order.hims_visits?.hims_patients?.full_name,
      scan_type: order.scan_type
    });
    checkLocalPACS();
  };


  const columns = [
    { 
      title: 'بيانات الحالة', 
      render: (r: any) => (
        <Space orientation="vertical" size={0}>
          <Text strong>{r.hims_visits?.hims_patients?.full_name}</Text>
          <Text type="secondary" className="text-xs">زيارة: {r.hims_visits?.id.substring(0,8)}</Text>
        </Space>
      )
    },
    { 
      title: 'نوع الفحص', 
      dataIndex: 'scan_type',
      render: (t: string) => <Tag color="blue" className="font-bold">{t}</Tag>
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
    { title: 'إجراء', render: (record: any) => {
      const visitBilling = record.hims_visits?.hims_billing;
      const billing = Array.isArray(visitBilling) ? visitBilling[0] : visitBilling;
      const isPaid = billing?.payment_status === 'paid' || billing?.insurance_provider_id;
      return (
        <Space>
          <Button
            type="default"
            icon={<FileImageOutlined />}
            onClick={() => {
              setPacsOrder(record);
              setPacsModalVisible(true);
            }}
            className="bg-slate-900 text-cyan-400 border-cyan-500/30 hover:bg-slate-800 font-bold"
          >
            عارض PACS (DICOM)
          </Button>

          {record.status === 'pending' ? (
            <Tooltip title={!isPaid ? "يجب سداد قيمة الأشعة بالخزينة أولاً" : ""}>
              <Button 
                type="primary"
                icon={<CameraOutlined />} 
                onClick={() => openReportModal(record)}
                className={isPaid ? "bg-indigo-600 border-none font-bold" : ""}
                disabled={!isPaid}
              >
                كتابة التقرير
              </Button>
            </Tooltip>
          ) : (
            <Tag color="green">مكتمل</Tag>
          )}
        </Space>
      );
    }}
  ];

  return (
    <div className="p-6 rtl text-right">
      <Card className="rounded-3xl shadow-sm border-none min-h-[500px]">
        <Title level={3}><FileImageOutlined /> وحدة الأشعة والتشخيص التصويري</Title>
        <Table 
          dataSource={orders} 
          columns={columns} 
          rowKey="id" 
          loading={loading}
          locale={{ emptyText: <Empty description="لا توجد طلبات أشعة بانتظار التقارير" /> }} 
        />
      </Card>

      <Modal
        title={<b><FileTextOutlined /> تحرير تقرير شعاعي متخصص</b>}
        open={!!selectedOrder}
        onCancel={() => setSelectedOrder(null)}
        onOk={() => form.submit()}
        confirmLoading={loading}
        okText="اعتماد وإرسال للطبيب"
        cancelText="إلغاء"
        width={800}
      >
        <Form form={form} layout="vertical" onFinish={handleSubmitReport} className="pt-4">
          <div className="grid grid-cols-2 gap-4 bg-slate-50 p-4 rounded-2xl mb-4 border border-slate-100">
             <Form.Item name="patient_name" label="المريض" className="mb-0"><Input readOnly variant="borderless" className="font-bold text-indigo-700" /></Form.Item>
             <Form.Item name="scan_type" label="الفحص" className="mb-0"><Input readOnly variant="borderless" className="font-bold text-indigo-700" /></Form.Item>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
             {/* Left Column: DICOM Diagnostic Simulator Workstation */}
             <div className="flex flex-col bg-slate-950 p-4 rounded-3xl border border-slate-800 text-white relative">
                {/* Workstation Header */}
                <div className="flex justify-between items-center mb-3 border-b border-slate-800 pb-2">
                   <span className="text-xs font-bold text-slate-400">PACS WORKSTATION [DICOM 3.0]</span>
                   <span className="text-[10px] bg-indigo-950 text-indigo-300 px-2 py-0.5 rounded-full font-mono font-bold">MONO_16BIT</span>
                </div>

                {/* DICOM Control Panel */}
                <div className="flex flex-wrap gap-2 justify-center mb-3 bg-slate-900 p-2 rounded-xl">
                   <Tooltip title="تكبير الصورة"><Button size="small" type="text" className="text-white hover:bg-slate-800" icon={<ZoomInOutlined />} onClick={() => setZoom(prev => Math.min(2.5, prev + 0.2))} /></Tooltip>
                   <Tooltip title="تصغير الصورة"><Button size="small" type="text" className="text-white hover:bg-slate-800" icon={<ZoomOutOutlined />} onClick={() => setZoom(prev => Math.max(0.6, prev - 0.2))} /></Tooltip>
                   <Tooltip title="تدوير يمين"><Button size="small" type="text" className="text-white hover:bg-slate-800" icon={<RotateRightOutlined />} onClick={() => setRotate(prev => (prev + 90) % 360)} /></Tooltip>
                   <Tooltip title="زيادة التباين"><Button size="small" type="text" className="text-white hover:bg-slate-800" icon={<BgColorsOutlined />} onClick={() => setContrast(prev => Math.min(300, prev + 25))} /></Tooltip>
                   <Tooltip title="تفعيل مسطرة القياس"><Button size="small" type="text" className={`text-white hover:bg-slate-800 ${rulerActive ? 'bg-red-950 border border-red-500' : ''}`} icon={<AimOutlined />} onClick={() => { setRulerActive(!rulerActive); setRulerPoints(null); }} /></Tooltip>
                   <Tooltip title="إعادة تهيئة"><Button size="small" type="text" className="text-white hover:bg-slate-800" icon={<RedoOutlined />} onClick={resetDicomViewer} /></Tooltip>
                </div>

                {/* Active Scan Area */}
                <div 
                   className={`h-72 bg-black rounded-2xl overflow-hidden relative border border-slate-800 flex items-center justify-center ${rulerActive ? 'cursor-crosshair' : 'cursor-default'}`}
                   onMouseDown={(e) => {
                      if (!rulerActive) return;
                      setIsDrawingRuler(true);
                      const rect = e.currentTarget.getBoundingClientRect();
                      const x = e.clientX - rect.left;
                      const y = e.clientY - rect.top;
                      setRulerPoints({ x1: x, y1: y, x2: x, y2: y });
                   }}
                   onMouseMove={(e) => {
                      if (!rulerActive || !isDrawingRuler || !rulerPoints) return;
                      const rect = e.currentTarget.getBoundingClientRect();
                      const x = e.clientX - rect.left;
                      const y = e.clientY - rect.top;
                      setRulerPoints({ ...rulerPoints, x2: x, y2: y });
                   }}
                   onMouseUp={() => setIsDrawingRuler(false)}
                >
                   {/* Styled scan content */}
                   <div 
                      className="w-full h-full flex items-center justify-center transition-transform duration-100 ease-out"
                      style={{ 
                         transform: `scale(${zoom}) rotate(${rotate}deg)`,
                         filter: `contrast(${contrast}%) grayscale(100%)`
                      }}
                   >
                      {/* Check if real local scans exist from Orthanc */}
                      {localDicomScans.length > 0 ? (
                         <img 
                            src={`http://localhost:8042/instances/${localDicomScans[activeScanIndex]}/preview`} 
                            alt="PACS DICOM Scan Preview" 
                            className="max-h-full max-w-full object-contain select-none pointer-events-none"
                         />
                      ) : selectedOrder?.scan_type?.toLowerCase().includes('brain') || selectedOrder?.scan_type?.includes('مخ') || selectedOrder?.scan_type?.includes('رأس') ? (
                         // Brain MRI SVG Simulation
                         <svg viewBox="0 0 200 200" className="w-56 h-56 select-none pointer-events-none">
                            <circle cx="100" cy="100" r="80" fill="none" stroke="#666" strokeWidth="3" />
                            <circle cx="100" cy="100" r="76" fill="#080808" />
                            <path d="M100 25 C 60 25, 40 50, 40 100 C 40 150, 60 175, 100 175 C 100 100, 100 50, 100 25 Z" fill="#222" stroke="#444" strokeWidth="1" />
                            <path d="M100 25 C 140 25, 160 50, 160 100 C 160 150, 140 175, 100 175 C 100 100, 100 50, 100 25 Z" fill="#222" stroke="#444" strokeWidth="1" />
                            <path d="M60 60 Q 80 70 100 65 M60 100 Q 80 110 100 105 M60 140 Q 80 130 100 135" fill="none" stroke="#555" strokeWidth="1.5" />
                            <path d="M140 60 Q 120 70 100 65 M140 100 Q 120 110 100 105 M140 140 Q 120 130 100 135" fill="none" stroke="#555" strokeWidth="1.5" />
                            <path d="M90 85 C 80 80, 80 120, 95 110 C 95 100, 90 90, 90 85 Z" fill="#000" stroke="#333" strokeWidth="1"/>
                            <path d="M110 85 C 120 80, 120 120, 105 110 C 105 100, 110 90, 110 85 Z" fill="#000" stroke="#333" strokeWidth="1"/>
                         </svg>
                      ) : (
                         // Chest X-Ray SVG Simulation
                         <svg viewBox="0 0 200 200" className="w-56 h-56 select-none pointer-events-none">
                            <rect x="97" y="10" width="6" height="180" fill="#333" opacity="0.6"/>
                            <rect x="95" y="20" width="10" height="160" fill="#444" opacity="0.4"/>
                            <path d="M40 30 C 50 15, 85 15, 85 80 C 85 130, 45 150, 35 120 C 30 100, 30 50, 40 30 Z" fill="#0c0c0c" stroke="#333" strokeWidth="0.5" />
                            <path d="M160 30 C 150 15, 115 15, 115 80 C 115 130, 155 150, 165 120 C 170 100, 170 50, 160 30 Z" fill="#0c0c0c" stroke="#333" strokeWidth="0.5" />
                            <path d="M97 50 Q 70 45 40 55" fill="none" stroke="#888" strokeWidth="1.5" opacity="0.6"/>
                            <path d="M103 50 Q 130 45 160 55" fill="none" stroke="#888" strokeWidth="1.5" opacity="0.6"/>
                            <path d="M97 70 Q 65 65 35 80" fill="none" stroke="#888" strokeWidth="1.5" opacity="0.6"/>
                            <path d="M103 70 Q 135 65 165 80" fill="none" stroke="#888" strokeWidth="1.5" opacity="0.6"/>
                            <path d="M97 90 Q 60 85 32 105" fill="none" stroke="#888" strokeWidth="1.5" opacity="0.6"/>
                            <path d="M103 90 Q 140 85 168 105" fill="none" stroke="#888" strokeWidth="1.5" opacity="0.6"/>
                            <path d="M97 110 Q 60 105 32 125" fill="none" stroke="#888" strokeWidth="1.5" opacity="0.6"/>
                            <path d="M103 110 Q 140 105 168 125" fill="none" stroke="#888" strokeWidth="1.5" opacity="0.6"/>
                            <path d="M85 80 C 85 110, 110 120, 115 110 C 120 100, 95 70, 85 80 Z" fill="#222" opacity="0.7"/>
                         </svg>
                      )}
                   </div>
 
                   {/* Ruler Line Render Overlay */}
                   {rulerPoints && (
                      <svg className="absolute inset-0 pointer-events-none w-full h-full">
                         <line 
                            x1={rulerPoints.x1} 
                            y1={rulerPoints.y1} 
                            x2={rulerPoints.x2} 
                            y2={rulerPoints.y2} 
                            stroke="#ff4d4f" 
                            strokeWidth={2} 
                         />
                         <circle cx={rulerPoints.x1} cy={rulerPoints.y1} r={4} fill="#ff4d4f" />
                         <circle cx={rulerPoints.x2} cy={rulerPoints.y2} r={4} fill="#ff4d4f" />
                         <text 
                            x={(rulerPoints.x1 + rulerPoints.x2) / 2} 
                            y={(rulerPoints.y1 + rulerPoints.y2) / 2 - 8} 
                            fill="#ff4d4f" 
                            fontSize="12" 
                            fontWeight="bold"
                            textAnchor="middle"
                            style={{ filter: 'drop-shadow(0px 1px 2px rgba(0,0,0,0.8))' }}
                         >
                            {(Math.hypot(rulerPoints.x2 - rulerPoints.x1, rulerPoints.y2 - rulerPoints.y1) * 0.4).toFixed(1)} mm
                         </text>
                      </svg>
                   )}
                </div>
 
                {/* DICOM Info overlay */}
                <div className="mt-2 text-[10px] text-slate-500 flex justify-between items-center">
                   <span>Scale: {zoom.toFixed(1)}x | Contrast: {contrast}%</span>
                   {localDicomScans.length > 1 && (
                      <div className="flex gap-2">
                         <Button 
                            size="small" 
                            type="primary" 
                            disabled={activeScanIndex === 0} 
                            onClick={() => { setActiveScanIndex(prev => prev - 1); setRulerPoints(null); }}
                            className="bg-indigo-950 text-indigo-300 text-[10px] py-0 px-2 h-5 min-w-0"
                         >
                            السابق
                         </Button>
                         <span className="text-white font-mono">{activeScanIndex + 1} / {localDicomScans.length}</span>
                         <Button 
                            size="small" 
                            type="primary" 
                            disabled={activeScanIndex === localDicomScans.length - 1} 
                            onClick={() => { setActiveScanIndex(prev => prev + 1); setRulerPoints(null); }}
                            className="bg-indigo-950 text-indigo-300 text-[10px] py-0 px-2 h-5 min-w-0"
                         >
                            التالي
                         </Button>
                      </div>
                   )}
                   <span>{rulerActive ? '⚠️ مسطرة القياس مفعلة (انقر واسحب)' : 'جاهز للمعاينة التشخيصية'}</span>
                </div>
             </div>

             {/* Right Column: Text Report Form */}
             <div>
                <Form.Item 
                  name="report_text" 
                  label="التقرير الطبي النهائي" 
                  rules={[{ required: true, message: 'يرجى كتابة التقرير' }]}
                  className="mb-2"
                >
                  <Input.TextArea rows={12} placeholder="اكتب الوصف التفصيلي للحالة، الاستنتاج الطبي، والتوصيات..." className="rounded-xl font-mono text-sm" />
                </Form.Item>
                <p className="text-[10px] text-slate-400 italic mt-1">* بمجرد الاعتماد، سيظهر التقرير لحظياً في شاشة الطبيب المعالج.</p>
             </div>
          </div>
        </Form>
      </Modal>

      {/* 🔬 Multi-Slice PACS / DICOM Viewer Studio */}
      <PACSViewerModal
        visible={pacsModalVisible}
        onClose={() => {
          setPacsModalVisible(false);
          setPacsOrder(null);
        }}
        order={pacsOrder}
        onSaveReport={async (findings, impressions) => {
          if (!pacsOrder?.id) return;
          const fullText = `${findings}\n\n${impressions}`;
          const { error } = await supabase
            .from('hims_radiology_orders')
            .update({ report_text: fullText, status: 'completed' })
            .eq('id', pacsOrder.id);
          if (error) throw error;
          fetchOrders();
        }}
      />
    </div>
  );
};
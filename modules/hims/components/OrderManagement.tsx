import { logger } from '../../../utils/logger';
import React, { useState, useEffect } from 'react';
import { supabase } from '@/supabaseClient';
import { Card, Tabs, Select, Button, Table, Tag, message, Typography, InputNumber, Input, DatePicker } from 'antd';
import { ExperimentOutlined, CameraOutlined, MedicineBoxOutlined, PlusOutlined, HeartOutlined, ToolOutlined } from '@ant-design/icons';
import { useAuth } from '@/context/AuthContext';
import { offlineService } from '../../../services/offlineService';
import { secureStorage } from '../../../utils/securityMiddleware';

const { Option } = Select;

export const OrderManagement: React.FC<{ visitId: string }> = ({ visitId }) => {
  const { currentUser } = useAuth();
  const [labTests, setLabTests] = useState<any[]>([]);
  const [radTypes, setRadTypes] = useState<any[]>([]);
  const [selectedTests, setSelectedTests] = useState<string[]>([]);
  const [selectedRads, setSelectedRads] = useState<string[]>([]);
  const [bloodRequest, setBloodRequest] = useState({ type: 'O+', units: 1 });
  const [surgeryRequest, setSurgeryRequest] = useState({ name: '', date: null as any });
  const [nursingTasks, setNursingTasks] = useState<any[]>([]);
  const [newNursingTask, setNewNursingTask] = useState({ type: 'dressing', description: '', priority: 'normal' });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const fetchMasters = async () => {
      setLoading(true);
      let orgId = (currentUser as any)?.organization_id;

      if (!orgId && currentUser?.id) {
        const { data: profile } = await supabase.from('profiles').select('organization_id').eq('id', currentUser.id).single();
        orgId = profile?.organization_id;
      }
      
      if (!orgId && visitId) {
        try {
          const { data: vData } = await supabase.from('hims_visits').select('organization_id').eq('id', visitId).single();
          orgId = vData?.organization_id;
        } catch (e) {}
      }

      if (!orgId) {
        setLoading(false);
        return;
      }

      if (navigator.onLine) {
        try {
          const [labRes, radRes] = await Promise.all([
            supabase.from('hims_lab_tests').select('*').eq('organization_id', orgId).order('test_name'),
            supabase.from('hims_radiology_types').select('*').eq('organization_id', orgId).order('name')
          ]);
          setLabTests(labRes.data || []);
          setRadTypes(radRes.data || []);

          secureStorage.setItem(`hims_lab_tests_${orgId}`, labRes.data || []);
          secureStorage.setItem(`hims_radiology_types_${orgId}`, radRes.data || []);
        } catch (err) {
          logger.error("Failed online fetchMasters:", err);
        }
      } else {
        const cachedLab = secureStorage.getItem(`hims_lab_tests_${orgId}`);
        const cachedRad = secureStorage.getItem(`hims_radiology_types_${orgId}`);
        
        let labs: any[] = (cachedLab as any[]) ?? [];
        let rads: any[] = (cachedRad as any[]) ?? [];

        if (labs.length === 0) {
          labs = [
            { id: 'offline-lab-1', test_name: 'ØµÙˆØ±Ø© Ø¯Ù… ÙƒØ§Ù…Ù„Ø© (CBC)' },
            { id: 'offline-lab-2', test_name: 'ÙˆØ¸Ø§Ø¦Ù ÙƒÙ„Ù‰ (Creatinine/Urea)' },
            { id: 'offline-lab-3', test_name: 'ÙˆØ¸Ø§Ø¦Ù ÙƒØ¨Ø¯ (ALT/AST)' },
            { id: 'offline-lab-4', test_name: 'ØªØ­Ù„ÙŠÙ„ Ø³ÙƒØ± ØªØ±Ø§ÙƒÙ…ÙŠ (HbA1c)' }
          ];
        }
        if (rads.length === 0) {
          rads = [
            { id: 'offline-rad-1', name: 'Ø£Ø´Ø¹Ø© Ø³ÙŠÙ†ÙŠØ© Ø¹Ù„Ù‰ Ø§Ù„ØµØ¯Ø± (Chest X-Ray)', price: 150 },
            { id: 'offline-rad-2', name: 'Ø³ÙˆÙ†Ø§Ø± Ø¹Ù„Ù‰ Ø§Ù„Ø¨Ø·Ù† ÙˆØ§Ù„Ø­ÙˆØ¶ (Abdominal US)', price: 250 },
            { id: 'offline-rad-3', name: 'Ø±Ù†ÙŠÙ† Ù…ØºÙ†Ø§Ø·ÙŠØ³ÙŠ Ø¹Ù„Ù‰ Ø§Ù„Ù…Ø® (Brain MRI)', price: 1200 },
            { id: 'offline-rad-4', name: 'Ø£Ø´Ø¹Ø© Ù…Ù‚Ø·Ø¹ÙŠØ© (CT Scan)', price: 600 }
          ];
        }

        setLabTests(labs);
        setRadTypes(rads);
      }
      setLoading(false);
    };
    fetchMasters();
  }, [currentUser, visitId]);

  const placeOrders = async (type: 'lab' | 'radiology') => {
    setLoading(true);
    try {
      let orgId = (currentUser as any)?.organization_id;
      if (!orgId) {
        try {
          const { data: visitData } = await supabase.from('hims_visits').select('organization_id').eq('id', visitId).single();
          orgId = visitData?.organization_id;
        } catch (e) {
          logger.error('[OrderManagement] Failed to get org from visit:', e?.message);
        }
      }

      if (type === 'lab') {
        const orders = selectedTests.map(testId => ({
          visit_id: visitId,
          test_id: testId,
          status: 'pending',
          organization_id: orgId
        }));

        if (!navigator.onLine) {
          await offlineService.queueLabOrders(orders);
          message.warning('ØªÙ… Ø­ÙØ¸ Ø·Ù„Ø¨ Ø§Ù„ØªØ­Ø§Ù„ÙŠÙ„ Ù…Ø­Ù„ÙŠØ§Ù‹ Ø¨Ù†Ø¬Ø§Ø­ (Ø³ÙŠØªÙ… Ø§Ù„ØªØ²Ø§Ù…Ù† ØªÙ„Ù‚Ø§Ø¦ÙŠØ§Ù‹ Ø¹Ù†Ø¯ Ø¹ÙˆØ¯Ø© Ø§Ù„Ø§ØªØµØ§Ù„) ðŸ“¶');
          setSelectedTests([]);
          return;
        }

        // Prevent duplicate 409 conflicts by checking existing pending orders
        const { data: existingLabs } = await supabase
          .from('hims_lab_orders')
          .select('test_id')
          .eq('visit_id', visitId)
          .eq('organization_id', orgId);

        const existingTestIds = new Set((existingLabs || []).map(l => l.test_id));
        const newLabOrders = orders.filter(o => !existingTestIds.has(o.test_id));

        if (newLabOrders.length > 0) {
          const { error } = await supabase.from('hims_lab_orders').insert(newLabOrders);
          if (error && error.code !== '23505') throw error;
        }
      } else if (type === 'radiology') {
        const orders = selectedRads.map(radId => {
          const radType = radTypes.find(rt => rt.id === radId);
          return {
            visit_id: visitId,
            scan_type: radType ? radType.name : 'ØºÙŠØ± Ù…Ø­Ø¯Ø¯',
            price: radType ? (radType.price || 0) : 0,
            status: 'pending',
            organization_id: orgId
          };
        });

        if (!navigator.onLine) {
          await offlineService.queueRadiologyOrders(orders);
          message.warning('ØªÙ… Ø­ÙØ¸ Ø·Ù„Ø¨ Ø§Ù„Ø£Ø´Ø¹Ø© Ù…Ø­Ù„ÙŠØ§Ù‹ Ø¨Ù†Ø¬Ø§Ø­ (Ø³ÙŠØªÙ… Ø§Ù„ØªØ²Ø§Ù…Ù† ØªÙ„Ù‚Ø§Ø¦ÙŠØ§Ù‹ Ø¹Ù†Ø¯ Ø¹ÙˆØ¯Ø© Ø§Ù„Ø§ØªØµØ§Ù„) ðŸ“¶');
          setSelectedRads([]);
          return;
        }

        // Prevent duplicate 409 conflicts by checking existing pending orders
        const { data: existingRads } = await supabase
          .from('hims_radiology_orders')
          .select('scan_type')
          .eq('visit_id', visitId)
          .eq('organization_id', orgId);

        const existingScanNames = new Set((existingRads || []).map(r => r.scan_type));
        const newRadOrders = orders.filter(o => !existingScanNames.has(o.scan_type));

        if (newRadOrders.length > 0) {
          const { error } = await supabase.from('hims_radiology_orders').insert(newRadOrders);
          if (error && error.code !== '23505') throw error;
        }
      }
      message.success('ØªÙ… Ø¥Ø±Ø³Ø§Ù„ Ø§Ù„Ø·Ù„Ø¨Ø§Øª Ù„Ù„Ø£Ù‚Ø³Ø§Ù… Ø§Ù„Ù…Ø¹Ù†ÙŠØ© Ø¨Ù†Ø¬Ø§Ø­ âœ…');
      type === 'lab' ? setSelectedTests([]) : setSelectedRads([]);
    } catch (err) {
      message.error('Ø®Ø·Ø£ ÙÙŠ Ø¥Ø±Ø³Ø§Ù„ Ø§Ù„Ø·Ù„Ø¨: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const requestBlood = async () => {
    setLoading(true);
    try {
      const { error } = await supabase.rpc('hims_request_blood', {
        p_visit_id: visitId,
        p_blood_type: bloodRequest.type,
        p_units: bloodRequest.units,
        p_urgency: 'normal'
      });
      if (error) throw error;
      message.success('ØªÙ… Ø¥Ø±Ø³Ø§Ù„ Ø·Ù„Ø¨ Ø§Ù„Ø¯Ù… Ù„Ø¨Ù†Ùƒ Ø§Ù„Ø¯Ù… Ø§Ù„Ù…Ø±ÙƒØ²ÙŠ ðŸ©¸');
    } catch (err) {
      logger.error('[OrderManagement] Blood request error:', err);
      message.error('Ø®Ø·Ø£ ÙÙŠ Ø·Ù„Ø¨ Ø§Ù„Ø¯Ù…: ' + (err?.message || ''));
    } finally {
      setLoading(false);
    }
  };

  const requestSurgery = async () => {
    if (!surgeryRequest.name || !surgeryRequest.date) return message.warning('ÙŠØ±Ø¬Ù‰ Ø¥ÙƒÙ…Ø§Ù„ Ø¨ÙŠØ§Ù†Ø§Øª Ø§Ù„Ø¬Ø±Ø§Ø­Ø©');
    setLoading(true);
    try {
      const { data: visitData } = await supabase
        .from('hims_visits')
        .select('organization_id, doctor_id')
        .eq('id', visitId)
        .single();

      const { error } = await supabase.from('hims_surgeries').insert([{
        visit_id: visitId,
        surgery_name: surgeryRequest.name,
        scheduled_start: surgeryRequest.date.toISOString(),
        status: 'scheduled',
        organization_id: visitData?.organization_id,
        lead_surgeon_id: visitData?.doctor_id
      }]);
      if (error) throw error;
      message.success('ØªÙ…Øª Ø¬Ø¯ÙˆÙ„Ø© Ø§Ù„Ø¹Ù…Ù„ÙŠØ© Ø§Ù„Ø¬Ø±Ø§Ø­ÙŠØ© ÙˆØ¥Ø®Ø·Ø§Ø± ØºØ±ÙØ© Ø§Ù„Ø¹Ù…Ù„ÙŠØ§Øª ðŸ¥');
      setSurgeryRequest({ name: '', date: null });
    } catch (err) {
      logger.error('[OrderManagement] Surgery request error:', err);
      message.error('Ø®Ø·Ø£ ÙÙŠ Ø¬Ø¯ÙˆÙ„Ø© Ø§Ù„Ø¹Ù…Ù„ÙŠØ©: ' + (err?.message || ''));
    } finally {
      setLoading(false);
    }
  };

  const fetchNursingTasks = async () => {
    if (!visitId) return;
    const { data } = await supabase
      .from('hims_nurse_tasks')
      .select('*')
      .eq('visit_id', visitId)
      .order('created_at', { ascending: false });
    setNursingTasks(data || []);
  };

  useEffect(() => {
    fetchNursingTasks();
  }, [visitId]);

  const requestNursingService = async () => {
    if (!newNursingTask.description) return message.warning('ÙŠØ±Ø¬Ù‰ Ø¥Ø¯Ø®Ø§Ù„ ØªÙØ§ØµÙŠÙ„ Ø§Ù„Ø®Ø¯Ù…Ø© Ø§Ù„ØªÙ…Ø±ÙŠØ¶ÙŠØ© Ø§Ù„Ù…Ø·Ù„ÙˆØ¨Ø©');
    setLoading(true);
    try {
      const { data: visitData } = await supabase
        .from('hims_visits')
        .select('organization_id')
        .eq('id', visitId)
        .single();
      
      const { error } = await supabase
        .from('hims_nurse_tasks')
        .insert([{
          visit_id: visitId,
          task_type: newNursingTask.type,
          description: newNursingTask.description,
          priority: newNursingTask.priority,
          due_at: new Date().toISOString(),
          status: 'pending',
          organization_id: visitData?.organization_id
        }]);

      if (error) throw error;
      message.success('ØªÙ… Ø¥Ø±Ø³Ø§Ù„ Ø·Ù„Ø¨ Ø§Ù„Ø®Ø¯Ù…Ø© Ø§Ù„ØªÙ…Ø±ÙŠØ¶ÙŠØ© Ù„Ù…ÙƒØªØ¨ Ø§Ù„ØªÙ…Ø±ÙŠØ¶ Ø¨Ù†Ø¬Ø§Ø­ âœ…');
      setNewNursingTask({ type: 'dressing', description: '', priority: 'normal' });
      fetchNursingTasks();
    } catch (err) {
      message.error('Ø®Ø·Ø£ ÙÙŠ Ø¥Ø±Ø³Ø§Ù„ Ø·Ù„Ø¨ Ø§Ù„Ø®Ø¯Ù…Ø©: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="rounded-2xl shadow-sm border-slate-200">
      <Tabs 
        defaultActiveKey="1"
        items={[
          {
            key: '1',
            label: <span><ExperimentOutlined /> Ø·Ù„Ø¨ ØªØ­Ø§Ù„ÙŠÙ„</span>,
            children: (
              <div className="space-y-4">
                <Select
                  mode="multiple"
                  style={{ width: '100%' }}
                  placeholder="Ø§Ø®ØªØ± Ø§Ù„ØªØ­Ø§Ù„ÙŠÙ„ Ø§Ù„Ù…Ø·Ù„ÙˆØ¨Ø©..."
                  value={selectedTests}
                  onChange={setSelectedTests}
                  options={labTests.map(t => ({ label: t.test_name, value: t.id }))}
                />
                <Button 
                  type="primary" 
                  block 
                  icon={<PlusOutlined />} 
                  onClick={() => placeOrders('lab')}
                  loading={loading}
                  disabled={selectedTests.length === 0}
                >
                  Ø§Ø¹ØªÙ…Ø§Ø¯ Ø·Ù„Ø¨ Ø§Ù„Ù…Ø®ØªØ¨Ø±
                </Button>
              </div>
            )
          },
          {
            key: '2',
            label: <span><CameraOutlined /> Ø·Ù„Ø¨ Ø£Ø´Ø¹Ø©</span>,
            children: (
              <div className="space-y-4">
                <Select
                  mode="multiple"
                  style={{ width: '100%' }}
                  placeholder="Ø§Ø®ØªØ± Ø§Ù„ÙØ­ÙˆØµØ§Øª Ø§Ù„ØªØµÙˆÙŠØ±ÙŠØ© Ø§Ù„Ù…Ø·Ù„ÙˆØ¨Ø©..."
                  value={selectedRads}
                  onChange={setSelectedRads}
                  options={radTypes.map(t => ({ label: t.name, value: t.id }))}
                />
                <Button 
                  type="primary" 
                  block 
                  icon={<PlusOutlined />} 
                  onClick={() => placeOrders('radiology')}
                  loading={loading}
                  disabled={selectedRads.length === 0}
                >
                  Ø§Ø¹ØªÙ…Ø§Ø¯ Ø·Ù„Ø¨ Ø§Ù„Ø£Ø´Ø¹Ø©
                </Button>
              </div>
            )
          },
          {
            key: '4',
            label: <span><HeartOutlined /> Ø¨Ù†Ùƒ Ø§Ù„Ø¯Ù…</span>,
            children: (
              <div className="flex gap-2">
                <Select className="flex-1" value={bloodRequest.type} onChange={v => setBloodRequest({...bloodRequest, type: v})}>
                  {['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'].map(t => <Option key={t} value={t}>{t}</Option>)}
                </Select>
                <InputNumber min={1} value={bloodRequest.units} onChange={v => setBloodRequest({...bloodRequest, units: v || 1})} />
                <Button danger icon={<PlusOutlined />} onClick={requestBlood} loading={loading}>Ø·Ù„Ø¨ Ø¯Ù…</Button>
              </div>
            )
          },
          {
            key: '5',
            label: <span><ToolOutlined /> Ø·Ù„Ø¨ Ø¬Ø±Ø§Ø­Ø©</span>,
            children: (
              <div className="space-y-3">
                <Input 
                    placeholder="Ø§Ø³Ù… Ø§Ù„Ø¹Ù…Ù„ÙŠØ© Ø§Ù„Ø¬Ø±Ø§Ø­ÙŠØ©..." 
                    value={surgeryRequest.name} 
                    onChange={e => setSurgeryRequest({...surgeryRequest, name: e.target.value})} 
                />
                <DatePicker showTime className="w-full" placeholder="Ù…ÙˆØ¹Ø¯ Ø§Ù„Ø¹Ù…Ù„ÙŠØ© Ø§Ù„Ù…Ù‚ØªØ±Ø­" onChange={v => setSurgeryRequest({...surgeryRequest, date: v})} />
                <Button type="primary" block icon={<PlusOutlined />} onClick={requestSurgery} loading={loading}>ØªØ£ÙƒÙŠØ¯ Ø·Ù„Ø¨ Ø§Ù„Ø¬Ø±Ø§Ø­Ø©</Button>
              </div>
            )
          },
          {
            key: '3',
            label: <span><MedicineBoxOutlined /> Ø®Ø¯Ù…Ø§Øª ØªÙ…Ø±ÙŠØ¶ÙŠØ©</span>,
            children: (
              <div className="space-y-4">
                <div className="bg-slate-50 p-4 rounded-xl border space-y-3">
                  <h4 className="font-bold text-xs text-slate-500 m-0">Ø·Ù„Ø¨ Ø®Ø¯Ù…Ø© ØªÙ…Ø±ÙŠØ¶ÙŠØ© Ø¬Ø¯ÙŠØ¯Ø©:</h4>
                  <div className="grid grid-cols-2 gap-2">
                    <Select 
                      className="w-full" 
                      value={newNursingTask.type} 
                      onChange={v => setNewNursingTask({...newNursingTask, type: v})}
                    >
                      <Option value="dressing">ðŸ©¹ ØºÙŠØ§Ø± Ø¹Ù„Ù‰ Ø¬Ø±Ø­</Option>
                      <Option value="medication">ðŸ’Š Ø¥Ø¹Ø·Ø§Ø¡ Ø¯ÙˆØ§Ø¡ / Ù…Ø­Ø§Ù„ÙŠÙ„</Option>
                      <Option value="vitals">ðŸŒ¡ï¸ Ù‚ÙŠØ§Ø³ Ø¹Ù„Ø§Ù…Ø§Øª Ø­ÙŠÙˆÙŠØ©</Option>
                      <Option value="lab_collection">ðŸ§ª Ø³Ø­Ø¨ Ø¹ÙŠÙ†Ø© Ù…Ø®ØªØ¨Ø±</Option>
                      <Option value="custom">âš™ï¸ Ø£Ø®Ø±Ù‰ / Ø·Ù„Ø¨ Ù…Ø®ØµØµ</Option>
                    </Select>
                    
                    <Select 
                      className="w-full" 
                      value={newNursingTask.priority} 
                      onChange={v => setNewNursingTask({...newNursingTask, priority: v})}
                    >
                      <Option value="normal">ðŸ”µ Ø¹Ø§Ø¯ÙŠ</Option>
                      <Option value="urgent">ðŸŸ  Ø¹Ø§Ø¬Ù„</Option>
                      <Option value="emergency">ðŸ”´ Ø­Ø±Ø¬ Ø¬Ø¯Ø§Ù‹</Option>
                    </Select>
                  </div>
                  
                  <Input 
                    placeholder="Ø§ÙƒØªØ¨ ØªÙØ§ØµÙŠÙ„ Ø§Ù„Ø¥Ø¬Ø±Ø§Ø¡ Ø§Ù„Ù…Ø·Ù„ÙˆØ¨Ø©..." 
                    value={newNursingTask.description}
                    onChange={e => setNewNursingTask({...newNursingTask, description: e.target.value})}
                  />
                  
                  <Button 
                    type="primary" 
                    block 
                    icon={<PlusOutlined />} 
                    onClick={requestNursingService}
                    loading={loading}
                  >
                    Ø¥Ø±Ø³Ø§Ù„ Ø§Ù„Ø·Ù„Ø¨ Ù„Ù…Ø­Ø·Ø© Ø§Ù„ØªÙ…Ø±ÙŠØ¶
                  </Button>
                </div>

                <div>
                  <h4 className="font-bold text-xs text-slate-500 mb-2">Ø§Ù„Ø®Ø¯Ù…Ø§Øª Ø§Ù„ØªÙ…Ø±ÙŠØ¶ÙŠØ© Ø§Ù„Ù…Ø·Ù„ÙˆØ¨Ø© Ø³Ø§Ø¨Ù‚Ø§Ù‹:</h4>
                  <Table 
                    dataSource={nursingTasks}
                    rowKey="id"
                    size="small"
                    pagination={{ pageSize: 4 }}
                    columns={[
                      { 
                        title: 'Ø§Ù„Ù†ÙˆØ¹', 
                        dataIndex: 'task_type', 
                        render: (t) => {
                          const labels: Record<string, string> = {
                            dressing: 'ØºÙŠØ§Ø± Ø¬Ø±ÙˆØ­',
                            medication: 'Ø£Ø¯ÙˆÙŠØ©/Ù…Ø­Ø§Ù„ÙŠÙ„',
                            vitals: 'Ø¹Ù„Ø§Ù…Ø§Øª Ø­ÙŠÙˆÙŠØ©',
                            lab_collection: 'Ø³Ø­Ø¨ Ø¹ÙŠÙ†Ø©',
                            custom: 'Ø£Ø®Ø±Ù‰'
                          };
                          return labels[t] || t;
                        } 
                      },
                      { title: 'Ø§Ù„Ø¨ÙŠØ§Ù†/Ø§Ù„ÙˆØµÙ', dataIndex: 'description' },
                      { 
                        title: 'Ø§Ù„Ø£ÙˆÙ„ÙˆÙŠØ©', 
                        dataIndex: 'priority', 
                        render: (p) => (
                          <Tag color={p === 'emergency' ? 'red' : p === 'urgent' ? 'orange' : 'blue'}>
                            {p === 'emergency' ? 'Ø­Ø±Ø¬' : p === 'urgent' ? 'Ø¹Ø§Ø¬Ù„' : 'Ø¹Ø§Ø¯ÙŠ'}
                          </Tag>
                        ) 
                      },
                      { 
                        title: 'Ø§Ù„Ø­Ø§Ù„Ø©', 
                        dataIndex: 'status',
                        render: (s) => (
                          <Tag color={s === 'completed' ? 'green' : 'gold'}>
                            {s === 'completed' ? 'ØªÙ… Ø§Ù„ØªÙ†ÙÙŠØ°' : 'Ù…Ø¹Ù„Ù‚'}
                          </Tag>
                        )
                      }
                    ]}
                  />
                </div>
              </div>
            )
          }
        ]}
      />
    </Card>
  );
};

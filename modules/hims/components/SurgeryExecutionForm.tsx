import React, { useState, useEffect } from 'react';
import { Modal, Form, Select, InputNumber, Button, Space, Table, Typography, message, Input } from 'antd';
import { supabase } from '@/supabaseClient';
import { SaveOutlined, PlusOutlined, DeleteOutlined, BarcodeOutlined } from '@ant-design/icons';
import { useAuth } from '@/context/AuthContext';

interface Props {
  surgeryId: string;
  visible: boolean;
  onCancel: () => void;
  onSuccess: () => void;
}

export const SurgeryExecutionForm: React.FC<Props> = ({ surgeryId, visible, onCancel, onSuccess }) => {
  const { currentUser } = useAuth();
  const [products, setProducts] = useState<any[]>([]);
  const [warehouses, setWarehouses] = useState<any[]>([]);
  const [selectedWarehouse, setSelectedWarehouse] = useState<string | null>(null);
  const [barcodeInput, setBarcodeInput] = useState('');
  const [consumables, setConsumables] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      if (!currentUser?.organization_id) return;
      
      // جلب المستودعات والمنتجات في وقت واحد لتحسين الأداء (SaaS logic)
      const [whRes, prdRes] = await Promise.all([
        supabase.from('warehouses').select('id, name').eq('organization_id', currentUser.organization_id),
        supabase.from('products').select('id, name, stock, barcode, sku').eq('organization_id', currentUser.organization_id).gt('stock', 0)
      ]);

      setWarehouses(whRes.data || []);
      if (whRes.data && whRes.data.length > 0) setSelectedWarehouse(whRes.data[0].id);
      setProducts(prdRes.data || []);
    };

    if (visible) fetchData();
  }, [visible, currentUser]);

  const addConsumable = (productId: string) => {
    const product = products.find(p => p.id === productId);
    if (!product) return;

    // ذكاء برمجي: إذا كان الصنف مضافاً مسبقاً، نكتفي بزيادة الكمية
    const existing = consumables.find(c => c.product_id === productId);
    if (existing) {
      setConsumables(consumables.map(c => 
        c.product_id === productId ? { ...c, qty: c.qty + 1 } : c
      ));
    } else {
      setConsumables([...consumables, { product_id: product.id, name: product.name, qty: 1 }]);
    }
  };

  const handleBarcodeSubmit = () => {
    const code = barcodeInput.trim();
    if (!code) return;
    
    const product = products.find(p => p.barcode === code || p.sku === code);
    if (product) {
      addConsumable(product.id);
      setBarcodeInput('');
    } else {
      message.error('عذراً، لم يتم العثور على صنف بهذا الباركود أو الكود المرجعي ❌');
    }
  };

  const handleFinishSurgery = async () => {
    if (consumables.length === 0) return message.warning('يرجى إضافة المستلزمات المستهلكة أولاً');
    if (!selectedWarehouse) return message.error('يرجى تحديد مستودع الصرف (المستلزمات الطبية) لضمان دقة المخزون ⚠️');

    // 🛡️ درع حماية: التأكد من صحة UUID العملية لمنع أخطاء الـ RPC 400
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(surgeryId)) return message.error('عذراً، معرف العملية الجراحية غير صالح');

    setLoading(true);
    // استدعاء الـ RPC لخصم المخزون وإنهاء العملية محاسبياً
    const { error } = await supabase.rpc('hims_complete_surgery_and_consume', {
      p_surgery_id: surgeryId,
      p_warehouse_id: selectedWarehouse,
      p_consumables: consumables.map(c => ({ product_id: c.product_id, qty: c.qty }))
    });

    if (error) {
      message.error('فشل إنهاء العملية: ' + error.message);
    } else {
      message.success('تم إنهاء العملية وصرف المستهلكات وتحديث المخزن بنجاح ✅');
      onSuccess();
    }
    setLoading(false);
  };

  return (
    <Modal
      title={<b>إنهاء العملية وصرف المستهلكات الطبية 💉</b>}
      open={visible}
      onCancel={onCancel}
      width={700}
      footer={[
        <Button key="cancel" onClick={onCancel}>إلغاء</Button>,
        <Button key="submit" type="primary" icon={<SaveOutlined />} onClick={handleFinishSurgery} loading={loading} className="bg-emerald-600">
          اعتماد إنهاء العملية وخصم المخزن
        </Button>
      ]}
    >
      <div className="space-y-4 pt-2">
        <div>
          <Typography.Text strong className="text-indigo-700">مستودع الصرف المعتمد:</Typography.Text>
          <Select
            className="w-full mt-1"
            value={selectedWarehouse}
            onChange={setSelectedWarehouse}
            options={warehouses.map(w => ({ label: w.name, value: w.id }))}
            placeholder="اختر المستودع الطبي"
          />
        </div>

        <div className="bg-indigo-50 p-4 rounded-2xl border border-indigo-100">
          <Typography.Text strong className="text-indigo-800"><BarcodeOutlined /> الصرف السريع بالباركود (سرعة ودقة):</Typography.Text>
          <Input 
            autoFocus 
            placeholder="وجه ماسح الباركود هنا لإضافة المستلزم فوراً..." 
            className="mt-2 rounded-lg h-10 font-bold border-indigo-300"
            value={barcodeInput}
            onChange={e => setBarcodeInput(e.target.value)}
            onPressEnter={handleBarcodeSubmit}
          />
        </div>

        <Typography.Text strong>إضافة مستلزم (شاش، خيوط، أدوات تخدير...):</Typography.Text>
        <Select
          showSearch
          placeholder="ابحث عن صنف في المخزن..."
          style={{ width: '100%' }}
          onChange={addConsumable}
          filterOption={(input, option) => (option?.label ?? '').includes(input)}
          options={products.map(p => ({ label: `${p.name} (المتوفر: ${p.stock})${p.barcode ? ` - [${p.barcode}]` : ''}`, value: p.id }))}
        />

        <Table
          dataSource={consumables}
          rowKey="product_id"
          pagination={false}
          columns={[
            { title: 'الصنف', dataIndex: 'name' },
            { 
              title: 'الكمية المستهلكة', 
              render: (_, record, idx) => (
                <InputNumber 
                  min={1} 
                  value={record.qty} 
                  onChange={(val) => {
                    const newC = [...consumables];
                    newC[idx].qty = val;
                    setConsumables(newC);
                  }} 
                />
              ) 
            },
            { title: 'إجراء', render: (_, __, idx) => <Button danger icon={<DeleteOutlined />} onClick={() => setConsumables(consumables.filter((_, i) => i !== idx))} /> }
          ]}
        />
      </div>
    </Modal>
  );
};
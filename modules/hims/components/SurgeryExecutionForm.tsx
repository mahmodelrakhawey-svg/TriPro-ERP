import React, { useState, useEffect } from 'react';
import { Modal, Form, Select, InputNumber, Button, Space, Table, Typography, message } from 'antd';
import { supabase } from '@/supabaseClient';
import { SaveOutlined, PlusOutlined, DeleteOutlined } from '@ant-design/icons';
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
  const [consumables, setConsumables] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const fetchMedicalSupplies = async () => {
      // جلب الأصناف من المخزن الطبي فقط
      const { data } = await supabase
        .from('products')
        .select('id, name, stock, sales_price') // تأكدنا من المطابقة مع DB
        .eq('organization_id', currentUser?.organization_id)
        .gt('stock', 0);
      setProducts(data || []);
    };
    if (visible) fetchMedicalSupplies();
  }, [visible]);

  const addConsumable = (productId: string) => {
    const product = products.find(p => p.id === productId);
    if (!product) return;
    setConsumables([...consumables, { product_id: product.id, name: product.name, qty: 1 }]);
  };

  const handleFinishSurgery = async () => {
    if (consumables.length === 0) {
      message.warning('يرجى إضافة المستلزمات المستهلكة أولاً');
      return;
    }

    setLoading(true);
    // استدعاء الـ RPC لخصم المخزون وإنهاء العملية محاسبياً
    const { error } = await supabase.rpc('hims_complete_surgery_and_consume', {
      p_surgery_id: surgeryId,
      p_warehouse_id: '00000000-0000-0000-0000-000000000000', // معرف المخزن الرئيسي للعمليات
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
      <div className="space-y-4 pt-4">
        <Typography.Text strong>إضافة مستلزم (شاش، خيوط، أدوات تخدير...):</Typography.Text>
        <Select
          showSearch
          placeholder="ابحث عن صنف في المخزن..."
          style={{ width: '100%' }}
          onChange={addConsumable}
          filterOption={(input, option) => (option?.label ?? '').includes(input)}
          options={products.map(p => ({ label: `${p.name} (المتوفر: ${p.stock})`, value: p.id }))}
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
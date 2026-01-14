﻿import React, { useState } from 'react';
import { useAccounting } from '../../context/AccountingContext';
import { Warehouse, Plus, MapPin, Trash2, Edit2, Save, X, User, Phone } from 'lucide-react';

const WarehouseManager = () => {
  const { warehouses, addWarehouse, updateWarehouse, deleteWarehouse, currentUser } = useAccounting();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState({ name: '', location: '', manager: '', phone: '' });

  const handleOpenModal = (warehouse?: any) => {
    if (warehouse) {
      setEditingId(warehouse.id);
      setFormData({ name: warehouse.name, location: warehouse.location || '', manager: warehouse.manager || '', phone: warehouse.phone || '' });
    } else {
      setEditingId(null);
      setFormData({ name: '', location: '', manager: '', phone: '' });
    }
    setIsModalOpen(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (currentUser?.role === 'demo') {
        alert('تم الحفظ (محاكاة)');
        setIsModalOpen(false);
        return;
    }
    if (editingId) {
      updateWarehouse(editingId, formData);
    } else {
      addWarehouse(formData);
    }
    setIsModalOpen(false);
  };

  const handleDelete = (id: string) => {
      if (currentUser?.role === 'demo') { alert('الحذف غير متاح في الديمو'); return; }
      if(window.confirm('هل أنت متأكد؟')) deleteWarehouse(id);
  }

  return (
    <div className="space-y-6 animate-in fade-in">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
            <Warehouse className="text-blue-600" /> إدارة الفروع والمستودعات
          </h2>
          <p className="text-slate-500">تعريف أماكن تخزين البضاعة ونقاط البيع</p>
        </div>
        <button onClick={() => handleOpenModal()} className="bg-blue-600 text-white px-4 py-2 rounded-lg flex items-center gap-2 hover:bg-blue-700">
          <Plus size={20} /> إضافة مستودع/فرع
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {warehouses.map(warehouse => (
          <div key={warehouse.id} className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 hover:shadow-md transition-all">
            <div className="flex justify-between items-start mb-4">
              <div className="p-3 bg-blue-50 rounded-lg text-blue-600">
                <Warehouse size={24} />
              </div>
              <div className="flex gap-2">
                <button onClick={() => handleOpenModal(warehouse)} className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg"><Edit2 size={16} /></button>
                <button onClick={() => handleDelete(warehouse.id)} className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg"><Trash2 size={16} /></button>
              </div>
            </div>
            <h3 className="text-lg font-bold text-slate-800 mb-1">{warehouse.name}</h3>
            <div className="space-y-2 mt-3 pt-3 border-t border-slate-50">
                <div className="flex items-center gap-2 text-slate-500 text-sm">
                    <MapPin size={14} />
                    <span>{warehouse.location || 'لا يوجد عنوان محدد'}</span>
                </div>
                <div className="flex items-center gap-2 text-slate-500 text-sm">
                    <User size={14} />
                    <span>أمين المستودع: {warehouse.manager || 'غير محدد'}</span>
                </div>
                {warehouse.phone && <div className="flex items-center gap-2 text-slate-500 text-sm"><Phone size={14} /> <span dir="ltr">{warehouse.phone}</span></div>}
            </div>
          </div>
        ))}
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md overflow-hidden">
            <div className="bg-slate-50 px-6 py-4 border-b flex justify-between items-center">
              <h3 className="font-bold text-lg">{editingId ? 'تعديل بيانات المستودع' : 'إضافة مستودع جديد'}</h3>
              <button onClick={() => setIsModalOpen(false)}><X className="text-slate-400 hover:text-red-500" /></button>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-1">اسم المستودع / الفرع</label>
                <input required type="text" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} className="w-full border rounded-lg p-2.5" placeholder="مثال: المستودع الرئيسي" />
              </div>
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-1">العنوان / الموقع</label>
                <input type="text" value={formData.location} onChange={e => setFormData({...formData, location: e.target.value})} className="w-full border rounded-lg p-2.5" placeholder="المدينة، الحي..." />
              </div>
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-1">أمين المستودع</label>
                <input type="text" value={formData.manager} onChange={e => setFormData({...formData, manager: e.target.value})} className="w-full border rounded-lg p-2.5" placeholder="اسم المسؤول" />
              </div>
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-1">رقم الهاتف</label>
                <input type="text" value={formData.phone} onChange={e => setFormData({...formData, phone: e.target.value})} className="w-full border rounded-lg p-2.5" placeholder="05xxxxxxxx" />
              </div>
              <button type="submit" className="w-full bg-blue-600 text-white py-3 rounded-lg font-bold hover:bg-blue-700 flex justify-center items-center gap-2">
                <Save size={18} /> حفظ البيانات
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default WarehouseManager;

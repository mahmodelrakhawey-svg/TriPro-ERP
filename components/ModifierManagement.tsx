import React, { useState, useEffect } from 'react';
import { modifierService } from '../services/modifierService';
import { ModifierGroup, Modifier } from '../types';
import { Plus, Trash2, X, Save, Loader2, DollarSign, Layers, GripVertical, Copy } from 'lucide-react';
import { useToast } from '../context/ToastContext';
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, DragEndEvent } from '@dnd-kit/core';
import { arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { CopyModifiersModal } from './CopyModifiersModal';

interface ModifierManagementProps {
  productId: string;
  productName: string;
  onClose: () => void;
}

// --- مكونات فرعية (Sub-components) لحل مشكلة Hooks ---

const SortableRow = ({ mod, children }: { mod: Modifier, children: React.ReactNode }) => {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: mod.id });
  const style = { transform: CSS.Transform.toString(transform), transition };
  return <tr ref={setNodeRef} style={style} {...attributes} {...listeners}>{children}</tr>;
};

interface SortableGroupProps {
  group: ModifierGroup;
  newModifiers: Record<string, { name: string; unit_price: string; cost: string }>;
  setNewModifiers: React.Dispatch<React.SetStateAction<Record<string, { name: string; unit_price: string; cost: string }>>>;
  onUpdateGroup: (id: string, updates: Partial<ModifierGroup>) => void;
  onDeleteGroup: (id: string) => void;
  onAddModifier: (groupId: string) => void;
  onUpdateModifier: (mod: Modifier, field: 'unit_price' | 'cost', value: string) => void;
  onDeleteModifier: (id: string) => void;
}

const SortableGroup: React.FC<SortableGroupProps> = ({ 
  group, 
  newModifiers, 
  setNewModifiers, 
  onUpdateGroup, 
  onDeleteGroup, 
  onAddModifier, 
  onUpdateModifier, 
  onDeleteModifier 
}) => {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: group.id });
  const style = { transform: CSS.Transform.toString(transform), transition };

  return (
    <div ref={setNodeRef} style={style} className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="bg-slate-100 p-3 border-b border-slate-200">
        <div className="flex justify-between items-center mb-3">
          <div className="flex items-center gap-2 flex-1">
            <button {...attributes} {...listeners} className="cursor-grab p-1 text-slate-400 hover:text-slate-700"><GripVertical size={20} /></button>
            <input 
              type="text" 
              defaultValue={group.name}
              onBlur={(e) => onUpdateGroup(group.id, { name: e.target.value })}
              className="font-bold text-slate-800 bg-transparent border border-transparent hover:border-slate-300 focus:border-blue-500 rounded px-1 outline-none w-full"
            />
          </div>
          <button onClick={() => onDeleteGroup(group.id)} className="text-red-500 hover:bg-red-100 p-1 rounded"><Trash2 size={16} /></button>
        </div>
        
        {/* Group Settings Controls */}
        <div className="flex flex-wrap gap-4 text-sm items-center pr-8">
          <label className="flex items-center gap-1.5 cursor-pointer select-none bg-white px-2 py-1 rounded border border-slate-200 hover:border-blue-400 transition-colors">
              <input 
                type="checkbox" 
                checked={group.is_required} 
                onChange={e => onUpdateGroup(group.id, { is_required: e.target.checked })} 
                className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500 cursor-pointer"
              />
              <span className={`font-medium ${group.is_required ? 'text-blue-700' : 'text-slate-600'}`}>إجباري (مطلوب)</span>
          </label>

          <div className="flex items-center gap-2">
              <span className="text-slate-500 font-medium">النوع:</span>
              <select 
                value={group.selection_type} 
                onChange={e => onUpdateGroup(group.id, { selection_type: e.target.value as 'SINGLE' | 'MULTIPLE' })} 
                className="border border-slate-300 rounded px-2 py-1 text-xs bg-white focus:border-blue-500 outline-none font-bold text-slate-700"
              >
                <option value="MULTIPLE">متعدد (أكثر من خيار)</option>
                <option value="SINGLE">اختيار واحد فقط</option>
              </select>
          </div>

          {group.selection_type === 'MULTIPLE' && (
            <div className="flex items-center gap-2">
                <span className="text-slate-500 font-medium">الحد الأقصى:</span>
                <input 
                  type="number" 
                  value={group.max_selection || ''} 
                  onChange={e => {
                    const val = parseInt(e.target.value);
                    onUpdateGroup(group.id, { max_selection: isNaN(val) ? null : val });
                  }} 
                  placeholder="بلا"
                  className="w-16 border border-slate-300 rounded px-2 py-1 text-xs focus:border-blue-500 outline-none text-center font-bold"
                />
            </div>
          )}
        </div>
      </div>
      
      <div className="p-4">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-slate-500 border-b">
              <th className="text-right pb-2 font-medium w-10"></th>
              <th className="text-right pb-2 font-medium">اسم الخيار</th>
              <th className="text-center pb-2 font-medium w-24">سعر البيع</th>
              <th className="text-center pb-2 font-medium w-24 text-red-600">التكلفة</th>
              <th className="w-10"></th>
            </tr>
          </thead>
          <SortableContext items={group.modifiers.map(m => m.id)} strategy={verticalListSortingStrategy}>
            <tbody className="divide-y">
              {group.modifiers.map(mod => (
                <SortableRow key={mod.id} mod={mod}>
                  <td className="py-2"><button className="cursor-grab p-2 text-slate-400"><GripVertical size={16} /></button></td>
                  <td className="py-2 font-bold text-slate-700">{mod.name}</td>
                  <td className="py-2 text-center">
                    <input type="number" className="w-20 text-center border rounded p-1 focus:ring-1 focus:ring-blue-500" defaultValue={mod.unit_price} onBlur={(e) => onUpdateModifier(mod, 'unit_price', e.target.value)} />
                  </td>
                  <td className="py-2 text-center">
                    <input type="number" className="w-20 text-center border border-red-200 bg-red-50 rounded p-1 focus:ring-1 focus:ring-red-500 text-red-700 font-bold" defaultValue={mod.cost} onBlur={(e) => onUpdateModifier(mod, 'cost', e.target.value)} />
                  </td>
                  <td className="py-2 text-center">
                    <button onClick={() => onDeleteModifier(mod.id)} className="text-slate-300 hover:text-red-500"><Trash2 size={16} /></button>
                  </td>
                </SortableRow>
              ))}
            </tbody>
          </SortableContext>
          <tbody>
            {/* Add New Modifier Row */}
            <tr className="bg-blue-50/50">
              <td></td>
              <td className="py-2 pl-2">
                <input type="text" placeholder="خيار جديد..." className="w-full border rounded p-1 text-sm" value={newModifiers[group.id]?.name || ''} onChange={e => setNewModifiers(prev => ({ ...prev, [group.id]: { ...prev[group.id], name: e.target.value } }))} />
              </td>
              <td className="py-2 text-center px-1">
                <input type="number" placeholder="0" className="w-20 text-center border rounded p-1 text-sm" value={newModifiers[group.id]?.unit_price || ''} onChange={e => setNewModifiers(prev => ({ ...prev, [group.id]: { ...prev[group.id], unit_price: e.target.value } }))} />
              </td>
              <td className="py-2 text-center px-1">
                <input type="number" placeholder="0" className="w-20 text-center border border-red-200 rounded p-1 text-sm" value={newModifiers[group.id]?.cost || ''} onChange={e => setNewModifiers(prev => ({ ...prev, [group.id]: { ...prev[group.id], cost: e.target.value } }))} />
              </td>
              <td className="py-2 text-center">
                <button onClick={() => onAddModifier(group.id)} className="bg-blue-600 text-white p-1 rounded hover:bg-blue-700"><Plus size={16} /></button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
};

export const ModifierManagement: React.FC<ModifierManagementProps> = ({ productId, productName, onClose }) => {
  const { showToast } = useToast();
  const [groups, setGroups] = useState<ModifierGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [newGroupName, setNewGroupName] = useState('');
  
  // حالة لتخزين البيانات الجديدة للإضافات (Key: group_id)
  const [newModifiers, setNewModifiers] = useState<Record<string, { name: string; unit_price: string; cost: string }>>({});
  const [isCopyModalOpen, setIsCopyModalOpen] = useState(false);
  const [isAddingGroup, setIsAddingGroup] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  useEffect(() => {
    loadData();
  }, [productId]);

  const loadData = async () => {
    setLoading(true);
    try {
      const data = await modifierService.getModifiersForProduct(productId);
      setGroups(data);
    } catch (error) {
      showToast('فشل تحميل الإضافات', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleAddGroup = async () => {
    if (!newGroupName.trim()) {
      showToast('الرجاء كتابة اسم المجموعة أولاً', 'warning');
      return;
    }
    setIsAddingGroup(true);
    try {
      await modifierService.createModifierGroup({
        product_id: productId,
        name: newGroupName,
        selection_type: 'MULTIPLE',
        min_selection: 0,
        is_required: false
      });
      setNewGroupName('');
      await loadData();
      showToast('تم إضافة المجموعة بنجاح', 'success');
    } catch (error: any) {
      console.error("Detailed Add Group Error:", error);
      showToast('فشل إضافة المجموعة. السبب: ' + (error.message || 'خطأ غير معروف. تأكد من تطبيق سياسات الأمان RLS.'), 'error');
    } finally {
      setIsAddingGroup(false);
    }
  };

  const handleDeleteGroup = async (id: string) => {
    if (!window.confirm('هل أنت متأكد من حذف هذه المجموعة وكل خياراتها؟')) return;
    try {
      await modifierService.deleteModifierGroup(id);
      loadData();
      showToast('تم الحذف بنجاح', 'success');
    } catch (error) {
      showToast('خطأ في الحذف', 'error');
    }
  };

  const handleAddModifier = async (groupId: string) => {
    const modifierData = newModifiers[groupId];
    if (!modifierData?.name) return;

    try {
      await modifierService.createModifier({
        modifier_group_id: groupId,
        name: modifierData.name,
        unit_price: parseFloat(modifierData.unit_price) || 0,
        cost: parseFloat(modifierData.cost) || 0, // هنا يتم حفظ التكلفة
        is_default: false
      });
      
      setNewModifiers(prev => ({ ...prev, [groupId]: { name: '', unit_price: '', cost: '' } }));
      loadData();
      showToast('تم إضافة الخيار بنجاح', 'success');
    } catch (error) {
      showToast('خطأ في إضافة الخيار', 'error');
    }
  };

  const handleUpdateModifier = async (mod: Modifier, field: 'unit_price' | 'cost', value: string) => {
    const numValue = parseFloat(value) || 0;
    try {
      await modifierService.updateModifier(mod.id, { [field]: numValue });
      // تحديث الحالة محلياً لتجنب إعادة التحميل الكامل
      setGroups(prev => prev.map(g => ({
        ...g,
        modifiers: g.modifiers.map(m => m.id === mod.id ? { ...m, [field]: numValue } : m)
      })));
    } catch (error) {
      showToast('فشل التحديث', 'error');
    }
  };

  const handleDeleteModifier = async (id: string) => {
    if (!window.confirm('حذف هذا الخيار؟')) return;
    try {
      await modifierService.deleteModifier(id);
      loadData();
    } catch (error) {
      showToast('خطأ في الحذف', 'error');
    }
  };

  const handleUpdateGroup = async (id: string, updates: Partial<ModifierGroup>) => {
    try {
      await modifierService.updateModifierGroup(id, updates);
      setGroups(prev => prev.map(g => g.id === id ? { ...g, ...updates } : g));
    } catch (error) {
      showToast('فشل تحديث خصائص المجموعة', 'error');
    }
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      const isGroupDrag = groups.some(g => g.id === active.id);
      
      if (isGroupDrag) {
        setGroups((items) => {
          const oldIndex = items.findIndex(item => item.id === active.id);
          const newIndex = items.findIndex(item => item.id === over.id);
          const newOrder = arrayMove(items, oldIndex, newIndex);
          const updates = newOrder.map((g, index) => ({ id: g.id, display_order: index }));
          modifierService.bulkUpdateDisplayOrder('modifier_groups', updates).catch(() => showToast('فشل تحديث ترتيب المجموعات', 'error'));
          return newOrder;
        });
      } else {
        setGroups((currentGroups) => {
          const activeGroup = currentGroups.find(g => g.modifiers.some(m => m.id === active.id));
          const overGroup = currentGroups.find(g => g.modifiers.some(m => m.id === over.id));

          if (activeGroup && overGroup && activeGroup.id === overGroup.id) {
            const oldIndex = activeGroup.modifiers.findIndex(m => m.id === active.id);
            const newIndex = activeGroup.modifiers.findIndex(m => m.id === over.id);
            
            const reorderedModifiers = arrayMove(activeGroup.modifiers, oldIndex, newIndex);
            const updates = reorderedModifiers.map((m, index) => ({ id: m.id, display_order: index }));
            modifierService.bulkUpdateDisplayOrder('modifiers', updates).catch(() => showToast('فشل تحديث ترتيب الخيارات', 'error'));

            return currentGroups.map(g => 
              g.id === activeGroup.id ? { ...g, modifiers: reorderedModifiers } : g
            );
          }
          return currentGroups;
        });
      }
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-[100] flex items-center justify-center p-4 backdrop-blur-sm" dir="rtl">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden animate-in zoom-in-95">
        {/* Header */}
        <div className="p-4 border-b flex justify-between items-center bg-slate-50">
          <div>
            <h3 className="font-bold text-lg text-slate-800 flex items-center gap-2">
              <Layers size={20} className="text-blue-600" /> إدارة إضافات وتكاليف: {productName}
            </h3>
            <p className="text-xs text-slate-500">قم بتعريف الإضافات وتحديد تكلفتها لخصمها من المخزون وحساب الأرباح</p>
          </div>
          <div className="flex items-center gap-4">
            <button 
              onClick={() => setIsCopyModalOpen(true)}
              className="text-sm font-bold text-purple-600 bg-purple-50 border border-purple-200 px-3 py-1.5 rounded-lg hover:bg-purple-100 flex items-center gap-2"
            >
              <Copy size={16} /> نسخ من منتج آخر
            </button>
            <button onClick={onClose} className="text-slate-400 hover:text-red-500"><X size={24} /></button>
          </div>
        </div>

        {/* Body */}
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <div className="flex-1 overflow-y-auto p-6 bg-slate-50 space-y-6">
          
          {/* Add Group Section */}
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex gap-3 items-end">
            <div className="flex-1">
              <label className="block text-sm font-bold text-slate-700 mb-1">اسم المجموعة الجديدة</label>
              <input 
                type="text" 
                placeholder="مثال: الحجم، الإضافات، نوع الخبز..." 
                className="w-full border rounded-lg p-2 outline-none focus:ring-2 focus:ring-blue-500"
                value={newGroupName}
                onChange={e => setNewGroupName(e.target.value)}
              />
            </div>
            <button 
              onClick={handleAddGroup} 
              disabled={isAddingGroup}
              className={`bg-blue-600 text-white px-4 py-2 rounded-lg font-bold hover:bg-blue-700 flex items-center gap-2 h-[42px] ${isAddingGroup ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              {isAddingGroup ? <Loader2 size={18} className="animate-spin" /> : <Plus size={18} />} إضافة مجموعة
            </button>
          </div>

          {/* Groups List */}
          {loading ? (
            <div className="text-center py-10"><Loader2 className="animate-spin mx-auto text-blue-600" /></div>
          ) : groups.length === 0 ? (
            <div className="text-center text-slate-400 py-10">لا توجد مجموعات إضافات لهذا الصنف</div>
          ) : (
            <SortableContext items={groups.map(g => g.id)} strategy={verticalListSortingStrategy}>
              {groups.map(group => (
                <SortableGroup 
                  key={group.id} 
                  group={group}
                  newModifiers={newModifiers}
                  setNewModifiers={setNewModifiers}
                  onUpdateGroup={handleUpdateGroup}
                  onDeleteGroup={handleDeleteGroup}
                  onAddModifier={handleAddModifier}
                  onUpdateModifier={handleUpdateModifier}
                  onDeleteModifier={handleDeleteModifier}
                />
              ))}
            </SortableContext>
          )}
          </div>
        </DndContext>

        <div className="p-4 border-t bg-white flex justify-end">
          <button onClick={onClose} className="px-6 py-2 bg-slate-100 text-slate-600 font-bold rounded-lg hover:bg-slate-200">إغلاق</button>
        </div>
        {isCopyModalOpen && (
          <CopyModifiersModal
            isOpen={isCopyModalOpen}
            onClose={() => setIsCopyModalOpen(false)}
            targetProduct={{ id: productId, name: productName }}
            onSuccess={() => {
              loadData(); // Reload data to show the copied modifiers
            }}
          />
        )}
      </div>
    </div>
  );
};
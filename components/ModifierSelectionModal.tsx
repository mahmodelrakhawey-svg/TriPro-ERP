import React, { useState, useEffect, useMemo } from 'react';
import { ModifierGroup, Modifier, SelectedModifier } from '../types';
import { modifierService } from '../services/modifierService';

interface ModifierSelectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  product: { id: string; name: string; price: number; cost: number };
  onConfirm: (selectedModifiers: SelectedModifier[], totalPrice: number, totalUnitCost: number, notes: string) => void;
}

export const ModifierSelectionModal: React.FC<ModifierSelectionModalProps> = ({
  isOpen,
  onClose,
  product,
  onConfirm,
}) => {
  const [groups, setGroups] = useState<ModifierGroup[]>([]);
  const [selections, setSelections] = useState<Record<string, SelectedModifier[]>>({});
  const [loading, setLoading] = useState(false);
  const [notes, setNotes] = useState('');

  useEffect(() => {
    if (isOpen && product.id) {
      setLoading(true);
      modifierService.getModifiersForProduct(product.id)
        .then(data => {
          setGroups(data);
          const defaults: Record<string, SelectedModifier[]> = {};
          data.forEach(g => {
            const defs = g.modifiers.filter(m => m.is_default).map(m => ({ modifierId: m.id, name: m.name, unit_price: m.unit_price, cost: m.cost, groupId: g.id, groupName: g.name }));
            if (defs.length) defaults[g.id] = defs;
          });
          setSelections(defaults);
        })
        .catch(console.error)
        .finally(() => setLoading(false));
    } else {
      setGroups([]);
      setSelections({});
      setNotes('');
    }
  }, [isOpen, product.id]);

  const handleToggle = (group: ModifierGroup, mod: Modifier) => {
    setSelections(prev => {
      const current = prev[group.id] || [];
      const exists = current.find(s => s.modifierId === mod.id);
      
      if (exists) {
        return { ...prev, [group.id]: current.filter(s => s.modifierId !== mod.id) };
      }
      
      const newItem: SelectedModifier = { modifierId: mod.id, name: mod.name, unit_price: mod.unit_price, cost: mod.cost, groupId: group.id, groupName: group.name };
      
      if (group.selection_type === 'SINGLE') {
        return { ...prev, [group.id]: [newItem] };
      }
      
      if (group.max_selection && current.length >= group.max_selection) return prev;
      
      return { ...prev, [group.id]: [...current, newItem] };
    });
  };

  const totalModsPrice = useMemo(() => 
    Object.values(selections).flat().reduce((sum, item) => sum + (item.unit_price || 0), 0), 
  [selections]);

  const totalModsCost = useMemo(() => 
    Object.values(selections).flat().reduce((sum, item) => sum + (item.cost || 0), 0),
  [selections]);

  const isValid = groups.every(g => {
    const count = (selections[g.id] || []).length;
    if (g.is_required && count === 0) return false;
    if (g.min_selection > 0 && count < g.min_selection) return false;
    return true;
  });

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 backdrop-blur-sm p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        <div className="p-4 border-b bg-gray-50 flex justify-between items-center rounded-t-xl">
          <h3 className="font-bold text-lg">{product.name}</h3>
          <span className="text-blue-600 font-bold">{(product.price + totalModsPrice).toFixed(2)}</span>
        </div>
        
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {loading ? <div className="text-center">جاري التحميل...</div> : groups.map(group => (
            <div key={group.id} className="border rounded-lg p-4">
              <div className="flex justify-between mb-2">
                <h4 className="font-bold">
                  {group.name} {group.is_required && <span className="text-red-500 text-sm">*</span>}
                </h4>
                <span className="text-xs bg-gray-100 px-2 py-1 rounded">
                  {group.selection_type === 'SINGLE' ? 'اختيار واحد' : 'متعدد'}
                </span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {group.modifiers.map(mod => {
                  const isSelected = (selections[group.id] || []).some(s => s.modifierId === mod.id);
                  return (
                    <div 
                      key={mod.id} 
                      onClick={() => handleToggle(group, mod)}
                      className={`p-3 border rounded cursor-pointer flex justify-between ${isSelected ? 'border-blue-500 bg-blue-50' : 'hover:bg-gray-50'}`}
                    >
                      <span>{mod.name}</span>
                      {mod.unit_price > 0 && <span className="text-gray-500">+{mod.unit_price}</span>}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
        
        <div className="px-6 pb-2">
          <textarea
            placeholder="ملاحظات خاصة (مثل: بدون بصل، صوص خارجي...)"
            className="w-full border rounded-lg p-3 text-sm h-20 outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50"
            value={notes}
            onChange={e => setNotes(e.target.value)}
          />
        </div>

        <div className="p-4 border-t bg-gray-50 rounded-b-xl flex justify-between">
          <button onClick={onClose} className="px-6 py-2 text-gray-600 hover:bg-gray-200 rounded-lg">إلغاء</button>
          <button 
            onClick={() => onConfirm(Object.values(selections).flat(), product.price + totalModsPrice, product.cost + totalModsCost, notes)}
            disabled={!isValid}
            className={`px-8 py-2 rounded-lg text-white font-bold ${!isValid ? 'bg-gray-400' : 'bg-green-600 hover:bg-green-700'}`}
          >
            إضافة للسلة
          </button>
        </div>
      </div>
    </div>
  );
};
import React, { useState, useEffect } from 'react';
import { supabase } from '../../../supabaseClient';
import { useAccounting } from '../../../context/AccountingContext';
import { useToast } from '../../../context/ToastContext';
import { X, Save, Plus, Trash2, Package, Loader2, Warehouse as WarehouseIcon, Calendar, CheckCircle, Ruler, List, DollarSign, Activity } from 'lucide-react';
import SearchableSelect from '../../../components/SearchableSelect';

interface Props {
  projectId: string;
  onClose: () => void;
  onSuccess: () => void;
}

interface ItemRow {
  productId: string;
  quantity: number;
  unitCost: number;
  uomId: string;
  boqItemId?: string; // 🏗️ جديد: ربط البند بالمقايسة
}

const MaterialIssueForm: React.FC<Props> = ({ projectId, onClose, onSuccess }) => {
  const { organization, warehouses, products, currentUser } = useAccounting();
  const [boqItems, setBoqItems] = useState<any[]>([]); // 🏗️ قائمة بنود المقايسة
  const [uoms, setUoms] = useState<any[]>([]);
  const { showToast } = useToast();
  const [loading, setLoading] = useState(false);
  const [warehouseId, setWarehouseId] = useState('');
  const [issueDate, setIssueDate] = useState(new Date().toISOString().split('T')[0]);
  const [issueNumber, setIssueNumber] = useState(`MAT-${Date.now().toString().slice(-6)}`);
  const [notes, setNotes] = useState('');
  const [items, setItems] = useState<ItemRow[]>([
    { productId: '', quantity: 1, unitCost: 0, uomId: '' }
  ]);

  useEffect(() => {
    const fetchData = async () => {
      // جلب بنود المقايسة
      const { data } = await supabase
        .from('project_boq')
        .select('id, item_name')
        .eq('project_id', projectId);
      if (data) setBoqItems(data);

      // جلب وحدات القياس للمنظمة
      const orgId = organization?.id || (currentUser as any)?.organization_id;
      if (orgId) {
        const { data: uomData } = await supabase.from('uoms').select('*').eq('organization_id', orgId);
        if (uomData) setUoms(uomData);
      }
    };
    fetchData();
  }, [projectId, organization, currentUser]);

  const updateItem = (index: number, field: keyof ItemRow, value: any) => {
    const newItems = [...items];
    let updatedItem = { ...newItems[index], [field]: value };

    if (field === 'productId') {
      const product = products.find(p => p.id === value);
      if (product) {
        const defaultUomId = product.purchase_uom_id || product.base_uom_id;
        const selectedUom = uoms.find(u => u.id === defaultUomId);
        const basePrice = product.purchase_price || product.cost || 0;
        
        updatedItem.uomId = defaultUomId || '';
        updatedItem.unitCost = selectedUom ? Number((basePrice * selectedUom.ratio).toFixed(4)) : basePrice;
      }
    } else if (field === 'uomId') {
      const selectedUom = uoms.find(u => u.id === value);
      const product = products.find(p => p.id === updatedItem.productId);
      if (selectedUom && product) {
        const basePrice = product.purchase_price || product.cost || 0;
        updatedItem.unitCost = Number((basePrice * selectedUom.ratio).toFixed(4));
      }
    }
    
    newItems[index] = updatedItem;
    setItems(newItems);
  };

  const handleAddItem = () => setItems([...items, { productId: '', quantity: 1, unitCost: 0, uomId: '' }]);
  const handleRemoveItem = (index: number) => items.length > 1 && setItems(items.filter((_, i) => i !== index));

  const handleSubmit = async (e: React.FormEvent, approveImmediately = false) => {
    e.preventDefault();
    if (!warehouseId) return showToast('الرجاء اختيار المستودع المصدر', 'warning');
    if (items.some(i => !i.productId || i.quantity <= 0)) return showToast('يرجى التحقق من الأصناف والكميات', 'warning');

    // 🏗️ فحص توفر المخزون بناءً على معاملات التحويل
    for (const item of items) {
        const product = products.find(p => p.id === item.productId);
        const selectedUom = uoms.find(u => u.id === item.uomId);
        const baseQty = item.quantity * (selectedUom?.ratio || 1);
        
        const warehouseStock = (product as any)?.warehouse_stock || {};
        const available = Number(warehouseStock[warehouseId] || 0);

        if (baseQty > available) {
            return showToast(`❌ عجز في صنف "${product?.name}": المتاح في المستودع ${available} (وحدة أساسية)، بينما المطلوب صرفه ${baseQty} (وحدة أساسية).`, 'error');
        }
    }

    setLoading(true);
    try {
      // 1. إدراج رأس إذن الصرف
      const { data: issue, error: issueError } = await supabase
        .from('project_material_issues')
        .insert([{
          project_id: projectId,
          warehouse_id: warehouseId,
          issue_number: issueNumber,
          issue_date: issueDate,
          notes: notes,
          organization_id: organization?.id,
          status: 'draft'
        }])
        .select().single();

      if (issueError) throw issueError;

      // 2. إدراج بنود الأصناف
      const { error: itemsError } = await supabase
        .from('project_material_issue_items')
        .insert(items.map(item => ({
          issue_id: issue.id,
          product_id: item.productId,
          quantity: item.quantity,
          unit_cost: item.unitCost,
          uom_id: item.uomId || null,
          boq_item_id: item.boqItemId || null,
          organization_id: organization?.id
        })));

      if (itemsError) throw itemsError;

      // 3. الترحيل المحاسبي والخصم المخزني إذا طلب المستخدم
      if (approveImmediately) {
        const { error: approveError } = await supabase.rpc('fn_approve_material_issue', { p_issue_id: issue.id });
        if (approveError) throw approveError;
        showToast('تم حفظ واعتماد إذن الصرف وتحديث تكاليف المشروع ✅', 'success');
      } else {
        showToast('تم حفظ مسودة إذن الصرف بنجاح', 'success');
      }

      onSuccess();
      onClose();
    } catch (error: any) {
      showToast(error.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 rtl">
      <div className="bg-white rounded-[2rem] shadow-2xl w-full max-w-4xl overflow-hidden flex flex-col max-h-[90vh]">
        <div className="p-6 bg-slate-50 border-b flex justify-between items-center">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-orange-100 text-orange-600 rounded-xl"><Package size={24} /></div>
            <h3 className="font-black text-xl text-slate-800">إذن صرف مواد للموقع</h3>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-white rounded-full transition-colors"><X size={24} /></button>
        </div>

        <form className="p-8 overflow-y-auto space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div>
              <label className="block text-xs font-black text-slate-400 uppercase mb-2">المستودع المصدر</label>
              <select value={warehouseId} onChange={e => setWarehouseId(e.target.value)} className="w-full border-2 border-slate-100 rounded-xl p-3 font-bold focus:border-orange-500 outline-none">
                <option value="">-- اختر المستودع --</option>
                {warehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-black text-slate-400 uppercase mb-2 text-right">رقم الإذن</label>
              <input type="text" value={issueNumber} onChange={e => setIssueNumber(e.target.value)} className="w-full border-2 border-slate-100 rounded-xl p-3 font-mono font-bold text-center" />
            </div>
            <div>
              <label className="block text-xs font-black text-slate-400 uppercase mb-2">تاريخ الصرف</label>
              <input type="date" value={issueDate} onChange={e => setIssueDate(e.target.value)} className="w-full border-2 border-slate-100 rounded-xl p-3 font-bold" />
            </div>
          </div>

          <div className="border-2 border-slate-50 rounded-2xl overflow-hidden">
            <table className="w-full text-right text-sm">
              <thead className="bg-slate-50 font-black text-slate-500">
                <tr>
                  <th className="p-4 flex items-center gap-2"><Package size={14}/> الصنف المخزني</th>
                  <th className="p-4 w-32 text-center"><Ruler size={14} className="inline ml-1"/>الوحدة</th>
                  <th className="p-4 w-48"><List size={14} className="inline ml-1"/>مرتبط بـ BOQ</th>
                  <th className="p-4 text-center w-32">الكمية</th>
                  <th className="p-4 text-center w-32"><DollarSign size={14} className="inline ml-1"/>التكلفة</th>
                  <th className="p-4 text-center w-32"><Activity size={14} className="inline ml-1"/>الإجمالي</th>
                  <th className="p-4 w-12"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {items.map((item, idx) => (
                  <tr key={idx} className="hover:bg-slate-50/50">
                    <td className="p-2">
                      <SearchableSelect options={products.filter(p => p.item_type !== 'SERVICE').map(p => ({ id: p.id, name: p.name, code: p.sku }))} value={item.productId} onChange={val => updateItem(idx, 'productId', val)} placeholder="ابحث عن صنف..." />
                    </td>
                    <td className="p-2">
                      <select 
                        value={item.uomId} 
                        onChange={e => updateItem(idx, 'uomId', e.target.value)}
                        className="w-full border-2 border-slate-100 rounded-lg p-2 text-xs font-bold bg-white focus:border-orange-500 outline-none transition-all"
                      >
                        <option value="">-- الوحدة --</option>
                        {uoms.filter(u => {
                            const prod = products.find(p => p.id === item.productId);
                            const baseUom = uoms.find(ux => ux.id === prod?.base_uom_id);
                            return u.category_id === baseUom?.category_id;
                        }).map(u => (
                            <option key={u.id} value={u.id}>{u.name}</option>
                        ))}
                      </select>
                    </td>
                    <td className="p-2">
                      <select 
                        value={item.boqItemId || ''} 
                        onChange={e => updateItem(idx, 'boqItemId', e.target.value)}
                        className="w-full border-2 border-slate-100 rounded-lg p-2 text-xs font-bold text-blue-600 bg-blue-50/30 outline-none focus:border-blue-400 transition-all"
                      >
                        <option value="">-- اختياري --</option>
                        {boqItems.map(b => <option key={b.id} value={b.id}>{b.item_name}</option>)}
                      </select>
                    </td>
                    <td className="p-2"><input type="number" value={item.quantity} onChange={e => updateItem(idx, 'quantity', parseFloat(e.target.value))} className="w-full border rounded-lg p-2 text-center font-bold" /></td>
                    <td className="p-2"><input type="number" value={item.unitCost} onChange={e => updateItem(idx, 'unitCost', parseFloat(e.target.value))} className="w-full border rounded-lg p-2 text-center text-slate-500" /></td>
                    <td className="p-4 text-center font-black text-slate-700">{(item.quantity * item.unitCost).toLocaleString()}</td>
                    <td className="p-2"><button type="button" onClick={() => handleRemoveItem(idx)} className="text-slate-300 hover:text-red-500"><Trash2 size={18} /></button></td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-slate-50 font-black">
                <tr>
                  <td colSpan={5} className="p-4 text-left text-slate-500">إجمالي قيمة المواد المنصرفة للموقع:</td>
                  <td className="p-4 text-center text-orange-600 text-lg">{items.reduce((sum, item) => sum + (item.quantity * item.unitCost), 0).toLocaleString()}</td>
                  <td></td>
                </tr>
              </tfoot>
            </table>
            <button type="button" onClick={handleAddItem} className="w-full py-3 bg-slate-50 text-slate-500 font-bold hover:bg-slate-100 transition-colors flex items-center justify-center gap-2 border-t"><Plus size={16} /> إضافة صنف آخر</button>
          </div>

          <div className="flex gap-4 pt-4">
            <button type="button" onClick={(e) => handleSubmit(e, true)} disabled={loading} className="flex-1 bg-orange-600 hover:bg-orange-700 text-white py-4 rounded-2xl font-black shadow-lg shadow-orange-200 transition-all flex items-center justify-center gap-2">
              {loading ? <Loader2 className="animate-spin" /> : <><CheckCircle size={20} /> حفظ واعتماد الصرف فوراً</>}
            </button>
            <button type="button" onClick={(e) => handleSubmit(e, false)} disabled={loading} className="px-8 bg-slate-100 hover:bg-slate-200 text-slate-700 py-4 rounded-2xl font-bold transition-all flex items-center gap-2"><Save size={20} /> حفظ كمسودة</button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default MaterialIssueForm;
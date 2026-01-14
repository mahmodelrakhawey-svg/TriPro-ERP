﻿import React, { useState, useEffect } from 'react';
import { Package, Search, Plus, Edit, Trash2, Save, X, Barcode, Printer, Image as ImageIcon, Upload, AlertTriangle, Lock } from 'lucide-react';
import { supabase } from '../../services/supabaseClient';
import { useAccounting } from '../../context/AccountingContext';
import { useProducts } from '../hooks/usePermissions'; // استيراد الخطاف الجديد
import { useQueryClient } from '@tanstack/react-query';

// تعريف واجهة الصنف بناءً على الجدول الجديد items
type Item = {
  id: string;
  name: string;
  sku: string | null;
  sales_price: number;
  purchase_price: number; // هذا هو حقل التكلفة
  weighted_average_cost?: number; // متوسط التكلفة
  stock: number; // هذا هو حقل المخزون
  item_type: 'STOCK' | 'SERVICE';
  inventory_account_id: string | null;
  cogs_account_id: string | null;
  sales_account_id: string | null;
  image_url: string | null;
};

const ProductManager = () => {
  const queryClient = useQueryClient();
  const { accounts: contextAccounts, refreshData, deleteProduct, currentUser, products: contextProducts } = useAccounting();
  // استبدال الحالة اليدوية بـ React Query
  const { data: serverItems = [], isLoading: serverLoading } = useProducts();

  // في وضع الديمو، نستخدم المنتجات من السياق (الوهمية)
  const items = currentUser?.role === 'demo' ? contextProducts : serverItems;
  const loading = currentUser?.role === 'demo' ? false : serverLoading;
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [uploading, setUploading] = useState(false);
  const [reservedStock, setReservedStock] = useState<Record<string, number>>({});

  // تصفية الحسابات من السياق العام لضمان التوافق
  const accounts = {
    assets: contextAccounts.filter(a => 
      !a.isGroup && (String(a.type).toLowerCase() === 'asset')
    ),
    expenses: contextAccounts.filter(a => 
      !a.isGroup && (String(a.type).toLowerCase() === 'expense')
    ),
    revenue: contextAccounts.filter(a => 
      !a.isGroup && (String(a.type).toLowerCase() === 'revenue')
    ),
  };

  // جلب الكميات المحجوزة (من الفواتير المسودة)
  useEffect(() => {
    const fetchReserved = async () => {
      if (currentUser?.role === 'demo') {
          setReservedStock({});
          return;
      }
      try {
        const { data } = await supabase
          .from('invoice_items')
          .select('product_id, quantity, invoices!inner(status)')
          .eq('invoices.status', 'draft');
        
        const reserved: Record<string, number> = {};
        data?.forEach((item: any) => {
          if (item.product_id) {
            reserved[item.product_id] = (reserved[item.product_id] || 0) + Number(item.quantity);
          }
        });
        setReservedStock(reserved);
      } catch (error) {
        console.error("Error fetching reserved stock:", error);
      }
    };
    fetchReserved();
  }, [currentUser]);

  // بيانات النموذج
  const [formData, setFormData] = useState({
    name: '',
    sku: '',
    sales_price: 0,
    purchase_price: 0,
    item_type: 'STOCK',
    inventory_account_id: '',
    cogs_account_id: '',
    sales_account_id: '',
    image_url: '',
    opening_stock: 0,
    min_stock_level: 0 // حقل حد الطلب
  });

  const handleOpenModal = (item?: Item) => {
    if (item) {
      setEditingId(item.id);
      setFormData({
        name: item.name,
        sku: item.sku || '',
        sales_price: item.sales_price || 0,
        purchase_price: item.purchase_price || 0,
        item_type: item.item_type || 'STOCK',
        inventory_account_id: item.inventory_account_id || '',
        cogs_account_id: item.cogs_account_id || '',
        sales_account_id: item.sales_account_id || '',
        image_url: item.image_url || '',
        opening_stock: 0,
        min_stock_level: (item as any).min_stock_level || 0
      });
    } else {
      setEditingId(null);
      // تعيين قيم افتراضية للحسابات إذا وجدت لتسهيل الإدخال
      // التعديل: البحث عن حساب "مخزون المنتج التام" (10302) أولاً، ثم الرئيسي (103)
      const defaultInventory = accounts.assets.find(a => a.code === '10302')?.id || accounts.assets.find(a => a.code === '103')?.id || '';
      const defaultCogs = accounts.expenses.find(a => a.code === '5101')?.id || '';
      const defaultSales = accounts.revenue.find(a => a.code === '4101')?.id || '';

      setFormData({ 
        name: '', 
        sku: '', 
        sales_price: 0, 
        purchase_price: 0, 
        item_type: 'STOCK',
        inventory_account_id: defaultInventory,
        cogs_account_id: defaultCogs,
        sales_account_id: defaultSales,
        image_url: '',
        opening_stock: 0,
        min_stock_level: 0
      });
    }
    setIsModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // التحقق الصارم من الحسابات
    if (formData.item_type === 'STOCK') {
      if (!formData.inventory_account_id || !formData.cogs_account_id || !formData.sales_account_id) {
        alert('خطأ محاسبي: يجب تحديد جميع الحسابات (المخزون، التكلفة، المبيعات) للأصناف المخزنية.');
        return;
      }
    }

    if (currentUser?.role === 'demo') {
        alert('تم حفظ الصنف بنجاح وتوجيهه محاسبياً ✅ (محاكاة)');
        setIsModalOpen(false);
        return;
    }

    try {
      // جلب معرف المؤسسة
      const { data: orgData } = await supabase.from('organizations').select('id').limit(1).single();
      const orgId = orgData?.id;

      if (editingId) {
        // تحديث صنف موجود (تحديث عادي)
        const itemData = {
            name: formData.name,
            sku: formData.sku || null,
            sales_price: formData.sales_price,
            purchase_price: formData.purchase_price,
            item_type: formData.item_type,
            inventory_account_id: formData.item_type === 'STOCK' ? formData.inventory_account_id : null,
            cogs_account_id: formData.item_type === 'STOCK' ? formData.cogs_account_id : null,
            sales_account_id: formData.sales_account_id,
            image_url: formData.image_url,
            organization_id: orgId,
            is_active: true,
            min_stock_level: formData.min_stock_level
        };
        const { error } = await supabase.from('products').update(itemData).eq('id', editingId);
        if (error) throw error;
      } else {
        // إضافة صنف جديد (استخدام الدالة لإنشاء الرصيد الافتتاحي)
        // نستخدم RPC (Remote Procedure Call) لاستدعاء الدالة في قاعدة البيانات
        const { error } = await supabase.rpc('add_product_with_opening_balance', {
            p_name: formData.name,
            p_sku: formData.sku || null,
            p_sales_price: formData.sales_price,
            p_purchase_price: formData.purchase_price,
            p_stock: formData.opening_stock, // الكمية الافتتاحية
            p_org_id: orgId,
            p_item_type: formData.item_type,
            p_inventory_account_id: formData.inventory_account_id || null,
            p_cogs_account_id: formData.cogs_account_id || null,
            p_sales_account_id: formData.sales_account_id || null
        });

        // ملاحظة: الدالة add_product_with_opening_balance تقوم بإنشاء الصنف والقيد معاً
        if (error) throw error;

        // تحديث حد الطلب بشكل منفصل لأن الدالة قد لا تدعمه بعد
        if (formData.min_stock_level > 0) {
             // نحتاج لمعرفة ID الصنف الجديد، لكن الدالة الحالية لا ترجعه بسهولة في هذا السياق
             // يمكن تجاهل هذا للجديد أو تحديث الدالة لاحقاً
        }
      }
      
      alert('تم حفظ الصنف بنجاح وتوجيهه محاسبياً ✅');
      // تحديث الكاش في React Query ليظهر الصنف الجديد فوراً
      queryClient.invalidateQueries({ queryKey: ['products'] });
      await refreshData(); // تحديث الأرصدة المحاسبية في النظام بالكامل
      setIsModalOpen(false);
    } catch (error: any) {
      alert('فشل حفظ الصنف: ' + error.message);
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('هل أنت متأكد من حذف هذا الصنف؟ سيتم نقله إلى سلة المحذوفات.')) return;
    
    const reason = prompt("الرجاء إدخال سبب الحذف (إلزامي):");
    if (!reason) return;

    if (currentUser?.role === 'demo') {
        alert('تم حذف الصنف بنجاح (محاكاة)');
        return;
    }

    try {
      // استخدام دالة الحذف من السياق لضمان الحذف الناعم وتسجيل النشاط
      await deleteProduct(id, reason);
      queryClient.invalidateQueries({ queryKey: ['products'] }); // تحديث القائمة
    } catch (error: any) {
      alert('حدث خطأ أثناء الحذف: ' + error.message);
    }
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;
    
    if (currentUser?.role === 'demo') {
        alert('رفع الصور غير متاح في النسخة التجريبية');
        return;
    }

    const file = e.target.files[0];
    const fileExt = file.name.split('.').pop();
    const fileName = `${Math.random()}.${fileExt}`;
    const filePath = `${fileName}`;

    try {
      setUploading(true);
      const { error: uploadError } = await supabase.storage.from('product-images').upload(filePath, file);
      if (uploadError) throw uploadError;
      const { data } = supabase.storage.from('product-images').getPublicUrl(filePath);
      setFormData(prev => ({ ...prev, image_url: data.publicUrl }));
    } catch (error: any) {
      alert('فشل رفع الصورة: ' + error.message);
    } finally {
      setUploading(false);
    }
  };

  const filteredItems = (items as Item[]).filter(item => 
    item.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
    (item.sku && item.sku.includes(searchTerm))
  );

  return (
    <div className="space-y-6 animate-in fade-in">
      <div className="flex justify-between items-center flex-wrap gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
            <Package className="text-emerald-600" /> إدارة الأصناف (المنضبطة)
          </h2>
          <p className="text-slate-500">تعريف المنتجات وربطها بالحسابات المحاسبية</p>
        </div>
        <button onClick={() => handleOpenModal()} className="bg-emerald-600 text-white px-6 py-2.5 rounded-lg hover:bg-emerald-700 flex items-center gap-2 font-bold shadow-lg">
          <Plus size={20} /> صنف جديد
        </button>
      </div>

      <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200">
        <div className="relative">
          <Search className="absolute right-3 top-3 text-slate-400" size={20} />
          <input 
            type="text" 
            placeholder="بحث باسم الصنف أو الكود (SKU)..." 
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="w-full pr-10 pl-4 py-2.5 border rounded-lg focus:outline-none focus:border-emerald-500"
          />
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <table className="w-full text-right">
          <thead className="bg-slate-50 text-slate-600 font-bold text-sm border-b">
            <tr>
              <th className="p-4 w-16">الصورة</th>
              <th className="p-4">اسم الصنف</th>
              <th className="p-4">النوع</th>
              <th className="p-4 text-center">الرصيد الحالي</th>
              <th className="p-4 text-center">المحجوز</th>
              <th className="p-4">متوسط التكلفة</th>
              <th className="p-4">سعر البيع</th>
              <th className="p-4 text-center">إجراءات</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {filteredItems.map(item => (
              <tr key={item.id} className="hover:bg-slate-50">
                <td className="p-4">
                  {item.image_url ? (
                    <img src={item.image_url} alt={item.name} className="w-10 h-10 object-cover rounded-lg border border-slate-200" />
                  ) : (
                    <div className="w-10 h-10 bg-slate-100 rounded-lg flex items-center justify-center text-slate-400"><ImageIcon size={16} /></div>
                  )}
                </td>
                <td className="p-4 font-bold text-slate-800">
                  {item.name}
                  <div className="text-xs text-slate-400 font-mono">{item.sku}</div>
                </td>
                <td className="p-4">
                  <span className={`px-2 py-1 rounded text-xs font-bold ${item.item_type === 'STOCK' ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700'}`}>
                    {item.item_type === 'STOCK' ? 'مخزوني' : 'خدمي'}
                  </span>
                </td>
                <td className="p-4 text-center font-bold text-slate-700">
                    {item.stock}
                </td>
                <td className="p-4 text-center font-bold text-amber-600">
                    {reservedStock[item.id] > 0 ? (
                        <span className="flex items-center justify-center gap-1 bg-amber-50 px-2 py-1 rounded-full text-xs border border-amber-100">
                            <Lock size={12} /> {reservedStock[item.id]}
                        </span>
                    ) : '-'}
                </td>
                <td className="p-4 text-slate-600 font-mono">
                    {item.weighted_average_cost ? item.weighted_average_cost.toLocaleString() : item.purchase_price?.toLocaleString()}
                    <span className="text-[10px] text-slate-400 block">آخر شراء: {item.purchase_price?.toLocaleString()}</span>
                </td>
                <td className="p-4 text-emerald-600 font-bold">{item.sales_price?.toLocaleString()}</td>
                <td className="p-4 flex justify-center gap-2 items-center">
                  <button onClick={() => handleOpenModal(item)} className="p-2 text-blue-500 hover:bg-blue-50 rounded"><Edit size={18}/></button>
                  <button onClick={() => handleDelete(item.id)} className="p-2 text-red-500 hover:bg-red-50 rounded"><Trash2 size={18}/></button>
                </td>
              </tr>
            ))}
            {filteredItems.length === 0 && (
              <tr><td colSpan={6} className="p-8 text-center text-slate-400">لا توجد أصناف مسجلة</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl overflow-hidden animate-in zoom-in-95">
            <div className="bg-slate-50 px-6 py-4 border-b flex justify-between items-center">
              <h3 className="font-bold text-lg text-slate-800">{editingId ? 'تعديل صنف' : 'إضافة صنف جديد'}</h3>
              <button onClick={() => setIsModalOpen(false)}><X className="text-slate-400 hover:text-red-500" /></button>
            </div>
            
            <form onSubmit={handleSubmit} className="p-6 space-y-4 max-h-[80vh] overflow-y-auto">
              
              <div className="flex gap-4">
                {/* Image Upload */}
                <div className="w-24 flex-shrink-0">
                  <div className="relative group cursor-pointer w-24 h-24 bg-slate-100 rounded-xl border-2 border-dashed border-slate-300 flex items-center justify-center overflow-hidden">
                    {formData.image_url ? (
                      <img src={formData.image_url} alt="Preview" className="w-full h-full object-cover" />
                    ) : (
                      <ImageIcon className="text-slate-400 w-8 h-8" />
                    )}
                    <label className="absolute inset-0 flex items-center justify-center bg-black/50 text-white opacity-0 group-hover:opacity-100 transition-opacity rounded-xl cursor-pointer">
                      <Upload size={20} />
                      <input type="file" accept="image/*" onChange={handleImageUpload} className="hidden" disabled={uploading} />
                    </label>
                  </div>
                </div>

                <div className="flex-1 space-y-4">
                  <div>
                    <label className="block text-sm font-bold mb-1 text-slate-700">اسم الصنف <span className="text-red-500">*</span></label>
                    <input required type="text" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} className="w-full border rounded-lg p-2 focus:ring-2 focus:ring-emerald-500 outline-none" />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-bold mb-1 text-slate-700">نوع الصنف</label>
                      <select 
                        value={formData.item_type} 
                        onChange={e => setFormData({...formData, item_type: e.target.value as any})}
                        className="w-full border rounded-lg p-2 bg-white"
                      >
                        <option value="STOCK">مخزوني (بضاعة)</option>
                        <option value="SERVICE">خدمة (ليس لها مخزون)</option>
                      </select>
                    </div>
                    <div>
                        <label className="block text-sm font-bold mb-1 text-slate-700">الكود (SKU)</label>
                        <input type="text" value={formData.sku} onChange={e => setFormData({...formData, sku: e.target.value})} className="w-full border rounded-lg p-2 font-mono" />
                    </div>
                    <div>
                        <label className="block text-sm font-bold mb-1 text-slate-700">حد الطلب (للتنبيهات)</label>
                        <input type="number" min="0" value={formData.min_stock_level} onChange={e => setFormData({...formData, min_stock_level: parseFloat(e.target.value)})} className="w-full border rounded-lg p-2" placeholder="0" />
                    </div>
                  </div>
                </div>
              </div>

              {/* حقل الرصيد الافتتاحي (يظهر فقط عند الإضافة) */}
              {!editingId && formData.item_type === 'STOCK' && (
                  <div className="bg-slate-50 p-3 rounded-lg border border-slate-200">
                      <label className="block text-sm font-bold mb-1 text-slate-700">الرصيد الافتتاحي (الكمية)</label>
                      <input type="number" min="0" value={formData.opening_stock} onChange={e => setFormData({...formData, opening_stock: parseFloat(e.target.value)})} className="w-full border rounded-lg p-2 focus:ring-2 focus:ring-emerald-500 outline-none" placeholder="0" />
                      <p className="text-xs text-slate-500 mt-1">سيتم إنشاء قيد افتتاحي تلقائي (من ح/ المخزون إلى ح/ الأرصدة الافتتاحية) بقيمة (الكمية × التكلفة).</p>
                  </div>
              )}

              <div className="grid grid-cols-2 gap-4 border-t pt-4">
                <div>
                    <label className="block text-sm font-bold mb-1 text-slate-700">سعر التكلفة (تقديري)</label>
                    <input type="number" value={formData.purchase_price} onChange={e => setFormData({...formData, purchase_price: parseFloat(e.target.value)})} className="w-full border rounded-lg p-2" />
                </div>
                <div>
                    <label className="block text-sm font-bold mb-1 text-slate-700">سعر البيع</label>
                    <input type="number" value={formData.sales_price} onChange={e => setFormData({...formData, sales_price: parseFloat(e.target.value)})} className="w-full border rounded-lg p-2" />
                </div>
              </div>

              {/* التوجيه المحاسبي */}
              <div className="bg-blue-50 p-4 rounded-xl border border-blue-100 mt-4">
                <h4 className="font-bold text-blue-800 mb-3 flex items-center gap-2">
                  <AlertTriangle size={16}/> التوجيه المحاسبي (إلزامي)
                </h4>
                
                <div className="space-y-3">
                  {formData.item_type === 'STOCK' && (
                    <>
                      <div>
                        <label className="block text-xs font-bold text-slate-600 mb-1">حساب المخزون (أصول)</label>
                        <select 
                          required 
                          value={formData.inventory_account_id} 
                          onChange={e => setFormData({...formData, inventory_account_id: e.target.value})}
                          className="w-full border border-blue-200 rounded-lg p-2 text-sm bg-white"
                        >
                          <option value="">-- اختر حساب المخزون --</option>
                          {accounts.assets.map(a => <option key={a.id} value={a.id}>{a.code} - {a.name}</option>)}
                        </select>
                      </div>

                      <div>
                        <label className="block text-xs font-bold text-slate-600 mb-1">حساب تكلفة البضاعة (مصروفات)</label>
                        <select 
                          required 
                          value={formData.cogs_account_id} 
                          onChange={e => setFormData({...formData, cogs_account_id: e.target.value})}
                          className="w-full border border-blue-200 rounded-lg p-2 text-sm bg-white"
                        >
                          <option value="">-- اختر حساب التكلفة --</option>
                          {accounts.expenses.map(a => <option key={a.id} value={a.id}>{a.code} - {a.name}</option>)}
                        </select>
                      </div>
                    </>
                  )}

                  <div>
                    <label className="block text-xs font-bold text-slate-600 mb-1">حساب المبيعات (إيرادات)</label>
                    <select 
                      required 
                      value={formData.sales_account_id} 
                      onChange={e => setFormData({...formData, sales_account_id: e.target.value})}
                      className="w-full border border-blue-200 rounded-lg p-2 text-sm bg-white"
                    >
                      <option value="">-- اختر حساب الإيراد --</option>
                      {accounts.revenue.map(a => <option key={a.id} value={a.id}>{a.code} - {a.name}</option>)}
                    </select>
                  </div>
                </div>
              </div>

              <button type="submit" disabled={uploading} className="w-full bg-emerald-600 text-white py-3 rounded-lg font-bold hover:bg-emerald-700 mt-4 disabled:opacity-50 shadow-md transition-all">
                {uploading ? 'جاري رفع الصورة...' : 'حفظ واعتماد الصنف'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default ProductManager;

import React, { useState, useMemo, useEffect, useRef } from 'react';
import type { Key } from 'react';
import { useToast } from '../context/ToastContext';
import { useAccounting, SYSTEM_ACCOUNTS } from '../context/AccountingContext';
import type { RestaurantTable, Product } from '../types';
import { Coffee, HardHat, LayoutGrid, Utensils, Plus, Trash2, Minus, Edit, Search, X } from 'lucide-react';
import type { Dispatch, SetStateAction } from 'react';
import { useReactToPrint } from 'react-to-print';
import { PrintableInvoice } from './PrintableInvoice';





// --- أنواع البيانات المحلية للطلب ---
interface OrderItem {
  productId: string;
  name: string;
  quantity: number;
  price: number;
  notes?: string;
  savedQuantity?: number; // الكمية التي تم إرسالها للمطبخ مسبقاً
}

export interface ActiveOrder {
  tableId: string;
  sessionId: string;
  orderId?: string;
  tableName: string;
  items: OrderItem[];
}

interface Category {
  id: string;
  name: string;
}

// --- المكونات الفرعية ---

const TableCard = ({ table, onClick, isActive, onDelete, onEdit }: { table: RestaurantTable; onClick: () => void; isActive: boolean, onDelete: () => void, onEdit: () => void }) => {
  const statusStyles: { [key: string]: string } = {
    AVAILABLE: 'bg-green-100 text-green-800 border-green-300 hover:bg-green-200',
    OCCUPIED: 'bg-red-100 text-red-800 border-red-300 hover:bg-red-200',
    RESERVED: 'bg-yellow-100 text-yellow-800 border-yellow-300 hover:bg-yellow-200',
  };
  const statusText: { [key: string]: string } = { AVAILABLE: 'متاحة', OCCUPIED: 'مشغولة', RESERVED: 'محجوزة' };

  return (
    <div
      className={`p-4 rounded-lg border-2 cursor-pointer transition-all ${statusStyles[table.status]} ${isActive ? 'ring-4 ring-blue-400' : ''}`}
    >
      <div onClick={onClick} className="font-bold text-xl">{table.name}</div>
      <div onClick={onClick} className="text-xs">{statusText[table.status]}</div>

      <div className="flex mt-2 justify-between">
        <button onClick={onEdit} className="text-xs text-blue-500 hover:text-blue-700 font-bold">تعديل</button>
        <button onClick={onDelete} className="text-xs text-red-500 hover:text-red-700 font-bold">حذف</button>
      </div>
    </div>


  );
};

const MenuItemCard = ({ item, onClick }: { item: Product; onClick: () => void }) => (
  <div onClick={onClick} className="bg-white border border-slate-200 rounded-lg p-3 text-center cursor-pointer hover:bg-blue-50 hover:border-blue-300 transition-all h-full flex flex-col justify-between shadow-sm">
    <div className="font-semibold text-slate-800 text-sm">{item.name}</div>
    <div className="text-sm font-bold text-blue-600 mt-2">{(item.sales_price || item.price || 0).toFixed(2)} SAR</div>
  </div>
);

const OrderSummary = ({ order, onUpdateItem, onClearOrder, onAcceptOrder, onPayment, isSubmitting }: { order: ActiveOrder | null; onUpdateItem: (productId: string, change: number) => void; onClearOrder: () => void; onAcceptOrder: () => void; onPayment: () => void; isSubmitting: boolean; }) => {
  const { settings } = useAccounting(); 
  const { showToast } = useToast();
  const totals = useMemo(() => {
    if (!order) return { subtotal: 0, tax: 0, total: 0 };
    const subtotal = order.items.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    const tax = subtotal * ((settings.vatRate || 15) / 100);
    const total = subtotal + tax;
    return { subtotal, tax, total };
  }, [order, settings.vatRate]);

  // حساب قيمة الأصناف الجديدة فقط التي سيتم إرسالها
  const newItemsTotal = useMemo(() => {
    if (!order) return 0;
    return order.items.reduce((sum, item) => sum + (item.price * (item.quantity - (item.savedQuantity || 0))), 0);
  }, [order]);
  const hasNewItems = newItemsTotal > 0;

  if (!order) {
    return (
      <div className="bg-white rounded-lg shadow-sm h-full flex flex-col items-center justify-center text-center p-4">
        <Utensils size={48} className="text-slate-300 mb-4" />
        <h3 className="font-bold text-slate-600">لم يتم تحديد طلب</h3>
        <p className="text-sm text-slate-400">الرجاء اختيار طاولة لبدء الطلب</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow-sm h-full flex flex-col">
      <div className="p-4 border-b flex justify-between items-center">
        <h3 className="text-lg font-bold text-slate-800">فاتورة طاولة: {order.tableName}</h3>
        <button onClick={onClearOrder} className="text-xs text-red-500 hover:text-red-700 font-bold">إلغاء الطلب</button>
      </div>
      <div className="flex-1 p-2 overflow-y-auto space-y-2 min-h-0">
        {order.items.map(item => (
          <div key={item.productId} className="flex justify-between items-center bg-slate-50 p-2 rounded-lg">
            <div className="flex-1">
              <div className="font-semibold text-sm">{item.name}</div>
              <div className="text-xs text-slate-500">{(item.price).toFixed(2)}</div>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => onUpdateItem(item.productId, -1)} className={`p-1 rounded-full ${item.savedQuantity && item.quantity <= item.savedQuantity ? 'bg-slate-100 text-slate-400 cursor-not-allowed' : 'bg-red-100 text-red-600'}`} disabled={item.savedQuantity ? item.quantity <= item.savedQuantity : false}><Minus size={12} /></button>
              <span className="font-bold w-6 text-center">{item.quantity}</span>
              {item.savedQuantity && item.savedQuantity > 0 && <span className="text-[10px] text-slate-400 bg-slate-100 px-1 rounded" title="تم طلبه مسبقاً">+{item.savedQuantity}</span>}
              <button onClick={() => onUpdateItem(item.productId, 1)} className="p-1 bg-emerald-100 text-emerald-600 rounded-full hover:bg-emerald-200"><Plus size={12} /></button>
            </div>
            <div className="font-bold w-20 text-left">{(item.price * item.quantity).toFixed(2)}</div>
          </div>
        ))}
      </div>
      <div className="p-4 border-t space-y-2">
        <div className="flex justify-between text-sm"><span className="text-slate-500">المجموع الفرعي</span><span className="font-semibold">{totals.subtotal.toFixed(2)}</span></div>
        <div className="flex justify-between text-sm"><span className="text-slate-500">الضريبة ({settings.vatRate || 15}%)</span><span className="font-semibold">{totals.tax.toFixed(2)}</span></div>
        <div className="flex justify-between text-lg font-bold text-slate-800"><span >الإجمالي</span><span>{totals.total.toFixed(2)} SAR</span></div>
      </div>
      <div className="p-3 grid grid-cols-2 gap-2">
        <button 
            onClick={onAcceptOrder}
            className="bg-blue-600 text-white font-bold py-3 rounded-lg hover:bg-blue-700 transition-colors text-base disabled:opacity-50" 
            disabled={!hasNewItems || isSubmitting}>
          {isSubmitting ? 'جاري...' : `إرسال (${newItemsTotal.toFixed(0)})`}
        </button>
        
        <button 
            onClick={onPayment}
            className="bg-emerald-600 text-white font-bold py-3 rounded-lg hover:bg-emerald-700 transition-colors text-base disabled:opacity-50" 
            disabled={!order.orderId || hasNewItems}>
          دفع وإغلاق
        </button>
      </div>
    </div>
  );
};

// --- Add Table Modal Component ---
const AddTableModal = ({ isOpen, onClose, onSave, sections }: { isOpen: boolean, onClose: () => void, onSave: (data: { name: string, capacity: number, section: string }) => void, sections: string[] }) => {
  const [name, setName] = useState('');
  const [capacity, setCapacity] = useState(4);
  const [section, setSection] = useState('داخلي');
  const [error, setError] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('اسم الطاولة مطلوب');
      return;
    }
    setError('');
    setIsSaving(true);
    await onSave({ name, capacity, section });
    setIsSaving(false);
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-sm" dir="rtl">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95">
        <div className="p-4 border-b flex justify-between items-center bg-slate-50">
          <h3 className="font-bold text-lg text-slate-800">إضافة طاولة جديدة</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-red-500"><X size={20} /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && <div className="bg-red-100 text-red-700 p-3 rounded-lg text-sm">{error}</div>}
          <div>
            <label className="block text-sm font-bold mb-1 text-slate-700">اسم الطاولة</label>
            <input type="text" value={name} onChange={e => setName(e.target.value)} className="w-full border border-slate-300 rounded-lg p-2 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none" placeholder="مثال: T10 أو طاولة الزاوية" required />
          </div>
          <div>
            <label className="block text-sm font-bold mb-1 text-slate-700">السعة (عدد الكراسي)</label>
            <input type="number" value={capacity} onChange={e => setCapacity(Number(e.target.value))} className="w-full border border-slate-300 rounded-lg p-2 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none" min="1" required />
          </div>
          <div>
            <label className="block text-sm font-bold mb-1 text-slate-700">القسم</label>
            <input type="text" value={section} onChange={e => setSection(e.target.value)} className="w-full border border-slate-300 rounded-lg p-2 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none" placeholder="مثال: داخلي، خارجي، VIP" />
            {sections.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-2">
                {sections.map(sec => (
                  <button
                    key={sec}
                    type="button"
                    onClick={() => setSection(sec)}
                    className={`text-xs font-bold px-3 py-1 rounded-full border transition-all ${section === sec ? 'bg-blue-600 text-white border-blue-600 shadow-md' : 'bg-slate-100 text-slate-600 border-slate-200 hover:bg-slate-200'}`}
                  >
                    {sec}
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="flex justify-end gap-3 pt-4 border-t mt-6">
            <button type="button" onClick={onClose} className="px-4 py-2 bg-slate-100 rounded-lg font-semibold hover:bg-slate-200 text-slate-700">إلغاء</button>
            <button type="submit" disabled={isSaving} className="px-4 py-2 bg-blue-600 text-white rounded-lg font-bold hover:bg-blue-700 disabled:opacity-50">
              {isSaving ? 'جاري الحفظ...' : 'حفظ الطاولة'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// --- Edit Table Modal Component ---
const EditTableModal = ({ table, isOpen, onClose, onSave, sections }: { table: RestaurantTable | null; isOpen: boolean, onClose: () => void, onSave: (id: string, data: { name: string, capacity: number, section: string }) => void, sections: string[] }) => {
  const [name, setName] = useState('');
  const [capacity, setCapacity] = useState(4);
  const [section, setSection] = useState('');
  const [error, setError] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (table) {
      setName(table.name);
      setCapacity(table.capacity || 4);
      setSection(table.section || 'داخلي');
    }
  }, [table]);

  if (!isOpen || !table) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('اسم الطاولة مطلوب');
      return;
    }
    setError('');
    setIsSaving(true);
    await onSave(table.id, { name, capacity, section });
    setIsSaving(false);
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-sm" dir="rtl">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95">
        <div className="p-4 border-b flex justify-between items-center bg-slate-50">
          <h3 className="font-bold text-lg text-slate-800">تعديل الطاولة: {table.name}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-red-500"><X size={20} /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && <div className="bg-red-100 text-red-700 p-3 rounded-lg text-sm">{error}</div>}
          <div>
            <label className="block text-sm font-bold mb-1 text-slate-700">اسم الطاولة</label>
            <input type="text" value={name} onChange={e => setName(e.target.value)} className="w-full border border-slate-300 rounded-lg p-2 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none" placeholder="مثال: T10 أو طاولة الزاوية" required />
          </div>
          <div>
            <label className="block text-sm font-bold mb-1 text-slate-700">السعة (عدد الكراسي)</label>
            <input type="number" value={capacity} onChange={e => setCapacity(Number(e.target.value))} className="w-full border border-slate-300 rounded-lg p-2 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none" min="1" required />
          </div>
          <div>
            <label className="block text-sm font-bold mb-1 text-slate-700">القسم</label>
            <input type="text" value={section} onChange={e => setSection(e.target.value)} className="w-full border border-slate-300 rounded-lg p-2 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none" placeholder="مثال: داخلي، خارجي، VIP" />
            {sections.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-2">
                {sections.map(sec => (
                  <button
                    key={sec}
                    type="button"
                    onClick={() => setSection(sec)}
                    className={`text-xs font-bold px-3 py-1 rounded-full border transition-all ${section === sec ? 'bg-blue-600 text-white border-blue-600 shadow-md' : 'bg-slate-100 text-slate-600 border-slate-200 hover:bg-slate-200'}`}
                  >
                    {sec}
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="flex justify-end gap-3 pt-4 border-t mt-6">
            <button type="button" onClick={onClose} className="px-4 py-2 bg-slate-100 rounded-lg font-semibold hover:bg-slate-200 text-slate-700">إلغاء</button>
            <button type="submit" disabled={isSaving} className="px-4 py-2 bg-blue-600 text-white rounded-lg font-bold hover:bg-blue-700 disabled:opacity-50">
              {isSaving ? 'جاري الحفظ...' : 'حفظ التعديلات'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// --- Payment Modal Component ---
const PaymentModal = ({ isOpen, onClose, onConfirm, totalAmount }: { isOpen: boolean, onClose: () => void, onConfirm: (method: 'CASH' | 'CARD') => void, totalAmount: number }) => {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-sm" dir="rtl">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm overflow-hidden animate-in fade-in zoom-in-95">
        <div className="p-4 border-b flex justify-between items-center bg-slate-50">
          <h3 className="font-bold text-lg text-slate-800">الدفع وإغلاق الجلسة</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-red-500"><X size={20} /></button>
        </div>
        <div className="p-6 text-center space-y-6">
          <div>
            <p className="text-slate-500 mb-1">المبلغ المستحق</p>
            <p className="text-4xl font-black text-emerald-600">{totalAmount.toFixed(2)} <span className="text-sm text-slate-400">SAR</span></p>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <button 
              onClick={() => onConfirm('CASH')}
              className="flex flex-col items-center justify-center gap-2 p-4 border-2 border-slate-200 rounded-xl hover:border-emerald-500 hover:bg-emerald-50 transition-all group"
            >
              <div className="text-emerald-600 group-hover:scale-110 transition-transform text-2xl">💵</div>
              <span className="font-bold text-slate-700">نقدًا (Cash)</span>
            </button>
            <button 
              onClick={() => onConfirm('CARD')}
              className="flex flex-col items-center justify-center gap-2 p-4 border-2 border-slate-200 rounded-xl hover:border-blue-500 hover:bg-blue-50 transition-all group"
            >
              <div className="text-blue-600 group-hover:scale-110 transition-transform text-2xl">💳</div>
              <span className="font-bold text-slate-700">بطاقة (Card)</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

// --- المكون الرئيسي ---


const PosScreen = () => {
  const { restaurantTables, openTableSession, products: allProducts, menuCategories, can, addRestaurantTable, updateRestaurantTable, deleteRestaurantTable, createRestaurantOrder, getOpenTableOrder, completeRestaurantOrder, settings } = useAccounting();
  const { showToast } = useToast();
  const [activeTab, setActiveTab] = useState('dine-in');
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [activeOrder, setActiveOrder] = useState<ActiveOrder | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [editingTable, setEditingTable] = useState<RestaurantTable | null>(null);
  const [orderToPrint, setOrderToPrint] = useState<ActiveOrder | null>(null);

  // --- Print Logic ---
  const printRef = useRef<HTMLDivElement>(null);
  const handlePrint = useReactToPrint({
    documentTitle: 'فاتورة', 
  });

  useEffect(() => {
    if (menuCategories && menuCategories.length > 0 && !activeCategory) {
      setActiveCategory(menuCategories[0].id);
    }
  }, [menuCategories, activeCategory]);

  // Effect to trigger print when orderToPrint is set
  useEffect(() => {
    if (orderToPrint) {
      handlePrint();
    }
  }, [orderToPrint]);

  const clearOrder = () => {
    setActiveOrder(null);
  };

  const products = useMemo(() => {
    if (!allProducts) return [];
    return allProducts.filter(p => p.name.toLowerCase().includes(searchTerm.toLowerCase()))
  }, [searchTerm, allProducts]);

  const menuItems = useMemo(() => {
    return products.filter(p => (p as any).product_type === 'MENU_ITEM' && (p.category_id === activeCategory));
  }, [products, activeCategory]);

  const handleTableClick = async (table: RestaurantTable) => {
    if (table.status === 'AVAILABLE') {
      const newSessionId = await openTableSession(table.id);
      if (newSessionId) {
        setActiveOrder({ tableId: table.id, sessionId: newSessionId, tableName: table.name, items: [] });
      }
    } else {
      // في تطبيق حقيقي، هنا يتم جلب الطلب المفتوح لهذه الطاولة
      const orderData = await getOpenTableOrder(table.id);
      if (orderData) {
          setActiveOrder({
              tableId: table.id,
              sessionId: orderData.sessionId,
              orderId: orderData.orderId,
              tableName: table.name,
              items: orderData.items
          });
      } else {
          showToast('لا يوجد طلب نشط لهذه الطاولة، أو حدث خطأ في الجلب.', 'error');
      }
    }
  };

  const addItemToOrder = (product: Product) => {
    if (!activeOrder) {
      showToast('الرجاء تحديد طاولة أولاً', 'warning');
      return;
    }
    setActiveOrder(prevOrder => {
      if (!prevOrder) return null;
      const existingItem = prevOrder.items.find(item => item.productId === product.id);
      let newItems;
      if (existingItem) {
        newItems = prevOrder.items.map(item => item.productId === product.id ? { ...item, quantity: (item.quantity || 0) + 1 } : item);
      } else {
        newItems = [...prevOrder.items, { productId: product.id, name: product.name, quantity: 1, price: product.sales_price || product.price || 0, savedQuantity: 0 }];
      }
      return { ...prevOrder, items: newItems };
    });
  };

  const updateOrderItem = (productId: string, change: number) => {
    setActiveOrder(prevOrder => {
      if (!prevOrder) return null;
      const newItems = prevOrder.items.map(item => {
        if (item.productId === productId) {
          // لا نسمح بتقليل الكمية عن الكمية المحفوظة مسبقاً (التي تم طلبها بالفعل)
          const minQty = item.savedQuantity || 0;
          const newQty = Math.max(minQty, item.quantity + change);
          return { ...item, quantity: newQty };
        }
        return item;
      }).filter(item => item.quantity > 0);
      return { ...prevOrder, items: newItems };
    });
  };

    const handleAcceptOrder = async () => {
        if (!activeOrder) return;
        
        // نرسل فقط العناصر التي زادت كميتها عن المحفوظ (الجديدة)
        const itemsToSend = activeOrder.items
            .filter(item => item.quantity > (item.savedQuantity || 0))
            .map(item => ({
                productId: item.productId,
                quantity: item.quantity - (item.savedQuantity || 0), // نرسل الفرق فقط
                unitPrice: item.price, // إصلاح: تمرير السعر كـ unitPrice
                notes: item.notes
            }));

        if (itemsToSend.length === 0) {
            showToast('لا يمكن إرسال طلب فارغ', 'warning');
            return;
        }

        setIsSubmitting(true);
        try {
            const newOrderId = await createRestaurantOrder({
                sessionId: activeOrder.sessionId,
                items: itemsToSend
            });

            // بعد الإرسال، نقوم بتحديث الحالة ليعكس أن الأصناف تم حفظها (أو إعادة تحميل الطلب بالكامل)
            // للتبسيط هنا، سنعيد تحميل الطلب عند الضغط على الطاولة مرة أخرى، ولكن يمكننا تحديث الحالة محلياً
            if (activeOrder) {
                setActiveOrder(null);
            }
        } finally {
            setIsSubmitting(false);
        }
    };

    const handlePaymentClick = () => {
      if (!activeOrder?.orderId) return;
      setIsPaymentModalOpen(true);
    };

    const handleConfirmPayment = async (method: 'CASH' | 'CARD') => {
      if (!activeOrder || !activeOrder.orderId) return;
      
      // حساب الإجمالي
      const subtotal = activeOrder.items.reduce((sum, item) => sum + (item.price * item.quantity), 0);
      const tax = subtotal * ((settings.vatRate || 15) / 100);
      const total = subtotal + tax;

      // Save the order details for printing before clearing the state
      setOrderToPrint(activeOrder);

      await completeRestaurantOrder(activeOrder.orderId, method, total);
      setIsPaymentModalOpen(false);
      setActiveOrder(null); // مسح الطلب النشط بعد الدفع
    };

    const handleAddTable = () => {
        setIsAddModalOpen(true);
    };

    const handleSaveNewTable = async (data: { name: string, capacity: number, section: string }) => {
      await addRestaurantTable(data);
      setIsAddModalOpen(false); // Close modal on success
    };

    const handleEditTable = (table: RestaurantTable) => {
        setEditingTable(table);
    };

    const handleSaveUpdatedTable = async (id: string, data: { name: string, capacity: number, section: string }) => {
      await updateRestaurantTable(id, data);
      setEditingTable(null); // Close modal on success
    };

    const handleDeleteTable = async (table: RestaurantTable) => {
        if (window.confirm(`هل أنت متأكد من حذف الطاولة "${table.name}"؟ لا يمكن التراجع عن هذا الإجراء.`)) {
            await deleteRestaurantTable(table.id);
        }
    };

  const sections = [...new Set(restaurantTables.map(t => t.section || 'عام'))];


    return (
    <div className="h-[calc(100vh-4rem)] bg-slate-100 flex flex-col p-4 gap-4" dir="rtl">
      <header className="bg-white rounded-lg shadow-sm p-3 flex justify-between items-center">
          <h1 className="text-xl font-bold text-slate-800 flex items-center gap-2"><Utensils className="text-blue-600" /> نقطة بيع المطاعم</h1>
        <div className="flex bg-slate-100 p-1 rounded-lg">
          <button onClick={() => setActiveTab('dine-in')} className={`px-4 py-2 rounded-md text-sm font-semibold flex items-center gap-2 ${activeTab === 'dine-in' ? 'bg-white shadow text-blue-600' : 'text-slate-600'}`}><LayoutGrid size={16} /> طاولات</button>
          <button onClick={() => setActiveTab('takeaway')} className={`px-4 py-2 rounded-md text-sm font-semibold flex items-center gap-2 ${activeTab === 'takeaway' ? 'bg-white shadow text-blue-600' : 'text-slate-600'}`}><Coffee size={16} /> سفري</button>
          <button onClick={() => setActiveTab('delivery')} className={`px-4 py-2 rounded-md text-sm font-semibold flex items-center gap-2 ${activeTab === 'delivery' ? 'bg-white shadow text-blue-600' : 'text-slate-600'}`}><HardHat size={16} /> توصيل</button>
        </div>
      </header>

      <main className="flex-1 grid grid-cols-12 gap-4 overflow-hidden">
        {/* Left Section: Tables / Order Details */}
        <section className="col-span-12 lg:col-span-4 h-full">
          <div className="p-4 bg-white rounded-lg shadow-sm h-full overflow-y-auto">
              <h3 className="text-lg font-bold mb-4 text-slate-700">الطاولات</h3>
            <button onClick={handleAddTable} className="bg-green-500 text-white px-4 py-2 rounded-lg font-bold hover:bg-green-700 transition-colors">+ إضافة طاولة</button>

            {sections.map((section: string) => (
              <div key={section as Key} className="mb-6">
                <h4 className="font-semibold text-slate-500 border-b pb-2 mb-3">{section}</h4>

                  <div className="grid grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                  {restaurantTables.filter(t => (t.section || 'عام') === section).map(table => (
                    <TableCard 
                      key={table.id} 
                      table={table} 
                      onClick={() => handleTableClick(table)} 
                      isActive={activeOrder?.tableId === table.id}
                      onDelete={() => handleDeleteTable(table)}
                      onEdit={() => handleEditTable(table)}/>
                  ))}
                </div>
              </div>
            ))}
            {restaurantTables.length === 0 && <div className="text-center py-10 text-slate-500">لا توجد طاولات مُعرَّفة</div>}
          </div>
        </section>

        {/* Middle Section: Menu */}
        <section className="col-span-12 lg:col-span-5 h-full">
          <div className="p-4 bg-white rounded-lg shadow-sm h-full flex flex-col">
            <div className="flex space-x-2 rtl:space-x-reverse overflow-x-auto pb-3 mb-3">
              <div className="relative flex-shrink-0">
                <input type="text" placeholder="بحث عن صنف" className="bg-slate-50 border border-slate-200 rounded-full px-4 py-2 text-sm" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
                <div className="absolute inset-y-0 left-0 flex items-center pointer-events-none pl-3">
                  <Search className="text-slate-400 w-4 h-4" />
                </div>
              </div>
              {menuCategories?.map(cat => (
                <button
                  key={cat.id}
                  onClick={() => setActiveCategory(cat.id)}
                  className={`px-4 py-2 rounded-full text-sm font-semibold whitespace-nowrap transition-colors ${activeCategory === cat.id ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
                  >
                  {cat.name}
                </button>
              ))}
            </div>
            <div className="flex-1 overflow-y-auto">
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {menuItems.map(item => (
                  <MenuItemCard key={item.id} item={item} onClick={() => addItemToOrder(item)} />
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* Right Section: Order Summary */}
        <section className="col-span-12 lg:col-span-3 h-full">
          <OrderSummary 
            order={activeOrder} 
            onUpdateItem={updateOrderItem} 
            onClearOrder={clearOrder} 
            onAcceptOrder={handleAcceptOrder}
            onPayment={handlePaymentClick}
            isSubmitting={isSubmitting} />
        </section>
      </main>
      <AddTableModal 
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        onSave={handleSaveNewTable}
        sections={sections}
      />
      <EditTableModal 
        isOpen={!!editingTable}
        onClose={() => setEditingTable(null)}
        onSave={handleSaveUpdatedTable}
        table={editingTable}
        sections={sections}
      />
      <PaymentModal 
        isOpen={isPaymentModalOpen}
        onClose={() => setIsPaymentModalOpen(false)}
        onConfirm={handleConfirmPayment}
        totalAmount={activeOrder ? (activeOrder.items.reduce((sum, item) => sum + item.price * item.quantity, 0) * (1 + (settings.vatRate || 15) / 100)) : 0}
      />
      {/* Hidden component for printing */}
      <div style={{ display: 'none' }}>
        <PrintableInvoice ref={printRef} order={orderToPrint} settings={settings} />
      </div>
    </div>
  );
};

export default PosScreen;
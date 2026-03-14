import React, { useState, useMemo } from 'react';
import type { Key, ReactNode } from 'react';
import { useToast } from '../context/ToastContext';
import { useAccounting } from '../context/AccountingContext';
import { RestaurantTable, Product } from '../types';
import { Coffee, HardHat, LayoutGrid, Utensils, Plus, Trash2, Minus, Edit } from 'lucide-react';
import type { Dispatch, SetStateAction } from 'react';



// --- أنواع البيانات المحلية للطلب ---
interface OrderItem {
  productId: string;
  name: string;
  quantity: number;
  price: number;
  notes?: string;
}

interface ActiveOrder {
  tableId: string;
  tableName: string;
  items: OrderItem[];
}

// --- المكونات الفرعية ---

const TableCard = ({ table, onClick, isActive }: { table: RestaurantTable; onClick: () => void; isActive: boolean }) => {
  const statusStyles: { [key: string]: string } = {
    AVAILABLE: 'bg-green-100 text-green-800 border-green-300 hover:bg-green-200',
    OCCUPIED: 'bg-red-100 text-red-800 border-red-300 hover:bg-red-200',
    RESERVED: 'bg-yellow-100 text-yellow-800 border-yellow-300 hover:bg-yellow-200',
  };
  const statusText: { [key: string]: string } = { AVAILABLE: 'متاحة', OCCUPIED: 'مشغولة', RESERVED: 'محجوزة' };
  
  return (
    <div
      onClick={onClick}
      className={`p-4 rounded-lg border-2 cursor-pointer transition-all ${statusStyles[table.status]} ${isActive ? 'ring-4 ring-blue-400' : ''}`}
    >
      <div className="font-bold text-xl">{table.name}</div>
      <div className="text-xs">{statusText[table.status]}</div>
    </div>
  );
};

const MenuItemCard = ({ item, onClick }: { item: Product; onClick: () => void }) => (
  <div onClick={onClick} className="bg-white border border-slate-200 rounded-lg p-3 text-center cursor-pointer hover:bg-blue-50 hover:border-blue-300 transition-all h-full flex flex-col justify-between shadow-sm">
    <div className="font-semibold text-slate-800 text-sm">{item.name}</div>
    <div className="text-sm font-bold text-blue-600 mt-2">{(item.sales_price || item.price || 0).toFixed(2)} SAR</div>
  </div>
);

const OrderSummary = ({ order, onUpdateItem, onClearOrder }: { order: ActiveOrder | null; onUpdateItem: (productId: string, change: number) => void; onClearOrder: () => void; }) => {
  const { settings } = useAccounting();
  const { showToast } = useToast();
  const totals = useMemo(() => {
    if (!order) return { subtotal: 0, tax: 0, total: 0 };
    const subtotal = order.items.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    const tax = subtotal * ((settings.vatRate || 15) / 100);
    const total = subtotal + tax;
    return { subtotal, tax, total };
  }, [order, settings.vatRate]);

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
      <div className="flex-1 p-2 overflow-y-auto space-y-2">
        {order.items.map(item => (
          <div key={item.productId} className="flex justify-between items-center bg-slate-50 p-2 rounded-lg">
            <div className="flex-1">
              <div className="font-semibold text-sm">{item.name}</div>
              <div className="text-xs text-slate-500">{(item.price).toFixed(2)}</div>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => onUpdateItem(item.productId, -1)} className="p-1 bg-red-100 text-red-600 rounded-full"><Minus size={12} /></button>
              <span className="font-bold w-6 text-center">{item.quantity}</span>
              <button onClick={() => onUpdateItem(item.productId, 1)} className="p-1 bg-emerald-100 text-emerald-600 rounded-full"><Plus size={12} /></button>
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
      <div className="p-3">
        <button className="w-full bg-blue-600 text-white font-bold py-4 rounded-lg hover:bg-blue-700 transition-colors text-lg disabled:opacity-50" disabled={order?.items.length === 0}>
          قبول الطلب ({totals.total.toFixed(2)})
        </button>
      </div>
    </div>
  );
};

// --- المكون الرئيسي ---

const PosScreen = () => {
  const { restaurantTables, openTableSession, menuCategories, products, can } = useAccounting();
  const [activeTab, setActiveTab] = useState('dine-in');
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [activeOrder, setActiveOrder] = useState<ActiveOrder | null>(null);

  React.useEffect(() => {
    if (menuCategories.length > 0 && !activeCategory) {
      setActiveCategory(menuCategories[0].id);
    }
  }, [menuCategories, activeCategory]);

  const menuItems = useMemo(() => {
    return products.filter(p => p.product_type === 'MENU_ITEM' && (p.category_id === activeCategory));
  }, [products, activeCategory, can]);

  const handleTableClick = async (table: RestaurantTable) => {
    if (table.status === 'AVAILABLE') {
      const newSessionId = await openTableSession(table.id);
      if (newSessionId) {
        setActiveOrder({ tableId: table.id, tableName: table.name, items: [] });
      }
    } else {
      // في تطبيق حقيقي، هنا يتم جلب الطلب المفتوح لهذه الطاولة
      setActiveOrder({ tableId: table.id, tableName: table.name, items: [] }); // حالياً نبدأ طلب فارغ
    }
  };

  const addItemToOrder = (product: Product) => {
        const { showToast } = useToast();
     if (!activeOrder) {  
      showToast('الرجاء تحديد طاولة أولاً', 'warning');
      return;
    }
    setActiveOrder(prevOrder => {
      if (!prevOrder) return null;
      const existingItem = prevOrder.items.find(item => item.productId === product.id);
      let newItems;
      if (existingItem) {
        newItems = prevOrder.items.map(item => item.productId === product.id ? { ...item, quantity: item.quantity + 1 } : item);
      } else {
        newItems = [...prevOrder.items, { productId: product.id, name: product.name, quantity: 1, price: product.sales_price || product.price || 0 }];
      }
      return { ...prevOrder, items: newItems };
    });
  };

  const updateOrderItem = (productId: string, change: number) => {
    setActiveOrder(prevOrder => {
      if (!prevOrder) return null;
      const newItems = prevOrder.items.map(item => {
        if (item.productId === productId) {
          return { ...item, quantity: Math.max(0, item.quantity + change) };
        }
        return item;
      }).filter(item => item.quantity > 0); // إزالة الصنف إذا كانت كميته صفر
      return { ...prevOrder, items: newItems };
    });
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
            {sections.map((section: string) => (
              <div key={section as Key} className="mb-6">
                <h4 className="font-semibold text-slate-500 border-b pb-2 mb-3">{section}</h4>
                  <div className="grid grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                  {restaurantTables.filter(t => (t.section || 'عام') === section).map(table => (
                    <TableCard key={table.id} table={table} onClick={() => handleTableClick(table)} isActive={activeOrder?.tableId === table.id} />
                      ))}
                </div>
              </div>
            ))}
            {restaurantTables.length === 0 && <div className="text-center py-10 text-slate-500">لا توجد طاولات معرفة</div>}
          </div>
        </section>

        {/* Middle Section: Menu */}
        <section className="col-span-12 lg:col-span-5 h-full">
          <div className="p-4 bg-white rounded-lg shadow-sm h-full flex flex-col">
            <div className="flex space-x-2 rtl:space-x-reverse overflow-x-auto pb-3 mb-3">
              {menuCategories.map(cat => (
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
          <OrderSummary order={activeOrder} onUpdateItem={updateOrderItem} onClearOrder={() => setActiveOrder(null)} />
        </section>
      </main>
    </div>
  );
};

export default PosScreen;
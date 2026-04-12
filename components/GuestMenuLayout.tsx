import React, { useState, useEffect, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import { Utensils, ShoppingCart, X, Plus, Minus, Send, Loader2, ImageIcon, Star, Percent, Layers, CreditCard, Lock, CheckCircle } from 'lucide-react';
import { useToast } from '../context/ToastContext';
import { ModifierSelectionModal } from './ModifierSelectionModal';
import type { SelectedModifier } from '../types';

// --- Types ---
type Product = {
  id: string;
  name: string;
  sales_price: number;
  image_url: string | null;
  category_id: string | null;
  offer_price?: number | null;
  offer_start_date?: string | null;
  offer_end_date?: string | null;
  has_modifiers?: boolean;
  cost?: number;
};

type Category = {
  id: string;
  name: string;
};

type CartItem = {
  localId: string; // Unique ID for the cart line item
  id: string; // Product ID
  name: string;
  quantity: number;
  unitPrice: number;
  basePrice: number;
  image_url: string | null;
  notes: string;
  selectedModifiers: SelectedModifier[];
  cost: number;
};

const isOfferActive = (item: Product) => {
  const today = new Date().toISOString().split('T')[0];
  return !!(item.offer_price && item.offer_price > 0 &&
    item.offer_start_date && item.offer_end_date &&
    today >= item.offer_start_date && today <= item.offer_end_date);
};

const GuestMenuLayout = () => {
  const { qrKey } = useParams<{ qrKey: string }>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [cart, setCart] = useState<CartItem[]>([]);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const { showToast } = useToast();
  const [isModifierModalOpen, setIsModifierModalOpen] = useState(false);
  const [productForModifiers, setProductForModifiers] = useState<Product | null>(null);
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        
        // 🛡️ فحص صحة الرمز ومنع الرموز التالفة (مثل [object Object])
        const cleanKey = qrKey?.trim();
        if (!cleanKey || cleanKey.includes('[object') || cleanKey.length < 10) {
          throw new Error('رمز QR غير صالح أو مفقود. يرجى إعادة مسح الرمز الموجود على الطاولة.');
        }

        // 1. تحديد المنظمة (المطعم) من خلال رمز الطاولة الممسوح
        const { data: tableData, error: tableError } = await supabase
          .from('restaurant_tables')
          .select('organization_id')
          .eq('qr_access_key', qrKey)
          .maybeSingle();

        if (tableError) throw tableError;
        if (!tableData) throw new Error('لم يتم العثور على بيانات الطاولة. يرجى إعادة مسح الرمز.');

        const orgId = tableData.organization_id;

        // 2. جلب التصنيفات والمنتجات الخاصة بهذا المطعم فقط
        const [categoriesRes, productsRes] = await Promise.all([
          supabase.from('menu_categories').select('id, name').eq('organization_id', orgId).order('display_order'),
          supabase.from('products').select('id, name, sales_price, image_url, category_id, offer_price, offer_start_date, offer_end_date, available_modifiers, cost').eq('organization_id', orgId).eq('product_type', 'MANUFACTURED').eq('is_active', true)
        ]);

        if (categoriesRes.error) throw categoriesRes.error;
        if (productsRes.error) throw productsRes.error;

        // تحويل البيانات لإضافة علم "has_modifiers" يدوياً (لتجنب الاعتماد على View مفقودة)
        const processedProducts = (productsRes.data || []).map(p => ({
          ...p,
          has_modifiers: Array.isArray(p.available_modifiers) && p.available_modifiers.length > 0
        }));

        setCategories(categoriesRes.data || []);
        setProducts(processedProducts);
        if (categoriesRes.data && categoriesRes.data.length > 0) {
          setSelectedCategory(categoriesRes.data[0].id);
        }
      } catch (err: any) {
        console.error("Menu Loading Error:", err);
        setError(err.message || 'فشل تحميل قائمة الطعام. يرجى استدعاء النادل.');
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  const filteredProducts = useMemo(() => {
    if (selectedCategory === 'all') return products;
    return products.filter(p => p.category_id === selectedCategory);
  }, [products, selectedCategory]);

  const addToCart = (product: Product) => {
    if (product.has_modifiers) {
      setProductForModifiers(product);
      setIsModifierModalOpen(true);
    } else {
      const price = isOfferActive(product) ? product.offer_price! : product.sales_price;
      const newItem: CartItem = {
        localId: `cart-item-${Date.now()}`,
        id: product.id,
        name: product.name,
        quantity: 1,
        unitPrice: price,
        basePrice: product.sales_price,
        image_url: product.image_url,
        notes: '',
        selectedModifiers: [],
        cost: product.cost || 0,
      };
      setCart(prev => [...prev, newItem]);
    }
  };

  const handleConfirmModifiers = (selectedModifiers: SelectedModifier[], totalPrice: number, totalUnitCost: number, notes: string) => {
    if (!productForModifiers) return;

    const newItem: CartItem = {
      localId: `cart-item-${Date.now()}`,
      id: productForModifiers.id,
      name: productForModifiers.name,
      quantity: 1,
      unitPrice: totalPrice,
      basePrice: productForModifiers.sales_price,
      image_url: productForModifiers.image_url,
      notes: notes,
      selectedModifiers: selectedModifiers,
      cost: totalUnitCost,
    };
    setCart(prev => [...prev, newItem]);
    setIsModifierModalOpen(false);
    setProductForModifiers(null);
  };

  const updateCart = (localId: string, change: number) => {
    setCart(prev => {
      return prev.map(item => {
        if (item.localId === localId) {
          return { ...item, quantity: Math.max(0, item.quantity + change) };
        }
        return item;
      }).filter(item => item.quantity > 0);
    });
  };
const updateItemNotes = (localId: string, newNotes: string) => {
    setCart(prev => prev.map(item =>
      item.localId === localId ? { ...item, notes: newNotes } : item
    ));
  };
  const sendOrder = async () => {
    if (cart.length === 0) return;
    
    // تنظيف رمز QR (إزالة المسافات الزائدة) دون فرض regex صارم
    const cleanQrKey = qrKey ? qrKey.trim() : '';
    if (!cleanQrKey) {
      showToast('❌ رمز QR مفقود في الرابط.', 'error');
      return;
    }

    setIsSending(true);
    try {
      // تجهيز البيانات (snake_case فقط لتوافق قاعدة البيانات وتجنب التعارض)
      const payloadItems = cart.filter(item => item.id).map(item => ({
        product_id: item.id,
        quantity: Math.max(1, Number(item.quantity) || 1),
        unit_price: Math.max(0, Number(item.unitPrice) || 0),
        unit_cost: Math.max(0, Number(item.cost) || 0),
        notes: item.notes || '',
        modifiers: (item.selectedModifiers || []).map(m => ({
          modifier_id: m.modifierId,
          name: m.name,
          price: Number(m.price || 0),
          cost: Number(m.cost || 0),
          quantity: 1
        }))
      }));

      const { error } = await supabase.rpc('create_public_order', {
        p_qr_key: cleanQrKey,
        p_items: payloadItems
      });
      
      if (error) throw error;

      showToast('✅ تم إرسال طلبك بنجاح! سيصلك قريباً.', 'success');
      setCart([]);
      setIsCartOpen(false);
    } catch (err: any) {
      console.error("Guest Order Error:", err);
      // عرض تفاصيل الخطأ الفعلية للمساعدة في التشخيص
      let errorMsg = err.message || err.details || 'خطأ غير معروف';
      
      // معالجة خطأ الكاش (Schema Cache) الشائع عند إضافة دوال جديدة
      if (err.code === 'PGRST202') {
          errorMsg = 'خطأ اتصال (Schema Cache). يرجى من المسؤول تحديث قاعدة البيانات.';
          console.warn("⚠️ FIX REQUIRED: Run this SQL in Supabase: NOTIFY pgrst, 'reload config';");
          
          if (process.env.NODE_ENV === 'development') {
             errorMsg += ` (نفذ أمر SQL: NOTIFY pgrst, 'reload config';)`;
          }
      } 
      // معالجة خطأ تنسيق UUID من قاعدة البيانات (Code 22P02)
      else if (err.code === '22P02' || err.message?.includes('invalid input syntax for type uuid')) {
          errorMsg = 'رابط القائمة يحتوي على رمز غير صالح. يرجى إعادة مسح رمز QR.';
      }

      showToast(`❌ فشل إرسال الطلب: ${errorMsg}`, 'error');
    } finally {
      setIsSending(false);
    }
  };

  const cartTotal = useMemo(() => cart.reduce((sum, item) => sum + (item.quantity * item.unitPrice), 0), [cart]);

  if (loading) {
    return <div className="h-screen bg-slate-50 flex flex-col items-center justify-center text-slate-600"><Loader2 className="animate-spin mb-4" size={48} /> <p className="font-bold">جاري تحميل قائمة الطعام...</p></div>;
  }

  if (error) {
    return <div className="h-screen bg-red-50 flex flex-col items-center justify-center text-red-600 p-4 text-center"><Utensils size={48} className="mb-4" /> <p className="font-bold text-lg">{error}</p></div>;
  }

  return (
    <div className="bg-slate-100 min-h-screen font-sans" dir="rtl">
      <header className="bg-white shadow-sm p-4 sticky top-0 z-20">
        <h1 className="text-2xl font-black text-slate-800 text-center">قائمة الطعام</h1>
        <div className="flex items-center space-x-2 rtl:space-x-reverse overflow-x-auto pb-2 mt-4 -mb-2">
          {categories.map(cat => (
            <button key={cat.id} onClick={() => setSelectedCategory(cat.id)} className={`px-4 py-2 rounded-full text-sm font-bold whitespace-nowrap transition-colors ${selectedCategory === cat.id ? 'bg-blue-600 text-white' : 'bg-slate-200 text-slate-700 hover:bg-slate-300'}`}>
              {cat.name}
            </button>
          ))}
        </div>
      </header>

      <main className="p-4 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 pb-24">
        {filteredProducts.map(product => (
          <MenuItemCard key={product.id} item={product} onAddToCart={() => addToCart(product)} />
        ))}
      </main>

      {cart.length > 0 && <FloatingCartButton cart={cart} onOpenCart={() => setIsCartOpen(true)} total={cartTotal} />}

      <CartModal 
        isOpen={isCartOpen} 
        onClose={() => setIsCartOpen(false)} 
        cart={cart} 
        onUpdate={updateCart} 
        onUpdateNotes={updateItemNotes} 
        onSendOrder={sendOrder} 
        onPayOnline={() => { setIsCartOpen(false); setIsPaymentModalOpen(true); }}
        isSending={isSending} 
        total={cartTotal} 
      />

      {productForModifiers && (
        <ModifierSelectionModal
          isOpen={isModifierModalOpen}
          onClose={() => setIsModifierModalOpen(false)}
          product={{
            id: productForModifiers.id,
            name: productForModifiers.name,
            price: productForModifiers.sales_price,
            cost: productForModifiers.cost || 0
          }}
          onConfirm={handleConfirmModifiers}
        />
      )}

      <GuestPaymentModal 
        isOpen={isPaymentModalOpen} 
        onClose={() => setIsPaymentModalOpen(false)} 
        total={cartTotal}
        onSuccess={async () => {
            setIsPaymentModalOpen(false);
            await sendOrder();
        }} 
      />
    </div>
  );
};

const MenuItemCard = ({ item, onAddToCart }: { item: Product, onAddToCart: () => void }) => {
  const offer = isOfferActive(item);
  const price = offer ? item.offer_price! : item.sales_price;

  return (
    <div className="bg-white rounded-2xl shadow-md overflow-hidden flex flex-col group transition-all hover:shadow-xl hover:-translate-y-1">
      <div className="relative">
        {item.image_url ? (
          <img src={item.image_url} alt={item.name} className="w-full h-32 object-cover" />
        ) : (
          <div className="w-full h-32 bg-slate-100 flex items-center justify-center text-slate-300"><ImageIcon size={40} /></div>
        )}
        {offer && (
          <div className="absolute top-2 right-2 bg-red-500 text-white text-xs font-bold px-2 py-1 rounded-full flex items-center gap-1 animate-pulse">
            <Percent size={12} /> عرض
          </div>
        )}
        {item.has_modifiers && (
          <div className="absolute bottom-2 right-2 bg-slate-800/70 text-white text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1 backdrop-blur-sm">
            <Layers size={10} /> تخصيص
          </div>
        )}
      </div>
      <div className="p-3 flex-1 flex flex-col">
        <h3 className="font-bold text-slate-800 text-sm flex-1 line-clamp-2">{item.name}</h3>
        <div className="flex justify-between items-center mt-3">
          <div className="font-black text-blue-600">
            {price.toFixed(2)}
            {offer && <span className="text-xs text-slate-400 line-through ml-1">{item.sales_price.toFixed(2)}</span>}
          </div>
          <button onClick={onAddToCart} className="bg-blue-50 text-blue-600 p-2 rounded-full hover:bg-blue-100 transition-colors">
            <Plus size={16} />
          </button>
        </div>
      </div>
    </div>
  );
};

interface CartModalProps {
  isOpen: boolean;
  onClose: () => void;
  cart: CartItem[];
  onUpdate: (localId: string, change: number) => void;
  onUpdateNotes: (localId: string, newNotes: string) => void;
  onSendOrder: () => void;
  onPayOnline: () => void;
  isSending: boolean;
  total: number;
}

const CartModal: React.FC<CartModalProps> = ({ isOpen, onClose, cart, onUpdate, onUpdateNotes, onSendOrder, onPayOnline, isSending, total }) => {
    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-end justify-center" onClick={onClose}>
            <div className="bg-white w-full max-w-lg rounded-t-3xl shadow-2xl animate-in slide-in-from-bottom-full duration-300" onClick={e => e.stopPropagation()}>
                <div className="p-4 border-b flex justify-between items-center">
                    <h2 className="font-bold text-lg text-slate-800">سلة الطلبات</h2>
                    <button onClick={onClose} className="text-slate-400 hover:text-red-500 p-1"><X size={20} /></button>
                </div>

                <div className="p-4 max-h-[50vh] overflow-y-auto space-y-3">
                    {cart.map(item => (
                        <div key={item.localId} className="flex flex-col gap-2 bg-slate-50 p-3 rounded-xl">
                            <div className="flex items-center gap-3">
                                {item.image_url ? (
                                    <img src={item.image_url} alt={item.name} className="w-16 h-16 object-cover rounded-lg" />
                                ) : (
                                    <div className="w-16 h-16 bg-slate-200 rounded-lg flex items-center justify-center text-slate-400"><ImageIcon /></div>
                                )}
                                <div className="flex-1">
                                    <p className="font-bold text-sm text-slate-800">{item.name}</p>
                                    {item.selectedModifiers && item.selectedModifiers.length > 0 && (
                                      <div className="text-[10px] text-blue-600 font-medium mt-1">
                                        {item.selectedModifiers.map(m => m.name).join(', ')}
                                      </div>
                                    )}
                                    <p className="font-black text-blue-600 text-sm">{item.unitPrice.toFixed(2)} SAR</p>
                                </div>
                                <div className="flex items-center gap-2">
                                    <button onClick={() => onUpdate(item.localId, -1)} className="bg-red-100 text-red-600 p-2 rounded-full"><Minus size={12} /></button>
                                    <span className="font-bold w-6 text-center">{item.quantity}</span>
                                    <button onClick={() => onUpdate(item.localId, 1)} className="bg-emerald-100 text-emerald-600 p-2 rounded-full"><Plus size={12} /></button>
                                </div>
                            </div>
                            <input
                                type="text"
                                placeholder="أضف ملاحظات (مثل: بدون بصل، قليل الملح...)"
                                value={item.notes}
                                onChange={(e) => onUpdateNotes(item.localId, e.target.value)}
                                className="w-full bg-white border border-slate-200 rounded-md px-3 py-1.5 text-sm focus:ring-1 focus:ring-blue-500 outline-none"
                            />
                        </div>
                    ))}
                </div>

                <div className="p-4 border-t bg-slate-50 space-y-4">
                    <div className="flex justify-between items-center text-lg font-bold mb-2">
                        <span>الإجمالي</span>
                        <span>{total.toFixed(2)} SAR</span>
                    </div>
                    
                    <div className="grid gap-3">
                        <button
                            onClick={onPayOnline}
                            disabled={isSending}
                            className="w-full bg-slate-900 text-white font-bold py-3.5 rounded-xl shadow-lg hover:bg-slate-800 transition-opacity flex items-center justify-center gap-2 disabled:opacity-50"
                        >
                            <CreditCard size={20} /> الدفع أونلاين (Apple Pay / بطاقة)
                        </button>
                        <button
                            onClick={onSendOrder}
                            disabled={isSending}
                            className="w-full bg-white text-blue-600 border-2 border-blue-100 font-bold py-3.5 rounded-xl hover:bg-blue-50 transition-opacity flex items-center justify-center gap-2 disabled:opacity-50"
                        >
                            {isSending ? <Loader2 className="animate-spin" /> : <Send size={20} />}
                            {isSending ? 'جاري الإرسال...' : 'الدفع عند الاستلام (كاش)'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

const FloatingCartButton = ({ cart, onOpenCart, total }: { cart: CartItem[], onOpenCart: () => void, total: number }) => {
  const itemCount = cart.reduce((sum, item) => sum + item.quantity, 0);

  return (
    <div className="fixed bottom-0 left-0 right-0 p-4 z-40">
      <button
        onClick={onOpenCart}
        className="w-full max-w-lg mx-auto bg-gradient-to-r from-blue-600 to-indigo-700 text-white rounded-2xl p-4 flex justify-between items-center shadow-2xl shadow-blue-900/50 animate-in slide-in-from-bottom-5 duration-300"
      >
        <div className="flex items-center gap-3">
          <div className="relative">
            <ShoppingCart size={24} />
            <span className="absolute -top-2 -right-2 bg-white text-blue-600 text-xs font-bold w-5 h-5 rounded-full flex items-center justify-center">
              {itemCount}
            </span>
          </div>
          <span className="font-bold">عرض السلة</span>
        </div>
        <div className="font-black text-lg">
          {total.toFixed(2)} SAR
        </div>
      </button>
    </div>
  );
};

interface GuestPaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  total: number;
  onSuccess: () => void;
}

const GuestPaymentModal: React.FC<GuestPaymentModalProps> = ({ isOpen, onClose, total, onSuccess }) => {
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState<'form' | 'success'>('form');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    // Simulate payment processing
    await new Promise(resolve => setTimeout(resolve, 2000));
    setLoading(false);
    setStep('success');
    setTimeout(() => {
        onSuccess();
    }, 1500);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/60 z-[60] flex items-center justify-center p-4 backdrop-blur-sm" onClick={onClose} dir="rtl">
      <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200" onClick={e => e.stopPropagation()}>
        {step === 'form' ? (
            <form onSubmit={handleSubmit} className="p-6">
                <div className="flex justify-between items-center mb-6">
                    <h3 className="font-bold text-lg text-slate-800 flex items-center gap-2">
                        <CreditCard className="text-blue-600" /> الدفع الآمن
                    </h3>
                    <button type="button" onClick={onClose}><X className="text-slate-400 hover:text-red-500" /></button>
                </div>
                
                <div className="bg-slate-50 p-4 rounded-xl mb-6 text-center border border-slate-100">
                    <p className="text-slate-500 text-xs font-bold mb-1">المبلغ الإجمالي</p>
                    <p className="text-3xl font-black text-slate-800">{total.toFixed(2)} SAR</p>
                </div>

                <div className="space-y-4 mb-6">
                    <div>
                        <label className="block text-xs font-bold text-slate-600 mb-1">رقم البطاقة</label>
                        <div className="relative">
                            <input type="text" placeholder="0000 0000 0000 0000" className="w-full border rounded-lg px-4 py-3 pl-10 dir-ltr text-left font-mono focus:ring-2 ring-blue-500 outline-none transition-all" required />
                            <Lock className="absolute left-3 top-3.5 text-slate-400 w-4 h-4" />
                        </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-xs font-bold text-slate-600 mb-1">تاريخ الانتهاء</label>
                            <input type="text" placeholder="MM/YY" className="w-full border rounded-lg px-4 py-3 text-center font-mono focus:ring-2 ring-blue-500 outline-none transition-all" required />
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-slate-600 mb-1">CVC</label>
                            <input type="text" placeholder="123" className="w-full border rounded-lg px-4 py-3 text-center font-mono focus:ring-2 ring-blue-500 outline-none transition-all" required />
                        </div>
                    </div>
                </div>

                <button type="submit" disabled={loading} className="w-full bg-blue-600 text-white font-bold py-3.5 rounded-xl hover:bg-blue-700 transition-colors flex items-center justify-center gap-2 shadow-lg shadow-blue-200">
                    {loading ? <Loader2 className="animate-spin" /> : <Lock size={18} />}
                    {loading ? 'جاري المعالجة...' : `دفع ${total.toFixed(2)} SAR`}
                </button>
            </form>
        ) : (
            <div className="p-8 text-center">
                <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4 animate-in zoom-in">
                    <CheckCircle className="w-10 h-10 text-green-600" />
                </div>
                <h3 className="text-xl font-black text-slate-800 mb-2">تم الدفع بنجاح!</h3>
                <p className="text-slate-500 font-medium">جاري إرسال طلبك للمطبخ...</p>
            </div>
        )}
      </div>
    </div>
  );
};

export default GuestMenuLayout;

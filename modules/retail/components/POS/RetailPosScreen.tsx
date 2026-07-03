import React, { useState, useEffect, useRef } from 'react';
import { useToast } from '../../../../context/ToastContext';
import { supabase } from '../../../../supabaseClient';
import { useAccounting } from '../../../../context/AccountingContext';
import { db, offlineService } from '../../../../services/offlineService';
import type { CachedProduct } from '../../../../services/offlineService';
import { 
  Barcode, 
  Trash2, 
  Plus, 
  Minus, 
  Search, 
  Lock, 
  RefreshCw, 
  Wifi, 
  WifiOff, 
  Coins, 
  User, 
  ShoppingCart, 
  Printer, 
  Scale, 
  Volume2, 
  Loader2 
} from 'lucide-react';

interface CartItem {
  product: CachedProduct;
  quantity: number;
  weight?: number; // In case of weight scale product
}

export default function RetailPosScreen() {
  const { currentUser, organization, settings, refreshData } = useAccounting();
  const { showToast } = useToast();

  const currencySymbol = settings?.currency || 'ج.م';

  // Network Status
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  // Terminals and Shift State
  const [terminals, setTerminals] = useState<any[]>([]);
  const [selectedTerminal, setSelectedTerminal] = useState<any>(null);
  const [activeShift, setActiveShift] = useState<any>(null);
  const [isLoadingTerminals, setIsLoadingTerminals] = useState(true);

  // Opening Shift Dialog State
  const [openingBalance, setOpeningBalance] = useState<number>(0);
  const [isOpeningShift, setIsOpeningShift] = useState(false);

  // Closing Shift Dialog State
  const [isCloseModalOpen, setIsCloseModalOpen] = useState(false);
  const [actualCash, setActualCash] = useState<number>(0);
  const [closingNotes, setClosingNotes] = useState<string>('');
  const [isClosingShift, setIsClosingShift] = useState(false);
  const [shiftSummary, setShiftSummary] = useState<any>(null);

  // Cart State
  const [cart, setCart] = useState<CartItem[]>([]);
  const [barcodeInput, setBarcodeInput] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<CachedProduct[]>([]);
  
  // Payment State
  const [amountPaid, setAmountPaid] = useState<number>(0);
  
  // Printing Receipt State
  const [receiptOrder, setReceiptOrder] = useState<any>(null);
  const [isPrinting, setIsPrinting] = useState(false);

  // Audio for Scan confirmation
  const playBeep = () => {
    try {
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const oscillator = audioCtx.createOscillator();
      const gainNode = audioCtx.createGain();
      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(880, audioCtx.currentTime); // A5 note (clear beep)
      gainNode.gain.setValueAtTime(0.1, audioCtx.currentTime);
      oscillator.connect(gainNode);
      gainNode.connect(audioCtx.destination);
      oscillator.start();
      oscillator.stop(audioCtx.currentTime + 0.1);
    } catch (e) {
      console.warn('Audio context blocked or unsupported');
    }
  };

  // Focus references
  const barcodeInputRef = useRef<HTMLInputElement>(null);
  const printAreaRef = useRef<HTMLDivElement>(null);

  // Detect internet connection changes
  useEffect(() => {
    const goOnline = () => setIsOnline(true);
    const goOffline = () => setIsOnline(false);
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, []);

  // Sync Products & Fetch Terminals
  useEffect(() => {
    fetchTerminalsAndCheckShifts();
  }, [currentUser]);

  const [isSyncingProducts, setIsSyncingProducts] = useState(false);
  const handleSyncProducts = async () => {
    if (!currentUser) return;
    setIsSyncingProducts(true);
    try {
      await offlineService.syncProductsLocally(currentUser.organization_id);
      showToast('تم تحديث قائمة المنتجات والباركود بنجاح 🔄', 'success');
      playBeep();
    } catch (e: any) {
      showToast('فشل المزامنة: ' + e.message, 'error');
    } finally {
      setIsSyncingProducts(false);
    }
  };

  // Keep barcode input focused at all times for continuous scanning
  useEffect(() => {
    if (activeShift) {
      // Focus on mount/shift activation
      barcodeInputRef.current?.focus();

      const interval = setInterval(() => {
        if (document.activeElement !== barcodeInputRef.current && 
            document.activeElement?.tagName !== 'INPUT' && 
            document.activeElement?.tagName !== 'TEXTAREA') {
          barcodeInputRef.current?.focus();
        }
      }, 1000);

      // Redirect global key presses to barcode input immediately
      const handleGlobalKeyDown = (e: KeyboardEvent) => {
        if (e.ctrlKey || e.altKey || e.metaKey) return;
        if (e.key && e.key.startsWith('F') && e.key.length > 1) return;

        if (document.activeElement !== barcodeInputRef.current && 
            document.activeElement?.tagName !== 'INPUT' && 
            document.activeElement?.tagName !== 'TEXTAREA') {
          barcodeInputRef.current?.focus();
        }
      };

      window.addEventListener('keydown', handleGlobalKeyDown);

      return () => {
        clearInterval(interval);
        window.removeEventListener('keydown', handleGlobalKeyDown);
      };
    }
  }, [activeShift]);

  const fetchTerminalsAndCheckShifts = async () => {
    if (!currentUser) return;
    setIsLoadingTerminals(true);
    try {
      // 1. Fetch terminals
      const { data: termData, error: termErr } = await supabase
        .from('pos_terminals')
        .select('*')
        .eq('status', 'ACTIVE')
        .eq('organization_id', currentUser.organization_id);

      if (termErr) throw termErr;
      setTerminals(termData || []);

      // Seed a default terminal if none exists (demo purposes)
      if (!termData || termData.length === 0) {
        const { data: newTerm, error: seedErr } = await supabase
          .from('pos_terminals')
          .insert({
            name: 'الكاشير الرئيسي 1',
            organization_id: currentUser.organization_id
          })
          .select()
          .single();
        if (!seedErr && newTerm) {
          setTerminals([newTerm]);
        }
      }

      // 2. Sync products locally
      await offlineService.syncProductsLocally(currentUser.organization_id);

      // 3. Check if this user has an active shift on this device (check localStorage or database)
      let activeShiftDb = null;
      const cachedShift = localStorage.getItem(`tripro_shift_${currentUser.id}`);
      if (cachedShift) {
        const parsed = JSON.parse(cachedShift);
        // Verify with database if it's still open
        const { data: dbShift, error: shiftErr } = await supabase
          .from('shifts')
          .select('*, pos_terminals(*)')
          .eq('id', parsed.id)
          .is('end_time', null)
          .single();

        if (!shiftErr && dbShift) {
          activeShiftDb = dbShift;
        } else {
          localStorage.removeItem(`tripro_shift_${currentUser.id}`);
        }
      }

      // If not found in localStorage or cached shift was invalid, check DB for any open shift of this user
      if (!activeShiftDb) {
        const { data: dbShift, error: shiftErr } = await supabase
          .from('shifts')
          .select('*, pos_terminals(*)')
          .eq('user_id', currentUser.id)
          .eq('organization_id', currentUser.organization_id)
          .is('end_time', null)
          .order('start_time', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (!shiftErr && dbShift) {
          activeShiftDb = dbShift;
        }
      }

      if (activeShiftDb) {
        setActiveShift(activeShiftDb);
        setSelectedTerminal(activeShiftDb.pos_terminals || null);
        localStorage.setItem(`tripro_shift_${currentUser.id}`, JSON.stringify(activeShiftDb));
      }
    } catch (err) {
      console.error('Error in setup:', err);
    } finally {
      setIsLoadingTerminals(false);
    }
  };

  // Open Shift
  const handleOpenShift = async () => {
    if (!selectedTerminal) {
      showToast('الرجاء اختيار نقطة البيع/الكاشير أولاً', 'error');
      return;
    }
    setIsOpeningShift(true);
    try {
      // Resolve treasury account linked to terminal or fetch default
      let treasuryId = selectedTerminal.cash_account_id;
      if (!treasuryId) {
        const { data: mappings } = await supabase
          .from('company_settings')
          .select('account_mappings')
          .eq('organization_id', currentUser.organization_id)
          .single();
        treasuryId = mappings?.account_mappings?.CASH || null;
      }

      // Call start shift rpc
      const { data: newShift, error } = await supabase.rpc('start_pos_shift', {
        p_opening_balance: Number(openingBalance) || 0,
        p_resume_existing: false, // 🛡️ إنشاء وردية جديدة صراحة (ويفشل إذا كانت هناك وردية مفتوحة)
        p_treasury_account_id: treasuryId,
        p_user_id: currentUser.id,
        p_org_id: currentUser.organization_id,
        p_terminal_id: selectedTerminal.id
      });

      if (error) throw error;

      if (newShift && newShift.id) {
        // Fetch the full shift record
        const { data: fullShift } = await supabase
          .from('shifts')
          .select('*, pos_terminals(*)')
          .eq('id', newShift.id)
          .single();

        setActiveShift(fullShift);
        localStorage.setItem(`tripro_shift_${currentUser.id}`, JSON.stringify(fullShift));
        showToast('تم فتح الوردية بنجاح ✅', 'success');
      }
    } catch (err: any) {
      showToast(err.message || 'فشل فتح الوردية', 'error');
    } finally {
      setIsOpeningShift(false);
    }
  };

  // Close Shift Setup
  const handleOpenCloseShiftModal = async () => {
    if (!activeShift) return;
    try {
      // Fetch expected sales and balance from shifts
      const { data, error } = await supabase.rpc('get_current_shift_summary', {
        p_shift_id: activeShift.id
      });
      // Fallback query if RPC isn't built or fails
      if (error) {
        const { data: orders } = await supabase
          .from('orders')
          .select('grand_total')
          .eq('shift_id', activeShift.id);
        const totalSales = orders?.reduce((sum, o) => sum + Number(o.grand_total), 0) || 0;
        setShiftSummary({
          opening_balance: activeShift.opening_balance,
          total_sales: totalSales,
          cash_sales: totalSales,
          card_sales: 0,
          expected_cash: Number(activeShift.opening_balance) + totalSales
        });
      } else {
        setShiftSummary(data || {
          opening_balance: activeShift.opening_balance,
          total_sales: 0,
          cash_sales: 0,
          card_sales: 0,
          expected_cash: activeShift.opening_balance
        });
      }
      setActualCash(0);
      setIsCloseModalOpen(true);
    } catch (e) {
      console.error(e);
    }
  };

  // Close Shift Final
  const handleConfirmCloseShift = async () => {
    setIsClosingShift(true);
    try {
      const { error } = await supabase.rpc('close_shift', {
        p_shift_id: activeShift.id,
        p_actual_cash: Number(actualCash),
        p_notes: closingNotes || 'إغلاق وردية التجزئة السريعة',
        p_org_id: currentUser.organization_id
      });
      if (error) throw error;

      showToast('تم إغلاق الوردية وترحيل المبيعات بنجاح 🏁', 'success');
      localStorage.removeItem(`tripro_shift_${currentUser.id}`);
      setActiveShift(null);
      setCart([]);
      setIsCloseModalOpen(false);
      await refreshData();
    } catch (err: any) {
      showToast(err.message || 'فشل إغلاق الوردية', 'error');
    } finally {
      setIsClosingShift(false);
    }
  };

  // Weight Barcode Parser
  const parseWeightBarcode = (barcode: string) => {
    // 22PPPPPWWWWWX
    if ((barcode.startsWith('22') || barcode.startsWith('27')) && barcode.length === 13) {
      const productCode = barcode.substring(2, 7);
      const weightString = barcode.substring(7, 12);
      const weight = Number(weightString) / 1000; // e.g. 01250 -> 1.250 kg
      return { productCode, weight };
    }
    return null;
  };

  // Handle barcode submission
  const handleBarcodeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const code = barcodeInput.trim();
    if (!code) return;

    setBarcodeInput('');
    playBeep();

    try {
      let matchedProduct: CachedProduct | undefined;
      let weight: number | undefined;

      // 1. Check if it's a weight scale barcode
      const weightParse = parseWeightBarcode(code);
      if (weightParse) {
        const { productCode, weight: parsedWeight } = weightParse;
        // Search by Barcode or SKU fallback
        matchedProduct = await db.products.where('barcode').equals(productCode).first();
        if (!matchedProduct) {
          matchedProduct = await db.products.filter(p => p.sku === productCode).first();
        }
        weight = parsedWeight;
      } else {
        // 2. Search by normal barcode or SKU fallback
        matchedProduct = await db.products.where('barcode').equals(code).first();
        if (!matchedProduct) {
          matchedProduct = await db.products.filter(p => p.sku === code).first();
        }
      }

      if (matchedProduct) {
        addToCart(matchedProduct, weight);
      } else {
        showToast(`لم يتم العثور على صنف بالرمز: ${code}`, 'error');
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Add Product to Cart
  const addToCart = (product: CachedProduct, weight?: number) => {
    setCart(prev => {
      const existing = prev.find(item => item.product.id === product.id);
      if (existing) {
        if (weight !== undefined) {
          // Weight products replace weight or sum? Usually scales issue unique weight labels, so we append as a separate entry or sum
          return prev.map(item => 
            item.product.id === product.id 
              ? { ...item, quantity: item.quantity + 1, weight: (item.weight || 0) + weight }
              : item
          );
        } else {
          return prev.map(item => 
            item.product.id === product.id 
              ? { ...item, quantity: item.quantity + 1 }
              : item
          );
        }
      }
      return [...prev, { product, quantity: 1, weight }];
    });
  };

  // Update Cart Quantity
  const updateQuantity = (productId: string, delta: number) => {
    setCart(prev => prev.map(item => {
      if (item.product.id === productId) {
        const newQty = item.quantity + delta;
        return newQty > 0 ? { ...item, quantity: newQty } : item;
      }
      return item;
    }).filter(item => item.quantity > 0));
  };

  // Search Products locally
  useEffect(() => {
    const runSearch = async () => {
      if (!searchQuery.trim()) {
        setSearchResults([]);
        return;
      }
      const q = searchQuery.toLowerCase();
      const results = await db.products
        .filter(p => p.name.toLowerCase().includes(q) || (p.sku && p.sku.toLowerCase().includes(q)))
        .limit(10)
        .toArray();
      setSearchResults(results);
    };
    runSearch();
  }, [searchQuery]);

  // Calculations
  const isTaxEnabled = settings?.enable_tax !== false;
  const vatRate = isTaxEnabled ? (settings?.vat_rate !== undefined ? Number(settings.vat_rate) : 0.14) : 0;

  const subtotal = cart.reduce((sum, item) => {
    const price = item.product.sales_price;
    const qty = item.weight !== undefined ? item.weight : item.quantity;
    return sum + (price * qty);
  }, 0);

  const tax = subtotal * vatRate;
  const total = subtotal + tax;

  // Process Checkout
  const handlePayment = async () => {
    if (cart.length === 0) {
      showToast('سلة التسوق فارغة!', 'error');
      return;
    }
    if (amountPaid < total) {
      showToast('المبلغ المدفوع أقل من إجمالي الفاتورة', 'error');
      return;
    }

    const change = amountPaid - total;
    setIsPrinting(true);

    try {
      // Map cart items to order items schema
      const itemsPayload = cart.map(item => ({
        product_id: item.product.id,
        quantity: item.weight !== undefined ? item.weight : item.quantity,
        unit_price: item.product.sales_price,
        uom_id: null // Base Unit
      }));

      const orderData = {
        sessionId: null,
        userId: currentUser.id,
        orderType: 'TAKEAWAY',
        notes: 'مبيعات كاشير تجزئة سريعة',
        items: itemsPayload,
        warehouseId: selectedTerminal.warehouse_id || '00000000-0000-0000-0000-000000000000',
        orgId: currentUser.organization_id
      };

      let orderId: string | null = null;

      if (isOnline) {
        // 1. Create order on Supabase
        const { data, error } = await supabase.rpc('create_restaurant_order', {
          p_session_id: null,
          p_user_id: currentUser.id,
          p_order_type: 'TAKEAWAY',
          p_notes: 'مبيعات كاشير تجزئة سريعة',
          p_items: itemsPayload,
          p_customer_id: null,
          p_warehouse_id: selectedTerminal.warehouse_id || null,
          p_delivery_info: null,
          p_org_id: currentUser.organization_id
        });

        if (error) throw error;
        orderId = data;

        if (orderId) {
          // Update order with shift_id and terminal_id
          await supabase
            .from('orders')
            .update({
              shift_id: activeShift.id,
              terminal_id: selectedTerminal.id
            })
            .eq('id', orderId);

          // 2. Complete order (process payment & stock)
          let treasuryId = selectedTerminal.cash_account_id;
          if (!treasuryId) {
            const { data: mappings } = await supabase
              .from('company_settings')
              .select('account_mappings')
              .eq('organization_id', currentUser.organization_id)
              .single();
            treasuryId = mappings?.account_mappings?.CASH || null;
          }

          const { error: payErr } = await supabase.rpc('complete_restaurant_order', {
            p_order_id: orderId,
            p_payment_method: 'CASH',
            p_amount: total,
            p_cash_account_id: treasuryId,
            p_org_id: currentUser.organization_id,
            p_warehouse_id: selectedTerminal.warehouse_id || null
          });

          if (payErr) throw payErr;
        }
      } else {
        // Queue order for offline sync
        const offlinePayload = {
          ...orderData,
          shift_id: activeShift.id,
          terminal_id: selectedTerminal.id,
          is_offline: true
        };
        await offlineService.queueOrder(offlinePayload);
      }

      // Receipt printing structure
      setReceiptOrder({
        orderNumber: `RET-${Math.floor(1000 + Math.random() * 9000)}`,
        date: new Date().toLocaleDateString('ar-EG'),
        time: new Date().toLocaleTimeString('ar-EG'),
        items: cart.map(i => ({
          name: i.product.name,
          quantity: i.weight !== undefined ? i.weight : i.quantity,
          price: i.product.sales_price,
          unit: i.weight !== undefined ? 'كجم' : 'حبة'
        })),
        subtotal,
        tax,
        total,
        amountPaid,
        change
      });

      showToast(`تم إتمام العملية بنجاح. المتبقي للعميل: ${change.toFixed(2)} ${currencySymbol}`, 'success');
      
      // Clear cart
      setCart([]);
      setAmountPaid(0);
      setSearchQuery('');

      // Auto trigger print after render
      setTimeout(() => {
        window.print();
      }, 500);

    } catch (err: any) {
      showToast(err.message || 'فشل إتمام عملية الدفع', 'error');
    } finally {
      setIsPrinting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 flex flex-col font-sans select-none" dir="rtl">
      
      {/* 🚀 Header */}
      <header className="bg-slate-950/80 backdrop-blur border-b border-slate-800 px-6 py-4 flex justify-between items-center shadow-lg sticky top-0 z-40">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center shadow-lg shadow-indigo-500/20">
            <ShoppingCart className="text-white" size={22} />
          </div>
          <div>
            <h1 className="font-black text-lg tracking-tight text-white">نقطة بيع التجزئة السريعة</h1>
            <span className="text-xs text-indigo-400 font-bold">TriPro ERP V52.0 (هايبرماركت)</span>
          </div>
        </div>

        {/* Network & Active Shift Indicators */}
        <div className="flex items-center gap-4">
          <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-black transition-all ${
            isOnline ? 'bg-emerald-950/80 text-emerald-400 border border-emerald-800' : 'bg-amber-950/80 text-amber-400 border border-amber-800'
          }`}>
            {isOnline ? (
              <>
                <Wifi size={14} className="animate-pulse" /> متصل بالإنترنت
              </>
            ) : (
              <>
                <WifiOff size={14} /> وضع أوفلاين
              </>
            )}
          </div>

          {activeShift && (
            <div className="flex items-center gap-3 bg-slate-900 border border-slate-800 px-4 py-1.5 rounded-xl text-sm">
              <span className="flex items-center gap-1.5 font-bold text-slate-300">
                <User size={14} className="text-slate-400" />
                {currentUser?.full_name || 'الكاشير'}
              </span>
              <span className="h-4 w-px bg-slate-800" />
              <span className="text-indigo-400 font-black">{selectedTerminal?.name}</span>
              <button 
                onClick={handleSyncProducts} 
                disabled={isSyncingProducts}
                className="mr-2 text-xs bg-slate-800 border border-slate-700 hover:bg-slate-700 disabled:opacity-50 text-slate-300 px-3 py-1 rounded-lg flex items-center gap-1 font-bold transition-all"
              >
                <RefreshCw size={12} className={isSyncingProducts ? 'animate-spin' : ''} /> 
                {isSyncingProducts ? 'جاري التحديث...' : 'تحديث المنتجات'}
              </button>
              <button 
                onClick={handleOpenCloseShiftModal} 
                className="mr-2 text-xs bg-red-950/80 border border-red-900/50 hover:bg-red-900 text-red-400 px-3 py-1 rounded-lg flex items-center gap-1 font-bold transition-all"
              >
                <Lock size={12} /> إغلاق الوردية
              </button>
            </div>
          )}
        </div>
      </header>

      {/* 🔐 Shift Activation Modal / Screen */}
      {!activeShift ? (
        <div className="flex-1 flex items-center justify-center p-6 bg-slate-900/50">
          <div className="bg-slate-950 border border-slate-800 w-full max-w-md rounded-2xl p-8 shadow-2xl space-y-6">
            <div className="w-16 h-16 bg-indigo-950 text-indigo-400 border border-indigo-900/50 rounded-2xl flex items-center justify-center mx-auto shadow-inner">
              <Coins size={32} />
            </div>
            
            <div className="text-center space-y-2">
              <h2 className="text-2xl font-black text-white">بدء وردية الكاشير</h2>
              <p className="text-slate-400 text-sm">الرجاء اختيار منفذ البيع الحالي وإدخال الرصيد الافتتاحي للدرج النقدي.</p>
            </div>

            {isLoadingTerminals ? (
              <div className="flex justify-center p-6">
                <Loader2 className="animate-spin text-indigo-500" size={32} />
              </div>
            ) : (
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-black text-slate-400 mb-2">اختر جهاز الكاشير (الممر)</label>
                  <select 
                    className="w-full bg-slate-900 border border-slate-800 rounded-xl px-4 py-3 text-slate-100 font-bold focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none"
                    value={selectedTerminal?.id || ''}
                    onChange={(e) => {
                      const selected = terminals.find(t => t.id === e.target.value);
                      setSelectedTerminal(selected);
                    }}
                  >
                    <option value="">-- اختر الكاشير --</option>
                    {terminals.map(t => (
                      <option key={t.id} value={t.id}>{t.name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-black text-slate-400 mb-2">الرصيد الافتتاحي (عهدة البداية)</label>
                  <input 
                    type="number" 
                    value={openingBalance} 
                    onChange={e => setOpeningBalance(Number(e.target.value))} 
                    className="w-full bg-slate-900 border border-slate-800 rounded-xl px-4 py-3 text-center text-2xl font-bold text-white focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none"
                    placeholder={`0.00 ${currencySymbol}`}
                  />
                </div>

                <button 
                  disabled={isOpeningShift || !selectedTerminal}
                  onClick={handleOpenShift}
                  className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-black py-4 rounded-xl shadow-lg shadow-indigo-500/10 transition-all flex justify-center items-center gap-2 text-lg"
                >
                  {isOpeningShift && <Loader2 className="animate-spin" size={20} />}
                  فتح الدرج وبدء البيع
                </button>
              </div>
            )}
          </div>
        </div>
      ) : (
        /* 🛒 Main Cashier Interface */
        <div className="flex-1 flex overflow-hidden">
          
          {/* Left Column (Scanned Items & Cart) */}
          <div className="w-[60%] flex flex-col border-l border-slate-800 bg-slate-900">
            
            {/* Barcode & Search Input Panel */}
            <div className="p-4 bg-slate-950/40 border-b border-slate-800 flex gap-3">
              <form onSubmit={handleBarcodeSubmit} className="flex-1 relative">
                <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none text-slate-500">
                  <Barcode size={20} />
                </div>
                <input 
                  ref={barcodeInputRef}
                  type="text" 
                  value={barcodeInput}
                  onChange={e => setBarcodeInput(e.target.value)}
                  placeholder="امسح باركود المنتج هنا مباشرة..." 
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl pr-10 pl-4 py-3.5 text-white font-mono text-lg font-bold focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none placeholder:text-slate-600"
                  autoFocus
                />
              </form>

              <div className="w-[40%] relative">
                <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none text-slate-500">
                  <Search size={18} />
                </div>
                <input 
                  type="text" 
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  placeholder="بحث سريع بالاسم..." 
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl pr-9 pl-4 py-3.5 text-white text-sm focus:border-indigo-500 outline-none"
                />
                {/* Autocomplete Search Dropdown */}
                {searchResults.length > 0 && (
                  <div className="absolute left-0 right-0 mt-2 bg-slate-950 border border-slate-800 rounded-xl shadow-2xl max-h-60 overflow-y-auto z-50">
                    {searchResults.map(p => (
                      <div 
                        key={p.id} 
                        onClick={() => {
                          addToCart(p);
                          setSearchQuery('');
                        }}
                        className="p-3 border-b border-slate-800/50 hover:bg-slate-900 cursor-pointer flex justify-between items-center transition-all"
                      >
                        <div>
                          <div className="font-bold text-sm">{p.name}</div>
                          <div className="text-xs text-slate-500 font-mono">{p.barcode || p.sku}</div>
                        </div>
                        <div className="text-sm font-black text-indigo-400">{p.sales_price.toFixed(2)} {currencySymbol}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Cart Table */}
            <div className="flex-1 overflow-y-auto p-4 space-y-2">
              {cart.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-slate-600 gap-3">
                  <ShoppingCart size={48} className="opacity-20" />
                  <span className="text-sm font-bold opacity-60">السلة فارغة. ابدأ بمسح باركود المنتجات.</span>
                </div>
              ) : (
                <div className="bg-slate-950 border border-slate-850 rounded-xl overflow-hidden">
                  <table className="w-full text-right border-collapse">
                    <thead>
                      <tr className="border-b border-slate-800 bg-slate-900/50 text-xs font-black text-slate-400">
                        <th className="p-3">المنتج</th>
                        <th className="p-3 text-center">النوع / الميزان</th>
                        <th className="p-3 text-center">الكمية</th>
                        <th className="p-3 text-left">السعر</th>
                        <th className="p-3 text-left">الإجمالي</th>
                        <th className="p-3 text-center">حذف</th>
                      </tr>
                    </thead>
                    <tbody>
                      {cart.map((item, idx) => {
                        const price = item.product.sales_price;
                        const isWeight = item.weight !== undefined;
                        const qty = isWeight ? item.weight! : item.quantity;
                        const rowTotal = price * qty;
                        return (
                          <tr key={idx} className="border-b border-slate-800/40 hover:bg-slate-900/30 text-sm transition-all">
                            <td className="p-3">
                              <div className="font-black text-white">{item.product.name}</div>
                              <div className="text-xs text-slate-500 font-mono">{item.product.barcode || item.product.sku}</div>
                            </td>
                            <td className="p-3 text-center">
                              {isWeight ? (
                                <span className="bg-amber-950/80 text-amber-400 border border-amber-900 px-2 py-0.5 rounded text-[10px] font-black flex items-center justify-center gap-1 w-fit mx-auto">
                                  <Scale size={10} /> ميزان ({item.weight} كجم)
                                </span>
                              ) : (
                                <span className="bg-slate-800 text-slate-400 px-2 py-0.5 rounded text-[10px] font-black">
                                  حبة
                                </span>
                              )}
                            </td>
                            <td className="p-3 text-center">
                              {!isWeight ? (
                                <div className="flex items-center justify-center gap-1">
                                  <button onClick={() => updateQuantity(item.product.id, -1)} className="p-1 bg-slate-800 hover:bg-slate-700 rounded transition-all"><Minus size={12} /></button>
                                  <span className="w-8 font-black font-mono text-center text-white">{item.quantity}</span>
                                  <button onClick={() => updateQuantity(item.product.id, 1)} className="p-1 bg-slate-800 hover:bg-slate-700 rounded transition-all"><Plus size={12} /></button>
                                </div>
                              ) : (
                                <span className="font-black font-mono text-white">{item.weight} كجم</span>
                              )}
                            </td>
                            <td className="p-3 text-left font-bold font-mono text-slate-300">{price.toFixed(2)}</td>
                            <td className="p-3 text-left font-black font-mono text-indigo-400">{rowTotal.toFixed(2)}</td>
                            <td className="p-3 text-center">
                              <button 
                                onClick={() => setCart(prev => prev.filter(i => i.product.id !== item.product.id))}
                                className="text-red-500 hover:text-red-400 p-1.5 rounded-lg hover:bg-red-950/30 transition-all"
                              >
                                <Trash2 size={16} />
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Cart Calculations Summary Footer */}
            <div className="p-6 bg-slate-950 border-t border-slate-800 space-y-4">
              <div className="grid grid-cols-3 gap-6 text-sm text-slate-400">
                <div className="bg-slate-900/50 p-3 rounded-xl border border-slate-800/40">
                  <span className="block text-xs text-slate-500 mb-1">المجموع الفرعي</span>
                  <span className="text-lg font-bold font-mono text-slate-300">{subtotal.toFixed(2)} {currencySymbol}</span>
                </div>
                <div className="bg-slate-900/50 p-3 rounded-xl border border-slate-800/40">
                  <span className="block text-xs text-slate-500 mb-1">
                    {isTaxEnabled ? `ضريبة القيمة المضافة (${(vatRate * 100).toFixed(0)}%)` : 'الضريبة (معطلة)'}
                  </span>
                  <span className="text-lg font-bold font-mono text-slate-300">
                    {isTaxEnabled ? `${tax.toFixed(2)} ${currencySymbol}` : `0.00 ${currencySymbol}`}
                  </span>
                </div>
                <div className="bg-indigo-950/30 p-3 rounded-xl border border-indigo-900/20">
                  <span className="block text-xs text-indigo-400/80 mb-1">الإجمالي النهائي</span>
                  <span className="text-2xl font-black font-mono text-indigo-400">{total.toFixed(2)} {currencySymbol}</span>
                </div>
              </div>
            </div>

          </div>

          {/* Right Column (Payment & Quick Keys) */}
          <div className="w-[40%] bg-slate-950/60 p-6 flex flex-col justify-between">
            
            {/* Quick cash input buttons */}
            <div className="space-y-4">
              <h3 className="font-black text-sm text-slate-400 flex items-center gap-1.5">
                <Coins size={16} /> حساب النقدية المقبوضة
              </h3>

              <div className="bg-slate-950 border border-slate-800 rounded-2xl p-5 space-y-4 shadow-inner">
                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-2">المبلغ المستلم من العميل</label>
                  <input 
                    type="number" 
                    value={amountPaid || ''} 
                    onChange={e => setAmountPaid(Number(e.target.value))}
                    className="w-full bg-slate-900 border border-slate-800 rounded-xl px-4 py-4 text-left text-3xl font-black text-white font-mono focus:border-indigo-500 outline-none"
                    placeholder={`0.00 ${currencySymbol}`}
                  />
                </div>

                {/* Quick cash adder buttons */}
                <div className="grid grid-cols-4 gap-2">
                  {[5, 10, 50, 100, 200, 500].map(val => (
                    <button 
                      key={val}
                      onClick={() => setAmountPaid(prev => prev + val)}
                      className="bg-slate-900 hover:bg-slate-800 text-sm font-bold py-2.5 rounded-xl border border-slate-800 transition-all text-slate-200"
                    >
                      +{val}
                    </button>
                  ))}
                  <button 
                    onClick={() => setAmountPaid(total)}
                    className="col-span-2 bg-indigo-950 hover:bg-indigo-900 border border-indigo-900 text-sm font-black py-2.5 rounded-xl transition-all text-indigo-400"
                  >
                    المبلغ بالضبط
                  </button>
                </div>

                {/* Calculated change */}
                {amountPaid > 0 && (
                  <div className={`p-4 rounded-xl flex justify-between items-center ${
                    amountPaid >= total ? 'bg-emerald-950/80 text-emerald-400 border border-emerald-900' : 'bg-red-950/80 text-red-400 border border-red-900'
                  }`}>
                    <span className="font-bold text-sm">
                      {amountPaid >= total ? 'المبلغ المتبقي للعميل (الفكة):' : 'المبلغ المتبقي غير كافٍ، ينقص:'}
                    </span>
                    <span className="text-2xl font-black font-mono">
                      {Math.abs(amountPaid - total).toFixed(2)} {currencySymbol}
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Direct Pay Action Button */}
            <div className="space-y-3">
              <button 
                disabled={isPrinting || cart.length === 0 || amountPaid < total}
                onClick={handlePayment}
                className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-black py-5 rounded-2xl shadow-xl shadow-indigo-600/10 transition-all flex justify-center items-center gap-3 text-xl"
              >
                {isPrinting ? (
                  <Loader2 className="animate-spin" size={24} />
                ) : (
                  <Printer size={24} />
                )}
                دفع وطباعة الفاتورة (F8)
              </button>

              <button 
                onClick={() => {
                  setCart([]);
                  setAmountPaid(0);
                }}
                className="w-full bg-slate-900 hover:bg-slate-850 text-slate-400 hover:text-white text-sm font-bold py-3.5 rounded-xl border border-slate-800 transition-all"
              >
                إلغاء وإفراغ السلة
              </button>
            </div>

          </div>

        </div>
      )}

      {/* 🏁 Close Shift Modal */}
      {isCloseModalOpen && shiftSummary && (
        <div className="fixed inset-0 bg-slate-950/90 z-50 flex items-center justify-center p-4 backdrop-blur-sm" dir="rtl">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
            <div className="p-5 border-b border-slate-800 flex justify-between items-center bg-slate-950/50">
              <h3 className="font-black text-lg text-white flex items-center gap-2">
                <Lock size={20} className="text-red-500" /> إغلاق الوردية وجرد النقدية
              </h3>
            </div>
            <div className="p-6 space-y-6">
              
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div className="bg-slate-950 p-3 rounded-xl border border-slate-800/50">
                  <span className="block text-slate-500 mb-1">الرصيد الافتتاحي</span>
                  <span className="font-mono font-bold text-base text-slate-200">{Number(shiftSummary.opening_balance).toFixed(2)}</span>
                </div>
                <div className="bg-slate-950 p-3 rounded-xl border border-slate-800/50">
                  <span className="block text-slate-500 mb-1">إجمالي المبيعات</span>
                  <span className="font-mono font-bold text-base text-slate-200">{Number(shiftSummary.total_sales).toFixed(2)}</span>
                </div>
              </div>

              <div className="border-t border-slate-800/60 pt-4 space-y-4">
                <div className="flex justify-between items-center bg-slate-950/40 p-3 rounded-xl border border-slate-850">
                  <span className="font-bold text-sm text-slate-400">المبلغ المتوقع بالدرج:</span>
                  <span className="font-mono font-black text-xl text-indigo-400">{(Number(shiftSummary.expected_cash)).toFixed(2)} {currencySymbol}</span>
                </div>

                <div>
                  <label className="block text-xs font-black text-slate-400 mb-2">المبلغ الفعلي المقبوض في الدرج</label>
                  <input 
                    type="number" 
                    value={actualCash || ''} 
                    onChange={e => setActualCash(Number(e.target.value))}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-center text-2xl font-mono font-black text-white focus:border-indigo-500 outline-none"
                    placeholder="0.00"
                  />
                </div>

                {/* Balance Difference */}
                <div className={`p-3 rounded-xl flex justify-between items-center text-sm font-bold ${
                  (actualCash - shiftSummary.expected_cash) === 0 ? 'bg-emerald-950/40 text-emerald-400 border border-emerald-900/50' :
                  (actualCash - shiftSummary.expected_cash) > 0 ? 'bg-indigo-950/40 text-indigo-400 border border-indigo-900/50' : 'bg-red-950/40 text-red-400 border border-red-900/50'
                }`}>
                  <span>العجز / الزيادة:</span>
                  <span className="font-mono">{(actualCash - shiftSummary.expected_cash).toFixed(2)} {currencySymbol}</span>
                </div>
              </div>

              <div>
                <label className="block text-xs font-black text-slate-400 mb-2">ملاحظات الإغلاق</label>
                <textarea 
                  value={closingNotes}
                  onChange={e => setClosingNotes(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-sm h-20 outline-none focus:border-indigo-500 placeholder:text-slate-700"
                  placeholder="اكتب أي عجز أو ملاحظة خاصة بجرد الدرج..."
                />
              </div>

              <div className="flex gap-3">
                <button 
                  onClick={() => setIsCloseModalOpen(false)}
                  className="w-1/2 bg-slate-950 hover:bg-slate-850 text-slate-400 py-3 rounded-xl font-bold border border-slate-800 transition-all"
                >
                  إلغاء
                </button>
                <button 
                  disabled={isClosingShift}
                  onClick={handleConfirmCloseShift}
                  className="w-1/2 bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white py-3 rounded-xl font-black transition-all flex justify-center items-center gap-1.5"
                >
                  {isClosingShift && <Loader2 className="animate-spin" size={16} />}
                  إغلاق الوردية والترحيل
                </button>
              </div>

            </div>
          </div>
        </div>
      )}

      {/* 🖨️ Printable Receipt Area (Hidden in screen via Tailwind classes, shown in print) */}
      <div className="hidden print:block">
        <div ref={printAreaRef} className="print-area p-8 text-black" dir="rtl" style={{ fontFamily: 'monospace', fontSize: '12px' }}>
          {receiptOrder && (
            <div className="space-y-4">
              <div className="text-center space-y-1">
                <h2 className="font-black text-lg">{organization?.name || 'هايبر ماركت TriPro'}</h2>
                <p>فرع التجزئة الرئيسي</p>
                <p className="text-xs">تلفون: 0100000000</p>
              </div>
              <hr style={{ borderTop: '1px dashed black' }} />
              <div>
                <p>رقم الفاتورة: {receiptOrder.orderNumber}</p>
                <p>التاريخ: {receiptOrder.date} | الوقت: {receiptOrder.time}</p>
                <p>الكاشير: {currentUser?.full_name}</p>
                <p>الجهاز: {selectedTerminal?.name}</p>
              </div>
              <hr style={{ borderTop: '1px dashed black' }} />
              <table className="w-full text-right" style={{ fontSize: '11px' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid black' }}>
                    <th className="pb-1">الصنف</th>
                    <th className="pb-1 text-center">الكمية</th>
                    <th className="pb-1 text-left">السعر</th>
                    <th className="pb-1 text-left">الإجمالي</th>
                  </tr>
                </thead>
                <tbody>
                  {receiptOrder.items.map((item: any, idx: number) => (
                    <tr key={idx} style={{ borderBottom: '1px dashed #eee' }}>
                      <td className="py-1">{item.name}</td>
                      <td className="py-1 text-center">{item.quantity}</td>
                      <td className="py-1 text-left">{item.price.toFixed(2)}</td>
                      <td className="py-1 text-left">{(item.quantity * item.price).toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <hr style={{ borderTop: '1px dashed black' }} />
              <div className="space-y-1 text-left" style={{ fontSize: '12px', fontWeight: 'bold' }}>
                <div className="flex justify-between"><span>المجموع الفرعي:</span><span>{receiptOrder.subtotal.toFixed(2)} {currencySymbol}</span></div>
                {receiptOrder.tax > 0 && (
                  <div className="flex justify-between">
                    <span>الضريبة ({(vatRate * 100).toFixed(0)}%):</span>
                    <span>{receiptOrder.tax.toFixed(2)} {currencySymbol}</span>
                  </div>
                )}
                <div className="flex justify-between" style={{ fontSize: '14px', borderTop: '1px solid black', paddingTop: '4px' }}>
                  <span>الإجمالي الكلي:</span><span>{receiptOrder.total.toFixed(2)} {currencySymbol}</span>
                </div>
                <hr style={{ borderTop: '1px dashed black' }} />
                <div className="flex justify-between text-xs"><span>المدفوع نقداً:</span><span>{receiptOrder.amountPaid.toFixed(2)} {currencySymbol}</span></div>
                <div className="flex justify-between text-xs"><span>الفكة (المتبقي):</span><span>{receiptOrder.change.toFixed(2)} {currencySymbol}</span></div>
              </div>
              <hr style={{ borderTop: '1px dashed black' }} />
              <div className="text-center text-xs space-y-1 pt-4">
                <p>شكراً لزيارتكم</p>
                <p>الفاتورة خاضعة لضريبة القيمة المضافة</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Injecting CSS styles for silent/receipt print layout */}
      <style>{`
        @media print {
          body * {
            visibility: hidden;
          }
          .print-area, .print-area * {
            visibility: visible;
          }
          .print-area {
            position: absolute;
            left: 0;
            top: 0;
            width: 80mm; /* Standard thermal roll width */
            padding: 5mm;
            box-sizing: border-box;
          }
        }
      `}</style>

    </div>
  );
}

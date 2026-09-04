import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useToast } from '../../../../context/ToastContext';
import { supabase } from '../../../../supabaseClient';
import { useAccounting } from '../../../../context/AccountingContext';
import { db, offlineService } from '../../../../services/offlineService';
import type { CachedProduct } from '../../../../services/offlineService';
import { secureStorage } from '../../../../utils/securityMiddleware';
import SupervisorPinModal from './SupervisorPinModal';
import CashDropModal from './CashDropModal';
import PosReturnModal from './PosReturnModal';
import SupervisorBadgePrintModal from './SupervisorBadgePrintModal';
import SplitPaymentModal, { SplitPaymentDetails } from './SplitPaymentModal';
import ScaleConnectModal from './ScaleConnectModal';
import { scaleService, ScaleReading } from '../../services/scaleService';
import { evaluatePromotions, type PromotionRule } from '../../services/promotionEngine';
import { couponService, RetailCoupon } from '../../services/couponService';
import { generateCode128Svg } from '../../utils/barcodeSvg';
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
  Loader2,
  Pause,
  Play,
  Clock,
  Tag,
  FileSpreadsheet,
  RotateCcw,
  Banknote,
  Monitor,
  Sparkles,
  ShieldAlert,
  ShieldCheck,
  Percent,
  Ticket,
  CreditCard,
  Gift
} from 'lucide-react';

interface CartItem {
  product: CachedProduct;
  quantity: number;
  weight?: number; // In case of weight scale product
  uomName?: string;
  customPrice?: number;
  uomId?: string;
}

export default function RetailPosScreen() {
  const { currentUser, organization, settings, warehouses, refreshData, currentSelectedOrgId } = useAccounting() as any;
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
  const [shiftFinancials, setShiftFinancials] = useState<{
    cashSales: number;
    cashReturns: number;
    cashDrops: number;
    drawerCash: number;
  }>({
    cashSales: 0,
    cashReturns: 0,
    cashDrops: 0,
    drawerCash: 0
  });

  // Cart State
  const [cart, setCart] = useState<CartItem[]>([]);
  const [barcodeInput, setBarcodeInput] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<CachedProduct[]>([]);
  const [pricingTier, setPricingTier] = useState<'retail' | 'wholesale' | 'half'>('retail');
  
  // Payment & Loyalty State
  const [amountPaid, setAmountPaid] = useState<number>(0);
  const [paymentMethod, setPaymentMethod] = useState<'CASH' | 'CARD'>('CASH');
  const [selectedCustomer, setSelectedCustomer] = useState<any>(null);
  const [customerSearch, setCustomerSearch] = useState('');
  const [customerResults, setCustomerResults] = useState<any[]>([]);
  
  // Printing Receipt State
  const [receiptOrder, setReceiptOrder] = useState<any>(null);
  const [isPrinting, setIsPrinting] = useState(false);

  // 🛡️ Supervisor PIN Security State
  const [supervisorModalState, setSupervisorModalState] = useState<{
    isOpen: boolean;
    actionTitle: string;
    actionDescription?: string;
    onSuccess: () => void;
  }>({
    isOpen: false,
    actionTitle: '',
    onSuccess: () => {}
  });

  // 💵 Cash Drop State (سحب النقدية أثناء الوردية)
  const [isCashDropOpen, setIsCashDropOpen] = useState(false);
  const [cashDrops, setCashDrops] = useState<Array<{ amount: number; reason: string; receiverName: string; time: string }>>([]);

  // 🔄 POS Returns State (مرتجعات الكاشير بالباركود)
  const [isReturnModalOpen, setIsReturnModalOpen] = useState(false);

  // 🪪 Supervisor Badge Print State (طباعة شارة باركود المشرف)
  const [isBadgePrintOpen, setIsBadgePrintOpen] = useState(false);

  // فتح شاشة المرتجعات بتصريح كارت المشرف
  const handleOpenReturnModalWithSupervisorCheck = () => {
    setSupervisorModalState({
      isOpen: true,
      actionTitle: 'تصريح مرتجع مبيعات (Return Approval)',
      actionDescription: 'قم بتمرير كارت باركود المشرف بمسدس الليزر أو إدخال الرمز السري لفتح المرتجعات',
      onSuccess: () => {
        setSupervisorModalState(prev => ({ ...prev, isOpen: false }));
        setIsReturnModalOpen(true);
      }
    });
  };

  // 🎁 Promotions Engine State (محرك العروض الترويجية)
  const [promotions, setPromotions] = useState<PromotionRule[]>([]);

  // 🎟️ Coupons State (كوبونات وقسائم الخصم)
  const [couponsList, setCouponsList] = useState<RetailCoupon[]>([]);
  const [couponInput, setCouponInput] = useState('');
  const [appliedCoupon, setAppliedCoupon] = useState<RetailCoupon | null>(null);
  const [couponDiscount, setCouponDiscount] = useState(0);

  // 🔄 Split Payment State (تعدد طرق الدفع)
  const [isSplitPaymentOpen, setIsSplitPaymentOpen] = useState(false);
  const [splitPaymentData, setSplitPaymentData] = useState<SplitPaymentDetails | null>(null);

  // ⚖️ Electronic Scale State (الميزان الإلكتروني المباشر)
  const [isScaleModalOpen, setIsScaleModalOpen] = useState(false);
  const [scaleReading, setScaleReading] = useState<ScaleReading>(scaleService.currentReading);

  useEffect(() => {
    const unsubscribe = scaleService.subscribe(reading => {
      setScaleReading(reading);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const loadPromos = async () => {
      const orgId = currentSelectedOrgId || currentUser?.organization_id || organization?.id || 'default_org';
      try {
        let dbActivePromos: PromotionRule[] = [];
        try {
          const { data } = await supabase
            .from('retail_promotions')
            .select('*')
            .eq('organization_id', orgId)
            .eq('is_active', true);
          if (data && Array.isArray(data) && data.length > 0) {
            dbActivePromos = data;
          }
        } catch (e) {}

        const local = (
          secureStorage.getItem(`tripro_promos_${orgId}`) || 
          secureStorage.getItem('tripro_promos_active')
        ) as PromotionRule[];

        if (dbActivePromos.length > 0) {
          const dbIds = new Set(dbActivePromos.map(p => p.id));
          const localOnly = Array.isArray(local) ? local.filter(p => p.is_active !== false && !dbIds.has(p.id)) : [];
          setPromotions([...dbActivePromos, ...localOnly]);
        } else if (Array.isArray(local) && local.length > 0) {
          setPromotions(local.filter(p => p.is_active !== false));
        }
      } catch (e) {}

      // Load coupons
      try {
        const couponData = await couponService.getCoupons(orgId);
        setCouponsList(couponData);
      } catch (e) {}
    };

    loadPromos();

    // Re-check when window regains focus (e.g. user created a promotion in another tab or screen)
    window.addEventListener('focus', loadPromos);
    return () => {
      window.removeEventListener('focus', loadPromos);
    };
  }, [currentUser, organization, currentSelectedOrgId]);

  // Handle apply / remove coupon
  const handleApplyCoupon = () => {
    if (!couponInput.trim()) {
      showToast('يرجى إدخال رمز الكوبون أولاً', 'error');
      return;
    }
    const result = couponService.validateCoupon(couponInput, subtotal, couponsList);
    if (!result.valid) {
      showToast(result.message || 'كوبون غير صالح', 'error');
      return;
    }
    setAppliedCoupon(result.coupon || null);
    setCouponDiscount(result.discountAmount);
    showToast(result.message || 'تم تطبيق الكوبون بنجاح ✅', 'success');
  };

  const handleRemoveCoupon = () => {
    setAppliedCoupon(null);
    setCouponDiscount(0);
    setCouponInput('');
    showToast('تم إلغاء الكوبون', 'info');
  };

  // ⏸️ Held / Parked Invoices State (تعليق واسترجاع الفواتير - F6)
  interface HeldOrder {
    id: string;
    heldAt: string;
    customer: any;
    cart: CartItem[];
    subtotal: number;
    tax: number;
    total: number;
    notes?: string;
  }

  const [heldOrders, setHeldOrders] = useState<HeldOrder[]>(() => {
    try {
      return secureStorage.getItem('tripro_retail_held_orders') || [];
    } catch {
      return [];
    }
  });
  const [isHeldModalOpen, setIsHeldModalOpen] = useState(false);

  // تعليق الفاتورة الحالية (Hold / Park)
  const handleHoldOrder = () => {
    if (cart.length === 0) {
      showToast('سلة المشتريات فارغة، لا يوجد ما يمكن تعليقه', 'warning');
      return;
    }
    const newHeld: HeldOrder = {
      id: `HOLD-${Date.now().toString().slice(-4)}`,
      heldAt: new Date().toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' }),
      customer: selectedCustomer,
      cart: [...cart],
      subtotal,
      tax,
      total
    };
    const updated = [newHeld, ...heldOrders];
    setHeldOrders(updated);
    secureStorage.setItem('tripro_retail_held_orders', updated);
    
    // إفراغ السلة لخدمة العميل التالي فوراً
    setCart([]);
    setAmountPaid(0);
    setSelectedCustomer(null);
    setCustomerSearch('');
    showToast(`تم تعليق الفاتورة (${newHeld.id}) بنجاح، يمكنك خدمة العميل التالي`, 'info');
  };

  // استرجاع فاتورة معلقة (Resume)
  const handleResumeOrder = (held: HeldOrder) => {
    if (cart.length > 0) {
      if (!window.confirm('توجد أصناف بالسلة الحالية! هل تريد استبدالها بالفاتورة المعلقة المسترجعة؟')) {
        return;
      }
    }
    setCart(held.cart);
    setSelectedCustomer(held.customer);
    setAmountPaid(0);
    
    // حذفها من قائمة المعلق
    const updated = heldOrders.filter(h => h.id !== held.id);
    setHeldOrders(updated);
    secureStorage.setItem('tripro_retail_held_orders', updated);
    setIsHeldModalOpen(false);
    showToast(`تم استرجاع الفاتورة (${held.id}) بنجاح ✅`, 'success');
  };

  // حذف فاتورة معلقة
  const handleDeleteHeld = (id: string) => {
    const updated = heldOrders.filter(h => h.id !== id);
    setHeldOrders(updated);
    secureStorage.setItem('tripro_retail_held_orders', updated);
    showToast('تم حذف الفاتورة المعلقة', 'info');
  };

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

  // 🏷️ دالة التحقق من سريان عرض كارت الصنف (Item Card Offer)
  const isItemOfferActive = (product: CachedProduct): boolean => {
    const today = new Date().toISOString().split('T')[0];
    const offerPrice = Number(product.offer_price || 0);
    if (offerPrice > 0) {
      if (product.offer_start_date && product.offer_end_date) {
        return today >= product.offer_start_date && today <= product.offer_end_date;
      }
      if (product.offer_end_date) {
        return today <= product.offer_end_date;
      }
      return true;
    }
    return false;
  };

  // 🏷️ دالة تحديد السعر الفعلي للصنف مع الأخذ في الحسبان فئة التسعير وسعر العرض والحد الأدنى
  const getItemEffectivePrice = (product: CachedProduct, customPrice?: number): number => {
    let finalPrice = 0;
    if (customPrice !== undefined && customPrice > 0) {
      finalPrice = customPrice;
    } else if (isItemOfferActive(product)) {
      finalPrice = Number(product.offer_price);
    } else if (pricingTier === 'wholesale' && Number(product.wholesale_price || 0) > 0) {
      finalPrice = Number(product.wholesale_price);
    } else if (pricingTier === 'half' && Number(product.half_wholesale_price || 0) > 0) {
      finalPrice = Number(product.half_wholesale_price);
    } else {
      finalPrice = Number(product.sales_price || 0);
    }

    // 🛑 تطبيق الحد الأدنى لسعر البيع المسموح به كحماية (Price Floor)
    const minPrice = Number(product.min_sales_price || 0);
    if (minPrice > 0 && finalPrice < minPrice) {
      finalPrice = minPrice;
    }

    return finalPrice;
  };

  // Calculations & Promotions Evaluation
  const isTaxEnabled = settings?.enable_tax !== false;
  const vatRate = isTaxEnabled ? (settings?.vat_rate !== undefined ? Number(settings.vat_rate) : 0.14) : 0;

  const subtotal = cart.reduce((sum, item) => {
    const price = getItemEffectivePrice(item.product, item.customPrice);
    const qty = item.weight !== undefined ? item.weight : item.quantity;
    return sum + (price * qty);
  }, 0);

  const { totalPromoDiscount, appliedPromotions } = evaluatePromotions(
    cart.map(it => {
      const price = getItemEffectivePrice(it.product, it.customPrice);
      return {
        product: {
          id: it.product.id,
          name: it.product.name,
          sales_price: price,
          category_id: it.product.category_id
        },
        quantity: it.weight !== undefined ? it.weight : it.quantity,
        price
      };
    }),
    promotions
  );

  const totalDiscount = totalPromoDiscount + couponDiscount;
  const subtotalAfterPromo = Math.max(0, subtotal - totalDiscount);
  const tax = subtotalAfterPromo * vatRate;
  const total = subtotalAfterPromo + tax;

  // 📺 Broadcast to Dual-Screen Customer Display (/retail/customer-display)
  useEffect(() => {
    const payload = {
      cart: cart.map(it => {
        const itemPrice = getItemEffectivePrice(it.product, it.customPrice);
        return {
          id: it.product.id,
          name: it.product.name,
          quantity: it.quantity,
          price: itemPrice,
          weight: it.weight,
          total: itemPrice * (it.weight !== undefined ? it.weight : it.quantity),
          image_url: it.product.image_url,
          uomName: it.uomName,
          isOffer: isItemOfferActive(it.product) && it.customPrice === undefined,
          originalPrice: Number(it.product.sales_price || 0)
        };
      }),
      subtotal,
      discount: totalDiscount,
      tax,
      total,
      cashierName: currentUser?.full_name || 'الكاشير',
      storeName: organization?.name || 'TriPro Hypermarket',
      customerName: selectedCustomer?.name,
      status: cart.length > 0 ? 'scanning' : 'idle'
    };

    try {
      secureStorage.setItem('tripro_customer_display_state', payload);
      const channel = new BroadcastChannel('tripro_pos_customer_display');
      channel.postMessage(payload);
      channel.close();
    } catch (e) {}
  }, [cart, subtotal, totalPromoDiscount, tax, total, currentUser, organization, selectedCustomer]);

  // Customer Search effect (Loyalty)
  useEffect(() => {
    const searchCustomers = async () => {
      if (!customerSearch.trim()) {
        setCustomerResults([]);
        return;
      }
      const { data } = await supabase
        .from('customers')
        .select('id, name, phone')
        .eq('organization_id', currentUser?.organization_id)
        .or(`name.ilike.%${customerSearch}%,phone.ilike.%${customerSearch}%`)
        .limit(5);
      setCustomerResults(data || []);
    };
    const timer = setTimeout(searchCustomers, 300);
    return () => clearTimeout(timer);
  }, [customerSearch, currentUser]);

  // Handle Card Auto Amount Paid
  useEffect(() => {
    if (paymentMethod === 'CARD') {
      setAmountPaid(total);
    }
  }, [paymentMethod, total]);

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

  // Check if any modal or dialog is currently open
  const isAnyModalActive = isReturnModalOpen || 
    isCloseModalOpen || 
    isSplitPaymentOpen || 
    isScaleModalOpen || 
    supervisorModalState.isOpen || 
    isBadgePrintOpen || 
    isHeldModalOpen || 
    isCashDropOpen;

  // Keep barcode input focused at all times for continuous scanning (only when NO modal is open)
  useEffect(() => {
    if (activeShift && !isAnyModalActive) {
      // Focus on mount/shift activation
      barcodeInputRef.current?.focus();

      const interval = setInterval(() => {
        const activeTag = document.activeElement?.tagName;
        if (
          document.activeElement !== barcodeInputRef.current && 
          activeTag !== 'INPUT' && 
          activeTag !== 'TEXTAREA' && 
          activeTag !== 'SELECT' && 
          activeTag !== 'BUTTON'
        ) {
          barcodeInputRef.current?.focus();
        }
      }, 1000);

      // Redirect global key presses to barcode input immediately (only when not interacting with an input/select)
      const handleGlobalKeyDown = (e: KeyboardEvent) => {
        if (e.ctrlKey || e.altKey || e.metaKey) return;
        if (e.key && e.key.startsWith('F') && e.key.length > 1) return;

        const activeTag = document.activeElement?.tagName;
        if (
          document.activeElement !== barcodeInputRef.current && 
          activeTag !== 'INPUT' && 
          activeTag !== 'TEXTAREA' && 
          activeTag !== 'SELECT'
        ) {
          barcodeInputRef.current?.focus();
        }
      };

      window.addEventListener('keydown', handleGlobalKeyDown);

      return () => {
        clearInterval(interval);
        window.removeEventListener('keydown', handleGlobalKeyDown);
      };
    }
  }, [activeShift, isAnyModalActive]);

  // Keyboard Shortcuts Handler (F-keys control)
  useEffect(() => {
    if (!activeShift) return;

    const handleShortcuts = (e: KeyboardEvent) => {
      // F8: Pay
      if (e.key === 'F8') {
        e.preventDefault();
        if (cart.length > 0 && amountPaid >= total && !isPrinting) {
          handlePayment();
        } else if (cart.length === 0) {
          showToast('سلة التسوق فارغة!', 'error');
        } else if (amountPaid < total) {
          showToast('المبلغ المدفوع أقل من إجمالي الفاتورة', 'error');
        }
      }
      // F9: Focus Amount Paid input
      if (e.key === 'F9') {
        e.preventDefault();
        const paidInput = document.querySelector('input[placeholder*="المستلم"]') as HTMLInputElement;
        paidInput?.focus();
        paidInput?.select();
      }
      // F2: Clear Cart
      if (e.key === 'F2') {
        e.preventDefault();
        if (cart.length > 0 && window.confirm('هل أنت متأكد من رغبتك في إفراغ سلة التسوق؟')) {
          setCart([]);
          setAmountPaid(0);
        }
      }
      // F6: Hold / Park Order (تعليق الفاتورة)
      if (e.key === 'F6') {
        e.preventDefault();
        handleHoldOrder();
      }
      // F7: Open Held Orders Modal (عرض الفواتير المعلقة)
      if (e.key === 'F7') {
        e.preventDefault();
        setIsHeldModalOpen(prev => !prev);
      }
      // F4: Focus Search input
      if (e.key === 'F4') {
        e.preventDefault();
        const searchInput = document.querySelector('input[placeholder*="بحث سريع"]') as HTMLInputElement;
        searchInput?.focus();
        searchInput?.select();
      }
      // Escape: Return focus to Barcode and clear search
      if (e.key === 'Escape') {
        e.preventDefault();
        setSearchQuery('');
        barcodeInputRef.current?.focus();
      }
    };

    window.addEventListener('keydown', handleShortcuts);
    return () => window.removeEventListener('keydown', handleShortcuts);
  }, [activeShift, cart, amountPaid, total, isPrinting]);

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
          .maybeSingle();
        if (!seedErr && newTerm) {
          setTerminals([newTerm]);
        }
      }

      // 2. Sync products locally
      await offlineService.syncProductsLocally(currentUser.organization_id);

      let activeShiftDb = null;
      const cachedShift = secureStorage.getItem<any>(`tripro_shift_${currentUser.id}`);
      if (cachedShift) {
        const parsed = typeof cachedShift === 'string' ? JSON.parse(cachedShift) : cachedShift;
        // Verify with database if it's still open
        const { data: dbShift, error: shiftErr } = await supabase
          .from('shifts')
          .select('*, pos_terminals(*)')
          .eq('id', parsed.id)
          .is('end_time', null)
          .maybeSingle();

        if (!shiftErr && dbShift) {
          activeShiftDb = dbShift;
        } else {
          secureStorage.removeItem(`tripro_shift_${currentUser.id}`);
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
        const resolvedTerm = activeShiftDb.pos_terminals || (termData && termData.find((t: any) => t.id === activeShiftDb.terminal_id)) || (termData && termData.length > 0 ? termData[0] : null);
        setSelectedTerminal(resolvedTerm);
        secureStorage.setItem(`tripro_shift_${currentUser.id}`, activeShiftDb);
      } else if (termData && termData.length > 0) {
        setSelectedTerminal(termData[0]);
      }
    } catch (err) {
      console.error('Error in setup:', err);
    } finally {
      setIsLoadingTerminals(false);
    }
  };

  // Open Shift
  const handleOpenShift = async () => {
    if (!selectedTerminal && terminals.length > 0) {
      showToast('الرجاء اختيار نقطة البيع/الكاشير أولاً', 'error');
      return;
    }
    setIsOpeningShift(true);
    try {
      // Resolve treasury account linked to terminal or fetch default
      let treasuryId = selectedTerminal?.cash_account_id;
      if (!treasuryId) {
        treasuryId = settings?.accountMappings?.CASH || settings?.account_mappings?.CASH || null;
        if (!treasuryId) {
          const { data: mappings } = await supabase
            .from('company_settings')
            .select('account_mappings')
            .eq('organization_id', currentUser.organization_id)
            .maybeSingle();
          treasuryId = mappings?.account_mappings?.CASH || null;
        }
      }

      // Call start shift rpc
      const { data: newShift, error } = await supabase.rpc('start_pos_shift', {
        p_opening_balance: Number(openingBalance) || 0,
        p_resume_existing: false, // 🛡️ إنشاء وردية جديدة صراحة (ويفشل إذا كانت هناك وردية مفتوحة)
        p_treasury_account_id: treasuryId,
        p_user_id: currentUser.id,
        p_org_id: currentUser.organization_id,
        p_terminal_id: selectedTerminal?.id || null
      });

      if (error) throw error;

      if (newShift && newShift.id) {
        // Fetch the full shift record
        const { data: fullShift } = await supabase
          .from('shifts')
          .select('*, pos_terminals(*)')
          .eq('id', newShift.id)
          .maybeSingle();

        setActiveShift(fullShift);
        secureStorage.setItem(`tripro_shift_${currentUser.id}`, fullShift);
        showToast('تم فتح الوردية بنجاح ✅', 'success');
      }
    } catch (err: any) {
      showToast(err.message || 'فشل فتح الوردية', 'error');
    } finally {
      setIsOpeningShift(false);
    }
  };

  // 💵 Calculate and refresh real-time drawer balance and shift financials
  const refreshShiftFinancials = useCallback(async (currentShift?: any) => {
    const shift = currentShift || activeShift;
    if (!shift || !shift.id) {
      setShiftFinancials({ cashSales: 0, cashReturns: 0, cashDrops: 0, drawerCash: 0 });
      return;
    }

    try {
      const openingBal = Number(shift.opening_balance) || 0;
      let cashSales = 0;
      let cashReturns = 0;

      // 1. Try get_shift_summary RPC
      const { data: summary, error: summaryErr } = await supabase.rpc('get_shift_summary', {
        p_shift_id: shift.id
      });

      if (!summaryErr && summary) {
        cashSales = Number(summary.cash_sales) || 0;
        cashReturns = Number(summary.cash_returns) || 0;
      } else {
        // Fallback: Query orders for cash sales
        let ordQuery: any = supabase
          .from('orders')
          .select('grand_total, payment_method, status')
          .eq('shift_id', shift.id);
        if (typeof ordQuery?.in === 'function') {
          ordQuery = ordQuery.in('status', ['PAID', 'COMPLETED', 'posted', 'CONFIRMED']);
        }
        const { data: ords } = await ordQuery;

        const safeOrds = Array.isArray(ords) ? ords : [];
        cashSales = safeOrds.filter((o: any) => !o.payment_method || o.payment_method === 'CASH')
          .reduce((sum: number, o: any) => sum + Number(o.grand_total || 0), 0);
      }

      // 2. Fetch cash returns explicitly if not provided by RPC or if RPC is legacy
      if (cashReturns === 0) {
        try {
          let retQuery: any = supabase
            .from('sales_returns')
            .select('total_amount, notes, user_id, created_at')
            .eq('user_id', currentUser.id);

          if (shift.start_time) {
            retQuery = retQuery.gte('created_at', shift.start_time);
          }

          const { data: retRows } = await retQuery;
          const safeRetRows = Array.isArray(retRows) ? retRows : [];

          if (safeRetRows.length > 0) {
            cashReturns = safeRetRows
              .filter((r: any) => {
                const isCash = !r.notes || r.notes.includes('نقدي') || r.notes.includes('CASH');
                return isCash;
              })
              .reduce((sum: number, r: any) => sum + Number(r.total_amount || 0), 0);
          }
        } catch (e) {
          console.warn('Could not query sales_returns for shift balance:', e);
        }
      }

      const totalDrops = cashDrops.reduce((sum, d) => sum + Number(d.amount || 0), 0);
      const drawerCash = Math.max(0, openingBal + cashSales - cashReturns - totalDrops);

      setShiftFinancials({
        cashSales,
        cashReturns,
        cashDrops: totalDrops,
        drawerCash
      });
    } catch (err) {
      console.error('Error refreshing shift financials:', err);
    }
  }, [activeShift, currentUser?.id, cashDrops]);

  useEffect(() => {
    if (activeShift) {
      refreshShiftFinancials(activeShift);
    }
  }, [activeShift, cashDrops]);

  // Close Shift Setup
  const handleOpenCloseShiftModal = async () => {
    if (!activeShift) return;
    try {
      const openingBal = Number(activeShift.opening_balance) || 0;
      const totalCashDrops = cashDrops.reduce((sum, d) => sum + Number(d.amount || 0), 0);

      // 1. Fetch expected sales and balance from shifts RPC
      const { data, error } = await supabase.rpc('get_shift_summary', {
        p_shift_id: activeShift.id
      });

      // 2. Fetch cash returns explicitly to ensure returns are deducted even if RPC cache is old
      let detectedCashReturns = Number(data?.cash_returns) || 0;
      try {
        let retQuery: any = supabase
          .from('sales_returns')
          .select('total_amount, notes, user_id, created_at')
          .eq('user_id', currentUser.id);

        if (activeShift.start_time) {
          retQuery = retQuery.gte('created_at', activeShift.start_time);
        }

        const { data: retRows } = await retQuery;
        const safeRetRows = Array.isArray(retRows) ? retRows : [];

        if (safeRetRows.length > 0) {
          detectedCashReturns = safeRetRows
            .filter((r: any) => {
              const isCash = !r.notes || r.notes.includes('نقدي') || r.notes.includes('CASH');
              return isCash;
            })
            .reduce((sum: number, r: any) => sum + Number(r.total_amount || 0), 0);
        }
      } catch (reErr) {
        console.warn('Could not query sales_returns for shift close:', reErr);
      }

      let calculatedExpectedCash = 0;

      if (error) {
        const { data: orders } = await supabase
          .from('orders')
          .select('grand_total, payment_method')
          .eq('shift_id', activeShift.id);
        const safeOrders = Array.isArray(orders) ? orders : [];
        const totalSales = safeOrders.reduce((sum, o) => sum + Number(o.grand_total || 0), 0);
        const cashSales = safeOrders.filter(o => !o.payment_method || o.payment_method === 'CASH').reduce((sum, o) => sum + Number(o.grand_total || 0), 0);
        const cardSales = totalSales - cashSales;
        calculatedExpectedCash = Math.max(0, openingBal + cashSales - detectedCashReturns - totalCashDrops);

        setShiftSummary({
          opening_balance: openingBal,
          total_sales: totalSales,
          cash_sales: cashSales,
          card_sales: cardSales,
          cash_returns: detectedCashReturns,
          cash_drops: totalCashDrops,
          expected_cash: calculatedExpectedCash
        });
      } else {
        const cashSales = Number(data?.cash_sales) || 0;
        const totalSales = Number(data?.total_sales) || 0;
        const cardSales = Number(data?.card_sales) || 0;
        const pettyCash = Number(data?.petty_cash) || 0;
        calculatedExpectedCash = (data?.expected_cash !== undefined && data?.cash_returns !== undefined)
          // get_shift_summary already deducts petty_cash from expected_cash — do NOT subtract totalCashDrops again
          ? Math.max(0, Number(data.expected_cash))
          : Math.max(0, openingBal + cashSales - detectedCashReturns - totalCashDrops - pettyCash);

        setShiftSummary({
          ...data,
          opening_balance: openingBal,
          total_sales: totalSales,
          cash_sales: cashSales,
          card_sales: cardSales,
          cash_returns: detectedCashReturns,
          cash_drops: totalCashDrops,
          expected_cash: calculatedExpectedCash
        });
      }
      setActualCash(calculatedExpectedCash);
      setIsCloseModalOpen(true);
    } catch (e) {
      console.error(e);
    }
  };

  // Close Shift Final
  const handleConfirmCloseShift = async () => {
    if (actualCash === 0 && Number(shiftSummary?.expected_cash || 0) > 0) {
      const confirmZero = window.confirm(
        `تنبيه هـام: لقد تم إدخال المبلغ الفعلي بالدرج 0.00 ${currencySymbol}، بينما المتوقع هو ${Number(shiftSummary.expected_cash).toFixed(2)} ${currencySymbol}.\n\nسيتم تسجيل هذا النقص كعجز صندوق بالكامل.\n\nهل أنت متأكد من المتابعة والإغلاق؟`
      );
      if (!confirmZero) return;
    }

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

  // Weight Barcode Parser (GS1 Standard: 20-29 & 99)
  const parseWeightBarcode = (barcode: string) => {
    // Structure: PP CCCCC WWWWW X (Prefix 2 digits, Product Code 5 digits, Weight/Price 5 digits, Checksum 1 digit)
    if (barcode.length === 13) {
      const prefix = barcode.substring(0, 2);
      const validPrefixes = ['20', '21', '22', '23', '24', '25', '26', '27', '28', '29', '99'];
      if (validPrefixes.includes(prefix)) {
        const productCode = barcode.substring(2, 7);
        const weightString = barcode.substring(7, 12);
        const weight = Number(weightString) / 1000; // e.g. 01250 -> 1.250 kg
        return { productCode, weight };
      }
    }
    return null;
  };

  // Handle barcode submission
  const handleBarcodeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    let code = barcodeInput.trim();
    if (!code) return;

    setBarcodeInput('');
    playBeep();

    let multiplier = 1;
    // 🛡️ Parse quantity multiplier (e.g. 5*barcode or 5xbarcode)
    if (code.includes('*')) {
      const parts = code.split('*');
      if (parts.length === 2 && !isNaN(Number(parts[0])) && Number(parts[0]) > 0) {
        multiplier = Math.round(Number(parts[0]));
        code = parts[1].trim();
      }
    } else if (code.toLowerCase().includes('x')) {
      const parts = code.toLowerCase().split('x');
      if (parts.length === 2 && !isNaN(Number(parts[0])) && Number(parts[0]) > 0) {
        multiplier = Math.round(Number(parts[0]));
        code = parts[1].trim();
      }
    }

    try {
      let matchedProduct: CachedProduct | undefined;
      let matchedUomInfo: { uom_name?: string; customPrice?: number; uom_id?: string } | undefined;
      let weight: number | undefined;

      // 1. Check if it's a weight scale barcode
      const weightParse = parseWeightBarcode(code);
      if (weightParse) {
        const { productCode, weight: parsedWeight } = weightParse;
        const numericPlu = parseInt(productCode, 10);

        // Search local Dexie cache by PLU number, SKU, barcode, or barcode2
        const allCached = await db.products.toArray();
        matchedProduct = allCached.find(p => 
          (p.plu_number && p.plu_number === numericPlu) ||
          p.barcode === productCode || 
          p.sku === productCode || 
          p.sku === String(numericPlu) ||
          p.barcode2 === productCode
        );

        // Fallback to online Supabase if product was newly added and not yet synced
        if (!matchedProduct && currentUser?.organization_id) {
          const { data: onlineList } = await supabase
            .from('products')
            .select('*')
            .eq('organization_id', currentUser.organization_id)
            .eq('is_active', true)
            .or(`plu_number.eq.${numericPlu},barcode.eq.${productCode},sku.eq.${productCode},sku.eq.${numericPlu},barcode2.eq.${productCode}`);
          if (onlineList && onlineList.length > 0) {
            matchedProduct = onlineList[0] as any;
            try { await db.products.put(matchedProduct as any); } catch (e) {}
          }
        }
        weight = parsedWeight;
      } else {
        // 2. Search by normal barcode, SKU, or barcode2
        const cleanCode = code.trim().toLowerCase();
        const allCached = await db.products.toArray();

        // 2a. Direct match in local cache
        matchedProduct = allCached.find(p => 
          (p.barcode && p.barcode.trim().toLowerCase() === cleanCode) ||
          (p.sku && p.sku.trim().toLowerCase() === cleanCode) ||
          (p.barcode2 && p.barcode2.trim().toLowerCase() === cleanCode)
        );

        // 2b. Search multi-unit barcodes (unit_barcodes) in local cache
        if (!matchedProduct) {
          for (const p of allCached) {
            if (Array.isArray((p as any).unit_barcodes)) {
              const foundUom = (p as any).unit_barcodes.find((ub: any) => ub.barcode && ub.barcode.trim().toLowerCase() === cleanCode);
              if (foundUom) {
                matchedProduct = p;
                matchedUomInfo = {
                  uom_name: foundUom.uom_name,
                  customPrice: foundUom.price && Number(foundUom.price) > 0 ? Number(foundUom.price) : p.sales_price,
                  uom_id: foundUom.uom_id
                };
                break;
              }
            }
          }
        } else if (Array.isArray((matchedProduct as any).unit_barcodes)) {
          // If matched directly, check if it was specifically a unit barcode
          const foundUom = (matchedProduct as any).unit_barcodes.find((ub: any) => ub.barcode && ub.barcode.trim().toLowerCase() === cleanCode);
          if (foundUom) {
            matchedUomInfo = {
              uom_name: foundUom.uom_name,
              customPrice: foundUom.price && Number(foundUom.price) > 0 ? Number(foundUom.price) : matchedProduct.sales_price,
              uom_id: foundUom.uom_id
            };
          }
        }

        // Fallback online search
        if (!matchedProduct && currentUser?.organization_id) {
          const { data: onlineList } = await supabase
            .from('products')
            .select('*')
            .eq('organization_id', currentUser.organization_id)
            .eq('is_active', true)
            .or(`barcode.ilike.${cleanCode},sku.ilike.${cleanCode},barcode2.ilike.${cleanCode}`);

          if (onlineList && onlineList.length > 0) {
            matchedProduct = onlineList[0] as any;
            try { await db.products.put(matchedProduct as any); } catch (e) {}
          } else {
            // Search products with unit_barcodes online
            const { data: allOnline } = await supabase
              .from('products')
              .select('*')
              .eq('organization_id', currentUser.organization_id)
              .eq('is_active', true)
              .not('unit_barcodes', 'is', null);

            if (allOnline && allOnline.length > 0) {
              for (const p of allOnline) {
                if (Array.isArray(p.unit_barcodes)) {
                  const foundUom = p.unit_barcodes.find((ub: any) => ub.barcode && ub.barcode.trim().toLowerCase() === cleanCode);
                  if (foundUom) {
                    matchedProduct = p as any;
                    matchedUomInfo = {
                      uom_name: foundUom.uom_name,
                      customPrice: foundUom.price && Number(foundUom.price) > 0 ? Number(foundUom.price) : p.sales_price,
                      uom_id: foundUom.uom_id
                    };
                    try { await db.products.put(matchedProduct as any); } catch (e) {}
                    break;
                  }
                }
              }
            }
          }
        }
      }

      if (matchedProduct) {
        addToCart(
          matchedProduct, 
          weight, 
          multiplier, 
          matchedUomInfo?.uom_name, 
          matchedUomInfo?.customPrice, 
          matchedUomInfo?.uom_id
        );
      } else {
        showToast(`لم يتم العثور على صنف بالرمز: ${code}`, 'error');
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Add Product to Cart
  const addToCart = (
    product: CachedProduct, 
    weight?: number, 
    multiplier: number = 1,
    uomName?: string,
    customPrice?: number,
    uomId?: string
  ) => {
    // 🔞 تحقق من تقييد العمر قبل إضافة الصنف للسلة
    if ((product as any).age_restricted) {
      const confirmed = window.confirm(
        `⚠️ تنبيه: هذا الصنف مقيد بالعمر (+18)\n\n` +
        `الصنف: ${product.name}\n\n` +
        `هل تأكدت من أن عمر العميل 18 سنة فأكبر؟\n` +
        `اضغط "موافق" للمتابعة أو "إلغاء" لإلغاء العملية.`
      );
      if (!confirmed) return;
    }

    setCart(prev => {
      const existing = prev.find(item => item.product.id === product.id && item.uomId === uomId);
      if (existing) {
        if (weight !== undefined) {
          return prev.map(item => 
            (item.product.id === product.id && item.uomId === uomId)
              ? { ...item, quantity: item.quantity + multiplier, weight: (item.weight || 0) + (weight * multiplier) }
              : item
          );
        } else {
          return prev.map(item => 
            (item.product.id === product.id && item.uomId === uomId)
              ? { ...item, quantity: item.quantity + multiplier }
              : item
          );
        }
      }
      return [
        ...prev, 
        { 
          product, 
          quantity: multiplier, 
          weight: weight !== undefined ? weight * multiplier : undefined,
          uomName,
          customPrice,
          uomId
        }
      ];
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
        .filter(p => 
          p.name.toLowerCase().includes(q) || 
          (p.sku && p.sku.toLowerCase().includes(q)) ||
          (p.barcode && p.barcode.toLowerCase().includes(q)) ||
          (p.barcode2 && p.barcode2.toLowerCase().includes(q)) ||
          (Array.isArray((p as any).unit_barcodes) && (p as any).unit_barcodes.some((ub: any) => ub.barcode && ub.barcode.toLowerCase().includes(q)))
        )
        .limit(10)
        .toArray();
      setSearchResults(results);
    };
    runSearch();
  }, [searchQuery]);

  // Process Checkout
  const handlePayment = async (splitData?: SplitPaymentDetails) => {
    if (cart.length === 0) {
      showToast('سلة التسوق فارغة!', 'error');
      return;
    }

    const effectivePaid = splitData 
      ? (splitData.cashReceived + splitData.card + splitData.credit + splitData.loyalty + (splitData.couponDiscount || 0))
      : amountPaid;

    if (!splitData && effectivePaid < total) {
      showToast('المبلغ المدفوع أقل من إجمالي الفاتورة', 'error');
      return;
    }

    const change = splitData 
      ? Math.max(0, splitData.cashReceived - splitData.cash)
      : Math.max(0, amountPaid - total);

    const effectiveMethod = splitData 
      ? ((splitData.card > 0 && splitData.cash > 0) ? 'SPLIT' : (splitData.card > 0 ? 'CARD' : 'CASH'))
      : paymentMethod;

    setIsPrinting(true);

    try {
      // Map cart items to order items schema
      const itemsPayload = cart.map(item => ({
        product_id: item.product.id,
        quantity: item.weight !== undefined ? item.weight : item.quantity,
        unit_price: getItemEffectivePrice(item.product, item.customPrice),
        uom_id: item.uomId || null
      }));

      const effectiveWarehouseId = selectedTerminal?.warehouse_id || settings?.defaultWarehouseId || settings?.default_warehouse_id || (warehouses && warehouses[0]?.id) || '00000000-0000-0000-0000-000000000000';

      const orderData = {
        sessionId: null,
        userId: currentUser.id,
        orderType: 'TAKEAWAY',
        notes: splitData 
          ? `مبيعات كاشير تجزئة سريعة [دفع متعدد: كاش ${splitData.cash}, فيزا ${splitData.card}, آجل ${splitData.credit}, ولاء ${splitData.loyalty}]`
          : 'مبيعات كاشير تجزئة سريعة',
        items: itemsPayload,
        warehouseId: effectiveWarehouseId,
        orgId: currentUser.organization_id,
        customerId: selectedCustomer?.id || null,
        paymentMethod: effectiveMethod,
        paymentAmount: total
      };

      let orderId: string | null = null;

      if (isOnline) {
        // 1. Create order on Supabase
        const { data, error } = await supabase.rpc('create_restaurant_order', {
          p_session_id: null,
          p_user_id: currentUser.id,
          p_order_type: 'TAKEAWAY',
          p_notes: orderData.notes,
          p_items: itemsPayload,
          p_customer_id: selectedCustomer?.id || null,
          p_warehouse_id: effectiveWarehouseId !== '00000000-0000-0000-0000-000000000000' ? effectiveWarehouseId : null,
          p_delivery_info: null,
          p_org_id: currentUser.organization_id
        });

        if (error) throw error;
        orderId = data;

        if (orderId) {
          // Update order with shift_id and terminal_id
          const updatePayload: any = { shift_id: activeShift?.id || null };
          if (selectedTerminal?.id) {
            updatePayload.terminal_id = selectedTerminal.id;
          }

          await supabase
            .from('orders')
            .update(updatePayload)
            .eq('id', orderId);

          // 2. Complete order (process payment & stock)
          let treasuryId = selectedTerminal?.cash_account_id;
          if (!treasuryId) {
            treasuryId = settings?.accountMappings?.CASH || settings?.account_mappings?.CASH || null;
            if (!treasuryId) {
              const { data: mappings } = await supabase
                .from('company_settings')
                .select('account_mappings')
                .eq('organization_id', currentUser.organization_id)
                .maybeSingle();
              treasuryId = mappings?.account_mappings?.CASH || null;
            }
          }

          const { error: payErr } = await supabase.rpc('complete_restaurant_order', {
            p_order_id: orderId,
            p_payment_method: effectiveMethod,
            p_amount: total,
            p_cash_account_id: treasuryId,
            p_org_id: currentUser.organization_id,
            p_warehouse_id: effectiveWarehouseId !== '00000000-0000-0000-0000-000000000000' ? effectiveWarehouseId : null
          });

          if (payErr) throw payErr;

          // 3. Record coupon usage if applied
          if (appliedCoupon) {
            await couponService.recordUsage(appliedCoupon.id, currentUser.organization_id);
          }
        }
      } else {
        // Queue order for offline sync
        const offlinePayload = {
          ...orderData,
          shift_id: activeShift?.id || null,
          terminal_id: selectedTerminal?.id || null,
          is_offline: true
        };
        await offlineService.queueOrder(offlinePayload);
      }

      const finalPromoDiscount = totalPromoDiscount || 0;
      const effectiveCouponDiscount = splitData?.couponDiscount !== undefined ? splitData.couponDiscount : (couponDiscount || 0);
      const totalSavings = finalPromoDiscount + effectiveCouponDiscount;

      // Fetch actual order number from database so receipt and database match 100%
      let actualOrderNumber = '';
      if (orderId) {
        try {
          const { data: ordRow } = await supabase
            .from('orders')
            .select('order_number')
            .eq('id', orderId)
            .maybeSingle();
          if (ordRow?.order_number) {
            actualOrderNumber = ordRow.order_number;
          }
        } catch (e) {
          console.warn('Could not fetch real order_number:', e);
        }
      }
      if (!actualOrderNumber) {
        actualOrderNumber = `ORD-${Date.now().toString().slice(-6)}`;
      }

      // Receipt printing structure
      setReceiptOrder({
        orderNumber: actualOrderNumber,
        date: new Date().toLocaleDateString('ar-EG'),
        time: new Date().toLocaleTimeString('ar-EG'),
        items: cart.map(i => ({
          name: i.product.name,
          quantity: i.weight !== undefined ? i.weight : i.quantity,
          price: getItemEffectivePrice(i.product, i.customPrice),
          originalPrice: isItemOfferActive(i.product) && i.customPrice === undefined ? Number(i.product.sales_price || 0) : undefined,
          isOffer: isItemOfferActive(i.product) && i.customPrice === undefined,
          unit: i.weight !== undefined ? 'كجم' : (i.uomName || 'حبة')
        })),
        subtotal,
        promoDiscount: finalPromoDiscount,
        appliedPromotions: appliedPromotions || [],
        appliedCoupon: appliedCoupon ? appliedCoupon.name : undefined,
        couponDiscount: effectiveCouponDiscount > 0 ? effectiveCouponDiscount : undefined,
        totalSavings,
        tax,
        total,
        amountPaid: effectivePaid,
        change,
        splitDetails: splitData
      });

      showToast(`تم إتمام العملية بنجاح. المتبقي للعميل: ${change.toFixed(2)} ${currencySymbol}`, 'success');
      
      // Refresh shift financials immediately after sale
      if (activeShift) {
        refreshShiftFinancials(activeShift);
      }
      setCart([]);
      setAmountPaid(0);
      setSearchQuery('');
      setSelectedCustomer(null);
      setPaymentMethod('CASH');
      setAppliedCoupon(null);
      setCouponDiscount(0);
      setCouponInput('');
      setIsSplitPaymentOpen(false);
      setSplitPaymentData(null);

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
          {/* ⚖️ Live Scale Connection Badge */}
          <button
            onClick={() => setIsScaleModalOpen(true)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-black transition-all ${
              scaleReading.connected
                ? 'bg-emerald-950/80 text-emerald-400 border border-emerald-800 animate-pulse'
                : 'bg-slate-900 text-slate-400 border border-slate-800 hover:border-slate-700'
            }`}
            title="ربط الميزان الإلكتروني المباشر (Direct Serial Scale)"
          >
            <Scale size={14} className={scaleReading.connected ? 'text-emerald-400' : 'text-slate-500'} />
            <span>
              {scaleReading.connected ? `${scaleReading.weight.toFixed(3)} كجم` : 'ربط الميزان'}
            </span>
          </button>

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
            <div className="flex items-center gap-2 bg-slate-900 border border-slate-800 px-3 py-1.5 rounded-xl text-sm">
              <span className="flex items-center gap-1.5 font-bold text-slate-300">
                <User size={14} className="text-slate-400" />
                {currentUser?.full_name || 'الكاشير'}
              </span>
              <span className="text-indigo-400 font-black">{selectedTerminal?.name}</span>
              <span className="h-4 w-px bg-slate-800" />

              {/* 💵 Live Cash Drawer Balance Badge */}
              <div 
                className="flex items-center gap-1.5 bg-emerald-950/90 border border-emerald-800/80 px-2.5 py-1 rounded-lg text-xs font-bold text-emerald-400 shadow-sm"
                title={`الرصيد التقديري في الدرج: ${shiftFinancials.drawerCash.toFixed(2)} ${currencySymbol}`}
              >
                <Banknote size={14} className="text-emerald-400" />
                <span>الدرج: <span className="font-mono">{shiftFinancials.drawerCash.toFixed(2)}</span> {currencySymbol}</span>
              </div>

              {/* 🔄 POS Returns (يتطلب تصريح المشرف بالليزر أو PIN) */}
              <button 
                onClick={handleOpenReturnModalWithSupervisorCheck}
                className="text-xs bg-blue-950/80 border border-blue-900/50 hover:bg-blue-900 text-blue-300 px-2.5 py-1 rounded-lg flex items-center gap-1 font-bold transition-all"
                title="مرتجع مبيعات (يتطلب تمرير كارت باركود المشرف أو إدخال الرمز)"
              >
                <RotateCcw size={12} />
                <span>مرتجع (F3)</span>
              </button>

              {/* 🪪 Supervisor Badge Print Button (يظهر للمشرف، المدير، أو الأدمن) */}
              {['admin', 'manager', 'owner', 'super_admin', 'pos_supervisor', 'retail_supervisor'].includes(currentUser?.role || '') && (
                <button 
                  onClick={() => setIsBadgePrintOpen(true)}
                  className="text-xs bg-indigo-950/80 border border-indigo-900/50 hover:bg-indigo-900 text-indigo-300 px-2.5 py-1 rounded-lg flex items-center gap-1 font-bold transition-all"
                  title="طباعة شارة باركود المشرف / الهيد كاشير"
                >
                  <ShieldCheck size={12} />
                  <span>كارت المشرف</span>
                </button>
              )}

              {/* 💵 Cash Drop */}
              <button 
                onClick={() => setIsCashDropOpen(true)}
                className="text-xs bg-amber-950/80 border border-amber-900/50 hover:bg-amber-900 text-amber-300 px-2.5 py-1 rounded-lg flex items-center gap-1 font-bold transition-all"
                title="سحب وتفريغ نقدية من الدرج إلى الإدارة"
              >
                <Banknote size={12} />
                <span>سحب نقدية</span>
              </button>

              {/* 📺 Dual-Screen Customer Display */}
              <button 
                onClick={() => window.open('#/retail/customer-display', 'TriProCustomerDisplay', 'width=1200,height=800')}
                className="text-xs bg-purple-950/80 border border-purple-900/50 hover:bg-purple-900 text-purple-300 px-2.5 py-1 rounded-lg flex items-center gap-1 font-bold transition-all"
                title="فتح شاشة العميل الخلفية (Dual Screen)"
              >
                <Monitor size={12} />
                <span>شاشة العميل</span>
              </button>

              <button 
                onClick={() => setIsHeldModalOpen(true)}
                className="text-xs bg-slate-800 border border-slate-700 hover:bg-slate-700 text-slate-300 px-2.5 py-1 rounded-lg flex items-center gap-1 font-bold transition-all"
              >
                <Pause size={12} /> 
                <span>المعلقة (F7)</span>
                {heldOrders.length > 0 && (
                  <span className="bg-amber-500 text-slate-950 text-[10px] px-1.5 py-0.2 rounded-full font-black">
                    {heldOrders.length}
                  </span>
                )}
              </button>

              <button 
                onClick={handleSyncProducts} 
                disabled={isSyncingProducts}
                className="text-xs bg-slate-800 border border-slate-700 hover:bg-slate-700 disabled:opacity-50 text-slate-300 px-2.5 py-1 rounded-lg flex items-center gap-1 font-bold transition-all"
              >
                <RefreshCw size={12} className={isSyncingProducts ? 'animate-spin' : ''} /> 
                {isSyncingProducts ? 'جاري التحديث...' : 'تحديث'}
              </button>

              <button 
                onClick={handleOpenCloseShiftModal} 
                className="text-xs bg-red-950/80 border border-red-900/50 hover:bg-red-900 text-red-400 px-2.5 py-1 rounded-lg flex items-center gap-1 font-bold transition-all"
              >
                <Lock size={12} /> إغلاق
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
                    {searchResults.map(p => {
                      const isOffer = isItemOfferActive(p);
                      const effectivePrice = getItemEffectivePrice(p);
                      return (
                        <div 
                          key={p.id} 
                          onClick={() => {
                            addToCart(p);
                            setSearchQuery('');
                          }}
                          className="p-3 border-b border-slate-800/50 hover:bg-slate-900 cursor-pointer flex justify-between items-center transition-all"
                        >
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-sm text-white">{p.name}</span>
                              {isOffer && (
                                <span className="bg-amber-500/20 text-amber-300 border border-amber-500/40 text-[10px] px-1.5 py-0.5 rounded font-black flex items-center gap-1">
                                  🔥 عرض خاص
                                </span>
                              )}
                            </div>
                            <div className="text-xs text-slate-500 font-mono">{p.barcode || p.sku}</div>
                          </div>
                          <div className="text-left">
                            <div className="text-sm font-black text-indigo-400">{effectivePrice.toFixed(2)} {currencySymbol}</div>
                            {isOffer && (
                              <div className="text-xs text-slate-500 line-through font-mono">{Number(p.sales_price || 0).toFixed(2)} {currencySymbol}</div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* Pricing Tier Selector Bar */}
            <div className="px-4 py-2 bg-slate-950/70 border-b border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-slate-400">فئة السعر:</span>
                <div className="flex bg-slate-900 p-0.5 rounded-lg border border-slate-800">
                  {[
                    { id: 'retail', label: 'قطاعي', activeBg: 'bg-indigo-600 text-white' },
                    { id: 'wholesale', label: 'جملة', activeBg: 'bg-blue-600 text-white' },
                    { id: 'half', label: 'نصف جملة', activeBg: 'bg-sky-600 text-white' },
                  ].map(t => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => setPricingTier(t.id as any)}
                      className={`px-3 py-1 text-xs font-bold rounded-md transition-all ${
                        pricingTier === t.id 
                          ? `${t.activeBg} shadow` 
                          : 'text-slate-400 hover:text-white hover:bg-slate-800'
                      }`}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="text-[11px] text-slate-500 font-medium">
                {pricingTier === 'wholesale' ? '⚡ أسعار بيع الجملة مفعلة' : pricingTier === 'half' ? '⚡ أسعار نصف الجملة مفعلة' : '🏷️ أسعار البيع بالتجزئة'}
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
                        const isOffer = isItemOfferActive(item.product) && item.customPrice === undefined;
                        const price = getItemEffectivePrice(item.product, item.customPrice);
                        const isWeight = item.weight !== undefined;
                        const qty = isWeight ? item.weight! : item.quantity;
                        const rowTotal = price * qty;
                        return (
                          <tr key={idx} className="border-b border-slate-800/40 hover:bg-slate-900/30 text-sm transition-all">
                            <td className="p-3">
                              <div className="flex items-center gap-2">
                                <span className="font-black text-white">{item.product.name}</span>
                                {isOffer && (
                                  <span className="bg-amber-500/20 text-amber-300 border border-amber-500/40 text-[10px] px-1.5 py-0.5 rounded font-black flex items-center gap-1">
                                    🔥 عرض خاص
                                  </span>
                                )}
                              </div>
                              <div className="text-xs text-slate-500 font-mono">{item.product.barcode || item.product.sku}</div>
                            </td>
                            <td className="p-3 text-center">
                              {isWeight ? (
                                <span className="bg-amber-950/80 text-amber-400 border border-amber-900 px-2 py-0.5 rounded text-[10px] font-black flex items-center justify-center gap-1 w-fit mx-auto">
                                  <Scale size={10} /> ميزان ({item.weight} كجم)
                                </span>
                              ) : (
                                <span className="bg-slate-800 text-slate-300 px-2 py-0.5 rounded text-[10px] font-black">
                                  {item.uomName || 'حبة'}
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
                            <td className="p-3 text-left font-bold font-mono">
                              {isOffer ? (
                                <div>
                                  <span className="text-amber-400 font-black">{price.toFixed(2)}</span>
                                  <span className="text-slate-500 line-through text-xs mr-1">{Number(item.product.sales_price || 0).toFixed(2)}</span>
                                </div>
                              ) : (
                                <span className="text-slate-300">{price.toFixed(2)}</span>
                              )}
                            </td>
                            <td className="p-3 text-left font-black font-mono text-indigo-400">{rowTotal.toFixed(2)}</td>
                            <td className="p-3 text-center">
                              <button 
                                onClick={() => {
                                  setSupervisorModalState({
                                    isOpen: true,
                                    actionTitle: `إلغاء صنف: ${item.product.name}`,
                                    actionDescription: 'حذف صنف مسجل في الفاتورة يتطلب تصريح المشرف (Void Line)',
                                    onSuccess: () => {
                                      setCart(prev => prev.filter(i => i.product.id !== item.product.id));
                                      setSupervisorModalState(prev => ({ ...prev, isOpen: false }));
                                      showToast(`تم حذف الصنف (${item.product.name}) بتصريح المشرف`, 'info');
                                    }
                                  });
                                }}
                                className="text-red-500 hover:text-red-400 p-1.5 rounded-lg hover:bg-red-950/30 transition-all"
                                title="حذف الصنف (يتطلب تصريح المشرف)"
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
            <div className="p-6 bg-slate-950 border-t border-slate-800 space-y-3">
              {appliedPromotions.length > 0 && (
                <div className="space-y-1 bg-purple-950/40 border border-purple-900/50 p-2.5 rounded-xl text-xs">
                  <span className="font-bold text-amber-300 flex items-center gap-1">
                    <Sparkles size={13} /> العروض والخصومات المطبقة:
                  </span>
                  {appliedPromotions.map((p, i) => (
                    <div key={i} className="flex justify-between text-purple-200">
                      <span>{p.promoName}</span>
                      <span className="font-bold font-mono text-emerald-400">-{p.discountAmount.toFixed(2)} {currencySymbol}</span>
                    </div>
                  ))}
                </div>
              )}

              <div className="grid grid-cols-4 gap-4 text-sm text-slate-400">
                <div className="bg-slate-900/50 p-3 rounded-xl border border-slate-800/40">
                  <span className="block text-xs text-slate-500 mb-1">المجموع الفرعي</span>
                  <span className="text-lg font-bold font-mono text-slate-300">{subtotal.toFixed(2)} {currencySymbol}</span>
                </div>
                <div className="bg-slate-900/50 p-3 rounded-xl border border-slate-800/40">
                  <span className="block text-xs text-amber-400 mb-1">العروض والخصم</span>
                  <span className="text-lg font-bold font-mono text-amber-400">-{totalPromoDiscount.toFixed(2)} {currencySymbol}</span>
                </div>
                <div className="bg-slate-900/50 p-3 rounded-xl border border-slate-800/40">
                  <span className="block text-xs text-slate-500 mb-1">
                    {isTaxEnabled ? `الضريبة (${(vatRate * 100).toFixed(0)}%)` : 'الضريبة (معطلة)'}
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
            
            {/* Customer Loyalty Search */}
            <div className="space-y-4">
              <h3 className="font-black text-sm text-slate-400 flex items-center gap-1.5">
                <User size={16} /> العميل وبرنامج الولاء
              </h3>
              <div className="bg-slate-950 border border-slate-800 rounded-2xl p-4 space-y-3">
                {selectedCustomer ? (
                  <div className="space-y-2">
                    <div className="flex justify-between items-center bg-indigo-950/40 p-3 rounded-xl border border-indigo-900/30">
                      <div>
                        <div className="font-bold text-white text-sm">{selectedCustomer.name}</div>
                        <div className="text-xs text-indigo-300 font-mono">{selectedCustomer.phone || 'بدون هاتف'}</div>
                      </div>
                      <button 
                        onClick={() => setSelectedCustomer(null)}
                        className="text-xs bg-slate-900 hover:bg-slate-800 text-red-400 px-2.5 py-1 rounded-lg border border-slate-800 transition-all font-bold"
                      >
                        إلغاء
                      </button>
                    </div>

                    {/* Customer Loyalty Points Badge & Quick Redeem */}
                    {Number(selectedCustomer.loyalty_points || 0) > 0 && (
                      <div className="bg-amber-950/30 border border-amber-800/40 p-2.5 rounded-xl flex items-center justify-between text-xs">
                        <span className="text-amber-300 font-bold flex items-center gap-1">
                          <Gift size={14} className="text-amber-400" />
                          رصيد نقاط الولاء: <span className="font-mono font-black text-amber-200">{selectedCustomer.loyalty_points}</span> نقطة
                        </span>
                        <button
                          onClick={() => setIsSplitPaymentOpen(true)}
                          className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-black px-2 py-0.5 rounded text-[11px] transition-all"
                        >
                          استبدال النقاط
                        </button>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="relative">
                    <input 
                      type="text" 
                      value={customerSearch} 
                      onChange={e => setCustomerSearch(e.target.value)} 
                      placeholder="ابحث عن العميل بالاسم أو رقم الهاتف..." 
                      className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2.5 text-xs text-white placeholder:text-slate-600 focus:border-indigo-500 outline-none" 
                    />
                    {customerResults.length > 0 && (
                      <div className="absolute left-0 right-0 mt-1 bg-slate-950 border border-slate-850 rounded-xl shadow-2xl z-50 overflow-hidden max-h-40 overflow-y-auto">
                        {customerResults.map(c => (
                          <div 
                            key={c.id} 
                            onClick={() => {
                              setSelectedCustomer(c);
                              setCustomerSearch('');
                              setCustomerResults([]);
                            }}
                            className="p-2.5 border-b border-slate-800/50 hover:bg-slate-900 cursor-pointer flex justify-between items-center text-xs transition-all"
                          >
                            <span className="font-bold text-white">{c.name}</span>
                            <span className="text-slate-500 font-mono">{c.phone}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* 🎟️ Coupon / Promo Code Input Box */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <h3 className="font-black text-xs text-slate-400 flex items-center gap-1.5">
                  <Ticket size={14} className="text-amber-400" /> كود خصم / كوبون
                </h3>
                {appliedCoupon && (
                  <span className="text-[10px] bg-emerald-950 text-emerald-400 border border-emerald-800 px-2 py-0.5 rounded font-bold">
                    مفعّل: {appliedCoupon.name} (-{couponDiscount.toFixed(2)} {currencySymbol})
                  </span>
                )}
              </div>

              <div className="flex gap-2">
                <input
                  type="text"
                  value={couponInput}
                  onChange={e => setCouponInput(e.target.value.toUpperCase())}
                  placeholder="أدخل كود الكوبون..."
                  className="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white uppercase font-mono font-bold placeholder:text-slate-600 focus:border-indigo-500 outline-none"
                />
                {appliedCoupon ? (
                  <button
                    onClick={handleRemoveCoupon}
                    className="bg-rose-950/80 hover:bg-rose-900 border border-rose-800 text-rose-300 px-3 py-2 rounded-xl text-xs font-bold transition-all"
                  >
                    إلغاء
                  </button>
                ) : (
                  <button
                    onClick={handleApplyCoupon}
                    disabled={cart.length === 0}
                    className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white px-4 py-2 rounded-xl text-xs font-bold transition-all shadow-md"
                  >
                    تطبيق
                  </button>
                )}
              </div>
            </div>

            {/* Payment Method Selector */}
            <div className="space-y-4">
              <h3 className="font-black text-sm text-slate-400 flex items-center gap-1.5">
                <Coins size={16} /> طريقة الدفع
              </h3>
              <div className="grid grid-cols-2 gap-3">
                <button 
                  onClick={() => setPaymentMethod('CASH')}
                  className={`py-3 rounded-xl font-black flex items-center justify-center gap-2 border transition-all text-sm ${
                    paymentMethod === 'CASH' 
                      ? 'bg-indigo-600 border-indigo-500 text-white shadow-lg shadow-indigo-500/10' 
                      : 'bg-slate-950 border-slate-800 hover:bg-slate-900 text-slate-400'
                  }`}
                >
                  💵 دفع نقدي (كاش)
                </button>
                <button 
                  onClick={() => setPaymentMethod('CARD')}
                  className={`py-3 rounded-xl font-black flex items-center justify-center gap-2 border transition-all text-sm ${
                    paymentMethod === 'CARD' 
                      ? 'bg-indigo-600 border-indigo-500 text-white shadow-lg shadow-indigo-500/10' 
                      : 'bg-slate-950 border-slate-800 hover:bg-slate-900 text-slate-400'
                  }`}
                >
                  💳 بطاقة بنكية (فيزا)
                </button>
              </div>
            </div>

            {/* Cash Input Drawer / Card Info */}
            <div className="space-y-4">
              <h3 className="font-black text-sm text-slate-400 flex items-center gap-1.5">
                <Coins size={16} /> حساب النقدية المقبوضة
              </h3>

              <div className="bg-slate-950 border border-slate-800 rounded-2xl p-5 space-y-4 shadow-inner">
                {paymentMethod === 'CASH' ? (
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
                ) : (
                  <div className="bg-indigo-950/20 p-4 rounded-xl border border-indigo-900/30 text-center">
                    <span className="block text-xs text-indigo-400/80 mb-1">المبلغ المطلوب خصمه من البطاقة البنكية</span>
                    <span className="text-3xl font-black font-mono text-indigo-400">{total.toFixed(2)} {currencySymbol}</span>
                  </div>
                )}

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
                onClick={() => handlePayment()}
                className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-black py-5 rounded-2xl shadow-xl shadow-indigo-600/10 transition-all flex justify-center items-center gap-3 text-xl"
              >
                {isPrinting ? (
                  <Loader2 className="animate-spin" size={24} />
                ) : (
                  <Printer size={24} />
                )}
                دفع وطباعة الفاتورة (F8)
              </button>

              <div className="grid grid-cols-2 gap-3">
                <button 
                  onClick={handleHoldOrder}
                  disabled={cart.length === 0}
                  className="bg-amber-600/20 hover:bg-amber-600/30 text-amber-300 disabled:opacity-40 text-sm font-black py-3.5 rounded-xl border border-amber-500/30 transition-all flex items-center justify-center gap-2"
                >
                  <Pause size={16} /> تعليق الفاتورة (F6)
                </button>
                <button 
                  onClick={() => {
                    if (cart.length > 0 && window.confirm('هل أنت متأكد من رغبتك في إفراغ سلة التسوق؟')) {
                      setCart([]);
                      setAmountPaid(0);
                    }
                  }}
                  className="bg-slate-900 hover:bg-slate-850 text-slate-400 hover:text-white text-sm font-bold py-3.5 rounded-xl border border-slate-800 transition-all"
                >
                  إفراغ السلة (F2)
                </button>
              </div>
            </div>

          </div>

        </div>
      )}

      {/* ⏸️ Held / Parked Orders Modal */}
      {isHeldModalOpen && (
        <div className="fixed inset-0 bg-slate-950/90 z-50 flex items-center justify-center p-4 backdrop-blur-sm" dir="rtl">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden">
            <div className="p-5 border-b border-slate-800 flex justify-between items-center bg-slate-950/50">
              <h3 className="font-black text-lg text-white flex items-center gap-2">
                <Pause size={20} className="text-amber-400" /> الفواتير المعلقة في الوردية ({heldOrders.length})
              </h3>
              <button 
                onClick={() => setIsHeldModalOpen(false)}
                className="text-slate-400 hover:text-white text-sm px-3 py-1 rounded-lg bg-slate-800"
              >
                إغلاق
              </button>
            </div>

            <div className="p-6 max-h-[60vh] overflow-y-auto space-y-3">
              {heldOrders.length === 0 ? (
                <div className="text-center py-12 text-slate-500 space-y-2">
                  <Clock size={40} className="mx-auto text-slate-600" />
                  <p className="font-bold">لا توجد فواتير معلقة حالياً</p>
                  <p className="text-xs">يمكنك تعليق أي فاتورة جارية بالضغط على F6 لخدمة العميل التالي فوراً.</p>
                </div>
              ) : (
                heldOrders.map((held) => (
                  <div key={held.id} className="bg-slate-950 border border-slate-800 hover:border-indigo-500/50 p-4 rounded-xl flex justify-between items-center transition-all">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-black text-amber-400 bg-amber-950/50 px-2 py-0.5 rounded text-xs border border-amber-900/50">
                          {held.id}
                        </span>
                        <span className="text-xs text-slate-400 flex items-center gap-1 font-mono">
                          <Clock size={12} /> {held.heldAt}
                        </span>
                        {held.customer && (
                          <span className="text-xs bg-indigo-950 text-indigo-300 px-2 py-0.5 rounded-full font-bold">
                            👤 {held.customer.name}
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-slate-400">
                        {held.cart.length} أصناف: {held.cart.map(c => c.product.name).slice(0, 3).join('، ')} {held.cart.length > 3 ? '...' : ''}
                      </div>
                      <div className="text-sm font-black font-mono text-white">
                        الإجمالي: <span className="text-emerald-400">{held.total.toFixed(2)} {currencySymbol}</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <button 
                        onClick={() => handleResumeOrder(held)}
                        className="bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs px-4 py-2 rounded-xl flex items-center gap-1.5 shadow-lg shadow-indigo-600/20 transition-all"
                      >
                        <Play size={14} /> استرجاع للسلة
                      </button>
                      <button 
                        onClick={() => handleDeleteHeld(held.id)}
                        className="bg-slate-900 hover:bg-red-950/80 text-slate-500 hover:text-red-400 p-2 rounded-xl border border-slate-800 transition-all"
                        title="حذف الفاتورة"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                ))
              )}
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
              
              <div className="grid grid-cols-2 gap-2.5 text-xs">
                <div className="bg-slate-950 p-2.5 rounded-xl border border-slate-800/60">
                  <span className="block text-slate-500 mb-0.5">الرصيد الافتتاحي</span>
                  <span className="font-mono font-bold text-base text-slate-200">
                    {Number(shiftSummary.opening_balance).toFixed(2)} {currencySymbol}
                  </span>
                </div>
                <div className="bg-slate-950 p-2.5 rounded-xl border border-slate-800/60">
                  <span className="block text-slate-500 mb-0.5">مبيعات نقدية (كاش)</span>
                  <span className="font-mono font-bold text-base text-emerald-400">
                    +{Number(shiftSummary.cash_sales || shiftSummary.total_sales).toFixed(2)} {currencySymbol}
                  </span>
                </div>
                <div className="bg-rose-950/30 p-2.5 rounded-xl border border-rose-900/40">
                  <span className="block text-rose-400 font-bold mb-0.5">مرتجعات نقدية من الدرج</span>
                  <span className="font-mono font-bold text-base text-rose-300">
                    -{Number(shiftSummary.cash_returns || 0).toFixed(2)} {currencySymbol}
                  </span>
                </div>
                <div className="bg-amber-950/30 p-2.5 rounded-xl border border-amber-900/40">
                  <span className="block text-amber-400 font-bold mb-0.5">سحوبات نقدية (تفريغ)</span>
                  <span className="font-mono font-bold text-base text-amber-300">
                    -{Number(shiftSummary.cash_drops || 0).toFixed(2)} {currencySymbol}
                  </span>
                </div>
              </div>

              <div className="border-t border-slate-800/60 pt-4 space-y-4">
                <div className="flex justify-between items-center bg-slate-950/60 p-3.5 rounded-xl border border-indigo-900/40 shadow-inner">
                  <div>
                    <span className="font-black text-sm text-slate-200 block">صافي النقدية المتوقع بالدرج:</span>
                    <span className="text-[10px] text-slate-400">(افتتاحي + كاش مبيعات - مرتجعات - سحوبات)</span>
                  </div>
                  <span className="font-mono font-black text-2xl text-indigo-400">{(Number(shiftSummary.expected_cash)).toFixed(2)} {currencySymbol}</span>
                </div>

                <div>
                  <div className="flex justify-between items-center mb-2">
                    <label className="text-xs font-black text-slate-400">المبلغ الفعلي المقبوض في الدرج</label>
                    <button
                      type="button"
                      onClick={() => setActualCash(Number(shiftSummary.expected_cash))}
                      className="text-[11px] font-bold text-indigo-400 hover:text-indigo-300 bg-indigo-950/60 border border-indigo-800/60 px-2 py-0.5 rounded-lg transition-all"
                    >
                      مطابق للمتوقع ({Number(shiftSummary.expected_cash).toFixed(2)})
                    </button>
                  </div>
                  <input 
                    type="number" 
                    value={actualCash !== undefined && actualCash !== null ? actualCash : ''} 
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
                <p className="font-bold text-sm">رقم الفاتورة: {receiptOrder.orderNumber}</p>
                <p>التاريخ: {receiptOrder.date} | الوقت: {receiptOrder.time}</p>
                <p>الكاشير: {currentUser?.full_name}</p>
                <p>الجهاز: {selectedTerminal?.name}</p>
              </div>
              <div 
                className="my-1.5 flex justify-center overflow-hidden" 
                dangerouslySetInnerHTML={{ 
                  __html: generateCode128Svg(receiptOrder.orderNumber, { height: 36, barWidth: 1.5, showText: false }) 
                }} 
              />
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
                <div className="flex justify-between">
                  <span>المجموع الفرعي:</span>
                  <span>{receiptOrder.subtotal.toFixed(2)} {currencySymbol}</span>
                </div>

                {receiptOrder.promoDiscount > 0 && (
                  <div className="flex justify-between text-xs" style={{ color: '#000' }}>
                    <span>خصم العروض الترويجية:</span>
                    <span>-{receiptOrder.promoDiscount.toFixed(2)} {currencySymbol}</span>
                  </div>
                )}

                {receiptOrder.appliedPromotions && receiptOrder.appliedPromotions.length > 0 && (
                  <div className="space-y-0.5 pr-2 my-0.5">
                    {receiptOrder.appliedPromotions.map((p: any, idx: number) => (
                      <div key={idx} className="flex justify-between text-[10px]" style={{ color: '#333' }}>
                        <span>• {p.promoName || 'عرض خاص'}:</span>
                        <span>-{Number(p.discountAmount).toFixed(2)} {currencySymbol}</span>
                      </div>
                    ))}
                  </div>
                )}

                {receiptOrder.couponDiscount > 0 && (
                  <div className="flex justify-between text-xs" style={{ color: '#000' }}>
                    <span>خصم الكوبون ({receiptOrder.appliedCoupon || 'كوبون'}):</span>
                    <span>-{receiptOrder.couponDiscount.toFixed(2)} {currencySymbol}</span>
                  </div>
                )}

                {receiptOrder.totalSavings > 0 && (
                  <div className="flex justify-between text-xs font-black py-1 border-y border-dashed border-black my-1" style={{ backgroundColor: '#f5f5f5' }}>
                    <span>🎉 إجمالي ما وفرته:</span>
                    <span>{receiptOrder.totalSavings.toFixed(2)} {currencySymbol}</span>
                  </div>
                )}

                {receiptOrder.tax > 0 && (
                  <div className="flex justify-between">
                    <span>الضريبة ({(vatRate * 100).toFixed(0)}%):</span>
                    <span>{receiptOrder.tax.toFixed(2)} {currencySymbol}</span>
                  </div>
                )}

                <div className="flex justify-between" style={{ fontSize: '14px', borderTop: '1px solid black', paddingTop: '4px' }}>
                  <span>الإجمالي الكلي:</span>
                  <span>{receiptOrder.total.toFixed(2)} {currencySymbol}</span>
                </div>
                <hr style={{ borderTop: '1px dashed black' }} />
                
                {receiptOrder.splitDetails ? (
                  <div className="space-y-0.5 text-xs">
                    <p style={{ fontWeight: 'bold' }}>تفاصيل الدفع المجزأ:</p>
                    {receiptOrder.splitDetails.cash > 0 && (
                      <div className="flex justify-between"><span>- كاش:</span><span>{receiptOrder.splitDetails.cash.toFixed(2)} {currencySymbol}</span></div>
                    )}
                    {receiptOrder.splitDetails.card > 0 && (
                      <div className="flex justify-between"><span>- بطاقة فيزا:</span><span>{receiptOrder.splitDetails.card.toFixed(2)} {currencySymbol}</span></div>
                    )}
                    {receiptOrder.splitDetails.credit > 0 && (
                      <div className="flex justify-between"><span>- آجل / ذمة:</span><span>{receiptOrder.splitDetails.credit.toFixed(2)} {currencySymbol}</span></div>
                    )}
                    {receiptOrder.splitDetails.loyalty > 0 && (
                      <div className="flex justify-between"><span>- نقاط ولاء:</span><span>{receiptOrder.splitDetails.loyalty.toFixed(2)} {currencySymbol}</span></div>
                    )}
                  </div>
                ) : (
                  <div className="flex justify-between text-xs"><span>المدفوع:</span><span>{receiptOrder.amountPaid.toFixed(2)} {currencySymbol}</span></div>
                )}

                <div className="flex justify-between text-xs"><span>الفكة (المتبقي):</span><span>{receiptOrder.change.toFixed(2)} {currencySymbol}</span></div>
              </div>

              {receiptOrder.totalSavings > 0 && (
                <div className="text-center my-2 p-1.5 border border-dashed border-black rounded" style={{ fontSize: '11px', backgroundColor: '#fafafa' }}>
                  <p className="font-black text-xs">
                    🎉 لقد وفرت في هذه الفاتورة: {receiptOrder.totalSavings.toFixed(2)} {currencySymbol} 🎉
                  </p>
                  <p className="text-[10px] text-gray-700">شكراً لتسوقكم معنا واستفادتكم من عروضنا!</p>
                </div>
              )}

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

      {/* ⌨️ Keyboard Shortcuts Info Bar */}
      {activeShift && (
        <footer className="bg-slate-950 border-t border-slate-800 px-6 py-2 flex justify-between items-center text-xs text-slate-500 font-bold select-none">
          <div className="flex items-center gap-4">
            <span>⌨️ أزرار التحكم السريع:</span>
            <span className="flex items-center gap-1"><kbd className="bg-slate-900 px-1.5 py-0.5 rounded border border-slate-700 text-slate-300">F8</kbd> الدفع والطباعة</span>
            <span className="flex items-center gap-1"><kbd className="bg-slate-900 px-1.5 py-0.5 rounded border border-slate-700 text-amber-400">F6</kbd> تعليق الفاتورة</span>
            <span className="flex items-center gap-1"><kbd className="bg-slate-900 px-1.5 py-0.5 rounded border border-slate-700 text-amber-400">F7</kbd> المعلقة ({heldOrders.length})</span>
            <span className="flex items-center gap-1"><kbd className="bg-slate-900 px-1.5 py-0.5 rounded border border-slate-700 text-slate-300">F9</kbd> تحديد المستلم</span>
            <span className="flex items-center gap-1"><kbd className="bg-slate-900 px-1.5 py-0.5 rounded border border-slate-700 text-slate-300">F4</kbd> بحث</span>
          </div>
          <div>
            <span>💡 نصيحة للكاشير: يمكنك إدخال الكمية متبوعة بنجمة ثم الباركود للضرب السريع (مثال: <span className="font-mono text-indigo-400">5*barcode</span>)</span>
          </div>
        </footer>
      )}

      {/* 🛡️ Supervisor PIN Modal */}
      <SupervisorPinModal
        isOpen={supervisorModalState.isOpen}
        onClose={() => setSupervisorModalState(prev => ({ ...prev, isOpen: false }))}
        onSuccess={supervisorModalState.onSuccess}
        actionTitle={supervisorModalState.actionTitle}
        actionDescription={supervisorModalState.actionDescription}
        showPrintButton={['admin', 'manager', 'owner', 'super_admin', 'pos_supervisor', 'retail_supervisor'].includes(currentUser?.role || '')}
        orgName={organization?.name || 'TriPro Hypermarket'}
      />

      {/* 💵 Cash Drop Modal */}
      <CashDropModal
        isOpen={isCashDropOpen}
        onClose={() => setIsCashDropOpen(false)}
        organizationId={currentSelectedOrgId || currentUser?.organization_id}
        onConfirm={async (amt, reason, receiver, payoutType, expenseAccountId, targetAccountId) => {
          const newDrop = {
            amount: amt,
            reason,
            receiverName: receiver,
            time: new Date().toLocaleTimeString('ar-EG')
          };
          setCashDrops(prev => [newDrop, ...prev]);

          // Save cash drop to database with type, accounts, and public_shift_id
          try {
            const { error: dropErr } = await supabase.from('pos_petty_cash_payouts').insert({
              organization_id: currentSelectedOrgId || currentUser?.organization_id,
              public_shift_id: activeShift?.id,   // UUID من public.shifts
              cashier_id: currentUser?.id,
              amount: amt,
              payout_type: payoutType,
              reason: reason || payoutType,
              expense_account_id: expenseAccountId || null,
              target_account_id: targetAccountId || null,
              custodian_name: payoutType === 'CUSTODIAN' ? receiver : null,
            });
            if (dropErr) {
              console.warn('Could not persist cash drop to pos_petty_cash_payouts:', dropErr);
            }
          } catch (dropErr) {
            console.warn('Could not persist cash drop to pos_petty_cash_payouts:', dropErr);
          }

          if (activeShift) {
            refreshShiftFinancials(activeShift);
          }
        }}
        currentDrawerTotal={shiftFinancials.drawerCash}
        cashierName={currentUser?.full_name || 'الكاشير'}
      />


      {/* 🔄 POS Returns Modal */}
      <PosReturnModal
        isOpen={isReturnModalOpen}
        onClose={() => setIsReturnModalOpen(false)}
        shiftId={activeShift?.id}
        warehouseId={selectedTerminal?.warehouse_id || warehouses?.[0]?.id}
        onSuccess={(returnSummary) => {
          showToast(`تم تسجيل المرتجع (${returnSummary.returnNumber}) بمبلغ ${returnSummary.totalRefund.toFixed(2)} ${currencySymbol} بنجاح`, 'success');
          if (activeShift) {
            refreshShiftFinancials(activeShift);
          }
        }}
        orgId={currentSelectedOrgId || currentUser?.organization_id || organization?.id || ''}
        cashierId={currentUser?.id || ''}
        cashierName={currentUser?.full_name || 'الكاشير'}
      />

      {/* 🪪 Supervisor Badge Print Modal */}
      <SupervisorBadgePrintModal
        isOpen={isBadgePrintOpen}
        onClose={() => setIsBadgePrintOpen(false)}
        orgName={organization?.name || 'TriPro Hypermarket'}
        supervisorName={currentUser?.full_name || 'مشرف الوردية'}
      />

      {/* 🔄 Split Payment Modal (تعدد طرق الدفع) */}
      <SplitPaymentModal
        isOpen={isSplitPaymentOpen}
        onClose={() => setIsSplitPaymentOpen(false)}
        totalAmount={total}
        selectedCustomer={selectedCustomer}
        currencySymbol={currencySymbol}
        couponDiscount={couponDiscount}
        couponCode={appliedCoupon?.code}
        onConfirm={(details) => {
          setSplitPaymentData(details);
          handlePayment(details);
        }}
      />

      {/* ⚖️ Electronic Scale Modal */}
      <ScaleConnectModal
        isOpen={isScaleModalOpen}
        onClose={() => setIsScaleModalOpen(false)}
      />

    </div>
  );
}

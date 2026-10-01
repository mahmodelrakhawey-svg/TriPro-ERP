import React, { useState, useEffect, useRef, useCallback } from 'react';
import { logger } from '../../../../utils/logger';
import { useToast } from '../../../../context/ToastContext';
import { supabase } from '../../../../supabaseClient';
import { useAccounting, DEFAULT_OFFLINE_PRODUCTS } from '../../../../context/AccountingContext';
import { db, offlineService, isValidUUID } from '../../../../services/offlineService';
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
import { getLiveShiftFinancials, calculateClosingShiftSummary } from '../../services/posShiftService';
import { resolveScannedBarcode } from '../../services/posProductResolver';
import { usePosCart, PosCartItem, isItemOfferActive, getItemEffectivePrice } from '../../hooks/usePosCart';
import { processPosCheckout } from '../../services/posCheckoutService';
import HeldOrdersModal, { HeldOrder } from './HeldOrdersModal';
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
import RetailPosHeader from './RetailPosHeader';
import RetailPosCartTable from './RetailPosCartTable';
import RetailPosShiftOpenView from './RetailPosShiftOpenView';
import RetailPosPaymentPanel from './RetailPosPaymentPanel';
import RetailPosShiftCloseModal from './RetailPosShiftCloseModal';
import RetailPosPrintReceipt from './RetailPosPrintReceipt';
import RetailPosShortcutsFooter from './RetailPosShortcutsFooter';

type CartItem = PosCartItem;

export default function RetailPosScreen() {
  const { currentUser, organization, settings, warehouses, refreshData, currentSelectedOrgId } = useAccounting() as any;
  const { showToast } = useToast();

  const currencySymbol = settings?.currency || 'ج.م';
  const effectiveOrgId = (currentSelectedOrgId && isValidUUID(currentSelectedOrgId))
    ? currentSelectedOrgId
    : ((organization?.id && isValidUUID(organization.id))
        ? organization.id
        : ((currentUser?.organization_id && isValidUUID(currentUser.organization_id))
            ? currentUser.organization_id
            : null));

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

  // Cart State (managed by usePosCart hook)
  const {
    cart,
    setCart,
    pricingTier,
    setPricingTier,
    addToCart,
    updateQuantity,
    getItemEffectivePrice: getEffectivePriceHook
  } = usePosCart();
  const [barcodeInput, setBarcodeInput] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<CachedProduct[]>([]);
  
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

        secureStorage.removeItem('tripro_promos_active');
        if (dbActivePromos && Array.isArray(dbActivePromos)) {
          setPromotions(dbActivePromos);
        } else {
          const local = (secureStorage.getItem(`tripro_promos_${orgId}`) || []) as PromotionRule[];
          if (Array.isArray(local) && local.length > 0) {
            setPromotions(local.filter(p => p.is_active !== false));
          } else {
            setPromotions([]);
          }
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
      logger.warn('Audio context blocked or unsupported');
    }
  };

  // Focus references
  const barcodeInputRef = useRef<HTMLInputElement>(null);
  const printAreaRef = useRef<HTMLDivElement>(null);

  // 🏷️ دالة تحديد السعر الفعلي للصنف من خلال hook السلة الموحد
  const getItemEffectivePrice = (product: CachedProduct, customPrice?: number): number => {
    return getEffectivePriceHook(product, customPrice);
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
    } catch (e) {
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
      let termData: any[] = [];
      const targetOrg = effectiveOrgId || (currentUser?.organization_id && isValidUUID(currentUser.organization_id) ? currentUser.organization_id : null);

      if (navigator.onLine && currentUser.role !== 'demo' && targetOrg) {
        try {
          const { data, error: termErr } = await supabase
            .from('pos_terminals')
            .select('*')
            .eq('status', 'ACTIVE')
            .eq('organization_id', targetOrg);
          if (!termErr && data) {
            termData = data;
          }
        } catch (e) {}
      }

      // 🛡️ Auto-provision a default terminal in DB if none exists for this organization and user is online
      if ((!termData || termData.length === 0) && navigator.onLine && currentUser.role !== 'demo' && targetOrg) {
        try {
          let defaultCashId = settings?.accountMappings?.CASH || settings?.account_mappings?.CASH || null;
          if (!isValidUUID(defaultCashId)) {
            defaultCashId = null;
          }

          const { data: insertedTerm, error: insErr } = await supabase
            .from('pos_terminals')
            .insert({
              name: 'الكاشير الرئيسي 1',
              organization_id: targetOrg,
              cash_account_id: defaultCashId,
              status: 'ACTIVE'
            })
            .select('*')
            .maybeSingle();

          if (!insErr && insertedTerm) {
            termData = [insertedTerm];
          }
        } catch (seedErr) {
          logger.warn('Could not auto-create pos_terminal in database:', seedErr);
        }
      }

      // Seed a default terminal fallback if still none exists (demo or offline purposes)
      if (!termData || termData.length === 0) {
        const cachedValidOrg = secureStorage.getItem<string>('tripro_last_valid_org_id') || 
          (typeof window !== 'undefined' ? window.localStorage?.getItem('tripro_last_valid_org_id') : null);
        const effectiveFallbackOrg = targetOrg || (cachedValidOrg || '00000000-0000-0000-0000-000000000000');

        const defaultTerm = {
          id: 'term-offline-1',
          name: 'الكاشير الرئيسي 1',
          status: 'ACTIVE',
          cash_account_id: 'acc-cash',
          organization_id: effectiveFallbackOrg
        };
        termData = [defaultTerm];
      }
      setTerminals(termData);

      // 2. Sync products locally if online, or seed fallback products
      if (navigator.onLine && currentUser.role !== 'demo') {
        const syncOrg = targetOrg || currentUser?.organization_id;
        if (syncOrg) {
          await offlineService.syncProductsLocally(syncOrg);
        }
      } else {
        await offlineService.seedFallbackProducts(DEFAULT_OFFLINE_PRODUCTS);
      }

      let activeShiftDb: any = null;
      const cachedShift = secureStorage.getItem<any>(`tripro_shift_${currentUser.id}`);
      if (cachedShift) {
        const parsed = typeof cachedShift === 'string' ? JSON.parse(cachedShift) : cachedShift;
        if (navigator.onLine && currentUser.role !== 'demo' && isValidUUID(parsed?.id)) {
          try {
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
          } catch {
            activeShiftDb = parsed;
          }
        } else {
          activeShiftDb = parsed;
        }
      }

      // If not found in localStorage and online, check DB for open shift
      if (!activeShiftDb && navigator.onLine && currentUser.role !== 'demo') {
        try {
          let shiftQuery = supabase
            .from('shifts')
            .select('*, pos_terminals(*)')
            .eq('user_id', currentUser.id)
            .is('end_time', null);

          if (targetOrg) {
            shiftQuery = shiftQuery.eq('organization_id', targetOrg);
          }

          const { data: dbShift, error: shiftErr } = await shiftQuery
            .order('start_time', { ascending: false })
            .limit(1)
            .maybeSingle();

          if (!shiftErr && dbShift) {
            activeShiftDb = dbShift;
          }
        } catch {}
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
      logger.error('Error in setup:', err);
    } finally {
      setIsLoadingTerminals(false);
    }
  };

  // Open Shift
  const handleOpenShift = async () => {
    const termToUse = selectedTerminal || (terminals.length > 0 ? terminals[0] : null);
    if (!termToUse) {
      showToast('الرجاء اختيار نقطة البيع/الكاشير أولاً', 'error');
      return;
    }
    setIsOpeningShift(true);
    try {
      if (!navigator.onLine || currentUser?.role === 'demo') {
        const offlineShift = {
          id: 'shift-retail-offline-' + Date.now(),
          shift_number: 'SHIFT-' + Math.floor(1000 + Math.random() * 9000),
          user_id: currentUser.id,
          opening_float: Number(openingBalance) || 0,
          start_time: new Date().toISOString(),
          status: 'OPEN',
          terminal_id: termToUse.id,
          pos_terminals: termToUse
        };
        setActiveShift(offlineShift);
        setSelectedTerminal(termToUse);
        secureStorage.setItem(`tripro_shift_${currentUser.id}`, offlineShift);
        showToast('تم فتح الوردية بنجاح ✅', 'success');
        return;
      }

      const targetOrg = effectiveOrgId || (currentUser?.organization_id && isValidUUID(currentUser.organization_id) ? currentUser.organization_id : null);

      // 🛡️ 1. فحص إذا كان هناك وردية مفتوحة بالفعل في قاعدة البيانات لاستئنافها مباشرة
      try {
        let openCheckQuery = supabase
          .from('shifts')
          .select('*, pos_terminals(*)')
          .eq('user_id', currentUser.id)
          .is('end_time', null);

        if (targetOrg) {
          openCheckQuery = openCheckQuery.eq('organization_id', targetOrg);
        }

        const { data: alreadyOpen } = await openCheckQuery
          .order('start_time', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (alreadyOpen && alreadyOpen.id) {
          setActiveShift(alreadyOpen);
          const resolvedTerm = alreadyOpen.pos_terminals || (terminals && terminals.find((t: any) => t.id === alreadyOpen.terminal_id)) || termToUse;
          setSelectedTerminal(resolvedTerm);
          secureStorage.setItem(`tripro_shift_${currentUser.id}`, alreadyOpen);
          showToast('تم العثور على وردية مفتوحة واستئنافها بنجاح ✅', 'success');
          return;
        }
      } catch (checkErr) {
        logger.warn('Check existing shift failed:', checkErr);
      }

      // Resolve treasury account linked to terminal or fetch default
      let treasuryId = selectedTerminal?.cash_account_id;
      if (!treasuryId || !isValidUUID(treasuryId)) {
        treasuryId = settings?.accountMappings?.CASH || settings?.account_mappings?.CASH || null;
        if ((!treasuryId || !isValidUUID(treasuryId)) && targetOrg) {
          const { data: mappings } = await supabase
            .from('company_settings')
            .select('account_mappings')
            .eq('organization_id', targetOrg)
            .maybeSingle();
          treasuryId = mappings?.account_mappings?.CASH || null;
        }
      }

      const validTreasuryId = isValidUUID(treasuryId) ? treasuryId : null;
      const validTerminalId = isValidUUID(termToUse?.id) ? termToUse.id : null;
      const validOrgId = targetOrg;
      const validUserId = (currentUser?.id && isValidUUID(currentUser.id)) ? currentUser.id : null;

      // 🛡️ 2. استدعاء start_pos_shift مع دعم ذكي لتعدد التواقيع (Overload Ambiguity Resilience)
      let newShift: any = null;
      let rpcError: any = null;

      // المحاولة الأولى: تمرير 6 معاملات (النمط الكامل مع معرّف الجهاز والمنظمة)
      const res6 = await supabase.rpc('start_pos_shift', {
        p_opening_balance: Number(openingBalance) || 0,
        p_resume_existing: false,
        p_treasury_account_id: validTreasuryId,
        p_user_id: validUserId,
        p_org_id: validOrgId,
        p_terminal_id: validTerminalId
      });

      if (!res6.error && res6.data) {
        newShift = res6.data;
      } else {
        rpcError = res6.error;
        logger.warn('start_pos_shift (6 params) error:', res6.error);

        // المحاولة الثانية: إذا كان الخطأ بسبب عدم تطابق التوقيع أو تداخل الدوال (PGRST202 / PGRST203)
        if (res6.error?.code === 'PGRST202' || res6.error?.code === 'PGRST203' || res6.error?.code === '42883' || res6.error?.message?.includes('candidate') || res6.error?.message?.includes('function')) {
          const res5 = await supabase.rpc('start_pos_shift', {
            p_opening_balance: Number(openingBalance) || 0,
            p_resume_existing: false,
            p_treasury_account_id: validTreasuryId,
            p_user_id: validUserId,
            p_org_id: validOrgId
          });

          if (!res5.error && res5.data) {
            newShift = res5.data;
            rpcError = null;
          } else {
            rpcError = res5.error;
            logger.warn('start_pos_shift (5 params) error:', res5.error);

            // المحاولة الثالثة: النمط الأساسي 4 معاملات
            const res4 = await supabase.rpc('start_pos_shift', {
              p_opening_balance: Number(openingBalance) || 0,
              p_resume_existing: false,
              p_treasury_account_id: validTreasuryId,
              p_user_id: validUserId
            });

            if (!res4.error && res4.data) {
              newShift = res4.data;
              rpcError = null;
            } else {
              rpcError = res4.error;
              logger.warn('start_pos_shift (4 params) error:', res4.error);
            }
          }
        }
      }

      // إذا ردت قاعدة البيانات بأن هناك وردية مفتوحة بالفعل، نستأنفها فوراً
      if (rpcError) {
        const errorMsg = String(rpcError.message || rpcError.details || '');
        if (errorMsg.includes('مفتوحة بالفعل') || errorMsg.includes('already open') || errorMsg.includes('already')) {
          const { data: dbExistingShift } = await supabase
            .from('shifts')
            .select('*, pos_terminals(*)')
            .eq('user_id', currentUser.id)
            .is('end_time', null)
            .order('start_time', { ascending: false })
            .limit(1)
            .maybeSingle();

          if (dbExistingShift && dbExistingShift.id) {
            setActiveShift(dbExistingShift);
            secureStorage.setItem(`tripro_shift_${currentUser.id}`, dbExistingShift);
            showToast('تم العثور على وردية مفتوحة واستئنافها بنجاح ✅', 'success');
            return;
          }
        }
        throw rpcError;
      }

      if (newShift && newShift.id) {
        let fullShift = newShift;
        try {
          const { data: fetchedShift } = await supabase
            .from('shifts')
            .select('*, pos_terminals(*)')
            .eq('id', newShift.id)
            .maybeSingle();
          if (fetchedShift) fullShift = fetchedShift;
        } catch {}

        setActiveShift(fullShift);
        secureStorage.setItem(`tripro_shift_${currentUser.id}`, fullShift);
        showToast('تم فتح الوردية بنجاح ✅', 'success');
      }
    } catch (err) {
      logger.error('handleOpenShift error:', err);
      // Fallback offline shift
      const termToUse = selectedTerminal || (terminals.length > 0 ? terminals[0] : null);
      const offlineShift = {
        id: 'shift-retail-offline-' + Date.now(),
        shift_number: 'SHIFT-' + Math.floor(1000 + Math.random() * 9000),
        user_id: currentUser.id,
        opening_float: Number(openingBalance) || 0,
        start_time: new Date().toISOString(),
        status: 'OPEN',
        terminal_id: termToUse?.id || 'term-offline-1',
        pos_terminals: termToUse
      };
      setActiveShift(offlineShift);
      secureStorage.setItem(`tripro_shift_${currentUser.id}`, offlineShift);
      showToast(`تم فتح الوردية محلياً (وضع أوفلاين) - ${err?.message || 'قاعدة البيانات غير متاحة'}`, 'warning');
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

    const totalDrops = cashDrops.reduce((sum, d) => sum + Number(d.amount || 0), 0);
    const financials = await getLiveShiftFinancials(supabase, shift, currentUser?.id, totalDrops);
    setShiftFinancials(financials);
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
      const totalCashDrops = cashDrops.reduce((sum, d) => sum + Number(d.amount || 0), 0);
      const { summary, calculatedExpectedCash } = await calculateClosingShiftSummary(
        supabase,
        activeShift,
        currentUser?.id,
        totalCashDrops
      );
      setShiftSummary(summary);
      setActualCash(calculatedExpectedCash);
      setIsCloseModalOpen(true);
    } catch (e) {
      logger.error(e);
      showToast('خطأ في جلب بيانات الإغلاق', 'error');
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
      if (!navigator.onLine || currentUser?.role === 'demo' || !isValidUUID(activeShift?.id) || String(activeShift?.id).startsWith('shift-retail-offline-')) {
        showToast('تم إغلاق الوردية وترحيل المبيعات بنجاح 🏁', 'success');
        secureStorage.removeItem(`tripro_shift_${currentUser.id}`);
        setActiveShift(null);
        setCart([]);
        setIsCloseModalOpen(false);
        return;
      }

      const { error } = await supabase.rpc('close_shift', {
        p_shift_id: activeShift.id,
        p_actual_cash: Number(actualCash),
        p_notes: closingNotes || 'إغلاق وردية التجزئة السريعة',
        p_org_id: currentUser.organization_id
      });
      if (error) throw error;

      showToast('تم إغلاق الوردية وترحيل المبيعات بنجاح 🏁', 'success');
      secureStorage.removeItem(`tripro_shift_${currentUser.id}`);
      setActiveShift(null);
      setCart([]);
      setIsCloseModalOpen(false);
      await refreshData();
    } catch (err) {
      secureStorage.removeItem(`tripro_shift_${currentUser.id}`);
      setActiveShift(null);
      setCart([]);
      setIsCloseModalOpen(false);
      showToast('تم إغلاق الوردية محلياً 🏁', 'success');
    } finally {
      setIsClosingShift(false);
    }
  };

  // Handle barcode submission using isolated resolver service
  const handleBarcodeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const rawCode = barcodeInput.trim();
    if (!rawCode) return;

    setBarcodeInput('');
    playBeep();

    try {
      const { matchedProduct, matchedUomInfo, weight, multiplier, cleanCode, parsedGS1 } = await resolveScannedBarcode(
        rawCode,
        currentUser?.organization_id
      );

      if (matchedProduct) {
        addToCart(
          matchedProduct,
          weight,
          multiplier,
          matchedUomInfo?.uom_name,
          matchedUomInfo?.customPrice,
          matchedUomInfo?.uom_id
        );
        if (parsedGS1?.isGS1 && (parsedGS1.batchNumber || parsedGS1.expiryDate)) {
          showToast(`تم مسح باركود دوائي (GS1): تشغيلة ${parsedGS1.batchNumber || '-'} | صلاحية ${parsedGS1.expiryDate || '-'}`, 'info');
        }
      } else {
        showToast(`لم يتم العثور على صنف بالرمز: ${cleanCode || rawCode}`, 'error');
      }
    } catch (err) {
      logger.error('Barcode resolution error:', err);
    }
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
      const checkoutResult = await processPosCheckout({
        cart,
        currentUser,
        organization,
        selectedTerminal,
        activeShift,
        selectedCustomer,
        paymentMethod,
        splitData,
        amountPaid,
        total,
        subtotal,
        tax,
        totalDiscount,
        totalPromoDiscount,
        appliedPromotions,
        appliedCoupon,
        couponDiscount,
        settings,
        warehouses,
        isOnline,
        getItemEffectivePrice,
        isItemOfferActive
      });

      setReceiptOrder(checkoutResult.receiptOrder);
      showToast(`تم إتمام العملية بنجاح. المتبقي للعميل: ${checkoutResult.change.toFixed(2)} ${currencySymbol}`, 'success');
      
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

    } catch (err) {
      showToast(err.message || 'فشل إتمام عملية الدفع', 'error');
    } finally {
      setIsPrinting(false);
    }
  };

  const handleVoidCartItem = (item: PosCartItem) => {
    setSupervisorModalState({
      isOpen: true,
      actionTitle: `إلغاء صنف: ${item.product.name}`,
      actionDescription: "حذف صنف مسجل في الفاتورة يتطلب تصريح المشرف (Void Line)",
      onSuccess: () => {
        setCart(prev => prev.filter(i => i.product.id !== item.product.id));
        setSupervisorModalState(prev => ({ ...prev, isOpen: false }));
        showToast(`تم حذف الصنف (${item.product.name}) بتصريح المشرف`, "info");
      }
    });
  };

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 flex flex-col font-sans select-none" dir="rtl">
      
      <RetailPosHeader
        scaleReading={scaleReading}
        onOpenScaleModal={() => setIsScaleModalOpen(true)}
        isOnline={isOnline}
        activeShift={activeShift}
        currentUser={currentUser}
        selectedTerminal={selectedTerminal}
        shiftFinancials={shiftFinancials}
        currencySymbol={currencySymbol}
        onOpenReturnModal={handleOpenReturnModalWithSupervisorCheck}
        onOpenBadgePrint={() => setIsBadgePrintOpen(true)}
        onOpenCashDrop={() => setIsCashDropOpen(true)}
        onOpenHeldModal={() => setIsHeldModalOpen(true)}
        heldOrdersCount={heldOrders.length}
        onSyncProducts={handleSyncProducts}
        isSyncingProducts={isSyncingProducts}
        onOpenCloseShiftModal={handleOpenCloseShiftModal}
      />

      {/* 🔐 Shift Activation Modal / Screen */}
      {!activeShift ? (
        <RetailPosShiftOpenView
          terminals={terminals}
          selectedTerminal={selectedTerminal}
          setSelectedTerminal={setSelectedTerminal}
          openingBalance={openingBalance}
          setOpeningBalance={setOpeningBalance}
          currencySymbol={currencySymbol}
          isLoadingTerminals={isLoadingTerminals}
          isOpeningShift={isOpeningShift}
          onOpenShift={handleOpenShift}
        />
      ) : (
        /* 🛒 Main Cashier Interface */
        <div className="flex-1 flex overflow-hidden">
          
          {/* Left Column (Scanned Items & Cart) */}
          <RetailPosCartTable
            barcodeInput={barcodeInput}
            setBarcodeInput={setBarcodeInput}
            barcodeInputRef={barcodeInputRef}
            handleBarcodeSubmit={handleBarcodeSubmit}
            searchQuery={searchQuery}
            setSearchQuery={setSearchQuery}
            searchResults={searchResults}
            addToCart={addToCart}
            pricingTier={pricingTier}
            setPricingTier={setPricingTier}
            cart={cart}
            currencySymbol={currencySymbol}
            updateQuantity={updateQuantity}
            onVoidItem={handleVoidCartItem}
            appliedPromotions={appliedPromotions}
            subtotal={subtotal}
            totalPromoDiscount={totalPromoDiscount}
            isTaxEnabled={isTaxEnabled}
            vatRate={vatRate}
            tax={tax}
            total={total}
          />

          {/* Right Column (Payment & Quick Keys) */}
          <RetailPosPaymentPanel
            selectedCustomer={selectedCustomer}
            setSelectedCustomer={setSelectedCustomer}
            customerSearch={customerSearch}
            setCustomerSearch={setCustomerSearch}
            customerResults={customerResults}
            setCustomerResults={setCustomerResults}
            onOpenSplitPayment={() => setIsSplitPaymentOpen(true)}
            appliedCoupon={appliedCoupon}
            couponDiscount={couponDiscount}
            couponInput={couponInput}
            setCouponInput={setCouponInput}
            onApplyCoupon={handleApplyCoupon}
            onRemoveCoupon={handleRemoveCoupon}
            cart={cart}
            currencySymbol={currencySymbol}
            paymentMethod={paymentMethod}
            setPaymentMethod={setPaymentMethod}
            amountPaid={amountPaid}
            setAmountPaid={setAmountPaid}
            total={total}
            isPrinting={isPrinting}
            onPayment={() => handlePayment()}
            onHoldOrder={handleHoldOrder}
            onClearCart={() => {
              if (cart.length > 0 && window.confirm('هل أنت متأكد من رغبتك في إفراغ سلة التسوق؟')) {
                setCart([]);
                setAmountPaid(0);
              }
            }}
          />

        </div>
      )}

      {/* ⏸️ Held / Parked Orders Modal */}
      <HeldOrdersModal
        isOpen={isHeldModalOpen}
        onClose={() => setIsHeldModalOpen(false)}
        heldOrders={heldOrders}
        onResumeOrder={handleResumeOrder}
        onDeleteHeld={handleDeleteHeld}
        currencySymbol={currencySymbol}
      />

      {/* 🏁 Close Shift Modal */}
      <RetailPosShiftCloseModal
        isOpen={isCloseModalOpen}
        shiftSummary={shiftSummary}
        currencySymbol={currencySymbol}
        actualCash={actualCash}
        setActualCash={setActualCash}
        closingNotes={closingNotes}
        setClosingNotes={setClosingNotes}
        isClosingShift={isClosingShift}
        onClose={() => setIsCloseModalOpen(false)}
        onConfirmCloseShift={handleConfirmCloseShift}
      />

      {/* 🖨️ Printable Receipt Area */}
      <RetailPosPrintReceipt
        receiptOrder={receiptOrder}
        printAreaRef={printAreaRef}
        organization={organization}
        currentUser={currentUser}
        selectedTerminal={selectedTerminal}
        currencySymbol={currencySymbol}
        vatRate={vatRate}
      />

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
        <RetailPosShortcutsFooter
          heldOrdersCount={heldOrders.length}
        />
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
              public_shift_id: (activeShift?.id && isValidUUID(activeShift.id)) ? activeShift.id : null,   // UUID من public.shifts
              cashier_id: currentUser?.id,
              amount: amt,
              payout_type: payoutType,
              reason: reason || payoutType,
              expense_account_id: expenseAccountId || null,
              target_account_id: targetAccountId || null,
              custodian_name: payoutType === 'CUSTODIAN' ? receiver : null,
            });
            if (dropErr) {
              logger.warn('Could not persist cash drop to pos_petty_cash_payouts:', dropErr);
            }
          } catch (dropErr) {
            logger.warn('Could not persist cash drop to pos_petty_cash_payouts:', dropErr);
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

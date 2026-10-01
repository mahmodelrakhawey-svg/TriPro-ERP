import React, { useState, useEffect, useRef } from 'react';
import { logger } from '../../utils/logger';
import { useNavigate } from 'react-router-dom';
import { 
  LayoutDashboard, 
  ScanLine, 
  ShoppingCart, 
  RefreshCw, 
  Wifi, 
  WifiOff, 
  CheckCircle2, 
  XCircle, 
  ArrowRight, 
  Camera, 
  Search, 
  Plus, 
  Minus, 
  Trash2, 
  Printer, 
  Layers, 
  TrendingUp, 
  DollarSign, 
  AlertCircle,
  Package,
  User,
  ShieldCheck,
  Clock,
  Sparkles,
  Warehouse,
  Truck,
  Eye,
  MessageCircle,
  X,
  Share2,
  LogOut
} from 'lucide-react';
import { supabase } from '../../supabaseClient';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { offlineService, db, CachedProduct } from '../../services/offlineService';
import { useLiveQuery } from 'dexie-react-hooks';
import { secureStorage } from '../../utils/securityMiddleware';
import { MobileHeader } from './components/MobileHeader';
import { MobileNavigation, MobileTab } from './components/MobileNavigation';
import { MobileReceiptModal } from './components/MobileReceiptModal';
import { QuickAddCustomerModal } from './components/QuickAddCustomerModal';
import { MobileDashboardTab } from './tabs/MobileDashboardTab';
import { MobileScannerTab } from './tabs/MobileScannerTab';
import { MobileSalesTab, MobileCartItem } from './tabs/MobileSalesTab';
import { MobileSyncTab } from './tabs/MobileSyncTab';

export default function MobileApp() {
  const navigate = useNavigate();
  const { currentUser, logout } = useAuth();
  const { showToast } = useToast();

  const isVanSalesUser = (currentUser?.role as string) === 'van_sales';
  const [activeTab, setActiveTab] = useState<MobileTab>(isVanSalesUser ? 'sales' : 'dashboard');
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [currentOrgId, setCurrentOrgId] = useState<string>('');

  // -------------------------------------------------------------
  // Listen to network status
  // -------------------------------------------------------------
  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Resolve Org ID
    const resolveOrg = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      const orgId = session?.user?.user_metadata?.org_id || (currentUser as any)?.organization_id || '';
      setCurrentOrgId(orgId);
    };
    resolveOrg();

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [currentUser]);

  // Company Settings for Receipt Header & QR Code
  const [companySettings, setCompanySettings] = useState<any>(null);
  const [showReceiptModal, setShowReceiptModal] = useState(false);

  useEffect(() => {
    if (currentOrgId && isOnline) {
      supabase
        .from('company_settings')
        .select('*')
        .eq('organization_id', currentOrgId)
        .maybeSingle()
        .then(({ data }) => {
          if (data) setCompanySettings(data);
        });
    }
  }, [currentOrgId, isOnline]);

  // Dexie live queries for cached items
  const cachedProductsCount = useLiveQuery(() => db.products.count(), [], 0);
  const queuedOrdersCount = useLiveQuery(() => db.queuedOrders.where('status').notEqual('synced').count(), [], 0);

  // Sound beep on scan
  const playBeep = () => {
    try {
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = 1200;
      gain.gain.setValueAtTime(0.2, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.15);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.15);
    } catch (e) {
      // Audio context might be restricted before user gesture
    }
  };

  // =========================================================================
  // 1. TAB: EXECUTIVE POCKET DASHBOARD & QUICK APPROVALS
  // =========================================================================
  const [stats, setStats] = useState({
    todaySales: 0,
    salesCount: 0,
    treasuryBalance: 0,
    pendingPOsCount: 0
  });
  const [pendingOrders, setPendingOrders] = useState<any[]>([]);
  const [loadingStats, setLoadingStats] = useState(false);
  const [processingId, setProcessingId] = useState<string | null>(null);

  const loadDashboardData = async () => {
    if (!currentOrgId || !isOnline) return;
    setLoadingStats(true);
    try {
      const today = new Date().toISOString().split('T')[0];

      // Today's Sales
      const { data: invoices } = await supabase
        .from('invoices')
        .select('total_amount')
        .eq('organization_id', currentOrgId)
        .gte('invoice_date', today);

      const totalSales = (invoices || []).reduce((sum, inv) => sum + Number(inv.total_amount || 0), 0);
      const count = invoices?.length || 0;

      // Pending Purchase Orders for Approval
      const { data: pos } = await supabase
        .from('purchase_orders')
        .select('id, po_number, total_amount, created_at, status, suppliers(name)')
        .eq('organization_id', currentOrgId)
        .in('status', ['pending', 'draft'])
        .order('created_at', { ascending: false })
        .limit(10);

      setPendingOrders(pos || []);
      setStats({
        todaySales: totalSales,
        salesCount: count,
        treasuryBalance: totalSales * 0.85, // estimated liquid
        pendingPOsCount: pos?.length || 0
      });
    } catch (err) {
      logger.error('Mobile Dashboard Load Error:', err);
    } finally {
      setLoadingStats(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'dashboard') {
      loadDashboardData();
    }
  }, [activeTab, currentOrgId]);

  const handleApprovePO = async (id: string) => {
    setProcessingId(id);
    try {
      const { error } = await supabase
        .from('purchase_orders')
        .update({ status: 'approved' })
        .eq('id', id);

      if (error) throw error;
      showToast('تم اعتماد أمر الشراء بنجاح ✅', 'success');
      setPendingOrders(prev => prev.filter(o => o.id !== id));
      setStats(prev => ({ ...prev, pendingPOsCount: Math.max(0, prev.pendingPOsCount - 1) }));
    } catch (err) {
      showToast('خطأ في الاعتماد: ' + err.message, 'error');
    } finally {
      setProcessingId(null);
    }
  };

  const handleRejectPO = async (id: string) => {
    setProcessingId(id);
    try {
      const { error } = await supabase
        .from('purchase_orders')
        .update({ status: 'rejected' })
        .eq('id', id);

      if (error) throw error;
      showToast('تم رفض أمر الشراء ❌', 'info');
      setPendingOrders(prev => prev.filter(o => o.id !== id));
      setStats(prev => ({ ...prev, pendingPOsCount: Math.max(0, prev.pendingPOsCount - 1) }));
    } catch (err) {
      showToast('خطأ في العملية: ' + err.message, 'error');
    } finally {
      setProcessingId(null);
    }
  };

  // =========================================================================
  // 2. TAB: CAMERA BARCODE SCANNER & STOCK AUDIT
  // =========================================================================
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedProduct, setSelectedProduct] = useState<any | null>(null);
  const [newStockCount, setNewStockCount] = useState<string>('');
  const [adjustingStock, setAdjustingStock] = useState(false);
  const scannerStreamRef = useRef<MediaStream | null>(null);

  const startCamera = async () => {
    setCameraError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } }
      });
      scannerStreamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
      }
      setCameraActive(true);
      scanFrame();
    } catch (err) {
      logger.error('Camera access error:', err);
      setCameraError('تعذر تشغيل الكاميرا. يرجى منح الإذن أو إدخال الباركود يدوياً.');
      setCameraActive(false);
    }
  };

  const stopCamera = () => {
    if (scannerStreamRef.current) {
      scannerStreamRef.current.getTracks().forEach(track => track.stop());
      scannerStreamRef.current = null;
    }
    setCameraActive(false);
  };

  const scanFrame = async () => {
    if (!scannerStreamRef.current || !videoRef.current) return;

    if ('BarcodeDetector' in window) {
      try {
        const detector = new (window as any).BarcodeDetector({
          formats: ['ean_13', 'ean_8', 'code_128', 'code_39', 'qr_code', 'upc_a', 'upc_e']
        });
        const barcodes = await detector.detect(videoRef.current);
        if (barcodes && barcodes.length > 0) {
          const rawVal = barcodes[0].rawValue;
          playBeep();
          stopCamera();
          handleLookupBarcode(rawVal);
          return;
        }
      } catch (detErr) {
        // Continue loop
      }
    }

    if (cameraActive) {
      requestAnimationFrame(scanFrame);
    }
  };

  const handleLookupBarcode = async (term: string) => {
    if (!term.trim()) return;
    const clean = term.trim();

    // 1. Try local Dexie cache first (Fastest & offline capable)
    try {
      const localMatch = await db.products
        .where('barcode').equals(clean)
        .or('sku').equals(clean)
        .first();

      if (localMatch) {
        setSelectedProduct(localMatch);
        setNewStockCount(String(localMatch.stock || 0));
        showToast(`تم العثور على: ${localMatch.name}`, 'success');
        return;
      }
    } catch (dexErr) {
      logger.warn('Local dexie search failed:', dexErr);
    }

    // 2. Try Supabase if online
    if (isOnline && currentOrgId) {
      try {
        const { data, error } = await supabase
          .from('products')
          .select('*')
          .eq('organization_id', currentOrgId)
          .or(`barcode.eq.${clean},sku.eq.${clean},name.ilike.%${clean}%`)
          .limit(1)
          .maybeSingle();

        if (data) {
          setSelectedProduct(data);
          setNewStockCount(String(data.stock || 0));
          showToast(`تم العثور على: ${data.name}`, 'success');
          return;
        }
      } catch (supErr) {
        logger.warn('Online product search error:', supErr);
      }
    }

    showToast(`لم يتم العثور على صنف بالباركود: ${clean}`, 'warning');
  };

  const handleSaveStockAdjustment = async () => {
    if (!selectedProduct) return;
    const targetCount = Number(newStockCount);
    if (isNaN(targetCount) || targetCount < 0) {
      showToast('يرجى إدخال رصيد كمية صحيح', 'error');
      return;
    }

    setAdjustingStock(true);
    try {
      if (selectedWarehouseId) {
        const updatedWStock: Record<string, number> = { ...(selectedProduct.warehouse_stock || {}) };
        updatedWStock[selectedWarehouseId] = targetCount;
        const newTotalStock: number = Number(Object.values(updatedWStock).reduce((sum: number, val: any) => sum + Number(val || 0), 0));

        // 1. Update IndexedDB locally
        await (db.products as any).update(selectedProduct.id, { stock: newTotalStock, warehouse_stock: updatedWStock });

        // 2. Update Supabase if online
        if (isOnline) {
          const { error } = await supabase
            .from('products')
            .update({ stock: newTotalStock, warehouse_stock: updatedWStock })
            .eq('id', selectedProduct.id);

          if (error) throw error;
        }

        setSelectedProduct((prev: any) => ({ ...prev, stock: newTotalStock, warehouse_stock: updatedWStock }));
        const whName = warehousesList.find(w => w.id === selectedWarehouseId)?.name || 'المستودع المحدد';
        showToast(`تم تحديث رصيد (${whName}) إلى: ${targetCount} بنجاح ✅`, 'success');
      } else {
        await db.products.update(selectedProduct.id, { stock: targetCount });
        if (isOnline) {
          const { error } = await supabase
            .from('products')
            .update({ stock: targetCount })
            .eq('id', selectedProduct.id);
          if (error) throw error;
        }
        setSelectedProduct((prev: any) => ({ ...prev, stock: targetCount }));
        showToast(`تم تحديث رصيد المخزن إلى: ${targetCount} بنجاح ✅`, 'success');
      }
    } catch (err) {
      showToast('خطأ في حفظ الرصيد: ' + err.message, 'error');
    } finally {
      setAdjustingStock(false);
    }
  };

  // =========================================================================
  // 3. TAB: FIELD SALES & VAN SALES (FASTER INVOICING)
  // =========================================================================
  const [cart, setCart] = useState<Array<{ product: any; qty: number; price: number }>>([]);
  const [customerName, setCustomerName] = useState('عميل نقدي');
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>('');
  const [customerSearchQuery, setCustomerSearchQuery] = useState<string>('');
  const [paymentType, setPaymentType] = useState<'cash' | 'credit'>('cash');
  const [savingInvoice, setSavingInvoice] = useState(false);
  const [lastSavedInvoice, setLastSavedInvoice] = useState<any | null>(null);

  // Quick Add Customer modal
  const [showAddCustomerModal, setShowAddCustomerModal] = useState(false);
  const [newCustName, setNewCustName] = useState('');
  const [newCustPhone, setNewCustPhone] = useState('');
  const [savingNewCustomer, setSavingNewCustomer] = useState(false);

  // Products and Customers for field sales
  const [catalogProducts, setCatalogProducts] = useState<any[]>([]);
  const [customersList, setCustomersList] = useState<any[]>(() => {
    try {
      const cached = secureStorage.getItem('tripro_cached_customers');
      if (typeof cached === 'string') return JSON.parse(cached);
      if (Array.isArray(cached)) return cached;
      return [];
    } catch {
      return [];
    }
  });
  const [warehousesList, setWarehousesList] = useState<any[]>([]);
  const [selectedWarehouseId, setSelectedWarehouseId] = useState<string>('');
  const [productSearch, setProductSearch] = useState('');
  const [loadingCatalog, setLoadingCatalog] = useState(false);
  const [showSalesCamera, setShowSalesCamera] = useState(false);
  const salesVideoRef = useRef<HTMLVideoElement | null>(null);
  const salesScannerStreamRef = useRef<MediaStream | null>(null);

  const filteredCustomers = customersList.filter(c => {
    if (!customerSearchQuery.trim()) return true;
    const q = customerSearchQuery.trim().toLowerCase();
    const nameMatch = (c.name || '').toLowerCase().includes(q);
    const phoneMatch = (c.phone || '').includes(q);
    return nameMatch || phoneMatch;
  });

  const handleQuickAddCustomer = async () => {
    if (!newCustName.trim()) {
      showToast('يرجى كتابة اسم العميل أولاً!', 'warning');
      return;
    }
    setSavingNewCustomer(true);
    try {
      let createdCustomer: any = null;
      if (isOnline && currentOrgId) {
        const { data, error } = await supabase
          .from('customers')
          .insert({
            name: newCustName.trim(),
            phone: newCustPhone.trim() || null,
            organization_id: currentOrgId
          })
          .select()
          .single();
        if (error) throw error;
        createdCustomer = data;
      } else {
        createdCustomer = {
          id: `local-cust-${Date.now()}`,
          name: newCustName.trim(),
          phone: newCustPhone.trim() || null,
          balance: 0
        };
      }

      const updated = [createdCustomer, ...customersList.filter(c => c.id !== createdCustomer.id)];
      setCustomersList(updated);
      try {
        secureStorage.setItem('tripro_cached_customers', JSON.stringify(updated));
      } catch {}

      setSelectedCustomerId(createdCustomer.id);
      setCustomerName(createdCustomer.name);
      setShowAddCustomerModal(false);
      setNewCustName('');
      setNewCustPhone('');
      showToast(`تمت إضافة العميل "${createdCustomer.name}" بنجاح واختياره للفاتورة ✅`, 'success');
    } catch (err) {
      showToast('خطأ في إضافة العميل: ' + err.message, 'error');
    } finally {
      setSavingNewCustomer(false);
    }
  };

  const getProductStockInWarehouse = (product: any, whId?: string): number => {
    const targetWhId = whId || selectedWarehouseId;
    if (!targetWhId) return Number(product?.stock || 0);

    if (product?.warehouse_stock && typeof product.warehouse_stock === 'object') {
      const val = product.warehouse_stock[targetWhId];
      if (val !== undefined && val !== null) {
        return Number(val);
      }
    }
    if (warehousesList.length <= 1) {
      return Number(product?.stock || 0);
    }
    return 0;
  };

  const loadCatalogData = async () => {
    setLoadingCatalog(true);
    try {
      // 1. Load Warehouses first so stock is evaluated per warehouse/van
      if (isOnline && currentOrgId) {
        const { data: wData } = await supabase
          .from('warehouses')
          .select('id, name')
          .eq('organization_id', currentOrgId)
          .is('deleted_at', null)
          .order('name', { ascending: true });
        if (wData && wData.length > 0) {
          setWarehousesList(wData);
          const savedWh = secureStorage.getItem('tripro_mobile_preferred_warehouse') as string | null;
          if (savedWh && wData.some(w => w.id === savedWh)) {
            setSelectedWarehouseId(savedWh);
          } else if (!selectedWarehouseId || !wData.some(w => w.id === selectedWarehouseId)) {
            setSelectedWarehouseId(wData[0].id);
          }
        }
      }

      // 2. Load Products (with warehouse_stock)
      if (isOnline && currentOrgId) {
        const { data: pData } = await supabase
          .from('products')
          .select('id, name, barcode, sku, sales_price, stock, warehouse_stock, image_url')
          .eq('organization_id', currentOrgId)
          .is('deleted_at', null)
          .order('name', { ascending: true })
          .limit(200);
        if (pData) {
          setCatalogProducts(pData);
          try {
            await offlineService.syncProductsLocally(currentOrgId);
          } catch (e) {}
        }
      } else {
        const localProducts = await db.products.toArray();
        if (localProducts && localProducts.length > 0) {
          setCatalogProducts(localProducts);
        }
      }

      // 3. Load Customers
      if (isOnline && currentOrgId) {
        const { data: cData } = await supabase
          .from('customers')
          .select('id, name, phone, balance')
          .eq('organization_id', currentOrgId)
          .is('deleted_at', null)
          .order('name', { ascending: true })
          .limit(200);
        if (cData) {
          setCustomersList(cData);
          try {
            secureStorage.setItem('tripro_cached_customers', JSON.stringify(cData));
          } catch {}
        }
      }
    } catch (e) {
      logger.warn('Catalog load warning:', e);
    } finally {
      setLoadingCatalog(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'sales') {
      loadCatalogData();
    } else {
      stopSalesCamera();
    }
  }, [activeTab, currentOrgId]);

  const startSalesCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } }
      });
      salesScannerStreamRef.current = stream;
      if (salesVideoRef.current) {
        salesVideoRef.current.srcObject = stream;
        salesVideoRef.current.play();
      }
      setShowSalesCamera(true);
      scanSalesFrame();
    } catch (err) {
      showToast('تعذر فتح الكاميرا: يرجى السماح بالإذن أو اختيار الصنف من القائمة', 'warning');
      setShowSalesCamera(false);
    }
  };

  const stopSalesCamera = () => {
    if (salesScannerStreamRef.current) {
      salesScannerStreamRef.current.getTracks().forEach(t => t.stop());
      salesScannerStreamRef.current = null;
    }
    setShowSalesCamera(false);
  };

  const scanSalesFrame = async () => {
    if (!salesScannerStreamRef.current || !salesVideoRef.current) return;

    if ('BarcodeDetector' in window) {
      try {
        const detector = new (window as any).BarcodeDetector({
          formats: ['ean_13', 'ean_8', 'code_128', 'code_39', 'qr_code', 'upc_a', 'upc_e']
        });
        const barcodes = await detector.detect(salesVideoRef.current);
        if (barcodes && barcodes.length > 0) {
          const rawVal = barcodes[0].rawValue.trim();
          const found = catalogProducts.find(p => p.barcode === rawVal || p.sku === rawVal);
          if (found) {
            addToCart(found);
            stopSalesCamera();
            return;
          } else {
            showToast(`لم يتم العثور على صنف بالباركود: ${rawVal}`, 'warning');
          }
        }
      } catch (e) {}
    }

    if (showSalesCamera) {
      requestAnimationFrame(scanSalesFrame);
    }
  };

  const addToCart = (product: any) => {
    const available = getProductStockInWarehouse(product, selectedWarehouseId);
    const selectedWh = warehousesList.find(w => w.id === selectedWarehouseId);
    const whName = selectedWh ? selectedWh.name : 'المستودع المحدد';

    setCart(prev => {
      const existing = prev.find(item => item.product.id === product.id);
      const currentQty = existing ? existing.qty : 0;
      if (currentQty + 1 > available) {
        showToast(`⚠️ تنبيه: الرصيد في (${whName}) هو (${available}) فقط! تأكد من وجود بضاعة بالسيارة.`, 'warning');
      }
      if (existing) {
        return prev.map(item =>
          item.product.id === product.id ? { ...item, qty: item.qty + 1 } : item
        );
      }
      return [...prev, { product, qty: 1, price: Number(product.sales_price || 0) }];
    });
    playBeep();
    showToast(`أضيف للسلة: ${product.name}`, 'info');
  };

  const updateCartQty = (productId: string, delta: number) => {
    setCart(prev => {
      return prev
        .map(item => {
          if (item.product.id === productId) {
            const newQty = item.qty + delta;
            return newQty > 0 ? { ...item, qty: newQty } : null;
          }
          return item;
        })
        .filter(Boolean) as any;
    });
  };

  // ✅ احتساب الضريبة ديناميكياً بناءً على إعدادات الشركة (مع افتراض 14% في حال عدم التحديد)
  const taxRatePercent = companySettings?.tax_rate !== undefined && companySettings?.tax_rate !== null 
    ? Number(companySettings.tax_rate) 
    : 14;
  const cartSubtotal = cart.reduce((sum, it) => sum + it.price * it.qty, 0);
  const cartTax = cartSubtotal * (taxRatePercent / 100);
  const cartTotal = cartSubtotal + cartTax;

  const handleCreateFieldInvoice = async () => {
    if (cart.length === 0) {
      showToast('سلة الفاتورة فارغة!', 'warning');
      return;
    }

    if (paymentType === 'credit' && !selectedCustomerId) {
      showToast('⚠️ في البيع الآجل (ذمم)، يجب اختيار عميل مسجل من القائمة لتقييد المديونية عليه!', 'error');
      return;
    }

    setSavingInvoice(true);
    const invoiceNumber = `VAN-${Date.now().toString().slice(-6)}`;
    const resolvedCustomerName = selectedCustomerId 
      ? (customersList.find(c => c.id === selectedCustomerId)?.name || customerName)
      : (paymentType === 'cash' ? (customerName.trim() || 'عميل نقدي') : customerName);

    const invoicePayload = {
      invoice_number: invoiceNumber,
      invoice_date: new Date().toISOString().split('T')[0],
      invoice_time: new Date().toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' }),
      total_amount: cartTotal,
      tax_amount: cartTax,
      subtotal: cartSubtotal,
      paid_amount: paymentType === 'cash' ? cartTotal : 0,
      status: paymentType === 'cash' ? 'paid' : 'unpaid',
      customer_name: resolvedCustomerName,
      customer_id: selectedCustomerId || null,
      warehouse_name: warehousesList.find(w => w.id === selectedWarehouseId)?.name || 'المستودع الرئيسي',
      notes: paymentType === 'cash'
        ? `فاتورة مبيعات نقدية - الخزينة | العميل: ${resolvedCustomerName}`
        : `فاتورة مبيعات آجل (ذمم) - ذمة العميل: ${resolvedCustomerName}`,
      organization_id: currentOrgId,
      items: cart.map(it => ({
        product_id: it.product.id,
        name: it.product.name,
        quantity: it.qty,
        unit_price: it.price,
        total: it.price * it.qty
      }))
    };

    try {
      if (isOnline) {
        // Resolve cash treasury if cash payment
        let treasuryId = null;
        if (paymentType === 'cash') {
          treasuryId = companySettings?.default_treasury_id || companySettings?.account_mappings?.CASH || null;
          if (!treasuryId && currentOrgId) {
            const { data: defaultCashAcc } = await supabase
              .from('accounts')
              .select('id')
              .eq('organization_id', currentOrgId)
              .in('code', ['1231', '123101', '101', '1101'])
              .eq('is_group', false)
              .limit(1)
              .maybeSingle();
            treasuryId = defaultCashAcc?.id || null;
          }
        }

        // Direct Online Save
        const { data: invData, error: invErr } = await supabase
          .from('invoices')
          .insert({
            invoice_number: invoicePayload.invoice_number,
            invoice_date: invoicePayload.invoice_date,
            total_amount: invoicePayload.total_amount,
            tax_amount: invoicePayload.tax_amount,
            subtotal: invoicePayload.subtotal,
            paid_amount: invoicePayload.paid_amount,
            treasury_account_id: treasuryId,
            status: 'draft',
            customer_id: selectedCustomerId || null,
            warehouse_id: selectedWarehouseId || null,
            notes: invoicePayload.notes,
            organization_id: currentOrgId
          })
          .select()
          .single();

        if (invErr) throw invErr;

        if (invData && invoicePayload.items.length > 0) {
          await supabase.from('invoice_items').insert(
            invoicePayload.items.map(it => ({
              invoice_id: invData.id,
              product_id: it.product_id,
              quantity: it.quantity,
              unit_price: it.unit_price,
              total: it.total
            }))
          );
        }

        // 🚀 ترحيل الفاتورة وتوليد القيد المحاسبي فوراً
        try {
          const { error: postErr } = await supabase.rpc('post_sales_invoice', {
            p_invoice_id: invData.id,
            p_org_id: currentOrgId,
            p_warehouse_id: selectedWarehouseId || null
          });

          if (!postErr) {
            invoicePayload.status = 'posted';

            // 🛡️ صمام أمان فوري: التأكد من تسجيل الطرف المدين في الخزينة/الصندوق (1231) وليس العملاء (1221)
            if (paymentType === 'cash' && invData?.id && treasuryId) {
              try {
                const { data: entries } = await supabase
                  .from('journal_entries')
                  .select('id')
                  .eq('related_document_id', invData.id)
                  .eq('related_document_type', 'invoice');

                for (const ent of entries || []) {
                  const { data: lines } = await supabase
                    .from('journal_lines')
                    .select('id, account_id, debit, accounts(code)')
                    .eq('journal_entry_id', ent.id);

                  for (const line of lines || []) {
                    if ((line as any).accounts?.code === '1221' && Number(line.debit) > 0) {
                      await supabase.from('journal_entries').update({ status: 'draft', is_posted: false }).eq('id', ent.id);
                      await supabase.from('journal_lines').update({
                        account_id: treasuryId,
                        description: `تحصيل نقدي بالخزينة - فاتورة مبيعات رقم ${invoiceNumber}`
                      }).eq('id', line.id);
                      await supabase.from('journal_entries').update({ status: 'posted', is_posted: true }).eq('id', ent.id);
                    }
                  }
                }
              } catch (autoFixErr) {
                logger.warn('Auto-repair cash entry warning:', autoFixErr);
              }
            }

            showToast(`تم حفظ وترحيل الفاتورة #${invoiceNumber} وتوليد القيد المحاسبي بالخزينة بنجاح ✅`, 'success');
          } else {
            logger.warn('post_sales_invoice notice:', postErr);
            const errMsg = postErr.message || '';
            if (errMsg.includes('عجز مخزون') || errMsg.includes('الرصيد')) {
              showToast(`⚠️ حُفظت الفاتورة كمسودة: ${errMsg} (يلزم تحويل بضاعة للمخزن أو تفعيل البيع بالسالب)`, 'warning');
            } else {
              showToast(`تم حفظ الفاتورة #${invoiceNumber} كمسودة: ${errMsg}`, 'info');
            }
          }
        } catch (postEx) {
          logger.warn('post_sales_invoice exception:', postEx);
          showToast(`تم حفظ الفاتورة #${invoiceNumber} كمسودة`, 'info');
        }

        setLastSavedInvoice(invoicePayload);
        setShowReceiptModal(true);
      } else {
        // Offline IndexedDB Queue
        await offlineService.queueOrder(invoicePayload);
        setLastSavedInvoice(invoicePayload);
        setShowReceiptModal(true);
        showToast(`🔌 تم حفظ الفاتورة محلياً #${invoiceNumber} (ستُرفع تلقائياً فور توفر الإنترنت)`, 'success');
      }

      setCart([]);
    } catch (err) {
      showToast('خطأ أثناء حفظ الفاتورة: ' + err.message, 'error');
    } finally {
      setSavingInvoice(false);
    }
  };

  const handlePrintReceipt = () => {
    window.print();
  };

  const handleShareWhatsApp = () => {
    if (!lastSavedInvoice) return;
    const itemsText = (lastSavedInvoice.items || [])
      .map((it: any) => `• ${it.name}: ${it.quantity} × ${Number(it.unit_price).toFixed(2)} = ${Number(it.total).toFixed(2)} ج.م`)
      .join('\n');
    const text = `🧾 *فاتورة مبيعات - ${companySettings?.company_name || 'تري برو للتوزيع'}*\n` +
      `رقم الفاتورة: #${lastSavedInvoice.invoice_number}\n` +
      `التاريخ: ${lastSavedInvoice.invoice_date} ${lastSavedInvoice.invoice_time || ''}\n` +
      `العميل: ${lastSavedInvoice.customer_name || 'عميل نقدي'}\n` +
      `مخزن الصرف: ${lastSavedInvoice.warehouse_name || 'المستودع الرئيسي'}\n` +
      `--------------------------------\n` +
      `${itemsText}\n` +
      `--------------------------------\n` +
      `المجموع قبل الضريبة: ${Number(lastSavedInvoice.subtotal || 0).toFixed(2)} ج.م\n` +
      `ضريبة القيمة المضافة (14%): ${Number(lastSavedInvoice.tax_amount || 0).toFixed(2)} ج.م\n` +
      `💰 *الإجمالي النهائي: ${Number(lastSavedInvoice.total_amount || 0).toFixed(2)} ج.م*\n` +
      `المدفوع: ${Number(lastSavedInvoice.paid_amount || 0).toFixed(2)} ج.م\n` +
      `طريقة الدفع: ${lastSavedInvoice.status === 'paid' ? 'نقدي فوري' : 'آجل'}\n` +
      `--------------------------------\n` +
      `شكراً لتعاملكم معنا!`;
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
  };

  // =========================================================================
  // 4. TAB: OFFLINE SYNC MANAGEMENT
  // =========================================================================
  const [syncingNow, setSyncingNow] = useState(false);

  const handleManualSync = async () => {
    if (!isOnline) {
      showToast('لا يمكن المزامنة حالياً: الجهاز غير متصل بالإنترنت', 'warning');
      return;
    }
    setSyncingNow(true);
    try {
      if (currentOrgId) {
        await offlineService.syncProductsLocally(currentOrgId);
      }
      showToast('تم تحديث وتنزيل بيانات الأصناف محلياً بنجاح 🚀', 'success');
    } catch (err) {
      showToast('فشل المزامنة: ' + err.message, 'error');
    } finally {
      setSyncingNow(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 flex flex-col justify-between max-w-md mx-auto shadow-2xl border-x border-slate-800 font-sans select-none" dir="rtl">
      
      {/* 🟢 TOP APP HEADER */}
      <MobileHeader
        isOnline={isOnline}
        isVanSalesUser={isVanSalesUser}
        onLogout={async () => {
          if (window.confirm('هل تريد بالتأكيد تسجيل الخروج من التطبيق؟')) {
            await logout();
            navigate('/login');
          }
        }}
        onReturnToDesk={() => navigate('/')}
      />

      {/* 📱 TAB CONTENT AREA */}
      <main className="flex-1 p-4 overflow-y-auto pb-24">
        {activeTab === 'dashboard' && (
          <MobileDashboardTab
            stats={stats}
            pendingOrders={pendingOrders}
            loadingStats={loadingStats}
            processingId={processingId}
            onRefreshData={loadDashboardData}
            onApprovePO={handleApprovePO}
            onRejectPO={handleRejectPO}
            onNavigateToTab={setActiveTab}
          />
        )}

        {activeTab === 'scanner' && (
          <MobileScannerTab
            videoRef={videoRef}
            cameraActive={cameraActive}
            cameraError={cameraError}
            startCamera={startCamera}
            stopCamera={stopCamera}
            warehousesList={warehousesList}
            selectedWarehouseId={selectedWarehouseId}
            onSelectWarehouse={newId => {
              setSelectedWarehouseId(newId);
              secureStorage.setItem('tripro_mobile_preferred_warehouse', newId);
            }}
            searchQuery={searchQuery}
            onSearchQueryChange={setSearchQuery}
            onLookupBarcode={handleLookupBarcode}
            selectedProduct={selectedProduct}
            getProductStockInWarehouse={getProductStockInWarehouse}
            newStockCount={newStockCount}
            onNewStockCountChange={setNewStockCount}
            handleSaveStockAdjustment={handleSaveStockAdjustment}
            adjustingStock={adjustingStock}
            onAddToCart={addToCart}
            onNavigateToSales={() => setActiveTab('sales')}
          />
        )}

        {activeTab === 'sales' && (
          <MobileSalesTab
            warehousesList={warehousesList}
            selectedWarehouseId={selectedWarehouseId}
            onSelectWarehouse={newId => {
              setSelectedWarehouseId(newId);
              secureStorage.setItem('tripro_mobile_preferred_warehouse', newId);
            }}
            paymentType={paymentType}
            setPaymentType={setPaymentType}
            selectedCustomerId={selectedCustomerId}
            setSelectedCustomerId={setSelectedCustomerId}
            customerName={customerName}
            setCustomerName={setCustomerName}
            customersList={customersList}
            customerSearchQuery={customerSearchQuery}
            setCustomerSearchQuery={setCustomerSearchQuery}
            filteredCustomers={filteredCustomers}
            onOpenAddCustomerModal={() => setShowAddCustomerModal(true)}
            catalogProducts={catalogProducts}
            loadingCatalog={loadingCatalog}
            productSearch={productSearch}
            setProductSearch={setProductSearch}
            getProductStockInWarehouse={getProductStockInWarehouse}
            cart={cart}
            setCart={setCart}
            addToCart={addToCart}
            updateCartQty={updateCartQty}
            cartSubtotal={cartSubtotal}
            cartTax={cartTax}
            cartTotal={cartTotal}
            handleCreateFieldInvoice={handleCreateFieldInvoice}
            savingInvoice={savingInvoice}
            lastSavedInvoice={lastSavedInvoice}
            onPrintReceipt={handlePrintReceipt}
            onOpenReceiptModal={() => setShowReceiptModal(true)}
            onShareWhatsApp={handleShareWhatsApp}
            showSalesCamera={showSalesCamera}
            salesVideoRef={salesVideoRef}
            startSalesCamera={startSalesCamera}
            stopSalesCamera={stopSalesCamera}
            showToast={showToast}
          />
        )}

        {activeTab === 'sync' && (
          <MobileSyncTab
            cachedProductsCount={cachedProductsCount || 0}
            queuedOrdersCount={queuedOrdersCount || 0}
            handleManualSync={handleManualSync}
            syncingNow={syncingNow}
            isOnline={isOnline}
          />
        )}

        {/* ➕ QUICK ADD CUSTOMER MODAL */}
        <QuickAddCustomerModal
          show={showAddCustomerModal}
          onClose={() => setShowAddCustomerModal(false)}
          newCustName={newCustName}
          setNewCustName={setNewCustName}
          newCustPhone={newCustPhone}
          setNewCustPhone={setNewCustPhone}
          onSave={handleQuickAddCustomer}
          saving={savingNewCustomer}
        />

        {/* 🖨️ ON-SCREEN THERMAL RECEIPT PREVIEW MODAL */}
        <MobileReceiptModal
          show={showReceiptModal}
          onClose={() => setShowReceiptModal(false)}
          invoice={lastSavedInvoice}
          companySettings={companySettings}
        />
      </main>

      {/* 🧭 BOTTOM NAVIGATION BAR (FIXED TOUCH BAR) */}
      <MobileNavigation
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        isVanSalesUser={isVanSalesUser}
        cartCount={cart.length}
      />
    </div>
  );
}

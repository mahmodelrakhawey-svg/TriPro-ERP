import React, { useState, useEffect, useRef } from 'react';
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
  Sparkles
} from 'lucide-react';
import { supabase } from '../../supabaseClient';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { offlineService, db, CachedProduct } from '../../services/offlineService';
import { useLiveQuery } from 'dexie-react-hooks';

type MobileTab = 'dashboard' | 'scanner' | 'sales' | 'sync';

export default function MobileApp() {
  const navigate = useNavigate();
  const { currentUser } = useAuth();
  const { showToast } = useToast();

  const [activeTab, setActiveTab] = useState<MobileTab>('dashboard');
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
      console.error('Mobile Dashboard Load Error:', err);
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
    } catch (err: any) {
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
    } catch (err: any) {
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
    } catch (err: any) {
      console.error('Camera access error:', err);
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
      console.warn('Local dexie search failed:', dexErr);
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
        console.warn('Online product search error:', supErr);
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
      // 1. Update IndexedDB locally
      await db.products.update(selectedProduct.id, { stock: targetCount });

      // 2. Update Supabase if online
      if (isOnline) {
        const { error } = await supabase
          .from('products')
          .update({ stock: targetCount })
          .eq('id', selectedProduct.id);

        if (error) throw error;
      }

      setSelectedProduct((prev: any) => ({ ...prev, stock: targetCount }));
      showToast(`تم تحديث رصيد المخزن إلى: ${targetCount} بنجاح ✅`, 'success');
    } catch (err: any) {
      showToast('خطأ في حفظ الرصيد: ' + err.message, 'error');
    } finally {
      setAdjustingStock(false);
    }
  };

  // =========================================================================
  // 3. TAB: FIELD SALES & VAN SALES (FASTER INVOICING)
  // =========================================================================
  const [cart, setCart] = useState<Array<{ product: any; qty: number; price: number }>>([]);
  const [customerName, setCustomerName] = useState('عميل ميداني نقدي');
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>('');
  const [paymentType, setPaymentType] = useState<'cash' | 'credit'>('cash');
  const [savingInvoice, setSavingInvoice] = useState(false);
  const [lastSavedInvoice, setLastSavedInvoice] = useState<any | null>(null);

  // Products and Customers for field sales
  const [catalogProducts, setCatalogProducts] = useState<any[]>([]);
  const [customersList, setCustomersList] = useState<any[]>([]);
  const [productSearch, setProductSearch] = useState('');
  const [loadingCatalog, setLoadingCatalog] = useState(false);
  const [showSalesCamera, setShowSalesCamera] = useState(false);
  const salesVideoRef = useRef<HTMLVideoElement | null>(null);
  const salesScannerStreamRef = useRef<MediaStream | null>(null);

  const loadCatalogData = async () => {
    setLoadingCatalog(true);
    try {
      // 1. Try local Dexie products first
      const localProducts = await db.products.toArray();
      if (localProducts && localProducts.length > 0) {
        setCatalogProducts(localProducts);
      } else if (isOnline && currentOrgId) {
        const { data: pData } = await supabase
          .from('products')
          .select('id, name, barcode, sku, sales_price, stock, image_url')
          .eq('organization_id', currentOrgId)
          .order('name', { ascending: true })
          .limit(100);
        if (pData) setCatalogProducts(pData);
      }

      // 2. Load Customers
      if (isOnline && currentOrgId) {
        const { data: cData } = await supabase
          .from('customers')
          .select('id, name, phone')
          .eq('organization_id', currentOrgId)
          .order('name', { ascending: true })
          .limit(50);
        if (cData) setCustomersList(cData);
      }
    } catch (e) {
      console.warn('Catalog load warning:', e);
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
    setCart(prev => {
      const existing = prev.find(item => item.product.id === product.id);
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

  const cartSubtotal = cart.reduce((sum, it) => sum + it.price * it.qty, 0);
  const cartTax = cartSubtotal * 0.14;
  const cartTotal = cartSubtotal + cartTax;

  const handleCreateFieldInvoice = async () => {
    if (cart.length === 0) {
      showToast('سلة الفاتورة فارغة!', 'warning');
      return;
    }

    setSavingInvoice(true);
    const invoiceNumber = `VAN-${Date.now().toString().slice(-6)}`;
    const invoicePayload = {
      invoice_number: invoiceNumber,
      invoice_date: new Date().toISOString().split('T')[0],
      total_amount: cartTotal,
      tax_amount: cartTax,
      subtotal: cartSubtotal,
      paid_amount: paymentType === 'cash' ? cartTotal : 0,
      status: paymentType === 'cash' ? 'paid' : 'unpaid',
      notes: `فاتورة ميدانية سريعة - العميل: ${customerName}`,
      organization_id: currentOrgId,
      items: cart.map(it => ({
        product_id: it.product.id,
        quantity: it.qty,
        unit_price: it.price,
        total: it.price * it.qty
      }))
    };

    try {
      if (isOnline) {
        // Direct Online Save
        const { data: invData, error: invErr } = await supabase
          .from('invoices')
          .insert({
            invoice_number: invoicePayload.invoice_number,
            invoice_date: invoicePayload.invoice_date,
            total_amount: invoicePayload.total_amount,
            tax_amount: invoicePayload.tax_amount,
            paid_amount: invoicePayload.paid_amount,
            status: invoicePayload.status,
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

        setLastSavedInvoice(invoicePayload);
        showToast(`تم حفظ الفاتورة #${invoiceNumber} بنجاح ✅`, 'success');
      } else {
        // Offline IndexedDB Queue
        await offlineService.queueOrder(invoicePayload);
        setLastSavedInvoice(invoicePayload);
        showToast(`🔌 تم حفظ الفاتورة محلياً #${invoiceNumber} (ستُرفع تلقائياً فور توفر الإنترنت)`, 'success');
      }

      setCart([]);
    } catch (err: any) {
      showToast('خطأ أثناء حفظ الفاتورة: ' + err.message, 'error');
    } finally {
      setSavingInvoice(false);
    }
  };

  const handlePrintReceipt = () => {
    window.print();
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
    } catch (err: any) {
      showToast('فشل المزامنة: ' + err.message, 'error');
    } finally {
      setSyncingNow(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 flex flex-col justify-between max-w-md mx-auto shadow-2xl border-x border-slate-800 font-sans select-none" dir="rtl">
      
      {/* 🟢 TOP APP HEADER */}
      <header className="bg-slate-800/90 backdrop-blur-md px-4 py-3 border-b border-slate-700/80 sticky top-0 z-30 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400 font-black text-sm">
            TP
          </div>
          <div>
            <h1 className="font-extrabold text-sm text-white tracking-tight leading-none">تراي برو الميداني</h1>
            <p className="text-[10px] text-slate-400 mt-0.5">TriPro Mobile Companion</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Online/Offline pill */}
          <div className={`flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full border ${
            isOnline 
              ? 'bg-emerald-950/60 text-emerald-400 border-emerald-500/30' 
              : 'bg-amber-950/60 text-amber-400 border-amber-500/30'
          }`}>
            {isOnline ? <Wifi size={12} /> : <WifiOff size={12} />}
            <span>{isOnline ? 'أونلاين' : 'أوفلاين'}</span>
          </div>

          {/* Switch to Full Desktop Mode */}
          <button
            onClick={() => navigate('/')}
            className="p-1.5 bg-slate-700 hover:bg-slate-600 rounded-lg text-slate-300 hover:text-white transition-colors"
            title="العودة للنظام الكامل"
          >
            <ArrowRight size={16} />
          </button>
        </div>
      </header>

      {/* 📱 TAB CONTENT AREA */}
      <main className="flex-1 p-4 overflow-y-auto pb-24">

        {/* ======================= TAB 1: DASHBOARD ======================= */}
        {activeTab === 'dashboard' && (
          <div className="space-y-4 animate-in fade-in duration-200">
            {/* KPI Cards */}
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-gradient-to-br from-emerald-900/40 to-slate-800 p-3.5 rounded-xl border border-emerald-500/20">
                <div className="flex items-center justify-between text-emerald-400 mb-1">
                  <span className="text-xs font-bold">مبيعات اليوم</span>
                  <TrendingUp size={16} />
                </div>
                <div className="text-xl font-black text-white">
                  {stats.todaySales.toLocaleString()} <span className="text-xs font-normal text-emerald-300">ج.م</span>
                </div>
                <div className="text-[11px] text-slate-400 mt-1">
                  عدد الفواتير: <span className="font-bold text-white">{stats.salesCount}</span>
                </div>
              </div>

              <div className="bg-gradient-to-br from-indigo-900/40 to-slate-800 p-3.5 rounded-xl border border-indigo-500/20">
                <div className="flex items-center justify-between text-indigo-400 mb-1">
                  <span className="text-xs font-bold">أوامر الشراء المعلقة</span>
                  <Clock size={16} />
                </div>
                <div className="text-xl font-black text-white">
                  {stats.pendingPOsCount} <span className="text-xs font-normal text-indigo-300">طلب</span>
                </div>
                <div className="text-[11px] text-slate-400 mt-1">
                  تحتاج مراجعة واعتماد
                </div>
              </div>
            </div>

            {/* Quick Approvals Section */}
            <div className="bg-slate-800/80 rounded-xl p-3.5 border border-slate-700/80">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <ShieldCheck size={18} className="text-amber-400" />
                  <h3 className="font-bold text-sm text-white">طلبات الاعتماد الفوري (Approvals)</h3>
                </div>
                <button
                  onClick={loadDashboardData}
                  disabled={loadingStats}
                  className="p-1 text-slate-400 hover:text-white"
                >
                  <RefreshCw size={14} className={loadingStats ? 'animate-spin' : ''} />
                </button>
              </div>

              {pendingOrders.length === 0 ? (
                <div className="py-8 text-center text-slate-400">
                  <CheckCircle2 size={32} className="mx-auto text-emerald-500/60 mb-2" />
                  <p className="text-xs">رائع! لا توجد طلبات شراء معلقة بانتظار الاعتماد.</p>
                </div>
              ) : (
                <div className="space-y-2.5">
                  {pendingOrders.map(po => (
                    <div key={po.id} className="bg-slate-900/70 p-3 rounded-lg border border-slate-700 flex items-center justify-between">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-xs text-white">PO #{po.po_number || po.id.slice(0, 6)}</span>
                          <span className="text-[10px] bg-amber-500/20 text-amber-300 px-1.5 py-0.5 rounded font-bold">معلق</span>
                        </div>
                        <p className="text-[11px] text-slate-300 mt-0.5 font-medium">المورد: {po.suppliers?.name || 'مورد عام'}</p>
                        <p className="text-xs font-bold text-emerald-400 mt-1">
                          {Number(po.total_amount || 0).toLocaleString()} ج.م
                        </p>
                      </div>

                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => handleApprovePO(po.id)}
                          disabled={processingId === po.id}
                          className="bg-emerald-600 hover:bg-emerald-500 text-white p-2 rounded-lg text-xs font-bold flex items-center gap-1 transition-colors"
                          title="اعتماد"
                        >
                          <CheckCircle2 size={16} />
                        </button>
                        <button
                          onClick={() => handleRejectPO(po.id)}
                          disabled={processingId === po.id}
                          className="bg-red-600/80 hover:bg-red-500 text-white p-2 rounded-lg text-xs font-bold flex items-center gap-1 transition-colors"
                          title="رفض"
                        >
                          <XCircle size={16} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Quick Actions Bar */}
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => setActiveTab('scanner')}
                className="bg-indigo-600/30 border border-indigo-500/40 hover:bg-indigo-600/50 p-3 rounded-xl flex items-center gap-2.5 text-right transition-colors"
              >
                <ScanLine className="text-indigo-400 shrink-0" size={20} />
                <div>
                  <div className="font-bold text-xs text-white">جرد بالكاميرا</div>
                  <div className="text-[10px] text-slate-400">فحص باركود ورصيد</div>
                </div>
              </button>

              <button
                onClick={() => setActiveTab('sales')}
                className="bg-emerald-600/30 border border-emerald-500/40 hover:bg-emerald-600/50 p-3 rounded-xl flex items-center gap-2.5 text-right transition-colors"
              >
                <ShoppingCart className="text-emerald-400 shrink-0" size={20} />
                <div>
                  <div className="font-bold text-xs text-white">فاتورة ميدانية</div>
                  <div className="text-[10px] text-slate-400">بيع سريع للمندوب</div>
                </div>
              </button>
            </div>
          </div>
        )}

        {/* ======================= TAB 2: BARCODE SCANNER ======================= */}
        {activeTab === 'scanner' && (
          <div className="space-y-4 animate-in fade-in duration-200">
            {/* Camera Viewport */}
            <div className="bg-slate-800 rounded-xl p-3 border border-slate-700 text-center relative overflow-hidden">
              <video
                ref={videoRef}
                className={`w-full h-48 object-cover rounded-lg bg-black ${cameraActive ? 'block' : 'hidden'}`}
                playsInline
                muted
              />

              {!cameraActive && (
                <div className="py-8 flex flex-col items-center justify-center">
                  <div className="w-14 h-14 rounded-full bg-indigo-500/20 border border-indigo-500/40 flex items-center justify-center text-indigo-400 mb-3">
                    <Camera size={26} />
                  </div>
                  <h3 className="font-bold text-sm text-white">ماسح باركود الكاميرا المباشر</h3>
                  <p className="text-xs text-slate-400 mt-1 max-w-xs">
                    وجّه كاميرا الهاتف نحو باركود الصنف لجرد الرصيد فورياً
                  </p>
                  <button
                    onClick={startCamera}
                    className="mt-4 bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs px-4 py-2.5 rounded-lg flex items-center gap-2 shadow-lg shadow-indigo-600/30"
                  >
                    <Camera size={16} />
                    <span>تشغيل كاميرا الجرد</span>
                  </button>
                </div>
              )}

              {cameraActive && (
                <div className="mt-2 flex items-center justify-between px-2">
                  <span className="text-[11px] text-emerald-400 flex items-center gap-1 font-bold animate-pulse">
                    <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
                    الكاميرا تقرأ الباركود تلقائياً...
                  </span>
                  <button
                    onClick={stopCamera}
                    className="bg-slate-700 hover:bg-slate-600 text-slate-200 text-xs px-2.5 py-1 rounded"
                  >
                    إيقاف
                  </button>
                </div>
              )}

              {cameraError && (
                <div className="mt-2 text-xs text-red-400 bg-red-950/40 p-2 rounded border border-red-800/50">
                  {cameraError}
                </div>
              )}
            </div>

            {/* Manual Search or Barcode Input */}
            <div className="flex gap-2">
              <div className="relative flex-1">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleLookupBarcode(searchQuery)}
                  placeholder="أو اكتب الباركود / اسم الصنف..."
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                />
              </div>
              <button
                onClick={() => handleLookupBarcode(searchQuery)}
                className="bg-indigo-600 hover:bg-indigo-500 text-white px-3 py-2 rounded-lg text-xs font-bold flex items-center gap-1"
              >
                <Search size={14} />
                <span>بحث</span>
              </button>
            </div>

            {/* Selected Product Card & Quick Count Update */}
            {selectedProduct && (
              <div className="bg-slate-800/90 rounded-xl p-4 border border-indigo-500/30 space-y-3">
                <div className="flex items-start justify-between">
                  <div>
                    <span className="text-[10px] bg-indigo-500/20 text-indigo-300 font-mono px-2 py-0.5 rounded">
                      {selectedProduct.barcode || selectedProduct.sku || 'بدون باركود'}
                    </span>
                    <h4 className="font-bold text-sm text-white mt-1">{selectedProduct.name}</h4>
                    <p className="text-xs text-emerald-400 font-black mt-0.5">
                      سعر البيع: {Number(selectedProduct.sales_price || 0).toLocaleString()} ج.م
                    </p>
                  </div>
                  <div className="text-left bg-slate-900 px-3 py-1.5 rounded-lg border border-slate-700">
                    <span className="text-[10px] text-slate-400 block">الرصيد الفعلي</span>
                    <span className="text-lg font-black text-amber-400">{selectedProduct.stock || 0}</span>
                  </div>
                </div>

                {/* Adjustment box */}
                <div className="pt-2 border-t border-slate-700/80">
                  <label className="text-xs text-slate-300 font-bold block mb-1">
                    تسجيل جرد فعلي وتعديل الرصيد:
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="number"
                      value={newStockCount}
                      onChange={e => setNewStockCount(e.target.value)}
                      className="w-24 bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-sm font-bold text-center text-white focus:outline-none focus:border-emerald-500"
                    />
                    <button
                      onClick={handleSaveStockAdjustment}
                      disabled={adjustingStock}
                      className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold py-2 px-3 rounded-lg transition-colors flex items-center justify-center gap-1"
                    >
                      <CheckCircle2 size={14} />
                      <span>{adjustingStock ? 'جاري الحفظ...' : 'تثبيت الجرد الفعلي'}</span>
                    </button>
                    <button
                      onClick={() => {
                        addToCart(selectedProduct);
                        setActiveTab('sales');
                      }}
                      className="bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold px-3 py-2 rounded-lg"
                      title="إضافة للفاتورة"
                    >
                      <ShoppingCart size={14} />
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ======================= TAB 3: FIELD SALES ======================= */}
        {activeTab === 'sales' && (
          <div className="space-y-4 animate-in fade-in duration-200">
            {/* Customer & Type */}
            <div className="bg-slate-800 p-3.5 rounded-xl border border-slate-700 space-y-2.5">
              <label className="text-xs text-slate-300 font-bold block">اختيار أو إدخال اسم العميل:</label>
              <div className="space-y-2">
                {customersList.length > 0 && (
                  <select
                    value={selectedCustomerId}
                    onChange={e => {
                      setSelectedCustomerId(e.target.value);
                      const found = customersList.find(c => c.id === e.target.value);
                      if (found) setCustomerName(found.name);
                    }}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-2 text-xs text-white focus:outline-none focus:border-emerald-500"
                  >
                    <option value="">-- اختيار عميل مسجل من القائمة --</option>
                    {customersList.map(c => (
                      <option key={c.id} value={c.id}>{c.name} {c.phone ? `(${c.phone})` : ''}</option>
                    ))}
                  </select>
                )}
                <div className="flex items-center gap-2">
                  <User size={16} className="text-emerald-400 shrink-0" />
                  <input
                    type="text"
                    value={customerName}
                    onChange={e => {
                      setCustomerName(e.target.value);
                      setSelectedCustomerId('');
                    }}
                    placeholder="أو اكتب اسم عميل نقدي يدوي..."
                    className="flex-1 bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-emerald-500"
                  />
                </div>
              </div>

              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setPaymentType('cash')}
                  className={`flex-1 py-1.5 rounded-lg text-xs font-bold border transition-colors ${
                    paymentType === 'cash'
                      ? 'bg-emerald-600 text-white border-emerald-500 shadow-md shadow-emerald-600/30'
                      : 'bg-slate-900 text-slate-400 border-slate-700'
                  }`}
                >
                  💵 نقدي فوري
                </button>
                <button
                  type="button"
                  onClick={() => setPaymentType('credit')}
                  className={`flex-1 py-1.5 rounded-lg text-xs font-bold border transition-colors ${
                    paymentType === 'credit'
                      ? 'bg-indigo-600 text-white border-indigo-500 shadow-md shadow-indigo-600/30'
                      : 'bg-slate-900 text-slate-400 border-slate-700'
                  }`}
                >
                  📝 آجل (ذمم)
                </button>
              </div>
            </div>

            {/* 📦 مباشرة: إضافة أصناف للفاتورة (بحث واختيار فوري) */}
            <div className="bg-slate-800 p-3.5 rounded-xl border border-slate-700 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="font-bold text-xs text-white flex items-center gap-1.5">
                  <Package size={15} className="text-emerald-400" />
                  <span>دليل الأصناف المتاحة ({catalogProducts.length} صنف)</span>
                </h3>
                <button
                  type="button"
                  onClick={showSalesCamera ? stopSalesCamera : startSalesCamera}
                  className="bg-indigo-600/40 hover:bg-indigo-600/60 border border-indigo-500/40 text-indigo-300 text-[11px] font-bold px-2.5 py-1 rounded-lg flex items-center gap-1 transition-colors"
                >
                  <Camera size={13} />
                  <span>{showSalesCamera ? 'إغلاق الكاميرا' : 'مسح بالكاميرا'}</span>
                </button>
              </div>

              {/* Inline Camera View if active */}
              {showSalesCamera && (
                <div className="bg-black rounded-lg overflow-hidden relative">
                  <video ref={salesVideoRef} className="w-full h-36 object-cover" playsInline muted />
                  <div className="absolute inset-0 border-2 border-emerald-500/40 pointer-events-none flex items-center justify-center">
                    <span className="text-[10px] bg-black/70 text-emerald-300 px-2 py-0.5 rounded font-bold">وجّه الكاميرا للباركود للإضافة التلقائية</span>
                  </div>
                </div>
              )}

              {/* Search Bar */}
              <div className="relative">
                <Search size={14} className="absolute right-3 top-2.5 text-slate-400" />
                <input
                  type="text"
                  value={productSearch}
                  onChange={e => setProductSearch(e.target.value)}
                  placeholder="ابحث باسم الصنف، الباركود، أو الكود..."
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg pr-9 pl-8 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                />
                {productSearch && (
                  <button
                    type="button"
                    onClick={() => setProductSearch('')}
                    className="absolute left-2.5 top-2 text-slate-400 hover:text-white text-xs"
                  >
                    ✕
                  </button>
                )}
              </div>

              {/* Products Quick Pick List */}
              <div className="space-y-1.5 max-h-52 overflow-y-auto pr-1">
                {catalogProducts
                  .filter(p => {
                    if (!productSearch.trim()) return true;
                    const term = productSearch.toLowerCase();
                    return (
                      p.name?.toLowerCase().includes(term) ||
                      p.barcode?.toLowerCase().includes(term) ||
                      p.sku?.toLowerCase().includes(term)
                    );
                  })
                  .slice(0, 20)
                  .map(p => {
                    const inCartItem = cart.find(c => c.product.id === p.id);
                    return (
                      <div
                        key={p.id}
                        className="bg-slate-900/80 hover:bg-slate-900 p-2.5 rounded-lg border border-slate-700/80 flex items-center justify-between transition-colors"
                      >
                        <div className="flex-1 min-w-0 pr-1">
                          <div className="font-bold text-xs text-white truncate">{p.name}</div>
                          <div className="flex items-center gap-2 mt-0.5 text-[11px]">
                            <span className="text-emerald-400 font-bold">{Number(p.sales_price || 0).toLocaleString()} ج.م</span>
                            <span className="text-slate-600">|</span>
                            <span className="text-slate-400 text-[10px]">المخزون: <b className="text-amber-400">{p.stock || 0}</b></span>
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={() => addToCart(p)}
                          className={`text-xs font-bold px-3 py-1.5 rounded-lg flex items-center gap-1 shadow-sm transition-all active:scale-95 shrink-0 ${
                            inCartItem 
                              ? 'bg-emerald-500 text-slate-900 font-black' 
                              : 'bg-emerald-600 hover:bg-emerald-500 text-white'
                          }`}
                        >
                          <Plus size={13} />
                          <span>{inCartItem ? `في السلة (${inCartItem.qty})` : 'إضافة +'}</span>
                        </button>
                      </div>
                    );
                  })}

                {catalogProducts.length === 0 && (
                  <div className="py-4 text-center text-slate-400 text-xs">
                    {loadingCatalog ? 'جاري تحميل قائمة الأصناف...' : 'لا توجد أصناف مسجلة في النظام.'}
                  </div>
                )}
              </div>
            </div>

            {/* Cart Items */}
            <div className="bg-slate-800 rounded-xl p-3.5 border border-slate-700">
              <div className="flex items-center justify-between mb-2">
                <h3 className="font-bold text-xs text-slate-200 flex items-center gap-1.5">
                  <ShoppingCart size={15} className="text-emerald-400" />
                  <span>بنود الفاتورة الحالية ({cart.length})</span>
                </h3>
                {cart.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setCart([])}
                    className="text-[11px] text-red-400 hover:text-red-300 font-bold flex items-center gap-1"
                  >
                    <Trash2 size={12} />
                    <span>إفراغ السلة</span>
                  </button>
                )}
              </div>

              {cart.length === 0 ? (
                <div className="py-5 text-center text-slate-400 text-xs bg-slate-900/50 rounded-lg border border-dashed border-slate-700">
                  السلة فارغة. اضغط على زر <b className="text-emerald-400 font-bold">"إضافة +"</b> بجانب أي صنف أعلاه لإدراجه فورياً في الفاتورة.
                </div>
              ) : (
                <div className="space-y-2">
                  {cart.map(item => (
                    <div key={item.product.id} className="bg-slate-900 p-2.5 rounded-lg border border-slate-700 flex items-center justify-between">
                      <div className="flex-1 pr-1">
                        <div className="font-bold text-xs text-white">{item.product.name}</div>
                        <div className="text-[11px] text-slate-400">
                          {item.price} ج.م × {item.qty} = <span className="text-emerald-400 font-bold">{item.price * item.qty} ج.م</span>
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => updateCartQty(item.product.id, -1)}
                          className="w-6 h-6 bg-slate-800 text-slate-300 rounded flex items-center justify-center hover:bg-slate-700"
                        >
                          <Minus size={12} />
                        </button>
                        <span className="w-5 text-center text-xs font-bold text-white">{item.qty}</span>
                        <button
                          onClick={() => updateCartQty(item.product.id, 1)}
                          className="w-6 h-6 bg-slate-800 text-slate-300 rounded flex items-center justify-center hover:bg-slate-700"
                        >
                          <Plus size={12} />
                        </button>
                      </div>
                    </div>
                  ))}

                  {/* Summary */}
                  <div className="pt-2 border-t border-slate-700 space-y-1 text-xs">
                    <div className="flex justify-between text-slate-400">
                      <span>المجموع قبل الضريبة:</span>
                      <span>{cartSubtotal.toLocaleString()} ج.م</span>
                    </div>
                    <div className="flex justify-between text-slate-400">
                      <span>ضريبة القيمة المضافة (14%):</span>
                      <span>{cartTax.toLocaleString()} ج.م</span>
                    </div>
                    <div className="flex justify-between text-base font-black text-emerald-400 pt-1 border-t border-slate-700/60">
                      <span>الإجمالي النهائي:</span>
                      <span>{cartTotal.toLocaleString()} ج.م</span>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Action Buttons */}
            {cart.length > 0 && (
              <div className="space-y-2">
                <button
                  onClick={handleCreateFieldInvoice}
                  disabled={savingInvoice}
                  className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-sm py-3 rounded-xl shadow-lg shadow-emerald-600/30 flex items-center justify-center gap-2 transition-all"
                >
                  <DollarSign size={18} />
                  <span>{savingInvoice ? 'جاري الحفظ...' : 'إصدار وحفظ الفاتورة'}</span>
                </button>
              </div>
            )}

            {/* Receipt Print Section (When invoice saved) */}
            {lastSavedInvoice && (
              <div className="bg-slate-800/80 p-3 rounded-xl border border-emerald-500/40 text-center space-y-2">
                <div className="text-xs text-emerald-400 font-bold flex items-center justify-center gap-1">
                  <CheckCircle2 size={16} />
                  <span>تم حفظ الفاتورة بنجاح #{lastSavedInvoice.invoice_number}</span>
                </div>
                <button
                  onClick={handlePrintReceipt}
                  className="bg-slate-700 hover:bg-slate-600 text-white text-xs font-bold px-4 py-2 rounded-lg flex items-center justify-center gap-1.5 mx-auto"
                >
                  <Printer size={14} />
                  <span>طباعة إيصال بلوتوث حراري (Thermal 80mm)</span>
                </button>
              </div>
            )}
          </div>
        )}

        {/* ======================= TAB 4: OFFLINE SYNC ======================= */}
        {activeTab === 'sync' && (
          <div className="space-y-4 animate-in fade-in duration-200">
            <div className="bg-slate-800 p-4 rounded-xl border border-slate-700 space-y-3">
              <h3 className="font-bold text-sm text-white flex items-center gap-2">
                <RefreshCw size={18} className="text-indigo-400" />
                <span>مركز المزامنة وقاعدة البيانات المحلية</span>
              </h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                يحتفظ التطبيق بنسخة سريعة من دليل الأصناف على ذاكرة الهاتف (IndexedDB) ليعمل بسلاسة حتى في المناطق التي لا توجد بها تغطية إنترنت.
              </p>

              <div className="grid grid-cols-2 gap-2 pt-2">
                <div className="bg-slate-900 p-3 rounded-lg border border-slate-700 text-center">
                  <span className="text-[10px] text-slate-400 block">الأصناف المحفوظة محلياً</span>
                  <span className="text-lg font-black text-indigo-400">{cachedProductsCount || 0}</span>
                </div>
                <div className="bg-slate-900 p-3 rounded-lg border border-slate-700 text-center">
                  <span className="text-[10px] text-slate-400 block">العمليات بانتظار الرفع</span>
                  <span className="text-lg font-black text-amber-400">{queuedOrdersCount || 0}</span>
                </div>
              </div>

              <button
                onClick={handleManualSync}
                disabled={syncingNow || !isOnline}
                className="w-full mt-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-bold text-xs py-2.5 rounded-lg flex items-center justify-center gap-2 transition-colors"
              >
                <RefreshCw size={14} className={syncingNow ? 'animate-spin' : ''} />
                <span>{syncingNow ? 'جاري تحديث الدليل...' : 'تحديث وتنزيل دليل الأصناف الآن'}</span>
              </button>
            </div>
          </div>
        )}
      </main>

      {/* 🧭 BOTTOM NAVIGATION BAR (FIXED TOUCH BAR) */}
      <nav className="fixed bottom-0 left-0 right-0 max-w-md mx-auto bg-slate-900/95 backdrop-blur-md border-t border-slate-800 px-3 py-2 flex items-center justify-around z-40">
        <button
          onClick={() => setActiveTab('dashboard')}
          className={`flex flex-col items-center gap-1 transition-colors ${
            activeTab === 'dashboard' ? 'text-emerald-400' : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <LayoutDashboard size={20} />
          <span className="text-[10px] font-bold">لوحة المدير</span>
        </button>

        <button
          onClick={() => setActiveTab('scanner')}
          className={`flex flex-col items-center gap-1 transition-colors ${
            activeTab === 'scanner' ? 'text-indigo-400' : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <ScanLine size={20} />
          <span className="text-[10px] font-bold">الجرد بالكاميرا</span>
        </button>

        <button
          onClick={() => setActiveTab('sales')}
          className={`flex flex-col items-center gap-1 transition-colors relative ${
            activeTab === 'sales' ? 'text-emerald-400' : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <ShoppingCart size={20} />
          <span className="text-[10px] font-bold">فاتورة المندوب</span>
          {cart.length > 0 && (
            <span className="absolute -top-1 right-2 w-4 h-4 rounded-full bg-emerald-500 text-slate-900 font-black text-[9px] flex items-center justify-center">
              {cart.length}
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveTab('sync')}
          className={`flex flex-col items-center gap-1 transition-colors ${
            activeTab === 'sync' ? 'text-indigo-400' : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <RefreshCw size={20} />
          <span className="text-[10px] font-bold">المزامنة</span>
        </button>
      </nav>
    </div>
  );
}

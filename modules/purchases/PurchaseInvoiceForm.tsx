import React, { useState, useEffect, useMemo, useRef } from 'react';
import { logger } from '../../utils/logger';
import { useAccounting } from '../../context/AccountingContext';
import { useToast } from '../../context/ToastContext';
import { Save, Loader2, CheckCircle, Unlock } from 'lucide-react';
import { Product } from '../../types';
import { supabase } from '../../supabaseClient';
import { useNavigate, useLocation } from 'react-router-dom';
import { createPurchaseInvoiceSchema, createProductSchema } from '../../utils/validationSchemas';
import { PurchaseInvoicePrint } from './PurchaseInvoicePrint';
import { secureStorage } from '../../utils/securityMiddleware';
import InvoiceOCRScannerModal from '../../components/InvoiceOCRScannerModal';
import DocumentAuditTimeline from '../../components/DocumentAuditTimeline';
import { logDocumentAction } from '../../services/auditService';
import { getNextDocumentNumber } from '../../services/sequenceService';
import { getActiveOrgIdSync, resolveActiveOrgId } from '../../services/tenantContext';
import SupplierSearchSelect from '../../components/SupplierSearchSelect';
import { calculatePurchaseInvoiceTotals } from './purchaseInvoiceUtils';
import PurchaseInvoiceAttachments, { PurchaseAttachmentItem } from './components/PurchaseInvoiceAttachments';
import { ProductFormModal, ProductFormData } from '../inventory/components/ProductFormModal';
import { fetchUoms } from '../../services/uomService';
import { PurchaseInvoiceHeader } from './components/PurchaseInvoiceHeader';
import { PurchaseInvoiceItemsTable } from './components/PurchaseInvoiceItemsTable';
import { PurchaseInvoiceTotalsSection } from './components/PurchaseInvoiceTotalsSection';
import {
  buildEditPurchaseProductFormData,
  buildInitialPurchaseProductFormData,
  filterPurchaseProducts,
  generateUniqueBarcodeForProducts,
  generateUniqueSkuForProducts,
} from './utils/purchaseProductHelpers';

const PurchaseInvoiceForm = () => {
  const { 
    products, 
    warehouses, 
    suppliers, 
    approvePurchaseInvoice, 
    unpostPurchaseInvoice, 
    deletePurchaseInvoice, 
    settings, 
    can, 
    currentUser, 
    addDemoPurchaseInvoice, 
    accounts, 
    currentSelectedOrgId,
    addProduct,
    updateProduct,
    categories,
    getSystemAccount,
    refreshData
  } = useAccounting();
  const currentUserRole = (currentUser as any)?.role || '';
  const canUnpost = can?.('accounting', 'unpost') || can?.('purchases', 'unpost') || can?.('purchases', 'delete') || ['admin', 'super_admin', 'owner', 'manager'].includes(currentUserRole);
  const { showToast } = useToast();
  const navigate = useNavigate();
  const location = useLocation();

  const [formData, setFormData] = useState({
    supplierId: '',
    invoiceNumber: '',
    warehouseId: '',
    date: new Date().toISOString().split('T')[0],
    notes: '',
    status: 'draft',
    currency: 'EGP',
    exchangeRate: 1,
    paidAmount: 0,
    treasuryAccountId: '',
    discountType: 'fixed' as 'fixed' | 'percentage',
    discountValue: 0,
  });

  const [items, setItems] = useState<any[]>([]);
  const [attachments, setAttachments] = useState<PurchaseAttachmentItem[]>([]);
  const [uoms, setUoms] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);
  const isSubmittingRef = useRef(false);
  const [deleting, setDeleting] = useState(false);
  const [productSearchTerm, setProductSearchTerm] = useState('');
  const [showProductResults, setShowProductResults] = useState(false);
  const [isOCRModalOpen, setIsOCRModalOpen] = useState(false);

  // حالة كارت الصنف (إضافة / تعديل من الفاتورة)
  const [isProductModalOpen, setIsProductModalOpen] = useState(false);
  const [editingProductId, setEditingProductId] = useState<string | null>(null);
  const [productFormUploading, setProductFormUploading] = useState(false);
  const [productFormData, setProductFormData] = useState<ProductFormData>(() =>
    buildInitialPurchaseProductFormData()
  );

  // Navigation & Edit State
  const [editingId, setEditingId] = useState<string | null>(null);
  const [invoiceCreatedAt, setInvoiceCreatedAt] = useState<string | undefined>(undefined);
  const [creatorName, setCreatorName] = useState<string | undefined>(undefined);
  const [invoiceIds, setInvoiceIds] = useState<string[]>([]);
  const [currentIndex, setCurrentIndex] = useState<number>(-1);
  const [loadingInvoice, setLoadingInvoice] = useState(false);
  const [invoiceToPrint, setInvoiceToPrint] = useState<any>(null);
  const [companySettings, setCompanySettings] = useState<any>(null);

  useEffect(() => {
    supabase.rpc('get_current_company_settings').maybeSingle().then(({ data }) => {
      if (data) setCompanySettings(data);
    });
  }, []);

  // جلب كافة معرفات فواتير المشتريات للتنقل
  const fetchInvoiceIds = async () => {
    try {
      const explicitOrgId = currentSelectedOrgId || currentUser?.organization_id;
      const userOrgId = getActiveOrgIdSync(explicitOrgId) || await resolveActiveOrgId(explicitOrgId);
      if (!userOrgId) return;

      const { data, error } = await supabase
        .from('purchase_invoices')
        .select('id')
        .eq('organization_id', userOrgId)
        .order('invoice_date', { ascending: true })
        .order('created_at', { ascending: true });

      if (error) throw error;
      const ids = (data || []).map(inv => inv.id);
      setInvoiceIds(ids);
    } catch (err) {
      logger.error('Error fetching purchase invoice IDs:', err);
    }
  };

  useEffect(() => {
    fetchInvoiceIds();
  }, []);

  // تحميل الوحدات مع الكاش ومنع تكرار الطلبات المتزامنة
  useEffect(() => {
    const loadUomsList = async () => {
      const orgId = (currentUser as any)?.organization_id;
      const data = await fetchUoms(orgId);
      if (data) setUoms(data);
    };
    if (currentUser) loadUomsList();
  }, [currentUser]);

  // حسابات الخزينة (استبعاد الحسابات الرئيسية والتجميعية قطيعاً)
  const treasuryAccounts = useMemo(() => {
    return accounts.filter(a => 
      !(a.isGroup || a.is_group) &&
      a.code !== '123' && a.code !== '12' && a.code !== '1' && (
        a.name.includes('صندوق') || 
        a.name.includes('خزينة') || 
        a.name.includes('بنك') || 
        a.name.includes('نقد') ||
        a.code.startsWith('123') || a.code.startsWith('101')
      )
    );
  }, [accounts]);

  useEffect(() => {
    if (!formData.warehouseId && !editingId && warehouses.length > 0) {
      const preferred = settings.defaultWarehouseId 
        ? warehouses.find(w => w.id === settings.defaultWarehouseId) 
        : null;
      setFormData(prev => ({ ...prev, warehouseId: preferred ? preferred.id : warehouses[0].id }));
    }
    if (!formData.currency && settings.currency) {
        setFormData(prev => ({ ...prev, currency: settings.currency }));
    }
  }, [warehouses, settings, formData.warehouseId, editingId]);

  // تحميل تفاصيل فاتورة مشتريات محددة
  const loadInvoiceById = async (id: string) => {
    setLoadingInvoice(true);
    try {
      let fullInv: Record<string, any> | null = null;
      let { data: primaryData, error: invError } = await supabase
        .from('purchase_invoices')
        .select(`
          *,
          suppliers(id, name, phone),
          warehouses(id, name),
          purchase_invoice_items(*, products(name, sku, purchase_price, base_uom_id, tax_rate_override))
        `)
        .eq('id', id)
        .single();

      if (invError && (invError as any).code === '42703') {
        // احتياطي في حال حدوث أي خطأ في الكاش لقاعدة البيانات
        const { data: fallbackData, error: fallbackError } = await supabase
          .from('purchase_invoices')
          .select(`
            *,
            suppliers(id, name, phone),
            warehouses(id, name),
            purchase_invoice_items(id, product_id, quantity, unit_price, total, discount, discount_percent, tax_rate, tax_amount, uom_id, batch_number, expiry_date, products(name, sku, purchase_price, base_uom_id, tax_rate_override))
          `)
          .eq('id', id)
          .single();
        if (fallbackError) throw fallbackError;
        fullInv = fallbackData;
      } else if (invError) {
        throw invError;
      } else {
        fullInv = primaryData;
      }

      if (!fullInv) throw new Error('الفاتورة غير موجودة');

      setEditingId(fullInv.id);
      setInvoiceCreatedAt(fullInv.created_at || fullInv.invoice_date);
      setFormData({
        supplierId: fullInv.supplier_id || '',
        invoiceNumber: fullInv.invoice_number || '',
        date: fullInv.invoice_date || new Date().toISOString().split('T')[0],
        notes: fullInv.notes || '',
        status: fullInv.status || 'draft',
        currency: fullInv.currency || settings.currency || 'EGP',
        exchangeRate: fullInv.exchange_rate || 1,
        warehouseId: fullInv.warehouse_id || '',
        paidAmount: fullInv.paid_amount || 0,
        treasuryAccountId: fullInv.treasury_account_id || '',
        discountType: fullInv.discount_type || 'fixed',
        discountValue: Number(fullInv.discount_value) || (Number(fullInv.discount_amount) > 0 ? Number(fullInv.discount_amount) : 0),
      });

      const formattedItems = (fullInv.purchase_invoice_items || []).map((i: Record<string, any>) => {
        const itemProd = i.products;
        const pTax = itemProd?.tax_rate_override;
        const itemTaxRate = (i.tax_rate !== undefined && i.tax_rate !== null)
          ? Number(i.tax_rate)
          : (pTax !== undefined && pTax !== null && pTax !== '' && Number(pTax) > 0)
            ? Number(pTax)
            : (settings.enableTax ? (Number(settings.vatRate) || 0) : 0);

        const qty = Number(i.quantity) || 0;
        const uPrice = Number(i.unit_price) || 0;
        const gross = qty * uPrice;
        let disc = Number(i.discount ?? i.discount_amount) || 0;
        // استرجاع احتياطي للخصم إذا كان الإجمالي المسجل أقل من حاصل ضرب الكمية في السعر
        if (disc === 0 && Number(i.total) > 0 && gross > Number(i.total)) {
          disc = Number((gross - Number(i.total)).toFixed(2));
        }
        const discPct = Number(i.discount_percent ?? i.discount_percentage) || (gross > 0 && disc > 0 ? Number(((disc / gross) * 100).toFixed(2)) : 0);

        return {
          id: i.id,
          productId: i.product_id,
          productName: i.products?.name || 'صنف',
          productSku: i.products?.sku || '',
          quantity: qty,
          unitPrice: uPrice,
          discount: disc,
          discountPercent: discPct,
          uomId: i.uom_id || i.products?.base_uom_id || '',
          total: Number(i.total) || Math.max(0, gross - disc),
          taxRate: itemTaxRate,
          batchNumber: i.batch_number || '',
          expiryDate: i.expiry_date || ''
        };
      });

      setItems(formattedItems);

      // تحميل المرفقات من جدول purchase_invoice_attachments أو من حقل الفاتورة attachments
      let loadedAtts: PurchaseAttachmentItem[] = [];
      if (Array.isArray(fullInv.attachments)) {
        loadedAtts = [...fullInv.attachments];
      }
      try {
        const { data: dbAtts } = await supabase
          .from('purchase_invoice_attachments')
          .select('*')
          .eq('purchase_invoice_id', id)
          .order('created_at', { ascending: false });

        if (dbAtts && dbAtts.length > 0) {
          const pathSet = new Set(loadedAtts.map(a => a.file_path));
          for (const da of dbAtts) {
            if (!pathSet.has(da.file_path)) {
              loadedAtts.push(da);
            }
          }
        }
      } catch (attErr) {
        logger.warn('Non-blocking attachments fetch:', attErr);
      }
      setAttachments(loadedAtts);

      const idx = invoiceIds.indexOf(id);
      if (idx !== -1) setCurrentIndex(idx);

    } catch (err) {
      logger.error('Error loading purchase invoice:', err);
      showToast('فشل تحميل الفاتورة: ' + err.message, 'error');
    } finally {
      setLoadingInvoice(false);
    }
  };

  // استنساخ وتكرار فاتورة مشتريات محددة من السجل كمسودة جديدة
  const loadAndDuplicateInvoice = async (id: string) => {
    setLoadingInvoice(true);
    try {
      let fullInv: Record<string, any> | null = null;
      let { data: primaryData, error: invError } = await supabase
        .from('purchase_invoices')
        .select(`
          *,
          suppliers(id, name, phone),
          warehouses(id, name),
          purchase_invoice_items(*, products(name, sku, purchase_price, base_uom_id, tax_rate_override))
        `)
        .eq('id', id)
        .single();

      if (invError && (invError as any).code === '42703') {
        const { data: fallbackData, error: fallbackError } = await supabase
          .from('purchase_invoices')
          .select(`
            *,
            suppliers(id, name, phone),
            warehouses(id, name),
            purchase_invoice_items(id, product_id, quantity, unit_price, total, discount, discount_percent, tax_rate, tax_amount, uom_id, batch_number, expiry_date, products(name, sku, purchase_price, base_uom_id, tax_rate_override))
          `)
          .eq('id', id)
          .single();
        if (fallbackError) throw fallbackError;
        fullInv = fallbackData;
      } else if (invError) {
        throw invError;
      } else {
        fullInv = primaryData;
      }

      if (!fullInv) throw new Error('الفاتورة المراد تكرارها غير موجودة');

      const originalNumber = fullInv.invoice_number || 'غير محدد';
      setEditingId(null);
      setCurrentIndex(-1);
      setInvoiceCreatedAt(undefined);
      setCreatorName(undefined);
      setAttachments([]);

      setFormData({
        supplierId: fullInv.supplier_id || '',
        invoiceNumber: '',
        date: new Date().toISOString().split('T')[0],
        notes: fullInv.notes 
          ? `${fullInv.notes} (مكررة من الفاتورة: ${originalNumber})` 
          : `مكررة من الفاتورة: ${originalNumber}`,
        status: 'draft',
        currency: fullInv.currency || settings.currency || 'EGP',
        exchangeRate: fullInv.exchange_rate || 1,
        warehouseId: fullInv.warehouse_id || (warehouses.length > 0 ? warehouses[0].id : ''),
        paidAmount: 0,
        treasuryAccountId: '',
        discountType: fullInv.discount_type || 'fixed',
        discountValue: Number(fullInv.discount_value) || (Number(fullInv.discount_amount) > 0 ? Number(fullInv.discount_amount) : 0),
      });

      const formattedItems = (fullInv.purchase_invoice_items || []).map((i: Record<string, any>, idx: number) => {
        const itemProd = i.products;
        const pTax = itemProd?.tax_rate_override;
        const itemTaxRate = (i.tax_rate !== undefined && i.tax_rate !== null)
          ? Number(i.tax_rate)
          : (pTax !== undefined && pTax !== null && pTax !== '' && Number(pTax) > 0)
            ? Number(pTax)
            : (settings.enableTax ? (Number(settings.vatRate) || 0) : 0);

        const qty = Number(i.quantity) || 0;
        const uPrice = Number(i.unit_price) || 0;
        const gross = qty * uPrice;
        let disc = Number(i.discount ?? i.discount_amount) || 0;
        if (disc === 0 && Number(i.total) > 0 && gross > Number(i.total)) {
          disc = Number((gross - Number(i.total)).toFixed(2));
        }
        const discPct = Number(i.discount_percent ?? i.discount_percentage) || (gross > 0 && disc > 0 ? Number(((disc / gross) * 100).toFixed(2)) : 0);

        return {
          id: `dup-${Date.now()}-${idx}-${Math.random().toString(36).substring(2, 7)}`,
          productId: i.product_id,
          productName: i.products?.name || 'صنف',
          productSku: i.products?.sku || '',
          quantity: qty,
          unitPrice: uPrice,
          discount: disc,
          discountPercent: discPct,
          uomId: i.uom_id || i.products?.base_uom_id || '',
          total: Number(i.total) || Math.max(0, gross - disc),
          taxRate: itemTaxRate,
          batchNumber: '',
          expiryDate: i.expiry_date || ''
        };
      });

      setItems(formattedItems);
      showToast(`تم تكرار الفاتورة (${originalNumber}) كمسودة جديدة بنجاح 📋`, 'success');
    } catch (err) {
      logger.error('Error duplicating purchase invoice:', err);
      const errMsg = err instanceof Error ? err.message : 'حدث خطأ';
      showToast('فشل تكرار الفاتورة: ' + errMsg, 'error');
    } finally {
      setLoadingInvoice(false);
    }
  };

  // استقبال فاتورة محالة من السجل (تعديل أو استنساخ)
  useEffect(() => {
    if (location.state) {
      const state = location.state as any;
      if (state.invoiceToEdit) {
        loadInvoiceById(state.invoiceToEdit.id);
      } else if (state.invoiceToDuplicate) {
        loadAndDuplicateInvoice(state.invoiceToDuplicate.id);
      }
    }
  }, [location.state]);

  // التنقل بين السجلات
  const handleNavigate = (direction: 'first' | 'prev' | 'next' | 'last') => {
    if (invoiceIds.length === 0) {
      showToast('لا توجد فواتير مشتريات مسجلة للتنقل بينها', 'info');
      return;
    }

    let targetIdx = currentIndex;
    if (direction === 'first') {
      targetIdx = 0;
    } else if (direction === 'last') {
      targetIdx = invoiceIds.length - 1;
    } else if (direction === 'prev') {
      if (currentIndex <= 0) {
        targetIdx = 0;
        showToast('هذه هي أول فاتورة مسجلة', 'info');
      } else {
        targetIdx = currentIndex - 1;
      }
    } else if (direction === 'next') {
      if (currentIndex >= invoiceIds.length - 1 || currentIndex === -1) {
        targetIdx = invoiceIds.length - 1;
        showToast('هذه هي آخر فاتورة مسجلة', 'info');
      } else {
        targetIdx = currentIndex + 1;
      }
    }

    if (targetIdx >= 0 && targetIdx < invoiceIds.length) {
      loadInvoiceById(invoiceIds[targetIdx]);
    }
  };

  // 🛡️ استعادة المسودة التلقائية من secureStorage عند فتح نموذج جديد
  useEffect(() => {
    if (!editingId && (!location.state || !(location.state as any).invoiceToEdit)) {
      try {
        const savedDraft = secureStorage.getItem('tripro_purchase_invoice_draft');
        if (savedDraft) {
          const parsed = typeof savedDraft === 'string' ? JSON.parse(savedDraft) : savedDraft;
          if (parsed.items && parsed.items.length > 0) {
            const hydrated = parsed.items.map((it: Record<string, any>) => {
              if (it.taxRate !== undefined && it.taxRate !== null) return it;
              const prod = products.find(p => p.id === it.productId);
              const pTax = prod ? (prod as any).tax_rate_override : undefined;
              const taxRate = (pTax !== undefined && pTax !== null && pTax !== '' && Number(pTax) > 0)
                ? Number(pTax)
                : (settings.enableTax ? (Number(settings.vatRate) || 0) : 0);
              return { ...it, taxRate };
            });
            setItems(hydrated);
            if (parsed.formData) {
              setFormData(prev => ({ ...prev, ...parsed.formData }));
            }
            showToast('تمت استعادة مسودة الفاتورة غير المحفوظة تلقائياً ✅', 'info');
          }
        }
      } catch (e) {
        logger.warn('Failed to parse purchase draft from secureStorage', e);
      }
    }
  }, []);

  // 🛡️ حفظ المسودة التلقائي في secureStorage عند تعديل الأصناف أو البيانات
  useEffect(() => {
    if (!editingId) {
      if (items.length > 0 || formData.supplierId || formData.notes) {
        secureStorage.setItem('tripro_purchase_invoice_draft', JSON.stringify({ formData, items }));
      }
    }
  }, [formData, items, editingId]);

  // 🛡️ حماية ضد التحديث أو المغادرة غير المقصودة للصفحة
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (items.length > 0 && !editingId) {
        e.preventDefault();
        e.returnValue = '';
        return '';
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [items.length, editingId]);

  const handleNewInvoice = () => {
    try {
      secureStorage.removeItem('tripro_purchase_invoice_draft');
    } catch (e) {}
    setEditingId(null);
    setCurrentIndex(-1);
    setItems([]);
    setAttachments([]);
    setFormData({
      supplierId: '',
      invoiceNumber: '',
      warehouseId: settings.defaultWarehouseId || (warehouses.length > 0 ? warehouses[0].id : ''),
      date: new Date().toISOString().split('T')[0],
      notes: '',
      status: 'draft',
      currency: settings.currency || 'EGP',
      exchangeRate: 1,
      paidAmount: 0,
      treasuryAccountId: '',
      discountType: 'fixed',
      discountValue: 0,
    });
    showToast('تم فتح نموذج فاتورة مشتريات جديدة ➕', 'info');
  };

  const handleDuplicateCurrentInvoice = () => {
    if (items.length === 0) {
      showToast('لا توجد بنود في الفاتورة الحالية لتكرارها', 'warning');
      return;
    }
    const originalNumber = formData.invoiceNumber || 'الحالية';
    setEditingId(null);
    setCurrentIndex(-1);
    setInvoiceCreatedAt(undefined);
    setCreatorName(undefined);
    setAttachments([]);
    setFormData(prev => ({
      ...prev,
      invoiceNumber: '',
      date: new Date().toISOString().split('T')[0],
      status: 'draft',
      paidAmount: 0,
      treasuryAccountId: '',
      notes: prev.notes 
        ? `${prev.notes} (مكررة من الفاتورة: ${originalNumber})` 
        : `مكررة من الفاتورة: ${originalNumber}`,
    }));
    setItems(prev => prev.map((item, idx) => ({
      ...item,
      id: `dup-${Date.now()}-${idx}-${Math.random().toString(36).substring(2, 7)}`,
      batchNumber: '' // تفريغ رقم الباتش للشحنة الجديدة
    })));
    showToast(`تم استنساخ الفاتورة (${originalNumber}) كمسودة جديدة جاهزة للتعديل والحفظ 📋`, 'success');
  };

  // 🧮 محرك حسابات الفاتورة والخصومات والضرائب المتوافق مع الفاتورة الإلكترونية (ETA)
  const invoiceCalculation = useMemo(() => {
    return calculatePurchaseInvoiceTotals(items, {
      discountType: formData.discountType,
      discountValue: formData.discountValue,
      enableTax: Boolean(settings.enableTax),
      globalVatRate: Number(settings.vatRate) || 14
    });
  }, [items, formData.discountType, formData.discountValue, settings.enableTax, settings.vatRate]);

  const subtotal = invoiceCalculation.subtotalBeforeInvoiceDiscount;
  const taxAmount = invoiceCalculation.taxAmount;
  const totalAmount = invoiceCalculation.totalAmount;

  const filteredProducts = useMemo(
    () => filterPurchaseProducts(products, productSearchTerm),
    [productSearchTerm, products]
  );

  // 🏷️ توليد كود فريد تلقائياً لصنف (SKU)
  const generateUniqueSku = (prefix = 'SKU'): string =>
    generateUniqueSkuForProducts(products, prefix);

  // 🏷️ توليد باركود فريد تلقائياً
  const generateUniqueBarcode = (): string =>
    generateUniqueBarcodeForProducts(products);

  // 🟢 فتح كارت الصنف لإضافة صنف جديد
  const handleOpenAddProductModal = () => {
    const accMappings = (settings as Record<string, unknown>)?.account_mappings as Record<string, string> | undefined;
    const rawMaterialAcc = getSystemAccount?.('INVENTORY_RAW_MATERIALS')?.id || accMappings?.INVENTORY_RAW_MATERIALS || '';
    const finishedGoodsAcc = getSystemAccount?.('INVENTORY_FINISHED_GOODS')?.id || accMappings?.INVENTORY_FINISHED_GOODS || '';
    const generalInvAcc = getSystemAccount?.('INVENTORY')?.id || accMappings?.INVENTORY || '';
    const defaultInventory = rawMaterialAcc || finishedGoodsAcc || generalInvAcc || '';
    const defaultCogs = getSystemAccount?.('COGS')?.id || '';
    const defaultSales = getSystemAccount?.('SALES_REVENUE')?.id || '';

    setEditingProductId(null);
    setProductFormData(
      buildInitialPurchaseProductFormData({
        name: productSearchTerm.trim() || '',
        sku: generateUniqueSku(),
        inventoryAccountId: defaultInventory,
        cogsAccountId: defaultCogs,
        salesAccountId: defaultSales,
        openingWarehouseId: formData.warehouseId || (warehouses[0]?.id || ''),
        supplierId: formData.supplierId || null,
      })
    );
    setIsProductModalOpen(true);
  };

  // ✏️ فتح كارت الصنف لتعديل صنف موجود
  const handleOpenEditProductModal = (product: Product | Record<string, unknown>) => {
    if (!product) return;
    const prodRec = product as Record<string, unknown>;
    setEditingProductId(String(prodRec.id || ''));
    setProductFormData(
      buildEditPurchaseProductFormData(
        prodRec,
        generateUniqueSku(),
        warehouses[0]?.id || ''
      )
    );
    setIsProductModalOpen(true);
  };

  // 💾 حفظ كارت الصنف (إضافة جديد أو تعديل صنف قائم)
  const handleProductFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const pPrice = Number(productFormData.purchase_price) || 0;
    const sPrice = Number(productFormData.sales_price) || 0;
    const effectiveSalesPrice = (sPrice > 0) ? sPrice : (pPrice > 0 ? pPrice : 0);

    const validationData = {
      name: productFormData.name?.trim(),
      sku: productFormData.sku?.trim() || undefined,
      unit: productFormData.unit?.trim() || 'قطعة',
      product_type: productFormData.product_type,
      purchase_price: pPrice,
      sales_price: effectiveSalesPrice,
      inventory_account_id: productFormData.inventory_account_id || undefined,
      cogs_account_id: productFormData.cogs_account_id || undefined,
      sales_account_id: productFormData.sales_account_id || undefined,
      labor_cost: Number(productFormData.labor_cost) || 0,
      overhead_cost: Number(productFormData.overhead_cost) || 0,
    };

    const validationResult = createProductSchema.safeParse(validationData);
    if (!validationResult.success) {
      showToast(validationResult.error.issues[0].message, 'warning');
      return;
    }

    const toNullableUUID = (v: unknown) => {
      if (!v || typeof v !== 'string' || v.trim() === '') return null;
      const trimmed = v.trim();
      return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(trimmed) ? trimmed : null;
    };

    try {
      const orgId = currentSelectedOrgId || (currentUser as any)?.organization_id || (currentUser as any)?.user_metadata?.org_id;
      const isPhysicalStock = productFormData.product_type === 'STOCK' || productFormData.product_type === 'RAW_MATERIAL' || productFormData.product_type === 'MANUFACTURED';

      if (editingProductId) {
        // تحديث الصنف الموجود
        const itemData: Record<string, any> = {
          name: productFormData.name.trim(),
          sku: productFormData.sku?.trim() || generateUniqueSku(),
          barcode: productFormData.barcode?.trim() || null,
          description: productFormData.description?.trim() || null,
          unit: productFormData.unit?.trim() || 'قطعة',
          sales_price: effectiveSalesPrice,
          purchase_price: pPrice,
          cost: pPrice,
          base_uom_id: toNullableUUID(productFormData.base_uom_id),
          purchase_uom_id: toNullableUUID(productFormData.purchase_uom_id),
          sale_uom_id: toNullableUUID(productFormData.sale_uom_id),
          product_type: productFormData.product_type,
          inventory_account_id: isPhysicalStock ? toNullableUUID(productFormData.inventory_account_id) : null,
          cogs_account_id: isPhysicalStock ? toNullableUUID(productFormData.cogs_account_id) : null,
          sales_account_id: toNullableUUID(productFormData.sales_account_id),
          image_url: productFormData.image_url?.trim() || null,
          category_id: toNullableUUID(productFormData.category_id),
          min_stock_level: Number(productFormData.min_stock_level) || 0,
          requires_serial: Boolean(productFormData.requires_serial),
          expiry_date: productFormData.expiry_date || null,
          tax_rate_override: Number(productFormData.tax_rate_override) || null,
          barcode2: productFormData.barcode2?.trim() || null,
          supplier_id: toNullableUUID(productFormData.supplier_id),
          egs_code: productFormData.egs_code?.trim() || null,
          eta_unit_code: productFormData.eta_unit_code?.trim() || null,
          item_code_type: productFormData.item_code_type || 'EGS'
        };

        await updateProduct(editingProductId, itemData);
        await refreshData?.();

        // تحديث البند الموجود في جدول الفاتورة إذا كان مضافاً
        setItems(prev => prev.map(it => {
          if (it.productId === editingProductId) {
            return {
              ...it,
              productName: productFormData.name,
              productSku: productFormData.sku,
              unitPrice: pPrice > 0 ? pPrice : it.unitPrice,
              taxRate: productFormData.tax_rate_override > 0 ? productFormData.tax_rate_override : it.taxRate,
            };
          }
          return it;
        }));

        showToast(`تم تحديث كارت الصنف (${productFormData.name}) بنجاح ✏️✅`, 'success');
      } else {
        // إضافة صنف جديد
        const productPayload: Record<string, any> = {
          name: productFormData.name.trim(),
          sku: productFormData.sku?.trim() || generateUniqueSku(),
          barcode: productFormData.barcode?.trim() || null,
          description: productFormData.description?.trim() || null,
          unit: productFormData.unit?.trim() || 'قطعة',
          base_uom_id: toNullableUUID(productFormData.base_uom_id),
          purchase_uom_id: toNullableUUID(productFormData.purchase_uom_id),
          sale_uom_id: toNullableUUID(productFormData.sale_uom_id),
          sales_price: effectiveSalesPrice,
          purchase_price: pPrice,
          cost: pPrice,
          stock: 0,
          item_type: productFormData.product_type === 'INTERMEDIATE_PRODUCT' ? 'STOCK' : productFormData.product_type,
          product_type: productFormData.product_type,
          inventory_account_id: isPhysicalStock ? toNullableUUID(productFormData.inventory_account_id) : null,
          cogs_account_id: isPhysicalStock ? toNullableUUID(productFormData.cogs_account_id) : null,
          sales_account_id: toNullableUUID(productFormData.sales_account_id),
          is_active: true,
          min_stock_level: Number(productFormData.min_stock_level) || 0,
          category_id: toNullableUUID(productFormData.category_id),
          requires_serial: Boolean(productFormData.requires_serial),
          expiry_date: productFormData.expiry_date || null,
          organization_id: orgId,
          tax_rate_override: Number(productFormData.tax_rate_override) || null,
          barcode2: productFormData.barcode2?.trim() || null,
          supplier_id: toNullableUUID(productFormData.supplier_id),
          egs_code: productFormData.egs_code?.trim() || null,
          eta_unit_code: productFormData.eta_unit_code?.trim() || null,
          item_code_type: productFormData.item_code_type || 'EGS'
        };

        const createdProd = await addProduct(productPayload);
        await refreshData?.();

        const newProdObj = (createdProd && (createdProd as any).id) 
          ? (createdProd as Product)
          : { ...productPayload, id: (createdProd as any)?.id || Date.now().toString() };

        // إضافة الصنف المنشأ حديثاً مباشرة إلى الفاتورة!
        addProductToInvoice(newProdObj as Product);
        showToast(`تم إنشاء الصنف الجديد (${productFormData.name}) وإضافته للفاتورة مباشرة ➕✅`, 'success');
      }

      setIsProductModalOpen(false);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error('Error saving product in purchase form:', err);
      showToast('خطأ أثناء حفظ كارت الصنف: ' + msg, 'error');
    }
  };

  const handleProductImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setProductFormUploading(true);
    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `product_${Date.now()}.${fileExt}`;
      const { error: uploadError } = await supabase.storage.from('products').upload(fileName, file);
      if (uploadError) throw uploadError;
      const { data } = supabase.storage.from('products').getPublicUrl(fileName);
      setProductFormData(prev => ({ ...prev, image_url: data.publicUrl }));
      showToast('تم رفع صورة الصنف بنجاح ✅', 'success');
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error('Failed to upload image:', err);
      showToast('تعذر رفع الصورة: ' + msg, 'warning');
    } finally {
      setProductFormUploading(false);
    }
  };

  const addProductToInvoice = (product: Product, matchedUomInfo?: { uom_name?: string; customPrice?: number; uom_id?: string }) => {
      const defaultUomId = matchedUomInfo?.uom_id || product.purchase_uom_id || product.base_uom_id || '';
      const selectedUom = uoms.find(u => u.id === defaultUomId);
      const basePrice = product.purchase_price || product.cost || 0;
      const initialPrice = (matchedUomInfo?.customPrice !== undefined && matchedUomInfo.customPrice > 0)
          ? matchedUomInfo.customPrice
          : (selectedUom ? Number((basePrice * (selectedUom.ratio || 1)).toFixed(4)) : basePrice);

      const productTaxOverride = (product as any).tax_rate_override;
      const initialTaxRate = (productTaxOverride !== undefined && productTaxOverride !== null && productTaxOverride !== '' && Number(productTaxOverride) > 0)
          ? Number(productTaxOverride)
          : (settings.enableTax ? (Number(settings.vatRate) || 0) : 0);

      const existingItemIndex = items.findIndex(i => i.productId === product.id && (!defaultUomId || i.uomId === defaultUomId));

      if (existingItemIndex > -1) {
          const newItems = [...items];
          newItems[existingItemIndex].quantity += 1;
          const gross = newItems[existingItemIndex].quantity * (newItems[existingItemIndex].unitPrice || 0);
          if (newItems[existingItemIndex].discountPercent > 0) {
            newItems[existingItemIndex].discount = Number(((gross * newItems[existingItemIndex].discountPercent) / 100).toFixed(2));
          }
          newItems[existingItemIndex].total = Math.max(0, gross - (newItems[existingItemIndex].discount || 0));
          if (newItems[existingItemIndex].taxRate === undefined) {
              newItems[existingItemIndex].taxRate = initialTaxRate;
          }
          setItems(newItems);
      } else {
          setItems([...items, {
              id: Date.now().toString(),
              productId: product.id,
              productName: product.name,
              productSku: product.sku,
              quantity: 1,
              unitPrice: initialPrice,
              discount: 0,
              discountPercent: 0,
              uomId: defaultUomId,
              total: initialPrice,
              taxRate: initialTaxRate,
              batchNumber: '',
              expiryDate: ''
          }]);
      }
      setProductSearchTerm('');
      setShowProductResults(false);
  };

  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') {
          e.preventDefault();
          const term = productSearchTerm.trim().toLowerCase();
          if (!term) return;

          let matchedUomInfo: { uom_name?: string; customPrice?: number; uom_id?: string } | undefined;
          let exactMatch = products.find(p => 
              (p.barcode && p.barcode.trim().toLowerCase() === term) ||
              (p.sku && p.sku.trim().toLowerCase() === term) ||
              ((p as any).barcode2 && (p as any).barcode2.trim().toLowerCase() === term)
          );

          if (!exactMatch) {
            for (const p of products) {
              if (Array.isArray((p as any).unit_barcodes)) {
                const foundUom = (p as any).unit_barcodes.find((ub: Record<string, any>) => ub.barcode && ub.barcode.trim().toLowerCase() === term);
                if (foundUom) {
                  exactMatch = p;
                  matchedUomInfo = {
                    uom_name: foundUom.uom_name,
                    customPrice: foundUom.price && Number(foundUom.price) > 0 ? Number(foundUom.price) : undefined,
                    uom_id: foundUom.uom_id
                  };
                  break;
                }
              }
            }
          } else if (Array.isArray((exactMatch as any).unit_barcodes)) {
            const foundUom = (exactMatch as any).unit_barcodes.find((ub: Record<string, any>) => ub.barcode && ub.barcode.trim().toLowerCase() === term);
            if (foundUom) {
              matchedUomInfo = {
                uom_name: foundUom.uom_name,
                customPrice: foundUom.price && Number(foundUom.price) > 0 ? Number(foundUom.price) : undefined,
                uom_id: foundUom.uom_id
              };
            }
          }

          if (exactMatch) {
              addProductToInvoice(exactMatch, matchedUomInfo);
          } else if (filteredProducts.length === 1) {
              addProductToInvoice(filteredProducts[0]);
          }
      }
  };

  const handleApplyOCRData = (ocrResult: Record<string, any>) => {
    setFormData(prev => ({
      ...prev,
      supplierId: ocrResult.supplierId || prev.supplierId,
      invoiceNumber: ocrResult.invoiceNumber || prev.invoiceNumber,
      date: ocrResult.date || prev.date,
      notes: ocrResult.notes || prev.notes
    }));

    if (ocrResult.items && ocrResult.items.length > 0) {
      const itemsWithTax = ocrResult.items.map((it: Record<string, any>) => {
        const prod = products.find(p => p.id === it.productId || p.name === it.productName);
        const pTax = prod ? (prod as any).tax_rate_override : undefined;
        const taxRate = it.taxRate !== undefined
          ? Number(it.taxRate)
          : (pTax !== undefined && pTax !== null && pTax !== '' && Number(pTax) > 0)
            ? Number(pTax)
            : (settings.enableTax ? (Number(settings.vatRate) || 0) : 0);
        return { ...it, taxRate };
      });
      setItems(itemsWithTax);
      showToast(`تم استيراد ${ocrResult.items.length} صنف من الفاتورة بنجاح عبر الذكاء الاصطناعي 🤖✅`, 'success');
    }
  };

  const handleItemChange = (index: number, field: string, value: unknown) => {
    const newItems = [...items];

    // الحساب التبادلي (Bi-directional Calculation): عند كتابة الإجمالي يتم حساب سعر الوحدة تلقائياً
    if (field === 'total') {
      const tot = Math.max(0, parseFloat(String(value ?? 0)) || 0);
      const qty = Number(newItems[index].quantity) || 0;
      const currentDisc = Number(newItems[index].discount) || 0;
      const discPct = Number(newItems[index].discountPercent) || 0;

      newItems[index].total = tot;

      if (qty > 0) {
        let gross = tot;
        if (discPct > 0 && discPct < 100) {
          gross = tot / (1 - discPct / 100);
          newItems[index].discount = Number((gross - tot).toFixed(2));
        } else if (currentDisc > 0) {
          gross = tot + currentDisc;
        }
        newItems[index].unitPrice = Number((gross / qty).toFixed(4));
      }
      setItems(newItems);
      return;
    }

    newItems[index][field] = value;

    // إذا تم إدخال الكمية وسعر الوحدة 0 ولكن الإجمالي محدد، يتم احتساب سعر الوحدة
    if (field === 'quantity') {
      const qty = Number(value) || 0;
      if ((Number(newItems[index].unitPrice) || 0) === 0 && (Number(newItems[index].total) || 0) > 0 && qty > 0) {
        newItems[index].unitPrice = Number(((Number(newItems[index].total) + (Number(newItems[index].discount) || 0)) / qty).toFixed(4));
      }
    }

    if (field === 'discount') {
      const gross = (Number(newItems[index].quantity) || 0) * (Number(newItems[index].unitPrice) || 0);
      const disc = Math.max(0, parseFloat(String(value || 0)) || 0);
      newItems[index].discount = disc;
      newItems[index].discountPercent = gross > 0 ? Number(((disc / gross) * 100).toFixed(2)) : 0;
    }

    if (field === 'discountPercent') {
      const gross = (Number(newItems[index].quantity) || 0) * (Number(newItems[index].unitPrice) || 0);
      const pct = Math.max(0, Math.min(100, parseFloat(String(value || 0)) || 0));
      newItems[index].discountPercent = pct;
      newItems[index].discount = Number(((gross * pct) / 100).toFixed(2));
    }

    if (field === 'quantity' || field === 'unitPrice') {
      const gross = (Number(newItems[index].quantity) || 0) * (Number(newItems[index].unitPrice) || 0);
      if (newItems[index].discountPercent > 0) {
        newItems[index].discount = Number(((gross * newItems[index].discountPercent) / 100).toFixed(2));
      } else if (newItems[index].discount > gross) {
        newItems[index].discount = gross;
      }
    }

    if (field === 'uomId') {
        const selectedUom = uoms.find(u => u.id === value);
        const product = products.find(p => p.id === newItems[index].productId);
        if (selectedUom && product) {
            const basePrice = product.purchase_price || product.cost || 0;
            const newUnitPrice = basePrice * selectedUom.ratio;
            newItems[index].unitPrice = Number(newUnitPrice.toFixed(4));
        }
    }

    if (field === 'productId') {
      const product = products.find(p => p.id === value);
      if (product) {
        newItems[index].unitPrice = product.purchase_price || product.cost || 0;
        newItems[index].uomId = product.purchase_uom_id || product.base_uom_id || '';
        newItems[index].productName = product.name;
        const pTax = (product as any).tax_rate_override;
        newItems[index].taxRate = (pTax !== undefined && pTax !== null && pTax !== '' && Number(pTax) > 0)
          ? Number(pTax)
          : (settings.enableTax ? (Number(settings.vatRate) || 0) : 0);
      }
    }

    if (field === 'taxRate') {
      newItems[index].taxRate = Math.max(0, Math.min(100, parseFloat(String(value || 0)) || 0));
    }

    const currentGross = (Number(newItems[index].quantity) || 0) * (Number(newItems[index].unitPrice) || 0);
    const currentDisc = Math.min(currentGross, Number(newItems[index].discount) || 0);
    newItems[index].total = Math.max(0, currentGross - currentDisc);
    setItems(newItems);
  };

  const removeItem = (index: number) => {
    setItems(items.filter((_, i) => i !== index));
  };

  const handleSave = async (e?: React.FormEvent, post: boolean = false) => {
    // 🛡️ صمام أمان التزامن السريع لمنع تكرار حفظ فاتورة المشتريات بالنقر المزدوج (Double-Submit Guard)
    if (isSubmittingRef.current || saving) return;
    if (e) e.preventDefault();
    
    if (!formData.supplierId) {
      showToast('يرجى اختيار أو إضافة المورد أولاً ⚠️', 'warning');
      return;
    }

    if (!formData.warehouseId) {
      showToast('يرجى اختيار المستودع لاستلام البضاعة ⚠️', 'warning');
      return;
    }

    if (!items || items.length === 0) {
      showToast('يجب إضافة بند واحد على الأقل في الفاتورة ⚠️', 'warning');
      return;
    }

    if (formData.paidAmount > 0 && !formData.treasuryAccountId) {
      showToast('يرجى اختيار الخزينة أو البنك لسداد المبلغ المدفوع ⚠️', 'warning');
      return;
    }

    const validationResult = createPurchaseInvoiceSchema.safeParse({ 
        ...formData, 
        items: items.map(i => ({
            productId: i.productId,
            productName: i.productName,
            quantity: Number(i.quantity),
            unitPrice: Number(i.unitPrice),
            discount: Number(i.discount) || 0,
            discountPercent: Number(i.discountPercent) || 0,
            taxRate: Number(i.taxRate) || 0
        })),
        discountType: formData.discountType,
        discountValue: Number(formData.discountValue) || 0,
        discountAmount: invoiceCalculation.invoiceDiscountAmount,
        itemsDiscountAmount: invoiceCalculation.itemsDiscountTotal,
        attachments: attachments.map(a => ({
          id: a.id,
          file_name: a.file_name,
          file_path: a.file_path,
          file_type: a.file_type,
          file_size: a.file_size
        }))
    });

    if (!validationResult.success) {
        const firstError = validationResult.error.issues[0];
        showToast(firstError.message, 'warning');
        return;
    }

    // 🛡️ صمام أمان عدم القابلية للتعديل المباشر للفواتير المرحلة
    if (editingId && (formData.status === 'posted' || formData.status === 'paid')) {
      showToast('❌ لا يمكن تعديل فاتورة المشتريات المرحلة أو المسددة مباشرة حفاظاً على سلامة المخزون والدفاتر المحاسبية. يرجى إلغاء الترحيل أولاً لتحويلها إلى مسودة أو إنشاء مرتجع مشتريات.', 'warning');
      return;
    }

    isSubmittingRef.current = true;
    setSaving(true);

    if (currentUser?.role === 'demo') {
      showToast('تم حفظ فاتورة المشتريات بنجاح (محاكاة ديمو) ✅', 'success');
      isSubmittingRef.current = false;
      setSaving(false);
      return;
    }

    try {
      const explicitOrgId = currentSelectedOrgId || (currentUser as any)?.organization_id || (currentUser as any)?.user_metadata?.org_id;
      const userOrgId = getActiveOrgIdSync(explicitOrgId) || await resolveActiveOrgId(explicitOrgId);
      if (!userOrgId) throw new Error("تعذر تحديد هوية الشركة.");
      const invoiceNumber = formData.invoiceNumber || await getNextDocumentNumber(userOrgId, 'purchase_invoice');

      // 🛡️ صمام أمان محكم: التحقق من صحة معرف المستودع والمورد كـ UUID لمنع أخطاء قاعدة البيانات
      const isValidUUID = (id?: string | null) => Boolean(id && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id));

      let finalWarehouseId = formData.warehouseId;
      if (!isValidUUID(finalWarehouseId)) {
        const { data: realWh } = await supabase
          .from('warehouses')
          .select('id')
          .eq('organization_id', userOrgId)
          .limit(1)
          .maybeSingle();

        if (realWh?.id) {
          finalWarehouseId = realWh.id;
        } else {
          const { data: newWh, error: whErr } = await supabase
            .from('warehouses')
            .insert({ name: 'المستودع الرئيسي', organization_id: userOrgId, is_active: true })
            .select('id')
            .single();
          if (newWh?.id) {
            finalWarehouseId = newWh.id;
          } else {
            throw new Error('يرجى إنشاء مستودع حقيقي للشركة أولاً من إدارة المستودعات: ' + (whErr?.message || ''));
          }
        }
        setFormData(prev => ({ ...prev, warehouseId: finalWarehouseId }));
      }

      let finalSupplierId = formData.supplierId;
      if (!isValidUUID(finalSupplierId)) {
        const { data: realSup } = await supabase
          .from('suppliers')
          .select('id')
          .eq('organization_id', userOrgId)
          .limit(1)
          .maybeSingle();

        if (realSup?.id) {
          finalSupplierId = realSup.id;
        } else {
          const { data: newSup, error: supErr } = await supabase
            .from('suppliers')
            .insert({ name: 'مورد عام معتمد', organization_id: userOrgId })
            .select('id')
            .single();
          if (newSup?.id) {
            finalSupplierId = newSup.id;
          } else {
            throw new Error('يرجى اختيار أو إضافة مورد حقيقي للفاتورة: ' + (supErr?.message || ''));
          }
        }
        setFormData(prev => ({ ...prev, supplierId: finalSupplierId }));
      }

      const invoiceData = {
        organization_id: userOrgId,
        invoice_number: invoiceNumber,
        supplier_id: finalSupplierId,
        warehouse_id: finalWarehouseId,
        invoice_date: formData.date,
        total_amount: invoiceCalculation.totalAmount,
        tax_amount: invoiceCalculation.taxAmount,
        subtotal: Math.round((invoiceCalculation.totalAmount + invoiceCalculation.invoiceDiscountAmount - invoiceCalculation.taxAmount) * 100) / 100,
        discount_type: formData.discountType,
        discount_value: Number(formData.discountValue) || 0,
        discount_amount: invoiceCalculation.invoiceDiscountAmount,
        items_discount_amount: invoiceCalculation.itemsDiscountTotal,
        notes: formData.notes,
        status: 'draft',
        currency: formData.currency,
        exchange_rate: formData.exchangeRate,
        user_id: currentUser?.id,
        paid_amount: formData.paidAmount,
        treasury_account_id: (formData.paidAmount > 0 && isValidUUID(formData.treasuryAccountId)) ? formData.treasuryAccountId : null,
        attachments: attachments.map(a => ({
          id: a.id,
          file_name: a.file_name,
          file_path: a.file_path,
          file_type: a.file_type,
          file_size: a.file_size,
          created_at: a.created_at
        }))
      };

      // 🚀 ضمان إنشاء الأصناف الجديدة في المخزن تلقائياً إذا لم تكن موجودة مسبقاً
      for (const item of items) {
        if (!item.productId && item.productName) {
          const generatedSku = 'PRD-' + Math.floor(100000 + Math.random() * 900000);
          const { data: newProd, error: prodErr } = await supabase.from('products').insert({
            organization_id: userOrgId,
            name: item.productName,
            sku: generatedSku,
            purchase_price: Number(item.unitPrice) || 0,
            sales_price: Math.round((Number(item.unitPrice) || 0) * 1.25),
            product_type: 'STOCK',
            stock: 0
          }).select().single();

          if (!prodErr && newProd) {
            item.productId = newProd.id;
          }
        }
      }

      let invoiceId = editingId;

      const itemsToInsert = items.map((item, idx) => {
        const comp = invoiceCalculation.computedItems[idx];
        return {
          organization_id: userOrgId,
          product_id: item.productId,
          quantity: item.quantity,
          unit_price: item.unitPrice,
          uom_id: item.uomId || null,
          discount: Number(item.discount) || 0,
          discount_percent: Number(item.discountPercent) || 0,
          tax_rate: item.taxRate !== undefined ? item.taxRate : (settings.enableTax ? (settings.vatRate || 0) : 0),
          tax_amount: comp?.itemTax || 0,
          total: comp?.netBeforeInvoiceDiscount || item.total,
          batch_number: item.batchNumber || null,
          expiry_date: item.expiryDate || null
        };
      });

      // 🛡️ محاولة الحفظ والتعديل الذري للبنود ورأس الفاتورة عبر دالة قاعدة البيانات المحمية
      const payloadInvoice = { ...invoiceData, ...(editingId ? { id: editingId } : {}) };
      const { data: rpcSaved, error: rpcError } = await supabase.rpc('save_purchase_invoice_draft', {
        p_invoice: payloadInvoice,
        p_items: itemsToInsert
      });

      if (!rpcError && rpcSaved && rpcSaved.id) {
        invoiceId = rpcSaved.id;
      } else {
        // Fallback في حال عدم تشغيل دالة الهجرة بعد
        if (editingId) {
          // تحديث فاتورة موجودة: عكس القديم أولاً إذا كانت مرحلة
          const { data: oldInv } = await supabase.from('purchase_invoices').select('*, purchase_invoice_items(*)').eq('id', editingId).single();
          if (oldInv && oldInv.status === 'posted') {
            for (const oldItem of (oldInv.purchase_invoice_items || [])) {
              if (oldItem.product_id && oldItem.quantity) {
                const { data: prod } = await supabase.from('products').select('stock, warehouse_stock').eq('id', oldItem.product_id).single();
                if (prod) {
                  const newStock = Math.max(0, (Number(prod.stock) || 0) - Number(oldItem.quantity));
                  let newWStock = prod.warehouse_stock || {};
                  if (oldInv.warehouse_id && newWStock[oldInv.warehouse_id] !== undefined) {
                    newWStock[oldInv.warehouse_id] = Math.max(0, (Number(newWStock[oldInv.warehouse_id]) || 0) - Number(oldItem.quantity));
                  }
                  await supabase.from('products').update({ stock: newStock, warehouse_stock: newWStock }).eq('id', oldItem.product_id);
                }
              }
            }

            if (oldInv.related_journal_entry_id) {
              await supabase.from('journal_entries').delete().eq('id', oldInv.related_journal_entry_id);
            } else {
              await supabase.from('journal_entries').delete().eq('organization_id', userOrgId).eq('reference', oldInv.invoice_number);
            }
          }

          let safeInvoiceData: Record<string, any> = { ...invoiceData, related_journal_entry_id: null };
          let { error: updateError } = await supabase.from('purchase_invoices').update(safeInvoiceData).eq('id', editingId);

          if (updateError && updateError.code === '42703') {
            delete safeInvoiceData.discount_type;
            delete safeInvoiceData.discount_value;
            delete safeInvoiceData.items_discount_amount;
            delete safeInvoiceData.attachments;
            const retry = await supabase.from('purchase_invoices').update(safeInvoiceData).eq('id', editingId);
            updateError = retry.error;
          }

          if (updateError) throw updateError;
          
          await supabase.from('purchase_invoice_items').delete().eq('purchase_invoice_id', editingId);

          const itemsWithInv = itemsToInsert.map(it => ({ ...it, purchase_invoice_id: editingId }));
          let { error: itemsError } = await supabase.from('purchase_invoice_items').insert(itemsWithInv);
          if (itemsError && itemsError.code === '42703') {
            const stripped = itemsWithInv.map(({ discount, discount_percent, tax_rate, tax_amount, ...rest }) => rest);
            const retryItems = await supabase.from('purchase_invoice_items').insert(stripped);
            itemsError = retryItems.error;
          }
          if (itemsError) throw itemsError;

        } else {
          let safeInvoiceData: Record<string, any> = { ...invoiceData };
          let { data: invoice, error: insertError } = await supabase.from('purchase_invoices').insert(safeInvoiceData).select().single();
          if (insertError && insertError.code === '42703') {
            delete safeInvoiceData.discount_type;
            delete safeInvoiceData.discount_value;
            delete safeInvoiceData.items_discount_amount;
            delete safeInvoiceData.attachments;
            const retry = await supabase.from('purchase_invoices').insert(safeInvoiceData).select().single();
            invoice = retry.data;
            insertError = retry.error;
          }
          if (insertError) throw insertError;
          invoiceId = invoice?.id;

          const itemsWithInv = itemsToInsert.map(it => ({ ...it, purchase_invoice_id: invoiceId }));
          let { error: itemsError } = await supabase.from('purchase_invoice_items').insert(itemsWithInv);
          if (itemsError && itemsError.code === '42703') {
            const stripped = itemsWithInv.map(({ discount, discount_percent, tax_rate, tax_amount, ...rest }) => rest);
            const retryItems = await supabase.from('purchase_invoice_items').insert(stripped);
            itemsError = retryItems.error;
          }
          if (itemsError) throw itemsError;
        }
      }

      // 📎 رفع المرفقات المعلقة وحفظها عند نجاح حفظ الفاتورة لأول مرة
      if (invoiceId && attachments.some(a => a.is_pending && a.file)) {
        const updatedAtts = [...attachments];
        for (let i = 0; i < updatedAtts.length; i++) {
          const item = updatedAtts[i];
          if (item.is_pending && item.file) {
            try {
              const cleanName = item.file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
              const filePath = `purchase_invoices/${invoiceId}/${Date.now()}_${cleanName}`;
              const { error: upErr } = await supabase.storage
                .from('finance_docs')
                .upload(filePath, item.file, { upsert: true });

              if (!upErr) {
                const { data: pubData } = supabase.storage.from('finance_docs').getPublicUrl(filePath);
                item.file_path = filePath;
                item.url = pubData?.publicUrl;
                item.is_pending = false;
                delete item.file;

                try {
                  const { data: dbAtt } = await supabase.from('purchase_invoice_attachments').insert({
                    purchase_invoice_id: invoiceId,
                    organization_id: userOrgId,
                    file_path: filePath,
                    file_name: item.file_name,
                    file_type: item.file_type,
                    file_size: item.file_size
                  }).select('id').maybeSingle();
                  if (dbAtt?.id) item.id = dbAtt.id;
                } catch (dbAttErr) {
                  logger.warn('Non-blocking db attachment insert:', dbAttErr);
                }
              }
            } catch (attErr) {
              logger.warn('Error uploading pending attachment:', attErr);
            }
          }
        }
        setAttachments(updatedAtts);
        try {
          await supabase.from('purchase_invoices').update({
            attachments: updatedAtts.map(a => ({
              id: a.id,
              file_name: a.file_name,
              file_path: a.file_path,
              file_type: a.file_type,
              file_size: a.file_size,
              created_at: a.created_at
            }))
          }).eq('id', invoiceId);
        } catch (e) {}
      }

      if (post && invoiceId) {
        await approvePurchaseInvoice(invoiceId, userOrgId, finalWarehouseId);
        showToast('تم حفظ وترحيل فاتورة المشتريات وتحديث المخزون بنجاح ✅', 'success');
      } else {
        showToast(editingId ? 'تم تحديث فاتورة المشتريات كمسودة بنجاح ✅' : 'تم حفظ فاتورة المشتريات كمسودة بنجاح ✅', 'success');
      }

      // 🛡️ تسجيل العملية في سجل التدقيق والتتبع
      if (invoiceId) {
        logDocumentAction({
          documentType: 'purchase_invoice',
          documentId: invoiceId,
          action: post ? 'posted' : (editingId ? 'updated' : 'created'),
          details: {
            invoice_number: formData.invoiceNumber,
            total_amount: invoiceCalculation.totalAmount,
            supplier_id: formData.supplierId,
            items_count: items.length,
            note: post ? `تم ترحيل الفاتورة رقم ${formData.invoiceNumber} بقيمة ${invoiceCalculation.totalAmount.toLocaleString()} ج.م` : (editingId ? `تم تعديل الفاتورة رقم ${formData.invoiceNumber}` : `تم إنشاء الفاتورة رقم ${formData.invoiceNumber}`)
          },
          userId: currentUser?.id,
          userName: (currentUser as any)?.name || (currentUser as any)?.email || 'المستخدم'
        });
      }

      try {
        secureStorage.removeItem('tripro_purchase_invoice_draft');
      } catch (e) {}

      await fetchInvoiceIds();
      if (invoiceId) {
        loadInvoiceById(invoiceId);
      }

    } catch (error) {
      logger.error(error);
      showToast('فشل حفظ الفاتورة: ' + error.message, 'error');
    } finally {
      isSubmittingRef.current = false;
      setSaving(false);
    }
  };

  const handleUnpostInvoice = async () => {
    if (!editingId) return;

    if (!canUnpost) {
      showToast('عفواً، لا تملك الصلاحية اللازمة لإلغاء ترحيل فواتير المشتريات. يرجى مراجعة الإدارة المالية.', 'error');
      return;
    }

    if (!window.confirm(`هل أنت متأكد من إلغاء ترحيل فاتورة المشتريات رقم (${formData.invoiceNumber})؟\n\nسيتم:\n1- عكس حركة المخزون وخصم الكميات المضافة.\n2- حذف القيد المحاسبي من دفتر اليومية بالكامل.\n3- تحويل الفاتورة إلى مسودة (Draft) لتتمكن من تعديلها بحرية.`)) {
      return;
    }

    setSaving(true);
    try {
      const explicitOrgId = currentSelectedOrgId || currentUser?.organization_id;
      const userOrgId = getActiveOrgIdSync(explicitOrgId) || await resolveActiveOrgId(explicitOrgId);

      // 🛡️ التنفيذ الذري الحصري عبر دالة السيرفر (بدون مسار احتياطي يمسح ربط القيد ويترك قيوداً يتيمة)
      await unpostPurchaseInvoice(editingId, userOrgId || undefined);
      setFormData(prev => ({ ...prev, status: 'draft' }));
      logDocumentAction({
        documentType: 'purchase_invoice',
        documentId: String(editingId),
        action: 'unposted',
        details: {
          invoice_number: formData.invoiceNumber,
          total_amount: invoiceCalculation.totalAmount,
          note: `إلغاء ترحيل فاتورة المشتريات رقم ${formData.invoiceNumber} وتحويلها لمسودة`
        },
        userId: currentUser?.id,
        userName: currentUser?.full_name || 'مستخدم',
        organizationId: userOrgId
      });
      showToast('تم إلغاء ترحيل فاتورة المشتريات بنجاح وتحويلها لمسودة جاهزة للتعديل ✅', 'success');

    } catch (err: unknown) {
      logger.error('Error unposting purchase invoice:', err);
      const errMsg = err instanceof Error ? err.message : (err as { message?: string })?.message || 'خطأ غير متوقع';
      showToast('فشل إلغاء ترحيل الفاتورة: ' + errMsg, 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteCurrent = async () => {
    if (!editingId) return;

    // 🛡️ صمام أمان عدم القابلية للتغيير (Document Immutability Guard)
    if (formData.status === 'posted' || formData.status === 'paid') {
      showToast('❌ لا يمكن حذف فاتورة المشتريات المرحلة أو المسددة مباشرة حفاظاً على سلامة المخزون والدفاتر المحاسبية. يرجى إلغاء الترحيل أولاً لتحويلها إلى مسودة أو إنشاء مرتجع مشتريات.', 'error');
      return;
    }

    if (!window.confirm(`هل أنت متأكد من حذف مسودة فاتورة المشتريات رقم (${formData.invoiceNumber})؟`)) {
      return;
    }

    setDeleting(true);
    try {
      const explicitOrgId = currentSelectedOrgId || currentUser?.organization_id;
      const userOrgId = getActiveOrgIdSync(explicitOrgId) || await resolveActiveOrgId(explicitOrgId);

      // 🛡️ 1. محاولة الحذف الذري الشامل أولاً عبر دالة السيرفر
      try {
        await deletePurchaseInvoice(editingId, userOrgId || undefined);
        showToast('تم حذف مسودة فاتورة المشتريات بنجاح ✅', 'success');
        logDocumentAction({
          documentType: 'purchase_invoice',
          documentId: String(editingId),
          action: 'deleted',
          details: {
            invoice_number: formData.invoiceNumber,
            total_amount: invoiceCalculation.totalAmount,
            note: `حذف مسودة فاتورة المشتريات رقم ${formData.invoiceNumber}`
          },
          userId: currentUser?.id,
          userName: (currentUser as any)?.name || (currentUser as any)?.email,
          organizationId: userOrgId
        });

        const newIds = invoiceIds.filter(id => id !== editingId);
        setInvoiceIds(newIds);

        if (newIds.length > 0) {
          const nextId = newIds[Math.min(currentIndex, newIds.length - 1)];
          loadInvoiceById(nextId);
        } else {
          handleNewInvoice();
        }
        return;
      } catch (rpcErr) {
        logger.warn('Atomic delete RPC unavailable, attempting client fallback:', rpcErr);
      }

      await supabase.from('purchase_invoice_items').delete().eq('purchase_invoice_id', editingId);
      let delInvQuery = supabase.from('purchase_invoices').delete().eq('id', editingId);
      if (userOrgId) delInvQuery = delInvQuery.eq('organization_id', userOrgId);
      const { error: delErr } = await delInvQuery;
      if (delErr) throw delErr;

      showToast('تم حذف مسودة فاتورة المشتريات بنجاح ✅', 'success');
      logDocumentAction({
        documentType: 'purchase_invoice',
        documentId: String(editingId),
        action: 'deleted',
        details: {
          invoice_number: formData.invoiceNumber,
          total_amount: invoiceCalculation.totalAmount,
          note: `حذف مسودة فاتورة المشتريات رقم ${formData.invoiceNumber}`
        },
        userId: currentUser?.id,
        userName: (currentUser as any)?.name || (currentUser as any)?.email,
        organizationId: userOrgId
      });

      const newIds = invoiceIds.filter(id => id !== editingId);
      setInvoiceIds(newIds);

      if (newIds.length > 0) {
        const nextId = newIds[Math.min(currentIndex, newIds.length - 1)];
        loadInvoiceById(nextId);
      } else {
        handleNewInvoice();
      }

    } catch (err) {
      logger.error('Error deleting purchase invoice:', err);
      showToast('فشل حذف الفاتورة: ' + err.message, 'error');
    } finally {
      setDeleting(false);
    }
  };

  const handlePrintCurrent = () => {
    const invoiceData = {
      invoiceNumber: formData.invoiceNumber,
      date: formData.date,
      supplierName: suppliers.find(s => s.id === formData.supplierId)?.name || 'مورد عام',
      warehouseName: warehouses.find(w => w.id === formData.warehouseId)?.name || '-',
      notes: formData.notes,
      grossTotal: invoiceCalculation.grossTotal,
      itemsDiscountTotal: invoiceCalculation.itemsDiscountTotal,
      subtotal: invoiceCalculation.subtotalBeforeInvoiceDiscount,
      discountType: formData.discountType,
      discountValue: formData.discountValue,
      discountAmount: invoiceCalculation.invoiceDiscountAmount,
      totalDiscount: invoiceCalculation.totalDiscount,
      taxableBase: invoiceCalculation.taxableBase,
      totalAmount: invoiceCalculation.totalAmount,
      taxAmount: invoiceCalculation.taxAmount,
      paidAmount: formData.paidAmount,
      items: items.map((item, idx) => {
        const comp = invoiceCalculation.computedItems[idx];
        return {
          productName: item.productName || products.find(p => p.id === item.productId)?.name || 'صنف',
          uomName: uoms.find(u => u.id === item.uomId)?.name || '-',
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          discount: item.discount || 0,
          discountPercent: item.discountPercent || 0,
          taxRate: item.taxRate || 0,
          taxAmount: comp?.itemTax || 0,
          total: comp?.netBeforeInvoiceDiscount || item.total
        };
      })
    };

    setInvoiceToPrint(invoiceData);
    if (editingId) {
      logDocumentAction({
        documentType: 'purchase_invoice',
        documentId: editingId,
        action: 'printed',
        details: {
          invoice_number: formData.invoiceNumber,
          note: `تمت طباعة فاتورة المشتريات رقم ${formData.invoiceNumber}`
        },
        userId: currentUser?.id,
        userName: (currentUser as any)?.name || (currentUser as any)?.email || 'المستخدم'
      });
    }
    setTimeout(() => {
      window.print();
      setInvoiceToPrint(null);
    }, 200);
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6 animate-in fade-in">
      <PurchaseInvoiceHeader
        warehousesCount={warehouses.length}
        editingId={editingId}
        invoiceNumber={formData.invoiceNumber}
        status={formData.status}
        loadingInvoice={loadingInvoice}
        invoiceIdsLength={invoiceIds.length}
        currentIndex={currentIndex}
        itemsLength={items.length}
        deleting={deleting}
        saving={saving}
        canUnpost={canUnpost}
        onNavigateToWarehouses={() => navigate('/warehouses')}
        onNavigateRecord={handleNavigate}
        onOpenList={() => navigate('/purchase-invoices-list')}
        onNewInvoice={handleNewInvoice}
        onDuplicateInvoice={handleDuplicateCurrentInvoice}
        onOpenOCRModal={() => setIsOCRModalOpen(true)}
        onPrintCurrent={handlePrintCurrent}
        onDeleteCurrent={handleDeleteCurrent}
        onUnpostInvoice={handleUnpostInvoice}
        onSaveAndPost={() => handleSave(undefined, true)}
      />

      <fieldset disabled={formData.status === 'posted' || formData.status === 'paid'} className="space-y-6">
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="md:col-span-3">
              <SupplierSearchSelect
                value={formData.supplierId}
                onChange={(supplierId) => setFormData(prev => ({ ...prev, supplierId }))}
                suppliers={suppliers}
                required
                theme="emerald"
                disabled={formData.status === 'posted'}
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">تاريخ الفاتورة <span className="text-red-500">*</span></label>
              <input type="date" required value={formData.date} onChange={e => setFormData({...formData, date: e.target.value})} className="w-full border rounded-xl p-2.5 bg-slate-50 focus:bg-white text-sm font-bold outline-none focus:border-emerald-500" />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">رقم فاتورة المورد</label>
              <input type="text" value={formData.invoiceNumber} onChange={e => setFormData({...formData, invoiceNumber: e.target.value})} className="w-full border rounded-xl p-2.5 bg-slate-50 focus:bg-white text-sm font-mono font-bold outline-none focus:border-emerald-500" placeholder="رقم الفاتورة الأصلي" />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">المستودع (لاستلام البضاعة) <span className="text-red-500">*</span></label>
              <select required value={formData.warehouseId} onChange={e => setFormData({...formData, warehouseId: e.target.value})} className="w-full border rounded-xl p-2.5 bg-slate-50 focus:bg-white text-sm font-bold outline-none focus:border-emerald-500">
                <option value="">-- اختر المستودع --</option>
                {warehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">المبلغ المدفوع (سداد فوري)</label>
              <input 
                type="number" 
                step="any"
                value={formData.paidAmount} 
                onChange={e => setFormData({...formData, paidAmount: parseFloat(e.target.value) || 0})} 
                className="w-full border rounded-xl p-2.5 bg-slate-50 focus:bg-white text-sm font-mono font-bold text-emerald-600 outline-none focus:border-emerald-500" 
                placeholder="0.00"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">حساب الدفع</label>
              <select value={formData.treasuryAccountId} onChange={e => setFormData({...formData, treasuryAccountId: e.target.value})} className="w-full border rounded-xl p-2.5 bg-slate-50 focus:bg-white text-sm outline-none focus:border-emerald-500" disabled={formData.paidAmount <= 0}>
                <option value="">-- اختر الخزينة / البنك --</option>
                {treasuryAccounts.map(acc => <option key={acc.id} value={acc.id}>{acc.name} ({acc.code})</option>)}
              </select>
            </div>
            <div className="md:col-span-3">
              <label className="block text-xs font-bold text-slate-700 mb-1">ملاحظات الفاتورة</label>
              <input type="text" value={formData.notes} onChange={e => setFormData({...formData, notes: e.target.value})} placeholder="أدخل أي ملاحظات إضافية..." className="w-full border rounded-xl p-2.5 bg-slate-50 focus:bg-white text-sm outline-none focus:border-emerald-500" />
            </div>
          </div>
        </div>

        {/* 📎 مرفقات فاتورة المشتريات (مستندات المورد، إشعار الخصم، بوليصة الشحن) */}
        <PurchaseInvoiceAttachments
          invoiceId={editingId}
          organizationId={(currentUser as any)?.organization_id || (currentUser as any)?.user_metadata?.org_id}
          attachments={attachments}
          onChange={setAttachments}
          readOnly={formData.status === 'posted'}
        />

        {/* Product Search & Items */}
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 space-y-4">
          <PurchaseInvoiceItemsTable
            productSearchTerm={productSearchTerm}
            showProductResults={showProductResults}
            filteredProducts={filteredProducts}
            items={items}
            products={products}
            uoms={uoms}
            currency={settings.currency || 'ج.م'}
            onSearchTermChange={(val) => { setProductSearchTerm(val); setShowProductResults(true); }}
            onSearchKeyDown={handleSearchKeyDown}
            onOpenAddProductModal={handleOpenAddProductModal}
            onAddProductToInvoice={(p) => addProductToInvoice(p)}
            onOpenEditProductModal={handleOpenEditProductModal}
            onItemChange={handleItemChange}
            onRemoveItem={removeItem}
            onMissingProductEdit={() => showToast('تعذر العثور على بيانات الصنف', 'warning')}
          />

          <PurchaseInvoiceTotalsSection
            items={items}
            discountType={formData.discountType}
            discountValue={formData.discountValue}
            paidAmount={formData.paidAmount}
            currency={settings.currency || 'ج.م'}
            enableTax={Boolean(settings.enableTax)}
            vatRate={Number(settings.vatRate) || 14}
            invoiceCalculation={invoiceCalculation}
            onDiscountTypeChange={(discountType) => setFormData({ ...formData, discountType })}
            onDiscountValueChange={(discountValue) => setFormData({ ...formData, discountValue })}
          />

          {/* 📎 قسم مرفقات الفاتورة (أصل فاتورة المورد، إيصالات الاستلام، فواتير إلكترونية ETA) */}
          <div className="border-t border-slate-200 pt-4">
            <PurchaseInvoiceAttachments
              invoiceId={editingId}
              organizationId={getActiveOrgIdSync(currentSelectedOrgId || (currentUser as any)?.organization_id) || currentSelectedOrgId || (currentUser as any)?.organization_id}
              attachments={attachments}
              onChange={setAttachments}
              readOnly={formData.status === 'posted'}
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            {(formData.status === 'posted' || formData.status === 'paid') ? (
              canUnpost && (
                <button 
                  type="button" 
                  onClick={handleUnpostInvoice} 
                  disabled={saving} 
                  className="bg-amber-600 text-white hover:bg-amber-700 px-6 py-2.5 rounded-xl font-bold text-xs flex items-center gap-1.5 transition-colors shadow-sm disabled:opacity-50"
                  title="إلغاء ترحيل الفاتورة وإعادتها لمسودة قابلة للتعديل"
                >
                  {saving ? <Loader2 className="animate-spin" size={16} /> : <Unlock size={16} />} 
                  إلغاء الترحيل للتعديل 🔓
                </button>
              )
            ) : (
              <>
                <button 
                  type="button" 
                  onClick={(e) => handleSave(e, false)} 
                  disabled={saving} 
                  className="bg-slate-100 text-slate-700 hover:bg-slate-200 px-6 py-2.5 rounded-xl font-bold text-xs flex items-center gap-1.5 transition-colors disabled:opacity-50"
                >
                  <Save size={16} /> حفظ كمسودة
                </button>
                <button 
                  type="button" 
                  onClick={(e) => handleSave(e, true)} 
                  disabled={saving} 
                  className="bg-emerald-600 text-white hover:bg-emerald-700 px-6 py-2.5 rounded-xl font-bold text-xs flex items-center gap-1.5 transition-colors shadow-sm disabled:opacity-50"
                >
                  {saving ? <Loader2 className="animate-spin" size={16} /> : <CheckCircle size={16} />} 
                  {editingId ? 'حفظ وتحديث الفاتورة' : 'حفظ وترحيل الفاتورة'}
                </button>
              </>
            )}
          </div>

        </div>
      </fieldset>

      {/* 🕒 سجل التدقيق والتتبع الزمني */}
      {editingId && (
        <DocumentAuditTimeline
          documentType="purchase_invoice"
          documentId={editingId}
          documentCreatedAt={invoiceCreatedAt}
          creatorName={creatorName}
        />
      )}

      {/* 📸 نافذة المسح الذكي للفواتير بالذكاء الاصطناعي */}
      <InvoiceOCRScannerModal
        isOpen={isOCRModalOpen}
        onClose={() => setIsOCRModalOpen(false)}
        products={products}
        suppliers={suppliers}
        onApplyData={handleApplyOCRData}
      />

      {/* 📦 كارت الصنف (إضافة صنف جديد أو تعديل صنف حالي من شاشة فاتورة الشراء) */}
      <ProductFormModal
        isOpen={isProductModalOpen}
        onClose={() => setIsProductModalOpen(false)}
        editingId={editingProductId}
        formData={productFormData}
        setFormData={setProductFormData}
        handleSubmit={handleProductFormSubmit}
        handleImageUpload={handleProductImageUpload}
        uploading={productFormUploading}
        categories={categories || []}
        warehouses={warehouses || []}
        uoms={uoms || []}
        suppliers={suppliers || []}
        hasSupplierColumn={true}
        hasEtaColumns={true}
        settings={settings || {}}
        accounts={{
          assets: (accounts || []).filter(a => String(a.type).toLowerCase() === 'asset'),
          expenses: (accounts || []).filter(a => String(a.type).toLowerCase() === 'expense'),
          revenue: (accounts || []).filter(a => String(a.type).toLowerCase() === 'revenue'),
        }}
        recipeCost={0}
        existingOpenings={[]}
        generateUniqueSku={generateUniqueSku}
        generateUniqueBarcode={generateUniqueBarcode}
        handleAddCategory={() => showToast('يمكنك اختيار التصنيف من القائمة أو إدارته من شاشة المنتجات', 'info')}
        handleEditCategory={() => {}}
        handleDeleteCategory={async () => {}}
        getSystemAccount={getSystemAccount || (() => null)}
      />

      {/* Hidden printable component */}
      {invoiceToPrint && (
        <PurchaseInvoicePrint invoiceData={invoiceToPrint} companySettings={companySettings} />
      )}
    </div>
  );
};

export default PurchaseInvoiceForm;

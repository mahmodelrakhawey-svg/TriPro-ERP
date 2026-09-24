import React, { useState, useEffect, useMemo } from 'react';
import { useAccounting } from '../../context/AccountingContext';
import { useToast } from '../../context/ToastContext';
import { 
    Plus, Trash2, Save, ShoppingCart, Search, AlertCircle,
    Loader2, CheckCircle, Package, Ruler, List, 
    Printer, ChevronRight, ChevronLeft, ChevronsRight, ChevronsLeft,
    DollarSign, Activity, FileText, Sparkles, Percent, Tag, Paperclip
} from 'lucide-react';
import { Product } from '../../types';
import { supabase } from '../../supabaseClient';
import { useNavigate, useLocation } from 'react-router-dom';
import { createPurchaseInvoiceSchema } from '../../utils/validationSchemas';
import { PurchaseInvoicePrint } from './PurchaseInvoicePrint';
import { secureStorage } from '../../utils/securityMiddleware';
import InvoiceOCRScannerModal from '../../components/InvoiceOCRScannerModal';
import DocumentAuditTimeline from '../../components/DocumentAuditTimeline';
import { logDocumentAction } from '../../services/auditService';
import { getNextDocumentNumber } from '../../services/sequenceService';
import SupplierSearchSelect from '../../components/SupplierSearchSelect';
import { calculatePurchaseInvoiceTotals } from './purchaseInvoiceUtils';
import PurchaseInvoiceAttachments, { PurchaseAttachmentItem } from './components/PurchaseInvoiceAttachments';

const PurchaseInvoiceForm = () => {
  const { products, warehouses, suppliers, approvePurchaseInvoice, settings, can, currentUser, addDemoPurchaseInvoice, accounts } = useAccounting();
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
  const [deleting, setDeleting] = useState(false);
  const [productSearchTerm, setProductSearchTerm] = useState('');
  const [showProductResults, setShowProductResults] = useState(false);
  const [isOCRModalOpen, setIsOCRModalOpen] = useState(false);

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
      const { data: { session } } = await supabase.auth.getSession();
      const userOrgId = session?.user?.user_metadata?.org_id;
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
      console.error('Error fetching purchase invoice IDs:', err);
    }
  };

  useEffect(() => {
    fetchInvoiceIds();
  }, []);

  // تحميل الوحدات
  useEffect(() => {
    const fetchUoms = async () => {
      const orgId = (currentUser as any)?.organization_id;
      const { data } = await supabase.from('uoms').select('*').eq('organization_id', orgId);
      if (data) setUoms(data);
    };
    if (currentUser) fetchUoms();
  }, [currentUser]);

  // حسابات الخزينة
  const treasuryAccounts = useMemo(() => {
    return accounts.filter(a => 
      !a.isGroup && (
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
      const { data: fullInv, error: invError } = await supabase
        .from('purchase_invoices')
        .select(`
          *,
          suppliers(id, name, phone),
          warehouses(id, name),
          purchase_invoice_items(id, product_id, quantity, unit_price, total, uom_id, batch_number, expiry_date, products(name, sku, purchase_price, base_uom_id, tax_rate_override))
        `)
        .eq('id', id)
        .single();

      if (invError) throw invError;
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

      const formattedItems = (fullInv.purchase_invoice_items || []).map((i: any) => {
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
        const disc = Number(i.discount) || 0;
        const discPct = Number(i.discount_percent) || (gross > 0 && disc > 0 ? Number(((disc / gross) * 100).toFixed(2)) : 0);

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
        console.warn('Non-blocking attachments fetch:', attErr);
      }
      setAttachments(loadedAtts);

      const idx = invoiceIds.indexOf(id);
      if (idx !== -1) setCurrentIndex(idx);

    } catch (err: any) {
      console.error('Error loading purchase invoice:', err);
      showToast('فشل تحميل الفاتورة: ' + err.message, 'error');
    } finally {
      setLoadingInvoice(false);
    }
  };

  // استقبال فاتورة محالة من السجل
  useEffect(() => {
    if (location.state && (location.state as any).invoiceToEdit) {
      const inv = (location.state as any).invoiceToEdit;
      loadInvoiceById(inv.id);
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
            const hydrated = parsed.items.map((it: any) => {
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
        console.warn('Failed to parse purchase draft from secureStorage', e);
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

  const filteredProducts = useMemo(() => {
      const term = productSearchTerm.trim().toLowerCase();
      if (!term) return [];
      
      return products
          .filter(p =>
              p.name.toLowerCase().includes(term) ||
              (p.sku && p.sku.toLowerCase().includes(term)) ||
              (p.barcode && p.barcode.toLowerCase().includes(term)) ||
              ((p as any).barcode2 && (p as any).barcode2.toLowerCase().includes(term)) ||
              (Array.isArray((p as any).unit_barcodes) && (p as any).unit_barcodes.some((ub: any) => ub.barcode && ub.barcode.toLowerCase().includes(term)))
          )
          .sort((a, b) => {
              const aName = a.name.toLowerCase();
              const bName = b.name.toLowerCase();
              const aStarts = aName.startsWith(term);
              const bStarts = bName.startsWith(term);
              if (aStarts && !bStarts) return -1;
              if (!aStarts && bStarts) return 1;
              return aName.localeCompare(bName);
          })
          .slice(0, 10);
  }, [productSearchTerm, products]);

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
                const foundUom = (p as any).unit_barcodes.find((ub: any) => ub.barcode && ub.barcode.trim().toLowerCase() === term);
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
            const foundUom = (exactMatch as any).unit_barcodes.find((ub: any) => ub.barcode && ub.barcode.trim().toLowerCase() === term);
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

  const handleApplyOCRData = (ocrResult: any) => {
    setFormData(prev => ({
      ...prev,
      supplierId: ocrResult.supplierId || prev.supplierId,
      invoiceNumber: ocrResult.invoiceNumber || prev.invoiceNumber,
      date: ocrResult.date || prev.date,
      notes: ocrResult.notes || prev.notes
    }));

    if (ocrResult.items && ocrResult.items.length > 0) {
      const itemsWithTax = ocrResult.items.map((it: any) => {
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

  const handleItemChange = (index: number, field: string, value: any) => {
    const newItems = [...items];
    newItems[index][field] = value;

    if (field === 'discount') {
      const gross = (Number(newItems[index].quantity) || 0) * (Number(newItems[index].unitPrice) || 0);
      const disc = Math.max(0, parseFloat(value) || 0);
      newItems[index].discount = disc;
      newItems[index].discountPercent = gross > 0 ? Number(((disc / gross) * 100).toFixed(2)) : 0;
    }

    if (field === 'discountPercent') {
      const gross = (Number(newItems[index].quantity) || 0) * (Number(newItems[index].unitPrice) || 0);
      const pct = Math.max(0, Math.min(100, parseFloat(value) || 0));
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
      newItems[index].taxRate = Math.max(0, Math.min(100, parseFloat(value) || 0));
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

    setSaving(true);

    if (currentUser?.role === 'demo') {
      showToast('تم حفظ فاتورة المشتريات بنجاح (محاكاة ديمو) ✅', 'success');
      setSaving(false);
      return;
    }

    try {
      const userOrgId = (currentUser as any)?.organization_id || (currentUser as any)?.user_metadata?.org_id;
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
        subtotal: invoiceCalculation.subtotalBeforeInvoiceDiscount,
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

          let safeInvoiceData: any = { ...invoiceData, related_journal_entry_id: null };
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
          let safeInvoiceData: any = { ...invoiceData };
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
                  console.warn('Non-blocking db attachment insert:', dbAttErr);
                }
              }
            } catch (attErr) {
              console.warn('Error uploading pending attachment:', attErr);
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

    } catch (error: any) {
      console.error(error);
      showToast('فشل حفظ الفاتورة: ' + error.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteCurrent = async () => {
    if (!editingId) return;

    if (!window.confirm(`هل أنت متأكد من حذف فاتورة المشتريات رقم (${formData.invoiceNumber})؟\nسيتم إلغاء أثرها على المخزون والقيد المحاسبي بالكامل.`)) {
      return;
    }

    setDeleting(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const userOrgId = session?.user?.user_metadata?.org_id;

      const { data: inv } = await supabase.from('purchase_invoices').select('*, purchase_invoice_items(*)').eq('id', editingId).single();
      if (inv && inv.status === 'posted') {
        for (const item of (inv.purchase_invoice_items || [])) {
          if (item.product_id && item.quantity) {
            const { data: prod } = await supabase.from('products').select('stock, warehouse_stock').eq('id', item.product_id).single();
            if (prod) {
              const newStock = Math.max(0, (Number(prod.stock) || 0) - Number(item.quantity));
              let newWStock = prod.warehouse_stock || {};
              if (inv.warehouse_id && newWStock[inv.warehouse_id] !== undefined) {
                newWStock[inv.warehouse_id] = Math.max(0, (Number(newWStock[inv.warehouse_id]) || 0) - Number(item.quantity));
              }
              await supabase.from('products').update({ stock: newStock, warehouse_stock: newWStock }).eq('id', item.product_id);
            }
          }
        }

        if (inv.related_journal_entry_id) {
          await supabase.from('journal_entries').delete().eq('id', inv.related_journal_entry_id);
        } else {
          await supabase.from('journal_entries').delete().eq('organization_id', userOrgId).eq('reference', inv.invoice_number);
        }
      }

      await supabase.from('purchase_invoice_items').delete().eq('purchase_invoice_id', editingId);
      const { error: delErr } = await supabase.from('purchase_invoices').delete().eq('id', editingId);
      if (delErr) throw delErr;

      showToast('تم حذف فاتورة المشتريات وعكس الحركات بنجاح ✅', 'success');

      const newIds = invoiceIds.filter(id => id !== editingId);
      setInvoiceIds(newIds);

      if (newIds.length > 0) {
        const nextId = newIds[Math.min(currentIndex, newIds.length - 1)];
        loadInvoiceById(nextId);
      } else {
        handleNewInvoice();
      }

    } catch (err: any) {
      console.error('Error deleting purchase invoice:', err);
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
      
      {/* تنبيه للمستودعات */}
      {warehouses.length === 0 && (
        <div className="bg-amber-50 border-2 border-amber-200 p-5 rounded-2xl mb-4 flex flex-col md:flex-row items-center justify-between gap-4 animate-in slide-in-from-top-4 shadow-sm">
          <div className="flex items-center gap-4">
            <div className="bg-amber-100 p-3 rounded-2xl">
              <AlertCircle className="text-amber-600" size={28} />
            </div>
            <div>
              <h4 className="font-black text-amber-900 text-lg">تنبيه: لم يتم إعداد المخازن بعد</h4>
              <p className="text-amber-700 font-medium">يرجى إضافة مستودع واحد على الأقل لاستلام المشتريات عليه.</p>
            </div>
          </div>
          <button 
            onClick={() => navigate('/warehouses')} 
            className="bg-amber-600 text-white px-6 py-3 rounded-2xl font-black hover:bg-amber-700 transition-all shadow-md flex items-center gap-2 whitespace-nowrap"
          >
            <Plus size={20} /> إضافة مستودع الآن
          </button>
        </div>
      )}

      {/* 🚀 Header & Navigation Bar */}
      <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-200 flex flex-col md:flex-row justify-between items-center gap-4">
        
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-emerald-50 text-emerald-600 rounded-xl">
            <ShoppingCart size={24} />
          </div>
          <div>
            <h2 className="text-xl font-black text-slate-800 flex items-center gap-2">
              {editingId ? `فاتورة مشتريات: ${formData.invoiceNumber}` : 'فاتورة مشتريات جديدة'}
              {editingId && (
                <span className={`text-xs px-2.5 py-0.5 rounded-full font-bold ${
                  formData.status === 'posted' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
                }`}>
                  {formData.status === 'posted' ? 'مرحلة ✅' : 'مسودة 📝'}
                </span>
              )}
            </h2>
            <p className="text-xs text-slate-400 font-bold">تسجيل استلام بضاعة وفواتير الموردين وتحديث المخزون</p>
          </div>
        </div>

        {/* 🧭 أسهم التنقل بين الفواتير */}
        <div className="flex items-center gap-1 bg-slate-50 p-1.5 rounded-xl border border-slate-200">
          <button 
            type="button" 
            onClick={() => handleNavigate('first')} 
            disabled={invoiceIds.length === 0 || currentIndex === 0} 
            title="أول فاتورة"
            className="p-2 text-slate-600 hover:bg-white hover:text-emerald-600 rounded-lg transition-all disabled:opacity-30 disabled:hover:bg-transparent"
          >
            <ChevronsRight size={18} />
          </button>
          
          <button 
            type="button" 
            onClick={() => handleNavigate('prev')} 
            disabled={invoiceIds.length === 0 || currentIndex <= 0} 
            title="الفاتورة السابقة"
            className="p-2 text-slate-600 hover:bg-white hover:text-emerald-600 rounded-lg transition-all disabled:opacity-30 disabled:hover:bg-transparent"
          >
            <ChevronRight size={18} />
          </button>

          {/* Record Counter */}
          <div className="px-3 py-1 bg-white border border-slate-200 rounded-lg text-xs font-mono font-black text-slate-700 select-none">
            {loadingInvoice ? (
              <Loader2 size={14} className="animate-spin text-emerald-600" />
            ) : editingId && currentIndex !== -1 ? (
              <span>{currentIndex + 1} / {invoiceIds.length}</span>
            ) : (
              <span className="text-emerald-600 font-bold">جديد ➕</span>
            )}
          </div>

          <button 
            type="button" 
            onClick={() => handleNavigate('next')} 
            disabled={invoiceIds.length === 0 || currentIndex >= invoiceIds.length - 1 || currentIndex === -1} 
            title="الفاتورة التالية"
            className="p-2 text-slate-600 hover:bg-white hover:text-emerald-600 rounded-lg transition-all disabled:opacity-30 disabled:hover:bg-transparent"
          >
            <ChevronLeft size={18} />
          </button>

          <button 
            type="button" 
            onClick={() => handleNavigate('last')} 
            disabled={invoiceIds.length === 0 || currentIndex >= invoiceIds.length - 1 || currentIndex === -1} 
            title="آخر فاتورة"
            className="p-2 text-slate-600 hover:bg-white hover:text-emerald-600 rounded-lg transition-all disabled:opacity-30 disabled:hover:bg-transparent"
          >
            <ChevronsLeft size={18} />
          </button>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2">
          <button 
            type="button" 
            onClick={() => navigate('/purchase-invoices-list')} 
            className="bg-slate-100 text-slate-700 hover:bg-slate-200 px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors"
            title="عرض سجل المشتريات"
          >
            <List size={16} /> سجل المشتريات
          </button>

          <button 
            type="button" 
            onClick={handleNewInvoice} 
            className="bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100 px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors"
            title="بدء فاتورة مشتريات جديدة"
          >
            <Plus size={16} /> جديد
          </button>

          {!editingId && (
            <button 
              type="button" 
              onClick={() => setIsOCRModalOpen(true)} 
              className="bg-purple-50 text-purple-700 border border-purple-200 hover:bg-purple-100 px-3.5 py-2 rounded-xl text-xs font-black flex items-center gap-1.5 transition-colors shadow-xs"
              title="المسح الذكي لفاتورة المشتريات بالذكاء الاصطناعي"
            >
              <Sparkles size={16} className="text-purple-600 animate-pulse" /> مسح ذكي (AI OCR)
            </button>
          )}

          {editingId && (
            <>
              <button 
                type="button" 
                onClick={handlePrintCurrent} 
                className="bg-slate-800 text-white hover:bg-slate-700 px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors"
                title="طباعة الفاتورة"
              >
                <Printer size={16} /> طباعة
              </button>

              <button 
                type="button" 
                onClick={handleDeleteCurrent} 
                disabled={deleting} 
                className="bg-red-50 text-red-700 border border-red-200 hover:bg-red-100 px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors disabled:opacity-50"
                title="حذف هذه الفاتورة"
              >
                {deleting ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />} حذف
              </button>
            </>
          )}

          <button 
            type="button" 
            onClick={() => handleSave(undefined, true)} 
            disabled={saving} 
            className="bg-emerald-600 text-white px-5 py-2 rounded-xl font-bold text-xs flex items-center gap-1.5 hover:bg-emerald-700 transition-colors shadow-sm disabled:opacity-50"
          >
            {saving ? <Loader2 className="animate-spin" size={16} /> : <Save size={16} />} 
            {editingId ? 'حفظ وتحديث' : 'حفظ وترحيل'}
          </button>
        </div>
      </div>

      <div className="space-y-6">
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
          
          <div className="relative">
            <label className="block text-xs font-bold text-slate-600 mb-1">إضافة صنف للفاتورة (ابحث بالاسم أو الباركود)</label>
            <div className="relative">
              <input 
                type="text" 
                placeholder="ابحث بالاسم، الكود، أو الباركود واضغط Enter..." 
                value={productSearchTerm}
                onChange={e => { setProductSearchTerm(e.target.value); setShowProductResults(true); }}
                onKeyDown={handleSearchKeyDown}
                className="w-full border rounded-xl p-2.5 pl-10 bg-slate-50 focus:bg-white text-sm outline-none focus:border-emerald-500 transition-colors"
              />
              <Search className="absolute left-3 top-3 text-slate-400" size={18} />
            </div>

            {showProductResults && filteredProducts.length > 0 && (
              <div className="absolute top-full left-0 w-full bg-white border border-slate-200 shadow-xl rounded-xl mt-1 z-20 overflow-hidden">
                {filteredProducts.map(p => (
                  <div 
                    key={p.id} 
                    onClick={() => addProductToInvoice(p)}
                    className="p-3 hover:bg-emerald-50 cursor-pointer border-b last:border-0 flex justify-between items-center transition-colors"
                  >
                    <div>
                      <span className="font-bold text-slate-800 text-sm block">{p.name}</span>
                      <span className="text-xs text-slate-400 font-mono">الكود: {p.sku || '-'} | الباركود: {p.barcode || '-'}</span>
                    </div>
                    <span className="font-bold text-emerald-600 font-mono text-sm">
                      {(p.purchase_price || p.cost || 0).toLocaleString()} {settings.currency || 'ج.م'}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-right text-sm">
              <thead className="bg-slate-50 text-xs font-bold text-slate-600 border-b border-slate-200">
                <tr>
                  <th className="p-3">الصنف</th>
                  <th className="p-3 w-28 text-center">الوحدة</th>
                  <th className="p-3 w-20 text-center">الكمية</th>
                  <th className="p-3 w-24 text-center">سعر الوحدة</th>
                  <th className="p-3 w-28 text-center" title="خصم خاص على مستوى هذا الصنف">خصم الصنف</th>
                  <th className="p-3 w-24 text-center">ضريبة %</th>
                  <th className="p-3 w-28 text-center">صافي البند</th>
                  <th className="p-3 w-10 text-center"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {items.map((item, index) => (
                  <tr key={index} className="hover:bg-slate-50/60 transition-colors">
                    <td className="p-3 font-bold text-slate-800">
                      <div className="flex items-center flex-wrap gap-1.5">
                        <span>{item.productName || products.find(p => p.id === item.productId)?.name || 'صنف'}</span>
                        {Number(item.taxRate) > 0 && (
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                            ضريبة {item.taxRate}%
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="p-3">
                      <select 
                        value={item.uomId || ''} 
                        onChange={e => handleItemChange(index, 'uomId', e.target.value)}
                        className="w-full border rounded-lg p-1.5 text-xs bg-white font-bold"
                      >
                        {uoms.filter(u => {
                            const prod = products.find(p => p.id === item.productId);
                            const baseUom = uoms.find(ux => ux.id === prod?.base_uom_id);
                            return !baseUom || u.category_id === baseUom.category_id;
                        }).map(u => (
                          <option key={u.id} value={u.id}>{u.name}</option>
                        ))}
                      </select>
                    </td>
                    <td className="p-3">
                      <input 
                        type="number" 
                        step="any" 
                        min="0.01"
                        value={item.quantity} 
                        onChange={e => handleItemChange(index, 'quantity', parseFloat(e.target.value) || 0)} 
                        className="w-full border rounded-lg p-1.5 text-center font-mono font-bold text-emerald-700 bg-white" 
                      />
                    </td>
                    <td className="p-3">
                      <input 
                        type="number" 
                        step="any" 
                        min="0" 
                        value={item.unitPrice} 
                        onChange={e => handleItemChange(index, 'unitPrice', parseFloat(e.target.value) || 0)} 
                        className="w-full border rounded-lg p-1.5 text-center font-mono font-bold text-slate-800 bg-white" 
                      />
                    </td>
                    <td className="p-3 text-center">
                      <div className="flex items-center justify-center gap-1">
                        <input 
                          type="number" 
                          min="0" 
                          step="any"
                          value={item.discount ?? 0} 
                          onChange={e => handleItemChange(index, 'discount', parseFloat(e.target.value) || 0)} 
                          className="w-20 border rounded-lg p-1.5 text-center font-mono font-bold text-rose-700 bg-white focus:border-rose-500 outline-none" 
                          placeholder="0.00"
                          title="قيمة الخصم المباشر على هذا البند (ج.م)"
                        />
                      </div>
                      {Number(item.discount) > 0 && ((Number(item.quantity) || 0) * (Number(item.unitPrice) || 0)) > 0 && (
                        <span className="text-[10px] text-rose-600 font-mono font-bold block mt-0.5" title="نسبة الخصم من إجمالي البند">
                          -{((Number(item.discount) / ((Number(item.quantity) || 0) * (Number(item.unitPrice) || 0))) * 100).toFixed(1)}%
                        </span>
                      )}
                    </td>
                    <td className="p-3 text-center">
                      <div className="flex items-center justify-center gap-1">
                        <input 
                          type="number" 
                          min="0" 
                          max="100" 
                          step="any"
                          value={item.taxRate ?? 0} 
                          onChange={e => handleItemChange(index, 'taxRate', parseFloat(e.target.value) || 0)} 
                          className="w-16 border rounded-lg p-1.5 text-center font-mono font-bold text-slate-800 bg-white focus:border-emerald-500 outline-none" 
                          title="نسبة الضريبة الخاصة بالبند"
                        />
                        <span className="text-xs text-slate-400 font-bold">%</span>
                      </div>
                      {Number(item.taxRate) > 0 && (
                        <span className="text-[10px] text-emerald-600 font-mono font-bold block mt-0.5" title="قيمة ضريبة هذا البند">
                          +{((Math.max(0, ((Number(item.quantity) || 0) * (Number(item.unitPrice) || 0)) - (Number(item.discount) || 0))) * ((Number(item.taxRate) || 0) / 100)).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </span>
                      )}
                    </td>
                    <td className="p-3 text-center font-mono font-black text-slate-900" dir="ltr">
                      {Math.max(0, ((Number(item.quantity) || 0) * (Number(item.unitPrice) || 0)) - (Number(item.discount) || 0)).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                    <td className="p-3 text-center">
                      <button 
                        type="button" 
                        onClick={() => removeItem(index)} 
                        className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                        title="حذف الصنف"
                      >
                        <Trash2 size={16} />
                      </button>
                    </td>
                  </tr>
                ))}
                {items.length === 0 && (
                  <tr>
                    <td colSpan={8} className="p-8 text-center text-slate-400 font-bold">
                      لم تتم إضافة أي أصناف بعد. ابحث عن صنف بالأعلى لإضافته.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* 🏷️ خانة الخصم الإجمالي على الفاتورة (لمطابقة فواتير الموردين والضرائب) */}
          <div className="bg-gradient-to-r from-rose-50/70 to-amber-50/50 p-4 rounded-2xl border border-rose-200/80 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 shadow-xs">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="p-1.5 bg-rose-100 text-rose-700 rounded-lg">
                  <Percent size={18} />
                </span>
                <h4 className="text-sm font-black text-rose-950">
                  الخصم الإجمالي على الفاتورة (Overall Invoice Discount)
                </h4>
              </div>
              <p className="text-xs text-rose-800 font-medium">
                الخصم التجاري الممنوح من المورد على كامل الفاتورة — يُخفض الوعاء الضريبي لمطابقة فواتير الموردين ومصلحة الضرائب (ETA)
              </p>
            </div>

            <div className="flex items-center gap-3 w-full md:w-auto">
              <div className="flex bg-white rounded-xl p-1 border border-rose-200 shadow-xs">
                <button
                  type="button"
                  onClick={() => setFormData({ ...formData, discountType: 'fixed' })}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                    formData.discountType === 'fixed'
                      ? 'bg-rose-600 text-white shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  مبلغ ثابت ({settings.currency || 'ج.م'})
                </button>
                <button
                  type="button"
                  onClick={() => setFormData({ ...formData, discountType: 'percentage' })}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                    formData.discountType === 'percentage'
                      ? 'bg-rose-600 text-white shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  نسبة مئوية (%)
                </button>
              </div>

              <div className="relative w-36">
                <input
                  type="number"
                  min="0"
                  step="any"
                  value={formData.discountValue || ''}
                  onChange={e => setFormData({ ...formData, discountValue: Math.max(0, parseFloat(e.target.value) || 0) })}
                  placeholder="0.00"
                  className="w-full border-2 border-rose-200 rounded-xl p-2 text-center font-mono font-black text-rose-700 bg-white focus:border-rose-500 outline-none text-sm"
                />
                <span className="absolute left-2.5 top-2.5 text-xs font-bold text-rose-400">
                  {formData.discountType === 'percentage' ? '%' : (settings.currency || 'ج.م')}
                </span>
              </div>
            </div>
          </div>

          {/* Totals Section */}
          <div className="border-t border-slate-200 pt-4 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
            <div className="text-xs text-slate-500 font-bold space-y-1">
              <div>عدد البنود: <span className="font-mono text-slate-800">{items.length}</span> صنف</div>
              {invoiceCalculation.totalDiscount > 0 && (
                <div className="text-rose-600 font-bold">
                  إجمالي الخصم المكتسب: <span className="font-mono font-black">{invoiceCalculation.totalDiscount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {settings.currency || 'ج.م'}</span>
                </div>
              )}
            </div>

            <div className="w-full md:w-96 space-y-2 bg-slate-50 p-4 rounded-xl border border-slate-200">
              <div className="flex justify-between text-xs font-bold text-slate-600">
                <span>إجمالي الأصناف قبل الخصم:</span>
                <span className="font-mono">{invoiceCalculation.grossTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {settings.currency || 'ج.م'}</span>
              </div>

              {invoiceCalculation.itemsDiscountTotal > 0 && (
                <div className="flex justify-between text-xs font-bold text-rose-600">
                  <span>إجمالي خصومات الأصناف:</span>
                  <span className="font-mono">-{invoiceCalculation.itemsDiscountTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {settings.currency || 'ج.م'}</span>
                </div>
              )}

              <div className="flex justify-between text-xs font-bold text-slate-700 border-t border-slate-200/60 pt-1">
                <span>الصافي قبل الخصم الإجمالي:</span>
                <span className="font-mono">{invoiceCalculation.subtotalBeforeInvoiceDiscount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {settings.currency || 'ج.م'}</span>
              </div>

              {invoiceCalculation.invoiceDiscountAmount > 0 && (
                <div className="flex justify-between text-xs font-bold text-rose-700">
                  <span>
                    خصم الفاتورة الإجمالي
                    {formData.discountType === 'percentage' ? ` (${formData.discountValue}%):` : ':'}
                  </span>
                  <span className="font-mono font-black">-{invoiceCalculation.invoiceDiscountAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {settings.currency || 'ج.م'}</span>
                </div>
              )}

              {invoiceCalculation.totalDiscount > 0 && (
                <div className="flex justify-between text-[11px] font-bold text-slate-500 bg-rose-50/60 px-2 py-1 rounded-lg">
                  <span>إجمالي الخصومات (أصناف + فاتورة):</span>
                  <span className="font-mono text-rose-700 font-bold">-{invoiceCalculation.totalDiscount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {settings.currency || 'ج.م'}</span>
                </div>
              )}

              <div className="flex justify-between text-xs font-bold text-slate-800 bg-emerald-50/60 px-2 py-1 rounded-lg border border-emerald-100">
                <span title="وعاء احتساب ضريبة القيمة المضافة طبقاً لتعليمات مصلحة الضرائب">
                  الوعاء الخاضع للضريبة (الصافي):
                </span>
                <span className="font-mono font-black text-emerald-800">{invoiceCalculation.taxableBase.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {settings.currency || 'ج.م'}</span>
              </div>

              {(invoiceCalculation.taxAmount > 0 || settings.enableTax) && (
                <div className="flex justify-between text-xs font-bold text-slate-600">
                  <span>
                    ضريبة القيمة المضافة
                    {settings.enableTax && !items.some(it => it.taxRate !== undefined && it.taxRate !== settings.vatRate) ? ` (${settings.vatRate || 14}%):` : ':'}
                  </span>
                  <span className="font-mono text-emerald-700 font-bold">+{invoiceCalculation.taxAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {settings.currency || 'ج.م'}</span>
                </div>
              )}

              <div className="flex justify-between text-sm font-black text-emerald-800 border-t-2 border-slate-300 pt-2">
                <span>إجمالي الفاتورة النهائي المستحق:</span>
                <span className="font-mono text-lg" dir="ltr">{invoiceCalculation.totalAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {settings.currency || 'ج.م'}</span>
              </div>

              {formData.paidAmount > 0 && (
                <>
                  <div className="flex justify-between text-xs font-bold text-emerald-600 pt-1">
                    <span>المبلغ المدفوع (سداد فوري):</span>
                    <span className="font-mono">-{Number(formData.paidAmount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {settings.currency || 'ج.م'}</span>
                  </div>
                  <div className="flex justify-between text-xs font-bold text-red-600 border-t border-slate-200 pt-1">
                    <span>المتبقي للمورد على الحساب:</span>
                    <span className="font-mono">{Math.max(0, invoiceCalculation.totalAmount - formData.paidAmount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {settings.currency || 'ج.م'}</span>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* 📎 قسم مرفقات الفاتورة (أصل فاتورة المورد، إيصالات الاستلام، فواتير إلكترونية ETA) */}
          <div className="border-t border-slate-200 pt-4">
            <PurchaseInvoiceAttachments
              invoiceId={editingId}
              organizationId={(currentUser as any)?.organization_id}
              attachments={attachments}
              onChange={setAttachments}
              readOnly={formData.status === 'posted'}
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
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
          </div>

        </div>
      </div>

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

      {/* Hidden printable component */}
      {invoiceToPrint && (
        <PurchaseInvoicePrint invoiceData={invoiceToPrint} companySettings={companySettings} />
      )}
    </div>
  );
};

export default PurchaseInvoiceForm;

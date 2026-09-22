import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useAccounting } from '../../context/AccountingContext';
import { 
    Plus, Trash2, Save, User, Calendar, ShoppingCart, Warehouse,
    Wallet, Search, X, ChevronDown, Check, AlertCircle, Percent,
    CircleDollarSign, Package, Box, Info,
    ArrowDown, Calculator, UserCheck, Printer, Loader2, CheckCircle,
    Edit, RefreshCw, FileText, Landmark, Unlock, Undo2,
    ChevronRight, ChevronLeft, ChevronsRight, ChevronsLeft, List,
    Sparkles, Gift, Tag
} from 'lucide-react';
import { InvoiceItem, Product } from '../../types';
import { supabase } from '../../supabaseClient';
import { useNavigate, useLocation } from 'react-router-dom';
import { SalesInvoicePrint } from './SalesInvoicePrint';
import { ProductStockViewer } from '../../components/ProductStockViewer';
import { useToast } from '../../context/ToastContext';
import { handleError, AppError } from '../../utils/errorHandler';
import CustomerStatement from './CustomerStatement';
import { SubledgerRegistry } from '../../services/subledgerRegistry';
import InvoiceItemsList from '../../components/InvoiceItemsList';
import { createInvoiceSchema, createCustomerSchema } from '../../utils/validationSchemas';
import { etaService } from '../../services/etaService';
import { secureStorage } from '../../utils/securityMiddleware';
import DocumentAuditTimeline from '../../components/DocumentAuditTimeline';
import { logDocumentAction } from '../../services/auditService';
import { evaluatePromotions, PromotionRule } from '../retail/services/promotionEngine';
import { getNextDocumentNumber } from '../../services/sequenceService';
import { QuickCustomerModals } from './components/QuickCustomerModals';
import { ThermalInvoicePrintTemplate } from './components/ThermalInvoicePrintTemplate';
import { InvoiceHeader } from './components/InvoiceHeader';
import { InvoiceItemsTable } from './components/InvoiceItemsTable';
import { InvoiceSummary } from './components/InvoiceSummary';


const SalesInvoiceForm = () => { // Removed unused useParams import
  const { products, warehouses, salespeople, accounts, approveInvoice, addCustomer, updateCustomer, settings, can, currentUser, customers, invoices: contextInvoices, getSystemAccount, addEntry, addDemoInvoice, postDemoSalesInvoice, currentSelectedOrgId, organization } = useAccounting();
  const currentUserRole = (currentUser as any)?.role || '';
  const navigate = useNavigate();
  const location = useLocation();
  const { showToast } = useToast();

  const [formData, setFormData] = useState({
    customerId: '',
    invoiceNumber: '',
    warehouseId: '',
    salespersonId: '',
    costCenterId: '',
    date: new Date().toISOString().split('T')[0],
    dueDate: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    notes: '',
    status: 'draft' as 'draft' | 'posted' | 'paid' | 'partial',
    paidAmount: 0,
    treasuryId: '',
    discountType: 'fixed' as 'percentage' | 'fixed',
    discountValue: 0,
    currency: 'EGP',
    exchangeRate: 1
  });

  const [pricingTier, setPricingTier] = useState<'retail' | 'wholesale' | 'half'>('retail');
  const [productSearchTerm, setProductSearchTerm] = useState('');
  const [showProductResults, setShowProductResults] = useState(false);
  const [items, setItems] = useState<any[]>([]);
  const [uoms, setUoms] = useState<any[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isCustomerModalOpen, setIsCustomerModalOpen] = useState(false);
  const [newCustomerName, setNewCustomerName] = useState('');
  const [newCustomerPhone, setNewCustomerPhone] = useState('');
  const [newCustomerOpeningBalance, setNewCustomerOpeningBalance] = useState('');
  const [isEditCustomerModalOpen, setIsEditCustomerModalOpen] = useState(false);
  const [editCustomerData, setEditCustomerData] = useState({ name: '', phone: '' });
  const [saving, setSaving] = useState(false);
  const [customerBalance, setCustomerBalance] = useState(0);
  const barcodeInputRef = useRef<HTMLInputElement>(null);
  const [activeStockViewer, setActiveStockViewer] = useState<string | null>(null);
  const [customerSearchTerm, setCustomerSearchTerm] = useState('');
  const [showCustomerDropdown, setShowCustomerDropdown] = useState(false);
  const [isRefreshingBalance, setIsRefreshingBalance] = useState(false);
  const [isStatementModalOpen, setIsStatementModalOpen] = useState(false);
  const [convertedQuotationId, setConvertedQuotationId] = useState<string | null>(null);

  // Navigation & Record State
  const [invoiceIds, setInvoiceIds] = useState<string[]>([]);
  const [currentIndex, setCurrentIndex] = useState<number>(-1);
  const [loadingInvoice, setLoadingInvoice] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Print State
  const [invoiceToPrint, setInvoiceToPrint] = useState<any>(null);
  const [companySettings, setCompanySettings] = useState<any>(null);
  const [etaDetails, setEtaDetails] = useState({
    status: 'draft',
    uuid: '',
    submissionId: '',
    qrCode: '',
    error: ''
  });
  const [submittingToEta, setSubmittingToEta] = useState(false);

  useEffect(() => {
    // 🛡️ استخدام RPC هو الحل الوحيد لتجنب خطأ 406 في جميع الشاشات المالية
    supabase.rpc('get_current_company_settings').maybeSingle().then(({ data, error }) => {
      if (error) { // Use handleError for consistency
        console.error("فشل جلب إعدادات الشركة عبر RPC:", error);
        showToast('تعذر تحميل إعدادات الشركة، قد تظهر بعض البيانات بشكل غير صحيح', 'warning');
      } else {
        setCompanySettings(data);
      }
    });
  }, []);

  // تحميل كافة الوحدات عند فتح الشاشة
  useEffect(() => {
    const fetchUoms = async () => {
      const orgId = (currentUser as any)?.organization_id;
      if (!orgId) return;
      const { data } = await supabase.from('uoms').select('*').eq('organization_id', orgId);
      if (data) setUoms(data);
    };
    if (currentUser) fetchUoms();
  }, [currentUser]);

  // 🎁 حالة عروض الهايبر ماركت الترويجية
  const [retailPromotions, setRetailPromotions] = useState<PromotionRule[]>([]);

  // تحميل العروض الترويجية النشطة لمديول الهايبر ماركت
  useEffect(() => {
    const loadRetailPromos = async () => {
      const orgId = currentSelectedOrgId || (currentUser as any)?.organization_id || (organization as any)?.id || 'default_org';
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
          setRetailPromotions(dbActivePromos);
        } else {
          const local = (secureStorage.getItem(`tripro_promos_${orgId}`) || []) as PromotionRule[];
          if (Array.isArray(local) && local.length > 0) {
            setRetailPromotions(local.filter(p => p.is_active !== false));
          } else {
            setRetailPromotions([]);
          }
        }
      } catch (e) {
        const local = (secureStorage.getItem(`tripro_promos_${orgId}`) || []) as PromotionRule[];
        if (local && Array.isArray(local)) setRetailPromotions(local.filter(p => p.is_active !== false));
      }
    };

    loadRetailPromos();

    window.addEventListener('focus', loadRetailPromos);
    return () => {
      window.removeEventListener('focus', loadRetailPromos);
    };
  }, [currentUser, organization, currentSelectedOrgId]);

  useEffect(() => {
    if (invoiceToPrint) {
      const timer = setTimeout(() => {
        window.print();
        setInvoiceToPrint(null);
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [invoiceToPrint]);

  const treasuryAccounts = useMemo(() => accounts.filter(a => {
    if (a.isGroup) return false;
    
    const type = String(a.type || '').toLowerCase();
    const name = a.name.toLowerCase();
    const code = a.code;

    // استبعاد حسابات العملاء والموردين والمخزون بشكل صريح لتجنب الخطأ
    if (code.startsWith('1221') || code.startsWith('221') || code.startsWith('121') || code.startsWith('10201') || code.startsWith('201') || code.startsWith('103')) return false;

    const isAsset = type.includes('asset') || type.includes('أصول') || type === '';
    const hasKeyword = name.includes('نقد') || name.includes('خزينة') || name.includes('بنك') || name.includes('صندوق') || name.includes('cash') || name.includes('bank');
    const hasCode = code.startsWith('123') || code.startsWith('101'); // 123: النقدية وما في حكمها (الدليل المصري)

    return isAsset && (hasKeyword || hasCode);
  }), [accounts]);

  useEffect(() => {
    if (!formData.customerId) {
      const cashCustomer = customers.find(c => c.name === 'عميل نقدي');
      if (cashCustomer) setFormData(prev => ({ ...prev, customerId: cashCustomer.id }));
    }

    // اختيار المستودع تلقائياً (الوحيد أو المفضل من الإعدادات أو الأول في القائمة)
    if (!formData.warehouseId && warehouses.length > 0) {
      if (warehouses.length === 1) {
        setFormData(prev => ({ ...prev, warehouseId: warehouses[0].id }));
      } else if (settings.defaultWarehouseId) {
        const preferred = warehouses.find(w => w.id === settings.defaultWarehouseId);
        setFormData(prev => ({ ...prev, warehouseId: preferred ? preferred.id : warehouses[0].id }));
      } else {
        setFormData(prev => ({ ...prev, warehouseId: warehouses[0].id }));
      }
    }

    const firstSalesperson = salespeople.find(s => s.id !== '00000000-0000-0000-0000-000000000000');
    if (!formData.salespersonId && firstSalesperson) setFormData(prev => ({ ...prev, salespersonId: firstSalesperson.id }));

    // اختيار الخزينة تلقائياً (الوحيدة أو المفضلة من الإعدادات)
    if (!formData.treasuryId) {
      if (treasuryAccounts.length === 1) {
        setFormData(prev => ({ ...prev, treasuryId: treasuryAccounts[0].id }));
      } else if (settings.defaultTreasuryId) {
        const preferred = treasuryAccounts.find(a => a.id === settings.defaultTreasuryId);
        if (preferred) setFormData(prev => ({ ...prev, treasuryId: preferred.id }));
      }
    }
    
    if (formData.currency !== settings.currency && settings.currency) {
        setFormData(prev => ({ ...prev, currency: settings.currency }));
    }

    if(barcodeInputRef.current) barcodeInputRef.current.focus();
  }, [customers, warehouses, salespeople, treasuryAccounts, formData.warehouseId, formData.treasuryId]);

  // تحديث نص البحث عند تغير العميل المختار (مثلاً عند التعديل أو التحميل)
  useEffect(() => {
    if (formData.customerId) {
        const selectedCustomer = customers.find(c => c.id === formData.customerId);
        if (selectedCustomer) {
            setCustomerSearchTerm(selectedCustomer.name);
        }
    }
  }, [formData.customerId, customers]);

  // حساب مديونية العميل عند اختياره (مطابق تماماً لكشف الحساب والأستاذ العام)
  const fetchCustomerBalance = async () => {
      if (!formData.customerId) {
          setCustomerBalance(0);
          return;
      }

      if (currentUserRole === 'demo') {
          const bal = contextInvoices
              .filter(inv => inv.customerId === formData.customerId && inv.status !== 'draft' && inv.status !== 'paid')
              .reduce((acc, inv) => acc + (inv.totalAmount - (inv.paid_amount || 0)), 0);
          setCustomerBalance(bal);
          return;
      }
      
      try {
          const { data: { session } } = await supabase.auth.getSession();
          const userOrgId = session?.user?.user_metadata?.org_id || (currentUser as any)?.organization_id || (currentUser as any)?.user_metadata?.org_id || (settings as any)?.organization_id;

          if (!userOrgId) {
              setCustomerBalance(0);
              return;
          }

          const customer: any = customers.find(c => c.id === formData.customerId);
          if (!customer) {
              setCustomerBalance(0);
              return;
          }

          // 1. تحديد حساب العملاء (1221) أو حساب التأمين (122101)
          let targetAccountId = getSystemAccount('CUSTOMERS')?.id;
          if (!targetAccountId) {
            const { data: customerAccounts } = await supabase
              .from('accounts')
              .select('id')
              .eq('organization_id', userOrgId)
              .eq('code', '1221')
              .limit(1);
            targetAccountId = customerAccounts?.[0]?.id;
          }

          if (customer?.customer_type === 'insurance_provider') {
            const { data: insAcc } = await supabase
              .from('accounts')
              .select('id')
              .eq('organization_id', userOrgId)
              .eq('code', '122101')
              .limit(1);
            if (insAcc && insAcc.length > 0) {
              targetAccountId = insAcc[0].id;
            }
          }

          if (!targetAccountId) {
              console.error("Customer A/R account not found for balance calculation.");
              setCustomerBalance(0);
              return;
          }

          // جلب المديولات المسموحة للمنظمة
          const { data: orgData } = await supabase
            .from('organizations')
            .select('allowed_modules')
            .eq('id', userOrgId)
            .maybeSingle();
          const allowedModules: string[] | undefined = orgData?.allowed_modules || undefined;

          // 2. جمع معرفات القيود المرتبطة بالعميل + القيود اليدوية + مستخلصات المشاريع + مجمع الأستاذ المساعد
          const custName = customer?.name?.trim();
          const [
              invRes, recRes, retRes, cnRes, chqRes, ordRes,
              clientProjectsRes,
              manualEntriesRes,
              modularEntryIds
          ] = await Promise.all([
              supabase.from('invoices').select('related_journal_entry_id').eq('customer_id', customer.id).eq('organization_id', userOrgId).not('related_journal_entry_id', 'is', null),
              supabase.from('receipt_vouchers').select('related_journal_entry_id').eq('customer_id', customer.id).eq('organization_id', userOrgId).not('related_journal_entry_id', 'is', null),
              supabase.from('sales_returns').select('related_journal_entry_id').eq('customer_id', customer.id).eq('organization_id', userOrgId).not('related_journal_entry_id', 'is', null),
              supabase.from('credit_notes').select('related_journal_entry_id').eq('customer_id', customer.id).eq('organization_id', userOrgId).not('related_journal_entry_id', 'is', null),
              custName
                ? supabase.from('cheques').select('related_journal_entry_id').eq('organization_id', userOrgId).not('related_journal_entry_id', 'is', null).or(`party_id.eq.${customer.id},party_name.ilike.%${custName}%`)
                : supabase.from('cheques').select('related_journal_entry_id').eq('party_id', customer.id).eq('organization_id', userOrgId).not('related_journal_entry_id', 'is', null),
              supabase.from('orders').select('related_journal_entry_id').eq('customer_id', customer.id).eq('organization_id', userOrgId).not('related_journal_entry_id', 'is', null),
              supabase.from('projects').select('id, name').eq('customer_id', customer.id).eq('organization_id', userOrgId),
              custName
                ? supabase.from('journal_entries').select('id, reference, description, related_document_type').eq('organization_id', userOrgId).eq('status', 'posted').or(`description.ilike.%${custName}%,reference.ilike.%${custName}%,reference.ilike.%OP-CUST-${customer.id}%,reference.ilike.%OB-${customer.id}%`)
                : Promise.resolve({ data: [] as any[] }),
              SubledgerRegistry.fetchStatementCustomerEntryIds(userOrgId, customer.id, custName, allowedModules)
          ]);

          const allEntryIds = new Set<string>();
          invRes.data?.forEach(i => i.related_journal_entry_id && allEntryIds.add(i.related_journal_entry_id));
          recRes.data?.forEach(r => r.related_journal_entry_id && allEntryIds.add(r.related_journal_entry_id));
          retRes.data?.forEach(r => r.related_journal_entry_id && allEntryIds.add(r.related_journal_entry_id));
          cnRes.data?.forEach(c => c.related_journal_entry_id && allEntryIds.add(c.related_journal_entry_id));
          chqRes.data?.forEach(c => c.related_journal_entry_id && allEntryIds.add(c.related_journal_entry_id));
          ordRes.data?.forEach(o => o.related_journal_entry_id && allEntryIds.add(o.related_journal_entry_id));
          manualEntriesRes.data?.forEach(je => allEntryIds.add(je.id));
          modularEntryIds?.forEach(id => { if (id) allEntryIds.add(id); });

          // جلب مستخلصات مشاريع هذا العميل
          const projectIds = clientProjectsRes.data?.map(p => p.id) || [];
          if (projectIds.length > 0) {
            const { data: billings } = await supabase.from('project_progress_billings')
              .select('related_journal_entry_id')
              .in('project_id', projectIds)
              .eq('organization_id', userOrgId)
              .not('related_journal_entry_id', 'is', null);
            billings?.forEach(b => b.related_journal_entry_id && allEntryIds.add(b.related_journal_entry_id));
          }

          let movement = 0;
          let hasOpeningEntryInTrans = false;

          if (allEntryIds.size > 0) {
              const { data: ledgerLines } = await supabase.from('journal_lines')
                .select('journal_entry_id, debit, credit')
                .in('journal_entry_id', Array.from(allEntryIds))
                .eq('account_id', targetAccountId);

              movement = ledgerLines?.reduce((sum, l) => sum + (Number(l.debit) - Number(l.credit)), 0) || 0;

              const journalEntryIds = Array.from(new Set(ledgerLines?.map(l => l.journal_entry_id).filter(Boolean) || []));
              if (journalEntryIds.length > 0) {
                  const { data: entries } = await supabase
                    .from('journal_entries')
                    .select('id, reference, description, related_document_type')
                    .in('id', journalEntryIds)
                    .eq('organization_id', userOrgId);

                  hasOpeningEntryInTrans = entries?.some(je => 
                    je.related_document_type === 'opening_balance' ||
                    je.reference?.startsWith('OP-CUST-') ||
                    je.reference?.startsWith('OB-') ||
                    je.reference?.startsWith('OP-') ||
                    je.reference?.startsWith('OPENING-') ||
                    je.description?.includes('رصيد افتتاحي')
                  ) || false;
              }
          }
          
          // 3. إضافة مبيعات المطاعم غير المرحّلة (إن وجدت)
          const { data: openOrders } = await supabase.from('orders')
            .select('grand_total')
            .eq('customer_id', customer.id)
            .eq('organization_id', userOrgId)
            .is('related_journal_entry_id', null)
            .neq('status', 'CANCELLED');

          const unpostedRestaurantSales = openOrders?.reduce((sum, o) => sum + Number(o.grand_total), 0) || 0;

          const initialBal = hasOpeningEntryInTrans ? 0 : Number(customer.opening_balance || 0);

          setCustomerBalance(initialBal + movement + unpostedRestaurantSales);

          // 🔍 التحقق من الفواتير المتأخرة
          const { data: overdueData } = await supabase
              .from('invoices')
              .select('total_amount, paid_amount, due_date, status')
              .eq('customer_id', formData.customerId)
              .eq('organization_id', userOrgId)
              .neq('status', 'draft');

          const today = new Date().toISOString().split('T')[0];
          const overdueInvoices = overdueData?.filter((inv: any) => 
              inv.status !== 'paid' && 
              inv.due_date && 
              inv.due_date < today && 
              (inv.total_amount - (inv.paid_amount || 0)) > 0
          ) || [];
          
          if (overdueInvoices.length > 0) {
              setTimeout(() => {
                  showToast(`العميل لديه ${overdueInvoices.length} فواتير متأخرة السداد`, 'warning');
              }, 500);
          }
      } catch (error: any) {
          console.error("Error calculating customer balance:", error);
          handleError(error, { showNotification: showToast, context: { customerId: formData.customerId } });
      }
  };

  useEffect(() => {
      fetchCustomerBalance();
  }, [formData.customerId, customers, accounts, currentUser, contextInvoices]);

  const handleRefreshBalance = async () => {
      setIsRefreshingBalance(true);
      await fetchCustomerBalance();
      setIsRefreshingBalance(false);
  };

  // جلب كافة معرفات فواتير المبيعات للتنقل
  const fetchInvoiceIds = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const userOrgId = session?.user?.user_metadata?.org_id;
      if (!userOrgId) return;

      const { data, error } = await supabase
        .from('invoices')
        .select('id')
        .eq('organization_id', userOrgId)
        .order('invoice_date', { ascending: true })
        .order('created_at', { ascending: true });

      if (error) throw error;
      const ids = (data || []).map(inv => inv.id);
      setInvoiceIds(ids);
    } catch (err) {
      console.error('Error fetching invoice IDs:', err);
    }
  };

  useEffect(() => {
    fetchInvoiceIds();
  }, []);

  const loadInvoiceById = async (invId: string) => {
    setLoadingInvoice(true);
    try {
      const { data: fullInv, error: invErr } = await supabase.from('invoices').select('*').eq('id', invId).single();
      if (invErr) throw invErr;
      if (!fullInv) throw new Error('الفاتورة غير موجودة');

      setEditingId(fullInv.id);
      setFormData(prev => ({
        ...prev,
        customerId: fullInv.customer_id || '',
        invoiceNumber: fullInv.invoice_number || '',
        date: fullInv.invoice_date || new Date().toISOString().split('T')[0],
        salespersonId: fullInv.salesperson_id || '',
        notes: fullInv.notes || '',
        status: fullInv.status || 'draft',
        currency: fullInv.currency || settings.currency || 'EGP',
        exchangeRate: fullInv.exchange_rate || 1,
        warehouseId: fullInv.warehouse_id || '',
        paidAmount: fullInv.paid_amount || 0,
        treasuryId: fullInv.treasury_account_id || '',
        discountValue: (() => {
          const loadedTotalDisc = Number(fullInv.discount_amount || 0);
          const loadedPromoDisc = Number(fullInv.promo_discount || 0);
          if (loadedPromoDisc > 0) {
            return Math.max(0, loadedTotalDisc - loadedPromoDisc);
          }
          // توافق تاريخي: إذا كانت الفاتورة تتضمن عروض في الملاحظات، فالخصم المسجل هو خصم العرض
          if (loadedTotalDisc > 0 && (fullInv.notes?.includes('[عروض مطبقة:') || fullInv.notes?.includes('عرض الحزمة') || fullInv.notes?.includes('وفرت'))) {
            return 0;
          }
          return loadedTotalDisc;
        })(),
        discountType: 'fixed',
        costCenterId: fullInv.cost_center_id || ''
      }));

      setEtaDetails({
        status: fullInv.eta_status || 'draft',
        uuid: fullInv.eta_uuid || '',
        submissionId: fullInv.eta_submission_id || '',
        qrCode: fullInv.eta_qr_code || '',
        error: fullInv.eta_error || ''
      });

      const { data: itemsData } = await supabase.from('invoice_items').select('*, products(name, sku, base_uom_id, sale_uom_id)').eq('invoice_id', fullInv.id);
      if (itemsData) {
        setItems(itemsData.map((i: any) => ({
          id: i.id,
          productId: i.product_id,
          product_id: i.product_id,
          productName: i.products?.name || 'صنف',
          product_name: i.products?.name || 'صنف',
          productSku: i.products?.sku || '',
          product_sku: i.products?.sku || '',
          quantity: Number(i.quantity) || 0,
          unitPrice: Number(i.unit_price) || 0,
          unit_price: Number(i.unit_price) || 0,
          uomId: i.uom_id || i.products?.sale_uom_id || i.products?.base_uom_id || '',
          total: Number(i.total) || 0
        })));
      }

      const idx = invoiceIds.indexOf(invId);
      if (idx !== -1) setCurrentIndex(idx);

    } catch (err: any) {
      console.error('Error loading invoice:', err);
      showToast('فشل تحميل الفاتورة: ' + err.message, 'error');
    } finally {
      setLoadingInvoice(false);
    }
  };

  // استقبال فاتورة للتعديل أو عرض سعر محول
  useEffect(() => {
    if (location.state && (location.state as any).invoiceToEdit) {
      const invId = (location.state as any).invoiceToEdit.id;
      loadInvoiceById(invId);
    } else if (location.state && (location.state as any).quotationToConvert) {
      const quote = (location.state as any).quotationToConvert;
      setConvertedQuotationId(quote.id || null);
      setFormData(prev => ({
        ...prev,
        customerId: quote.customerId || '',
        notes: quote.notes || ''
      }));
      if (quote.items && quote.items.length > 0) {
        setItems(quote.items.map((i: any, idx: number) => ({
          id: Date.now().toString() + idx,
          productId: i.productId,
          product_id: i.productId,
          productName: products.find(p => p.id === i.productId)?.name || 'صنف',
          product_name: products.find(p => p.id === i.productId)?.name || 'صنف',
          quantity: Number(i.quantity) || 0,
          unitPrice: Number(i.unitPrice) || 0,
          unit_price: Number(i.unitPrice) || 0,
          uomId: i.uomId || '',
          total: (Number(i.quantity) || 0) * (Number(i.unitPrice) || 0)
        })));
      }
      showToast('تم استيراد بيانات عرض السعر بنجاح ✅', 'success');
    }
  }, [location.state]);

  const handleNavigate = (direction: 'first' | 'prev' | 'next' | 'last') => {
    if (invoiceIds.length === 0) {
      showToast('لا توجد فواتير مبيعات للتنقل بينها', 'info');
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
    if (!editingId && (!location.state || (!(location.state as any).invoiceToEdit && !(location.state as any).quotationToConvert))) {
      try {
        const savedDraft = secureStorage.getItem('tripro_sales_invoice_draft');
        if (savedDraft) {
          const parsed = typeof savedDraft === 'string' ? JSON.parse(savedDraft) : savedDraft;
          if (parsed.items && parsed.items.length > 0) {
            setItems(parsed.items);
            if (parsed.formData) {
              setFormData(prev => ({ ...prev, ...parsed.formData }));
            }
            showToast('تمت استعادة مسودة الفاتورة غير المحفوظة تلقائياً ✅', 'info');
          }
        }
      } catch (e) {
        console.warn('Failed to parse sales draft from secureStorage', e);
      }
    }
  }, []);

  // 🛡️ حفظ المسودة التلقائي في secureStorage عند تعديل الأصناف أو البيانات
  useEffect(() => {
    if (!editingId) {
      if (items.length > 0 || formData.customerId || formData.notes) {
        secureStorage.setItem('tripro_sales_invoice_draft', JSON.stringify({ formData, items }));
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
      secureStorage.removeItem('tripro_sales_invoice_draft');
    } catch (e) {}
    setEditingId(null);
    setCurrentIndex(-1);
    setItems([]);
    setFormData({
      customerId: '',
      invoiceNumber: '',
      warehouseId: warehouses.length === 1 ? warehouses[0].id : (settings.defaultWarehouseId || ''),
      salespersonId: '',
      costCenterId: '',
      date: new Date().toISOString().split('T')[0],
      dueDate: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      notes: '',
      status: 'draft',
      paidAmount: 0,
      treasuryId: '',
      discountType: 'fixed',
      discountValue: 0,
      currency: settings.currency || 'EGP',
      exchangeRate: 1
    });
    showToast('تم فتح نموذج فاتورة مبيعات جديدة ➕', 'info');
  };

  const handleUnpostInvoice = async () => {
    if (!editingId) return;

    if (!window.confirm(`هل أنت متأكد من إلغاء تترحيل فاتورة المبيعات رقم (${formData.invoiceNumber})؟\n\nسيتم:\n1- عكس حركة المخزون وإعادة الكميات للمستودع.\n2- حذف القيد المحاسبي من دفتر اليومية بالكامل.\n3- تحويل الفاتورة إلى مسودة (Draft) لتتمكن من تعديلها بحرية.`)) {
      return;
    }

    setSaving(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const userOrgId = session?.user?.user_metadata?.org_id;

      // 1. جلب بيانات الفاتورة والأصناف
      const { data: inv, error: invFetchErr } = await supabase.from('invoices').select('*, invoice_items(*)').eq('id', editingId).single();
      if (invFetchErr) throw invFetchErr;

      if (inv && (inv.status === 'posted' || inv.status === 'paid')) {
        // 2. عكس حركة المخزون (إعادة البضاعة للمخزن)
        for (const item of (inv.invoice_items || [])) {
          if (item.product_id && item.quantity) {
            const { data: prod } = await supabase.from('products').select('stock, warehouse_stock').eq('id', item.product_id).single();
            if (prod) {
              const newStock = (Number(prod.stock) || 0) + Number(item.quantity);
              let newWStock = prod.warehouse_stock || {};
              if (inv.warehouse_id && newWStock[inv.warehouse_id] !== undefined) {
                newWStock[inv.warehouse_id] = (Number(newWStock[inv.warehouse_id]) || 0) + Number(item.quantity);
              }
              await supabase.from('products').update({ stock: newStock, warehouse_stock: newWStock }).eq('id', item.product_id);
            }
          }
        }

        // 3. حذف القيد المحاسبي المرتبط من دفتر الأستاذ العام
        if (inv.related_journal_entry_id) {
          await supabase.from('journal_entries').delete().eq('id', inv.related_journal_entry_id);
        } else {
          await supabase.from('journal_entries').delete().eq('organization_id', userOrgId).eq('reference', inv.invoice_number);
        }
      }

      // 4. تحويل حالة الفاتورة إلى draft وتصفير القيد المرتبط
      const { error: updateErr } = await supabase.from('invoices').update({
        status: 'draft',
        related_journal_entry_id: null
      }).eq('id', editingId);

      if (updateErr) throw updateErr;

      // 5. تحديث واجهة المستخدم
      setFormData(prev => ({
        ...prev,
        status: 'draft'
      }));

      // تحديث رصيد العميل فوراً
      await fetchCustomerBalance();

      showToast('تم إلغاء ترحيل الفاتورة بنجاح وتحويلها لمسودة جاهزة للتعديل ✅', 'success');

    } catch (err: any) {
      console.error('Error unposting sales invoice:', err);
      showToast('فشل إلغاء ترحيل الفاتورة: ' + err.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteCurrent = async () => {
    if (!editingId) return;

    if (!window.confirm(`هل أنت متأكد من حذف فاتورة المبيعات رقم (${formData.invoiceNumber})؟\nسيتم إلغاء أثرها على المخزون والقيد المحاسبي بالكامل.`)) {
      return;
    }

    setDeleting(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const userOrgId = session?.user?.user_metadata?.org_id;

      const { data: inv } = await supabase.from('invoices').select('*, invoice_items(*)').eq('id', editingId).single();
      if (inv && inv.status === 'posted') {
        for (const item of (inv.invoice_items || [])) {
          if (item.product_id && item.quantity) {
            const { data: prod } = await supabase.from('products').select('stock, warehouse_stock').eq('id', item.product_id).single();
            if (prod) {
              const newStock = (Number(prod.stock) || 0) + Number(item.quantity);
              let newWStock = prod.warehouse_stock || {};
              if (inv.warehouse_id && newWStock[inv.warehouse_id] !== undefined) {
                newWStock[inv.warehouse_id] = (Number(newWStock[inv.warehouse_id]) || 0) + Number(item.quantity);
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

      await supabase.from('invoice_items').delete().eq('invoice_id', editingId);
      const { error: delErr } = await supabase.from('invoices').delete().eq('id', editingId);
      if (delErr) throw delErr;

      showToast('تم حذف فاتورة المبيعات وعكس الحركات بنجاح ✅', 'success');

      const newIds = invoiceIds.filter(id => id !== editingId);
      setInvoiceIds(newIds);

      if (newIds.length > 0) {
        const nextId = newIds[Math.min(currentIndex, newIds.length - 1)];
        loadInvoiceById(nextId);
      } else {
        handleNewInvoice();
      }

    } catch (err: any) {
      console.error('Error deleting sales invoice:', err);
      showToast('فشل حذف الفاتورة: ' + err.message, 'error');
    } finally {
      setDeleting(false);
    }
  };

  // 🎁 تقييم عروض الهايبر ماركت التلقائي (BOGO, Tiered Qty, Category Discounts, Min Spend)
  const { totalPromoDiscount, appliedPromotions } = useMemo(() => {
    if (!retailPromotions || retailPromotions.length === 0 || items.length === 0) {
      return { totalPromoDiscount: 0, appliedPromotions: [] };
    }
    const cartForPromo = items.map(item => {
      const prod = products.find(p => p.id === (item.productId || item.product_id));
      return {
        product: {
          id: item.productId || item.product_id,
          name: item.productName || item.product_name || prod?.name || '',
          sales_price: Number(item.unitPrice ?? item.unit_price ?? 0),
          category_id: prod?.category_id || null
        },
        quantity: Number(item.quantity || 0),
        price: Number(item.unitPrice ?? item.unit_price ?? 0)
      };
    });
    return evaluatePromotions(cartForPromo, retailPromotions);
  }, [items, products, retailPromotions]);

  // Note: subtotal calculation kept for backward compatibility with existing form logic
  // The new InvoiceItemsList component handles its own calculations internally
  const subtotal = items.reduce((sum, item) => sum + item.total, 0);

  let manualDiscount = 0;
  if (formData.discountType === 'percentage') {
      manualDiscount = subtotal * (formData.discountValue / 100);
  } else {
      manualDiscount = formData.discountValue;
  }
  manualDiscount = Math.min(manualDiscount, subtotal);

  // إجمالي الخصومات يشمل الخصم اليدوي + عروض الهايبر ماركت
  const discountAmount = Math.min(subtotal, manualDiscount + totalPromoDiscount);

  const netSales = Math.max(0, subtotal - discountAmount);
  const taxRate = settings.enableTax ? ((settings.vatRate || 14) / 100) : 0;
  const taxAmount = netSales * taxRate;
  const totalAmount = netSales + taxAmount;
  const remainingBalance = Math.max(0, totalAmount - formData.paidAmount);

  // 🎁 التحقق مما إذا كان هناك عرض هايبر ماركت سارٍ على صنف معين
  const getProductHypermarketOffer = (product: any): PromotionRule | undefined => {
    if (!retailPromotions || retailPromotions.length === 0) return undefined;
    const now = formData.date || new Date().toISOString().split('T')[0];
    return retailPromotions.find(p => {
      if (!p.is_active) return false;
      if (p.start_date && p.start_date > now) return false;
      if (p.end_date && p.end_date < now) return false;
      if (p.product_id && p.product_id === product.id) return true;
      if (p.category_id && product.category_id && p.category_id === product.category_id) return true;
      return false;
    });
  };

  // التحقق من حد الائتمان
  const selectedCustomer = customers.find(c => c.id === formData.customerId);
  const currentInvoiceDebt = Math.max(0, totalAmount - formData.paidAmount);
  const totalProjectedDebt = customerBalance + currentInvoiceDebt;
  const isOverLimit = Boolean(selectedCustomer?.credit_limit && selectedCustomer.credit_limit > 0 && totalProjectedDebt > selectedCustomer.credit_limit);

  const filteredProducts = useMemo(() => {
      if (!productSearchTerm.trim()) return [];
      const term = productSearchTerm.trim().toLowerCase();
      return products.filter(p =>
          p.name.toLowerCase().includes(term) ||
          (p.sku && p.sku.toLowerCase().includes(term)) ||
          (p.barcode && p.barcode.toLowerCase().includes(term)) ||
          ((p as any).barcode2 && (p as any).barcode2.toLowerCase().includes(term)) ||
          (Array.isArray((p as any).unit_barcodes) && (p as any).unit_barcodes.some((ub: any) => ub.barcode && ub.barcode.toLowerCase().includes(term)))
      ).slice(0, 8);
  }, [productSearchTerm, products]);

  // 🏷️ دالة التحقق من سريان العرض على الصنف
  const isOfferActive = (product: any, invDate?: string) => {
      const targetDate = invDate || formData.date || new Date().toISOString().split('T')[0];
      const offerPrice = Number(product.offer_price || product.offerPrice || 0);
      if (offerPrice > 0) {
          const start = product.offer_start_date || product.offerStartDate;
          const end = product.offer_end_date || product.offerEndDate;
          if (start && end) {
              return targetDate >= start && targetDate <= end;
          }
          if (end) {
              return targetDate <= end;
          }
          return true;
      }
      return false;
  };

  const getProductPrice = (product: any, invDate?: string) => {
      // 🏷️ إذا كان هناك عرض ساري على الصنف، يتم تطبيق سعر العرض تلقائياً
      if (isOfferActive(product, invDate)) {
          return Number(product.offer_price || product.offerPrice);
      }
      const price = Number(product.sales_price || product.price || 0);
      if (pricingTier === 'wholesale') {
          const wsPrice = Number(product.wholesale_price ?? product.wholesalePrice);
          return wsPrice > 0 ? wsPrice : price;
      }
      if (pricingTier === 'half') {
          const halfWsPrice = Number(product.half_wholesale_price ?? product.halfWholesalePrice);
          return halfWsPrice > 0 ? halfWsPrice : price;
      }
      return price;
  };

  const addProductToInvoice = (product: Product, matchedUomInfo?: { uom_name?: string; customPrice?: number; uom_id?: string }) => {
      const selectedUomId = matchedUomInfo?.uom_id || product.sale_uom_id || product.base_uom_id;
      const selectedUom = uoms.find(u => u.id === selectedUomId);
      const basePrice = getProductPrice(product);
      const calculatedPrice = (matchedUomInfo?.customPrice !== undefined && matchedUomInfo.customPrice > 0)
          ? matchedUomInfo.customPrice
          : (selectedUom ? Number((basePrice * (selectedUom.ratio || 1)).toFixed(4)) : basePrice);

      const existingItemIndex = items.findIndex(i => i.productId === product.id && (!selectedUomId || i.uomId === selectedUomId));

      if (existingItemIndex > -1) {
          const newItems = [...items];
          newItems[existingItemIndex].quantity += 1;
          newItems[existingItemIndex].total = newItems[existingItemIndex].quantity * newItems[existingItemIndex].unitPrice;
          setItems(newItems);
      } else {
          setItems([...items, {
              id: Date.now().toString(),
              productId: product.id,
              product_id: product.id,
              productName: product.name,
              product_name: product.name,
              productSku: product.sku,
              product_sku: product.sku,
              quantity: 1,
              unitPrice: calculatedPrice,
              unit_price: calculatedPrice,
              uomId: selectedUomId || '',
              total: calculatedPrice
          }]);
      }
      setProductSearchTerm('');
      setShowProductResults(false);
  };

  const handleBarcodeSearch = async (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const code = e.currentTarget.value.trim().toLowerCase();
      if (!code) return;

      let matchedUomInfo: { uom_name?: string; customPrice?: number; uom_id?: string } | undefined;

      // 1. Direct match on barcode, sku, barcode2
      let product = products.find(p => 
        (p.barcode && p.barcode.trim().toLowerCase() === code) ||
        (p.sku && p.sku.trim().toLowerCase() === code) ||
        ((p as any).barcode2 && (p as any).barcode2.trim().toLowerCase() === code)
      );

      // 2. Unit barcodes match (e.g. bottle vs box vs carton)
      if (!product) {
        for (const p of products) {
          if (Array.isArray((p as any).unit_barcodes)) {
            const foundUom = (p as any).unit_barcodes.find((ub: any) => ub.barcode && ub.barcode.trim().toLowerCase() === code);
            if (foundUom) {
              product = p;
              matchedUomInfo = {
                uom_name: foundUom.uom_name,
                customPrice: foundUom.price && Number(foundUom.price) > 0 ? Number(foundUom.price) : undefined,
                uom_id: foundUom.uom_id
              };
              break;
            }
          }
        }
      } else if (Array.isArray((product as any).unit_barcodes)) {
        // If product matched directly, check if it was specifically a unit barcode
        const foundUom = (product as any).unit_barcodes.find((ub: any) => ub.barcode && ub.barcode.trim().toLowerCase() === code);
        if (foundUom) {
          matchedUomInfo = {
            uom_name: foundUom.uom_name,
            customPrice: foundUom.price && Number(foundUom.price) > 0 ? Number(foundUom.price) : undefined,
            uom_id: foundUom.uom_id
          };
        }
      }

      if (product) {
        addProductToInvoice(product, matchedUomInfo); 
        e.currentTarget.value = ''; 
        setProductSearchTerm('');
      } else {
        showToast('المنتج غير موجود أو الباركود غير صحيح', 'error');
      }
    }
  };

  const handleItemChange = (index: number, field: string, value: any) => {
    const newItems = [...items];
    let processedValue = value;
    if (field === 'quantity') processedValue = Math.max(0.01, parseFloat(value) || 0);
    else if (field === 'unitPrice') processedValue = Math.max(0, parseFloat(value) || 0);
    
    // تحديث البيانات والوحدة الافتراضية عند تغيير الصنف يدوياً (للتوافق المطلق)
    if (field === 'productId') {
        const product = products.find(p => p.id === value);
        if (product) {
            const price = getProductPrice(product);
            newItems[index].unitPrice = price;
            newItems[index].uomId = product.sale_uom_id || product.base_uom_id || '';
            newItems[index].productName = product.name;
            newItems[index].productSku = product.sku;
            // تحديث الحقول التوافقية (Snake Case)
            newItems[index].product_id = product.id;
            newItems[index].product_name = product.name;
            newItems[index].unit_price = price;
        }
    }
    // الذكاء الاصطناعي: محرك السعر التلقائي عند تغيير الوحدة
    else if (field === 'uomId') {
        const selectedUom = uoms.find(u => u.id === value);
        const product = products.find(p => p.id === newItems[index].productId);
        if (selectedUom && product) {
            // السعر الجديد = سعر البيع الأساسي * معامل التحويل
            // هذا يضمن الدقة الرباعية 0.0001
            const basePrice = product.sales_price || 0;
            const newUnitPrice = basePrice * selectedUom.ratio;
            newItems[index].unitPrice = Number(newUnitPrice.toFixed(4));
        }
    }

    newItems[index][field] = processedValue;
    newItems[index].total = newItems[index].quantity * newItems[index].unitPrice;
    setItems(newItems);
  };

  const removeItem = (index: number) => {
    setItems(items.filter((_, i) => i !== index));
  };

  const handleQuickAddCustomer = async (e: React.FormEvent) => {
      e.preventDefault();
      
      // التحقق من صحة البيانات باستخدام Zod
      const validationResult = createCustomerSchema.safeParse({
          name: newCustomerName,
          phone: newCustomerPhone,
          email: '', // قيم افتراضية للحقول غير الموجودة في الإضافة السريعة
          tax_number: '',
          address: '',
          credit_limit: 0
      });

      if (!validationResult.success) {
          const nameError = validationResult.error.issues.find(i => i.path[0] === 'name');
          const phoneError = validationResult.error.issues.find(i => i.path[0] === 'phone');
          
          if (nameError) { showToast(nameError.message, 'warning'); return; }
          if (phoneError) { showToast(phoneError.message, 'warning'); return; }
      }

      if(newCustomerName) {
          try {
              const data = await addCustomer({ name: newCustomerName, phone: newCustomerPhone } as any);
              
              // معالجة الرصيد الافتتاحي
              const openingBalance = parseFloat(newCustomerOpeningBalance);
              if (openingBalance > 0 && data?.id) {
                  const date = new Date().toISOString().split('T')[0];
                  const ref = `OB-${data.id.slice(0, 6)}`; // Use handleError for consistency
                  
                  // 1. إنشاء قيد محاسبي (من ح/ العملاء إلى ح/ الأرصدة الافتتاحية)
                  const customerAcc = getSystemAccount('CUSTOMERS');
                  const openingEquityAcc = accounts.find(a => a.code === '3999' || a.name.includes('أرصدة افتتاحية')) || accounts.find(a => a.code === '301'); // حقوق الملكية كبديل
                  
                  if (customerAcc && openingEquityAcc) {
                      await addEntry({
                          date: date,
                          description: `رصيد افتتاحي للعميل ${newCustomerName}`,
                          reference: ref,
                          status: 'posted',
                          lines: [
                              { accountId: customerAcc.id, debit: openingBalance, credit: 0, description: `رصيد افتتاحي - ${newCustomerName}` }, // Use handleError for consistency
                              { accountId: openingEquityAcc.id, debit: 0, credit: openingBalance, description: `رصيد افتتاحي - ${newCustomerName}` }
                          ]
                      });
                  }

                  // 2. إنشاء سجل في جدول الفواتير (بدون بنود) ليظهر في كشف الحساب والمديونية
                  // نستخدم حالة 'posted' مباشرة لتظهر في التقارير دون التأثير على المخزون أو المبيعات (لأننا لم نضف بنوداً)
                  await supabase.from('invoices').insert({
                      invoice_number: ref,
                      customer_id: data.id,
                      invoice_date: date,
                      total_amount: openingBalance,
                      subtotal: openingBalance,
                      status: 'posted',
                      notes: 'رصيد افتتاحي'
                  });
              } // Use handleError for consistency

              setFormData(prev => ({ ...prev, customerId: data.id })); // اختيار العميل الجديد
              setNewCustomerName('');
              setNewCustomerPhone('');
              setNewCustomerOpeningBalance('');
              setIsCustomerModalOpen(false);
          } catch (err: any) { 
              console.error('Error creating customer:', err);
              showToast(err?.message || 'فشل إنشاء العميل', 'error');
          }
      }
  };

  const handleEditCustomerClick = () => {
      const customer = customers.find(c => c.id === formData.customerId);
      if (customer) {
          setEditCustomerData({ name: customer.name, phone: customer.phone || '' });
          setIsEditCustomerModalOpen(true);
      }
  };

  const handleUpdateCustomerSubmit = async (e: React.FormEvent) => {
      e.preventDefault();
      
      // التحقق من صحة البيانات باستخدام Zod
      const validationResult = createCustomerSchema.safeParse({
          name: editCustomerData.name,
          phone: editCustomerData.phone,
          email: '',
          tax_number: '',
          address: '',
          credit_limit: 0
      });

      if (!validationResult.success) {
          const nameError = validationResult.error.issues.find(i => i.path[0] === 'name');
          const phoneError = validationResult.error.issues.find(i => i.path[0] === 'phone');
          if (nameError) { showToast(nameError.message, 'warning'); return; }
          if (phoneError) { showToast(phoneError.message, 'warning'); return; }
      }

      if (formData.customerId && editCustomerData.name) {
          try {
              await updateCustomer(formData.customerId, { name: editCustomerData.name, phone: editCustomerData.phone });
              setCustomerSearchTerm(editCustomerData.name);
              setIsEditCustomerModalOpen(false);
              showToast('تم تحديث بيانات العميل بنجاح', 'success');
          } catch (err: any) {
              console.error('Error updating customer:', err);
              showToast(err?.message || 'فشل تحديث العميل', 'error');
          }
      }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const isPosted = formData.status === 'posted' || formData.status === 'paid';

    if (editingId && isPosted && currentUserRole !== 'admin' && currentUserRole !== 'super_admin' && !can('sales', 'update')) { // Use handleError for consistency
        showToast('لا تملك صلاحية تعديل الفواتير المرحلة. يرجى إنشاء إشعار دائن', 'warning'); // Use handleError for consistency
        return;
    }

    // التحقق باستخدام Zod
    const validationData = {
        customerId: formData.customerId,
        invoiceNumber: formData.invoiceNumber || 'TEMP-INV', // قيمة مؤقتة للتحقق إذا كان الرقم تلقائياً
        invoiceDate: formData.date,
        dueDate: formData.dueDate,
        items: items.map(i => ({
            productId: i.productId,
            quantity: i.quantity,
            unitPrice: i.unitPrice,
            total: i.total
        })),
        notes: formData.notes
    };

    const validationResult = createInvoiceSchema.safeParse(validationData);
    if (!validationResult.success) {
        const errorMessage = validationResult.error.issues[0].message;
        showToast(errorMessage, 'warning');
        return;
    }

    if (formData.paidAmount > 0 && !formData.treasuryId) {
        showToast('يرجى اختيار الخزينة أو البنك لاستلام المبلغ المدفوع', 'warning');
        return;
    }
    
    // Check stock availability
    if (!settings.allowNegativeStock) { // Use handleError for consistency
        for (const item of items) {
            const product = products.find(p => p.id === item.productId);
            const selectedWarehouse = warehouses.find(w => w.id === formData.warehouseId);
            
            // 🛡️ ذكاء تعدد الوحدات: تحويل الكمية المدخولة للكمية الأساسية للمقارنة بالمخزون
            const selectedUom = uoms.find(u => u.id === item.uomId);
            const baseQuantity = item.quantity * (selectedUom?.ratio || 1);
            
            // 🛡️ إصلاح: الوصول للمخزون باستخدام الاسم الصحيح للعمود في قاعدة البيانات (warehouse_stock)
            const warehouseStock = (product as any)?.warehouse_stock || (product as any)?.warehouseStock;
            const stockInWarehouse = Number(warehouseStock?.[formData.warehouseId] || 0);

            if (baseQuantity > stockInWarehouse) {
                showToast(`❌ [عجز مخزني]: الصنف "${item.productName}" رصيده (${stockInWarehouse}) قطعة، والمطلوب صرفه يعادل (${baseQuantity.toFixed(2)}) قطعة.`, 'error');
                setSaving(false);
                return;
            }
        }
    }

    // 🛑 التحقق من الحد الأدنى لسعر البيع المسموح به
    for (const item of items) {
        const product = products.find(p => p.id === item.productId);
        const minPrice = Number((product as any)?.min_sales_price || (product as any)?.minSalesPrice || 0);
        if (minPrice > 0) {
            const selectedUom = uoms.find(u => u.id === item.uomId);
            const ratio = selectedUom?.ratio || 1;
            const effectiveMinPrice = minPrice * ratio;
            if (item.unitPrice < effectiveMinPrice) {
                showToast(`❌ [حظر بيع]: سعر بيع الصنف "${item.productName}" (${item.unitPrice}) أقل من الحد الأدنى المسموح به (${effectiveMinPrice})`, 'error');
                setSaving(false);
                return;
            }
        }
    }

    setSaving(true);
    // ... (تم حذف الفحص المكرر والتنبيهات المزعجة لتبسيط الواجهة)

    try {
        const { data: profile } = await supabase.from('profiles').select('organization_id').eq('id', currentUser?.id).single();
        const userOrgId = profile?.organization_id;

        if (!userOrgId) {
            throw new AppError('فشل تحديد هوية الشركة، يرجى إعادة تسجيل الدخول', 'ORG_ID_MISSING', 'critical');
        }

    if (currentUserRole === 'demo') { // Use handleError for consistency
        await new Promise(resolve => setTimeout(resolve, 600));
        
        const demoInvoiceNumber = formData.invoiceNumber || `INV-DEMO-${Math.floor(Math.random() * 10000)}`;
        const promoNotes = appliedPromotions.length > 0 
            ? ` [عروض مطبقة: ${appliedPromotions.map(p => p.promoName).join(' | ')}]`
            : '';
        const finalNotes = (formData.notes || '') + (formData.notes?.includes('[عروض مطبقة:') ? '' : promoNotes);

        const demoInvoice = {
            id: `demo-inv-${Date.now()}`,
            invoiceNumber: demoInvoiceNumber,
            customerName: customers.find(c => c.id === formData.customerId)?.name || 'عميل ديمو',
            customerId: formData.customerId,
            date: formData.date,
            totalAmount: totalAmount,
            taxAmount: taxAmount,
            subtotal: subtotal,
            discount_amount: discountAmount,
            notes: finalNotes,
            status: 'draft',
            items: items,
            paid_amount: formData.paidAmount,
        };
        // Use handleError for consistency
        addDemoInvoice(demoInvoice);
        setSuccessMessage('تم حفظ الفاتورة كمسودة بنجاح! (محاكاة)');
        setItems([]);
        setFormData(prev => ({ ...prev, notes: '', paidAmount: 0, discountValue: 0, invoiceNumber: '' }));
        setTimeout(() => setSuccessMessage(null), 4000);
        setSaving(false);
        return;
    }

    // توليد رقم فاتورة فريد مرة واحدة لاستخدامه في القيد والفاتورة
    const invoiceNumber = formData.invoiceNumber || await getNextDocumentNumber(userOrgId, 'invoice');
    const promoNotes = appliedPromotions.length > 0 
        ? ` [عروض مطبقة: ${appliedPromotions.map(p => p.promoName).join(' | ')}]`
        : '';
    const finalNotes = (formData.notes || '') + (formData.notes?.includes('[عروض مطبقة:') ? '' : promoNotes);

        // Prepare invoice data
        const invoiceData = {
            organization_id: userOrgId,
            invoice_number: invoiceNumber,
            customer_id: formData.customerId,
            warehouse_id: formData.warehouseId,
            salesperson_id: (formData.salespersonId && formData.salespersonId !== '00000000-0000-0000-0000-000000000000') ? formData.salespersonId : null,
            invoice_date: formData.date ? formData.date : new Date().toISOString().split('T')[0],
            total_amount: Number(totalAmount),
            tax_amount: Number(taxAmount),
            notes: finalNotes,
            status: editingId ? formData.status : 'draft', // الحفاظ على الحالة الأصلية عند التعديل
            subtotal: subtotal,
            discount_amount: discountAmount,
            promo_discount: totalPromoDiscount,
            paid_amount: formData.paidAmount,
            treasury_account_id: formData.paidAmount > 0 ? formData.treasuryId : null,
            currency: formData.currency,
            exchange_rate: formData.exchangeRate,
            cost_center_id: formData.costCenterId || null,
            created_by: currentUser?.id
        };

        let invoiceId = editingId;

        const itemsToInsert = items.map(item => {
            const product = products.find(p => p.id === item.productId);
            const selectedUom = uoms.find(u => u.id === item.uomId);
            const uomRatio = selectedUom?.ratio || 1;
            
            // 🛡️ ذكاء محاسبي: التكلفة المسجلة للفاتورة = (تكلفة القطعة الأساسية * معامل الوحدة المختارة)
            const unitCostForSelectedUom = (product?.cost || product?.purchase_price || 0) * uomRatio;

            return {
                organization_id: userOrgId,
                product_id: item.productId,
                quantity: Number(item.quantity),
                unit_price: Number(item.unitPrice),
                uom_id: item.uomId || null,
                total: Number(item.total),
                cost: Number(unitCostForSelectedUom.toFixed(4))
            };
        });

        // 🛡️ محاولة الحفظ الذري المباشر عبر RPC أولاً لضمان عدم فقدان البنود أو ترك سجلات يتيمة
        const payloadInvoice = { ...invoiceData, ...(editingId ? { id: editingId } : {}) };
        const { data: rpcSaved, error: rpcError } = await supabase.rpc('save_sales_invoice_draft', {
            p_invoice: payloadInvoice,
            p_items: itemsToInsert
        });

        if (!rpcError && rpcSaved && rpcSaved.id) {
            invoiceId = rpcSaved.id;
        } else {
            // Fallback آمن في حال عدم تشغيل دالة الهجرة بعد
            if (editingId) {
                // Update existing invoice
                const { error: updateError } = await supabase.from('invoices').update(invoiceData).eq('id', editingId);
                
                if (updateError) {
                    if (updateError.code === '23505') {
                        throw new AppError('رقم الفاتورة مكرر. يرجى استخدام رقم آخر أو تعديل الفاتورة الحالية.', 'DUPLICATE_INV_NO', 'high');
                    }
                    throw updateError;
                }
                
                // Delete old items to replace with new ones
                await supabase.from('invoice_items').delete().eq('invoice_id', editingId);
            } else {
                // Insert new invoice
                const { data: invoice, error: insertError } = await supabase.from('invoices').insert(invoiceData).select().single();
                if (insertError) {
                    if (insertError.code === '23505') {
                        throw new AppError('رقم الفاتورة هذا مسجل مسبقاً. يرجى استخدام رقم آخر.', 'DUPLICATE_INV_NO', 'high');
                    }
                    throw insertError;
                }
                invoiceId = invoice.id;
            }

            // Insert items
            if (invoiceId) {
                const itemsWithInv = itemsToInsert.map(it => ({ ...it, invoice_id: invoiceId }));
                const { error: itemsError } = await supabase.from('invoice_items').insert(itemsWithInv);
                if (itemsError) throw itemsError;
            }
        }

        // 🚀 الخطوة الذهبية: إذا كانت الفاتورة مرحلة، نطلب من السيرفر إعادة تحديث القيود والمخزون فوراً
        if ((invoiceData.status === 'posted' || invoiceData.status === 'paid') && invoiceId) {
            try {
                await approveInvoice(invoiceId, userOrgId, formData.warehouseId);
                showToast('تم تحديث الفاتورة والقيود المحاسبية بنجاح ✅', 'success');
            } catch (postErr: any) {
                console.error("Error approving sales invoice:", postErr);
                showToast('تم حفظ الفاتورة ولكن تعذر ترحيل القيود تلقائياً: ' + (postErr.message || ''), 'warning');
            }
        } else {
            setSuccessMessage('تم حفظ الفاتورة كمسودة بنجاح!');
        }

        if (convertedQuotationId) {
            try {
                await supabase.from('quotations').update({ status: 'converted' }).eq('id', convertedQuotationId);
            } catch (qErr) {
                console.error("Error updating quotation status:", qErr);
            }
        }

        // 🛡️ تسجيل العملية في سجل التدقيق والتتبع
        if (invoiceId) {
            logDocumentAction({
                documentType: 'sales_invoice',
                documentId: String(invoiceId),
                action: (invoiceData.status === 'posted' || invoiceData.status === 'paid') ? 'posted' : (editingId ? 'updated' : 'created'),
                details: {
                    invoice_number: invoiceNumber,
                    total_amount: totalAmount,
                    customer_id: formData.customerId,
                    items_count: items.length,
                    note: editingId ? `تم تعديل فاتورة المبيعات رقم ${invoiceNumber}` : `تم إنشاء فاتورة مبيعات رقم ${invoiceNumber}`
                },
                userId: currentUser?.id,
                userName: (currentUser as any)?.name || (currentUser as any)?.email || 'المستخدم'
            });
        }

        // تفريغ النموذج
        try {
            secureStorage.removeItem('tripro_sales_invoice_draft');
        } catch (e) {}
        setItems([]);
        setFormData(prev => ({
            ...prev,
            notes: '',
            paidAmount: 0,
            discountValue: 0,
            invoiceNumber: ''
        }));
        setEditingId(null);
        setEtaDetails({
            status: 'draft',
            uuid: '',
            submissionId: '',
            qrCode: '',
            error: ''
        });
        setSubmittingToEta(false);
        setTimeout(() => setSuccessMessage(null), 4000);

        // 🚀 صمام أمان: التوجه للسجل لمنع التكرار عند النقر المتعدد
        if (editingId) {
            setSaving(false);
            navigate('/invoices-list');
            return;
        }
        if(barcodeInputRef.current) barcodeInputRef.current.focus();

    } catch (err: any) {
        console.error("فشل حفظ الفاتورة", err);
        handleError(err, { showNotification: showToast, context: { operation: 'حفظ الفاتورة' } });
    } finally {
        setSaving(false);
    }
  };

  const handleSaveAndPost = async () => {
    // Same validations as handleSubmit
    if (editingId) {
        showToast('لا يمكن ترحيل فاتورة معدلة. يرجى الحفظ كمسودة أولاً', 'warning');
        return;
    }
    
    // التحقق باستخدام Zod
    const validationData = {
        customerId: formData.customerId,
        invoiceNumber: formData.invoiceNumber || 'TEMP-INV',
        invoiceDate: formData.date,
        dueDate: formData.dueDate,
        items: items.map(i => ({
            productId: i.productId,
            quantity: i.quantity,
            unitPrice: i.unitPrice,
            total: i.total
        })),
        notes: formData.notes
    };
    const validationResult = createInvoiceSchema.safeParse(validationData);
    if (!validationResult.success) {
        showToast(validationResult.error.issues[0].message, 'warning');
        return;
    }

    if (formData.paidAmount > 0 && !formData.treasuryId) {
        showToast('يرجى اختيار الخزينة أو البنك لاستلام المبلغ المدفوع', 'warning'); // Use handleError for consistency
        return;
    }
    if (!settings.allowNegativeStock) { // Use handleError for consistency
        for (const item of items) {
            const product = products.find(p => p.id === item.productId);
            const selectedWarehouse = warehouses.find(w => w.id === formData.warehouseId);
            // 🛡️ إصلاح: الوصول للمخزون باستخدام الاسم الصحيح للعمود في قاعدة البيانات (warehouse_stock)
            const warehouseStock = (product as any)?.warehouse_stock || (product as any)?.warehouseStock;
            const stockInWarehouse = Number(warehouseStock?.[formData.warehouseId] || 0);
            if (item.quantity > stockInWarehouse) { 
                showToast(`❌ [عجز مخزني]: الصنف "${item.productName}" رصيده (${stockInWarehouse}) في مستودع "${selectedWarehouse?.name || 'المختار'}"، والمطلوب (${item.quantity}). يرجى اختيار المستودع الصحيح.`, 'error');
                return;
            }
        }
    }

    // 🛑 التحقق من الحد الأدنى لسعر البيع المسموح به
    for (const item of items) {
        const product = products.find(p => p.id === item.productId);
        const minPrice = Number((product as any)?.min_sales_price || (product as any)?.minSalesPrice || 0);
        if (minPrice > 0) {
            const selectedUom = uoms.find(u => u.id === item.uomId);
            const ratio = selectedUom?.ratio || 1;
            const effectiveMinPrice = minPrice * ratio;
            if (item.unitPrice < effectiveMinPrice) {
                showToast(`❌ [حظر بيع]: سعر بيع الصنف "${item.productName}" (${item.unitPrice}) أقل من الحد الأدنى المسموح به (${effectiveMinPrice})`, 'error');
                return;
            }
        }
    }

    setSaving(true);

    const { data: profile } = await supabase.from('profiles').select('organization_id').eq('id', currentUser?.id).single();
    const userOrgId = profile?.organization_id;

    if (!userOrgId) { // Use handleError for consistency
        showToast('فشل تحديد هوية الشركة، يرجى إعادة تسجيل الدخول', 'error');
        setSaving(false);
        return;
    }

    if (currentUserRole === 'demo') {
        await new Promise(resolve => setTimeout(resolve, 600));
        // Use handleError for consistency
        const demoInvoiceNumber = formData.invoiceNumber || `INV-DEMO-${Math.floor(Math.random() * 10000)}`;
        const demoInvoice = {
            id: `demo-inv-${Date.now()}`,
            invoiceNumber: demoInvoiceNumber,
            customerName: customers.find(c => c.id === formData.customerId)?.name || 'عميل ديمو',
            customerId: formData.customerId,
            date: formData.date,
            totalAmount: totalAmount,
            taxAmount: taxAmount,
            subtotal: subtotal,
            items: items,
            paid_amount: formData.paidAmount,
            treasuryId: formData.treasuryId
        };
        // Use handleError for consistency
        postDemoSalesInvoice(demoInvoice);
        setSuccessMessage('تم حفظ الفاتورة وترحيلها بنجاح!');
        setItems([]);
        setFormData(prev => ({ ...prev, notes: '', paidAmount: 0, discountValue: 0, invoiceNumber: '' }));
        setTimeout(() => setSuccessMessage(null), 4000);
        setSaving(false);
        return;
    }
    
    try {
        // --- 1. Save Invoice Data (similar to handleSubmit) ---
        const invoiceNumber = formData.invoiceNumber || await getNextDocumentNumber(userOrgId, 'invoice');
        const invoiceData = {
            organization_id: userOrgId,
            invoice_number: invoiceNumber,
            customer_id: formData.customerId,
            warehouse_id: formData.warehouseId,
            salesperson_id: (formData.salespersonId && formData.salespersonId !== '00000000-0000-0000-0000-000000000000') ? formData.salespersonId : null,
            invoice_date: formData.date ? formData.date : new Date().toISOString().split('T')[0],
            total_amount: Number(totalAmount),
            tax_amount: Number(taxAmount),
            notes: (formData.notes || '') + (formData.notes?.includes('[عروض مطبقة:') ? '' : (appliedPromotions.length > 0 ? ` [عروض مطبقة: ${appliedPromotions.map(p => p.promoName).join(' | ')}]` : '')),
            status: 'draft', // Always save as draft first
            subtotal: subtotal,
            discount_amount: discountAmount,
            promo_discount: totalPromoDiscount,
            paid_amount: formData.paidAmount,
            treasury_account_id: formData.paidAmount > 0 ? formData.treasuryId : null,
            currency: formData.currency,
            exchange_rate: formData.exchangeRate,
            cost_center_id: formData.costCenterId || null,
            created_by: currentUser?.id
        };

        const { data: invoice, error: insertError } = await supabase.from('invoices').insert(invoiceData).select().single();
        if (insertError) { // Use handleError for consistency
            if (insertError.code === '23505') {
                throw new Error('رقم الفاتورة مكرر. يرجى تغيير الرقم أو الحفظ كمسودة أولاً.');
            }
            throw insertError;
        }
        const invoiceId = invoice.id;

        const itemsToInsert = items.map(item => {
            const product = products.find(p => p.id === item.productId);
            return {
                organization_id: userOrgId,
                invoice_id: invoiceId,
                product_id: item.productId,
                quantity: Number(item.quantity),
                unit_price: Number(item.unitPrice),
                uom_id: item.uomId || null,
                total: Number(item.total),
                cost: product?.cost || product?.purchase_price || 0
            };
        });

        const { error: itemsError } = await supabase.from('invoice_items').insert(itemsToInsert);
        if (itemsError) throw itemsError; // Use handleError for consistency

        // --- 2. Approve the newly created invoice ---
        // تحديث: تمرير المعاملات الجديدة p_org_id و p_warehouse_id لتجنب أخطاء التواقيع المفقودة
        await approveInvoice(invoiceId, userOrgId, formData.warehouseId);

        if (convertedQuotationId) {
            try {
                await supabase.from('quotations').update({ status: 'posted' }).eq('id', convertedQuotationId);
            } catch (qErr) {
                console.error("Error updating quotation status:", qErr);
            }
        }

        // --- 3. Handle UI feedback and form reset ---
        setSuccessMessage('تم حفظ الفاتورة وترحيلها بنجاح!');
        try {
            secureStorage.removeItem('tripro_sales_invoice_draft');
        } catch (e) {}
        setItems([]);
        setFormData(prev => ({ ...prev, notes: '', paidAmount: 0, discountValue: 0, invoiceNumber: '' }));
        setEditingId(null);
        setTimeout(() => setSuccessMessage(null), 4000);
        if(barcodeInputRef.current) barcodeInputRef.current.focus();

    } catch (err: any) {
        console.error("فشل الحفظ والترحيل", err);
        handleError(err, { showNotification: showToast, context: { operation: 'حفظ وترحيل الفاتورة' } });
    } finally {
        setSaving(false);
    }
  };

  const getProductStock = (productId?: string) => {
      if (!productId) return 0;
      const product = products.find(p => p.id === productId);
      const warehouseStock = (product as any)?.warehouse_stock || (product as any)?.warehouseStock || {};
      if (formData.warehouseId) {
        return Number(warehouseStock[formData.warehouseId] || 0);
      }
      return Number(product?.stock || 0);
  };

  const handleSubmitToETA = async () => {
    if (!editingId) return;
    setSubmittingToEta(true);
    showToast('جاري توقيع المستند وإرساله لمصلحة الضرائب... 📝', 'info');
    try {
      const response = await etaService.submitInvoiceToETA(editingId);
      if (response.success) {
        showToast('تم إرسال الفاتورة للمصلحة بنجاح وصالحة ✅', 'success');
        setEtaDetails({
          status: 'valid',
          uuid: response.uuid || '',
          submissionId: response.submissionId || '',
          qrCode: response.qrCodeUrl || '',
          error: ''
        });
      } else {
        showToast(`فشل الربط الضريبي: ${response.error}`, 'error');
        setEtaDetails(prev => ({
          ...prev,
          status: 'failed',
          error: response.error || ''
        }));
      }
    } catch (error: any) {
      showToast(`خطأ في الإرسال: ${error.message}`, 'error');
    } finally {
      setSubmittingToEta(false);
    }
  };

  const handlePrint = () => {
      const printData = {
          invoiceNumber: formData.invoiceNumber || 'مسودة',
          date: formData.date,
          customerName: customers.find(c => c.id === formData.customerId)?.name || 'عميل نقدي',
          status: formData.status,
          subtotal: subtotal,
          discountAmount: discountAmount,
          taxAmount: taxAmount,
          totalAmount: totalAmount,
          currency: formData.currency || 'EGP',
          isThermal: false,
          items: items.map(item => ({
              productName: item.productName || item.product_name || products.find(p => p.id === (item.productId || item.product_id))?.name || 'صنف',
              uomName: uoms.find(u => u.id === (item.uomId || item.uom_id))?.name || '',
              quantity: Number(item.quantity || 0),
              unitPrice: Number(item.unitPrice ?? item.unit_price ?? 0),
              total: Number(item.total ?? (Number(item.quantity || 0) * Number(item.unitPrice ?? item.unit_price ?? 0)))
          }))
      };
      setInvoiceToPrint(printData);
  };

  const handleThermalPrint = () => {
      const printData = {
          invoiceNumber: formData.invoiceNumber || 'مسودة',
          date: formData.date,
          customerName: customers.find(c => c.id === formData.customerId)?.name || 'عميل نقدي',
          status: formData.status,
          subtotal: subtotal,
          discountAmount: discountAmount,
          taxAmount: taxAmount,
          totalAmount: totalAmount,
          currency: formData.currency || 'EGP',
          isThermal: true,
          items: items.map(item => ({
              productName: item.productName || item.product_name || products.find(p => p.id === (item.productId || item.product_id))?.name || 'صنف',
              uomName: uoms.find(u => u.id === (item.uomId || item.uom_id))?.name || '',
              quantity: Number(item.quantity || 0),
              unitPrice: Number(item.unitPrice ?? item.unit_price ?? 0),
              total: Number(item.total ?? (Number(item.quantity || 0) * Number(item.unitPrice ?? item.unit_price ?? 0)))
          }))
      };
      setInvoiceToPrint(printData);
  };

  const handleCreateCreditNote = () => {
      navigate('/credit-note', { state: { 
          customerId: formData.customerId, 
          amount: totalAmount,
          notes: `تسوية للفاتورة رقم ${formData.invoiceNumber}`
      }});
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6 pb-20 animate-in fade-in duration-500">
      <div className={invoiceToPrint ? 'print:hidden' : ''}>
      
      {/* تنبيه للعملاء الجدد في حال عدم وجود مستودعات */}
      {warehouses.length === 0 && (
        <div className="bg-amber-50 border-2 border-amber-200 p-5 rounded-[2rem] mb-6 flex flex-col md:flex-row items-center justify-between gap-4 animate-in slide-in-from-top-4 shadow-sm">
          <div className="flex items-center gap-4">
          <div className="bg-amber-100 p-3 rounded-2xl">
            <AlertCircle className="text-amber-600" size={28} />
          </div>
          <div>
            <h4 className="font-black text-amber-900 text-lg">تنبيه: لم يتم إعداد المخازن بعد</h4>
            <p className="text-amber-700 font-medium">يرجى إضافة مستودع واحد على الأقل لتتمكن من إصدار الفواتير بنجاح.</p>
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

      {/* تنبيه للعملاء الجدد في حال عدم وجود خزينة */}
      {treasuryAccounts.length === 0 && (
        <div className="bg-blue-50 border-2 border-blue-200 p-5 rounded-[2rem] mb-6 flex flex-col md:flex-row items-center justify-between gap-4 animate-in slide-in-from-top-4 shadow-sm">
          <div className="flex items-center gap-4">
            <div className="bg-blue-100 p-3 rounded-2xl">
              <Wallet className="text-blue-600" size={28} />
            </div>
            <div>
              <h4 className="font-black text-blue-900 text-lg">تنبيه: لم يتم إعداد الخزينة</h4>
              <p className="text-blue-700 font-medium">يرجى إضافة "خزينة" أو "بنك" واحد على الأقل لتتمكن من تحصيل المبالغ النقدية بنجاح.</p>
            </div>
          </div>
          <button 
            onClick={() => navigate('/accounts')} 
            className="bg-blue-600 text-white px-6 py-3 rounded-2xl font-black hover:bg-blue-700 transition-all shadow-md flex items-center gap-2 whitespace-nowrap"
          >
            <Plus size={20} /> تهيئة الحسابات
          </button>
        </div>
      )}

      {/* Top Banner & Navigation Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white p-5 rounded-3xl shadow-sm border border-slate-200">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-blue-50 text-blue-600 rounded-2xl">
            <ShoppingCart size={28} />
          </div>
          <div>
            <h2 className="text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2">
              {editingId ? `فاتورة مبيعات: ${formData.invoiceNumber}` : 'فاتورة مبيعات جديدة'}
              {editingId && (
                <span className={`text-xs px-2.5 py-0.5 rounded-full font-bold ${
                  (formData.status === 'posted' || formData.status === 'paid')
                    ? (formData.status === 'paid' ? 'bg-emerald-100 text-emerald-700' : 'bg-blue-100 text-blue-700')
                    : 'bg-amber-100 text-amber-700'
                }`}>
                  {formData.status === 'paid' ? 'مرحلة (مسددة) ✅' : formData.status === 'posted' ? 'مرحلة ✅' : 'مسودة 📝'}
                </span>
              )}
            </h2>
            <p className="text-xs text-slate-400 font-bold">تجهيز طلب العميل وتسجيل الحركات المخزنية والمالية</p>
          </div>
        </div>

        {/* 🧭 أسهم التنقل بين فواتير المبيعات */}
        <div className="flex items-center gap-1 bg-slate-50 p-1.5 rounded-xl border border-slate-200 print:hidden">
          <button 
            type="button" 
            onClick={() => handleNavigate('first')} 
            disabled={invoiceIds.length === 0 || currentIndex === 0} 
            title="أول فاتورة"
            className="p-2 text-slate-600 hover:bg-white hover:text-blue-600 rounded-lg transition-all disabled:opacity-30 disabled:hover:bg-transparent"
          >
            <ChevronsRight size={18} />
          </button>
          
          <button 
            type="button" 
            onClick={() => handleNavigate('prev')} 
            disabled={invoiceIds.length === 0 || currentIndex <= 0} 
            title="الفاتورة السابقة"
            className="p-2 text-slate-600 hover:bg-white hover:text-blue-600 rounded-lg transition-all disabled:opacity-30 disabled:hover:bg-transparent"
          >
            <ChevronRight size={18} />
          </button>

          {/* Record Counter */}
          <div className="px-3 py-1 bg-white border border-slate-200 rounded-lg text-xs font-mono font-black text-slate-700 select-none">
            {loadingInvoice ? (
              <Loader2 size={14} className="animate-spin text-blue-600" />
            ) : editingId && currentIndex !== -1 ? (
              <span>{currentIndex + 1} / {invoiceIds.length}</span>
            ) : (
              <span className="text-blue-600 font-bold">جديد ➕</span>
            )}
          </div>

          <button 
            type="button" 
            onClick={() => handleNavigate('next')} 
            disabled={invoiceIds.length === 0 || currentIndex >= invoiceIds.length - 1 || currentIndex === -1} 
            title="الفاتورة التالية"
            className="p-2 text-slate-600 hover:bg-white hover:text-blue-600 rounded-lg transition-all disabled:opacity-30 disabled:hover:bg-transparent"
          >
            <ChevronLeft size={18} />
          </button>

          <button 
            type="button" 
            onClick={() => handleNavigate('last')} 
            disabled={invoiceIds.length === 0 || currentIndex >= invoiceIds.length - 1 || currentIndex === -1} 
            title="آخر فاتورة"
            className="p-2 text-slate-600 hover:bg-white hover:text-blue-600 rounded-lg transition-all disabled:opacity-30 disabled:hover:bg-transparent"
          >
            <ChevronsLeft size={18} />
          </button>
        </div>
        
        {/* Action Buttons */}
        <div className="flex flex-wrap items-center gap-2 print:hidden">
          <button 
            type="button" 
            onClick={() => navigate('/invoices-list')} 
            className="bg-slate-100 text-slate-700 hover:bg-slate-200 px-3 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors"
            title="عرض سجل فواتير المبيعات"
          >
            <List size={16} /> سجل الفواتير
          </button>

          <button 
            type="button" 
            onClick={handleNewInvoice} 
            className="bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100 px-3 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors"
            title="بدء فاتورة مبيعات جديدة"
          >
            <Plus size={16} /> جديد
          </button>

          <button 
            type="button" 
            onClick={handlePrint} 
            className="bg-slate-800 text-white hover:bg-slate-700 px-3 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-sm transition-colors"
            title="طباعة الفاتورة A4"
          >
            <Printer size={16} /> A4
          </button>

          <button 
            type="button" 
            onClick={handleThermalPrint} 
            className="bg-slate-700 text-white hover:bg-slate-600 px-3 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-sm transition-colors"
            title="طباعة حرارية"
          >
            <Printer size={16} /> حراري
          </button>

          {editingId && (
            <button 
              type="button" 
              onClick={handleDeleteCurrent} 
              disabled={deleting} 
              className="bg-red-50 text-red-700 border border-red-200 hover:bg-red-100 px-3 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors disabled:opacity-50"
              title="حذف هذه الفاتورة"
            >
              {deleting ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />} حذف
            </button>
          )}
        </div>
      </div>

      <form onSubmit={handleSubmit} className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        
        {/* Main Content Area (Left 8 cols) */}
        <fieldset disabled={formData.status !== 'draft' && !can('sales', 'update')} className="lg:col-span-8 space-y-6">
            
            {/* Customer & Logistics Card */}
            <InvoiceHeader
              formData={formData}
              setFormData={setFormData}
              customers={customers}
              customerSearchTerm={customerSearchTerm}
              setCustomerSearchTerm={setCustomerSearchTerm}
              showCustomerDropdown={showCustomerDropdown}
              setShowCustomerDropdown={setShowCustomerDropdown}
              customerBalance={customerBalance}
              isRefreshingBalance={isRefreshingBalance}
              handleRefreshBalance={handleRefreshBalance}
              setIsStatementModalOpen={setIsStatementModalOpen}
              handleEditCustomerClick={handleEditCustomerClick}
              setIsCustomerModalOpen={setIsCustomerModalOpen}
              isOverLimit={isOverLimit}
              selectedCustomer={selectedCustomer}
              totalProjectedDebt={totalProjectedDebt}
              salespeople={salespeople}
              warehouses={warehouses}
              pricingTier={pricingTier}
              setPricingTier={setPricingTier}
            />

            {/* Invoice Items Management */}
            <InvoiceItemsTable
              barcodeInputRef={barcodeInputRef}
              productSearchTerm={productSearchTerm}
              setProductSearchTerm={setProductSearchTerm}
              showProductResults={showProductResults}
              setShowProductResults={setShowProductResults}
              handleBarcodeSearch={handleBarcodeSearch}
              filteredProducts={filteredProducts}
              addProductToInvoice={addProductToInvoice}
              getProductStock={getProductStock}
              isOfferActive={isOfferActive}
              getProductHypermarketOffer={getProductHypermarketOffer}
              getProductPrice={getProductPrice}
              formData={formData}
              items={items}
              products={products}
              appliedPromotions={appliedPromotions}
              activeStockViewer={activeStockViewer}
              setActiveStockViewer={setActiveStockViewer}
              uoms={uoms}
              handleItemChange={handleItemChange}
              removeItem={removeItem}
              settings={settings}
              currentUserRole={currentUserRole}
            />

            {/* Notes Section */}
            <div className="bg-white rounded-3xl shadow-sm border border-slate-200 p-6">
                 <label className="text-sm font-black text-slate-700 flex items-center gap-2 mb-4">
                    <Info className="text-slate-400" size={18} /> ملاحظات الفاتورة
                </label>
                <textarea 
                    rows={3}
                    value={formData.notes}
                    onChange={(e) => setFormData({...formData, notes: e.target.value})}
                    className="w-full border-2 border-slate-50 hover:border-slate-100 rounded-2xl px-4 py-3 text-sm focus:outline-none focus:border-blue-500 bg-slate-50 transition-all placeholder-slate-300"
                    placeholder="شروط السداد، تفاصيل التوصيل، أو أي ملاحظات إضافية للعميل..."
                ></textarea>
            </div>
        </fieldset>

        {/* Sidebar Summary (Right 4 cols) */}
        <InvoiceSummary
          formData={formData}
          setFormData={setFormData}
          subtotal={subtotal}
          totalPromoDiscount={totalPromoDiscount}
          appliedPromotions={appliedPromotions}
          discountAmount={discountAmount}
          settings={settings}
          taxRate={taxRate}
          taxAmount={taxAmount}
          totalAmount={totalAmount}
          treasuryAccounts={treasuryAccounts}
          remainingBalance={remainingBalance}
          handleUnpostInvoice={handleUnpostInvoice}
          handleCreateCreditNote={handleCreateCreditNote}
          handleSaveAndPost={handleSaveAndPost}
          handlePrint={handlePrint}
          saving={saving}
          isRefreshingBalance={isRefreshingBalance}
          items={items}
          editingId={editingId}
          companySettings={companySettings}
          etaDetails={etaDetails}
          handleSubmitToETA={handleSubmitToETA}
          submittingToEta={submittingToEta}
        />
      </form>

      {/* 🕒 سجل التدقيق والتتبع الزمني */}
      {editingId && (
        <DocumentAuditTimeline
          documentType="sales_invoice"
          documentId={editingId}
          documentCreatedAt={formData.date}
        />
      )}

      {/* Quick Customer Modals (Add / Edit) */}
      <QuickCustomerModals
        isCustomerModalOpen={isCustomerModalOpen}
        setIsCustomerModalOpen={setIsCustomerModalOpen}
        newCustomerName={newCustomerName}
        setNewCustomerName={setNewCustomerName}
        newCustomerPhone={newCustomerPhone}
        setNewCustomerPhone={setNewCustomerPhone}
        newCustomerOpeningBalance={newCustomerOpeningBalance}
        setNewCustomerOpeningBalance={setNewCustomerOpeningBalance}
        handleQuickAddCustomer={handleQuickAddCustomer}
        isEditCustomerModalOpen={isEditCustomerModalOpen}
        setIsEditCustomerModalOpen={setIsEditCustomerModalOpen}
        editCustomerData={editCustomerData}
        setEditCustomerData={setEditCustomerData}
        handleUpdateCustomerSubmit={handleUpdateCustomerSubmit}
      />


      {/* Customer Statement Modal */}
      {isStatementModalOpen && (
          <div className="fixed inset-0 bg-black/70 z-[70] flex items-center justify-center p-4 backdrop-blur-md">
              <div className="bg-white rounded-3xl shadow-2xl w-full max-w-5xl h-[90vh] overflow-hidden flex flex-col animate-in zoom-in duration-300">
                  <div className="bg-slate-50 px-6 py-4 border-b border-slate-100 flex justify-between items-center shrink-0">
                      <h3 className="font-black text-xl text-slate-800">كشف حساب العميل</h3>
                      <button onClick={() => setIsStatementModalOpen(false)} className="p-2 hover:bg-red-50 hover:text-red-500 rounded-full transition-colors">
                        <X size={24} />
                      </button>
                  </div>
                  <div className="flex-1 overflow-y-auto p-6 bg-slate-50/50">
                      <CustomerStatement initialCustomerId={formData.customerId} />
                  </div>
              </div>
          </div>
      )}

      <ThermalInvoicePrintTemplate
        settings={settings}
        invoiceNumber={formData.invoiceNumber}
        customerName={customers.find(c => c.id === formData.customerId)?.name}
        salespersonName={salespeople.find(s => s.id === formData.salespersonId)?.name}
        items={items}
        uoms={uoms}
        subtotal={subtotal}
        discountAmount={discountAmount}
        taxRate={taxRate}
        taxAmount={taxAmount}
        totalAmount={totalAmount}
      />
      </div>

      <SalesInvoicePrint invoice={invoiceToPrint} companySettings={companySettings} />
    </div>
  );
};

export default SalesInvoiceForm;

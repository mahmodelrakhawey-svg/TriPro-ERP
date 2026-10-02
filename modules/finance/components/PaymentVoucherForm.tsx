import React, { useState, useEffect, useMemo, useRef } from 'react';
import { logger } from '../../../utils/logger';
import { supabase } from '../../../supabaseClient';
import { useAccounting } from '../../../context/AccountingContext';
import { useAuth } from '../../../context/AuthContext';
import { useToast } from '../../../context/ToastContext';
import { ArrowUpRight, Save, Loader2, User, Wallet, Calendar, FileText, Building2, ArrowRight, ArrowLeft, Plus, Search, Upload, Paperclip, X, CircleDollarSign, Download, Eye, Layers, Printer, MessageCircle, Edit, Receipt, CheckCircle2, ChevronDown, ChevronUp } from 'lucide-react';
import { PaymentVoucherPrint } from '../reports/PaymentVoucherPrint';
import { VoucherSchema } from '../../../utils/schemas';
import { useNavigate, useLocation } from 'react-router-dom';
import DocumentAuditTimeline from '../../../components/DocumentAuditTimeline';
import { logDocumentAction } from '../../../services/auditService';
import SupplierSearchSelect from '../../../components/SupplierSearchSelect';

const PaymentVoucherForm = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const DEMO_EMAIL = 'demo@tripro.com';
  const DEMO_USER_ID = 'demo-user-id';
  const { addEntry, vouchers, updateVoucher, costCenters, getSystemAccount, accounts, suppliers, can, addDemoPaymentVoucher, isDemo, organization } = useAccounting();
  const { currentUser } = useAuth();
  const { showToast } = useToast();
  const isSubmittingRef = useRef(false);
  
  const [formData, setFormData] = useState({
    supplierId: '',
    treasuryId: '',
    amount: 0,
    date: new Date().toISOString().split('T')[0],
    notes: '',
    voucherNumber: '',
    paymentMethod: 'cash',
    currency: 'EGP',
    exchangeRate: 1,
    costCenterId: ''
  });
  const [loading, setLoading] = useState(false);
  const [attachments, setAttachments] = useState<File[]>([]);
  const [isEditing, setIsEditing] = useState(false);
  const [currentVoucherId, setCurrentVoucherId] = useState<string | null>(null);
  const [existingAttachments, setExistingAttachments] = useState<any[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  
  // Ø¥Ø¶Ø§ÙØ© Ø­Ø§Ù„Ø© Ù„Ù„Ø±ØµÙŠØ¯ Ø§Ù„Ù„Ø­Ø¸ÙŠ Ø§Ù„Ù…Ø¨Ø§Ø´Ø± Ù…Ù† Ù‚Ø§Ø¹Ø¯Ø© Ø§Ù„Ø¨ÙŠØ§Ù†Ø§Øª
  const [dynamicBalance, setDynamicBalance] = useState<number | null>(null);
  const [supplierSearchTerm, setSupplierSearchTerm] = useState('');

  // ÙÙˆØ§ØªÙŠØ± Ø§Ù„Ù…Ø´ØªØ±ÙŠØ§Øª Ø§Ù„Ù…Ø¹Ù„Ù‚Ø© Ù„Ù„Ù…ÙˆØ±Ø¯ Ø§Ù„Ù…Ø®ØªØ§Ø±
  const [unpaidInvoices, setUnpaidInvoices] = useState<any[]>([]);
  const [loadingInvoices, setLoadingInvoices] = useState(false);
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<string | null>(null);
  const [showInvoicesPanel, setShowInvoicesPanel] = useState(true);

  // Ø¬Ù„Ø¨ ÙÙˆØ§ØªÙŠØ± Ø§Ù„Ù…Ø´ØªØ±ÙŠØ§Øª Ø§Ù„Ù…Ø³ØªØ­Ù‚Ø© Ù„Ù„Ù…ÙˆØ±Ø¯ ØªÙ„Ù‚Ø§Ø¦ÙŠØ§Ù‹ ÙÙˆØ± Ø§Ø®ØªÙŠØ§Ø±Ù‡
  useEffect(() => {
    const fetchUnpaidInvoices = async () => {
      if (!formData.supplierId) {
        setUnpaidInvoices([]);
        setSelectedInvoiceId(null);
        return;
      }
      const userOrgId = organization?.id;
      if (!userOrgId) return;

      setLoadingInvoices(true);
      try {
        const { data, error } = await supabase
          .from('purchase_invoices')
          .select('id, invoice_number, invoice_date, total_amount, paid_amount, status, notes')
          .eq('supplier_id', formData.supplierId)
          .eq('organization_id', userOrgId)
          .neq('status', 'draft')
          .neq('status', 'cancelled')
          .neq('status', 'paid')
          .order('invoice_date', { ascending: false });

        if (!error && data) {
          const pending = data.filter((inv: Record<string, any>) => {
            const remaining = Number(inv.total_amount || 0) - Number(inv.paid_amount || 0);
            return remaining > 0.001;
          });
          setUnpaidInvoices(pending);
        } else {
          setUnpaidInvoices([]);
        }
      } catch (err) {
        logger.error('Error fetching unpaid invoices:', err);
        showToast('ØªØ¹Ø°Ø± Ø¬Ù„Ø¨ ÙÙˆØ§ØªÙŠØ± Ø§Ù„Ù…ÙˆØ±Ø¯ ØºÙŠØ± Ø§Ù„Ù…Ø³Ø¯Ø¯Ø©: ' + (err?.message || ''), 'warning');
      } finally {
        setLoadingInvoices(false);
      }
    };

    fetchUnpaidInvoices();
  }, [formData.supplierId, organization?.id]);

  const handleSelectInvoiceForPayment = (invoice: Record<string, any>) => {
    if (selectedInvoiceId === invoice.id) {
      setSelectedInvoiceId(null);
      return;
    }
    setSelectedInvoiceId(invoice.id);
    const remaining = Math.max(0, Number(invoice.total_amount || 0) - Number(invoice.paid_amount || 0));
    setFormData(prev => ({
      ...prev,
      amount: remaining,
      notes: `Ø³Ø¯Ø§Ø¯ ÙØ§ØªÙˆØ±Ø© Ù…Ø´ØªØ±ÙŠØ§Øª Ø±Ù‚Ù… ${invoice.invoice_number || invoice.id?.slice(0, 8)}`
    }));
    showToast(`ØªÙ… ØªØ¹ÙŠÙŠÙ† Ù…Ø¨Ù„Øº Ø§Ù„ÙØ§ØªÙˆØ±Ø© (${remaining.toLocaleString()} ${formData.currency}) ÙˆØªØ­Ø¯ÙŠØ« Ø§Ù„Ø¨ÙŠØ§Ù† ØªÙ„Ù‚Ø§Ø¦ÙŠØ§Ù‹`, 'info');
  };

  // Ø§Ø³ØªØ®Ø±Ø§Ø¬ Ù…Ø¹Ù„Ù…Ø§Øª Ø§Ù„Ø±Ø§Ø¨Ø· Ø¥Ù† ÙˆØ¬Ø¯Øª
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const preSupplierId = params.get('supplierId');
    const preAmount = params.get('amount');
    const preNotes = params.get('notes');
    if (preSupplierId) {
      setFormData(prev => ({
        ...prev,
        supplierId: preSupplierId,
        amount: preAmount ? parseFloat(preAmount) || prev.amount : prev.amount,
        notes: preNotes ? decodeURIComponent(preNotes) : prev.notes
      }));
    }
  }, [location.search]);

  // ØªØµÙÙŠØ© Ø§Ù„Ù…ÙˆØ±Ø¯ÙŠÙ† Ø¨Ù†Ø§Ø¡Ù‹ Ø¹Ù„Ù‰ Ù†Øµ Ø§Ù„Ø¨Ø­Ø«
  const filteredSuppliers = useMemo(() => {
    return suppliers.filter(s => 
      (s.name || '').toLowerCase().includes(supplierSearchTerm.toLowerCase())
    );
  }, [suppliers, supplierSearchTerm]);

  // Ø¬Ù„Ø¨ Ø§Ù„Ø±ØµÙŠØ¯ Ø§Ù„Ø­Ù‚ÙŠÙ‚ÙŠ ÙÙˆØ± Ø§Ø®ØªÙŠØ§Ø± Ø§Ù„Ù…ÙˆØ±Ø¯ Ù„Ø¶Ù…Ø§Ù† Ø§Ù„Ù…Ø·Ø§Ø¨Ù‚Ø© Ù…Ø¹ ÙƒØ´Ù Ø§Ù„Ø­Ø³Ø§Ø¨
  useEffect(() => {
    const getRealBalance = async () => {
      if (!formData.supplierId) { setDynamicBalance(null); return; }
      
      const supplier: Record<string, any> | undefined = suppliers.find(s => s.id === formData.supplierId);
      if (!supplier) return;

      const userOrgId = organization?.id;
      if (!userOrgId) {
          setDynamicBalance(null);
          return;
      }

      const supplierAcc = getSystemAccount('SUPPLIERS');
      if (!supplierAcc) {
          logger.error("Supplier account not found for balance calculation.");
          setDynamicBalance(null);
          return;
      }

      // ðŸ›¡ï¸ Ø§Ù„Ø­Ù„ Ø§Ù„Ø´Ø§Ù…Ù„ ÙˆØ§Ù„Ù…ÙˆØ­Ø¯: Ø­Ø³Ø§Ø¨ Ø§Ù„Ø±ØµÙŠØ¯ Ø§Ù„ÙØ¹Ù„ÙŠ Ù„Ù„Ù…ÙˆØ±Ø¯ Ù…Ø¨Ø§Ø´Ø±Ø© Ù„ÙŠØªØ·Ø§Ø¨Ù‚ 100% Ù…Ø¹ ÙƒØ´Ù Ø§Ù„Ø­Ø³Ø§Ø¨ ÙˆØ§Ù„Ø£Ø³ØªØ§Ø° Ø§Ù„Ø¹Ø§Ù…
      const [
          pinvRes, payRes, pretRes, dnRes, chqRes, subRes, rebRes, manualJRes
      ] = await Promise.all([
          supabase.from('purchase_invoices').select('total_amount, paid_amount, invoice_number').eq('supplier_id', supplier.id).eq('organization_id', userOrgId).neq('status', 'draft'),
          supabase.from('payment_vouchers').select('amount, notes').eq('supplier_id', supplier.id).eq('organization_id', userOrgId),
          supabase.from('purchase_returns').select('total_amount').eq('supplier_id', supplier.id).eq('organization_id', userOrgId).neq('status', 'draft'),
          supabase.from('debit_notes').select('total_amount').eq('supplier_id', supplier.id).eq('organization_id', userOrgId).eq('status', 'posted'),
          supabase.from('cheques').select('amount').eq('party_id', supplier.id).eq('type', 'outgoing').eq('organization_id', userOrgId).neq('status', 'rejected'),
          supabase.from('subcontractors').select('id, name').or(`name.eq."${supplier.name}",supplier_id.eq."${supplier.id}"`).eq('organization_id', userOrgId),
          supabase.from('vendor_rebate_settlements').select('total_claim_amount').eq('vendor_id', supplier.id).eq('organization_id', userOrgId).in('status', ['APPROVED', 'SETTLED']),
          supabase.from('journal_lines')
            .select('debit, credit, journal_entries!inner(id, reference, status, related_document_id), accounts!inner(code)')
            .eq('journal_entries.status', 'posted')
            .is('journal_entries.related_document_id', null)
            .or('code.ilike.201%,code.ilike.221%', { foreignTable: 'accounts' })
            .ilike('journal_entries.description', `%${supplier.name}%`)
      ]);

      // Ø­Ø³Ø§Ø¨ Ù…Ø³ØªØ®Ù„ØµØ§Øª Ù…Ù‚Ø§ÙˆÙ„ÙŠ Ø§Ù„Ø¨Ø§Ø·Ù†
      let contractorBillings = 0;
      if (subRes.data && subRes.data.length > 0) {
        const subIds = subRes.data.map(s => s.id);
        const { data: contracts } = await supabase.from('subcontractor_contracts')
          .select('id')
          .in('subcontractor_id', subIds)
          .eq('organization_id', userOrgId);
        
        const contractIds = contracts?.map(c => c.id) || [];
        if (contractIds.length > 0) {
          const { data: billings } = await supabase.from('subcontractor_billings')
            .select('net_amount')
            .in('contract_id', contractIds)
            .eq('organization_id', userOrgId)
            .neq('status', 'draft');
          contractorBillings = billings?.reduce((sum, b) => sum + Number(b.net_amount || 0), 0) || 0;
        }
      }

      const totalInvoiced = pinvRes.data?.reduce((sum, inv) => {
        const pvPaidForThisInvoice = payRes.data?.filter(p => p.notes && inv.invoice_number && p.notes.includes(inv.invoice_number)).reduce((s, p) => s + Number(p.amount || 0), 0) || 0;
        const immediatePaidAtCheckout = Math.max(0, Number(inv.paid_amount || 0) - pvPaidForThisInvoice);
        return sum + (Number(inv.total_amount || 0) - immediatePaidAtCheckout);
      }, 0) || 0;

      const totalPayments = payRes.data?.reduce((sum, p) => sum + Number(p.amount || 0), 0) || 0;
      const totalReturns = pretRes.data?.reduce((sum, r) => sum + Number(r.total_amount || 0), 0) || 0;
      const totalDebitNotes = dnRes.data?.reduce((sum, d) => sum + Number(d.total_amount || 0), 0) || 0;
      const totalCheques = chqRes.data?.reduce((sum, c) => sum + Number(c.amount || 0), 0) || 0;
      const totalRebates = rebRes.data?.reduce((sum, r) => sum + Number(r.total_claim_amount || 0), 0) || 0;

      // Ù‚ÙŠÙˆØ¯ ØªØ³ÙˆÙŠØ© ÙŠØ¯ÙˆÙŠØ© Ø£Ø®Ø±Ù‰ (Ø¨Ø§Ø³ØªØ«Ù†Ø§Ø¡ Ø§Ù„Ø¨ÙˆØ§Ù†Øµ ÙˆØ§Ù„ÙÙˆØ§ØªÙŠØ± ÙˆØ§Ù„Ø´ÙŠÙƒØ§Øª Ø§Ù„Ù…Ø³Ø¬Ù„Ø©)
      const otherManualDebit = (manualJRes.data as any[])
        ?.filter((l: Record<string, any>) => {
          const jEntry = Array.isArray(l.journal_entries) ? l.journal_entries[0] : l.journal_entries;
          const ref = jEntry?.reference || '';
          return !ref.startsWith('REB-') && !ref.startsWith('PV-') && !ref.startsWith('PINV-') && !ref.startsWith('CHQ-');
        })
        .reduce((sum: number, l: Record<string, any>) => sum + Number(l.debit || 0), 0) || 0;

      const otherManualCredit = (manualJRes.data as any[])
        ?.filter((l: Record<string, any>) => {
          const jEntry = Array.isArray(l.journal_entries) ? l.journal_entries[0] : l.journal_entries;
          const ref = jEntry?.reference || '';
          return !ref.startsWith('REB-') && !ref.startsWith('PV-') && !ref.startsWith('PINV-') && !ref.startsWith('CHQ-');
        })
        .reduce((sum: number, l: Record<string, any>) => sum + Number(l.credit || 0), 0) || 0;

      const opening = Number(supplier.opening_balance || 0);

      const realBalance = opening + totalInvoiced + contractorBillings + otherManualCredit - totalPayments - totalReturns - totalDebitNotes - totalCheques - totalRebates - otherManualDebit;
      setDynamicBalance(realBalance);
    };
    getRealBalance();
  }, [formData.supplierId, suppliers, getSystemAccount, organization?.id]);
  
  // Print State
  const [voucherToPrint, setVoucherToPrint] = useState<any>(null);
  const [companySettings, setCompanySettings] = useState<any>(null);

  useEffect(() => {
    supabase.rpc('get_current_company_settings').maybeSingle().then(({ data, error }) => {
      if (error) {
        logger.error("ÙØ´Ù„ Ø¬Ù„Ø¨ Ø¥Ø¹Ø¯Ø§Ø¯Ø§Øª Ø§Ù„Ø´Ø±ÙƒØ© Ø¹Ø¨Ø± RPC:", error);
      } else {
        setCompanySettings(data);
      }
    });
  }, []);

  useEffect(() => {
    if (voucherToPrint) {
      setTimeout(() => {
        window.print();
        setVoucherToPrint(null);
      }, 500);
    }
  }, [voucherToPrint]);

  const paymentVouchers = vouchers.filter(v => v.type === 'payment');

  // ØªØµÙÙŠØ© Ø­Ø³Ø§Ø¨Ø§Øª Ø§Ù„Ø®Ø²ÙŠÙ†Ø© ÙˆØ§Ù„Ø¨Ù†ÙˆÙƒ Ù…Ù† Ø§Ù„Ø³ÙŠØ§Ù‚ Ù…Ø¨Ø§Ø´Ø±Ø© Ù„Ø¶Ù…Ø§Ù† Ø§Ù„ØªØ­Ø¯ÙŠØ« Ø§Ù„ÙÙˆØ±ÙŠ (Ø§Ø³ØªØ¨Ø¹Ø§Ø¯ Ø§Ù„Ø­Ø³Ø§Ø¨Ø§Øª Ø§Ù„Ø±Ø¦ÙŠØ³ÙŠØ© ÙˆØ§Ù„ØªØ¬Ù…ÙŠØ¹ÙŠØ© Ù‚Ø·ÙŠØ¹Ø§Ù‹)
  const treasuryAccounts = useMemo(() => {
    return accounts.filter(a => 
      !(a.isGroup || a.is_group) &&
      a.code !== '123' && a.code !== '12' && a.code !== '1' && (
        a.name.includes('ØµÙ†Ø¯ÙˆÙ‚') || 
        a.name.includes('Ø®Ø²ÙŠÙ†Ø©') || 
        a.name.includes('Ø¨Ù†Ùƒ') || 
        a.name.includes('Ù†Ù‚Ø¯') ||
        a.name.includes('Cash') ||
        a.name.includes('Bank') ||
        a.code.startsWith('123') || a.code.startsWith('101')
      )
    );
  }, [accounts]);

  // ØªØ­Ù…ÙŠÙ„ Ø¨ÙŠØ§Ù†Ø§Øª Ø§Ù„Ø³Ù†Ø¯ Ø¹Ù†Ø¯ Ø§Ù„ØªÙˆØ¬ÙŠÙ‡ Ù…Ù† Ø§Ù„Ø³Ø¬Ù„ Ù„Ù„ØªØ¹Ø¯ÙŠÙ„
  useEffect(() => {
    if (location.state && location.state.voucherToEdit) {
      loadVoucher(location.state.voucherToEdit);
    }
  }, [location]);

  const loadVoucher = async (voucher: Record<string, any>) => {
    if (!voucher) return;
    setIsEditing(true);
    setCurrentVoucherId(voucher.id);
    
    const { data } = await supabase.from('payment_vouchers').select('*').eq('id', voucher.id).single();
    
    if (data) {
      setFormData({
        supplierId: data.supplier_id || '',
        treasuryId: data.treasury_account_id || '',
        amount: data.amount || 0,
        date: data.payment_date || new Date().toISOString().split('T')[0],
        notes: data.notes || '',
      voucherNumber: data.voucher_number || '',
      paymentMethod: data.payment_method || 'cash',
      currency: data.currency || 'EGP',
      exchangeRate: data.exchange_rate || 1,
      costCenterId: data.cost_center_id || ''
      });

      // Ø¬Ù„Ø¨ Ø§Ù„Ù…Ø±ÙÙ‚Ø§Øª Ø§Ù„Ù…Ø­ÙÙˆØ¸Ø©
      const { data: atts } = await supabase.from('payment_voucher_attachments').select('*').eq('voucher_id', voucher.id);
      setExistingAttachments(atts || []);
    }
    setSupplierSearchTerm('');
    setSelectedInvoiceId(null);
  };

  const handleNew = () => {
    setIsEditing(false);
    setCurrentVoucherId(null);
    setSelectedInvoiceId(null);
    setUnpaidInvoices([]);
    setFormData({
      supplierId: '',
      treasuryId: '',
      amount: 0,
      date: new Date().toISOString().split('T')[0],
      notes: '',
      voucherNumber: '',
      paymentMethod: 'cash',
      currency: 'EGP',
      exchangeRate: 1,
      costCenterId: ''
    });
    setAttachments([]);
    setExistingAttachments([]);
    setErrors({});
    setSupplierSearchTerm('');
  };

  const handlePrevious = () => {
    if (paymentVouchers.length === 0) return;
    if (!currentVoucherId) {
      loadVoucher(paymentVouchers[0]);
      return;
    }
    const idx = paymentVouchers.findIndex(v => v.id === currentVoucherId);
    if (idx < paymentVouchers.length - 1) {
      loadVoucher(paymentVouchers[idx + 1]);
    }
  };

  const handleNext = () => {
    if (paymentVouchers.length === 0) return;
    if (!currentVoucherId) {
      loadVoucher(paymentVouchers[0]);
      return;
    }
    const idx = paymentVouchers.findIndex(v => v.id === currentVoucherId);
    if (idx > 0) {
      loadVoucher(paymentVouchers[idx - 1]);
    }
  };

  const downloadAttachment = async (path: string, fileName: string) => {
    try {
      const { data, error } = await supabase.storage.from('documents').download(path);
      if (error) throw error;
      const url = URL.createObjectURL(data);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      logger.error('Error downloading:', err);
      showToast('ÙØ´Ù„ ØªØ­Ù…ÙŠÙ„ Ø§Ù„Ù…Ù„Ù', 'error');
    }
  };

  const previewAttachment = (path: string) => {
    const { data } = supabase.storage.from('documents').getPublicUrl(path);
    if (data.publicUrl) {
        window.open(data.publicUrl, '_blank');
    }
  };

  const handlePrint = () => {
    const supplierName = suppliers.find(s => s.id === formData.supplierId)?.name;
    const printData = {
        ...formData,
        voucher_number: formData.voucherNumber,
        payment_date: formData.date,
        suppliers: { name: supplierName },
        payment_method: formData.paymentMethod
    };
    setVoucherToPrint(printData);
  };

  const handleWhatsApp = () => {
    const supplier = suppliers.find(s => s.id === formData.supplierId);
    if (!supplier || !supplier.phone) {
      showToast('Ø±Ù‚Ù… Ù‡Ø§ØªÙ Ø§Ù„Ù…ÙˆØ±Ø¯ ØºÙŠØ± Ù…ØªÙˆÙØ± ÙÙŠ Ø§Ù„Ø¨ÙŠØ§Ù†Ø§Øª Ø§Ù„Ø£Ø³Ø§Ø³ÙŠØ©', 'warning');
      return;
    }
    
    const message = `*Ø³Ù†Ø¯ ØµØ±Ù Ø¬Ø¯ÙŠØ¯*\n\nÙ…Ø±Ø­Ø¨Ø§Ù‹ ${supplier.name}ØŒ\nØªÙ… ØµØ±Ù Ù…Ø¨Ù„Øº: *${Number(formData.amount).toLocaleString()} ${formData.currency}*\nØ±Ù‚Ù… Ø§Ù„Ø³Ù†Ø¯: ${formData.voucherNumber}\nØ§Ù„ØªØ§Ø±ÙŠØ®: ${formData.date}\n${formData.notes ? 'Ø§Ù„Ø¨ÙŠØ§Ù†: ' + formData.notes : ''}\n\nØ´ÙƒØ±Ø§Ù‹ Ù„ØªØ¹Ø§Ù…Ù„ÙƒÙ… Ù…Ø¹Ù†Ø§.`;
    
    // ØªÙ†Ø¸ÙŠÙ Ø±Ù‚Ù… Ø§Ù„Ù‡Ø§ØªÙ Ù…Ù† Ø§Ù„Ø±Ù…ÙˆØ² ØºÙŠØ± Ø§Ù„Ø±Ù‚Ù…ÙŠØ©
    const phone = supplier.phone.replace(/[^0-9]/g, '');
    const url = `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
    window.open(url, '_blank');
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmittingRef.current || loading) return;
    setErrors({});

    // Ø¥Ø¹Ø¯Ø§Ø¯ Ø§Ù„Ø¨ÙŠØ§Ù†Ø§Øª Ù„Ù„ØªØ­Ù‚Ù‚
    const validationData = {
      amount: Number(formData.amount),
      date: formData.date,
      treasuryAccountId: formData.treasuryId,
      description: formData.notes,
      partyId: formData.supplierId,
      paymentMethod: formData.paymentMethod,
    };

    const result = VoucherSchema.safeParse(validationData);

    if (!result.success) {
        const formattedErrors: Record<string, string> = {};
        result.error.issues.forEach(issue => { formattedErrors[String(issue.path[0])] = issue.message; });
        setErrors(formattedErrors);
        showToast('ÙŠØ±Ø¬Ù‰ ØªØµØ­ÙŠØ­ Ø§Ù„Ø£Ø®Ø·Ø§Ø¡ ÙÙŠ Ø§Ù„Ù†Ù…ÙˆØ°Ø¬', 'error');
        return;
    }
    setLoading(true);
    isSubmittingRef.current = true;

    // demo simulation: bypass supabase and update context
    if (!isEditing && (currentUser?.role === 'demo' || isDemo)) {
        const voucherNumber = formData.voucherNumber || `PV-DEMO-${Math.floor(Math.random()*10000)}`;
        const demoVoucher = {
            id: `demo-pv-${Date.now()}`,
            voucherNumber,
            date: formData.date,
            supplierId: formData.supplierId,
            partyName: suppliers.find(s => s.id === formData.supplierId)?.name,
            amount: formData.amount,
            treasuryId: formData.treasuryId,
            notes: formData.notes,
            paymentMethod: formData.paymentMethod,
            currency: formData.currency,
            exchangeRate: formData.exchangeRate,
            costCenterId: formData.costCenterId
        };
        addDemoPaymentVoucher(demoVoucher);
        showToast('ØªÙ… Ø­ÙØ¸ Ø³Ù†Ø¯ Ø§Ù„ØµØ±Ù (Ø¯ÙŠÙ…Ùˆ) Ø¨Ù†Ø¬Ø§Ø­ âœ…', 'success');
        handleNew();
        isSubmittingRef.current = false;
        setLoading(false);
        return;
    }

    try {
        const supplier = suppliers.find(s => s.id === formData.supplierId);
        const treasury = treasuryAccounts.find(t => t.id === formData.treasuryId);
        const voucherNumber = formData.voucherNumber || `PV-${Date.now().toString().slice(-6)}`;

        const isAdmin = currentUser?.role === 'admin' || currentUser?.role === 'super_admin';

        if (isEditing && currentVoucherId) {
          if (!isAdmin && !can('treasury', 'update') && !can('treasury', 'manage')) {
              showToast('Ù„ÙŠØ³ Ù„Ø¯ÙŠÙƒ ØµÙ„Ø§Ø­ÙŠØ© ØªØ¹Ø¯ÙŠÙ„ Ø³Ù†Ø¯Ø§Øª Ø§Ù„ØµØ±Ù', 'error');
              setLoading(false);
              return;
          }
              
          // 1. ØªØ­Ø¯ÙŠØ« Ø¨ÙŠØ§Ù†Ø§Øª Ø§Ù„Ø³Ù†Ø¯ ÙÙŠ Ù‚Ø§Ø¹Ø¯Ø© Ø§Ù„Ø¨ÙŠØ§Ù†Ø§Øª ÙˆØ¬Ù„Ø¨ Ø¨ÙŠØ§Ù†Ø§ØªÙ‡ Ø§Ù„Ù…Ø­Ø¯Ø«Ø©
          const { data: voucherData, error: vErr } = await supabase
              .from('payment_vouchers')
              .update({
                  payment_date: formData.date,
                  supplier_id: formData.supplierId,
                  amount: formData.amount,
                  treasury_account_id: formData.treasuryId,
                  notes: formData.notes,
                  payment_method: formData.paymentMethod,
                  currency: formData.currency,
                  exchange_rate: formData.exchangeRate,
                  cost_center_id: formData.costCenterId || null
              })
              .eq('id', currentVoucherId)
              .select()
              .single();

          if (vErr) throw vErr;

          // ðŸš€ Ø§Ù„Ø­Ù„ Ø§Ù„Ø¬Ø°Ø±ÙŠ: Ø§Ø³ØªØ¯Ø¹Ø§Ø¡ Ø§Ù„Ø¯Ø§Ù„Ø© Ø§Ù„Ù…Ø­Ø§Ø³Ø¨ÙŠØ© Ø§Ù„Ù…ÙˆØ­Ø¯Ø© Ù„Ø¥Ø¹Ø§Ø¯Ø© ØªØ±Ø­ÙŠÙ„ Ø§Ù„Ù‚ÙŠØ¯ Ø¨Ø´ÙƒÙ„ ØµØ­ÙŠØ­ ÙˆÙ…ØªÙˆØ§Ø²Ù†
          const supplierAcc = getSystemAccount('SUPPLIERS');
          if (supplierAcc) {
              await supabase.rpc('approve_payment_voucher', { 
                  p_voucher_id: currentVoucherId, 
                  p_debit_account_id: supplierAcc.id 
              });
          }

          showToast('ØªÙ… ØªØ¹Ø¯ÙŠÙ„ Ø³Ù†Ø¯ Ø§Ù„ØµØ±Ù Ø¨Ù†Ø¬Ø§Ø­ âœ…', 'success');
          
          // ðŸš€ Ø¥ØµÙ„Ø§Ø­: Ø§Ù„ØªÙˆÙ‚Ù Ù‡Ù†Ø§ Ø¨Ø¹Ø¯ Ø§Ù„ØªØ¹Ø¯ÙŠÙ„ Ù„Ù…Ù†Ø¹ ØªÙƒØ±Ø§Ø± Ø§Ù„Ø³Ù†Ø¯
          setLoading(false);
          navigate('/payment-vouchers-list');
          return;
        }


        if (!isAdmin && !can('treasury', 'create') && !can('treasury', 'payment_create')) {
            showToast('Ù„ÙŠØ³ Ù„Ø¯ÙŠÙƒ ØµÙ„Ø§Ø­ÙŠØ© Ø¥Ù†Ø´Ø§Ø¡ Ø³Ù†Ø¯Ø§Øª ØµØ±Ù', 'error');
            setLoading(false);
            return;
        }

        // Ø§Ù„Ø¨Ø­Ø« Ø¹Ù† Ø­Ø³Ø§Ø¨ Ø§Ù„Ù…ÙˆØ±Ø¯ÙŠÙ† (201)
        const supplierAcc = getSystemAccount('SUPPLIERS');

        if (!supplierAcc) {
            showToast('Ù„Ù… ÙŠØªÙ… Ø§Ù„Ø¹Ø«ÙˆØ± Ø¹Ù„Ù‰ Ø­Ø³Ø§Ø¨ "Ø§Ù„Ù…ÙˆØ±Ø¯ÙŠÙ†" (201) ÙÙŠ Ø§Ù„Ø¯Ù„ÙŠÙ„ Ø§Ù„Ù…Ø­Ø§Ø³Ø¨ÙŠ.', 'error');
            setLoading(false);
            return;
        }

        // Ø¬Ù„Ø¨ Ù…Ø¹Ø±Ù Ø§Ù„Ù…Ù†Ø¸Ù…Ø© Ù…Ø¹ ØµÙ…Ø§Ù… Ø£Ù…Ø§Ù† ÙÙŠ Ø­Ø§Ù„ ÙÙ‚Ø¯Ø§Ù†Ù‡ Ù…Ù† Ø¨ÙŠØ§Ù†Ø§Øª Ø§Ù„Ù…Ø³ØªØ®Ø¯Ù…
        const orgId = (currentUser as any)?.organization_id || 
                     (await supabase.from('organizations').select('id').limit(1).single()).data?.id;

        // 1. Ø­ÙØ¸ Ø³Ù†Ø¯ Ø§Ù„ØµØ±Ù ÙÙŠ Ù‚Ø§Ø¹Ø¯Ø© Ø§Ù„Ø¨ÙŠØ§Ù†Ø§Øª
        const { data: voucherData, error: voucherError } = await supabase.from('payment_vouchers').insert({
            voucher_number: voucherNumber,
            payment_date: formData.date,
            supplier_id: formData.supplierId,
            amount: formData.amount,
            treasury_account_id: formData.treasuryId,
            notes: formData.notes,
            payment_method: formData.paymentMethod,
            currency: formData.currency,
            exchange_rate: formData.exchangeRate,
            cost_center_id: formData.costCenterId || null,
            organization_id: orgId
        }).select().single();

        if (voucherError) {
            // ðŸ›¡ï¸ Ø§Ù„Ù‚ÙÙ„ Ø§Ù„Ø­Ø¯ÙŠØ¯ÙŠ: Ù…Ù†Ø¹ ØªÙƒØ±Ø§Ø± Ø£Ø±Ù‚Ø§Ù… Ø³Ù†Ø¯Ø§Øª Ø§Ù„ØµØ±Ù
            if (voucherError.code === '23505') {
                throw new Error('Ø±Ù‚Ù… Ø§Ù„Ø³Ù†Ø¯ Ù‡Ø°Ø§ Ù…Ø³Ø¬Ù„ Ù…Ø³Ø¨Ù‚Ø§Ù‹ Ù„Ù‡Ø°Ù‡ Ø§Ù„Ø´Ø±ÙƒØ©.');
            }
            throw voucherError;
        }

        // 1.5. Ø±ÙØ¹ Ø§Ù„Ù…Ø±ÙÙ‚Ø§Øª (Ø¥Ø°Ø§ ÙˆØ¬Ø¯Øª)
        if (attachments.length > 0 && voucherData) {
            for (const file of attachments) {
                const fileExt = file.name.split('.').pop();
                const fileName = `${voucherData.id}-${Date.now()}-${Math.random()}.${fileExt}`;
                const filePath = `vouchers/${fileName}`;

                const { error: uploadError } = await supabase.storage
                    .from('documents') // Ø§Ø³Ù… Ø§Ù„Ù€ Bucket
                    .upload(filePath, file);

                if (uploadError) {
                    logger.error('Upload failed:', uploadError);
                    showToast(`ØªÙ… Ø­ÙØ¸ Ø§Ù„Ø³Ù†Ø¯ ÙˆÙ„ÙƒÙ† ÙØ´Ù„ Ø±ÙØ¹ Ø§Ù„Ù…Ø±ÙÙ‚: ${file.name}. Ø§Ù„Ø³Ø¨Ø¨: ${uploadError.message}`, 'warning');
                } else {
                    // Ø­ÙØ¸ Ø¨ÙŠØ§Ù†Ø§Øª Ø§Ù„Ù…Ø±ÙÙ‚ ÙÙŠ Ø§Ù„Ø¬Ø¯ÙˆÙ„ Ø§Ù„Ø¬Ø¯ÙŠØ¯
                    await supabase.from('payment_voucher_attachments').insert({
                        voucher_id: voucherData.id,
                        file_path: filePath,
                        file_name: file.name,
                        file_type: file.type,
                        file_size: file.size
                    });
                }
            }
        }

        // 1.8. ØªØ­Ø¯ÙŠØ« ÙØ§ØªÙˆØ±Ø© Ø§Ù„Ù…Ø´ØªØ±ÙŠØ§Øª Ø§Ù„Ù…Ø±ØªØ¨Ø·Ø© Ø¨Ø§Ù„Ø³Ø¯Ø§Ø¯ Ø¥Ù† ÙˆØ¬Ø¯Øª
        if (selectedInvoiceId && voucherData) {
            try {
                const { data: currentInv } = await supabase
                    .from('purchase_invoices')
                    .select('paid_amount, total_amount, status')
                    .eq('id', selectedInvoiceId)
                    .maybeSingle();

                if (currentInv) {
                    const newPaid = Number(currentInv.paid_amount || 0) + Number(formData.amount);
                    const newStatus = newPaid >= Number(currentInv.total_amount) ? 'paid' : (currentInv.status === 'draft' ? 'draft' : 'posted');
                    await supabase
                        .from('purchase_invoices')
                        .update({ paid_amount: newPaid, status: newStatus })
                        .eq('id', selectedInvoiceId);
                }
            } catch (invErr) {
                logger.error('Failed to update purchase invoice status:', invErr);
                showToast('ØªÙ… Ø­ÙØ¸ Ø§Ù„Ø³Ù†Ø¯ ÙˆÙ„ÙƒÙ† ØªØ¹Ø°Ø± ØªØ­Ø¯ÙŠØ« Ø­Ø§Ù„Ø© Ø³Ø¯Ø§Ø¯ ÙØ§ØªÙˆØ±Ø© Ø§Ù„Ù…Ø´ØªØ±ÙŠØ§Øª: ' + (invErr?.message || ''), 'warning');
            }
        }

        // 2. Ø¥Ù†Ø´Ø§Ø¡ Ø§Ù„Ù‚ÙŠØ¯ Ø§Ù„Ù…Ø­Ø§Ø³Ø¨ÙŠ (Ù…Ø­Ø§ÙˆÙ„Ø© Ø§Ø³ØªØ®Ø¯Ø§Ù… Ø§Ù„Ø¯Ø§Ù„Ø© Ø§Ù„Ø¢Ù…Ù†Ø©ØŒ Ø«Ù… Ø§Ù„Ø¨Ø¯ÙŠÙ„ Ø§Ù„ÙŠØ¯ÙˆÙŠ)
        try {
            const { error: rpcError } = await supabase.rpc('approve_payment_voucher', { p_voucher_id: voucherData.id, p_debit_account_id: supplierAcc.id });
            if (rpcError) throw rpcError;
        } catch (err) {
            logger.warn("RPC failed, falling back to manual entry:", err);
            // ÙÙŠ Ø­Ø§Ù„ ÙØ´Ù„ Ø§Ù„Ø¯Ø§Ù„Ø© (Ù…Ø«Ù„Ø§Ù‹ ØºÙŠØ± Ù…ÙˆØ¬ÙˆØ¯Ø©)ØŒ Ù†Ù‚ÙˆÙ… Ø¨Ø¥Ù†Ø´Ø§Ø¡ Ø§Ù„Ù‚ÙŠØ¯ ÙŠØ¯ÙˆÙŠØ§Ù‹ Ù„Ø¶Ù…Ø§Ù† Ø³Ù„Ø§Ù…Ø© Ø§Ù„Ø¨ÙŠØ§Ù†Ø§Øª
            await addEntry({
                date: formData.date,
                reference: voucherNumber,
                description: formData.notes || `Ø³Ù†Ø¯ ØµØ±Ù Ù„Ù„Ù…ÙˆØ±Ø¯`,
                lines: [
                    { account_id: supplierAcc.id, accountId: supplierAcc.id, debit: formData.amount, credit: 0, description: `ØµØ±Ù Ù„Ù„Ù…ÙˆØ±Ø¯`, costCenterId: formData.costCenterId || null },
                    { account_id: formData.treasuryId, accountId: formData.treasuryId, debit: 0, credit: formData.amount, description: `Ø³Ù†Ø¯ ØµØ±Ù Ø±Ù‚Ù… ${voucherNumber}` }
                ]
            });
        }

        showToast('ØªÙ… Ø­ÙØ¸ Ø³Ù†Ø¯ Ø§Ù„ØµØ±Ù ÙˆØªØ±Ø­ÙŠÙ„ Ø§Ù„Ù‚ÙŠØ¯ Ø¨Ù†Ø¬Ø§Ø­', 'success');
        handleNew();
        setAttachments([]);
        setErrors({});

    } catch (error) {
        logger.error('Error saving payment voucher:', error);
        showToast(error?.message || 'ÙØ´Ù„ Ø­ÙØ¸ Ø³Ù†Ø¯ Ø§Ù„ØµØ±Ù', 'error');
    } finally {
        isSubmittingRef.current = false;
        setLoading(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6 animate-in fade-in">
      <div className={voucherToPrint ? 'print:hidden' : ''}>
      {/* Ø´Ø±ÙŠØ· Ø§Ù„Ø£Ø¯ÙˆØ§Øª */}
      <div className="flex items-center justify-between bg-white p-4 rounded-xl shadow-sm border border-slate-200">
        <div className="flex items-center gap-2">
          <button onClick={handlePrevious} className="p-2 hover:bg-slate-100 rounded-full text-slate-600" title="Ø§Ù„Ø³Ø§Ø¨Ù‚">
            <ArrowRight className="w-5 h-5" />
          </button>
          <button onClick={handleNext} className="p-2 hover:bg-slate-100 rounded-full text-slate-600" title="Ø§Ù„ØªØ§Ù„ÙŠ">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="h-6 w-px bg-slate-300 mx-2"></div>
          <button onClick={handleNew} className="flex items-center gap-2 px-4 py-2 bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100 font-bold text-sm">
            <Plus className="w-4 h-4" />
            <span>Ø³Ù†Ø¯ Ø¬Ø¯ÙŠØ¯</span>
          </button>
          <button onClick={handlePrint} className="flex items-center gap-2 px-4 py-2 bg-slate-50 text-slate-600 rounded-lg hover:bg-slate-100 font-bold text-sm" title="Ø·Ø¨Ø§Ø¹Ø© Ø§Ù„Ø³Ù†Ø¯ Ø§Ù„Ø­Ø§Ù„ÙŠ">
            <Printer className="w-4 h-4" />
            <span>Ø·Ø¨Ø§Ø¹Ø©</span>
          </button>
          <button onClick={handleWhatsApp} className="flex items-center gap-2 px-4 py-2 bg-green-50 text-green-600 rounded-lg hover:bg-green-100 font-bold text-sm" title="Ø¥Ø±Ø³Ø§Ù„ Ø¹Ø¨Ø± ÙˆØ§ØªØ³Ø§Ø¨">
            <MessageCircle className="w-4 h-4" />
            <span>ÙˆØ§ØªØ³Ø§Ø¨</span>
          </button>
        </div>

        <div className="flex items-center gap-4">
           <div className="relative">
             <Search className="w-4 h-4 absolute right-3 top-3 text-slate-400" />
             <select 
               className="pl-4 pr-10 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none appearance-none bg-white w-64"
               onChange={(e) => {
                 const v = paymentVouchers.find(v => v.id === e.target.value);
                 if(v) loadVoucher(v);
               }}
               value={currentVoucherId || ''}
             >
               <option value="">Ø¨Ø­Ø« Ø¹Ù† Ø³Ù†Ø¯...</option>
               {paymentVouchers.map(v => (
                 <option key={v.id} value={v.id}>{v.voucherNumber || v.voucher_number} - {v.amount}</option>
               ))}
             </select>
           </div>
        </div>
      </div>

      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
            <ArrowUpRight className="text-blue-600" /> {isEditing ? 'ØªØ¹Ø¯ÙŠÙ„ Ø³Ù†Ø¯ ØµØ±Ù' : 'Ø³Ù†Ø¯ ØµØ±Ù Ø¬Ø¯ÙŠØ¯'}
        </h2>
      </div>

      <form 
        onSubmit={handleSave} 
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.target as HTMLElement).tagName !== 'TEXTAREA') {
            e.preventDefault();
          }
        }}
        className="bg-white p-8 rounded-xl shadow-sm border border-slate-200 space-y-6"
      >
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Ø§Ù„Ù…ÙˆØ±Ø¯ Ø§Ù„Ø°ÙƒÙŠ Ø§Ù„ÙØ§Ø¦Ù‚ */}
            <div className="md:col-span-2">
                <SupplierSearchSelect
                    value={formData.supplierId}
                    onChange={(supplierId) => {
                        setFormData(prev => ({ ...prev, supplierId }));
                        setSelectedInvoiceId(null);
                        if (errors.partyId) {
                            setErrors(prev => {
                                const next = { ...prev };
                                delete next.partyId;
                                return next;
                            });
                        }
                    }}
                    suppliers={suppliers}
                    label="ØµØ±Ù Ù„Ù„Ù…ÙˆØ±Ø¯ (Ø§Ù„Ù…Ø³ØªÙÙŠØ¯)"
                    placeholder="Ø§Ø¨Ø­Ø« Ø¹Ù† Ù…ÙˆØ±Ø¯ Ø¨Ø§Ù„Ø§Ø³Ù…ØŒ Ø§Ù„ÙƒÙˆØ¯ØŒ Ø§Ù„Ù‡Ø§ØªÙØŒ Ø£Ùˆ Ø§Ù„Ø±Ù‚Ù… Ø§Ù„Ø¶Ø±ÙŠØ¨ÙŠ..."
                    required
                    theme="blue"
                    showBalance={true}
                    showQuickAdd={true}
                    showQuickEdit={true}
                    showStatementButton={true}
                />
                {errors.partyId && <p className="text-red-500 text-xs mt-1 font-bold">{errors.partyId}</p>}

                {/* Ù„ÙˆØ­Ø© ÙÙˆØ§ØªÙŠØ± Ø§Ù„Ù…Ø´ØªØ±ÙŠØ§Øª Ø§Ù„Ù…Ø¹Ù„Ù‚Ø© Ù„Ù„Ù…ÙˆØ±Ø¯ Ø§Ù„Ù…Ø®ØªØ§Ø± */}
                {formData.supplierId && unpaidInvoices.length > 0 && (
                    <div className="mt-3 p-4 bg-blue-50/70 border border-blue-200 rounded-2xl animate-in fade-in slide-in-from-top-2">
                        <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                            <div className="flex items-center gap-2 flex-wrap">
                                <Receipt className="text-blue-600 w-5 h-5" />
                                <span className="text-xs font-black text-blue-900">
                                    ÙÙˆØ§ØªÙŠØ± Ø§Ù„Ù…Ø´ØªØ±ÙŠØ§Øª Ø§Ù„Ù…Ø³ØªØ­Ù‚Ø© Ø¹Ù„Ù‰ Ù‡Ø°Ø§ Ø§Ù„Ù…ÙˆØ±Ø¯ ({unpaidInvoices.length} ÙÙˆØ§ØªÙŠØ± Ù…Ø¹Ù„Ù‚Ø©)
                                </span>
                                <span className="text-[11px] font-bold text-blue-700 bg-blue-100 px-2 py-0.5 rounded-full font-mono">
                                    Ø§Ù„Ù…ØªØ¨Ù‚ÙŠ Ø§Ù„Ø¥Ø¬Ù…Ø§Ù„ÙŠ: {unpaidInvoices.reduce((sum, inv) => sum + (Number(inv.total_amount || 0) - Number(inv.paid_amount || 0)), 0).toLocaleString()} {formData.currency}
                                </span>
                            </div>
                            <div className="flex items-center gap-2">
                                {selectedInvoiceId && (
                                    <button
                                        type="button"
                                        onClick={() => setSelectedInvoiceId(null)}
                                        className="text-xs font-bold text-slate-600 hover:text-slate-900 bg-white px-2.5 py-1 rounded-lg border border-slate-200 shadow-2xs transition-colors"
                                    >
                                        Ø¥Ù„ØºØ§Ø¡ Ø§Ù„ØªØ®ØµÙŠØµ (Ø³Ø¯Ø§Ø¯ Ø¹Ø§Ù… Ø¹Ù„Ù‰ Ø§Ù„Ø­Ø³Ø§Ø¨)
                                    </button>
                                )}
                                <button
                                    type="button"
                                    onClick={() => setShowInvoicesPanel(!showInvoicesPanel)}
                                    className="text-blue-600 hover:text-blue-800 p-1"
                                    title={showInvoicesPanel ? 'Ø·ÙŠ Ø§Ù„Ù„ÙˆØ­Ø©' : 'Ø¹Ø±Ø¶ Ø§Ù„ÙÙˆØ§ØªÙŠØ±'}
                                >
                                    {showInvoicesPanel ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                                </button>
                            </div>
                        </div>

                        {showInvoicesPanel && (
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2.5 max-h-64 overflow-y-auto pr-1">
                                {unpaidInvoices.map((inv) => {
                                    const remaining = Math.max(0, Number(inv.total_amount || 0) - Number(inv.paid_amount || 0));
                                    const isSelected = selectedInvoiceId === inv.id;
                                    return (
                                        <div
                                            key={inv.id}
                                            onClick={() => handleSelectInvoiceForPayment(inv)}
                                            className={`p-3 rounded-xl border-2 cursor-pointer transition-all ${
                                                isSelected
                                                    ? 'bg-blue-600 text-white border-blue-700 shadow-md transform scale-[1.02]'
                                                    : 'bg-white hover:bg-blue-50/50 border-slate-200 hover:border-blue-300'
                                            }`}
                                        >
                                            <div className="flex justify-between items-start mb-1">
                                                <span className={`font-mono font-black text-xs ${isSelected ? 'text-blue-100' : 'text-slate-800'}`}>
                                                    #{inv.invoice_number || inv.id?.slice(0, 8)}
                                                </span>
                                                <span className={`text-[10px] font-bold ${isSelected ? 'text-blue-100' : 'text-slate-500'}`}>
                                                    {inv.invoice_date || '-'}
                                                </span>
                                            </div>
                                            <div className="flex justify-between items-baseline mt-2">
                                                <span className={`text-xs font-bold ${isSelected ? 'text-blue-100' : 'text-slate-500'}`}>Ø§Ù„Ù…ØªØ¨Ù‚ÙŠ:</span>
                                                <span className={`text-sm font-black font-mono ${isSelected ? 'text-white' : 'text-blue-700'}`}>
                                                    {remaining.toLocaleString()} {formData.currency}
                                                </span>
                                            </div>
                                            <div className="mt-2 pt-1 border-t border-slate-100/30 flex items-center justify-between text-[11px]">
                                                <span className={isSelected ? 'text-blue-200' : 'text-slate-400'}>
                                                    Ø§Ù„Ø¥Ø¬Ù…Ø§Ù„ÙŠ: {Number(inv.total_amount || 0).toLocaleString()}
                                                </span>
                                                <span className={`font-bold flex items-center gap-1 ${isSelected ? 'text-yellow-300' : 'text-blue-600'}`}>
                                                    {isSelected ? <CheckCircle2 size={12} /> : null}
                                                    {isSelected ? 'Ù…Ø­Ø¯Ø¯Ø© Ù„Ù„Ø³Ø¯Ø§Ø¯' : 'Ø§Ø¶ØºØ· Ù„Ù„Ø³Ø¯Ø§Ø¯'}
                                                </span>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* Ø­Ø³Ø§Ø¨ Ø§Ù„ØµØ±Ù */}
            <div>
                <label className="block text-sm font-bold text-slate-700 mb-1">Ù…Ù† Ø­Ø³Ø§Ø¨ (Ø§Ù„Ø®Ø²ÙŠÙ†Ø©/Ø§Ù„Ø¨Ù†Ùƒ)</label>
                <div className="relative">
                    <select 
                        value={formData.treasuryId}
                        onChange={(e) => setFormData({...formData, treasuryId: e.target.value})}
                        className={`w-full border rounded-lg px-4 py-3 focus:outline-none appearance-none ${errors.treasuryAccountId ? 'border-red-500 focus:border-red-500' : 'border-slate-300 focus:border-blue-500'}`}
                    >
                        <option value="">Ø§Ø®ØªØ± Ø§Ù„Ø­Ø³Ø§Ø¨...</option>
                        {treasuryAccounts.map(acc => <option key={acc.id} value={acc.id}>{acc.name} ({acc.code})</option>)}
                    </select>
                    <Building2 className="absolute left-3 top-3.5 text-slate-400" size={18} />
                </div>
                {errors.treasuryAccountId && <p className="text-red-500 text-xs mt-1">{errors.treasuryAccountId}</p>}
            </div>

            {/* Ø§Ù„Ù…Ø¨Ù„Øº */}
            <div>
                <label className="block text-sm font-bold text-slate-700 mb-1">Ø§Ù„Ù…Ø¨Ù„Øº</label>
                <div className="relative">
                    <input 
                        type="number" 
                        min="0"
                        step="any"
                        value={formData.amount}
                        onChange={(e) => setFormData({...formData, amount: parseFloat(e.target.value)})}
                        className={`w-full border rounded-lg px-4 py-3 focus:outline-none font-mono text-lg font-bold ${errors.amount ? 'border-red-500 focus:border-red-500' : 'border-slate-300 focus:border-blue-500'}`}
                    />
                    <Wallet className="absolute left-3 top-3.5 text-slate-400" size={18} />
                </div>
                {errors.amount && <p className="text-red-500 text-xs mt-1">{errors.amount}</p>}
            </div>

            {/* Ø§Ù„ØªØ§Ø±ÙŠØ® */}
            <div>
                <label className="block text-sm font-bold text-slate-700 mb-1">Ø§Ù„ØªØ§Ø±ÙŠØ®</label>
                <div className="relative">
                    <input 
                        type="date" 
                        value={formData.date}
                        onChange={(e) => setFormData({...formData, date: e.target.value})}
                        className={`w-full border rounded-lg px-4 py-3 focus:outline-none ${errors.date ? 'border-red-500 focus:border-red-500' : 'border-slate-300 focus:border-blue-500'}`}
                    />
                    <Calendar className="absolute left-3 top-3.5 text-slate-400" size={18} />
                </div>
                {errors.date && <p className="text-red-500 text-xs mt-1">{errors.date}</p>}
            </div>

            {/* Ù…Ø±ÙƒØ² Ø§Ù„ØªÙƒÙ„ÙØ© */}
            <div>
                <label className="block text-sm font-bold text-slate-700 mb-1">Ù…Ø±ÙƒØ² Ø§Ù„ØªÙƒÙ„ÙØ©</label>
                <div className="relative">
                    <select 
                        value={formData.costCenterId}
                        onChange={(e) => setFormData({...formData, costCenterId: e.target.value})}
                        className="w-full border border-slate-300 rounded-lg px-4 py-3 focus:outline-none focus:border-blue-500 appearance-none"
                    >
                        <option value="">Ø¨Ø¯ÙˆÙ† Ù…Ø±ÙƒØ² ØªÙƒÙ„ÙØ©</option>
                        {costCenters.map(cc => <option key={cc.id} value={cc.id}>{cc.name}</option>)}
                    </select>
                    <Layers className="absolute left-3 top-3.5 text-slate-400" size={18} />
                </div>
            </div>

            {/* Ø±Ù‚Ù… Ø§Ù„Ø³Ù†Ø¯ */}
            <div>
                <label className="block text-sm font-bold text-slate-700 mb-1">Ø±Ù‚Ù… Ø§Ù„Ø³Ù†Ø¯ (Ø§Ø®ØªÙŠØ§Ø±ÙŠ)</label>
                <input 
                    type="text" 
                    value={formData.voucherNumber}
                    onChange={(e) => setFormData({...formData, voucherNumber: e.target.value})}
                    placeholder="ØªÙ„Ù‚Ø§Ø¦ÙŠ"
                    className="w-full border border-slate-300 rounded-lg px-4 py-3 focus:outline-none focus:border-blue-500"
                />
            </div>

            {/* Ø·Ø±ÙŠÙ‚Ø© Ø§Ù„Ø¯ÙØ¹ */}
            <div>
                <label className="block text-sm font-bold text-slate-700 mb-1">Ø·Ø±ÙŠÙ‚Ø© Ø§Ù„Ø¯ÙØ¹</label>
                <select 
                    value={formData.paymentMethod}
                    onChange={(e) => setFormData({...formData, paymentMethod: e.target.value})}
                    className="w-full border border-slate-300 rounded-lg px-4 py-3 focus:outline-none focus:border-blue-500 appearance-none"
                    required
                >
                    <option value="cash">Ù†Ù‚Ø¯ÙŠ</option>
                    <option value="cheque">Ø´ÙŠÙƒ</option>
                    <option value="transfer">ØªØ­ÙˆÙŠÙ„ Ø¨Ù†ÙƒÙŠ</option>
                    <option value="card">Ø´Ø¨ÙƒØ©/Ø¨Ø·Ø§Ù‚Ø©</option>
                    <option value="other">Ø£Ø®Ø±Ù‰</option>
                </select>
            </div>

            {/* Ø§Ù„Ø¹Ù…Ù„Ø© ÙˆØ³Ø¹Ø± Ø§Ù„ØµØ±Ù */}
            <div className="space-y-2">
                <label className="text-sm font-bold text-slate-700 flex items-center gap-2">
                    <CircleDollarSign className="text-green-500" size={16} /> Ø§Ù„Ø¹Ù…Ù„Ø©
                </label>
                <div className="flex gap-2">
                    <select 
                        value={formData.currency}
                        onChange={(e) => setFormData({...formData, currency: e.target.value})}
                        className="w-2/3 border border-slate-300 rounded-lg px-3 py-3 text-sm focus:border-blue-500 outline-none bg-white appearance-none"
                    >
                        <option value="EGP">EGP</option>
                        <option value="SAR">SAR</option>
                        <option value="USD">USD</option>
                        <option value="EUR">EUR</option>
                    </select>
                    <input 
                        type="number" 
                        value={formData.exchangeRate}
                        onChange={(e) => setFormData({...formData, exchangeRate: parseFloat(e.target.value)})}
                        className="w-1/3 border border-slate-300 rounded-lg px-3 py-3 text-sm focus:border-blue-500 outline-none text-center font-bold"
                        placeholder="Ø³Ø¹Ø± Ø§Ù„ØµØ±Ù"
                        step="0.01"
                    />
                </div>
            </div>

            {/* Attachment */}
            <div className="md:col-span-2">
                <label className="block text-sm font-bold text-slate-700 mb-1">Ø¥Ø±ÙØ§Ù‚ Ù…Ù„Ù (ØµÙˆØ±Ø© Ø´ÙŠÙƒØŒ Ø¥ÙŠØµØ§Ù„...)</label>
                <div className="relative border-2 border-dashed border-slate-200 rounded-lg p-4 text-center">
                    <input 
                        type="file" 
                        multiple
                        onChange={(e) => setAttachments(prev => [...prev, ...Array.from(e.target.files || [])])} 
                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" 
                    />
                    <div className="flex flex-col items-center justify-center">
                        <Upload size={24} className="text-slate-400 mb-2" />
                        <p className="text-sm text-slate-500">Ø§Ø³Ø­Ø¨ Ø§Ù„Ù…Ù„ÙØ§Øª Ø¥Ù„Ù‰ Ù‡Ù†Ø§ Ø£Ùˆ Ø§Ø¶ØºØ· Ù„Ù„Ø§Ø®ØªÙŠØ§Ø±</p>
                    </div>
                </div>
                {attachments.length > 0 && (
                    <div className="mt-2 space-y-1">
                        {attachments.map((file, index) => (
                            <div key={index} className="flex items-center justify-between text-xs bg-slate-100 p-1 px-2 rounded border border-slate-200">
                                <span className="truncate max-w-[200px] text-slate-600">{file.name}</span>
                                <button type="button" onClick={() => setAttachments(prev => prev.filter((_, i) => i !== index))} className="text-red-500 hover:text-red-700">
                                    <X size={14} />
                                </button>
                            </div>
                        ))}
                    </div>
                )}

                {/* Ø¹Ø±Ø¶ Ø§Ù„Ù…Ø±ÙÙ‚Ø§Øª Ø§Ù„Ù…Ø­ÙÙˆØ¸Ø© */}
                {existingAttachments.length > 0 && (
                    <div className="mt-4 space-y-2">
                        <label className="block text-xs font-bold text-slate-500">Ø§Ù„Ù…Ø±ÙÙ‚Ø§Øª Ø§Ù„Ù…Ø­ÙÙˆØ¸Ø© Ø³Ø§Ø¨Ù‚Ø§Ù‹:</label>
                        {existingAttachments.map((file) => (
                            <div key={file.id} className="flex items-center justify-between bg-slate-50 p-3 rounded-lg border border-slate-200">
                                <div className="flex items-center gap-2">
                                    <Paperclip size={16} className="text-slate-500" />
                                    <span className="text-sm text-slate-700">{file.file_name}</span>
                                </div>
                                <button type="button" onClick={() => previewAttachment(file.file_path)} className="text-slate-600 hover:text-slate-800 p-1 flex items-center gap-1 text-xs font-bold">
                                    <Eye size={14} /> Ù…Ø¹Ø§ÙŠÙ†Ø©
                                </button>
                                <button type="button" onClick={() => downloadAttachment(file.file_path, file.file_name)} className="text-blue-600 hover:text-blue-800 p-1 flex items-center gap-1 text-xs font-bold">
                                    <Download size={14} /> ØªØ­Ù…ÙŠÙ„
                                </button>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Ù…Ù„Ø§Ø­Ø¸Ø§Øª */}
            <div className="md:col-span-2">
                <label className="block text-sm font-bold text-slate-700 mb-1">Ø§Ù„Ø¨ÙŠØ§Ù† / Ù…Ù„Ø§Ø­Ø¸Ø§Øª</label>
                <div className="relative">
                    <textarea 
                        value={formData.notes}
                        onChange={(e) => setFormData({...formData, notes: e.target.value})}
                        className="w-full border border-slate-300 rounded-lg px-4 py-3 focus:outline-none focus:border-blue-500"
                        rows={3}
                        placeholder="Ø¹Ø¨Ø§Ø±Ø© Ø¹Ù†..."
                    ></textarea>
                    <FileText className="absolute left-3 top-3.5 text-slate-400" size={18} />
                </div>
            </div>
        </div>

        <div className="pt-4 border-t border-slate-100 flex justify-end">
            <button 
                type="button"
                onClick={handlePrint}
                className="bg-slate-800 text-white px-6 py-3 rounded-xl font-bold hover:bg-slate-700 flex items-center gap-2 shadow-lg transition-all transform hover:-translate-y-1 ml-4"
            >
                <Printer size={20} />
                Ø·Ø¨Ø§Ø¹Ø© Ø§Ù„Ø³Ù†Ø¯
            </button>
            <button 
                type="submit" 
                disabled={loading}
                className="bg-blue-600 text-white px-8 py-3 rounded-xl font-bold hover:bg-blue-700 flex items-center gap-2 shadow-lg shadow-blue-200 transition-all transform hover:-translate-y-1"
            >
                {loading ? <Loader2 className="animate-spin" /> : <Save size={20} />}
                {isEditing ? 'Ø­ÙØ¸ Ø§Ù„ØªØ¹Ø¯ÙŠÙ„Ø§Øª' : 'Ø­ÙØ¸ Ø§Ù„Ø³Ù†Ø¯ ÙˆØªØ±Ø­ÙŠÙ„ Ø§Ù„Ù‚ÙŠØ¯'}
            </button>
        </div>

      </form>
      </div>

      {/* ðŸ•’ Ø³Ø¬Ù„ Ø§Ù„ØªØ¯Ù‚ÙŠÙ‚ ÙˆØ§Ù„ØªØªØ¨Ø¹ Ø§Ù„Ø²Ù…Ù†ÙŠ */}
      {currentVoucherId && (
        <DocumentAuditTimeline
          documentType="payment_voucher"
          documentId={currentVoucherId}
          documentCreatedAt={formData.date}
        />
      )}
      
      <PaymentVoucherPrint voucher={voucherToPrint} companySettings={companySettings} />
    </div>
  );
};

export default PaymentVoucherForm;

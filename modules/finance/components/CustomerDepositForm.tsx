import { logger } from '../../../utils/logger';
import React, { useState, useMemo, useEffect } from 'react';
import { useAccounting } from '../../../context/AccountingContext';
import { useToast } from '../../../context/ToastContext';
import { Save, ArrowRight, ArrowLeft, ShieldCheck, Plus, Search, Loader2, Printer, MessageCircle } from 'lucide-react';
import { useNavigate } from 'react-router-dom'; 
import { supabase } from '../../../supabaseClient';
import { CustomerDepositPrint } from '../reports/CustomerDepositPrint';
import { z } from 'zod';

const CustomerDepositForm = () => {
  const { customers, accounts, getSystemAccount, currentUser, addEntry, updateVoucher } = useAccounting();
  const navigate = useNavigate();
  const { showToast } = useToast();
  
  // NEW: State for treasury account search term
  const [treasurySearchTerm, setTreasurySearchTerm] = useState('');

  // ØªØµÙÙŠØ© Ø­Ø³Ø§Ø¨Ø§Øª Ø§Ù„Ù†Ù‚Ø¯ÙŠØ© ÙˆØ§Ù„Ø¨Ù†ÙˆÙƒ ÙÙ‚Ø·
  const treasuryAccounts = useMemo(() => accounts.filter(a => 
    !a.isGroup && (
      a.code?.startsWith('123') || a.code?.startsWith('101') || 
      a.name?.includes('ØµÙ†Ø¯ÙˆÙ‚') || 
      a.name?.includes('Ø®Ø²ÙŠÙ†Ø©') || 
      a.name?.includes('Ø¨Ù†Ùƒ') || 
      a.name?.includes('Ù†Ù‚Ø¯') ||
      a.name?.toLowerCase().includes('cash') ||
      a.name?.toLowerCase().includes('bank')
    ) // NEW: Filter by search term
  ).filter(a => 
    a.name?.toLowerCase().includes(treasurySearchTerm.toLowerCase()) ||
    a.code?.toLowerCase().includes(treasurySearchTerm.toLowerCase())
  ), [accounts, treasurySearchTerm]);

  // Ø­Ø§Ù„Ø© Ù„ØªØ®Ø²ÙŠÙ† Ø§Ù„Ø³Ù†Ø¯Ø§Øª Ø§Ù„Ù…Ø¬Ù„ÙˆØ¨Ø© Ù…Ù† Ù‚Ø§Ø¹Ø¯Ø© Ø§Ù„Ø¨ÙŠØ§Ù†Ø§Øª
  const [depositVouchers, setDepositVouchers] = useState<any[]>([]);

  // Ø¬Ù„Ø¨ Ø³Ù†Ø¯Ø§Øª Ø§Ù„ØªØ£Ù…ÙŠÙ† Ù…Ù† Ù‚Ø§Ø¹Ø¯Ø© Ø§Ù„Ø¨ÙŠØ§Ù†Ø§Øª Ù…Ø¨Ø§Ø´Ø±Ø© (Ù„ØªØ¬Ø§ÙˆØ² Ø­Ø¯ Ø§Ù„Ù€ 50 ÙÙŠ Ø§Ù„Ø³ÙŠØ§Ù‚)
  useEffect(() => {
    const fetchVouchers = async () => {
      const { data } = await supabase
        .from('receipt_vouchers')
        .select('*')
        .ilike('notes', '%ØªØ£Ù…ÙŠÙ†%') // Ø§Ù„Ø¨Ø­Ø« Ø¹Ù† Ø§Ù„Ø³Ù†Ø¯Ø§Øª Ø§Ù„ØªÙŠ ØªØ­ØªÙˆÙŠ Ø¹Ù„Ù‰ ÙƒÙ„Ù…Ø© "ØªØ£Ù…ÙŠÙ†"
        .order('receipt_date', { ascending: false }); // Ø§Ù„Ø£Ø­Ø¯Ø« Ø£ÙˆÙ„Ø§Ù‹
      
      if (data) setDepositVouchers(data);
    };
    fetchVouchers();
  }, []);

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
      const timer = setTimeout(() => {
        window.print();
        setVoucherToPrint(null);
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [voucherToPrint]);

  const [isEditing, setIsEditing] = useState(false);
  const [currentVoucherId, setCurrentVoucherId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const [formData, setFormData] = useState({
    date: new Date().toISOString().split('T')[0],
    customerId: '',
    treasuryAccountId: '',
    amount: '',
    description: '',
    paymentMethod: 'cash',
    voucherNumber: ''
  });

  const loadVoucher = async (voucher: Record<string, any>) => {
      setIsEditing(true);
      setCurrentVoucherId(voucher.id);
      
      setFormData({
          date: voucher.receipt_date,
          customerId: voucher.customer_id || '',
          treasuryAccountId: voucher.treasury_account_id || '',
          amount: voucher.amount,
          description: voucher.notes || '',
          paymentMethod: voucher.payment_method || 'cash',
          voucherNumber: voucher.voucher_number || ''
      });
      setTreasurySearchTerm(''); // NEW: Reset search term when loading a voucher
  };

  const handleNew = () => {
      setIsEditing(false);
      setCurrentVoucherId(null);
      setFormData({
        date: new Date().toISOString().split('T')[0],
        customerId: '',
        treasuryAccountId: treasuryAccounts.length > 0 ? treasuryAccounts[0].id : '',
        amount: '',
        description: '',
        paymentMethod: 'cash',
        voucherNumber: ''
      });
      setTreasurySearchTerm(''); // NEW: Reset search term when creating a new voucher
  };

  const handlePrevious = () => {
    if (depositVouchers.length === 0) return;
    if (!currentVoucherId) { loadVoucher(depositVouchers[0]); return; }
    const idx = depositVouchers.findIndex(v => v.id === currentVoucherId);
    if (idx < depositVouchers.length - 1) {
      loadVoucher(depositVouchers[idx + 1]);
    }
  };

  const handleNext = () => {
    if (depositVouchers.length === 0) return;
    if (!currentVoucherId) { loadVoucher(depositVouchers[0]); return; }
    const idx = depositVouchers.findIndex(v => v.id === currentVoucherId);
    if (idx > 0) {
      loadVoucher(depositVouchers[idx - 1]);
    }
  };

  const handlePrint = () => {
    const customerName = customers.find(c => c.id === formData.customerId)?.name;
    setVoucherToPrint({
        ...formData,
        customerName
    });
  };

  const handleWhatsApp = () => {
    const customer = customers.find(c => c.id === formData.customerId);
    if (!customer || !customer.phone) {
      showToast('Ø±Ù‚Ù… Ù‡Ø§ØªÙ Ø§Ù„Ø¹Ù…ÙŠÙ„ ØºÙŠØ± Ù…ØªÙˆÙØ±', 'warning');
      return;
    }
    const message = `*Ø³Ù†Ø¯ Ù‚Ø¨Ø¶ ØªØ£Ù…ÙŠÙ†*\n\nÙ…Ø±Ø­Ø¨Ø§Ù‹ ${customer.name}ØŒ\nØªÙ… Ø§Ø³ØªÙ„Ø§Ù… Ù…Ø¨Ù„Øº ØªØ£Ù…ÙŠÙ†: *${Number(formData.amount).toLocaleString()} EGP*\nØ±Ù‚Ù… Ø§Ù„Ø³Ù†Ø¯: ${formData.voucherNumber}\nØ§Ù„ØªØ§Ø±ÙŠØ®: ${formData.date}\n\nØ´ÙƒØ±Ø§Ù‹ Ù„ØªØ¹Ø§Ù…Ù„ÙƒÙ… Ù…Ø¹Ù†Ø§.`;
    const phone = customer.phone.replace(/[^0-9]/g, '');
    const url = `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
    window.open(url, '_blank');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const depositSchema = z.object({
        customerId: z.string().min(1, 'Ø§Ù„Ø±Ø¬Ø§Ø¡ Ø§Ø®ØªÙŠØ§Ø± Ø§Ù„Ø¹Ù…ÙŠÙ„'),
        treasuryAccountId: z.string().min(1, 'Ø§Ù„Ø±Ø¬Ø§Ø¡ Ø§Ø®ØªÙŠØ§Ø± Ø­Ø³Ø§Ø¨ Ø§Ù„Ø¥ÙŠØ¯Ø§Ø¹'),
        amount: z.number().min(0.01, 'Ø§Ù„Ù…Ø¨Ù„Øº ÙŠØ¬Ø¨ Ø£Ù† ÙŠÙƒÙˆÙ† Ø£ÙƒØ¨Ø± Ù…Ù† 0'),
        date: z.string().min(1, 'Ø§Ù„ØªØ§Ø±ÙŠØ® Ù…Ø·Ù„ÙˆØ¨'),
    });

    const validationResult = depositSchema.safeParse({
        customerId: formData.customerId,
        treasuryAccountId: formData.treasuryAccountId,
        amount: Number(formData.amount),
        date: formData.date
    });

    if (!validationResult.success) {
        showToast(validationResult.error.issues[0].message, 'warning');
      return;
    }

    setLoading(true);
    try {
        let voucherId = currentVoucherId;

        if (isEditing && voucherId) {
             // ØªØ­Ø¯ÙŠØ« Ø³Ù†Ø¯ Ù…ÙˆØ¬ÙˆØ¯
             const { error: updateError } = await supabase
                .from('receipt_vouchers')
                .update({
                    receipt_date: formData.date,
                    customer_id: formData.customerId,
                    amount: Number(formData.amount),
                    treasury_account_id: formData.treasuryAccountId,
                    notes: formData.description || 'Ù‚Ø¨Ø¶ ØªØ£Ù…ÙŠÙ† Ù…Ù† Ø¹Ù…ÙŠÙ„',
                    payment_method: formData.paymentMethod
                })
                .eq('id', voucherId);
             
             if (updateError) throw updateError;
        } else {
            // Ø¥Ù†Ø´Ø§Ø¡ Ø³Ù†Ø¯ Ø¬Ø¯ÙŠØ¯ ÙˆØ­ÙØ¸Ù‡ ÙÙŠ Ù‚Ø§Ø¹Ø¯Ø© Ø§Ù„Ø¨ÙŠØ§Ù†Ø§Øª Ù…Ø¨Ø§Ø´Ø±Ø©
            const voucherNumber = formData.voucherNumber || `DEP-${Date.now().toString().slice(-6)}`;
            const orgId = (currentUser as any)?.organization_id || 
                         (await supabase.from('organizations').select('id').limit(1).single()).data?.id;

            const { data: voucherData, error: voucherError } = await supabase.from('receipt_vouchers').insert({
                voucher_number: voucherNumber,
                receipt_date: formData.date,
                customer_id: formData.customerId,
                amount: Number(formData.amount),
                treasury_account_id: formData.treasuryAccountId,
                notes: formData.description || 'Ù‚Ø¨Ø¶ ØªØ£Ù…ÙŠÙ† Ù…Ù† Ø¹Ù…ÙŠÙ„',
                payment_method: formData.paymentMethod,
                organization_id: orgId
            }).select().single();

            if (voucherError) throw voucherError;
            voucherId = voucherData.id;
        }

        // ðŸ›¡ï¸ Ø§Ø³ØªØ®Ø¯Ø§Ù… Ø§Ù„Ù…Ø­Ø±Ùƒ Ø§Ù„Ù…Ø­Ø§Ø³Ø¨ÙŠ Ø§Ù„Ù…ÙˆØ­Ø¯ Ù„Ø¶Ù…Ø§Ù† Ù‚ÙŠØ¯ ÙˆØ§Ø­Ø¯ Ø³Ù„ÙŠÙ… ÙˆÙ…Ø±ØªØ¨Ø· Ø¨Ø§Ù„Ø³Ù†Ø¯
        // Ù†Ù…Ø±Ø± Ø­Ø³Ø§Ø¨ Ø§Ù„ØªØ£Ù…ÙŠÙ†Ø§Øª (226) ÙƒØ·Ø±Ù Ø¯Ø§Ø¦Ù† Ø¨Ø¯Ù„Ø§Ù‹ Ù…Ù† Ø­Ø³Ø§Ø¨ Ø§Ù„Ø¹Ù…Ù„Ø§Ø¡ (SECURITY_DEPOSIT_ACCOUNT)
        const customerDepositsAcc = getSystemAccount('SECURITY_DEPOSIT_ACCOUNT');
        if (!customerDepositsAcc) throw new Error('Ø­Ø³Ø§Ø¨ ØªØ£Ù…ÙŠÙ†Ø§Øª Ø§Ù„Ø¹Ù…Ù„Ø§Ø¡ ØºÙŠØ± Ù…Ø¹Ø±Ù‘Ù ÙÙŠ Ø§Ù„Ø¥Ø¹Ø¯Ø§Ø¯Ø§Øª.');

        const { error: rpcError } = await supabase.rpc('approve_receipt_voucher', {
            p_voucher_id: voucherId,
            p_credit_account_id: customerDepositsAcc.id
        });

        if (rpcError) throw rpcError;

        showToast(isEditing ? 'ØªÙ… ØªØ¹Ø¯ÙŠÙ„ Ø§Ù„Ø³Ù†Ø¯ ÙˆØªØ­Ø¯ÙŠØ« Ø§Ù„Ù‚ÙŠØ¯ Ø¨Ù†Ø¬Ø§Ø­ âœ…' : 'ØªÙ… Ø­ÙØ¸ Ø³Ù†Ø¯ ØªØ£Ù…ÙŠÙ† Ø§Ù„Ø¹Ù…ÙŠÙ„ Ø¨Ù†Ø¬Ø§Ø­ âœ…', 'success');
            
            // ØªØ­Ø¯ÙŠØ« Ø§Ù„Ù‚Ø§Ø¦Ù…Ø© Ù…Ø­Ù„ÙŠØ§Ù‹ Ù„Ø¥Ø¸Ù‡Ø§Ø± Ø§Ù„Ø³Ù†Ø¯ Ø§Ù„Ø¬Ø¯ÙŠØ¯ ÙÙˆØ±Ø§Ù‹
            const { data: newVoucher } = await supabase
                .from('receipt_vouchers')
                .select('*')
                .eq('id', voucherId)
                .maybeSingle();
                
            if (newVoucher) {
                setDepositVouchers(prev => {
                    const filtered = prev.filter(v => v.id !== newVoucher.id);
                    return [newVoucher, ...filtered];
                });
            }
        handleNew();
    } catch (error) {
        showToast('Ø­Ø¯Ø« Ø®Ø·Ø£: ' + error.message, 'error');
    } finally {
        setLoading(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto animate-in fade-in">
      {/* Ø´Ø±ÙŠØ· Ø§Ù„Ø£Ø¯ÙˆØ§Øª */}
      <div className="flex items-center justify-between bg-white p-4 rounded-xl shadow-sm border border-slate-200 mb-6">
         <div className="flex items-center gap-2">
             <button onClick={handlePrevious} disabled={depositVouchers.length === 0 || Boolean(currentVoucherId && depositVouchers.findIndex(v => v.id === currentVoucherId) >= depositVouchers.length - 1)} className="p-2 hover:bg-slate-100 rounded-full text-slate-600 disabled:opacity-30" title="Ø§Ù„Ø³Ø§Ø¨Ù‚ (Ø§Ù„Ø£Ù‚Ø¯Ù…)">
                <ArrowRight className="w-5 h-5" />
             </button>
             <button onClick={handleNext} disabled={depositVouchers.length === 0 || Boolean(currentVoucherId && depositVouchers.findIndex(v => v.id === currentVoucherId) <= 0)} className="p-2 hover:bg-slate-100 rounded-full text-slate-600 disabled:opacity-30" title="Ø§Ù„ØªØ§Ù„ÙŠ (Ø§Ù„Ø£Ø­Ø¯Ø«)">
                <ArrowLeft className="w-5 h-5" />
             </button>
             <div className="h-6 w-px bg-slate-300 mx-2"></div>
             <button onClick={handleNew} className="flex items-center gap-2 px-4 py-2 bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100 font-bold text-sm">
                <Plus className="w-4 h-4" />
                <span>Ø³Ù†Ø¯ Ø¬Ø¯ÙŠØ¯</span>
             </button>
         </div>
         <div className="relative">
             <Search className="w-4 h-4 absolute right-3 top-3 text-slate-400" />
             <select 
               className="pl-4 pr-10 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none appearance-none bg-white w-64"
               onChange={(e) => {
                 const v = depositVouchers.find(v => String(v.id) === String(e.target.value));
                 if(v) loadVoucher(v);
               }}
               value={currentVoucherId || ''}
             >
               <option value="">Ø¨Ø­Ø« Ø¹Ù† Ø³Ù†Ø¯ ØªØ£Ù…ÙŠÙ†...</option>
               {depositVouchers.map(v => (
                 <option key={v.id} value={v.id}>{v.voucher_number} - {v.amount}</option>
               ))}
             </select>
         </div>
      </div>

      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => navigate(-1)} className="text-slate-500 hover:text-slate-800">
          <ArrowRight />
        </button>
        <div className="bg-indigo-100 p-2 rounded-lg text-indigo-600">
          <ShieldCheck size={24} />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-slate-800">{isEditing ? 'ØªØ¹Ø¯ÙŠÙ„ Ø³Ù†Ø¯ ØªØ£Ù…ÙŠÙ†' : 'Ø³Ù†Ø¯ Ù‚Ø¨Ø¶ ØªØ£Ù…ÙŠÙ† Ù…Ù† Ø¹Ù…ÙŠÙ„'}</h1>
          <p className="text-slate-500">ØªØ³Ø¬ÙŠÙ„ Ù…Ø¨Ù„Øº ØªØ£Ù…ÙŠÙ† Ù…Ø³ØªØ±Ø¯ Ù…Ù† Ø§Ù„Ø¹Ù…ÙŠÙ„ (ÙŠØ¸Ù‡Ø± ÙÙŠ Ø§Ù„Ø®ØµÙˆÙ…)</p>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
        <div className={voucherToPrint ? 'print:hidden' : ''}>
        <form onSubmit={handleSubmit} className="space-y-6">
          {isEditing && (
              <div className="bg-slate-50 p-3 rounded-lg border border-slate-200 mb-4">
                  <span className="text-sm font-bold text-slate-500">Ø±Ù‚Ù… Ø§Ù„Ø³Ù†Ø¯: </span>
                  <span className="font-mono font-bold text-indigo-600">{formData.voucherNumber}</span>
              </div>
           )}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            
            {/* Ø§Ù„ØªØ§Ø±ÙŠØ® */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">Ø§Ù„ØªØ§Ø±ÙŠØ®</label>
              <input 
                type="date" 
                required
                value={formData.date}
                onChange={e => setFormData({...formData, date: e.target.value})}
                className="w-full border border-slate-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              />
            </div>

            {/* Ø§Ø®ØªÙŠØ§Ø± Ø§Ù„Ø¹Ù…ÙŠÙ„ */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">Ø§Ù„Ø¹Ù…ÙŠÙ„</label>
              <select 
                required
                value={formData.customerId}
                onChange={e => setFormData({...formData, customerId: e.target.value})}
                className="w-full border border-slate-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              >
                <option value="">Ø§Ø®ØªØ± Ø§Ù„Ø¹Ù…ÙŠÙ„...</option>
                {customers.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>

            {/* Ø§Ø®ØªÙŠØ§Ø± Ø§Ù„Ø®Ø²ÙŠÙ†Ø©/Ø§Ù„Ø¨Ù†Ùƒ */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">Ø¥ÙŠØ¯Ø§Ø¹ ÙÙŠ (Ø§Ù„Ø®Ø²ÙŠÙ†Ø© / Ø§Ù„Ø¨Ù†Ùƒ)</label> 
              {/* NEW: Search input for treasury accounts */}
              <div className="relative mb-2">
                <Search className="w-4 h-4 absolute right-3 top-2.5 text-slate-400" />
                <input
                  type="text"
                  placeholder="Ø¨Ø­Ø« Ø¹Ù† Ø­Ø³Ø§Ø¨..."
                  value={treasurySearchTerm}
                  onChange={(e) => setTreasurySearchTerm(e.target.value)}
                  className="w-full border border-slate-300 rounded-lg px-4 py-2 pr-10 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                />
              </div>
              <select 
                required
                value={formData.treasuryAccountId}
                onChange={e => setFormData({...formData, treasuryAccountId: e.target.value})}
                className="w-full border border-slate-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              >
                <option value="">Ø§Ø®ØªØ± Ø§Ù„Ø­Ø³Ø§Ø¨...</option>
                {treasuryAccounts.map(a => (
                  <option key={a.id} value={a.id}>{a.name} ({a.code})</option>
                ))}
              </select>
            </div>

            {/* Ø§Ù„Ù…Ø¨Ù„Øº */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">Ù…Ø¨Ù„Øº Ø§Ù„ØªØ£Ù…ÙŠÙ†</label>
              <input 
                type="number" 
                required
                min="0"
                step="0.01"
                value={formData.amount}
                onChange={e => setFormData({...formData, amount: e.target.value})}
                className="w-full border border-slate-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 font-bold text-lg"
                placeholder="0.00"
              />
            </div>

            {/* Ø§Ù„Ø¨ÙŠØ§Ù† */}
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-slate-700 mb-2">Ø§Ù„Ø¨ÙŠØ§Ù† / Ù…Ù„Ø§Ø­Ø¸Ø§Øª</label>
              <textarea 
                rows={3}
                value={formData.description}
                onChange={e => setFormData({...formData, description: e.target.value})}
                className="w-full border border-slate-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                placeholder="Ø´Ø±Ø­ Ù…Ø®ØªØµØ± Ù„Ù„Ø¹Ù…Ù„ÙŠØ©..."
              />
            </div>
          </div>

          <div className="pt-4 border-t border-slate-100 flex justify-end gap-4">
            <button 
                type="button"
                onClick={handlePrint}
                className="bg-slate-800 text-white px-6 py-2.5 rounded-lg hover:bg-slate-700 transition-colors flex items-center gap-2 font-bold"
            >
                <Printer size={18} /> Ø·Ø¨Ø§Ø¹Ø©
            </button>
            <button 
                type="button"
                onClick={handleWhatsApp}
                className="bg-green-600 text-white px-6 py-2.5 rounded-lg hover:bg-green-700 transition-colors flex items-center gap-2 font-bold"
            >
                <MessageCircle size={18} /> ÙˆØ§ØªØ³Ø§Ø¨
            </button>
            <button 
              type="submit"
              disabled={loading}
              className="bg-indigo-600 text-white px-6 py-2.5 rounded-lg hover:bg-indigo-700 transition-colors flex items-center gap-2 font-bold shadow-lg shadow-indigo-100 disabled:opacity-50"
            >
              {loading ? <Loader2 className="animate-spin" size={18} /> : <Save size={18} />}
              {isEditing ? 'Ø­ÙØ¸ Ø§Ù„ØªØ¹Ø¯ÙŠÙ„Ø§Øª' : 'Ø­ÙØ¸ Ø³Ù†Ø¯ Ø§Ù„ØªØ£Ù…ÙŠÙ†'}
            </button>
          </div>
        </form>
        </div>
      </div>
      <CustomerDepositPrint voucher={voucherToPrint} companySettings={companySettings} />
    </div>
  );
};

export default CustomerDepositForm;

import { logger } from '../../../../utils/logger';
import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../../../../supabaseClient';
import { useAccounting } from '../../../../context/AccountingContext';
import { useToast } from '../../../../context/ToastContext';
import {
  Clock,
  Printer,
  Calendar,
  Building2,
  Users,
  Search,
  Filter,
  ArrowUpDown,
  Download,
  Receipt,
  CheckCircle2,
  AlertTriangle,
  FileText,
  DollarSign,
  CreditCard,
  Zap,
  Smartphone,
  Eye,
  X,
  RefreshCw,
  Sun,
  Moon,
  ChevronRight,
  ExternalLink,
  Lock,
  Unlock
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { useNavigate } from 'react-router-dom';

interface ShiftDrawerTransaction {
  id: string;
  transaction_type: string;
  amount: number;
  payment_method?: string;
  reason?: string;
  custodian_or_payer_name?: string;
  customer_phone?: string;
  delivery_date?: string;
  booking_notes?: string;
  created_at: string;
}

interface ShiftRecord {
  id: string;
  organization_id: string;
  user_id: string;
  pos_terminal_id?: string;
  start_time: string;
  end_time?: string;
  status: 'OPEN' | 'CLOSED';
  opening_balance: number;
  actual_cash?: number;
  expected_cash?: number;
  difference?: number;
  total_gross_sales?: number;
  total_cash_sales?: number;
  total_card_sales?: number;
  total_instapay_sales?: number;
  total_wallet_sales?: number;
  total_redeemed_deposits?: number;
  total_credit_sales?: number;
  total_paid_ins?: number;
  total_paid_outs?: number;
  total_safe_drops?: number;
  total_cash_returns?: number;
  total_cash_deposits_in?: number;
  total_wallet_deposits_in?: number;
  total_instapay_deposits_in?: number;
  total_card_deposits_in?: number;
  total_deposits_in?: number;
  total_cash_deposits_refund?: number;
  total_wallet_deposits_refund?: number;
  total_instapay_deposits_refund?: number;
  total_deposits_refund?: number;
  notes?: string;
  closing_journal_entry_id?: string;
  created_at: string;
  // Joined fields
  cashier_name?: string;
  org_name?: string;
  terminal_name?: string;
}

interface OrderRecord {
  id: string;
  order_number: string;
  created_at: string;
  grand_total: number;
  payment_method: string;
  status: string;
  total_tax?: number;
  total_discount?: number;
  customer_name?: string;
}

export default function CashierShiftsHistory() {
  const { organization, currentUser, currentSelectedOrgId, currencySymbol = 'ج.م' } = useAccounting() as any;
  const { showToast } = useToast();
  const navigate = useNavigate();

  // 1. Data States
  const [shifts, setShifts] = useState<ShiftRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [organizationsList, setOrganizationsList] = useState<{ id: string; name: string }[]>([]);
  const [cashiersList, setCashiersList] = useState<{ id: string; full_name: string }[]>([]);
  const [terminalsList, setTerminalsList] = useState<{ id: string; name: string }[]>([]);

  // 2. Filter States
  const [selectedOrgId, setSelectedOrgId] = useState<string>('ALL');
  const [selectedCashierId, setSelectedCashierId] = useState<string>('ALL');
  const [startDate, setStartDate] = useState<string>(() => {
    const d = new Date();
    d.setDate(d.getDate() - 7);
    return d.toISOString().split('T')[0];
  });
  const [endDate, setEndDate] = useState<string>(() => new Date().toISOString().split('T')[0]);
  const [shiftPeriod, setShiftPeriod] = useState<'ALL' | 'MORNING' | 'EVENING'>('ALL');
  const [shiftStatus, setShiftStatus] = useState<'ALL' | 'CLOSED' | 'OPEN'>('ALL');
  const [diffFilter, setDiffFilter] = useState<'ALL' | 'BALANCED' | 'DEFICIT' | 'SURPLUS'>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // 3. Drill-down Order Details Modal
  const [selectedShiftForOrders, setSelectedShiftForOrders] = useState<ShiftRecord | null>(null);
  const [shiftOrders, setShiftOrders] = useState<OrderRecord[]>([]);
  const [shiftDrawerTrans, setShiftDrawerTrans] = useState<ShiftDrawerTransaction[]>([]);
  const [modalTab, setModalTab] = useState<'ORDERS' | 'DRAWER'>('ORDERS');
  const [loadingShiftOrders, setLoadingShiftOrders] = useState(false);

  // Load Branches & Cashiers lists
  useEffect(() => {
    const loadMetadata = async () => {
      try {
        const [orgsRes, profilesRes, terminalsRes] = await Promise.allSettled([
          supabase.from('organizations').select('id, name').order('name'),
          supabase.from('profiles').select('id, full_name').order('full_name'),
          supabase.from('pos_terminals').select('id, name')
        ]);
        if (orgsRes.status === 'fulfilled' && orgsRes.value.data) setOrganizationsList(orgsRes.value.data);
        if (profilesRes.status === 'fulfilled' && profilesRes.value.data) setCashiersList(profilesRes.value.data);
        if (terminalsRes.status === 'fulfilled' && terminalsRes.value.data) setTerminalsList(terminalsRes.value.data);
      } catch (err) {
        logger.warn('Error loading filter metadata:', err);
      }
    };
    loadMetadata();
  }, []);

  // Sync selected branch with global context if chosen
  useEffect(() => {
    if (currentSelectedOrgId) {
      setSelectedOrgId(currentSelectedOrgId);
    }
  }, [currentSelectedOrgId]);

  // Fetch shifts
  const fetchShifts = async () => {
    setLoading(true);
    try {
      let query = supabase
        .from('shifts')
        .select('*')
        .order('start_time', { ascending: false });

      if (selectedOrgId && selectedOrgId !== 'ALL') {
        query = query.eq('organization_id', selectedOrgId);
      }
      if (selectedCashierId && selectedCashierId !== 'ALL') {
        query = query.eq('user_id', selectedCashierId);
      }
      if (startDate) {
        query = query.gte('start_time', `${startDate}T00:00:00`);
      }
      if (endDate) {
        query = query.lte('start_time', `${endDate}T23:59:59`);
      }
      if (shiftStatus !== 'ALL') {
        query = query.eq('status', shiftStatus);
      }

      const { data, error } = await query.limit(200);

      if (error) throw error;

      // In-memory mapping to avoid PostgREST relationship/foreign-key cache errors
      const orgMap = new Map<string, string>(organizationsList.map(o => [o.id, o.name]));
      const cashierMap = new Map<string, string>(cashiersList.map(c => [c.id, c.full_name]));
      const terminalMap = new Map<string, string>(terminalsList.map(t => [t.id, t.name]));

      // Check missing cashiers
      const missingUserIds = (data || [])
        .map((s: any) => s.user_id)
        .filter((uid: string) => uid && !cashierMap.has(uid));
      if (missingUserIds.length > 0) {
        try {
          const { data: profs } = await supabase
            .from('profiles')
            .select('id, full_name')
            .in('id', Array.from(new Set(missingUserIds)));
          if (profs) profs.forEach((p: any) => cashierMap.set(p.id, p.full_name));
        } catch (_) {}
      }

      // Check missing orgs
      const missingOrgIds = (data || [])
        .map((s: any) => s.organization_id)
        .filter((oid: string) => oid && !orgMap.has(oid));
      if (missingOrgIds.length > 0) {
        try {
          const { data: orgs } = await supabase
            .from('organizations')
            .select('id, name')
            .in('id', Array.from(new Set(missingOrgIds)));
          if (orgs) orgs.forEach((o: any) => orgMap.set(o.id, o.name));
        } catch (_) {}
      }

      // Check missing terminals
      const missingTerminalIds = (data || [])
        .map((s: any) => s.pos_terminal_id)
        .filter((tid: string) => tid && !terminalMap.has(tid));
      if (missingTerminalIds.length > 0) {
        try {
          const { data: terms } = await supabase
            .from('pos_terminals')
            .select('id, name')
            .in('id', Array.from(new Set(missingTerminalIds)));
          if (terms) terms.forEach((t: any) => terminalMap.set(t.id, t.name));
        } catch (_) {}
      }

      const formatted: ShiftRecord[] = (data || []).map((s: any) => ({
        ...s,
        opening_balance: Number(s.opening_balance || 0),
        actual_cash: s.actual_cash !== null ? Number(s.actual_cash) : undefined,
        expected_cash: s.expected_cash !== null ? Number(s.expected_cash) : undefined,
        difference: s.difference !== null ? Number(s.difference) : undefined,
        total_gross_sales: Number(s.total_gross_sales || 0),
        total_cash_sales: Number(s.total_cash_sales || 0),
        total_card_sales: Number(s.total_card_sales || 0),
        total_instapay_sales: Number(s.total_instapay_sales || 0),
        total_wallet_sales: Number(s.total_wallet_sales || 0),
        total_redeemed_deposits: Number(s.total_redeemed_deposits || 0),
        total_credit_sales: Number(s.total_credit_sales || 0),
        total_paid_ins: Number(s.total_paid_ins || 0),
        total_paid_outs: Number(s.total_paid_outs || 0),
        total_safe_drops: Number(s.total_safe_drops || 0),
        total_cash_returns: Number(s.total_cash_returns || 0),
        cashier_name: cashierMap.get(s.user_id) || s.cashier_name || 'كاشير غير محدد',
        org_name: orgMap.get(s.organization_id) || organization?.name || 'الفرع الرئيسي',
        terminal_name: terminalMap.get(s.pos_terminal_id) || s.terminal_name || 'جهاز كاشير'
      }));

      setShifts(formatted);
    } catch (err: any) {
      logger.error('Error fetching shifts history:', err);
      showToast('تعذر تحميل سجل الورديات: ' + (err.message || ''), 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchShifts();
  }, [selectedOrgId, selectedCashierId, startDate, endDate, shiftStatus]);

  // Determine Morning vs Evening Shift
  const getShiftPeriodType = (startTimeStr: string): 'MORNING' | 'EVENING' => {
    try {
      const date = new Date(startTimeStr);
      const hour = date.getHours();
      return (hour >= 5 && hour < 16) ? 'MORNING' : 'EVENING';
    } catch {
      return 'MORNING';
    }
  };

  // Filtered shifts in-memory (search, morning/evening, diff)
  const filteredShifts = useMemo(() => {
    return shifts.filter(s => {
      // Period filter
      if (shiftPeriod !== 'ALL') {
        const period = getShiftPeriodType(s.start_time);
        if (period !== shiftPeriod) return false;
      }
      // Difference filter
      if (diffFilter !== 'ALL') {
        const diff = s.difference ?? 0;
        if (diffFilter === 'BALANCED' && Math.abs(diff) > 0.05) return false;
        if (diffFilter === 'DEFICIT' && diff >= -0.05) return false;
        if (diffFilter === 'SURPLUS' && diff <= 0.05) return false;
      }
      // Query search
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchCashier = s.cashier_name?.toLowerCase().includes(q);
        const matchOrg = s.org_name?.toLowerCase().includes(q);
        const matchTerminal = s.terminal_name?.toLowerCase().includes(q);
        const matchId = s.id?.toLowerCase().includes(q);
        if (!matchCashier && !matchOrg && !matchTerminal && !matchId) return false;
      }
      return true;
    });
  }, [shifts, shiftPeriod, diffFilter, searchQuery]);

  // KPI calculations
  const kpis = useMemo(() => {
    let grossSales = 0;
    let cashSales = 0;
    let nonCashSales = 0;
    let totalDiff = 0;
    let deficitCount = 0;

    filteredShifts.forEach(s => {
      grossSales += s.total_gross_sales || 0;
      cashSales += s.total_cash_sales || 0;
      nonCashSales += (s.total_card_sales || 0) + (s.total_instapay_sales || 0) + (s.total_wallet_sales || 0);
      const diff = s.difference || 0;
      totalDiff += diff;
      if (diff < -0.05) deficitCount++;
    });

    return {
      count: filteredShifts.length,
      grossSales,
      cashSales,
      nonCashSales,
      totalDiff,
      deficitCount
    };
  }, [filteredShifts]);

  // Print Z-Report for a specific shift
  const printZReport = (shift: ShiftRecord) => {
    const printWindow = window.open('', '_blank', 'width=450,height=700');
    if (!printWindow) {
      alert('يرجى السماح بالنوافذ المنبثقة للطباعة');
      return;
    }

    const openFloat = shift.opening_balance || 0;
    const grossSales = shift.total_gross_sales || 0;
    const cashSales = shift.total_cash_sales || 0;
    const cardSales = shift.total_card_sales || 0;
    const instapaySales = shift.total_instapay_sales || 0;
    const walletSales = shift.total_wallet_sales || 0;
    const redeemedDeposits = shift.total_redeemed_deposits || 0;
    const creditSales = shift.total_credit_sales || 0;

    const paidIns = shift.total_paid_ins || 0;
    const paidOuts = shift.total_paid_outs || 0;
    const safeDrops = shift.total_safe_drops || 0;
    const cashReturns = shift.total_cash_returns || 0;

    const cashDepositsIn = (shift as any).total_cash_deposits_in || (shift as any).cash_deposits_in || 0;
    const walletDepositsIn = (shift as any).total_wallet_deposits_in || (shift as any).wallet_deposits_in || 0;
    const instapayDepositsIn = (shift as any).total_instapay_deposits_in || (shift as any).instapay_deposits_in || 0;
    const cardDepositsIn = (shift as any).total_card_deposits_in || (shift as any).card_deposits_in || 0;
    const totalDepositsIn = (shift as any).total_deposits_in || (cashDepositsIn + walletDepositsIn + instapayDepositsIn + cardDepositsIn);

    const cashDepositsRefund = (shift as any).total_cash_deposits_refund || (shift as any).cash_deposits_refund || 0;
    const walletDepositsRefund = (shift as any).total_wallet_deposits_refund || (shift as any).wallet_deposits_refund || 0;
    const instapayDepositsRefund = (shift as any).total_instapay_deposits_refund || (shift as any).instapay_deposits_refund || 0;
    const totalDepositsRefund = (shift as any).total_deposits_refund || (cashDepositsRefund + walletDepositsRefund + instapayDepositsRefund);

    const expected = shift.expected_cash !== undefined
      ? shift.expected_cash
      : Math.max(0, (openFloat + cashSales + paidIns + cashDepositsIn) - (paidOuts + safeDrops + cashReturns + cashDepositsRefund));

    const actual = shift.actual_cash ?? 0;
    const diff = shift.difference ?? (actual - expected);
    const period = getShiftPeriodType(shift.start_time) === 'MORNING' ? 'وردية صباحية ☀️' : 'وردية مسائية 🌙';

    const html = `
      <!DOCTYPE html>
      <html lang="ar" dir="rtl">
      <head>
        <meta charset="utf-8" />
        <title>تقرير إغلاق الوردية (Z-Report) - ${shift.cashier_name}</title>
        <style>
          @page { size: 80mm auto; margin: 4mm; }
          body {
            font-family: 'Courier New', monospace, Tahoma, sans-serif;
            font-size: 12px;
            color: #000;
            background: #fff;
            padding: 5px;
            margin: 0;
            direction: rtl;
          }
          .text-center { text-align: center; }
          .font-bold { font-weight: bold; }
          .divider { border-top: 1px dashed #000; margin: 8px 0; }
          .double-divider { border-top: 2px solid #000; margin: 8px 0; }
          .flex { display: flex; justify-content: space-between; margin: 3px 0; }
          .title { font-size: 15px; font-weight: 900; }
          .signature-box { margin-top: 25px; display: flex; justify-content: space-between; font-size: 11px; }
        </style>
      </head>
      <body>
        <div class="text-center">
          <div class="title">تقرير إغلاق الوردية (Z-Report)</div>
          <div style="font-weight: bold; margin-top: 2px;">${shift.org_name || 'TriPro ERP'}</div>
          <div style="font-size: 11px; color: #444;">${shift.terminal_name || 'كاشير'} | ${period}</div>
        </div>
        <div class="divider"></div>
        <div class="flex"><span>الكاشير:</span><span class="font-bold">${shift.cashier_name}</span></div>
        <div class="flex"><span>رقم الوردية:</span><span>#${shift.id.substring(0, 8)}</span></div>
        <div class="flex"><span>وقت البدء:</span><span>${new Date(shift.start_time).toLocaleString('ar-EG')}</span></div>
        <div class="flex"><span>وقت الإغلاق:</span><span>${shift.end_time ? new Date(shift.end_time).toLocaleString('ar-EG') : 'قيد العمل'}</span></div>
        <div class="divider"></div>

        <div class="font-bold" style="margin-bottom: 4px;">📊 مبيعات القنوات (Sales Channels):</div>
        <div class="flex"><span>مبيعات نقدية (Cash):</span><span>${cashSales.toFixed(2)} ${currencySymbol}</span></div>
        <div class="flex"><span>بطاقات وشبكة (Card):</span><span>${cardSales.toFixed(2)} ${currencySymbol}</span></div>
        <div class="flex"><span>إنستاباي (InstaPay):</span><span>${instapaySales.toFixed(2)} ${currencySymbol}</span></div>
        <div class="flex"><span>محافظ إلكترونية وفودافون كاش:</span><span>${walletSales.toFixed(2)} ${currencySymbol}</span></div>
        <div class="flex"><span>عربونات وحجوزات مستهلكة:</span><span>${redeemedDeposits.toFixed(2)} ${currencySymbol}</span></div>
        <div class="flex"><span>مبيعات آجلة (ذمم عملاء):</span><span>${creditSales.toFixed(2)} ${currencySymbol}</span></div>
        <div class="divider"></div>
        <div class="flex font-bold" style="font-size: 13px;"><span>إجمالي المبيعات الكلية:</span><span>${grossSales.toFixed(2)} ${currencySymbol}</span></div>
        <div class="double-divider"></div>

        <div class="font-bold" style="margin-bottom: 4px;">🎯 حركة عربونات وحجوزات الوردية (Bookings & Deposits):</div>
        <div class="flex"><span>(+) استلام عربون نقداً بالدرج:</span><span>${cashDepositsIn.toFixed(2)} ${currencySymbol}</span></div>
        <div class="flex"><span>(+) استلام عربون محفظة (فودافون كاش):</span><span>${walletDepositsIn.toFixed(2)} ${currencySymbol}</span></div>
        <div class="flex"><span>(+) استلام عربون تحويل إنستاباي:</span><span>${instapayDepositsIn.toFixed(2)} ${currencySymbol}</span></div>
        <div class="flex"><span>(+) استلام عربون بطاقة وشبكة:</span><span>${cardDepositsIn.toFixed(2)} ${currencySymbol}</span></div>
        <div class="flex font-bold" style="background:#f1f5f9; padding:2px 4px; border-radius:4px;"><span>إجمالي العربونات المستلمة:</span><span>${totalDepositsIn.toFixed(2)} ${currencySymbol}</span></div>
        <div class="flex" style="margin-top: 3px;"><span>(-) رد عربون ملغي نقداً من الدرج:</span><span>${cashDepositsRefund.toFixed(2)} ${currencySymbol}</span></div>
        <div class="flex"><span>(-) رد عربون ملغي إلكتروني:</span><span>${(walletDepositsRefund + instapayDepositsRefund).toFixed(2)} ${currencySymbol}</span></div>
        <div class="flex font-bold" style="background:#f1f5f9; padding:2px 4px; border-radius:4px;"><span>إجمالي العربونات المردودة للعملاء:</span><span>${totalDepositsRefund.toFixed(2)} ${currencySymbol}</span></div>
        <div class="flex" style="margin-top: 3px;"><span>(~) تنفيذ حجز (عربونات مستهلكة):</span><span>${redeemedDeposits.toFixed(2)} ${currencySymbol}</span></div>
        <div class="double-divider"></div>

        <div class="font-bold" style="margin-bottom: 4px;">💵 حركة نقدية الدرج الفعلية (Drawer Cash Flow):</div>
        <div class="flex"><span>(+) الرصيد الافتتاحي (العهدة):</span><span>${openFloat.toFixed(2)} ${currencySymbol}</span></div>
        <div class="flex"><span>(+) مبيعات نقدية مقبوضة:</span><span>${cashSales.toFixed(2)} ${currencySymbol}</span></div>
        <div class="flex"><span>(+) عربونات حجز مستلمة نقداً:</span><span>${cashDepositsIn.toFixed(2)} ${currencySymbol}</span></div>
        <div class="flex"><span>(+) تزويد نقدية فكة بالدرج:</span><span>${paidIns.toFixed(2)} ${currencySymbol}</span></div>
        <div class="flex"><span>(-) مصروفات نثرية منصرفة:</span><span>${paidOuts.toFixed(2)} ${currencySymbol}</span></div>
        <div class="flex"><span>(-) توريدات نقدية للخزينة:</span><span>${safeDrops.toFixed(2)} ${currencySymbol}</span></div>
        <div class="flex"><span>(-) رد عربونات حجز ملغاة نقداً:</span><span>${cashDepositsRefund.toFixed(2)} ${currencySymbol}</span></div>
        <div class="flex"><span>(-) مرتجعات مبيعات نقدية:</span><span>${cashReturns.toFixed(2)} ${currencySymbol}</span></div>
        <div class="divider"></div>
        <div class="flex font-bold"><span>النقدية المتوقعة بالدرج:</span><span>${expected.toFixed(2)} ${currencySymbol}</span></div>
        <div class="flex font-bold" style="font-size: 13px;"><span>النقدية الفعلية المحصورة:</span><span>${actual.toFixed(2)} ${currencySymbol}</span></div>
        <div class="flex font-bold" style="margin-top: 4px;">
          <span>الفارق (عجز / زيادة):</span>
          <span>${diff > 0 ? `+${diff.toFixed(2)} (فائض)` : diff < 0 ? `${diff.toFixed(2)} (عجز)` : '0.00 (متطابق ✔️)'} ${currencySymbol}</span>
        </div>
        ${shift.notes ? `<div class="divider"></div><div style="font-size: 11px;"><strong>ملاحظات:</strong> ${shift.notes}</div>` : ''}

        <div class="signature-box">
          <div class="text-center">
            <div>توقيع الكاشير (المسلّم)</div>
            <div style="margin-top: 25px;">...................</div>
          </div>
          <div class="text-center">
            <div>توقيع المشرف (المستلم)</div>
            <div style="margin-top: 25px;">...................</div>
          </div>
        </div>
        <div class="divider"></div>
        <div class="text-center" style="font-size: 10px; color: #555;">TriPro ERP Intelligent POS Audit System</div>
      </body>
      </html>
    `;
    printWindow.document.write(html);
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => {
      printWindow.print();
    }, 300);
  };

  // Open Shift Sales Orders Drill-down
  const handleOpenShiftOrders = async (shift: ShiftRecord) => {
    setSelectedShiftForOrders(shift);
    setModalTab('ORDERS');
    setLoadingShiftOrders(true);
    try {
      // جلب حركات الدرج والعربونات للوردية
      try {
        const { data: dTrans } = await supabase
          .from('pos_drawer_transactions')
          .select('id, transaction_type, amount, payment_method, reason, custodian_or_payer_name, customer_phone, delivery_date, booking_notes, created_at')
          .eq('shift_id', shift.id)
          .order('created_at', { ascending: true });
        setShiftDrawerTrans(Array.isArray(dTrans) ? (dTrans as any) : []);
      } catch (dErr) {
        setShiftDrawerTrans([]);
      }

      const { data, error } = await supabase
        .from('orders')
        .select(`
          id,
          order_number,
          created_at,
          grand_total,
          status,
          total_tax,
          total_discount,
          customer_id,
          notes
        `)
        .eq('shift_id', shift.id)
        .order('created_at', { ascending: true });

      if (error) throw error;

      // Lookup customer names safely without foreign key join failures
      const custIds = (data || []).map((o: any) => o.customer_id).filter(Boolean);
      const custMap = new Map<string, string>();
      if (custIds.length > 0) {
        try {
          const { data: custs } = await supabase
            .from('customers')
            .select('id, name')
            .in('id', Array.from(new Set(custIds)));
          if (custs) custs.forEach((c: any) => custMap.set(c.id, c.name));
        } catch (_) {}
      }

      // Lookup payment methods safely from payments ledger
      const orderIds = (data || []).map((o: any) => o.id).filter(Boolean);
      const paymentMethodMap = new Map<string, string>();
      if (orderIds.length > 0) {
        try {
          const { data: paymentsData } = await supabase
            .from('payments')
            .select('order_id, payment_method')
            .in('order_id', orderIds);
          if (paymentsData && paymentsData.length > 0) {
            const orderPayments = new Map<string, string[]>();
            paymentsData.forEach((p: any) => {
              const list = orderPayments.get(p.order_id) || [];
              list.push(p.payment_method);
              orderPayments.set(p.order_id, list);
            });
            orderPayments.forEach((methods, oid) => {
              const uniqueMethods = Array.from(new Set(methods));
              paymentMethodMap.set(oid, uniqueMethods.join(' + '));
            });
          }
        } catch (_) {}
      }

      const mapped: OrderRecord[] = (data || []).map((o: any) => {
        let pMethod = paymentMethodMap.get(o.id);
        if (!pMethod) {
          if (o.notes?.includes('فيزا') || o.notes?.includes('CARD')) pMethod = 'بطاقة / فيزا';
          else if (o.notes?.includes('دفع متعدد') || o.notes?.includes('SPLIT')) pMethod = 'دفع متعدد';
          else if (o.notes?.includes('محفظة') || o.notes?.includes('WALLET')) pMethod = 'محفظة إلكترونية';
          else if (o.notes?.includes('إنستاباي') || o.notes?.includes('INSTAPAY')) pMethod = 'إنستاباي';
          else pMethod = 'نقدية (كاش)';
        } else {
          if (pMethod === 'CASH') pMethod = 'نقدية (كاش)';
          else if (pMethod === 'CARD') pMethod = 'بطاقة / فيزا';
          else if (pMethod === 'INSTAPAY') pMethod = 'إنستاباي';
          else if (pMethod === 'WALLET') pMethod = 'محفظة إلكترونية';
          else if (pMethod === 'CREDIT') pMethod = 'آجل';
        }

        return {
          id: o.id,
          order_number: o.order_number || `#${o.id.substring(0, 6)}`,
          created_at: o.created_at,
          grand_total: Number(o.grand_total || 0),
          payment_method: pMethod,
          status: o.status || 'COMPLETED',
          total_tax: Number(o.total_tax || 0),
          total_discount: Number(o.total_discount || 0),
          customer_name: (o.customer_id && custMap.get(o.customer_id)) || 'عميل نقدي'
        };
      });

      setShiftOrders(mapped);
    } catch (err: any) {
      logger.error('Error fetching shift orders:', err);
      showToast('تعذر جلب فواتير الوردية: ' + (err.message || ''), 'error');
    } finally {
      setLoadingShiftOrders(false);
    }
  };

  // Print Shift Orders Statement (كشف مبيعات الوردية)
  const printShiftOrdersStatement = (shift: ShiftRecord, orders: OrderRecord[]) => {
    const printWindow = window.open('', '_blank', 'width=800,height=900');
    if (!printWindow) {
      alert('يرجى السماح بالنوافذ المنبثقة للطباعة');
      return;
    }

    const totalOrdersAmount = orders.reduce((sum, o) => sum + o.grand_total, 0);

    const html = `
      <!DOCTYPE html>
      <html lang="ar" dir="rtl">
      <head>
        <meta charset="utf-8" />
        <title>كشف مبيعات الوردية - ${shift.cashier_name}</title>
        <style>
          @page { size: A4 portrait; margin: 10mm; }
          body {
            font-family: 'Segoe UI', Tahoma, Arial, sans-serif;
            font-size: 13px;
            color: #1e293b;
            background: #fff;
            padding: 10px;
            direction: rtl;
          }
          .text-center { text-align: center; }
          .font-bold { font-weight: bold; }
          table { width: 100%; border-collapse: collapse; margin-top: 15px; }
          th { background: #f1f5f9; color: #0f172a; padding: 8px; border: 1px solid #cbd5e1; font-size: 12px; }
          td { padding: 7px 8px; border: 1px solid #cbd5e1; font-size: 12px; text-align: center; }
          .text-right { text-align: right; }
          .text-left { text-align: left; }
          .header-box { border-bottom: 2px solid #2563eb; padding-bottom: 12px; margin-bottom: 15px; }
          .meta-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; font-size: 12px; background: #f8fafc; padding: 10px; border-radius: 8px; margin-bottom: 15px; }
          .badge { padding: 2px 6px; border-radius: 4px; font-size: 10px; font-weight: bold; }
        </style>
      </head>
      <body>
        <div class="header-box text-center">
          <h2 style="margin: 0; font-size: 20px; color: #0f172a;">كشف فواتير ومبيعات الوردية للمطابقة المحاسبية</h2>
          <div style="font-size: 13px; color: #64748b; margin-top: 4px;">${shift.org_name || 'TriPro ERP'} | ${shift.terminal_name || 'الكاشير'}</div>
        </div>

        <div class="meta-grid">
          <div><strong>الكاشير:</strong> ${shift.cashier_name}</div>
          <div><strong>رقم الوردية:</strong> #${shift.id.substring(0, 8)}</div>
          <div><strong>الفترة:</strong> ${getShiftPeriodType(shift.start_time) === 'MORNING' ? 'وردية صباحية ☀️' : 'وردية مسائية 🌙'}</div>
          <div><strong>وقت البدء:</strong> ${new Date(shift.start_time).toLocaleString('ar-EG')}</div>
          <div><strong>وقت الإغلاق:</strong> ${shift.end_time ? new Date(shift.end_time).toLocaleString('ar-EG') : 'قيد العمل'}</div>
          <div><strong>إجمالي الفواتير:</strong> ${orders.length} فاتورة</div>
        </div>

        <table>
          <thead>
            <tr>
              <th>#</th>
              <th>رقم الفاتورة</th>
              <th>الوقت</th>
              <th>العميل</th>
              <th>طريقة السداد</th>
              <th>الخصم</th>
              <th>الإجمالي الصافي</th>
              <th>الحالة</th>
            </tr>
          </thead>
          <tbody>
            ${orders.map((o, idx) => `
              <tr>
                <td>${idx + 1}</td>
                <td class="font-bold">${o.order_number}</td>
                <td>${new Date(o.created_at).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })}</td>
                <td class="text-right">${o.customer_name}</td>
                <td><span class="badge" style="background:#e0f2fe; color:#0369a1;">${o.payment_method}</span></td>
                <td>${o.total_discount ? o.total_discount.toFixed(2) : '0.00'}</td>
                <td class="font-bold text-left">${o.grand_total.toFixed(2)} ${currencySymbol}</td>
                <td>${o.status === 'PAID' || o.status === 'COMPLETED' ? 'مسدد ✔️' : o.status}</td>
              </tr>
            `).join('')}
          </tbody>
          <tfoot>
            <tr style="background:#f8fafc; font-weight:bold; font-size:13px;">
              <td colspan="6" class="text-right">إجمالي مبيعات الوردية المسجلة:</td>
              <td class="text-left" style="color:#2563eb;">${totalOrdersAmount.toFixed(2)} ${currencySymbol}</td>
              <td></td>
            </tr>
          </tfoot>
        </table>

        <div style="margin-top: 30px; display:flex; justify-content:space-between; font-size: 12px; padding: 0 40px;">
          <div class="text-center">
            <div>توقيع الكاشير المسلّم</div>
            <div style="margin-top: 35px;">___________________</div>
          </div>
          <div class="text-center">
            <div>اعتماد المشرف والمحاسب</div>
            <div style="margin-top: 35px;">___________________</div>
          </div>
        </div>
      </body>
      </html>
    `;
    printWindow.document.write(html);
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => {
      printWindow.print();
    }, 300);
  };

  // Export Shifts to Excel
  const exportToExcel = () => {
    if (filteredShifts.length === 0) {
      showToast('لا توجد بيانات لتصديرها', 'info');
      return;
    }

    const data = filteredShifts.map((s, idx) => ({
      'م': idx + 1,
      'رقم الوردية': s.id.substring(0, 8),
      'الفرع': s.org_name,
      'الكاشير': s.cashier_name,
      'نقطة البيع': s.terminal_name,
      'الفترة': getShiftPeriodType(s.start_time) === 'MORNING' ? 'صباحية' : 'مسائية',
      'تاريخ البدء': new Date(s.start_time).toLocaleString('ar-EG'),
      'تاريخ الإغلاق': s.end_time ? new Date(s.end_time).toLocaleString('ar-EG') : 'مفتوحة',
      'العهدة الافتتاحية': s.opening_balance,
      'إجمالي المبيعات': s.total_gross_sales,
      'مبيعات كاش': s.total_cash_sales,
      'مبيعات فيزا': s.total_card_sales,
      'مبيعات إنستاباي': s.total_instapay_sales,
      'مبيعات محافظ': s.total_wallet_sales,
      'مصروفات وسحوبات': (s.total_paid_outs || 0) + (s.total_safe_drops || 0),
      'المتوقع بالدرج': s.expected_cash ?? 0,
      'الفعلي المحصور': s.actual_cash ?? 0,
      'الفارق': s.difference ?? 0,
      'الحالة': s.status === 'CLOSED' ? 'مغلقة' : 'مفتوحة',
      'ملاحظات': s.notes || ''
    }));

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'ورديات الكاشير');
    XLSX.writeFile(wb, `Cashier_Shifts_${startDate}_to_${endDate}.xlsx`);
    showToast('تم تصدير ملف الإكسل بنجاح 📊', 'success');
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 p-4 sm:p-6 space-y-6" dir="rtl">
      {/* Top Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-5 rounded-2xl shadow-sm border border-slate-200">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-blue-50 text-blue-600 rounded-2xl">
            <Clock className="w-7 h-7" />
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-black text-slate-900">
              سجل إغلاقات الورديات ومطابقة مبيعات الكاشير
            </h1>
            <p className="text-xs text-slate-500 mt-0.5">
              استعراض وطباعة أوراق الإغلاق (Z-Reports) ومطابقة فواتير كل كاشير ووردية عبر كافة الفروع
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={fetchShifts}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            <span>تحديث</span>
          </button>
          <button
            onClick={exportToExcel}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-sm transition"
          >
            <Download size={14} />
            <span>تصدير إكسل</span>
          </button>
        </div>
      </div>

      {/* KPI Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3.5">
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
          <span className="text-xs text-slate-500 block font-medium">عدد الورديات المحصورة</span>
          <span className="text-2xl font-black text-slate-900 mt-1 block">{kpis.count}</span>
          <span className="text-[11px] text-slate-400">وردية مطابقة</span>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
          <span className="text-xs text-slate-500 block font-medium">إجمالي المبيعات الكلية</span>
          <span className="text-2xl font-black text-blue-600 mt-1 block">{kpis.grossSales.toLocaleString()}</span>
          <span className="text-[11px] text-slate-400">{currencySymbol} شامل الضريبة</span>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
          <span className="text-xs text-slate-500 block font-medium">المقبوضات النقدية (كاش)</span>
          <span className="text-2xl font-black text-emerald-600 mt-1 block">{kpis.cashSales.toLocaleString()}</span>
          <span className="text-[11px] text-slate-400">{currencySymbol} في أدراج الكاشيرية</span>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
          <span className="text-xs text-slate-500 block font-medium">مقبوضات غير نقدية (شبكة/محافظ)</span>
          <span className="text-2xl font-black text-purple-600 mt-1 block">{kpis.nonCashSales.toLocaleString()}</span>
          <span className="text-[11px] text-slate-400">{currencySymbol} فيزا وإنستاباي</span>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm col-span-2 sm:col-span-1">
          <span className="text-xs text-slate-500 block font-medium">صافي الفارق (عجز / زيادة)</span>
          <span className={`text-2xl font-black mt-1 block font-mono ${kpis.totalDiff < -0.05 ? 'text-red-600' : kpis.totalDiff > 0.05 ? 'text-blue-600' : 'text-emerald-600'}`}>
            {kpis.totalDiff >= 0 ? `+${kpis.totalDiff.toFixed(2)}` : kpis.totalDiff.toFixed(2)}
          </span>
          <span className="text-[11px] text-slate-400">
            {kpis.deficitCount > 0 ? `⚠️ يوجد ${kpis.deficitCount} وردية بها عجز` : '✔️ كافة الورديات متطابقة'}
          </span>
        </div>
      </div>

      {/* Filters Toolbar */}
      <div className="bg-white p-4.5 rounded-2xl border border-slate-200 shadow-sm space-y-3.5">
        <div className="flex items-center gap-2 text-xs font-bold text-slate-700">
          <Filter size={15} className="text-blue-600" />
          <span>تصفية وفلترة الورديات حسب الفرع والكاشير والفترة:</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2.5 text-xs">
          {/* Branch Filter */}
          <div>
            <label className="block text-slate-500 mb-1 font-semibold">🏢 الفرع / الشركة:</label>
            <select
              value={selectedOrgId}
              onChange={e => setSelectedOrgId(e.target.value)}
              className="w-full bg-slate-50 border border-slate-300 rounded-xl px-2.5 py-2 font-medium text-slate-900 outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="ALL">— كل الفروع والشركات —</option>
              {organizationsList.map(o => (
                <option key={o.id} value={o.id}>{o.name}</option>
              ))}
            </select>
          </div>

          {/* Cashier Filter */}
          <div>
            <label className="block text-slate-500 mb-1 font-semibold">👤 الكاشير:</label>
            <select
              value={selectedCashierId}
              onChange={e => setSelectedCashierId(e.target.value)}
              className="w-full bg-slate-50 border border-slate-300 rounded-xl px-2.5 py-2 font-medium text-slate-900 outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="ALL">— كل الكاشيرية —</option>
              {cashiersList.map(c => (
                <option key={c.id} value={c.id}>{c.full_name}</option>
              ))}
            </select>
          </div>

          {/* Start Date */}
          <div>
            <label className="block text-slate-500 mb-1 font-semibold">📅 من تاريخ:</label>
            <input
              type="date"
              value={startDate}
              onChange={e => setStartDate(e.target.value)}
              className="w-full bg-slate-50 border border-slate-300 rounded-xl px-2.5 py-2 font-medium text-slate-900 outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* End Date */}
          <div>
            <label className="block text-slate-500 mb-1 font-semibold">📅 إلى تاريخ:</label>
            <input
              type="date"
              value={endDate}
              onChange={e => setEndDate(e.target.value)}
              className="w-full bg-slate-50 border border-slate-300 rounded-xl px-2.5 py-2 font-medium text-slate-900 outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Shift Period (Morning / Evening) */}
          <div>
            <label className="block text-slate-500 mb-1 font-semibold">☀️ فترات الوردية:</label>
            <select
              value={shiftPeriod}
              onChange={e => setShiftPeriod(e.target.value as any)}
              className="w-full bg-slate-50 border border-slate-300 rounded-xl px-2.5 py-2 font-medium text-slate-900 outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="ALL">جميع الفترات</option>
              <option value="MORNING">وردية صباحية ☀️</option>
              <option value="EVENING">وردية مسائية 🌙</option>
            </select>
          </div>

          {/* Status & Diff Filter */}
          <div>
            <label className="block text-slate-500 mb-1 font-semibold">⚖️ حالة المطابقة:</label>
            <select
              value={diffFilter}
              onChange={e => setDiffFilter(e.target.value as any)}
              className="w-full bg-slate-50 border border-slate-300 rounded-xl px-2.5 py-2 font-medium text-slate-900 outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="ALL">كل الحالات</option>
              <option value="BALANCED">متطابقة تماماً ✔️</option>
              <option value="DEFICIT">يوجد عجز ⚠️</option>
              <option value="SURPLUS">يوجد زيادة 📈</option>
            </select>
          </div>
        </div>

        {/* Search Input Bar */}
        <div className="relative">
          <Search size={15} className="absolute right-3 top-3 text-slate-400" />
          <input
            type="text"
            placeholder="بحث سريع باسم الكاشير، اسم الفرع، أو كود الوردية..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full pr-9 pl-4 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-medium text-slate-900 outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </div>

      {/* Shifts Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-right text-xs">
            <thead className="bg-slate-100/80 text-slate-700 font-bold border-b border-slate-200">
              <tr>
                <th className="p-3">الوردية</th>
                <th className="p-3">الفرع والكاشير</th>
                <th className="p-3">وقت البدء والإغلاق</th>
                <th className="p-3 text-center">العهدة</th>
                <th className="p-3 text-center">إجمالي المبيعات</th>
                <th className="p-3 text-center">المقبوض نقداً</th>
                <th className="p-3 text-center">غير نقدي (فيزا/شبكة)</th>
                <th className="p-3 text-center">الفعلي بالدرج</th>
                <th className="p-3 text-center">الفارق الصافي</th>
                <th className="p-3 text-center">القيد المحاسبي</th>
                <th className="p-3 text-center">إجراءات المراجعة</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={11} className="text-center py-12 text-slate-400">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <RefreshCw className="w-6 h-6 animate-spin text-blue-600" />
                      <span>جاري تحميل سجل الورديات...</span>
                    </div>
                  </td>
                </tr>
              ) : filteredShifts.length === 0 ? (
                <tr>
                  <td colSpan={11} className="text-center py-12 text-slate-400">
                    لا توجد ورديات تطابق معايير البحث والفلترة المحددة
                  </td>
                </tr>
              ) : (
                filteredShifts.map(s => {
                  const isMorning = getShiftPeriodType(s.start_time) === 'MORNING';
                  const diff = s.difference ?? 0;
                  const isClosed = s.status === 'CLOSED';

                  return (
                    <tr key={s.id} className="hover:bg-slate-50/80 transition-colors">
                      {/* Shift Code & Period */}
                      <td className="p-3">
                        <div className="flex items-center gap-1.5 font-bold font-mono text-slate-900">
                          <span>#{s.id.substring(0, 6)}</span>
                          <span
                            className={`inline-flex items-center gap-0.5 px-2 py-0.5 rounded-md text-[10px] font-bold ${
                              isMorning ? 'bg-amber-100 text-amber-800' : 'bg-indigo-100 text-indigo-800'
                            }`}
                          >
                            {isMorning ? <Sun size={11} /> : <Moon size={11} />}
                            <span>{isMorning ? 'صباحية' : 'مسائية'}</span>
                          </span>
                        </div>
                        <span className="text-[11px] text-slate-400 block mt-0.5">
                          {new Date(s.start_time).toLocaleDateString('ar-EG')}
                        </span>
                      </td>

                      {/* Branch & Cashier */}
                      <td className="p-3">
                        <div className="font-bold text-slate-900">{s.cashier_name}</div>
                        <div className="text-[11px] text-slate-500 flex items-center gap-1 mt-0.5">
                          <Building2 size={11} className="text-slate-400" />
                          <span>{s.org_name}</span>
                          <span className="text-slate-300">•</span>
                          <span>{s.terminal_name}</span>
                        </div>
                      </td>

                      {/* Start & End Times */}
                      <td className="p-3 text-[11px]">
                        <div className="text-slate-700">
                          <span className="text-slate-400">من: </span>
                          <span className="font-bold">{new Date(s.start_time).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })}</span>
                        </div>
                        <div className="text-slate-700 mt-0.5">
                          <span className="text-slate-400">إلى: </span>
                          {s.end_time ? (
                            <span className="font-bold">{new Date(s.end_time).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })}</span>
                          ) : (
                            <span className="text-emerald-600 font-bold bg-emerald-50 px-1.5 py-0.2 rounded">مفتوحة حالياً</span>
                          )}
                        </div>
                      </td>

                      {/* Opening Float */}
                      <td className="p-3 text-center font-mono font-bold text-slate-700">
                        {s.opening_balance.toFixed(2)}
                      </td>

                      {/* Gross Sales */}
                      <td className="p-3 text-center font-mono font-bold text-blue-700">
                        {(s.total_gross_sales || 0).toFixed(2)}
                      </td>

                      {/* Cash Sales */}
                      <td className="p-3 text-center font-mono font-bold text-emerald-700">
                        {(s.total_cash_sales || 0).toFixed(2)}
                      </td>

                      {/* Non-Cash */}
                      <td className="p-3 text-center font-mono font-bold text-purple-700">
                        {((s.total_card_sales || 0) + (s.total_instapay_sales || 0) + (s.total_wallet_sales || 0)).toFixed(2)}
                      </td>

                      {/* Actual Count */}
                      <td className="p-3 text-center font-mono font-bold text-slate-900">
                        {s.actual_cash !== undefined ? s.actual_cash.toFixed(2) : '—'}
                      </td>

                      {/* Difference Badge */}
                      <td className="p-3 text-center">
                        {s.difference !== undefined ? (
                          <span
                            className={`inline-block px-2 py-0.5 rounded-lg font-mono font-bold text-[11px] ${
                              Math.abs(diff) <= 0.05
                                ? 'bg-emerald-100 text-emerald-800'
                                : diff < 0
                                ? 'bg-red-100 text-red-800'
                                : 'bg-blue-100 text-blue-800'
                            }`}
                          >
                            {diff > 0 ? `+${diff.toFixed(2)}` : diff.toFixed(2)}
                          </span>
                        ) : (
                          <span className="text-slate-400 text-[10px]">قيد العمل</span>
                        )}
                      </td>

                      {/* Linked Journal Entry */}
                      <td className="p-3 text-center">
                        {s.closing_journal_entry_id ? (
                          <button
                            type="button"
                            onClick={() => navigate(`/general-journal?search=${s.id.substring(0, 4)}`)}
                            className="inline-flex items-center gap-1 text-[11px] font-mono font-bold text-blue-600 hover:text-blue-800 hover:underline"
                            title="الانتقال لعرض القيد في اليومية العامة"
                          >
                            <FileText size={12} />
                            <span>مُرحّل ✔️</span>
                          </button>
                        ) : (
                          <span className="text-slate-400 text-[10px]">بدون قيد</span>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="p-3 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          {/* Print Z-Report */}
                          <button
                            type="button"
                            onClick={() => printZReport(s)}
                            className="p-1.5 rounded-lg bg-blue-50 text-blue-700 hover:bg-blue-100 transition shadow-xs"
                            title="طباعة ورقة الإغلاق (Z-Report) إيصال حراري"
                          >
                            <Printer size={15} />
                          </button>

                          {/* View Cashier Sales Orders */}
                          <button
                            type="button"
                            onClick={() => handleOpenShiftOrders(s)}
                            className="p-1.5 rounded-lg bg-emerald-50 text-emerald-700 hover:bg-emerald-100 transition shadow-xs flex items-center gap-1"
                            title="عرض فواتير ومبيعات الكاشير لهذه الوردية للمطابقة"
                          >
                            <Receipt size={15} />
                            <span className="text-[10px] font-bold hidden sm:inline">فواتير الوردية</span>
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* 🧾 Drill-down Modal: Shift Orders Details & Statements */}
      {selectedShiftForOrders && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-4xl overflow-hidden flex flex-col max-h-[90vh]">
            {/* Modal Header */}
            <div className="p-4 border-b border-slate-200 flex justify-between items-center bg-slate-50">
              <div className="flex items-center gap-2.5">
                <div className="p-2.5 bg-blue-100 text-blue-700 rounded-2xl">
                  <Receipt size={20} />
                </div>
                <div>
                  <h3 className="font-bold text-base text-slate-900">
                    مبيعات وفواتير وردية الكاشير: {selectedShiftForOrders.cashier_name}
                  </h3>
                  <p className="text-xs text-slate-500">
                    الفرع: {selectedShiftForOrders.org_name} • التاريخ: {new Date(selectedShiftForOrders.start_time).toLocaleDateString('ar-EG')}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => printShiftOrdersStatement(selectedShiftForOrders, shiftOrders)}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-sm transition"
                >
                  <Printer size={14} />
                  <span>طباعة كشف مبيعات الوردية</span>
                </button>
                <button
                  onClick={() => setSelectedShiftForOrders(null)}
                  className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg"
                >
                  <X size={20} />
                </button>
              </div>
            </div>

            {/* Navigation Tabs */}
            <div className="flex border-b border-slate-200 bg-slate-50 text-xs font-bold px-4">
              <button
                type="button"
                onClick={() => setModalTab('ORDERS')}
                className={`py-2.5 px-4 border-b-2 flex items-center gap-1.5 transition ${
                  modalTab === 'ORDERS'
                    ? 'border-blue-600 text-blue-600 bg-white'
                    : 'border-transparent text-slate-500 hover:text-slate-800'
                }`}
              >
                <Receipt size={15} />
                <span>فواتير المبيعات ({shiftOrders.length})</span>
              </button>
              <button
                type="button"
                onClick={() => setModalTab('DRAWER')}
                className={`py-2.5 px-4 border-b-2 flex items-center gap-1.5 transition ${
                  modalTab === 'DRAWER'
                    ? 'border-blue-600 text-blue-600 bg-white'
                    : 'border-transparent text-slate-500 hover:text-slate-800'
                }`}
              >
                <DollarSign size={15} />
                <span>حركات الدرج والعربونات والمصروفات ({shiftDrawerTrans.length})</span>
              </button>
            </div>

            {/* Modal Content */}
            <div className="p-4 overflow-y-auto flex-1 space-y-3">
              {loadingShiftOrders ? (
                <div className="text-center py-12 text-slate-400">
                  <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-blue-600" />
                  <span>جاري تحميل بيانات الوردية...</span>
                </div>
              ) : modalTab === 'ORDERS' ? (
                shiftOrders.length === 0 ? (
                  <div className="text-center py-12 text-slate-400">
                    لا توجد فواتير بيع مسجلة على هذه الوردية (وردية تجريبية أو بدون حركات بيع).
                  </div>
                ) : (
                  <div className="overflow-x-auto border border-slate-200 rounded-xl">
                    <table className="w-full text-right text-xs">
                      <thead className="bg-slate-50 text-slate-700 font-bold border-b border-slate-200">
                        <tr>
                          <th className="p-2.5">#</th>
                          <th className="p-2.5">رقم الفاتورة</th>
                          <th className="p-2.5">الوقت</th>
                          <th className="p-2.5">العميل</th>
                          <th className="p-2.5 text-center">طريقة الدفع</th>
                          <th className="p-2.5 text-center">الخصم</th>
                          <th className="p-2.5 text-center">الضريبة</th>
                          <th className="p-2.5 text-left font-bold">الإجمالي</th>
                          <th className="p-2.5 text-center">الحالة</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {shiftOrders.map((ord, idx) => (
                          <tr key={ord.id} className="hover:bg-slate-50/50">
                            <td className="p-2.5 text-slate-400">{idx + 1}</td>
                            <td className="p-2.5 font-bold font-mono text-slate-800">{ord.order_number}</td>
                            <td className="p-2.5 text-slate-500">
                              {new Date(ord.created_at).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })}
                            </td>
                            <td className="p-2.5 text-slate-700">{ord.customer_name}</td>
                            <td className="p-2.5 text-center">
                              <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200">
                                {ord.payment_method}
                              </span>
                            </td>
                            <td className="p-2.5 text-center font-mono text-slate-500">
                              {ord.total_discount ? ord.total_discount.toFixed(2) : '0.00'}
                            </td>
                            <td className="p-2.5 text-center font-mono text-slate-500">
                              {ord.total_tax ? ord.total_tax.toFixed(2) : '0.00'}
                            </td>
                            <td className="p-2.5 text-left font-mono font-bold text-slate-900">
                              {ord.grand_total.toFixed(2)} {currencySymbol}
                            </td>
                            <td className="p-2.5 text-center">
                              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-50 text-emerald-700">
                                {ord.status === 'PAID' || ord.status === 'COMPLETED' ? 'مسددة' : ord.status}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot className="bg-slate-50 font-bold border-t border-slate-200">
                        <tr>
                          <td colSpan={7} className="p-2.5 text-slate-700">إجمالي مبيعات فواتير الوردية:</td>
                          <td className="p-2.5 text-left font-mono text-blue-700 font-black">
                            {shiftOrders.reduce((sum, o) => sum + o.grand_total, 0).toFixed(2)} {currencySymbol}
                          </td>
                          <td></td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                )
              ) : (
                shiftDrawerTrans.length === 0 ? (
                  <div className="text-center py-12 text-slate-400">
                    لا توجد حركات درج أو عربونات أو مصروفات مسجلة على هذه الوردية.
                  </div>
                ) : (
                  <div className="overflow-x-auto border border-slate-200 rounded-xl">
                    <table className="w-full text-right text-xs">
                      <thead className="bg-slate-50 text-slate-700 font-bold border-b border-slate-200">
                        <tr>
                          <th className="p-2.5">#</th>
                          <th className="p-2.5">الوقت</th>
                          <th className="p-2.5">نوع الحركة</th>
                          <th className="p-2.5">طريقة الدفع</th>
                          <th className="p-2.5">العميل / المستلم</th>
                          <th className="p-2.5">هاتف العميل</th>
                          <th className="p-2.5">تاريخ التسليم</th>
                          <th className="p-2.5">البيان والملاحظات</th>
                          <th className="p-2.5 text-left">المبلغ</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {shiftDrawerTrans.map((dt, idx) => {
                          const isDepositIn = dt.transaction_type.includes('ADVANCE_DEPOSIT') || dt.transaction_type === 'PAID_IN';
                          const isDepositRefund = dt.transaction_type.includes('REFUND_DEPOSIT');

                          let badgeColor = 'bg-slate-100 text-slate-700';
                          let typeLabel = dt.transaction_type;
                          if (dt.transaction_type.includes('ADVANCE_DEPOSIT')) {
                            badgeColor = 'bg-emerald-100 text-emerald-800';
                            typeLabel = 'استلام عربون حجز';
                          } else if (dt.transaction_type.includes('REFUND_DEPOSIT')) {
                            badgeColor = 'bg-orange-100 text-orange-800';
                            typeLabel = 'رد عربون ملغي';
                          } else if (dt.transaction_type === 'PAID_IN') {
                            badgeColor = 'bg-teal-100 text-teal-800';
                            typeLabel = 'تزويد فكة';
                          } else if (dt.transaction_type === 'PAID_OUT_EXPENSE') {
                            badgeColor = 'bg-rose-100 text-rose-800';
                            typeLabel = 'مصروف نثري';
                          } else if (dt.transaction_type === 'SAFE_DROP') {
                            badgeColor = 'bg-amber-100 text-amber-800';
                            typeLabel = 'توريد للخزينة';
                          }

                          return (
                            <tr key={dt.id} className="hover:bg-slate-50/80">
                              <td className="p-2.5 text-slate-400">{idx + 1}</td>
                              <td className="p-2.5 font-mono text-slate-500">
                                {new Date(dt.created_at).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })}
                              </td>
                              <td className="p-2.5">
                                <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${badgeColor}`}>
                                  {typeLabel}
                                </span>
                              </td>
                              <td className="p-2.5 font-bold text-slate-700">
                                {dt.payment_method === 'WALLET' ? '📱 فودافون كاش' : dt.payment_method === 'INSTAPAY' ? '⚡ إنستاباي' : dt.payment_method === 'CARD' ? '💳 فيزا/شبكة' : '💵 نقداً'}
                              </td>
                              <td className="p-2.5 font-medium text-slate-900">
                                {dt.custodian_or_payer_name || dt.reason || '—'}
                              </td>
                              <td className="p-2.5 font-mono text-slate-600" dir="ltr">
                                {dt.customer_phone || '—'}
                              </td>
                              <td className="p-2.5 font-mono text-slate-600">
                                {dt.delivery_date ? new Date(dt.delivery_date).toLocaleDateString('ar-EG') : '—'}
                              </td>
                              <td className="p-2.5 text-slate-500 max-w-xs truncate" title={dt.booking_notes || dt.reason || ''}>
                                {dt.booking_notes || dt.reason || '—'}
                              </td>
                              <td className={`p-2.5 font-mono font-bold text-left ${
                                isDepositIn ? 'text-emerald-700' : isDepositRefund ? 'text-orange-700' : 'text-rose-700'
                              }`}>
                                {isDepositIn ? '+' : '-'}{Number(dt.amount).toFixed(2)} {currencySymbol}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-3 border-t border-slate-200 bg-slate-50 flex justify-between items-center text-xs">
              <span className="text-slate-500">
                مطابقة الفواتير مع Z-Report تضمن كشف أي فروقات في نقاط البيع
              </span>
              <button
                type="button"
                onClick={() => setSelectedShiftForOrders(null)}
                className="px-4 py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-xl font-bold transition"
              >
                إغلاق
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

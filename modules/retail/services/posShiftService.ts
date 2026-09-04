/**
 * TriPro ERP — POS Shift Financials Service
 * منطق معزول ومحكم لحسابات نقدية الوردية، المبيعات النقدية، المرتجعات، والمسحوبات
 */
import type { SupabaseClient } from '@supabase/supabase-js';

export interface ShiftFinancialsResult {
  cashSales: number;
  cashReturns: number;
  cashDrops: number;
  drawerCash: number;
}

export interface ShiftSummaryData {
  opening_balance: number;
  total_sales: number;
  cash_sales: number;
  card_sales: number;
  cash_returns: number;
  cash_drops: number;
  expected_cash: number;
  [key: string]: any;
}

/**
 * جلب وتحديث الموقف المالي اللحظي للدرج أثناء عمل الكاشير
 */
export async function getLiveShiftFinancials(
  supabase: SupabaseClient,
  shift: { id: string; opening_balance?: number; start_time?: string },
  userId: string,
  cashDropsTotal: number
): Promise<ShiftFinancialsResult> {
  const openingBal = Number(shift.opening_balance) || 0;
  let cashSales = 0;
  let cashReturns = 0;

  try {
    // 1. محاولة استدعاء الدالة من قاعدة البيانات
    const { data: summary, error: summaryErr } = await supabase.rpc('get_shift_summary', {
      p_shift_id: shift.id
    });

    if (!summaryErr && summary) {
      cashSales = Number(summary.cash_sales) || 0;
      cashReturns = Number(summary.cash_returns) || 0;
    } else {
      // Fallback: جلب المبيعات النقدية مباشرة من الطلبات
      let ordQuery: any = supabase
        .from('orders')
        .select('grand_total, payment_method, status')
        .eq('shift_id', shift.id);

      if (typeof ordQuery?.in === 'function') {
        ordQuery = ordQuery.in('status', ['PAID', 'COMPLETED', 'posted', 'CONFIRMED']);
      }
      const { data: ords } = await ordQuery;
      const safeOrds = Array.isArray(ords) ? ords : [];
      cashSales = safeOrds
        .filter((o: any) => !o.payment_method || o.payment_method === 'CASH')
        .reduce((sum: number, o: any) => sum + Number(o.grand_total || 0), 0);
    }

    // 2. التحقق من المرتجعات النقدية بشكل صريح لضمان الدقة
    if (cashReturns === 0) {
      try {
        let retQuery: any = supabase
          .from('sales_returns')
          .select('total_amount, notes, user_id, created_at')
          .eq('user_id', userId);

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

    const drawerCash = Math.max(0, openingBal + cashSales - cashReturns - cashDropsTotal);

    return {
      cashSales,
      cashReturns,
      cashDrops: cashDropsTotal,
      drawerCash
    };
  } catch (err) {
    console.error('Error calculating live shift financials:', err);
    return {
      cashSales: 0,
      cashReturns: 0,
      cashDrops: cashDropsTotal,
      drawerCash: Math.max(0, openingBal - cashDropsTotal)
    };
  }
}

/**
 * حساب ملخص الوردية والنقدية المتوقعة عند الإغلاق
 */
export async function calculateClosingShiftSummary(
  supabase: SupabaseClient,
  shift: { id: string; opening_balance?: number; start_time?: string },
  userId: string,
  cashDropsTotal: number
): Promise<{ summary: ShiftSummaryData; calculatedExpectedCash: number }> {
  const openingBal = Number(shift.opening_balance) || 0;

  // 1. استدعاء get_shift_summary
  const { data, error } = await supabase.rpc('get_shift_summary', {
    p_shift_id: shift.id
  });

  // 2. التحقق من المرتجعات النقدية
  let detectedCashReturns = Number(data?.cash_returns) || 0;
  try {
    let retQuery: any = supabase
      .from('sales_returns')
      .select('total_amount, notes, user_id, created_at')
      .eq('user_id', userId);

    if (shift.start_time) {
      retQuery = retQuery.gte('created_at', shift.start_time);
    }

    const { data: retRows } = await retQuery;
    const safeRetRows = Array.isArray(retRows) ? retRows : [];

    if (safeRetRows.length > 0) {
      detectedCashReturns = safeRetRows
        .filter((r: any) => !r.notes || r.notes.includes('نقدي') || r.notes.includes('CASH'))
        .reduce((sum: number, r: any) => sum + Number(r.total_amount || 0), 0);
    }
  } catch (reErr) {
    console.warn('Could not query sales_returns for shift close:', reErr);
  }

  let calculatedExpectedCash = 0;
  let resultSummary: ShiftSummaryData;

  if (error) {
    // Fallback في حالة عدم توفر الدالة
    const { data: orders } = await supabase
      .from('orders')
      .select('grand_total, payment_method')
      .eq('shift_id', shift.id);
    const safeOrders = Array.isArray(orders) ? orders : [];
    const totalSales = safeOrders.reduce((sum, o) => sum + Number(o.grand_total || 0), 0);
    const cashSales = safeOrders.filter(o => !o.payment_method || o.payment_method === 'CASH').reduce((sum, o) => sum + Number(o.grand_total || 0), 0);
    const cardSales = totalSales - cashSales;
    calculatedExpectedCash = Math.max(0, openingBal + cashSales - detectedCashReturns - cashDropsTotal);

    resultSummary = {
      opening_balance: openingBal,
      total_sales: totalSales,
      cash_sales: cashSales,
      card_sales: cardSales,
      cash_returns: detectedCashReturns,
      cash_drops: cashDropsTotal,
      expected_cash: calculatedExpectedCash
    };
  } else {
    const cashSales = Number(data?.cash_sales) || 0;
    const totalSales = Number(data?.total_sales) || 0;
    const cardSales = Number(data?.card_sales) || 0;
    const pettyCash = Number(data?.petty_cash) || 0;

    calculatedExpectedCash = (data?.expected_cash !== undefined && data?.cash_returns !== undefined)
      ? Math.max(0, Number(data.expected_cash))
      : Math.max(0, openingBal + cashSales - detectedCashReturns - cashDropsTotal - pettyCash);

    resultSummary = {
      ...data,
      opening_balance: openingBal,
      total_sales: totalSales,
      cash_sales: cashSales,
      card_sales: cardSales,
      cash_returns: detectedCashReturns,
      cash_drops: cashDropsTotal,
      expected_cash: calculatedExpectedCash
    };
  }

  return {
    summary: resultSummary,
    calculatedExpectedCash
  };
}

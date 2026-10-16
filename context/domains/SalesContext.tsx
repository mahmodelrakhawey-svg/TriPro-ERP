/**
 * ==============================================================================
 * TriPro ERP — Sales Domain Context & Hook
 * context/domains/SalesContext.tsx
 * ==============================================================================
 * مخصص لإدارة المبيعات، فواتير العملاء، المرتجعات، ومناديب المبيعات.
 * يدعم الاستخدام المباشر عبر SalesProvider أو عبر واجهة AccountingContext الموحدة.
 * مزود بالحماية الكاملة لعزل بيانات المنظمات (Multi-Tenancy) وسجل التدقيق (Audit Log)
 * وترشيد الاستعلامات المالية بالسنة المالية النشطة.
 * ==============================================================================
 */

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { Invoice, Customer, Salesperson } from '../../types';
import type { UserProfile } from '../AccountingContext';
import { useAccounting } from '../AccountingContext';
import { supabase } from '../../supabaseClient';
import { logger } from '../../utils/logger';

export type SalesInvoice = Invoice & { total?: number; [key: string]: unknown };

export interface SalesDomainState {
  invoices: SalesInvoice[];
  customers: Customer[];
  salespeople: Salesperson[];
  approveInvoice: (id: string, orgId?: string, warehouseId?: string) => Promise<boolean>;
  unpostSalesInvoice: (id: string, orgId?: string) => Promise<boolean>;
  deleteSalesInvoice: (id: string, orgId?: string) => Promise<boolean>;
  addCustomer: (customer: Partial<Customer>) => Promise<Customer | null | Record<string, unknown>>;
  refreshSales: () => Promise<void>;
  refreshInvoices?: () => Promise<void>;
}

export const SalesContext = createContext<SalesDomainState | null>(null);

export interface SalesProviderProps {
  children: React.ReactNode;
  orgId?: string | null;
  currentUser?: UserProfile | null;
  initialInvoices?: SalesInvoice[];
  initialCustomers?: Customer[];
  initialSalespeople?: Salesperson[];
  fiscalYearRange?: { startDate: string; endDate: string };
  logActivity?: (action: string, details: string) => void;
  showToast?: (message: string, type?: 'success' | 'error' | 'info' | 'warning') => void;
  isDemo?: boolean;
}

const EMPTY_INVOICES: SalesInvoice[] = [];
const EMPTY_CUSTOMERS: Customer[] = [];
const EMPTY_SALESPEOPLE: Salesperson[] = [];

export const SalesProvider: React.FC<SalesProviderProps> = ({
  children,
  orgId,
  currentUser,
  initialInvoices = EMPTY_INVOICES,
  initialCustomers = EMPTY_CUSTOMERS,
  initialSalespeople = EMPTY_SALESPEOPLE,
  fiscalYearRange,
  logActivity,
  showToast,
  isDemo = false
}) => {
  const [invoices, setInvoices] = useState<SalesInvoice[]>(initialInvoices);
  const [customers, setCustomers] = useState<Customer[]>(initialCustomers);
  const [salespeople, setSalespeople] = useState<Salesperson[]>(initialSalespeople);

  const targetOrgId = orgId || currentUser?.organization_id || null;

  const fetchSalesData = useCallback(async () => {
    if (!targetOrgId || targetOrgId === 'org-default-offline') {
      if (initialInvoices.length > 0) setInvoices(initialInvoices);
      if (initialCustomers.length > 0) setCustomers(initialCustomers);
      if (initialSalespeople.length > 0) setSalespeople(initialSalespeople);
      return;
    }

    try {
      let invQuery = supabase
        .from('invoices')
        .select('*')
        .eq('organization_id', targetOrgId);

      if (fiscalYearRange?.startDate && fiscalYearRange?.endDate) {
        invQuery = invQuery
          .gte('invoice_date', fiscalYearRange.startDate)
          .lte('invoice_date', fiscalYearRange.endDate);
      }

      const [invRes, custRes, spRes] = await Promise.all([
        invQuery.order('invoice_date', { ascending: false }).limit(1000),
        supabase
          .from('customers')
          .select('*')
          .eq('organization_id', targetOrgId)
          .is('deleted_at', null)
          .order('name'),
        supabase
          .from('profiles')
          .select('id, full_name')
          .eq('organization_id', targetOrgId)
          .order('full_name')
      ]);

      if (invRes.error) {
        logger.error('Error fetching invoices in SalesProvider:', invRes.error);
      } else {
        setInvoices((invRes.data as SalesInvoice[]) || []);
      }

      if (custRes.error) {
        logger.error('Error fetching customers in SalesProvider:', custRes.error);
      } else {
        setCustomers((custRes.data as Customer[]) || []);
      }

      if (spRes.error) {
        logger.error('Error fetching salespeople in SalesProvider:', spRes.error);
      } else {
        const mappedSalespeople: Salesperson[] = (spRes.data || []).map((p: { id: string; full_name?: string }) => ({
          id: p.id,
          name: p.full_name || ''
        }));
        setSalespeople(mappedSalespeople);
      }
    } catch (err) {
      logger.error('Unexpected error fetching sales domain data:', err);
    }
  }, [targetOrgId, fiscalYearRange?.startDate, fiscalYearRange?.endDate, initialInvoices, initialCustomers, initialSalespeople]);

  useEffect(() => {
    if (initialInvoices.length > 0) {
      setInvoices(initialInvoices);
    } else if (targetOrgId && targetOrgId !== 'org-default-offline') {
      fetchSalesData();
    }
  }, [targetOrgId, fetchSalesData, initialInvoices.length]);

  useEffect(() => {
    if (initialCustomers.length > 0) {
      setCustomers(initialCustomers);
    }
  }, [initialCustomers]);

  useEffect(() => {
    if (initialSalespeople.length > 0) {
      setSalespeople(initialSalespeople);
    }
  }, [initialSalespeople]);

  const approveInvoice = useCallback(async (id: string, customOrgId?: string, warehouseId?: string): Promise<boolean> => {
    const effectiveOrg = customOrgId || targetOrgId || currentUser?.organization_id || null;
    const { error } = await supabase.rpc('post_sales_invoice', {
      p_invoice_id: id,
      p_org_id: effectiveOrg,
      p_warehouse_id: warehouseId
    });

    if (error) {
      logger.error('approveInvoice RPC error in SalesProvider:', error);
      showToast?.('فشل اعتماد فاتورة المبيعات: ' + error.message, 'error');
      throw error;
    }

    showToast?.('تم اعتماد فاتورة المبيعات بنجاح ✅', 'success');
    logActivity?.('اعتماد فاتورة مبيعات', `تم اعتماد الفاتورة رقم: ${id}`);
    await fetchSalesData();
    return true;
  }, [targetOrgId, currentUser, logActivity, showToast, fetchSalesData]);

  const unpostSalesInvoice = useCallback(async (id: string, customOrgId?: string): Promise<boolean> => {
    const effectiveOrg = customOrgId || targetOrgId || currentUser?.organization_id || null;
    const { error } = await supabase.rpc('unpost_sales_invoice', {
      p_invoice_id: id,
      p_org_id: effectiveOrg
    });

    if (error) {
      logger.warn('unpostSalesInvoice RPC error in SalesProvider:', error);
      showToast?.('فشل إلغاء ترحيل الفاتورة: ' + error.message, 'error');
      throw error;
    }

    showToast?.('تم إلغاء ترحيل فاتورة المبيعات بنجاح', 'info');
    logActivity?.('إلغاء ترحيل فاتورة مبيعات', `فاتورة رقم: ${id}`);
    await fetchSalesData();
    return true;
  }, [targetOrgId, currentUser, logActivity, showToast, fetchSalesData]);

  const deleteSalesInvoice = useCallback(async (id: string, customOrgId?: string): Promise<boolean> => {
    const effectiveOrg = customOrgId || targetOrgId || currentUser?.organization_id || null;
    const { error } = await supabase.rpc('delete_sales_invoice', {
      p_invoice_id: id,
      p_org_id: effectiveOrg
    });

    if (error) {
      logger.warn('deleteSalesInvoice RPC error in SalesProvider:', error);
      showToast?.('فشل حذف الفاتورة: ' + error.message, 'error');
      throw error;
    }

    showToast?.('تم حذف فاتورة المبيعات', 'info');
    logActivity?.('حذف فاتورة مبيعات', `فاتورة رقم: ${id}`);
    await fetchSalesData();
    return true;
  }, [targetOrgId, currentUser, logActivity, showToast, fetchSalesData]);

  const addCustomer = useCallback(async (customer: Partial<Customer>): Promise<Customer | null> => {
    const effectiveOrg = targetOrgId || currentUser?.organization_id;
    const userId = currentUser?.id;
    const payload: Record<string, unknown> = {
      ...customer,
      organization_id: effectiveOrg,
      created_by: userId || null,
      updated_by: userId || null
    };

    let data: Customer | null = null;
    let error: { code?: string; message?: string } | null = null;

    for (let attempt = 0; attempt < 5; attempt++) {
      const res = await supabase
        .from('customers')
        .insert(payload)
        .select()
        .single();
      data = res.data;
      error = res.error;
      if (!error) break;

      if (error.code === 'PGRST204' || error.message?.includes('schema cache')) {
        const match = error.message?.match(/Could not find the '([^']+)' column/i);
        if (match && match[1] && match[1] in payload) {
          delete payload[match[1]];
          continue;
        }
      }
      break;
    }

    if (error) {
      logger.error('Error adding customer in SalesProvider:', error);
      throw error;
    }

    logActivity?.('إضافة عميل', `تم إضافة العميل: ${customer.name || ''}`);
    await fetchSalesData();
    return data as Customer;
  }, [targetOrgId, currentUser, logActivity, fetchSalesData]);

  return (
    <SalesContext.Provider
      value={{
        invoices,
        customers,
        salespeople,
        approveInvoice,
        unpostSalesInvoice,
        deleteSalesInvoice,
        addCustomer,
        refreshSales: fetchSalesData,
        refreshInvoices: fetchSalesData,
      }}
    >
      {children}
    </SalesContext.Provider>
  );
};

export const useSalesDomain = (): SalesDomainState => {
  let context: SalesDomainState | null = null;
  try {
    context = useContext(SalesContext);
  } catch {
    // If called outside React component tree (e.g. unit tests), fallback to useAccounting
  }
  if (context) return context;

  // Fallback to unified AccountingContext
  const acc = useAccounting() as unknown as Record<string, unknown>;
  return {
    invoices: (acc.invoices as SalesInvoice[]) || [],
    customers: (acc.customers as Customer[]) || [],
    salespeople: (acc.salespeople as Salesperson[]) || [],
    approveInvoice: acc.approveInvoice as (id: string, orgId?: string, warehouseId?: string) => Promise<boolean>,
    unpostSalesInvoice: acc.unpostSalesInvoice as (id: string, orgId?: string) => Promise<boolean>,
    deleteSalesInvoice: acc.deleteSalesInvoice as (id: string, orgId?: string) => Promise<boolean>,
    addCustomer: acc.addCustomer as (customer: Partial<Customer>) => Promise<Customer | null | Record<string, unknown>>,
    refreshSales: (acc.refreshSalesAndPurchases as () => Promise<void>) || (acc.refreshData as () => Promise<void>),
  };
};

export default useSalesDomain;

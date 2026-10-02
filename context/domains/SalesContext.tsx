/**
 * ==============================================================================
 * TriPro ERP — Sales Domain Context & Hook
 * context/domains/SalesContext.tsx
 * ==============================================================================
 * مخصص لإدارة المبيعات، فواتير العملاء، المرتجعات، ومناديب المبيعات.
 * يدعم الاستخدام المباشر عبر SalesProvider أو عبر واجهة AccountingContext الموحدة.
 * ==============================================================================
 */

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { Invoice, Customer, Salesperson } from '../../types';
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
  refreshSales?: () => Promise<void>;
}

export const SalesContext = createContext<SalesDomainState | null>(null);

export interface SalesProviderProps {
  children: React.ReactNode;
  orgId?: string;
  initialInvoices?: SalesInvoice[];
  initialCustomers?: Customer[];
  initialSalespeople?: Salesperson[];
}

export const SalesProvider: React.FC<SalesProviderProps> = ({
  children,
  orgId,
  initialInvoices = [],
  initialCustomers = [],
  initialSalespeople = [],
}) => {
  const [invoices, setInvoices] = useState<SalesInvoice[]>(initialInvoices);
  const [customers, setCustomers] = useState<Customer[]>(initialCustomers);
  const [salespeople, setSalespeople] = useState<Salesperson[]>(initialSalespeople);

  const fetchSalesData = useCallback(async () => {
    if (!orgId) return;
    try {
      const [invRes, custRes, spRes] = await Promise.all([
        supabase
          .from('invoices')
          .select('*')
          .eq('organization_id', orgId)
          .order('invoice_date', { ascending: false })
          .limit(1000),
        supabase
          .from('customers')
          .select('*')
          .eq('organization_id', orgId)
          .is('deleted_at', null)
          .order('name'),
        supabase
          .from('profiles')
          .select('id, full_name')
          .eq('organization_id', orgId)
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
  }, [orgId]);

  useEffect(() => {
    if (orgId) {
      fetchSalesData();
    }
  }, [orgId, fetchSalesData]);

  const approveInvoice = useCallback(async (id: string, customOrgId?: string, warehouseId?: string): Promise<boolean> => {
    const targetOrgId = customOrgId || orgId || null;
    const { error } = await supabase.rpc('post_sales_invoice', {
      p_invoice_id: id,
      p_org_id: targetOrgId,
      p_warehouse_id: warehouseId
    });
    if (error) {
      logger.error('approveInvoice RPC error in SalesProvider:', error);
      throw error;
    }
    await fetchSalesData();
    return true;
  }, [orgId, fetchSalesData]);

  const unpostSalesInvoice = useCallback(async (id: string, customOrgId?: string): Promise<boolean> => {
    const targetOrgId = customOrgId || orgId || null;
    const { error } = await supabase.rpc('unpost_sales_invoice', {
      p_invoice_id: id,
      p_org_id: targetOrgId
    });
    if (error) {
      logger.warn('unpostSalesInvoice RPC error in SalesProvider:', error);
      throw error;
    }
    await fetchSalesData();
    return true;
  }, [orgId, fetchSalesData]);

  const deleteSalesInvoice = useCallback(async (id: string, customOrgId?: string): Promise<boolean> => {
    const targetOrgId = customOrgId || orgId || null;
    const { error } = await supabase.rpc('delete_sales_invoice', {
      p_invoice_id: id,
      p_org_id: targetOrgId
    });
    if (error) {
      logger.warn('deleteSalesInvoice RPC error in SalesProvider:', error);
      throw error;
    }
    await fetchSalesData();
    return true;
  }, [orgId, fetchSalesData]);

  const addCustomer = useCallback(async (customer: Partial<Customer>): Promise<Customer | null> => {
    if (!orgId) return null;
    const { data, error } = await supabase
      .from('customers')
      .insert({ ...customer, organization_id: orgId })
      .select()
      .single();
    if (error) throw error;
    await fetchSalesData();
    return data as Customer;
  }, [orgId, fetchSalesData]);

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
    refreshSales: acc.refreshData as () => Promise<void>,
  };
};

export default useSalesDomain;

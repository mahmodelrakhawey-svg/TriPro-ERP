/**
 * ==============================================================================
 * TriPro ERP — Customer Domain Context & Hook
 * context/domains/CustomerContext.tsx
 * ==============================================================================
 * مخصص لإدارة العملاء والمديونيات وحسابات الذمم المدينة.
 * يدعم الاستخدام المباشر عبر CustomerProvider أو عبر واجهة AccountingContext الموحدة.
 * ==============================================================================
 */

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { Customer } from '../../types';
import { useAccounting } from '../AccountingContext';
import { supabase } from '../../supabaseClient';
import { logger } from '../../utils/logger';

export interface CustomerDomainState {
  customers: Customer[];
  addCustomer: (customer: Partial<Customer>) => Promise<Customer | null | Record<string, unknown>>;
  updateCustomer: (id: string, updates: Partial<Customer>) => Promise<void>;
  deleteCustomer: (id: string, reason?: string) => Promise<void>;
  refreshCustomers?: () => Promise<void>;
}

export const CustomerContext = createContext<CustomerDomainState | null>(null);

export interface CustomerProviderProps {
  children: React.ReactNode;
  orgId?: string;
  initialCustomers?: Customer[];
}

export const CustomerProvider: React.FC<CustomerProviderProps> = ({ children, orgId, initialCustomers = [] }) => {
  const [customers, setCustomers] = useState<Customer[]>(initialCustomers);

  const fetchCustomers = useCallback(async () => {
    if (!orgId) return;
    try {
      const { data, error } = await supabase
        .from('customers')
        .select('*')
        .eq('organization_id', orgId)
        .is('deleted_at', null)
        .order('name');
      if (error) {
        logger.error('Error fetching customers in CustomerProvider:', error);
      } else {
        setCustomers((data as Customer[]) || []);
      }
    } catch (err) {
      logger.error('Unexpected error fetching customers:', err);
    }
  }, [orgId]);

  useEffect(() => {
    if (orgId) {
      fetchCustomers();
    }
  }, [orgId, fetchCustomers]);

  const addCustomer = useCallback(async (data: Partial<Customer>): Promise<Customer | null> => {
    if (!orgId) return null;
    const { data: c, error } = await supabase
      .from('customers')
      .insert({ ...data, organization_id: orgId })
      .select()
      .single();
    if (error) throw error;
    await fetchCustomers();
    return c as Customer;
  }, [orgId, fetchCustomers]);

  const updateCustomer = useCallback(async (id: string, data: Partial<Customer>): Promise<void> => {
    const { error } = await supabase.from('customers').update(data).eq('id', id);
    if (error) throw error;
    await fetchCustomers();
  }, [fetchCustomers]);

  const deleteCustomer = useCallback(async (id: string, reason?: string): Promise<void> => {
    const { error } = await supabase
      .from('customers')
      .update({ deleted_at: new Date().toISOString(), deletion_reason: reason })
      .eq('id', id);
    if (error) throw error;
    await fetchCustomers();
  }, [fetchCustomers]);

  return (
    <CustomerContext.Provider
      value={{
        customers,
        addCustomer,
        updateCustomer,
        deleteCustomer,
        refreshCustomers: fetchCustomers,
      }}
    >
      {children}
    </CustomerContext.Provider>
  );
};

export const useCustomerDomain = (): CustomerDomainState => {
  let context: CustomerDomainState | null = null;
  try {
    context = useContext(CustomerContext);
  } catch {
    // If called outside React component tree (e.g. unit tests), fallback to useAccounting
  }
  if (context) return context;

  // Fallback to unified AccountingContext (supports legacy callers and tests)
  const acc = useAccounting() as unknown as Record<string, unknown>;
  return {
    customers: (acc.customers as Customer[]) || [],
    addCustomer: acc.addCustomer as (customer: Partial<Customer>) => Promise<Customer | null | Record<string, unknown>>,
    updateCustomer: acc.updateCustomer as (id: string, updates: Partial<Customer>) => Promise<void>,
    deleteCustomer: acc.deleteCustomer as (id: string, reason?: string) => Promise<void>,
    refreshCustomers: acc.refreshData as () => Promise<void>,
  };
};

export default useCustomerDomain;
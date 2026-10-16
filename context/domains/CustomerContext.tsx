/**
 * ==============================================================================
 * TriPro ERP — Customer Domain Context & Hook
 * context/domains/CustomerContext.tsx
 * ==============================================================================
 * مخصص لإدارة العملاء والمديونيات وحسابات الذمم المدينة.
 * يدعم الاستخدام المباشر عبر CustomerProvider أو عبر واجهة AccountingContext الموحدة.
 * مزود بالحماية الكاملة لعزل بيانات المنظمات (Multi-Tenancy) وسجل التدقيق (Audit Log)
 * وجلب البيانات بالصفحات لدعم قواعد البيانات الضخمة التي تتجاوز 1000 عميل.
 * ==============================================================================
 */

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { Customer } from '../../types';
import type { UserProfile } from '../AccountingContext';
import { supabase } from '../../supabaseClient';
import { logger } from '../../utils/logger';
import { fetchAllTableRecords } from './domainUtils';
import { useAccounting } from '../AccountingContext';

export interface CustomerDomainState {
  customers: Customer[];
  addCustomer: (customer: Partial<Customer>) => Promise<Customer | null | Record<string, unknown>>;
  updateCustomer: (id: string, updates: Partial<Customer>) => Promise<void>;
  deleteCustomer: (id: string, reason?: string) => Promise<void>;
  refreshCustomers: () => Promise<void>;
}

export const CustomerContext = createContext<CustomerDomainState | null>(null);

export interface CustomerProviderProps {
  children: React.ReactNode;
  orgId?: string | null;
  currentUser?: UserProfile | null;
  initialCustomers?: Customer[];
  logActivity?: (action: string, details: string) => void;
  isDemo?: boolean;
}

const DEFAULT_OFFLINE_CUSTOMERS: Customer[] = [
  { id: 'cust-walkin', name: 'عميل نقدي صالة', phone: '0000000000' } as Customer
];

const EMPTY_CUSTOMERS: Customer[] = [];

export const CustomerProvider: React.FC<CustomerProviderProps> = ({
  children,
  orgId,
  currentUser,
  initialCustomers = EMPTY_CUSTOMERS,
  logActivity,
  isDemo = false
}) => {
  const [customers, setCustomers] = useState<Customer[]>(() => {
    if (initialCustomers && initialCustomers.length > 0) return initialCustomers;
    if (isDemo || currentUser?.role === 'demo') return DEFAULT_OFFLINE_CUSTOMERS;
    return [];
  });

  const targetOrgId = orgId || currentUser?.organization_id || null;

  const fetchCustomers = useCallback(async () => {
    if (!targetOrgId || targetOrgId === 'org-default-offline') {
      if (initialCustomers.length > 0) {
        setCustomers(initialCustomers);
      } else if (isDemo || currentUser?.role === 'demo') {
        setCustomers(DEFAULT_OFFLINE_CUSTOMERS);
      } else {
        setCustomers([]);
      }
      return;
    }

    try {
      const res = await fetchAllTableRecords<Customer>(
        'customers',
        q => q.eq('organization_id', targetOrgId).is('deleted_at', null).order('name')
      );

      if (res.error) {
        logger.error('Error fetching customers in CustomerProvider:', res.error);
      } else if (res.data) {
        if (res.data.length > 0) {
          setCustomers(res.data);
        } else if (isDemo || currentUser?.role === 'demo') {
          setCustomers(DEFAULT_OFFLINE_CUSTOMERS);
        } else {
          setCustomers([]);
        }
      }
    } catch (err) {
      logger.error('Unexpected error fetching customers:', err);
    }
  }, [targetOrgId, isDemo, currentUser?.role]);

  useEffect(() => {
    if (initialCustomers.length > 0) {
      setCustomers(initialCustomers);
    } else if (targetOrgId && targetOrgId !== 'org-default-offline') {
      fetchCustomers();
    }
  }, [targetOrgId, fetchCustomers, initialCustomers.length]);

  const addCustomer = useCallback(async (data: Partial<Customer>): Promise<Customer | null> => {
    const effectiveOrg = targetOrgId || currentUser?.organization_id;
    const userId = currentUser?.id;

    const payload: Record<string, any> = {
      ...data,
      organization_id: effectiveOrg,
      created_by: userId || null,
      updated_by: userId || null
    };

    let c: unknown = null;
    let error: { code?: string; message?: string } | null = null;

    for (let attempt = 0; attempt < 5; attempt++) {
      const res = await supabase
        .from('customers')
        .insert(payload)
        .select()
        .single();
      c = res.data;
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
      logger.error('Error adding customer:', error);
      throw error;
    }

    logActivity?.('إضافة عميل', `تم إضافة العميل: ${data.name || ''}`);
    await fetchCustomers();
    return c as Customer;
  }, [targetOrgId, currentUser, logActivity, fetchCustomers]);

  const updateCustomer = useCallback(async (id: string, data: Partial<Customer>): Promise<void> => {
    const effectiveOrg = targetOrgId || currentUser?.organization_id;
    const userId = currentUser?.id;

    const payload: Record<string, unknown> = {
      ...data
    };
    delete payload.id;
    delete payload.organization_id;
    if (userId) payload.updated_by = userId;

    let error: { code?: string; message?: string } | null = null;
    for (let attempt = 0; attempt < 5; attempt++) {
      let query = supabase.from('customers').update(payload).eq('id', id);
      if (effectiveOrg && effectiveOrg !== 'org-default-offline') {
        query = query.eq('organization_id', effectiveOrg);
      }
      const res = await query;
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
      logger.error('Error updating customer:', error);
      throw error;
    }

    logActivity?.('تعديل عميل', `تم تعديل بيانات العميل رقم: ${id}`);
    await fetchCustomers();
  }, [targetOrgId, currentUser, logActivity, fetchCustomers]);

  const deleteCustomer = useCallback(async (id: string, reason?: string): Promise<void> => {
    const effectiveOrg = targetOrgId || currentUser?.organization_id;
    const userId = currentUser?.id;

    const payload: Record<string, unknown> = {
      deleted_at: new Date().toISOString(),
      deletion_reason: reason || null
    };
    if (userId) payload.updated_by = userId;

    let error: { code?: string; message?: string } | null = null;
    for (let attempt = 0; attempt < 5; attempt++) {
      let query = supabase.from('customers').update(payload).eq('id', id);
      if (effectiveOrg && effectiveOrg !== 'org-default-offline') {
        query = query.eq('organization_id', effectiveOrg);
      }
      const res = await query;
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
      logger.error('Error deleting customer:', error);
      throw error;
    }

    logActivity?.('حذف عميل', `تم حذف العميل رقم: ${id}`);
    await fetchCustomers();
  }, [targetOrgId, currentUser, logActivity, fetchCustomers]);

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
    refreshCustomers: (acc.refreshCustomers as () => Promise<void>) || (acc.refreshData as () => Promise<void>),
  };
};

export default useCustomerDomain;
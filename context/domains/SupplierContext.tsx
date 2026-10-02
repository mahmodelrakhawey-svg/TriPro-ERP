/**
 * ==============================================================================
 * TriPro ERP — Supplier Domain Context & Hook
 * context/domains/SupplierContext.tsx
 * ==============================================================================
 * مخصص لإدارة الموردين، فواتير المشتريات، وحسابات الذمم الدائنة.
 * يدعم الاستخدام المباشر أو عبر واجهة AccountingContext الموحدة.
 * ==============================================================================
 */

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { Supplier, PurchaseInvoice } from '../../types';
import { useAccounting } from '../AccountingContext';
import { supabase } from '../../supabaseClient';
import { logger } from '../../utils/logger';

export interface SupplierDomainState {
  suppliers: Supplier[];
  purchaseInvoices: PurchaseInvoice[];
  addSupplier: (supplier: Partial<Supplier>) => Promise<Supplier | null | Record<string, unknown>>;
  updateSupplier: (id: string, updates: Partial<Supplier>) => Promise<void>;
  deleteSupplier: (id: string, reason?: string) => Promise<void>;
  approvePurchaseInvoice: (id: string, orgId?: string, warehouseId?: string) => Promise<void>;
  unpostPurchaseInvoice: (id: string, orgId?: string) => Promise<boolean>;
  deletePurchaseInvoice: (id: string, orgId?: string) => Promise<boolean>;
  convertPoToInvoice: (poId: string, warehouseId?: string, orgId?: string) => Promise<void>;
  refreshSuppliers?: () => Promise<void>;
}

export const SupplierContext = createContext<SupplierDomainState | null>(null);

export interface SupplierProviderProps {
  children: React.ReactNode;
  orgId?: string;
  initialSuppliers?: Supplier[];
  initialPurchaseInvoices?: PurchaseInvoice[];
}

export const SupplierProvider: React.FC<SupplierProviderProps> = ({
  children,
  orgId,
  initialSuppliers = [],
  initialPurchaseInvoices = []
}) => {
  const [suppliers, setSuppliers] = useState<Supplier[]>(initialSuppliers);
  const [purchaseInvoices, setPurchaseInvoices] = useState<PurchaseInvoice[]>(initialPurchaseInvoices);

  const fetchSuppliers = useCallback(async () => {
    if (!orgId) return;
    try {
      const { data, error } = await supabase
        .from('suppliers')
        .select('*')
        .eq('organization_id', orgId)
        .is('deleted_at', null)
        .order('name');
      if (error) {
        logger.error('Error fetching suppliers:', error);
      } else {
        setSuppliers((data as Supplier[]) || []);
      }
    } catch (err) {
      logger.error('Unexpected error fetching suppliers:', err);
    }
  }, [orgId]);

  const fetchInvoices = useCallback(async () => {
    if (!orgId) return;
    try {
      const { data, error } = await supabase
        .from('purchase_invoices')
        .select('*')
        .eq('organization_id', orgId)
        .order('invoice_date', { ascending: false })
        .limit(1000);
      if (error) {
        logger.error('Error fetching purchase invoices:', error);
      } else {
        setPurchaseInvoices((data as PurchaseInvoice[]) || []);
      }
    } catch (err) {
      logger.error('Unexpected error fetching purchase invoices:', err);
    }
  }, [orgId]);

  useEffect(() => {
    if (orgId) {
      fetchSuppliers();
      fetchInvoices();
    }
  }, [orgId, fetchSuppliers, fetchInvoices]);

  const addSupplier = useCallback(async (data: Partial<Supplier>): Promise<Supplier | null> => {
    if (!orgId) return null;
    const { data: s, error } = await supabase
      .from('suppliers')
      .insert({ ...data, organization_id: orgId })
      .select()
      .single();
    if (error) throw error;
    await fetchSuppliers();
    return s as Supplier;
  }, [orgId, fetchSuppliers]);

  const updateSupplier = useCallback(async (id: string, data: Partial<Supplier>): Promise<void> => {
    const { error } = await supabase.from('suppliers').update(data).eq('id', id);
    if (error) throw error;
    await fetchSuppliers();
  }, [fetchSuppliers]);

  const deleteSupplier = useCallback(async (id: string, reason?: string): Promise<void> => {
    const { error } = await supabase
      .from('suppliers')
      .update({ deleted_at: new Date().toISOString(), deletion_reason: reason })
      .eq('id', id);
    if (error) throw error;
    await fetchSuppliers();
  }, [fetchSuppliers]);

  const approvePurchaseInvoice = useCallback(async (id: string, customOrgId?: string, warehouseId?: string): Promise<void> => {
    const { error } = await supabase.rpc('post_purchase_invoice', {
      p_invoice_id: id,
      p_org_id: customOrgId || orgId,
      p_warehouse_id: warehouseId
    });
    if (error) throw error;
    await fetchInvoices();
  }, [orgId, fetchInvoices]);

  const unpostPurchaseInvoice = useCallback(async (id: string, customOrgId?: string): Promise<boolean> => {
    const { error } = await supabase.rpc('unpost_purchase_invoice', {
      p_invoice_id: id,
      p_org_id: customOrgId || orgId
    });
    if (error) throw error;
    await fetchInvoices();
    return true;
  }, [orgId, fetchInvoices]);

  const deletePurchaseInvoice = useCallback(async (id: string, customOrgId?: string): Promise<boolean> => {
    const { error } = await supabase.rpc('delete_purchase_invoice', {
      p_invoice_id: id,
      p_org_id: customOrgId || orgId
    });
    if (error) throw error;
    await fetchInvoices();
    return true;
  }, [orgId, fetchInvoices]);

  const convertPoToInvoice = useCallback(async (id: string, warehouseId?: string, customOrgId?: string): Promise<void> => {
    const { error } = await supabase.rpc('convert_po_to_invoice', {
      p_po_id: id,
      p_warehouse_id: warehouseId,
      p_org_id: customOrgId || orgId
    });
    if (error) throw error;
    await fetchInvoices();
  }, [orgId, fetchInvoices]);

  return (
    <SupplierContext.Provider
      value={{
        suppliers,
        purchaseInvoices,
        addSupplier,
        updateSupplier,
        deleteSupplier,
        approvePurchaseInvoice,
        unpostPurchaseInvoice,
        deletePurchaseInvoice,
        convertPoToInvoice,
        refreshSuppliers: fetchSuppliers,
      }}
    >
      {children}
    </SupplierContext.Provider>
  );
};

export const useSupplierDomain = (): SupplierDomainState => {
  let context: SupplierDomainState | null = null;
  try {
    context = useContext(SupplierContext);
  } catch {
    // If called outside React component tree (e.g. unit tests), fallback to useAccounting
  }
  if (context) return context;

  // Fallback to unified AccountingContext
  const acc = useAccounting() as unknown as Record<string, unknown>;
  return {
    suppliers: (acc.suppliers as Supplier[]) || [],
    purchaseInvoices: (acc.purchaseInvoices as PurchaseInvoice[]) || [],
    addSupplier: acc.addSupplier as (supplier: Partial<Supplier>) => Promise<Supplier | null | Record<string, unknown>>,
    updateSupplier: acc.updateSupplier as (id: string, updates: Partial<Supplier>) => Promise<void>,
    deleteSupplier: acc.deleteSupplier as (id: string, reason?: string) => Promise<void>,
    approvePurchaseInvoice: acc.approvePurchaseInvoice as (id: string, orgId?: string, warehouseId?: string) => Promise<void>,
    unpostPurchaseInvoice: acc.unpostPurchaseInvoice as (id: string, orgId?: string) => Promise<boolean>,
    deletePurchaseInvoice: acc.deletePurchaseInvoice as (id: string, orgId?: string) => Promise<boolean>,
    convertPoToInvoice: acc.convertPoToInvoice as (poId: string, warehouseId?: string, orgId?: string) => Promise<void>,
    refreshSuppliers: acc.refreshData as () => Promise<void>,
  };
};

export default useSupplierDomain;
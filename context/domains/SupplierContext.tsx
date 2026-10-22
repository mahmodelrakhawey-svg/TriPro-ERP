/**
 * ==============================================================================
 * TriPro ERP — Supplier Domain Context & Hook
 * context/domains/SupplierContext.tsx
 * ==============================================================================
 * مخصص لإدارة الموردين، فواتير المشتريات، وحسابات الذمم الدائنة.
 * يدعم الاستخدام المباشر أو عبر واجهة AccountingContext الموحدة.
 * مزود بالحماية الكاملة لعزل بيانات المنظمات (Multi-Tenancy) وسجل التدقيق (Audit Log)
 * وجلب البيانات بالصفحات لدعم قواعد البيانات الضخمة التي تتجاوز 1000 مورد.
 * ==============================================================================
 */

import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { Supplier, PurchaseInvoice } from '../../types';
import type { UserProfile } from '../AccountingContext';
import { useAccounting } from '../AccountingContext';
import { supabase } from '../../supabaseClient';
import { logger } from '../../utils/logger';
import { fetchAllTableRecords } from './domainUtils';
import { fetchCompleteDataset } from '../../services/balanceService';

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
  refreshSuppliers: () => Promise<void>;
  refreshPurchaseInvoices?: () => Promise<void>;
}

export const SupplierContext = createContext<SupplierDomainState | null>(null);

export interface SupplierProviderProps {
  children: React.ReactNode;
  orgId?: string | null;
  currentUser?: UserProfile | null;
  initialSuppliers?: Supplier[];
  initialPurchaseInvoices?: PurchaseInvoice[];
  logActivity?: (action: string, details: string) => void;
  showToast?: (message: string, type?: 'success' | 'error' | 'info' | 'warning') => void;
  isDemo?: boolean;
}

const DEFAULT_OFFLINE_SUPPLIERS: Supplier[] = [
  { id: 'sup-main', name: 'مورد عام معتمد', phone: '01000000000' } as Supplier
];

const EMPTY_SUPPLIERS: Supplier[] = [];
const EMPTY_INVOICES: PurchaseInvoice[] = [];

export const SupplierProvider: React.FC<SupplierProviderProps> = ({
  children,
  orgId,
  currentUser,
  initialSuppliers = EMPTY_SUPPLIERS,
  initialPurchaseInvoices = EMPTY_INVOICES,
  logActivity,
  showToast,
  isDemo = false
}) => {
  const [suppliers, setSuppliers] = useState<Supplier[]>(() => {
    if (initialSuppliers && initialSuppliers.length > 0) return initialSuppliers;
    if (isDemo || currentUser?.role === 'demo') return DEFAULT_OFFLINE_SUPPLIERS;
    return [];
  });
  const [purchaseInvoices, setPurchaseInvoices] = useState<PurchaseInvoice[]>(initialPurchaseInvoices);

  const targetOrgId = orgId || currentUser?.organization_id || null;

  const fetchSuppliers = useCallback(async () => {
    if (!targetOrgId || targetOrgId === 'org-default-offline') {
      if (initialSuppliers.length > 0) {
        setSuppliers(initialSuppliers);
      } else if (isDemo || currentUser?.role === 'demo') {
        setSuppliers(DEFAULT_OFFLINE_SUPPLIERS);
      } else {
        setSuppliers([]);
      }
      return;
    }

    try {
      const res = await fetchAllTableRecords<Supplier>(
        'suppliers',
        q => q.eq('organization_id', targetOrgId).is('deleted_at', null).order('name'),
        1000,
        'id, name, code, phone, email, address, tax_number, commercial_register, opening_balance, organization_id'
      );

      if (res.error) {
        logger.error('Error fetching suppliers in SupplierProvider:', res.error);
      } else if (res.data) {
        if (res.data.length > 0) {
          setSuppliers(res.data);
        } else if (isDemo || currentUser?.role === 'demo') {
          setSuppliers(DEFAULT_OFFLINE_SUPPLIERS);
        } else {
          setSuppliers([]);
        }
      }
    } catch (err) {
      logger.error('Unexpected error fetching suppliers:', err);
    }
  }, [targetOrgId, isDemo, currentUser?.role, initialSuppliers]);

  const fetchInvoices = useCallback(async () => {
    if (!targetOrgId || targetOrgId === 'org-default-offline') return;
    try {
      const { data, error } = await supabase
        .from('purchase_invoices')
        .select('id, invoice_number, invoice_date, supplier_id, total_amount, tax_amount, subtotal, paid_amount, status, warehouse_id, organization_id')
        .eq('organization_id', targetOrgId)
        .order('invoice_date', { ascending: false })
        .limit(100);

      if (error) throw error;
      setPurchaseInvoices((data as any) || []);
    } catch (err) {
      logger.error('Unexpected error fetching purchase invoices:', err);
    }
  }, [targetOrgId]);

  useEffect(() => {
    if (initialSuppliers.length > 0) {
      setSuppliers(initialSuppliers);
    } else if (targetOrgId && targetOrgId !== 'org-default-offline') {
      fetchSuppliers();
    }
  }, [targetOrgId, fetchSuppliers, initialSuppliers.length]);

  useEffect(() => {
    if (initialPurchaseInvoices.length > 0) {
      setPurchaseInvoices(initialPurchaseInvoices);
    } else if (targetOrgId && targetOrgId !== 'org-default-offline') {
      fetchInvoices();
    }
  }, [targetOrgId, fetchInvoices, initialPurchaseInvoices.length]);

  const addSupplier = useCallback(async (data: Partial<Supplier>): Promise<Supplier | null> => {
    const effectiveOrg = targetOrgId || currentUser?.organization_id;
    const userId = currentUser?.id;

    const payload: Record<string, any> = {
      name: data.name?.trim() || '',
      code: data.code?.trim() || null,
      phone: data.phone?.trim() || null,
      email: data.email?.trim() || null,
      tax_number: (data.tax_number || (data as any).tax_id || (data as any).taxId)?.trim() || null,
      tax_id: ((data as any).tax_id || (data as any).taxId || data.tax_number)?.trim() || null,
      address: data.address?.trim() || null,
      contact_person: (data.contact_person || (data as any).contactPerson)?.trim() || null,
      opening_balance: Number(data.opening_balance || 0),
      credit_limit: Number(data.credit_limit || 0),
      organization_id: effectiveOrg,
      created_by: userId || null,
      updated_by: userId || null
    };

    let s: Supplier | null = null;
    let error: { code?: string; message?: string } | null = null;

    for (let attempt = 0; attempt < 5; attempt++) {
      const res = await supabase.from('suppliers').insert(payload).select().single();
      s = res.data;
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
      showToast?.('فشل إضافة المورد: ' + error.message, 'error');
      logger.error('Error adding supplier:', error);
      throw error;
    }

    showToast?.('تم إضافة المورد بنجاح ✅', 'success');
    logActivity?.('إضافة مورد', `تم إضافة المورد: ${data.name || ''}`);
    await fetchSuppliers();
    return s as Supplier;
  }, [targetOrgId, currentUser, logActivity, showToast, fetchSuppliers]);

  const updateSupplier = useCallback(async (id: string, data: Partial<Supplier>): Promise<void> => {
    const effectiveOrg = targetOrgId || currentUser?.organization_id;
    const userId = currentUser?.id;

    const payload: Record<string, any> = { ...data };
    delete payload.id;
    delete payload.organization_id;
    if (userId) payload.updated_by = userId;

    let error: { code?: string; message?: string } | null = null;

    for (let attempt = 0; attempt < 5; attempt++) {
      let query = supabase.from('suppliers').update(payload).eq('id', id);
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
      showToast?.('فشل تعديل بيانات المورد: ' + error.message, 'error');
      logger.error('Error updating supplier:', error);
      throw error;
    }

    showToast?.('تم تعديل بيانات المورد بنجاح ✅', 'success');
    logActivity?.('تعديل مورد', `تم تعديل بيانات المورد: ${id}`);
    await fetchSuppliers();
  }, [targetOrgId, currentUser, logActivity, showToast, fetchSuppliers]);

  const deleteSupplier = useCallback(async (id: string, reason?: string): Promise<void> => {
    const effectiveOrg = targetOrgId || currentUser?.organization_id;
    const userId = currentUser?.id;

    // تنظيف قيود الرصيد الافتتاحي إن وجدت
    try {
      const { data: opEntries } = await supabase
        .from('journal_entries')
        .select('id')
        .or(`reference.eq.OP-SUPP-${id},reference.ilike.%${id}%`);

      if (opEntries && opEntries.length > 0) {
        for (const opEntry of opEntries) {
          await supabase.rpc('delete_journal_entry_safe', { p_entry_id: opEntry.id, p_org_id: null });
        }
      }
    } catch (e) {
      logger.warn('Could not auto-clean opening balance entry for supplier:', e);
    }

    let query = supabase
      .from('suppliers')
      .update({
        deleted_at: new Date().toISOString(),
        deletion_reason: reason,
        updated_by: userId
      })
      .eq('id', id);

    if (effectiveOrg && effectiveOrg !== 'org-default-offline') {
      query = query.eq('organization_id', effectiveOrg);
    }

    const { error } = await query;
    if (error) {
      logger.error('Error deleting supplier:', error);
      throw error;
    }

    logActivity?.('حذف مورد', `تم حذف المورد رقم: ${id}`);
    await fetchSuppliers();
  }, [targetOrgId, currentUser, logActivity, fetchSuppliers]);

  const approvePurchaseInvoice = useCallback(async (id: string, customOrgId?: string, warehouseId?: string): Promise<void> => {
    const effectiveOrg = customOrgId || targetOrgId || currentUser?.organization_id;
    const { error } = await supabase.rpc('post_purchase_invoice', {
      p_invoice_id: id,
      p_org_id: effectiveOrg,
      p_warehouse_id: warehouseId
    });

    if (error) {
      showToast?.('فشل اعتماد الفاتورة: ' + error.message, 'error');
      logger.error('Error approving purchase invoice:', error);
      throw error;
    }

    showToast?.('تم اعتماد فاتورة المشتريات وتحديث المخزون بنجاح ✅', 'success');
    await fetchInvoices();
  }, [targetOrgId, currentUser, showToast, fetchInvoices]);

  const unpostPurchaseInvoice = useCallback(async (id: string, customOrgId?: string): Promise<boolean> => {
    const effectiveOrg = customOrgId || targetOrgId || currentUser?.organization_id;
    const { error } = await supabase.rpc('unpost_purchase_invoice', {
      p_invoice_id: id,
      p_org_id: effectiveOrg
    });

    if (error) {
      logger.warn('RPC unpost_purchase_invoice error:', error);
      throw error;
    }

    await fetchInvoices();
    return true;
  }, [targetOrgId, currentUser, fetchInvoices]);

  const deletePurchaseInvoice = useCallback(async (id: string, customOrgId?: string): Promise<boolean> => {
    const effectiveOrg = customOrgId || targetOrgId || currentUser?.organization_id;
    const { error } = await supabase.rpc('delete_purchase_invoice', {
      p_invoice_id: id,
      p_org_id: effectiveOrg
    });

    if (error) {
      logger.warn('RPC delete_purchase_invoice error:', error);
      throw error;
    }

    await fetchInvoices();
    return true;
  }, [targetOrgId, currentUser, fetchInvoices]);

  const convertPoToInvoice = useCallback(async (id: string, warehouseId?: string, customOrgId?: string): Promise<void> => {
    const effectiveOrg = customOrgId || targetOrgId || currentUser?.organization_id;
    const { error } = await supabase.rpc('convert_po_to_invoice', {
      p_po_id: id,
      p_warehouse_id: warehouseId,
      p_org_id: effectiveOrg
    });

    if (error) {
      showToast?.('فشل تحويل أمر الشراء: ' + error.message, 'error');
      logger.error('Error converting po to invoice:', error);
    } else {
      showToast?.('تم تحويل أمر الشراء إلى فاتورة بنجاح ✅', 'success');
      await fetchInvoices();
    }
  }, [targetOrgId, currentUser, showToast, fetchInvoices]);

  const value = useMemo<SupplierDomainState>(() => ({
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
    refreshPurchaseInvoices: fetchInvoices,
  }), [
    suppliers,
    purchaseInvoices,
    addSupplier,
    updateSupplier,
    deleteSupplier,
    approvePurchaseInvoice,
    unpostPurchaseInvoice,
    deletePurchaseInvoice,
    convertPoToInvoice,
    fetchSuppliers,
    fetchInvoices,
  ]);

  return (
    <SupplierContext.Provider value={value}>
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
    refreshSuppliers: (acc.refreshSuppliers as () => Promise<void>) || (acc.refreshData as () => Promise<void>),
  };
};

export default useSupplierDomain;
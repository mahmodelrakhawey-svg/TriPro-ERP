/**
 * ==============================================================================
 * TriPro ERP — Fixed Assets Management Domain Context & Hook
 * context/domains/AssetContext.tsx
 * ==============================================================================
 * مخصص لإدارة الأصول الثابتة، سجل الأصول، حسابات الإهلاك الشهري، وإعادة التقييم.
 * يدعم الاستخدام المباشر عبر AssetProvider أو عبر واجهة AccountingContext الموحدة بنمط Facade.
 * مزود بالحماية الكاملة لعزل بيانات المنظمات (Multi-Tenancy) وربط القيود اليومية آلياً.
 * ==============================================================================
 */

import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { Asset } from '../../types';
import type { UserProfile } from '../AccountingContext';
import { useAccounting } from '../AccountingContext';
import { supabase } from '../../supabaseClient';
import { fetchCompleteDataset } from '../../services/balanceService';
import { logger } from '../../utils/logger';

export interface AssetDomainState {
  assets: Asset[];
  addAsset: (assetData: Record<string, any>) => Promise<void>;
  updateAsset: (id: string, updates: Partial<Asset>) => Promise<void>;
  deleteAsset: (id: string) => Promise<void>;
  runDepreciation: (id?: string, amount?: number, date?: string) => Promise<void>;
  revaluateAsset: (id: string, val: number, date: string, accId: string) => Promise<void>;
  refreshAssets: () => Promise<void>;
}

export const AssetContext = createContext<AssetDomainState | null>(null);

export interface AssetProviderProps {
  children: React.ReactNode;
  orgId?: string | null;
  currentUser?: UserProfile | null;
  logActivity?: (action: string, details: string) => void;
  showToast?: (message: string, type?: 'success' | 'error' | 'info' | 'warning') => void;
  isDemo?: boolean;
  initialAssets?: Asset[];
  addEntry?: (entry: Record<string, unknown>) => Promise<unknown>;
  getSystemAccount?: (key: string) => Record<string, unknown> | undefined;
}

const EMPTY_ASSETS: Asset[] = [];

export const AssetProvider: React.FC<AssetProviderProps> = ({
  children,
  orgId,
  currentUser = null,
  logActivity,
  showToast,
  isDemo = false,
  initialAssets = EMPTY_ASSETS,
  addEntry,
  getSystemAccount,
}) => {
  const [assets, setAssets] = useState<Asset[]>(initialAssets);
  const targetOrgId = orgId || currentUser?.organization_id || null;

  // مزامنة الأصول الأولية
  useEffect(() => {
    if (initialAssets && initialAssets.length > 0) {
      setAssets(initialAssets);
    }
  }, [initialAssets]);

  const notify = useCallback((message: string, type: 'success' | 'error' | 'info' | 'warning' = 'info') => {
    if (showToast) showToast(message, type);
  }, [showToast]);

  // --- جلب الأصول بالكامل بدون التقيد بـ 1000 سطر ---
  const fetchAssets = useCallback(async () => {
    if (!targetOrgId || targetOrgId === 'org-default-offline') {
      if (initialAssets.length > 0) setAssets(initialAssets);
      return;
    }

    try {
      const data = await fetchCompleteDataset<Asset>(async (from, to) =>
        supabase
          .from('assets')
          .select('*')
          .eq('organization_id', targetOrgId)
          .is('deleted_at', null)
          .range(from, to)
      );

      if (data) {
        setAssets(data);
      }
    } catch (err) {
      logger.error('Unexpected error fetching assets in AssetProvider:', err);
    }
  }, [targetOrgId, initialAssets]);

  // التحميل التلقائي عند تغيير المنظمة
  useEffect(() => {
    fetchAssets();
  }, [fetchAssets]);

  // --- إضافة أصل ثابت مع القيد المحاسبي الآلي ---
  const addAsset = useCallback(async (assetData: Record<string, any>) => {
    if (!targetOrgId) {
      throw new Error('لم يتم تحديد المنظمة لإضافة الأصل');
    }

    // 1. فصل تعليمات القيد المحاسبي عن بيانات الجدول الفعلية
    const { create_journal_entry, credit_account_id, ...dbPayload } = assetData;

    // 2. تنظيف البيانات (تحويل القيم الفارغة إلى null)
    const cleanedPayload = { ...dbPayload };
    ['accumulated_depreciation_account_id', 'depreciation_expense_account_id'].forEach(key => {
      if (cleanedPayload[key] === '') cleanedPayload[key] = null;
    });

    // 3. إدراج الأصل في قاعدة البيانات
    const { data: newAsset, error } = await supabase
      .from('assets')
      .insert({ ...cleanedPayload, organization_id: targetOrgId })
      .select()
      .single();

    if (error) throw error;

    // 4. إنشاء قيد اليومية آلياً إذا طُلب ذلك
    if (create_journal_entry && newAsset && addEntry) {
      try {
        const refCode = `ASSET-${newAsset.id.split('-')[0].toUpperCase()}`;
        const openingAccId = getSystemAccount ? getSystemAccount('OPENING_BALANCES')?.id : undefined;

        await addEntry({
          date: newAsset.purchase_date || new Date().toISOString().split('T')[0],
          description: `إثبات شراء أصل ثابت: ${newAsset.name}`,
          reference: refCode,
          status: 'posted',
          p_org_id: targetOrgId,
          lines: [
            {
              account_id: newAsset.asset_account_id,
              debit: newAsset.purchase_cost,
              credit: 0,
              description: `قيمة الأصل المشتري: ${newAsset.name}`
            },
            {
              account_id: credit_account_id || openingAccId,
              debit: 0,
              credit: newAsset.purchase_cost,
              description: `سداد قيمة الأصل: ${newAsset.name}`
            }
          ]
        });

        // ربط القيد بـ related_document_id لتسهيل التتبع
        await supabase
          .from('journal_entries')
          .update({ related_document_id: newAsset.id, related_document_type: 'fixed_asset' })
          .eq('reference', refCode)
          .eq('organization_id', targetOrgId);
      } catch (jeError) {
        logger.error('Failed to create asset journal entry:', jeError);
        notify('تمت إضافة الأصل ولكن فشل إنشاء القيد آلياً، يرجى إنشاؤه يدوياً.', 'warning');
      }
    }

    if (logActivity) {
      logActivity('ADD_ASSET', `إضافة أصل جديد: ${cleanedPayload.name || ''}`);
    }

    await fetchAssets();
  }, [targetOrgId, addEntry, getSystemAccount, fetchAssets, logActivity, notify]);

  // --- تحديث أصل ثابت ---
  const updateAsset = useCallback(async (id: string, updates: Partial<Asset>) => {
    let query = supabase.from('assets').update(updates).eq('id', id);
    if (targetOrgId) query = query.eq('organization_id', targetOrgId);

    const { error } = await query;
    if (error) throw error;

    if (logActivity) {
      logActivity('UPDATE_ASSET', `تحديث بيانات الأصل: ${id}`);
    }

    await fetchAssets();
  }, [targetOrgId, fetchAssets, logActivity]);

  // --- حذف أصل ثابت (نقل إلى سلة المحذوفات مع إلغاء ترحيل القيود) ---
  const deleteAsset = useCallback(async (id: string) => {
    let query = supabase.from('assets').update({ deleted_at: new Date().toISOString() }).eq('id', id);
    if (targetOrgId) query = query.eq('organization_id', targetOrgId);

    const { error } = await query;
    if (error) throw error;

    // إلغاء ترحيل قيود الأصل المرتبطة (الشراء والإهلاك) حتى لا تظهر في ميزان المراجعة أثناء وجود الأصل بالسلة
    try {
      const prefix = id.split('-')[0].toUpperCase();
      const shortId = id.slice(0, 6);
      await supabase
        .from('journal_entries')
        .update({ status: 'draft', is_posted: false })
        .eq('organization_id', targetOrgId)
        .or(`related_document_id.eq.${id},reference.ilike.ASSET-${prefix}%,reference.ilike.DEP-${shortId}%`);

      if (targetOrgId) {
        await supabase.rpc('recalculate_all_system_balances', { p_org_id: targetOrgId });
      }
    } catch (e) {
      logger.warn('deleteAsset unpost fallback:', e);
    }

    if (logActivity) {
      logActivity('DELETE_ASSET', `حذف الأصل: ${id}`);
    }

    await fetchAssets();
  }, [targetOrgId, fetchAssets, logActivity]);

  // --- تنفيذ الإهلاك الدوري للأصول ---
  const runDepreciation = useCallback(async (id?: string, amount?: number, date?: string) => {
    const { error } = await supabase.rpc('run_monthly_depreciation', {
      p_asset_id: id,
      p_amount: amount,
      p_date: date
    });

    if (error) {
      logger.error('runDepreciation error in AssetProvider:', error);
      notify('فشل تنفيذ الإهلاك: ' + error.message, 'error');
      throw error;
    }

    notify('تم تنفيذ الإهلاك وتحديث الأرصدة بنجاح ✅', 'success');

    if (logActivity) {
      logActivity('RUN_DEPRECIATION', `تنفيذ إهلاك الأصل: ${id || 'جميع الأصول'}`);
    }

    await fetchAssets();
  }, [fetchAssets, notify, logActivity]);

  // --- إعادة تقييم أصل ثابت ---
  const revaluateAsset = useCallback(async (id: string, val: number, date: string, accId: string) => {
    const { data: asset, error: fetchErr } = await supabase
      .from('assets')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (fetchErr || !asset) {
      notify('تعذر العثور على بيانات الأصل لإعادة التقييم', 'error');
      return;
    }

    const oldVal = Number(asset.current_value ?? asset.purchase_cost) || 0;
    const newVal = Number(val) || 0;
    const diff = newVal - oldVal;

    let updateQuery = supabase.from('assets').update({ current_value: newVal }).eq('id', id);
    if (targetOrgId) updateQuery = updateQuery.eq('organization_id', targetOrgId);

    const { error: updateErr } = await updateQuery;
    if (updateErr) {
      notify('فشل إعادة تقييم الأصل: ' + updateErr.message, 'error');
      return;
    }

    if (diff !== 0 && accId && asset.asset_account_id && addEntry) {
      try {
        const isSurplus = diff > 0;
        const absDiff = Math.abs(diff);
        await addEntry({
          date: date || new Date().toISOString().split('T')[0],
          description: `إعادة تقييم الأصل: ${asset.name} (${isSurplus ? 'فائض' : 'عجز'} تقييم)`,
          reference: `REVAL-${asset.id.slice(0, 8).toUpperCase()}`,
          status: 'posted',
          p_org_id: targetOrgId,
          lines: isSurplus ? [
            { accountId: asset.asset_account_id, debit: absDiff, credit: 0, description: `زيادة قيمة الأصل ${asset.name}` },
            { accountId: accId, debit: 0, credit: absDiff, description: `احتياطي فائض إعادة التقييم` }
          ] : [
            { accountId: accId, debit: absDiff, credit: 0, description: `خسائر وعجز إعادة تقييم الأصل` },
            { accountId: asset.asset_account_id, debit: 0, credit: absDiff, description: `تخفيض قيمة الأصل ${asset.name}` }
          ]
        });
      } catch (jeErr) {
        logger.warn('Revaluation journal entry notice:', jeErr);
      }
    }

    notify('تمت إعادة تقييم الأصل بنجاح ✅', 'success');

    if (logActivity) {
      logActivity('REVALUATE_ASSET', `إعادة تقييم الأصل: ${asset.name} بالقيمة ${newVal}`);
    }

    await fetchAssets();
  }, [targetOrgId, addEntry, fetchAssets, notify, logActivity]);

  const value = useMemo<AssetDomainState>(() => ({
    assets,
    addAsset,
    updateAsset,
    deleteAsset,
    runDepreciation,
    revaluateAsset,
    refreshAssets: fetchAssets,
  }), [
    assets,
    addAsset,
    updateAsset,
    deleteAsset,
    runDepreciation,
    revaluateAsset,
    fetchAssets,
  ]);

  return (
    <AssetContext.Provider value={value}>
      {children}
    </AssetContext.Provider>
  );
};

export const useAssetDomain = (): AssetDomainState => {
  let context: AssetDomainState | null = null;
  try {
    context = useContext(AssetContext);
  } catch {
    // If called outside React tree
  }
  if (context) return context;

  // Fallback to unified AccountingContext
  const acc = useAccounting() as unknown as Record<string, unknown>;
  return {
    assets: (acc.assets as Asset[]) || [],
    addAsset: acc.addAsset as (assetData: Record<string, any>) => Promise<void>,
    updateAsset: acc.updateAsset as (id: string, updates: Partial<Asset>) => Promise<void>,
    deleteAsset: acc.deleteAsset as (id: string) => Promise<void>,
    runDepreciation: acc.runDepreciation as (id?: string, amount?: number, date?: string) => Promise<void>,
    revaluateAsset: acc.revaluateAsset as (id: string, val: number, date: string, accId: string) => Promise<void>,
    refreshAssets: (acc.refreshAssets || acc.refreshData) as () => Promise<void>,
  };
};

export default useAssetDomain;

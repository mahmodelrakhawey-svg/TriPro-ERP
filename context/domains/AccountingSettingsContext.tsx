/**
 * ==============================================================================
 * TriPro ERP — Accounting & Settings Domain Context & Hook
 * context/domains/AccountingSettingsContext.tsx
 * ==============================================================================
 * مخصص لإدارة إعدادات النظام، بيانات المنظمة، وصلاحيات المستخدمين (RBAC).
 * يدعم الاستخدام المباشر عبر SettingsProvider أو عبر واجهة AccountingContext الموحدة بنمط Facade.
 * مزود بالحماية الكاملة لعزل بيانات المنظمات (Multi-Tenancy) وسجل التدقيق (Audit Log).
 * ==============================================================================
 */

import React, { createContext, useContext, useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Organization, SystemSettings, Account } from '../../types';
import type { UserProfile } from '../AccountingContext';
import { useAccounting } from '../AccountingContext';
import { supabase } from '../../supabaseClient';
import { logger } from '../../utils/logger';
import { deriveAccountMappings } from '../../utils/financialSafety';
import { normalizeCompanySettings, syncLenzaNegativeStockIfNeeded } from './domainUtils';

export interface SettingsDomainState {
  organization: Organization | null;
  currentUser: UserProfile | null;
  settings: SystemSettings | Record<string, unknown>;
  accounts: Account[];
  isLoading: boolean;
  can: (module: string, action: string) => boolean;
  getSystemAccount?: (key: string) => Account | undefined;
  updateSettings?: (newSettings: Record<string, unknown>) => Promise<void>;
  refreshSettings?: () => Promise<void>;
}

export const SettingsContext = createContext<SettingsDomainState | null>(null);

export interface SettingsProviderProps {
  children: React.ReactNode;
  orgId?: string | null;
  currentUser?: UserProfile | null;
  can?: (module: string, action: string) => boolean;
  logActivity?: (action: string, details: string) => void;
  showToast?: (message: string, type?: 'success' | 'error' | 'info' | 'warning') => void;
  isDemo?: boolean;
  initialOrganization?: Organization | null;
  initialSettings?: SystemSettings | Record<string, unknown>;
  initialAccounts?: Account[];
}

const EMPTY_SETTINGS: Record<string, unknown> = {};
const EMPTY_ACCOUNTS: Account[] = [];

export const SettingsProvider: React.FC<SettingsProviderProps> = ({
  children,
  orgId,
  currentUser = null,
  can: propCan,
  logActivity,
  showToast,
  isDemo = false,
  initialOrganization = null,
  initialSettings = EMPTY_SETTINGS,
  initialAccounts = EMPTY_ACCOUNTS,
}) => {
  const [organization, setOrganization] = useState<Organization | null>(initialOrganization);
  const [settings, setSettings] = useState<SystemSettings | Record<string, unknown>>(initialSettings);
  const [accounts, setAccounts] = useState<Account[]>(initialAccounts);
  const [isLoading, setIsLoading] = useState<boolean>(false);

  const targetOrgId = orgId || currentUser?.organization_id;
  const lenzaSyncedRef = useRef<Set<string>>(new Set());
  const organizationRef = useRef<Organization | null>(organization);
  organizationRef.current = organization;
  const accountsRef = useRef<Account[]>(accounts);
  accountsRef.current = accounts;

  // مزامنة الإعدادات الأولية عند تحديث المكون الأب
  useEffect(() => {
    if (initialOrganization) setOrganization(initialOrganization);
  }, [initialOrganization]);

  useEffect(() => {
    if (initialSettings && Object.keys(initialSettings).length > 0) {
      setSettings(normalizeCompanySettings(initialSettings as Record<string, any>, initialOrganization || organizationRef.current));
    }
  }, [initialSettings, initialOrganization]);

  useEffect(() => {
    if (initialAccounts && initialAccounts.length > 0) {
      setAccounts(initialAccounts);
    }
  }, [initialAccounts]);

  const normalizeSettings = useCallback(
    (raw: Record<string, any>, orgObj?: Organization | null) =>
      normalizeCompanySettings(raw, (orgObj || organizationRef.current) as Record<string, any> | null),
    []
  );

  const fetchSettingsData = useCallback(async () => {
    const effectiveOrg = targetOrgId;
    if (!effectiveOrg || effectiveOrg === 'org-default-offline') return;
    setIsLoading(true);
    try {
      const [orgRes, settRes] = await Promise.all([
        supabase.from('organizations').select('*').eq('id', effectiveOrg).maybeSingle(),
        supabase.rpc('get_current_company_settings', { p_org_id: effectiveOrg }).maybeSingle()
      ]);

      let activeOrg = organizationRef.current;
      if (orgRes.error) {
        logger.error('Error fetching organization in SettingsProvider:', orgRes.error);
      } else if (orgRes.data) {
        activeOrg = orgRes.data as Organization;
        organizationRef.current = activeOrg;
        setOrganization(activeOrg);
      }

      if (settRes.error) {
        logger.error('Error fetching settings in SettingsProvider:', settRes.error);
      } else if (settRes.data) {
        const rawSettings = settRes.data as Record<string, any>;
        let normalized = normalizeCompanySettings(rawSettings, activeOrg as Record<string, any> | null);

        const currentAccounts = accountsRef.current;
        if (currentAccounts.length > 0) {
          const currentRawMappings = { ...(rawSettings.account_mappings || rawSettings.accountMappings || {}) };
          const { mappings: autoDerivedMappings, hasNewMappings } = deriveAccountMappings(currentAccounts as any, currentRawMappings);
          if (hasNewMappings) {
            normalized = {
              ...normalized,
              account_mappings: autoDerivedMappings,
              accountMappings: autoDerivedMappings,
            };
          }
        }

        setSettings(normalized);
        syncLenzaNegativeStockIfNeeded({
          supabaseClient: supabase,
          orgId: effectiveOrg,
          orgObj: activeOrg as Record<string, any> | null,
          rawSettings,
          userRole: currentUser?.role,
          syncedOrgIds: lenzaSyncedRef.current,
        });
      }
    } catch (err) {
      logger.error('Unexpected error fetching settings data:', err);
    } finally {
      setIsLoading(false);
    }
  }, [targetOrgId, currentUser?.role]);

  useEffect(() => {
    if (targetOrgId && targetOrgId !== 'org-default-offline') {
      fetchSettingsData();
    }
  }, [targetOrgId, fetchSettingsData]);

  const mergeNormalizedSettings = useCallback(
    (prev: SystemSettings | Record<string, unknown>, newSettings: Record<string, unknown>) => {
      const merged: Record<string, any> = { ...(prev as Record<string, any>), ...newSettings };
      if (newSettings.vat_rate !== undefined && newSettings.vatRate === undefined) delete merged.vatRate;
      if (newSettings.vatRate !== undefined && newSettings.vat_rate === undefined) delete merged.vat_rate;
      if (newSettings.service_charge_rate !== undefined && newSettings.serviceChargeRate === undefined) delete merged.serviceChargeRate;
      if (newSettings.serviceChargeRate !== undefined && newSettings.service_charge_rate === undefined) delete merged.service_charge_rate;
      if (newSettings.allow_negative_stock !== undefined && newSettings.allowNegativeStock === undefined) delete merged.allowNegativeStock;
      if (newSettings.allowNegativeStock !== undefined && newSettings.allow_negative_stock === undefined) delete merged.allow_negative_stock;
      return normalizeSettings(merged);
    },
    [normalizeSettings]
  );

  const updateSettings = useCallback(async (newSettings: Record<string, unknown>): Promise<void> => {
    const effectiveOrg = targetOrgId;
    if (!effectiveOrg || effectiveOrg === 'org-default-offline') {
      setSettings(prev => mergeNormalizedSettings(prev, newSettings));
      showToast?.('تم حفظ الإعدادات محلياً ✅', 'success');
      return;
    }

    let { error } = await supabase
      .from('company_settings')
      .update(newSettings)
      .eq('organization_id', effectiveOrg);

    // إذا لم يكن السجل موجوداً في قاعدة البيانات نقوم بإنشائه لضمان سلامة الإعدادات
    if (error && (error.code === 'PGRST116' || error.message?.includes('0 rows') || error.message?.includes('not found'))) {
      const insertRes = await supabase
        .from('company_settings')
        .insert({
          ...newSettings,
          organization_id: effectiveOrg
        });
      error = insertRes.error;
    }

    if (error) {
      showToast?.('فشل تحديث الإعدادات: ' + error.message, 'error');
      logger.error('Error updating company_settings:', error);
      throw error;
    }

    setSettings(prev => mergeNormalizedSettings(prev, newSettings));
    showToast?.('تم تحديث إعدادات النظام بنجاح ✅', 'success');
    logActivity?.('تحديث إعدادات النظام', 'تم حفظ تعديل إعدادات الشركة');
    await fetchSettingsData();
  }, [targetOrgId, logActivity, showToast, fetchSettingsData, mergeNormalizedSettings]);

  const can = useCallback((module: string, action: string): boolean => {
    if (propCan) return propCan(module, action);
    if (!currentUser) return false;
    const role = (currentUser.role || '').toLowerCase();
    if (role === 'admin' || role === 'owner' || role === 'super_admin') return true;

    const perms = (currentUser as any).permissions || [];
    if (Array.isArray(perms)) {
      if (perms.includes('all') || perms.includes('*')) return true;
      if (perms.includes(`${module}.${action}`) || perms.includes(`${module}.*`)) return true;
      if (perms.includes(module)) return true;
    }
    return false;
  }, [propCan, currentUser]);

  const getSystemAccount = useCallback((key: string): Account | undefined => {
    const rawSettings = settings as Record<string, unknown>;
    const mappings = (rawSettings?.account_mappings || {}) as Record<string, string>;
    const mappingId = mappings[key];
    if (mappingId) return accounts.find(a => a.id === mappingId);

    if (key === 'CUSTOMERS' || key === 'AR' || key === 'CUSTOMER') {
      return accounts.find(a => a.name?.includes('العملاء') || a.code === '1221' || a.code?.startsWith('122'));
    }
    if (key === 'SUPPLIERS' || key === 'AP' || key === 'SUPPLIER') {
      return accounts.find(a => a.name?.includes('الموردين') || a.code === '201' || a.code?.startsWith('201'));
    }
    if (key === 'CASH' || key === 'TREASURY') {
      return accounts.find(a => a.name?.includes('الخزينة') || a.name?.includes('الصندوق') || a.code === '1231');
    }
    return accounts.find(a => a.code === key);
  }, [accounts, settings]);

  const value = useMemo<SettingsDomainState>(() => ({
    organization,
    currentUser,
    settings,
    accounts,
    isLoading,
    can,
    getSystemAccount,
    updateSettings,
    refreshSettings: fetchSettingsData,
  }), [
    organization,
    currentUser,
    settings,
    accounts,
    isLoading,
    can,
    getSystemAccount,
    updateSettings,
    fetchSettingsData,
  ]);

  return (
    <SettingsContext.Provider value={value}>
      {children}
    </SettingsContext.Provider>
  );
};

export const useSettingsDomain = (): SettingsDomainState => {
  let context: SettingsDomainState | null = null;
  try {
    context = useContext(SettingsContext);
  } catch {
    // If called outside React component tree (e.g. unit tests), fallback to useAccounting
  }
  if (context) return context;

  // Fallback to unified AccountingContext
  const acc = useAccounting() as unknown as Record<string, unknown>;
  return {
    organization: (acc.organization as Organization) || null,
    currentUser: (acc.currentUser as UserProfile) || null,
    settings: (acc.settings as SystemSettings) || {},
    accounts: (acc.accounts as Account[]) || [],
    isLoading: Boolean(acc.isLoading),
    can: (acc.can as (module: string, action: string) => boolean) || (() => true),
    getSystemAccount: acc.getSystemAccount as (key: string) => Account | undefined,
    updateSettings: undefined,
    refreshSettings: acc.refreshData as () => Promise<void>,
  };
};

export default useSettingsDomain;
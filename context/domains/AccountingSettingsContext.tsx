/**
 * ==============================================================================
 * TriPro ERP — Accounting & Settings Domain Context & Hook
 * context/domains/AccountingSettingsContext.tsx
 * ==============================================================================
 * مخصص لإدارة إعدادات النظام، شجرة الحسابات، صلاحيات المستخدمين، والسنوات المالية.
 * يدعم الاستخدام المباشر عبر SettingsProvider أو عبر واجهة AccountingContext الموحدة.
 * ==============================================================================
 */

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { Organization, User, SystemSettings, Account, JournalEntry } from '../../types';
import { useAccounting } from '../AccountingContext';
import { supabase } from '../../supabaseClient';
import { logger } from '../../utils/logger';

export interface SettingsDomainState {
  organization: Organization | null;
  currentUser: User | null;
  settings: SystemSettings | Record<string, unknown>;
  accounts: Account[];
  entries: JournalEntry[];
  isLoading: boolean;
  can: (module: string, action: string) => boolean;
  getSystemAccount: (key: string) => Account | undefined;
  addEntry: (entry: Record<string, unknown>) => Promise<void>;
  addAccount: (acc: Partial<Account>) => Promise<Account | null | Record<string, unknown>>;
  updateAccount: (id: string, updates: Partial<Account>) => Promise<void>;
  deleteAccount: (id: string, reason?: string) => Promise<{ success: boolean; message?: string }>;
  refreshSettings?: () => Promise<void>;
}

export const SettingsContext = createContext<SettingsDomainState | null>(null);

export interface SettingsProviderProps {
  children: React.ReactNode;
  orgId?: string;
  initialOrganization?: Organization | null;
  initialUser?: User | null;
  initialSettings?: SystemSettings | Record<string, unknown>;
  initialAccounts?: Account[];
  initialEntries?: JournalEntry[];
}

export const SettingsProvider: React.FC<SettingsProviderProps> = ({
  children,
  orgId,
  initialOrganization = null,
  initialUser = null,
  initialSettings = {},
  initialAccounts = [],
  initialEntries = [],
}) => {
  const [organization, setOrganization] = useState<Organization | null>(initialOrganization);
  const [currentUser] = useState<User | null>(initialUser);
  const [settings, setSettings] = useState<SystemSettings | Record<string, unknown>>(initialSettings);
  const [accounts, setAccounts] = useState<Account[]>(initialAccounts);
  const [entries, setEntries] = useState<JournalEntry[]>(initialEntries);
  const [isLoading, setIsLoading] = useState<boolean>(false);

  const fetchSettingsData = useCallback(async () => {
    if (!orgId) return;
    setIsLoading(true);
    try {
      const [orgRes, accRes, entRes] = await Promise.all([
        supabase.from('organizations').select('*').eq('id', orgId).single(),
        supabase.from('accounts').select('*').eq('organization_id', orgId).order('code'),
        supabase.from('journal_entries').select('*, journal_lines(*)').eq('organization_id', orgId).limit(500)
      ]);

      if (orgRes.error) {
        logger.error('Error fetching org settings in SettingsProvider:', orgRes.error);
      } else if (orgRes.data) {
        setOrganization(orgRes.data as Organization);
        setSettings((orgRes.data as unknown as Record<string, unknown>).settings as SystemSettings || {});
      }

      if (accRes.error) {
        logger.error('Error fetching accounts in SettingsProvider:', accRes.error);
      } else {
        setAccounts((accRes.data as Account[]) || []);
      }

      if (entRes.error) {
        logger.error('Error fetching entries in SettingsProvider:', entRes.error);
      } else {
        setEntries((entRes.data as JournalEntry[]) || []);
      }
    } catch (err) {
      logger.error('Unexpected error fetching settings data:', err);
    } finally {
      setIsLoading(false);
    }
  }, [orgId]);

  useEffect(() => {
    if (orgId) {
      fetchSettingsData();
    }
  }, [orgId, fetchSettingsData]);

  const can = useCallback((_module: string, _action: string): boolean => {
    // Basic fallback; real authorization handled by AuthContext / AccountingContext
    return true;
  }, []);

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
    return undefined;
  }, [accounts, settings]);

  const addAccount = useCallback(async (acc: Partial<Account>): Promise<Account | null> => {
    if (!orgId) return null;
    const { data, error } = await supabase.from('accounts').insert({ ...acc, organization_id: orgId }).select().single();
    if (error) throw error;
    await fetchSettingsData();
    return data as Account;
  }, [orgId, fetchSettingsData]);

  const updateAccount = useCallback(async (id: string, updates: Partial<Account>): Promise<void> => {
    const { error } = await supabase.from('accounts').update(updates).eq('id', id);
    if (error) throw error;
    await fetchSettingsData();
  }, [fetchSettingsData]);

  const deleteAccount = useCallback(async (id: string, _reason?: string): Promise<{ success: boolean; message?: string }> => {
    const { error } = await supabase.from('accounts').delete().eq('id', id);
    await fetchSettingsData();
    return { success: !error, message: error?.message };
  }, [fetchSettingsData]);

  const addEntry = useCallback(async (entry: Record<string, unknown>): Promise<void> => {
    const targetOrgId = (entry.p_org_id || entry.organization_id || orgId) as string | undefined;
    const { error } = await supabase.rpc('add_journal_entry', { ...entry, p_org_id: targetOrgId });
    if (error) throw error;
    await fetchSettingsData();
  }, [orgId, fetchSettingsData]);

  return (
    <SettingsContext.Provider
      value={{
        organization,
        currentUser,
        settings,
        accounts,
        entries,
        isLoading,
        can,
        getSystemAccount,
        addEntry,
        addAccount,
        updateAccount,
        deleteAccount,
        refreshSettings: fetchSettingsData,
      }}
    >
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
    currentUser: (acc.currentUser as User) || null,
    settings: (acc.settings as SystemSettings) || {},
    accounts: (acc.accounts as Account[]) || [],
    entries: (acc.entries as JournalEntry[]) || [],
    isLoading: Boolean(acc.isLoading),
    can: (acc.can as (module: string, action: string) => boolean) || (() => true),
    getSystemAccount: acc.getSystemAccount as (key: string) => Account | undefined,
    addEntry: acc.addEntry as (entry: Record<string, unknown>) => Promise<void>,
    addAccount: acc.addAccount as (acc: Partial<Account>) => Promise<Account | null | Record<string, unknown>>,
    updateAccount: acc.updateAccount as (id: string, updates: Partial<Account>) => Promise<void>,
    deleteAccount: acc.deleteAccount as (id: string, reason?: string) => Promise<{ success: boolean; message?: string }>,
    refreshSettings: acc.refreshData as () => Promise<void>,
  };
};

export default useSettingsDomain;
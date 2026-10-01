/**
 * ==============================================================================
 * TriPro ERP — Accounting & Settings Domain Context & Hook
 * context/domains/AccountingSettingsContext.tsx
 * ==============================================================================
 * مخصص لإدارة إعدادات النظام، شجرة الحسابات، صلاحيات المستخدمين، والسنوات المالية.
 * يدعم الاستخدام المباشر أو عبر واجهة AccountingContext الموحدة.
 * ==============================================================================
 */

import { useAccounting } from '../AccountingContext';

type DynamicParam = any;

export interface SettingsDomainState {
  organization: any;
  currentUser: any;
  settings: any;
  accounts: any[];
  entries: any[];
  isLoading: boolean;
  can: (module: string, action: string) => boolean;
  getSystemAccount: (key: string) => any;
  addEntry: (entry: DynamicParam) => Promise<void>;
  addAccount: (acc: DynamicParam) => Promise<any>;
  updateAccount: (id: string, updates: DynamicParam) => Promise<void>;
  deleteAccount: (id: string, reason?: string) => Promise<{ success: boolean; message?: string }>;
}

export const useSettingsDomain = (): SettingsDomainState => {
  const acc = useAccounting() as any;
  return {
    organization: acc.organization,
    currentUser: acc.currentUser,
    settings: acc.settings,
    accounts: acc.accounts || [],
    entries: acc.entries || [],
    isLoading: acc.isLoading,
    can: acc.can,
    getSystemAccount: acc.getSystemAccount,
    addEntry: acc.addEntry,
    addAccount: acc.addAccount,
    updateAccount: acc.updateAccount,
    deleteAccount: acc.deleteAccount,
  };
};

export default useSettingsDomain;
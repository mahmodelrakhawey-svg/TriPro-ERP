/**
 * ==============================================================================
 * TriPro ERP — Shared Domain Utilities
 * context/domains/domainUtils.ts
 * ==============================================================================
 * دوال مساعدة مشتركة لكافة سياقات النطاقات (Domain Contexts)
 * تشمل جلب السجلات الكبيرة بالصفحات وضمان التوافق مع Supabase.
 * ==============================================================================
 */

import { supabase } from '../../supabaseClient';
import { logger } from '../../utils/logger';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Account } from '../../types';
import { SYSTEM_ACCOUNTS } from '../accountingConstants';

export type DynamicQuery = any;
export type DynamicParam = any;

/**
 * تحديد ما إذا كانت المنشأة هي حلواني لينزا لتطبيق قواعد الحماية الخاصة بها
 */
export function isLenzaOrganization(
  orgObj?: Record<string, any> | null,
  rawSettings?: Record<string, any> | null
): boolean {
  return Boolean(
    (orgObj?.name && /لينزا|lenza/i.test(String(orgObj.name))) ||
    (orgObj?.commercial_name && /لينزا|lenza/i.test(String(orgObj.commercial_name))) ||
    (rawSettings?.companyName && /لينزا|lenza/i.test(String(rawSettings.companyName))) ||
    (rawSettings?.company_name && /لينزا|lenza/i.test(String(rawSettings.company_name)))
  );
}

/**
 * توحيد إعدادات الشركة وضمان توافق صيغ الضريبة ورسوم الخدمة والسماح بالرصيد السالب:
 * - vatRate / serviceChargeRate: نسبة مئوية (مثال: 14 أو 12) ل نماذج الفواتير والـ POS والمشتريات
 * - vat_rate / service_charge_rate: كسر عشري (مثال: 0.14 أو 0.12) لنقطة البيع للتجزئة وطباعة الفواتير
 */
export function normalizeCompanySettings(
  raw: Record<string, any> | null | undefined,
  orgObj?: Record<string, any> | null
): Record<string, any> {
  if (!raw || typeof raw !== 'object') return {};

  let vatRateNum = 14;
  if (raw.vatRate !== undefined && raw.vatRate !== null) {
    vatRateNum = Number(raw.vatRate);
  } else if (raw.vat_rate !== undefined && raw.vat_rate !== null) {
    vatRateNum = Number(raw.vat_rate);
  }
  const vatRatePercentage = vatRateNum <= 1 ? Number((vatRateNum * 100).toFixed(4)) : Number(vatRateNum.toFixed(4));
  const vatRateDecimal = Number((vatRatePercentage / 100).toFixed(6));

  const isTaxEnabled = raw.enableTax !== undefined
    ? Boolean(raw.enableTax)
    : (raw.enable_tax !== undefined ? Boolean(raw.enable_tax) : true);

  const isServiceChargeEnabled = raw.enableServiceCharge !== undefined
    ? Boolean(raw.enableServiceCharge)
    : (raw.enable_service_charge !== undefined
        ? Boolean(raw.enable_service_charge)
        : (raw.account_mappings?.enable_service_charge !== undefined
            ? Boolean(raw.account_mappings.enable_service_charge)
            : false));

  let serviceRateNum = 12;
  if (raw.serviceChargeRate !== undefined && raw.serviceChargeRate !== null) {
    serviceRateNum = Number(raw.serviceChargeRate);
  } else if (raw.service_charge_rate !== undefined && raw.service_charge_rate !== null) {
    serviceRateNum = Number(raw.service_charge_rate);
  } else if (raw.account_mappings?.service_charge_rate !== undefined && raw.account_mappings?.service_charge_rate !== null) {
    serviceRateNum = Number(raw.account_mappings.service_charge_rate);
  }
  const serviceChargeRatePercentage =
    serviceRateNum <= 1 && serviceRateNum > 0
      ? Number((serviceRateNum * 100).toFixed(4))
      : Number(serviceRateNum.toFixed(4));
  const serviceChargeRateDecimal = Number((serviceChargeRatePercentage / 100).toFixed(6));

  const isLenzaOrg = isLenzaOrganization(orgObj, raw);
  const allowNegativeStock = raw.allowNegativeStock !== undefined
    ? Boolean(raw.allowNegativeStock)
    : (raw.allow_negative_stock !== undefined ? Boolean(raw.allow_negative_stock) : isLenzaOrg);

  const lockManualPrices = raw.lockManualPrices !== undefined
    ? Boolean(raw.lockManualPrices)
    : (raw.lock_manual_prices !== undefined ? Boolean(raw.lock_manual_prices) : false);

  const maxCashDeficitLimit = raw.maxCashDeficitLimit !== undefined && raw.maxCashDeficitLimit !== null
    ? Number(raw.maxCashDeficitLimit)
    : (raw.max_cash_deficit_limit !== undefined && raw.max_cash_deficit_limit !== null ? Number(raw.max_cash_deficit_limit) : 50);

  const decimalPlaces = raw.decimalPlaces !== undefined && raw.decimalPlaces !== null
    ? Number(raw.decimalPlaces)
    : (raw.decimal_places !== undefined && raw.decimal_places !== null ? Number(raw.decimal_places) : 2);

  const currency = raw.currency || 'EGP';

  return {
    ...raw,
    currency,
    enableTax: isTaxEnabled,
    enable_tax: isTaxEnabled,
    vatRate: vatRatePercentage,
    vat_rate: vatRateDecimal,
    vatRatePercentage,
    vatRateDecimal,
    enableServiceCharge: isServiceChargeEnabled,
    enable_service_charge: isServiceChargeEnabled,
    serviceChargeRate: serviceChargeRatePercentage,
    service_charge_rate: serviceChargeRateDecimal,
    serviceRatePercentage: serviceChargeRatePercentage,
    serviceRateDecimal: serviceChargeRateDecimal,
    allowNegativeStock,
    allow_negative_stock: allowNegativeStock,
    lockManualPrices,
    lock_manual_prices: lockManualPrices,
    maxCashDeficitLimit,
    max_cash_deficit_limit: maxCashDeficitLimit,
    decimalPlaces,
    decimal_places: decimalPlaces,
    defaultWarehouseId: raw.defaultWarehouseId || raw.default_warehouse_id || '',
    default_warehouse_id: raw.default_warehouse_id || raw.defaultWarehouseId || '',
    defaultTreasuryId: raw.defaultTreasuryId || raw.default_treasury_id || '',
    default_treasury_id: raw.default_treasury_id || raw.defaultTreasuryId || '',
    productionWarehouseId: raw.productionWarehouseId || raw.production_warehouse_id || '',
    production_warehouse_id: raw.production_warehouse_id || raw.productionWarehouseId || '',
    rawMaterialsWarehouseId: raw.rawMaterialsWarehouseId || raw.raw_material_warehouse_id || '',
    raw_material_warehouse_id: raw.raw_material_warehouse_id || raw.rawMaterialsWarehouseId || '',
    accountMappings: raw.accountMappings || raw.account_mappings || {},
    lastClosedYear: raw.lastClosedYear !== undefined && raw.lastClosedYear !== null
      ? Number(raw.lastClosedYear)
      : (raw.last_closed_year !== undefined && raw.last_closed_year !== null ? Number(raw.last_closed_year) : null),
    last_closed_year: raw.last_closed_year !== undefined && raw.last_closed_year !== null
      ? Number(raw.last_closed_year)
      : (raw.lastClosedYear !== undefined && raw.lastClosedYear !== null ? Number(raw.lastClosedYear) : null),
    lastClosedDate: raw.lastClosedDate || raw.last_closed_date || null,
    last_closed_date: raw.last_closed_date || raw.lastClosedDate || null,
  };
}

/**
 * مزامنة تفعيل البيع بالسالب تلقائياً لمرة واحدة لشركة لينزا في قاعدة البيانات
 */
export function syncLenzaNegativeStockIfNeeded(params: {
  supabaseClient: Pick<SupabaseClient, 'from'>;
  orgId?: string | null;
  orgObj?: Record<string, any> | null;
  rawSettings?: Record<string, any> | null;
  userRole?: string | null;
  syncedOrgIds: Set<string>;
}): void {
  const { supabaseClient, orgId, orgObj, rawSettings, userRole, syncedOrgIds } = params;
  const isLenzaActive = isLenzaOrganization(orgObj, rawSettings);
  const canSyncCompanySettings = ['admin', 'super_admin', 'owner'].includes(String(userRole || '').toLowerCase());
  const hasNegStockDisabled =
    Boolean(rawSettings) &&
    !rawSettings?.allow_negative_stock &&
    !rawSettings?.allowNegativeStock;

  if (
    isLenzaActive &&
    canSyncCompanySettings &&
    hasNegStockDisabled &&
    orgId &&
    orgId !== 'org-default-offline' &&
    !syncedOrgIds.has(orgId)
  ) {
    syncedOrgIds.add(orgId);
    Promise.resolve(
      supabaseClient
        .from('company_settings')
        .update({ allow_negative_stock: true })
        .eq('organization_id', orgId)
    ).then(({ error }: { error?: { message?: string } | null }) => {
      if (error) logger.warn('[Settings] Auto-sync allow_negative_stock for Lenza error:', error);
    }).catch((err: unknown) => {
      logger.warn('[Settings] Auto-sync allow_negative_stock for Lenza rejected:', err);
    });
  }
}

/**
 * دالة موحدة لتحديد حسابات النظام الافتراضية من خريطة الإعدادات أو شجرة الحسابات
 */
export function resolveSystemAccount(
  accounts: Account[],
  settings: Record<string, any> | null | undefined,
  key: string
): Account | undefined {
  const mappingId = settings?.account_mappings?.[key];
  if (mappingId) {
    const mapped = accounts.find(a => a.id === mappingId);
    if (mapped) return mapped;
  }

  const defaultCode = SYSTEM_ACCOUNTS[key as keyof typeof SYSTEM_ACCOUNTS];
  if (defaultCode) {
    const matchByExactCode = accounts.find(a => a.code === defaultCode);
    if (matchByExactCode) return matchByExactCode;
    const matchByPrefix = accounts.find(a => a.code?.startsWith(defaultCode));
    if (matchByPrefix) return matchByPrefix;
  }

  if (key === 'CUSTOMERS' || key === 'AR' || key === 'CUSTOMER') {
    return accounts.find(a => a.name?.includes('العملاء') || a.name?.includes('عملاء') || a.name?.toLowerCase().includes('customer') || a.name?.toLowerCase().includes('receivable') || a.code === '1221' || a.code === '1103' || a.code === '121' || a.code?.startsWith('122') || a.code?.startsWith('1103'));
  }
  if (key === 'SUPPLIERS' || key === 'AP' || key === 'SUPPLIER') {
    return accounts.find(a => a.name?.includes('الموردين') || a.name?.includes('موردين') || a.name?.toLowerCase().includes('supplier') || a.name?.toLowerCase().includes('payable') || a.code === '201' || a.code === '2101' || a.code === '221' || a.code?.startsWith('201') || a.code?.startsWith('2101'));
  }
  if (key === 'CASH' || key === 'TREASURY') {
    return accounts.find(a => a.name?.includes('الخزينة') || a.name?.includes('النقدية') || a.name?.includes('الصندوق') || a.name?.toLowerCase().includes('cash') || a.code === '1231' || a.code === '10101' || a.code === '123' || a.code?.startsWith('1231') || a.code?.startsWith('10101'));
  }
  if (key === 'VAT' || key === 'VAT_OUTPUT') {
    return accounts.find(a => (a.name?.includes('القيمة المضافة') || a.name?.includes('ضريبة المبيعات') || a.code === '2231' || a.code === '2105' || a.code?.startsWith('2231')) && !a.name?.includes('مدخلات') && !a.name?.includes('مشتريات'));
  }
  if (key === 'VAT_INPUT') {
    return accounts.find(a => a.name?.includes('مدخلات') || a.name?.includes('مشتريات') || a.code === '1241' || a.code === '1105');
  }
  if (key === 'OPENING_BALANCES') {
    return accounts.find(a => a.name?.includes('أرصدة افتتاحية') || a.name?.includes('افتتاحي') || a.name?.includes('افتتاحية') || a.name?.toLowerCase().includes('opening') || a.code === '3999' || a.code === '313' || a.code?.startsWith('39') || a.code?.startsWith('300'));
  }
  if (key === 'INVENTORY_FINISHED_GOODS' || key === 'INVENTORY') {
    return accounts.find(a => a.code === '10302' || a.code === '1213' || a.code === '103' || a.code === '122' || a.code === '121' || a.name?.includes('بضائع بغرض البيع') || a.name?.includes('منتج تام') || a.name?.includes('تام الصنع') || a.name?.includes('المخزون') || a.name?.includes('مخزون'));
  }
  if (key === 'INVENTORY_RAW_MATERIALS') {
    return accounts.find(a => a.code === '10301' || a.code === '1211' || a.code === '103' || a.name?.includes('خامات') || a.name?.includes('مواد خام') || a.name?.includes('المخزون') || a.name?.includes('مخزون'));
  }
  if (key === 'COGS') {
    return accounts.find(a => a.code === '511' || a.code === '311' || a.code?.startsWith('51') || a.name?.includes('تكلفة المبيعات') || a.name?.includes('تكلفة البضاعة'));
  }
  if (key === 'SALES_REVENUE') {
    return accounts.find(a => a.code === '411' || a.code === '41' || a.code?.startsWith('41') || a.name?.includes('المبيعات') || a.name?.includes('إيراد المبيعات'));
  }
  if (key === 'NOTES_RECEIVABLE') {
    return accounts.find(a => a.name?.includes('أوراق القبض') || a.name?.includes('أوراق قبض') || a.name?.includes('شيكات واردة') || a.name?.includes('تحت التحصيل') || a.code === '1222' || a.code?.startsWith('10103') || a.code?.startsWith('1231'));
  }
  if (key === 'NOTES_PAYABLE') {
    return accounts.find(a => a.name?.includes('أوراق الدفع') || a.name?.includes('أوراق دفع') || a.name?.includes('شيكات صادرة') || a.code === '222' || a.code?.startsWith('20102') || a.code?.startsWith('2202'));
  }
  if (key === 'BANK_ACCOUNTS' || key === 'BANK_MAIN') {
    return accounts.find(a => a.name?.includes('بنك') || a.name?.toLowerCase().includes('bank') || a.code?.startsWith('1232') || a.code?.startsWith('10102'));
  }
  if (key === 'INVENTORY_ADJUSTMENTS' || key === 'WASTAGE_EXPENSE' || key === 'INVENTORY_REVALUATION') {
    return accounts.find(a => (a.code === '512' || a.code === '5121' || a.name?.includes('تسويات الجرد') || a.name?.includes('عجز المخزون') || a.name?.includes('الهالك والفاقد') || a.name?.includes('تكلفة الهالك')) && !a.name?.includes('ضريب') && !a.code?.startsWith('223') && !a.code?.startsWith('124'));
  }
  if (key === 'CASH_SHORTAGE') {
    return accounts.find(a => (a.code === '541' || a.name?.includes('عجز الصندوق') || a.name?.includes('عجز الخزينة')) && !a.name?.includes('ضريب') && !a.code?.startsWith('223'));
  }
  if (key === 'REVENUE_OTHER' || key === 'OTHER_REVENUE') {
    return accounts.find(a => (a.code === '421' || a.code === '441' || a.name?.includes('إيرادات متنوعة') || a.name?.includes('إيرادات أخرى')) && !a.name?.includes('ضريب'));
  }
  if (key === 'LETTER_OF_GUARANTEE_MARGIN') {
    return accounts.find(a =>
      a.code === '1248' ||
      a.code?.startsWith('1248') ||
      a.name?.includes('غطاء خطابات ضمان') ||
      a.name?.includes('غطاء خطابات الضمان') ||
      a.name?.includes('غطاء الضمان')
    );
  }
  if (key === 'LETTER_OF_CREDIT_GOODS') {
    return accounts.find(a =>
      a.code === '1246' ||
      a.code?.startsWith('1246') ||
      a.name?.includes('اعتمادات مستندية') ||
      a.name?.includes('اعتماد مستندي') ||
      a.name?.includes('خطابات اعتماد')
    );
  }
  return undefined;
}

/**
 * دالة مساعدة عامة لجلب كافة سجلات الجداول الكبيرة التي تتجاوز حد 1000 سجل في Supabase/PostgREST
 */
export async function fetchAllTableRecords<T = any>(
  tableName: string,
  filterFn: (query: DynamicQuery) => DynamicQuery,
  pageSize = 1000
): Promise<{ data: T[]; error: DynamicParam }> {
  let allData: T[] = [];
  let from = 0;
  let hasMore = true;

  while (hasMore) {
    let query = supabase.from(tableName).select('*');
    query = filterFn(query);
    let res: { data: T[] | null; error: unknown };
    if (typeof query.range === 'function') {
      res = await query.range(from, from + pageSize - 1);
    } else {
      res = await query;
      hasMore = false;
    }
    const { data, error } = res;

    if (error) {
      logger.error(`Error fetching ${tableName} chunk:`, error);
      return { data: allData, error };
    }

    if (data && data.length > 0) {
      allData = allData.concat(data as T[]);
      if (data.length < pageSize || typeof query.range !== 'function') {
        hasMore = false;
      } else {
        from += pageSize;
      }
    } else {
      hasMore = false;
    }
  }

  return { data: allData, error: null };
}

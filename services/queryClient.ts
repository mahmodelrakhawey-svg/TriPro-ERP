/**
 * ==============================================================================
 * TriPro ERP — Centralized TanStack Query Client & Server State Standardization
 * services/queryClient.ts
 * ==============================================================================
 * موحد إدارة الحالة السحابية (Server State) لجميع النطاقات:
 * - يدير الكاش المركزي بـ Stale Time محدد وترشيد الـ Egress في سوباباز
 * - يمنع الجلب المتكرر غير الضروري (Request Deduping) عبر الذاكرة الموحدة
 * - يوفر مفاتيح استعلام قياسية موحدة (Query Keys Factory) تدعم عزل الشركات (Multi-Tenancy)
 * - يوفر دوال Invalidation تلقائية عند الحفظ والتعديل تضمن سلامة واستقرار بيانات الإنتاج (لينزا)
 * ==============================================================================
 */

import { QueryClient } from '@tanstack/react-query';

// ثوابت مدد الكاش الموحدة لترشيد استهلاك سوباباز والـ Egress
export const STALE_TIMES = {
  MASTER_DATA: 15 * 60 * 1000,    // 15 دقيقة للأصناف، الحسابات، العملاء، الموردين، والموظفين
  TRANSACTIONS: 5 * 60 * 1000,     // 5 دقائق لفواتير المبيعات والمشتريات وقيود اليومية
  DEFAULT: 10 * 60 * 1000,         // 10 دقائق افتراضي عام لترشيد البيانات الصادرة
};

// إنشاء وإعداد عميل React Query الموحد لكافة النطاقات والخدمات
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: STALE_TIMES.DEFAULT, // 10 دقائق كاش افتراضي آمن لترشيد استهلاك سوباباز
      gcTime: 60 * 60 * 1000,        // 60 دقيقة بقاء في الذاكرة
      retry: 1,                       // إعادة المحاولة مرة واحدة عند تعثر الشبكة
      refetchOnWindowFocus: false,    // منع إعادة الجلب غير الضروري عند التبديل بين النوافذ والتبويبات
      refetchOnReconnect: true,       // إعادة الجلب التلقائي عند عودة الاتصال بالإنترنت
    },
    mutations: {
      retry: 0,                       // منع تكرار العمليات المالية والحركات المحاسبية إطلاقاً
    },
  },
});

// مصنع مفاتيح الاستعلام الموحد (Query Keys Factory) المعزول بالمنظمة
export const QUERY_KEYS = {
  products: (orgId?: string | null) => ['products', orgId || 'all'] as const,
  warehouses: (orgId?: string | null) => ['warehouses', orgId || 'all'] as const,
  categories: (orgId?: string | null) => ['categories', orgId || 'all'] as const,
  transfers: (orgId?: string | null) => ['transfers', orgId || 'all'] as const,
  customers: (orgId?: string | null) => ['customers', orgId || 'all'] as const,
  suppliers: (orgId?: string | null) => ['suppliers', orgId || 'all'] as const,
  purchaseInvoices: (orgId?: string | null) => ['purchase_invoices', orgId || 'all'] as const,
  salesInvoices: (orgId?: string | null, fiscalRange?: { startDate?: string; endDate?: string } | null) =>
    ['sales_invoices', orgId || 'all', fiscalRange?.startDate || '', fiscalRange?.endDate || ''] as const,
  generalLedger: (orgId?: string | null, fiscalRange?: { startDate?: string; endDate?: string } | null) =>
    ['general_ledger', orgId || 'all', fiscalRange?.startDate || '', fiscalRange?.endDate || ''] as const,
  accounts: (orgId?: string | null) => ['accounts', orgId || 'all'] as const,
  employees: (orgId?: string | null) => ['employees', orgId || 'all'] as const,
};

// دوال إبطال الكاش الموحدة (Standard Invalidation Helpers)
export const invalidateProducts = (orgId?: string | null) => {
  if (orgId) {
    queryClient.invalidateQueries({ queryKey: ['products', orgId] });
  } else {
    queryClient.invalidateQueries({ queryKey: ['products'] });
  }
};

export const invalidateCustomers = (orgId?: string | null) => {
  if (orgId) {
    queryClient.invalidateQueries({ queryKey: ['customers', orgId] });
  } else {
    queryClient.invalidateQueries({ queryKey: ['customers'] });
  }
};

export const invalidateSuppliers = (orgId?: string | null) => {
  if (orgId) {
    queryClient.invalidateQueries({ queryKey: ['suppliers', orgId] });
  } else {
    queryClient.invalidateQueries({ queryKey: ['suppliers'] });
  }
};

export const invalidatePurchaseInvoices = (orgId?: string | null) => {
  if (orgId) {
    queryClient.invalidateQueries({ queryKey: ['purchase_invoices', orgId] });
  } else {
    queryClient.invalidateQueries({ queryKey: ['purchase_invoices'] });
  }
};

export const invalidateSalesInvoices = (orgId?: string | null) => {
  if (orgId) {
    queryClient.invalidateQueries({ queryKey: ['sales_invoices', orgId] });
  } else {
    queryClient.invalidateQueries({ queryKey: ['sales_invoices'] });
  }
};

export const invalidateGeneralLedger = (orgId?: string | null) => {
  if (orgId) {
    queryClient.invalidateQueries({ queryKey: ['general_ledger', orgId] });
  } else {
    queryClient.invalidateQueries({ queryKey: ['general_ledger'] });
  }
};

export const invalidateEmployees = (orgId?: string | null) => {
  if (orgId) {
    queryClient.invalidateQueries({ queryKey: ['employees', orgId] });
  } else {
    queryClient.invalidateQueries({ queryKey: ['employees'] });
  }
};

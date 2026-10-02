/**
 * ==============================================================================
 * TriPro ERP â€” Sales Domain Context & Hook
 * context/domains/SalesContext.tsx
 * ==============================================================================
 * Ù…Ø®ØµØµ Ù„Ø¥Ø¯Ø§Ø±Ø© Ø§Ù„Ù…Ø¨ÙŠØ¹Ø§ØªØŒ ÙÙˆØ§ØªÙŠØ± Ø§Ù„Ø¹Ù…Ù„Ø§Ø¡ØŒ Ø§Ù„Ù…Ø±ØªØ¬Ø¹Ø§ØªØŒ ÙˆÙ…Ù†Ø§Ø¯ÙŠØ¨ Ø§Ù„Ù…Ø¨ÙŠØ¹Ø§Øª.
 * ÙŠØ¯Ø¹Ù… Ø§Ù„Ø§Ø³ØªØ®Ø¯Ø§Ù… Ø§Ù„Ù…Ø¨Ø§Ø´Ø± Ø£Ùˆ Ø¹Ø¨Ø± ÙˆØ§Ø¬Ù‡Ø© AccountingContext Ø§Ù„Ù…ÙˆØ­Ø¯Ø© Ø¨Ù†Ù…Ø· Facade.
 * ==============================================================================
 */

import { useAccounting } from '../AccountingContext';

export interface SalesDomainState {
  invoices: any[];
  customers: any[];
  salespeople: any[];
  approveInvoice: (id: string, orgId?: string, warehouseId?: string) => Promise<boolean>;
  unpostSalesInvoice: (id: string, orgId?: string) => Promise<boolean>;
  deleteSalesInvoice: (id: string, orgId?: string) => Promise<boolean>;
  addCustomer: (customer: Record<string, any>) => Promise<Record<string, any>>;
}

export const useSalesDomain = (): SalesDomainState => {
  const acc = useAccounting() as any;
  return {
    invoices: acc.invoices || [],
    customers: acc.customers || [],
    salespeople: acc.salespeople || [],
    approveInvoice: acc.approveInvoice,
    unpostSalesInvoice: acc.unpostSalesInvoice,
    deleteSalesInvoice: acc.deleteSalesInvoice,
    addCustomer: acc.addCustomer,
  };
};

export default useSalesDomain;

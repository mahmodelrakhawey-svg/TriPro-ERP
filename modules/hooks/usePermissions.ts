import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { supabase } from '../../services/supabaseClient';

// 1. جلب المنتجات
export const useProducts = () => {
  return useQuery({
    queryKey: ['products'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('products')
        .select('*')
        .is('deleted_at', null)
        .order('name');
      
      if (error) throw error;
      return data;
    },
    staleTime: 1000 * 60 * 5, // 5 دقائق
  });
};

// 2. جلب العملاء (مع دعم البحث في السيرفر)
export const useCustomers = (searchTerm: string = '') => {
  return useQuery({
    queryKey: ['customers', searchTerm], // إعادة الجلب عند تغيير كلمة البحث
    queryFn: async () => {
      let query = supabase
        .from('customers')
        .select('*')
        .is('deleted_at', null);

      if (searchTerm) {
        query = query.ilike('name', `%${searchTerm}%`);
      }

      const { data, error } = await query.order('name');
      
      if (error) throw error;
      return data;
    },
    staleTime: 1000 * 60 * 5,
  });
};

// 5. جلب القيود اليومية مع الترحيل والبحث
export const useJournalEntries = (page: number = 1, pageSize: number = 20, searchTerm: string = '') => {
  return useQuery({
    queryKey: ['journal_entries', page, pageSize, searchTerm],
    queryFn: async () => {
      let query = supabase
        .from('journal_entries')
        .select('*, journal_lines(*)', { count: 'exact' });

      if (searchTerm) {
        query = query.or(`reference.ilike.%${searchTerm}%,description.ilike.%${searchTerm}%`);
      }

      const from = (page - 1) * pageSize;
      const to = from + pageSize - 1;

      const { data, count, error } = await query
        .order('transaction_date', { ascending: false })
        .range(from, to);
      
      if (error) throw error;
      return { data, count };
    },
    placeholderData: keepPreviousData,
  });
};

// 7. جلب أعلى المنتجات مبيعاً
export const useTopSellingProducts = (limit: number = 5) => {
  return useQuery({
    queryKey: ['top_selling_products', limit],
    queryFn: async () => {
      const { data: items, error } = await supabase
        .from('invoice_items')
        .select('product_id, quantity, products(name, sku)')
        .not('product_id', 'is', null);

      if (error) throw error;

      const productSales: { [key: string]: { name: string; sku: string | null; totalQuantity: number } } = {};

      items.forEach(item => {
        if (item.product_id && item.products) {
          if (!productSales[item.product_id]) {
            const prod = Array.isArray(item.products) ? item.products[0] : item.products;
            productSales[item.product_id] = {
              name: prod?.name,
              sku: prod?.sku,
              totalQuantity: 0,
            };
          }
          productSales[item.product_id].totalQuantity += item.quantity || 0;
        }
      });

      const sortedProducts = Object.values(productSales)
        .sort((a, b) => b.totalQuantity - a.totalQuantity)
        .slice(0, limit);

      return sortedProducts;
    },
    staleTime: 1000 * 60 * 30, // Cache for 30 minutes
  });
};

// 8. جلب أعلى العملاء شراءً
export const useTopCustomers = (limit: number = 5) => {
  return useQuery({
    queryKey: ['top_customers', limit],
    queryFn: async () => {
      const { data: invoices, error } = await supabase
        .from('invoices')
        .select('customer_id, total_amount, customers(name)')
        .neq('status', 'draft');

      if (error) throw error;

      const customerSales: { [key: string]: { name: string; totalAmount: number } } = {};

      invoices.forEach(inv => {
        if (inv.customer_id && inv.customers) {
          if (!customerSales[inv.customer_id]) {
            const cust = Array.isArray(inv.customers) ? inv.customers[0] : inv.customers;
            customerSales[inv.customer_id] = {
              name: cust?.name,
              totalAmount: 0,
            };
          }
          customerSales[inv.customer_id].totalAmount += inv.total_amount || 0;
        }
      });

      const sortedCustomers = Object.values(customerSales)
        .sort((a, b) => b.totalAmount - a.totalAmount)
        .slice(0, limit);

      return sortedCustomers;
    },
    staleTime: 1000 * 60 * 30, // Cache for 30 minutes
  });
};

// 9. جلب أوامر الشراء مع الترحيل والبحث
export const usePurchaseOrders = (page: number = 1, pageSize: number = 20, searchTerm: string = '') => {
  return useQuery({
    queryKey: ['purchase_orders', page, pageSize, searchTerm],
    queryFn: async () => {
      let query = supabase
        .from('purchase_orders')
        .select('*, suppliers(name)', { count: 'exact' });

      if (searchTerm) {
        query = query.ilike('po_number', `%${searchTerm}%`);
      }

      const from = (page - 1) * pageSize;
      const to = from + pageSize - 1;

      const { data, count, error } = await query
        .order('order_date', { ascending: false })
        .range(from, to);
      
      if (error) throw error;
      return { data, count };
    },
    placeholderData: keepPreviousData,
  });
};

// 10. جلب ملخص الفواتير للوحة القيادة (آخر 5)
export const useRecentInvoices = () => {
  return useQuery({
    queryKey: ['recent_invoices'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('invoices')
        .select('id, invoice_number, invoice_date, total_amount, status, customers(name)')
        .order('invoice_date', { ascending: false })
        .limit(5);
      
      if (error) throw error;
      return data.map((inv: any) => ({
        id: inv.id,
        invoiceNumber: inv.invoice_number,
        date: inv.invoice_date,
        totalAmount: inv.total_amount,
        status: inv.status,
        customerName: inv.customers?.name
      }));
    },
    staleTime: 1000 * 60 * 5,
  });
};

// 11. جلب إحصائيات الشهر الحالي
export const useMonthlyStats = () => {
  return useQuery({
    queryKey: ['monthly_stats'],
    queryFn: async () => {
      const startOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0];
      
      const [salesRes, purchasesRes] = await Promise.all([
        supabase.from('invoices').select('total_amount').gte('invoice_date', startOfMonth).neq('status', 'draft'),
        supabase.from('purchase_invoices').select('total_amount').gte('invoice_date', startOfMonth).neq('status', 'draft')
      ]);

      return {
        monthSales: salesRes.data?.reduce((sum, i) => sum + (i.total_amount || 0), 0) || 0,
        monthPurchases: purchasesRes.data?.reduce((sum, i) => sum + (i.total_amount || 0), 0) || 0
      };
    },
    staleTime: 1000 * 60 * 10,
  });
};

// 4. جلب الفواتير مع الترحيل والبحث
export const useInvoices = (page: number = 1, pageSize: number = 20, searchTerm: string = '') => {
  return useQuery({
    queryKey: ['invoices', page, pageSize, searchTerm],
    queryFn: async () => {
      let query = supabase
        .from('invoices')
        .select('*, customers(name)', { count: 'exact' });

      if (searchTerm) {
        query = query.ilike('invoice_number', `%${searchTerm}%`);
      }

      const from = (page - 1) * pageSize;
      const to = from + pageSize - 1;

      const { data, count, error } = await query
        .order('invoice_date', { ascending: false })
        .range(from, to);
      
      if (error) throw error;
      return { data, count };
    },
    placeholderData: keepPreviousData, // الحفاظ على البيانات السابقة أثناء جلب الصفحة التالية
  });
};

// 3. جلب الموردين (مع دعم البحث في السيرفر)
export const useSuppliers = (searchTerm: string = '') => {
  return useQuery({
    queryKey: ['suppliers', searchTerm], // إعادة الجلب عند تغيير كلمة البحث
    queryFn: async () => {
      let query = supabase
        .from('suppliers')
        .select('*')
        .is('deleted_at', null);

      if (searchTerm) {
        query = query.ilike('name', `%${searchTerm}%`);
      }

      const { data, error } = await query.order('name');
      
      if (error) throw error;
      return data;
    },
    staleTime: 1000 * 60 * 5,
  });
};

// 6. جلب تنبيهات المخزون المنخفض
export const useLowStockProducts = (threshold: number = 5) => {
  return useQuery({
    queryKey: ['low_stock_products', threshold],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('products')
        .select('id, name, sku, stock')
        .lt('stock', threshold)
        .is('deleted_at', null)
        .order('stock', { ascending: true });
      
      if (error) throw error;
      return data || [];
    },
    staleTime: 1000 * 60 * 10, // تحديث كل 10 دقائق
  });
};

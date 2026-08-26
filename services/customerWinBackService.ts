/**
 * ==============================================================================
 * Customer Win-Back & Dormant Retention Engine
 * TriPro ERP — services/customerWinBackService.ts
 * ==============================================================================
 */

export interface DormantCustomerInsight {
  customerId: string;
  customerName: string;
  phone: string;
  daysSinceLastOrder: number;
  lastOrderDate: string;
  totalOrdersCount: number;
  totalSpent: number;
  favoriteProduct?: string;
  churnRisk: 'HIGH' | 'MEDIUM' | 'LOW';
  suggestedPromoDiscount: number;
}

class CustomerWinBackService {
  /**
   * تحليل وتصنيف العملاء المنقطعين
   */
  public analyzeDormantCustomers(
    customers: Array<{ id: string; name: string; phone?: string }>,
    orders: Array<{ customer_id?: string; created_at: string; grand_total: number; items?: any[] }>
  ): DormantCustomerInsight[] {
    const now = Date.now();
    const customerOrdersMap: Record<string, typeof orders> = {};

    orders.forEach(o => {
      if (o.customer_id) {
        if (!customerOrdersMap[o.customer_id]) customerOrdersMap[o.customer_id] = [];
        customerOrdersMap[o.customer_id].push(o);
      }
    });

    const insights: DormantCustomerInsight[] = [];

    customers.forEach(c => {
      const custOrders = customerOrdersMap[c.id];
      if (!custOrders || custOrders.length === 0) return;

      // Sort by latest order
      custOrders.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      const latestOrder = custOrders[0];
      const daysSince = Math.floor((now - new Date(latestOrder.created_at).getTime()) / (1000 * 60 * 60 * 24));

      if (daysSince >= 15) {
        // عميل منقطع أكثر من 15 يوم
        const totalSpent = custOrders.reduce((sum, o) => sum + Number(o.grand_total || 0), 0);
        const churnRisk = daysSince >= 60 ? 'HIGH' : daysSince >= 30 ? 'MEDIUM' : 'LOW';
        const suggestedDiscount = churnRisk === 'HIGH' ? 25 : churnRisk === 'MEDIUM' ? 20 : 15;

        insights.push({
          customerId: c.id,
          customerName: c.name,
          phone: c.phone || '',
          daysSinceLastOrder: daysSince,
          lastOrderDate: latestOrder.created_at,
          totalOrdersCount: custOrders.length,
          totalSpent: Number(totalSpent.toFixed(2)),
          churnRisk,
          suggestedPromoDiscount: suggestedDiscount
        });
      }
    });

    return insights.sort((a, b) => b.daysSinceLastOrder - a.daysSinceLastOrder);
  }

  /**
   * إنشاء رسالة إعادة الاستهداف لـ WhatsApp
   */
  public generateWinBackMessage(customer: DormantCustomerInsight, restaurantName: string): string {
    return `مرحباً ${customer.customerName} ❤️، اشتقنا لك في ${restaurantName}! 🍕🥩\nلقد مر ${customer.daysSinceLastOrder} يوماً على آخر زيارة لك، ويسعدنا تقديم خصم خاص ${customer.suggestedPromoDiscount}% على طلبك القادم بكود: WINBACK${customer.suggestedPromoDiscount}.\nنتشرف بزيارتك أو طلبك في أي وقت!`;
  }
}

export const customerWinBackService = new CustomerWinBackService();

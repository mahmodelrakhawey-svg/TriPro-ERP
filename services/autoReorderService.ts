/**
 * ==============================================================================
 * Automated Reorder & Safety Stock Engine
 * TriPro ERP — services/autoReorderService.ts
 * ==============================================================================
 */

import { supabase } from '../supabaseClient';
import { Product } from '../types';

export interface ReorderItemRecommendation {
  productId: string;
  productName: string;
  sku: string;
  unit: string;
  currentStock: number;
  minSafetyStock: number;
  reorderQuantity: number;
  lastPurchasePrice: number;
  preferredSupplierId?: string;
  preferredSupplierName?: string;
  estimatedCost: number;
  urgency: 'CRITICAL' | 'LOW_STOCK' | 'NORMAL';
}

class AutoReorderService {
  /**
   * مسح وتحديد الأصناف التي هبطت عن حد الأمان وتوليد مقترحات أوامر الشراء
   */
  public analyzeReorderNeeds(
    products: Product[],
    suppliers: Array<{ id: string; name: string }>
  ): ReorderItemRecommendation[] {
    const recommendations: ReorderItemRecommendation[] = [];

    products.forEach(p => {
      // فحص المواد الخام والسلع المخزنية
      if (p.product_type !== 'RAW_MATERIAL' && p.product_type !== 'STOCK') return;

      const currentStock = Number(p.stock || 0);
      const minStock = Number((p as any).min_stock || (p as any).reorder_level || 10);
      const targetMax = Number((p as any).max_stock || minStock * 3);

      if (currentStock <= minStock) {
        const neededQty = Math.max(1, targetMax - currentStock);
        const unitPrice = Number(p.purchase_price || p.cost || 0);
        const estimatedCost = Number((neededQty * unitPrice).toFixed(2));

        const supplier = (p as any).supplier_id
          ? suppliers.find(s => s.id === (p as any).supplier_id)
          : suppliers[0];

        const urgency: ReorderItemRecommendation['urgency'] =
          currentStock <= 0 ? 'CRITICAL' : currentStock <= minStock * 0.5 ? 'LOW_STOCK' : 'NORMAL';

        recommendations.push({
          productId: p.id,
          productName: p.name,
          sku: p.sku || '',
          unit: p.unit || 'وحدة',
          currentStock,
          minSafetyStock: minStock,
          reorderQuantity: neededQty,
          lastPurchasePrice: unitPrice,
          preferredSupplierId: supplier?.id,
          preferredSupplierName: supplier?.name || 'مورد عام',
          estimatedCost,
          urgency
        });
      }
    });

    return recommendations.sort((a, b) => (a.currentStock <= 0 ? -1 : 1));
  }

  /**
   * إنشاء مسودات أوامر شراء آلية مجمعة للموردين
   */
  public async generateDraftPurchaseOrders(
    recommendations: ReorderItemRecommendation[],
    organizationId?: string,
    createdById?: string
  ): Promise<{ success: boolean; createdOrdersCount: number; createdOrders: any[]; errors?: string[] }> {
    // Group recommendations by supplier
    const supplierGroups: Record<string, ReorderItemRecommendation[]> = {};

    recommendations.forEach(rec => {
      const supId = rec.preferredSupplierId || 'general_supplier';
      if (!supplierGroups[supId]) supplierGroups[supId] = [];
      supplierGroups[supId].push(rec);
    });

    let createdCount = 0;
    const createdOrders: any[] = [];
    const errors: string[] = [];

    for (const [supId, items] of Object.entries(supplierGroups)) {
      const totalAmount = items.reduce((sum, it) => sum + it.estimatedCost, 0);
      const supplierName = items[0]?.preferredSupplierName || 'مورد عام';
      const validSupplierId = supId !== 'general_supplier' ? supId : null;

      try {
        const poNumber = `PO-AUTO-${Date.now().toString().slice(-6)}`;
        const poPayload: any = {
          organization_id: organizationId || null,
          supplier_id: validSupplierId,
          po_number: poNumber,
          order_date: new Date().toISOString().split('T')[0],
          status: 'draft',
          total_amount: totalAmount,
          notes: `أمر شراء تم توليده تلقائياً وفق حد الأمان لنواقص المطبخ (${items.length} أصناف)`
        };

        let po: any = null;
        let poErr: any = null;

        const res1 = await supabase
          .from('purchase_orders')
          .insert(poPayload)
          .select('id, po_number, order_date, total_amount, status, notes')
          .single();

        po = res1.data;
        poErr = res1.error;

        if (poErr) {
          // Fallback schema variants
          delete poPayload.po_number;
          poPayload.order_number = poNumber;
          const retryPo = await supabase
            .from('purchase_orders')
            .insert(poPayload)
            .select('id, order_number, order_date, total_amount, status, notes')
            .single();
          po = retryPo.data;
          poErr = retryPo.error;
        }

        if (poErr) throw poErr;

        if (po) {
          createdCount++;
          createdOrders.push({
            id: po.id,
            po_number: (po as any).po_number || (po as any).order_number || poNumber,
            supplier_name: supplierName,
            items_count: items.length,
            total_amount: totalAmount,
            order_date: po.order_date || new Date().toISOString().split('T')[0],
            status: po.status || 'draft'
          });

          // Insert items with correct schema (total instead of total_price)
          const poItems = items.map(it => ({
            organization_id: organizationId || null,
            purchase_order_id: po.id,
            product_id: it.productId,
            quantity: it.reorderQuantity,
            unit_price: it.lastPurchasePrice,
            total: it.estimatedCost
          }));

          let insRes = await supabase.from('purchase_order_items').insert(poItems);
          if (insRes.error && (insRes.error.message?.includes('purchase_order_id') || insRes.error.message?.includes('order_id'))) {
            const adjusted = poItems.map(item => {
              const { purchase_order_id, ...rest } = item;
              return { ...rest, order_id: purchase_order_id };
            });
            insRes = await supabase.from('purchase_order_items').insert(adjusted);
          }
        }
      } catch (err: any) {
        errors.push(`فشل إنشاء أمر الشراء للمورد ${supplierName}: ${err.message}`);
      }
    }

    return {
      success: createdCount > 0,
      createdOrdersCount: createdCount,
      createdOrders,
      errors: errors.length > 0 ? errors : undefined
    };
  }

  /**
   * جلب أحدث أوامر الشراء المنشأة آلياً
   */
  public async getRecentAutoPurchaseOrders(organizationId?: string): Promise<any[]> {
    try {
      let query = supabase
        .from('purchase_orders')
        .select(`
          id,
          po_number,
          order_number,
          supplier_id,
          order_date,
          total_amount,
          status,
          notes,
          suppliers(id, name)
        `)
        .order('created_at', { ascending: false })
        .limit(20);

      if (organizationId) {
        query = query.eq('organization_id', organizationId);
      }

      const { data, error } = await query;
      if (error) {
        console.warn('Fetch recent auto POs notice:', error);
        return [];
      }

      return (data || []).map((o: any) => ({
        id: o.id,
        po_number: o.po_number || o.order_number || `PO-${o.id?.slice(0, 6)}`,
        supplier_name: o.suppliers?.name || 'مورد عام',
        total_amount: Number(o.total_amount || 0),
        order_date: o.order_date,
        status: o.status || 'draft',
        notes: o.notes
      }));
    } catch (e) {
      console.warn('Error fetching auto POs:', e);
      return [];
    }
  }
}

export const autoReorderService = new AutoReorderService();

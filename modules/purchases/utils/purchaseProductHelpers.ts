import type { Product } from '../../../types';
import type { ProductFormData } from '../../inventory/components/ProductFormModal';

/**
 * Generates a unique sequential SKU code against existing catalog products.
 */
export function generateUniqueSkuForProducts(products: Product[], prefix = 'SKU'): string {
  const existingSkus = new Set(
    (products || []).map((p) => (p.sku || '').trim().toUpperCase()).filter(Boolean)
  );
  let seq = (products || []).length + 1;
  let candidate = `${prefix}-${String(seq).padStart(5, '0')}`;
  while (existingSkus.has(candidate.toUpperCase())) {
    seq++;
    candidate = `${prefix}-${String(seq).padStart(5, '0')}`;
  }
  return candidate;
}

/**
 * Generates a unique random numeric barcode against existing catalog products.
 */
export function generateUniqueBarcodeForProducts(products: Product[]): string {
  const existingBarcodes = new Set(
    (products || []).map((p) => (p.barcode || '').trim()).filter(Boolean)
  );
  let candidate = '';
  do {
    const rand = Math.floor(100000000 + Math.random() * 900000000);
    candidate = String(rand);
  } while (existingBarcodes.has(candidate));
  return candidate;
}

/**
 * Filters and ranks catalog products by name, SKU, barcode, or UOM barcode.
 */
export function filterPurchaseProducts(products: Product[], termRaw: string): Product[] {
  const term = termRaw.trim().toLowerCase();
  if (!term) return [];

  return products
    .filter((p) => {
      const rec = p as unknown as Record<string, unknown>;
      const barcode2 = typeof rec.barcode2 === 'string' ? rec.barcode2.toLowerCase() : '';
      const unitBarcodes = Array.isArray(rec.unit_barcodes)
        ? (rec.unit_barcodes as Array<Record<string, unknown>>)
        : [];
      return (
        p.name.toLowerCase().includes(term) ||
        (p.sku && p.sku.toLowerCase().includes(term)) ||
        (p.barcode && p.barcode.toLowerCase().includes(term)) ||
        barcode2.includes(term) ||
        unitBarcodes.some(
          (ub) => typeof ub.barcode === 'string' && ub.barcode.toLowerCase().includes(term)
        )
      );
    })
    .sort((a, b) => {
      const aName = a.name.toLowerCase();
      const bName = b.name.toLowerCase();
      const aStarts = aName.startsWith(term);
      const bStarts = bName.startsWith(term);
      if (aStarts && !bStarts) return -1;
      if (!aStarts && bStarts) return 1;
      return aName.localeCompare(bName);
    })
    .slice(0, 10);
}

/**
 * Builds default empty state or new-product prefilled ProductFormData for quick add inside purchase form.
 */
export function buildInitialPurchaseProductFormData(params?: {
  name?: string;
  sku?: string;
  inventoryAccountId?: string;
  cogsAccountId?: string;
  salesAccountId?: string;
  openingWarehouseId?: string;
  supplierId?: string | null;
}): ProductFormData {
  return {
    name: params?.name ?? '',
    sku: params?.sku ?? '',
    barcode: '',
    sales_price: 0,
    description: '',
    purchase_price: 0,
    unit: 'قطعة',
    base_uom_id: '',
    purchase_uom_id: '',
    sale_uom_id: '',
    product_type: 'STOCK',
    inventory_account_id: params?.inventoryAccountId ?? '',
    cogs_account_id: params?.cogsAccountId ?? '',
    sales_account_id: params?.salesAccountId ?? '',
    image_url: '',
    opening_stock: 0,
    opening_warehouse_id: params?.openingWarehouseId ?? '',
    category_id: null,
    min_stock_level: 0,
    requires_serial: false,
    expiry_date: '',
    offer_price: 0,
    offer_start_date: '',
    offer_end_date: '',
    offer_max_qty: 0,
    available_modifiers: [],
    labor_cost: 0,
    overhead_cost: 0,
    is_overhead_percentage: false,
    barcode2: '',
    is_scale_item: false,
    plu_number: 0,
    scale_prefix: '22',
    shelf_location: '',
    brand: '',
    country_of_origin: '',
    age_restricted: false,
    tax_rate_override: 0,
    unit_barcodes: [],
    min_sales_price: 0,
    max_stock_level: 0,
    wholesale_price: 0,
    half_wholesale_price: 0,
    supplier_id: params?.supplierId ?? null,
    item_code_type: 'EGS',
    egs_code: '',
    eta_unit_code: '',
  };
}

/**
 * Hydrates ProductFormData from an existing Product record for editing in purchase form.
 */
export function buildEditPurchaseProductFormData(
  productRecord: Record<string, unknown>,
  fallbackSku: string,
  defaultWarehouseId: string
): ProductFormData {
  const num = (v: unknown, def = 0) => Number(v ?? def) || 0;
  const str = (v: unknown, def = '') => (typeof v === 'string' ? v : def);

  return {
    name: str(productRecord.name),
    sku: str(productRecord.sku) || fallbackSku,
    barcode: str(productRecord.barcode),
    sales_price: num(productRecord.sales_price),
    description: str(productRecord.description),
    purchase_price: num(productRecord.purchase_price ?? productRecord.cost),
    unit: str(productRecord.unit, 'قطعة'),
    base_uom_id: str(productRecord.base_uom_id),
    purchase_uom_id: str(productRecord.purchase_uom_id),
    sale_uom_id: str(productRecord.sale_uom_id),
    product_type: str(
      productRecord.product_type ?? productRecord.item_type,
      'STOCK'
    ) as ProductFormData['product_type'],
    inventory_account_id: str(productRecord.inventory_account_id),
    cogs_account_id: str(productRecord.cogs_account_id),
    sales_account_id: str(productRecord.sales_account_id),
    image_url: str(productRecord.image_url),
    opening_stock: num(productRecord.stock),
    opening_warehouse_id: defaultWarehouseId,
    category_id: typeof productRecord.category_id === 'string' ? productRecord.category_id : null,
    min_stock_level: num(productRecord.min_stock_level),
    requires_serial: Boolean(productRecord.requires_serial),
    expiry_date: str(productRecord.expiry_date),
    offer_price: num(productRecord.offer_price),
    offer_start_date: str(productRecord.offer_start_date),
    offer_end_date: str(productRecord.offer_end_date),
    offer_max_qty: num(productRecord.offer_max_qty),
    available_modifiers: Array.isArray(productRecord.available_modifiers)
      ? (productRecord.available_modifiers as unknown[])
      : [],
    labor_cost: num(productRecord.labor_cost),
    overhead_cost: num(productRecord.overhead_cost),
    is_overhead_percentage: Boolean(productRecord.is_overhead_percentage),
    barcode2: str(productRecord.barcode2),
    is_scale_item: Boolean(productRecord.is_scale_item),
    plu_number: num(productRecord.plu_number),
    scale_prefix: str(productRecord.scale_prefix, '22'),
    shelf_location: str(productRecord.shelf_location),
    brand: str(productRecord.brand),
    country_of_origin: str(productRecord.country_of_origin),
    age_restricted: Boolean(productRecord.age_restricted),
    tax_rate_override: num(productRecord.tax_rate_override),
    unit_barcodes: Array.isArray(productRecord.unit_barcodes)
      ? (productRecord.unit_barcodes as ProductFormData['unit_barcodes'])
      : [],
    min_sales_price: num(productRecord.min_sales_price),
    max_stock_level: num(productRecord.max_stock_level),
    wholesale_price: num(productRecord.wholesale_price),
    half_wholesale_price: num(productRecord.half_wholesale_price),
    supplier_id: typeof productRecord.supplier_id === 'string' ? productRecord.supplier_id : null,
    item_code_type: (productRecord.item_code_type === 'GS1' ? 'GS1' : 'EGS'),
    egs_code: str(productRecord.egs_code),
    eta_unit_code: str(productRecord.eta_unit_code),
  };
}

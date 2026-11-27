import { Product, Category } from '../../../types';
import { secureStorage } from '../../../utils/securityMiddleware';

export interface UomRecord {
  id: string;
  name: string;
  ratio: number;
  uom_type: 'reference' | 'bigger' | 'smaller' | string;
}

export interface BomLineRecord {
  product_id: string;
  raw_material_id: string;
  quantity_required: number;
  uom_id?: string | null;
  shrinkage_pct?: number | null;
}

export interface RoutingRecord {
  id: string;
  product_id: string;
  name: string;
  is_default: boolean;
  deleted_at?: string | null;
}

export interface RoutingStepRecord {
  id: string;
  routing_id: string;
  step_order: number;
  operation_name: string;
  standard_time_minutes?: number | null;
  work_center_id?: string | null;
}

export interface StepMaterialRecord {
  step_id: string;
  raw_material_id: string;
  quantity_required: number;
  uom_id?: string | null;
}

export interface DailyBatchRow {
  rowId: string;
  productId: string;
  quantity: number;
  warehouseId: string;
  notes: string;
  status?: 'idle' | 'running' | 'success' | 'error';
  orderNumber?: string;
  errorMessage?: string;
}

export interface MaterialRequirementSummary {
  rawMaterialId: string;
  materialName: string;
  sku: string;
  unit: string;
  requiredQty: number;
  availableStock: number;
  shortageQty: number;
  unitCost: number;
  estimatedCost: number;
}

export interface ProductRecipeInfo {
  source: 'routing' | 'bom' | 'none';
  routingId: string | null;
  stepsCount: number;
  materials: Array<{
    rawMaterialId: string;
    quantityRequired: number;
    uomId: string | null;
    shrinkagePct: number;
  }>;
  estimatedUnitCost: number;
}

export interface ShiftTemplateItem {
  productId: string;
  quantity: number;
  warehouseId?: string;
  notes?: string;
}

export interface ShiftTemplate {
  id: string;
  name: string;
  createdAt: string;
  items: ShiftTemplateItem[];
}

export interface BatchCalculationInput {
  rows: DailyBatchRow[];
  products: Product[];
  uoms: UomRecord[];
  routings: RoutingRecord[];
  routingSteps: RoutingStepRecord[];
  stepMaterials: StepMaterialRecord[];
  bomLines: BomLineRecord[];
}

export interface BatchCalculationResult {
  recipeByProductId: Map<string, ProductRecipeInfo>;
  materialRequirements: MaterialRequirementSummary[];
  shortages: MaterialRequirementSummary[];
  totalUnits: number;
  totalEstimatedCost: number;
  productsWithoutRecipe: string[];
}

/**
 * Generates a unified daily batch reference like DAILY-BATCH-20261127-482.
 */
export function generateBatchReference(dateStr?: string): string {
  const cleanDate = (dateStr || new Date().toISOString().split('T')[0]).replace(/-/g, '');
  const randomSuffix = Math.floor(100 + Math.random() * 900);
  return `DAILY-BATCH-${cleanDate}-${randomSuffix}`;
}

/**
 * Filters products down to finished manufactured items, intermediate/subassembly items,
 * or any non-raw/non-service product that has an active recipe/BOM or is_produced=true.
 */
export function filterManufacturableProducts(
  products: Product[] | undefined | null,
  productIdsWithRecipes?: Set<string>
): Product[] {
  return (products || []).filter((p) => {
    if (!p || (p as any).deleted_at) return false;
    const pType = String((p as any).product_type || p.item_type || '').toUpperCase();
    const mType = String((p as any).mfg_type || '').toLowerCase();
    if (pType === 'RAW_MATERIAL' || mType === 'raw' || pType === 'SERVICE') return false;
    if (productIdsWithRecipes && productIdsWithRecipes.has(p.id)) return true;
    if ((p as any).is_produced === true) return true;
    return (
      pType === 'MANUFACTURED' ||
      pType === 'INTERMEDIATE_PRODUCT' ||
      mType === 'standard' ||
      mType === 'intermediate' ||
      mType === 'subassembly' ||
      p.item_type === 'MANUFACTURED'
    );
  });
}

/**
 * Mirrors PostgreSQL public.uom_convert(p_qty, p_from_uom_id, p_to_uom_id).
 */
export function convertUomQuantity(
  qty: number,
  fromUomId: string | null | undefined,
  toUomId: string | null | undefined,
  uomsMap: Map<string, UomRecord>
): number {
  if (!qty) return 0;
  if (!fromUomId || !toUomId || fromUomId === toUomId) return qty;

  const fromUom = uomsMap.get(fromUomId);
  const toUom = uomsMap.get(toUomId);
  if (!fromUom || !toUom) return qty;

  let fromRatio = Number(fromUom.ratio) || 1;
  let toRatio = Number(toUom.ratio) || 1;

  if (fromUom.uom_type === 'smaller' && fromRatio > 0) {
    fromRatio = 1 / fromRatio;
  }
  if (toUom.uom_type === 'smaller' && toRatio > 0) {
    toRatio = 1 / toRatio;
  }

  return Number(((qty * fromRatio) / (toRatio || 1)).toFixed(4));
}

function getEffectiveUnitCost(product: Product | undefined): number {
  if (!product) return 0;
  const wac = Number((product as any).weighted_average_cost || 0);
  if (wac > 0) return wac;
  const cost = Number(product.cost || 0);
  if (cost > 0) return cost;
  return Number(product.purchase_price || 0);
}

/**
 * Resolves the effective manufacturing recipe (preferring active default routing,
 * falling back to bill_of_materials) and aggregates raw material requirements across all rows.
 */
export function calculateBatchMaterialRequirements(input: BatchCalculationInput): BatchCalculationResult {
  const { rows, products, uoms, routings, routingSteps, stepMaterials, bomLines } = input;

  const productMap = new Map<string, Product>();
  for (const p of products || []) {
    if (p?.id) productMap.set(p.id, p);
  }

  const uomsMap = new Map<string, UomRecord>();
  for (const u of uoms || []) {
    if (u?.id) uomsMap.set(u.id, u);
  }

  // Group routing steps by routing_id
  const stepsByRouting = new Map<string, RoutingStepRecord[]>();
  for (const step of routingSteps || []) {
    const list = stepsByRouting.get(step.routing_id) || [];
    list.push(step);
    stepsByRouting.set(step.routing_id, list);
  }

  // Group step materials by step_id
  const materialsByStep = new Map<string, StepMaterialRecord[]>();
  for (const sm of stepMaterials || []) {
    const list = materialsByStep.get(sm.step_id) || [];
    list.push(sm);
    materialsByStep.set(sm.step_id, list);
  }

  // Group BOM lines by product_id
  const bomByProduct = new Map<string, BomLineRecord[]>();
  for (const bom of bomLines || []) {
    const list = bomByProduct.get(bom.product_id) || [];
    list.push(bom);
    bomByProduct.set(bom.product_id, list);
  }

  // Group active routings by product_id (default routing preferred)
  const routingByProduct = new Map<string, RoutingRecord>();
  for (const r of routings || []) {
    if (r.deleted_at) continue;
    const existing = routingByProduct.get(r.product_id);
    if (!existing || (!existing.is_default && r.is_default)) {
      routingByProduct.set(r.product_id, r);
    }
  }

  const resolveProductRecipe = (productId: string): ProductRecipeInfo => {
    const routing = routingByProduct.get(productId);
    const steps = routing ? (stepsByRouting.get(routing.id) || []) : [];
    const routingMaterials: ProductRecipeInfo['materials'] = [];

    for (const step of steps) {
      const mats = materialsByStep.get(step.id) || [];
      for (const m of mats) {
        routingMaterials.push({
          rawMaterialId: m.raw_material_id,
          quantityRequired: Number(m.quantity_required) || 0,
          uomId: m.uom_id || null,
          shrinkagePct: 0,
        });
      }
    }

    if (routing && steps.length > 0 && routingMaterials.length > 0) {
      let unitMaterialCost = 0;
      for (const mat of routingMaterials) {
        const rawProd = productMap.get(mat.rawMaterialId);
        const baseQty = convertUomQuantity(mat.quantityRequired, mat.uomId, (rawProd as any)?.base_uom_id, uomsMap);
        unitMaterialCost += baseQty * getEffectiveUnitCost(rawProd);
      }
      const prod = productMap.get(productId);
      const fallbackCost = getEffectiveUnitCost(prod);
      return {
        source: 'routing',
        routingId: routing.id,
        stepsCount: steps.length,
        materials: routingMaterials,
        estimatedUnitCost: unitMaterialCost > 0 ? Number(unitMaterialCost.toFixed(4)) : fallbackCost,
      };
    }

    const bom = bomByProduct.get(productId) || [];
    if (bom.length > 0) {
      const bomMats = bom.map((b) => ({
        rawMaterialId: b.raw_material_id,
        quantityRequired: Number(b.quantity_required) || 0,
        uomId: b.uom_id || null,
        shrinkagePct: Number(b.shrinkage_pct) || 0,
      }));
      let unitMaterialCost = 0;
      for (const mat of bomMats) {
        const rawProd = productMap.get(mat.rawMaterialId);
        const qtyWithShrinkage = mat.quantityRequired * (1 + mat.shrinkagePct / 100);
        const baseQty = convertUomQuantity(qtyWithShrinkage, mat.uomId, (rawProd as any)?.base_uom_id, uomsMap);
        unitMaterialCost += baseQty * getEffectiveUnitCost(rawProd);
      }
      const prod = productMap.get(productId);
      const fallbackCost = getEffectiveUnitCost(prod);
      return {
        source: 'bom',
        routingId: routing?.id || null,
        stepsCount: steps.length,
        materials: bomMats,
        estimatedUnitCost: unitMaterialCost > 0 ? Number(unitMaterialCost.toFixed(4)) : fallbackCost,
      };
    }

    const prod = productMap.get(productId);
    return {
      source: 'none',
      routingId: routing?.id || null,
      stepsCount: steps.length,
      materials: [],
      estimatedUnitCost: getEffectiveUnitCost(prod),
    };
  };

  const recipeByProductId = new Map<string, ProductRecipeInfo>();
  const aggregatedRawQty = new Map<string, number>();
  const productsWithoutRecipeSet = new Set<string>();

  let totalUnits = 0;
  let totalEstimatedCost = 0;

  for (const row of rows || []) {
    if (!row.productId) continue;

    let recipe = recipeByProductId.get(row.productId);
    if (!recipe) {
      recipe = resolveProductRecipe(row.productId);
      recipeByProductId.set(row.productId, recipe);
    }

    const qty = Number(row.quantity) || 0;
    if (qty <= 0) continue;

    totalUnits += qty;
    totalEstimatedCost += qty * recipe.estimatedUnitCost;

    if (recipe.source === 'none') {
      productsWithoutRecipeSet.add(row.productId);
      continue;
    }

    for (const mat of recipe.materials) {
      const rawProd = productMap.get(mat.rawMaterialId);
      const qtyWithShrinkage = mat.quantityRequired * (1 + mat.shrinkagePct / 100) * qty;
      const baseQty = convertUomQuantity(qtyWithShrinkage, mat.uomId, (rawProd as any)?.base_uom_id, uomsMap);
      aggregatedRawQty.set(mat.rawMaterialId, (aggregatedRawQty.get(mat.rawMaterialId) || 0) + baseQty);
    }
  }

  const materialRequirements: MaterialRequirementSummary[] = [];
  for (const [rawId, reqQtyRaw] of aggregatedRawQty.entries()) {
    const rawProd = productMap.get(rawId);
    const requiredQty = Number(reqQtyRaw.toFixed(4));
    const availableStock = Number(rawProd?.stock ?? 0);
    const shortageQty = Number(Math.max(0, requiredQty - Math.max(0, availableStock)).toFixed(4));
    const unitCost = getEffectiveUnitCost(rawProd);

    materialRequirements.push({
      rawMaterialId: rawId,
      materialName: rawProd?.name || 'مادة خام غير معرفة',
      sku: rawProd?.sku || '',
      unit: rawProd?.unit || 'وحدة',
      requiredQty,
      availableStock,
      shortageQty,
      unitCost,
      estimatedCost: Number((requiredQty * unitCost).toFixed(2)),
    });
  }

  // Sort shortages first, then highest required cost
  materialRequirements.sort((a, b) => {
    if ((b.shortageQty > 0 ? 1 : 0) !== (a.shortageQty > 0 ? 1 : 0)) {
      return (b.shortageQty > 0 ? 1 : 0) - (a.shortageQty > 0 ? 1 : 0);
    }
    return b.estimatedCost - a.estimatedCost;
  });

  const shortages = materialRequirements.filter((m) => m.shortageQty > 0);

  return {
    recipeByProductId,
    materialRequirements,
    shortages,
    totalUnits: Number(totalUnits.toFixed(4)),
    totalEstimatedCost: Number(totalEstimatedCost.toFixed(2)),
    productsWithoutRecipe: Array.from(productsWithoutRecipeSet),
  };
}

function getTemplateStorageKey(orgId?: string | null): string {
  return `tripro_daily_batch_templates_${orgId || 'default'}`;
}

export function loadShiftTemplates(orgId?: string | null): ShiftTemplate[] {
  const stored = secureStorage.getItem<ShiftTemplate[]>(getTemplateStorageKey(orgId), []);
  return Array.isArray(stored) ? stored : [];
}

export function saveShiftTemplate(
  orgId: string | null | undefined,
  name: string,
  items: ShiftTemplateItem[]
): ShiftTemplate[] {
  const trimmedName = name.trim();
  if (!trimmedName || items.length === 0) {
    return loadShiftTemplates(orgId);
  }
  const existing = loadShiftTemplates(orgId);
  const newTemplate: ShiftTemplate = {
    id: `tpl-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    name: trimmedName,
    createdAt: new Date().toISOString(),
    items: items.map((item) => ({
      productId: item.productId,
      quantity: Number(item.quantity) || 0,
      warehouseId: item.warehouseId,
      notes: item.notes,
    })),
  };
  // Replace template with same name or prepend
  const filtered = existing.filter((t) => t.name !== trimmedName);
  const updated = [newTemplate, ...filtered];
  secureStorage.setItem(getTemplateStorageKey(orgId), updated);
  return updated;
}

export function deleteShiftTemplate(orgId: string | null | undefined, templateId: string): ShiftTemplate[] {
  const existing = loadShiftTemplates(orgId);
  const updated = existing.filter((t) => t.id !== templateId);
  secureStorage.setItem(getTemplateStorageKey(orgId), updated);
  return updated;
}

export function getCategoryNameById(categories: Category[] | undefined | null, categoryId?: string | null): string {
  if (!categoryId || !Array.isArray(categories)) return 'غير مصنف';
  return categories.find((c) => c.id === categoryId)?.name || 'غير مصنف';
}

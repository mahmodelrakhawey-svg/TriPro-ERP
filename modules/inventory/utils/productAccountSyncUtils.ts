import { supabase } from '../../../supabaseClient';
import { logger } from '../../../utils/logger';
import type { Item } from '../ProductManager';

export const FINISHED_GOODS_CATEGORY_NAMES = [
  'التورتات الغربية الفاخرة',
  'الجاتوهات والقطع',
  'الحلويات الشرقية',
  'الشيكولاتة الفاخرة والهدايا',
  'الآيس كريم والمثلجات',
];

const DEFAULT_RAW_MATERIAL_ACC = '00bc8443-0ace-40ba-82c1-ce97f6a02e15';
const DEFAULT_GENERAL_INV_ACC = '5434d458-20fe-4641-bc0f-22b8ccba0de7';
const DEFAULT_FINISHED_GOODS_ACC = '90685bba-b765-4fe4-96a5-b3963a4ec085';

type ToastFn = (msg: string, type?: string) => void;
type GetSystemAccountFn = (key: string) => { id?: string } | undefined | null;

/**
 * Checks whether an item's promotional offer is active today.
 */
export function isOfferActive(item: Item): boolean {
  const today = new Date().toISOString().split('T')[0];
  return !!(
    item.offer_price &&
    item.offer_price > 0 &&
    item.offer_start_date &&
    item.offer_end_date &&
    today >= item.offer_start_date &&
    today <= item.offer_end_date
  );
}

/**
 * Checks whether an item's promotional offer has expired.
 */
export function isOfferExpired(item: Item): boolean {
  const today = new Date().toISOString().split('T')[0];
  return !!(
    item.offer_price &&
    item.offer_price > 0 &&
    item.offer_end_date &&
    today > item.offer_end_date
  );
}

/**
 * Counts raw material products still linked to general inventory instead of raw materials account.
 */
export function countRawItemsNeedingSync(
  products: any[],
  getSystemAccount: GetSystemAccountFn,
  settings?: { account_mappings?: Record<string, string> }
): number {
  const rawMaterialAcc =
    getSystemAccount('INVENTORY_RAW_MATERIALS')?.id ||
    settings?.account_mappings?.INVENTORY_RAW_MATERIALS ||
    DEFAULT_RAW_MATERIAL_ACC;
  const generalInvAcc =
    getSystemAccount('INVENTORY')?.id ||
    settings?.account_mappings?.INVENTORY ||
    DEFAULT_GENERAL_INV_ACC;

  return (products || []).filter(
    (p) =>
      (p.product_type === 'RAW_MATERIAL' || (p as any).mfg_type === 'raw') &&
      p.inventory_account_id !== rawMaterialAcc &&
      (!p.inventory_account_id || p.inventory_account_id === generalInvAcc)
  ).length;
}

/**
 * Counts finished goods products still linked to general/raw inventory instead of finished goods account.
 */
export function countFinishedGoodsItemsNeedingSync(
  products: any[],
  categories: any[],
  getSystemAccount: GetSystemAccountFn,
  settings?: { account_mappings?: Record<string, string> }
): number {
  const finishedGoodsAcc =
    getSystemAccount('INVENTORY_FINISHED_GOODS')?.id ||
    settings?.account_mappings?.INVENTORY_FINISHED_GOODS ||
    DEFAULT_FINISHED_GOODS_ACC;
  const generalInvAcc =
    getSystemAccount('INVENTORY')?.id ||
    settings?.account_mappings?.INVENTORY ||
    DEFAULT_GENERAL_INV_ACC;
  const rawMaterialAcc =
    getSystemAccount('INVENTORY_RAW_MATERIALS')?.id ||
    settings?.account_mappings?.INVENTORY_RAW_MATERIALS ||
    DEFAULT_RAW_MATERIAL_ACC;

  const finishedCatIds = new Set(
    categories.filter((c) => FINISHED_GOODS_CATEGORY_NAMES.includes(c.name)).map((c) => c.id)
  );

  return (products || []).filter((p) => {
    const isTargetCategory = p.category_id && finishedCatIds.has(p.category_id);
    const isManufactured = p.product_type === 'MANUFACTURED' && isTargetCategory;
    const isWrongAccount =
      !p.inventory_account_id ||
      p.inventory_account_id === generalInvAcc ||
      p.inventory_account_id === rawMaterialAcc;
    return (isTargetCategory || isManufactured) && p.inventory_account_id !== finishedGoodsAcc && isWrongAccount;
  }).length;
}

/**
 * Updates inventory_account_id across product chunks with bounded concurrency.
 */
export async function batchUpdateProductsInventoryAccount(
  candidateIds: string[],
  accountId: string
): Promise<number> {
  const chunkSize = 50;
  const chunks: string[][] = [];
  for (let i = 0; i < candidateIds.length; i += chunkSize) {
    chunks.push(candidateIds.slice(i, i + chunkSize));
  }
  const CONCURRENCY = 4;
  const now = new Date().toISOString();
  let updatedTotal = 0;

  for (let i = 0; i < chunks.length; i += CONCURRENCY) {
    const batch = chunks.slice(i, i + CONCURRENCY);
    const results = await Promise.all(
      batch.map((chunk) =>
        supabase
          .from('products')
          .update({ inventory_account_id: accountId, updated_at: now })
          .in('id', chunk)
      )
    );
    for (let j = 0; j < results.length; j++) {
      if (results[j].error) throw results[j].error;
      updatedTotal += batch[j].length;
    }
  }
  return updatedTotal;
}

/**
 * Auto-generates sequential SKUs for displayed items that currently lack one.
 */
export async function autoAssignMissingSkusService(params: {
  items: Item[];
  refresh: () => Promise<any> | void;
  refreshData: () => Promise<any>;
  showToast: ToastFn;
}): Promise<boolean> {
  const { items, refresh, refreshData, showToast } = params;
  const missing = (items || []).filter((p) => !p.sku || !p.sku.trim());
  if (missing.length === 0) {
    showToast('جميع الأصناف المعروضة تحتوي بالفعل على كود (SKU)', 'info');
    return false;
  }

  if (
    !window.confirm(
      `هل تريد توليد وتعيين أكواد SKU تلقائية لـ (${missing.length}) صنف لا يمتلك كود حالياً؟`
    )
  ) {
    return false;
  }

  const existingSkus = new Set(
    (items || []).map((p) => (p.sku || '').trim().toUpperCase()).filter(Boolean)
  );
  let seq = (items || []).length + 1;
  let updatedCount = 0;

  for (const prod of missing) {
    let candidate = `SKU-${String(seq).padStart(5, '0')}`;
    while (existingSkus.has(candidate.toUpperCase())) {
      seq++;
      candidate = `SKU-${String(seq).padStart(5, '0')}`;
    }
    existingSkus.add(candidate.toUpperCase());
    seq++;

    const { error } = await supabase
      .from('products')
      .update({ sku: candidate })
      .eq('id', prod.id);

    if (!error) {
      updatedCount++;
    }
  }

  await refresh();
  await refreshData();
  showToast(`تم تعيين وتوليد أكواد SKU بنجاح لـ ${updatedCount} صنف ✅`, 'success');
  return true;
}

/**
 * Syncs raw material product accounts to raw materials inventory account (10301).
 */
export async function syncRawMaterialAccountsService(params: {
  contextProducts: any[];
  targetOrgId?: string;
  currentUser: any;
  getSystemAccount: GetSystemAccountFn;
  settings: any;
  refresh: () => Promise<any> | void;
  refreshData: () => Promise<any>;
  showToast: ToastFn;
}): Promise<void> {
  const {
    contextProducts,
    targetOrgId,
    currentUser,
    getSystemAccount,
    settings,
    refresh,
    refreshData,
    showToast,
  } = params;

  const rawMaterialAcc =
    getSystemAccount('INVENTORY_RAW_MATERIALS')?.id ||
    settings?.account_mappings?.INVENTORY_RAW_MATERIALS ||
    DEFAULT_RAW_MATERIAL_ACC;
  const generalInvAcc =
    getSystemAccount('INVENTORY')?.id ||
    settings?.account_mappings?.INVENTORY ||
    DEFAULT_GENERAL_INV_ACC;

  if (!rawMaterialAcc) {
    showToast('لم يتم العثور على حساب مخزون المواد الخام في شجرة الحسابات أو الإعدادات', 'error');
    return;
  }

  const allProds = contextProducts || [];
  const candidates = allProds.filter(
    (p) =>
      (p.product_type === 'RAW_MATERIAL' || (p as any).mfg_type === 'raw') &&
      p.inventory_account_id !== rawMaterialAcc &&
      (!p.inventory_account_id || p.inventory_account_id === generalInvAcc)
  );

  const preserved = allProds.filter(
    (p) =>
      (p.product_type === 'RAW_MATERIAL' || (p as any).mfg_type === 'raw') &&
      p.inventory_account_id === rawMaterialAcc
  );

  if (candidates.length === 0) {
    showToast('جميع أصناف المواد الخام موجهة بالفعل لحساب مخزون المواد الخام بنجاح ✅', 'info');
    return;
  }

  const confirmMsg = `هل تريد توجيه (${candidates.length}) صنف مواد خام تتبع حساب المخزون العام حالياً إلى "حساب مخزون المواد الخام"؟\n\n🛡️ صمام الأمان: سيتم الحفاظ التام على الأصناف التي تم تعديلها وتخصيصها يدوياً (${preserved.length} صنف) دون أي مساس بها.`;
  if (!window.confirm(confirmMsg)) {
    return;
  }

  const candidateIds = candidates.map((p) => p.id);
  const updatedTotal = await batchUpdateProductsInventoryAccount(candidateIds, rawMaterialAcc);

  const orgId = targetOrgId || (currentUser as any)?.organization_id;
  if (orgId) {
    await supabase
      .from('item_categories')
      .update({ default_inventory_account_id: rawMaterialAcc })
      .eq('organization_id', orgId)
      .in('name', ['خامات الحلويات الأولية', 'خامات التعبئة والتغليف']);
  }

  await refresh();
  await refreshData();
  showToast(
    `تم بنجاح توجيه ${updatedTotal} صنف خام إلى حساب مخزون المواد الخام، والحفاظ الكامل على ${preserved.length} صنف معدلة يدوياً ✅`,
    'success'
  );
}

/**
 * Syncs finished goods product accounts to finished goods inventory account (10302).
 */
export async function syncFinishedGoodsAccountsService(params: {
  contextProducts: any[];
  categories: any[];
  targetOrgId?: string;
  currentUser: any;
  getSystemAccount: GetSystemAccountFn;
  settings: any;
  refresh: () => Promise<any> | void;
  refreshData: () => Promise<any>;
  showToast: ToastFn;
}): Promise<void> {
  const {
    contextProducts,
    categories,
    targetOrgId,
    currentUser,
    getSystemAccount,
    settings,
    refresh,
    refreshData,
    showToast,
  } = params;

  const finishedGoodsAcc =
    getSystemAccount('INVENTORY_FINISHED_GOODS')?.id ||
    settings?.account_mappings?.INVENTORY_FINISHED_GOODS ||
    DEFAULT_FINISHED_GOODS_ACC;
  const generalInvAcc =
    getSystemAccount('INVENTORY')?.id ||
    settings?.account_mappings?.INVENTORY ||
    DEFAULT_GENERAL_INV_ACC;
  const rawMaterialAcc =
    getSystemAccount('INVENTORY_RAW_MATERIALS')?.id ||
    settings?.account_mappings?.INVENTORY_RAW_MATERIALS ||
    DEFAULT_RAW_MATERIAL_ACC;

  if (!finishedGoodsAcc) {
    showToast('لم يتم العثور على حساب مخزون الإنتاج التام في شجرة الحسابات أو الإعدادات', 'error');
    return;
  }

  const finishedCatIds = new Set(
    categories.filter((c) => FINISHED_GOODS_CATEGORY_NAMES.includes(c.name)).map((c) => c.id)
  );

  const allProds = contextProducts || [];
  const candidates = allProds.filter((p) => {
    const isTargetCategory = p.category_id && finishedCatIds.has(p.category_id);
    const isManufactured = p.product_type === 'MANUFACTURED' && isTargetCategory;
    const isWrongAccount =
      !p.inventory_account_id ||
      p.inventory_account_id === generalInvAcc ||
      p.inventory_account_id === rawMaterialAcc;
    return (isTargetCategory || isManufactured) && p.inventory_account_id !== finishedGoodsAcc && isWrongAccount;
  });

  const preserved = allProds.filter((p) => {
    const isTargetCategory = p.category_id && finishedCatIds.has(p.category_id);
    return isTargetCategory && p.inventory_account_id === finishedGoodsAcc;
  });

  if (candidates.length === 0) {
    showToast('جميع أصناف التورت والجاتوهات والحلويات الشرقية موجهة بالفعل لحساب مخزون الإنتاج التام بنجاح ✅', 'info');
    return;
  }

  const confirmMsg = `هل تريد توجيه (${candidates.length}) صنف من أصناف (التورت، الجاتوهات، والحلويات الشرقية) إلى "حساب مخزون الإنتاج التام (10302)"؟\n\n🛡️ صمام الأمان: سيتم الحفاظ التام على الأصناف المضبوطة مسبقاً (${preserved.length} صنف) دون أي مساس بها.`;
  if (!window.confirm(confirmMsg)) {
    return;
  }

  const candidateIds = candidates.map((p) => p.id);
  const updatedTotal = await batchUpdateProductsInventoryAccount(candidateIds, finishedGoodsAcc);

  const orgId = targetOrgId || (currentUser as any)?.organization_id;
  if (orgId) {
    await supabase
      .from('item_categories')
      .update({ default_inventory_account_id: finishedGoodsAcc })
      .eq('organization_id', orgId)
      .in('name', FINISHED_GOODS_CATEGORY_NAMES);
  }

  await refresh();
  await refreshData();
  showToast(
    `تم بنجاح توجيه ${updatedTotal} صنف (تورت وجاتوهات وشرقي) إلى حساب مخزون الإنتاج التام (10302) وتثبيت حساب التصنيفات ✅`,
    'success'
  );
}

/**
 * Generates missing opening inventory records and accounting entries for stock products.
 */
export async function syncMissingOpeningEntriesService(params: {
  orgId?: string;
  contextAccounts: any[];
  warehouses: any[];
  getSystemAccount: GetSystemAccountFn;
  addEntry: (entry: Record<string, unknown>) => Promise<unknown>;
  refreshData: () => Promise<any>;
  refresh: () => Promise<any> | void;
  showToast: ToastFn;
}): Promise<void> {
  const {
    orgId,
    contextAccounts,
    warehouses,
    getSystemAccount,
    addEntry,
    refreshData,
    refresh,
    showToast,
  } = params;

  if (!orgId) {
    showToast('يرجى تحديد المنظمة أولاً', 'warning');
    return;
  }

  const { data: allProds, error: prodsErr } = await supabase
    .from('products')
    .select('*')
    .eq('organization_id', orgId)
    .in('item_type', ['STOCK', 'RAW_MATERIAL']);

  if (prodsErr) throw prodsErr;

  if (!allProds || allProds.length === 0) {
    showToast('لا توجد أصناف مخزنية في هذه المنظمة.', 'info');
    return;
  }

  const { data: existingEntries, error: entErr } = await supabase
    .from('journal_entries')
    .select('id, description, reference, related_document_id, related_document_type')
    .eq('organization_id', orgId);

  if (entErr) throw entErr;

  const defaultInventory =
    getSystemAccount('INVENTORY_FINISHED_GOODS')?.id ||
    getSystemAccount('INVENTORY')?.id ||
    contextAccounts.find(
      (a) =>
        a.code === '10302' ||
        a.code === '1213' ||
        a.code === '103' ||
        a.name?.includes('مخزون')
    )?.id;
  const rawMaterialAcc =
    getSystemAccount('INVENTORY_RAW_MATERIALS')?.id ||
    contextAccounts.find(
      (a) => a.code === '10301' || a.code === '1211' || a.name?.includes('خامات')
    )?.id;
  const equityAcc =
    getSystemAccount('OPENING_BALANCES')?.id ||
    getSystemAccount('RETAINED_EARNINGS')?.id ||
    contextAccounts.find(
      (a) =>
        a.code === '3999' ||
        a.code === '313' ||
        a.code?.startsWith('39') ||
        a.code?.startsWith('300') ||
        a.name?.includes('أرصدة افتتاحية') ||
        a.name?.includes('افتتاحي')
    )?.id;

  if (!equityAcc) {
    throw new Error('لم يتم العثور على حساب الأرصدة الافتتاحية في الدليل المحاسبي (كود 3999 أو 313).');
  }

  const defaultWhId = warehouses.length > 0 ? warehouses[0].id : null;
  let createdCount = 0;
  const createdNames: string[] = [];

  for (const prod of allProds) {
    const hasEntry = existingEntries?.some(
      (e) =>
        e.related_document_id === prod.id ||
        (e.reference && e.reference.includes(prod.id.slice(-8))) ||
        (e.description &&
          (e.description.includes('رصيد افتتاحي') || e.description.includes('افتتاحي')) &&
          e.description.includes(prod.name))
    );

    if (!hasEntry) {
      const qty = Number(prod.stock) || Number(prod.opening_balance) || 0;
      const cost =
        Number(prod.purchase_price) ||
        Number(prod.cost) ||
        Number(prod.weighted_average_cost) ||
        0;
      const totalValue = qty * cost;

      if (qty > 0 && cost > 0 && totalValue > 0) {
        const itemInvAcc =
          prod.inventory_account_id ||
          (prod.item_type === 'RAW_MATERIAL'
            ? rawMaterialAcc || defaultInventory
            : defaultInventory);

        if (itemInvAcc) {
          let targetWh = defaultWhId;
          if (!targetWh && orgId) {
            const { data: whList } = await supabase
              .from('warehouses')
              .select('id')
              .eq('organization_id', orgId)
              .limit(1);
            targetWh = whList?.[0]?.id || null;
          }
          if (targetWh) {
            const { data: existingOp } = await supabase
              .from('opening_inventories')
              .select('id')
              .eq('product_id', prod.id)
              .maybeSingle();

            if (!existingOp) {
              await supabase.from('opening_inventories').insert({
                product_id: prod.id,
                warehouse_id: targetWh,
                quantity: qty,
                cost: cost,
                organization_id: orgId,
              });
            }
          }

          const ref = `OP-PROD-${Date.now().toString().slice(-8)}-${Math.floor(Math.random() * 1000)}`;
          const lineDesc =
            prod.item_type === 'RAW_MATERIAL'
              ? `مخزون مواد خام افتتاحي - ${prod.name}`
              : `مخزون افتتاحي - ${prod.name}`;

          await addEntry({
            date: new Date().toISOString().split('T')[0],
            description: `رصيد افتتاحي - ${prod.name}`.substring(0, 255),
            reference: ref,
            status: 'posted',
            p_org_id: orgId,
            lines: [
              { accountId: itemInvAcc, debit: totalValue, credit: 0, description: lineDesc },
              {
                accountId: equityAcc,
                debit: 0,
                credit: totalValue,
                description: `أرصدة افتتاحية - ${prod.name}`,
              },
            ],
          });
          createdCount++;
          createdNames.push(prod.name);
        }
      }
    }
  }

  if (createdCount > 0) {
    if (orgId) {
      try {
        await supabase.rpc('recalculate_all_system_balances', { p_org_id: orgId });
      } catch (e) {
        logger.error('Failed to recalculate balances', e);
      }
    }
    await refreshData();
    refresh();
    showToast(
      `تم بنجاح توليد ${createdCount} قيد افتتاحي للأصناف: (${createdNames.join('، ')}) ✅`,
      'success'
    );
  } else {
    showToast('جميع الأصناف المسجلة لديها قيود افتتاحية بالفعل، أو أن التكلفة أو الرصيد صفر.', 'info');
  }
}

import { supabase } from '../../../supabaseClient';
import { logger } from '../../../utils/logger';
import { BomLineRecord, RoutingRecord, RoutingStepRecord } from './dailyBatchUtils';

export interface CompleteOrderLifecycleParams {
  orderId: string;
  orderNumber: string;
  productId: string;
  quantity: number;
  orgId: string;
  productionDate: string;
  qcNotes: string;
  skipRecalc: boolean;
  routings?: RoutingRecord[];
  routingSteps?: RoutingStepRecord[];
  bomLines?: BomLineRecord[];
}

/**
 * Safely deletes an unfinalized draft/in-progress production order if an execution step fails.
 */
export async function cleanupFailedProductionOrder(orderId: string): Promise<void> {
  try {
    await supabase.from('mfg_order_progress').delete().eq('production_order_id', orderId);
    await supabase.from('mfg_material_requests').delete().eq('production_order_id', orderId);
    await supabase.from('mfg_production_orders').delete().eq('id', orderId);
  } catch (cleanErr) {
    logger.warn('Cleanup of failed draft production order skipped:', cleanErr);
  }
}

/**
 * Executes the full verified TriPro-ERP manufacturing lifecycle for an existing
 * mfg_production_orders row: starts order -> runs/completes routing steps
 * (or issues BOM material request when no routing exists) -> finalizes order.
 */
export async function completeOrderLifecycle(params: CompleteOrderLifecycleParams): Promise<void> {
  const {
    orderId,
    productId,
    quantity,
    orgId,
    productionDate,
    qcNotes,
    skipRecalc,
    routings,
    routingSteps,
    bomLines,
  } = params;

  // 1. Start order & generate routing steps via RPC (idempotent on draft orders)
  const { error: startOrderErr } = await supabase.rpc('mfg_start_production_order', {
    p_order_id: orderId,
  });
  if (startOrderErr) throw startOrderErr;

  // 2. Fetch existing/generated progress steps
  const { data: progressData, error: progFetchErr } = await supabase
    .from('mfg_order_progress')
    .select('id, step_id, status, produced_qty')
    .eq('production_order_id', orderId)
    .eq('organization_id', orgId);
  if (progFetchErr) throw progFetchErr;

  let progressRows = (progressData || []) as Array<{
    id: string;
    step_id: string;
    status: string;
    produced_qty?: number | null;
  }>;

  // Resolve routing steps on demand if not preloaded
  let effectiveSteps = routingSteps;
  if (progressRows.length === 0) {
    let activeRoutings = routings;
    if (!activeRoutings) {
      const { data: rtData } = await supabase
        .from('mfg_routings')
        .select('id, product_id, name, is_default, deleted_at')
        .eq('product_id', productId)
        .eq('organization_id', orgId)
        .is('deleted_at', null);
      activeRoutings = (rtData || []) as RoutingRecord[];
    }

    const matchedRouting =
      activeRoutings.find((r) => r.product_id === productId && !r.deleted_at && r.is_default) ||
      activeRoutings.find((r) => r.product_id === productId && !r.deleted_at);

    if (matchedRouting) {
      if (!effectiveSteps) {
        const { data: stData } = await supabase
          .from('mfg_routing_steps')
          .select('id, routing_id, step_order, operation_name, standard_time_minutes, work_center_id')
          .eq('routing_id', matchedRouting.id)
          .eq('organization_id', orgId)
          .order('step_order', { ascending: true });
        effectiveSteps = (stData || []) as RoutingStepRecord[];
      }

      const stepsForRouting = effectiveSteps
        .filter((s) => s.routing_id === matchedRouting.id)
        .sort((a, b) => Number(a.step_order) - Number(b.step_order));

      if (stepsForRouting.length > 0) {
        const { data: insertedProgress, error: insProgErr } = await supabase
          .from('mfg_order_progress')
          .insert(
            stepsForRouting.map((s) => ({
              production_order_id: orderId,
              step_id: s.id,
              status: 'pending',
              organization_id: orgId,
            }))
          )
          .select('id, step_id, status, produced_qty');
        if (insProgErr) throw insProgErr;
        progressRows = (insertedProgress || []) as typeof progressRows;
      }
    }
  }

  if (progressRows.length > 0) {
    const stepOrderMap = new Map((effectiveSteps || []).map((s) => [s.id, Number(s.step_order || 0)]));
    progressRows.sort((a, b) => (stepOrderMap.get(a.step_id) || 0) - (stepOrderMap.get(b.step_id) || 0));

    for (const prog of progressRows) {
      if (prog.status === 'completed') continue;

      if (prog.status === 'pending') {
        const { error: startStepErr } = await supabase.rpc('mfg_start_step', {
          p_progress_id: prog.id,
          p_employee_id: null,
        });
        if (startStepErr) throw startStepErr;
      }

      const remainingQty = Math.max(0, Number(quantity) - Number(prog.produced_qty || 0));
      if (remainingQty > 0) {
        const { error: compStepErr } = await supabase.rpc('mfg_complete_step', {
          p_progress_id: prog.id,
          p_qty: remainingQty,
        });
        if (compStepErr) throw compStepErr;
      }
    }
  } else {
    // Fallback for BOM-only products (no routing steps defined): check or issue material request
    const { data: existingMr } = await supabase
      .from('mfg_material_requests')
      .select('id, status')
      .eq('production_order_id', orderId)
      .eq('organization_id', orgId);

    const hasIssuedMr = (existingMr || []).some((mr: { status: string }) => mr.status === 'issued');
    if (!hasIssuedMr) {
      let productBom = (bomLines || []).filter((b) => b.product_id === productId);
      if (!bomLines) {
        const { data: bomData } = await supabase
          .from('bill_of_materials')
          .select('product_id, raw_material_id, quantity_required, uom_id, shrinkage_pct')
          .eq('product_id', productId)
          .eq('organization_id', orgId);
        productBom = (bomData || []) as BomLineRecord[];
      }

      if (productBom.length === 0) {
        throw new Error('لم يتم تعريف مسار إنتاج أو وصفة مكونات (BOM) لهذا الصنف');
      }

      const pendingMr = (existingMr || []).find((mr: { status: string }) => mr.status === 'pending' || mr.status === 'approved');
      let mrId = pendingMr?.id as string | undefined;

      if (!mrId) {
        mrId = crypto.randomUUID();
        const mrNumber = `MR-AUTO-${Date.now().toString().slice(-6)}-${Math.floor(10 + Math.random() * 90)}`;
        const { error: mrErr } = await supabase.from('mfg_material_requests').insert({
          id: mrId,
          production_order_id: orderId,
          request_number: mrNumber,
          request_date: productionDate,
          status: 'pending',
          organization_id: orgId,
        });
        if (mrErr) throw mrErr;

        const { error: mriErr } = await supabase.from('mfg_material_request_items').insert(
          productBom.map((m) => ({
            material_request_id: mrId!,
            raw_material_id: m.raw_material_id,
            quantity_requested: Number(
              (Number(m.quantity_required) * (1 + Number(m.shrinkage_pct || 0) / 100) * quantity).toFixed(4)
            ),
            uom_id: m.uom_id || null,
            organization_id: orgId,
          }))
        );
        if (mriErr) throw mriErr;
      }

      const { error: issueErr } = await supabase.rpc('mfg_issue_material_request', {
        p_request_id: mrId,
      });
      if (issueErr) throw issueErr;
    }
  }

  // 3. Finalize order
  const { error: finErr } = await supabase.rpc('mfg_finalize_order', {
    p_order_id: orderId,
    p_final_status: 'completed',
    p_qc_notes: qcNotes,
    p_skip_recalc: skipRecalc,
  });
  if (finErr) throw finErr;
}

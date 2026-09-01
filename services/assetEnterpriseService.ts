/**
 * ==============================================================================
 * Enterprise Fixed Assets & Construction Equipment Service (10/10)
 * TriPro ERP — services/assetEnterpriseService.ts
 * ==============================================================================
 */

import { supabase } from '../supabaseClient';
import { secureStorage } from '../utils/securityMiddleware';

export interface EnterpriseAsset {
  id: string;
  organization_id?: string | null;
  name: string;
  asset_tag: string; // Barcode / Tag code
  serial_number?: string;
  category: string; // MACHINERY, HEAVY_EQUIPMENT, VEHICLES, OFFICE, TOOLS, BUILDINGS, IT
  purchase_date: string;
  purchase_cost: number;
  salvage_value: number;
  useful_life_years: number;
  accumulated_depreciation?: number;
  book_value?: number;
  project_id?: string | null; // Construction project
  project_name?: string | null;
  current_location: string;
  custodian_id?: string | null;
  custodian_name?: string | null;
  asset_condition: 'EXCELLENT' | 'GOOD' | 'FAIR' | 'NEEDS_MAINTENANCE' | 'DAMAGED' | 'OUT_OF_SERVICE';
  hourly_operating_cost?: number; // تكلفة ساعة تشغيل المعدة في المقاولات
  last_audit_date?: string | null;
  last_audit_status?: 'VERIFIED' | 'RELOCATED' | 'MISSING' | 'MAINTENANCE_REQUIRED' | 'UNVERIFIED';
  created_at: string;
}

export interface AssetAuditRecord {
  id: string;
  organization_id?: string | null;
  asset_id: string;
  asset_tag: string;
  asset_name: string;
  project_id?: string | null;
  project_name?: string | null;
  scanned_location: string;
  audit_status: 'VERIFIED' | 'RELOCATED' | 'MISSING' | 'MAINTENANCE_REQUIRED';
  auditor_id?: string | null;
  auditor_name?: string | null;
  condition: string;
  notes?: string;
  audit_timestamp: string;
}

export interface AssetTransferRecord {
  id: string;
  organization_id?: string | null;
  transfer_number: string;
  asset_id: string;
  asset_name: string;
  from_project_id?: string | null;
  from_project_name?: string | null;
  to_project_id?: string | null;
  to_project_name: string;
  from_location?: string;
  to_location: string;
  from_custodian_name?: string;
  to_custodian_name?: string;
  transfer_date: string;
  status: 'PENDING' | 'IN_TRANSIT' | 'COMPLETED' | 'CANCELLED';
  driver_name?: string;
  transport_vehicle?: string;
  notes?: string;
  created_at: string;
}

const LOCAL_ASSETS_KEY = 'tripro_enterprise_assets_v1';
const LOCAL_AUDITS_KEY = 'tripro_asset_audits_v1';
const LOCAL_TRANSFERS_KEY = 'tripro_asset_transfers_v1';

const isValidUUID = (str?: string | null): boolean => {
  if (!str) return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(str);
};

class AssetEnterpriseService {
  // ============================================================================
  // 1. GET ALL ASSETS (جلب الأصول والمعدات مع التخزين المحلي الاحتياطي)
  // ============================================================================

  public async getAssets(organizationId?: string): Promise<EnterpriseAsset[]> {
    const local = secureStorage.getItem<EnterpriseAsset[]>(LOCAL_ASSETS_KEY) || [];
    try {
      let query = supabase.from('assets').select('*').order('created_at', { ascending: false });
      if (organizationId && isValidUUID(organizationId)) query = query.eq('organization_id', organizationId);
      const { data, error } = await query;
      if (error || !data || data.length === 0) return local;

      const formatted: EnterpriseAsset[] = data.map((d: any) => {
        const cost = Number(d.purchase_cost || d.cost || 0);
        const accum = Number(d.accumulated_depreciation || 0);
        return {
          id: d.id,
          organization_id: d.organization_id,
          name: d.name || 'أصل بدون اسم',
          asset_tag: d.asset_tag || `AST-${d.id.slice(0, 6).toUpperCase()}`,
          serial_number: d.serial_number || '',
          category: d.category || 'MACHINERY',
          purchase_date: d.purchase_date || new Date().toISOString().split('T')[0],
          purchase_cost: cost,
          salvage_value: Number(d.salvage_value || 0),
          useful_life_years: Number(d.useful_life || d.useful_life_years || 5),
          accumulated_depreciation: accum,
          book_value: Math.max(0, cost - accum),
          project_id: d.project_id,
          project_name: d.project_name || 'الموقع الرئيسي',
          current_location: d.current_location || 'الموقع الرئيسي',
          custodian_id: d.custodian_id,
          custodian_name: d.custodian_name || 'غير محدد',
          asset_condition: d.asset_condition || 'GOOD',
          hourly_operating_cost: Number(d.hourly_operating_cost || 0),
          last_audit_date: d.last_audit_date,
          last_audit_status: d.last_audit_status || 'UNVERIFIED',
          created_at: d.created_at || new Date().toISOString()
        };
      });

      secureStorage.setItem(LOCAL_ASSETS_KEY, formatted);
      return formatted;
    } catch {
      return local;
    }
  }

  // ============================================================================
  // 2. QUICK FIELD BARCODE SCAN & AUDIT (المسح الميداني السريع وتأكيد الجرد)
  // ============================================================================

  public async findAssetByTagOrBarcode(
    tagOrCode: string,
    organizationId?: string
  ): Promise<EnterpriseAsset | null> {
    const cleanCode = (tagOrCode || '').trim().toUpperCase();
    if (!cleanCode) return null;

    const allAssets = await this.getAssets(organizationId);
    return (
      allAssets.find(
        a =>
          a.asset_tag.toUpperCase() === cleanCode ||
          a.id.toUpperCase() === cleanCode ||
          (a.serial_number && a.serial_number.toUpperCase() === cleanCode) ||
          a.name.toLowerCase().includes(cleanCode.toLowerCase())
      ) || null
    );
  }

  public async submitAuditRecord(
    params: {
      assetId: string;
      auditStatus: 'VERIFIED' | 'RELOCATED' | 'MISSING' | 'MAINTENANCE_REQUIRED';
      scannedLocation: string;
      scannedProjectId?: string | null;
      scannedProjectName?: string | null;
      condition?: string;
      notes?: string;
      auditorName?: string;
    },
    organizationId?: string
  ): Promise<{ success: boolean; auditRecord: AssetAuditRecord; message: string }> {
    const targetOrg = isValidUUID(organizationId) ? organizationId : null;
    const allAssets = await this.getAssets(organizationId);
    const asset = allAssets.find(a => a.id === params.assetId);

    if (!asset) {
      return { success: false, auditRecord: {} as any, message: 'لم يتم العثور على الأصل المحدد' };
    }

    const auditTimestamp = new Date().toISOString();
    const auditRecord: AssetAuditRecord = {
      id: `audit_${Date.now()}`,
      organization_id: targetOrg,
      asset_id: asset.id,
      asset_tag: asset.asset_tag,
      asset_name: asset.name,
      project_id: params.scannedProjectId || asset.project_id,
      project_name: params.scannedProjectName || asset.project_name,
      scanned_location: params.scannedLocation || asset.current_location,
      audit_status: params.auditStatus,
      auditor_name: params.auditorName || 'مهندس الجرد الميداني',
      condition: params.condition || asset.asset_condition,
      notes: params.notes || '',
      audit_timestamp: auditTimestamp
    };

    // 1. تحديث بيانات الأصل في قاعدة البيانات
    try {
      if (isValidUUID(asset.id)) {
        const updatePayload: any = {
          last_audit_date: auditTimestamp,
          last_audit_status: params.auditStatus,
          asset_condition: params.condition || asset.asset_condition
        };

        if (params.scannedLocation) updatePayload.current_location = params.scannedLocation;
        if (params.scannedProjectId && isValidUUID(params.scannedProjectId)) {
          updatePayload.project_id = params.scannedProjectId;
          updatePayload.project_name = params.scannedProjectName;
        }

        await supabase.from('assets').update(updatePayload).eq('id', asset.id);
        await supabase.from('asset_audits').insert({
          organization_id: targetOrg,
          asset_id: asset.id,
          asset_tag: asset.asset_tag,
          asset_name: asset.name,
          project_id: params.scannedProjectId && isValidUUID(params.scannedProjectId) ? params.scannedProjectId : null,
          project_name: params.scannedProjectName,
          scanned_location: params.scannedLocation,
          audit_status: params.auditStatus,
          auditor_name: params.auditorName || 'مهندس الجرد الميداني',
          condition: params.condition || asset.asset_condition,
          notes: params.notes,
          audit_timestamp: auditTimestamp
        });
      }
    } catch (e) {
      console.warn('DB audit submit notice:', e);
    }

    // 2. تحديث التخزين المحلي
    const currentAudits = secureStorage.getItem<AssetAuditRecord[]>(LOCAL_AUDITS_KEY) || [];
    secureStorage.setItem(LOCAL_AUDITS_KEY, [auditRecord, ...currentAudits].slice(0, 200));

    // تحديث الأصل في الكاش المحلي
    const updatedAssets = allAssets.map(a => {
      if (a.id === asset.id) {
        return {
          ...a,
          last_audit_date: auditTimestamp,
          last_audit_status: params.auditStatus,
          current_location: params.scannedLocation || a.current_location,
          project_name: params.scannedProjectName || a.project_name,
          asset_condition: (params.condition as any) || a.asset_condition
        };
      }
      return a;
    });
    secureStorage.setItem(LOCAL_ASSETS_KEY, updatedAssets);

    let statusText = 'تم تأكيد مطابقة وجود الأصل بالموقع ✅';
    if (params.auditStatus === 'RELOCATED') statusText = 'تم تحديث موقع الأصل ومشروع العمل 🔄';
    if (params.auditStatus === 'MAINTENANCE_REQUIRED') statusText = 'تم تسجيل طلب صيانة وإصلاح للأصل 🛠️';
    if (params.auditStatus === 'MISSING') statusText = 'تم تسجيل فقد الأصل للمتابعة والتحقيق ⚠️';

    return { success: true, auditRecord, message: `${statusText} (${asset.name})` };
  }

  // ============================================================================
  // 3. ASSET & EQUIPMENT TRANSFERS (مناقلات الأصول ومعدات المقاولات)
  // ============================================================================

  public async getTransfers(organizationId?: string): Promise<AssetTransferRecord[]> {
    const local = secureStorage.getItem<AssetTransferRecord[]>(LOCAL_TRANSFERS_KEY) || [];
    try {
      let query = supabase.from('asset_transfers').select('*').order('transfer_date', { ascending: false });
      if (organizationId && isValidUUID(organizationId)) query = query.eq('organization_id', organizationId);
      const { data, error } = await query;
      if (error || !data || data.length === 0) return local;

      const remoteIds = new Set(data.map((d: any) => d.id));
      const missing = local.filter(l => !remoteIds.has(l.id));
      const merged = [...(data as AssetTransferRecord[]), ...missing];
      secureStorage.setItem(LOCAL_TRANSFERS_KEY, merged);
      return merged;
    } catch {
      return local;
    }
  }

  public async createTransfer(
    transfer: Partial<AssetTransferRecord>,
    organizationId?: string
  ): Promise<AssetTransferRecord> {
    const targetOrg = isValidUUID(organizationId) ? organizationId : null;
    const transferNumber = `TRF-${Date.now().toString().slice(-6)}`;

    const payload = {
      organization_id: targetOrg,
      transfer_number: transferNumber,
      asset_id: transfer.asset_id!,
      asset_name: transfer.asset_name!,
      from_project_id: isValidUUID(transfer.from_project_id) ? transfer.from_project_id : null,
      from_project_name: transfer.from_project_name || 'الموقع السابق',
      to_project_id: isValidUUID(transfer.to_project_id) ? transfer.to_project_id : null,
      to_project_name: transfer.to_project_name || 'الموقع الجديد',
      from_location: transfer.from_location || '',
      to_location: transfer.to_location || transfer.to_project_name || '',
      driver_name: transfer.driver_name || '',
      transport_vehicle: transfer.transport_vehicle || '',
      transfer_date: transfer.transfer_date || new Date().toISOString().split('T')[0],
      status: transfer.status || 'COMPLETED',
      notes: transfer.notes || ''
    };

    let transferId = `trf_${Date.now()}`;

    try {
      const { data } = await supabase.from('asset_transfers').insert(payload).select().single();
      if (data && data.id) transferId = data.id;

      // تحديث موقع الأصل فورياً
      if (isValidUUID(transfer.asset_id)) {
        await supabase
          .from('assets')
          .update({
            project_id: payload.to_project_id,
            project_name: payload.to_project_name,
            current_location: payload.to_location
          })
          .eq('id', transfer.asset_id);
      }
    } catch (e) {
      console.warn('DB transfer insert notice:', e);
    }

    const record: AssetTransferRecord = {
      ...payload,
      id: transferId,
      created_at: new Date().toISOString()
    } as AssetTransferRecord;

    const current = secureStorage.getItem<AssetTransferRecord[]>(LOCAL_TRANSFERS_KEY) || [];
    secureStorage.setItem(LOCAL_TRANSFERS_KEY, [record, ...current]);
    return record;
  }
}

export const assetEnterpriseService = new AssetEnterpriseService();

/**
 * ==============================================================================
 * Subledger Registry (مجمع مزودي الأستاذ المساعد للمديولات)
 * TriPro ERP — services/subledgerRegistry.ts
 * ==============================================================================
 * الغرض المعماري:
 * عزل المديولات التخصصية (المقاولات، المستشفيات، الاستاد، المطاعم...)
 * وجلب مستندات وقيود الأستاذ المساعد لضمان مطابقة تامة 100% مع الأستاذ العام.
 * ==============================================================================
 */

import { supabase } from '../supabaseClient';

export interface SubledgerCustomerDoc {
  docId: string;
  journalEntryId?: string | null;
  customerId?: string | null;
  customerName?: string | null;
  customerPhone?: string | null;
  ref?: string | null;
  amount: number;
  date?: string;
  description?: string;
  sourceModule: string;
}

export interface SubledgerSupplierDoc {
  docId: string;
  journalEntryId?: string | null;
  supplierId?: string | null;
  supplierName?: string | null;
  supplierPhone?: string | null;
  ref?: string | null;
  amount: number;
  date?: string;
  description?: string;
  sourceModule: string;
}

export interface SubledgerProvider {
  moduleKey: string; // 'construction' | 'hims' | 'stadium'
  getCustomerDocs?: (orgId?: string) => Promise<SubledgerCustomerDoc[]>;
  getSupplierDocs?: (orgId?: string) => Promise<SubledgerSupplierDoc[]>;
  getStatementCustomerEntryIds?: (orgId?: string, customerId?: string, customerName?: string) => Promise<string[]>;
}

class SubledgerRegistryService {
  private providers: Map<string, SubledgerProvider> = new Map();

  /**
   * تسجيل مزود مديول جديد في المجمع
   */
  public register(provider: SubledgerProvider): void {
    this.providers.set(provider.moduleKey, provider);
  }

  /**
   * استرجاع المديولات المسجلة
   */
  public getProviders(): SubledgerProvider[] {
    return Array.from(this.providers.values());
  }

  /**
   * فحص هل المديول مفعل لهذه المنظمة بناءً على allowed_modules
   */
  public isModuleActive(moduleKey: string, allowedModules?: string[]): boolean {
    if (!allowedModules || allowedModules.length === 0) return true;
    return (
      allowedModules.includes(moduleKey) ||
      allowedModules.includes('premium') ||
      allowedModules.includes('all')
    );
  }

  /**
   * جلب كافة مستندات العملاء من المديولات لضمان المطابقة الكاملة مع الأستاذ العام
   */
  public async fetchCustomerDocs(orgId?: string, allowedModules?: string[]): Promise<SubledgerCustomerDoc[]> {
    const providersToQuery = this.getProviders();
    const results = await Promise.all(
      providersToQuery.map(async p => {
        if (!p.getCustomerDocs) return [];
        try {
          return await p.getCustomerDocs(orgId);
        } catch (err) {
          console.warn(`[SubledgerRegistry] Error in ${p.moduleKey}.getCustomerDocs:`, err);
          return [];
        }
      })
    );
    return results.flat();
  }

  /**
   * جلب كافة مستندات الموردين ومقاولي الباطن لضمان المطابقة الكاملة
   */
  public async fetchSupplierDocs(orgId?: string, allowedModules?: string[]): Promise<SubledgerSupplierDoc[]> {
    const providersToQuery = this.getProviders();
    const results = await Promise.all(
      providersToQuery.map(async p => {
        if (!p.getSupplierDocs) return [];
        try {
          return await p.getSupplierDocs(orgId);
        } catch (err) {
          console.warn(`[SubledgerRegistry] Error in ${p.moduleKey}.getSupplierDocs:`, err);
          return [];
        }
      })
    );
    return results.flat();
  }

  /**
   * جلب قيود اليومية المرتبطة بعميل في كشف الحساب من المديولات
   */
  public async fetchStatementCustomerEntryIds(
    orgId?: string,
    customerId?: string,
    customerName?: string,
    allowedModules?: string[]
  ): Promise<string[]> {
    if (!customerId) return [];
    const providersToQuery = this.getProviders();
    const results = await Promise.all(
      providersToQuery.map(async p => {
        if (!p.getStatementCustomerEntryIds) return [];
        try {
          return await p.getStatementCustomerEntryIds(orgId, customerId, customerName);
        } catch (err) {
          console.warn(`[SubledgerRegistry] Error in ${p.moduleKey}.getStatementCustomerEntryIds:`, err);
          return [];
        }
      })
    );
    return Array.from(new Set(results.flat()));
  }
}

export const SubledgerRegistry = new SubledgerRegistryService();

// ==============================================================================
// 1. تسجيل مزود مديول المقاولات (Construction Subledger Provider)
// ==============================================================================
SubledgerRegistry.register({
  moduleKey: 'construction',
  getCustomerDocs: async (_orgId?: string): Promise<SubledgerCustomerDoc[]> => {
    try {
      const [billingsRes, projectsRes] = await Promise.all([
        supabase
          .from('project_progress_billings')
          .select('id, billing_number, net_amount, related_journal_entry_id, project_id, billing_date')
          .not('status', 'in', '("draft","cancelled")'),
        supabase.from('projects').select('id, customer_id, name')
      ]);

      const projectMap = new Map<string, any>();
      projectsRes.data?.forEach(p => projectMap.set(p.id, p));

      if (billingsRes.error || !billingsRes.data) {
        return [];
      }

      return billingsRes.data.map((pb: any) => {
        const proj = pb.project_id ? projectMap.get(pb.project_id) : null;
        const custId = proj?.customer_id;
        return {
          docId: pb.id,
          journalEntryId: pb.related_journal_entry_id,
          customerId: custId,
          ref: String(pb.billing_number || ''),
          amount: Number(pb.net_amount || 0),
          date: pb.billing_date,
          description: `مستخلص مقاولات: ${proj?.name || ''}`,
          sourceModule: 'construction'
        };
      });
    } catch (err) {
      console.warn('[SubledgerRegistry] Error in construction.getCustomerDocs:', err);
      return [];
    }
  },

  getSupplierDocs: async (_orgId?: string): Promise<SubledgerSupplierDoc[]> => {
    try {
      const [billingsRes, subsRes, contractsRes] = await Promise.all([
        supabase
          .from('subcontractor_billings')
          .select('id, billing_number, net_amount, related_journal_entry_id, contract_id, billing_date')
          .not('status', 'in', '("draft","cancelled")'),
        supabase.from('subcontractors').select('id, supplier_id, name'),
        supabase.from('subcontractor_contracts').select('id, subcontractor_id')
      ]);

      const subMap = new Map<string, any>();
      subsRes.data?.forEach(s => subMap.set(s.id, s));

      const contractMap = new Map<string, any>();
      contractsRes.data?.forEach(c => contractMap.set(c.id, c));

      if (billingsRes.error || !billingsRes.data) return [];
      return billingsRes.data.map((sb: any) => {
        const contract = sb.contract_id ? contractMap.get(sb.contract_id) : null;
        const sub = contract?.subcontractor_id ? subMap.get(contract.subcontractor_id) : null;
        const suppId = sub?.supplier_id;
        return {
          docId: sb.id,
          journalEntryId: sb.related_journal_entry_id,
          supplierId: suppId,
          supplierName: sub?.name,
          ref: String(sb.billing_number || ''),
          amount: Number(sb.net_amount || 0),
          date: sb.billing_date,
          description: `مستخلص باطن: ${sub?.name || ''}`,
          sourceModule: 'construction'
        };
      });
    } catch (err) {
      console.warn('[SubledgerRegistry] Error in construction.getSupplierDocs:', err);
      return [];
    }
  },

  getStatementCustomerEntryIds: async (_orgId?: string, customerId?: string): Promise<string[]> => {
    if (!customerId) return [];
    try {
      const { data: projects } = await supabase
        .from('projects')
        .select('id')
        .eq('customer_id', customerId);

      const projectIds = projects?.map(p => p.id) || [];
      if (projectIds.length === 0) return [];

      const { data: bills } = await supabase
        .from('project_progress_billings')
        .select('related_journal_entry_id')
        .in('project_id', projectIds)
        .not('related_journal_entry_id', 'is', null);

      return (bills || []).map(b => b.related_journal_entry_id).filter(Boolean);
    } catch {
      return [];
    }
  }
});

// ==============================================================================
// 2. تسجيل مزود مديول المستشفيات (HIMS Subledger Provider)
// ==============================================================================
SubledgerRegistry.register({
  moduleKey: 'hims',
  getCustomerDocs: async (_orgId?: string): Promise<SubledgerCustomerDoc[]> => {
    try {
      const [billsRes, claimsRes, patientsRes] = await Promise.all([
        supabase.from('hims_billing').select('id, patient_id, insurance_provider_id, related_journal_entry_id, total_amount, created_at'),
        supabase.from('hims_insurance_claims').select('id, insurance_provider_id, related_journal_entry_id, total_claim_amount, created_at'),
        supabase.from('hims_patients').select('id, customer_id, full_name, phone')
      ]);

      const patientToCustomer = new Map<string, string>();
      patientsRes.data?.forEach(p => {
        if (p.customer_id) patientToCustomer.set(p.id, p.customer_id);
      });

      const docs: SubledgerCustomerDoc[] = [];

      billsRes.data?.forEach((b: any) => {
        const custId = b.insurance_provider_id || (b.patient_id ? patientToCustomer.get(b.patient_id) : null);
        docs.push({
          docId: b.id,
          journalEntryId: b.related_journal_entry_id,
          customerId: custId,
          amount: Number(b.total_amount || 0),
          date: b.created_at,
          description: 'فاتورة علاج مستشفى',
          sourceModule: 'hims'
        });
      });

      claimsRes.data?.forEach((c: any) => {
        docs.push({
          docId: c.id,
          journalEntryId: c.related_journal_entry_id,
          customerId: c.insurance_provider_id,
          amount: Number(c.total_claim_amount || 0),
          date: c.created_at,
          description: 'مطالبة تأمين طبي',
          sourceModule: 'hims'
        });
      });

      return docs;
    } catch {
      return [];
    }
  },

  getStatementCustomerEntryIds: async (_orgId?: string, customerId?: string): Promise<string[]> => {
    if (!customerId) return [];
    try {
      const [patientBillsRes, insBillsRes, claimsRes] = await Promise.all([
        supabase.from('hims_billing').select('id, related_journal_entry_id').eq('patient_id', customerId),
        supabase.from('hims_billing').select('id, related_journal_entry_id').eq('insurance_provider_id', customerId),
        supabase.from('hims_insurance_claims').select('id, related_journal_entry_id').eq('insurance_provider_id', customerId)
      ]);

      const entryIds: string[] = [];
      patientBillsRes.data?.forEach(b => { if (b.related_journal_entry_id) entryIds.push(b.related_journal_entry_id); });
      insBillsRes.data?.forEach(b => { if (b.related_journal_entry_id) entryIds.push(b.related_journal_entry_id); });
      claimsRes.data?.forEach(c => { if (c.related_journal_entry_id) entryIds.push(c.related_journal_entry_id); });
      return entryIds;
    } catch {
      return [];
    }
  }
});

// ==============================================================================
// 3. تسجيل مزود مديول الاستاد الرياضي (Stadium Subledger Provider)
// ==============================================================================
SubledgerRegistry.register({
  moduleKey: 'stadium',
  getCustomerDocs: async (_orgId?: string): Promise<SubledgerCustomerDoc[]> => {
    try {
      const [subsRes, rentalsRes, bookingsRes, programsRes, tournamentsRes] = await Promise.all([
        supabase.from('stadium_subscriptions').select('id, member_id, journal_entry_id, amount_paid, payment_method, stadium_members(id, full_name, phone)'),
        supabase.from('stadium_rental_payments').select('id, contract_id, amount_paid, journal_entry_id, payment_method, stadium_rental_contracts(tenant_name, tenant_phone)'),
        supabase.from('stadium_bookings').select('id, booker_name, booker_phone, total_amount, journal_entry_id, payment_method'),
        supabase.from('stadium_program_enrollments').select('id, participant_name, participant_phone, amount_paid, journal_entry_id, payment_method'),
        supabase.from('stadium_tournament_teams').select('id, team_name, captain_name, captain_phone, entry_fee_paid, journal_entry_id, payment_method')
      ]);

      const docs: SubledgerCustomerDoc[] = [];

      subsRes.data?.forEach((s: any) => {
        docs.push({
          docId: s.id,
          journalEntryId: s.journal_entry_id,
          customerName: s.stadium_members?.full_name,
          customerPhone: s.stadium_members?.phone,
          amount: Number(s.amount_paid || 0),
          description: `اشتراك استاد: ${s.stadium_members?.full_name || ''}`,
          sourceModule: 'stadium'
        });
      });

      rentalsRes.data?.forEach((r: any) => {
        docs.push({
          docId: r.id,
          journalEntryId: r.journal_entry_id,
          customerName: r.stadium_rental_contracts?.tenant_name,
          customerPhone: r.stadium_rental_contracts?.tenant_phone,
          amount: Number(r.amount_paid || 0),
          description: `إيجار استاد: ${r.stadium_rental_contracts?.tenant_name || ''}`,
          sourceModule: 'stadium'
        });
      });

      bookingsRes.data?.forEach((b: any) => {
        docs.push({
          docId: b.id,
          journalEntryId: b.journal_entry_id,
          customerName: b.booker_name,
          customerPhone: b.booker_phone,
          amount: Number(b.total_amount || 0),
          description: `حجز ملعب: ${b.booker_name || ''}`,
          sourceModule: 'stadium'
        });
      });

      programsRes.data?.forEach((p: any) => {
        docs.push({
          docId: p.id,
          journalEntryId: p.journal_entry_id,
          customerName: p.participant_name,
          customerPhone: p.participant_phone,
          amount: Number(p.amount_paid || 0),
          description: `برنامج تدريبي: ${p.participant_name || ''}`,
          sourceModule: 'stadium'
        });
      });

      tournamentsRes.data?.forEach((t: any) => {
        docs.push({
          docId: t.id,
          journalEntryId: t.journal_entry_id,
          customerName: t.captain_name || t.team_name,
          customerPhone: t.captain_phone,
          amount: Number(t.entry_fee_paid || 0),
          description: `اشتراك بطولة: ${t.team_name || ''}`,
          sourceModule: 'stadium'
        });
      });

      return docs;
    } catch {
      return [];
    }
  },

  getSupplierDocs: async (_orgId?: string): Promise<SubledgerSupplierDoc[]> => {
    try {
      const [disbRes, maintRes, custodyRes] = await Promise.all([
        supabase.from('stadium_disbursements').select('id, request_number, amount, journal_entry_id, beneficiary_name'),
        supabase.from('stadium_maintenance_tickets').select('id, ticket_number, actual_cost, estimated_cost, journal_entry_id, assigned_technician'),
        supabase.from('stadium_custodies').select('id, custodian_name, total_amount, journal_entry_id, settlement_journal_id')
      ]);

      const docs: SubledgerSupplierDoc[] = [];

      disbRes.data?.forEach((d: any) => {
        docs.push({
          docId: d.id,
          journalEntryId: d.journal_entry_id,
          supplierName: d.beneficiary_name,
          ref: d.request_number,
          amount: Number(d.amount || 0),
          description: `صرفيات استاد: ${d.beneficiary_name || ''}`,
          sourceModule: 'stadium'
        });
      });

      maintRes.data?.forEach((m: any) => {
        docs.push({
          docId: m.id,
          journalEntryId: m.journal_entry_id,
          supplierName: m.assigned_technician,
          ref: m.ticket_number,
          amount: Number(m.actual_cost || m.estimated_cost || 0),
          description: `صيانة استاد: ${m.assigned_technician || ''}`,
          sourceModule: 'stadium'
        });
      });

      custodyRes.data?.forEach((c: any) => {
        docs.push({
          docId: c.id,
          journalEntryId: c.journal_entry_id,
          supplierName: c.custodian_name,
          amount: Number(c.total_amount || 0),
          description: `عهدة استاد: ${c.custodian_name || ''}`,
          sourceModule: 'stadium'
        });
        if (c.settlement_journal_id) {
          docs.push({
            docId: c.id,
            journalEntryId: c.settlement_journal_id,
            supplierName: c.custodian_name,
            amount: Number(c.total_amount || 0),
            description: `تسوية عهدة استاد: ${c.custodian_name || ''}`,
            sourceModule: 'stadium'
          });
        }
      });

      return docs;
    } catch {
      return [];
    }
  },

  getStatementCustomerEntryIds: async (_orgId?: string, customerId?: string, customerName?: string): Promise<string[]> => {
    if (!customerName?.trim()) return [];
    const name = customerName.trim();
    try {
      const [subsRes, rentalsRes, bookingsRes, programsRes, tournamentsRes] = await Promise.all([
        supabase.from('stadium_subscriptions').select('journal_entry_id, stadium_members!inner(full_name)').ilike('stadium_members.full_name', `%${name}%`).not('journal_entry_id', 'is', null),
        supabase.from('stadium_rental_payments').select('journal_entry_id, stadium_rental_contracts!inner(tenant_name)').ilike('stadium_rental_contracts.tenant_name', `%${name}%`).not('journal_entry_id', 'is', null),
        supabase.from('stadium_bookings').select('journal_entry_id').ilike('booker_name', `%${name}%`).not('journal_entry_id', 'is', null),
        supabase.from('stadium_program_enrollments').select('journal_entry_id').ilike('participant_name', `%${name}%`).not('journal_entry_id', 'is', null),
        supabase.from('stadium_tournament_teams').select('journal_entry_id').or(`captain_name.ilike.%${name}%,team_name.ilike.%${name}%`).not('journal_entry_id', 'is', null)
      ]);

      const entryIds: string[] = [];
      subsRes.data?.forEach(s => { if (s.journal_entry_id) entryIds.push(s.journal_entry_id); });
      rentalsRes.data?.forEach(r => { if (r.journal_entry_id) entryIds.push(r.journal_entry_id); });
      bookingsRes.data?.forEach(b => { if (b.journal_entry_id) entryIds.push(b.journal_entry_id); });
      programsRes.data?.forEach(p => { if (p.journal_entry_id) entryIds.push(p.journal_entry_id); });
      tournamentsRes.data?.forEach(t => { if (t.journal_entry_id) entryIds.push(t.journal_entry_id); });
      return entryIds;
    } catch {
      return [];
    }
  }
});

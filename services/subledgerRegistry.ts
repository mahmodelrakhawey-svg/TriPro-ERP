/**
 * ==============================================================================
 * Subledger Registry (مجمع مزودي الأستاذ المساعد للمديولات)
 * TriPro ERP — services/subledgerRegistry.ts
 * ==============================================================================
 * الغرض المعماري:
 * عزل المديولات التخصصية (المقاولات، المستشفيات، الاستاد، المطاعم...)
 * وجلب مستندات وقيود الأستاذ المساعد حصرياً للمديولات المفعلة للشركة
 * في منصة SaaS (allowed_modules).
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
  getCustomerDocs?: (orgId: string) => Promise<SubledgerCustomerDoc[]>;
  getSupplierDocs?: (orgId: string) => Promise<SubledgerSupplierDoc[]>;
  getStatementCustomerEntryIds?: (orgId: string, customerId: string, customerName?: string) => Promise<string[]>;
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
    // إذا لم تُمرر مصفوفة (بيئة اختبار أو سوبر أدمن)، يُعتبر المديول مفعلاً
    if (!allowedModules || allowedModules.length === 0) return true;
    return allowedModules.includes(moduleKey) || allowedModules.includes('premium');
  }

  /**
   * جلب كافة مستندات العملاء من المديولات المفعلة لهذه المنظمة
   */
  public async fetchCustomerDocs(orgId: string, allowedModules?: string[]): Promise<SubledgerCustomerDoc[]> {
    const activeProviders = this.getProviders().filter(p => this.isModuleActive(p.moduleKey, allowedModules));
    const results = await Promise.all(
      activeProviders.map(async p => {
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
   * جلب كافة مستندات الموردين ومقاولي الباطن من المديولات المفعلة
   */
  public async fetchSupplierDocs(orgId: string, allowedModules?: string[]): Promise<SubledgerSupplierDoc[]> {
    const activeProviders = this.getProviders().filter(p => this.isModuleActive(p.moduleKey, allowedModules));
    const results = await Promise.all(
      activeProviders.map(async p => {
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
   * جلب قيود اليومية المرتبطة بعميل في كشف الحساب من المديولات المفعلة
   */
  public async fetchStatementCustomerEntryIds(
    orgId: string,
    customerId: string,
    customerName?: string,
    allowedModules?: string[]
  ): Promise<string[]> {
    const activeProviders = this.getProviders().filter(p => this.isModuleActive(p.moduleKey, allowedModules));
    const results = await Promise.all(
      activeProviders.map(async p => {
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
  getCustomerDocs: async (orgId: string): Promise<SubledgerCustomerDoc[]> => {
    try {
      const { data, error } = await supabase
        .from('project_progress_billings')
        .select('id, billing_number, net_amount, related_journal_entry_id, project_id, issue_date, projects(customer_id, name)')
        .eq('organization_id', orgId)
        .not('status', 'in', '("draft","cancelled")');

      if (error || !data) return [];
      return data.map((pb: any) => ({
        docId: pb.id,
        journalEntryId: pb.related_journal_entry_id,
        customerId: pb.projects?.customer_id,
        ref: pb.billing_number,
        amount: Number(pb.net_amount || 0),
        date: pb.issue_date,
        description: `مستخلص مقاولات: ${pb.projects?.name || ''}`,
        sourceModule: 'construction'
      }));
    } catch {
      return [];
    }
  },

  getSupplierDocs: async (orgId: string): Promise<SubledgerSupplierDoc[]> => {
    try {
      const { data, error } = await supabase
        .from('subcontractor_billings')
        .select('id, billing_number, net_amount, related_journal_entry_id, subcontractor_id, issue_date, subcontractors(name, supplier_id)')
        .eq('organization_id', orgId)
        .not('status', 'in', '("draft","cancelled")');

      if (error || !data) return [];
      return data.map((sb: any) => ({
        docId: sb.id,
        journalEntryId: sb.related_journal_entry_id,
        supplierId: sb.subcontractors?.supplier_id,
        supplierName: sb.subcontractors?.name,
        ref: sb.billing_number,
        amount: Number(sb.net_amount || 0),
        date: sb.issue_date,
        description: `مستخلص باطن: ${sb.subcontractors?.name || ''}`,
        sourceModule: 'construction'
      }));
    } catch {
      return [];
    }
  },

  getStatementCustomerEntryIds: async (orgId: string, customerId: string): Promise<string[]> => {
    try {
      const { data: projects } = await supabase
        .from('projects')
        .select('id')
        .eq('customer_id', customerId)
        .eq('organization_id', orgId);

      const projectIds = projects?.map(p => p.id) || [];
      if (projectIds.length === 0) return [];

      const { data: bills } = await supabase
        .from('project_progress_billings')
        .select('related_journal_entry_id')
        .in('project_id', projectIds)
        .eq('organization_id', orgId)
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
  getCustomerDocs: async (orgId: string): Promise<SubledgerCustomerDoc[]> => {
    try {
      const [billsRes, claimsRes, patientsRes] = await Promise.all([
        supabase.from('hims_billing').select('id, patient_id, insurance_provider_id, related_journal_entry_id, total_amount, billing_date').eq('organization_id', orgId),
        supabase.from('hims_insurance_claims').select('id, insurance_provider_id, related_journal_entry_id, claim_amount, claim_date').eq('organization_id', orgId),
        supabase.from('hims_patients').select('id, customer_id, full_name, phone').eq('organization_id', orgId)
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
          date: b.billing_date,
          description: 'فاتورة علاج مستشفى',
          sourceModule: 'hims'
        });
      });

      claimsRes.data?.forEach((c: any) => {
        docs.push({
          docId: c.id,
          journalEntryId: c.related_journal_entry_id,
          customerId: c.insurance_provider_id,
          amount: Number(c.claim_amount || 0),
          date: c.claim_date,
          description: 'مطالبة تأمين طبي',
          sourceModule: 'hims'
        });
      });

      return docs;
    } catch {
      return [];
    }
  },

  getStatementCustomerEntryIds: async (orgId: string, customerId: string): Promise<string[]> => {
    try {
      const [patientBillsRes, insBillsRes, claimsRes] = await Promise.all([
        supabase.from('hims_billing').select('id, related_journal_entry_id').eq('patient_id', customerId).eq('organization_id', orgId),
        supabase.from('hims_billing').select('id, related_journal_entry_id').eq('insurance_provider_id', customerId).eq('organization_id', orgId),
        supabase.from('hims_insurance_claims').select('id, related_journal_entry_id').eq('insurance_provider_id', customerId).eq('organization_id', orgId)
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
  getCustomerDocs: async (orgId: string): Promise<SubledgerCustomerDoc[]> => {
    try {
      const [subsRes, rentalsRes, bookingsRes, programsRes, tournamentsRes] = await Promise.all([
        supabase.from('stadium_subscriptions').select('id, member_id, journal_entry_id, amount_paid, payment_method, stadium_members(id, full_name, phone)').eq('organization_id', orgId),
        supabase.from('stadium_rental_payments').select('id, contract_id, amount_paid, journal_entry_id, payment_method, stadium_rental_contracts(tenant_name, tenant_phone)').eq('organization_id', orgId),
        supabase.from('stadium_bookings').select('id, booker_name, booker_phone, total_amount, journal_entry_id, payment_method').eq('organization_id', orgId),
        supabase.from('stadium_program_enrollments').select('id, participant_name, participant_phone, amount_paid, journal_entry_id, payment_method').eq('organization_id', orgId),
        supabase.from('stadium_tournament_teams').select('id, team_name, captain_name, captain_phone, entry_fee_paid, journal_entry_id, payment_method').eq('organization_id', orgId)
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

  getSupplierDocs: async (orgId: string): Promise<SubledgerSupplierDoc[]> => {
    try {
      const [disbRes, maintRes, custodyRes] = await Promise.all([
        supabase.from('stadium_disbursements').select('id, disbursement_number, amount, journal_entry_id, beneficiary_name').eq('organization_id', orgId),
        supabase.from('stadium_maintenance_tickets').select('id, ticket_number, cost, journal_entry_id, technician_name').eq('organization_id', orgId),
        supabase.from('stadium_custodies').select('id, custodian_name, amount, journal_entry_id, settlement_journal_id').eq('organization_id', orgId)
      ]);

      const docs: SubledgerSupplierDoc[] = [];

      disbRes.data?.forEach((d: any) => {
        docs.push({
          docId: d.id,
          journalEntryId: d.journal_entry_id,
          supplierName: d.beneficiary_name,
          ref: d.disbursement_number,
          amount: Number(d.amount || 0),
          description: `صرفيات استاد: ${d.beneficiary_name || ''}`,
          sourceModule: 'stadium'
        });
      });

      maintRes.data?.forEach((m: any) => {
        docs.push({
          docId: m.id,
          journalEntryId: m.journal_entry_id,
          supplierName: m.technician_name,
          ref: m.ticket_number,
          amount: Number(m.cost || 0),
          description: `صيانة استاد: ${m.technician_name || ''}`,
          sourceModule: 'stadium'
        });
      });

      custodyRes.data?.forEach((c: any) => {
        docs.push({
          docId: c.id,
          journalEntryId: c.journal_entry_id,
          supplierName: c.custodian_name,
          amount: Number(c.amount || 0),
          description: `عهدة استاد: ${c.custodian_name || ''}`,
          sourceModule: 'stadium'
        });
        if (c.settlement_journal_id) {
          docs.push({
            docId: c.id,
            journalEntryId: c.settlement_journal_id,
            supplierName: c.custodian_name,
            amount: Number(c.amount || 0),
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

  getStatementCustomerEntryIds: async (orgId: string, customerId: string, customerName?: string): Promise<string[]> => {
    if (!customerName?.trim()) return [];
    const name = customerName.trim();
    try {
      const [subsRes, rentalsRes, bookingsRes, programsRes, tournamentsRes] = await Promise.all([
        supabase.from('stadium_subscriptions').select('journal_entry_id, stadium_members!inner(full_name)').eq('organization_id', orgId).ilike('stadium_members.full_name', `%${name}%`).not('journal_entry_id', 'is', null),
        supabase.from('stadium_rental_payments').select('journal_entry_id, stadium_rental_contracts!inner(tenant_name)').eq('organization_id', orgId).ilike('stadium_rental_contracts.tenant_name', `%${name}%`).not('journal_entry_id', 'is', null),
        supabase.from('stadium_bookings').select('journal_entry_id').eq('organization_id', orgId).ilike('booker_name', `%${name}%`).not('journal_entry_id', 'is', null),
        supabase.from('stadium_program_enrollments').select('journal_entry_id').eq('organization_id', orgId).ilike('participant_name', `%${name}%`).not('journal_entry_id', 'is', null),
        supabase.from('stadium_tournament_teams').select('journal_entry_id').eq('organization_id', orgId).or(`captain_name.ilike.%${name}%,team_name.ilike.%${name}%`).not('journal_entry_id', 'is', null)
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

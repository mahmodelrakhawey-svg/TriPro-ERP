import { supabase } from './supabaseClient';

/**
 * 🏥 HIMS Frontend Service Bridge
 * هذا الملف هو الجسر الذي يربط أزرار الواجهة بالمنطق الذكي في قاعدة البيانات
 */
export const himsService = {
  
  // 1. تسجيل خروج المريض وتوليد الفاتورة آلياً
  async dischargePatient(visitId: string) {
    const { data, error } = await supabase.rpc('hims_process_discharge', {
      p_visit_id: visitId
    });
    if (error) throw error;
    return data;
  },

  // 2. صرف الدواء وخصمه من المخزن
  async dispenseMedications(prescriptionId: string, warehouseId?: string) {
    const { data, error } = await supabase.rpc('hims_dispense_prescription', {
      p_prescription_id: prescriptionId,
      p_warehouse_id: warehouseId
    });
    if (error) throw error;
    return data;
  },

  // 3. جلب تنبيهات "النقطة الحمراء" للطبيب (نتائج مختبر جديدة)
  async getDoctorAlerts(doctorId: string) {
    const { data, error } = await supabase
      .from('notifications')
      .select('*')
      .eq('user_id', doctorId)
      .eq('type', 'lab_result_ready')
      .eq('is_read', false);
    
    if (error) throw error;
    return data;
  },

  // 4. تجميع مطالبات التأمين في دفعة واحدة
  async createInsuranceBatch(providerId: string, reference: string) {
    const { data, error } = await supabase.rpc('hims_create_insurance_batch', {
      p_insurance_provider_id: providerId,
      p_batch_ref: reference
    });
    if (error) throw error;
    return data;
  },

  // 5. جلب خلاصة الخروج الطبية (Discharge Summary)
  async getDischargeSummary(visitId: string) {
    const { data, error } = await supabase.rpc('get_patient_discharge_summary', {
      p_visit_id: visitId
    });
    if (error) throw error;
    return data;
  },

  // 9. اعتماد نتيجة المختبر مع خصم المخزن
  async completeLabOrder(orderId: string, result: string, consumables: any[]) {
    const { data, error } = await supabase.rpc('hims_complete_lab_with_inventory', {
      p_order_id: orderId,
      p_result: result,
      p_consumables: consumables
    });
    if (error) throw error;
    return data;
  },

  // 10. اعتماد تقرير الأشعة والصور
  async completeRadiologyOrder(orderId: string, report: string, images: string[]) {
    const { data, error } = await supabase.rpc('hims_complete_radiology', {
      p_order_id: orderId,
      p_report: report,
      p_images: images
    });
    if (error) throw error;
    return data;
  },

  // 11. نقل مريض لسرير أو قسم آخر
  async transferPatient(visitId: string, newBedId: string, reason: string) {
    const { data, error } = await supabase.rpc('hims_transfer_patient', {
      p_visit_id: visitId,
      p_new_bed_id: newBedId,
      p_reason: reason
    });
    if (error) throw error;
    return data;
  },

  // 17. تسوية مطالبة تأمين وتحصيل المبلغ
  async settleInsuranceClaim(claimId: string, receivedAmount: number, bankAccId: string) {
    const { data, error } = await supabase.rpc('hims_settle_insurance_claim', {
      p_claim_id: claimId,
      p_received_amount: receivedAmount,
      p_bank_acc_id: bankAccId
    });
    if (error) throw error;
    return data;
  },

  // 6. مراقبة حالات الطوارئ (Emergency Monitor)
  async getEmergencyMonitor() {
    const { data, error } = await supabase
      .from('v_hims_emergency_triage_monitor')
      .select('*');
    if (error) throw error;
    return data;
  },

  // 7. جلب التاريخ الطبي للعلامات الحيوية (للرسم البياني)
  async getVitalsHistory(patientId: string) {
    const { data, error } = await supabase
      .from('v_hims_patient_vitals_history')
      .select('*')
      .eq('patient_id', patientId)
      .order('record_date', { ascending: true });
    if (error) throw error;
    return data;
  },

  // 8. إضافة ملاحظات طبية مهيكلة (SOAP Notes)
  async addClinicalNote(note: { visit_id: string, doctor_id: string, subjective?: string, objective?: string, assessment?: string, plan?: string }) {
    const { data, error } = await supabase
      .from('hims_clinical_notes')
      .insert([note])
      .select()
      .single();
    if (error) throw error;
    return data;
  },
  // 20. جلب تقارير ربحية الأطباء
  async getDoctorProfitability() {
    const { data, error } = await supabase
      .from('v_hims_doctor_profitability')
      .select('*')
      .order('total_revenue', { ascending: false });
    if (error) throw error;
    return data;
  },

  // 21. جلب تقارير ربحية الأقسام
  async getDeptProfitability() {
    const { data, error } = await supabase
      .from('v_hims_dept_profitability')
      .select('*')
      .order('total_revenue', { ascending: false });
    if (error) throw error;
    return data;
  },

  // 18. البحث في أكواد الأمراض العالمية ICD-10
  async searchICD10(query: string) {
    const { data, error } = await supabase
      .from('v_hims_icd10_search')
      .select('*')
      .or(`code.ilike.%${query}%,description_ar.ilike.%${query}%`)
      .limit(10);
    if (error) throw error;
    return data;
  },

  // 19. جلب قائمة المتبرعين بالدم
  async getDonors() {
    const { data, error } = await supabase
      .from('hims_blood_donors')
      .select('*')
      .order('full_name', { ascending: true });
    if (error) throw error;
    return data;
  },

  async registerDonor(donor: { full_name: string, national_id: string, blood_type: string, phone: string }) {
    const { data, error } = await supabase.rpc('hims_register_donor', donor);
    if (error) throw error;
    return data;
  },

  // 12. جلب الجدول الزمني الطبي الموحد للمريض
  async getPatientTimeline(patientId: string) {
    const { data, error } = await supabase
      .from('v_hims_patient_medical_timeline')
      .select('*')
      .eq('patient_id', patientId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return data;
  },

  // 13. جلب كافة الفواتير الطبية للمنظمة
  async getMedicalBills() {
    const { data, error } = await supabase
      .from('hims_billing')
      .select('*, hims_patients(full_name), hims_visits(visit_type, status)')
      .order('created_at', { ascending: false });
    if (error) throw error;
    return data;
  },

  // 14. جلب تفاصيل قيد اليومية المرتبط بالفاتورة (الربط مع الأستاذ العام)
  async getBillingJournalEntry(journalEntryId: string) {
    const { data, error } = await supabase
      .from('journal_entries')
      .select('*, journal_lines(*, accounts(name, code))')
      .eq('id', journalEntryId)
      .single();
    if (error) throw error;
    return data;
  },

  // 15. جلب قائمة المرضى بانتظار الطبيب (Queue Manager)
  async getDoctorQueue(userId: string) {
    const { data, error } = await supabase
      .from('hims_visits')
      .select('*, hims_patients(id, full_name, national_id), hims_lab_orders(status), hims_radiology_orders(status)')
      .in('status', ['triaged', 'in_consultation'])
      .order('created_at', { ascending: true });

    if (error) throw error;
    return data;
  },

  // 16. بدء الكشف الطبي وتحديث حالة الزيارة
  async startConsultation(visitId: string) {
    const { data, error } = await supabase
      .from('hims_visits')
      .update({ status: 'in_consultation' })
      .eq('id', visitId)
      .select()
      .single();
    if (error) throw error;
    return data;
  }

};
/**
 * ====================================================================
 * HIMS Module — Centralized TypeScript Interfaces
 * Hospital Information Management System — TriPro ERP
 * ====================================================================
 * هذا الملف يحتوي على جميع الـ interfaces الخاصة بموديول المستشفيات.
 * يجب استخدامه في كل ملفات HIMS بدلاً من `any`.
 * ====================================================================
 */

// ─────────────────────────────────────────────
// 1. المريض
// ─────────────────────────────────────────────
export interface HimsPatient {
  id: string;
  organization_id: string;
  full_name: string;
  national_id: string;
  dob: string;
  gender: 'male' | 'female' | 'other';
  blood_type: string;
  phone?: string;
  email?: string;
  address?: string;
  customer_id?: string;
  allergies?: string[];
  chronic_conditions?: string[];
  emergency_contact_name?: string;
  emergency_contact_phone?: string;
  created_at?: string;
}

// ─────────────────────────────────────────────
// 2. الطبيب
// ─────────────────────────────────────────────
export interface HimsDoctor {
  id: string;
  organization_id: string;
  profile_id: string;
  specialization: string;
  license_number?: string;
  consultation_fee?: number;
  is_active: boolean;
  created_at?: string;
  // جلب من العلاقة
  profile?: { full_name: string; email?: string };
}

// ─────────────────────────────────────────────
// 3. الزيارة
// ─────────────────────────────────────────────
export type VisitStatus = 'waiting' | 'in_progress' | 'completed' | 'discharged' | 'cancelled';
export type VisitType = 'outpatient' | 'inpatient' | 'emergency' | 'surgery';
export type TriageLevel =
  | 'level_1_resuscitation'
  | 'level_2_emergent'
  | 'level_3_urgent'
  | 'level_4_less_urgent'
  | 'level_5_non_urgent';

export interface HimsVisit {
  id: string;
  organization_id: string;
  patient_id: string;
  doctor_id?: string;
  visit_type: VisitType;
  triage_level?: TriageLevel;
  chief_complaint?: string;
  status: VisitStatus;
  created_at: string;
  discharge_date?: string;
  plan?: string;
  doctor_name?: string;
  // العلاقات
  hims_patients?: Pick<HimsPatient, 'id' | 'full_name' | 'national_id' | 'blood_type' | 'phone' | 'allergies'>;
  hims_doctors?: Pick<HimsDoctor, 'id' | 'specialization'> & { profile?: { full_name: string } };
  hims_billing?: Pick<HimsBillingRecord, 'payment_status' | 'insurance_provider_id'>;
}

// ─────────────────────────────────────────────
// 4. سجل الفوترة
// ─────────────────────────────────────────────
export type PaymentStatus = 'pending' | 'partial' | 'paid' | 'insurance_pending' | 'waived';

export interface HimsBillingRecord {
  id: string;
  organization_id: string;
  visit_id: string;
  patient_id?: string;
  total_amount: number;
  paid_amount: number;
  insurance_covered_amount?: number;
  insurance_provider_id?: string;
  insurance_claim_id?: string;
  payment_status: PaymentStatus;
  discount_amount?: number;
  discount_approved_by?: string;
  created_at?: string;
  // العلاقات
  hims_patients?: Pick<HimsPatient, 'id' | 'full_name'>;
  insurance?: { id: string; name: string };
}

// ─────────────────────────────────────────────
// 5. الوصفة الطبية
// ─────────────────────────────────────────────
export type PrescriptionStatus = 'pending' | 'dispensed' | 'cancelled' | 'partial';

export interface HimsMedication {
  product_id?: string;
  drug_name: string;
  dosage?: string;
  frequency?: string;
  duration?: string;
  qty?: number;
  notes?: string;
  // FEFO info من product_batches
  batch_number?: string;
  expiry_date?: string;
  barcode?: string;
}

export interface HimsPrescription {
  id: string;
  organization_id: string;
  visit_id: string;
  doctor_id?: string;
  diagnosis?: string;
  medications: HimsMedication[];
  status: PrescriptionStatus;
  dispensed_by?: string;
  dispensed_at?: string;
  created_at?: string;
  // العلاقات
  hims_visits?: Pick<HimsVisit, 'id'> & {
    hims_patients?: Pick<HimsPatient, 'id' | 'full_name' | 'national_id' | 'phone' | 'allergies'>;
    hims_billing?: Pick<HimsBillingRecord, 'payment_status' | 'insurance_provider_id'>;
  };
}

// ─────────────────────────────────────────────
// 6. السرير والجناح
// ─────────────────────────────────────────────
export type BedStatus = 'available' | 'occupied' | 'maintenance' | 'reserved';

export interface HimsWard {
  id: string;
  organization_id: string;
  name: string;
  type?: 'general' | 'icu' | 'pediatric' | 'maternity' | 'surgical' | 'emergency';
  capacity?: number;
  floor?: number;
}

export interface HimsBed {
  id: string;
  organization_id: string;
  ward_id: string;
  bed_number: string;
  status: BedStatus;
  patient_id?: string;
  visit_id?: string;
  // العلاقات
  hims_wards?: Pick<HimsWard, 'id' | 'name' | 'type'>;
  hims_patients?: Pick<HimsPatient, 'id' | 'full_name'>;
}

// ─────────────────────────────────────────────
// 7. العملية الجراحية
// ─────────────────────────────────────────────
export type SurgeryStatus = 'scheduled' | 'in_progress' | 'completed' | 'cancelled' | 'postponed';

export interface HimsSurgery {
  id: string;
  organization_id: string;
  visit_id: string;
  lead_surgeon_id: string;
  surgery_name: string;
  scheduled_start: string;
  scheduled_end?: string;
  actual_start?: string;
  actual_end?: string;
  status: SurgeryStatus;
  anesthesia_type?: string;
  anaesthetist_name?: string;
  operation_room?: string;
  room_number?: string;  // alias used in some queries
  notes?: string;
  created_at?: string;
  // العلاقات
  doctor?: { profiles?: { full_name: string } };
  hims_visits?: Pick<HimsVisit, 'id'> & {
    hims_patients?: Pick<HimsPatient, 'id' | 'full_name'>;
  };
}

// ─────────────────────────────────────────────
// 8. مطالبة التأمين
// ─────────────────────────────────────────────
export type InsuranceClaimStatus = 'draft' | 'submitted' | 'approved' | 'rejected' | 'settled';

export interface HimsInsuranceClaim {
  id: string;
  organization_id: string;
  insurance_provider_id: string;
  batch_ref: string;
  total_claimed_amount: number;
  settled_amount?: number;
  status: InsuranceClaimStatus;
  submitted_at?: string;
  settled_at?: string;
  settlement_bank_account_id?: string;
  created_at?: string;
  // العلاقات
  insurance?: { id: string; name: string };
}

// ─────────────────────────────────────────────
// 9. نتيجة المختبر
// ─────────────────────────────────────────────
export type LabResultStatus = 'pending' | 'in_progress' | 'completed' | 'critical' | 'cancelled';

export interface HimsLabResult {
  id: string;
  organization_id?: string;
  visit_id: string;
  patient_id?: string;
  test_name: string;
  test_code?: string;
  result_value?: string;
  unit?: string;
  reference_range?: string;
  is_critical?: boolean;
  status: LabResultStatus;
  performed_by?: string;
  performed_at?: string;
  created_at?: string;
}

// ─────────────────────────────────────────────
// 10. المؤشرات الحيوية
// ─────────────────────────────────────────────
export interface HimsVitals {
  temp: string;       // الحرارة °C (35.0 – 42.0)
  bp: string;         // ضغط الدم mmHg (format: "120/80")
  pulse: string;      // النبض bpm (30 – 200)
  spo2: string;       // تشبع الأكسجين % (50 – 100)
  weight: string;     // الوزن kg
  height?: string;    // الطول cm
  rr?: string;        // معدل التنفس breaths/min
  recorded_at?: string;
  recorded_by?: string;
}

// حدود القيم الطبية الآمنة
export const VITALS_RANGES = {
  temp:     { min: 30.0, max: 43.0, critical_low: 35.0, critical_high: 40.0, normal_low: 36.5, normal_high: 37.5 },
  pulse:    { min: 20,   max: 220,  critical_low: 40,   critical_high: 160,  normal_low: 60,   normal_high: 100  },
  spo2:     { min: 50,   max: 100,  critical_low: 90,   critical_high: 100,  normal_low: 95,   normal_high: 100  },
  systolic: { min: 50,   max: 260,  critical_low: 80,   critical_high: 180,  normal_low: 90,   normal_high: 140  },
  diastolic:{ min: 30,   max: 160,  critical_low: 50,   critical_high: 110,  normal_low: 60,   normal_high: 90   },
  rr:       { min: 5,    max: 60,   critical_low: 8,    critical_high: 30,   normal_low: 12,   normal_high: 20   },
} as const;

// ─────────────────────────────────────────────
// 11. الملاحظة السريرية (SOAP)
// ─────────────────────────────────────────────
export interface HimsClinicalNote {
  id: string;
  visit_id: string;
  doctor_id?: string;
  subjective?: string;   // S — ما يشكو منه المريض
  objective?: string;    // O — الفحص السريري
  assessment?: string;   // A — التشخيص
  plan?: string;         // P — خطة العلاج
  created_at?: string;
  doctor?: { profiles?: { full_name: string } };
}

// ─────────────────────────────────────────────
// 12. الموعد
// ─────────────────────────────────────────────
export type AppointmentStatus = 'scheduled' | 'arrived' | 'in_consultation' | 'completed' | 'cancelled' | 'no_show';
export type AppointmentPriority = 'normal' | 'urgent' | 'vip';

export interface HimsAppointment {
  id: string;
  organization_id: string;
  patient_id: string;
  doctor_id: string;
  appointment_date: string;
  appointment_time: string;
  queue_number?: number;
  status: AppointmentStatus;
  priority: AppointmentPriority;
  notes?: string;
  visit_id?: string;
  created_at?: string;
  // العلاقات
  hims_patients?: Pick<HimsPatient, 'id' | 'full_name' | 'phone' | 'national_id'>;
  hims_doctors?: Pick<HimsDoctor, 'id' | 'specialization'> & { profile?: { full_name: string } };
}

// ─────────────────────────────────────────────
// Helper: نوع استجابة Supabase العام
// ─────────────────────────────────────────────
export interface SupabaseListResponse<T> {
  data: T[] | null;
  error: { message: string; code?: string } | null;
}

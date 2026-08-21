/**
 * ====================================================================
 * Stadium Module — Centralized TypeScript Interfaces
 * إدارة استاد المنصورة ومركز التنمية الشبابية والمجتمعية
 * TriPro ERP — stadium Module Types
 * ====================================================================
 * هذا الملف يحتوي على جميع الـ interfaces والـ Enums الخاصة بمديول الاستاد.
 * يجب استخدامه في كل ملفات المديول بدلاً من `any`.
 * ====================================================================
 */

// ─────────────────────────────────────────────
// 1. أنواع العضوية والحالة
// ─────────────────────────────────────────────
export type MembershipDuration = 'monthly' | 'quarterly' | 'semi_annual' | 'annual';
export type MembershipCategory = 'individual' | 'family' | 'student' | 'exempt';
export type MemberStatus = 'active' | 'expired' | 'suspended' | 'cancelled';

// ─────────────────────────────────────────────
// 2. أنواع المرافق
// ─────────────────────────────────────────────
export type FacilityType =
  | 'football'
  | 'tennis'
  | 'basketball'
  | 'gym'
  | 'multi_purpose'
  | 'swimming'
  | 'other';

// ─────────────────────────────────────────────
// 3. حالات الحجز
// ─────────────────────────────────────────────
export type BookingStatus = 'pending' | 'confirmed' | 'paid' | 'cancelled' | 'no_show';

// ─────────────────────────────────────────────
// 4. حالات العقود
// ─────────────────────────────────────────────
export type RentalContractStatus = 'active' | 'expired' | 'terminated' | 'pending';
export type BillingCycle = 'weekly' | 'monthly';

export const RENTAL_CYCLE_LABELS: Record<BillingCycle, string> = {
  weekly: 'أسبوعي',
  monthly: 'شهري',
};


// ─────────────────────────────────────────────
// 5. وسائل الدفع
// ─────────────────────────────────────────────
export type PaymentMethod = 'cash' | 'bank_transfer' | 'card' | 'cheque';

// ─────────────────────────────────────────────
// 6. حالات تسجيل البرامج
// ─────────────────────────────────────────────
export type EnrollmentStatus = 'active' | 'completed' | 'cancelled' | 'pending_payment';

// ─────────────────────────────────────────────
// 7. المرفق / الملعب
// ─────────────────────────────────────────────
export interface StadiumFacility {
  id: string;
  organization_id: string;
  name: string;
  type: FacilityType;
  capacity?: number;
  price_per_hour: number;
  peak_price_per_hour?: number;
  description?: string;
  image_url?: string;       // رابط Supabase Storage — لا Base64
  is_active: boolean;
  created_at: string;
  updated_at?: string;
}

// ─────────────────────────────────────────────
// 8. العضو
// ─────────────────────────────────────────────
export interface StadiumMember {
  id: string;
  organization_id: string;
  full_name: string;
  national_id?: string;
  phone?: string;
  email?: string;
  dob?: string;
  gender?: 'male' | 'female';
  photo_url?: string;       // رابط Supabase Storage — لا Base64
  membership_type: MembershipCategory;
  status: MemberStatus;
  start_date?: string;
  end_date?: string;
  notes?: string;
  created_at: string;
  updated_at?: string;
}

// ─────────────────────────────────────────────
// 9. الاشتراك (سجل الحركات)
// ─────────────────────────────────────────────
export interface StadiumSubscription {
  id: string;
  organization_id: string;
  member_id: string;
  membership_type: MembershipCategory;
  duration: MembershipDuration;
  start_date: string;
  end_date: string;
  amount_paid: number;
  payment_method: PaymentMethod;
  payment_date: string;
  journal_entry_id?: string;  // ربط بقيد اليومية
  notes?: string;
  created_by?: string;
  created_at: string;
  // علاقة
  stadium_members?: Pick<StadiumMember, 'id' | 'full_name' | 'phone'>;
}

// ─────────────────────────────────────────────
// 10. الحجز
// ─────────────────────────────────────────────
export interface StadiumBooking {
  id: string;
  organization_id: string;
  facility_id: string;
  member_id?: string;
  booker_name: string;
  booker_phone?: string;
  booking_date: string;
  start_time: string;         // HH:MM
  end_time: string;           // HH:MM
  duration_hours: number;
  price_per_hour: number;
  total_amount: number;
  status: BookingStatus;
  payment_method?: PaymentMethod;
  journal_entry_id?: string;
  notes?: string;
  created_by?: string;
  created_at: string;
  // علاقات
  stadium_facilities?: Pick<StadiumFacility, 'id' | 'name' | 'type'>;
  stadium_members?: Pick<StadiumMember, 'id' | 'full_name'>;
}

// ─────────────────────────────────────────────
// 11. عقد الإيجار
// ─────────────────────────────────────────────
export interface StadiumRentalContract {
  id: string;
  organization_id: string;
  facility_id: string;
  tenant_name: string;
  tenant_phone?: string;
  tenant_email?: string;
  start_date: string;
  end_date: string;
  billing_cycle: BillingCycle;
  amount_per_cycle: number;
  next_due_date?: string;
  status: RentalContractStatus;
  notes?: string;
  created_by?: string;
  created_at: string;
  // علاقة
  stadium_facilities?: Pick<StadiumFacility, 'id' | 'name' | 'type'>;
}

// ─────────────────────────────────────────────
// 12. دفعة الإيجار
// ─────────────────────────────────────────────
export interface StadiumRentalPayment {
  id: string;
  organization_id: string;
  contract_id: string;
  payment_date: string;
  amount_paid: number;
  payment_method: PaymentMethod;
  period_from: string;
  period_to: string;
  journal_entry_id?: string;
  notes?: string;
  created_at: string;
  // علاقة
  stadium_rental_contracts?: Pick<StadiumRentalContract, 'id' | 'tenant_name' | 'facility_id'>;
}

// ─────────────────────────────────────────────
// 13. المدرب / الكادر
// ─────────────────────────────────────────────
export interface StadiumCoach {
  id: string;
  organization_id: string;
  full_name: string;
  phone?: string;
  email?: string;
  specialization?: string;
  commission_rate: number;    // نسبة من 0 إلى 1 (مثال: 0.3 = 30%)
  photo_url?: string;
  is_active: boolean;
  notes?: string;
  created_at: string;
}

// ─────────────────────────────────────────────
// 14. برنامج التدريب
// ─────────────────────────────────────────────
export interface StadiumTrainingProgram {
  id: string;
  organization_id: string;
  name: string;
  category?: string;
  coach_id?: string;
  start_date: string;
  end_date: string;
  schedule_description?: string;
  capacity: number;
  enrolled_count: number;
  fee_per_participant: number;
  is_active: boolean;
  notes?: string;
  created_at: string;
  // علاقة
  stadium_coaches?: Pick<StadiumCoach, 'id' | 'full_name' | 'commission_rate'>;
}

// ─────────────────────────────────────────────
// 15. تسجيل مشارك في برنامج
// ─────────────────────────────────────────────
export interface StadiumProgramEnrollment {
  id: string;
  organization_id: string;
  program_id: string;
  member_id?: string;
  participant_name: string;
  participant_phone?: string;
  enrollment_date: string;
  amount_paid: number;
  payment_method: PaymentMethod;
  journal_entry_id?: string;
  status: EnrollmentStatus;
  notes?: string;
  created_at: string;
  // علاقات
  stadium_training_programs?: Pick<StadiumTrainingProgram, 'id' | 'name' | 'fee_per_participant'>;
}

// ─────────────────────────────────────────────
// 16. مدفوعات الكوادر
// ─────────────────────────────────────────────
export interface StadiumCoachPayment {
  id: string;
  organization_id: string;
  coach_id: string;
  program_id?: string;
  period_from: string;
  period_to: string;
  gross_revenue: number;
  commission_rate: number;
  amount_paid: number;
  payment_date: string;
  payment_method: PaymentMethod;
  journal_entry_id?: string;
  notes?: string;
  created_at: string;
  // علاقات
  stadium_coaches?: Pick<StadiumCoach, 'id' | 'full_name'>;
}

// ─────────────────────────────────────────────
// 17. إعدادات المديول (حسابات افتراضية)
// ─────────────────────────────────────────────
export interface StadiumAccountingConfig {
  // حسابات الإيرادات — قابلة للتعديل من إعدادات المديول
  subscriptions_revenue_account: string;   // إيرادات الاشتراكات الرياضية (افتراضي: 4101)
  bookings_revenue_account: string;        // إيرادات حجوزات الملاعب (افتراضي: 4102)
  rentals_revenue_account: string;         // إيرادات الإيجارات (افتراضي: 4103)
  programs_revenue_account: string;        // إيرادات البرامج التدريبية (افتراضي: 4104)
  // حسابات التكاليف
  coaches_expense_account: string;         // تكاليف الكوادر الرياضية (افتراضي: 5201)
  // حساب الخزينة/البنك
  cash_account: string;                    // الخزينة الرئيسية (افتراضي: 1011)
  // مركز التكلفة
  cost_center_id?: string;                 // مركز تكلفة الاستاد
}

// ─────────────────────────────────────────────
// 18. الحسابات الافتراضية (Default Config)
// ─────────────────────────────────────────────
export const DEFAULT_STADIUM_ACCOUNTING: StadiumAccountingConfig = {
  // ─ إيرادات الاشتراكات الرياضية ─
  subscriptions_revenue_account: '4101',
  // ─ إيرادات حجوزات الملاعب ─
  bookings_revenue_account: '4102',
  // ─ إيرادات الإيجارات ─
  rentals_revenue_account: '4103',
  // ─ إيرادات البرامج التدريبية ─
  programs_revenue_account: '4104',
  // ─ تكاليف الكوادر الرياضية ─
  coaches_expense_account: '5201',
  // ─ الخزينة الرئيسية ─
  cash_account: '1011',
};

// ─────────────────────────────────────────────
// 19. أسماء أنواع المرافق بالعربية
// ─────────────────────────────────────────────
export const FACILITY_TYPE_LABELS: Record<FacilityType, string> = {
  football: 'ملعب كرة قدم',
  tennis: 'ملعب تنس',
  basketball: 'ملعب كرة سلة',
  gym: 'صالة رياضية',
  multi_purpose: 'قاعة متعددة الأغراض',
  swimming: 'حمام سباحة',
  other: 'أخرى',
};

// ─────────────────────────────────────────────
// 20. أسماء أنواع العضوية بالعربية
// ─────────────────────────────────────────────
export const MEMBERSHIP_CATEGORY_LABELS: Record<MembershipCategory, string> = {
  individual: 'فردي',
  family: 'عائلي',
  student: 'طالب',
  exempt: 'معفى',
};

export const MEMBERSHIP_DURATION_LABELS: Record<MembershipDuration, string> = {
  monthly: 'شهري',
  quarterly: 'ربع سنوي',
  semi_annual: 'نصف سنوي',
  annual: 'سنوي',
};

export const MEMBER_STATUS_LABELS: Record<MemberStatus, string> = {
  active: 'نشط',
  expired: 'منتهي',
  suspended: 'موقوف',
  cancelled: 'ملغى',
};

export const BOOKING_STATUS_LABELS: Record<BookingStatus, string> = {
  pending: 'في الانتظار',
  confirmed: 'مؤكد',
  paid: 'مدفوع',
  cancelled: 'ملغى',
  no_show: 'لم يحضر',
};

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  cash: 'نقدي',
  bank_transfer: 'تحويل بنكي',
  card: 'بطاقة',
  cheque: 'شيك',
};

// ─────────────────────────────────────────────
// 21. KPI Cards للـ Dashboard
// ─────────────────────────────────────────────
export interface StadiumKPIs {
  activeMembers: number;
  todayRevenue: number;
  monthRevenue: number;
  todayBookings: number;
  activeFacilities: number;
  activeContracts: number;
  expiringMembersSoon: number;   // ينتهي خلال 7 أيام
  overdueRentals: number;
}

// ─────────────────────────────────────────────
// 22. نتيجة توليد القيد
// ─────────────────────────────────────────────
export interface JournalEntryResult {
  success: boolean;
  journalEntryId?: string;
  error?: string;
}

// ─────────────────────────────────────────────
// 23. طلبات واعتمادات الصرف المالي (Disbursements)
// ─────────────────────────────────────────────
export type StadiumDisbursementCategory = 
  | 'maintenance'     // صيانة ملاعب ومرافق
  | 'supplies'        // مهمات ومستلزمات وأدوات رياضية
  | 'tournament'      // تنظيم بطولات ومسابقات ومعسكرات
  | 'utilities'       // فواتير كهرباء ومياه وخدمات
  | 'staff'           // بدلات ومكافآت وإكراميات
  | 'administrative'  // مصروفات إدارية ونثرية
  | 'other';          // أخرى

export type StadiumDisbursementPaymentType = 'cheque' | 'custody' | 'bank_transfer' | 'cash';
export type StadiumDisbursementStatus = 'draft' | 'pending_admin' | 'pending_finance' | 'approved' | 'paid' | 'rejected';

export interface StadiumDisbursementRequest {
  id: string;
  organization_id: string;
  request_number: string;
  title: string;
  purpose: string;
  category: StadiumDisbursementCategory;
  facility_id?: string | null;
  amount: number;
  payment_type: StadiumDisbursementPaymentType;
  beneficiary_name: string;
  beneficiary_details?: string | null;
  expense_account_code: string;
  status: StadiumDisbursementStatus;
  cheque_id?: string | null;
  journal_entry_id?: string | null;
  rejection_reason?: string | null;
  notes?: string | null;
  created_by?: string | null;
  created_at?: string;
  updated_at?: string;
  stadium_facilities?: { name: string } | null;
  cheques?: { cheque_number: string; bank_name: string; status: string } | null;
}

export const DISBURSEMENT_CATEGORY_LABELS: Record<StadiumDisbursementCategory, string> = {
  maintenance: 'صيانة ملاعب ومرافق',
  supplies: 'مهمات وأدوات رياضية',
  tournament: 'بطولات ومعسكرات رياضية',
  utilities: 'فواتير تشغيل ومرافق',
  staff: 'بدلات ومكافآت كوادر',
  administrative: 'مصروفات إدارية ونثرية',
  other: 'مصروفات أخرى',
};

export const DISBURSEMENT_STATUS_LABELS: Record<StadiumDisbursementStatus, string> = {
  draft: 'مسودة',
  pending_admin: 'بانتظار الاعتماد الإداري',
  pending_finance: 'بانتظار الاعتماد المالي',
  approved: 'معتمد للصرف',
  paid: 'تم الصرف والشيك',
  rejected: 'مرفوض',
};

export const DISBURSEMENT_STATUS_COLORS: Record<StadiumDisbursementStatus, string> = {
  draft: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
  pending_admin: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300',
  pending_finance: 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300',
  approved: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300',
  paid: 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300',
  rejected: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300',
};

// ─────────────────────────────────────────────
// 24. عهد الأنشطة والبطولات والصيانة (Custodies)
// ─────────────────────────────────────────────
export type StadiumCustodyType = 'temporary' | 'permanent';
export type StadiumCustodyStatus = 'active' | 'settled' | 'overdue';

export interface StadiumCustody {
  id: string;
  organization_id: string;
  custodian_name: string;
  custodian_phone?: string | null;
  purpose: string;
  total_amount: number;
  spent_amount: number;
  remaining_amount: number;
  custody_type: StadiumCustodyType;
  disbursement_method: 'cheque' | 'cash' | 'bank_transfer';
  cheque_number?: string | null;
  status: StadiumCustodyStatus;
  issue_date: string;
  settlement_date?: string | null;
  journal_entry_id?: string | null;
  settlement_journal_id?: string | null;
  notes?: string | null;
  created_by?: string | null;
  created_at?: string;
  updated_at?: string;
}

export const CUSTODY_TYPE_LABELS: Record<StadiumCustodyType, string> = {
  temporary: 'عهدة مؤقتة (لغرض محدد)',
  permanent: 'عهدة مستديمة (نثرية)',
};

export const CUSTODY_STATUS_LABELS: Record<StadiumCustodyStatus, string> = {
  active: 'جارية / مفتوحة',
  settled: 'تمت التسوية بالكامل',
  overdue: 'متأخرة التسوية',
};

export const CUSTODY_STATUS_COLORS: Record<StadiumCustodyStatus, string> = {
  active: 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300',
  settled: 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300',
  overdue: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300',
};

// ─────────────────────────────────────────────
// 25. سجلات الدخول للبوابات الذكية (Gate Logs)
// ─────────────────────────────────────────────
export interface StadiumGateLog {
  id: string;
  organization_id: string;
  member_id?: string | null;
  member_name: string;
  national_id?: string | null;
  membership_type?: string | null;
  gate_name: string;
  access_status: 'granted' | 'denied';
  reason?: string | null;
  scanned_at: string;
  scanned_by?: string | null;
  created_at?: string;
}

// ─────────────────────────────────────────────
// 26. صيانة الملاعب والمرافق (Facility Maintenance)
// ─────────────────────────────────────────────
export type MaintenanceType = 'routine' | 'emergency' | 'turf' | 'lighting' | 'pool_pumps' | 'gym_equipment' | 'other';
export type MaintenancePriority = 'low' | 'normal' | 'high' | 'urgent';
export type MaintenanceStatus = 'scheduled' | 'in_progress' | 'completed' | 'cancelled';

export interface StadiumMaintenanceTicket {
  id: string;
  organization_id: string;
  facility_id: string;
  ticket_number: string;
  title: string;
  maintenance_type: MaintenanceType;
  priority: MaintenancePriority;
  start_date: string;
  end_date: string;
  start_time?: string | null;
  end_time?: string | null;
  is_blocking_bookings: boolean;
  estimated_cost: number;
  actual_cost: number;
  assigned_technician?: string | null;
  status: MaintenanceStatus;
  journal_entry_id?: string | null;
  payment_method?: string | null;
  notes?: string | null;
  created_at?: string;
  updated_at?: string;
  stadium_facilities?: {
    name: string;
    type: string;
  };
}


export const MAINTENANCE_TYPE_LABELS: Record<MaintenanceType, string> = {
  routine: 'صيانة دورية وقائية',
  emergency: 'صيانة طارئة وعاجلة',
  turf: 'صيانة أرضيات ونجيل الملاعب',
  lighting: 'صيانة كشافات وأعمدة الإنارة',
  pool_pumps: 'صيانة طلمبات وفلاتر السباحة',
  gym_equipment: 'صيانة أجهزة ومعدات الجيم',
  other: 'أعمال صيانة أخرى',
};

export const MAINTENANCE_STATUS_LABELS: Record<MaintenanceStatus, string> = {
  scheduled: 'مجدولة',
  in_progress: 'قيد التنفيذ',
  completed: 'مكتملة بنجاح',
  cancelled: 'ملغاة',
};

export const MAINTENANCE_STATUS_COLORS: Record<MaintenanceStatus, string> = {
  scheduled: 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300',
  in_progress: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300',
  completed: 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300',
  cancelled: 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300',
};

// ─────────────────────────────────────────────
// 27. الموازنة التقديرية للاستاد (Budgets)
// ─────────────────────────────────────────────
export type StadiumExpenseCategory = 'maintenance' | 'supplies' | 'tournaments' | 'utilities' | 'coaches' | 'admin' | 'other';

export const EXPENSE_CATEGORY_LABELS: Record<StadiumExpenseCategory, string> = {
  maintenance: 'صيانة الملاعب والمرافق (5101)',
  supplies: 'مهمات وأدوات رياضية (5102)',
  tournaments: 'مصروفات البطولات والأنشطة والعهد (5103)',
  utilities: 'فواتير تشغيل وخدمات الاستاد (5104)',
  coaches: 'مستحقات وعمولات الكوادر والمدربين (5201)',
  admin: 'مصروفات إدارية وعمومية (5301)',
  other: 'مصروفات أخرى متنوعة (539)',
};

export interface StadiumBudget {
  id: string;
  organization_id: string;
  fiscal_year: number;
  category: StadiumExpenseCategory;
  expense_account_code: string;
  allocated_amount: number;
  spent_amount: number;
  notes?: string | null;
  created_at?: string;
  updated_at?: string;
}


// ─────────────────────────────────────────────
// 28. البطولات والمهرجانات الرياضية (Tournaments)
// ─────────────────────────────────────────────
export type TournamentStatus = 'upcoming' | 'ongoing' | 'completed' | 'cancelled';

export interface StadiumTournament {
  id: string;
  organization_id: string;
  name: string;
  sport_type: string;
  facility_id?: string | null;
  start_date: string;
  end_date: string;
  team_entry_fee: number;
  max_teams: number;
  total_prizes: number;
  total_sponsorship: number;
  estimated_budget: number;
  actual_expenses: number;
  status: TournamentStatus;
  organizer_name?: string | null;
  notes?: string | null;
  created_at?: string;
  updated_at?: string;
  stadium_facilities?: {
    name: string;
  };
  teams_count?: number;
}

export interface StadiumTournamentTeam {
  id: string;
  organization_id: string;
  tournament_id: string;
  team_name: string;
  captain_name: string;
  captain_phone: string;
  entry_fee_paid: number;
  payment_status: 'paid' | 'partial' | 'unpaid';
  payment_method: string;
  journal_entry_id?: string | null;
  ranking?: number | null;
  notes?: string | null;
  created_at?: string;
}

export const TOURNAMENT_STATUS_LABELS: Record<TournamentStatus, string> = {
  upcoming: 'قادمة / تسجيل الفرق',
  ongoing: 'جارية حالياً',
  completed: 'مكتملة',
  cancelled: 'ملغاة',
};

export const TOURNAMENT_STATUS_COLORS: Record<TournamentStatus, string> = {
  upcoming: 'bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300',
  ongoing: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300',
  completed: 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300',
  cancelled: 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300',
};



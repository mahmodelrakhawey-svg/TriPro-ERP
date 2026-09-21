export const AVAILABLE_MODULES = [
  { id: 'accounting', label: 'المحاسبة العامة' },
  { id: 'sales', label: 'المبيعات والعملاء' },
  { id: 'purchases', label: 'المشتريات والموردين' },
  { id: 'inventory', label: 'المخازن والأصناف' },
  { id: 'restaurant', label: 'مديول المطاعم' },
  { id: 'retail', label: 'نقاط بيع التجزئة (هايبرماركت)' },
  { id: 'hr', label: 'الموارد البشرية' },
  { id: 'manufacturing', label: 'التصنيع والإنتاج' },
  { id: 'construction', label: 'المقاولات والمشاريع' },
  { id: 'hims', label: 'مديول المستشفيات (HIMS)' },
  { id: 'stadium', label: 'إدارة الاستاد والمركز الشبابي' },
];

export const PLAN_CONFIGS: Record<string, { name: string, maxUsers: number, modules: string[] }> = {
  basic: {
    name: 'الباقة الأساسية (مستخدمين: 2)',
    maxUsers: 2,
    modules: ['accounting', 'sales']
  },
  pro: {
    name: 'الباقة الاحترافية (مستخدمين: 5)',
    maxUsers: 5,
    modules: ['accounting', 'sales', 'purchases', 'inventory', 'hr']
  },
  sports: {
    name: 'باقة الأندية والاستادات الرياضية (مستخدمين: 10)',
    maxUsers: 10,
    modules: ['accounting', 'hr', 'stadium']
  },
  premium: {
    name: 'الباقة المتكاملة (مستخدمين: 20)',
    maxUsers: 20,
    modules: ['accounting', 'sales', 'purchases', 'inventory', 'hr', 'restaurant', 'manufacturing', 'construction', 'hims', 'stadium']
  }
};

export interface PlatformStats {
  total_platform_sales: number;
  total_organizations: number;
  active_subscriptions: number;
  growth_this_month_percent: number;
  new_registrations_today: number;
}

export interface Organization {
  id: string;
  name: string;
  is_active: boolean;
  subscription_expiry: string;
  allowed_modules: string[];
  created_at: string;
  max_users: number;
  activity_type?: string;
  user_count?: number;
  suspension_reason?: string;
  total_sales?: number;
  total_collected?: number;
  next_payment_date?: string;
  logo_url?: string;
}

export interface OrganizationBackup {
  id: string;
  organization_id: string;
  backup_date: string;
  backup_data: any; // jsonb
  file_size_kb: number;
  created_by: string; // auth.users.id
  profiles: { full_name: string } | null; // Joined from profiles table
  notes: string;
}

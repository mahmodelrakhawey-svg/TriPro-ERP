/**
 * ====================================================================
 * HIMS Module — Shared Helper Functions
 * Hospital Information Management System — TriPro ERP
 * ====================================================================
 * دوال مساعدة مشتركة بين جميع ملفات موديول المستشفيات.
 * تضمن الأمان، التوحيد، والتحقق الطبي الصحيح.
 * ====================================================================
 */

import { User } from '../../types';
import { VITALS_RANGES, HimsVitals } from './hims.types';

// ─────────────────────────────────────────────
// 1. الحصول على organization_id بأمان
// ─────────────────────────────────────────────
/**
 * يُعيد organization_id من المستخدم الحالي بأمان.
 * يُرجع null إذا لم يكن المستخدم مسجلاً أو لا ينتمي لمنظمة.
 */
export function getOrgId(currentUser: User | null): string | null {
  if (!currentUser) return null;
  return (currentUser as any).organization_id || null;
}

// ─────────────────────────────────────────────
// 2. تحييد نصوص XML (منع XSS في التصدير)
// ─────────────────────────────────────────────
/**
 * يُحيّد الحروف الخاصة في XML لمنع حقن البيانات وكسر الملفات.
 * يجب استخدامه قبل إدراج أي بيانات مستخدم في XML.
 */
export function sanitizeXml(str: string): string {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, ''); // حذف control characters
}

// ─────────────────────────────────────────────
// 3. تحييد نصوص HTML (منع XSS في التقارير)
// ─────────────────────────────────────────────
/**
 * يُحيّد الحروف الخاصة في HTML لمنع XSS في تقارير PDF.
 * يجب استخدامه على كل القيم الديناميكية في LuxuryReportEngine.
 */
export function sanitizeHtml(str: string | null | undefined): string {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .replace(/\//g, '&#x2F;');
}

// ─────────────────────────────────────────────
// 4. التحقق الطبي من القيم الحيوية
// ─────────────────────────────────────────────
export type VitalsValidationLevel = 'normal' | 'abnormal' | 'critical' | 'invalid';

export interface VitalsFieldValidation {
  level: VitalsValidationLevel;
  message?: string;
}

export interface VitalsValidationResult {
  isValid: boolean;
  hasCritical: boolean;
  hasAbnormal: boolean;
  fields: {
    temp: VitalsFieldValidation;
    pulse: VitalsFieldValidation;
    spo2: VitalsFieldValidation;
    systolic: VitalsFieldValidation;
    diastolic: VitalsFieldValidation;
    rr?: VitalsFieldValidation;
  };
}

function validateSingleVital(
  value: string,
  rangeKey: keyof typeof VITALS_RANGES,
  label: string
): VitalsFieldValidation {
  if (!value || value.trim() === '') {
    return { level: 'invalid', message: `${label} مطلوب` };
  }
  const num = parseFloat(value);
  if (isNaN(num)) {
    return { level: 'invalid', message: `${label}: قيمة غير صحيحة` };
  }

  const range = VITALS_RANGES[rangeKey];
  if (num < range.min || num > range.max) {
    return { level: 'invalid', message: `${label}: خارج النطاق المسموح (${range.min}–${range.max})` };
  }
  if (num <= range.critical_low || num >= range.critical_high) {
    return { level: 'critical', message: `⚠️ تحذير حرج: ${label} = ${num} (طارئ طبي!)` };
  }
  if (num < range.normal_low || num > range.normal_high) {
    return { level: 'abnormal', message: `${label}: خارج النطاق الطبيعي (${range.normal_low}–${range.normal_high})` };
  }
  return { level: 'normal' };
}

/**
 * يتحقق طبياً من صحة جميع القيم الحيوية.
 * يُعيد حالة كل حقل ومستوى الخطر.
 */
export function validateVitals(vitals: HimsVitals): VitalsValidationResult {
  // تحليل ضغط الدم (format: "120/80")
  const bpParts = vitals.bp?.split('/') || [];
  const systolicStr = bpParts[0]?.trim() || '';
  const diastolicStr = bpParts[1]?.trim() || '';

  const tempValidation = validateSingleVital(vitals.temp, 'temp', 'الحرارة');
  const pulseValidation = validateSingleVital(vitals.pulse, 'pulse', 'النبض');
  const spo2Validation = validateSingleVital(vitals.spo2, 'spo2', 'الأكسجين');
  const systolicValidation = validateSingleVital(systolicStr, 'systolic', 'الضغط الانقباضي');
  const diastolicValidation = validateSingleVital(diastolicStr, 'diastolic', 'الضغط الانبساطي');

  const rrValidation = vitals.rr
    ? validateSingleVital(vitals.rr, 'rr', 'التنفس')
    : undefined;

  const allFields = [tempValidation, pulseValidation, spo2Validation, systolicValidation, diastolicValidation];
  if (rrValidation) allFields.push(rrValidation);

  const hasCritical = allFields.some(f => f.level === 'critical');
  const hasAbnormal = allFields.some(f => f.level === 'abnormal');
  const hasInvalid = allFields.some(f => f.level === 'invalid');

  return {
    isValid: !hasInvalid,
    hasCritical,
    hasAbnormal,
    fields: {
      temp: tempValidation,
      pulse: pulseValidation,
      spo2: spo2Validation,
      systolic: systolicValidation,
      diastolic: diastolicValidation,
      rr: rrValidation,
    },
  };
}

// ─────────────────────────────────────────────
// 5. تنسيق العملة
// ─────────────────────────────────────────────
/**
 * يُنسق قيمة مالية بالجنيه المصري.
 */
export function formatCurrency(amount: number, currency = 'EGP'): string {
  if (isNaN(amount)) return `0.00 ${currency}`;
  return `${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`;
}

// ─────────────────────────────────────────────
// 6. التحقق من الرقم القومي المصري (14 رقم)
// ─────────────────────────────────────────────
/**
 * يتحقق من صحة الرقم القومي المصري.
 * - يجب أن يكون 14 رقماً
 * - يجب أن يبدأ بـ 2 أو 3 (مواليد 1900-2099)
 */
export function validateEgyptianNationalId(id: string): { isValid: boolean; message?: string } {
  if (!id || id.trim() === '') {
    return { isValid: false, message: 'الرقم القومي مطلوب' };
  }
  const cleanId = id.trim().replace(/\s/g, '');
  if (!/^\d{14}$/.test(cleanId)) {
    return { isValid: false, message: 'الرقم القومي يجب أن يكون 14 رقماً فقط' };
  }
  const century = cleanId[0];
  if (century !== '2' && century !== '3') {
    return { isValid: false, message: 'الرقم القومي غير صحيح (الرقم الأول يجب أن يكون 2 أو 3)' };
  }
  return { isValid: true };
}

// ─────────────────────────────────────────────
// 7. استخراج تاريخ الميلاد من الرقم القومي
// ─────────────────────────────────────────────
/**
 * يستخرج تاريخ الميلاد والنوع من الرقم القومي المصري.
 */
export function parseNationalId(id: string): {
  dob?: string;
  gender?: 'male' | 'female';
  isValid: boolean;
} {
  const { isValid } = validateEgyptianNationalId(id);
  if (!isValid) return { isValid: false };

  const century = id[0] === '2' ? '19' : '20';
  const year = century + id.slice(1, 3);
  const month = id.slice(3, 5);
  const day = id.slice(5, 7);
  const genderDigit = parseInt(id[12]);

  return {
    dob: `${year}-${month}-${day}`,
    gender: genderDigit % 2 !== 0 ? 'male' : 'female',
    isValid: true,
  };
}

// ─────────────────────────────────────────────
// 8. تحديد لون مستوى الطوارئ
// ─────────────────────────────────────────────
export function getTriageColor(level: string): string {
  const colors: Record<string, string> = {
    level_1_resuscitation: '#dc2626', // أحمر داكن
    level_2_emergent:      '#ea580c', // برتقالي
    level_3_urgent:        '#ca8a04', // أصفر
    level_4_less_urgent:   '#16a34a', // أخضر
    level_5_non_urgent:    '#2563eb', // أزرق
  };
  return colors[level] || '#6b7280';
}

export function getTriageLabel(level: string): string {
  const labels: Record<string, string> = {
    level_1_resuscitation: 'P1 — إنعاش فوري',
    level_2_emergent:      'P2 — طارئ جداً',
    level_3_urgent:        'P3 — عاجل',
    level_4_less_urgent:   'P4 — أقل إلحاحاً',
    level_5_non_urgent:    'P5 — غير عاجل',
  };
  return labels[level] || level;
}

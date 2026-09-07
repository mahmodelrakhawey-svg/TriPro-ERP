/**
 * دوال مساعدة لتنسيق الأرقام والنسب المئوية بشكل آمن
 * تتجنب أخطاء .toLocaleString() على القيم الفارغة (null/undefined)
 */

export const formatNumber = (value: number | null | undefined, options?: Intl.NumberFormatOptions) => {
  const numericValue = value ?? 0; // استخدام Nullish coalescing لتعيين 0 كقيمة افتراضية
  return numericValue.toLocaleString(undefined, options);
};

export const formatPercentage = (value: number | null | undefined, options?: Intl.NumberFormatOptions) => {
  const numericValue = value ?? 0;
  return `${numericValue.toLocaleString(undefined, options)}%`;
};

export const formatOptionalNumber = (value: number | null | undefined, options?: Intl.NumberFormatOptions) => {
  if (value === null || value === undefined || value === 0) return '-';
  return value.toLocaleString(undefined, options);
};
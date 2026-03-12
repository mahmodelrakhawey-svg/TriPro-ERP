/**
 * Zod Validation Schemas for Security
 * Schemas لتحقق من صحة البيانات الآمنة
 */

import { z } from 'zod';

// User Authentication
export const LoginSchema = z.object({
  email: z.string()
    .min(1, 'البريد الإلكتروني مطلوب')
    .email('صيغة البريد الإلكتروني غير صحيحة')
    .max(255, 'البريد الإلكتروني طويل جداً'),
  password: z.string()
    .min(8, 'كلمة المرور يجب أن تكون 8 أحرف على الأقل')
    .max(128, 'كلمة المرور طويلة جداً')
    .regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/, 'كلمة المرور يجب أن تحتوي على أحرف كبيرة وصغيرة وأرقام'),
});

export const PinSchema = z.string()
  .length(4, 'الرقم السري يجب أن يكون 4 أرقام')
  .regex(/^\d+$/, 'الرقم السري يجب أن يكون أرقاماً فقط');

// Account
export const AccountSchema = z.object({
  code: z.string()
    .min(1, 'رمز الحساب مطلوب')
    .max(50, 'رمز الحساب طويل جداً')
    .regex(/^[a-zA-Z0-9\-_]+$/, 'رمز الحساب يحتوي على أحرف غير صحيحة'),
  name: z.string()
    .min(1, 'اسم الحساب مطلوب')
    .max(255, 'اسم الحساب طويل جداً'),
  type: z.enum(['ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'EXPENSE']),
  is_group: z.boolean(),
  is_active: z.boolean(),
  parent_account: z.string().nullable().optional(),
});

// Journal Entry
export const JournalEntryLineSchema = z.object({
  account_id: z.string()
    .min(1, 'رمز الحساب مطلوب'),
  description: z.string().max(500).optional(),
  debit: z.number()
    .min(0, 'المدين لا يمكن أن يكون سالباً')
    .max(999999999, 'المبلغ كبير جداً'),
  credit: z.number()
    .min(0, 'الدائن لا يمكن أن يكون سالباً')
    .max(999999999, 'المبلغ كبير جداً'),
});

export const JournalEntrySchema = z.object({
  date: z.string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'صيغة التاريخ غير صحيحة'),
  description: z.string()
    .min(1, 'الوصف مطلوب')
    .max(500, 'الوصف طويل جداً'),
  reference: z.string()
    .max(100, 'المرجع طويل جداً')
    .optional(),
  lines: z.array(JournalEntryLineSchema)
    .min(2, 'القيد يجب أن يحتوي على سطرين على الأقل'),
}).refine(
  (data) => {
    const totalDebit = data.lines.reduce((sum, line) => sum + line.debit, 0);
    const totalCredit = data.lines.reduce((sum, line) => sum + line.credit, 0);
    return Math.abs(totalDebit - totalCredit) < 0.01; // Allow for rounding
  },
  { message: 'المدين والدائن يجب أن يكونا متساويين', path: ['lines'] }
);

// Customer
export const CustomerSchema = z.object({
  name: z.string()
    .min(1, 'اسم العميل مطلوب')
    .max(255, 'اسم العميل طويل جداً'),
  email: z.string()
    .email('صيغة البريد الإلكتروني غير صحيحة')
    .max(255)
    .optional()
    .or(z.literal('')),
  phone: z.string()
    .regex(/^[\d\s\-\+\(\)]{10,}$/, 'رقم الهاتف غير صحيح')
    .optional()
    .or(z.literal('')),
  address: z.string()
    .max(500)
    .optional(),
  tax_id: z.string()
    .max(50)
    .optional(),
  credit_limit: z.number()
    .min(0, 'حد الائتمان لا يمكن أن يكون سالباً')
    .optional(),
});

// Supplier
export const SupplierSchema = z.object({
  name: z.string()
    .min(1, 'اسم المورد مطلوب')
    .max(255, 'اسم المورد طويل جداً'),
  email: z.string()
    .email('صيغة البريد الإلكتروني غير صحيحة')
    .max(255)
    .optional()
    .or(z.literal('')),
  phone: z.string()
    .regex(/^[\d\s\-\+\(\)]{10,}$/, 'رقم الهاتف غير صحيح')
    .optional()
    .or(z.literal('')),
  address: z.string()
    .max(500)
    .optional(),
  tax_id: z.string()
    .max(50)
    .optional(),
});

// Product
export const ProductSchema = z.object({
  name: z.string()
    .min(1, 'اسم المنتج مطلوب')
    .max(255, 'اسم المنتج طويل جداً'),
  sku: z.string()
    .max(50, 'الكود التسلسلي طويل جداً')
    .optional(),
  price: z.number()
    .min(0, 'السعر لا يمكن أن يكون سالباً')
    .max(999999999, 'السعر كبير جداً'),
  cost: z.number()
    .min(0, 'التكلفة لا يمكن أن تكون سالبة')
    .max(999999999, 'التكلفة كبيرة جداً'),
  stock: z.number()
    .min(0, 'المخزون لا يمكن أن يكون سالباً')
    .int('المخزون يجب أن يكون رقماً صحيحاً'),
});

// Invoice
export const InvoiceLineSchema = z.object({
  product_id: z.string().min(1, 'معرف المنتج مطلوب'),
  quantity: z.number()
    .min(0.001, 'الكمية يجب أن تكون أكبر من صفر')
    .max(999999, 'الكمية كبيرة جداً'),
  unit_price: z.number()
    .min(0, 'سعر الوحدة لا يمكن أن يكون سالباً')
    .max(999999999, 'سعر الوحدة كبير جداً'),
});

export const InvoiceSchema = z.object({
  customer_id: z.string().min(1, 'معرف العميل مطلوب'),
  invoice_date: z.string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'صيغة التاريخ غير صحيحة'),
  items: z.array(InvoiceLineSchema)
    .min(1, 'الفاتورة يجب أن تحتوي على سطر واحد على الأقل'),
  notes: z.string()
    .max(1000)
    .optional(),
});

/**
 * Safe validation function with error handling
 */
export function validateData<T>(schema: z.ZodSchema, data: unknown): { success: boolean; data?: T; errors?: string[] } {
  try {
    const validated = schema.parse(data);
    return { success: true, data: validated as T };
  } catch (error: unknown) {
    if (error instanceof z.ZodError) {
      const errors = error.issues.map((issue: z.ZodIssue) => `${issue.path.join('.')}: ${issue.message}`);
      return { success: false, errors };
    }
    return { success: false, errors: ['خطأ في التحقق من البيانات'] };
  }
}

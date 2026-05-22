import { z } from 'zod';

/**
 * 🛡️ مخططات التحقق الشاملة لنظام TriPro ERP
 * تهدف لضمان جودة البيانات ومنع الأخطاء المحاسبية والتشغيلية
 */

// --- القواعد المشتركة (Common Rules) ---
const uuidSchema = z.string().uuid({ message: "معرف غير صحيح" });

// --- 1. مديول العملاء والموردين (CRM & Stakeholders) ---
export const CustomerSchema = z.object({
  name: z.string().min(3, { message: "الاسم يجب أن يكون 3 أحرف على الأقل" }),
  phone: z.string().optional().or(z.literal('')),
  email: z.string().email({ message: "البريد الإلكتروني غير صحيح" }).optional().or(z.literal('')),
  tax_number: z.string().optional().or(z.literal('')),
  address: z.string().optional().or(z.literal('')),
  credit_limit: z.number().nonnegative().default(0),
});

export const SupplierSchema = CustomerSchema;

// --- 2. مديول المنتجات والمخزون (Inventory) ---
export const ProductSchema = z.object({
  name: z.string().min(2, { message: "اسم المنتج قصير جداً" }),
  sku: z.string().optional().or(z.literal('')),
  barcode: z.string().optional().or(z.literal('')),
  sales_price: z.number().nonnegative({ message: "سعر البيع لا يمكن أن يكون سالباً" }).default(0),
  purchase_price: z.number().nonnegative({ message: "سعر الشراء لا يمكن أن يكون سالباً" }).default(0),
  category_id: uuidSchema.optional().nullable(),
  product_type: z.enum(['STOCK', 'SERVICE', 'NON_STOCK']).default('STOCK'),
  mfg_type: z.enum(['raw', 'standard', 'intermediate']).default('standard'),
  min_stock_level: z.number().nonnegative().default(0),
});

// --- 3. مديول المحاسبة (Accounting) ---
export const JournalLineSchema = z.object({
  account_id: uuidSchema,
  debit: z.number().nonnegative().default(0),
  credit: z.number().nonnegative().default(0),
  description: z.string().optional().or(z.literal('')),
  cost_center_id: uuidSchema.optional().nullable(),
}).refine(data => (data.debit > 0) !== (data.credit > 0), {
  message: "يجب إدخال إما مبلغ مدين أو دائن فقط في السطر الواحد",
  path: ['debit']
});

export const JournalEntrySchema = z.object({
  transaction_date: z.string(),
  description: z.string().min(5, { message: "الوصف يجب أن يكون معبراً (5 أحرف على الأقل)" }),
  reference: z.string().optional().or(z.literal('')),
  lines: z.array(JournalLineSchema).min(2, { message: "القيد يجب أن يحتوي على سطرين على الأقل" }),
}).refine(data => {
  const totalDebit = data.lines.reduce((sum, l) => sum + (l.debit || 0), 0);
  const totalCredit = data.lines.reduce((sum, l) => sum + (l.credit || 0), 0);
  return Math.abs(totalDebit - totalCredit) < 0.01;
}, {
  message: "القيد غير متوازن (إجمالي المدين لا يساوي إجمالي الدائن)",
  path: ['lines']
});

// --- 4. مديول المبيعات والمشتريات (Sales & Purchases) ---
export const InvoiceItemSchema = z.object({
  product_id: uuidSchema,
  quantity: z.number().positive({ message: "الكمية يجب أن تكون أكبر من صفر" }),
  unit_price: z.number().nonnegative({ message: "السعر لا يمكن أن يكون سالباً" }),
  tax_rate: z.number().min(0).max(100).default(14),
  discount: z.number().min(0).default(0),
});

export const InvoiceSchema = z.object({
  customer_id: uuidSchema,
  invoice_date: z.string(),
  warehouse_id: uuidSchema,
  items: z.array(InvoiceItemSchema).min(1, { message: "يجب إضافة صنف واحد على الأقل" }),
  paid_amount: z.number().nonnegative().default(0),
  notes: z.string().optional().or(z.literal('')),
  treasury_account_id: uuidSchema.optional().nullable(),
});

export const PurchaseInvoiceSchema = InvoiceSchema.extend({
  supplier_id: uuidSchema,
}).omit({ customer_id: true });

// --- 5. مديول المالية (Treasury) ---
export const VoucherSchema = z.object({
  amount: z.number().positive({ message: "المبلغ يجب أن يكون أكبر من صفر" }),
  date: z.string(),
  treasury_account_id: uuidSchema,
  account_id: uuidSchema, // الطرف المقابل
  notes: z.string().min(5, { message: "يرجى كتابة ملاحظة توضيحية للعملية" }),
  payment_method: z.enum(['cash', 'card', 'bank_transfer', 'cheque']).default('cash'),
});

// --- 6. مديول التكاليف المتقدم (Advanced Costing - Existing) ---

// 1. التحقق من تسجيل الهالك (Scrap Validation)
export const ScrapLogSchema = z.object({
  progress_id: uuidSchema,
  material_id: uuidSchema,
  quantity: z.number().positive({ message: "الكمية يجب أن تكون أكبر من صفر" }),
  is_abnormal: z.boolean(),
  salvage_value: z.number().nonnegative({ message: "القيمة الاستردادية لا يمكن أن تكون سالبة" }).default(0),
  reason: z.string().min(5, { message: "يرجى ذكر سبب التلف بالتفصيل (5 أحرف على الأقل)" }),
});

// 2. التحقق من إغلاق الفترة التكاليفية (Period Closing Validation)
export const PeriodClosingSchema = z.object({
  period_name: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, { 
    message: "صيغة الفترة يجب أن تكون YYYY-MM (مثال: 2024-06)" 
  }),
  closing_date: z.string().refine((date) => !date || new Date(date) <= new Date(), {
    message: "تاريخ الإغلاق لا يمكن أن يكون في المستقبل"
  }),
});

// 3. التحقق من توزيع الأعباء الإضافية (Overhead Allocation)
export const OverheadAllocationSchema = z.object({
  amount: z.number().positive({ message: "مبلغ التوزيع يجب أن يكون موجباً" }),
  account_id: uuidSchema,
  allocation_basis: z.enum(['conversion_units', 'labor_hours', 'machine_hours']),
});

// 4. التحقق من أوامر الإنتاج (Production Order Validation)
export const ProductionOrderSchema = z.object({
  product_id: uuidSchema,
  quantity: z.number().min(0.0001, { message: "الكمية يجب أن تكون أكبر من صفر" }),
  warehouse_id: uuidSchema,
  start_date: z.string(),
  is_continuous: z.boolean().default(false),
});

/**
 * دالة مساعدة لتشغيل التحقق وإرجاع الأخطاء بشكل مبسط للواجهة
 */
export const validateCostingData = (schema: z.ZodSchema, data: any) => {
  try {
    return { success: true, data: schema.parse(data) };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { 
        success: false, 
        errors: error.issues.map(err => ({
          field: err.path.join('.'),
          message: err.message
        }))
      };
    }
    return { success: false, errors: [{ field: 'unknown', message: 'خطأ غير متوقع في التحقق' }] };
  }
};

// --- أنواع البيانات (Types) ---
export type CustomerInput = z.infer<typeof CustomerSchema>;
export type ProductInput = z.infer<typeof ProductSchema>;
export type InvoiceInput = z.infer<typeof InvoiceSchema>;
export type JournalEntryInput = z.infer<typeof JournalEntrySchema>;
export type VoucherInput = z.infer<typeof VoucherSchema>;
export type ScrapLogInput = z.infer<typeof ScrapLogSchema>;
export type ProductionOrderInput = z.infer<typeof ProductionOrderSchema>;
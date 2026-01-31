import { z } from 'zod';

/**
 * Validation Schemas for TriPro ERP
 * Comprehensive input validation using Zod
 */

// ============== COMMON VALIDATORS ==============

export const idSchema = z.string().uuid('معرف غير صالح');
export const emailSchema = z.string().email('بريد إلكتروني غير صالح');
export const phoneSchema = z.string().regex(/^\+?[\d\s\-()]{10,}$/, 'رقم هاتف غير صالح');
export const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'صيغة التاريخ غير صحيحة (YYYY-MM-DD)');
export const amountSchema = z.number().min(0, 'المبلغ يجب أن يكون أكبر من أو يساوي صفر');
export const percentSchema = z.number().min(0, 'النسبة يجب أن تكون بين 0 و 100').max(100, 'النسبة يجب أن تكون بين 0 و 100');
export const quantitySchema = z.number().int('الكمية يجب أن تكون رقم صحيح').positive('الكمية يجب أن تكون موجبة');
export const nameSchema = z.string().min(2, 'الاسم يجب أن يكون على الأقل حرفين').max(255, 'الاسم طويل جداً');
export const textSchema = z.string().max(5000, 'النص طويل جداً');

// ============== CUSTOMER SCHEMAS ==============

export const createCustomerSchema = z.object({
  name: nameSchema,
  email: emailSchema.optional(),
  phone: phoneSchema.optional(),
  tax_number: z.string().optional(),
  address: z.string().max(500, 'العنوان طويل جداً').optional(),
  credit_limit: amountSchema.optional(),
});

export const updateCustomerSchema = createCustomerSchema.partial();

export type CreateCustomer = z.infer<typeof createCustomerSchema>;
export type UpdateCustomer = z.infer<typeof updateCustomerSchema>;

// ============== SUPPLIER SCHEMAS ==============

export const createSupplierSchema = z.object({
  name: nameSchema,
  email: emailSchema.optional(),
  phone: phoneSchema.optional(),
  tax_number: z.string().optional(),
  address: z.string().max(500).optional(),
  payment_terms: z.string().max(200).optional(),
});

export const updateSupplierSchema = createSupplierSchema.partial();

export type CreateSupplier = z.infer<typeof createSupplierSchema>;
export type UpdateSupplier = z.infer<typeof updateSupplierSchema>;

// ============== PRODUCT SCHEMAS ==============

export const createProductSchema = z.object({
  name: nameSchema,
  sku: z.string().max(50).optional(),
  item_type: z.enum(['STOCK', 'SERVICE', 'RAW_MATERIAL']),
  purchase_price: amountSchema,
  sales_price: amountSchema,
  inventory_account_id: idSchema.optional(),
  cogs_account_id: idSchema.optional(),
  sales_account_id: idSchema.optional(),
}).refine(
  (data) => data.sales_price >= data.purchase_price || data.item_type === 'SERVICE',
  {
    message: 'سعر البيع يجب أن يكون أكبر من أو يساوي سعر الشراء',
    path: ['sales_price'],
  }
);

export const updateProductSchema = createProductSchema.partial();

export type CreateProduct = z.infer<typeof createProductSchema>;
export type UpdateProduct = z.infer<typeof updateProductSchema>;

// ============== INVOICE SCHEMAS ==============

export const invoiceItemSchema = z.object({
  productId: idSchema,
  quantity: quantitySchema,
  unitPrice: amountSchema,
  total: amountSchema,
});

export const createInvoiceSchema = z.object({
  customerId: idSchema,
  invoiceNumber: z.string().min(1, 'رقم الفاتورة مطلوب'),
  invoiceDate: dateSchema,
  dueDate: dateSchema.optional(),
  items: z.array(invoiceItemSchema).min(1, 'يجب إضافة عنصر واحد على الأقل'),
  notes: textSchema.optional(),
  taxRate: percentSchema.optional(),
}).refine(
  (data) => !data.dueDate || data.dueDate >= data.invoiceDate,
  {
    message: 'تاريخ الاستحقاق يجب أن يكون بعد تاريخ الفاتورة',
    path: ['dueDate'],
  }
);

export type CreateInvoice = z.infer<typeof createInvoiceSchema>;

// ============== PAYMENT SCHEMAS ==============

export const createPaymentSchema = z.object({
  invoiceId: idSchema,
  amount: amountSchema.refine((val) => val > 0, 'المبلغ يجب أن يكون موجب'),
  paymentDate: dateSchema,
  paymentMethod: z.enum(['cash', 'check', 'bank_transfer', 'credit_card']),
  reference: z.string().max(100).optional(),
  notes: textSchema.optional(),
});

export const updatePaymentSchema = createPaymentSchema.partial();

export type CreatePayment = z.infer<typeof createPaymentSchema>;
export type UpdatePayment = z.infer<typeof updatePaymentSchema>;

// ============== JOURNAL ENTRY SCHEMAS ==============

export const journalLineSchema = z.object({
  accountId: idSchema,
  debit: amountSchema,
  credit: amountSchema,
  description: z.string().max(500).optional(),
}).refine(
  (data) => data.debit === 0 || data.credit === 0,
  {
    message: 'يجب أن يكون إما المدين أو الدائن فقط، وليس كلاهما',
    path: ['debit'],
  }
).refine(
  (data) => data.debit > 0 || data.credit > 0,
  {
    message: 'يجب أن يكون هناك قيمة مدين أو دائن',
    path: ['debit'],
  }
);

export const createJournalEntrySchema = z.object({
  date: dateSchema,
  reference: z.string().min(1, 'المرجع مطلوب').max(50),
  description: z.string().min(1, 'الوصف مطلوب').max(500),
  lines: z.array(journalLineSchema).min(2, 'يجب إضافة سطرين على الأقل'),
  notes: textSchema.optional(),
}).refine(
  (data) => {
    const totalDebit = data.lines.reduce((sum, line) => sum + line.debit, 0);
    const totalCredit = data.lines.reduce((sum, line) => sum + line.credit, 0);
    return Math.abs(totalDebit - totalCredit) < 0.01; // السماح بخطأ تقريب بسيط
  },
  {
    message: 'إجمالي المدين يجب أن يساوي إجمالي الدائن (لا توازن)',
    path: ['lines'],
  }
);

export type CreateJournalEntry = z.infer<typeof createJournalEntrySchema>;

// ============== PURCHASE ORDER SCHEMAS ==============

export const purchaseOrderItemSchema = z.object({
  productId: idSchema,
  quantity: quantitySchema,
  unitPrice: amountSchema,
});

export const createPurchaseOrderSchema = z.object({
  supplierId: idSchema,
  orderNumber: z.string().min(1),
  orderDate: dateSchema,
  deliveryDate: dateSchema.optional(),
  items: z.array(purchaseOrderItemSchema).min(1),
  notes: textSchema.optional(),
});

export type CreatePurchaseOrder = z.infer<typeof createPurchaseOrderSchema>;

// ============== UTILITY FUNCTIONS ==============

/**
 * Safely parse and validate data
 */
export async function validateData<T>(schema: z.ZodSchema, data: unknown): Promise<{ success: boolean; data?: T; errors?: Record<string, string> }> {
  try {
    const validated = await schema.parseAsync(data);
    return { success: true, data: validated as T };
  } catch (error) {
    if (error instanceof z.ZodError) {
      const errors: Record<string, string> = {};
      error.issues.forEach((err) => {
        const path = err.path.join('.');
        errors[path] = err.message;
      });
      return { success: false, errors };
    }
    return { success: false, errors: { general: 'خطأ في التحقق من البيانات' } };
  }
}

/**
 * Sanitize string input
 */
export function sanitizeString(input: string): string {
  return input
    .trim()
    .replace(/[<>]/g, '') // إزالة HTML tags
    .replace(/\0/g, ''); // إزالة null bytes
}

/**
 * Sanitize number input
 */
export function sanitizeNumber(input: any): number {
  const num = Number(input);
  if (isNaN(num) || !isFinite(num)) {
    throw new Error('رقم غير صالح');
  }
  return num;
}

/**
 * Sanitize email
 */
export function sanitizeEmail(input: string): string {
  return sanitizeString(input).toLowerCase();
}

/**
 * Validate and sanitize form data
 */
export function sanitizeFormData(data: Record<string, any>): Record<string, any> {
  const sanitized: Record<string, any> = {};
  
  for (const [key, value] of Object.entries(data)) {
    if (typeof value === 'string') {
      sanitized[key] = sanitizeString(value);
    } else if (typeof value === 'number') {
      sanitized[key] = sanitizeNumber(value);
    } else if (Array.isArray(value)) {
      sanitized[key] = value.map(item => 
        typeof item === 'string' ? sanitizeString(item) : item
      );
    } else if (value !== null && value !== undefined) {
      sanitized[key] = value;
    }
  }
  
  return sanitized;
}

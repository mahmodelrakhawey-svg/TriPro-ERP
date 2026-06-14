import { z } from 'zod';

/**
 * Validation Schemas for TriPro ERP
 * Comprehensive input validation using Zod
 */

// ============== COMMON VALIDATORS ==============

export const idSchema = z.string().min(1, 'هذا الحقل مطلوب').uuid('معرف غير صالح');
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

const baseProductSchema = z.object({
  name: nameSchema,
  sku: z.string().max(50).optional(),
  unit: z.string().max(50).optional().default('piece'), // إضافة وحدة القياس
  product_type: z.enum(['STOCK', 'SERVICE', 'RAW_MATERIAL', 'MANUFACTURED']),
  purchase_price: amountSchema,
  sales_price: amountSchema,
  inventory_account_id: idSchema.optional(),
  cogs_account_id: idSchema.optional(),
  sales_account_id: idSchema.optional(),
  labor_cost: amountSchema.optional().default(0),
  overhead_cost: amountSchema.optional().default(0),
  requires_serial: z.boolean().optional().default(false),
  available_modifiers: z.array(z.any()).optional().default([]),
});

export const createProductSchema = baseProductSchema.refine(
  (data) => data.sales_price >= data.purchase_price || data.product_type === 'SERVICE',
  {
    message: 'سعر البيع يجب أن يكون أكبر من أو يساوي سعر الشراء',
    path: ['sales_price'],
  }
);

export const updateProductSchema = baseProductSchema.partial();

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

const baseJournalEntrySchema = z.object({
  date: dateSchema,
  reference: z.string().min(1, 'المرجع مطلوب').max(50),
  description: z.string().min(1, 'الوصف مطلوب').max(500),
  lines: z.array(journalLineSchema).min(2, 'يجب إضافة سطرين على الأقل'),
  notes: textSchema.optional(),
});

export const createJournalEntrySchema = baseJournalEntrySchema.refine(
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

export const updateJournalEntrySchema = baseJournalEntrySchema.partial();

export type CreateJournalEntry = z.infer<typeof createJournalEntrySchema>;
export const closeShiftSchema = z.object({
  actualCash: z.preprocess((val) => Number(val), amountSchema.min(0, 'المبلغ الفعلي لا يمكن أن يكون سالباً')),
  closingBalance: z.preprocess((val) => Number(val), amountSchema),
  notes: textSchema.optional(),
}).refine(data => data.actualCash >= 0, {
  message: "يرجى التأكد من إدخال المبلغ النقدي بشكل صحيح",
  path: ["actualCash"]
});

export type CloseShift = z.infer<typeof closeShiftSchema>;
// ============== BULK OPERATIONS SCHEMAS ==============

export const bulkOfferSchema = z.object({
  strategy: z.enum(['percentage', 'fixed']),
  value: z.number().min(0.01, 'القيمة يجب أن تكون أكبر من 0'),
  startDate: dateSchema,
  endDate: dateSchema,
  maxQty: z.number().min(0).optional().default(0),
}).refine(data => data.endDate >= data.startDate, {
  message: 'تاريخ النهاية يجب أن يكون بعد تاريخ البداية',
  path: ['endDate']
});

export const bulkPriceUpdateSchema = z.object({
  percentage: z.number().min(-100, 'لا يمكن خفض السعر بأكثر من 100%').max(1000, 'الزيادة مبالغ فيها'),
});

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

// ============== PURCHASE INVOICE SCHEMAS ==============

export const purchaseInvoiceItemSchema = z.object({
  productId: idSchema,
  quantity: z.number().min(0.01, 'الكمية يجب أن تكون أكبر من 0'),
  unitPrice: amountSchema,
});

export const createPurchaseInvoiceSchema = z.object({
  supplierId: idSchema,
  warehouseId: idSchema,
  date: dateSchema,
  items: z.array(purchaseInvoiceItemSchema).min(1, 'يجب إضافة بند واحد على الأقل'),
  paidAmount: amountSchema.optional().default(0),
  treasuryAccountId: z.string().uuid('معرف غير صالح').optional().nullable().or(z.literal('')),
}).refine(data => data.paidAmount <= 0 || (data.paidAmount > 0 && data.treasuryAccountId), {
  message: 'يرجى اختيار الخزينة أو البنك لسداد المبلغ المدفوع',
  path: ['treasuryAccountId']
});

// ============== HR SCHEMAS ==============

const baseEmployeeSchema = z.object({
  full_name: nameSchema,
  role: z.enum(['super_admin', 'admin', 'manager', 'accountant', 'viewer', 'demo', 'chef', 'owner', 'medical_director']),
  basic_salary: amountSchema,
  hire_date: dateSchema,
  organization_id: idSchema.optional(),
  is_active: z.boolean().default(true),
});

export const createEmployeeSchema = baseEmployeeSchema.extend({
  basic_salary: amountSchema.positive('الراتب يجب أن يكون أكبر من 0'),
});

export const updateEmployeeSchema = baseEmployeeSchema.partial(); // وهنا نستخدم .partial() على المخطط الأساسي

export const createEmployeeAdvanceSchema = z.object({
  employee_id: idSchema,
  amount: amountSchema.positive('مبلغ السلفة يجب أن يكون أكبر من 0'),
  advance_date: dateSchema,
  notes: textSchema.optional(),
});

// ============== USER MANAGEMENT SCHEMAS ==============


export const payrollRunSchema = z.object({
  month: z.number().min(1).max(12),
  year: z.number().min(2020),
  treasuryId: z.string().uuid('معرف الخزينة غير صالح'),
  hasData: z.boolean().refine(val => val === true, {
    message: 'لا يوجد موظفون في المسير لتشغيله',
  }),
});

export const payrollItemSchema = z.object({
  employee_id: idSchema,
  full_name: z.string().min(1, 'اسم الموظف مطلوب'),
  gross_salary: amountSchema.default(0),
  additions: amountSchema.default(0),
  advances_deducted: amountSchema.default(0),
  payroll_tax: amountSchema.default(0),
  other_deductions: amountSchema.default(0),
  net_salary: z.number(), // Calculated field, just ensure it's a number
  advances_ids: z.array(idSchema).optional(),
});

// ============== INVENTORY SCHEMAS ==============

export const createWarehouseSchema = z.object({
  name: z.string().min(1, 'اسم المستودع مطلوب'),
  location: z.string().optional(),
  manager: z.string().optional(),
  phone: z.string().optional()
});

export const revaluationSchema = z.object({
  productId: idSchema,
  newCost: amountSchema.nonnegative('التكلفة يجب أن تكون 0 أو أكثر'),
  revaluationDate: dateSchema
});

export const stockTransferItemSchema = z.object({
  productId: idSchema,
  quantity: quantitySchema
});

export const createStockTransferSchema = z.object({
  date: dateSchema,
  fromWarehouseId: idSchema,
  toWarehouseId: idSchema,
  items: z.array(stockTransferItemSchema).min(1, 'يجب إضافة أصناف للتحويل'),
  notes: textSchema.optional()
}).refine(data => data.fromWarehouseId !== data.toWarehouseId, {
  message: "لا يمكن التحويل لنفس المستودع",
  path: ["toWarehouseId"]
});

export const inventoryCountItemSchema = z.object({
  productId: idSchema,
  systemQty: z.number(),
  actualQty: z.number(),
  difference: z.number(),
  notes: z.string().optional()
});

export const createInventoryCountSchema = z.object({
  warehouseId: idSchema,
  date: dateSchema,
  items: z.array(inventoryCountItemSchema).min(1, 'لا توجد أصناف للجرد')
});

export const createOpeningInventoryItemSchema = z.object({
  name: z.string().min(1, 'اسم الصنف مطلوب'),
  sku: z.string().optional(),
  quantity: z.number().min(0.01, 'الكمية يجب أن تكون أكبر من 0'),
  cost: z.number().min(0, 'التكلفة يجب أن تكون 0 أو أكثر'),
  price: z.number().min(0, 'سعر البيع يجب أن يكون 0 أو أكثر'),
  unit: z.string().min(1, 'الوحدة مطلوبة')
});

export const stockAdjustmentItemSchema = z.object({
  productId: idSchema,
  quantity: z.number().min(0.01, 'الكمية يجب أن تكون أكبر من 0'),
  type: z.enum(['in', 'out'])
});

export const createStockAdjustmentSchema = z.object({
  warehouseId: idSchema,
  date: dateSchema,
  reason: z.string().min(1, 'السبب مطلوب'),
  items: z.array(stockAdjustmentItemSchema).min(1, 'الرجاء إضافة أصناف للقائمة أولاً')
});

export const stockCardProductUpdateSchema = z.object({
  name: nameSchema,
  sales_price: amountSchema,
  purchase_price: amountSchema,
}).refine(data => data.sales_price >= data.purchase_price, {
  message: 'سعر البيع يجب أن يكون أكبر من أو يساوي سعر التكلفة',
  path: ['sales_price']
});

export const stockCardOpeningBalanceUpdateSchema = z.object({
  warehouseId: idSchema,
  quantity: z.number().min(0, 'الكمية يجب أن تكون 0 أو أكثر'),
  cost: z.number().min(0, 'التكلفة يجب أن تكون 0 أو أكثر')
});

// ============== SALES SCHEMAS ==============

export const createQuotationSchema = z.object({
  customerId: idSchema,
  date: dateSchema,
  expiryDate: dateSchema,
  items: z.array(invoiceItemSchema).min(1, 'يجب إضافة بند واحد على الأقل')
});

export const createCreditNoteSchema = z.object({
  customerId: idSchema,
  date: dateSchema,
  amount: amountSchema.min(0.01, 'المبلغ يجب أن يكون أكبر من 0'),
});



// ============== USER PROFILE SCHEMAS ==============
export const updateUserProfileSchema = z.object({
  fullName: nameSchema,
  password: z.string().min(6, 'كلمة المرور يجب أن تكون 6 أحرف على الأقل').optional().or(z.literal('')),
  confirmPassword: z.string().optional().or(z.literal(''))
}).refine((data) => !data.password || data.password === data.confirmPassword, {
  message: "كلمة المرور غير متطابقة",
  path: ["confirmPassword"],
});

// ============== DEBIT NOTE SCHEMAS ==============
export const createDebitNoteSchema = z.object({
  supplierId: idSchema,
  date: dateSchema,
  amount: amountSchema.min(0.01, 'المبلغ يجب أن يكون أكبر من 0'),
});

// ============== PURCHASE RETURN SCHEMAS ==============
export const purchaseReturnItemSchema = z.object({
  productId: idSchema,
  quantity: z.number().min(0.01, 'الكمية يجب أن تكون أكبر من 0'),
  price: amountSchema
});

export const createPurchaseReturnSchema = z.object({
  supplierId: idSchema,
  warehouseId: idSchema,
  date: dateSchema,
  items: z.array(purchaseReturnItemSchema).min(1, 'يجب إضافة بند واحد على الأقل')
});

// ============== CONSTRUCTION SCHEMAS ==============

export const createProjectSchema = z.object({
  name: nameSchema,
  description: textSchema.optional(),
  customerId: idSchema,
  contractValue: amountSchema,
  startDate: dateSchema.optional(),
  endDate: dateSchema.optional(),
  status: z.enum(['planned', 'active', 'on_hold', 'completed', 'cancelled']).default('planned'),
}).refine(data => !data.startDate || !data.endDate || data.endDate >= data.startDate, {
  message: 'تاريخ النهاية يجب أن يكون بعد تاريخ البداية',
  path: ['endDate']
});

export const projectBOQItemSchema = z.object({
  item_name: z.string().min(2, 'اسم البند مطلوب'),
  unit: z.string().min(1, 'الوحدة مطلوبة'),
  estimated_quantity: z.number().positive('الكمية التقديرية يجب أن تكون موجبة'),
  unit_price: amountSchema,
});

export const createProjectBillingSchema = z.object({
  projectId: idSchema,
  billingNumber: z.string().min(1, 'رقم المستخلص مطلوب'),
  billingDate: dateSchema,
  completionPercentage: percentSchema,
  grossAmount: amountSchema,
  retentionAmount: amountSchema.default(0),
  notes: textSchema.optional(),
});

export const createSubcontractorSchema = z.object({
  name: nameSchema,
  phone: phoneSchema.optional().or(z.literal('')), // السماح بأن يكون فارغاً
  specialty: z.string().min(1, 'التخصص مطلوب'),
});

export const createSubcontractorBillingSchema = z.object({
  contractId: idSchema,
  billingNumber: z.string().min(1),
  billingDate: dateSchema,
  grossAmount: amountSchema,
  retentionAmount: amountSchema.default(0),
  advanceDeduction: amountSchema.default(0),
});

export const materialIssueItemSchema = z.object({
  productId: idSchema,
  quantity: z.number().positive('الكمية يجب أن تكون موجبة'),
  unitCost: amountSchema,
});

export const createMaterialIssueSchema = z.object({
  projectId: idSchema,
  warehouseId: idSchema,
  issueNumber: z.string().min(1, 'رقم الإذن مطلوب'),
  issueDate: dateSchema,
  items: z.array(materialIssueItemSchema).min(1, 'يجب إضافة صنف واحد على الأقل'),
});

export const createCustodySchema = z.object({
  projectId: idSchema,
  employeeId: idSchema,
  custodyName: z.string().min(3, 'اسم العهدة مطلوب'),
  initialAmount: amountSchema.positive('المبلغ الابتدائي يجب أن يكون موجباً'),
});

export const custodyExpenseSchema = z.object({
  amount: amountSchema.positive('مبلغ المصروف يجب أن يكون موجباً'),
  description: z.string().min(5, 'يرجى كتابة وصف واضح للمصروف'),
  expenseDate: dateSchema,
  category: z.string().optional(),
});

export const dailyReportSchema = z.object({
  projectId: idSchema,
  reportDate: dateSchema,
  workDescription: z.string().min(20, 'يرجى كتابة وصف تفصيلي للأعمال (20 حرف على الأقل)'),
  manpowerCount: z.number().min(0, 'عدد العمالة لا يمكن أن يكون سالباً'),
  weatherCondition: z.string().optional(),
  equipmentStatus: z.string().optional(),
  siteImages: z.array(z.string().url()).optional().default([]),
  notes: z.string().optional(),
});

export const milestoneSchema = z.object({
  project_id: idSchema,
  title: z.string().min(5, 'عنوان المرحلة مطلوب (5 أحرف على الأقل)'),
  expected_start_date: dateSchema,
  expected_end_date: dateSchema,
  actual_completion_date: dateSchema.optional().nullable(),
  progress_percentage: percentSchema.default(0),
  status: z.enum(['pending', 'in_progress', 'completed', 'delayed']).default('pending'),
}).refine(data => data.expected_end_date >= data.expected_start_date, {
  message: 'تاريخ الانتهاء المتوقع يجب أن يكون بعد تاريخ البدء المتوقع',
  path: ['expected_end_date'],
});

export const retentionReleaseSchema = z.object({
  amount: amountSchema.positive('المبلغ يجب أن يكون موجباً'),
  release_type: z.enum(['customer', 'subcontractor'], { message: 'نوع الاسترداد مطلوب' }),
  subcontractor_id: idSchema.optional().nullable(),
  notes: textSchema.optional(),
}).refine(data => {
  if (data.release_type === 'subcontractor' && !data.subcontractor_id) {
    return false;
  }
  return true;
}, {
  message: 'يجب اختيار مقاول باطن عند استرداد محجوزاته',
  path: ['subcontractor_id'],
});

export type CreateProject = z.infer<typeof createProjectSchema>;
export type ProjectBOQItem = z.infer<typeof projectBOQItemSchema>;
export type CreateProjectBilling = z.infer<typeof createProjectBillingSchema>;
export type CreateSubcontractor = z.infer<typeof createSubcontractorSchema>;
export type CreateSubcontractorBilling = z.infer<typeof createSubcontractorBillingSchema>;
export type CreateMaterialIssue = z.infer<typeof createMaterialIssueSchema>;
export type CreateCustody = z.infer<typeof createCustodySchema>;
export type CustodyExpense = z.infer<typeof custodyExpenseSchema>;
export type MilestoneFormData = z.infer<typeof milestoneSchema>;
export type RetentionReleaseFormData = z.infer<typeof retentionReleaseSchema>;


// ============== USER MANAGER SCHEMAS ==============
export const createUserManagerUserSchema = z.object({
  email: emailSchema,
  password: z.string().min(6, 'كلمة المرور يجب أن تكون 6 أحرف على الأقل'),
  fullName: nameSchema,
  role: z.enum(['super_admin', 'admin', 'manager', 'accountant', 'viewer', 'demo', 'chef', 'owner', 'medical_director']),
});

export const resetPasswordSchema = z.object({
  userId: idSchema,
  newPassword: z.string().min(6, 'كلمة المرور يجب أن تكون 6 أحرف على الأقل'),
});


// ============== UTILITY FUNCTIONS (KEEP AS IS) ==============

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

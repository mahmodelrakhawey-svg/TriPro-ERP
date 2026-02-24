import { z } from 'zod';

/**
 * مخطط التحقق لإضافة أو تعديل عميل.
 * يضمن أن البيانات المدخلة تتبع القواعد المحددة.
 */
export const CustomerSchema = z.object({
  name: z.string().min(3, { message: 'اسم العميل يجب أن يكون 3 أحرف على الأقل.' }),
  phone: z.string().optional(),
  email: z.string().email({ message: 'صيغة البريد الإلكتروني غير صحيحة.' }).optional().or(z.literal('')), // يسمح بأن يكون فارغاً أو بصيغة بريد إلكتروني
  address: z.string().optional(),
  tax_number: z.string().optional(),
  credit_limit: z
    .number({ message: 'حد الائتمان يجب أن يكون رقماً.' })
    .nonnegative({ message: 'حد الائتمان لا يمكن أن يكون سالباً.' })
    .optional(),
});

/**
 * مخطط التحقق لإضافة أو تعديل مورد.
 */
export const SupplierSchema = z.object({
  name: z.string().min(3, { message: 'اسم المورد يجب أن يكون 3 أحرف على الأقل.' }),
  phone: z.string().optional(),
  email: z.string().email({ message: 'صيغة البريد الإلكتروني غير صحيحة.' }).optional().or(z.literal('')),
  address: z.string().optional(),
  tax_number: z.string().optional(),
  contact_person: z.string().optional(),
});

/**
 * مخطط التحقق لفواتير المبيعات والمشتريات.
 * يضمن وجود عميل/مورد، وتاريخ صحيح، وبنود سليمة.
 */
export const InvoiceSchema = z.object({
  customer_id: z.string().uuid({ message: 'يجب اختيار عميل صحيح.' }).optional(),
  supplier_id: z.string().uuid({ message: 'يجب اختيار مورد صحيح.' }).optional(),
  invoice_date: z.string().refine((date) => new Date(date) <= new Date(), {
    message: 'تاريخ الفاتورة لا يمكن أن يكون في المستقبل.',
  }),
  total_amount: z.number().positive({ message: 'المبلغ الإجمالي يجب أن يكون أكبر من صفر.' }),
  items: z.array(z.object({
    product_id: z.string().uuid({ message: 'يجب اختيار صنف صحيح لكل بند.'}),
    quantity: z.number().int().positive({ message: 'الكمية يجب أن تكون رقماً صحيحاً موجباً.' }),
    price: z.number().positive({ message: 'السعر يجب أن يكون أكبر من صفر.' })
  })).min(1, { message: 'يجب إضافة صنف واحد على الأقل في الفاتورة.' }),
  notes: z.string().optional(),
  warehouse_id: z.string().uuid({ message: 'يجب اختيار مستودع.' }),
});

/**
 * مخطط التحقق لقيود اليومية.
 * يضمن أن القيد متوازن وأن جميع الحسابات صحيحة.
 */
export const JournalEntrySchema = z.object({
  reference: z.string().min(1, { message: 'مرجع القيد مطلوب.' }),
  transaction_date: z.string(),
  description: z.string().min(3, { message: 'الوصف يجب أن يكون 3 أحرف على الأقل.' }),
  lines: z.array(z.object({
    account_id: z.string().uuid({ message: 'يجب اختيار حساب صحيح لكل طرف.' }),
    debit: z.number().nonnegative({ message: 'المدين لا يمكن أن يكون سالباً.' }),
    credit: z.number().nonnegative({ message: 'الدائن لا يمكن أن يكون سالباً.' }),
    cost_center_id: z.string().uuid().optional().nullable()
  }))
  .min(2, { message: 'القيد يجب أن يحتوي على طرفين على الأقل.' })
  .refine(
    (lines) => Math.abs(lines.reduce((sum, l) => sum + (l.debit || 0) - (l.credit || 0), 0)) < 0.01,
    { message: 'القيد غير متوازن. إجمالي المدين يجب أن يساوي إجمالي الدائن.' }
  )
});

/**
 * مخطط التحقق لسندات القبض والصرف.
 * يضمن وجود مبلغ، تاريخ، حساب خزينة، وطرف مقابل.
 */
export const VoucherSchema = z.object({
  amount: z.number({ message: 'المبلغ يجب أن يكون رقماً.' }).positive({ message: 'المبلغ يجب أن يكون أكبر من صفر.' }),
  date: z.string().refine((date) => !isNaN(Date.parse(date)), { message: 'تاريخ غير صحيح.' }),
  treasuryAccountId: z.string().uuid({ message: 'يجب اختيار حساب الخزينة/البنك.' }),
  description: z.string().optional(),
  partyId: z.string().uuid().optional().or(z.literal('')),
  targetAccountId: z.string().uuid().optional().or(z.literal('')),
  paymentMethod: z.string().optional(),
}).refine((data) => (data.partyId && data.partyId.length > 0) || (data.targetAccountId && data.targetAccountId.length > 0), {
  message: 'يجب تحديد الطرف المستفيد (عميل/مورد) أو الحساب المقابل.',
  path: ['partyId'],
});

/**
 * مخطط التحقق للحسابات.
 */
export const AccountSchema = z.object({
  code: z.string().min(1, { message: 'رمز الحساب مطلوب.' }),
  name: z.string().min(2, { message: 'اسم الحساب مطلوب.' }),
  type: z.string(),
  isGroup: z.boolean(),
  parentAccount: z.string().optional().or(z.literal('')),
  subType: z.enum(['current', 'non_current', '']).optional(),
  openingBalance: z.number().optional(),
  balanceType: z.string().optional()
});
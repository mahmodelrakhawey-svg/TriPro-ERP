# 🛠️ خطة التحسينات العملية (Implementation Plan)

## المرحلة الأولى: إصلاح حرج (Critical Fixes)

### 1️⃣ توحيد نظام الإشعارات (Toast Notifications)

#### المشكلة الحالية:
```typescript
// ❌ الكود الحالي - استخدام alert بشكل مفرط
alert('خطأ: ' + error.message);
alert('تم حفظ الفاتورة بنجاح ✅');
```

#### الحل:
التطبيق **بالفعل** لديه `ToastContext.tsx` لكن لم يتم استخدامه في كل مكان.

**الملفات التي تحتاج تحديث:**
- `modules/purchases/DebitNoteForm.tsx` - استبدل جميع `alert()` بـ `showToast()`
- `modules/finance/PaymentVoucherForm.tsx`
- `modules/finance/CashClosingForm.tsx`
- `components/Settings.tsx`
- `modules/accounting/TrialBalanceAdvanced.tsx`
- `modules/accounting/BalanceSheet.tsx`
- وجميع ملفات modules الأخرى

**مثال للتحديث:**
```typescript
// ❌ قبل
try {
  await saveInvoice();
  alert('تم الحفظ بنجاح');
} catch (error) {
  alert('خطأ: ' + error.message);
}

// ✅ بعد
const { showToast } = useToast(); // أو استخدم context

try {
  await saveInvoice();
  showToast('تم الحفظ بنجاح', 'success');
} catch (error) {
  showToast(error.message || 'حدث خطأ', 'error');
}
```

---

### 2️⃣ إضافة Validation Schema (Zod)

#### الخطوة 1: تثبيت المكتبة
```bash
npm install zod
```

#### الخطوة 2: إنشاء ملف schemas
```typescript
// utils/schemas.ts
import { z } from 'zod';

export const InvoiceSchema = z.object({
  customerId: z.string().uuid('معرف عميل غير صحيح'),
  invoiceNumber: z.string().min(1, 'رقم الفاتورة مطلوب'),
  date: z.string().refine(
    (date) => new Date(date) <= new Date(),
    'التاريخ لا يمكن أن يكون في المستقبل'
  ),
  amount: z.number().positive('المبلغ يجب أن يكون موجب'),
  items: z.array(z.object({
    productId: z.string().uuid(),
    quantity: z.number().int().positive(),
    price: z.number().positive()
  })).min(1, 'يجب إضافة عنصر واحد على الأقل'),
  notes: z.string().optional()
});

export const PaymentVoucherSchema = z.object({
  voucherNumber: z.string().min(1, 'رقم السند مطلوب'),
  supplierId: z.string().uuid('معرف المورد غير صحيح'),
  amount: z.number().positive('المبلغ يجب أن يكون موجب'),
  date: z.string(),
  treasuryId: z.string().uuid(),
  notes: z.string().optional()
});

export const AccountSchema = z.object({
  code: z.string().regex(/^\d+$/, 'رمز الحساب يجب أن يكون أرقام فقط'),
  name: z.string().min(2, 'اسم الحساب قصير جداً'),
  type: z.enum(['ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'EXPENSE']),
  parentId: z.string().uuid().optional(),
  isGroup: z.boolean().default(false)
});

export const JournalEntrySchema = z.object({
  reference: z.string().min(1, 'المرجع مطلوب'),
  date: z.string(),
  description: z.string().min(5, 'الوصف قصير جداً'),
  lines: z.array(z.object({
    accountId: z.string().uuid(),
    debit: z.number().nonnegative(),
    credit: z.number().nonnegative()
  })).refine(
    (lines) => lines.some(l => l.debit > 0) && lines.some(l => l.credit > 0),
    'القيد يجب أن يحتوي على مدين وديون'
  ).refine(
    (lines) => Math.abs(
      lines.reduce((sum, l) => sum + (l.debit - l.credit), 0)
    ) < 0.01,
    'المدين والدائن غير متوازن'
  )
});
```

#### الخطوة 3: استخدام Validation في الكمبوننت
```typescript
// modules/sales/SalesInvoiceForm.tsx
import { InvoiceSchema } from '../../utils/schemas';

const SalesInvoiceForm = () => {
  const [errors, setErrors] = useState<Record<string, string>>({});
  const { showToast } = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validate
    const result = InvoiceSchema.safeParse(formData);
    
    if (!result.success) {
      // تحويل أخطاء Zod إلى خريطة سهلة الاستخدام
      const newErrors: Record<string, string> = {};
      result.error.issues.forEach(issue => {
        const path = issue.path.join('.');
        newErrors[path] = issue.message;
      });
      setErrors(newErrors);
      showToast('يوجد أخطاء في البيانات المدخلة', 'error');
      return;
    }

    try {
      // Save with valid data
      await saveInvoice(result.data);
      showToast('تم الحفظ بنجاح', 'success');
    } catch (error) {
      showToast(error.message, 'error');
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <input
        value={formData.amount}
        onChange={(e) => setFormData({...formData, amount: parseFloat(e.target.value)})}
        className={errors.amount ? 'border-red-500' : ''}
      />
      {errors.amount && <p className="text-red-500 text-sm">{errors.amount}</p>}
    </form>
  );
};
```

---

### 3️⃣ تحسين معالجة الأخطاء الشاملة

#### إنشاء ملف Error Handler
```typescript
// utils/errorHandler.ts
import { showToast } from './toastUtils'; // أو استخدم context

export class AppError extends Error {
  constructor(
    public message: string,
    public code?: string,
    public context?: Record<string, any>
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export const handleError = (error: any, options?: {
  showNotification?: boolean;
  context?: Record<string, any>;
  onError?: (error: AppError) => void;
}) => {
  const isProduction = process.env.NODE_ENV === 'production';
  
  // Parse error
  let appError: AppError;
  
  if (error instanceof AppError) {
    appError = error;
  } else if (error?.message) {
    appError = new AppError(error.message, error.code);
  } else {
    appError = new AppError('حدث خطأ غير متوقع');
  }

  // Add context
  if (options?.context) {
    appError.context = { ...options.context };
  }

  // Log
  console.error('Error logged:', {
    message: appError.message,
    code: appError.code,
    timestamp: new Date().toISOString(),
    context: appError.context
  });

  // في Production، ارسل للـ monitoring service (Sentry, LogRocket, etc.)
  if (isProduction && window.Sentry) {
    window.Sentry.captureException(appError, {
      tags: { code: appError.code },
      extra: appError.context
    });
  }

  // Show notification
  if (options?.showNotification !== false) {
    const message = isProduction 
      ? 'حدث خطأ، يرجى المحاولة لاحقاً'
      : appError.message;
    
    showToast(message, 'error');
  }

  // Callback
  if (options?.onError) {
    options.onError(appError);
  }

  return appError;
};
```

#### استخدام في الكود
```typescript
// modules/accounting/JournalEntryForm.tsx
const handleSubmit = async (e: React.FormEvent) => {
  e.preventDefault();
  setLoading(true);

  try {
    // Validate
    const validatedData = JournalEntrySchema.parse(formData);
    
    // Check balancing
    const totalDebit = validatedData.lines.reduce((sum, l) => sum + l.debit, 0);
    const totalCredit = validatedData.lines.reduce((sum, l) => sum + l.credit, 0);
    
    if (Math.abs(totalDebit - totalCredit) > 0.01) {
      throw new AppError(
        'القيد غير متوازن - المدين والدائن يجب أن يكونا متساويين',
        'UNBALANCED_ENTRY',
        { totalDebit, totalCredit, difference: totalDebit - totalCredit }
      );
    }

    // Save
    const { data, error } = await supabase
      .from('journal_entries')
      .insert([validatedData])
      .select()
      .single();

    if (error) throw error;

    showToast('تم إنشاء القيد بنجاح', 'success');
    handleNew();

  } catch (error) {
    handleError(error, {
      context: { 
        formData,
        userId: currentUser?.id,
        component: 'JournalEntryForm'
      }
    });
  } finally {
    setLoading(false);
  }
};
```

---

## المرحلة الثانية: تحسينات الأداء

### 4️⃣ إضافة Pagination

```typescript
// hooks/usePagination.ts
export const usePagination = (pageSize = 10) => {
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(false);

  const pageCount = Math.ceil(total / pageSize);
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  return {
    page,
    setPage,
    pageSize,
    pageCount,
    from,
    to,
    isLoading,
    setIsLoading,
    total,
    setTotal
  };
};

// استخدام في الجدول
const InvoiceList = () => {
  const { page, pageSize, from, to, pageCount, setTotal } = usePagination();

  useEffect(() => {
    const fetchInvoices = async () => {
      const { data, count, error } = await supabase
        .from('sales_invoices')
        .select('*', { count: 'exact' })
        .range(from, to)
        .order('invoice_date', { ascending: false });

      if (!error) {
        setInvoices(data);
        setTotal(count || 0);
      }
    };

    fetchInvoices();
  }, [page]);

  return (
    <div>
      <table>{/* ... */}</table>
      
      {/* Pagination Controls */}
      <div className="flex items-center justify-between mt-4">
        <button onClick={() => setPage(p => p - 1)} disabled={page === 1}>
          السابق
        </button>
        <span>الصفحة {page} من {pageCount}</span>
        <button onClick={() => setPage(p => p + 1)} disabled={page === pageCount}>
          التالي
        </button>
      </div>
    </div>
  );
};
```

---

### 5️⃣ Caching والـ Memoization

```typescript
// context/AccountingContext.tsx
const fetchAccounts = useCallback(async () => {
  // استخدم cached data إذا كان حديث
  const cached = accountsCache.current;
  const now = Date.now();

  if (cached && (now - cached.timestamp) < CACHE_DURATION) {
    setAccounts(cached.data);
    return;
  }

  try {
    const { data, error } = await supabase
      .from('accounts')
      .select('*')
      .order('code', { ascending: true });

    if (!error && data) {
      accountsCache.current = { data, timestamp: now };
      setAccounts(data);
    }
  } catch (error) {
    handleError(error, { context: { operation: 'fetchAccounts' } });
  }
}, []);

// Memoize calculations
const totalAssets = useMemo(() => {
  return accounts
    .filter(a => a.type === 'ASSET')
    .reduce((sum, a) => sum + (a.balance || 0), 0);
}, [accounts]);

const liabilityRatio = useMemo(() => {
  const assets = totalAssets;
  const liabilities = accounts
    .filter(a => a.type === 'LIABILITY')
    .reduce((sum, a) => sum + (a.balance || 0), 0);
  
  return liabilities > 0 ? (assets / liabilities).toFixed(2) : '0';
}, [accounts, totalAssets]);
```

---

## المرحلة الثالثة: الأمان

### 6️⃣ تحسينات الأمان

```typescript
// utils/securityUtils.ts

// 1. إزالة hardcoded values
// ❌ const DEMO_USER_ID = 'f95ae857-91fb-4637-8c6a-7fe45e8fa005';
// ✅ استخدم environment variables
const DEMO_USER_ID = import.meta.env.VITE_DEMO_USER_ID;

// 2. Rate limiting للعمليات الحساسة
export const createRateLimiter = (maxAttempts: number, windowMs: number) => {
  const attempts: Record<string, number[]> = {};

  return {
    check: (key: string): boolean => {
      const now = Date.now();
      const userAttempts = attempts[key] || [];
      
      // إزالة محاولات قديمة
      attempts[key] = userAttempts.filter(t => now - t < windowMs);
      
      if (attempts[key].length >= maxAttempts) {
        return false; // تم تجاوز الحد
      }

      attempts[key].push(now);
      return true;
    }
  };
};

// استخدام في الـ Login
const loginLimiter = createRateLimiter(5, 60000); // 5 محاولات كل دقيقة

const handleLogin = async (username: string, password: string) => {
  if (!loginLimiter.check(username)) {
    showToast('محاولات كثيرة، حاول لاحقاً', 'error');
    return;
  }

  try {
    // login logic
  } catch (error) {
    handleError(error);
  }
};

// 3. Sanitize حساس للقيود المحاسبية
export const validateAccountingEntry = (entry: any) => {
  // تحقق من أن المبالغ الكبيرة لم تتم بدون تصريح
  const totalAmount = entry.lines.reduce((sum: number, l: any) => sum + l.debit, 0);
  
  if (totalAmount > 1000000 && !entry.approvedBy) {
    throw new AppError(
      'المبالغ الكبيرة تتطلب موافقة',
      'LARGE_AMOUNT_NOT_APPROVED'
    );
  }

  // فحص تاريخ معقول
  const entryDate = new Date(entry.date);
  const maxAgeInDays = 30;
  if ((Date.now() - entryDate.getTime()) / (1000 * 60 * 60 * 24) > maxAgeInDays) {
    throw new AppError(
      'لا يمكن إدخال قيود تجاوزت 30 يوم',
      'ENTRY_TOO_OLD'
    );
  }
};
```

---

## المرحلة الرابعة: الاختبارات

### 7️⃣ اختبارات أساسية

#### الخطوة 1: تثبيت أدوات الاختبار
```bash
npm install -D vitest @testing-library/react @testing-library/jest-dom
```

#### الخطوة 2: كتابة الاختبارات
```typescript
// __tests__/schemas.test.ts
import { describe, it, expect } from 'vitest';
import { InvoiceSchema, JournalEntrySchema } from '../utils/schemas';

describe('Invoice Validation', () => {
  it('should reject negative amounts', () => {
    const invalidData = {
      customerId: '123e4567-e89b-12d3-a456-426614174000',
      invoiceNumber: 'INV001',
      date: '2024-01-25',
      amount: -1000,
      items: []
    };

    const result = InvoiceSchema.safeParse(invalidData);
    expect(result.success).toBe(false);
    expect(result.error?.issues[0].message).toContain('موجب');
  });

  it('should accept valid invoice', () => {
    const validData = {
      customerId: '123e4567-e89b-12d3-a456-426614174000',
      invoiceNumber: 'INV001',
      date: '2024-01-25',
      amount: 1000,
      items: [{
        productId: '123e4567-e89b-12d3-a456-426614174001',
        quantity: 2,
        price: 500
      }],
      notes: 'فاتورة اختبار'
    };

    const result = InvoiceSchema.safeParse(validData);
    expect(result.success).toBe(true);
  });
});

describe('Journal Entry Validation', () => {
  it('should reject unbalanced entries', () => {
    const unbalancedEntry = {
      reference: 'JE001',
      date: '2024-01-25',
      description: 'قيد اختبار',
      lines: [
        { accountId: 'acc1', debit: 1000, credit: 0 },
        { accountId: 'acc2', debit: 0, credit: 500 }
      ]
    };

    const result = JournalEntrySchema.safeParse(unbalancedEntry);
    expect(result.success).toBe(false);
  });

  it('should accept balanced entries', () => {
    const balancedEntry = {
      reference: 'JE001',
      date: '2024-01-25',
      description: 'قيد اختبار',
      lines: [
        { accountId: 'acc1', debit: 1000, credit: 0 },
        { accountId: 'acc2', debit: 0, credit: 1000 }
      ]
    };

    const result = JournalEntrySchema.safeParse(balancedEntry);
    expect(result.success).toBe(true);
  });
});
```

---

## الملفات المراد تحديثها - أولويات

### Priority 1 - الأسبوع الأول:
- [ ] إنشاء `utils/schemas.ts` - مع Zod validation
- [ ] إنشاء `utils/errorHandler.ts` - معالجة أخطاء موحدة
- [ ] تحديث جميع `showToast` بدل `alert`
- [ ] إنشاء `constants.ts` للقيم الثابتة

### Priority 2 - الأسبوع الثاني:
- [ ] إضافة Pagination في الجداول الكبيرة
- [ ] إضافة Caching للبيانات الثابتة
- [ ] تحسينات الأمان (RLS, rate limiting)
- [ ] إنشاء `__tests__/` folder للاختبارات

### Priority 3 - الشهر الأول:
- [ ] كتابة اختبارات شاملة
- [ ] توثيق بالتفصيل
- [ ] إضافة Error Tracking (Sentry)
- [ ] تحسينات UI/UX

---

**ملاحظة:** هذه الخطة معملية جداً وبإمكانك البدء الآن!

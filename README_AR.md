# TriPro ERP - نظام إدارة الموارد الشامل
# TriPro ERP - Comprehensive Enterprise Resource Planning System

---

## 🎯 ما هو TriPro ERP؟ | What is TriPro ERP?

TriPro ERP هو نظام إدارة موارد شامل مبني بـ React و TypeScript و Supabase. يوفر حلاً متكاملاً لإدارة:

- 📊 **المحاسبة** - فواتير، دفاتر يومية، تقارير
- 🛒 **المبيعات** - عروض، فواتير، إرجاعات
- 🏪 **المشتريات** - أوامر، فواتير، مخزون
- 📦 **المخزون** - تتبع، تكاليف، حركات
- 👥 **الموارد البشرية** - رواتب، موارد بشرية، عقود
- 📈 **التقارير** - تحليلات شاملة وتقارير

---

## ✨ الميزات الرئيسية | Key Features

### 🔐 الأمان والحماية | Security
- ✅ معالجة شاملة للأخطاء مع تتبع السياق
- ✅ نظام تحقق متقدم (Zod validation)
- ✅ حماية CSRF وحد معدل الطلب
- ✅ تشفير البيانات الحساسة
- ✅ تسجيل العمليات (Audit logging)
- ✅ التحكم في الوصول بالأدوار

### 📋 النماذج والتحقق | Forms & Validation
- ✅ نماذج ديناميكية مع تحقق فوري
- ✅ رسائل خطأ واضحة ومحلية
- ✅ حفظ تلقائي (Auto-save)
- ✅ تتبع التغييرات (Dirty state)
- ✅ حقول ديناميكية مع التحقق

### 🎨 الواجهة والتجربة | UI/UX
- ✅ إشعارات Toast بدلاً من Alert boxes
- ✅ واجهة سريعة الاستجابة (Responsive)
- ✅ متوافقة مع الأجهزة المحمولة
- ✅ تصميم عصري مع Tailwind CSS
- ✅ دعم اللغة العربية كاملاً

### 🚀 الأداء والفعالية | Performance
- ✅ معالجة الطلبات المتوازية
- ✅ إعادة محاولة تلقائية مع Exponential backoff
- ✅ تتبع الأداء وتحسينه
- ✅ تخزين مؤقت (Caching) للعمليات المتكررة
- ✅ تحميل سريع للصفحات

---

## 🚀 البدء السريع | Quick Start

### المتطلبات | Requirements
```bash
- Node.js 16+
- npm أو yarn
- Supabase account
- Modern web browser
```

### التثبيت | Installation
```bash
# استنساخ المشروع
git clone https://github.com/your-repo/tripro-erp.git
cd tripro-erp

# تثبيت الحزم
npm install

# إعداد متغيرات البيئة
cp .env.example .env.local
# أضف مفاتيح Supabase في .env.local

# تشغيل التطبيق
npm run dev
```

### الوصول الأول | First Access
```
URL: http://localhost:5173
البريد الإلكتروني: demo@example.com
كلمة المرور: demo123
```

---

## 📚 الوثائق | Documentation

### أدلة للمطورين | Developer Guides
| الدليل | الوصف | المحتوى |
|------|--------|--------|
| [IMPLEMENTATION_GUIDE.md](./IMPLEMENTATION_GUIDE.md) | دليل التطبيق العملي | أمثلة وخطوات |
| [MIGRATION_SUMMARY.md](./MIGRATION_SUMMARY.md) | ملخص التحسينات | الإحصائيات والمعايير |
| [CHANGELOG.md](./CHANGELOG.md) | سجل التغييرات | جميع التحديثات |

### أدلة للمستخدمين | User Guides
| الموضوع | الرابط | الملفات |
|--------|--------|--------|
| المحاسبة | docs/accounting/ | تقارير، دفاتر |
| المبيعات | docs/sales/ | فواتير، عروض |
| المشتريات | docs/purchases/ | أوامر، مدفوعات |

---

## 🛠️ البنية التحتية | Architecture

### الطبقات | Layers
```
┌─────────────────────────────────────┐
│   User Interface (React Components) │
├─────────────────────────────────────┤
│   State Management (Context + Hooks) │
├─────────────────────────────────────┤
│   Validation & Security Layer       │
├─────────────────────────────────────┤
│   API Integration Layer              │
├─────────────────────────────────────┤
│   Supabase Backend                   │
└─────────────────────────────────────┘
```

### التكنولوجيا المستخدمة | Tech Stack
```typescript
// Frontend
- React 18.2+
- TypeScript 5+
- Tailwind CSS 3+
- Zod (validation)

// Backend
- Supabase (BaaS)
- PostgreSQL
- Real-time subscriptions

// Tools
- Vite (build)
- ESLint (linting)
- Prettier (formatting)
```

---

## 📁 بنية المشروع | Project Structure

```
TriPro-ERP/
├── components/           # React components
│   ├── sales/           # Sales module
│   ├── purchases/       # Purchases module
│   ├── accounting/      # Accounting module
│   ├── reports/         # Reports
│   └── common/          # Shared components
├── modules/             # Feature modules
│   ├── accounting/
│   ├── sales/
│   ├── purchases/
│   ├── inventory/
│   ├── hr/
│   └── reports/
├── context/             # React Context
├── utils/               # Utility functions
│   ├── errorHandler.ts      # Error management
│   ├── toastUtils.ts        # Notifications
│   ├── validationSchemas.ts # Validation
│   ├── securityUtils.ts     # Security
│   ├── formIntegration.ts   # Forms
│   └── apiSecurityMiddleware.ts # API security
├── services/            # API services
├── styles/              # Global styles
└── public/              # Static files
```

---

## 💡 أمثلة الاستخدام | Usage Examples

### مثال 1: إنشاء فاتورة مبيعات | Create Sales Invoice
```typescript
import SimpleInvoiceForm from '@/components/sales/SimpleInvoiceForm';

export default function SalesPage() {
  return (
    <div className="p-6">
      <h1>فاتورة مبيعات جديدة</h1>
      <SimpleInvoiceForm />
    </div>
  );
}
```

### مثال 2: معالجة الأخطاء | Error Handling
```typescript
import { useToastNotification } from '@/utils/toastUtils';
import { handleError } from '@/utils/errorHandler';

async function deleteRecord(id: string) {
  try {
    const response = await fetch(`/api/records/${id}`, {
      method: 'DELETE',
    });
    
    if (!response.ok) {
      throw new Error('فشل الحذف');
    }
    
    showSuccess('تم الحذف بنجاح');
  } catch (error) {
    handleError(error, 'خطأ في الحذف');
    showError(String(error));
  }
}
```

### مثال 3: التحقق من البيانات | Data Validation
```typescript
import { validateData, createInvoiceSchema } from '@/utils/validationSchemas';

const formData = {
  invoiceNumber: 'INV-001',
  customerId: '123',
  totalAmount: 500,
};

const { error, data } = await validateData(
  createInvoiceSchema,
  formData
);

if (error) {
  console.error('خطأ في التحقق:', error);
} else {
  console.log('بيانات صحيحة:', data);
}
```

---

## 🔐 معايير الأمان | Security Standards

### حماية الإدخال | Input Protection
- ✅ إزالة علامات HTML
- ✅ منع حقن SQL
- ✅ حماية XSS
- ✅ تطبيع رسائل البريد الإلكتروني

### حماية الجلسة | Session Protection
- ✅ التحقق من CSRF token
- ✅ حد معدل الطلب (Rate limiting)
- ✅ انتهاء الجلسة التلقائي
- ✅ تسجيل العمليات الحساسة

### حماية البيانات | Data Protection
- ✅ تشفير البيانات الحساسة
- ✅ تجزئة كلمات المرور
- ✅ إخفاء البيانات الحساسة في السجلات
- ✅ نسخ احتياطي منتظمة

---

## 📊 التقارير والتحليلات | Reports & Analytics

### التقارير المتاحة | Available Reports
| التقرير | الموصفة | البيانات |
|--------|---------|---------|
| تقرير العائد الضريبي | Tax compliance | الضرائب المستحقة |
| بيان الرصيد | Account statements | حركات الحسابات |
| تقرير الرصيد المعاكس | Deficit analysis | الأرصدة المعاكسة |
| تقرير طرق الدفع | Payment methods | توزيع الدفع |
| تقرير الأداء | Performance | المقاييس الرئيسية |

### المقاييس الرئيسية | Key Metrics
```
- إجمالي المبيعات
- متوسط الفاتورة
- عدد العملاء
- معدل المرتجعات
- الأرصدة المستحقة
- معدل الدفع
```

---

## 🐛 الدعم والمساعدة | Support & Help

### حل المشاكل الشائعة | Common Issues

#### المشكلة: Toast notifications لا تظهر
**الحل:**
```typescript
// تأكد من أن ToastProvider موجود في App.tsx
import { ToastProvider } from '@/context/ToastContext';

export default function App() {
  return (
    <ToastProvider>
      {/* التطبيق */}
    </ToastProvider>
  );
}
```

#### المشكلة: التحقق لا يعمل
**الحل:**
```typescript
// تأكد من استخدام useForm مع schema
const form = useForm(values, validationSchema, onSubmit);
```

#### المشكلة: CSRF token missing
**الحل:**
```typescript
// حفظ CSRF token بعد تسجيل الدخول
sessionStorage.setItem('csrf_token', token);
```

### الحصول على الدعم | Getting Support
- 📧 البريد: support@tripro.com
- 💬 الدردشة: chat.tripro.com
- 📱 الهاتف: +966-xxx-xxx
- 🌐 الموقع: docs.tripro.com

---

## 📈 خطط التطوير | Development Roadmap

### Q1 2024
- [ ] دمج الـ validation في جميع النماذج
- [ ] تحسينات الأداء
- [ ] اختبار الأمان

### Q2 2024
- [ ] مصادقة ثنائية (2FA)
- [ ] نسخ احتياطية تلقائية
- [ ] تقارير متقدمة

### Q3 2024
- [ ] واجهة برمجية GraphQL
- [ ] تطبيق mobile
- [ ] تكامل الدفع

### Q4 2024
- [ ] AI و ML features
- [ ] معالجة Blockchain
- [ ] Microservices

---

## 🤝 المساهمة | Contributing

نرحب بمساهماتك! يرجى:

1. Fork المشروع
2. Create feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit changes (`git commit -m 'Add AmazingFeature'`)
4. Push to branch (`git push origin feature/AmazingFeature`)
5. Open Pull Request

### معايير المساهمة | Contribution Guidelines
- اتبع معايير الكود الموجودة
- اكتب اختبارات للميزات الجديدة
- حدّث الوثائق
- اتبع conventional commits

---

## 📄 الترخيص | License

هذا المشروع مرخص تحت MIT License - اطلع على [LICENSE](./LICENSE) للتفاصيل.

---

## 👨‍💼 الفريق | Team

- **المطورون** | Developers: Team TriPro
- **المصممون** | Designers: UX Team
- **مدير المشروع** | PM: Project Manager

---

## 🙏 شكر وتقدير | Acknowledgments

نشكر:
- React و TypeScript و Supabase
- المجتمع العالمي للمطورين
- المستخدمين على تعليقاتهم القيمة

---

## 📞 التواصل | Contact

- 🌐 الموقع: https://tripro.com
- 📧 البريد: info@tripro.com
- 🐦 تويتر: @TriProERP
- 💼 LinkedIn: /company/tripro-erp

---

## 🎉 شكراً لاختيارك TriPro ERP!

نأمل أن يساعدك هذا النظام في إدارة عملك بكفاءة وأمان.

**الإصدار | Version:** 2.0.0
**آخر تحديث | Last Updated:** 2024
**الحالة | Status:** PRODUCTION READY ✅

---

## 📚 قراءات إضافية | Further Reading

- [دليل المستخدم الشامل](./docs/USER_GUIDE.md)
- [دليل الإدارة](./docs/ADMIN_GUIDE.md)
- [مرجع API](./docs/API_REFERENCE.md)
- [أفضل الممارسات](./docs/BEST_PRACTICES.md)

---

**تم آخر تعديل | Last Modified:** 2024
**المؤلف | Author:** TriPro Team
**حالة الحماية | Security Status:** ✅ SECURE


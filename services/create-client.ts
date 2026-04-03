import { createClient } from '@supabase/supabase-js'

// إعداد اتصال سوبابايز باستخدام مفتاح الخدمة (Service Role)
// ملاحظة: يجب إضافة هذه المتغيرات في إعدادات Vercel
const supabaseAdmin = createClient(
  process.env.VITE_SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
)

export default async function handler(req: any, res: any) {
  // تأمين الـ API: السماح فقط بطلبات POST
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const { email, password, companyName, adminName, modules, subscriptionExpiry, maxUsers, coaTemplate } = req.body

  try {
    // 1. إنشاء المنظمة (الشركة) الجديدة
    const { data: org, error: orgError } = await supabaseAdmin
      .from('organizations')
      .insert({ 
        name: companyName, 
        allowed_modules: modules || ['accounting'], 
        subscription_expiry: subscriptionExpiry || null,
        max_users: maxUsers || 5
      })
      .select()
      .single()

    if (orgError) throw orgError

    // 2. إنشاء المستخدم في نظام المصادقة (Auth) مع ربطه بالشركة عبر Metadata
    const { data: user, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { 
        org_id: org.id, 
        full_name: adminName,
        role: 'admin' 
      }
    })

    if (authError) {
      // تراجع: إذا فشل إنشاء المستخدم، نحذف الشركة التي أنشأناها
      await supabaseAdmin.from('organizations').delete().eq('id', org.id)
      throw authError
    }

    // 3. تهيئة البيانات الأساسية للشركة الجديدة (اختياري: مثل دليل الحسابات الافتراضي)
    const templates: Record<string, any[]> = {
      restaurant: [
        { code: '1231', name: 'صندوق الكاشير الرئيسي', type: 'ASSET', organization_id: org.id },
        { code: '411', name: 'إيرادات المأكولات والمشروبات', type: 'REVENUE', organization_id: org.id },
        { code: '511', name: 'تكلفة الخامات المستهلكة (COGS)', type: 'EXPENSE', organization_id: org.id }
      ],
      construction: [
        { code: '1221', name: 'مستخلصات العملاء', type: 'ASSET', organization_id: org.id },
        { code: '411', name: 'إيرادات مشاريع المقاولات', type: 'REVENUE', organization_id: org.id },
        { code: '511', name: 'تكاليف تنفيذ المشاريع', type: 'EXPENSE', organization_id: org.id }
      ],
      commercial: [
        { code: '1231', name: 'الصندوق الرئيسي', type: 'ASSET', organization_id: org.id },
        { code: '1221', name: 'حساب العملاء', type: 'ASSET', organization_id: org.id },
        { code: '411', name: 'إيراد المبيعات', type: 'REVENUE', organization_id: org.id }
      ],
      clinic: [
        { code: '1231', name: 'الصندوق الرئيسي', type: 'ASSET', organization_id: org.id },
        { code: '1221', name: 'حسابات المرضى والعملاء', type: 'ASSET', organization_id: org.id },
        { code: '411', name: 'إيرادات الخدمات والعمليات الطبية', type: 'REVENUE', organization_id: org.id },
        { code: '10303', name: 'مخزون الأدوية والمستلزمات الطبية', type: 'ASSET', organization_id: org.id },
        { code: '536', name: 'مصروفات طبية وتشغيلية', type: 'EXPENSE', organization_id: org.id }
      ],
      legal: [
        { code: '1231', name: 'الصندوق الرئيسي', type: 'ASSET', organization_id: org.id },
        { code: '1221', name: 'حسابات الموكلين والعملاء', type: 'ASSET', organization_id: org.id },
        { code: '411', name: 'أتعاب المحاماة والاستشارات القانونية', type: 'REVENUE', organization_id: org.id },
        { code: '226', name: 'حساب أمانات الموكلين (قضايا)', type: 'LIABILITY', organization_id: org.id },
        { code: '537', name: 'رسوم ومصروفات قضائية', type: 'EXPENSE', organization_id: org.id }
      ],
      transport: [
        { code: '1231', name: 'الصندوق الرئيسي', type: 'ASSET', organization_id: org.id },
        { code: '1221', name: 'حسابات العملاء (شحن وتفريغ)', type: 'ASSET', organization_id: org.id },
        { code: '411', name: 'إيرادات خدمات النقل واللوجستيات', type: 'REVENUE', organization_id: org.id },
        { code: '511', name: 'تكاليف تشغيل الأسطول (وقود وصيانة)', type: 'EXPENSE', organization_id: org.id }
      ],
      charity: [
        { code: '1231', name: 'صندوق التبرعات والصدقات', type: 'ASSET', organization_id: org.id },
        { code: '411', name: 'إيرادات التبرعات والمساهمات', type: 'REVENUE', organization_id: org.id },
        { code: '531', name: 'مصروفات المشاريع الخيرية والمساعدات', type: 'EXPENSE', organization_id: org.id },
        { code: '226', name: 'أمانات مستحقي المساعدة والزكاة', type: 'LIABILITY', organization_id: org.id }
      ]
    };

    const selectedAccounts = templates[coaTemplate as string] || templates.commercial;
    
    await supabaseAdmin.from('accounts').insert(selectedAccounts);


    // 4. إضافة إعدادات الشركة الافتراضية
    await supabaseAdmin.from('company_settings').insert({
      company_name: companyName,
      organization_id: org.id,
      currency: 'EGP',
      vat_rate: 0.14
    })

    return res.status(200).json({ message: 'تم إنشاء العميل والشركة بنجاح', orgId: org.id })

  } catch (error: any) {
    return res.status(400).json({ error: error.message })
  }
}
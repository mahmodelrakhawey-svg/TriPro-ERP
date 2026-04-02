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

  const { email, password, companyName, adminName, modules, subscriptionExpiry } = req.body

  try {
    // 1. إنشاء المنظمة (الشركة) الجديدة
    const { data: org, error: orgError } = await supabaseAdmin
      .from('organizations')
      .insert({ name: companyName, allowed_modules: modules || ['accounting'], subscription_expiry: subscriptionExpiry || null })
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
    // بما أنك محاسب، سنقوم هنا بإضافة حساب "الصندوق" و"المبيعات" كبداية
    await supabaseAdmin.from('accounts').insert([
      { code: '1231', name: 'الصندوق الرئيسي', type: 'ASSET', organization_id: org.id },
      { code: '411', name: 'إيراد مبيعات', type: 'REVENUE', organization_id: org.id },
      { code: '1221', name: 'حساب العملاء', type: 'ASSET', organization_id: org.id }
    ])

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
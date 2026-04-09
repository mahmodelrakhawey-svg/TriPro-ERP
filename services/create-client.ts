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

  const { email, password, companyName, adminName, modules, subscriptionExpiry, maxUsers, currency, vatRate, coaTemplate, logoUrl } = req.body

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
    const { data: newUser, error: authError } = await supabaseAdmin.auth.admin.createUser({
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

    // 3. تهيئة الدليل المحاسبي المصري الشامل آلياً عبر دالة SQL المحدثة
    const { error: coaError } = await supabaseAdmin.rpc('initialize_egyptian_coa', {
      p_org_id: org.id,
      p_activity_type: coaTemplate || 'commercial',
      p_admin_id: newUser.user.id
    });

    if (coaError) {
      console.error("COA initialization failed:", coaError);
    }

    // 4. إضافة إعدادات الشركة الافتراضية
    await supabaseAdmin.from('company_settings').insert({
      company_name: companyName,
      organization_id: org.id,
      currency: currency || 'EGP',
      vat_rate: (vatRate !== undefined ? vatRate : 14) / 100,
      logo_url: logoUrl || null
    })

    return res.status(200).json({ message: 'تم إنشاء العميل والشركة بنجاح', orgId: org.id })

  } catch (error: any) {
    return res.status(400).json({ error: error.message })
  }
}
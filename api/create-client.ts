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

  // التحقق من صلاحية المستخدم (يجب أن يكون Super Admin)
  const authHeader = req.headers.authorization
  if (!authHeader) return res.status(401).json({ error: 'Unauthorized' })
  
  const token = authHeader.split(' ')[1]
  const { data: { user }, error: userError } = await supabaseAdmin.auth.getUser(token)

  if (userError || !user) return res.status(401).json({ error: 'Invalid session' })

  // التحقق من الدور في قاعدة البيانات
  const { data: profile } = await supabaseAdmin.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'super_admin') {
    return res.status(403).json({ error: 'Only Super Admins can create clients' })
  }

  const { email, password, companyName, adminName, modules, subscriptionExpiry, maxUsers, currency, vatRate, coaTemplate, plan, logoUrl } = req.body

  try {
    // 1. إنشاء المنظمة (الشركة) الجديدة
    const { data: org, error: orgError } = await supabaseAdmin
      .from('organizations')
      .insert({ 
        name: companyName, 
        allowed_modules: modules || ['accounting'], 
        subscription_expiry: subscriptionExpiry || null, 
        max_users: maxUsers || 5,
        activity_type: coaTemplate // 👈 حفظ نوع النشاط المختار
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

    // 3. تهيئة الدليل المحاسبي المصري الشامل آلياً عبر دالة SQL
    // بدلاً من إدخال حسابات محدودة، نستدعي الدالة التي تبني الدليل الشجري بالكامل
    const { error: coaError } = await supabaseAdmin.rpc('initialize_egyptian_coa', {
      p_org_id: org.id,
      p_template: coaTemplate || 'commercial'
    });

    if (coaError) {
      console.error("COA initialization failed:", coaError);
      // نستمر في العملية ولكن نسجل الخطأ للمتابعة
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
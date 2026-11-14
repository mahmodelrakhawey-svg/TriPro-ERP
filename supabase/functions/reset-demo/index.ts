import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

// 🛡️ ترويسات CORS للسماح بالطلبات من المتصفح (Localhost أو نطاق الإنتاج)
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // 1. التعامل مع طلب Preflight الخاص بالمتصفح
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // 2. تعيين معرف المستخدم التجريبي الثابت فقط
    const DEMO_EMAIL = 'demo@demo.com'
    const DEMO_PASSWORD = '123456'

    // 3. إنشاء عميل Supabase بمفتاح الخدمة لتخطي قيود الحماية العادية
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // 4. استعلام موجه عن المستخدم التجريبي لمنع تسريب أو تفريغ كافة مستخدمي النظام
    const DEMO_USER_ID = Deno.env.get('DEMO_USER_ID') || 'f95ae857-91fb-4637-8c6a-7fe45e8fa005'
    let demoUserId = DEMO_USER_ID

    const { data: userRecord } = await supabaseClient.auth.admin.getUserById(demoUserId)
    if (!userRecord?.user || userRecord.user.email?.toLowerCase() !== DEMO_EMAIL.toLowerCase()) {
      // احتياطي: استعلام محدود بصفحة واحدة (50 مستخدم كحد أقصى)
      const { data: usersData, error: listError } = await supabaseClient.auth.admin.listUsers({ page: 1, perPage: 50 })
      if (listError) throw listError
      const found = usersData?.users?.find(u => u.email?.toLowerCase() === DEMO_EMAIL.toLowerCase())
      if (!found) {
        return new Response(JSON.stringify({ message: 'Demo user not found or not initialized' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200,
        })
      }
      demoUserId = found.id
    }

    // 5. إعادة تعيين كلمة مرور الديمو إلى 123456 حصراً
    const { error: resetError } = await supabaseClient.auth.admin.updateUserById(
      demoUserId,
      { password: DEMO_PASSWORD }
    )

    if (resetError) throw resetError

    return new Response(JSON.stringify({ success: true, message: 'Demo account reset successfully' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    })
  }
})
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

    // 4. استعلام عن المستخدم التجريبي بالبريد الإلكتروني لمنع العبث بأي حساب آخر
    const { data: usersData, error: listError } = await supabaseClient.auth.admin.listUsers()
    if (listError) throw listError

    const demoUser = usersData.users.find(u => u.email === DEMO_EMAIL)
    if (!demoUser) {
      return new Response(JSON.stringify({ message: 'Demo user not found or not initialized' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      })
    }

    // 5. إعادة تعيين كلمة مرور الديمو إلى 123456 حصراً
    const { error: resetError } = await supabaseClient.auth.admin.updateUserById(
      demoUser.id,
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
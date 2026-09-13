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
    // 2. التحقق الأمني الإجباري: التحقق من التوكن وهوية المستخدم المتصل
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized: Missing Authorization header' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 401,
      })
    }

    const token = authHeader.replace(/^Bearer\s+/i, '').trim()
    if (!token) {
      return new Response(JSON.stringify({ error: 'Unauthorized: Invalid token format' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 401,
      })
    }

    // 3. إنشاء عميل Supabase بمفتاح الخدمة لتخطي قيود الحماية العادية
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // التحقق من صحة التوكن واستخراج المستخدم المتصل
    const { data: { user: callerUser }, error: callerError } = await supabaseClient.auth.getUser(token)
    if (callerError || !callerUser) {
      return new Response(JSON.stringify({ error: 'Unauthorized: Invalid or expired session' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 401,
      })
    }

    // جلب دور وصلاحية المستخدم المتصل من profiles
    const { data: callerProfile, error: profileError } = await supabaseClient
      .from('profiles')
      .select('role, organization_id')
      .eq('id', callerUser.id)
      .single()

    if (profileError || !callerProfile) {
      return new Response(JSON.stringify({ error: 'Forbidden: User profile not found' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 403,
      })
    }

    // 4. استخراج البيانات من الطلب والتحقق منها
    const { userId, newPassword } = await req.json()

    if (!userId || !newPassword) {
      return new Response(JSON.stringify({ error: 'UserId and newPassword are required' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      })
    }

    if (typeof newPassword !== 'string' || newPassword.length < 6) {
      return new Response(JSON.stringify({ error: 'Password must be at least 6 characters' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      })
    }

    // 5. التحقق من أذونات التعديل:
    // - السوبر أدمن (super_admin): مسموح له بتعديل أي مستخدم
    // - الأدمن (admin): مسموح له فقط بتعديل مستخدمي نفس الشركة، وممنوع من تعديل السوبر أدمن
    const isSuperAdmin = callerProfile.role === 'super_admin'

    if (!isSuperAdmin) {
      if (callerProfile.role !== 'admin') {
        return new Response(JSON.stringify({ error: 'Forbidden: Only administrators can reset user passwords' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 403,
        })
      }

      // استعلام عن المستخدم المستهدف
      const { data: targetProfile, error: targetError } = await supabaseClient
        .from('profiles')
        .select('role, organization_id')
        .eq('id', userId)
        .single()

      if (targetError || !targetProfile) {
        return new Response(JSON.stringify({ error: 'Target user not found' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 404,
        })
      }

      // منع تعديل حساب السوبر أدمن
      if (targetProfile.role === 'super_admin') {
        return new Response(JSON.stringify({ error: 'Forbidden: Cannot modify Super Admin account' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 403,
        })
      }

      // التأكد من أن المستخدم ينتمي لنفس الشركة
      if (!callerProfile.organization_id || targetProfile.organization_id !== callerProfile.organization_id) {
        return new Response(JSON.stringify({ error: 'Forbidden: You can only reset passwords for users in your own organization' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 403,
        })
      }
    }

    // 6. تحديث كلمة المرور عبر واجهة الإدارة (Admin Auth)
    const { data, error } = await supabaseClient.auth.admin.updateUserById(
      userId,
      { password: newPassword }
    )

    if (error) throw error

    return new Response(JSON.stringify({ success: true, message: 'Password updated successfully' }), {
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

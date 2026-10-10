import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // إعدادات CORS القياسية المتوافقة مع معايير الأمان
  const origin = req.headers.origin;
  if (origin) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  } else {
    res.setHeader('Access-Control-Allow-Origin', '*');
  }
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();

  // السماح فقط بطلبات POST لمنع تشغيل عمليات النسخ الاحتياطي عبر طلبات GET غير مقصودة
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed. Only POST is accepted.' });
  }

  const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceKey) {
    return res.status(500).json({ error: 'Supabase server credentials missing on serverless environment.' });
  }

  // 🔒 التحقق الصارم من هوية المستخدم (JWT Bearer Token)
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'غير مصرح: يجب توفير رمز جلسة صالح (Unauthorized: Bearer token required).' });
  }

  const token = authHeader.split(' ')[1];
  const supabaseAdmin = createClient(supabaseUrl, serviceKey);

  const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
  if (authError || !user) {
    return res.status(401).json({ error: 'جلسة المستخدم غير صالحة أو منتهية الصلاحية (Invalid session).' });
  }

  try {
    const { action = 'backup', organizationId } = req.body || {};

    if (!organizationId) {
      return res.status(400).json({ error: 'Organization ID is required.' });
    }

    // 🛡️ التحقق من الصلاحيات: يسمح فقط للمسؤول العام (super_admin) أو مدير المؤسسة (admin)
    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('role, organization_id, is_active')
      .eq('id', user.id)
      .maybeSingle();

    if (!profile || profile.is_active === false) {
      return res.status(403).json({ error: 'محظور: الحساب غير نشط أو غير موجود (Forbidden: Inactive user).' });
    }

    const isSuperAdmin = profile.role === 'super_admin';
    const isOrgAdmin = profile.role === 'admin' && profile.organization_id === organizationId;

    if (!isSuperAdmin && !isOrgAdmin) {
      return res.status(403).json({ error: 'محظور: ليس لديك صلاحية أخذ نسخة احتياطية لهذه الشركة (Forbidden).' });
    }

    // استدعاء الدالة المخزنة في قاعدة البيانات
    const { data: backupId, error: rpcError } = await supabaseAdmin.rpc('create_organization_backup', {
      p_org_id: organizationId
    });

    if (rpcError) throw rpcError;

    return res.status(200).json({
      success: true,
      message: 'تم إنشاء النسخة الاحتياطية بنجاح.',
      backupId
    });

  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : 'فشلت عملية النسخ الاحتياطي السحابي';
    return res.status(500).json({
      success: false,
      error: errorMsg
    });
  }
}

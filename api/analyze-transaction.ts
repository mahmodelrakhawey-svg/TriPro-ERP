import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

const FALLBACK_MODELS = ['gemini-3.5-flash', 'gemini-2.5-flash', 'gemini-3.5-flash-lite'];

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CORS configuration
  const origin = req.headers.origin;
  if (origin) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  } else {
    res.setHeader('Access-Control-Allow-Origin', '*');
  }
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // 🔒 التحقق الصارم من جلسة المستخدم عبر JWT لمنع استهلاك حصة الذكاء الاصطناعي كبروكسي مفتوح
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ 
      error: 'غير مصرح: يجب تسجيل الدخول لاستخدام المساعد الذكي (Unauthorized: Bearer token required).' 
    });
  }

  const token = authHeader.split(' ')[1];
  const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_KEY;

  if (supabaseUrl && supabaseKey) {
    const supabase = createClient(supabaseUrl, supabaseKey);
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return res.status(401).json({ error: 'جلسة المستخدم غير صالحة أو منتهية الصلاحية (Invalid session).' });
    }

    // التحقق من أن الحساب نشط وغير معطل
    const { data: profile } = await supabase
      .from('profiles')
      .select('is_active')
      .eq('id', user.id)
      .maybeSingle();

    if (profile && profile.is_active === false) {
      return res.status(403).json({ error: 'الحساب معطل (Deactivated account).' });
    }
  }

  const apiKey = (process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY || process.env.API_KEY || '').trim();
  if (!apiKey) {
    return res.status(500).json({ 
      error: 'مفتاح GEMINI_API_KEY مفقود في إعدادات سيرفر Vercel. يرجى إضافته في Vercel Dashboard (Settings -> Environment Variables) ثم إجـراء Redeploy.' 
    });
  }

  const { text, accounts } = req.body || {};
  if (!text || !Array.isArray(accounts)) {
    return res.status(400).json({ error: 'Missing text or accounts in request body.' });
  }

  const accountsContext = accounts.map((a: Record<string, any>) => `${a.code}: ${a.name} (${a.type})`).join('\n');

  const systemInstruction = `
    أنت خبير محاسبي ومساعد ذكي. دورك هو تحويل الوصف النصي للمعاملات المالية إلى قيد محاسبي مقترح بتنسيق JSON.
    
    لديك دليل الحسابات التالي:
    ${accountsContext}

    القواعد:
    1. اقرأ نص المستخدم بعناية.
    2. حدد الحسابات المدينة والدائنة المناسبة من القائمة أعلاه.
    3. إذا لم تجد حساباً مطابقاً تماماً، اختر الأقرب.
    4. يجب أن يكون القيد متوازناً (إجمالي المدين = إجمالي الدائن).
    5. قم بإرجاع JSON فقط.

    Schema:
    {
      "description": "وصف مهني للقيد",
      "lines": [
        { "accountCode": "string", "debit": number, "credit": number }
      ]
    }
  `;

  let lastErrorMsg = '';

  for (const model of FALLBACK_MODELS) {
    try {
      if (process.env.NODE_ENV === 'development') console.log(`[API /api/analyze-transaction] Requesting REST API for model: ${model}`);
      const endpoint = `https://generativelanguage.googleapis.com/v1/models/${model}:generateContent?key=${apiKey}`;
      
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          systemInstruction: {
            parts: [{ text: systemInstruction }]
          },
          contents: [
            {
              parts: [{ text }]
            }
          ],
          generationConfig: {
            responseMimeType: "application/json"
          }
        })
      });

      const responseData = await response.json();

      if (!response.ok) {
        if (process.env.NODE_ENV === 'development') console.warn(`[API /api/analyze-transaction] Model ${model} HTTP ${response.status}:`, responseData);
        lastErrorMsg = responseData?.error?.message || `HTTP ${response.status} error`;
        if (response.status === 400 || response.status === 401 || response.status === 403) {
          break; // stop on API key errors
        }
        continue;
      }

      const resText = responseData?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!resText) {
        lastErrorMsg = 'No text returned from Gemini API';
        continue;
      }

      const parsedData = JSON.parse(resText);
      return res.status(200).json(parsedData);

    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      if (process.env.NODE_ENV === 'development') console.warn(`[API /api/analyze-transaction] Model ${model} exception:`, errMsg);
      lastErrorMsg = errMsg;
    }
  }

  if (process.env.NODE_ENV === 'development') console.error('[API /api/analyze-transaction] All models failed. Last error:', lastErrorMsg);

  if (lastErrorMsg.includes('API_KEY_INVALID') || lastErrorMsg.includes('API key not valid') || lastErrorMsg.includes('404') || lastErrorMsg.includes('not found')) {
    return res.status(400).json({
      error: 'مفتاح Gemini API غير صالح أو لم يفعل الخدمة. يرجى إنشاء مفتاح جديد من Google AI Studio (aistudio.google.com/app/apikey) وإضافته في Vercel.'
    });
  }

  if (lastErrorMsg.includes('429') || lastErrorMsg.includes('RESOURCE_EXHAUSTED') || lastErrorMsg.includes('Quota exceeded')) {
    return res.status(429).json({
      error: 'تم الوصول للحد الأقصى المسموح مؤقتاً لطلبات Gemini المجانية (Rate Limit). يرجى الانتظار 30 ثانية ثم إعادة المحاولة.'
    });
  }

  return res.status(500).json({ error: lastErrorMsg || 'Internal Server Error' });
}

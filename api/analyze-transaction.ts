import type { VercelRequest, VercelResponse } from '@vercel/node';

const FALLBACK_MODELS = ['gemini-2.0-flash', 'gemini-1.5-flash-latest'];

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
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

  const accountsContext = accounts.map((a: any) => `${a.code}: ${a.name} (${a.type})`).join('\n');

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
      console.log(`[API /api/analyze-transaction] Requesting REST API for model: ${model}`);
      const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
      
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
        console.warn(`[API /api/analyze-transaction] Model ${model} HTTP ${response.status}:`, responseData);
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

    } catch (err: any) {
      console.warn(`[API /api/analyze-transaction] Model ${model} exception:`, err);
      lastErrorMsg = err?.message || String(err);
    }
  }

  console.error('[API /api/analyze-transaction] All models failed. Last error:', lastErrorMsg);

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

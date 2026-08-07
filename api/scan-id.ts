import type { VercelRequest, VercelResponse } from '@vercel/node';

const FALLBACK_MODELS = ['gemini-2.0-flash', 'gemini-2.0-flash-lite'];

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

  const { base64Data, mimeType } = req.body || {};
  if (!base64Data || !mimeType) {
    return res.status(400).json({ error: 'Missing base64Data or mimeType in request body.' });
  }

  const cleanBase64 = base64Data.replace(/^data:[^;]+;base64,/, '').trim();

  const systemInstruction = `
    You are an expert document parser. Extract information from the provided Egyptian National ID card image (front side).
    Translate Arabic numerals (e.g. ٢٩٢...) to Western standard digits (e.g. 292...).
    Ensure the national ID contains exactly 14 digits.
    Determine the gender: in Egyptian IDs, the 13th digit (second from the right) is odd for male ("male") and even for female ("female").
    Return JSON only with keys: full_name, national_id, dob, gender.
  `;

  let lastErrorMsg = '';

  for (const model of FALLBACK_MODELS) {
    try {
      console.log(`[API /api/scan-id] Requesting REST API for model: ${model}`);
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
              parts: [
                {
                  inlineData: {
                    mimeType: mimeType,
                    data: cleanBase64
                  }
                },
                {
                  text: "Extract: full_name, national_id, dob (YYYY-MM-DD), and gender ('male' or 'female') from this Egyptian National ID card image."
                }
              ]
            }
          ],
          generationConfig: {
            responseMimeType: "application/json"
          }
        })
      });

      const responseData = await response.json();

      if (!response.ok) {
        console.warn(`[API /api/scan-id] Model ${model} HTTP ${response.status}:`, responseData);
        lastErrorMsg = responseData?.error?.message || `HTTP ${response.status} error`;
        if (response.status === 400 || response.status === 401 || response.status === 403) {
          break; // stop on API key errors
        }
        continue;
      }

      const text = responseData?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!text) {
        lastErrorMsg = 'No text returned from Gemini API';
        continue;
      }

      const cleanJson = text.replace(/```json/gi, '').replace(/```/g, '').trim();
      const parsedData = JSON.parse(cleanJson);
      return res.status(200).json(parsedData);

    } catch (err: any) {
      console.warn(`[API /api/scan-id] Model ${model} exception:`, err);
      lastErrorMsg = err?.message || String(err);
    }
  }

  console.error('[API /api/scan-id] All models failed. Last error:', lastErrorMsg);

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

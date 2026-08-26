import type { VercelRequest, VercelResponse } from '@vercel/node';

const ENDPOINTS_TO_TRY = (key: string) => [
  `https://generativelanguage.googleapis.com/v1/models/gemini-3.5-flash:generateContent?key=${key}`,
  `https://generativelanguage.googleapis.com/v1/models/gemini-2.5-flash:generateContent?key=${key}`,
  `https://generativelanguage.googleapis.com/v1/models/gemini-3.5-flash-lite:generateContent?key=${key}`
];

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
  if (!base64Data) {
    return res.status(400).json({ error: 'Missing base64Data in request body.' });
  }

  const cleanBase64 = base64Data.replace(/^data:[^;]+;base64,/, '').trim();

  const invoicePrompt = `
    أنت خبير فحص ومطابقة فواتير المشتريات والحسابات.
    قم بفحص صورة فاتورة المشتريات بدقة واستخراج جميع البيانات المالية وجدول الأصناف بالتفصيل باللغة العربية.

    يجب أن ترجع النتيجة بصيغة JSON فقط كالتالي:
    {
      "supplierName": "اسم المورد أو الشركة المصدرة للفاتورة",
      "invoiceNumber": "رقم الفاتورة المكتوب في الورقة إن وجد",
      "invoiceDate": "YYYY-MM-DD (تاريخ الفاتورة بصيغة سنة-شهر-يوم)",
      "notes": "ملاحظات أو طريقة الدفع إن وجدت",
      "subtotal": 0.0,
      "taxAmount": 0.0,
      "totalAmount": 0.0,
      "items": [
        {
          "productName": "اسم الصنف أو الوصف المكتوب بدقة",
          "quantity": 1.0,
          "unitPrice": 0.0,
          "total": 0.0,
          "barcode": "",
          "uomName": "الوحدة مثل: قطعة، كرتونة، كيلو، علبة"
        }
      ]
    }

    ملاحظات هامة:
    - إذا لم تجد رقم الفاتورة أو التاريخ، ضع التاريخ الحالي ورقم فاتورة فارغ.
    - استخرج كل سطر وصنف في جدول الفاتورة بشكل منفصل.
    - تأكد أن quantity و unitPrice و total أرقام صحيحة أو عشرية وليست نصوصاً.
  `;

  let lastErrorMsg = '';

  for (const endpoint of ENDPOINTS_TO_TRY(apiKey)) {
    try {
      console.log(`[API /api/scan-invoice] Requesting REST API: ${endpoint.split('?')[0]}`);
      
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          systemInstruction: {
            parts: [{ text: invoicePrompt }]
          },
          contents: [
            {
              parts: [
                {
                  inlineData: {
                    mimeType: mimeType || 'image/jpeg',
                    data: cleanBase64
                  }
                },
                {
                  text: "Extract invoice details and items table from this purchase invoice. Return valid JSON only."
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
        console.warn(`[API /api/scan-invoice] Endpoint ${endpoint.split('?')[0]} HTTP ${response.status}:`, responseData);
        lastErrorMsg = responseData?.error?.message || `HTTP ${response.status} error`;
        if (response.status === 400 || response.status === 401 || response.status === 403) {
          break;
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
      console.warn(`[API /api/scan-invoice] Endpoint ${endpoint.split('?')[0]} exception:`, err);
      lastErrorMsg = err?.message || String(err);
    }
  }

  console.error('[API /api/scan-invoice] All models failed. Last error:', lastErrorMsg);

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

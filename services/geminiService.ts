import { GoogleGenAI, Type } from "@google/genai";
import { Account } from "../types";
import { secureStorage } from '../utils/securityMiddleware';

// الموديلات المتاحة فعلياً (تم التحقق بالاختبار المباشر)
const VALID_MODELS = ['gemini-3.5-flash', 'gemini-2.5-flash', 'gemini-3.5-flash-lite'];

// Helper function to call generateContent with fallback models on client side if needed
const generateWithFallback = async (
  ai: any,
  params: { contents: any; config: any },
  modelList: string[]
) => {
  let lastError: any = null;
  for (const model of modelList) {
    try {
      console.log(`Attempting generateContent with model: ${model}`);
      const response = await ai.models.generateContent({
        model: model,
        ...params
      });
      return response;
    } catch (error: any) {
      console.warn(`Model ${model} failed:`, error);
      lastError = error;
    }
  }
  throw lastError || new Error("All fallback models failed");
};

/**
 * تحليل المعاملة المحاسبية عبر السيرفر (أو الاتصال المباشر محلياً)
 */
export const analyzeTransactionText = async (text: string, accounts: Account[]) => {
  let lastServerErrorMessage = '';
  // 1. المحاولة الأولى: الاستدعاء السيرفري عبر /api/analyze-transaction
  try {
    const res = await fetch('/api/analyze-transaction', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, accounts })
    });

    if (res.ok) {
      const data = await res.json();
      return data;
    } else {
      const errJson = await res.json().catch(() => ({}));
      if (errJson.error) {
        lastServerErrorMessage = errJson.error;
      }
    }
  } catch (serverErr: any) {
    console.warn("Server API Route /api/analyze-transaction unreachable, trying local client fallback...", serverErr);
    if (serverErr?.message) lastServerErrorMessage = serverErr.message;
  }

  // 2. التراجع المحلي (Client Fallback) في حالة البيئة المحلية ومفتاح GEMINI_API_KEY / VITE_GEMINI_API_KEY
  const apiKey = import.meta.env.VITE_GEMINI_API_KEY || 
                 (typeof process !== 'undefined' ? (process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY || process.env.API_KEY) : undefined);
  if (!apiKey) {
    throw new Error(lastServerErrorMessage || "مفتاح API مفقود. يرجى التأكد من ضبط GEMINI_API_KEY في إعدادات Vercel Dashboard.");
  }

  const ai = new GoogleGenAI({ apiKey });
  const accountsContext = accounts.map(a => `${a.code}: ${a.name} (${a.type})`).join('\n');

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

  try {
    const response = await generateWithFallback(
      ai,
      {
        contents: text,
        config: {
          systemInstruction: systemInstruction,
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              description: { type: Type.STRING },
              lines: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    accountCode: { type: Type.STRING },
                    debit: { type: Type.NUMBER },
                    credit: { type: Type.NUMBER }
                  },
                  required: ['accountCode', 'debit', 'credit']
                }
              }
            },
            required: ['description', 'lines']
          }
        }
      },
      VALID_MODELS
    );

    return JSON.parse(response.text || '{}');
  } catch (error) {
    console.error("Gemini API Error:", error);
    throw error;
  }
};

/**
 * استدعاء مباشر لـ Gemini REST API من المتصفح في حال وجود مفتاح محلي
 */
const callGeminiRestDirect = async (base64Data: string, mimeType: string, apiKey: string) => {
  const cleanBase64 = base64Data.replace(/^data:[^;]+;base64,/, '').trim();
  const cleanKey = apiKey.replace(/["'\s]/g, '').trim();

  if (!cleanKey) {
    throw new Error("مفتاح Gemini API مفقود. يرجى إدخال المفتاح أولاً.");
  }

  const systemInstruction = `
    You are an expert document parser. Extract information from the provided Egyptian National ID card image (front side).
    Translate Arabic numerals (e.g. ٢٩٢...) to Western standard digits (e.g. 292...).
    Ensure the national ID contains exactly 14 digits.
    Determine the gender: in Egyptian IDs, the 13th digit (second from the right) is odd for male ("male") and even for female ("female").
    Return JSON only with keys: full_name, national_id, dob, gender.
  `;

  // المحاولة الأولى: عبر المكتبة الرسمية لشركة جوجل SDK
  try {
    console.log("[callGeminiRestDirect] Attempting official GoogleGenAI SDK with key prefix:", cleanKey.substring(0, 8) + '...');
    const ai = new GoogleGenAI({ apiKey: cleanKey });
    const response = await ai.models.generateContent({
      model: 'gemini-3.5-flash',
      contents: [
        {
          role: 'user',
          parts: [
            { inlineData: { mimeType: mimeType || 'image/jpeg', data: cleanBase64 } },
            { text: "Extract: full_name, national_id (14 digits), dob (YYYY-MM-DD), and gender ('male' or 'female') from this Egyptian National ID card image. Return JSON only." }
          ]
        }
      ],
      config: {
        systemInstruction: systemInstruction,
        responseMimeType: "application/json"
      }
    });

    if (response.text) {
      const cleanJson = response.text.replace(/```json/gi, '').replace(/```/g, '').trim();
      const parsed = JSON.parse(cleanJson);
      if (parsed && typeof parsed === 'object' && (parsed.full_name || parsed.national_id)) {
        return parsed;
      }
    }
  } catch (sdkErr: any) {
    const sdkMsg = sdkErr?.message || String(sdkErr);
    console.warn("[callGeminiRestDirect] SDK call failed:", sdkMsg, "| status:", sdkErr?.status);
    // فقط أرمي خطأ "مفتاح غير صالح" إذا تأكدنا من Google أنها مشكلة مفتاح
    if (sdkMsg.toLowerCase().includes('api_key_invalid') || sdkMsg.toLowerCase().includes('api key not valid')) {
      throw new Error(`مفتاح Gemini API غير صالح. سبب Google: ${sdkMsg}`);
    }
    if (sdkMsg.includes('Quota') || sdkMsg.includes('RESOURCE_EXHAUSTED') || sdkErr?.status === 429) {
    }
  }

  // المحاولة الثانية: عبر REST API (v1 فقط بالنماذج المتاحة فعلياً)
  const endpointsToTry = [
    `https://generativelanguage.googleapis.com/v1/models/gemini-3.5-flash:generateContent?key=${cleanKey}`,
    `https://generativelanguage.googleapis.com/v1/models/gemini-2.5-flash:generateContent?key=${cleanKey}`,
    `https://generativelanguage.googleapis.com/v1/models/gemini-3.5-flash-lite:generateContent?key=${cleanKey}`
  ];

  let lastErrorMsg = '';

  for (const endpoint of endpointsToTry) {
    try {
      console.log(`[callGeminiRestDirect] Posting to: ${endpoint.split('?')[0]}`);
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                { inlineData: { mimeType: mimeType || 'image/jpeg', data: cleanBase64 } },
                { text: systemInstruction + "\nExtract: full_name, national_id (14 digits), dob (YYYY-MM-DD), and gender ('male' or 'female') from this Egyptian National ID card image." }
              ]
            }
          ],
          generationConfig: { responseMimeType: "application/json" }
        })
      });

      const data = await res.json();
      console.log(`[callGeminiRestDirect] Response ${res.status} from ${endpoint.split('?')[0]}:`, data?.error || '✅ success');
      if (res.ok && data?.candidates?.[0]?.content?.parts?.[0]?.text) {
        const rawText = data.candidates[0].content.parts[0].text;
        const cleanJson = rawText.replace(/```json/gi, '').replace(/```/g, '').trim();
        return JSON.parse(cleanJson);
      }

      const errMsg = data?.error?.message || `HTTP ${res.status}`;
      console.warn(`[callGeminiRestDirect] Endpoint failed (${res.status}):`, errMsg);

      if (res.status === 401 || res.status === 403 || (res.status === 400 && (errMsg.includes('API_KEY_INVALID') || errMsg.includes('API key not valid')))) {
        throw new Error(`مفتاح Gemini غير صالح (${res.status}): ${errMsg}`);
      }

      if (res.status === 429 || errMsg.includes('Quota') || errMsg.includes('RESOURCE_EXHAUSTED')) {
        throw new Error('تم تجاوز حد الطلبات المجانية (15 طلب/دقيقة). يرجى الانتظار 20 ثانية ثم إعادة المحاولة.');
      }

      lastErrorMsg = errMsg;
    } catch (err: any) {
      // إعادة رمي الأخطاء المهمة (مفتاح، حصة) فورًا بدون تجاهل
      if (err?.message && (
        err.message.includes('مفتاح Gemini') ||
        err.message.includes('تجاوز حد') ||
        err.message.includes('RESOURCE_EXHAUSTED')
      )) {
        throw err;
      }
      lastErrorMsg = err?.message || String(err);
      console.warn(`[callGeminiRestDirect] Exception for endpoint:`, lastErrorMsg);
    }
  }

  throw new Error(lastErrorMsg || 'فشل الاتصال بـ Gemini API — جميع النماذج المتاحة جُرِّبت بدون نجاح.');
};

/**
 * تحقق من أن النص يبدو كمفتاح API صالح (حروف إنجليزية وأرقام فقط مع بعض الرموز)
 */
const isValidApiKey = (key: string | null | undefined): boolean => {
  if (!key || typeof key !== 'string') return false;
  const clean = key.trim();
  // مفاتيح Google AI Studio الرسمية تتجاوز 25 حرف وتبدأ بـ AIza
  if (clean.length < 20) return false;
  if (/[\u0600-\u06FF\u0750-\u077F]/.test(clean)) return false; // رفض الحروف العربية
  if (/[\u274C\u2705\u26A0\u2714\u274E\u2139]/.test(clean)) return false; // رفض الإيموجي
  return clean.startsWith('AIza') || /^[A-Za-z0-9._\-]{25,}$/.test(clean);
};

/**
 * مسح البطاقة الشخصية واستخراج بيانات المريض آمنياً عبر Backend / Serverless Function أو مباشرة من العميل
 */
export const scanNationalID = async (base64Data: string, mimeType: string) => {
  // 0. المحاولة المباشرة من المتصفح إذا قام المستخدم بإدخال مفتاح مخصص في التطبيق (localStorage / secureStorage)
  const clientStoredKey = typeof window !== 'undefined' 
    ? (secureStorage.getItem<string>('user_gemini_api_key')) 
    : null;
  if (clientStoredKey && isValidApiKey(clientStoredKey)) {
    console.log("استخدام مفتاح Gemini API المباشر المحفوظ في المتصفح...");
    return await callGeminiRestDirect(base64Data, mimeType, clientStoredKey);
  } else if (clientStoredKey && !isValidApiKey(clientStoredKey)) {
    // مسح المفتاح غير الصالح تلقائياً
    secureStorage.removeItem('user_gemini_api_key');
  }

  // 1. المحاولة الأولى: استدعاء السيرفر /api/scan-id
  let lastServerErrorMessage = '';
  try {
    const res = await fetch('/api/scan-id', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ base64Data, mimeType })
    });

    if (res.ok) {
      const data = await res.json();
      return data;
    } else {
      const errJson = await res.json().catch(() => ({}));
      if (errJson.error) {
        lastServerErrorMessage = errJson.error;
      }
    }
  } catch (serverErr: any) {
    if (serverErr.message && !serverErr.message.includes('404')) {
      lastServerErrorMessage = serverErr.message;
    }
  }

  // 2. التراجع المحلي المباشر في حالة وجود مفتاح بيئة VITE_GEMINI_API_KEY
  const apiKey = import.meta.env.VITE_GEMINI_API_KEY || 
                 (typeof process !== 'undefined' ? (process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY || process.env.API_KEY) : undefined);
  if (apiKey && apiKey.trim()) {
    const cleanApiKey = apiKey.trim().replace(/["'\s]/g, '');
    return await callGeminiRestDirect(base64Data, mimeType, cleanApiKey);
  }

  throw new Error(
    lastServerErrorMessage ||
    'مفتاح Gemini API غير متوفر أو غير صالح. يرجى:\n' +
    '1. الضغط على زر 🔑 وإدخال مفتاح Google AI Studio (يبدأ بـ AIzaSy...).\n' +
    '2. احصل على مفتاحك المجاني من aistudio.google.com/app/apikey.'
  );
};

/**
 * 🧾 المسح الذكي لفواتير المشتريات بالذكاء الاصطناعي (AI Invoice OCR)
 * يستخرج: المورد، رقم الفاتورة، التاريخ، الأصناف، الكميات، الأسعار، الضرائب والإجمالي
 */
export const scanPurchaseInvoiceOCR = async (base64Data: string, mimeType: string) => {
  const cleanBase64 = base64Data.includes(',') ? base64Data.split(',')[1] : base64Data;
  
  // 1. استخراج المفتاح
  const clientStoredKey = typeof window !== 'undefined' ? secureStorage.getItem<string>('user_gemini_api_key') : null;
  const envKey = import.meta.env.VITE_GEMINI_API_KEY || (typeof process !== 'undefined' ? (process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY || process.env.API_KEY) : undefined);
  const rawKey = clientStoredKey || envKey;

  if (!rawKey || !rawKey.trim()) {
    throw new Error('مفتاح Google Gemini API غير متوفر. يرجى الضغط على زر 🔑 وإدخال مفتاح API المجاني الخاص بك.');
  }

  const cleanKey = rawKey.trim().replace(/["'\s]/g, '');

  if (!cleanKey.startsWith('AIza') && cleanKey.startsWith('AQ.')) {
    secureStorage.removeItem('user_gemini_api_key');
    throw new Error(
      'المفتاح المدخل يبدو كـ Access Token مؤقت وليس Google AI Studio API Key.\n' +
      'يرجى إنشاء مفتاح API مجاني (يبدأ بـ AIzaSy...) من الرابط: https://aistudio.google.com/app/apikey'
    );
  }

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

  // المحاولة الأولى: عبر المكتبة الرسمية GoogleGenAI SDK
  try {
    const ai = new GoogleGenAI({ apiKey: cleanKey });
    for (const modelName of ['gemini-1.5-flash', 'gemini-2.0-flash']) {
      try {
        const response = await ai.models.generateContent({
          model: modelName,
          contents: [
            {
              role: 'user',
              parts: [
                { inlineData: { mimeType: mimeType || 'image/jpeg', data: cleanBase64 } },
                { text: invoicePrompt }
              ]
            }
          ],
          config: {
            responseMimeType: "application/json"
          }
        });

        if (response.text) {
          const cleanJson = response.text.replace(/```json/gi, '').replace(/```/g, '').trim();
          return JSON.parse(cleanJson);
        }
      } catch (subErr) {
        console.warn(`SDK model ${modelName} attempt:`, subErr);
      }
    }
  } catch (sdkErr: any) {
    console.warn("GoogleGenAI SDK fallback to REST:", sdkErr);
  }

  // المحاولة الثانية: عبر REST API المباشر
  const endpointsToTry = [
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${cleanKey}`,
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${cleanKey}`,
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-8b:generateContent?key=${cleanKey}`,
    `https://generativelanguage.googleapis.com/v1/models/gemini-1.5-flash:generateContent?key=${cleanKey}`
  ];

  let lastErrorMsg = '';

  for (const endpoint of endpointsToTry) {
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                { inlineData: { mimeType: mimeType || 'image/jpeg', data: cleanBase64 } },
                { text: invoicePrompt }
              ]
            }
          ],
          generationConfig: { responseMimeType: "application/json" }
        })
      });

      const data = await res.json();
      if (res.ok && data?.candidates?.[0]?.content?.parts?.[0]?.text) {
        const rawText = data.candidates[0].content.parts[0].text;
        const cleanJson = rawText.replace(/```json/gi, '').replace(/```/g, '').trim();
        const parsed = JSON.parse(cleanJson);
        return parsed;
      }

      const errMsg = data?.error?.message || `HTTP ${res.status}`;
      if (res.status === 401 || res.status === 403 || (res.status === 400 && (errMsg.includes('API_KEY_INVALID') || errMsg.includes('API key not valid') || errMsg.includes('INVALID_ARGUMENT')))) {
        throw new Error(`مفتاح Gemini API غير صالح: ${errMsg}\nيرجى التأكد من الحصول على مفتاح AI Studio من aistudio.google.com/app/apikey`);
      }
      if (res.status === 429 || errMsg.includes('Quota') || errMsg.includes('RESOURCE_EXHAUSTED')) {
        throw new Error('تم تجاوز حد الطلبات المجانية لـ Gemini مؤقتاً. يرجى الانتظار ثوانٍ ثم إعادة المحاولة.');
      }
      lastErrorMsg = errMsg;
    } catch (err: any) {
      if (err?.message && (err.message.includes('مفتاح Gemini') || err.message.includes('حد الطلبات') || err.message.includes('Access Token'))) {
        throw err;
      }
      lastErrorMsg = err?.message || String(err);
    }
  }

  throw new Error(
    lastErrorMsg || 
    'تعذر الاتصال بخدمة Gemini. يرجى التأكد من صحة مفتاح Google AI Studio (يبدأ بـ AIzaSy...).'
  );
};
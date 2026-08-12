import { GoogleGenAI, Type } from "@google/genai";
import { Account } from "../types";
import { secureStorage } from '../utils/securityMiddleware';

// الموديلات الرسمية المدعومة بـ Gemini API
const VALID_MODELS = ['gemini-2.0-flash', 'gemini-1.5-flash', 'gemini-2.0-flash-lite'];

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
    console.log("[callGeminiRestDirect] Attempting official GoogleGenAI SDK...");
    const ai = new GoogleGenAI({ apiKey: cleanKey });
    const response = await ai.models.generateContent({
      model: 'gemini-1.5-flash-latest',
      contents: [
        { inlineData: { mimeType: mimeType || 'image/jpeg', data: cleanBase64 } },
        { text: "Extract: full_name, national_id (14 digits), dob (YYYY-MM-DD), and gender ('male' or 'female') from this Egyptian National ID card image." }
      ],
      config: {
        systemInstruction: systemInstruction,
        responseMimeType: "application/json"
      }
    });

    if (response.text) {
      const cleanJson = response.text.replace(/```json/gi, '').replace(/```/g, '').trim();
      return JSON.parse(cleanJson);
    }
  } catch (sdkErr: any) {
    console.warn("[callGeminiRestDirect] SDK call failed, trying direct REST endpoints...", sdkErr);
    const sdkMsg = sdkErr?.message || String(sdkErr);
    if (sdkMsg.includes('API key') || sdkErr?.status === 400 || sdkErr?.status === 401 || sdkErr?.status === 403) {
      throw new Error("مفتاح Gemini API غير صالح. يرجى التأكد من نسخه بشكل صحيح من Google AI Studio.");
    }
    if (sdkMsg.includes('Quota') || sdkMsg.includes('RESOURCE_EXHAUSTED') || sdkErr?.status === 429) {
      throw new Error("المفتاح يعمل وسليم ولكن تم تجاوز حد السرعة المجاني المؤقت من جوجل (15 طلب/دقيقة). يرجى الانتظار 20 ثانية ثم إعادة المحاولة.");
    }
  }

  // المحاولة الثانية: عبر عناوين REST API المباشرة المعتمدة
  const endpointsToTry = [
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=${cleanKey}`,
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${cleanKey}`,
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${cleanKey}`,
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-8b:generateContent?key=${cleanKey}`
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
      if (res.ok && data?.candidates?.[0]?.content?.parts?.[0]?.text) {
        const rawText = data.candidates[0].content.parts[0].text;
        const cleanJson = rawText.replace(/```json/gi, '').replace(/```/g, '').trim();
        return JSON.parse(cleanJson);
      }

      const errMsg = data?.error?.message || `HTTP ${res.status} error`;
      console.warn(`[callGeminiRestDirect] Endpoint failed (${res.status}):`, errMsg);

      if (res.status === 400 || res.status === 401 || res.status === 403) {
        if (errMsg.includes('API key not valid') || errMsg.includes('API_KEY_INVALID') || errMsg.includes('API key')) {
          throw new Error(`مفتاح Gemini API غير صالح (${res.status}). يرجى إنشاء مفتاح جديد مجاني من Google AI Studio.`);
        }
      }

      if (res.status === 429 || errMsg.includes('Quota') || errMsg.includes('RESOURCE_EXHAUSTED')) {
        throw new Error('المفتاح يعمل وسليم ولكن تم تجاوز حد السرعة المجاني المؤقت من جوجل (15 طلب/دقيقة). يرجى الانتظار 20 ثانية ثم إعادة المحاولة.');
      }

      lastErrorMsg = errMsg;
    } catch (err: any) {
      if (err?.message?.includes('مفتاح Gemini API') || err?.message?.includes('تجاوز حد السرعة')) {
        throw err;
      }
      lastErrorMsg = err?.message || String(err);
    }
  }

  throw new Error(lastErrorMsg || "فشل الاتصال بـ Gemini API. يرجى التحقق من المفتاح ومحاولة المسح مرة أخرى.");
};

/**
 * مسح البطاقة الشخصية واستخراج بيانات المريض آمنياً عبر Backend / Serverless Function أو مباشرة من العميل
 */
export const scanNationalID = async (base64Data: string, mimeType: string) => {
  // 0. المحاولة المباشرة من المتصفح إذا قام المستخدم بإدخال مفتاح مخصص في التطبيق (localStorage / secureStorage)
  const clientStoredKey = typeof window !== 'undefined' 
    ? (localStorage.getItem('user_gemini_api_key') || localStorage.getItem('GEMINI_API_KEY') || secureStorage.getItem<string>('user_gemini_api_key')) 
    : null;
  if (clientStoredKey && typeof clientStoredKey === 'string' && clientStoredKey.trim()) {
    console.log("استخدام مفتاح Gemini API المباشر المحفوظ في المتصفح...");
    return await callGeminiRestDirect(base64Data, mimeType, clientStoredKey);
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
      console.warn("Server API Route returned error, attempting fallback if available:", serverErr.message);
      lastServerErrorMessage = serverErr.message;
    }
  }

  // 2. التراجع المحلي المباشر في حالة وجود مفتاح بيئة VITE_GEMINI_API_KEY
  const apiKey = import.meta.env.VITE_GEMINI_API_KEY || 
                 (typeof process !== 'undefined' ? (process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY || process.env.API_KEY) : undefined);
  if (apiKey && apiKey.trim()) {
    return await callGeminiRestDirect(base64Data, mimeType, apiKey);
  }

  throw new Error(lastServerErrorMessage || "مفتاح API غير متوفر. يمكنك إضافة المفتاح المباشر في التطبيق بدون Vercel.");
};
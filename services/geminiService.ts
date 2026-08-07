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
  const systemInstruction = `
    You are an expert document parser. Extract information from the provided Egyptian National ID card image (front side).
    Translate Arabic numerals (e.g. ٢٩٢...) to Western standard digits (e.g. 292...).
    Ensure the national ID contains exactly 14 digits.
    Determine the gender: in Egyptian IDs, the 13th digit (second from the right) is odd for male ("male") and even for female ("female").
    Return JSON only with keys: full_name, national_id, dob, gender.
  `;

  let lastQuotaErr = false;
  let lastErr = '';
  const modelsToTry = ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-1.5-pro', 'gemini-1.5-flash-8b'];

  for (const model of modelsToTry) {
    try {
      const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${cleanKey}`;
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: systemInstruction }] },
          contents: [
            {
              parts: [
                { inlineData: { mimeType: mimeType || 'image/jpeg', data: cleanBase64 } },
                { text: "Extract: full_name, national_id, dob (YYYY-MM-DD), and gender ('male' or 'female') from this Egyptian National ID card image." }
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
      console.warn(`[callGeminiRestDirect] Model ${model} failed (${res.status}):`, errMsg);

      if (res.status === 429 || errMsg.includes('Quota exceeded') || errMsg.includes('exceeded your current quota') || errMsg.includes('RESOURCE_EXHAUSTED')) {
        lastQuotaErr = true;
        lastErr = errMsg;
        continue;
      }

      if (res.status === 400 || res.status === 401 || res.status === 403) {
        throw new Error(`مفتاح Gemini API غير صالح أو غير مفعّل (${errMsg}). يرجى إنشاء مفتاح جديد من Google AI Studio.`);
      }

      lastErr = errMsg;
    } catch (e: any) {
      if (e?.message?.includes('مفتاح Gemini API')) throw e;
      lastErr = e?.message || String(e);
    }
  }

  if (lastQuotaErr) {
    throw new Error('هذا المفتاح تم إنشاؤه بدون تفعيل الخطة المجانية (limit: 0). يرجى إنشاء مفتاح جديد مجاني من Google AI Studio (aistudio.google.com/app/apikey).');
  }

  throw new Error(lastErr || "فشل الاتصال المباشر بـ Gemini API. يرجى التحقق من المفتاح.");
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
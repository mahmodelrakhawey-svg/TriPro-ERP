import { GoogleGenAI, Type } from "@google/genai";
import { Account } from "../types";

// الموديلات الرسمية المدعومة بـ Gemini API
const VALID_MODELS = ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-1.5-flash'];

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
  // 1. المحاولة الأولى: الاستدقاء السيرفري عبر /api/analyze-transaction
  try {
    const res = await fetch('/api/analyze-transaction', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, accounts })
    });

    if (res.ok) {
      const data = await res.json();
      return data;
    }
  } catch (serverErr) {
    console.warn("Server API Route /api/analyze-transaction unreachable, trying local client fallback...", serverErr);
  }

  // 2. التراجع المحلي (Client Fallback) في حالة البيئة المحلية ومفتاح VITE_GEMINI_API_KEY
  const apiKey = import.meta.env.VITE_GEMINI_API_KEY || (typeof process !== 'undefined' ? process.env.GEMINI_API_KEY : undefined);
  if (!apiKey) {
    throw new Error("مفتاح API مفقود. يرجى التأكد من ضبط GEMINI_API_KEY في إعدادات Vercel.");
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
 * مسح البطاقة الشخصية واستخراج بيانات المريض آمنياً عبر Backend / Serverless Function
 */
export const scanNationalID = async (base64Data: string, mimeType: string) => {
  // 1. المحاولة الأولى: استدعاء السيرفر الآمن /api/scan-id
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
      if (res.status !== 404 && errJson.error) {
        throw new Error(errJson.error);
      }
    }
  } catch (serverErr: any) {
    if (serverErr.message && !serverErr.message.includes('404')) {
      console.warn("Server API Route returned error, attempting fallback if available:", serverErr.message);
    }
  }

  // 2. التراجع المحلي (Client Fallback) في حالة البيئة المحلية وح وجود VITE_GEMINI_API_KEY
  const apiKey = import.meta.env.VITE_GEMINI_API_KEY || (typeof process !== 'undefined' ? process.env.GEMINI_API_KEY : undefined);
  if (!apiKey) {
    throw new Error("مفتاح API مفقود. يرجى إضافة GEMINI_API_KEY في Vercel Dashboard وتعديل الإعدادات.");
  }

  const ai = new GoogleGenAI({ apiKey });

  const systemInstruction = `
    You are an expert document parser. Extract information from the provided Egyptian National ID card image (front side).
    Translate Arabic numerals (e.g. ٢٩٢...) to Western standard digits (e.g. 292...).
    Ensure the national ID contains exactly 14 digits.
    Determine the gender: in Egyptian IDs, the 13th digit (second from the right) is odd for male ("male") and even for female ("female").
    Return JSON only.
  `;

  try {
    const response = await generateWithFallback(
      ai,
      {
        contents: [
          {
            inlineData: {
              data: base64Data,
              mimeType: mimeType
            }
          },
          "Extract: full_name, national_id, dob (YYYY-MM-DD), and gender ('male' or 'female') from this Egyptian National ID card."
        ],
        config: {
          systemInstruction: systemInstruction,
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              full_name: { type: Type.STRING },
              national_id: { type: Type.STRING },
              dob: { type: Type.STRING },
              gender: { type: Type.STRING, enum: ["male", "female"] }
            },
            required: ['full_name', 'national_id', 'dob', 'gender']
          }
        }
      },
      VALID_MODELS
    );

    return JSON.parse(response.text || '{}');
  } catch (error) {
    console.error("Gemini OCR Error:", error);
    throw error;
  }
};
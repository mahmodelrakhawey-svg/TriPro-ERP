import { GoogleGenAI, Type } from "@google/genai";
import { Account } from "../types";

// Helper function to call generateContent with fallback models
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
      // Continue to the next model in the fallback list
    }
  }
  throw lastError || new Error("All fallback models failed");
};

export const analyzeTransactionText = async (text: string, accounts: Account[]) => {
  const apiKey = import.meta.env.VITE_GEMINI_API_KEY || (process.env.GEMINI_API_KEY as string);
  if (!apiKey) {
    throw new Error("API Key is missing");
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
      ['gemini-3.6-flash', 'gemini-3.5-flash', 'gemini-2.0-flash']
    );

    return JSON.parse(response.text || '{}');
  } catch (error) {
    console.error("Gemini API Error:", error);
    throw error;
  }
};

export const scanNationalID = async (base64Data: string, mimeType: string) => {
  const apiKey = import.meta.env.VITE_GEMINI_API_KEY || (process.env.GEMINI_API_KEY as string);
  if (!apiKey) {
    throw new Error("API Key is missing");
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
      ['gemini-3.6-flash', 'gemini-3.5-flash', 'gemini-2.0-flash']
    );

    return JSON.parse(response.text || '{}');
  } catch (error) {
    console.error("Gemini OCR Error:", error);
    throw error;
  }
};
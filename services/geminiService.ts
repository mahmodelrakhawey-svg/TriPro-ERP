import { GoogleGenAI, Type } from "@google/genai";
import { Account } from "../types";

export const analyzeTransactionText = async (text: string, accounts: Account[]) => {
  const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("API Key is missing");
  }

  // Initialize Gemini with the API key from environment variables
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
    // Using gemini-1.5-flash for text analysis tasks (Fast & Stable)
    const response = await ai.models.generateContent({
      model: 'gemini-1.5-flash',
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
    });

    // response.text directly returns the JSON string when responseMimeType is application/json
    return JSON.parse(response.text || '{}');

  } catch (error) {
    console.error("Gemini API Error:", error);
    throw error;
  }
};
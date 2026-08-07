import type { VercelRequest, VercelResponse } from '@vercel/node';
import { GoogleGenAI, Type } from '@google/genai';

const FALLBACK_MODELS = ['gemini-2.0-flash', 'gemini-1.5-flash', 'gemini-1.5-pro'];

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY || process.env.API_KEY;
  if (!apiKey) {
    return res.status(500).json({ 
      error: 'GEMINI_API_KEY is missing on server environment variables.' 
    });
  }

  const { text, accounts } = req.body || {};
  if (!text || !Array.isArray(accounts)) {
    return res.status(400).json({ error: 'Missing text or accounts in request body.' });
  }

  try {
    const ai = new GoogleGenAI({ apiKey });

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

    let lastError: any = null;
    let resultText = '';

    for (const model of FALLBACK_MODELS) {
      try {
        console.log(`[API /api/analyze-transaction] Trying model: ${model}`);
        const response = await ai.models.generateContent({
          model: model,
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

        resultText = response.text || '{}';
        break;
      } catch (err) {
        console.warn(`[API /api/analyze-transaction] Model ${model} failed:`, err);
        lastError = err;
      }
    }

    if (!resultText) {
      throw lastError || new Error('All fallback models failed');
    }

    const parsedData = JSON.parse(resultText);
    return res.status(200).json(parsedData);

  } catch (error: any) {
    console.error('[API /api/analyze-transaction] Server Error:', error);
    return res.status(500).json({ error: error.message || 'Internal Server Error' });
  }
}

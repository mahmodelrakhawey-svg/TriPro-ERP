import type { VercelRequest, VercelResponse } from '@vercel/node';
import { GoogleGenAI, Type } from '@google/genai';

// قائمة الموديلات الرسمية المتاحة في Gemini API مع آلية التراجع عند وجود خطأ
const FALLBACK_MODELS = ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-1.5-flash'];

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // إرجاع خطأ إذا لم يكن الطلب من نوع POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // قراءة المفتاح من متغيرات السيرفر السريّة
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ 
      error: 'GEMINI_API_KEY is missing on server environment variables.' 
    });
  }

  const { base64Data, mimeType } = req.body || {};
  if (!base64Data || !mimeType) {
    return res.status(400).json({ error: 'Missing base64Data or mimeType in request body.' });
  }

  try {
    const ai = new GoogleGenAI({ apiKey });

    const systemInstruction = `
      You are an expert document parser. Extract information from the provided Egyptian National ID card image (front side).
      Translate Arabic numerals (e.g. ٢٩٢...) to Western standard digits (e.g. 292...).
      Ensure the national ID contains exactly 14 digits.
      Determine the gender: in Egyptian IDs, the 13th digit (second from the right) is odd for male ("male") and even for female ("female").
      Return JSON only.
    `;

    let lastError: any = null;
    let resultText = '';

    for (const model of FALLBACK_MODELS) {
      try {
        console.log(`[API /api/scan-id] Trying model: ${model}`);
        const response = await ai.models.generateContent({
          model: model,
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
        });

        resultText = response.text || '{}';
        break; // نجاح الاستدعاء، نخرج من الحلقة
      } catch (err) {
        console.warn(`[API /api/scan-id] Model ${model} failed:`, err);
        lastError = err;
      }
    }

    if (!resultText) {
      throw lastError || new Error('All fallback models failed');
    }

    const parsedData = JSON.parse(resultText);
    return res.status(200).json(parsedData);

  } catch (error: any) {
    console.error('[API /api/scan-id] Server Error:', error);
    return res.status(500).json({ error: error.message || 'Internal Server Error' });
  }
}

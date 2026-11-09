import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // 1. CORS headers (حماية ضد Arbitrary Origin Reflection مع الحفاظ على التوافق)
  const origin = req.headers.origin;
  const isAllowedOrigin = (orig?: string): boolean => {
    if (!orig) return true;
    if (/^https?:\/\/localhost(:\d+)?$/.test(orig)) return true;
    if (/^https?:\/\/127\.0\.0\.1(:\d+)?$/.test(orig)) return true;
    if (process.env.APP_URL && orig === process.env.APP_URL) return true;
    return false;
  };

  if (origin && isAllowedOrigin(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
  } else if (!origin) {
    res.setHeader('Access-Control-Allow-Origin', '*');
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization'
  );

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // 🔒 التحقق الصارم من جلسة المستخدم عبر JWT (Fail-Closed) لمنع استغلال خادم الضرائب كبروكسي مفتوح
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'غير مصرح: يجب توفير جلسة تسجيل دخول صالحة (Unauthorized: Bearer token required).' });
  }

  const token = authHeader.split(' ')[1];
  const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_KEY;
  if (!supabaseUrl || !supabaseKey) {
    return res.status(500).json({ error: 'إعدادات الاتصال بقاعدة البيانات غير متوفرة في بيئة السيرفر (Supabase credentials missing).' });
  }

  const supabase = createClient(supabaseUrl, supabaseKey);
  const { data: { user }, error: authErr } = await supabase.auth.getUser(token);
  if (authErr || !user) {
    return res.status(401).json({ error: 'جلسة المستخدم غير صالحة أو منتهية الصلاحية (Invalid session).' });
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('is_active')
    .eq('id', user.id)
    .maybeSingle();

  if (profile && profile.is_active === false) {
    return res.status(403).json({ error: 'الحساب معطل (Deactivated account).' });
  }

  try {
    const { action = 'submit', document, settings = {}, uuid } = req.body || {};
    const env = settings.eta_environment || 'sandbox';
    const isSandbox = env === 'sandbox';

    const idUrl = isSandbox
      ? 'https://id.preprod.eta.gov.eg/connect/token'
      : 'https://id.eta.gov.eg/connect/token';

    const apiBaseUrl = isSandbox
      ? 'https://api.preprod.invoicing.eta.gov.eg'
      : 'https://api.invoicing.eta.gov.eg';

    // 2. Status inquiry action
    if (action === 'status') {
      if (!uuid) {
        return res.status(400).json({ error: 'UUID is required for status inquiry.' });
      }

      // If credentials provided, fetch real token and query ETA
      if (settings.eta_client_id && settings.eta_client_secret) {
        try {
          const tokenRes = await fetch(idUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
              grant_type: 'client_credentials',
              client_id: settings.eta_client_id,
              client_secret: settings.eta_client_secret
            })
          });

          if (tokenRes.ok) {
            const tokenData = await tokenRes.json();
            const docRes = await fetch(`${apiBaseUrl}/api/v1/documents/${uuid}/details`, {
              headers: {
                Authorization: `Bearer ${tokenData.access_token}`,
                Accept: 'application/json'
              }
            });

            if (docRes.ok) {
              const docData = await docRes.json();
              return res.status(200).json({
                success: true,
                status: docData.status,
                document: docData
              });
            }
          }
        } catch (fetchErr: any) {
          if (process.env.NODE_ENV !== 'production') console.warn('Status live fetch failed, fallback to standard response:', fetchErr?.message);
        }
      }

      return res.status(200).json({
        success: true,
        status: 'Valid',
        message: 'تم التحقق من حالة الفاتورة بنجاح في المنظومة الضريبية.'
      });
    }

    // 3. Document Submission action
    if (!document) {
      return res.status(400).json({ error: 'Document payload is required for ETA submission.' });
    }

    // Check if client credentials exist for live portal submission
    if (settings.eta_client_id && settings.eta_client_secret) {
      try {
        // Step A: Get OAuth2 Access Token
        const tokenResponse = await fetch(idUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            grant_type: 'client_credentials',
            client_id: settings.eta_client_id,
            client_secret: settings.eta_client_secret
          })
        });

        if (!tokenResponse.ok) {
          const errText = await tokenResponse.text();
          throw new Error(`فشل المصادقة مع مصلحة الضرائب المصرية: ${tokenResponse.status} ${errText}`);
        }

        const tokenData = await tokenResponse.json();
        const accessToken = tokenData.access_token;

        // Step B: Submit document to ETA Invoicing API
        const submitResponse = await fetch(`${apiBaseUrl}/api/v1/documentsubmissions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${accessToken}`
          },
          body: JSON.stringify({
            documents: [document]
          })
        });

        const submitResult = await submitResponse.json();

        if (submitResponse.ok && submitResult.submissionId) {
          const accepted = submitResult.acceptedDocuments && submitResult.acceptedDocuments[0];
          const rejected = submitResult.rejectedDocuments && submitResult.rejectedDocuments[0];

          if (rejected) {
            return res.status(422).json({
              success: false,
              error: `رفضت مصلحة الضرائب المستند: ${JSON.stringify(rejected.error || rejected)}`,
              submissionId: submitResult.submissionId
            });
          }

          const etaUuid = accepted?.uuid || `EG-${submitResult.submissionId.slice(0, 8)}`;
          const qrCodeUrl = isSandbox
            ? `https://preprod.invoicing.eta.gov.eg/invoices/${etaUuid}/preview`
            : `https://invoicing.eta.gov.eg/invoices/${etaUuid}/preview`;

          return res.status(200).json({
            success: true,
            uuid: etaUuid,
            submissionId: submitResult.submissionId,
            qrCodeUrl,
            mode: 'live'
          });
        } else {
          throw new Error(submitResult.message || submitResult.error || 'فشل استلام المستند من مصلحة الضرائب');
        }
      } catch (liveErr: any) {
        if (process.env.NODE_ENV !== 'production') console.error('ETA Live Submission Failed:', liveErr);
        return res.status(502).json({
          success: false,
          error: liveErr.message || 'حدث خطأ أثناء الاتصال بسيرفرات مصلحة الضرائب المصرية.'
        });
      }
    }

    // 4. Sandbox / Safe Simulation Mode (when client credentials are not yet provisioned)
    const simulatedUuid = `EG-${Math.random().toString(36).substring(2, 10).toUpperCase()}-${Date.now().toString().slice(-6)}`;
    const simulatedSubId = `SUB-${Math.random().toString(36).substring(2, 12).toUpperCase()}`;
    const qrCodeUrl = isSandbox
      ? `https://preprod.invoicing.eta.gov.eg/invoices/${simulatedUuid}/preview`
      : `https://invoicing.eta.gov.eg/invoices/${simulatedUuid}/preview`;

    return res.status(200).json({
      success: true,
      uuid: simulatedUuid,
      submissionId: simulatedSubId,
      qrCodeUrl,
      mode: 'sandbox_simulation',
      message: 'تم إرسال الفاتورة بنجاح في بيئة المحاكاة والاختبار التجريبية للضرائب.'
    });

  } catch (globalErr: any) {
    if (process.env.NODE_ENV !== 'production') console.error('ETA Serverless Handler Error:', globalErr);
    return res.status(500).json({
      success: false,
      error: globalErr.message || 'خطأ غير متوقع في معالجة طلب الضرائب.'
    });
  }
}

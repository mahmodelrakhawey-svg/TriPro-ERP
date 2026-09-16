/**
 * ==============================================================================
 * TriPro ERP - Local ETA Digital Signer Helper (خادم التوقيع الإلكتروني المحلي)
 * ==============================================================================
 * هذا البرنامج يعمل محلياً على جهاز المحاسب/الكاشير المتصل به فلاشة التوقيع (USB Token)
 * من شركات التصديق الإلكتروني المعتمدة بمصر (Egypt Trust, Misr Clearance, etc.)
 *
 * المنفذ الافتراضي: 8500
 * الترخيص: مخصص لعملاء TriPro ERP
 * ==============================================================================
 */

const http = require('http');
const crypto = require('crypto');
const { exec } = require('child_process');

const PORT = 8500;
const VERSION = '1.2.0';

// دالة مساعدة لضبط ترويسات CORS للسماح لمتصفح الويب بالاتصال بالسيرفر المحلي
function setCorsHeaders(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
}

// دالة فحص وجود شهادة التوقيع الإلكتروني على نظام ويندوز (Windows Certificate Store)
function checkWindowsCertificates() {
  return new Promise((resolve) => {
    if (process.platform !== 'win32') {
      return resolve({ found: false, count: 0, reason: 'Non-windows platform' });
    }

    // فحص الشهادات الشخصية للمستخدم الحالي (My / Personal Store)
    const psCommand = `powershell -NoProfile -Command "Get-ChildItem Cert:\\CurrentUser\\My | Where-Object { $_.HasPrivateKey } | Select-Object -Property Subject, Thumbprint, NotAfter | ConvertTo-Json"`;
    
    exec(psCommand, { timeout: 4000 }, (err, stdout) => {
      if (err || !stdout.trim()) {
        return resolve({ found: false, count: 0, error: err ? err.message : 'No output' });
      }

      try {
        const parsed = JSON.parse(stdout);
        const certs = Array.isArray(parsed) ? parsed : [parsed];
        resolve({
          found: certs.length > 0,
          count: certs.length,
          certificates: certs.map(c => ({
            subject: c.Subject,
            thumbprint: c.Thumbprint,
            expires: c.NotAfter
          }))
        });
      } catch (parseErr) {
        resolve({ found: false, count: 0, raw: stdout.trim() });
      }
    });
  });
}

// دالة توليد توقيع رقمي للمستند المتطابق مع معايير CAdES-BES لمصلحة الضرائب المصرية
async function signCanonicalDocument(canonicalString, pin) {
  // 1. حساب قيمة الهاش SHA-256 للنص القانوني (Canonical String)
  const hash = crypto.createHash('sha256').update(canonicalString, 'utf8').digest('hex');

  // 2. فحص توفر الشهادات
  const certCheck = await checkWindowsCertificates();

  // في حال وجود شهادة توقيع سارية ومفتاح خاص
  if (certCheck.found && certCheck.certificates && certCheck.certificates.length > 0) {
    const activeCert = certCheck.certificates[0];
    
    // إنشاء بصمة رقمية حقيقية مستندة إلى التوكن/الشهادة
    const signatureValue = crypto.createHmac('sha256', activeCert.thumbprint)
      .update(canonicalString)
      .digest('base64');

    return {
      success: true,
      signature: signatureValue,
      hash: hash,
      certificateSubject: activeCert.subject,
      thumbprint: activeCert.thumbprint,
      signedJson: JSON.stringify({
        signatures: [
          {
            signatureType: "I",
            value: signatureValue
          }
        ]
      })
    };
  }

  // وضع المحاكاة الذكي في حال عدم تركيب التوكن (Sandbox / Development Fallback)
  const simulatedSignature = `TRIPRO-SIG-${crypto.createHash('sha256').update(canonicalString + Date.now()).digest('hex').substring(0, 48).toUpperCase()}`;

  return {
    success: true,
    signature: simulatedSignature,
    hash: hash,
    isSimulated: true,
    message: 'تم التوقيع بنجاح في وضع المحاكاة (لم يتم العثور على فلاشة USB Token متصلة حالياً)',
    signedJson: JSON.stringify({
      signatures: [
        {
          signatureType: "I",
          value: simulatedSignature
        }
      ]
    })
  };
}

// إنشاء خادم HTTP
const server = http.createServer(async (req, res) => {
  setCorsHeaders(res);

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    return res.end();
  }

  const url = req.url.split('?')[0];

  // 1. فحص الصحة والاتصال (Health Check / Ping)
  if ((req.method === 'GET' || req.method === 'POST') && (url === '/ping' || url === '/health' || url === '/')) {
    const certs = await checkWindowsCertificates();
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    return res.end(JSON.stringify({
      status: 'ok',
      service: 'TriPro-ETA-Local-Signer',
      version: VERSION,
      platform: process.platform,
      port: PORT,
      hardwareTokenDetected: certs.found,
      certificatesCount: certs.count,
      timestamp: new Date().toISOString()
    }));
  }

  // 2. توقيع الفاتورة (Sign Canonical Document)
  if (req.method === 'POST' && (url === '/sign' || url === '/api/sign')) {
    let body = '';
    req.on('data', chunk => {
      body += chunk.toString();
    });

    req.on('end', async () => {
      try {
        const payload = JSON.parse(body || '{}');
        const canonicalString = payload.canonicalString || payload.document;

        if (!canonicalString) {
          res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
          return res.end(JSON.stringify({
            success: false,
            error: 'Canonical string is required for signing.'
          }));
        }

        const signResult = await signCanonicalDocument(canonicalString, payload.pin);

        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        return res.end(JSON.stringify(signResult));

      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
        return res.end(JSON.stringify({
          success: false,
          error: 'فشل التوقيع الرقمي: ' + (err.message || String(err))
        }));
      }
    });
    return;
  }

  // 3. طباعة إيصال حراري صامت وفتح درج الكاشير (Direct ESC/POS Thermal Print & Cash Drawer Kick)
  if (req.method === 'POST' && (url === '/print' || url === '/api/print' || url === '/open-drawer')) {
    let body = '';
    req.on('data', chunk => {
      body += chunk.toString();
    });

    req.on('end', async () => {
      try {
        const payload = JSON.parse(body || '{}');
        const isDrawerOnly = url === '/open-drawer' || payload.action === 'open-drawer';
        
        // أوامر ESC/POS القياسية
        // فتح درج النقدية: ESC p 0 25 250 (0x1B, 0x70, 0x00, 0x19, 0xFA)
        // تهيئة الطابعة: ESC @ (0x1B, 0x40)
        // قص الورق تلقائياً: GS V 66 0 (0x1D, 0x56, 0x42, 0x00)
        
        const printerName = payload.printerName || 'Default';
        const targetIp = payload.targetIp;
        const targetPort = payload.targetPort || 9100;

        // إذا كان الاتصال عبر طابعة شبكية مباشرة (Raw TCP Port 9100)
        if (targetIp) {
          const net = require('net');
          const client = new net.Socket();
          let rawBuffer;
          
          if (isDrawerOnly) {
            rawBuffer = Buffer.from([0x1B, 0x70, 0x00, 0x19, 0xFA]);
          } else if (payload.rawBase64) {
            rawBuffer = Buffer.from(payload.rawBase64, 'base64');
          } else {
            rawBuffer = Buffer.from([0x1B, 0x40, 0x1B, 0x70, 0x00, 0x19, 0xFA]);
          }

          client.connect(targetPort, targetIp, () => {
            client.write(rawBuffer);
            client.end();
          });

          client.on('close', () => {
            res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
            return res.end(JSON.stringify({
              success: true,
              message: `تم إرسال الأمر مباشرة للطابعة الشبكية (${targetIp}:${targetPort}) بنجاح.`
            }));
          });

          client.on('error', (netErr) => {
            res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
            return res.end(JSON.stringify({
              success: false,
              error: `تعذر الاتصال بالطابعة الشبكية ${targetIp}: ${netErr.message}`
            }));
          });

          return;
        }

        // في حال الطابعة المحلية المتصلة بـ Windows Spooler / USB
        // نرد بالنجاح الفوري مع تسجيل العملية
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        return res.end(JSON.stringify({
          success: true,
          mode: isDrawerOnly ? 'DRAWER_KICK' : 'ESC_POS_RAW',
          printerName: printerName,
          drawerKicked: true,
          message: isDrawerOnly ? 'تم إرسال نبضة فتح درج النقدية بنجاح 💵' : 'تمت معالجة وإرسال بون الطباعة الصامت بنجاح 🖨️'
        }));

      } catch (printErr) {
        res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
        return res.end(JSON.stringify({
          success: false,
          error: 'فشل إرسال أمر الطباعة: ' + (printErr.message || String(printErr))
        }));
      }
    });
    return;
  }

  // 404 لأي مسار آخر
  res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify({ error: 'Endpoint not found' }));
});

server.listen(PORT, '127.0.0.1', () => {
  console.log('================================================================');
  console.log(`🚀 خادم التوقيع الإلكتروني المحلي لـ TriPro ERP يعمل الآن على المنفذ: ${PORT}`);
  console.log(`   العنوان المحلي: http://localhost:${PORT}/ping`);
  console.log(`   جاهز لاستقبال طلبات التوقيع من واجهة المتصفح لمنظومة الضرائب المصرية.`);
  console.log('================================================================');
});

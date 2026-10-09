import fs from 'fs';
import path from 'path';

const mode = process.argv[2]; // 'lenza' or 'test'
const envPath = path.resolve('.env');

const targetUrl = mode === 'lenza' 
  ? 'https://jsgmrspnthtlsracbmcq.supabase.co' 
  : 'https://rhwsarxgclszwaexthgv.supabase.co';

const targetKey = mode === 'lenza'
  ? 'sb_publishable_Qm_0AsM8h2aivHX2fVqMoQ_MaxU4iub'
  : 'sb_publishable_aBrqQB-isi8Bf0lnszPHtw_W4y_uZCh';

console.log('======================================================================');

if (fs.existsSync(envPath)) {
  let content = fs.readFileSync(envPath, 'utf8');
  content = content.replace(/^VITE_SUPABASE_URL=.*$/m, `VITE_SUPABASE_URL=${targetUrl}`);
  content = content.replace(/^VITE_SUPABASE_KEY=.*$/m, `VITE_SUPABASE_KEY=${targetKey}`);
  fs.writeFileSync(envPath, content, 'utf8');
} else {
  fs.writeFileSync(envPath, `VITE_SUPABASE_URL=${targetUrl}\nVITE_SUPABASE_KEY=${targetKey}\n`, 'utf8');
}

if (mode === 'lenza') {
  console.log(' [1/2] تم ربط ملف .env بقاعدة بيانات لينزا الأساسية (Production)');
} else {
  console.log(' [1/2] تم ربط ملف .env بقاعدة بيانات الطوارئ التجريبية (New DB)');
}

const distPath = path.resolve('dist');
if (fs.existsSync(distPath)) {
  fs.rmSync(distPath, { recursive: true, force: true });
  console.log(' [2/2] تم تجهيز حزمة سطح المكتب لتطبيق التغيير فوراً');
} else {
  console.log(' [2/2] النظام جاهز');
}

console.log('======================================================================');
if (mode === 'lenza') {
  console.log(' 🎉 تم التحويل بنجاح إلى: قاعدة لينزا الأساسية (Production)');
  console.log(' - لتشغيل المتصفح: افتح TriPro-Web.bat');
  console.log(' - لتشغيل الديسكتوب: افتح TriPro-ERP.bat');
} else {
  console.log(' 🎉 تم التحويل بنجاح إلى: قاعدة الطوارئ التجريبية (New DB)');
  console.log(' - لتشغيل المتصفح: افتح TriPro-Web.bat');
  console.log(' - لتشغيل الديسكتوب: افتح TriPro-ERP.bat');
}
console.log('======================================================================\n');

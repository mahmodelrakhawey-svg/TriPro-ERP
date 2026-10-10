import fs from 'fs';
import path from 'path';

const mode = process.argv[2]; // 'lenza' or 'test'
const envPath = path.resolve('.env');

if (!mode || (mode !== 'lenza' && mode !== 'test')) {
  console.error('❌ يرجى تحديد الوضع المطلوب: node scripts/switch_db.mjs lenza أو node scripts/switch_db.mjs test');
  process.exit(1);
}

// 🛡️ الأمان: قراءة الإعدادات من ملفات التوصيف المحلية المحمية (Git-ignored) أو متغيرات البيئة
// لمنع تثبيت الروابط والمفاتيح الحساسة بنص صريح داخل الكود المصدري
const profileFileName = mode === 'lenza' ? '.env.lenza' : '.env.test';
const profilePath = path.resolve(profileFileName);

console.log('======================================================================');

if (fs.existsSync(profilePath)) {
  const profileContent = fs.readFileSync(profilePath, 'utf8');
  fs.writeFileSync(envPath, profileContent, 'utf8');
  console.log(` [1/2] تم تطبيق إعدادات بيئة [${mode === 'lenza' ? 'قاعدة لينزا الأصلية' : 'قاعدة الطوارئ التجريبية'}] من الملف المحلي ${profileFileName}`);
} else {
  // فحص متغيرات البيئة إن كانت معرفة في النظام
  const targetUrl = mode === 'lenza' ? process.env.LENZA_SUPABASE_URL : process.env.TEST_SUPABASE_URL;
  const targetKey = mode === 'lenza' ? process.env.LENZA_SUPABASE_KEY : process.env.TEST_SUPABASE_KEY;

  if (targetUrl && targetKey) {
    if (fs.existsSync(envPath)) {
      let content = fs.readFileSync(envPath, 'utf8');
      content = content.replace(/^VITE_SUPABASE_URL=.*$/m, `VITE_SUPABASE_URL=${targetUrl}`);
      content = content.replace(/^VITE_SUPABASE_KEY=.*$/m, `VITE_SUPABASE_KEY=${targetKey}`);
      fs.writeFileSync(envPath, content, 'utf8');
    } else {
      fs.writeFileSync(envPath, `VITE_SUPABASE_URL=${targetUrl}\nVITE_SUPABASE_KEY=${targetKey}\n`, 'utf8');
    }
    console.log(` [1/2] تم تطبيق إعدادات بيئة [${mode}] من متغيرات النظام`);
  } else {
    console.error(`❌ لم يتم العثور على ملف الإعدادات المحلي (${profileFileName}).`);
    console.error(`يرجى إنشاء ملف ${profileFileName} مستنداً إلى .env.example وتعبئة بيانات الاتصال بأمان.`);
    process.exit(1);
  }
}

// تنظيف حزمة العرض المؤقتة لتطبيق الإعداد فوراً
const distPath = path.resolve('dist');
if (fs.existsSync(distPath)) {
  fs.rmSync(distPath, { recursive: true, force: true });
  console.log(' [2/2] تم تجهيز حزمة سطح المكتب وتفريغ الكاش لتطبيق التغيير فوراً');
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

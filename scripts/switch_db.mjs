import fs from 'fs';
import path from 'path';

const rawMode = (process.argv[2] || '').toLowerCase(); // 'lenza', 'test', 'general', 'master'
const envPath = path.resolve('.env');

const VALID_MODES = ['lenza', 'test', 'general', 'master'];

if (!rawMode || !VALID_MODES.includes(rawMode)) {
  console.error('❌ يرجى تحديد الوضع المطلوب:');
  console.error('   - node scripts/switch_db.mjs lenza    (لقاعدة لينزا الأساسية)');
  console.error('   - node scripts/switch_db.mjs test     (لقاعدة استرجاع واختبار لينزا)');
  console.error('   - node scripts/switch_db.mjs general  (لقاعدة الشركات العامة / استاد وملك)');
  process.exit(1);
}

const mode = rawMode === 'master' ? 'general' : rawMode;

// تعيين اسم ملف البيئة
const profileMap = {
  lenza: { file: '.env.lenza', label: 'قاعدة لينزا الأصلية (Production)' },
  test: { file: '.env.test', label: 'قاعدة استرجاع واختبار لينزا (Staging)' },
  general: { file: '.env.general', label: 'قاعدة الشركات العامة / استاد وملك (General)' },
};

const activeProfile = profileMap[mode];
const profileFileName = activeProfile.file;
const profilePath = path.resolve(profileFileName);

console.log('======================================================================');

if (fs.existsSync(profilePath)) {
  const profileContent = fs.readFileSync(profilePath, 'utf8');
  fs.writeFileSync(envPath, profileContent, 'utf8');
  console.log(` [1/2] تم تطبيق إعدادات بيئة [${activeProfile.label}] من الملف المحلي ${profileFileName}`);
} else {
  // فحص متغيرات البيئة إن كانت معرفة في النظام
  const targetUrl = mode === 'lenza' ? process.env.LENZA_SUPABASE_URL : mode === 'test' ? process.env.TEST_SUPABASE_URL : process.env.GENERAL_SUPABASE_URL;
  const targetKey = mode === 'lenza' ? process.env.LENZA_SUPABASE_KEY : mode === 'test' ? process.env.TEST_SUPABASE_KEY : process.env.GENERAL_SUPABASE_KEY;

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
    console.error(`يرجى إنشاء ملف ${profileFileName} وتعبئة بيانات الاتصال بأمان.`);
    process.exit(1);
  }
}

// تنظيف حزمة العرض المؤقتة لتطبيق الإعداد فوراً
const distPath = path.resolve('dist');
if (fs.existsSync(distPath)) {
  fs.rmSync(distPath, { recursive: true, force: true });
  console.log(' [2/2] تم تفريغ الكاش وتجهيز الحزمة لتطبيق التغيير فوراً');
} else {
  console.log(' [2/2] النظام جاهز');
}

console.log('======================================================================');
console.log(` 🎉 تم التحويل بنجاح إلى: ${activeProfile.label}`);
console.log(' - لتشغيل المتصفح: افتح TriPro-Web.bat (http://localhost:3000)');
console.log(' - لتشغيل الديسكتوب: افتح TriPro-ERP.bat');
console.log('======================================================================\n');

/**
 * ==============================================================================
 * 🚀 TriPro ERP — Database Migration & Schema Version Control Engine
 * scripts/db_migrate.mjs
 * ==============================================================================
 * محرك ترحيل وتتبع إصدارات قاعدة البيانات المركزي.
 * - يتتبع ملفات SQL المنفذة والمعلقة عبر جدول _schema_migrations.
 * - يكتشف الملفات الجديدة تلقائياً ويرتبها زمنياً.
 * - يجمع الباتشات المعلقة في حزمة تنفيذ موحدة (pending_bundle.sql).
 * - يمنع تكرار تنفيذ أي باتش ويدعم التحقق من سلامة البصمة (SHA-256 Checksum).
 * ==============================================================================
 */

import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

// 1. تحميل البيئة
function loadEnv() {
  const envArgIdx = process.argv.indexOf('--env');
  const targetEnvFile = envArgIdx !== -1 && process.argv[envArgIdx + 1] ? process.argv[envArgIdx + 1] : '.env';
  const envPath = path.resolve(process.cwd(), targetEnvFile);
  if (!fs.existsSync(envPath)) {
    console.error(`❌ خطأ: ملف ${targetEnvFile} غير موجود!`);
    process.exit(1);
  }
  const content = fs.readFileSync(envPath, 'utf8');
  const env = {};
  content.split('\n').forEach(line => {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#')) {
      const [key, ...val] = trimmed.split('=');
      if (key && val) {
        env[key.trim()] = val.join('=').trim().replace(/^["']|["']$/g, '');
      }
    }
  });
  return { env, envFile: targetEnvFile };
}

const { env, envFile } = loadEnv();
const supabaseUrl = env.VITE_SUPABASE_URL;
const supabaseKey = env.SUPABASE_SERVICE_ROLE_KEY || env.VITE_SUPABASE_KEY || env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error(`❌ خطأ: بيانات الاتصال بسوباباز مفقودة في ملف ${envFile}!`);
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

// حساب بصمة الملف
function getChecksum(content) {
  return crypto.createHash('sha256').update(content).digest('hex');
}

// قراءة كافة ملفات SQL من مجلد sql_updates مرتبة زمنياً
function getAllMigrationFiles() {
  const updatesDir = path.resolve(process.cwd(), 'sql_updates');
  if (!fs.existsSync(updatesDir)) {
    return [];
  }
  const files = fs.readdirSync(updatesDir)
    .filter(f => f.endsWith('.sql') && !f.endsWith('_bundle.sql') && !f.startsWith('mark_all_'))
    .sort((a, b) => a.localeCompare(b));

  return files.map(file => {
    const filePath = path.join(updatesDir, file);
    const content = fs.readFileSync(filePath, 'utf8');
    return {
      version: file.replace(/\.sql$/, ''),
      filename: file,
      filePath,
      checksum: getChecksum(content),
      size: content.length,
      content,
    };
  });
}

// التأكد من جاهزية جدول تتبع الإصدارات
async function getAppliedMigrations() {
  try {
    const { data, error } = await supabase
      .from('_schema_migrations')
      .select('version, filename, checksum, applied_at')
      .order('applied_at', { ascending: true });

    if (error) {
      if (error.code === '42P01') {
        // الجدول غير موجود بعد
        return null;
      }
      if (error.code === '42501') {
        return 'PERMISSION_DENIED';
      }
      throw error;
    }
    return data || [];
  } catch (err) {
    return null;
  }
}

// أمر عرض الحالة
async function showStatus() {
  console.log('\n==================================================================================');
  console.log('       🛡️  TriPro ERP — حالة ترحيلات قاعدة البيانات (Database Migrations)         ');
  console.log('==================================================================================');
  console.log(`📡 الخادم: ${supabaseUrl}\n`);

  const applied = await getAppliedMigrations();
  const allFiles = getAllMigrationFiles();

  if (applied === 'PERMISSION_DENIED') {
    console.log('⚠️  تنبيه: الجدول موجود ولكن تنقصه صلاحية القراءة لدور anon.');
    console.log('💡 قم بتشغيل الأمر التالي لمرة واحدة فقط في Supabase SQL Editor:');
    console.log('   GRANT SELECT ON public._schema_migrations TO anon;\n');
    console.log(`📁 إجمالي ملفات الـ SQL الموجودة في sql_updates: ${allFiles.length} ملف`);
    return;
  }

  if (applied === null) {
    console.log('⚠️  تنبيه: جدول تتبع الترحيلات (_schema_migrations) غير موجود بعد في قاعدة البيانات.');
    console.log('💡 قم بتشغيل سكريبت إنشاء الجدول عبر Supabase أو تشغيل:');
    console.log('   node scripts/db_migrate.mjs --init-table\n');
    console.log(`📁 إجمالي ملفات الـ SQL الموجودة في sql_updates: ${allFiles.length} ملف`);
    return;
  }

  const appliedMap = new Map();
  applied.forEach(m => appliedMap.set(m.version || m.filename, m));

  let appliedCount = 0;
  let pendingCount = 0;

  console.log('حالة الملفات:');
  allFiles.forEach(file => {
    const isApplied = appliedMap.has(file.version) || appliedMap.has(file.filename);
    if (isApplied) {
      appliedCount++;
      const record = appliedMap.get(file.version) || appliedMap.get(file.filename);
      const isModified = record.checksum && record.checksum !== file.checksum;
      console.log(`  ✔ [مطبق]   ${file.filename}  ${isModified ? '⚠️ (تم تعديل الملف بعد تطبيقه!)' : ''}`);
    } else {
      pendingCount++;
      console.log(`  ⏳ [معلق]    ${file.filename}  (${(file.size / 1024).toFixed(1)} KB)`);
    }
  });

  console.log('\n==================================================================================');
  console.log(`📊 الملخص: إجمالي الملفات: ${allFiles.length} | المطبقة: ${appliedCount} | المعلقة: ${pendingCount}`);
  if (pendingCount > 0) {
    console.log(`💡 لتجميع كافة الملفات المعلقة في ملف واحد لتطبيقها مباشرة في Supabase:`);
    console.log(`   node scripts/db_migrate.mjs --bundle`);
  } else {
    console.log(`🎉 قاعدة البيانات محدثة بالكامل لأحدث إصدار! لا توجد ترحيلات معلقة.`);
  }
  console.log('==================================================================================\n');
}

// أمر إنشاء سكريبت تهيئة جدول الترحيلات
function getInitTableSQL() {
  return `-- ==============================================================================
-- TriPro ERP — Migration Version Tracking Table
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public._schema_migrations (
    version text PRIMARY KEY,
    filename text NOT NULL,
    checksum text,
    applied_at timestamptz DEFAULT now()
);

-- تأمين الصلاحيات
GRANT SELECT ON public._schema_migrations TO authenticated;
GRANT ALL ON public._schema_migrations TO service_role;
`;
}

// أمر تجميع الملفات المعلقة في ملف واحد
async function createBundle() {
  const applied = await getAppliedMigrations();
  const allFiles = getAllMigrationFiles();
  const appliedMap = new Map();
  if (applied) {
    applied.forEach(m => appliedMap.set(m.version || m.filename, m));
  }

  const pendingFiles = allFiles.filter(f => !appliedMap.has(f.version) && !appliedMap.has(f.filename));

  if (pendingFiles.length === 0) {
    console.log('✅ لا توجد ملفات معلقة لتجميعها. كافة الملفات مطبقة بالفعل!');
    return;
  }

  const bundlePath = path.resolve(process.cwd(), 'sql_updates', 'pending_migration_bundle.sql');
  let bundleContent = `-- ==============================================================================\n`;
  bundleContent += `-- 🛡️ TriPro ERP — Consolidated Pending Migrations Bundle\n`;
  bundleContent += `-- تاريخ التوليد: ${new Date().toISOString()}\n`;
  bundleContent += `-- عدد الملفات المعلقة المجمعة: ${pendingFiles.length}\n`;
  bundleContent += `-- ==============================================================================\n\n`;

  bundleContent += getInitTableSQL() + '\n\n';

  pendingFiles.forEach((file, index) => {
    bundleContent += `-- ------------------------------------------------------------------------------\n`;
    bundleContent += `-- [${index + 1}/${pendingFiles.length}] الملف: ${file.filename}\n`;
    bundleContent += `-- ------------------------------------------------------------------------------\n`;
    bundleContent += file.content.trim() + '\n\n';

    // تسجيل الباتش في جدول التتبع تلقائياً عند تشغيل الباندل
    bundleContent += `INSERT INTO public._schema_migrations (version, filename, checksum, applied_at)\n`;
    bundleContent += `VALUES ('${file.version}', '${file.filename}', '${file.checksum}', now())\n`;
    bundleContent += `ON CONFLICT (version) DO UPDATE SET applied_at = now(), checksum = EXCLUDED.checksum;\n\n`;
  });

  fs.writeFileSync(bundlePath, bundleContent, 'utf8');
  console.log(`\n🎉 تم إنشاء حزمة الترحيلات المجمعة بنجاح!`);
  console.log(`📁 المسار: ${bundlePath}`);
  console.log(`📦 عدد الملفات المجمعة: ${pendingFiles.length} ملف`);
  console.log(`💡 يمكنك نسخ هذا الملف ولصقه في Supabase SQL Editor لتطبيقه وتسجيله دفعة واحدة بأمان!\n`);
}

// أمر تعليم الملفات كمطبقة (Mark applied)
async function markApplied(targetVersion) {
  const allFiles = getAllMigrationFiles();
  const targetFiles = targetVersion === 'all'
    ? allFiles
    : allFiles.filter(f => f.version === targetVersion || f.filename === targetVersion);

  if (targetFiles.length === 0) {
    console.error(`❌ لم يتم العثور على أي ملف يطابق: ${targetVersion}`);
    return;
  }

  console.log(`تسجيل ${targetFiles.length} ملف كـ [مطبق] في _schema_migrations...`);
  for (const f of targetFiles) {
    const { error } = await supabase.from('_schema_migrations').upsert({
      version: f.version,
      filename: f.filename,
      checksum: f.checksum,
      applied_at: new Date().toISOString(),
    }, { onConflict: 'version' });

    if (error) {
      console.error(`❌ فشل تسجيل ${f.filename}:`, error.message);
    } else {
      console.log(`✔ تم تسجيل: ${f.filename}`);
    }
  }
}

// معالجة الأوامر من سطر الأوامر
const args = process.argv.slice(2);
const command = args[0] || '--status';

switch (command) {
  case '--status':
    await showStatus();
    break;
  case '--bundle':
  case '--generate':
    await createBundle();
    break;
  case '--init-table':
    console.log(getInitTableSQL());
    break;
  case '--mark-applied':
    if (!args[1]) {
      console.error('❌ يرجى تحديد اسم الملف أو "all" مثل: node scripts/db_migrate.mjs --mark-applied all');
      process.exit(1);
    }
    await markApplied(args[1]);
    break;
  default:
    console.log(`
الاستخدام:
  node scripts/db_migrate.mjs --status        # فحص وعرض حالة الترحيلات المنفذة والمعلقة
  node scripts/db_migrate.mjs --bundle        # تجميع كافة الترحيلات المعلقة في ملف واحد جاهز للتنفيذ
  node scripts/db_migrate.mjs --init-table    # طباعة كود SQL لإنشاء جدول تتبع الإصدارات
  node scripts/db_migrate.mjs --mark-applied all  # تعليم الملفات كمطبقة بالفعل في جدول التتبع
    `);
}

import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

// تحميل متغيرات البيئة
const envConfig = dotenv.parse(fs.readFileSync('.env', 'utf8'));
const supabaseUrl = envConfig.VITE_SUPABASE_URL;
const supabaseKey = envConfig.SUPABASE_SERVICE_ROLE_KEY || envConfig.VITE_SUPABASE_KEY || envConfig.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ خطأ: لم يتم العثور على رابط ومفتاح Supabase في ملف .env');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { persistSession: false }
});

// قائمة الجداول الشاملة في TriPro ERP
const ALL_TABLES = [
  'organizations',
  'profiles',
  'warehouses',
  'categories',
  'uoms',
  'uom_conversions',
  'accounts',
  'company_settings',
  'products',
  'customers',
  'suppliers',
  'boms',
  'bom_items',
  'invoices',
  'invoice_items',
  'purchase_invoices',
  'purchase_invoice_items',
  'orders',
  'order_items',
  'order_modifiers',
  'journal_entries',
  'journal_lines',
  'stock_adjustments',
  'stock_adjustment_items',
  'stock_transfers',
  'stock_transfer_items',
  'inventory_counts',
  'inventory_count_items',
  'cash_closings',
  'production_orders',
  'production_order_items',
  'letters_of_credit',
  'lc_receipt_items',
  'letters_of_guarantee',
  'rfq_requests',
  'rfq_items',
  'asset_categories',
  'fixed_assets',
  'depreciation_logs',
  'maintenance_logs',
  'payment_vouchers',
  'receipt_vouchers',
  'rejected_cash_closings',
  'offline_sync_queue'
];

function formatSqlValue(val) {
  if (val === null || val === undefined) return 'NULL';
  if (typeof val === 'number') return isNaN(val) ? 'NULL' : String(val);
  if (typeof val === 'boolean') return val ? 'TRUE' : 'FALSE';
  if (typeof val === 'object') {
    const jsonStr = JSON.stringify(val).replace(/'/g, "''");
    return `'${jsonStr}'::jsonb`;
  }
  const str = String(val).replace(/'/g, "''");
  return `'${str}'`;
}

async function fetchTableData(tableName) {
  let allRows = [];
  let from = 0;
  const pageSize = 1000;
  let hasMore = true;

  while (hasMore) {
    try {
      const { data, error } = await supabase
        .from(tableName)
        .select('*')
        .range(from, from + pageSize - 1);

      if (error) {
        // الجدول قد لا يكون موجوداً أو لا صلاحية
        return { tableName, rows: [], skipped: true, error: error.message };
      }

      if (data && data.length > 0) {
        allRows = allRows.concat(data);
        if (data.length < pageSize) {
          hasMore = false;
        } else {
          from += pageSize;
        }
      } else {
        hasMore = false;
      }
    } catch (err) {
      return { tableName, rows: [], skipped: true, error: err.message };
    }
  }

  return { tableName, rows: allRows, skipped: false };
}

async function runFullDump() {
  const startTime = Date.now();
  const dateStr = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const backupsDir = path.resolve('backups');
  if (!fs.existsSync(backupsDir)) {
    fs.mkdirSync(backupsDir, { recursive: true });
  }

  const dumpFileName = `TriPro_FULL_DUMP_${dateStr}.sql`;
  const dumpFilePath = path.join(backupsDir, dumpFileName);

  console.log('======================================================================');
  console.log('  🛡️  أداة أخذ النسخة الاحتياطية الشاملة لقاعدة البيانات (Full SQL Dump)');
  console.log('  المصدر: ' + supabaseUrl);
  console.log('  تاريخ البدء: ' + new Date().toLocaleString('ar-EG'));
  console.log('======================================================================\n');

  let sqlOutput = `-- ==============================================================================\n`;
  sqlOutput += `-- 🏛️ TriPro ERP - نسخة احتياطية شاملة لقاعدة البيانات (FULL DATABASE DUMP)\n`;
  sqlOutput += `-- التاريخ: ${new Date().toISOString()}\n`;
  sqlOutput += `-- المصدر: ${supabaseUrl}\n`;
  sqlOutput += `-- المحتوى: الهيكل البرمجي (جداول + معادلات + دوال + سياسات أمان) + كافة البيانات\n`;
  sqlOutput += `-- ==============================================================================\n\n`;

  // 1. تضمين الحزمة الهيكلية الكاملة (DDL: Tables, Functions, Triggers, RLS Policies)
  const ddlFile = path.resolve('commercial_db_packages/00_full_enterprise_all_in_one.sql');
  if (fs.existsSync(ddlFile)) {
    console.log('📦 [1/3] تضمين الهيكل البرمجي الشامل (الجداول، الدوال، المشغلات، وسياسات RLS)...');
    const ddlContent = fs.readFileSync(ddlFile, 'utf8');
    sqlOutput += `-- ------------------------------------------------------------------------------\n`;
    sqlOutput += `-- 1. الهيكل البرمجي والدوال المحاسبية والمعادلات وسياسات الأمان\n`;
    sqlOutput += `-- ------------------------------------------------------------------------------\n`;
    sqlOutput += ddlContent + `\n\n`;
  }

  // 2. استخراج بيانات الجداول الفعلية
  console.log('📊 [2/3] استخراج بيانات الجداول الحية من السيرفر...');
  sqlOutput += `-- ------------------------------------------------------------------------------\n`;
  sqlOutput += `-- 2. بيانات الجداول التشغيلية (Live Table Records)\n`;
  sqlOutput += `-- ------------------------------------------------------------------------------\n\n`;

  let totalRowsCount = 0;
  let successfulTables = 0;

  for (const table of ALL_TABLES) {
    process.stdout.write(`   ⏳ جلب بيانات [${table}]... `);
    const result = await fetchTableData(table);

    if (result.skipped) {
      console.log(`⚠️ (تم التخطي: ${result.error})`);
      continue;
    }

    const rowCount = result.rows.length;
    console.log(`✅ (${rowCount} سجل)`);
    totalRowsCount += rowCount;
    successfulTables++;

    if (rowCount > 0) {
      sqlOutput += `-- بيانات جدول: ${table} (${rowCount} سجل)\n`;
      sqlOutput += `ALTER TABLE public.${table} DISABLE TRIGGER ALL;\n`;

      const cols = Object.keys(result.rows[0]);
      const colList = cols.map(c => `"${c}"`).join(', ');

      for (const row of result.rows) {
        const valList = cols.map(c => formatSqlValue(row[c])).join(', ');
        sqlOutput += `INSERT INTO public.${table} (${colList}) VALUES (${valList}) ON CONFLICT DO NOTHING;\n`;
      }

      sqlOutput += `ALTER TABLE public.${table} ENABLE TRIGGER ALL;\n\n`;
    }
  }

  // 3. كتابة ملف الـ SQL النهائي
  console.log('\n💾 [3/3] كتابة وحفظ ملف الدامب النهائي...');
  fs.writeFileSync(dumpFilePath, sqlOutput, 'utf8');

  // إنشاء نسخة على سطح المكتب أيضاً لسهولة الوصول إليها
  const desktopDir = path.join(process.env.USERPROFILE || 'C:\\Users\\T.B', 'Desktop');
  const desktopDumpPath = path.join(desktopDir, dumpFileName);
  try {
    fs.copyFileSync(dumpFilePath, desktopDumpPath);
    console.log(`📁 تم نسخ ملف الدامب مباشرة إلى سطح المكتب: ${desktopDumpPath}`);
  } catch (e) {
    // متابعة في حال تعذر النسخ المباشر
  }

  const durationSec = ((Date.now() - startTime) / 1000).toFixed(1);
  const fileSizeMb = (fs.statSync(dumpFilePath).size / (1024 * 1024)).toFixed(2);

  console.log('\n======================================================================');
  console.log(`🎉 اكتملت عملية أخذ النسخة الاحتياطية الكاملة (Full Dump) بنجاح!`);
  console.log(`⏱️  الوقت المستغرق: ${durationSec} ثانية`);
  console.log(`📊 إجمالي السجلات المستخرجة: ${totalRowsCount} سجل عبر ${successfulTables} جدول`);
  console.log(`📦 حجم الملف: ${fileSizeMb} MB`);
  console.log(`📂 مسار الملف في المشروع: ${dumpFilePath}`);
  console.log('======================================================================\n');
}

runFullDump().catch(err => {
  console.error('\n❌ حدث خطأ أثناء تنفيذ الدامب:', err);
  process.exit(1);
});

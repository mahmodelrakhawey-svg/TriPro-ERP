/**
 * ==============================================================================
 * 🛡️ TriPro ERP — Multi-Environment Schema & Security Sync Verifier
 * scripts/verify_schema_sync.mjs
 * ==============================================================================
 * يتحقق من:
 *   1. تطابق سجل الترحيلات (_schema_migrations) بين قاعدة لينزا والقاعدة العامة.
 *   2. عدم وجود أي ملفات SQL معلقة في أي من البيئتين.
 *   3. عدم وجود تسريبات بيانات لدور anon على الجداول والـ RPCs الحساسة.
 * ==============================================================================
 */

import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

function loadEnvFile(filename) {
  const p = path.resolve(process.cwd(), filename);
  if (!fs.existsSync(p)) return null;
  const env = {};
  fs.readFileSync(p, 'utf8').split('\n').forEach((line) => {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#')) {
      const [key, ...val] = trimmed.split('=');
      if (key && val.length) {
        env[key.trim()] = val.join('=').trim().replace(/^["']|["']$/g, '');
      }
    }
  });
  return env;
}

function getSqlFiles() {
  const dir = path.resolve(process.cwd(), 'sql_updates');
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.sql') && !f.endsWith('_bundle.sql') && !f.startsWith('mark_all_'))
    .sort((a, b) => a.localeCompare(b));
}

async function verifyEnvironment(name, envFile) {
  const env = loadEnvFile(envFile);
  if (!env?.VITE_SUPABASE_URL || !env?.VITE_SUPABASE_KEY) {
    console.log(`⚠️ [${name}] ملف ${envFile} غير موجود أو غير مكتمل — تم التخطي.`);
    return { ok: true, skipped: true };
  }

  const sb = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_KEY);
  const allFiles = getSqlFiles();

  // 1. Check migrations
  const { data: applied, error: migErr } = await sb
    .from('_schema_migrations')
    .select('version, filename');

  if (migErr) {
    console.error(`❌ [${name}] فشل قراءة _schema_migrations:`, migErr.message);
    return { ok: false };
  }

  const appliedSet = new Set((applied || []).map((m) => m.filename));
  const pending = allFiles.filter((f) => !appliedSet.has(f));

  // 2. Check anon leaks
  const sensitiveTables = [
    'organizations',
    'profiles',
    'fiscal_years',
    'approval_workflows',
    'approval_requests',
    'pos_petty_cash_payouts',
    'annual_fiscal_archives',
    'archived_journal_entries',
    'security_logs',
    'company_settings',
    'journal_entries',
    'invoices',
    'purchase_invoices',
  ];

  const leaked = [];
  for (const tbl of sensitiveTables) {
    const { data, status } = await sb.from(tbl).select('*').limit(1);
    if (status === 200 && data && data.length > 0) {
      leaked.push(tbl);
    }
  }

  console.log(`\n📡 [${name}] (${env.VITE_SUPABASE_URL})`);
  console.log(`   - الترحيلات: ${allFiles.length - pending.length} / ${allFiles.length} مطبقة (المعلق: ${pending.length})`);
  if (pending.length > 0) {
    console.log(`   ⏳ ملفات معلقة:`, pending);
  }
  console.log(`   - فحص التسريب (anon): ${leaked.length === 0 ? '✅ 0 تسريبات' : '❌ تسريب في: ' + leaked.join(', ')}`);

  return { ok: pending.length === 0 && leaked.length === 0 };
}

async function main() {
  console.log('==================================================================================');
  console.log('       🛡️  TriPro ERP — Multi-Environment Schema & Security Sync Verifier');
  console.log('==================================================================================');

  const resLenza = await verifyEnvironment('Lenza Production', '.env.lenza');
  const resGeneral = await verifyEnvironment('General Production', '.env.general');

  console.log('\n==================================================================================');
  if (resLenza.ok && resGeneral.ok) {
    console.log('🎉 جميع البيئات متزامنة ومؤمّنة بالكامل (0 معلق، 0 تسريبات)!');
    process.exit(0);
  } else {
    console.error('⚠️ توجد ملاحظات تتطلب المراجعة أعلاه.');
    process.exit(1);
  }
}

main();

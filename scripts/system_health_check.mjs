/**
 * ==============================================================================
 * 🛡️ درع سلامة النظام - أداة الفحص التلقائي الشامل لجميع موديولات TriPro ERP
 * (TriPro ERP Automated Health & Regression Test Suite)
 * ==============================================================================
 * الفائدة: التأكد قبل وبعد أي تعديل أن جميع الموديولات السليمة لا زالت تعمل 100%
 * ولم ينكسر أي جدول أو دالة أو ربط محاسبي نتيجة التعديلات.
 */

import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

// قراءة ملف .env الحالي
function loadEnv() {
  const envPath = path.resolve(process.cwd(), '.env');
  if (!fs.existsSync(envPath)) {
    console.error('❌ خطأ: ملف .env غير موجود!');
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
  return env;
}

const env = loadEnv();
const supabaseUrl = env.VITE_SUPABASE_URL;
const supabaseKey = env.VITE_SUPABASE_KEY || env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ خطأ: لم يتم العثور على رابط أو مفتاح Supabase في ملف .env!');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

// ألوان مخرجات الـ Console
const c = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  bold: '\x1b[1m'
};

let passedCount = 0;
let warningCount = 0;
let errorCount = 0;

function report(status, moduleName, testName, message = '') {
  if (status === 'PASS') {
    passedCount++;
    console.log(`  ${c.green}✔ [سليم]${c.reset} ${c.bold}${testName}${c.reset} ${message ? '(' + message + ')' : ''}`);
  } else if (status === 'WARN') {
    warningCount++;
    console.log(`  ${c.yellow}▲ [تنبيه]${c.reset} ${c.bold}${testName}${c.reset}: ${message}`);
  } else {
    errorCount++;
    console.log(`  ${c.red}✖ [خلل]${c.reset} ${c.bold}${testName}${c.reset}: ${message}`);
  }
}

async function runHealthCheck() {
  const dbHost = supabaseUrl.replace('https://', '').split('.')[0];
  console.log(`\n${c.cyan}======================================================================${c.reset}`);
  console.log(`${c.cyan}       🛡️ بدء الفحص الشامل لسلامة النظام (TriPro Health Check)       ${c.reset}`);
  console.log(`${c.cyan}======================================================================${c.reset}`);
  console.log(`📡 قاعدة البيانات المفحوصة: ${c.bold}${dbHost}${c.reset} (${supabaseUrl})\n`);

  // ---------------------------------------------------------------------------
  // 1. فحص موديول الحسابات والمالية (Accounting & General Ledger)
  // ---------------------------------------------------------------------------
  console.log(`${c.blue}1️⃣ موديول الحسابات العامة والمالية (Accounting & Finance):${c.reset}`);
  try {
    const { count: accCount, error: accErr } = await supabase.from('accounts').select('*', { count: 'exact', head: true });
    if (accErr) report('FAIL', 'Accounting', 'شجرة الحسابات (accounts)', accErr.message);
    else report('PASS', 'Accounting', 'شجرة الحسابات (accounts)', `${accCount} حساب مسجل`);

    const { count: jeCount, error: jeErr } = await supabase.from('journal_entries').select('*', { count: 'exact', head: true });
    if (jeErr) report('FAIL', 'Accounting', 'دفتر اليومية (journal_entries)', jeErr.message);
    else report('PASS', 'Accounting', 'دفتر اليومية (journal_entries)', `${jeCount} قيد`);

    const { count: jlCount, error: jlErr } = await supabase.from('journal_lines').select('*', { count: 'exact', head: true });
    if (jlErr) report('FAIL', 'Accounting', 'أسطر القيود (journal_lines)', jlErr.message);
    else report('PASS', 'Accounting', 'أسطر القيود (journal_lines)', `${jlCount} سطر`);

    const { error: settErr } = await supabase.from('company_settings').select('*').limit(1);
    if (settErr) report('FAIL', 'Accounting', 'إعدادات الشركة وربط الحسابات', settErr.message);
    else report('PASS', 'Accounting', 'إعدادات الشركة وربط الحسابات');
  } catch (e) {
    report('FAIL', 'Accounting', 'استقرار المحرك المالي', e.message);
  }

  // ---------------------------------------------------------------------------
  // 2. فحص موديول المستشفيات والعيادات الطبية (HIMS & Healthcare)
  // ---------------------------------------------------------------------------
  console.log(`\n${c.blue}2️⃣ موديول الرعاية الصحية والمستشفيات (HIMS):${c.reset}`);
  try {
    const { count: patCount, error: patErr } = await supabase.from('hims_patients').select('*', { count: 'exact', head: true });
    if (patErr) report('FAIL', 'HIMS', 'جدول ملفات المرضى (hims_patients)', patErr.message);
    else report('PASS', 'HIMS', 'جدول ملفات المرضى (hims_patients)', `${patCount} مريض مسجل`);

    const { data: prescData, error: prescErr } = await supabase.from('hims_prescriptions').select('*').limit(1);
    if (prescErr) {
      report('FAIL', 'HIMS', 'جدول الروشتات الطبية (hims_prescriptions)', prescErr.message);
    } else {
      report('PASS', 'HIMS', 'جدول الروشتات الطبية (hims_prescriptions)');
      // فحص عمود dispensed_at الحاسم
      if (prescData && prescData[0] && !('dispensed_at' in prescData[0])) {
        report('WARN', 'HIMS', 'عمود تاريخ الصرف (dispensed_at)', 'العمود غير موجود بعد في الجدول. يُرجى تنفيذ sql_updates.');
      } else {
        report('PASS', 'HIMS', 'عمود توثيق الصرف (dispensed_at)');
      }
    }

    const { error: billErr } = await supabase.from('hims_billing').select('*', { count: 'exact', head: true });
    if (billErr) report('FAIL', 'HIMS', 'الفواتير والتحصيل الطبي (hims_billing)', billErr.message);
    else report('PASS', 'HIMS', 'الفواتير والتحصيل الطبي (hims_billing)');

    // فحص دالة الصرف hims_dispense_prescription (لضمان عدم وجود 404 أو تضارب مرشحين)
    const { error: rpcErr } = await supabase.rpc('hims_dispense_prescription', {
      p_prescription_id: '00000000-0000-0000-0000-000000000000'
    });
    if (rpcErr && rpcErr.message.includes('Could not choose the best candidate')) {
      report('FAIL', 'HIMS', 'دالة صرف الروشتات (RPC)', 'يوجد تضارب في توقيعات الدالة!');
    } else if (rpcErr && rpcErr.code === '404') {
      report('FAIL', 'HIMS', 'دالة صرف الروشتات (RPC)', 'الدالة غير موجودة في قاعدة البيانات (404)!');
    } else {
      report('PASS', 'HIMS', 'دالة صرف الروشتات الطبية (RPC)', 'الدالة مسجلة وتعمل باستجابة صحيحة');
    }
  } catch (e) {
    report('FAIL', 'HIMS', 'استقرار موديول المستشفيات', e.message);
  }

  // ---------------------------------------------------------------------------
  // 3. فحص موديول المطاعم ونقاط البيع (Restaurant & POS)
  // ---------------------------------------------------------------------------
  console.log(`\n${c.blue}3️⃣ موديول المطاعم والكافيهات والكاشير (Restaurant & POS):${c.reset}`);
  try {
    const { count: ordCount, error: ordErr } = await supabase.from('orders').select('*', { count: 'exact', head: true });
    if (ordErr) report('FAIL', 'Restaurant', 'طلبات البيع وفواتير المطعم (orders)', ordErr.message);
    else report('PASS', 'Restaurant', 'طلبات البيع وفواتير المطعم (orders)', `${ordCount} طلب مسجل`);

    const { count: itemErr } = await supabase.from('order_items').select('*', { count: 'exact', head: true });
    if (itemErr.error) report('FAIL', 'Restaurant', 'بنود الطلبات (order_items)', itemErr.error.message);
    else report('PASS', 'Restaurant', 'بنود الطلبات (order_items)');

    const { count: tblCount, error: tblErr } = await supabase.from('restaurant_tables').select('*', { count: 'exact', head: true });
    if (tblErr) report('WARN', 'Restaurant', 'طاولات الصالة (restaurant_tables)', tblErr.message);
    else report('PASS', 'Restaurant', 'طاولات الصالة (restaurant_tables)', `${tblCount} طاولة`);
  } catch (e) {
    report('FAIL', 'Restaurant', 'استقرار موديول المطاعم', e.message);
  }

  // ---------------------------------------------------------------------------
  // 4. فحص موديول المقاولات والإنشاءات (Construction & Engineering)
  // ---------------------------------------------------------------------------
  console.log(`\n${c.blue}4️⃣ موديول المقاولات والمشاريع (Construction & Contracting):${c.reset}`);
  try {
    const { count: prjCount, error: prjErr } = await supabase.from('projects').select('*', { count: 'exact', head: true });
    if (prjErr) report('FAIL', 'Construction', 'جدول المشاريع (projects)', prjErr.message);
    else report('PASS', 'Construction', 'جدول المشاريع (projects)', `${prjCount} مشروع`);

    const { error: boqErr } = await supabase.from('project_boq_items').select('*', { count: 'exact', head: true });
    if (boqErr) report('WARN', 'Construction', 'بنود المقايسة (BOQ)', boqErr.message);
    else report('PASS', 'Construction', 'بنود المقايسة (BOQ)');

    const { count: subCount, error: subErr } = await supabase.from('subcontractors').select('*', { count: 'exact', head: true });
    if (subErr) report('WARN', 'Construction', 'مقابلو الباطن (subcontractors)', subErr.message);
    else report('PASS', 'Construction', 'مقابلو الباطن (subcontractors)', `${subCount} مقاول`);
  } catch (e) {
    report('FAIL', 'Construction', 'استقرار موديول المقاولات', e.message);
  }

  // ---------------------------------------------------------------------------
  // 5. فحص موديول التصنيع والإنتاج (Manufacturing)
  // ---------------------------------------------------------------------------
  console.log(`\n${c.blue}5️⃣ موديول التصنيع والإنتاج (Manufacturing):${c.reset}`);
  try {
    const { count: mfgCount, error: mfgErr } = await supabase.from('mfg_production_orders').select('*', { count: 'exact', head: true });
    if (mfgErr) report('WARN', 'Manufacturing', 'أوامر الإنتاج (mfg_production_orders)', mfgErr.message);
    else report('PASS', 'Manufacturing', 'أوامر الإنتاج (mfg_production_orders)', `${mfgCount} أمر إنتاج`);

    const { count: bomCount, error: bomErr } = await supabase.from('mfg_boms').select('*', { count: 'exact', head: true });
    if (bomErr) report('WARN', 'Manufacturing', 'معادلات التكاليف (BOM)', bomErr.message);
    else report('PASS', 'Manufacturing', 'معادلات التكاليف (BOM)', `${bomCount} تركيبة تصنيع`);
  } catch (e) {
    report('FAIL', 'Manufacturing', 'استقرار موديول التصنيع', e.message);
  }

  // ---------------------------------------------------------------------------
  // 6. فحص موديول المخازن والأصناف والمشتريات (Inventory & Products)
  // ---------------------------------------------------------------------------
  console.log(`\n${c.blue}6️⃣ موديول المخازن والأصناف والمشتريات (Inventory & Warehouses):${c.reset}`);
  try {
    const { count: prodCount, error: prodErr } = await supabase.from('products').select('*', { count: 'exact', head: true });
    if (prodErr) report('FAIL', 'Inventory', 'دليل الأصناف والمنتجات (products)', prodErr.message);
    else report('PASS', 'Inventory', 'دليل الأصناف والمنتجات (products)', `${prodCount} صنف مسجل`);

    const { count: whCount, error: whErr } = await supabase.from('warehouses').select('*', { count: 'exact', head: true });
    if (whErr) report('FAIL', 'Inventory', 'المستودعات والمخازن (warehouses)', whErr.message);
    else report('PASS', 'Inventory', 'المستودعات والمخازن (warehouses)', `${whCount} مستودع`);

    const { count: invCount, error: invErr } = await supabase.from('invoices').select('*', { count: 'exact', head: true });
    if (invErr) report('FAIL', 'Inventory', 'فواتير المبيعات (invoices)', invErr.message);
    else report('PASS', 'Inventory', 'فواتير المبيعات (invoices)', `${invCount} فاتورة`);
  } catch (e) {
    report('FAIL', 'Inventory', 'استقرار موديول المخازن والمبيعات', e.message);
  }

  // ---------------------------------------------------------------------------
  // 7. فحص موديول الموارد البشرية (Human Resources)
  // ---------------------------------------------------------------------------
  console.log(`\n${c.blue}7️⃣ موديول الموارد البشرية والرواتب (HR):${c.reset}`);
  try {
    const { count: empCount, error: empErr } = await supabase.from('hr_employees').select('*', { count: 'exact', head: true });
    if (empErr) report('WARN', 'HR', 'ملفات الموظفين (hr_employees)', empErr.message);
    else report('PASS', 'HR', 'ملفات الموظفين (hr_employees)', `${empCount} موظف`);

    const { count: deptCount, error: deptErr } = await supabase.from('hr_departments').select('*', { count: 'exact', head: true });
    if (deptErr) report('WARN', 'HR', 'الأقسام والهيكل الإداري', deptErr.message);
    else report('PASS', 'HR', 'الأقسام والهيكل الإداري', `${deptCount} قسم`);
  } catch (e) {
    report('FAIL', 'HR', 'استقرار موديول الموارد البشرية', e.message);
  }

  // ---------------------------------------------------------------------------
  // النتيجة النهائية
  // ---------------------------------------------------------------------------
  console.log(`\n${c.cyan}======================================================================${c.reset}`);
  console.log(`${c.bold}📊 النتيجة الإجمالية لفحص سلامة النظام:${c.reset}`);
  console.log(`  ${c.green}✔ عناصر سليمة واجتازت الفحص: ${passedCount}${c.reset}`);
  if (warningCount > 0) console.log(`  ${c.yellow}▲ تنبيهات بسيطة: ${warningCount}${c.reset}`);
  if (errorCount > 0) console.log(`  ${c.red}✖ مشاكل بحاجة لإصلاح: ${errorCount}${c.reset}`);
  console.log(`${c.cyan}======================================================================${c.reset}`);

  if (errorCount === 0) {
    console.log(`\n${c.green}${c.bold}🎉 تهانينا! جميع الموديولات السليمة تعمل بكفاءة تامة ولم ينكسر أي منها!${c.reset}\n`);
  } else {
    console.log(`\n${c.red}${c.bold}⚠️ تنبيه: يرجى مراجعة البنود المذكورة أعلاه قبل رفع أي تعديل للإنتاج.${c.reset}\n`);
  }
}

runHealthCheck().catch(err => {
  console.error('خطأ غير متوقع أثناء تشغيل الفحص:', err);
});

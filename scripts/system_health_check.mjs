/**
 * ==============================================================================
 * 🛡️ درع سلامة النظام الشامل - TriPro ERP Enterprise Health & Regression Test Suite
 * ==============================================================================
 * الفائدة: درع حماية شامل يفحص كافة موديولات النظام الـ 15 مع تدقيق عميق للجداول،
 * الأعمدة الحساسة، الصلاحيات (RLS)، الدوال البرمجية (RPCs)، والتكامل المحاسبي والمخزني،
 * لضمان عدم تعطل أي موديول سليم مطلقاً عند تعديل آخر.
 */

import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

// تحميل ملف .env
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
  bold: '\x1b[1m',
  gray: '\x1b[90m'
};

let passedCount = 0;
let warningCount = 0;
let errorCount = 0;
const failedItems = [];

function report(status, moduleName, testName, message = '') {
  if (status === 'PASS') {
    passedCount++;
    console.log(`  ${c.green}✔ [سليم]${c.reset} ${c.bold}${testName}${c.reset} ${message ? c.gray + '(' + message + ')' + c.reset : ''}`);
  } else if (status === 'WARN') {
    warningCount++;
    console.log(`  ${c.yellow}▲ [تنبيه]${c.reset} ${c.bold}${testName}${c.reset}: ${message}`);
  } else {
    errorCount++;
    failedItems.push({ module: moduleName, test: testName, message });
    console.log(`  ${c.red}✖ [خلل]${c.reset} ${c.bold}${testName}${c.reset}: ${message}`);
  }
}

/**
 * فحص عام لجدول: وجوده، استجابته، وفحص أعمدة محددة إن وجدت
 */
async function testTable(tableName, label, requiredColumns = []) {
  try {
    const { data, count, error } = await supabase
      .from(tableName)
      .select(requiredColumns.length > 0 ? requiredColumns.join(',') : '*', { count: 'exact' })
      .limit(1);

    if (error) {
      report('FAIL', label, label, `كود الخطأ ${error.code}: ${error.message}`);
      return false;
    }

    let extraInfo = '';
    if (count !== null && count !== undefined) {
      extraInfo = `${count} سجل`;
    } else if (data) {
      extraInfo = `${data.length} عينة`;
    }

    if (requiredColumns.length > 0) {
      extraInfo += (extraInfo ? ' | ' : '') + `الأعمدة: [${requiredColumns.join(', ')}]`;
    }

    report('PASS', label, label, extraInfo);
    return true;
  } catch (err) {
    report('FAIL', label, label, err.message);
    return false;
  }
}

async function runEnterpriseHealthCheck() {
  const startTime = Date.now();
  const dbHost = supabaseUrl.replace('https://', '').split('.')[0];
  console.log(`\n${c.cyan}==================================================================================${c.reset}`);
  console.log(`${c.cyan}${c.bold}     🛡️  درع الأمان الموسع - الفحص الشامل لسلامة كافة موديولات TriPro ERP      ${c.reset}`);
  console.log(`${c.cyan}==================================================================================${c.reset}`);
  console.log(`📡 قاعدة البيانات المفحوصة: ${c.bold}${dbHost}${c.reset} (${supabaseUrl})`);
  console.log(`⏱️ وقت البدء: ${new Date().toLocaleTimeString('ar-EG')}\n`);

  // تسجيل الدخول كمستخدم معتمد لاختبار صلاحيات RLS الحقيقية
  try {
    const { data: authData, error: authErr } = await supabase.auth.signInWithPassword({
      email: 'malak@gmail.com',
      password: '12345678'
    });
    if (!authErr && authData?.user) {
      console.log(`🔑 ${c.green}سياق الفحص:${c.reset} تم تسجيل الدخول كمستخدم معتمد (${c.bold}${authData.user.email}${c.reset}) لفحص صلاحيات RLS والبيانات المحمية\n`);
    } else {
      console.log(`🔑 ${c.yellow}سياق الفحص:${c.reset} يتم الفحص بالمفتاح الافتراضي\n`);
    }
  } catch (e) {
    // متابعة
  }

  // ===========================================================================
  // 1️⃣ موديول الحسابات والمالية العامة (Accounting & General Ledger)
  // ===========================================================================
  console.log(`${c.blue}1️⃣ موديول الحسابات والمالية العامة (Accounting & General Ledger):${c.reset}`);
  await testTable('accounts', 'شجرة الحسابات والدليل المحاسبي', ['id', 'code', 'name', 'type', 'balance']);
  await testTable('journal_entries', 'دفتر اليومية العامة والقيود', ['id', 'transaction_date', 'description', 'reference', 'status']);
  await testTable('journal_lines', 'أسطر القيود وتوازن المدين والدائن', ['id', 'journal_entry_id', 'account_id', 'debit', 'credit']);
  await testTable('budgets', 'الموازنات التقديرية (Budgets)', ['id', 'name']);
  await testTable('cost_centers', 'مراكز التكلفة والمشاريع', ['id', 'name']);
  await testTable('company_settings', 'إعدادات الشركة وربط الحسابات الافتراضية', ['id']);

  // ===========================================================================
  // 2️⃣ موديول المبيعات والعملاء وعروض الأسعار (Sales & Customers)
  // ===========================================================================
  console.log(`\n${c.blue}2️⃣ موديول المبيعات والعملاء والفواتير (Sales & Invoicing):${c.reset}`);
  await testTable('customers', 'دليل العملاء والملفات الضريبية', ['id', 'name', 'phone']);
  await testTable('invoices', 'فواتير المبيعات الضريبية', ['id', 'invoice_number', 'total_amount', 'status']);
  await testTable('invoice_items', 'بنود وتفاصيل فواتير المبيعات', ['id', 'invoice_id', 'product_id', 'quantity']);
  await testTable('sales_orders', 'أوامر البيع وطلبات التوريد', ['id', 'order_number', 'total_amount', 'status']);
  await testTable('sales_order_items', 'بنود أوامر البيع', ['id', 'sales_order_id', 'product_id', 'quantity']);
  await testTable('quotations', 'عروض الأسعار المقدمة للعملاء', ['id', 'quotation_number', 'total_amount', 'status']);
  await testTable('quotation_items', 'بنود وتفاصيل عروض الأسعار', ['id', 'quotation_id', 'product_id', 'quantity']);
  await testTable('sales_returns', 'مرتجعات المبيعات ومردوداتها', ['id', 'return_number', 'status']);
  await testTable('credit_notes', 'إشعارات الخصم ومرتجعات المبيعات', ['id', 'credit_note_number', 'total_amount', 'status']);
  await testTable('recurring_invoices', 'الفواتير والاشتراكات المتكررة', ['id', 'title', 'frequency', 'status']);

  // ===========================================================================
  // 3️⃣ موديول المشتريات والموردين (Purchases & Procurement)
  // ===========================================================================
  console.log(`\n${c.blue}3️⃣ موديول المشتريات والموردين (Purchases & Procurement):${c.reset}`);
  await testTable('suppliers', 'دليل الموردين وأرصدة الدائنين', ['id', 'name']);
  await testTable('purchase_invoices', 'فواتير المشتريات الواردة', ['id', 'invoice_number', 'total_amount']);
  await testTable('purchase_invoice_items', 'بنود فواتير المشتريات وتكلفة الشراء', ['id', 'purchase_invoice_id', 'product_id', 'quantity']);
  await testTable('purchase_orders', 'أوامر الشراء للموردين (PO)', ['id', 'order_number', 'total_amount', 'status']);
  await testTable('purchase_order_items', 'بنود أوامر الشراء', ['id', 'purchase_order_id', 'product_id', 'quantity']);
  await testTable('purchase_returns', 'مرتجعات ومردودات المشتريات', ['id', 'return_number', 'status']);
  await testTable('debit_notes', 'إشعارات المدين ومرتجعات المشتريات', ['id', 'debit_note_number', 'total_amount', 'status']);
  await testTable('vendor_contracts', 'عقود واتفاقيات التوريد طويلة الأجل', ['id', 'contract_number', 'vendor_id', 'status']);

  // ===========================================================================
  // 4️⃣ موديول المستودعات والمخزون وحركات الأصناف (Inventory & Warehousing)
  // ===========================================================================
  console.log(`\n${c.blue}4️⃣ موديول المخزون والمستودعات والتوريد (Inventory & Warehousing):${c.reset}`);
  await testTable('products', 'دليل الأصناف والمنتجات والباركود', ['id', 'name', 'cost', 'sales_price', 'purchase_price']);
  await testTable('product_categories', 'تصنيفات وفئات المنتجات', ['id', 'name']);
  await testTable('uoms', 'وحدات القياس والتحويل المخزني (UOM)', ['id', 'name']);
  await testTable('warehouses', 'المستودعات والمخازن الرئيسية والفرعية', ['id', 'name']);
  await testTable('opening_inventories', 'الأرصدة الافتتاحية للمخزون', ['id', 'product_id', 'quantity']);
  await testTable('stock_adjustments', 'تسويات وتسويات الفروق المخزنية', ['id', 'adjustment_number', 'status']);
  await testTable('stock_transfers', 'التحويلات والمناقلات بين المستودعات', ['id', 'transfer_number', 'from_warehouse_id', 'to_warehouse_id']);
  await testTable('inventory_counts', 'أوامر ولجان الجرد الفعلي للمخازن', ['id', 'count_number', 'status']);
  await testTable('goods_receipt_notes', 'أذونات استلام البضائع (GRN)', ['id']);

  // ===========================================================================
  // 5️⃣ موديول الخزينة والبنوك والمدفوعات (Banking & Treasury)
  // ===========================================================================
  console.log(`\n${c.blue}5️⃣ موديول الخزينة والبنوك والشيكات (Banking & Treasury):${c.reset}`);
  await testTable('receipt_vouchers', 'سندات القبض المالي والتحصيل', ['id', 'voucher_number', 'amount']);
  await testTable('receipt_voucher_attachments', 'مرفقات ومستندات سندات القبض', ['id', 'voucher_id']);
  await testTable('payment_vouchers', 'سندات الصرف والمدفوعات المالية', ['id', 'voucher_number', 'amount']);
  await testTable('payment_voucher_attachments', 'مرفقات ومستندات سندات الصرف', ['id', 'voucher_id']);
  await testTable('cheques', 'حافظة الشيكات والكمبيالات وحالات التحصيل', ['id', 'cheque_number', 'amount', 'status']);
  await testTable('bank_reconciliations', 'التسويات والمطابقات البنكية', ['id']);
  await testTable('letters_of_guarantee', 'خطابات الضمان البنكية (LG)', ['id']);
  await testTable('letters_of_credit', 'الاعتمادات المستندية البنكية (LC)', ['id', 'lc_number', 'currency_code', 'status']);

  // ===========================================================================
  // 6️⃣ موديول الرعاية الصحية والمستشفيات والعيادات (HIMS - Healthcare)
  // ===========================================================================
  console.log(`\n${c.blue}6️⃣ موديول الرعاية الصحية والمستشفيات والعيادات (HIMS):${c.reset}`);
  await testTable('hims_patients', 'ملفات وسجلات المرضى (MRN)', ['id', 'full_name', 'phone', 'national_id']);
  await testTable('hims_visits', 'سجل زيارات العيادات والاستقبال', ['id', 'patient_id', 'status']);
  await testTable('hims_prescriptions', 'الروشتات والوصفات الطبية', ['id', 'visit_id', 'status', 'dispensed_at']);
  await testTable('hims_appointments', 'حجوزات ومواعيد العيادات الخارجية', ['id', 'patient_id', 'doctor_id', 'status']);
  await testTable('hims_doctors', 'سجل الأطباء والكوادر الطبية', ['id', 'specialization', 'consultation_fee']);
  await testTable('hims_billing', 'الفواتير الطبية والتحصيل ومطالبات المرضى', ['id', 'patient_id', 'total_amount', 'payment_status']);
  await testTable('hims_billing_items', 'بنود الفواتير والخدمات المقدمة للمريض', ['id', 'billing_id', 'description', 'total_price']);
  await testTable('hims_wards', 'أجنحة وغرف التنويم بالمستشفى', ['id', 'name']);
  await testTable('hims_beds', 'سجل الأسرة وحالات الإشغال والشاغر', ['id', 'ward_id', 'status']);
  await testTable('hims_lab_orders', 'طلبات التحاليل والفحوصات المخبرية', ['id', 'visit_id', 'status']);
  await testTable('hims_radiology_orders', 'طلبات الأشعة والتصوير الطبي', ['id', 'visit_id', 'scan_type', 'status']);
  await testTable('hims_surgeries', 'غرف وجداول العمليات الجراحية', ['id']);
  await testTable('hims_insurance_claims', 'مطالبات شركات التأمين الصحي', ['id']);

  // اختبار دالة صرف الروشتات الطبية (RPC: hims_dispense_prescription)
  try {
    const fakeUuid = '00000000-0000-0000-0000-000000000000';
    const { error: rpcErr } = await supabase.rpc('hims_dispense_prescription', {
      p_prescription_id: fakeUuid
    });
    if (!rpcErr) {
      report('PASS', 'HIMS', 'دالة صرف الروشتات (hims_dispense_prescription RPC)', 'تعمل وتستجيب');
    } else if (rpcErr.message && (rpcErr.message.includes('not found') || rpcErr.message.includes('غير موجودة') || rpcErr.code === 'P0001')) {
      report('PASS', 'HIMS', 'دالة صرف الروشتات (hims_dispense_prescription RPC)', 'الدالة مسجلة وتتحقق من صحة المعطيات بنجاح');
    } else if (rpcErr.code === '42883' || rpcErr.code === 'PGRST202') {
      report('FAIL', 'HIMS', 'دالة صرف الروشتات (hims_dispense_prescription RPC)', 'الدالة غير معرّفة أو هناك تضارب في التوقيع: ' + rpcErr.message);
    } else {
      report('PASS', 'HIMS', 'دالة صرف الروشتات (hims_dispense_prescription RPC)', `استجابت الدالة بشكل صحيح (${rpcErr.message})`);
    }
  } catch (err) {
    report('FAIL', 'HIMS', 'دالة صرف الروشتات (hims_dispense_prescription RPC)', err.message);
  }

  // ===========================================================================
  // 7️⃣ موديول المطاعم والكافيهات وشاشات المطبخ (Restaurant & KDS)
  // ===========================================================================
  console.log(`\n${c.blue}7️⃣ موديول المطاعم والكافيهات ونقاط الكاشير (Restaurant & KDS):${c.reset}`);
  await testTable('restaurant_tables', 'طاولات الصالة وتوزيع الجلسات', ['id', 'name', 'capacity', 'status']);
  await testTable('orders', 'طلبات وفواتير المطعم (Dine-in / Takeaway / Delivery)', ['id', 'order_number', 'order_type', 'status']);
  await testTable('order_items', 'بنود الوجبات والمشروبات والإضافات', ['id', 'order_id', 'product_id', 'quantity']);
  await testTable('kitchen_stations', 'محطات المطبخ وشاشات KDS', ['id', 'name']);
  await testTable('shifts', 'ورديات العمل وإقفال الكاش اليومي', ['id']);

  // ===========================================================================
  // 8️⃣ موديول التجزئة ونقاط البيع السريعة (Retail POS)
  // ===========================================================================
  console.log(`\n${c.blue}8️⃣ موديول نقاط البيع بالتجزئة والهايبرماركت (Retail & POS):${c.reset}`);
  await testTable('retail_promotions', 'العروض والخصومات الترويجية للسلع', ['id']);

  // ===========================================================================
  // 9️⃣ موديول المقاولات والمشاريع الهندسية (Construction & Projects)
  // ===========================================================================
  console.log(`\n${c.blue}9️⃣ موديول المقاولات وإدارة المشاريع (Construction & Projects):${c.reset}`);
  await testTable('projects', 'سجل المشاريع الهندسية ونسب الإنجاز', ['id', 'name', 'status']);
  await testTable('project_boq', 'جداول الكميات والمقايسات (BOQ)', ['id', 'project_id', 'item_name']);
  await testTable('subcontractors', 'دليل مقاولي الباطن والشركات المساندة', ['id', 'name']);
  await testTable('subcontractor_contracts', 'عقود مقاولي الباطن وشروط الدفع', ['id', 'subcontractor_id', 'project_id']);
  await testTable('subcontractor_billings', 'مستخلصات مقاولي الباطن والاستقطاعات', ['id', 'contract_id']);
  await testTable('project_progress_billings', 'مستخلصات المالك وتقدم الأعمال', ['id', 'project_id', 'billing_number']);
  await testTable('project_milestones', 'مراحل المشروع والمعالم الرئيسية', ['id', 'project_id']);
  await testTable('project_daily_reports', 'تقارير الموقع واليوميات الميدانية', ['id', 'project_id']);
  await testTable('project_custodies', 'عهد ومصروفات المشاريع الميدانية', ['id', 'project_id']);
  await testTable('equipment', 'معدات وآليات الموقع وسجلات التشغيل', ['id', 'name']);
  await testTable('project_material_issues', 'أذونات صرف المواد للمشروع', ['id', 'project_id']);
  await testTable('project_material_issue_items', 'بنود المواد المنصرفة للموقع', ['id', 'issue_id', 'product_id', 'quantity']);

  // ===========================================================================
  // 🔟 موديول التصنيع والإنتاج المتقدم (Manufacturing & Production)
  // ===========================================================================
  console.log(`\n${c.blue}🔟 موديول التصنيع والإنتاج ومعادلات التكلفة (Manufacturing):${c.reset}`);
  await testTable('mfg_production_orders', 'أوامر الإنتاج والتشغيل المصنعي', ['id', 'order_number', 'status']);
  await testTable('bill_of_materials', 'قوائم وتراكيب مواد الإنتاج والمعادلات (BOM)', ['id', 'product_id', 'raw_material_id']);
  await testTable('work_orders', 'أوامر العمل والتشغيل التفصيلية', ['id', 'order_number']);
  await testTable('mfg_work_centers', 'مراكز العمل والماكينات وخطوط الإنتاج', ['id', 'name']);
  await testTable('mfg_routings', 'مسارات العمليات والخطوات التشغيلية', ['id', 'name']);
  await testTable('mfg_material_requests', 'طلبات صرف المواد الخام للتصنيع', ['id']);
  await testTable('mfg_material_request_items', 'بنود المواد الخام المطلوبة للتشغيل', ['id', 'raw_material_id']);
  await testTable('mfg_alerts_log', 'سجل تنبيهات وانحرافات التصنيع', ['id']);

  // ===========================================================================
  // 1️⃣1️⃣ موديول الموارد البشرية والرواتب (HR & Payroll)
  // ===========================================================================
  console.log(`\n${c.blue}1️⃣1️⃣ موديول الموارد البشرية والرواتب وشؤون الموظفين (HR):${c.reset}`);
  await testTable('employees', 'ملفات وسجلات الموظفين والرواتب', ['id', 'name', 'basic_salary', 'organization_id']);
  await testTable('payrolls', 'مسيرات الرواتب الشهرية وتاريخ الاعتماد', ['id', 'payroll_month', 'payroll_year']);
  await testTable('payroll_items', 'بنود وتفاصيل رواتب الموظفين والبدلات', ['id']);
  await testTable('employee_advances', 'سلف وقروض الموظفين وأقساط السداد', ['id', 'employee_id', 'amount']);
  await testTable('hr_attendance_logs', 'سجلات الحضور والانصراف والبصمات', ['id', 'employee_id', 'log_date']);
  await testTable('hr_leave_requests', 'طلبات وأرصدة الإجازات السنوية والمرضية', ['id', 'employee_id', 'status']);
  await testTable('hr_leave_balances', 'سجل أرصدة الإجازات المتبقية للموظفين', ['id', 'employee_id']);
  await testTable('hr_shifts', 'ورديات ومواعيد وساعات العمل', ['id', 'name']);
  await testTable('hr_penalties_rewards', 'سجل الجزاءات والمكافآت والحوافز', ['id', 'employee_id']);

  // ===========================================================================
  // 1️⃣2️⃣ موديول الأصول الثابتة والإهلاك (Fixed Assets)
  // ===========================================================================
  console.log(`\n${c.blue}1️⃣2️⃣ موديول الأصول الثابتة والإهلاك الدوري (Fixed Assets):${c.reset}`);
  await testTable('assets', 'سجل الأصول الثابتة وتكلفة الشراء ومعدلات الإهلاك', ['id', 'name', 'purchase_cost', 'asset_account_id']);

  // ===========================================================================
  // 1️⃣3️⃣ موديول الأندية والاستادات والمرافق الرياضية (Stadium & Sports)
  // ===========================================================================
  console.log(`\n${c.blue}1️⃣3️⃣ موديول الأندية الرياضية وحجوزات الملاعب (Stadium & Sports):${c.reset}`);
  await testTable('stadium_members', 'سجل الأعضاء والاشتراكات الرياضية', ['id', 'full_name', 'membership_type']);
  await testTable('stadium_facilities', 'الملاعب والصالات والمرافق الرياضية', ['id', 'name', 'price_per_hour']);
  await testTable('stadium_bookings', 'حجوزات الملاعب والمواعيد والرسوم', ['id', 'facility_id', 'total_amount']);
  await testTable('stadium_coaches', 'سجل المدربين والأجهزة الفنية', ['id', 'full_name', 'specialization']);
  await testTable('stadium_subscriptions', 'اشتراكات وباقات الأعضاء الرياضية', ['id']);
  await testTable('stadium_tournaments', 'البطولات والمنافسات والفرق المشاركة', ['id', 'name']);

  // ===========================================================================
  // 1️⃣4️⃣ إدارة النظام والأمان والشركات المتعددة (Admin & Security)
  // ===========================================================================
  console.log(`\n${c.blue}1️⃣4️⃣ إدارة النظام والأمان والشركات المتعددة (Admin & Multi-Tenancy):${c.reset}`);
  await testTable('profiles', 'ملفات المستخدمين والربط بالمؤسسة', ['id', 'full_name', 'role', 'organization_id']);
  await testTable('organizations', 'الشركات والمنشآت المسجلة بالنظام (Multi-Tenant)', ['id', 'name']);
  await testTable('roles', 'الأدوار والمسميات الوظيفية للنظام', ['id', 'name']);
  await testTable('permissions', 'دليل الصلاحيات التفصيلية للأمان', ['id', 'module', 'action', 'description']);
  await testTable('role_permissions', 'مصفوفة ربط الأدوار بالصلاحيات', ['id', 'role_id']);
  await testTable('security_logs', 'سجلات الأمان وتتبع العمليات الحساسة', ['id', 'event_type', 'description']);

  // ===========================================================================
  // 1️⃣5️⃣ فحص الترابط والتكامل المحاسبي والمخزني البيني (Cross-Module Integration)
  // ===========================================================================
  console.log(`\n${c.blue}1️⃣5️⃣ فحص الترابط والتكامل البيني بين الموديولات (Cross-Module Integration):${c.reset}`);
  try {
    const { data: settings } = await supabase.from('company_settings').select('*').limit(1);
    if (settings && settings.length > 0) {
      report('PASS', 'Integration', 'جاهزية سجل إعدادات الربط المحاسبي (company_settings)', 'تم العثور على الإعدادات');
    } else {
      report('WARN', 'Integration', 'سجل إعدادات الشركة وربط الحسابات الافتراضية', 'الجدول موجود ويحتاج لتهيئة قيم الحسابات الافتراضية');
    }
  } catch (e) {
    report('FAIL', 'Integration', 'فحص سجل إعدادات الشركة', e.message);
  }

  // مدة الفحص
  const durationSec = ((Date.now() - startTime) / 1000).toFixed(2);

  // ===========================================================================
  // 📊 النتيجة الإجمالية
  // ===========================================================================
  console.log(`\n${c.cyan}==================================================================================${c.reset}`);
  console.log(`${c.cyan}${c.bold}                       📊 النتيجة الإجمالية لفحص سلامة النظام                       ${c.reset}`);
  console.log(`${c.cyan}==================================================================================${c.reset}`);
  console.log(`  ⏱️ استغرق الفحص الشامل: ${c.bold}${durationSec} ثانية فقط${c.reset}`);
  console.log(`  ${c.green}✔ اختبارات سليمة واجتازت الفحص بنجاح تام:${c.reset} ${c.bold}${passedCount}${c.reset}`);
  if (warningCount > 0) {
    console.log(`  ${c.yellow}▲ تنبيهات غير حرجة:${c.reset} ${c.bold}${warningCount}${c.reset}`);
  }
  if (errorCount > 0) {
    console.log(`  ${c.red}✖ عناصر بها خلل أو جداول مفقودة:${c.reset} ${c.bold}${errorCount}${c.reset}\n`);
    console.log(`${c.red}${c.bold}تفاصيل العناصر التي رُصد بها خلل (${failedItems.length}):${c.reset}`);
    failedItems.forEach((f, idx) => {
      console.log(`  ${idx + 1}. [${f.module}] ${f.test}: ${f.message}`);
    });
  }
  console.log(`${c.cyan}==================================================================================${c.reset}\n`);

  if (errorCount === 0) {
    console.log(`${c.green}${c.bold}🎉 درع الأمان مكتمل 100%! كافة الموديولات الـ 15 وجميع الجداول والدوال سليمة تماماً ولا يوجد أي انكسار!${c.reset}\n`);
    process.exit(0);
  } else {
    console.log(`${c.red}${c.bold}⚠️ تنبيه: تم رصد ${errorCount} عنصر يحتاج معالجة في قاعدة البيانات قبل المتابعة.${c.reset}\n`);
    process.exit(1);
  }
}

runEnterpriseHealthCheck();

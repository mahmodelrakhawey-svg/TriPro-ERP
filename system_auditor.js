/**
 * مدقق النظام الشامل (System Auditor)
 * يقوم بفحص جميع ملفات المشروع بحثاً عن مشاكل التوافق مع التحديثات الأخيرة
 */

import fs from 'fs';
import path from 'path';

// --- إعدادات الفحص ---
const IGNORE_DIRS = ['node_modules', '.git', 'dist', 'build', '.next', '.vscode'];
const FILE_EXTENSIONS = ['.ts', '.tsx', '.js', '.sql'];

// قائمة "الألغام" التي نبحث عنها (Patterns to avoid)
const RED_FLAGS = [
    // 1. أكواد حسابات قديمة (تم استبدالها في الدليل الجديد)
    { pattern: /['"]2105['"]/, label: 'كود حساب قديم (2105 - ضريبة قديمة)', severity: 'HIGH' },
    { pattern: /['"]6101['"]/, label: 'كود حساب قديم (6101 - مصروفات قديمة)', severity: 'HIGH' },
    { pattern: /['"]1204['"]/, label: 'كود حساب قديم (1204)', severity: 'MEDIUM' },
    
    // 2. جداول أو أعمدة قديمة
    { pattern: /company_settings(?!_view)/, label: 'استخدام جدول company_settings مباشرة (يجب استخدام الـ View)', severity: 'MEDIUM' },
    
    // 3. تريغرز قديمة قد تسبب تضارب
    { pattern: /trigger_auto_sales_gl/, label: 'تريجر مبيعات قديم (قد يسبب تكرار)', severity: 'HIGH' },
    { pattern: /handle_new_purchase/, label: 'تريجر مشتريات قديم', severity: 'HIGH' },

    // 4. ممارسات برمجية خطرة
    { pattern: /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i, label: 'معرف UUID ثابت في الكود (Hardcoded UUID)', severity: 'LOW' } // تحذير فقط، أحياناً يكون ضرورياً في ملفات SQL
];

let issuesFound = 0;

function scanDirectory(directory) {
    const files = fs.readdirSync(directory);

    files.forEach(file => {
        const fullPath = path.join(directory, file);
        const stat = fs.statSync(fullPath);

        if (stat.isDirectory()) {
            if (!IGNORE_DIRS.includes(file)) {
                scanDirectory(fullPath);
            }
        } else {
            if (FILE_EXTENSIONS.some(ext => fullPath.endsWith(ext))) {
                // استثناء ملف الفحص نفسه وملفات الإصلاح المعتمدة
                if (file === 'system_auditor.js' || file.includes('emergency_fix')) return;
                
                checkFile(fullPath);
            }
        }
    });
}

function checkFile(filePath) {
    const content = fs.readFileSync(filePath, 'utf8');
    const relativePath = path.relative('./', filePath);
    
    RED_FLAGS.forEach(flag => {
        if (flag.pattern.test(content)) {
            // فلترة ذكية: تجاهل الـ UUIDs في ملفات SQL لأنها طبيعية هناك
            if (flag.label.includes('UUID') && filePath.endsWith('.sql')) return;

            console.log(`\x1b[31m[${flag.severity}] ${flag.label}\x1b[0m`);
            console.log(`    الملف: ${relativePath}`);
            
            // عرض السطر
            const lines = content.split('\n');
            lines.forEach((line, idx) => {
                if (flag.pattern.test(line)) {
                    console.log(`    سطر ${idx + 1}: ${line.trim().substring(0, 80)}...`);
                }
            });
            console.log('--------------------------------------------------');
            issuesFound++;
        }
    });
}

console.log('\n🔍 بدء الفحص الشامل للنظام...\n');
scanDirectory('./');

if (issuesFound === 0) {
    console.log('\n✅ ممتاز! النظام نظيف تماماً ولم يتم العثور على مشاكل واضحة.');
} else {
    console.log(`\n⚠️ تم العثور على ${issuesFound} مشكلة محتملة. يرجى مراجعتها.`);
}

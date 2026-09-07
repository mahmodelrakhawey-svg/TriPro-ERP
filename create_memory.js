/**
 * سكربت إنشاء ذاكرة المشروع للذكاء الاصطناعي
 * يقوم هذا الملف بجمع هيكل المشروع والملفات الهامة في ملف واحد
 * ليسهل على الـ AI فهم المشروع عند بدء محادثة جديدة.
 */

import fs from 'fs';
import path from 'path';

const OUTPUT_FILE = 'AI_MEMORY.md';

// المجلدات التي نريد توثيق هيكلها (لمعرفة الملفات الموجودة)
const DIRS_TO_SCAN = ['modules', 'components', 'services', 'context', 'types'];

// الملفات التي نريد حفظ محتواها كاملاً (لأنها تحتوي على المنطق الأساسي وقاعدة البيانات)
const CRITICAL_FILES = [
    'package.json',
    'App.tsx',
    'services/emergency_fix_all_visibility_v2.sql', // ملف قاعدة البيانات الأساسي
    'context/AccountingContext.tsx', // ملف الحالة العامة (إذا وجد)
    'types/index.ts' // ملف التعريفات (إذا وجد)
];

let content = `# 🧠 ذاكرة المشروع (AI Project Context)\n`;
content += `📅 تاريخ التحديث: ${new Date().toLocaleString('ar-EG')}\n`;
content += `ℹ️ تعليمات للذكاء الاصطناعي: هذا الملف يحتوي على هيكل المشروع الحالي وأهم الأكواد. استخدمه كمرجع قبل اقتراح أي كود جديد لتجنب التكرار.\n\n`;

// 1. توثيق هيكل الملفات
content += `## 1. هيكل الملفات والمجلدات (File Structure)\n`;
content += `(هذه الملفات موجودة بالفعل، لا تقم بإنشائها مرة أخرى)\n\n\`\`\`text\n`;

function scanDirectory(dir, depth = 0) {
    const indent = '  '.repeat(depth);
    try {
        const items = fs.readdirSync(dir);
        items.forEach(item => {
            const fullPath = path.join(dir, item);
            const stat = fs.statSync(fullPath);
            
            if (stat.isDirectory()) {
                content += `${indent}📁 ${item}/\n`;
                scanDirectory(fullPath, depth + 1);
            } else {
                content += `${indent}📄 ${item}\n`;
            }
        });
    } catch (e) {
        // تجاهل الأخطاء في حال المجلد غير موجود
    }
}

DIRS_TO_SCAN.forEach(dir => {
    if (fs.existsSync(dir)) {
        content += `📁 ${dir}/\n`;
        scanDirectory(dir, 1);
    }
});
content += `\`\`\`\n\n`;

// 2. توثيق محتوى الملفات الهامة
content += `## 2. محتوى الملفات الحيوية (Critical Files Content)\n`;

CRITICAL_FILES.forEach(filePath => {
    if (fs.existsSync(filePath)) {
        content += `\n### 📄 ${filePath}\n\`\`\`typescript\n`;
        content += fs.readFileSync(filePath, 'utf8');
        content += `\n\`\`\`\n`;
    }
});

fs.writeFileSync(OUTPUT_FILE, content);
console.log(`\n✅ تم إنشاء ملف الذاكرة بنجاح: ${OUTPUT_FILE}`);
console.log(`💡 نصيحة: في بداية كل جلسة جديدة، افتح هذا الملف واطلب مني قراءته.`);

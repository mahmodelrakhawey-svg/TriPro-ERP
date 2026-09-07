/**
 * أداة البحث الشامل في ملفات المشروع
 * طريقة الاستخدام:
 * 1. ضع هذا الملف في المجلد الرئيسي للمشروع
 * 2. افتح التيرمينال واكتب: node search_tool.js
 */

import fs from 'fs';
import path from 'path';

// --- إعدادات البحث ---
const SEARCH_TERM = 'company_settings'; // <-- اكتب الكلمة التي تريد البحث عنها هنا
const IGNORE_DIRS = ['node_modules', '.git', 'dist', 'build', '.next']; // مجلدات نتجاهلها
const FILE_EXTENSIONS = ['.ts', '.tsx', '.js', '.sql', '.css']; // أنواع الملفات التي نبحث فيها

// -------------------

function searchInDirectory(directory) {
    try {
        const files = fs.readdirSync(directory);

        files.forEach(file => {
            const fullPath = path.join(directory, file);
            const stat = fs.statSync(fullPath);

            if (stat.isDirectory()) {
                if (!IGNORE_DIRS.includes(file)) {
                    searchInDirectory(fullPath); // تكرار العملية داخل المجلدات (Recursion)
                }
            } else {
                // التأكد من امتداد الملف
                if (FILE_EXTENSIONS.some(ext => fullPath.endsWith(ext))) {
                    const content = fs.readFileSync(fullPath, 'utf8');
                    if (content.includes(SEARCH_TERM)) {
                        console.log(`\x1b[32m[موجود]\x1b[0m في الملف: ${fullPath}`);
                        
                        // (اختياري) عرض السطر الذي وجدت فيه الكلمة
                        const lines = content.split('\n');
                        lines.forEach((line, index) => {
                            if (line.includes(SEARCH_TERM)) {
                                console.log(`    سطر ${index + 1}: ${line.trim().substring(0, 100)}...`);
                            }
                        });
                        console.log('--------------------------------------------------');
                    }
                }
            }
        });
    } catch (error) {
        console.error(`خطأ في قراءة المجلد ${directory}:`, error.message);
    }
}

console.log(`\nجارٍ البحث عن كلمة: "${SEARCH_TERM}" في جميع ملفات المشروع...\n`);
searchInDirectory('./'); // ابدأ من المجلد الحالي
console.log('\nانتهى البحث.');

// c:\Users\HP\Desktop\alrakhawe pro erp 7\update-memory.js

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// اسم الملف الناتج
const outputFile = path.join(process.cwd(), 'AI_MEMORY.md');

// المجلدات التي سيتم مسح هيكلها (Tree Structure)
const structureFolders = ['modules', 'components', 'services', 'context'];

// الملفات التي سيتم تضمين محتواها بالكامل (Critical Files)
const criticalFiles = [
    'package.json',
    'App.tsx',
    'context/AccountingContext.tsx',
    'supabaseClient.ts'
];

function generateTree(dir, prefix = '') {
    let output = '';
    if (!fs.existsSync(dir)) return output;

    const items = fs.readdirSync(dir, { withFileTypes: true });
    
    // ترتيب: المجلدات أولاً ثم الملفات
    items.sort((a, b) => {
        if (a.isDirectory() && !b.isDirectory()) return -1;
        if (!a.isDirectory() && b.isDirectory()) return 1;
        return a.name.localeCompare(b.name);
    });

    for (const item of items) {
        // تجاهل الملفات غير المرغوب فيها
        if (item.name.startsWith('.') || item.name === 'node_modules' || item.name === 'dist') continue;
        
        if (item.isDirectory()) {
            output += `${prefix}📁 ${item.name}/\n`;
            output += generateTree(path.join(dir, item.name), prefix + '  ');
        } else {
            output += `${prefix}📄 ${item.name}\n`;
        }
    }
    return output;
}

function generateMemoryFile() {
    console.log('🔄 جاري تحديث ملف الذاكرة...');
    
    let content = `# 🧠 ذاكرة المشروع (AI Project Context)\n`;
    content += `📅 تاريخ التحديث: ${new Date().toLocaleString('ar-EG')}\n`;
    content += `ℹ️ تعليمات للذكاء الاصطناعي: هذا الملف يحتوي على هيكل المشروع الحالي وأهم الأكواد. استخدمه كمرجع قبل اقتراح أي كود جديد لتجنب التكرار.\n\n`;

    // 1. قسم هيكل الملفات
    content += `## 1. هيكل الملفات والمجلدات (File Structure)\n`;
    content += `(هذه الملفات موجودة بالفعل، لا تقم بإنشائها مرة أخرى)\n\n`;
    content += '```text\n';
    
    for (const folder of structureFolders) {
        if (fs.existsSync(folder)) {
            content += `📁 ${folder}/\n`;
            content += generateTree(folder, '  ');
        }
    }
    content += '```\n\n';

    // 2. قسم محتوى الملفات الحيوية
    content += `## 2. محتوى الملفات الحيوية (Critical Files Content)\n\n`;

    for (const file of criticalFiles) {
        if (fs.existsSync(file)) {
            const ext = path.extname(file).substring(1);
            const lang = ext === 'json' ? 'json' : (ext === 'tsx' || ext === 'ts' ? 'typescript' : 'text');
            
            content += `### 📄 ${file}\n`;
            content += '```' + lang + '\n';
            content += fs.readFileSync(file, 'utf-8');
            content += '\n```\n\n';
        }
    }

    fs.writeFileSync(outputFile, content);
    console.log(`✅ تم تحديث ملف الذاكرة بنجاح: ${outputFile}`);
}

generateMemoryFile();

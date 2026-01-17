/// <reference types="vite/client" />
import { createClient } from '@supabase/supabase-js';

// قراءة المفاتيح من ملف البيئة (.env)
let supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
let supabaseKey = import.meta.env.VITE_SUPABASE_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY;

// تنظيف القيم من أي علامات تنصيص زائدة أو مسافات (قد تحدث بسبب خطأ في ملف .env)
if (supabaseUrl) supabaseUrl = supabaseUrl.replace(/["']/g, "").trim();
if (supabaseKey) supabaseKey = supabaseKey.replace(/["']/g, "").trim();

// طباعة حالة المتغيرات للمساعدة في التشخيص (بدون طباعة القيم الحساسة)
console.log('Supabase Config Status:', {
    hasUrl: !!supabaseUrl,
    hasKey: !!supabaseKey,
    mode: import.meta.env.MODE
});

// التأكد من وجود المفاتيح قبل إنشاء الاتصال
if (!supabaseUrl || !supabaseKey) {
    throw new Error("Supabase URL and Key must be defined in the .env file");
}

export const supabase = createClient(supabaseUrl, supabaseKey);
/// <reference types="vite/client" />
import { createClient } from '@supabase/supabase-js';

// قراءة المفاتيح من ملف البيئة (.env)
let supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
let supabaseKey = import.meta.env.VITE_SUPABASE_KEY;

// تنظيف القيم من أي علامات تنصيص زائدة أو مسافات (قد تحدث بسبب خطأ في ملف .env)
if (supabaseUrl) supabaseUrl = supabaseUrl.replace(/["']/g, "").trim();
if (supabaseKey) supabaseKey = supabaseKey.replace(/["']/g, "").trim();

// التأكد من وجود المفاتيح قبل إنشاء الاتصال
if (!supabaseUrl || !supabaseKey) {
    throw new Error("Supabase URL and Key must be defined in the .env file");
}

export const supabase = createClient(supabaseUrl, supabaseKey);
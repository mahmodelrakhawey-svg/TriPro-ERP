/// <reference types="vite/client" />
import { createClient } from '@supabase/supabase-js';

// قراءة المفاتيح من ملف البيئة (.env)
let supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
let supabaseKey = import.meta.env.VITE_SUPABASE_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY;

// تنظيف القيم وتصحيح الرابط تلقائياً
if (supabaseUrl) {
  supabaseUrl = supabaseUrl.replace(/["']/g, "").trim();
  
  // معالجة إذا تم لصق رابط لوحة التحكم بدلاً من رابط الـ API
  // https://supabase.com/dashboard/project/abcdefgh... -> https://abcdefgh....supabase.co
  const dashboardMatch = supabaseUrl.match(/supabase\.com\/dashboard\/project\/([a-zA-Z0-9_-]+)/i);
  if (dashboardMatch) {
    supabaseUrl = `https://${dashboardMatch[1]}.supabase.co`;
  }
  
  // إزالة أي شرطات مائلة في النهاية أو مسارات مضافة بالخطأ
  supabaseUrl = supabaseUrl.replace(/\/+$/, "");
  supabaseUrl = supabaseUrl.replace(/\/(rest|auth)\/v1\/?$/i, "");
  
  // التأكد من البروتوكول
  if (!supabaseUrl.startsWith('http://') && !supabaseUrl.startsWith('https://')) {
    supabaseUrl = `https://${supabaseUrl}`;
  }
}

if (supabaseKey) supabaseKey = supabaseKey.replace(/["']/g, "").trim();

// التأكد من وجود المفاتيح قبل إنشاء الاتصال
if (!supabaseUrl || !supabaseKey) {
    throw new Error("Supabase URL and Key must be defined in the .env file");
}

export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true
  }
});

export { supabaseUrl };
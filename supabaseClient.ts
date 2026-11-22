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

// ✅ كشف بيئة Electron لتعطيل الميزات غير المدعومة
const isElectron = typeof navigator !== 'undefined' && navigator.userAgent.toLowerCase().includes('electron');

// 🛡️ مهلة الاتصال الذكية للطلبات لحماية أجهزة المصانع والفروع من التعليق اللانهائي عند تذبذب الإنترنت
const NETWORK_TIMEOUT_MS = 35000; // 35 ثانية كحد أقصى للعمليات الحساسة

const resilientFetch: typeof fetch = async (input, init) => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    controller.abort();
  }, NETWORK_TIMEOUT_MS);

  // ربط الـ signal الممرر مسبقاً إن وجد
  if (init?.signal) {
    if (init.signal.aborted) {
      clearTimeout(timeoutId);
      controller.abort();
    } else {
      init.signal.addEventListener('abort', () => {
        clearTimeout(timeoutId);
        controller.abort();
      });
    }
  }

  try {
    const response = await fetch(input, {
      ...init,
      signal: controller.signal
    });
    return response;
  } catch (error: any) {
    if (error?.name === 'AbortError' && controller.signal.aborted && !init?.signal?.aborted) {
      const timeoutError = new Error('انتهت مهلة استجابة الخادم بسبب بطء شبكة الإنترنت (35 ثانية). يرجى التحقق من جودة الاتصال والمحاولة مجدداً.');
      timeoutError.name = 'TimeoutError';
      throw timeoutError;
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
};

export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    // ✅ في Electron لا نستخدم detectSessionInUrl ولا LockManager
    detectSessionInUrl: !isElectron,
    // ✅ إصلاح خطأ "LockManager null lock" في Electron
    lock: isElectron
      ? async <R>(name: string, acquireTimeout: number, fn: () => Promise<R>): Promise<R> => {
          // Electron لا يدعم Web Locks API — نشغّل الدالة مباشرة بدون lock
          return await fn();
        }
      : undefined,
  },
  global: {
    fetch: resilientFetch
  }
});

export { supabaseUrl };
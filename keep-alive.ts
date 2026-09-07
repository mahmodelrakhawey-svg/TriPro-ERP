import { supabase } from './supabaseClient';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import nodemailer from 'nodemailer';

/**
 * وظيفة مجدولة (Cron Job) تعمل يومياً لمنع توقف قاعدة البيانات.
 * تقوم أيضاً بتسجيل العملية في سجلات النظام للمراجعة.
 */
export default async function handler(
  request: VercelRequest,
  response: VercelResponse,
) {
  try {
    // 1. إرسال استعلام بسيط لإبقاء القاعدة نشطة
    const { error } = await supabase.from('company_settings').select('id').limit(1);
    if (error) throw error;

    // 2. تسجيل نجاح العملية في سجلات الأمان (لتراها داخل البرنامج)
    await supabase.from('security_logs').insert({
        event_type: 'SYSTEM_PING',
        description: '✅ تم تنفيذ الفحص اليومي التلقائي (Cron Job) بنجاح',
        created_at: new Date().toISOString(),
        performed_by: null // عملية نظام (بدون مستخدم)
    });

    response.status(200).json({ success: true, message: 'Database pinged and logged successfully.' });
  } catch (error: any) {
    if (process.env.NODE_ENV === 'development') console.error('Cron Job Error:', error);

    // محاولة إرسال إيميل تنبيه عند الفشل
    if (process.env.SMTP_EMAIL && process.env.SMTP_PASSWORD) {
      try {
        const transporter = nodemailer.createTransport({
          service: 'gmail', // يمكنك تغيير هذا إذا كنت تستخدم مزود آخر
          auth: { user: process.env.SMTP_EMAIL, pass: process.env.SMTP_PASSWORD }
        });
        
        await transporter.sendMail({
          from: process.env.SMTP_EMAIL,
          to: process.env.ALERT_EMAIL || process.env.SMTP_EMAIL, // إرسال لنفس الإيميل أو إيميل مخصص
          subject: '🚨 تنبيه هام: فشل Cron Job في TriPro ERP',
          text: `حدث خطأ أثناء محاولة تنشيط قاعدة البيانات:\n\n${error.message}\n\nيرجى مراجعة سجلات Vercel فوراً.`
        });
      } catch (emailError) {
        console.error('Failed to send alert email:', emailError);
      }
    }

    response.status(500).json({ success: false, error: error.message });
  }
}
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL ?? '',
  // ⚠️ تحذير أمني: تم إزالة البادئة VITE_ لضمان عدم تسريب المفتاح للمتصفح
  // ملاحظة: هذا الكود سيعمل فقط إذا تم تنفيذه في بيئة Node.js (Backend)
  // أما إذا تم استدعاؤه من المتصفح فسيظهر المفتاح كـ undefined وهذا هو السلوك الآمن.
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
);

export const runOrphanedFilesCleanup = async () => {
  try {
    console.log('Starting automated orphaned files cleanup...');

    // 1. جلب كافة المسارات المسجلة في قاعدة البيانات
    const [jRes, rRes, pRes, cRes, orgRes] = await Promise.all([
      supabase.from('journal_attachments').select('file_path'),
      supabase.from('receipt_voucher_attachments').select('file_path'),
      supabase.from('payment_voucher_attachments').select('file_path'),
      supabase.from('cheque_attachments').select('file_path'),
      supabase.from('organizations').select('logo_url')
    ]);

    const dbPaths = new Set([
      ...(jRes.data?.map(a => a.file_path) || []),
      ...(rRes.data?.map(a => a.file_path) || []),
      ...(pRes.data?.map(a => a.file_path) || []),
      ...(cRes.data?.map(a => a.file_path) || []),
      ...(orgRes.data?.map(o => o.logo_url?.split('/').pop()).filter(Boolean) || [])
    ]);

    // 2. فحص حاوية المستندات (documents)
    const { data: storageFiles } = await supabase.storage.from('documents').list();
    const orphanedDocs = storageFiles
      ?.filter(f => f.name !== '.emptyKeep' && !dbPaths.has(f.name))
      .map(f => f.name) || [];

    if (orphanedDocs.length > 0) {
      console.log(`Deleting ${orphanedDocs.length} orphaned files...`);
      await supabase.storage.from('documents').remove(orphanedDocs);
    }

    // 3. تسجيل العملية في سجلات الأمان للتوثيق
    await supabase.from('security_logs').insert({
      event_type: 'automated_cleanup',
      description: `تم تنظيف ${orphanedDocs.length} ملف يتيم تلقائياً بنجاح ✅`,
      metadata: { deleted_count: orphanedDocs.length }
    });

    return { success: true, deleted: orphanedDocs.length };

  } catch (error: any) {
    console.error('Cleanup Error:', error);
    return { success: false, error: error.message };
  }
};
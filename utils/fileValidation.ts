/**
 * File Upload Security Validator
 * نظام التحقق الأمني من المرفقات والملفات المرفوعة لحماية النظام من:
 * 1. رفع الملفات الخبيثة (Malicious File Uploads)
 * 2. ثغرات الـ Stored XSS عبر ملفات HTML أو SVG
 * 3. ثغرات التلاعب بالمسارات (Path Traversal)
 */

export const ALLOWED_DOCUMENT_EXTENSIONS = ['pdf', 'png', 'jpg', 'jpeg', 'webp'] as const;
export const ALLOWED_IMAGE_EXTENSIONS = ['png', 'jpg', 'jpeg', 'webp'] as const;

export const DANGEROUS_EXTENSIONS = [
  'html', 'htm', 'shtml', 'xhtml',
  'svg', 'xml',
  'exe', 'dll', 'bat', 'cmd', 'sh', 'bash', 'ps1', 'vbs', 'msi',
  'js', 'jsx', 'ts', 'tsx', 'php', 'phtml', 'py', 'pl', 'cgi', 'jar',
  'asp', 'aspx', 'jsp'
];

export interface FileValidationResult {
  valid: boolean;
  error?: string;
  cleanName?: string;
}

export function validateFileUpload(
  file: File,
  options?: {
    maxSizeMb?: number;
    allowOnlyImages?: boolean;
    allowedExtensions?: readonly string[];
  }
): FileValidationResult {
  const maxSizeMb = options?.maxSizeMb || 20;
  const maxSizeBytes = maxSizeMb * 1024 * 1024;

  if (!file) {
    return { valid: false, error: 'لم يتم تحديد أي ملف.' };
  }

  // 1. فحص الحجم الأقصى والأدنى
  if (file.size > maxSizeBytes) {
    return { 
      valid: false, 
      error: `حجم الملف (${(file.size / (1024 * 1024)).toFixed(1)} ميجابايت) يتجاوز الحد الأقصى المسموح به (${maxSizeMb} ميجابايت).` 
    };
  }

  if (file.size === 0) {
    return { valid: false, error: 'الملف المختار فارغ (0 بايت).' };
  }

  // 2. استخراج الامتداد وفحصه
  const parts = file.name.split('.');
  if (parts.length < 2) {
    return { valid: false, error: 'اسم الملف غير صالح ويفتقر إلى امتداد واضح.' };
  }

  const ext = (parts.pop() || '').toLowerCase().trim();

  // 3. حظر الامتدادات الخطرة قطعياً
  if (DANGEROUS_EXTENSIONS.includes(ext)) {
    return { 
      valid: false, 
      error: `امتداد الملف (.${ext}) محظور تماماً لأسباب أمنية. يرجى رفع مستندات بتنسيق PDF أو صور (PNG, JPG, WEBP) فقط.` 
    };
  }

  // 4. القائمة البيضاء (Whitelist)
  const allowed = options?.allowedExtensions || 
    (options?.allowOnlyImages ? ALLOWED_IMAGE_EXTENSIONS : ALLOWED_DOCUMENT_EXTENSIONS);

  if (!allowed.includes(ext as any)) {
    return { 
      valid: false, 
      error: `نوع الملف (.${ext}) غير مدعوم. الصيغ المسموحة هي: ${allowed.join(', ').toUpperCase()}` 
    };
  }

  // 5. تعقيم اسم الملف لمنع أي رموز خاصة أو تلاعب بالمسارات
  const baseName = parts.join('_').replace(/[^a-zA-Z0-9_\-\u0600-\u06FF]/g, '_');
  const cleanName = `${baseName || 'file'}.${ext}`;

  return { valid: true, cleanName };
}

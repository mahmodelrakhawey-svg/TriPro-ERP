import { supabase } from './supabaseClient';

export interface S3BackupSettings {
  s3_endpoint?: string;     // e.g. https://<account_id>.r2.cloudflarestorage.com or https://s3.us-east-1.amazonaws.com
  s3_bucket?: string;       // e.g. tripro-backups
  s3_access_key?: string;
  s3_secret_key?: string;
  s3_region?: string;       // e.g. auto or us-east-1
  s3_is_active?: boolean;
}

export interface OffsiteBackupResult {
  success: boolean;
  message: string;
  url?: string;
  backupId?: string;
  timestamp?: string;
  fileSizeKb?: number;
  error?: string;
}

/**
 * دالة مساعدة لتوليد توقيع AWS SigV4 خفيف الوزن بدون الحاجة لحزم SDK ضخمة
 */
async function hmacSha256(key: Uint8Array | string, data: string): Promise<Uint8Array> {
  const enc = new TextEncoder();
  const keyBytes = typeof key === 'string' ? enc.encode(key) : key;
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    keyBytes as unknown as BufferSource,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = await crypto.subtle.sign('HMAC', cryptoKey, enc.encode(data) as unknown as BufferSource);
  return new Uint8Array(signature);
}

async function sha256Hex(data: string | Uint8Array): Promise<string> {
  const enc = new TextEncoder();
  const bytes = typeof data === 'string' ? enc.encode(data) : data;
  const hash = await crypto.subtle.digest('SHA-256', bytes as unknown as BufferSource);
  return Array.from(new Uint8Array(hash))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

export const offsiteBackupService = {
  /**
   * اختبار الاتصال بمستودع S3 / Cloudflare R2
   */
  async testConnection(settings: S3BackupSettings): Promise<{ success: boolean; message: string }> {
    try {
      if (!settings.s3_endpoint || !settings.s3_bucket || !settings.s3_access_key || !settings.s3_secret_key) {
        return {
          success: false,
          message: 'يرجى إدخال جميع بيانات مستودع S3 (Endpoint, Bucket, Access Key, Secret Key).'
        };
      }

      // اختبار فحص بسيط برفع ملف تحقق تجريبي .healthcheck
      const testContent = `TriPro S3 Ping @ ${new Date().toISOString()}`;
      const uploadRes = await this.uploadRawPayload(
        settings,
        '.healthcheck.txt',
        testContent,
        'text/plain'
      );

      if (uploadRes.success) {
        return {
          success: true,
          message: 'تم الاتصال بمستودع S3 / R2 بنجاح والتحقق من صلاحية الكتابة ✅'
        };
      } else {
        return {
          success: false,
          message: uploadRes.error || 'فشل الاتصال بمستودع S3'
        };
      }
    } catch (e: any) {
      return {
        success: false,
        message: e?.message || 'خطأ في فحص الاتصال الخارجي'
      };
    }
  },

  /**
   * رفع بيانات النسخة الاحتياطية مباشرة إلى S3
   */
  async uploadRawPayload(
    settings: S3BackupSettings,
    fileName: string,
    content: string,
    contentType = 'application/json'
  ): Promise<OffsiteBackupResult> {
    try {
      const endpoint = settings.s3_endpoint!.replace(/\/$/, '');
      const bucket = settings.s3_bucket!;
      const region = settings.s3_region || 'us-east-1';
      const accessKey = settings.s3_access_key!;
      const secretKey = settings.s3_secret_key!;

      const enc = new TextEncoder();
      const contentBytes = enc.encode(content);
      const payloadHash = await sha256Hex(contentBytes);

      const now = new Date();
      const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, ''); // YYYYMMDDTHHMMSSZ
      const dateStamp = amzDate.slice(0, 8); // YYYYMMDD

      const host = new URL(endpoint).host;
      const canonicalUri = `/${bucket}/${encodeURIComponent(fileName)}`;

      // Headers
      const headers: Record<string, string> = {
        'host': host,
        'x-amz-date': amzDate,
        'x-amz-content-sha256': payloadHash,
        'content-type': contentType
      };

      const sortedHeaderKeys = Object.keys(headers).sort();
      const canonicalHeaders = sortedHeaderKeys.map(k => `${k}:${headers[k]}\n`).join('');
      const signedHeaders = sortedHeaderKeys.join(';');

      const canonicalRequest = [
        'PUT',
        canonicalUri,
        '', // query string
        canonicalHeaders,
        signedHeaders,
        payloadHash
      ].join('\n');

      const credentialScope = `${dateStamp}/${region}/s3/aws4_request`;
      const stringToSign = [
        'AWS4-HMAC-SHA256',
        amzDate,
        credentialScope,
        await sha256Hex(canonicalRequest)
      ].join('\n');

      // Key derivation
      const kDate = await hmacSha256(`AWS4${secretKey}`, dateStamp);
      const kRegion = await hmacSha256(kDate, region);
      const kService = await hmacSha256(kRegion, 's3');
      const kSigning = await hmacSha256(kService, 'aws4_request');
      const signatureBytes = await hmacSha256(kSigning, stringToSign);
      const signatureHex = Array.from(signatureBytes).map(b => b.toString(16).padStart(2, '0')).join('');

      const authorizationHeader = `AWS4-HMAC-SHA256 Credential=${accessKey}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signatureHex}`;

      const targetUrl = `${endpoint}${canonicalUri}`;

      const response = await fetch(targetUrl, {
        method: 'PUT',
        headers: {
          ...headers,
          'Authorization': authorizationHeader
        },
        body: contentBytes
      });

      if (response.ok) {
        return {
          success: true,
          message: 'تم رفع النسخة الاحتياطية إلى S3 الخارجي بنجاح',
          url: targetUrl,
          timestamp: now.toISOString(),
          fileSizeKb: Math.round(contentBytes.byteLength / 1024)
        };
      } else {
        const errText = await response.text();
        return {
          success: false,
          message: `فشل الرفع إلى S3 (${response.status})`,
          error: errText
        };
      }
    } catch (e: any) {
      return {
        success: false,
        message: 'خطأ أثناء الرفع إلى التخزين الخارجي',
        error: e?.message || String(e)
      };
    }
  },

  /**
   * إنشاء نسخة احتياطية محلية ثم تصديرها فوراً إلى S3 الخارجي
   */
  async createAndExportOffsiteBackup(orgId: string, customSettings?: S3BackupSettings): Promise<OffsiteBackupResult> {
    try {
      // 1. استخراج إعدادات S3
      let settings = customSettings;
      if (!settings) {
        const { data: cSettings } = await supabase
          .from('company_settings')
          .select('*')
          .eq('organization_id', orgId)
          .maybeSingle();

        if (cSettings) {
          settings = {
            s3_endpoint: cSettings.s3_endpoint,
            s3_bucket: cSettings.s3_bucket,
            s3_access_key: cSettings.s3_access_key,
            s3_secret_key: cSettings.s3_secret_key,
            s3_region: cSettings.s3_region || 'us-east-1',
            s3_is_active: cSettings.s3_is_active
          };
        }
      }

      if (!settings || !settings.s3_endpoint || !settings.s3_bucket) {
        return {
          success: false,
          message: 'إعدادات النسخ الاحتياطي الخارجي (S3) غير مكتملة في إعدادات المنشأة.'
        };
      }

      // 2. إنشاء نسخة احتياطية من قاعدة البيانات عبر الـ RPC الرسمي
      const { data: backupId, error: rpcErr } = await supabase.rpc('create_organization_backup', {
        p_org_id: orgId
      });

      if (rpcErr || !backupId) {
        throw new Error('فشل إنشاء النسخة الاحتياطية في قاعدة البيانات: ' + (rpcErr?.message || ''));
      }

      // 3. جلب محتوى الـ JSON الخاص بهذه النسخة
      const { data: backupRecord, error: fetchErr } = await supabase
        .from('organization_backups')
        .select('backup_data, created_at')
        .eq('id', backupId)
        .single();

      if (fetchErr || !backupRecord) {
        throw new Error('تعذر قراءة محتوى النسخة الاحتياطية المولدة');
      }

      const jsonString = typeof backupRecord.backup_data === 'string'
        ? backupRecord.backup_data
        : JSON.stringify(backupRecord.backup_data);

      const timestamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
      const fileName = `tripro_backup_${orgId.slice(0, 8)}_${timestamp}.json`;

      // 4. رفع الملف إلى S3
      const uploadRes = await this.uploadRawPayload(settings, fileName, jsonString, 'application/json');

      if (uploadRes.success) {
        // تحديث سجل النسخة الاحتياطية بملاحظة الرفع الخارجي
        try {
          await supabase
            .from('organization_backups')
            .update({
              notes: `Off-site S3 Backup Uploaded: ${uploadRes.url}`
            })
            .eq('id', backupId);
        } catch (e) {}

        return {
          ...uploadRes,
          backupId
        };
      }

      return uploadRes;

    } catch (e: any) {
      return {
        success: false,
        message: 'فشلت عملية النسخ الاحتياطي الخارجي',
        error: e?.message || String(e)
      };
    }
  }
};

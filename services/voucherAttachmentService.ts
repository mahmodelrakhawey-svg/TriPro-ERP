import { supabase } from '../supabaseClient';
import { logger } from '../utils/logger';

export type VoucherAttachmentTable = 'payment_voucher_attachments' | 'receipt_voucher_attachments';

export interface UploadVoucherAttachmentsResult {
  uploadedCount: number;
  failedFiles: Array<{ name: string; error: string }>;
}

/**
 * Uploads voucher attachments in parallel and batch-inserts their metadata rows.
 */
export async function uploadVoucherAttachments(
  voucherId: string,
  attachments: File[],
  table: VoucherAttachmentTable
): Promise<UploadVoucherAttachmentsResult> {
  if (!voucherId || !attachments || attachments.length === 0) {
    return { uploadedCount: 0, failedFiles: [] };
  }

  const uploadResults = await Promise.all(
    attachments.map(async (file) => {
      const fileExt = file.name.split('.').pop();
      const fileName = `${voucherId}-${Date.now()}-${Math.random()}.${fileExt}`;
      const filePath = `vouchers/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('documents')
        .upload(filePath, file);

      if (uploadError) {
        logger.error('Upload failed:', uploadError);
        return { ok: false as const, name: file.name, error: uploadError.message };
      }

      return {
        ok: true as const,
        row: {
          voucher_id: voucherId,
          file_path: filePath,
          file_name: file.name,
          file_type: file.type,
          file_size: file.size,
        },
      };
    })
  );

  const failedFiles: Array<{ name: string; error: string }> = [];
  const rowsToInsert: Array<{
    voucher_id: string;
    file_path: string;
    file_name: string;
    file_type: string;
    file_size: number;
  }> = [];

  for (const res of uploadResults) {
    if (res.ok) {
      rowsToInsert.push(res.row);
    } else {
      failedFiles.push({ name: res.name, error: res.error });
    }
  }

  if (rowsToInsert.length > 0) {
    await supabase.from(table).insert(rowsToInsert);
  }

  return { uploadedCount: rowsToInsert.length, failedFiles };
}

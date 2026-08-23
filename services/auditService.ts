import { supabase } from '../supabaseClient';

export interface DocumentAuditLog {
    id: string | number;
    document_type: 'purchase_invoice' | 'sales_invoice' | 'payment_voucher' | 'receipt_voucher' | 'journal_entry';
    document_id: string;
    action: 'created' | 'updated' | 'posted' | 'unposted' | 'paid' | 'deleted' | 'printed';
    details?: any;
    user_id?: string;
    user_name?: string;
    created_at: string;
}

/**
 * 🛡️ تسجيل حركة جديدة في سجل التدقيق والتتبع للمستندات
 */
export const logDocumentAction = async ({
    documentType,
    documentId,
    action,
    details = {},
    userId,
    userName,
    organizationId
}: {
    documentType: DocumentAuditLog['document_type'];
    documentId: string;
    action: DocumentAuditLog['action'];
    details?: any;
    userId?: string;
    userName?: string;
    organizationId?: string;
}) => {
    if (!documentId) return;

    try {
        const actionLabel = getActionArabicLabel(action);
        const description = details?.note || `${actionLabel} (${documentId})`;

        const payload = {
            event_type: 'DOCUMENT_AUDIT',
            description: description,
            module: documentType,
            severity: 'info',
            metadata: {
                document_type: documentType,
                document_id: String(documentId),
                action: action,
                action_label: actionLabel,
                user_name: userName || 'مستخدم النظام',
                ...details
            },
            user_id: userId || null,
            created_at: new Date().toISOString()
        };

        await supabase.from('security_logs').insert([payload]);
    } catch (err) {
        console.warn('Silent notice: Failed to log document action to security_logs:', err);
    }
};

/**
 * 🕒 جلب السجل الزمني الكامل لمستند محدد
 */
export const getDocumentAuditTrail = async (
    documentType: string,
    documentId: string
): Promise<DocumentAuditLog[]> => {
    if (!documentId) return [];

    try {
        const { data, error } = await supabase
            .from('security_logs')
            .select('*')
            .eq('event_type', 'DOCUMENT_AUDIT')
            .eq('module', documentType)
            .order('created_at', { ascending: true });

        if (error) {
            return [];
        }

        const filtered = (data || []).filter((row: any) => {
            const metaDocId = row.metadata?.document_id;
            return metaDocId === String(documentId) || metaDocId === documentId;
        });

        return filtered.map((row: any) => ({
            id: row.id,
            document_type: row.metadata?.document_type || row.module,
            document_id: row.metadata?.document_id || documentId,
            action: row.metadata?.action || 'created',
            details: row.metadata,
            user_id: row.user_id,
            user_name: row.metadata?.user_name || 'مستخدم النظام',
            created_at: row.created_at
        }));
    } catch (err) {
        return [];
    }
};

export const getActionArabicLabel = (action: DocumentAuditLog['action']): string => {
    switch (action) {
        case 'created': return 'إنشاء المستند';
        case 'updated': return 'تعديل البيانات';
        case 'posted': return 'ترحيل محاسبي';
        case 'unposted': return 'إلغاء الترحيل';
        case 'paid': return 'سداد مالي';
        case 'printed': return 'طباعة المستند';
        case 'deleted': return 'حذف المستند';
        default: return action;
    }
};

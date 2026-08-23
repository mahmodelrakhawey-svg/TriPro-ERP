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
        const payload = {
            table_name: documentType,
            record_id: documentId,
            action: action,
            new_values: {
                ...details,
                user_name: userName || 'مستخدم النظام',
                action_label: getActionArabicLabel(action)
            },
            user_id: userId || null,
            created_at: new Date().toISOString()
        };

        const { error } = await supabase.from('audit_logs').insert([payload]);
        if (error) {
            // محاولة تخزين محلي آمن في حال عدم وجود الجدول
            console.warn('audit_logs insert warning:', error.message);
        }
    } catch (err) {
        console.warn('Failed to log document action to audit_logs:', err);
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
            .from('audit_logs')
            .select('*')
            .eq('table_name', documentType)
            .eq('record_id', documentId)
            .order('created_at', { ascending: true });

        if (error) {
            console.warn('Failed to fetch audit trail:', error);
            return [];
        }

        return (data || []).map((row: any) => ({
            id: row.id,
            document_type: row.table_name,
            document_id: row.record_id,
            action: row.action,
            details: row.new_values,
            user_id: row.user_id,
            user_name: row.new_values?.user_name || 'مستخدم النظام',
            created_at: row.created_at || row.timestamp
        }));
    } catch (err) {
        console.error('Error fetching audit trail:', err);
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

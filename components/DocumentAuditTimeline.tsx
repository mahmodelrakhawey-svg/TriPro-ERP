import React, { useState, useEffect } from 'react';
import { 
    Clock, Shield, CheckCircle2, Edit3, Printer, 
    CreditCard, ChevronDown, ChevronUp, User, History,
    Loader2, AlertCircle, Sparkles
} from 'lucide-react';
import { getDocumentAuditTrail, DocumentAuditLog, getActionArabicLabel } from '../services/auditService';

interface DocumentAuditTimelineProps {
    documentType: 'purchase_invoice' | 'sales_invoice' | 'payment_voucher' | 'receipt_voucher' | 'journal_entry';
    documentId?: string;
    documentCreatedAt?: string;
    creatorName?: string;
}

export const DocumentAuditTimeline: React.FC<DocumentAuditTimelineProps> = ({
    documentType,
    documentId,
    documentCreatedAt,
    creatorName
}) => {
    const [logs, setLogs] = useState<DocumentAuditLog[]>([]);
    const [loading, setLoading] = useState(false);
    const [isOpen, setIsOpen] = useState(false);

    useEffect(() => {
        if (!documentId) {
            setLogs([]);
            return;
        }

        const fetchLogs = async () => {
            setLoading(true);
            try {
                const trail = await getDocumentAuditTrail(documentType, documentId);
                
                // إضافة سجل الإنشاء الافتراضي إذا لم يكن مسجلاً في جدول audit_logs بعد
                if (trail.length === 0 && documentCreatedAt) {
                    trail.push({
                        id: 'init-1',
                        document_type: documentType,
                        document_id: documentId,
                        action: 'created',
                        user_name: creatorName || 'مستخدم النظام',
                        created_at: documentCreatedAt,
                        details: { note: 'تم إنشاء المستند وحفظه في المنظومة' }
                    });
                }
                setLogs(trail);
            } catch (err) {
                console.warn('Failed to load audit timeline:', err);
            } finally {
                setLoading(false);
            }
        };

        fetchLogs();
    }, [documentId, documentType, documentCreatedAt, creatorName]);

    if (!documentId) return null;

    const getActionBadge = (action: DocumentAuditLog['action']) => {
        switch (action) {
            case 'created':
                return { bg: 'bg-emerald-50 text-emerald-700 border-emerald-200', icon: CheckCircle2, label: 'إنشاء المستند' };
            case 'updated':
                return { bg: 'bg-blue-50 text-blue-700 border-blue-200', icon: Edit3, label: 'تعديل البيانات' };
            case 'posted':
                return { bg: 'bg-purple-50 text-purple-700 border-purple-200', icon: Shield, label: 'ترحيل محاسبي' };
            case 'paid':
                return { bg: 'bg-amber-50 text-amber-700 border-amber-200', icon: CreditCard, label: 'سداد مالي' };
            case 'printed':
                return { bg: 'bg-slate-100 text-slate-700 border-slate-200', icon: Printer, label: 'طباعة المستند' };
            case 'unposted':
                return { bg: 'bg-rose-50 text-rose-700 border-rose-200', icon: AlertCircle, label: 'إلغاء الترحيل' };
            default:
                return { bg: 'bg-slate-50 text-slate-700 border-slate-200', icon: History, label: getActionArabicLabel(action) };
        }
    };

    return (
        <div className="bg-white rounded-3xl shadow-xs border border-slate-200 overflow-hidden mt-6 transition-all print:hidden" dir="rtl">
            {/* Header Accordion Bar */}
            <div 
                onClick={() => setIsOpen(!isOpen)}
                className="p-4 px-6 flex items-center justify-between cursor-pointer hover:bg-slate-50 transition-colors select-none"
            >
                <div className="flex items-center gap-3">
                    <div className="p-2.5 bg-slate-100 text-slate-600 rounded-2xl">
                        <History size={18} />
                    </div>
                    <div>
                        <h4 className="text-xs font-black text-slate-800 flex items-center gap-2">
                            سجل التدقيق والتتبع الزمني (Audit Trail)
                            <span className="text-[10px] bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full font-bold">
                                {logs.length} عمليات
                            </span>
                        </h4>
                        <p className="text-[11px] text-slate-400 font-medium">
                            تتبع تاريخ الإنشاء، التعديلات، الترحيل والسداد مع اسم المستخدم والتوقيت
                        </p>
                    </div>
                </div>

                <div className="flex items-center gap-2">
                    <button 
                        type="button" 
                        className="p-1.5 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-all"
                    >
                        {isOpen ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                    </button>
                </div>
            </div>

            {/* Expanded Content: Vertical Timeline */}
            {isOpen && (
                <div className="p-6 border-t border-slate-100 bg-slate-50/40 animate-in fade-in slide-in-from-top-2">
                    {loading ? (
                        <div className="py-6 text-center text-xs text-slate-400 font-bold flex items-center justify-center gap-2">
                            <Loader2 size={16} className="animate-spin text-emerald-600" />
                            جاري جلب سجل العمليات...
                        </div>
                    ) : logs.length === 0 ? (
                        <div className="py-6 text-center text-xs text-slate-400 font-medium">
                            لا توجد حركات مسجلة حتى الآن لهذا المستند.
                        </div>
                    ) : (
                        <div className="relative border-r-2 border-slate-200 mr-4 space-y-6 pr-6 py-2">
                            {logs.map((log, idx) => {
                                const badge = getActionBadge(log.action);
                                const IconComponent = badge.icon;
                                const dateObj = new Date(log.created_at);
                                const formattedDate = dateObj.toLocaleDateString('ar-EG', {
                                    year: 'numeric',
                                    month: 'long',
                                    day: 'numeric'
                                });
                                const formattedTime = dateObj.toLocaleTimeString('ar-EG', {
                                    hour: '2-digit',
                                    minute: '2-digit',
                                    second: '2-digit'
                                });

                                return (
                                    <div key={log.id || idx} className="relative group">
                                        {/* Dot on Timeline */}
                                        <div className={`absolute -right-[31px] top-1 w-4 h-4 rounded-full border-2 border-white shadow-xs ${
                                            log.action === 'created' ? 'bg-emerald-500' :
                                            log.action === 'posted' ? 'bg-purple-500' :
                                            log.action === 'paid' ? 'bg-amber-500' :
                                            log.action === 'updated' ? 'bg-blue-500' : 'bg-slate-400'
                                        }`} />

                                        {/* Timeline Card */}
                                        <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs hover:border-slate-300 transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                                            
                                            <div className="flex items-center gap-3">
                                                <div className={`p-2 rounded-xl border ${badge.bg}`}>
                                                    <IconComponent size={16} />
                                                </div>
                                                <div>
                                                    <div className="flex items-center gap-2">
                                                        <span className="text-xs font-black text-slate-800">
                                                            {badge.label}
                                                        </span>
                                                        <span className="text-[11px] font-bold text-slate-500 flex items-center gap-1 bg-slate-100 px-2 py-0.5 rounded-md">
                                                            <User size={10} />
                                                            {log.user_name || 'مستخدم النظام'}
                                                        </span>
                                                    </div>
                                                    {log.details?.note && (
                                                        <p className="text-[11px] text-slate-500 mt-1 font-medium">
                                                            {log.details.note}
                                                        </p>
                                                    )}
                                                </div>
                                            </div>

                                            {/* Time Display */}
                                            <div className="text-left font-mono text-[11px] text-slate-400 shrink-0" dir="ltr">
                                                <span className="text-slate-600 font-bold">{formattedTime}</span>
                                                <span className="mx-1.5 text-slate-300">•</span>
                                                <span>{formattedDate}</span>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

export default DocumentAuditTimeline;

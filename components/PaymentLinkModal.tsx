import React, { useState } from 'react';
import { 
  X, 
  CreditCard, 
  Copy, 
  Check, 
  Send, 
  QrCode, 
  ExternalLink, 
  RefreshCw, 
  Zap,
  CheckCircle2
} from 'lucide-react';
import { PaymentGateway } from '../services/paymentGatewayService';
import { useAccounting } from '../context/AccountingContext';
import { useToast } from '../context/ToastContext';

interface PaymentLinkModalProps {
  isOpen: boolean;
  onClose: () => void;
  documentType: 'invoice' | 'restaurant_order' | 'stadium_booking' | 'stadium_subscription' | 'hims_bill';
  documentId?: string;
  documentNumber: string;
  amount: number;
  customerName?: string;
  customerPhone?: string;
}

export const PaymentLinkModal: React.FC<PaymentLinkModalProps> = ({
  isOpen,
  onClose,
  documentType,
  documentId,
  documentNumber,
  amount,
  customerName,
  customerPhone
}) => {
  const { currentUser } = useAccounting();
  const { showToast } = useToast();
  const [loading, setLoading] = useState(false);
  const [paymentUrl, setPaymentUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  const orgId = (currentUser as any)?.organization_id;

  const handleGenerateLink = async () => {
    if (!orgId) return;
    setLoading(true);
    try {
      const res = await PaymentGateway.createPaymentLink({
        organizationId: orgId,
        documentType,
        documentId,
        documentNumber,
        amount,
        customerName,
        customerPhone
      });

      if (res.success && res.paymentUrl) {
        setPaymentUrl(res.paymentUrl);
        showToast('تم إنشاء رابط الدفع بنجاح ✅', 'success');
      } else {
        throw new Error(res.error || 'تعذر إنشاء الرابط');
      }
    } catch (err: any) {
      showToast('خطأ: ' + err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = () => {
    if (!paymentUrl) return;
    navigator.clipboard.writeText(paymentUrl);
    setCopied(true);
    showToast('تم نسخ الرابط إلى الحافظة 📋', 'info');
    setTimeout(() => setCopied(false), 2000);
  };

  const handleShareWhatsApp = () => {
    if (!paymentUrl) return;
    const msg = `مرحباً ${customerName || ''}،\nرابط سداد ${documentNumber} بمبلغ ${amount.toLocaleString()} ج.م:\n${paymentUrl}`;
    const phone = customerPhone ? customerPhone.replace(/\D/g, '') : '';
    const waUrl = phone ? `https://wa.me/${phone}?text=${encodeURIComponent(msg)}` : `https://wa.me/?text=${encodeURIComponent(msg)}`;
    window.open(waUrl, '_blank');
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-150">
      <div className="bg-white rounded-3xl shadow-2xl max-w-lg w-full overflow-hidden border border-slate-100 animate-in zoom-in-95 duration-200" dir="rtl">
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-900 to-indigo-900 text-white p-6 relative">
          <button
            onClick={onClose}
            className="absolute left-4 top-4 w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition"
          >
            <X size={18} />
          </button>
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-white/10 border border-white/20 flex items-center justify-center text-blue-300">
              <CreditCard size={24} />
            </div>
            <div>
              <h2 className="text-xl font-black">رابط السداد الإلكتروني الفوري</h2>
              <p className="text-xs text-blue-200 mt-0.5">
                توليد رابط دفع سريع وإرساله للعميل عبر WhatsApp
              </p>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="p-6 space-y-5">
          <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 space-y-2 text-sm">
            <div className="flex justify-between text-slate-600">
              <span>رقم المستند:</span>
              <span className="font-bold font-mono text-slate-900">{documentNumber}</span>
            </div>
            <div className="flex justify-between text-slate-600">
              <span>العميل:</span>
              <span className="font-bold text-slate-900">{customerName || 'عميل نقدي'}</span>
            </div>
            <div className="flex justify-between text-slate-600 border-t border-slate-200 pt-2">
              <span className="font-bold text-slate-800">المبلغ المطلوب:</span>
              <span className="font-black text-blue-600 text-lg">{amount.toLocaleString()} ج.م</span>
            </div>
          </div>

          {!paymentUrl ? (
            <button
              onClick={handleGenerateLink}
              disabled={loading}
              className="w-full py-3.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-2xl transition shadow-lg shadow-blue-200 flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {loading ? <RefreshCw size={18} className="animate-spin" /> : <Zap size={18} />}
              <span>توليد رابط السداد الآن 🚀</span>
            </button>
          ) : (
            <div className="space-y-4 animate-in fade-in">
              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1">رابط الدفع المباشر:</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    readOnly
                    value={paymentUrl}
                    className="w-full px-3 py-2 bg-slate-100 rounded-xl text-xs font-mono border border-slate-200 focus:outline-none"
                  />
                  <button
                    onClick={handleCopy}
                    className="px-4 py-2 bg-slate-800 hover:bg-slate-900 text-white rounded-xl text-xs font-bold transition flex items-center gap-1"
                  >
                    {copied ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
                    <span>{copied ? 'تم النسخ' : 'نسخ'}</span>
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 pt-2">
                <button
                  onClick={handleShareWhatsApp}
                  className="py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-xs transition flex items-center justify-center gap-2 shadow-md shadow-emerald-100"
                >
                  <Send size={16} />
                  <span>إرسال عبر WhatsApp</span>
                </button>

                <a
                  href={paymentUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="py-3 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 font-bold rounded-xl text-xs transition flex items-center justify-center gap-2"
                >
                  <ExternalLink size={16} />
                  <span>فتح شاشة الدفع</span>
                </a>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

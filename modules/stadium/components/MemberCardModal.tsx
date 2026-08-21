import React, { useRef } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { useReactToPrint } from 'react-to-print';
import { X, Printer, Trophy, Calendar, Phone, ShieldCheck, Share2 } from 'lucide-react';
import { StadiumMember, MEMBERSHIP_CATEGORY_LABELS } from '../stadium.types';
import { generateWhatsAppRenewalUrl } from '../stadiumHelpers';

interface MemberCardModalProps {
  isOpen: boolean;
  onClose: () => void;
  member: StadiumMember | null;
}

export const MemberCardModal: React.FC<MemberCardModalProps> = ({
  isOpen,
  onClose,
  member,
}) => {
  const printCardRef = useRef<HTMLDivElement>(null);

  const handlePrint = useReactToPrint({
    contentRef: printCardRef,
    documentTitle: `كارنيه_عضوية_${member?.full_name || 'عضو'}`,
  });

  if (!isOpen || !member) return null;

  const qrData = JSON.stringify({
    type: 'STADIUM_MEMBER',
    id: member.id,
    name: member.full_name,
    national_id: member.national_id,
    membership_type: member.membership_type,
    end_date: member.end_date,
    status: member.status,
  });

  const isExpired = member.end_date ? new Date(member.end_date) < new Date() : false;

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" dir="rtl">
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex justify-between items-center p-5 border-b dark:border-gray-800 bg-slate-50 dark:bg-slate-850">
          <div>
            <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
              <Trophy className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
              بطاقة العضوية الذكية (Smart ID Card)
            </h2>
            <p className="text-xs text-gray-500 mt-0.5">معتمدة مع رمز الاستجابة السريعة (QR Code) للبوابات</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Card Preview & Printable Area */}
        <div className="p-6 overflow-y-auto space-y-6 flex flex-col items-center">
          <div ref={printCardRef} className="print-area w-full max-w-[420px] space-y-4">
            {/* Front Card Design */}
            <div className="relative w-full aspect-[1.586/1] rounded-2xl overflow-hidden shadow-xl border border-emerald-700 bg-gradient-to-br from-emerald-900 via-emerald-800 to-slate-900 text-white p-4 flex flex-col justify-between select-none">
              {/* Decorative Sports Waves */}
              <div className="absolute -right-12 -top-12 w-36 h-36 rounded-full bg-emerald-500/20 blur-xl pointer-events-none"></div>
              <div className="absolute -left-12 -bottom-12 w-36 h-36 rounded-full bg-amber-500/20 blur-xl pointer-events-none"></div>

              {/* Card Top Branding */}
              <div className="flex justify-between items-start border-b border-emerald-600/50 pb-2 relative z-10">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center border border-white/20">
                    <Trophy className="w-4 h-4 text-amber-400" />
                  </div>
                  <div>
                    <h3 className="font-bold text-xs leading-tight tracking-wide text-white">استاد المنصورة الرياضي</h3>
                    <p className="text-[9px] text-emerald-300">مركز التنمية الشبابية والرياضية</p>
                  </div>
                </div>
                <div className="text-left">
                  <span className="inline-block px-2 py-0.5 bg-amber-400 text-emerald-950 rounded-full font-bold text-[9px] shadow-sm">
                    {MEMBERSHIP_CATEGORY_LABELS[member.membership_type] || member.membership_type}
                  </span>
                </div>
              </div>

              {/* Card Body */}
              <div className="flex items-center gap-3.5 my-1 relative z-10">
                {member.photo_url ? (
                  <img
                    src={member.photo_url}
                    alt={member.full_name}
                    className="w-16 h-20 rounded-xl object-cover border-2 border-amber-400 shadow-md bg-white shrink-0"
                  />
                ) : (
                  <div className="w-16 h-20 rounded-xl bg-emerald-700/60 border-2 border-emerald-400/60 flex items-center justify-center text-xl font-bold text-emerald-200 shrink-0">
                    {member.full_name.charAt(0)}
                  </div>
                )}

                <div className="flex-1 space-y-1 text-right">
                  <div className="text-sm font-bold text-white truncate leading-snug">
                    {member.full_name}
                  </div>
                  {member.national_id && (
                    <div className="text-[10px] text-emerald-200 font-mono">
                      الرقم القومي: <span className="font-semibold text-white">{member.national_id}</span>
                    </div>
                  )}
                  {member.phone && (
                    <div className="text-[10px] text-emerald-200 font-mono">
                      الهاتف: <span className="text-white">{member.phone}</span>
                    </div>
                  )}
                  <div className="text-[10px] text-amber-300 font-medium">
                    تاريخ الانتهاء: <span className="font-bold font-mono">{member.end_date || 'غير محدد'}</span>
                  </div>
                </div>

                {/* QR Code in Front */}
                <div className="bg-white p-1.5 rounded-xl shadow-md shrink-0">
                  <QRCodeSVG value={qrData} size={58} level="M" />
                </div>
              </div>

              {/* Card Footer */}
              <div className="flex justify-between items-center pt-2 border-t border-emerald-600/40 text-[8px] text-emerald-300 relative z-10">
                <span className="flex items-center gap-1">
                  <ShieldCheck className="w-3 h-3 text-amber-400" />
                  بطاقة عضوية رسمية معتمدة
                </span>
                <span className="font-mono text-white/80">ID: {member.id.substring(0, 8).toUpperCase()}</span>
              </div>
            </div>

            {/* Back Card Design */}
            <div className="relative w-full aspect-[1.586/1] rounded-2xl overflow-hidden shadow-lg border border-slate-700 bg-slate-900 text-slate-200 p-4 flex flex-col justify-between text-[9px] select-none">
              <div className="text-center border-b border-slate-800 pb-2">
                <h4 className="font-bold text-white text-xs">شروط وتعليمات استخدام العضوية</h4>
                <p className="text-[8px] text-slate-400">جمهورية مصر العربية — وزارة الشباب والرياضة</p>
              </div>

              <ul className="space-y-1 list-disc list-inside text-slate-300 leading-relaxed px-1">
                <li>هذه البطاقة شخصية ولا يجوز استخدامها إلا من قِبل صاحبها.</li>
                <li>يجب إبراز البطاقة أو مسح الـ QR عند بوابات الدخول ومرافق الاستاد.</li>
                <li>في حالة فقدان البطاقة يرجى إخطار إدارة الاشتراكات فوراً.</li>
                <li>تعتبر العضوية ملغاة حكماً إذا لم يتم تجديدها في الموعد المحدد.</li>
              </ul>

              <div className="flex justify-between items-end border-t border-slate-800 pt-2 text-[8px] text-slate-400">
                <span>ختم الإدارة والخزينة: ........................</span>
                <span>توقيع المدير التنفيذي: ........................</span>
              </div>
            </div>
          </div>
        </div>

        {/* Modal Actions */}
        <div className="p-5 border-t dark:border-gray-800 bg-slate-50 dark:bg-slate-850 flex flex-wrap justify-between items-center gap-3">
          {member.phone && (
            <a
              href={generateWhatsAppRenewalUrl(member.phone, member.full_name, member.end_date || '')}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-3.5 py-2 rounded-xl text-xs font-semibold shadow-sm transition"
            >
              <Share2 className="w-3.5 h-3.5" />
              إرسال تذكير وتفاصيل عبر WhatsApp
            </a>
          )}

          <div className="flex gap-2 mr-auto">
            <button
              onClick={onClose}
              className="px-4 py-2 border rounded-xl text-xs font-medium text-gray-600 hover:bg-gray-100 dark:border-gray-700 dark:text-gray-300"
            >
              إغلاق
            </button>
            <button
              onClick={() => handlePrint()}
              className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2 rounded-xl text-xs font-bold shadow-md transition"
            >
              <Printer className="w-4 h-4" />
              طباعة بطاقة الكارنيه (CR80 / A4)
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default MemberCardModal;

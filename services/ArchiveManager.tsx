import React, { useState } from 'react';
import { supabase } from '../supabaseClient';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { Download, Database, Loader2, ShieldCheck, FileJson } from 'lucide-react';

const ArchiveManager = () => {
  const { currentUser } = useAuth();
  const { showToast } = useToast();
  const [isExporting, setIsExporting] = useState(false);

  // التحقق من الصلاحيات (فقط للمديرين)
  const isAdmin = (currentUser as any)?.role === 'admin' || (currentUser as any)?.role === 'super_admin';

  const handleExportFullArchive = async () => {
    if (!isAdmin) {
      showToast('عذراً، هذه الصلاحية متاحة لمدير النظام فقط', 'error');
      return;
    }

    if (!window.confirm('سيتم الآن تجهيز أرشيف كامل لبيانات المنظمة (الفواتير، القيود، المخزون، والرواتب). هل تود الاستمرار؟')) {
      return;
    }

    setIsExporting(true);
    try {
      // 1. استدعاء الدالة من قاعدة البيانات
      const { data, error } = await supabase.rpc('export_organization_data_json', {
        p_org_id: (currentUser as any)?.organization_id
      });

      if (error) throw error;

      // 2. تحويل البيانات إلى ملف JSON
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      
      // 3. إنشاء رابط تحميل تلقائي
      const link = document.createElement('a');
      link.href = url;
      link.download = `TriPro_ERP_Archive_${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(link);
      link.click();
      
      // تنظيف الذاكرة
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      showToast('تم تحميل الأرشيف الكامل بنجاح ✅ احتفظ بهذا الملف في مكان آمن.', 'success');
    } catch (err: any) {
      console.error('Export Error:', err);
      showToast('فشل تصدير الأرشيف: ' + (err.message || 'خطأ غير معروف'), 'error');
    } finally {
      setIsExporting(false);
    }
  };

  if (!isAdmin) return null;

  return (
    <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm space-y-4">
      <div className="flex items-center gap-3 border-b border-slate-100 pb-4">
        <div className="p-2 bg-amber-50 rounded-lg text-amber-600">
          <Database size={24} />
        </div>
        <div>
          <h3 className="font-black text-slate-800 text-lg">أرشفة البيانات القانونية</h3>
          <p className="text-slate-500 text-xs font-bold">تصدير كافة سجلات الشركة في ملف واحد بصيغة JSON للأرشفة الطويلة.</p>
        </div>
      </div>

      <button
        onClick={handleExportFullArchive}
        disabled={isExporting}
        className="w-full flex items-center justify-center gap-3 bg-slate-900 hover:bg-slate-800 text-white py-4 rounded-xl font-black transition-all transform active:scale-95 shadow-lg disabled:opacity-50"
      >
        {isExporting ? <Loader2 className="animate-spin" size={20} /> : <FileJson size={20} />}
        {isExporting ? 'جاري تجهيز الأرشيف الضخم...' : 'تحميل الأرشيف الكامل (للأغراض القانونية)'}
      </button>
    </div>
  );
};

export default ArchiveManager;
import React, { useState } from 'react';
import { supabase } from '../supabaseClient';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { Upload, Download, Loader2, Database, AlertCircle, FileJson, CheckCircle } from 'lucide-react';
import { IntegrityCheckScreen } from './IntegrityCheckScreen';

/**
 * BackupRestoreManager
 * المكون المسؤول عن إدارة عمليات النسخ الاحتياطي والاستعادة في صفحة الإعدادات.
 * يدعم التبديل بين الرفع، المعاينة (Integrity Check)، وحالة التنفيذ.
 */
export const BackupRestoreManager = () => {
  const { currentUser } = useAuth();
  const { showToast } = useToast();
  const [view, setView] = useState<'upload' | 'preview' | 'processing'>('upload');
  const [backupData, setBackupData] = useState<any>(null);
  const [isExporting, setIsExporting] = useState(false);

  const isAdmin = (currentUser as any)?.role === 'admin' || (currentUser as any)?.role === 'super_admin';
  const orgId = (currentUser as any)?.organization_id;

  // دالة تصدير نسخة احتياطية (JSON)
  const handleExportFullArchive = async () => {
    if (!isAdmin) return showToast('عذراً، هذه الصلاحية للمديرين فقط', 'error');
    
    setIsExporting(true);
    try {
      const { data: backupId, error } = await supabase.rpc('create_organization_backup', { p_org_id: orgId });
      if (error) throw error;

      const { data: record } = await supabase.from('organization_backups').select('backup_data').eq('id', backupId).single();
      
      const blob = new Blob([JSON.stringify(record?.backup_data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `TriPro_ERP_Backup_${new Date().toISOString().split('T')[0]}.json`;
      link.click();
      URL.revokeObjectURL(url);
      showToast('تم تحميل النسخة الاحتياطية بنجاح ✅', 'success');
    } catch (err: any) {
      showToast('فشل التصدير: ' + err.message, 'error');
    } finally {
      setIsExporting(false);
    }
  };

  // دالة معالجة رفع الملف والتحويل لشاشة المعاينة
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const json = JSON.parse(event.target?.result as string);
        setBackupData(json);
        setView('preview'); // 🔄 التبديل لشاشة المعاينة
      } catch (err) {
        showToast('خطأ: الملف المرفوع ليس بصيغة JSON صالحة.', 'error');
      }
    };
    reader.readAsText(file);
    e.target.value = ''; // تصفير الإدخال
  };

  // تنفيذ الاستعادة النهائية
  const handleConfirmRestore = async () => {
    setView('processing');
    try {
      const { data, error } = await supabase.rpc('restore_organization_backup', {
        p_org_id: orgId,
        p_backup_data: backupData
      });
      if (error) throw error;

      showToast(data || 'تمت استعادة البيانات بنجاح ✅', 'success');
      setTimeout(() => window.location.reload(), 2000);
    } catch (err: any) {
      showToast('فشل الاستعادة: ' + err.message, 'error');
      setView('preview');
    }
  };

  if (view === 'processing') {
    return (
      <div className="bg-white rounded-2xl p-16 border-2 border-red-100 shadow-xl flex flex-col items-center justify-center text-center space-y-4">
        <Loader2 className="animate-spin h-16 w-16 text-red-600" />
        <h3 className="text-xl font-black text-slate-800">جاري تطهير الجول وزرع البيانات...</h3>
        <p className="text-slate-500 font-bold">برجاء عدم إغلاق المتصفح لضمان سلامة الدليل المحاسبي.</p>
      </div>
    );
  }

  if (view === 'preview' && backupData) {
    return (
      <IntegrityCheckScreen 
        backupData={backupData} 
        orgId={orgId} 
        onConfirm={handleConfirmRestore} 
        onCancel={() => { setView('upload'); setBackupData(null); }} 
      />
    );
  }

  return (
    <div className="bg-white rounded-2xl p-8 border border-slate-200 shadow-sm space-y-8">
      <div className="flex items-center gap-4 border-b border-slate-100 pb-6">
        <div className="p-3 bg-blue-50 rounded-xl text-blue-600"><Database size={28} /></div>
        <div>
          <h3 className="font-black text-slate-800 text-xl">مركز النسخ الاحتياطي والاستعادة</h3>
          <p className="text-slate-500 text-sm font-bold">أدوات سيادية لإدارة البيانات وحمايتها من الضياع.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* خيار التصدير */}
        <div className="p-6 rounded-2xl border border-slate-100 bg-slate-50/50 flex flex-col justify-between space-y-4">
          <p className="text-sm text-slate-600 font-medium leading-relaxed">قم بتحميل نسخة JSON كاملة من كافة موديولات النظام (المحاسبة، المخازن، المطاعم، الموظفين).</p>
          <button onClick={handleExportFullArchive} disabled={isExporting} className="w-full flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white py-4 rounded-xl font-black shadow-lg transition-all disabled:opacity-50">
            {isExporting ? <Loader2 className="animate-spin" /> : <FileJson size={20} />} إنشاء نسخة احتياطية الآن
          </button>
        </div>

        {/* خيار الاستعادة */}
        <div className="p-6 rounded-2xl border-2 border-dashed border-blue-200 hover:border-blue-400 bg-blue-50/20 transition-all relative group cursor-pointer flex flex-col items-center justify-center text-center">
          <input type="file" accept=".json" onChange={handleFileUpload} className="absolute inset-0 opacity-0 cursor-pointer z-10" />
          <Upload size={32} className="text-blue-600 mb-3 group-hover:scale-110 transition-transform" />
          <h4 className="font-black text-slate-800">رفع ملف لاستعادة البيانات</h4>
          <p className="text-xs text-slate-500 mt-1 font-bold">سيتم الانتقال لشاشة فحص النزاهة آلياً قبل البدء.</p>
        </div>
      </div>
    </div>
  );
};
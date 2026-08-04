import React, { useEffect, useState } from 'react';
import { useToast } from '../context/ToastContext';
import { offlineService, db } from '../services/offlineService';
import { Wifi, WifiOff, UploadCloud, AlertCircle, Loader2, Trash2 } from 'lucide-react';
import { useLiveQuery } from 'dexie-react-hooks';

export const OfflineSyncProvider = () => {
  const { showToast } = useToast();
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [isSyncing, setIsSyncing] = useState(false);

  const pendingCount = useLiveQuery(
    async () => {
      const orders = await db.queuedOrders.where('status').notEqual('synced').count();
      const patients = await db.queuedPatients.where('status').notEqual('synced').count();
      const visits = await db.queuedVisits.where('status').notEqual('synced').count();
      const notes = await db.queuedClinicalNotes.where('status').notEqual('synced').count();
      const prescriptions = await db.queuedPrescriptions.where('status').notEqual('synced').count();
      const labOrders = await db.queuedLabOrders.where('status').notEqual('synced').count();
      const radOrders = await db.queuedRadiologyOrders.where('status').notEqual('synced').count();
      return orders + patients + visits + notes + prescriptions + labOrders + radOrders;
    },
    [], 
    0 
  );

  const failedItems = useLiveQuery(
    async () => {
      const orders = await db.queuedOrders.where('status').equals('failed').toArray();
      const patients = await db.queuedPatients.where('status').equals('failed').toArray();
      const visits = await db.queuedVisits.where('status').equals('failed').toArray();
      const notes = await db.queuedClinicalNotes.where('status').equals('failed').toArray();
      const prescriptions = await db.queuedPrescriptions.where('status').equals('failed').toArray();
      const labOrders = await db.queuedLabOrders.where('status').equals('failed').toArray();
      const radOrders = await db.queuedRadiologyOrders.where('status').equals('failed').toArray();
      
      const allFailed: any[] = [];
      orders.forEach(o => allFailed.push({ type: 'طلب POS', error: o.error }));
      patients.forEach(p => allFailed.push({ type: 'تسجيل مريض', error: p.error }));
      visits.forEach(v => allFailed.push({ type: 'زيارة مريض', error: v.error }));
      notes.forEach(n => allFailed.push({ type: 'ملاحظة طبية', error: n.error }));
      prescriptions.forEach(p => allFailed.push({ type: 'روشتة', error: p.error }));
      labOrders.forEach(l => allFailed.push({ type: 'طلب تحليل', error: l.error }));
      radOrders.forEach(r => allFailed.push({ type: 'طلب أشعة', error: r.error }));
      return allFailed;
    },
    [],
    []
  );

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      showToast('🌐 عاد الاتصال بالإنترنت. جاري مزامنة البيانات...', 'success');
      triggerSync();
    };
    const handleOffline = () => {
      setIsOnline(false);
      showToast('🔌 انقطع الاتصال. سيتم حفظ البيانات والعمليات محلياً.', 'warning');
    };

    const triggerSync = async () => {
      if (isSyncing) return;
      setIsSyncing(true);
      try {
        await offlineService.processQueue();
      } catch (err) {
        console.error("Sync process crashed:", err);
      } finally {
        setIsSyncing(false);
      }
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    const interval = setInterval(triggerSync, 30000); // Check every 30 seconds

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      clearInterval(interval);
    };
  }, [showToast, isSyncing]);

  const clearQueue = async () => {
    if (window.confirm('⚠️ هل أنت متأكد من حذف العمليات الطبية والطلبات المعلقة؟\nسيتم حذفها نهائياً.')) {
      try {
        await db.queuedOrders.clear();
        await db.queuedPatients.clear();
        await db.queuedVisits.clear();
        await db.queuedClinicalNotes.clear();
        await db.queuedPrescriptions.clear();
        await db.queuedLabOrders.clear();
        await db.queuedRadiologyOrders.clear();
        showToast('تم تنظيف قائمة الانتظار بنجاح.', 'success');
      } catch (error) {
        console.error(error);
        showToast('فشل حذف القائمة.', 'error');
      }
    }
  };

  if (pendingCount === 0 && isOnline) {
    return null;
  }

  return (
    <div className="fixed bottom-4 left-4 z-[200] bg-white rounded-lg shadow-lg p-3 flex flex-col gap-2 border text-sm font-bold animate-in fade-in slide-in-from-bottom-5 max-w-sm">
      <div className="flex items-center gap-3">
        {isOnline ? (
          isSyncing ? (
            <>
              <Loader2 className="text-blue-500 animate-spin" size={20} />
              <span className="text-blue-700">جاري المزامنة... ({pendingCount})</span>
            </>
          ) : pendingCount > 0 ? (
            <>
              <AlertCircle className="text-amber-500" size={20} />
              <span className="text-amber-700">توجد {pendingCount} عمليات معلقة.</span>
               <button onClick={clearQueue} className="p-1 bg-red-50 text-red-600 rounded hover:bg-red-100 transition-colors" title="حذف العمليات المعلقة">
                  <Trash2 size={16} />
              </button>
            </>
          ) : (
            <></>
          )
        ) : (
          <>
            <WifiOff className="text-red-500" size={20} />
            <span className="text-red-700">أنت غير متصل. ({pendingCount} عملية محفوظة)</span>
            {pendingCount > 0 && (
              <button onClick={clearQueue} className="p-1 bg-red-50 text-red-600 rounded hover:bg-red-100 transition-colors" title="حذف العمليات المعلقة">
                  <Trash2 size={16} />
              </button>
            )}
          </>
        )}
      </div>
      
      {failedItems && failedItems.length > 0 && (
        <div className="p-2 bg-red-50 text-red-700 rounded-lg text-xs max-h-32 overflow-y-auto border border-red-100 w-full">
          <p className="font-bold mb-1">⚠️ أخطاء المزامنة السحابية:</p>
          {failedItems.map((item, idx) => (
            <div key={idx} className="border-b border-red-100 last:border-0 py-1">
              <b>{item.type}:</b> {item.error || 'خطأ غير معروف في قواعد البيانات'}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

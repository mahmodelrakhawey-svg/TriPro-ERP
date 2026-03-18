import React, { useEffect, useState } from 'react';
import { useToast } from '../context/ToastContext';
import { offlineService, db } from '../services/offlineService';
import { Wifi, WifiOff, UploadCloud, AlertCircle, Loader2 } from 'lucide-react';
import { useLiveQuery } from 'dexie-react-hooks';

export const OfflineSyncProvider = () => {
  const { showToast } = useToast();
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [isSyncing, setIsSyncing] = useState(false);

  const pendingCount = useLiveQuery(
    () => db.queuedOrders.where('status').notEqual('synced').count(),
    [], 
    0 
  );

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      showToast('🌐 عاد الاتصال بالإنترنت. جاري مزامنة البيانات...', 'success');
      triggerSync();
    };
    const handleOffline = () => {
      setIsOnline(false);
      showToast('🔌 انقطع الاتصال. سيتم حفظ الطلبات محلياً.', 'warning');
    };

    const triggerSync = async () => {
      if (isSyncing) return;
      setIsSyncing(true);
      await offlineService.processQueue();
      setIsSyncing(false);
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

  if (pendingCount === 0 && isOnline) {
    return null;
  }

  return (
    <div className="fixed bottom-4 left-4 z-[200] bg-white rounded-lg shadow-lg p-3 flex items-center gap-3 border text-sm font-bold animate-in fade-in slide-in-from-bottom-5">
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
          </>
        ) : (
          <></> // Don't show if synced
        )
      ) : (
        <>
          <WifiOff className="text-red-500" size={20} />
          <span className="text-red-700">أنت غير متصل. ({pendingCount} طلب محفوظ)</span>
        </>
      )}
    </div>
  );
};
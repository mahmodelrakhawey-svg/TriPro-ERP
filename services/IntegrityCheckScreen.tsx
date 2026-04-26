import React, { useState, useEffect } from 'react';
import { CheckCircle, AlertTriangle, XCircle, Loader2 } from 'lucide-react';
import { supabase } from '../supabaseClient';

interface CheckResult {
  name: string;
  status: 'pass' | 'warning' | 'fail';
  message: string;
}

export const IntegrityCheckScreen = ({ backupData, orgId, onConfirm, onCancel }) => {
  const [results, setResults] = useState<CheckResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [canRestore, setCanRestore] = useState(false);

  useEffect(() => {
    const runChecks = async () => {
      setLoading(true);
      const { data, error } = await supabase.rpc('validate_backup_integrity', {
        p_org_id: orgId,
        p_backup_data: backupData
      });

      if (!error && data) {
        setResults(data);
        setCanRestore(!data.some(r => r.status === 'fail'));
      }
      setLoading(false);
    };
    runChecks();
  }, [backupData, orgId]);

  const getIcon = (status) => {
    if (status === 'pass') return <CheckCircle className="text-green-500" />;
    if (status === 'warning') return <AlertTriangle className="text-yellow-500" />;
    return <XCircle className="text-red-500" />;
  };

  return (
    <div className="p-6 bg-white rounded-lg shadow-xl max-w-2xl mx-auto">
      <h2 className="text-2xl font-bold mb-4 text-gray-800 border-b pb-2">نتائج فحص سلامة البيانات</h2>
      
      {loading ? (
        <div className="flex flex-col items-center py-10">
          <Loader2 className="animate-spin h-10 w-10 text-blue-500 mb-2" />
          <p className="text-gray-600">جاري فحص النسخة الاحتياطية...</p>
        </div>
      ) : (
        <div className="space-y-4">
          {results.map((check, index) => (
            <div key={index} className={`flex items-start p-3 rounded-md border ${
              check.status === 'fail' ? 'bg-red-50 border-red-200' : 
              check.status === 'warning' ? 'bg-yellow-50 border-yellow-200' : 'bg-green-50 border-green-200'
            }`}>
              <div className="mt-1 ml-3">{getIcon(check.status)}</div>
              <div>
                <h4 className="font-semibold text-gray-900">{check.name}</h4>
                <p className="text-sm text-gray-700">{check.message}</p>
              </div>
            </div>
          ))}

          <div className="mt-8 flex justify-between gap-4">
            <button 
              onClick={onCancel}
              className="px-6 py-2 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300 transition"
            >
              إلغاء
            </button>
            <button 
              disabled={!canRestore}
              onClick={onConfirm}
              className={`px-8 py-2 text-white rounded-md transition flex items-center ${
                canRestore ? 'bg-red-600 hover:bg-red-700 shadow-md' : 'bg-gray-400 cursor-not-allowed'
              }`}
            >
              {canRestore ? 'تأكيد الاستعادة (سيتم مسح البيانات الحالية)' : 'لا يمكن الاستعادة - يرجى إصلاح الأخطاء'}
            </button>
          </div>
          {!canRestore && <p className="text-xs text-red-600 mt-2 text-center italic">ملاحظة: زر التأكيد معطل بسبب وجود أخطاء حرجة في النسخة.</p>}
        </div>
      )}
    </div>
  );
};
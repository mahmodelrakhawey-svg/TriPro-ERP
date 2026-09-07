import React, { useState, useEffect } from 'react';
import { supabase } from '../../../supabaseClient';
import { useAccounting } from '../../../context/AccountingContext';
import { useToast } from '../../../context/ToastContext';
import { ArrowRight, History, Printer, Download, Loader2, Wallet, ShieldAlert, BadgeDollarSign } from 'lucide-react';

const SubcontractorStatement: React.FC<{ subcontractorId: string, onBack: () => void }> = ({ subcontractorId, onBack }) => {
  const { organization } = useAccounting();
  const { showToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [statement, setStatement] = useState<any[]>([]);
  const [subName, setSubName] = useState('');
  const [balances, setBalances] = useState({ total_retained: 0, total_advances: 0, net_balance: 0 });

  useEffect(() => {
    fetchData();
  }, [subcontractorId]);

  const fetchData = async () => {
    try {
      const { data: sub } = await supabase.from('subcontractors').select('name').eq('id', subcontractorId).single();
      setSubName(sub?.name || '');

      const { data, error } = await supabase.rpc('fn_get_subcontractor_statement', {
        p_subcontractor_id: subcontractorId,
        p_organization_id: organization?.id
      });
      if (error) throw error;
      setStatement(data || []);

      // 🏗️ جلب بيانات العقود والمستخلصات لحساب المحتجزات بدقة
      const { data: contractData } = await supabase
        .from('subcontractor_contracts')
        .select('id, advance_payment_balance, total_value')
        .eq('subcontractor_id', subcontractorId);

      const contractIds = contractData?.map(c => c.id) || [];
      const { data: billingsData } = await supabase
        .from('subcontractor_billings')
        .select('retention_amount')
        .eq('status', 'approved')
        .in('contract_id', contractIds);
      
      setBalances({
        total_advances: contractData?.reduce((sum, c) => sum + Number(c.advance_payment_balance || 0), 0) || 0,
        total_retained: billingsData?.reduce((sum, b) => sum + Number(b.retention_amount || 0), 0) || 0,
        net_balance: data?.[data.length - 1]?.balance || 0
      });
    } catch (error: any) {
      showToast(error.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-6 bg-white min-h-screen rtl">
      <div className="flex justify-between items-center mb-6">
        <div className="flex items-center gap-4">
          <button onClick={onBack} className="p-2 hover:bg-gray-100 rounded-full"><ArrowRight /></button>
          <h1 className="text-xl font-bold text-gray-800 flex items-center gap-2">
            <History className="text-purple-600" />
            كشف حساب المقاول: {subName}
          </h1>
        </div>
        <div className="flex gap-2">
          <button className="flex items-center gap-2 px-4 py-2 border rounded-lg hover:bg-gray-50"><Printer size={18} /> طباعة</button>
          <button className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"><Download size={18} /> Excel</button>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-20"><Loader2 className="animate-spin text-blue-600" size={40} /></div>
      ) : (
        <div className="space-y-6">
          {/* ملخص الأرصدة الاستراتيجي */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-4">
            <div className="bg-slate-900 text-white p-5 rounded-[2rem] shadow-xl">
                <div className="flex items-center gap-2 text-slate-400 mb-2 font-bold text-xs"><Wallet size={16}/> صافي الرصيد المستحق</div>
                <div className="text-2xl font-black">{balances.net_balance.toLocaleString()}</div>
                <p className="text-[10px] text-slate-500 mt-2">بناءً على الأعمال المعتمدة والمدفوعات</p>
            </div>
            <div className="bg-blue-50 border border-blue-100 p-5 rounded-[2rem]">
                <div className="flex items-center gap-2 text-blue-500 mb-2 font-bold text-xs"><BadgeDollarSign size={16}/> دفعات مقدمة متبقية</div>
                <div className="text-2xl font-black text-blue-700">{balances.total_advances.toLocaleString()}</div>
                <div className="w-full bg-blue-100 h-1 rounded-full mt-3"></div>
            </div>
            <div className="bg-emerald-50 border border-emerald-100 p-5 rounded-[2rem]">
                <div className="flex items-center gap-2 text-emerald-500 mb-2 font-bold text-xs"><ShieldAlert size={16}/> إجمالي المحتجزات طرفنا</div>
                <div className="text-2xl font-black text-emerald-700">{balances.total_retained.toLocaleString()}</div>
                <p className="text-[10px] text-emerald-500 mt-2 italic">* مبالغ ضمان الأعمال المتبقية</p>
            </div>
          </div>

        <div className="overflow-x-auto border rounded-xl">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-right text-xs font-bold text-gray-500 uppercase">التاريخ</th>
                <th className="px-6 py-3 text-right text-xs font-bold text-gray-500 uppercase">البيان</th>
                <th className="px-6 py-3 text-right text-xs font-bold text-gray-500 uppercase text-red-600">مدين (دفعات)</th>
                <th className="px-6 py-3 text-right text-xs font-bold text-gray-500 uppercase text-green-600">دائن (أعمال)</th>
                <th className="px-6 py-3 text-right text-xs font-bold text-gray-500 uppercase bg-blue-50">الرصيد</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {statement.map((row, idx) => (
                <tr key={idx} className="hover:bg-gray-50 transition-colors">
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">{row.transaction_date}</td>
                  <td className="px-6 py-4 text-sm font-medium text-gray-800">{row.description}</td>
                  <td className="px-6 py-4 text-sm text-red-600">{row.debit?.toLocaleString()}</td>
                  <td className="px-6 py-4 text-sm text-green-600">{row.credit?.toLocaleString()}</td>
                  <td className="px-6 py-4 text-sm font-bold bg-blue-50/50">{row.balance?.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {statement.length === 0 && (
            <div className="p-10 text-center text-gray-400">لا توجد حركات مالية مسجلة لهذا المقاول.</div>
          )}
        </div>
        </div>
      )}
    </div>
  );
};
export default SubcontractorStatement;
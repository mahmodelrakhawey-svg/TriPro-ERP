import React, { useState, useEffect } from 'react';
import { supabase } from '../../../supabaseClient';
import { useAccounting } from '../../../context/AccountingContext';
import { useToast } from '../../../context/ToastContext';
import { ArrowRight, TrendingUp, TrendingDown, DollarSign, Users, HardHat, Package } from 'lucide-react';

interface ProfitabilityData {
  projectName: string;
  contractValue: number;
  totalBilledToClient: number;
  totalSubcontractorCosts: number;
  totalMaterialLaborCosts: number;
  netProfit: number;
  profitMargin: number;
}

interface Props {
  projectId: string;
  onBack: () => void;
}

const ProjectProfitabilityDashboard: React.FC<Props> = ({ projectId, onBack }) => {
  const { organization } = useAccounting();
  const [data, setData] = useState<ProfitabilityData | null>(null);
  const [loading, setLoading] = useState(true);
  const { showToast } = useToast();

  useEffect(() => {
    if (organization?.id) {
      fetchProfitability();
    }
  }, [projectId, organization?.id]);

  const fetchProfitability = async () => {
    try {
      // 1. جلب بيانات المشروع الأساسية
      const { data: project } = await supabase
        .from('projects')
        .select('name, contract_value, cost_center_account_id')
        .eq('id', projectId)
        .eq('organization_id', organization?.id)
        .single();

      // 2. جلب إجمالي ما تم فوترته للعميل (Approved Billings)
      const { data: clientBillings } = await supabase
        .from('project_progress_billings')
        .select('gross_amount')
        .eq('project_id', projectId)
        .eq('status', 'approved');

      // 3. جلب إجمالي تكاليف مقاولي الباطن
      const { data: subBillings } = await supabase
        .from('subcontractor_billings')
        .select('gross_amount')
        .eq('status', 'approved')
        .in('contract_id', (
          await supabase.from('subcontractor_contracts').select('id').eq('project_id', projectId)
        ).data?.map(c => c.id) || []);

      // 4. جلب المصاريف المباشرة من الأستاذ العام (المواد والعمالة)
      const { data: ledgerCosts } = await supabase
        .from('journal_lines')
        .select('debit, credit')
        .eq('cost_center_id', project?.cost_center_account_id);

      const totalRevenue = clientBillings?.reduce((sum, b) => sum + b.gross_amount, 0) || 0;
      const totalSubCosts = subBillings?.reduce((sum, b) => sum + b.gross_amount, 0) || 0;
      const totalOtherCosts = ledgerCosts?.reduce((sum, l) => sum + (l.debit - l.credit), 0) || 0;
      const totalCosts = totalSubCosts + totalOtherCosts;
      const netProfit = totalRevenue - totalCosts;

      setData({
        projectName: project?.name || '',
        contractValue: project?.contract_value || 0,
        totalBilledToClient: totalRevenue,
        totalSubcontractorCosts: totalSubCosts,
        totalMaterialLaborCosts: totalOtherCosts,
        netProfit: netProfit,
        profitMargin: totalRevenue > 0 ? (netProfit / totalRevenue) * 100 : 0
      });
    } catch (error: any) {
      showToast(error.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  if (loading || !data) return <div className="p-20 text-center animate-pulse">جاري تحليل البيانات المالية...</div>;

  return (
    <div className="p-6 bg-gray-50 min-h-screen rtl text-right">
      <div className="flex items-center gap-4 mb-8">
        <button onClick={onBack} className="p-2 hover:bg-white rounded-full shadow-sm transition-colors">
          <ArrowRight size={24} />
        </button>
        <div>
          <h1 className="text-2xl font-bold text-gray-800">تحليل ربحية المشروع: {data.projectName}</h1>
          <p className="text-gray-500">ملخص الإيرادات مقابل التكاليف الفعلية</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <SummaryCard title="قيمة العقد الإجمالية" value={data.contractValue} icon={<DollarSign className="text-blue-600" />} />
        <SummaryCard title="إجمالي المبالغ المفوترة" value={data.totalBilledToClient} icon={<TrendingUp className="text-green-600" />} />
        <SummaryCard title="إجمالي التكاليف المنصرفة" value={data.totalSubcontractorCosts + data.totalMaterialLaborCosts} icon={<TrendingDown className="text-red-600" />} />
        <div className={`p-6 rounded-2xl shadow-sm border ${data.netProfit >= 0 ? 'bg-green-50 border-green-100' : 'bg-red-50 border-red-100'}`}>
          <p className="text-sm font-medium text-gray-500 mb-2">صافي الربح / الخسارة</p>
          <h3 className={`text-2xl font-black ${data.netProfit >= 0 ? 'text-green-700' : 'text-red-700'}`}>
            {data.netProfit.toLocaleString()} ج.م
          </h3>
          <p className="text-xs font-bold mt-1">هامش الربح: {data.profitMargin.toFixed(1)}%</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="bg-white p-8 rounded-3xl shadow-sm border border-gray-100">
          <h3 className="text-lg font-bold text-gray-800 mb-6 flex items-center gap-2">
            <HardHat className="text-indigo-600" /> تشريح التكاليف الفعلية
          </h3>
          <div className="space-y-6">
            <CostBar label="مقاولين الباطن" amount={data.totalSubcontractorCosts} total={data.totalSubcontractorCosts + data.totalMaterialLaborCosts} color="bg-purple-500" />
            <CostBar label="مواد خام وعمالة مباشرة" amount={data.totalMaterialLaborCosts} total={data.totalSubcontractorCosts + data.totalMaterialLaborCosts} color="bg-blue-500" />
          </div>
        </div>

        <div className="bg-white p-8 rounded-3xl shadow-sm border border-gray-100 flex flex-col justify-center items-center text-center">
          <div className={`w-24 h-24 rounded-full flex items-center justify-center mb-4 ${data.totalBilledToClient >= data.contractValue * 0.9 ? 'bg-green-100' : 'bg-blue-100'}`}>
            <Package size={40} className={data.totalBilledToClient >= data.contractValue * 0.9 ? 'text-green-600' : 'text-blue-600'} />
          </div>
          <h3 className="text-xl font-bold text-gray-800">حالة التحصيل المالي</h3>
          <p className="text-gray-500 mt-2">تم فوترة {((data.totalBilledToClient / data.contractValue) * 100).toFixed(1)}% من قيمة العقد الإجمالية</p>
          <div className="w-full bg-gray-100 h-3 rounded-full mt-6 overflow-hidden">
            <div className="bg-blue-600 h-full transition-all" style={{ width: `${(data.totalBilledToClient / data.contractValue) * 100}%` }}></div>
          </div>
        </div>
      </div>
    </div>
  );
};

const SummaryCard = ({ title, value, icon }: any) => (
  <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
    <div className="p-2 bg-gray-50 w-fit rounded-lg mb-4">{icon}</div>
    <p className="text-sm font-medium text-gray-500 mb-1">{title}</p>
    <h3 className="text-xl font-bold text-gray-800">{value.toLocaleString()} <span className="text-xs font-normal">ج.م</span></h3>
  </div>
);

const CostBar = ({ label, amount, total, color }: any) => (
  <div>
    <div className="flex justify-between text-sm mb-2">
      <span className="font-bold text-gray-700">{label}</span>
      <span className="text-gray-500">{amount.toLocaleString()} ج.م</span>
    </div>
    <div className="w-full bg-gray-100 h-2 rounded-full overflow-hidden">
      <div className={`${color} h-full`} style={{ width: `${total > 0 ? (amount / total) * 100 : 0}%` }}></div>
    </div>
  </div>
);

export default ProjectProfitabilityDashboard;
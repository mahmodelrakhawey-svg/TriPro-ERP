import React, { useState, useEffect } from 'react';
import { supabase } from '../../../supabaseClient';
import { useToast } from '../../../context/ToastContext';
import { useAccounting } from '../../../context/AccountingContext';
import { ArrowRight, Plus, FileText, DollarSign, Percent, Briefcase, X, Save, Loader2, Trash2, Coins, ArrowUpRight, Wallet } from 'lucide-react';

interface Contract {
  id: string;
  contract_name: string;
  total_value: number;
  retention_percentage: number;
  advance_payment_balance?: number; // ðŸ—ï¸ Ø¬Ø¯ÙŠØ¯
  status: string;
  project_name?: string;
  subcontractor_name?: string;
}

interface Props {
  subcontractorId: string;
  onBack: () => void;
  onViewBillings: (contractId: string) => void;
}

const SubcontractorContractsManager: React.FC<Props> = ({ subcontractorId, onBack, onViewBillings }) => {
  const { organization, accounts } = useAccounting();
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [projects, setProjects] = useState<{id: string, name: string}[]>([]);
  const [loading, setLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [isItemized, setIsItemized] = useState(false);
  const [contractItems, setContractItems] = useState<any[]>([]);
  const [newContract, setNewContract] = useState({
    contract_name: '',
    project_id: '',
    total_value: 0,
    retention_percentage: 5
  });

  // Ø­Ø§Ù„Ø© ØµØ±Ù Ø¯ÙØ¹Ø© Ù…Ù‚Ø¯Ù…Ø©
  const [isDisbursingAdvance, setIsDisbursingAdvance] = useState(false);
  const [advanceTargetContract, setAdvanceTargetContract] = useState<Contract | null>(null);
  const [advanceData, setAdvanceData] = useState({
    amount: 0,
    source_account_id: '',
    date: new Date().toISOString().split('T')[0],
    notes: ''
  });

  const { showToast } = useToast();

  // ØªØµÙÙŠØ© Ø­Ø³Ø§Ø¨Ø§Øª Ø§Ù„Ù†Ù‚Ø¯ÙŠØ© ÙˆØ§Ù„Ø¨Ù†ÙˆÙƒ
  const cashAndBankAccounts = (accounts || []).filter(acc => {
    if (acc.isGroup || acc.is_group) return false;
    const code = String(acc.code || '');
    const name = String(acc.name || '').toLowerCase();
    const type = String(acc.type || '').toLowerCase();
    if (code.startsWith('2') || code.startsWith('3') || code.startsWith('4') || code.startsWith('5')) return false;
    return (
      type.includes('cash') || type.includes('bank') ||
      code.startsWith('123') || code.startsWith('101') || code.startsWith('1101') ||
      name.includes('ØµÙ†Ø¯ÙˆÙ‚') || name.includes('Ø®Ø²ÙŠÙ†Ø©') || name.includes('Ø®Ø²ÙŠÙ†Ù‡') ||
      name.includes('Ù†Ù‚Ø¯') || name.includes('Ø¨Ù†Ùƒ') || name.includes('Ù…ØµØ±Ù') ||
      name.includes('Ù…Ø­ÙØ¸Ø©') || name.includes('ÙƒØ§Ø´')
    );
  });

  useEffect(() => {
    if (organization?.id) {
      fetchContracts();
      fetchProjects();
    }
  }, [subcontractorId, organization?.id]);

  const handleDisburseAdvance = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!advanceTargetContract) return;
    if (advanceData.amount <= 0) {
      return showToast('ÙŠØ¬Ø¨ Ø£Ù† ÙŠÙƒÙˆÙ† Ù…Ø¨Ù„Øº Ø§Ù„Ø¯ÙØ¹Ø© Ø§Ù„Ù…Ù‚Ø¯Ù…Ø© Ø£ÙƒØ¨Ø± Ù…Ù† ØµÙØ±', 'warning');
    }
    if (!advanceData.source_account_id) {
      return showToast('ÙŠØ±Ø¬Ù‰ ØªØ­Ø¯ÙŠØ¯ Ø­Ø³Ø§Ø¨ Ø§Ù„Ø®Ø²ÙŠÙ†Ø© Ø£Ùˆ Ø§Ù„Ø¨Ù†Ùƒ Ø§Ù„Ù…ØµØ±ÙˆÙ Ù…Ù†Ù‡', 'warning');
    }

    setLoading(true);
    try {
      const { error } = await supabase.rpc('fn_disburse_subcontractor_advance', {
        p_contract_id: advanceTargetContract.id,
        p_amount: advanceData.amount,
        p_source_account_id: advanceData.source_account_id,
        p_date: advanceData.date,
        p_notes: advanceData.notes || null
      });

      if (error) throw error;
      showToast('ØªÙ… ØµØ±Ù Ø§Ù„Ø¯ÙØ¹Ø© Ø§Ù„Ù…Ù‚Ø¯Ù…Ø© Ù„Ù„Ù…Ù‚Ø§ÙˆÙ„ ÙˆØªÙˆÙ„ÙŠØ¯ Ø§Ù„Ù‚ÙŠØ¯ Ø§Ù„Ù…Ø­Ø§Ø³Ø¨ÙŠ Ø¨Ù†Ø¬Ø§Ø­ âœ…', 'success');
      setIsDisbursingAdvance(false);
      setAdvanceTargetContract(null);
      setAdvanceData({ amount: 0, source_account_id: '', date: new Date().toISOString().split('T')[0], notes: '' });
      fetchContracts();
    } catch (error) {
      showToast('Ø®Ø·Ø£ ÙÙŠ ØµØ±Ù Ø§Ù„Ø¯ÙØ¹Ø© Ø§Ù„Ù…Ù‚Ø¯Ù…Ø©: ' + error.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  // Ø­Ø³Ø§Ø¨ Ø¥Ø¬Ù…Ø§Ù„ÙŠ Ù‚ÙŠÙ…Ø© Ø§Ù„Ø¹Ù‚Ø¯ ØªÙ„Ù‚Ø§Ø¦ÙŠØ§Ù‹ Ø¹Ù†Ø¯ ØªØºÙŠÙŠØ± Ø§Ù„Ø¨Ù†ÙˆØ¯
  useEffect(() => {
    if (!isItemized) return;
    const sum = contractItems.reduce((acc, item) => acc + (Number(item.quantity || 0) * Number(item.unit_price || 0)), 0);
    setNewContract(prev => ({ ...prev, total_value: Number(sum.toFixed(2)) }));
  }, [contractItems, isItemized]);

  const addContractItem = () => {
    setContractItems([...contractItems, { item_name: '', unit: 'Ù…3', quantity: 0, unit_price: 0 }]);
  };

  const updateContractItem = (index: number, field: string, value: string | number | undefined) => {
    const updated = [...contractItems];
    updated[index] = { ...updated[index], [field]: value };
    setContractItems(updated);
  };

  const deleteContractItem = (index: number) => {
    setContractItems(contractItems.filter((_, i) => i !== index));
  };

  const fetchContracts = async () => {
    try {
      const { data, error } = await supabase
        .from('subcontractor_contracts')
        .select('*, projects(name), subcontractors(name)')
        .eq('subcontractor_id', subcontractorId)
        .eq('organization_id', organization?.id);

      if (error) throw error;
      setContracts(data.map(c => ({
        ...c,
        project_name: c.projects?.name,
        subcontractor_name: c.subcontractors?.name
      })));
    } catch (error) {
      showToast(error.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  const fetchProjects = async () => {
    const { data } = await supabase.from('projects').select('id, name').eq('organization_id', organization?.id);
    if (data) setProjects(data);
  };

  const handleCreateContract = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      // 1. Ø¥Ù†Ø´Ø§Ø¡ Ø§Ù„Ø¹Ù‚Ø¯
      const { data: contractData, error: contractError } = await supabase
        .from('subcontractor_contracts')
        .insert([{
          contract_name: newContract.contract_name,
          project_id: newContract.project_id,
          subcontractor_id: subcontractorId,
          organization_id: organization?.id,
          total_value: newContract.total_value,
          retention_percentage: newContract.retention_percentage,
          status: 'active'
        }])
        .select()
        .single();

      if (contractError) throw contractError;

      // 2. Ø­ÙØ¸ Ø§Ù„Ø¨Ù†ÙˆØ¯ ÙÙŠ Ø¬Ø¯ÙˆÙ„ subcontractor_contract_items Ø¥Ø°Ø§ ÙƒØ§Ù† Ø¹Ù‚Ø¯Ø§Ù‹ ØªÙØµÙŠÙ„ÙŠØ§Ù‹
      if (isItemized && contractItems.length > 0) {
        const { error: itemsError } = await supabase
          .from('subcontractor_contract_items')
          .insert(
            contractItems.map(item => ({
              contract_id: contractData.id,
              organization_id: organization?.id,
              item_name: item.item_name,
              unit: item.unit,
              quantity: item.quantity,
              unit_price: item.unit_price
            }))
          );
        if (itemsError) throw itemsError;
      }

      showToast('ØªÙ… Ø¥Ù†Ø´Ø§Ø¡ Ø§Ù„Ø¹Ù‚Ø¯ Ø¨Ù†Ø¬Ø§Ø­ âœ…', 'success');
      setIsCreating(false);
      setContractItems([]);
      setIsItemized(false);
      fetchContracts();
    } catch (error) {
      showToast(error.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-6 bg-gray-50 min-h-screen rtl">
      <div className="flex justify-between items-center mb-8">
        <div className="flex items-center gap-4">
          <button onClick={onBack} className="p-2 hover:bg-white rounded-full transition-colors shadow-sm">
            <ArrowRight size={24} />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
              <FileText className="text-purple-600" />
              Ø¹Ù‚ÙˆØ¯ Ù…Ù‚Ø§ÙˆÙ„ Ø§Ù„Ø¨Ø§Ø·Ù†
            </h1>
            <p className="text-gray-500 mt-1">Ø¥Ø¯Ø§Ø±Ø© Ø§Ù„Ø§Ø±ØªØ¨Ø§Ø·Ø§Øª Ø§Ù„Ù…Ø§Ù„ÙŠØ© Ù„Ù„Ù…Ø´Ø§Ø±ÙŠØ¹</p>
          </div>
        </div>
        <button 
          onClick={() => {
            setIsCreating(true);
            setNewContract({
              contract_name: '',
              project_id: '',
              total_value: 0,
              retention_percentage: 5
            });
            setContractItems([]);
            setIsItemized(false);
          }}
          className="bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-lg flex items-center gap-2 transition-all shadow-lg shadow-purple-100"
        >
          <Plus size={20} />
          Ø¹Ù‚Ø¯ Ø¬Ø¯ÙŠØ¯
        </button>
      </div>

      {isCreating && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4 text-right">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-6 border-b flex justify-between items-center bg-gray-50">
              <h3 className="font-bold text-xl text-gray-800 flex items-center gap-2">
                <Plus className="text-purple-600" size={24} /> Ø¥Ù†Ø´Ø§Ø¡ Ø¹Ù‚Ø¯ Ù…Ù‚Ø§ÙˆÙ„ Ø¨Ø§Ø·Ù†
              </h3>
              <button onClick={() => setIsCreating(false)} className="text-gray-400 hover:text-gray-600 transition-colors"><X size={24} /></button>
            </div>
            <form onSubmit={handleCreateContract} className="p-6 space-y-4 overflow-y-auto">
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-1">Ø§Ø³Ù… Ø§Ù„Ø¹Ù‚Ø¯ / Ø§Ù„ØªÙˆØµÙŠÙ</label>
                <input type="text" required value={newContract.contract_name} onChange={e => setNewContract({...newContract, contract_name: e.target.value})} className="w-full p-2.5 border rounded-xl outline-none focus:ring-2 focus:ring-purple-500" placeholder="Ù…Ø«Ù„Ø§Ù‹: Ø£Ø¹Ù…Ø§Ù„ Ø§Ù„Ø³Ø¨Ø§ÙƒØ© - Ø¹Ù…Ø§Ø±Ø© A" />
              </div>
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-1">Ø§Ù„Ù…Ø´Ø±ÙˆØ¹ Ø§Ù„Ù…Ø±ØªØ¨Ø·</label>
                <select required value={newContract.project_id} onChange={e => setNewContract({...newContract, project_id: e.target.value})} className="w-full p-2.5 border rounded-xl outline-none focus:ring-2 focus:ring-purple-500 bg-white">
                  <option value="">-- Ø§Ø®ØªØ± Ø§Ù„Ù…Ø´Ø±ÙˆØ¹ --</option>
                  {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>

              {/* Ø®ÙŠØ§Ø± Ø¨Ù†ÙˆØ¯ Ø§Ù„Ø¹Ù‚Ø¯ Ø§Ù„ØªÙØµÙŠÙ„ÙŠØ© */}
              <div className="flex items-center gap-2 py-1">
                <input 
                  type="checkbox" 
                  id="isItemizedCheckbox" 
                  checked={isItemized} 
                  onChange={e => {
                    setIsItemized(e.target.checked);
                    if (e.target.checked && contractItems.length === 0) {
                      setContractItems([{ item_name: '', unit: 'Ù…3', quantity: 0, unit_price: 0 }]);
                    }
                  }}
                  className="rounded border-gray-300 text-purple-600 focus:ring-purple-500 cursor-pointer"
                />
                <label htmlFor="isItemizedCheckbox" className="text-sm font-bold text-gray-700 cursor-pointer select-none">
                  Ø¹Ù‚Ø¯ ØªÙØµÙŠÙ„ÙŠ Ø¨Ø§Ù„Ø¨Ù†ÙˆØ¯ (Ø¬Ø¯ÙˆÙ„ Ø§Ù„ÙƒÙ…ÙŠØ§Øª)
                </label>
              </div>

              {isItemized && (
                <div className="border border-purple-100 rounded-xl p-3 bg-purple-50/20 space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="text-xs font-black text-purple-700">Ø¨Ù†ÙˆØ¯ Ø§Ù„Ø¹Ù‚Ø¯ Ø§Ù„ØªÙØµÙŠÙ„ÙŠØ©</span>
                    <button
                      type="button"
                      onClick={addContractItem}
                      className="text-xs bg-purple-600 text-white px-2 py-1 rounded-md hover:bg-purple-700 font-bold"
                    >
                      + Ø¥Ø¶Ø§ÙØ© Ø¨Ù†Ø¯ Ù„Ù„Ø¹Ù‚Ø¯
                    </button>
                  </div>
                  <div className="space-y-2 max-h-48 overflow-y-auto">
                    {contractItems.map((item, index) => (
                      <div key={index} className="flex gap-2 items-center bg-white p-2 rounded-lg border border-purple-100 shadow-sm text-xs">
                        <input
                          type="text" required
                          value={item.item_name}
                          onChange={e => updateContractItem(index, 'item_name', e.target.value)}
                          placeholder="Ø§Ø³Ù… Ø§Ù„Ø¨Ù†Ø¯"
                          className="flex-1 p-1.5 border rounded outline-none"
                        />
                        <input
                          type="text" required
                          value={item.unit}
                          onChange={e => updateContractItem(index, 'unit', e.target.value)}
                          placeholder="Ø§Ù„ÙˆØ­Ø¯Ø©"
                          className="w-12 p-1.5 border rounded text-center outline-none"
                        />
                        <input
                          type="number" required min="0.01" step="any"
                          value={item.quantity || ''}
                          onChange={e => updateContractItem(index, 'quantity', parseFloat(e.target.value) || 0)}
                          placeholder="Ø§Ù„ÙƒÙ…ÙŠØ©"
                          className="w-16 p-1.5 border rounded text-center outline-none"
                        />
                        <input
                          type="number" required min="0.01" step="any"
                          value={item.unit_price || ''}
                          onChange={e => updateContractItem(index, 'unit_price', parseFloat(e.target.value) || 0)}
                          placeholder="Ø§Ù„Ø³Ø¹Ø±"
                          className="w-20 p-1.5 border rounded text-center outline-none"
                        />
                        <button
                          type="button"
                          onClick={() => deleteContractItem(index)}
                          className="text-red-500 hover:text-red-700 p-1"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-1">Ù‚ÙŠÙ…Ø© Ø§Ù„Ø¹Ù‚Ø¯ Ø§Ù„Ø¥Ø¬Ù…Ø§Ù„ÙŠØ©</label>
                  <input 
                    type="number" required 
                    readOnly={isItemized} 
                    value={newContract.total_value} 
                    onChange={e => setNewContract({...newContract, total_value: parseFloat(e.target.value) || 0})} 
                    className={`w-full p-2.5 border rounded-xl outline-none ${isItemized ? 'bg-gray-100 text-gray-500 font-bold' : 'focus:ring-2 focus:ring-purple-500'}`} 
                  />
                </div>
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-1">Ù†Ø³Ø¨Ø© Ù…Ø­ØªØ¬Ø² Ø§Ù„Ø¶Ù…Ø§Ù† %</label>
                  <input type="number" required value={newContract.retention_percentage} onChange={e => setNewContract({...newContract, retention_percentage: parseFloat(e.target.value) || 0})} className="w-full p-2.5 border rounded-xl outline-none focus:ring-2 focus:ring-purple-500" />
                </div>
              </div>
              <button type="submit" disabled={loading} className="w-full bg-purple-600 hover:bg-purple-700 text-white py-3 rounded-xl font-bold flex items-center justify-center gap-2 transition-all">
                {loading ? <Loader2 className="animate-spin" /> : <><Save size={20} /> Ø­ÙØ¸ Ø§Ù„Ø¹Ù‚Ø¯</>}
              </button>
            </form>
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center items-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600"></div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {contracts.map((contract) => (
            <div key={contract.id} className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 hover:shadow-md transition-shadow">
              <div className="flex justify-between items-start mb-4">
                <div className="p-3 bg-purple-50 text-purple-600 rounded-xl">
                  <Briefcase size={24} />
                </div>
                <span className={`px-2 py-1 rounded text-xs font-medium ${
                  contract.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-700'
                }`}>
                  {contract.status === 'active' ? 'Ø³Ø§Ø±ÙŠ' : 'Ù…ÙƒØªÙ…Ù„'}
                </span>
              </div>

              <h3 className="text-lg font-bold text-gray-800 mb-1">{contract.contract_name}</h3>
              <p className="text-sm text-gray-500 mb-4 flex items-center gap-1">
                Ø§Ù„Ù…Ø´Ø±ÙˆØ¹: <span className="text-gray-700 font-medium">{contract.project_name}</span>
              </p>
              
              <div className="grid grid-cols-2 gap-4 mb-6">
                <div className="bg-gray-50 p-3 rounded-xl">
                  <span className="text-xs text-gray-400 block mb-1">Ù‚ÙŠÙ…Ø© Ø§Ù„Ø¹Ù‚Ø¯</span>
                  <div className="font-bold text-gray-800 flex items-center gap-1">
                    <DollarSign size={14} className="text-gray-400" />
                    {contract.total_value.toLocaleString()}
                  </div>
                </div>
                <div className="bg-gray-50 p-3 rounded-xl">
                  <span className="text-xs text-gray-400 block mb-1">Ù†Ø³Ø¨Ø© Ø§Ù„Ù…Ø­ØªØ¬Ø²</span>
                  <div className="font-bold text-purple-600 flex items-center gap-1">
                    <Percent size={14} />
                    {contract.retention_percentage}%
                  </div>
                </div>
              </div>

              {/* ðŸ—ï¸ Ø¹Ø±Ø¶ Ø±ØµÙŠØ¯ Ø§Ù„Ø¯ÙØ¹Ø© Ø§Ù„Ù…Ù‚Ø¯Ù…Ø© Ø§Ù„Ù…ØªØ¨Ù‚ÙŠ */}
              {contract.advance_payment_balance !== undefined && contract.advance_payment_balance > 0 ? (
                <div className="mb-4 p-3 bg-blue-50 rounded-xl border border-blue-100 flex justify-between items-center">
                  <span className="text-xs font-bold text-blue-600">Ø§Ù„Ø¯ÙØ¹Ø© Ø§Ù„Ù…Ù‚Ø¯Ù…Ø© Ø§Ù„Ù…ØªØ¨Ù‚ÙŠØ©:</span>
                  <span className="font-black text-blue-700 font-mono">
                    {contract.advance_payment_balance.toLocaleString()} Ø¬.Ù…
                  </span>
                </div>
              ) : null}

              <div className="grid grid-cols-2 gap-2 mt-4">
                <button
                  onClick={() => {
                    setAdvanceTargetContract(contract);
                    setAdvanceData({
                      amount: 0,
                      source_account_id: '',
                      date: new Date().toISOString().split('T')[0],
                      notes: `Ø¯ÙØ¹Ø© Ù…Ù‚Ø¯Ù…Ø© Ù„Ø¹Ù‚Ø¯: ${contract.contract_name}`
                    });
                    setIsDisbursingAdvance(true);
                  }}
                  className="bg-emerald-50 hover:bg-emerald-600 hover:text-white text-emerald-700 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1 border border-emerald-200 shadow-sm"
                >
                  <Coins size={15} /> ØµØ±Ù Ø¯ÙØ¹Ø© Ù…Ù‚Ø¯Ù…Ø©
                </button>

                <button
                  onClick={() => onViewBillings(contract.id)}
                  className="bg-purple-50 hover:bg-purple-600 hover:text-white text-purple-700 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1 border border-purple-200 shadow-sm"
                >
                  <FileText size={15} /> Ø§Ù„Ù…Ø³ØªØ®Ù„ØµØ§Øª
                </button>
              </div>
            </div>
          ))}

          {contracts.length === 0 && (
            <div className="col-span-full bg-white rounded-3xl p-16 text-center border-2 border-dashed border-gray-100">
              <FileText size={48} className="mx-auto text-gray-200 mb-4" />
              <p className="text-gray-500">Ù„Ø§ ØªÙˆØ¬Ø¯ Ø¹Ù‚ÙˆØ¯ Ù…Ø³Ø¬Ù„Ø© Ù„Ù‡Ø°Ø§ Ø§Ù„Ù…Ù‚Ø§ÙˆÙ„</p>
            </div>
          )}
        </div>
      )}

      {/* Ù…ÙˆØ¯Ø§Ù„ ØµØ±Ù Ø¯ÙØ¹Ø© Ù…Ù‚Ø¯Ù…Ø© Ù„Ù…Ù‚Ø§ÙˆÙ„ Ø§Ù„Ø¨Ø§Ø·Ù† */}
      {isDisbursingAdvance && advanceTargetContract && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4 rtl text-right">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-6 bg-emerald-50 border-b border-emerald-100 flex justify-between items-center">
              <h3 className="font-black text-emerald-800 flex items-center gap-2">
                <Coins size={22} className="text-emerald-600" /> ØµØ±Ù Ø¯ÙØ¹Ø© Ù…Ù‚Ø¯Ù…Ø© Ù„Ù…Ù‚Ø§ÙˆÙ„ Ø§Ù„Ø¨Ø§Ø·Ù†
              </h3>
              <button onClick={() => setIsDisbursingAdvance(false)} className="text-emerald-400 hover:text-emerald-600">
                <X size={24} />
              </button>
            </div>

            <form onSubmit={handleDisburseAdvance} className="p-8 space-y-5">
              <div className="bg-emerald-50/50 p-3 rounded-xl border border-emerald-100 text-xs text-emerald-800">
                <p className="font-bold">Ø¹Ù‚Ø¯: {advanceTargetContract.contract_name}</p>
                <p className="text-emerald-600 mt-0.5">Ù…Ø´Ø±ÙˆØ¹: {advanceTargetContract.project_name}</p>
              </div>

              <div>
                <label className="block text-xs font-black text-gray-400 uppercase mb-2">Ù…Ø¨Ù„Øº Ø§Ù„Ø¯ÙØ¹Ø© Ø§Ù„Ù…Ù‚Ø¯Ù…Ø© (Ø¬.Ù…) *</label>
                <div className="relative">
                  <input 
                    type="number" required min="0.01" step="0.01"
                    value={advanceData.amount || ''}
                    onChange={e => setAdvanceData({ ...advanceData, amount: parseFloat(e.target.value) || 0 })}
                    placeholder="0.00"
                    className="w-full border-2 border-gray-100 rounded-2xl p-3 pl-12 text-2xl font-black text-emerald-700 focus:border-emerald-500 outline-none"
                  />
                  <DollarSign className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-300" />
                </div>
              </div>

              <div>
                <label className="block text-xs font-black text-gray-400 uppercase mb-2">Ø­Ø³Ø§Ø¨ Ø§Ù„ØµØ±Ù (Ø§Ù„Ø®Ø²ÙŠÙ†Ø© Ø£Ùˆ Ø§Ù„Ø¨Ù†Ùƒ) *</label>
                <select 
                  required
                  value={advanceData.source_account_id}
                  onChange={e => setAdvanceData({ ...advanceData, source_account_id: e.target.value })}
                  className="w-full border-2 border-gray-100 rounded-2xl p-3 focus:border-emerald-500 outline-none font-bold bg-white"
                >
                  <option value="">-- Ø§Ø®ØªØ± Ø§Ù„Ø®Ø²ÙŠÙ†Ø© Ø£Ùˆ Ø§Ù„Ø¨Ù†Ùƒ Ø§Ù„Ù…ØµØ±ÙˆÙ Ù…Ù†Ù‡ --</option>
                  {cashAndBankAccounts.map(acc => (
                    <option key={acc.id} value={acc.id}>
                      {acc.code} - {acc.name}
                    </option>
                  ))}
                </select>
                <p className="text-[11px] text-gray-400 mt-1">Ø³ÙŠØªÙ… ØªÙˆÙ„ÙŠØ¯ Ù‚ÙŠØ¯: Ù…Ù† Ø­/ Ø¯ÙØ¹Ø§Øª Ù…Ù‚Ø¯Ù…Ø© Ù„Ù„Ù…Ù‚Ø§ÙˆÙ„ÙŠÙ† (1245) Ø¥Ù„Ù‰ Ø­/ Ø§Ù„Ø®Ø²ÙŠÙ†Ø© Ø£Ùˆ Ø§Ù„Ø¨Ù†Ùƒ</p>
              </div>

              <div className="grid grid-cols-1 gap-4">
                <div>
                  <label className="block text-xs font-black text-gray-400 uppercase mb-2">ØªØ§Ø±ÙŠØ® Ø§Ù„ØµØ±Ù</label>
                  <input 
                    type="date" required
                    value={advanceData.date}
                    onChange={e => setAdvanceData({ ...advanceData, date: e.target.value })}
                    className="w-full border-2 border-gray-100 rounded-2xl p-3 focus:border-emerald-500 outline-none font-bold"
                  />
                </div>
                <div>
                  <label className="block text-xs font-black text-gray-400 uppercase mb-2">Ù…Ù„Ø§Ø­Ø¸Ø§Øª / Ø§Ù„Ø¨ÙŠØ§Ù†</label>
                  <input 
                    type="text"
                    value={advanceData.notes}
                    onChange={e => setAdvanceData({ ...advanceData, notes: e.target.value })}
                    className="w-full border-2 border-gray-100 rounded-2xl p-3 focus:border-emerald-500 outline-none font-medium text-sm"
                    placeholder="Ù…Ù„Ø§Ø­Ø¸Ø§Øª Ø­ÙˆÙ„ Ø§Ù„Ø¯ÙØ¹Ø© Ø§Ù„Ù…Ù‚Ø¯Ù…Ø©..."
                  />
                </div>
              </div>

              <button 
                type="submit" 
                disabled={loading} 
                className="w-full bg-emerald-600 hover:bg-emerald-700 text-white py-4 rounded-2xl font-black shadow-lg shadow-emerald-100 transition-all flex items-center justify-center gap-2"
              >
                {loading ? <Loader2 className="animate-spin" /> : <><Save size={20} /> ØªØ£ÙƒÙŠØ¯ ÙˆØµØ±Ù Ø§Ù„Ø¯ÙØ¹Ø© Ø§Ù„Ù…Ù‚Ø¯Ù…Ø©</>}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default SubcontractorContractsManager;

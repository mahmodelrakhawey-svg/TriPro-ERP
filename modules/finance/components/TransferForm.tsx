import React, { useState, useMemo } from 'react';
import { useAccounting } from '../../../context/AccountingContext';
import { useToast } from '../../../context/ToastContext';
import { 
  ArrowRightLeft, Save, DollarSign, Loader2, Building2, 
  History, Trash2, Edit, Search, Plus, AlertCircle, X, RefreshCw 
} from 'lucide-react';
import { z } from 'zod';

const TransferForm = () => {
  const { addTransfer, updateTransfer, deleteTransfer, accounts, entries } = useAccounting();
  const { showToast } = useToast();
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'new' | 'history'>('new');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  
  const [formData, setFormData] = useState({
    date: new Date().toISOString().split('T')[0],
    sourceAccountId: '',
    destinationAccountId: '',
    amount: '',
    description: ''
  });

  // ØªØµÙÙŠØ© Ø­Ø³Ø§Ø¨Ø§Øª Ø§Ù„Ù†Ù‚Ø¯ÙŠØ© ÙˆØ§Ù„Ø¨Ù†ÙˆÙƒ (Ø§Ù„Ø£ØµÙˆÙ„ Ø§Ù„Ù…ØªØ¯Ø§ÙˆÙ„Ø© - Ø§Ø³ØªØ¨Ø¹Ø§Ø¯ Ø§Ù„Ø­Ø³Ø§Ø¨Ø§Øª Ø§Ù„Ø±Ø¦ÙŠØ³ÙŠØ© ÙˆØ§Ù„ØªØ¬Ù…ÙŠØ¹ÙŠØ© Ù‚Ø·ÙŠØ¹Ø§Ù‹)
  const treasuryAccounts = useMemo(() => accounts.filter(a => 
    !(a.isGroup || a.is_group) &&
    a.code !== '123' && a.code !== '12' && a.code !== '1' && (
      a.code.startsWith('123') || a.code.startsWith('101') || 
      a.name.includes('Ø®Ø²ÙŠÙ†Ø©') || 
      a.name.includes('Ù†Ù‚Ø¯') || 
      a.name.includes('Ø¨Ù†Ùƒ') || 
      a.name.includes('ØµÙ†Ø¯ÙˆÙ‚')
    )
  ), [accounts]);

  // ÙÙ„ØªØ±Ø© ÙˆØªØ­Ø¶ÙŠØ± Ø§Ù„ØªØ­ÙˆÙŠÙ„Ø§Øª Ø§Ù„Ù…Ø§Ù„ÙŠØ© Ù…Ù† Ù‚ÙŠÙˆØ¯ Ø§Ù„ÙŠÙˆÙ…ÙŠØ© Ø§Ù„Ù…ØªØ§Ø­Ø© ÙÙŠ Ø§Ù„Ø³ÙŠØ§Ù‚
  const treasuryTransfers = useMemo(() => {
    return (entries || [])
      .filter(entry => entry.reference && entry.reference.startsWith('TRF-'))
      .map(entry => {
        const lines = entry.journal_lines || [];
        // Ø³Ø·Ø± Ø§Ù„Ø¯Ø§Ø¦Ù† Ù‡Ùˆ Ø§Ù„Ø­Ø³Ø§Ø¨ Ø§Ù„Ù…ØµØ¯Ø± (Ù†Ù‚ØµØª Ø£Ù…ÙˆØ§Ù„Ù‡)
        const sourceLine = lines.find(l => Number(l.credit) > 0);
        // Ø³Ø·Ø± Ø§Ù„Ù…Ø¯ÙŠÙ† Ù‡Ùˆ Ø§Ù„Ø­Ø³Ø§Ø¨ Ø§Ù„Ù…Ø³ØªÙ„Ù… (Ø²Ø§Ø¯Øª Ø£Ù…ÙˆØ§Ù„Ù‡)
        const destLine = lines.find(l => Number(l.debit) > 0);
        
        const sourceAccount = accounts.find(a => a.id === sourceLine?.account_id);
        const destinationAccount = accounts.find(a => a.id === destLine?.account_id);
        
        return {
          id: entry.id,
          date: entry.transaction_date || entry.date || '',
          description: entry.description,
          reference: entry.reference,
          amount: sourceLine ? Number(sourceLine.credit) : (destLine ? Number(destLine.debit) : 0),
          sourceAccountId: sourceLine?.account_id || '',
          sourceAccountName: sourceAccount ? `${sourceAccount.name} (${sourceAccount.code})` : 'ØºÙŠØ± Ù…Ø¹Ø±ÙˆÙ',
          destinationAccountId: destLine?.account_id || '',
          destinationAccountName: destinationAccount ? `${destinationAccount.name} (${destinationAccount.code})` : 'ØºÙŠØ± Ù…Ø¹Ø±ÙˆÙ',
        };
      })
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [entries, accounts]);

  // ÙÙ„ØªØ±Ø© Ø­Ø³Ø¨ Ø§Ù„Ø¨Ø­Ø« Ø§Ù„Ø³Ø±ÙŠØ¹
  const filteredTransfers = useMemo(() => {
    if (!searchTerm.trim()) return treasuryTransfers;
    const term = searchTerm.toLowerCase();
    return treasuryTransfers.filter(t => 
      t.description?.toLowerCase().includes(term) ||
      t.reference?.toLowerCase().includes(term) ||
      t.sourceAccountName?.toLowerCase().includes(term) ||
      t.destinationAccountName?.toLowerCase().includes(term) ||
      t.amount.toString().includes(term) ||
      t.date.includes(term)
    );
  }, [treasuryTransfers, searchTerm]);

  const resetForm = () => {
    setFormData({
      date: new Date().toISOString().split('T')[0],
      sourceAccountId: '',
      destinationAccountId: '',
      amount: '',
      description: ''
    });
    setEditingId(null);
  };

  const handleEditInit = (transfer: Record<string, any>) => {
    setFormData({
      date: transfer.date,
      sourceAccountId: transfer.sourceAccountId,
      destinationAccountId: transfer.destinationAccountId,
      amount: transfer.amount.toString(),
      description: transfer.description || ''
    });
    setEditingId(transfer.id);
    setActiveTab('new');
  };

  const handleDelete = async (id: string) => {
    setLoading(true);
    try {
      await deleteTransfer(id);
      showToast('ØªÙ… Ø§Ù„ØªØ±Ø§Ø¬Ø¹ Ø¹Ù† Ø§Ù„ØªØ­ÙˆÙŠÙ„ Ø§Ù„Ù…Ø§Ù„ÙŠ ÙˆØ­Ø°Ù Ø§Ù„Ù‚ÙŠØ¯ Ø¨Ù†Ø¬Ø§Ø­ ðŸ—‘ï¸', 'success');
      setDeleteConfirmId(null);
    } catch (error) {
      showToast('ÙØ´Ù„ Ø§Ù„ØªØ±Ø§Ø¬Ø¹ Ø¹Ù† Ø§Ù„ØªØ­ÙˆÙŠÙ„: ' + error.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const transferSchema = z.object({
        sourceAccountId: z.string().min(1, 'Ø§Ù„Ø±Ø¬Ø§Ø¡ Ø§Ø®ØªÙŠØ§Ø± Ø§Ù„Ø­Ø³Ø§Ø¨ Ø§Ù„Ù…ØµØ¯Ø±'),
        destinationAccountId: z.string().min(1, 'Ø§Ù„Ø±Ø¬Ø§Ø¡ Ø§Ø®ØªÙŠØ§Ø± Ø§Ù„Ø­Ø³Ø§Ø¨ Ø§Ù„Ù…Ø³ØªÙ„Ù…'),
        amount: z.number().min(0.01, 'Ø§Ù„Ù…Ø¨Ù„Øº ÙŠØ¬Ø¨ Ø£Ù† ÙŠÙƒÙˆÙ† Ø£ÙƒØ¨Ø± Ù…Ù† 0'),
        date: z.string().min(1, 'Ø§Ù„ØªØ§Ø±ÙŠØ® Ù…Ø·Ù„ÙˆØ¨'),
    }).refine(data => data.sourceAccountId !== data.destinationAccountId, {
        message: "Ù„Ø§ ÙŠÙ…ÙƒÙ† Ø§Ù„ØªØ­ÙˆÙŠÙ„ Ù„Ù†ÙØ³ Ø§Ù„Ø­Ø³Ø§Ø¨",
        path: ["destinationAccountId"]
    });

    const validationResult = transferSchema.safeParse({
        sourceAccountId: formData.sourceAccountId,
        destinationAccountId: formData.destinationAccountId,
        amount: Number(formData.amount),
        date: formData.date
    });

    if (!validationResult.success) {
        showToast(validationResult.error.issues[0].message, 'warning');
        return;
    }
    
    setLoading(true);
    try {
        if (editingId) {
          await updateTransfer(editingId, { ...formData, amount: Number(formData.amount) });
          showToast('ØªÙ… ØªØ¹Ø¯ÙŠÙ„ Ø§Ù„ØªØ­ÙˆÙŠÙ„ Ø§Ù„Ù…Ø§Ù„ÙŠ ÙˆØªØ­Ø¯ÙŠØ« Ø§Ù„Ø£Ø±ØµØ¯Ø© Ø¨Ù†Ø¬Ø§Ø­ âœ…', 'success');
          resetForm();
          setActiveTab('history');
        } else {
          await addTransfer({ ...formData, amount: Number(formData.amount) });
          showToast('ØªÙ… Ø§Ù„ØªØ­ÙˆÙŠÙ„ Ø§Ù„Ù…Ø§Ù„ÙŠ Ø¨Ù†Ø¬Ø§Ø­ âœ…', 'success');
          resetForm();
        }
    } catch (error) {
        showToast('ÙØ´Ù„ Ø§Ù„Ø¹Ù…Ù„ÙŠØ©: ' + error.message, 'error');
    } finally {
        setLoading(false);
    }
  };

  return (
    <div className={`mx-auto space-y-6 animate-in fade-in transition-all duration-300 ${activeTab === 'history' ? 'max-w-6xl' : 'max-w-3xl'}`}>
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
            <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
                <ArrowRightLeft className="text-blue-600" /> ØªØ­ÙˆÙŠÙ„ Ù†Ù‚Ø¯ÙŠØ©
            </h2>
            <p className="text-slate-500">Ù†Ù‚Ù„ Ø§Ù„Ø£Ù…ÙˆØ§Ù„ Ø¨ÙŠÙ† Ø§Ù„Ø®Ø²Ø§Ø¦Ù† ÙˆØ§Ù„Ø¨Ù†ÙˆÙƒ ÙˆØ¥Ø¯Ø§Ø±Ø© Ù‚ÙŠÙˆØ¯Ù‡Ø§</p>
        </div>

        {/* Ø£Ø²Ø±Ø§Ø± Ø§Ù„ØªØ¨ÙˆÙŠØ¨ */}
        <div className="bg-slate-100 p-1.5 rounded-xl flex gap-1 border border-slate-200/50 self-end md:self-auto">
          <button
            onClick={() => { setActiveTab('new'); if (!editingId) resetForm(); }}
            className={`flex items-center gap-1.5 px-4 py-2 font-bold text-sm rounded-lg transition-all ${
              activeTab === 'new'
                ? 'bg-white text-blue-600 shadow-sm'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
            }`}
          >
            {editingId ? <Edit size={16} /> : <Plus size={16} />}
            <span>{editingId ? 'ØªØ¹Ø¯ÙŠÙ„ Ø§Ù„ØªØ­ÙˆÙŠÙ„' : 'ØªØ­ÙˆÙŠÙ„ Ø¬Ø¯ÙŠØ¯'}</span>
          </button>
          <button
            onClick={() => setActiveTab('history')}
            className={`flex items-center gap-1.5 px-4 py-2 font-bold text-sm rounded-lg transition-all ${
              activeTab === 'history'
                ? 'bg-white text-blue-600 shadow-sm'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
            }`}
          >
            <History size={16} />
            <span>Ø³Ø¬Ù„ Ø§Ù„ØªØ­ÙˆÙŠÙ„Ø§Øª</span>
            {treasuryTransfers.length > 0 && (
              <span className="bg-blue-100 text-blue-600 px-2 py-0.5 rounded-full text-xs font-black">
                {treasuryTransfers.length}
              </span>
            )}
          </button>
        </div>
      </div>

      {activeTab === 'new' ? (
        <form onSubmit={handleSubmit} className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 space-y-6">
          {editingId && (
            <div className="bg-blue-50 border border-blue-200 text-blue-800 px-4 py-3 rounded-lg flex justify-between items-center text-sm font-bold">
              <span className="flex items-center gap-2">
                <AlertCircle size={18} />
                Ø£Ù†Øª ØªÙ‚ÙˆÙ… Ø§Ù„Ø¢Ù† Ø¨ØªØ¹Ø¯ÙŠÙ„ Ø§Ù„ØªØ­ÙˆÙŠÙ„ Ø§Ù„Ù…Ø§Ù„ÙŠ Ø°Ùˆ Ø§Ù„Ø±Ù‚Ù… Ø§Ù„Ù…Ø±Ø¬Ø¹ÙŠ Ø§Ù„Ù…ÙˆØ¶Ø­ ÙÙŠ Ø³Ø¬Ù„ Ø§Ù„ØªØ­ÙˆÙŠÙ„Ø§Øª.
              </span>
              <button type="button" onClick={resetForm} className="text-blue-600 hover:text-blue-800 flex items-center gap-1">
                <X size={16} /> Ø¥Ù„ØºØ§Ø¡ Ø§Ù„ØªØ¹Ø¯ÙŠÙ„
              </button>
            </div>
          )}

          <div className="grid grid-cols-1 gap-6">
              <div>
                  <label className="block text-sm font-bold text-slate-700 mb-1">Ø§Ù„ØªØ§Ø±ÙŠØ®</label>
                  <input 
                    type="date" 
                    required 
                    className="w-full border rounded-lg p-2.5 outline-none focus:border-blue-500" 
                    value={formData.date} 
                    onChange={e => setFormData({...formData, date: e.target.value})} 
                  />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                      <label className="block text-sm font-bold text-slate-700 mb-1">Ù…Ù† Ø­Ø³Ø§Ø¨ (Ø§Ù„Ù…ØµØ¯Ø±)</label>
                      <div className="relative">
                        <select 
                          required 
                          className="w-full border rounded-lg p-2.5 appearance-none outline-none focus:border-blue-500" 
                          value={formData.sourceAccountId} 
                          onChange={e => setFormData({...formData, sourceAccountId: e.target.value})}
                        >
                            <option value="">-- Ø§Ø®ØªØ± --</option>
                            {treasuryAccounts.map(a => <option key={a.id} value={a.id}>{a.name} ({a.code})</option>)}
                        </select>
                        <Building2 className="absolute left-3 top-3 text-slate-400 pointer-events-none" size={18} />
                      </div>
                  </div>
                  <div>
                      <label className="block text-sm font-bold text-slate-700 mb-1">Ø¥Ù„Ù‰ Ø­Ø³Ø§Ø¨ (Ø§Ù„Ù…Ø³ØªÙ„Ù…)</label>
                      <div className="relative">
                        <select 
                          required 
                          className="w-full border rounded-lg p-2.5 appearance-none outline-none focus:border-blue-500" 
                          value={formData.destinationAccountId} 
                          onChange={e => setFormData({...formData, destinationAccountId: e.target.value})}
                        >
                            <option value="">-- Ø§Ø®ØªØ± --</option>
                            {treasuryAccounts.map(a => <option key={a.id} value={a.id}>{a.name} ({a.code})</option>)}
                        </select>
                        <Building2 className="absolute left-3 top-3 text-slate-400 pointer-events-none" size={18} />
                      </div>
                  </div>
              </div>

              <div>
                  <label className="block text-sm font-bold text-slate-700 mb-1">Ø§Ù„Ù…Ø¨Ù„Øº</label>
                  <div className="relative">
                      <input 
                        type="number" 
                        required 
                        min="0" 
                        step="0.01" 
                        className="w-full border rounded-lg p-2.5 pl-10 font-bold text-lg outline-none focus:border-blue-500" 
                        value={formData.amount} 
                        onChange={e => setFormData({...formData, amount: e.target.value})} 
                        placeholder="0.00" 
                      />
                      <DollarSign className="absolute left-3 top-3.5 text-slate-400" size={18} />
                  </div>
              </div>

              <div>
                  <label className="block text-sm font-bold text-slate-700 mb-1">Ù…Ù„Ø§Ø­Ø¸Ø§Øª</label>
                  <input 
                    type="text" 
                    className="w-full border rounded-lg p-2.5 outline-none focus:border-blue-500" 
                    value={formData.description} 
                    onChange={e => setFormData({...formData, description: e.target.value})} 
                    placeholder="Ø³Ø¨Ø¨ Ø§Ù„ØªØ­ÙˆÙŠÙ„..." 
                  />
              </div>
          </div>

          <div className="pt-4 border-t border-slate-100 flex justify-end gap-3">
              {editingId && (
                <button 
                  type="button" 
                  onClick={resetForm}
                  className="border border-slate-200 text-slate-600 px-6 py-3 rounded-lg font-bold hover:bg-slate-50"
                >
                  Ø¥Ù„ØºØ§Ø¡
                </button>
              )}
              <button 
                type="submit" 
                disabled={loading} 
                className="bg-blue-600 text-white px-8 py-3 rounded-lg font-bold shadow-lg hover:bg-blue-700 flex items-center gap-2 disabled:opacity-50"
              >
                  {loading ? <Loader2 className="animate-spin" /> : <Save size={20} />} 
                  <span>{editingId ? 'ØªØ­Ø¯ÙŠØ« Ø§Ù„ØªØ­ÙˆÙŠÙ„' : 'Ø¥ØªÙ…Ø§Ù… Ø§Ù„ØªØ­ÙˆÙŠÙ„'}</span>
              </button>
          </div>
        </form>
      ) : (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden flex flex-col space-y-4 p-6">
          {/* Ù…Ø­Ø±Ùƒ Ø§Ù„Ø¨Ø­Ø« Ø§Ù„Ø³Ø±ÙŠØ¹ */}
          <div className="relative">
            <Search className="absolute right-4 top-3 text-slate-400" size={20} />
            <input 
              type="text" 
              placeholder="Ø§Ù„Ø¨Ø­Ø« ÙÙŠ Ø§Ù„ØªØ­ÙˆÙŠÙ„Ø§Øª Ø§Ù„Ø³Ø§Ø¨Ù‚Ø© Ø¨Ø§Ù„ØªØ§Ø±ÙŠØ®ØŒ Ø§Ù„Ù…Ø¨Ù„ØºØŒ Ø§Ù„Ù…Ù„Ø§Ø­Ø¸Ø§ØªØŒ Ø£Ùˆ Ø§Ù„Ø­Ø³Ø§Ø¨Ø§Øª..." 
              value={searchTerm} 
              onChange={e => setSearchTerm(e.target.value)} 
              className="w-full border rounded-xl px-12 py-2.5 outline-none focus:border-blue-500 bg-slate-50 font-bold text-slate-700 text-sm" 
            />
          </div>

          {filteredTransfers.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-slate-400 space-y-3">
              <History size={48} className="text-slate-300" />
              <p className="font-bold text-slate-500">Ù„Ø§ ØªÙˆØ¬Ø¯ ØªØ­ÙˆÙŠÙ„Ø§Øª Ù…Ø§Ù„ÙŠØ© Ø³Ø§Ø¨Ù‚Ø© Ù…Ø·Ø§Ø¨Ù‚Ø© Ù„Ù„Ø¨Ø­Ø«</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-right border-collapse">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 text-xs font-black uppercase tracking-wider">
                  <tr>
                    <th className="py-4 px-4">ÙƒÙˆØ¯ Ø§Ù„Ø¹Ù…Ù„ÙŠØ©</th>
                    <th className="py-4 px-4">Ø§Ù„ØªØ§Ø±ÙŠØ®</th>
                    <th className="py-4 px-4">Ù…Ù† Ø­Ø³Ø§Ø¨ (Ø§Ù„Ù…ØµØ¯Ø±)</th>
                    <th className="py-4 px-4 text-center">â†’</th>
                    <th className="py-4 px-4">Ø¥Ù„Ù‰ Ø­Ø³Ø§Ø¨ (Ø§Ù„Ù…Ø³ØªÙ„Ù…)</th>
                    <th className="py-4 px-4 text-center">Ø§Ù„Ù…Ø¨Ù„Øº</th>
                    <th className="py-4 px-4">Ù…Ù„Ø§Ø­Ø¸Ø§Øª</th>
                    <th className="py-4 px-4 text-center w-28">Ø¥Ø¬Ø±Ø§Ø¡Ø§Øª</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-sm">
                  {filteredTransfers.map(transfer => (
                    <tr key={transfer.id} className="hover:bg-slate-50/50 transition-colors group">
                      <td className="py-4 px-4 font-mono font-bold text-blue-600">{transfer.reference}</td>
                      <td className="py-4 px-4 text-slate-600 font-medium">{transfer.date}</td>
                      <td className="py-4 px-4 font-semibold text-slate-700">{transfer.sourceAccountName}</td>
                      <td className="py-4 px-4 text-center text-slate-400">
                        <ArrowRightLeft size={14} className="inline text-blue-400" />
                      </td>
                      <td className="py-4 px-4 font-semibold text-slate-700">{transfer.destinationAccountName}</td>
                      <td className="py-4 px-4 text-center font-black text-slate-900">
                        {transfer.amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                      <td className="py-4 px-4 text-slate-500 text-xs max-w-xs truncate" title={transfer.description}>
                        {transfer.description || '-'}
                      </td>
                      <td className="py-4 px-4 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          <button 
                            onClick={() => handleEditInit(transfer)}
                            className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                            title="ØªØ¹Ø¯ÙŠÙ„ Ø§Ù„ØªØ­ÙˆÙŠÙ„"
                          >
                            <Edit size={16} />
                          </button>
                          <button 
                            onClick={() => setDeleteConfirmId(transfer.id)}
                            className="p-1.5 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                            title="Ø§Ù„ØªØ±Ø§Ø¬Ø¹ Ø¹Ù† Ø§Ù„ØªØ­ÙˆÙŠÙ„"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Ù…ÙˆØ¯Ø§Ù„ Ø§Ù„ØªØ£ÙƒÙŠØ¯ Ø¹Ù„Ù‰ Ø§Ù„ØªØ±Ø§Ø¬Ø¹ ÙˆØ§Ù„Ø­Ø°Ù */}
      {deleteConfirmId && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-white rounded-2xl shadow-xl border border-slate-100 max-w-md w-full p-6 space-y-6">
            <div className="flex items-center gap-3 text-red-600">
              <div className="p-2.5 bg-red-50 rounded-xl">
                <AlertCircle size={24} />
              </div>
              <h3 className="text-lg font-bold">ØªØ£ÙƒÙŠØ¯ Ø§Ù„ØªØ±Ø§Ø¬Ø¹ Ø¹Ù† Ø§Ù„ØªØ­ÙˆÙŠÙ„ Ø§Ù„Ù…Ø§Ù„ÙŠ</h3>
            </div>
            
            <p className="text-slate-600 text-sm leading-relaxed">
              Ù‡Ù„ Ø£Ù†Øª Ù…ØªØ£ÙƒØ¯ Ù…Ù† Ø±ØºØ¨ØªÙƒ ÙÙŠ Ø§Ù„ØªØ±Ø§Ø¬Ø¹ Ø¹Ù† Ù‡Ø°Ù‡ Ø§Ù„Ø¹Ù…Ù„ÙŠØ©ØŸ Ø³ÙŠØªÙ… Ø­Ø°Ù Ø§Ù„Ù‚ÙŠÙˆØ¯ Ø§Ù„ÙŠÙˆÙ…ÙŠØ© Ø§Ù„Ù…Ø­Ø§Ø³Ø¨ÙŠØ© Ø§Ù„Ù…Ø±ØªØ¨Ø·Ø© Ø¨Ø§Ù„ØªØ­ÙˆÙŠÙ„ Ù†Ù‡Ø§Ø¦ÙŠØ§Ù‹ ÙˆØ¥Ø¹Ø§Ø¯Ø© Ø§Ø­ØªØ³Ø§Ø¨ Ø§Ù„Ø£Ø±ØµØ¯Ø© Ø§Ù„Ù…ØªØ£Ø«Ø±Ø© ØªÙ„Ù‚Ø§Ø¦ÙŠØ§Ù‹. Ù„Ø§ ÙŠÙ…ÙƒÙ† Ø§Ù„ØªØ±Ø§Ø¬Ø¹ Ø¹Ù† Ù‡Ø°Ø§ Ø§Ù„Ø¥Ø¬Ø±Ø§Ø¡ Ù„Ø§Ø­Ù‚Ø§Ù‹.
            </p>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button 
                type="button" 
                onClick={() => setDeleteConfirmId(null)}
                disabled={loading}
                className="px-4 py-2 border border-slate-200 rounded-lg font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-50 text-sm"
              >
                Ø¥Ù„ØºØ§Ø¡
              </button>
              <button 
                type="button" 
                onClick={() => handleDelete(deleteConfirmId)}
                disabled={loading}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg font-bold flex items-center gap-1.5 disabled:opacity-50 text-sm shadow-md shadow-red-100"
              >
                {loading ? <Loader2 className="animate-spin" size={16} /> : <Trash2 size={16} />}
                <span>Ù†Ø¹Ù…ØŒ ØªØ±Ø§Ø¬Ø¹ ÙˆØ§Ø­Ø°Ù</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default TransferForm;

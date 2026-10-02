import React from 'react';
import { Trash2, Loader2, X } from 'lucide-react';
import { Organization } from '../types/saasTypes';

const DeleteConfirmModal = ({ isOpen, onClose, onConfirm, organization, confirmName, setConfirmName, loading }: Record<string, any>) => {
  if (!isOpen || !organization) return null;

  return (
    <div className="fixed inset-0 bg-black/50 z-[110] flex items-center justify-center p-4 backdrop-blur-sm" dir="rtl">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200">
        <div className="p-6 space-y-6 text-center">
          <div className="w-20 h-20 bg-rose-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <Trash2 size={48} className="text-rose-600" />
          </div>
          <h3 className="font-black text-2xl text-slate-800">Ø­Ø°Ù Ø§Ù„Ù…Ù†Ø¸Ù…Ø© Ù†Ù‡Ø§Ø¦ÙŠØ§Ù‹ØŸ</h3>
          <p className="text-slate-500">
            Ø£Ù†Øª Ø¹Ù„Ù‰ ÙˆØ´Ùƒ Ø­Ø°Ù Ø´Ø±ÙƒØ© <span className="font-bold text-rose-600">"{organization.name}"</span>. 
            Ø³ÙŠØ¤Ø¯ÙŠ Ù‡Ø°Ø§ Ø§Ù„Ø¥Ø¬Ø±Ø§Ø¡ Ø¥Ù„Ù‰ Ù…Ø³Ø­ ÙƒØ§ÙØ© Ø§Ù„Ø¨ÙŠØ§Ù†Ø§ØªØŒ Ø§Ù„ÙÙˆØ§ØªÙŠØ±ØŒ Ø§Ù„Ù‚ÙŠÙˆØ¯ØŒ ÙˆØ§Ù„Ù…Ø³ØªØ®Ø¯Ù…ÙŠÙ† Ø§Ù„Ù…Ø±ØªØ¨Ø·ÙŠÙ† Ø¨Ù‡Ø§ Ù„Ù„Ø£Ø¨Ø¯.
          </p>
          
          <div className="space-y-2 text-right">
            <label className="text-sm font-bold text-slate-700">Ù„ØªØ£ÙƒÙŠØ¯ Ø§Ù„Ø­Ø°ÙØŒ ÙŠØ±Ø¬Ù‰ ÙƒØªØ§Ø¨Ø© Ø§Ø³Ù… Ø§Ù„Ø´Ø±ÙƒØ© Ø£Ø¯Ù†Ø§Ù‡:</label>
            <input 
              type="text" 
              className="w-full border-2 border-rose-100 rounded-xl p-3 outline-none focus:ring-2 focus:ring-rose-500 font-bold"
              placeholder={organization.name}
              value={confirmName}
              onChange={(e) => setConfirmName(e.target.value)}
            />
          </div>

          <div className="flex flex-col gap-3">
            <button 
              onClick={onConfirm}
              disabled={loading || confirmName.trim() !== organization.name.trim()}
              className="w-full bg-rose-600 text-white font-black py-4 rounded-2xl hover:bg-rose-700 flex items-center justify-center gap-2 shadow-lg shadow-rose-100 disabled:opacity-50"
            >
              {loading ? <Loader2 className="animate-spin" /> : <Trash2 size={20} />} 
              ØªØ£ÙƒÙŠØ¯ Ø§Ù„Ø­Ø°Ù Ø§Ù„Ù†Ù‡Ø§Ø¦ÙŠ
            </button>
            <button onClick={onClose} className="w-full py-3 text-slate-500 font-bold hover:text-slate-700">ØªØ±Ø§Ø¬Ø¹ ÙˆØ¥Ù„ØºØ§Ø¡</button>
          </div>
        </div>
      </div>
    </div>
  );
};


const OrphanedFilesModal = ({ isOpen, onClose, files, onDelete, loading }: Record<string, any>) => {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 bg-black/50 z-[120] flex items-center justify-center p-4 backdrop-blur-sm" dir="rtl">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl overflow-hidden animate-in zoom-in-95 flex flex-col max-h-[80vh]">
        <div className="p-6 border-b flex justify-between items-center bg-slate-50">
          <h3 className="font-black text-xl text-slate-800 flex items-center gap-2">
            <Trash2 className="text-rose-600" /> Ø§Ù„Ù…Ø±ÙÙ‚Ø§Øª Ø§Ù„ÙŠØªÙŠÙ…Ø© (ÙÙŠ Ø§Ù„Ù€ Storage ÙÙ‚Ø·)
          </h3>
          <button onClick={onClose} className="text-slate-400 hover:text-red-500"><X size={24} /></button>
        </div>
        <div className="p-6 overflow-y-auto flex-1">
          {files.length === 0 ? (
            <div className="text-center py-10 text-slate-500">Ù„Ø§ ØªÙˆØ¬Ø¯ Ù…Ù„ÙØ§Øª ÙŠØªÙŠÙ…Ø© Ø­Ø§Ù„ÙŠØ§Ù‹ âœ…</div>
          ) : (
            <div className="space-y-2">
              <p className="text-xs text-amber-600 font-bold mb-4 bg-amber-50 p-3 rounded-lg border border-amber-100">ØªØ­Ø°ÙŠØ±: Ù‡Ø°Ù‡ Ø§Ù„Ù…Ù„ÙØ§Øª Ù…ÙˆØ¬ÙˆØ¯Ø© ÙÙŠ Ø§Ù„Ù…Ø®Ø²Ù† Ø§Ù„Ø³Ø­Ø§Ø¨ÙŠ ÙˆÙ„ÙƒÙ† Ù„Ø§ ØªÙ…Ù„Ùƒ Ø£ÙŠ Ø³Ø¬Ù„ ÙŠØ´ÙŠØ± Ù„Ù‡Ø§ ÙÙŠ Ù‚Ø§Ø¹Ø¯Ø© Ø§Ù„Ø¨ÙŠØ§Ù†Ø§Øª.</p>
              {files.map((file: string) => (
                <div key={file} className="flex justify-between items-center p-3 bg-slate-50 rounded-xl border border-slate-100">
                  <span className="font-mono text-[10px] text-slate-600 truncate flex-1">{file}</span>
                  <button onClick={() => onDelete(file)} className="text-rose-600 hover:bg-rose-100 p-2 rounded-lg" title="Ø­Ø°Ù Ø§Ù„Ù…Ù„Ù Ù†Ù‡Ø§Ø¦ÙŠØ§Ù‹">
                    <Trash2 size={16} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="p-4 border-t bg-slate-50 flex justify-between gap-3">
          <button onClick={onClose} className="px-6 py-2 bg-white border border-slate-200 rounded-xl font-bold text-slate-600">Ø¥ØºÙ„Ø§Ù‚</button>
          {files.length > 0 && (
            <button onClick={() => onDelete('all')} disabled={loading} className="px-6 py-2 bg-rose-600 text-white rounded-xl font-bold hover:bg-rose-700 flex items-center gap-2">
              {loading ? <Loader2 className="animate-spin" /> : <Trash2 size={18} />} Ø­Ø°Ù ÙƒØ§ÙØ© Ø§Ù„ÙŠØªØ§Ù…Ù‰
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export { DeleteConfirmModal, OrphanedFilesModal };

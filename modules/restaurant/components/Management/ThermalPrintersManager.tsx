import React, { useState, useEffect } from 'react';
import {
  ThermalPrinterConfig,
  PrinterStation,
  thermalPrinterService,
  DEFAULT_PRINTERS
} from '../../../../services/thermalPrinterService';
import { useToast } from '../../../../context/ToastContext';
import {
  Printer,
  Plus,
  Trash2,
  Edit2,
  CheckCircle2,
  AlertTriangle,
  Wifi,
  Usb,
  Cpu,
  Layers,
  Sparkles,
  Zap,
  Play,
  RotateCcw
} from 'lucide-react';

export const ThermalPrintersManager: React.FC = () => {
  const { showToast } = useToast();
  const [printers, setPrinters] = useState<ThermalPrinterConfig[]>([]);
  const [editingPrinter, setEditingPrinter] = useState<ThermalPrinterConfig | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);

  const loadPrinters = () => {
    setPrinters(thermalPrinterService.getPrinters());
  };

  useEffect(() => {
    loadPrinters();
  }, []);

  const handleOpenAddModal = () => {
    setEditingPrinter({
      id: `prn-${Date.now().toString().slice(-4)}`,
      name: '',
      station: 'KITCHEN',
      connectionType: 'NETWORK_IP',
      ipAddress: '192.168.1.',
      port: 9100,
      paperWidth: '80mm',
      isActive: true
    });
    setIsModalOpen(true);
  };

  const handleSavePrinter = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingPrinter || !editingPrinter.name.trim()) {
      showToast('يرجى كتابة اسم الطابعة', 'warning');
      return;
    }

    thermalPrinterService.savePrinter(editingPrinter);
    showToast('تم حفظ إعدادات الطابعة بنجاح ✅', 'success');
    setIsModalOpen(false);
    loadPrinters();
  };

  const handleDelete = (id: string, name: string) => {
    if (window.confirm(`هل أنت متأكد من حذف طابعة "${name}"؟`)) {
      thermalPrinterService.deletePrinter(id);
      showToast('تم حذف الطابعة', 'info');
      loadPrinters();
    }
  };

  const handleTestPrint = async (printer: ThermalPrinterConfig) => {
    setTestResult(`جاري إرسال اختبار طباعة تجريبي إلى [${printer.name}]...`);
    const testPayload = {
      orderNumber: 'TEST-001',
      tableName: 'اختبار 1',
      orderType: 'DINE_IN',
      serverName: 'مدير النظام',
      items: [
        { name: 'وجبة تجريبية - مشويات مشكلة', quantity: 2, unitPrice: 150, notes: 'بدون شطة' },
        { name: 'عصير برتقال طازج', quantity: 1, unitPrice: 35 }
      ],
      grandTotal: 335
    };

    const bytes = thermalPrinterService.generateEscPosCommands(testPayload, printer, printer.station);
    const res = await thermalPrinterService.dispatchPrintJob(printer, bytes);

    if (res.success) {
      showToast(res.message, 'success');
      setTestResult(`✅ ${res.message}`);
    } else {
      showToast(res.message, 'error');
      setTestResult(`❌ ${res.message}`);
    }
  };

  const handleResetDefaults = () => {
    if (window.confirm('هل تريد إعادة تعيين إعدادات الطابعات إلى التكوين الافتراضي للمطعم؟')) {
      DEFAULT_PRINTERS.forEach(p => thermalPrinterService.savePrinter(p));
      loadPrinters();
      showToast('تم استعادة الطابعات الافتراضية بنجاح 🔄', 'success');
    }
  };

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-7xl mx-auto animate-in fade-in">
      {/* Header */}
      <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm flex flex-wrap justify-between items-center gap-4">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-gradient-to-br from-indigo-500 to-blue-700 rounded-2xl text-white shadow-md">
            <Printer className="w-8 h-8" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-2xl font-black text-slate-800">طابعات المطبخ والإيصالات الشبكية (ESC/POS)</h2>
              <span className="bg-indigo-100 text-indigo-800 text-xs px-2.5 py-0.5 rounded-full font-bold">
                Hardware Printing
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-1">
              الطباعة المباشرة الصامتة لطابعات المطبخ الحرارية (IP / Network) مع التوزيع الآلي لأقسام البار، الشواية، والكاشير
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleResetDefaults}
            className="px-3.5 py-2.5 border border-slate-200 text-slate-600 hover:bg-slate-50 rounded-xl text-xs font-bold flex items-center gap-1.5 transition"
          >
            <RotateCcw className="w-4 h-4" /> استعادة الافتراضي
          </button>
          <button
            onClick={handleOpenAddModal}
            className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold flex items-center gap-2 shadow-lg shadow-indigo-600/20 transition"
          >
            <Plus className="w-4 h-4" /> إضافة طابعة جديدة
          </button>
        </div>
      </div>

      {/* Diagnostic banner */}
      {testResult && (
        <div className="p-4 bg-slate-900 text-white rounded-2xl flex items-center justify-between text-xs font-mono animate-in slide-in-from-top-2">
          <span>{testResult}</span>
          <button onClick={() => setTestResult(null)} className="text-slate-400 hover:text-white font-bold">
            إغلاق
          </button>
        </div>
      )}

      {/* Printers Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {printers.map(printer => {
          const isNetwork = printer.connectionType === 'NETWORK_IP';
          return (
            <div
              key={printer.id}
              className={`bg-white rounded-3xl border p-5 shadow-sm space-y-4 transition hover:shadow-md flex flex-col justify-between ${
                printer.isActive ? 'border-slate-200' : 'border-slate-100 opacity-60'
              }`}
            >
              <div>
                <div className="flex justify-between items-start mb-3">
                  <div className="flex items-center gap-2">
                    <div
                      className={`p-2.5 rounded-xl ${
                        printer.station === 'BAR'
                          ? 'bg-amber-100 text-amber-700'
                          : printer.station === 'GRILL'
                          ? 'bg-rose-100 text-rose-700'
                          : printer.station === 'CASHIER'
                          ? 'bg-emerald-100 text-emerald-700'
                          : 'bg-blue-100 text-blue-700'
                      }`}
                    >
                      <Printer className="w-5 h-5" />
                    </div>
                    <div>
                      <span className="font-black text-slate-800 text-sm block">{printer.name}</span>
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">
                        {printer.station}
                      </span>
                    </div>
                  </div>

                  <span
                    className={`w-2.5 h-2.5 rounded-full ${
                      printer.isActive ? 'bg-emerald-500 ring-4 ring-emerald-100' : 'bg-slate-300'
                    }`}
                  />
                </div>

                <div className="space-y-1.5 text-xs text-slate-500 bg-slate-50 p-3 rounded-2xl font-mono">
                  <div className="flex justify-between">
                    <span>الاتصال:</span>
                    <span className="font-bold text-slate-700 flex items-center gap-1">
                      {isNetwork ? <Wifi className="w-3.5 h-3.5 text-indigo-600" /> : <Usb className="w-3.5 h-3.5" />}
                      {printer.connectionType}
                    </span>
                  </div>
                  {isNetwork && (
                    <div className="flex justify-between">
                      <span>عنوان IP:</span>
                      <span className="font-bold text-slate-800">{printer.ipAddress}:{printer.port || 9100}</span>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <span>عرض الورق:</span>
                    <span className="font-bold text-slate-700">{printer.paperWidth}</span>
                  </div>
                  {printer.isDefaultCashier && (
                    <div className="text-[11px] text-emerald-600 font-bold mt-1">
                      ⭐ طابعة الكاشير الافتراضية
                    </div>
                  )}
                </div>
              </div>

              <div className="pt-2 border-t border-slate-100 flex items-center justify-between gap-1">
                <button
                  onClick={() => handleTestPrint(printer)}
                  className="flex-1 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-xl text-xs font-bold flex items-center justify-center gap-1 transition"
                >
                  <Play className="w-3 h-3 fill-indigo-700" /> اختبار الطباعة
                </button>
                <button
                  onClick={() => {
                    setEditingPrinter(printer);
                    setIsModalOpen(true);
                  }}
                  className="p-2 hover:bg-slate-100 text-slate-500 rounded-xl"
                  title="تعديل"
                >
                  <Edit2 className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => handleDelete(printer.id, printer.name)}
                  className="p-2 hover:bg-rose-50 text-rose-500 rounded-xl"
                  title="حذف"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Add / Edit Modal */}
      {isModalOpen && editingPrinter && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-white rounded-3xl p-6 max-w-md w-full shadow-2xl space-y-4">
            <div className="flex justify-between items-center border-b pb-3">
              <h3 className="font-bold text-base text-slate-800">
                {editingPrinter.name ? 'تعديل بيانات الطابعة' : 'إضافة طابعة حرارية جديدة'}
              </h3>
              <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                ✕
              </button>
            </div>

            <form onSubmit={handleSavePrinter} className="space-y-3.5 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">اسم الطابعة:</label>
                <input
                  type="text"
                  required
                  placeholder="مثلاً: طابعة الشواية - الدور الأرضي"
                  value={editingPrinter.name}
                  onChange={e => setEditingPrinter({ ...editingPrinter, name: e.target.value })}
                  className="w-full border rounded-xl p-2.5 outline-none focus:ring-1 focus:ring-indigo-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">محطة التوجيه (Station):</label>
                  <select
                    value={editingPrinter.station}
                    onChange={e => setEditingPrinter({ ...editingPrinter, station: e.target.value as PrinterStation })}
                    className="w-full border rounded-xl p-2.5 outline-none focus:ring-1 focus:ring-indigo-500 bg-white"
                  >
                    <option value="KITCHEN">المطبخ العام (Kitchen)</option>
                    <option value="GRILL">قسم الشواية (Grill)</option>
                    <option value="BAR">قسم البار والمشروبات (Bar)</option>
                    <option value="FRYER">المقالي والوجبات السريعة</option>
                    <option value="CASHIER">الكاشير الرئيسي (Cashier)</option>
                    <option value="ALL">كافة الأقسام (All)</option>
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">نوع الاتصال:</label>
                  <select
                    value={editingPrinter.connectionType}
                    onChange={e => setEditingPrinter({ ...editingPrinter, connectionType: e.target.value as any })}
                    className="w-full border rounded-xl p-2.5 outline-none focus:ring-1 focus:ring-indigo-500 bg-white"
                  >
                    <option value="NETWORK_IP">شبكة Ethernet / Wi-Fi IP</option>
                    <option value="BROWSER_USB">USB / محلي عبر المتصفح</option>
                  </select>
                </div>
              </div>

              {editingPrinter.connectionType === 'NETWORK_IP' && (
                <div className="grid grid-cols-3 gap-2">
                  <div className="col-span-2">
                    <label className="block font-bold text-slate-700 mb-1">عنوان IP الطابعة:</label>
                    <input
                      type="text"
                      placeholder="192.168.1.201"
                      value={editingPrinter.ipAddress || ''}
                      onChange={e => setEditingPrinter({ ...editingPrinter, ipAddress: e.target.value })}
                      className="w-full border rounded-xl p-2 font-mono text-xs outline-none focus:ring-1 focus:ring-indigo-500"
                    />
                  </div>
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">المنفذ (Port):</label>
                    <input
                      type="number"
                      placeholder="9100"
                      value={editingPrinter.port || 9100}
                      onChange={e => setEditingPrinter({ ...editingPrinter, port: Number(e.target.value) })}
                      className="w-full border rounded-xl p-2 font-mono text-xs outline-none focus:ring-1 focus:ring-indigo-500"
                    />
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">عرض الورق:</label>
                  <select
                    value={editingPrinter.paperWidth}
                    onChange={e => setEditingPrinter({ ...editingPrinter, paperWidth: e.target.value as any })}
                    className="w-full border rounded-xl p-2.5 outline-none focus:ring-1 focus:ring-indigo-500 bg-white"
                  >
                    <option value="80mm">80 ملم (القياسي للمطاعم)</option>
                    <option value="58mm">58 ملم (الصغير المحمول)</option>
                  </select>
                </div>

                <div className="flex items-center gap-2 pt-6">
                  <input
                    type="checkbox"
                    id="isDefaultCashier"
                    checked={editingPrinter.isDefaultCashier || false}
                    onChange={e => setEditingPrinter({ ...editingPrinter, isDefaultCashier: e.target.checked })}
                    className="w-4 h-4 text-indigo-600 rounded"
                  />
                  <label htmlFor="isDefaultCashier" className="font-bold text-slate-700 cursor-pointer">
                    تعيين كطابعة كاشير رئيسية
                  </label>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-4 border-t">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 border rounded-xl font-bold text-slate-600 hover:bg-slate-50"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold shadow"
                >
                  حفظ الطابعة
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
export default ThermalPrintersManager;

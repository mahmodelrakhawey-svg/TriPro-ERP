import React, { useState, useEffect } from 'react';
import {
  ThermalPrinterConfig,
  PrinterStation,
  thermalPrinterService,
  DEFAULT_PRINTERS
} from '../../../../services/thermalPrinterService';
import { useToast } from '../../../../context/ToastContext';
import {
  Printer, Plus, Trash2, Edit2, CheckCircle2, AlertTriangle,
  Wifi, Usb, Cpu, Layers, Sparkles, Zap, Play, RotateCcw,
  Monitor, DollarSign, Radio, Volume2, ShieldCheck, Terminal
} from 'lucide-react';

export const ThermalPrintersManager: React.FC = () => {
  const { showToast } = useToast();
  const [printers, setPrinters] = useState<ThermalPrinterConfig[]>([]);
  const [editingPrinter, setEditingPrinter] = useState<ThermalPrinterConfig | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);

  // Hardware Connection States
  const [usbConnectedDevice, setUsbConnectedDevice] = useState<string | null>(null);
  const [serialConnected, setSerialConnected] = useState<boolean>(false);
  const [poleDisplayConnected, setPoleDisplayConnected] = useState<boolean>(false);
  const [poleTestText, setPoleTestText] = useState('وجبة كباب 180 ج.م');

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
      station: 'CASHIER',
      connectionType: 'WEB_USB',
      ipAddress: '192.168.1.200',
      port: 9100,
      serialBaudRate: 9600,
      paperWidth: '80mm',
      isDefaultCashier: true,
      hasCashDrawer: true,
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

  // Test Print Ticket
  const handleTestPrint = async (printer: ThermalPrinterConfig) => {
    setTestResult(`جاري إرسال اختبار طباعة مباشر إلى [${printer.name}]...`);
    const testPayload = {
      orderNumber: 'TEST-900',
      tableName: 'طاولة 5 (تجريبي)',
      orderType: 'DINE_IN',
      serverName: 'كاشير المحل',
      items: [
        { name: 'مشويات مشكلة عائلي', quantity: 1, unitPrice: 320, totalPrice: 320, notes: 'أرز إضافي' },
        { name: 'عصير برتقال فريش', quantity: 2, unitPrice: 35, totalPrice: 70 }
      ],
      subtotal: 390,
      tax: 54.6,
      grandTotal: 444.6
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

  // WebUSB Direct Connect
  const handleConnectUsb = async () => {
    const res = await thermalPrinterService.connectWebUsbPrinter();
    if (res.success) {
      setUsbConnectedDevice(res.deviceName || 'طابعة حرارية USB');
      showToast(res.message, 'success');
    } else {
      showToast(res.message, 'warning');
    }
  };

  // WebSerial Direct Connect
  const handleConnectSerial = async () => {
    const res = await thermalPrinterService.connectWebSerialPrinter(9600);
    if (res.success) {
      setSerialConnected(true);
      showToast(res.message, 'success');
    } else {
      showToast(res.message, 'warning');
    }
  };

  // VFD Customer Pole Display Connect
  const handleConnectPoleDisplay = async () => {
    const res = await thermalPrinterService.connectPoleDisplay(9600);
    if (res.success) {
      setPoleDisplayConnected(true);
      showToast(res.message, 'success');
    } else {
      showToast(res.message, 'warning');
    }
  };

  // Test Cash Drawer Kickout Pulse
  const handleTestCashDrawer = async () => {
    const res = await thermalPrinterService.kickoutCashDrawer();
    showToast(res.message, 'success');
  };

  return (
    <div className="p-8 bg-slate-50 min-h-screen text-right rtl">
      
      {/* 🏷️ Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8 bg-white p-6 rounded-3xl border border-slate-100 shadow-sm">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-gradient-to-br from-indigo-500 to-purple-600 text-white rounded-2xl shadow-lg shadow-indigo-500/20">
            <Printer size={28} />
          </div>
          <div>
            <h2 className="text-2xl font-black text-slate-800">طابعات الإيصالات وأجهزة الكاشير (WebUSB & ESC/POS)</h2>
            <p className="text-xs text-slate-400 mt-1">الربط المباشر مع طابعات الفواتير الحرارية، شاشات العميل VFD، ودرج النقدية بدون حوار الطباعة.</p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={handleConnectUsb}
            className={`px-4 py-2.5 rounded-2xl text-xs font-black transition-all flex items-center gap-2 border ${
              usbConnectedDevice
                ? 'bg-emerald-50 border-emerald-300 text-emerald-700 shadow-sm'
                : 'bg-white hover:bg-slate-50 border-slate-200 text-slate-700'
            }`}
          >
            <Usb size={16} className={usbConnectedDevice ? 'text-emerald-600' : 'text-slate-400'} />
            {usbConnectedDevice ? `USB متصل: ${usbConnectedDevice.slice(0, 14)}` : 'ربط طابعة USB مباشرة'}
          </button>

          <button
            onClick={handleConnectPoleDisplay}
            className={`px-4 py-2.5 rounded-2xl text-xs font-black transition-all flex items-center gap-2 border ${
              poleDisplayConnected
                ? 'bg-cyan-50 border-cyan-300 text-cyan-700 shadow-sm'
                : 'bg-white hover:bg-slate-50 border-slate-200 text-slate-700'
            }`}
          >
            <Monitor size={16} className={poleDisplayConnected ? 'text-cyan-600' : 'text-slate-400'} />
            {poleDisplayConnected ? 'شاشة العميل متصلة 📟' : 'ربط شاشة العميل VFD'}
          </button>

          <button
            onClick={handleTestCashDrawer}
            className="px-4 py-2.5 bg-amber-50 hover:bg-amber-100 border border-amber-200 text-amber-800 rounded-2xl text-xs font-black transition-all flex items-center gap-2"
          >
            <DollarSign size={16} />
            فتح درج النقدية (Pulse)
          </button>

          <button
            onClick={handleOpenAddModal}
            className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl text-xs font-black shadow-lg shadow-indigo-600/20 transition-all flex items-center gap-2"
          >
            <Plus size={16} />
            إضافة طابعة جديدة
          </button>
        </div>
      </div>

      {/* 📟 VFD Customer Display Testing Bar */}
      {poleDisplayConnected && (
        <div className="mb-6 p-4 bg-slate-900 rounded-2xl text-white flex items-center justify-between shadow-xl">
          <div className="flex items-center gap-3">
            <Monitor className="text-cyan-400" size={24} />
            <div>
              <span className="font-mono text-xs text-cyan-400 font-bold block">VFD POLE DISPLAY CONNECTED (COM / Serial)</span>
              <span className="text-[11px] text-slate-400">شاشة العميل متصلة ومستعدة لعرض الأسعار تلقائياً عند مسح الباركود.</span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <input
              type="text"
              value={poleTestText}
              onChange={e => setPoleTestText(e.target.value)}
              className="bg-slate-800 border border-slate-700 rounded-xl px-3 py-1.5 text-xs text-white outline-none font-mono"
            />
            <button
              onClick={() => thermalPrinterService.showItemOnPoleDisplay(poleTestText, 180)}
              className="px-3 py-1.5 bg-cyan-600 hover:bg-cyan-500 text-white rounded-xl text-xs font-bold transition-all"
            >
              إرسال تجريبي للشاشة
            </button>
          </div>
        </div>
      )}

      {/* 🖨️ Printers Grid Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        {printers.map((printer) => {
          const isUsb = printer.connectionType === 'WEB_USB';
          const isSerial = printer.connectionType === 'WEB_SERIAL';
          const isNet = printer.connectionType === 'NETWORK_IP';

          return (
            <div
              key={printer.id}
              className={`p-6 rounded-3xl bg-white border transition-all shadow-sm flex flex-col justify-between space-y-4 ${
                printer.isDefaultCashier ? 'border-indigo-300 ring-2 ring-indigo-500/10' : 'border-slate-100'
              }`}
            >
              <div>
                <div className="flex justify-between items-start mb-3">
                  <div className={`p-3 rounded-2xl ${
                    isUsb ? 'bg-emerald-50 text-emerald-600' :
                    isSerial ? 'bg-cyan-50 text-cyan-600' :
                    'bg-indigo-50 text-indigo-600'
                  }`}>
                    {isUsb ? <Usb size={20} /> : isSerial ? <Cpu size={20} /> : <Wifi size={20} />}
                  </div>

                  <div className="flex items-center gap-1.5">
                    {printer.isDefaultCashier && (
                      <span className="px-2 py-0.5 bg-indigo-50 text-indigo-600 border border-indigo-200 rounded-full text-[10px] font-black">
                        طابعة الكاشير
                      </span>
                    )}
                    {printer.hasCashDrawer && (
                      <span className="px-2 py-0.5 bg-amber-50 text-amber-600 border border-amber-200 rounded-full text-[10px] font-black">
                        درج نقدية
                      </span>
                    )}
                  </div>
                </div>

                <h3 className="text-base font-black text-slate-800 mb-1">{printer.name}</h3>
                
                <div className="text-xs text-slate-400 space-y-1 font-mono mt-3 pt-3 border-t border-slate-50">
                  <div>القسم: <span className="font-sans font-bold text-slate-700">{printer.station}</span></div>
                  <div>النوع: <span className="text-slate-700 font-bold">{printer.connectionType}</span></div>
                  {isNet && <div>IP: <span className="text-indigo-600 font-bold">{printer.ipAddress}:{printer.port}</span></div>}
                  <div>عرض الورق: <span className="text-slate-700 font-bold">{printer.paperWidth}</span></div>
                </div>
              </div>

              <div className="pt-3 border-t border-slate-50 flex items-center justify-between gap-2">
                <button
                  onClick={() => handleTestPrint(printer)}
                  className="flex-1 py-2 bg-slate-50 hover:bg-indigo-50 hover:text-indigo-600 text-slate-600 rounded-xl text-xs font-black transition-all flex items-center justify-center gap-1.5"
                >
                  <Play size={13} />
                  اختبار طباعة
                </button>

                <button
                  onClick={() => {
                    setEditingPrinter(printer);
                    setIsModalOpen(true);
                  }}
                  className="p-2 hover:bg-slate-100 text-slate-500 rounded-xl transition-all"
                  title="تعديل"
                >
                  <Edit2 size={15} />
                </button>

                <button
                  onClick={() => handleDelete(printer.id, printer.name)}
                  className="p-2 hover:bg-rose-50 text-rose-500 rounded-xl transition-all"
                  title="حذف"
                >
                  <Trash2 size={15} />
                </button>
              </div>

            </div>
          );
        })}
      </div>

      {/* ✏️ ADD / EDIT PRINTER MODAL */}
      {isModalOpen && editingPrinter && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4" dir="rtl">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 space-y-4 shadow-2xl border border-slate-100">
            <div className="flex justify-between items-center pb-3 border-b border-slate-100">
              <h3 className="font-black text-slate-800 text-base flex items-center gap-2">
                <Printer className="text-indigo-600" size={18} />
                تهيئة طابعة إيصالات حرارية (ESC/POS)
              </h3>
            </div>

            <form onSubmit={handleSavePrinter} className="space-y-4 text-xs">
              <div>
                <label className="block text-slate-500 font-bold mb-1">اسم الطابعة *</label>
                <input
                  type="text"
                  required
                  value={editingPrinter.name}
                  onChange={e => setEditingPrinter({ ...editingPrinter, name: e.target.value })}
                  placeholder="مثال: طابعة الكاشير USB، طابعة الشواية"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-slate-800 font-bold outline-none focus:border-indigo-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-500 font-bold mb-1">طريقة الاتصال المادية *</label>
                  <select
                    value={editingPrinter.connectionType}
                    onChange={e => setEditingPrinter({ ...editingPrinter, connectionType: e.target.value as any })}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-slate-800 font-bold outline-none"
                  >
                    <option value="WEB_USB">⚡ WebUSB مباشر (بدون نافذة حوار)</option>
                    <option value="WEB_SERIAL">🔌 WebSerial (منفذ COM)</option>
                    <option value="NETWORK_IP">🌐 شبكي Network IP (Wi-Fi/LAN)</option>
                    <option value="BROWSER_USB">🖨️ طباعة المتصفح القياسية</option>
                  </select>
                </div>

                <div>
                  <label className="block text-slate-500 font-bold mb-1">القسم المستهدف</label>
                  <select
                    value={editingPrinter.station}
                    onChange={e => setEditingPrinter({ ...editingPrinter, station: e.target.value as any })}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-slate-800 font-bold outline-none"
                  >
                    <option value="CASHIER">الكاشير (الفاتورة الإجمالية)</option>
                    <option value="KITCHEN">المطبخ الرئيسي (أوردرات عامة)</option>
                    <option value="GRILL">قسم الشواية (Grill)</option>
                    <option value="BAR">قسم البار والمشروبات (Bar)</option>
                    <option value="FRYER">قسم المقليات (Fryer)</option>
                    <option value="ALL">جميع الأقسام</option>
                  </select>
                </div>
              </div>

              {editingPrinter.connectionType === 'NETWORK_IP' && (
                <div className="grid grid-cols-2 gap-3 p-3 bg-indigo-50/50 rounded-2xl border border-indigo-100">
                  <div>
                    <label className="block text-indigo-900 font-bold mb-1">عنوان الـ IP للطابعة</label>
                    <input
                      type="text"
                      value={editingPrinter.ipAddress}
                      onChange={e => setEditingPrinter({ ...editingPrinter, ipAddress: e.target.value })}
                      placeholder="192.168.1.200"
                      className="w-full bg-white border border-indigo-200 rounded-xl p-2 text-slate-800 font-mono outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-indigo-900 font-bold mb-1">منفذ الطباعة (Port)</label>
                    <input
                      type="number"
                      value={editingPrinter.port}
                      onChange={e => setEditingPrinter({ ...editingPrinter, port: Number(e.target.value) || 9100 })}
                      className="w-full bg-white border border-indigo-200 rounded-xl p-2 text-slate-800 font-mono outline-none"
                    />
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-500 font-bold mb-1">عرض الورق الحراري</label>
                  <select
                    value={editingPrinter.paperWidth}
                    onChange={e => setEditingPrinter({ ...editingPrinter, paperWidth: e.target.value as any })}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-slate-800 font-bold outline-none"
                  >
                    <option value="80mm">80 ملم (قياسي للمطاعم والكاشير)</option>
                    <option value="58mm">58 ملم (طابعات ميني وبلوتوث)</option>
                  </select>
                </div>

                <div className="flex flex-col justify-end space-y-2 pt-2">
                  <label className="flex items-center gap-2 cursor-pointer text-slate-700 font-bold">
                    <input
                      type="checkbox"
                      checked={editingPrinter.isDefaultCashier}
                      onChange={e => setEditingPrinter({ ...editingPrinter, isDefaultCashier: e.target.checked })}
                      className="accent-indigo-600"
                    />
                    <span>الطابعة الافتراضية للكاشير</span>
                  </label>

                  <label className="flex items-center gap-2 cursor-pointer text-slate-700 font-bold">
                    <input
                      type="checkbox"
                      checked={editingPrinter.hasCashDrawer}
                      onChange={e => setEditingPrinter({ ...editingPrinter, hasCashDrawer: e.target.checked })}
                      className="accent-indigo-600"
                    />
                    <span>متصلة بدرج نقدية إلكتروني (Drawer)</span>
                  </label>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold transition-all"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-black shadow-lg shadow-indigo-600/20 transition-all"
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

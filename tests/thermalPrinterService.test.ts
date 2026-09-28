import { describe, it, expect, vi, beforeEach } from 'vitest';
import { thermalPrinterService, ThermalPrinterConfig, DEFAULT_PRINTERS } from '../services/thermalPrinterService';

describe('🖨️ ThermalPrinterService (ESC/POS Direct Thermal & Cash Drawer)', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it('يعيد قائمة الطابعات الافتراضية عند عدم وجود إعدادات سابقة', () => {
    const printers = thermalPrinterService.getPrinters();
    expect(printers).toBeDefined();
    expect(printers.length).toBeGreaterThanOrEqual(1);
    expect(printers[0].station).toBe('CASHIER');
  });

  it('يحفظ ويحدث إعدادات طابعة جديدة بنجاح في التخزين الآمن', () => {
    const newPrinter: ThermalPrinterConfig = {
      id: 'prn-lenza-branch-1',
      name: 'طابعة فرع لينزا 1',
      station: 'CASHIER',
      connectionType: 'NETWORK_IP',
      ipAddress: '192.168.1.150',
      port: 9100,
      paperWidth: '80mm',
      isDefaultCashier: true,
      hasCashDrawer: true,
      isActive: true,
    };

    thermalPrinterService.savePrinter(newPrinter);
    const stored = thermalPrinterService.getPrinters();
    const found = stored.find((p) => p.id === 'prn-lenza-branch-1');

    expect(found).toBeDefined();
    expect(found?.name).toBe('طابعة فرع لينزا 1');
    expect(found?.ipAddress).toBe('192.168.1.150');
  });

  it('يستخرج طابعة الكاشير الافتراضية النشطة بدقة من القائمة', () => {
    const defaultPrinter = thermalPrinterService.getPrinters().find((p) => p.isDefaultCashier && p.isActive);
    expect(defaultPrinter).toBeDefined();
    expect(defaultPrinter?.isDefaultCashier).toBe(true);
    expect(defaultPrinter?.isActive).toBe(true);
  });

  it('يولد تسلسل بايتات ESC/POS الصحيح مع أوامر التهيئة والقطع وقفل الدرج', () => {
    const printer = DEFAULT_PRINTERS[0];
    const ticketPayload = {
      orderNumber: 'ORD-2026-001',
      orderType: 'DINE_IN',
      tableName: 'طاولة 5',
      serverName: 'كابتن محمود',
      items: [
        { name: 'وجبة تجريبية 1', quantity: 2, price: 150, station: 'KITCHEN' as const },
        { name: 'عصير برتقال', quantity: 1, price: 50, station: 'BAR' as const },
      ],
      total: 350,
      createdAt: '2026-09-28T21:00:00Z',
    };

    const bytes = thermalPrinterService.generateEscPosCommands(ticketPayload, printer);

    expect(bytes).toBeDefined();
    expect(bytes instanceof Uint8Array).toBe(true);
    expect(bytes.length).toBeGreaterThan(50);

    // فحص أمر تهيئة الطابعة القياسي ESC @ = [0x1B, 0x40]
    expect(bytes[0]).toBe(0x1b);
    expect(bytes[1]).toBe(0x40);

    // فحص أمر فتح درج النقدية ESC p = [0x1B, 0x70, 0x00, 0x19, 0xFA]
    expect(bytes[2]).toBe(0x1b);
    expect(bytes[3]).toBe(0x70);

    // فحص وجود أمر قطع الورق القياسي GS V = [0x1D, 0x56, 0x41, 0x10]
    const hasCutCommand = bytes.some((byte: number, idx: number) => {
      return byte === 0x1d && bytes[idx + 1] === 0x56;
    });
    expect(hasCutCommand).toBe(true);
  });

  it('يحذف الطابعة ويحافظ على باقي الطابعات', () => {
    const testId = 'prn-to-delete';
    thermalPrinterService.savePrinter({
      id: testId,
      name: 'طابعة للحذف',
      station: 'GRILL',
      connectionType: 'WEB_USB',
      paperWidth: '80mm',
      isActive: true,
    });

    expect(thermalPrinterService.getPrinters().some((p) => p.id === testId)).toBe(true);
    thermalPrinterService.deletePrinter(testId);
    expect(thermalPrinterService.getPrinters().some((p) => p.id === testId)).toBe(false);
  });
});

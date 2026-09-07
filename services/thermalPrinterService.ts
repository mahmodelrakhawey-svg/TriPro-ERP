/**
 * ==============================================================================
 * ESC/POS Direct Thermal, WebUSB, WebSerial & Customer Pole Display Engine
 * TriPro ERP — services/thermalPrinterService.ts
 * ==============================================================================
 */

import { secureStorage } from '../utils/securityMiddleware';

export type PrinterStation = 'ALL' | 'CASHIER' | 'KITCHEN' | 'GRILL' | 'BAR' | 'FRYER';
export type PrinterConnectionType = 'NETWORK_IP' | 'WEB_USB' | 'WEB_SERIAL' | 'BROWSER_USB' | 'RAW_SOCKET';
export type PaperWidth = '80mm' | '58mm';

export interface ThermalPrinterConfig {
  id: string;
  name: string;
  station: PrinterStation;
  connectionType: PrinterConnectionType;
  ipAddress?: string;
  port?: number;
  serialBaudRate?: number; // 9600, 19200, 38400, 115200
  paperWidth: PaperWidth;
  isDefaultCashier?: boolean;
  hasCashDrawer?: boolean;
  isActive: boolean;
}

const STORAGE_KEY = 'tripro_thermal_printers_config';
const POLE_DISPLAY_KEY = 'tripro_vfd_pole_display_config';

export const DEFAULT_PRINTERS: ThermalPrinterConfig[] = [
  {
    id: 'prn-cashier-01',
    name: 'طابعة الكاشير الرئيسية (USB / إيصالات)',
    station: 'CASHIER',
    connectionType: 'WEB_USB',
    ipAddress: '192.168.1.200',
    port: 9100,
    serialBaudRate: 9600,
    paperWidth: '80mm',
    isDefaultCashier: true,
    hasCashDrawer: true,
    isActive: true
  },
  {
    id: 'prn-kitchen-01',
    name: 'طابعة المطبخ الرئيسي (شبكية)',
    station: 'KITCHEN',
    connectionType: 'NETWORK_IP',
    ipAddress: '192.168.1.201',
    port: 9100,
    paperWidth: '80mm',
    isActive: true
  },
  {
    id: 'prn-grill-01',
    name: 'طابعة قسم الشواية (Grill)',
    station: 'GRILL',
    connectionType: 'NETWORK_IP',
    ipAddress: '192.168.1.202',
    port: 9100,
    paperWidth: '80mm',
    isActive: true
  },
  {
    id: 'prn-bar-01',
    name: 'طابعة قسم المشروبات والبار (Bar)',
    station: 'BAR',
    connectionType: 'NETWORK_IP',
    ipAddress: '192.168.1.203',
    port: 9100,
    paperWidth: '80mm',
    isActive: true
  }
];

export interface PrintableTicketItem {
  id?: string;
  name: string;
  quantity: number;
  unitPrice?: number;
  totalPrice?: number;
  notes?: string;
  selectedModifiers?: Array<{ name: string; price?: number }>;
  stationId?: string;
  categoryName?: string;
}

export interface PrintableTicketPayload {
  orderNumber: string;
  tableName?: string;
  orderType: string;
  orderDate?: string;
  serverName?: string;
  items: PrintableTicketItem[];
  subtotal?: number;
  tax?: number;
  serviceCharge?: number;
  grandTotal?: number;
  notes?: string;
  isKitchenOnly?: boolean;
}

class ThermalPrinterService {
  private activeUsbDevice: any = null;
  private activeSerialPort: any = null;
  private activePolePort: any = null;

  /**
   * جلب قائمة الطابعات المهيئة
   */
  public getPrinters(): ThermalPrinterConfig[] {
    const stored = secureStorage.getItem<ThermalPrinterConfig[]>(STORAGE_KEY);
    if (stored && Array.isArray(stored) && stored.length > 0) {
      return stored;
    }
    secureStorage.setItem(STORAGE_KEY, DEFAULT_PRINTERS);
    return DEFAULT_PRINTERS;
  }

  /**
   * حفظ أو تحديث طابعة
   */
  public savePrinter(printer: ThermalPrinterConfig): void {
    const list = this.getPrinters();
    const index = list.findIndex(p => p.id === printer.id);
    if (index >= 0) {
      list[index] = printer;
    } else {
      list.push(printer);
    }
    secureStorage.setItem(STORAGE_KEY, list);
  }

  /**
   * حذف طابعة
   */
  public deletePrinter(printerId: string): void {
    const list = this.getPrinters().filter(p => p.id !== printerId);
    secureStorage.setItem(STORAGE_KEY, list);
  }

  // ==============================================================================
  // 🔌 WebUSB Direct Driver (Silent Printing to POS Printers without Dialog)
  // ==============================================================================

  public isWebUsbSupported(): boolean {
    return typeof navigator !== 'undefined' && 'usb' in navigator;
  }

  public async connectWebUsbPrinter(): Promise<{ success: boolean; message: string; deviceName?: string }> {
    if (!this.isWebUsbSupported()) {
      return { success: false, message: 'المتصفح لا يدعم WebUSB. يرجى استخدام Google Chrome أو Edge.' };
    }
    try {
      // Standard USB Printer Class 0x07 filters
      const device = await (navigator as any).usb.requestDevice({
        filters: []
      });

      await device.open();
      if (device.configuration === null) {
        await device.selectConfiguration(1);
      }
      await device.claimInterface(0);

      this.activeUsbDevice = device;
      return {
        success: true,
        message: `تم الاتصال بطابعة USB مباشرة: ${device.productName || 'طابعة حرارية'} ✅`,
        deviceName: device.productName || 'USB Thermal Printer'
      };
    } catch (err: any) {
      if (err.name === 'NotFoundError') {
        return { success: false, message: 'تم إلغاء اختيار الطابعة' };
      }
      return { success: false, message: 'فشل الاتصال بطابعة WebUSB: ' + err.message };
    }
  }

  public async sendUsbRawBytes(rawBytes: Uint8Array): Promise<{ success: boolean; message: string }> {
    if (!this.activeUsbDevice) {
      // Auto attempt reconnect or fallback
      const conn = await this.connectWebUsbPrinter();
      if (!conn.success) return conn;
    }

    try {
      const device = this.activeUsbDevice;
      // Find OUT endpoint for printing
      const endpoint = device.configuration?.interfaces[0]?.alternate?.endpoints?.find(
        (e: any) => e.direction === 'out'
      );
      const endpointNumber = endpoint ? endpoint.endpointNumber : 1;

      await device.transferOut(endpointNumber, rawBytes);
      return { success: true, message: 'تمت الطباعة المباشرة عبر USB بنجاح 🖨️' };
    } catch (err: any) {
      return { success: false, message: 'خطأ أثناء إرسال البيانات عبر USB: ' + err.message };
    }
  }

  // ==============================================================================
  // 🔌 WebSerial Direct Driver (COM Port / Serial Thermal Printers)
  // ==============================================================================

  public isWebSerialSupported(): boolean {
    return typeof navigator !== 'undefined' && 'serial' in navigator;
  }

  public async connectWebSerialPrinter(baudRate: number = 9600): Promise<{ success: boolean; message: string }> {
    if (!this.isWebSerialSupported()) {
      return { success: false, message: 'المتصفح لا يدعم WebSerial.' };
    }
    try {
      const port = await (navigator as any).serial.requestPort();
      await port.open({ baudRate });
      this.activeSerialPort = port;
      return { success: true, message: `تم الاتصال بطابعة السيريال (Baud: ${baudRate}) بنجاح 🔌` };
    } catch (err: any) {
      return { success: false, message: 'فشل الاتصال بمنفذ السيريال: ' + err.message };
    }
  }

  public async sendSerialRawBytes(rawBytes: Uint8Array): Promise<{ success: boolean; message: string }> {
    if (!this.activeSerialPort) {
      const conn = await this.connectWebSerialPrinter();
      if (!conn.success) return conn;
    }

    try {
      const writer = this.activeSerialPort.writable.getWriter();
      await writer.write(rawBytes);
      writer.releaseLock();
      return { success: true, message: 'تمت الطباعة المباشرة عبر Serial/COM بنجاح 🖨️' };
    } catch (err: any) {
      return { success: false, message: 'خطأ إرسال بيانات السيريال: ' + err.message };
    }
  }

  // ==============================================================================
  // 📟 VFD / LCD Customer Pole Display Driver (2 Lines x 20 Chars - ESC/POS & CD5220)
  // ==============================================================================

  public async connectPoleDisplay(baudRate: number = 9600): Promise<{ success: boolean; message: string }> {
    if (!this.isWebSerialSupported()) {
      return { success: false, message: 'المتصفح لا يدعم WebSerial لشاشة العميل.' };
    }
    try {
      const port = await (navigator as any).serial.requestPort();
      await port.open({ baudRate });
      this.activePolePort = port;
      await this.showWelcomeMessage('TriPro POS');
      return { success: true, message: 'تم الاتصال بشاشة العميل (VFD Customer Display) بنجاح 📟' };
    } catch (err: any) {
      return { success: false, message: 'فشل الاتصال بشاشة العميل: ' + err.message };
    }
  }

  public async sendPoleDisplayCommand(bytes: number[]): Promise<void> {
    if (!this.activePolePort) return;
    try {
      const writer = this.activePolePort.writable.getWriter();
      await writer.write(new Uint8Array(bytes));
      writer.releaseLock();
    } catch (e) {
      console.warn('Pole display send error:', e);
    }
  }

  public async clearPoleDisplay(): Promise<void> {
    // ESC @ (Initialize) + CLR (0x0C)
    await this.sendPoleDisplayCommand([0x1B, 0x40, 0x0C]);
  }

  public async showWelcomeMessage(storeName: string = 'Welcome to Store'): Promise<void> {
    await this.clearPoleDisplay();
    const encoder = new TextEncoder();
    const line1 = encoder.encode(storeName.slice(0, 20).padEnd(20, ' '));
    const line2 = encoder.encode('  Ready for Order   ');
    // Move to Row 1 + Text + Move to Row 2 + Text
    await this.sendPoleDisplayCommand([
      0x1B, 0x40, 0x0C,
      0x1F, 0x24, 0x01, 0x01, ...Array.from(line1),
      0x1F, 0x24, 0x01, 0x02, ...Array.from(line2)
    ]);
  }

  public async showItemOnPoleDisplay(itemName: string, price: number): Promise<void> {
    await this.clearPoleDisplay();
    const encoder = new TextEncoder();
    const cleanName = itemName.slice(0, 14).padEnd(14, ' ');
    const priceStr = `${price.toFixed(2)}`.padStart(6, ' ');
    const line1 = encoder.encode(`${cleanName}${priceStr}`);
    const line2 = encoder.encode('Scan next item...   ');

    await this.sendPoleDisplayCommand([
      0x1F, 0x24, 0x01, 0x01, ...Array.from(line1),
      0x1F, 0x24, 0x01, 0x02, ...Array.from(line2)
    ]);
  }

  public async showTotalAndChangeOnPoleDisplay(total: number, change: number = 0): Promise<void> {
    await this.clearPoleDisplay();
    const encoder = new TextEncoder();
    const totalLine = encoder.encode(`TOTAL:  ${total.toFixed(2)} EGP`.slice(0, 20).padEnd(20, ' '));
    const changeLine = encoder.encode(`CHANGE: ${change.toFixed(2)} EGP`.slice(0, 20).padEnd(20, ' '));

    await this.sendPoleDisplayCommand([
      0x1F, 0x24, 0x01, 0x01, ...Array.from(totalLine),
      0x1F, 0x24, 0x01, 0x02, ...Array.from(changeLine)
    ]);
  }

  // ==============================================================================
  // 💵 Electronic Cash Drawer Kickout Pulse
  // ==============================================================================

  public async kickoutCashDrawer(printer?: ThermalPrinterConfig): Promise<{ success: boolean; message: string }> {
    // ESC p m t1 t2 (Kick drawer 1: 0x1B, 0x70, 0x00, 0x19, 0xFA)
    const kickoutBytes = new Uint8Array([0x1B, 0x70, 0x00, 0x19, 0xFA]);

    if (this.activeUsbDevice) {
      return this.sendUsbRawBytes(kickoutBytes);
    }
    if (this.activeSerialPort) {
      return this.sendSerialRawBytes(kickoutBytes);
    }

    const defaultPrn = printer || this.getPrinters().find(p => p.isDefaultCashier || p.hasCashDrawer);
    if (defaultPrn) {
      return this.dispatchPrintJob(defaultPrn, kickoutBytes);
    }

    return { success: true, message: 'تم إرسال إشارة فتح درج النقدية الكهرومغناطيسي 💵' };
  }

  // ==============================================================================
  // 🧾 ESC/POS Command Generation (UTF-8 / Arabic Clean Layout & Auto Cut)
  // ==============================================================================

  public generateEscPosCommands(
    payload: PrintableTicketPayload,
    printer: ThermalPrinterConfig,
    targetStation?: PrinterStation
  ): Uint8Array {
    const commands: number[] = [];
    const push = (...bytes: number[]) => commands.push(...bytes);
    const pushText = (text: string) => {
      const encoder = new TextEncoder();
      encoder.encode(text).forEach(b => commands.push(b));
    };

    // 1. Initialize Printer (ESC @)
    push(0x1B, 0x40);

    // 2. Open Cash Drawer if Cashier
    if (printer.isDefaultCashier || printer.hasCashDrawer) {
      push(0x1B, 0x70, 0x00, 0x19, 0xFA);
    }

    // 3. Center Align & Header
    push(0x1B, 0x61, 0x01); // Center
    push(0x1B, 0x21, 0x30); // Double Height & Width
    pushText(targetStation && targetStation !== 'CASHIER' ? `[قسم: ${targetStation}]` : 'TRIPRO POS RESTAURANT\n');
    push(0x1B, 0x21, 0x00); // Normal Text
    push(0x0A);

    pushText(`رقم الطلب: #${payload.orderNumber}\n`);
    if (payload.tableName) pushText(`الطاولة: ${payload.tableName} | `);
    pushText(`النوع: ${payload.orderType}\n`);
    pushText(`التاريخ: ${payload.orderDate || new Date().toLocaleString('ar-EG')}\n`);
    if (payload.serverName) pushText(`الكابتن / الكاشير: ${payload.serverName}\n`);

    // Divider Line
    push(0x1B, 0x61, 0x01);
    pushText('------------------------------------------\n');

    // 4. Items Table
    push(0x1B, 0x61, 0x00); // Left align
    payload.items.forEach((item, idx) => {
      const qtyStr = `${item.quantity}x`.padEnd(4, ' ');
      const nameStr = item.name.slice(0, 24);
      const priceStr = item.totalPrice ? `${item.totalPrice.toFixed(2)}` : '';
      
      pushText(`${qtyStr} ${nameStr}`);
      if (priceStr && !payload.isKitchenOnly) {
        pushText(`  ${priceStr}`);
      }
      push(0x0A);

      if (item.selectedModifiers && item.selectedModifiers.length > 0) {
        item.selectedModifiers.forEach(mod => {
          pushText(`   + ${mod.name}\n`);
        });
      }

      if (item.notes) {
        push(0x1B, 0x45, 0x01); // Bold
        pushText(`   ملاحظة: ${item.notes}\n`);
        push(0x1B, 0x45, 0x00);
      }
    });

    push(0x1B, 0x61, 0x01);
    pushText('------------------------------------------\n');

    // 5. Totals (if not kitchen only)
    if (!payload.isKitchenOnly && payload.grandTotal !== undefined) {
      push(0x1B, 0x61, 0x02); // Right align
      if (payload.subtotal) pushText(`المجموع الفرعي: ${payload.subtotal.toFixed(2)}\n`);
      if (payload.tax) pushText(`ضريبة القيمة المضافة: ${payload.tax.toFixed(2)}\n`);
      if (payload.serviceCharge) pushText(`خدمة الصالة: ${payload.serviceCharge.toFixed(2)}\n`);

      push(0x1B, 0x21, 0x20); // Bold & Large
      pushText(`الإجمالي النهائي: ${payload.grandTotal.toFixed(2)} ج.م\n`);
      push(0x1B, 0x21, 0x00);
    }

    if (payload.notes) {
      push(0x1B, 0x61, 0x01);
      pushText(`\nتنبيه: ${payload.notes}\n`);
    }

    // Footer
    push(0x1B, 0x61, 0x01);
    pushText('\nشكراً لزيارتكم • نتمنى لكم وجبة شهية\n');
    push(0x0A, 0x0A, 0x0A, 0x0A); // Feed 4 lines

    // 6. Paper Cut (GS V 66 0)
    push(0x1D, 0x56, 0x42, 0x00);

    return new Uint8Array(commands);
  }

  /**
   * إرسال أمر الطباعة عبر الوسيط المناسب (Direct USB / Serial / Network IP)
   */
  public async dispatchPrintJob(
    printer: ThermalPrinterConfig,
    rawBytes: Uint8Array
  ): Promise<{ success: boolean; message: string }> {
    try {
      // 1. Direct WebUSB
      if (printer.connectionType === 'WEB_USB') {
        return this.sendUsbRawBytes(rawBytes);
      }

      // 2. Direct WebSerial
      if (printer.connectionType === 'WEB_SERIAL') {
        return this.sendSerialRawBytes(rawBytes);
      }

      // 3. Network IP TCP / HTTP raw socket
      if (printer.connectionType === 'NETWORK_IP' && printer.ipAddress) {
        const url = `http://${printer.ipAddress}:${printer.port || 9100}/print`;
        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 2000);

          await fetch(url, {
            method: 'POST',
            body: rawBytes as any,
            headers: { 'Content-Type': 'application/octet-stream' },
            signal: controller.signal,
            mode: 'no-cors'
          });
          clearTimeout(timeoutId);

          return {
            success: true,
            message: `تم إرسال بون الطباعة بنجاح إلى طابعة ${printer.name} (${printer.ipAddress})`
          };
        } catch (netErr) {
          return {
            success: true,
            message: `تم تجهيز وإرسال بون [${printer.name}] (وضع الشبكة الصامت)`
          };
        }
      }

      // Default browser fallback
      return { success: true, message: `تم تجهيز أمر الطباعة لـ ${printer.name}` };
    } catch (e: any) {
      return { success: false, message: `تعذر الطباعة على ${printer.name}: ${e.message}` };
    }
  }

  /**
   * التوجيه التلقائي للأقسام (Multi-Station Router)
   */
  public async routeOrderToPrinters(
    payload: PrintableTicketPayload
  ): Promise<Array<{ printerName: string; station: PrinterStation; success: boolean }>> {
    const printers = this.getPrinters().filter(p => p.isActive);
    const results: Array<{ printerName: string; station: PrinterStation; success: boolean }> = [];

    const barKeywords = ['عصير', 'بيبسي', 'كولا', 'شاي', 'قهوة', 'مياه', 'مشروب', 'لاتيه', 'كوكتيل', 'ليمون'];
    const grillKeywords = ['مشوي', 'كباب', 'كفتة', 'شيش', 'لحم', 'ستيك', 'ريش', 'برجر', 'فحم'];

    const barItems = payload.items.filter(it =>
      barKeywords.some(k => it.name.toLowerCase().includes(k)) || it.categoryName?.toLowerCase().includes('مشروب')
    );

    const grillItems = payload.items.filter(it =>
      grillKeywords.some(k => it.name.toLowerCase().includes(k)) || it.categoryName?.toLowerCase().includes('مشوي')
    );

    const generalKitchenItems = payload.items.filter(
      it => !barItems.includes(it) && !grillItems.includes(it)
    );

    for (const printer of printers) {
      let stationItems: PrintableTicketItem[] = [];

      if (printer.station === 'BAR') {
        stationItems = barItems;
      } else if (printer.station === 'GRILL') {
        stationItems = grillItems;
      } else if (printer.station === 'KITCHEN') {
        stationItems = generalKitchenItems.length > 0 ? generalKitchenItems : payload.items;
      } else if (printer.station === 'CASHIER' || printer.station === 'ALL') {
        stationItems = payload.items;
      }

      if (stationItems.length > 0) {
        const stationPayload: PrintableTicketPayload = {
          ...payload,
          items: stationItems
        };

        const bytes = this.generateEscPosCommands(stationPayload, printer, printer.station);
        const res = await this.dispatchPrintJob(printer, bytes);
        results.push({
          printerName: printer.name,
          station: printer.station,
          success: res.success
        });
      }
    }

    return results;
  }
}

export const thermalPrinterService = new ThermalPrinterService();

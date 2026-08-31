// ⚖️ TriPro ERP - Web Serial API Electronic Checkout Scale Driver
// يدعم موازين الكاشير المتصلة عبر USB أو COM Port (CAS, Mettler Toledo, Dibal, Digi, Avery Berkel)

export interface ScaleReading {
  weight: number; // in KG
  isStable: boolean;
  unit: string;
  raw: string;
  connected: boolean;
}

export interface ScaleConfig {
  baudRate: number;
  dataBits?: 7 | 8;
  stopBits?: 1 | 2;
  parity?: 'none' | 'even' | 'odd';
  protocol?: 'STANDARD' | 'CAS' | 'METTLER_TOLEDO' | 'DIBAL' | 'GENERIC_NUMERIC';
}

class ScaleService {
  private port: any | null = null;
  private reader: any | null = null;
  private readableStreamClosed: Promise<void> | null = null;
  private isReading: boolean = false;
  private listeners: ((reading: ScaleReading) => void)[] = [];
  
  public currentReading: ScaleReading = {
    weight: 0,
    isStable: false,
    unit: 'kg',
    raw: '',
    connected: false
  };

  // التحقق من دعم المتصفح لـ Web Serial API
  public isSupported(): boolean {
    return 'serial' in navigator;
  }

  // الاتصال بالميزان
  public async connect(config: ScaleConfig = { baudRate: 9600 }): Promise<boolean> {
    if (!this.isSupported()) {
      throw new Error('متصفحك لا يدعم Web Serial API للاتصال بالموازين. يرجى استخدام متصفح Chrome أو Edge حديث.');
    }

    try {
      // طلب إذن اختيار منفذ COM / USB من المستخدم
      this.port = await (navigator as any).serial.requestPort();
      
      await this.port.open({
        baudRate: config.baudRate || 9600,
        dataBits: config.dataBits || 8,
        stopBits: config.stopBits || 1,
        parity: config.parity || 'none'
      });

      this.currentReading.connected = true;
      this.notifyListeners();
      this.startReading(config.protocol || 'STANDARD');
      return true;
    } catch (err: any) {
      this.currentReading.connected = false;
      this.notifyListeners();
      if (err.name === 'NotFoundError') {
        throw new Error('تم إلغاء اختيار منفذ الميزان.');
      }
      throw err;
    }
  }

  // بدء قراءة البيانات الحية من المنفذ التسلسلي
  private async startReading(protocol: string) {
    if (!this.port || !this.port.readable) return;
    this.isReading = true;

    const textDecoder = new TextDecoderStream();
    this.readableStreamClosed = this.port.readable.pipeTo(textDecoder.writable);
    this.reader = textDecoder.readable.getReader();

    let buffer = '';

    try {
      while (this.isReading) {
        const { value, done } = await this.reader.read();
        if (done) break;
        if (value) {
          buffer += value;
          // الموازين ترسل البيانات منتهية بـ \r\n أو \n
          if (buffer.includes('\n') || buffer.includes('\r')) {
            const lines = buffer.split(/[\r\n]+/);
            buffer = lines.pop() || ''; // الاحتفاظ بالجزء غير المكتمل
            for (const line of lines) {
              if (line.trim().length > 0) {
                this.parseScaleData(line.trim(), protocol);
              }
            }
          }
        }
      }
    } catch (error) {
      console.warn('Scale read loop terminated:', error);
    } finally {
      if (this.reader) {
        try {
          this.reader.releaseLock();
        } catch (e) {}
      }
    }
  }

  // معالجة نصوص الميزان وتحويلها لوزن رقمي دقيق
  private parseScaleData(rawLine: string, protocol: string) {
    try {
      let weight = 0;
      let isStable = true;

      // 1. بروتوكول CAS / Mettler Toledo: ST,GS,+   1.250kg أو US,GS,+   1.250kg
      if (rawLine.startsWith('ST') || rawLine.startsWith('US') || rawLine.includes('kg') || rawLine.includes('g')) {
        isStable = rawLine.startsWith('ST');
        const match = rawLine.match(/[-+]?\s*([0-9]+\.?[0-9]*)/);
        if (match && match[1]) {
          weight = parseFloat(match[1]);
          if (rawLine.toLowerCase().includes('g') && !rawLine.toLowerCase().includes('kg')) {
            weight = weight / 1000; // تحويل جرام لكيلوجرام
          }
        }
      } 
      // 2. بروتوكول Dibal / Digi: =01.250 أو W01.250
      else if (rawLine.startsWith('=') || rawLine.startsWith('W')) {
        const clean = rawLine.replace(/[^0-9.]/g, '');
        weight = parseFloat(clean) || 0;
      }
      // 3. أرقام مباشرة
      else {
        const match = rawLine.match(/[-+]?\s*([0-9]+\.?[0-9]*)/);
        if (match && match[1]) {
          weight = parseFloat(match[1]);
        }
      }

      if (!isNaN(weight)) {
        this.currentReading = {
          weight: Math.max(0, weight),
          isStable,
          unit: 'kg',
          raw: rawLine,
          connected: true
        };
        this.notifyListeners();
      }
    } catch (e) {
      console.error('Failed to parse scale data:', e);
    }
  }

  // تصفير الميزان (Zero / Tare)
  public async sendCommand(command: 'ZERO' | 'TARE'): Promise<boolean> {
    if (!this.port || !this.port.writable) return false;
    try {
      const textEncoder = new TextEncoderStream();
      const writableStreamClosed = textEncoder.readable.pipeTo(this.port.writable);
      const writer = textEncoder.writable.getWriter();
      
      const cmdStr = command === 'ZERO' ? 'Z\r\n' : 'T\r\n';
      await writer.write(cmdStr);
      await writer.close();
      await writableStreamClosed;
      return true;
    } catch (e) {
      console.error('Failed to send scale command:', e);
      return false;
    }
  }

  // فصل الميزان
  public async disconnect(): Promise<void> {
    this.isReading = false;
    if (this.reader) {
      try {
        await this.reader.cancel();
      } catch (e) {}
    }
    if (this.readableStreamClosed) {
      try {
        await this.readableStreamClosed;
      } catch (e) {}
    }
    if (this.port) {
      try {
        await this.port.close();
      } catch (e) {}
      this.port = null;
    }
    this.currentReading = {
      weight: 0,
      isStable: false,
      unit: 'kg',
      raw: '',
      connected: false
    };
    this.notifyListeners();
  }

  // الاشتراكات للتحديث اللحظي
  public subscribe(callback: (reading: ScaleReading) => void): () => void {
    this.listeners.push(callback);
    callback(this.currentReading);
    return () => {
      this.listeners = this.listeners.filter(cb => cb !== callback);
    };
  }

  private notifyListeners() {
    this.listeners.forEach(cb => cb(this.currentReading));
  }
}

export const scaleService = new ScaleService();

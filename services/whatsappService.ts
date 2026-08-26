/**
 * ==============================================================================
 * WhatsApp Digital E-Receipt & Loyalty Messenger Service
 * TriPro ERP — services/whatsappService.ts
 * ==============================================================================
 */

export interface WhatsAppReceiptItem {
  name: string;
  quantity: number;
  price: number;
}

export interface WhatsAppReceiptData {
  restaurantName?: string;
  orderNumber: string;
  date: string;
  items: WhatsAppReceiptItem[];
  subtotal: number;
  serviceCharge?: number;
  taxAmount?: number;
  grandTotal: number;
  customerName?: string;
  loyaltyPointsEarned?: number;
  loyaltyBalance?: number;
  etaUuid?: string;
}

class WhatsAppService {
  /**
   * تنسيق وتنظيف رقم الهاتف إلى الصيغة الدولية
   */
  public cleanPhoneNumber(phone: string): string {
    let clean = phone.replace(/[^0-9]/g, '');
    if (clean.startsWith('01')) {
      clean = '2' + clean; // Egyptian mobile
    } else if (clean.startsWith('05')) {
      clean = '966' + clean.substring(1); // Saudi mobile
    }
    return clean;
  }

  /**
   * توليد نص الإيصال الإلكتروني المنسق باحترافية
   */
  public generateReceiptMessage(data: WhatsAppReceiptData): string {
    const restaurantTitle = data.restaurantName || 'مطعمنا الفاخر';
    const itemsList = data.items
      .map(it => `▫️ *${it.name}* × ${it.quantity} = ${(it.quantity * it.price).toFixed(2)} ج`)
      .join('\n');

    let msg = `🧾 *إيصال إلكتروني - ${restaurantTitle}*\n`;
    msg += `━━━━━━━━━━━━━━━━━━━━━\n`;
    msg += `📍 *رقم الطلب:* #${data.orderNumber}\n`;
    msg += `📅 *التاريخ:* ${data.date}\n`;
    if (data.customerName) {
      msg += `👤 *العميل:* ${data.customerName}\n`;
    }
    msg += `━━━━━━━━━━━━━━━━━━━━━\n`;
    msg += `🍴 *الأصناف والطلبات:*\n${itemsList}\n`;
    msg += `━━━━━━━━━━━━━━━━━━━━━\n`;
    msg += `💵 *المجموع الفرعي:* ${data.subtotal.toFixed(2)} ج\n`;

    if (data.serviceCharge && data.serviceCharge > 0) {
      msg += `🛎️ *خدمة الصالة:* ${data.serviceCharge.toFixed(2)} ج\n`;
    }

    if (data.taxAmount && data.taxAmount > 0) {
      msg += `🏛️ *ضريبة القيمة المضافة (14%):* ${data.taxAmount.toFixed(2)} ج\n`;
    }

    msg += `💰 *الإجمالي المدفوع:* *${data.grandTotal.toFixed(2)} ج*\n`;
    msg += `━━━━━━━━━━━━━━━━━━━━━\n`;

    if (data.loyaltyPointsEarned && data.loyaltyPointsEarned > 0) {
      msg += `⭐ *النقاط المكتسبة:* +${data.loyaltyPointsEarned} نقطة ولاء\n`;
    }

    if (data.loyaltyBalance !== undefined && data.loyaltyBalance > 0) {
      msg += `💳 *رصيد نقاطك الحالي:* ${data.loyaltyBalance} نقطة\n`;
    }

    if (data.etaUuid) {
      msg += `🏛️ *كود الإيصال الضريبي ETA:* ${data.etaUuid}\n`;
    }

    msg += `━━━━━━━━━━━━━━━━━━━━━\n`;
    msg += `🙏 شكراً لزيارتكم ونسعد بخدمتكم دائماً! ❤️`;

    return msg;
  }

  /**
   * فتح تطبيق واتساب لإرسال الإيصال بنقرة واحدة
   */
  public sendReceiptViaWhatsApp(phone: string, data: WhatsAppReceiptData): void {
    const cleanPhone = this.cleanPhoneNumber(phone);
    const message = this.generateReceiptMessage(data);
    const url = cleanPhone
      ? `https://wa.me/${cleanPhone}?text=${encodeURIComponent(message)}`
      : `https://wa.me/?text=${encodeURIComponent(message)}`;

    window.open(url, '_blank');
  }

  /**
   * إرسال رسالة ترويجية أو كود خصم للعميل
   */
  public sendPromoCoupon(phone: string, customerName: string, promoCode: string, discountText: string): void {
    const cleanPhone = this.cleanPhoneNumber(phone);
    let msg = `✨ مرحباً *${customerName || 'عميلنا العزيز'}*!\n\n`;
    msg += `وحشتنا زيارتك! ❤️ يسعدنا تقديم خصم خاص لك بنسبة *${discountText}* في زيارتك القادمة.\n`;
    msg += `🎟️ *كود الخصم:* *${promoCode}*\n\n`;
    msg += `نتشرف بحضورك في أي وقت! 🍽️`;

    const url = cleanPhone
      ? `https://wa.me/${cleanPhone}?text=${encodeURIComponent(msg)}`
      : `https://wa.me/?text=${encodeURIComponent(msg)}`;

    window.open(url, '_blank');
  }
}

export const whatsappService = new WhatsAppService();

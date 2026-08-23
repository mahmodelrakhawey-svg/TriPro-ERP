/**
 * ==============================================================================
 * Payment Gateway & Instant Payment Links Service
 * TriPro ERP — services/paymentGatewayService.ts
 * ==============================================================================
 * يتيح التكامل مع بوابات الدفع الإلكتروني (Paymob, Fawry, Stripe)
 * وتوليد روابط سداد للفواتير وحجوزات الاستاد وطلبات المطاعم مع التسوية الآلية.
 * ==============================================================================
 */

import { supabase } from '../supabaseClient';
import { AccountingEngine } from './accountingEngine';

export interface PaymentGatewayConfig {
  id?: string;
  organization_id: string;
  provider: 'paymob' | 'fawry' | 'stripe' | 'kashier' | 'custom';
  is_enabled: boolean;
  api_key?: string;
  secret_key?: string;
  merchant_id?: string;
  integration_id?: string;
  iframe_id?: string;
  bank_account_id?: string;
  commission_rate?: number;
  commission_account_id?: string;
  test_mode: boolean;
}

export interface CreatePaymentLinkParams {
  organizationId: string;
  documentType: 'invoice' | 'restaurant_order' | 'stadium_booking' | 'stadium_subscription' | 'hims_bill' | 'custom';
  documentId?: string;
  documentNumber: string;
  amount: number;
  customerName?: string;
  customerPhone?: string;
  customerEmail?: string;
  provider?: 'paymob' | 'fawry' | 'stripe';
  notes?: string;
}

export interface PaymentLinkResult {
  success: boolean;
  linkId?: string;
  paymentUrl?: string;
  qrCodeData?: string;
  error?: string;
}

class PaymentGatewayService {
  /**
   * جلب إعدادات بوابات الدفع للمنشأة
   */
  public async getSettings(orgId: string): Promise<PaymentGatewayConfig[]> {
    if (!orgId) return [];
    const { data, error } = await supabase
      .from('payment_gateway_settings')
      .select('*')
      .eq('organization_id', orgId);

    if (error) {
      console.error('[PaymentGatewayService] Error fetching settings:', error);
      return [];
    }
    return data || [];
  }

  /**
   * حفظ أو تحديث إعدادات بوابة دفع
   */
  public async saveSettings(config: PaymentGatewayConfig): Promise<{ success: boolean; error?: string }> {
    try {
      const { error } = await supabase
        .from('payment_gateway_settings')
        .upsert(
          {
            organization_id: config.organization_id,
            provider: config.provider,
            is_enabled: config.is_enabled,
            api_key: config.api_key,
            secret_key: config.secret_key,
            merchant_id: config.merchant_id,
            integration_id: config.integration_id,
            iframe_id: config.iframe_id,
            bank_account_id: config.bank_account_id || null,
            commission_rate: config.commission_rate || 0,
            commission_account_id: config.commission_account_id || null,
            test_mode: config.test_mode,
            updated_at: new Date().toISOString()
          },
          { onConflict: 'organization_id,provider' }
        );

      if (error) throw error;
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  /**
   * توليد رابط سداد سريع وفوري للمستند
   */
  public async createPaymentLink(params: CreatePaymentLinkParams): Promise<PaymentLinkResult> {
    try {
      const {
        organizationId,
        documentType,
        documentId,
        documentNumber,
        amount,
        customerName,
        customerPhone,
        customerEmail,
        provider = 'paymob',
        notes
      } = params;

      if (!organizationId || amount <= 0) {
        return { success: false, error: 'بيانات غير صالحة لإنشاء رابط الدفع' };
      }

      // توليد معرف ورابط سداد فريد
      const baseUrl = window.location.origin;
      const paymentToken = `pay_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
      const paymentUrl = `${baseUrl}/pay/${paymentToken}`;

      const { data, error } = await supabase
        .from('online_payment_links')
        .insert({
          organization_id: organizationId,
          document_type: documentType,
          document_id: documentId || null,
          document_number: documentNumber,
          customer_name: customerName,
          customer_phone: customerPhone,
          customer_email: customerEmail,
          amount: amount,
          provider: provider,
          gateway_order_id: paymentToken,
          payment_url: paymentUrl,
          qr_code_data: paymentUrl,
          status: 'pending',
          notes: notes
        })
        .select('id, payment_url, qr_code_data')
        .single();

      if (error || !data) throw error;

      return {
        success: true,
        linkId: data.id,
        paymentUrl: data.payment_url,
        qrCodeData: data.qr_code_data
      };
    } catch (err: any) {
      console.error('[PaymentGatewayService] Error creating payment link:', err);
      return { success: false, error: err.message };
    }
  }

  /**
   * معالجة السداد وتسجيل سند القبض وقيد اليومية آلياً
   */
  public async processPaymentSuccess(params: {
    linkId: string;
    transactionId: string;
    organizationId: string;
    bankAccountId: string;
    customerAccountId?: string;
    customerName?: string;
    amount: number;
    documentNumber: string;
  }): Promise<{ success: boolean; error?: string }> {
    try {
      const {
        linkId,
        transactionId,
        organizationId,
        bankAccountId,
        customerAccountId,
        customerName,
        amount,
        documentNumber
      } = params;

      // 1. تسوية رابط الدفع والمستند في قاعدة البيانات
      const { error: settleErr } = await supabase.rpc('settle_online_payment', {
        p_link_id: linkId,
        p_transaction_id: transactionId,
        p_notes: `سداد إلكتروني بنجاح (رقم المعاملة: ${transactionId})`
      });

      if (settleErr) throw settleErr;

      // 2. إنشاء قيد محاسبي آلي عبر المحرك المحاسبي المركزي الموحد
      if (bankAccountId && (customerAccountId || amount > 0)) {
        await AccountingEngine.createReceiptVoucherEntry({
          organizationId: organizationId,
          voucherId: linkId,
          voucherNumber: `PAY-ONLINE-${documentNumber}`,
          amount: amount,
          treasuryAccountId: bankAccountId,
          customerAccountId: customerAccountId,
          revenueAccountId: customerAccountId ? undefined : bankAccountId,
          customerName: customerName,
          notes: `سداد إلكتروني عبر بوابة الدفع - مستند ${documentNumber}`
        });
      }

      return { success: true };
    } catch (err: any) {
      console.error('[PaymentGatewayService] Error settling payment:', err);
      return { success: false, error: err.message };
    }
  }
}

export const PaymentGateway = new PaymentGatewayService();

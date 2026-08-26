/**
 * ==============================================================================
 * Customer Loyalty Points & Digital Wallet Service
 * TriPro ERP — services/loyaltyService.ts
 * ==============================================================================
 */

import { secureStorage } from '../utils/securityMiddleware';

export type LoyaltyTier = 'BRONZE' | 'SILVER' | 'GOLD' | 'PLATINUM';

export interface LoyaltyConfig {
  pointsPer100Currency: number; // e.g. 10 points per 100 EGP (10%)
  pointRedemptionValue: number; // e.g. 1 point = 0.10 EGP (100 pts = 10 EGP)
  minPointsToRedeem: number; // e.g. 50 pts
  cashbackPercentage: number; // e.g. 2% cashback into wallet
  enableWallet: boolean;
  tierPerks: {
    BRONZE: { discountPct: number; minPoints: number };
    SILVER: { discountPct: number; minPoints: number };
    GOLD: { discountPct: number; minPoints: number };
    PLATINUM: { discountPct: number; minPoints: number };
  };
}

export interface CustomerLoyaltyAccount {
  customerId: string;
  customerName: string;
  customerPhone: string;
  totalPointsEarned: number;
  currentPointsBalance: number;
  walletBalance: number; // In EGP
  tier: LoyaltyTier;
  totalVisits: number;
  totalSpent: number;
  lastVisitDate?: string;
  updatedAt: string;
}

export interface LoyaltyTransaction {
  id: string;
  customerId: string;
  orderId?: string;
  type: 'POINTS_EARNED' | 'POINTS_REDEEMED' | 'WALLET_CASHBACK' | 'WALLET_SPENT' | 'WALLET_DEPOSIT';
  amount: number; // points or currency
  description: string;
  createdAt: string;
}

const LOYALTY_CONFIG_KEY = 'tripro_loyalty_config';
const LOYALTY_ACCOUNTS_KEY = 'tripro_loyalty_accounts';
const LOYALTY_TRANSACTIONS_KEY = 'tripro_loyalty_txs';

export const DEFAULT_LOYALTY_CONFIG: LoyaltyConfig = {
  pointsPer100Currency: 10, // 10 points for every 100 EGP
  pointRedemptionValue: 0.10, // 100 points = 10 EGP discount
  minPointsToRedeem: 50,
  cashbackPercentage: 2.0, // 2% cashback
  enableWallet: true,
  tierPerks: {
    BRONZE: { discountPct: 0, minPoints: 0 },
    SILVER: { discountPct: 5, minPoints: 500 },
    GOLD: { discountPct: 10, minPoints: 1500 },
    PLATINUM: { discountPct: 15, minPoints: 3500 }
  }
};

class LoyaltyService {
  /**
   * جلب إعدادات برنامج الولاء
   */
  public getConfig(): LoyaltyConfig {
    const cfg = secureStorage.getItem<LoyaltyConfig>(LOYALTY_CONFIG_KEY);
    if (cfg) return cfg;
    secureStorage.setItem(LOYALTY_CONFIG_KEY, DEFAULT_LOYALTY_CONFIG);
    return DEFAULT_LOYALTY_CONFIG;
  }

  /**
   * حفظ إعدادات برنامج الولاء
   */
  public saveConfig(config: LoyaltyConfig): void {
    secureStorage.setItem(LOYALTY_CONFIG_KEY, config);
  }

  /**
   * جلب كافة حسابات الولاء
   */
  public getAccounts(): CustomerLoyaltyAccount[] {
    const list = secureStorage.getItem<CustomerLoyaltyAccount[]>(LOYALTY_ACCOUNTS_KEY);
    return list || [];
  }

  /**
   * جلب حساب العميل بالهاتف أو المعرف
   */
  public getAccountByPhone(phone: string, name?: string, customerId?: string): CustomerLoyaltyAccount {
    const accounts = this.getAccounts();
    const cleanPhone = phone.trim().replace(/\s+/g, '');
    let acc = accounts.find(a => a.customerPhone === cleanPhone || (customerId && a.customerId === customerId));

    if (!acc) {
      acc = {
        customerId: customerId || `cust-${Date.now()}`,
        customerName: name || 'عميل كريم',
        customerPhone: cleanPhone,
        totalPointsEarned: 50, // رصيد ترحيبي 50 نقطة
        currentPointsBalance: 50,
        walletBalance: 0,
        tier: 'BRONZE',
        totalVisits: 1,
        totalSpent: 0,
        lastVisitDate: new Date().toISOString().split('T')[0],
        updatedAt: new Date().toISOString()
      };
      accounts.push(acc);
      secureStorage.setItem(LOYALTY_ACCOUNTS_KEY, accounts);
    }

    return acc;
  }

  /**
   * تحديد مستوى العميل حسب مجموع النقاط المكتسبة
   */
  public calculateTier(totalPoints: number, cfg: LoyaltyConfig): LoyaltyTier {
    if (totalPoints >= cfg.tierPerks.PLATINUM.minPoints) return 'PLATINUM';
    if (totalPoints >= cfg.tierPerks.GOLD.minPoints) return 'GOLD';
    if (totalPoints >= cfg.tierPerks.SILVER.minPoints) return 'SILVER';
    return 'BRONZE';
  }

  /**
   * معالجة فاتورة مكتملة: احتساب النقاط والكاش باك تلقائياً
   */
  public processCompletedOrder(params: {
    customerPhone: string;
    customerName?: string;
    customerId?: string;
    orderId: string;
    orderTotal: number;
  }): { pointsEarned: number; cashbackEarned: number; newBalance: number; newWallet: number; tier: LoyaltyTier } {
    const cfg = this.getConfig();
    const accounts = this.getAccounts();
    const cleanPhone = params.customerPhone.trim();

    let acc = this.getAccountByPhone(cleanPhone, params.customerName, params.customerId);

    // حساب النقاط
    const pointsEarned = Math.floor((params.orderTotal / 100) * cfg.pointsPer100Currency);
    // حساب الكاش باك
    const cashbackEarned = cfg.enableWallet ? Number(((params.orderTotal * cfg.cashbackPercentage) / 100).toFixed(2)) : 0;

    acc.totalPointsEarned += pointsEarned;
    acc.currentPointsBalance += pointsEarned;
    acc.walletBalance += cashbackEarned;
    acc.totalSpent += params.orderTotal;
    acc.totalVisits += 1;
    acc.lastVisitDate = new Date().toISOString().split('T')[0];
    acc.tier = this.calculateTier(acc.totalPointsEarned, cfg);
    acc.updatedAt = new Date().toISOString();

    const idx = accounts.findIndex(a => a.customerPhone === acc.customerPhone);
    if (idx >= 0) accounts[idx] = acc;
    else accounts.push(acc);

    secureStorage.setItem(LOYALTY_ACCOUNTS_KEY, accounts);

    // تسجيل المعاملات
    this.recordTransaction({
      customerId: acc.customerId,
      orderId: params.orderId,
      type: 'POINTS_EARNED',
      amount: pointsEarned,
      description: `اكتساب ${pointsEarned} نقطة عن فاتورة #${params.orderId}`
    });

    if (cashbackEarned > 0) {
      this.recordTransaction({
        customerId: acc.customerId,
        orderId: params.orderId,
        type: 'WALLET_CASHBACK',
        amount: cashbackEarned,
        description: `كاش باك ${cashbackEarned} ج في المحفظة عن فاتورة #${params.orderId}`
      });
    }

    return {
      pointsEarned,
      cashbackEarned,
      newBalance: acc.currentPointsBalance,
      newWallet: acc.walletBalance,
      tier: acc.tier
    };
  }

  /**
   * استبدال نقاط الولاء بخصم مالي مباشر
   */
  public redeemPoints(phone: string, pointsToRedeem: number, orderId?: string): { success: boolean; discountAmount: number; remainingPoints: number; message: string } {
    const cfg = this.getConfig();
    const acc = this.getAccountByPhone(phone);

    if (pointsToRedeem < cfg.minPointsToRedeem) {
      return {
        success: false,
        discountAmount: 0,
        remainingPoints: acc.currentPointsBalance,
        message: `الحد الأدنى لاستبدال النقاط هو ${cfg.minPointsToRedeem} نقطة`
      };
    }

    if (acc.currentPointsBalance < pointsToRedeem) {
      return {
        success: false,
        discountAmount: 0,
        remainingPoints: acc.currentPointsBalance,
        message: `رصيد النقاط غير كافٍ (الرصيد المتاح: ${acc.currentPointsBalance} نقطة)`
      };
    }

    const discountAmount = Number((pointsToRedeem * cfg.pointRedemptionValue).toFixed(2));
    acc.currentPointsBalance -= pointsToRedeem;
    acc.updatedAt = new Date().toISOString();

    const accounts = this.getAccounts();
    const idx = accounts.findIndex(a => a.customerPhone === acc.customerPhone);
    if (idx >= 0) accounts[idx] = acc;
    secureStorage.setItem(LOYALTY_ACCOUNTS_KEY, accounts);

    this.recordTransaction({
      customerId: acc.customerId,
      orderId,
      type: 'POINTS_REDEEMED',
      amount: pointsToRedeem,
      description: `استبدال ${pointsToRedeem} نقطة مقابل خصم ${discountAmount} ج`
    });

    return {
      success: true,
      discountAmount,
      remainingPoints: acc.currentPointsBalance,
      message: `تم استبدال ${pointsToRedeem} نقطة بنجاح بخصم ${discountAmount} ج`
    };
  }

  /**
   * الدفع من رصيد المحفظة
   */
  public spendFromWallet(phone: string, amount: number, orderId?: string): { success: boolean; deductedAmount: number; remainingWallet: number; message: string } {
    const acc = this.getAccountByPhone(phone);

    if (acc.walletBalance < amount) {
      return {
        success: false,
        deductedAmount: 0,
        remainingWallet: acc.walletBalance,
        message: `رصيد المحفظة غير كافٍ (الرصيد المتاح: ${acc.walletBalance} ج)`
      };
    }

    acc.walletBalance = Number((acc.walletBalance - amount).toFixed(2));
    acc.updatedAt = new Date().toISOString();

    const accounts = this.getAccounts();
    const idx = accounts.findIndex(a => a.customerPhone === acc.customerPhone);
    if (idx >= 0) accounts[idx] = acc;
    secureStorage.setItem(LOYALTY_ACCOUNTS_KEY, accounts);

    this.recordTransaction({
      customerId: acc.customerId,
      orderId,
      type: 'WALLET_SPENT',
      amount,
      description: `سحب ${amount} ج من المحفظة لسداد طلب #${orderId || ''}`
    });

    return {
      success: true,
      deductedAmount: amount,
      remainingWallet: acc.walletBalance,
      message: `تم سداد ${amount} ج من المحفظة بنجاح`
    };
  }

  private recordTransaction(tx: Omit<LoyaltyTransaction, 'id' | 'createdAt'>): void {
    const txs = secureStorage.getItem<LoyaltyTransaction[]>(LOYALTY_TRANSACTIONS_KEY) || [];
    txs.unshift({
      id: `tx-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
      createdAt: new Date().toISOString(),
      ...tx
    });
    secureStorage.setItem(LOYALTY_TRANSACTIONS_KEY, txs.slice(0, 100));
  }
}

export const loyaltyService = new LoyaltyService();

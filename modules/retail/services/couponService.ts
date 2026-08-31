import { supabase } from '../../../supabaseClient';
import { secureStorage } from '../../../utils/securityMiddleware';

export interface RetailCoupon {
  id: string;
  code: string;
  name: string;
  discount_type: 'PERCENT' | 'FIXED';
  discount_value: number;
  min_order_amount?: number;
  max_discount_amount?: number;
  usage_limit?: number;
  used_count: number;
  start_date?: string | null;
  end_date?: string | null;
  is_active: boolean;
  organization_id?: string;
}

const LOCAL_COUPONS_KEY = 'tripro_retail_coupons';

export const couponService = {
  // جلب الكوبونات النشطة
  getCoupons: async (orgId?: string): Promise<RetailCoupon[]> => {
    try {
      if (orgId) {
        const { data, error } = await supabase
          .from('retail_coupons')
          .select('*')
          .eq('organization_id', orgId);
        if (!error && data) {
          secureStorage.setItem(LOCAL_COUPONS_KEY, data);
          return data as RetailCoupon[];
        }
      }
    } catch (e) {
      console.warn('Fallback to local coupons:', e);
    }
    const local = secureStorage.getItem(LOCAL_COUPONS_KEY) as RetailCoupon[];
    return local && Array.isArray(local) ? local : [
      {
        id: 'coupon-1',
        code: 'WELCOME10',
        name: 'خصم ترحيبي 10%',
        discount_type: 'PERCENT',
        discount_value: 10,
        min_order_amount: 100,
        max_discount_amount: 50,
        usage_limit: 500,
        used_count: 12,
        is_active: true
      },
      {
        id: 'coupon-2',
        code: 'SUPER50',
        name: 'خصم 50 ج.م للمشتريات فوق 500 ج.م',
        discount_type: 'FIXED',
        discount_value: 50,
        min_order_amount: 500,
        usage_limit: 100,
        used_count: 24,
        is_active: true
      }
    ];
  },

  // التحقق من صحة الكوبون وتطبيقه على إجمالي الفاتورة
  validateCoupon: (
    couponCode: string,
    subtotal: number,
    couponsList: RetailCoupon[]
  ): { valid: boolean; discountAmount: number; coupon?: RetailCoupon; message?: string } => {
    const cleanCode = couponCode.trim().toUpperCase();
    if (!cleanCode) return { valid: false, discountAmount: 0, message: 'يرجى إدخال رمز الكوبون' };

    const coupon = couponsList.find(c => c.code.toUpperCase() === cleanCode);
    if (!coupon) {
      return { valid: false, discountAmount: 0, message: 'رمز الكوبون غير صحيح أو غير موجود' };
    }

    if (!coupon.is_active) {
      return { valid: false, discountAmount: 0, message: 'هذا الكوبون متوقف حالياً' };
    }

    const today = new Date().toISOString().split('T')[0];
    if (coupon.start_date && coupon.start_date > today) {
      return { valid: false, discountAmount: 0, message: `الكوبون سيبدأ تفعيله في تاريخ ${coupon.start_date}` };
    }
    if (coupon.end_date && coupon.end_date < today) {
      return { valid: false, discountAmount: 0, message: 'انتهت فترة صلاحية هذا الكوبون' };
    }

    if (coupon.usage_limit && coupon.used_count >= coupon.usage_limit) {
      return { valid: false, discountAmount: 0, message: 'تم استنفاد الحد الأقصى لاستخدام هذا الكوبون' };
    }

    if (coupon.min_order_amount && subtotal < coupon.min_order_amount) {
      return {
        valid: false,
        discountAmount: 0,
        message: `الحد الأدنى لقيمة المشتريات لتفعيل هذا الكوبون هو ${coupon.min_order_amount} ج.م`
      };
    }

    let discountAmount = 0;
    if (coupon.discount_type === 'PERCENT') {
      discountAmount = (subtotal * coupon.discount_value) / 100;
      if (coupon.max_discount_amount && discountAmount > coupon.max_discount_amount) {
        discountAmount = coupon.max_discount_amount;
      }
    } else {
      discountAmount = Math.min(coupon.discount_value, subtotal);
    }

    return {
      valid: true,
      discountAmount: Math.round(discountAmount * 100) / 100,
      coupon,
      message: `تم تطبيق الكوبون بنجاح: خصم ${discountAmount.toFixed(2)} ج.م (${coupon.name})`
    };
  },

  // حفظ أو تحديث الكوبون
  saveCoupon: async (coupon: Partial<RetailCoupon>, orgId?: string): Promise<RetailCoupon> => {
    const newCoupon: RetailCoupon = {
      id: coupon.id || `coupon-${Date.now()}`,
      code: (coupon.code || '').trim().toUpperCase(),
      name: coupon.name || '',
      discount_type: coupon.discount_type || 'PERCENT',
      discount_value: Number(coupon.discount_value) || 0,
      min_order_amount: coupon.min_order_amount ? Number(coupon.min_order_amount) : undefined,
      max_discount_amount: coupon.max_discount_amount ? Number(coupon.max_discount_amount) : undefined,
      usage_limit: coupon.usage_limit ? Number(coupon.usage_limit) : undefined,
      used_count: Number(coupon.used_count) || 0,
      start_date: coupon.start_date || null,
      end_date: coupon.end_date || null,
      is_active: coupon.is_active !== undefined ? coupon.is_active : true,
      organization_id: orgId
    };

    try {
      if (orgId) {
        await supabase.from('retail_coupons').upsert({
          id: newCoupon.id,
          organization_id: orgId,
          code: newCoupon.code,
          name: newCoupon.name,
          discount_type: newCoupon.discount_type,
          discount_value: newCoupon.discount_value,
          min_order_amount: newCoupon.min_order_amount || null,
          max_discount_amount: newCoupon.max_discount_amount || null,
          usage_limit: newCoupon.usage_limit || null,
          used_count: newCoupon.used_count,
          start_date: newCoupon.start_date,
          end_date: newCoupon.end_date,
          is_active: newCoupon.is_active
        });
      }
    } catch (e) {
      console.warn('Saved coupon locally:', e);
    }

    const current = await couponService.getCoupons(orgId);
    const updated = current.some(c => c.id === newCoupon.id)
      ? current.map(c => c.id === newCoupon.id ? newCoupon : c)
      : [newCoupon, ...current];
    secureStorage.setItem(LOCAL_COUPONS_KEY, updated);
    return newCoupon;
  },

  // تسجيل استخدام كوبون
  recordUsage: async (couponId: string, orgId?: string) => {
    const list = await couponService.getCoupons(orgId);
    const updated = list.map(c => c.id === couponId ? { ...c, used_count: c.used_count + 1 } : c);
    secureStorage.setItem(LOCAL_COUPONS_KEY, updated);
    try {
      if (orgId) {
        await supabase.rpc('increment_coupon_usage', { p_coupon_id: couponId });
      }
    } catch (e) {}
  }
};

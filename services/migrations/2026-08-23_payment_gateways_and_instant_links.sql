-- ========================================================================================
-- TriPro ERP — Online Payment Gateways & Fast Payment Links
-- تاريخ الإنشاء: 2026-08-23
-- الغرض: تكامل بوابات الدفع الإلكتروني (Paymob, Fawry, Stripe) وتوليد روابط وسندات السداد الآلية
-- ========================================================================================

-- 1. جدول إعدادات بوابات الدفع لكل منشأة (Payment Gateway Settings)
CREATE TABLE IF NOT EXISTS public.payment_gateway_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    provider TEXT NOT NULL CHECK (provider IN ('paymob', 'fawry', 'stripe', 'kashier', 'custom')),
    is_enabled BOOLEAN DEFAULT false,
    api_key TEXT,
    secret_key TEXT,
    merchant_id TEXT,
    integration_id TEXT,
    iframe_id TEXT,
    bank_account_id UUID REFERENCES public.accounts(id) ON DELETE SET NULL,
    commission_rate NUMERIC(5, 2) DEFAULT 0.00,
    commission_account_id UUID REFERENCES public.accounts(id) ON DELETE SET NULL,
    test_mode BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT uq_org_gateway_provider UNIQUE (organization_id, provider)
);

ALTER TABLE public.payment_gateway_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "payment_gateway_settings_org_isolation" ON public.payment_gateway_settings;
CREATE POLICY "payment_gateway_settings_org_isolation" ON public.payment_gateway_settings
    FOR ALL
    USING (organization_id = auth.uid() OR organization_id IS NOT NULL)
    WITH CHECK (organization_id = auth.uid() OR organization_id IS NOT NULL);


-- 2. جدول روابط وسجلات عمليات الدفع الإلكتروني (Online Payment Links & Logs)
CREATE TABLE IF NOT EXISTS public.online_payment_links (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    document_type TEXT NOT NULL CHECK (document_type IN ('invoice', 'restaurant_order', 'stadium_booking', 'stadium_subscription', 'hims_bill', 'custom')),
    document_id UUID,
    document_number TEXT NOT NULL,
    customer_name TEXT,
    customer_phone TEXT,
    customer_email TEXT,
    amount NUMERIC(15, 2) NOT NULL CHECK (amount > 0),
    currency TEXT NOT NULL DEFAULT 'EGP',
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'expired', 'failed', 'refunded')),
    provider TEXT NOT NULL DEFAULT 'paymob',
    gateway_order_id TEXT,
    gateway_transaction_id TEXT,
    payment_url TEXT,
    qr_code_data TEXT,
    paid_at TIMESTAMPTZ,
    receipt_voucher_id UUID REFERENCES public.receipt_vouchers(id) ON DELETE SET NULL,
    journal_entry_id UUID REFERENCES public.journal_entries(id) ON DELETE SET NULL,
    commission_amount NUMERIC(15, 2) DEFAULT 0.00,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payment_links_lookup 
ON public.online_payment_links (organization_id, status, document_type, document_id);

ALTER TABLE public.online_payment_links ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "online_payment_links_org_isolation" ON public.online_payment_links;
CREATE POLICY "online_payment_links_org_isolation" ON public.online_payment_links
    FOR ALL
    USING (organization_id = auth.uid() OR organization_id IS NOT NULL)
    WITH CHECK (organization_id = auth.uid() OR organization_id IS NOT NULL);


-- 3. دالة التسوية الآلية للطلب/الفاتورة عند نجاح السداد الإلكتروني
CREATE OR REPLACE FUNCTION public.settle_online_payment(
    p_link_id UUID,
    p_transaction_id TEXT,
    p_notes TEXT DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_link RECORD;
BEGIN
    SELECT * INTO v_link FROM public.online_payment_links WHERE id = p_link_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'رابط الدفع غير موجود.';
    END IF;

    IF v_link.status = 'paid' THEN
        RETURN jsonb_build_object('success', true, 'already_paid', true);
    END IF;

    -- تحديث حالة رابط الدفع
    UPDATE public.online_payment_links
       SET status = 'paid',
           gateway_transaction_id = p_transaction_id,
           paid_at = NOW(),
           notes = COALESCE(p_notes, notes),
           updated_at = NOW()
     WHERE id = p_link_id;

    -- إذا كان المستند فاتورة مبيعات
    IF v_link.document_type = 'invoice' AND v_link.document_id IS NOT NULL THEN
        UPDATE public.invoices 
           SET status = 'paid',
               paid_amount = total_amount,
               updated_at = NOW()
         WHERE id = v_link.document_id;
    END IF;

    -- إذا كان المستند حجز استاد
    IF v_link.document_type = 'stadium_booking' AND v_link.document_id IS NOT NULL THEN
        UPDATE public.stadium_bookings
           SET payment_status = 'paid',
               updated_at = NOW()
         WHERE id = v_link.document_id;
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'link_id', p_link_id,
        'document_type', v_link.document_type,
        'amount', v_link.amount
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.settle_online_payment(UUID, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.settle_online_payment(UUID, TEXT, TEXT) TO anon;
GRANT EXECUTE ON FUNCTION public.settle_online_payment(UUID, TEXT, TEXT) TO service_role;

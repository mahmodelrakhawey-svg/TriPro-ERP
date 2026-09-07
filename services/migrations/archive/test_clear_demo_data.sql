-- 🧪 سكربت اختبار والتحقق من تنظيف البيانات (Test Clear Demo Data)
-- هذا السكربت يعرض عدد السجلات قبل وبعد التنظيف للتأكد من أن العملية تمت بنجاح.

DO $$
DECLARE
    v_invoice_count INTEGER;
    v_product_count INTEGER;
    v_customer_count INTEGER;
    v_account_count INTEGER;
BEGIN
    -- 1. عرض الحالة الحالية
    SELECT COUNT(*) INTO v_invoice_count FROM public.invoices;
    SELECT COUNT(*) INTO v_product_count FROM public.products;
    SELECT COUNT(*) INTO v_customer_count FROM public.customers;
    SELECT COUNT(*) INTO v_account_count FROM public.accounts;

    RAISE NOTICE '📊 الحالة الحالية (قبل التنظيف إذا لم يتم بعد):';
    RAISE NOTICE '- الفواتير: %', v_invoice_count;
    RAISE NOTICE '- المنتجات: %', v_product_count;
    RAISE NOTICE '- العملاء: %', v_customer_count;
    RAISE NOTICE '- الحسابات (يجب أن تبقى): %', v_account_count;

    -- 2. التحقق من النتيجة المتوقعة
    -- إذا كانت الفواتير والمنتجات 0 والحسابات > 0، فالنظام نظيف
    IF v_invoice_count = 0 AND v_product_count = 0 AND v_customer_count = 0 AND v_account_count > 0 THEN
        RAISE NOTICE '✅ النظام نظيف تماماً وجاهز للعمل (Clean State).';
    ELSE
        RAISE NOTICE '⚠️ النظام يحتوي على بيانات. لتنظيفه، اضغط على زر "حذف البيانات التجريبية" في الإعدادات أو شغل دالة clear_demo_data().';
    END IF;
END $$;
```

### ثانياً: إضافة تأكيد الأمان في صفحة الإعدادات
لزيادة الأمان، سنطلب من المستخدم كتابة كلمة "حذف" لتأكيد العملية.

إليك التعديل في ملف `f:\TriPro-ERP\components\Settings.tsx`:

```diff
  };

  const handleClearDemoData = async () => {
      if (!window.confirm('⚠️ تحذير هام جداً: سيتم حذف جميع البيانات التشغيلية (فواتير، منتجات، عملاء)!\n\nسيتم الاحتفاظ فقط بالإعدادات ودليل الحسابات.\n\nهل أنت متأكد من رغبتك في تنظيف النظام للبدء الفعلي؟')) return;
      
      const confirmation = window.prompt('للتأكيد النهائي، يرجى كتابة كلمة "حذف" في المربع أدناه:');
      if (confirmation !== 'حذف') {
          alert('تم إلغاء العملية.');
          return;
      }

      setLoading(true);
      try {
          const { error } = await supabase.rpc('clear_demo_data');

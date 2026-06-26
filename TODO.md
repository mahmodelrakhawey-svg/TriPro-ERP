# TODO - TriPro-ERP (HospitalBillingEngine fix)

- [x] تعديل استعلام تفاصيل الفاتورة في `modules/hims/components/HospitalBillingEngine.tsx` من `hims_billing_details` إلى `hims_billing_items` لتفادي 404.
- [ ] تعديل منطق رسالة “يرجى ضبط الخزينة الافتراضية…” بحيث لا يتم عرضها عند وجود الفاتورة، بل يتم التحقق فعليًا من أن `settings.defaultTreasuryId` موجود/صحيح.
- [ ] إضافة تشخيص واضح داخل `postToGL` لعرض قيمة `settings.defaultTreasuryId` وbill.id قبل RPC.
- [ ] التأكد من أن إعدادات المنشأة ترجع نفس الحقل اسمًا/قيمة لـ `settings.defaultTreasuryId` (قد يكون اسمه مختلف مثل `default_treasury_id`).


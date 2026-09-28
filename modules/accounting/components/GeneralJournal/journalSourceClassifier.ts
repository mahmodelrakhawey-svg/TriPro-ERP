/**
 * TriPro ERP — محرك تصنيف مصدر قيود اليومية
 * يقوم بتحديد مصدر القيد ولونه بناءً على بادئة المرجع ونص البيان
 */

export interface EntrySourceInfo {
  label: string;
  color: string;
}

export const getEntrySource = (reference: string = '', description: string = ''): EntrySourceInfo => {
  if (!reference && !description) return { label: 'قيد يدوي', color: 'bg-slate-200 text-slate-600' };
  const ref = (reference || '').toUpperCase().trim();
  const desc = (description || '').trim();

  // 1. فواتير ومرتجعات وإشعارات المبيعات
  if (ref.startsWith('INV-') || ref.startsWith('REC-INV-') || ref.startsWith('POS-') || ref.startsWith('SI-') || desc.includes('فاتورة مبيعات')) {
    return { label: 'فاتورة مبيعات', color: 'bg-blue-100 text-blue-700' };
  }
  if (ref.startsWith('SR-') || ref.startsWith('SRET-') || desc.includes('مرتجع مبيعات')) {
    return { label: 'مرتجع مبيعات', color: 'bg-blue-50 text-blue-600' };
  }
  if (ref.startsWith('CN-') || desc.includes('إشعار دائن')) {
    return { label: 'إشعار دائن', color: 'bg-cyan-100 text-cyan-800' };
  }
  if (ref.startsWith('REB-') || desc.includes('بونص') || desc.includes('إيجار رف')) {
    return { label: 'بونص وإيجار أرفف', color: 'bg-amber-100 text-amber-800' };
  }

  // 2. فواتير ومرتجعات وإشعارات المشتريات
  if (ref.startsWith('PUR-') || ref.startsWith('PINV-') || ref.startsWith('PI-')) {
    return { label: 'فاتورة مشتريات', color: 'bg-purple-100 text-purple-700' };
  }
  if (ref.startsWith('PR-') || ref.startsWith('PRET-')) {
    return { label: 'مرتجع مشتريات', color: 'bg-purple-50 text-purple-600' };
  }
  if (ref.startsWith('DN-') || desc.includes('إشعار مدين')) {
    return { label: 'إشعار مدين', color: 'bg-rose-100 text-rose-800' };
  }

  // 3. سندات القبض والصرف
  if (ref.startsWith('RCT-') || ref.startsWith('RV-')) {
    return { label: 'سند قبض', color: 'bg-emerald-100 text-emerald-700' };
  }
  if (ref.startsWith('PAY-') || ref.startsWith('PV-') || ref.startsWith('EXP-')) {
    return { label: 'سند صرف', color: 'bg-orange-100 text-orange-700' };
  }

  // 4. الشيكات والأوراق المالية
  if (ref.startsWith('CHQ-') || desc.includes('شيك وارد') || desc.includes('شيك صادر')) {
    return { label: 'شيك', color: 'bg-indigo-50 text-indigo-600' };
  }

  // 5. التحويلات النقدية والبنكية
  if (ref.startsWith('TRN-') || ref.startsWith('TRF-')) {
    return { label: 'تحويل', color: 'bg-indigo-100 text-indigo-700' };
  }

  // 6. تسويات بنكية
  if (ref.startsWith('BANK-ADJ-') || ref.startsWith('BNK-') || ref.startsWith('BADJ-')) {
    return { label: 'تسوية بنكية', color: 'bg-sky-100 text-sky-700' };
  }

  // 7. تسويات عجز وفروقات الصندوق
  if (ref.startsWith('CASH-ADJ-') || ref.startsWith('CSH-ADJ-') || ref.startsWith('CADJ-')) {
    return { label: 'تسوية فروقات صندوق', color: 'bg-amber-100 text-amber-800' };
  }

  // 8. تسويات بادئة ADJ عامة - يتم الفحص والتمييز الذكي بناءً على نص البيان
  if (ref.startsWith('ADJ-')) {
    if (desc.includes('صندوق') || desc.includes('خزينة') || desc.includes('إقفال يومي') || desc.includes('عجز') || desc.includes('زيادة في الصندوق') || desc.includes('فروقات صندوق')) {
      return { label: 'تسوية فروقات صندوق', color: 'bg-amber-100 text-amber-800' };
    }
    if (desc.includes('عمولات') || desc.includes('فوائد') || desc.includes('بنك') || desc.includes('مصروفات بنكية') || desc.includes('تسوية بنك')) {
      return { label: 'تسوية بنكية', color: 'bg-sky-100 text-sky-700' };
    }
    return { label: 'تسوية مخزنية', color: 'bg-red-100 text-red-700' };
  }
  if (ref.startsWith('STK-') || ref.startsWith('REV-') || desc.includes('تسوية مخزنية') || desc.includes('جرد مخزني')) {
    return { label: 'تسوية مخزنية', color: 'bg-red-100 text-red-700' };
  }

  // 9. الأصول الثابتة والإهلاك
  if (ref.startsWith('DEP-')) return { label: 'إهلاك/تأمين', color: 'bg-amber-100 text-amber-700' };
  if (ref.startsWith('ASSET-') || desc.includes('أصل ثابت')) return { label: 'أصل ثابت', color: 'bg-cyan-100 text-cyan-700' };

  // 10. الرواتب والإغلاقات والأنظمة الفرعية
  if (ref.startsWith('PAYROLL-') || desc.includes('رواتب')) return { label: 'رواتب', color: 'bg-pink-100 text-pink-700' };
  if (ref.startsWith('SHIFT-')) return { label: 'إغلاق وردية', color: 'bg-indigo-100 text-indigo-700' };
  if (ref.startsWith('PHARM-')) return { label: 'صرف صيدلية', color: 'bg-teal-100 text-teal-700' };
  if (ref.startsWith('HIMS-')) return { label: 'فاتورة طبية', color: 'bg-rose-100 text-rose-700' };
  if (ref.startsWith('CLOSE-')) return { label: 'إقفال سنة', color: 'bg-gray-800 text-white' };

  // 11. الأرصدة الافتتاحية
  if (ref.startsWith('OP-') || ref.startsWith('OB-') || ref.startsWith('OPENING-') || desc.includes('رصيد افتتاحي')) {
    return { label: 'رصيد افتتاحي', color: 'bg-slate-100 text-slate-700' };
  }
  if (ref.startsWith('MAN-')) {
    if (desc.includes('افتتاحي') || desc.includes('رصيد افتتاحي')) {
      return { label: 'رصيد افتتاحي', color: 'bg-slate-100 text-slate-700' };
    }
    return { label: 'قيد يدوي', color: 'bg-slate-200 text-slate-600' };
  }

  return { label: 'قيد يدوي', color: 'bg-slate-200 text-slate-600' };
};

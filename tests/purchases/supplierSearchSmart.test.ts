import { describe, it, expect } from 'vitest';
import { matchSupplierSmart } from '../../components/SupplierFilterCombobox';
import { normalizeArabic } from '../../components/SupplierSearchSelect';

describe('⚡ Smart Supplier Search & Normalization (البحث الذكي بالمورد)', () => {
  const mockSuppliers = [
    {
      id: 'sup-1',
      name: 'شركة الأمل للتوريدات والتجارة',
      phone: '01012345678',
      code: 'SUP-001',
      tax_number: '123-456-789'
    },
    {
      id: 'sup-2',
      name: 'مؤسسة النور الهندسية الحديثة',
      phone: '01198765432',
      code: 'SUP-002',
      tax_number: '987-654-321'
    },
    {
      id: 'sup-3',
      name: 'علي عبد الرحمن للتوزيع',
      phone: '01234567890',
      code: 'SUP-003',
      tax_number: '555-666-777'
    }
  ];

  it('يطابق اسم المورد مع تجاهل الهمزات (الأمل مقابل الامل)', () => {
    // المستخدم كتب "الامل" بدون همزة والمورد مسجل "الأمل"
    const matchWithoutHamza = matchSupplierSmart(mockSuppliers[0], 'الامل');
    expect(matchWithoutHamza).toBe(true);

    const matchWithHamza = matchSupplierSmart(mockSuppliers[0], 'الأمل');
    expect(matchWithHamza).toBe(true);
  });

  it('يطابق التاء المربوطة والهاء (شركه مقابل شركة)', () => {
    const matchHaa = matchSupplierSmart(mockSuppliers[0], 'شركه');
    expect(matchHaa).toBe(true);

    const matchTaa = matchSupplierSmart(mockSuppliers[0], 'شركة');
    expect(matchTaa).toBe(true);
  });

  it('يطابق الياء والألف المقصورة (علي مقابل على)', () => {
    const matchYaa = matchSupplierSmart(mockSuppliers[2], 'علي');
    expect(matchYaa).toBe(true);

    const matchAlifMaqsura = matchSupplierSmart(mockSuppliers[2], 'على');
    expect(matchAlifMaqsura).toBe(true);
  });

  it('يطابق البحث برقم الهاتف', () => {
    const matchPhone = matchSupplierSmart(mockSuppliers[1], '011987');
    expect(matchPhone).toBe(true);

    const matchNonExistingPhone = matchSupplierSmart(mockSuppliers[1], '015999');
    expect(matchNonExistingPhone).toBe(false);
  });

  it('يطابق البحث بكود المورد والرقم الضريبي', () => {
    const matchCode = matchSupplierSmart(mockSuppliers[0], 'SUP-001');
    expect(matchCode).toBe(true);

    const matchTax = matchSupplierSmart(mockSuppliers[1], '987-654');
    expect(matchTax).toBe(true);
  });

  it('يطابق الكلمات المتعددة بأي ترتيب (مثال: الهندسية النور)', () => {
    const matchMultiTokens = matchSupplierSmart(mockSuppliers[1], 'الهندسية النور');
    expect(matchMultiTokens).toBe(true);
  });

  it('يتجاهل التشكيل والتطويل الحركي (التنوين والفتحة والكسرة)', () => {
    const textWithTashkeel = 'شَرِكَةُ الأَمَلِ';
    expect(normalizeArabic(textWithTashkeel)).toBe(normalizeArabic('شركة الامل'));
  });
});

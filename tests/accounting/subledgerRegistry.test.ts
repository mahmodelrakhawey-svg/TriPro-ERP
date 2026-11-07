import { describe, it, expect, vi } from 'vitest';
import { SubledgerRegistry, SubledgerProvider } from '../../services/subledgerRegistry';

describe('📑 SubledgerRegistry (مجمع مزودي الأستاذ المساعد للموديولات التخصصية)', () => {
  it('يجب التحقق من حالة تفعيل الموديول isModuleActive بدقة وفق allowed_modules', () => {
    // 1. إذا لم يتم تمرير مصفوفة الموديولات المسموحة، يعتبر مفعلاً افتراضياً
    expect(SubledgerRegistry.isModuleActive('construction')).toBe(true);
    expect(SubledgerRegistry.isModuleActive('hims', [])).toBe(true);

    // 2. إذا كانت مصفوفة الموديولات المسموحة تحتوي الموديول بالتحديد
    expect(SubledgerRegistry.isModuleActive('construction', ['accounting', 'construction'])).toBe(true);

    // 3. إذا كانت باقة المنظمة Premium أو All
    expect(SubledgerRegistry.isModuleActive('hims', ['premium'])).toBe(true);
    expect(SubledgerRegistry.isModuleActive('stadium', ['all'])).toBe(true);

    // 4. إذا لم يكن الموديول ضمن الباقة
    expect(SubledgerRegistry.isModuleActive('stadium', ['accounting', 'retail'])).toBe(false);
  });

  it('يجب أن يحتوي المجمع تلقائياً على المزودين الأساسيين (construction, hims, stadium)', () => {
    const providers = SubledgerRegistry.getProviders();
    const moduleKeys = providers.map(p => p.moduleKey);

    expect(moduleKeys).toContain('construction');
    expect(moduleKeys).toContain('hims');
    expect(moduleKeys).toContain('stadium');
  });

  it('يجب أن يسجل مزوداً مخصصاً جديداً بنجاح في المجمع', () => {
    const customProvider: SubledgerProvider = {
      moduleKey: 'custom_realestate',
      getCustomerDocs: async () => [
        {
          docId: 're-doc-1',
          amount: 50000,
          sourceModule: 'custom_realestate',
          description: 'دفعة حجز وحدة عقارية'
        }
      ]
    };

    SubledgerRegistry.register(customProvider);
    const providers = SubledgerRegistry.getProviders();
    expect(providers.find(p => p.moduleKey === 'custom_realestate')).toBeDefined();
  });

  it('يجب جلب مستندات العملاء fetchCustomerDocs وتصفيتها وفق allowedModules', async () => {
    const testProviderA: SubledgerProvider = {
      moduleKey: 'mod_alpha',
      getCustomerDocs: async () => [
        { docId: 'doc-a', amount: 1000, sourceModule: 'mod_alpha' }
      ]
    };

    const testProviderB: SubledgerProvider = {
      moduleKey: 'mod_beta',
      getCustomerDocs: async () => [
        { docId: 'doc-b', amount: 2000, sourceModule: 'mod_beta' }
      ]
    };

    SubledgerRegistry.register(testProviderA);
    SubledgerRegistry.register(testProviderB);

    // استعلام مع السماح بموديول mod_alpha فقط
    const filteredDocs = await SubledgerRegistry.fetchCustomerDocs('org-123', ['mod_alpha']);
    const alphaDoc = filteredDocs.find(d => d.docId === 'doc-a');
    const betaDoc = filteredDocs.find(d => d.docId === 'doc-b');

    expect(alphaDoc).toBeDefined();
    expect(betaDoc).toBeUndefined();
  });

  it('يجب ألا ينهار fetchCustomerDocs إذا ألقى أحد المزودين خطأ استثنائياً (Resilience & Fault Tolerance)', async () => {
    const failingProvider: SubledgerProvider = {
      moduleKey: 'failing_mod',
      getCustomerDocs: async () => {
        throw new Error('Database connection timeout in module');
      }
    };

    const healthyProvider: SubledgerProvider = {
      moduleKey: 'healthy_mod',
      getCustomerDocs: async () => [
        { docId: 'healthy-doc', amount: 300, sourceModule: 'healthy_mod' }
      ]
    };

    SubledgerRegistry.register(failingProvider);
    SubledgerRegistry.register(healthyProvider);

    const docs = await SubledgerRegistry.fetchCustomerDocs('org-123', ['failing_mod', 'healthy_mod']);
    expect(docs.some(d => d.docId === 'healthy-doc')).toBe(true);
  });

  it('يجب إلغاء تكرار معرفات القيود في fetchStatementCustomerEntryIds', async () => {
    const p1: SubledgerProvider = {
      moduleKey: 'sub1',
      getStatementCustomerEntryIds: async () => ['entry-101', 'entry-102']
    };
    const p2: SubledgerProvider = {
      moduleKey: 'sub2',
      getStatementCustomerEntryIds: async () => ['entry-102', 'entry-103'] // entry-102 مكرر
    };

    SubledgerRegistry.register(p1);
    SubledgerRegistry.register(p2);

    const entryIds = await SubledgerRegistry.fetchStatementCustomerEntryIds(
      'org-1',
      'cust-44',
      'شركة النور',
      ['sub1', 'sub2']
    );

    expect(entryIds).toHaveLength(3);
    expect(entryIds).toContain('entry-101');
    expect(entryIds).toContain('entry-102');
    expect(entryIds).toContain('entry-103');
  });

  it('يجب أن يعيد مصفوفة فارغة إذا كان customerId غير محدد', async () => {
    const ids = await SubledgerRegistry.fetchStatementCustomerEntryIds('org-1', undefined, 'أي اسم');
    expect(ids).toEqual([]);
  });
});

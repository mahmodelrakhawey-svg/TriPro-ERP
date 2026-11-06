import { describe, it, expect, vi } from 'vitest';
import { 
  checkAccountMappingsHealth, 
  autoResolveMissingMappings,
  CORE_ACCOUNT_MAPPING_DEFS 
} from '../../services/accountService';
import { supabase } from '../../supabaseClient';

describe('Account Mappings Health Check & Auto-Resolution (فحص واكتمال الربط المحاسبي)', () => {
  it('يحتوي الدليل الأساسي على كافة الحسابات السيادية الـ 14 الإلزامية', () => {
    expect(CORE_ACCOUNT_MAPPING_DEFS.length).toBe(14);
    const keys = CORE_ACCOUNT_MAPPING_DEFS.map(d => d.key);
    expect(keys).toContain('ACCOUNTS_RECEIVABLE');
    expect(keys).toContain('ACCOUNTS_PAYABLE');
    expect(keys).toContain('INVENTORY');
    expect(keys).toContain('SALARIES_EXPENSE');
    expect(keys).toContain('EMPLOYEE_ADVANCES');
    expect(keys).toContain('ACCRUED_SALARIES');
    expect(keys).toContain('RETAINED_EARNINGS');
  });

  it('checkAccountMappingsHealth يعيد تقريراً دقيقاً بنسبة الاكتمال وحالة كل مفتاح', async () => {
    const mockOrgId = '11111111-1111-1111-1111-111111111111';

    // محاكاة إعدادات الشركة مع تعيين 3 حسابات فقط
    vi.spyOn(supabase, 'from').mockImplementation(((table: string) => {
      if (table === 'company_settings') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: {
                  account_mappings: {
                    ACCOUNTS_RECEIVABLE: 'acc-ar-1',
                    ACCOUNTS_PAYABLE: 'acc-ap-1',
                    INVENTORY: 'acc-inv-1'
                  }
                },
                error: null
              })
            })
          })
        } as any;
      }
      if (table === 'accounts') {
        return {
          select: () => ({
            eq: async () => ({
              data: [
                { id: 'acc-ar-1', code: '1241', name: 'العملاء' },
                { id: 'acc-ap-1', code: '2211', name: 'الموردون' },
                { id: 'acc-inv-1', code: '1030', name: 'المخزون' }
              ],
              error: null
            })
          })
        } as any;
      }
      return {} as any;
    }) as any);

    const report = await checkAccountMappingsHealth(mockOrgId);

    expect(report).toBeDefined();
    expect(report.total).toBe(14);
    expect(report.validCount).toBe(3);
    expect(report.missingCount).toBe(11);
    expect(report.isFullyConfigured).toBe(false);
    expect(report.score).toBe(Math.round((3 / 14) * 100));

    const arItem = report.items.find(i => i.key === 'ACCOUNTS_RECEIVABLE');
    expect(arItem?.status).toBe('valid');
    expect(arItem?.accountCode).toBe('1241');

    const salaryItem = report.items.find(i => i.key === 'SALARIES_EXPENSE');
    expect(salaryItem?.status).toBe('missing');
  });

  it('autoResolveMissingMappings يكتشف الحسابات بالكود الافتراضي ويحدث الخريطة', async () => {
    const mockOrgId = '22222222-2222-2222-2222-222222222222';

    const existingAccounts = [
      { id: 'acc-sal-531', code: '531', name: 'مصروف الرواتب والأجور', type: 'EXPENSE', is_group: false },
      { id: 'acc-adv-1223', code: '1223', name: 'سلف العاملين', type: 'ASSET', is_group: false }
    ];

    let updatedMappings: Record<string, string> = {};

    vi.spyOn(supabase, 'from').mockImplementation(((table: string) => {
      if (table === 'company_settings') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: { id: 'settings-1', account_mappings: {} },
                error: null
              })
            })
          }),
          update: (payload: any) => ({
            eq: async () => {
              updatedMappings = payload.account_mappings;
              return { data: null, error: null };
            }
          })
        } as any;
      }
      if (table === 'accounts') {
        return {
          select: () => ({
            eq: async () => ({
              data: existingAccounts,
              error: null
            })
          }),
          insert: (acc: any) => ({
            select: () => ({
              single: async () => {
                const newAcc = { id: 'created-' + acc.code, ...acc };
                return { data: newAcc, error: null };
              }
            })
          })
        } as any;
      }
      return {} as any;
    }) as any);

    const result = await autoResolveMissingMappings(mockOrgId);

    expect(result.resolvedCount).toBeGreaterThan(0);
    expect(updatedMappings['SALARIES_EXPENSE']).toBe('acc-sal-531');
    expect(updatedMappings['EMPLOYEE_ADVANCES']).toBe('acc-adv-1223');
  });
});

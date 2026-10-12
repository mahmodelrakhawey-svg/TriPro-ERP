/**
 * ==============================================================================
 * TriPro ERP — Human Resources & Payroll Domain Context & Hook
 * context/domains/HrContext.tsx
 * ==============================================================================
 * مخصص لإدارة الموظفين، مسير الرواتب، قيود الاستحقاق والصرف، وسلف الموظفين.
 * يدعم الاستخدام المباشر عبر HrProvider أو عبر واجهة AccountingContext الموحدة بنمط Facade.
 * مزود بالحماية الكاملة لعزل بيانات المنظمات (Multi-Tenancy)، سجل التدقيق (Audit Log)،
 * وعزل نطاق الإشراف الإداري (HR Supervisory Scope).
 * ==============================================================================
 */

import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { Employee } from '../../types';
import type { UserProfile } from '../AccountingContext';
import { useAccounting } from '../AccountingContext';
import { supabase } from '../../supabaseClient';
import { logger } from '../../utils/logger';

export interface HrDomainState {
  employees: Employee[];
  addEmployee: (employee: Partial<Employee>) => Promise<void>;
  updateEmployee: (id: string, updates: Partial<Employee>) => Promise<void>;
  deleteEmployee: (id: string, reason?: string) => Promise<void>;
  runPayroll: (month: number, year: number, date: string, treasuryId: string, data: any[], orgId?: string) => Promise<void>;
  runPayrollAccrual: (month: number, year: number, date: string, data: any[], orgId?: string) => Promise<any>;
  payAccruedPayroll: (params: { payrollId?: string; month?: number; year?: number; paymentDate: string; treasuryId: string; orgId?: string }) => Promise<any>;
  cancelPayrollAccrual: (payrollId: string, orgId?: string) => Promise<void>;
  refreshEmployees?: () => Promise<void>;
}

export const HrContext = createContext<HrDomainState | null>(null);

export interface HrProviderProps {
  children: React.ReactNode;
  orgId?: string | null;
  currentUser?: UserProfile | null;
  logActivity?: (action: string, details: string) => void;
  showToast?: (message: string, type?: 'success' | 'error' | 'info' | 'warning') => void;
  isDemo?: boolean;
  initialEmployees?: Employee[];
}

const EMPTY_EMPLOYEES: Employee[] = [];

export const HrProvider: React.FC<HrProviderProps> = ({
  children,
  orgId,
  currentUser = null,
  logActivity,
  showToast,
  isDemo = false,
  initialEmployees = EMPTY_EMPLOYEES,
}) => {
  const [rawEmployees, setRawEmployees] = useState<Employee[]>(initialEmployees);
  const targetOrgId = orgId || currentUser?.organization_id;

  // مزامنة الموظفين الأولية
  useEffect(() => {
    if (initialEmployees.length > 0) {
      setRawEmployees(initialEmployees);
    }
  }, [initialEmployees]);

  const isFactoryDept = useCallback((dept: unknown) => {
    const d = String(dept || '').trim().toLowerCase();
    return d === 'المصنع' || d === 'مصنع' || d === 'factory';
  }, []);

  // 🛡️ عزل نطاق الإشراف للموارد البشرية والرواتب (HR Supervisory Scope)
  const scopedEmployees = useMemo(() => {
    const userHrScope = (currentUser as any)?.hr_scope || (currentUser as any)?.user_metadata?.hr_scope || 'all';
    if (userHrScope === 'factory') {
      return rawEmployees.filter(e => isFactoryDept(e.department));
    } else if (userHrScope === 'company') {
      return rawEmployees.filter(e => !isFactoryDept(e.department));
    }
    return rawEmployees;
  }, [rawEmployees, currentUser, isFactoryDept]);

  const fetchEmployees = useCallback(async () => {
    const effectiveOrg = targetOrgId;
    if (!effectiveOrg || effectiveOrg === 'org-default-offline') return;
    try {
      const { data, error } = await supabase
        .from('employees')
        .select('*')
        .eq('organization_id', effectiveOrg)
        .order('full_name');

      if (error) {
        logger.error('Error fetching employees in HrProvider:', error);
      } else if (data) {
        setRawEmployees(data as Employee[]);
      }
    } catch (e) {
      logger.error('Unexpected error fetching employees:', e);
    }
  }, [targetOrgId]);

  useEffect(() => {
    if (targetOrgId && targetOrgId !== 'org-default-offline') {
      fetchEmployees();
    }
  }, [targetOrgId, fetchEmployees]);

  const sanitizeEmployeePayload = useCallback((raw: Record<string, any>) => {
    const payload: Record<string, any> = { ...raw };

    const toNullableNum = (v: unknown) => {
      if (v === '' || v === null || v === undefined) return null;
      const n = Number(v);
      return Number.isFinite(n) ? n : null;
    };

    const toNullableDate = (v: unknown) => {
      if (!v || v === '' || v === null) return null;
      return v;
    };

    if ('basic_salary' in payload) payload.basic_salary = toNullableNum(payload.basic_salary);
    if ('insurance_salary' in payload) payload.insurance_salary = toNullableNum(payload.insurance_salary);
    if ('hourly_rate' in payload) payload.hourly_rate = toNullableNum(payload.hourly_rate);
    if ('fixed_allowances' in payload) payload.fixed_allowances = toNullableNum(payload.fixed_allowances);
    if ('housing_allowance' in payload) payload.housing_allowance = toNullableNum(payload.housing_allowance);
    if ('transportation_allowance' in payload) payload.transportation_allowance = toNullableNum(payload.transportation_allowance);
    if ('other_allowances' in payload) payload.other_allowances = toNullableNum(payload.other_allowances);
    if ('hire_date' in payload) payload.hire_date = toNullableDate(payload.hire_date);
    if ('birth_date' in payload) payload.birth_date = toNullableDate(payload.birth_date);
    if ('contract_end_date' in payload) payload.contract_end_date = toNullableDate(payload.contract_end_date);

    if (raw.status === 'active') {
      payload.deleted_at = null;
    } else if (raw.deleted_at !== undefined) {
      payload.deleted_at = raw.deleted_at;
    }

    return payload;
  }, []);

  const addEmployee = useCallback(async (data: Partial<Employee>): Promise<void> => {
    const effectiveOrg = targetOrgId;
    const payload = sanitizeEmployeePayload({ ...data, organization_id: effectiveOrg });
    const { error } = await supabase.from('employees').insert(payload);
    if (error) {
      showToast?.('فشل إضافة الموظف: ' + error.message, 'error');
      logger.error('Failed to add employee:', error);
      throw error;
    }
    showToast?.('تمت إضافة الموظف بنجاح ✅', 'success');
    logActivity?.('إضافة موظف', `موظف: ${data.full_name || ''}`);
    await fetchEmployees();
  }, [targetOrgId, sanitizeEmployeePayload, logActivity, showToast, fetchEmployees]);

  const updateEmployee = useCallback(async (id: string, data: Partial<Employee>): Promise<void> => {
    const effectiveOrg = targetOrgId;
    const payload = sanitizeEmployeePayload(data);
    let query = supabase.from('employees').update(payload).eq('id', id);
    if (effectiveOrg && effectiveOrg !== 'org-default-offline') {
      query = query.eq('organization_id', effectiveOrg);
    }
    const { error } = await query;
    if (error) {
      showToast?.('فشل تعديل بيانات الموظف: ' + error.message, 'error');
      logger.error('Failed to update employee:', error);
      throw error;
    }
    showToast?.('تم تعديل بيانات الموظف بنجاح ✅', 'success');
    logActivity?.('تعديل موظف', `موظف: ${id}`);
    await fetchEmployees();
  }, [targetOrgId, sanitizeEmployeePayload, logActivity, showToast, fetchEmployees]);

  const deleteEmployee = useCallback(async (id: string, reason?: string): Promise<void> => {
    const effectiveOrg = targetOrgId;
    let query = supabase.from('employees').update({
      status: 'terminated',
      notes: reason || null,
      deleted_at: new Date().toISOString()
    }).eq('id', id);

    if (effectiveOrg && effectiveOrg !== 'org-default-offline') {
      query = query.eq('organization_id', effectiveOrg);
    }

    const { error } = await query;
    if (error) {
      showToast?.('فشل إنهاء خدمة الموظف: ' + error.message, 'error');
      logger.error('Failed to delete employee:', error);
      throw error;
    }
    showToast?.('تم إنهاء خدمة الموظف بنجاح', 'info');
    logActivity?.('إنهاء خدمة موظف', `السبب: ${reason || 'غير محدد'}`);
    await fetchEmployees();
  }, [targetOrgId, logActivity, showToast, fetchEmployees]);

  const runPayroll = useCallback(async (month: number, year: number, date: string, treasuryId: string, data: any[], orgIdParam?: string): Promise<void> => {
    const effectiveOrg = orgIdParam || targetOrgId || null;
    const { error } = await supabase.rpc('run_payroll_rpc', {
      p_month: month,
      p_year: year,
      p_date: date,
      p_treasury_acc: treasuryId,
      p_items: data,
      p_org_id: effectiveOrg
    });

    if (error) {
      showToast?.('فشل تنفيذ مسير الرواتب: ' + error.message, 'error');
      logger.error('Payroll RPC Error:', error);
      throw new Error(error.message || 'حدث خطأ أثناء تنفيذ مسير الرواتب');
    }

    showToast?.('تم صرف الرواتب وترحيل القيود المحاسبية بنجاح ✅', 'success');
    logActivity?.('تنفيذ مسير الرواتب', `شهر: ${month}/${year}`);
    await fetchEmployees();
  }, [targetOrgId, logActivity, showToast, fetchEmployees]);

  const runPayrollAccrual = useCallback(async (month: number, year: number, date: string, data: any[], orgIdParam?: string): Promise<any> => {
    const effectiveOrg = orgIdParam || targetOrgId || null;
    const { data: resData, error } = await supabase.rpc('run_payroll_accrual_rpc', {
      p_month: month,
      p_year: year,
      p_date: date,
      p_items: data,
      p_org_id: effectiveOrg
    });

    if (error) {
      showToast?.('فشل إنشاء قيد استحقاق الرواتب: ' + error.message, 'error');
      logger.error('Payroll Accrual RPC Error:', error);
      throw new Error(error.message || 'حدث خطأ أثناء تنفيذ قيد استحقاق الرواتب');
    }

    showToast?.('تم إنشاء وترحيل قيد استحقاق الرواتب بنجاح ✅', 'success');
    logActivity?.('استحقاق الرواتب', `شهر: ${month}/${year}`);
    await fetchEmployees();
    return resData;
  }, [targetOrgId, logActivity, showToast, fetchEmployees]);

  const payAccruedPayroll = useCallback(async (params: { payrollId?: string; month?: number; year?: number; paymentDate: string; treasuryId: string; orgId?: string }): Promise<any> => {
    const effectiveOrg = params.orgId || targetOrgId || null;
    const { data: resData, error } = await supabase.rpc('pay_accrued_payroll_rpc', {
      p_payroll_id: params.payrollId || null,
      p_month: params.month || null,
      p_year: params.year || null,
      p_payment_date: params.paymentDate,
      p_treasury_acc: params.treasuryId,
      p_org_id: effectiveOrg
    });

    if (error) {
      showToast?.('فشل صرف الرواتب المستحقة: ' + error.message, 'error');
      logger.error('Pay Accrued Payroll RPC Error:', error);
      throw new Error(error.message || 'حدث خطأ أثناء صرف الرواتب وترحيل قيد النقدية');
    }

    showToast?.('تم صرف الرواتب المستحقة وتسوية القيود بنجاح ✅', 'success');
    logActivity?.('سداد رواتب مستحقة', `سداد مسير رقم: ${params.payrollId || ''}`);
    await fetchEmployees();
    return resData;
  }, [targetOrgId, logActivity, showToast, fetchEmployees]);

  const cancelPayrollAccrual = useCallback(async (payrollId: string, orgIdParam?: string): Promise<void> => {
    const effectiveOrg = orgIdParam || targetOrgId || null;
    try {
      const { error: rpcError } = await supabase.rpc('cancel_payroll_accrual_rpc', {
        p_payroll_id: payrollId,
        p_org_id: effectiveOrg
      });

      if (rpcError) {
        logger.warn('cancel_payroll_accrual_rpc notice, applying direct rollback:', rpcError);

        const { data: items } = await supabase.from('payroll_items').select('id').eq('payroll_id', payrollId);
        const itemIds = (items || []).map((i: { id: string }) => i.id);

        if (itemIds.length > 0) {
          await supabase
            .from('employee_advances')
            .update({ status: 'paid', payroll_item_id: null })
            .in('payroll_item_id', itemIds);
        }

        const { data: pData } = await supabase.from('payrolls').select('*').eq('id', payrollId).maybeSingle();
        if (pData) {
          if (pData.accrual_je_id) {
            await supabase.from('journal_lines').delete().eq('journal_entry_id', pData.accrual_je_id);
            await supabase.from('journal_entries').delete().eq('id', pData.accrual_je_id);
          }
          const { data: relJes } = await supabase
            .from('journal_entries')
            .select('id')
            .eq('related_document_id', payrollId)
            .eq('related_document_type', 'payroll');
          if (relJes && relJes.length > 0) {
            const jeIds = relJes.map((j: { id: string }) => j.id);
            await supabase.from('journal_lines').delete().in('journal_entry_id', jeIds);
            await supabase.from('journal_entries').delete().in('id', jeIds);
          }
          await supabase.from('payrolls').delete().eq('id', payrollId);
        }

        if (effectiveOrg && effectiveOrg !== 'org-default-offline') {
          try {
            await supabase.rpc('recalculate_all_system_balances', { p_org_id: effectiveOrg });
          } catch (e) {
            // ignore
          }
        }
      }

      showToast?.('تم إلغاء قيد استحقاق الرواتب والتراجع عن القيود بنجاح', 'info');
      logActivity?.('إلغاء استحقاق رواتب', `مسير: ${payrollId}`);
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      showToast?.('فشل إلغاء قيد الاستحقاق: ' + errMsg, 'error');
      logger.error('Error cancelling payroll accrual:', err);
      throw new Error(errMsg || 'فشل إلغاء قيد الاستحقاق');
    }

    await fetchEmployees();
  }, [targetOrgId, logActivity, showToast, fetchEmployees]);

  return (
    <HrContext.Provider
      value={{
        employees: scopedEmployees,
        addEmployee,
        updateEmployee,
        deleteEmployee,
        runPayroll,
        runPayrollAccrual,
        payAccruedPayroll,
        cancelPayrollAccrual,
        refreshEmployees: fetchEmployees,
      }}
    >
      {children}
    </HrContext.Provider>
  );
};

export const useHrDomain = (): HrDomainState => {
  let context: HrDomainState | null = null;
  try {
    context = useContext(HrContext);
  } catch {
    // If called outside React component tree (e.g. unit tests), fallback to useAccounting
  }
  if (context) return context;

  // Fallback to unified AccountingContext
  const acc = useAccounting() as unknown as Record<string, unknown>;
  return {
    employees: (acc.employees as Employee[]) || [],
    addEmployee: acc.addEmployee as (employee: Partial<Employee>) => Promise<void>,
    updateEmployee: acc.updateEmployee as (id: string, updates: Partial<Employee>) => Promise<void>,
    deleteEmployee: acc.deleteEmployee as (id: string, reason?: string) => Promise<void>,
    runPayroll: acc.runPayroll as (month: number, year: number, date: string, treasuryId: string, data: any[], orgId?: string) => Promise<void>,
    runPayrollAccrual: acc.runPayrollAccrual as (month: number, year: number, date: string, data: any[], orgId?: string) => Promise<any>,
    payAccruedPayroll: acc.payAccruedPayroll as (params: { payrollId?: string; month?: number; year?: number; paymentDate: string; treasuryId: string; orgId?: string }) => Promise<any>,
    cancelPayrollAccrual: acc.cancelPayrollAccrual as (payrollId: string, orgId?: string) => Promise<void>,
    refreshEmployees: acc.refreshData as () => Promise<void>,
  };
};

export default useHrDomain;
